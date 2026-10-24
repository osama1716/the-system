// Payments: the checkout the app opens, and Paddle's notifications turned into
// subscriptions/{uid}.
//
// Paddle sells the subscription (merchant of record) and tells this file what
// happened to it. What each notification means is decided in
// functions/paddle.js; this file checks the signature, makes sure each
// notification is handled once, and keeps:
//   paddleCheckouts/{transactionId} — checkouts this server started, and for
//     whom: the only thing that ties a payment to an account (server only);
//   paddleCustomers/{uid} — the Paddle customer an account pays as (server only);
//   paddleSubs/{subscriptionId} — the latest word on one subscription, and
//     whose it is (server only);
//   subscriptions/{uid} — what the account may do, read by functions/access.js
//     and by the app (its owner only);
//   paddleEvents/{eventId} — the notifications already handled (server only).
"use strict";

const admin = require("firebase-admin");
const PADDLE = require("../paddle.js");
const { HttpsError, PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET, onCall, onRequest, takeDailyAllowance } = require("../server/base");
const { cancelSubscriptionNow, customerFor, paddleApi, usingSandbox } = require("../server/billing");

// The checkout, started here so that the account it pays for is the one
// asking: signed in, through the app (App Check), as the Paddle customer of
// its own verified email. The device opens Paddle's checkout on the
// transaction this returns.
exports.startCheckout = onCall({ secrets: [PADDLE_API_KEY] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const plan = request.data && request.data.plan;
  if (!PADDLE.PLANS.includes(plan)) throw new HttpsError("invalid-argument", "plan", { code: "plan" });
  const token = request.auth.token || {};
  if (typeof token.email !== "string" || token.email_verified !== true) {
    throw new HttpsError("failed-precondition", "Verify your email first.", { code: "email-unverified" });
  }
  const priceId = PADDLE.priceFor(plan, usingSandbox());
  if (!priceId) throw new HttpsError("failed-precondition", "Payments are not open yet.", { code: "payments-not-ready" });

  const uid = request.auth.uid;
  const db = admin.firestore();
  const current = await db.collection("subscriptions").doc(uid).get();
  if (current.exists && PADDLE.isPaid(current.data(), Date.now())) {
    throw new HttpsError("failed-precondition", "Already subscribed.", { code: "already-subscribed" });
  }
  await takeDailyAllowance(db, uid, "checkouts", 20, "checkout-limit");
  const customerId = await customerFor(db, uid, token.email);
  const txn = await paddleApi("POST", "/transactions", {
    items: [{ price_id: priceId, quantity: 1 }], customer_id: customerId, custom_data: { uid },
  });
  await db.collection("paddleCheckouts").doc(txn.id).set({ uid, plan, at: admin.firestore.FieldValue.serverTimestamp() });
  console.log("[paddle] " + uid.slice(0, 6) + " started a " + plan + " checkout " + txn.id);
  return { transactionId: txn.id };
});

// What the account shows: the best of all its subscriptions
// (PADDLE.bestAccountDoc), read and written together so two notifications at
// once cannot leave the older answer. Not for an account deleted since: there
// is nothing to show it on, and nothing to bring back.
async function showOnAccount(db, uid) {
  if (!PADDLE.isUid(uid)) return;
  try {
    await admin.auth().getUser(uid);
  } catch (err) {
    if (err && err.code === "auth/user-not-found") return;
    throw err;
  }
  const ref = db.collection("subscriptions").doc(uid);
  const doc = await db.runTransaction(async (tx) => {
    const subs = await tx.get(db.collection("paddleSubs").where("uid", "==", uid));
    const best = PADDLE.bestAccountDoc(subs.docs.map((d) => d.data()), Date.now());
    if (best) tx.set(ref, { ...best, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return best;
  });
  if (doc) {
    console.log("[paddle] " + uid.slice(0, 6) + " " + doc.status + " " + (doc.plan || "?") +
      (doc.active ? " until " + new Date(doc.until).toISOString() : " locked") + " (" + doc.subscriptionId + ")");
  }
}

async function onSubscription(db, sub, at) {
  if (!sub || typeof sub.id !== "string") return;
  const ref = db.collection("paddleSubs").doc(sub.id);
  const rec = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = PADDLE.nextSubRecord(snap.exists ? snap.data() : null, sub, at);
    if (next) tx.set(ref, next);
    return next;
  });
  if (!rec) console.log("[paddle] an older notification about " + sub.id + " was ignored");
  else if (rec.uid) await showOnAccount(db, rec.uid);
  else console.log("[paddle] " + sub.id + " belongs to no checkout started here (yet)");
}

// A paid checkout: if this server started it, the subscription it made is
// that account's. Renewals and checkouts opened any other way tie nothing.
async function onTransaction(db, txn) {
  if (!txn || typeof txn.id !== "string" || typeof txn.subscription_id !== "string") return;
  const started = await db.collection("paddleCheckouts").doc(txn.id).get();
  const uid = started.exists ? started.data().uid : null;
  if (!PADDLE.isUid(uid)) {
    if (txn.origin === "web") console.warn("[paddle] " + txn.id + " was not a checkout this server started; tied to nobody");
    return;
  }
  const ref = db.collection("paddleSubs").doc(txn.subscription_id);
  const linked = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data().uid) return false;
    tx.set(ref, { ...(snap.exists ? snap.data() : { id: txn.subscription_id, status: "", eventAt: 0 }), uid });
    return true;
  });
  if (linked) await showOnAccount(db, uid);
}

// A refund or chargeback: locked now, and cancelled so it never renews.
async function onAdjustment(db, adj, at) {
  if (!PADDLE.locksAccount(adj)) return;
  const ref = db.collection("paddleSubs").doc(adj.subscription_id);
  const rec = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data().refundedAt) return null;
    const next = { ...(snap.exists ? snap.data() : { id: adj.subscription_id, uid: null, status: "", eventAt: 0 }), refundedAt: at };
    tx.set(ref, next);
    return next;
  });
  if (!rec) return;
  console.log("[paddle] " + adj.action + " on " + adj.subscription_id + ": locked");
  if (rec.uid) await showOnAccount(db, rec.uid);
  if (rec.status !== "canceled") {
    await cancelSubscriptionNow(adj.subscription_id)
      .catch((err) => console.error("[paddle] could not cancel " + adj.subscription_id + " after a " + adj.action, err && err.message));
  }
}

async function handleEvent(db, event) {
  const type = String(event.event_type || "");
  const at = Date.parse(event.occurred_at) || Date.now();
  if (type.startsWith("subscription.")) return onSubscription(db, event.data, at);
  if (type === "transaction.completed") return onTransaction(db, event.data);
  if (type === "adjustment.created" || type === "adjustment.updated") return onAdjustment(db, event.data, at);
  console.log("[paddle] " + type + " is not used");
}

exports.paddleWebhook = onRequest({ secrets: [PADDLE_WEBHOOK_SECRET, PADDLE_API_KEY], maxInstances: 5 }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).send("POST only"); return; }
  const signed = PADDLE.verifySignature(req.get("Paddle-Signature"), req.rawBody,
    PADDLE_WEBHOOK_SECRET.value(), Math.floor(Date.now() / 1000));
  if (!signed) {
    console.warn("[paddle] refused a notification without a valid signature");
    res.status(401).send("bad signature");
    return;
  }
  let event;
  try {
    event = JSON.parse(Buffer.from(req.rawBody).toString("utf8"));
  } catch (e) {
    res.status(400).send("bad body");
    return;
  }
  if (!event || typeof event.event_id !== "string" || !event.event_id) { res.status(400).send("no event id"); return; }

  // Paddle sends a notification again until it hears 200; each is handled once.
  const db = admin.firestore();
  const seen = db.collection("paddleEvents").doc(event.event_id);
  try {
    await seen.create({ type: String(event.event_type || ""), at: admin.firestore.FieldValue.serverTimestamp() });
  } catch (err) {
    if (err && (err.code === 6 || err.code === "already-exists")) { res.status(200).send("already handled"); return; }
    throw err;
  }
  try {
    await handleEvent(db, event);
    res.status(200).send("ok");
  } catch (err) {
    // Not marked handled, so Paddle's next try runs it again.
    console.error("[paddle] " + event.event_type + " " + event.event_id + " failed", err && err.message);
    await seen.delete().catch(() => {});
    res.status(500).send("try again");
  }
});

// Calls to Paddle's API, for what more than one area does with a
// subscription: payments (starting a checkout; a refund cancels) and accounts
// (deleting an account cancels).
"use strict";

const admin = require("firebase-admin");
const { PADDLE_API_KEY } = require("./base");

// A Sandbox key talks to the Sandbox. Keys made since 2025 say which they are
// (pdl_sdbx_… / pdl_live_…); an older key is taken by the project it is on.
function isSandboxKey(key) {
  return /^pdl_sdbx_/.test(key) || (!/^pdl_live_/.test(key) && /staging/.test(process.env.GCLOUD_PROJECT || ""));
}
function apiBase(key) {
  return isSandboxKey(key) ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
}
function usingSandbox() { return isSandboxKey(String(PADDLE_API_KEY.value() || "")); }

async function paddleApi(method, path, body) {
  const key = String(PADDLE_API_KEY.value() || "");
  if (key.length < 20) throw new Error("paddle: no API key set");
  const res = await fetch(apiBase(key) + path, {
    method,
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error("paddle " + method + " " + path.split("?")[0] + ": " + res.status + " " + ((json.error && json.error.code) || ""));
    err.status = res.status;
    throw err;
  }
  return json.data;
}

// Ends it now rather than at the end of the period: nothing more is charged.
function cancelSubscriptionNow(subscriptionId) {
  return paddleApi("POST", "/subscriptions/" + encodeURIComponent(subscriptionId) + "/cancel", { effective_from: "immediately" });
}

// The Paddle customer this account pays as: found once by the account's own
// verified email, or made, and then kept in paddleCustomers/{uid} (server
// only). The customer portal is only ever opened for this one — never for one
// a buyer could have named by typing somebody else's email into a checkout.
async function customerFor(db, uid, email) {
  const ref = db.collection("paddleCustomers").doc(uid);
  const snap = await ref.get();
  if (snap.exists && typeof snap.data().customerId === "string") return snap.data().customerId;
  const found = await paddleApi("GET", "/customers?email=" + encodeURIComponent(email));
  const id = Array.isArray(found) && found[0] && found[0].id
    ? found[0].id
    : (await paddleApi("POST", "/customers", { email })).id;
  await ref.set({ customerId: id, at: admin.firestore.FieldValue.serverTimestamp() });
  return id;
}

// Every paid subscription ends with its account, so nothing is charged after
// it (decided 2026-10-23) — all of them, for the one who bought twice. If
// Paddle cannot be reached the deletion still goes ahead — a person asking to
// be erased is not kept waiting on a card — and the subscription is left in
// billingOrphans for the admin to cancel by hand.
async function endAccountSubscription(db, uid) {
  const snap = await db.collection("paddleSubs").where("uid", "==", uid).get();
  const live = snap.docs.map((d) => d.data()).filter((r) => r && typeof r.id === "string" && r.status !== "canceled" && !r.refundedAt);
  const out = { cancelled: 0, orphaned: 0 };
  for (const r of live) {
    try {
      await cancelSubscriptionNow(r.id);
      out.cancelled++;
      console.log("[delete-account] " + uid.slice(0, 6) + " cancelled " + r.id);
    } catch (err) {
      out.orphaned++;
      console.error("[delete-account] could not cancel " + r.id, err && err.message);
      await db.collection("billingOrphans").doc(r.id).set({
        at: admin.firestore.FieldValue.serverTimestamp(), error: String((err && err.message) || "").slice(0, 200),
      });
    }
  }
  return out;
}

module.exports = { apiBase, usingSandbox, paddleApi, cancelSubscriptionNow, customerFor, endAccountSubscription };

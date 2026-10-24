// Payments (functions/paddle.js, functions/api/payments.js, functions/server/billing.js):
//   node tests/test-paddle.js
//
// The rules agreed 2026-10-23 — a paid period runs to its end, a failed
// renewal has seven days' grace, a refund or chargeback locks at once and
// cancels, deleting an account cancels everything it pays for — and what keeps
// them honest: a checkout counts for an account only if the server started it
// for that account (a stranger naming somebody's uid in Paddle's customData
// ties nothing to them), an account shows the best of its subscriptions, a bad
// signature changes nothing, each notification is handled once, and a failure
// is left for Paddle to send again.
"use strict";
const path = require("path");
const crypto = require("crypto");
const Module = require("module");

const REPO = path.join(__dirname, "..");
const P = require(path.join(REPO, "functions", "paddle.js"));
const ACCESS = require(path.join(REPO, "functions", "access.js"));

let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };

const SECRET = "pdl_ntfset_test_secret_0123456789";
const sign = (body, ts, secret = SECRET) => "ts=" + ts + ";h1=" + crypto.createHmac("sha256", secret).update(ts + ":" + body).digest("hex");
const nowS = () => Math.floor(Date.now() / 1000);
const DAY = P.DAY_MS;
const iso = (t) => new Date(t).toISOString();
const sub = (over) => ({
  id: "sub_1", status: "active", customer_id: "ctm_1", custom_data: null,
  billing_cycle: { interval: "month", frequency: 1 },
  items: [{ price: { id: "pri_month", billing_cycle: { interval: "month", frequency: 1 } } }],
  current_billing_period: { starts_at: iso(Date.UTC(2026, 10, 1)), ends_at: iso(Date.UTC(2026, 11, 1)) },
  next_billed_at: iso(Date.UTC(2026, 11, 1)), scheduled_change: null, ...over,
});

console.log("");
console.log("the signature");
{
  const body = JSON.stringify({ event_id: "evt_1", event_type: "subscription.created" });
  const ts = nowS();
  check("a notification Paddle signed is taken", P.verifySignature(sign(body, ts), Buffer.from(body), SECRET, ts));
  check("one byte changed is refused", !P.verifySignature(sign(body, ts), Buffer.from(body.replace("1", "2")), SECRET, ts));
  check("signed with another secret is refused", !P.verifySignature(sign(body, ts, "another_secret_entirely_xx"), body, SECRET, ts));
  check("an old one is refused", !P.verifySignature(sign(body, ts - 3600), body, SECRET, ts));
  check("while a secret rotates, either signature will do",
    P.verifySignature("ts=" + ts + ";h1=" + "0".repeat(64) + ";" + sign(body, ts).split(";")[1], body, SECRET, ts));
  check("no header, no secret or a broken one is refused",
    !P.verifySignature("", body, SECRET, ts) && !P.verifySignature(sign(body, ts), body, "", ts) && !P.verifySignature("ts=abc;h1=zz", body, SECRET, ts));
  check("Paddle's microsecond times are read", P.nextSubRecord(null, sub(), Date.parse("2026-11-01T10:18:49.621022Z")).eventAt === Date.UTC(2026, 10, 1, 10, 18, 49, 621));
}

console.log("");
console.log("what a subscription means for its account");
{
  const end = Date.UTC(2026, 11, 1);
  const r1 = { ...P.nextSubRecord(null, sub(), 1000), uid: "u1aaaaaaaaaa" };
  const e1 = P.entitlement(r1);
  check("paid: open to the end of the period, and a day past it for the renewal to arrive", e1.active && e1.until === end + DAY, JSON.stringify(e1));
  check("monthly and annual told apart", r1.plan === "monthly" &&
    P.nextSubRecord(null, sub({ billing_cycle: { interval: "year", frequency: 1 } }), 1).plan === "annual");
  check("a notification older than the one kept changes nothing", P.nextSubRecord({ ...r1, eventAt: 5000 }, sub({ status: "canceled" }), 4000) === null);
  check("whose it is never comes from the notification's customData",
    P.nextSubRecord(null, sub({ custom_data: { uid: "strangeraaaa" } }), 1).uid === null &&
    P.nextSubRecord(r1, sub({ custom_data: { uid: "strangeraaaa" } }), 2000).uid === "u1aaaaaaaaaa");

  const due1 = P.nextSubRecord(r1, sub({ status: "past_due" }), 10 * DAY);
  const due2 = P.nextSubRecord(due1, sub({ status: "past_due" }), 12 * DAY);
  check("a failed renewal: seven days from the first failure, not the latest retry",
    P.entitlement(due2).active && P.entitlement(due2).until === 10 * DAY + 7 * DAY, JSON.stringify(P.entitlement(due2)));
  const paid = P.nextSubRecord(due2, sub({ status: "active" }), 13 * DAY);
  check("paid after all: the grace is forgotten", paid.pastDueSince === null && P.entitlement(paid).until === end + DAY);

  const leaving = P.nextSubRecord(r1, sub({ scheduled_change: { action: "cancel", effective_at: iso(end) }, next_billed_at: null }), 2000);
  check("cancelled: open to the end of what was paid for, with nothing to renew",
    P.entitlement(leaving).active && P.entitlement(leaving).until === end && leaving.renewsAt === null && leaving.cancelAt === end);
  const gone = P.nextSubRecord(leaving, sub({ status: "canceled", current_billing_period: null }), end);
  check("once it has ended, locked", !P.entitlement(gone).active);
  check("paused counts as not paid", !P.entitlement(P.nextSubRecord(r1, sub({ status: "paused" }), 3000)).active);

  const refunded = { ...r1, refundedAt: 3000 };
  check("refunded: locked at once", !P.entitlement(refunded).active && P.accountDoc(refunded).status === "refunded");
  check("and a later notification does not open it again", !P.entitlement(P.nextSubRecord(refunded, sub({ status: "active" }), 4000)).active);

  const doc = P.accountDoc(r1);
  check("access.js reads it as a subscriber while it lasts, and not after",
    ACCESS.standing({ now: end - DAY, createdAt: 0, isAdmin: false, subscription: doc }) === "subscriber" &&
    ACCESS.standing({ now: end + 2 * DAY, createdAt: 0, isAdmin: false, subscription: doc }) === "none");
  check("the account's copy carries no Paddle customer id", !("customerId" in doc));
}

console.log("");
console.log("more than one subscription on an account");
{
  const now = Date.UTC(2026, 10, 15);
  const rec = (id, over, at) => ({ ...P.nextSubRecord(null, sub({ id, ...over }), at), uid: "u1aaaaaaaaaa" });
  const a = rec("sub_a", {}, 1);
  const refundedB = { ...rec("sub_b", {}, 2), refundedAt: 3 };
  const endedC = rec("sub_c", { status: "canceled", current_billing_period: null }, 4);
  check("a refund of one does not lock the one still paid for", P.bestAccountDoc([a, refundedB], now).subscriptionId === "sub_a");
  check("nor does a late word that an old one ended", P.bestAccountDoc([endedC, a], now).active === true);
  const longer = rec("sub_y", { billing_cycle: { interval: "year", frequency: 1 }, current_billing_period: { starts_at: iso(now), ends_at: iso(now + 365 * DAY) } }, 5);
  check("of two paid, the one that runs longest", P.bestAccountDoc([a, longer], now).subscriptionId === "sub_y");
  check("with none paid, the one heard from last", P.bestAccountDoc([refundedB, endedC], now).subscriptionId === "sub_c");
  check("a subscription only linked so far shows nothing", P.bestAccountDoc([{ id: "sub_z", uid: "u1aaaaaaaaaa", status: "", eventAt: 0 }], now) === null);
}

console.log("");
console.log("refunds and chargebacks");
{
  const a = (over) => ({ action: "refund", status: "approved", subscription_id: "sub_1", type: "full", ...over });
  check("an approved full refund locks", P.locksAccount(a()));
  check("one still waiting for approval does not", !P.locksAccount(a({ status: "pending_approval" })));
  check("a partial refund does not", !P.locksAccount(a({ type: "partial" })));
  check("a chargeback does", P.locksAccount(a({ action: "chargeback", type: undefined })));
  check("a credit, or one with no subscription, does not", !P.locksAccount(a({ action: "credit" })) && !P.locksAccount(a({ subscription_id: null })));
}

// ---------------------------------------------------------------------------
// The functions themselves, with Firestore, Auth and Paddle's API in memory.
const store = new Map();
const deletedUsers = new Set(["goneaaaaaaaa"]);
let authBroken = false;
const calls = [];
const docRef = (p) => ({
  path: p,
  get: async () => ({ exists: store.has(p), data: () => store.get(p) }),
  set: async (d) => { store.set(p, JSON.parse(JSON.stringify(d))); },
  create: async (d) => { if (store.has(p)) { const e = new Error("exists"); e.code = 6; throw e; } store.set(p, d); },
  delete: async () => { store.delete(p); },
});
const where = (c, field, value) => ({
  get: async () => ({
    docs: [...store.entries()]
      .filter(([p, d]) => p.split("/").length === 2 && p.startsWith(c + "/") && d && d[field] === value)
      .map(([p, d]) => ({ id: p.split("/")[1], data: () => d, ref: docRef(p) })),
  }),
});
const db = {
  collection: (c) => ({ doc: (id) => docRef(c + "/" + id), where: (f, op, v) => where(c, f, v) }),
  runTransaction: async (fn) => fn({ get: (r) => r.get(), set: (r, d) => r.set(d) }),
};
const stubs = {
  "firebase-admin": {
    initializeApp() {},
    firestore: Object.assign(() => db, { FieldValue: { serverTimestamp: () => "now" } }),
    auth: () => ({ getUser: async (uid) => {
      if (authBroken) throw new Error("auth is down");
      if (deletedUsers.has(uid)) { const e = new Error("no user"); e.code = "auth/user-not-found"; throw e; }
      return { uid };
    } }),
  },
  "firebase-functions/v2/https": {
    onCall: (...a) => a[a.length - 1], onRequest: (opts, fn) => fn,
    HttpsError: class extends Error { constructor(c, m, d) { super(m); this.code = c; this.details = d; } },
  },
  "firebase-functions/v2": { setGlobalOptions() {} },
  "firebase-functions/params": { defineSecret: (name) => ({ value: () => (name === "PADDLE_WEBHOOK_SECRET" ? SECRET : name === "PADDLE_API_KEY" ? "pdl_sdbx_apikey_0123456789abcdef" : "") }) },
};
const load = Module._load;
Module._load = function (request) { return stubs[request] || load.apply(this, arguments); };
let txnN = 0;
const paddleFetch = async (url, opts) => {
  calls.push({ url, method: opts.method, body: opts.body });
  const p = url.replace(/^https:\/\/[^/]+/, "");
  let data = {};
  if (opts.method === "GET" && p.startsWith("/customers?")) data = [];
  else if (opts.method === "POST" && p === "/customers") data = { id: "ctm_" + JSON.parse(opts.body).email.split("@")[0] };
  else if (opts.method === "POST" && p === "/transactions") data = { id: "txn_" + (++txnN) };
  return { ok: true, json: async () => ({ data }) };
};
global.fetch = paddleFetch;
const PAY = require(path.join(REPO, "functions", "api", "payments.js"));
const B = require(path.join(REPO, "functions", "server", "billing.js"));

async function deliver(event, opts = {}) {
  const body = JSON.stringify(event);
  const res = { code: 0, status(c) { this.code = c; return this; }, send() { return this; } };
  const headers = { "paddle-signature": opts.signature || sign(body, nowS()) };
  await PAY.paddleWebhook({ method: "POST", rawBody: Buffer.from(body), get: (h) => headers[h.toLowerCase()] }, res);
  return res.code;
}
const ev = (id, type, data, at) => ({ event_id: id, event_type: type, occurred_at: iso(at || Date.now()), data });
const asker = (uid, over) => ({ auth: { uid, token: { email: uid.slice(0, 2) + "@example.com", email_verified: true, ...over } }, data: { plan: "monthly" } });
const refusal = (p) => p.then(() => null, (e) => (e && e.details && e.details.code) || (e && e.code) || String(e));

(async () => {
  const future = Date.now() + 20 * DAY;
  const live = (over) => sub({ current_billing_period: { starts_at: iso(Date.now()), ends_at: iso(future) }, next_billed_at: iso(future), ...over });
  const U1 = "u1aaaaaaaaaa", U2 = "u2bbbbbbbbbb";

  console.log("");
  console.log("starting a checkout");
  check("not before the prices exist in Paddle", await refusal(PAY.startCheckout(asker(U1))) === "payments-not-ready");
  P.PRICE_IDS.sandbox.monthly = "pri_" + "m".repeat(26);
  P.PRICE_IDS.sandbox.annual = "pri_" + "y".repeat(26);
  check("not signed out", await refusal(PAY.startCheckout({ data: { plan: "monthly" } })) === "unauthenticated");
  check("not with an email nobody has proved", await refusal(PAY.startCheckout(asker(U1, { email_verified: false }))) === "email-unverified");
  check("not for a plan that does not exist", await refusal(PAY.startCheckout({ ...asker(U1), data: { plan: "lifetime" } })) === "plan");
  calls.length = 0;
  const c1 = await PAY.startCheckout(asker(U1));
  const made = calls.find((c) => c.method === "POST" && /\/transactions$/.test(c.url));
  check("started for the one asking, as the customer of their own email",
    c1 && store.get("paddleCheckouts/" + c1.transactionId).uid === U1 && store.get("paddleCustomers/" + U1).customerId === "ctm_u1" &&
    made && JSON.parse(made.body).customer_id === "ctm_u1" && JSON.parse(made.body).items[0].price_id === P.PRICE_IDS.sandbox.monthly,
    JSON.stringify(calls));
  calls.length = 0;
  await PAY.startCheckout(asker(U1));
  check("the customer is found once and then kept", !calls.some((c) => /\/customers/.test(c.url)));

  console.log("");
  console.log("the webhook");
  check("an unsigned notification is refused and writes nothing",
    await deliver(ev("evt_forged", "subscription.created", live()), { signature: "ts=" + nowS() + ";h1=" + "a".repeat(64) }) === 401 && !store.has("paddleSubs/sub_1"));

  check("a subscription arriving before its payment is kept, tied to nobody yet",
    await deliver(ev("evt_1", "subscription.created", live())) === 200 && store.get("paddleSubs/sub_1").uid === null && !store.has("subscriptions/" + U1));
  await deliver(ev("evt_2", "transaction.completed", { id: c1.transactionId, origin: "web", subscription_id: "sub_1", customer_id: "ctm_u1" }));
  const s1 = store.get("subscriptions/" + U1);
  check("its payment, from a checkout started here, makes it that account's: paid, monthly, to the end of the period",
    s1 && s1.active && s1.plan === "monthly" && s1.until === future + DAY && s1.provider === "paddle", JSON.stringify(s1));
  check("and a second checkout for an account already paid for is refused", await refusal(PAY.startCheckout(asker(U1))) === "already-subscribed");

  store.set("subscriptions/" + U1, { ...s1, marker: 1 });
  check("the same notification again is answered but not handled twice",
    await deliver(ev("evt_1", "subscription.created", live())) === 200 && store.get("subscriptions/" + U1).marker === 1);

  // U2 pays the other way round: the payment's notification first.
  const c2 = await PAY.startCheckout(asker(U2));
  await deliver(ev("evt_3", "transaction.completed", { id: c2.transactionId, origin: "web", subscription_id: "sub_2" }));
  await deliver(ev("evt_4", "subscription.created", live({ id: "sub_2" })));
  check("in either order", (store.get("subscriptions/" + U2) || {}).active === true, JSON.stringify(store.get("subscriptions/" + U2)));

  console.log("");
  console.log("a stranger cannot reach somebody else's account");
  const before = JSON.stringify(store.get("subscriptions/" + U2));
  await deliver(ev("evt_5", "transaction.completed", { id: "txn_evil", origin: "web", subscription_id: "sub_evil", custom_data: { uid: U2 } }));
  await deliver(ev("evt_6", "subscription.created", live({ id: "sub_evil", custom_data: { uid: U2 } })));
  check("a checkout this server did not start ties its subscription to nobody", store.get("paddleSubs/sub_evil").uid === null);
  calls.length = 0;
  await deliver(ev("evt_7", "adjustment.updated", { id: "adj_evil", action: "refund", status: "approved", type: "full", subscription_id: "sub_evil" }));
  check("so its refund locks nobody", JSON.stringify(store.get("subscriptions/" + U2)) === before && store.get("subscriptions/" + U2).active === true);

  console.log("");
  console.log("one account, two subscriptions");
  store.set("paddleCheckouts/txn_u1b", { uid: U1, plan: "monthly" });
  await deliver(ev("evt_8", "transaction.completed", { id: "txn_u1b", origin: "web", subscription_id: "sub_1b" }));
  await deliver(ev("evt_9", "subscription.created", live({ id: "sub_1b" })));
  calls.length = 0;
  await deliver(ev("evt_10", "adjustment.updated", { id: "adj_1b", action: "refund", status: "approved", type: "full", subscription_id: "sub_1b" }));
  check("refunding the second leaves the account open on the first",
    store.get("subscriptions/" + U1).active === true && store.get("subscriptions/" + U1).subscriptionId === "sub_1", JSON.stringify(store.get("subscriptions/" + U1)));
  check("and the refunded one is cancelled at Paddle's Sandbox, now",
    calls.length === 1 && calls[0].url === "https://sandbox-api.paddle.com/subscriptions/sub_1b/cancel" && JSON.parse(calls[0].body).effective_from === "immediately",
    JSON.stringify(calls));

  await deliver(ev("evt_11", "subscription.past_due", live({ status: "past_due" })));
  const due = store.get("subscriptions/" + U1);
  check("a failed renewal leaves it open, for seven days", due.active && due.status === "past_due" && due.until - Date.now() > 6.9 * DAY && due.until - Date.now() <= 7 * DAY + 60000, JSON.stringify(due));
  await deliver(ev("evt_12", "adjustment.updated", { id: "adj_1", action: "refund", status: "approved", type: "full", subscription_id: "sub_1" }));
  const locked = store.get("subscriptions/" + U1);
  check("refunding the first too: locked", locked.active === false && locked.status === "refunded", JSON.stringify(locked));

  store.set("paddleCheckouts/txn_gone", { uid: "goneaaaaaaaa", plan: "monthly" });
  await deliver(ev("evt_13", "transaction.completed", { id: "txn_gone", origin: "web", subscription_id: "sub_9" }));
  await deliver(ev("evt_14", "subscription.created", live({ id: "sub_9" })));
  check("an account deleted since is not brought back", !store.has("subscriptions/goneaaaaaaaa"));

  authBroken = true;
  const code = await deliver(ev("evt_15", "subscription.updated", live({ id: "sub_2" })));
  authBroken = false;
  check("a failure answers 500 and is not marked handled, so Paddle sends it again", code === 500 && !store.has("paddleEvents/evt_15"));
  check("and the next try goes through", await deliver(ev("evt_15", "subscription.updated", live({ id: "sub_2" }))) === 200 && store.has("paddleEvents/evt_15"));

  console.log("");
  console.log("deleting an account ends every subscription it pays for");
  {
    const U3 = "u3cccccccccc";
    store.set("paddleSubs/sub_3a", { id: "sub_3a", uid: U3, status: "active" });
    store.set("paddleSubs/sub_3b", { id: "sub_3b", uid: U3, status: "past_due" });
    store.set("paddleSubs/sub_3c", { id: "sub_3c", uid: U3, status: "canceled" });
    store.set("paddleSubs/sub_3d", { id: "sub_3d", uid: U3, status: "active", refundedAt: 5 });
    calls.length = 0;
    const r = await B.endAccountSubscription(db, U3);
    const cancelled = calls.map((c) => (c.url.match(/subscriptions\/(sub_\w+)\/cancel$/) || [])[1]).filter(Boolean).sort();
    check("both still running are cancelled at Paddle, now", r.cancelled === 2 && JSON.stringify(cancelled) === JSON.stringify(["sub_3a", "sub_3b"]), JSON.stringify(cancelled));
    calls.length = 0;
    check("an account that never paid costs no call", (await B.endAccountSubscription(db, "nobodyaaaaaa")).cancelled === 0 && !calls.length);
    global.fetch = async () => ({ ok: false, status: 503, json: async () => ({ error: { code: "unavailable" } }) });
    const quiet = console.error;
    console.error = () => {};
    const r2 = await B.endAccountSubscription(db, U3);
    console.error = quiet;
    global.fetch = paddleFetch;
    check("Paddle down: the deletion goes on, and each is left for the admin", r2.orphaned === 2 && store.has("billingOrphans/sub_3a") && store.has("billingOrphans/sub_3b"));
  }

  console.log("");
  console.log(fails ? fails + " FAIL" : "all passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log("FAIL  " + (e && e.stack || e)); process.exit(1); });

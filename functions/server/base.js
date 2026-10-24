// What every function file shares: the callable wrapper that demands App
// Check, the secrets, the Admin SDK (initialised once, here, before any file
// uses it), and the checks of who is asking.
//
// Every file in api/ takes onCall from here and never from firebase-functions
// itself, so no callable can be made without App Check
// (tests/test-journal-trust.js counts them).
"use strict";

const { onCall: onCallRaw, onRequest, HttpsError } = require("firebase-functions/v2/https");

// Every callable refuses a call that has no valid App Check token: only the
// real app, on the real site, gets one (reCAPTCHA Enterprise, see
// js/appcheck-config.js). Enforced 2026-10-02, after a call from the live
// site was seen to arrive verified and a bare script call unverified. To test
// from localhost, register the debug token the app prints in the console
// under Firebase -> App Check -> Manage debug tokens.
const onCall = (opts, handler) => typeof opts === "function"
  ? onCallRaw({ enforceAppCheck: true }, opts)
  : onCallRaw({ enforceAppCheck: true, ...opts }, handler);
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params");

const admin = require("firebase-admin");
const ACCESS = require("../access.js");
const PROFILE = require("../profile.js");

// Stored with `firebase functions:secrets:set ANTHROPIC_API_KEY` — never in
// the repo. This is a public GitHub Pages project; a key committed here would
// be scraped within minutes.
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

// Web Push, not Firebase Cloud Messaging. The standard protocol needs only a
// key pair, which was generated locally — no console step, no SDK on the
// page, and the same delivery path in every browser that supports push
// (including an iPhone, once the app is on the home screen).
//
// The public half is meant to be public: the browser sends it to the push
// service when subscribing. The private half signs the requests and lives in
// Secret Manager.
const VAPID_PUBLIC_KEY = "BNFfKGVB62LDSqOKk6xIpHzwZNZEf546lbqxiCyYM0X3eaLotj56XdNko_9s2AbWyn7NDHkD6t81rg3WsASSWzk";
const VAPID_PRIVATE_KEY = defineSecret("VAPID_PRIVATE_KEY");
// A contact for the push service to complain to if this sender misbehaves;
// required by the spec, and it must be a mailto: or https: URL.
const VAPID_SUBJECT = "https://osama1716.github.io/the-system/";

// Paddle (functions/api/payments.js). The API key lets the server cancel a
// subscription and open the customer portal; the webhook secret is the one
// Paddle shows for the notification destination, and proves a notification
// came from Paddle. Both set by the owner with `firebase functions:secrets:set`;
// a Sandbox pair on staging, a live pair on the live project.
const PADDLE_API_KEY = defineSecret("PADDLE_API_KEY");
const PADDLE_WEBHOOK_SECRET = defineSecret("PADDLE_WEBHOOK_SECRET");

// Whether journal entries the server did not write itself still count toward
// a standing. They came from tasks with no recorded price and rested on the
// device's own word, with nothing to stop a forged one of any size. Off since
// 2026-10-02, together with the rule that refuses them: only EXP the server
// computed counts anywhere. What such entries already added stays counted.
const COUNT_UNVERIFIED_EXP = false;

admin.initializeApp();
setGlobalOptions({ region: "us-central1" }); // matches the nam5 Firestore location

// A per-account, per-day allowance, kept where nobody but the server reads
// it: counters/{uid} = { <kind>: { day, n } }. Throws `code` when spent.
async function takeDailyAllowance(db, uid, kind, limit, code) {
  const ref = db.collection("counters").doc(uid);
  const day = new Date().toISOString().slice(0, 10);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = PROFILE.nextCount(snap.exists ? (snap.data() || {})[kind] : null, day, limit);
    if (!next) throw new HttpsError("resource-exhausted", code, { code });
    tx.set(ref, { [kind]: next }, { merge: true });
  });
}

function isAdminRequest(request) {
  return !!(request && request.auth && request.auth.token && request.auth.token.admin === true);
}

// Refuses a paid feature to an account with no subscription whose trial is
// over (functions/access.js), and says who is asking: "admin", "subscriber" or
// "trial" — what is given by degree (AI valuations a day, AI.evaluationsPerDay)
// reads it. While the switch is off it returns at once, reading nothing:
// "open" for everyone but the admins, since nobody pays yet.
async function requireEntitled(request) {
  if (!ACCESS.PAYWALL.on) return isAdminRequest(request) ? "admin" : "open";
  const uid = request.auth.uid;
  const [user, sub] = await Promise.all([
    admin.auth().getUser(uid).catch(() => null),
    admin.firestore().collection("subscriptions").doc(uid).get().catch(() => null),
  ]);
  const who = ACCESS.standing({
    now: Date.now(),
    createdAt: user && user.metadata ? Date.parse(user.metadata.creationTime) : NaN,
    isAdmin: isAdminRequest(request),
    subscription: sub && sub.exists ? sub.data() : null,
  });
  if (who === "none") {
    console.log("[access] " + uid.slice(0, 6) + " refused: no subscription");
    throw new HttpsError("permission-denied", "Subscription needed.", { code: "subscription-needed" });
  }
  return who;
}

// onRequest is for the one thing a browser never calls: Paddle's webhook,
// which proves itself with a signature instead of App Check.
module.exports = { ANTHROPIC_API_KEY, COUNT_UNVERIFIED_EXP, HttpsError, PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET, VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT, isAdminRequest, onCall, onRequest, requireEntitled, takeDailyAllowance };

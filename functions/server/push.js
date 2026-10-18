// Web Push: sending one notification to one device, and finding the admins to
// tell when something needs one.
"use strict";

const admin = require("firebase-admin");
const webpush = require("web-push");
const { VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT } = require("./base");

// adminDirectory/{uid} — who to tell when something needs an admin.
//
// The claim that makes an account an admin lives in Firebase Auth, and Auth
// cannot be queried by claim: the only way to find admins there is to page
// through every account. That is fine once and wrong on every appeal, so the
// list is kept here as well. setAdmin writes it; the first time it is needed
// and found empty, it is rebuilt from Auth — which also covers the first
// admin, who was made by a local script rather than by setAdmin.
async function setAdminDirectoryEntry(uid, isAdmin) {
  const ref = admin.firestore().collection("adminDirectory").doc(uid);
  if (isAdmin) await ref.set({ since: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  else await ref.delete().catch(() => {});
}

async function adminUids() {
  const db = admin.firestore();
  const snap = await db.collection("adminDirectory").get();
  if (!snap.empty) return snap.docs.map((d) => d.id);
  const found = [];
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    page.users.forEach((u) => { if (u.customClaims && u.customClaims.admin === true) found.push(u.uid); });
    pageToken = page.pageToken;
  } while (pageToken);
  await Promise.all(found.map((uid) => setAdminDirectoryEntry(uid, true)));
  return found;
}

// Subscriptions live at users/{uid}/pushSubs/{id}. A push service replies 404
// or 410 when a subscription is dead (app deleted, permission revoked,
// browser data cleared), and those are deleted on the spot: a dead
// subscription retried forever is how a reminder job turns into a slow leak.

function configurePush() {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.value());
}

// Sends one notification to one subscription. Returns "sent", "gone" (the
// subscription is dead and was deleted), or "failed".
// The push services browsers actually use. The endpoint is written by the
// device and the server makes a request to it; anything else is somewhere a
// subscription has no business pointing, so it is treated as dead. The same
// list is in firestore.rules (pushSubs).
const PUSH_HOST = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com|web\.push\.apple\.com)\//;
function isPushEndpoint(url) { return typeof url === "string" && PUSH_HOST.test(url); }

async function pushTo(subDoc, payload) {
  const data = subDoc.data() || {};
  if (!data.endpoint || !data.p256dh || !data.auth || !isPushEndpoint(data.endpoint)) {
    await subDoc.ref.delete().catch(() => {});
    return "gone";
  }
  try {
    await webpush.sendNotification({
      endpoint: data.endpoint,
      keys: { p256dh: data.p256dh, auth: data.auth },
    }, JSON.stringify(payload), { TTL: 900 });
    return "sent";
  } catch (err) {
    const code = err && err.statusCode;
    if (code === 404 || code === 410) {
      await subDoc.ref.delete().catch(() => {});
      return "gone";
    }
    console.error("[push] send failed", code, err && err.body);
    return "failed";
  }
}

// Something needs an admin: a phone notification to every device of every
// admin that has notifications on. An admin who has to remember to open the
// admin page to find out is an admin who finds out days late — and the review
// paths built on this (appeals now; held reflections and flagged accounts
// next) all have a person waiting on the other end.
//
// Never throws. The thing that needed reviewing has already been recorded by
// the time this runs, and it stays in the queue on the admin page whether or
// not a notification got through.
async function notifyAdmins(payload) {
  try {
    configurePush();
    const db = admin.firestore();
    const uids = await adminUids();
    let sent = 0, devices = 0;
    for (const uid of uids) {
      const subs = await db.collection("users").doc(uid).collection("pushSubs").get();
      for (const doc of subs.docs) {
        devices++;
        if ((await pushTo(doc, payload)) === "sent") sent++;
      }
    }
    console.log("[admin-notify] " + String(payload.tag || "") + ": " + uids.length + " admin(s), " +
      devices + " device(s), " + sent + " sent");
  } catch (err) {
    console.error("[admin-notify] failed", err && err.message);
  }
}

module.exports = { configurePush, notifyAdmins, pushTo, setAdminDirectoryEntry };

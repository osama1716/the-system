// Sending the notices of a trial's last days (functions/trial.js). Run once an
// hour from the reminder scheduler, so it needs no scheduler job of its own.
"use strict";

const admin = require("firebase-admin");
const ACCESS = require("../access.js");
const TRIAL = require("../trial.js");
const { pushTo } = require("./push");

// trialNotices/{uid} = { d2: <ms sent>, d1: <ms sent> }, server only: each
// notice goes once, marked before it is sent — a failed send is better missed
// than repeated every hour.
async function sendTrialNotices(db, now) {
  if (!ACCESS.PAYWALL.on) return 0;
  const nowMs = now.getTime();
  const days = ACCESS.PAYWALL.trialDays;
  const TS = admin.firestore.Timestamp;
  // Accounts made in the window where a notice can be due: the last two days.
  const snap = await db.collection("userDirectory")
    .where("createdAt", ">", TS.fromMillis(nowMs - days * TRIAL.DAY))
    .where("createdAt", "<=", TS.fromMillis(nowMs - (days - 2) * TRIAL.DAY)).get();
  let sent = 0;
  for (const doc of snap.docs) {
    const created = doc.data().createdAt;
    const at = created && created.toMillis ? created.toMillis() : NaN;
    const kind = TRIAL.noticeFor(at, nowMs, days);
    if (!kind) continue;
    const uid = doc.id;
    const markRef = db.collection("trialNotices").doc(uid);
    const mark = await markRef.get();
    if (mark.exists && mark.data()[kind]) continue;
    await markRef.set({ [kind]: nowMs }, { merge: true });
    const [sub, adminEntry] = await Promise.all([
      db.collection("subscriptions").doc(uid).get(),
      db.collection("adminDirectory").doc(uid).get(),
    ]);
    const who = ACCESS.standing({ now: nowMs, createdAt: at, isAdmin: adminEntry.exists, subscription: sub.exists ? sub.data() : null });
    if (who !== "trial") continue;
    const subs = await db.collection("users").doc(uid).collection("pushSubs").get();
    if (subs.empty) continue;
    const userSnap = await db.collection("users").doc(uid).get();
    const st = userSnap.exists ? (userSnap.data() || {}).state : null;
    const lang = (st && st.settings && st.settings.language) || "en";
    const payload = TRIAL.noticePayload(kind, lang);
    for (const s of subs.docs) if ((await pushTo(s, payload)) === "sent") sent++;
    console.log("[trial] " + uid.slice(0, 6) + " " + kind + " on " + subs.size + " device(s)");
  }
  return sent;
}

module.exports = { sendTrialNotices };

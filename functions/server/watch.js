// Recording what a suspicious account does, and taking a flagged one off the
// ranking. The review and the admins' notice are in api/suspicion.js.
"use strict";

const admin = require("firebase-admin");
// Accounts that behave in ways honest use does not — see suspicion.js.
const SUSPICION = require("../suspicion.js");

// ---------------------------------------------------------------------------
// Suspicious accounts — see functions/suspicion.js for the signals.
//
// suspicion/{uid} = { uid, evidence, flag, alertSeq, lastAlert }. Evidence is
// added where it happens (a report, a journal entry, a rejected answer), the
// signals are evaluated on every addition, and a flag that hides takes the
// account off the public ranking straight away. Points are never touched.
//
// Best effort, always: this runs after the work it watches has already
// succeeded, and a failure here must never undo or block that work.
// ---------------------------------------------------------------------------
async function setLeaderboardHidden(db, uid, hidden) {
  try {
    await db.collection("leaderboard").doc(uid).update({ hidden: !!hidden });
  } catch (err) {
    if (err.code !== 5) throw err; // no row yet: nothing to hide
  }
}

async function recordSuspicion(uid, addEvidence) {
  try {
    const db = admin.firestore();
    const ref = db.collection("suspicion").doc(uid);
    const effortRef = db.collection("effortLedger").doc(uid);
    const change = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const effortSnap = await tx.get(effortRef);
      const doc = snap.exists ? snap.data() : {};
      const evidence = { backfills: [], unlockGaps: [], expByDay: {}, rejectedAt: [], ...(doc.evidence || {}) };
      evidence.expByDay = { ...(evidence.expByDay || {}) };
      addEvidence(evidence);

      const nowMs = Date.now();
      const todayKey = new Date(nowMs).toISOString().slice(0, 10);
      const keepFrom = SUSPICION.shiftDayKey(todayKey, -14);
      Object.keys(evidence.expByDay).forEach((k) => { if (k < keepFrom) delete evidence.expByDay[k]; });

      const effortDays = (effortSnap.exists && effortSnap.data().days) || {};
      const reasons = SUSPICION.evaluate({ ...evidence, effortDays }, todayKey, nowMs);
      const { flag, alert } = SUSPICION.nextFlag(doc.flag, reasons, nowMs);
      const payload = {
        uid, evidence, flag,
        alertSeq: Number(doc.alertSeq) || 0,
        lastAlert: doc.lastAlert || [],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (alert.length) {
        payload.alertSeq += 1;
        payload.lastAlert = alert.map((r) => ({ code: r.code, detail: String(r.detail || "").slice(0, 160), hides: !!r.hides }));
      }
      tx.set(ref, payload);
      return { wasHidden: !!(doc.flag && doc.flag.hidden), hidden: flag.hidden, alert };
    });
    if (change.wasHidden !== change.hidden) await setLeaderboardHidden(db, uid, change.hidden);
    if (change.alert.length) {
      console.log("[suspicion] " + uid.slice(0, 6) + " flagged: " + change.alert.map((r) => r.code).join(", ") +
        (change.hidden ? " (off the ranking)" : " (notice only)"));
    }
  } catch (err) {
    console.error("[suspicion] " + uid.slice(0, 6) + " check failed", err && err.message);
  }
}

module.exports = { recordSuspicion, setLeaderboardHidden };

// Flagged accounts: telling the admins, and their review. The evidence is
// gathered through server/watch.js.
"use strict";

const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
// Accounts that behave in ways honest use does not — see suspicion.js.
const SUSPICION = require("../suspicion.js");
const { HttpsError, VAPID_PRIVATE_KEY, onCall } = require("../server/base");
const { notifyAdmins } = require("../server/push");
const { setLeaderboardHidden } = require("../server/watch");

// A new alert on an account: tell the admins, with the reasons. Kept in a
// trigger so none of the places that gather evidence needs the push key.
exports.notifyAdminsOfSuspicion = onDocumentWritten(
  { document: "suspicion/{uid}", secrets: [VAPID_PRIVATE_KEY] },
  async (event) => {
    const before = event.data && event.data.before && event.data.before.exists ? event.data.before.data() : {};
    const after = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
    if (!after || !(Number(after.alertSeq) > (Number(before.alertSeq) || 0))) return;
    const uid = event.params.uid;
    const dir = await admin.firestore().collection("userDirectory").doc(uid).get();
    const who = dir.exists ? (dir.data().name || dir.data().email || uid.slice(0, 6)) : uid.slice(0, 6);
    const reasons = after.lastAlert || [];
    const hides = reasons.some((r) => r.hides);
    await notifyAdmins({
      title: hides ? "Account taken off the ranking" : "Account worth a look",
      body: (String(who).slice(0, 40) + " · " + reasons.map((r) => r.detail).join("; ")).slice(0, 170),
      tag: "admin-suspicion",
      url: "./#admin",
    });
  }
);

// reviewSuspicion — an admin restores an account to the ranking, or keeps it
// off. Restoring remembers when, so only newer evidence can flag it again.
exports.reviewSuspicion = onCall(async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  const { uid, restore } = request.data || {};
  if (typeof uid !== "string" || !/^[A-Za-z0-9]{1,128}$/.test(uid) || typeof restore !== "boolean") {
    throw new HttpsError("invalid-argument", "Expected { uid: string, restore: boolean }.");
  }
  const db = admin.firestore();
  const ref = db.collection("suspicion").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Nothing recorded for that account.");
  const doc = snap.data();
  const flag = SUSPICION.afterReview(doc.flag, restore, Date.now());
  await ref.set({ ...doc, flag, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  await setLeaderboardHidden(db, uid, flag.hidden);
  console.log("[suspicion] admin " + (restore ? "restored " : "kept hidden ") + uid.slice(0, 6));
  return { hidden: !!flag.hidden };
});

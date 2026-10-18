// An account's life on the server: the directory entry made at sign-up, and
// erasing everything it left when it is deleted.
"use strict";

// Auth onCreate has no true v2 equivalent that isn't a "blocking function"
// (which runs synchronously and can deny the signup itself) — this is a
// pure side effect, so the classic async v1 trigger is the right tool.
const functionsV1 = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { HttpsError, onCall } = require("../server/base");
const { nameIndexRef } = require("../server/names");

// ---------------------------------------------------------------------------
// Auth onCreate -> admin-only {uid: email} directory, so the admin panel can
// look up a specific user by email without an Admin SDK call per lookup.
// ---------------------------------------------------------------------------
exports.onUserCreate = functionsV1.region("us-central1").auth.user().onCreate((user) => {
  return admin.firestore().collection("userDirectory").doc(user.uid).set({
    email: user.email || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
});

// ---------------------------------------------------------------------------
// Deleting an account (Google Play's account-deletion policy)
//
// Everything kept about the person goes: their saved state and everything
// under it, their public rows, name, friendships, races, messages, reports
// they made or that were made about them, appeals, answers, and the sign-in
// itself. Shared prices for library habits stay — they belong to nobody.
// Asked for from the app (Settings → Account) or the web page at
// #delete-account; the typed confirmation is checked on both sides.

const DELETE_CONFIRM = "DELETE";

async function deleteWhere(db, collection, field, value) {
  let removed = 0;
  for (;;) {
    const snap = await db.collection(collection).where(field, "==", value).limit(300).get();
    if (snap.empty) return removed;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    removed += snap.size;
    if (snap.size < 300) return removed;
  }
}

async function eraseAccount(db, uid) {
  const counts = {};
  // The name first, so it is free the moment the account is gone.
  const dir = await db.collection("userDirectory").doc(uid).get();
  const key = dir.exists ? dir.data().usernameKey : null;
  if (key) {
    const nameRef = db.collection("usernames").doc(key);
    const held = await nameRef.get();
    if (held.exists && held.data().uid === uid) await nameRef.delete();
    await nameIndexRef(db, key).set({ n: { [key]: admin.firestore.FieldValue.delete() } }, { merge: true });
  }

  // Pairs and races name both people; they go for the other side too.
  for (const col of ["friendships", "races"]) {
    let n = 0;
    for (;;) {
      const snap = await db.collection(col).where("users", "array-contains", uid).limit(300).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      n += snap.size;
      if (snap.size < 300) break;
    }
    counts[col] = n;
  }

  const shots = await db.collection("feedback").where("uid", "==", uid).get();
  for (const d of shots.docs) {
    if (d.data().hasShot) await db.collection("feedbackShots").doc(d.id).delete();
  }
  counts.feedback = await deleteWhere(db, "feedback", "uid", uid);
  counts.invites = await deleteWhere(db, "invites", "uid", uid);
  counts.reportsMade = await deleteWhere(db, "userReports", "reporter", uid);
  counts.reportsAbout = await deleteWhere(db, "userReports", "target", uid);
  counts.aiReports = await deleteWhere(db, "aiReports", "uid", uid);
  counts.appeals = await deleteWhere(db, "appeals", "userId", uid);
  counts.reflections = await deleteWhere(db, "reflections", "uid", uid);

  // Names this account released and that are still parked for it: each one
  // still names its uid, which must not outlive the account.
  counts.parkedNames = await deleteWhere(db, "usernames", "uid", uid);

  // Which reminders each device was sent: named uid__device. The upper bound
  // is the prefix followed by the highest private-use character, written as
  // an escape because the literal one is invisible and reads as an empty range.
  const sent = await db.collection("reminderSent")
    .where(admin.firestore.FieldPath.documentId(), ">=", uid + "__")
    .where(admin.firestore.FieldPath.documentId(), "<", uid + "__\uf8ff").get();
  for (const d of sent.docs) await d.ref.delete();

  // Everything under the account's own document, then the account's rows.
  await db.recursiveDelete(db.collection("users").doc(uid));
  await db.recursiveDelete(db.collection("aiPrices").doc(uid));
  await db.recursiveDelete(db.collection("progressLedger").doc(uid));
  const singles = ["leaderboard", "profiles", "userDirectory", "suggestions", "suspicion", "expTotals", "aiUsage", "effortLedger", "plannerReminders", "counters", "reminderIndex", "streaks", "wallets"];
  await Promise.all(singles.map((col) => db.collection(col).doc(uid).delete()));
  return counts;
}

exports.deleteAccount = onCall({ timeoutSeconds: 300, memory: "512MiB" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if (!request.data || request.data.confirm !== DELETE_CONFIRM) {
    throw new HttpsError("invalid-argument", "confirm", { code: "confirm" });
  }
  const uid = request.auth.uid;
  const db = admin.firestore();
  const counts = await eraseAccount(db, uid);
  try {
    await admin.auth().deleteUser(uid);
  } catch (err) {
    if (!err || err.code !== "auth/user-not-found") throw err;
  }
  // Triggers set off by the deletes above can land after them; one more pass
  // over the rows they write.
  await new Promise((r) => setTimeout(r, 4000));
  await Promise.all(["leaderboard", "profiles", "plannerReminders", "expTotals", "reminderIndex"].map((col) => db.collection(col).doc(uid).delete()));
  console.log("[delete-account] " + uid.slice(0, 6) + " " + JSON.stringify(counts));
  return { ok: true };
});

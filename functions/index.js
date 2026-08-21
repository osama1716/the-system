// Cloud Functions for The System.
//
// Everything an admin action does to another user's data goes through a
// function here, never a direct client Firestore write — see
// firestore.rules and the plan doc for why (in short: a single, auditable,
// input-validated choke point per action type, rather than trusting the
// admin's own browser/session with broad write access).
"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
// Auth onCreate has no true v2 equivalent that isn't a "blocking function"
// (which runs synchronously and can deny the signup itself) — this is a
// pure side effect, so the classic async v1 trigger is the right tool.
const functionsV1 = require("firebase-functions/v1");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({ region: "us-central1" }); // matches the nam5 Firestore location

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
// setAdmin — promote/demote an account by email. Admin-only (checks the
// caller's own custom claim, set once via scripts/bootstrap-admin.js for the
// very first admin). Custom claims only appear in a fresh ID token, so the
// affected account must sign out and back in for this to take effect.
// ---------------------------------------------------------------------------
exports.setAdmin = onCall(async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  const { email, admin: makeAdmin } = request.data || {};
  if (typeof email !== "string" || !email.trim() || typeof makeAdmin !== "boolean") {
    throw new HttpsError("invalid-argument", "Expected { email: string, admin: boolean }.");
  }
  const user = await admin.auth().getUserByEmail(email.trim());
  await admin.auth().setCustomUserClaims(user.uid, { admin: makeAdmin });
  return { uid: user.uid, email: user.email, admin: makeAdmin };
});

// ---------------------------------------------------------------------------
// getAdminStatus — admin-only. Custom claims live only in Firebase Auth, not
// Firestore, so there's no way for the client to know another account's
// current admin status without a server round-trip like this one. Used so
// the admin panel can disable "Make admin"/"Remove admin" appropriately
// instead of letting either be clicked regardless of current state.
// ---------------------------------------------------------------------------
exports.getAdminStatus = onCall(async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  const { uid } = request.data || {};
  if (typeof uid !== "string" || !uid.trim()) {
    throw new HttpsError("invalid-argument", "Expected { uid: string }.");
  }
  const user = await admin.auth().getUser(uid.trim());
  return { uid: user.uid, admin: !!(user.customClaims && user.customClaims.admin === true) };
});

// ---------------------------------------------------------------------------
// backfillUserDirectory — admin-only. onUserCreate only fires for accounts
// created AFTER these functions were first deployed; any account that
// existed before that (including the very first admin's own account) has no
// userDirectory entry and can't be found by the admin search until this
// runs once. Safe to re-run any time — only fills in what's missing.
// ---------------------------------------------------------------------------
exports.backfillUserDirectory = onCall(async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  const db = admin.firestore();
  let nextPageToken;
  let written = 0;
  do {
    const page = await admin.auth().listUsers(1000, nextPageToken);
    const batch = db.batch();
    for (const user of page.users) {
      const ref = db.collection("userDirectory").doc(user.uid);
      batch.set(ref, {
        email: user.email || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      written += 1;
    }
    if (page.users.length) await batch.commit();
    nextPageToken = page.pageToken;
  } while (nextPageToken);
  return { usersProcessed: written };
});

// One-time, local-only script: grants the Firebase Auth "admin" custom claim
// to one account by email. This is intentionally NOT a Cloud Function — no
// "make me admin" endpoint is ever deployed; running this script once locally
// is the entire bootstrap mechanism.
//
// Before running:
//   1. Firebase Console -> Project settings (gear icon) -> Service accounts
//      -> "Generate new private key" -> save the downloaded JSON file
//      SOMEWHERE OUTSIDE THIS REPO (e.g. your Desktop) — never inside the
//      the-system-app folder, so it can never accidentally get committed.
//   2. In this "scripts" folder, run: npm install
//
// Then run (from this "scripts" folder):
//   node bootstrap-admin.js "C:\path\to\your-downloaded-key.json" your-email@example.com
//
// After it succeeds, sign out and back in on that account in the app —
// custom claims only appear in a freshly-issued ID token.
"use strict";

const path = require("path");
const admin = require("firebase-admin");

const [, , keyPathArg, emailArg] = process.argv;

if (!keyPathArg || !emailArg) {
  console.error("Usage: node bootstrap-admin.js <path-to-service-account.json> <email>");
  process.exit(1);
}

const keyPath = path.resolve(keyPathArg);
const serviceAccount = require(keyPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

admin
  .auth()
  .getUserByEmail(emailArg.trim())
  .then((user) =>
    admin
      .auth()
      .setCustomUserClaims(user.uid, { admin: true })
      .then(() => user)
  )
  .then((user) => {
    console.log(`Done — ${user.email} (uid: ${user.uid}) now has the admin claim.`);
    console.log("Sign out and back in on that account in the app for it to take effect.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Failed:", err.message);
    process.exit(1);
  });

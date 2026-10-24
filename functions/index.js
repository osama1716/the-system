// Cloud Functions for The System.
//
// Everything an admin action does to another user's data goes through a
// function here, never a direct client Firestore write — see
// firestore.rules and the plan doc for why (in short: a single, auditable,
// input-validated choke point per action type, rather than trusting the
// admin's own browser/session with broad write access).
//
// The functions themselves are in api/, one file per area of the app, and
// what several of them share is in server/ (split from this file on
// 2026-10-18). This file only gathers them: Firebase deploys whatever it
// exports, under the same names as before the split, so nothing deployed
// was renamed or replaced. tests/test-functions-split.js checks that every
// file in api/ is listed here and that each name a file uses is its own or
// taken from another.
"use strict";

// First, so the Admin SDK and the region are set before any function exists.
require("./server/base");

const AREAS = [
  "accounts", "usernames", "leaderboard", "tasks", "evaluation", "directives",
  "appeals", "admin", "shop", "profiles", "feedback", "friends", "races",
  "suspicion", "reminders", "capability", "payments",
];
for (const area of AREAS) {
  const fns = require("./api/" + area);
  for (const name of Object.keys(fns)) {
    if (Object.prototype.hasOwnProperty.call(exports, name)) {
      throw new Error("functions/api/" + area + ".js: " + name + " is already defined in another area");
    }
    exports[name] = fns[name];
  }
}

// What friends and races share: telling one account something in its own
// language, the name it shows, and blocks between two accounts.
"use strict";

const admin = require("firebase-admin");
const FRIENDS = require("../friends.js");
const { HttpsError } = require("./base");
const { configurePush, pushTo } = require("./push");

// A notification to every device of one account, in that account's language.
async function notifyUser(uid, kind, name, vars) {
  try {
    configurePush();
    const db = admin.firestore();
    const [subs, userDoc] = await Promise.all([
      db.collection("users").doc(uid).collection("pushSubs").get(),
      db.collection("users").doc(uid).get(),
    ]);
    if (subs.empty) return;
    const state = userDoc.exists ? (userDoc.data() || {}).state : null;
    const lang = (state && state.settings && state.settings.language) || "en";
    const payload = { ...FRIENDS.message(lang, kind, name, vars), tag: kind.indexOf("race") === 0 || kind === "challenge" ? "races" : "friends", url: "./#friends" };
    for (const doc of subs.docs) await pushTo(doc, payload);
  } catch (err) {
    console.warn("[friends] notify failed", err && err.message);
  }
}

async function displayNameOf(db, uid) {
  const row = await db.collection("leaderboard").doc(uid).get();
  return row.exists ? String(row.data().displayName || "") : "";
}

// Who blocked whom between `me` and `them`.
async function blocksBetween(db, me, them) {
  const [mine, theirs] = await Promise.all([
    db.collection("users").doc(me).collection("blocks").doc(them).get(),
    db.collection("users").doc(them).collection("blocks").doc(me).get(),
  ]);
  return { youBlocked: mine.exists, blockedBy: theirs.exists };
}

// A block said as an error the app can word, with the blocker's name.
function blockError(kind, name) {
  return new HttpsError("failed-precondition", kind, { code: kind, name: name || "" });
}

module.exports = { blockError, blocksBetween, displayNameOf, notifyUser };

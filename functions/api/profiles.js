// Public profiles, reporting a player, and the player search.
"use strict";

const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const PROFILE = require("../profile.js");
const SEARCH = require("../search.js");
const { ANTHROPIC_API_KEY, HttpsError, VAPID_PRIVATE_KEY, onCall, requireEntitled } = require("../server/base");
const { notifyAdmins } = require("../server/push");
const { moderateText } = require("../server/ai");
const { readExpTotals } = require("../server/standing");
const { USERNAME_MAX, nameIndexEntries, nameIndexRef } = require("../server/names");

// ---------------------------------------------------------------------------
// Public profiles (functions/profile.js)
//
// profiles/{uid} is public to anyone signed in and written only here. It
// carries the intelligences as averages and top traits (mirrored from the
// saved state), the avatar and bio the person chose (moderated), when they
// joined, and — later — their race record. The name and EXP stay where they
// already are, on leaderboard/{uid}.

// The daily allowances used to live on profiles/{uid}, which anyone signed in
// can read — how many reports, searches or friend requests someone made
// today. They are in counters/{uid} now; every profile write removes what an
// older version left behind.
const STALE_COUNTER_FIELDS = () => Object.fromEntries(
  ["edits", "reports", "aiReports", "feedback", "searches", "friendRequests", "invites", "challenges"]
    .map((k) => [k, admin.firestore.FieldValue.delete()])
);

exports.mirrorProfile = onDocumentWritten("users/{uid}", async (event) => {
  const after = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
  if (!after || !after.state) return;
  const before = event.data.before && event.data.before.exists ? event.data.before.data() : null;
  // Compared uncapped first, so a save that changed nothing about the traits
  // costs no further read.
  const prev = before && before.state ? PROFILE.projectIntelligences(before.state) : null;
  if (prev && JSON.stringify(prev) === JSON.stringify(PROFILE.projectIntelligences(after.state))) return;
  // The levels are the device's word; the EXP behind them is the journal's.
  // A profile never shows more than that EXP could have bought.
  const totals = await readExpTotals(event.params.uid);
  const next = PROFILE.projectIntelligences(after.state, PROFILE.maxPointsFor(totals.total));
  if (next.capped) {
    console.log("[profile] " + event.params.uid.slice(0, 6) + " trait levels exceed what " + totals.total + " EXP buys; scaled down");
  }
  const db = admin.firestore();
  const ref = db.collection("profiles").doc(event.params.uid);
  const snap = await ref.get();
  const update = { categories: next.categories, topTraits: next.topTraits, updatedAt: admin.firestore.FieldValue.serverTimestamp(), ...STALE_COUNTER_FIELDS() };
  if (!snap.exists || !snap.data().joinedAt) {
    const dir = await db.collection("userDirectory").doc(event.params.uid).get();
    update.joinedAt = dir.exists && dir.data().createdAt ? dir.data().createdAt : admin.firestore.FieldValue.serverTimestamp();
  }
  await ref.set(update, { merge: true });
});

// The avatar and the bio: the two things a person writes into their own
// public profile. The bio is moderated before it is saved.
exports.updateProfile = onCall({ secrets: [ANTHROPIC_API_KEY] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid;
  const data = request.data || {};
  const db = admin.firestore();
  const ref = db.collection("profiles").doc(uid);
  const snap = await ref.get();
  const current = snap.exists ? snap.data() : {};
  const counterRef = db.collection("counters").doc(uid);
  const counter = await counterRef.get();
  const edits = PROFILE.nextCount(counter.exists ? counter.data().edits : null, new Date().toISOString().slice(0, 10), PROFILE.EDITS_PER_DAY);
  if (!edits) throw new HttpsError("resource-exhausted", "That's enough changes for today. Try again tomorrow.");
  await counterRef.set({ edits }, { merge: true });
  const update = { updatedAt: admin.firestore.FieldValue.serverTimestamp(), ...STALE_COUNTER_FIELDS() };

  if ("avatar" in data) {
    if (data.avatar === null) update.avatar = admin.firestore.FieldValue.delete();
    else if (typeof data.avatar === "string" && PROFILE.AVATARS[data.avatar]) update.avatar = data.avatar;
    else throw new HttpsError("invalid-argument", "Unknown avatar.");
  }
  if ("bio" in data) {
    const bio = PROFILE.cleanBio(data.bio);
    if (!bio) update.bio = admin.firestore.FieldValue.delete();
    else if (bio !== current.bio) {
      // A new bio is read by Claude before anyone sees it, so it comes with a
      // subscription (his rule, 2026-10-22: a free account is given nothing that
      // costs). Clearing one, the avatar, and the name stay free; the name is
      // still checked for everyone, because it shows on the public ranking.
      await requireEntitled(request);
      const verdict = await moderateText("bio", bio);
      if (!verdict.allowed) throw new HttpsError("failed-precondition", "not-allowed", { code: "not-allowed", reason: verdict.reason });
      update.bio = bio;
    }
  }
  await ref.set(update, { merge: true });
  const saved = (await ref.get()).data() || {};
  return { avatar: saved.avatar || null, bio: saved.bio || "" };
});

// Reporting someone. One open report per reporter and person, a few a day.
exports.reportUser = onCall({ secrets: [VAPID_PRIVATE_KEY] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const reporter = request.auth.uid;
  const r = PROFILE.cleanReport(request.data);
  if (!r) throw new HttpsError("invalid-argument", "Expected { uid, reason }.");
  if (r.uid === reporter) throw new HttpsError("invalid-argument", "You can't report yourself.");
  const db = admin.firestore();
  const counterRef = db.collection("counters").doc(reporter);
  const counter = await counterRef.get();
  const next = PROFILE.nextCount(counter.exists ? counter.data().reports : null, new Date().toISOString().slice(0, 10), PROFILE.REPORTS_PER_DAY);
  if (!next) throw new HttpsError("resource-exhausted", "That's enough reports for today.");
  const [row, profile] = await Promise.all([
    db.collection("leaderboard").doc(r.uid).get(),
    db.collection("profiles").doc(r.uid).get(),
  ]);
  const targetName = row.exists ? String(row.data().displayName || "") : "";
  const targetBio = profile.exists ? String(profile.data().bio || "") : "";
  await counterRef.set({ reports: next }, { merge: true });
  await db.collection("userReports").doc(reporter + "__" + r.uid).set({
    reporter, target: r.uid, reason: r.reason, note: r.note,
    targetName, targetBio, status: "open",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await notifyAdmins({
    title: "Player reported",
    body: ((targetName || r.uid.slice(0, 6)) + " · " + r.reason + (r.note ? " · " + r.note : "")).slice(0, 170),
    tag: "admin-report",
    url: "./#admin",
  });
  return { ok: true };
});

// What an admin does with a report: dismiss it, clear the bio, or take the
// name back (the person then has to claim a new one to be on the ranking).
// Every open report about the same person is closed with it.
exports.reviewReport = onCall(async (request) => {
  if (!request.auth || request.auth.token.admin !== true) throw new HttpsError("permission-denied", "Admin only.");
  const { id, action } = request.data || {};
  if (typeof id !== "string" || ["dismiss", "clearBio", "releaseName"].indexOf(action) < 0) {
    throw new HttpsError("invalid-argument", "Expected { id, action }.");
  }
  const db = admin.firestore();
  const report = await db.collection("userReports").doc(id).get();
  if (!report.exists) throw new HttpsError("not-found", "No such report.");
  const target = report.data().target;
  if (action === "clearBio") {
    await db.collection("profiles").doc(target).set({ bio: admin.firestore.FieldValue.delete() }, { merge: true });
  }
  if (action === "releaseName") {
    const dirRef = db.collection("userDirectory").doc(target);
    const dir = await dirRef.get();
    const key = dir.exists ? dir.data().usernameKey : null;
    // Freed at once, not parked: a name taken back for being abusive is not
    // one its owner gets to hold on to.
    if (key) {
      await db.collection("usernames").doc(key).delete();
      await nameIndexRef(db, key).set({ n: { [key]: admin.firestore.FieldValue.delete() } }, { merge: true });
    }
    await dirRef.set({ usernameKey: admin.firestore.FieldValue.delete(), name: admin.firestore.FieldValue.delete() }, { merge: true });
    await db.collection("leaderboard").doc(target).delete();
  }
  const open = await db.collection("userReports").where("target", "==", target).where("status", "==", "open").get();
  const batch = db.batch();
  open.docs.forEach((d) => batch.set(d.ref, { status: "resolved", action, resolvedAt: admin.firestore.FieldValue.serverTimestamp(), resolvedBy: request.auth.uid }, { merge: true }));
  await batch.commit();
  console.log("[reports] " + target.slice(0, 6) + " " + action + " (" + open.size + " report(s) closed)");
  return { closed: open.size };
});

exports.searchPlayers = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const q = String((request.data || {}).q || "").trim().replace(/\s+/g, " ").slice(0, USERNAME_MAX);
  if ([...q].length < 2) return { results: [] };
  const db = admin.firestore();
  const counterRef = db.collection("counters").doc(request.auth.uid);
  const counter = await counterRef.get();
  const next = PROFILE.nextCount(counter.exists ? counter.data().searches : null, new Date().toISOString().slice(0, 10), 300);
  if (!next) throw new HttpsError("resource-exhausted", "That's enough searching for today.");
  await counterRef.set({ searches: next }, { merge: true });
  const results = SEARCH.search(q, await nameIndexEntries(db), [request.auth.uid]).map((r) => ({ uid: r.uid, name: r.name }));
  return { results };
});

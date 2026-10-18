// Weekly 1-v-1 races between friends.
"use strict";

const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const PROFILE = require("../profile.js");
const FRIENDS = require("../friends.js");
const RACES = require("../races.js");
const { COUNT_UNVERIFIED_EXP, HttpsError, VAPID_PRIVATE_KEY, onCall } = require("../server/base");
const { blockError, blocksBetween, displayNameOf, notifyUser } = require("../server/social");

// ---------------------------------------------------------------------------
// Weekly races (functions/races.js)

async function areFriends(db, a, b) {
  const f = await db.collection("friendships").doc(FRIENDS.pairId(a, b)).get();
  return f.exists && f.data().status === "accepted";
}

async function openRacesOf(db, uid) {
  const snap = await db.collection("races").where("users", "array-contains", uid)
    .where("status", "in", ["pending", "active"]).get();
  return snap.docs;
}

// Both sides' scores from the journal, between the start and `until`.
async function raceScores(db, race, until) {
  const start = race.startAt.toMillis(), end = Math.min(until, race.endAt.toMillis());
  const scores = {};
  for (const uid of race.users) {
    const snap = await db.collection("users").doc(uid).collection("expEvents")
      .where("at", ">=", admin.firestore.Timestamp.fromMillis(start))
      .where("at", "<", admin.firestore.Timestamp.fromMillis(end)).get();
    const events = snap.docs.map((d) => d.data());
    const typesByPrice = {};
    if (race.metric !== "total") {
      const ids = [...new Set(events.map((e) => e.priceId).filter(Boolean))];
      const prices = await Promise.all(ids.map((id) => db.collection("aiPrices").doc(uid).collection("prices").doc(id).get()));
      prices.forEach((p, i) => { typesByPrice[ids[i]] = p.exists && Array.isArray(p.data().types) ? p.data().types : null; });
    }
    scores[uid] = RACES.scoreOf(events, typesByPrice, race.metric, COUNT_UNVERIFIED_EXP);
  }
  return scores;
}

exports.createRace = onCall({ secrets: [VAPID_PRIVATE_KEY] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const me = request.auth.uid;
  const { uid: them, metric } = request.data || {};
  if (typeof them !== "string" || !/^[A-Za-z0-9]{10,40}$/.test(them)) throw new HttpsError("invalid-argument", "Expected { uid, metric }.");
  const db = admin.firestore();
  const myDoc = await db.collection("users").doc(me).get();
  const state = myDoc.exists ? myDoc.data().state : null;
  const keys = (state && Array.isArray(state.intTypes) ? state.intTypes : []).map((t) => t.key);
  if (!RACES.metricOk(metric, keys)) throw new HttpsError("invalid-argument", "bad-metric", { code: "bad-metric" });

  const counterRef = db.collection("counters").doc(me);
  const counter = await counterRef.get();
  const next = PROFILE.nextCount(counter.exists ? counter.data().challenges : null, new Date().toISOString().slice(0, 10), RACES.CHALLENGES_PER_DAY);
  if (!next) throw new HttpsError("resource-exhausted", "That's enough challenges for today.");

  const [friends, blocks, mine] = await Promise.all([areFriends(db, me, them), blocksBetween(db, me, them), openRacesOf(db, me)]);
  const decision = RACES.decideChallenge({
    me, them, friends, ...blocks,
    openBetween: mine.some((d) => d.data().users.indexOf(them) >= 0),
    openCount: mine.length,
  });
  if (decision === "blocked-by" || decision === "you-blocked") throw blockError(decision, await displayNameOf(db, them));
  if (decision !== "ok") throw new HttpsError("failed-precondition", decision, { code: decision });

  await counterRef.set({ challenges: next }, { merge: true });
  const ref = db.collection("races").doc();
  await ref.set({
    users: [me, them].sort(), challenger: me, opponent: them, metric, status: "pending",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await notifyUser(them, "challenge", await displayNameOf(db, me));
  return { id: ref.id };
});

exports.respondRace = onCall({ secrets: [VAPID_PRIVATE_KEY] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const me = request.auth.uid;
  const { id, accept } = request.data || {};
  if (typeof id !== "string" || typeof accept !== "boolean") throw new HttpsError("invalid-argument", "Expected { id, accept }.");
  const db = admin.firestore();
  const ref = db.collection("races").doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data().opponent !== me || snap.data().status !== "pending") {
    throw new HttpsError("failed-precondition", "no-race", { code: "no-race" });
  }
  const race = snap.data();
  if (!accept) {
    await ref.set({ status: "declined", endedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { status: "declined" };
  }
  if (!(await areFriends(db, me, race.challenger))) throw new HttpsError("failed-precondition", "not-friends", { code: "not-friends" });
  const mine = await openRacesOf(db, me);
  if (mine.filter((d) => d.data().status === "active").length >= RACES.MAX_OPEN) throw new HttpsError("failed-precondition", "too-many", { code: "too-many" });
  const w = RACES.windowFrom(Date.now());
  await ref.set({
    status: "active",
    startAt: admin.firestore.Timestamp.fromMillis(w.startAt),
    endAt: admin.firestore.Timestamp.fromMillis(w.endAt),
  }, { merge: true });
  await notifyUser(race.challenger, "raceOn", await displayNameOf(db, me));
  return { status: "active" };
});

exports.cancelRace = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const id = (request.data || {}).id;
  if (typeof id !== "string") throw new HttpsError("invalid-argument", "Expected { id }.");
  const db = admin.firestore();
  const ref = db.collection("races").doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data().challenger !== request.auth.uid || snap.data().status !== "pending") {
    throw new HttpsError("failed-precondition", "no-race", { code: "no-race" });
  }
  await ref.set({ status: "cancelled", endedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return { status: "cancelled" };
});

// The live score of a race this account is in.
exports.raceStatus = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const id = (request.data || {}).id;
  if (typeof id !== "string") throw new HttpsError("invalid-argument", "Expected { id }.");
  const db = admin.firestore();
  const snap = await db.collection("races").doc(id).get();
  if (!snap.exists || snap.data().users.indexOf(request.auth.uid) < 0) throw new HttpsError("not-found", "no-race", { code: "no-race" });
  const race = snap.data();
  if (race.status === "done") return { scores: race.scores || {}, winner: race.winner || null };
  if (race.status !== "active") return { scores: {} };
  return { scores: await raceScores(db, race, Date.now()) };
});

// Ends races whose week is up — scores from the journal, the result on both
// profiles, a notification to each — and lets challenges nobody answered
// lapse after three days.
exports.settleRaces = onSchedule(
  { schedule: "every 15 minutes", timeZone: "UTC", secrets: [VAPID_PRIVATE_KEY] },
  async () => {
    const db = admin.firestore();
    const now = Date.now();
    const due = await db.collection("races").where("status", "==", "active")
      .where("endAt", "<=", admin.firestore.Timestamp.fromMillis(now)).limit(100).get();
    for (const doc of due.docs) {
      const race = doc.data();
      const scores = await raceScores(db, race, race.endAt.toMillis());
      const { winner } = RACES.outcome(race.users[0], race.users[1], scores);
      const claimed = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        if (fresh.data().status !== "active") return false;
        tx.set(doc.ref, { status: "done", scores, winner, endedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        race.users.forEach((uid) => {
          const field = winner === null ? "raceTies" : winner === uid ? "raceWins" : "raceLosses";
          tx.set(db.collection("profiles").doc(uid), { [field]: admin.firestore.FieldValue.increment(1) }, { merge: true });
        });
        return true;
      });
      if (!claimed) continue;
      const names = {};
      for (const uid of race.users) names[uid] = await displayNameOf(db, uid);
      for (const uid of race.users) {
        const other = race.users.find((u) => u !== uid);
        const kind = winner === null ? "raceTie" : winner === uid ? "raceWon" : "raceLost";
        await notifyUser(uid, kind, names[other], { mine: scores[uid] || 0, theirs: scores[other] || 0 });
      }
      console.log("[races] " + doc.id.slice(0, 6) + " done " + race.metric + " " + JSON.stringify(scores) + " winner " + (winner ? winner.slice(0, 6) : "tie"));
    }
    const stale = await db.collection("races").where("status", "==", "pending")
      .where("createdAt", "<=", admin.firestore.Timestamp.fromMillis(now - RACES.PENDING_DAYS * RACES.DAY_MS)).limit(200).get();
    if (!stale.empty) {
      const batch = db.batch();
      stale.docs.forEach((d) => batch.set(d.ref, { status: "expired", endedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }));
      await batch.commit();
    }
  }
);

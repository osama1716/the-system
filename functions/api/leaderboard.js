// The ranking: the server's own journal of EXP, the public rows built from it,
// the gold paid on the way, and the weekly snapshot of ranks.
"use strict";

const { onDocumentWritten, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const SHOP = require("../shop.js");
const SEASON = require("../season.js");
const FRIENDS = require("../friends.js");
const { COUNT_UNVERIFIED_EXP, HttpsError, onCall } = require("../server/base");
const { BASELINE_CURVE, MIRRORED_FIELDS, categoryShares, convertLegacyBaseline, ensureBaseline, playerOf, rankIdxOfTotal, readExpTotals, writeLeaderboardEntry } = require("../server/standing");
const { recordSuspicion } = require("../server/watch");

// Admin-only migration, same shape as backfillUsernames and
// backfillUserDirectory. The trigger
// only fires when a user document is actually written, so every account that
// already existed when it was deployed stays off the board until its owner
// next gains or loses EXP — which could be days, and makes a working feature
// look broken on the day it ships. This walks the directory once and writes
// each row directly.
//
// Safe to re-run: it writes exactly what the trigger would have written.
exports.backfillLeaderboard = onCall(async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  const db = admin.firestore();
  const dirSnap = await db.collection("userDirectory").get();

  let written = 0, skippedNoName = 0, skippedNoState = 0;
  for (const dirDoc of dirSnap.docs) {
    // Same rule the trigger applies: no reserved name, no row. Reported back
    // as a count rather than fixed here — reserving a name for someone is the
    // other backfill's job, and it has to handle duplicates.
    if (!dirDoc.data().usernameKey) { skippedNoName++; continue; }
    const userDoc = await db.collection("users").doc(dirDoc.id).get();
    const player = userDoc.exists && userDoc.data().state ? userDoc.data().state.player : null;
    if (!player) { skippedNoState++; continue; }
    await writeLeaderboardEntry(dirDoc.id, player);
    written++;
  }
  return { total: dirSnap.size, written, skippedNoName, skippedNoState };
});

// Converts baselines written before levels were priced by rank.
//
// Those were measured with the old flat formula, so they are inflated —
// G-Rank Lv14 was recorded as 1305 where it is worth 200. Left alone, an
// account reconciles towards the wrong figure for ever, which is the bug this
// whole sequence started from. journalExp is untouched: it sums real deltas,
// which meant the same thing under both rules.
//
// Idempotent by the stamp rather than by luck — converting twice would deflate
// a standing as badly as not converting deflates nothing, and a backfill
// someone runs twice is a backfill that will be run twice.
exports.backfillExpBaselines = onCall(async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  const db = admin.firestore();
  const snap = await db.collection("expTotals").get();

  let converted = 0, alreadyDone = 0, noBaseline = 0;
  const examples = [];
  for (const doc of snap.docs) {
    const d = doc.data() || {};
    if (Number(d.baselineCurve) === BASELINE_CURVE) { alreadyDone++; continue; }
    if (typeof d.baseline !== "number") {
      // No baseline yet means nothing has been grandfathered, so there is
      // nothing in the old unit to convert. Stamping it would make the real
      // baseline, when it is finally written, look already converted.
      noBaseline++;
      continue;
    }
    const before = Number(d.baseline) || 0;
    const after = convertLegacyBaseline(before);
    await doc.ref.set({ baseline: after, baselineCurve: BASELINE_CURVE }, { merge: true });
    if (examples.length < 5) examples.push({ uid: doc.id, before, after });
    converted++;
  }
  return { total: snap.size, converted, alreadyDone, noBaseline, examples };
});

// Every appended event moves the running total, and the public row with it.
//
// Deliberately recomputed from expTotals rather than incremented in place: an
// increment that fails leaves the row permanently short by that event, whereas
// a recomputation is self-correcting — the next event repairs whatever the
// last one missed. One extra read per event is a cheap price for a number that
// cannot drift.
exports.recordExpEvent = onDocumentCreated("users/{uid}/expEvents/{eventId}", async (event) => {
  const snap = event.data;
  if (!snap) return;
  const delta = Number(snap.data().delta);
  if (!Number.isFinite(delta) || delta === 0) return;

  const uid = event.params.uid;
  const db = admin.firestore();

  // Verified means the server wrote it: recordProgress, which computed the
  // amount from a price it issued and a ledger it keeps, or applyAdjustment.
  // The rules no longer let a device write an entry naming a price, so
  // anything else is a device's own word about a task with no price.
  //
  // They stopped counting on 2026-10-02 (COUNT_UNVERIFIED_EXP); see there.
  const verified = snap.data().server === true;
  if (!verified && !COUNT_UNVERIFIED_EXP) {
    console.log("[journal] " + uid.slice(0, 6) + " ignored an unverified entry of " + delta);
    return;
  }

  // Before touching the running total, so the totals document never exists
  // without a baseline (see ensureBaseline).
  const rowRef = db.collection("leaderboard").doc(uid);
  await ensureBaseline(uid);

  // Which month this belongs to, so a history longer than the app remembers
  // can be read back in a single document rather than by replaying thousands
  // of entries. Twelve numbers a year is nothing to store, and it means the
  // local stats staying pruned costs nobody their long-run record.
  const at = snap.data().at;
  const when = at && typeof at.toDate === "function" ? at.toDate() : new Date();
  const monthKey = when.getUTCFullYear() + "-" + String(when.getUTCMonth() + 1).padStart(2, "0");

  const shares = await categoryShares(uid, snap.data());
  const catInc = {};
  Object.keys(shares).forEach((k) => { catInc[k] = admin.firestore.FieldValue.increment(shares[k]); });

  await db.collection("expTotals").doc(uid).set(
    {
      journalExp: admin.firestore.FieldValue.increment(delta),
      ...(Object.keys(catInc).length ? { cats: catInc } : {}),
      months: { [monthKey]: admin.firestore.FieldValue.increment(delta) },
      // Tracked alongside, never subtracted from the total. This is the part
      // of someone's standing that rests on their own word.
      unverifiedExp: admin.firestore.FieldValue.increment(verified ? 0 : delta),
    },
    { merge: true }
  );

  const totals = await readExpTotals(uid);
  // One line per movement: what moved, who computed it, and what the standing
  // came to. Without this, a standing that jumps has no explanation anywhere —
  // the entries are spread over a subcollection nobody can read back quickly,
  // and the totals document only ever shows the answer, never the steps.
  // EXP earned per day, for the suspicion check. Task EXP only: an admin's
  // adjustment is not the account's own doing, and a day it happened on must
  // not look like a day somebody earned it.
  if (verified && delta > 0 && !/^Adjustment/.test(String(snap.data().source || ""))) {
    const dayKey = when.toISOString().slice(0, 10);
    await recordSuspicion(uid, (ev) => { ev.expByDay[dayKey] = (Number(ev.expByDay[dayKey]) || 0) + delta; });
  }
  // Gold follows what the server paid (see functions/shop.js).
  if (verified) {
    await payGold(db, uid, delta, totals.total).catch((err) =>
      console.error("[gold] " + uid.slice(0, 6) + " not paid", err && err.message));
  }
  console.log("[journal] " + uid.slice(0, 6) + " " + (delta > 0 ? "+" : "") + delta +
    " " + (verified ? "server" : "unverified") + " " + String(snap.data().source || "").slice(0, 40) +
    " | baseline " + totals.baseline + " journal " + totals.journalExp +
    " unverified " + totals.unverified + " total " + totals.total);
  // update(), not set(): an account with no reserved name has no row, and it
  // must not gain a nameless one here. Its events still accumulate in
  // expTotals, and the mirror writes the correct total the moment a name is
  // claimed.
  // And this week's EXP beside it, for the friends' weekly ranking — read and
  // written together, so two events a moment apart both count.
  try {
    const wk = FRIENDS.weekKeyOf(when);
    await db.runTransaction(async (tx) => {
      const current = await tx.get(rowRef);
      if (!current.exists) return;
      tx.update(rowRef, {
        totalExp: totals.total, cats: totals.cats,
        ...FRIENDS.nextWeek(current.data(), wk, delta),
        ...SEASON.nextSeason(current.data(), SEASON.seasonKeyOf(when), delta),
      });
    });
  } catch (err) {
    if (err.code !== 5) throw err; // 5 = NOT_FOUND
  }
});

// wallets/{uid}: gold, aurenite, themes, frames, freezes, rankRewarded. A
// wallet created now remembers the rank the account already stood at, so
// ranks reached before gold existed are not paid out in a lump.
async function payGold(db, uid, delta, totalAfter) {
  const ref = db.collection("wallets").doc(uid);
  const after = rankIdxOfTotal(totalAfter);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const wallet = SHOP.cleanWallet(snap.exists ? snap.data() : null, rankIdxOfTotal(totalAfter - delta));
    const { wallet: next, rankGold } = SHOP.onExp(wallet, delta, after);
    tx.set(ref, { ...next, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    console.log("[gold] " + uid.slice(0, 6) + " " + (delta * SHOP.GOLD_PER_EXP) + (rankGold ? " +" + rankGold + " rank" : "") + " -> " + next.gold);
  });
}

// Once a week, where everybody stood. The ranking page shows each row's
// movement against it — a position on its own says where you are, the change
// says whether the week went well. Written to the board itself, so reading a
// row is still one document.
exports.snapshotRanks = onSchedule({ schedule: "10 0 * * 1", timeZone: "UTC" }, async () => {
  const db = admin.firestore();
  const snap = await db.collection("leaderboard").orderBy("totalExp", "desc").limit(1000).get();
  let batch = db.batch(), n = 0, written = 0;
  for (let i = 0; i < snap.docs.length; i++) {
    batch.set(snap.docs[i].ref, { lastRank: i + 1, lastRankAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    n++; written++;
    if (n === 400) { await batch.commit(); batch = db.batch(); n = 0; }
  }
  if (n) await batch.commit();
  console.log("[ranks] snapshot of " + written + " row(s)");
});

exports.mirrorLeaderboard = onDocumentWritten("users/{uid}", async (event) => {
  const uid = event.params.uid;
  const after = event.data && event.data.after;

  if (!after || !after.exists) {
    await admin.firestore().collection("leaderboard").doc(uid).delete();
    return;
  }

  const nextPlayer = playerOf(after);
  if (!nextPlayer) return;

  // The client push()es the entire user document on a debounce, so this fires
  // for edits that have nothing to do with ranking — renaming a habit, typing
  // a note, changing a theme. Comparing the mirrored fields first turns those
  // into a no-op instead of a public write plus a directory read every time
  // anyone touches anything.
  const prevPlayer = playerOf(event.data && event.data.before);
  if (prevPlayer && MIRRORED_FIELDS.every((k) => prevPlayer[k] === nextPlayer[k])) return;

  await writeLeaderboardEntry(uid, nextPlayer);
});

// How the EXP an account earned becomes its public standing, and the row on
// the ranking that shows it.
"use strict";

const admin = require("firebase-admin");
const AI = require("../ai-config");
const RACES = require("../races.js");
const { COUNT_UNVERIFIED_EXP } = require("./base");

// ---------------------------------------------------------------------------
// Leaderboard mirror
//
// users/{uid} is private and validated; leaderboard/{uid} is the small public
// projection of it that the ranking page reads. A trigger writes it, never a
// client — a client that could write its own row could write any row.
//
// There is deliberately NO stored rank. Rank is a property of the collection,
// not of a player: one person passing another changes two positions but only
// one document, so a stored rank is wrong the moment it is written. The page
// derives position from the order the query comes back in.
// ---------------------------------------------------------------------------

const RANKS = ["G", "F", "E", "D", "C", "B", "A", "S"];

// What one level costs at each rank, and how many levels a rank holds.
// These mirror SYS.RANK_LEVEL_EXP / SYS.LEVELS_PER_RANK in js/constants.js.
//
// They were missing here, and that is what this section is about. When levels
// stopped costing a flat 100 and started costing what their rank says, the
// client was changed and this file was not — despite the comment below, on
// both copies, saying they must move together. The two then measured the same
// player in different units, and disagreed on 39 of 40 standings checked.
// MUST match SYS.RANK_LEVEL_EXP in js/constants.js — see the comment there,
// and tests/test-curve.js, which compares the two arrays as text so they
// cannot drift apart again.
const RANK_LEVEL_EXP = [100, 130, 170, 220, 280, 350, 440, 550];
const LEVELS_PER_RANK = 100;
function levelCostOf(rankIdx) {
  return RANK_LEVEL_EXP[Math.max(0, Math.min(RANK_LEVEL_EXP.length - 1, rankIdx))];
}

// Flattens the three counters into one sortable number. Mirrors SYS.totalExp
// in js/engine-exp.js — the two must agree, so change them together.
//
// A mismatch here is not cosmetic. reconcileExpWithServer subtracts this
// number from the client's own, so two different units make the difference
// permanently non-zero: the client "corrects" its standing on every single
// load, which rewrites the player, which makes the stored copy disagree, which
// raises "which copy do you want to keep?" on every launch, for ever. It also
// decides the order of the public leaderboard.
function totalExpOf(player) {
  const rankIdx = Math.max(0, RANKS.indexOf(player.rank));
  const level = Math.max(1, Number(player.level) || 1);
  const exp = Math.max(0, Number(player.exp) || 0);
  // Ranks are not the same size, so the ones already crossed are added up
  // rather than multiplied out from a single figure.
  let total = 0;
  for (let r = 0; r < rankIdx; r++) total += RANK_LEVEL_EXP[r] * LEVELS_PER_RANK;
  return total + (level - 1) * levelCostOf(rankIdx) + exp;
}

// Which rank a flattened total sits in.
function rankIdxOfTotal(total) {
  let t = Math.max(0, Number(total) || 0);
  for (let r = 0; r < RANK_LEVEL_EXP.length; r++) {
    const whole = RANK_LEVEL_EXP[r] * LEVELS_PER_RANK;
    if (t < whole || r === RANK_LEVEL_EXP.length - 1) return r;
    t -= whole;
  }
  return 0;
}

// The unit a stored baseline is written in. Bumped when the meaning of the
// number changes, so a conversion can tell what it is looking at; a document
// without it predates the rank curve and holds a legacy total.
const BASELINE_CURVE = 2;

// Undoes the pre-curve encoding, which packed the three counters at a fixed
// 100 each. Exactly invertible, because the sanitiser that produced those
// totals clamped exp to 99 and level to 100 — so no two standings could ever
// have collided into one number.
function standingFromLegacyTotal(total) {
  const t = Math.max(0, Math.round(Number(total) || 0));
  const rankIdx = Math.min(RANKS.length - 1, Math.floor(t / 10000));
  const rem = t - rankIdx * 10000;
  const level = Math.max(1, Math.min(LEVELS_PER_RANK, Math.floor(rem / 100) + 1));
  const exp = Math.max(0, Math.min(99, rem % 100));
  return { rank: RANKS[rankIdx], level, exp };
}

// A legacy baseline read back as the standing it described, then re-measured
// under the curve. Only the baseline needs this: journalExp is a sum of real
// deltas, and a delta of +500 was 500 exp under either rule.
function convertLegacyBaseline(total) {
  return totalExpOf(standingFromLegacyTotal(total));
}

// The client owns its own player object, so everything read out of it is
// coerced and clamped before it lands in a public collection — not as a
// defence against cheating (see the known limitation in the handoff: the
// client can still inflate its own EXP) but so that one malformed or hostile
// document cannot produce a row that breaks the page for everyone reading it.
function sanitizePlayer(player) {
  const rank = RANKS.includes(player.rank) ? player.rank : "G";
  const level = Math.max(1, Math.min(LEVELS_PER_RANK, Math.round(Number(player.level) || 1)));
  // The ceiling on exp is one below what a level costs at this rank, not a
  // flat 99. A B-rank level costs 130 and an S-rank one 200, so the old
  // clamp silently deleted up to 100 exp from the highest ranks — the ones
  // where it is hardest to earn.
  const rankIdx = Math.max(0, RANKS.indexOf(rank));
  const exp = Math.max(0, Math.min(levelCostOf(rankIdx) - 1, Math.round(Number(player.exp) || 0)));
  const questsCompleted = Math.max(0, Math.min(1e6, Math.round(Number(player.questsCompleted) || 0)));
  return { rank, level, exp, questsCompleted, totalExp: totalExpOf({ rank, level, exp }) };
}

// The authoritative standing: what was grandfathered in when this account was
// first seen, plus everything the journal has recorded since.
//
// The baseline exists because the journal started empty on the day it shipped,
// and there is nothing to check the history before it against. Taking that
// history on trust once, and never again, is the honest version of the trade:
// it does not pretend the old numbers were verified, and it does not reset
// everyone to zero to make a point.
async function readExpTotals(uid) {
  const doc = await admin.firestore().collection("expTotals").doc(uid).get();
  const d = doc.exists ? doc.data() : {};
  return {
    // Whether the baseline has been set — not whether the document exists.
    // recordExpEvent creates this document with only journalExp on it, so an
    // event arriving before the mirror has ever run leaves a document that
    // exists and has no baseline. Reading existence as "already grandfathered"
    // would then skip the baseline permanently and collapse that account's
    // standing to whatever it has earned since.
    hasBaseline: typeof d.baseline === "number",
    baseline: Number(d.baseline) || 0,
    journalExp: Number(d.journalExp) || 0,
    unverified: Number(d.unverifiedExp) || 0,
    total: (Number(d.baseline) || 0) + (Number(d.journalExp) || 0),
    cats: cleanCats(d.cats),
  };
}

// EXP earned in each intelligence, rounded for the public row. Only keys the
// evaluator can name, and nothing at or below zero — a row ordered by a
// category should not list someone who has nothing in it.
const CATEGORY_KEYS = AI.INTELLIGENCE_CATEGORIES.map((c) => c.key);
function cleanCats(raw) {
  const out = {};
  CATEGORY_KEYS.forEach((k) => {
    const v = Math.round(Number(raw && raw[k]) || 0);
    if (v > 0) out[k] = v;
  });
  return out;
}

// What one journal entry adds to each intelligence: the categories its price
// was recorded with, split evenly — the same rule a race on one intelligence
// counts by (RACES.contribution), so the two can never disagree. An entry with
// no price (an admin's adjustment) builds no intelligence.
async function categoryShares(uid, entry) {
  if (!entry.priceId) return {};
  const price = await admin.firestore().collection("aiPrices").doc(uid).collection("prices").doc(String(entry.priceId)).get();
  const types = price.exists && Array.isArray(price.data().types) ? price.data().types : [];
  const out = {};
  CATEGORY_KEYS.forEach((k) => {
    const v = RACES.contribution(entry, types, k, COUNT_UNVERIFIED_EXP);
    if (v) out[k] = v;
  });
  return out;
}

// Gives an account its starting point, once: zero.
//
// It used to grandfather whatever the client claimed the first time its row
// was written, which was right for the accounts that predated the journal and
// is now an open door — a new account could edit its own EXP before claiming
// a name and have the edit made permanent. Every account that predates the
// journal already has its baseline, so nothing earned is lost by this; from
// here on a standing starts at nothing and moves only through the journal.
async function ensureBaseline(uid) {
  const totals = await readExpTotals(uid);
  if (totals.hasBaseline) return totals;
  const baseline = 0;
  await admin.firestore().collection("expTotals").doc(uid)
    .set({ baseline, baselineCurve: BASELINE_CURVE }, { merge: true });
  return { ...totals, hasBaseline: true, baseline, total: baseline + totals.journalExp };
}

// Only the fields the board actually shows. Everything else in a user's
// document — every task title, note and setting — changes constantly and must
// not cause a public write.
const MIRRORED_FIELDS = ["rank", "level", "exp"];

function playerOf(snap) {
  const data = snap && snap.exists ? snap.data() : null;
  return (data && data.state && data.state.player) || null;
}

async function writeLeaderboardEntry(uid, rawPlayer) {
  const db = admin.firestore();
  const ref = db.collection("leaderboard").doc(uid);
  const dir = await db.collection("userDirectory").doc(uid).get();
  const claimed = dir.exists && dir.data().usernameKey ? dir.data().name : null;

  // No claimed name, no row. The whole point of unique names is that a public
  // ranking identifies people unambiguously; an account whose name was never
  // reserved could be sharing it with someone else, so putting it on the board
  // would undo that. Such an account claims its name (Settings, or the admin
  // backfill) and appears on the next write.
  if (!claimed) {
    await ref.delete();
    return;
  }

  // First sight of this account: it starts at zero, whatever it claims. From
  // here on the number only moves through the journal.
  const totals = await ensureBaseline(uid);

  const existing = await ref.get();
  const payload = {
    displayName: claimed,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  // totalExp is set here only when the row is first created. After that it
  // belongs to recordExpEvent alone — two writers on one number is how a
  // mirror carrying a stale read silently undoes a journalled event.
  //
  // Note what is no longer written: rank, level and exp. They were copied
  // from the client, which is exactly what this whole change is about not
  // doing. The page derives all three from totalExp instead.
  if (!existing.exists) { payload.totalExp = totals.total; payload.cats = totals.cats; }
  // Rows written before this change carry rank/level/exp copied from the
  // client. The page no longer reads them, but leaving them behind puts two
  // disagreeing standings in the same public document for whoever looks next.
  // questsCompleted went too (2026-10-02): it was the device's own count,
  // shown publicly with nothing to check it against.
  ["rank", "level", "exp", "questsCompleted"].forEach((k) => {
    if (existing.exists && k in existing.data()) payload[k] = admin.firestore.FieldValue.delete();
  });
  await ref.set(payload, { merge: true });
}

module.exports = { BASELINE_CURVE, MIRRORED_FIELDS, categoryShares, convertLegacyBaseline, ensureBaseline, playerOf, rankIdxOfTotal, readExpTotals, writeLeaderboardEntry };

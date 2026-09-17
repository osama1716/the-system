// Weekly races between friends: who may challenge whom, and how a race is
// scored.
//
// Pure, so tests/test-races.js can hold it. A race is races/{id} =
// { users: [a, b] (sorted), challenger, opponent, metric: "total" | an
// intelligence key, status: "pending" | "active" | "done" | "declined" |
// "cancelled" | "expired", createdAt, startAt, endAt, scores, winner }.
// Server-written only; each side reads its own.
//
// The score is read from the EXP journal (users/{uid}/expEvents), never from
// the app: what each side earned between the start and the end. A race on
// one intelligence counts only EXP whose price the server recorded with that
// intelligence (prices from before types were recorded count in total races
// only). An admin's adjustment is nobody's effort and counts in neither.

const RACE_DAYS = 7;
const PENDING_DAYS = 3;
const MAX_OPEN = 5;
const CHALLENGES_PER_DAY = 10;
const DAY_MS = 86400000;

function metricOk(metric, categoryKeys) {
  return metric === "total" || (typeof metric === "string" && (categoryKeys || []).indexOf(metric) >= 0);
}

function windowFrom(acceptedMs) {
  return { startAt: acceptedMs, endAt: acceptedMs + RACE_DAYS * DAY_MS };
}

// What one journal entry adds to a race score.
//   event: { delta, source, priceId, server }
//   types: the intelligences its price was recorded with, or null
function contribution(event, types, metric, countUnverified) {
  const delta = Number(event && event.delta) || 0;
  if (!delta) return 0;
  if (/^Adjustment/.test(String(event.source || ""))) return 0;
  if (event.server !== true && !countUnverified) return 0;
  if (metric === "total") return delta;
  const list = Array.isArray(types) ? types : [];
  if (!list.length || list.indexOf(metric) < 0) return 0;
  // Split evenly across the task's intelligences, as the app splits EXP.
  return delta / list.length;
}

function scoreOf(events, typesByPrice, metric, countUnverified) {
  const total = (events || []).reduce((sum, e) => sum + contribution(e, e && e.priceId ? (typesByPrice || {})[e.priceId] : null, metric, countUnverified), 0);
  return Math.round(total);
}

// { winner: uid | null } — null is a tie.
function outcome(a, b, scores) {
  const sa = Number(scores[a]) || 0, sb = Number(scores[b]) || 0;
  return { winner: sa === sb ? null : sa > sb ? a : b };
}

// Whether `me` may challenge `them` now.
//   "ok" | "self" | "not-friends" | "blocked-by" | "you-blocked" |
//   "already-open" | "too-many"
function decideChallenge(input) {
  const { me, them, friends, blockedBy, youBlocked, openBetween, openCount } = input;
  if (!me || !them || me === them) return "self";
  if (blockedBy) return "blocked-by";
  if (youBlocked) return "you-blocked";
  if (!friends) return "not-friends";
  if (openBetween) return "already-open";
  if ((Number(openCount) || 0) >= MAX_OPEN) return "too-many";
  return "ok";
}

module.exports = { RACE_DAYS, PENDING_DAYS, MAX_OPEN, CHALLENGES_PER_DAY, DAY_MS, metricOk, windowFrom, contribution, scoreOf, outcome, decideChallenge };

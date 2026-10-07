// Seasons: eight weeks each, back to back, from a start not set yet.
//
// A season is a board, not a ladder: the EXP earned inside it, on the same
// ranking rows as the week's, and the reward at its end goes by where you
// finish. Nothing about a person's rank G..S changes with it.
//
// SEASON_START_MS is null until the first season is scheduled: nothing is
// counted and the app shows the season as coming. A run between 5 and 7
// October 2026 was a test; its rows carry seasonKey "S1", and real keys
// carry their start day ("S1@2026-12-07") so the two can never mix.
//
// MUST match SYS.SEASON_* in js/constants.js (tests/test-season.js holds the
// two together).
"use strict";

const SEASON_START_MS = null; // e.g. Date.UTC(2026, 11, 7): a Monday, 00:00 UTC
const SEASON_DAYS = 56;
const DAY_MS = 86400000;

// The season a moment belongs to: 1, 2, 3 ... (0 before the first, or while
// none is scheduled).
function seasonOf(date, startMs) {
  const start = startMs === undefined ? SEASON_START_MS : startMs;
  if (start == null) return 0;
  const t = (date instanceof Date ? date : new Date(date)).getTime();
  if (t < start) return 0;
  return Math.floor((t - start) / (SEASON_DAYS * DAY_MS)) + 1;
}

function seasonBounds(n, startMs) {
  const s0 = startMs === undefined ? SEASON_START_MS : startMs;
  const start = s0 + (n - 1) * SEASON_DAYS * DAY_MS;
  return { start, end: start + SEASON_DAYS * DAY_MS };
}

// "S3@2027-04-05": the number and the day that season opened. Null outside
// a season.
function seasonKeyOf(date, startMs) {
  const n = seasonOf(date, startMs);
  if (!n) return null;
  return "S" + n + "@" + new Date(seasonBounds(n, startMs).start).toISOString().slice(0, 10);
}

// The season figure on a ranking row after an event of `delta`: added to
// this season's, or starting a new one. Nothing at all outside a season.
function nextSeason(row, sk, delta) {
  if (!sk) return {};
  const same = row && row.seasonKey === sk;
  return { seasonKey: sk, seasonExp: (same ? Number(row.seasonExp) || 0 : 0) + delta };
}

module.exports = { SEASON_START_MS, SEASON_DAYS, seasonOf, seasonKeyOf, seasonBounds, nextSeason };

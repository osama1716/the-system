// Seasons: eight weeks each, back to back, from Monday 5 October 2026 (UTC).
//
// A season is a board, not a ladder: the EXP earned inside it, on the same
// ranking rows as the week's, and the reward at its end goes by where you
// finish. Nothing about a person's rank G..S changes with it.
//
// MUST match SYS.SEASON_* in js/constants.js (tests/test-season.js holds the
// two together).
"use strict";

const SEASON_START_MS = Date.UTC(2026, 9, 5); // Monday 5 Oct 2026, 00:00 UTC
const SEASON_DAYS = 56;
const DAY_MS = 86400000;

// The season a moment belongs to: 1, 2, 3 … (0 before the first).
function seasonOf(date) {
  const t = (date instanceof Date ? date : new Date(date)).getTime();
  if (t < SEASON_START_MS) return 0;
  return Math.floor((t - SEASON_START_MS) / (SEASON_DAYS * DAY_MS)) + 1;
}

function seasonKeyOf(date) {
  return "S" + seasonOf(date);
}

function seasonBounds(n) {
  const start = SEASON_START_MS + (n - 1) * SEASON_DAYS * DAY_MS;
  return { start, end: start + SEASON_DAYS * DAY_MS };
}

// The season figure on a ranking row after an event of `delta`. A row that
// has never carried a season but has this week's EXP, in the first week of
// the very first season, starts from that week's figure: the first season
// opened before the row learned to count it, and that week is exactly what
// it missed.
function nextSeason(row, sk, delta, firstWeekKey) {
  const r = row || {};
  let base = 0;
  if (r.seasonKey === sk) base = Number(r.seasonExp) || 0;
  else if (!r.seasonKey && sk === "S1" && r.weekKey === firstWeekKey) base = Number(r.weekExp) || 0;
  return { seasonKey: sk, seasonExp: base + delta };
}

module.exports = { SEASON_START_MS, SEASON_DAYS, seasonOf, seasonKeyOf, seasonBounds, nextSeason };

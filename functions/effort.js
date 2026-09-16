// When a task may honestly be recorded as done.
//
// Two numbers come from the evaluator (progress.js cleanEstimates): the fewest
// hours of hands-on work a task needs, and the fewest calendar days that must
// pass. This module turns those into the only figure anybody sees — the moment
// a task unlocks — and into the ledger that stops a day holding more work than
// a day holds.
//
// The rule in one line: a day cannot contain more than DAILY_CAP_HOURS of
// effort, and no stretch of time can contain more effort than it has hours.
// Everything else here is bookkeeping around that.
//
// Deliberately pure. Timestamps arrive already converted to somebody's local
// day and minute-of-day (index.js does that with REMINDERS.localParts),
// because "which day was that" is a question about a person's timezone and
// this file should not hold an opinion about it.
"use strict";

// What a day can hold. Fourteen hours is generous on purpose: the estimates
// are minimums, so an hour of real work usually costs less than an hour of
// budget, and an honest person having an intense day must not be stopped.
const DAILY_CAP_HOURS = 14;

// The least any single completion costs its day. Without it the hour-based cap
// never touches trivial habits — a one-minute habit consumes nothing, so fifty
// of them would land in one day unchecked. Two minutes each means fifty fill
// under two hours, which is both survivable and honest.
const MIN_CHARGE_HOURS = 2 / 60;

// How far back the ledger is kept. Older days can no longer be charged by
// anything — a task opened today cannot spend last year's hours — so they are
// dead weight in the document.
const LEDGER_KEEP_DAYS = 120;

const MINUTES_PER_DAY = 1440;

// The day-key maths lives in progress.js and is used from there rather than
// written again here: two copies of "what day is it" is how the habit window
// and the effort ledger would quietly start disagreeing about a date.
const PROGRESS = require("./progress.js");
const shiftDayKey = PROGRESS.shiftDayKey;
const isDayKey = PROGRESS.isDayKey;

function daysBetween(fromKey, toKey) {
  return Math.round((new Date(toKey + "T00:00:00Z") - new Date(fromKey + "T00:00:00Z")) / 86400000);
}

// A point in somebody's own day: which day, and how many minutes into it.
function stamp(dayKey, minutes) {
  return { dayKey, minutes: Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(Number(minutes) || 0))) };
}

function chargedOn(charged, dayKey) {
  const v = Number(charged && charged[dayKey]);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function freeOn(charged, dayKey) {
  return Math.max(0, DAILY_CAP_HOURS - chargedOn(charged, dayKey));
}

// The hours of one day that lie inside the window from openedAt to at.
function windowHoursOn(dayKey, openedAt, at) {
  const first = dayKey === openedAt.dayKey;
  const last = dayKey === at.dayKey;
  if (first && last) return Math.max(0, at.minutes - openedAt.minutes) / 60;
  if (first) return (MINUTES_PER_DAY - openedAt.minutes) / 60;
  if (last) return at.minutes / 60;
  return 24;
}

// How much effort could honestly have gone into this task by `at`: the free
// capacity of every day it has been open, never more than the hours of that
// day the task has actually existed for.
function availableHours(openedAt, at, charged) {
  if (at.dayKey < openedAt.dayKey) return 0;
  let sum = 0;
  let day = openedAt.dayKey;
  for (let i = 0; i <= LEDGER_KEEP_DAYS && day <= at.dayKey; i++) {
    sum += Math.min(freeOn(charged, day), windowHoursOn(day, openedAt, at));
    day = shiftDayKey(day, 1);
  }
  return Math.round(sum * 1000) / 1000;
}

// The earliest moment `hours` of work could have been done, starting from
// openedAt, given what the other days already hold — and never before
// `minDays` whole days have passed.
//
// Walks day by day rather than solving in closed form: each day has a
// different amount left in it, so there is no single rate to divide by.
// Returns null if it cannot be reached inside the horizon, which a sane
// estimate never does.
function unlockAt(openedAt, hours, minDays, charged) {
  const need = Math.max(0, Number(hours) || 0);
  const days = Math.max(0, Math.round(Number(minDays) || 0));
  // The calendar half of the answer: the same time of day, that many days on.
  const byDays = stamp(shiftDayKey(openedAt.dayKey, days), openedAt.minutes);

  let byHours = stamp(openedAt.dayKey, openedAt.minutes);
  if (need > 0) {
    let left = need;
    let day = openedAt.dayKey;
    let reached = null;
    for (let i = 0; i <= LEDGER_KEEP_DAYS + 1; i++) {
      const startMinutes = day === openedAt.dayKey ? openedAt.minutes : 0;
      // What this day can still give: its free capacity, and never more than
      // the hours it has left after the task was opened.
      const roomHours = Math.min(freeOn(charged, day), (MINUTES_PER_DAY - startMinutes) / 60);
      if (left <= roomHours) {
        reached = stamp(day, startMinutes + left * 60);
        break;
      }
      left -= roomHours;
      day = shiftDayKey(day, 1);
    }
    if (!reached) return null;
    byHours = reached;
  }

  // Whichever comes later. A month-long challenge with two hours of work in it
  // unlocks at the month, not at the second hour.
  const later = (byDays.dayKey > byHours.dayKey ||
    (byDays.dayKey === byHours.dayKey && byDays.minutes > byHours.minutes)) ? byDays : byHours;
  return later;
}

function isUnlocked(openedAt, at, hours, minDays, charged) {
  const u = unlockAt(openedAt, hours, minDays, charged);
  if (!u) return false;
  return at.dayKey > u.dayKey || (at.dayKey === u.dayKey && at.minutes >= u.minutes);
}

// What one completion costs the day it lands on. A quest pays for the share of
// itself that was just finished; a habit repeat pays for one repeat. Both pay
// at least the minimum, so nothing is ever free.
function chargeFor(effortHours, share) {
  const hours = Math.max(0, Number(effortHours) || 0);
  const s = Number(share);
  const part = Number.isFinite(s) ? Math.max(0, Math.min(1, s)) : 1;
  return Math.max(MIN_CHARGE_HOURS, Math.round(hours * part * 1000) / 1000);
}

// Writing a charge into the ledger, earliest day first.
//
// Earliest-first costs the person least: a past day's capacity can never be
// used by a task opened later, while today's can, so spending the oldest hours
// first leaves the most room for whatever comes next.
//
// Returns { days, unplaced }. Anything that did not fit is handed back rather
// than forced in — the first version of this dumped the remainder onto the
// reported day, which meant thirty separate one-hour completions could charge
// one day thirty hours and the cap, the whole point of the file, quietly did
// nothing. A caller that gets unplaced > 0 must refuse the completion.
function spend(charged, openedAt, at, hours) {
  const next = {};
  Object.keys(charged || {}).forEach((k) => { if (isDayKey(k)) next[k] = chargedOn(charged, k); });
  let left = Math.max(0, Number(hours) || 0);
  let day = openedAt.dayKey;
  for (let i = 0; i <= LEDGER_KEEP_DAYS && day <= at.dayKey && left > 1e-9; i++) {
    const room = Math.min(freeOn(next, day), windowHoursOn(day, openedAt, at));
    if (room > 0) {
      const put = Math.min(room, left);
      next[day] = Math.round((chargedOn(next, day) + put) * 1000) / 1000;
      left = Math.round((left - put) * 1000) / 1000;
    }
    day = shiftDayKey(day, 1);
  }
  return { days: prune(next, at.dayKey), unplaced: left > 1e-9 ? left : 0 };
}

// Taking a charge back, latest day first — the mirror of spend, so undoing the
// thing just done returns the hours it just took.
function refund(charged, at, hours) {
  const next = {};
  Object.keys(charged || {}).forEach((k) => { if (isDayKey(k)) next[k] = chargedOn(charged, k); });
  let left = Math.max(0, Number(hours) || 0);
  const days = Object.keys(next).filter((k) => k <= at.dayKey).sort().reverse();
  for (const day of days) {
    if (left <= 1e-9) break;
    const take = Math.min(chargedOn(next, day), left);
    const rest = Math.round((chargedOn(next, day) - take) * 1000) / 1000;
    if (rest > 0) next[day] = rest; else delete next[day];
    left = Math.round((left - take) * 1000) / 1000;
  }
  return prune(next, at.dayKey);
}

function prune(charged, todayKey) {
  const oldest = shiftDayKey(todayKey, -LEDGER_KEEP_DAYS);
  const kept = {};
  Object.keys(charged).forEach((k) => { if (k >= oldest && charged[k] > 0) kept[k] = charged[k]; });
  return kept;
}

module.exports = {
  DAILY_CAP_HOURS, MIN_CHARGE_HOURS, LEDGER_KEEP_DAYS, MINUTES_PER_DAY,
  shiftDayKey, isDayKey, daysBetween, stamp,
  availableHours, unlockAt, isUnlocked, chargeFor, spend, refund, prune,
};

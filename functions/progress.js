// What reported progress on a priced task is worth — decided here, on the
// server, and never taken from the device.
//
// The app used to send the EXP it had granted itself ("+500 for this task"),
// and the server could only check that the number was not larger than the
// task's price. That stopped a single entry from being inflated, and nothing
// else: the same +500 could be sent again, and again. So the device now sends
// what happened — "this quest is at 60%", "this habit was done on the 14th" —
// and the server keeps a ledger per task of what it has already paid, and pays
// the difference. Sending the same report twice pays nothing the second time.
//
// Pure functions only, so they can be tested without Firebase. The callable
// that uses them is recordProgress in index.js.
"use strict";

// How far back a habit day may still be marked, counting today as day 0.
// Mirrors SYS.HABIT_BACKFILL_DAYS in js/engine.js; tests/test-progress.js
// holds the two to the same number.
const BACKFILL_DAYS = 3;

// Days older than this are dropped from a habit's ledger. Long enough that
// clearing a day from last year still returns exactly what it paid.
const LEDGER_KEEP_DAYS = 400;

function shiftDayKey(key, n) {
  const d = new Date(key + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isDayKey(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

function clampCompletion(c) {
  const n = Number(c);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}

// Exactly the engine's rule: a quest is worth its value times its completion,
// rounded down (applyTaskProgress in js/engine.js).
function questValue(pt, completion) {
  return Math.floor(Math.max(0, Number(pt) || 0) * (clampCompletion(completion) / 100));
}

// A ledger for a task the server has not seen a report for yet. `seeded` is
// what the old journal already recorded against this price, so a task that
// was finished before this ledger existed is not paid a second time.
//   quest: { kind, exp }            — EXP paid so far
//   habit: { kind, days, legacyExp } — EXP paid per day, plus a lump of
//                                      pre-ledger EXP with no days attached
function newLedger(kind, seeded) {
  const s = Math.max(0, Math.round(Number(seeded) || 0));
  return kind === "habit" ? { kind, days: {}, legacyExp: s } : { kind, exp: s };
}

function pruneDays(days, todayKey) {
  const oldest = shiftDayKey(todayKey, -LEDGER_KEEP_DAYS);
  const kept = {};
  Object.keys(days).forEach((k) => { if (k >= oldest) kept[k] = days[k]; });
  return kept;
}

// One report against one price. Returns the EXP to pay (negative to take
// back), the ledger to store, and whether the report was accepted.
//
//   price:  { pt, kind }                 — what the evaluator issued
//   ledger: see newLedger
//   report: { kind: "quest", completion } or { kind: "habit", day, done }
//   todayKey: the person's own date, "YYYY-MM-DD"
function settleReport(price, ledger, report, todayKey) {
  const pt = Math.max(0, Number(price && price.pt) || 0);
  const kind = price && price.kind === "habit" ? "habit" : "quest";
  const refuse = (reason) => ({ status: "refused", reason, delta: 0, ledger });

  // A quest's price cannot be spent as a habit, or the other way round —
  // editing a task from one to the other keeps its priceId, and a 1000-point
  // quest paid once a day would be the easiest cheat there is.
  if (!report || report.kind !== kind) return refuse("kind");

  if (kind === "quest") {
    const target = questValue(pt, report.completion);
    const paid = Math.max(0, Number(ledger.exp) || 0);
    return { status: "ok", delta: target - paid, ledger: { ...ledger, kind, exp: target } };
  }

  const key = report.day;
  if (!isDayKey(key)) return refuse("day");
  const days = { ...(ledger.days || {}) };

  if (report.done) {
    if (days[key]) return { status: "ok", delta: 0, ledger };
    if (key > todayKey) return refuse("future");
    if (key < shiftDayKey(todayKey, -BACKFILL_DAYS)) return refuse("too-old");
    days[key] = pt;
    return { status: "ok", delta: pt, ledger: { ...ledger, kind, days: pruneDays(days, todayKey) } };
  }

  // Clearing a day. Always allowed, however old: it only ever gives back.
  if (days[key]) {
    const back = days[key];
    delete days[key];
    return { status: "ok", delta: -back, ledger: { ...ledger, kind, days } };
  }
  // A day paid before this ledger existed has no entry of its own; it is
  // returned out of the lump the old journal recorded, never beyond it.
  const legacy = Math.max(0, Number(ledger.legacyExp) || 0);
  if (legacy > 0) {
    const back = Math.min(pt, legacy);
    return { status: "ok", delta: -back, ledger: { ...ledger, kind, days, legacyExp: legacy - back } };
  }
  return { status: "ok", delta: 0, ledger };
}

// The shape a report must have before it is looked at. Anything else is
// dropped rather than guessed at.
function cleanReport(r) {
  if (!r || typeof r !== "object") return null;
  if (typeof r.priceId !== "string" || !/^[A-Za-z0-9]{1,40}$/.test(r.priceId)) return null;
  const source = String(r.source || "").slice(0, 80);
  if (r.kind === "quest") {
    const c = Number(r.completion);
    if (!Number.isFinite(c)) return null;
    return { priceId: r.priceId, kind: "quest", completion: clampCompletion(c), source };
  }
  if (r.kind === "habit") {
    if (!isDayKey(r.day) || typeof r.done !== "boolean") return null;
    return { priceId: r.priceId, kind: "habit", day: r.day, done: r.done, source };
  }
  return null;
}

module.exports = {
  BACKFILL_DAYS, LEDGER_KEEP_DAYS,
  shiftDayKey, isDayKey, questValue, newLedger, settleReport, cleanReport,
};

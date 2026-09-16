// The reflection question: a big quest asks what the person actually did.
//
// The time lock (effort.js) stops a task being recorded sooner than the work
// could have been done. It cannot stop somebody waiting out the lock and
// pressing "done" without having done anything. For the quests where that
// pays the most — worth THRESHOLD_PT or more — the points are split in two,
// and each half is released by one short answer:
//   at 50%:  "what have you done so far?"
//   at 100%: "what did you take from it?"
// An honest person writes a sentence. Somebody who did nothing has to invent
// one, and leaves a record doing it.
//
// Pure functions only. The judging is an AI call (reflection-prompt.js) and
// the records live in Firestore (index.js); this file decides what they mean.
"use strict";

// Quests worth this much or more are gated. Below it the question costs a
// person more than the points it protects.
const THRESHOLD_PT = 300;

// Where the two questions sit. Each releases the half of the points before it.
const CHECKPOINTS = [50, 100];

// How many times a held answer may be rewritten and judged again. Every judge
// is a paid call, and three honest attempts is plenty; past that it waits for
// a person.
const MAX_ATTEMPTS = 3;

// How long a held answer waits for an admin before the AI looks again, more
// leniently. Nobody's points should sit frozen because nobody looked.
const ADMIN_WINDOW_DAYS = 5;

// Shorter than this is not an answer to "what did you do". Checked here as
// well as in the app, because the app is not the only thing that can call.
const MIN_ANSWER_CHARS = 8;
const MAX_ANSWER_CHARS = 600;

const DAY_MS = 86400000;

function isGated(price) {
  return !!price && price.kind !== "habit" && (Number(price.pt) || 0) >= THRESHOLD_PT;
}

function checkpointsFor(price) {
  return isGated(price) ? CHECKPOINTS.slice() : [];
}

function clampCompletion(c) {
  const n = Number(c);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}

// Same rounding as the rest of the app (progress.js questValue).
function valueAt(pt, completion) {
  return Math.floor(Math.max(0, Number(pt) || 0) * (clampCompletion(completion) / 100));
}

// What a quest may actually pay at this completion, given which halves have
// been released. Each half is independent: a rejected first answer forfeits
// the first half and nothing else.
//
//   reflections: { 50: { status }, 100: { status } }
function payableExp(price, completion, reflections) {
  const pt = Math.max(0, Number(price && price.pt) || 0);
  const c = clampCompletion(completion);
  if (!isGated(price)) return valueAt(pt, c);
  const r = reflections || {};
  const accepted = (cp) => !!(r[cp] && r[cp].status === "accepted");
  const firstHalf = valueAt(pt, Math.min(c, 50));
  const secondHalf = valueAt(pt, c) - firstHalf;
  return (accepted(50) ? firstHalf : 0) + (accepted(100) ? secondHalf : 0);
}

// What is being held back right now — shown as "waiting for your answer".
function heldExp(price, completion, reflections) {
  return valueAt(price && price.pt, completion) - payableExp(price, completion, reflections);
}

// The question this quest is waiting on, if any: the lowest checkpoint it has
// reached that has not been answered and accepted, rejected, or is not already
// held waiting for a person.
function dueCheckpoint(price, completion, reflections) {
  const c = clampCompletion(completion);
  const r = reflections || {};
  for (const cp of checkpointsFor(price)) {
    if (c < cp) return null;
    const status = r[cp] && r[cp].status;
    if (!status) return cp;
    if (status === "held" && canResubmit(r[cp])) return cp;
  }
  return null;
}

function cleanAnswer(s) {
  return String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, MAX_ANSWER_CHARS);
}

function answerLongEnough(s) {
  return cleanAnswer(s).length >= MIN_ANSWER_CHARS;
}

// A record after a judgment.
//   verdict: "accept" | "hold"
//   by:      "ai" | "ai-lenient" | "admin"
function afterJudge(record, verdict, reason, answer, nowMs, by) {
  const prev = record || {};
  const attempts = (Number(prev.attempts) || 0) + (by === "admin" ? 0 : 1);
  if (verdict === "accept") {
    return { ...prev, status: "accepted", answer: cleanAnswer(answer != null ? answer : prev.answer),
      reason: String(reason || "").slice(0, 300), attempts, decidedBy: by, decidedAt: nowMs };
  }
  return { ...prev, status: "held", answer: cleanAnswer(answer != null ? answer : prev.answer),
    reason: String(reason || "").slice(0, 300), attempts,
    // The clock for the admin window starts at the first hold and does not
    // restart when the answer is rewritten — otherwise rewriting it every four
    // days would keep it away from the lenient look for ever.
    heldAt: prev.heldAt || nowMs, decidedBy: by };
}

// An admin's decision is final either way.
function afterAdmin(record, accept, nowMs) {
  const prev = record || {};
  return { ...prev, status: accept ? "accepted" : "rejected", decidedBy: "admin", decidedAt: nowMs };
}

function canResubmit(record) {
  return !!record && record.status === "held" && (Number(record.attempts) || 0) < MAX_ATTEMPTS;
}

// Held, not decided by a person, and past the window.
function dueForLenient(record, nowMs) {
  return !!record && record.status === "held" && Number(record.heldAt) > 0 &&
    nowMs - Number(record.heldAt) >= ADMIN_WINDOW_DAYS * DAY_MS;
}

module.exports = {
  THRESHOLD_PT, CHECKPOINTS, MAX_ATTEMPTS, ADMIN_WINDOW_DAYS, MIN_ANSWER_CHARS, MAX_ANSWER_CHARS, DAY_MS,
  isGated, checkpointsFor, payableExp, heldExp, dueCheckpoint,
  cleanAnswer, answerLongEnough, afterJudge, afterAdmin, canResubmit, dueForLenient,
};

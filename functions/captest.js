// The capability tests (2026-10-22): what a person can do, measured inside the
// app and scored here, kept apart from the EXP, which measures what they did.
// Only the memory test so far.
//
// Memory is a forward digit span: digits appear one at a time, a second each,
// and are typed back in order. It starts at three digits. A right answer moves
// to one digit more; a wrong one gets a second sequence of the same length, and
// a second wrong one ends the test. The score is the longest length answered
// right. The server makes every sequence, so it knows each answer, and the
// device only reports what was typed and how long it took.
//
// Pure functions only, so they can be tested without Firebase. The callables
// are startMemoryTest and finishMemoryTest in api/capability.js.
"use strict";

const MEMORY = {
  start: 3,
  max: 12,
  showMs: 800,           // a digit on screen…
  gapMs: 200,            // …and a gap: one a second
  answerBaseMs: 8000,    // time to type the answer back: this, plus…
  answerPerDigitMs: 1500, // …this much for each digit
  tooFastPerDigitMs: 100, // faster than this a digit is not a person typing
  leftLimit: 3,          // leaving the app this many times voids the test
  sessionMinutes: 20,    // a started test is gone after this
  cooldownDays: 7,       // one counted test a week
  retryHours: 24,        // after a void test, or one that waits to be confirmed
  jump: 3,               // a rise this large over the counted span waits for a retake
  rareSpan: 10,          // a first span this long waits for a retake too
  minBand: 30,           // people in an age band before a share of them is shown
  keepHistory: 10,
};

// Age bands, so a person is compared with people their own age.
const AGE_BANDS = ["13-17", "18-24", "25-34", "35-44", "45-54", "55+"];

const DAY = 86400000, HOUR = 3600000;

function answerLimitMs(len) {
  return MEMORY.answerBaseMs + MEMORY.answerPerDigitMs * len;
}

// One sequence: no digit twice in a row, no digit more than twice, and no run
// of three that steps by one (123, 765), which would be remembered as one item.
function makeSequence(len, rand) {
  for (;;) {
    const s = [];
    const used = {};
    let ok = true;
    for (let i = 0; i < len && ok; i++) {
      let d, tries = 0;
      do {
        d = Math.floor(rand() * 10);
        tries++;
      } while (tries < 50 && (
        d === s[i - 1] ||
        (used[d] || 0) >= 2 ||
        (i >= 2 && s[i - 1] - s[i - 2] === d - s[i - 1] && Math.abs(d - s[i - 1]) === 1)
      ));
      if (tries >= 50) ok = false;
      s.push(d);
      used[d] = (used[d] || 0) + 1;
    }
    if (ok) return s.join("");
  }
}

// Two sequences for every length the test can reach.
function makeSequences(rand) {
  const seqs = {};
  for (let len = MEMORY.start; len <= MEMORY.max; len++) seqs[len] = [makeSequence(len, rand), makeSequence(len, rand)];
  return seqs;
}

// What the device receives: not the digits as they are, so they are not lying
// in plain sight in the network panel. Anyone determined can still undo it; the
// test's protection is the server scoring and timing it, not this.
function keyOf(sessionId) {
  return String(sessionId).split("").map((c) => c.charCodeAt(0) % 10);
}
function pack(seqs, sessionId) {
  const k = keyOf(sessionId);
  const out = {};
  for (const len of Object.keys(seqs)) {
    out[len] = seqs[len].map((s, j) => s.split("").map((d, i) => (Number(d) + k[(i + j * 7 + Number(len)) % k.length]) % 10).join(""));
  }
  return out;
}
function unpack(packed, sessionId) {
  const k = keyOf(sessionId);
  const out = {};
  for (const len of Object.keys(packed)) {
    out[len] = packed[len].map((s, j) => s.split("").map((d, i) => (Number(d) - k[(i + j * 7 + Number(len)) % k.length] + 10) % 10).join(""));
  }
  return out;
}

// The step rule. The app has its own copy (js/main-captest.js) to choose the
// next sequence; tests/test-captest.js holds the two to the same answers.
function next(len, attempt, correct) {
  if (correct) return len >= MEMORY.max ? null : { len: len + 1, attempt: 0 };
  if (attempt === 0) return { len, attempt: 1 };
  return null;
}

// The device's account of the test, checked against the sequences made here.
// Every trial must be the one the rule called for next, and the test must end
// where the rule ends it. Returns { ok, span, reason, left }.
function score(seqs, trials) {
  if (!Array.isArray(trials) || !trials.length || trials.length > 2 * (MEMORY.max - MEMORY.start + 1)) {
    return { ok: false, reason: "shape" };
  }
  let expect = { len: MEMORY.start, attempt: 0 };
  let span = 0, left = 0;
  for (const tr of trials) {
    if (left >= MEMORY.leftLimit) return { ok: false, reason: "left", left };
    if (!expect) return { ok: false, reason: "extra" };
    if (!tr || tr.len !== expect.len || tr.attempt !== expect.attempt) return { ok: false, reason: "order" };
    const answer = typeof tr.answer === "string" ? tr.answer : "";
    const ms = Number(tr.ms);
    if (!/^[0-9]{0,12}$/.test(answer) || !Number.isFinite(ms) || ms < 0) return { ok: false, reason: "shape" };
    if (tr.left) left++;
    // A full answer typed faster than a person can is a script, not a memory.
    if (answer.length === tr.len && ms < MEMORY.tooFastPerDigitMs * tr.len) return { ok: false, reason: "too-fast" };
    const inTime = ms <= answerLimitMs(tr.len) + 2000;
    const correct = !tr.left && inTime && answer === seqs[tr.len][tr.attempt];
    if (correct) span = Math.max(span, tr.len);
    expect = next(tr.len, tr.attempt, correct);
  }
  // The app stops the test at the third time it is left, before the rule would.
  if (left >= MEMORY.leftLimit) return { ok: false, reason: "left", left };
  if (expect) return { ok: false, reason: "unfinished" };
  return { ok: true, span, left };
}

// The least time the claimed trials could have taken: the digits alone are on
// screen a second each. A finish that arrives sooner did not show them.
function minElapsedMs(trials) {
  return (trials || []).reduce((s, tr) => s + (Number(tr && tr.len) || 0) * (MEMORY.showMs + MEMORY.gapMs), 0);
}

// Whether a test may start now, from what is kept for this person.
function canStart(m, now) {
  if (m && m.nextAt && now < m.nextAt) return { ok: false, nextAt: m.nextAt };
  return { ok: true };
}

// What a valid result does: counted at once, or held until a retake agrees
// with it — a rise this large is more often a note on paper than a better
// memory. Returns { counted, pending, nextAt }.
function decide(m, span, now) {
  const counted = m && m.counted;
  const pending = m && m.pending;
  const confirms = pending && Math.abs(span - pending.span) <= 1;
  const suspicious = counted ? span >= counted.span + MEMORY.jump : span >= MEMORY.rareSpan;
  if (!confirms && suspicious) return { counted: false, pending: true, nextAt: now + MEMORY.retryHours * HOUR };
  return { counted: true, pending: false, nextAt: now + MEMORY.cooldownDays * DAY };
}

// Where a span stands among the counted spans of one age band: the share of
// people with a shorter span, plus half of those level with it. Null until the
// band holds enough people for the number to mean something.
function share(hist, span) {
  let below = 0, level = 0, n = 0;
  for (const [k, v] of Object.entries(hist || {})) {
    const c = Number(v) || 0;
    n += c;
    if (Number(k) < span) below += c;
    else if (Number(k) === span) level += c;
  }
  if (n < MEMORY.minBand) return { pct: null, n };
  return { pct: Math.round(100 * (below + level / 2) / n), n };
}

module.exports = { MEMORY, AGE_BANDS, answerLimitMs, makeSequence, makeSequences, pack, unpack, next, score, minElapsedMs, canStart, decide, share };

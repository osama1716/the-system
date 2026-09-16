// Accounts that behave in ways honest use does not.
//
// Every earlier phase makes one kind of cheating impossible or pointless: the
// server computes EXP, a day holds fourteen hours, a big quest asks what was
// done. What is left is a pattern that no single check can see — somebody who
// fills every day to the cap for a week, or ticks off a month of habits in one
// minute. None of these proves anything on its own. Each is enough to take an
// account off the public ranking until a person has looked, which is the whole
// consequence: points are never touched here.
//
// Pure functions only. index.js keeps the evidence (suspicion/{uid}) and acts
// on what these return.
"use strict";

const DAY_MS = 86400000;

// Each signal: how strong the evidence must be, and whether it hides the
// account or only tells an admin.
const SIGNALS = {
  // More than twelve hours of effort a day, five days running. The cap is
  // fourteen, and the estimates are minimums, so a real person working this
  // much is possible for a day or two — not for a week.
  effortStreak: { heavyHours: 12, days: 5, lookbackDays: 30, hides: true },

  // Ten or more past habit days marked within one minute. Filling in a
  // forgotten day or two is normal; a month in sixty seconds is not.
  backfillBurst: { count: 10, windowMs: 60 * 1000, hides: true },

  // More EXP in a single day than the caps can honestly produce. Fourteen
  // hours at the scale's best rate is well under this; the margin is there so
  // an accepted answer releasing a large half on a busy day stays clear of it.
  dailyExp: { ceiling: 2500, lookbackDays: 7, hides: true },

  // Two answers rejected within a month. One can be a misunderstanding.
  rejections: { count: 2, windowDays: 30, hides: true },

  // Most recent quest completions landing within a couple of minutes of their
  // unlock time. Deliberately NOT hiding: the app tells people when a task
  // opens, so somebody who finished early and pressed the moment it opened
  // looks exactly like this. It only tells an admin.
  unlockRush: { withinMinutes: 2, sample: 10, count: 7, hides: false },
};

function shiftDayKey(key, n) {
  const d = new Date(key + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// A day's evidence is dated at the START of that day. Dated at its end, a
// restore made at noon was older than the evidence it had just reviewed, so
// the very next report raised the same flag again and "restore" never held.
function dayStartMs(key) {
  return new Date(key + "T00:00:00Z").getTime();
}

// The longest run of consecutive heavy days in the lookback, ending anywhere.
function effortStreak(days, todayKey) {
  const s = SIGNALS.effortStreak;
  let best = 0, run = 0, lastDay = null;
  for (let i = s.lookbackDays - 1; i >= 0; i--) {
    const key = shiftDayKey(todayKey, -i);
    const hours = Number(days && days[key]) || 0;
    if (hours > s.heavyHours) {
      run++;
      if (run > best) { best = run; lastDay = key; }
    } else {
      run = 0;
    }
  }
  if (best < s.days) return null;
  return { code: "effortStreak", hides: s.hides, detail: best + " days over " + s.heavyHours + "h", evidenceAt: dayStartMs(lastDay) };
}

// Any sixty-second window holding the burst count.
function backfillBurst(times) {
  const s = SIGNALS.backfillBurst;
  const sorted = (Array.isArray(times) ? times : []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  for (let i = 0; i + s.count - 1 < sorted.length; i++) {
    if (sorted[i + s.count - 1] - sorted[i] <= s.windowMs) {
      return { code: "backfillBurst", hides: s.hides,
        detail: s.count + "+ past days marked within a minute", evidenceAt: sorted[i + s.count - 1] };
    }
  }
  return null;
}

function dailyExp(expByDay, todayKey) {
  const s = SIGNALS.dailyExp;
  for (let i = 0; i < s.lookbackDays; i++) {
    const key = shiftDayKey(todayKey, -i);
    const exp = Number(expByDay && expByDay[key]) || 0;
    if (exp > s.ceiling) {
      return { code: "dailyExp", hides: s.hides, detail: exp + " EXP on " + key, evidenceAt: dayStartMs(key) };
    }
  }
  return null;
}

// decidedAt timestamps of rejected answers.
function rejections(decidedTimes, nowMs) {
  const s = SIGNALS.rejections;
  const recent = (Array.isArray(decidedTimes) ? decidedTimes : []).map(Number)
    .filter((t) => Number.isFinite(t) && nowMs - t <= s.windowDays * DAY_MS);
  if (recent.length < s.count) return null;
  return { code: "rejections", hides: s.hides, detail: recent.length + " answers rejected in " + s.windowDays + " days",
    evidenceAt: Math.max(...recent) };
}

// entries: [{ minutesAfterUnlock, at }], newest last.
function unlockRush(entries) {
  const s = SIGNALS.unlockRush;
  const list = (Array.isArray(entries) ? entries : []).slice(-s.sample);
  if (list.length < s.sample) return null;
  const close = list.filter((e) => Number(e.minutesAfterUnlock) >= 0 && Number(e.minutesAfterUnlock) <= s.withinMinutes);
  if (close.length < s.count) return null;
  return { code: "unlockRush", hides: s.hides,
    detail: close.length + " of the last " + s.sample + " quests recorded within " + s.withinMinutes + " min of opening",
    evidenceAt: Math.max(...list.map((e) => Number(e.at) || 0)) };
}

// Every signal against one account's evidence.
function evaluate(evidence, todayKey, nowMs) {
  const e = evidence || {};
  return [
    effortStreak(e.effortDays, todayKey),
    backfillBurst(e.backfills),
    dailyExp(e.expByDay, todayKey),
    rejections(e.rejectedAt, nowMs),
    unlockRush(e.unlockGaps),
  ].filter(Boolean);
}

// The account's flag after a new evaluation.
//
// A reason only counts if its evidence is newer than the last time an admin
// cleared the account — otherwise restoring somebody would be undone by the
// very same data on their next report, and "restore" would mean nothing.
//
// Returns { flag, alert }: the flag to store, and the reasons that are new
// enough to be worth telling an admin about (empty when nothing changed).
function nextFlag(previous, reasons, nowMs) {
  const prev = previous || {};
  const clearedAt = Number(prev.clearedAt) || 0;
  const live = (reasons || []).filter((r) => (Number(r.evidenceAt) || 0) > clearedAt);
  const known = new Set((prev.reasons || []).map((r) => r.code));
  const fresh = live.filter((r) => !known.has(r.code));
  const reasonsNow = [...(prev.reasons || []).filter((r) => (Number(r.evidenceAt) || 0) > clearedAt), ...fresh];
  const hidden = !!prev.hidden || fresh.some((r) => r.hides);
  const flagged = reasonsNow.length > 0;
  return {
    flag: {
      flagged,
      hidden: flagged && hidden,
      reasons: reasonsNow.map((r) => ({ code: r.code, hides: !!r.hides, detail: String(r.detail || "").slice(0, 160), evidenceAt: Number(r.evidenceAt) || 0 })),
      flaggedAt: fresh.length && !prev.flagged ? nowMs : (Number(prev.flaggedAt) || (flagged ? nowMs : 0)),
      clearedAt,
    },
    alert: fresh,
  };
}

// An admin's decision. Restoring clears the flag and remembers when, so only
// newer evidence can raise it again; keeping it hidden just records the look.
function afterReview(previous, restore, nowMs) {
  const prev = previous || {};
  if (restore) return { ...prev, flagged: false, hidden: false, reasons: [], clearedAt: nowMs, reviewedAt: nowMs };
  return { ...prev, reviewedAt: nowMs };
}

// Bounded evidence lists, so a busy account's document cannot grow for ever.
function pushBounded(list, item, max) {
  return [...(Array.isArray(list) ? list : []), item].slice(-max);
}

module.exports = {
  SIGNALS, DAY_MS,
  effortStreak, backfillBurst, dailyExp, rejections, unlockRush,
  evaluate, nextFlag, afterReview, pushBounded, shiftDayKey,
};

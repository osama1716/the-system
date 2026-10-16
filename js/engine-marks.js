// Game rules: the long memory — each habit's marks and seals over years.
// One of the files engine.js was split into (2026-10-16); the names they share travel through
// SYS._engine, and each file takes what it needs from the files loaded before it.
(function (SYS) {
  "use strict";
  const E = SYS._engine || (SYS._engine = {});
  const { dateKey, habitAmountOn, habitDays, habitDoneOn, habitGoalBase, isDayKey, isDueOn, isQuota, parseKey, quotaAskedOn, shiftDay, todayKey } = E;

  // Calendar week (Mon–Sun) `weekOffset` weeks from the one containing today
  // — 0 is this week, -1 last week, +1 next week, etc.
  // ---------- The long memory ---------------------------------------------
  //
  // Two memories, not one.
  //
  // The detailed one is `task.days`: amounts, notes, slips. It is pruned to
  // 120 days because the whole state travels as a single Firestore document
  // with a one-megabyte ceiling, so it cannot hold years.
  //
  // The second is one character per day per habit — all a calendar ring or a
  // year grid actually needs. A full year of twenty habits costs about seven
  // kilobytes, and it rides along in the document that already syncs, so it
  // costs nothing to send either.
  //
  //   "."      nothing was asked of that day
  //   "-"      it was asked, and none of it was done
  //   "0".."9" it was asked, and this tenth of it was done
  //   "+"      it was done
  //
  // The digits are what let a ring show half a litre of two as half a ring
  // rather than as nothing. A tenth is all the precision a ring that size can
  // show, and it still costs exactly one character — today and any unsealed
  // day are worked out exactly anyway, so the rounding only ever applies to
  // history.
  //
  // A quota habit ("three times a week") asks nothing of any particular day,
  // so it is "." on the days it is not done and "+" on the days it is. That
  // is the rule chosen deliberately: a quota can lift a day and can never
  // spoil one, because a Tuesday you were never asked to train on is not a
  // Tuesday you failed.
  const MARK_NONE = ".", MARK_MISSED = "-", MARK_DONE = "+";
  // Two years of grid. The year picker offers this year and last; keeping
  // more would be storage nobody can look at.
  const MARK_YEARS = 2;
  // A cap on the sealing loop, so a habit with an ancient createdAt cannot
  // turn one load into a hundred thousand iterations.
  const MARK_SEAL_MAX_DAYS = 800;

  // Day of the year, 1-based. Used as the index into a year's string.
  function dayOfYear(key) {
    const d = parseKey(key);
    const start = new Date(d.getFullYear(), 0, 1);
    return Math.round((d - start) / 86400000) + 1;
  }
  function daysInYear(year) { return ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 366 : 365; }

  // Archiving stops a habit's future without rewriting its past: it is no
  // longer asked for from the day it was archived, and every day before that
  // still counts exactly as it did. Anything else would mean tidying a habit
  // away changed what your last six months looked like.
  function isArchivedOn(task, key) {
    if (!task || !task.archived) return false;
    const at = task.archivedAt;
    return isDayKey(at) ? key >= at : true;
  }
  SYS.isArchivedOn = isArchivedOn;
  function isArchived(task) { return !!(task && task.archived); }
  SYS.isArchived = isArchived;

  // What a day is worth to one habit, worked out from the habit itself.
  // Deliberately not read from `task.days`: a day that was required and
  // simply skipped has no entry at all, and that day is the whole reason the
  // ring is not always full.
  function computeMark(task, key) {
    if (!task || !task.recurring) return MARK_NONE;
    if (key > todayKey()) return MARK_NONE;
    if (habitDoneOn(task, key)) return MARK_DONE;
    if (isArchivedOn(task, key)) return MARK_NONE;
    // A quota asks nothing of a named day while there is still room to fit
    // it in; from the day the times still owed equal the days left in the
    // window, every day is asked for. Before that it can lift a day and never
    // spoil one.
    if (isQuota(task) ? !quotaAskedOn(task, key) : !isDueOn(task, key)) return MARK_NONE;
    const goal = habitGoalBase(task);
    const frac = goal > 0 ? habitAmountOn(task, key) / goal : 0;
    if (frac >= 1) return MARK_DONE;
    if (frac <= 0) return MARK_MISSED;
    return String(Math.min(9, Math.floor(frac * 10)));
  }
  SYS.computeMark = computeMark;

  // The exact fraction of a day, for any day still in the detailed history.
  //
  // A mark is one character and therefore one tenth, which is all a sealed day
  // can afford. But while the day itself is still here the real number is
  // right there in it, and rounding 1.1 litres of 2 down to 50% is wrong in
  // the one place the person can check it against the habit card.
  //
  // Null when there is nothing to be exact about, so the caller falls back to
  // the mark.
  function exactFraction(task, key) {
    const day = habitDays(task)[key];
    if (!day) return null;
    const goal = habitGoalBase(task);
    if (!(goal > 0)) return null;
    return Math.min(1, Math.max(0, (Number(day.amount) || 0) / goal));
  }
  SYS.exactFraction = exactFraction;

  // The fraction to show for one habit on one day: exact while the day is
  // still kept in full, and the mark's tenth once it is not.
  function dayFraction(task, key, mark) {
    if (mark === MARK_DONE) return 1;
    const exact = exactFraction(task, key);
    return exact === null ? markFraction(mark) : exact;
  }
  SYS.dayFraction = dayFraction;

  // How much of a day one mark stands for. A digit is a floor rather than a
  // midpoint: reporting 90% as 95% would be inventing progress.
  function markFraction(mark) {
    if (mark === MARK_DONE) return 1;
    if (mark >= "0" && mark <= "9") return Number(mark) / 10;
    return 0;
  }
  SYS.markFraction = markFraction;
  function markAsked(mark) { return mark !== MARK_NONE; }
  SYS.markAsked = markAsked;

  function marksFor(task, year) {
    const all = (task && task.marks && typeof task.marks === "object") ? task.marks : {};
    const s = typeof all[year] === "string" ? all[year] : "";
    const n = daysInYear(year);
    return s.length >= n ? s.slice(0, n) : s + MARK_NONE.repeat(n - s.length);
  }

  function writeMark(task, key, mark) {
    const d = parseKey(key);
    const year = String(d.getFullYear());
    const idx = dayOfYear(key) - 1;
    const s = marksFor(task, year);
    if (s[idx] === mark) return false;
    task.marks = { ...(task.marks || {}) };
    task.marks[year] = s.slice(0, idx) + mark + s.slice(idx + 1);
    return true;
  }

  // The first day this habit could possibly have a mark on: whichever is
  // later of when it was made and the oldest year the grid keeps.
  function habitFirstDay(task) {
    const floor = dateKey(shiftDate(new Date(), -(MARK_YEARS * 366)));
    const made = task && task.createdAt ? dateKey(new Date(task.createdAt)) : null;
    const logged = Object.keys(habitDays(task)).sort()[0] || null;
    const candidates = [made, logged].filter(isDayKey).sort();
    const first = candidates[0] || todayKey();
    return first < floor ? floor : first;
  }
  SYS.habitFirstDay = habitFirstDay;

  function shiftDate(date, delta) {
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    return d;
  }

  // Writes down every past day's mark, once, up to yesterday. Today is never
  // sealed — it is still being lived, and a day in progress judged as missed
  // would be a lie for as long as the day lasts.
  //
  // Sealing freezes the judgement: a day already written down is not
  // re-judged when the schedule or the target changes later. That is the
  // honest way round — changing "every day" to "Mondays only" must not turn
  // last month's missed days into days nothing was asked of.
  //
  // Idempotent, which it has to be: this runs inside normalizeState on both
  // the local and the pulled copy before the two are compared.
  function sealMarks(task) {
    if (!task || !task.recurring) return false;
    const yesterday = dateKey(shiftDate(new Date(), -1));
    let from = isDayKey(task.sealedTo) ? dateKey(shiftDate(parseKey(task.sealedTo), 1)) : habitFirstDay(task);
    if (from > yesterday) return false;
    let changed = false, cursor = from, steps = 0;
    while (cursor <= yesterday && steps < MARK_SEAL_MAX_DAYS) {
      if (writeMark(task, cursor, computeMark(task, cursor))) changed = true;
      cursor = shiftDay(cursor, 1);
      steps++;
    }
    const sealedTo = shiftDay(cursor, -1);
    if (task.sealedTo !== sealedTo) { task.sealedTo = sealedTo; changed = true; }
    return changed;
  }
  SYS.sealMarks = sealMarks;

  // Years beyond the two the grid offers are dropped.
  function pruneMarks(task) {
    if (!task || !task.marks || typeof task.marks !== "object") return false;
    const thisYear = new Date().getFullYear();
    const keep = {};
    let changed = false;
    Object.keys(task.marks).forEach((y) => {
      const n = Number(y);
      if (Number.isFinite(n) && n > thisYear - MARK_YEARS && n <= thisYear) keep[y] = task.marks[y];
      else changed = true;
    });
    if (changed) task.marks = keep;
    return changed;
  }
  SYS.pruneMarks = pruneMarks;

  // One habit's verdict on one day. Sealed days are read; today and anything
  // not yet sealed is worked out live, so the ring fills as the day goes.
  function markOn(task, key) {
    if (!isDayKey(key)) return MARK_NONE;
    if (key > todayKey()) return MARK_NONE;
    if (!isDayKey(task && task.sealedTo) || key > task.sealedTo) return computeMark(task, key);
    if (key < habitFirstDay(task)) return MARK_NONE;
    return marksFor(task, String(parseKey(key).getFullYear()))[dayOfYear(key) - 1] || MARK_NONE;
  }
  SYS.markOn = markOn;

  Object.assign(E, { MARK_NONE, MARK_MISSED, MARK_DONE, MARK_YEARS, MARK_SEAL_MAX_DAYS, dayOfYear, daysInYear, isArchivedOn, isArchived, computeMark, exactFraction, dayFraction, markFraction, markAsked, marksFor, writeMark, habitFirstDay, shiftDate, sealMarks, pruneMarks, markOn });
})(window.SYS = window.SYS || {});

// Game rules: habits day by day — logging, quitting, notes, amounts, streaks, the week strip.
// One of the files engine.js was split into (2026-10-16); the names they share travel through
// SYS._engine, and each file takes what it needs from the files loaded before it.
(function (SYS) {
  "use strict";
  const E = SYS._engine || (SYS._engine = {});
  // Defined in a file that loads after this one; looked up when called.
  const dateKey = (...args) => E.dateKey(...args);
  const isDueOn = (...args) => E.isDueOn(...args);
  const isQuota = (...args) => E.isQuota(...args);
  const periodBounds = (...args) => E.periodBounds(...args);
  const periodKept = (...args) => E.periodKept(...args);
  const todayKey = (...args) => E.todayKey(...args);
  const unlogHabitDay = (...args) => E.unlogHabitDay(...args);

  // ---- habits, day by day -------------------------------------------------
  //
  // A habit used to be "N repeats a week" with no idea which days they fell
  // on: seven logged on one Saturday counted as a full week. It is one tick
  // per day now, and which days those are is the schedule's business —
  // see "schedules" below.
  //
  // days is { "YYYY-MM-DD": { n, amount } }. n is how many EXP grants
  // that date carries — always 1 for anything logged from here on, but a day
  // migrated from the old model can hold several, and undo has to be able to
  // give back exactly what was given. That is the whole reason it is a count
  // and not a boolean.
  const HABIT_DAY_RETENTION = 120;

  function habitDays(task) {
    return (task && task.days && typeof task.days === "object") ? task.days : {};
  }
  SYS.habitDays = habitDays;

  function habitDoneOn(task, key) {
    const d = habitDays(task)[key];
    return !!(d && d.n > 0);
  }
  SYS.habitDoneOn = habitDoneOn;

  // ---- quitting something ------------------------------------------------
  //
  // Every habit so far has been "do this". A quit habit is "don't", and the
  // difference is that success is the absence of an event — there is no
  // moment to press a button on.
  //
  // Rather than invent one, it keeps the same shape as every other habit: a
  // day is worth one repeat, and marking it clean is the action that pays.
  // That means the EXP ledger, the undo, the streak and the schedule all work
  // unchanged; the only new idea is a slip.
  //
  // A slip is recorded on the day, takes back whatever that day was paid, and
  // breaks the streak on the spot. It is deliberately something you press
  // rather than something inferred: the app cannot know, and a quit habit
  // that quietly credits you for days you never thought about is not
  // measuring anything.
  function isQuitHabit(task) { return !!(task && task.recurring && task.quit); }
  SYS.isQuitHabit = isQuitHabit;

  function habitSlipOn(task, key) { return !!(habitDays(task)[key] || {}).slip; }
  SYS.habitSlipOn = habitSlipOn;

  // Records a slip. Clears the day first so the EXP a clean day was paid is
  // given back — the ledger has to move both ways — and keeps the note,
  // because "why" is the most useful thing about a slip.
  function markSlip(state, taskId, dayKey) {
    const t = (state.tasks || []).find((x) => x.id === taskId);
    if (!t || !t.recurring) return [];
    const key = dayKey || todayKey();
    if (key > todayKey()) return [{ kind: "info", text: "That day hasn't happened yet." }];
    const notifications = unlogHabitDay(state, taskId, key);
    const days = { ...habitDays(t) };
    days[key] = { ...(days[key] || { n: 0, amount: 0 }), n: 0, amount: 0, slip: true };
    t.days = days;
    pruneHabitDays(t);
    return notifications;
  }
  SYS.markSlip = markSlip;

  // Undoes the record of a slip, leaving the day undecided again. The day
  // itself goes only if there is nothing else on it.
  function clearSlip(state, taskId, dayKey) {
    const t = (state.tasks || []).find((x) => x.id === taskId);
    if (!t || !t.recurring) return [];
    const key = dayKey || todayKey();
    const day = habitDays(t)[key];
    if (!day || !day.slip) return [];
    const days = { ...habitDays(t) };
    const kept = { ...day };
    delete kept.slip;
    if (kept.n > 0 || (Number(kept.amount) || 0) > 0 || dayNote(kept)) days[key] = kept;
    else delete days[key];
    t.days = days;
    return [];
  }
  SYS.clearSlip = clearSlip;

  // A day's note. Kept short on purpose: this is a margin note, and every
  // one of them rides along in the synced document.
  const MAX_NOTE_CHARS = 280;
  SYS.MAX_NOTE_CHARS = MAX_NOTE_CHARS;

  function dayNote(day) {
    const raw = day && typeof day.note === "string" ? day.note.trim() : "";
    return raw ? raw.slice(0, MAX_NOTE_CHARS) : "";
  }

  function habitNoteOn(task, key) { return dayNote(habitDays(task)[key]); }
  SYS.habitNoteOn = habitNoteOn;

  // Writes a note on a day, creating the day if it has nothing else on it —
  // a note about a day you missed is the whole point — and removing an empty
  // day again when the note is cleared. Never touches n or amount, so it
  // cannot pay or reclaim EXP.
  function setHabitNote(state, taskId, dayKey, text) {
    const t = (state.tasks || []).find((x) => x.id === taskId);
    if (!t || !t.recurring) return [];
    const key = dayKey || todayKey();
    if (key > todayKey()) return [{ kind: "info", text: "That day hasn't happened yet." }];
    const note = dayNote({ note: text });
    const days = { ...habitDays(t) };
    const day = days[key];
    if (!note) {
      if (!day) return [];
      // Removed outright rather than set to undefined, which would survive a
      // clone and reach the synced document as a key with no value.
      //
      // The day itself stays if anything else is on it — including a slip.
      // Deleting a note should not quietly un-record that the day was broken.
      if ((day.n > 0) || (Number(day.amount) || 0) > 0 || day.slip) {
        const kept = { ...day };
        delete kept.note;
        days[key] = kept;
      } else {
        delete days[key];
      }
    } else {
      days[key] = { ...(day || { n: 0, amount: 0 }), note };
    }
    t.days = days;
    pruneHabitDays(t);
    return [];
  }
  SYS.setHabitNote = setHabitNote;

  // Recent notes, newest first, for reading back what was written.
  function habitNotes(task, limit) {
    const days = habitDays(task);
    return Object.keys(days)
      .filter((k) => dayNote(days[k]))
      .sort()
      .reverse()
      .slice(0, Math.max(1, Number(limit) || 5))
      .map((k) => ({ key: k, note: dayNote(days[k]), done: habitDoneOn(task, k) }));
  }
  SYS.habitNotes = habitNotes;

  // The goal for one day, in the smallest unit of its group.
  function habitGoalBase(task) {
    const amount = Number(task && task.targetAmount);
    const n = Number.isFinite(amount) && amount > 0 ? amount : 1;
    return n * SYS.unitFactor(task && task.unit);
  }
  SYS.habitGoalBase = habitGoalBase;

  // What has been logged on a day, in that same smallest unit.
  function habitAmountOn(task, key) {
    const d = habitDays(task)[key];
    return d && Number.isFinite(Number(d.amount)) ? Number(d.amount) : 0;
  }
  SYS.habitAmountOn = habitAmountOn;

  // Day amounts used to be written in the habit's own unit, back when they
  // were only descriptive. They decide completion now, so they are converted
  // once. Keyed on a flag rather than on the values, because 2 is a plausible
  // number in either unit and there is no way to tell them apart by looking.
  function migrateHabitAmounts(task) {
    if (!task || !task.recurring || task.daysBase) return false;
    const factor = SYS.unitFactor(task.unit);
    const days = habitDays(task);
    if (factor !== 1) {
      const next = {};
      Object.keys(days).forEach((k) => {
        next[k] = { ...days[k], n: days[k].n, amount: (Number(days[k].amount) || 0) * factor };
      });
      task.days = next;
    }
    task.daysBase = true;
    return true;
  }
  SYS.migrateHabitAmounts = migrateHabitAmounts;

  // Deterministic, and safe to run on every load: the same weekLog always
  // produces the same day map. It has to be — normalizeState runs it on the
  // local copy and on the pulled one and then compares the two.
  function migrateHabitDays(task) {
    if (!task || !task.recurring) return false;
    if (task.days && typeof task.days === "object" && !Array.isArray(task.weekLog)) return false;
    const days = (task.days && typeof task.days === "object") ? { ...task.days } : {};
    (Array.isArray(task.weekLog) ? task.weekLog : []).forEach((e) => {
      if (!e || typeof e.date !== "string") return;
      const cur = days[e.date] || { n: 0, amount: 0 };
      // Several repeats on one date collapse into one day carrying the count.
      // The EXP those repeats already granted is not revisited: taking points
      // back because the rules changed under someone is the one thing this
      // ledger must never do.
      days[e.date] = { n: cur.n + 1, amount: cur.amount + (Number(e.amount) || 0) };
    });
    task.days = days;
    delete task.weekKey;
    delete task.weekLog;
    return true;
  }
  SYS.migrateHabitDays = migrateHabitDays;

  // Bounded like the rest of the local history — 120 days matches what
  // dailyStats keeps, which is what the Stats page reads.
  function pruneHabitDays(task) {
    const days = habitDays(task);
    const keys = Object.keys(days);
    if (keys.length <= HABIT_DAY_RETENTION) return false;
    const sorted = keys.sort();
    const keep = sorted.slice(-HABIT_DAY_RETENTION);
    const next = {};
    keep.forEach((k) => { next[k] = days[k]; });
    // What the dropped days were worth, kept as one number so "total ever"
    // stays exact without keeping the days themselves. Only the part that
    // has fallen out of the window lives here; the window itself is still
    // summed from the real days, so the live figure cannot drift.
    let pruned = Number(task.volPruned) || 0;
    // And by month, for the Comparison chart's year view — the same dropped
    // days, bucketed. Amounts pruned before this existed were never recorded
    // by month and stay only in the lump above; they read as nothing in a
    // month rather than being spread across months by a guess.
    const byMonth = { ...(task.volByMonth || {}) };
    let bucketed = false;
    sorted.slice(0, sorted.length - HABIT_DAY_RETENTION).forEach((k) => {
      const amount = Number(days[k].amount) || 0;
      pruned += amount;
      if (amount) {
        const m = k.slice(0, 7);
        byMonth[m] = (Number(byMonth[m]) || 0) + amount;
        bucketed = true;
      }
    });
    if (pruned) task.volPruned = pruned;
    if (bucketed) task.volByMonth = byMonth;
    task.days = next;
    return true;
  }
  SYS.pruneHabitDays = pruneHabitDays;

  function shiftDay(key, delta) {
    const [y, m, d] = key.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + delta);
    return dateKey(dt);
  }
  SYS.shiftDay = shiftDay;

  // Consecutive days ending today — or ending yesterday, while today is still
  // open. Counting a streak as broken at midnight would call it lost every
  // morning before the habit has had its chance.
  // Returns { n, scope }. Days for a schedule with named days; whole weeks,
  // months or windows for a quota, because "3 days in a row" is not what
  // "three times a week, four weeks running" means.
  //
  // Both walks are bounded by how much history there is to walk: days older
  // than HABIT_DAY_RETENTION are pruned, so nothing beyond that can be part
  // of a streak anyway.
  function habitStreak(task, today) {
    const start = today || todayKey();
    if (isQuota(task)) {
      const here = periodBounds(task, start);
      // The window in progress counts once it is filled, and is skipped
      // rather than counted against while it is still open.
      let n = periodKept(task, start) ? 1 : 0;
      let cursor = shiftDay(here.start, -1);
      for (let i = 0; i < 40 && periodKept(task, cursor); i++) {
        n++;
        cursor = shiftDay(periodBounds(task, cursor).start, -1);
      }
      return { n, scope: here.scope };
    }
    // A slip today is not an open day, it is a broken one. Everything else
    // gets the benefit of the doubt; this does not.
    if (habitSlipOn(task, start)) return { n: 0, scope: "day" };
    let cursor = start;
    // Today still open does not break a run, or every morning would read as
    // a reset.
    if (isDueOn(task, cursor) && !habitDoneOn(task, cursor)) cursor = shiftDay(cursor, -1);
    let n = 0;
    for (let i = 0; i < 200; i++) {
      if (habitSlipOn(task, cursor)) break;
      if (!isDueOn(task, cursor)) { cursor = shiftDay(cursor, -1); continue; }
      if (!habitDoneOn(task, cursor)) break;
      n++;
      cursor = shiftDay(cursor, -1);
    }
    return { n, scope: "day" };
  }
  SYS.habitStreak = habitStreak;

  // How many distinct days this week carry a tick, against the days-a-week
  // target. Replaces the old repeat count, which could all come from one day.
  function weekDays(task, today) {
    const start = today || todayKey();
    const [y, m, d] = start.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const monday = new Date(dt);
    monday.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
    const keys = [];
    for (let i = 0; i < 7; i++) {
      const c = new Date(monday);
      c.setDate(monday.getDate() + i);
      keys.push(dateKey(c));
    }
    return { keys, done: keys.filter((k) => habitDoneOn(task, k)) };
  }
  SYS.weekDays = weekDays;

  Object.assign(E, { HABIT_DAY_RETENTION, habitDays, habitDoneOn, isQuitHabit, habitSlipOn, markSlip, clearSlip, MAX_NOTE_CHARS, dayNote, habitNoteOn, setHabitNote, habitNotes, habitGoalBase, habitAmountOn, migrateHabitAmounts, migrateHabitDays, pruneHabitDays, shiftDay, habitStreak, weekDays });
})(window.SYS = window.SYS || {});

// Game rules: schedules, reminder times, what is due when, periods and quotas, the daily stats.
// One of the files engine.js was split into (2026-10-16); the names they share travel through
// SYS._engine, and each file takes what it needs from the files loaded before it.
(function (SYS) {
  "use strict";
  const E = SYS._engine || (SYS._engine = {});
  const { habitDays, habitDoneOn, shiftDay } = E;
  // Defined in a file that loads after this one; looked up when called.
  const habitFirstDay = (...args) => E.habitFirstDay(...args);
  const isArchivedOn = (...args) => E.isArchivedOn(...args);

  // ---- schedules ----------------------------------------------------------
  //
  // "How many days a week" could not say *which* days, so a habit meant for
  // Monday, Wednesday and Friday looked identical to one done three days
  // running and then dropped. A schedule says when a habit is actually due.
  //
  // Two families, and the difference decides everything downstream:
  //
  //   fixed  — daily, weekdays, monthDays, interval. Named days. Missing one
  //            breaks the streak; a day that was never due cannot be missed.
  //   quota  — perWeek, perMonth, perInterval. "Three times a week", no day
  //            named. Every day is available until the quota is met, and the
  //            streak counts whole windows rather than days.
  //
  // Logging on a day the habit was not due is always allowed and always
  // paid. The schedule sets expectations, it does not lock the door.
  const SCHEDULE_TYPES = ["daily", "weekdays", "perWeek", "monthDays", "perMonth", "interval", "perInterval"];
  const QUOTA_TYPES = ["perWeek", "perMonth", "perInterval"];
  SYS.SCHEDULE_TYPES = SCHEDULE_TYPES;
  const WEEKS_PER_MONTH = 12 / 52.1786;

  function parseKey(key) {
    const [y, m, d] = String(key).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }
  function weekdayOf(key) { return parseKey(key).getDay(); }      // 0 = Sunday
  // Rounded, because an hour goes missing twice a year and a day that is 23
  // hours long must still count as one.
  function daysBetween(a, b) { return Math.round((parseKey(b) - parseKey(a)) / 86400000); }

  function clampInt(v, lo, hi, fallback) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(lo, Math.min(hi, n));
  }
  function uniqueSorted(list, lo, hi) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach((v) => {
      const n = Math.round(Number(v));
      if (Number.isFinite(n) && n >= lo && n <= hi && out.indexOf(n) < 0) out.push(n);
    });
    return out.sort((a, b) => a - b);
  }

  // Always returns a usable schedule, including for habits saved before
  // schedules existed: those carried repeatsPerWeek and nothing else.
  function scheduleOf(task) {
    const raw = task && task.schedule;
    if (raw && SCHEDULE_TYPES.indexOf(raw.type) >= 0) return sanitizeSchedule(raw);
    const n = clampInt(task && task.repeatsPerWeek, 1, 7, 1);
    return n >= 7 ? { type: "daily" } : { type: "perWeek", n };
  }
  SYS.scheduleOf = scheduleOf;

  function sanitizeSchedule(raw) {
    const s = raw && typeof raw === "object" ? raw : {};
    switch (s.type) {
      case "weekdays": {
        const days = uniqueSorted(s.days, 0, 6);
        return days.length ? { type: "weekdays", days } : { type: "daily" };
      }
      case "perWeek": return { type: "perWeek", n: clampInt(s.n, 1, 7, 3) };
      case "monthDays": {
        const days = uniqueSorted(s.days, 1, 31);
        return days.length ? { type: "monthDays", days } : { type: "monthDays", days: [1] };
      }
      case "perMonth": return { type: "perMonth", n: clampInt(s.n, 1, 31, 4) };
      case "interval": {
        const out = { type: "interval", every: clampInt(s.every, 2, 365, 2) };
        if (isDayKey(s.start)) out.start = s.start;
        return out;
      }
      case "perInterval": {
        const every = clampInt(s.every, 2, 365, 10);
        const out = { type: "perInterval", every, n: clampInt(s.n, 1, every, 1) };
        if (isDayKey(s.start)) out.start = s.start;
        return out;
      }
      default: return { type: "daily" };
    }
  }
  SYS.sanitizeSchedule = sanitizeSchedule;

  function isDayKey(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v); }
  SYS.isDayKey = isDayKey;

  // A time of day, or nothing. Validated on the way in because the server
  // reads it hours later with no chance to ask what was meant: anything that
  // is not HH:MM simply is not a reminder.
  function sanitizeRemindAt(v) {
    return (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)) ? v : null;
  }
  SYS.sanitizeRemindAt = sanitizeRemindAt;

  // A habit's reminder times: "HH:MM" strings, each once, earliest first, at
  // most MAX_REMINDERS. Sorted and deduplicated here so the stored list is a
  // fixed point — normalizeState compares the local and the pulled copy, and
  // an order that depended on how the times were added would be a conflict
  // that never settles.
  SYS.MAX_REMINDERS = 8;
  function sanitizeReminders(list) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach((v) => {
      const time = sanitizeRemindAt(v);
      if (time && !out.includes(time)) out.push(time);
    });
    return out.sort().slice(0, SYS.MAX_REMINDERS);
  }
  SYS.sanitizeReminders = sanitizeReminders;

  // The line the notification carries, in the person's own words. One line,
  // no runs of spaces, and short enough to show whole on a lock screen.
  SYS.MAX_REMIND_NOTE = 100;
  function sanitizeRemindNote(v) {
    return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, SYS.MAX_REMIND_NOTE) : "";
  }
  SYS.sanitizeRemindNote = sanitizeRemindNote;

  // Every time a habit reminds at. A habit saved before there could be
  // several carries one `remindAt`, and it is read too, so a copy written by
  // the older version still reminds. functions/reminders.js reads it the same
  // way, and a test holds the two to it.
  function reminderTimes(task) {
    const list = Array.isArray(task && task.reminders) ? task.reminders : [];
    return sanitizeReminders(task && task.remindAt != null ? list.concat([task.remindAt]) : list);
  }
  SYS.reminderTimes = reminderTimes;

  // Moves a single remindAt into the reminders list and tidies both fields.
  // Idempotent; true when something changed, so the caller knows to save.
  function migrateReminders(task) {
    if (!task || typeof task !== "object") return false;
    const before = JSON.stringify([task.reminders, task.remindAt, task.remindNote]);
    const times = reminderTimes(task);
    delete task.remindAt;
    if (times.length) task.reminders = times; else delete task.reminders;
    const note = sanitizeRemindNote(task.remindNote);
    if (note) task.remindNote = note; else delete task.remindNote;
    return JSON.stringify([task.reminders, task.remindAt, task.remindNote]) !== before;
  }
  SYS.migrateReminders = migrateReminders;

  // Writes the schedule a habit was already behaving as, and drops the field
  // it replaces. Idempotent, and a pure function of the task it is handed —
  // normalizeState runs this on the local and the pulled copy before
  // comparing them, so anything that reached for the clock here would make
  // two identical saves look different.
  function migrateSchedule(task) {
    if (!task || !task.recurring) return false;
    const before = JSON.stringify(task.schedule) + "|" + (task.repeatsPerWeek == null ? "" : task.repeatsPerWeek);
    task.schedule = scheduleOf(task);
    delete task.repeatsPerWeek;
    return before !== JSON.stringify(task.schedule) + "|";
  }
  SYS.migrateSchedule = migrateSchedule;

  // An interval needs a day to count from. The form records one; a habit
  // that somehow lacks it counts from its first logged day, and only falls
  // back to today when it has no history at all.
  function intervalAnchor(task, s) {
    if (isDayKey(s.start)) return s.start;
    const keys = Object.keys(habitDays(task)).sort();
    return keys.length ? keys[0] : todayKey();
  }

  function isDueOn(task, key) {
    const s = scheduleOf(task);
    if (s.type === "daily") return true;
    if (s.type === "weekdays") return s.days.indexOf(weekdayOf(key)) >= 0;
    if (s.type === "monthDays") {
      const d = parseKey(key);
      const dom = d.getDate();
      const lastOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      // The 31st of a 30-day month is the 30th, rather than a month the
      // habit silently skips.
      return s.days.some((x) => x === dom || (x > lastOfMonth && dom === lastOfMonth));
    }
    if (s.type === "interval") {
      const diff = daysBetween(intervalAnchor(task, s), key);
      return diff >= 0 && diff % s.every === 0;
    }
    // Quota types have no named days: every day is due until the quota for
    // the window is filled, and none is once it is.
    const p = periodProgress(task, key);
    return p.done < p.target;
  }
  SYS.isDueOn = isDueOn;

  function isQuota(task) { return QUOTA_TYPES.indexOf(scheduleOf(task).type) >= 0; }
  SYS.isQuotaSchedule = isQuota;

  // Whether a quota ("5 times a week", no named days) is owed on a day: only
  // once the times still owed, counting what was done before that day in its
  // window, are as many as the days left in the window, that day included.
  // Five a week is free on Monday and Tuesday and owed from Wednesday; done
  // once on Monday, it is owed from Thursday.
  function quotaAskedOn(task, key) {
    // Nothing is owed before the habit existed.
    if (key < habitFirstDay(task)) return false;
    const s = scheduleOf(task);
    const b = periodBounds(task, key);
    const before = key > b.start ? daysInRange(b.start, shiftDay(key, -1)) : [];
    const owed = s.n - before.filter((k) => habitDoneOn(task, k)).length;
    if (owed <= 0) return false;
    return owed >= daysBetween(key, b.end) + 1;
  }
  SYS.quotaAskedOn = quotaAskedOn;

  // Whether a day counts this habit — the one rule behind the calendar ring,
  // the habits page's bar and the overview's figure. A day it was done on
  // always counts; otherwise a quota counts only when it is owed (above) and
  // anything else on the days its schedule names.
  function isAskedOn(task, key) {
    if (!task || !task.recurring || isArchivedOn(task, key)) return false;
    if (habitDoneOn(task, key)) return true;
    return isQuota(task) ? quotaAskedOn(task, key) : isDueOn(task, key);
  }
  SYS.isAskedOn = isAskedOn;

  // The window a day belongs to, and the days in it. Weeks run Monday to
  // Sunday, to match the strip on the card.
  function periodBounds(task, key) {
    const s = scheduleOf(task);
    const d = parseKey(key);
    if (s.type === "perMonth" || s.type === "monthDays") {
      const first = new Date(d.getFullYear(), d.getMonth(), 1);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return { start: dateKey(first), end: dateKey(last), scope: "month" };
    }
    if (s.type === "perInterval" || s.type === "interval") {
      const a = intervalAnchor(task, s);
      const diff = daysBetween(a, key);
      const index = Math.floor(diff / s.every);
      const start = shiftDay(a, index * s.every);
      return { start, end: shiftDay(start, s.every - 1), scope: "window" };
    }
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: dateKey(monday), end: dateKey(sunday), scope: "week" };
  }
  SYS.periodBounds = periodBounds;

  function daysInRange(from, to) {
    const out = [];
    const span = daysBetween(from, to);
    for (let i = 0; i <= span && i < 400; i++) out.push(shiftDay(from, i));
    return out;
  }

  // What the card counts: done against what this window asked for. For a
  // quota that is the quota; for named days it is how many of them fall in
  // the window, so a Mon/Wed/Fri habit reads 2/3 rather than 2/7.
  function periodProgress(task, key) {
    const day = key || todayKey();
    const s = scheduleOf(task);
    const bounds = periodBounds(task, day);
    const keys = daysInRange(bounds.start, bounds.end);
    if (QUOTA_TYPES.indexOf(s.type) >= 0) {
      const target = s.type === "perInterval" ? s.n : s.n;
      return {
        done: keys.filter((k) => habitDoneOn(task, k)).length,
        target,
        scope: bounds.scope,
        start: bounds.start,
        end: bounds.end,
      };
    }
    // Named days only. Counting every logged day here would let a bonus
    // Sunday paper over a missed Monday.
    const due = keys.filter((k) => isDueOn(task, k));
    return {
      done: due.filter((k) => habitDoneOn(task, k)).length,
      target: due.length,
      scope: bounds.scope,
      start: bounds.start,
      end: bounds.end,
    };
  }
  SYS.periodProgress = periodProgress;

  // The next day this habit is due, today included. Quota schedules answer
  // "today" while the quota is open and the first day of the next window
  // once it is met. Bounded so an odd schedule cannot spin.
  function nextDueOn(task, from) {
    let cursor = from || todayKey();
    for (let i = 0; i < 400; i++) {
      if (isDueOn(task, cursor)) return cursor;
      cursor = shiftDay(cursor, 1);
    }
    return null;
  }
  SYS.nextDueOn = nextDueOn;

  // Expected times a week, which is the one number that compares schedules
  // to each other. The AI prices a habit against it, so "twice a month" and
  // "daily" cannot come out the same.
  function weeklyRate(task) {
    const s = scheduleOf(task);
    switch (s.type) {
      case "daily": return 7;
      case "weekdays": return s.days.length;
      case "perWeek": return s.n;
      case "monthDays": return Math.round(s.days.length * WEEKS_PER_MONTH * 100) / 100;
      case "perMonth": return Math.round(s.n * WEEKS_PER_MONTH * 100) / 100;
      case "interval": return Math.round((7 / s.every) * 100) / 100;
      case "perInterval": return Math.round((s.n * 7 / s.every) * 100) / 100;
      default: return 7;
    }
  }
  SYS.weeklyRate = weeklyRate;

  // A whole window counted as kept: every named day in it done, or the quota
  // filled. Used by the streak, which walks windows for quota schedules.
  function periodKept(task, key) {
    const p = periodProgress(task, key);
    return p.target > 0 && p.done >= p.target;
  }

  // Local-calendar date key (not UTC) — "today" should match the day the user
  // actually sees on their clock.
  function dateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  SYS.dateKey = dateKey;
  function todayKey() { return dateKey(new Date()); }
  SYS.todayKey = todayKey;

  function emptyBucket() { return { xp: 0, quests: 0, repeats: 0, habitIds: [] }; }

  // Per-day activity ledger backing the Stats page. `k` defaults to today —
  // pass an explicit date for events whose real-world day isn't "now" (e.g.
  // undoing a habit repeat that was logged earlier in the week logs the
  // correction against the day it actually happened, not today).
  function bumpDailyStat(state, field, delta, k) {
    if (!delta) return;
    state.dailyStats = state.dailyStats || {};
    k = k || todayKey();
    const bucket = state.dailyStats[k] || emptyBucket();
    bucket[field] = (bucket[field] || 0) + delta;
    state.dailyStats[k] = bucket;
  }
  SYS.bumpDailyStat = bumpDailyStat;

  // Tracks which distinct habits were touched on a given day — this is what
  // the Stats month view's "% of habits completed" bar is computed from.
  function recordHabitTouch(state, k, taskId) {
    state.dailyStats = state.dailyStats || {};
    const bucket = state.dailyStats[k] || emptyBucket();
    if (!bucket.habitIds) bucket.habitIds = [];
    bucket.habitIds.push(taskId);
    state.dailyStats[k] = bucket;
  }
  SYS.recordHabitTouch = recordHabitTouch;
  function unrecordHabitTouch(state, k, taskId) {
    const bucket = state.dailyStats && state.dailyStats[k];
    if (!bucket || !bucket.habitIds) return;
    const idx = bucket.habitIds.lastIndexOf(taskId);
    if (idx >= 0) bucket.habitIds.splice(idx, 1);
  }
  SYS.unrecordHabitTouch = unrecordHabitTouch;

  // Keeps the ledger from growing forever — a year of daily buckets is tiny,
  // but no reason to carry it past what the Stats page can ever show.
  function pruneDailyStats(state, keepDays) {
    state.dailyStats = state.dailyStats || {};
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (keepDays || 120));
    const cutoffKey = dateKey(cutoff);
    Object.keys(state.dailyStats).forEach((k) => { if (k < cutoffKey) delete state.dailyStats[k]; });
  }
  SYS.pruneDailyStats = pruneDailyStats;

  function dayInfo(state, d, totalHabits) {
    const stats = state.dailyStats || {};
    const k = dateKey(d);
    const b = stats[k] || emptyBucket();
    const habitIds = b.habitIds || [];
    const habitPct = totalHabits > 0 ? Math.round((new Set(habitIds).size / totalHabits) * 100) : 0;
    return {
      dateKey: k, date: new Date(d),
      xp: b.xp || 0, quests: b.quests || 0, repeats: b.repeats || 0,
      habitPct, active: (b.xp || 0) > 0 || (b.quests || 0) > 0 || (b.repeats || 0) > 0,
    };
  }

  function mondayOf(d) {
    const out = new Date(d);
    const dow = (out.getDay() + 6) % 7; // Mon=0..Sun=6
    out.setDate(out.getDate() - dow);
    out.setHours(0, 0, 0, 0);
    return out;
  }
  SYS.mondayOf = mondayOf;

  Object.assign(E, { SCHEDULE_TYPES, QUOTA_TYPES, WEEKS_PER_MONTH, parseKey, weekdayOf, daysBetween, clampInt, uniqueSorted, scheduleOf, sanitizeSchedule, isDayKey, sanitizeRemindAt, sanitizeReminders, sanitizeRemindNote, reminderTimes, migrateReminders, migrateSchedule, intervalAnchor, isDueOn, isQuota, quotaAskedOn, isAskedOn, periodBounds, daysInRange, periodProgress, nextDueOn, weeklyRate, periodKept, dateKey, todayKey, emptyBucket, bumpDailyStat, recordHabitTouch, unrecordHabitTouch, pruneDailyStats, dayInfo, mondayOf });
})(window.SYS = window.SYS || {});

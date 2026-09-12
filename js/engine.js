// Game rules: EXP conversion, skill-point allocation, task/trait mutations.
// Every function takes a state object it is allowed to mutate in place (callers
// pass a fresh clone) and returns { notifications } describing what happened,
// so the UI layer can render toasts without knowing any game-rule details.
(function (SYS) {
  "use strict";

  // i18n.js loads before this file in index.html, so SYS.t is there in the app.
  // Guarded anyway: this file is the EXP ledger, and it must not be brought
  // down by the absence of a translation table. Falls back to the key, exactly
  // as SYS.t itself does for a string it does not have.
  function tr(key, vars) {
    return typeof SYS.t === "function" ? SYS.t(key, vars) : key;
  }


  function clone(x) {
    return typeof structuredClone === "function" ? structuredClone(x) : JSON.parse(JSON.stringify(x));
  }
  SYS.clone = clone;

  // Key-order-independent structural equality for two JSON-shaped state
  // trees (used to tell "cloud copy exists" apart from "cloud copy actually
  // differs from what's already here" when reconciling cloud sync — a plain
  // JSON.stringify comparison would false-positive on harmless key reordering
  // from a Firestore round-trip).
  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
      return true;
    }
    const aKeys = Object.keys(a), bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  SYS.deepEqual = deepEqual;

  // What actually differs between two copies of the state, in words.
  //
  // The sync prompt asked which copy to keep without ever saying what was at
  // stake, so answering it was a guess. It also made a repeating prompt
  // impossible to diagnose: something kept disagreeing on every launch and
  // there was no way to see what. Both are the same missing sentence.
  //
  // Deliberately shallow and bounded — this describes a disagreement, it does
  // not dump the state. Counts and field names, never whole records.
  function countOf(v) {
    if (Array.isArray(v)) return v.length + " item(s)";
    if (v && typeof v === "object") return Object.keys(v).length + " entr(ies)";
    if (v === undefined) return "missing";
    return JSON.stringify(v);
  }

  function describeValueDiff(a, b) {
    if (Array.isArray(a) || Array.isArray(b)) {
      const la = Array.isArray(a) ? a.length : 0, lb = Array.isArray(b) ? b.length : 0;
      if (la !== lb) return "this device " + la + ", account " + lb;
      return "same count (" + la + "), different contents";
    }
    if (a && b && typeof a === "object" && typeof b === "object") {
      const fields = [...new Set([...Object.keys(a), ...Object.keys(b)])]
        .filter((k) => !deepEqual(a[k], b[k]));
      if (!fields.length) return "different";
      // Named fields with values are what makes a player mismatch readable.
      return fields.slice(0, 6).map((k) => {
        const av = a[k], bv = b[k];
        const scalar = (x) => x === null || typeof x !== "object";
        return scalar(av) && scalar(bv)
          ? k + ": " + JSON.stringify(av) + " vs " + JSON.stringify(bv)
          : k + " (" + countOf(av) + " vs " + countOf(bv) + ")";
      }).join(", ") + (fields.length > 6 ? ", +" + (fields.length - 6) + " more" : "");
    }
    return countOf(a) + " vs " + countOf(b);
  }

  // local first, cloud second, in every pair — matching the order the two
  // buttons are offered in, so the reader is never guessing which is which.
  SYS.describeStateDiff = function (local, cloud) {
    const a = local || {}, b = cloud || {};
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
      .filter((k) => !deepEqual(a[k], b[k]))
      .map((k) => ({ key: k, detail: describeValueDiff(a[k], b[k]) }));
  };

  // A task's value and its EXP are the same number. Kept as a named function
  // rather than inlined so the one place that decides this stays findable.
  function ptToExp(pt) {
    return Number(pt) || 0;
  }
  SYS.ptToExp = ptToExp;

  // ISO-8601 week key (e.g. "2026-W34") — the boundary a recurring habit's
  // weekly count resets against.
  function isoWeekKey(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    const weekNum = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
    return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
  }
  SYS.isoWeekKey = isoWeekKey;


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
    sorted.slice(0, sorted.length - HABIT_DAY_RETENTION).forEach((k) => {
      pruned += Number(days[k].amount) || 0;
    });
    if (pruned) task.volPruned = pruned;
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

  // A time of day, or nothing. Validated on the way in because the server
  // reads it hours later with no chance to ask what was meant: anything that
  // is not HH:MM simply is not a reminder.
  function sanitizeRemindAt(v) {
    return (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)) ? v : null;
  }
  SYS.sanitizeRemindAt = sanitizeRemindAt;

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
  //   "."  nothing was asked of that day
  //   "-"  it was asked, and not done
  //   "+"  it was done
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
    // A quota asks nothing of a named day.
    if (isQuota(task)) return MARK_NONE;
    return isDueOn(task, key) ? MARK_MISSED : MARK_NONE;
  }
  SYS.computeMark = computeMark;

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

  // ---------- What the Stats page is made of ------------------------------

  function recurring(state) { return (state.tasks || []).filter((t) => t.recurring); }

  // The ring around a day in the calendar: how much of what that day asked
  // for was actually done. A day that asked for nothing gets no ring at all
  // rather than an empty one — there is nothing there to have failed.
  function dayRing(state, key) {
    let required = 0, done = 0;
    recurring(state).forEach((t) => {
      const m = markOn(t, key);
      if (m === MARK_DONE) { required++; done++; }
      else if (m === MARK_MISSED) required++;
    });
    return {
      key, required, done,
      pct: required > 0 ? Math.round((done / required) * 100) : 0,
      perfect: required > 0 && done === required,
    };
  }
  SYS.dayRing = dayRing;

  // The same question asked of a single habit, so the calendar can be scoped
  // to one without a second code path.
  function habitDayRing(task, key) {
    const m = markOn(task, key);
    return {
      key,
      required: m === MARK_NONE ? 0 : 1,
      done: m === MARK_DONE ? 1 : 0,
      pct: m === MARK_DONE ? 100 : 0,
      perfect: m === MARK_DONE,
    };
  }
  SYS.habitDayRing = habitDayRing;

  // Six weeks of Mondays-to-Sundays covering a calendar month, which is what
  // a month grid is: the days either side belong to other months and are
  // shown faint rather than left as holes.
  function monthGrid(state, taskId, year, month) {
    const task = taskId ? (state.tasks || []).find((x) => x.id === taskId) : null;
    if (taskId && !task) return { cells: [], year, month };
    const first = new Date(year, month, 1);
    const monday = new Date(first);
    monday.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    const today = todayKey();
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = shiftDate(monday, i);
      const key = dateKey(d);
      const ring = task ? habitDayRing(task, key) : dayRing(state, key);
      cells.push({
        key,
        day: d.getDate(),
        inMonth: d.getMonth() === month,
        ahead: key > today,
        isToday: key === today,
        required: ring.required,
        done: ring.done,
        pct: ring.pct,
        perfect: ring.perfect,
      });
    }
    return { cells, year, month };
  }
  SYS.monthGrid = monthGrid;

  // Every day of a year as one character, for the heat grid. Read straight
  // from the long memory, which is the only thing that reaches back that far.
  function yearMarks(state, taskId, year) {
    const task = taskId ? (state.tasks || []).find((x) => x.id === taskId) : null;
    const n = daysInYear(year);
    const out = [];
    for (let i = 1; i <= n; i++) {
      const d = new Date(year, 0, i);
      const key = dateKey(d);
      if (task) out.push({ key, mark: markOn(task, key) });
      else {
        const ring = dayRing(state, key);
        out.push({ key, mark: ring.required === 0 ? MARK_NONE : ring.perfect ? MARK_DONE : MARK_MISSED, pct: ring.pct });
      }
    }
    return out;
  }
  SYS.yearMarks = yearMarks;

  // The first day anything was recorded, which is the denominator of every
  // "per day" figure on the page. Without it a week-old account reads as
  // though it had been failing for a year.
  function firstRecordedDay(state) {
    const days = recurring(state).map((t) => habitFirstDay(t)).filter(isDayKey).sort();
    return days[0] || todayKey();
  }
  SYS.firstRecordedDay = firstRecordedDay;
  // An inclusive count of days, first and last included, never below one.
  // Deliberately not called daysBetween: the engine already has one of those,
  // it is a plain signed difference, and three schedule shapes depend on it —
  // redefining that name silently broke every interval schedule.

  function daySpan(fromKey, toKey) {
    return Math.max(1, Math.round((parseKey(toKey) - parseKey(fromKey)) / 86400000) + 1);
  }

  // Walks every day from the first recorded one to today, once, and counts
  // the four figures the Overall page shows. One pass rather than four,
  // because they all read the same days.
  function statsAllTime(state) {
    const first = firstRecordedDay(state);
    const today = todayKey();
    const span = Math.min(daySpan(first, today), MARK_YEARS * 366);
    const start = shiftDay(today, -(span - 1));
    let perfectDays = 0, habitsDone = 0, bestStreak = 0, run = 0;
    let cursor = start;
    for (let i = 0; i < span; i++) {
      const ring = dayRing(state, cursor);
      habitsDone += ring.done;
      if (ring.perfect) { perfectDays++; run++; if (run > bestStreak) bestStreak = run; }
      else if (ring.required > 0) run = 0;
      // A day that asked for nothing neither breaks a streak nor extends it.
      cursor = shiftDay(cursor, 1);
    }
    return {
      firstDay: start,
      days: span,
      perfectDays,
      bestStreak,
      habitsDone,
      // Kept as a number rather than a rounded one: 92 habits over 500 days
      // is 0.18 a day, and showing that as "0" is how a real figure becomes
      // a wrong one.
      dailyAverage: habitsDone / span,
    };
  }
  SYS.statsAllTime = statsAllTime;

  // The month's rate: the average of each day's ring, over the days that
  // asked for something. Days that asked for nothing are left out entirely —
  // averaging them in as zeroes would punish a rest day.
  function monthRate(state, taskId, year, month) {
    const task = taskId ? (state.tasks || []).find((x) => x.id === taskId) : null;
    const last = new Date(year, month + 1, 0).getDate();
    const today = todayKey();
    let sum = 0, counted = 0;
    for (let day = 1; day <= last; day++) {
      const key = dateKey(new Date(year, month, day));
      if (key > today) break;
      const ring = task ? habitDayRing(task, key) : dayRing(state, key);
      if (ring.required === 0) continue;
      sum += ring.pct;
      counted++;
    }
    return counted > 0 ? sum / counted : 0;
  }
  SYS.monthRate = monthRate;

  // How much was actually measured, in the habit's base unit. The live window
  // is summed from the real days; everything older was added to volPruned as
  // it fell out of that window, so the total stays exact without keeping the
  // days themselves.
  function habitVolume(task, fromKey, toKey) {
    const days = habitDays(task);
    let sum = 0;
    Object.keys(days).forEach((k) => {
      if (fromKey && k < fromKey) return;
      if (toKey && k > toKey) return;
      sum += Number(days[k].amount) || 0;
    });
    return sum;
  }
  SYS.habitVolume = habitVolume;

  function habitVolumeTotal(task) {
    return (Number(task && task.volPruned) || 0) + habitVolume(task, null, null);
  }
  SYS.habitVolumeTotal = habitVolumeTotal;

  // Everything the single-habit view shows, in one pass over its marks.
  function habitStats(task, year, month) {
    const today = todayKey();
    const first = habitFirstDay(task);
    const span = daySpan(first, today);
    let successTotal = 0, bestStreak = 0, run = 0;
    let cursor = first;
    for (let i = 0; i < span && i < MARK_YEARS * 366; i++) {
      const m = markOn(task, cursor);
      if (m === MARK_DONE) { successTotal++; run++; if (run > bestStreak) bestStreak = run; }
      else if (m === MARK_MISSED) run = 0;
      cursor = shiftDay(cursor, 1);
    }
    const last = new Date(year, month + 1, 0).getDate();
    const monthFrom = dateKey(new Date(year, month, 1));
    const monthTo = dateKey(new Date(year, month, last));
    let successMonth = 0;
    for (let day = 1; day <= last; day++) {
      const key = dateKey(new Date(year, month, day));
      if (key > today) break;
      if (markOn(task, key) === MARK_DONE) successMonth++;
    }
    const volTotal = habitVolumeTotal(task);
    return {
      firstDay: first,
      days: span,
      successMonth,
      successTotal,
      currentStreak: habitStreak(task, today).n,
      bestStreak,
      volMonth: habitVolume(task, monthFrom, monthTo),
      volTotal,
      dailyAvg: volTotal / span,
    };
  }
  SYS.habitStats = habitStats;

  // What was finished today, for the list at the foot of the Overall view.
  function doneToday(state) {
    const today = todayKey();
    return recurring(state)
      .filter((t) => habitDoneOn(t, today))
      .map((t) => ({ id: t.id, title: t.title, icon: t.icon, amount: habitAmountOn(t, today), unit: t.unit }));
  }
  SYS.doneToday = doneToday;


  function statsWeek(state, weekOffset) {
    const totalHabits = state.tasks.filter((t) => t.recurring).length;
    const start = mondayOf(new Date());
    start.setDate(start.getDate() + weekOffset * 7);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(dayInfo(state, d, totalHabits));
    }
    const end = days[6].date;
    const fmt = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return { days, rangeLabel: `${fmt(start)} – ${fmt(end)}`, year: start.getFullYear() };
  }
  SYS.statsWeek = statsWeek;

  // The actual calendar month (28–31 days) `monthOffset` months from the
  // current one.
  function statsMonth(state, monthOffset) {
    const totalHabits = state.tasks.filter((t) => t.recurring).length;
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const year = first.getFullYear(), month = first.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(dayInfo(state, new Date(year, month, day), totalHabits));
    }
    const monthLabel = first.toLocaleDateString(undefined, { month: "long" });
    return { days, monthLabel, year };
  }
  SYS.statsMonth = statsMonth;

  function avgTraitLevel(intel) {
    if (!intel || !intel.traits.length) return 0;
    return intel.traits.reduce((s, t) => s + t.level, 0) / intel.traits.length;
  }
  SYS.avgTraitLevel = avgTraitLevel;

  // Places points one at a time into whoever is weakest right now, re-checking
  // between each so a run of them spreads instead of piling onto one trait.
  // Returns null only when there are no categories at all.
  function placeWeakest(intelligences, intTypes, count) {
    const awardedTraits = [];
    let lastKey = null;
    for (let i = 0; i < count; i++) {
      const key = weakestCategory(intelligences, intTypes);
      if (!key) return null;
      const intel = intelligences[key];
      const idx = weakestTraitIndex(intel.traits);
      intel.traits[idx].level += 1;
      awardedTraits.push([key, intel.traits[idx].id]);
      lastKey = key;
    }
    if (!lastKey) return null;
    const label = (intTypes || []).find((x) => x.key === lastKey);
    const sorted = intelligences[lastKey].traits.slice().sort((a, b) => a.level - b.level);
    return {
      awardedTraits,
      entry: { type: lastKey, points: count, share: 1, trait: sorted[0] ? sorted[0].name : "", short: label ? label.short : lastKey },
    };
  }

  // The least-developed category that actually has somewhere to put a point.
  function weakestCategory(intelligences, intTypes) {
    let best = null, bestTotal = Infinity;
    (intTypes || []).forEach((t) => {
      const intel = intelligences[t.key];
      if (!intel || !intel.traits || !intel.traits.length) return;
      const total = intel.traits.reduce((s, tr) => s + (Number(tr.level) || 0), 0);
      if (total < bestTotal) { bestTotal = total; best = t.key; }
    });
    return best;
  }

  function weakestTraitIndex(traits) {
    let idx = 0;
    for (let i = 1; i < traits.length; i++) if (traits[i].level < traits[idx].level) idx = i;
    return idx;
  }

  // Which trait in this category should receive the next point. Prefers the
  // trait the underlying work was actually tagged for (from AI evaluation,
  // accumulated in player.traitComposition) — the one with the most EXP
  // behind it wins. Falls back to the weakest trait when there's no tagged
  // preference, which is the original behaviour and still what happens for
  // anything created before AI evaluation existed.

  // Which trait a level's point belongs to.
  //
  // The evaluator names one, and that name is matched against the person's own
  // traits. It used to be an exact string compare, and any near miss —
  // "Reading books" against "Reading", a hyphen, a plural — fell through to the
  // weakest trait without a word. That fallback then looked like the system
  // ignoring the assignment it had just made. So: exact, then normalised, then
  // containment either way, and only then weakest.
  function matchTraitIndex(traits, name) {
    const wanted = SYS.normaliseName(name);
    if (!wanted) return -1;
    const normalised = traits.map((t) => SYS.normaliseName(t.name));
    let idx = normalised.indexOf(wanted);
    if (idx >= 0) return idx;
    idx = normalised.findIndex((n) => n && (n.includes(wanted) || wanted.includes(n)));
    return idx;
  }

  function targetTraitIndex(traits, traitWeights) {
    if (traitWeights) {
      // Heaviest first, so a second-choice name still gets a chance when the
      // first cannot be matched at all.
      const byWeight = Object.keys(traitWeights).sort((a, b) => traitWeights[b] - traitWeights[a]);
      for (const name of byWeight) {
        if (!(traitWeights[name] > 0)) continue;
        const idx = matchTraitIndex(traits, name);
        if (idx >= 0) return idx;
      }
    }
    return weakestTraitIndex(traits);
  }

  // Distributes `totalPoints` skill points across intelligence types proportional to
  // each type's share of composition, banking fractional remainders so nothing is
  // ever lost to rounding — it compounds across future level-ups instead.
  // `awardedTraits` records exactly which trait got each point, in order, so a
  // later reversal (see applyExpDelta) can undo this exact allocation losslessly.
  // Takes one level's worth out of the attribution, and returns what it took.
  //
  // `composition` is EXP-denominated: it records how much of the EXP behind the
  // current level came from each category. A level costs levelCost EXP, so that
  // is what crossing one consumes — proportionally across the categories,
  // leaving the remainder for the level after it.
  //
  // It used to be emptied wholesale on every level-up. That was invisible while
  // a level cost 100 EXP and deltas were small, because one level-up consumed
  // about one level's worth anyway. Once a G-Rank level cost 15, a single
  // 500-point quest crossed thirty-three of them and only the first was
  // attributed: one point reached the trait the work actually built and
  // thirty-two were banked for want of a tag they already had.
  //
  // Anything left over stays for next time rather than being discarded — the
  // same treatment fractional points already get from `remainder`.
  function consumeComposition(state, amount) {
    const comp = state.player.composition || {};
    const total = Object.keys(comp).reduce((sum, k) => sum + (comp[k] > 0 ? comp[k] : 0), 0);
    if (total <= 0) return { used: {}, usedTraits: {} };

    const fraction = Math.min(amount, total) / total;
    const used = {};
    Object.keys(comp).forEach((k) => {
      if (!(comp[k] > 0)) return;
      used[k] = comp[k] * fraction;
      comp[k] -= used[k];
      if (comp[k] < 1e-9) delete comp[k];
    });

    // The per-trait split rides one level deeper and is drawn down in the same
    // proportion, so the two never fall out of step.
    const traitComp = state.player.traitComposition || {};
    const usedTraits = {};
    Object.keys(traitComp).forEach((cat) => {
      const bucket = traitComp[cat];
      const taken = {};
      Object.keys(bucket).forEach((name) => {
        taken[name] = bucket[name] * fraction;
        bucket[name] -= taken[name];
        if (Math.abs(bucket[name]) < 1e-9) delete bucket[name];
      });
      usedTraits[cat] = taken;
      if (!Object.keys(bucket).length) delete traitComp[cat];
    });

    return { used, usedTraits };
  }

  // Where a level's points land.
  //
  // Fractions accumulate per trait, not per category. They used to pool at the
  // category and the whole point went to the single heaviest trait in that
  // pool — so a big task left leftovers that outweighed a small one, and the
  // small task's points went to the big task's trait. Logging a drink of water
  // credited Handcrafts, because a 2000-point typing quest had left more weight
  // behind in Bodily than one glass of water was worth.
  //
  // Each trait now banks its own share and converts on its own, so a task's
  // points reach the trait that task named, whatever else has been going on in
  // the same category.
  function allocatePoints(intelligences, composition, totalPoints, intTypes, traitComposition) {
    let typedEntries = Object.entries(composition).filter(([k, v]) => k !== "general" && v > 0 && intelligences[k]);
    let totalTyped = typedEntries.reduce((s, [, v]) => s + v, 0);
    const distribution = [];
    const awardedTraits = [];

    if (totalTyped <= 0) {
      // Nothing said which category this EXP built — an admin adjustment, or a
      // task the evaluator judged to fit none of them. With no signal, the
      // honest choice is wherever they are weakest, which is what the app is
      // for. It goes down the same path so a part-point still accumulates
      // rather than being rounded away.
      const weakest = weakestCategory(intelligences, intTypes);
      if (!weakest) return { distribution, banked: totalPoints, awardedTraits };
      typedEntries = [[weakest, 1]];
      totalTyped = 1;
      traitComposition = null;
    }

    typedEntries.forEach(([type, categoryWeight]) => {
      const intel = intelligences[type];
      if (!intel || !intel.traits || !intel.traits.length) return;
      const categoryPoints = totalPoints * (categoryWeight / totalTyped);

      // How this category's points split between its traits. The weights come
      // from what the tasks themselves named; with none, it all goes to the
      // weakest trait, as before.
      const weights = (traitComposition && traitComposition[type]) || null;
      const shares = [];
      if (weights) {
        let named = 0;
        Object.keys(weights).forEach((name) => {
          if (!(weights[name] > 0)) return;
          const idx = matchTraitIndex(intel.traits, name);
          if (idx < 0) return;
          shares.push([idx, weights[name]]);
          named += weights[name];
        });
        if (named > 0) shares.forEach((s) => { s[1] = s[1] / named; });
        else shares.length = 0;
      }
      if (!shares.length) shares.push([weakestTraitIndex(intel.traits), 1]);

      intel.traitRemainder = intel.traitRemainder && typeof intel.traitRemainder === "object" ? intel.traitRemainder : {};
      let wholeHere = 0;
      let lastName = "";
      shares.forEach(([idx, share]) => {
        const trait = intel.traits[idx];
        const key = trait.id;
        const banked = (Number(intel.traitRemainder[key]) || 0) + categoryPoints * share;
        const whole = Math.floor(banked + 1e-9);
        intel.traitRemainder[key] = banked - whole;
        if (whole <= 0) return;
        trait.level += whole;
        for (let i = 0; i < whole; i++) awardedTraits.push([type, trait.id]);
        wholeHere += whole;
        lastName = trait.name;
      });

      // Kept in step with the per-trait banks, so the category figure the
      // Intelligence page shows still means "progress towards the next point".
      intel.remainder = Object.keys(intel.traitRemainder)
        .reduce((sum, k) => sum + (Number(intel.traitRemainder[k]) || 0), 0);

      if (wholeHere > 0) {
        const label = intTypes.find((x) => x.key === type);
        distribution.push({ type, points: wholeHere, share: categoryWeight / totalTyped, trait: lastName, short: label ? label.short : type });
      }
    });

    return { distribution, banked: 0, awardedTraits };
  }
  SYS.allocatePoints = allocatePoints;

  function levelLogDate() { return new Date().toLocaleDateString(); }

  // The single entry/exit point for every EXP change, positive or negative.
  // Every level-up pushes a record onto state.levelHistory capturing exactly what
  // it granted (which traits, how many banked points, the remainder/composition
  // state right before it fired). Crossing back below a level threshold pops that
  // exact record and reverses it precisely — no drift, no double-granting if the
  // same range of EXP is gained back later.
  // `meta` carries what the movement was about — currently the id of the AI
  // price the task was given — for the journal to record. It is not used by the
  // ledger itself and never affects the outcome.
  function applyExpDelta(state, delta, taggedTypes, sourceLabel, traitTargets, meta) {
    if (!delta) return [];
    // What the ledger stood at before any of this — see the journal hook at
    // the end for why the requested delta is not a safe substitute.
    const totalBefore = totalExp(state.player);
    state.levelHistory = state.levelHistory || [];
    state.player.traitComposition = state.player.traitComposition || {};
    const notifications = [];
    const types = taggedTypes && taggedTypes.length ? taggedTypes : ["general"];
    types.forEach((t) => {
      state.player.composition[t] = (state.player.composition[t] || 0) + delta / types.length;
    });
    // Mirror the same split one level deeper for any category the task named
    // a specific trait for, so allocatePoints can invest where the work
    // actually went. Tasks without trait targets simply don't contribute
    // here and fall back to weakest-trait allocation.
    (traitTargets || []).forEach((tt) => {
      if (!tt || !tt.category || !tt.trait || !types.includes(tt.category)) return;
      const bucket = state.player.traitComposition[tt.category] || {};
      bucket[tt.trait] = (bucket[tt.trait] || 0) + delta / types.length;
      state.player.traitComposition[tt.category] = bucket;
    });

    // What THIS delta says it builds, kept apart from the running pool.
    //
    // The pool carries whatever earlier tasks left unconverted, and the award
    // used to pick from it — so a large task aimed at one trait could take the
    // point a small task in the same category had just earned. Logging a drink
    // of water credited Handcrafts, and then Yoga, while the row plainly read
    // "builds Health". The name was right, the match was right, and the award
    // still went elsewhere, because the award was never reading the task.
    //
    // A task that names a trait now decides where its own points go. The pool
    // is consulted only for work that named nothing.
    const deltaTargets = {};
    (traitTargets || []).forEach((tt) => {
      if (!tt || !tt.category || !tt.trait || !types.includes(tt.category)) return;
      deltaTargets[tt.category] = deltaTargets[tt.category] || {};
      deltaTargets[tt.category][tt.trait] = (deltaTargets[tt.category][tt.trait] || 0) + 1;
    });
    const namesATrait = Object.keys(deltaTargets).length > 0;

    let level = state.player.level;
    let exp = state.player.exp + delta;
    let rankIdx = SYS.RANKS.indexOf(state.player.rank);
    const logEntries = [];
    // One delta can now cross a great many levels: a G-Rank level costs 15 EXP,
    // so a single 500-point quest crosses thirty-three of them. Announcing each
    // one separately buried the screen in identical cards and hid the thing the
    // person actually wanted to read. The span is announced once instead, and
    // the points are totalled per trait rather than per level.
    let levelsGained = 0, levelsLost = 0;
    const pointsByTrait = new Map();
    notifications.push({ kind: delta > 0 ? "exp" : "expLoss", text: `${delta > 0 ? "+" : ""}${delta.toFixed(0)} EXP · ${sourceLabel}` });

    while (exp >= SYS.levelCost(rankIdx)) {
      if (level >= SYS.LEVELS_PER_RANK && rankIdx >= SYS.RANKS.length - 1) { exp = SYS.levelCost(rankIdx) - 1; break; }

      const remainderSnapshot = {};
      Object.keys(state.intelligences).forEach((k) => {
        remainderSnapshot[k] = {
          category: state.intelligences[k].remainder,
          traits: { ...(state.intelligences[k].traitRemainder || {}) },
        };
      });
      const levelBefore = level, rankIdxBefore = rankIdx;

      // What the level costs in EXP is also what it draws from the attribution.
      // The snapshot is what was drawn, not what was there — undo adds it back,
      // and only the consumed part was ever removed.
      const { used: compositionSnapshot, usedTraits: traitCompositionSnapshot } =
        consumeComposition(state, SYS.levelCost(rankIdx));

      // Charged at the rank the level was earned in, before any promotion
      // below moves rankIdx on.
      exp -= SYS.levelCost(rankIdx);
      level += 1;

      const { distribution, banked, awardedTraits } = allocatePoints(
        state.intelligences,
        compositionSnapshot,
        SYS.pointsForLevel(rankIdx),
        state.intTypes,
        namesATrait ? deltaTargets : traitCompositionSnapshot
      );
      state.player.bankedPoints += banked;
      state.levelHistory.push({ levelBefore, rankIdxBefore, awardedTraits, banked, compositionSnapshot, traitCompositionSnapshot, remainderSnapshot });

      if (level > SYS.LEVELS_PER_RANK) {
        rankIdx += 1;
        level = 1;
        notifications.push({ kind: "rankup", text: `Welcome to ${SYS.RANKS[rankIdx]}-Rank`, rank: SYS.RANKS[rankIdx] });
        logEntries.push({ date: levelLogDate(), text: `RANK UP → ${SYS.RANKS[rankIdx]}-Rank` });
      } else {
        levelsGained += 1;
        const distText = distribution.length
          ? distribution.map((d) => `+${d.points} ${d.short} (${Math.round(d.share * 100)}% → ${d.trait})`).join(", ")
          : banked > 0 ? `${banked} point(s) banked — no tagged activity this level` : "";
        logEntries.push({ date: levelLogDate(), text: `Level ${level - 1} → ${level}${distText ? ": " + distText : ""}` });
        distribution.forEach((d) => {
          const key = d.trait + "\u0000" + d.short;
          pointsByTrait.set(key, (pointsByTrait.get(key) || 0) + d.points);
        });
      }
    }

    while (exp < 0) {
      const record = state.levelHistory.pop();
      if (!record) { exp = 0; break; } // floor: can't undo past the very beginning

      const rankDownHappening = rankIdx !== record.rankIdxBefore;

      record.awardedTraits.forEach(([typeKey, traitId]) => {
        const intel = state.intelligences[typeKey];
        const tr = intel && intel.traits.find((x) => x.id === traitId);
        if (tr && tr.level > 0) tr.level -= 1;
      });
      state.player.bankedPoints = Math.max(0, state.player.bankedPoints - record.banked);
      Object.keys(record.remainderSnapshot).forEach((k) => {
        const intel = state.intelligences[k];
        if (!intel) return;
        const snap = record.remainderSnapshot[k];
        // Records written before fractions banked per trait hold a bare number.
        if (snap && typeof snap === "object") {
          intel.remainder = snap.category;
          intel.traitRemainder = { ...(snap.traits || {}) };
        } else {
          intel.remainder = snap;
        }
      });
      // Merge (not overwrite): composition already holds this call's own in-flight
      // contribution (added before this loop ran); the snapshot is what composition
      // held right before the level-up we're now undoing reset it to {}. Adding
      // them together nets out to exactly the pre-level-up value.
      Object.keys(record.compositionSnapshot).forEach((k) => {
        state.player.composition[k] = (state.player.composition[k] || 0) + record.compositionSnapshot[k];
      });
      // Same merge-not-overwrite reasoning as composition above, one level
      // deeper. Older levelHistory records predate trait targeting and simply
      // have nothing to restore.
      Object.keys(record.traitCompositionSnapshot || {}).forEach((cat) => {
        const snapBucket = record.traitCompositionSnapshot[cat];
        const bucket = state.player.traitComposition[cat] || {};
        Object.keys(snapBucket).forEach((traitName) => {
          bucket[traitName] = (bucket[traitName] || 0) + snapBucket[traitName];
        });
        state.player.traitComposition[cat] = bucket;
      });

      level = record.levelBefore;
      rankIdx = record.rankIdxBefore;
      // Refunded at that rank's price, not today's — the level being undone
      // was bought at the rate in force when it was earned.
      exp += SYS.levelCost(rankIdx);

      if (rankDownHappening) {
        notifications.push({ kind: "rankdown", text: `Dropped to ${SYS.RANKS[rankIdx]}-Rank`, rank: SYS.RANKS[rankIdx] });
        logEntries.push({ date: levelLogDate(), text: `RANK DOWN → ${SYS.RANKS[rankIdx]}-Rank (progress reverted)` });
      } else {
        levelsLost += 1;
        logEntries.push({ date: levelLogDate(), text: `Level ${level + 1} → ${level} (reverted)` });
      }
    }

    Object.keys(state.player.composition).forEach((k) => { if (Math.abs(state.player.composition[k]) < 1e-9) delete state.player.composition[k]; });
    Object.keys(state.player.traitComposition).forEach((cat) => {
      const bucket = state.player.traitComposition[cat];
      Object.keys(bucket).forEach((n) => { if (Math.abs(bucket[n]) < 1e-9) delete bucket[n]; });
      if (!Object.keys(bucket).length) delete state.player.traitComposition[cat];
    });
    // Placed before the player object is rewritten so the "from" is still
    // readable, but pushed in the order they happened: EXP, then the climb,
    // then what it bought.
    if (levelsGained) {
      notifications.push({
        kind: "levelup",
        text: levelsGained === 1
          ? tr("notif.levelReached", { n: level })
          : tr("notif.levelsGained", { n: level, count: levelsGained }),
      });
    }
    if (levelsLost) {
      notifications.push({
        kind: "delevel",
        text: levelsLost === 1
          ? tr("notif.levelLost", { n: level })
          : tr("notif.levelsLost", { n: level, count: levelsLost }),
      });
    }
    // Sorted by size so the trait that actually grew leads, and capped: past a
    // handful these stop being news and become a wall again.
    [...pointsByTrait.entries()]
      .map(([key, points]) => { const [trait, short] = key.split("\u0000"); return { trait, short, points }; })
      .sort((a, b) => b.points - a.points)
      .slice(0, 4)
      .forEach((d) => notifications.push({ kind: "skillpoint", text: `+${d.points} pt → ${d.trait} (${d.short})` }));

    state.player = { ...state.player, rank: SYS.RANKS[rankIdx], level, exp: Math.max(0, exp) };
    state.log = [...logEntries, ...state.log].slice(0, 80);
    bumpDailyStat(state, "xp", delta);
    // Every EXP movement in the app funnels through here, which makes this the
    // one place a complete record can be taken without dotting the same call
    // through a dozen call sites and eventually missing one. Strictly an
    // observer: it runs after the ledger is settled, its return value is
    // ignored, and a throw inside it must not corrupt a completed change —
    // hence the guard. Nothing about EXP behaves differently for its presence.
    //
    // It reports what the ledger actually moved, never the delta it was
    // handed. The two part company at both ends of the scale: a penalty
    // bigger than someone's remaining EXP stops at zero, and gains past
    // S-Rank Lv100 are discarded. Recording the request instead of the
    // outcome would drift the public standing away from the real one every
    // time either happens — downwards at the floor, upwards at the ceiling —
    // and nothing would ever reconcile it back.
    const applied = totalExp(state.player) - totalBefore;
    if (applied && !SYS.suppressExpJournal && typeof SYS.onExpDelta === "function") {
      try { SYS.onExpDelta(applied, sourceLabel, meta); } catch (e) { console.warn("[TheSystem] exp journal hook failed", e); }
    }
    return notifications;
  }
  // Used by the migration that clears the old banked pile — the same rule the
  // allocator applies when nothing says where a point belongs.
  SYS.placeUnattributedPoints = function (state, count) {
    return placeWeakest(state.intelligences, state.intTypes, Math.max(0, Math.round(count) || 0));
  };

  SYS.applyExpDelta = applyExpDelta;

  // Set while applying a correction that was itself worked out from the
  // journal. Journalling such a correction would move the very total it was
  // derived from, and the two would then chase each other upwards forever.
  SYS.suppressExpJournal = false;

  // A single sortable number for "how far has this player actually come".
  //
  // rank/level/exp are three counters that only mean something together:
  // exp runs 0-99 inside a level, level runs 1-100 inside a rank, and rank
  // walks SYS.RANKS. Comparing two players on `level` alone would put an
  // F-rank level 3 above a G-rank level 99, so the leaderboard sorts on this
  // flattened total instead.
  //
  // The Cloud Function that mirrors users/{uid} into leaderboard/{uid}
  // computes the same thing (functions/index.js totalExpOf) — the two must
  // stay in step, so change them together.
  function totalExp(player) {
    if (!player) return 0;
    const rankIdx = SYS.rankIndex(player.rank);
    const level = Math.max(1, Number(player.level) || 1);
    const exp = Math.max(0, Number(player.exp) || 0);
    // Ranks are no longer the same size, so this has to add up the ones
    // already crossed rather than multiply out a single figure.
    let total = 0;
    for (let r = 0; r < rankIdx; r++) total += SYS.RANK_LEVEL_EXP[r] * SYS.LEVELS_PER_RANK;
    return total + (level - 1) * SYS.levelCost(rankIdx) + exp;
  }
  SYS.totalExp = totalExp;

  // The inverse: turns one trusted total back into the three counters people
  // actually read. The leaderboard uses this so a row's rank and level are
  // derived from the number the server vouches for, rather than copied from
  // whatever the client claimed alongside it.
  function expToStanding(total) {
    let t = Math.max(0, Math.floor(Number(total) || 0));
    const topIdx = SYS.RANKS.length - 1;
    for (let r = 0; r <= topIdx; r++) {
      const cost = SYS.RANK_LEVEL_EXP[r];
      const wholeRank = cost * SYS.LEVELS_PER_RANK;
      if (t < wholeRank || r === topIdx) {
        const levelsDone = Math.floor(t / cost);
        // Nothing above the last rank: past its ceiling the level would
        // otherwise wrap and present a maxed-out player as Lv 1.
        if (levelsDone >= SYS.LEVELS_PER_RANK) {
          return { rank: SYS.RANKS[topIdx], level: SYS.LEVELS_PER_RANK, exp: cost - 1 };
        }
        return { rank: SYS.RANKS[r], level: levelsDone + 1, exp: t - levelsDone * cost };
      }
      t -= wholeRank;
    }
  }
  SYS.expToStanding = expToStanding;

  // Puts the ledger back to a total the server vouches for.
  //
  // The ordinary route is a plain delta through applyExpDelta, which keeps
  // levels, trait investment and undo history exactly consistent. That covers
  // what this is normally for: small drift, and restoring a device whose local
  // data was lost.
  //
  // It cannot always get there, and the case where it can't is the interesting
  // one. Undoing a level means replaying the record that created it, and a
  // hand-edited state carries levels no record was ever written for — so the
  // reversal runs out of history and floors at zero instead of landing on the
  // target. There is no faithful way to rewind a state that no legitimate
  // sequence produced. The honest outcome is to restore the standing the
  // record actually supports, and to stop there rather than invent a trait
  // ledger to match; those points were awarded, wrongly, and pretending to
  // know which ones to take back would be its own fiction.
  function reconcileExpTo(state, targetTotal, label) {
    const target = Math.max(0, Math.floor(Number(targetTotal) || 0));
    if (target === totalExp(state.player)) return [];
    const wasSuppressed = SYS.suppressExpJournal;
    // Suppressed because this figure was read *from* the journal; recording it
    // would move the total it was calculated from.
    SYS.suppressExpJournal = true;
    try {
      const notifications = applyExpDelta(state, target - totalExp(state.player), [], label || "Corrected");
      if (totalExp(state.player) !== target) {
        const standing = expToStanding(target);
        state.player = { ...state.player, rank: standing.rank, level: standing.level, exp: standing.exp };
      }
      return notifications;
    } finally {
      SYS.suppressExpJournal = wasSuppressed;
    }
  }
  SYS.reconcileExpTo = reconcileExpTo;

  // Gradual and simple/all-at-once tasks share one rule: a task's EXP contribution
  // always equals pt/divisor * completion%, full stop. Moving completion (or
  // editing Pt) in either direction applies the exact delta via applyExpDelta —
  // raising it grants EXP/levels, lowering it takes them back, precisely.
  function applyTaskProgress(state, taskId, newCompletion) {
    const t = state.tasks.find((x) => x.id === taskId);
    if (!t) return [];
    const clamped = Math.max(0, Math.min(100, newCompletion));
    const newExpTotal = Math.floor(ptToExp(t.pt) * (clamped / 100));
    const delta = newExpTotal - t.expBaseline;
    const wasDone = t.completion >= 100;
    t.completion = clamped;
    t.expBaseline = newExpTotal;
    const nowDone = clamped >= 100;
    if (nowDone && !wasDone) { state.player.questsCompleted += 1; bumpDailyStat(state, "quests", 1); }
    if (!nowDone && wasDone) { state.player.questsCompleted = Math.max(0, state.player.questsCompleted - 1); bumpDailyStat(state, "quests", -1); }
    if (delta !== 0) return applyExpDelta(state, delta, t.types, t.title, t.traitTargets, { priceId: t.priceId });
    return [];
  }
  SYS.applyTaskProgress = applyTaskProgress;

  function completeSimpleTask(state, taskId) { return applyTaskProgress(state, taskId, 100); }
  SYS.completeSimpleTask = completeSimpleTask;

  function reopenSimpleTask(state, taskId) { return applyTaskProgress(state, taskId, 0); }
  SYS.reopenSimpleTask = reopenSimpleTask;

  function addTask(state, form) {
    const base = {
      id: SYS.uid("task"),
      title: form.title.trim(),
      priority: form.priority,
      types: form.types,
      pt: Number(form.pt) || 0,
      notes: form.notes || "",
      // From AI evaluation: which specific trait in each tagged category this
      // task builds. Absent on anything created before AI pricing existed,
      // which just falls back to weakest-trait allocation.
      traitTargets: Array.isArray(form.traitTargets) ? form.traitTargets : [],
      // Which recorded evaluation set this task's value. The server checks
      // journal entries against it; tasks predating this simply have none, and
      // their entries count as unverified rather than being refused.
      priceId: typeof form.priceId === "string" ? form.priceId : null,
    };
    // Which library habit this was, if any. Only so the library can show it
    // as already added — nothing reads it to decide value or behaviour.
    if (typeof form.fromLibrary === "string" && form.fromLibrary) base.fromLibrary = form.fromLibrary;
    // Appearance is optional. Left unset, the card derives an emoji and a
    // colour from the title, so these are only written when someone actually
    // chose something — which also keeps them out of the synced document for
    // every task nobody has styled.
    const iconIn = SYS.clampIcon(form.icon);
    if (iconIn) base.icon = iconIn;
    if (form.recurring) {
      const quit = !!form.quit;
      state.tasks.push({
        ...base,
        recurring: true,
        taskType: "Recurring", mode: "recurring", completion: 0, expBaseline: 0,
        ...(quit ? { quit: true } : {}),
        ...(sanitizeRemindAt(form.remindAt) ? { remindAt: sanitizeRemindAt(form.remindAt) } : {}),
        schedule: quit ? { type: "daily" } : sanitizeSchedule(form.schedule),
        unit: quit ? "times" : ((form.unit || "reps").trim() || "reps"),
        targetAmount: quit ? 1 : (Number(form.targetAmount) || 1),
        days: {},
      });
    } else {
      const mode = form.taskType === "Long Term" ? form.mode : "simple";
      state.tasks.push({ ...base, recurring: false, taskType: form.taskType, mode, completion: 0, expBaseline: 0 });
    }
  }
  SYS.addTask = addTask;

  // Editing a task's Pt value changes what its current completion% is worth —
  // that delta flows through applyExpDelta too, same as moving completion does,
  // so the ledger stays consistent no matter which field changed. Switching
  // between one-off and recurring mid-life resets the fields that no longer
  // apply, but never retroactively grants/revokes EXP for that switch itself.
  function updateTask(state, taskId, form) {
    const t = state.tasks.find((x) => x.id === taskId);
    if (!t) return [];
    t.title = form.title.trim();
    t.priority = form.priority;
    t.types = form.types;
    t.pt = Number(form.pt) || 0;
    t.notes = form.notes || "";
    // Deleted rather than set empty when cleared, so the task goes back to
    // deriving its look instead of being pinned to a blank one.
    const nextIcon = SYS.clampIcon(form.icon);
    if (nextIcon) t.icon = nextIcon;
    else delete t.icon;
    // A colour used to live here. Any left on a task from that version is
    // dropped on the next edit rather than lingering unread in the document.
    delete t.hue;

    const wasRecurring = !!t.recurring;
    t.recurring = !!form.recurring;

    if (t.recurring) {
      const quit = !!form.quit;
      t.taskType = "Recurring";
      t.mode = "recurring";
      if (quit) t.quit = true; else delete t.quit;
      const remindAt = sanitizeRemindAt(form.remindAt);
      if (remindAt) t.remindAt = remindAt; else delete t.remindAt;
      t.schedule = quit ? { type: "daily" } : sanitizeSchedule(form.schedule);
      delete t.repeatsPerWeek;
      t.unit = quit ? "times" : ((form.unit || "reps").trim() || "reps");
      t.targetAmount = quit ? 1 : (Number(form.targetAmount) || 1);
      if (!wasRecurring) { t.days = {}; t.completion = 0; t.expBaseline = 0; }
      return [];
    }

    if (wasRecurring) { t.completion = 0; t.expBaseline = 0; }
    const mode = form.taskType === "Long Term" ? form.mode : "simple";
    t.taskType = form.taskType;
    t.mode = mode;
    const newExpTotal = Math.floor(ptToExp(t.pt) * (t.completion / 100));
    const delta = newExpTotal - t.expBaseline;
    t.expBaseline = newExpTotal;
    if (delta !== 0) return applyExpDelta(state, delta, t.types, t.title + " (edited)", t.traitTargets, { priceId: t.priceId });
    return [];
  }
  SYS.updateTask = updateTask;

  // Applies an admin-approved correction to a task's value (see the appeal
  // flow in functions/index.js). Deliberately routes through the same
  // baseline-delta path an edit already uses, so the EXP difference is exact
  // and the undo ledger stays consistent.
  //
  // For a habit the new value applies to future repeats only: repeats already
  // logged were genuinely earned at the old rate, and only the current week's
  // individual repeats are even retained, so any "back-pay" would be
  // arbitrary about how far back it reached. Forward-only is the honest rule,
  // and the admin can still send a one-off adjustment for the difference.
  function repriceTask(state, taskId, newPt) {
    const t = state.tasks.find((x) => x.id === taskId);
    if (!t) return [];
    const pt = Math.max(0, Number(newPt) || 0);
    if (pt === t.pt) return [];
    t.pt = pt;
    if (t.recurring) return [{ kind: "info", text: `${t.title} is now worth ${pt} xp per repeat.` }];

    const newExpTotal = Math.floor(ptToExp(t.pt) * (t.completion / 100));
    const delta = newExpTotal - t.expBaseline;
    t.expBaseline = newExpTotal;
    if (delta !== 0) return applyExpDelta(state, delta, t.types, t.title + " (value corrected)", t.traitTargets, { priceId: t.priceId });
    return [{ kind: "info", text: `${t.title} is now worth ${pt} xp.` }];
  }
  SYS.repriceTask = repriceTask;

  function removeTask(state, taskId) {
    state.tasks = state.tasks.filter((t) => t.id !== taskId);
  }
  SYS.removeTask = removeTask;

  // A day is finished when what has been logged on it reaches the goal, and
  // the EXP for it is granted exactly once at the moment it crosses.
  //
  // Going past the goal is free and changes nothing: drinking three litres
  // against a two litre goal is not worth more than two, and the app should
  // not quietly turn a goal into a rate. Falling back under it — by undoing
  // or removing an amount — gives the EXP back, because a ledger that only
  // moves one way is not a ledger.
  function settleDay(state, t, key, before, notifications) {
    const goal = habitGoalBase(t);
    const now = habitAmountOn(t, key);
    const wasDone = before >= goal;
    const isDone = now >= goal;
    if (isDone === wasDone) return notifications;

    const days = { ...habitDays(t) };
    if (isDone) {
      days[key] = { ...days[key], n: (days[key] ? days[key].n : 0) + 1, amount: now };
      t.days = days;
      bumpDailyStat(state, "repeats", 1, key);
      recordHabitTouch(state, key, taskIdOf(t));
      notifications.push(...applyExpDelta(state, ptToExp(t.pt), t.types, t.title, t.traitTargets, { priceId: t.priceId }));
      const period = periodProgress(t, key);
      if (period.target > 0 && period.done === period.target) {
        const scope = period.scope === "month" ? "Monthly" : period.scope === "window" ? "Cycle" : "Weekly";
        notifications.push({ kind: "info", text: `${scope} goal reached — ${t.title}` });
      }
      const streak = habitStreak(t);
      if (streak.n >= 3) {
        const word = streak.scope === "day" ? "days" : streak.scope === "month" ? "months" : streak.scope === "week" ? "weeks" : "cycles";
        notifications.push({ kind: "info", text: `${streak.n} ${word} in a row — ${t.title}` });
      }
    } else {
      // Give back one grant. A day carried over from the old model can hold
      // several; each is returned by its own step down, never in a lump.
      const n = (days[key] ? days[key].n : 0) - 1;
      // A day with nothing logged on it still exists if it carries a note:
      // "skipped, was ill" is worth keeping, and it is the case a journal is
      // most useful for.
      const noteHere = dayNote(days[key]);
      const slipHere = !!(days[key] || {}).slip;
      if (n > 0) days[key] = { ...days[key], n, amount: now };
      else if (now > 0 || noteHere || slipHere) days[key] = { ...days[key], n: 0, amount: now };
      else delete days[key];
      t.days = days;
      bumpDailyStat(state, "repeats", -1, key);
      if (!habitDoneOn(t, key)) unrecordHabitTouch(state, key, taskIdOf(t));
      notifications.push(...applyExpDelta(state, -ptToExp(t.pt), t.types, t.title + " (undo)", t.traitTargets, { priceId: t.priceId }));
    }
    return notifications;
  }
  function taskIdOf(t) { return t.id; }

  // Add a measured amount toward a day, in any unit of the same family: a
  // goal in litres accepts millilitres, one in hours accepts minutes. A unit
  // from another family is refused rather than guessed at.
  function addHabitAmount(state, taskId, dayKey, value, unit) {
    const t = state.tasks.find((x) => x.id === taskId);
    if (!t || !t.recurring) return [];
    const key = dayKey || todayKey();
    if (key > todayKey()) return [{ kind: "info", text: "That day hasn't happened yet." }];
    migrateHabitDays(t); migrateHabitAmounts(t);

    const delta = SYS.toBase(value, unit || t.unit, t.unit);
    if (delta === null || !delta) return [];
    const before = habitAmountOn(t, key);
    const next = Math.max(0, before + delta);
    const days = { ...habitDays(t) };
    days[key] = { ...days[key], n: days[key] ? days[key].n : 0, amount: next };
    t.days = days;
    pruneHabitDays(t);
    return settleDay(state, t, key, before, []);
  }
  SYS.addHabitAmount = addHabitAmount;

  // The card's big control: finish the day outright, or clear it. Setting it
  // to the goal rather than adding one unit is what makes a single press
  // still mean "done" for a habit measured in litres.
  function logHabitDay(state, taskId, dayKey) {
    const t = state.tasks.find((x) => x.id === taskId);
    if (!t || !t.recurring) return [];
    const key = dayKey || todayKey();
    if (key > todayKey()) return [{ kind: "info", text: "That day hasn't happened yet." }];
    migrateHabitDays(t); migrateHabitAmounts(t);
    if (habitDoneOn(t, key)) return [{ kind: "info", text: t.title + " is already done for that day." }];

    const before = habitAmountOn(t, key);
    // One press means the whole goal. A measured amount — from the timer, or
    // from the keypad — goes through addHabitAmount instead, which adds
    // rather than completing.
    const next = Math.max(habitGoalBase(t), before);
    const days = { ...habitDays(t) };
    days[key] = { ...days[key], n: days[key] ? days[key].n : 0, amount: next };
    t.days = days;
    pruneHabitDays(t);
    return settleDay(state, t, key, before, []);
  }
  SYS.logHabitDay = logHabitDay;

  // Clearing a day drops what was logged on it and returns whatever it paid.
  function unlogHabitDay(state, taskId, dayKey) {
    const t = state.tasks.find((x) => x.id === taskId);
    if (!t || !t.recurring) return [];
    migrateHabitDays(t); migrateHabitAmounts(t);
    const key = dayKey || todayKey();
    const day = habitDays(t)[key];
    if (!day) return [];

    const before = habitAmountOn(t, key);
    const notifications = [];
    // A migrated day can hold several grants. Step down through them so the
    // EXP returned equals the EXP given, then remove the day.
    let guard = 0;
    while (habitDoneOn(t, key) && guard++ < 50) {
      const days = { ...habitDays(t) };
      days[key] = { ...days[key], n: days[key].n, amount: 0 };
      t.days = days;
      settleDay(state, t, key, before, notifications);
    }
    const days = { ...habitDays(t) };
    // Clearing a day clears what was logged, not what was written about it —
    // or the fact that it was a slip.
    const note = dayNote(days[key]);
    const slip = !!(days[key] || {}).slip;
    if (note || slip) {
      days[key] = { n: 0, amount: 0 };
      if (note) days[key].note = note;
      if (slip) days[key].slip = true;
    } else delete days[key];
    t.days = days;
    return notifications;
  }
  SYS.unlogHabitDay = unlogHabitDay;

  // SYS.spendBankedPoint used to live here. Placing points by hand was the last
  // thing a player decided for themselves, and it sat oddly beside a system
  // that sets every value, category and trait. Nothing banks any more, so
  // there is nothing left to place by hand.

  function addTrait(state, typeKey, name, ar) {
    if (!name.trim()) return;
    state.intelligences[typeKey].traits.push({ id: SYS.uid("trait"), name: name.trim(), ar: (ar || "").trim(), level: 0 });
  }
  SYS.addTrait = addTrait;

  function removeTrait(state, typeKey, traitId) {
    const intel = state.intelligences[typeKey];
    if (intel.traits.length <= 1) return; // keep at least one trait per category
    intel.traits = intel.traits.filter((t) => t.id !== traitId);
  }
  SYS.removeTrait = removeTrait;

  function addIntType(state, { name, ar, short, color }) {
    const key = "custom_" + SYS.uid("").slice(0, 8);
    state.intTypes.push({ key, name: name.trim(), ar: (ar || "").trim(), short: (short || name.slice(0, 4)).toUpperCase(), color: SYS.sanitizeColor(color, "#4fd1ff") });
    state.intelligences[key] = { remainder: 0, traits: [{ id: SYS.uid("trait"), name: "First trait", ar: "", level: 0 }] };
    return key;
  }
  SYS.addIntType = addIntType;

  function setName(state, name) {
    state.player.name = name || "Hunter";
  }
  SYS.setName = setName;

  function setTheme(state, themeName) {
    if (SYS.THEMES[themeName] || themeName === SYS.CUSTOM_THEME_NAME) state.settings.theme = themeName;
  }
  SYS.setTheme = setTheme;

  function setLanguage(state, code) {
    if (SYS.LANGUAGES[code]) state.settings.language = code;
  }
  SYS.setLanguage = setLanguage;

  // Updates the user-defined palette and switches to it. Colours are
  // sanitised here rather than trusted, same as intelligence-category
  // colours — this value ends up interpolated into CSS.
  function setCustomTheme(state, opts) {
    const cur = state.settings.customTheme || {};
    const next = {
      dark: typeof opts.dark === "boolean" ? opts.dark : !!cur.dark,
      accent: SYS.sanitizeColor(opts.accent, cur.accent || "#d9a05b"),
      base: SYS.sanitizeColor(opts.base, cur.base || "#141110"),
    };
    // The dark/light buttons pick a matching background rather than only
    // flipping a flag — the palette derives light-vs-dark text from the
    // background itself, so a mode switch that left a near-black background
    // in place would appear to do nothing.
    if (typeof opts.dark === "boolean" && opts.dark !== !!cur.dark) {
      next.base = opts.dark ? "#141110" : "#ffffff";
    }
    // Keep the stored flag honest about what will actually render, so the
    // toggle reflects reality after the background alone is changed.
    next.dark = SYS.luminance(next.base) < 0.5;
    state.settings.customTheme = next;
    state.settings.theme = SYS.CUSTOM_THEME_NAME;
  }
  SYS.setCustomTheme = setCustomTheme;
})(window.SYS = window.SYS || {});

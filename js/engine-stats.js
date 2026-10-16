// Game rules: what the Stats page is made of, and this period against the one before.
// One of the files engine.js was split into (2026-10-16); the names they share travel through
// SYS._engine, and each file takes what it needs from the files loaded before it.
(function (SYS) {
  "use strict";
  const E = SYS._engine || (SYS._engine = {});
  const { MARK_DONE, MARK_MISSED, MARK_NONE, MARK_YEARS, dateKey, dayFraction, dayInfo, dayNote, daysInYear, habitAmountOn, habitDays, habitDoneOn, habitFirstDay, habitStreak, isDayKey, markAsked, markOn, mondayOf, parseKey, shiftDate, shiftDay, todayKey } = E;

  // ---------- What the Stats page is made of ------------------------------

  function recurring(state) { return (state.tasks || []).filter((t) => t.recurring); }

  // The ring around a day in the calendar: how much of what that day asked
  // for was actually done. A day that asked for nothing gets no ring at all
  // rather than an empty one — there is nothing there to have failed.
  function dayRing(state, key) {
    let required = 0, done = 0, complete = 0;
    recurring(state).forEach((t) => {
      const m = markOn(t, key);
      if (!markAsked(m)) return;
      required++;
      done += dayFraction(t, key, m);
      if (m === MARK_DONE) complete++;
    });
    return {
      key, required, done, complete,
      pct: required > 0 ? Math.round((done / required) * 100) : 0,
      // Compared with a tolerance because `done` is a sum of fractions now:
      // three habits at a third each must not miss being whole by a rounding
      // error nobody can see.
      perfect: required > 0 && required - done < 0.001,
    };
  }
  SYS.dayRing = dayRing;

  // The same question asked of a single habit, so the calendar can be scoped
  // to one without a second code path.
  function habitDayRing(task, key) {
    const m = markOn(task, key);
    const frac = dayFraction(task, key, m);
    return {
      key,
      required: markAsked(m) ? 1 : 0,
      done: frac,
      complete: m === MARK_DONE ? 1 : 0,
      pct: Math.round(frac * 100),
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
        out.push({
          key,
          mark: ring.required === 0 ? MARK_NONE
            : ring.perfect ? MARK_DONE
            : ring.pct > 0 ? String(Math.min(9, Math.floor(ring.pct / 10)))
            : MARK_MISSED,
          pct: ring.pct,
        });
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
      // Whole habit-days finished, not a sum of fractions: "habits done" is
      // a count of things completed, and half a litre is not half a habit.
      habitsDone += ring.complete;
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
      // Any day that was asked for and not finished breaks the run, partial
      // ones included: a streak of days you nearly did is not a streak.
      else if (markAsked(m)) run = 0;
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

  // Minutes since local midnight — 0 to 1439. Stored instead of a full
  // timestamp because it is exactly what gets shown and costs four characters
  // rather than twenty-four.
  //
  // It records when the entry was written, not when the thing was done, and
  // that is deliberate: backdating is allowed here, so the honest label for
  // this number is "when you logged it". A day filled in a week later carries
  // the time it was filled in.
  function nowMinutes() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }
  SYS.nowMinutes = nowMinutes;

  function dayTime(day) {
    const at = day && Number(day.at);
    return Number.isFinite(at) && at >= 0 && at <= 1439 ? at : null;
  }
  SYS.dayTime = dayTime;

  // Everything that happened on one day, newest first. This is what a day in
  // the calendar opens into: the habits that have something on them, what each
  // one came to, and when it was written down.
  //
  // Days before the app started keeping times have none, and nothing can give
  // them one — so the row simply has no clock rather than a guessed one.
  function dayLog(state, key) {
    const rows = [];
    recurring(state).forEach((t) => {
      const day = habitDays(t)[key];
      if (!day) return;
      const n = Number(day.n) || 0;
      const amount = Number(day.amount) || 0;
      if (n <= 0 && amount <= 0) return;
      rows.push({
        id: t.id,
        title: t.title,
        unit: t.unit,
        amount,
        n,
        at: dayTime(day),
        done: habitDoneOn(t, key),
        note: dayNote(day),
      });
    });
    // Newest first, and the ones with no time after them rather than pretending
    // they happened at midnight.
    rows.sort((a, b) => {
      if (a.at === null && b.at === null) return a.title.localeCompare(b.title);
      if (a.at === null) return 1;
      if (b.at === null) return -1;
      return b.at - a.at;
    });
    return rows;
  }
  SYS.dayLog = dayLog;

  // ---------- Comparison: this period against the one before it -----------
  //
  // Amounts only, in the habit's own unit, and for one habit at a time on
  // purpose: litres and minutes cannot be added, so an all-habits version
  // would be summing things with no common unit.

  // The amount measured in one calendar month. The live window is summed from
  // the real days; anything older was moved into volByMonth as it was pruned —
  // the same hook, in the one place days are dropped, as the running total.
  function monthVolume(task, monthKey) {
    let sum = Number(task && task.volByMonth && task.volByMonth[monthKey]) || 0;
    const days = habitDays(task);
    Object.keys(days).forEach((k) => {
      if (k.slice(0, 7) === monthKey) sum += Number(days[k].amount) || 0;
    });
    return sum;
  }
  SYS.monthVolume = monthVolume;

  // Two years of months, the same reach as the year grid.
  function pruneVolByMonth(task) {
    if (!task || !task.volByMonth || typeof task.volByMonth !== "object") return false;
    const floor = String(new Date().getFullYear() - (MARK_YEARS - 1)) + "-01";
    const keep = {};
    let changed = false;
    Object.keys(task.volByMonth).forEach((m) => {
      if (/^\d{4}-\d{2}$/.test(m) && m >= floor) keep[m] = task.volByMonth[m];
      else changed = true;
    });
    if (changed) task.volByMonth = keep;
    return changed;
  }
  SYS.pruneVolByMonth = pruneVolByMonth;

  function monthKeyOf(year, month) {
    const d = new Date(year, month, 1);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  // Bucket i of the current period against bucket i of the one before it.
  // A bucket that has not happened yet is null, not zero — a bar of nothing
  // on Thursday, read on a Tuesday, would look like a Thursday you skipped.
  // A day the shorter month does not have is null for the same reason.
  function comparison(task, span) {
    const today = todayKey();
    const now = new Date();
    const buckets = [];
    const dayAmount = (key) => {
      if (!key || key > today) return null;
      const d = habitDays(task)[key];
      return d ? (Number(d.amount) || 0) : 0;
    };
    if (span === "year") {
      const y = now.getFullYear();
      for (let m = 0; m < 12; m++) {
        const curKey = monthKeyOf(y, m), prevKey = monthKeyOf(y - 1, m);
        buckets.push({ i: m, curKey, prevKey,
          cur: curKey > today.slice(0, 7) ? null : monthVolume(task, curKey),
          prev: monthVolume(task, prevKey) });
      }
    } else if (span === "month") {
      const y = now.getFullYear(), m = now.getMonth();
      const curLen = new Date(y, m + 1, 0).getDate();
      const prevLen = new Date(y, m, 0).getDate();
      // As many buckets as this month has days: the month in focus decides the
      // axis. Last month's days beyond that have no bucket to sit in, and still
      // count in last month's total below.
      for (let d = 1; d <= curLen; d++) {
        const curKey = dateKey(new Date(y, m, d));
        const prevKey = d <= prevLen ? dateKey(new Date(y, m - 1, d)) : null;
        buckets.push({ i: d - 1, curKey, prevKey, cur: dayAmount(curKey), prev: dayAmount(prevKey) });
      }
    } else {
      const monday = mondayOf(now);
      for (let d = 0; d < 7; d++) {
        const curKey = dateKey(shiftDate(monday, d));
        const prevKey = dateKey(shiftDate(monday, d - 7));
        buckets.push({ i: d, curKey, prevKey, cur: dayAmount(curKey), prev: dayAmount(prevKey) });
      }
    }
    let max = 0;
    buckets.forEach((b) => { if (b.cur > max) max = b.cur; if (b.prev > max) max = b.prev; });
    const total = (side) => buckets.reduce((s, b) => s + (b[side] || 0), 0);
    let curTotal = total("cur"), prevTotal = total("prev");
    if (span === "month") {
      // The legend names whole months, so it counts whole months — including
      // a 31st that a 30-day month's axis has no room for.
      curTotal = monthVolume(task, monthKeyOf(now.getFullYear(), now.getMonth()));
      prevTotal = monthVolume(task, monthKeyOf(now.getFullYear(), now.getMonth() - 1));
    }
    return {
      span: span === "year" || span === "month" ? span : "week",
      buckets, max, curTotal, prevTotal,
    };
  }
  SYS.comparison = comparison;

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

  Object.assign(E, { recurring, dayRing, habitDayRing, monthGrid, yearMarks, firstRecordedDay, daySpan, statsAllTime, monthRate, habitVolume, habitVolumeTotal, habitStats, nowMinutes, dayTime, dayLog, monthVolume, pruneVolByMonth, monthKeyOf, comparison, doneToday, statsWeek, statsMonth });
})(window.SYS = window.SYS || {});

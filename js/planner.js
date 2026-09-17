// The planner: a plain day list, kept apart from everything that scores.
//
// Nothing in here touches EXP, the ranking or the evaluator, and nothing that
// does reads this. That separation is the point of the section: somebody can
// write "call the bank" without it being priced, judged or counted, and the
// anti-cheat machinery never has to reason about it.
//
// It rides along inside the saved state like everything else, so it syncs
// the same way and needs no collection of its own — but that also means it
// counts against the one document's size, which is why old days are pruned.
(function (SYS) {
  const TITLE_MAX = 200;
  // Six months of days is more than a to-do list is ever looked back at, and
  // it keeps a heavy user's document far below Firestore's limit. The rules
  // refuse a save past TODO_MAX, so the cap here has to stay under it.
  const KEEP_DAYS = 180;
  const TODO_MAX = 1500;
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

  function cleanTitle(title) {
    return String(title == null ? "" : title).replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
  }

  function emptyPlanner() { return { todos: [], events: [] }; }

  // Idempotent and deterministic for a given day, because it runs on both the
  // local copy and the pulled one before the two are compared.
  function normalizePlanner(state, today) {
    const p = state.planner && typeof state.planner === "object" ? state.planner : emptyPlanner();
    const oldest = SYS.shiftDay(today || SYS.todayKey(), -KEEP_DAYS);
    const seen = new Set();
    const todos = (Array.isArray(p.todos) ? p.todos : [])
      .filter((x) => x && typeof x === "object" && x.id && !seen.has(x.id) && seen.add(x.id))
      .map((x) => ({
        id: String(x.id),
        title: cleanTitle(x.title),
        day: DAY_RE.test(x.day) ? x.day : null,
        done: !!x.done,
        doneAt: x.done && Number(x.doneAt) ? Number(x.doneAt) : null,
        createdAt: Number(x.createdAt) || 0,
        from: DAY_RE.test(x.from) ? x.from : null,
        asked: !!x.asked,
      }))
      .filter((x) => x.title && x.day && x.day >= oldest);
    // Past the cap, the oldest days go first.
    if (todos.length > TODO_MAX) {
      todos.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.createdAt - b.createdAt));
      todos.splice(0, todos.length - TODO_MAX);
    }
    const seenEvents = new Set();
    const events = (Array.isArray(p.events) ? p.events : [])
      .filter((x) => x && typeof x === "object" && x.id && !seenEvents.has(x.id) && seenEvents.add(x.id))
      .map((x) => cleanEvent(x, oldest))
      .filter((x) => x && (lastDayOf(x) === null || lastDayOf(x) >= oldest));
    // Past the cap, the events that ended longest ago go first; an event that
    // never ends is kept over any that has.
    if (events.length > EVENT_MAX) {
      const endKey = (x) => lastDayOf(x) || "9999-12-31";
      events.sort((a, b) => (endKey(a) < endKey(b) ? -1 : endKey(a) > endKey(b) ? 1 : a.createdAt - b.createdAt));
      events.splice(0, events.length - EVENT_MAX);
    }
    state.planner = { todos, events };
    return state.planner;
  }
  SYS.normalizePlanner = normalizePlanner;

  function plannerOf(state) {
    if (!state.planner || typeof state.planner !== "object") state.planner = emptyPlanner();
    if (!Array.isArray(state.planner.todos)) state.planner.todos = [];
    if (!Array.isArray(state.planner.events)) state.planner.events = [];
    return state.planner;
  }

  // ---------- events ----------
  //
  // An event is a series: a first day, an optional repeat, and two kinds of
  // exception — days skipped, and days whose title or time was changed for
  // that day alone. "This and following" is a split: the old series ends the
  // day before and a new one starts, which keeps every past day as it was.
  //
  // An event can run over several days: `span` is how many days after its
  // start day it ends (0 = the same day). A trip from Thursday 03:00 to
  // Sunday 11:00 has span 3; it is drawn to midnight on Thursday, whole on
  // Friday and Saturday, and to 11:00 on Sunday. An event saved before spans
  // existed with an end earlier than its start was a night, and reads as
  // span 1.

  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const REPEATS = ["none", "daily", "weekly", "monthly"];
  // Monthly: the same date (the month's last day when it is shorter), the
  // same weekday in the same week ("the second Tuesday", or "the last" when
  // the first day was in the month's fifth week), or the last day.
  const MONTH_BY = ["date", "weekday", "lastDay"];
  const EVENT_MAX = 600;

  function weekdayOf(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  }
  function domOf(key) { return Number(key.slice(8, 10)); }
  function daysInMonthOf(key) {
    return new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate();
  }
  // Which week of its month a day is in, 1..5 — the "second" of "the second
  // Tuesday". A fifth is always the last one there is.
  function nthOf(key) { return Math.ceil(domOf(key) / 7); }
  SYS.monthWeekOf = nthOf;

  function cleanRepeat(r, start) {
    const type = r && REPEATS.indexOf(r.type) >= 0 ? r.type : "none";
    if (type === "none") return { type, days: [], until: null };
    const monthBy = type === "monthly" && MONTH_BY.indexOf(r.monthBy) >= 0 ? r.monthBy : "date";
    let days = [];
    if (type === "weekly") {
      days = [...new Set((Array.isArray(r.days) ? r.days : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort();
      if (!days.length) days = [weekdayOf(start)];
    }
    const until = r && DAY_RE.test(r.until) && r.until >= start ? r.until : null;
    return type === "monthly" ? { type, days, until, monthBy } : { type, days, until };
  }

  // Minutes before the start, each once, smallest first, at most five and at
  // most a week back. functions/event-reminders.js holds the same rule, and
  // the scheduler only looks a week ahead.
  const REMINDER_MAX_OFFSET = 7 * 1440;
  const REMINDER_MAX = 5;
  function cleanReminders(list) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach((v) => {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 0 && n <= REMINDER_MAX_OFFSET && out.indexOf(n) < 0) out.push(n);
    });
    return out.sort((a, b) => a - b).slice(0, REMINDER_MAX);
  }
  SYS.cleanEventReminders = cleanReminders;
  SYS.EVENT_REMINDER_MAX = REMINDER_MAX;
  SYS.EVENT_REMINDER_MAX_OFFSET = REMINDER_MAX_OFFSET;

  const MAX_SPAN = 62;
  SYS.PLANNER_MAX_SPAN = MAX_SPAN;
  function dayDiff(a, b) {
    const u = (k) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));
    return Math.round((u(a) - u(b)) / 86400000);
  }
  // From an end date when there is one, else a stored span, else the old
  // reading of an end before the start as the next morning.
  function spanOf(x) {
    if (DAY_RE.test(x.end) && DAY_RE.test(x.start)) return dayDiff(x.end, x.start);
    if (Number.isInteger(x.span)) return x.span;
    return !x.allDay && TIME_RE.test(x.from) && TIME_RE.test(x.to) && x.to < x.from ? 1 : 0;
  }

  // On the same day the end has to come after the start; across days any
  // two times will do.
  function cleanTimes(allDay, from, to, span) {
    if (allDay) return { from: null, to: null };
    if (!TIME_RE.test(from) || !TIME_RE.test(to)) return null;
    if (!(span > 0) && to <= from) return null;
    return { from, to };
  }

  // Null when it cannot be an event at all — no title, no day, or an end that
  // is the same as its start. `oldest` prunes exceptions nobody will look at.
  function cleanEvent(x, oldest) {
    const title = cleanTitle(x.title);
    const start = DAY_RE.test(x.start) ? x.start : null;
    const allDay = !!x.allDay;
    const span = start ? spanOf(x) : -1;
    if (!(span >= 0 && span <= MAX_SPAN)) return null;
    const times = cleanTimes(allDay, x.from, x.to, span);
    if (!title || !start || !times) return null;
    const repeat = cleanRepeat(x.repeat, start);
    const floor = oldest && oldest > start ? oldest : start;
    const skip = repeat.type === "none" ? [] :
      [...new Set((Array.isArray(x.skip) ? x.skip : []).filter((k) => DAY_RE.test(k) && k >= floor))].sort();
    const edits = {};
    if (repeat.type !== "none" && x.edits && typeof x.edits === "object") {
      Object.keys(x.edits).sort().forEach((k) => {
        const e = x.edits[k];
        if (!DAY_RE.test(k) || k < floor || !e || typeof e !== "object") return;
        const out = {};
        const t = cleanTitle(e.title);
        if (t) out.title = t;
        if (!allDay && cleanTimes(false, e.from, e.to, span)) { out.from = e.from; out.to = e.to; }
        if (Object.keys(out).length) edits[k] = out;
      });
    }
    return {
      id: String(x.id), title, start, allDay, from: times.from, to: times.to, span,
      repeat, skip, edits, reminders: cleanReminders(x.reminders), createdAt: Number(x.createdAt) || 0,
    };
  }

  function lastDayOf(ev) {
    const last = ev.repeat.type === "none" ? ev.start : ev.repeat.until;
    return last && ev.span ? SYS.shiftDay(last, ev.span) : last;
  }

  function occursOn(ev, day) {
    if (day < ev.start) return false;
    if (ev.repeat.until && day > ev.repeat.until) return false;
    if (ev.skip.indexOf(day) >= 0) return false;
    switch (ev.repeat.type) {
      case "none": return day === ev.start;
      case "daily": return true;
      case "weekly": return ev.repeat.days.indexOf(weekdayOf(day)) >= 0;
      case "monthly": {
        const dim = daysInMonthOf(day);
        if (ev.repeat.monthBy === "lastDay") return domOf(day) === dim;
        if (ev.repeat.monthBy === "weekday") {
          if (weekdayOf(day) !== weekdayOf(ev.start)) return false;
          const nth = nthOf(ev.start);
          return nth >= 5 ? domOf(day) + 7 > dim : nthOf(day) === nth;
        }
        // A rent due on the 31st is due on the 30th in September, not never.
        return domOf(day) === Math.min(domOf(ev.start), dim);
      }
      default: return false;
    }
  }
  SYS.eventOccursOn = occursOn;

  function occurrence(ev, day) {
    const e = ev.edits[day] || {};
    const from = ev.allDay ? null : (e.from || ev.from);
    const to = ev.allDay ? null : (e.to || ev.to);
    const span = ev.span || 0;
    const overnight = !ev.allDay && span > 0;
    // segFrom/segTo are the part drawn on the start day: to midnight when it
    // carries on into the days after.
    return {
      id: ev.id, day, endDay: span ? SYS.shiftDay(day, span) : day, span,
      title: e.title || ev.title, allDay: ev.allDay, from, to,
      overnight, segFrom: from, segTo: overnight ? "24:00" : to,
      recurring: ev.repeat.type !== "none",
    };
  }

  // All-day first, then by start, then by end.
  function eventsOn(state, day) {
    return plannerOf(state).events
      .filter((ev) => occursOn(ev, day))
      .map((ev) => occurrence(ev, day))
      .sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        if (a.from !== b.from) return a.from < b.from ? -1 : 1;
        if (a.to !== b.to) return a.to < b.to ? -1 : 1;
        return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
      });
  }
  SYS.eventsOn = eventsOn;

  // What the day's hours show: its own events, plus the morning end of any
  // night that started the day before. The carried part keeps the day it
  // belongs to, so tapping it opens that occurrence.
  // The parts of events that started on earlier days and are still going on
  // this one: a whole day in the middle, to their end time on the last.
  function carriedOn(state, day) {
    const out = [];
    plannerOf(state).events.forEach((ev) => {
      for (let k = 1; k <= (ev.span || 0); k++) {
        const startDay = SYS.shiftDay(day, -k);
        if (!occursOn(ev, startDay)) continue;
        const o = occurrence(ev, startDay);
        const segTo = o.allDay ? null : (k === o.span ? o.to : "24:00");
        if (!o.allDay && segTo === "00:00") continue;
        out.push({ ...o, segFrom: o.allDay ? null : "00:00", segTo, spill: true });
      }
    });
    return out;
  }

  function timelineOn(state, day) {
    const carried = carriedOn(state, day);
    const own = eventsOn(state, day);
    return {
      allDay: carried.filter((o) => o.allDay).concat(own.filter((o) => o.allDay)),
      timed: carried.filter((o) => !o.allDay).concat(own.filter((o) => !o.allDay))
        .sort((a, b) => (a.segFrom < b.segFrom ? -1 : a.segFrom > b.segFrom ? 1 : a.segTo < b.segTo ? -1 : 1)),
    };
  }

  // Everything on a day, for the week and month: what continues from before
  // first, then what starts.
  function coveringOn(state, day) {
    return carriedOn(state, day).concat(eventsOn(state, day));
  }
  SYS.coveringOn = coveringOn;
  SYS.timelineOn = timelineOn;

  function findEvent(state, id) { return plannerOf(state).events.find((x) => x.id === id) || null; }
  SYS.findEvent = findEvent;

  function occurrenceOf(state, id, day) {
    const ev = findEvent(state, id);
    return ev && occursOn(ev, day) ? occurrence(ev, day) : null;
  }
  SYS.eventOccurrence = occurrenceOf;

  // Why an input cannot be saved, or null.
  function eventError(input) {
    if (!cleanTitle(input.title)) return "title";
    if (!DAY_RE.test(input.start)) return "date";
    if (input.end != null && input.end !== "" && !DAY_RE.test(input.end)) return "date";
    const span = spanOf(input);
    if (span < 0) return "end";
    if (span > MAX_SPAN) return "span";
    if (!cleanTimes(!!input.allDay, input.from, input.to, span)) return "time";
    return null;
  }
  SYS.eventError = eventError;

  function addEvent(state, input) {
    if (eventError(input)) return null;
    const ev = cleanEvent({ ...input, id: input.id || SYS.uid(), createdAt: input.now || Date.now(), skip: [], edits: {} });
    plannerOf(state).events.push(ev);
    return ev;
  }
  SYS.addEvent = addEvent;

  // `day` is the occurrence being edited; `scope` is "this" or "following".
  // A one-off event has no scope worth asking about and is simply replaced.
  function updateEvent(state, id, day, input, scope) {
    const ev = findEvent(state, id);
    if (!ev || eventError(input)) return null;
    const recurring = ev.repeat.type !== "none";

    if (!recurring || (scope === "following" && day <= ev.start)) {
      const next = cleanEvent({ ...input, id: ev.id, createdAt: ev.createdAt, skip: recurring ? ev.skip : [], edits: {} });
      Object.assign(ev, next);
      return ev;
    }

    if (scope === "this") {
      if (!occursOn(ev, day)) return null;
      // The same day and the same kind of time: an exception on the series.
      // Anything else (another date, or switching to or from all-day) leaves
      // the series without that day and puts a one-off where it now belongs.
      if (input.start === day && !!input.allDay === ev.allDay && spanOf(input) === (ev.span || 0)) {
        const edit = { title: cleanTitle(input.title) };
        if (!ev.allDay) { edit.from = input.from; edit.to = input.to; }
        ev.edits[day] = edit;
        return ev;
      }
      ev.skip = [...new Set([...ev.skip, day])].sort();
      delete ev.edits[day];
      return addEvent(state, { ...input, repeat: { type: "none" } });
    }

    // This and following: the old series stops the day before.
    const carriedSkips = ev.skip.filter((k) => k >= day);
    ev.repeat.until = SYS.shiftDay(day, -1);
    ev.skip = ev.skip.filter((k) => k < day);
    Object.keys(ev.edits).forEach((k) => { if (k >= day) delete ev.edits[k]; });
    const added = addEvent(state, input);
    // Skipped days stay skipped when the series only changed its name.
    if (added && added.start === day && added.repeat.type !== "none") {
      added.skip = carriedSkips.filter((k) => k >= added.start);
    }
    return added;
  }
  SYS.updateEvent = updateEvent;

  // "all" removes the series; "this" drops one day; "following" ends it the
  // day before (and removes it outright from its first day).
  function deleteEvent(state, id, day, scope) {
    const p = plannerOf(state);
    const ev = findEvent(state, id);
    if (!ev) return false;
    const recurring = ev.repeat.type !== "none";
    if (!recurring || scope === "all" || (scope === "following" && day <= ev.start)) {
      p.events = p.events.filter((x) => x.id !== id);
      return true;
    }
    if (scope === "this") {
      ev.skip = [...new Set([...ev.skip, day])].sort();
      delete ev.edits[day];
      return true;
    }
    ev.repeat.until = SYS.shiftDay(day, -1);
    ev.skip = ev.skip.filter((k) => k < day);
    Object.keys(ev.edits).forEach((k) => { if (k >= day) delete ev.edits[k]; });
    return true;
  }
  SYS.deleteEvent = deleteEvent;

  // Side-by-side columns for overlapping timed events, the way a calendar
  // lays them out: each item gets a column, and every item in a cluster of
  // overlaps shares that cluster's column count.
  function layoutDay(occurrences) {
    const timed = occurrences.filter((o) => !o.allDay).map((o) => ({ ...o, segFrom: o.segFrom || o.from, segTo: o.segTo || o.to }));
    let cluster = [], clusterEnd = "", colsEnd = [];
    const close = () => { cluster.forEach((o) => { o.cols = colsEnd.length; }); cluster = []; colsEnd = []; };
    timed.forEach((o) => {
      if (cluster.length && o.segFrom >= clusterEnd) close();
      if (!cluster.length) clusterEnd = o.segTo;
      let col = colsEnd.findIndex((end) => end <= o.segFrom);
      if (col < 0) { col = colsEnd.length; colsEnd.push(o.segTo); } else colsEnd[col] = o.segTo;
      o.col = col;
      cluster.push(o);
      if (o.segTo > clusterEnd) clusterEnd = o.segTo;
    });
    close();
    return timed;
  }
  SYS.layoutDay = layoutDay;

  SYS.minutesOf = function (hhmm) { return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)); };

  // Open items first in the order they were written, then finished ones in
  // the order they were finished — the list reads as what is left.
  function todosOn(state, day) {
    return plannerOf(state).todos
      .filter((x) => x.day === day)
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        if (a.done) return (a.doneAt || 0) - (b.doneAt || 0);
        return (a.createdAt || 0) - (b.createdAt || 0);
      });
  }
  SYS.todosOn = todosOn;

  function addTodo(state, input) {
    const title = cleanTitle(input && input.title);
    const day = input && DAY_RE.test(input.day) ? input.day : null;
    if (!title || !day) return null;
    const today = (input && input.today) || SYS.todayKey();
    const todo = {
      id: (input && input.id) || SYS.uid(),
      title, day, done: false, doneAt: null,
      createdAt: (input && input.now) || Date.now(),
      from: null,
      // Written straight onto a day already over: it is there on purpose, so
      // the next morning should not ask whether to move it.
      asked: day < today,
    };
    plannerOf(state).todos.push(todo);
    return todo;
  }
  SYS.addTodo = addTodo;

  function findTodo(state, id) { return plannerOf(state).todos.find((x) => x.id === id) || null; }

  function toggleTodo(state, id, now) {
    const todo = findTodo(state, id);
    if (!todo) return null;
    todo.done = !todo.done;
    todo.doneAt = todo.done ? (now || Date.now()) : null;
    return todo;
  }
  SYS.toggleTodo = toggleTodo;

  function renameTodo(state, id, title) {
    const todo = findTodo(state, id);
    const clean = cleanTitle(title);
    if (!todo || !clean) return null;
    todo.title = clean;
    return todo;
  }
  SYS.renameTodo = renameTodo;

  function deleteTodo(state, id) {
    const p = plannerOf(state);
    const before = p.todos.length;
    p.todos = p.todos.filter((x) => x.id !== id);
    return p.todos.length !== before;
  }
  SYS.deleteTodo = deleteTodo;

  // What the morning question is about: unfinished items on a day that is
  // over, not yet asked about. Oldest day first.
  function pendingCarry(state, today) {
    const key = today || SYS.todayKey();
    return plannerOf(state).todos
      .filter((x) => !x.done && !x.asked && x.day < key)
      .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : (a.createdAt || 0) - (b.createdAt || 0)));
  }
  SYS.pendingCarry = pendingCarry;

  // Answers the question for every pending item at once: the chosen ones move
  // to today, the rest stay on their own day and are not asked about again.
  // A moved item keeps the day it was first written for, and is asked about
  // afresh if it is left unfinished again.
  function carryTodos(state, moveIds, today) {
    const key = today || SYS.todayKey();
    const move = new Set(moveIds || []);
    let moved = 0;
    pendingCarry(state, key).forEach((todo) => {
      if (move.has(todo.id)) {
        todo.from = todo.from || todo.day;
        todo.day = key;
        todo.asked = false;
        moved++;
      } else {
        todo.asked = true;
      }
    });
    return moved;
  }
  SYS.carryTodos = carryTodos;

  SYS.PLANNER_TITLE_MAX = TITLE_MAX;
})(window.SYS = window.SYS || {});

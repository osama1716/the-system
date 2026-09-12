// Which habits are worth interrupting somebody about, right now.
//
// A reminder has to answer three questions before it earns a notification:
// is the habit due *today* on its schedule, is it still unlogged, and is it
// the right time in *that person's* timezone. Getting any of them wrong turns
// a useful nudge into the reason notifications get switched off — telling
// someone to do their Monday habit on a Tuesday is worse than silence.
//
// The schedule rules here are a second implementation of the ones in
// js/engine.js, because a Cloud Function cannot load a browser IIFE. Two
// copies stay honest only if something checks them, so a test compares the
// two across a spread of dates and schedules; see test-reminders.js.

// Local calendar parts in a given timezone. Intl is the only thing in Node
// that knows what "today" means in Amman when the server is in Iowa.
function localParts(date, timeZone) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
    }).formatToParts(date);
  } catch (e) {
    // An unknown zone is the client's fault, not a reason to skip the person
    // entirely — fall back to UTC and carry on.
    return localParts(date, "UTC");
  }
  const get = (type) => (parts.find((p) => p.type === type) || {}).value;
  const hour = get("hour") === "24" ? "00" : get("hour");
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dayKey: get("year") + "-" + get("month") + "-" + get("day"),
    hhmm: hour + ":" + get("minute"),
    weekday: weekdays[get("weekday")],
    dom: Number(get("day")),
    year: Number(get("year")),
    month: Number(get("month")),
  };
}

function parseKey(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  return { y: y || 1970, m: m || 1, d: d || 1 };
}
function dayNumber(key) {
  // Days since the epoch, by calendar date only — no clocks, so no DST.
  const { y, m, d } = parseKey(key);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}
function shiftKey(key, delta) {
  const { y, m, d } = parseKey(key);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  const pad = (n) => String(n).padStart(2, "0");
  return t.getUTCFullYear() + "-" + pad(t.getUTCMonth() + 1) + "-" + pad(t.getUTCDate());
}
function weekdayOf(key) {
  const { y, m, d } = parseKey(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function daysInMonth(key) {
  const { y, m } = parseKey(key);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function mondayOf(key) {
  return shiftKey(key, -((weekdayOf(key) + 6) % 7));
}

function scheduleOf(task) {
  const raw = task && task.schedule;
  const types = ["daily", "weekdays", "perWeek", "monthDays", "perMonth", "interval", "perInterval"];
  if (raw && types.indexOf(raw.type) >= 0) return raw;
  // Habits saved before schedules existed carried a weekly count.
  const n = Math.max(1, Math.min(7, Math.round(Number(task && task.repeatsPerWeek) || 1)));
  return n >= 7 ? { type: "daily" } : { type: "perWeek", n };
}

function daysOf(task) {
  return (task && task.days && typeof task.days === "object") ? task.days : {};
}
function doneOn(task, key) {
  const d = daysOf(task)[key];
  return !!(d && Number(d.n) > 0);
}

function intervalAnchor(task, s) {
  if (typeof s.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.start)) return s.start;
  const keys = Object.keys(daysOf(task)).sort();
  return keys.length ? keys[0] : null;
}

// The window a day belongs to, for the quota schedules.
function periodKeys(task, key) {
  const s = scheduleOf(task);
  if (s.type === "perMonth" || s.type === "monthDays") {
    const { y, m } = parseKey(key);
    const pad = (n) => String(n).padStart(2, "0");
    const first = y + "-" + pad(m) + "-01";
    const out = [];
    for (let i = 0; i < daysInMonth(key); i++) out.push(shiftKey(first, i));
    return out;
  }
  if (s.type === "perInterval" || s.type === "interval") {
    const anchor = intervalAnchor(task, s) || key;
    const every = Math.max(2, Math.round(Number(s.every) || 2));
    const index = Math.floor((dayNumber(key) - dayNumber(anchor)) / every);
    const start = shiftKey(anchor, index * every);
    const out = [];
    for (let i = 0; i < every; i++) out.push(shiftKey(start, i));
    return out;
  }
  const monday = mondayOf(key);
  const out = [];
  for (let i = 0; i < 7; i++) out.push(shiftKey(monday, i));
  return out;
}

function isDueOn(task, key) {
  const s = scheduleOf(task);
  if (s.type === "daily") return true;
  if (s.type === "weekdays") return (s.days || []).indexOf(weekdayOf(key)) >= 0;
  if (s.type === "monthDays") {
    const dom = parseKey(key).d;
    const last = daysInMonth(key);
    // A habit set for the 31st lands on the last day of a shorter month
    // rather than skipping it.
    return (s.days || []).some((x) => x === dom || (x > last && dom === last));
  }
  if (s.type === "interval") {
    const anchor = intervalAnchor(task, s);
    if (!anchor) return true;               // never logged: today is as good as any
    const diff = dayNumber(key) - dayNumber(anchor);
    const every = Math.max(2, Math.round(Number(s.every) || 2));
    return diff >= 0 && diff % every === 0;
  }
  // Quota schedules name no days: every day is due until the window's quota
  // is filled.
  const target = s.type === "perInterval" ? Number(s.n) : Number(s.n);
  const done = periodKeys(task, key).filter((k) => doneOn(task, k)).length;
  return done < Math.max(1, Math.round(target || 1));
}

// "HH:MM" if it looks like a time of day, else null.
function reminderTime(task) {
  const raw = task && task.remindAt;
  if (typeof raw !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) return null;
  return raw;
}

// Habits whose reminder falls inside the window that ends now, are due today,
// and have not been logged. The window exists because the scheduler runs
// every few minutes, not every second: a reminder set for 07:02 would
// otherwise never be seen by a job that wakes at 07:00 and 07:05.
// Archiving stops a habit's future without touching its past — the same rule
// as SYS.isArchivedOn in js/engine.js, and for the same reason the schedule
// rules live in both files: the client cannot be trusted to say a habit is
// due, and this side has to work it out for itself.
function isArchivedOn(task, key) {
  if (!task || !task.archived) return false;
  const at = task.archivedAt;
  return (typeof at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(at)) ? key >= at : true;
}

function dueReminders(state, now, timeZone, windowMinutes) {
  const tasks = (state && Array.isArray(state.tasks)) ? state.tasks : [];
  const span = Math.max(1, Number(windowMinutes) || 5);
  const parts = localParts(now, timeZone);
  const nowMinutes = Number(parts.hhmm.slice(0, 2)) * 60 + Number(parts.hhmm.slice(3, 5));
  return tasks.filter((t) => {
    if (!t || !t.recurring) return false;
    // An archived habit is not asked for any more, so it is not reminded
    // about either. Checked here as well as on the client because this is the
    // side that actually sends: a habit tidied away on a phone must not keep
    // buzzing from the server.
    if (isArchivedOn(t, parts.dayKey)) return false;
    const at = reminderTime(t);
    if (!at) return false;
    const mins = Number(at.slice(0, 2)) * 60 + Number(at.slice(3, 5));
    // Inside the window that just closed, and only there: a reminder is a
    // moment, not a standing condition, or every run would fire it again.
    if (!(mins > nowMinutes - span && mins <= nowMinutes)) return false;
    if (doneOn(t, parts.dayKey)) return false;
    return isDueOn(t, parts.dayKey);
  });
}

module.exports = { localParts, isDueOn, doneOn, reminderTime, dueReminders, periodKeys, scheduleOf, isArchivedOn };

// Planner event reminders, decided on the server.
//
// The occurrence rules here are a second copy of the ones in js/planner.js —
// a Cloud Function cannot load the browser file — and tests/test-event-
// reminders.js walks both across a spread of dates so they cannot drift.
//
// An event's `reminders` are minutes before its start: 0 is "at the start",
// 1440 a day before. An all-day event has no start time, so its reminders
// count back from 09:00 on its day.
const { localParts } = require("./reminders.js");

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ALL_DAY_AT = 9 * 60;
// The furthest a reminder may reach back: a week. The scheduler looks that
// far ahead for occurrences, so the two limits have to be the same number.
const MAX_OFFSET = 7 * 1440;
const MAX_REMINDERS = 5;

function parseKey(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  return { y, m, d };
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
function domOf(key) { return parseKey(key).d; }
function daysInMonthOf(key) {
  const { y, m } = parseKey(key);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function minutesOf(hhmm) { return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)); }

// Minutes before the start, each once, smallest first. The same rule as
// cleanReminders in js/planner.js.
function reminderOffsets(ev) {
  const raw = Array.isArray(ev && ev.reminders) ? ev.reminders : [];
  const out = [];
  raw.forEach((v) => {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0 && n <= MAX_OFFSET && out.indexOf(n) < 0) out.push(n);
  });
  return out.sort((a, b) => a - b).slice(0, MAX_REMINDERS);
}

function repeatOf(ev) {
  const r = (ev && ev.repeat) || {};
  return {
    type: ["daily", "weekly", "monthly"].indexOf(r.type) >= 0 ? r.type : "none",
    days: Array.isArray(r.days) ? r.days.map(Number) : [],
    until: DAY_RE.test(r.until) ? r.until : null,
    monthBy: ["weekday", "lastDay"].indexOf(r.monthBy) >= 0 ? r.monthBy : "date",
  };
}

function occursOn(ev, day) {
  if (!ev || !DAY_RE.test(ev.start) || day < ev.start) return false;
  const r = repeatOf(ev);
  if (r.until && day > r.until) return false;
  if (Array.isArray(ev.skip) && ev.skip.indexOf(day) >= 0) return false;
  switch (r.type) {
    case "none": return day === ev.start;
    case "daily": return true;
    case "weekly": {
      const days = r.days.length ? r.days : [weekdayOf(ev.start)];
      return days.indexOf(weekdayOf(day)) >= 0;
    }
    case "monthly": {
      const dim = daysInMonthOf(day);
      if (r.monthBy === "lastDay") return domOf(day) === dim;
      if (r.monthBy === "weekday") {
        if (weekdayOf(day) !== weekdayOf(ev.start)) return false;
        const nth = Math.ceil(domOf(ev.start) / 7);
        return nth >= 5 ? domOf(day) + 7 > dim : Math.ceil(domOf(day) / 7) === nth;
      }
      return domOf(day) === Math.min(domOf(ev.start), dim);
    }
    default: return false;
  }
}

// The occurrence's title and start time, with that day's own edit applied.
function occurrenceOn(ev, day) {
  const edit = (ev.edits && ev.edits[day]) || {};
  const from = ev.allDay ? null : (TIME_RE.test(edit.from) ? edit.from : ev.from);
  if (!ev.allDay && !TIME_RE.test(from)) return null;
  return {
    title: String(edit.title || ev.title || "").slice(0, 80),
    from, to: ev.allDay ? null : (TIME_RE.test(edit.to) ? edit.to : ev.to),
    startMinutes: ev.allDay ? ALL_DAY_AT : minutesOf(from),
  };
}

// What "already reminded" is recorded against: the event, the day it happens
// and how long before — so each of its reminders goes once per occurrence.
function eventSentKey(ev, day, offset) {
  return "ev:" + ev.id + "@" + day + "@" + offset;
}

// Every event reminder whose moment falls inside the window ending now, in
// the person's zone, with a verdict — the same shape as explainReminders for
// habits, so the scheduler can log and send both the same way.
//
// Only moments on the current local day count. Looking back across midnight
// would resend yesterday's last minutes, because what was sent is recorded
// per local day.
function explainEventReminders(state, now, timeZone, windowMinutes, sentIds) {
  const events = state && state.planner && Array.isArray(state.planner.events) ? state.planner.events : [];
  const span = Math.max(1, Number(windowMinutes) || 5);
  const parts = localParts(now, timeZone);
  const nowMinutes = minutesOf(parts.hhmm);
  const sent = new Set(Array.isArray(sentIds) ? sentIds : []);
  const candidates = [];
  events.forEach((ev) => {
    if (!ev || !ev.id) return;
    const offsets = reminderOffsets(ev);
    if (!offsets.length) return;
    for (let ahead = 0; ahead <= 7; ahead++) {
      const day = shiftKey(parts.dayKey, ahead);
      if (!occursOn(ev, day)) continue;
      const occ = occurrenceOn(ev, day);
      if (!occ) continue;
      offsets.forEach((offset) => {
        const at = ahead * 1440 + occ.startMinutes - offset;
        if (at < 0 || !(at > nowMinutes - span && at <= nowMinutes)) return;
        const key = eventSentKey(ev, day, offset);
        candidates.push({ event: ev, day, offset, occ, key, reason: sent.has(key) ? "already sent today" : "send" });
      });
    }
  });
  return { dayKey: parts.dayKey, localTime: parts.hhmm, candidates };
}

// The line under the title. Server-side, so worded in the account's language
// from a small table rather than the app's strings.
const WORDS = {
  en: { now: "Starting now", min: "In {n} min", hour: "In {n} h", day: "In {n} days", tomorrow: "Tomorrow", allDay: "All day", many: "{n} events" },
  ar: { now: "يبدأ الآن", min: "بعد {n} دقيقة", hour: "بعد {n} ساعة", day: "بعد {n} أيام", tomorrow: "غدًا", allDay: "طوال اليوم", many: "{n} مواعيد" },
  es: { now: "Empieza ahora", min: "En {n} min", hour: "En {n} h", day: "En {n} días", tomorrow: "Mañana", allDay: "Todo el día", many: "{n} eventos" },
  fr: { now: "Commence maintenant", min: "Dans {n} min", hour: "Dans {n} h", day: "Dans {n} jours", tomorrow: "Demain", allDay: "Toute la journée", many: "{n} événements" },
  de: { now: "Beginnt jetzt", min: "In {n} Min.", hour: "In {n} Std.", day: "In {n} Tagen", tomorrow: "Morgen", allDay: "Ganztägig", many: "{n} Termine" },
  ja: { now: "まもなく開始", min: "{n}分後", hour: "{n}時間後", day: "{n}日後", tomorrow: "明日", allDay: "終日", many: "予定{n}件" },
  zh: { now: "即将开始", min: "{n}分钟后", hour: "{n}小时后", day: "{n}天后", tomorrow: "明天", allDay: "全天", many: "{n} 个日程" },
};
function words(lang) { return WORDS[lang] || WORDS.en; }
function fill(s, n) { return s.split("{n}").join(String(n)); }

function whenLine(c, lang) {
  const w = words(lang);
  const time = c.occ.from ? c.occ.from + (c.occ.to ? "–" + c.occ.to : "") : w.allDay;
  let rel;
  if (c.offset === 0) rel = w.now;
  else if (c.offset < 60) rel = fill(w.min, c.offset);
  else if (c.offset < 1440) rel = fill(w.hour, Math.round(c.offset / 6) / 10);
  else if (c.offset === 1440) rel = w.tomorrow;
  else rel = fill(w.day, Math.round(c.offset / 144) / 10);
  return rel + " · " + time;
}

// One notification per device for everything due in the same minute.
function eventPayload(due, lang) {
  if (due.length === 1) {
    return { title: due[0].occ.title, body: whenLine(due[0], lang), tag: "event", url: "./#planner" };
  }
  return {
    title: fill(words(lang).many, due.length),
    body: due.map((c) => c.occ.title.slice(0, 40)).join(" · "),
    tag: "event", url: "./#planner",
  };
}

module.exports = {
  explainEventReminders, eventPayload, eventSentKey, reminderOffsets, occursOn, occurrenceOn, whenLine,
  MAX_OFFSET, MAX_REMINDERS,
};

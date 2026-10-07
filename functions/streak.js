// The account's daily streak: how many days in a row this person earned
// something, and the evening nudge when it is about to end.
//
// Counted here, from what recordProgress actually paid, and never from the
// device: a streak the app could write is a number anybody can retype. A day
// counts when the server paid EXP for progress reported on it, in the person's
// own zone. Undoing later does not take the day back — the streak says the
// person showed up, not what the work was finally worth.
//
// Pure functions only, so they can be tested without Firebase; recordProgress
// and sendReminders in index.js do the reading and writing.
"use strict";

const REMINDERS = require("./reminders.js");

// When the nudge goes, in the person's own time, on the day the streak would
// end at midnight.
const RESCUE_HHMM = "20:00";
// Below this there is nothing much to lose, and a nudge to keep a one-day
// streak reads as nagging.
const RESCUE_MIN_DAYS = 2;

function shiftDayKey(key, n) {
  const d = new Date(key + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// The streak after something was earned on `todayKey`. The same day twice
// changes nothing; the day after the last one adds one; any gap starts again.
function advance(prev, todayKey) {
  const p = prev || {};
  const last = typeof p.lastDay === "string" ? p.lastDay : null;
  const current = Math.max(0, Number(p.current) || 0);
  const best = Math.max(0, Number(p.best) || 0);
  if (last === todayKey) return { current, best: Math.max(best, current), lastDay: last };
  // A report dated before the last counted day (a zone change, a clock that
  // was wrong) neither extends nor breaks anything.
  if (last && todayKey < last) return { current, best: Math.max(best, current), lastDay: last };
  const next = last && shiftDayKey(last, 1) === todayKey ? current + 1 : 1;
  return { current: next, best: Math.max(best, next), lastDay: todayKey };
}

// What the streak is worth as of `todayKey`: still alive if the last counted
// day is today or yesterday, otherwise already ended.
function live(streak, todayKey) {
  const s = streak || {};
  const last = typeof s.lastDay === "string" ? s.lastDay : null;
  const current = Math.max(0, Number(s.current) || 0);
  const doneToday = last === todayKey;
  const alive = doneToday || (last && shiftDayKey(last, 1) === todayKey);
  return { current: alive ? current : 0, best: Math.max(0, Number(s.best) || 0), doneToday };
}

// The instant (ms) a wall-clock time on a given day happens in a zone. Two
// passes of "guess as if UTC, see what the zone calls it, move by the gap"
// settle on the right answer, daylight-saving nights included (a time that
// does not exist that night lands an hour later, which is fine for a nudge).
function zonedInstant(dayKey, hhmm, tz) {
  const [y, mo, d] = dayKey.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const want = Date.UTC(y, mo - 1, d, h, mi);
  let at = want;
  for (let i = 0; i < 2; i++) {
    const p = REMINDERS.localParts(new Date(at), tz);
    const [ph, pm] = p.hhmm.split(":").map(Number);
    const seen = Date.UTC(p.year, p.month - 1, p.dom, ph, pm);
    at += want - seen;
  }
  return at;
}

// When to nudge for a streak last counted on `lastDay`: the evening of the
// day after, which is the last day it can still be kept.
function rescueAt(lastDay, tz) {
  return zonedInstant(shiftDayKey(lastDay, 1), RESCUE_HHMM, tz || "UTC");
}

const RESCUE_TEXT = {
  en: { title: "Your {n}-day streak ends tonight", body: "One task keeps it going." },
  ar: { title: "سلسلتك ({n} يومًا) تنتهي الليلة", body: "مهمة واحدة تكفي لتستمر." },
  es: { title: "Tu racha de {n} días termina esta noche", body: "Una tarea la mantiene viva." },
  fr: { title: "Votre série de {n} jours se termine ce soir", body: "Une tâche suffit à la garder." },
  de: { title: "Deine {n}-Tage-Serie endet heute Nacht", body: "Eine Aufgabe hält sie am Leben." },
  ja: { title: "{n}日間の連続記録が今夜途切れます", body: "タスクを1つで続けられます。" },
  zh: { title: "你的{n}天连续记录今晚将中断", body: "完成一项任务即可延续。" },
};

function rescuePayload(n, lang) {
  const t = RESCUE_TEXT[lang] || RESCUE_TEXT.en;
  return { title: t.title.replace("{n}", n), body: t.body, tag: "streak", url: "./" };
}

module.exports = {
  RESCUE_HHMM, RESCUE_MIN_DAYS, RESCUE_TEXT,
  shiftDayKey, advance, live, zonedInstant, rescueAt, rescuePayload,
};

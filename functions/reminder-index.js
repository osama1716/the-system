// Which accounts could have a reminder going off right now — without reading
// every account to find out.
//
// The scheduler runs every minute. It used to read every subscribed account's
// whole saved state every minute to ask whether anything was near, which
// costs reads in proportion to the number of people times 1,440 a day, almost
// all of them to learn that nothing was. Instead each account keeps one small
// document, reminderIndex/{uid}, listing the local times at which anything of
// its could remind, once per zone its devices are in:
//
//   { slots: ["Asia/Amman|07:00", "Asia/Amman|21:30", …], zones: [...] }
//
// and the scheduler asks one question: whose slots fall inside the window
// that ends now, in each zone in use. Only those accounts are read.
//
// The index may say yes too often — a habit not due today, an event not on
// today's date, one already done — because the decision itself is still made
// by explainReminders / explainEventReminders on the full state, exactly as
// before. It must never say no to something that would have been sent;
// tests/test-reminder-index.js checks that across random habits, events,
// zones and moments.
"use strict";

const REMINDERS = require("./reminders.js");
const EVENT_REMINDERS = require("./event-reminders.js");

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ALL_DAY_AT = 9 * 60; // event-reminders.js counts an all-day event from 09:00
const pad = (n) => String(n).padStart(2, "0");
const hhmm = (min) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return pad(Math.floor(m / 60)) + ":" + pad(m % 60);
};
const minutesOf = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

// Every local time of day at which something of this account could remind.
// Habits: each of their reminder times. Events: each start (the event's own,
// and any one day's edited start) less each of its offsets, round the clock.
function localTimes(state, events) {
  const out = new Set();
  const tasks = state && Array.isArray(state.tasks) ? state.tasks : [];
  tasks.forEach((t) => {
    if (!t || !t.recurring) return;
    REMINDERS.reminderTimes(t).forEach((at) => out.add(at));
  });
  const legacy = state && state.planner && Array.isArray(state.planner.events) ? state.planner.events : [];
  (Array.isArray(events) ? events : []).concat(legacy).forEach((ev) => {
    if (!ev) return;
    const offsets = EVENT_REMINDERS.reminderOffsets(ev);
    if (!offsets.length) return;
    const starts = [];
    if (ev.allDay) starts.push(ALL_DAY_AT);
    else {
      if (typeof ev.from === "string" && TIME_RE.test(ev.from)) starts.push(minutesOf(ev.from));
      Object.values(ev.edits && typeof ev.edits === "object" ? ev.edits : {}).forEach((e) => {
        if (e && typeof e.from === "string" && TIME_RE.test(e.from)) starts.push(minutesOf(e.from));
      });
    }
    starts.forEach((s) => offsets.forEach((o) => out.add(hhmm(s - o))));
  });
  return Array.from(out).sort();
}

function slotKey(zone, time) { return zone + "|" + time; }

// The index entries for these times in each of these zones.
function slotsFor(times, zones) {
  const out = [];
  (zones || []).forEach((z) => (times || []).forEach((t) => out.push(slotKey(z, t))));
  return out;
}

// The entries that would match a reminder inside the window ending at `now`
// in `zone`. Counted back on the local clock face, the way explainReminders
// and explainEventReminders draw their window — not in elapsed minutes, which
// on the night the clocks go forward would skip the hour the face jumps over
// and miss a reminder set inside it. Wrapping past midnight only adds slots.
function windowSlots(now, zone, windowMinutes) {
  const local = REMINDERS.localParts(now instanceof Date ? now : new Date(Number(now)), zone).hhmm;
  const at = minutesOf(local);
  const out = [];
  for (let k = 0; k < Math.max(1, windowMinutes); k++) out.push(slotKey(zone, hhmm(at - k)));
  return out;
}

// The zones an account's devices are in, as the scheduler reads them.
function zonesOf(subs) {
  const out = [];
  (subs || []).forEach((s) => {
    const z = (s && typeof s.tz === "string" && s.tz) || "UTC";
    if (out.indexOf(z) < 0) out.push(z);
  });
  return out;
}

// Firestore's array-contains-any takes at most 30 values.
function chunks(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

module.exports = { localTimes, slotsFor, windowSlots, zonesOf, chunks, slotKey };

// The admin's numbers: who signed up, who came back, how far they got.
//
// "Active on a day" means the journal paid them EXP that day (UTC) — the one
// signal the server can vouch for; opening the app and leaving is not
// counted. Admin accounts are left out by the caller.
//
// Pure functions only, so they can be tested without Firebase; adminStats in
// index.js gathers the inputs.
"use strict";

const DAY = 86400000;

function dayKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function shift(key, n) {
  return dayKey(Date.parse(key + "T00:00:00Z") + n * DAY);
}

// users: [{ uid, createdMs }]
// activity: { uid: Set of "YYYY-MM-DD" days with EXP paid }
// nowMs: the moment the numbers are for
function summarise(users, activity, nowMs) {
  const today = dayKey(nowMs);
  const created = users.map((u) => ({ uid: u.uid, day: dayKey(u.createdMs) }));
  const activeOn = (uid, k) => !!(activity[uid] && activity[uid].has(k));

  const signups = [];
  for (let i = 13; i >= 0; i--) {
    const k = shift(today, -i);
    signups.push({ day: k, n: created.filter((u) => u.day === k).length });
  }
  const weekAgo = shift(today, -6);
  const activeToday = users.filter((u) => activeOn(u.uid, today)).length;
  const active7 = users.filter((u) => {
    for (let i = 0; i < 7; i++) if (activeOn(u.uid, shift(today, -i))) return true;
    return false;
  }).length;

  // D1: came back the day after signing up. Only days whose next day is
  // over count, and only within the activity window read (35 days).
  const d1Cohort = created.filter((u) => u.day <= shift(today, -2) && u.day >= shift(today, -33));
  const d1Kept = d1Cohort.filter((u) => activeOn(u.uid, shift(u.day, 1))).length;
  // D7: came back on any day of the second week (days 7 to 13 after).
  const d7Cohort = created.filter((u) => u.day <= shift(today, -14) && u.day >= shift(today, -33));
  const d7Kept = d7Cohort.filter((u) => {
    for (let i = 7; i <= 13; i++) if (activeOn(u.uid, shift(u.day, i))) return true;
    return false;
  }).length;

  return {
    today,
    accounts: users.length,
    newToday: created.filter((u) => u.day === today).length,
    new7: created.filter((u) => u.day >= weekAgo).length,
    activeToday,
    active7,
    signups,
    d1: { cohort: d1Cohort.length, kept: d1Kept },
    d7: { cohort: d7Cohort.length, kept: d7Kept },
  };
}

module.exports = { dayKey, shift, summarise };

// Schedules, against the shipped engine. Dates are fixed rather than
// relative to today: a suite that only passes on a Saturday is not a suite.
const fs = require("fs"), path = require("path"), vm = require("vm");
const REPO = path.resolve(__dirname, "..").split(path.sep).join("/") + "/";
const SYS = {};
const sb = { SYS, window: {}, console, Math, JSON, Object, Array, Number, String, Boolean, RegExp, Date, Set, Map, Intl,
  crypto: { randomUUID: () => "id" + Math.random() } };
vm.createContext(sb);
for (const f of ["constants.js", "engine.js"]) {
  vm.runInContext(fs.readFileSync(path.join(REPO, "js", f), "utf8")
    .replace(/\}\)\(window\.SYS[^)]*\);?\s*$/, "})(SYS);"), sb, { filename: f });
}
let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };

// 2026-09-07 is a Monday, so the week runs 07 (Mon) .. 13 (Sun).
const MON = "2026-09-07", TUE = "2026-09-08", WED = "2026-09-09", THU = "2026-09-10",
      FRI = "2026-09-11", SAT = "2026-09-12", SUN = "2026-09-13";

function habit(over) {
  return Object.assign({
    id: "h1", title: "Test", recurring: true, mode: "recurring", taskType: "Recurring",
    priority: "Medium", types: ["bodily"], pt: 20, notes: "", completion: 0, expBaseline: 0,
    unit: "reps", targetAmount: 1, days: {}, daysBase: true,
    traitTargets: [{ category: "bodily", trait: "Health" }],
  }, over || {});
}
const done = (t, ...keys) => { keys.forEach((k) => { t.days[k] = { n: 1, amount: 1 }; }); return t; };

console.log("");
console.log("migrating from \"N days a week\"");
{
  const daily = habit({ repeatsPerWeek: 7 });
  SYS.migrateSchedule(daily);
  check("7 a week becomes daily", daily.schedule.type === "daily", JSON.stringify(daily.schedule));
  check("the old field is gone", !("repeatsPerWeek" in daily));

  const three = habit({ repeatsPerWeek: 3 });
  SYS.migrateSchedule(three);
  check("3 a week becomes a quota of 3", three.schedule.type === "perWeek" && three.schedule.n === 3, JSON.stringify(three.schedule));

  // It must not invent named days it was never told.
  check("and not three named weekdays", three.schedule.type !== "weekdays");

  const a = habit({ repeatsPerWeek: 4 }), b = habit({ repeatsPerWeek: 4 });
  SYS.migrateSchedule(a); SYS.migrateSchedule(b);
  check("same input, same output", JSON.stringify(a.schedule) === JSON.stringify(b.schedule));
  const once = JSON.stringify(a.schedule);
  SYS.migrateSchedule(a); SYS.migrateSchedule(a);
  check("running it again changes nothing", JSON.stringify(a.schedule) === once);
  check("and reports no further change", SYS.migrateSchedule(a) === false);

  const already = habit({ schedule: { type: "weekdays", days: [1, 3] } });
  SYS.migrateSchedule(already);
  check("an existing schedule is left alone", JSON.stringify(already.schedule) === JSON.stringify({ type: "weekdays", days: [1, 3] }));
}

console.log("");
console.log("nonsense is clamped rather than trusted");
{
  const s = SYS.sanitizeSchedule;
  check("no weekdays picked falls back to daily", s({ type: "weekdays", days: [] }).type === "daily");
  check("out-of-range weekdays are dropped", JSON.stringify(s({ type: "weekdays", days: [1, 9, -2, 1, 5] }).days) === "[1,5]");
  check("no month days picked keeps the 1st", JSON.stringify(s({ type: "monthDays", days: [] }).days) === "[1]");
  check("month days above 31 are dropped", JSON.stringify(s({ type: "monthDays", days: [40, 15, 1] }).days) === "[1,15]");
  check("every-1-days is not an interval", s({ type: "interval", every: 1 }).every === 2);
  check("a quota cannot exceed its own window", s({ type: "perInterval", every: 5, n: 99 }).n === 5);
  check("perWeek is capped at 7", s({ type: "perWeek", n: 20 }).n === 7);
  check("an unknown type becomes daily", s({ type: "whenever" }).type === "daily");
  check("a garbage start date is not kept", s({ type: "interval", every: 3, start: "soon" }).start === undefined);
  check("a real one is", s({ type: "interval", every: 3, start: MON }).start === MON);
}

console.log("");
console.log("which days are due");
{
  const mwf = habit({ schedule: { type: "weekdays", days: [1, 3, 5] } });
  check("Monday is due", SYS.isDueOn(mwf, MON));
  check("Tuesday is not", !SYS.isDueOn(mwf, TUE));
  check("Wednesday and Friday are", SYS.isDueOn(mwf, WED) && SYS.isDueOn(mwf, FRI));
  check("Sunday is not", !SYS.isDueOn(mwf, SUN));

  const daily = habit({ schedule: { type: "daily" } });
  check("daily is due every day", [MON, TUE, WED, THU, FRI, SAT, SUN].every((k) => SYS.isDueOn(daily, k)));

  const monthly = habit({ schedule: { type: "monthDays", days: [1, 15] } });
  check("the 15th is due", SYS.isDueOn(monthly, "2026-09-15"));
  check("the 16th is not", !SYS.isDueOn(monthly, "2026-09-16"));

  // September has 30 days: a 31st habit must land somewhere.
  const last = habit({ schedule: { type: "monthDays", days: [31] } });
  check("the 31st of a 30-day month falls on the 30th", SYS.isDueOn(last, "2026-09-30"));
  check("and not on the 29th", !SYS.isDueOn(last, "2026-09-29"));
  check("in a 31-day month it is the 31st", SYS.isDueOn(last, "2026-10-31") && !SYS.isDueOn(last, "2026-10-30"));

  const every3 = habit({ schedule: { type: "interval", every: 3, start: MON } });
  check("the anchor day is due", SYS.isDueOn(every3, MON));
  check("two days later is not", !SYS.isDueOn(every3, WED));
  check("three days later is", SYS.isDueOn(every3, THU));
  check("before the anchor nothing is due", !SYS.isDueOn(every3, "2026-09-04"));
}

console.log("");
console.log("a quota is due until it is filled");
{
  const three = habit({ schedule: { type: "perWeek", n: 3 } });
  check("open at the start of the week", SYS.isDueOn(three, MON));
  done(three, MON, TUE);
  check("still open at two of three", SYS.isDueOn(three, WED));
  done(three, WED);
  check("closed once the third lands", !SYS.isDueOn(three, THU));
  check("but next week is open again", SYS.isDueOn(three, "2026-09-14"));
}

console.log("");
console.log("what the card counts");
{
  const mwf = habit({ schedule: { type: "weekdays", days: [1, 3, 5] } });
  done(mwf, MON);
  let p = SYS.periodProgress(mwf, WED);
  check("three named days this week", p.target === 3, JSON.stringify(p));
  check("one of them done", p.done === 1);
  check("the scope is the week", p.scope === "week" && p.start === MON && p.end === SUN);

  // A bonus day must not paper over a missed named one.
  done(mwf, TUE);
  p = SYS.periodProgress(mwf, WED);
  check("a day that was never due does not count toward it", p.done === 1, JSON.stringify(p));

  const quota = habit({ schedule: { type: "perWeek", n: 3 } });
  done(quota, TUE, SAT);
  p = SYS.periodProgress(quota, WED);
  check("a quota counts any day", p.done === 2 && p.target === 3, JSON.stringify(p));

  const perMonth = habit({ schedule: { type: "perMonth", n: 10 } });
  done(perMonth, "2026-09-02", "2026-09-20");
  p = SYS.periodProgress(perMonth, WED);
  check("a month quota spans the month", p.scope === "month" && p.start === "2026-09-01" && p.end === "2026-09-30");
  check("and counts both", p.done === 2 && p.target === 10);

  const perWindow = habit({ schedule: { type: "perInterval", every: 10, n: 2, start: MON } });
  done(perWindow, TUE, THU);
  p = SYS.periodProgress(perWindow, FRI);
  check("a rolling window runs from its anchor", p.start === MON && p.end === "2026-09-16", JSON.stringify(p));
  check("and is filled", p.done === 2 && p.target === 2);
}

console.log("");
console.log("expected times a week, which is what the AI prices against");
{
  const r = (sch) => SYS.weeklyRate(habit({ schedule: sch }));
  check("daily is 7", r({ type: "daily" }) === 7);
  check("Mon/Wed/Fri is 3", r({ type: "weekdays", days: [1, 3, 5] }) === 3);
  check("three a week is 3", r({ type: "perWeek", n: 3 }) === 3);
  check("every 3 days is 2.33", r({ type: "interval", every: 3 }) === 2.33, String(r({ type: "interval", every: 3 })));
  check("twice a month is well under one", r({ type: "perMonth", n: 2 }) === 0.46, String(r({ type: "perMonth", n: 2 })));
  check("two named month days matches", r({ type: "monthDays", days: [1, 15] }) === 0.46);
  check("2 per 10 days is 1.4", r({ type: "perInterval", every: 10, n: 2 }) === 1.4);
  check("a habit with no schedule at all still prices", SYS.weeklyRate(habit({ repeatsPerWeek: 5 })) === 5);
}

console.log("");
console.log("streaks follow the schedule");
{
  // Mon/Wed/Fri, done on all three: Tuesday and Thursday are not misses.
  const mwf = habit({ schedule: { type: "weekdays", days: [1, 3, 5] } });
  done(mwf, MON, WED, FRI);
  let st = SYS.habitStreak(mwf, FRI);
  check("three named days running is 3", st.n === 3 && st.scope === "day", JSON.stringify(st));
  check("Saturday does not break it", SYS.habitStreak(mwf, SAT).n === 3);
  check("and neither does an open Monday", SYS.habitStreak(mwf, "2026-09-14").n === 3);

  // A missed named day does break it.
  const missed = habit({ schedule: { type: "weekdays", days: [1, 3, 5] } });
  done(missed, MON, FRI);
  check("skipping Wednesday cuts it to 1", SYS.habitStreak(missed, FRI).n === 1, JSON.stringify(SYS.habitStreak(missed, FRI)));

  // Daily behaves as before.
  const daily = habit({ schedule: { type: "daily" } });
  done(daily, WED, THU, FRI);
  check("daily counts plain days", SYS.habitStreak(daily, FRI).n === 3);
  check("today still open keeps yesterday's run", SYS.habitStreak(daily, SAT).n === 3);
  check("a gap stops it", SYS.habitStreak(daily, SUN).n === 0);

  // A quota counts whole weeks kept, not days.
  const quota = habit({ schedule: { type: "perWeek", n: 2 } });
  done(quota, "2026-08-25", "2026-08-27");   // week of Aug 24
  done(quota, "2026-09-01", "2026-09-04");   // week of Aug 31
  done(quota, MON, TUE);                      // week of Sep 7
  let q = SYS.habitStreak(quota, WED);
  check("three weeks kept is 3 weeks", q.n === 3 && q.scope === "week", JSON.stringify(q));
  const openWeek = habit({ schedule: { type: "perWeek", n: 2 } });
  done(openWeek, "2026-09-01", "2026-09-04");
  done(openWeek, MON);                        // this week only half done
  q = SYS.habitStreak(openWeek, WED);
  check("a week still in progress does not break the run", q.n === 1, JSON.stringify(q));
  check("nor does it count itself early", q.n === 1);
}

console.log("");
console.log("the next day it is due");
{
  const mwf = habit({ schedule: { type: "weekdays", days: [1, 3, 5] } });
  check("from Tuesday, Wednesday", SYS.nextDueOn(mwf, TUE) === WED);
  check("from Saturday, next Monday", SYS.nextDueOn(mwf, SAT) === "2026-09-14");
  check("a due day answers itself", SYS.nextDueOn(mwf, MON) === MON);
  const filled = habit({ schedule: { type: "perWeek", n: 1 } });
  done(filled, MON);
  check("a filled quota points at the next window", SYS.nextDueOn(filled, TUE) === "2026-09-14", SYS.nextDueOn(filled, TUE));
}

console.log("");
console.log("the schedule never blocks logging");
{
  const state = SYS.defaultState();
  state.tasks = [habit({ schedule: { type: "weekdays", days: [1] }, pt: 20 })];
  const before = SYS.totalExp(state.player);
  // Sunday is not a due day for this habit. Logging it should still pay:
  // the schedule sets expectations, it does not lock the door.
  SYS.logHabitDay(state, "h1", SYS.todayKey());
  check("a day off the schedule is still paid", SYS.totalExp(state.player) - before === 20,
    "moved by " + (SYS.totalExp(state.player) - before));
}

console.log("");
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);

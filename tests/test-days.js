// Moving between days.
//
// The engine already took a day key everywhere, so the feature is mostly the
// UI handing it a different one. That makes the risk specific: a day other
// than today has to pay, refund and record exactly as today does, and the
// strip's idea of "this week" has to be the same week the engine means.
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

const today = SYS.todayKey();
const back = (n) => SYS.shiftDay(today, -n);
const exp = (s) => SYS.totalExp(s.player);

function stateWith(over) {
  const s = SYS.defaultState();
  s.tasks = [];
  SYS.addTask(s, Object.assign({
    title: "Drink water", priority: "Normal", taskType: "Recurring", types: ["bodily"], pt: 20,
    mode: "simple", notes: "", recurring: true,
    schedule: { type: "daily" }, unit: "L", targetAmount: 2,
    traitTargets: [{ category: "bodily", trait: "Health" }],
  }, over || {}));
  return s;
}
const task = (s) => s.tasks[0];

console.log("");
console.log("a day in the past pays exactly what today pays");
{
  const now = stateWith();
  const before = exp(now);
  SYS.logHabitDay(now, task(now).id, today);
  const paidToday = exp(now) - before;

  const then = stateWith();
  SYS.logHabitDay(then, task(then).id, back(5));
  const paidThen = exp(then) - before;

  check("the grant is the same", paidToday === paidThen, paidToday + " vs " + paidThen);
  check("and it is not zero", paidToday > 0, String(paidToday));
}

console.log("");
console.log("and gives back exactly that when it is undone");
{
  const s = stateWith();
  const day = back(3);
  const before = exp(s);
  SYS.logHabitDay(s, task(s).id, day);
  const granted = exp(s) - before;
  SYS.unlogHabitDay(s, task(s).id, day);
  check("the ledger returns to where it was", exp(s) === before, before + " -> " + exp(s));
  check("which is the amount it granted", granted > 0, String(granted));
  check("and the day is clear", SYS.habitDoneOn(task(s), day) === false);
}

console.log("");
console.log("an amount lands on the day it was logged for, and only there");
{
  const s = stateWith();
  const day = back(2);
  SYS.addHabitAmount(s, task(s).id, day, 1.5, "L");
  check("that day holds it", SYS.habitAmountOn(task(s), day) === SYS.toBase(1.5, "L", "L"),
    String(SYS.habitAmountOn(task(s), day)));
  check("today is untouched", SYS.habitAmountOn(task(s), today) === 0);

  // A second day, to catch a write that replaces the map instead of the entry.
  SYS.addHabitAmount(s, task(s).id, back(1), 0.5, "L");
  check("the first day survives the second", SYS.habitAmountOn(task(s), day) === SYS.toBase(1.5, "L", "L"),
    String(SYS.habitAmountOn(task(s), day)));
  check("and the second is its own", SYS.habitAmountOn(task(s), back(1)) === SYS.toBase(0.5, "L", "L"));
}

console.log("");
console.log("a note on a past day keeps that day's numbers");
{
  const s = stateWith();
  const day = back(4);
  SYS.addHabitAmount(s, task(s).id, day, 2, "L");
  const amount = SYS.habitAmountOn(task(s), day);
  SYS.setHabitNote(s, task(s).id, day, "made it out for a walk");
  check("the note is on that day", SYS.habitNoteOn(task(s), day) === "made it out for a walk");
  check("the amount is still there", SYS.habitAmountOn(task(s), day) === amount);
  check("today has no note", SYS.habitNoteOn(task(s), today) === "");
}

console.log("");
console.log("progress for a past day reads that day, not today");
{
  const s = stateWith({ schedule: { type: "perWeek", n: 3 } });
  // Two days of one week, both in the past: a Sunday and the Saturday before
  // it. Comparing against today split the window every Monday, when the day
  // before belongs to the previous week.
  const sunday = (() => { for (let n = 1; n <= 7; n++) { const k = back(n); if (new Date(k + "T12:00:00Z").getUTCDay() === 0) return k; } })();
  const day = SYS.shiftDay(sunday, -1);
  SYS.logHabitDay(s, task(s).id, day);
  check("the day itself is done", SYS.habitDoneOn(task(s), day) === true);
  check("another day is not", SYS.habitDoneOn(task(s), sunday) === false && SYS.habitDoneOn(task(s), today) === false);
  // A quota counts the window, so both days see the same 1 of 3 — that is
  // the point of a quota and not a leak between days.
  const a = SYS.periodProgress(task(s), day), b = SYS.periodProgress(task(s), sunday);
  check("a weekly quota counts the window from either day", a.done === b.done && a.target === b.target,
    JSON.stringify(a) + " vs " + JSON.stringify(b));
}

console.log("");
console.log("day keys compare as dates, which is what the future guard rests on");
{
  // The guard for "this day has not happened" is a string comparison. It is
  // only correct because the keys are zero-padded and biggest-unit-first.
  check("a later day in the same month is greater", "2026-09-13" > "2026-09-12");
  check("the first of the next month beats the last of this one", "2026-10-01" > "2026-09-30");
  check("and January beats December", "2027-01-01" > "2026-12-31");
  check("a day is not greater than itself", !(today > today));
  check("yesterday is not in the future", !(back(1) > today));
}

console.log("");
console.log("the strip's week and the engine's week are the same week");
{
  // Two pieces of code find Monday: the strip from a Date plus an offset, the
  // engine from a day key. They have to agree, or the dots on a card belong
  // to a different week from the numbers above them.
  const stripWeek = (offset) => {
    const base = new Date();
    base.setDate(base.getDate() + offset * 7);
    const monday = new Date(base);
    monday.setDate(base.getDate() - ((base.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return SYS.dateKey(d);
    });
  };
  const t = task(stateWith());
  let disagreements = 0;
  for (let offset = -10; offset <= 8; offset++) {
    const shown = SYS.shiftDay(today, offset * 7);
    const mine = stripWeek(offset).join(",");
    const theirs = SYS.weekDays(t, shown).keys.join(",");
    if (mine !== theirs) { disagreements++; console.log("    offset " + offset + ": " + mine + " vs " + theirs); }
    // The chosen day must also be inside the week the strip is showing.
    if (stripWeek(offset).indexOf(shown) < 0) { disagreements++; console.log("    offset " + offset + ": " + shown + " not in its own week"); }
  }
  check("19 weeks agree, and each holds its own day", disagreements === 0, disagreements + " disagreements");
}

console.log("");
console.log("stepping a week keeps the weekday");
{
  const weekday = (key) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d).getDay(); };
  let wrong = 0;
  for (let i = 1; i <= 60; i++) {
    if (weekday(SYS.shiftDay(today, -7 * i)) !== weekday(today)) wrong++;
    if (weekday(SYS.shiftDay(today, 7 * i)) !== weekday(today)) wrong++;
  }
  check("120 steps land on the same weekday", wrong === 0, wrong + " wrong");
}

console.log("");
console.log(fails === 0 ? "all passed" : fails + " failed");
process.exit(fails ? 1 : 0);

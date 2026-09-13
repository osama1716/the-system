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

function water(over) {
  const s = SYS.defaultState();
  s.tasks = [Object.assign({ id: "h1", title: "Drink water", recurring: true, mode: "recurring",
    taskType: "Recurring", priority: "Medium", types: ["bodily"], pt: 20, notes: "", completion: 0,
    expBaseline: 0, repeatsPerWeek: 7, unit: "L", targetAmount: 2, days: {}, daysBase: true,
    traitTargets: [{ category: "bodily", trait: "Health" }] }, over || {})];
  return s;
}
const exp = (s) => SYS.totalExp(s.player);
const amt = (s) => SYS.habitAmountOn(s.tasks[0], today);
const done = (s) => SYS.habitDoneOn(s.tasks[0], today);

console.log("");
console.log("adding in a smaller unit of the same family");
{
  const s = water(); const base = exp(s);
  SYS.addHabitAmount(s, "h1", today, 500, "ml");
  check("500 ml lands as 500 base units", amt(s) === 500, "got " + amt(s));
  check("not finished yet", !done(s) && exp(s) === base);
  SYS.addHabitAmount(s, "h1", today, 1, "L");
  check("plus 1 L is 1500", amt(s) === 1500);
  check("still not finished", !done(s) && exp(s) === base);
  SYS.addHabitAmount(s, "h1", today, 500, "ml");
  check("reaching 2 L finishes the day", done(s) && amt(s) === 2000);
  check("and pays exactly once", exp(s) - base === 20, "got " + (exp(s) - base));
}

console.log("");
console.log("the float trap: 0.1 x 10 must reach 1");
{
  const s = water({ unit: "L", targetAmount: 1 }); const base = exp(s);
  for (let i = 0; i < 10; i++) SYS.addHabitAmount(s, "h1", today, 100, "ml");
  check("ten 100 ml adds finish a 1 L goal", done(s), "amount " + amt(s));
  check("paid once", exp(s) - base === 20);
}

console.log("");
console.log("going over the goal is free");
{
  const s = water(); const base = exp(s);
  SYS.addHabitAmount(s, "h1", today, 2, "L");
  const afterGoal = exp(s);
  check("finished at the goal", done(s) && afterGoal - base === 20);
  SYS.addHabitAmount(s, "h1", today, 1, "L");
  SYS.addHabitAmount(s, "h1", today, 500, "ml");
  check("3.5 L recorded", amt(s) === 3500, "got " + amt(s));
  check("but no more EXP", exp(s) === afterGoal, "moved by " + (exp(s) - afterGoal));
  check("still just one grant on the day", SYS.habitDays(s.tasks[0])[today].n === 1);
}

console.log("");
console.log("dropping back under the goal returns the EXP");
{
  const s = water(); const base = exp(s);
  SYS.addHabitAmount(s, "h1", today, 2500, "ml");
  check("over the goal, paid", done(s) && exp(s) - base === 20);
  SYS.addHabitAmount(s, "h1", today, -600, "ml");
  check("1.9 L is under the goal again", amt(s) === 1900 && !done(s));
  check("the EXP came back", exp(s) === base, "off by " + (exp(s) - base));
  SYS.addHabitAmount(s, "h1", today, 100, "ml");
  check("crossing again pays again, once", done(s) && exp(s) - base === 20);
}

console.log("");
console.log("the big button still means done");
{
  const s = water(); const base = exp(s);
  SYS.logHabitDay(s, "h1", today);
  check("one press fills the goal", done(s) && amt(s) === 2000);
  check("and pays", exp(s) - base === 20);
  SYS.unlogHabitDay(s, "h1", today);
  check("clearing returns everything", exp(s) === base && !done(s), "off by " + (exp(s) - base));
  check("and leaves no day behind", !SYS.habitDays(s.tasks[0])[today]);
}

console.log("");
console.log("a press after partial progress keeps the progress");
{
  const s = water(); const base = exp(s);
  SYS.addHabitAmount(s, "h1", today, 500, "ml");
  SYS.logHabitDay(s, "h1", today);
  check("tops up to the goal", amt(s) === 2000 && done(s));
  check("paid once, not twice", exp(s) - base === 20);
}

console.log("");
console.log("units from another family are refused");
{
  const s = water(); const base = exp(s);
  SYS.addHabitAmount(s, "h1", today, 5, "km");
  check("kilometres do not count toward litres", amt(s) === 0 && exp(s) === base);
  check("toBase says so plainly", SYS.toBase(5, "km", "L") === null);
  check("but ml to L works", SYS.toBase(250, "ml", "L") === 250);
  check("and min to hr", SYS.toBase(30, "min", "hr") === 1800);
}

console.log("");
console.log("time habits");
{
  const s = water({ unit: "hr", targetAmount: 1, title: "Deep work" }); const base = exp(s);
  SYS.addHabitAmount(s, "h1", today, 25, "min");
  SYS.addHabitAmount(s, "h1", today, 25, "min");
  check("50 minutes is not an hour", !done(s) && amt(s) === 3000);
  SYS.addHabitAmount(s, "h1", today, 600, "sec");
  check("plus 10 minutes finishes it", done(s) && amt(s) === 3600);
  check("paid once", exp(s) - base === 20);
}

console.log("");
console.log("count units stay unconvertible");
{
  const s = water({ unit: "pages", targetAmount: 10, title: "Read" });
  check("pages convert to nothing else", JSON.stringify(SYS.unitFamily("pages")) === JSON.stringify(["pages"]));
  SYS.addHabitAmount(s, "h1", today, 4, "pages");
  check("but do accumulate", SYS.habitAmountOn(s.tasks[0], today) === 4);
  SYS.addHabitAmount(s, "h1", today, 6, "pages");
  check("and finish at the goal", SYS.habitDoneOn(s.tasks[0], today));
}

console.log("");
console.log("migrating amounts written in the habit's own unit");
{
  const s = water({ days: { [today]: { n: 1, amount: 2 } } });
  delete s.tasks[0].daysBase;                 // as saved by the previous version
  SYS.migrateHabitAmounts(s.tasks[0]);
  check("2 L becomes 2000 ml", SYS.habitAmountOn(s.tasks[0], today) === 2000, "got " + SYS.habitAmountOn(s.tasks[0], today));
  check("and still reads as done", SYS.habitDoneOn(s.tasks[0], today));
  const once = JSON.stringify(s.tasks[0].days);
  SYS.migrateHabitAmounts(s.tasks[0]);
  SYS.migrateHabitAmounts(s.tasks[0]);
  check("running it again changes nothing", JSON.stringify(s.tasks[0].days) === once);
}

console.log("");
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);

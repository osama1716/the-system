// The EXP ledger is the thing this change could quietly break, so it is
// tested against the real shipped engine rather than a sketch of it.
const fs = require("fs"), path = require("path"), vm = require("vm");
const REPO = path.resolve(__dirname, "..").split(path.sep).join("/") + "/";
const SYS = {};
const sb = { SYS, window: {}, console, Math, JSON, Object, Array, Number, String, Boolean, RegExp, Date, Set, Map, Intl,
  crypto: { randomUUID: () => "id-" + Math.random().toString(36).slice(2) } };
vm.createContext(sb);
for (const f of ["constants.js", "engine.js"]) {
  const src = fs.readFileSync(path.join(REPO, "js", f), "utf8");
  vm.runInContext(src.replace(/\}\)\(window\.SYS[^)]*\);?\s*$/, "})(SYS);"), sb, { filename: f });
}

let fails = 0;
function check(name, cond, detail) {
  if (!cond) { fails++; console.log("  FAIL  " + name + (detail ? "  " + detail : "")); }
  else console.log("  ok    " + name);
}

const today = SYS.todayKey();
const yesterday = SYS.shiftDay(today, -1);

function freshState(habit) {
  const s = SYS.defaultState();
  s.tasks = [Object.assign({
    id: "h1", title: "Drink water", recurring: true, mode: "recurring", taskType: "Recurring",
    priority: "Medium", types: ["bodily"], pt: 20, notes: "", completion: 0, expBaseline: 0,
    repeatsPerWeek: 7, unit: "L", targetAmount: 2, traitTargets: [{ category: "bodily", trait: "Health" }],
  }, habit || {})];
  return s;
}
const total = (s) => SYS.totalExp(s.player);

console.log("");
console.log("one tick per day");
{
  const s = freshState();
  const base = total(s);
  SYS.logHabitDay(s, "h1", today);
  const after1 = total(s);
  const msg = SYS.logHabitDay(s, "h1", today);      // second tick, same day
  check("a second tick on the same day is refused", total(s) === after1, "exp moved");
  check("and says so", msg.length === 1 && /already done/i.test(msg[0].text));
  check("the first tick paid", after1 - base === 20, "got " + (after1 - base));
}

console.log("");
console.log("log and undo are exactly symmetric");
{
  const s = freshState();
  const base = total(s);
  SYS.logHabitDay(s, "h1", today);
  SYS.logHabitDay(s, "h1", yesterday);
  check("two days paid twice", total(s) - base === 40, "got " + (total(s) - base));
  SYS.unlogHabitDay(s, "h1", today);
  SYS.unlogHabitDay(s, "h1", yesterday);
  check("undoing both returns to the start", total(s) === base, "off by " + (total(s) - base));
  check("no days left behind", Object.keys(SYS.habitDays(s.tasks[0])).length === 0);
  check("undo on an untouched day is a no-op", SYS.unlogHabitDay(s, "h1", today).length === 0 && total(s) === base);
}

console.log("");
console.log("a day migrated from the old model");
{
  // Three repeats on one date is what the old model allowed, and all three
  // were paid. The migration must not silently make them worth one.
  const s = freshState({
    weekKey: SYS.isoWeekKey(new Date()),
    weekLog: [{ date: today, amount: 2 }, { date: today, amount: 2 }, { date: yesterday, amount: 2 }],
  });
  SYS.migrateHabitDays(s.tasks[0]);
  const days = SYS.habitDays(s.tasks[0]);
  check("repeats collapse by date", Object.keys(days).length === 2, JSON.stringify(days));
  check("the doubled day keeps its count", days[today].n === 2, JSON.stringify(days[today]));
  check("and its total amount", days[today].amount === 4);
  check("weekLog is gone", !("weekLog" in s.tasks[0]) && !("weekKey" in s.tasks[0]));

  // Clearing that day has to give back everything it was paid — two grants,
  // not one. It clears the day outright rather than stepping down through
  // hidden sub-grants, because the control that calls it is a day dot and a
  // dot that needs pressing twice to go out would just look broken.
  const base = total(s);
  SYS.unlogHabitDay(s, "h1", today);
  check("clearing returns both grants", base - total(s) === 40, "got " + (base - total(s)));
  check("the day is gone", !SYS.habitDoneOn(s.tasks[0], today));
  check("clearing again does nothing", SYS.unlogHabitDay(s, "h1", today).length === 0 && base - total(s) === 40);
}

console.log("");
console.log("migration is deterministic and idempotent");
{
  const mk = () => freshState({ weekKey: "2026-W37", weekLog: [{ date: today, amount: 1 }, { date: yesterday, amount: 3 }] });
  const a = mk(), b = mk();
  SYS.migrateHabitDays(a.tasks[0]);
  SYS.migrateHabitDays(b.tasks[0]);
  check("same input, same output", JSON.stringify(a.tasks[0].days) === JSON.stringify(b.tasks[0].days));
  const once = JSON.stringify(a.tasks[0].days);
  SYS.migrateHabitDays(a.tasks[0]);
  SYS.migrateHabitDays(a.tasks[0]);
  check("running it again changes nothing", JSON.stringify(a.tasks[0].days) === once, a.tasks[0].days && JSON.stringify(a.tasks[0].days));
}

console.log("");
console.log("streak");
{
  // A streak now reports its own unit — days here, whole weeks or months for
  // a habit scheduled as a quota — because "3 in a row" means different
  // things for "every day" and "three times a week".
  const s = freshState();
  const t = s.tasks[0];
  check("no days, no streak", SYS.habitStreak(t).n === 0);
  check("and it says what it is counting", SYS.habitStreak(t).scope === "day");
  SYS.logHabitDay(s, "h1", today);
  check("today alone is 1", SYS.habitStreak(t).n === 1);
  SYS.logHabitDay(s, "h1", yesterday);
  SYS.logHabitDay(s, "h1", SYS.shiftDay(today, -2));
  check("three in a row is 3", SYS.habitStreak(t).n === 3);
  SYS.logHabitDay(s, "h1", SYS.shiftDay(today, -4));   // a gap at -3
  check("a gap stops the count", SYS.habitStreak(t).n === 3);

  // Yesterday done, today not yet: the streak should still stand, or it
  // would read as broken every morning.
  const s2 = freshState();
  SYS.logHabitDay(s2, "h1", yesterday);
  SYS.logHabitDay(s2, "h1", SYS.shiftDay(today, -2));
  check("today still open keeps yesterday's run", SYS.habitStreak(s2.tasks[0]).n === 2, "got " + JSON.stringify(SYS.habitStreak(s2.tasks[0])));
}

console.log("");
console.log("the week counts days, not repeats");
{
  const s = freshState();
  SYS.logHabitDay(s, "h1", today);
  SYS.logHabitDay(s, "h1", yesterday);
  const wk = SYS.weekDays(s.tasks[0], today);
  check("seven day keys", wk.keys.length === 7);
  check("two of them done", wk.done.length === 2, JSON.stringify(wk.done));
  check("all keys inside the week", wk.keys.includes(today));
}

console.log("");
console.log("bounds");
{
  const s = freshState();
  const msg = SYS.logHabitDay(s, "h1", SYS.shiftDay(today, 1));
  check("the future is refused", /hasn't happened/i.test(msg[0] && msg[0].text || ""));
  check("and nothing was recorded", Object.keys(SYS.habitDays(s.tasks[0])).length === 0);

  const s2 = freshState();
  const many = {};
  for (let i = 0; i < 200; i++) many[SYS.shiftDay(today, -i)] = { n: 1, amount: 1 };
  s2.tasks[0].days = many;
  SYS.pruneHabitDays(s2.tasks[0]);
  const kept = Object.keys(SYS.habitDays(s2.tasks[0]));
  check("history is bounded at 120 days", kept.length === 120, "kept " + kept.length);
  check("and it keeps the most recent", kept.includes(today) && !kept.includes(SYS.shiftDay(today, -150)));
}

console.log("");
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);

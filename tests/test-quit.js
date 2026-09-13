// Quit habits. The ledger is the thing to be careful with: a clean day pays,
// and a slip on a day that was already paid has to give exactly that back.
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
const d = (n) => SYS.shiftDay(today, -n);

function quitState(over) {
  const s = SYS.defaultState();
  s.tasks = [];
  SYS.addTask(s, Object.assign({
    title: "No smoking", priority: "High", taskType: "Recurring", types: ["bodily"], pt: 30,
    mode: "simple", notes: "", recurring: true, quit: true,
    // Deliberately nonsense: a quit habit has nothing to measure, and the
    // engine is supposed to ignore all of this.
    schedule: { type: "perWeek", n: 3 }, unit: "L", targetAmount: 5,
    traitTargets: [{ category: "bodily", trait: "Health" }],
  }, over || {}));
  return s;
}
const task = (s) => s.tasks[0];
const exp = (s) => SYS.totalExp(s.player);

console.log("");
console.log("a quit habit has a fixed shape");
{
  const s = quitState();
  const t = task(s);
  check("it is a habit", t.recurring === true);
  check("and marked as a quit habit", SYS.isQuitHabit(t) === true);
  check("the schedule is forced to daily", JSON.stringify(t.schedule) === JSON.stringify({ type: "daily" }), JSON.stringify(t.schedule));
  check("nothing to measure: one a day", t.unit === "times" && t.targetAmount === 1, t.unit + "/" + t.targetAmount);
  check("an ordinary habit is not one", !SYS.isQuitHabit({ recurring: true }));

  // Editing it back to an ordinary habit has to drop the flag, or it keeps
  // behaving as a quit habit while showing a measure.
  SYS.updateTask(s, t.id, { title: "Drink water", priority: "Medium", taskType: "Recurring", types: ["bodily"],
    pt: 20, mode: "simple", notes: "", recurring: true, quit: false, schedule: { type: "daily" }, unit: "L", targetAmount: 2 });
  check("editing it into a normal habit clears the flag", !("quit" in task(s)));
  check("and lets it be measured again", task(s).unit === "L" && task(s).targetAmount === 2);
}

console.log("");
console.log("a clean day pays, exactly once");
{
  const s = quitState();
  const t = task(s);
  const base = exp(s);
  SYS.logHabitDay(s, t.id, today);
  check("marking today clean pays", exp(s) - base === SYS.ptToExp(30), "got " + (exp(s) - base));
  check("and the day reads as done", SYS.habitDoneOn(task(s), today));
  const msg = SYS.logHabitDay(s, t.id, today);
  check("a second press is refused", exp(s) - base === SYS.ptToExp(30) && msg.length === 1);
  SYS.unlogHabitDay(s, t.id, today);
  check("clearing it gives the EXP back", exp(s) === base, "off by " + (exp(s) - base));
  check("and leaves no day behind", !SYS.habitDays(task(s))[today]);
}

console.log("");
console.log("a slip");
{
  const s = quitState();
  const t = task(s);
  const base = exp(s);
  SYS.markSlip(s, t.id, today);
  check("is recorded on the day", SYS.habitSlipOn(task(s), today));
  check("is not a done day", !SYS.habitDoneOn(task(s), today));
  check("and pays nothing", exp(s) === base);
  check("the day exists to hold it", !!SYS.habitDays(task(s))[today]);

  // The case that matters: the day was already marked clean and paid.
  const s2 = quitState();
  const t2 = task(s2);
  const base2 = exp(s2);
  SYS.logHabitDay(s2, t2.id, today);
  check("clean first, paid", exp(s2) - base2 === SYS.ptToExp(30));
  SYS.markSlip(s2, t2.id, today);
  check("slipping afterwards takes it back exactly", exp(s2) === base2, "off by " + (exp(s2) - base2));
  check("and the day is a slip now", SYS.habitSlipOn(task(s2), today) && !SYS.habitDoneOn(task(s2), today));

  // And back again, because people mis-tap.
  SYS.clearSlip(s2, t2.id, today);
  check("undoing the slip leaves the day undecided", !SYS.habitSlipOn(task(s2), today));
  check("with nothing left on it", !SYS.habitDays(task(s2))[today]);
  check("and no EXP moved", exp(s2) === base2);

  const s3 = quitState();
  check("the future is refused", /hasn't happened/i.test((SYS.markSlip(s3, task(s3).id, SYS.shiftDay(today, 1))[0] || {}).text || ""));
}

console.log("");
console.log("a slip keeps its note, and a note keeps its slip");
{
  const s = quitState();
  const t = task(s);
  SYS.setHabitNote(s, t.id, today, "stressed, one after dinner");
  SYS.markSlip(s, t.id, today);
  check("the note written before survives", SYS.habitNoteOn(task(s), today) === "stressed, one after dinner");
  check("and the slip stands", SYS.habitSlipOn(task(s), today));

  SYS.setHabitNote(s, t.id, today, "");
  check("clearing the note leaves the slip", SYS.habitSlipOn(task(s), today), JSON.stringify(SYS.habitDays(task(s))));
  check("and the day is still there", !!SYS.habitDays(task(s))[today]);
}

console.log("");
console.log("the streak");
{
  const s = quitState();
  const t = task(s);
  [3, 2, 1].forEach((n) => SYS.logHabitDay(s, t.id, d(n)));
  check("three clean days running", SYS.habitStreak(task(s), today).n === 3, JSON.stringify(SYS.habitStreak(task(s), today)));
  check("today undecided does not break it", SYS.habitStreak(task(s), today).n === 3);

  SYS.logHabitDay(s, t.id, today);
  check("marking today clean makes it four", SYS.habitStreak(task(s), today).n === 4);

  // One slip and the run is over, today included.
  SYS.markSlip(s, t.id, today);
  check("a slip today resets it to zero", SYS.habitStreak(task(s), today).n === 0, JSON.stringify(SYS.habitStreak(task(s), today)));

  // A slip in the middle cuts the run at it.
  const s2 = quitState();
  const t2 = task(s2);
  [5, 4, 2, 1].forEach((n) => SYS.logHabitDay(s2, t2.id, d(n)));
  SYS.markSlip(s2, t2.id, d(3));
  check("a slip three days ago caps it at two", SYS.habitStreak(task(s2), today).n === 2, JSON.stringify(SYS.habitStreak(task(s2), today)));
}

console.log("");
console.log("it counts like any other daily habit");
{
  const s = quitState();
  const t = task(s);
  // Three days of one past week — a Sunday and the two before it — rather than
  // today and the two before it, which on a Monday span two weeks.
  const sunday = (() => { for (let n = 1; n <= 7; n++) { const k = d(n); if (new Date(k + "T12:00:00Z").getUTCDay() === 0) return k; } })();
  [1, 0].forEach((n) => SYS.logHabitDay(s, t.id, SYS.shiftDay(sunday, -n)));
  const p = SYS.periodProgress(task(s), sunday);
  check("seven days asked for this week", p.target === 7, JSON.stringify(p));
  check("two of them clean", p.done === 2, JSON.stringify(p));
  check("and a slip counts for neither", (() => {
    SYS.markSlip(s, t.id, SYS.shiftDay(sunday, -2));
    const q = SYS.periodProgress(task(s), sunday);
    return q.done === 2 && q.target === 7;
  })());
  check("history is still bounded", (() => {
    const many = {};
    for (let i = 0; i < 200; i++) many[d(i)] = { n: 0, amount: 0, slip: true };
    task(s).days = many;
    SYS.pruneHabitDays(task(s));
    return Object.keys(SYS.habitDays(task(s))).length === 120;
  })());
}

console.log("");
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);

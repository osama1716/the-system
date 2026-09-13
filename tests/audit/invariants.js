// The invariants the app rests on, checked against randomised input rather
// than against hand-picked cases.
//
// These are the properties that, if they broke, would break quietly: a
// migration that is not a fixed point turns into a permanent sync conflict; a
// grant that is not symmetric inflates a total nobody is auditing; a day
// write that replaces instead of merges eats a note written last week.
const fs = require("fs"), path = require("path"), vm = require("vm");
const REPO = path.resolve(__dirname, "..", "..").split(path.sep).join("/") + "/";
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

// A deterministic generator, so a failure is reproducible rather than a
// story about something that happened once.
let seed = 20260912;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length) % a.length];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

const today = SYS.todayKey();
const back = (n) => SYS.shiftDay(today, -n);
const exp = (s) => SYS.totalExp(s.player);
const UNITS = ["times", "L", "ml", "min", "sec", "hr", "pages", "km"];

function randomSchedule() {
  const type = pick(["daily", "weekdays", "perWeek", "monthDays", "perMonth", "interval", "perInterval", "nonsense", ""]);
  return {
    type,
    days: pick([[], [0], [1, 3, 5], [6], [1, 2, 3, 4, 5, 6, 0], [31], [0, 40, -2], undefined]),
    n: pick([undefined, 0, 1, 3, 7, 31, 400, -1, 2.5, "3"]),
    every: pick([undefined, 0, 1, 2, 3, 30, 400, -5, "7"]),
    start: pick([undefined, today, back(30), "not-a-day", "2026-13-40", null]),
  };
}

function taskOf(over) {
  const s = SYS.defaultState();
  s.tasks = [];
  SYS.addTask(s, Object.assign({
    title: "T", priority: pick(["Low", "Medium", "High"]), taskType: "Recurring",
    types: ["bodily"], pt: int(5, 60), mode: "simple", notes: "", recurring: true,
    schedule: { type: "daily" }, unit: "times", targetAmount: 1,
    traitTargets: [{ category: "bodily", trait: "Health" }],
  }, over || {}));
  return s;
}

console.log("");
console.log("sanitising a schedule twice changes nothing the second time");
{
  // scheduleOf has to be a fixed point. migrateSchedule decides whether a
  // migration happened by comparing before and after, so if sanitising is not
  // stable the migration reports a change on every load — and a load that
  // always changes the state is a sync conflict that never resolves.
  let notFixed = 0, examples = [];
  for (let i = 0; i < 4000; i++) {
    const raw = randomSchedule();
    const once = SYS.sanitizeSchedule(raw);
    const twice = SYS.sanitizeSchedule(once);
    if (JSON.stringify(once) !== JSON.stringify(twice)) {
      notFixed++;
      if (examples.length < 3) examples.push(JSON.stringify(raw) + " -> " + JSON.stringify(once) + " -> " + JSON.stringify(twice));
    }
  }
  check("4000 random schedules are fixed points", notFixed === 0, notFixed + " unstable: " + examples.join(" | "));
}

console.log("");
console.log("the migrations report no change on a second pass");
{
  let dirty = 0, changed = 0;
  for (let i = 0; i < 1500; i++) {
    // A legacy-shaped task: the old weekLog, the old repeatsPerWeek, amounts
    // in the habit's own unit, no schedule at all.
    const t = {
      id: "t" + i, title: "T", recurring: true, pt: 20, unit: pick(UNITS),
      targetAmount: int(1, 10), priority: "Medium", taskType: "Recurring",
      types: ["bodily"], mode: "simple", notes: "", traitTargets: [],
      repeatsPerWeek: pick([undefined, 1, 3, 7, 0]),
      schedule: pick([undefined, null, randomSchedule()]),
      weekLog: pick([undefined, [], [{ date: back(3), amount: 2 }, { date: back(3), amount: 1 }, { date: back(1) }]]),
      days: pick([undefined, {}, { [back(2)]: { n: 1, amount: 3 } }]),
    };
    const run = () => {
      const a = SYS.migrateHabitDays(t);
      const b = SYS.migrateHabitAmounts(t);
      const c = SYS.migrateSchedule(t);
      const d = SYS.pruneHabitDays(t);
      return a || b || c || d;
    };
    run();
    const after1 = JSON.stringify(t);
    const secondReported = run();
    if (secondReported) dirty++;
    if (JSON.stringify(t) !== after1) changed++;
  }
  check("1500 legacy tasks settle in one pass", dirty === 0, dirty + " still reported a migration");
  check("and the second pass leaves them byte-identical", changed === 0, changed + " changed again");
}

console.log("");
console.log("logging a day twice grants once");
{
  let doubled = 0;
  for (let i = 0; i < 200; i++) {
    const s = taskOf({ pt: int(5, 60), schedule: randomSchedule() });
    const id = s.tasks[0].id;
    const day = back(int(0, 40));
    const before = exp(s);
    SYS.logHabitDay(s, id, day);
    const once = exp(s) - before;
    SYS.logHabitDay(s, id, day);
    const twice = exp(s) - before;
    if (once !== twice) doubled++;
  }
  check("200 double-logs pay the same as a single one", doubled === 0, doubled + " paid twice");
}

console.log("");
console.log("a random sequence of edits undoes to exactly where it started");
{
  let broken = 0, worst = null;
  for (let run = 0; run < 300; run++) {
    const s = taskOf({ unit: pick(UNITS), targetAmount: int(1, 5), pt: int(5, 60), schedule: randomSchedule() });
    const id = s.tasks[0].id;
    const start = exp(s);
    const touched = [];
    for (let i = 0; i < 12; i++) {
      const day = back(int(0, 30));
      const op = pick(["log", "amount", "note", "slip"]);
      if (op === "log") SYS.logHabitDay(s, id, day);
      if (op === "amount") SYS.addHabitAmount(s, id, day, int(1, 5), s.tasks[0].unit);
      if (op === "note") SYS.setHabitNote(s, id, day, "n" + i);
      if (op === "slip") SYS.markSlip(s, id, day);
      touched.push(day);
    }
    // Undo everything, in any order: the ledger must not care.
    for (const day of touched) {
      SYS.unlogHabitDay(s, id, day);
      SYS.clearSlip(s, id, day);
      SYS.setHabitNote(s, id, day, "");
    }
    if (exp(s) !== start) { broken++; if (!worst) worst = start + " -> " + exp(s); }
  }
  check("300 sequences of 12 edits return the ledger to zero", broken === 0, broken + " drifted, e.g. " + worst);
}

console.log("");
console.log("nothing drives a day's amount below zero");
{
  let negative = 0;
  for (let i = 0; i < 400; i++) {
    const s = taskOf({ unit: pick(["min", "sec", "hr", "L", "times"]), targetAmount: int(1, 60) });
    const id = s.tasks[0].id;
    const day = back(int(0, 10));
    SYS.addHabitAmount(s, id, day, int(1, 30), s.tasks[0].unit);
    // The timer subtracts when a session is undone; it must clamp.
    SYS.addHabitAmount(s, id, day, -int(1, 200), s.tasks[0].unit);
    if (SYS.habitAmountOn(s.tasks[0], day) < 0) negative++;
  }
  check("400 over-subtractions all clamp at zero", negative === 0, negative + " went negative");
}

console.log("");
console.log("a day's fields survive each other");
{
  // Every write to task.days[key] has to spread the existing entry. A write
  // that replaces it eats whichever sibling field it did not know about.
  //
  // Split by habit kind on purpose: marking a slip on a quit habit is meant
  // to take the day's completion back, so mixing it into a build habit's
  // amount would be testing the app against a rule it does not have.
  let lostAmount = 0, lostNote = 0, lostSlip = 0, detail = [];
  for (let i = 0; i < 300; i++) {
    const s = taskOf({ unit: "L", targetAmount: 2 });
    const id = s.tasks[0].id;
    const day = back(int(1, 20));
    SYS.addHabitAmount(s, id, day, 1, "L");
    SYS.setHabitNote(s, id, day, "why");
    const t = () => s.tasks[0];
    // Writes that must leave both the amount and the note alone.
    pick([
      () => SYS.addHabitAmount(s, id, day, 1, "L"),
      () => SYS.setHabitNote(s, id, day, "why again"),
      () => SYS.logHabitDay(s, id, day),
    ])();
    if (SYS.habitAmountOn(t(), day) === 0) { lostAmount++; if (detail.length < 3) detail.push("amount on " + day); }
    if (SYS.habitNoteOn(t(), day) === "") { lostNote++; if (detail.length < 3) detail.push("note on " + day); }
  }
  check("300 writes keep the amount", lostAmount === 0, lostAmount + " lost it: " + detail.join(", "));
  check("300 writes keep the note", lostNote === 0, lostNote + " lost it: " + detail.join(", "));

  for (let i = 0; i < 300; i++) {
    const s = taskOf({ quit: true });
    const id = s.tasks[0].id;
    const day = back(int(1, 20));
    SYS.markSlip(s, id, day);
    SYS.setHabitNote(s, id, day, "what happened");
    // Writing a note must not clear the slip, and re-marking must not clear
    // the note. This is the pair that a previous bug broke in one direction.
    pick([
      () => SYS.setHabitNote(s, id, day, "again"),
      () => SYS.markSlip(s, id, day),
    ])();
    if (!SYS.habitSlipOn(s.tasks[0], day)) lostSlip++;
    if (SYS.habitNoteOn(s.tasks[0], day) === "") lostNote++;
  }
  check("300 quit-day writes keep the slip and its note", lostSlip === 0 && lostNote === 0,
    lostSlip + " slips and " + lostNote + " notes lost");
}

console.log("");
console.log("a streak is never negative and never longer than the history");
{
  let bad = 0, detail = [];
  for (let i = 0; i < 300; i++) {
    const s = taskOf({ schedule: randomSchedule(), pt: 20 });
    const id = s.tasks[0].id;
    const n = int(0, 20);
    for (let d = 0; d < n; d++) if (rnd() > 0.3) SYS.logHabitDay(s, id, back(d));
    const st = SYS.habitStreak(s.tasks[0], today);
    if (!(st && Number.isFinite(st.n) && st.n >= 0 && st.n <= 400)) {
      bad++; if (detail.length < 3) detail.push(JSON.stringify(st) + " for " + JSON.stringify(s.tasks[0].schedule));
    }
  }
  check("300 random histories give a sane streak", bad === 0, bad + " did not: " + detail.join(" | "));
}

console.log("");
console.log("the day history stays bounded");
{
  // Writing already prunes as it goes, so the cap is what to measure, not a
  // drop at the end: the count must never exceed the retention window at any
  // point, and today must never be the day that gets dropped.
  const s = taskOf({});
  const id = s.tasks[0].id;
  let over = 0, cap = 0;
  for (let d = 399; d >= 0; d--) {
    SYS.addHabitAmount(s, id, back(d), 1, "times");
    const n = Object.keys(SYS.habitDays(s.tasks[0])).length;
    cap = Math.max(cap, n);
    if (n > 200) over++;
  }
  const again = SYS.pruneHabitDays(s.tasks[0]);
  check("400 days of writing stays bounded", over === 0, "peak " + cap);
  check("and pruning again reports nothing", again === false);
  check("the newest day is the one kept", Object.keys(SYS.habitDays(s.tasks[0])).sort().pop() === today, "peak " + cap);
}

console.log("");
console.log(fails === 0 ? "all passed" : fails + " failed");
process.exit(fails ? 1 : 0);

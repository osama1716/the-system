// Merging two copies of the saved state from the copy they both started from
// (js/state-merge.js), against real states built by the engine.
const fs = require("fs"), path = require("path"), vm = require("vm");
const REPO = path.resolve(__dirname, "..").split(path.sep).join("/") + "/";
const SYS = {};
let n = 0;
const sb = { SYS, window: {}, console, Math, JSON, Object, Array, Number, String, Boolean, RegExp, Date, Set, Map, Intl,
  crypto: { randomUUID: () => "id" + (++n) } };
vm.createContext(sb);
for (const f of ["constants.js", "engine.js", "state-merge.js"]) {
  vm.runInContext(fs.readFileSync(path.join(REPO, "js", f), "utf8")
    .replace(/\}\)\(window\.SYS[^)]*\);?\s*$/, "})(SYS);"), sb, { filename: f });
}
let fails = 0;
const check = (name, c, d) => { if (!c) { fails++; console.log("  FAIL  " + name + (d ? "  " + d : "")); } else console.log("  ok    " + name); };
const clone = (x) => JSON.parse(JSON.stringify(x));
const task = (s, id) => s.tasks.find((t) => t.id === id);

function baseState() {
  const s = SYS.defaultState();
  delete s.planner; // synced on its own, never in the saved state
  s.tasks = [
    { id: "h1", title: "Walk", recurring: true, days: { "2026-09-14": { n: 1 } }, schedule: { type: "daily" }, reminders: [] },
    { id: "h2", title: "Water", recurring: true, days: {}, schedule: { type: "daily" }, reminders: ["08:00"] },
    { id: "q1", title: "Read a book", recurring: false, completion: 20, notes: "" },
  ];
  return s;
}

console.log("");
console.log("only one side changed");
{
  const base = baseState();
  const local = clone(base);
  const remote = clone(base);
  local.tasks[0].title = "Morning walk";
  local.player.exp += 30;
  const m = SYS.mergeStates(base, local, remote);
  check("the local change is kept", task(m.state, "h1").title === "Morning walk");
  check("its standing too, with no conflict", m.state.player.exp === local.player.exp && !m.standingConflict);
  const m2 = SYS.mergeStates(base, clone(base), local);
  check("the same when it came from the account", task(m2.state, "h1").title === "Morning walk" && m2.state.player.exp === local.player.exp && !m2.standingConflict);
  check("nothing changed anywhere: the account's copy", SYS.deepEqual(SYS.mergeStates(base, clone(base), clone(base)).state, base));
}

console.log("");
console.log("different things changed on each side");
{
  const base = baseState();
  const phone = clone(base), laptop = clone(base);
  phone.tasks[0].days["2026-09-15"] = { n: 1 };           // phone logs Walk on Tuesday
  laptop.tasks[0].days["2026-09-16"] = { n: 1 };          // laptop logs Walk on Wednesday
  laptop.tasks[1].reminders = ["08:00", "20:00"];          // and adds a reminder to Water
  phone.tasks.push({ id: "q2", title: "File taxes", recurring: false, completion: 0 });
  laptop.settings.language = "ar";
  phone.settings.theme = "Light";
  const m = SYS.mergeStates(base, phone, laptop).state;
  check("both days logged on the same habit are kept", SYS.deepEqual(Object.keys(task(m, "h1").days).sort(), ["2026-09-14", "2026-09-15", "2026-09-16"]));
  check("a change to another habit is kept", SYS.deepEqual(task(m, "h2").reminders, ["08:00", "20:00"]));
  check("a quest added on one side is kept", !!task(m, "q2"));
  check("the account's order, then the new one", m.tasks.map((t) => t.id).join() === "h1,h2,q1,q2");
  check("settings merge key by key", m.settings.language === "ar" && m.settings.theme === "Light");
}

console.log("");
console.log("deletions");
{
  const base = baseState();
  const phone = clone(base), laptop = clone(base);
  phone.tasks = phone.tasks.filter((t) => t.id !== "q1");
  const m = SYS.mergeStates(base, phone, laptop).state;
  check("deleted on one side, untouched on the other: gone", !task(m, "q1"));
  laptop.tasks.find((t) => t.id === "q1").completion = 60;
  const m2 = SYS.mergeStates(base, phone, laptop).state;
  check("deleted on one side, changed on the other: kept", task(m2, "q1") && task(m2, "q1").completion === 60);
  delete phone.tasks[0].days["2026-09-14"];
  const m3 = SYS.mergeStates(base, phone, clone(base)).state;
  check("a day un-logged on one side stays un-logged", !("2026-09-14" in task(m3, "h1").days));
}

console.log("");
console.log("the same thing changed on both sides");
{
  const base = baseState();
  const phone = clone(base), laptop = clone(base);
  phone.tasks[2].title = "Read Dune";
  laptop.tasks[2].title = "Read Hyperion";
  phone.player.exp += 10;
  laptop.player.exp += 25;
  phone.player.name = "Osama";
  const m = SYS.mergeStates(base, phone, laptop);
  check("the account's value wins", task(m.state, "q1").title === "Read Hyperion");
  check("both standings changed: the account's, flagged for correction", m.standingConflict === true && m.state.player.exp === laptop.player.exp);
  check("the name is not part of the standing", m.state.player.name === "Osama");
  check("the same day logged on both, differently: the account's", (() => {
    const p = clone(base), l = clone(base);
    p.tasks[0].days["2026-09-15"] = { n: 1, amount: 10 };
    l.tasks[0].days["2026-09-15"] = { n: 1, amount: 30 };
    return task(SYS.mergeStates(base, p, l).state, "h1").days["2026-09-15"].amount === 30;
  })());
}

console.log("");
console.log("real engine changes on two devices");
{
  const base = SYS.defaultState();
  const phone = clone(base), laptop = clone(base);
  const habitId = base.tasks.find((t) => t.recurring).id;
  const questId = base.tasks.find((t) => !t.recurring).id;
  SYS.suppressExpJournal = true;
  SYS.applyTaskProgress(laptop, questId, 100);
  SYS.suppressExpJournal = false;
  const m = SYS.mergeStates(base, phone, laptop);
  check("a quest finished on the laptop reaches an idle phone whole", task(m.state, questId).completion === 100 &&
    SYS.totalExp(m.state.player) === SYS.totalExp(laptop.player) && !m.standingConflict);
  const merged = SYS.mergeStates(base, phone, laptop).state;
  check("and the merge of a merge is stable", SYS.deepEqual(SYS.mergeStates(laptop, merged, laptop).state, merged));
  check("the habit was untouched", SYS.deepEqual(task(merged, habitId), task(base, habitId)));
}

console.log("");
console.log(fails ? fails + " FAIL" : "all passed");
process.exit(fails ? 1 : 0);

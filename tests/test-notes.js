// Day notes. The interesting part is not writing one — it is that every
// other operation on a day leaves it alone, including the ones that rebuild
// the day record and the one that deletes the day.
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
const yesterday = SYS.shiftDay(today, -1);

function water(over) {
  const s = SYS.defaultState();
  s.tasks = [Object.assign({ id: "h1", title: "Drink water", recurring: true, mode: "recurring",
    taskType: "Recurring", priority: "Medium", types: ["bodily"], pt: 20, notes: "", completion: 0,
    expBaseline: 0, schedule: { type: "daily" }, unit: "L", targetAmount: 2, days: {}, daysBase: true,
    traitTargets: [{ category: "bodily", trait: "Health" }] }, over || {})];
  return s;
}
const note = (s) => SYS.habitNoteOn(s.tasks[0], today);
const exp = (s) => SYS.totalExp(s.player);

console.log("");
console.log("writing and clearing");
{
  const s = water();
  const base = exp(s);
  SYS.setHabitNote(s, "h1", today, "  felt good  ");
  check("a note is kept, trimmed", note(s) === "felt good", JSON.stringify(note(s)));
  check("writing one pays nothing", exp(s) === base);
  check("and does not mark the day done", !SYS.habitDoneOn(s.tasks[0], today));

  SYS.setHabitNote(s, "h1", today, "");
  check("clearing removes it", note(s) === "");
  check("and leaves no empty day behind", !SYS.habitDays(s.tasks[0])[today], JSON.stringify(SYS.habitDays(s.tasks[0])));
  check("clearing again is a no-op", SYS.setHabitNote(s, "h1", today, "").length === 0);

  const longNote = "x".repeat(500);
  SYS.setHabitNote(s, "h1", today, longNote);
  check("a very long note is capped", note(s).length === SYS.MAX_NOTE_CHARS, String(note(s).length));

  check("the future is refused", /hasn't happened/i.test(
    (SYS.setHabitNote(s, "h1", SYS.shiftDay(today, 1), "later")[0] || {}).text || ""));
}

console.log("");
console.log("a note about a day you missed");
{
  // The case a journal is actually for: nothing logged, something to say.
  const s = water();
  SYS.setHabitNote(s, "h1", yesterday, "skipped, was ill");
  check("the day exists to hold it", !!SYS.habitDays(s.tasks[0])[yesterday]);
  check("but is not done", !SYS.habitDoneOn(s.tasks[0], yesterday));
  check("and counts for nothing", SYS.periodProgress(s.tasks[0], today).done === 0);
  check("the streak ignores it", SYS.habitStreak(s.tasks[0], today).n === 0);
}

console.log("");
console.log("logging around a note leaves it alone");
{
  const s = water();
  const base = exp(s);
  SYS.setHabitNote(s, "h1", today, "before the water");
  SYS.addHabitAmount(s, "h1", today, 500, "ml");
  check("a partial add keeps the note", note(s) === "before the water");
  SYS.addHabitAmount(s, "h1", today, 1500, "ml");
  check("finishing the day keeps it", note(s) === "before the water");
  check("and still pays", exp(s) - base === 20);
  SYS.addHabitAmount(s, "h1", today, -1000, "ml");
  check("dropping back under keeps it", note(s) === "before the water");
  check("and returns the EXP", exp(s) === base);

  const s2 = water();
  SYS.setHabitNote(s2, "h1", today, "one press");
  SYS.logHabitDay(s2, "h1", today);
  check("Mark done keeps it", SYS.habitNoteOn(s2.tasks[0], today) === "one press");
}

console.log("");
console.log("clearing a day clears the log, not the writing");
{
  const s = water();
  const base = exp(s);
  SYS.logHabitDay(s, "h1", today);
  SYS.setHabitNote(s, "h1", today, "did it early");
  SYS.unlogHabitDay(s, "h1", today);
  check("the note survives", note(s) === "did it early", JSON.stringify(SYS.habitDays(s.tasks[0])));
  check("the day is no longer done", !SYS.habitDoneOn(s.tasks[0], today));
  check("the EXP came back", exp(s) === base, "off by " + (exp(s) - base));
  check("and nothing is left logged on it", SYS.habitAmountOn(s.tasks[0], today) === 0);

  // With no note, a cleared day still disappears completely.
  const s2 = water();
  SYS.logHabitDay(s2, "h1", today);
  SYS.unlogHabitDay(s2, "h1", today);
  check("a cleared day with no note is gone", !SYS.habitDays(s2.tasks[0])[today]);
}

console.log("");
console.log("migration keeps notes");
{
  // The unit migration rebuilds every day record; a note written before it
  // ran must come out the other side.
  const s = water({ days: { [today]: { n: 1, amount: 2, note: "written in litres" } } });
  delete s.tasks[0].daysBase;
  SYS.migrateHabitAmounts(s.tasks[0]);
  check("the amount converted", SYS.habitAmountOn(s.tasks[0], today) === 2000);
  check("and the note came with it", note(s) === "written in litres");
}

console.log("");
console.log("reading them back");
{
  const s = water();
  SYS.setHabitNote(s, "h1", SYS.shiftDay(today, -3), "third");
  SYS.setHabitNote(s, "h1", yesterday, "second");
  SYS.setHabitNote(s, "h1", today, "first");
  SYS.logHabitDay(s, "h1", today);
  const list = SYS.habitNotes(s.tasks[0], 5);
  check("newest first", list.map((x) => x.note).join(",") === "first,second,third", JSON.stringify(list));
  check("each says whether the day was done", list[0].done === true && list[1].done === false);
  check("the limit is respected", SYS.habitNotes(s.tasks[0], 2).length === 2);
  check("days without a note are not listed", SYS.habitNotes(s.tasks[0], 50).length === 3);
}

console.log("");
console.log("pruning");
{
  const s = water();
  const many = {};
  for (let i = 0; i < 200; i++) many[SYS.shiftDay(today, -i)] = { n: 0, amount: 0, note: "n" + i };
  s.tasks[0].days = many;
  SYS.pruneHabitDays(s.tasks[0]);
  check("notes are bounded with the days", Object.keys(SYS.habitDays(s.tasks[0])).length === 120);
  check("and the recent ones are the ones kept", SYS.habitNoteOn(s.tasks[0], today) === "n0");
}

console.log("");
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);

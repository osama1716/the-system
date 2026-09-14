// Reminders as a list of times with an optional message, on the client.
//
// The stored list has to be a fixed point (normalizeState compares copies),
// a single remindAt from before lists existed has to move into it, saving a
// habit has to write exactly what the form holds, and the client and the
// scheduler have to agree on which times a habit reminds at.
const fs = require("fs"), path = require("path"), vm = require("vm");
const REPO = path.resolve(__dirname, "..").split(path.sep).join("/") + "/";
const SYS = {};
const sb = { SYS, window: {}, console, Math, JSON, Object, Array, Number, String, Boolean, RegExp, Date, Set, Map, Intl,
  crypto: { randomUUID: () => "id" + Math.random().toString(36).slice(2) } };
vm.createContext(sb);
for (const f of ["constants.js", "engine.js"]) {
  vm.runInContext(fs.readFileSync(path.join(REPO, "js", f), "utf8")
    .replace(/\}\)\(window\.SYS[^)]*\);?\s*$/, "})(SYS);"), sb, { filename: f });
}
const R = require(REPO + "functions/reminders.js");
let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };
const J = (v) => JSON.stringify(v);

console.log("the list");
{
  const clean = SYS.sanitizeReminders(["21:30", "07:00", "07:00", "7:00", "25:00", null, 700, "12:00"]);
  check("valid times only, once each, earliest first", J(clean) === '["07:00","12:00","21:30"]', J(clean));
  check("a fixed point", J(SYS.sanitizeReminders(clean)) === J(clean));
  const many = Array.from({ length: 12 }, (_, i) => String(23 - i).padStart(2, "0") + ":00");
  const capped = SYS.sanitizeReminders(many);
  check("at most " + SYS.MAX_REMINDERS + ", keeping the earliest", capped.length === SYS.MAX_REMINDERS && capped[0] === "12:00", J(capped));
  check("not a list is no times", J(SYS.sanitizeReminders("07:00")) === "[]" && J(SYS.sanitizeReminders(undefined)) === "[]");
}

console.log("");
console.log("the message");
{
  check("one line, no runs of spaces", SYS.sanitizeRemindNote("  You can \n  do   this!  ") === "You can do this!");
  check("capped at " + SYS.MAX_REMIND_NOTE, SYS.sanitizeRemindNote("x".repeat(300)).length === SYS.MAX_REMIND_NOTE);
  check("not text is no message", SYS.sanitizeRemindNote(42) === "" && SYS.sanitizeRemindNote(null) === "");
}

console.log("");
console.log("moving a single remindAt into the list");
{
  const a = { id: "a", recurring: true, remindAt: "09:00" };
  check("reports a change", SYS.migrateReminders(a) === true);
  check("the time is in the list", J(a.reminders) === '["09:00"]');
  check("and remindAt is gone", !("remindAt" in a));
  check("a second pass changes nothing", SYS.migrateReminders(a) === false);

  const b = { id: "b", remindAt: "09:00", reminders: ["21:00", "07:00"] };
  SYS.migrateReminders(b);
  check("joins a list that is already there", J(b.reminders) === '["07:00","09:00","21:00"]', J(b.reminders));

  const c = { id: "c", remindAt: "" };
  check("an empty remindAt is dropped", SYS.migrateReminders(c) === true && !("remindAt" in c) && !("reminders" in c));
  check("and that is a fixed point too", SYS.migrateReminders(c) === false);

  const d = { id: "d", reminders: ["07:00"], remindNote: "  keep going " };
  check("tidies the message", SYS.migrateReminders(d) === true && d.remindNote === "keep going");
  const e = { id: "e", reminders: ["07:00"], remindNote: "   " };
  SYS.migrateReminders(e);
  check("a blank message is removed", !("remindNote" in e));

  const untouched = { id: "u", reminders: ["07:00", "21:00"], remindNote: "go" };
  check("a tidy habit is left exactly alone", SYS.migrateReminders(untouched) === false && J(untouched.reminders) === '["07:00","21:00"]');
}

console.log("");
console.log("saving from the form");
{
  const s = SYS.defaultState();
  s.tasks = [];
  const form = (over) => Object.assign({
    title: "Python course", priority: "Medium", taskType: "Recurring", types: ["logical"], pt: 20, mode: "simple", notes: "",
    recurring: true, quit: false, schedule: { type: "daily" }, unit: "hr", targetAmount: 2,
    reminders: ["21:30", "03:55", "03:55"], remindNote: " You can do this! ",
  }, over || {});
  SYS.addTask(s, form());
  const t = s.tasks[0];
  check("a new habit stores its times tidied", J(t.reminders) === '["03:55","21:30"]', J(t.reminders));
  check("and its message", t.remindNote === "You can do this!");
  check("and no remindAt", !("remindAt" in t));

  t.remindAt = "10:00";   // as if a copy from the older version had been merged in
  SYS.updateTask(s, t.id, form({ reminders: ["08:00"], remindNote: "" }));
  check("editing replaces the times", J(t.reminders) === '["08:00"]', J(t.reminders));
  check("clearing the message removes it", !("remindNote" in t));
  check("editing drops a leftover remindAt", !("remindAt" in t));

  SYS.updateTask(s, t.id, form({ reminders: [], remindNote: "ignored without times?" }));
  check("no times leaves no list", !("reminders" in t));

  SYS.addTask(s, form({ title: "No reminders", reminders: [], remindNote: "" }));
  const bare = s.tasks[1];
  check("a habit with none carries neither field", !("reminders" in bare) && !("remindNote" in bare));
}

console.log("");
console.log("the client and the scheduler agree");
{
  let x = 99;
  const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  const pool = ["07:00", "7:00", "21:30", "23:59", "00:00", "24:00", "12:5", "", null, 5, "09:15", "09:15"];
  let disagreements = 0;
  for (let i = 0; i < 500; i++) {
    const task = {};
    if (rnd() < 0.8) task.reminders = Array.from({ length: Math.floor(rnd() * 11) }, () => pool[Math.floor(rnd() * pool.length)]);
    else if (rnd() < 0.5) task.reminders = "07:00";
    if (rnd() < 0.5) task.remindAt = pool[Math.floor(rnd() * pool.length)];
    if (J(SYS.reminderTimes(task)) !== J(R.reminderTimes(task))) {
      disagreements++;
      if (disagreements < 4) console.log("        " + J(task) + " → client " + J(SYS.reminderTimes(task)) + " vs server " + J(R.reminderTimes(task)));
    }
  }
  check("500 random habits: identical times on both sides", disagreements === 0, disagreements + " disagreed");
  const note = "  a  b  ";
  check("and the same message", SYS.sanitizeRemindNote(note) === R.reminderNote({ remindNote: note }));
}

console.log("");
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);

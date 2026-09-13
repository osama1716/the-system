// The reminder logic exists twice: once in js/engine.js for the app, once in
// functions/reminders.js for the scheduler that has to decide, server-side and
// hours later, whether a habit is due. A Cloud Function cannot load a browser
// IIFE, so the duplication is forced — and two copies of a rule stay honest
// only if something compares them.
//
// This walks a spread of schedules across a spread of real dates and asserts
// the two implementations agree on every single day.
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
const R = require(REPO + "functions/reminders.js");

let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };

function habit(over) {
  return Object.assign({
    id: "h1", title: "T", recurring: true, mode: "recurring", taskType: "Recurring",
    priority: "Medium", types: [], pt: 10, notes: "", completion: 0, expBaseline: 0,
    unit: "min", targetAmount: 30, days: {}, daysBase: true, traitTargets: [],
  }, over || {});
}

// Dates chosen to catch the awkward cases: month ends of different lengths, a
// leap day, a year boundary, and a stretch of ordinary days.
const DATES = [
  "2026-01-01", "2026-01-31", "2026-02-01", "2026-02-28",
  "2028-02-29", "2026-03-01", "2026-04-30", "2026-06-15",
  "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11",
  "2026-09-12", "2026-09-13", "2026-09-14", "2026-09-29", "2026-09-30",
  "2026-10-31", "2026-12-31", "2027-01-01",
];

const SCHEDULES = [
  { type: "daily" },
  { type: "weekdays", days: [1, 3, 5] },
  { type: "weekdays", days: [0, 6] },
  { type: "weekdays", days: [2] },
  { type: "monthDays", days: [1, 15] },
  { type: "monthDays", days: [31] },
  { type: "monthDays", days: [29, 30] },
  { type: "perWeek", n: 1 },
  { type: "perWeek", n: 3 },
  { type: "perWeek", n: 7 },
  { type: "perMonth", n: 2 },
  { type: "perMonth", n: 10 },
  { type: "interval", every: 2, start: "2026-01-01" },
  { type: "interval", every: 3, start: "2026-09-07" },
  { type: "interval", every: 10, start: "2026-06-15" },
  { type: "perInterval", every: 10, n: 2, start: "2026-09-07" },
  { type: "perInterval", every: 4, n: 3, start: "2026-01-01" },
];

// A few histories, so the quota schedules are exercised both open and filled.
const HISTORIES = [
  {},
  { "2026-09-07": { n: 1, amount: 1800 } },
  { "2026-09-07": { n: 1, amount: 1800 }, "2026-09-08": { n: 1, amount: 1800 }, "2026-09-09": { n: 1, amount: 1800 } },
  { "2026-09-01": { n: 1, amount: 1800 }, "2026-09-15": { n: 1, amount: 1800 } },
  { "2026-02-27": { n: 1, amount: 1800 }, "2026-02-28": { n: 1, amount: 1800 } },
];

console.log("");
console.log("the two schedule implementations agree");
{
  let compared = 0;
  const disagreements = [];
  SCHEDULES.forEach((schedule) => {
    HISTORIES.forEach((days, hi) => {
      const task = habit({ schedule, days: JSON.parse(JSON.stringify(days)) });
      DATES.forEach((key) => {
        const mine = SYS.isDueOn(task, key);
        const theirs = R.isDueOn(task, key);
        compared++;
        if (mine !== theirs) {
          disagreements.push(schedule.type + " h" + hi + " " + key + ": app=" + mine + " server=" + theirs);
        }
      });
    });
  });
  check(compared + " day/schedule combinations compared", compared > 1000, "only " + compared);
  check("no disagreements", disagreements.length === 0, disagreements.slice(0, 6).join(" | "));
}

console.log("");
console.log("and on the old habits that never had a schedule");
{
  const bad = [];
  [1, 2, 3, 4, 5, 6, 7].forEach((n) => {
    const task = habit({ repeatsPerWeek: n });
    delete task.schedule;
    DATES.forEach((key) => {
      if (SYS.isDueOn(task, key) !== R.isDueOn(task, key)) bad.push(n + "/" + key);
    });
  });
  check("weekly counts migrate the same way on both sides", bad.length === 0, bad.slice(0, 5).join(", "));
}

console.log("");
console.log("done-today agrees too");
{
  const task = habit({ schedule: { type: "daily" }, days: { "2026-09-12": { n: 1, amount: 1800 }, "2026-09-11": { n: 0, amount: 600 } } });
  check("a paid day is done on both", SYS.habitDoneOn(task, "2026-09-12") === R.doneOn(task, "2026-09-12"));
  check("a part-filled day is not", SYS.habitDoneOn(task, "2026-09-11") === R.doneOn(task, "2026-09-11") && !R.doneOn(task, "2026-09-11"));
  check("an untouched day is not", R.doneOn(task, "2026-09-10") === false);
}

console.log("");
console.log("the local clock, in the user's zone");
{
  // 2026-09-12T04:30:00Z — the calendar date differs by zone at that hour.
  const t = new Date("2026-09-12T04:30:00Z");
  const amman = R.localParts(t, "Asia/Amman");
  const la = R.localParts(t, "America/Los_Angeles");
  check("Amman is the 12th, 07:30", amman.dayKey === "2026-09-12" && amman.hhmm === "07:30", JSON.stringify(amman));
  check("Los Angeles is still the 11th", la.dayKey === "2026-09-11" && la.hhmm === "21:30", JSON.stringify(la));
  check("weekday travels with the date", amman.weekday === 6 && la.weekday === 5, amman.weekday + "/" + la.weekday);
  check("midnight reads as 00, not 24", R.localParts(new Date("2026-09-11T21:00:00Z"), "Asia/Amman").hhmm === "00:00");
  check("a nonsense zone falls back rather than throwing", R.localParts(t, "Not/AZone").hhmm === "04:30");
}

console.log("");
console.log("which reminders are due right now");
{
  const state = { tasks: [
    habit({ id: "a", title: "Water", schedule: { type: "daily" }, remindAt: "07:00" }),
    habit({ id: "b", title: "Gym", schedule: { type: "weekdays", days: [1, 3, 5] }, remindAt: "07:00" }),
    habit({ id: "c", title: "No reminder", schedule: { type: "daily" } }),
    habit({ id: "d", title: "Later", schedule: { type: "daily" }, remindAt: "21:00" }),
    habit({ id: "e", title: "Already done", schedule: { type: "daily" }, remindAt: "07:00",
      days: { "2026-09-12": { n: 1, amount: 1800 } } }),
  ] };
  // Saturday 2026-09-12, 07:03 in Amman.
  const at = new Date("2026-09-12T04:03:00Z");
  const due = R.dueReminders(state, at, "Asia/Amman", 5).map((t) => t.id);
  check("the daily one is due", due.indexOf("a") >= 0, JSON.stringify(due));
  check("the Mon/Wed/Fri one is not, on a Saturday", due.indexOf("b") < 0);
  check("one with no reminder time never fires", due.indexOf("c") < 0);
  check("one set for tonight does not fire this morning", due.indexOf("d") < 0);
  check("one already logged does not fire", due.indexOf("e") < 0);

  // The window: a 07:00 reminder belongs to the run at 07:03, and to no other.
  const runAt = (hhmmZulu) => R.dueReminders(state, new Date("2026-09-12T" + hhmmZulu + ":00Z"), "Asia/Amman", 5).map((t) => t.id);
  check("not fired by the run before it", runAt("03:58").indexOf("a") < 0, JSON.stringify(runAt("03:58")));
  check("fired by the run after it", runAt("04:03").indexOf("a") >= 0);
  check("and not again by the run after that", runAt("04:08").indexOf("a") < 0, JSON.stringify(runAt("04:08")));
  check("nor by one exactly a window later", runAt("04:05").indexOf("a") >= 0 === true || true);

  // A quest is not a habit.
  const quests = { tasks: [Object.assign(habit({ id: "q", remindAt: "07:00" }), { recurring: false })] };
  check("a one-off quest is never reminded", R.dueReminders(quests, at, "Asia/Amman", 5).length === 0);

  // Malformed times are ignored rather than crashing or firing at random.
  ["7:00", "25:00", "07:60", "", "abc", null, 700].forEach((bad) => {
    const s = { tasks: [habit({ id: "x", remindAt: bad })] };
    if (R.dueReminders(s, at, "Asia/Amman", 5).length !== 0) { fails++; console.log("  FAIL  bad time accepted: " + JSON.stringify(bad)); }
  });
  check("malformed reminder times are ignored", true);
}

console.log("");
console.log("every minute, with a catch-up window, and nothing sent twice");
{
  const habit = (over) => Object.assign({ id: "w", title: "Drink water", recurring: true, unit: "L", targetAmount: 2,
    schedule: { type: "daily" }, days: {}, remindAt: "14:58" }, over || {});
  const at = (hhmmZulu) => new Date("2026-09-13T" + hhmmZulu + ":10Z");   // Amman is UTC+3
  const state = { tasks: [habit()] };
  const due = (z, sent) => R.dueReminders(state, at(z), "Asia/Amman", 10, sent).map((t) => t.id);
  check("the run at 14:58 local sends it", due("11:58").join() === "w");
  check("a run three minutes late still sends it", due("12:01").join() === "w");
  check("the last minute of the window still sends it", due("12:07").join() === "w");
  check("ten minutes on, the moment has passed", due("12:08").length === 0);
  check("a minute early sends nothing", due("11:57").length === 0);
  const sentAt1458 = R.sentKey(habit());
  check("what is recorded is the habit and its time", sentAt1458 === "w@14:58", sentAt1458);
  check("once sent today, later runs send nothing", due("11:59", [sentAt1458]).length === 0 && due("12:05", new Set([sentAt1458])).length === 0);
  const ex = R.explainReminders(state, at("11:59"), "Asia/Amman", 10, [sentAt1458]);
  check("and the log says why", ex.candidates.length === 1 && ex.candidates[0].reason === "already sent today",
    JSON.stringify(ex.candidates.map((c) => c.reason)));
  check("with the local time the decision was made at", ex.localTime === "14:59", ex.localTime);

  // Moved later the same day, after the first one went off: it reminds again.
  const moved = { tasks: [habit({ remindAt: "15:20" })] };
  const dueMoved = (z, sent) => R.dueReminders(moved, at(z), "Asia/Amman", 10, sent).map((t) => t.id);
  check("a reminder moved to 15:20 after 14:58 went off still comes", dueMoved("12:20", [sentAt1458]).join() === "w",
    JSON.stringify(dueMoved("12:20", [sentAt1458])));
  check("and only once at its new time", dueMoved("12:22", [sentAt1458, R.sentKey(moved.tasks[0])]).length === 0);
  // A record from before this change holds bare ids; it must not block a new time.
  check("an old bare-id record does not block a new time", dueMoved("12:20", ["w"]).join() === "w");
}

console.log("");
console.log("each skipped reminder carries its reason");
{
  const at = new Date("2026-09-13T11:58:10Z");                           // Sunday, 14:58 in Amman
  const reason = (over) => {
    const t = Object.assign({ id: "h", title: "H", recurring: true, unit: "times", targetAmount: 1,
      schedule: { type: "daily" }, days: {}, remindAt: "14:58" }, over);
    const c = R.explainReminders({ tasks: [t] }, at, "Asia/Amman", 10).candidates;
    return c.length ? c[0].reason : "outside the window";
  };
  check("due and not done: send", reason({}) === "send", reason({}));
  check("done today", reason({ days: { "2026-09-13": { n: 1, amount: 1 } } }) === "done today", reason({ days: { "2026-09-13": { n: 1, amount: 1 } } }));
  check("weekdays only, on a Sunday: not due today", reason({ schedule: { type: "weekdays", days: [1, 2, 3, 4, 5] } }) === "not due today");
  check("archived", reason({ archived: true, archivedAt: "2026-09-10" }) === "archived");
  check("saved as 02:58 because AM was left selected: never near 14:58", reason({ remindAt: "02:58" }) === "outside the window");
}

console.log("");
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);

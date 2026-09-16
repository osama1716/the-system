// EXP for a priced task is decided on the server from what the app reports
// happened (functions/progress.js, used by recordProgress). This checks the
// server's ledger rules, that the app and server agree on the numbers they
// share, and that the engine reports what the server expects to be told.
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
const P = require(REPO + "functions/progress.js");

let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };

// ------------------------------------------------------------- quests -----
const TODAY = "2026-09-16";
const quest = { pt: 500, kind: "quest" };
let r = P.settleReport(quest, P.newLedger("quest", 0), { kind: "quest", completion: 60 }, TODAY);
check("quest at 60% pays 300", r.status === "ok" && r.delta === 300, JSON.stringify(r));
let L = r.ledger;
r = P.settleReport(quest, L, { kind: "quest", completion: 60 }, TODAY);
check("the same report twice pays nothing the second time", r.delta === 0);
r = P.settleReport(quest, L, { kind: "quest", completion: 100 }, TODAY);
check("finishing pays the rest, not the whole value again", r.delta === 200);
L = r.ledger;
r = P.settleReport(quest, L, { kind: "quest", completion: 0 }, TODAY);
check("reopening takes back exactly what was paid", r.delta === -500);
check("a finished quest from before the ledger is not paid twice",
  P.settleReport(quest, P.newLedger("quest", 500), { kind: "quest", completion: 100 }, TODAY).delta === 0);
check("a raised price after an appeal pays the difference",
  P.settleReport({ pt: 800, kind: "quest" }, { kind: "quest", exp: 500 }, { kind: "quest", completion: 100 }, TODAY).delta === 300);
check("a quest's price cannot be spent as a habit",
  P.settleReport(quest, P.newLedger("quest"), { kind: "habit", day: TODAY, done: true }, TODAY).reason === "kind");

// ------------------------------------------------------------- habits -----
const habit = { pt: 15, kind: "habit" };
L = P.newLedger("habit", 0);
r = P.settleReport(habit, L, { kind: "habit", day: TODAY, done: true }, TODAY);
check("a habit done today pays its value", r.delta === 15);
L = r.ledger;
check("the same day again pays nothing", P.settleReport(habit, L, { kind: "habit", day: TODAY, done: true }, TODAY).delta === 0);
r = P.settleReport(habit, L, { kind: "habit", day: "2026-09-13", done: true }, TODAY);
check("three days back is still allowed", r.status === "ok" && r.delta === 15);
L = r.ledger;
check("four days back is refused",
  P.settleReport(habit, L, { kind: "habit", day: "2026-09-12", done: true }, TODAY).reason === "too-old");
check("tomorrow is refused",
  P.settleReport(habit, L, { kind: "habit", day: "2026-09-17", done: true }, TODAY).reason === "future");
check("a date that does not exist is refused",
  P.settleReport(habit, L, { kind: "habit", day: "2026-02-30", done: true }, TODAY).reason === "day");
check("a habit's price cannot be spent as a quest",
  P.settleReport(habit, L, { kind: "quest", completion: 100 }, TODAY).reason === "kind");
r = P.settleReport(habit, L, { kind: "habit", day: "2026-09-13", done: false }, TODAY);
check("clearing a day gives back what it paid", r.delta === -15 && !r.ledger.days["2026-09-13"]);
check("clearing a day paid at an old price gives back the old price",
  P.settleReport({ pt: 40, kind: "habit" }, L, { kind: "habit", day: TODAY, done: false }, TODAY).delta === -15);
check("clearing a day that was never paid gives back nothing",
  P.settleReport(habit, P.newLedger("habit", 0), { kind: "habit", day: "2025-01-01", done: false }, TODAY).delta === 0);
L = P.newLedger("habit", 20);
r = P.settleReport(habit, L, { kind: "habit", day: "2025-01-01", done: false }, TODAY);
check("clearing a pre-ledger day comes out of the old journal's lump", r.delta === -15 && r.ledger.legacyExp === 5);
r = P.settleReport(habit, r.ledger, { kind: "habit", day: "2025-01-02", done: false }, TODAY);
check("never beyond the lump", r.delta === -5 && r.ledger.legacyExp === 0);
check("and nothing once it is spent",
  P.settleReport(habit, r.ledger, { kind: "habit", day: "2025-01-03", done: false }, TODAY).delta === 0);
r = P.settleReport(habit, { kind: "habit", days: { "2024-01-01": 15 }, legacyExp: 0 }, { kind: "habit", day: TODAY, done: true }, TODAY);
check("days older than the ledger keeps are dropped", !r.ledger.days["2024-01-01"] && r.ledger.days[TODAY] === 15);

// -------------------------------------------------------- report shape -----
check("a priceId with a slash is refused", P.cleanReport({ priceId: "a/b", kind: "quest", completion: 5 }) === null);
check("a habit report without done is refused", P.cleanReport({ priceId: "abc", kind: "habit", day: TODAY }) === null);
check("an unknown kind is refused", P.cleanReport({ priceId: "abc", kind: "bonus", completion: 5 }) === null);
check("completion is clamped to 100", P.cleanReport({ priceId: "abc", kind: "quest", completion: 150 }).completion === 100);

// --------------------------------------------------- time estimates -------
const est = (raw, pt, kind) => P.cleanEstimates(raw, pt, kind);
// Six hours earns 360 on the hourly scale, so 360/6h is self-consistent and
// passes through untouched. (A 500-point quest claiming six hours would not
// be, and the floor below is what catches that.)
check("a plain estimate comes back as given",
  JSON.stringify(est({ effortHours: 6, minDays: 0 }, 360, "quest")) === JSON.stringify({ effortHours: 6, minDays: 0 }));
check("fractions of an hour survive", est({ effortHours: 0.05, minDays: 0 }, 6, "habit").effortHours === 0.05);
check("nonsense becomes zero", est({ effortHours: "soon", minDays: null }, 10, "habit").effortHours === 0);
check("negatives become zero", est({ effortHours: -5, minDays: -3 }, 10, "habit").minDays === 0);
check("absurd numbers are capped",
  est({ effortHours: 1e9, minDays: 1e9 }, 500, "quest").effortHours === P.MAX_EFFORT_HOURS &&
  est({ effortHours: 1e9, minDays: 1e9 }, 500, "quest").minDays === P.MAX_MIN_DAYS);
check("a valuable quest cannot claim minutes", est({ effortHours: 0.3, minDays: 0 }, 2000, "quest").effortHours === 25);
// A commitment held for 21 days is priced by the days: 21 × 15 = 315. With no
// hands-on hours at all, the days are what justify it, so no floor applies.
check("…unless the days explain it", est({ effortHours: 0, minDays: 21 }, 315, "quest").effortHours === 0);
// The same task priced as it was under the old hand-set scale (700) no longer
// adds up, and the floor says so rather than letting it through.
check("days that do not explain the price still trip the floor",
  est({ effortHours: 0, minDays: 21 }, 700, "quest").effortHours === 8.75);
check("a habit repeat is never floored", est({ effortHours: 0, minDays: 0 }, 100, "habit").effortHours === 0);
check("days are whole", est({ effortHours: 1, minDays: 2.6 }, 100, "quest").minDays === 3);
// Found by the eval: "Climb Everest" entered as a weekly habit was estimated
// at 300 hours a repeat. A repeat happens within one day, both ways round.
check("a habit repeat cannot outlast a day",
  est({ effortHours: 300, minDays: 0 }, 100, "habit").effortHours === P.MAX_HABIT_REPEAT_HOURS);
check("a habit repeat never waits for tomorrow", est({ effortHours: 1, minDays: 30 }, 50, "habit").minDays === 0);

// ------------------------------------------- re-priced after an edit ------
// The hole this closes: a quest priced 1800, taken to 60% (1080 paid), then
// retitled into something worth 40. The new price owes the difference back,
// not a fresh payment.
const moved = P.transferLedger({ kind: "quest", exp: 1080 }, "quest");
check("a re-priced quest carries what it was already paid", moved.exp === 1080);
check("…so the new price settles the difference",
  P.settleReport({ pt: 40, kind: "quest" }, moved, { kind: "quest", completion: 60 }, TODAY).delta === -1056);
const movedHabit = P.transferLedger({ kind: "habit", days: { "2026-09-15": 15, "2026-09-16": 15 }, legacyExp: 10 }, "habit");
check("a re-priced habit carries its days as one lump", movedHabit.legacyExp === 40 && !Object.keys(movedHabit.days).length);
check("a report may name the price it replaces",
  P.cleanReport({ priceId: "new1", kind: "quest", completion: 50, replaces: "old1" }).replaces === "old1");
check("but never itself", P.cleanReport({ priceId: "same", kind: "quest", completion: 50, replaces: "same" }).replaces === null);
check("and never a malformed id", P.cleanReport({ priceId: "new1", kind: "quest", completion: 50, replaces: "../x" }).replaces === null);

// ------------------------------------------ a quest that asks (phase 5) --
// A quest worth 300 or more pays each half only once its answer is accepted
// (functions/reflection.js). The gate is passed in by recordProgress.
const gated = { pt: 1300, kind: "quest" };
const noAnswers = { reflections: {}, grandfathered: 0 };
let g = P.settleReport(gated, P.newLedger("quest", 0), { kind: "quest", completion: 60 }, TODAY, noAnswers);
check("a gated quest pays nothing before its first answer", g.delta === 0 && g.ledger.exp === 0);
check("…but remembers how far it got", g.ledger.completion === 60);
g = P.settleReport(gated, g.ledger, { kind: "quest", completion: 60 }, TODAY,
  { reflections: { 50: { status: "accepted" } }, grandfathered: 0 });
check("the first answer releases the first half", g.delta === 650);
g = P.settleReport(gated, g.ledger, { kind: "quest", completion: 100 }, TODAY,
  { reflections: { 50: { status: "accepted" }, 100: { status: "accepted" } }, grandfathered: 0 });
check("the second answer releases the rest", g.delta === 650 && g.ledger.exp === 1300);
check("progress counted before the gate existed stays counted",
  P.settleReport(gated, { kind: "quest", exp: 780, completion: 60 }, { kind: "quest", completion: 70 }, TODAY,
    { reflections: {}, grandfathered: 780 }).delta === 0);
check("…and is still taken back if the quest is reopened",
  P.settleReport(gated, { kind: "quest", exp: 780, completion: 60 }, { kind: "quest", completion: 0 }, TODAY,
    { reflections: {}, grandfathered: 780 }).delta === -780);
check("a quest without a gate pays as it always did",
  P.settleReport(gated, P.newLedger("quest", 0), { kind: "quest", completion: 60 }, TODAY).delta === 780);

// ------------------------------------------------------------- parity -----
check("app and server allow the same number of days back", SYS.HABIT_BACKFILL_DAYS === P.BACKFILL_DAYS,
  SYS.HABIT_BACKFILL_DAYS + " vs " + P.BACKFILL_DAYS);
let mismatch = null;
for (const pt of [1, 7, 15, 333, 500, 5000]) {
  for (const c of [0, 1, 33, 33.3, 50, 99.9, 100]) {
    const app = Math.floor(SYS.ptToExp(pt) * (c / 100));
    if (app !== P.questValue(pt, c)) mismatch = pt + " @ " + c;
  }
}
check("app and server value a quest's progress the same", !mismatch, mismatch);

// ------------------------------------------------ what the engine reports --
const state = SYS.defaultState();
const seen = [];
SYS.onExpDelta = (delta, source, meta) => seen.push({ delta, meta });

const bare = [];
SYS.onProgressReport = (meta) => bare.push(meta);

// Under the reflection threshold: progress earns EXP and the EXP carries the report.
SYS.addTask(state, { title: "Read a short book", priority: "Medium", types: [], pt: 240, notes: "",
  taskType: "Medium Term", mode: "simple", priceId: "P1", traitTargets: [] });
const q = state.tasks[state.tasks.length - 1];
SYS.applyTaskProgress(state, q.id, 40);
const qm = seen.length && seen[seen.length - 1].meta;
check("quest progress reports its completion, not its EXP",
  qm && qm.priceId === "P1" && qm.progress && qm.progress.kind === "quest" && qm.progress.completion === 40, JSON.stringify(qm));

// Over it: progress earns nothing until an answer is accepted, and must be
// reported anyway — otherwise the server never learns the question is due.
SYS.addTask(state, { title: "Read a long book", priority: "Medium", types: [], pt: 1300, notes: "",
  taskType: "Long Term", mode: "gradual", priceId: "P2", traitTargets: [] });
const gq = state.tasks[state.tasks.length - 1];
seen.length = 0;
SYS.applyTaskProgress(state, gq.id, 60);
check("a gated quest's progress earns nothing yet", !seen.length && gq.expBaseline === 0);
check("…but is still reported, so the server knows the question is due",
  bare.length === 1 && bare[0].priceId === "P2" && bare[0].progress.completion === 60, JSON.stringify(bare));
SYS.applyTaskProgress(state, gq.id, 60);
check("…and the same completion again reports nothing new", bare.length === 1);

SYS.addTask(state, { title: "Walk", priority: "Medium", types: [], pt: 15, notes: "", recurring: true,
  schedule: { type: "daily" }, unit: "times", targetAmount: 1, priceId: "H1", traitTargets: [] });
const h = state.tasks[state.tasks.length - 1];
const today = SYS.todayKey();

seen.length = 0;
SYS.logHabitDay(state, h.id, today);
let hm = seen.length && seen[0].meta;
check("a habit day reports the day and that it was done",
  hm && hm.priceId === "H1" && hm.progress.kind === "habit" && hm.progress.day === today && hm.progress.done === true, JSON.stringify(hm));

check("the app's line is where the server's is: three days back yes, four no",
  SYS.canLogHabitDay(SYS.shiftDay(today, -3)) && !SYS.canLogHabitDay(SYS.shiftDay(today, -4)));

seen.length = 0;
SYS.unlogHabitDay(state, h.id, today);
hm = seen.length && seen[0].meta;
check("clearing a day reports it as not done", hm && hm.progress.done === false && hm.progress.day === today, JSON.stringify(hm));
check("canLogHabitDay: today yes, tomorrow no",
  SYS.canLogHabitDay(today) && !SYS.canLogHabitDay(SYS.shiftDay(today, 1)));

console.log(fails ? "\n" + fails + " failed" : "\nall passed");
process.exit(fails ? 1 : 0);

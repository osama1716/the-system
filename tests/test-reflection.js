// The reflection question (functions/reflection.js): which quests ask, which
// half of the points each answer releases, and when a held answer is looked at
// again. The judging itself is an AI call and has its own eval
// (evals/reflection-run.js); this is the arithmetic around it.
const fs = require("fs"), path = require("path"), vm = require("vm");
const REPO = path.resolve(__dirname, "..").split(path.sep).join("/") + "/";
const R = require(REPO + "functions/reflection.js");
const P = require(REPO + "functions/progress.js");
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

const big = { kind: "quest", pt: 1300 };
const small = { kind: "quest", pt: 240 };
const habit = { kind: "habit", pt: 50 };
const ok = { status: "accepted" };
const held = { status: "held", attempts: 1, heldAt: 1 };
const no = { status: "rejected" };

// ------------------------------------------------------------ who asks ----
check("a quest worth 300 or more asks", R.isGated({ kind: "quest", pt: 300 }));
check("one worth less does not", !R.isGated({ kind: "quest", pt: 299 }));
check("a habit never does, however valuable", !R.isGated({ kind: "habit", pt: 500 }));
check("the questions sit at half and at the end", JSON.stringify(R.checkpointsFor(big)) === "[50,100]");

// ------------------------------------------------------- what is paid ----
check("a small quest pays as it always did", R.payableExp(small, 60, {}) === 144);
check("a big quest pays nothing before its first answer", R.payableExp(big, 40, {}) === 0);
check("…and holds all of it", R.heldExp(big, 40, {}) === 520);
check("the first answer releases the first half", R.payableExp(big, 50, { 50: ok }) === 650);
check("progress past half waits for the second answer", R.payableExp(big, 80, { 50: ok }) === 650);
check("…and shows what is waiting", R.heldExp(big, 80, { 50: ok }) === 390);
check("both answers release everything", R.payableExp(big, 100, { 50: ok, 100: ok }) === 1300);
check("a rejected first answer forfeits only the first half",
  R.payableExp(big, 100, { 50: no, 100: ok }) === 650);
check("a held answer releases nothing yet", R.payableExp(big, 60, { 50: held }) === 0);
check("the halves always add up to the whole",
  R.payableExp({ kind: "quest", pt: 333 }, 100, { 50: ok, 100: ok }) === 333);

// ------------------------------------------------------ what is asked ----
check("nothing is asked before half", R.dueCheckpoint(big, 49, {}) === null);
check("half asks the first question", R.dueCheckpoint(big, 50, {}) === 50);
check("an accepted first answer moves on to the end", R.dueCheckpoint(big, 100, { 50: ok }) === 100);
check("…but not before the end", R.dueCheckpoint(big, 90, { 50: ok }) === null);
check("a held answer can be rewritten", R.dueCheckpoint(big, 60, { 50: held }) === 50);
check("a rejected answer is not asked again", R.dueCheckpoint(big, 60, { 50: no }) === null);
check("…and does not block the second question", R.dueCheckpoint(big, 100, { 50: no }) === 100);
check("a small quest never asks", R.dueCheckpoint(small, 100, {}) === null);

// --------------------------------------------------------- the answers ----
check("an answer is tidied", R.cleanAnswer("  finished   chapter  five \n ") === "finished chapter five");
check("a word is not an answer", !R.answerLongEnough("done"));
check("a sentence is", R.answerLongEnough("finished chapter five"));
check("an answer is capped", R.cleanAnswer("x".repeat(2000)).length === R.MAX_ANSWER_CHARS);

// --------------------------------------------------------- judgments -----
const t0 = 1_000_000_000_000;
let rec = R.afterJudge(null, "hold", "Too general.", "it was good", t0, "ai");
check("a hold starts the admin clock", rec.status === "held" && rec.heldAt === t0 && rec.attempts === 1);
rec = R.afterJudge(rec, "hold", "Still general.", "it was really good", t0 + R.DAY_MS, "ai");
check("rewriting does not restart the clock", rec.heldAt === t0 && rec.attempts === 2);
check("two attempts leaves one more", R.canResubmit(rec));
rec = R.afterJudge(rec, "hold", "Still general.", "honestly it was good", t0 + 2 * R.DAY_MS, "ai");
check("three attempts is the last", !R.canResubmit(rec));
check("not due for a second look after four days", !R.dueForLenient(rec, t0 + 4 * R.DAY_MS));
check("due after five", R.dueForLenient(rec, t0 + 5 * R.DAY_MS));
const lenient = R.afterJudge(rec, "accept", "On topic.", null, t0 + 5 * R.DAY_MS, "ai-lenient");
check("the lenient look can accept, keeping the answer",
  lenient.status === "accepted" && lenient.answer === "honestly it was good" && lenient.decidedBy === "ai-lenient");
check("an admin's yes is final", R.afterAdmin(rec, true, t0).status === "accepted");
check("an admin's no is final", R.afterAdmin(rec, false, t0).status === "rejected");
check("an admin decision does not use up an attempt", R.afterJudge(rec, "accept", "", null, t0, "admin").attempts === 3);
check("a decided answer is never looked at again", !R.dueForLenient(R.afterAdmin(rec, true, t0), t0 + 30 * R.DAY_MS));

// --------------------------------------------- the app agrees with the server --
// The app grants locally what the server will pay (engine.js payableQuestExp),
// so a held half shows as held instead of appearing and then being taken back.
// Two copies of a rule stay honest only if something compares them.
check("the app and the server gate at the same value", SYS.REFLECTION_THRESHOLD_PT === R.THRESHOLD_PT);
check("…and ask at the same checkpoints", SYS.REFLECTION_CHECKPOINTS.join(",") === R.CHECKPOINTS.join(","));
let mismatch = null;
const statuses = [undefined, "held", "accepted", "rejected"];
for (const pt of [300, 333, 1300, 2000]) {
  for (const c of [0, 25, 49, 50, 51, 80, 99, 100]) {
    for (const s50 of statuses) for (const s100 of statuses) for (const grand of [0, 150, 780]) {
      const refl = {};
      if (s50) refl[50] = { status: s50 };
      if (s100) refl[100] = { status: s100 };
      const task = { recurring: false, priceId: "X", pt, completion: c, reflections: refl, grandfatheredExp: grand, gateSeen: 1 };
      const app = SYS.payableQuestExp(task, c);
      const server = P.settleReport({ pt, kind: "quest" }, P.newLedger("quest", 0), { kind: "quest", completion: c }, "2026-09-16",
        { reflections: refl, grandfathered: grand }).ledger.exp;
      if (app !== server && !mismatch) mismatch = JSON.stringify({ pt, c, s50, s100, grand, app, server });
    }
  }
}
check("the app pays exactly what the server pays, in every state", !mismatch, mismatch);
check("a task without a price is never gated in the app", !SYS.isGatedTask({ recurring: false, pt: 2000 }));
check("the app's due question matches the server's",
  SYS.dueReflection({ recurring: false, priceId: "X", pt: 1300, completion: 60, reflections: { 50: { status: "held", attemptsLeft: 2 } } }) === 50 &&
  SYS.dueReflection({ recurring: false, priceId: "X", pt: 1300, completion: 60, reflections: { 50: { status: "held", attemptsLeft: 0 } } }) === null);

console.log(fails ? "\n" + fails + " failed" : "\nall passed");
process.exit(fails ? 1 : 0);

// Every top-level key the app can save has to be on the rules' list.
//
// `isValidSave` in firestore.rules is a hasOnly: a key missing from it does
// not fail one field, it refuses the whole save, every time, and the app goes
// on working locally as if nothing were wrong. The assessment shipped that
// way — `state.assessment` was not on the list, so finishing the test stopped
// every cloud save for that account.
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

const rules = fs.readFileSync(path.join(REPO, "firestore.rules"), "utf8");
const m = rules.match(/data\.state\.keys\(\)\.hasOnly\(\[([^\]]*)\]/);
check("the rules' list of state keys was found", !!m);
const allowed = new Set(m ? m[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1)) : []);
const missing = (s) => Object.keys(s).filter((k) => !allowed.has(k));

console.log("");
const fresh = SYS.defaultState();
check("a new account's keys are all allowed", missing(fresh).length === 0, missing(fresh).join(", "));

const answered = SYS.defaultState();
const answers = {};
SYS.ASSESSMENT.forEach((q, i) => { answers[q.id] = i % 2 ? 5 : SYS.ASSESSMENT_NA; });
SYS.applyAssessment(answered, answers);
check("after the assessment, still all allowed", missing(answered).length === 0, missing(answered).join(", "));

console.log("");
console.log("skipping it (admin only)");
const held = SYS.defaultState();
const before = JSON.stringify(held.intelligences);
check("skipping closes it", SYS.skipAssessment(held) === true && !!held.assessment && held.assessment.skipped === true);
check("and grants nothing", JSON.stringify(held.intelligences) === before && Object.keys(held.assessment.granted).length === 0);
check("its keys are allowed too", missing(held).length === 0, missing(held).join(", "));
check("a second skip does nothing", SYS.skipAssessment(held) === false);
check("nor can the test then be taken", SYS.applyAssessment(held, answers) === false);

console.log("");
console.log(fails ? fails + " FAIL" : "all passed");
process.exit(fails ? 1 : 0);

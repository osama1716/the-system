// The assessment's arithmetic.
//
// It grants points, and a self-report cannot be checked — so the strictness
// has to be in the shape of the sum, not in policing. It is a budget: the
// answers decide where the points go, never how many there are.
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
const Q = SYS.ASSESSMENT;
const all = (v) => { const a = {}; Q.forEach((q) => { a[q.id] = v; }); return a; };
const sum = (g) => Object.keys(g).reduce((s, k) => s + g[k], 0);
const byCat = (g) => { const o = {}; Q.forEach((q) => { if (g[q.id]) o[q.key] = (o[q.key] || 0) + g[q.id]; }); return o; };
const blank = () => {
  const s = SYS.defaultState();
  Object.keys(s.intelligences).forEach((k) => { s.intelligences[k].traits.forEach((t) => { t.level = 0; }); s.intelligences[k].traitRemainder = {}; });
  delete s.assessment;
  return s;
};

console.log("");
console.log("the questions themselves");
{
  check("forty of them", Q.length === 40, String(Q.length));
  const seed = SYS.seedIntelligences();
  const missing = Q.filter((q) => !(seed[q.key] || { traits: [] }).traits.some((t) => t.name === q.trait));
  check("every one names a trait that exists", missing.length === 0, missing.map((m) => m.id).join(","));
  const pairs = new Set(Q.map((q) => q.key + "/" + q.trait));
  check("no trait is asked about twice", pairs.size === Q.length, String(pairs.size));
  // Five in a row about one category drags each answer toward the one before.
  let run = 0, worst = 0;
  Q.forEach((q, i) => { run = (i > 0 && Q[i - 1].key === q.key) ? run + 1 : 1; worst = Math.max(worst, run); });
  check("and they are mixed, not grouped", worst === 1, "run of " + worst);
}

console.log("");
console.log("the budget holds however it is answered");
{
  const maxed = SYS.scoreAssessment(all(5));
  check("agreeing strongly with everything does not exceed the budget",
    sum(maxed) <= SYS.ASSESSMENT_BUDGET + 1e-9, String(sum(maxed)));
  const agreed = SYS.scoreAssessment(all(4));
  check("and agreeing mildly with everything comes to the same total",
    Math.abs(sum(agreed) - sum(maxed)) < 1e-9, sum(agreed) + " vs " + sum(maxed));
  check("inflating every answer only spreads it thinner",
    Object.values(byCat(maxed)).every((v) => Math.abs(v - SYS.ASSESSMENT_BUDGET / 8) < 1e-9),
    JSON.stringify(byCat(maxed)));
}

console.log("");
console.log("only agreement earns");
{
  check("neither-nor earns nothing", sum(SYS.scoreAssessment(all(3))) === 0);
  check("disagreeing earns nothing", sum(SYS.scoreAssessment(all(1))) === 0);
  check("and disagreeing strongly is worth no less than disagreeing",
    sum(SYS.scoreAssessment(all(1))) === sum(SYS.scoreAssessment(all(2))));
  check("never having tried earns nothing", sum(SYS.scoreAssessment(all(SYS.ASSESSMENT_NA))) === 0);
}

console.log("");
console.log("no category can be claimed past the cap");
{
  // Everything maxed in one category, nothing anywhere else.
  const a = all(3);
  Q.filter((q) => q.key === "linguistic").forEach((q) => { a[q.id] = 5; });
  const g = SYS.scoreAssessment(a);
  const cats = byCat(g);
  check("one claimed category stops at the cap",
    Math.abs(cats.linguistic - SYS.ASSESSMENT_CATEGORY_CAP) < 1e-9, String(cats.linguistic));
  check("and the surplus is not handed to the others",
    sum(g) <= SYS.ASSESSMENT_CATEGORY_CAP + 1e-9, String(sum(g)));
  check("which is far less than the budget", sum(g) < SYS.ASSESSMENT_BUDGET, sum(g) + " of " + SYS.ASSESSMENT_BUDGET);
}

console.log("");
console.log("what it does to a state");
{
  const s = blank();
  const a = all(3);
  a[Q.find((q) => q.trait === "Reading").id] = 5;
  a[Q.find((q) => q.trait === "Drawing").id] = 4;
  const expBefore = SYS.totalExp(s.player);
  check("it applies once", SYS.applyAssessment(s, a) === true);
  check("and never twice", SYS.applyAssessment(s, a) === false);
  check("no EXP, no level, no rank", SYS.totalExp(s.player) === expBefore, String(SYS.totalExp(s.player)));
  const reading = s.intelligences.linguistic.traits.find((t) => t.name === "Reading");
  const drawing = s.intelligences.visual.traits.find((t) => t.name === "Drawing");
  check("the named traits took the points", reading.level > 0 && drawing.level > 0, reading.level + " / " + drawing.level);
  check("the stronger answer took more", reading.level >= drawing.level, reading.level + " vs " + drawing.level);
  check("nothing else moved",
    SYS.categoryScore(s.intelligences.self) === 0 && SYS.categoryScore(s.intelligences.musical) === 0);
  check("and the record of it is keyed by category",
    Object.keys(s.assessment.granted).every((k) => !!s.intelligences[k]) && Object.keys(s.assessment.granted).length > 0,
    JSON.stringify(s.assessment.granted));
  check("the cap on a category still cannot be bought",
    SYS.categoryScore(s.intelligences.linguistic) < (SYS.CATEGORY_EMBLEM_AT || 100),
    String(SYS.categoryScore(s.intelligences.linguistic)));
}

console.log("");
console.log("the ground never walked on is kept");
{
  const s = blank();
  const a = all(3);
  const mu = Q.find((q) => q.trait === "Playing an instrument");
  a[mu.id] = SYS.ASSESSMENT_NA;
  SYS.applyAssessment(s, a);
  check("a 'never tried' is recorded with its trait",
    s.assessment.neverTried.some((x) => x.key === "musical" && x.trait === "Playing an instrument"),
    JSON.stringify(s.assessment.neverTried));
  check("and a disagreement is not", !s.assessment.neverTried.some((x) => x.trait === "Reading"));
}

console.log("");
console.log("the grant is a starting position, not ninety days of growth");
{
  const s = blank();
  const a = all(3);
  a[Q.find((q) => q.trait === "Reading").id] = 5;
  SYS.applyAssessment(s, a);
  const recent = SYS.recentScores(s, 90);
  check("a snapshot was taken at once", (s.player.scoreLog || []).length === 1, String((s.player.scoreLog || []).length));
  check("so the radar's recent outline does not claim it", recent.linguistic === 0, String(recent.linguistic));
}

console.log("");
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);

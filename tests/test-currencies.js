// EXP and skill points are two currencies, and they had been welded together.
//
// EXP raises the level and the rank: how much you have done. Skill points
// raise traits and draw the radar: what you have built. Every EXP used to
// manufacture points, so the evaluator could class a task as developing no
// intelligence and the engine would turn it into growth anyway — a 40 EXP
// bill buying part of a point in Reading.
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
const fresh = () => {
  const s = SYS.defaultState();
  // Start from nothing earned, so every number below is this test's doing.
  Object.keys(s.intelligences).forEach((k) => {
    s.intelligences[k].traits.forEach((t) => { t.level = 0; });
    s.intelligences[k].remainder = 0;
    s.intelligences[k].traitRemainder = {};
  });
  s.player.composition = {};
  s.player.traitComposition = {};
  return s;
};
const totalPoints = (s) => Object.keys(s.intelligences)
  .reduce((sum, k) => sum + SYS.categoryScore(s.intelligences[k]), 0);

console.log("");
console.log("work that builds nothing");
{
  // A chore: the evaluator returns an empty category list, so it lands under
  // "general" and names no trait.
  const s = fresh();
  SYS.applyExpDelta(s, 1000, [], "pay the bills");
  check("it still moves the ladder", SYS.totalExp(s.player) === 1000, String(SYS.totalExp(s.player)));
  check("and it raised the level", s.player.level > 1, "level " + s.player.level);
  check("but no trait grew from it", totalPoints(s) === 0, String(totalPoints(s)));
}

console.log("");
console.log("work that builds something");
{
  const s = fresh();
  SYS.applyExpDelta(s, 1000, ["linguistic"], "read a book",
    [{ category: "linguistic", trait: "Reading" }]);
  const reading = s.intelligences.linguistic.traits.find((t) => t.name === "Reading");
  check("the trait it named is the one that grew", reading.level > 0, String(reading.level));
  check("and nothing else did", totalPoints(s) === reading.level, totalPoints(s) + " vs " + reading.level);
}

console.log("");
console.log("half of each");
{
  // Same EXP in both runs; in the second, half of it builds nothing.
  const pure = fresh(), mixed = fresh();
  SYS.applyExpDelta(pure, 1000, ["linguistic"], "reading", [{ category: "linguistic", trait: "Reading" }]);
  SYS.applyExpDelta(mixed, 500, ["linguistic"], "reading", [{ category: "linguistic", trait: "Reading" }]);
  SYS.applyExpDelta(mixed, 500, [], "errands");
  check("the ladder does not notice the difference",
    SYS.totalExp(pure.player) === SYS.totalExp(mixed.player),
    SYS.totalExp(pure.player) + " vs " + SYS.totalExp(mixed.player));
  check("the radar does: about half the growth",
    totalPoints(mixed) > 0 && totalPoints(mixed) < totalPoints(pure),
    totalPoints(mixed) + " of " + totalPoints(pure));
  check("and the chore did not reach a trait of its own",
    SYS.categoryScore(mixed.intelligences.linguistic) === totalPoints(mixed),
    "something outside Linguistic grew");
}

console.log("");
console.log("no information at all is not the same as building nothing");
{
  // An admin correction names no category because nobody classified it, not
  // because it was judged to build nothing. It is not docked for that.
  const s = fresh();
  s.player.composition = {};
  SYS.applyExpDelta(s, 1000, [], "Corrected");
  const byGeneral = totalPoints(s);
  const t = fresh();
  t.player.composition = {};
  // Drain the pool the way a run of levels would, then award with nothing left.
  SYS.applyExpDelta(t, 1000, ["self"], "something", [{ category: "self", trait: "Time management" }]);
  check("a chore grants nothing", byGeneral === 0, String(byGeneral));
  check("named work still grants", totalPoints(t) > 0, String(totalPoints(t)));
}

console.log("");
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);

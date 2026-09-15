// Awarded traits as { type, traitId } instead of [type, traitId] pairs.
// The pairs were arrays inside arrays, which Firestore refuses, so every save
// after a level-up failed. The ledger has to stay exact across the change:
// undo on an old pair-shaped record must give back exactly what undo on the
// new shape does, and a device holding old records must convert cleanly.
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
// These compare two record shapes over histories of hundreds of levels, so the
// history is left uncapped here; the cap has its own test, test-history-cap.
SYS.LEVEL_HISTORY_KEEP = 1e9;
let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };
const clone = (v) => JSON.parse(JSON.stringify(v));
const nestedPaths = (v) => {
  const out = [];
  const walk = (x, p, inArray) => {
    if (Array.isArray(x)) { if (inArray) out.push(p); x.forEach((y, i) => walk(y, p + "[" + i + "]", true)); return; }
    if (x && typeof x === "object") Object.keys(x).forEach((k) => walk(x[k], p + "." + k, false));
  };
  walk(v, "state", false);
  return out;
};
const traitLevels = (s) => JSON.stringify(Object.keys(s.intelligences).sort().map((k) =>
  [k, s.intelligences[k].traits.map((t) => t.id + ":" + t.level).join(",")]));
const standing = (s) => JSON.stringify({ rank: s.player.rank, level: s.player.level, exp: s.player.exp, banked: s.player.bankedPoints });

const cats = Object.keys(SYS.defaultState().intelligences);

// Gains across several categories, one named trait, and a rank-up.
function grow(s) {
  const firstTrait = s.intelligences[cats[0]].traits[0];
  SYS.applyExpDelta(s, 900, [cats[0]], "targeted", [{ category: cats[0], trait: firstTrait.name }]);
  SYS.applyExpDelta(s, 1600, cats.slice(1, 4), "multi");
  SYS.applyExpDelta(s, 4000, [cats[4]], "rank up");
  return s;
}

// 1. New records are objects, and the state is savable.
const fresh = grow(SYS.defaultState());
check("level history was written", fresh.levelHistory.length > 50, "records " + fresh.levelHistory.length);
check("every award is { type, traitId }", fresh.levelHistory.every((r) => r.awardedTraits.every((a) => !Array.isArray(a) && typeof a.type === "string" && a.traitId != null)));
check("no nested arrays anywhere in the state", nestedPaths(fresh).length === 0, nestedPaths(fresh).slice(0, 3).join(" | "));

// 2. The same history in the old pair shape.
const legacy = clone(fresh);
legacy.levelHistory.forEach((r) => { r.awardedTraits = r.awardedTraits.map((a) => [a.type, a.traitId]); });
check("legacy copy really has pairs", nestedPaths(legacy).length > 0);

// 3. Undo on legacy pairs gives back exactly what undo on objects does.
const undoAll = (s) => { SYS.applyExpDelta(s, -SYS.totalExp(s.player), cats.slice(0, 5), "undo everything"); return s; };
const a = undoAll(clone(fresh)), b = undoAll(clone(legacy));
check("undo: trait levels identical (objects vs pairs)", traitLevels(a) === traitLevels(b));

// 3b. The log says the movement once, not once per level. A G-Rank level
// costs 15 EXP, so 900 EXP crosses sixty of them — sixty identical rows is
// not a record anybody reads.
const spanned = SYS.defaultState();
const levelBeforeSpan = spanned.player.level;
SYS.applyExpDelta(spanned, 900, [cats[0]], "one big quest");
const levelLines = spanned.log.filter((e) => /^Level \d+ → \d+/.test(e.text));
check("a delta crossing many levels writes one level line", levelLines.length === 1,
  levelLines.length + ": " + levelLines.slice(0, 3).map((e) => e.text.slice(0, 40)).join(" | "));
check("…and it names where the movement started and ended",
  !!levelLines[0] && levelLines[0].text.indexOf("Level " + levelBeforeSpan + " → " + spanned.player.level) === 0,
  levelLines[0] && levelLines[0].text.slice(0, 60));
SYS.applyExpDelta(spanned, -900, [cats[0]], "undo it");
const revertedLines = spanned.log.filter((e) => /\(reverted\)/.test(e.text));
check("undoing it writes one reverted line", revertedLines.length === 1,
  revertedLines.length + ": " + revertedLines.slice(0, 3).map((e) => e.text.slice(0, 40)).join(" | "));
check("undo: standing identical (objects vs pairs)", standing(a) === standing(b), standing(a) + " vs " + standing(b));
const base = SYS.defaultState();
check("undo everything returns traits to where they started", traitLevels(a) === traitLevels(base));

// 4. Partial undo, too — the path a single unticked habit takes.
const pa = clone(fresh), pb = clone(legacy);
SYS.applyExpDelta(pa, -2500, cats.slice(1, 5), "partial");
SYS.applyExpDelta(pb, -2500, cats.slice(1, 5), "partial");
check("partial undo identical (objects vs pairs)", traitLevels(pa) === traitLevels(pb) && standing(pa) === standing(pb));

// 5. Migration converts in place, is idempotent, and changes nothing else.
const m = clone(legacy);
check("migration reports a change", SYS.migrateAwardedTraits(m.levelHistory) === true);
check("migration output equals the object-shaped history", JSON.stringify(m.levelHistory) === JSON.stringify(fresh.levelHistory));
check("second migration is a no-op", SYS.migrateAwardedTraits(m.levelHistory) === false);
check("migrated state is savable", nestedPaths(m).length === 0);
check("migration of an empty or missing history is a no-op", SYS.migrateAwardedTraits([]) === false && SYS.migrateAwardedTraits(undefined) === false);

// 6. A mixed history (old pairs, then new objects after the update) undoes cleanly.
const mixed = clone(legacy);
SYS.applyExpDelta(mixed, 600, [cats[5]], "after update");
check("mixed history holds both shapes", mixed.levelHistory.some((r) => r.awardedTraits.some(Array.isArray)) &&
  mixed.levelHistory.some((r) => r.awardedTraits.some((x) => !Array.isArray(x))));
undoAll(mixed);
SYS.applyExpDelta(mixed, -SYS.totalExp(mixed.player), [cats[5]], "rest");
check("mixed history undoes back to the start", traitLevels(mixed) === traitLevels(base), standing(mixed));

console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);

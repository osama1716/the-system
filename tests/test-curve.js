// What a level costs, and what happens to a standing when that changes.
//
// The level cost lives twice — js/constants.js for the app, functions/index.js
// for the leaderboard — and in session 7 the two disagreed: the server
// measured a player in different units, so the app "corrected" its own
// standing on every single load and asked which copy to keep, for ever. The
// first test here reads both files as text and compares them, because that is
// the only check that would have caught it.
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

// ------------------------------------------------- the two copies agree ----
const serverSrc = fs.readFileSync(path.join(REPO, "functions", "index.js"), "utf8");
const serverArr = (serverSrc.match(/const RANK_LEVEL_EXP = \[([^\]]+)\]/) || [])[1];
const serverLevels = (serverSrc.match(/const LEVELS_PER_RANK = (\d+)/) || [])[1];
check("the server's level costs match the app's",
  serverArr && serverArr.split(",").map((s) => Number(s.trim())).join(",") === SYS.RANK_LEVEL_EXP.join(","),
  "server [" + serverArr + "] vs app [" + SYS.RANK_LEVEL_EXP.join(", ") + "]");
check("and so does the number of levels in a rank",
  Number(serverLevels) === SYS.LEVELS_PER_RANK, serverLevels + " vs " + SYS.LEVELS_PER_RANK);

// ------------------------------------------------------ the curve itself ---
check("a level never gets cheaper as the ranks go up",
  SYS.RANK_LEVEL_EXP.every((v, i) => i === 0 || v > SYS.RANK_LEVEL_EXP[i - 1]), SYS.RANK_LEVEL_EXP.join(", "));
check("there is one cost per rank", SYS.RANK_LEVEL_EXP.length === SYS.RANKS.length);
check("the current curve is the one the table names",
  SYS.RANK_LEVEL_EXP.join(",") === SYS.RANK_LEVEL_EXP_BY_CURVE[SYS.LEVEL_CURVE].join(","));

// A 1300-point quest — a 900-page textbook — was eighty-six levels when a
// level cost 15. This is the number the change was made for.
const levelsFor = (exp) => {
  const from = SYS.expToStanding(0), to = SYS.expToStanding(exp);
  return (SYS.RANKS.indexOf(to.rank) - SYS.RANKS.indexOf(from.rank)) * SYS.LEVELS_PER_RANK + (to.level - from.level);
};
check("a 1300-point quest is about a dozen levels, not eighty-six",
  levelsFor(1300) >= 10 && levelsFor(1300) <= 16, String(levelsFor(1300)));
check("a 20-point habit repeat is a fraction of a level", levelsFor(20) === 0);
check("crossing G-Rank takes real work", SYS.RANK_LEVEL_EXP[0] * SYS.LEVELS_PER_RANK === 10000);

// -------------------------------------------------- standing round-trips ---
let drift = null;
for (const total of [0, 1, 55, 99, 100, 1300, 9999, 10000, 10001, 23000, 77000, 224000, 1e6]) {
  const s = SYS.expToStanding(total);
  const back = SYS.totalExp(s);
  if (back !== total && total < 224000) drift = total + " -> " + JSON.stringify(s) + " -> " + back;
}
check("EXP converts to a standing and back to the same EXP", !drift, drift);

// ------------------------------------------------------------ migration ----
// A document written under the old costs: E-Rank Lv 10 with 20 exp was
// 1500 + 3000 + 9*50 + 20 = 4970 EXP. The same EXP now reads as G-Rank Lv 50,
// 70 exp — the person has not lost anything, the numbers just mean more.
const old = {
  player: { name: "Hunter", rank: "E", level: 10, exp: 20, questsCompleted: 3, bankedPoints: 0, composition: {}, traitComposition: {} },
  levelHistory: [{ levelBefore: 8, rankIdxBefore: 2, awardedTraits: [], banked: 0, compositionSnapshot: {}, traitCompositionSnapshot: {}, remainderSnapshot: {} }],
  intelligences: {}, tasks: [], log: [], dailyStats: {}, intTypes: [],
};
const oldTotal = 1500 + 3000 + 9 * 50 + 20;
const migrated = JSON.parse(JSON.stringify(old));
check("a document from the old costs is migrated", SYS.migrateLevelCurve(migrated) === true);
check("…and not a second time", SYS.migrateLevelCurve(migrated) === false);
check("the EXP behind the standing is unchanged", SYS.totalExp(migrated.player) === oldTotal,
  SYS.totalExp(migrated.player) + " vs " + oldTotal);
// 4970 EXP is 49 whole levels at 100 each, with 70 left over.
check("the standing itself is re-derived",
  migrated.player.rank === "G" && migrated.player.level === 50 && migrated.player.exp === 70,
  JSON.stringify({ rank: migrated.player.rank, level: migrated.player.level, exp: migrated.player.exp }));
check("everything else on the player is left alone",
  migrated.player.name === "Hunter" && migrated.player.questsCompleted === 3);
check("the level history is retired rather than misread",
  migrated.levelHistory.length === 0 && migrated.player.trimmedLevels === 1);

// The flat-hundred era, which used to be migrated by schema number instead.
// Same document, read as curve 1: (2*100 + 9)*100 + 20 = 20920 EXP.
const ancient = JSON.parse(JSON.stringify(old));
ancient.player.curve = 1;
check("a standing from the flat-hundred era migrates too", SYS.migrateLevelCurve(ancient) === true);
check("…carrying the EXP that rule gave it", SYS.totalExp(ancient.player) === 20920,
  String(SYS.totalExp(ancient.player)));
check("…and landing where the new curve puts it",
  ancient.player.rank === "F" && ancient.player.level === 85,
  ancient.player.rank + " lv" + ancient.player.level);

// The wiring this file cannot see, written down because it is where the bug
// actually was: normalizeState merges the default player over a saved one, and
// the default carries the current curve. It must read the saved curve BEFORE
// that merge, or every old document looks up to date and is never converted.
// Verified end to end in the browser; see SESSION-HANDOFF.md.

// A fresh account is stamped, so it is never migrated at all.
const fresh = SYS.defaultState();
check("a new account carries the current curve", fresh.player.curve === SYS.LEVEL_CURVE);
check("…and is left untouched", SYS.migrateLevelCurve(fresh) === false);
check("a new account still starts with the 55 EXP it always did", SYS.totalExp(fresh.player) === 55,
  String(SYS.totalExp(fresh.player)));

// --------------------------------------------------- growth is unchanged ---
// Trait points are measured per 100 EXP, so dearer levels award more of them
// and the rate a person actually grows at does not move.
for (const rank of SYS.RANKS) {
  const i = SYS.rankIndex(rank);
  const perLevel = SYS.pointsForLevel(rank);
  const expected = SYS.RANK_LEVEL_EXP[i] * SYS.RANK_POINTS_PER_100_EXP[i] / 100;
  if (Math.abs(perLevel - expected) > 1e-9) drift = rank;
}
check("points per level still follow the rank's rate per 100 EXP", !drift, drift);
const pointsFor = (exp, rank) => exp / 100 * SYS.RANK_POINTS_PER_100_EXP[SYS.rankIndex(rank)];
check("1000 EXP at G-Rank is worth the same growth as before", pointsFor(1000, "G") === 10);

console.log(fails ? "\n" + fails + " failed" : "\nall passed");
process.exit(fails ? 1 : 0);

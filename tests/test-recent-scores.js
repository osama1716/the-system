// The radar's second outline: what the last ninety days built.
//
// Nothing decays and nothing should. But a total that only ever rises is a
// record of who someone was, not a picture of who they are — so the window is
// a difference between two snapshots, never a number that falls.
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
const back = (n) => SYS.shiftDay(today, -n);

const blank = () => {
  const s = SYS.defaultState();
  Object.keys(s.intelligences).forEach((k) => {
    s.intelligences[k].traits.forEach((t) => { t.level = 0; });
  });
  s.player.scoreLog = [];
  return s;
};

console.log("");
console.log("tiers");
{
  check("nothing earned has no tier", SYS.traitTier(0) === null, String(SYS.traitTier(0)));
  check("the first point is a novice", SYS.traitTier(1) === "novice");
  check("the boundaries are the boundaries",
    SYS.traitTier(9) === "novice" && SYS.traitTier(10) === "practised" &&
    SYS.traitTier(24) === "practised" && SYS.traitTier(25) === "skilled" &&
    SYS.traitTier(49) === "skilled" && SYS.traitTier(50) === "advanced" &&
    SYS.traitTier(99) === "advanced" && SYS.traitTier(100) === "master");
  check("and it does not run out", SYS.traitTier(100000) === "master");
}

console.log("");
console.log("an account younger than the window");
{
  // With no record older than the window, the earliest one there is becomes
  // the floor: this is growth since we began watching, not everything ever.
  // What that protects is the assessment - a starting position recorded the
  // moment it lands, which must not be presented as ninety days of work.
  const s = blank();
  s.intelligences.linguistic.traits[0].level = 12;
  SYS.recordScores(s);
  check("what was there when we started watching is not growth", SYS.recentScores(s, 90).linguistic === 0, String(SYS.recentScores(s, 90).linguistic));
  // A day's snapshot is rewritten as the day goes on, so the floor the
  // assessment sets is kept apart from the log - otherwise the first quest
  // finished on day one would swallow the starting picture.
  const f = blank();
  f.player.scoreFloor = { linguistic: 12 };
  f.intelligences.linguistic.traits[0].level = 20;
  SYS.recordScores(f);
  check("and what came after the starting picture is growth", SYS.recentScores(f, 90).linguistic === 8, String(SYS.recentScores(f, 90).linguistic));
  const t = blank();
  t.intelligences.self.traits[0].level = 5;
  check("with no record at all, everything counts", SYS.recentScores(t, 90).self === 5, String(SYS.recentScores(t, 90).self));
}

console.log("");
console.log("growth inside and outside the window");
{
  const s = blank();
  // Where things stood four months ago, and again three days ago.
  s.player.scoreLog = [
    { d: back(120), s: { linguistic: 10, self: 40 } },
    { d: back(3), s: { linguistic: 10, self: 70 } },
  ];
  s.intelligences.linguistic.traits[0].level = 10;   // untouched since
  s.intelligences.self.traits[0].level = 90;         // still climbing
  const r = SYS.recentScores(s, 90);
  check("a trait untouched inside the window shows nothing", r.linguistic === 0, String(r.linguistic));
  check("one that grew shows what it grew", r.self === 90 - 40, String(r.self));
  check("and a category with no history is all recent", r.musical === 0, String(r.musical));
}

console.log("");
console.log("the outline can never be bigger than the total");
{
  const s = blank();
  s.player.scoreLog = [{ d: back(100), s: { bodily: 50 } }];
  s.intelligences.bodily.traits[0].level = 20;  // less than the snapshot: undone work
  const r = SYS.recentScores(s, 90);
  check("undone work does not become negative growth", r.bodily === 0, String(r.bodily));
}

console.log("");
console.log("the log itself");
{
  const s = blank();
  s.intelligences.self.traits[0].level = 3;
  SYS.recordScores(s);
  SYS.recordScores(s);
  check("one entry per day, not one per event", s.player.scoreLog.length === 1, String(s.player.scoreLog.length));
  s.intelligences.self.traits[0].level = 8;
  SYS.recordScores(s);
  check("and the day's entry is the latest figure", s.player.scoreLog[0].s.self === 8, String(s.player.scoreLog[0].s.self));

  const t = blank();
  for (let i = 400; i > 0; i--) t.player.scoreLog.push({ d: back(i), s: { self: 1 } });
  SYS.recordScores(t);
  check("the log is pruned to its window", t.player.scoreLog.length === SYS.SCORE_LOG_DAYS, String(t.player.scoreLog.length));
  check("and it is the newest days that survive", t.player.scoreLog[t.player.scoreLog.length - 1].d === today);
}

console.log("");
console.log("EXP writes a snapshot on its own");
{
  const s = blank();
  SYS.applyExpDelta(s, 600, ["visual"], "drawing", [{ category: "visual", trait: "Drawing" }]);
  check("awarding points recorded the day", (s.player.scoreLog || []).length === 1, String((s.player.scoreLog || []).length));
  check("with the settled figure", s.player.scoreLog[0].s.visual === SYS.categoryScore(s.intelligences.visual),
    s.player.scoreLog[0].s.visual + " vs " + SYS.categoryScore(s.intelligences.visual));
}

console.log("");
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);

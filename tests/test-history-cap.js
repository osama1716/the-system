// Only the newest LEVEL_HISTORY_KEEP level records are kept, so the state
// document stays under Firestore's 1 MiB limit at the top of the ladder.
//
// What has to hold: inside the kept window undo is exactly what it was with
// the whole history; past it a level is still taken back at the right price
// and the standing lands where the whole history would have put it; an
// account that was never trimmed behaves exactly as before; and trimming on
// load is idempotent.
const fs = require("fs"), path = require("path"), vm = require("vm");
const REPO = path.resolve(__dirname, "..").split(path.sep).join("/") + "/";
const SYS = {};
const sb = { SYS, window: {}, console, Math, JSON, Object, Array, Number, String, Boolean, RegExp, Date, Set, Map, Intl,
  crypto: { randomUUID: () => "fixed-id" } };
vm.createContext(sb);
for (const f of ["constants.js", "engine.js"]) {
  vm.runInContext(fs.readFileSync(path.join(REPO, "js", f), "utf8")
    .replace(/\}\)\(window\.SYS[^)]*\);?\s*$/, "})(SYS);"), sb, { filename: f });
}
let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };

const KEEP = SYS.LEVEL_HISTORY_KEEP;
const clone = (v) => JSON.parse(JSON.stringify(v));
const kb = (v) => Math.round(Buffer.byteLength(JSON.stringify(v)) / 1024);
const standing = (s) => s.player.rank + "-" + s.player.level + " +" + s.player.exp;
function stable(v) {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}
// Everything the ledger decides, apart from the history itself and the
// trimmed-level count that only the capped copy carries.
const ledger = (s) => stable({
  rank: s.player.rank, level: s.player.level, exp: s.player.exp, banked: s.player.bankedPoints,
  composition: s.player.composition, traitComposition: s.player.traitComposition,
  intelligences: Object.fromEntries(Object.keys(s.intelligences).map((k) => [k, {
    remainder: s.intelligences[k].remainder === undefined ? null : s.intelligences[k].remainder,
    traitRemainder: s.intelligences[k].traitRemainder || {},
    traits: s.intelligences[k].traits.map((t) => [t.id, t.level]),
  }])),
});

// Runs `fn` against a copy with the history uncapped, which is exactly the
// engine as it was before the cap.
function uncapped(fn) {
  SYS.LEVEL_HISTORY_KEEP = 1e9;
  try { return fn(); } finally { SYS.LEVEL_HISTORY_KEEP = KEEP; }
}

// The same climb for both copies: many small gains, some naming a trait.
function climb(capped, full, steps, seed) {
  const cats = Object.keys(capped.intelligences);
  let x = seed;
  const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  for (let i = 0; i < steps; i++) {
    const c = cats[Math.floor(rnd() * cats.length)];
    const traits = capped.intelligences[c].traits;
    const t = rnd() < 0.6 ? [{ category: c, trait: traits[Math.floor(rnd() * traits.length)].name }] : undefined;
    const d = 20 + Math.floor(rnd() * 120);
    SYS.applyExpDelta(capped, d, [c], "climb", t && clone(t));
    uncapped(() => SYS.applyExpDelta(full, d, [c], "climb", t && clone(t)));
  }
}
const cats = Object.keys(SYS.defaultState().intelligences);

console.log("the cap");
{
  const capped = SYS.defaultState(), full = SYS.defaultState();
  climb(capped, full, 2500, 11);
  check("the full copy really went past the cap", full.levelHistory.length > KEEP * 2, full.levelHistory.length + " records");
  check("the capped copy keeps exactly " + KEEP, capped.levelHistory.length === KEEP, capped.levelHistory.length + "");
  check("trimmedLevels counts what was dropped", capped.player.trimmedLevels === full.levelHistory.length - KEEP,
    capped.player.trimmedLevels + " vs " + (full.levelHistory.length - KEEP));
  check("the kept records are the newest ones, unchanged", stable(capped.levelHistory) === stable(full.levelHistory.slice(-KEEP)));
  check("the climb itself is identical", ledger(capped) === ledger(full), standing(capped) + " vs " + standing(full));

  // Undo inside the window: exact.
  const a = clone(capped), b = clone(full);
  for (let i = 0; i < 40; i++) {
    const d = -(30 + (i * 37) % 170);
    SYS.applyExpDelta(a, d, [cats[i % cats.length]], "undo");
    uncapped(() => SYS.applyExpDelta(b, d, [cats[i % cats.length]], "undo"));
  }
  check("undo inside the kept window is exact", ledger(a) === ledger(b), standing(a) + " vs " + standing(b));
  check("and it used records, not trimmed levels", a.player.trimmedLevels === capped.player.trimmedLevels);

  // Undo all of it: past the window.
  const deepA = clone(capped), deepB = clone(full);
  const total = SYS.totalExp(deepA.player);
  SYS.applyExpDelta(deepA, -total, cats, "undo everything");
  uncapped(() => SYS.applyExpDelta(deepB, -total, cats, "undo everything"));
  check("undoing past the window lands on the same standing", standing(deepA) === standing(deepB), standing(deepA) + " vs " + standing(deepB));
  check("with the same total EXP", SYS.totalExp(deepA.player) === SYS.totalExp(deepB.player));
  check("every trimmed level was taken back", (deepA.player.trimmedLevels || 0) === 0, String(deepA.player.trimmedLevels));
  check("and every kept record was used", deepA.levelHistory.length === 0);
}

console.log("");
console.log("the top of the ladder fits in a document");
{
  const capped = SYS.defaultState(), full = SYS.defaultState();
  climb(capped, full, 6000, 5);
  check("reached the top", capped.player.rank === "S" && capped.player.level === SYS.LEVELS_PER_RANK, standing(capped));
  check("whole state well under 1 MiB (" + kb(capped) + " KB, was " + kb(full) + " KB)", kb(capped) < 500);
  // A rank-down through trimmed levels, from S down across several ranks.
  const down = clone(capped), ref = clone(full);
  const d = -Math.floor(SYS.totalExp(down.player) * 0.6);
  SYS.applyExpDelta(down, d, cats, "big undo");
  uncapped(() => SYS.applyExpDelta(ref, d, cats, "big undo"));
  check("a deep undo across ranks lands on the same standing", standing(down) === standing(ref), standing(down) + " vs " + standing(ref));
}

console.log("");
console.log("never trimmed, nothing changes");
{
  const s = SYS.defaultState();
  const before = standing(s);
  SYS.applyExpDelta(s, -500, [cats[0]], "undo below the start");
  check("an untrimmed account still floors where it always did", standing(s) === before.replace(/\+\d+$/, "+0"), standing(s) + " from " + before);
  check("and gains no trimmedLevels", !s.player.trimmedLevels);
}

console.log("");
console.log("trimming a long history on load");
{
  const full = SYS.defaultState(), ignored = SYS.defaultState();
  climb(ignored, full, 2000, 3);
  const loaded = clone(full);
  check("trims a long saved history", SYS.trimLevelHistory(loaded) === true && loaded.levelHistory.length === KEEP);
  check("a second pass changes nothing", SYS.trimLevelHistory(loaded) === false);
  const total = SYS.totalExp(loaded.player);
  const ref = clone(full);
  SYS.applyExpDelta(loaded, -total, cats, "undo everything");
  uncapped(() => SYS.applyExpDelta(ref, -total, cats, "undo everything"));
  check("a history trimmed on load undoes to the same standing", standing(loaded) === standing(ref), standing(loaded) + " vs " + standing(ref));
}

console.log("");
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);

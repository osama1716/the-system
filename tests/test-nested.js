// Where does a nested array get into the state? Firestore refuses the whole
// save for one array directly inside another ("Nested arrays are not
// supported"), and a real account's save is failing with exactly that.
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

function nested(v) {
  const out = [];
  const walk = (x, p, inArray) => {
    if (Array.isArray(x)) {
      if (inArray) out.push(p);
      x.forEach((y, i) => walk(y, p + "[" + i + "]", true));
      return;
    }
    if (x && typeof x === "object") Object.keys(x).forEach((k) => walk(x[k], p + "." + k, false));
  };
  walk(v, "state", false);
  return out;
}

const report = (name, s) => {
  const found = nested(s);
  console.log((found.length ? "  NESTED " : "  ok     ") + name + (found.length ? "  -> " + found.slice(0, 5).join(" | ") + (found.length > 5 ? " (+" + (found.length - 5) + ")" : "") : ""));
  return found.length;
};

let bad = 0;
const cats = (s) => Object.keys(s.intelligences);

// 1. Many levels from untargeted work.
{
  const s = SYS.defaultState();
  SYS.applyExpDelta(s, 900, [cats(s)[0]], "big quest");
  bad += report("levels from untargeted EXP", s);
}
// 2. Many levels from work that names a trait.
{
  const s = SYS.defaultState();
  const cat = cats(s)[0];
  const trait = Object.keys(s.intelligences[cat].traits || {})[0] || "x";
  SYS.applyExpDelta(s, 900, [cat], "targeted", [{ category: cat, trait }]);
  bad += report("levels from trait-targeted EXP (" + cat + "/" + trait + ")", s);
}
// 3. Several categories at once, then a partial undo.
{
  const s = SYS.defaultState();
  const cs = cats(s).slice(0, 3);
  SYS.applyExpDelta(s, 1500, cs, "multi");
  bad += report("levels across three categories", s);
  SYS.applyExpDelta(s, -700, cs, "undo part");
  bad += report("after undoing part of it", s);
}
// 4. A rank-up.
{
  const s = SYS.defaultState();
  SYS.applyExpDelta(s, 5000, [cats(s)[1]], "rank up");
  bad += report("rank-up", s);
}
// 5. Every top-level part of a default state, before anything happens.
bad += report("default state", SYS.defaultState());

console.log(bad ? "NESTED ARRAYS FOUND" : "none found");

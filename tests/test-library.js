// The library exists in two copies — the client draws from one, the server
// prices from the other — because there is no build step to share a file
// between them. Two copies stay honest only if something checks them, and an
// id that exists on one side and not the other is a habit that either cannot
// be drawn or cannot be added.
const fs = require("fs"), path = require("path"), vm = require("vm");
const REPO = path.resolve(__dirname, "..").split(path.sep).join("/") + "/";
const SYS = {};
const sb = { SYS, window: {}, console, Math, JSON, Object, Array, Number, String, Boolean, RegExp, Date, Set, Map, Intl,
  crypto: { randomUUID: () => "id" + Math.random() } };
vm.createContext(sb);
for (const f of ["i18n.js", "constants.js", "engine.js"]) {
  vm.runInContext(fs.readFileSync(path.join(REPO, "js", f), "utf8")
    .replace(/\}\)\(window\.SYS[^)]*\);?\s*$/, "})(SYS);"), sb, { filename: f });
}
const SERVER = require(REPO + "functions/presets.js");
const AI = require(REPO + "functions/ai-config.js");

let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };

console.log("");
console.log("the two catalogues describe the same habits");
{
  const clientIds = SYS.HABIT_LIBRARY.map((p) => p.id);
  const serverIds = SERVER.PRESETS.map((p) => p.id);
  check("same count", clientIds.length === serverIds.length, clientIds.length + " vs " + serverIds.length);
  check("same ids, same order", clientIds.join(",") === serverIds.join(","));
  check("no duplicates", new Set(clientIds).size === clientIds.length);
  check("same categories", JSON.stringify(SYS.LIBRARY_CATEGORIES) === JSON.stringify(SERVER.CATEGORIES));

  // The client draws the amount and the schedule; the server prices against
  // them. If they disagree, the row is a lie about what gets created.
  const drift = [];
  SYS.HABIT_LIBRARY.forEach((c) => {
    const s = SERVER.byId(c.id);
    if (!s) return;
    if (c.unit !== s.unit) drift.push(c.id + " unit");
    if (c.targetAmount !== s.targetAmount) drift.push(c.id + " amount");
    if (c.category !== s.category) drift.push(c.id + " category");
    if (c.emoji !== s.emoji) drift.push(c.id + " emoji");
    if (JSON.stringify(c.schedule) !== JSON.stringify(s.schedule)) drift.push(c.id + " schedule");
  });
  check("amount, unit, emoji, category and schedule all agree", drift.length === 0, drift.join("; "));
}

console.log("");
console.log("every habit can actually be drawn");
{
  const missing = [];
  const cats = [];
  SYS.setLanguageCode("en");
  SYS.HABIT_LIBRARY.forEach((p) => {
    const title = SYS.t("preset." + p.id);
    if (!title || title === "preset." + p.id) missing.push(p.id);
  });
  SYS.LIBRARY_CATEGORIES.forEach((c) => {
    const label = SYS.t("presetCat." + c);
    if (!label || label === "presetCat." + c) cats.push(c);
  });
  check("every habit has a title", missing.length === 0, missing.join(", "));
  check("every group has a label", cats.length === 0, cats.join(", "));
  check("every habit belongs to a group", SYS.HABIT_LIBRARY.every((p) => SYS.LIBRARY_CATEGORIES.includes(p.category)));
  check("every group has at least one habit",
    SYS.LIBRARY_CATEGORIES.every((c) => SYS.HABIT_LIBRARY.some((p) => p.category === c)));

  // Arabic is the other language this is actually used in, and a missing
  // title there would render as a raw key on the card.
  SYS.setLanguageCode("ar");
  const ar = SYS.HABIT_LIBRARY.filter((p) => SYS.t("preset." + p.id) === "preset." + p.id);
  check("and in Arabic too", ar.length === 0, ar.join(", "));
  SYS.setLanguageCode("en");
}

console.log("");
console.log("what the server would price");
{
  const bad = [];
  const keys = new Set(AI.INTELLIGENCE_CATEGORIES.map((c) => c.key));
  const seed = SYS.seedIntelligences();
  SERVER.PRESETS.forEach((p) => {
    if (p.description.trim().length < 10) bad.push(p.id + " description too short for the evaluator");
    if (!p.types.length) bad.push(p.id + " has no intelligence");
    p.types.forEach((t) => { if (!keys.has(t)) bad.push(p.id + " bad type " + t); });
    p.traitTargets.forEach((t) => {
      if (!keys.has(t.category)) bad.push(p.id + " bad trait category " + t.category);
      else if (!seed[t.category].traits.some((x) => x.name === t.trait)) bad.push(p.id + " invented trait " + t.trait);
    });
    if (!(Number(p.targetAmount) > 0)) bad.push(p.id + " amount");
  });
  check("descriptions pass the evaluator's own minimum", !bad.some((b) => /description/.test(b)), bad.filter((b) => /description/.test(b)).join("; "));
  check("every trait named is one the app already has", bad.length === 0, bad.join("; "));

  const units = new Set(SYS.UNIT_GROUPS.flatMap((g) => g.units));
  check("every unit is a real unit", SERVER.PRESETS.every((p) => units.has(p.unit)));
  check("no preset carries its own price", SERVER.PRESETS.every((p) => !("pt" in p)));
}

console.log("");
console.log("the cache key");
{
  const k = SERVER.scheduleKey;
  check("daily", k({ type: "daily" }) === "daily");
  check("weekdays lists its days", k({ type: "weekdays", days: [1, 3, 5] }) === "weekdays-1.3.5");
  check("a quota carries its number", k({ type: "perWeek", n: 3 }) === "perWeek-3");
  check("an interval carries its length", k({ type: "interval", every: 3 }) === "interval-3");
  // Two people adding "every 3 days" on different start dates must land on
  // the same entry, or the cache never hits.
  check("the start date is not part of it",
    k({ type: "interval", every: 3, start: "2026-01-01" }) === k({ type: "interval", every: 3, start: "2026-09-12" }));
  check("nonsense still keys to something", k(null) === "daily" && k({}) === "daily");
}

console.log("");
console.log("the server rebuilds the schedule it was sent");
{
  const s = SERVER.sanitizeSchedule;
  check("a hostile quota is clamped", s({ type: "perWeek", n: 999 }).n === 7);
  check("an unknown type becomes daily", s({ type: "whatever" }).type === "daily");
  check("empty weekdays becomes daily", s({ type: "weekdays", days: [] }).type === "daily");
  check("a quota cannot exceed its window", s({ type: "perInterval", every: 4, n: 50 }).n === 4);
  // Both sides must agree, or the price is for a different habit than the
  // one the client thinks it is adding.
  const drift = SYS.HABIT_LIBRARY.filter((p) =>
    JSON.stringify(s(p.schedule)) !== JSON.stringify(SYS.sanitizeSchedule(p.schedule)));
  check("client and server sanitise every preset schedule the same way", drift.length === 0, drift.map((p) => p.id).join(", "));
}

console.log("");
console.log("adding one produces a normal habit");
{
  const state = SYS.defaultState();
  state.tasks = [];
  const preset = SYS.libraryPreset("workout");
  SYS.addTask(state, {
    title: "Train", priority: "Medium", taskType: "Recurring", types: ["bodily"], pt: 30,
    mode: "simple", notes: "", recurring: true, schedule: preset.schedule, unit: preset.unit,
    targetAmount: preset.targetAmount, traitTargets: [{ category: "bodily", trait: "Sports" }],
    priceId: "price123", fromLibrary: "workout", icon: preset.emoji,
  });
  const t = state.tasks[0];
  check("it is a habit", t.recurring === true && t.taskType === "Recurring");
  check("with the preset's schedule", JSON.stringify(t.schedule) === JSON.stringify({ type: "weekdays", days: [1, 3, 5] }));
  check("and its amount", t.unit === "min" && t.targetAmount === 45);
  check("the price is recorded so the journal can check it", t.priceId === "price123");
  check("and it remembers where it came from", t.fromLibrary === "workout");
  check("the emoji came across", t.icon === "🏋️");

  // It has to behave like any other habit from here on.
  const base = SYS.totalExp(state.player);
  SYS.addHabitAmount(state, t.id, SYS.todayKey(), 45, "min");
  check("logging it pays", SYS.totalExp(state.player) - base === SYS.ptToExp(30));
  check("and the day reads as done", SYS.habitDoneOn(state.tasks[0], SYS.todayKey()));

  // A hand-made habit must not claim to be from the library.
  const plain = SYS.defaultState();
  plain.tasks = [];
  SYS.addTask(plain, { title: "Mine", priority: "Medium", taskType: "Recurring", types: [], pt: 10,
    mode: "simple", notes: "", recurring: true, schedule: { type: "daily" }, unit: "reps", targetAmount: 1 });
  check("a hand-made habit carries no library id", !("fromLibrary" in plain.tasks[0]));
}

console.log("");
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);

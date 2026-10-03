// Public profiles (functions/profile.js): what goes public, what may be
// written into it, and that the avatar list matches the app's.
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
const P = require(REPO + "functions/profile.js");
let fails = 0;
const check = (name, c, d) => { if (!c) { fails++; console.log("  FAIL  " + name + (d ? "  " + d : "")); } else console.log("  ok    " + name); };

console.log("");
console.log("avatars");
check("the app and the server offer the same avatars", JSON.stringify(SYS.AVATARS) === JSON.stringify(P.AVATARS));
check("the bio limit agrees", SYS.PROFILE_BIO_MAX === P.BIO_MAX);

console.log("");
console.log("bio");
check("trimmed and one line", P.cleanBio("  hello\n\n  world  ") === "hello world");
check("hidden direction and zero-width characters go", P.cleanBio("ab‮cd​ef") === "abcdef");
check("capped", P.cleanBio("x".repeat(500)).length === P.BIO_MAX);
check("nothing is nothing", P.cleanBio(null) === "" && P.cleanBio("   ") === "");

console.log("");
console.log("what the intelligences show");
{
  const state = SYS.defaultState();
  // A fresh account starts at zero now - the seed used to carry one person's
  // own standing - so this builds the standing it means to test instead of
  // borrowing it from the defaults.
  const put = (cat, name, level) => { state.intelligences[cat].traits.find((t) => t.name === name).level = level; };
  put("self", "Reflection & thinking", 13);
  put("self", "Time management", 6);
  put("linguistic", "Writing", 8);
  put("linguistic", "Reading", 7);
  put("bodily", "Sports", 9);
  const out = P.projectIntelligences(state);
  check("one entry per intelligence", out.categories.length === state.intTypes.length, out.categories.length + " vs " + state.intTypes.length);
  const self = out.categories.find((c) => c.key === "self");
  const expected = SYS.categoryScore(state.intelligences.self);
  check("each is the total of its trait levels", self && self.score === expected, self && self.score + " vs " + expected);
  check("a category with more traits is not penalised for holding them",
    SYS.categoryScore({ traits: [{ level: 5 }, { level: 5 }] }) === SYS.categoryScore({ traits: [{ level: 5 }, { level: 5 }, { level: 0 }] }),
    "adding an untouched trait changed the score");
  check("the top three traits, strongest first", out.topTraits.length === 3 && out.topTraits[0].level >= out.topTraits[1].level && out.topTraits[1].level >= out.topTraits[2].level);
  check("the strongest is really the strongest", out.topTraits[0].level === Math.max(...Object.values(state.intelligences).flatMap((c) => c.traits.map((t) => t.level))));
  check("nothing about tasks", !JSON.stringify(out).includes("tasks") && !("tasks" in out));
  check("stable for the same state", JSON.stringify(P.projectIntelligences(state)) === JSON.stringify(out));
  check("no state, every intelligence at nothing", P.projectIntelligences({}).categories.every((c) => c.score === 0) && P.projectIntelligences({}).topTraits.length === 0);
}

console.log("");
console.log("the device's word does not reach a public page as written");
{
  const { STANDARD } = require(REPO + "functions/standard-traits.js");
  const seed = SYS.seedIntelligences();
  const same = SYS.DEFAULT_INT_TYPES.every((t) => STANDARD[t.key] && STANDARD[t.key].short === t.short &&
    JSON.stringify(STANDARD[t.key].traits) === JSON.stringify(seed[t.key].traits.map((x) => [x.name, x.ar])));
  check("the server's trait list is the app's, name for name", same && Object.keys(STANDARD).length === SYS.DEFAULT_INT_TYPES.length);

  const state = SYS.defaultState();
  state.intelligences.self.traits[0].name = "Something nobody moderated";
  state.intelligences.self.traits[0].level = 50;
  state.intelligences.self.traits.push({ id: "x", name: "Reading", ar: "مزيف", level: 40 });
  state.intelligences.linguistic.traits.find((t) => t.name === "Reading").level = 3;
  state.intTypes[0].short = "<b>X</b>";
  const out = P.projectIntelligences(state);
  check("a renamed trait is not shown", !JSON.stringify(out).includes("nobody moderated"));
  check("a standard name in the wrong category is not counted there", out.categories.find((c) => c.key === "self").score === 0);
  check("names, Arabic and codes are the server's", out.topTraits[0].name === "Reading" && out.topTraits[0].ar === STANDARD.linguistic.traits[0][1] && out.topTraits[0].short === "LING");
  check("the device's short code is not used", out.categories.every((c) => c.short === STANDARD[c.key].short));

  const big = SYS.defaultState();
  big.intelligences.bodily.traits[0].level = 900;
  big.intelligences.self.traits[0].level = 100;
  const cap = P.maxPointsFor(1000);
  check("1000 EXP buys at most 20 points, plus the assessment and slack", cap === 20 + 40 + 5, String(cap));
  const capped = P.projectIntelligences(big, cap);
  const sum = capped.categories.reduce((s, c) => s + c.score, 0);
  check("levels beyond what the EXP could buy are scaled down to it", capped.capped && Math.abs(sum - cap) < 0.05, String(sum));
  check("the shape of the radar survives the scaling", capped.categories.find((c) => c.key === "bodily").score > capped.categories.find((c) => c.key === "self").score * 8);
  const honest = P.projectIntelligences(big, P.maxPointsFor(100000));
  check("an account with the EXP for it is shown as it is", !honest.capped && honest.categories.find((c) => c.key === "bodily").score === 900);
}

console.log("");
console.log("reports and limits");
check("a good report", JSON.stringify(P.cleanReport({ uid: "abcDEF1234567890abcDEF1234", reason: "bio", note: " rude " })) === JSON.stringify({ uid: "abcDEF1234567890abcDEF1234", reason: "bio", note: "rude" }));
check("an unknown reason is refused", P.cleanReport({ uid: "abcDEF1234567890abcDEF1234", reason: "ugly" }) === null);
check("a malformed uid is refused", P.cleanReport({ uid: "../admin", reason: "bio" }) === null);
check("a day counter counts", JSON.stringify(P.nextCount({ day: "2026-09-17", n: 3 }, "2026-09-17", 5)) === JSON.stringify({ day: "2026-09-17", n: 4 }));
check("and starts again the next day", P.nextCount({ day: "2026-09-16", n: 5 }, "2026-09-17", 5).n === 1);
check("and stops at the limit", P.nextCount({ day: "2026-09-17", n: 5 }, "2026-09-17", 5) === null);

console.log("");
console.log("moderation");
{
  const req = P.buildModerationRequest(P.MODERATION_MODEL, "bio", "I love \"anime\"");
  check("a small structured request", req.max_tokens <= 300 && req.output_config.format.type === "json_schema" && req.model === P.MODERATION_MODEL);
  check("the text is quoted, not spliced in", req.messages[0].content.includes(JSON.stringify("I love \"anime\"")));
  check("no effort setting the small model may not take", !("effort" in req.output_config));
  check("an allowed verdict", JSON.stringify(P.readModeration({ content: [{ type: "text", text: "{\"allowed\":true,\"reason\":\"\"}" }] })) === JSON.stringify({ allowed: true, reason: "" }));
  check("a refused verdict keeps its reason", P.readModeration({ content: [{ type: "text", text: "{\"allowed\":false,\"reason\":\"slur\"}" }] }).reason === "slur");
  check("a model refusal counts as not allowed", P.readModeration({ stop_reason: "refusal", content: [] }).allowed === false);
  check("an unreadable answer is not a verdict", P.readModeration({ content: [{ type: "text", text: "nope" }] }) === null);
}

console.log("");
console.log("the week key");
{
  const F = require(REPO + "functions/friends.js");
  let same = true;
  for (let d = 0; d < 800; d++) {
    const when = new Date(Date.UTC(2026, 0, 1) + d * 86400000 + 13 * 3600000);
    if (SYS.currentWeekKey(when) !== F.weekKeyOf(when)) { same = false; break; }
  }
  check("the app and the server agree on the week, every day of 800", same);
}

console.log("");
console.log(fails ? fails + " FAIL" : "all passed");
process.exit(fails ? 1 : 0);

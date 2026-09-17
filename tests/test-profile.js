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
  const out = P.projectIntelligences(state);
  check("one entry per intelligence", out.categories.length === state.intTypes.length, out.categories.length + " vs " + state.intTypes.length);
  const self = out.categories.find((c) => c.key === "self");
  const expected = Math.round(SYS.avgTraitLevel(state.intelligences.self) * 10) / 10;
  check("each is the average trait level, rounded", self && self.avg === expected, self && self.avg + " vs " + expected);
  check("the top three traits, strongest first", out.topTraits.length === 3 && out.topTraits[0].level >= out.topTraits[1].level && out.topTraits[1].level >= out.topTraits[2].level);
  check("the strongest is really the strongest", out.topTraits[0].level === Math.max(...Object.values(state.intelligences).flatMap((c) => c.traits.map((t) => t.level))));
  check("nothing about tasks", !JSON.stringify(out).includes("tasks") && !("tasks" in out));
  check("stable for the same state", JSON.stringify(P.projectIntelligences(state)) === JSON.stringify(out));
  check("no state, nothing to show", P.projectIntelligences({}).categories.length === 0);
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
console.log(fails ? fails + " FAIL" : "all passed");
process.exit(fails ? 1 : 0);

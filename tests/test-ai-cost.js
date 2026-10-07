// The app's own ledger of Claude costs (functions/ai-cost.js).
const path = require("path");
const fs = require("fs");
const F = path.join(__dirname, "..", "functions");
const COST = require(path.join(F, "ai-cost.js"));
const AI = require(path.join(F, "ai-config.js"));
const PROFILE = require(path.join(F, "profile.js"));

let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };

console.log("every model the app calls has rates");
check("the valuation model", !!COST.ratesFor(AI.MODEL), AI.MODEL);
check("the moderation model", !!COST.ratesFor(PROFILE.MODERATION_MODEL), PROFILE.MODERATION_MODEL);
check("a dated model id resolves to its family", !!COST.ratesFor("claude-haiku-4-5-20251001"));
check("an unknown model is not counted as free", COST.costMicros("claude-unknown", { input_tokens: 10 }) === null);

console.log("");
console.log("the arithmetic");
// Sonnet 5: 800 uncached in ($2), 4200 cache read ($0.20), 100 out ($10)
const warm = COST.costMicros("claude-sonnet-5", { input_tokens: 800, cache_read_input_tokens: 4200, output_tokens: 100 });
check("a warm valuation is about a third of a cent", warm === 800 * 2 + 4200 * 0.2 + 100 * 10, String(warm));
const cold = COST.costMicros("claude-sonnet-5", { input_tokens: 800, cache_creation_input_tokens: 4200, output_tokens: 100 });
check("a cold one pays the 5-minute write", cold === 800 * 2 + 4200 * 2.5 + 100 * 10, String(cold));
const split = COST.costMicros("claude-sonnet-5", { input_tokens: 0, cache_creation_input_tokens: 300,
  cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 200 }, output_tokens: 0 });
check("1-hour writes are priced as such", split === 100 * 2.5 + 200 * 4, String(split));

console.log("");
console.log("wired in");
const index = fs.readFileSync(path.join(F, "index.js"), "utf8");
const calls = (index.match(/await client\.messages\.create\(/g) || []).length;
const tracked = (index.match(/trackAiCost\(response\);/g) || []).length;
check("every Claude call records its cost", calls > 0 && calls === tracked, calls + " calls, " + tracked + " tracked");

console.log("");
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);

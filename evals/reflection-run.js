// Eval harness for the reflection judge.
//
// Real API, real prompt, real schema — built by functions/reflection-prompt.js,
// the same module the function will use — so a passing run is evidence about
// what ships.
//
//   node evals/reflection-run.js                 # every case once
//   node evals/reflection-run.js --reps 3        # to see whether a miss is noise
//   node evals/reflection-run.js --only id1,id2
//
// The key is read from evals/.apikey (git-ignored) or ANTHROPIC_API_KEY, and is
// never printed.
"use strict";

const fs = require("fs");
const path = require("path");
const Anthropic = require(require.resolve("@anthropic-ai/sdk", {
  paths: [path.join(__dirname, "..", "functions")],
}));
const AI = require("../functions/ai-config");
const PROMPT = require("../functions/reflection-prompt.js");

const arg = (name, fallback) => {
  const i = process.argv.indexOf("--" + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const REPS = Number(arg("reps", 1));
const ONLY = arg("only", null);
const CONCURRENCY = 4;

const CASES = require("./reflection-cases.json").filter((c) => !ONLY || ONLY.split(",").includes(c.id));

function readKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY.trim();
  const f = path.join(__dirname, ".apikey");
  if (fs.existsSync(f)) return fs.readFileSync(f, "utf8").trim();
  console.error("No API key. Put it in evals/.apikey (git-ignored) or set ANTHROPIC_API_KEY.");
  process.exit(1);
}

const client = new Anthropic({ apiKey: readKey(), maxRetries: 3 });

// Whether the reason came back in the language asked for. Coarse on purpose —
// it exists to catch the failure the first run showed, an English answer
// given a reason in Ukrainian or Norwegian, not to grade style.
function reasonInLanguage(reason, lang) {
  const r = String(reason || "");
  if (lang === "ar") return /[\u0600-\u06FF]/.test(r);
  // English: basic Latin plus the typographic marks a sentence can carry.
  return r.length > 0 && /^[\x20-\x7E\u2018\u2019\u201C\u201D\u2013\u2014\u2026]*$/.test(r);
}

async function runOne(c, rep) {
  const req = PROMPT.buildReflectionRequest(c);
  const res = await client.messages.create(req);
  if (res.model && res.model !== AI.MODEL) throw new Error("served " + res.model + ", asked for " + AI.MODEL);
  if (res.stop_reason === "refusal") return { id: c.id, rep, refused: true, usage: res.usage };
  const block = res.content.find((b) => b.type === "text");
  const out = JSON.parse(block.text);
  return { id: c.id, rep, mode: c.mode, expect: c.expect, verdict: out.verdict, reason: out.reason,
    ok: out.verdict === c.expect, langOk: reasonInLanguage(out.reason, c.lang), lang: c.lang, usage: res.usage };
}

async function main() {
  const jobs = [];
  for (let rep = 0; rep < REPS; rep++) for (const c of CASES) jobs.push({ c, rep });
  console.log(`reflection judge: ${AI.MODEL} — ${jobs.length} calls`);
  const rows = [];
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const { c, rep } = jobs[next++];
      try { rows.push(await runOne(c, rep)); }
      catch (err) { rows.push({ id: c.id, rep, error: String(err && err.message || err) }); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));

  const scored = rows.filter((r) => r.verdict);
  const pct = (n, d) => (d ? Math.round((100 * n) / d) + "%" : "—");
  const by = (pred) => scored.filter(pred);
  const strict = by((r) => r.mode === "strict"), lenient = by((r) => r.mode === "lenient");
  const honest = by((r) => r.expect === "accept");
  console.log("");
  console.log("  overall    " + pct(scored.filter((r) => r.ok).length, scored.length) + "   (" + scored.length + " judged)");
  console.log("  strict     " + pct(strict.filter((r) => r.ok).length, strict.length));
  console.log("  lenient    " + pct(lenient.filter((r) => r.ok).length, lenient.length));
  // The number that matters most: an honest answer held is a person who gives up.
  console.log("  honest answers accepted  " + pct(honest.filter((r) => r.ok).length, honest.length));
  console.log("  strict honest accepted   " + pct(honest.filter((r) => r.ok && r.mode === "strict").length, honest.filter((r) => r.mode === "strict").length));
  // A reason the person cannot read is as good as no reason.
  console.log("  reason in right language " + pct(scored.filter((r) => r.langOk).length, scored.length));

  const cost = scored.reduce((s, r) => {
    const u = r.usage || {};
    return s + ((u.input_tokens || 0) * 2 + (u.cache_creation_input_tokens || 0) * 2.5 +
      (u.cache_read_input_tokens || 0) * 0.2 + (u.output_tokens || 0) * 10) / 1e6;
  }, 0);
  console.log("  spend      $" + cost.toFixed(3) + "   ($" + (cost / Math.max(1, scored.length)).toFixed(4) + "/call)");

  const misses = scored.filter((r) => !r.ok);
  if (misses.length) {
    console.log("\n  missed:");
    misses.forEach((r) => console.log("   - " + r.id.padEnd(22) + r.verdict + " (want " + r.expect + ") — " + String(r.reason).slice(0, 110)));
  }
  const wrongLang = scored.filter((r) => !r.langOk);
  if (wrongLang.length) {
    console.log("\n  wrong language:");
    wrongLang.forEach((r) => console.log("   - " + r.id.padEnd(22) + "(" + r.lang + ") " + String(r.reason).slice(0, 110)));
  }
  const errors = rows.filter((r) => r.error);
  if (errors.length) errors.forEach((r) => console.log("   ! " + r.id + ": " + r.error));

  const outDir = path.join(__dirname, "results", "reflection");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify(rows, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });

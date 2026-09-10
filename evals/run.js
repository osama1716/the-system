// Eval harness for evaluateTask.
//
// It calls the real Claude API with the real prompt, schema, model and effort
// out of functions/ — nothing about the request is written twice, so a passing
// eval is evidence about what ships and not about a copy of it.
//
//   node evals/run.js                      # current config, writes baseline/
//   node evals/run.js --label opus         # same cases, tagged as a variant
//   node evals/run.js --model claude-opus-5 --effort medium --label opus-med
//   node evals/run.js --reps 2             # repeat every case, to see variance
//
// The key is read from evals/.apikey (git-ignored) or ANTHROPIC_API_KEY.
"use strict";

const fs = require("fs");
const path = require("path");
// The SDK is a dependency of functions/, not of the repo root. Resolved from
// there so the harness needs no install of its own and can never end up on a
// different SDK version than the deployed function.
const Anthropic = require(require.resolve("@anthropic-ai/sdk", {
  paths: [require("path").join(__dirname, "..", "functions")],
}));

const AI = require("../functions/ai-config");
const PROMPT = require("../functions/evaluation-prompt.js");

const ROOT = __dirname;
const CASES = require("./cases.json");

// ---------------------------------------------------------------------------
// Config

function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const MODEL = arg("model", AI.MODEL);
const EFFORT = arg("effort", "low");
const REPS = Number(arg("reps", 1));
const LABEL = arg("label", "baseline");
const CONCURRENCY = Number(arg("concurrency", 4));
// A hung request must not hold a slot for ever. This reclaims the slot; it
// cannot abort the call already in flight.
const CASE_TIMEOUT_MS = 90000;

function readKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY.trim();
  const f = path.join(ROOT, ".apikey");
  if (fs.existsSync(f)) return fs.readFileSync(f, "utf8").trim();
  console.error("No API key. Put it in evals/.apikey (git-ignored) or set ANTHROPIC_API_KEY.");
  process.exit(1);
}

// What a real account has. The function takes the trait list from the client,
// so the eval has to send one too — these are the app's seed traits.
const TRAITS = [
  { key: "self", names: ["Self-motivation", "Reflection & thinking", "Personal goal-setting", "Self-evaluation", "Time management"] },
  { key: "social", names: ["Volunteering", "Social interaction", "Participating in social activities", "Effective communication"] },
  { key: "linguistic", names: ["Reading", "Writing", "Speaking", "Language learning"] },
  { key: "logical", names: ["Data analysis", "Puzzle solving", "Programming", "Sports coaching & training"] },
  { key: "bodily", names: ["Yoga", "Sports", "Self-defense techniques", "Handcrafts", "Daily exercise", "Acting", "Health"] },
  { key: "natural", names: ["Survival techniques", "Outdoor activities", "Learning about the environment", "Farming & gardening"] },
  { key: "visual", names: ["3D planning", "Graphic design", "Photography", "Drawing"] },
  { key: "musical", names: ["Playing an instrument", "Active listening", "Vocal training", "Musical creativity"] },
];

// ---------------------------------------------------------------------------
// Grading
//
// Four separate metrics rather than one score. A change that fixes trait
// routing while wrecking prices should look like exactly that, and a single
// number would hide it.

function gradeOne(c, out) {
  const e = c.expect;
  const pt = Number(out.pt);
  const got = Array.isArray(out.types) ? out.types.slice().sort() : [];
  const want = e.categories.slice().sort();

  const price = Number.isFinite(pt) && pt >= e.ptLo && pt <= e.ptHi;

  // An expected empty list means "should pick nothing" and is graded strictly.
  // Otherwise every expected category must be present; a spurious extra is
  // allowed only up to the prompt's own limit of two.
  const category = want.length === 0
    ? got.length === 0
    : want.every((k) => got.includes(k)) && got.length <= 2;

  // Only graded where a specific trait is expected. Matched case-insensitively
  // on the exact name, since the prompt tells the model to copy it verbatim.
  const targets = Array.isArray(out.traitTargets) ? out.traitTargets : [];
  const names = targets.map((t) => String(t && t.trait || "").trim().toLowerCase());
  const trait = e.trait === null ? null : names.includes(e.trait.trim().toLowerCase());

  return { price, category, trait, pt, got, names };
}

// Consistency is a property of a pair, not of a case, so it is scored after
// the run: the same activity written two ways must land close together.
const PAIR_TOLERANCE = 0.25;

function gradePairs(rows) {
  const pairs = {};
  rows.forEach((r) => {
    const tag = (r.tags || []).find((t) => t.indexOf("pair-") === 0);
    if (!tag || !Number.isFinite(r.pt)) return;
    (pairs[tag] = pairs[tag] || []).push(r);
  });
  return Object.keys(pairs).sort().map((tag) => {
    const [a, b] = pairs[tag];
    if (!a || !b) return { tag, ok: null, note: "incomplete" };
    const hi = Math.max(a.pt, b.pt), lo = Math.min(a.pt, b.pt);
    const drift = hi === 0 ? 0 : (hi - lo) / hi;
    return { tag, ok: drift <= PAIR_TOLERANCE, a: a.pt, b: b.pt, drift, ids: [a.id, b.id] };
  });
}

// ---------------------------------------------------------------------------
// Running

const client = new Anthropic({ apiKey: readKey(), maxRetries: 3 });

async function runCase(c, rep) {
  const started = Date.now();
  const message = PROMPT.buildUserMessage(c, TRAITS);
  const req = {
    model: MODEL,
    max_tokens: 8000,
    system: PROMPT.EVALUATION_SYSTEM,
    output_config: { effort: EFFORT, format: { type: "json_schema", schema: PROMPT.EVALUATION_SCHEMA } },
    messages: [{ role: "user", content: message }],
  };

  const res = await Promise.race([
    client.messages.create(req),
    new Promise((_, rej) => setTimeout(() => rej(new Error("case timeout")), CASE_TIMEOUT_MS)),
  ]);

  // A substituted model invalidates the comparison, so it fails loudly rather
  // than quietly scoring a different model's answers.
  if (res.model && res.model !== MODEL) {
    throw new Error("served " + res.model + ", asked for " + MODEL);
  }
  if (res.stop_reason === "refusal") {
    return { refused: true, latency_s: (Date.now() - started) / 1000, usage: res.usage, model: res.model };
  }
  const block = res.content.find((b) => b.type === "text");
  const out = JSON.parse(block.text);
  return {
    out, message, latency_s: (Date.now() - started) / 1000,
    usage: res.usage, model: res.model, stop_reason: res.stop_reason,
  };
}

async function main() {
  const outDir = path.join(ROOT, "results", LABEL);
  fs.mkdirSync(path.join(outDir, "traces"), { recursive: true });
  const resultsPath = path.join(outDir, "results.jsonl");
  const errorsPath = path.join(outDir, "errors.jsonl");

  // Resume is keyed on (case, rep), so a crashed run costs only what it had
  // not already paid for.
  const done = new Set();
  if (fs.existsSync(resultsPath)) {
    fs.readFileSync(resultsPath, "utf8").split("\n").filter(Boolean).forEach((l) => {
      try { const r = JSON.parse(l); done.add(r.id + "#" + r.rep); } catch (e) {}
    });
  }

  const jobs = [];
  for (let rep = 0; rep < REPS; rep++) for (const c of CASES) {
    if (!done.has(c.id + "#" + rep)) jobs.push({ c, rep });
  }
  console.log(`${LABEL}: ${MODEL} effort=${EFFORT} — ${jobs.length} calls (${done.size} already done)`);
  if (!jobs.length) { report(resultsPath); return; }

  let next = 0, finished = 0;
  async function worker() {
    while (next < jobs.length) {
      const { c, rep } = jobs[next++];
      try {
        const r = await runCase(c, rep);
        const row = r.refused
          ? { id: c.id, rep, tags: c.tags, refused: true, latency_s: r.latency_s, usage: r.usage, model: r.model }
          : Object.assign({ id: c.id, rep, tags: c.tags, title: c.title, kind: c.kind,
              latency_s: r.latency_s, usage: r.usage, model: r.model,
              rationale: r.out.rationale, expect: c.expect }, gradeOne(c, r.out));
        fs.appendFileSync(resultsPath, JSON.stringify(row) + "\n");
        fs.writeFileSync(path.join(outDir, "traces", `${c.id}_rep${rep}.json`),
          JSON.stringify([
            { role: "system", content: PROMPT.EVALUATION_SYSTEM },
            { role: "user", content: r.message || "" },
            { role: "assistant", content: JSON.stringify(r.out, null, 2) },
          ], null, 1));
      } catch (err) {
        fs.appendFileSync(errorsPath, JSON.stringify({
          id: c.id, rep, error: String(err && err.message || err),
          failure: /timeout/i.test(String(err)) ? "timeout" : "api-or-harness",
        }) + "\n");
        console.error("  ! " + c.id + ": " + (err && err.message));
      }
      finished++;
      if (finished % 5 === 0) process.stdout.write(`  ${finished}/${jobs.length}\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  report(resultsPath);
}

function pct(n, d) { return d ? (100 * n / d).toFixed(0) + "%" : "—"; }

function report(resultsPath) {
  const rows = fs.readFileSync(resultsPath, "utf8").split("\n").filter(Boolean).map(JSON.parse);
  const scored = rows.filter((r) => !r.refused);
  const traitRows = scored.filter((r) => r.trait !== null);
  const pairs = gradePairs(scored);

  console.log("");
  console.log("=".repeat(58));
  console.log(`  ${LABEL}   ${MODEL}   effort=${EFFORT}   n=${scored.length}`);
  console.log("=".repeat(58));
  console.log(`  price     ${pct(scored.filter((r) => r.price).length, scored.length).padStart(5)}   in the expected band`);
  console.log(`  category  ${pct(scored.filter((r) => r.category).length, scored.length).padStart(5)}   right intelligence`);
  console.log(`  trait     ${pct(traitRows.filter((r) => r.trait).length, traitRows.length).padStart(5)}   right trait (${traitRows.length} graded)`);
  console.log(`  pairs     ${pct(pairs.filter((p) => p.ok).length, pairs.length).padStart(5)}   two wordings within ${PAIR_TOLERANCE * 100}%`);
  if (rows.length !== scored.length) console.log(`  refused   ${rows.length - scored.length}`);

  const cost = scored.reduce((s, r) => {
    const p = { "claude-opus-5": [5, 25], "claude-sonnet-5": [2, 10], "claude-haiku-4-5": [1, 5] }[r.model] || [0, 0];
    return s + (r.usage.input_tokens * p[0] + r.usage.output_tokens * p[1]) / 1e6;
  }, 0);
  console.log(`  spend     $${cost.toFixed(3)}   median ${median(scored.map((r) => r.latency_s)).toFixed(1)}s/call`);

  const fails = scored.filter((r) => !r.price || !r.category || r.trait === false);
  if (fails.length) {
    console.log("");
    console.log(`  ${fails.length} case(s) missed something:`);
    fails.forEach((r) => {
      const miss = [!r.price && `pt ${r.pt} outside ${r.expect.ptLo}-${r.expect.ptHi}`,
        !r.category && `types ${JSON.stringify(r.got)} want ${JSON.stringify(r.expect.categories)}`,
        r.trait === false && `trait ${JSON.stringify(r.names)} want "${r.expect.trait}"`].filter(Boolean);
      console.log(`   - ${r.id.padEnd(20)} ${miss.join("; ")}`);
    });
  }
  pairs.filter((p) => p.ok === false).forEach((p) => {
    console.log(`   - ${p.tag.padEnd(20)} ${p.a} vs ${p.b} — ${(p.drift * 100).toFixed(0)}% apart`);
  });
  console.log("");
  fs.writeFileSync(path.join(path.dirname(resultsPath), "summary.json"),
    JSON.stringify({ label: LABEL, model: MODEL, effort: EFFORT, n: scored.length,
      price: scored.filter((r) => r.price).length / scored.length,
      category: scored.filter((r) => r.category).length / scored.length,
      trait: traitRows.length ? traitRows.filter((r) => r.trait).length / traitRows.length : null,
      pairs: pairs.length ? pairs.filter((p) => p.ok).length / pairs.length : null,
      cost_usd: cost, pairDetail: pairs }, null, 1));
}

function median(xs) {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

main().catch((e) => { console.error(e); process.exit(1); });

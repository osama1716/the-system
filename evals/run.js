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
// --only id1,id2 runs just those cases — for checking whether a single miss is
// noise (run it with --reps 3) without paying for the whole set again.
const ONLY = (() => {
  const i = process.argv.indexOf("--only");
  return i > -1 && process.argv[i + 1] ? new Set(process.argv[i + 1].split(",").map((s) => s.trim())) : null;
})();
const CASES = require("./cases.json").filter((c) => !ONLY || ONLY.has(c.id));
if (ONLY && CASES.length !== ONLY.size) {
  console.error("Unknown case id in --only: " + [...ONLY].filter((id) => !CASES.some((c) => c.id === id)).join(", "));
  process.exit(1);
}

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

  const price = Number.isFinite(pt) && pt >= e.ptLo && pt <= e.ptHi;

  // Three ways a case can state its category, because some tasks honestly fit
  // more than one and a grade that insisted on one would punish a defensible
  // answer:
  //   categories: [...]  every one must be present (an extra allowed up to
  //                      the prompt's limit of two); [] means "pick nothing"
  //                      and is graded strictly
  //   anyCategory: [...] at least one of these, at most two in all
  //   categories: null   not graded (only the price is)
  let category;
  if (Array.isArray(e.anyCategory)) {
    category = got.some((k) => e.anyCategory.includes(k)) && got.length <= 2;
  } else if (e.categories === null || e.categories === undefined) {
    category = null;
  } else {
    const want = e.categories.slice().sort();
    category = want.length === 0 ? got.length === 0 : want.every((k) => got.includes(k)) && got.length <= 2;
  }

  // Only graded where a trait is expected: one exact name (`trait`), or any of
  // several (`traitAny`). Case-insensitive, since the prompt tells the model to
  // copy the name verbatim.
  const targets = Array.isArray(out.traitTargets) ? out.traitTargets : [];
  const names = targets.map((t) => String(t && t.trait || "").trim().toLowerCase());
  const wanted = Array.isArray(e.traitAny) ? e.traitAny : (e.trait ? [e.trait] : null);
  const trait = wanted ? wanted.some((w) => names.includes(String(w).trim().toLowerCase())) : null;

  // The two time estimates, graded only on the cases that state a band for
  // them. A band rather than a number on purpose: "the fewest plausible
  // hours" is a judgment, and the eval should catch a figure that is absurd,
  // not one that disagrees with mine by an hour.
  const hours = Number(out.effortHours);
  const days = Number(out.minDays);
  const band = (v, lo, hi) => Number.isFinite(v) &&
    v >= (Number.isFinite(lo) ? lo : -Infinity) && v <= (Number.isFinite(hi) ? hi : Infinity);
  const wantsHours = Number.isFinite(e.effortLo) || Number.isFinite(e.effortHi);
  const wantsDays = Number.isFinite(e.minDaysLo) || Number.isFinite(e.minDaysHi);
  const effort = (wantsHours || wantsDays)
    ? (!wantsHours || band(hours, e.effortLo, e.effortHi)) && (!wantsDays || band(days, e.minDaysLo, e.minDaysHi))
    : null;

  return { price, category, trait, effort, hours, days, pt, got, names };
}

// Prompt examples are part of the prompt. A case that repeats one would be
// graded on having been shown the answer, so the run refuses to start if an
// example's title matches a case's.
{
  const examples = Array.isArray(PROMPT.EVALUATION_EXAMPLES) ? PROMPT.EVALUATION_EXAMPLES : [];
  const norm = (s) => String(s || "").trim().toLowerCase();
  const titles = new Set(examples.map((x) => norm(x.title)));
  const leaks = CASES.filter((c) => titles.has(norm(c.title))).map((c) => c.id);
  if (leaks.length) {
    console.error("These cases repeat a prompt example and would be graded on a shown answer: " + leaks.join(", "));
    process.exit(1);
  }
}

// Consistency is a property of a pair, not of a case, so it is scored after
// the run: the same activity written two ways must land close together.
const PAIR_TOLERANCE = 0.25;

function gradePairs(rows) {
  // Grouped by tag *and* rep: with --reps, comparing one wording's first try
  // against the other's third measures variance, not consistency.
  const pairs = {};
  rows.forEach((r) => {
    const tag = (r.tags || []).find((t) => t.indexOf("pair-") === 0);
    if (!tag || !Number.isFinite(r.pt)) return;
    const key = tag + (r.rep ? "#" + r.rep : "");
    (pairs[key] = pairs[key] || []).push(r);
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
  // The request production sends, built by the same function — including its
  // cache marker, so the eval measures caching as it ships.
  const req = PROMPT.buildEvaluationRequest(c, TRAITS, { model: MODEL, effort: EFFORT });
  const message = req.messages[0].content;

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
  const categoryRows = scored.filter((r) => r.category !== null);
  const effortRows = scored.filter((r) => r.effort !== null && r.effort !== undefined);
  const pairs = gradePairs(scored);

  console.log("");
  console.log("=".repeat(58));
  console.log(`  ${LABEL}   ${MODEL}   effort=${EFFORT}   n=${scored.length}`);
  console.log("=".repeat(58));
  console.log(`  price     ${pct(scored.filter((r) => r.price).length, scored.length).padStart(5)}   in the expected band`);
  console.log(`  category  ${pct(categoryRows.filter((r) => r.category).length, categoryRows.length).padStart(5)}   right intelligence (${categoryRows.length} graded)`);
  console.log(`  trait     ${pct(traitRows.filter((r) => r.trait).length, traitRows.length).padStart(5)}   right trait (${traitRows.length} graded)`);
  console.log(`  effort    ${pct(effortRows.filter((r) => r.effort).length, effortRows.length).padStart(5)}   time estimates in band (${effortRows.length} graded)`);
  console.log(`  pairs     ${pct(pairs.filter((p) => p.ok).length, pairs.length).padStart(5)}   two wordings within ${PAIR_TOLERANCE * 100}%`);
  if (rows.length !== scored.length) console.log(`  refused   ${rows.length - scored.length}`);

  // input_tokens is only the uncached remainder; a cache write costs 1.25x the
  // input price and a read 0.1x. Leaving those out would report a cached run
  // as nearly free.
  const cost = scored.reduce((s, r) => {
    const p = { "claude-opus-5": [5, 25], "claude-sonnet-5": [2, 10], "claude-haiku-4-5": [1, 5] }[r.model] || [0, 0];
    const u = r.usage || {};
    return s + ((u.input_tokens || 0) * p[0] + (u.cache_creation_input_tokens || 0) * p[0] * 1.25 +
      (u.cache_read_input_tokens || 0) * p[0] * 0.1 + (u.output_tokens || 0) * p[1]) / 1e6;
  }, 0);
  const cacheRead = scored.reduce((s, r) => s + ((r.usage && r.usage.cache_read_input_tokens) || 0), 0);
  const cacheWrite = scored.reduce((s, r) => s + ((r.usage && r.usage.cache_creation_input_tokens) || 0), 0);
  console.log(`  spend     $${cost.toFixed(3)}   ($${(cost / Math.max(1, scored.length)).toFixed(4)}/call)   median ${median(scored.map((r) => r.latency_s)).toFixed(1)}s/call`);
  console.log(`  cache     ${cacheRead} tokens read, ${cacheWrite} written`);

  const fails = scored.filter((r) => !r.price || r.category === false || r.trait === false || r.effort === false);
  if (fails.length) {
    console.log("");
    console.log(`  ${fails.length} case(s) missed something:`);
    fails.forEach((r) => {
      const miss = [!r.price && `pt ${r.pt} outside ${r.expect.ptLo}-${r.expect.ptHi}`,
        r.category === false && `types ${JSON.stringify(r.got)} want ${JSON.stringify(r.expect.anyCategory ? { any: r.expect.anyCategory } : r.expect.categories)}`,
        r.trait === false && `trait ${JSON.stringify(r.names)} want ${JSON.stringify(r.expect.traitAny || r.expect.trait)}`,
        r.effort === false && `effort ${r.hours}h/${r.days}d want ${r.expect.effortLo != null || r.expect.effortHi != null ? (r.expect.effortLo ?? "—") + "-" + (r.expect.effortHi ?? "—") + "h" : ""}${r.expect.minDaysLo != null || r.expect.minDaysHi != null ? " " + (r.expect.minDaysLo ?? "—") + "-" + (r.expect.minDaysHi ?? "—") + "d" : ""}`].filter(Boolean);
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
      category: categoryRows.length ? categoryRows.filter((r) => r.category).length / categoryRows.length : null,
      trait: traitRows.length ? traitRows.filter((r) => r.trait).length / traitRows.length : null,
      effort: effortRows.length ? effortRows.filter((r) => r.effort).length / effortRows.length : null,
      pairs: pairs.length ? pairs.filter((p) => p.ok).length / pairs.length : null,
      cost_usd: cost, pairDetail: pairs }, null, 1));
}

function median(xs) {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

main().catch((e) => { console.error(e); process.exit(1); });

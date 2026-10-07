// What each Claude call cost, worked out from the usage the API returns.
//
// Anthropic does not expose an individual account's credit balance or spend
// limit through its API, so The System keeps its own ledger: every call's
// cost goes into aiSpend/{YYYY-MM} and into a running total since the admin
// last told it what the balance was (config/billing). Only this app's calls
// are counted.
//
// Rates per million tokens, from platform.claude.com/docs/en/about-claude/pricing
// (checked 2026-10-07). Re-check them whenever ai-config.js or profile.js
// change model.
"use strict";

const RATES = {
  "claude-sonnet-5": { input: 2, write5m: 2.5, write1h: 4, read: 0.2, output: 10 },
  "claude-haiku-4-5": { input: 1, write5m: 1.25, write1h: 2, read: 0.1, output: 5 },
};

function ratesFor(model) {
  const m = String(model || "");
  const key = Object.keys(RATES).sort((a, b) => b.length - a.length).find((k) => m === k || m.startsWith(k + "-"));
  return key ? RATES[key] : null;
}

// Millionths of a dollar for one response's `usage`. Unknown model: null,
// so it is logged rather than silently counted as free.
function costMicros(model, usage) {
  const r = ratesFor(model);
  if (!r || !usage) return null;
  const n = (x) => Math.max(0, Number(x) || 0);
  const cc = usage.cache_creation || null;
  const w5 = cc ? n(cc.ephemeral_5m_input_tokens) : n(usage.cache_creation_input_tokens);
  const w1 = cc ? n(cc.ephemeral_1h_input_tokens) : 0;
  // $/MTok x tokens = micro-dollars.
  return Math.round(
    n(usage.input_tokens) * r.input +
    w5 * r.write5m + w1 * r.write1h +
    n(usage.cache_read_input_tokens) * r.read +
    n(usage.output_tokens) * r.output
  );
}

module.exports = { RATES, ratesFor, costMicros };

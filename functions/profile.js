// Public profiles: what is shown, and what may be written into one.
//
// Pure, so tests/test-profile.js can hold it. A profile is two public
// documents read together: leaderboard/{uid} (name and the journal's EXP,
// already public) and profiles/{uid} (everything below). Both are written by
// the server only — a profile nobody can forge is the whole reason it exists.
//
// Never public: task titles, notes, the planner, anything a person typed about
// their own work. The intelligences appear as averages and the three strongest
// traits, which say who someone is without saying what they did.

const { STANDARD } = require("./standard-traits.js");

// The avatars a person can pick. Emoji rather than uploaded pictures: nothing
// to moderate, nothing to store, and they read in every theme. The ids are
// what is stored; js/constants.js holds the same list for display, and
// tests/test-profile.js keeps the two identical.
const AVATARS = {
  a01: "Sentinel", a02: "Hound", a03: "Breaker", a04: "Elder",
  a05: "Anchor", a06: "Relic", a07: "Oath", a08: "Drifter",
  a09: "Thorn", a10: "Stray", a11: "Ember", a12: "Still",
  a13: "Warden", a14: "Veil", a15: "Lantern", a16: "Tide",
};

const BIO_MAX = 120;
const EDITS_PER_DAY = 20;
const REPORT_REASONS = ["name", "bio", "cheating", "other"];
const REPORT_NOTE_MAX = 200;
const REPORTS_PER_DAY = 10;

function cleanBio(bio) {
  return String(bio == null ? "" : bio)
    // No line breaks, no invisible direction or zero-width tricks: a bio is
    // one short line, and those are how text hides from a moderator.
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, BIO_MAX);
}

// The most trait levels an account can honestly hold, from the EXP the
// journal says it has. Points come only from EXP, at most two per hundred
// (SYS.RANK_POINTS_PER_100_EXP in js/constants.js), plus what the opening
// assessment hands out (SYS.ASSESSMENT_BUDGET). A little slack covers the
// rounding of fractional points.
const POINTS_PER_EXP_MAX = 2 / 100;
const ASSESSMENT_POINTS = 40;
const POINTS_SLACK = 5;
function maxPointsFor(totalExp) {
  return Math.ceil(Math.max(0, Number(totalExp) || 0) * POINTS_PER_EXP_MAX) + ASSESSMENT_POINTS + POINTS_SLACK;
}

const round2 = (n) => Math.round(n * 100) / 100;

// The public side of a saved state: each intelligence as the sum of its trait
// levels, and the three strongest traits.
//
// The saved state is the device's own word, so nothing in it reaches a public
// page as written:
// - only the eight standard categories and the standard traits are read, by
//   exact name, and the names, Arabic names and short codes shown are the
//   server's own (standard-traits.js) — a trait renamed on a device cannot
//   put unmoderated text in front of other people;
// - when `maxPoints` is given, the levels are scaled down to it, so no profile
//   claims more growth than the EXP behind it could have bought.
function projectIntelligences(state, maxPoints) {
  const intel = (state && state.intelligences) || {};
  const levelOf = (x) => {
    const n = Number(x && x.level);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 1e6) : 0;
  };
  const rows = Object.keys(STANDARD).map((key) => {
    const known = new Map(STANDARD[key].traits.map(([name, ar]) => [name, ar]));
    const seen = new Set();
    const traits = [];
    ((intel[key] && Array.isArray(intel[key].traits)) ? intel[key].traits : []).forEach((x) => {
      const name = x && typeof x.name === "string" ? x.name : null;
      if (!name || !known.has(name) || seen.has(name)) return;
      seen.add(name);
      traits.push({ name, ar: known.get(name), short: STANDARD[key].short, level: levelOf(x) });
    });
    return { key, short: STANDARD[key].short, traits };
  });
  const total = rows.reduce((s, r) => s + r.traits.reduce((t, x) => t + x.level, 0), 0);
  const scale = Number.isFinite(maxPoints) && total > maxPoints ? maxPoints / total : 1;
  // The sum, not the average — see categoryScore in js/engine.js for why.
  // The field is `score`; `avg` was what this wrote before and is still read
  // by the client for profiles written under the old rule.
  const categories = rows.map((r) => ({
    key: r.key, short: r.short,
    score: round2(r.traits.reduce((s, x) => s + x.level, 0) * scale),
  }));
  const traits = [].concat(...rows.map((r) => r.traits))
    .map((x) => ({ ...x, level: round2(x.level * scale) }));
  traits.sort((a, b) => b.level - a.level || (a.name < b.name ? -1 : 1));
  return { categories, topTraits: traits.slice(0, 3).filter((x) => x.level > 0), capped: scale < 1 };
}

// The moderation request, for a name or a bio. Asked narrowly: public text on
// a self-improvement app, in any language, judged only for being abusive —
// not for being odd, informal or not in English.
const MODERATION_SCHEMA = {
  type: "object",
  properties: {
    allowed: { type: "boolean" },
    reason: { type: "string", description: "A short reason when not allowed, in the same language as the text. Empty when allowed." },
  },
  required: ["allowed", "reason"],
  additionalProperties: false,
};

const MODERATION_SYSTEM = [
  "You check short public text on a habit and self-improvement app: a display name or a one-line bio, in any language.",
  "Refuse it only if it is clearly one of: hate or slurs; sexual content; harassment or threats aimed at a person or group;",
  "violent extremism; promotion of self-harm or drugs; impersonation of staff (e.g. \"admin\", \"official support\");",
  "contact details or links used for spam or advertising.",
  "Allow everything else: jokes, slang, anime and game references, mild words used casually, religious or national",
  "expressions, and text in any language or script. When unsure, allow it.",
].join(" ");

function buildModerationRequest(model, kind, text) {
  return {
    model,
    max_tokens: 200,
    system: MODERATION_SYSTEM,
    output_config: { format: { type: "json_schema", schema: MODERATION_SCHEMA } },
    messages: [{ role: "user", content: "Kind: " + (kind === "name" ? "display name" : "bio") + "\nText: " + JSON.stringify(String(text)) }],
  };
}

function readModeration(response) {
  if (!response || response.stop_reason === "refusal") return { allowed: false, reason: "" };
  const block = (response.content || []).find((b) => b.type === "text");
  try {
    const parsed = JSON.parse(block.text);
    return { allowed: parsed.allowed === true, reason: String(parsed.reason || "").slice(0, 200) };
  } catch (e) {
    return null;
  }
}

function cleanReport(data) {
  const d = data || {};
  const uid = typeof d.uid === "string" && /^[A-Za-z0-9]{10,40}$/.test(d.uid) ? d.uid : null;
  const reason = REPORT_REASONS.indexOf(d.reason) >= 0 ? d.reason : null;
  const note = cleanBio(d.note).slice(0, REPORT_NOTE_MAX);
  return uid && reason ? { uid, reason, note } : null;
}

// A day counter kept on a document: {day, n}. Returns the next value, or null
// when the limit is reached.
function nextCount(counter, dayKey, limit) {
  const n = counter && counter.day === dayKey ? Number(counter.n) || 0 : 0;
  return n >= limit ? null : { day: dayKey, n: n + 1 };
}

module.exports = {
  AVATARS, BIO_MAX, EDITS_PER_DAY, REPORT_REASONS, REPORTS_PER_DAY,
  cleanBio, projectIntelligences, maxPointsFor, buildModerationRequest, readModeration, cleanReport, nextCount,
  MODERATION_MODEL: "claude-haiku-4-5-20251001",
};

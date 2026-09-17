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

// The avatars a person can pick. Emoji rather than uploaded pictures: nothing
// to moderate, nothing to store, and they read in every theme. The ids are
// what is stored; js/constants.js holds the same list for display, and
// tests/test-profile.js keeps the two identical.
const AVATARS = {
  a01: "🗡️", a02: "🛡️", a03: "🐉", a04: "🦅", a05: "🐺", a06: "🦁",
  a07: "🔥", a08: "⚡", a09: "🌙", a10: "⭐", a11: "👑", a12: "🎯",
  a13: "📚", a14: "🎨", a15: "🎵", a16: "🧠", a17: "💪", a18: "🧘",
  a19: "🏃", a20: "♟️", a21: "🌱", a22: "🌊", a23: "❄️", a24: "🪐",
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

// The public side of a saved state: each intelligence as its average trait
// level, and the three strongest traits. Rounded, so a profile does not
// rewrite itself over a hundredth of a level.
function projectIntelligences(state) {
  const types = Array.isArray(state && state.intTypes) ? state.intTypes : [];
  const intel = (state && state.intelligences) || {};
  const categories = types
    .filter((t) => t && t.key && intel[t.key] && Array.isArray(intel[t.key].traits))
    .map((t) => {
      const traits = intel[t.key].traits;
      const avg = traits.length ? traits.reduce((s, x) => s + (Number(x.level) || 0), 0) / traits.length : 0;
      return { key: t.key, short: String(t.short || t.key).slice(0, 8), color: t.color || null, avg: Math.round(avg * 10) / 10 };
    });
  const traits = [];
  types.forEach((t) => {
    ((intel[t.key] && intel[t.key].traits) || []).forEach((x) => {
      if (!x || !x.name) return;
      traits.push({ name: String(x.name).slice(0, 60), ar: x.ar ? String(x.ar).slice(0, 60) : null, short: String(t.short || t.key).slice(0, 8), level: Number(x.level) || 0 });
    });
  });
  traits.sort((a, b) => b.level - a.level || (a.name < b.name ? -1 : 1));
  return { categories, topTraits: traits.slice(0, 3).filter((x) => x.level > 0) };
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
  cleanBio, projectIntelligences, buildModerationRequest, readModeration, cleanReport, nextCount,
  MODERATION_MODEL: "claude-haiku-4-5-20251001",
};

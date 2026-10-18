// What every Claude call shares: the ledger of what calls cost, the daily caps,
// a readable account of an API failure, and the moderation check for text
// shown in public.
"use strict";

const admin = require("firebase-admin");
const Anthropic = require("@anthropic-ai/sdk");
const AI = require("../ai-config");
const AICOST = require("../ai-cost.js");
const PROFILE = require("../profile.js");
const { ANTHROPIC_API_KEY, HttpsError } = require("./base");

// The app's own ledger of what Claude calls cost (functions/ai-cost.js).
// Fire-and-forget: a failed write is logged and never fails the call it
// measured.
function billingRef(db) { return db.collection("config").doc("billing"); }
function trackAiCost(response) {
  try {
    if (!response || !response.usage) return;
    const micros = AICOST.costMicros(response.model, response.usage);
    if (micros == null) { console.warn("[ai-cost] no rates for " + response.model); return; }
    const db = admin.firestore();
    const now = new Date();
    const month = now.toISOString().slice(0, 7);
    const day = now.toISOString().slice(8, 10);
    const inc = admin.firestore.FieldValue.increment;
    Promise.all([
      db.collection("aiSpend").doc(month).set({ costMicros: inc(micros), calls: inc(1), days: { [day]: inc(micros) } }, { merge: true }),
      billingRef(db).set({ spentSinceAnchorMicros: inc(micros) }, { merge: true }),
    ]).catch((err) => console.error("[ai-cost] not recorded", err && err.message));
  } catch (err) {
    console.error("[ai-cost] failed", err && err.message);
  }
}

// Is this text fit to show publicly? Throws when it cannot be checked, rather
// than letting unchecked text through.
async function moderateText(kind, text) {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
  let verdict = null;
  try {
    const response = await client.messages.create(PROFILE.buildModerationRequest(PROFILE.MODERATION_MODEL, kind, text));
    trackAiCost(response);
    verdict = PROFILE.readModeration(response);
  } catch (err) {
    console.error("[moderation] call failed", err && err.message);
  }
  if (!verdict) throw new HttpsError("unavailable", "Couldn't check that right now. Please try again in a moment.");
  console.log("[moderation] " + kind + " " + (verdict.allowed ? "allowed" : "refused: " + verdict.reason));
  return verdict;
}

// Per-user daily quota, and beneath it one for everybody (aiBudget/{day},
// server-only, no match block). Each call costs real money, so these are
// abuse protection rather than product limits. Transactional so two rapid
// calls can't both read the same pre-increment count and slip past a cap.
//
// `details.code` is what the app translates; the message is the English
// fallback for anything older that only shows err.message.
// The global daily cap on AI valuations, set from the admin page
// (config/ai.globalCap); the constant in ai-config.js until it is set.
function aiCapRef(db) { return db.collection("config").doc("ai"); }
function capFrom(snap) {
  const n = snap && snap.exists ? Number(snap.data().globalCap) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : AI.GLOBAL_MAX_EVALUATIONS_PER_DAY;
}
const AI_CAP_MAX = 100000;

async function consumeEvaluationQuota(uid) {
  const db = admin.firestore();
  const ref = db.collection("aiUsage").doc(uid);
  const today = new Date().toISOString().slice(0, 10);
  const globalRef = db.collection("aiBudget").doc(today);
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const all = await tx.get(globalRef);
    const cap = capFrom(await tx.get(aiCapRef(db)));
    const data = doc.exists ? doc.data() : null;
    const count = data && data.date === today ? data.count || 0 : 0;
    if (count >= AI.MAX_EVALUATIONS_PER_DAY) {
      throw new HttpsError(
        "resource-exhausted",
        `You've hit today's limit of ${AI.MAX_EVALUATIONS_PER_DAY} task evaluations. Try again tomorrow.`,
        { code: "ai-user-limit", limit: AI.MAX_EVALUATIONS_PER_DAY }
      );
    }
    const used = all.exists ? Number(all.data().count) || 0 : 0;
    if (used >= cap) {
      console.warn("[ai-budget] global daily cap of " + cap + " reached; refusing " + uid.slice(0, 6));
      throw new HttpsError(
        "resource-exhausted",
        "The System has done all the valuing it can today. Try again tomorrow.",
        { code: "ai-global-limit" }
      );
    }
    tx.set(ref, { date: today, count: count + 1 }, { merge: true });
    tx.set(globalRef, { count: used + 1 }, { merge: true });
  });
}

// Turns an upstream failure into a sentence the person running the service can
// act on. These are the ones that actually happen, and each needs a different
// response — top it up, rotate the key, wait — which a raw JSON blob makes the
// reader work out from scratch every time. Anything unrecognised falls through
// to the original text rather than being flattened into a shrug.
function describeApiFailure(err) {
  const raw = String((err && err.message) || err);
  const status = err && err.status;
  if (/credit balance is too low/i.test(raw)) {
    return "The Anthropic API account is out of credit — top it up under Plans & Billing. Adding tasks is affected too, not just directives.";
  }
  if (status === 401 || /authentication|invalid x-api-key/i.test(raw)) {
    return "The Anthropic API key was rejected. Set ANTHROPIC_API_KEY again with firebase functions:secrets:set, then redeploy.";
  }
  if (status === 429 || /rate_?limit/i.test(raw)) {
    return "Rate-limited by the Anthropic API. This clears on its own — try again shortly.";
  }
  if (status === 529 || /overloaded/i.test(raw)) {
    return "The Anthropic API is overloaded right now. Try again in a moment.";
  }
  return raw.slice(0, 300);
}

module.exports = { AI_CAP_MAX, aiCapRef, billingRef, capFrom, consumeEvaluationQuota, describeApiFailure, moderateText, trackAiCost };

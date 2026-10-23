// Pricing a task, and a habit from the library, with Claude.
"use strict";

const admin = require("firebase-admin");
const Anthropic = require("@anthropic-ai/sdk");
const AI = require("../ai-config");
// The evaluation prompt lives in its own module so the eval harness can load
// it without booting Firebase — an eval that scores a copy measures the copy.
const PROMPT = require("../evaluation-prompt.js");
// The habit library. Its prices are decided here, never sent by the client.
const LIBRARY = require("../presets.js");
// What reported progress on a priced task is worth — see recordProgress.
const PROGRESS = require("../progress.js");
const { ANTHROPIC_API_KEY, HttpsError, isAdminRequest, onCall, requireEntitled } = require("../server/base");
const { consumeEvaluationQuota, describeApiFailure, trackAiCost } = require("../server/ai");

// ---------------------------------------------------------------------------
// evaluateTask — prices a quest or habit with the Claude API so users can't
// assign their own EXP. Runs server-side for two independent reasons: the API
// key must never reach the browser, and a client-side evaluator could simply
// be bypassed to fabricate a value, which would defeat the entire point.
//
// Habits are evaluated once, at creation, as a template — the per-repeat
// logging that follows stays local, instant, and free. That's what keeps
// this affordable at scale.
// ---------------------------------------------------------------------------

const { EVALUATION_SCHEMA, EVALUATION_SYSTEM, describeSentTraits } = PROMPT;

exports.evaluateTask = onCall({ secrets: [ANTHROPIC_API_KEY] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in to add a task.");
  }
  const who = await requireEntitled(request);
  const { title, description, kind, repeatsPerWeek, schedule, unit, targetAmount, quit } = request.data || {};
  if (typeof title !== "string" || !title.trim()) {
    throw new HttpsError("invalid-argument", "A title is required.");
  }
  // A description is mandatory — not for length (length is explicitly ruled
  // out as a pricing signal), but because a bare title is often ambiguous
  // and an unclear task gets priced conservatively, which isn't fair to the
  // person submitting it. Enforced here as well as in the UI so it can't be
  // bypassed by calling the function directly.
  if (typeof description !== "string" || description.trim().length < 10) {
    throw new HttpsError("invalid-argument", "Describe the task in at least a few words so it can be judged fairly.");
  }
  if (kind !== "quest" && kind !== "habit") {
    throw new HttpsError("invalid-argument", "kind must be 'quest' or 'habit'.");
  }

  await consumeEvaluationQuota(request.auth.uid, AI.evaluationsPerDay(who));

  // Truncate rather than reject — a user who writes a long description should
  // get a result, not an error, and the cap keeps the token cost bounded.
  const safeTitle = title.trim().slice(0, AI.MAX_TITLE_CHARS);
  const safeDescription = typeof description === "string"
    ? description.trim().slice(0, AI.MAX_DESCRIPTION_CHARS)
    : "";

  // The list comes with the request rather than being read from the stored
  // profile. Reading it server-side looked safer and was worse: the document
  // is only as current as the last successful save, and this call happens
  // *before* the task being priced is saved — so a trait added moments ago was
  // reliably invisible, and the model kept choosing from a list one short.
  //
  // Nothing is lost by trusting the client here. These names are the person's
  // own either way; the stored copy is no more authoritative than the live one,
  // and the list only decides which trait a point lands in, never the value.
  const traitList = describeSentTraits(request.data && request.data.traits);

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

  let response;
  try {
    // Built by the shared module, so the eval harness sends the same request
    // as production rather than a copy that can drift from it.
    response = await client.messages.create(PROMPT.buildEvaluationRequest(
      { kind, title: safeTitle, description: safeDescription, repeatsPerWeek, schedule, unit, targetAmount, quit: !!quit },
      request.data && request.data.traits
    ));
    trackAiCost(response);
  } catch (err) {
    console.error("[evaluateTask] Claude API call failed", err);
    throw new HttpsError(
      "internal",
      "The system couldn't evaluate that right now. Please try again.",
      isAdminRequest(request) ? { reason: describeApiFailure(err) } : undefined
    );
  }

  if (response.stop_reason === "refusal") {
    throw new HttpsError("invalid-argument", "That task couldn't be evaluated. Try describing it differently.");
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) {
    throw new HttpsError("internal", "The system returned an unreadable evaluation. Please try again.");
  }

  let parsed;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch (err) {
    console.error("[evaluateTask] unparseable response", textBlock.text);
    throw new HttpsError("internal", "The system returned an unreadable evaluation. Please try again.");
  }

  // Clamp server-side regardless of what came back — the schema constrains the
  // shape, not the sanity of the number.
  const pt = Math.max(1, Math.min(5000, Math.round(Number(parsed.pt) || 1)));
  const validKeys = new Set(AI.INTELLIGENCE_CATEGORIES.map((c) => c.key));
  const types = Array.isArray(parsed.types) ? parsed.types.filter((t) => validKeys.has(t)).slice(0, 2) : [];
  // Snapped back onto the person's own list before it leaves here. A name the
  // client cannot match does not fail loudly: the point lands on the weakest
  // trait in that category while the card shows the name the model gave. If
  // nothing on the list is close enough, the target is dropped and the task
  // names its category alone — the card then claims no trait, rather than
  // claiming one that was never credited.
  const sentTraits = (request.data && Array.isArray(request.data.traits)) ? request.data.traits : [];
  const namesFor = (cat) => {
    const entry = sentTraits.find((e) => e && e.key === cat);
    return entry && Array.isArray(entry.names) ? entry.names : [];
  };
  const traitTargets = Array.isArray(parsed.traitTargets)
    ? parsed.traitTargets
        .filter((t) => t && validKeys.has(t.category) && typeof t.trait === "string")
        .map((t) => {
          const names = namesFor(t.category);
          const snapped = names.length ? PROMPT.snapTraitName(t.trait, names) : t.trait;
          return snapped ? { category: t.category, trait: String(snapped).slice(0, 60) } : null;
        })
        .filter(Boolean)
        .slice(0, 2)
    : [];

  // Keep a record of what was priced, so a journal entry can later be checked
  // against a figure this function actually issued rather than one the client
  // merely asserts. Without it "the AI decided the value" is a claim the server
  // has no way to confirm afterwards, since the price only ever existed in a
  // response and in the task the client then wrote for itself.
  // How long the work honestly takes, clamped and floored here rather than
  // taken as returned — see cleanEstimates in progress.js. Stored on the
  // price, which is the record the server pays from; nothing reads them yet.
  const estimates = PROGRESS.cleanEstimates(parsed, pt, kind);

  const priceRef = admin.firestore()
    .collection("aiPrices").doc(request.auth.uid).collection("prices").doc();
  await priceRef.set({
    pt,
    title: String(title || "").slice(0, 120),
    kind: kind === "habit" ? "habit" : "quest",
    // Which intelligences the evaluator said this builds — what a race on one
    // intelligence counts from (functions/races.js).
    types,
    effortHours: estimates.effortHours,
    minDays: estimates.minDays,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    pt,
    types,
    traitTargets,
    effortHours: estimates.effortHours,
    minDays: estimates.minDays,
    priceId: priceRef.id,
    rationale: typeof parsed.rationale === "string" ? parsed.rationale.slice(0, 300) : "",
    model: AI.MODEL,
  };
});

// A habit from the library, priced once for everybody.
//
// The point of the library is that adding a habit is instant. Calling the
// evaluator on every tap would make it neither instant nor cheap, and asking
// the same question about the same habit a hundred times would get a hundred
// answers within a few EXP of each other — noise presented as judgment.
//
// So the price is cached per habit and schedule, globally. The first person to
// add "Drink water, every day" pays for the call; everyone after gets the
// same number, which is also the honest outcome: two people adding the same
// habit on the same schedule should not be worth different amounts.
//
// The client never sends a price, only an id. Everything a task is worth comes
// from the catalogue in presets.js and the cache below, and the per-user price
// record is written here exactly as evaluateTask writes it, so a journal entry
// from a library habit can be verified the same way as any other.
exports.priceLibraryHabit = onCall({ secrets: [ANTHROPIC_API_KEY] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in to add a habit.");
  }
  const who = await requireEntitled(request);
  const preset = LIBRARY.byId((request.data || {}).presetId);
  if (!preset) {
    throw new HttpsError("invalid-argument", "That habit isn't in the library.");
  }
  // The schedule is rebuilt from the request rather than trusted: it decides
  // both the cache key and the price.
  const schedule = LIBRARY.sanitizeSchedule((request.data || {}).schedule || preset.schedule);
  const cacheKey = preset.id + "__" + LIBRARY.scheduleKey(schedule);

  const db = admin.firestore();
  const cacheRef = db.collection("libraryPrices").doc(cacheKey);
  const cached = await cacheRef.get();

  let pt;
  // The time estimates ride along with the cached price: two people adding the
  // same habit on the same schedule must get the same answer, this one
  // included. A row cached before these existed has none, and 0/0 is the
  // honest reading of "never estimated" — the next miss fills them in.
  let estimates = { effortHours: 0, minDays: 0 };
  let fromCache = false;
  if (cached.exists && Number(cached.data().pt) > 0) {
    pt = Number(cached.data().pt);
    estimates = PROGRESS.cleanEstimates(cached.data(), pt, "habit");
    fromCache = true;
  } else {
    // Only a miss costs anything, so only a miss spends the daily quota.
    await consumeEvaluationQuota(request.auth.uid, AI.evaluationsPerDay(who));

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
    let response;
    try {
      response = await client.messages.create({
        model: AI.MODEL,
        max_tokens: 8000,
        system: EVALUATION_SYSTEM,
        output_config: {
          effort: "low",
          format: { type: "json_schema", schema: EVALUATION_SCHEMA },
        },
        // The same builder production uses for a hand-written task, so a
        // library habit and a typed one are priced by the same words in the
        // same order. No trait list is sent: which traits a preset builds is
        // already decided in the catalogue, and sending one person's own
        // traits would make the shared price theirs alone.
        messages: [{ role: "user", content: PROMPT.buildUserMessage({
          kind: "habit",
          title: preset.title,
          description: preset.description,
          schedule,
          unit: preset.unit,
          targetAmount: preset.targetAmount,
        }, []) }],
      });
      trackAiCost(response);
    } catch (err) {
      console.error("[priceLibraryHabit] Claude API call failed", err);
      throw new HttpsError(
        "internal",
        "The system couldn't price that right now. Please try again.",
        isAdminRequest(request) ? { reason: describeApiFailure(err) } : undefined
      );
    }

    const textBlock = (response.content || []).find((b) => b.type === "text");
    let parsed = null;
    if (textBlock) {
      try { parsed = JSON.parse(textBlock.text); } catch (err) { parsed = null; }
    }
    if (!parsed) {
      console.error("[priceLibraryHabit] unreadable response", textBlock && textBlock.text);
      throw new HttpsError("internal", "The system returned an unreadable evaluation. Please try again.");
    }
    pt = Math.max(1, Math.min(5000, Math.round(Number(parsed.pt) || 1)));
    estimates = PROGRESS.cleanEstimates(parsed, pt, "habit");

    await cacheRef.set({
      pt,
      effortHours: estimates.effortHours,
      minDays: estimates.minDays,
      presetId: preset.id,
      schedule,
      model: AI.MODEL,
      rationale: typeof parsed.rationale === "string" ? parsed.rationale.slice(0, 300) : "",
      at: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // The per-user record that makes the grant checkable later. Written on a
  // cache hit too — the check is per EXP entry, not per price decision.
  const priceRef = db.collection("aiPrices").doc(request.auth.uid).collection("prices").doc();
  await priceRef.set({
    pt,
    title: preset.title,
    kind: "habit",
    types: Array.isArray(preset.types) ? preset.types : [],
    library: preset.id,
    effortHours: estimates.effortHours,
    minDays: estimates.minDays,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    pt,
    effortHours: estimates.effortHours,
    minDays: estimates.minDays,
    priceId: priceRef.id,
    // Editorial, from the catalogue — not something the model was asked.
    types: preset.types,
    traitTargets: preset.traitTargets,
    unit: preset.unit,
    targetAmount: preset.targetAmount,
    schedule,
    cached: fromCache,
    model: AI.MODEL,
  };
});

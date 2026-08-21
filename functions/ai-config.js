// Everything tunable about the AI task evaluator lives here, so changing the
// model or the pricing calibration is a one-line edit + redeploy, not a hunt
// through function code.
"use strict";

// Swap this to trade cost for judgment quality. Rough cost per evaluation:
//   claude-haiku-4-5 ≈ $0.001   (cheapest)
//   claude-sonnet-5  ≈ $0.003   (current — good balance)
//   claude-opus-5    ≈ $0.005   (sharpest judgment)
const MODEL = "claude-sonnet-5";

// Hard caps on what we'll send to the API. These bound the per-call cost and
// stop someone pasting a novel into the description field to run up the bill.
const MAX_TITLE_CHARS = 120;
const MAX_DESCRIPTION_CHARS = 600;

// Per-user daily ceiling on evaluations. Each one costs real money, so this is
// abuse protection, not a product limit — a normal user adding a few tasks a
// day never reaches it.
const MAX_EVALUATIONS_PER_DAY = 40;

// The EXP scale the model has to price against. These are the app's real seed
// tasks (js/constants.js), which are the user's own calibration from their
// original Notion workspace — the model anchors to these rather than inventing
// its own scale, so values stay consistent across users and over time.
const CALIBRATION = `
A level is 100 EXP. Points (Pt) equal EXP directly.

One-off quest reference points:
- "Performing daily habits" (Long Term, ongoing routine) = 100
- "Writing with the other hand" (Medium Term, a novelty skill) = 300
- "Reading a full book" (Long Term, sustained effort) = 500
- "Committing to exercise for two weeks" (Short Term, hard discipline) = 1000
- "Reaching fast touch-typing proficiency" (Long Term, months of practice) = 2000

Recurring habit reference points (value is per single repeat, not per week):
- "Drink 2L of water" (trivial, ~1 minute) = 20
- "One 30-minute deep work session" (real focus, moderate effort) = 40

Guidance:
- Price by genuine effort, difficulty, and time investment — not by how
  impressive the task sounds.
- A trivial or vague task should land near the bottom of the scale.
- Nothing routine should exceed 2000. Reserve values above that for
  exceptional, months-long undertakings.
- Habit repeats are small numbers (10-100). A habit repeat is one occurrence,
  so it must be worth far less than a one-off quest.
`.trim();

// The 8 built-in intelligence categories, mirrored from js/constants.js. Kept
// as an explicit list (rather than imported) because the function has no
// access to the browser-side SYS namespace.
const INTELLIGENCE_CATEGORIES = [
  { key: "self", name: "Self-Intelligence — self-motivation, reflection, goal-setting, self-evaluation, time management" },
  { key: "social", name: "Social Intelligence — volunteering, social interaction, group activities, communication" },
  { key: "linguistic", name: "Linguistic Intelligence — reading, writing, speaking, language learning" },
  { key: "logical", name: "Logical-Mathematical Intelligence — data analysis, puzzles, programming, coaching/teaching" },
  { key: "bodily", name: "Bodily-Kinesthetic Intelligence — yoga, sports, self-defense, handcrafts, exercise, acting" },
  { key: "natural", name: "Natural Intelligence — survival skills, outdoor activity, environment, farming/gardening" },
  { key: "visual", name: "Visual-Spatial Intelligence — 3D planning, graphic design, photography, drawing" },
  { key: "musical", name: "Musical Intelligence — playing an instrument, active listening, vocal training, composition" },
];

module.exports = {
  MODEL,
  MAX_TITLE_CHARS,
  MAX_DESCRIPTION_CHARS,
  MAX_EVALUATIONS_PER_DAY,
  CALIBRATION,
  INTELLIGENCE_CATEGORIES,
};

// Everything tunable about the AI task evaluator lives here, so changing the
// model or the pricing calibration is a one-line edit + redeploy, not a hunt
// through function code.
"use strict";

// Swap this to trade cost for judgment quality. What one evaluation cost on
// claude-sonnet-5 at effort low, measured over the eval set (evals/results,
// 39 calls for $0.22-0.24, before prompt caching): about $0.006 — roughly 2,500
// input tokens and 95 output. Other models scale with their per-token prices:
// claude-haiku-4-5 about half, claude-opus-5 about two and a half times. Run
// evals/run.js for the current figure; it reports cost per call.
const MODEL = "claude-sonnet-5";

// Hard caps on what we'll send to the API. These bound the per-call cost and
// stop someone pasting a novel into the description field to run up the bill.
const MAX_TITLE_CHARS = 120;
const MAX_DESCRIPTION_CHARS = 600;

// Per-user daily ceiling on evaluations. Each one costs real money, so this is
// abuse protection, not a product limit — a normal user adding a few tasks a
// day never reaches it. The weekly directives draw from the same allowance,
// which costs one of these once a week.
const MAX_EVALUATIONS_PER_DAY = 20;

// The EXP scale the model has to price against. These are the app's real seed
// tasks (js/constants.js), which are the user's own calibration from their
// original Notion workspace — the model anchors to these rather than inventing
// its own scale, so values stay consistent across users and over time.
const CALIBRATION = `
A level is 100 EXP. Points (Pt) equal EXP directly.

One-off quest reference points (judge scope from the work described, not from
any label the user attached to it):
- "Performing daily habits" (a loose ongoing routine) = 100
- "Writing with the other hand" (a novelty skill, some practice) = 300
- "Reading a full book" (days to weeks of sustained effort) = 500
- "Committing to exercise for two weeks" (sustained daily discipline) = 1000
- "Reaching fast touch-typing proficiency" (months of deliberate practice) = 2000

Recurring habit reference points (value is per single repeat, not per week):
- "Drink 2L of water" (trivial, ~1 minute) = 15
- "One 30-minute deep work session" (real focus, moderate effort) = 30
- "A full 90-minute gym session" (hard, sustained) = 50

Guidance:
- Price by genuine effort, difficulty, and time investment — not by how
  impressive the task sounds.
- A trivial or vague task should land near the bottom of the scale.
- Nothing routine should exceed 2000. Reserve values above that for
  exceptional, months-long undertakings.

Habits need a harder line than one-off quests, because a habit repeats
indefinitely: a habit worth 40 done daily earns more in a month than reading
a full book. So:
- Habit repeats are small numbers. 10-30 covers most habits; 50 is already a
  demanding session; only something genuinely gruelling approaches 80.
- Never exceed 100 for a single habit repeat.
- Before settling on a habit value, multiply it by the weekly repeat count
  and sanity-check that a week of it is not worth more than a substantial
  one-off quest. If it is, lower it.

How long it honestly takes. Two more numbers, and they are not the price:
- effortHours: the FEWEST hours of actual hands-on work a capable person could
  plausibly need. The floor, not the average and not the comfortable estimate.
  For a habit it is ONE repeat: a thirty-minute session is 0.5, a two-minute
  stretch about 0.03. Fractions are expected.
- minDays: the FEWEST whole calendar days that must pass before it can honestly
  be finished. 0 for almost everything. Above 0 only when the task is spread
  over time by its own nature: a month without sugar is 30, exercising every
  day for two weeks is 14, a sourdough starter is 2. A long quest that could in
  principle be crammed into one very long day stays 0.
- The two are independent. An abstinence challenge has almost no hands-on hours
  and many days; building a bookshelf has hours and no days.
- Sanity check for a one-off quest: if it is worth more than about 250 per hour
  of effort, either it needs more hours or it needs a minDays that explains why
  it cannot be rushed.
- Do not pad either number "to be safe". These decide when somebody is allowed
  to record work they have actually done, and an inflated estimate locks an
  honest person out of their own progress.
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

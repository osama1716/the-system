// The habit library: a fixed catalogue of common habits, with the wording the
// model is shown when one of them has to be priced.
//
// Why this lives on the server as well as in the client: the price of a habit
// must not come from the client. Every EXP entry can name the price it was
// paid against (see the priceId check in index.js), and a price the client
// simply asserts is worth nothing as a check. So the client sends an id, and
// the server decides what that id is worth.
//
// What is editorial and what is judged, kept apart on purpose:
//
//   editorial — title, emoji, unit, amount, default schedule, and which
//               intelligences and traits the habit builds. These are taxonomy
//               decisions with a right answer; asking a model to re-derive
//               "drinking water is bodily" every time buys nothing. Every
//               category and trait named here is one from the app's own
//               index, never a new one invented for a preset.
//   judged    — `pt`, the EXP one repeat is worth. That is the number that has
//               to sit on the same scale as every hand-written task, so it
//               comes from the same evaluator, and is then cached per habit
//               and schedule so it is asked once rather than once per person
//               per tap.
//
// Ids are permanent: a stored price and a user's task both point at one.
// Changing what an id means would silently reprice somebody's habit.

const PRESETS = [
  // ---- body ----
  {
    id: "water",
    category: "body",
    emoji: "💧",
    title: "Drink water",
    description: "Drink two litres of water across the day, spread out rather than all at once.",
    unit: "L",
    targetAmount: 2,
    schedule: { type: "daily" },
    types: ["bodily"],
    traitTargets: [{ category: "bodily", trait: "Health" }],
  },
  {
    id: "steps",
    category: "body",
    emoji: "🚶",
    title: "Walk 8,000 steps",
    description: "Walk eight thousand steps over the course of the day, on top of normal moving around.",
    unit: "steps",
    targetAmount: 8000,
    schedule: { type: "daily" },
    types: ["bodily"],
    traitTargets: [{ category: "bodily", trait: "Daily exercise" }],
  },
  {
    id: "workout",
    category: "body",
    emoji: "🏋️",
    title: "Train",
    description: "A deliberate training session of about forty-five minutes: weights, a class, or hard cardio.",
    unit: "min",
    targetAmount: 45,
    schedule: { type: "weekdays", days: [1, 3, 5] },
    types: ["bodily"],
    traitTargets: [{ category: "bodily", trait: "Sports" }],
  },
  {
    id: "stretch",
    category: "body",
    emoji: "🧘",
    title: "Stretch",
    description: "Ten minutes of stretching or mobility work, enough to loosen up rather than a full session.",
    unit: "min",
    targetAmount: 10,
    schedule: { type: "daily" },
    types: ["bodily"],
    traitTargets: [{ category: "bodily", trait: "Yoga" }],
  },
  {
    id: "sleepEarly",
    category: "body",
    emoji: "🌙",
    title: "Sleep on time",
    description: "Be in bed by a set hour with the phone away, rather than drifting past midnight.",
    unit: "times",
    targetAmount: 1,
    schedule: { type: "daily" },
    types: ["bodily", "self"],
    traitTargets: [{ category: "bodily", trait: "Health" }, { category: "self", trait: "Self-motivation" }],
  },
  {
    id: "cookHome",
    category: "body",
    emoji: "🍳",
    title: "Cook at home",
    description: "Cook a proper meal at home instead of ordering in or eating out.",
    unit: "times",
    targetAmount: 1,
    schedule: { type: "perWeek", n: 4 },
    types: ["bodily"],
    traitTargets: [{ category: "bodily", trait: "Health" }],
  },
  {
    id: "outdoors",
    category: "body",
    emoji: "🌿",
    title: "Get outdoors",
    description: "Spend an hour outside away from buildings — a park, a trail, the sea — not a walk between errands.",
    unit: "min",
    targetAmount: 60,
    schedule: { type: "perWeek", n: 1 },
    types: ["natural", "bodily"],
    traitTargets: [{ category: "natural", trait: "Outdoor activities" }],
  },

  // ---- mind ----
  {
    id: "read",
    category: "mind",
    emoji: "📚",
    title: "Read",
    description: "Read twenty pages of a book, attentively enough to follow the argument.",
    unit: "pages",
    targetAmount: 20,
    schedule: { type: "daily" },
    types: ["linguistic"],
    traitTargets: [{ category: "linguistic", trait: "Reading" }],
  },
  {
    id: "meditate",
    category: "mind",
    emoji: "🕯️",
    title: "Meditate",
    description: "Ten minutes of sitting meditation, following the breath and returning to it when the mind wanders.",
    unit: "min",
    targetAmount: 10,
    schedule: { type: "daily" },
    types: ["self"],
    traitTargets: [{ category: "self", trait: "Reflection & thinking" }],
  },
  {
    id: "journal",
    category: "mind",
    emoji: "📝",
    title: "Journal",
    description: "Write a page about the day: what happened, what it felt like, and what to do differently.",
    unit: "times",
    targetAmount: 1,
    schedule: { type: "daily" },
    types: ["self", "linguistic"],
    traitTargets: [{ category: "self", trait: "Self-evaluation" }, { category: "linguistic", trait: "Writing" }],
  },
  {
    id: "language",
    category: "mind",
    emoji: "🗣️",
    title: "Practise a language",
    description: "Fifteen minutes of deliberate practice in a language being learned: vocabulary, listening, or speaking.",
    unit: "min",
    targetAmount: 15,
    schedule: { type: "daily" },
    types: ["linguistic"],
    traitTargets: [{ category: "linguistic", trait: "Language learning" }],
  },
  {
    id: "noPhoneMorning",
    category: "mind",
    emoji: "📵",
    title: "Phone-free first hour",
    description: "Keep off the phone for the first hour after waking: no feeds, no messages, no news.",
    unit: "times",
    targetAmount: 1,
    schedule: { type: "daily" },
    types: ["self"],
    traitTargets: [{ category: "self", trait: "Self-motivation" }],
  },

  // ---- work ----
  {
    id: "deepWork",
    category: "work",
    emoji: "🎯",
    title: "Deep work",
    description: "One uninterrupted hour on the hardest thing on the list, with notifications off.",
    unit: "min",
    targetAmount: 60,
    schedule: { type: "weekdays", days: [1, 2, 3, 4, 5] },
    types: ["self"],
    traitTargets: [{ category: "self", trait: "Time management" }],
  },
  {
    id: "study",
    category: "work",
    emoji: "📖",
    title: "Study",
    description: "Forty-five minutes of studying course material: reading, problems, or working through notes.",
    unit: "min",
    targetAmount: 45,
    schedule: { type: "perWeek", n: 5 },
    types: ["self", "logical"],
    traitTargets: [{ category: "self", trait: "Time management" }],
  },
  {
    id: "code",
    category: "work",
    emoji: "💻",
    title: "Build something",
    description: "Forty-five minutes writing code or building on a personal project, outside of work hours.",
    unit: "min",
    targetAmount: 45,
    schedule: { type: "perWeek", n: 4 },
    types: ["logical"],
    traitTargets: [{ category: "logical", trait: "Programming" }],
  },
  {
    id: "planDay",
    category: "work",
    emoji: "🗒️",
    title: "Plan the day",
    description: "Five minutes at the start of the day deciding what actually has to get done, and in what order.",
    unit: "min",
    targetAmount: 5,
    schedule: { type: "weekdays", days: [1, 2, 3, 4, 5] },
    types: ["self"],
    traitTargets: [{ category: "self", trait: "Personal goal-setting" }],
  },
  {
    id: "weekReview",
    category: "work",
    emoji: "🧭",
    title: "Weekly review",
    description: "Twenty minutes at the end of the week looking back at what moved and what stalled, and setting the next week.",
    unit: "min",
    targetAmount: 20,
    schedule: { type: "perWeek", n: 1 },
    types: ["self"],
    traitTargets: [{ category: "self", trait: "Self-evaluation" }],
  },

  // ---- faith ----
  {
    id: "quran",
    category: "faith",
    emoji: "📗",
    title: "Read Qur'an",
    description: "Fifteen minutes of reading the Qur'an, unhurried and with attention to the meaning.",
    unit: "min",
    targetAmount: 15,
    schedule: { type: "daily" },
    types: ["linguistic", "self"],
    traitTargets: [{ category: "linguistic", trait: "Reading" }, { category: "self", trait: "Reflection & thinking" }],
  },
  {
    id: "dhikr",
    category: "faith",
    emoji: "📿",
    title: "Morning remembrance",
    description: "The morning remembrances, said once through with attention rather than rushed.",
    unit: "times",
    targetAmount: 1,
    schedule: { type: "daily" },
    types: ["self"],
    traitTargets: [{ category: "self", trait: "Reflection & thinking" }],
  },

  // ---- people ----
  {
    id: "callFamily",
    category: "people",
    emoji: "📞",
    title: "Call family",
    description: "A real phone call to a parent or close relative, long enough to actually catch up.",
    unit: "times",
    targetAmount: 1,
    schedule: { type: "perWeek", n: 2 },
    types: ["social"],
    traitTargets: [{ category: "social", trait: "Social interaction" }],
  },
  {
    id: "seeFriends",
    category: "people",
    emoji: "🤝",
    title: "See a friend",
    description: "Meet a friend in person — coffee, a walk, a meal — rather than only messaging.",
    unit: "times",
    targetAmount: 1,
    schedule: { type: "perWeek", n: 1 },
    types: ["social"],
    traitTargets: [{ category: "social", trait: "Participating in social activities" }],
  },
  {
    id: "volunteer",
    category: "people",
    emoji: "🫱",
    title: "Volunteer",
    description: "Two hours of volunteering: helping at a charity, a mosque, a shelter, or a community project.",
    unit: "hr",
    targetAmount: 2,
    schedule: { type: "perMonth", n: 1 },
    types: ["social"],
    traitTargets: [{ category: "social", trait: "Volunteering" }],
  },

  // ---- home ----
  {
    id: "tidy",
    category: "home",
    emoji: "🧹",
    title: "Tidy up",
    description: "Ten minutes putting the place back in order: surfaces cleared, dishes done, things away.",
    unit: "min",
    targetAmount: 10,
    schedule: { type: "daily" },
    types: ["self"],
    traitTargets: [{ category: "self", trait: "Self-motivation" }],
  },
  {
    id: "laundry",
    category: "home",
    emoji: "🧺",
    title: "Laundry",
    description: "A full round of laundry: washed, dried, folded and put away, not left in the machine.",
    unit: "times",
    targetAmount: 1,
    schedule: { type: "perWeek", n: 1 },
    types: ["self"],
    traitTargets: [{ category: "self", trait: "Self-motivation" }],
  },
  {
    id: "budget",
    category: "home",
    emoji: "🧾",
    title: "Check the budget",
    description: "Go through the month's spending against what was planned, and adjust the plan.",
    unit: "times",
    targetAmount: 1,
    schedule: { type: "perMonth", n: 1 },
    types: ["logical", "self"],
    traitTargets: [{ category: "logical", trait: "Data analysis" }],
  },

  // ---- craft ----
  {
    id: "instrument",
    category: "craft",
    emoji: "🎹",
    title: "Practise an instrument",
    description: "Twenty minutes of practice on an instrument: scales, a piece, or working through a difficult passage.",
    unit: "min",
    targetAmount: 20,
    schedule: { type: "perWeek", n: 4 },
    types: ["musical"],
    traitTargets: [{ category: "musical", trait: "Playing an instrument" }],
  },
  {
    id: "draw",
    category: "craft",
    emoji: "✏️",
    title: "Draw",
    description: "Fifteen minutes of drawing from life or from imagination, finished or not.",
    unit: "min",
    targetAmount: 15,
    schedule: { type: "perWeek", n: 3 },
    types: ["visual"],
    traitTargets: [{ category: "visual", trait: "Drawing" }],
  },
  {
    id: "photo",
    category: "craft",
    emoji: "📷",
    title: "Take photographs",
    description: "Go out and shoot deliberately for half an hour, choosing what to frame rather than snapping what passes.",
    unit: "min",
    targetAmount: 30,
    schedule: { type: "perWeek", n: 1 },
    types: ["visual"],
    traitTargets: [{ category: "visual", trait: "Photography" }],
  },
];

const CATEGORIES = ["body", "mind", "work", "faith", "people", "home", "craft"];

const BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

function byId(id) {
  return typeof id === "string" ? BY_ID.get(id) || null : null;
}

// A short, stable string for one schedule, used as the cache key. Built from
// the fields that actually change the price, in a fixed order — an object's
// key order is not something to hang a cache on. The anchor date is
// deliberately left out: "every 3 days" is worth the same whichever day it
// starts on, and including it would give every user their own cache entry.
function scheduleKey(schedule) {
  const s = schedule && typeof schedule === "object" ? schedule : {};
  switch (s.type) {
    case "weekdays": return "weekdays-" + (s.days || []).join(".");
    case "perWeek": return "perWeek-" + s.n;
    case "monthDays": return "monthDays-" + (s.days || []).join(".");
    case "perMonth": return "perMonth-" + s.n;
    case "interval": return "interval-" + s.every;
    case "perInterval": return "perInterval-" + s.n + "-" + s.every;
    default: return "daily";
  }
}

// The client sends a schedule, so it is rebuilt here from scratch rather than
// trusted: this one decides a cache key and a price.
function sanitizeSchedule(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const int = (v, lo, hi, fallback) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
  };
  const list = (v, lo, hi) => {
    const out = [];
    (Array.isArray(v) ? v : []).forEach((x) => {
      const n = Math.round(Number(x));
      if (Number.isFinite(n) && n >= lo && n <= hi && out.indexOf(n) < 0) out.push(n);
    });
    return out.sort((a, b) => a - b);
  };
  switch (s.type) {
    case "weekdays": {
      const days = list(s.days, 0, 6);
      return days.length ? { type: "weekdays", days } : { type: "daily" };
    }
    case "perWeek": return { type: "perWeek", n: int(s.n, 1, 7, 3) };
    case "monthDays": {
      const days = list(s.days, 1, 31);
      return { type: "monthDays", days: days.length ? days : [1] };
    }
    case "perMonth": return { type: "perMonth", n: int(s.n, 1, 31, 4) };
    case "interval": return { type: "interval", every: int(s.every, 2, 365, 2) };
    case "perInterval": {
      const every = int(s.every, 2, 365, 10);
      return { type: "perInterval", every, n: int(s.n, 1, every, 1) };
    }
    default: return { type: "daily" };
  }
}

module.exports = { PRESETS, CATEGORIES, byId, scheduleKey, sanitizeSchedule };

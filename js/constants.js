// Shared constants + default/seed data. Attaches to window.SYS namespace.
(function (SYS) {
  "use strict";

  SYS.STORAGE_KEY = "the-system:v1";

  SYS.RANKS = ["G", "F", "E", "D", "C", "B", "A", "S"];

  // Priority/task-type badges use only the two functional accents the design
  // language defines (gold = notable, rust = urgent) plus dim for low-key —
  // no per-value rainbow, matching the single-accent system below.
  SYS.PRIORITY_COLOR = { Low: "dim", Medium: "gold", High: "rust" };

  // Two rules of the game, and deliberately not settings.
  //
  // A task's value IS its EXP — 500 Pt is 500 EXP is five levels. There used to
  // be a divisor between them; it was always 1, so it only ever added a second
  // name for one number.
  //
  // Every level grants this many skill points, distributed by the system to the
  // trait the work actually built. It lives here rather than in a user's
  // settings because a player who can set their own points-per-level is not
  // playing the same game as everyone else — and with a public ranking, that
  // stopped being a private matter. Changing it is a code edit, on purpose.
  // What a single level costs, per rank, in the order of SYS.RANKS.
  //
  // Every rank is 100 levels — that part is fixed, so "rank" always means the
  // same distance. What changes is the price of a level inside it. A flat
  // price made the first rank-up a two-and-a-half month wait, which is long
  // enough that most people would never once see the headline mechanic of the
  // app fire; and it made the last rank arrive too easily to mean much. This
  // curve puts the first promotion within a fortnight and keeps S about a year
  // and a half out.
  SYS.RANK_LEVEL_EXP = [15, 30, 50, 75, 100, 130, 170, 200];

  // Skill points per 100 EXP, per rank.
  //
  // Measured against work done, not levels gained. Tying them to levels looked
  // equivalent and was not: a G-Rank level costs 15 EXP and an S-Rank one 200,
  // so a point per level meant the opening of the game paid nearly seven times
  // better than the end of it. A month of drinking water — the cheapest habit
  // in the app — came out as the strongest physical trait a person had.
  //
  // Levels stay cheap and frequent, because that is what they are for: the
  // sense of moving. Growth is what the work earns.
  SYS.RANK_POINTS_PER_100_EXP = [1, 1, 1, 1, 2, 2, 2, 2];

  // Both accept a rank letter or an index, since the player carries the letter
  // and the EXP loop carries the index.
  function rankIndex(rank) {
    if (typeof rank === "number") return Math.max(0, Math.min(SYS.RANKS.length - 1, rank));
    const i = SYS.RANKS.indexOf(rank);
    return i < 0 ? 0 : i;
  }
  SYS.rankIndex = rankIndex;
  SYS.levelCost = function (rank) { return SYS.RANK_LEVEL_EXP[rankIndex(rank)]; };
  // What one level is worth in points, at a given rank: the EXP that level
  // costs, at that rank's rate. Awarding it per level rather than per delta is
  // what keeps undo exact — the level history already knows how to reverse a
  // level, fractions included.
  SYS.pointsForLevel = function (rank) {
    const i = rankIndex(rank);
    return SYS.RANK_LEVEL_EXP[i] * SYS.RANK_POINTS_PER_100_EXP[i] / 100;
  };
  SYS.LEVELS_PER_RANK = 100;

  // ---------------------------------------------------------------------
  // Per-task identity: an emoji and a colour.
  //
  // The colour is stored as a HUE, not a hex. Seven themes ship, four dark
  // and three light, and a fixed teal that reads well on near-black is muddy
  // on cream. A hue is rendered through the theme at an alpha the theme
  // chooses, so one stored value stays legible everywhere — and a theme added
  // later needs no migration of everyone's tasks.
  SYS.TASK_HUES = [43, 14, 350, 280, 210, 168, 96, 28];

  // Everything already in the app predates this, and a screen of identical
  // grey cards would be a worse first impression than colours nobody picked.
  // So an unset task gets a stable one derived from its own title: the same
  // task is always the same colour, on every device, with nothing stored.
  function hashString(s) {
    let h = 0;
    for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) >>> 0;
    return h;
  }
  // Whether a hue was actually chosen. Deliberately not Number.isFinite of a
  // coerced value: Number(null) is 0 and Number("") is 0, so both would pass
  // as a real choice and pin the task to a red nobody picked.
  SYS.hasHue = function (v) { return typeof v === "number" && Number.isFinite(v); };

  SYS.taskHue = function (task) {
    if (task && SYS.hasHue(task.hue)) return task.hue;
    return SYS.TASK_HUES[hashString((task && task.title) || "") % SYS.TASK_HUES.length];
  };

  // A small, deliberately boring default set. The picker offers more; this is
  // only what an unlabelled task falls back to, matched on words that appear
  // in the kind of thing people actually track.
  const ICON_HINTS = [
    [/read|book|قراءة|كتاب/i, "📖"], [/water|drink|ماء|شرب/i, "💧"],
    [/gym|workout|exercise|رياضة|تمرين/i, "🏋️"], [/run|jog|walk|ركض|مشي/i, "🏃"],
    [/sleep|نوم/i, "😴"], [/code|program|python|برمجة/i, "💻"],
    [/write|writing|كتابة/i, "✍️"], [/study|learn|course|دراسة|تعلم/i, "🎓"],
    [/pray|quran|صلاة|قرآن/i, "🕌"], [/music|guitar|piano|موسيقى/i, "🎵"],
    [/language|english|japanese|لغة|انجليزي/i, "🗣️"], [/meditat|breath|تأمل/i, "🧘"],
    [/food|eat|diet|أكل|طعام/i, "🥗"], [/chess|شطرنج/i, "♟️"],
    [/type|typing|keyboard|طباعة/i, "⌨️"],
  ];
  // What the picker offers. Kept short on purpose: a full emoji keyboard is
  // a worse choice than a page of plausible ones, and anything not here can
  // still be typed into the field.
  SYS.ICON_CHOICES = [
    "◈", "📖", "💧", "🏋️", "🏃", "🚶", "😴", "💻", "✍️", "🎓",
    "🕌", "🧘", "🎵", "🎸", "🗣️", "🥗", "🍎", "♟️", "⌨️", "🎨",
    "📷", "🌱", "🧹", "💰", "☕", "🚭", "📵", "⏰", "🔥", "⭐",
  ];

  SYS.taskIcon = function (task) {
    if (task && typeof task.icon === "string" && task.icon.trim()) return task.icon.trim();
    const title = (task && task.title) || "";
    const hit = ICON_HINTS.find(([re]) => re.test(title));
    return hit ? hit[1] : "◈";
  };

  SYS.DEFAULT_SETTINGS = {
    theme: "Black & dark gold", language: "en",
    // Only used when theme === SYS.CUSTOM_THEME_NAME; kept here so the picker
    // always has something sensible to open with.
    customTheme: { dark: true, accent: "#d9a05b", base: "#141110" },
  };

  // Units a recurring habit can be measured in, grouped for the quest form's
  // dropdown. "Custom…" lets the user type any label not covered here.
  SYS.UNIT_GROUPS = [
    { label: "Count", units: ["reps", "times", "pages", "steps", "sets"] },
    { label: "Time", units: ["sec", "min", "hr"] },
    { label: "Volume", units: ["ml", "L"] },
    { label: "Distance", units: ["m", "km"] },
    { label: "Weight", units: ["g", "kg"] },
  ];
  SYS.TIME_UNITS = SYS.UNIT_GROUPS.find((g) => g.label === "Time").units;
  SYS.isTimeUnit = function (unit) { return SYS.TIME_UNITS.includes(unit); };

  // Muted, warm-leaning identity colors for the 8 Intelligence categories —
  // desaturated to sit inside the bronze/gold palette instead of clashing with it.
  SYS.DEFAULT_INT_TYPES = [
    { key: "self", name: "Self-Intelligence", ar: "الذكاء الذاتي", short: "SELF", color: "#cf9a5c" },
    { key: "social", name: "Social Intelligence", ar: "الذكاء الاجتماعي", short: "SOC", color: "#c17b5a" },
    { key: "linguistic", name: "Linguistic Intelligence", ar: "الذكاء اللغوي", short: "LING", color: "#a98d5f" },
    { key: "logical", name: "Logical-Mathematical Intelligence", ar: "الذكاء المنطقي-الرياضي", short: "LOG", color: "#7f97a0" },
    { key: "bodily", name: "Bodily-Kinesthetic Intelligence", ar: "الذكاء الجسدي-الحركي", short: "BODY", color: "#b2654f" },
    { key: "natural", name: "Natural Intelligence", ar: "الذكاء الطبيعي", short: "NAT", color: "#8ba07a" },
    { key: "visual", name: "Visual-Spatial Intelligence", ar: "الذكاء البصري-المكاني", short: "VIS", color: "#b79a6b" },
    { key: "musical", name: "Musical Intelligence", ar: "الذكاء الموسيقي", short: "MUS", color: "#a97ca0" },
  ];

  // Design tokens for the two themes — values are the exact palette from the
  // "The System Ring" design handoff.
  // Every palette here comes from the design handoff in
  // "The System Growth Tracker": a small spec of ten or so colours per
  // theme, expanded by that bundle's own makeTheme derivation. Adding one
  // is a spec, not thirty-seven hand-picked values, which is what keeps
  // them consistent with each other.
  //
  // The one rule the handoff insists on: `gold` is for fills, rings and
  // borders. Accent *text* is always `goldText`, and text sitting on a gold
  // fill is `onGold`. On these palettes gold is dark or saturated enough
  // that using it as text would fail contrast outright.
  //
  // The gold pair is pitched at the mark's own hue family but pushed to a
  // yellower 45 degrees. Measuring the logo settled an open question: its
  // gold is 37 degrees, the same as the old accents, so the "too orange"
  // reading came from how dark they were, not from their hue. Both were
  // moved on both axes.
  //
  // White & gold puts dark text on its gold fill rather than white. A
  // yellow light enough to read as yellow cannot carry white text at any
  // usable contrast; the lightness there is solved against 4.5:1 rather
  // than chosen by eye.
  // Every palette here comes from the design handoff in
  // "The System Growth Tracker": a small spec of ten or so colours per
  // theme, expanded by that bundle's own makeTheme derivation. Adding one
  // is a spec, not thirty-seven hand-picked values, which is what keeps
  // them consistent with each other.
  //
  // The one rule the handoff insists on: `gold` is for fills, rings and
  // borders. Accent *text* is always `goldText`, and text sitting on a gold
  // fill is `onGold`. On these palettes gold is dark or saturated enough
  // that using it as text would fail contrast outright.
  //
  // The gold pair is pitched at the mark's own hue family but pushed to a
  // yellower 45 degrees. Measuring the logo settled an open question: its
  // gold is 37 degrees, the same as the old accents, so the "too orange"
  // reading came from how dark they were, not from their hue. Both were
  // moved on both axes.
  //
  // White & gold puts dark text on its gold fill rather than white. A
  // yellow light enough to read as yellow cannot carry white text at any
  // usable contrast; the lightness there is solved against 4.5:1 rather
  // than chosen by eye.
  // Every palette here comes from the design handoff in
  // "The System Growth Tracker": a small spec of ten or so colours per
  // theme, expanded by that bundle's own makeTheme derivation. Adding one
  // is a spec, not thirty-seven hand-picked values, which is what keeps
  // them consistent with each other.
  //
  // The one rule the handoff insists on: `gold` is for fills, rings and
  // borders. Accent *text* is always `goldText`, and text sitting on a gold
  // fill is `onGold`. On these palettes gold is dark or saturated enough
  // that using it as text would fail contrast outright.
  //
  // The gold pair is pitched at the mark's own hue family but pushed to a
  // yellower 45 degrees. Measuring the logo settled an open question: its
  // gold is 37 degrees, the same as the old accents, so the "too orange"
  // reading came from how dark they were, not from their hue. Both were
  // moved on both axes.
  //
  // White & gold puts dark text on its gold fill rather than white. A
  // yellow light enough to read as yellow cannot carry white text at any
  // usable contrast; the lightness there is solved against 4.5:1 rather
  // than chosen by eye.
  // Every palette here comes from the design handoff in
  // "The System Growth Tracker": a small spec of ten or so colours per
  // theme, expanded by that bundle's own makeTheme derivation. Adding one
  // is a spec, not thirty-seven hand-picked values, which is what keeps
  // them consistent with each other.
  //
  // The one rule the handoff insists on: `gold` is for fills, rings and
  // borders. Accent *text* is always `goldText`, and text sitting on a gold
  // fill is `onGold`. On these palettes gold is dark or saturated enough
  // that using it as text would fail contrast outright.
  //
  // The gold pair is pitched at the mark's own hue family but pushed to a
  // yellower 45 degrees. Measuring the logo settled an open question: its
  // gold is 37 degrees, the same as the old accents, so the "too orange"
  // reading came from how dark they were, not from their hue. Both were
  // moved on both axes.
  //
  // White & gold puts dark text on its gold fill rather than white. A
  // yellow light enough to read as yellow cannot carry white text at any
  // usable contrast; the lightness there is solved against 4.5:1 rather
  // than chosen by eye.
  // Every palette here comes from the design handoff in
  // "The System Growth Tracker": a small spec of ten or so colours per
  // theme, expanded by that bundle's own makeTheme derivation. Adding one
  // is a spec, not thirty-seven hand-picked values, which is what keeps
  // them consistent with each other.
  //
  // The one rule the handoff insists on: `gold` is for fills, rings and
  // borders. Accent *text* is always `goldText`, and text sitting on a gold
  // fill is `onGold`. On these palettes gold is dark or saturated enough
  // that using it as text would fail contrast outright.
  //
  // The gold pair is pitched at the mark's own hue family but pushed to a
  // yellower 45 degrees. Measuring the logo settled an open question: its
  // gold is 37 degrees, the same as the old accents, so the "too orange"
  // reading came from how dark they were, not from their hue. Both were
  // moved on both axes.
  //
  // White & gold puts dark text on its gold fill rather than white. A
  // yellow light enough to read as yellow cannot carry white text at any
  // usable contrast; the lightness there is solved against 4.5:1 rather
  // than chosen by eye.
  SYS.THEMES = {
    "Black & dark gold": {
      dark: true,
      pageBg: "#050505", appBg: "linear-gradient(178deg,#141210 0%,#0e0d0b 46%,#070707 100%)",
      ink: "#f4f1ea", inkStrong: "#ffffff", body: "rgba(244,241,234,0.6)", dim: "rgba(244,241,234,0.5)", faint: "rgba(244,241,234,0.36)",
      card: "rgba(244,241,234,0.05)", border: "rgba(244,241,234,0.1)", track: "rgba(244,241,234,0.11)",
      gold: "#9a6a1c", goldText: "#e2b467", onGold: "#ffffff",
      goldSoft: "rgba(154,106,28,0.2)", goldBorder: "rgba(154,106,28,0.45)",
      barGold: "linear-gradient(90deg,#9a6a1c,#e2b467)",
      barToday: "linear-gradient(180deg,#e2b467,#9a6a1c)", barIdle: "rgba(244,241,234,0.28)",
      hubBg: "#141210", sheetBg: "#151310", toastBg: "#151310",
      ringInner: "radial-gradient(circle at 50% 28%,#191612,#0c0b09 78%)",
      levelUpBg: "radial-gradient(circle at 50% 26%,#2a2114,#070707 68%)",
      navFade: "linear-gradient(180deg,rgba(7,7,7,0),#070707 40%)",
      scrim: "rgba(6,5,5,.76)",
      hatch: "repeating-linear-gradient(135deg,rgba(244,241,234,0.1) 0 6px,transparent 6px 12px)",
      ctaBg: "linear-gradient(120deg,rgba(154,106,28,0.3),rgba(154,106,28,0.05))", ctaInk: "#e2b467",
      rust: "#d2694a", rustSoft: "rgba(210,105,74,0.08)", rustBorder: "rgba(210,105,74,0.3)", rustText: "rgba(210,105,74,0.85)",
      doneBg: "rgba(154,106,28,0.14)", doneBorder: "rgba(154,106,28,0.3)", doneTitle: "rgba(244,241,234,0.5)", doneReward: "rgba(154,106,28,0.85)",
    },
    "Black & pale gold": {
      dark: true,
      pageBg: "#050505", appBg: "linear-gradient(178deg,#141310 0%,#0e0d0b 46%,#070707 100%)",
      ink: "#f4f1ea", inkStrong: "#ffffff", body: "rgba(244,241,234,0.6)", dim: "rgba(244,241,234,0.5)", faint: "rgba(244,241,234,0.36)",
      card: "rgba(244,241,234,0.05)", border: "rgba(244,241,234,0.1)", track: "rgba(244,241,234,0.11)",
      gold: "#b3946c", goldText: "#e6be8a", onGold: "#0b0a08",
      goldSoft: "rgba(179,148,108,0.2)", goldBorder: "rgba(179,148,108,0.45)",
      barGold: "linear-gradient(90deg,#b3946c,#e6be8a)",
      barToday: "linear-gradient(180deg,#e6be8a,#b3946c)", barIdle: "rgba(244,241,234,0.28)",
      hubBg: "#141310", sheetBg: "#151310", toastBg: "#151310",
      ringInner: "radial-gradient(circle at 50% 28%,#191713,#0c0b09 78%)",
      levelUpBg: "radial-gradient(circle at 50% 26%,#2f281f,#070707 68%)",
      navFade: "linear-gradient(180deg,rgba(7,7,7,0),#070707 40%)",
      scrim: "rgba(6,5,5,.76)",
      hatch: "repeating-linear-gradient(135deg,rgba(244,241,234,0.1) 0 6px,transparent 6px 12px)",
      ctaBg: "linear-gradient(120deg,rgba(179,148,108,0.3),rgba(179,148,108,0.05))", ctaInk: "#e6be8a",
      rust: "#d2694a", rustSoft: "rgba(210,105,74,0.08)", rustBorder: "rgba(210,105,74,0.3)", rustText: "rgba(210,105,74,0.85)",
      doneBg: "rgba(179,148,108,0.14)", doneBorder: "rgba(179,148,108,0.3)", doneTitle: "rgba(244,241,234,0.5)", doneReward: "rgba(179,148,108,0.85)",
    },
    "Black & blond": {
      dark: true,
      pageBg: "#050505", appBg: "linear-gradient(178deg,#141310 0%,#0e0d0b 46%,#070707 100%)",
      ink: "#f4f1ea", inkStrong: "#ffffff", body: "rgba(244,241,234,0.6)", dim: "rgba(244,241,234,0.5)", faint: "rgba(244,241,234,0.36)",
      card: "rgba(244,241,234,0.05)", border: "rgba(244,241,234,0.1)", track: "rgba(244,241,234,0.11)",
      gold: "#c3bb94", goldText: "#faf0be", onGold: "#0b0a08",
      goldSoft: "rgba(195,187,148,0.2)", goldBorder: "rgba(195,187,148,0.45)",
      barGold: "linear-gradient(90deg,#c3bb94,#faf0be)",
      barToday: "linear-gradient(180deg,#faf0be,#c3bb94)", barIdle: "rgba(244,241,234,0.28)",
      hubBg: "#141310", sheetBg: "#151310", toastBg: "#151310",
      ringInner: "radial-gradient(circle at 50% 28%,#191713,#0c0b09 78%)",
      levelUpBg: "radial-gradient(circle at 50% 26%,#333128,#070707 68%)",
      navFade: "linear-gradient(180deg,rgba(7,7,7,0),#070707 40%)",
      scrim: "rgba(6,5,5,.76)",
      hatch: "repeating-linear-gradient(135deg,rgba(244,241,234,0.1) 0 6px,transparent 6px 12px)",
      ctaBg: "linear-gradient(120deg,rgba(195,187,148,0.3),rgba(195,187,148,0.05))", ctaInk: "#faf0be",
      rust: "#d2694a", rustSoft: "rgba(210,105,74,0.08)", rustBorder: "rgba(210,105,74,0.3)", rustText: "rgba(210,105,74,0.85)",
      doneBg: "rgba(195,187,148,0.14)", doneBorder: "rgba(195,187,148,0.3)", doneTitle: "rgba(244,241,234,0.5)", doneReward: "rgba(195,187,148,0.85)",
    },
    "Black & light brown": {
      dark: true,
      pageBg: "#050505", appBg: "linear-gradient(178deg,#151210 0%,#0f0d0b 46%,#080706 100%)",
      ink: "#f3efe9", inkStrong: "#ffffff", body: "rgba(243,239,233,0.6)", dim: "rgba(243,239,233,0.5)", faint: "rgba(243,239,233,0.36)",
      card: "rgba(243,239,233,0.05)", border: "rgba(243,239,233,0.1)", track: "rgba(243,239,233,0.11)",
      gold: "#a9764f", goldText: "#d6a680", onGold: "#120d09",
      goldSoft: "rgba(169,118,79,0.2)", goldBorder: "rgba(169,118,79,0.45)",
      barGold: "linear-gradient(90deg,#a9764f,#d6a680)",
      barToday: "linear-gradient(180deg,#d6a680,#a9764f)", barIdle: "rgba(243,239,233,0.28)",
      hubBg: "#151210", sheetBg: "#171310", toastBg: "#171310",
      ringInner: "radial-gradient(circle at 50% 28%,#1b1613,#0d0b09 78%)",
      levelUpBg: "radial-gradient(circle at 50% 26%,#2c211a,#080706 68%)",
      navFade: "linear-gradient(180deg,rgba(8,7,6,0),#080706 40%)",
      scrim: "rgba(6,5,5,.76)",
      hatch: "repeating-linear-gradient(135deg,rgba(243,239,233,0.1) 0 6px,transparent 6px 12px)",
      ctaBg: "linear-gradient(120deg,rgba(169,118,79,0.3),rgba(169,118,79,0.05))", ctaInk: "#d6a680",
      rust: "#cf6b4c", rustSoft: "rgba(207,107,76,0.08)", rustBorder: "rgba(207,107,76,0.3)", rustText: "rgba(207,107,76,0.85)",
      doneBg: "rgba(169,118,79,0.14)", doneBorder: "rgba(169,118,79,0.3)", doneTitle: "rgba(243,239,233,0.5)", doneReward: "rgba(169,118,79,0.85)",
    },
    "White & gold": {
      dark: false,
      pageBg: "#e9e7e2", appBg: "linear-gradient(178deg,#ffffff 0%,#fdfbf7 46%,#f6f3ec 100%)",
      ink: "#1c1813", inkStrong: "#141009", body: "rgba(28,24,19,0.66)", dim: "rgba(28,24,19,0.55)", faint: "rgba(28,24,19,0.4)",
      card: "rgba(28,24,19,0.04)", border: "rgba(28,24,19,0.12)", track: "rgba(28,24,19,0.1)",
      gold: "#a4762a", goldText: "#8a6320", onGold: "#0b0a08",
      goldSoft: "rgba(164,118,42,0.1)", goldBorder: "rgba(164,118,42,0.3)",
      barGold: "linear-gradient(90deg,#a4762a,#8a6320)",
      barToday: "linear-gradient(180deg,#8a6320,#a4762a)", barIdle: "rgba(28,24,19,0.2)",
      hubBg: "#ffffff", sheetBg: "#ffffff", toastBg: "#ffffff",
      ringInner: "radial-gradient(circle at 50% 28%,#ffffff,#faf7f0 78%)",
      levelUpBg: "radial-gradient(circle at 50% 26%,#fdf6e6,#ffffff 68%)",
      navFade: "linear-gradient(180deg,rgba(246,243,236,0),#f6f3ec 40%)",
      scrim: "rgba(28,24,19,0.38)",
      hatch: "repeating-linear-gradient(135deg,rgba(28,24,19,0.12) 0 6px,transparent 6px 12px)",
      ctaBg: "linear-gradient(120deg,rgba(164,118,42,0.16),rgba(164,118,42,0.05))", ctaInk: "#8a6320",
      rust: "#a8482a", rustSoft: "rgba(168,72,42,0.08)", rustBorder: "rgba(168,72,42,0.3)", rustText: "#a8482a",
      doneBg: "rgba(164,118,42,0.08)", doneBorder: "rgba(164,118,42,0.22)", doneTitle: "rgba(28,24,19,0.5)", doneReward: "rgba(164,118,42,0.8)",
    },
    "White & dark brown": {
      dark: false,
      pageBg: "#e7e2dc", appBg: "linear-gradient(178deg,#ffffff 0%,#fcfaf8 46%,#f5f1ec 100%)",
      ink: "#241a12", inkStrong: "#180f09", body: "rgba(36,26,18,0.66)", dim: "rgba(36,26,18,0.55)", faint: "rgba(36,26,18,0.4)",
      card: "rgba(36,26,18,0.04)", border: "rgba(36,26,18,0.12)", track: "rgba(36,26,18,0.1)",
      gold: "#4a2f1e", goldText: "#3d2617", onGold: "#ffffff",
      goldSoft: "rgba(74,47,30,0.1)", goldBorder: "rgba(74,47,30,0.3)",
      barGold: "linear-gradient(90deg,#4a2f1e,#3d2617)",
      barToday: "linear-gradient(180deg,#3d2617,#4a2f1e)", barIdle: "rgba(36,26,18,0.2)",
      hubBg: "#ffffff", sheetBg: "#ffffff", toastBg: "#ffffff",
      ringInner: "radial-gradient(circle at 50% 28%,#ffffff,#faf7f3 78%)",
      levelUpBg: "radial-gradient(circle at 50% 26%,#f7efe7,#ffffff 68%)",
      navFade: "linear-gradient(180deg,rgba(245,241,236,0),#f5f1ec 40%)",
      scrim: "rgba(36,26,18,0.38)",
      hatch: "repeating-linear-gradient(135deg,rgba(36,26,18,0.12) 0 6px,transparent 6px 12px)",
      ctaBg: "linear-gradient(120deg,rgba(74,47,30,0.16),rgba(74,47,30,0.05))", ctaInk: "#3d2617",
      rust: "#9c3f22", rustSoft: "rgba(156,63,34,0.08)", rustBorder: "rgba(156,63,34,0.3)", rustText: "#9c3f22",
      doneBg: "rgba(74,47,30,0.08)", doneBorder: "rgba(74,47,30,0.22)", doneTitle: "rgba(36,26,18,0.5)", doneReward: "rgba(74,47,30,0.8)",
    },
    "Maroon & white": {
      dark: false,
      pageBg: "#e8e1e1", appBg: "linear-gradient(178deg,#ffffff 0%,#fdfafa 46%,#f6f0f0 100%)",
      ink: "#231317", inkStrong: "#170b0e", body: "rgba(35,19,23,0.66)", dim: "rgba(35,19,23,0.55)", faint: "rgba(35,19,23,0.4)",
      card: "rgba(35,19,23,0.04)", border: "rgba(35,19,23,0.12)", track: "rgba(35,19,23,0.1)",
      gold: "#7a1f33", goldText: "#6b1a2c", onGold: "#ffffff",
      goldSoft: "rgba(122,31,51,0.1)", goldBorder: "rgba(122,31,51,0.3)",
      barGold: "linear-gradient(90deg,#7a1f33,#6b1a2c)",
      barToday: "linear-gradient(180deg,#6b1a2c,#7a1f33)", barIdle: "rgba(35,19,23,0.2)",
      hubBg: "#ffffff", sheetBg: "#ffffff", toastBg: "#ffffff",
      ringInner: "radial-gradient(circle at 50% 28%,#ffffff,#faf6f6 78%)",
      levelUpBg: "radial-gradient(circle at 50% 26%,#f8ebed,#ffffff 68%)",
      navFade: "linear-gradient(180deg,rgba(246,240,240,0),#f6f0f0 40%)",
      scrim: "rgba(35,19,23,0.38)",
      hatch: "repeating-linear-gradient(135deg,rgba(35,19,23,0.12) 0 6px,transparent 6px 12px)",
      ctaBg: "linear-gradient(120deg,rgba(122,31,51,0.16),rgba(122,31,51,0.05))", ctaInk: "#6b1a2c",
      rust: "#a8542a", rustSoft: "rgba(168,84,42,0.08)", rustBorder: "rgba(168,84,42,0.3)", rustText: "#a8542a",
      doneBg: "rgba(122,31,51,0.08)", doneBorder: "rgba(122,31,51,0.22)", doneTitle: "rgba(35,19,23,0.5)", doneReward: "rgba(122,31,51,0.8)",
    },
  };

  // ---------------------------------------------------------------------
  // Theme engine
  //
  // The palettes above are the single source of truth: applyTheme writes
  // every value onto the document as a CSS custom property. styles.css still
  // defines :root as a static fallback for the pre-JS paint, but nothing
  // needs to be added there for a new theme — and a user-defined palette
  // (which can't exist as a static CSS block at all) works the same way as
  // a built-in one.
  // ---------------------------------------------------------------------

  // "inkStrong" -> "--ink-strong"
  function cssVarName(key) {
    return "--" + key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
  }

  // #rgb / #rrggbb -> {r,g,b}. Returns null for anything else so callers can
  // fall back rather than emit broken CSS.
  function hexToRgb(hex) {
    if (typeof hex !== "string") return null;
    let h = hex.trim().replace(/^#/, "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  SYS.hexToRgb = hexToRgb;

  function rgba(hex, alpha) {
    const c = hexToRgb(hex);
    if (!c) return "rgba(0,0,0," + alpha + ")";
    return `rgba(${c.r},${c.g},${c.b},${alpha})`;
  }
  // Moves a colour toward black (amount < 1) or white (amount > 1).
  function shade(hex, amount) {
    const c = hexToRgb(hex);
    if (!c) return hex;
    const f = (v) => Math.max(0, Math.min(255, Math.round(amount <= 1 ? v * amount : v + (255 - v) * (amount - 1))));
    return `#${[f(c.r), f(c.g), f(c.b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }

  // Builds a full palette from the three choices a person can reasonably
  // make — light or dark, one accent, one background tone. Everything else
  // (text, borders, tracks, scrims) is derived from those, which is what
  // keeps a hand-picked theme readable instead of letting someone choose
  // grey text on a grey background.
  // Perceived brightness, 0 (black) to 1 (white).
  function luminance(hex) {
    const c = hexToRgb(hex);
    if (!c) return 0;
    return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
  }
  SYS.luminance = luminance;

  // WCAG relative luminance and contrast ratio. `luminance` above is a
  // perceived-brightness approximation, fine for "is this background dark?"
  // and wrong for "can this be read on that" — the two disagree most exactly
  // where it matters, on saturated mid-tones like a red or a maroon.
  function channel(c) {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function relLuminance(hex) {
    const c = hexToRgb(hex);
    if (!c) return 0;
    return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  }
  function contrastRatio(a, b) {
    const l1 = relLuminance(a), l2 = relLuminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  SYS.contrastRatio = contrastRatio;

  SYS.buildCustomTheme = function (opts) {
    const accent = hexToRgb(opts.accent) ? opts.accent : "#d9a05b";
    const base = hexToRgb(opts.base) ? opts.base : (opts.dark ? "#141110" : "#ffffff");
    // Whether text is light or dark is decided by the background actually
    // chosen, not by the requested mode. Otherwise picking a near-black
    // background while "light" is selected yields dark text on a dark page —
    // legibility can't be left to a combination of two independent controls.
    const dark = luminance(base) < 0.5;
    const ink = dark ? "#f4ede2" : "#1c1813";
    const inkRgb = hexToRgb(ink);
    const inkA = (a) => `rgba(${inkRgb.r},${inkRgb.g},${inkRgb.b},${a})`;
    const accentText = dark ? shade(accent, 1.35) : shade(accent, 0.8);
    // What goes *on* the accent — the rank pill, a primary button. Whichever
    // of light and dark actually reads better on it wins.
    //
    // This was keyed to the theme mode, which assumed a dark theme always has
    // a light accent: pick a deep maroon and it put near-black text on it. A
    // brightness threshold instead of the mode was no better — a mid-tone red
    // sits near whatever line you draw, and lands on the wrong side of it.
    // Measuring both candidates has no threshold to be wrong about.
    const onLight = "#f6f1ea", onDark = shade(base, dark ? 0.6 : 1);
    const onAccent = contrastRatio(onLight, accent) >= contrastRatio(onDark, accent) ? onLight : onDark;
    return {
      dark,
      // The lifts above the base are small on purpose. shade(x, 1.5) moves a
      // colour *half way to white*, not "50% lighter" — on a dark base that
      // is a mid grey, and a dark custom theme came out as a grey wash with
      // the chosen colour only at the very bottom of the page. Measured
      // against the hand-tuned Bronze dark, whose surfaces sit 1.03-1.09
      // above its base, these were 1.15-1.5.
      pageBg: dark ? shade(base, 0.78) : shade(base, 0.93),
      appBg: `linear-gradient(178deg,${shade(base, dark ? 1.09 : 1)} 0%,${shade(base, dark ? 1.03 : 0.99)} 42%,${base} 100%)`,
      ink, inkStrong: dark ? shade(ink, 1.2) : shade(ink, 0.75),
      body: inkA(dark ? 0.55 : 0.6), dim: inkA(dark ? 0.42 : 0.5), faint: inkA(dark ? 0.3 : 0.35),
      card: inkA(dark ? 0.045 : 0.032), border: inkA(dark ? 0.075 : 0.1), track: inkA(dark ? 0.1 : 0.09),
      gold: accent, goldText: accentText, onGold: onAccent,
      goldSoft: rgba(accent, dark ? 0.12 : 0.1), goldBorder: rgba(accent, dark ? 0.3 : 0.28),
      barGold: `linear-gradient(90deg,${shade(accent, 0.75)},${accent})`,
      barToday: `linear-gradient(180deg,${accentText},${accent})`, barIdle: inkA(dark ? 0.28 : 0.2),
      hubBg: shade(base, dark ? 1.04 : 1), sheetBg: shade(base, dark ? 1.06 : 1), toastBg: shade(base, dark ? 1.09 : 1),
      ringInner: `radial-gradient(circle at 50% 28%,${shade(base, dark ? 1.09 : 1)},${shade(base, dark ? 1.02 : 0.98)} 78%)`,
      levelUpBg: `radial-gradient(circle at 50% 26%,${shade(accent, dark ? 0.45 : 1.85)},${base} 68%)`,
      navFade: `linear-gradient(180deg,${rgba(base, 0)},${base} 40%)`,
      scrim: dark ? "rgba(12,10,8,.74)" : inkA(0.38),
      hatch: `repeating-linear-gradient(135deg,${inkA(dark ? 0.1 : 0.12)} 0 6px,transparent 6px 12px)`,
      ctaBg: `linear-gradient(120deg,${rgba(accent, dark ? 0.22 : 0.16)},${rgba(accent, dark ? 0.07 : 0.05)})`,
      ctaInk: dark ? shade(accent, 1.6) : shade(accent, 0.6),
      rust: dark ? "#c66a45" : "#a8482a",
      rustSoft: dark ? "rgba(198,106,69,.06)" : "rgba(168,72,42,.06)",
      rustBorder: dark ? "rgba(198,106,69,.26)" : "rgba(168,72,42,.24)",
      rustText: dark ? "rgba(214,158,134,.7)" : "rgba(146,62,36,.85)",
      doneBg: rgba(accent, dark ? 0.07 : 0.08), doneBorder: rgba(accent, 0.22),
      doneTitle: inkA(dark ? 0.5 : 0.45), doneReward: rgba(accent, dark ? 0.65 : 0.7),
    };
  };

  SYS.CUSTOM_THEME_NAME = "Custom";

  SYS.getTheme = function (state) {
    const s = state.settings || {};
    if (s.theme === SYS.CUSTOM_THEME_NAME && s.customTheme) return SYS.buildCustomTheme(s.customTheme);
    // An unknown name falls through to the default rather than to a blank
    // page — retired themes and typos land in the same place.
    return SYS.THEMES[s.theme] || SYS.THEMES[SYS.DEFAULT_SETTINGS.theme];
  };

  // Writes the resolved palette onto the document. `dark` still drives the
  // data-theme attribute so any CSS that keys off it keeps working.
  SYS.applyTheme = function (state) {
    const theme = SYS.getTheme(state);
    const root = document.documentElement;
    Object.keys(theme).forEach((key) => {
      if (key === "dark") return;
      root.style.setProperty(cssVarName(key), theme[key]);
    });
    root.setAttribute("data-theme", theme.dark ? "dark" : "light");
  };

  // Guards every entry point that can introduce an intelligence-category
  // color (local storage load, JSON import, cloud pull, new-category form) —
  // without this, a hand-edited backup file or a tampered localStorage value
  // could break out of the `style="color:...` attribute it's rendered into
  // and inject arbitrary HTML/JS. Anything that isn't a plain hex color falls
  // back to a safe default instead of being trusted as-is.
  function sanitizeColor(c, fallback) {
    return typeof c === "string" && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : (fallback || "#cf9a5c");
  }
  SYS.sanitizeColor = sanitizeColor;

  // Folds a name to something comparable: case, spaces, hyphens and quotes
  // all stop mattering, so "Time-management" and "Time management" are the
  // same trait and a curly quote in a title does not hide it.
  //
  // One definition on purpose. It existed three times, and two of those had
  // been silently broken by \p{L} being written inside a template literal,
  // where the backslash is eaten and the class becomes [^p{L}p{N}] — which
  // strips nearly everything, folds every name to the empty string, and makes
  // them all compare equal. Nothing throws; the wrong answer just looks
  // confident.
  SYS.normaliseName = function (s) {
    return String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  };
  function uid(prefix) {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return (prefix || "id") + "_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  SYS.uid = uid;

  // Adds anything an account is missing relative to the seed, and reports what
  // it added. Purely additive: levels, remainders and anything an admin added
  // beyond the seed are all left alone.
  //
  // The seed is the floor of a shared vocabulary rather than a starting point
  // that then drifts. Every task is scored against these names, so an account
  // missing one is an account that cannot be scored on it — which is exactly
  // how a habit about drinking water ended up counted as self-defence.
  //
  // Runs on every load rather than behind a schema number, so the next gap
  // found in the index reaches existing accounts by being added here, with no
  // second migration to write.
  // Whether a trait is part of the shared floor. Those cannot be deleted:
  // syncIndexWithSeed would put them back on the next load, and a delete button
  // that silently undoes itself is worse than no button.
  SYS.isSeedTrait = function (categoryKey, traitName) {
    const seed = SYS.seedIntelligences()[categoryKey];
    return !!seed && seed.traits.some((t) => SYS.normaliseName(t.name) === SYS.normaliseName(traitName));
  };

  // The seed's tasks predate AI evaluation, so none of them named a trait —
  // and a task with no name falls back to whichever trait is weakest. Logging
  // "Drink water" filed the point under Yoga, then Self-defence, because the
  // fallback is all there ever was for these.
  //
  // Nothing in the evaluator could have fixed that: it is only consulted when a
  // task is created, and these were never created — they arrived with the app.
  //
  // Matched on title, and only filled in where a task has no target of its own,
  // so anything renamed or re-evaluated is left alone.
  SYS.syncSeedTaskTargets = function (state) {
    const wanted = new Map();
    SYS.seedTasks().forEach((t) => {
      if (Array.isArray(t.traitTargets) && t.traitTargets.length) wanted.set(SYS.normaliseName(t.title), t.traitTargets);
    });
    const fixed = [];
    (Array.isArray(state.tasks) ? state.tasks : []).forEach((task) => {
      if (Array.isArray(task.traitTargets) && task.traitTargets.length) return;
      const target = wanted.get(SYS.normaliseName(task.title));
      if (!target) return;
      task.traitTargets = target.map((x) => ({ ...x }));
      fixed.push(task.title + " → " + target.map((x) => x.trait).join(", "));
    });
    return fixed;
  };

  SYS.syncIndexWithSeed = function (state) {
    const seedTypes = SYS.DEFAULT_INT_TYPES;
    const seed = SYS.seedIntelligences();
    const added = [];

    state.intTypes = Array.isArray(state.intTypes) ? state.intTypes : [];
    state.intelligences = state.intelligences && typeof state.intelligences === "object" ? state.intelligences : {};

    seedTypes.forEach((type) => {
      if (!state.intTypes.some((t) => t.key === type.key)) {
        state.intTypes.push({ ...type });
        added.push(type.name);
      }
      const bucket = state.intelligences[type.key];
      // Present on every category, always. Fractions bank per trait now, and a
      // copy that has the field beside one that does not compares unequal —
      // which is the whole "which copy do you want to keep?" trap again.
      if (bucket && !bucket.traitRemainder) bucket.traitRemainder = {};
      if (!bucket || !Array.isArray(bucket.traits)) {
        state.intelligences[type.key] = { remainder: 0, traits: (seed[type.key] ? seed[type.key].traits : []).map((t) => ({ ...t, level: 0 })) };
        return;
      }
      const have = new Set(bucket.traits.map((t) => SYS.normaliseName(t.name)));
      (seed[type.key] ? seed[type.key].traits : []).forEach((t) => {
        if (have.has(SYS.normaliseName(t.name))) return;
        // Derived from the name, never random.
        //
        // SYS.uid() returns a fresh UUID each call, and this function runs on
        // both copies of a profile — the one on the device and the one pulled
        // from the account. Each gained the same missing trait under a
        // different id, the two copies compared unequal, and the app asked
        // "which copy do you want to keep?" on every single launch, for ever.
        //
        // A name-derived id is the same on every device, so both copies land on
        // the same value and agree. Prefixed to keep it clear of the per-
        // category t1..tN ids an account may already be using.
        bucket.traits.push({ id: "seed_" + type.key + "_" + SYS.normaliseName(t.name), name: t.name, ar: t.ar, level: 0 });
        added.push(t.name);
      });
    });

    return added;
  };

  SYS.seedIntelligences = function () {
    return {
      self: { remainder: 0, traitRemainder: {}, traits: [
        { id: "t1", name: "Self-motivation", ar: "التحفيز الذاتي", level: 4 },
        { id: "t2", name: "Reflection & thinking", ar: "التأمل والتفكير", level: 13 },
        { id: "t3", name: "Personal goal-setting", ar: "تحديد الأهداف الشخصية", level: 6 },
        { id: "t4", name: "Self-evaluation", ar: "التقييم الذاتي", level: 6 },
        { id: "t5", name: "Time management", ar: "تنظيم الوقت", level: 6 },
      ]},
      social: { remainder: 0, traitRemainder: {}, traits: [
        { id: "t1", name: "Volunteering", ar: "العمل التطوعي", level: 0 },
        { id: "t2", name: "Social interaction", ar: "التفاعل الاجتماعي", level: 1 },
        { id: "t3", name: "Participating in social activities", ar: "المشاركة في الأنشطة الاجتماعية", level: 1 },
        { id: "t4", name: "Effective communication", ar: "التواصل الفعال", level: 9 },
      ]},
      linguistic: { remainder: 0, traitRemainder: {}, traits: [
        { id: "t1", name: "Reading", ar: "القراءة", level: 7 },
        { id: "t2", name: "Writing", ar: "الكتابة", level: 8 },
        { id: "t3", name: "Speaking", ar: "التحدث", level: 5 },
        { id: "t4", name: "Language learning", ar: "تعلم اللغات", level: 3 },
      ]},
      logical: { remainder: 0, traitRemainder: {}, traits: [
        { id: "t1", name: "Data analysis", ar: "تحليل البيانات", level: 2 },
        { id: "t2", name: "Puzzle solving", ar: "حل الألغاز", level: 7 },
        { id: "t3", name: "Programming", ar: "تعلم البرمجة", level: 0 },
        { id: "t4", name: "Sports coaching & training", ar: "التعليم والتدريب الرياضي", level: 5 },
      ]},
      bodily: { remainder: 0, traitRemainder: {}, traits: [
        { id: "t1", name: "Yoga", ar: "اليوغا", level: 0 },
        { id: "t2", name: "Sports", ar: "الرياضة", level: 9 },
        { id: "t3", name: "Self-defense techniques", ar: "تقنيات الدفاع عن النفس", level: 0 },
        { id: "t4", name: "Handcrafts", ar: "المهارات اليدوية", level: 0 },
        { id: "t5", name: "Daily exercise", ar: "التمارين اليومية", level: 5 },
        { id: "t6", name: "Acting", ar: "التمثيل", level: 4 },
        { id: "t7", name: "Health", ar: "الصحة", level: 0 },
      ]},
      natural: { remainder: 0, traitRemainder: {}, traits: [
        { id: "t1", name: "Survival techniques", ar: "تقنيات البقاء في الطبيعة", level: 0 },
        { id: "t2", name: "Outdoor activities", ar: "الأنشطة الخارجية", level: 0 },
        { id: "t3", name: "Learning about the environment", ar: "التعلم عن البيئة", level: 0 },
        { id: "t4", name: "Farming & gardening", ar: "الزراعة والبستنة", level: 0 },
      ]},
      visual: { remainder: 0, traitRemainder: {}, traits: [
        { id: "t1", name: "3D planning", ar: "التخطيط ثلاثي الأبعاد", level: 0 },
        { id: "t2", name: "Graphic design", ar: "التصميم الجرافيكي", level: 0 },
        { id: "t3", name: "Photography", ar: "التصوير", level: 0 },
        { id: "t4", name: "Drawing", ar: "الرسم", level: 0 },
      ]},
      musical: { remainder: 0, traitRemainder: {}, traits: [
        { id: "t1", name: "Playing an instrument", ar: "العزف على آلة موسيقية", level: 0 },
        { id: "t2", name: "Active listening", ar: "الاستماع النشط", level: 3 },
        { id: "t3", name: "Vocal training", ar: "التدريب الصوتي", level: 3 },
        { id: "t4", name: "Musical creativity", ar: "الإبداع الموسيقي", level: 0 },
      ]},
    };
  };

  SYS.seedTasks = function () {
    const raw = [
      { title: "Reading “Animal Farm”", priority: "Medium", taskType: "Long Term", types: ["linguistic"], pt: 500, mode: "gradual", completion: 0, notes: "", traitTargets: [{ category: "linguistic", trait: "Reading" }] },
      { title: "Commitment in Exercises for two weeks", priority: "High", taskType: "Short Term", types: ["self"], pt: 1000, mode: "simple", completion: 0, notes: "", traitTargets: [{ category: "self", trait: "Self-motivation" }] },
      { title: "Writing with the other hand", priority: "Low", taskType: "Medium Term", types: ["linguistic"], pt: 300, mode: "simple", completion: 0, notes: "", traitTargets: [{ category: "linguistic", trait: "Writing" }] },
      { title: "Performing daily habits", priority: "High", taskType: "Long Term", types: [], pt: 100, mode: "gradual", completion: 40, notes: "" },
      { title: "Fast typing on the keyboard", priority: "High", taskType: "Long Term", types: ["bodily"], pt: 2000, mode: "gradual", completion: 30, notes: "", traitTargets: [{ category: "bodily", trait: "Handcrafts" }] },
    ];
    const recurring = [
      { title: "Drink water", priority: "Medium", types: ["bodily"], pt: 20, notes: "", recurring: true, repeatsPerWeek: 7, unit: "L", targetAmount: 2, weekKey: null, weekLog: [], traitTargets: [{ category: "bodily", trait: "Health" }] },
      { title: "Deep work session", priority: "High", types: ["self"], pt: 40, notes: "", recurring: true, repeatsPerWeek: 5, unit: "min", targetAmount: 30, weekKey: null, weekLog: [], traitTargets: [{ category: "self", trait: "Time management" }] },
    ];
    return [
      ...raw.map((t) => ({ ...t, id: uid("task"), expBaseline: Math.floor(t.pt * (t.completion / 100)) })),
      ...recurring.map((t) => ({ ...t, id: uid("task"), taskType: "Recurring", mode: "recurring", completion: 0, expBaseline: 0 })),
    ];
  };

  SYS.defaultState = function () {
    const settings = { ...SYS.DEFAULT_SETTINGS };
    return {
      schema: 1,
      settings,
      // traitComposition mirrors `composition` one level deeper: how much of
      // each category's pending EXP was tagged for a specific named trait, so
      // a level-up can invest in the trait the work actually built rather than
      // defaulting to the weakest one. Populated from AI evaluation.
      player: { name: "Hunter", rank: "G", level: 2, exp: 40, questsCompleted: 0, bankedPoints: 0, composition: {}, traitComposition: {} },
      intTypes: SYS.DEFAULT_INT_TYPES.map((t) => ({ ...t })),
      intelligences: SYS.seedIntelligences(),
      tasks: SYS.seedTasks(),
      log: [],
      levelHistory: [],
      dailyStats: {},
      // Which of this week's proposed tasks have already been answered, so an
      // accepted or declined one doesn't reappear — including on another
      // device, which is why it rides along with the rest of the state rather
      // than sitting in local storage.
      suggestions: { weekKey: null, handled: [] },
    };
  };
})(window.SYS = window.SYS || {});

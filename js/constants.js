// Shared constants + default/seed data. Attaches to window.SYS namespace.
(function (SYS) {
  "use strict";

  SYS.STORAGE_KEY = "the-system:v1";

  SYS.RANKS = ["G", "F", "E", "D", "C", "B", "A", "S"];
  // Which ranks have an emblem drawn for them, under assets/ranks. A rank
  // that is added to RANKS before its artwork exists falls back to its
  // letter rather than to a broken image, so the ladder can grow in two
  // steps instead of one.
  SYS.RANK_ART = ["G", "F", "E", "D", "C", "B", "A", "S"];
  // Each rank's own light, as the three numbers a CSS colour wants. The aura
  // behind an emblem and the flames in front of it both take their colour
  // from here, so a tier lights the screen in its own material rather than
  // in the app's gold.
  SYS.RANK_GLOW = {
    G: "150,150,150", F: "196,128,62", E: "198,208,216", D: "230,178,58",
    C: "60,214,132", B: "126,206,255", A: "255,74,74", S: "176,104,255",
  };

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
  // What one level costs, per rank.
  //
  // Raised across the board. A G-Rank level used to cost 15 EXP, which made a
  // single 1300-point quest eighty-six levels and one long book very nearly a
  // whole rank — the standing moved faster than the work behind it. Trait
  // growth is untouched: points are measured per 100 EXP, not per level, so
  // fewer and dearer levels each award proportionally more.
  //
  // MUST match RANK_LEVEL_EXP in functions/index.js. Two copies of this array
  // once disagreed and the app "corrected" its own standing on every load;
  // tests/test-curve.js now holds them together.
  SYS.RANK_LEVEL_EXP = [100, 130, 170, 220, 280, 350, 440, 550];

  // Which of those arrays a saved player's rank/level/exp was written under. A
  // document from before the change is re-derived once, from the EXP it
  // represents rather than from the numbers on it — see migrateLevelCurve.
  SYS.LEVEL_CURVE = 3;
  SYS.RANK_LEVEL_EXP_BY_CURVE = {
    // 1: every level cost a flat 100, and every rank held 100 of them. This
    //    was migrated once by schema version; it is listed here so that one
    //    mechanism covers every old standing instead of two that can disagree.
    1: [100, 100, 100, 100, 100, 100, 100, 100],
    2: [15, 30, 50, 75, 100, 130, 170, 200],
    3: [100, 130, 170, 220, 280, 350, 440, 550],
  };

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

  // EXP an hour of real work earns, for projections only: the evaluator's
  // rate for the first ten hours of anything (CALIBRATION in
  // functions/ai-config.js). Keep the two equal.
  SYS.PROJECTION_EXP_PER_HOUR = 60;
  // The paces the end of the assessment offers, in hours a day, and the one
  // it opens on.
  SYS.PROJECTION_PACES = [1, 2, 3];
  SYS.PROJECTION_DEFAULT_PACE = 2;
  SYS.PROJECTION_DAYS = 90;

  // ---------------------------------------------------------------------
  // Per-task identity: an emoji.
  //
  // There was a per-task colour here too, generated from the title. It was
  // removed: eight hues across seven palettes made the list look busy without
  // telling anyone anything, and a colour nobody chose is decoration rather
  // than information. Cards now take their colour from the theme, and the
  // emoji carries the identity.
  //
  // The fallback set below is matched on words that appear in the kind of
  // thing people actually track, in English and Arabic.
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
  // One character as a person sees it, not as JavaScript counts it.
  //
  // Cutting at a fixed number of UTF-16 units splits emoji: a family is four
  // emoji joined by zero-width joiners and runs to eleven units, so an eight
  // unit cap sliced it in half and rendered as pieces. Intl.Segmenter counts
  // what the eye counts; where it is missing the whole string is kept if it
  // is short, which is wrong only for someone deliberately pasting an essay
  // into a field that displays one glyph.
  // Emoji only. A letter or a digit in a 42px tile looks like a mistake, and
  // the field sits where an icon goes, so anything that is not a picture is
  // refused rather than shrunk to fit.
  //
  // Extended_Pictographic covers the pictures themselves; regional indicators
  // are the two-letter pairs that make flags, and U+20E3 is the enclosing
  // keycap that turns a digit into a key.
  //
  // This literal must be written by hand, never generated. Every previous
  // attempt lost the backslashes on the way through a template literal and
  // left a plain character class — which then matched "a", because "a" is a
  // letter in the word "Extended". The same trap took a session once before.
  const EMOJI_RE = /[\p{Extended_Pictographic}\p{Regional_Indicator}⃣]/u;
  SYS.isEmoji = function (s) { return EMOJI_RE.test(String(s == null ? "" : s)); };

  SYS.clampIcon = function (v) {
    const s = String(v == null ? "" : v).trim();
    if (!s) return "";
    let first = s;
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
      first = ([...seg.segment(s)][0] || {}).segment || "";
    } else {
      first = s.slice(0, 16);
    }
    return SYS.isEmoji(first) ? first : "";
  };

  SYS.taskIcon = function (task) {
    if (task && typeof task.icon === "string" && task.icon.trim()) return task.icon.trim();
    const title = (task && task.title) || "";
    const hit = ICON_HINTS.find(([re]) => re.test(title));
    // The fallback has to pass the same test the field enforces, or the app
    // would show a default nobody is allowed to type. ◈ was here first and is
    // not an emoji at all — it is a geometric shape.
    return hit ? hit[1] : "🔹";
  };

  SYS.DEFAULT_SETTINGS = {
    theme: "Black & dark gold", language: "en",
    // The timer remembers how you last used it, per account rather than per
    // habit: whichever way you like to work, you like it for all of them.
    timerMode: "stopwatch", timerStyle: "ring", focusSound: "silent", endSound: "default",
    // The radar's second outline: what the last ninety days built, drawn
    // inside the lifetime total. Off by default — the total is the primary
    // and always drawn; this is the one the person turns on.
    radarRecent: false,
    // Habits shown in the planner, read-only. Off unless asked for: the
    // planner is meant to stand apart from everything that scores.
    plannerShowHabits: false,
  };

  // Profile avatars: sixteen drawn portraits in assets/avatars. The same ids
  // and names as AVATARS in functions/profile.js (the server only stores an id
  // it knows); tests/test-profile.js keeps the two lists identical. The names
  // are the characters' own and are not translated — they only label the
  // buttons in the picker for a screen reader.
  //
  // The ids kept their old numbering on purpose: anyone who had picked a01 to
  // a16 while these were emoji still holds a valid id and simply gets a face.
  SYS.AVATARS = {
    a01: "Sentinel", a02: "Hound", a03: "Breaker", a04: "Elder",
    a05: "Anchor", a06: "Relic", a07: "Oath", a08: "Drifter",
    a09: "Thorn", a10: "Stray", a11: "Ember", a12: "Still",
    a13: "Warden", a14: "Veil", a15: "Lantern", a16: "Tide",
  };

  // There is no blank avatar. An id is derived from the uid instead, so every
  // player has a face from the first moment they appear on a board — the
  // grey silhouette that used to stand in for one was the worst-looking thing
  // in the application. Choosing an avatar only changes which face it is.
  SYS.defaultAvatarFor = function (uid) {
    const ids = Object.keys(SYS.AVATARS);
    const s = String(uid || "");
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return ids[h % ids.length];
  };

  // Two sizes ship: the small one for a list row, the large one for a profile
  // or a podium. Asking for more than 64 gets the large file.
  SYS.avatarSrc = function (id, px) {
    return "assets/avatars/" + id + (px > 64 ? "" : "-64") + ".jpg";
  };
  // ISO week in UTC, "2026-W38" — the same rule as weekKeyOf in
  // functions/friends.js, which stamps the weekly EXP on ranking rows.
  SYS.currentWeekKey = function (date) {
    const now = date || new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return d.getUTCFullYear() + "-W" + String(Math.ceil(((d - yearStart) / 86400000 + 1) / 7)).padStart(2, "0");
  };
  SYS.PROFILE_BIO_MAX = 120;

  // Units a recurring habit can be measured in, grouped for the quest form's
  // dropdown. "Custom…" lets the user type any label not covered here.
  SYS.UNIT_GROUPS = [
    { label: "Count", units: ["reps", "times", "pages", "steps", "sets"] },
    { label: "Time", units: ["sec", "min", "hr"] },
    { label: "Volume", units: ["ml", "L"] },
    { label: "Distance", units: ["m", "km"] },
    { label: "Weight", units: ["g", "kg"] },
  ];
  // The habit library, as the picker needs it: what to draw and what to send.
  //
  // The price is deliberately absent. It is decided by priceLibraryHabit in
  // functions/index.js and cached there per habit and schedule — a price the
  // client could state is a price the client could raise, and every EXP entry
  // is checked against one the server issued.
  //
  // Ids must match functions/presets.js exactly; that is what the client sends
  // and all the server accepts. Titles come from the translation table under
  // "preset.<id>", so the habit arrives in the language the app is in.
  SYS.LIBRARY_CATEGORIES = ["body", "mind", "work", "people", "home", "craft", "nature"];
  SYS.HABIT_LIBRARY = [
    { id: "water", category: "body", emoji: "💧", unit: "L", targetAmount: 2, schedule: { type: "daily" } },
    { id: "steps", category: "body", emoji: "🚶", unit: "steps", targetAmount: 8000, schedule: { type: "daily" } },
    { id: "workout", category: "body", emoji: "🏋️", unit: "min", targetAmount: 45, schedule: { type: "weekdays", days: [1, 3, 5] } },
    { id: "stretch", category: "body", emoji: "🧘", unit: "min", targetAmount: 10, schedule: { type: "daily" } },
    { id: "sleepEarly", category: "body", emoji: "🌙", unit: "times", targetAmount: 1, schedule: { type: "daily" } },
    { id: "cookHome", category: "body", emoji: "🍳", unit: "times", targetAmount: 1, schedule: { type: "perWeek", n: 4 } },
    { id: "outdoors", category: "body", emoji: "🌿", unit: "min", targetAmount: 60, schedule: { type: "perWeek", n: 1 } },

    { id: "read", category: "mind", emoji: "📚", unit: "pages", targetAmount: 20, schedule: { type: "daily" } },
    { id: "meditate", category: "mind", emoji: "🕯️", unit: "min", targetAmount: 10, schedule: { type: "daily" } },
    { id: "journal", category: "mind", emoji: "📝", unit: "times", targetAmount: 1, schedule: { type: "daily" } },
    { id: "language", category: "mind", emoji: "🗣️", unit: "min", targetAmount: 15, schedule: { type: "daily" } },
    { id: "noPhoneMorning", category: "mind", emoji: "📵", unit: "times", targetAmount: 1, schedule: { type: "daily" } },

    { id: "deepWork", category: "work", emoji: "🎯", unit: "min", targetAmount: 60, schedule: { type: "weekdays", days: [1, 2, 3, 4, 5] } },
    { id: "study", category: "work", emoji: "📖", unit: "min", targetAmount: 45, schedule: { type: "perWeek", n: 5 } },
    { id: "code", category: "work", emoji: "💻", unit: "min", targetAmount: 45, schedule: { type: "perWeek", n: 4 } },
    { id: "planDay", category: "work", emoji: "🗒️", unit: "min", targetAmount: 5, schedule: { type: "weekdays", days: [1, 2, 3, 4, 5] } },
    { id: "weekReview", category: "work", emoji: "🧭", unit: "min", targetAmount: 20, schedule: { type: "perWeek", n: 1 } },


    { id: "callFamily", category: "people", emoji: "📞", unit: "times", targetAmount: 1, schedule: { type: "perWeek", n: 2 } },
    { id: "seeFriends", category: "people", emoji: "🤝", unit: "times", targetAmount: 1, schedule: { type: "perWeek", n: 1 } },
    { id: "volunteer", category: "people", emoji: "🫱", unit: "hr", targetAmount: 2, schedule: { type: "perMonth", n: 1 } },

    { id: "tidy", category: "home", emoji: "🧹", unit: "min", targetAmount: 10, schedule: { type: "daily" } },
    { id: "laundry", category: "home", emoji: "🧺", unit: "times", targetAmount: 1, schedule: { type: "perWeek", n: 1 } },
    { id: "budget", category: "home", emoji: "🧾", unit: "times", targetAmount: 1, schedule: { type: "perMonth", n: 1 } },

    { id: "instrument", category: "craft", emoji: "🎹", unit: "min", targetAmount: 20, schedule: { type: "perWeek", n: 4 } },
    { id: "draw", category: "craft", emoji: "✏️", unit: "min", targetAmount: 15, schedule: { type: "perWeek", n: 3 } },
    { id: "photo", category: "craft", emoji: "📷", unit: "min", targetAmount: 30, schedule: { type: "perWeek", n: 1 } },

    { id: "run", category: "body", emoji: "🏃", unit: "km", targetAmount: 5, schedule: { type: "perWeek", n: 3 } },
    { id: "pushups", category: "body", emoji: "💪", unit: "reps", targetAmount: 30, schedule: { type: "daily" } },
    { id: "veggies", category: "body", emoji: "🥗", unit: "times", targetAmount: 2, schedule: { type: "daily" } },
    { id: "sleep8", category: "body", emoji: "😴", unit: "hr", targetAmount: 8, schedule: { type: "daily" } },
    { id: "coldShower", category: "body", emoji: "🚿", unit: "times", targetAmount: 1, schedule: { type: "daily" } },
    { id: "swim", category: "body", emoji: "🏊", unit: "min", targetAmount: 30, schedule: { type: "perWeek", n: 2 } },
    { id: "cycle", category: "body", emoji: "🚴", unit: "km", targetAmount: 10, schedule: { type: "perWeek", n: 2 } },
    { id: "selfDefense", category: "body", emoji: "🥋", unit: "min", targetAmount: 45, schedule: { type: "perWeek", n: 2 } },

    { id: "gratitude", category: "mind", emoji: "🙏", unit: "times", targetAmount: 1, schedule: { type: "daily" } },
    { id: "podcast", category: "mind", emoji: "🎧", unit: "min", targetAmount: 20, schedule: { type: "perWeek", n: 4 } },
    { id: "puzzle", category: "mind", emoji: "🧩", unit: "min", targetAmount: 15, schedule: { type: "perWeek", n: 4 } },
    { id: "writeDaily", category: "mind", emoji: "✍️", unit: "min", targetAmount: 20, schedule: { type: "perWeek", n: 5 } },
    { id: "noSocial", category: "mind", emoji: "📵", unit: "times", targetAmount: 1, schedule: { type: "daily" } },
    { id: "wakeEarly", category: "mind", emoji: "⏰", unit: "times", targetAmount: 1, schedule: { type: "daily" } },

    { id: "inboxZero", category: "work", emoji: "📥", unit: "times", targetAmount: 1, schedule: { type: "weekdays", days: [1, 2, 3, 4, 5] } },
    { id: "studySkill", category: "work", emoji: "🎓", unit: "min", targetAmount: 30, schedule: { type: "perWeek", n: 5 } },
    { id: "sideProject", category: "work", emoji: "🚀", unit: "min", targetAmount: 45, schedule: { type: "perWeek", n: 3 } },
    { id: "networking", category: "work", emoji: "🔗", unit: "times", targetAmount: 1, schedule: { type: "perWeek", n: 1 } },
    { id: "readNews", category: "work", emoji: "📰", unit: "min", targetAmount: 15, schedule: { type: "weekdays", days: [1, 2, 3, 4, 5] } },

    { id: "familyTime", category: "people", emoji: "👨‍👩‍👧", unit: "min", targetAmount: 30, schedule: { type: "daily" } },
    { id: "thankYouMsg", category: "people", emoji: "💌", unit: "times", targetAmount: 1, schedule: { type: "perWeek", n: 2 } },
    { id: "helpSomeone", category: "people", emoji: "🤲", unit: "times", targetAmount: 1, schedule: { type: "perWeek", n: 1 } },
    { id: "teachSomeone", category: "people", emoji: "👩‍🏫", unit: "min", targetAmount: 20, schedule: { type: "perWeek", n: 1 } },

    { id: "dishes", category: "home", emoji: "🍽️", unit: "times", targetAmount: 1, schedule: { type: "daily" } },
    { id: "declutter", category: "home", emoji: "📦", unit: "min", targetAmount: 15, schedule: { type: "perWeek", n: 1 } },
    { id: "mealPrep", category: "home", emoji: "🥘", unit: "min", targetAmount: 60, schedule: { type: "perWeek", n: 1 } },
    { id: "groceries", category: "home", emoji: "🛒", unit: "times", targetAmount: 1, schedule: { type: "perWeek", n: 1 } },

    { id: "sing", category: "craft", emoji: "🎤", unit: "min", targetAmount: 15, schedule: { type: "perWeek", n: 3 } },
    { id: "compose", category: "craft", emoji: "🎼", unit: "min", targetAmount: 20, schedule: { type: "perWeek", n: 2 } },
    { id: "designPractice", category: "craft", emoji: "🎨", unit: "min", targetAmount: 30, schedule: { type: "perWeek", n: 2 } },
    { id: "model3d", category: "craft", emoji: "🧱", unit: "min", targetAmount: 30, schedule: { type: "perWeek", n: 2 } },
    { id: "handcraft", category: "craft", emoji: "🧶", unit: "min", targetAmount: 30, schedule: { type: "perWeek", n: 2 } },
    { id: "acting", category: "craft", emoji: "🎭", unit: "min", targetAmount: 20, schedule: { type: "perWeek", n: 2 } },

    { id: "plants", category: "nature", emoji: "🪴", unit: "times", targetAmount: 1, schedule: { type: "perWeek", n: 2 } },
    { id: "walkOutdoors", category: "nature", emoji: "🌳", unit: "min", targetAmount: 30, schedule: { type: "perWeek", n: 3 } },
    { id: "natureLearn", category: "nature", emoji: "🔎", unit: "min", targetAmount: 20, schedule: { type: "perWeek", n: 1 } },
    { id: "hike", category: "nature", emoji: "🥾", unit: "hr", targetAmount: 2, schedule: { type: "perMonth", n: 2 } },
  ];

  SYS.libraryPreset = function (id) {
    return SYS.HABIT_LIBRARY.find((p) => p.id === id) || null;
  };

  SYS.TIME_UNITS = SYS.UNIT_GROUPS.find((g) => g.label === "Time").units;
  SYS.isTimeUnit = function (unit) { return SYS.TIME_UNITS.includes(unit); };

  // How many of a group's smallest unit each unit is worth.
  //
  // Progress is stored in that smallest unit — millilitres, seconds, metres,
  // grams — and never in the habit's own. Adding 100 ml to a 1 L goal ten
  // times has to finish it, and in floating point 0.1 added ten times is
  // 0.9999999999999999, which would leave the goal one hair short and the
  // habit unfinished for no reason a person could see. Integers of the small
  // unit have no such edge.
  //
  // A count unit is its own base: pages do not convert into reps, and nobody
  // wants to log half a page.
  SYS.UNIT_FACTOR = {
    sec: 1, min: 60, hr: 3600,
    ml: 1, L: 1000,
    m: 1, km: 1000,
    g: 1, kg: 1000,
  };

  // Units that can be added toward a goal measured in this one — the habit's
  // own unit always, plus anything sharing its group. An unknown or custom
  // unit converts to nothing but itself.
  SYS.unitFamily = function (unit) {
    const group = SYS.UNIT_GROUPS.find((g) => g.units.includes(unit));
    if (!group || group.label === "Count") return [unit];
    return group.units.slice();
  };

  SYS.unitFactor = function (unit) {
    const f = SYS.UNIT_FACTOR[unit];
    return typeof f === "number" ? f : 1;
  };

  // A value in one unit expressed in the group's smallest. Returns null when
  // the two cannot be compared at all, so a caller has to decide rather than
  // silently treating pages as kilometres.
  SYS.toBase = function (value, unit, goalUnit) {
    const v = Number(value);
    if (!Number.isFinite(v)) return null;
    if (unit === goalUnit) return v * SYS.unitFactor(unit);
    if (!SYS.unitFamily(goalUnit).includes(unit)) return null;
    return v * SYS.unitFactor(unit);
  };

  // Back the other way, for display. Rounded to three decimals: the stored
  // number is exact, this is only what gets shown.
  SYS.fromBase = function (base, unit) {
    const v = Number(base) / SYS.unitFactor(unit);
    return Math.round(v * 1000) / 1000;
  };

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

  // The help system. One topic per thing that used to carry a caption: the
  // ten pages, then the ideas the application invented and nothing else in
  // the world would explain. Each topic reads two strings, help.<topic>.t and
  // help.<topic>.b, so adding one is a topic here and two strings in i18n.
  //
  // The order is the order the index lists them in: where you are, then what
  // the words mean.
  SYS.HELP_TOPICS = [
    "overview", "quests", "habits", "planner", "stats",
    "leaderboard", "friends", "intelligence", "mail", "log",
    "exp", "rank", "level", "verification", "traits", "streak",
  ];

  // The eight built-in intelligences have drawn emblems in assets/intel. A
  // category a user adds themselves has none, so it keeps its short code —
  // the same arrangement as the rank emblems, where an unlisted rank falls
  // back to its letter.
  // Where a trait level sits. A bare number has no scale, no ceiling and no
  // milestone — "Reflection & thinking: 13" is thirteen of what — and unlike
  // every other ladder here its cost never rises, so 80 means eighty times
  // rather than somewhere hard to reach. A name gives the number a place.
  //
  // The steps widen because the work does not: each tier is roughly twice the
  // one before, so the first arrives soon enough to be felt and the last is
  // worth arriving at.
  SYS.TRAIT_TIERS = [
    { min: 100, key: "master" },
    { min: 50, key: "advanced" },
    { min: 25, key: "skilled" },
    { min: 10, key: "practised" },
    { min: 1, key: "novice" },
  ];
  SYS.traitTier = function (level) {
    const n = Number(level) || 0;
    const hit = SYS.TRAIT_TIERS.find((t) => n >= t.min);
    return hit ? hit.key : null;
  };

  // What a category has to be worth before its emblem is worn.
  //
  // The intelligences described a person and did nothing: nothing was gated by
  // them, nothing unlocked, and the only page that read them was their own.
  // Past this, a category's emblem sits beside the name — in the status bar,
  // which is on every page, and on the profile, which other people see. It is
  // the one thing in the app you can only get here.
  //
  // The number is a guess and should be the first thing tuned once there is
  // real data: a hundred points is ten thousand EXP routed into one category
  // at the opening rate, which is a long commitment and no more than that.
  SYS.CATEGORY_EMBLEM_AT = 100;

  // How many days of score snapshots to keep. Ninety is what the radar's
  // second outline asks for; the rest is room for a gap, since a day with no
  // EXP writes nothing and the window has to reach past it.
  SYS.SCORE_LOG_DAYS = 120;

  SYS.INT_ART = ["self", "social", "linguistic", "logical", "bodily", "natural", "visual", "musical"];
  // Each emblem exists twice: gold with ivory panels for the dark themes,
  // and black with gold edges for the light ones. Half of every gold emblem
  // measured invisible on a white card — the ivory panels went white on
  // white — so the light set inverts the metal rather than dimming it.
  SYS.intArtSrc = function (key, px, light) {
    return "assets/intel/" + key + (px > 48 ? "" : "-48") + (light ? "-light" : "") + ".png";
  };

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
  SYS.THEMES = {
    "Black & dark gold": {
      dark: true,
      pageBg: "#050505", appBg: "linear-gradient(178deg,#141210 0%,#0e0d0b 46%,#070707 100%)",
      ink: "#f4f1ea", inkStrong: "#ffffff", body: "rgba(244,241,234,0.6)", dim: "rgba(244,241,234,0.55)", faint: "rgba(244,241,234,0.49)",
      card: "rgba(244,241,234,0.05)", border: "rgba(244,241,234,0.1)", track: "rgba(244,241,234,0.11)",
      gold: "#9a6a1c", goldText: "#e2b467", onGold: "#ffffff",
      goldSoft: "rgba(154,106,28,0.2)", goldBorder: "rgba(154,106,28,0.45)",
      barGold: "linear-gradient(90deg,#9a6a1c,#e2b467)",
      barToday: "linear-gradient(180deg,#e2b467,#9a6a1c)", barIdle: "rgba(244,241,234,0.28)", barPrev: "rgba(244,241,234,0.72)",
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
      ink: "#f4f1ea", inkStrong: "#ffffff", body: "rgba(244,241,234,0.6)", dim: "rgba(244,241,234,0.55)", faint: "rgba(244,241,234,0.49)",
      card: "rgba(244,241,234,0.05)", border: "rgba(244,241,234,0.1)", track: "rgba(244,241,234,0.11)",
      gold: "#b3946c", goldText: "#e6be8a", onGold: "#0b0a08",
      goldSoft: "rgba(179,148,108,0.2)", goldBorder: "rgba(179,148,108,0.45)",
      barGold: "linear-gradient(90deg,#b3946c,#e6be8a)",
      barToday: "linear-gradient(180deg,#e6be8a,#b3946c)", barIdle: "rgba(244,241,234,0.28)", barPrev: "rgba(244,241,234,0.86)",
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
      ink: "#f4f1ea", inkStrong: "#ffffff", body: "rgba(244,241,234,0.6)", dim: "rgba(244,241,234,0.55)", faint: "rgba(244,241,234,0.49)",
      card: "rgba(244,241,234,0.05)", border: "rgba(244,241,234,0.1)", track: "rgba(244,241,234,0.11)",
      gold: "#c3bb94", goldText: "#faf0be", onGold: "#0b0a08",
      goldSoft: "rgba(195,187,148,0.2)", goldBorder: "rgba(195,187,148,0.45)",
      barGold: "linear-gradient(90deg,#c3bb94,#faf0be)",
      barToday: "linear-gradient(180deg,#faf0be,#c3bb94)", barIdle: "rgba(244,241,234,0.28)", barPrev: "rgba(244,241,234,0.44)",
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
      ink: "#f3efe9", inkStrong: "#ffffff", body: "rgba(243,239,233,0.6)", dim: "rgba(243,239,233,0.55)", faint: "rgba(243,239,233,0.49)",
      card: "rgba(243,239,233,0.05)", border: "rgba(243,239,233,0.1)", track: "rgba(243,239,233,0.11)",
      gold: "#a9764f", goldText: "#d6a680", onGold: "#120d09",
      goldSoft: "rgba(169,118,79,0.2)", goldBorder: "rgba(169,118,79,0.45)",
      barGold: "linear-gradient(90deg,#a9764f,#d6a680)",
      barToday: "linear-gradient(180deg,#d6a680,#a9764f)", barIdle: "rgba(243,239,233,0.28)", barPrev: "rgba(243,239,233,0.8)",
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
  };

  // ---------------------------------------------------------------------
  // Theme engine
  //
  // The palettes above are the single source of truth: applyTheme writes
  // every value onto the document as a CSS custom property. styles.css still
  // defines :root as a static fallback, but nothing needs to be added there
  // for a new theme. The first paint is covered instead by BOOT_THEME_KEY
  // below, which is a snapshot of what applyTheme last wrote.
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

  // Which palette belongs on screen right now. Every caller goes through
  // this rather than reading settings.theme, so the clock is honoured in one
  // place instead of four.
  SYS.resolvedThemeName = function (state) {
    return (state.settings || {}).theme;
  };

  // The shop, as functions/shop.js prices it (tests/test-shop.js holds the
  // two together). Only dark themes exist since 2026-10-07; one comes with
  // every account and the rest are bought with gold.
  // Art still being drawn; its CSS stand-in shows until the file lands.
  SYS.ART_PENDING = { shop: false };
  // Page art drawn after the light themes were withdrawn has no light copy.
  SYS.DARK_ONLY_ART = ["shop"];

  SYS.SHOP = {
    goldPerExp: 10,
    freeTheme: "Black & dark gold",
    themePrices: { "Black & pale gold": 10000, "Black & blond": 10000, "Black & light brown": 10000 },
    freezePrice: 5000,
    freezeMax: 2,
    framePrices: { hud: 450 },
    aureniteOnSale: false,
  };

  SYS.getTheme = function (state) {
    // An unknown name falls through to the default rather than to a blank
    // page — retired themes and typos land in the same place.
    return SYS.THEMES[SYS.resolvedThemeName(state)] || SYS.THEMES[SYS.DEFAULT_SETTINGS.theme];
  };

  // The whole resolved palette, kept for the next first paint. index.html
  // reads this key in a tiny inline script: without it the first paint is
  // whatever :root hardcodes, which is one palette out of seven. Half a
  // palette would be worse than none — a light page with dark cards — so the
  // crumb carries every value, not just the background.
  SYS.BOOT_THEME_KEY = "sys.boot-theme";

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
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme.pageBg);
    try {
      localStorage.setItem(SYS.BOOT_THEME_KEY, JSON.stringify(theme));
    } catch (e) { /* storage blocked: the next first paint falls back to :root */ }
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
    SYS.legacySeedTasks().forEach((t) => {
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

  // The assessment. Forty statements, one per trait, asked in a round-robin so
  // five about the same category never arrive together — answering the same
  // subject five times running drags each answer toward the one before it.
  //
  // Every statement is about a BEHAVIOUR in a stated window, never an opinion
  // of oneself: "in the last month I finished a book" can be answered; "how
  // literate are you" cannot. Each names one trait, by the exact name in
  // seedIntelligences — scoreAssessment matches on it, and a typo would hand
  // the points to nobody.
  SYS.ASSESSMENT = [
    { id: "sf1", key: "self", trait: "Reflection & thinking" },
    { id: "so1", key: "social", trait: "Social interaction" },
    { id: "li1", key: "linguistic", trait: "Reading" },
    { id: "lo1", key: "logical", trait: "Puzzle solving" },
    { id: "bo1", key: "bodily", trait: "Daily exercise" },
    { id: "na1", key: "natural", trait: "Outdoor activities" },
    { id: "vi1", key: "visual", trait: "Drawing" },
    { id: "mu1", key: "musical", trait: "Playing an instrument" },
    { id: "sf2", key: "self", trait: "Time management" },
    { id: "so2", key: "social", trait: "Effective communication" },
    { id: "li2", key: "linguistic", trait: "Writing" },
    { id: "lo2", key: "logical", trait: "Critical thinking" },
    { id: "bo2", key: "bodily", trait: "Sports" },
    { id: "na2", key: "natural", trait: "Learning about the environment" },
    { id: "vi2", key: "visual", trait: "Photography" },
    { id: "mu2", key: "musical", trait: "Active listening" },
    { id: "sf3", key: "self", trait: "Discipline & consistency" },
    { id: "so3", key: "social", trait: "Empathy & listening" },
    { id: "li3", key: "linguistic", trait: "Speaking" },
    { id: "lo3", key: "logical", trait: "Problem solving" },
    { id: "bo3", key: "bodily", trait: "Handcrafts" },
    { id: "na3", key: "natural", trait: "Farming & gardening" },
    { id: "vi3", key: "visual", trait: "Graphic design" },
    { id: "mu3", key: "musical", trait: "Vocal training" },
    { id: "sf4", key: "self", trait: "Focus & attention" },
    { id: "so4", key: "social", trait: "Teamwork" },
    { id: "li4", key: "linguistic", trait: "Language learning" },
    { id: "lo4", key: "logical", trait: "Systems & planning" },
    { id: "bo4", key: "bodily", trait: "Strength training" },
    { id: "na4", key: "natural", trait: "Animal care" },
    { id: "vi4", key: "visual", trait: "Space arrangement" },
    { id: "mu4", key: "musical", trait: "Rhythm & timing" },
    { id: "sf5", key: "self", trait: "Sleep & rest" },
    { id: "so5", key: "social", trait: "Friendships" },
    { id: "li5", key: "linguistic", trait: "Public speaking" },
    { id: "lo5", key: "logical", trait: "Mathematics" },
    { id: "bo5", key: "bodily", trait: "Health" },
    { id: "na5", key: "natural", trait: "Sustainability & recycling" },
    { id: "vi5", key: "visual", trait: "Maps & orientation" },
    { id: "mu5", key: "musical", trait: "Performing" },
  ];

  // What the whole assessment may hand out, however it is answered. The
  // answers decide WHERE the points go, never how many there are: agreeing
  // strongly with all forty spreads the same forty points across eight
  // categories instead of multiplying them. Inflating every answer is
  // therefore pointless by construction rather than by policing.
  SYS.ASSESSMENT_BUDGET = 40;
  // And no single category may take more than this of it. Without it, a
  // person who claims one field and nothing else walks out of a ten-minute
  // test with more than a year of real work puts into a category.
  SYS.ASSESSMENT_CATEGORY_CAP = 12;
  // The scale is 1..5 and only agreement earns: the weight of an answer is
  // what it exceeds the midpoint by, so 3 is worth nothing and 1 is worth
  // nothing more than 3. "Does not apply" is its own answer, worth zero and
  // recorded as ground never walked on — which is exactly what the weekly
  // suggestion wants to know.
  SYS.ASSESSMENT_MID = 3;
  SYS.ASSESSMENT_NA = "na";

  // Traits withdrawn from the standard list after they had already shipped.
  //
  // syncIndexWithSeed only ever adds, so dropping a name from the seed leaves
  // it sitting on every account that already synced it. These are pruned
  // instead — but ONLY where the level is zero. A trait somebody earned
  // against is never taken away, whatever we have decided about the list.
  //
  // "Recitation & tajweed" lasted one day: the app is for every religion and
  // every society, and a trait only one of them can answer does not belong in
  // a standard vocabulary. Musical keeps eight.
  SYS.RETIRED_TRAITS = [
    { key: "musical", name: "Recitation & tajweed" },
  ];

  // Every level here is zero, and it has to stay that way. These numbers
  // used to be one person's own standing — Reflection & thinking at 13,
  // Sports at 9 — shipped as the opening position of every account ever
  // created. The assessment paints a starting picture now, and it paints it
  // from the person in front of it.
  //
  // The standard trait list. One shared vocabulary, because the per-user
  // assessment has to put everyone on the same scale — a list that drifted
  // per account could not be measured or compared, which is why the model is
  // forbidden from inventing names and why users cannot add their own.
  //
  // Three rules bind anyone editing this:
  //
  // 1. ADDITIVE ONLY. syncIndexWithSeed adds what is missing and never
  //    removes or renames, so an existing name is load-bearing: accounts
  //    carry levels against it. Renaming strands the old one and starts the
  //    new at zero; removing leaves it behind on every account that has it.
  //    ("Sports coaching & training" is misfiled under Logical for exactly
  //    this reason — it cannot be moved until there is a real migration.
  //    "Teaching & mentoring" was added to Social so new routing lands right.)
  //
  // 2. TWELVE PER CATEGORY, MAXIMUM. Both the evaluator and the quest
  //    suggester send `traits.slice(0, 12)` — the FIRST twelve, not the best
  //    twelve. A thirteenth is invisible to the model, so work that belongs
  //    to it gets routed somewhere else instead. Raising the ceiling means
  //    three files (js/cloud.js, functions/evaluation-prompt.js,
  //    functions/index.js) and more tokens on every evaluation.
  //
  // 3. NEW IDS ARE DERIVED FROM THE NAME, never invented. A new account takes
  //    its ids from here and an existing one gets them from syncIndexWithSeed;
  //    if the two disagree the copies compare unequal and the app asks "which
  //    copy do you want to keep?" on every launch. The rule is
  //    "seed_<category>_<name with everything but letters and digits removed>".
  //
  // Categories are not padded to twelve. Naturalist holds ten and Musical
  // nine: those fields have fewer genuinely distinct activities, and filling
  // the space with overlapping names gives the model more to confuse rather
  // than more to choose from.
  SYS.seedIntelligences = function () {
    return {
      self: { remainder: 0, traitRemainder: {}, traits: [
        { id: "t1", name: "Self-motivation", ar: "التحفيز الذاتي", level: 0 },
        { id: "t2", name: "Reflection & thinking", ar: "التأمل والتفكير", level: 0 },
        { id: "t3", name: "Personal goal-setting", ar: "تحديد الأهداف الشخصية", level: 0 },
        { id: "t4", name: "Self-evaluation", ar: "التقييم الذاتي", level: 0 },
        { id: "t5", name: "Time management", ar: "تنظيم الوقت", level: 0 },
        { id: "seed_self_emotionalregulation", name: "Emotional regulation", ar: "تنظيم الانفعالات", level: 0 },
        { id: "seed_self_disciplineconsistency", name: "Discipline & consistency", ar: "الانضباط والاستمرارية", level: 0 },
        { id: "seed_self_focusattention", name: "Focus & attention", ar: "التركيز والانتباه", level: 0 },
        { id: "seed_self_stressmanagement", name: "Stress management", ar: "إدارة الضغط", level: 0 },
        { id: "seed_self_sleeprest", name: "Sleep & rest", ar: "النوم والراحة", level: 0 },
        { id: "seed_self_learningskills", name: "Learning skills", ar: "مهارات التعلّم", level: 0 },
        { id: "seed_self_personalfinance", name: "Personal finance", ar: "إدارة المال الشخصي", level: 0 },
      ]},
      social: { remainder: 0, traitRemainder: {}, traits: [
        { id: "t1", name: "Volunteering", ar: "العمل التطوعي", level: 0 },
        { id: "t2", name: "Social interaction", ar: "التفاعل الاجتماعي", level: 0 },
        { id: "t3", name: "Participating in social activities", ar: "المشاركة في الأنشطة الاجتماعية", level: 0 },
        { id: "t4", name: "Effective communication", ar: "التواصل الفعال", level: 0 },
        { id: "seed_social_empathylistening", name: "Empathy & listening", ar: "التعاطف والإنصات", level: 0 },
        { id: "seed_social_teamwork", name: "Teamwork", ar: "العمل الجماعي", level: 0 },
        { id: "seed_social_leadership", name: "Leadership", ar: "القيادة", level: 0 },
        { id: "seed_social_conflictresolution", name: "Conflict resolution", ar: "حل الخلافات", level: 0 },
        { id: "seed_social_negotiationpersuasion", name: "Negotiation & persuasion", ar: "التفاوض والإقناع", level: 0 },
        { id: "seed_social_friendships", name: "Friendships", ar: "بناء الصداقات", level: 0 },
        { id: "seed_social_familyrelationships", name: "Family relationships", ar: "العلاقات الأسرية", level: 0 },
        { id: "seed_social_teachingmentoring", name: "Teaching & mentoring", ar: "التعليم والإرشاد", level: 0 },
      ]},
      linguistic: { remainder: 0, traitRemainder: {}, traits: [
        { id: "t1", name: "Reading", ar: "القراءة", level: 0 },
        { id: "t2", name: "Writing", ar: "الكتابة", level: 0 },
        { id: "t3", name: "Speaking", ar: "التحدث", level: 0 },
        { id: "t4", name: "Language learning", ar: "تعلم اللغات", level: 0 },
        { id: "seed_linguistic_publicspeaking", name: "Public speaking", ar: "الخطابة وإلقاء العروض", level: 0 },
        { id: "seed_linguistic_storytelling", name: "Storytelling", ar: "السرد والحكي", level: 0 },
        { id: "seed_linguistic_vocabularyexpression", name: "Vocabulary & expression", ar: "الثروة اللغوية والتعبير", level: 0 },
        { id: "seed_linguistic_listeningcomprehension", name: "Listening comprehension", ar: "الاستيعاب السمعي", level: 0 },
        { id: "seed_linguistic_debateargument", name: "Debate & argument", ar: "المناظرة والحِجاج", level: 0 },
        { id: "seed_linguistic_poetry", name: "Poetry", ar: "الشعر", level: 0 },
        { id: "seed_linguistic_translation", name: "Translation", ar: "الترجمة", level: 0 },
        { id: "seed_linguistic_editingproofreading", name: "Editing & proofreading", ar: "التحرير والتدقيق", level: 0 },
      ]},
      logical: { remainder: 0, traitRemainder: {}, traits: [
        { id: "t1", name: "Data analysis", ar: "تحليل البيانات", level: 0 },
        { id: "t2", name: "Puzzle solving", ar: "حل الألغاز", level: 0 },
        { id: "t3", name: "Programming", ar: "تعلم البرمجة", level: 0 },
        { id: "t4", name: "Sports coaching & training", ar: "التعليم والتدريب الرياضي", level: 0 },
        { id: "seed_logical_mathematics", name: "Mathematics", ar: "الرياضيات", level: 0 },
        { id: "seed_logical_criticalthinking", name: "Critical thinking", ar: "التفكير النقدي", level: 0 },
        { id: "seed_logical_problemsolving", name: "Problem solving", ar: "حل المشكلات", level: 0 },
        { id: "seed_logical_systemsplanning", name: "Systems & planning", ar: "التفكير المنظومي والتخطيط", level: 0 },
        { id: "seed_logical_scientificmethod", name: "Scientific method", ar: "المنهج العلمي والتجريب", level: 0 },
        { id: "seed_logical_strategygames", name: "Strategy games", ar: "ألعاب الاستراتيجية", level: 0 },
        { id: "seed_logical_statisticsprobability", name: "Statistics & probability", ar: "الإحصاء والاحتمالات", level: 0 },
        { id: "seed_logical_research", name: "Research", ar: "البحث", level: 0 },
      ]},
      bodily: { remainder: 0, traitRemainder: {}, traits: [
        { id: "t1", name: "Yoga", ar: "اليوغا", level: 0 },
        { id: "t2", name: "Sports", ar: "الرياضة", level: 0 },
        { id: "t3", name: "Self-defense techniques", ar: "تقنيات الدفاع عن النفس", level: 0 },
        { id: "t4", name: "Handcrafts", ar: "المهارات اليدوية", level: 0 },
        { id: "t5", name: "Daily exercise", ar: "التمارين اليومية", level: 0 },
        { id: "t6", name: "Acting", ar: "التمثيل", level: 0 },
        { id: "t7", name: "Health", ar: "الصحة", level: 0 },
        { id: "seed_bodily_strengthtraining", name: "Strength training", ar: "تمارين القوة", level: 0 },
        { id: "seed_bodily_endurancecardio", name: "Endurance & cardio", ar: "التحمّل واللياقة", level: 0 },
        { id: "seed_bodily_flexibilitybalance", name: "Flexibility & balance", ar: "المرونة والتوازن", level: 0 },
        { id: "seed_bodily_dancemovement", name: "Dance & movement", ar: "الرقص والتعبير الحركي", level: 0 },
        { id: "seed_bodily_recoveryinjurycare", name: "Recovery & injury care", ar: "التعافي والوقاية من الإصابات", level: 0 },
      ]},
      natural: { remainder: 0, traitRemainder: {}, traits: [
        { id: "t1", name: "Survival techniques", ar: "تقنيات البقاء في الطبيعة", level: 0 },
        { id: "t2", name: "Outdoor activities", ar: "الأنشطة الخارجية", level: 0 },
        { id: "t3", name: "Learning about the environment", ar: "التعلم عن البيئة", level: 0 },
        { id: "t4", name: "Farming & gardening", ar: "الزراعة والبستنة", level: 0 },
        { id: "seed_natural_animalcare", name: "Animal care", ar: "رعاية الحيوانات", level: 0 },
        { id: "seed_natural_plantknowledge", name: "Plant knowledge", ar: "معرفة النباتات", level: 0 },
        { id: "seed_natural_hikingnavigation", name: "Hiking & navigation", ar: "المشي الطويل والتوجّه", level: 0 },
        { id: "seed_natural_sustainabilityrecycling", name: "Sustainability & recycling", ar: "الاستدامة وإعادة التدوير", level: 0 },
        { id: "seed_natural_astronomythenightsky", name: "Astronomy & the night sky", ar: "الفلك ومراقبة السماء", level: 0 },
        { id: "seed_natural_camping", name: "Camping", ar: "التخييم", level: 0 },
      ]},
      visual: { remainder: 0, traitRemainder: {}, traits: [
        { id: "t1", name: "3D planning", ar: "التخطيط ثلاثي الأبعاد", level: 0 },
        { id: "t2", name: "Graphic design", ar: "التصميم الجرافيكي", level: 0 },
        { id: "t3", name: "Photography", ar: "التصوير", level: 0 },
        { id: "t4", name: "Drawing", ar: "الرسم", level: 0 },
        { id: "seed_visual_paintingcolour", name: "Painting & colour", ar: "التلوين واللون", level: 0 },
        { id: "seed_visual_videoediting", name: "Video & editing", ar: "التصوير والمونتاج", level: 0 },
        { id: "seed_visual_spacearrangement", name: "Space arrangement", ar: "تنسيق المساحات", level: 0 },
        { id: "seed_visual_mapsorientation", name: "Maps & orientation", ar: "الخرائط والتوجّه المكاني", level: 0 },
        { id: "seed_visual_calligraphy", name: "Calligraphy", ar: "الخط", level: 0 },
        { id: "seed_visual_sculptingmodelling", name: "Sculpting & modelling", ar: "النحت والتشكيل", level: 0 },
        { id: "seed_visual_animation", name: "Animation", ar: "الرسم المتحرك", level: 0 },
        { id: "seed_visual_visualmemory", name: "Visual memory", ar: "الذاكرة البصرية", level: 0 },
      ]},
      musical: { remainder: 0, traitRemainder: {}, traits: [
        { id: "t1", name: "Playing an instrument", ar: "العزف على آلة موسيقية", level: 0 },
        { id: "t2", name: "Active listening", ar: "الاستماع النشط", level: 0 },
        { id: "t3", name: "Vocal training", ar: "التدريب الصوتي", level: 0 },
        { id: "t4", name: "Musical creativity", ar: "الإبداع الموسيقي", level: 0 },
        { id: "seed_musical_rhythmtiming", name: "Rhythm & timing", ar: "الإيقاع والتوقيت", level: 0 },
        { id: "seed_musical_musictheory", name: "Music theory", ar: "نظرية الموسيقى", level: 0 },
        { id: "seed_musical_eartraining", name: "Ear training", ar: "التدريب السمعي", level: 0 },
        { id: "seed_musical_performing", name: "Performing", ar: "الأداء أمام جمهور", level: 0 },
      ]},
    };
  };

  // What every account used to open on: one person's own list, 3,900 pt of
  // quests no evaluator priced, two of them opening part-done. A new account
  // starts empty now — adding a task needs an account, because the System sets
  // its value. Kept only so syncSeedTaskTargets can still fix the copies that
  // older accounts carry.
  SYS.legacySeedTasks = function () {
    const raw = [
      { title: "Reading “Animal Farm”", priority: "Medium", taskType: "Long Term", types: ["linguistic"], pt: 500, mode: "gradual", completion: 0, notes: "", traitTargets: [{ category: "linguistic", trait: "Reading" }] },
      { title: "Commitment in Exercises for two weeks", priority: "High", taskType: "Short Term", types: ["self"], pt: 1000, mode: "simple", completion: 0, notes: "", traitTargets: [{ category: "self", trait: "Self-motivation" }] },
      { title: "Writing with the other hand", priority: "Low", taskType: "Medium Term", types: ["linguistic"], pt: 300, mode: "simple", completion: 0, notes: "", traitTargets: [{ category: "linguistic", trait: "Writing" }] },
      { title: "Performing daily habits", priority: "High", taskType: "Long Term", types: [], pt: 100, mode: "gradual", completion: 40, notes: "" },
      { title: "Fast typing on the keyboard", priority: "High", taskType: "Long Term", types: ["bodily"], pt: 2000, mode: "gradual", completion: 30, notes: "", traitTargets: [{ category: "bodily", trait: "Handcrafts" }] },
    ];
    const recurring = [
      { title: "Drink water", priority: "Medium", types: ["bodily"], pt: 20, notes: "", recurring: true, schedule: { type: "daily" }, unit: "L", targetAmount: 2, days: {}, traitTargets: [{ category: "bodily", trait: "Health" }] },
      { title: "Deep work session", priority: "High", types: ["self"], pt: 40, notes: "", recurring: true, schedule: { type: "weekdays", days: [1, 2, 3, 4, 5] }, unit: "min", targetAmount: 30, days: {}, traitTargets: [{ category: "self", trait: "Time management" }] },
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
      // Nothing to start with: every point of EXP is earned. (It used to open
      // on 55 that nobody did anything for.) Stamped with the curve so a fresh
      // account is never migrated.
      player: { name: "Hunter", rank: "G", level: 1, exp: 0, curve: 3, questsCompleted: 0, bankedPoints: 0, composition: {}, traitComposition: {} },
      intTypes: SYS.DEFAULT_INT_TYPES.map((t) => ({ ...t })),
      intelligences: SYS.seedIntelligences(),
      tasks: [],
      log: [],
      levelHistory: [],
      dailyStats: {},
      // Which of this week's proposed tasks have already been answered, so an
      // accepted or declined one doesn't reappear — including on another
      // device, which is why it rides along with the rest of the state rather
      // than sitting in local storage.
      suggestions: { weekKey: null, handled: [] },
      // The planner in memory — see js/planner.js. It is kept and synced on
      // its own (js/planner-sync.js), never saved as part of this state.
      planner: { todos: [], events: [] },
    };
  };
})(window.SYS = window.SYS || {});

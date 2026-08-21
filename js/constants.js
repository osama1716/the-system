// Shared constants + default/seed data. Attaches to window.SYS namespace.
(function (SYS) {
  "use strict";

  SYS.STORAGE_KEY = "the-system:v1";

  SYS.RANKS = ["G", "F", "E", "D", "C", "B", "A", "S"];

  // Priority/task-type badges use only the two functional accents the design
  // language defines (gold = notable, rust = urgent) plus dim for low-key —
  // no per-value rainbow, matching the single-accent system below.
  SYS.PRIORITY_COLOR = { Low: "dim", Medium: "gold", High: "rust" };

  // expDivisor: 1 means a task's Pt value IS its EXP value directly (a 500Pt task
  // = 500 EXP = 5 full levels, since a level is 100 EXP). Raise it only if you
  // deliberately want Pt to mean something bigger than raw EXP.
  SYS.DEFAULT_SETTINGS = { expDivisor: 1, pointsPerLevel: 3, theme: "Bronze dark" };

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
  SYS.THEMES = {
    "Bronze dark": {
      dark: true,
      pageBg: "#100d0a", appBg: "linear-gradient(178deg,#2a2118 0%,#1a1510 42%,#141110 100%)",
      ink: "#f4ede2", inkStrong: "#fdf7ec", body: "rgba(244,237,226,.55)", dim: "rgba(244,237,226,.42)", faint: "rgba(244,237,226,.3)",
      card: "rgba(244,237,226,.045)", border: "rgba(244,237,226,.075)", track: "rgba(244,237,226,.1)",
      gold: "#d9a05b", goldText: "#eec38d", onGold: "#1d1610",
      goldSoft: "rgba(217,160,91,.12)", goldBorder: "rgba(217,160,91,.3)",
      barGold: "linear-gradient(90deg,#a8712f,#d9a05b)",
      hubBg: "#1d1811", sheetBg: "#221b14", toastBg: "#2a2118",
      ringInner: "radial-gradient(circle at 50% 28%,#2b2118,#181410 78%)",
      levelUpBg: "radial-gradient(circle at 50% 26%,#3a2c1c,#141110 68%)",
      navFade: "linear-gradient(180deg,rgba(20,17,16,0),#141110 40%)",
      scrim: "rgba(12,10,8,.74)",
      hatch: "repeating-linear-gradient(135deg,rgba(244,237,226,.1) 0 6px,transparent 6px 12px)",
      ctaBg: "linear-gradient(120deg,rgba(217,160,91,.22),rgba(217,160,91,.07))", ctaInk: "#f6e2c6",
      rust: "#c66a45", rustSoft: "rgba(198,106,69,.06)", rustBorder: "rgba(198,106,69,.26)", rustText: "rgba(214,158,134,.7)",
      doneBg: "rgba(217,160,91,.07)", doneBorder: "rgba(217,160,91,.22)", doneTitle: "rgba(244,237,226,.5)", doneReward: "rgba(217,160,91,.65)",
    },
    "White & gold": {
      dark: false,
      pageBg: "#e9e7e2", appBg: "linear-gradient(178deg,#ffffff 0%,#fdfbf7 46%,#f6f3ec 100%)",
      ink: "#1c1813", inkStrong: "#141009", body: "rgba(28,24,19,.6)", dim: "rgba(28,24,19,.5)", faint: "rgba(28,24,19,.35)",
      card: "rgba(28,24,19,.032)", border: "rgba(28,24,19,.1)", track: "rgba(28,24,19,.09)",
      gold: "#a4762a", goldText: "#8a6320", onGold: "#ffffff",
      goldSoft: "rgba(164,118,42,.1)", goldBorder: "rgba(164,118,42,.28)",
      barGold: "linear-gradient(90deg,#c19844,#a4762a)",
      hubBg: "#ffffff", sheetBg: "#ffffff", toastBg: "#ffffff",
      ringInner: "radial-gradient(circle at 50% 28%,#ffffff,#faf7f0 78%)",
      levelUpBg: "radial-gradient(circle at 50% 26%,#fdf6e6,#ffffff 68%)",
      navFade: "linear-gradient(180deg,rgba(255,255,255,0),#faf8f3 40%)",
      scrim: "rgba(28,24,19,.38)",
      hatch: "repeating-linear-gradient(135deg,rgba(28,24,19,.12) 0 6px,transparent 6px 12px)",
      ctaBg: "linear-gradient(120deg,rgba(164,118,42,.16),rgba(164,118,42,.05))", ctaInk: "#6f4f18",
      rust: "#a8482a", rustSoft: "rgba(168,72,42,.06)", rustBorder: "rgba(168,72,42,.24)", rustText: "rgba(146,62,36,.85)",
      doneBg: "rgba(164,118,42,.08)", doneBorder: "rgba(164,118,42,.22)", doneTitle: "rgba(28,24,19,.45)", doneReward: "rgba(138,99,32,.7)",
    },
  };

  SYS.getTheme = function (state) {
    return SYS.THEMES[state.settings.theme] || SYS.THEMES["Bronze dark"];
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

  function uid(prefix) {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return (prefix || "id") + "_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  SYS.uid = uid;

  SYS.seedIntelligences = function () {
    return {
      self: { remainder: 0, traits: [
        { id: "t1", name: "Self-motivation", ar: "التحفيز الذاتي", level: 4 },
        { id: "t2", name: "Reflection & thinking", ar: "التأمل والتفكير", level: 13 },
        { id: "t3", name: "Personal goal-setting", ar: "تحديد الأهداف الشخصية", level: 6 },
        { id: "t4", name: "Self-evaluation", ar: "التقييم الذاتي", level: 6 },
        { id: "t5", name: "Time management", ar: "تنظيم الوقت", level: 6 },
      ]},
      social: { remainder: 0, traits: [
        { id: "t1", name: "Volunteering", ar: "العمل التطوعي", level: 0 },
        { id: "t2", name: "Social interaction", ar: "التفاعل الاجتماعي", level: 1 },
        { id: "t3", name: "Participating in social activities", ar: "المشاركة في الأنشطة الاجتماعية", level: 1 },
        { id: "t4", name: "Effective communication", ar: "التواصل الفعال", level: 9 },
      ]},
      linguistic: { remainder: 0, traits: [
        { id: "t1", name: "Reading", ar: "القراءة", level: 7 },
        { id: "t2", name: "Writing", ar: "الكتابة", level: 8 },
        { id: "t3", name: "Speaking", ar: "التحدث", level: 5 },
        { id: "t4", name: "Language learning", ar: "تعلم اللغات", level: 3 },
      ]},
      logical: { remainder: 0, traits: [
        { id: "t1", name: "Data analysis", ar: "تحليل البيانات", level: 2 },
        { id: "t2", name: "Puzzle solving", ar: "حل الألغاز", level: 7 },
        { id: "t3", name: "Programming", ar: "تعلم البرمجة", level: 0 },
        { id: "t4", name: "Sports coaching & training", ar: "التعليم والتدريب الرياضي", level: 5 },
      ]},
      bodily: { remainder: 0, traits: [
        { id: "t1", name: "Yoga", ar: "اليوغا", level: 0 },
        { id: "t2", name: "Sports", ar: "الرياضة", level: 9 },
        { id: "t3", name: "Self-defense techniques", ar: "تقنيات الدفاع عن النفس", level: 0 },
        { id: "t4", name: "Handcrafts", ar: "المهارات اليدوية", level: 0 },
        { id: "t5", name: "Daily exercise", ar: "التمارين اليومية", level: 5 },
        { id: "t6", name: "Acting", ar: "التمثيل", level: 4 },
      ]},
      natural: { remainder: 0, traits: [
        { id: "t1", name: "Survival techniques", ar: "تقنيات البقاء في الطبيعة", level: 0 },
        { id: "t2", name: "Outdoor activities", ar: "الأنشطة الخارجية", level: 0 },
        { id: "t3", name: "Learning about the environment", ar: "التعلم عن البيئة", level: 0 },
        { id: "t4", name: "Farming & gardening", ar: "الزراعة والبستنة", level: 0 },
      ]},
      visual: { remainder: 0, traits: [
        { id: "t1", name: "3D planning", ar: "التخطيط ثلاثي الأبعاد", level: 0 },
        { id: "t2", name: "Graphic design", ar: "التصميم الجرافيكي", level: 0 },
        { id: "t3", name: "Photography", ar: "التصوير", level: 0 },
        { id: "t4", name: "Drawing", ar: "الرسم", level: 0 },
      ]},
      musical: { remainder: 0, traits: [
        { id: "t1", name: "Playing an instrument", ar: "العزف على آلة موسيقية", level: 0 },
        { id: "t2", name: "Active listening", ar: "الاستماع النشط", level: 3 },
        { id: "t3", name: "Vocal training", ar: "التدريب الصوتي", level: 3 },
        { id: "t4", name: "Musical creativity", ar: "الإبداع الموسيقي", level: 0 },
      ]},
    };
  };

  SYS.seedTasks = function (expDivisor) {
    const raw = [
      { title: "Reading “Animal Farm”", priority: "Medium", taskType: "Long Term", types: ["linguistic"], pt: 500, mode: "gradual", completion: 0, notes: "" },
      { title: "Commitment in Exercises for two weeks", priority: "High", taskType: "Short Term", types: ["self"], pt: 1000, mode: "simple", completion: 0, notes: "" },
      { title: "Writing with the other hand", priority: "Low", taskType: "Medium Term", types: ["linguistic"], pt: 300, mode: "simple", completion: 0, notes: "" },
      { title: "Performing daily habits", priority: "High", taskType: "Long Term", types: [], pt: 100, mode: "gradual", completion: 40, notes: "" },
      { title: "Fast typing on the keyboard", priority: "High", taskType: "Long Term", types: ["bodily"], pt: 2000, mode: "gradual", completion: 30, notes: "" },
    ];
    const recurring = [
      { title: "Drink water", priority: "Medium", types: ["bodily"], pt: 20, notes: "", recurring: true, repeatsPerWeek: 7, unit: "L", targetAmount: 2, weekKey: null, weekLog: [] },
      { title: "Deep work session", priority: "High", types: ["self"], pt: 40, notes: "", recurring: true, repeatsPerWeek: 5, unit: "min", targetAmount: 30, weekKey: null, weekLog: [] },
    ];
    return [
      ...raw.map((t) => ({ ...t, id: uid("task"), expBaseline: Math.floor((t.pt / expDivisor) * (t.completion / 100)) })),
      ...recurring.map((t) => ({ ...t, id: uid("task"), taskType: "Recurring", mode: "recurring", completion: 0, expBaseline: 0 })),
    ];
  };

  SYS.defaultState = function () {
    const settings = { ...SYS.DEFAULT_SETTINGS };
    return {
      schema: 1,
      settings,
      player: { name: "Hunter", rank: "G", level: 2, exp: 40, questsCompleted: 0, bankedPoints: 0, composition: {} },
      intTypes: SYS.DEFAULT_INT_TYPES.map((t) => ({ ...t })),
      intelligences: SYS.seedIntelligences(),
      tasks: SYS.seedTasks(settings.expDivisor),
      log: [],
      levelHistory: [],
      dailyStats: {},
    };
  };
})(window.SYS = window.SYS || {});

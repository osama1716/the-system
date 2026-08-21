// Game rules: EXP conversion, skill-point allocation, task/trait mutations.
// Every function takes a state object it is allowed to mutate in place (callers
// pass a fresh clone) and returns { notifications } describing what happened,
// so the UI layer can render toasts without knowing any game-rule details.
(function (SYS) {
  "use strict";

  function clone(x) {
    return typeof structuredClone === "function" ? structuredClone(x) : JSON.parse(JSON.stringify(x));
  }
  SYS.clone = clone;

  function ptToExp(pt, expDivisor) {
    return pt / expDivisor;
  }
  SYS.ptToExp = ptToExp;

  // ISO-8601 week key (e.g. "2026-W34") — the boundary a recurring habit's
  // weekly count resets against.
  function isoWeekKey(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    const weekNum = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
    return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
  }
  SYS.isoWeekKey = isoWeekKey;

  // Read-only: how many repeats this habit has logged in the CURRENT week.
  // Never mutates — a stale weekKey just reads as 0 until an actual log/undo
  // action touches it (so merely viewing a task can't lose data).
  function weekProgress(task) {
    const wk = isoWeekKey(new Date());
    if (task.weekKey !== wk) return { count: 0, logs: [], sameWeek: false };
    return { count: task.weekLog.length, logs: task.weekLog, sameWeek: true };
  }
  SYS.weekProgress = weekProgress;

  // Local-calendar date key (not UTC) — "today" should match the day the user
  // actually sees on their clock.
  function dateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  SYS.dateKey = dateKey;
  function todayKey() { return dateKey(new Date()); }
  SYS.todayKey = todayKey;

  function emptyBucket() { return { xp: 0, quests: 0, repeats: 0, habitIds: [] }; }

  // Per-day activity ledger backing the Stats page. `k` defaults to today —
  // pass an explicit date for events whose real-world day isn't "now" (e.g.
  // undoing a habit repeat that was logged earlier in the week logs the
  // correction against the day it actually happened, not today).
  function bumpDailyStat(state, field, delta, k) {
    if (!delta) return;
    state.dailyStats = state.dailyStats || {};
    k = k || todayKey();
    const bucket = state.dailyStats[k] || emptyBucket();
    bucket[field] = (bucket[field] || 0) + delta;
    state.dailyStats[k] = bucket;
  }
  SYS.bumpDailyStat = bumpDailyStat;

  // Tracks which distinct habits were touched on a given day — this is what
  // the Stats month view's "% of habits completed" bar is computed from.
  function recordHabitTouch(state, k, taskId) {
    state.dailyStats = state.dailyStats || {};
    const bucket = state.dailyStats[k] || emptyBucket();
    if (!bucket.habitIds) bucket.habitIds = [];
    bucket.habitIds.push(taskId);
    state.dailyStats[k] = bucket;
  }
  SYS.recordHabitTouch = recordHabitTouch;
  function unrecordHabitTouch(state, k, taskId) {
    const bucket = state.dailyStats && state.dailyStats[k];
    if (!bucket || !bucket.habitIds) return;
    const idx = bucket.habitIds.lastIndexOf(taskId);
    if (idx >= 0) bucket.habitIds.splice(idx, 1);
  }
  SYS.unrecordHabitTouch = unrecordHabitTouch;

  // Keeps the ledger from growing forever — a year of daily buckets is tiny,
  // but no reason to carry it past what the Stats page can ever show.
  function pruneDailyStats(state, keepDays) {
    state.dailyStats = state.dailyStats || {};
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (keepDays || 120));
    const cutoffKey = dateKey(cutoff);
    Object.keys(state.dailyStats).forEach((k) => { if (k < cutoffKey) delete state.dailyStats[k]; });
  }
  SYS.pruneDailyStats = pruneDailyStats;

  function dayInfo(state, d, totalHabits) {
    const stats = state.dailyStats || {};
    const k = dateKey(d);
    const b = stats[k] || emptyBucket();
    const habitIds = b.habitIds || [];
    const habitPct = totalHabits > 0 ? Math.round((new Set(habitIds).size / totalHabits) * 100) : 0;
    return {
      dateKey: k, date: new Date(d),
      xp: b.xp || 0, quests: b.quests || 0, repeats: b.repeats || 0,
      habitPct, active: (b.xp || 0) > 0 || (b.quests || 0) > 0 || (b.repeats || 0) > 0,
    };
  }

  function mondayOf(d) {
    const out = new Date(d);
    const dow = (out.getDay() + 6) % 7; // Mon=0..Sun=6
    out.setDate(out.getDate() - dow);
    out.setHours(0, 0, 0, 0);
    return out;
  }
  SYS.mondayOf = mondayOf;

  // Calendar week (Mon–Sun) `weekOffset` weeks from the one containing today
  // — 0 is this week, -1 last week, +1 next week, etc.
  function statsWeek(state, weekOffset) {
    const totalHabits = state.tasks.filter((t) => t.recurring).length;
    const start = mondayOf(new Date());
    start.setDate(start.getDate() + weekOffset * 7);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(dayInfo(state, d, totalHabits));
    }
    const end = days[6].date;
    const fmt = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return { days, rangeLabel: `${fmt(start)} – ${fmt(end)}`, year: start.getFullYear() };
  }
  SYS.statsWeek = statsWeek;

  // The actual calendar month (28–31 days) `monthOffset` months from the
  // current one.
  function statsMonth(state, monthOffset) {
    const totalHabits = state.tasks.filter((t) => t.recurring).length;
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const year = first.getFullYear(), month = first.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(dayInfo(state, new Date(year, month, day), totalHabits));
    }
    const monthLabel = first.toLocaleDateString(undefined, { month: "long" });
    return { days, monthLabel, year };
  }
  SYS.statsMonth = statsMonth;

  function avgTraitLevel(intel) {
    if (!intel || !intel.traits.length) return 0;
    return intel.traits.reduce((s, t) => s + t.level, 0) / intel.traits.length;
  }
  SYS.avgTraitLevel = avgTraitLevel;

  function weakestTraitIndex(traits) {
    let idx = 0;
    for (let i = 1; i < traits.length; i++) if (traits[i].level < traits[idx].level) idx = i;
    return idx;
  }

  // Distributes `totalPoints` skill points across intelligence types proportional to
  // each type's share of composition, banking fractional remainders so nothing is
  // ever lost to rounding — it compounds across future level-ups instead.
  // `awardedTraits` records exactly which trait got each point, in order, so a
  // later reversal (see applyExpDelta) can undo this exact allocation losslessly.
  function allocatePoints(intelligences, composition, totalPoints, intTypes) {
    const typedEntries = Object.entries(composition).filter(([k, v]) => k !== "general" && v > 0 && intelligences[k]);
    const totalTyped = typedEntries.reduce((s, [, v]) => s + v, 0);
    const distribution = [];
    const awardedTraits = [];
    let banked = 0;

    if (totalTyped <= 0) {
      banked = totalPoints;
    } else {
      typedEntries.forEach(([type, val]) => {
        const share = val / totalTyped;
        intelligences[type].remainder += share * totalPoints;
      });
      typedEntries.forEach(([type, val]) => {
        const intel = intelligences[type];
        const whole = Math.floor(intel.remainder + 1e-9);
        if (whole > 0) {
          intel.remainder -= whole;
          for (let i = 0; i < whole; i++) {
            const idx = weakestTraitIndex(intel.traits);
            intel.traits[idx].level += 1;
            awardedTraits.push([type, intel.traits[idx].id]);
          }
          const sorted = intel.traits.slice().sort((a, b) => a.level - b.level);
          const label = intTypes.find((x) => x.key === type);
          distribution.push({ type, points: whole, share: val / totalTyped, trait: sorted[0]?.name, short: label ? label.short : type });
        }
      });
    }
    return { distribution, banked, awardedTraits };
  }
  SYS.allocatePoints = allocatePoints;

  function levelLogDate() { return new Date().toLocaleDateString(); }

  // The single entry/exit point for every EXP change, positive or negative.
  // Every level-up pushes a record onto state.levelHistory capturing exactly what
  // it granted (which traits, how many banked points, the remainder/composition
  // state right before it fired). Crossing back below a level threshold pops that
  // exact record and reverses it precisely — no drift, no double-granting if the
  // same range of EXP is gained back later.
  function applyExpDelta(state, delta, taggedTypes, sourceLabel) {
    if (!delta) return [];
    state.levelHistory = state.levelHistory || [];
    const notifications = [];
    const types = taggedTypes && taggedTypes.length ? taggedTypes : ["general"];
    types.forEach((t) => {
      state.player.composition[t] = (state.player.composition[t] || 0) + delta / types.length;
    });

    let level = state.player.level;
    let exp = state.player.exp + delta;
    let rankIdx = SYS.RANKS.indexOf(state.player.rank);
    const logEntries = [];
    notifications.push({ kind: delta > 0 ? "exp" : "expLoss", text: `${delta > 0 ? "+" : ""}${delta.toFixed(0)} EXP · ${sourceLabel}` });

    while (exp >= 100) {
      if (level >= 100 && rankIdx >= SYS.RANKS.length - 1) { exp = 99; break; }

      const compositionSnapshot = { ...state.player.composition };
      const remainderSnapshot = {};
      Object.keys(state.intelligences).forEach((k) => { remainderSnapshot[k] = state.intelligences[k].remainder; });
      const levelBefore = level, rankIdxBefore = rankIdx;

      exp -= 100;
      level += 1;

      const { distribution, banked, awardedTraits } = allocatePoints(state.intelligences, state.player.composition, state.settings.pointsPerLevel, state.intTypes);
      state.player.composition = {};
      state.player.bankedPoints += banked;
      state.levelHistory.push({ levelBefore, rankIdxBefore, awardedTraits, banked, compositionSnapshot, remainderSnapshot });

      if (level > 100) {
        rankIdx += 1;
        level = 1;
        notifications.push({ kind: "rankup", text: `Welcome to ${SYS.RANKS[rankIdx]}-Rank`, rank: SYS.RANKS[rankIdx] });
        logEntries.push({ date: levelLogDate(), text: `RANK UP → ${SYS.RANKS[rankIdx]}-Rank` });
      } else {
        notifications.push({ kind: "levelup", text: `Level ${level}` });
        const distText = distribution.length
          ? distribution.map((d) => `+${d.points} ${d.short} (${Math.round(d.share * 100)}% → ${d.trait})`).join(", ")
          : banked > 0 ? `${banked} point(s) banked — no tagged activity this level` : "";
        logEntries.push({ date: levelLogDate(), text: `Level ${level - 1} → ${level}${distText ? ": " + distText : ""}` });
        distribution.forEach((d) => notifications.push({ kind: "skillpoint", text: `+${d.points} pt → ${d.trait} (${d.short})` }));
      }
    }

    while (exp < 0) {
      const record = state.levelHistory.pop();
      if (!record) { exp = 0; break; } // floor: can't undo past the very beginning

      const rankDownHappening = rankIdx !== record.rankIdxBefore;

      record.awardedTraits.forEach(([typeKey, traitId]) => {
        const intel = state.intelligences[typeKey];
        const tr = intel && intel.traits.find((x) => x.id === traitId);
        if (tr && tr.level > 0) tr.level -= 1;
      });
      state.player.bankedPoints = Math.max(0, state.player.bankedPoints - record.banked);
      Object.keys(record.remainderSnapshot).forEach((k) => { if (state.intelligences[k]) state.intelligences[k].remainder = record.remainderSnapshot[k]; });
      // Merge (not overwrite): composition already holds this call's own in-flight
      // contribution (added before this loop ran); the snapshot is what composition
      // held right before the level-up we're now undoing reset it to {}. Adding
      // them together nets out to exactly the pre-level-up value.
      Object.keys(record.compositionSnapshot).forEach((k) => {
        state.player.composition[k] = (state.player.composition[k] || 0) + record.compositionSnapshot[k];
      });

      level = record.levelBefore;
      rankIdx = record.rankIdxBefore;
      exp += 100;

      if (rankDownHappening) {
        notifications.push({ kind: "rankdown", text: `Dropped to ${SYS.RANKS[rankIdx]}-Rank`, rank: SYS.RANKS[rankIdx] });
        logEntries.push({ date: levelLogDate(), text: `RANK DOWN → ${SYS.RANKS[rankIdx]}-Rank (progress reverted)` });
      } else {
        notifications.push({ kind: "delevel", text: `Level ${level} (progress reverted)` });
        logEntries.push({ date: levelLogDate(), text: `Level ${level + 1} → ${level} (reverted)` });
      }
    }

    Object.keys(state.player.composition).forEach((k) => { if (Math.abs(state.player.composition[k]) < 1e-9) delete state.player.composition[k]; });
    state.player = { ...state.player, rank: SYS.RANKS[rankIdx], level, exp: Math.max(0, exp) };
    state.log = [...logEntries, ...state.log].slice(0, 80);
    bumpDailyStat(state, "xp", delta);
    return notifications;
  }
  SYS.applyExpDelta = applyExpDelta;

  // Gradual and simple/all-at-once tasks share one rule: a task's EXP contribution
  // always equals pt/divisor * completion%, full stop. Moving completion (or
  // editing Pt) in either direction applies the exact delta via applyExpDelta —
  // raising it grants EXP/levels, lowering it takes them back, precisely.
  function applyTaskProgress(state, taskId, newCompletion) {
    const t = state.tasks.find((x) => x.id === taskId);
    if (!t) return [];
    const clamped = Math.max(0, Math.min(100, newCompletion));
    const newExpTotal = Math.floor(ptToExp(t.pt, state.settings.expDivisor) * (clamped / 100));
    const delta = newExpTotal - t.expBaseline;
    const wasDone = t.completion >= 100;
    t.completion = clamped;
    t.expBaseline = newExpTotal;
    const nowDone = clamped >= 100;
    if (nowDone && !wasDone) { state.player.questsCompleted += 1; bumpDailyStat(state, "quests", 1); }
    if (!nowDone && wasDone) { state.player.questsCompleted = Math.max(0, state.player.questsCompleted - 1); bumpDailyStat(state, "quests", -1); }
    if (delta !== 0) return applyExpDelta(state, delta, t.types, t.title);
    return [];
  }
  SYS.applyTaskProgress = applyTaskProgress;

  function completeSimpleTask(state, taskId) { return applyTaskProgress(state, taskId, 100); }
  SYS.completeSimpleTask = completeSimpleTask;

  function reopenSimpleTask(state, taskId) { return applyTaskProgress(state, taskId, 0); }
  SYS.reopenSimpleTask = reopenSimpleTask;

  function addTask(state, form) {
    const base = {
      id: SYS.uid("task"),
      title: form.title.trim(),
      priority: form.priority,
      types: form.types,
      pt: Number(form.pt) || 0,
      notes: form.notes || "",
    };
    if (form.recurring) {
      state.tasks.push({
        ...base,
        recurring: true,
        taskType: "Recurring", mode: "recurring", completion: 0, expBaseline: 0,
        repeatsPerWeek: Math.max(1, Math.min(7, Number(form.repeatsPerWeek) || 1)),
        unit: (form.unit || "reps").trim() || "reps",
        targetAmount: Number(form.targetAmount) || 1,
        weekKey: null, weekLog: [],
      });
    } else {
      const mode = form.taskType === "Long Term" ? form.mode : "simple";
      state.tasks.push({ ...base, recurring: false, taskType: form.taskType, mode, completion: 0, expBaseline: 0 });
    }
  }
  SYS.addTask = addTask;

  // Editing a task's Pt value changes what its current completion% is worth —
  // that delta flows through applyExpDelta too, same as moving completion does,
  // so the ledger stays consistent no matter which field changed. Switching
  // between one-off and recurring mid-life resets the fields that no longer
  // apply, but never retroactively grants/revokes EXP for that switch itself.
  function updateTask(state, taskId, form) {
    const t = state.tasks.find((x) => x.id === taskId);
    if (!t) return [];
    t.title = form.title.trim();
    t.priority = form.priority;
    t.types = form.types;
    t.pt = Number(form.pt) || 0;
    t.notes = form.notes || "";

    const wasRecurring = !!t.recurring;
    t.recurring = !!form.recurring;

    if (t.recurring) {
      t.taskType = "Recurring";
      t.mode = "recurring";
      t.repeatsPerWeek = Math.max(1, Math.min(7, Number(form.repeatsPerWeek) || 1));
      t.unit = (form.unit || "reps").trim() || "reps";
      t.targetAmount = Number(form.targetAmount) || 1;
      if (!wasRecurring) { t.weekKey = null; t.weekLog = []; t.completion = 0; t.expBaseline = 0; }
      return [];
    }

    if (wasRecurring) { t.completion = 0; t.expBaseline = 0; }
    const mode = form.taskType === "Long Term" ? form.mode : "simple";
    t.taskType = form.taskType;
    t.mode = mode;
    const newExpTotal = Math.floor(ptToExp(t.pt, state.settings.expDivisor) * (t.completion / 100));
    const delta = newExpTotal - t.expBaseline;
    t.expBaseline = newExpTotal;
    if (delta !== 0) return applyExpDelta(state, delta, t.types, t.title + " (edited)");
    return [];
  }
  SYS.updateTask = updateTask;

  function removeTask(state, taskId) {
    state.tasks = state.tasks.filter((t) => t.id !== taskId);
  }
  SYS.removeTask = removeTask;

  // Logging a repeat is a mini "complete task" for a habit: awards this
  // quest's Pt (as EXP) immediately, every time, uncapped past the weekly
  // target — going past your goal is never penalized. `amountOverride` lets a
  // live timer session log its actual elapsed amount instead of the habit's
  // default target (EXP stays flat per repeat either way — the amount is
  // descriptive/statistical, not an EXP multiplier).
  function logRecurringRepeat(state, taskId, amountOverride) {
    const t = state.tasks.find((x) => x.id === taskId);
    if (!t || !t.recurring) return [];
    const wk = isoWeekKey(new Date());
    if (t.weekKey !== wk) { t.weekKey = wk; t.weekLog = []; }
    const amount = amountOverride != null ? amountOverride : t.targetAmount;
    const entryDate = todayKey();
    t.weekLog.push({ date: entryDate, amount });
    bumpDailyStat(state, "repeats", 1, entryDate);
    recordHabitTouch(state, entryDate, taskId);
    const notifications = applyExpDelta(state, ptToExp(t.pt, state.settings.expDivisor), t.types, t.title);
    if (t.weekLog.length === t.repeatsPerWeek) {
      notifications.push({ kind: "info", text: `Weekly goal reached — ${t.title}` });
    }
    return notifications;
  }
  SYS.logRecurringRepeat = logRecurringRepeat;

  // Symmetric with logging: removes the most recent entry from this week and
  // takes back exactly the EXP that entry granted, crediting the correction
  // against the entry's own day (not necessarily today, if it was logged
  // earlier in the week). No-ops past a week boundary or once this week's
  // log is already empty.
  function undoLastRecurringRepeat(state, taskId) {
    const t = state.tasks.find((x) => x.id === taskId);
    if (!t || !t.recurring) return [];
    const wk = isoWeekKey(new Date());
    if (t.weekKey !== wk || !t.weekLog.length) return [];
    const popped = t.weekLog.pop();
    bumpDailyStat(state, "repeats", -1, popped.date);
    unrecordHabitTouch(state, popped.date, taskId);
    return applyExpDelta(state, -ptToExp(t.pt, state.settings.expDivisor), t.types, t.title + " (undo)");
  }
  SYS.undoLastRecurringRepeat = undoLastRecurringRepeat;

  function spendBankedPoint(state, typeKey) {
    if (state.player.bankedPoints <= 0) return null;
    const traits = state.intelligences[typeKey].traits;
    if (!traits.length) return null;
    const idx = weakestTraitIndex(traits);
    traits[idx].level += 1;
    state.player.bankedPoints -= 1;
    return traits[idx].name;
  }
  SYS.spendBankedPoint = spendBankedPoint;

  function addTrait(state, typeKey, name, ar) {
    if (!name.trim()) return;
    state.intelligences[typeKey].traits.push({ id: SYS.uid("trait"), name: name.trim(), ar: (ar || "").trim(), level: 0 });
  }
  SYS.addTrait = addTrait;

  function removeTrait(state, typeKey, traitId) {
    const intel = state.intelligences[typeKey];
    if (intel.traits.length <= 1) return; // keep at least one trait per category
    intel.traits = intel.traits.filter((t) => t.id !== traitId);
  }
  SYS.removeTrait = removeTrait;

  function addIntType(state, { name, ar, short, color }) {
    const key = "custom_" + SYS.uid("").slice(0, 8);
    state.intTypes.push({ key, name: name.trim(), ar: (ar || "").trim(), short: (short || name.slice(0, 4)).toUpperCase(), color: SYS.sanitizeColor(color, "#4fd1ff") });
    state.intelligences[key] = { remainder: 0, traits: [{ id: SYS.uid("trait"), name: "First trait", ar: "", level: 0 }] };
    return key;
  }
  SYS.addIntType = addIntType;

  function setName(state, name) {
    state.player.name = name || "Hunter";
  }
  SYS.setName = setName;

  function updateSettings(state, { expDivisor, pointsPerLevel }) {
    const ed = Number(expDivisor);
    const ppl = Number(pointsPerLevel);
    if (ed > 0) state.settings.expDivisor = ed;
    if (ppl > 0) state.settings.pointsPerLevel = Math.round(ppl);
  }
  SYS.updateSettings = updateSettings;

  function setTheme(state, themeName) {
    if (SYS.THEMES[themeName]) state.settings.theme = themeName;
  }
  SYS.setTheme = setTheme;
})(window.SYS = window.SYS || {});

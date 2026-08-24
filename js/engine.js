// Game rules: EXP conversion, skill-point allocation, task/trait mutations.
// Every function takes a state object it is allowed to mutate in place (callers
// pass a fresh clone) and returns { notifications } describing what happened,
// so the UI layer can render toasts without knowing any game-rule details.
(function (SYS) {
  "use strict";

  // i18n.js loads before this file in index.html, so SYS.t is there in the app.
  // Guarded anyway: this file is the EXP ledger, and it must not be brought
  // down by the absence of a translation table. Falls back to the key, exactly
  // as SYS.t itself does for a string it does not have.
  function tr(key, vars) {
    return typeof SYS.t === "function" ? SYS.t(key, vars) : key;
  }


  function clone(x) {
    return typeof structuredClone === "function" ? structuredClone(x) : JSON.parse(JSON.stringify(x));
  }
  SYS.clone = clone;

  // Key-order-independent structural equality for two JSON-shaped state
  // trees (used to tell "cloud copy exists" apart from "cloud copy actually
  // differs from what's already here" when reconciling cloud sync — a plain
  // JSON.stringify comparison would false-positive on harmless key reordering
  // from a Firestore round-trip).
  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
      return true;
    }
    const aKeys = Object.keys(a), bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  SYS.deepEqual = deepEqual;

  // A task's value and its EXP are the same number. Kept as a named function
  // rather than inlined so the one place that decides this stays findable.
  function ptToExp(pt) {
    return Number(pt) || 0;
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

  // Places points one at a time into whoever is weakest right now, re-checking
  // between each so a run of them spreads instead of piling onto one trait.
  // Returns null only when there are no categories at all.
  function placeWeakest(intelligences, intTypes, count) {
    const awardedTraits = [];
    let lastKey = null;
    for (let i = 0; i < count; i++) {
      const key = weakestCategory(intelligences, intTypes);
      if (!key) return null;
      const intel = intelligences[key];
      const idx = weakestTraitIndex(intel.traits);
      intel.traits[idx].level += 1;
      awardedTraits.push([key, intel.traits[idx].id]);
      lastKey = key;
    }
    if (!lastKey) return null;
    const label = (intTypes || []).find((x) => x.key === lastKey);
    const sorted = intelligences[lastKey].traits.slice().sort((a, b) => a.level - b.level);
    return {
      awardedTraits,
      entry: { type: lastKey, points: count, share: 1, trait: sorted[0] ? sorted[0].name : "", short: label ? label.short : lastKey },
    };
  }

  // The least-developed category that actually has somewhere to put a point.
  function weakestCategory(intelligences, intTypes) {
    let best = null, bestTotal = Infinity;
    (intTypes || []).forEach((t) => {
      const intel = intelligences[t.key];
      if (!intel || !intel.traits || !intel.traits.length) return;
      const total = intel.traits.reduce((s, tr) => s + (Number(tr.level) || 0), 0);
      if (total < bestTotal) { bestTotal = total; best = t.key; }
    });
    return best;
  }

  function weakestTraitIndex(traits) {
    let idx = 0;
    for (let i = 1; i < traits.length; i++) if (traits[i].level < traits[idx].level) idx = i;
    return idx;
  }

  // Which trait in this category should receive the next point. Prefers the
  // trait the underlying work was actually tagged for (from AI evaluation,
  // accumulated in player.traitComposition) — the one with the most EXP
  // behind it wins. Falls back to the weakest trait when there's no tagged
  // preference, which is the original behaviour and still what happens for
  // anything created before AI evaluation existed.

  // Which trait a level's point belongs to.
  //
  // The evaluator names one, and that name is matched against the person's own
  // traits. It used to be an exact string compare, and any near miss —
  // "Reading books" against "Reading", a hyphen, a plural — fell through to the
  // weakest trait without a word. That fallback then looked like the system
  // ignoring the assignment it had just made. So: exact, then normalised, then
  // containment either way, and only then weakest.
  function matchTraitIndex(traits, name) {
    const wanted = SYS.normaliseName(name);
    if (!wanted) return -1;
    const normalised = traits.map((t) => SYS.normaliseName(t.name));
    let idx = normalised.indexOf(wanted);
    if (idx >= 0) return idx;
    idx = normalised.findIndex((n) => n && (n.includes(wanted) || wanted.includes(n)));
    return idx;
  }

  function targetTraitIndex(traits, traitWeights) {
    if (traitWeights) {
      // Heaviest first, so a second-choice name still gets a chance when the
      // first cannot be matched at all.
      const byWeight = Object.keys(traitWeights).sort((a, b) => traitWeights[b] - traitWeights[a]);
      for (const name of byWeight) {
        if (!(traitWeights[name] > 0)) continue;
        const idx = matchTraitIndex(traits, name);
        if (idx >= 0) return idx;
      }
    }
    return weakestTraitIndex(traits);
  }

  // Distributes `totalPoints` skill points across intelligence types proportional to
  // each type's share of composition, banking fractional remainders so nothing is
  // ever lost to rounding — it compounds across future level-ups instead.
  // `awardedTraits` records exactly which trait got each point, in order, so a
  // later reversal (see applyExpDelta) can undo this exact allocation losslessly.
  // Takes one level's worth out of the attribution, and returns what it took.
  //
  // `composition` is EXP-denominated: it records how much of the EXP behind the
  // current level came from each category. A level costs levelCost EXP, so that
  // is what crossing one consumes — proportionally across the categories,
  // leaving the remainder for the level after it.
  //
  // It used to be emptied wholesale on every level-up. That was invisible while
  // a level cost 100 EXP and deltas were small, because one level-up consumed
  // about one level's worth anyway. Once a G-Rank level cost 15, a single
  // 500-point quest crossed thirty-three of them and only the first was
  // attributed: one point reached the trait the work actually built and
  // thirty-two were banked for want of a tag they already had.
  //
  // Anything left over stays for next time rather than being discarded — the
  // same treatment fractional points already get from `remainder`.
  function consumeComposition(state, amount) {
    const comp = state.player.composition || {};
    const total = Object.keys(comp).reduce((sum, k) => sum + (comp[k] > 0 ? comp[k] : 0), 0);
    if (total <= 0) return { used: {}, usedTraits: {} };

    const fraction = Math.min(amount, total) / total;
    const used = {};
    Object.keys(comp).forEach((k) => {
      if (!(comp[k] > 0)) return;
      used[k] = comp[k] * fraction;
      comp[k] -= used[k];
      if (comp[k] < 1e-9) delete comp[k];
    });

    // The per-trait split rides one level deeper and is drawn down in the same
    // proportion, so the two never fall out of step.
    const traitComp = state.player.traitComposition || {};
    const usedTraits = {};
    Object.keys(traitComp).forEach((cat) => {
      const bucket = traitComp[cat];
      const taken = {};
      Object.keys(bucket).forEach((name) => {
        taken[name] = bucket[name] * fraction;
        bucket[name] -= taken[name];
        if (Math.abs(bucket[name]) < 1e-9) delete bucket[name];
      });
      usedTraits[cat] = taken;
      if (!Object.keys(bucket).length) delete traitComp[cat];
    });

    return { used, usedTraits };
  }

  // Where a level's points land.
  //
  // Fractions accumulate per trait, not per category. They used to pool at the
  // category and the whole point went to the single heaviest trait in that
  // pool — so a big task left leftovers that outweighed a small one, and the
  // small task's points went to the big task's trait. Logging a drink of water
  // credited Handcrafts, because a 2000-point typing quest had left more weight
  // behind in Bodily than one glass of water was worth.
  //
  // Each trait now banks its own share and converts on its own, so a task's
  // points reach the trait that task named, whatever else has been going on in
  // the same category.
  function allocatePoints(intelligences, composition, totalPoints, intTypes, traitComposition) {
    let typedEntries = Object.entries(composition).filter(([k, v]) => k !== "general" && v > 0 && intelligences[k]);
    let totalTyped = typedEntries.reduce((s, [, v]) => s + v, 0);
    const distribution = [];
    const awardedTraits = [];

    if (totalTyped <= 0) {
      // Nothing said which category this EXP built — an admin adjustment, or a
      // task the evaluator judged to fit none of them. With no signal, the
      // honest choice is wherever they are weakest, which is what the app is
      // for. It goes down the same path so a part-point still accumulates
      // rather than being rounded away.
      const weakest = weakestCategory(intelligences, intTypes);
      if (!weakest) return { distribution, banked: totalPoints, awardedTraits };
      typedEntries = [[weakest, 1]];
      totalTyped = 1;
      traitComposition = null;
    }

    typedEntries.forEach(([type, categoryWeight]) => {
      const intel = intelligences[type];
      if (!intel || !intel.traits || !intel.traits.length) return;
      const categoryPoints = totalPoints * (categoryWeight / totalTyped);

      // How this category's points split between its traits. The weights come
      // from what the tasks themselves named; with none, it all goes to the
      // weakest trait, as before.
      const weights = (traitComposition && traitComposition[type]) || null;
      const shares = [];
      if (weights) {
        let named = 0;
        Object.keys(weights).forEach((name) => {
          if (!(weights[name] > 0)) return;
          const idx = matchTraitIndex(intel.traits, name);
          if (idx < 0) return;
          shares.push([idx, weights[name]]);
          named += weights[name];
        });
        if (named > 0) shares.forEach((s) => { s[1] = s[1] / named; });
        else shares.length = 0;
      }
      if (!shares.length) shares.push([weakestTraitIndex(intel.traits), 1]);

      intel.traitRemainder = intel.traitRemainder && typeof intel.traitRemainder === "object" ? intel.traitRemainder : {};
      let wholeHere = 0;
      let lastName = "";
      shares.forEach(([idx, share]) => {
        const trait = intel.traits[idx];
        const key = trait.id;
        const banked = (Number(intel.traitRemainder[key]) || 0) + categoryPoints * share;
        const whole = Math.floor(banked + 1e-9);
        intel.traitRemainder[key] = banked - whole;
        if (whole <= 0) return;
        trait.level += whole;
        for (let i = 0; i < whole; i++) awardedTraits.push([type, trait.id]);
        wholeHere += whole;
        lastName = trait.name;
      });

      // Kept in step with the per-trait banks, so the category figure the
      // Intelligence page shows still means "progress towards the next point".
      intel.remainder = Object.keys(intel.traitRemainder)
        .reduce((sum, k) => sum + (Number(intel.traitRemainder[k]) || 0), 0);

      if (wholeHere > 0) {
        const label = intTypes.find((x) => x.key === type);
        distribution.push({ type, points: wholeHere, share: categoryWeight / totalTyped, trait: lastName, short: label ? label.short : type });
      }
    });

    return { distribution, banked: 0, awardedTraits };
  }
  SYS.allocatePoints = allocatePoints;

  function levelLogDate() { return new Date().toLocaleDateString(); }

  // The single entry/exit point for every EXP change, positive or negative.
  // Every level-up pushes a record onto state.levelHistory capturing exactly what
  // it granted (which traits, how many banked points, the remainder/composition
  // state right before it fired). Crossing back below a level threshold pops that
  // exact record and reverses it precisely — no drift, no double-granting if the
  // same range of EXP is gained back later.
  // `meta` carries what the movement was about — currently the id of the AI
  // price the task was given — for the journal to record. It is not used by the
  // ledger itself and never affects the outcome.
  function applyExpDelta(state, delta, taggedTypes, sourceLabel, traitTargets, meta) {
    if (!delta) return [];
    // What the ledger stood at before any of this — see the journal hook at
    // the end for why the requested delta is not a safe substitute.
    const totalBefore = totalExp(state.player);
    state.levelHistory = state.levelHistory || [];
    state.player.traitComposition = state.player.traitComposition || {};
    const notifications = [];
    const types = taggedTypes && taggedTypes.length ? taggedTypes : ["general"];
    types.forEach((t) => {
      state.player.composition[t] = (state.player.composition[t] || 0) + delta / types.length;
    });
    // Mirror the same split one level deeper for any category the task named
    // a specific trait for, so allocatePoints can invest where the work
    // actually went. Tasks without trait targets simply don't contribute
    // here and fall back to weakest-trait allocation.
    (traitTargets || []).forEach((tt) => {
      if (!tt || !tt.category || !tt.trait || !types.includes(tt.category)) return;
      const bucket = state.player.traitComposition[tt.category] || {};
      bucket[tt.trait] = (bucket[tt.trait] || 0) + delta / types.length;
      state.player.traitComposition[tt.category] = bucket;
    });

    let level = state.player.level;
    let exp = state.player.exp + delta;
    let rankIdx = SYS.RANKS.indexOf(state.player.rank);
    const logEntries = [];
    // One delta can now cross a great many levels: a G-Rank level costs 15 EXP,
    // so a single 500-point quest crosses thirty-three of them. Announcing each
    // one separately buried the screen in identical cards and hid the thing the
    // person actually wanted to read. The span is announced once instead, and
    // the points are totalled per trait rather than per level.
    let levelsGained = 0, levelsLost = 0;
    const pointsByTrait = new Map();
    notifications.push({ kind: delta > 0 ? "exp" : "expLoss", text: `${delta > 0 ? "+" : ""}${delta.toFixed(0)} EXP · ${sourceLabel}` });

    while (exp >= SYS.levelCost(rankIdx)) {
      if (level >= SYS.LEVELS_PER_RANK && rankIdx >= SYS.RANKS.length - 1) { exp = SYS.levelCost(rankIdx) - 1; break; }

      const remainderSnapshot = {};
      Object.keys(state.intelligences).forEach((k) => {
        remainderSnapshot[k] = {
          category: state.intelligences[k].remainder,
          traits: { ...(state.intelligences[k].traitRemainder || {}) },
        };
      });
      const levelBefore = level, rankIdxBefore = rankIdx;

      // What the level costs in EXP is also what it draws from the attribution.
      // The snapshot is what was drawn, not what was there — undo adds it back,
      // and only the consumed part was ever removed.
      const { used: compositionSnapshot, usedTraits: traitCompositionSnapshot } =
        consumeComposition(state, SYS.levelCost(rankIdx));

      // Charged at the rank the level was earned in, before any promotion
      // below moves rankIdx on.
      exp -= SYS.levelCost(rankIdx);
      level += 1;

      const { distribution, banked, awardedTraits } = allocatePoints(state.intelligences, compositionSnapshot, SYS.pointsForLevel(rankIdx), state.intTypes, traitCompositionSnapshot);
      state.player.bankedPoints += banked;
      state.levelHistory.push({ levelBefore, rankIdxBefore, awardedTraits, banked, compositionSnapshot, traitCompositionSnapshot, remainderSnapshot });

      if (level > SYS.LEVELS_PER_RANK) {
        rankIdx += 1;
        level = 1;
        notifications.push({ kind: "rankup", text: `Welcome to ${SYS.RANKS[rankIdx]}-Rank`, rank: SYS.RANKS[rankIdx] });
        logEntries.push({ date: levelLogDate(), text: `RANK UP → ${SYS.RANKS[rankIdx]}-Rank` });
      } else {
        levelsGained += 1;
        const distText = distribution.length
          ? distribution.map((d) => `+${d.points} ${d.short} (${Math.round(d.share * 100)}% → ${d.trait})`).join(", ")
          : banked > 0 ? `${banked} point(s) banked — no tagged activity this level` : "";
        logEntries.push({ date: levelLogDate(), text: `Level ${level - 1} → ${level}${distText ? ": " + distText : ""}` });
        distribution.forEach((d) => {
          const key = d.trait + "\u0000" + d.short;
          pointsByTrait.set(key, (pointsByTrait.get(key) || 0) + d.points);
        });
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
      Object.keys(record.remainderSnapshot).forEach((k) => {
        const intel = state.intelligences[k];
        if (!intel) return;
        const snap = record.remainderSnapshot[k];
        // Records written before fractions banked per trait hold a bare number.
        if (snap && typeof snap === "object") {
          intel.remainder = snap.category;
          intel.traitRemainder = { ...(snap.traits || {}) };
        } else {
          intel.remainder = snap;
        }
      });
      // Merge (not overwrite): composition already holds this call's own in-flight
      // contribution (added before this loop ran); the snapshot is what composition
      // held right before the level-up we're now undoing reset it to {}. Adding
      // them together nets out to exactly the pre-level-up value.
      Object.keys(record.compositionSnapshot).forEach((k) => {
        state.player.composition[k] = (state.player.composition[k] || 0) + record.compositionSnapshot[k];
      });
      // Same merge-not-overwrite reasoning as composition above, one level
      // deeper. Older levelHistory records predate trait targeting and simply
      // have nothing to restore.
      Object.keys(record.traitCompositionSnapshot || {}).forEach((cat) => {
        const snapBucket = record.traitCompositionSnapshot[cat];
        const bucket = state.player.traitComposition[cat] || {};
        Object.keys(snapBucket).forEach((traitName) => {
          bucket[traitName] = (bucket[traitName] || 0) + snapBucket[traitName];
        });
        state.player.traitComposition[cat] = bucket;
      });

      level = record.levelBefore;
      rankIdx = record.rankIdxBefore;
      // Refunded at that rank's price, not today's — the level being undone
      // was bought at the rate in force when it was earned.
      exp += SYS.levelCost(rankIdx);

      if (rankDownHappening) {
        notifications.push({ kind: "rankdown", text: `Dropped to ${SYS.RANKS[rankIdx]}-Rank`, rank: SYS.RANKS[rankIdx] });
        logEntries.push({ date: levelLogDate(), text: `RANK DOWN → ${SYS.RANKS[rankIdx]}-Rank (progress reverted)` });
      } else {
        levelsLost += 1;
        logEntries.push({ date: levelLogDate(), text: `Level ${level + 1} → ${level} (reverted)` });
      }
    }

    Object.keys(state.player.composition).forEach((k) => { if (Math.abs(state.player.composition[k]) < 1e-9) delete state.player.composition[k]; });
    Object.keys(state.player.traitComposition).forEach((cat) => {
      const bucket = state.player.traitComposition[cat];
      Object.keys(bucket).forEach((n) => { if (Math.abs(bucket[n]) < 1e-9) delete bucket[n]; });
      if (!Object.keys(bucket).length) delete state.player.traitComposition[cat];
    });
    // Placed before the player object is rewritten so the "from" is still
    // readable, but pushed in the order they happened: EXP, then the climb,
    // then what it bought.
    if (levelsGained) {
      notifications.push({
        kind: "levelup",
        text: levelsGained === 1
          ? tr("notif.levelReached", { n: level })
          : tr("notif.levelsGained", { n: level, count: levelsGained }),
      });
    }
    if (levelsLost) {
      notifications.push({
        kind: "delevel",
        text: levelsLost === 1
          ? tr("notif.levelLost", { n: level })
          : tr("notif.levelsLost", { n: level, count: levelsLost }),
      });
    }
    // Sorted by size so the trait that actually grew leads, and capped: past a
    // handful these stop being news and become a wall again.
    [...pointsByTrait.entries()]
      .map(([key, points]) => { const [trait, short] = key.split("\u0000"); return { trait, short, points }; })
      .sort((a, b) => b.points - a.points)
      .slice(0, 4)
      .forEach((d) => notifications.push({ kind: "skillpoint", text: `+${d.points} pt → ${d.trait} (${d.short})` }));

    state.player = { ...state.player, rank: SYS.RANKS[rankIdx], level, exp: Math.max(0, exp) };
    state.log = [...logEntries, ...state.log].slice(0, 80);
    bumpDailyStat(state, "xp", delta);
    // Every EXP movement in the app funnels through here, which makes this the
    // one place a complete record can be taken without dotting the same call
    // through a dozen call sites and eventually missing one. Strictly an
    // observer: it runs after the ledger is settled, its return value is
    // ignored, and a throw inside it must not corrupt a completed change —
    // hence the guard. Nothing about EXP behaves differently for its presence.
    //
    // It reports what the ledger actually moved, never the delta it was
    // handed. The two part company at both ends of the scale: a penalty
    // bigger than someone's remaining EXP stops at zero, and gains past
    // S-Rank Lv100 are discarded. Recording the request instead of the
    // outcome would drift the public standing away from the real one every
    // time either happens — downwards at the floor, upwards at the ceiling —
    // and nothing would ever reconcile it back.
    const applied = totalExp(state.player) - totalBefore;
    if (applied && !SYS.suppressExpJournal && typeof SYS.onExpDelta === "function") {
      try { SYS.onExpDelta(applied, sourceLabel, meta); } catch (e) { console.warn("[TheSystem] exp journal hook failed", e); }
    }
    return notifications;
  }
  // Used by the migration that clears the old banked pile — the same rule the
  // allocator applies when nothing says where a point belongs.
  SYS.placeUnattributedPoints = function (state, count) {
    return placeWeakest(state.intelligences, state.intTypes, Math.max(0, Math.round(count) || 0));
  };

  SYS.applyExpDelta = applyExpDelta;

  // Set while applying a correction that was itself worked out from the
  // journal. Journalling such a correction would move the very total it was
  // derived from, and the two would then chase each other upwards forever.
  SYS.suppressExpJournal = false;

  // A single sortable number for "how far has this player actually come".
  //
  // rank/level/exp are three counters that only mean something together:
  // exp runs 0-99 inside a level, level runs 1-100 inside a rank, and rank
  // walks SYS.RANKS. Comparing two players on `level` alone would put an
  // F-rank level 3 above a G-rank level 99, so the leaderboard sorts on this
  // flattened total instead.
  //
  // The Cloud Function that mirrors users/{uid} into leaderboard/{uid}
  // computes the same thing (functions/index.js totalExpOf) — the two must
  // stay in step, so change them together.
  function totalExp(player) {
    if (!player) return 0;
    const rankIdx = SYS.rankIndex(player.rank);
    const level = Math.max(1, Number(player.level) || 1);
    const exp = Math.max(0, Number(player.exp) || 0);
    // Ranks are no longer the same size, so this has to add up the ones
    // already crossed rather than multiply out a single figure.
    let total = 0;
    for (let r = 0; r < rankIdx; r++) total += SYS.RANK_LEVEL_EXP[r] * SYS.LEVELS_PER_RANK;
    return total + (level - 1) * SYS.levelCost(rankIdx) + exp;
  }
  SYS.totalExp = totalExp;

  // The inverse: turns one trusted total back into the three counters people
  // actually read. The leaderboard uses this so a row's rank and level are
  // derived from the number the server vouches for, rather than copied from
  // whatever the client claimed alongside it.
  function expToStanding(total) {
    let t = Math.max(0, Math.floor(Number(total) || 0));
    const topIdx = SYS.RANKS.length - 1;
    for (let r = 0; r <= topIdx; r++) {
      const cost = SYS.RANK_LEVEL_EXP[r];
      const wholeRank = cost * SYS.LEVELS_PER_RANK;
      if (t < wholeRank || r === topIdx) {
        const levelsDone = Math.floor(t / cost);
        // Nothing above the last rank: past its ceiling the level would
        // otherwise wrap and present a maxed-out player as Lv 1.
        if (levelsDone >= SYS.LEVELS_PER_RANK) {
          return { rank: SYS.RANKS[topIdx], level: SYS.LEVELS_PER_RANK, exp: cost - 1 };
        }
        return { rank: SYS.RANKS[r], level: levelsDone + 1, exp: t - levelsDone * cost };
      }
      t -= wholeRank;
    }
  }
  SYS.expToStanding = expToStanding;

  // Puts the ledger back to a total the server vouches for.
  //
  // The ordinary route is a plain delta through applyExpDelta, which keeps
  // levels, trait investment and undo history exactly consistent. That covers
  // what this is normally for: small drift, and restoring a device whose local
  // data was lost.
  //
  // It cannot always get there, and the case where it can't is the interesting
  // one. Undoing a level means replaying the record that created it, and a
  // hand-edited state carries levels no record was ever written for — so the
  // reversal runs out of history and floors at zero instead of landing on the
  // target. There is no faithful way to rewind a state that no legitimate
  // sequence produced. The honest outcome is to restore the standing the
  // record actually supports, and to stop there rather than invent a trait
  // ledger to match; those points were awarded, wrongly, and pretending to
  // know which ones to take back would be its own fiction.
  function reconcileExpTo(state, targetTotal, label) {
    const target = Math.max(0, Math.floor(Number(targetTotal) || 0));
    if (target === totalExp(state.player)) return [];
    const wasSuppressed = SYS.suppressExpJournal;
    // Suppressed because this figure was read *from* the journal; recording it
    // would move the total it was calculated from.
    SYS.suppressExpJournal = true;
    try {
      const notifications = applyExpDelta(state, target - totalExp(state.player), [], label || "Corrected");
      if (totalExp(state.player) !== target) {
        const standing = expToStanding(target);
        state.player = { ...state.player, rank: standing.rank, level: standing.level, exp: standing.exp };
      }
      return notifications;
    } finally {
      SYS.suppressExpJournal = wasSuppressed;
    }
  }
  SYS.reconcileExpTo = reconcileExpTo;

  // Gradual and simple/all-at-once tasks share one rule: a task's EXP contribution
  // always equals pt/divisor * completion%, full stop. Moving completion (or
  // editing Pt) in either direction applies the exact delta via applyExpDelta —
  // raising it grants EXP/levels, lowering it takes them back, precisely.
  function applyTaskProgress(state, taskId, newCompletion) {
    const t = state.tasks.find((x) => x.id === taskId);
    if (!t) return [];
    const clamped = Math.max(0, Math.min(100, newCompletion));
    const newExpTotal = Math.floor(ptToExp(t.pt) * (clamped / 100));
    const delta = newExpTotal - t.expBaseline;
    const wasDone = t.completion >= 100;
    t.completion = clamped;
    t.expBaseline = newExpTotal;
    const nowDone = clamped >= 100;
    if (nowDone && !wasDone) { state.player.questsCompleted += 1; bumpDailyStat(state, "quests", 1); }
    if (!nowDone && wasDone) { state.player.questsCompleted = Math.max(0, state.player.questsCompleted - 1); bumpDailyStat(state, "quests", -1); }
    if (delta !== 0) return applyExpDelta(state, delta, t.types, t.title, t.traitTargets, { priceId: t.priceId });
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
      // From AI evaluation: which specific trait in each tagged category this
      // task builds. Absent on anything created before AI pricing existed,
      // which just falls back to weakest-trait allocation.
      traitTargets: Array.isArray(form.traitTargets) ? form.traitTargets : [],
      // Which recorded evaluation set this task's value. The server checks
      // journal entries against it; tasks predating this simply have none, and
      // their entries count as unverified rather than being refused.
      priceId: typeof form.priceId === "string" ? form.priceId : null,
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
    const newExpTotal = Math.floor(ptToExp(t.pt) * (t.completion / 100));
    const delta = newExpTotal - t.expBaseline;
    t.expBaseline = newExpTotal;
    if (delta !== 0) return applyExpDelta(state, delta, t.types, t.title + " (edited)", t.traitTargets, { priceId: t.priceId });
    return [];
  }
  SYS.updateTask = updateTask;

  // Applies an admin-approved correction to a task's value (see the appeal
  // flow in functions/index.js). Deliberately routes through the same
  // baseline-delta path an edit already uses, so the EXP difference is exact
  // and the undo ledger stays consistent.
  //
  // For a habit the new value applies to future repeats only: repeats already
  // logged were genuinely earned at the old rate, and only the current week's
  // individual repeats are even retained, so any "back-pay" would be
  // arbitrary about how far back it reached. Forward-only is the honest rule,
  // and the admin can still send a one-off adjustment for the difference.
  function repriceTask(state, taskId, newPt) {
    const t = state.tasks.find((x) => x.id === taskId);
    if (!t) return [];
    const pt = Math.max(0, Number(newPt) || 0);
    if (pt === t.pt) return [];
    t.pt = pt;
    if (t.recurring) return [{ kind: "info", text: `${t.title} is now worth ${pt} xp per repeat.` }];

    const newExpTotal = Math.floor(ptToExp(t.pt) * (t.completion / 100));
    const delta = newExpTotal - t.expBaseline;
    t.expBaseline = newExpTotal;
    if (delta !== 0) return applyExpDelta(state, delta, t.types, t.title + " (value corrected)", t.traitTargets, { priceId: t.priceId });
    return [{ kind: "info", text: `${t.title} is now worth ${pt} xp.` }];
  }
  SYS.repriceTask = repriceTask;

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
    const notifications = applyExpDelta(state, ptToExp(t.pt), t.types, t.title, t.traitTargets, { priceId: t.priceId });
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
    return applyExpDelta(state, -ptToExp(t.pt), t.types, t.title + " (undo)", t.traitTargets, { priceId: t.priceId });
  }
  SYS.undoLastRecurringRepeat = undoLastRecurringRepeat;

  // SYS.spendBankedPoint used to live here. Placing points by hand was the last
  // thing a player decided for themselves, and it sat oddly beside a system
  // that sets every value, category and trait. Nothing banks any more, so
  // there is nothing left to place by hand.

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

  function setTheme(state, themeName) {
    if (SYS.THEMES[themeName] || themeName === SYS.CUSTOM_THEME_NAME) state.settings.theme = themeName;
  }
  SYS.setTheme = setTheme;

  function setLanguage(state, code) {
    if (SYS.LANGUAGES[code]) state.settings.language = code;
  }
  SYS.setLanguage = setLanguage;

  // Updates the user-defined palette and switches to it. Colours are
  // sanitised here rather than trusted, same as intelligence-category
  // colours — this value ends up interpolated into CSS.
  function setCustomTheme(state, opts) {
    const cur = state.settings.customTheme || {};
    const next = {
      dark: typeof opts.dark === "boolean" ? opts.dark : !!cur.dark,
      accent: SYS.sanitizeColor(opts.accent, cur.accent || "#d9a05b"),
      base: SYS.sanitizeColor(opts.base, cur.base || "#141110"),
    };
    // The dark/light buttons pick a matching background rather than only
    // flipping a flag — the palette derives light-vs-dark text from the
    // background itself, so a mode switch that left a near-black background
    // in place would appear to do nothing.
    if (typeof opts.dark === "boolean" && opts.dark !== !!cur.dark) {
      next.base = opts.dark ? "#141110" : "#ffffff";
    }
    // Keep the stored flag honest about what will actually render, so the
    // toggle reflects reality after the background alone is changed.
    next.dark = SYS.luminance(next.base) < 0.5;
    state.settings.customTheme = next;
    state.settings.theme = SYS.CUSTOM_THEME_NAME;
  }
  SYS.setCustomTheme = setCustomTheme;
})(window.SYS = window.SYS || {});

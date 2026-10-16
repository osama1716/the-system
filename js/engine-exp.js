// Game rules: EXP into levels and ranks, the level history, standing, a task's progress.
// One of the files engine.js was split into (2026-10-16); the names they share travel through
// SYS._engine, and each file takes what it needs from the files loaded before it.
(function (SYS) {
  "use strict";
  const E = SYS._engine || (SYS._engine = {});
  const { allocatePoints, awardOf, bumpDailyStat, consumeComposition, developmentalShare, payableQuestExp, placeWeakest, q, recordScores, reportProgress, sameRemainders, tr } = E;

  // How many level records are kept: the newest this many.
  //
  // The whole state is one Firestore document with a 1 MiB ceiling, and each
  // level record is about 1.7 KB — the full ladder of 800 levels came to
  // ~1.35 MB, past which no save of the account lands at all. 150 records is
  // ~340 KB and 150 levels of exact undo: 30,000 EXP at S-rank, far more than
  // any one task gives back.
  //
  // A level older than the kept records can still be taken back —
  // `player.trimmedLevels` counts them — at the price of the rank it was
  // bought in; what is no longer known is which trait its points went to, so
  // trait levels and remainders stay where they are for those. An account
  // whose history was never trimmed keeps the old floor exactly.
  SYS.LEVEL_HISTORY_KEEP = 150;
  function trimLevelHistory(state) {
    const keep = Math.max(1, Math.floor(Number(SYS.LEVEL_HISTORY_KEEP) || 150));
    const list = state && Array.isArray(state.levelHistory) ? state.levelHistory : null;
    if (!list || list.length <= keep || !state.player) return false;
    const drop = list.length - keep;
    list.splice(0, drop);
    state.player.trimmedLevels = (Number(state.player.trimmedLevels) || 0) + drop;
    return true;
  }
  SYS.trimLevelHistory = trimLevelHistory;

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
      state.player.composition[t] = q((state.player.composition[t] || 0) + delta / types.length);
    });
    // Mirror the same split one level deeper for any category the task named
    // a specific trait for, so allocatePoints can invest where the work
    // actually went. Tasks without trait targets simply don't contribute
    // here and fall back to weakest-trait allocation.
    (traitTargets || []).forEach((tt) => {
      if (!tt || !tt.category || !tt.trait || !types.includes(tt.category)) return;
      const bucket = state.player.traitComposition[tt.category] || {};
      bucket[tt.trait] = q((bucket[tt.trait] || 0) + delta / types.length);
      state.player.traitComposition[tt.category] = bucket;
    });

    // What THIS delta says it builds, kept apart from the running pool.
    //
    // The pool carries whatever earlier tasks left unconverted, and the award
    // used to pick from it — so a large task aimed at one trait could take the
    // point a small task in the same category had just earned. Logging a drink
    // of water credited Handcrafts, and then Yoga, while the row plainly read
    // "builds Health". The name was right, the match was right, and the award
    // still went elsewhere, because the award was never reading the task.
    //
    // A task that names a trait now decides where its own points go. The pool
    // is consulted only for work that named nothing.
    const deltaTargets = {};
    (traitTargets || []).forEach((tt) => {
      if (!tt || !tt.category || !tt.trait || !types.includes(tt.category)) return;
      deltaTargets[tt.category] = deltaTargets[tt.category] || {};
      deltaTargets[tt.category][tt.trait] = (deltaTargets[tt.category][tt.trait] || 0) + 1;
    });
    const namesATrait = Object.keys(deltaTargets).length > 0;
    // The categories this delta itself named, weighted by how many of its
    // trait targets fall in each — the category side of the same decision.
    const deltaCategoryWeights = {};
    Object.keys(deltaTargets).forEach((cat) => {
      deltaCategoryWeights[cat] = Object.keys(deltaTargets[cat])
        .reduce((sum, name) => sum + deltaTargets[cat][name], 0);
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
    // Where this movement started, so the log can say "Level 6 → 68" once
    // rather than once per level crossed. A rank change inside the span keeps
    // its own line, which is what explains the numbers restarting at 1.
    const levelAtStart = level;
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

      // What this level's points build. A delta that names its own traits
      // decides both the category and the trait: the pool is what earlier
      // work left unconverted, and a level's cost is drawn proportionally
      // from every category in it — so a Bodily task's points were landing
      // in Naturalist and Visual, on those categories' weakest traits, while
      // the task row read "BUILDS Handcrafts". Work that names nothing still
      // follows the pool, which is the only signal it has.
      //
      // The EXP attribution is still consumed exactly as before (above), so
      // the level history reverses this level unchanged.
      // A delta that names its own traits is developmental by definition, so
      // the share only ever bites on the pool.
      const levelWeights = namesATrait ? deltaCategoryWeights : compositionSnapshot;
      const { distribution, banked, awardedTraits } = allocatePoints(
        state.intelligences,
        levelWeights,
        SYS.pointsForLevel(rankIdx) * developmentalShare(levelWeights),
        state.intTypes,
        namesATrait ? deltaTargets : traitCompositionSnapshot
      );
      state.player.bankedPoints += banked;
      // Only the categories this level actually changed. Every level used to
      // copy the remainders of all of them, and that copy was most of the
      // level history — a few hundred levels in, enough to push the saved
      // document past Firestore's 1 MiB limit, after which no save lands.
      // Undo restores exactly the categories a record names, and undoing runs
      // newest first, so a category left out here already holds, by the time
      // this record is undone, the value it had before this level.
      Object.keys(remainderSnapshot).forEach((k) => {
        const intel = state.intelligences[k];
        const snap = remainderSnapshot[k];
        if (intel && intel.remainder === snap.category && sameRemainders(intel.traitRemainder, snap.traits)) {
          delete remainderSnapshot[k];
        }
      });
      state.levelHistory.push({ levelBefore, rankIdxBefore, awardedTraits, banked, compositionSnapshot, traitCompositionSnapshot, remainderSnapshot });

      if (level > SYS.LEVELS_PER_RANK) {
        rankIdx += 1;
        level = 1;
        notifications.push({ kind: "rankup", text: `Welcome to ${SYS.RANKS[rankIdx]}-Rank`, rank: SYS.RANKS[rankIdx] });
        logEntries.push({ date: levelLogDate(), text: `RANK UP → ${SYS.RANKS[rankIdx]}-Rank` });
      } else {
        levelsGained += 1;
        distribution.forEach((d) => {
          const key = d.trait + "\u0000" + d.short;
          pointsByTrait.set(key, (pointsByTrait.get(key) || 0) + d.points);
        });
      }
    }

    trimLevelHistory(state);

    while (exp < 0) {
      const record = state.levelHistory.pop();
      if (!record) {
        // Older than the kept records (see LEVEL_HISTORY_KEEP): the level is
        // still taken back, at the price of the rank it was bought in, but its
        // trait points cannot be, because which trait they went to was trimmed
        // with the record. With nothing ever trimmed this is the very
        // beginning, and the floor.
        const trimmed = Number(state.player.trimmedLevels) || 0;
        if (trimmed <= 0 || (level <= 1 && rankIdx <= 0)) { exp = 0; break; }
        state.player.trimmedLevels = trimmed - 1;
        if (level > 1) {
          level -= 1;
          levelsLost += 1;
        } else {
          rankIdx -= 1;
          level = SYS.LEVELS_PER_RANK;
          notifications.push({ kind: "rankdown", text: `Dropped to ${SYS.RANKS[rankIdx]}-Rank`, rank: SYS.RANKS[rankIdx] });
          logEntries.push({ date: levelLogDate(), text: `RANK DOWN → ${SYS.RANKS[rankIdx]}-Rank (progress reverted)` });
        }
        exp += SYS.levelCost(rankIdx);
        continue;
      }

      const rankDownHappening = rankIdx !== record.rankIdxBefore;

      (record.awardedTraits || []).forEach((award) => {
        const { type: typeKey, traitId } = awardOf(award);
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
      }
    }

    // The whole movement as one line, at the top of what this delta wrote.
    // Sixty-two identical "Level 41 → 42" rows are not a record of anything
    // anybody wants to read; the span plus the points it bought is.
    if (levelsGained || levelsLost) {
      const spanText = [...pointsByTrait.entries()]
        .map(([key, points]) => { const [trait, short] = key.split(" "); return `+${points} ${short} → ${trait}`; })
        .join(", ");
      logEntries.unshift({
        date: levelLogDate(),
        text: `Level ${levelAtStart} → ${level}` +
          (levelsLost ? " (reverted)" : "") +
          (levelsGained && spanText ? ": " + spanText : ""),
      });
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
    // Where every category stands at the end of this day, for the radar's
    // second outline. After the loop, so it is the settled figure \u2014 and on
    // a negative delta too, so taking EXP back moves the recent window with
    // it rather than leaving it claiming growth that was undone.
    recordScores(state);

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
  // A saved standing was written in whatever a level cost at the time. When
  // that changes, the stored rank/level/exp stops meaning what it says — so it
  // is re-derived once, from the EXP behind it.
  //
  // EXP itself never moves here, and neither do trait levels: they were earned
  // against work, not against level numbers. What goes is the level history,
  // because every record in it counts levels in the old units and could no
  // longer undo one correctly. The count survives as `trimmedLevels`, where
  // undoing past a record steps a level down at its rank's price without
  // refunding a trait — the behaviour already documented for records older
  // than the history cap.
  function migrateLevelCurve(state) {
    if (!state || !state.player) return false;
    const was = Number(state.player.curve) || 2;
    if (was === SYS.LEVEL_CURVE) return false;
    const old = SYS.RANK_LEVEL_EXP_BY_CURVE[was] || SYS.RANK_LEVEL_EXP_BY_CURVE[2];

    const rankIdx = SYS.rankIndex(state.player.rank);
    const level = Math.max(1, Number(state.player.level) || 1);
    const exp = Math.max(0, Number(state.player.exp) || 0);
    let total = 0;
    for (let r = 0; r < rankIdx; r++) total += old[r] * SYS.LEVELS_PER_RANK;
    total += (level - 1) * (old[rankIdx] || old[old.length - 1]) + exp;

    const standing = expToStanding(total);
    state.player = {
      ...state.player,
      rank: standing.rank, level: standing.level, exp: standing.exp,
      curve: SYS.LEVEL_CURVE,
    };
    const had = Array.isArray(state.levelHistory) ? state.levelHistory.length : 0;
    if (had) {
      state.player.trimmedLevels = (Number(state.player.trimmedLevels) || 0) + had;
      state.levelHistory = [];
    }
    return true;
  }
  SYS.migrateLevelCurve = migrateLevelCurve;

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

  // Where a steady pace would put someone after a number of days, for the
  // picture at the end of the assessment. Hours, not tasks: the evaluator
  // prices work by the hour, so an hour a day is the one pace that means the
  // same thing whatever the work is. It counts from the standing they have
  // now, and says on which day the next rank would arrive (null if not inside
  // the span).
  function projectStanding(startTotal, hoursPerDay, days) {
    const start = Math.max(0, Math.floor(Number(startTotal) || 0));
    const perDay = Math.max(0, Number(hoursPerDay) || 0) * SYS.PROJECTION_EXP_PER_HOUR;
    const span = Math.max(0, Math.floor(Number(days) || 0));
    const from = expToStanding(start);
    let rankUpDay = null;
    for (let d = 1; d <= span && perDay > 0; d++) {
      if (expToStanding(start + perDay * d).rank !== from.rank) { rankUpDay = d; break; }
    }
    const to = expToStanding(start + perDay * span);
    // Levels are what moves every day; the rank is the slow, fair part.
    const levels = (SYS.rankIndex(to.rank) - SYS.rankIndex(from.rank)) * SYS.LEVELS_PER_RANK + (to.level - from.level);
    return { from, to, levels, rankUpDay };
  }
  SYS.projectStanding = projectStanding;

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
    const newExpTotal = payableQuestExp(t, clamped);
    const delta = newExpTotal - t.expBaseline;
    const wasDone = t.completion >= 100;
    const previousCompletion = Number(t.completion) || 0;
    t.completion = clamped;
    t.expBaseline = newExpTotal;
    const nowDone = clamped >= 100;
    if (nowDone && !wasDone) { state.player.questsCompleted += 1; bumpDailyStat(state, "quests", 1); }
    if (!nowDone && wasDone) { state.player.questsCompleted = Math.max(0, state.player.questsCompleted - 1); bumpDailyStat(state, "quests", -1); }
    // `progress` is what the server is told: the state reached, not the EXP
    // it came to. The server works out the EXP itself (recordProgress).
    if (delta !== 0) return applyExpDelta(state, delta, t.types, t.title, t.traitTargets,
      { priceId: t.priceId, progress: { kind: "quest", completion: clamped } });
    // Progress that pays nothing still has to reach the server. A gated quest
    // earns nothing until its answer is accepted, and the journal hook only
    // fires when EXP moves — so without this the server never learned the
    // quest had reached its question, refused the answer as premature, and
    // the points stayed held for ever. Reports are idempotent, so sending one
    // that changes nothing is always safe.
    if (t.priceId && previousCompletion !== clamped) reportProgress(t, { kind: "quest", completion: clamped });
    return [];
  }
  SYS.applyTaskProgress = applyTaskProgress;

  function completeSimpleTask(state, taskId) { return applyTaskProgress(state, taskId, 100); }
  SYS.completeSimpleTask = completeSimpleTask;

  function reopenSimpleTask(state, taskId) { return applyTaskProgress(state, taskId, 0); }
  SYS.reopenSimpleTask = reopenSimpleTask;

  Object.assign(E, { trimLevelHistory, levelLogDate, applyExpDelta, totalExp, migrateLevelCurve, expToStanding, projectStanding, reconcileExpTo, applyTaskProgress, completeSimpleTask, reopenSimpleTask });
})(window.SYS = window.SYS || {});

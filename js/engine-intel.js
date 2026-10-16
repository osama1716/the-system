// Game rules: the assessment, the intelligences' scores and where skill points go.
// One of the files engine.js was split into (2026-10-16); the names they share travel through
// SYS._engine, and each file takes what it needs from the files loaded before it.
(function (SYS) {
  "use strict";
  const E = SYS._engine || (SYS._engine = {});
  const { shiftDay, todayKey, tr } = E;

  // What a category is worth: the sum of its traits' levels, not their
  // average.
  //
  // The average divided by how many traits we happened to write into that
  // category — self 5, bodily 7, the rest 4 — and the count is ours, not
  // something anyone earned. It made the same work worth 1.75x more in the
  // thinnest category than the thickest: on the seeded profile, Bodily held
  // 18 points of work and read 2.57 while Social held 11 and read 2.75. The
  // radar ranked less work above more.
  //
  // Points come from EXP, never from the trait count — ten points into
  // Bodily are ten whether it holds four traits or forty — so the divisor
  // never had anything to do with effort. It also punished a widening life:
  // adding a trait dropped the score the moment it appeared (23/4 = 5.75
  // became 23/5 = 4.6 for doing nothing wrong), which blocks the
  // comprehensive trait list this is being cleared for.
  //
  // `weakestCategory` below has always used the sum. The page showed the
  // average, so the two could disagree about which category was weakest —
  // the label said one thing and the unattributed points went to another.
  // Where every category stood at the end of a day, kept for the last
  // SCORE_LOG_DAYS days.
  //
  // Nothing in this app decays and nothing should: a number that falls
  // because someone was ill for a month is a punishment, and people leave
  // over it. But a total that only ever rises is a record of who someone was,
  // not a picture of who they are. Two outlines say both at once — the gap
  // between them is "built years ago, untouched since" — and neither takes
  // anything away.
  //
  // A snapshot, not a ledger of points, because a ledger has to be undone
  // exactly when EXP is taken back. This is simply what the scores were; an
  // undo lowers today's and the difference follows on its own.
  // The categories worth wearing, strongest first. Derived, never stored:
  // there is nothing to keep in sync and nothing to migrate, and a category
  // that falls below the bar stops being worn on its own.
  function earnedCategories(state) {
    const intel = (state && state.intelligences) || {};
    return (((state && state.intTypes) || [])
      .filter((t) => t && intel[t.key])
      .map((t) => ({ key: t.key, score: categoryScore(intel[t.key]) }))
      .filter((x) => x.score >= SYS.CATEGORY_EMBLEM_AT)
      .sort((a, b) => b.score - a.score));
  }
  SYS.earnedCategories = earnedCategories;

  // What the assessment hands out, and where.
  //
  // A budget, not a sum. The whole test may grant ASSESSMENT_BUDGET points
  // however it is answered: the answers decide WHERE they land, never how
  // many there are. Agreeing strongly with all forty spreads the same forty
  // across eight categories rather than multiplying them, so inflating every
  // answer is pointless by construction instead of by policing — which is
  // the only kind of strictness that holds, since a self-report cannot be
  // checked.
  //
  // Then no category may hold more than ASSESSMENT_CATEGORY_CAP of it, and
  // the surplus is NOT redistributed. Someone who claims one field and
  // nothing else should not walk out of a ten-minute test with more than a
  // year of real work puts into a category; letting the overflow run into
  // their other answers would hand it back.
  //
  // Only agreement earns. The weight of an answer is what it exceeds the
  // midpoint by, so "neither" is worth nothing and disagreeing is worth
  // nothing more than that. "Does not apply" is worth nothing either, and is
  // kept as ground never walked on.
  //
  // Returns points per question id, fractional. Nothing is placed here —
  // this is the arithmetic, and it is separable so it can be tested without a
  // state to mutate.
  function scoreAssessment(answers) {
    const qs = SYS.ASSESSMENT || [];
    const a = answers || {};
    const weightOf = (q) => {
      const v = a[q.id];
      if (v === SYS.ASSESSMENT_NA || v == null) return 0;
      return Math.max(0, (Number(v) || 0) - SYS.ASSESSMENT_MID);
    };
    const weights = qs.map(weightOf);
    const total = weights.reduce((x, y) => x + y, 0);
    const grants = {};
    if (total <= 0) return grants;

    qs.forEach((q, i) => {
      if (weights[i] > 0) grants[q.id] = SYS.ASSESSMENT_BUDGET * weights[i] / total;
    });

    const byCat = {};
    qs.forEach((q) => { if (grants[q.id]) byCat[q.key] = (byCat[q.key] || 0) + grants[q.id]; });
    Object.keys(byCat).forEach((k) => {
      const cap = SYS.ASSESSMENT_CATEGORY_CAP;
      if (byCat[k] <= cap) return;
      const factor = cap / byCat[k];
      qs.forEach((q) => { if (q.key === k && grants[q.id]) grants[q.id] *= factor; });
    });
    return grants;
  }
  SYS.scoreAssessment = scoreAssessment;

  // Places what scoreAssessment worked out, and records that it happened.
  //
  // Points only: no EXP, no level, no rank. The ladder is what you have done
  // and stays earned; this is a starting picture of what you can already do.
  // It is the mirror of the split in applyExpDelta, and deliberate.
  //
  // The fractional part is banked per trait exactly as an awarded point's is,
  // so nothing is lost to rounding and the next real point arrives sooner.
  function applyAssessment(state, answers) {
    if (!state || state.assessment) return false;
    const grants = scoreAssessment(answers);
    const granted = {};
    const neverTried = [];

    // `item`, not `q`: `q` is the rounding helper a few hundred lines above,
    // and shadowing it here would have quietly stopped rounding the banked
    // fractions — the kind of bug that leaves no trace but a growing document.
    (SYS.ASSESSMENT || []).forEach((item) => {
      if ((answers || {})[item.id] === SYS.ASSESSMENT_NA) neverTried.push({ key: item.key, trait: item.trait });
      const points = grants[item.id];
      if (!(points > 0)) return;
      const intel = state.intelligences[item.key];
      if (!intel || !Array.isArray(intel.traits)) return;
      const idx = matchTraitIndex(intel.traits, item.trait);
      if (idx < 0) return;
      const trait = intel.traits[idx];
      intel.traitRemainder = intel.traitRemainder && typeof intel.traitRemainder === "object" ? intel.traitRemainder : {};
      const banked = (Number(intel.traitRemainder[trait.id]) || 0) + points;
      const whole = Math.floor(banked + 1e-9);
      const rest = q(banked - whole);
      if (rest > 1e-6) intel.traitRemainder[trait.id] = rest;
      else delete intel.traitRemainder[trait.id];
      trait.level += whole;
      intel.remainder = q(Object.keys(intel.traitRemainder)
        .reduce((sum, k) => sum + (Number(intel.traitRemainder[k]) || 0), 0));
      granted[item.key] = (granted[item.key] || 0) + points;
    });

    Object.keys(granted).forEach((k) => { granted[k] = Math.round(granted[k] * 10) / 10; });
    state.assessment = {
      takenAt: Date.now(),
      answers: { ...(answers || {}) },
      granted,
      // Ground never walked on. The weekly suggestion wants this more than
      // anything else the test produces: "never tried" and "tried and gave up"
      // are the same zero on the radar and are not the same invitation.
      neverTried,
    };

    // Where this person started, kept where a day's rewriting cannot reach
    // it. Everything after this is growth; this is not.
    const floor = {};
    Object.keys(state.intelligences || {}).forEach((k) => {
      const v = categoryScore(state.intelligences[k]);
      if (v > 0) floor[k] = v;
    });
    state.player.scoreFloor = floor;
    recordScores(state);
    return true;
  }
  SYS.applyAssessment = applyAssessment;

  // The admin account only: closes the test without answering it and grants
  // nothing. Whatever the account already holds becomes its floor, exactly as
  // a finished test's starting picture would, so the ninety-day outline does
  // not present years of standing as recent work.
  function skipAssessment(state) {
    if (!state || state.assessment) return false;
    state.assessment = { takenAt: Date.now(), answers: {}, granted: {}, neverTried: [], skipped: true };
    const floor = {};
    Object.keys(state.intelligences || {}).forEach((k) => {
      const v = categoryScore(state.intelligences[k]);
      if (v > 0) floor[k] = v;
    });
    state.player.scoreFloor = floor;
    recordScores(state);
    return true;
  }
  SYS.skipAssessment = skipAssessment;

  function recordScores(state) {
    const day = todayKey();
    const scores = {};
    Object.keys(state.intelligences || {}).forEach((k) => {
      const v = categoryScore(state.intelligences[k]);
      if (v > 0) scores[k] = v;
    });
    const log = Array.isArray(state.player.scoreLog) ? state.player.scoreLog : [];
    const last = log[log.length - 1];
    if (last && last.d === day) last.s = scores;
    else log.push({ d: day, s: scores });
    if (log.length > SYS.SCORE_LOG_DAYS) log.splice(0, log.length - SYS.SCORE_LOG_DAYS);
    state.player.scoreLog = log;
  }
  SYS.recordScores = recordScores;

  // What the last `days` days built, per category: where things stand now,
  // less where they stood then. An account younger than the window has no
  // snapshot that old, and then all of it is recent — which is true.
  function recentScores(state, days) {
    const log = Array.isArray(state.player && state.player.scoreLog) ? state.player.scoreLog : [];
    const cutoff = shiftDay(todayKey(), -(Number(days) || 90));
    let base = null;
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i] && log[i].d <= cutoff) { base = log[i].s || {}; break; }
    }
    // Nothing that old. The assessment's starting picture is the floor if
    // there is one: its grant is a starting position rather than work, and
    // without this the radar would spend ninety days presenting a ten-minute
    // questionnaire as the last ninety days of someone's life. It is kept
    // apart from the log because a day's snapshot is rewritten as that day
    // goes on, and the first quest finished on day one would swallow it.
    if (!base && state.player && state.player.scoreFloor) base = state.player.scoreFloor;
    // Failing that, the earliest record there is: growth since we began
    // watching, which is all anyone can honestly claim.
    if (!base && log.length) base = log[0].s || {};
    const out = {};
    Object.keys(state.intelligences || {}).forEach((k) => {
      const now = categoryScore(state.intelligences[k]);
      out[k] = Math.max(0, now - (base ? (Number(base[k]) || 0) : 0));
    });
    return out;
  }
  SYS.recentScores = recentScores;

  function categoryScore(intel) {
    if (!intel || !intel.traits || !intel.traits.length) return 0;
    return intel.traits.reduce((s, t) => s + (Number(t.level) || 0), 0);
  }
  SYS.categoryScore = categoryScore;

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
      awardedTraits.push({ type: key, traitId: intel.traits[idx].id });
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
      used[k] = q(comp[k] * fraction);
      comp[k] = q(comp[k] - used[k]);
      if (comp[k] < 1e-6) delete comp[k];
    });

    // The per-trait split rides one level deeper and is drawn down in the same
    // proportion, so the two never fall out of step.
    const traitComp = state.player.traitComposition || {};
    const usedTraits = {};
    Object.keys(traitComp).forEach((cat) => {
      const bucket = traitComp[cat];
      const taken = {};
      Object.keys(bucket).forEach((name) => {
        taken[name] = q(bucket[name] * fraction);
        bucket[name] = q(bucket[name] - taken[name]);
        if (Math.abs(bucket[name]) < 1e-6) delete bucket[name];
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
  // How much of a level's EXP was work that builds something.
  //
  // There are two currencies here and they had been welded together. EXP
  // raises the level and the rank: how much you have done. Skill points raise
  // traits and draw the radar: what you have built. Every EXP used to
  // manufacture points, so the two said the same thing \u2014 and the radar
  // inherited work that built nothing.
  //
  // The evaluator already classes paperwork, bills, bookings, errands and
  // household chores as developing no intelligence and returns an empty
  // category list; that EXP lands under "general". It still crossed levels,
  // and every level paid its full points, distributed across whatever else
  // was in the pool. A 40 EXP bill bought part of a point in Reading. The
  // evaluator said it builds nothing and the engine turned it into growth.
  //
  // A level now pays in proportion. 60 EXP of reading and 40 of bills crosses
  // a 100 EXP level, and that level pays 0.6 of a point, to Reading. The bill
  // still moves the bar. Fractions bank per trait, so 0.6 is not lost.
  //
  // An EMPTY pool is not the same as a general one and keeps the old
  // behaviour: "general" is the evaluator saying this builds nothing, while
  // nothing at all is the engine having no information \u2014 an admin
  // correction, or EXP from before any of this existed. There is no evidence
  // that work was non-developmental, so it is not docked for it.
  function developmentalShare(weights) {
    let all = 0, typed = 0;
    Object.keys(weights || {}).forEach((k) => {
      const v = weights[k];
      if (!(v > 0)) return;
      all += v;
      if (k !== "general") typed += v;
    });
    if (all <= 0) return 1;
    return typed / all;
  }

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
        // A remainder of exactly nothing is not stored. Every read of this map
        // is `|| 0`, so an absent key and a zero are the same value — but the
        // zero is copied into every level record from then on. On a full climb
        // 4,571 of the 11,313 entries in the history were zeros, and the whole
        // state is one Firestore document with a 1 MiB ceiling past which no
        // save lands at all.
        const rest = q(banked - whole);
        if (rest > 1e-6) intel.traitRemainder[key] = rest;
        else delete intel.traitRemainder[key];
        if (whole <= 0) return;
        trait.level += whole;
        for (let i = 0; i < whole; i++) awardedTraits.push({ type, traitId: trait.id });
        wholeHere += whole;
        lastName = trait.name;
      });

      // Kept in step with the per-trait banks, so the category figure the
      // Intelligence page shows still means "progress towards the next point".
      intel.remainder = q(Object.keys(intel.traitRemainder)
        .reduce((sum, k) => sum + (Number(intel.traitRemainder[k]) || 0), 0));

      if (wholeHere > 0) {
        const label = intTypes.find((x) => x.key === type);
        distribution.push({ type, points: wholeHere, share: categoryWeight / totalTyped, trait: lastName, short: label ? label.short : type });
      }
    });

    return { distribution, banked: 0, awardedTraits };
  }
  SYS.allocatePoints = allocatePoints;

  // Which trait one awarded point went to. Recorded as { type, traitId }.
  //
  // It used to be a [type, traitId] pair, and that is an array inside an
  // array (levelHistory → awardedTraits → pair), which Firestore refuses: the
  // whole save is rejected with "Nested arrays are not supported". Every
  // level gained wrote one, so from then on nothing reached the account —
  // including reminder times, which is how it was found: the scheduler's copy
  // simply had none. Pairs still on a device are read here and rewritten by
  // migrateAwardedTraits.
  function awardOf(award) {
    return Array.isArray(award) ? { type: award[0], traitId: award[1] } : (award || {});
  }
  // Rewrites any pair-shaped awards in a level history into objects, in
  // place. Idempotent; true when something changed, so the caller can save.
  function migrateAwardedTraits(levelHistory) {
    let changed = false;
    (Array.isArray(levelHistory) ? levelHistory : []).forEach((record) => {
      if (!record || !Array.isArray(record.awardedTraits)) return;
      if (!record.awardedTraits.some(Array.isArray)) return;
      record.awardedTraits = record.awardedTraits.map((a) => (Array.isArray(a) ? awardOf(a) : a));
      changed = true;
    });
    return changed;
  }
  SYS.migrateAwardedTraits = migrateAwardedTraits;

  // Whether two per-trait remainder maps hold the same numbers. A missing map
  // and an empty one are the same thing: neither carries any remainder.
  // Fractions are stored to six decimals, not to whatever a double happens to
  // carry. A remainder and an attribution are both fractions of one point;
  // a millionth of a point is far finer than anything that can be seen, and
  // the seventeen significant digits a double prints were most of the level
  // history's size \u2014 which matters because the whole state is one Firestore
  // document with a 1 MiB ceiling, past which no save lands at all.
  function q(n) {
    const v = Math.round(n * 1e6) / 1e6;
    return v === 0 ? 0 : v;
  }

  function sameRemainders(a, b) {
    const x = a || {}, y = b || {};
    const keys = Object.keys(x);
    return keys.length === Object.keys(y).length && keys.every((k) => Object.prototype.hasOwnProperty.call(y, k) && x[k] === y[k]);
  }

  Object.assign(E, { earnedCategories, scoreAssessment, applyAssessment, skipAssessment, recordScores, recentScores, categoryScore, placeWeakest, weakestCategory, weakestTraitIndex, matchTraitIndex, targetTraitIndex, consumeComposition, developmentalShare, allocatePoints, awardOf, migrateAwardedTraits, q, sameRemainders });
})(window.SYS = window.SYS || {});

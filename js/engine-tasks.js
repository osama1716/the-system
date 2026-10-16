// Game rules: adding, changing and removing tasks, settling a day, logging habits, small settings.
// One of the files engine.js was split into (2026-10-16); the names they share travel through
// SYS._engine, and each file takes what it needs from the files loaded before it.
(function (SYS) {
  "use strict";
  const E = SYS._engine || (SYS._engine = {});
  const { applyExpDelta, bumpDailyStat, dayNote, ensureGateSeen, habitAmountOn, habitDays, habitDoneOn, habitGoalBase, habitStreak, migrateHabitAmounts, migrateHabitDays, nowMinutes, payableQuestExp, periodProgress, pruneHabitDays, ptToExp, recordHabitTouch, recurring, reportProgress, sanitizeRemindNote, sanitizeReminders, sanitizeSchedule, todayKey, unrecordHabitTouch } = E;

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
    // Which library habit this was, if any. Only so the library can show it
    // as already added — nothing reads it to decide value or behaviour.
    if (typeof form.fromLibrary === "string" && form.fromLibrary) base.fromLibrary = form.fromLibrary;
    // Appearance is optional. Left unset, the card derives an emoji and a
    // colour from the title, so these are only written when someone actually
    // chose something — which also keeps them out of the synced document for
    // every task nobody has styled.
    const iconIn = SYS.clampIcon(form.icon);
    if (iconIn) base.icon = iconIn;
    if (form.recurring) {
      const quit = !!form.quit;
      state.tasks.push({
        ...base,
        recurring: true,
        taskType: "Recurring", mode: "recurring", completion: 0, expBaseline: 0,
        ...(quit ? { quit: true } : {}),
        ...(sanitizeReminders(form.reminders).length ? { reminders: sanitizeReminders(form.reminders) } : {}),
        ...(sanitizeRemindNote(form.remindNote) ? { remindNote: sanitizeRemindNote(form.remindNote) } : {}),
        schedule: quit ? { type: "daily" } : sanitizeSchedule(form.schedule),
        unit: quit ? "times" : ((form.unit || "reps").trim() || "reps"),
        targetAmount: quit ? 1 : (Number(form.targetAmount) || 1),
        days: {},
      });
    } else {
      const mode = form.taskType === "Long Term" ? form.mode : "simple";
      const quest = { ...base, recurring: false, taskType: form.taskType, mode, completion: 0, expBaseline: 0 };
      ensureGateSeen(quest);
      state.tasks.push(quest);
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
    // A re-priced task carries a new price record. The one it replaces is
    // named once, so the server can move what it already paid across and
    // retire it (see recordProgress); after that the task owns the new price
    // alone and `replaces` has nothing left to say.
    if (typeof form.priceId === "string" && form.priceId && form.priceId !== t.priceId) {
      if (typeof form.fromPriceId === "string" && form.fromPriceId) t.replaces = form.fromPriceId;
      t.priceId = form.priceId;
    }
    // Re-priced into a quest big enough to ask about: what it had already
    // earned stays earned, exactly as the server grandfathers the carried EXP.
    ensureGateSeen(t);
    // Deleted rather than set empty when cleared, so the task goes back to
    // deriving its look instead of being pinned to a blank one.
    const nextIcon = SYS.clampIcon(form.icon);
    if (nextIcon) t.icon = nextIcon;
    else delete t.icon;
    // A colour used to live here. Any left on a task from that version is
    // dropped on the next edit rather than lingering unread in the document.
    delete t.hue;

    const wasRecurring = !!t.recurring;
    t.recurring = !!form.recurring;

    if (t.recurring) {
      const quit = !!form.quit;
      t.taskType = "Recurring";
      t.mode = "recurring";
      if (quit) t.quit = true; else delete t.quit;
      const reminders = sanitizeReminders(form.reminders);
      if (reminders.length) t.reminders = reminders; else delete t.reminders;
      delete t.remindAt;
      const remindNote = sanitizeRemindNote(form.remindNote);
      if (remindNote) t.remindNote = remindNote; else delete t.remindNote;
      t.schedule = quit ? { type: "daily" } : sanitizeSchedule(form.schedule);
      delete t.repeatsPerWeek;
      t.unit = quit ? "times" : ((form.unit || "reps").trim() || "reps");
      t.targetAmount = quit ? 1 : (Number(form.targetAmount) || 1);
      if (!wasRecurring) { t.days = {}; t.completion = 0; t.expBaseline = 0; }
      return [];
    }

    if (wasRecurring) { t.completion = 0; t.expBaseline = 0; }
    const mode = form.taskType === "Long Term" ? form.mode : "simple";
    t.taskType = form.taskType;
    t.mode = mode;
    const newExpTotal = payableQuestExp(t, t.completion);
    const delta = newExpTotal - t.expBaseline;
    t.expBaseline = newExpTotal;
    if (delta !== 0) return applyExpDelta(state, delta, t.types, t.title + " (edited)", t.traitTargets,
      { priceId: t.priceId, progress: { kind: "quest", completion: t.completion, replaces: t.replaces || null } });
    // A re-priced task still has to tell the server about its new price, even
    // when the two happen to be worth the same at this completion — otherwise
    // the transfer never happens and the next repeat is paid from scratch.
    // (This used to go through applyExpDelta with a delta of 0, which never
    // reached the journal hook at all, so the report was never sent.)
    if (t.replaces) reportProgress(t, { kind: "quest", completion: t.completion, replaces: t.replaces });
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

    const newExpTotal = payableQuestExp(t, t.completion);
    const delta = newExpTotal - t.expBaseline;
    t.expBaseline = newExpTotal;
    if (delta !== 0) return applyExpDelta(state, delta, t.types, t.title + " (value corrected)", t.traitTargets,
      { priceId: t.priceId, progress: { kind: "quest", completion: t.completion } });
    return [{ kind: "info", text: `${t.title} is now worth ${pt} xp.` }];
  }
  SYS.repriceTask = repriceTask;

  function removeTask(state, taskId) {
    state.tasks = state.tasks.filter((t) => t.id !== taskId);
  }
  SYS.removeTask = removeTask;

  // A day is finished when what has been logged on it reaches the goal, and
  // the EXP for it is granted exactly once at the moment it crosses.
  //
  // Going past the goal is free and changes nothing: drinking three litres
  // against a two litre goal is not worth more than two, and the app should
  // not quietly turn a goal into a rate. Falling back under it — by undoing
  // or removing an amount — gives the EXP back, because a ledger that only
  // moves one way is not a ledger.
  function settleDay(state, t, key, before, notifications) {
    const goal = habitGoalBase(t);
    const now = habitAmountOn(t, key);
    const wasDone = before >= goal;
    const isDone = now >= goal;
    if (isDone === wasDone) return notifications;

    const days = { ...habitDays(t) };
    if (isDone) {
      days[key] = { ...days[key], n: (days[key] ? days[key].n : 0) + 1, amount: now };
      t.days = days;
      bumpDailyStat(state, "repeats", 1, key);
      recordHabitTouch(state, key, taskIdOf(t));
      notifications.push(...applyExpDelta(state, ptToExp(t.pt), t.types, t.title, t.traitTargets,
        { priceId: t.priceId, progress: { kind: "habit", day: key, done: true } }));
      const period = periodProgress(t, key);
      if (period.target > 0 && period.done === period.target) {
        const scope = period.scope === "month" ? "Monthly" : period.scope === "window" ? "Cycle" : "Weekly";
        notifications.push({ kind: "info", text: `${scope} goal reached — ${t.title}` });
      }
      const streak = habitStreak(t);
      if (streak.n >= 3) {
        const word = streak.scope === "day" ? "days" : streak.scope === "month" ? "months" : streak.scope === "week" ? "weeks" : "cycles";
        notifications.push({ kind: "info", text: `${streak.n} ${word} in a row — ${t.title}` });
      }
    } else {
      // Give back one grant. A day carried over from the old model can hold
      // several; each is returned by its own step down, never in a lump.
      const n = (days[key] ? days[key].n : 0) - 1;
      // A day with nothing logged on it still exists if it carries a note:
      // "skipped, was ill" is worth keeping, and it is the case a journal is
      // most useful for.
      const noteHere = dayNote(days[key]);
      const slipHere = !!(days[key] || {}).slip;
      if (n > 0) days[key] = { ...days[key], n, amount: now };
      else if (now > 0 || noteHere || slipHere) days[key] = { ...days[key], n: 0, amount: now };
      else delete days[key];
      t.days = days;
      bumpDailyStat(state, "repeats", -1, key);
      if (!habitDoneOn(t, key)) unrecordHabitTouch(state, key, taskIdOf(t));
      notifications.push(...applyExpDelta(state, -ptToExp(t.pt), t.types, t.title + " (undo)", t.traitTargets,
        { priceId: t.priceId, progress: { kind: "habit", day: key, done: false } }));
    }
    return notifications;
  }
  function taskIdOf(t) { return t.id; }

  // Add a measured amount toward a day, in any unit of the same family: a
  // goal in litres accepts millilitres, one in hours accepts minutes. A unit
  // from another family is refused rather than guessed at.
  function addHabitAmount(state, taskId, dayKey, value, unit) {
    const t = state.tasks.find((x) => x.id === taskId);
    if (!t || !t.recurring) return [];
    const key = dayKey || todayKey();
    if (key > todayKey()) return [{ kind: "info", text: "That day hasn't happened yet." }];
    migrateHabitDays(t); migrateHabitAmounts(t);

    const delta = SYS.toBase(value, unit || t.unit, t.unit);
    if (delta === null || !delta) return [];
    const before = habitAmountOn(t, key);
    const next = Math.max(0, before + delta);
    const days = { ...habitDays(t) };
    days[key] = { ...days[key], n: days[key] ? days[key].n : 0, amount: next, at: nowMinutes() };
    t.days = days;
    pruneHabitDays(t);
    return settleDay(state, t, key, before, []);
  }
  SYS.addHabitAmount = addHabitAmount;

  // The card's big control: finish the day outright, or clear it. Setting it
  // to the goal rather than adding one unit is what makes a single press
  // still mean "done" for a habit measured in litres.
  function logHabitDay(state, taskId, dayKey) {
    const t = state.tasks.find((x) => x.id === taskId);
    if (!t || !t.recurring) return [];
    const key = dayKey || todayKey();
    if (key > todayKey()) return [{ kind: "info", text: "That day hasn't happened yet." }];
    migrateHabitDays(t); migrateHabitAmounts(t);
    if (habitDoneOn(t, key)) return [{ kind: "info", text: t.title + " is already done for that day." }];

    const before = habitAmountOn(t, key);
    // One press means the whole goal. A measured amount — from the timer, or
    // from the keypad — goes through addHabitAmount instead, which adds
    // rather than completing.
    const next = Math.max(habitGoalBase(t), before);
    const days = { ...habitDays(t) };
    days[key] = { ...days[key], n: days[key] ? days[key].n : 0, amount: next, at: nowMinutes() };
    t.days = days;
    pruneHabitDays(t);
    return settleDay(state, t, key, before, []);
  }
  SYS.logHabitDay = logHabitDay;

  // Clearing a day drops what was logged on it and returns whatever it paid.
  function unlogHabitDay(state, taskId, dayKey) {
    const t = state.tasks.find((x) => x.id === taskId);
    if (!t || !t.recurring) return [];
    migrateHabitDays(t); migrateHabitAmounts(t);
    const key = dayKey || todayKey();
    const day = habitDays(t)[key];
    if (!day) return [];

    const before = habitAmountOn(t, key);
    const notifications = [];
    // A migrated day can hold several grants. Step down through them so the
    // EXP returned equals the EXP given, then remove the day.
    let guard = 0;
    while (habitDoneOn(t, key) && guard++ < 50) {
      const days = { ...habitDays(t) };
      days[key] = { ...days[key], n: days[key].n, amount: 0 };
      t.days = days;
      settleDay(state, t, key, before, notifications);
    }
    const days = { ...habitDays(t) };
    // Clearing a day clears what was logged, not what was written about it —
    // or the fact that it was a slip.
    const note = dayNote(days[key]);
    const slip = !!(days[key] || {}).slip;
    if (note || slip) {
      days[key] = { n: 0, amount: 0 };
      if (note) days[key].note = note;
      if (slip) days[key].slip = true;
    } else delete days[key];
    t.days = days;
    return notifications;
  }
  SYS.unlogHabitDay = unlogHabitDay;

  // SYS.spendBankedPoint used to live here. Placing points by hand was the last
  // thing a player decided for themselves, and it sat oddly beside a system
  // that sets every value, category and trait. Nothing banks any more, so
  // there is nothing left to place by hand.

  function removeTrait(state, typeKey, traitId) {
    const intel = state.intelligences[typeKey];
    if (intel.traits.length <= 1) return; // keep at least one trait per category
    intel.traits = intel.traits.filter((t) => t.id !== traitId);
  }
  SYS.removeTrait = removeTrait;

  function setName(state, name) {
    state.player.name = name || "Hunter";
  }
  SYS.setName = setName;

  // Whether an account may wear a theme: the free one always; the others
  // once bought. Signed out there is no wallet, and only the free one.
  function ownsTheme(wallet, themeName) {
    if (!SYS.THEMES[themeName]) return false;
    if (themeName === SYS.SHOP.freeTheme) return true;
    return !!(wallet && Array.isArray(wallet.themes) && wallet.themes.indexOf(themeName) >= 0);
  }
  SYS.ownsTheme = ownsTheme;

  function setTheme(state, themeName) {
    if (SYS.THEMES[themeName]) state.settings.theme = themeName;
  }
  SYS.setTheme = setTheme;


  function setRadarRecent(state, on) {
    state.settings.radarRecent = !!on;
  }
  SYS.setRadarRecent = setRadarRecent;

  function setLanguage(state, code) {
    if (SYS.LANGUAGES[code]) state.settings.language = code;
  }
  SYS.setLanguage = setLanguage;

  Object.assign(E, { addTask, updateTask, repriceTask, removeTask, settleDay, taskIdOf, addHabitAmount, logHabitDay, unlogHabitDay, removeTrait, setName, ownsTheme, setTheme, setRadarRecent, setLanguage });
})(window.SYS = window.SYS || {});

// Click handlers: habits, logging amounts, timers and stats.
// One of the files main.js was split into; the names they share travel through SYS._main.
(function (SYS) {
  "use strict";
  const M = SYS._main || (SYS._main = {});
  const { ACTIONS, flushTimer, logDay, openLogSheet, pressAmountKey, refuseLocked, refuseOldDay, saveTimer, startTimerTick, stepAmount, stopTimerTick, ui } = M;

  ACTIONS["log-filter"] = function ({ el }) {
    ui.logFilter = el.dataset.filter || "all";
    M.renderPageInto();
  };

  ACTIONS["open-amount"] = function ({ id }) {
    const task = M.state.tasks.find((x) => x.id === id);
    if (!task) return;
    // Only for today: an older day is judged on its own capacity by the
    // server, and the app has no figure for it.
    if (SYS.shownDay(ui) === SYS.todayKey() && refuseLocked(task)) return;
    // A day that has not happened cannot be logged. The button is
    // already disabled on those days; this is the same rule stated where
    // the write would happen, because a disabled button is a hint and
    // not a guarantee.
    const day = SYS.shownDay(ui);
    if (day > SYS.todayKey()) return;
    openLogSheet(task, day);
  };

  ACTIONS["quit-clean"] = function ({ id }) {
    if (refuseOldDay(logDay())) return;
    M.runGameAction((draft) => SYS.logHabitDay(draft, id, logDay()));
    M.renderModalInto();
  };

  ACTIONS["quit-slip"] = function ({ id }) {
    M.runGameAction((draft) => SYS.markSlip(draft, id, logDay()));
    M.renderModalInto();
  };

  ACTIONS["quit-reset"] = function ({ id }) {
    M.runGameAction((draft) => {
      const day = logDay();
      const notes = SYS.unlogHabitDay(draft, id, day);
      SYS.clearSlip(draft, id, day);
      return notes;
    });
    M.renderModalInto();
  };

  ACTIONS["amount-key"] = function ({ el }) {
    pressAmountKey(el.dataset.key);
  };

  ACTIONS["amount-step"] = function ({ el }) {
    stepAmount(Number(el.dataset.delta));
  };

  ACTIONS["amount-unit"] = function ({ el }) {
    ui.amountUnit = el.dataset.unit;
    M.renderModalInto();
  };

  ACTIONS["undo-day"] = function ({ id }) {
    M.runGameAction((draft) => SYS.unlogHabitDay(draft, id, logDay()));
    // Kept open on purpose: clearing a day is usually the first half of
    // correcting it, and closing the sheet would mean reopening it to
    // type the right number.
    M.renderModalInto();
  };

  ACTIONS["shift-week"] = function ({ el }) {
    const delta = Number(el.dataset.delta);
    if (!Number.isFinite(delta)) return;
    const next = (Number(ui.weekOffset) || 0) + delta;
    // Backwards is history and has no floor. Forwards is only for seeing
    // what is scheduled, and stops where the answer stops being useful —
    // the same limit the arrow is greyed out at.
    if (next > (SYS.MAX_WEEKS_AHEAD || 8)) return;
    ui.weekOffset = next;
    // The chosen day travels with the window to the same weekday, which
    // is what "previous week" means while a day is selected: the Thursday
    // before, not the strip sliding out from under the day.
    const moved = SYS.shiftDay(SYS.shownDay(ui), delta * 7);
    ui.habitDay = moved === SYS.todayKey() ? null : moved;
    M.renderAppInto();
  };

  ACTIONS["jump-today"] = function () {
    ui.weekOffset = 0;
    ui.habitDay = null;
    M.renderAppInto();
  };

  ACTIONS["timer-start"] = function () {
    if (!ui.timer) return;
    ui.timer.running = true;
    ui.timer.startedAt = Date.now();
    ui.timer.restored = false;
    ui.timer.capped = false;
    saveTimer();
    if (SYS.startFocusSound) {
      SYS.unlockSound();
      SYS.startFocusSound((M.state.settings || {}).focusSound || "silent");
    }
    M.renderModalInto();
    startTimerTick();
  };

  ACTIONS["timer-pause"] = function () {
    if (!ui.timer || !ui.timer.running) return;
    ui.timer.accumulatedMs += Date.now() - ui.timer.startedAt;
    ui.timer.running = false;
    ui.timer.startedAt = null;
    stopTimerTick();
    if (SYS.stopFocusSound) SYS.stopFocusSound();
    // Pausing is what stopping used to be: everything measured is on the
    // habit by the time the button finishes.
    flushTimer();
    saveTimer();
    M.renderModalInto();
  };

  ACTIONS["timer-discard"] = function () {
    if (!ui.timer) return;
    stopTimerTick();
    if (SYS.stopFocusSound) SYS.stopFocusSound();
    // Everything this session measured is already on the habit, so
    // undoing it means taking those seconds back — which returns the EXP
    // too if the day had crossed its goal on the way.
    const taskId = ui.timer.taskId;
    const seconds = Math.floor((Number(ui.timer.loggedMs) || 0) / 1000);
    ui.timer = null;
    saveTimer();
    ui.modal = null;
    ui.timerPanel = null;
    if (seconds > 0) M.runGameAction((draft) => SYS.addHabitAmount(draft, taskId, SYS.todayKey(), -seconds, "sec"));
    M.renderModalInto();
  };

  ACTIONS["timer-mode"] = function ({ el }) {
    if (!ui.timer) return;
    const mode = el.dataset.mode === "countdown" ? "countdown" : "stopwatch";
    if (mode === ui.timer.mode) return;
    // Write down what this session measured, then start a new one in the
    // new mode. A countdown that inherited a stopwatch's minutes would
    // have to decide whether they count against the length, and there is
    // no answer to that anyone would predict.
    flushTimer();
    ui.timer.mode = mode;
    ui.timer.accumulatedMs = 0;
    ui.timer.loggedMs = 0;
    if (ui.timer.running) ui.timer.startedAt = Date.now();
    saveTimer();
    // Remembered for next time: whichever way you like to work, you like
    // it for every habit.
    M.runGameAction((draft) => { draft.settings.timerMode = mode; return []; });
    M.renderModalInto();
  };

  ACTIONS["timer-style-panel"] = function () {
    ui.timerPanel = ui.timerPanel === "style" ? null : "style";
    M.renderModalInto();
  };

  ACTIONS["timer-sound-panel"] = function () {
    if (ui.timerPanel === "sound") {
    // An audition is for choosing; it has no business outliving the panel.
    // A running session's sound is left alone.
    if (!(ui.timer && ui.timer.running) && SYS.stopFocusSound) SYS.stopFocusSound();
    }
    ui.timerPanel = ui.timerPanel === "sound" ? null : "sound";
    M.renderModalInto();
  };

  ACTIONS["timer-sound-tab"] = function ({ el }) {
    ui.soundTab = el.dataset.tab === "end" ? "end" : "focus";
    M.renderModalInto();
  };

  ACTIONS["open-day"] = function ({ el }) {
    const day = el.dataset.day;
    if (!day || day > SYS.todayKey()) return;
    ui.dayKey = day;
    ui.modal = "day";
    M.renderModalInto();
  };

  ACTIONS["set-stats-scope"] = function ({ el }) {
    ui.statsScope = el.dataset.id || null;
    // A month you navigated to for one habit is rarely the month you want
    // for the next, and the year picker belongs to whatever is on screen.
    ui.statsMonthOffset = 0;
    ui.statsYear = null;
    M.renderPageInto();
  };

  ACTIONS["archive-habit"] = function ({ id }) {
    const task = M.state.tasks.find((x) => x.id === id);
    if (!task) return;
    // Archiving stops the future and leaves the past alone: from today
    // the habit is not asked for, and every day before today counts
    // exactly as it already did. Recorded as a day rather than a flag so
    // the history can say when it stopped being asked for.
    M.runGameAction((draft) => {
      const t = draft.tasks.find((x) => x.id === id);
      if (t) { t.archived = true; t.archivedAt = SYS.todayKey(); }
      return [{ kind: "info", text: SYS.t("stats.archivedToast", { title: task.title }) }];
    });
  };

  ACTIONS["unarchive-habit"] = function ({ id }) {
    M.runGameAction((draft) => {
      const t = draft.tasks.find((x) => x.id === id);
      if (t) { delete t.archived; delete t.archivedAt; }
      return [];
    });
  };

  ACTIONS["set-stats-month-offset"] = function ({ el }) {
    ui.statsMonthOffset = el.dataset.delta === "reset" ? 0 : ui.statsMonthOffset + Number(el.dataset.delta);
    M.renderPageInto();
  };


})(window.SYS = window.SYS || {});

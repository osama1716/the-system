(function (SYS) {
  "use strict";

  // The 8 built-in categories have no "edit color" UI, so any saved color on
  // one of these keys can only be a stale palette from a previous version of
  // the app — keep them synced to the current design tokens. Custom
  // user-added categories (picked via the color input) are left untouched.
  function syncDefaultIntTypeColors(intTypes) {
    const defaultColors = new Map(SYS.DEFAULT_INT_TYPES.map((t) => [t.key, t.color]));
    return intTypes.map((t) => defaultColors.has(t.key) ? { ...t, color: defaultColors.get(t.key) } : { ...t, color: SYS.sanitizeColor(t.color) });
  }

  // Brings any saved state up to the current shape: fills in fields added
  // after it was written, and re-syncs built-in category colours.
  //
  // Every copy of the state goes through this — the one loaded from disk AND
  // any copy pulled from the cloud — before they're compared or used. That
  // matters: without it, adding a new field makes an older cloud copy differ
  // from a freshly-migrated local one, and the "which copy do you want to
  // keep?" prompt fires on every single launch even though nothing really
  // diverged. Normalising both sides means new fields are invisible to that
  // comparison, permanently, rather than needing a fix per field added.
  // What one normalizeState call did, reported to that caller alone.
  //
  // This used to be a single module-level flag, and the notes used to be
  // written straight into out.log. Both were wrong for the same reason:
  // normalizeState runs on the local copy *and* on the pulled one, and the
  // result of the two is then compared. Anything it writes that depends on
  // whether *this particular copy* needed migrating makes the two differ —
  // so a copy that had already migrated and one that had not could never
  // compare equal, and the "which copy do you want to keep?" prompt came up
  // on every single launch. The conflict branch never pushes, so the stored
  // copy stayed behind and the question repeated for ever.
  //
  // Its output is now a pure function of its input. What changed is reported
  // out of band, to the caller that asked, and shown as a notification rather
  // than recorded in the activity log — the log is what the person did, not
  // the app's own bookkeeping.
  function migrationReport() { return { migrated: false, notes: [] }; }

  function normalizeState(s, report) {
    const rep = report || migrationReport();
    const note = (text) => { rep.migrated = true; rep.notes.push(text); };
    const out = s || SYS.defaultState();
    out.settings = { ...SYS.DEFAULT_SETTINGS, ...(out.settings || {}) };
    // These were once per-user settings. Saved copies still carry them, and
    // honouring a stale value would leave people on different rules — one
    // player earning three points a level next to another earning two, on the
    // same ranking. Dropped rather than migrated: there is nothing to keep.
    delete out.settings.expDivisor;
    delete out.settings.pointsPerLevel;
    out.player = { ...SYS.defaultState().player, ...(out.player || {}) };
    out.player.traitComposition = out.player.traitComposition && typeof out.player.traitComposition === "object" ? out.player.traitComposition : {};
    out.intTypes = syncDefaultIntTypeColors(
      Array.isArray(out.intTypes) && out.intTypes.length ? out.intTypes : SYS.DEFAULT_INT_TYPES.map((t) => ({ ...t }))
    );
    out.levelHistory = Array.isArray(out.levelHistory) ? out.levelHistory : [];
    out.log = Array.isArray(out.log) ? out.log : [];
    out.tasks = Array.isArray(out.tasks) ? out.tasks : [];
    out.dailyStats = out.dailyStats && typeof out.dailyStats === "object" ? out.dailyStats : {};
    // Anything the seed has gained since this account was made. Additive, so
    // it is safe to run every time rather than once behind a schema number —
    // which means the next addition to the index needs no migration of its own.
    // Habits moved from "N repeats a week" to one tick per day. Deterministic
    // and idempotent, which it has to be: this runs on the local copy and on
    // the pulled one before the two are compared, so anything non-repeatable
    // here would show up as a permanent conflict.
    (Array.isArray(out.tasks) ? out.tasks : []).forEach((task) => {
      if (SYS.migrateHabitDays(task)) rep.migrated = true;
      // Day amounts were written in the habit's own unit while they were only
      // descriptive. They decide completion now, so they move to the group's
      // smallest unit — once, keyed on a flag.
      if (SYS.migrateHabitAmounts(task)) rep.migrated = true;
      // "How many days a week" becomes a schedule. A habit that only ever
      // said "3" becomes three times a week — a quota, which is exactly what
      // it was behaving as; naming days it never named would be an invention.
      if (SYS.migrateSchedule(task)) rep.migrated = true;
      SYS.pruneHabitDays(task);
      // The long memory. Sealing writes down every past day's verdict once,
      // so a year grid can outlive the 120 days of detail behind it; pruning
      // drops years the picker no longer offers. Both are deterministic and
      // both stop at yesterday, which is what lets them run on every load —
      // including on the pulled copy, before the two are compared.
      // Marked as a migration when either wrote something, because that is
      // what gets the result saved. Without it the seal was recomputed on
      // every load and never persisted — which works, invisibly, right up
      // until a day falls out of the 120-day window with nothing written
      // down about it.
      if (SYS.sealMarks(task)) rep.migrated = true;
      if (SYS.pruneMarks(task)) rep.migrated = true;
      if (SYS.pruneVolByMonth(task)) rep.migrated = true;
    });

    const retargeted = SYS.syncSeedTaskTargets(out);
    if (retargeted.length) note(`Aimed at the right traits: ${retargeted.join("; ")}`);

    const addedTraits = SYS.syncIndexWithSeed(out);
    if (addedTraits.length) note(`Index updated: ${addedTraits.join(", ")}`);

    out.suggestions = out.suggestions && typeof out.suggestions === "object"
      ? { weekKey: out.suggestions.weekKey || null, handled: Array.isArray(out.suggestions.handled) ? out.suggestions.handled : [] }
      : { weekKey: null, handled: [] };

    // Ranks used to be a flat 100 levels of 100 EXP each. They are now a
    // curve, so a standing recorded under the old rule names a different place
    // on the new one. The EXP earned is not in question — only what it is
    // worth — so the total is recomputed under the old formula and read back
    // under the new. Nobody loses progress; most people arrive somewhere
    // higher, because the early ranks got considerably cheaper.
    //
    // Runs once, keyed on the schema version.
    if ((Number(out.schema) || 1) < 2) {
      const oldRankIdx = Math.max(0, SYS.RANKS.indexOf(out.player.rank));
      const oldTotal = (oldRankIdx * 100 + ((Number(out.player.level) || 1) - 1)) * 100 + (Number(out.player.exp) || 0);
      const standing = SYS.expToStanding(oldTotal);
      out.player.rank = standing.rank;
      out.player.level = standing.level;
      out.player.exp = standing.exp;
      // Each record names the rank and level to return to, measured on the old
      // ladder. Replaying one now would drop somebody from where they actually
      // are to a place that no longer corresponds to anything. Undo history for
      // levels earned under the old rule cannot survive the change; keeping it
      // would be worse than losing it.
      out.levelHistory = [];
      out.schema = 2;
      rep.migrated = true;
    }

    // Points set aside under the old rule, waiting to be placed by hand.
    // Nothing banks now and the button that spent them is gone, so leaving
    // them would strand a number nobody could ever use. They are placed the
    // way any unattributed point is placed — wherever the person is weakest,
    // one at a time, re-checking between each so they spread rather than pile
    // onto a single trait.
    if ((Number(out.schema) || 2) < 3) {
      const owed = Math.max(0, Math.round(Number(out.player.bankedPoints) || 0));
      if (owed > 0 && SYS.placeUnattributedPoints(out, owed)) {
        out.player.bankedPoints = 0;
        note(owed + " banked point(s) placed by the system");
      }
      out.schema = 3;
      rep.migrated = true;
    }
    return out;
  }

  // A migration that only ran in memory runs again on the next load, because
  // saving otherwise waits for the first change the person happens to make.
  // The banked-point one would have handed out the same points every reload;
  // and the index sync would re-announce itself on every single load. Either
  // way the loaded copy is no longer what is on disk, so it goes back straight
  // away.
  const bootMigration = migrationReport();
  let state = normalizeState(SYS.Storage.load(), bootMigration);
  SYS.pruneDailyStats(state);
  if (bootMigration.migrated) SYS.Storage.save(state);

  const ui = {
    page: "overview",
    questFilter: "all",
    // Which habit the Stats page is showing, and which year its grid is on.
    // Null for both means "all habits" and "this year": a stored year would
    // still say 2026 next January.
    statsScope: null,
    statsYear: null,
    // Which day the day sheet is showing, while it is open.
    dayKey: null,
    // The Comparison chart: which span it compares, and whether it is showing
    // the chart or the table that carries the same numbers.
    compareSpan: "week",
    compareTable: false,
    // Which day the habits page is showing, and which week the strip is on.
    // Null means today: a stored "2026-09-12" would still be on screen
    // tomorrow morning, claiming to be now.
    habitDay: null,
    weekOffset: 0,
    // The day the open log sheet writes to, fixed when it was opened. Taken
    // from the page's chosen day rather than read live, so nothing can move
    // the target between opening the sheet and pressing Add.
    amountDay: null,

    statsMonthOffset: 0,
    timer: null,
    expanded: {},
    addTraitOpen: null,
    addTraitDraft: null,
    taskForm: null,
    armed: null,
    nameEditing: false,
    __nameDraft: null,
    modal: null,
    settingsDraft: null,
    addCategoryDraft: null,
    addCategoryError: null,
    importError: null,
    rankupQueue: [],
    rankupShowing: null,
    toasts: [],
    cloudUser: null,
    accountForm: { mode: "signin", email: "", password: "", error: null, info: null, busy: false },
    syncStatus: null,
    pendingCloudState: null,
    // Kept so the sync prompt can say that saving is being refused — that is
    // the difference between "two devices disagree" and "nothing has been
    // saved for days", and they look identical from the outside.
    pushError: null,
    // Whether a test notification is in flight, and whether the last one was
    // accepted by the push service. Both live here rather than in the DOM so
    // a re-render of the section cannot lose the answer.
    pushTesting: false, pushTested: false,
    // Which habit's amount box is open, and what is in it. One at a time:
    // two open boxes would need two sets of state and there is no reason to
    // log to two habits at once.
    amountFor: null, amountValue: "", amountUnit: null,
    // Filled in when the sync prompt opens: the three server-side numbers that
    // decide what the standing should be. Without them a disagreement between
    // two copies says nothing about which one is right, or about what keeps
    // recreating it.
    syncDiag: null,
    lastVerifyResendAt: 0,
    isAdmin: false,
    adminSearchEmail: "",
    adminSearchError: null,
    adminBusy: false,
    adminResult: null, // { uid, email, state } for the last user looked up
    appealForm: null, // { taskId, taskTitle, reason, error, busy } when appealing a value
    myAppeals: [],
    adminAppealQueue: [],
    adminAppealBusy: false,
    adminAppealError: null,
    adminAppealPoints: {}, // { [appealId]: corrected value the admin typed }
    adminAppealUsers: {}, // { [uid]: { name, email } } resolved for the queue
    nameClaimed: true, // false once we know this account's name isn't reserved
    inbox: [],
    expMonths: null, // { "2026-08": 1240 } from the journal; null until fetched
    suggestions: null, // this week's proposed tasks, once fetched
    suggestionsBusy: false,
    suggestionsError: null,
    leaderboard: [],
    leaderboardMine: null, // own row, only when it falls outside the fetched page
    leaderboardMyPosition: null,
    leaderboardBusy: false,
    leaderboardError: null,
    adminMsgText: "",
    adminMsgAmount: "",
    adminMsgError: null,
    adminMsgBusy: false,
  };

  let toastSeq = 0;
  let armedTimer = null;
  let rankupTimer = null;
  const TIMER_KEY = "the-system:timer";
  // A session nobody stopped is not twelve hours of work, it is a session
  // somebody forgot. Restored paused at the cap so it can be seen and
  // decided on, rather than silently logged or silently thrown away.
  const TIMER_MAX_MS = 12 * 3600 * 1000;

  function saveTimer() {
    try {
      if (!ui.timer) window.localStorage.removeItem(TIMER_KEY);
      else window.localStorage.setItem(TIMER_KEY, JSON.stringify(ui.timer));
    } catch (e) { /* private mode, or storage full: the timer just won't survive a reload */ }
  }
  function restoreTimer() {
    let saved = null;
    try {
      const raw = window.localStorage.getItem(TIMER_KEY);
      saved = raw ? JSON.parse(raw) : null;
    } catch (e) { saved = null; }
    if (!saved || typeof saved.taskId !== "string") return;
    const task = state.tasks.find((x) => x.id === saved.taskId);
    if (!task || !task.recurring) { try { window.localStorage.removeItem(TIMER_KEY); } catch (e) {} return; }

    let accumulated = Number(saved.accumulatedMs) || 0;
    if (saved.running && Number(saved.startedAt)) accumulated += Date.now() - Number(saved.startedAt);
    if (!(accumulated > 0)) accumulated = 0;
    const overCap = accumulated > TIMER_MAX_MS;
    const mode = saved.mode === "countdown" ? "countdown" : "stopwatch";
    ui.timer = {
      taskId: saved.taskId,
      // Always paused on restore. Coming back to a stopwatch still counting
      // would mean the app decided to keep timing on your behalf.
      running: false,
      startedAt: null,
      accumulatedMs: Math.min(accumulated, TIMER_MAX_MS),
      loggedMs: Math.max(0, Number(saved.loggedMs) || 0),
      mode,
      restored: true,
      capped: overCap,
    };
    saveTimer();
    // A countdown that reached the goal while the app was closed is honoured,
    // not silently dropped — but the logging waits until the first render,
    // because it draws and toasts.
    if (mode === "countdown" && saved.running && countdownRemaining() <= 0) {
      pendingCountdownFinish = true;
    }
  }

  // How often the running clock writes what it has measured. Every second
  // would mean a save and a cloud push per second for nothing; every fifteen
  // means the most a crash can cost is fifteen seconds.
  const TIMER_FLUSH_MS = 15000;

  // Writes the part of the session that has not been written yet, in whole
  // seconds, and remembers how much that was. Pausing, hiding, closing and
  // the countdown ending all call it, so stopping is never the thing that
  // decides whether the time counted.
  function flushTimer() {
    if (!ui.timer) return 0;
    const elapsed = ui.timer.accumulatedMs + (ui.timer.running ? Date.now() - ui.timer.startedAt : 0);
    const unlogged = elapsed - (Number(ui.timer.loggedMs) || 0);
    const seconds = Math.floor(unlogged / 1000);
    if (seconds < 1) return 0;
    const taskId = ui.timer.taskId;
    ui.timer.loggedMs = (Number(ui.timer.loggedMs) || 0) + seconds * 1000;
    saveTimer();
    runGameAction((draft) => SYS.addHabitAmount(draft, taskId, SYS.todayKey(), seconds, "sec"));
    return seconds;
  }

  // A session worth protecting: anything under a second is a stray tap.
  function timerHasTime() {
    if (!ui.timer) return false;
    const ms = ui.timer.accumulatedMs + (ui.timer.running ? Date.now() - ui.timer.startedAt : 0);
    return ms >= 1000;
  }

  let timerTickInterval = null;
  let pendingCountdownFinish = false;
  function startTimerTick() {
    stopTimerTick();
    timerTickInterval = setInterval(() => {
      if (!ui.timer) { stopTimerTick(); return; }
      // The tick sound is played from here rather than from a clock of its
      // own, so it lands on the same beat the digits change.
      if (ui.timer.running && SYS.tickSound) SYS.tickSound();
      if (ui.timer.mode === "countdown" && ui.timer.running && countdownRemaining() <= 0
          && (ui.timer.accumulatedMs + (Date.now() - ui.timer.startedAt)) >= 1000) {
        finishCountdown();
        return;
      }
      // Written down as it goes, not at the end.
      if (ui.timer.running) {
        const elapsed = ui.timer.accumulatedMs + (Date.now() - ui.timer.startedAt);
        if (elapsed - (Number(ui.timer.loggedMs) || 0) >= TIMER_FLUSH_MS) flushTimer();
      }
      // Only the clock, not the panel. Rebuilding the whole thing every
      // second threw away the scroll position of the sound list underneath
      // it — the list jumped back to the top on every tick, which made it
      // impossible to reach the sounds at the bottom.
      if (ui.modal === "timer") updateTimerFace();
    }, 1000);
  }

  // Patches the numbers in place: the text, the ring, the flip cards. Nothing
  // else in the panel changes once a second, and everything that does change
  // — the buttons, the mode, the lists — is redrawn by the press that changed
  // it.
  function updateTimerFace() {
    if (!ui.timer) return;
    const elapsed = ui.timer.accumulatedMs + (ui.timer.running ? Date.now() - ui.timer.startedAt : 0);
    const countdown = ui.timer.mode === "countdown";
    const task = state.tasks.find((x) => x.id === ui.timer.taskId);
    const doneBase = task ? SYS.habitAmountOn(task, SYS.todayKey()) : 0;
    const goalMs = task ? SYS.habitGoalBase(task) * 1000 : 0;
    // The same sums the panel renders. Time left is rounded up so that
    // "done" and "left" add up to the goal rather than losing a second
    // between them.
    const unflushed = Math.max(0, elapsed - (Number(ui.timer.loggedMs) || 0));
    const todayMs = doneBase * 1000 + unflushed;
    const ceilSec = (ms) => Math.ceil(Math.max(0, ms) / 1000) * 1000;
    const shown = countdown ? ceilSec(goalMs - todayMs) : todayMs;

    const display = document.getElementById("timer-display");
    if (display) display.textContent = SYS.fmtElapsed(shown);

    // Only the stopwatch has one; the countdown's own number says it.
    const caption = document.getElementById("timer-caption");
    if (caption && task && !countdown) caption.textContent = SYS.timerCaption(task, todayMs);

    const arc = document.querySelector(".timer-ring .ring-done");
    if (arc && task) arc.setAttribute("stroke-dasharray", SYS.timerRingPct(task, todayMs) + " 100");

    const cards = document.querySelectorAll(".timer-flip .flip-card span");
    if (cards.length === 4) {
      const total = Math.floor(shown / 1000);
      const hours = Math.floor(total / 3600);
      const left = hours > 0 ? hours : Math.floor((total % 3600) / 60);
      const right = hours > 0 ? Math.floor((total % 3600) / 60) : total % 60;
      const digits = [Math.floor(left / 10) % 10, left % 10, Math.floor(right / 10) % 10, right % 10];
      digits.forEach((d, i) => {
        const el = cards[i];
        if (el.textContent === String(d)) return;
        el.textContent = String(d);
        // Restart the animation on the digit that actually changed. Without
        // the reflow the browser sees no change and skips it.
        el.style.animation = "none";
        void el.offsetWidth;
        el.style.animation = "";
      });
    }
  }

  function countdownRemaining() {
    if (!ui.timer) return 0;
    const task = state.tasks.find((x) => x.id === ui.timer.taskId);
    if (!task) return 0;
    const elapsed = ui.timer.accumulatedMs + (ui.timer.running ? Date.now() - ui.timer.startedAt : 0);
    const unflushed = Math.max(0, elapsed - (Number(ui.timer.loggedMs) || 0));
    const todayMs = SYS.habitAmountOn(task, SYS.todayKey()) * 1000 + unflushed;
    return SYS.habitGoalBase(task) * 1000 - todayMs;
  }

  // A countdown reaching zero logs itself. This is the one place in the app
  // that writes to the ledger without a press, which is what was asked for —
  // the trade is that a countdown left running credits the time whether or not
  // the work happened, so it says so out loud and the day can be cleared.
  function finishCountdown() {
    if (!ui.timer) return;
    const taskId = ui.timer.taskId;
    stopTimerTick();
    if (SYS.stopFocusSound) SYS.stopFocusSound();
    if (SYS.playEndSound) SYS.playEndSound((state.settings || {}).endSound || "default");
    // Writes the tail. Everything before it went in as the clock ran, so
    // after this the habit holds exactly the goal it was counting down to.
    flushTimer();
    const task = state.tasks.find((x) => x.id === taskId);
    const session = Math.floor((Number(ui.timer.loggedMs) || 0) / 1000);
    ui.timer = null;
    saveTimer();
    const wasOpen = ui.modal === "timer";
    if (wasOpen) { ui.modal = null; ui.timerPanel = null; }
    // The session is what gets announced — what this sitting was worth, not
    // the goal, which the card already shows as met.
    const underAMinute = session < 60;
    addToast({ kind: "info", text: SYS.t("timer.autoLogged", {
      amount: underAMinute ? Math.max(1, session) : Math.round(session / 60),
      unit: SYS.tUnit(underAMinute ? "sec" : "min"),
      title: (task && task.title) || "",
    }) });
    if (wasOpen) renderModalInto();
  }
  function stopTimerTick() {
    if (timerTickInterval) { clearInterval(timerTickInterval); timerTickInterval = null; }
  }

  // ---- the title sequence -------------------------------------------------
  //
  // When it plays is a product decision, so it is one rule in one place.
  // "launch" means every time the page loads. This is a single page, so a
  // load only happens when the app is actually opened or refreshed — a
  // re-render, a theme change or moving between pages does not reload
  // anything, and the boot block below runs exactly once per load.
  //
  // It was gated on a sessionStorage flag, which was both unnecessary and
  // wrong: unnecessary because nothing re-runs this within a load, and wrong
  // because sessionStorage survives a refresh — so it played on the first
  // open of a tab and never again, which reads as the animation being broken.
  const BRAND_PLAY = "launch"; // "launch" | "never"

  // The class drives the animation and must be taken off again, or a later
  // re-render of the sidebar would restart it mid-flight. animationend on the
  // longest of the three is the honest signal, with a timer behind it in case
  // the animation never runs at all (reduced motion, a hidden tab).
  // The class goes on the sidebar container, not on .brand.
  //
  // .brand is inside the sidebar's innerHTML, and renderSidebarInto replaces
  // that wholesale — which the sign-in path does within milliseconds of boot
  // (the admin check, the username check, the auth callback itself). The
  // element carrying the class was being thrown away almost immediately, so
  // the sequence played on click, where nothing re-renders, and appeared not
  // to work at all on load. The container survives, so the class does.
  //
  // A re-render still restarts the child animations from zero, so the elapsed
  // time is put back afterwards and the sequence carries on where it was
  // rather than stuttering back to the beginning.
  const BRAND_MS = 3000;
  let brandTimer = null;
  let brandStartedAt = 0;

  function brandAnimations() {
    const host = $sidebar.querySelector(".brand");
    if (!host || !host.getAnimations) return [];
    return [host, ...host.querySelectorAll("*")]
      .reduce((all, el) => all.concat(el.getAnimations ? el.getAnimations() : []), []);
  }

  function resumeBrandAfterRender() {
    if (!$sidebar.classList.contains("is-playing")) return;
    const elapsed = Date.now() - brandStartedAt;
    if (elapsed >= BRAND_MS) return;
    brandAnimations().forEach((a) => { try { a.currentTime = elapsed; } catch (e) {} });
  }

  function playBrand() {
    if ($sidebar.classList.contains("is-playing")) return;
    brandStartedAt = Date.now();
    $sidebar.classList.add("is-playing");
    const stop = () => {
      if (brandTimer) { clearTimeout(brandTimer); brandTimer = null; }
      $sidebar.classList.remove("is-playing");
    };
    // Bubbles from whichever of the three ends first; they share a duration.
    $sidebar.addEventListener("animationend", stop, { once: true });
    // Behind it, in case nothing animates at all — reduced motion, a hidden
    // tab — so the class cannot be left on for ever.
    brandTimer = setTimeout(stop, BRAND_MS + 400);
  }

  function maybePlayBrandOnLaunch() {
    if (BRAND_PLAY === "never") return;
    playBrand();
  }

  function applyThemeAttribute() {
    SYS.applyTheme(state);
  }

  // Language drives both the strings and the writing direction — Arabic
  // needs the whole layout mirrored, which CSS keys off <html dir>.
  function applyLanguage() {
    SYS.setLanguageCode(state.settings.language);
    document.documentElement.setAttribute("lang", SYS.currentLanguage());
    document.documentElement.setAttribute("dir", SYS.currentDir());
  }

  // A save that never lands is the worst kind of failure this app can have:
  // everything on screen keeps working, and the loss only shows up later as a
  // conflict prompt or as an evaluator reading a profile from days ago. Said
  // once per session, and kept on screen, because it needs acting on.
  let pushFailureReported = false;
  if (SYS.Cloud && SYS.Cloud.setPushErrorHandler) {
    SYS.Cloud.setPushErrorHandler((err) => {
      ui.pushError = (err && (err.code || err.message)) || "unknown";
      if (ui.modal === "syncChoice") renderModalInto();
      if (pushFailureReported) return;
      pushFailureReported = true;
      const code = err && err.code;
      const detail = ui.isAdmin && code === "permission-denied"
        ? " " + SYS.t("sync.pushDeniedAdmin")
        : "";
      addToast({ kind: "info", sticky: true, text: SYS.t("sync.pushFailed") + detail });
    });
  }

  // ---------------- EXP journal ----------------
  //
  // The public standing is computed from this record rather than from the EXP
  // number the client keeps, because that number lives in local storage and
  // anyone can edit it. Events append and never change, so a standing can be
  // audited after the fact instead of merely trusted.
  //
  // Queued on the device first, uploaded when there is somewhere to upload to.
  // That is what keeps the app usable offline: a week of work off the network
  // is a week of queued events, sent in one batch on reconnect, rather than a
  // week of lost progress or a week of being unable to complete anything.
  let expQueue = SYS.Storage.loadExpQueue();
  let expFlushTimer = null;
  let expFlushing = false;

  SYS.onExpDelta = function (delta, source, meta) {
    if (!delta) return;
    const entry = { delta, source: String(source || "").slice(0, 80) };
    if (meta && typeof meta.priceId === "string" && meta.priceId) entry.priceId = meta.priceId;
    expQueue.push(entry);
    SYS.Storage.saveExpQueue(expQueue);
    scheduleExpFlush();
  };

  // Debounced for the same reason the state push is: dragging a completion
  // slider produces a burst of deltas, and they may as well travel together.
  function scheduleExpFlush() {
    if (expFlushTimer) clearTimeout(expFlushTimer);
    expFlushTimer = setTimeout(flushExpQueue, 1200);
  }

  function flushExpQueue() {
    if (expFlushing || !expQueue.length) return;
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.cloudUser) return;
    // Snapshot what is being sent, so events raised while the upload is in
    // flight are kept rather than cleared along with it.
    const sending = expQueue.slice();
    expFlushing = true;
    SYS.Cloud.appendExpEvents(sending)
      .then(() => {
        expQueue = expQueue.slice(sending.length);
        SYS.Storage.saveExpQueue(expQueue);
        // The trigger needs a moment to fold these into the running total;
        // reading it immediately would compare against a figure that is about
        // to change and "correct" a discrepancy that isn't one.
        setTimeout(reconcileExpWithServer, 4000);
      })
      .catch((err) => {
        // "Permission denied" here means one specific thing: the rules that
        // allow this collection are not deployed, so the journal is not live
        // yet — which is the window between this front end auto-deploying and
        // the backend being pushed by hand.
        //
        // In that window the old behaviour is still in force: the leaderboard
        // is being written from the client's own EXP figure, so everything
        // these events describe is *already counted* in it. Keeping them would
        // mean adding them again on top of a total that includes them the
        // moment the rules land — handing out free EXP proportional to however
        // long the two deploys were apart. Dropping them is the conservative
        // direction: the worst case is a standing that is right, arrived at
        // without their help.
        if (err && err.code === "permission-denied") {
          console.warn("[TheSystem] exp journal not deployed yet — discarding " + sending.length +
                       " event(s) already accounted for by the previous behaviour");
          expQueue = expQueue.slice(sending.length);
          SYS.Storage.saveExpQueue(expQueue);
          return;
        }
        // Anything else is a transient failure. Left in the queue on purpose:
        // a dropped connection must not silently cost someone their standing,
        // and a retry is free at the next opportunity.
        console.warn("[TheSystem] exp journal upload failed, will retry", err);
      })
      .then(() => { expFlushing = false; });
  }

  // Puts the account's own EXP back to what the journal says it is.
  //
  // Without this the app holds two contradictory truths: a public number the
  // server vouches for, and a private one anybody can retype in local storage.
  // Protecting only the first says the honesty of the whole thing matters
  // solely where other people can see it, which is the opposite of what a
  // self-measurement tool is for. So the journal decides both, and an edited
  // number simply doesn't survive contact with the server.
  //
  // SYS.reconcileExpTo does the work, so the awkward part — a hand-edited
  // state cannot be rewound through the undo history that never recorded it —
  // is decided in the engine next to the ledger it concerns, and is tested
  // there rather than here.
  // A disagreement is only a question when nothing can settle it.
  //
  // The journal is the one figure the server vouches for, and it is already
  // trusted enough elsewhere to overwrite the local standing outright
  // (reconcileExpWithServer). So when this device matches it and the stored
  // copy does not, the stored copy is demonstrably behind — that is staleness,
  // not a conflict, and the answer is to write rather than to ask.
  //
  // It has to be settled here or not at all. Nothing else was ever going to
  // write it: the conflict branch deliberately does not push, and once the
  // device agrees with the journal reconcileExpWithServer finds no difference
  // and returns without saving. An account whose stored copy fell behind was
  // therefore stuck for good — asked the same question on every launch, with
  // no path that could ever answer it. This one had not been written for two
  // and a half weeks.
  //
  // Only EXP is decided this way, because only EXP has a record to check
  // against. If the journal cannot vouch for either copy, or vouches for the
  // stored one, the question stands.
  function resolveOrAsk(cloudState) {
    const ask = () => {
      ui.pendingCloudState = cloudState;
      ui.modal = "syncChoice";
      renderModalInto();
      collectSyncDiagnosis();
    };
    if (!SYS.Cloud.fetchExpSummary) return ask();
    SYS.Cloud.fetchExpSummary().then((summary) => {
      const journal = summary ? summary.total : null;
      if (journal == null) return ask();
      const localMatches = SYS.totalExp(state.player) === journal;
      const cloudMatches = SYS.totalExp(cloudState.player) === journal;
      if (!localMatches || cloudMatches) return ask();
      // Done quietly. The first version announced it, on the reasoning that
      // replacing the stored copy is what the prompt had been asking
      // permission for. In use that was wrong twice over: the person is told
      // about bookkeeping they did not ask for and cannot act on, and because
      // the notice is raised before the write is known to have landed, a write
      // that does not land turns it into a message on every single launch —
      // which is how it was reported.
      //
      // Silence here is not silence about failure. A write that is actually
      // refused still raises the sticky "your progress isn't reaching your
      // account" notice through setPushErrorHandler, which is the one worth
      // interrupting someone for.
      SYS.Cloud.push(state);
    }).catch(() => ask());
  }

  // Read-only. A conflict between two copies is only half the picture: the
  // journal is what the standing is actually supposed to be, unapplied grants
  // are EXP about to be added again, and a non-empty outgoing queue means this
  // device is legitimately ahead. Any of the three can recreate a conflict on
  // every launch, and they are indistinguishable from the two copies alone.
  function collectSyncDiagnosis() {
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.cloudUser) return;
    Promise.all([
      SYS.Cloud.fetchExpSummary().catch(() => null),
      SYS.Cloud.fetchPendingGrants().catch(() => null),
    ]).then(([summary, grants]) => {
      const cloudPlayer = ui.pendingCloudState && ui.pendingCloudState.player;
      ui.syncDiag = {
        journalTotal: summary ? summary.total : null,
        grants: grants ? grants.length : null,
        queued: expQueue.length,
        localTotal: SYS.totalExp(state.player),
        cloudTotal: cloudPlayer ? SYS.totalExp(cloudPlayer) : null,
        push: SYS.Cloud.pushStats ? SYS.Cloud.pushStats() : null,
        storedAt: SYS.Cloud.storedUpdatedAt ? SYS.Cloud.storedUpdatedAt() : null,
      };
      if (ui.modal === "syncChoice") renderModalInto();
    }).catch(() => {});
  }

  function reconcileExpWithServer() {
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.cloudUser) return;
    // Anything of ours still unsent means the server is legitimately behind,
    // not that we are ahead dishonestly. Correcting now would delete real
    // work done offline — the one mistake this must never make.
    if (expQueue.length || expFlushing) return;

    SYS.Cloud.fetchExpSummary().then((summary) => {
      if (!summary) return;
      ui.expMonths = summary.months;
      if (ui.page === "stats") renderPageInto();
      const serverTotal = summary.total;
      if (serverTotal == null) return;
      if (expQueue.length || expFlushing) return; // something arrived mid-flight
      const diff = serverTotal - SYS.totalExp(state.player);
      if (!diff) return;
      console.warn("[TheSystem] correcting local EXP by " + diff + " to match the journal");
      runGameAction((draft) => SYS.reconcileExpTo(draft, serverTotal, SYS.t("sync.corrected")));
    }).catch(() => {});
  }

  // Single choke point for "this state needs to be saved" — local storage
  // always, plus a debounced cloud push whenever signed in. Every mutation
  // path in this file should call this instead of SYS.Storage.save directly.
  // A failed local save used to be a console warning and nothing else: the
  // app kept working, showed the progress on screen, and lost all of it on
  // the next reload — which is the worst possible way to find out.
  //
  // The likely cause is not a full quota (the state is kilobytes, against a
  // multi-megabyte allowance) but a browser that refuses site data at all —
  // a private window, or storage blocked for this app — so the message names
  // that rather than blaming size. Said once, and taken back if a later save
  // succeeds: repeating it on every keystroke would make it furniture.
  let localSaveBroken = false;
  function persist(s) {
    const saved = SYS.Storage.save(s);
    if (!saved && !localSaveBroken) {
      localSaveBroken = true;
      addToast({ kind: "info", sticky: true, text: SYS.t("sync.localSaveFailed") });
    }
    if (saved) localSaveBroken = false;
    if (SYS.Cloud && SYS.Cloud.available()) SYS.Cloud.push(s);
  }

  const $sidebar = document.getElementById("sidebar");
  const $statusbar = document.getElementById("statusbar");
  const $page = document.getElementById("page");
  const $notif = document.getElementById("notif-stack");
  const $rankup = document.getElementById("rankup-layer");
  const $modal = document.getElementById("modal-layer");
  const $importInput = document.getElementById("import-file-input");

  function renderSidebarInto() {
    $sidebar.innerHTML = SYS.renderSidebar(ui);
    resumeBrandAfterRender();
  }
  function renderStatusbarInto() {
    $statusbar.innerHTML = SYS.renderStatusbar(state, ui);
    if (ui.nameEditing) {
      const el = document.getElementById("name-input");
      if (el) { el.focus(); el.select(); }
    }
  }
  function renderPageInto() { $page.innerHTML = SYS.renderPage(state, ui); }
  function renderAppInto() { renderSidebarInto(); renderStatusbarInto(); renderPageInto(); }
  function renderModalInto() { $modal.innerHTML = SYS.renderModalLayer(state, ui); }

  // Reminders are only as useful as the times on the habits, so the section
  // can say when there are none — permission granted and nothing set is a
  // silent dead end otherwise.
  function refreshRemindCount() {
    ui.remindCount = state.tasks.filter((t) => t.recurring && t.remindAt).length;
  }
  function refreshPushState() {
    if (!SYS.pushStatus) return;
    // A confirmation from the last visit is not news. Cleared here rather
    // than on close, because this runs whenever the section is about to be
    // shown — including the first time, before anything has been pressed.
    ui.pushTesting = false;
    ui.pushTested = false;
    refreshRemindCount();
    SYS.pushStatus().then((status) => {
      ui.pushState = status.state === "granted" ? "off" : status.state;
      renderModalInto();
    });
  }
  function renderNotifInto() { $notif.innerHTML = SYS.renderNotifStack(ui); }
  function renderRankupInto() { $rankup.innerHTML = SYS.renderRankupLayer(ui); }

  function setPath(obj, path, value) {
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
    cur[parts[parts.length - 1]] = value;
  }

  // How long a notification stays up.
  //
  // This used to be a flat 4.2 seconds, which had to serve both "+20 xp" and a
  // full sentence explaining why a task was valued at 500. It was tuned for the
  // first, so the second went past unread — the one notification in the app
  // that actually says something went by fastest relative to its length.
  //
  // Scaled by how much there is to read, with a floor so nothing flashes past
  // and a ceiling so nothing camps on the screen. Roughly fifteen characters a
  // second, unhurried, plus a moment to notice it is there at all.
  const TOAST_NOTICE_MS = 2600;
  const TOAST_PER_CHAR_MS = 65;
  function toastDuration(text) {
    return Math.max(4500, Math.min(14000, TOAST_NOTICE_MS + String(text || "").length * TOAST_PER_CHAR_MS));
  }

  function dismissToast(id) {
    ui.toasts = ui.toasts.filter((x) => x.id !== id);
    renderNotifInto();
  }

  function addToast(n) {
    const id = ++toastSeq;
    ui.toasts.push({ ...n, id });
    renderNotifInto();
    // A sticky notification waits to be dealt with instead of timing out.
    // Used for the new-version prompt: an announcement that disappears after
    // four seconds is one most people will never happen to be looking at.
    if (!n.sticky) setTimeout(() => dismissToast(id), toastDuration(n.text));
  }

  function maybeShowNextRankup() {
    if (ui.rankupShowing || !ui.rankupQueue.length) return;
    ui.rankupShowing = ui.rankupQueue.shift();
    renderRankupInto();
    rankupTimer = setTimeout(dismissRankup, 3800);
  }
  function dismissRankup() {
    if (rankupTimer) { clearTimeout(rankupTimer); rankupTimer = null; }
    if (!ui.rankupShowing) return;
    ui.rankupShowing = null;
    renderRankupInto();
    setTimeout(maybeShowNextRankup, 300);
  }

  function processNotifications(list) {
    (list || []).forEach((n) => {
      if (n.kind === "rankup") { ui.rankupQueue.push(n); return; }
      addToast(n);
    });
    maybeShowNextRankup();
  }

  // ---------------- schedules ----------------

  function blankSchedule() {
    return { type: "daily", days: [], n: 3, every: 3, start: SYS.todayKey() };
  }
  function scheduleFromWeeklyCount(n) {
    const count = Math.max(1, Math.min(7, Math.round(Number(n) || 1)));
    return count >= 7 ? { type: "daily" } : { type: "perWeek", n: count };
  }
  function toggleIn(list, value) {
    const out = Array.isArray(list) ? list.slice() : [];
    const at = out.indexOf(value);
    if (at >= 0) out.splice(at, 1); else out.push(value);
    return out.sort((a, b) => a - b);
  }

  // ---------------- the habit log sheet ----------------

  // Opens empty, and empties again after each add. It used to open holding
  // the whole remaining goal so that one press of Add finished the day —
  // which is what "Mark done" is for, deliberately, while the prefill did it
  // by accident: open the sheet, press the button you always press, and the
  // day counts as complete whether or not it was. EXP is real here, so the
  // amount you actually did has to be the easy thing to enter, not the thing
  // you have to delete a number to get to.
  //
  // amountFresh still marks the zero as untouched, so the first digit
  // pressed replaces it instead of landing beside it.
  function resetAmount() {
    ui.amountValue = "";
    ui.amountFresh = true;
  }
  function openLogSheet(task, day) {
    ui.amountFor = task.id;
    ui.amountDay = day || SYS.todayKey();
    ui.noteOpen = false;
    ui.amountUnit = task.unit;
    resetAmount();
    ui.modal = "logAmount";
    renderModalInto();
  }
  function closeLogSheet() {
    ui.amountFor = null; ui.amountValue = ""; ui.amountUnit = null; ui.amountFresh = false;
    ui.amountDay = null;
    ui.noteOpen = false;
    ui.modal = null;
    renderModalInto();
  }
  // The day the sheet is writing to. Falls back to today, so a stray call
  // with no sheet open cannot land a write on some arbitrary date.
  function logDay() { return ui.amountDay || SYS.todayKey(); }
  function pressAmountKey(k) {
    if (ui.modal !== "logAmount") return;
    let v = ui.amountValue == null ? "" : String(ui.amountValue);
    if (k === "clear") v = "";
    else if (k === "back") v = ui.amountFresh ? "" : v.slice(0, -1);
    else if (k === ".") v = (ui.amountFresh || v === "") ? "0." : (v.includes(".") ? v : v + ".");
    else if (/^[0-9]$/.test(k)) {
      if (ui.amountFresh || v === "0") v = k;
      // Capped, because this is a game input and not a calculator: nine
      // digits is already past anything a habit gets measured in, and
      // without a cap the number simply runs out of the dial.
      else if (v.replace(/[^0-9]/g, "").length < 9) v = v + k;
    } else return;
    ui.amountValue = v;
    ui.amountFresh = false;
    renderModalInto();
  }
  function stepAmount(delta) {
    if (!Number.isFinite(delta)) return;
    const cur = Number(ui.amountValue);
    const next = Math.max(0, (Number.isFinite(cur) ? cur : 0) + delta);
    // Rounded, because stepping a typed 0.1 up and down is the float trap
    // again — this time in front of the user rather than in the ledger.
    ui.amountValue = String(Math.round(next * 1000) / 1000);
    ui.amountFresh = false;
    renderModalInto();
  }

  function runGameAction(mutator) {
    const draft = SYS.clone(state);
    const notifications = mutator(draft) || [];
    state = draft;
    persist(state);
    renderAppInto();
    processNotifications(notifications);
  }

  function arm(kind, id) {
    if (armedTimer) clearTimeout(armedTimer);
    ui.armed = { kind, id };
    armedTimer = setTimeout(() => { ui.armed = null; renderAppInto(); renderModalInto(); }, 3000);
  }
  function disarm() {
    if (armedTimer) { clearTimeout(armedTimer); armedTimer = null; }
    ui.armed = null;
  }
  function isArmed(kind, id) { return !!ui.armed && ui.armed.kind === kind && ui.armed.id === id; }

  // Categories and traits are the shared vocabulary, not a personal list.
  const INDEX_EDITS = new Set([
    "open-add-trait", "submit-add-trait", "cancel-add-trait", "remove-trait",
    "open-add-category", "submit-add-category",
  ]);

  const ARMABLE = new Set(["delete-task", "remove-trait", "delete-task-from-form", "reset-data", "admin-grant-admin", "admin-revoke-admin"]);

  function normalizeImportedState(parsed) {
    const base = SYS.defaultState();
    return {
      schema: 1,
      settings: { ...base.settings, ...(parsed.settings || {}) },
      player: { ...base.player, ...(parsed.player || {}) },
      intTypes: syncDefaultIntTypeColors(Array.isArray(parsed.intTypes) && parsed.intTypes.length ? parsed.intTypes : base.intTypes),
      intelligences: parsed.intelligences && typeof parsed.intelligences === "object" ? parsed.intelligences : base.intelligences,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      log: Array.isArray(parsed.log) ? parsed.log : [],
      levelHistory: Array.isArray(parsed.levelHistory) ? parsed.levelHistory : [],
      dailyStats: parsed.dailyStats && typeof parsed.dailyStats === "object" ? parsed.dailyStats : {},
    };
  }

  function commitName() {
    if (!ui.nameEditing) return;
    const val = (ui.__nameDraft || "").trim() || "Hunter";
    const previous = state.player.name;
    ui.nameEditing = false;
    ui.__nameDraft = null;
    runGameAction((draft) => { SYS.setName(draft, val); return []; });

    // Signed out the name is private and local, so nothing to reserve. Signed
    // in it has to be unique — the server decides, and the local value is
    // rolled back if the claim is refused so the two never disagree.
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.cloudUser || val === previous) return;
    SYS.Cloud.callClaimUsername(val).then((res) => {
      // The server trims and collapses spacing; adopt exactly what it stored.
      ui.nameClaimed = true;
      if (res.name !== val) runGameAction((draft) => { SYS.setName(draft, res.name); return []; });
      if (ui.modal === "settings") renderModalInto();
    }).catch((err) => {
      runGameAction((draft) => { SYS.setName(draft, previous); return []; });
      // The function's own message is English; a cooldown rejection carries a
      // machine-readable reason precisely so this side can say it in the
      // reader's language, with the wait spelled out rather than implied.
      const details = err && err.details;
      addToast({
        kind: "info",
        text: details && details.reason === "cooldown"
          ? SYS.t("name.cooldown", { days: details.availableInDays })
          : (err.message || SYS.t("name.taken")),
      });
    });
  }

  // Replaces the whole app state with one pulled from the cloud (initial
  // sign-in reconciliation, or a newer copy found on focus-regain). Saves it
  // locally too but deliberately does NOT push back to the cloud — that
  // would just be echoing back what we were given.
  function applyRemoteState(newState) {
    state = normalizeState(newState, migrationReport());
    SYS.Storage.save(state);
    applyThemeAttribute();
    renderAppInto();
  }

  // Applies any admin-authorized EXP grants (appeal corrections, bonuses/
  // penalties — see functions/index.js) waiting in this user's own
  // pendingGrants subcollection. Each one is run through the real,
  // unmodified SYS.applyExpDelta exactly as if it were a normal quest, so
  // level-ups/skill points/undo history all come out correct for free —
  // see the plan doc "Why pendingGrants" for why this doesn't just write
  // the resulting numbers directly.
  function applyPendingGrants() {
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.cloudUser) return;
    SYS.Cloud.fetchPendingGrants().then((grants) => {
      if (!grants.length) return;
      grants.forEach((g) => {
        // Two kinds of grant: a flat EXP amount (bonus/penalty), or a task
        // repricing from a resolved appeal, which recomputes its own delta.
        if (g.repriceTask && g.repriceTask.taskId) {
          runGameAction((draft) => SYS.repriceTask(draft, g.repriceTask.taskId, g.repriceTask.newPt));
        } else {
          runGameAction((draft) => SYS.applyExpDelta(draft, g.amount, [], g.reason || "The System"));
        }
        SYS.Cloud.consumeGrant(g.id);
      });
      refreshMyAppeals(); // a resolved/rejected appeal's status may have just changed
      refreshInbox(); // an adjustment writes an inbox message alongside its grant
    }).catch(() => {});
  }

  // Refreshes the signed-in user's own inbox (admin messages/adjustments) —
  // same no-live-listener approach as everything else here: checked on
  // sign-in and focus-regain, not streamed.
  function refreshInbox() {
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.cloudUser) return;
    SYS.Cloud.fetchInbox().then((list) => {
      ui.inbox = list;
      renderSidebarInto();
      if (ui.page === "log") renderPageInto();
    }).catch(() => {});
  }

  // Refreshes the signed-in user's own appeals list (status may
  // have changed since an admin reviewed one) — called alongside
  // applyPendingGrants at the same points, same reasoning: no live listener,
  // just checked on sign-in and focus-regain.
  function refreshMyAppeals() {
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.cloudUser) return;
    SYS.Cloud.fetchMyAppeals().then((list) => {
      ui.myAppeals = list;
      if (ui.page === "quests") renderPageInto();
    }).catch(() => {});
  }

  // Loads the ranking. Fetched on demand — opening the page, or Refresh —
  // rather than streamed. A leaderboard changes when *other* people do
  // things, so a live listener would bill a read every time anyone anywhere
  // completed a quest, in every open tab, whether or not its owner was even
  // looking at this page.
  // This week's directives. Fetched when the Quests page is opened; the server
  // holds one set per week, so this is a document read almost every time and an
  // evaluation only on the first visit of a new week.
  function refreshSuggestions() {
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.cloudUser) return;
    if (ui.suggestionsBusy) return;
    ui.suggestionsBusy = true;
    ui.suggestionsError = null;
    if (ui.page === "quests") renderPageInto();

    SYS.Cloud.callSuggestQuests().then((res) => {
      ui.suggestions = res;
      // A new week wipes the record of what was answered — those ids belong to
      // last week's set and will never be seen again.
      if (state.suggestions.weekKey !== res.weekKey) {
        runGameAction((draft) => { draft.suggestions = { weekKey: res.weekKey, handled: [] }; return []; });
      }
    }).catch((err) => {
      console.warn("[TheSystem] couldn't load this week's directives", err);
      // The function only attaches a cause for admins, and only they are shown
      // it. Upstream errors are operational detail — the person using the app
      // can do nothing with them, and they can carry things nobody outside the
      // project should read.
      const reason = ui.isAdmin && err && err.details && err.details.reason;
      ui.suggestionsError = SYS.t("suggest.failed") + (reason ? " (" + reason + ")" : "");
    }).then(() => {
      ui.suggestionsBusy = false;
      if (ui.page === "quests") renderPageInto();
    });
  }

  function markSuggestionHandled(id) {
    runGameAction((draft) => {
      const week = (ui.suggestions && ui.suggestions.weekKey) || draft.suggestions.weekKey;
      const handled = draft.suggestions.weekKey === week ? draft.suggestions.handled.slice() : [];
      if (!handled.includes(id)) handled.push(id);
      draft.suggestions = { weekKey: week, handled };
      return [];
    });
  }

  function refreshLeaderboard() {
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.cloudUser) return;
    ui.leaderboardBusy = true;
    ui.leaderboardError = null;
    if (ui.page === "leaderboard") renderPageInto();

    SYS.Cloud.fetchLeaderboard().then((rows) => {
      ui.leaderboard = rows;
      // Two extra round-trips are only worth it for someone who isn't in the
      // page we already have.
      if (rows.some((r) => r.uid === ui.cloudUser.uid)) {
        ui.leaderboardMine = null;
        ui.leaderboardMyPosition = null;
        return null;
      }
      return SYS.Cloud.fetchMyLeaderboardEntry()
        .then((mine) => {
          ui.leaderboardMine = mine;
          return mine ? SYS.Cloud.fetchMyRank(mine.totalExp) : null;
        })
        .then((position) => { ui.leaderboardMyPosition = position; });
    }).then(() => {
      ui.leaderboardBusy = false;
      if (ui.page === "leaderboard") renderPageInto();
    }).catch((err) => {
      // The real error is a Firestore code in English; the page shows the
      // translated line and the detail goes to the console.
      console.warn("[TheSystem] leaderboard fetch failed", err);
      ui.leaderboardBusy = false;
      ui.leaderboardError = SYS.t("lb.error");
      if (ui.page === "leaderboard") renderPageInto();
    });
  }

  function refreshAdminAppealQueue() {
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.isAdmin) return;
    ui.adminAppealBusy = true;
    renderPageInto();
    SYS.Cloud.fetchPendingAppeals().then((list) => {
      ui.adminAppealQueue = list;
      // A raw uid tells the reviewer nothing about who filed it. Names and
      // emails are looked up server-side rather than read off the appeal, so
      // they can't be forged by the filer and stay right after a rename.
      return SYS.Cloud.callResolveUsers(list.map((a) => a.userId))
        .then((res) => { ui.adminAppealUsers = res.users || {}; })
        .catch(() => { ui.adminAppealUsers = {}; });
    }).then(() => {
      ui.adminAppealBusy = false;
      renderPageInto();
    }).catch((err) => {
      ui.adminAppealBusy = false;
      ui.adminAppealError = err.message || "Couldn't load the queue.";
      renderPageInto();
    });
  }

  if (SYS.Cloud) {
    SYS.Cloud.init();
    SYS.Cloud.checkRedirectResult().catch((err) => {
      addToast({ kind: "info", text: (err && err.message) || "Google sign-in didn't complete." });
    });
    SYS.Cloud.onAuthChange((user) => {
      ui.cloudUser = user ? { email: user.email, uid: user.uid, emailVerified: user.emailVerified } : null;
      ui.isAdmin = false;
      if (ui.modal === "settings") renderModalInto();
      if (!user) { renderSidebarInto(); return; }
      SYS.Cloud.checkIsAdmin().then((isAdmin) => { ui.isAdmin = isAdmin; renderSidebarInto(); }).catch(() => {});
      SYS.Cloud.isMyNameClaimed(state.player.name).then((held) => {
        ui.nameClaimed = held;
        if (ui.modal === "settings") renderModalInto();
      }).catch(() => {});
      applyPendingGrants();
      refreshMyAppeals();
      refreshInbox();
      flushExpQueue(); // anything queued while signed out or offline
      setTimeout(reconcileExpWithServer, 4000);
      SYS.Cloud.pull().then((raw) => {
        // Normalise the cloud copy the same way the local one was, so a field
        // added since it was written is not mistaken for a real divergence.
        // Its report is kept apart from the boot one: a migration applied to
        // the *stored* copy says that copy is behind, which is a reason to
        // push, not a reason to ask.
        const cloudReport = migrationReport();
        const cloudState = raw ? normalizeState(raw, cloudReport) : null;
        if (!cloudState) {
          SYS.Cloud.push(state);
        } else if (SYS.deepEqual(cloudState, state)) {
          // Identical *after normalising* — which is exactly the case a
          // migration produces: both copies gained the same field on the way
          // in, so they agree in memory while the stored one is still without
          // it. Nothing here would ever write it back, and the evaluator reads
          // the stored copy, so it would keep choosing traits from a list one
          // short. Push once when this load changed anything.
          if (bootMigration.migrated || cloudReport.migrated) SYS.Cloud.push(state);
        } else if (!SYS.deepEqual(cloudState, state)) {
          // Cloud has something different from what's already here. That is
          // not automatically a question worth asking — see resolveOrAsk.
          resolveOrAsk(cloudState);
        }
      }).catch(() => {});
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !ui.cloudUser || !SYS.Cloud || !SYS.Cloud.available()) return;
    applyPendingGrants();
    refreshMyAppeals();
    refreshInbox();
    flushExpQueue();
    setTimeout(reconcileExpWithServer, 4000);
    SYS.Cloud.pullIfNewer().then((newState) => {
      if (newState) {
        applyRemoteState(newState);
        addToast({ kind: "info", text: SYS.t("sync.synced") });
      }
    }).catch(() => {});
  });

  // ---------------- event wiring ----------------

  document.addEventListener("input", (e) => {
    // The reminder time is two selects, hour and minute, read together.
    if (e.target.dataset && e.target.dataset.remindPart && ui.taskForm) {
      const box = e.target.closest(".remind-time");
      const h = box.querySelector('[data-remind-part="h"]');
      const m = box.querySelector('[data-remind-part="m"]');
      m.disabled = !h.value;
      ui.taskForm.remindAt = h.value ? h.value + ":" + m.value : "";
      return;
    }
    const bind = e.target.dataset && e.target.dataset.bind;
    if (bind) {
      setPath(ui, bind, e.target.value);
      // The emoji preview is the only bound field whose effect is visual
      // rather than textual, so it is the only one worth reflecting as it is
      // typed. Updated in place rather than by re-rendering the form, which
      // would take the caret with it.
      if (bind === "taskForm.icon") {
        const typed = e.target.value;
        const kept = SYS.clampIcon(typed);
        // One emoji, enforced in the field rather than only on save. Storing
        // the first and displaying the rest meant the box and the card
        // disagreed about what the icon was; now a second one simply cannot
        // be left there. Only trimmed when the first character is a valid
        // emoji — otherwise the text stays so it can be corrected rather
        // than silently swallowed.
        if (kept && typed !== kept) {
          e.target.value = kept;
          setPath(ui, bind, kept);
        }
        const box = document.querySelector(".appearance-preview");
        if (box) box.textContent = kept || SYS.taskIcon({ title: ui.taskForm && ui.taskForm.title });
        // Say so when what was typed will not be used. Without this a letter
        // simply vanished on save with no explanation — the field looked
        // broken rather than strict.
        e.target.classList.toggle("bad", !!typed.trim() && !kept);
      }
      return;
    }
    // Range slider: cheap live visual feedback only — no game logic, no re-render,
    // while the user is still dragging. The actual progress change commits on
    // "change" (release), same as the +/- steppers already do.
    if (e.target.dataset && e.target.dataset.action === "task-slide") {
      e.target.style.setProperty("--pct", e.target.value + "%");
      const label = e.target.parentElement.querySelector(".progress-pct");
      if (label) label.textContent = e.target.value + "%";
    }
  });

  document.addEventListener("change", (e) => {
    if (e.target.dataset && e.target.dataset.action === "task-slide") {
      const id = e.target.dataset.id;
      const newVal = Number(e.target.value);
      runGameAction((draft) => SYS.applyTaskProgress(draft, id, newVal));
      return;
    }
    // Theme and language are dropdowns now, so they arrive as change events.
    const selectAction = e.target.dataset && e.target.dataset.action;
    if (selectAction === "set-theme") {
      const themeName = e.target.value;
      runGameAction((draft) => { SYS.setTheme(draft, themeName); return []; });
      applyThemeAttribute();
      renderModalInto();
      return;
    }
    if (selectAction === "set-stats-year") {
      ui.statsYear = Number(e.target.value) || null;
      renderPageInto();
      return;
    }
    if (selectAction === "set-language") {
      const lang = e.target.value;
      runGameAction((draft) => { SYS.setLanguage(draft, lang); return []; });
      applyLanguage();
      renderAppInto();
      renderModalInto();
      return;
    }

    // Custom-theme colours commit on `change` rather than `input`: a colour
    // picker fires `input` continuously while dragging, which would persist
    // and cloud-push on every pixel of movement.
    const themeAction = e.target.dataset && e.target.dataset.action;
    if (themeAction === "set-custom-accent" || themeAction === "set-custom-base") {
      const patch = themeAction === "set-custom-accent" ? { accent: e.target.value } : { base: e.target.value };
      runGameAction((draft) => { SYS.setCustomTheme(draft, patch); return []; });
      applyThemeAttribute();
      renderModalInto();
      return;
    }
    if (e.target.dataset && e.target.dataset.action === "commit-note") {
      const id = e.target.dataset.id;
      const text = e.target.value;
      // Writing a note is not a game action — it pays nothing and takes
      // nothing back — but it goes through the same path so it is persisted
      // and pushed like everything else.
      runGameAction((draft) => SYS.setHabitNote(draft, id, logDay(), text));
      // Deliberately no re-render of the sheet. This fires on blur, so it
      // often fires because Add was clicked — and replacing the sheet between
      // the press and the release would drop that click on the floor. The
      // field already shows what was typed; nothing needs redrawing.
      return;
    }
    if (selectAction === "set-schedule-type") {
      const f = ui.taskForm;
      if (!f) return;
      f.schedule = f.schedule || blankSchedule();
      const wasType = f.schedule.type;
      f.schedule.type = e.target.value;
      // Both day pickers write to the same list but mean different things —
      // 6 is Saturday to one and the sixth of the month to the other — so
      // switching between them starts the new one over instead of carrying
      // numbers across that no longer say what they used to.
      //
      // It starts on the day you are standing in rather than on nothing,
      // because an empty list would quietly save as "every day". Today is
      // the one non-arbitrary choice available.
      const now = new Date();
      const fresh = wasType !== f.schedule.type;
      if (f.schedule.type === "weekdays" && (fresh || !(f.schedule.days || []).length)) f.schedule.days = [now.getDay()];
      if (f.schedule.type === "monthDays" && (fresh || !(f.schedule.days || []).length)) f.schedule.days = [now.getDate()];
      renderAppInto();
      return;
    }
    if (e.target.dataset && e.target.dataset.action === "change-task-type") {
      if (!ui.taskForm) return;
      if (ui.taskForm.taskType === "Long Term" && !["gradual", "allAtOnce"].includes(ui.taskForm.expMode)) {
        ui.taskForm.expMode = "gradual";
      }
      renderAppInto();
    }
  });

  // The Comparison chart's readout: one tooltip, both periods, for whichever
  // bucket the pointer or keyboard focus is on. Filled with textContent rather
  // than markup, and placed inside the card so it scrolls with it. The table
  // view carries the same numbers, so this only ever adds, never gates.
  function showCompareTip(hit) {
    const card = hit.closest(".cmp-card");
    const tip = card && card.querySelector(".cmp-tip");
    if (!tip) return;
    tip.replaceChildren();
    const head = document.createElement("div");
    head.className = "cmp-tip-head";
    head.textContent = hit.dataset.label || "";
    tip.appendChild(head);
    [["cur", hit.dataset.curName, hit.dataset.cur], ["prev", hit.dataset.prevName, hit.dataset.prev]].forEach(([cls, name, value]) => {
      const row = document.createElement("div");
      row.className = "cmp-tip-row " + cls;
      const key = document.createElement("span");
      key.className = "cmp-tip-key";
      const strong = document.createElement("strong");
      strong.textContent = value || "";
      const label = document.createElement("span");
      label.textContent = name || "";
      row.append(key, strong, label);
      tip.appendChild(row);
    });
    tip.hidden = false;
    const cr = card.getBoundingClientRect(), hr = hit.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const centre = hr.left - cr.left + hr.width / 2;
    tip.style.left = Math.max(6, Math.min(cr.width - tw - 6, centre - tw / 2)) + "px";
    tip.style.top = Math.max(6, hr.top - cr.top - th - 6) + "px";
    card.querySelectorAll(".cmp-hit.on").forEach((h) => h.classList.remove("on"));
    hit.classList.add("on");
  }
  function hideCompareTip(card) {
    if (!card) return;
    const tip = card.querySelector(".cmp-tip");
    if (tip) tip.hidden = true;
    card.querySelectorAll(".cmp-hit.on").forEach((h) => h.classList.remove("on"));
  }
  const compareHit = (node) => (node && node.closest ? node.closest(".cmp-hit") : null);
  document.addEventListener("pointerover", (e) => { const hit = compareHit(e.target); if (hit) showCompareTip(hit); });
  document.addEventListener("pointerout", (e) => {
    const hit = compareHit(e.target);
    if (hit && !compareHit(e.relatedTarget)) hideCompareTip(hit.closest(".cmp-card"));
  });
  document.addEventListener("focusin", (e) => { const hit = compareHit(e.target); if (hit) showCompareTip(hit); });
  document.addEventListener("focusout", (e) => { const hit = compareHit(e.target); if (hit) hideCompareTip(hit.closest(".cmp-card")); });

  document.addEventListener("keydown", (e) => {
    // The keypad exists so a phone never has to raise the OS keyboard over
    // the dial, but a desktop already has a keyboard and reaching for the
    // mouse to type a number would be a downgrade. Same keys, same path.
    // Not while the caret is in the note: the keypad shortcuts below would
    // swallow every digit and turn Enter into "Add".
    const inNote = e.target.classList && e.target.classList.contains("note-input");
    if (ui.modal === "logAmount" && !inNote) {
      if (e.key === "Escape") { e.preventDefault(); closeLogSheet(); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        const add = document.querySelector(".pad-add");
        if (add) add.click();
        return;
      }
      if (/^[0-9]$/.test(e.key) || e.key === ".") { e.preventDefault(); pressAmountKey(e.key); return; }
      if (e.key === "Backspace") { e.preventDefault(); pressAmountKey("back"); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); stepAmount(1); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); stepAmount(-1); return; }
    }
    if (e.target.id === "name-input") {
      if (e.key === "Enter") { e.preventDefault(); e.target.blur(); }
      if (e.key === "Escape") { ui.nameEditing = false; ui.__nameDraft = null; renderAppInto(); }
    }
  });

  document.addEventListener("focusout", (e) => {
    if (e.target.id === "name-input") commitName();
  });

  $importInput.addEventListener("change", () => {
    const file = $importInput.files && $importInput.files[0];
    $importInput.value = "";
    if (!file) return;
    SYS.Storage.importFromFile(file).then((parsed) => {
      state = normalizeImportedState(parsed);
      persist(state);
      applyThemeAttribute();
      ui.modal = null;
      ui.expanded = {};
      ui.importError = null;
      renderAppInto();
      renderModalInto();
      addToast({ kind: "info", text: SYS.t("common.backupImported") });
    }).catch((err) => {
      ui.importError = err.message;
      renderModalInto();
    });
  });

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;

    // Editing the index is guarded as well as hidden. A control that is merely
    // invisible is still a control, and this one decides the axes everybody's
    // work is scored on.
    if (INDEX_EDITS.has(action) && !ui.isAdmin) return;
    const key = el.dataset.key;
    const id = el.dataset.id;

    if (action === "close-modal-backdrop") {
      if (e.target.closest("[data-stop-close]")) return;
      ui.modal = null; ui.settingsDraft = null; ui.addCategoryDraft = null; ui.addCategoryError = null; ui.importError = null;
      renderModalInto();
      return;
    }

    const isAdminAction = action === "admin-grant-admin" || action === "admin-revoke-admin";
    if (ARMABLE.has(action)) {
      const armKind = action === "remove-trait" ? "trait" : action === "reset-data" ? "reset" : isAdminAction ? "admin" : "task";
      const armId = action === "remove-trait" ? el.dataset.trait : action === "reset-data" ? "reset" : isAdminAction ? `${action}:${el.dataset.email}` : (id || el.dataset.id);
      if (!isArmed(armKind, armId)) {
        arm(armKind, armId);
        if (action === "reset-data") renderModalInto(); else if (isAdminAction) renderPageInto(); else renderAppInto();
        return;
      }
      disarm();
      // falls through to perform the confirmed action below
    } else if (ui.armed) {
      disarm();
    }

    switch (action) {
      case "open-settings":
        refreshPushState();
        ui.modal = "settings"; ui.settingsDraft = { ...state.settings }; ui.importError = null;
        renderModalInto();
        // Best-effort refresh of emailVerified — reload() mutates the same
        // Firebase user object in place, so this just picks up a verification
        // click that happened since the last page load.
        if (SYS.Cloud && SYS.Cloud.available() && ui.cloudUser) {
          SYS.Cloud.reloadUser().then((user) => {
            if (user) { ui.cloudUser = { email: user.email, uid: user.uid, emailVerified: user.emailVerified }; renderModalInto(); }
          }).catch(() => {});
        }
        break;
      case "close-modal":
        ui.modal = null; ui.settingsDraft = null; ui.addCategoryDraft = null; ui.addCategoryError = null; ui.importError = null;
        renderModalInto();
        break;
      case "set-custom-mode": {
        const dark = el.dataset.dark === "1";
        runGameAction((draft) => { SYS.setCustomTheme(draft, { dark }); return []; });
        applyThemeAttribute();
        renderModalInto();
        break;
      }
      case "set-account-mode":
        ui.accountForm.mode = el.dataset.mode;
        ui.accountForm.error = null;
        ui.accountForm.info = null;
        renderModalInto();
        break;
      case "account-submit": {
        const f = ui.accountForm;
        if (!f.email || !f.password) { f.error = SYS.t("account.needBoth"); renderModalInto(); return; }
        const wasSignup = f.mode === "signup";
        f.busy = true; f.error = null; f.info = null;
        renderModalInto();
        const req = wasSignup ? SYS.Cloud.signUp(f.email, f.password) : SYS.Cloud.signIn(f.email, f.password);
        req.then(() => {
          ui.accountForm = { mode: "signin", email: "", password: "", error: null, info: null, busy: false };
          renderModalInto();
          if (wasSignup) addToast({ kind: "info", text: SYS.t("account.created") });
        }).catch((err) => {
          f.busy = false;
          f.error = err.message || "Something went wrong.";
          renderModalInto();
        });
        break;
      }
      case "account-google": {
        const f = ui.accountForm;
        f.error = null; f.info = null; f.busy = true;
        renderModalInto();
        SYS.Cloud.signInWithGoogle().then(() => {
          // onAuthStateChanged (already wired above) picks up the signed-in
          // user and re-renders the settings modal on its own.
          f.busy = false;
        }).catch((err) => {
          f.busy = false;
          const code = err && err.code;
          f.error = code === "auth/popup-blocked"
            ? SYS.t("account.popupBlocked")
            : code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request"
              ? null // user just closed it — not an error worth showing
              : (err && err.message) || "Couldn't sign in with Google.";
          renderModalInto();
        });
        break;
      }
      case "account-forgot-password": {
        const f = ui.accountForm;
        f.error = null; f.info = null;
        if (!f.email) { f.error = SYS.t("account.enterEmailFirst"); renderModalInto(); return; }
        SYS.Cloud.sendPasswordReset(f.email).then(() => {
          f.info = SYS.t("account.resetSent");
          renderModalInto();
        }).catch((err) => {
          f.error = err.message || "Couldn't send that — check the email address.";
          renderModalInto();
        });
        break;
      }
      case "account-resend-verification": {
        const now = Date.now();
        if (now - ui.lastVerifyResendAt < 30000) return;
        ui.lastVerifyResendAt = now;
        SYS.Cloud.sendVerificationEmail().then(() => {
          ui.syncStatus = "Verification email sent — check your inbox.";
          renderModalInto();
        }).catch(() => {
          ui.syncStatus = "Couldn't send that right now — try again shortly.";
          renderModalInto();
        });
        break;
      }
      case "account-sign-out":
        SYS.Cloud.signOut();
        renderModalInto();
        break;

      case "admin-search": {
        const query = (ui.adminSearchEmail || "").trim();
        ui.adminSearchError = null; ui.adminResult = null;
        if (!query) { ui.adminSearchError = SYS.t("admin.enterQuery"); renderPageInto(); return; }
        ui.adminBusy = true;
        renderPageInto();
        // Resolves a display name or an email — the function works out which.
        SYS.Cloud.callLookupUser(query).then((found) =>
          Promise.all([
            SYS.Cloud.fetchUserState(found.uid),
            SYS.Cloud.callGetAdminStatus(found.uid),
          ]).then(([data, status]) => {
            ui.adminBusy = false;
            ui.adminResult = {
              uid: found.uid, email: found.email, name: found.name,
              state: data ? data.state : null,
              isTargetAdmin: status.admin,
              // What their standing rests on: a price the evaluator issued, or
              // their own word. See recordExpEvent in functions/index.js.
              expTotal: status.expTotal, expUnverified: status.expUnverified,
            };
            renderPageInto();
          })
        ).catch((err) => {
          ui.adminBusy = false;
          ui.adminSearchError = err.message || SYS.t("admin.notFound");
          renderPageInto();
        });
        break;
      }
      case "admin-grant-admin":
      case "admin-revoke-admin": {
        const email = el.dataset.email;
        const makeAdmin = action === "admin-grant-admin";
        ui.adminBusy = true;
        renderPageInto();
        SYS.Cloud.callSetAdmin(email, makeAdmin).then(() => {
          ui.adminBusy = false;
          if (ui.adminResult && ui.adminResult.email === email) ui.adminResult.isTargetAdmin = makeAdmin;
          addToast({ kind: "info", text: `${email} ${makeAdmin ? "is now" : "is no longer"} an admin.` });
          renderPageInto();
        }).catch((err) => {
          ui.adminBusy = false;
          ui.adminSearchError = err.message || "That didn't work.";
          renderPageInto();
        });
        break;
      }
      case "admin-backfill-usernames":
        ui.adminBusy = true; ui.adminSearchError = null;
        renderPageInto();
        SYS.Cloud.callBackfillUsernames().then((res) => {
          ui.adminBusy = false;
          const conflictNote = res.conflicts.length
            ? " " + res.conflicts.map((c) => (c.email || c.uid) + " (" + c.name + ")").join(", ") + " still need to choose a different name."
            : "";
          addToast({ kind: "info", text: `Reserved ${res.claimed} name(s); ${res.alreadyHeld} already held.${conflictNote}` });
          renderPageInto();
        }).catch((err) => {
          ui.adminBusy = false;
          ui.adminSearchError = err.message || "Sync failed.";
          renderPageInto();
        });
        break;

      case "admin-backfill-baselines":
        ui.adminBusy = true; ui.adminSearchError = null;
        renderPageInto();
        SYS.Cloud.callBackfillExpBaselines().then((res) => {
          ui.adminBusy = false;
          // Worth saying out loud when it converts nothing: "already done" and
          // "nothing to do" look the same from a count of zero, and one of them
          // means the button did not work.
          const note = res.converted
            ? `Converted ${res.converted} baseline(s).`
            : `Nothing to convert — ${res.alreadyDone} already on the current scale, ${res.noBaseline} with no baseline yet.`;
          addToast({ kind: "info", text: note + " Run “Sync leaderboard” next so the public rows are recomputed." });
          renderPageInto();
        }).catch((err) => {
          ui.adminBusy = false;
          ui.adminSearchError = err.message || "Conversion failed.";
          renderPageInto();
        });
        break;

      case "admin-backfill-leaderboard":
        ui.adminBusy = true; ui.adminSearchError = null;
        renderPageInto();
        SYS.Cloud.callBackfillLeaderboard().then((res) => {
          ui.adminBusy = false;
          const missing = res.skippedNoName
            ? ` ${res.skippedNoName} account(s) have no reserved name, so they stay off the board — run “Reserve existing names” first, then this again.`
            : "";
          addToast({ kind: "info", text: `Leaderboard synced — ${res.written} row(s) written.${missing}` });
          renderPageInto();
        }).catch((err) => {
          ui.adminBusy = false;
          ui.adminSearchError = err.message || "Sync failed.";
          renderPageInto();
        });
        break;

      case "admin-backfill-directory":
        ui.adminBusy = true; ui.adminSearchError = null;
        renderPageInto();
        SYS.Cloud.callBackfillUserDirectory().then((res) => {
          ui.adminBusy = false;
          addToast({ kind: "info", text: `Directory synced — ${res.usersProcessed} account(s) checked.` });
          renderPageInto();
        }).catch((err) => {
          ui.adminBusy = false;
          ui.adminSearchError = err.message || "Sync failed.";
          renderPageInto();
        });
        break;

      case "sync-choice": {
        const choice = el.dataset.choice;
        if (choice === "cloud" && ui.pendingCloudState) applyRemoteState(ui.pendingCloudState);
        else if (choice === "local") SYS.Cloud.push(state);
        ui.pendingCloudState = null;
        ui.modal = null;
        renderModalInto();
        break;
      }
      case "replay-brand":
        playBrand();
        break;

      case "export-backup":
        SYS.Storage.exportToFile(state);
        addToast({ kind: "info", text: SYS.t("common.backupDownloaded") });
        break;
      case "import-backup":
        $importInput.click();
        break;
      case "reset-data":
        state = SYS.defaultState();
        persist(state);
        applyThemeAttribute();
        ui.modal = null; ui.expanded = {};
        renderAppInto();
        renderModalInto();
        break;

      case "edit-name":
        ui.nameEditing = true; ui.__nameDraft = state.player.name;
        renderAppInto();
        break;

      case "toggle-intel":
        ui.expanded[key] = !ui.expanded[key];
        renderAppInto();
        break;
      case "open-add-trait":
        ui.addTraitOpen = key; ui.addTraitDraft = { key, name: "", ar: "" };
        renderAppInto();
        break;
      case "cancel-add-trait":
        ui.addTraitOpen = null; ui.addTraitDraft = null;
        renderAppInto();
        break;
      case "submit-add-trait": {
        const d = ui.addTraitDraft;
        if (!d || !d.name.trim()) return;
        ui.addTraitOpen = null; ui.addTraitDraft = null;
        runGameAction((draft) => { SYS.addTrait(draft, key, d.name, d.ar); return []; });
        break;
      }
      case "remove-trait":
        runGameAction((draft) => { SYS.removeTrait(draft, key, el.dataset.trait); return []; });
        break;
      case "open-add-category":
        ui.modal = "addCategory"; ui.addCategoryDraft = { name: "", ar: "", short: "", color: "#4fd1ff" }; ui.addCategoryError = null;
        renderModalInto();
        break;
      case "submit-add-category": {
        const d = ui.addCategoryDraft;
        if (!d || !d.name.trim()) { ui.addCategoryError = SYS.t("intel.nameRequired"); renderModalInto(); return; }
        const shortCode = (d.short && d.short.trim()) ? d.short.trim().toUpperCase() : d.name.trim().slice(0, 4).toUpperCase();
        const draft = SYS.clone(state);
        const newKey = SYS.addIntType(draft, { name: d.name, ar: d.ar, short: shortCode, color: d.color });
        state = draft;
        persist(state);
        ui.expanded[newKey] = true;
        ui.modal = null; ui.addCategoryDraft = null; ui.addCategoryError = null;
        renderAppInto();
        renderModalInto();
        break;
      }

      case "open-quest-form":
        ui.taskForm = {
          formKind: "add", editId: null, title: "", priority: "Medium", taskType: "Short Term", types: [], pt: 100, expMode: "simple",
          notes: "", error: null, busy: false, lockType: true,
          recurring: false, quit: false, remindAt: "", schedule: blankSchedule(), unit: "reps", targetAmount: 1, customUnit: "",
          icon: "",
        };
        renderAppInto();
        break;
      case "open-habit-form":
        ui.taskForm = {
          formKind: "add", editId: null, title: "", priority: "Medium", taskType: "Short Term", types: [], pt: 20, expMode: "simple",
          notes: "", error: null, busy: false, lockType: true,
          recurring: true, quit: false, remindAt: "", schedule: blankSchedule(), unit: "reps", targetAmount: 1, customUnit: "",
          icon: "",
        };
        renderAppInto();
        break;
      case "open-appeal-form": {
        const t = state.tasks.find((x) => x.id === id);
        if (!t) return;
        ui.appealForm = { taskId: t.id, taskTitle: t.title, reason: "", error: null, busy: false };
        renderPageInto();
        break;
      }
      case "cancel-appeal-form":
        ui.appealForm = null;
        renderPageInto();
        break;
      case "submit-appeal-form": {
        const f = ui.appealForm;
        if (!f || f.busy) return;
        if (f.reason.trim().length < 10) { f.error = SYS.t("appeal.needsReason"); renderPageInto(); return; }
        const task = state.tasks.find((x) => x.id === f.taskId);
        if (!task) { ui.appealForm = null; renderPageInto(); return; }
        f.busy = true; f.error = null;
        renderPageInto();
        SYS.Cloud.createAppeal(task, f.reason).then(() => {
          ui.appealForm = null;
          addToast({ kind: "info", text: SYS.t("appeal.submitted") });
          refreshMyAppeals();
          renderPageInto();
        }).catch((err) => {
          f.busy = false;
          f.error = err.message || "Couldn't submit that.";
          renderPageInto();
        });
        break;
      }

      case "admin-refresh-appeals":
        refreshAdminAppealQueue();
        break;
      case "admin-resolve-appeal": {
        const appealId = el.dataset.id;
        const points = Number(ui.adminAppealPoints[appealId]);
        if (!Number.isFinite(points) || points < 1) {
          ui.adminAppealError = SYS.t("admin.needValue");
          renderPageInto();
          return;
        }
        ui.adminAppealBusy = true; ui.adminAppealError = null;
        renderPageInto();
        SYS.Cloud.callResolveAppeal(appealId, points).then(() => {
          ui.adminAppealBusy = false;
          addToast({ kind: "info", text: `Value corrected to ${points} xp.` });
          refreshAdminAppealQueue();
        }).catch((err) => {
          ui.adminAppealBusy = false;
          ui.adminAppealError = err.message || "That didn't work.";
          renderPageInto();
        });
        break;
      }
      case "admin-reject-appeal": {
        const appealId = el.dataset.id;
        ui.adminAppealBusy = true; ui.adminAppealError = null;
        renderPageInto();
        SYS.Cloud.callRejectAppeal(appealId).then(() => {
          ui.adminAppealBusy = false;
          addToast({ kind: "info", text: "Appeal rejected — value stands." });
          refreshAdminAppealQueue();
        }).catch((err) => {
          ui.adminAppealBusy = false;
          ui.adminAppealError = err.message || "That didn't work.";
          renderPageInto();
        });
        break;
      }

      case "mark-inbox-read": {
        const msgId = el.dataset.id;
        const msg = ui.inbox.find((m) => m.id === msgId);
        if (!msg || msg.read) return;
        msg.read = true; // optimistic — this is a low-stakes, same-user toggle
        renderPageInto();
        renderSidebarInto();
        SYS.Cloud.markInboxRead(msgId).catch(() => {});
        break;
      }
      case "admin-send-adjustment": {
        const r = ui.adminResult;
        if (!r) return;
        const text = (ui.adminMsgText || "").trim();
        const amountRaw = (ui.adminMsgAmount || "").trim();
        const amount = amountRaw === "" ? 0 : Number(amountRaw);
        if (!text) { ui.adminMsgError = SYS.t("admin.needMessage"); renderPageInto(); return; }
        if (amountRaw !== "" && !Number.isFinite(amount)) { ui.adminMsgError = "Amount must be a number."; renderPageInto(); return; }
        ui.adminMsgBusy = true; ui.adminMsgError = null;
        renderPageInto();
        SYS.Cloud.callApplyAdjustment(r.uid, text, amount).then(() => {
          ui.adminMsgBusy = false;
          ui.adminMsgText = ""; ui.adminMsgAmount = "";
          addToast({ kind: "info", text: amount ? `Sent, with a ${amount > 0 ? "+" : ""}${amount} EXP adjustment.` : "Message sent." });
          renderPageInto();
        }).catch((err) => {
          ui.adminMsgBusy = false;
          ui.adminMsgError = err.message || "Couldn't send that.";
          renderPageInto();
        });
        break;
      }

      case "edit-task": {
        const t = state.tasks.find((x) => x.id === id);
        if (!t) return;
        const knownUnits = SYS.UNIT_GROUPS.flatMap((g) => g.units);
        const unitIsKnown = t.recurring ? knownUnits.includes(t.unit) : true;
        ui.taskForm = {
          formKind: "edit", editId: id, title: t.title, priority: t.priority, taskType: t.taskType || "Short Term", types: [...t.types],
          pt: t.pt, expMode: t.mode === "gradual" ? "gradual" : "allAtOnce", notes: t.notes || "", error: null, busy: false, lockType: false, traitTargets: t.traitTargets || [], priceId: t.priceId || null,
          recurring: !!t.recurring,
          quit: !!t.quit,
          remindAt: t.remindAt || "",
          schedule: Object.assign(blankSchedule(), SYS.scheduleOf(t)),
          unit: t.recurring ? (unitIsKnown ? t.unit : "custom") : "reps",
          targetAmount: t.targetAmount || 1,
          customUnit: t.recurring && !unitIsKnown ? t.unit : "",
          icon: t.icon || "",
        };
        renderAppInto();
        // On the Stats page the form opens under the habit's buttons, which on
        // a phone is usually below the fold. Bring it into view, or the press
        // looks like it did nothing.
        {
          const box = document.querySelector(".stats-edit");
          if (box) box.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        }
        break;
      }
      case "cancel-quest-form":
        ui.taskForm = null;
        renderAppInto();
        break;
      case "set-exp-mode":
        if (!ui.taskForm) return;
        ui.taskForm.expMode = el.dataset.mode;
        renderAppInto();
        break;
      case "set-recurring":
        if (!ui.taskForm) return;
        ui.taskForm.recurring = el.dataset.value === "1";
        renderAppInto();
        break;
      case "set-unit":
        if (!ui.taskForm) return;
        ui.taskForm.unit = el.dataset.unit;
        renderAppInto();
        break;
      case "submit-quest-form": {
        const f = ui.taskForm;
        if (!f || f.busy) return;
        if (!f.title || !f.title.trim()) { f.error = SYS.t("form.needsTitle"); renderAppInto(); return; }
        if (f.formKind !== "edit" && (!f.notes || f.notes.trim().length < 10)) {
          f.error = SYS.t("form.needsDescription");
          renderAppInto();
          return;
        }
        const resolvedUnit = f.unit === "custom" ? ((f.customUnit || "").trim() || "unit") : f.unit;
        const isEdit = f.formKind === "edit";
        const editId = f.editId;

        const commit = (pt, types, traitTargets, priceId) => {
          const formForEngine = {
            title: f.title, priority: f.priority, taskType: f.taskType, types, pt, mode: f.expMode, notes: f.notes,
            recurring: f.recurring, quit: !!f.quit, remindAt: f.remindAt, schedule: f.schedule, unit: resolvedUnit, targetAmount: f.targetAmount,
            traitTargets, priceId,
            // The payload is built field by field rather than spread from the
            // form, so anything added to the form has to be added here too or
            // it is silently dropped on save — which is exactly what happened
            // to these two the first time.
            icon: f.icon,
          };
          ui.taskForm = null;
          runGameAction((draft) => {
            if (isEdit) return SYS.updateTask(draft, editId, formForEngine);
            SYS.addTask(draft, formForEngine);
            return [];
          });
        };

        // Editing never re-evaluates — the assigned value and categories carry
        // over untouched. Otherwise a user could edit repeatedly until they
        // got a value they liked (and burn a paid API call each time).
        if (isEdit) { commit(f.pt, f.types, f.traitTargets, f.priceId); break; }

        if (!SYS.Cloud || !SYS.Cloud.available() || !ui.cloudUser) {
          f.error = SYS.t("form.signInToAdd");
          renderAppInto();
          return;
        }
        if (!navigator.onLine) {
          f.error = SYS.t("form.offline");
          renderAppInto();
          return;
        }

        f.busy = true; f.error = null;
        renderAppInto();
        SYS.Cloud.callEvaluateTask({
          title: f.title,
          description: f.notes,
          kind: f.recurring ? "habit" : "quest",
          quit: !!(f.recurring && f.quit),
          // Both: the schedule says what was actually committed to, and
          // the rate is what makes two schedules comparable. The rate also
          // keeps a server that predates schedules able to price the task.
          schedule: f.recurring ? SYS.sanitizeSchedule(f.schedule) : undefined,
          repeatsPerWeek: SYS.weeklyRate({ schedule: SYS.sanitizeSchedule(f.schedule) }),
          unit: resolvedUnit,
          targetAmount: f.targetAmount,
          traits: SYS.Cloud.traitsForEvaluation(state),
        }).then((result) => {
          commit(result.pt, result.types || [], result.traitTargets || [], result.priceId);
          const aimed = (result.traitTargets || []).map((t) => t.trait).filter(Boolean).join(", ");
          addToast({
            kind: "info",
            text: (result.rationale
              ? `+${result.pt} xp — ${result.rationale}`
              : `The system valued this at +${result.pt} xp.`) +
              (aimed ? ` → ${aimed}` : ""),
          });
        }).catch((err) => {
          if (!ui.taskForm) return; // form was closed while the call was in flight
          ui.taskForm.busy = false;
          // Admins get the operational cause appended; see describeApiFailure
          // in functions/index.js. Nobody else is sent it.
          const detail = ui.isAdmin && err && err.details && err.details.reason;
          ui.taskForm.error = (err.message || "The system couldn't evaluate that. Try again.") +
            (detail ? " (" + detail + ")" : "");
          renderAppInto();
        });
        break;
      }
      case "delete-task-from-form":
        ui.taskForm = null;
        runGameAction((draft) => { SYS.removeTask(draft, id); return []; });
        break;

      case "complete-task":
        runGameAction((draft) => SYS.completeSimpleTask(draft, id));
        break;
      case "reopen-task":
        runGameAction((draft) => SYS.reopenSimpleTask(draft, id));
        break;
      case "delete-task":
        runGameAction((draft) => { SYS.removeTask(draft, id); return []; });
        break;
      case "task-step": {
        const t = state.tasks.find((x) => x.id === id);
        if (!t) return;
        const delta = Number(el.dataset.delta);
        const newVal = t.completion + delta;
        runGameAction((draft) => SYS.applyTaskProgress(draft, id, newVal));
        break;
      }
      case "set-quit": {
        const f = ui.taskForm;
        if (!f) return;
        f.quit = el.dataset.value === "1";
        renderAppInto();
        break;
      }
      case "toggle-schedule-day": {
        const f = ui.taskForm;
        if (!f || !f.schedule) return;
        f.schedule.days = toggleIn(f.schedule.days, Number(el.dataset.day));
        renderAppInto();
        break;
      }
      case "toggle-schedule-date": {
        const f = ui.taskForm;
        if (!f || !f.schedule) return;
        f.schedule.days = toggleIn(f.schedule.days, Number(el.dataset.date));
        renderAppInto();
        break;
      }
      case "push-enable":
        ui.pushState = "busy";
        ui.pushError = null;
        ui.pushTested = false;
        renderModalInto();
        SYS.enablePush().then((result) => {
          // "denied" is the one that cannot be undone from here: once a
          // browser has been told no, only its own settings can change that,
          // and pretending otherwise would send someone round in circles.
          ui.pushState = result === "enabled" ? "enabled" : result === "denied" ? "denied" : "off";
          if (result === "failed") ui.pushError = SYS.t("push.failed");
          refreshRemindCount();
          renderModalInto();
        });
        break;
      case "push-disable":
        ui.pushState = "busy";
        ui.pushTested = false;
        ui.pushError = null;
        renderModalInto();
        SYS.disablePush().then(() => {
          ui.pushState = "off";
          renderModalInto();
        });
        break;
      case "push-test":
        // A toast used to be the only sign this had worked — and the toast
        // stack sat *under* a modal's scrim, so the one button that can only
        // be pressed from inside Settings reported itself somewhere nobody
        // could see. It now says what it is doing where it was pressed. The
        // stack was raised above modals too, so no other toast can hide the
        // same way.
        if (ui.pushTesting || !SYS.Cloud.callSendTestPush) return;
        ui.pushError = null;
        ui.pushTested = false;
        ui.pushTesting = true;
        renderModalInto();
        SYS.Cloud.callSendTestPush()
          .then(() => { ui.pushTesting = false; ui.pushTested = true; renderModalInto(); })
          .catch((err) => {
            ui.pushTesting = false;
            ui.pushError = (err && err.message) || SYS.t("push.failed");
            renderModalInto();
          });
        break;
      case "open-library":
        ui.modal = "library";
        ui.libraryBusy = null;
        ui.libraryError = null;
        renderModalInto();
        break;
      case "close-library":
        ui.modal = null; ui.libraryBusy = null; ui.libraryError = null;
        renderModalInto();
        break;
      case "close-library-backdrop":
        if (e.target.closest("[data-stop-close]")) return;
        ui.modal = null; ui.libraryBusy = null; ui.libraryError = null;
        renderModalInto();
        break;
      case "add-from-library": {
        const preset = SYS.libraryPreset(id);
        if (!preset || ui.libraryBusy) return;
        if (!ui.cloudUser || !SYS.Cloud.callPriceLibraryHabit) {
          ui.libraryError = SYS.t("library.signIn");
          renderModalInto();
          return;
        }
        ui.libraryBusy = id;
        ui.libraryError = null;
        renderModalInto();
        // The client sends the id and the schedule and is told what the habit
        // is worth. It never proposes a number: an EXP entry is checked
        // against a price the server issued, so a price made up here would
        // buy nothing but an unverifiable task.
        SYS.Cloud.callPriceLibraryHabit({ presetId: id, schedule: preset.schedule })
          .then((res) => {
            const title = SYS.t("preset." + id);
            runGameAction((draft) => {
              SYS.addTask(draft, {
                title,
                priority: "Medium",
                taskType: "Recurring",
                types: res.types || [],
                pt: res.pt,
                mode: "simple",
                notes: "",
                recurring: true,
                schedule: res.schedule || preset.schedule,
                unit: res.unit || preset.unit,
                targetAmount: res.targetAmount || preset.targetAmount,
                traitTargets: res.traitTargets || [],
                priceId: res.priceId,
                fromLibrary: id,
                icon: preset.emoji,
              });
              return [{ kind: "info", text: SYS.t("library.added", { title }) }];
            });
            ui.libraryBusy = null;
            renderModalInto();
          })
          .catch((err) => {
            ui.libraryBusy = null;
            ui.libraryError = (err && err.message) || SYS.t("library.failed");
            renderModalInto();
          });
        break;
      }
      case "open-amount": {
        const task = state.tasks.find((x) => x.id === id);
        if (!task) return;
        // A day that has not happened cannot be logged. The button is
        // already disabled on those days; this is the same rule stated where
        // the write would happen, because a disabled button is a hint and
        // not a guarantee.
        const day = SYS.shownDay(ui);
        if (day > SYS.todayKey()) return;
        openLogSheet(task, day);
        break;
      }
      case "close-amount":
        closeLogSheet();
        break;
      case "close-amount-backdrop":
        if (e.target.closest("[data-stop-close]")) return;
        closeLogSheet();
        break;
      case "quit-clean":
        runGameAction((draft) => SYS.logHabitDay(draft, id, logDay()));
        renderModalInto();
        break;
      case "quit-slip":
        runGameAction((draft) => SYS.markSlip(draft, id, logDay()));
        renderModalInto();
        break;
      case "quit-reset":
        // Back to undecided, whichever way the day was marked. Clearing a
        // clean day returns its EXP; clearing a slip was never paid for.
        runGameAction((draft) => {
          const day = logDay();
          const notes = SYS.unlogHabitDay(draft, id, day);
          SYS.clearSlip(draft, id, day);
          return notes;
        });
        renderModalInto();
        break;
      case "toggle-note":
        ui.noteOpen = !ui.noteOpen;
        renderModalInto();
        // Straight into the field: the toggle was the decision to write.
        if (ui.noteOpen) {
          const box = document.querySelector(".note-input");
          if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
        }
        break;
      case "amount-key":
        pressAmountKey(el.dataset.key);
        break;
      case "amount-step":
        stepAmount(Number(el.dataset.delta));
        break;
      case "amount-unit":
        // The number keeps its digits and changes meaning — 30 min becomes
        // 30 sec. Converting it instead would mean the number you just
        // entered is not the number on screen.
        ui.amountUnit = el.dataset.unit;
        renderModalInto();
        break;
      case "commit-amount": {
        const task = state.tasks.find((x) => x.id === id);
        if (!task) return;
        const value = Number(ui.amountValue);
        if (!Number.isFinite(value) || value === 0) return;
        const unit = SYS.unitFamily(task.unit).includes(ui.amountUnit) ? ui.amountUnit : task.unit;
        runGameAction((draft) => SYS.addHabitAmount(draft, id, logDay(), value, unit));
        // The sheet stays up so a second helping is one press away, which is
        // the whole point of a keypad over a one-shot box.
        resetAmount();
        renderModalInto();
        break;
      }
      case "fill-day":
        runGameAction((draft) => SYS.logHabitDay(draft, id, logDay()));
        closeLogSheet();
        break;
      case "undo-day":
        runGameAction((draft) => SYS.unlogHabitDay(draft, id, logDay()));
        // Kept open on purpose: clearing a day is usually the first half of
        // correcting it, and closing the sheet would mean reopening it to
        // type the right number.
        renderModalInto();
        break;

      // One control for both directions: an empty day fills in, a filled one
      // clears. The day is passed explicitly so yesterday can be corrected
      // without pretending it is today.
      case "toggle-habit-day": {
        const day = el.dataset.day;
        const task = state.tasks.find((x) => x.id === id);
        if (!task || !day) return;
        runGameAction((draft) => SYS.habitDoneOn(draft.tasks.find((x) => x.id === id), day)
          ? SYS.unlogHabitDay(draft, id, day)
          : SYS.logHabitDay(draft, id, day));
        break;
      }

      // Moving the page to another day. The week offset and the chosen day
      // are kept apart on purpose: the arrows move the window, picking a cell
      // moves the day, and neither silently does the other's job.
      case "pick-day": {
        const day = el.dataset.day;
        if (!day) return;
        // Choosing today clears the override rather than storing today's
        // key, so the page keeps following the clock past midnight.
        ui.habitDay = day === SYS.todayKey() ? null : day;
        renderAppInto();
        break;
      }
      case "shift-week": {
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
        renderAppInto();
        break;
      }
      case "jump-today":
        ui.weekOffset = 0;
        ui.habitDay = null;
        renderAppInto();
        break;


      case "open-timer":
        stopTimerTick();
        ui.timerOpenedFor = id;
        if (!ui.timer || (ui.timer.taskId !== id && !timerHasTime())) {
          ui.timer = {
            taskId: id,
            running: false,
            startedAt: null,
            accumulatedMs: 0,
            loggedMs: 0,
            mode: (state.settings || {}).timerMode === "countdown" ? "countdown" : "stopwatch",
          };
          saveTimer();
        }
        ui.timerPanel = null;
        ui.modal = "timer";
        renderModalInto();
        break;
      case "timer-start":
        if (!ui.timer) return;
        ui.timer.running = true;
        ui.timer.startedAt = Date.now();
        ui.timer.restored = false;
        ui.timer.capped = false;
        saveTimer();
        if (SYS.startFocusSound) {
          SYS.unlockSound();
          SYS.startFocusSound((state.settings || {}).focusSound || "silent");
        }
        renderModalInto();
        startTimerTick();
        break;
      case "timer-pause":
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
        renderModalInto();
        break;

      case "close-timer":
        // An audition is for choosing; it has no business outliving the panel.
        // A running session's sound is left alone.
        if (!(ui.timer && ui.timer.running) && SYS.stopFocusSound) SYS.stopFocusSound();
        // The session survives the panel either way: running stays running,
        // because a countdown you have to keep watching is not a countdown,
        // and a paused one keeps its minutes rather than losing them to a
        // dismissed panel.
        flushTimer();
        ui.modal = null;
        ui.timerPanel = null;
        renderModalInto();
        break;
      case "timer-discard": {
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
        if (seconds > 0) runGameAction((draft) => SYS.addHabitAmount(draft, taskId, SYS.todayKey(), -seconds, "sec"));
        renderModalInto();
        break;
      }
      case "timer-mode": {
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
        runGameAction((draft) => { draft.settings.timerMode = mode; return []; });
        renderModalInto();
        break;
      }
      case "timer-style-panel":
        ui.timerPanel = ui.timerPanel === "style" ? null : "style";
        renderModalInto();
        break;
      case "pick-style":
        runGameAction((draft) => { draft.settings.timerStyle = el.dataset.style; return []; });
        renderModalInto();
        break;
      case "timer-sound-panel":
        if (ui.timerPanel === "sound") {
        // An audition is for choosing; it has no business outliving the panel.
        // A running session's sound is left alone.
        if (!(ui.timer && ui.timer.running) && SYS.stopFocusSound) SYS.stopFocusSound();
        }
        ui.timerPanel = ui.timerPanel === "sound" ? null : "sound";
        renderModalInto();
        break;
      case "timer-sound-tab":
        ui.soundTab = el.dataset.tab === "end" ? "end" : "focus";
        renderModalInto();
        break;
      case "pick-sound": {
        const kind = el.dataset.kind === "end" ? "end" : "focus";
        const name = el.dataset.name;
        runGameAction((draft) => {
          if (kind === "end") draft.settings.endSound = name;
          else draft.settings.focusSound = name;
          return [];
        });
        const running = !!(ui.timer && ui.timer.running);
        if (kind === "end") {
          if (SYS.previewSound) SYS.previewSound("end", name);
        } else if (SYS.currentFocusSound && SYS.currentFocusSound() === name && !running) {
          // Already sounding, and nothing depends on it: a second press is
          // how you stop listening.
          if (SYS.stopFocusSound) SYS.stopFocusSound();
        } else if (running) {
          // Mid-session it swaps and keeps playing.
          if (SYS.startFocusSound) SYS.startFocusSound(name);
        } else if (SYS.previewSound) {
          // Plays until it is stopped. A list of words for sounds tells you
          // nothing, and two seconds of a texture tells you barely more.
          SYS.previewSound("focus", name);
        }
        renderModalInto();
        break;
      }
      case "close-timer-backdrop":
        if (e.target.closest("[data-stop-close]")) return;
        // An audition is for choosing; it has no business outliving the panel.
        // A running session's sound is left alone.
        if (!(ui.timer && ui.timer.running) && SYS.stopFocusSound) SYS.stopFocusSound();

        stopTimerTick();
        if (ui.timer && ui.timer.running) {
          ui.timer.accumulatedMs += Date.now() - ui.timer.startedAt;
          ui.timer.running = false;
          ui.timer.startedAt = null;
        }
        saveTimer();
        ui.modal = null;
        renderModalInto();
        break;

      case "dismiss-rankup":
        dismissRankup();
        break;

      case "nav":
        ui.page = el.dataset.page;
        renderSidebarInto();
        renderPageInto();
        if (ui.page === "admin") refreshAdminAppealQueue();
        if (ui.page === "leaderboard") refreshLeaderboard();
        if (ui.page === "quests" && !ui.suggestions) refreshSuggestions();
        // The EXP-by-month list at the foot of the Stats page comes from the
        // server's journal, not from local state, so opening the page is the
        // moment to go and get it rather than wait for the next sync.
        if (ui.page === "stats" && !ui.expMonths) reconcileExpWithServer();
        break;
      case "refresh-leaderboard":
        refreshLeaderboard();
        break;

      case "accept-suggestion": {
        const id = el.dataset.id;
        const s = ((ui.suggestions && ui.suggestions.items) || []).find((x) => x.id === id);
        if (!s) break;
        // No evaluation call: the value came with the suggestion, recorded
        // server-side when it was drawn up, so a journal entry against it
        // verifies exactly like one from a task the person wrote themselves.
        runGameAction((draft) => {
          SYS.addTask(draft, {
            title: s.title,
            priority: "Medium",
            taskType: s.kind === "habit" ? "Recurring" : "Medium Term",
            types: s.types || [],
            pt: s.pt,
            mode: "simple",
            notes: s.description || "",
            recurring: s.kind === "habit",
            schedule: Object.assign(blankSchedule(), scheduleFromWeeklyCount(s.repeatsPerWeek)),
            unit: s.unit || "reps",
            targetAmount: s.targetAmount || 1,
            traitTargets: s.traitTargets || [],
            priceId: s.priceId,
          });
          return [];
        });
        markSuggestionHandled(id);
        addToast({ kind: "info", text: SYS.t("suggest.accepted", { title: s.title }) });
        break;
      }
      case "dismiss-suggestion":
        markSuggestionHandled(el.dataset.id);
        break;

      case "reload-app":
        location.reload();
        break;
      // Also fires when the body of a notification is clicked — see
      // renderNotifStack. Somebody who has finished reading should be able to
      // clear it rather than wait out a timer sized for someone slower.
      case "dismiss-toast":
        dismissToast(Number(el.dataset.id));
        break;
      case "set-quest-filter":
        ui.questFilter = el.dataset.filter;
        renderPageInto();
        break;
      // Which habit the whole Stats page is answering about. An empty id is
      // "All" — stored as null rather than "" so nothing can mistake it for
      // a habit whose id happens to be falsy.
      // Tapping a day in the calendar opens what happened on it. Always all
      // habits, whatever the page is scoped to: the question a day asks is
      // "what did I do", and narrowing that to one habit would make it a
      // worse answer than the calendar already gives.
      case "set-compare-span":
        if (!["week", "month", "year"].includes(el.dataset.span)) return;
        ui.compareSpan = el.dataset.span;
        renderPageInto();
        break;
      case "toggle-compare-table":
        ui.compareTable = !ui.compareTable;
        renderPageInto();
        break;
      case "open-day": {
        const day = el.dataset.day;
        if (!day || day > SYS.todayKey()) return;
        ui.dayKey = day;
        ui.modal = "day";
        renderModalInto();
        break;
      }
      case "close-day":
        ui.modal = null; ui.dayKey = null;
        renderModalInto();
        break;
      case "close-day-backdrop":
        if (e.target.closest("[data-stop-close]")) return;
        ui.modal = null; ui.dayKey = null;
        renderModalInto();
        break;
      case "shift-day-sheet": {
        const delta = Number(el.dataset.delta);
        if (!Number.isFinite(delta)) return;
        const next = SYS.shiftDay(ui.dayKey || SYS.todayKey(), delta);
        // Forwards stops at today, which is also where the arrow greys out.
        if (next > SYS.todayKey()) return;
        ui.dayKey = next;
        renderModalInto();
        break;
      }
      case "set-stats-scope":
        ui.statsScope = el.dataset.id || null;
        // A month you navigated to for one habit is rarely the month you want
        // for the next, and the year picker belongs to whatever is on screen.
        ui.statsMonthOffset = 0;
        ui.statsYear = null;
        renderPageInto();
        break;
      case "archive-habit": {
        const task = state.tasks.find((x) => x.id === id);
        if (!task) return;
        // Archiving stops the future and leaves the past alone: from today
        // the habit is not asked for, and every day before today counts
        // exactly as it already did. Recorded as a day rather than a flag so
        // the history can say when it stopped being asked for.
        runGameAction((draft) => {
          const t = draft.tasks.find((x) => x.id === id);
          if (t) { t.archived = true; t.archivedAt = SYS.todayKey(); }
          return [{ kind: "info", text: SYS.t("stats.archivedToast", { title: task.title }) }];
        });
        break;
      }
      case "unarchive-habit":
        runGameAction((draft) => {
          const t = draft.tasks.find((x) => x.id === id);
          if (t) { delete t.archived; delete t.archivedAt; }
          return [];
        });
        break;
      case "set-stats-month-offset":
        ui.statsMonthOffset = el.dataset.delta === "reset" ? 0 : ui.statsMonthOffset + Number(el.dataset.delta);
        renderPageInto();
        break;

      default:
        break;
    }
  });

  // If the app is left open across midnight, recurring-habit week counts and
  // the stats page are otherwise only recomputed on the next click — this
  // makes that happen on its own, right at the day boundary.
  function scheduleNextDayRollover() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    setTimeout(() => {
      renderAppInto();
      scheduleNextDayRollover();
    }, next - now);
  }

  // ---------------- new version available ----------------
  //
  // The worker calls skipWaiting(), so a new version takes charge as soon as
  // it installs — but the JavaScript already running in this tab is still the
  // old copy, and stays old until the page is reloaded. Without a prompt,
  // someone can sit on a superseded version indefinitely and never know; the
  // only reason anyone reloaded before was that something had visibly broken.
  //
  // `controllerchange` fires whenever a worker takes control, including the
  // very first claim on a first-ever visit — which is an install, not an
  // update. Hence capturing the existing controller now, before registration
  // can change it: no controller at load means nothing was replaced.
  //
  // It asks rather than reloading by itself. A reload throws away whatever is
  // on screen — a half-written quest, a running habit timer — and doing that
  // to someone unasked, to deliver a change they didn't request, isn't a
  // trade worth making.
  function watchForUpdates() {
    if (!("serviceWorker" in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller;
    let announced = false;

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || announced) return;
      announced = true;
      addToast({
        kind: "update",
        text: SYS.t("update.available"),
        sticky: true,
        action: { name: "reload-app", label: SYS.t("update.reload") },
      });
    });

    // Browsers only look for a new worker on navigation, so a tab left open
    // for days would never find out about one. Checking when it comes back to
    // the foreground is the same moment the app already re-reads the cloud
    // copy, and costs a conditional request.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      navigator.serviceWorker.getRegistration()
        .then((reg) => { if (reg) reg.update(); })
        .catch(() => {});
    });
  }

  // ---------------- boot ----------------
  //
  // A throw anywhere in here used to leave the page sitting on its
  // "SYSTEM INITIALIZING..." placeholder forever, with nothing to distinguish
  // a crash from a slow connection and the actual reason visible only in a
  // console most people never open. That is the worst failure this app can
  // have: it looks identical to a hang, and it gives whoever hit it nothing
  // to report back.
  //
  // Deliberately dependency-free: no SYS.t, no theme variables, no render
  // helpers, inline styles only. A screen whose job is to explain that
  // something broke must not be built out of the parts that might be what
  // broke — including the translation table, which is why this one line of
  // the app is English-only.
  function bootFailed(err) {
    console.error("[TheSystem] boot failed", err);
    const detail = err && (err.stack || err.message) ? String(err.stack || err.message) : String(err);
    $page.innerHTML =
      '<div style="max-width:640px;margin:40px auto;padding:24px;border:1px solid #c66a45;border-radius:18px;font-family:system-ui,sans-serif;">' +
      '<div style="font-size:16px;font-weight:600;color:#c66a45;margin-bottom:10px;">The app failed to start</div>' +
      '<div style="font-size:13px;line-height:1.6;margin-bottom:14px;opacity:.8;">' +
      'Your saved data is untouched — this is a display failure, not a data one. ' +
      'Send a screenshot of the message below.</div>' +
      '<pre style="font-family:ui-monospace,monospace;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-word;padding:12px;border-radius:10px;background:rgba(128,128,128,.12);margin:0 0 14px;">' +
      detail.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])) +
      '</pre>' +
      '<button onclick="location.reload()" style="font:inherit;font-size:13px;padding:8px 16px;border-radius:99px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer;">Reload</button>' +
      '</div>';
  }

  // Boot almost never fails for a reason that is still true a second later.
  // The realistic cause is one script that did not execute — a deploy rollout
  // answered with an error page in place of a file, or a cached copy is from a
  // different build than the ones around it. Both clear up by dropping every
  // cached copy and loading again, which is precisely what a person is doing
  // when they refresh a second time and it works.
  //
  // Once, and only once: the flag sits in sessionStorage, so a crash that is
  // genuinely reproducible shows its error screen on the second attempt
  // instead of trapping the browser in a reload loop. A successful boot clears
  // it, so an unrelated failure weeks later still gets its own retry.
  const RECOVERY_FLAG = "the-system:boot-recovery";
  // Private modes can make sessionStorage throw. Reading a failure as "already
  // tried" is the safe direction — it costs a retry, where the opposite would
  // cost an endless loop.
  function recoveryTried() {
    try { return !!sessionStorage.getItem(RECOVERY_FLAG); } catch (e) { return true; }
  }
  function markRecovery(on) {
    try { on ? sessionStorage.setItem(RECOVERY_FLAG, "1") : sessionStorage.removeItem(RECOVERY_FLAG); } catch (e) {}
  }

  function recoverOnce(err) {
    if (recoveryTried()) return false;
    markRecovery(true);
    console.warn("[TheSystem] boot failed — clearing caches and retrying once", err);

    let reloaded = false;
    const reload = () => { if (!reloaded) { reloaded = true; location.reload(); } };
    // Never wait on the cleanup indefinitely; a reload that happens anyway is
    // better than a splash screen that stays put because a promise hung.
    setTimeout(reload, 3000);

    Promise.resolve()
      .then(() => (window.caches ? caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))) : null))
      .then(() => (navigator.serviceWorker
        ? navigator.serviceWorker.getRegistrations().then((rs) => Promise.all(rs.map((r) => r.unregister())))
        : null))
      .then(reload, reload);

    return true;
  }

  try {
    applyLanguage();
    applyThemeAttribute();
    // Before the first render, so a session left running shows on its card
    // rather than appearing after a redraw.
    // The sound engine reports when a file starts or stops downloading, so
    // the picker can show it without polling.
    SYS.onSoundState = function () { if (ui.modal === "timer") renderModalInto(); };
    restoreTimer();
    renderAppInto();
    if (pendingCountdownFinish) { pendingCountdownFinish = false; finishCountdown(); }
    renderNotifInto();
    renderRankupInto();
    renderModalInto();
    scheduleNextDayRollover();
    watchForUpdates();
    // Said once, on the load that did it, rather than written into the log.
    // The log is the person's own record; this is the app explaining itself,
    // and putting it in there is what made the two copies disagree for ever.
    bootMigration.notes.forEach((text) => addToast({ kind: "info", text }));
    maybePlayBrandOnLaunch();
    markRecovery(false);
  } catch (err) {
    if (!recoverOnce(err)) bootFailed(err);
  }
})(window.SYS = window.SYS || {});

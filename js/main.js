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
    // Curve 3 for a document that says so, curve 2 for one saved after ranks
    // got their own level costs, and curve 1 — a flat hundred a level — for
    // anything older than that, which is what the schema version used to mean.
    const savedPlayer = (s && s.player) || null;
    const savedCurve = savedPlayer && Number(savedPlayer.curve)
      ? Number(savedPlayer.curve)
      : (savedPlayer ? ((Number(s.schema) || 1) >= 2 ? 2 : 1) : SYS.LEVEL_CURVE);
    out.player = { ...SYS.defaultState().player, ...(out.player || {}) };
    out.player.traitComposition = out.player.traitComposition && typeof out.player.traitComposition === "object" ? out.player.traitComposition : {};
    out.intTypes = syncDefaultIntTypeColors(
      Array.isArray(out.intTypes) && out.intTypes.length ? out.intTypes : SYS.DEFAULT_INT_TYPES.map((t) => ({ ...t }))
    );
    out.levelHistory = Array.isArray(out.levelHistory) ? out.levelHistory : [];
    // Awards recorded as [type, traitId] pairs made every save fail — see
    // awardOf in engine.js.
    // Before anything reads the standing: a document written when levels cost
    // something else says a rank and level that no longer mean that much EXP.
    //
    // Which curve it was written under has to be decided from the saved copy,
    // not from `out`: the default player carries the current curve, and the
    // merge above spreads it over every old document — which is exactly the
    // bug this line had at first. Reading it beforehand keeps an old document
    // recognisably old.
    out.player.curve = savedCurve;
    if (SYS.migrateLevelCurve(out)) note("level costs changed — your standing was recalculated from the same EXP");
    if (SYS.migrateAwardedTraits(out.levelHistory)) rep.migrated = true;
    // Only the newest records are kept, or the document outgrows Firestore's
    // limit — see LEVEL_HISTORY_KEEP in engine.js.
    if (SYS.trimLevelHistory(out)) rep.migrated = true;
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
      // One reminder time becomes a list of them, with an optional message.
      if (SYS.migrateReminders(task)) rep.migrated = true;
      // A quest big enough to ask about keeps what it earned before the
      // question existed — the server grandfathers the same amount.
      if (SYS.ensureGateSeen(task)) rep.migrated = true;
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

    // A planner inside a saved state is from before it was kept on its own:
    // its items are handed over (only ids never seen here) and it leaves the
    // state. main.js puts the live planner back after every load.
    if (out.planner) {
      if (SYS.PlannerSync) SYS.PlannerSync.absorbLegacy(out.planner);
      delete out.planner;
      rep.migrated = true;
    }

    // The standing conversion that used to live here, keyed on this schema
    // bump, is now migrateLevelCurve above: the flat-hundred era is simply
    // curve 1, and one mechanism for "the level cost changed" cannot disagree
    // with itself the way two did. The bump stays, because the schema number
    // is what the step below is keyed on.
    if ((Number(out.schema) || 1) < 2) {
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
  state.planner = SYS.PlannerSync.view();

  // The saved state without the planner, for comparing two copies of it: the
  // planner is not in the stored copy, and syncs by itself.
  function stateOnly(s) {
    const { planner, ...rest } = s || {};
    return rest;
  }

  const ui = {
    page: "overview",
    // The planner's day (null follows today across midnight), the text being
    // typed into its add box, the item being renamed, and which leftovers are
    // ticked in the morning question.
    plannerDay: null,
    plannerView: "day",
    eventForm: null,
    eventView: null,
    eventMove: null,
    // The profile being looked at, and what is open on it.
    profileUid: null,
    profile: null,
    profileRank: null,
    profileError: null,
    profileEdit: null,
    profileReport: null,
    profileReportSent: false,
    profileBlockBusy: false,
    blocks: new Set(),
    blockedList: null,
    unblockBusy: null,
    // Friends: the live list of friendships and requests, the ranking rows
    // of everyone in it, and what is open on the Friends tab.
    lbTab: "world",
    friendships: [],
    friendRows: {},
    myRow: null,
    friendRequestsIn: 0,
    friendsWeek: false,
    friendAddName: "",
    friendBusy: false,
    inviteBusy: false,
    inviteLink: null,
    compareUid: null,
    compare: null,
    adminReports: [],
    adminReportBusy: false,
    plannerDraft: "",
    plannerEdit: null,
    carrySel: null,
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
    taskForm: null,
    armed: null,
    nameEditing: false,
    __nameDraft: null,
    modal: null,
    settingsDraft: null,
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

  // Two kinds of entry share the queue. A priced task sends what happened to
  // it (`report`) and the server decides the EXP; a task with no price —
  // left over from before prices were recorded — still sends its own delta,
  // which counts as unverified.
  SYS.onExpDelta = function (delta, source, meta) {
    if (!delta) return;
    const src = String(source || "").slice(0, 80);
    const priced = meta && typeof meta.priceId === "string" && meta.priceId && meta.progress;
    const entry = priced
      ? { report: { ...meta.progress, priceId: meta.priceId, source: src } }
      : { delta, source: src };
    expQueue.push(entry);
    SYS.Storage.saveExpQueue(expQueue);
    scheduleExpFlush();
  };

  // A report with no EXP attached — see reportProgress in engine.js.
  SYS.onProgressReport = function (meta, source) {
    if (!meta || !meta.priceId || !meta.progress) return;
    expQueue.push({ report: { ...meta.progress, priceId: meta.priceId, source: String(source || "").slice(0, 80) } });
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
    const sent = new Set(sending);
    // Entries queued by an older version may carry a priceId next to their
    // delta. The rules refuse those now, so they go as plain unverified deltas.
    const deltas = sending.filter((e) => !e.report).map((e) => ({ delta: e.delta, source: e.source }));
    const reports = sending.filter((e) => e.report).map((e) => e.report);
    const dropWhere = (test) => {
      expQueue = expQueue.filter((e) => !test(e));
      SYS.Storage.saveExpQueue(expQueue);
    };
    expFlushing = true;
    // Deltas first, and taken off the queue as soon as they land: they are
    // not safe to send twice, and a report failing after them must not put
    // them back up for a retry. Reports are safe to repeat.
    SYS.Cloud.appendExpEvents(deltas)
      .then(() => {
        dropWhere((e) => sent.has(e) && !e.report);
        return sendProgressReports(reports);
      })
      .then(() => {
        dropWhere((e) => sent.has(e));
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
          dropWhere((e) => sent.has(e) && !e.report);
          return;
        }
        // Anything else is a transient failure. Left in the queue on purpose:
        // a dropped connection must not silently cost someone their standing,
        // and a retry is free at the next opportunity.
        console.warn("[TheSystem] exp journal upload failed, will retry", err);
      })
      .then(() => { expFlushing = false; });
  }

  // ---------------- when a task opens ----------------
  //
  // The server decides, and sends back a moment per task (unlockTimes). The
  // app never sees the estimated hours behind it — knowing them would tell
  // somebody exactly what to claim — so everything here works from the moment
  // alone. A refusal is still the server's to make; this only keeps a person
  // from pressing something that was never going to count.
  let unlockTimer = null;
  function unlockOf(t) {
    return (t && t.priceId && ui.unlocks && ui.unlocks[t.priceId]) || null;
  }
  function lockedNow(t) {
    const u = unlockOf(t);
    return !!(u && u.locked);
  }
  // "today at 14:00" / "tomorrow at 03:00" / "18 Sep at 09:30"
  function unlockText(u) {
    if (!u || !u.day) return "";
    const hh = String(Math.floor(u.minutes / 60)).padStart(2, "0");
    const mm = String(u.minutes % 60).padStart(2, "0");
    const clock = hh + ":" + mm;
    const today = SYS.todayKey();
    if (u.day === today) return SYS.t("task.opensToday", { t: clock });
    if (u.day === SYS.shiftDay(today, 1)) return SYS.t("task.opensTomorrow", { t: clock });
    return SYS.t("task.opensOn", { d: SYS.dayLabel ? SYS.dayLabel(u.day) : u.day, t: clock });
  }
  SYS.unlockOf = unlockOf;
  SYS.lockedNow = lockedNow;
  SYS.unlockText = unlockText;

  // Asked for on the pages that show tasks, and again after anything is
  // recorded — finishing one task can push another one out, since they share
  // the same day.
  function refreshUnlocks(immediate) {
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.cloudUser || !SYS.Cloud.callUnlockTimes) return;
    if (unlockTimer) clearTimeout(unlockTimer);
    const ask = () => {
      const ids = [];
      (state.tasks || []).forEach((t) => {
        if (!t.priceId || ids.includes(t.priceId)) return;
        if (!t.recurring && (Number(t.completion) || 0) >= 100) return; // nothing left to record
        ids.push(t.priceId);
      });
      if (!ids.length) return;
      SYS.Cloud.callUnlockTimes(ids.slice(0, 100)).then((res) => {
        ui.unlocks = (res && res.unlocks) || {};
        renderPageInto();
      }).catch(() => {});
    };
    // Adding or editing a task asks at once; a burst of completions waits a
    // moment, since they arrive in threes and share one answer.
    if (immediate) ask(); else unlockTimer = setTimeout(ask, 250);
  }

  // Where each big quest's answers stand, from the server. Only a change is
  // worth a game action: it saves, and it may release EXP.
  let reflectTimer = null;
  function refreshReflections() {
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.cloudUser || !SYS.Cloud.callReflectionStatus) return;
    if (reflectTimer) clearTimeout(reflectTimer);
    reflectTimer = setTimeout(() => {
      const ids = [];
      (state.tasks || []).forEach((t) => { if (SYS.isGatedTask(t) && !ids.includes(t.priceId)) ids.push(t.priceId); });
      if (!ids.length) return;
      SYS.Cloud.callReflectionStatus(ids.slice(0, 100)).then((res) => {
        const byPrice = (res && res.reflections) || {};
        if (SYS.reflectionsDiffer(state, byPrice)) runGameAction((draft) => SYS.applyReflections(draft, byPrice));
      }).catch(() => {});
    }, 300);
  }

  function refreshAdminSuspicionQueue() {
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.isAdmin || !SYS.Cloud.fetchFlaggedAccounts) return;
    SYS.Cloud.fetchFlaggedAccounts().then((list) => {
      ui.adminFlagged = list;
      return SYS.Cloud.callResolveUsers(list.map((a) => a.uid || a.id))
        .then((res) => { ui.adminFlaggedUsers = res.users || {}; })
        .catch(() => { ui.adminFlaggedUsers = {}; });
    }).then(() => { if (ui.page === "admin") renderPageInto(); }).catch(() => {});
  }

  function refreshAdminReflectionQueue() {
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.isAdmin || !SYS.Cloud.fetchHeldReflections) return;
    SYS.Cloud.fetchHeldReflections().then((list) => {
      ui.adminReflections = list;
      return SYS.Cloud.callResolveUsers(list.map((r) => r.uid))
        .then((res) => { ui.adminReflectionUsers = res.users || {}; })
        .catch(() => { ui.adminReflectionUsers = {}; });
    }).then(() => { if (ui.page === "admin") renderPageInto(); }).catch(() => {});
  }

  // Pressing something that cannot count yet. Says when it will, rather than
  // doing nothing and looking broken.
  function refuseLocked(t) {
    if (!lockedNow(t)) return false;
    const when = unlockText(unlockOf(t));
    addToast({ kind: "info", text: when ? SYS.t("task.lockedUntil", { when }) : SYS.t("task.lockedSoon") });
    return true;
  }

  // Marking a habit day further back than SYS.HABIT_BACKFILL_DAYS pays
  // nothing on the server (functions/progress.js), so the controls refuse it
  // here and say why, instead of letting the day look counted until the next
  // reconcile quietly takes its EXP back. Clearing a day is never refused.
  function refuseOldDay(day) {
    if (SYS.canLogHabitDay(day || SYS.todayKey())) return false;
    addToast({ kind: "info", text: SYS.t("habit.tooOld", { n: SYS.HABIT_BACKFILL_DAYS }) });
    return true;
  }

  // Reports are compacted before they go: for a quest only the latest
  // completion matters, and for a habit day only whether it ended done.
  // A report the server refused is not retried — it was refused on its
  // merits — and the EXP it would have paid is taken back by the reconcile
  // that follows every upload.
  function sendProgressReports(reports) {
    if (!reports.length) return Promise.resolve();
    const latest = new Map();
    reports.forEach((r) => latest.set(r.kind === "habit" ? r.priceId + "@" + r.day : r.priceId, r));
    const list = [...latest.values()];
    const chunks = [];
    for (let i = 0; i < list.length; i += 200) chunks.push(list.slice(i, i + 200));
    return chunks.reduce((chain, chunk) => chain.then(() =>
      SYS.Cloud.callRecordProgress(chunk).then((res) => {
        const refused = ((res && res.results) || []).filter((x) => x.status === "refused");
        if (refused.length) console.warn("[TheSystem] not counted: " + refused.map((x) => x.reason).join(", "));
        // A refusal for time is worth saying out loud: the EXP is about to be
        // taken back by the reconcile, and silence would look like a bug.
        const held = refused.find((x) => x.reason === "locked" || x.reason === "day-full");
        if (held) {
          const when = held.unlock ? unlockText({ day: held.unlock.dayKey, minutes: held.unlock.minutes }) : "";
          addToast({ kind: "info", text: held.reason === "day-full"
            ? SYS.t("task.dayFull")
            : (when ? SYS.t("task.lockedUntil", { when }) : SYS.t("task.lockedSoon")) });
        }
        // Always, not only after a refusal: finishing one task spends hours
        // that another task was counting on, so the moments move together.
        refreshUnlocks();
        // Progress may have reached a question.
        refreshReflections();
      })
    ), Promise.resolve());
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
  // Two copies that differ with no shared base to merge from: a device that
  // has never synced with this account (see onRemoteState for the merge that
  // handles every other case). It used to ask which copy to keep; it no
  // longer asks. The name is kept for its callers.
  function resolveOrAsk(cloudState, opts) {
    // Never asked any more: the account's copy is the one. The person asked
    // for this outright — nobody signs in wanting the account replaced by
    // whatever a device did signed out.
    const o = opts || {};
    // One exception is not a choice at all: this device made a change after
    // the account's copy was written and a reload cut the save short. It is
    // simply ahead, and its copy goes up.
    if (o.deviceIsNewer && SYS.Cloud.hasSyncedHere && SYS.Cloud.hasSyncedHere()) {
      SYS.Cloud.push(state);
      return;
    }
    // Progress made here before this device ever synced with this account is
    // left behind — and so is the EXP it queued for the journal, which would
    // otherwise add to the account points it never earned.
    if (!(SYS.Cloud.hasSyncedHere && SYS.Cloud.hasSyncedHere())) {
      expQueue = [];
      SYS.Storage.saveExpQueue(expQueue);
    }
    applyRemoteState(cloudState);
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

  // A disagreement is only corrected once it holds still. The server folds
  // each event into the total in a background step that can take longer than
  // the few seconds this used to wait — longer still when it is starting up —
  // and one read taken mid-way "corrected" a standing that was right, by an
  // amount nothing ever put back. So the total is read twice, a little apart,
  // and only a figure that did not move between the reads, against a local
  // standing that did not move either, is acted on. A figure still moving is
  // looked at again shortly, a few times.
  //
  // A standing that just arrived from another device is left alone for a
  // moment too: its EXP may still be on its way to the server from there.
  const RECONCILE_CONFIRM_MS = 6000;
  let lastRemoteAdoptAt = 0;
  function reconcileExpWithServer(attempt) {
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.cloudUser) return;
    const tries = Number(attempt) || 0;
    const retry = () => { if (tries < 4) setTimeout(() => reconcileExpWithServer(tries + 1), RECONCILE_CONFIRM_MS); };
    // Anything of ours still unsent means the server is legitimately behind,
    // not that we are ahead dishonestly. Correcting now would delete real
    // work done offline — the one mistake this must never make.
    if (expQueue.length || expFlushing) return;

    SYS.Cloud.fetchExpSummary().then((summary) => {
      if (!summary) return;
      ui.expMonths = summary.months;
      if (ui.page === "stats") renderPageInto();
      const firstTotal = summary.total;
      if (firstTotal == null) return;
      const localAtFirst = SYS.totalExp(state.player);
      if (firstTotal === localAtFirst) return;
      setTimeout(() => {
        if (expQueue.length || expFlushing) return;
        SYS.Cloud.fetchExpSummary().then((again) => {
          if (!again || again.total == null) return;
          const local = SYS.totalExp(state.player);
          if (again.total === local) return;
          const settled = again.total === firstTotal && local === localAtFirst && !expQueue.length && !expFlushing;
          if (!settled || Date.now() - lastRemoteAdoptAt < 2 * RECONCILE_CONFIRM_MS) { retry(); return; }
          console.warn("[TheSystem] correcting local EXP by " + (again.total - local) + " to match the journal");
          runGameAction((draft) => SYS.reconcileExpTo(draft, again.total, SYS.t("sync.corrected")));
        }).catch(() => {});
      }, RECONCILE_CONFIRM_MS);
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
  // The planner's hours scroll inside their own box. A re-render (ticking a
  // to-do, a sync) keeps that box where it was; a different day opens on the
  // part of the day worth seeing.
  function renderPageInto() {
    const was = $page.querySelector(".tl-scroll");
    const kept = was ? { day: was.dataset.day, top: was.scrollTop } : null;
    $page.innerHTML = SYS.renderPage(state, ui);
    const tl = $page.querySelector(".tl-scroll");
    if (tl) tl.scrollTop = kept && kept.day === tl.dataset.day ? kept.top : timelineStart(tl.dataset.day);
  }
  function timelineStart(day) {
    const timed = SYS.eventsOn(state, day).filter((o) => !o.allDay);
    const minutes = day === SYS.todayKey() ? (new Date().getHours() - 1) * 60
      : timed.length ? SYS.minutesOf(timed[0].from) - 30
      : 8 * 60;
    return Math.max(0, minutes / 60 * SYS.PLANNER_HOUR_PX);
  }
  function renderAppInto() { renderSidebarInto(); renderStatusbarInto(); renderPageInto(); }
  function renderModalInto() {
    $modal.innerHTML = SYS.renderModalLayer(state, ui);
    // Fresh markup scrolls to the top, which would show every wheel at 00.
    if (ui.modal === "time") placeWheels();
  }

  // Reminders are only as useful as the times on the habits, so the section
  // can say when there are none — permission granted and nothing set is a
  // silent dead end otherwise.
  function refreshRemindCount() {
    ui.remindCount = state.tasks.filter((t) => t.recurring && SYS.reminderTimes(t).length).length +
      ((state.planner && state.planner.events) || []).filter((ev) => ev.reminders && ev.reminders.length).length;
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

  // At most this many notifications on screen. One action can raise half a
  // dozen — the EXP, a level, the points it bought — and uncapped they covered
  // the side of the screen. The newest stay and the oldest give way; one that
  // repeats a notification already showing is counted on it instead of
  // stacking a copy. Sticky ones (a failed save, a new version) are never the
  // ones pushed out.
  const MAX_TOASTS = 3;
  const toastTimers = new Map();
  function dismissToast(id) {
    const key = Number(id);
    clearTimeout(toastTimers.get(key));
    toastTimers.delete(key);
    ui.toasts = ui.toasts.filter((x) => x.id !== key);
    renderNotifInto();
  }

  function addToast(n) {
    const same = !n.sticky && !n.action &&
      ui.toasts.find((x) => !x.sticky && !x.action && x.kind === n.kind && x.text === n.text);
    if (same) {
      same.count = (same.count || 1) + 1;
      clearTimeout(toastTimers.get(same.id));
      toastTimers.set(same.id, setTimeout(() => dismissToast(same.id), toastDuration(n.text)));
      renderNotifInto();
      return;
    }
    const id = ++toastSeq;
    ui.toasts.push({ ...n, id });
    while (ui.toasts.length > MAX_TOASTS) {
      const oldest = ui.toasts.find((x) => !x.sticky);
      if (!oldest) break;
      clearTimeout(toastTimers.get(oldest.id));
      toastTimers.delete(oldest.id);
      ui.toasts = ui.toasts.filter((x) => x !== oldest);
    }
    renderNotifInto();
    // A sticky notification waits to be dealt with instead of timing out.
    // Used for the new-version prompt: an announcement that disappears after
    // four seconds is one most people will never happen to be looking at.
    if (!n.sticky) toastTimers.set(id, setTimeout(() => dismissToast(id), toastDuration(n.text)));
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
  // ---- reminder time wheels (ui.renderTimeSheet) ----
  // Row height in px; the CSS sets the same value as --tw-row. Item i sits in
  // the middle band when the column is scrolled to i rows.
  const TW_ROW = 44;
  // `slot` is the index of the time being changed, or "new" to add one.
  function openTimeSheet(slot) {
    const times = (ui.taskForm && ui.taskForm.reminders) || [];
    const current = slot === "new" ? "" : times[Number(slot)];
    const m = /^(\d\d):(\d\d)$/.exec(current || "");
    const now = new Date();
    ui.timeDraft = m ? { h: Number(m[1]), m: Number(m[2]) } : { h: now.getHours(), m: now.getMinutes() };
    ui.timeSlot = m ? String(Number(slot)) : "new";
    ui.modal = "time";
    renderModalInto();
    const first = document.querySelector(".tw-col");
    if (first) first.focus({ preventScroll: true });
  }
  // Opened from an event's form, the sheet goes back to that form: closing
  // it is "never mind this time", not "never mind this event".
  function closeTimeSheet() {
    ui.modal = ui.timeFor ? "eventForm" : null;
    ui.timeDraft = null; ui.timeSlot = null; ui.timeFor = null; ui.timeTitle = null;
    renderModalInto();
  }
  function openEventTimeSheet(which) {
    const f = ui.eventForm;
    if (!f) return;
    const m = /^(\d\d):(\d\d)$/.exec(f[which] || "");
    ui.timeDraft = m ? { h: Number(m[1]), m: Number(m[2]) } : { h: 9, m: 0 };
    ui.timeFor = which;
    ui.timeTitle = SYS.t(which === "to" ? "event.to" : "event.from");
    ui.modal = "time";
    renderModalInto();
    const first = document.querySelector(".tw-col");
    if (first) first.focus({ preventScroll: true });
  }
  function placeWheels() {
    document.querySelectorAll(".tw-col").forEach((col) => {
      col.scrollTop = (Number(col.dataset.count) + ui.timeDraft[col.dataset.tw]) * TW_ROW;
      markWheel(col);
    });
  }
  // Highlights the row in the band and records its value as the draft.
  //
  // Touches the page only when the row in the band changes. It runs for every
  // frame of a spin, and it used to rewrite the two aria attributes on every
  // scroll event whether anything had changed or not — each one a style
  // recalculation and an accessibility update in the middle of the scroll.
  function markWheel(col) {
    const count = Number(col.dataset.count);
    const i = Math.round(col.scrollTop / TW_ROW);
    if (col._twSel === i) return i;
    const v = ((i % count) + count) % count;
    const items = col.children;
    if (items[col._twSel]) items[col._twSel].classList.remove("sel");
    if (items[i]) items[i].classList.add("sel");
    col._twSel = i;
    if (ui.timeDraft) ui.timeDraft[col.dataset.tw] = v;
    col.setAttribute("aria-valuenow", v);
    col.setAttribute("aria-valuetext", String(v).padStart(2, "0"));
    return i;
  }
  // Once a spin comes to rest, jump to the same number in the middle copy so
  // the wheel can keep turning either way: same digits, same place on screen.
  function settleWheel(col) {
    const count = Number(col.dataset.count);
    const i = markWheel(col);
    if (i < count || i >= count * 2) {
      col.scrollTop = (count + (((i % count) + count) % count)) * TW_ROW;
      markWheel(col);
    }
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
    SYS.PlannerSync.commit(state.planner);
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
  // Adding to the index is not possible from the app at all; see
  // renderIntelligencePage. Removing a trait the seed does not include is
  // still the admin's, for accounts that gained one before that was closed.
  const INDEX_EDITS = new Set(["remove-trait"]);

  const ARMABLE = new Set(["delete-task", "planner-delete", "event-delete", "friend-remove-armed", "remove-trait", "delete-task-from-form", "reset-data", "admin-grant-admin", "admin-revoke-admin"]);

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
          : details && details.code === "not-allowed" ? refusalText(err)
          : (err.message || SYS.t("name.taken")),
      });
    });
  }

  // Replaces the whole app state with one pulled from the cloud (initial
  // sign-in reconciliation, or a newer copy found on focus-regain). Saves it
  // locally too but deliberately does NOT push back to the cloud — that
  // would just be echoing back what we were given.
  function applyRemoteState(newState) {
    // This device's copy is being replaced, so whatever it had not saved is
    // no longer anything to save.
    if (SYS.Cloud && SYS.Cloud.clearUnsaved) SYS.Cloud.clearUnsaved();
    if (SYS.Cloud && SYS.Cloud.markSyncedHere) SYS.Cloud.markSyncedHere();
    state = normalizeState(newState, migrationReport());
    SYS.Storage.save(state);
    // This is now the copy both sides share.
    if (SYS.Cloud && SYS.Cloud.setBase) SYS.Cloud.setBase(state);
    state.planner = SYS.PlannerSync.view();
    applyLanguage();
    applyThemeAttribute();
    renderAppInto();
    maybeAskCarry();
  }

  // Applies any admin-authorized EXP grants (appeal corrections, bonuses/
  // penalties — see functions/index.js) waiting in this user's own
  // pendingGrants subcollection. Each one is run through the real,
  // unmodified SYS.applyExpDelta exactly as if it were a normal quest, so
  // level-ups/skill points/undo history all come out correct for free —
  // see the plan doc "Why pendingGrants" for why this doesn't just write
  // the resulting numbers directly.
  // Grants arrive by two routes now — the live listener and the fetch on
  // sign-in and on return to the app — and the same grant can reach both
  // before its delete lands. Applying it twice would pay an appeal twice, so
  // each id is applied once per session whichever route brings it.
  const appliedGrantIds = new Set();
  function applyGrants(grants) {
    const fresh = grants.filter((g) => !appliedGrantIds.has(g.id));
    if (!fresh.length) return;
    fresh.forEach((g) => {
      appliedGrantIds.add(g.id);
      // Two kinds of grant: a flat EXP amount (bonus/penalty), or a task
      // repricing from a resolved appeal, which recomputes its own delta.
      if (g.repriceTask && g.repriceTask.taskId) {
        runGameAction((draft) => SYS.repriceTask(draft, g.repriceTask.taskId, g.repriceTask.newPt));
      } else {
        // An adjustment the server already wrote into the journal is applied
        // to this device's EXP without being reported a second time.
        const wasSuppressed = SYS.suppressExpJournal;
        if (g.journaled) SYS.suppressExpJournal = true;
        try {
          runGameAction((draft) => SYS.applyExpDelta(draft, g.amount, [], g.reason || "The System"));
        } finally {
          SYS.suppressExpJournal = wasSuppressed;
        }
      }
      SYS.Cloud.consumeGrant(g.id);
    });
    refreshMyAppeals(); // a resolved/rejected appeal's status may have just changed
    refreshInbox(); // an adjustment writes an inbox message alongside its grant
  }
  function applyPendingGrants() {
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.cloudUser) return;
    SYS.Cloud.fetchPendingGrants().then(applyGrants).catch(() => {});
  }
  let stopWatchingGrants = null;
  function watchGrants(signedIn) {
    if (stopWatchingGrants) { stopWatchingGrants(); stopWatchingGrants = null; }
    if (signedIn && SYS.Cloud.watchPendingGrants) stopWatchingGrants = SYS.Cloud.watchPendingGrants(applyGrants);
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
      // An account the suspicion check took off the ranking stays in the
      // collection — its standing is untouched — but is not shown. If it is
      // this person's own, they are told it is under review rather than left
      // wondering where they went.
      ui.leaderboard = rows.filter((r) => !r.hidden);
      ui.leaderboardUnderReview = rows.some((r) => r.uid === ui.cloudUser.uid && r.hidden);
      // Two extra round-trips are only worth it for someone who isn't in the
      // page we already have.
      if (ui.leaderboard.some((r) => r.uid === ui.cloudUser.uid)) {
        ui.leaderboardMine = null;
        ui.leaderboardMyPosition = null;
        return null;
      }
      return SYS.Cloud.fetchMyLeaderboardEntry()
        .then((mine) => {
          if (mine && mine.hidden) ui.leaderboardUnderReview = true;
          ui.leaderboardMine = mine && !mine.hidden ? mine : null;
          return ui.leaderboardMine ? SYS.Cloud.fetchMyRank(mine.totalExp) : null;
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
    refreshAdminReflectionQueue();
    refreshAdminSuspicionQueue();
    refreshAdminReports();
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

  // Firebase's own sign-in errors are written for developers
  // ("auth/invalid-credential ... malformed or has expired") and in English
  // whatever the app's language. The common ones are said plainly instead,
  // with what to do next. One code covers a wrong password, an unknown email
  // and a Google-only account alike — Firebase deliberately won't say which —
  // so the message names all three ways out.
  const ACCOUNT_ERRORS = {
    "auth/invalid-credential": "account.badCredential",
    "auth/invalid-login-credentials": "account.badCredential",
    "auth/wrong-password": "account.badCredential",
    "auth/user-not-found": "account.badCredential",
    "auth/email-already-in-use": "account.emailInUse",
    "auth/weak-password": "account.weakPassword",
    "auth/invalid-email": "account.badEmail",
    "auth/missing-email": "account.badEmail",
    "auth/too-many-requests": "account.tooMany",
    "auth/network-request-failed": "account.offline",
  };
  function accountErrorText(err) {
    const key = ACCOUNT_ERRORS[err && err.code];
    return key ? SYS.t(key) : (err && err.message) || "Something went wrong.";
  }

  // An admin notification points at "#admin". Whether this account may see
  // that page is only known once the server has answered, so the request is
  // held until then rather than acted on — or dropped — at load.
  let openAdminWhenReady = location.hash === "#admin";
  function openAdminIfAsked() {
    if (!openAdminWhenReady || !ui.isAdmin) return;
    openAdminWhenReady = false;
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    ui.page = "admin";
    renderSidebarInto();
    renderPageInto();
    refreshAdminAppealQueue();
  }

  if (SYS.Cloud) {
    SYS.Cloud.init();
    SYS.Cloud.checkRedirectResult().catch((err) => {
      addToast({ kind: "info", text: (err && err.message) || "Google sign-in didn't complete." });
    });
    SYS.Cloud.onAuthChange((user) => {
      ui.cloudUser = user ? { email: user.email, uid: user.uid, emailVerified: user.emailVerified } : null;
      ui.isAdmin = false;
      watchGrants(!!user);
      if (ui.modal === "settings") renderModalInto();
      if (!user) {
        SYS.PlannerSync.detach();
        if (stopWatchingState) { stopWatchingState(); stopWatchingState = null; }
        watchFriends(false);
        renderSidebarInto();
        return;
      }
      // Before the account's state is pulled: a planner still inside that
      // state is handed to this account's items, not a previous one's.
      SYS.PlannerSync.attach(user.uid, onPlannerFromServer);
      SYS.Cloud.checkIsAdmin().then((isAdmin) => { ui.isAdmin = isAdmin; renderSidebarInto(); openAdminIfAsked(); }).catch(() => {});
      SYS.Cloud.isMyNameClaimed(state.player.name).then((held) => {
        ui.nameClaimed = held;
        if (ui.modal === "settings") renderModalInto();
      }).catch(() => {});
      applyPendingGrants();
      refreshMyAppeals();
      refreshInbox();
      refreshBlocks();
      watchFriends(true);
      takePendingInvite();
      flushExpQueue(); // anything queued while signed out or offline
      // The server's copy of this device's push address can be gone while the
      // browser still says reminders are on — see push.js.
      if (SYS.resavePushSubscription) SYS.resavePushSubscription();
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
        } else if (SYS.deepEqual(cloudState, stateOnly(state))) {
          // Identical *after normalising* — which is exactly the case a
          // migration produces: both copies gained the same field on the way
          // in, so they agree in memory while the stored one is still without
          // it. Nothing here would ever write it back, and the evaluator reads
          // the stored copy, so it would keep choosing traits from a list one
          // short. Push once when this load changed anything.
          if (bootMigration.migrated || cloudReport.migrated) SYS.Cloud.push(state);
          // Nothing is waiting to land, whatever a mark left behind says.
          else if (SYS.Cloud.clearUnsaved) SYS.Cloud.clearUnsaved();
          // The two copies agree: this device is in step with the account.
          if (SYS.Cloud.markSyncedHere) SYS.Cloud.markSyncedHere();
          SYS.Cloud.setBase(cloudState);
        } else if (SYS.Cloud.getBase && SYS.Cloud.getBase()) {
          // In step before: whatever differs is merged, never asked about.
          onRemoteState(raw);
        } else if (!SYS.deepEqual(cloudState, stateOnly(state))) {
          // Cloud has something different from what's already here. That is
          // not automatically a question worth asking — see resolveOrAsk.
          // One case is known outright: this device made a change after the
          // stored copy was last written, and the change never landed — a
          // reload inside the save's short wait. The device is simply ahead.
          // And the commonest case of all: this device holds nothing unsaved
          // and has been in step with this account before, so another device
          // simply moved on — a switch from the phone to the laptop.
          const unsaved = SYS.Cloud.unsavedSince ? SYS.Cloud.unsavedSince() : null;
          const storedAt = SYS.Cloud.storedUpdatedAt ? SYS.Cloud.storedUpdatedAt() : null;
          const syncedHere = SYS.Cloud.hasSyncedHere ? SYS.Cloud.hasSyncedHere() : false;
          resolveOrAsk(cloudState, {
            deviceIsNewer: !!(unsaved && storedAt && unsaved > storedAt),
            deviceBehind: !unsaved && syncedHere,
          });
        }
        setTimeout(maybeAskCarry, 800);
        // From here on, another device's changes arrive as they happen.
        if (stopWatchingState) stopWatchingState();
        stopWatchingState = SYS.Cloud.watchState(onRemoteState);
      }).catch(() => {});
    });
  }

  // The red "now" line on today's timeline moves on its own; nothing else on
  // the page needs a re-render for the minute to change.
  setInterval(() => {
    const line = document.querySelector(".tl-now");
    if (!line) return;
    const d = new Date();
    line.style.top = ((d.getHours() * 60 + d.getMinutes()) / 60 * SYS.PLANNER_HOUR_PX) + "px";
  }, 60000);

  // Signed in, the question waits for the account's copy (see the pull
  // above); signed out, this device's copy is the only one there is.
  setTimeout(() => { if (!ui.cloudUser) maybeAskCarry(); }, 2500);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) setTimeout(maybeAskCarry, ui.cloudUser ? 3000 : 300);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !ui.cloudUser || !SYS.Cloud || !SYS.Cloud.available()) return;
    applyPendingGrants();
    refreshMyAppeals();
    refreshInbox();
    flushExpQueue();
    setTimeout(reconcileExpWithServer, 4000);
    // The listener normally has this already; a phone that suspended the
    // connection in the background catches up here, merging the same way.
    SYS.Cloud.pullIfNewer().then((newState) => {
      if (newState) onRemoteState(newState);
    }).catch(() => {});
  });

  // A save still in its short wait is sent now when the page is hidden or
  // going away — a reload or a closed tab inside that wait used to keep the
  // change on this device and lose it from the account. See push() in cloud.js.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && SYS.Cloud && SYS.Cloud.flushPush) SYS.Cloud.flushPush();
  });
  window.addEventListener("pagehide", () => {
    if (SYS.Cloud && SYS.Cloud.flushPush) SYS.Cloud.flushPush();
  });

  // ---------------- merging with the account's copy ----------------
  //
  // Another device's changes arrive while this one is open (watchState), and a
  // save that finds the account moved on merges before it writes (cloud.js).
  // Both land here. See js/state-merge.js for what wins what.

  let stopWatchingState = null;

  // Takes a copy another device wrote. With nothing of this device's unsaved,
  // it is simply taken; otherwise the two are merged against the copy both
  // started from, and the result goes back up.
  // What another device's change did to the standing, said here as it would
  // have been said there: EXP, levels or rank, and the points it bought.
  function standingNotifications(before, after) {
    const out = [];
    if (!before || !after || !before.player || !after.player) return out;
    const delta = Math.round(SYS.totalExp(after.player) - SYS.totalExp(before.player));
    if (delta) out.push({ kind: delta > 0 ? "exp" : "expLoss", text: (delta > 0 ? "+" : "") + delta + " EXP" });
    const rankBefore = SYS.RANKS.indexOf(before.player.rank), rankAfter = SYS.RANKS.indexOf(after.player.rank);
    if (rankAfter > rankBefore) out.push({ kind: "rankup", text: "Welcome to " + after.player.rank + "-Rank", rank: after.player.rank });
    else if (rankAfter < rankBefore) out.push({ kind: "rankdown", text: "Dropped to " + after.player.rank + "-Rank", rank: after.player.rank });
    else {
      const levels = (Number(after.player.level) || 0) - (Number(before.player.level) || 0);
      if (levels > 0) out.push({ kind: "levelup", text: levels === 1 ? SYS.t("notif.levelReached", { n: after.player.level }) : SYS.t("notif.levelsGained", { n: after.player.level, count: levels }) });
      if (levels < 0) out.push({ kind: "delevel", text: -levels === 1 ? SYS.t("notif.levelLost", { n: after.player.level }) : SYS.t("notif.levelsLost", { n: after.player.level, count: -levels }) });
    }
    const intTypes = after.intTypes || [];
    Object.keys(after.intelligences || {}).forEach((cat) => {
      const was = ((before.intelligences || {})[cat] || {}).traits || [];
      (after.intelligences[cat].traits || []).forEach((tr) => {
        const prev = was.find((x) => x.id === tr.id);
        const gained = (Number(tr.level) || 0) - (prev ? Number(prev.level) || 0 : 0);
        if (gained > 0) {
          const type = intTypes.find((x) => x.key === cat);
          out.push({ kind: "skillpoint", text: "+" + gained + " pt → " + tr.name + " (" + (type ? type.short : cat) + ")" });
        }
      });
    });
    return out;
  }

  function onRemoteState(raw) {
    if (!raw) return;
    const before = state;
    const tell = () => {
      lastRemoteAdoptAt = Date.now();
      processNotifications(standingNotifications(before, state));
    };
    const report = migrationReport();
    const cloudState = normalizeState(JSON.parse(JSON.stringify(raw)), report);
    const local = stateOnly(state);
    if (SYS.deepEqual(cloudState, local)) {
      SYS.Cloud.setBase(cloudState);
      return;
    }
    const base = SYS.Cloud.getBase();
    if (!base) {
      // Never in step with this account on this device: the old rules decide,
      // which may ask.
      const unsaved = SYS.Cloud.unsavedSince ? SYS.Cloud.unsavedSince() : null;
      resolveOrAsk(cloudState, { deviceIsNewer: false, deviceBehind: !unsaved && SYS.Cloud.hasSyncedHere() });
      return;
    }
    if (SYS.deepEqual(local, base)) {
      applyRemoteState(cloudState);
      tell();
      return;
    }
    const merged = SYS.mergeStates(base, local, cloudState);
    adoptMerged(merged.state, cloudState, merged.standingConflict);
    tell();
  }

  function adoptMerged(mergedState, accountCopy, standingConflict) {
    state = normalizeState(JSON.parse(JSON.stringify(mergedState)), migrationReport());
    SYS.Storage.save(state);
    SYS.Cloud.setBase(accountCopy);
    state.planner = SYS.PlannerSync.view();
    if (!SYS.deepEqual(stateOnly(state), accountCopy)) SYS.Cloud.push(state);
    applyLanguage();
    applyThemeAttribute();
    renderAppInto();
    if (ui.modal && ui.modal !== "syncChoice") renderModalInto();
    // Both sides moved the standing: the account's was kept, and the EXP
    // journal — which has every device's EXP in it — puts the total right.
    if (standingConflict) {
      flushExpQueue();
      setTimeout(reconcileExpWithServer, 4000);
    }
  }

  if (SYS.Cloud && SYS.Cloud.setMergeHandler) {
    SYS.Cloud.setMergeHandler((base, local, remote) => {
      const cloudState = normalizeState(JSON.parse(JSON.stringify(remote)), migrationReport());
      return SYS.mergeStates(base, local, cloudState);
    });
    // A save merged another device's changes in on its way up. Anything done
    // here in the meantime is kept on top of it.
    SYS.Cloud.setMergedWriteHandler((written, sent, standingConflict) => {
      const now = stateOnly(state);
      const next = SYS.deepEqual(now, sent) ? written : SYS.mergeStates(sent, now, written).state;
      adoptMerged(next, written, standingConflict);
    });
  }

  // ---------------- profiles ----------------

  function openProfile(uid) {
    if (!uid || !ui.cloudUser) return;
    ui.profileUid = uid;
    ui.profile = null;
    ui.profileRank = null;
    ui.profileError = null;
    ui.profileEdit = null;
    ui.profileReport = null;
    ui.profileReportSent = false;
    ui.modal = "profile";
    renderModalInto();
    SYS.Cloud.fetchProfile(uid).then((data) => {
      if (ui.profileUid !== uid) return;
      ui.profile = data;
      if (ui.modal === "profile") renderModalInto();
      if (data && data.row && !data.row.hidden) {
        return SYS.Cloud.fetchMyRank(Number(data.row.totalExp) || 0).then((rank) => {
          if (ui.profileUid !== uid) return;
          ui.profileRank = rank;
          if (ui.modal === "profile") renderModalInto();
        });
      }
    }).catch((err) => {
      ui.profileError = (err && err.message) || SYS.t("profile.loadFailed");
      if (ui.modal === "profile") renderModalInto();
    });
  }

  // The server's refusal of a name or a bio carries the moderator's reason.
  function refusalText(err) {
    const details = err && err.details;
    if (details && details.code === "not-allowed") {
      return SYS.t("profile.notAllowed") + (details.reason ? " " + details.reason : "");
    }
    return (err && err.message) || SYS.t("profile.saveFailed");
  }

  // ---------------- friends ----------------

  let stopWatchingFriends = null;
  function watchFriends(signedIn) {
    if (stopWatchingFriends) { stopWatchingFriends(); stopWatchingFriends = null; }
    ui.friendships = [];
    ui.friendRequestsIn = 0;
    if (!signedIn || !SYS.Cloud.watchFriendships) return;
    stopWatchingFriends = SYS.Cloud.watchFriendships((list) => {
      ui.friendships = list;
      ui.friendRequestsIn = list.filter((f) => f.status === "pending" && f.to === ui.cloudUser.uid).length;
      refreshFriendRows();
      renderSidebarInto();
      if (ui.page === "leaderboard") renderPageInto();
      if (ui.modal === "profile") renderModalInto();
    });
  }

  // Names and EXP for everyone in the list, and this account's own row.
  function refreshFriendRows() {
    if (!ui.cloudUser) return;
    const me = ui.cloudUser.uid;
    const uids = [...new Set(ui.friendships.map((f) => (f.users || []).find((u) => u !== me)).filter(Boolean))];
    SYS.Cloud.fetchLeaderboardRows(uids.concat(me)).then((rows) => {
      const map = {};
      rows.forEach((r) => { map[r.uid] = r; });
      ui.myRow = map[me] || null;
      delete map[me];
      ui.friendRows = map;
      if (ui.page === "leaderboard") renderPageInto();
    }).catch(() => {});
  }

  // A friend call's refusal, in the reader's language.
  function friendErrorText(err) {
    const details = (err && err.details) || {};
    const key = { "no-such-player": "friends.noSuchPlayer", self: "friends.self", full: "friends.full", "bad-invite": "friends.badInvite",
      "no-request": "friends.noRequest", "blocked-by": "friends.blockedBy", "you-blocked": "friends.youBlocked" }[details.code];
    return key ? SYS.t(key, { name: details.name || "" }) : (err && err.message) || SYS.t("profile.saveFailed");
  }

  // An invite link opened: remembered until someone is signed in to take it.
  const INVITE_KEY = "the-system:invite";
  (function captureInvite() {
    const m = /^#invite=([0-9a-f]{24})$/.exec(location.hash || "");
    if (!m) return;
    try { sessionStorage.setItem(INVITE_KEY, m[1]); } catch (e) { /* storage blocked */ }
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
  })();
  function takePendingInvite() {
    let token = null;
    try { token = sessionStorage.getItem(INVITE_KEY); } catch (e) { return; }
    if (!token) return;
    if (!ui.cloudUser) {
      addToast({ kind: "info", text: SYS.t("friends.inviteSignIn") });
      return;
    }
    try { sessionStorage.removeItem(INVITE_KEY); } catch (e) { /* ignore */ }
    SYS.Cloud.callAcceptInvite(token).then((res) => {
      addToast({ kind: "info", text: SYS.t("friends.nowFriends", { name: res.name || "" }) });
      ui.page = "leaderboard";
      ui.lbTab = "friends";
      renderSidebarInto();
      renderPageInto();
    }).catch((err) => addToast({ kind: "info", text: friendErrorText(err) }));
  }
  setTimeout(() => { if (!ui.cloudUser) takePendingInvite(); }, 3500);

  function openFriendsTab() {
    ui.page = "leaderboard";
    ui.lbTab = "friends";
    renderSidebarInto();
    renderPageInto();
  }
  if (location.hash === "#friends") {
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
    setTimeout(openFriendsTab, 0);
  }

  function openCompare(uid) {
    ui.compareUid = uid;
    ui.compare = null;
    ui.modal = "compare";
    renderModalInto();
    Promise.all([SYS.Cloud.fetchProfile(ui.cloudUser.uid), SYS.Cloud.fetchProfile(uid)]).then(([me, them]) => {
      if (ui.compareUid !== uid) return;
      ui.compare = { me, them };
      if (ui.modal === "compare") renderModalInto();
    }).catch((err) => {
      ui.compare = { error: (err && err.message) || SYS.t("profile.loadFailed") };
      if (ui.modal === "compare") renderModalInto();
    });
  }

  // The blocked accounts with their current names and avatars, for Settings.
  function refreshBlockedList() {
    if (!SYS.Cloud || !SYS.Cloud.fetchBlocks || !ui.cloudUser) return;
    ui.blockedList = null;
    SYS.Cloud.fetchBlocks().then((ids) => {
      ui.blocks = new Set(ids);
      return Promise.all(ids.map((uid) => SYS.Cloud.fetchProfile(uid)
        .then((p) => ({ uid, name: p && p.row ? p.row.displayName : "", avatar: p && p.profile ? p.profile.avatar : null }))
        .catch(() => ({ uid, name: "", avatar: null }))));
    }).then((list) => {
      ui.blockedList = list;
      if (ui.modal === "settings") renderModalInto();
    }).catch(() => {
      ui.blockedList = [];
      if (ui.modal === "settings") renderModalInto();
    });
  }

  function refreshBlocks() {
    if (!SYS.Cloud || !SYS.Cloud.fetchBlocks || !ui.cloudUser) return;
    SYS.Cloud.fetchBlocks().then((ids) => { ui.blocks = new Set(ids); }).catch(() => {});
  }

  function refreshAdminReports() {
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.isAdmin || !SYS.Cloud.fetchOpenReports) return;
    SYS.Cloud.fetchOpenReports().then((list) => {
      ui.adminReports = list;
      if (ui.page === "admin") renderPageInto();
    }).catch(() => {});
  }

  // ---------------- planner ----------------

  // Another device changed the planner. Not redrawn under someone's typing —
  // the next redraw picks it up.
  function onPlannerFromServer() {
    state.planner = SYS.PlannerSync.view();
    const typing = document.activeElement && /^(planner-input|planner-edit-input|event-title)$/.test(document.activeElement.id);
    if (ui.page === "planner" && !typing) renderPageInto();
    if (ui.modal === "eventView") renderModalInto();
    maybeAskCarry();
  }

  function plannerDay() { return ui.plannerDay || SYS.todayKey(); }

  function addPlannerTodo() {
    const title = (ui.plannerDraft || "").trim();
    if (title) {
      const day = plannerDay();
      // Cleared first: the action re-renders, and the box would come back
      // holding what was just added.
      ui.plannerDraft = "";
      runGameAction((draft) => { SYS.addTodo(draft, { title, day }); return []; });
    }
    const box = document.getElementById("planner-input");
    if (box) box.focus();
  }

  function commitPlannerEdit() {
    const edit = ui.plannerEdit;
    if (!edit) return;
    ui.plannerEdit = null;
    const todo = (state.planner.todos || []).find((x) => x.id === edit.id);
    if (todo && (edit.draft || "").trim() && edit.draft.trim() !== todo.title) {
      runGameAction((draft) => { SYS.renameTodo(draft, edit.id, edit.draft); return []; });
    } else {
      renderPageInto();
    }
  }

  function pad2(n) { return String(n).padStart(2, "0"); }
  function shiftMonth(key, delta) {
    const [y, m, d] = key.split("-").map(Number);
    const first = new Date(y, m - 1 + delta, 1);
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return SYS.dateKey(new Date(first.getFullYear(), first.getMonth(), Math.min(d, days)));
  }

  // A new event starts on the hour: the one tapped, the next one today, or
  // nine o'clock on any other day. An hour long, as calendars default to.
  function openEventForm(date, hour) {
    let h = 9;
    if (hour != null) h = hour;
    else if (date === SYS.todayKey()) h = Math.min(23, new Date().getHours() + 1);
    ui.eventForm = {
      mode: "new", title: "", date, endDate: date, allDay: false,
      from: pad2(h) + ":00", to: h >= 23 ? "23:59" : pad2(h + 1) + ":00",
      repeatType: "none", days: [], monthBy: "date", untilOn: false, until: "", scope: "following", error: null,
      reminders: [], customOpen: false, customN: "", customUnit: "min", customError: false,
    };
    ui.modal = "eventForm";
    renderModalInto();
    if (ui.cloudUser) refreshPushState();
    const box = document.getElementById("event-title");
    if (box) box.focus();
  }

  function saveEventForm() {
    const f = ui.eventForm;
    if (!f) return;
    const oneDay = f.mode === "edit" && f.recurring && f.scope === "this";
    const input = {
      title: f.title, start: f.date, end: f.endDate || f.date, allDay: f.allDay, from: f.from, to: f.to, reminders: f.reminders,
      repeat: oneDay ? { type: "none" } : { type: f.repeatType, days: f.days, monthBy: f.monthBy, until: f.untilOn ? f.until : null },
    };
    const error = SYS.eventError(input);
    if (error) { f.error = error; renderModalInto(); return; }
    ui.eventForm = null;
    ui.eventView = null;
    ui.modal = null;
    // The day the event is on is the day worth looking at next.
    if ((ui.plannerView || "day") === "day") ui.plannerDay = input.start === SYS.todayKey() ? null : input.start;
    runGameAction((draft) => {
      if (f.mode === "edit") SYS.updateEvent(draft, f.id, f.day, input, f.recurring ? f.scope : "following");
      else SYS.addEvent(draft, input);
      return [];
    });
    renderModalInto();
  }

  // ---------- dragging events on the timeline ----------
  //
  // Drag a block to move it, or its foot to change when it ends, in quarter
  // hours. With a mouse a few pixels of movement starts it. A finger has to
  // rest on the block first: otherwise every swipe across a busy day would
  // move something instead of scrolling. A swipe that begins on a block still
  // scrolls — the timeline is moved by hand, since blocks opt out of the
  // browser's own panning so that the hold can become a drag.
  const DRAG_SNAP = 15;
  let drag = null;
  let swallowClick = false;
  function hhmmOf(min) {
    const m = ((min % 1440) + 1440) % 1440;
    return pad2(Math.floor(m / 60)) + ":" + pad2(m % 60);
  }
  function startDrag() {
    drag.active = true;
    drag.block.classList.add("dragging");
    try { drag.block.setPointerCapture(drag.pointerId); } catch (err) { /* already released */ }
    if (drag.touch && navigator.vibrate) navigator.vibrate(12);
  }
  document.addEventListener("pointerdown", (e) => {
    const block = e.target.closest && e.target.closest(".tl-event");
    if (!block || block.dataset.spill === "1" || (e.pointerType === "mouse" && e.button !== 0)) return;
    const from = SYS.minutesOf(block.dataset.from);
    const to = SYS.minutesOf(block.dataset.to) + (Number(block.dataset.span) || 0) * 1440;
    drag = {
      block, scroller: block.closest(".tl-scroll"), pointerId: e.pointerId,
      touch: e.pointerType !== "mouse",
      mode: e.target.closest(".tl-resize") ? "resize" : "move",
      y0: e.clientY, lastY: e.clientY, scroll0: 0,
      from, to, length: to - from,
      active: false, panning: false, timer: null, next: null,
    };
    drag.scroll0 = drag.scroller.scrollTop;
    if (drag.touch) drag.timer = setTimeout(() => { if (drag && !drag.panning && !drag.active) startDrag(); }, 380);
  });
  document.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dy = e.clientY - drag.y0;
    if (!drag.active) {
      if (drag.touch) {
        if (drag.panning || Math.abs(dy) > 8) {
          drag.panning = true;
          clearTimeout(drag.timer);
          drag.scroller.scrollTop -= e.clientY - drag.lastY;
        }
        drag.lastY = e.clientY;
        return;
      }
      if (Math.abs(dy) < 4) return;
      startDrag();
    }
    e.preventDefault();
    // Held near the top or bottom of the hours, they scroll on. Not in a box
    // too short to have edges worth the name, where every move would count.
    const box = drag.scroller.getBoundingClientRect();
    if (box.height > 120) {
      if (e.clientY < box.top + 28) drag.scroller.scrollTop -= 10;
      else if (e.clientY > box.bottom - 28) drag.scroller.scrollTop += 10;
    }
    const moved = (dy + drag.scroller.scrollTop - drag.scroll0) / SYS.PLANNER_HOUR_PX * 60;
    let from = drag.from, end = drag.from + drag.length;
    if (drag.mode === "move") {
      from = Math.max(0, Math.min(1440 - DRAG_SNAP, Math.round((drag.from + moved) / DRAG_SNAP) * DRAG_SNAP));
      end = from + drag.length;
    } else {
      end = Math.max(drag.from + DRAG_SNAP, Math.min(1440, Math.round((drag.from + drag.length + moved) / DRAG_SNAP) * DRAG_SNAP));
    }
    // How many days on it now ends, and when. Ending exactly at midnight is
    // kept on the day before, as a minute to.
    const span = Math.floor((end - 1) / 1440);
    const endOnDay = end - span * 1440;
    drag.next = { from: hhmmOf(from), to: endOnDay === 1440 ? "23:59" : hhmmOf(endOnDay), span };
    const H = SYS.PLANNER_HOUR_PX;
    drag.block.style.top = (from / 60 * H) + "px";
    drag.block.style.height = Math.max(22, (Math.min(end, 1440) - from) / 60 * H - 2) + "px";
    const label = drag.block.querySelector(".tl-event-time");
    if (label) label.textContent = SYS.fmtClock(drag.next.from) + " – " + SYS.fmtClock(drag.next.to) + (span > 0 ? " ↓" : "");
  }, { passive: false });
  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    drag = null;
    clearTimeout(d.timer);
    // A swipe that scrolled, or a drag, is not also a tap on the block.
    if (d.panning || d.active) { swallowClick = true; setTimeout(() => { swallowClick = false; }, 400); }
    if (!d.active) return;
    d.block.classList.remove("dragging");
    const n = d.next;
    if (cancelled || !n || (n.from === d.block.dataset.from && n.to === d.block.dataset.to && n.span === (Number(d.block.dataset.span) || 0))) { renderPageInto(); return; }
    const ev = SYS.findEvent(state, d.block.dataset.id);
    if (!ev) { renderPageInto(); return; }
    const move = { id: ev.id, day: d.block.dataset.day, from: n.from, to: n.to, span: n.span };
    if (ev.repeat.type === "none") { applyEventTimes(move, "following"); return; }
    ui.eventMove = move;
    ui.modal = "eventMove";
    renderModalInto();
  }
  document.addEventListener("pointerup", (e) => endDrag(e, false));
  document.addEventListener("pointercancel", (e) => endDrag(e, true));
  document.addEventListener("click", (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  function applyEventTimes(move, scope) {
    const ev = SYS.findEvent(state, move.id);
    const o = ev && SYS.eventOccurrence(state, move.id, move.day);
    if (!o) { renderPageInto(); return; }
    // One day keeps that day's own title; the series keeps the series'.
    const input = {
      title: scope === "this" ? o.title : ev.title, start: move.day, span: move.span, allDay: false, from: move.from, to: move.to,
      reminders: ev.reminders,
      repeat: scope === "this" ? { type: "none" } : { ...ev.repeat },
    };
    runGameAction((draft) => { SYS.updateEvent(draft, move.id, move.day, input, scope); return []; });
  }

  // The morning question: unfinished items from days that are over. Asked
  // only when nothing else is on screen — a sync question or a level-up
  // outranks it, and it comes back on the next chance (opening the planner,
  // returning to the app) because nothing is marked until it is answered.
  function maybeAskCarry() {
    if (ui.modal || ui.rankupShowing) return;
    const pending = SYS.pendingCarry(state);
    if (!pending.length) return;
    ui.carrySel = new Set(pending.map((x) => x.id));
    ui.modal = "carry";
    renderModalInto();
  }

  // ---------------- event wiring ----------------

  document.addEventListener("input", (e) => {
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
      const slid = state.tasks.find((x) => x.id === id);
      if (slid && newVal > (Number(slid.completion) || 0) && refuseLocked(slid)) {
        renderPageInto(); // put the slider back where the task actually is
        return;
      }
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
    if (selectAction === "set-event-monthby") {
      if (ui.eventForm) ui.eventForm.monthBy = e.target.value;
      return;
    }
    // A start moved past the end brings the end along to the same day — an
    // end before the start is not a choice anyone is making. The monthly
    // choices are worded from the date ("the third Tuesday"), so they redraw.
    if (e.target.id === "event-date" && ui.eventForm) {
      const f = ui.eventForm;
      if (/^\d{4}-\d{2}-\d{2}$/.test(f.date) && !(f.endDate >= f.date)) f.endDate = f.date;
      renderModalInto();
      return;
    }
    if (selectAction === "set-event-repeat") {
      const f = ui.eventForm;
      if (!f) return;
      f.repeatType = e.target.value;
      if (f.repeatType === "weekly" && !f.days.length && /^\d{4}-\d{2}-\d{2}$/.test(f.date)) {
        const [y, m, d] = f.date.split("-").map(Number);
        f.days = [new Date(y, m - 1, d).getDay()];
      }
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
    if (ui.modal === "time") {
      if (e.key === "Escape") { e.preventDefault(); closeTimeSheet(); return; }
      const col = e.target.closest && e.target.closest(".tw-col");
      if (col && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        col.scrollBy({ top: e.key === "ArrowDown" ? TW_ROW : -TW_ROW });
        return;
      }
      if (col && e.key === "Enter") {
        e.preventDefault();
        const ok = document.querySelector(".time-confirm");
        if (ok) ok.click();
        return;
      }
    }
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
    if ((ui.modal === "eventForm" || ui.modal === "eventView") && e.key === "Escape") {
      e.preventDefault();
      ui.modal = null; ui.eventForm = null; ui.eventView = null;
      renderModalInto();
      return;
    }
    if (e.target.id === "event-title" && e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      saveEventForm();
      return;
    }
    if (e.target.id === "planner-input" && e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      addPlannerTodo();
      return;
    }
    if (e.target.id === "planner-edit-input" && !e.isComposing) {
      // Saved here rather than by blurring into the focusout below: a blur
      // only fires on a focused document, and commitPlannerEdit ignores the
      // second call when the removed field does report one.
      if (e.key === "Enter") { e.preventDefault(); commitPlannerEdit(); return; }
      if (e.key === "Escape") { e.preventDefault(); ui.plannerEdit = null; renderPageInto(); return; }
    }
    if (e.target.id === "name-input") {
      if (e.key === "Enter") { e.preventDefault(); e.target.blur(); }
      if (e.key === "Escape") { ui.nameEditing = false; ui.__nameDraft = null; renderAppInto(); }
    }
  });

  document.addEventListener("focusout", (e) => {
    if (e.target.id === "name-input") commitName();
    if (e.target.id === "planner-edit-input") commitPlannerEdit();
  });

  // Scroll does not bubble, so the wheels are watched in the capture phase.
  //
  // At most one highlight per frame, however many scroll events a frame
  // brings. And the wheel is recentred only once scrolling has truly ended:
  // the browser's own scrollend where it has one. A fixed 140 ms timer used
  // to stand in for it, and a pause that long in the middle of a slow spin
  // or a snap animation is ordinary — it fired mid-glide, set the position
  // underneath the animation, and the wheel jumped.
  const supportsScrollEnd = "onscrollend" in document;
  document.addEventListener("scroll", (e) => {
    const col = e.target;
    if (!col.classList || !col.classList.contains("tw-col")) return;
    if (!col._twFrame) {
      col._twFrame = requestAnimationFrame(() => { col._twFrame = 0; markWheel(col); });
    }
    if (!supportsScrollEnd) {
      clearTimeout(col._twSettle);
      col._twSettle = setTimeout(() => settleWheel(col), 250);
    }
  }, true);
  if (supportsScrollEnd) {
    document.addEventListener("scrollend", (e) => {
      const col = e.target;
      if (col.classList && col.classList.contains("tw-col")) settleWheel(col);
    }, true);
  }

  $importInput.addEventListener("change", () => {
    const file = $importInput.files && $importInput.files[0];
    $importInput.value = "";
    if (!file) return;
    SYS.Storage.importFromFile(file).then((parsed) => {
      state = normalizeImportedState(parsed);
      persist(state);
      // A backup's planner is added to this one, never swapped in for it:
      // restoring an old file must not delete what was planned since.
      if (parsed.planner) SYS.PlannerSync.absorbLegacy(parsed.planner);
      state.planner = SYS.PlannerSync.view();
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
      ui.modal = null; ui.settingsDraft = null; ui.importError = null;
      renderModalInto();
      return;
    }

    const isAdminAction = action === "admin-grant-admin" || action === "admin-revoke-admin";
    if (ARMABLE.has(action)) {
      const armKind = action === "remove-trait" ? "trait" : action === "reset-data" ? "reset" : isAdminAction ? "admin" : "task";
      const armId = action === "remove-trait" ? el.dataset.trait : action === "reset-data" ? "reset" : isAdminAction ? `${action}:${el.dataset.email}` : (id || el.dataset.id);
      if (!isArmed(armKind, armId)) {
        arm(armKind, armId);
        if (action === "reset-data" || action === "event-delete" || action === "friend-remove-armed") renderModalInto(); else if (isAdminAction) renderPageInto(); else renderAppInto();
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
        refreshBlockedList();
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
      case "planner-add":
        addPlannerTodo();
        break;
      case "planner-toggle":
        runGameAction((draft) => { SYS.toggleTodo(draft, id); return []; });
        break;
      case "planner-edit": {
        const todo = (state.planner.todos || []).find((x) => x.id === id);
        if (!todo) break;
        ui.plannerEdit = { id, draft: todo.title };
        renderPageInto();
        const box = document.getElementById("planner-edit-input");
        if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
        break;
      }
      case "planner-delete":
        if (ui.plannerEdit && ui.plannerEdit.id === id) ui.plannerEdit = null;
        runGameAction((draft) => { SYS.deleteTodo(draft, id); return []; });
        break;
      case "planner-shift-day": {
        const delta = Number(el.dataset.delta) || 0;
        const view = ui.plannerView || "day";
        const next = view === "month" ? shiftMonth(plannerDay(), delta)
          : SYS.shiftDay(plannerDay(), view === "week" ? 7 * delta : delta);
        ui.plannerDay = next === SYS.todayKey() ? null : next;
        ui.plannerEdit = null;
        renderPageInto();
        break;
      }
      case "planner-today":
        ui.plannerDay = null;
        ui.plannerEdit = null;
        renderPageInto();
        break;
      case "planner-view":
        ui.plannerView = el.dataset.view;
        ui.plannerEdit = null;
        renderPageInto();
        break;
      case "planner-open-day": {
        const d = el.dataset.day;
        ui.plannerDay = d === SYS.todayKey() ? null : d;
        ui.plannerView = "day";
        renderPageInto();
        break;
      }
      case "event-new":
        openEventForm(plannerDay(), null);
        break;
      case "event-new-at":
        openEventForm(plannerDay(), Number(el.dataset.hour) || 0);
        break;
      case "event-open":
        ui.eventView = { id, day: el.dataset.day };
        ui.modal = "eventView";
        renderModalInto();
        break;
      case "event-edit": {
        const v = ui.eventView;
        const ev = v && SYS.findEvent(state, v.id);
        const o = ev && SYS.eventOccurrence(state, v.id, v.day);
        if (!o) break;
        ui.eventForm = {
          mode: "edit", id: ev.id, day: v.day, recurring: ev.repeat.type !== "none",
          title: o.title, date: v.day, endDate: o.endDay, allDay: ev.allDay, from: o.from || "09:00", to: o.to || "10:00",
          repeatType: ev.repeat.type, days: ev.repeat.days.slice(), monthBy: ev.repeat.monthBy || "date",
          untilOn: !!ev.repeat.until, until: ev.repeat.until || "",
          scope: "this", error: null,
          reminders: (ev.reminders || []).slice(), customOpen: false, customN: "", customUnit: "min", customError: false,
        };
        ui.modal = "eventForm";
        renderModalInto();
        if (ui.cloudUser) refreshPushState();
        break;
      }
      case "event-delete": {
        const [evId, scope] = String(id).split("|");
        const day = ui.eventView && ui.eventView.day;
        ui.modal = null;
        ui.eventView = null;
        runGameAction((draft) => { SYS.deleteEvent(draft, evId, day, scope); return []; });
        renderModalInto();
        break;
      }
      case "event-allday":
        if (ui.eventForm) { ui.eventForm.allDay = !ui.eventForm.allDay; renderModalInto(); }
        break;
      case "event-repeat-day": {
        const f = ui.eventForm;
        if (!f) break;
        const wd = Number(el.dataset.wd);
        f.days = f.days.indexOf(wd) >= 0 ? f.days.filter((x) => x !== wd) : f.days.concat(wd);
        renderModalInto();
        break;
      }
      case "event-until": {
        const f = ui.eventForm;
        if (!f) break;
        f.untilOn = !f.untilOn;
        if (f.untilOn && !f.until && /^\d{4}-\d{2}-\d{2}$/.test(f.date)) f.until = shiftMonth(f.date, 1);
        renderModalInto();
        break;
      }
      case "event-scope":
        if (ui.eventForm) { ui.eventForm.scope = el.dataset.scope === "following" ? "following" : "this"; renderModalInto(); }
        break;
      case "event-save":
        saveEventForm();
        break;
      case "event-reminder-toggle": {
        const f = ui.eventForm;
        if (!f) break;
        const offset = Number(el.dataset.offset);
        const had = (f.reminders || []).indexOf(offset) >= 0;
        const list = (f.reminders || []).filter((x) => x !== offset);
        if (!had) list.push(offset);
        f.reminders = SYS.cleanEventReminders(list);
        renderModalInto();
        break;
      }
      case "event-reminder-custom-cancel":
        if (ui.eventForm) { ui.eventForm.customOpen = false; ui.eventForm.customN = ""; ui.eventForm.customError = false; renderModalInto(); }
        break;
      case "event-reminder-custom":
        if (ui.eventForm) { ui.eventForm.customOpen = true; ui.eventForm.customError = false; renderModalInto(); }
        break;
      case "event-reminder-custom-add": {
        const f = ui.eventForm;
        if (!f) break;
        const n = Math.round(Number(f.customN));
        const minutes = n * ({ min: 1, hour: 60, day: 1440 }[f.customUnit] || 1);
        // Two different mistakes, two different answers: nothing (or not a
        // positive whole number) typed, or a time further back than a week.
        if (!(n > 0)) { f.customError = "number"; renderModalInto(); break; }
        if (minutes > SYS.EVENT_REMINDER_MAX_OFFSET) { f.customError = "far"; renderModalInto(); break; }
        f.reminders = SYS.cleanEventReminders((f.reminders || []).concat(minutes));
        f.customOpen = false; f.customN = ""; f.customError = false;
        renderModalInto();
        break;
      }
      case "toggle-planner-habits":
        runGameAction((draft) => { draft.settings.plannerShowHabits = !draft.settings.plannerShowHabits; return []; });
        renderModalInto();
        break;
      case "open-profile":
      case "admin-open-profile":
        openProfile(el.dataset.uid);
        break;
      case "open-my-profile":
        if (ui.cloudUser) openProfile(ui.cloudUser.uid);
        break;
      case "profile-edit": {
        const p = (ui.profile && ui.profile.profile) || {};
        ui.profileEdit = { avatar: p.avatar || null, bio: p.bio || "", busy: false, error: null };
        renderModalInto();
        break;
      }
      case "profile-avatar":
        if (ui.profileEdit) { ui.profileEdit.avatar = el.dataset.id; renderModalInto(); }
        break;
      case "profile-edit-cancel":
        ui.profileEdit = null;
        renderModalInto();
        break;
      case "profile-save": {
        const e = ui.profileEdit;
        if (!e || e.busy) break;
        e.busy = true;
        e.error = null;
        renderModalInto();
        SYS.Cloud.callUpdateProfile({ avatar: e.avatar || null, bio: e.bio || "" }).then((saved) => {
          if (ui.profile) ui.profile.profile = { ...(ui.profile.profile || {}), avatar: saved.avatar, bio: saved.bio };
          ui.profileEdit = null;
          renderModalInto();
        }).catch((err) => {
          e.busy = false;
          e.error = refusalText(err);
          renderModalInto();
        });
        break;
      }
      case "profile-report":
        ui.profileReport = { reason: null, note: "", busy: false, error: null };
        ui.profileReportSent = false;
        renderModalInto();
        break;
      case "report-reason":
        if (ui.profileReport) { ui.profileReport.reason = el.dataset.reason; renderModalInto(); }
        break;
      case "report-cancel":
        ui.profileReport = null;
        renderModalInto();
        break;
      case "report-send": {
        const r = ui.profileReport;
        if (!r || !r.reason || r.busy) break;
        r.busy = true;
        renderModalInto();
        SYS.Cloud.callReportUser({ uid: ui.profileUid, reason: r.reason, note: r.note || "" }).then(() => {
          ui.profileReport = null;
          ui.profileReportSent = true;
          renderModalInto();
        }).catch((err) => {
          r.busy = false;
          r.error = (err && err.message) || SYS.t("profile.saveFailed");
          renderModalInto();
        });
        break;
      }
      case "profile-block": {
        const target = ui.profileUid;
        if (!target || ui.profileBlockBusy) break;
        const block = !ui.blocks.has(target);
        ui.profileBlockBusy = true;
        renderModalInto();
        SYS.Cloud.setBlocked(target, block).then(() => {
          if (block) ui.blocks.add(target); else ui.blocks.delete(target);
          // A block ends a friendship or a request, too.
          if (block && SYS.friendStatus(ui, target) !== "none") return SYS.Cloud.callRemoveFriend(target).catch(() => {});
        }).then(() => {
          addToast({ kind: "info", text: SYS.t(block ? "profile.blockedToast" : "profile.unblockedToast") });
        }).catch((err) => {
          addToast({ kind: "info", text: (err && err.message) || SYS.t("profile.saveFailed") });
        }).then(() => {
          ui.profileBlockBusy = false;
          if (ui.modal === "profile") renderModalInto();
        });
        break;
      }
      case "admin-report": {
        if (ui.adminReportBusy) break;
        ui.adminReportBusy = true;
        renderPageInto();
        SYS.Cloud.callReviewReport(el.dataset.id, el.dataset.act).then(() => {
          addToast({ kind: "info", text: SYS.t("admin.reportDone") });
        }).catch((err) => {
          addToast({ kind: "info", text: (err && err.message) || "That didn't work." });
        }).then(() => {
          ui.adminReportBusy = false;
          refreshAdminReports();
        });
        break;
      }
      case "unblock": {
        const target = el.dataset.uid;
        if (!target || ui.unblockBusy) break;
        ui.unblockBusy = target;
        renderModalInto();
        SYS.Cloud.setBlocked(target, false).then(() => {
          ui.blocks.delete(target);
          ui.blockedList = (ui.blockedList || []).filter((b) => b.uid !== target);
          addToast({ kind: "info", text: SYS.t("profile.unblockedToast") });
        }).catch((err) => addToast({ kind: "info", text: (err && err.message) || SYS.t("profile.saveFailed") })).then(() => {
          ui.unblockBusy = null;
          if (ui.modal === "settings") renderModalInto();
        });
        break;
      }
      case "lb-tab":
        ui.lbTab = el.dataset.tab === "friends" ? "friends" : "world";
        if (ui.lbTab === "friends") refreshFriendRows();
        renderPageInto();
        break;
      case "friends-view":
        ui.friendsWeek = el.dataset.week === "1";
        renderPageInto();
        break;
      case "friend-add":
      case "friend-add-uid": {
        if (ui.friendBusy) break;
        const byName = action === "friend-add";
        const name = (ui.friendAddName || "").trim();
        if (byName && !name) break;
        ui.friendBusy = true;
        renderAppInto(); renderModalInto();
        SYS.Cloud.callSendFriendRequest(byName ? { name } : { uid: el.dataset.uid }).then((res) => {
          if (byName) ui.friendAddName = "";
          addToast({ kind: "info", text: SYS.t(res.status === "friends" ? "friends.nowFriends" : "friends.requestSent", { name: byName ? name : "" }) });
        }).catch((err) => {
          addToast({ kind: "info", text: friendErrorText(err) });
        }).then(() => {
          ui.friendBusy = false;
          renderAppInto(); renderModalInto();
        });
        break;
      }
      case "friend-respond":
        SYS.Cloud.callRespondFriendRequest(el.dataset.uid, el.dataset.accept === "1")
          .catch((err) => addToast({ kind: "info", text: friendErrorText(err) }));
        break;
      case "friend-remove":
      case "friend-remove-armed":
        SYS.Cloud.callRemoveFriend(el.dataset.uid)
          .catch((err) => addToast({ kind: "info", text: friendErrorText(err) }));
        break;
      case "friend-invite":
        if (ui.inviteBusy) break;
        ui.inviteBusy = true;
        renderPageInto();
        SYS.Cloud.callCreateInvite().then((res) => {
          const link = location.origin + location.pathname + "#invite=" + res.token;
          ui.inviteLink = link;
          // The phone's own share sheet where there is one (WhatsApp and the
          // rest are in it); otherwise the link is copied.
          if (navigator.share) {
            navigator.share({ title: "The System", text: SYS.t("friends.shareText"), url: link }).catch(() => {});
          } else if (navigator.clipboard) {
            navigator.clipboard.writeText(link).then(() => addToast({ kind: "info", text: SYS.t("friends.copied") })).catch(() => {});
          }
        }).catch((err) => addToast({ kind: "info", text: friendErrorText(err) })).then(() => {
          ui.inviteBusy = false;
          renderPageInto();
        });
        break;
      case "open-compare":
        openCompare(el.dataset.uid);
        break;
      case "event-pick-time":
        openEventTimeSheet(el.dataset.which === "to" ? "to" : "from");
        break;
      case "event-move-apply": {
        const m = ui.eventMove;
        ui.eventMove = null;
        ui.modal = null;
        renderModalInto();
        if (m) applyEventTimes(m, el.dataset.scope === "following" ? "following" : "this");
        break;
      }
      case "carry-toggle":
        if (!ui.carrySel) break;
        if (ui.carrySel.has(id)) ui.carrySel.delete(id); else ui.carrySel.add(id);
        renderModalInto();
        break;
      case "carry-all": {
        const pending = SYS.pendingCarry(state).map((x) => x.id);
        const all = pending.every((x) => ui.carrySel && ui.carrySel.has(x));
        ui.carrySel = new Set(all ? [] : pending);
        renderModalInto();
        break;
      }
      case "carry-move":
      case "carry-leave": {
        const chosen = action === "carry-move" && ui.carrySel ? [...ui.carrySel] : [];
        const today = SYS.todayKey();
        let moved = 0;
        ui.modal = null;
        ui.carrySel = null;
        runGameAction((draft) => { moved = SYS.carryTodos(draft, chosen, today); return []; });
        renderModalInto();
        if (moved) addToast({ kind: "info", text: SYS.t("planner.moved", { n: moved }) });
        break;
      }
      case "close-modal":
        ui.modal = null; ui.settingsDraft = null; ui.importError = null;
        ui.eventForm = null; ui.eventView = null;
        ui.profileUid = null; ui.profileEdit = null; ui.profileReport = null;
        renderModalInto();
        // A drag that was not confirmed goes back where it came from.
        if (ui.eventMove) { ui.eventMove = null; renderPageInto(); }
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
          f.error = accountErrorText(err);
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
          f.error = accountErrorText(err);
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
        // A reset empties the planner too, on every device.
        SYS.PlannerSync.commit(state.planner);
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
      // Categories and traits cannot be added from the app — see
      // renderIntelligencePage. Removing a non-seed trait left over from before
      // stays with the admin.
      case "remove-trait":
        if (!ui.isAdmin) return;
        runGameAction((draft) => { SYS.removeTrait(draft, key, el.dataset.trait); return []; });
        break;

      case "open-quest-form":
        ui.taskForm = {
          formKind: "add", editId: null, title: "", priority: "Medium", taskType: "Short Term", types: [], pt: 100, expMode: "simple",
          notes: "", error: null, busy: false, lockType: true,
          recurring: false, quit: false, reminders: [], remindNote: "", schedule: blankSchedule(), unit: "reps", targetAmount: 1, customUnit: "",
          icon: "",
        };
        renderAppInto();
        break;
      case "open-habit-form":
        ui.taskForm = {
          formKind: "add", editId: null, title: "", priority: "Medium", taskType: "Short Term", types: [], pt: 20, expMode: "simple",
          notes: "", error: null, busy: false, lockType: true,
          recurring: true, quit: false, reminders: [], remindNote: "", schedule: blankSchedule(), unit: "reps", targetAmount: 1, customUnit: "",
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
      case "open-reflection": {
        const task = state.tasks.find((x) => x.id === id);
        if (!task) return;
        ui.reflectionFor = { taskId: id, cp: Number(el.dataset.cp) === 100 ? 100 : 50 };
        ui.reflectionDraft = "";
        ui.reflectionError = null;
        ui.reflectionBusy = false;
        ui.modal = "reflection";
        renderModalInto();
        break;
      }
      case "submit-reflection": {
        const f = ui.reflectionFor || {};
        const task = state.tasks.find((x) => x.id === f.taskId);
        if (!task || !task.priceId || ui.reflectionBusy) return;
        const answer = String(ui.reflectionDraft || "").trim();
        if (answer.length < 8) { ui.reflectionError = SYS.t("reflect.tooShort"); renderModalInto(); return; }
        ui.reflectionBusy = true; ui.reflectionError = null;
        renderModalInto();
        SYS.Cloud.callSubmitReflection(task.priceId, f.cp, answer).then((res) => {
          ui.reflectionBusy = false;
          const current = { ...(task.reflections || {}) };
          current[f.cp] = { status: res.status, reason: res.reason || "", attemptsLeft: Number(res.attemptsLeft) || 0 };
          runGameAction((draft) => SYS.applyReflections(draft, { [task.priceId]: current }));
          if (res.status === "accepted") {
            ui.modal = null;
            addToast({ kind: "info", text: SYS.t("reflect.accepted", { n: Number(res.released) || 0 }) });
          } else if (!(Number(res.attemptsLeft) > 0)) {
            // Out of rewrites: it waits for a person now, so there is nothing
            // left to do in this sheet.
            ui.modal = null;
            addToast({ kind: "info", text: SYS.t("reflect.waiting") });
          } else {
            // Kept, so the reason can be acted on without starting again.
            ui.reflectionDraft = answer;
          }
          renderModalInto();
        }).catch((err) => {
          ui.reflectionBusy = false;
          ui.reflectionError = (err && err.message) || "That couldn't be checked.";
          renderModalInto();
        });
        break;
      }
      case "admin-restore-account":
      case "admin-keep-hidden": {
        const targetUid = el.dataset.uid;
        const restore = action === "admin-restore-account";
        ui.adminFlaggedBusy = true;
        renderPageInto();
        SYS.Cloud.callReviewSuspicion(targetUid, restore).then(() => {
          ui.adminFlaggedBusy = false;
          addToast({ kind: "info", text: (restore ? SYS.t("admin.restoreAccount") : SYS.t("admin.keepHidden")) + " ✓" });
          refreshAdminSuspicionQueue();
        }).catch((err) => {
          ui.adminFlaggedBusy = false;
          addToast({ kind: "info", text: (err && err.message) || "That didn't work." });
          renderPageInto();
        });
        break;
      }
      case "admin-accept-reflection":
      case "admin-reject-reflection": {
        const rid = el.dataset.id;
        const accept = action === "admin-accept-reflection";
        ui.adminReflectionBusy = true;
        renderPageInto();
        SYS.Cloud.callReviewReflection(rid, accept).then(() => {
          ui.adminReflectionBusy = false;
          addToast({ kind: "info", text: (accept ? SYS.t("admin.reflectAccept") : SYS.t("admin.reflectReject")) + " ✓" });
          refreshAdminReflectionQueue();
        }).catch((err) => {
          ui.adminReflectionBusy = false;
          addToast({ kind: "info", text: (err && err.message) || "That didn't work." });
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
      case "admin-export-appeals":
        // Writes every appeal, anonymised, to the evaluator's log, where the
        // eval work reads it — see exportAppealsForEval in functions/index.js.
        if (ui.adminExportBusy || !SYS.Cloud.callExportAppealsForEval) return;
        ui.adminExportBusy = true; ui.adminExportNote = null; ui.adminAppealError = null;
        renderPageInto();
        SYS.Cloud.callExportAppealsForEval().then((res) => {
          ui.adminExportBusy = false;
          ui.adminExportNote = SYS.t("admin.exportDone", { n: (res && res.count) || 0 });
          renderPageInto();
        }).catch((err) => {
          ui.adminExportBusy = false;
          ui.adminAppealError = (err && err.message) || "That didn't work.";
          renderPageInto();
        });
        break;

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
          reminders: SYS.reminderTimes(t), remindNote: t.remindNote || "",
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
            recurring: f.recurring, quit: !!f.quit, reminders: f.reminders, remindNote: f.remindNote, schedule: f.schedule, unit: resolvedUnit, targetAmount: f.targetAmount,
            traitTargets, priceId,
            // Which price this one replaces, so the server moves what the old
            // one already paid instead of paying the same work twice.
            fromPriceId: priceId && f.priceId && priceId !== f.priceId ? f.priceId : null,
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
          // Straight away, not on the next page change: a task that opens in
          // two days must not sit there looking ready for the seconds it takes
          // somebody to reach for it.
          refreshUnlocks(true);
          refreshReflections();
        };

        // An edit that changes what the task *is* gets priced again; an edit
        // that changes how it looks does not.
        //
        // Editing used to never re-evaluate, to stop someone editing until
        // they liked the number. That left the opposite and much larger hole:
        // "finish the app" priced at 1800, then retitled "play one football
        // match", keeps 1800 — and since the server pays from the stored
        // price, it pays the old one. Re-pricing is the honest side of the
        // trade: the value follows the task, the old evaluation is discarded,
        // and the daily evaluation cap is what stops the fishing.
        const original = isEdit ? state.tasks.find((x) => x.id === editId) : null;
        const materialEdit = !!original && (
          original.title.trim() !== f.title.trim() ||
          (original.notes || "").trim() !== (f.notes || "").trim() ||
          !!original.recurring !== !!f.recurring ||
          !!original.quit !== !!f.quit ||
          (original.recurring && (
            JSON.stringify(SYS.sanitizeSchedule(SYS.scheduleOf(original))) !== JSON.stringify(SYS.sanitizeSchedule(f.schedule)) ||
            original.unit !== resolvedUnit ||
            (Number(original.targetAmount) || 1) !== (Number(f.targetAmount) || 1)
          ))
        );
        if (isEdit && !materialEdit) { commit(f.pt, f.types, f.traitTargets, f.priceId); break; }
        // A re-priced task needs a description to be priced fairly, exactly as
        // a new one does — the check above skips edits, which is right up to
        // the moment the edit is the thing being priced.
        if (isEdit && (!f.notes || f.notes.trim().length < 10)) {
          f.error = SYS.t("form.needsDescription");
          renderAppInto();
          return;
        }

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

      case "complete-task": {
        const t = state.tasks.find((x) => x.id === id);
        if (t && refuseLocked(t)) return;
        runGameAction((draft) => SYS.completeSimpleTask(draft, id));
        break;
      }
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
        // Only going forward is held back. Taking progress off is always
        // allowed: it gives EXP back, and its hours with it.
        if (delta > 0 && refuseLocked(t)) return;
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
        if (refuseOldDay(logDay())) return;
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
        if (value > 0 && refuseOldDay(logDay())) return;
        runGameAction((draft) => SYS.addHabitAmount(draft, id, logDay(), value, unit));
        // The sheet stays up so a second helping is one press away, which is
        // the whole point of a keypad over a one-shot box.
        resetAmount();
        renderModalInto();
        break;
      }
      case "fill-day":
        if (refuseOldDay(logDay())) return;
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
        if (!SYS.habitDoneOn(task, day) && refuseOldDay(day)) return;
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
        if (ui.page === "quests" || ui.page === "habits" || ui.page === "overview") refreshUnlocks();
        if (ui.page === "quests" || ui.page === "overview") refreshReflections();
        if (ui.page === "leaderboard") refreshLeaderboard();
        if (ui.page === "planner") maybeAskCarry();
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
      case "open-time-sheet":
        if (!ui.taskForm) return;
        openTimeSheet(el.dataset.slot || "new");
        break;
      case "remove-reminder": {
        if (!ui.taskForm) return;
        const list = (ui.taskForm.reminders || []).slice();
        list.splice(Number(el.dataset.slot), 1);
        ui.taskForm.reminders = SYS.sanitizeReminders(list);
        renderAppInto();
        break;
      }
      case "tw-pick": {
        const col = el.closest(".tw-col");
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        col.scrollTo({ top: Number(el.dataset.i) * TW_ROW, behavior: reduce ? "auto" : "smooth" });
        break;
      }
      case "confirm-time": {
        const d = ui.timeDraft;
        if (ui.timeFor && ui.eventForm && d) {
          const f = ui.eventForm;
          const hhmm = String(d.h).padStart(2, "0") + ":" + String(d.m).padStart(2, "0");
          // Each time is set on its own; the end does not follow the start.
          // A start moved past the end makes a night, and the form says so.
          if (ui.timeFor === "from") f.from = hhmm;
          else f.to = hhmm;
          f.error = null;
          closeTimeSheet();
          break;
        }
        if (ui.taskForm && d) {
          const hhmm = String(d.h).padStart(2, "0") + ":" + String(d.m).padStart(2, "0");
          const list = (ui.taskForm.reminders || []).slice();
          const slot = ui.timeSlot;
          if (slot == null || slot === "new" || !(Number(slot) < list.length)) list.push(hhmm);
          else list[Number(slot)] = hhmm;
          // Sorted and deduplicated: a time added twice is one reminder.
          ui.taskForm.reminders = SYS.sanitizeReminders(list);
        }
        closeTimeSheet();
        renderAppInto();
        break;
      }
      case "close-time":
        closeTimeSheet();
        break;
      case "close-time-backdrop":
        if (e.target.closest("[data-stop-close]")) return;
        closeTimeSheet();
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

    // A notification tapped while the app was already open: sw.js focuses
    // this window and says where the notification pointed.
    navigator.serviceWorker.addEventListener("message", (event) => {
      const data = event.data || {};
      if (data.type !== "open" || typeof data.url !== "string") return;
      if (data.url.indexOf("#friends") >= 0) { openFriendsTab(); return; }
      if (data.url.indexOf("#admin") < 0) return;
      openAdminWhenReady = true;
      openAdminIfAsked();
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

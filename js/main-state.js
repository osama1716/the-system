
//
// App: the saved state and its migrations, the display state (ui), the timer, the brand mark,
// theme and language, and which account owns this device's copy.
// One of the files main.js was split into; the names they share travel through SYS._main.
(function (SYS) {
  "use strict";
  const M = SYS._main || (SYS._main = {});

  // action name → its click handler (filled by main-actions-*.js).
  const ACTIONS = {};

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
    // `out` IS `s`, so the merge on the next line replaces s.settings in
    // place. Anything the saved copy has to be judged on — rather than the
    // defaults it is about to be dressed in — is read here, first.
    const wasSaved = !!(s && s.settings);
    out.settings = { ...SYS.DEFAULT_SETTINGS, ...(out.settings || {}) };
    // These were once per-user settings. Saved copies still carry them, and
    // honouring a stale value would leave people on different rules — one
    // player earning three points a level next to another earning two, on the
    // same ranking. Dropped rather than migrated: there is nothing to keep.
    delete out.settings.expDivisor;
    delete out.settings.pointsPerLevel;
    // "Custom" was a palette the user built from two colours. The option is
    // gone, so a copy still on it lands on the default rather than on the
    // blank page an unknown name renders as. The two clock slots are checked
    // the same way, and each must hold a theme of its own kind.
    delete out.settings.customTheme;
    // Withdrawn traits, taken back only where nothing was earned against them.
    (SYS.RETIRED_TRAITS || []).forEach((r) => {
      const bucket = out.intelligences && out.intelligences[r.key];
      if (!bucket || !Array.isArray(bucket.traits)) return;
      const norm = SYS.normaliseName(r.name);
      bucket.traits = bucket.traits.filter((t) => !(SYS.normaliseName(t.name) === norm && !(Number(t.level) > 0)));
    });
    // The light themes and the day/night clock were withdrawn on 2026-10-07;
    // a copy still on one lands on the default dark theme.
    delete out.settings.themeAuto;
    delete out.settings.themeDay;
    delete out.settings.themeNight;
    if (!SYS.THEMES[out.settings.theme]) out.settings.theme = SYS.DEFAULT_SETTINGS.theme;
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
  // A device that has never saved anything: a first visit.
  const bootFresh = !SYS.Storage.load();
  M.state = normalizeState(SYS.Storage.load(), bootMigration);
  // A first visit opens in the browser's language when the app speaks it.
  if (bootFresh) {
    try {
      const pick = (navigator.languages || [navigator.language]).map((l) => String(l || "").slice(0, 2).toLowerCase())
        .find((c) => SYS.LANGUAGES && SYS.LANGUAGES[c]);
      if (pick) M.state.settings.language = pick;
    } catch (e) {}
  }
  SYS.pruneDailyStats(M.state);
  if (bootMigration.migrated) SYS.Storage.save(M.state);
  M.state.planner = SYS.PlannerSync.view();

  // The saved state without the planner, for comparing two copies of it: the
  // planner is not in the stored copy, and syncs by itself.
  function stateOnly(s) {
    const { planner, ...rest } = s || {};
    return rest;
  }

  // A fresh copy of the screen's own state. The landing page draws real
  // pages with it, so it lives in a function rather than one literal.
  function freshUi() {
  return {
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
    // The season's board opens first once a season is running.
    lbMode: SYS.currentSeason().upcoming ? "total" : "season",
    // One intelligence's board, or null for everything. All-time only: the
    // week's board has no per-intelligence figure.
    friendships: [],
    friendRows: {},
    myRow: null,
    friendRequestsIn: 0,
    friendsWeek: false,
    friendSearch: "",
    friendSort: "exp",
    friendResults: null,
    friendSearchBusy: false,
    searchRows: {},
    avatars: {},
    friendBusy: false,
    inviteBusy: false,
    inviteLink: null,
    races: [],
    raceScores: {},
    raceScoresBusy: false,
    raceForm: null,
    compareUid: null,
    compare: null,
    adminReports: [],
    adminTab: null,
    adminRefreshedAt: null,
    adminReportBusy: false,
    // Feedback: the form, this player's past messages, and the admin queue.
    feedback: null,
    myFeedback: null,
    adminFeedback: [],
    adminFeedbackBusy: false,
    adminFeedbackReply: {},
    adminFeedbackShots: {},
    // Deleting the account, and reporting what the AI said.
    deleteAccount: null,
    aiReport: null,
    lastAiEval: null,
    adminAiReports: [],
    adminAiReportBusy: false,
    plannerDraft: "",
    plannerEdit: null,
    carrySel: null,
    questFilter: "all",
    logFilter: "all",
    intelSort: "level",
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
  }
  const ui = freshUi();
  // tests/test-phone-layout.js opens the app with ?uitest on a local server
  // and fills the display state with sample data to check every page at
  // phone width. Nowhere else does this exist.
  if (/[?&]uitest(&|$)/.test(location.search) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    SYS.__uiTest = { ui, getState: () => M.state, setState: (s) => { M.state = s; }, render: () => { M.renderAppInto(); M.renderModalInto(); } };
  }
  // The last account's portrait and frame, kept on the device so the status
  // bar shows them at once instead of after sign-in and a profile fetch.
  const ME_KEY = "the-system:me";
  try {
    const me = JSON.parse(localStorage.getItem(ME_KEY) || "null");
    if (me && me.uid) {
      ui.lastMe = { uid: me.uid };
      ui.avatars = { ...(ui.avatars || {}), [me.uid]: me.avatar || null };
      ui.frames = { ...(ui.frames || {}), [me.uid]: me.frame || null };
    }
  } catch (e) {}
  // The profile shows your portrait at 256px, a file the status bar never
  // asked for; fetched ahead, it is there when the profile opens.
  function warmMyPortrait(uid) {
    const id = (ui.avatars || {})[uid];
    const safe = id && SYS.AVATARS[id] ? id : SYS.defaultAvatarFor(uid);
    try { new Image().src = SYS.avatarSrc(safe, 256); } catch (e) {}
  }
  if (ui.lastMe) warmMyPortrait(ui.lastMe.uid);
  function rememberMe() {
    if (!ui.cloudUser) return;
    const uid = ui.cloudUser.uid;
    warmMyPortrait(uid);
    try { localStorage.setItem(ME_KEY, JSON.stringify({ uid, avatar: (ui.avatars || {})[uid] || null, frame: (ui.frames || {})[uid] || null })); } catch (e) {}
  }
  SYS.freshUi = freshUi;

  M.toastSeq = 0;
  M.armedTimer = null;
  M.rankupTimer = null;
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
    const task = M.state.tasks.find((x) => x.id === saved.taskId);
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
      M.pendingCountdownFinish = true;
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
    M.runGameAction((draft) => SYS.addHabitAmount(draft, taskId, SYS.todayKey(), seconds, "sec"));
    return seconds;
  }

  // A session worth protecting: anything under a second is a stray tap.
  function timerHasTime() {
    if (!ui.timer) return false;
    const ms = ui.timer.accumulatedMs + (ui.timer.running ? Date.now() - ui.timer.startedAt : 0);
    return ms >= 1000;
  }

  let timerTickInterval = null;
  M.pendingCountdownFinish = false;
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
    const task = M.state.tasks.find((x) => x.id === ui.timer.taskId);
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
    const task = M.state.tasks.find((x) => x.id === ui.timer.taskId);
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
    if (SYS.playEndSound) SYS.playEndSound((M.state.settings || {}).endSound || "default");
    // Writes the tail. Everything before it went in as the clock ran, so
    // after this the habit holds exactly the goal it was counting down to.
    flushTimer();
    const task = M.state.tasks.find((x) => x.id === taskId);
    const session = Math.floor((Number(ui.timer.loggedMs) || 0) / 1000);
    ui.timer = null;
    saveTimer();
    const wasOpen = ui.modal === "timer";
    if (wasOpen) { ui.modal = null; ui.timerPanel = null; }
    // The session is what gets announced — what this sitting was worth, not
    // the goal, which the card already shows as met.
    const underAMinute = session < 60;
    M.addToast({ kind: "info", text: SYS.t("timer.autoLogged", {
      amount: underAMinute ? Math.max(1, session) : Math.round(session / 60),
      unit: SYS.tUnit(underAMinute ? "sec" : "min"),
      title: (task && task.title) || "",
    }) });
    if (wasOpen) M.renderModalInto();
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
    const host = M.$sidebar.querySelector(".brand");
    if (!host || !host.getAnimations) return [];
    return [host, ...host.querySelectorAll("*")]
      .reduce((all, el) => all.concat(el.getAnimations ? el.getAnimations() : []), []);
  }

  function resumeBrandAfterRender() {
    if (!M.$sidebar.classList.contains("is-playing")) return;
    const elapsed = Date.now() - brandStartedAt;
    if (elapsed >= BRAND_MS) return;
    brandAnimations().forEach((a) => { try { a.currentTime = elapsed; } catch (e) {} });
  }

  function playBrand() {
    if (M.$sidebar.classList.contains("is-playing")) return;
    brandStartedAt = Date.now();
    M.$sidebar.classList.add("is-playing");
    const stop = () => {
      if (brandTimer) { clearTimeout(brandTimer); brandTimer = null; }
      M.$sidebar.classList.remove("is-playing");
    };
    // Bubbles from whichever of the three ends first; they share a duration.
    M.$sidebar.addEventListener("animationend", stop, { once: true });
    // Behind it, in case nothing animates at all — reduced motion, a hidden
    // tab — so the class cannot be left on for ever.
    brandTimer = setTimeout(stop, BRAND_MS + 400);
  }

  function maybePlayBrandOnLaunch() {
    if (BRAND_PLAY === "never") return;
    playBrand();
  }

  function applyThemeAttribute() {
    SYS.applyTheme(M.state);
  }

  // Language drives both the strings and the writing direction — Arabic
  // needs the whole layout mirrored, which CSS keys off <html dir>.
  function applyLanguage() {
    SYS.setLanguageCode(M.state.settings.language);
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
      if (ui.modal === "syncChoice") M.renderModalInto();
      if (pushFailureReported) return;
      pushFailureReported = true;
      const code = err && err.code;
      const detail = ui.isAdmin && code === "permission-denied"
        ? " " + SYS.t("sync.pushDeniedAdmin")
        : "";
      M.addToast({ kind: "info", sticky: true, text: SYS.t("sync.pushFailed") + detail });
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
  // Which account the copy on this device belongs to. Without it, signing out
  // of one account and into another merged the first account's tasks into
  // the second as if they were edits made there — tasks whose prices belong
  // to the other account, so the server refused every point they earned. The
  // planner already kept its items per account (planner-sync.js adoptUser);
  // this is the same rule for the rest of the state.
  const OWNER_KEY = "the-system:stateOwner";
  // Written at sign-out, when the device has just been emptied. It must never
  // read as "no owner yet": an empty copy merged against an account's last
  // known state reads as every task deleted and the name changed, and that
  // merge was pushed — it emptied the admin account on 2026-10-03. Any account
  // signing in after a sign-out takes its own copy whole.
  const SIGNED_OUT = "~signed-out";
  function readOwner() { try { return localStorage.getItem(OWNER_KEY) || null; } catch (e) { return null; } }
  function writeOwner(uid) {
    try { if (uid) localStorage.setItem(OWNER_KEY, uid); else localStorage.removeItem(OWNER_KEY); } catch (e) { /* storage blocked */ }
    // Saves follow the owner: none reach an account until its copy is here.
    if (SYS.Cloud && SYS.Cloud.setPushOwner) SYS.Cloud.setPushOwner(uid && uid !== SIGNED_OUT ? uid : null);
  }
  // Whether the copy on this device is the signed-in account's own.
  function ownsState() { return !!(ui.cloudUser && readOwner() === ui.cloudUser.uid); }

  // A fresh copy for a device that no longer holds anyone's account: after a
  // sign-out, or when another account signs in that has nothing stored yet.
  // Language and theme stay, because they belong to the device. The opening
  // test is marked as settled so a sign-out does not greet the same person
  // with forty questions; an account that has its own copy brings its own.
  function freshLocalState() {
    const fresh = SYS.defaultState();
    // The theme goes back to the free one: the next account may not own it.
    ["language"].forEach((k) => {
      if (M.state && M.state.settings && k in M.state.settings) fresh.settings[k] = M.state.settings[k];
    });
    fresh.assessment = { takenAt: Date.now(), answers: {}, granted: {}, neverTried: [], skipped: true };
    return fresh;
  }
  function resetLocalState() {
    M.state = normalizeState(freshLocalState(), migrationReport());
    SYS.Storage.save(M.state);
    M.expQueue = [];
    SYS.Storage.saveExpQueue(M.expQueue);
    ui.assess = null;
    ui.leaderboard = null; ui.leaderboardMine = null;
    M.renderAssessmentInto();
    applyThemeAttribute();
    M.renderAppInto();
  }

  Object.assign(M, { syncDefaultIntTypeColors, migrationReport, normalizeState, bootMigration, bootFresh, stateOnly, freshUi, ui, ME_KEY, warmMyPortrait, rememberMe, TIMER_KEY, TIMER_MAX_MS, saveTimer, restoreTimer, TIMER_FLUSH_MS, flushTimer, timerHasTime, timerTickInterval, startTimerTick, updateTimerFace, countdownRemaining, finishCountdown, stopTimerTick, BRAND_PLAY, BRAND_MS, brandTimer, brandStartedAt, brandAnimations, resumeBrandAfterRender, playBrand, maybePlayBrandOnLaunch, applyThemeAttribute, applyLanguage, pushFailureReported, OWNER_KEY, SIGNED_OUT, readOwner, writeOwner, ownsState, freshLocalState, resetLocalState, ACTIONS });
})(window.SYS = window.SYS || {});

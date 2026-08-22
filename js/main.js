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
  function normalizeState(s) {
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
    return out;
  }

  let state = normalizeState(SYS.Storage.load());
  SYS.pruneDailyStats(state);

  const ui = {
    page: "overview",
    questFilter: "all",
    statsSpan: "week",
    statsWeekOffset: 0,
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
  let timerTickInterval = null;
  function startTimerTick() {
    stopTimerTick();
    timerTickInterval = setInterval(() => { if (ui.modal === "timer" && ui.timer) renderModalInto(); }, 1000);
  }
  function stopTimerTick() {
    if (timerTickInterval) { clearInterval(timerTickInterval); timerTickInterval = null; }
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
  function reconcileExpWithServer() {
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.cloudUser) return;
    // Anything of ours still unsent means the server is legitimately behind,
    // not that we are ahead dishonestly. Correcting now would delete real
    // work done offline — the one mistake this must never make.
    if (expQueue.length || expFlushing) return;

    SYS.Cloud.fetchExpSummary().then((summary) => {
      if (!summary) return;
      ui.expMonths = summary.months;
      if (ui.page === "stats" && ui.statsSpan === "lifetime") renderPageInto();
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
  function persist(s) {
    SYS.Storage.save(s);
    if (SYS.Cloud && SYS.Cloud.available()) SYS.Cloud.push(s);
  }

  const $sidebar = document.getElementById("sidebar");
  const $statusbar = document.getElementById("statusbar");
  const $page = document.getElementById("page");
  const $notif = document.getElementById("notif-stack");
  const $rankup = document.getElementById("rankup-layer");
  const $modal = document.getElementById("modal-layer");
  const $importInput = document.getElementById("import-file-input");

  function renderSidebarInto() { $sidebar.innerHTML = SYS.renderSidebar(ui); }
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
  function renderNotifInto() { $notif.innerHTML = SYS.renderNotifStack(ui); }
  function renderRankupInto() { $rankup.innerHTML = SYS.renderRankupLayer(ui); }

  function setPath(obj, path, value) {
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
    cur[parts[parts.length - 1]] = value;
  }

  function addToast(n) {
    const id = ++toastSeq;
    ui.toasts.push({ ...n, id });
    renderNotifInto();
    // A sticky notification waits to be dealt with instead of timing out.
    // Used for the new-version prompt: an announcement that disappears after
    // four seconds is one most people will never happen to be looking at.
    if (!n.sticky) {
      setTimeout(() => { ui.toasts = ui.toasts.filter((x) => x.id !== id); renderNotifInto(); }, 4200);
    }
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
    state = normalizeState(newState);
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
        const cloudState = raw ? normalizeState(raw) : null;
        if (!cloudState) {
          SYS.Cloud.push(state);
        } else if (!SYS.deepEqual(cloudState, state)) {
          // Only a genuine conflict — cloud has something different from what's
          // already here — warrants asking. Firebase keeps you signed in across
          // reloads, so this callback fires on every single app open, not just
          // the first one; without this check it would ask every time even
          // when the two copies already agree.
          ui.pendingCloudState = cloudState;
          ui.modal = "syncChoice";
          renderModalInto();
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
    const bind = e.target.dataset && e.target.dataset.bind;
    if (bind) { setPath(ui, bind, e.target.value); return; }
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
    if (e.target.dataset && e.target.dataset.action === "change-task-type") {
      if (!ui.taskForm) return;
      if (ui.taskForm.taskType === "Long Term" && !["gradual", "allAtOnce"].includes(ui.taskForm.expMode)) {
        ui.taskForm.expMode = "gradual";
      }
      renderAppInto();
    }
  });

  document.addEventListener("keydown", (e) => {
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
      case "spend-banked":
        runGameAction((draft) => {
          const name = SYS.spendBankedPoint(draft, key);
          return name ? [{ kind: "skillpoint", text: `+1 pt → ${name} (manual)` }] : [];
        });
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
          recurring: false, repeatsPerWeek: 3, unit: "reps", targetAmount: 1, customUnit: "",
        };
        renderAppInto();
        break;
      case "open-habit-form":
        ui.taskForm = {
          formKind: "add", editId: null, title: "", priority: "Medium", taskType: "Short Term", types: [], pt: 20, expMode: "simple",
          notes: "", error: null, busy: false, lockType: true,
          recurring: true, repeatsPerWeek: 3, unit: "reps", targetAmount: 1, customUnit: "",
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
          repeatsPerWeek: t.repeatsPerWeek || 3,
          unit: t.recurring ? (unitIsKnown ? t.unit : "custom") : "reps",
          targetAmount: t.targetAmount || 1,
          customUnit: t.recurring && !unitIsKnown ? t.unit : "",
        };
        renderAppInto();
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
            recurring: f.recurring, repeatsPerWeek: f.repeatsPerWeek, unit: resolvedUnit, targetAmount: f.targetAmount,
            traitTargets, priceId,
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
          repeatsPerWeek: f.repeatsPerWeek,
          unit: resolvedUnit,
          targetAmount: f.targetAmount,
        }).then((result) => {
          commit(result.pt, result.types || [], result.traitTargets || [], result.priceId);
          addToast({
            kind: "info",
            text: result.rationale
              ? `+${result.pt} xp — ${result.rationale}`
              : `The system valued this at +${result.pt} xp.`,
          });
        }).catch((err) => {
          if (!ui.taskForm) return; // form was closed while the call was in flight
          ui.taskForm.busy = false;
          ui.taskForm.error = err.message || "The system couldn't evaluate that. Try again.";
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
      case "log-repeat":
        runGameAction((draft) => SYS.logRecurringRepeat(draft, id));
        break;
      case "undo-repeat":
        runGameAction((draft) => SYS.undoLastRecurringRepeat(draft, id));
        break;

      case "open-timer":
        stopTimerTick();
        ui.timer = { taskId: id, running: false, startedAt: null, accumulatedMs: 0 };
        ui.modal = "timer";
        renderModalInto();
        break;
      case "timer-start":
        if (!ui.timer) return;
        ui.timer.running = true;
        ui.timer.startedAt = Date.now();
        renderModalInto();
        startTimerTick();
        break;
      case "timer-pause":
        if (!ui.timer || !ui.timer.running) return;
        ui.timer.accumulatedMs += Date.now() - ui.timer.startedAt;
        ui.timer.running = false;
        ui.timer.startedAt = null;
        stopTimerTick();
        renderModalInto();
        break;
      case "timer-stop-log": {
        if (!ui.timer) return;
        const elapsedMs = ui.timer.accumulatedMs + (ui.timer.running ? Date.now() - ui.timer.startedAt : 0);
        if (elapsedMs < 1000) return;
        const taskId = ui.timer.taskId;
        const t = state.tasks.find((x) => x.id === taskId);
        const unit = t ? t.unit : "min";
        let amount;
        if (unit === "sec") amount = Math.round(elapsedMs / 1000);
        else if (unit === "hr") amount = Math.round((elapsedMs / 3600000) * 10) / 10;
        else amount = Math.round((elapsedMs / 60000) * 10) / 10; // min, or any other unit — minutes is the sane default
        stopTimerTick();
        ui.timer = null;
        ui.modal = null;
        runGameAction((draft) => SYS.logRecurringRepeat(draft, taskId, amount));
        break;
      }
      case "close-timer":
        stopTimerTick();
        ui.timer = null;
        ui.modal = null;
        renderModalInto();
        break;
      case "close-timer-backdrop":
        if (e.target.closest("[data-stop-close]")) return;
        stopTimerTick();
        ui.timer = null;
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
        break;
      case "refresh-leaderboard":
        refreshLeaderboard();
        break;

      case "reload-app":
        location.reload();
        break;
      case "dismiss-toast": {
        const toastId = Number(el.dataset.id);
        ui.toasts = ui.toasts.filter((x) => x.id !== toastId);
        renderNotifInto();
        break;
      }
      case "set-quest-filter":
        ui.questFilter = el.dataset.filter;
        renderPageInto();
        break;
      case "set-stats-span":
        ui.statsSpan = el.dataset.span;
        renderPageInto();
        // The long view lives on the server, so opening it is a reason to go
        // and get it rather than wait for the next sync to bring it along.
        if (ui.statsSpan === "lifetime" && !ui.expMonths) reconcileExpWithServer();
        break;
      case "set-stats-week-offset":
        ui.statsWeekOffset = el.dataset.delta === "reset" ? 0 : ui.statsWeekOffset + Number(el.dataset.delta);
        renderPageInto();
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
    renderAppInto();
    renderNotifInto();
    renderRankupInto();
    renderModalInto();
    scheduleNextDayRollover();
    watchForUpdates();
    markRecovery(false);
  } catch (err) {
    if (!recoverOnce(err)) bootFailed(err);
  }
})(window.SYS = window.SYS || {});

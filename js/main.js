(function (SYS) {
  "use strict";

  let state = SYS.Storage.load() || SYS.defaultState();
  // Defensive merge in case a save predates a field added later.
  state.settings = { ...SYS.DEFAULT_SETTINGS, ...(state.settings || {}) };
  state.intTypes = Array.isArray(state.intTypes) && state.intTypes.length ? state.intTypes : SYS.DEFAULT_INT_TYPES.map((t) => ({ ...t }));
  state.levelHistory = Array.isArray(state.levelHistory) ? state.levelHistory : [];
  state.dailyStats = state.dailyStats && typeof state.dailyStats === "object" ? state.dailyStats : {};
  SYS.pruneDailyStats(state);
  // The 8 built-in categories have no "edit color" UI, so any saved color on
  // one of these keys can only be a stale palette from a previous version of
  // the app — keep them synced to the current design tokens. Custom
  // user-added categories (picked via the color input) are left untouched.
  function syncDefaultIntTypeColors(intTypes) {
    const defaultColors = new Map(SYS.DEFAULT_INT_TYPES.map((t) => [t.key, t.color]));
    return intTypes.map((t) => defaultColors.has(t.key) ? { ...t, color: defaultColors.get(t.key) } : { ...t, color: SYS.sanitizeColor(t.color) });
  }
  {
    const migrated = syncDefaultIntTypeColors(state.intTypes);
    if (JSON.stringify(migrated) !== JSON.stringify(state.intTypes)) {
      state.intTypes = migrated;
      persist(state);
    }
  }

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
    missionForm: null, // { title, description, error, busy } when the compose form is open
    mySubmissions: [],
    adminMissionQueue: [],
    adminMissionBusy: false,
    adminMissionError: null,
    adminMissionPoints: {}, // { [missionId]: draft points value string }
    inbox: [],
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
    document.documentElement.setAttribute("data-theme", state.settings.theme === "White & gold" ? "light" : "dark");
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
    setTimeout(() => { ui.toasts = ui.toasts.filter((x) => x.id !== id); renderNotifInto(); }, 4200);
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
    ui.nameEditing = false;
    ui.__nameDraft = null;
    runGameAction((draft) => { SYS.setName(draft, val); return []; });
  }

  // Replaces the whole app state with one pulled from the cloud (initial
  // sign-in reconciliation, or a newer copy found on focus-regain). Saves it
  // locally too but deliberately does NOT push back to the cloud — that
  // would just be echoing back what we were given.
  function applyRemoteState(newState) {
    state = newState;
    state.intTypes = Array.isArray(state.intTypes) ? syncDefaultIntTypeColors(state.intTypes) : SYS.DEFAULT_INT_TYPES.map((t) => ({ ...t }));
    SYS.Storage.save(state);
    applyThemeAttribute();
    renderAppInto();
  }

  // Applies any admin-authorized EXP grants (mission approvals, bonuses/
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
        runGameAction((draft) => SYS.applyExpDelta(draft, g.amount, [], g.reason || "The System"));
        SYS.Cloud.consumeGrant(g.id);
      });
      refreshMySubmissions(); // an approved/rejected mission's status may have just changed
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

  // Refreshes the signed-in user's own mission submissions list (status may
  // have changed since an admin reviewed one) — called alongside
  // applyPendingGrants at the same points, same reasoning: no live listener,
  // just checked on sign-in and focus-regain.
  function refreshMySubmissions() {
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.cloudUser) return;
    SYS.Cloud.fetchMySubmissions().then((list) => {
      ui.mySubmissions = list;
      if (ui.page === "quests") renderPageInto();
    }).catch(() => {});
  }

  function refreshAdminMissionQueue() {
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.isAdmin) return;
    ui.adminMissionBusy = true;
    renderPageInto();
    SYS.Cloud.fetchPendingMissions().then((list) => {
      ui.adminMissionBusy = false;
      ui.adminMissionQueue = list;
      renderPageInto();
    }).catch((err) => {
      ui.adminMissionBusy = false;
      ui.adminMissionError = err.message || "Couldn't load the queue.";
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
      applyPendingGrants();
      refreshMySubmissions();
      refreshInbox();
      SYS.Cloud.pull().then((cloudState) => {
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
    refreshMySubmissions();
    refreshInbox();
    SYS.Cloud.pullIfNewer().then((newState) => {
      if (newState) {
        applyRemoteState(newState);
        addToast({ kind: "info", text: "Synced from another device." });
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
      addToast({ kind: "info", text: "Backup imported successfully." });
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
      case "save-settings": {
        const d = ui.settingsDraft;
        ui.modal = null;
        runGameAction((draft) => { SYS.updateSettings(draft, d); return []; });
        renderModalInto();
        break;
      }
      case "set-theme": {
        const themeName = el.dataset.theme;
        runGameAction((draft) => { SYS.setTheme(draft, themeName); return []; });
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
        if (!f.email || !f.password) { f.error = "Enter an email and password."; renderModalInto(); return; }
        const wasSignup = f.mode === "signup";
        f.busy = true; f.error = null; f.info = null;
        renderModalInto();
        const req = wasSignup ? SYS.Cloud.signUp(f.email, f.password) : SYS.Cloud.signIn(f.email, f.password);
        req.then(() => {
          ui.accountForm = { mode: "signin", email: "", password: "", error: null, info: null, busy: false };
          renderModalInto();
          if (wasSignup) addToast({ kind: "info", text: "Account created — check your email to verify it." });
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
            ? "Your browser blocked the popup — allow popups for this site and try again."
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
        if (!f.email) { f.error = "Enter your email above first, then tap this again."; renderModalInto(); return; }
        SYS.Cloud.sendPasswordReset(f.email).then(() => {
          f.info = "Password reset email sent — check your inbox.";
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
        const email = (ui.adminSearchEmail || "").trim();
        ui.adminSearchError = null; ui.adminResult = null;
        if (!email) { ui.adminSearchError = "Enter an email."; renderPageInto(); return; }
        ui.adminBusy = true;
        renderPageInto();
        SYS.Cloud.findUserByEmail(email).then((found) => {
          if (!found) { ui.adminBusy = false; ui.adminSearchError = "No account found with that email."; renderPageInto(); return; }
          return Promise.all([
            SYS.Cloud.fetchUserState(found.uid),
            SYS.Cloud.callGetAdminStatus(found.uid),
          ]).then(([data, status]) => {
            ui.adminBusy = false;
            ui.adminResult = { uid: found.uid, email: found.email, state: data ? data.state : null, isTargetAdmin: status.admin };
            renderPageInto();
          });
        }).catch((err) => {
          ui.adminBusy = false;
          ui.adminSearchError = err.message || "Search failed.";
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
        addToast({ kind: "info", text: "Backup downloaded." });
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
        if (!d || !d.name.trim()) { ui.addCategoryError = "Name is required."; renderModalInto(); return; }
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
      case "open-mission-form":
        ui.missionForm = { title: "", description: "", error: null, busy: false };
        renderPageInto();
        break;
      case "cancel-mission-form":
        ui.missionForm = null;
        renderPageInto();
        break;
      case "submit-mission-form": {
        const f = ui.missionForm;
        if (!f) return;
        if (!f.title.trim()) { f.error = "Give it a title."; renderPageInto(); return; }
        f.busy = true; f.error = null;
        renderPageInto();
        SYS.Cloud.createMissionSubmission(f.title, f.description).then(() => {
          ui.missionForm = null;
          addToast({ kind: "info", text: "Mission submitted — waiting for admin approval." });
          refreshMySubmissions();
          renderPageInto();
        }).catch((err) => {
          f.busy = false;
          f.error = err.message || "Couldn't submit that.";
          renderPageInto();
        });
        break;
      }

      case "admin-refresh-missions":
        refreshAdminMissionQueue();
        break;
      case "admin-approve-mission": {
        const missionId = el.dataset.id;
        const pointsRaw = ui.adminMissionPoints[missionId];
        const points = Number(pointsRaw);
        if (!Number.isFinite(points) || points <= 0) {
          ui.adminMissionError = "Enter a positive point value first.";
          renderPageInto();
          return;
        }
        ui.adminMissionBusy = true; ui.adminMissionError = null;
        renderPageInto();
        SYS.Cloud.callApproveMission(missionId, points).then(() => {
          ui.adminMissionBusy = false;
          addToast({ kind: "info", text: `Approved for +${points} EXP.` });
          refreshAdminMissionQueue();
        }).catch((err) => {
          ui.adminMissionBusy = false;
          ui.adminMissionError = err.message || "Approval failed.";
          renderPageInto();
        });
        break;
      }
      case "admin-reject-mission": {
        const missionId = el.dataset.id;
        ui.adminMissionBusy = true; ui.adminMissionError = null;
        renderPageInto();
        SYS.Cloud.callRejectMission(missionId).then(() => {
          ui.adminMissionBusy = false;
          addToast({ kind: "info", text: "Mission rejected." });
          refreshAdminMissionQueue();
        }).catch((err) => {
          ui.adminMissionBusy = false;
          ui.adminMissionError = err.message || "That didn't work.";
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
        if (!text) { ui.adminMsgError = "Write a message first."; renderPageInto(); return; }
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
          pt: t.pt, expMode: t.mode === "gradual" ? "gradual" : "allAtOnce", notes: t.notes || "", error: null, busy: false, lockType: false,
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
        if (!f.title || !f.title.trim()) { f.error = "Quest needs a title."; renderAppInto(); return; }
        const resolvedUnit = f.unit === "custom" ? ((f.customUnit || "").trim() || "unit") : f.unit;
        const isEdit = f.formKind === "edit";
        const editId = f.editId;

        const commit = (pt, types) => {
          const formForEngine = {
            title: f.title, priority: f.priority, taskType: f.taskType, types, pt, mode: f.expMode, notes: f.notes,
            recurring: f.recurring, repeatsPerWeek: f.repeatsPerWeek, unit: resolvedUnit, targetAmount: f.targetAmount,
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
        if (isEdit) { commit(f.pt, f.types); break; }

        if (!SYS.Cloud || !SYS.Cloud.available() || !ui.cloudUser) {
          f.error = "Sign in to add a task — the system has to set its value.";
          renderAppInto();
          return;
        }
        if (!navigator.onLine) {
          f.error = "You're offline. Adding a task needs a connection so the system can evaluate it.";
          renderAppInto();
          return;
        }

        f.busy = true; f.error = null;
        renderAppInto();
        SYS.Cloud.callEvaluateTask({
          title: f.title,
          description: f.notes,
          kind: f.recurring ? "habit" : "quest",
          taskType: f.taskType,
          repeatsPerWeek: f.repeatsPerWeek,
          unit: resolvedUnit,
          targetAmount: f.targetAmount,
        }).then((result) => {
          commit(result.pt, result.types || []);
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
        if (ui.page === "admin") refreshAdminMissionQueue();
        break;
      case "set-quest-filter":
        ui.questFilter = el.dataset.filter;
        renderPageInto();
        break;
      case "set-stats-span":
        ui.statsSpan = el.dataset.span;
        renderPageInto();
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

  // ---------------- boot ----------------
  applyThemeAttribute();
  renderAppInto();
  renderNotifInto();
  renderRankupInto();
  renderModalInto();
  scheduleNextDayRollover();
})(window.SYS = window.SYS || {});

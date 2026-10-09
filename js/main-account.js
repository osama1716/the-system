// App: import, renaming, the server's copy of the state, grants, inbox, suggestions, the ranking,
// signing in and the account's start-up.
// One of the files main.js was split into; the names they share travel through SYS._main.
(function (SYS) {
  "use strict";
  const M = SYS._main || (SYS._main = {});
  const { ME_KEY, SIGNED_OUT, applyLanguage, applyThemeAttribute, bootMigration, closeAssessmentIfDone, flushExpQueue, leaveLanding, migrationReport, normalizeState, noteVisit, ownsState, processNotifications, readOwner, reconcileExpWithServer, refreshAdminReflectionQueue, refreshAdminStats, refreshAdminSuspicionQueue, refreshMyWorn, refreshStreak, resetLocalState, resolveOrAsk, stateOnly, syncDefaultIntTypeColors, ui, watchWallet, writeOwner } = M;

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
    const previous = M.state.player.name;
    ui.nameEditing = false;
    ui.__nameDraft = null;
    M.runGameAction((draft) => { SYS.setName(draft, val); return []; });

    // Signed out the name is private and local, so nothing to reserve. Signed
    // in it has to be unique — the server decides, and the local value is
    // rolled back if the claim is refused so the two never disagree.
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.cloudUser || val === previous) return;
    SYS.Cloud.callClaimUsername(val).then((res) => {
      // The server trims and collapses spacing; adopt exactly what it stored.
      ui.nameClaimed = true;
      if (res.name !== val) M.runGameAction((draft) => { SYS.setName(draft, res.name); return []; });
      if (ui.modal === "settings") M.renderModalInto();
    }).catch((err) => {
      M.runGameAction((draft) => { SYS.setName(draft, previous); return []; });
      // The function's own message is English; a cooldown rejection carries a
      // machine-readable reason precisely so this side can say it in the
      // reader's language, with the wait spelled out rather than implied.
      const details = err && err.details;
      M.addToast({
        kind: "info",
        text: details && details.reason === "cooldown"
          ? SYS.t("name.cooldown", { days: details.availableInDays })
          : details && details.code === "not-allowed" ? M.refusalText(err)
          : details && details.code === "rename-limit" ? SYS.t("name.tooMany")
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
    M.state = normalizeState(newState, migrationReport());
    SYS.Storage.save(M.state);
    // This is now the copy both sides share.
    if (SYS.Cloud && SYS.Cloud.setBase) SYS.Cloud.setBase(M.state);
    M.state.planner = SYS.PlannerSync.view();
    closeAssessmentIfDone();
    applyLanguage();
    applyThemeAttribute();
    M.renderAppInto();
    M.maybeAskCarry();
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
    // Not yet this account's copy: the grant waits, unconsumed, rather than
    // landing on a copy that is about to be replaced and being lost with it.
    if (!ownsState()) return;
    const fresh = grants.filter((g) => !appliedGrantIds.has(g.id));
    if (!fresh.length) return;
    fresh.forEach((g) => {
      appliedGrantIds.add(g.id);
      // Two kinds of grant: a flat EXP amount (bonus/penalty), or a task
      // repricing from a resolved appeal, which recomputes its own delta.
      if (g.repriceTask && g.repriceTask.taskId) {
        M.runGameAction((draft) => SYS.repriceTask(draft, g.repriceTask.taskId, g.repriceTask.newPt));
      } else {
        // An adjustment the server already wrote into the journal is applied
        // to this device's EXP without being reported a second time.
        const wasSuppressed = SYS.suppressExpJournal;
        if (g.journaled) SYS.suppressExpJournal = true;
        try {
          M.runGameAction((draft) => SYS.applyExpDelta(draft, g.amount, [], g.reason || "The System"));
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
      M.renderSidebarInto();
      if (ui.page === "log") M.renderPageInto();
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
      if (ui.page === "quests") M.renderPageInto();
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
    if (ui.page === "quests") M.renderPageInto();

    SYS.Cloud.callSuggestQuests().then((res) => {
      ui.suggestions = res;
      // A new week wipes the record of what was answered — those ids belong to
      // last week's set and will never be seen again.
      if (M.state.suggestions.weekKey !== res.weekKey) {
        M.runGameAction((draft) => { draft.suggestions = { weekKey: res.weekKey, handled: [] }; return []; });
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
      if (ui.page === "quests") M.renderPageInto();
    });
  }

  function markSuggestionHandled(id) {
    M.runGameAction((draft) => {
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
    if (ui.page === "leaderboard") M.renderPageInto();

    const cat = null;
    const asked = ui.lbMode + "|" + cat;
    SYS.Cloud.fetchLeaderboardPage(ui.lbMode, cat, null).then((page) => {
      // Switching boards while this was in flight: the answer is for a board
      // nobody is looking at any more.
      if ((ui.lbMode + "|" + null) !== asked) return null;
      const rows = page.rows;
      ui.leaderboardCursor = page.last;
      ui.leaderboardMore = page.more;
      // An account the suspicion check took off the ranking stays in the
      // collection — its standing is untouched — but is not shown. If it is
      // this person's own, they are told it is under review rather than left
      // wondering where they went.
      ui.leaderboard = rows.filter((r) => !r.hidden);
      // The faces beside the names, for the rows actually on screen.
      M.loadAvatars(ui.leaderboard.slice(0, 30).map((r) => r.uid));
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
          if (!ui.leaderboardMine) return null;
          // On one intelligence's board, someone with nothing in it is not
          // ranked below everyone; they are simply not on it.
          if (cat) {
            const mineCat = Number((ui.leaderboardMine.cats || {})[cat]) || 0;
            return mineCat > 0 ? SYS.Cloud.fetchMyRank(mineCat, "cats." + cat) : null;
          }
          return SYS.Cloud.fetchMyRank(Number(ui.leaderboardMine.totalExp) || 0);
        })
        .then((position) => { ui.leaderboardMyPosition = position; });
    }).then(() => {
      ui.leaderboardBusy = false;
      if (ui.page === "leaderboard") M.renderPageInto();
    }).catch((err) => {
      // The real error is a Firestore code in English; the page shows the
      // translated line and the detail goes to the console.
      console.warn("[TheSystem] leaderboard fetch failed", err);
      ui.leaderboardBusy = false;
      ui.leaderboardError = SYS.t("lb.error");
      if (ui.page === "leaderboard") M.renderPageInto();
    });
  }

  // The next hundred, after the last row already shown. Positions carry on
  // from where the page stopped, because the list is one list.
  function loadMoreLeaderboard() {
    if (!ui.leaderboardMore || ui.leaderboardMoreBusy || !ui.leaderboardCursor) return;
    const cat = null;
    const asked = ui.lbMode + "|" + cat;
    ui.leaderboardMoreBusy = true;
    M.renderPageInto();
    SYS.Cloud.fetchLeaderboardPage(ui.lbMode, cat, ui.leaderboardCursor).then((page) => {
      if ((ui.lbMode + "|" + null) !== asked) return;
      const seen = new Set((ui.leaderboard || []).map((r) => r.uid));
      const fresh = page.rows.filter((r) => !r.hidden && !seen.has(r.uid));
      ui.leaderboard = (ui.leaderboard || []).concat(fresh);
      ui.leaderboardCursor = page.last;
      ui.leaderboardMore = page.more;
      M.loadAvatars(fresh.slice(0, 30).map((r) => r.uid));
      // Found on this page: no longer outside the list.
      if (fresh.some((r) => r.uid === ui.cloudUser.uid)) { ui.leaderboardMine = null; ui.leaderboardMyPosition = null; }
    }).catch((err) => {
      console.warn("[TheSystem] leaderboard page failed", err);
      M.addToast({ kind: "info", text: SYS.t("lb.error") });
    }).then(() => {
      ui.leaderboardMoreBusy = false;
      if (ui.page === "leaderboard") M.renderPageInto();
    });
  }

  function refreshAdminAppealQueue() {
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.isAdmin) return;
    refreshAdminReflectionQueue();
    refreshAdminSuspicionQueue();
    M.refreshAdminReports();
    M.refreshAdminFeedback();
    M.refreshAdminAiReports();
    ui.adminRefreshedAt = Date.now();
    ui.adminAppealBusy = true;
    M.renderPageInto();
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
      M.renderPageInto();
    }).catch((err) => {
      ui.adminAppealBusy = false;
      ui.adminAppealError = err.message || "Couldn't load the queue.";
      M.renderPageInto();
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

  // Adding a task needs an account (the server sets its value), so signed out
  // the add buttons go to the sign-in in Settings — the same place the empty
  // pages' Sign in button goes — rather than open a form that can only end in
  // "sign in first" after it has been filled in.
  function needsSignIn() { return !ui.cloudUser && !(SYS.tourRunning && SYS.tourRunning()); }
  function openSignIn() {
    ui.modal = "settings"; ui.settingsDraft = { ...M.state.settings }; ui.importError = null;
    M.renderModalInto();
  }

  // An admin notification points at "#admin". Whether this account may see
  // that page is only known once the server has answered, so the request is
  // held until then rather than acted on — or dropped — at load.
  M.openAdminWhenReady = location.hash === "#admin";
  function openAdminIfAsked() {
    if (!M.openAdminWhenReady || !ui.isAdmin) return;
    M.openAdminWhenReady = false;
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    ui.page = "admin";
    M.renderSidebarInto();
    M.renderPageInto();
    refreshAdminAppealQueue();
    refreshAdminStats();
  }

  if (SYS.Cloud) {
    SYS.Cloud.init();
    // A reload of an account's own copy saves at once, as before; any other
    // copy waits for the sign-in below to settle whose it is.
    const bootOwner = readOwner();
    SYS.Cloud.setPushOwner(bootOwner && bootOwner !== SIGNED_OUT ? bootOwner : null);
    SYS.Cloud.checkRedirectResult().catch((err) => {
      M.addToast({ kind: "info", text: (err && err.message) || "Google sign-in didn't complete." });
    });
    // Everything a sign-in sets going once the copy on this device is this
    // account's own.
    function afterSignIn(user) {
      SYS.Cloud.checkIsAdmin().then((isAdmin) => { ui.isAdmin = isAdmin; M.renderSidebarInto(); openAdminIfAsked(); if (ui.assess) M.renderAssessmentInto(); }).catch(() => {});
      SYS.Cloud.isMyNameClaimed(M.state.player.name).then((held) => {
        ui.nameClaimed = held;
        if (ui.modal === "settings") M.renderModalInto();
      }).catch(() => {});
      applyPendingGrants();
      refreshMyAppeals();
      refreshInbox();
      M.refreshBlocks();
      M.watchFriends(true);
      M.watchRaces(true);
      M.takePendingInvite();
      flushExpQueue(); // anything queued while signed out or offline
      refreshStreak();
      refreshMyWorn();
      // The server's copy of this device's push address can be gone while the
      // browser still says reminders are on — see push.js.
      if (SYS.resavePushSubscription) SYS.resavePushSubscription();
      setTimeout(reconcileExpWithServer, 4000);
    }

    SYS.Cloud.onAuthChange((user) => {
      // Signing in from the landing page's sign-in: it has done its job.
      if (user && ui.landing) leaveLanding();
      ui.cloudUser = user ? { email: user.email, uid: user.uid, emailVerified: user.emailVerified } : null;
      ui.isAdmin = false;
      watchGrants(!!user);
      watchWallet(!!user);
      if (ui.modal === "settings" || ui.modal === "feedback") M.renderModalInto();
      if (user && ui.modal === "feedback") M.refreshMyFeedback();
      if (ui.modal === "deleteAccount" && !(ui.deleteAccount && ui.deleteAccount.busy)) M.renderModalInto();
      noteVisit();
      if (user && ui.lastMe && ui.lastMe.uid !== user.uid) ui.lastMe = null;
      if (!user) {
        ui.streak = null;
        ui.myWorn = null;
        // A device left signed out shows no one's portrait on the next visit.
        if (ui.lastMe) { ui.lastMe = null; try { localStorage.removeItem(ME_KEY); } catch (e) {} }
        SYS.PlannerSync.detach();
        if (M.stopWatchingState) { M.stopWatchingState(); M.stopWatchingState = null; }
        M.watchFriends(false);
        M.watchRaces(false);
        M.renderSidebarInto();
        return;
      }
      // Before the account's state is pulled: a planner still inside that
      // state is handed to this account's items, not a previous one's.
      SYS.PlannerSync.attach(user.uid, M.onPlannerFromServer);
      // The copy here belongs to another account: take this account's own
      // copy (or a fresh one) and merge nothing. Before anything below can
      // act on it — grants, queued reports and the EXP correction would all
      // land on the wrong account's copy. Its unsent reports name the other
      // account's prices, so they go.
      const owner = readOwner();
      if (owner && owner !== user.uid) {
        M.expQueue = [];
        SYS.Storage.saveExpQueue(M.expQueue);
        SYS.Cloud.pull().then((raw) => {
          if (raw) applyRemoteState(raw);
          else resetLocalState();
          // Only now does this device hold the account's own copy, so only
          // now may it save to it.
          writeOwner(user.uid);
          if (!raw) SYS.Cloud.push(M.state);
          afterSignIn(user);
          setTimeout(M.maybeAskCarry, 800);
          if (M.stopWatchingState) M.stopWatchingState();
          M.stopWatchingState = SYS.Cloud.watchState(onRemoteState);
        }).catch(() => {});
        return;
      }
      afterSignIn(user);
      SYS.Cloud.pull().then((raw) => {
        // From here on the copy on this device is this account's.
        const hadOwner = readOwner() === user.uid;
        writeOwner(user.uid);
        // Grants held back while the copy was nobody's yet.
        if (!hadOwner) applyPendingGrants();
        // Normalise the cloud copy the same way the local one was, so a field
        // added since it was written is not mistaken for a real divergence.
        // Its report is kept apart from the boot one: a migration applied to
        // the *stored* copy says that copy is behind, which is a reason to
        // push, not a reason to ask.
        const cloudReport = migrationReport();
        const cloudState = raw ? normalizeState(raw, cloudReport) : null;
        if (!cloudState) {
          SYS.Cloud.push(M.state);
        } else if (SYS.deepEqual(cloudState, stateOnly(M.state))) {
          // Identical *after normalising* — which is exactly the case a
          // migration produces: both copies gained the same field on the way
          // in, so they agree in memory while the stored one is still without
          // it. Nothing here would ever write it back, and the evaluator reads
          // the stored copy, so it would keep choosing traits from a list one
          // short. Push once when this load changed anything.
          if (bootMigration.migrated || cloudReport.migrated) SYS.Cloud.push(M.state);
          // Nothing is waiting to land, whatever a mark left behind says.
          else if (SYS.Cloud.clearUnsaved) SYS.Cloud.clearUnsaved();
          // The two copies agree: this device is in step with the account.
          if (SYS.Cloud.markSyncedHere) SYS.Cloud.markSyncedHere();
          SYS.Cloud.setBase(cloudState);
        } else if (SYS.Cloud.getBase && SYS.Cloud.getBase()) {
          // In step before: whatever differs is merged, never asked about.
          onRemoteState(raw);
        } else if (!SYS.deepEqual(cloudState, stateOnly(M.state))) {
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
        setTimeout(M.maybeAskCarry, 800);
        // From here on, another device's changes arrive as they happen.
        if (M.stopWatchingState) M.stopWatchingState();
        M.stopWatchingState = SYS.Cloud.watchState(onRemoteState);
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
  setTimeout(() => { if (!ui.cloudUser) M.maybeAskCarry(); }, 2500);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) setTimeout(M.maybeAskCarry, ui.cloudUser ? 3000 : 300);
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

  M.stopWatchingState = null;

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
    const before = M.state;
    const tell = () => {
      M.lastRemoteAdoptAt = Date.now();
      processNotifications(standingNotifications(before, M.state));
    };
    const report = migrationReport();
    const cloudState = normalizeState(JSON.parse(JSON.stringify(raw)), report);
    const local = stateOnly(M.state);
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
    M.state = normalizeState(JSON.parse(JSON.stringify(mergedState)), migrationReport());
    SYS.Storage.save(M.state);
    SYS.Cloud.setBase(accountCopy);
    M.state.planner = SYS.PlannerSync.view();
    closeAssessmentIfDone();
    if (!SYS.deepEqual(stateOnly(M.state), accountCopy)) SYS.Cloud.push(M.state);
    applyLanguage();
    applyThemeAttribute();
    M.renderAppInto();
    if (ui.modal && ui.modal !== "syncChoice") M.renderModalInto();
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
      const now = stateOnly(M.state);
      const next = SYS.deepEqual(now, sent) ? written : SYS.mergeStates(sent, now, written).state;
      adoptMerged(next, written, standingConflict);
    });
  }

  Object.assign(M, { normalizeImportedState, commitName, applyRemoteState, appliedGrantIds, applyGrants, applyPendingGrants, stopWatchingGrants, watchGrants, refreshInbox, refreshMyAppeals, refreshSuggestions, markSuggestionHandled, refreshLeaderboard, loadMoreLeaderboard, refreshAdminAppealQueue, ACCOUNT_ERRORS, accountErrorText, needsSignIn, openSignIn, openAdminIfAsked, standingNotifications, onRemoteState, adoptMerged });
})(window.SYS = window.SYS || {});

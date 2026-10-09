// App: EXP reports to the server, locks and reflections, streak, wallet, visits, the sync check,
// and saving.
// One of the files main.js was split into; the names they share travel through SYS._main.
(function (SYS) {
  "use strict";
  const M = SYS._main || (SYS._main = {});
  const { applyThemeAttribute, rememberMe, ui } = M;

  M.expQueue = SYS.Storage.loadExpQueue();
  let expFlushTimer = null;
  M.expFlushing = false;

  // Only priced work reaches the journal, and as a report of what happened —
  // the server decides the EXP. A task with no price (left over from before
  // prices were recorded) still moves this device's own number, but the
  // server no longer accepts a device's word for EXP, so nothing is queued
  // for it; the next reconcile puts the local figure back to the journal's.
  SYS.onExpDelta = function (delta, source, meta) {
    if (!delta) return;
    const priced = meta && typeof meta.priceId === "string" && meta.priceId && meta.progress;
    if (!priced) return;
    M.expQueue.push({ report: { ...meta.progress, priceId: meta.priceId, source: String(source || "").slice(0, 80) } });
    SYS.Storage.saveExpQueue(M.expQueue);
    scheduleExpFlush();
  };

  // A report with no EXP attached — see reportProgress in engine.js.
  SYS.onProgressReport = function (meta, source) {
    if (!meta || !meta.priceId || !meta.progress) return;
    M.expQueue.push({ report: { ...meta.progress, priceId: meta.priceId, source: String(source || "").slice(0, 80) } });
    SYS.Storage.saveExpQueue(M.expQueue);
    scheduleExpFlush();
  };

  // Debounced for the same reason the state push is: dragging a completion
  // slider produces a burst of reports, and they may as well travel together.
  function scheduleExpFlush() {
    if (expFlushTimer) clearTimeout(expFlushTimer);
    expFlushTimer = setTimeout(flushExpQueue, 1200);
  }

  function flushExpQueue() {
    if (M.expFlushing || !M.expQueue.length) return;
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.cloudUser) return;
    const dropWhere = (test) => {
      M.expQueue = M.expQueue.filter((e) => !test(e));
      SYS.Storage.saveExpQueue(M.expQueue);
    };
    // Plain deltas queued by an older version: the rules refuse them now and
    // they would count for nothing if they landed, so they go.
    if (M.expQueue.some((e) => !e.report)) dropWhere((e) => !e.report);
    if (!M.expQueue.length) return;
    // Snapshot what is being sent, so reports raised while the upload is in
    // flight are kept rather than cleared along with it.
    const sending = M.expQueue.slice();
    const sent = new Set(sending);
    M.expFlushing = true;
    sendProgressReports(sending.map((e) => e.report))
      .then(() => {
        dropWhere((e) => sent.has(e));
        // The trigger needs a moment to fold these into the running total;
        // reading it immediately would compare against a figure that is about
        // to change and "correct" a discrepancy that isn't one.
        setTimeout(reconcileExpWithServer, 4000);
      })
      .catch((err) => {
        // Left in the queue on purpose: a dropped connection must not
        // silently cost someone their standing, and reports are safe to
        // send twice — the server pays only the difference.
        console.warn("[TheSystem] progress report upload failed, will retry", err);
      })
      .then(() => { M.expFlushing = false; });
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
      (M.state.tasks || []).forEach((t) => {
        if (!t.priceId || ids.includes(t.priceId)) return;
        if (!t.recurring && (Number(t.completion) || 0) >= 100) return; // nothing left to record
        ids.push(t.priceId);
      });
      if (!ids.length) return;
      SYS.Cloud.callUnlockTimes(ids.slice(0, 100)).then((res) => {
        ui.unlocks = (res && res.unlocks) || {};
        M.renderPageInto();
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
      (M.state.tasks || []).forEach((t) => { if (SYS.isGatedTask(t) && !ids.includes(t.priceId)) ids.push(t.priceId); });
      if (!ids.length) return;
      SYS.Cloud.callReflectionStatus(ids.slice(0, 100)).then((res) => {
        const byPrice = (res && res.reflections) || {};
        if (SYS.reflectionsDiffer(M.state, byPrice)) M.runGameAction((draft) => SYS.applyReflections(draft, byPrice));
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
    }).then(() => { if (ui.page === "admin") M.renderPageInto(); }).catch(() => {});
  }

  function refreshAdminReflectionQueue() {
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.isAdmin || !SYS.Cloud.fetchHeldReflections) return;
    SYS.Cloud.fetchHeldReflections().then((list) => {
      ui.adminReflections = list;
      return SYS.Cloud.callResolveUsers(list.map((r) => r.uid))
        .then((res) => { ui.adminReflectionUsers = res.users || {}; })
        .catch(() => { ui.adminReflectionUsers = {}; });
    }).then(() => { if (ui.page === "admin") M.renderPageInto(); }).catch(() => {});
  }

  // Pressing something that cannot count yet. Says when it will, rather than
  // doing nothing and looking broken.
  function refuseLocked(t) {
    if (!lockedNow(t)) return false;
    const when = unlockText(unlockOf(t));
    M.addToast({ kind: "info", text: when ? SYS.t("task.lockedUntil", { when }) : SYS.t("task.lockedSoon") });
    return true;
  }

  // Marking a habit day further back than SYS.HABIT_BACKFILL_DAYS pays
  // nothing on the server (functions/progress.js), so the controls refuse it
  // here and say why, instead of letting the day look counted until the next
  // reconcile quietly takes its EXP back. Clearing a day is never refused.
  function refuseOldDay(day) {
    if (SYS.canLogHabitDay(day || SYS.todayKey())) return false;
    M.addToast({ kind: "info", text: SYS.t("habit.tooOld", { n: SYS.HABIT_BACKFILL_DAYS }) });
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
        if (res && res.streak) setStreak(res.streak);
        const refused = ((res && res.results) || []).filter((x) => x.status === "refused");
        if (refused.length) console.warn("[TheSystem] not counted: " + refused.map((x) => x.reason).join(", "));
        // A refusal for time is worth saying out loud: the EXP is about to be
        // taken back by the reconcile, and silence would look like a bug.
        const held = refused.find((x) => x.reason === "locked" || x.reason === "day-full");
        if (held) {
          const when = held.unlock ? unlockText({ day: held.unlock.dayKey, minutes: held.unlock.minutes }) : "";
          M.addToast({ kind: "info", text: held.reason === "day-full"
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

  // The daily streak is the server's (functions/streak.js); this keeps only
  // what it last said, as { current, best, lastDay }, and the status bar works
  // out from today's date whether it is still alive.
  // Kept on this device too, like the wallet, so the flame is there on open.
  const streakKey = () => "the-system:streak:" + ((ui.cloudUser && ui.cloudUser.uid) || "");
  function setStreak(s) {
    ui.streak = s ? { current: Number(s.current) || 0, best: Number(s.best) || 0, lastDay: s.lastDay || null } : null;
    // recordProgress answers with the day already counted; keep its day.
    if (s && s.doneToday) ui.streak.lastDay = SYS.todayKey();
    if (ui.streak && ui.cloudUser) { try { localStorage.setItem(streakKey(), JSON.stringify(ui.streak)); } catch (e) {} }
    M.renderSidebarInto();
  }
  // The wallet, live while signed in. A theme this account does not own is
  // taken off once the wallet says so — a copy carried from another account,
  // or from before themes were sold.
  //
  // The last copy is kept on this device, so the bar shows the gold at once on
  // the next open instead of waiting a second or two for the first read.
  let stopWatchingWallet = null;
  const walletKey = () => "the-system:wallet:" + ((ui.cloudUser && ui.cloudUser.uid) || "");
  function watchWallet(signedIn) {
    if (stopWatchingWallet) { stopWatchingWallet(); stopWatchingWallet = null; }
    ui.wallet = null;
    if (!signedIn || !SYS.Cloud.watchWallet) return;
    try { ui.wallet = JSON.parse(localStorage.getItem(walletKey()) || "null"); } catch (e) { ui.wallet = null; }
    stopWatchingWallet = SYS.Cloud.watchWallet((w) => {
      ui.wallet = w || { gold: 0, aurenite: 0, themes: [], frames: [], freezes: 0 };
      try { localStorage.setItem(walletKey(), JSON.stringify(ui.wallet)); } catch (e) {}
      if (!SYS.ownsTheme(ui.wallet, M.state.settings.theme)) {
        M.runGameAction((draft) => { SYS.setTheme(draft, SYS.SHOP.freeTheme); return []; });
        applyThemeAttribute();
      }
      M.renderSidebarInto();
      if (ui.modal === "settings") M.renderModalInto();
      if (ui.page === "shop") M.renderPageInto();
    });
  }
  // The admin's numbers, read on opening the page and on Refresh.
  function refreshAdminStats() {
    if (!ui.isAdmin || !SYS.Cloud.callAdminStats) return;
    ui.adminStatsBusy = true;
    if (ui.page === "admin") M.renderPageInto();
    SYS.Cloud.callAdminStats().then((s) => { ui.adminStats = s; ui.adminStatsError = null; })
      .catch((err) => { ui.adminStatsError = (err && err.message) || "failed"; })
      .then(() => { ui.adminStatsBusy = false; if (ui.page === "admin") M.renderPageInto(); });
  }
  // The app was opened: counted for the admin's visitor numbers (functions
  // noteVisit). A random id names this device; at most once every half hour
  // per device and account, so leaving the tab open is not a stream of calls.
  const VISIT_EVERY = 30 * 60 * 1000;
  function noteVisit() {
    if (!SYS.Cloud || !SYS.Cloud.available() || !SYS.Cloud.callNoteVisit) return;
    let device = null, last = {};
    try {
      device = localStorage.getItem("the-system:device");
      if (!device) {
        device = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
        localStorage.setItem("the-system:device", device);
      }
      last = JSON.parse(localStorage.getItem("the-system:visit") || "{}") || {};
    } catch (e) { if (!device) return; }
    const who = (ui.cloudUser && ui.cloudUser.uid) || "-";
    const now = Date.now();
    if (last.who === who && last.day === SYS.todayKey() && now - (Number(last.at) || 0) < VISIT_EVERY) return;
    SYS.Cloud.callNoteVisit(device).then(() => {
      try { localStorage.setItem("the-system:visit", JSON.stringify({ who, day: SYS.todayKey(), at: now })); } catch (e) {}
    }).catch(() => {});
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) noteVisit(); });

  // On a phone the floating add button sits over the right-hand end of the
  // list, where a habit's own + is; it steps aside while you scroll down
  // through the list and comes back as soon as you scroll up.
  let lastScrollY = 0;
  window.addEventListener("scroll", () => {
    const y = window.scrollY;
    if (Math.abs(y - lastScrollY) < 8) return;
    document.body.classList.toggle("fab-away", y > lastScrollY && y > 80);
    lastScrollY = y;
  }, { passive: true });

  // What this account has on its public profile, for the shop's buttons.
  function refreshMyWorn() {
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.cloudUser || !SYS.Cloud.fetchProfile) return;
    const uid = ui.cloudUser.uid;
    SYS.Cloud.fetchProfile(uid).then((d) => {
      if (!ui.cloudUser || ui.cloudUser.uid !== uid) return;
      ui.myWorn = (d && d.profile && d.profile.worn) || {};
      ui.frames = { ...(ui.frames || {}), [uid]: ui.myWorn.frame || null };
      // The portrait in the status bar.
      if (d && d.profile && d.profile.avatar) ui.avatars = { ...(ui.avatars || {}), [uid]: d.profile.avatar };
      rememberMe();
      M.renderStatusbarInto();
      if (ui.page === "shop") M.renderPageInto();
    }).catch(() => {});
  }

  function refreshStreak() {
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.cloudUser) return;
    if (!ui.streak) { try { ui.streak = JSON.parse(localStorage.getItem(streakKey()) || "null"); } catch (e) {} if (ui.streak) M.renderSidebarInto(); }
    SYS.Cloud.fetchStreak().then(setStreak).catch(() => {});
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
      SYS.Cloud.push(M.state);
      return;
    }
    // Progress made here before this device ever synced with this account is
    // left behind — and so is the EXP it queued for the journal, which would
    // otherwise add to the account points it never earned.
    if (!(SYS.Cloud.hasSyncedHere && SYS.Cloud.hasSyncedHere())) {
      M.expQueue = [];
      SYS.Storage.saveExpQueue(M.expQueue);
    }
    M.applyRemoteState(cloudState);
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
        queued: M.expQueue.length,
        localTotal: SYS.totalExp(M.state.player),
        cloudTotal: cloudPlayer ? SYS.totalExp(cloudPlayer) : null,
        push: SYS.Cloud.pushStats ? SYS.Cloud.pushStats() : null,
        storedAt: SYS.Cloud.storedUpdatedAt ? SYS.Cloud.storedUpdatedAt() : null,
      };
      if (ui.modal === "syncChoice") M.renderModalInto();
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
  M.lastRemoteAdoptAt = 0;
  function reconcileExpWithServer(attempt) {
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.cloudUser) return;
    const tries = Number(attempt) || 0;
    const retry = () => { if (tries < 4) setTimeout(() => reconcileExpWithServer(tries + 1), RECONCILE_CONFIRM_MS); };
    // Anything of ours still unsent means the server is legitimately behind,
    // not that we are ahead dishonestly. Correcting now would delete real
    // work done offline — the one mistake this must never make.
    if (M.expQueue.length || M.expFlushing) return;

    SYS.Cloud.fetchExpSummary().then((summary) => {
      if (!summary) return;
      ui.expMonths = summary.months;
      if (ui.page === "stats") M.renderPageInto();
      const firstTotal = summary.total;
      if (firstTotal == null) return;
      const localAtFirst = SYS.totalExp(M.state.player);
      if (firstTotal === localAtFirst) return;
      setTimeout(() => {
        if (M.expQueue.length || M.expFlushing) return;
        SYS.Cloud.fetchExpSummary().then((again) => {
          if (!again || again.total == null) return;
          const local = SYS.totalExp(M.state.player);
          if (again.total === local) return;
          const settled = again.total === firstTotal && local === localAtFirst && !M.expQueue.length && !M.expFlushing;
          if (!settled || Date.now() - M.lastRemoteAdoptAt < 2 * RECONCILE_CONFIRM_MS) { retry(); return; }
          console.warn("[TheSystem] correcting local EXP by " + (again.total - local) + " to match the journal");
          M.runGameAction((draft) => SYS.reconcileExpTo(draft, again.total, SYS.t("sync.corrected")));
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
      M.addToast({ kind: "info", sticky: true, text: SYS.t("sync.localSaveFailed") });
    }
    if (saved) localSaveBroken = false;
    if (SYS.Cloud && SYS.Cloud.available()) SYS.Cloud.push(s);
  }

  Object.assign(M, { expFlushTimer, scheduleExpFlush, flushExpQueue, unlockTimer, unlockOf, lockedNow, unlockText, refreshUnlocks, reflectTimer, refreshReflections, refreshAdminSuspicionQueue, refreshAdminReflectionQueue, refuseLocked, refuseOldDay, sendProgressReports, streakKey, setStreak, stopWatchingWallet, walletKey, watchWallet, refreshAdminStats, VISIT_EVERY, noteVisit, lastScrollY, refreshMyWorn, refreshStreak, resolveOrAsk, collectSyncDiagnosis, RECONCILE_CONFIRM_MS, reconcileExpWithServer, localSaveBroken, persist });
})(window.SYS = window.SYS || {});

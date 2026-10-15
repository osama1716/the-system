// App: the click dispatcher (handlers in main-actions-*.js), the day rollover, update checks and
// start-up recovery.
// One of the files main.js was split into; the names they share travel through SYS._main.
(function (SYS) {
  "use strict";
  const M = SYS._main || (SYS._main = {});
  const { $page, ACTIONS, ARMABLE, INDEX_EDITS, applyLanguage, applyThemeAttribute, arm, bootMigration, disarm, finishCountdown, isArmed, landingSeen, maybePlayBrandOnLaunch, openAdminIfAsked, openFeedback, openFriendsTab, readOwner, renderLandingInto, renderNotifInto, renderRankupInto, restoreTimer, ui } = M;

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
      M.renderModalInto();
      return;
    }

    const isAdminAction = action === "admin-grant-admin" || action === "admin-revoke-admin";
    if (ARMABLE.has(action)) {
      const armKind = action === "remove-trait" ? "trait" : action === "reset-data" ? "reset" : isAdminAction ? "admin" : "task";
      const armId = action === "remove-trait" ? el.dataset.trait : action === "reset-data" ? "reset" : isAdminAction ? `${action}:${el.dataset.email}` : (id || el.dataset.id);
      if (!isArmed(armKind, armId)) {
        arm(armKind, armId);
        if (action === "reset-data" || action === "event-delete" || action === "friend-remove-armed") M.renderModalInto(); else if (isAdminAction) M.renderPageInto(); else M.renderAppInto();
        return;
      }
      disarm();
      // falls through to perform the confirmed action below
    } else if (ui.armed) {
      disarm();
    }

    // Each action's handler lives with its area, in the main-actions-*.js files.
    const handle = ACTIONS[action];
    if (handle) handle({ e, el, action, key, id });
  });

  // If the app is left open across midnight, recurring-habit week counts and
  // the stats page are otherwise only recomputed on the next click — this
  // makes that happen on its own, right at the day boundary.
  // The art every page draws (emblems, rank badges, the page icons) is fetched
  // and decoded once the app is up, so it is already there when a page asks
  // for it, instead of arriving a moment after the window has opened.
  SYS._artKept = [];
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target && e.target.classList && e.target.classList.contains("is-link")) {
      e.preventDefault();
      e.target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
  });
  // A small System window naming whatever carries data-tip (the radar's
  // emblems), above it, while it is pointed at or focused. One element for
  // the whole app, positioned on the page rather than inside the drawing, so
  // it is never cut off at the drawing's edge and reads the same in Arabic.
  let tipEl = null;
  function showTip(target) {
    const text = target.getAttribute("data-tip");
    if (!text) return;
    if (!tipEl) {
      tipEl = document.createElement("div");
      tipEl.className = "sys-tip";
      tipEl.setAttribute("role", "tooltip");
      document.body.appendChild(tipEl);
    }
    tipEl.textContent = text;
    const r = target.getBoundingClientRect();
    tipEl.classList.add("on");
    const w = tipEl.offsetWidth;
    const x = Math.min(window.innerWidth - 8 - w / 2, Math.max(8 + w / 2, r.left + r.width / 2));
    tipEl.style.left = x + "px";
    tipEl.style.top = Math.max(8, r.top - 8) + "px";
  }
  function hideTip() { if (tipEl) tipEl.classList.remove("on"); }
  const tipOf = (n) => (n && n.closest ? n.closest("[data-tip]") : null);
  document.addEventListener("pointerover", (e) => { const t = tipOf(e.target); if (t) showTip(t); });
  document.addEventListener("pointerout", (e) => { const t = tipOf(e.target); if (t && !t.contains(e.relatedTarget)) hideTip(); });
  document.addEventListener("focusin", (e) => { const t = tipOf(e.target); if (t) showTip(t); });
  document.addEventListener("focusout", hideTip);
  document.addEventListener("click", hideTip, true);
  window.addEventListener("scroll", hideTip, true);
  function preloadArt() {
    const urls = [];
    (SYS.INT_ART || []).forEach((k) => [22, 48].forEach((px) => { urls.push(SYS.intArtSrc(k, px)); urls.push(SYS.intArtSrc(k, px, true)); }));
    (SYS.RANK_ART || []).forEach((r) => urls.push("assets/ranks/" + encodeURIComponent(r) + "-128.webp"));
    ["overview", "quests", "habits", "planner", "stats", "leaderboard", "intelligence", "log", "shop", "friends", "mail", "settings"]
      .forEach((n) => urls.push("assets/icons/" + n + "-96.webp"));
    urls.push("assets/frames/dial-ring-512.webp", "assets/frames/dial-ring-512-light.webp",
      "assets/frames/profile-circuit-256.webp", "assets/frames/profile-circuit-256-light.webp",
      "icons/mark-on-dark.png", "icons/mark-on-light.png", "assets/marks/task-64.webp", "assets/marks/task-128.webp");
    ["gold", "aurenite"].forEach((c) => [64, 128].forEach((px) => urls.push("assets/currency/" + c + "-" + px + ".webp")));
    // the three packs: the frames' stills and the profile backgrounds' posters
    ["angel", "crystal", "hud"].forEach((p) => urls.push("assets/frames/aurenite-" + p + "-128.webp", "assets/frames/aurenite-" + p + "-still.webp", "assets/backgrounds/" + p + ".jpg"));
    for (let i = 1; i <= 16; i++) { const id = "a" + String(i).padStart(2, "0"); urls.push("assets/avatars/" + id + ".jpg", "assets/avatars/" + id + "-64.jpg"); }
    // held in a list, or the browser is free to drop them again
    const go = () => new Set(urls).forEach((u) => { const im = new Image(); im.src = u; SYS._artKept.push(im); if (im.decode) im.decode().catch(() => {}); });
    (window.requestIdleCallback || ((f) => setTimeout(f, 300)))(go);
  }
  function scheduleNextDayRollover() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    setTimeout(() => {
      M.renderAppInto();
      M.maybeAnnounceDailyQuest();
      scheduleNextDayRollover();
    }, next - now);
  }
  // The Daily Quest's clock: its text moved on once a second, nothing
  // redrawn. Red in the last hour.
  function tickQuestClock() {
    const els = document.querySelectorAll(".dq-left");
    if (!els.length) return;
    const left = SYS.questTimeLeft();
    els.forEach((el) => { el.textContent = left; el.parentNode.classList.toggle("dq-urgent", left < "01:00:00"); });
  }
  setInterval(tickQuestClock, 1000);
  // A phone keeps the app in the background for days; coming back to it on
  // a new day is that day's first open.
  document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(M.maybeAnnounceDailyQuest, 700); });

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
      M.addToast({
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
      if (data.url.indexOf("#feedback") >= 0) { openFeedback(); return; }
      if (data.url.indexOf("#admin") < 0) return;
      M.openAdminWhenReady = true;
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
      '<button id="boot-reload" style="font:inherit;font-size:13px;padding:8px 16px;border-radius:99px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer;">Reload</button>' +
      '</div>';
    // Wired here rather than with onclick="…": the page's Content-Security-
    // Policy (index.html) refuses inline handlers.
    const reload = document.getElementById("boot-reload");
    if (reload) reload.addEventListener("click", () => location.reload());
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
    SYS.onSoundState = function () { if (ui.modal === "timer") M.renderModalInto(); };
    SYS.renderAssessmentInto = M.renderAssessmentInto;
    restoreTimer();
    // -1 is the opening screen; the first statement is index 0. Nothing is
    // offered until the person has read what this is.
    // Shown by itself only on a first open. Once it has been put off it waits
    // to be picked up from the overview rather than greeting every launch.
    // A device that has never held an account and has not been past the
    // landing page sees it first; the assessment waits for "Start".
    ui.landing = !readOwner() && !landingSeen();
    if (!ui.landing && !M.state.assessment && !M.state.settings.assessDraft) ui.assess = { i: -1, answers: {}, result: null };
    renderLandingInto();
    M.renderAssessmentInto();
    M.renderAppInto();
    if (M.pendingCountdownFinish) { M.pendingCountdownFinish = false; finishCountdown(); }
    renderNotifInto();
    renderRankupInto();
    M.renderModalInto();
    preloadArt();
    scheduleNextDayRollover();
    watchForUpdates();
    // Said once, on the load that did it, rather than written into the log.
    // The log is the person's own record; this is the app explaining itself,
    // and putting it in there is what made the two copies disagree for ever.
    bootMigration.notes.forEach((text) => M.addToast({ kind: "info", text }));
    maybePlayBrandOnLaunch();
    // after the page has arrived
    setTimeout(M.maybeAnnounceDailyQuest, 900);
    markRecovery(false);
  } catch (err) {
    if (!recoverOnce(err)) bootFailed(err);
  }

  Object.assign(M, { scheduleNextDayRollover, watchForUpdates, bootFailed, RECOVERY_FLAG, recoveryTried, markRecovery, recoverOnce });
})(window.SYS = window.SYS || {});

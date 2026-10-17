// App: drawing the page and its layers, the landing and assessment, toasts, rank-ups, the log
// and time sheets, and game actions.
// One of the files main.js was split into; the names they share travel through SYS._main.
(function (SYS) {
  "use strict";
  const M = SYS._main || (SYS._main = {});
  const { persist, resumeBrandAfterRender, ui } = M;

  const $sidebar = document.getElementById("sidebar");
  const $statusbar = document.getElementById("statusbar");
  const $page = document.getElementById("page");
  const $notif = document.getElementById("notif-stack");
  const $rankup = document.getElementById("rankup-layer");
  const $modal = document.getElementById("modal-layer");
  const $assess = document.getElementById("assess-layer");
  const $importInput = document.getElementById("import-file-input");
  const $feedbackShotInput = document.getElementById("feedback-shot-input");

  // Shown when this account has never been asked. It is asked once, ever:
  // `state.assessment` is written when the last answer lands, and its presence
  // is what closes the door.
  const LANDING_KEY = "the-system:landingSeen";
  function landingSeen() { try { return localStorage.getItem(LANDING_KEY) === "1"; } catch (e) { return false; } }
  function leaveLanding() {
    try { localStorage.setItem(LANDING_KEY, "1"); } catch (e) {}
    ui.landing = false;
    renderLandingInto();
  }
  function renderLandingInto() {
    const el = document.getElementById("landing-layer");
    if (!el) return;
    el.innerHTML = ui.landing && SYS.renderLanding ? SYS.renderLanding() : "";
    document.body.classList.toggle("landing-on", !!ui.landing);
    if (ui.landing && SYS.FramePlayer) SYS.FramePlayer.refresh();
    if (ui.landing && SYS.fitLandingShots) SYS.fitLandingShots(el);
  }
  window.addEventListener("resize", () => { if (ui.landing && SYS.fitLandingShots) SYS.fitLandingShots(); });

  // The assessment's window arrives and leaves like any other; its questions,
  // drawn one after another inside it, do not.
  let assessShown = false;
  function renderAssessmentInto() {
    const old = $assess.querySelector(".assess-card");
    const oldRect = old && old.getBoundingClientRect();
    $assess.innerHTML = ui.assess ? SYS.renderAssessment(ui, M.state) : "";
    document.body.classList.toggle("assessing", !!ui.assess);
    const card = $assess.querySelector(".assess-card");
    if (!lessMotion() && typeof swFx === "function") {
      if (card && !assessShown) {
        card.classList.add("sw-form-in");
        swFx(card.getBoundingClientRect(), "open");
        swDecode(card, SW_TITLE_DELAY, ".assess-title");
        setTimeout(() => card.classList.remove("sw-form-in"), SW_OPEN_MS);
      } else if (!card && assessShown && oldRect) swFx(oldRect, "close");
    }
    assessShown = !!card;
  }

  // The two AI limits, in the person's own language. The server's message is
  // English and stays the fallback for anything else it refuses.
  function aiLimitText(err) {
    const d = err && err.details;
    if (d && d.code === "ai-user-limit") return SYS.t("ai.userLimit", { n: d.limit || "" });
    if (d && d.code === "ai-global-limit") return SYS.t("ai.globalLimit");
    return "";
  }

  // The answers so far, kept on the account (settings, so another device picks
  // them up through the ordinary sync) and where the person was.
  function saveAssessDraft() {
    if (!ui.assess || M.state.assessment) return;
    const answers = { ...(ui.assess.answers || {}) };
    const i = Math.max(0, ui.assess.i);
    runGameAction((draft) => { draft.settings.assessDraft = { answers, i }; return []; });
  }
  // Where to pick up: the saved place, or the first statement not yet
  // answered if that comes earlier.
  function resumeIndex(a) {
    const qs = SYS.ASSESSMENT || [];
    const firstOpen = qs.findIndex((q) => !Object.prototype.hasOwnProperty.call((a && a.answers) || {}, q.id));
    const saved = Math.max(0, Number(a && a.i) || 0);
    const at = firstOpen < 0 ? saved : Math.min(saved, firstOpen);
    return Math.min(at, Math.max(0, qs.length - 1));
  }
  function openAssessment() {
    if (M.state.assessment) return;
    const d = M.state.settings.assessDraft || {};
    // Straight to the statements: the opening screen was read the first time.
    const a = { i: 0, answers: { ...(d.answers || {}) }, result: null };
    a.i = resumeIndex({ answers: a.answers, i: d.i });
    ui.assess = a;
    renderAssessmentInto();
  }

  // Only the opening screen: someone halfway through keeps their answers on
  // screen even if a copy arrives saying the test was settled elsewhere.
  function closeAssessmentIfDone() {
    if (ui.assess && ui.assess.i < 0 && M.state.assessment) { ui.assess = null; renderAssessmentInto(); }
  }

  function renderSidebarInto() {
    $sidebar.innerHTML = SYS.renderSidebar(ui);
    resumeBrandAfterRender();
    // Friends and mail moved to the status bar, and their counts and the
    // current page change exactly when the sidebar does.
    const social = $statusbar.querySelector(".status-social");
    if (social) social.outerHTML = SYS.renderStatusSocial(ui);
  }
  function renderStatusbarInto() {
    $statusbar.innerHTML = SYS.renderStatusbar(M.state, ui);
    if (SYS.FramePlayer) SYS.FramePlayer.refresh();
    if (ui.nameEditing) {
      const el = document.getElementById("name-input");
      if (el) { el.focus(); el.select(); }
    }
  }
  // The planner's hours scroll inside their own box. A re-render (ticking a
  // to-do, a sync) keeps that box where it was; a different day opens on the
  // part of the day worth seeing.
  // A moving background would start over on every re-render (a sync, a
  // tick), so the playing video is carried into the fresh markup instead.
  function keepBgVideos(root, paint) {
    const old = Array.from(root.querySelectorAll("video.bg-video"));
    paint();
    root.querySelectorAll("video.bg-video").forEach((v) => {
      const i = old.findIndex((o) => o.getAttribute("src") === v.getAttribute("src"));
      if (i < 0) return;
      const o = old.splice(i, 1)[0];
      v.replaceWith(o);
      o.play().catch(() => {});
    });
  }
  function renderPageInto() {
    const was = $page.querySelector(".tl-scroll");
    const kept = was ? { day: was.dataset.day, top: was.scrollTop } : null;
    // A form inside the page (a new quest, a new habit) opening or closing
    // is a window of its own, though the page is drawn again around it.
    const samePage = ui.page === sysShownPage;
    const formWas = $page.querySelector(".quest-form");
    const formRect = formWas && formWas.getBoundingClientRect();
    keepBgVideos($page, () => { $page.innerHTML = SYS.renderPage(M.state, ui); });
    let arriving = false;
    if (ui.page !== sysShownPage) {
      if (sysShownPage !== null && !lessMotion()) {
        $page.classList.remove("sys-enter"); void $page.offsetWidth; $page.classList.add("sys-enter");
        sysPageAt = Date.now();
        clearTimeout(sysPageTimer);
        sysPageTimer = setTimeout(() => $page.classList.remove("sys-enter"), SW_PAGE_STEP * 4 + SW_PAGE_MS + 40);
        arriving = true;
      }
      sysShownPage = ui.page;
    }
    sysResumePageMotion();
    if (arriving) swPageArrive();
    if (samePage && !lessMotion()) swPageForm(formWas, formRect);
    if (SYS.FramePlayer) SYS.FramePlayer.refresh();
    if (SYS.Feathers) SYS.Feathers.refresh();
    const tl = $page.querySelector(".tl-scroll");
    if (tl) tl.scrollTop = kept && kept.day === tl.dataset.day ? kept.top : timelineStart(tl.dataset.day);
  }
  // A page drawn again while its windows are still arriving (data lands a
  // moment after the page opens) would start every window's motion over; the
  // fresh markup picks the motion up where the old one was.
  let sysPageAt = 0, sysPageTimer = 0;
  // A page's windows, in the order they arrive.
  const SW_PAGE_STEP = 70, SW_PAGE_MS = 420;
  const pageWindows = () => [...$page.querySelectorAll(".sysw > *, :scope > :not(.sysw)")];
  function sysResumePageMotion() {
    const elapsed = Date.now() - sysPageAt;
    if (!$page.classList.contains("sys-enter")) return;
    // The last window has arrived by now (four steps of stagger + its motion).
    // Drawn again after that, the page must not arrive a second time: the
    // class goes, so the fresh markup simply stands there.
    if (elapsed >= SW_PAGE_STEP * 4 + SW_PAGE_MS) { $page.classList.remove("sys-enter"); return; }
    pageWindows().forEach((el, i) => { el.style.animationDelay = (Math.min(i, 4) * SW_PAGE_STEP - elapsed) + "ms"; });
  }
  // The page's windows assemble one after another as it arrives (his choice,
  // 2026-10-17): each one on screen draws its outline and comes up through the
  // holographic lines, quicker than a window; the page title decodes. The page
  // left behind simply goes, so moving about stays quick.
  function swPageArrive() {
    const vh = window.innerHeight;
    pageWindows().forEach((el, i) => {
      const r = el.getBoundingClientRect();
      if (r.height < 30 || r.bottom < 0 || r.top > vh) return;
      setTimeout(() => { if (el.isConnected) swFx(el.getBoundingClientRect(), "page"); }, Math.min(i, 4) * SW_PAGE_STEP);
    });
    swDecode($page, 120, ".page-title");
  }
  let swFormAt = 0;
  function swPageForm(was, wasRect) {
    const now = $page.querySelector(".quest-form");
    if (now && !was) {
      swFormAt = Date.now();
      now.classList.add("sw-form-in");
      swFx(now.getBoundingClientRect(), "open");
      setTimeout(() => now.classList.remove("sw-form-in"), SW_OPEN_MS);
    } else if (now && was && Date.now() - swFormAt < SW_OPEN_MS) {
      // drawn again while still opening: carry on from where it was
      const elapsed = Date.now() - swFormAt;
      now.style.animationDelay = (SW_BOX_DELAY - elapsed) + "ms";
      now.style.setProperty("--sw-elapsed", elapsed + "ms");
      now.classList.add("sw-form-in");
      setTimeout(() => now.classList.remove("sw-form-in"), SW_OPEN_MS - elapsed);
    } else if (!now && was && wasRect) swFx(wasRect, "close");
  }
  // Anything else that opens as a small window (a guided tour's bubble): the
  // light, quick arrival of a notice.
  SYS.swArrive = function (el) {
    if (!el || lessMotion()) return;
    el.classList.remove("sw-pop"); void el.offsetWidth; el.classList.add("sw-pop");
    swFx(el.getBoundingClientRect(), "toast");
    setTimeout(() => el.classList.remove("sw-pop"), 500);
  };
  function timelineStart(day) {
    const timed = SYS.eventsOn(M.state, day).filter((o) => !o.allDay);
    const minutes = day === SYS.todayKey() ? (new Date().getHours() - 1) * 60
      : timed.length ? SYS.minutesOf(timed[0].from) - 30
      : 8 * 60;
    return Math.max(0, minutes / 60 * SYS.PLANNER_HOUR_PX);
  }
  function renderAppInto() { renderSidebarInto(); renderStatusbarInto(); renderPageInto(); }
  // ---- System windows: how a window, a notice and a page arrive ----------
  // (styles in css/system-windows.css). The light (swFx) is its own element,
  // outside the window, because the window is clipped while it unfolds.
  const lessMotion = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let sysShownModal = null, sysShownPage = null, sysOpenedAt = 0;
  const sysSeenNotices = new Map();
  // How a System window is generated and taken down (his brief, 2026-10-17):
  // the light is laid over the window for a moment as its own element, so
  // nothing in the window itself is touched. Opening: the window is not there
  // yet; a thin cyan outline draws the frame, from the middle of its top and
  // bottom edges round to the sides, and glows; the window assembles inside
  // it, its surface coming up through faint holographic lines; the title and
  // the contents follow; one faint scan line passes down it. Closing: the
  // contents go first, the edges light up and break apart, the window
  // dissolves and shrinks away. Timings live with the styles at the end of
  // css/system-windows.css.
  // About 1.4 times the first timings: he asked for it a little slower (2026-10-17).
  const SW_OPEN_MS = 900, SW_CLOSE_MS = 450, SW_BOX_DELAY = 170, SW_TITLE_DELAY = 405;
  function swFx(rect, kind) {
    if (lessMotion() || !rect || rect.width < 40 || rect.height < 20) return;
    const W = Math.round(rect.width), H = Math.round(rect.height);
    const fx = document.createElement("div");
    fx.className = "swfx " + kind;
    fx.setAttribute("aria-hidden", "true");
    fx.style.cssText = "left:" + rect.left + "px;top:" + rect.top + "px;width:" + W + "px;height:" + H + "px";
    const m = W / 2;
    fx.innerHTML = '<svg class="swfx-trace" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '">' +
      '<path pathLength="1" d="M' + m + " 1 H1 V" + (H - 1) + " H" + m + '"/>' +
      '<path pathLength="1" d="M' + m + " 1 H" + (W - 1) + " V" + (H - 1) + " H" + m + '"/></svg>' +
      '<i class="swfx-holo"></i>' + (kind === "open" ? '<i class="swfx-scan"></i>' : "");
    document.body.appendChild(fx);
    setTimeout(() => fx.remove(), kind === "open" ? 1260 : kind === "page" || kind === "toast" ? 900 : SW_CLOSE_MS + 60);
  }
  // A window's title (and a notice's heading) decodes as it arrives: random
  // letters settle into the words from the left. Only plain Latin text — an
  // Arabic or a Japanese title would read as broken mid-way, so it just
  // arrives with the window. The width is held while it runs, so the tag
  // around it does not twitch.
  const SW_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&<>/";
  function swDecode(root, delay, sel) {
    if (lessMotion() || !root) return;
    // SYS.__motionScale stretches it with the rest of the motion when a slow
    // recording is made of it (the CSS is slowed through the browser).
    const scale = Number(SYS.__motionScale) || 1;
    // Scrambled from this moment, settling only after `delay`: the words are
    // never seen whole before they decode, whenever the window shows them.
    root.querySelectorAll(sel || ".modal-title, .notif-kind, .notif-big-msg, .nq-part").forEach((el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const nodes = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) if (/^[ -~]+$/.test(n.nodeValue) && n.nodeValue.trim()) nodes.push(n);
      if (!nodes.length) return;
      const w = el.getBoundingClientRect().width;
      el.style.width = w + "px"; el.style.whiteSpace = "nowrap"; el.style.overflow = "hidden";
      const t0 = performance.now() + (delay || 0) * scale, DUR = 590 * scale;
      const finals = nodes.map((n) => n.nodeValue);
      // performance.now, not the frame's own timestamp: that one can fall a
      // few ms before t0, and a negative share once cut the word short.
      const step = () => {
        const p = Math.max(0, Math.min(1, (performance.now() - t0) / DUR));
        nodes.forEach((n, k) => {
          const f = finals[k], fixed = Math.floor(p * f.length);
          let s = f.slice(0, fixed);
          for (let i = fixed; i < f.length; i++) s += f[i] === " " ? " " : SW_GLYPHS[(Math.random() * SW_GLYPHS.length) | 0];
          n.nodeValue = s;
        });
        if (p < 1 && el.isConnected) requestAnimationFrame(step);
        else { nodes.forEach((n, k) => { n.nodeValue = finals[k]; }); el.style.width = ""; el.style.whiteSpace = ""; el.style.overflow = ""; }
      };
      step();
    });
  }
  function sysOpenWindow() {
    const box = $modal.querySelector(".modal-box");
    if (!box || lessMotion()) return;
    const scrim = box.closest(".modal-backdrop");
    box.classList.add("sys-open"); if (scrim) scrim.classList.add("sys-open");
    sysOpenedAt = Date.now();
    swFx(box.getBoundingClientRect(), "open");
    swDecode(box, SW_TITLE_DELAY);
    setTimeout(() => { box.classList.remove("sys-open"); if (scrim) scrim.classList.remove("sys-open"); }, SW_OPEN_MS);
  }
  // The same window drawn again while it is still unfolding (an open often
  // renders twice) picks the motion up where it was rather than snapping.
  function sysKeepOpening() {
    const elapsed = (Date.now() - sysOpenedAt) / (Number(SYS.__motionScale) || 1);
    if (elapsed >= SW_OPEN_MS - 40 || lessMotion()) return;
    const box = $modal.querySelector(".modal-box"), scrim = $modal.querySelector(".modal-backdrop");
    if (!box) return;
    box.style.setProperty("animation-delay", (SW_BOX_DELAY - elapsed) + "ms", "important");
    // the contents arrive on the same clock, not from the start again
    box.style.setProperty("--sw-elapsed", elapsed + "ms");
    box.classList.add("sys-open");
    // the title drawn again comes back scrambled and decodes on time
    swDecode(box, Math.max(0, SW_TITLE_DELAY - elapsed));
    if (scrim) { scrim.style.setProperty("animation-delay", (-elapsed) + "ms", "important"); scrim.classList.add("sys-open"); }
    setTimeout(() => { box.classList.remove("sys-open"); if (scrim) scrim.classList.remove("sys-open"); }, SW_OPEN_MS - elapsed);
  }
  // A closed window is already gone from the markup; a copy of it is taken
  // down in its place. The copy holds no actions, and while it is leaving it
  // takes every tap (and the page stays still), so nothing behind it can be
  // pressed half-way through; the page is live again the moment it is gone.
  function sysCloseWindow(copy, rect) {
    copy.querySelectorAll("[data-action]").forEach((e) => e.removeAttribute("data-action"));
    copy.classList.add("sys-close", "sys-ghost");
    const box = copy.querySelector(".modal-box");
    if (box) box.classList.add("sys-close");
    document.body.appendChild(copy);
    swFx(rect, "close");
    lockPageScroll();
    setTimeout(() => { copy.remove(); lockPageScroll(); }, SW_CLOSE_MS);
  }

  function renderModalInto() {
    const oldScrim = $modal.querySelector(".modal-backdrop");
    const oldBox = $modal.querySelector(".modal-box");
    const closing = sysShownModal && !ui.modal && oldScrim && oldBox && !lessMotion()
      ? { copy: oldScrim.cloneNode(true), rect: oldBox.getBoundingClientRect() } : null;
    keepBgVideos($modal, () => { $modal.innerHTML = SYS.renderModalLayer(M.state, ui); });
    if (ui.modal && ui.modal !== sysShownModal) sysOpenWindow();
    else if (ui.modal) sysKeepOpening();
    if (closing) sysCloseWindow(closing.copy, closing.rect);
    sysShownModal = ui.modal || null;
    // A profile can carry an animated frame, and any window a moving rank emblem.
    if (SYS.FramePlayer) SYS.FramePlayer.refresh();
    if (SYS.Feathers) SYS.Feathers.refresh();
    // Fresh markup scrolls to the top, which would show every wheel at 00.
    if (ui.modal === "time") placeWheels();
    lockPageScroll();
  }
  // While a window, a big notice or the rank-up is open, the page behind it
  // stays where it is: a finger dragging over the dimmed backdrop used to
  // scroll the page underneath. A long window still scrolls inside itself.
  function lockPageScroll() {
    const open = !!(($modal && $modal.querySelector(".modal-backdrop")) || ($notif && $notif.querySelector(".notif-big")) ||
      ($rankup && $rankup.querySelector(".rankup-overlay")) || document.querySelector(".sys-ghost"));
    document.documentElement.classList.toggle("page-locked", open);
  }

  // Reminders are only as useful as the times on the habits, so the section
  // can say when there are none — permission granted and nothing set is a
  // silent dead end otherwise.
  function refreshRemindCount() {
    ui.remindCount = M.state.tasks.filter((t) => t.recurring && SYS.reminderTimes(t).length).length +
      ((M.state.planner && M.state.planner.events) || []).filter((ev) => ev.reminders && ev.reminders.length).length;
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
  function renderNotifInto() {
    $notif.innerHTML = SYS.renderNotifStack(ui);
    lockPageScroll();
    $notif.querySelectorAll(".notif[data-id]").forEach((n) => {
      if (lessMotion()) return;
      const seen = sysSeenNotices.get(n.dataset.id);
      if (seen === undefined) {
        sysSeenNotices.set(n.dataset.id, Date.now()); n.classList.add("sys-new");
        // a big notice is a System window: it arrives like one
        if (n.classList.contains("notif-big")) { swFx(n.getBoundingClientRect(), "open"); swDecode(n, SW_TITLE_DELAY); }
        // a small one, the same light, lighter and quicker
        else swFx(n.getBoundingClientRect(), "toast");
        return;
      }
      // drawn again while still arriving: carry on from where it was
      const elapsed = Date.now() - seen;
      const big = n.classList.contains("notif-big");
      if (elapsed < (big ? SW_OPEN_MS : 400)) {
        n.style.setProperty("animation-delay", ((big ? SW_BOX_DELAY : 40) - elapsed) + "ms", "important");
        n.style.setProperty("--sw-elapsed", elapsed + "ms");
        n.classList.add("sys-new");
      }
    });
  }
  function renderRankupInto() { $rankup.innerHTML = SYS.renderRankupLayer(ui); lockPageScroll(); if (SYS.FramePlayer) SYS.FramePlayer.refresh(); }

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
  // The big notices take the middle of the screen, so they come one at a
  // time: a level reached and the Daily Quest completed by the same press
  // are read one after the other, not on top of each other.
  const BIG_NOTICES = ["levelup", "dailyQuest", "dailyDone"];
  const isBig = (n) => BIG_NOTICES.indexOf(n.kind) >= 0;
  const bigWaiting = [];
  function dismissToast(id) {
    const key = Number(id);
    clearTimeout(toastTimers.get(key));
    toastTimers.delete(key);
    const node = $notif.querySelector('.notif[data-id="' + key + '"]');
    const finish = () => {
      ui.toasts = ui.toasts.filter((x) => x.id !== key);
      renderNotifInto();
      if (bigWaiting.length && !ui.toasts.some(isBig)) setTimeout(() => { if (!ui.toasts.some(isBig) && bigWaiting.length) addToast(bigWaiting.shift()); }, 220);
    };
    // a notice folds away before it leaves the markup, instead of vanishing
    if (node && !lessMotion() && !node.classList.contains("sys-out")) {
      node.classList.remove("sys-new"); node.style.removeProperty("animation-delay"); node.classList.add("sys-out");
      const big = node.classList.contains("notif-big");
      swFx(node.getBoundingClientRect(), big ? "close" : "close small");
      setTimeout(finish, big ? SW_CLOSE_MS : 230);
    } else finish();
  }

  function addToast(n) {
    if (isBig(n) && ui.toasts.some(isBig)) { bigWaiting.push(n); return; }
    const same = !n.sticky && !n.action &&
      ui.toasts.find((x) => !x.sticky && !x.action && x.kind === n.kind && x.text === n.text);
    if (same) {
      same.count = (same.count || 1) + 1;
      clearTimeout(toastTimers.get(same.id));
      toastTimers.set(same.id, setTimeout(() => dismissToast(same.id), toastDuration(n.text)));
      renderNotifInto();
      return;
    }
    const id = ++M.toastSeq;
    ui.toasts.push({ ...n, id });
    while (ui.toasts.length > MAX_TOASTS) {
      const oldest = ui.toasts.find((x) => !x.sticky && !isBig(x));
      if (!oldest) break;
      clearTimeout(toastTimers.get(oldest.id));
      toastTimers.delete(oldest.id);
      ui.toasts = ui.toasts.filter((x) => x !== oldest);
    }
    renderNotifInto();
    // A sticky notification waits to be dealt with instead of timing out.
    // Used for the new-version prompt: an announcement that disappears after
    // four seconds is one most people will never happen to be looking at.
    // The Daily Quest and its completion are read and closed by hand.
    if (!n.sticky && n.kind !== "dailyQuest" && n.kind !== "dailyDone") toastTimers.set(id, setTimeout(() => dismissToast(id), toastDuration(n.text)));
  }
  // Escape closes the big notice on screen, as it closes a window.
  function closeBigNotice() {
    const n = ui.toasts.find(isBig);
    if (!n) return false;
    dismissToast(n.id);
    return true;
  }

  function maybeShowNextRankup() {
    if (ui.rankupShowing || !ui.rankupQueue.length) return;
    ui.rankupShowing = ui.rankupQueue.shift();
    renderRankupInto();
    M.rankupTimer = setTimeout(dismissRankup, 3800);
  }
  function dismissRankup() {
    if (M.rankupTimer) { clearTimeout(M.rankupTimer); M.rankupTimer = null; }
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
  // Typing a time instead of turning to it: a tap on the number in the band,
  // or a digit key on a focused wheel, lays a small field over that number.
  // Two digits — or one that cannot begin a valid pair, a 7 for the hours —
  // set the wheel, and the hours then hand over to the minutes. Leaving the
  // field keeps what was typed if it is a real hour or minute; Escape drops it.
  function typeWheel(col, first) {
    const tw = col && col.parentElement;
    if (!tw || !ui.timeDraft || tw.querySelector(".tw-type")) return;
    const part = col.dataset.tw, count = Number(col.dataset.count);
    const box = document.createElement("input");
    box.className = "tw-type";
    box.type = "text"; box.inputMode = "numeric"; box.maxLength = 2; box.autocomplete = "off";
    box.setAttribute("aria-label", col.getAttribute("aria-label") || "");
    box.style.left = col.offsetLeft + "px"; box.style.width = col.offsetWidth + "px";
    box.value = first != null ? String(first) : String(ui.timeDraft[part]).padStart(2, "0");
    tw.appendChild(box);
    box.focus({ preventScroll: true });
    if (first == null) box.select();
    let done = false;
    const finish = (keep) => {
      if (done) return;
      done = true;
      const v = box.value === "" ? NaN : Number(box.value);
      box.remove();
      if (keep && Number.isInteger(v) && v >= 0 && v < count && ui.timeDraft) {
        ui.timeDraft[part] = v;
        col.scrollTop = (count + v) * TW_ROW;
        markWheel(col);
      }
    };
    const take = () => {
      box.value = box.value.replace(/\D/g, "").slice(0, 2);
      const s = box.value;
      if (s.length === 2 || (s.length === 1 && Number(s) * 10 >= count)) {
        finish(true);
        const minutes = part === "h" && tw.querySelector('.tw-col[data-tw="m"]');
        if (minutes) typeWheel(minutes);
        else col.focus({ preventScroll: true });
      }
    };
    box.addEventListener("input", take);
    box.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault(); e.stopPropagation();
        finish(true);
        const ok = document.querySelector(".time-confirm");
        if (ok) ok.click();
      } else if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation();
        finish(false);
        col.focus({ preventScroll: true });
      }
    });
    box.addEventListener("blur", () => finish(true));
    if (first != null) take();
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
    const today = SYS.todayKey();
    const wasComplete = SYS.dailyQuest(M.state, today).complete;
    const draft = SYS.clone(M.state);
    const notifications = (mutator(draft) || []).slice();
    M.state = draft;
    persist(M.state);
    SYS.PlannerSync.commit(M.state.planner);
    renderAppInto();
    // The press that meets the last goal completes the Daily Quest. Said
    // once a day: taking a goal back and meeting it again is not news.
    if (!wasComplete && M.questCelebrated !== today && SYS.dailyQuest(M.state, today).complete) {
      M.questCelebrated = today;
      const day = (SYS.statsWeek(M.state, 0).days || []).find((d) => d.dateKey === today);
      notifications.push({ kind: "dailyDone", text: "", xp: day ? day.xp : 0 });
    }
    processNotifications(notifications);
  }

  // The Daily Quest arrives once a day, on the first open (or the first
  // return to the app) of the day that has goals in it. Kept per device: a
  // phone and a laptop each announce it once.
  const QUEST_SEEN_KEY = "sys-quest-arrived";
  // Neither the Daily Quest nor the weekly report greets an account whose
  // overview is behind the subscription (SYS.pageLocked).
  function maybeAnnounceDailyQuest() {
    if (ui.landing || ui.assess || ui.modal || document.hidden || !M.state || SYS.pageLocked(ui, "overview")) return;
    const today = SYS.todayKey();
    let seen = null;
    try { seen = localStorage.getItem(QUEST_SEEN_KEY); } catch (e) {}
    if (seen === today) return;
    const q = SYS.dailyQuest(M.state, today);
    if (!q.goals.length || q.complete) return;
    try { localStorage.setItem(QUEST_SEEN_KEY, today); } catch (e) {}
    const goals = q.goals.slice(0, 5).map((x) => ({ title: x.title, count: SYS.questCount(x) }));
    addToast({ kind: "dailyQuest", text: goals.map((g) => g.title).join(" · "), goals, more: q.goals.length - goals.length });
  }

  // The weekly report (js/ui-weekly.js) opens by itself once, on the first
  // visit of a new week, for the week just finished, when there was anything
  // in it. The Daily Quest waits for it to be closed.
  const WEEK_SEEN_KEY = "sys-week-report";
  function maybeShowWeekReport() {
    if (ui.landing || ui.assess || ui.modal || document.hidden || !M.state || SYS.pageLocked(ui, "overview")) return false;
    const monday = SYS.statsWeek(M.state, 0).days[0].dateKey;
    let seen = null;
    try { seen = localStorage.getItem(WEEK_SEEN_KEY); } catch (e) {}
    if (seen === monday) return false;
    try { localStorage.setItem(WEEK_SEEN_KEY, monday); } catch (e) {}
    if (!(SYS.weekReport(M.state, -1).xp > 0)) return false;
    openWeekCard(-1);
    return true;
  }
  // The picture is drawn as the window opens, so Share hands it over at once:
  // a phone only lets a page share straight after a tap.
  function openWeekCard(offset) {
    ui.weekCard = { offset, busy: false, images: {} };
    ui.modal = "weekCard";
    renderModalInto();
    prepareWeekImage();
  }
  function prepareWeekImage() {
    const w = ui.weekCard;
    if (!w || w.images[w.offset]) return w && w.images[w.offset];
    w.images[w.offset] = SYS.weekCardImage(M.state, ui, w.offset).catch(() => null);
    return w.images[w.offset];
  }
  // Whatever the app shows by itself when it is opened: the week's report
  // first, then the day's quest.
  function greetOnOpen() {
    maybeShowWeekReport();
    maybeAnnounceDailyQuest();
  }

  // A big quest's EXP is held until its checkpoint question is answered, and
  // the question used to have to be found on the row. Reaching a checkpoint
  // now opens it: that is the moment the person is finished and willing to
  // write, and a held quest that is never answered is EXP that never lands.
  function maybeOpenReflection(taskId) {
    if (ui.modal) return;
    const task = M.state.tasks.find((x) => x.id === taskId);
    if (!task) return;
    const cp = SYS.dueReflection ? SYS.dueReflection(task) : null;
    if (!cp) return;
    ui.reflectionFor = { taskId, cp };
    ui.reflectionDraft = "";
    ui.reflectionError = null;
    ui.reflectionBusy = false;
    ui.modal = "reflection";
    renderModalInto();
  }

  function arm(kind, id) {
    if (M.armedTimer) clearTimeout(M.armedTimer);
    ui.armed = { kind, id };
    M.armedTimer = setTimeout(() => { ui.armed = null; renderAppInto(); renderModalInto(); }, 3000);
  }
  function disarm() {
    if (M.armedTimer) { clearTimeout(M.armedTimer); M.armedTimer = null; }
    ui.armed = null;
  }
  function isArmed(kind, id) { return !!ui.armed && ui.armed.kind === kind && ui.armed.id === id; }

  // Categories and traits are the shared vocabulary, not a personal list.
  // Adding to the index is not possible from the app at all; see
  // renderIntelligencePage. Removing a trait the seed does not include is
  // still the admin's, for accounts that gained one before that was closed.
  const INDEX_EDITS = new Set(["remove-trait"]);

  const ARMABLE = new Set(["delete-task", "planner-delete", "event-delete", "friend-remove-armed", "remove-trait", "delete-task-from-form", "reset-data", "admin-grant-admin", "admin-revoke-admin"]);

  Object.assign(M, { maybeAnnounceDailyQuest, maybeShowWeekReport, openWeekCard, prepareWeekImage, greetOnOpen, $sidebar, $statusbar, $page, $notif, $rankup, $modal, $assess, $importInput, $feedbackShotInput, LANDING_KEY, landingSeen, leaveLanding, renderLandingInto, renderAssessmentInto, aiLimitText, saveAssessDraft, resumeIndex, openAssessment, closeAssessmentIfDone, renderSidebarInto, renderStatusbarInto, keepBgVideos, renderPageInto, timelineStart, renderAppInto, renderModalInto, refreshRemindCount, refreshPushState, renderNotifInto, renderRankupInto, setPath, TOAST_NOTICE_MS, TOAST_PER_CHAR_MS, toastDuration, MAX_TOASTS, toastTimers, dismissToast, addToast, maybeShowNextRankup, dismissRankup, closeBigNotice, processNotifications, blankSchedule, scheduleFromWeeklyCount, toggleIn, resetAmount, openLogSheet, TW_ROW, openTimeSheet, closeTimeSheet, openEventTimeSheet, placeWheels, markWheel, settleWheel, typeWheel, closeLogSheet, logDay, pressAmountKey, stepAmount, runGameAction, maybeOpenReflection, arm, disarm, isArmed, INDEX_EDITS, ARMABLE });
})(window.SYS = window.SYS || {});

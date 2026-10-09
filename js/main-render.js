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

  function renderAssessmentInto() {
    $assess.innerHTML = ui.assess ? SYS.renderAssessment(ui, M.state) : "";
    document.body.classList.toggle("assessing", !!ui.assess);
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
    keepBgVideos($page, () => { $page.innerHTML = SYS.renderPage(M.state, ui); });
    if (SYS.FramePlayer) SYS.FramePlayer.refresh();
    if (SYS.Feathers) SYS.Feathers.refresh();
    const tl = $page.querySelector(".tl-scroll");
    if (tl) tl.scrollTop = kept && kept.day === tl.dataset.day ? kept.top : timelineStart(tl.dataset.day);
  }
  function timelineStart(day) {
    const timed = SYS.eventsOn(M.state, day).filter((o) => !o.allDay);
    const minutes = day === SYS.todayKey() ? (new Date().getHours() - 1) * 60
      : timed.length ? SYS.minutesOf(timed[0].from) - 30
      : 8 * 60;
    return Math.max(0, minutes / 60 * SYS.PLANNER_HOUR_PX);
  }
  function renderAppInto() { renderSidebarInto(); renderStatusbarInto(); renderPageInto(); }
  function renderModalInto() {
    keepBgVideos($modal, () => { $modal.innerHTML = SYS.renderModalLayer(M.state, ui); });
    // A profile can carry an animated frame.
    if (ui.modal === "profile" && SYS.FramePlayer) SYS.FramePlayer.refresh();
    if (SYS.Feathers) SYS.Feathers.refresh();
    // Fresh markup scrolls to the top, which would show every wheel at 00.
    if (ui.modal === "time") placeWheels();
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
    const id = ++M.toastSeq;
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
    const draft = SYS.clone(M.state);
    const notifications = mutator(draft) || [];
    M.state = draft;
    persist(M.state);
    SYS.PlannerSync.commit(M.state.planner);
    renderAppInto();
    processNotifications(notifications);
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

  Object.assign(M, { $sidebar, $statusbar, $page, $notif, $rankup, $modal, $assess, $importInput, $feedbackShotInput, LANDING_KEY, landingSeen, leaveLanding, renderLandingInto, renderAssessmentInto, aiLimitText, saveAssessDraft, resumeIndex, openAssessment, closeAssessmentIfDone, renderSidebarInto, renderStatusbarInto, keepBgVideos, renderPageInto, timelineStart, renderAppInto, renderModalInto, refreshRemindCount, refreshPushState, renderNotifInto, renderRankupInto, setPath, TOAST_NOTICE_MS, TOAST_PER_CHAR_MS, toastDuration, MAX_TOASTS, toastTimers, dismissToast, addToast, maybeShowNextRankup, dismissRankup, processNotifications, blankSchedule, scheduleFromWeeklyCount, toggleIn, resetAmount, openLogSheet, TW_ROW, openTimeSheet, closeTimeSheet, openEventTimeSheet, placeWheels, markWheel, settleWheel, closeLogSheet, logDay, pressAmountKey, stepAmount, runGameAction, maybeOpenReflection, arm, disarm, isArmed, INDEX_EDITS, ARMABLE });
})(window.SYS = window.SYS || {});

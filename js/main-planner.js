// App: the planner's items, events and dragging, and the other page-wide listeners (keys, scroll,
// tooltips, files).
// One of the files main.js was split into; the names they share travel through SYS._main.
(function (SYS) {
  "use strict";
  const M = SYS._main || (SYS._main = {});
  const { $feedbackShotInput, $importInput, TW_ROW, applyLanguage, applyThemeAttribute, blankSchedule, closeLogSheet, closeTimeSheet, commitName, logDay, markWheel, maybeOpenReflection, normalizeImportedState, persist, pressAmountKey, refreshPushState, refuseLocked, renderLandingInto, runFriendSearch, setPath, settleWheel, shrinkImage, stepAmount, ui } = M;

  // ---------------- planner ----------------

  // Another device changed the planner. Not redrawn under someone's typing —
  // the next redraw picks it up.
  function onPlannerFromServer() {
    M.state.planner = SYS.PlannerSync.view();
    const typing = document.activeElement && /^(planner-input|planner-edit-input|event-title)$/.test(document.activeElement.id);
    if (ui.page === "planner" && !typing) M.renderPageInto();
    if (ui.modal === "eventView") M.renderModalInto();
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
      M.runGameAction((draft) => { SYS.addTodo(draft, { title, day }); return []; });
    }
    const box = document.getElementById("planner-input");
    if (box) box.focus();
  }

  function commitPlannerEdit() {
    const edit = ui.plannerEdit;
    if (!edit) return;
    ui.plannerEdit = null;
    const todo = (M.state.planner.todos || []).find((x) => x.id === edit.id);
    if (todo && (edit.draft || "").trim() && edit.draft.trim() !== todo.title) {
      M.runGameAction((draft) => { SYS.renameTodo(draft, edit.id, edit.draft); return []; });
    } else {
      M.renderPageInto();
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
    M.renderModalInto();
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
    if (error) { f.error = error; M.renderModalInto(); return; }
    ui.eventForm = null;
    ui.eventView = null;
    ui.modal = null;
    // The day the event is on is the day worth looking at next.
    if ((ui.plannerView || "day") === "day") ui.plannerDay = input.start === SYS.todayKey() ? null : input.start;
    M.runGameAction((draft) => {
      if (f.mode === "edit") SYS.updateEvent(draft, f.id, f.day, input, f.recurring ? f.scope : "following");
      else SYS.addEvent(draft, input);
      return [];
    });
    M.renderModalInto();
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
    if (cancelled || !n || (n.from === d.block.dataset.from && n.to === d.block.dataset.to && n.span === (Number(d.block.dataset.span) || 0))) { M.renderPageInto(); return; }
    const ev = SYS.findEvent(M.state, d.block.dataset.id);
    if (!ev) { M.renderPageInto(); return; }
    const move = { id: ev.id, day: d.block.dataset.day, from: n.from, to: n.to, span: n.span };
    if (ev.repeat.type === "none") { applyEventTimes(move, "following"); return; }
    ui.eventMove = move;
    ui.modal = "eventMove";
    M.renderModalInto();
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
    const ev = SYS.findEvent(M.state, move.id);
    const o = ev && SYS.eventOccurrence(M.state, move.id, move.day);
    if (!o) { M.renderPageInto(); return; }
    // One day keeps that day's own title; the series keeps the series'.
    const input = {
      title: scope === "this" ? o.title : ev.title, start: move.day, span: move.span, allDay: false, from: move.from, to: move.to,
      reminders: ev.reminders,
      repeat: scope === "this" ? { type: "none" } : { ...ev.repeat },
    };
    M.runGameAction((draft) => { SYS.updateEvent(draft, move.id, move.day, input, scope); return []; });
  }

  // The morning question: unfinished items from days that are over. Asked
  // only when nothing else is on screen — a sync question or a level-up
  // outranks it, and it comes back on the next chance (opening the planner,
  // returning to the app) because nothing is marked until it is answered.
  function maybeAskCarry() {
    if (ui.modal || ui.rankupShowing) return;
    const pending = SYS.pendingCarry(M.state);
    if (!pending.length) return;
    ui.carrySel = new Set(pending.map((x) => x.id));
    ui.modal = "carry";
    M.renderModalInto();
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
        if (box) {
          if (kept) box.textContent = kept;
          else box.innerHTML = SYS.taskIconHtml({ title: ui.taskForm && ui.taskForm.title });
        }
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
      const slid = M.state.tasks.find((x) => x.id === id);
      if (slid && newVal > (Number(slid.completion) || 0) && refuseLocked(slid)) {
        M.renderPageInto(); // put the slider back where the task actually is
        return;
      }
      M.runGameAction((draft) => SYS.applyTaskProgress(draft, id, newVal));
      maybeOpenReflection(id);
      return;
    }
    // Theme and language are dropdowns now, so they arrive as change events.
    const selectAction = e.target.dataset && e.target.dataset.action;
    if (selectAction === "set-theme") {
      const themeName = e.target.value;
      if (!SYS.ownsTheme(ui.wallet, themeName)) { M.renderModalInto(); return; }
      M.runGameAction((draft) => { SYS.setTheme(draft, themeName); return []; });
      applyThemeAttribute();
      M.renderModalInto();
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
      M.renderModalInto();
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
      M.renderModalInto();
      return;
    }
    if (selectAction === "set-stats-year") {
      ui.statsYear = Number(e.target.value) || null;
      M.renderPageInto();
      return;
    }
    if (selectAction === "landing-language") {
      const lang = e.target.value;
      M.runGameAction((draft) => { SYS.setLanguage(draft, lang); return []; });
      applyLanguage();
      renderLandingInto();
      M.renderAppInto();
      return;
    }
    if (selectAction === "set-language") {
      const lang = e.target.value;
      M.runGameAction((draft) => { SYS.setLanguage(draft, lang); return []; });
      applyLanguage();
      M.renderAppInto();
      M.renderModalInto();
      return;
    }

    if (e.target.dataset && e.target.dataset.action === "commit-note") {
      const id = e.target.dataset.id;
      const text = e.target.value;
      // Writing a note is not a game action — it pays nothing and takes
      // nothing back — but it goes through the same path so it is persisted
      // and pushed like everything else.
      M.runGameAction((draft) => SYS.setHabitNote(draft, id, logDay(), text));
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
      M.renderAppInto();
      return;
    }
    if (e.target.dataset && e.target.dataset.action === "change-task-type") {
      if (!ui.taskForm) return;
      if (ui.taskForm.taskType === "Long Term" && !["gradual", "allAtOnce"].includes(ui.taskForm.expMode)) {
        ui.taskForm.expMode = "gradual";
      }
      M.renderAppInto();
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
      M.renderModalInto();
      return;
    }
    if (e.target.id === "event-title" && e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      saveEventForm();
      return;
    }
    if (e.target.id === "friend-search" && e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      runFriendSearch();
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
      if (e.key === "Escape") { e.preventDefault(); ui.plannerEdit = null; M.renderPageInto(); return; }
    }
    if (e.target.id === "name-input") {
      if (e.key === "Enter") { e.preventDefault(); e.target.blur(); }
      if (e.key === "Escape") { ui.nameEditing = false; ui.__nameDraft = null; M.renderAppInto(); }
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

  if ($feedbackShotInput) $feedbackShotInput.addEventListener("change", () => {
    const file = $feedbackShotInput.files && $feedbackShotInput.files[0];
    $feedbackShotInput.value = "";
    const f = ui.feedback;
    if (!file || !f) return;
    f.shotBusy = true; f.error = null;
    M.renderModalInto();
    shrinkImage(file).then((dataUrl) => {
      if (ui.feedback !== f) return;
      f.shot = dataUrl;
    }).catch(() => {
      if (ui.feedback !== f) return;
      f.error = SYS.t("feedback.errShot");
    }).then(() => {
      if (ui.feedback !== f) return;
      f.shotBusy = false;
      M.renderModalInto();
    });
  });

  $importInput.addEventListener("change", () => {
    const file = $importInput.files && $importInput.files[0];
    $importInput.value = "";
    if (!file) return;
    SYS.Storage.importFromFile(file).then((parsed) => {
      M.state = normalizeImportedState(parsed);
      persist(M.state);
      // A backup's planner is added to this one, never swapped in for it:
      // restoring an old file must not delete what was planned since.
      if (parsed.planner) SYS.PlannerSync.absorbLegacy(parsed.planner);
      M.state.planner = SYS.PlannerSync.view();
      applyThemeAttribute();
      ui.modal = null;
      ui.expanded = {};
      ui.importError = null;
      M.renderAppInto();
      M.renderModalInto();
      M.addToast({ kind: "info", text: SYS.t("common.backupImported") });
    }).catch((err) => {
      ui.importError = err.message;
      M.renderModalInto();
    });
  });

  Object.assign(M, { onPlannerFromServer, plannerDay, addPlannerTodo, commitPlannerEdit, pad2, shiftMonth, openEventForm, saveEventForm, DRAG_SNAP, drag, swallowClick, hhmmOf, startDrag, endDrag, applyEventTimes, maybeAskCarry, showCompareTip, hideCompareTip, compareHit, supportsScrollEnd });
})(window.SYS = window.SYS || {});

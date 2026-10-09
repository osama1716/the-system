// Click handlers: the planner and its events.
// One of the files main.js was split into; the names they share travel through SYS._main.
(function (SYS) {
  "use strict";
  const M = SYS._main || (SYS._main = {});
  const { ACTIONS, TW_ROW, addPlannerTodo, applyEventTimes, openEventForm, openEventTimeSheet, plannerDay, refreshPushState, saveEventForm, shiftMonth, ui } = M;

  ACTIONS["planner-add"] = function () {
    addPlannerTodo();
  };

  ACTIONS["planner-toggle"] = function ({ id }) {
    M.runGameAction((draft) => { SYS.toggleTodo(draft, id); return []; });
  };

  ACTIONS["planner-edit"] = function ({ id }) {
    const todo = (M.state.planner.todos || []).find((x) => x.id === id);
    if (!todo) return;
    ui.plannerEdit = { id, draft: todo.title };
    M.renderPageInto();
    const box = document.getElementById("planner-edit-input");
    if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
  };

  ACTIONS["planner-delete"] = function ({ id }) {
    if (ui.plannerEdit && ui.plannerEdit.id === id) ui.plannerEdit = null;
    M.runGameAction((draft) => { SYS.deleteTodo(draft, id); return []; });
  };

  ACTIONS["planner-shift-day"] = function ({ el }) {
    const delta = Number(el.dataset.delta) || 0;
    const view = ui.plannerView || "day";
    const next = view === "month" ? shiftMonth(plannerDay(), delta)
      : SYS.shiftDay(plannerDay(), view === "week" ? 7 * delta : delta);
    ui.plannerDay = next === SYS.todayKey() ? null : next;
    ui.plannerEdit = null;
    M.renderPageInto();
  };

  ACTIONS["planner-today"] = function () {
    ui.plannerDay = null;
    ui.plannerEdit = null;
    M.renderPageInto();
  };

  ACTIONS["planner-view"] = function ({ el }) {
    ui.plannerView = el.dataset.view;
    ui.plannerEdit = null;
    M.renderPageInto();
  };

  ACTIONS["planner-focus-add"] = function () {
    const box = document.getElementById("planner-input");
    if (box) box.focus();
  };

  // One item brought over, for a day where only some of it still matters.
  ACTIONS["planner-move-one"] = function ({ id }) {
    if (!id) return;
    M.runGameAction((draft) => { SYS.moveTodos(draft, [id], SYS.todayKey()); return []; });
    M.renderPageInto();
    M.addToast({ kind: "info", text: SYS.t("planner.moved", { n: 1 }) });
  };

  // Everything a past day did not finish, brought to today in one go.
  ACTIONS["planner-move-today"] = function ({ el }) {
    const from = el.dataset.day;
    const ids = SYS.todosOn(M.state, from).filter((x) => !x.done).map((x) => x.id);
    if (!ids.length) return;
    M.runGameAction((draft) => { SYS.moveTodos(draft, ids, SYS.todayKey()); return []; });
    ui.plannerDay = null;
    M.renderPageInto();
    M.addToast({ kind: "info", text: SYS.t("planner.moved", { n: ids.length }) });
  };

  ACTIONS["planner-open-day"] = function ({ el }) {
    const d = el.dataset.day;
    ui.plannerDay = d === SYS.todayKey() ? null : d;
    ui.plannerView = "day";
    M.renderPageInto();
  };

  ACTIONS["event-new"] = function () {
    openEventForm(plannerDay(), null);
  };

  ACTIONS["event-new-at"] = function ({ el }) {
    openEventForm(plannerDay(), Number(el.dataset.hour) || 0);
  };

  ACTIONS["event-open"] = function ({ el, id }) {
    ui.eventView = { id, day: el.dataset.day };
    ui.modal = "eventView";
    M.renderModalInto();
  };

  ACTIONS["event-edit"] = function () {
    const v = ui.eventView;
    const ev = v && SYS.findEvent(M.state, v.id);
    const o = ev && SYS.eventOccurrence(M.state, v.id, v.day);
    if (!o) return;
    ui.eventForm = {
      mode: "edit", id: ev.id, day: v.day, recurring: ev.repeat.type !== "none",
      title: o.title, date: v.day, endDate: o.endDay, allDay: ev.allDay, from: o.from || "09:00", to: o.to || "10:00",
      repeatType: ev.repeat.type, days: ev.repeat.days.slice(), monthBy: ev.repeat.monthBy || "date",
      untilOn: !!ev.repeat.until, until: ev.repeat.until || "",
      scope: "this", error: null,
      reminders: (ev.reminders || []).slice(), customOpen: false, customN: "", customUnit: "min", customError: false,
    };
    ui.modal = "eventForm";
    M.renderModalInto();
    if (ui.cloudUser) refreshPushState();
  };

  ACTIONS["event-delete"] = function ({ id }) {
    const [evId, scope] = String(id).split("|");
    const day = ui.eventView && ui.eventView.day;
    ui.modal = null;
    ui.eventView = null;
    M.runGameAction((draft) => { SYS.deleteEvent(draft, evId, day, scope); return []; });
    M.renderModalInto();
  };

  ACTIONS["event-allday"] = function () {
    if (ui.eventForm) { ui.eventForm.allDay = !ui.eventForm.allDay; M.renderModalInto(); }
  };

  ACTIONS["event-repeat-day"] = function ({ el }) {
    const f = ui.eventForm;
    if (!f) return;
    const wd = Number(el.dataset.wd);
    f.days = f.days.indexOf(wd) >= 0 ? f.days.filter((x) => x !== wd) : f.days.concat(wd);
    M.renderModalInto();
  };

  ACTIONS["event-until"] = function () {
    const f = ui.eventForm;
    if (!f) return;
    f.untilOn = !f.untilOn;
    if (f.untilOn && !f.until && /^\d{4}-\d{2}-\d{2}$/.test(f.date)) f.until = shiftMonth(f.date, 1);
    M.renderModalInto();
  };

  ACTIONS["event-scope"] = function ({ el }) {
    if (ui.eventForm) { ui.eventForm.scope = el.dataset.scope === "following" ? "following" : "this"; M.renderModalInto(); }
  };

  ACTIONS["event-save"] = function () {
    saveEventForm();
  };

  ACTIONS["event-reminder-toggle"] = function ({ el }) {
    const f = ui.eventForm;
    if (!f) return;
    const offset = Number(el.dataset.offset);
    const had = (f.reminders || []).indexOf(offset) >= 0;
    const list = (f.reminders || []).filter((x) => x !== offset);
    if (!had) list.push(offset);
    f.reminders = SYS.cleanEventReminders(list);
    M.renderModalInto();
  };

  ACTIONS["event-reminder-custom-cancel"] = function () {
    if (ui.eventForm) { ui.eventForm.customOpen = false; ui.eventForm.customN = ""; ui.eventForm.customError = false; M.renderModalInto(); }
  };

  ACTIONS["event-reminder-custom"] = function () {
    if (ui.eventForm) { ui.eventForm.customOpen = true; ui.eventForm.customError = false; M.renderModalInto(); }
  };

  ACTIONS["event-reminder-custom-add"] = function () {
    const f = ui.eventForm;
    if (!f) return;
    const n = Math.round(Number(f.customN));
    const minutes = n * ({ min: 1, hour: 60, day: 1440 }[f.customUnit] || 1);
    // Two different mistakes, two different answers: nothing (or not a
    // positive whole number) typed, or a time further back than a week.
    if (!(n > 0)) { f.customError = "number"; M.renderModalInto(); return; }
    if (minutes > SYS.EVENT_REMINDER_MAX_OFFSET) { f.customError = "far"; M.renderModalInto(); return; }
    f.reminders = SYS.cleanEventReminders((f.reminders || []).concat(minutes));
    f.customOpen = false; f.customN = ""; f.customError = false;
    M.renderModalInto();
  };

  ACTIONS["event-pick-time"] = function ({ el }) {
    openEventTimeSheet(el.dataset.which === "to" ? "to" : "from");
  };

  ACTIONS["event-move-apply"] = function ({ el }) {
    const m = ui.eventMove;
    ui.eventMove = null;
    ui.modal = null;
    M.renderModalInto();
    if (m) applyEventTimes(m, el.dataset.scope === "following" ? "following" : "this");
  };

  ACTIONS["carry-toggle"] = function ({ id }) {
    if (!ui.carrySel) return;
    if (ui.carrySel.has(id)) ui.carrySel.delete(id); else ui.carrySel.add(id);
    M.renderModalInto();
  };

  ACTIONS["carry-all"] = function () {
    const pending = SYS.pendingCarry(M.state).map((x) => x.id);
    const all = pending.every((x) => ui.carrySel && ui.carrySel.has(x));
    ui.carrySel = new Set(all ? [] : pending);
    M.renderModalInto();
  };

  ACTIONS["carry-move"] = function ({ action }) {
    const chosen = action === "carry-move" && ui.carrySel ? [...ui.carrySel] : [];
    const today = SYS.todayKey();
    let moved = 0;
    ui.modal = null;
    ui.carrySel = null;
    M.runGameAction((draft) => { moved = SYS.carryTodos(draft, chosen, today); return []; });
    M.renderModalInto();
    if (moved) M.addToast({ kind: "info", text: SYS.t("planner.moved", { n: moved }) });
  };

  ACTIONS["carry-leave"] = function ({ action }) {
    const chosen = action === "carry-move" && ui.carrySel ? [...ui.carrySel] : [];
    const today = SYS.todayKey();
    let moved = 0;
    ui.modal = null;
    ui.carrySel = null;
    M.runGameAction((draft) => { moved = SYS.carryTodos(draft, chosen, today); return []; });
    M.renderModalInto();
    if (moved) M.addToast({ kind: "info", text: SYS.t("planner.moved", { n: moved }) });
  };

  ACTIONS["tw-pick"] = function ({ el }) {
    const col = el.closest(".tw-col");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    col.scrollTo({ top: Number(el.dataset.i) * TW_ROW, behavior: reduce ? "auto" : "smooth" });
  };


})(window.SYS = window.SYS || {});

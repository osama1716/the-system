// UI: the planner — day, week and month — and its event windows.
// One of the files ui.js was split into; the names they share travel through SYS._ui.
(function (SYS) {
  "use strict";
  const U = SYS._ui || (SYS._ui = {});
  const { dateLocale, escapeHtml, icon, pageIcon, renderPageHead, ringSvg, t, weekdayLabels } = U;

  // ---------- Planner page ----------
  //
  // A plain list for one day. No points, no evaluation, no lock: see
  // js/planner.js for why it stays apart from everything that scores.
  function keyToDate(key) {
    const [y, m, d] = String(key).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }
  function plannerDayTitle(key) {
    const today = SYS.todayKey();
    const rel = key === today ? t("planner.today")
      : key === SYS.shiftDay(today, -1) ? t("planner.yesterday")
      : key === SYS.shiftDay(today, 1) ? t("planner.tomorrow") : "";
    const date = keyToDate(key).toLocaleDateString(dateLocale(), { weekday: "long", day: "numeric", month: "long" });
    return rel ? rel + " · " + date : date;
  }
  function longDay(key) {
    return keyToDate(key).toLocaleDateString(dateLocale(), { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  }
  function shortDay(key) {
    return keyToDate(key).toLocaleDateString(dateLocale(), { weekday: "short", day: "numeric", month: "short" });
  }

  function renderTodo(ui, todo, movable) {
    const editing = ui.plannerEdit && ui.plannerEdit.id === todo.id;
    const armed = !!ui.armed && ui.armed.kind === "task" && ui.armed.id === todo.id;
    const body = editing
      ? `<input id="planner-edit-input" class="field-input todo-edit" data-bind="plannerEdit.draft" maxlength="${SYS.PLANNER_TITLE_MAX}" value="${escapeHtml(ui.plannerEdit.draft)}" aria-label="${t("planner.edit")}" />`
      : `<span class="todo-title">${escapeHtml(todo.title)}</span>
         ${todo.from ? `<span class="todo-from">${t("planner.from", { day: escapeHtml(shortDay(todo.from)) })}</span>` : ""}`;
    return `
      <li class="todo ${todo.done ? "done" : ""}">
        <button class="todo-check" role="checkbox" aria-checked="${todo.done ? "true" : "false"}" data-action="planner-toggle" data-id="${escapeHtml(todo.id)}" aria-label="${escapeHtml(todo.title)}">${todo.done ? icon("check", 13) : ""}</button>
        <div class="todo-body">${body}</div>
        ${movable && !todo.done && !editing ? `<button class="icon-mini" data-action="planner-move-one" data-id="${escapeHtml(todo.id)}" aria-label="${t("planner.moveToday")}" title="${t("planner.moveToday")}">${icon("chevronRight", 13)}</button>` : ""}
        ${editing ? "" : `<button class="icon-mini" data-action="planner-edit" data-id="${escapeHtml(todo.id)}" aria-label="${t("planner.edit")}" title="${t("planner.edit")}">${icon("pencil", 13)}</button>`}
        <button class="icon-mini ${armed ? "danger-arm" : ""}" data-action="planner-delete" data-id="${escapeHtml(todo.id)}" aria-label="${t("planner.delete")}" title="${armed ? t("intel.confirmAgain") : t("planner.delete")}">${icon(armed ? "check" : "trash", 13)}</button>
      </li>`;
  }

  // One hour of the day view's timeline, in pixels. main.js scrolls by it.
  const TL_HOUR = 48;
  SYS.PLANNER_HOUR_PX = TL_HOUR;

  function fmtClock(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return new Date(2000, 0, 1, h, m).toLocaleTimeString(dateLocale(), { hour: "numeric", minute: "2-digit" });
  }
  SYS.fmtClock = fmtClock;
  function fmtHour(h) {
    return new Date(2000, 0, 1, h, 0).toLocaleTimeString(dateLocale(), { hour: "numeric" });
  }
  function mondayOf(key) {
    const wd = keyToDate(key).getDay();
    return SYS.shiftDay(key, -((wd + 6) % 7));
  }

  // Habits due on a day, for the planner to show when asked to. Read-only:
  // tapping one goes to the Habits page, where logging it belongs.
  function plannerHabits(state, day) {
    if (!state.settings.plannerShowHabits) return [];
    return state.tasks.filter((x) => x.recurring && !SYS.isArchivedOn(x, day) && SYS.isDueOn(x, day));
  }
  function renderPlannerHabits(state, day) {
    const list = plannerHabits(state, day);
    if (!list.length) return "";
    return `
      <div class="planner-habits">
        ${list.map((h) => {
          const done = SYS.habitDoneOn(h, day);
          const times = SYS.reminderTimes(h);
          return `<button class="ph-chip ${done ? "done" : ""}" data-action="nav" data-page="habits" aria-label="${escapeHtml(h.title)}${done ? " ✓" : ""}">
            <span aria-hidden="true">${U.taskIconHtml(h)}</span>
            <span class="ph-title">${escapeHtml(h.title)}</span>
            ${times.length ? `<span class="ph-time">${escapeHtml(times.map(fmtClock).join(" · "))}</span>` : ""}
            ${done ? icon("check", 12) : ""}
          </button>`;
        }).join("")}
      </div>`;
  }

  // The day view's second half: all-day items as a row, then the hours.
  function renderTimeline(state, day) {
    const line = SYS.timelineOn(state, day);
    const allDay = line.allDay;
    const laid = SYS.layoutDay(line.timed);
    const hours = Array.from({ length: 24 }, (_, h) => `
        <div class="tl-hour" style="top:${h * TL_HOUR}px;"><span class="tl-label">${h ? escapeHtml(fmtHour(h)) : ""}</span></div>
        <button class="tl-slot" style="top:${h * TL_HOUR}px;height:${TL_HOUR}px;" data-action="event-new-at" data-hour="${h}" aria-label="${t("planner.newEventAt", { time: escapeHtml(fmtHour(h)) })}"></button>`).join("");
    const blocks = laid.map((o) => {
      const top = SYS.minutesOf(o.segFrom) / 60 * TL_HOUR;
      const height = Math.max(22, (SYS.minutesOf(o.segTo) - SYS.minutesOf(o.segFrom)) / 60 * TL_HOUR - 2);
      const width = `calc((100% - var(--tl-gutter)) / ${o.cols} - 3px)`;
      const start = `calc(var(--tl-gutter) + (100% - var(--tl-gutter)) * ${o.col} / ${o.cols})`;
      // The morning end of a night is drawn but not dragged: it belongs to
      // the day before, and moving it from here would be moving that.
      // Only a same-day event can be stretched from its foot.
      return `
        <button class="tl-event ${height < 40 ? "short" : ""} ${o.spill ? "spill" : ""}" style="top:${top}px;height:${height}px;width:${width};inset-inline-start:${start};"
          data-action="event-open" data-id="${escapeHtml(o.id)}" data-day="${o.day}"
          data-from="${o.from}" data-to="${o.to}" data-span="${o.span || 0}" data-overnight="${o.overnight ? 1 : 0}" data-spill="${o.spill ? 1 : 0}">
          <span class="tl-event-title">${escapeHtml(o.title)}</span>
          <span class="tl-event-time">${escapeHtml(fmtClock(o.from))} – ${escapeHtml(fmtClock(o.to))}${o.overnight && !o.spill ? " ↓" : ""}</span>
          ${o.overnight || o.spill ? "" : `<span class="tl-resize" aria-hidden="true"></span>`}
        </button>`;
    }).join("");
    let now = "";
    if (day === SYS.todayKey()) {
      const d = new Date();
      now = `<div class="tl-now" style="top:${(d.getHours() * 60 + d.getMinutes()) / 60 * TL_HOUR}px;" aria-hidden="true"></div>`;
    }
    return `
      ${allDay.length ? `<div class="tl-allday">${allDay.map((o) => `
        <button class="ev-chip" data-action="event-open" data-id="${escapeHtml(o.id)}" data-day="${day}">${escapeHtml(o.title)}</button>`).join("")}</div>` : ""}
      <div class="tl-scroll" data-day="${day}">
        <div class="tl" style="height:${24 * TL_HOUR}px;">${hours}${blocks}${now}</div>
      </div>`;
  }

  function renderWeekView(state, ui, anchor) {
    const today = SYS.todayKey();
    const start = mondayOf(anchor);
    const days = Array.from({ length: 7 }, (_, i) => SYS.shiftDay(start, i));
    return `<div class="wv-grid">${days.map((day) => {
      const occ = SYS.coveringOn(state, day);
      const todos = SYS.todosOn(state, day);
      const d = keyToDate(day);
      const items = occ.map((o) => `
          <button class="wv-ev ${o.allDay ? "all-day" : ""}" data-action="event-open" data-id="${escapeHtml(o.id)}" data-day="${day}">
            ${o.spill ? `<span class="wv-time">↳</span>` : o.allDay ? "" : `<span class="wv-time">${escapeHtml(fmtClock(o.from))}</span>`}<span class="wv-title">${escapeHtml(o.title)}</span>
          </button>`).join("");
      return `
        <div class="wv-day ${day === today ? "today" : ""}">
          <button class="wv-head" data-action="planner-open-day" data-day="${day}">
            <span class="wv-wd">${escapeHtml(d.toLocaleDateString(dateLocale(), { weekday: "short" }))}</span>
            <span class="wv-num">${d.getDate()}</span>
          </button>
          <div class="wv-events">
            ${items || (todos.length || plannerHabits(state, day).length ? "" : `<span class="wv-none">–</span>`)}
            ${todos.length ? `<span class="wv-todos">${t("planner.progress", { done: todos.filter((x) => x.done).length, total: todos.length })}</span>` : ""}
            ${(() => { const hs = plannerHabits(state, day); return hs.length ? `<span class="wv-todos">${t("planner.habitsDone", { done: hs.filter((h) => SYS.habitDoneOn(h, day)).length, total: hs.length })}</span>` : ""; })()}
          </div>
        </div>`;
    }).join("")}</div>`;
  }

  function renderMonthView(state, ui, anchor) {
    const today = SYS.todayKey();
    const first = anchor.slice(0, 8) + "01";
    const month = anchor.slice(0, 7);
    const start = mondayOf(first);
    const heads = [1, 2, 3, 4, 5, 6, 0].map((i) => `<span class="mv-wd">${escapeHtml(weekdayLabels()[i])}</span>`).join("");
    const cells = Array.from({ length: 42 }, (_, i) => {
      const day = SYS.shiftDay(start, i);
      const occ = SYS.coveringOn(state, day);
      const d = keyToDate(day);
      const label = d.toLocaleDateString(dateLocale(), { weekday: "long", day: "numeric", month: "long" }) +
        (occ.length ? " · " + t("planner.eventCount", { n: occ.length }) : "");
      const shown = occ.slice(0, 2).map((o) => `<span class="mv-ev">${escapeHtml(o.title)}</span>`).join("");
      return `
        <button class="mv-cell ${day.slice(0, 7) === month ? "" : "other"} ${day === today ? "today" : ""} ${day === anchor && ui.plannerDay ? "sel" : ""}"
          data-action="planner-open-day" data-day="${day}" aria-label="${escapeHtml(label)}">
          <span class="mv-num">${d.getDate()}</span>
          ${occ.length ? `<span class="mv-dots" aria-hidden="true">${occ.slice(0, 3).map(() => "<i></i>").join("")}</span>` : ""}
          <span class="mv-evs" aria-hidden="true">${shown}${occ.length > 2 ? `<span class="mv-more">${t("planner.more", { n: occ.length - 2 })}</span>` : ""}</span>
        </button>`;
    }).join("");
    return `<div class="mv-head">${heads}</div><div class="mv-grid">${cells}</div>`;
  }

  function plannerNavTitle(view, anchor) {
    if (view === "month") return keyToDate(anchor).toLocaleDateString(dateLocale(), { month: "long", year: "numeric" });
    if (view === "week") {
      const a = keyToDate(mondayOf(anchor)), b = keyToDate(SYS.shiftDay(mondayOf(anchor), 6));
      const o = { day: "numeric", month: "short" };
      return a.toLocaleDateString(dateLocale(), o) + " – " + b.toLocaleDateString(dateLocale(), o);
    }
    return plannerDayTitle(anchor);
  }

  // One week of days with a ring on each: how much of that day's list is
  // done, the same dial the habits and the calendar use.
  function renderPlannerDays(state, ui, anchor) {
    const today = SYS.todayKey();
    const monday = mondayOf(anchor);
    const cells = Array.from({ length: 7 }, (_, i) => {
      const key = SYS.shiftDay(monday, i);
      const d = keyToDate(key);
      const todos = SYS.todosOn(state, key);
      const events = SYS.eventsOn ? SYS.eventsOn(state, key).length : 0;
      const pct = todos.length ? Math.round((todos.filter((x) => x.done).length / todos.length) * 100) : 0;
      const label = plannerDayTitle(key);
      return `
        <button class="wk-cell ${key === today ? "today" : ""} ${key === anchor ? "sel" : ""} ${key > today ? "ahead" : ""}"
          data-action="planner-open-day" data-day="${key}" aria-pressed="${key === anchor}" aria-label="${escapeHtml(label)}">
          <span class="wk-day">${escapeHtml(d.toLocaleDateString(dateLocale(), { weekday: "short" }))}</span>
          <span class="wk-num-wrap">${todos.length ? ringSvg(pct, "wk-ring") : ""}<span class="wk-num">${d.getDate()}</span></span>
          <span class="wk-evdot ${events ? "on" : ""}" aria-hidden="true"></span>
        </button>`;
    }).join("");
    return `<div class="week-strip">${cells}</div>`;
  }

  function renderPlannerPage(state, ui) {
    const day = ui.plannerDay || SYS.todayKey();
    const today = SYS.todayKey();
    const view = ui.plannerView || "day";
    const todos = SYS.todosOn(state, day);
    const done = todos.filter((x) => x.done).length;
    const pct = todos.length ? Math.round((done / todos.length) * 100) : 0;
    const tabs = ["day", "week", "month"].map((v) => `
      <button class="chip filter-chip ${view === v ? "active" : ""}" data-action="planner-view" data-view="${v}" aria-pressed="${view === v}">${t({ day: "planner.viewDay", week: "planner.viewWeek", month: "planner.viewMonth" }[v])}</button>`).join("");
    const inToday = view === "day" ? !ui.plannerDay
      : view === "week" ? mondayOf(day) === mondayOf(today)
      : day.slice(0, 7) === today.slice(0, 7);
    const controls = `
        <div class="planner-top">
          <div class="planner-tabs">${tabs}
            <button class="chip filter-chip planner-habits-toggle ${state.settings.plannerShowHabits ? "active" : ""}" data-action="toggle-planner-habits" aria-pressed="${!!state.settings.plannerShowHabits}" title="${t("planner.showHabits")}">${icon("repeat", 12)} ${t("nav.habits")}</button>
          </div>
          <button class="btn btn-outline btn-icon-inline" data-action="event-new">${icon("plus", 14)} ${t("planner.newEvent")}</button>
        </div>
        <div class="week-bar">
          <button class="wk-arrow" data-action="planner-shift-day" data-delta="-1" aria-label="${t("planner.previous")}">${icon("chevronLeft", 15)}</button>
          <div class="wk-title">${escapeHtml(plannerNavTitle(view, day))}</div>
          ${inToday ? "" : `<button class="wk-today" data-action="planner-today">${t("planner.today")}</button>`}
          <button class="wk-arrow" data-action="planner-shift-day" data-delta="1" aria-label="${t("planner.next")}">${icon("chevronRight", 15)}</button>
        </div>
        ${view === "day" ? renderPlannerDays(state, ui, day) : ""}`;
    const header = renderPageHead("planner");
    const fab = `<button class="fab" data-action="event-new" aria-label="${t("planner.newEvent")}" title="${t("planner.newEvent")}">${icon("plus", 20)}</button>`;

    if (view === "week") return `${header}<div class="sys-panel panel-pad">${controls}${renderWeekView(state, ui, day)}</div>${fab}`;
    if (view === "month") return `${header}<div class="sys-panel panel-pad">${controls}${renderMonthView(state, ui, day)}</div>${fab}`;

    // A day already over with work still on it: offer to bring it here rather
    // than leave it stranded where nobody looks again.
    const left = day < today ? todos.filter((x) => !x.done) : [];
    const openTodos = todos.filter((x) => !x.done);
    const doneTodos = todos.filter((x) => x.done);
    const list = todos.length ? `
      <div class="planner-progress-row">
        <span>${t("planner.progress", { done, total: todos.length })}</span>
        <span class="today-count">${pct}%</span>
      </div>
      <div class="today-track"><div class="today-fill" style="width:${pct}%"></div></div>
      <ul class="todo-list">${openTodos.map((x) => renderTodo(ui, x, day < today)).join("")}</ul>
      ${doneTodos.length ? `<div class="planner-done-head">${t("planner.doneHead", { n: doneTodos.length })}</div>
      <ul class="todo-list">${doneTodos.map((x) => renderTodo(ui, x)).join("")}</ul>` : ""}`
      // "Nothing planned" under a day whose schedule is full read as a
      // contradiction; with events, the add field above is enough.
      : SYS.eventsOn(state, day).length ? ""
      : `<div class="empty-hero">
           ${pageIcon("planner")}
           <div class="empty-hero-text">${t("planner.empty")}</div>
           <div class="btn-row" style="justify-content:center;">
             <button class="btn btn-primary btn-icon-inline" data-action="planner-focus-add">${icon("plus", 14)} ${t("planner.add")}</button>
             <button class="btn btn-outline btn-icon-inline" data-action="event-new">${icon("calendar", 14)} ${t("planner.newEvent")}</button>
           </div>
         </div>`;

    return `
      ${header}
      <div class="sys-panel panel-pad">
        ${controls}
        <div class="planner-section">${t("planner.todos")}</div>
        <div class="planner-add">
          <input id="planner-input" class="field-input" data-bind="plannerDraft" maxlength="${SYS.PLANNER_TITLE_MAX}" value="${escapeHtml(ui.plannerDraft || "")}" placeholder="${t("planner.placeholder")}" aria-label="${t("planner.placeholder")}" autocomplete="off" />
          <button class="btn btn-primary btn-icon-inline" data-action="planner-add">${icon("plus", 14)} ${t("planner.add")}</button>
        </div>
        ${left.length ? `<div class="day-banner">${icon("clock", 13)}<span>${t("planner.leftBehind", { n: left.length })}</span>
          <button class="wk-today" data-action="planner-move-today" data-day="${day}">${t("planner.moveAll")}</button></div>` : ""}
        ${list}
      </div>
      <div class="sys-panel panel-pad planner-schedule">
        <div class="planner-section">${t("planner.schedule")}</div>
        ${renderPlannerHabits(state, day)}
        ${renderTimeline(state, day)}
      </div>
      ${fab}`;
  }
  SYS.renderPlannerPage = renderPlannerPage;

  function monthlyLabel(by, start) {
    if (by === "lastDay") return t("event.repeatsMonthlyLast");
    if (by === "weekday") {
      const nth = SYS.monthWeekOf(start);
      return t("event.repeatsMonthlyWeekday", {
        nth: t(nth >= 5 ? "ordinal.last" : ["ordinal.1", "ordinal.2", "ordinal.3", "ordinal.4"][nth - 1]),
        weekday: keyToDate(start).toLocaleDateString(dateLocale(), { weekday: "long" }),
      });
    }
    return t("event.repeatsMonthly", { n: Number(start.slice(8, 10)) });
  }

  // "30 min before", "1 h before", "2 days before"; an all-day event's
  // reminders count back from 09:00 on its day.
  function reminderLabel(offset, allDay) {
    if (offset === 0) return allDay ? t("event.remindAllDay") : t("event.remindAtStart");
    if (offset === 1440) return t("event.remindDay");
    if (offset % 1440 === 0) return t("event.remindDays", { n: offset / 1440 });
    if (offset % 60 === 0) return t("event.remindHours", { n: offset / 60 });
    if (offset > 60) return t("event.remindHoursMinutes", { h: Math.floor(offset / 60), m: offset % 60 });
    return t("event.remindMinutes", { n: offset });
  }

  function repeatSummary(ev) {
    const r = ev.repeat;
    if (r.type === "none") return "";
    let s;
    if (r.type === "daily") s = t("event.repeatsDaily");
    else if (r.type === "weekly") {
      const wd = weekdayLabels();
      s = t("event.repeatsWeekly", { days: [1, 2, 3, 4, 5, 6, 0].filter((i) => r.days.indexOf(i) >= 0).map((i) => wd[i]).join(" · ") });
    } else s = monthlyLabel(r.monthBy, ev.start);
    if (r.until) s += " · " + t("event.repeatUntil", { date: shortDay(r.until) });
    return s;
  }

  // A dragged event that repeats: which days the new time is for.
  function renderEventMove(ui) {
    const m = ui.eventMove;
    if (!m) return "";
    return `
      <div class="modal-backdrop">
        <div class="sys-panel modal-box" data-stop-close="1">
          <div class="modal-title">${t("event.moveTitle")}</div>
          <div class="carry-body">${t("event.moveBody")}</div>
          <div class="ev-view-line">${escapeHtml(fmtClock(m.from) + " – " + fmtClock(m.to))}</div>
          <div class="btn-row ev-view-actions">
            <button class="btn btn-primary" data-action="event-move-apply" data-scope="this">${t("event.scopeThis")}</button>
            <button class="btn btn-outline" data-action="event-move-apply" data-scope="following">${t("event.scopeFollowing")}</button>
            <button class="btn btn-outline" data-action="close-modal">${t("event.cancel")}</button>
          </div>
        </div>
      </div>`;
  }

  // Tapping an event: what it is, and what can be done with it.
  function renderEventView(state, ui) {
    const v = ui.eventView || {};
    const ev = SYS.findEvent(state, v.id);
    const o = ev && SYS.eventOccurrence(state, v.id, v.day);
    if (!o) return "";
    const armed = (scope) => !!ui.armed && ui.armed.kind === "task" && ui.armed.id === ev.id + "|" + scope;
    const delBtn = (scope, key) => `
      <button class="btn btn-outline ${armed(scope) ? "ev-armed" : ""}" data-action="event-delete" data-id="${escapeHtml(ev.id + "|" + scope)}">
        ${icon(armed(scope) ? "check" : "trash", 13)} ${armed(scope) ? t("intel.confirmAgain") : t(key)}
      </button>`;
    const when = keyToDate(o.day).toLocaleDateString(dateLocale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return `
      <div class="modal-backdrop">
        <div class="sys-panel modal-box" data-stop-close="1">
          <div class="modal-title">${t("event.details")}</div>
          <div class="ev-view-title">${escapeHtml(o.title)}</div>
          ${o.span ? `
          <div class="ev-view-line">${escapeHtml(o.allDay ? longDay(o.day) : longDay(o.day) + " · " + fmtClock(o.from))}</div>
          <div class="ev-view-line">→ ${escapeHtml(o.allDay ? longDay(o.endDay) : longDay(o.endDay) + " · " + fmtClock(o.to))}</div>
          ${o.allDay ? `<div class="ev-view-line">${t("planner.allDay")}</div>` : ""}` : `
          <div class="ev-view-line">${escapeHtml(when)}</div>
          <div class="ev-view-line">${o.allDay ? t("planner.allDay") : escapeHtml(fmtClock(o.from) + " – " + fmtClock(o.to))}</div>`}
          ${o.recurring ? `<div class="ev-view-line ev-view-repeat">${icon("repeat", 12)} ${escapeHtml(repeatSummary(ev))}</div>` : ""}
          ${ev.reminders.length ? `<div class="ev-view-line">${icon("bell", 12)} ${escapeHtml(ev.reminders.map((r) => reminderLabel(r, ev.allDay)).join(" · "))}</div>` : ""}
          <div class="btn-row ev-view-actions">
            <button class="btn btn-primary" data-action="event-edit">${icon("pencil", 13)} ${t("event.edit")}</button>
            ${o.recurring ? delBtn("this", "event.deleteThis") + delBtn("following", "event.deleteFollowing") : delBtn("all", "event.delete")}
            <button class="btn btn-outline" data-action="close-modal">${t("event.close")}</button>
          </div>
        </div>
      </div>`;
  }

  const REMINDER_PRESETS = [0, 10, 30, 60, 1440];
  function renderEventReminders(f, ui) {
    const chosen = SYS.cleanEventReminders(f.reminders);
    const full = chosen.length >= SYS.EVENT_REMINDER_MAX;
    // Every choice keeps its place and is switched on or off where it stands;
    // a custom time sits after the presets, and is switched off the same way.
    const shown = REMINDER_PRESETS.concat(chosen.filter((r) => REMINDER_PRESETS.indexOf(r) < 0));
    const pushOff = chosen.length && (!ui.cloudUser || ui.pushState !== "enabled");
    return `
          <div class="ev-block">
            <div class="field-label">${t("event.reminders")}</div>
            <div class="remind-list">
              ${shown.map((r) => {
                const on = chosen.indexOf(r) >= 0;
                return `<button type="button" class="remind-add ev-remind ${on ? "on" : ""}" data-action="event-reminder-toggle" data-offset="${r}" aria-pressed="${on}" ${!on && full ? "disabled" : ""}>${on ? icon("bell", 12) : `<span class="remind-plus" aria-hidden="true">+</span>`}<span>${escapeHtml(reminderLabel(r, f.allDay))}</span></button>`;
              }).join("")}
              ${full || f.customOpen ? "" : `<button type="button" class="remind-add" data-action="event-reminder-custom"><span class="remind-plus" aria-hidden="true">+</span><span>${t("event.remindCustom")}</span></button>`}
            </div>
            ${f.customOpen && !full ? `
            <div class="ev-form-row ev-custom-remind">
              <input class="field-input" type="number" min="1" inputmode="numeric" data-bind="eventForm.customN" value="${escapeHtml(f.customN || "")}" aria-label="${t("event.remindCustom")}" />
              <select class="field-select" data-bind="eventForm.customUnit" aria-label="${t("event.remindCustom")}">
                <option value="min" ${f.customUnit === "min" ? "selected" : ""}>${t("event.unitMinutes")}</option>
                <option value="hour" ${f.customUnit === "hour" ? "selected" : ""}>${t("event.unitHours")}</option>
                <option value="day" ${f.customUnit === "day" ? "selected" : ""}>${t("event.unitDays")}</option>
              </select>
              <button type="button" class="btn btn-outline" data-action="event-reminder-custom-add">${t("planner.add")}</button>
              <button type="button" class="icon-mini" data-action="event-reminder-custom-cancel" aria-label="${t("event.cancel")}" title="${t("event.cancel")}">${icon("x", 14)}</button>
            </div>
            ${f.customError ? `<div class="form-hint" style="color:var(--rust-text);">${t(f.customError === "far" ? "event.remindTooFar" : "event.remindNeedsNumber")}</div>` : ""}` : ""}
            ${pushOff ? `<div class="form-hint" style="color:var(--gold-text);line-height:1.5;">${t("event.remindPushOff")}</div>` : ""}
          </div>`;
  }

  function renderEventForm(state, ui) {
    const f = ui.eventForm;
    if (!f) return "";
    const wd = weekdayLabels();
    const editingSeries = f.mode === "edit" && f.recurring;
    // Changing one day of a series cannot change how the series repeats.
    const repeatLocked = editingSeries && f.scope === "this";
    const errKey = { title: "event.needsTitle", time: "event.badTime", date: "event.badDate", end: "event.badEnd", span: "event.badSpan" }[f.error];
    return `
      <div class="modal-backdrop">
        <div class="sys-panel modal-box" data-stop-close="1">
          <div class="modal-title">${f.mode === "edit" ? t("event.editTitle") : t("planner.newEvent")}</div>
          <input id="event-title" class="field-input" data-bind="eventForm.title" maxlength="${SYS.PLANNER_TITLE_MAX}" value="${escapeHtml(f.title)}" placeholder="${t("event.titlePlaceholder")}" aria-label="${t("event.titlePlaceholder")}" autocomplete="off" />
          <div class="ev-form-row">
            <button type="button" class="chip filter-chip ev-allday ${f.allDay ? "active" : ""}" data-action="event-allday" aria-pressed="${f.allDay}">${t("planner.allDay")}</button>
          </div>
          <div class="ev-block">
            <label class="field-label" for="event-date">${t("event.from")}</label>
            <div class="ev-when">
              <input id="event-date" class="field-input" type="date" data-bind="eventForm.date" value="${escapeHtml(f.date)}" />
              ${f.allDay ? "" : `<button type="button" class="field-input ev-time" data-action="event-pick-time" data-which="from" aria-label="${t("event.from")} ${escapeHtml(fmtClock(f.from))}">${icon("clock", 14)}<span>${escapeHtml(fmtClock(f.from))}</span></button>`}
            </div>
          </div>
          <div class="ev-block">
            <label class="field-label" for="event-end-date">${t("event.to")}</label>
            <div class="ev-when">
              <input id="event-end-date" class="field-input" type="date" data-bind="eventForm.endDate" value="${escapeHtml(f.endDate || f.date)}" min="${escapeHtml(f.date)}" />
              ${f.allDay ? "" : `<button type="button" class="field-input ev-time" data-action="event-pick-time" data-which="to" aria-label="${t("event.to")} ${escapeHtml(fmtClock(f.to))}">${icon("clock", 14)}<span>${escapeHtml(fmtClock(f.to))}</span></button>`}
            </div>
          </div>
          ${repeatLocked ? "" : `
          <div class="ev-field ev-block">
            <label class="field-label" for="event-repeat">${t("event.repeat")}</label>
            <select id="event-repeat" class="field-select" data-action="set-event-repeat">
              ${["none", "daily", "weekly", "monthly"].map((r) => `<option value="${r}" ${f.repeatType === r ? "selected" : ""}>${t({ none: "repeat.none", daily: "repeat.daily", weekly: "repeat.weekly", monthly: "repeat.monthly" }[r])}</option>`).join("")}
            </select>
          </div>
          ${f.repeatType === "monthly" && /^\d{4}-\d{2}-\d{2}$/.test(f.date) ? `
          <div class="ev-block">
            <select class="field-select" data-action="set-event-monthby" aria-label="${t("event.repeat")}">
              ${["date", "weekday", "lastDay"].map((by) => `<option value="${by}" ${(f.monthBy || "date") === by ? "selected" : ""}>${escapeHtml(monthlyLabel(by, f.date))}</option>`).join("")}
            </select>
          </div>` : ""}
          ${f.repeatType === "weekly" ? `<div class="sched-days">${[1, 2, 3, 4, 5, 6, 0].map((i) => `
            <button type="button" class="sched-day ${f.days.indexOf(i) >= 0 ? "on" : ""}" data-action="event-repeat-day" data-wd="${i}" aria-pressed="${f.days.indexOf(i) >= 0}">${escapeHtml(wd[i])}</button>`).join("")}</div>` : ""}
          ${f.repeatType !== "none" ? `
          <div class="ev-form-row">
            <button type="button" class="chip filter-chip ${f.untilOn ? "active" : ""}" data-action="event-until" aria-pressed="${!!f.untilOn}">${t("event.endsOn")}</button>
            ${f.untilOn ? `<div class="ev-field"><input class="field-input" type="date" data-bind="eventForm.until" value="${escapeHtml(f.until || "")}" aria-label="${t("event.endsOn")}" /></div>` : `<span class="form-hint" style="margin:0;">${t("event.endsNever")}</span>`}
          </div>` : ""}`}
          ${repeatLocked ? "" : renderEventReminders(f, ui)}
          ${editingSeries ? `
          <div class="ev-block">
            <div class="field-label">${t("event.applyTo")}</div>
            <div class="planner-tabs">
              <button type="button" class="chip filter-chip ${f.scope === "this" ? "active" : ""}" data-action="event-scope" data-scope="this" aria-pressed="${f.scope === "this"}">${t("event.scopeThis")}</button>
              <button type="button" class="chip filter-chip ${f.scope === "following" ? "active" : ""}" data-action="event-scope" data-scope="following" aria-pressed="${f.scope === "following"}">${t("event.scopeFollowing")}</button>
            </div>
          </div>` : ""}
          ${errKey ? `<div class="toast-error" style="margin-top:12px;">${t(errKey)}</div>` : ""}
          <div class="btn-row" style="margin-top:16px;">
            <button class="btn btn-primary" data-action="event-save">${t("event.save")}</button>
            <button class="btn btn-outline" data-action="close-modal">${t("event.cancel")}</button>
          </div>
        </div>
      </div>`;
  }

  // Unfinished items from days that are over. Everything starts ticked,
  // because moving them is the common answer; unticking is the choice.
  function renderCarryModal(state, ui) {
    const pending = SYS.pendingCarry(state);
    if (!pending.length) return "";
    const sel = ui.carrySel || new Set();
    const count = pending.filter((x) => sel.has(x.id)).length;
    const rows = pending.map((x) => {
      const on = sel.has(x.id);
      return `
        <li>
          <button class="carry-row" role="checkbox" aria-checked="${on ? "true" : "false"}" data-action="carry-toggle" data-id="${escapeHtml(x.id)}">
            <span class="todo-check" aria-hidden="true">${on ? icon("check", 13) : ""}</span>
            <span class="carry-title">${escapeHtml(x.title)}</span>
            <span class="carry-day">${escapeHtml(shortDay(x.day))}</span>
          </button>
        </li>`;
    }).join("");
    const allOn = count === pending.length;
    return `
      <div class="modal-backdrop">
        <div class="sys-panel modal-box" data-stop-close="1">
          <div class="modal-title">${t("planner.carryTitle")}</div>
          <div class="carry-body">${t("planner.carryBody", { n: pending.length })}</div>
          <button class="link-btn" data-action="carry-all">${allOn ? t("planner.selectNone") : t("planner.selectAll")}</button>
          <ul class="carry-list">${rows}</ul>
          <div class="btn-row" style="margin-top:14px;flex-wrap:wrap;">
            <button class="btn btn-primary" data-action="carry-move" ${count ? "" : "disabled"}>${t("planner.carryMove", { n: count })}</button>
            <button class="btn btn-outline" data-action="carry-leave">${t("planner.carryLeave")}</button>
          </div>
        </div>
      </div>`;
  }

  Object.assign(U, { keyToDate, plannerDayTitle, longDay, shortDay, renderTodo, TL_HOUR, fmtClock, fmtHour, mondayOf, plannerHabits, renderPlannerHabits, renderTimeline, renderWeekView, renderMonthView, plannerNavTitle, renderPlannerDays, renderPlannerPage, monthlyLabel, reminderLabel, repeatSummary, renderEventMove, renderEventView, REMINDER_PRESETS, renderEventReminders, renderEventForm, renderCarryModal });
})(window.SYS = window.SYS || {});

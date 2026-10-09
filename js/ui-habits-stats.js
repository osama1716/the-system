// UI: the habits page and the stats page.
// One of the files ui.js was split into; the names they share travel through SYS._ui.
(function (SYS) {
  "use strict";
  const U = SYS._ui || (SYS._ui = {});
  const { dateLocale, escapeHtml, helpMark, icon, pageIcon, progressText, renderAppealSection, renderPageHead, renderTaskForm, t } = U;

  // ---------- Habits page (recurring tasks only) ----------
  // Mon-Sun for whichever week the arrows have landed on. Driven by real
  // data: every logged repeat
  // already carries the day it happened, so this needed no change to how
  // habits are tracked — the information was there and simply unshown.
  // Which day the habits page is showing, and which day the log sheet writes
  // to. Null means today in both cases, so the page follows the clock over
  // midnight instead of freezing on whichever day the app was opened.
  function shownDay(ui) { return (ui && ui.habitDay) || SYS.todayKey(); }
  function sheetDay(ui) { return (ui && ui.amountDay) || SYS.todayKey(); }
  SYS.shownDay = shownDay;
  SYS.sheetDay = sheetDay;

  // A day in words, for the places that have to name one. Only used when the
  // day is not today: today needs no label.
  function dayLabel(key) {
    const [y, m, d] = String(key).split("-").map(Number);
    if (!y || !m || !d) return String(key);
    return new Date(y, m - 1, d).toLocaleDateString(dateLocale(), { weekday: "long", day: "numeric", month: "long" });
  }
  SYS.dayLabel = dayLabel;

  // How far forward the strip will go. Looking ahead is for seeing what is
  // scheduled, not for planning a year out, and an arrow into empty weeks
  // forever is a control that does nothing.
  const MAX_WEEKS_AHEAD = 8;
  // Shared with the action that moves the window, so the greyed-out arrow
  // and the refused move are the same number rather than two that agree
  // until one of them is edited.
  SYS.MAX_WEEKS_AHEAD = MAX_WEEKS_AHEAD;

  // Each cell is a button. Picking a day re-renders the page for that day —
  // the cards, their numbers, their dots and the + all move with it — which
  // is why the chosen day is marked as plainly as today is.
  function renderWeekStrip(state, ui) {
    const today = SYS.todayKey();
    const shown = shownDay(ui);
    const offset = Number(ui && ui.weekOffset) || 0;
    // The week comes from the offset rather than from the chosen day, so an
    // arrow always moves exactly one week and never half of one.
    const base = new Date();
    base.setDate(base.getDate() + offset * 7);
    const monday = new Date(base);
    monday.setDate(base.getDate() - ((base.getDay() + 6) % 7));
    // Which days any habit was ticked on, and how much of each day was kept:
    // "something happened" and "the day was finished" are different facts and
    // the strip used to show only the first.
    const active = new Set();
    const live = state.tasks.filter((x) => x.recurring && !SYS.isArchived(x));
    live.forEach((x) => {
      Object.keys(SYS.habitDays(x)).forEach((k) => { if (SYS.habitDoneOn(x, k)) active.add(k); });
    });
    const shareOn = (key) => (SYS.dayRing(state, key) || { pct: 0 }).pct;
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
    const cells = days.map((d) => {
      const key = SYS.dateKey(d);
      const label = d.toLocaleDateString(dateLocale(), { weekday: "short" });
      return `<button class="wk-cell ${key === today ? "today" : ""} ${key === shown ? "sel" : ""} ${active.has(key) ? "active" : ""} ${key > today ? "ahead" : ""}"
        data-action="pick-day" data-day="${key}" aria-pressed="${key === shown}" aria-label="${escapeHtml(dayLabel(key))}">
        <span class="wk-day">${escapeHtml(label)}</span>
        <span class="wk-num-wrap">${key > today ? "" : ringSvg(shareOn(key), "wk-ring")}<span class="wk-num">${d.getDate()}</span></span>
      </button>`;
    }).join("");

    // The month, because "7 to 13" six weeks back names no week at all. Both
    // months when the week straddles two, and the year once it is not this
    // one: a date that could be last year and does not say so is worse than
    // a longer label.
    const opts = { month: "long" };
    if (days[0].getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
    const first = days[0].toLocaleDateString(dateLocale(), opts);
    const last = days[6].toLocaleDateString(dateLocale(), opts);
    const title = first === last ? first : first + " - " + last;

    return `
      <div class="week-bar">
        <button class="wk-arrow" data-action="shift-week" data-delta="-1" aria-label="${SYS.t("habits.prevWeek")}">${icon("chevronLeft", 15)}</button>
        <div class="wk-title">${escapeHtml(title)}</div>
        ${offset === 0 ? "" : `<button class="wk-today" data-action="jump-today">${SYS.t("habits.jumpToday")}</button>`}
        <button class="wk-arrow" data-action="shift-week" data-delta="1" aria-label="${SYS.t("habits.nextWeek")}" ${offset >= MAX_WEEKS_AHEAD ? "disabled" : ""}>${icon("chevronRight", 15)}</button>
      </div>
      <div class="week-strip">${cells}</div>`;
  }

  // Says out loud which day is on screen whenever it is not today. Without
  // it, the only thing separating "correcting Thursday" from "logging now"
  // is a ring around a number in the strip, and that is not enough to bet a
  // ledger on.
  function renderDayBanner(ui) {
    const today = SYS.todayKey();
    const day = shownDay(ui);
    if (day === today) return "";
    const ahead = day > today;
    return `<div class="day-banner ${ahead ? "ahead" : ""}">
      ${icon("clock", 13)}
      <span>${SYS.t(ahead ? "habits.viewingFuture" : "habits.viewingPast", { day: dayLabel(day) })}</span>
      <button class="wk-today" data-action="jump-today">${SYS.t("habits.jumpToday")}</button>
    </div>`;
  }

  // The habit card: icon, name, progress, and one big target to hit.
  // Colour comes from the task's hue rendered through the current theme, so
  // the same card is legible on all seven palettes.
  function renderHabitCard(state, ui, t) {
    const today = SYS.todayKey();
    // Every number on this card belongs to the day the page is showing, not
    // to today. Picking Thursday and still reading today's progress would be
    // the worst of both: it looks like history and behaves like now.
    const day = shownDay(ui);
    const ahead = day > today;
    const wk = SYS.weekDays(t, day);
    const period = SYS.periodProgress(t, day);
    const done = period.target > 0 && period.done >= period.target;
    const streak = SYS.habitStreak(t, day);
    const armed = ui.armed && ui.armed.kind === "task" && ui.armed.id === t.id;
    const exp = SYS.ptToExp(t.pt).toFixed(0);
    const loggedToday = SYS.habitDoneOn(t, day);
    // One dot per day of this week, so the card carries its own history
    // rather than only a running count. Each is a button: a day missed
    // yesterday can be filled in without hunting for it.
    const quitting = SYS.isQuitHabit(t);
    // Only a habit measured in time has anywhere to put what a clock reads.
    const timeBased = SYS.isTimeUnit(t.unit);
    const slippedToday = SYS.habitSlipOn(t, day);
    const quota = SYS.isQuotaSchedule(t);
    // Today's repeat may not have room left in the day — the server decides
    // and sends the moment (unlockTimes). Only today is held: an older day is
    // judged on its own capacity, and the app has no figure for it.
    const habitUnlock = (t.priceId && ui.unlocks && ui.unlocks[t.priceId]) || null;
    const habitLocked = day === today && !loggedToday && !!(habitUnlock && habitUnlock.locked);
    const habitOpensWhen = habitLocked && SYS.unlockText ? SYS.unlockText(habitUnlock) : "";
    // How much of this habit's own goal the shown day holds, for the ring
    // around its icon. Taken from the amount rather than from the day's mark:
    // the mark asks "did this day want it", and a quota habit wants nothing of
    // any particular day — but half an hour towards it is still half an hour,
    // and the icon is the one place that should say so.
    const goalBase = SYS.habitGoalBase(t);
    const dayPct = goalBase > 0 ? Math.min(100, Math.round((SYS.habitAmountOn(t, day) / goalBase) * 100)) : 0;
    const dots = wk.keys.map((k) => {
      const on = SYS.habitDoneOn(t, k);
      const future = k > today;
      // For a quota every day is equally available, so none of them is
      // faint; for named days the ones that were never asked for are.
      const off = !quota && !SYS.isDueOn(t, k) && !on;
      // A note is marked on its day, and reachable in the day's own tooltip.
      // Without the mark there is nothing to say the writing exists.
      const dayNote = SYS.habitNoteOn(t, k);
      const slip = SYS.habitSlipOn(t, k);
      const label = dayNote ? k + " — " + dayNote : k;
      return `<button class="hday ${on ? "on" : ""} ${k === today ? "now" : ""} ${k === day ? "sel" : ""} ${off ? "idle" : ""} ${dayNote ? "noted" : ""} ${slip ? "slipped" : ""}" ${future || (!on && !SYS.canLogHabitDay(k)) ? "disabled" : ""}
        data-action="toggle-habit-day" data-id="${t.id}" data-day="${k}"
        aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"></button>`;
    }).join("");
    return `
      <div class="habit-card ${done ? "done" : ""} ${quitting ? "quit" : ""} ${(SYS.isQuotaSchedule(t) || SYS.isDueOn(t, day)) ? "" : "off-day"}">
        <div class="habit-icon ${dayPct >= 100 ? "full" : ""}" title="${escapeHtml(progressText(t, day))}">
          ${ringSvg(dayPct, "habit-ring")}
          <span class="habit-emoji">${U.taskIconHtml(t)}</span>
        </div>
        <div class="habit-main">
          <div class="habit-title">${escapeHtml(t.title)}</div>
          <div class="habit-sub">
            ${quitting ? `<span class="habit-tag quit">${icon("shield", 10)} ${SYS.t("quit.tag")}</span>` : ""}
            ${(SYS.isQuotaSchedule(t) || SYS.isDueOn(t, day)) ? "" : `<span class="habit-tag off">${SYS.t("habits.notToday")}</span>`}
            <span class="habit-sched">${escapeHtml(SYS.scheduleLabel(t))}</span>
            ${(() => {
              const times = SYS.reminderTimes(t);
              if (!times.length) return "";
              const shown = times.slice(0, 2).join(" · ") + (times.length > 2 ? " +" + (times.length - 2) : "");
              return `<span class="habit-remind">${icon("bell", 10)} ${escapeHtml(shown)}</span>`;
            })()}
            <span class="habit-sub-break" aria-hidden="true"></span>
            ${quitting
              ? `<span class="habit-amt">${day === today
                  ? (slippedToday ? SYS.t("quit.slippedToday") : SYS.t("quit.clean"))
                  : (slippedToday ? SYS.t("quit.slippedOn", { day: dayLabel(day) }) : SYS.t("quit.cleanDay", { day: dayLabel(day) }))}</span>`
              : `<span class="habit-amt">${escapeHtml(progressText(t, day))}</span>`}
            <span class="habit-xp">+${exp} xp</span>
            ${streak.n >= 2 ? `<span class="habit-streak ${streak.n >= 7 ? "hot" : ""}">${icon("zap", 10)} ${SYS.t("task.streak." + streak.scope, { n: streak.n })}</span>` : ""}
          </div>
        </div>
        <!-- A sibling of the text rather than inside it, so the card's grid can
             give the week its own row: under the text on a wide screen, and
             across the card beside the tools on a phone, where the text column
             is too narrow to hold seven dots. -->
        <div class="hdays">${dots}</div>
        <div class="habit-side">
          ${quitting
            ? `<button class="habit-check ${loggedToday ? "hit" : ""} ${slippedToday ? "slip" : ""}" data-action="open-amount" data-id="${t.id}"
                aria-haspopup="dialog" ${ahead || habitLocked ? "disabled" : ""}
                aria-label="${ahead ? SYS.t("habits.futureLocked") : habitLocked ? escapeHtml(habitOpensWhen) : SYS.t("quit.decide")}" title="${ahead ? SYS.t("habits.futureLocked") : habitLocked ? escapeHtml(habitOpensWhen) : SYS.t("quit.decide")}">${icon(slippedToday ? "x" : loggedToday ? "check" : habitLocked ? "clock" : "shield", 18)}</button>`
            : `<button class="habit-check ${loggedToday ? "hit" : ""}" data-action="open-amount" data-id="${t.id}"
                aria-haspopup="dialog" ${ahead || habitLocked ? "disabled" : ""}
                aria-label="${ahead ? SYS.t("habits.futureLocked") : habitLocked ? escapeHtml(habitOpensWhen) : SYS.t("task.addAmount")}" title="${ahead ? SYS.t("habits.futureLocked") : habitLocked ? escapeHtml(habitOpensWhen) : SYS.t("task.addAmount")}">${icon(loggedToday ? "check" : habitLocked ? "clock" : "plus", 18)}</button>`}
          <div class="habit-tools">
            ${timeBased && day === today ? `<button class="icon-mini ${ui.timer && ui.timer.taskId === t.id ? "timing" : ""}" data-action="open-timer" data-id="${t.id}"
              aria-label="${SYS.t("task.startTimer")}" title="${ui.timer && ui.timer.taskId === t.id ? SYS.t("timer.waiting") : SYS.t("task.startTimer")}">${icon("timer", 12)}</button>` : ""}
            ${ui.cloudUser ? `<button class="icon-mini" data-action="open-appeal-form" data-id="${t.id}" aria-label="${SYS.t("task.appeal")}" title="${SYS.t("task.appeal")}">${icon("flag", 12)}</button>` : ""}
            <button class="icon-mini" data-action="edit-task" data-id="${t.id}" aria-label="${SYS.t("task.edit")}">${icon("pencil", 12)}</button>
            <button class="icon-mini ${armed ? "danger-arm" : ""}" data-action="delete-task" data-id="${t.id}" aria-label="${SYS.t("task.delete")}" title="${armed ? SYS.t("intel.confirmAgain") : SYS.t("task.delete")}">${icon(armed ? "check" : "trash", 12)}</button>
          </div>
        </div>
      </div>`;
  }

  // Due and not yet kept first, then what is already kept, then the habits
  // this day never asked for — the list is what is left to do today.
  function habitOrder(state, ui, x) {
    const day = shownDay(ui);
    const quota = SYS.isQuotaSchedule(x);
    const due = quota || SYS.isDueOn(x, day);
    if (!due) return 2;
    return SYS.habitDoneOn(x, day) ? 1 : 0;
  }

  function renderHabitsPage(state, ui) {
    const showingForm = !!ui.taskForm && ui.taskForm.recurring;
    // Archived habits are gone from here, which is the whole point of
    // archiving. They are still reachable — and un-archivable — from the
    // faint chips at the end of the Stats page's scope row.
    const habits = state.tasks.filter((x) => x.recurring && !SYS.isArchived(x));
    const day = shownDay(ui);
    const ordered = habits.slice().sort((a, b) => habitOrder(state, ui, a) - habitOrder(state, ui, b));
    const rows = ordered.map((x) => renderHabitCard(state, ui, x)).join("");
    const due = habits.filter((x) => SYS.isAskedOn(x, day));
    const kept = due.filter((x) => SYS.habitDoneOn(x, day)).length;
    // Part of an amount counts, as it does in the day's ring.
    const share = due.reduce((sum, x) => sum + (SYS.habitDoneOn(x, day) ? 1 : (SYS.exactFraction(x, day) || 0)), 0);
    const pct = due.length ? Math.round((share / due.length) * 100) : 0;

    const empty = `
      <div class="empty-hero">
        ${pageIcon("habits")}
        <div class="empty-hero-text">${t("habits.empty")}</div>
        ${ui.cloudUser
          ? `<div class="btn-row" style="justify-content:center;">
          <button class="btn btn-primary btn-icon-inline" data-action="open-library">${icon("grid", 14)} ${t("habits.fromLibrary")}</button>
          <button class="btn btn-outline btn-icon-inline" data-action="open-habit-form">${icon("plus", 14)} ${t("habits.new")}</button>
        </div>`
          : `<button class="btn btn-primary" data-action="open-settings">${t("account.signIn")}</button>`}
      </div>`;

    return `
      ${renderPageHead("habits")}
      <div class="sys-panel panel-pad">
        <div class="panel-head">
          <span></span>
          ${!showingForm ? `<div class="btn-row">
            <button class="btn btn-outline btn-icon-inline" data-action="open-library">${icon("grid", 14)} ${t("library.button")}</button>
            <button class="btn btn-outline btn-icon-inline" data-action="open-habit-form">${icon("plus", 14)} ${t("habits.new")}</button>
          </div>` : ""}
        </div>
        ${showingForm ? renderTaskForm(state, ui) : ""}
        ${habits.length === 0 ? empty : renderWeekStrip(state, ui) + renderDayBanner(ui) + `
          ${due.length ? `
            <div class="habits-progress">
              <div class="habits-progress-head">
                <span>${t("habits.keptOf", { done: kept, total: due.length })}</span>
                <span class="today-count">${pct}%</span>
              </div>
              <div class="today-track"><div class="today-fill" style="width:${pct}%"></div></div>
            </div>` : ""}
          <div class="habit-list">${rows}</div>`}
      </div>
      ${renderAppealSection(ui)}
      ${showingForm || habits.length === 0 ? "" : `<button class="fab" data-action="open-habit-form" aria-label="${t("habits.new")}" title="${t("habits.new")}">${icon("plus", 20)}</button>`}`;
  }
  SYS.renderHabitsPage = renderHabitsPage;

  // The long view, drawn from the journal rather than from local state.
  //
  // It exists because the app forgets on purpose: 80 log entries, 120 days of
  // daily stats, one week of habit repeats. That is the right trade for
  // something kept in a browser, but it means a tracker meant to be used for
  // years could never show a year. The journal keeps monthly totals server-
  // side, so the long run survives the pruning.
  //
  // It starts when the journal did, and says so — presenting it as a complete
  // history would be a lie about months nothing was recorded for.
  function renderLifetimeStats(ui) {
    const months = ui.expMonths;
    if (!ui.cloudUser) return `<div class="empty-note">${t("stats.lifetimeSignedOut")}</div>`;
    if (!months) return `<div class="empty-note">${t("common.loading")}</div>`;
    const keys = Object.keys(months).filter((k) => /^\d{4}-\d{2}$/.test(k)).sort();
    if (!keys.length) return `<div class="empty-note">${t("stats.lifetimeEmpty")}</div>`;

    const values = keys.map((k) => Number(months[k]) || 0);
    const peak = Math.max(1, ...values.map(Math.abs));
    const total = values.reduce((s, v) => s + v, 0);
    const best = keys[values.indexOf(Math.max(...values))];

    const rows = keys.map((k, i) => {
      const v = values[i];
      const pct = Math.round((Math.abs(v) / peak) * 100);
      return `
        <div class="month-day-row">
          <span class="month-day-label">${escapeHtml(k)}</span>
          <div class="month-day-bar-track"><div class="month-day-bar-fill" style="width:${pct}%;${v < 0 ? "background:var(--rust);" : ""}"></div></div>
          <span class="month-day-pct">${v > 0 ? "+" : ""}${escapeHtml(v)}</span>
        </div>`;
    }).join("");

    return `
      <div class="month-list lifetime-list">${rows}</div>
      <div style="margin-top:14px;padding-top:13px;border-top:1px solid var(--border);display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;">
        <span style="font-size:12px;color:var(--dim);">${t("stats.sinceRecordBegan", { month: keys[0] })}</span>
        <span style="font-size:12px;font-weight:500;color:var(--gold-text);">${t("stats.totalXp", { n: total })}</span>
      </div>
      <div class="form-hint" style="margin-top:8px;">${t("stats.bestMonth", { month: best })}</div>`;
  }

  // ---------- Stats page --------------------------------------------------
  //
  // One page in two shapes, chosen by the row of habit chips at the top.
  // "All" answers how the whole week is going; a single habit answers how
  // that one is going. The calendar sits at the top of both, because the
  // shape of the month is the one thing that should never move under you.
  //
  // The old week/month/lifetime tabs are gone. The EXP-by-month list they
  // held is kept at the foot of the All view — it reads the server's journal
  // rather than the habit history, so nothing here replaces it.

  // An amount in words rather than in base units: "3h 1m", "2m 53s", "12 L".
  // Time gets hours and minutes instead of a clock, because a total is read
  // as a quantity and 03:01:00 is read as a time of day.
  function fmtVolume(task, base) {
    if (!SYS.isTimeUnit(task.unit)) {
      const n = SYS.fromBase(base, task.unit);
      const shown = Math.abs(n - Math.round(n)) < 0.005 ? Math.round(n) : Math.round(n * 10) / 10;
      return shown + " " + SYS.tUnit(task.unit, shown);
    }
    // Nothing measured reads as nothing in the habit's own unit — "0 min" —
    // rather than "0s", which names a unit the habit was never measured in.
    if (!(base > 0)) return "0 " + SYS.tUnit(task.unit);
    const sec = Math.round(base);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    // Short units from the language rather than from English, so a readout
    // never says "47m" beside "0 دقيقة".
    const H = (n) => SYS.t("vol.h", { n }), M = (n) => SYS.t("vol.m", { n }), S = (n) => SYS.t("vol.s", { n });
    if (h > 0) return m > 0 ? H(h) + " " + M(m) : H(h);
    if (m > 0) return s > 0 ? M(m) + " " + S(s) : M(m);
    return S(s);
  }
  SYS.fmtVolume = fmtVolume;

  // The scope row. Archived habits sit at the end, faint: they are out of the
  // way without being out of reach, which is the only place to un-archive one
  // from without inventing a screen for it.
  function renderScopeChips(state, ui) {
    const habits = state.tasks.filter((x) => x.recurring);
    const live = habits.filter((x) => !SYS.isArchived(x));
    const filed = habits.filter((x) => SYS.isArchived(x));
    const scope = ui.statsScope || null;
    const chip = (id, label, title, extra) => `
      <button class="scope-chip ${scope === id ? "on" : ""} ${extra || ""}" data-action="set-stats-scope" data-id="${id ? escapeHtml(id) : ""}"
        aria-pressed="${scope === id}" title="${escapeHtml(title)}">${label}</button>`;
    return `<div class="scope-row">
      ${chip(null, `<span class="scope-all">${t("stats.scopeAll")}</span>`, t("stats.scopeAll"))}
      ${live.map((x) => chip(x.id, U.taskIconHtml(x), x.title)).join("")}
      ${filed.map((x) => chip(x.id, U.taskIconHtml(x), x.title + " — " + t("stats.archived"), "filed")).join("")}
    </div>`;
  }

  // A ring drawn as a fraction of a circle. pathLength lets the dash array be
  // read as a percentage, so nothing here has to know the radius.
  function ringSvg(pct, cls) {
    return `<svg class="${cls}" viewBox="0 0 36 36" aria-hidden="true">
      <circle class="rt" cx="18" cy="18" r="16" pathLength="100" />
      ${pct > 0 ? `<circle class="rf" cx="18" cy="18" r="16" pathLength="100" stroke-dasharray="${Math.max(2, pct)} 100" />` : ""}
    </svg>`;
  }

  function parseDayKey(key) {
    const [y, m, d] = String(key).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  function monthTitle(year, month) {
    return new Date(year, month, 1).toLocaleDateString(dateLocale(), { month: "long", year: "numeric" });
  }

  // The calendar. Each day carries a ring for how much of what that day asked
  // for was done — a full ring is a day you finished, and a day that asked
  // for nothing carries no ring at all rather than an empty one.
  function renderMonthCard(state, ui) {
    const offset = Number(ui.statsMonthOffset) || 0;
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const year = base.getFullYear(), month = base.getMonth();
    const grid = SYS.monthGrid(state, ui.statsScope || null, year, month);
    // Column headings taken from the grid's own first week, not from
    // weekdayLabels() — that list starts on Sunday because the weekday picker
    // is keyed by JavaScript's day numbers, and this calendar starts on
    // Monday. Reading them off the real dates is the only way the headings
    // cannot drift a day out from the cells underneath them.
    const wd = grid.cells.slice(0, 7).map((c) => {
      const label = parseDayKey(c.key).toLocaleDateString(dateLocale(), { weekday: "short" });
      return `<span class="cal-wd">${escapeHtml(label)}</span>`;
    }).join("");
    const cells = grid.cells.map((c) => `
      <button class="cal-cell ${c.inMonth ? "" : "out"} ${c.isToday ? "now" : ""} ${c.perfect ? "perfect" : ""} ${c.ahead ? "ahead" : ""}"
        data-action="open-day" data-day="${c.key}" ${c.ahead ? "disabled" : ""}
        title="${escapeHtml(SYS.dayLabel(c.key) + (c.required ? " — " + c.pct + "%" : ""))}">
        ${c.required > 0 ? ringSvg(c.pct, "cal-ring") : ""}
        <span class="cal-num">${c.day}</span>
      </button>`).join("");
    return `
      <div class="sys-panel panel-pad cal-card">
        <div class="cal-head">
          <button class="wk-arrow" data-action="set-stats-month-offset" data-delta="-1" aria-label="${t("stats.previous")}">${icon("chevronLeft", 15)}</button>
          <div class="cal-title">${escapeHtml(monthTitle(year, month))}</div>
          ${offset !== 0 ? `<button class="wk-today" data-action="set-stats-month-offset" data-delta="reset">${t("stats.todayBtn")}</button>` : ""}
          <button class="wk-arrow" data-action="set-stats-month-offset" data-delta="1" aria-label="${t("stats.next")}" ${offset >= 0 ? "disabled" : ""}>${icon("chevronRight", 15)}</button>
        </div>
        <div class="cal-wds">${wd}</div>
        <div class="cal-grid">${cells}</div>
      </div>`;
  }

  function tile(value, label, unit) {
    return `<div class="stat-tile">
      <div class="stat-num">${escapeHtml(String(value))}${unit ? `<span class="stat-unit">${escapeHtml(unit)}</span>` : ""}</div>
      <div class="stat-label">${label}</div>
    </div>`;
  }

  // The month's rate, big, because it is the one figure that answers "how is
  // this month going" without needing a second number beside it.
  function renderGauge(pct, label, hint) {
    const shown = pct >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10;
    return `
      <div class="gauge-card sys-panel">
        <div class="gauge">
          ${ringSvg(pct, "gauge-ring")}
          <div class="gauge-mid">
            <div class="gauge-num">${shown}<span class="gauge-pct">%</span></div>
            <div class="gauge-label">${label}</div>
          </div>
        </div>
        ${hint ? `<div class="form-hint gauge-hint">${hint}</div>` : ""}
      </div>`;
  }

  // The year, one square a day. This is what the long memory is for: the
  // detailed history only reaches back 120 days, and a grid that showed four
  // honest months and eight grey ones would read as eight months of failure.
  function renderYearCard(state, ui, task) {
    const thisYear = new Date().getFullYear();
    const year = Number(ui.statsYear) === thisYear - 1 ? thisYear - 1 : thisYear;
    const marks = SYS.yearMarks(state, task ? task.id : null, year);
    // The grid fills column by column, seven cells to a column, so a column
    // is a week and a row is a weekday. January the first is rarely a Monday,
    // so the run starts with as many blanks as it takes to line the rows up —
    // without them the rows are seven arbitrary slices and mean nothing.
    const lead = (new Date(year, 0, 1).getDay() + 6) % 7;
    const pad = Array.from({ length: lead }, () => `<span class="year-cell pad"></span>`).join("");
    const cellClass = (mark) => mark === "+" ? "done"
      : mark === "-" ? "missed"
      : mark === "." ? ""
      : "partly";
    const cells = pad + marks.map((m) => `<span class="year-cell ${cellClass(m.mark)}" title="${escapeHtml(m.key)}"></span>`).join("");
    return `
      <div class="sys-panel panel-pad">
        <div class="card-head">
          <span class="card-title">${t("stats.yearlyStatus")}</span>
          <select class="field-select year-select" data-action="set-stats-year">
            <option value="${thisYear}" ${year === thisYear ? "selected" : ""}>${thisYear}</option>
            <option value="${thisYear - 1}" ${year === thisYear - 1 ? "selected" : ""}>${thisYear - 1}</option>
          </select>
        </div>
        <div class="year-scroll"><div class="year-grid">${cells}</div></div>
        <div class="year-key">
          <span class="year-cell done"></span><span>${t("stats.legendDone")}</span>
          <span class="year-cell partly"></span><span>${t("stats.legendPartly")}</span>
          <span class="year-cell missed"></span><span>${t("stats.legendMissed")}</span>
          <span class="year-cell"></span><span>${t("stats.legendNone")}</span>
        </div>
      </div>`;
  }

  function renderDoneToday(state) {
    const rows = SYS.doneToday(state);
    return `
      <div class="sys-panel panel-pad">
        <div class="card-head"><span class="card-title">${t("stats.doneToday")}</span></div>
        ${rows.length === 0 ? `<div class="empty-note">${t("stats.nothingToday")}</div>` : `
        <div class="done-list">
          ${rows.map((r) => {
            const task = state.tasks.find((x) => x.id === r.id) || { unit: r.unit };
            return `<div class="done-row">
              <span class="done-emoji">${U.taskIconHtml(task)}</span>
              <span class="done-name">${escapeHtml(r.title)}</span>
              <span class="done-amt">${escapeHtml(fmtVolume(task, r.amount))}</span>
            </div>`;
          }).join("")}
        </div>`}
      </div>`;
  }

  function renderMemosCard(task) {
    const notes = SYS.habitNotes(task, 12);
    return `
      <div class="sys-panel panel-pad">
        <div class="card-head"><span class="card-title">${t("stats.memos")}</span></div>
        ${notes.length === 0 ? `<div class="empty-note">${t("stats.noMemos")}</div>` : `
        <div class="note-list">
          ${notes.map((n) => `<div class="note-row ${n.done ? "done" : ""}">
            <span class="note-date">${escapeHtml(U.shortDate(n.key))}</span>
            <span class="note-text">${escapeHtml(n.note)}</span>
          </div>`).join("")}
        </div>`}
      </div>`;
  }

  // One day, opened from the calendar: what was done, what each came to, and
  // when it was written down. The clock is missing on days recorded before the
  // app kept times, and on nothing else — an absent time is shown as absent
  // rather than filled in with a guess.
  function renderDaySheet(state, ui) {
    // No `SYS.isDayKey &&` guard on purpose: written that way it silently
    // fell back to today whenever the export was missing, which is exactly
    // the bug it looks like it is protecting against.
    const key = SYS.isDayKey(ui.dayKey) ? ui.dayKey : SYS.todayKey();
    const rows = SYS.dayLog(state, key);
    const today = SYS.todayKey();
    const clock = (mins) => {
      const h = Math.floor(mins / 60), m = mins % 60;
      return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
    };
    return `
      <div class="modal-backdrop" data-action="close-day-backdrop">
        <div class="sys-panel modal-box day-sheet" data-stop-close="1" role="dialog" aria-label="${escapeHtml(SYS.dayLabel(key))}">
          <div class="day-head">
            <button class="wk-arrow" data-action="close-day" aria-label="${t("form.cancel")}">${icon("x", 15)}</button>
            <div class="day-nav">
              <button class="wk-arrow" data-action="shift-day-sheet" data-delta="-1" aria-label="${t("stats.previous")}">${icon("chevronLeft", 14)}</button>
              <span class="day-date">${escapeHtml(key)}</span>
              <button class="wk-arrow" data-action="shift-day-sheet" data-delta="1" aria-label="${t("stats.next")}" ${key >= today ? "disabled" : ""}>${icon("chevronRight", 14)}</button>
            </div>
            <span class="day-head-pad"></span>
          </div>
          <div class="day-sub">${escapeHtml(SYS.dayLabel(key))}</div>
          ${rows.length === 0 ? renderEmptyDay() : `
          <div class="day-rows">
            ${rows.map((r) => {
              const task = state.tasks.find((x) => x.id === r.id) || { unit: r.unit };
              return `<div class="day-row">
                <span class="day-time">${r.at === null ? "&mdash;" : clock(r.at)}</span>
                <div class="day-pill ${r.done ? "done" : ""}">
                  <span class="day-emoji">${U.taskIconHtml(task)}</span>
                  <span class="day-name">${escapeHtml(r.title)}</span>
                  <span class="day-amt">${escapeHtml(fmtVolume(task, r.amount))}</span>
                </div>
              </div>
              ${r.note ? `<div class="day-note">${escapeHtml(r.note)}</div>` : ""}`;
            }).join("")}
          </div>`}
        </div>
      </div>`;
  }

  // Our own empty state rather than the one in the app this was modelled on:
  // that illustration is somebody else's asset, and the rule here is the same
  // as it is for the sounds.
  function renderEmptyDay() {
    return `
      <div class="day-empty">
        <svg viewBox="0 0 96 96" class="day-empty-mark" aria-hidden="true">
          <circle cx="48" cy="48" r="30" />
          <path d="M34 48h28" />
        </svg>
        <div class="day-empty-text">${t("stats.dayEmpty")}</div>
      </div>`;
  }

  // A round step for an axis, in the habit's base unit. Time gets steps a
  // person reads without arithmetic — ten minutes, half an hour — rather than
  // the 250-second step a generic rounding would pick.
  function niceStep(raw) {
    if (!(raw > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function timeStep(raw) {
    const steps = [30, 60, 120, 300, 600, 900, 1200, 1800, 3600, 5400, 7200, 10800, 18000, 36000, 72000];
    return steps.find((s) => s >= raw) || Math.ceil(raw / 36000) * 36000;
  }

  // This period against the one before it, for one habit. Amounts in the
  // habit's own unit — litres and minutes cannot be added, which is why there
  // is no all-habits version of this chart.
  //
  // An emphasis pair rather than two equal categories: the current period is
  // the point and takes the accent, the previous one is context and takes a
  // gray tuned per theme (--bar-prev) so it clears 3:1 on the card and stays
  // clearly apart from the accent. Each bucket is one hover and focus target
  // reading both periods, and a table view carries every number, so nothing
  // here is readable only by hovering.
  //
  // Built from HTML rather than one SVG. An SVG with a fixed viewBox scales its
  // text with the card, so labels sized for a phone came out several times too
  // large on a desktop. Here the bars stretch and the text keeps its own size
  // at any width; every day and every month keeps its label, and when there is
  // no room for them all the plot scrolls sideways inside the card rather than
  // letting labels run into each other. In Arabic the flex row reverses by
  // itself, so the buckets and the value axis follow the reading direction
  // with no mirrored arithmetic.
  function renderComparisonCard(state, ui, task) {
    const span = ["week", "month", "year"].includes(ui.compareSpan) ? ui.compareSpan : "week";
    const data = SYS.comparison(task, span);
    const rtl = !!(SYS.currentLanguage && SYS.currentLanguage() === "ar");
    const names = {
      week: [t("compare.lastWeek"), t("compare.thisWeek")],
      month: [t("compare.lastMonth"), t("compare.thisMonth")],
      year: [t("compare.lastYear"), t("compare.thisYear")],
    }[span];
    const locale = dateLocale();
    const monthOf = (b) => { const [y, m] = b.curKey.split("-").map(Number); return new Date(y, m - 1, 1); };
    // Arabic weekday names run to eight letters; the narrow form keeps a week
    // on one screen, where the full names would force it to scroll.
    const shortLabel = (b) => span === "year" ? monthOf(b).toLocaleDateString(locale, { month: "short" })
      : span === "month" ? String(b.i + 1)
      : parseDayKey(b.curKey).toLocaleDateString(locale, { weekday: rtl ? "narrow" : "short" });
    const longLabel = (b) => span === "year" ? monthOf(b).toLocaleDateString(locale, { month: "long" })
      : span === "month" ? parseDayKey(b.curKey).toLocaleDateString(locale, { day: "numeric", month: "long" })
      : parseDayKey(b.curKey).toLocaleDateString(locale, { weekday: "long" });
    // A value that has not happened says so; a day the month does not have is
    // a dash. Neither is ever drawn or written as a zero.
    const valueText = (key, v) => !key ? "—" : v === null ? t("compare.notYet") : fmtVolume(task, v);

    const tabs = ["week", "month", "year"].map((s) =>
      `<button class="cmp-tab ${s === span ? "on" : ""}" data-action="set-compare-span" data-span="${s}" aria-pressed="${s === span}">${t("compare." + s)}</button>`).join("");
    const head = `
      <div class="card-head cmp-head">
        <span class="card-title">${t("compare.title")}</span>
        <div class="cmp-controls">
          <div class="cmp-tabs" role="group" aria-label="${t("compare.title")}">${tabs}</div>
          <button class="cmp-view" data-action="toggle-compare-table" aria-pressed="${!!ui.compareTable}">${ui.compareTable ? t("compare.chart") : t("compare.table")}</button>
        </div>
      </div>`;

    if (!(data.max > 0)) {
      return `<div class="sys-panel panel-pad cmp-card">${head}<div class="empty-note">${t("compare.empty")}</div></div>`;
    }

    // Two series, so a legend — and it carries each period's total, which is
    // the one direct label worth its space.
    const legend = `
      <div class="cmp-legend">
        <span class="cmp-key"><span class="cmp-swatch prev"></span><span>${escapeHtml(names[0])}</span><strong>${escapeHtml(fmtVolume(task, data.prevTotal))}</strong></span>
        <span class="cmp-key"><span class="cmp-swatch cur"></span><span>${escapeHtml(names[1])}</span><strong>${escapeHtml(fmtVolume(task, data.curTotal))}</strong></span>
      </div>`;

    if (ui.compareTable) {
      const rows = data.buckets.map((b) => `
        <tr>
          <th scope="row">${escapeHtml(longLabel(b))}</th>
          <td>${escapeHtml(valueText(b.prevKey, b.prev))}</td>
          <td>${escapeHtml(valueText(b.curKey, b.cur))}</td>
        </tr>`).join("");
      return `<div class="sys-panel panel-pad cmp-card">${head}${legend}
        <div class="cmp-table-wrap"><table class="cmp-table">
          <thead><tr><th scope="col"></th><th scope="col">${escapeHtml(names[0])}</th><th scope="col">${escapeHtml(names[1])}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>`;
    }

    const step = SYS.isTimeUnit(task.unit) ? timeStep(data.max / 3) : niceStep(data.max / 3);
    const top = Math.ceil(data.max / step) * step;
    const pct = (v) => Math.max(0, Math.min(100, (v / top) * 100));
    const r1 = (v) => Math.round(v * 10) / 10;
    const ticks = [];
    for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
    const tickText = (v) => (v === 0 ? "0" : fmtVolume(task, v));
    const labels = data.buckets.map(shortLabel);
    // The narrowest a bucket may get before the plot scrolls instead: room for
    // its own label at the chart's type size, so no label ever overlaps the
    // next. Roughly six pixels a character at 9.5px.
    const longest = Math.max(1, ...labels.map((s) => s.length));
    const bucketMin = Math.max(14, longest * 6 + 6);
    const axisWidth = Math.max(...ticks.map((v) => tickText(v).length)) * 6 + 4;

    const yaxis = ticks.map((v) => `<span class="cmp-ytick" style="bottom:${r1(pct(v))}%">${escapeHtml(tickText(v))}</span>`).join("");
    const grid = ticks.map((v) => `<i class="${v === 0 ? "base" : ""}" style="bottom:${r1(pct(v))}%"></i>`).join("");
    const bar = (v, cls) => (v === null || !(v > 0) ? "" : `<span class="cmp-bar ${cls}" style="height:${r1(pct(v))}%"></span>`);
    const buckets = data.buckets.map((b, idx) => {
      const aria = `${longLabel(b)}: ${names[1]} ${valueText(b.curKey, b.cur)}, ${names[0]} ${valueText(b.prevKey, b.prev)}`;
      // The earlier period first in the row; the row itself flips for Arabic.
      return `<div class="cmp-hit" tabindex="0" role="img" aria-label="${escapeHtml(aria)}"
        data-label="${escapeHtml(longLabel(b))}"
        data-prev-name="${escapeHtml(names[0])}" data-prev="${escapeHtml(valueText(b.prevKey, b.prev))}"
        data-cur-name="${escapeHtml(names[1])}" data-cur="${escapeHtml(valueText(b.curKey, b.cur))}">
        <div class="cmp-bars">${bar(b.prev, "prev")}${bar(b.cur, "cur")}</div>
        <span class="cmp-xl">${escapeHtml(labels[idx])}</span>
      </div>`;
    }).join("");

    return `<div class="sys-panel panel-pad cmp-card">${head}${legend}
      <div class="cmp-chart" role="group" aria-label="${escapeHtml(t("compare.title") + " — " + names[1] + " / " + names[0])}">
        <div class="cmp-yaxis" style="width:${axisWidth}px" aria-hidden="true">${yaxis}</div>
        <div class="cmp-scroll">
          <div class="cmp-plot" style="min-width:${bucketMin * data.buckets.length}px">
            <div class="cmp-grid" aria-hidden="true">${grid}</div>
            <div class="cmp-buckets">${buckets}</div>
          </div>
        </div>
      </div>
      <div class="cmp-tip" hidden></div>
    </div>`;
  }


  // A figure with what it was last month beside it: the number alone says
  // where you are, the change says which way you are going.
  function deltaTag(now, before, unit, fmt) {
    const a = Number(now) || 0, b = Number(before) || 0;
    if (!b && !a) return "";
    const d = Math.round((a - b) * 10) / 10;
    if (d === 0) return `<span class="delta same">${t("stats.same")}</span>`;
    // A volume is stored in the smallest unit, so it is shown through the
    // habit's own formatter rather than as a raw count of millilitres.
    const size = fmt ? fmt(Math.abs(d)) : escapeHtml(Math.abs(d)) + (unit || "");
    return `<span class="delta ${d > 0 ? "up" : "down"}">${d > 0 ? "▲" : "▼"} ${size} ${t("stats.vsLast")}</span>`;
  }

  // The two figures worth reading first, before any grid of tiles.
  function heroPair(a, b) {
    const one = (x) => `
      <div class="hero-stat">
        <div class="hero-num">${escapeHtml(String(x.value))}${x.unit ? `<span class="hero-unit">${escapeHtml(x.unit)}</span>` : ""}</div>
        <div class="hero-label">${x.label}${x.help ? helpMark(x.help, true) : ""}</div>
        ${x.delta || ""}
      </div>`;
    return `<div class="hero-stats">${one(a)}${one(b)}</div>`;
  }

  function tileGroup(title, tiles) {
    return `<div class="tile-group">
      <div class="tile-group-head">${title}</div>
      <div class="stat-tiles">${tiles}</div>
    </div>`;
  }

  // The last thirty days of one habit, as thin bars: the calendar says which
  // days were kept, this says how much was done on each.
  function renderThirtyDays(task) {
    const today = SYS.todayKey();
    const days = Array.from({ length: 30 }, (_, i) => SYS.shiftDay(today, i - 29));
    const goal = SYS.habitGoalBase(task) || 0;
    const amounts = days.map((k) => SYS.habitAmountOn(task, k) || 0);
    const max = Math.max(goal, ...amounts, 1);
    if (!amounts.some((v) => v > 0)) return "";
    return `
      <div class="sys-panel panel-pad" style="margin-top:16px;">
        <div class="card-head"><span class="card-title">${t("stats.last30")}</span></div>
        <div class="d30-plot">
          ${days.map((k, i) => `
            <div class="d30-day ${k === today ? "now" : ""}" title="${escapeHtml(k)} · ${escapeHtml(fmtVolume(task, amounts[i]))}">
              <div class="d30-fill" style="height:${amounts[i] > 0 ? Math.max(6, Math.round((amounts[i] / max) * 100)) : 0}%"></div>
            </div>`).join("")}
        </div>
        <div class="d30-axis"><span>${t("stats.days30Ago")}</span><span>${t("planner.today")}</span></div>
      </div>`;
  }

  function renderStatsPage(state, ui) {
    const habits = state.tasks.filter((x) => x.recurring);
    const scope = ui.statsScope && habits.some((x) => x.id === ui.statsScope) ? ui.statsScope : null;
    const task = scope ? habits.find((x) => x.id === scope) : null;
    const offset = Number(ui.statsMonthOffset) || 0;
    const base = new Date();
    base.setMonth(base.getMonth() + offset, 1);
    const year = base.getFullYear(), month = base.getMonth();
    const monthName = base.toLocaleDateString(dateLocale(), { month: "long" });
    const prev = new Date(year, month - 1, 1);
    const pYear = prev.getFullYear(), pMonth = prev.getMonth();

    // Stats draws its own head rather than calling renderPageHead, because
    // when one habit is being looked at the title is that habit's name.
    const header = `
      <div class="page-header page-header-icon">
        ${pageIcon("stats")}
        <h1 class="page-title">${escapeHtml(task ? task.title : t("nav.stats"))}</h1>
        ${helpMark("stats")}
      </div>`;

    if (!habits.length) {
      return header + `
        <div class="sys-panel panel-pad">
          <div class="empty-hero">
            ${pageIcon("stats")}
            <div class="empty-hero-text">${t("stats.noHabits")}</div>
            <button class="btn btn-primary btn-icon-inline" data-action="nav" data-page="habits">${icon("plus", 14)} ${t("habits.new")}</button>
          </div>
        </div>`;
    }

    if (!task) {
      const all = SYS.statsAllTime(state);
      const rate = SYS.monthRate(state, null, year, month);
      const prevRate = SYS.monthRate(state, null, pYear, pMonth);
      return header + renderScopeChips(state, ui) + renderMonthCard(state, ui)
        + heroPair(
          { value: rate >= 10 ? Math.round(rate) : Math.round(rate * 10) / 10, unit: "%", label: t("stats.monthlyRate"), delta: deltaTag(rate, prevRate, "%") },
          { value: all.bestStreak, unit: "", label: t("stats.bestPerfectRun"), delta: "", help: "perfectRun" })
        + renderGauge(rate, t("stats.monthlyRate"), t("stats.rateHint"))
        + tileGroup(t("stats.groupKeeping"), `
            ${tile(all.perfectDays, t("stats.perfectDays"), t("stats.unitDays"))}
            ${tile(all.habitsDone, t("stats.habitsDone"))}
            ${tile(all.dailyAverage >= 10 ? Math.round(all.dailyAverage) : Math.round(all.dailyAverage * 10) / 10, t("stats.dailyAverage"))}`)
        + renderDoneToday(state)
        + `<div class="sys-panel panel-pad stats-lifetime" style="margin-top:16px;">
            <div class="card-head"><span class="card-title">${t("stats.expByMonth")}</span></div>
            ${renderLifetimeStats(ui)}
          </div>`;
    }

    const st = SYS.habitStats(task, year, month);
    const pst = SYS.habitStats(task, pYear, pMonth);
    const rate = SYS.monthRate(state, task.id, year, month);
    const prevRate = SYS.monthRate(state, task.id, pYear, pMonth);
    const archived = SYS.isArchived(task);
    // Pressing Edit down here used to set the form up and leave it on the
    // Habits page, so nothing appeared to happen until you went looking for
    // it. The form is rendered wherever it was opened from instead.
    const editing = ui.taskForm && ui.taskForm.formKind === "edit" && ui.taskForm.editId === task.id;
    const armed = ui.armed && ui.armed.kind === "task" && ui.armed.id === task.id;
    return header + renderScopeChips(state, ui)
      + (archived ? `<div class="day-banner ahead" style="margin-bottom:12px;">${icon("download", 13)}<span>${t("stats.archivedNote")}</span></div>` : "")
      + heroPair(
        { value: st.currentStreak, unit: "", label: t("stats.currentStreak"), delta: "", help: "streak" },
        { value: rate >= 10 ? Math.round(rate) : Math.round(rate * 10) / 10, unit: "%", label: t("stats.monthlyRate"), delta: deltaTag(rate, prevRate, "%") })
      + renderMonthCard(state, ui)
      + renderYearCard(state, ui, task)
      + renderThirtyDays(task)
      + tileGroup(t("stats.groupKeeping"), `
          ${tile(st.successMonth, t("stats.successIn", { month: escapeHtml(monthName) }), t("stats.unitDays"))}
          ${tile(st.successTotal, t("stats.totalSuccess"), t("stats.unitDays"))}
          ${tile(st.bestStreak, t("stats.bestStreak"), t("stats.unitDays"))}`)
      + tileGroup(t("stats.groupAmount"), `
          ${tile(fmtVolume(task, st.volMonth), t("stats.volIn", { month: escapeHtml(monthName) }))}
          ${tile(fmtVolume(task, st.volTotal), t("stats.volTotal"))}
          ${tile(fmtVolume(task, st.dailyAvg), t("stats.dailyAvg"))}`)
      + `<div class="delta-row">${deltaTag(st.successMonth, pst.successMonth, " " + t("stats.unitDays"))} ${deltaTag(st.volMonth, pst.volMonth, "", (v) => escapeHtml(fmtVolume(task, v)))}</div>`
      + renderComparisonCard(state, ui, task)
      + renderMemosCard(task)
      + `<div class="habit-actions">
          <button class="btn btn-outline btn-icon-inline" data-action="edit-task" data-id="${escapeHtml(task.id)}">${icon("pencil", 14)} ${t("stats.editHabit")}</button>
          <button class="btn btn-outline btn-icon-inline" data-action="${archived ? "unarchive-habit" : "archive-habit"}" data-id="${escapeHtml(task.id)}">${icon(archived ? "upload" : "download", 14)} ${archived ? t("stats.unarchive") : t("stats.archive")}</button>
        </div>
        <div class="habit-danger">
          <button class="btn btn-ghost btn-icon-inline ${armed ? "danger-arm" : ""}" data-action="delete-task" data-id="${escapeHtml(task.id)}">${icon(armed ? "check" : "trash", 14)} ${armed ? t("intel.confirmAgain") : t("stats.deleteHabit")}</button>
        </div>`
      + (editing ? `<div class="sys-panel panel-pad stats-edit" style="margin-top:16px;">${renderTaskForm(state, ui)}</div>` : "");
  }
  SYS.renderStatsPage = renderStatsPage;

  Object.assign(U, { shownDay, sheetDay, dayLabel, MAX_WEEKS_AHEAD, renderWeekStrip, renderDayBanner, renderHabitCard, habitOrder, renderHabitsPage, renderLifetimeStats, fmtVolume, renderScopeChips, ringSvg, parseDayKey, monthTitle, renderMonthCard, tile, renderGauge, renderYearCard, renderDoneToday, renderMemosCard, renderDaySheet, renderEmptyDay, niceStep, timeStep, renderComparisonCard, deltaTag, heroPair, tileGroup, renderThirtyDays, renderStatsPage });
})(window.SYS = window.SYS || {});

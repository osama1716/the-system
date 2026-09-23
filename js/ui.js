// Pure(ish) rendering: builds HTML/SVG strings from (state, uiState). No mutation,
// no event wiring here — main.js owns the store and delegates all events.
(function (SYS) {
  "use strict";

  // Shorthand — this file is almost entirely strings, so `t(...)` reads far
  // better inline than SYS.t(...). i18n.js loads before this file.
  const t = (key, vars) => SYS.t(key, vars);

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  SYS.escapeHtml = escapeHtml;

  // The language the app is set to, not the one the browser happens to be
  // in. Falls back to the browser's own when nothing is set.
  function dateLocale() {
    const code = SYS.currentLanguage && SYS.currentLanguage();
    return code || undefined;
  }

  // Time left, rounded up to the whole second. Flooring both halves of
  // "done / left" loses the fraction twice and the two stop adding up to the
  // goal — which is exactly how 01:37 and 28:22 came to make 29:59.
  function ceilSecond(ms) { return Math.ceil(Math.max(0, ms) / 1000) * 1000; }

  // Where today stands, counting the part of a running session that has not
  // been written to the habit yet — so it moves with the clock instead of
  // jumping every fifteen seconds when the session flushes.
  function timerCaption(task, todayMs) {
    const goalMs = SYS.habitGoalBase(task) * 1000;
    return fmtElapsed(todayMs) + " / " + fmtElapsed(goalMs);
  }
  SYS.timerCaption = timerCaption;

  // The share of today's goal that is done, as a percentage for the ring.
  // The same number in both modes: a countdown that emptied its own ring was
  // a second clock, and said nothing about the goal.
  SYS.timerRingPct = function (task, todayMs) {
    const goalMs = SYS.habitGoalBase(task) * 1000;
    return goalMs > 0 ? Math.max(0, Math.min(100, (todayMs / goalMs) * 100)) : 0;
  };

  // A habit's progress, in the form its unit deserves. Time is a clock:
  // "1.667 / 30 min" is arithmetic nobody asked to see, where "01:40 / 30:00"
  // is just the time. Everything else keeps its number and its unit.
  function progressText(task, day) {
    const key = day || SYS.todayKey();
    const doneBase = SYS.habitAmountOn(task, key);
    const goalBase = SYS.habitGoalBase(task);
    if (SYS.isTimeUnit(task.unit)) return fmtElapsed(doneBase * 1000) + " / " + fmtElapsed(goalBase * 1000);
    const done = SYS.fromBase(doneBase, task.unit);
    const goal = Number(task.targetAmount) || 1;
    return done + " / " + goal + " " + SYS.tUnit(task.unit);
  }
  SYS.progressText = progressText;

  // Weekday names come from the calendar rather than a list typed out per
  // language. 2026-09-06 is a Sunday, so index 0..6 lines up with getDay().
  function weekdayLabels() {
    const base = new Date(2026, 8, 6);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d.toLocaleDateString(dateLocale(), { weekday: "short" });
    });
  }

  // One line saying when a habit is meant to happen. The card leans on this
  // instead of a bare number, because "3" never said which three.
  function scheduleLabel(task) {
    const sc = SYS.scheduleOf(task);
    const wd = weekdayLabels();
    switch (sc.type) {
      case "weekdays": return sc.days.map((d) => wd[d]).join(" · ");
      case "perWeek": return SYS.t("sched.perWeekShort", { n: sc.n });
      case "monthDays": return SYS.t("sched.monthDaysShort", { days: sc.days.join(", ") });
      case "perMonth": return SYS.t("sched.perMonthShort", { n: sc.n });
      case "interval": return SYS.t("sched.intervalShort", { n: sc.every });
      case "perInterval": return SYS.t("sched.perIntervalShort", { n: sc.n, every: sc.every });
      default: return SYS.t("sched.daily");
    }
  }
  SYS.scheduleLabel = scheduleLabel;

  // The schedule picker. One select for the kind of schedule, and only the
  // controls that kind actually needs underneath it — a weekday habit has no
  // use for "every N days", and showing both invites filling in the wrong one.
  function renderSchedulePicker(f) {
    const sc = (f && f.schedule) || { type: "daily" };
    const wd = weekdayLabels();
    const num = (label, path, value, min, max) => `
        <div style="max-width:140px;">
          <div class="field-label">${label}</div>
          <input class="field-input" type="number" min="${min}" max="${max}" data-bind="${path}" value="${escapeHtml(value == null ? "" : value)}" />
        </div>`;
    const startField = `
        <div style="max-width:180px;">
          <div class="field-label">${SYS.t("form.startingOn")}</div>
          <input class="field-input" type="date" data-bind="taskForm.schedule.start" value="${escapeHtml(sc.start || "")}" />
        </div>`;

    let detail = "";
    if (sc.type === "weekdays") {
      // Monday first for display; the values stay getDay() numbers so the
      // engine never has to know which day a locale starts its week on.
      detail = `<div class="sched-days">${[1, 2, 3, 4, 5, 6, 0].map((i) => `
          <button type="button" class="sched-day ${(sc.days || []).indexOf(i) >= 0 ? "on" : ""}"
            data-action="toggle-schedule-day" data-day="${i}" aria-pressed="${(sc.days || []).indexOf(i) >= 0}">${escapeHtml(wd[i])}</button>`).join("")}</div>`;
    } else if (sc.type === "monthDays") {
      detail = `<div class="sched-dates">${Array.from({ length: 31 }, (_, k) => k + 1).map((n) => `
          <button type="button" class="sched-date ${(sc.days || []).indexOf(n) >= 0 ? "on" : ""}"
            data-action="toggle-schedule-date" data-date="${n}" aria-pressed="${(sc.days || []).indexOf(n) >= 0}">${n}</button>`).join("")}</div>
        <div class="form-hint">${SYS.t("form.monthDaysHint")}</div>`;
    } else if (sc.type === "perWeek") {
      detail = `<div class="field-row">${num(SYS.t("form.timesPerWeek"), "taskForm.schedule.n", sc.n, 1, 7)}</div>`;
    } else if (sc.type === "perMonth") {
      detail = `<div class="field-row">${num(SYS.t("form.timesPerMonth"), "taskForm.schedule.n", sc.n, 1, 31)}</div>`;
    } else if (sc.type === "interval") {
      detail = `<div class="field-row">${num(SYS.t("form.everyNDays"), "taskForm.schedule.every", sc.every, 2, 365)}${startField}</div>`;
    } else if (sc.type === "perInterval") {
      detail = `<div class="field-row">${num(SYS.t("form.times"), "taskForm.schedule.n", sc.n, 1, 365)}${num(SYS.t("form.everyNDays"), "taskForm.schedule.every", sc.every, 2, 365)}${startField}</div>`;
    }

    return `
      <div class="sched-block">
        <div class="field-label">${SYS.t("form.schedule")}</div>
        <select class="field-select" data-bind="taskForm.schedule.type" data-action="set-schedule-type">
          ${SYS.SCHEDULE_TYPES.map((ty) => `<option value="${ty}" ${sc.type === ty ? "selected" : ""}>${SYS.t("sched." + ty)}</option>`).join("")}
        </select>
        ${detail}
      </div>`;
  }

  // Priority uses only the design's two functional accents (gold = notable,
  // rust = urgent) plus dim for low-key — not a per-value rainbow.
  const PRIORITY_VAR = { dim: "var(--dim)", gold: "var(--gold-text)", rust: "var(--rust-text)" };

  const ICONS = {
    plus: `<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>`,
    minus: `<line x1="5" y1="12" x2="19" y2="12"/>`,
    undo: `<path d="M4 9h11a5 5 0 0 1 0 10h-6"/><polyline points="8 5 4 9 8 13"/>`,
    backspace: `<path d="M9 5h11v14H9L2 12z"/><line x1="12" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="12" y2="15"/>`,
    check: `<polyline points="4 12 9 17 20 6"/>`,
    trash: `<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/>`,
    chevronDown: `<polyline points="6 9 12 15 18 9"/>`,
    chevronRight: `<polyline points="9 6 15 12 9 18"/>`,
    zap: `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`,
    pencil: `<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>`,
    gear: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.96 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.96a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.04z"/>`,
    x: `<line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/>`,
    download: `<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>`,
    upload: `<path d="M12 21V9"/><path d="M7 14l5-5 5 5"/><path d="M5 3h14"/>`,
    home: `<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>`,
    list: `<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>`,
    grid: `<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>`,
    clock: `<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/>`,
    repeat: `<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>`,
    chevronLeft: `<polyline points="15 18 9 12 15 6"/>`,
    bar: `<line x1="5" y1="20" x2="5" y2="12"/><line x1="12" y1="20" x2="12" y2="6"/><line x1="19" y1="20" x2="19" y2="15"/>`,
    bell: `<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 19a2 2 0 0 0 4 0"/>`,
    timer: `<circle cx="12" cy="13" r="8"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="13" x2="15" y2="15"/><line x1="9" y1="2" x2="15" y2="2"/>`,
    play: `<polygon points="6 3 20 12 6 21 6 3"/>`,
    pause: `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`,
    stop: `<rect x="5" y="5" width="14" height="14" rx="1"/>`,
    shield: `<path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z"/>`,
    flag: `<path d="M5 21V4"/><path d="M5 5h11l-1.5 3L16 11H5z"/>`,
    users: `<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.2c3 .2 5.5 2.6 5.5 5.8"/>`,
    calendar: `<rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/>`,
    trophy: `<path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v1.5a3.5 3.5 0 0 1-3.5 3.5"/><path d="M7 5H4v1.5A3.5 3.5 0 0 0 7.5 10"/><path d="M12 14v4"/><path d="M8.5 21h7"/><path d="M9.5 18h5l.5 3h-6z"/>`,
  };
  // Google's own "G" mark, used as-is per their sign-in button branding
  // guidelines — not routed through icon() since that helper forces a
  // monochrome fill/stroke meant for the single-color line icons above.
  const GOOGLE_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/><path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"/></svg>`;

  function icon(name, size, extraClass) {
    return `<svg class="${extraClass || ""}" width="${size || 14}" height="${size || 14}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;
  }
  SYS.icon = icon;

  function buildRadarSVG(intTypes, intelligences) {
    const n = intTypes.length;
    if (n < 3) return `<div style="color:var(--faint);font-size:12px;text-align:center;padding:20px;">${t("overview.radarNeedsMore")}</div>`;
    const size = 260, cx = size / 2, cy = size / 2, R = 90, rings = 4;
    const avgs = intTypes.map((t) => SYS.avgTraitLevel(intelligences[t.key]));
    const maxVal = Math.max(5, ...avgs) + 3;
    const angleFor = (i) => -Math.PI / 2 + i * ((2 * Math.PI) / n);

    let s = `<svg viewBox="0 0 ${size} ${size}" width="100%" height="100%" role="img" aria-label="${t("overview.radarAlt")}">`;
    for (let r = 1; r <= rings; r++) {
      const ringR = (R * r) / rings;
      const pts = intTypes.map((t, i) => { const a = angleFor(i); return `${(cx + ringR * Math.cos(a)).toFixed(1)},${(cy + ringR * Math.sin(a)).toFixed(1)}`; }).join(" ");
      s += `<polygon fill="none" stroke="var(--border)" stroke-width="1" points="${pts}"/>`;
    }
    intTypes.forEach((t, i) => {
      const a = angleFor(i);
      const x2 = cx + R * Math.cos(a), y2 = cy + R * Math.sin(a);
      s += `<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="var(--border)" stroke-width="1"/>`;
      const lx = cx + (R + 18) * Math.cos(a), ly = cy + (R + 18) * Math.sin(a);
      s += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-family="IBM Plex Mono, monospace" font-size="10.5" font-weight="500" style="fill:var(--dim)" text-anchor="middle" dominant-baseline="middle">${escapeHtml(t.short)}</text>`;
    });
    const dataPts = intTypes.map((t, i) => { const a = angleFor(i); const r = R * Math.min(1, avgs[i] / maxVal); return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(" ");
    s += `<polygon fill="var(--gold-soft)" stroke="var(--gold)" stroke-width="2" points="${dataPts}"/>`;
    s += `</svg>`;
    return s;
  }
  SYS.buildRadarSVG = buildRadarSVG;

  // ---------- sidebar navigation ----------
  const NAV_ITEMS = [
    { page: "overview", key: "nav.overview", icon: "home" },
    { page: "quests", key: "nav.quests", icon: "list" },
    { page: "habits", key: "nav.habits", icon: "repeat" },
    { page: "planner", key: "nav.planner", icon: "calendar" },
    { page: "stats", key: "nav.stats", icon: "bar" },
    { page: "leaderboard", key: "nav.leaderboard", icon: "trophy" },
    { page: "friends", key: "nav.friends", icon: "users" },
    { page: "intelligence", key: "nav.intelligence", icon: "grid" },
    { page: "mail", key: "nav.mail", icon: "bell" },
    { page: "log", key: "nav.log", icon: "clock" },
  ];
  // Waiting on this account: friend requests and race challenges.
  function friendsBadge(ui) {
    const me = ui.cloudUser && ui.cloudUser.uid;
    return (ui.friendRequestsIn || 0) + (ui.races || []).filter((r) => r.status === "pending" && r.opponent === me).length;
  }
  // The section icons are pictures (assets/icons), drawn as one gold set; the
  // name beside them, or the button's label on a phone, says what they are.
  // Two copies of each: ivory-on-gold for the dark themes, and the same icon
  // with its ivory turned dark for the light ones, where ivory would vanish.
  // CSS shows whichever fits the theme, as it does for the brand mark.
  const navImg = (page) => `<img class="nav-img nav-img-dark" src="assets/icons/${page}-96.png" alt="" width="26" height="26" draggable="false" /><img class="nav-img nav-img-light" src="assets/icons/${page}-96-light.png" alt="" width="26" height="26" draggable="false" />`;
  function renderSidebar(ui) {
    const navItems = ui.isAdmin ? [...NAV_ITEMS, { page: "admin", key: "nav.admin", icon: "shield" }] : NAV_ITEMS;
    const unreadCount = (ui.inbox || []).filter((m) => !m.read).length;
    const items = navItems.map((n) => `
      <button class="nav-item ${ui.page === n.page ? "active" : ""}" data-action="nav" data-page="${n.page}" aria-label="${t(n.key)}">
        ${navImg(n.page)}<span class="nav-label">${t(n.key)}</span>${n.page === "log" && unreadCount > 0 ? `<span class="banked-tag" style="margin-inline-start:auto;">${unreadCount}</span>` : ""}${n.page === "friends" && friendsBadge(ui) > 0 ? `<span class="banked-tag nav-count">${friendsBadge(ui)}</span>` : ""}${n.page === "mail" && mailBadge(null, ui) > 0 ? `<span class="banked-tag nav-count">${mailBadge(null, ui)}</span>` : ""}
      </button>`).join("");
    return `
      <div class="brand" data-action="replay-brand" title="${t("brand.replay")}">
        <span class="brand-mark">
          <img src="icons/mark-on-dark.png" alt="" class="mark-for-dark" />
          <img src="icons/mark-on-light.png" alt="" class="mark-for-light" />
          <!-- The sweep is masked to the mark's own silhouette, so the light
               travels across the letterform instead of across its bounding
               box — the corners of this PNG are empty and a rectangular
               gleam over them reads as a glitch. -->
          <span class="brand-shine" aria-hidden="true"></span>
        </span>
        <span class="brand-text">THE <b>SYSTEM</b></span>
      </div>
      <nav class="nav-list">${items}</nav>
      <button class="nav-item nav-settings" data-action="open-settings" aria-label="${t("nav.settings")}">${navImg("settings")}<span class="nav-label">${t("nav.settings")}</span></button>`;
  }
  SYS.renderSidebar = renderSidebar;

  // ---------- persistent status bar (every page) ----------
  function renderStatusbar(state, ui) {
    const p = state.player;
    const nameBlock = ui.nameEditing
      ? `<input class="player-name-input" id="name-input" data-bind="__nameDraft" value="${escapeHtml(ui.__nameDraft ?? p.name)}" autofocus />`
      : `<button class="player-name-btn" data-action="edit-name" title="${t("status.rename")}">${escapeHtml(p.name)}</button>`;

    return `
      <div class="statusbar-inner">
        <div class="status-id">
          ${nameBlock}
          <span class="rank-badge">${t("status.rank", { rank: p.rank })}</span>
          <span class="lv-tag">${t("status.level", { n: p.level })}</span>
        </div>
        <div class="status-exp">
          <div class="exp-track"><div class="exp-fill" style="width:${Math.round((p.exp / SYS.levelCost(p.rank)) * 100)}%"></div></div>
          <span class="status-exp-label">${p.exp}/${SYS.levelCost(p.rank)}</span>
        </div>
      </div>`;
  }
  SYS.renderStatusbar = renderStatusbar;

  // ---------- Overview page ----------
  // A section's picture icon at page-title size, both copies as in the nav.
  const pageIcon = (page) => `<img class="page-icon nav-img-dark" src="assets/icons/${page}-96.png" alt="" width="34" height="34" draggable="false" /><img class="page-icon nav-img-light" src="assets/icons/${page}-96-light.png" alt="" width="34" height="34" draggable="false" />`;

  // Every page opens the same way: the section's icon, what the page is, and
  // its name.
  function renderPageHead(page, eyebrowKey, titleKey) {
    return `
      <div class="page-header page-header-icon">
        ${pageIcon(page)}
        <div>
          <div class="eyebrow">${t(eyebrowKey)}</div>
          <h1 class="page-title">${t(titleKey)}</h1>
        </div>
      </div>`;
  }
  SYS.renderPageHead = renderPageHead;

  // What this day asks for: the habits due today and the planner's to-dos,
  // with the same controls they have on their own pages — the first question
  // someone opening the app has is what to do now, and it used to take two
  // more taps to answer.
  function renderTodayCard(state, ui) {
    const today = SYS.todayKey();
    const habits = state.tasks.filter((x) => x.recurring && SYS.isDueOn(x, today) && !(SYS.isArchivedOn && SYS.isArchivedOn(x, today)));
    const todos = SYS.todosOn ? SYS.todosOn(state, today) : [];
    const rows = [];
    habits.forEach((x) => {
      const done = SYS.habitDoneOn(x, today);
      rows.push({ done, html: `
        <div class="today-row ${done ? "done" : ""}">
          <span class="today-emoji">${escapeHtml(SYS.taskIcon(x))}</span>
          <span class="today-title">${escapeHtml(x.title)}</span>
          <button class="today-check ${done ? "hit" : ""}" data-action="open-amount" data-id="${escapeHtml(x.id)}" aria-haspopup="dialog" aria-label="${escapeHtml(x.title)}">${icon(done ? "check" : "plus", 14)}</button>
        </div>` });
    });
    todos.forEach((x) => {
      rows.push({ done: !!x.done, html: `
        <div class="today-row ${x.done ? "done" : ""}">
          <span class="today-emoji today-emoji-line">${icon("list", 13)}</span>
          <span class="today-title">${escapeHtml(x.title)}</span>
          <button class="today-check ${x.done ? "hit" : ""}" role="checkbox" aria-checked="${x.done ? "true" : "false"}" data-action="planner-toggle" data-id="${escapeHtml(x.id)}" aria-label="${escapeHtml(x.title)}">${x.done ? icon("check", 14) : ""}</button>
        </div>` });
    });
    const doneCount = rows.filter((r) => r.done).length;
    const pct = rows.length ? Math.round((doneCount / rows.length) * 100) : 0;
    const shown = rows.filter((r) => !r.done).concat(rows.filter((r) => r.done)).slice(0, 7);
    const more = rows.length - shown.length;
    const body = rows.length === 0
      ? `<div class="empty-note">${t("today.none")}</div>`
      : `${doneCount === rows.length ? `<div class="today-all-done">${icon("check", 13)} ${t("today.allDone")}</div>` : ""}
         <div class="today-list">${shown.map((r) => r.html).join("")}</div>
         ${more > 0 ? `<button class="link-btn" data-action="nav" data-page="habits">${t("today.more", { n: more })}</button>` : ""}`;
    return `
      <div class="sys-panel panel-pad today-panel">
        <div class="panel-head">
          <div class="eyebrow" style="margin:0;">${t("today.title")}</div>
          ${rows.length ? `<span class="today-count">${t("today.progress", { done: doneCount, total: rows.length })}</span>` : ""}
        </div>
        ${rows.length ? `<div class="today-track"><div class="today-fill" style="width:${pct}%"></div></div>` : ""}
        ${body}
      </div>`;
  }

  // The last seven days of EXP: one series, so no legend — the heading names
  // it. Thin bars on a baseline, today's in full gold and labelled; the rest
  // are quieter and show their figure on hover, because a number over every
  // bar is noise. A day with nothing earned keeps a stub at the baseline so
  // the week still reads as seven days.
  function renderWeekBars(state) {
    const wk = SYS.statsWeek(state, 0);
    const today = SYS.todayKey();
    const max = Math.max(1, ...wk.days.map((d) => d.xp));
    const total = wk.days.reduce((s, d) => s + d.xp, 0);
    const label = (d) => d.date.toLocaleDateString(dateLocale(), { weekday: "short" });
    return `
      <div class="sys-panel panel-pad">
        <div class="panel-head">
          <div class="eyebrow" style="margin:0;">${t("overview.week7")}</div>
          <span class="today-count">${t("overview.weekTotal", { n: total })}</span>
        </div>
        <div class="wk-plot">
          ${wk.days.map((d) => `
            <div class="wk-day ${d.dateKey === today ? "now" : ""}" title="${escapeHtml(label(d))} · ${escapeHtml(d.xp)}">
              <span class="wk-val">${escapeHtml(d.xp)}</span>
              <div class="wk-fill" style="height:${d.xp > 0 ? Math.max(6, Math.round((d.xp / max) * 100)) : 0}%"></div>
            </div>`).join("")}
        </div>
        <div class="wk-labels">
          ${wk.days.map((d) => `<span class="${d.dateKey === today ? "now" : ""}">${escapeHtml(label(d))}</span>`).join("")}
        </div>
      </div>`;
  }

  // Which icon a line of the record gets. The record holds level and rank
  // movements only, so the text is enough to tell them apart.
  function logMark(text) {
    const s = String(text || "");
    if (/^RANK UP/.test(s)) return { name: "trophy", cls: "up" };
    if (/^RANK DOWN/.test(s)) return { name: "shield", cls: "down" };
    if (/\(reverted\)/.test(s)) return { name: "undo", cls: "down" };
    return { name: "zap", cls: "up" };
  }

  // The level dial. The ring is a band cut out of the app's own gold
  // artwork, and that artwork *is* the bar: drained of its colour where the
  // level has not reached, at full strength where it has, and brighter still
  // over the few degrees it has just got to. Three copies of one image, one
  // band mask shared between them in the stylesheet, and two wedges given
  // here as angles — so the whole thing costs no script and no canvas.
  //
  // A level just begun shows a sliver rather than nothing: with any exp at
  // all there is something to see, and at exactly zero there is not, which
  // is the truth either way.
  // The rank emblems. Each is one image, already carrying its own colour and
  // its own dark backing, so the same file reads on the cream theme as on the
  // dark one and there is no second set to keep in step.
  //
  // Two sizes ship: 128 for everywhere the badge is small, and 512 for the
  // two places it is the subject — the rank-up and the profile. Only the
  // small set is precached; the large one is fetched the first time a player
  // actually sees it big.
  function rankArt(rank, px, opts) {
    const o = opts || {};
    const has = (SYS.RANK_ART || []).indexOf(rank) >= 0;
    if (!has) return `<span class="rank-letter-fallback ${o.cls || ""}">${escapeHtml(rank)}</span>`;
    const file = px > 128 ? 512 : 128;
    const id = encodeURIComponent(rank);
    // Only the height is given. The emblems are trimmed to their artwork and
    // are wider the more ornament a rank carries, so a fixed square would
    // letterbox the winged ones and shrink their letter exactly where the
    // ladder means it to grow.
    const img = (cls, name) => `<img class="${cls}" src="assets/ranks/${id}-${name}${file}.png"
      height="${px}" alt="" aria-hidden="true" loading="lazy" decoding="async" />`;
    const lit = o.lit && (SYS.RANK_LIT || []).indexOf(rank) >= 0;
    if (!lit) return img("rank-art " + (o.cls || ""), "");
    // The emblem, then its own light four times over: blurred behind it for
    // the halo, and three warped copies cross-fading above it so the flames
    // morph from one shape to the next. Five tags, two files — the browser
    // fetches the emblem and its light once each.
    return `<span class="rank-emblem ${o.cls || ""}">
      ${img("rank-bloom", "glow-")}
      ${img("rank-art", "")}
      ${img("rank-lit w1", "glow-")}
      ${img("rank-lit w2", "glow-")}
      ${img("rank-lit w3", "glow-")}
    </span>`;
  }
  SYS.rankArt = rankArt;

  function levelDial(pct, inner) {
    const shown = pct > 0 ? Math.max(pct, 2) : 0;
    const arc = (shown * 3.6).toFixed(1);
    const lead = Math.max(0, shown * 3.6 - 13).toFixed(1);
    const layer = (cls) => `
      <div class="dial-band ${cls}">
        <img class="nav-img-dark" src="assets/frames/dial-ring-512.png" alt="" aria-hidden="true" width="512" height="512" />
        <img class="nav-img-light" src="assets/frames/dial-ring-512-light.png" alt="" aria-hidden="true" width="512" height="512" />
      </div>`;
    return `
      <div class="level-ring" style="--arc:${arc}deg;--lead:${lead}deg">
        ${layer("dial-spent")}${layer("dial-won")}${layer("dial-edge")}
        <div class="level-ring-inner">${inner}</div>
      </div>`;
  }

  function renderOverviewPage(state, ui) {
    const p = state.player;
    const radar = buildRadarSVG(state.intTypes, state.intelligences);
    const activeQuests = state.tasks.filter((x) => !x.recurring && x.completion < 100).length;
    const today = SYS.todayKey();
    const dueToday = state.tasks.filter((x) => x.recurring && SYS.isDueOn(x, today) && !(SYS.isArchivedOn && SYS.isArchivedOn(x, today)));
    const doneToday = dueToday.filter((x) => SYS.habitDoneOn(x, today)).length;
    // The longest run any habit is currently on: one number for "I have kept
    // this up", which is the figure people come back for.
    const streak = state.tasks.filter((x) => x.recurring)
      .reduce((best, x) => Math.max(best, (SYS.habitStreak(x, today) || { n: 0 }).n), 0);
    const weekXp = SYS.statsWeek(state, 0).days.reduce((s, d) => s + d.xp, 0);
    const recent = state.log.slice(0, 3);
    const pct = Math.round((p.exp / SYS.levelCost(p.rank)) * 100);
    const tile = (page, num, label, iconName) => `
      <button class="stat-tile stat-tile-btn" data-action="nav" data-page="${page}">
        <span class="stat-tile-icon">${icon(iconName, 14)}</span>
        <div class="stat-num">${num}</div>
        <div class="stat-label">${label}</div>
      </button>`;

    return `
      ${renderPageHead("overview", "overview.eyebrow", "nav.overview")}

      <div class="level-ring-wrap">
        <div class="ring-holder">
          ${levelDial(pct, `
            <span class="level-ring-label">${t("overview.level")}</span>
            <span class="level-ring-num">${p.level}</span>
            <span class="level-ring-xp">${t("overview.xpOf", { exp: p.exp, of: SYS.levelCost(p.rank) })}</span>`)}
        </div>
        <div class="hero-rank" title="${t("status.rank", { rank: p.rank })}">${rankArt(p.rank, 66, { lit: true })}</div>
        <h1 class="page-hero-title">${escapeHtml(p.name)}</h1>
        <div class="page-hero-sub">${t("overview.subtitle", { rank: p.rank, n: p.questsCompleted })}</div>
      </div>

      <div class="stat-tiles" style="margin-top:26px;">
        ${tile("quests", activeQuests, t("overview.activeQuests"), "list")}
        ${tile("habits", dueToday.length ? doneToday + "/" + dueToday.length : "0", t("overview.habitsToday"), "repeat")}
        ${tile("habits", streak, t("overview.streak"), "zap")}
        ${tile("stats", weekXp, t("overview.weekExp"), "bar")}
      </div>

      ${renderTodayCard(state, ui)}

      ${renderWeekBars(state)}

      <div class="sys-panel panel-pad">
        <div class="eyebrow" style="margin-bottom:6px;">${t("overview.radar")}</div>
        <div style="height:320px;display:flex;justify-content:center;">${radar}</div>
      </div>

      <div class="sys-panel panel-pad">
        <div class="panel-head">
          <div class="eyebrow">${t("overview.recent")}</div>
          <button class="link-btn" data-action="nav" data-page="log">${t("overview.viewLog")}</button>
        </div>
        ${recent.length === 0
          ? `<div class="empty-note">${t("overview.noMilestones")}</div>`
          : `<div>${recent.map((e) => {
              const m = logMark(e.text);
              return `
              <div class="log-entry">
                <span class="log-mark ${m.cls}">${icon(m.name, 13)}</span>
                <span class="text">${escapeHtml(e.text)}</span>
                <span class="date">${escapeHtml(e.date)}</span>
              </div>`; }).join("")}</div>`}
      </div>`;
  }
  SYS.renderOverviewPage = renderOverviewPage;

  // ---------- Intelligence page (card grid) ----------
  function renderIntelligencePage(state, ui) {
    const sortMode = ui.intelSort === "name" ? "name" : "level";
    const types = state.intTypes.filter((x) => state.intelligences[x.key]);
    const avgOf = (x) => SYS.avgTraitLevel(state.intelligences[x.key]);
    const ordered = types.slice().sort(sortMode === "name"
      ? (a, b) => a.name.localeCompare(b.name)
      : (a, b) => avgOf(b) - avgOf(a));
    const best = types.slice().sort((a, b) => avgOf(b) - avgOf(a))[0];
    const worst = types.slice().sort((a, b) => avgOf(a) - avgOf(b))[0];

    const cards = ordered.map((t) => {
      const intel = state.intelligences[t.key];
      const isOpen = !!ui.expanded[t.key];
      const avg = SYS.avgTraitLevel(intel);
      const barPct = Math.min(100, avg * 3.6);
      // What the category is worth so far, and how close the next point is:
      // an average alone never moves enough to feel like progress.
      const points = intel.traits.reduce((s, x) => s + (Number(x.level) || 0), 0);
      // How far into the next point this category already is, not how much is
      // left — "100% to the next" on an untouched category read backwards.
      const toNext = Math.round((Number(intel.remainder) || 0) * 100);
      const topLevel = intel.traits.reduce((m, x) => Math.max(m, Number(x.level) || 0), 0);

      const traitRows = intel.traits.map((tr) => {
        const armed = ui.armed && ui.armed.kind === "trait" && ui.armed.id === tr.id;
        const isTop = topLevel > 0 && tr.level === topLevel;
        return `
          <div class="trait-row ${isTop ? "top" : ""}">
            <span class="name">${isTop ? `<span class="trait-star" title="${SYS.t("intel.strongestTrait")}">★</span>` : ""}${escapeHtml(tr.name)}${tr.ar ? `<span class="ar">${escapeHtml(tr.ar)}</span>` : ""}</span>
            <span style="display:flex;align-items:center;gap:8px;">
              <span class="lv">${SYS.t("intel.lv", { n: tr.level })}</span>
              ${!ui.isAdmin || SYS.isSeedTrait(t.key, tr.name) ? "" : `<button class="trait-del icon-mini ${armed ? "danger-arm" : ""}" data-action="remove-trait" data-key="${t.key}" data-trait="${tr.id}" aria-label="${SYS.t("intel.removeTrait")}" title="${armed ? SYS.t("intel.confirmAgain") : SYS.t("intel.removeTrait")}">${icon(armed ? "check" : "trash", 12)}</button>`}
            </span>
          </div>`;
      }).join("");

      // No way to add a category or trait from the app, the admin's account
      // included. The index is the vocabulary every task is measured against and
      // the evaluator is tuned and eval-tested on exactly this list, so a new
      // entry is a change to the code, made together with its prompt and eval
      // updates — not a button.

      return `
        <div class="sys-panel intel-card" id="intel-${escapeHtml(t.key)}" style="border-inline-start:3px solid ${escapeHtml(t.color)};">
          <button class="intel-card-head" data-action="toggle-intel" data-key="${t.key}" aria-expanded="${isOpen}">
            <div>
              <div class="intel-card-key" style="color:${escapeHtml(t.color)}">${escapeHtml(t.short)}</div>
              <div class="intel-card-name">${escapeHtml(t.name)}</div>
              ${t.ar ? `<div class="intel-card-ar">${escapeHtml(t.ar)}</div>` : ""}
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="avg-badge">${avg.toFixed(1)}</span>
              <span class="chevron ${isOpen ? "open" : "closed"}">${icon("chevronDown", 13)}</span>
            </div>
          </button>
          <div class="intel-points">${SYS.t("intel.points", { n: points })} · ${SYS.t("intel.toNext", { pct: toNext })}</div>
          <div class="intel-bar-track"><div class="intel-bar-fill" style="width:${barPct}%;background:${escapeHtml(t.color)};"></div></div>
          ${isOpen ? `
            <div class="trait-list">
              ${traitRows}
              ${intel.remainder > 0.01 ? `<div class="remainder-note">${SYS.t("intel.remainder", { pct: (intel.remainder * 100).toFixed(0) })}</div>` : ""}
            </div>
          ` : ""}
        </div>`;
    }).join("");

    const radar = buildRadarSVG(state.intTypes, state.intelligences);
    return `
      ${renderPageHead("intelligence", "intel.eyebrow", "intel.title")}
      <div class="sys-panel panel-pad">
        <div style="height:300px;display:flex;justify-content:center;">${radar}</div>
        ${best && worst && best.key !== worst.key ? `
          <div class="intel-poles">
            <span class="intel-pole"><span class="intel-pole-label">${t("intel.strongest")}</span> <b style="color:${escapeHtml(best.color)}">${escapeHtml(best.name)}</b></span>
            <span class="intel-pole"><span class="intel-pole-label">${t("intel.weakest")}</span> <b style="color:${escapeHtml(worst.color)}">${escapeHtml(worst.name)}</b>
              <button class="link-btn" data-action="intel-open" data-key="${escapeHtml(worst.key)}">${t("intel.openWeakest")}</button></span>
          </div>` : ""}
      </div>
      <div class="friends-rank-head" style="margin-bottom:10px;">
        <span class="planner-section" style="margin:0;">${t("intel.title")}</span>
        <span class="planner-tabs">
          <button class="chip filter-chip ${sortMode === "level" ? "active" : ""}" data-action="intel-sort" data-sort="level" aria-pressed="${sortMode === "level"}">${t("intel.sortLevel")}</button>
          <button class="chip filter-chip ${sortMode === "name" ? "active" : ""}" data-action="intel-sort" data-sort="name" aria-pressed="${sortMode === "name"}">${t("intel.sortName")}</button>
        </span>
      </div>
      <div class="intel-grid">
        ${cards}
      </div>`;
  }
  SYS.renderIntelligencePage = renderIntelligencePage;

  // ---------- quest form (add or edit) ----------
  function renderUnitPicker(f) {
    const known = SYS.UNIT_GROUPS.some((g) => g.units.includes(f.unit));
    const isCustom = f.unit === "custom" || !known;
    const groups = SYS.UNIT_GROUPS.map((g) => `
      <div class="unit-group">
        <span class="unit-group-label">${escapeHtml(SYS.tUnitGroup(g.label))}</span>
        <div class="chip-group">
          ${g.units.map((u) => `<button type="button" class="chip unit-chip ${f.unit === u ? "active" : ""}" style="${f.unit === u ? "background:var(--gold);border-color:var(--gold);" : "border-color:var(--gold-border);color:var(--gold-text);"}" data-action="set-unit" data-unit="${u}">${escapeHtml(SYS.tUnit(u))}</button>`).join("")}
        </div>
      </div>`).join("");
    return `
      <div class="unit-picker">
        ${groups}
        <div class="unit-group">
          <span class="unit-group-label">${t("form.other")}</span>
          <div class="chip-group">
            <button type="button" class="chip unit-chip ${isCustom ? "active" : ""}" style="${isCustom ? "background:var(--gold);border-color:var(--gold);" : "border-color:var(--gold-border);color:var(--gold-text);"}" data-action="set-unit" data-unit="custom">${t("form.custom")}</button>
          </div>
        </div>
      </div>
      ${isCustom ? `<input class="field-input" style="margin-top:8px;" placeholder="${t("form.customUnit")}" data-bind="taskForm.customUnit" value="${escapeHtml(f.customUnit || (known ? "" : f.unit))}" />` : ""}`;
  }

  function renderTaskForm(state, ui) {
    const f = ui.taskForm;
    if (!f) return "";
    // On a new task the system prices it and picks its categories — the user
    // has no input into either, which is the whole point (a self-assigned
    // value can't be compared fairly against anyone else's). On edit we show
    // what was already assigned, read-only: re-evaluating on every edit would
    // let someone re-roll until they got a value they liked.
    const isEdit = f.formKind === "edit";
    const assignedChips = f.types.length
      ? f.types.map((k) => {
          const t = state.intTypes.find((x) => x.key === k);
          return t ? `<span class="chip" style="border-color:${escapeHtml(t.color)};color:${escapeHtml(t.color)}">${escapeHtml(t.short)}</span>` : "";
        }).join("")
      : `<span class="chip" style="border-color:var(--border);color:var(--faint);">${t("form.general")}</span>`;

    const valueBlock = isEdit
      ? `<div>
          <div class="field-label">${t("form.assignedBySystem")}</div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span class="task-reward">+${escapeHtml(f.pt)} xp${f.recurring ? "/repeat" : ""}</span>
            <div class="chip-group">${assignedChips}</div>
          </div>
        </div>`
      : `<div class="form-hint" style="display:flex;align-items:center;gap:6px;">
          ${icon("shield", 13)} ${t("form.systemSetsValue")}
        </div>`;

    const modeToggle = (!f.recurring && f.taskType === "Long Term") ? `
      <div class="mode-toggle">
        <span style="font-size:12px;color:var(--dim);align-self:center;">${t("form.expMode")}</span>
        <button type="button" class="chip ${f.expMode === "gradual" ? "active" : ""}" style="${f.expMode === "gradual" ? "background:var(--gold);border-color:var(--gold);" : "border-color:var(--gold-border);color:var(--gold-text);"}" data-action="set-exp-mode" data-mode="gradual">${t("form.gradual")}</button>
        <button type="button" class="chip ${f.expMode === "allAtOnce" ? "active" : ""}" style="${f.expMode === "allAtOnce" ? "background:var(--gold);border-color:var(--gold);" : "border-color:var(--gold-border);color:var(--gold-text);"}" data-action="set-exp-mode" data-mode="allAtOnce">${t("form.allAtOnce")}</button>
      </div>` : "";

    // A quit habit is measured by not happening, so the amount, the unit and
    // the schedule all go: it is one clean day at a time, every day. Hiding
    // them is the honest move — leaving them visible would imply they matter.
    const quitToggle = `
      <div class="chip-row" style="margin-bottom:9px;">
        <span style="font-size:12px;color:var(--dim);">${t("form.habitKind")}</span>
        <button type="button" class="chip ${!f.quit ? "active" : ""}" style="${!f.quit ? "background:var(--gold);border-color:var(--gold);" : "border-color:var(--gold-border);color:var(--gold-text);"}" data-action="set-quit" data-value="0">${t("form.kindBuild")}</button>
        <button type="button" class="chip ${f.quit ? "active" : ""}" style="${f.quit ? "background:var(--gold);border-color:var(--gold);" : "border-color:var(--gold-border);color:var(--gold-text);"}" data-action="set-quit" data-value="1">${t("form.kindQuit")}</button>
      </div>
      ${f.quit ? `<div class="form-hint" style="margin-bottom:9px;line-height:1.5;">${t("form.quitHint")}</div>` : ""}`;

    // A habit's reminders: one chip per time, a + to add another, and a line
    // of the person's own for the notification to say. Each time opens the
    // time wheels (renderTimeSheet) rather than <input type="time">, whose
    // 12/24-hour format comes from the operating system, not the page.
    function renderReminders(f) {
      const times = SYS.sanitizeReminders(f.reminders);
      const full = times.length >= SYS.MAX_REMINDERS;
      return `
        <div class="field-label">${t("form.reminders")}</div>
        <div class="remind-list">
          ${times.map((hhmm, i) => `<span class="remind-chip">
            <button type="button" class="remind-chip-time" data-action="open-time-sheet" data-slot="${i}" aria-label="${t("form.pickTime")} ${escapeHtml(hhmm)}">${icon("bell", 12)}<span>${escapeHtml(hhmm)}</span></button>
            <button type="button" class="remind-chip-x" data-action="remove-reminder" data-slot="${i}" aria-label="${t("form.removeReminder")} ${escapeHtml(hhmm)}">${icon("x", 11)}</button>
          </span>`).join("")}
          ${full ? "" : `<button type="button" class="remind-add" data-action="open-time-sheet" data-slot="new" aria-label="${t("form.addReminder")}"><span class="remind-plus" aria-hidden="true">+</span>${times.length ? "" : `<span>${t("form.addReminder")}</span>`}</button>`}
        </div>
        ${times.length ? `
        <div class="field-label" style="margin-top:12px;">${t("form.remindNote")}</div>
        <input class="field-input" data-bind="taskForm.remindNote" maxlength="${SYS.MAX_REMIND_NOTE}" placeholder="${t("form.remindNotePlaceholder")}" value="${escapeHtml(f.remindNote || "")}" />` : ""}`;
    }

    const typeFields = f.recurring ? `
      <div class="field-row">
        <div>
          <div class="field-label">${t("task.priority")}</div>
          <select class="field-select" data-bind="taskForm.priority">
            ${["Low", "Medium", "High"].map((o) => `<option value="${o}" ${f.priority === o ? "selected" : ""}>${t("priority." + o)}</option>`).join("")}
          </select>
        </div>
      </div>
      ${quitToggle}
      ${f.quit ? "" : renderSchedulePicker(f)}
      <div class="field-row">
        <div style="width:100%;">
          ${renderReminders(f)}
        </div>
      </div>
      <div class="form-hint" style="margin-bottom:9px;">${t("form.remindHint")}</div>
      ${f.quit ? "" : `
      <div class="field-row">
        <div style="max-width:140px;">
          <div class="field-label">${t("form.amountPerRepeat")}</div>
          <input class="field-input" type="number" min="0" step="any" data-bind="taskForm.targetAmount" value="${escapeHtml(f.targetAmount)}" />
        </div>
      </div>
      <div>
        <div class="field-label">${t("form.unit")}</div>
        ${renderUnitPicker(f)}
      </div>`}` : `
      <div class="field-row">
        <div>
          <div class="field-label">${t("form.priorityLong")}</div>
          <select class="field-select" data-bind="taskForm.priority">
            ${["Low", "Medium", "High"].map((o) => `<option value="${o}" ${f.priority === o ? "selected" : ""}>${t("priority." + o)}</option>`).join("")}
          </select>
        </div>
        <div>
          <div class="field-label">${t("form.taskTypeLong")}</div>
          <select class="field-select" data-bind="taskForm.taskType" data-action="change-task-type">
            ${["Short Term", "Medium Term", "Long Term"].map((o) => `<option value="${o}" ${f.taskType === o ? "selected" : ""}>${t("term." + o)}</option>`).join("")}
          </select>
        </div>
      </div>
      ${modeToggle}`;

    // The emoji. A plain text field rather than a grid of thirty: no web API
    // can open the operating system's emoji keyboard, but every keyboard
    // already has one, and typing into a field reaches all of it instead of
    // whichever handful someone picked in advance. The hint names the
    // shortcut, since on a desktop it is the part people don't know.
    const chosenIcon = SYS.clampIcon(f.icon) || SYS.taskIcon({ title: f.title });
    const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
    const appearance = `
      <div>
        <div class="field-label">${t("form.appearance")}</div>
        <div class="appearance-row">
          <div class="appearance-preview">${escapeHtml(chosenIcon)}</div>
          <input class="field-input icon-input" data-bind="taskForm.icon" value="${escapeHtml(f.icon || "")}"
            placeholder="${escapeHtml(SYS.taskIcon({ title: f.title }))}" maxlength="16" aria-label="${t("form.appearance")}" />
        </div>
        <div class="form-hint">${t("form.emojiOnly")}<span class="emoji-shortcut"> ${t(isMac ? "form.emojiHintMac" : "form.emojiHintWin")}</span></div>
      </div>`;

    const typeToggle = f.lockType ? "" : `
        <div class="mode-toggle">
          <span style="font-size:12px;color:var(--dim);align-self:center;">${t("form.questType")}</span>
          <button type="button" class="chip ${!f.recurring ? "active" : ""}" style="${!f.recurring ? "background:var(--gold);border-color:var(--gold);" : "border-color:var(--gold-border);color:var(--gold-text);"}" data-action="set-recurring" data-value="0">${t("form.oneOff")}</button>
          <button type="button" class="chip ${f.recurring ? "active" : ""}" style="${f.recurring ? "background:var(--gold);border-color:var(--gold);" : "border-color:var(--gold-border);color:var(--gold-text);"}" data-action="set-recurring" data-value="1">${t("task.recurringHabit")}</button>
        </div>`;

    return `
      <div class="quest-form">
        <input class="field-input" placeholder="${f.recurring ? t("form.habitName") : t("form.questTitle")}" data-bind="taskForm.title" value="${escapeHtml(f.title)}" />
        ${typeToggle}
        ${typeFields}
        ${appearance}
        <div>
          <div class="field-label">${isEdit ? t("form.notes") : t("form.describe")}</div>
          <textarea class="field-textarea" data-bind="taskForm.notes" placeholder="${isEdit ? t("form.notesPlaceholder") : t("form.describePlaceholder")}">${escapeHtml(f.notes)}</textarea>
        </div>
        ${valueBlock}
        ${f.error ? `<div class="toast-error">${escapeHtml(f.error)}</div>` : ""}
        <div class="btn-row" style="justify-content:flex-end;">
          ${isEdit ? `<button class="btn btn-danger-outline" data-action="delete-task-from-form" data-id="${f.editId}" style="margin-inline-end:auto;">${ui.armed && ui.armed.kind === "task" && ui.armed.id === f.editId ? t("intel.confirmAgain") : t("task.delete")}</button>` : ""}
          <button class="btn btn-ghost" data-action="cancel-quest-form" ${f.busy ? "disabled" : ""}>${t("form.cancel")}</button>
          <button class="btn btn-primary" data-action="submit-quest-form" ${f.busy ? "disabled" : ""}>${f.busy ? t("form.evaluating") : isEdit ? t("form.saveChanges") : t("form.accept")}</button>
        </div>
      </div>`;
  }
  SYS.renderTaskForm = renderTaskForm;


  // Which trait this task's points go to.
  //
  // Worth showing on its own — "this habit builds Health" is the answer to what
  // a task is *for* — and it makes a point landing somewhere odd visible on the
  // task itself instead of inferred from a radar afterwards. Three separate
  // reports of "it went to the wrong trait" could not be told apart without it:
  // a task with no target at all, a target the evaluator named that matches
  // nothing here, and a target that matches fine all look identical once the
  // point has landed.
  function renderTaskTarget(state, t) {
    const targets = Array.isArray(t.traitTargets) ? t.traitTargets : [];
    if (!targets.length) {
      // No target means the point goes wherever is weakest, which is worth
      // saying plainly rather than leaving to be discovered.
      return `<span class="meta-pair"><span class="meta-label">${SYS.t("task.builds")}</span><span style="color:var(--faint);">${SYS.t("task.buildsWeakest")}</span></span>`;
    }
    const names = targets.map((target) => {
      const intel = state.intelligences[target.category];
      const traits = (intel && intel.traits) || [];
      const idx = traits.findIndex((x) => SYS.normaliseName(x.name) === SYS.normaliseName(target.trait));
      // A named trait that matches nothing here behaves exactly like no target
      // at all, so it says so rather than looking settled.
      return idx >= 0
        ? escapeHtml(traits[idx].name)
        : `<span style="color:var(--rust-text);" title="${escapeHtml(target.trait)}">${escapeHtml(target.trait)} — ${SYS.t("task.buildsUnmatched")}</span>`;
    });
    return `<span class="meta-pair"><span class="meta-label">${SYS.t("task.builds")}</span><span>${names.join(", ")}</span></span>`;
  }

  function renderTaskRow(state, ui, t) {
    const recurring = t.mode === "recurring";
    const awaiting = !recurring && questAwaiting(t);
    const done = !recurring && t.completion >= 100 && !awaiting;
    const armed = ui.armed && ui.armed.kind === "task" && ui.armed.id === t.id;
    const typeSpans = t.types.map((k) => { const info = state.intTypes.find((x) => x.key === k); return info ? `<span style="color:${escapeHtml(info.color)}" title="${escapeHtml(info.name)}">${escapeHtml(info.short)}</span>` : ""; }).join("");
    const expTotal = SYS.ptToExp(t.pt);

    // Not open yet: the moment comes from the server (see unlockTimes) and
    // rides in on `ui`, like every other piece of state these functions read.
    // The controls that would add progress are held closed until then; taking
    // progress off stays available, since it only ever gives back.
    const unlock = (t.priceId && ui.unlocks && ui.unlocks[t.priceId]) || null;
    const locked = !done && !!(unlock && unlock.locked);
    const opensWhen = locked && SYS.unlockText ? SYS.unlockText(unlock) : "";

    const checkOrSpacer = recurring
      ? `<div class="check-btn" style="cursor:default;" aria-hidden="true" title="${SYS.t("task.recurringHabit")}">${icon("repeat", 15)}</div>`
      : (t.mode === "simple" || t.mode === "allAtOnce")
        ? `<button class="check-btn ${done ? "done" : awaiting ? "awaiting" : ""}" data-action="${t.completion >= 100 ? "reopen-task" : "complete-task"}" data-id="${t.id}" ${locked ? "disabled" : ""} title="${locked ? escapeHtml(opensWhen) : ""}" aria-label="${t.completion >= 100 ? SYS.t("task.markIncomplete") : locked ? escapeHtml(opensWhen) : SYS.t("task.complete")}">${done ? icon("check", 15) : awaiting ? icon("clock", 14) : locked ? icon("clock", 13) : ""}</button>`
        : `<div style="width:36px;flex-shrink:0;"></div>`;

    const stepper = t.mode === "gradual" ? `
      <div class="stepper-row">
        <button class="step-btn" data-action="task-step" data-id="${t.id}" data-delta="-5" aria-label="${SYS.t("task.decrease")}">${icon("minus", 11)}</button>
        <input class="range-slider" type="range" min="0" max="100" step="1" value="${t.completion}" style="--pct:${t.completion}%" data-action="task-slide" data-id="${t.id}" ${locked ? "disabled" : ""} aria-label="${SYS.t("task.setPct")}" />
        <span class="progress-pct">${t.completion}%</span>
        <button class="step-btn plus" data-action="task-step" data-id="${t.id}" data-delta="5" ${locked ? "disabled" : ""} title="${locked ? escapeHtml(opensWhen) : ""}" aria-label="${SYS.t("task.increase")}">${icon("plus", 11)}</button>
      </div>` : "";

    const heldExp = SYS.isGatedTask && SYS.isGatedTask(t) ? SYS.heldQuestExp(t) : 0;
    return `
      <div class="task-row ${done ? "done" : ""} pr-${escapeHtml(SYS.PRIORITY_COLOR[t.priority] || "dim")}" title="${SYS.t("task.priority")}: ${SYS.t("priority." + t.priority)}">
        <span class="visually-hidden">${SYS.t("task.priority")}: ${SYS.t("priority." + t.priority)}</span>
        <div class="task-body">
          ${checkOrSpacer}
          <div style="flex:1;min-width:0;">
            <div class="task-title-row">
              <div class="task-title ${done ? "done" : ""}">${escapeHtml(t.title)}</div>
              <span class="task-reward">${recurring ? SYS.t("task.rewardPerRepeat", { n: expTotal.toFixed(0) }) : SYS.t("task.reward", { n: expTotal.toFixed(0) })}</span>
              ${heldExp > 0 && !done ? `<span class="held-badge">${icon("clock", 11)} ${SYS.t("task.heldBadge", { n: heldExp })}</span>` : ""}
              <div class="task-actions">
                ${ui.cloudUser ? `<button class="icon-mini" data-action="open-appeal-form" data-id="${t.id}" aria-label="${SYS.t("task.appeal")}" title="${SYS.t("task.appeal")}">${icon("flag", 13)}</button>` : ""}
                <button class="icon-mini" data-action="edit-task" data-id="${t.id}" aria-label="${SYS.t("task.edit")}">${icon("pencil", 13)}</button>
                <button class="icon-mini ${armed ? "danger-arm" : ""}" data-action="delete-task" data-id="${t.id}" aria-label="${SYS.t("task.delete")}" title="${armed ? SYS.t("intel.confirmAgain") : SYS.t("task.delete")}">${icon(armed ? "check" : "trash", 13)}</button>
              </div>
            </div>
            <div class="task-meta">
              ${recurring
                ? `<span class="meta-pair"><span class="meta-label">${SYS.t("task.repeats")}</span><span>${escapeHtml(SYS.scheduleLabel(t))}</span></span>`
                : `<span class="meta-pair"><span class="meta-label">${SYS.t("task.term")}</span><span>${SYS.t("term." + t.taskType)}</span></span>`}
              ${typeSpans.length ? `<span class="meta-pair"><span class="meta-label">${SYS.t("task.type")}</span>${typeSpans}</span>` : ""}
              ${renderTaskTarget(state, t)}
            </div>
            ${t.notes ? `<div class="task-notes">${escapeHtml(t.notes)}</div>` : ""}
            ${locked ? `<div class="task-lock">${icon("clock", 12)} ${escapeHtml(opensWhen)}</div>` : ""}
            ${renderTaskHeld(t)}
            ${recurring ? "" : stepper}
          </div>
        </div>
      </div>`;
  }

  // ---------- Quests page (one-off tasks only) ----------
  const QUEST_FILTERS = [
    { key: "all", tkey: "quests.all" },
    { key: "active", tkey: "quests.active" },
    { key: "done", tkey: "quests.done" },
  ];
  // This week's directives, above the person's own quests.
  //
  // Every one carries its value and the reason it was chosen, both before any
  // decision is made: being told what something is worth after committing to it
  // is not a choice. Declining is a plain button beside accepting, not hidden
  // behind anything — these are proposals, and a proposal you cannot refuse
  // easily is an assignment wearing a friendlier word.
  function renderSuggestionsSection(state, ui) {
    if (!ui.cloudUser) return "";
    if (ui.suggestionsError) {
      return `<div class="sys-panel panel-pad"><div class="toast-error" style="margin:0;">${escapeHtml(ui.suggestionsError)}</div></div>`;
    }
    if (!ui.suggestions) {
      return ui.suggestionsBusy
        ? `<div class="sys-panel panel-pad"><div class="empty-note">${t("suggest.drawing")}</div></div>`
        : "";
    }

    const handled = (state.suggestions && state.suggestions.weekKey === ui.suggestions.weekKey)
      ? (state.suggestions.handled || [])
      : [];
    const open = (ui.suggestions.items || []).filter((s) => !handled.includes(s.id));

    // Answering the last one should read as finishing something, not as the
    // section quietly disappearing.
    if (!open.length) {
      return `
        <div class="sys-panel panel-pad">
          <div class="eyebrow" style="margin-bottom:6px;">${t("suggest.eyebrow")}</div>
          <div class="empty-note" style="padding:10px 4px;">${t("suggest.allAnswered")}</div>
        </div>`;
    }

    const rows = open.map((s) => {
      const badges = (s.types || []).map((k) => {
        const info = state.intTypes.find((x) => x.key === k);
        return info ? `<span class="chip" style="border-color:${escapeHtml(info.color)};color:${escapeHtml(info.color)}">${escapeHtml(info.short)}</span>` : "";
      }).join("");
      const worth = s.kind === "habit"
        ? t("suggest.worthPerRepeat", { n: escapeHtml(s.pt) })
        : t("suggest.worth", { n: escapeHtml(s.pt) });
      const cadence = s.kind === "habit"
        ? `<div class="suggest-cadence">${t("suggest.cadence", { n: escapeHtml(s.repeatsPerWeek), amount: escapeHtml(s.targetAmount), unit: escapeHtml(SYS.tUnit(s.unit)) })}</div>`
        : "";
      return `
        <div class="suggest-card">
          <div class="suggest-head">
            <span class="suggest-title">${escapeHtml(s.title)}</span>
            <span class="suggest-worth">${worth}</span>
          </div>
          <div class="suggest-desc">${escapeHtml(s.description)}</div>
          ${cadence}
          ${s.reason ? `<div class="suggest-reason">${icon("chevronRight", 12)} ${escapeHtml(s.reason)}</div>` : ""}
          <div class="suggest-actions">
            ${badges}
            <span style="flex:1;"></span>
            ${ui.cloudUser ? `<button class="icon-mini" data-action="report-ai" data-surface="suggestion" data-id="${escapeHtml(s.id)}" aria-label="${t("aiReport.title")}" title="${t("aiReport.title")}">${icon("flag", 13)}</button>` : ""}
            <button class="btn btn-ghost btn-sm" data-action="dismiss-suggestion" data-id="${escapeHtml(s.id)}">${t("suggest.decline")}</button>
            <button class="btn btn-primary btn-sm" data-action="accept-suggestion" data-id="${escapeHtml(s.id)}">${t("suggest.accept")}</button>
          </div>
        </div>`;
    }).join("");

    return `
      <div class="sys-panel panel-pad">
        <div class="panel-head">
          <div class="eyebrow">${t("suggest.eyebrow")}</div>
          <span class="form-hint" style="margin:0;">${t("suggest.weekly")}</span>
        </div>
        <div class="suggest-list">${rows}</div>
      </div>`;
  }

  // Open quests first, the ones that matter most at the top of those, and
  // everything finished at the end — the page is a list of what is left.
  const PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2 };
  // 100% done but the answer that releases its EXP has not been accepted yet:
  // the work is over, the quest is not, so it stays out of "done".
  function questAwaiting(task) {
    return !task.recurring && (Number(task.completion) || 0) >= 100 &&
      !!(SYS.isGatedTask && SYS.isGatedTask(task)) && SYS.heldQuestExp(task) > 0;
  }
  const questDone = (task) => (Number(task.completion) || 0) >= 100 && !questAwaiting(task);
  function sortQuests(list) {
    return list.slice().sort((a, b) => {
      const da = questDone(a) ? 2 : questAwaiting(a) ? 0 : 1, db = questDone(b) ? 2 : questAwaiting(b) ? 0 : 1;
      if (da !== db) return da - db;
      const pa = PRIORITY_ORDER[a.priority] == null ? 1 : PRIORITY_ORDER[a.priority];
      const pb = PRIORITY_ORDER[b.priority] == null ? 1 : PRIORITY_ORDER[b.priority];
      if (pa !== pb) return pa - pb;
      return 0;
    });
  }

  function renderQuestsPage(state, ui) {
    const showingForm = !!ui.taskForm && !ui.taskForm.recurring;
    const filter = ui.questFilter || "all";
    const oneOff = state.tasks.filter((x) => !x.recurring);
    const counts = {
      all: oneOff.length,
      active: oneOff.filter((x) => !questDone(x)).length,
      done: oneOff.filter((x) => questDone(x)).length,
    };
    const filtered = sortQuests(oneOff.filter((x) => filter === "all" ? true : filter === "active" ? !questDone(x) : questDone(x)));
    const tasks = filtered.map((x) => renderTaskRow(state, ui, x)).join("");
    const filterChips = QUEST_FILTERS.map((f) => `<button class="chip filter-chip ${filter === f.key ? "active" : ""}" data-action="set-quest-filter" data-filter="${f.key}">${t(f.tkey)}<span class="chip-count">${counts[f.key]}</span></button>`).join("");
    const empty = oneOff.length === 0
      ? `<div class="empty-hero">
           ${pageIcon("quests")}
           <div class="empty-hero-text">${t("quests.empty")}</div>
           <button class="btn btn-primary btn-icon-inline" data-action="open-quest-form">${icon("plus", 14)} ${t("quests.first")}</button>
         </div>`
      : `<div class="empty-note">${t("quests.emptyFilter")}</div>`;

    return `
      ${renderPageHead("quests", "quests.eyebrow", "quests.title")}
      <div class="sys-panel panel-pad">
        <div class="panel-head">
          <div class="chip-group">${filterChips}</div>
          ${!showingForm ? `<button class="btn btn-outline btn-icon-inline" data-action="open-quest-form">${icon("plus", 14)} ${t("quests.new")}</button>` : ""}
        </div>
        ${showingForm ? renderTaskForm(state, ui) : ""}
        ${filtered.length === 0 ? empty : `<div>${tasks}</div>`}
      </div>
      ${renderSuggestionsSection(state, ui)}
      ${renderAppealSection(ui)}
      ${showingForm ? "" : `<button class="fab" data-action="open-quest-form" aria-label="${t("quests.new")}" title="${t("quests.new")}">${icon("plus", 20)}</button>`}`;
  }

  // Appeals — the human review path over the automatic evaluator. A user who
  // thinks a task was valued unfairly asks for a second look; these live in
  // Firestore rather than local state, so the section only appears with an
  // account (there's nobody to review an appeal otherwise).
  const APPEAL_STATUS_STYLE = {
    pending: { key: "appeal.pending", color: "var(--dim)" },
    resolved: { key: "appeal.resolved", color: "var(--gold-text)" },
    rejected: { key: "appeal.rejected", color: "var(--rust-text)" },
  };
  function renderAppealForm(ui) {
    const f = ui.appealForm;
    return `
      <div class="quest-form" style="margin-top:10px;">
        <div class="field-label">${t("appeal.appealing", { title: escapeHtml(f.taskTitle) })}</div>
        <textarea class="field-textarea" placeholder="${t("appeal.reasonPlaceholder")}" data-bind="appealForm.reason">${escapeHtml(f.reason)}</textarea>
        ${f.error ? `<div class="toast-error">${escapeHtml(f.error)}</div>` : ""}
        <div class="btn-row" style="justify-content:flex-end;">
          <button class="btn btn-ghost" data-action="cancel-appeal-form" ${f.busy ? "disabled" : ""}>${t("form.cancel")}</button>
          <button class="btn btn-primary" data-action="submit-appeal-form" ${f.busy ? "disabled" : ""}>${f.busy ? t("appeal.submitting") : t("appeal.submit")}</button>
        </div>
        <div class="form-hint" style="line-height:1.5;">${t("aiReport.fromAppeal")} <button class="link-btn" data-action="report-ai" data-surface="evaluation" data-id="${escapeHtml(f.taskId)}">${t("aiReport.title")}</button></div>
      </div>`;
  }
  function renderAppealSection(ui) {
    if (!ui.cloudUser) return "";
    const showingForm = !!ui.appealForm;
    if (!showingForm && !ui.myAppeals.length) return "";
    const rows = ui.myAppeals.map((a) => {
      const style = APPEAL_STATUS_STYLE[a.status] || APPEAL_STATUS_STYLE.pending;
      const suffix = a.status === "resolved" && a.newPt ? t("appeal.newValue", { n: escapeHtml(a.newPt) }) : "";
      return `
        <div class="log-entry">
          <span class="text">${escapeHtml(a.taskTitle)}</span>
          <span class="date" style="color:${style.color}">${t(style.key)}${suffix}</span>
        </div>`;
    }).join("");
    return `
      <div class="sys-panel panel-pad" style="margin-top:16px;">
        <div class="eyebrow" style="margin-bottom:6px;">${t("appeal.section")}</div>
        ${showingForm ? renderAppealForm(ui) : ""}
        ${ui.myAppeals.length ? `<div style="margin-top:12px;">${rows}</div>` : ""}
      </div>`;
  }
  SYS.renderQuestsPage = renderQuestsPage;

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
          <span class="habit-emoji">${escapeHtml(SYS.taskIcon(t))}</span>
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
    const due = habits.filter((x) => SYS.isQuotaSchedule(x) || SYS.isDueOn(x, day));
    const kept = due.filter((x) => SYS.habitDoneOn(x, day)).length;
    const pct = due.length ? Math.round((kept / due.length) * 100) : 0;

    const empty = `
      <div class="empty-hero">
        ${pageIcon("habits")}
        <div class="empty-hero-text">${t("habits.empty")}</div>
        <div class="btn-row" style="justify-content:center;">
          <button class="btn btn-primary btn-icon-inline" data-action="open-library">${icon("grid", 14)} ${t("habits.fromLibrary")}</button>
          <button class="btn btn-outline btn-icon-inline" data-action="open-habit-form">${icon("plus", 14)} ${t("habits.new")}</button>
        </div>
      </div>`;

    return `
      ${renderPageHead("habits", "habits.eyebrow", "habits.title")}
      <div class="sys-panel panel-pad">
        <div class="panel-head">
          <span></span>
          ${!showingForm ? `<button class="btn btn-outline btn-icon-inline" data-action="open-library">${icon("grid", 14)} ${t("library.button")}</button>` : ""}
          ${!showingForm ? `<button class="btn btn-outline btn-icon-inline" data-action="open-habit-form">${icon("plus", 14)} ${t("habits.new")}</button>` : ""}
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
      return shown + " " + SYS.tUnit(task.unit);
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
      ${live.map((x) => chip(x.id, escapeHtml(SYS.taskIcon(x)), x.title)).join("")}
      ${filed.map((x) => chip(x.id, escapeHtml(SYS.taskIcon(x)), x.title + " — " + t("stats.archived"), "filed")).join("")}
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
              <span class="done-emoji">${escapeHtml(SYS.taskIcon(task))}</span>
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
            <span class="note-date">${escapeHtml(shortDate(n.key))}</span>
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
                  <span class="day-emoji">${escapeHtml(SYS.taskIcon(task))}</span>
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
        <div class="hero-label">${x.label}</div>
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

    const header = `
      <div class="page-header page-header-icon">
        ${pageIcon("stats")}
        <div>
          <div class="eyebrow">${t("stats.eyebrow")}</div>
          <h1 class="page-title">${escapeHtml(task ? task.title : t("stats.title"))}</h1>
        </div>
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
          { value: all.bestStreak, unit: "", label: t("stats.bestStreak"), delta: "" })
        + renderGauge(rate, t("stats.monthlyRate"), t("stats.rateHint"))
        + tileGroup(t("stats.groupKeeping"), `
            ${tile(all.perfectDays, t("stats.perfectDays"), t("stats.unitDays"))}
            ${tile(all.habitsDone, t("stats.habitsDone"))}
            ${tile(all.dailyAverage >= 10 ? Math.round(all.dailyAverage) : Math.round(all.dailyAverage * 10) / 10, t("stats.dailyAverage"))}`)
        + renderDoneToday(state)
        + `<div class="sys-panel panel-pad" style="margin-top:16px;">
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
        { value: st.currentStreak, unit: "", label: t("stats.currentStreak"), delta: "" },
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

  // ---------- Log page ----------
  function renderInboxSection(ui) {
    if (!ui.cloudUser || !ui.inbox.length) return "";
    const unread = ui.inbox.filter((m) => !m.read).length;
    const rows = ui.inbox.map((m) => `
      <div class="log-entry ${m.read ? "" : "unread"}" ${m.read ? "" : `data-action="mark-inbox-read" data-id="${m.id}" style="cursor:pointer;"`}>
        <span class="log-mark ${m.read ? "" : "up"}">${icon("chevronRight", 13)}</span>
        <span class="text">${escapeHtml(m.text)}${m.amount ? ` <b style="color:${m.amount > 0 ? "var(--gold-text)" : "var(--rust-text)"}">${t("log.expChange", { sign: m.amount > 0 ? "+" : "", n: escapeHtml(m.amount) })}</b>` : ""}</span>
        ${!m.read ? `<span class="date" style="color:var(--gold-text);">${t("log.new")}</span>` : ""}
      </div>`).join("");
    return `
      <div class="sys-panel panel-pad" style="margin-bottom:16px;">
        <div class="friends-rank-head" style="margin-bottom:6px;">
          <span class="eyebrow" style="margin:0;">${t("log.fromSystem")}${unread ? " · " + unread : ""}</span>
          ${unread ? `<button class="link-btn" data-action="inbox-read-all">${t("log.markAllRead")}</button>` : ""}
        </div>
        <div>${rows}</div>
      </div>`;
  }

  // ---------- Leaderboard page ----------
  //
  // Reads leaderboard/{uid} — the server-written public projection of each
  // user document (see functions/index.js). Position is computed here rather
  // than stored anywhere: one player overtaking another moves two positions
  // while changing only one document, so a stored rank would be wrong the
  // instant it was written.
  //
  // Equal totals share a position (1, 2, 2, 4) — the same scheme cloud.js
  // uses to work out a position for someone below the fetched page, so the
  // row pinned at the bottom carries a number consistent with the list above.
  const MEDALS = ["gold", "silver", "bronze"];

  function renderLeaderboardRow(r, position, isMe, ui, score) {
    const medal = position != null && position <= 3 ? MEDALS[position - 1] : "";
    // Rank and level are read back out of the one number the server vouches
    // for, rather than shown as the client reported them alongside it — so a
    // row cannot claim a standing its EXP doesn't support.
    const standing = SYS.expToStanding(r.totalExp);
    // Where this row was when the week's snapshot was taken (snapshotRanks in
    // functions/index.js): up, down, or new to the board.
    const was = Number(r.lastRank) || 0;
    const move = was && position ? was - position : 0;
    const moveTag = !was
      ? ""
      : move === 0
        ? `<span class="lb-move same" title="${t("lb.moveSame")}">•</span>`
        : `<span class="lb-move ${move > 0 ? "up" : "down"}" title="${t(move > 0 ? "lb.moveUp" : "lb.moveDown", { n: Math.abs(move) })}">${move > 0 ? "▲" : "▼"}${Math.abs(move)}</span>`;
    return `
      <button class="lb-row lb-row-btn ${isMe ? "me" : ""} ${medal ? "medal-" + medal : ""}" data-action="open-profile" data-uid="${escapeHtml(r.uid)}">
        <span class="lb-pos ${medal}">${position == null ? "—" : escapeHtml(position)}</span>
        <span class="lb-face" aria-hidden="true">${escapeHtml(avatarOf(ui || {}, r.uid))}</span>
        <span class="lb-player">
          <span class="lb-name">${escapeHtml(r.displayName || "—")}${isMe ? ` <span class="lb-you-tag">${t("lb.you")}</span>` : ""}${moveTag}</span>
          <span class="lb-meta">${t("lb.playerLine", { rank: escapeHtml(standing.rank), level: escapeHtml(standing.level) })}</span>
        </span>
        <span class="lb-quests">${escapeHtml(r.questsCompleted)}</span>
        <span class="lb-total">${escapeHtml(score == null ? r.totalExp : score)}</span>
      </button>`;
  }

  // The top three, given the room they earn. The winner stands in the middle
  // and taller, the way a podium reads everywhere else.
  function renderPodium(rows, ui, mode) {
    // Two players is still a podium; one is not.
    if (rows.length < 2) return "";
    const order = rows.length >= 3 ? [1, 0, 2] : [1, 0];
    const cells = order.map((i) => {
      const r = rows[i];
      const score = mode === "week" ? (Number(r.weekExp) || 0) : r.totalExp;
      return `
        <button class="pod ${MEDALS[i]} ${i === 0 ? "first" : ""}" data-action="open-profile" data-uid="${escapeHtml(r.uid)}">
          <span class="pod-face">${escapeHtml(avatarOf(ui, r.uid))}</span>
          <span class="pod-name">${escapeHtml(r.displayName || "—")}</span>
          <span class="pod-exp">${escapeHtml(score)}</span>
          <span class="pod-step">${i + 1}</span>
        </button>`;
    }).join("");
    return `<div class="podium ${rows.length < 3 ? "podium-2" : ""}">${cells}</div>`;
  }

  function renderLeaderboardPage(state, ui) {
    const header = renderPageHead("leaderboard", "lb.eyebrow", "lb.title")
      + (ui.cloudUser && ui.leaderboardUnderReview
        ? `<div class="sys-panel panel-pad lb-review">${t("lb.underReview")}</div>`
        : "");

    // Being ranked at all requires an account, so there is nothing useful to
    // show a signed-out visitor — and nothing to compare them against.
    if (!ui.cloudUser) {
      return header + `
        <div class="sys-panel panel-pad">
          <div class="empty-hero">
            ${pageIcon("leaderboard")}
            <div class="empty-hero-text">${t("lb.signedOut")}</div>
            <button class="btn btn-primary" data-action="open-settings">${t("account.signIn")}</button>
          </div>
        </div>`;
    }

    const rows = ui.leaderboard || [];
    const myUid = ui.cloudUser.uid;

    const mode = ui.lbMode === "week" ? "week" : "total";
    const scoreOf = (r) => (mode === "week" ? Number(r.weekExp) || 0 : Number(r.totalExp) || 0);
    let running = 0, prevTotal = null;
    const positions = rows.map((r, i) => {
      if (scoreOf(r) !== prevTotal) { running = i + 1; prevTotal = scoreOf(r); }
      return running;
    });
    const meIndex = rows.findIndex((r) => r.uid === myUid);

    let body;
    if (ui.leaderboardError) {
      body = `<div class="toast-error">${escapeHtml(ui.leaderboardError)}</div>`;
    } else if (ui.leaderboardBusy && !rows.length) {
      body = `<div class="empty-note">${t("lb.loading")}</div>`;
    } else if (!rows.length) {
      body = `<div class="empty-note">${t(mode === "week" ? "lb.emptyWeek" : "lb.empty")}</div>`;
    } else {
      // Deep in the list your own row is off-screen for the whole scroll, so
      // it sticks to the bottom of the board while the board is in view.
      const sticky = meIndex >= 10
        ? `<div class="lb-sticky">${renderLeaderboardRow(rows[meIndex], positions[meIndex], true, ui, mode === "week" ? scoreOf(rows[meIndex]) : null)}</div>`
        : "";
      body = renderPodium(rows, ui, mode) + `
        <div class="lb-row lb-head">
          <span class="lb-pos">#</span>
          <span class="lb-face" aria-hidden="true"></span>
          <span class="lb-player">${t("lb.colPlayer")}</span>
          <span class="lb-quests">${t("lb.colQuests")}</span>
          <span class="lb-total">${t(mode === "week" ? "lb.colWeek" : "lb.colTotal")}</span>
        </div>` + rows.map((r, i) => renderLeaderboardRow(r, positions[i], r.uid === myUid, ui, mode === "week" ? scoreOf(r) : null)).join("") + sticky;
    }

    // Three different reasons someone can be missing from the list, and they
    // need three different answers — "you're not here" with no explanation is
    // the one outcome a ranking page must never produce.
    let selfBlock = "";
    // The board shows the name that was reserved, which is not always the one
    // on this device. Saying so beats letting someone hunt for a row that is
    // there under another name.
    const boardName = meIndex >= 0 ? (rows[meIndex].displayName || "") : (ui.leaderboardMine && ui.leaderboardMine.displayName) || "";
    const myName = (state.player && state.player.name) || "";
    const nameNote = boardName && myName && boardName !== myName
      ? `<div class="sys-panel panel-pad" style="margin-top:16px;"><div class="form-hint">${t("lb.shownAs", { name: escapeHtml(boardName) })}</div></div>`
      : "";
    if (!ui.nameClaimed && meIndex === -1 && !boardName) {
      selfBlock = `<div class="sys-panel panel-pad" style="margin-top:16px;"><div class="form-hint" style="color:var(--gold-text);">${t("lb.unclaimedName")}</div></div>`;
    } else if (mode === "week" && meIndex === -1 && ui.leaderboardMine && !ui.leaderboardBusy && !ui.leaderboardError) {
      // The week's board only holds this week's scorers; someone with nothing
      // yet is not missing, they are on zero.
      selfBlock = `<div class="sys-panel panel-pad" style="margin-top:16px;">
          <div class="form-hint" style="margin-bottom:10px;">${t("lb.noWeekExp")}</div>
          ${renderLeaderboardRow(ui.leaderboardMine, null, true, ui, 0)}
        </div>`;
    } else if (rows.length && meIndex === -1 && !ui.leaderboardBusy && !ui.leaderboardError && mode !== "week") {
      selfBlock = ui.leaderboardMine
        ? `<div class="sys-panel panel-pad" style="margin-top:16px;">
             <div class="form-hint" style="margin-bottom:10px;">${t("lb.outsideTop", { n: rows.length })}</div>
             ${renderLeaderboardRow(ui.leaderboardMine, ui.leaderboardMyPosition, true, ui)}
             ${ui.leaderboardMyPosition == null ? `<div class="form-hint" style="margin-top:8px;">${t("lb.positionUnknown")}</div>` : ""}
           </div>`
        : `<div class="sys-panel panel-pad" style="margin-top:16px;"><div class="form-hint">${t("lb.pending")}</div></div>`;
    }

    const tabs = `
        <div class="planner-tabs lb-tabs">
          <button class="chip filter-chip ${ui.lbTab === "friends" ? "" : "active"}" data-action="lb-tab" data-tab="world" aria-pressed="${ui.lbTab !== "friends"}">${t("friends.world")}</button>
          <button class="chip filter-chip ${ui.lbTab === "friends" ? "active" : ""}" data-action="lb-tab" data-tab="friends" aria-pressed="${ui.lbTab === "friends"}">${t("friends.tab")}${ui.friendRequestsIn ? ` <span class="banked-tag" style="display:inline-flex;margin-inline-start:4px;">${ui.friendRequestsIn}</span>` : ""}</button>
        </div>`;
    if (ui.lbTab === "friends") {
      return header + `<div class="sys-panel panel-pad">${tabs}${renderFriendsRanking(state, ui)}</div>`;
    }
    return header + `
      <div class="sys-panel panel-pad">
        ${tabs}
        <div class="planner-tabs lb-modes">
          <button class="chip filter-chip ${mode === "total" ? "active" : ""}" data-action="lb-mode" data-mode="total" aria-pressed="${mode === "total"}">${t("lb.modeAll")}</button>
          <button class="chip filter-chip ${mode === "week" ? "active" : ""}" data-action="lb-mode" data-mode="week" aria-pressed="${mode === "week"}">${t("lb.modeWeek")}</button>
        </div>
        <div class="lb-top">
          <span class="form-hint" style="margin:0;">${t(mode === "week" ? "lb.subtitleWeek" : "lb.subtitle")}</span>
          <button class="link-btn" data-action="refresh-leaderboard" ${ui.leaderboardBusy ? "disabled" : ""}>${t("lb.refresh")}</button>
        </div>
        ${body}
      </div>` + selfBlock + nameNote;
  }
  SYS.renderLeaderboardPage = renderLeaderboardPage;

  // The figures inside a line of the record, picked out of the sentence: the
  // level span and every "+N" it bought, so the eye lands on the numbers.
  function logText(text) {
    const safe = escapeHtml(String(text || ""));
    return safe
      .replace(/(\+\d+(?:\.\d+)?)/g, '<b class="log-plus">$1</b>')
      .replace(/(Level\s\d+\s→\s\d+)/g, '<b class="log-span">$1</b>')
      .replace(/(RANK (?:UP|DOWN)\s→\s[A-Z]-Rank)/g, '<b class="log-span">$1</b>');
  }

  const LOG_FILTERS = [
    { key: "all", tkey: "log.filterAll" },
    { key: "levels", tkey: "log.filterLevels" },
    { key: "ranks", tkey: "log.filterRanks" },
    { key: "system", tkey: "log.filterSystem" },
  ];

  // "Today" and "yesterday" by the same locale string the entries carry, so
  // no parsing of a date that was written for reading rather than for sorting.
  function dayHeading(dateText) {
    const today = new Date().toLocaleDateString();
    const yest = new Date(Date.now() - 86400000).toLocaleDateString();
    if (dateText === today) return t("log.today");
    if (dateText === yest) return t("log.yesterday");
    return dateText;
  }

  function renderLogPage(state, ui) {
    const filter = ui.logFilter || "all";
    const isRank = (e) => /^RANK /.test(String(e.text || ""));
    const all = state.log || [];
    const entries = all.filter((e) => filter === "all" ? true : filter === "ranks" ? isRank(e) : filter === "levels" ? !isRank(e) : false);

    // One heading per day rather than a date on every line.
    let lastDay = null;
    const list = entries.map((e) => {
      const m = logMark(e.text);
      const head = e.date !== lastDay ? `<div class="log-day">${escapeHtml(dayHeading(e.date))}</div>` : "";
      lastDay = e.date;
      return head + `
        <div class="log-entry">
          <span class="log-mark ${m.cls}">${icon(m.name, 13)}</span>
          <span class="text">${logText(e.text)}</span>
        </div>`;
    }).join("");

    const empty = all.length === 0
      ? `<div class="empty-hero">
           ${pageIcon("log")}
           <div class="empty-hero-text">${t("log.empty")}</div>
           <button class="btn btn-primary" data-action="nav" data-page="quests">${t("quests.new")}</button>
         </div>`
      : `<div class="empty-note">${t("log.emptyFilter")}</div>`;

    const chips = LOG_FILTERS.map((f) => `
      <button class="chip filter-chip ${filter === f.key ? "active" : ""}" data-action="log-filter" data-filter="${f.key}" aria-pressed="${filter === f.key}">${t(f.tkey)}</button>`).join("");

    return `
      ${renderPageHead("log", "log.eyebrow", "log.title")}
      ${filter === "system" || filter === "all" ? renderInboxSection(ui) : ""}
      <div class="sys-panel panel-pad">
        <div class="planner-tabs" style="margin-bottom:12px;">${chips}</div>
        ${filter === "system"
          ? (ui.cloudUser && ui.inbox.length ? "" : `<div class="empty-note">${t("log.noSystem")}</div>`)
          : (entries.length ? list : empty)}
      </div>`;
  }
  SYS.renderLogPage = renderLogPage;

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
            <span aria-hidden="true">${escapeHtml(SYS.taskIcon(h))}</span>
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
          <div class="planner-tabs">${tabs}</div>
          <button class="btn btn-outline btn-icon-inline" data-action="event-new">${icon("plus", 14)} ${t("planner.newEvent")}</button>
        </div>
        <div class="week-bar">
          <button class="wk-arrow" data-action="planner-shift-day" data-delta="-1" aria-label="${t("planner.previous")}">${icon("chevronLeft", 15)}</button>
          <div class="wk-title">${escapeHtml(plannerNavTitle(view, day))}</div>
          ${inToday ? "" : `<button class="wk-today" data-action="planner-today">${t("planner.today")}</button>`}
          <button class="wk-arrow" data-action="planner-shift-day" data-delta="1" aria-label="${t("planner.next")}">${icon("chevronRight", 15)}</button>
        </div>
        ${view === "day" ? renderPlannerDays(state, ui, day) : ""}`;
    const header = renderPageHead("planner", "planner.eyebrow", "planner.title");
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

  // ---------- Friends (functions/friends.js) ----------

  // The other person in a friendship document.
  function otherOf(f, me) { return (f.users || []).find((u) => u !== me); }

  // Where this account stands with `uid`: none | sent | received | friends.
  function friendStatus(ui, uid) {
    const me = ui.cloudUser && ui.cloudUser.uid;
    const f = (ui.friendships || []).find((x) => otherOf(x, me) === uid);
    if (!f) return "none";
    if (f.status === "accepted") return "friends";
    return f.from === me ? "sent" : "received";
  }
  SYS.friendStatus = friendStatus;

  function weekExpOf(row) {
    return row && row.weekKey === SYS.currentWeekKey() ? Number(row.weekExp) || 0 : 0;
  }

  function friendName(ui, uid) {
    const row = (ui.friendRows || {})[uid];
    return row && row.displayName ? row.displayName : "…";
  }

  function avatarOf(ui, uid) {
    const id = (ui.avatars || {})[uid];
    return (id && SYS.AVATARS[id]) || SYS.DEFAULT_AVATAR;
  }

  // One player as a row: avatar and name (opening the profile), their rank,
  // and whatever buttons belong on the right.
  function playerRow(ui, uid, name, row, actions) {
    const standing = row ? SYS.expToStanding(row.totalExp) : null;
    return `
      <div class="player-row">
        <button class="player-open" data-action="open-profile" data-uid="${escapeHtml(uid)}">
          <span class="player-avatar" aria-hidden="true">${escapeHtml(avatarOf(ui, uid))}</span>
          <span class="player-text">
            <span class="player-name">${escapeHtml(name || "…")}</span>
            ${standing ? `<span class="lb-meta">${t("lb.playerLine", { rank: escapeHtml(standing.rank), level: escapeHtml(standing.level) })}</span>` : ""}
          </span>
        </button>
        <div class="player-actions">${actions}</div>
      </div>`;
  }

  function friendActions(ui, uid) {
    const st = friendStatus(ui, uid);
    if (st === "friends") return `<span class="friend-tag">${icon("check", 12)} ${t("friends.areFriends")}</span>`;
    if (st === "sent") return `<button class="btn btn-outline btn-sm" data-action="friend-remove" data-uid="${escapeHtml(uid)}">${t("friends.requested")}</button>`;
    if (st === "received") return `<button class="btn btn-primary btn-sm" data-action="friend-respond" data-uid="${escapeHtml(uid)}" data-accept="1">${t("friends.accept")}</button>`;
    return `<button class="btn btn-primary btn-sm" data-action="friend-add-uid" data-uid="${escapeHtml(uid)}" ${ui.friendBusy ? "disabled" : ""}>${icon("plus", 12)} ${t("friends.add")}</button>`;
  }

  // The friends ranking, as the Friends tab of the Ranking page shows it.
  function renderFriendsRanking(state, ui) {
    const me = ui.cloudUser.uid;
    const friends = (ui.friendships || []).filter((f) => f.status === "accepted").map((f) => otherOf(f, me));
    const week = ui.friendsWeek;
    const score = (uid) => {
      const row = uid === me ? ui.myRow : (ui.friendRows || {})[uid];
      return week ? weekExpOf(row) : (row ? Number(row.totalExp) || 0 : 0);
    };
    const ranked = friends.concat(ui.myRow ? [me] : []).sort((a, b) => score(b) - score(a));
    const rows = ranked.map((uid, i) => {
      const row = uid === me ? ui.myRow : (ui.friendRows || {})[uid];
      const standing = row ? SYS.expToStanding(row.totalExp) : null;
      return `
        <button class="lb-row lb-row-btn ${uid === me ? "me" : ""}" data-action="open-profile" data-uid="${escapeHtml(uid)}">
          <span class="lb-pos ${i < 3 ? MEDALS[i] : ""}">${i + 1}</span>
          <span class="lb-face" aria-hidden="true">${escapeHtml(avatarOf(ui, uid))}</span>
          <span class="lb-player">
            <span class="lb-name">${escapeHtml(uid === me ? (row && row.displayName) || state.player.name : friendName(ui, uid))}${uid === me ? ` <span class="lb-you-tag">${t("lb.you")}</span>` : ""}</span>
            ${standing ? `<span class="lb-meta">${t("lb.playerLine", { rank: escapeHtml(standing.rank), level: escapeHtml(standing.level) })}</span>` : ""}
          </span>
          <span class="lb-quests"></span>
          <span class="lb-total">${escapeHtml(score(uid))}</span>
        </button>`;
    }).join("");
    return `
      <div class="friends-rank-head">
        <span class="planner-tabs">
          <button class="chip filter-chip ${week ? "" : "active"}" data-action="friends-view" data-week="0" aria-pressed="${!week}">${t("friends.allTime")}</button>
          <button class="chip filter-chip ${week ? "active" : ""}" data-action="friends-view" data-week="1" aria-pressed="${!!week}">${t("friends.thisWeek")}</button>
        </span>
        <button class="link-btn" data-action="nav" data-page="friends">${t("friends.manage")}</button>
      </div>
      ${friends.length ? rows : `<div class="empty-note">${t("friends.noneRanking")}</div>`}`;
  }

  // The Friends section: find people, answer requests, the friends, and — at
  // the side on a wide screen, at the foot on a phone — the blocked list.
  // How the two of you have done against each other, from the races both
  // sides can see. Kept out of the profile's own record, which is everybody.
  function headToHead(ui, uid) {
    const me = ui.cloudUser && ui.cloudUser.uid;
    let won = 0, lost = 0, tied = 0;
    (ui.races || []).forEach((r) => {
      if (r.status !== "done" || !r.users || r.users.indexOf(uid) < 0) return;
      if (r.winner == null) tied++;
      else if (r.winner === me) won++;
      else lost++;
    });
    return { won, lost, tied, any: won + lost + tied > 0 };
  }

  // One friend, with everything worth knowing before pressing anything: who
  // they are, where they stand, this week between you, and your record.
  function friendCard(state, ui, uid) {
    const me = ui.cloudUser.uid;
    const row = (ui.friendRows || {})[uid];
    const standing = row ? SYS.expToStanding(row.totalExp) : null;
    const theirWeek = weekExpOf(row);
    const myWeek = weekExpOf(ui.myRow);
    const h = headToHead(ui, uid);
    const racing = (ui.races || []).some((r) => r.status === "active" && r.users && r.users.indexOf(uid) >= 0);
    return `
      <div class="friend-card">
        <button class="player-open" data-action="open-profile" data-uid="${escapeHtml(uid)}">
          <span class="player-avatar" aria-hidden="true">${escapeHtml(avatarOf(ui, uid))}</span>
          <span class="player-text">
            <span class="player-name">${escapeHtml(friendName(ui, uid))}</span>
            ${standing ? `<span class="lb-meta">${t("lb.playerLine", { rank: escapeHtml(standing.rank), level: escapeHtml(standing.level) })} · ${escapeHtml(row.totalExp)} xp</span>` : ""}
          </span>
        </button>
        <div class="friend-facts">
          ${row ? `<span class="friend-fact ${theirWeek > myWeek ? "behind" : theirWeek < myWeek ? "ahead" : ""}">${t("friends.weekLine", { mine: myWeek, theirs: theirWeek })}</span>` : ""}
          ${h.any ? `<span class="friend-fact">${t("friends.record", { w: h.won, l: h.lost })}${h.tied ? " · " + t("friends.ties", { n: h.tied }) : ""}</span>` : ""}
          ${racing ? `<span class="friend-fact racing">${icon("zap", 10)} ${t("friends.racingNow")}</span>` : ""}
        </div>
        <div class="player-actions">
          <button class="btn btn-primary btn-sm" data-action="race-open-form" data-uid="${escapeHtml(uid)}" ${racing ? "disabled" : ""}>${t("races.challengeShort")}</button>
          <button class="btn btn-outline btn-sm" data-action="open-compare" data-uid="${escapeHtml(uid)}">${t("friends.compare")}</button>
        </div>
      </div>`;
  }

  function renderFriendsPage(state, ui) {
    const header = renderPageHead("friends", "friends.eyebrow", "friends.title");
    if (!ui.cloudUser) {
      return header + `
        <div class="sys-panel panel-pad">
          <div class="empty-hero">
            ${pageIcon("friends")}
            <div class="empty-hero-text">${t("friends.signedOut")}</div>
            <button class="btn btn-primary" data-action="open-settings">${t("account.signIn")}</button>
          </div>
        </div>`;
    }
    const me = ui.cloudUser.uid;
    const list = ui.friendships || [];
    const received = list.filter((f) => f.status === "pending" && f.to === me).map((f) => otherOf(f, me));
    const sent = list.filter((f) => f.status === "pending" && f.from === me).map((f) => otherOf(f, me));
    const byName = (a, b) => friendName(ui, a).localeCompare(friendName(ui, b));
    const expOf = (uid) => { const r = (ui.friendRows || {})[uid]; return r ? Number(r.totalExp) || 0 : -1; };
    const sortMode = ui.friendSort === "name" ? "name" : "exp";
    const friends = list.filter((f) => f.status === "accepted").map((f) => otherOf(f, me))
      .sort(sortMode === "name" ? byName : (a, b) => expOf(b) - expOf(a) || byName(a, b));
    const rowOf = (uid) => (ui.friendRows || {})[uid] || (ui.searchRows || {})[uid];

    // Anything waiting on a decision comes first; the rest of the page is
    // there whenever you want it, this is not.
    const requests = received.length || sent.length ? `
      <div class="sys-panel panel-pad">
        ${received.length ? `<div class="planner-section" style="margin-top:0;">${t("friends.requests")} · ${received.length}</div>
          ${received.map((uid) => playerRow(ui, uid, friendName(ui, uid), rowOf(uid), `
            <button class="btn btn-primary btn-sm" data-action="friend-respond" data-uid="${escapeHtml(uid)}" data-accept="1">${t("friends.accept")}</button>
            <button class="btn btn-outline btn-sm" data-action="friend-respond" data-uid="${escapeHtml(uid)}" data-accept="0">${t("friends.decline")}</button>`)).join("")}` : ""}
        ${sent.length ? `<div class="planner-section" ${received.length ? "" : `style="margin-top:0;"`}>${t("friends.sent")} · ${sent.length}</div>
          ${sent.map((uid) => playerRow(ui, uid, friendName(ui, uid), rowOf(uid), `
            <button class="btn btn-ghost btn-sm" data-action="friend-remove" data-uid="${escapeHtml(uid)}">${t("friends.cancel")}</button>`)).join("")}` : ""}
      </div>` : "";

    const results = ui.friendResults;
    const search = `
      <div class="sys-panel panel-pad">
        <div class="friend-add">
          <input class="field-input" id="friend-search" data-bind="friendSearch" value="${escapeHtml(ui.friendSearch || "")}" placeholder="${t("friends.searchPlaceholder")}" aria-label="${t("friends.searchPlaceholder")}" autocomplete="off" />
          <button class="btn btn-primary" data-action="friend-search" ${ui.friendSearchBusy ? "disabled" : ""}>${t("friends.search")}</button>
        </div>
        ${results ? (results.length
          ? `<div class="search-results">${results.map((r) => playerRow(ui, r.uid, r.name, rowOf(r.uid), friendActions(ui, r.uid))).join("")}</div>`
          : `<div class="search-none">
               <div class="empty-note" style="padding:8px 4px;">${t("friends.noResults")}</div>
               <button class="btn btn-outline btn-sm btn-icon-inline" data-action="friend-invite" ${ui.inviteBusy ? "disabled" : ""}>${icon("upload", 12)} ${t("friends.inviteInstead")}</button>
             </div>`) : ""}
        <div class="btn-row" style="margin-top:12px;flex-wrap:wrap;">
          <button class="btn btn-outline btn-icon-inline" data-action="friend-invite" ${ui.inviteBusy ? "disabled" : ""}>${icon("plus", 13)} ${t("friends.inviteLink")}</button>
        </div>
        ${ui.inviteLink ? `<div class="invite-box">
            <div class="invite-row">
              <input class="field-input" readonly value="${escapeHtml(ui.inviteLink)}" aria-label="${t("friends.inviteLink")}" />
              <button class="btn btn-primary btn-sm" data-action="copy-invite">${t("friends.copy")}</button>
            </div>
            <div class="form-hint">${t("friends.inviteHint")} · ${t("friends.inviteDays")}</div>
          </div>` : ""}
      </div>`;

    const friendList = `
      <div class="sys-panel panel-pad">
        <div class="friends-rank-head" style="margin-bottom:4px;">
          <span class="planner-section" style="margin:0;">${t("friends.list")} · ${friends.length}</span>
          ${friends.length > 1 ? `<span class="planner-tabs">
            <button class="chip filter-chip ${sortMode === "exp" ? "active" : ""}" data-action="friend-sort" data-sort="exp" aria-pressed="${sortMode === "exp"}">${t("friends.sortExp")}</button>
            <button class="chip filter-chip ${sortMode === "name" ? "active" : ""}" data-action="friend-sort" data-sort="name" aria-pressed="${sortMode === "name"}">${t("friends.sortName")}</button>
          </span>` : ""}
        </div>
        ${friends.length
          ? friends.map((uid) => friendCard(state, ui, uid)).join("")
          : `<div class="empty-hero">
               ${pageIcon("friends")}
               <div class="empty-hero-text">${t("friends.none")}</div>
               <div class="btn-row" style="justify-content:center;">
                 <button class="btn btn-primary btn-icon-inline" data-action="friend-focus-search">${icon("users", 13)} ${t("friends.findPlayer")}</button>
                 <button class="btn btn-outline btn-icon-inline" data-action="friend-invite" ${ui.inviteBusy ? "disabled" : ""}>${icon("upload", 13)} ${t("friends.inviteLink")}</button>
               </div>
             </div>`}
      </div>`;

    const blocked = `<div class="sys-panel panel-pad">${renderBlockedList(ui)}</div>`;
    return header + `
      <div class="friends-layout">
        <div class="friends-main">${requests}${search}${renderRacesPanel(state, ui)}${friendList}
          <details class="blocked-fold">
            <summary>${t("blocks.title")}${(ui.blockedList || []).length ? " · " + (ui.blockedList || []).length : ""}</summary>
            ${blocked}
          </details>
        </div>
        <aside class="friends-side">${blocked}</aside>
      </div>`;
  }
  SYS.renderFriendsPage = renderFriendsPage;

  // ---------- Weekly races (functions/races.js) ----------

  function metricLabel(state, metric) {
    if (metric === "total") return t("races.total");
    const type = (state.intTypes || []).find((x) => x.key === metric);
    if (!type) return metric;
    return SYS.currentLanguage && SYS.currentLanguage() === "ar" && type.ar ? type.ar : type.name;
  }

  function timeLeft(endMs) {
    const ms = Math.max(0, endMs - Date.now());
    const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24;
    return d > 0 ? t("races.leftDays", { d, h }) : t("races.leftHours", { h: Math.max(1, h) });
  }

  function renderRacesPanel(state, ui) {
    const me = ui.cloudUser.uid;
    const races = ui.races || [];
    const other = (r) => r.users.find((u) => u !== me);
    const incoming = races.filter((r) => r.status === "pending" && r.opponent === me);
    const outgoing = races.filter((r) => r.status === "pending" && r.challenger === me);
    const active = races.filter((r) => r.status === "active");
    const done = races.filter((r) => r.status === "done")
      .sort((a, b) => (b.endAt && b.endAt.toMillis ? b.endAt.toMillis() : 0) - (a.endAt && a.endAt.toMillis ? a.endAt.toMillis() : 0))
      .slice(0, 5);
    if (!races.some((r) => ["pending", "active", "done"].indexOf(r.status) >= 0)) {
      return `
        <div class="sys-panel panel-pad">
          <div class="planner-section" style="margin-top:0;">${t("races.title")}</div>
          <div class="form-hint">${t("races.empty")}</div>
        </div>`;
    }
    const activeRows = active.map((r) => {
      const them = other(r);
      const s = (ui.raceScores || {})[r.id];
      const mine = s ? Number(s[me]) || 0 : null, theirs = s ? Number(s[them]) || 0 : null;
      const share = s && (mine + theirs) > 0 ? Math.round(Math.max(0, mine) / Math.max(1, Math.max(0, mine) + Math.max(0, theirs)) * 100) : 50;
      return `
        <div class="race-card">
          <div class="race-head">
            <button class="friend-name" data-action="open-profile" data-uid="${escapeHtml(them)}">${t("races.vs", { name: escapeHtml(friendName(ui, them)) })}</button>
            <span class="race-metric">${escapeHtml(metricLabel(state, r.metric))}</span>
          </div>
          <div class="race-score">
            <span class="race-me">${t("lb.you")} <b>${mine == null ? "…" : escapeHtml(mine)}</b></span>
            <span class="race-them"><b>${theirs == null ? "…" : escapeHtml(theirs)}</b> ${escapeHtml(friendName(ui, them))}</span>
          </div>
          <div class="race-bar"><div class="race-bar-me" style="width:${share}%;"></div></div>
          <div class="race-foot">${r.endAt && r.endAt.toMillis ? escapeHtml(timeLeft(r.endAt.toMillis())) : ""}</div>
        </div>`;
    }).join("");
    const row = (r, text, actions) => `
      <div class="player-row">
        <div class="race-line"><span>${text}</span><span class="race-metric">${escapeHtml(metricLabel(state, r.metric))}</span></div>
        <div class="player-actions">${actions}</div>
      </div>`;
    return `
      <div class="sys-panel panel-pad">
        <div class="friends-rank-head" style="margin-bottom:6px;">
          <span class="planner-section" style="margin:0;">${t("races.title")}</span>
          ${active.length ? `<button class="link-btn" data-action="race-refresh" ${ui.raceScoresBusy ? "disabled" : ""}>${t("lb.refresh")}</button>` : ""}
        </div>
        ${incoming.map((r) => row(r, t("races.challengedYou", { name: escapeHtml(friendName(ui, r.challenger)) }), `
          <button class="btn btn-primary btn-sm" data-action="race-respond" data-id="${escapeHtml(r.id)}" data-accept="1">${t("races.accept")}</button>
          <button class="btn btn-outline btn-sm" data-action="race-respond" data-id="${escapeHtml(r.id)}" data-accept="0">${t("friends.decline")}</button>`)).join("")}
        ${activeRows}
        ${outgoing.map((r) => row(r, t("races.waiting", { name: escapeHtml(friendName(ui, r.opponent)) }), `
          <button class="btn btn-ghost btn-sm" data-action="race-cancel" data-id="${escapeHtml(r.id)}">${t("friends.cancel")}</button>`)).join("")}
        ${done.length ? `<div class="planner-section">${t("races.recent")}</div>` : ""}
        ${done.map((r) => {
          const them = other(r);
          const sc = r.scores || {};
          const result = r.winner == null ? t("races.tie") : r.winner === me ? t("races.won") : t("races.lost");
          return row(r, `<b class="race-result ${r.winner == null ? "" : r.winner === me ? "won" : "lost"}">${result}</b> ${t("races.vs", { name: escapeHtml(friendName(ui, them)) })} · ${escapeHtml(Number(sc[me]) || 0)} – ${escapeHtml(Number(sc[them]) || 0)}`, "");
        }).join("")}
      </div>`;
  }

  function renderRaceForm(state, ui) {
    const f = ui.raceForm;
    if (!f) return "";
    const close = `<button class="wk-arrow" data-action="close-modal" aria-label="${t("event.close")}">${icon("x", 15)}</button>`;
    const metrics = ["total"].concat((state.intTypes || []).map((x) => x.key));
    return `
      <div class="modal-backdrop" data-action="close-modal-backdrop">
        <div class="sys-panel modal-box profile-box" data-stop-close="1" role="dialog" aria-label="${t("races.challenge")}">
          <div class="day-head"><span class="day-head-pad"></span><div class="time-title">${t("races.challenge")}</div>${close}</div>
          <div class="carry-body">${t("races.formBody", { name: escapeHtml(friendName(ui, f.uid)) })}</div>
          <div class="field-label" style="margin-top:12px;">${t("races.on")}</div>
          <div class="planner-tabs race-metrics">
            ${metrics.map((m) => `<button type="button" class="chip filter-chip ${f.metric === m ? "active" : ""}" data-action="race-metric" data-metric="${escapeHtml(m)}" aria-pressed="${f.metric === m}">${escapeHtml(metricLabel(state, m))}</button>`).join("")}
          </div>
          ${f.metric !== "total" ? `<div class="form-hint" style="line-height:1.5;">${t("races.categoryHint")}</div>` : ""}
          <div class="btn-row" style="margin-top:16px;">
            <button class="btn btn-primary" data-action="race-send" ${f.busy ? "disabled" : ""}>${t("races.send")}</button>
            <button class="btn btn-outline" data-action="close-modal">${t("event.cancel")}</button>
          </div>
        </div>
      </div>`;
  }

  // Two intelligence maps on one chart, and who is ahead in each.
  function renderCompareModal(state, ui) {
    const c = ui.compare;
    const close = `<button class="wk-arrow" data-action="close-modal" aria-label="${t("event.close")}">${icon("x", 15)}</button>`;
    const head = `<div class="day-head"><span class="day-head-pad"></span><div class="time-title">${t("friends.compare")}</div>${close}</div>`;
    const shell = (inner) => `
      <div class="modal-backdrop" data-action="close-modal-backdrop">
        <div class="sys-panel modal-box profile-box" data-stop-close="1" role="dialog" aria-label="${t("friends.compare")}">${head}${inner}</div>
      </div>`;
    if (!c || !c.them) return shell(c && c.error ? `<div class="toast-error">${escapeHtml(c.error)}</div>` : `<div class="empty-note">${t("lb.loading")}</div>`);
    if (c.them.blockedBy) return shell(`<div class="empty-note blocked-note">${t("friends.blockedBy", { name: escapeHtml((c.them.row && c.them.row.displayName) || "—") })}</div>`);
    const mine = (c.me && c.me.profile && c.me.profile.categories) || [];
    const theirs = (c.them.profile && c.them.profile.categories) || [];
    const keys = mine.map((x) => x.key).filter((k) => theirs.some((y) => y.key === k));
    if (keys.length < 3) return shell(`<div class="empty-note">${t("friends.compareEmpty")}</div>`);
    const val = (list, k) => Number((list.find((x) => x.key === k) || {}).avg) || 0;
    const short = (k) => (mine.find((x) => x.key === k) || {}).short || k;
    const size = 260, cx = 130, cy = 130, R = 90, n = keys.length;
    const maxVal = Math.max(5, ...keys.map((k) => Math.max(val(mine, k), val(theirs, k)))) + 3;
    const ang = (i) => -Math.PI / 2 + i * (2 * Math.PI / n);
    const pts = (list) => keys.map((k, i) => { const r = R * Math.min(1, val(list, k) / maxVal); return (cx + r * Math.cos(ang(i))).toFixed(1) + "," + (cy + r * Math.sin(ang(i))).toFixed(1); }).join(" ");
    let svg = `<svg viewBox="0 0 ${size} ${size}" width="100%" height="100%" role="img" aria-label="${t("friends.compare")}">`;
    for (let ring = 1; ring <= 4; ring++) {
      svg += `<polygon fill="none" stroke="var(--border)" stroke-width="1" points="${keys.map((k, i) => (cx + R * ring / 4 * Math.cos(ang(i))).toFixed(1) + "," + (cy + R * ring / 4 * Math.sin(ang(i))).toFixed(1)).join(" ")}"/>`;
    }
    keys.forEach((k, i) => {
      svg += `<text x="${(cx + (R + 18) * Math.cos(ang(i))).toFixed(1)}" y="${(cy + (R + 18) * Math.sin(ang(i))).toFixed(1)}" font-family="IBM Plex Mono, monospace" font-size="10.5" style="fill:var(--dim)" text-anchor="middle" dominant-baseline="middle">${escapeHtml(short(k))}</text>`;
    });
    svg += `<polygon fill="var(--rust-soft, rgba(180,84,74,.18))" stroke="var(--rust)" stroke-width="2" points="${pts(theirs)}"/>`;
    svg += `<polygon fill="var(--gold-soft)" stroke="var(--gold)" stroke-width="2" points="${pts(mine)}"/></svg>`;
    const myName = (c.me && c.me.row && c.me.row.displayName) || state.player.name;
    const theirName = (c.them.row && c.them.row.displayName) || "—";
    const rows = keys.map((k) => {
      const a = val(mine, k), b = val(theirs, k);
      return `<div class="cmp-row"><span class="cmp-cat">${escapeHtml(short(k))}</span><span class="cmp-val ${a > b ? "win" : ""}">${a}</span><span class="cmp-val ${b > a ? "win them" : ""}">${b}</span></div>`;
    }).join("");
    return shell(`
      <div class="cmp-legend"><span class="cmp-dot me"></span>${escapeHtml(myName)} <span class="cmp-dot them"></span>${escapeHtml(theirName)}</div>
      <div class="profile-radar">${svg}</div>
      <div class="cmp-table">
        <div class="cmp-row cmp-head"><span class="cmp-cat"></span><span class="cmp-val">${escapeHtml(myName)}</span><span class="cmp-val">${escapeHtml(theirName)}</span></div>
        ${rows}
      </div>`);
  }

  // ---------- Public profile ----------
  //
  // Two public documents read together (see functions/profile.js): the
  // ranking row for the name and the journal's EXP, and profiles/{uid} for
  // the avatar, bio, intelligences and join date.
  function profileAvatar(id) {
    return (id && SYS.AVATARS[id]) || SYS.DEFAULT_AVATAR;
  }

  function renderProfileModal(state, ui) {
    const uid = ui.profileUid;
    if (!uid) return "";
    const me = !!ui.cloudUser && ui.cloudUser.uid === uid;
    const data = ui.profile;
    const close = `<button class="wk-arrow" data-action="close-modal" aria-label="${t("event.close")}">${icon("x", 15)}</button>`;
    const shell = (inner) => `
      <div class="modal-backdrop" data-action="close-modal-backdrop">
        <div class="sys-panel modal-box profile-box" data-stop-close="1" role="dialog" aria-label="${t("profile.title")}">
          ${inner}
        </div>
      </div>`;
    if (ui.profileError) return shell(`<div class="day-head"><span class="day-head-pad"></span><div class="time-title">${t("profile.title")}</div>${close}</div><div class="toast-error">${escapeHtml(ui.profileError)}</div>`);
    if (!data) return shell(`<div class="day-head"><span class="day-head-pad"></span><div class="time-title">${t("profile.title")}</div>${close}</div><div class="empty-note">${t("lb.loading")}</div>`);

    const p = data.profile || {};
    const row = data.row;
    if (data.blockedBy) {
      return shell(`<div class="day-head"><span class="day-head-pad"></span><div class="time-title">${t("profile.title")}</div>${close}</div>
        <div class="empty-note blocked-note">${t("friends.blockedBy", { name: escapeHtml((row && row.displayName) || "—") })}</div>`);
    }
    const standing = row ? SYS.expToStanding(row.totalExp) : null;
    const edit = me && ui.profileEdit;
    const report = !me && ui.profileReport;
    const blocked = !me && ui.blocks && ui.blocks.has(uid);

    const cats = Array.isArray(p.categories) ? p.categories : [];
    const radar = cats.length >= 3
      ? SYS.buildRadarSVG(cats.map((c) => ({ key: c.key, short: c.short })), Object.fromEntries(cats.map((c) => [c.key, { traits: [{ level: Number(c.avg) || 0 }] }])))
      : "";
    const traitName = (x) => (SYS.currentLanguage && SYS.currentLanguage() === "ar" && x.ar) ? x.ar : x.name;
    const joined = p.joinedAt && p.joinedAt.toDate ? p.joinedAt.toDate().toLocaleDateString(dateLocale(), { month: "long", year: "numeric" }) : null;

    const head = `
      <div class="profile-head">
        <div class="profile-avatar" aria-hidden="true">${escapeHtml(profileAvatar(edit ? ui.profileEdit.avatar : p.avatar))}</div>
        <div class="profile-id">
          <div class="profile-name">${escapeHtml(row ? row.displayName : (me ? state.player.name : "—"))}${me ? ` <span class="lb-you-tag">${t("lb.you")}</span>` : ""}</div>
          ${standing ? `<div class="profile-sub">${escapeHtml(t("lb.playerLine", { rank: standing.rank, level: standing.level }))}</div>` : ""}
        </div>
        ${standing ? `<span class="profile-rank">${SYS.rankArt(standing.rank, 62, { lit: true })}</span>` : ""}
        ${close}
      </div>`;

    if (edit) {
      const e = ui.profileEdit;
      const bio = e.bio || "";
      return shell(`${head}
        <div class="field-label" style="margin-top:14px;">${t("profile.avatar")}</div>
        <div class="avatar-grid">
          ${Object.keys(SYS.AVATARS).map((id) => `<button type="button" class="avatar-pick ${e.avatar === id ? "on" : ""}" data-action="profile-avatar" data-id="${id}" aria-pressed="${e.avatar === id}" aria-label="${escapeHtml(SYS.AVATARS[id])}">${SYS.AVATARS[id]}</button>`).join("")}
        </div>
        <label class="field-label" for="profile-bio" style="margin-top:14px;">${t("profile.bio")}</label>
        <textarea id="profile-bio" class="field-textarea" rows="2" maxlength="${SYS.PROFILE_BIO_MAX}" data-bind="profileEdit.bio" placeholder="${t("profile.bioPlaceholder")}">${escapeHtml(bio)}</textarea>
        <div class="form-hint">${t("profile.bioHint", { n: SYS.PROFILE_BIO_MAX })}</div>
        ${e.error ? `<div class="toast-error" style="margin-top:10px;">${escapeHtml(e.error)}</div>` : ""}
        <div class="btn-row" style="margin-top:14px;">
          <button class="btn btn-primary" data-action="profile-save" ${e.busy ? "disabled" : ""}>${e.busy ? t("profile.checking") : t("event.save")}</button>
          <button class="btn btn-outline" data-action="profile-edit-cancel" ${e.busy ? "disabled" : ""}>${t("event.cancel")}</button>
        </div>`);
    }

    const stats = `
      <div class="profile-stats">
        <div class="stat-tile"><div class="stat-num">${row ? escapeHtml(row.totalExp) : "—"}</div><div class="stat-label">${t("profile.totalExp")}</div></div>
        <div class="stat-tile"><div class="stat-num">${row && !row.hidden && ui.profileRank ? "#" + escapeHtml(ui.profileRank) : "—"}</div><div class="stat-label">${t("profile.worldRank")}</div></div>
        <div class="stat-tile"><div class="stat-num">${row ? escapeHtml(row.questsCompleted || 0) : "—"}</div><div class="stat-label">${t("lb.colQuests")}</div></div>
      </div>`;

    const reportForm = report ? `
      <div class="profile-report">
        <div class="field-label">${t("profile.reportWhy")}</div>
        <div class="planner-tabs">
          ${["name", "bio", "cheating", "other"].map((r) => `<button type="button" class="chip filter-chip ${ui.profileReport.reason === r ? "active" : ""}" data-action="report-reason" data-reason="${r}" aria-pressed="${ui.profileReport.reason === r}">${t({ name: "profile.reportName", bio: "profile.reportBio", cheating: "profile.reportCheating", other: "profile.reportOther" }[r])}</button>`).join("")}
        </div>
        <input class="field-input" style="margin-top:10px;" maxlength="200" data-bind="profileReport.note" value="${escapeHtml(ui.profileReport.note || "")}" placeholder="${t("profile.reportNote")}" aria-label="${t("profile.reportNote")}" />
        ${ui.profileReport.error ? `<div class="toast-error" style="margin-top:10px;">${escapeHtml(ui.profileReport.error)}</div>` : ""}
        <div class="btn-row" style="margin-top:12px;">
          <button class="btn btn-primary" data-action="report-send" ${!ui.profileReport.reason || ui.profileReport.busy ? "disabled" : ""}>${t("profile.reportSend")}</button>
          <button class="btn btn-outline" data-action="report-cancel">${t("event.cancel")}</button>
        </div>
      </div>` : "";

    return shell(`${head}
      ${p.bio ? `<div class="profile-bio">${escapeHtml(p.bio)}</div>` : ""}
      ${!row ? `<div class="form-hint" style="margin-top:10px;">${me ? t("name.unclaimed") : t("profile.notRanked")}</div>` : ""}
      ${stats}
      ${radar ? `<div class="profile-radar">${radar}</div>` : ""}
      ${p.topTraits && p.topTraits.length ? `
        <div class="field-label" style="margin-top:12px;">${t("profile.topTraits")}</div>
        <div class="profile-traits">${p.topTraits.map((x) => `<span class="profile-trait"><b>${escapeHtml(traitName(x))}</b> <span>${escapeHtml(x.short)} · ${escapeHtml(x.level)}</span></span>`).join("")}</div>` : ""}
      ${(p.raceWins || p.raceLosses || p.raceTies) ? `<div class="profile-record">${icon("trophy", 13)} ${t("races.record", { w: escapeHtml(p.raceWins || 0), l: escapeHtml(p.raceLosses || 0), t: escapeHtml(p.raceTies || 0) })}</div>` : ""}
      ${joined ? `<div class="form-hint" style="margin-top:12px;">${t("profile.joined", { date: escapeHtml(joined) })}</div>` : ""}
      ${reportForm}
      ${ui.profileReportSent ? `<div class="form-hint" style="color:var(--gold-text);margin-top:10px;">${t("profile.reportThanks")}</div>` : ""}
      <div class="btn-row profile-actions">
        ${me ? `<button class="btn btn-primary" data-action="profile-edit">${icon("pencil", 13)} ${t("profile.edit")}</button>` : `
          ${blocked || !row ? "" : (() => {
            const st = friendStatus(ui, uid);
            const armed = !!ui.armed && ui.armed.kind === "task" && ui.armed.id === "friend:" + uid;
            if (st === "friends") return `<button class="btn btn-primary" data-action="race-open-form" data-uid="${escapeHtml(uid)}">${t("races.challengeShort")}</button>
              <span class="friend-tag">${icon("check", 12)} ${t("friends.areFriends")}</span>
              <button class="btn btn-ghost btn-sm ${armed ? "danger-arm" : ""}" data-action="friend-remove-armed" data-id="friend:${escapeHtml(uid)}" data-uid="${escapeHtml(uid)}">${armed ? t("intel.confirmAgain") : t("friends.remove")}</button>`;
            if (st === "sent") return `<button class="btn btn-outline" data-action="friend-remove" data-uid="${escapeHtml(uid)}">${t("friends.requested")}</button>`;
            if (st === "received") return `<button class="btn btn-primary" data-action="friend-respond" data-uid="${escapeHtml(uid)}" data-accept="1">${t("friends.accept")}</button>`;
            return `<button class="btn btn-primary" data-action="friend-add-uid" data-uid="${escapeHtml(uid)}" ${ui.friendBusy ? "disabled" : ""}>${icon("plus", 13)} ${t("friends.add")}</button>`;
          })()}
          ${row ? `<button class="btn btn-outline" data-action="open-compare" data-uid="${escapeHtml(uid)}">${t("friends.compare")}</button>` : ""}
          ${report ? "" : `<button class="btn btn-outline" data-action="profile-report">${icon("flag", 13)} ${t("profile.report")}</button>`}
          <button class="btn btn-outline ${blocked ? "" : "btn-ghost"}" data-action="profile-block" ${ui.profileBlockBusy ? "disabled" : ""}>${blocked ? t("profile.unblock") : t("profile.block")}</button>`}
      </div>`);
  }

  // ---------- Deleting the account ----------

  function renderDeleteAccountModal(ui) {
    const d = ui.deleteAccount;
    if (!d) return "";
    const close = `<button class="wk-arrow" data-action="close-modal" aria-label="${t("event.close")}" ${d.busy ? "disabled" : ""}>${icon("x", 15)}</button>`;
    const word = t("delete.word");
    const body = !ui.cloudUser ? `
      <div class="carry-body">${t("delete.signInFirst")}</div>
      <div class="btn-row" style="margin-top:14px;">
        <button class="btn btn-primary" data-action="open-settings">${t("nav.settings")}</button>
      </div>` : `
      <div class="carry-body">${t("delete.intro", { email: escapeHtml(ui.cloudUser.email || "") })}</div>
      <ul class="delete-list">
        <li>${t("delete.itemProgress")}</li>
        <li>${t("delete.itemPublic")}</li>
        <li>${t("delete.itemSocial")}</li>
        <li>${t("delete.itemMessages")}</li>
        <li>${t("delete.itemSignIn")}</li>
      </ul>
      <div class="delete-warn">${icon("shield", 13)} ${t("delete.cannotUndo")}</div>
      <div class="field-label" style="margin-top:12px;">${t("delete.typeToConfirm", { word: escapeHtml(word) })}</div>
      <input id="delete-confirm-input" class="field-input" autocomplete="off" autocapitalize="off" spellcheck="false" data-bind="deleteAccount.typed" value="${escapeHtml(d.typed || "")}" aria-label="${t("delete.typeToConfirm", { word: escapeHtml(word) })}" ${d.busy ? "disabled" : ""} />
      ${d.error ? `<div class="toast-error" style="margin-top:10px;">${escapeHtml(d.error)}</div>` : ""}
      <div class="btn-row" style="margin-top:14px;flex-wrap:wrap;">
        <button class="btn btn-danger-outline" data-action="delete-account-confirm" ${d.busy ? "disabled" : ""}>${t(d.busy ? "delete.deleting" : "delete.confirm")}</button>
        <button class="btn btn-outline" data-action="close-modal" ${d.busy ? "disabled" : ""}>${t("form.cancel")}</button>
      </div>`;
    return `
      <div class="modal-backdrop" ${d.busy ? "" : `data-action="close-modal-backdrop"`}>
        <div class="sys-panel modal-box profile-box" data-stop-close="1" role="dialog" aria-label="${t("delete.title")}">
          <div class="day-head"><span class="day-head-pad"></span><div class="time-title">${t("delete.title")}</div>${close}</div>
          ${body}
        </div>
      </div>`;
  }

  // ---------- Reporting what the AI said ----------

  const AI_REASON_KEYS = { offensive: "aiReport.offensive", harmful: "aiReport.harmful", wrong: "aiReport.wrong", other: "aiReport.other" };
  const AI_SURFACE_KEYS = { evaluation: "aiReport.surfaceEvaluation", suggestion: "aiReport.surfaceSuggestion", reflection: "aiReport.surfaceReflection" };

  function renderAiReportModal(ui) {
    const r = ui.aiReport;
    if (!r) return "";
    const close = `<button class="wk-arrow" data-action="close-modal" aria-label="${t("event.close")}">${icon("x", 15)}</button>`;
    const body = r.sent ? `
      <div class="carry-body" style="color:var(--gold-text);">${t("aiReport.thanks")}</div>
      <div class="btn-row" style="margin-top:14px;"><button class="btn btn-outline" data-action="close-modal">${t("event.close")}</button></div>` : `
      <div class="carry-body">${t("aiReport.intro")}</div>
      <div class="field-label" style="margin-top:10px;">${t(AI_SURFACE_KEYS[r.surface])}</div>
      <div class="ai-quote">${escapeHtml(r.content)}</div>
      <div class="field-label" style="margin-top:12px;">${t("aiReport.why")}</div>
      <div class="planner-tabs">
        ${Object.keys(AI_REASON_KEYS).map((k) => `<button type="button" class="chip filter-chip ${r.reason === k ? "active" : ""}" data-action="ai-report-reason" data-reason="${k}" aria-pressed="${r.reason === k}">${t(AI_REASON_KEYS[k])}</button>`).join("")}
      </div>
      <input class="field-input" style="margin-top:10px;" maxlength="500" data-bind="aiReport.note" value="${escapeHtml(r.note || "")}" placeholder="${t("profile.reportNote")}" aria-label="${t("profile.reportNote")}" />
      ${r.error ? `<div class="toast-error" style="margin-top:10px;">${escapeHtml(r.error)}</div>` : ""}
      <div class="btn-row" style="margin-top:14px;">
        <button class="btn btn-primary" data-action="ai-report-send" ${!r.reason || r.busy ? "disabled" : ""}>${t(r.busy ? "feedback.sending" : "aiReport.send")}</button>
        <button class="btn btn-outline" data-action="close-modal">${t("form.cancel")}</button>
      </div>`;
    return `
      <div class="modal-backdrop" data-action="close-modal-backdrop">
        <div class="sys-panel modal-box profile-box" data-stop-close="1" role="dialog" aria-label="${t("aiReport.title")}">
          <div class="day-head"><span class="day-head-pad"></span><div class="time-title">${t("aiReport.title")}</div>${close}</div>
          ${body}
        </div>
      </div>`;
  }

  function renderAdminAiReportQueue(ui) {
    const list = ui.adminAiReports || [];
    const rows = list.map((r) => `
      <div class="sys-panel" style="padding:14px 16px;margin-top:10px;">
        <div class="fb-item-head">
          <span class="race-metric">${t(AI_SURFACE_KEYS[r.surface] || "aiReport.surfaceEvaluation")}</span>
          <b style="font-size:13px;color:var(--ink);">${t(AI_REASON_KEYS[r.reason] || "aiReport.other")}</b>
          <span class="fb-date">${escapeHtml(feedbackDate(r.createdAt))}</span>
        </div>
        <div class="ai-quote">${escapeHtml(r.content)}</div>
        ${r.note ? `<div class="fb-text">${escapeHtml(r.note)}</div>` : ""}
        <div class="fb-device">${escapeHtml([r.name || r.uid, r.context && r.context.title, r.context && r.context.pt != null ? r.context.pt + " pt" : "", r.context && r.context.priceId].filter(Boolean).join(" · "))}</div>
        <div class="btn-row" style="margin-top:8px;">
          <button class="btn btn-ghost" data-action="admin-ai-report-close" data-id="${escapeHtml(r.id)}" ${ui.adminAiReportBusy ? "disabled" : ""}>${t("admin.dismissFlag")}</button>
        </div>
      </div>`).join("");
    return `
      <div class="sys-panel panel-pad" style="margin-top:16px;">
        <div class="panel-head"><div class="eyebrow" style="margin:0;">${t("aiReport.adminQueue")}</div></div>
        ${list.length === 0 ? `<div class="empty-note">${t("aiReport.adminNone")}</div>` : rows}
      </div>`;
  }

  // ---------- Feedback (functions/feedback.js) ----------

  const FEEDBACK_KINDS = { bug: "feedback.kindBug", idea: "feedback.kindIdea", other: "feedback.kindOther" };
  function feedbackDate(ts) {
    const ms = ts && ts.toMillis ? ts.toMillis() : Date.now();
    return new Date(ms).toLocaleDateString(dateLocale(), { day: "numeric", month: "short", year: "numeric" });
  }

  function renderFeedbackModal(ui) {
    const f = ui.feedback;
    if (!f) return "";
    const close = `<button class="wk-arrow" data-action="close-modal" aria-label="${t("event.close")}">${icon("x", 15)}</button>`;
    const signedIn = !!ui.cloudUser;
    const mine = ui.myFeedback;
    const history = !signedIn ? "" : mine == null
      ? `<div class="form-hint">${t("feedback.loading")}</div>`
      : !mine.length ? `<div class="form-hint">${t("feedback.none")}</div>`
      : mine.map((m) => `
        <div class="fb-item">
          <div class="fb-item-head">
            <span class="race-metric">${t(FEEDBACK_KINDS[m.kind] || "feedback.kindOther")}</span>
            <span class="fb-date">${escapeHtml(feedbackDate(m.createdAt))}</span>
            <span class="fb-status ${m.reply ? "replied" : ""}">${t(m.reply ? "feedback.replied" : m.status === "done" ? "feedback.read" : "feedback.waiting")}</span>
          </div>
          <div class="fb-text">${escapeHtml(m.text)}</div>
          ${m.hasShot ? `<div class="form-hint" style="margin-top:4px;">${t("feedback.withShot")}</div>` : ""}
          ${m.reply ? `<div class="fb-reply"><div class="fb-reply-label">${t("feedback.replyFrom")}</div><div class="fb-text">${escapeHtml(m.reply)}</div></div>` : ""}
        </div>`).join("");
    const kindHint = { bug: "feedback.placeholderBug", idea: "feedback.placeholderIdea", other: "feedback.placeholderOther" }[f.kind];
    const form = !signedIn ? `<div class="form-hint" style="line-height:1.5;">${t("feedback.signIn")}</div>` : `
      <div class="field-label" style="margin-top:12px;">${t("feedback.kind")}</div>
      <div class="planner-tabs">
        ${Object.keys(FEEDBACK_KINDS).map((k) => `<button type="button" class="chip filter-chip ${f.kind === k ? "active" : ""}" data-action="feedback-kind" data-kind="${k}" aria-pressed="${f.kind === k}">${t(FEEDBACK_KINDS[k])}</button>`).join("")}
      </div>
      <textarea id="feedback-text" class="field-textarea" style="margin-top:10px;min-height:110px;" maxlength="2000" data-bind="feedback.text" placeholder="${t(kindHint)}" aria-label="${t("feedback.title")}">${escapeHtml(f.text)}</textarea>
      <div class="fb-shot-row">
        ${f.shot ? `
          <div class="fb-shot"><img src="${escapeHtml(f.shot)}" alt="${t("feedback.shotAlt")}" /></div>
          <button type="button" class="btn btn-ghost btn-sm" data-action="feedback-remove-shot">${icon("x", 12)} ${t("feedback.removeShot")}</button>`
        : `<button type="button" class="btn btn-outline btn-sm btn-icon-inline" data-action="feedback-attach" ${f.shotBusy ? "disabled" : ""}>${icon("upload", 12)} ${t(f.shotBusy ? "feedback.shotBusy" : "feedback.attach")}</button>`}
      </div>
      <div class="form-hint" style="line-height:1.5;">${t("feedback.deviceHint")}</div>
      ${f.error ? `<div class="toast-error" style="margin-top:10px;">${escapeHtml(f.error)}</div>` : ""}
      ${f.sent ? `<div class="form-hint" style="color:var(--gold-text);margin-top:10px;">${t("feedback.thanks")}</div>` : ""}
      <div class="btn-row" style="margin-top:14px;">
        <button class="btn btn-primary" data-action="feedback-send" ${f.busy || f.shotBusy ? "disabled" : ""}>${t(f.busy ? "feedback.sending" : "feedback.send")}</button>
        <button class="btn btn-outline" data-action="close-modal">${t("event.close")}</button>
      </div>`;
    return `
      <div class="modal-backdrop" data-action="close-modal-backdrop">
        <div class="sys-panel modal-box profile-box" data-stop-close="1" role="dialog" aria-label="${t("feedback.title")}">
          <div class="day-head"><span class="day-head-pad"></span><div class="time-title">${t("feedback.title")}</div>${close}</div>
          <div class="carry-body">${t("feedback.intro")}</div>
          ${form}
          ${signedIn ? `<div class="planner-section">${t("feedback.yours")}</div>${history}` : ""}
        </div>
      </div>`;
  }

  function renderAdminFeedbackQueue(ui) {
    const list = ui.adminFeedback || [];
    const busy = ui.adminFeedbackBusy;
    const rows = list.map((m) => {
      const d = m.device || {};
      const shot = (ui.adminFeedbackShots || {})[m.id];
      const facts = [m.email, d.page ? "page " + d.page : "", d.lang, d.screen, d.platform, d.standalone ? "installed" : "browser", d.app].filter(Boolean).join(" · ");
      return `
      <div class="sys-panel" style="padding:14px 16px;margin-top:10px;">
        <div class="fb-item-head">
          <span class="race-metric">${t(FEEDBACK_KINDS[m.kind] || "feedback.kindOther")}</span>
          <b style="font-size:13px;color:var(--ink);">${escapeHtml(m.name || m.email || m.uid)}</b>
          <span class="fb-date">${escapeHtml(feedbackDate(m.createdAt))}</span>
        </div>
        <div class="fb-text" style="margin-top:6px;">${escapeHtml(m.text)}</div>
        <div class="fb-device">${escapeHtml(facts)}<br>${escapeHtml(d.ua || "")}</div>
        ${!m.hasShot ? "" : shot ? `<div class="fb-shot fb-shot-big"><img src="${escapeHtml(shot)}" alt="${t("feedback.shotAlt")}" /></div>`
          : `<button class="link-btn" data-action="admin-feedback-shot" data-id="${escapeHtml(m.id)}">${t("feedback.showShot")}</button>`}
        <textarea class="field-textarea" style="margin-top:10px;min-height:60px;" maxlength="1000" data-bind="adminFeedbackReply.${escapeHtml(m.id)}" placeholder="${t("feedback.replyPlaceholder")}" aria-label="${t("feedback.replyPlaceholder")}">${escapeHtml((ui.adminFeedbackReply || {})[m.id] || "")}</textarea>
        <div class="btn-row" style="margin-top:8px;flex-wrap:wrap;">
          <button class="btn btn-primary" data-action="admin-feedback-answer" data-id="${escapeHtml(m.id)}" data-reply="1" ${busy ? "disabled" : ""}>${t("feedback.replyClose")}</button>
          <button class="btn btn-ghost" data-action="admin-feedback-answer" data-id="${escapeHtml(m.id)}" data-reply="0" ${busy ? "disabled" : ""}>${t("feedback.closeOnly")}</button>
        </div>
      </div>`;
    }).join("");
    return `
      <div class="sys-panel panel-pad" style="margin-top:16px;">
        <div class="panel-head"><div class="eyebrow" style="margin:0;">${t("feedback.adminQueue")}</div></div>
        ${list.length === 0 ? `<div class="empty-note">${t("feedback.adminNone")}</div>` : rows}
      </div>`;
  }

  function renderAdminReportQueue(ui) {
    const list = ui.adminReports || [];
    const rows = list.map((r) => `
      <div class="sys-panel" style="padding:14px 16px;margin-top:10px;">
        <div style="font-size:13px;color:var(--ink);font-weight:600;">${escapeHtml(r.targetName || r.target)}</div>
        <div class="task-meta" style="margin-top:4px;"><span class="meta-pair"><span>${escapeHtml(r.reason)}</span></span></div>
        ${r.targetBio ? `<div style="margin-top:6px;font-size:12.5px;color:var(--ink);unicode-bidi:plaintext;">${t("profile.bio")}: ${escapeHtml(r.targetBio)}</div>` : ""}
        ${r.note ? `<div style="margin-top:6px;font-size:12px;color:var(--body);unicode-bidi:plaintext;">${escapeHtml(r.note)}</div>` : ""}
        <div class="btn-row" style="margin-top:10px;flex-wrap:wrap;">
          <button class="btn btn-outline" data-action="admin-open-profile" data-uid="${escapeHtml(r.target)}">${t("profile.title")}</button>
          ${r.targetBio ? `<button class="btn btn-outline" data-action="admin-report" data-id="${escapeHtml(r.id)}" data-act="clearBio" ${ui.adminReportBusy ? "disabled" : ""}>${t("admin.clearBio")}</button>` : ""}
          <button class="btn btn-danger-outline" data-action="admin-report" data-id="${escapeHtml(r.id)}" data-act="releaseName" ${ui.adminReportBusy ? "disabled" : ""}>${t("admin.releaseName")}</button>
          <button class="btn btn-ghost" data-action="admin-report" data-id="${escapeHtml(r.id)}" data-act="dismiss" ${ui.adminReportBusy ? "disabled" : ""}>${t("admin.dismissFlag")}</button>
        </div>
      </div>`).join("");
    return `
      <div class="sys-panel panel-pad" style="margin-top:16px;">
        <div class="panel-head"><div class="eyebrow" style="margin:0;">${t("admin.reportQueue")}</div></div>
        ${list.length === 0 ? `<div class="empty-note">${t("admin.reportNone")}</div>` : rows}
      </div>`;
  }

  // ---------- Admin page ----------
  // Admin console: user lookup, admin promotion, messaging/adjustments, and
  // the appeal queue. Look up one user by email, view their stats, promote/demote
  // admin. Firestore rules enforce the admin check server-side regardless;
  // this page simply won't render useful data for anyone rules reject.
  function renderAdminPage(state, ui) {
    const r = ui.adminResult;
    const grantArmed = !!r && ui.armed && ui.armed.kind === "admin" && ui.armed.id === `admin-grant-admin:${r.email}`;
    const revokeArmed = !!r && ui.armed && ui.armed.kind === "admin" && ui.armed.id === `admin-revoke-admin:${r.email}`;
    const resultBlock = !r ? "" : `
      <div class="sys-panel panel-pad" style="margin-top:16px;">
        <div class="modal-section-label">${t("admin.result")}</div>
        <div class="admin-who">
          <b>${escapeHtml(r.name || r.email)}</b>
          ${r.name && r.email ? `<span class="admin-email">${escapeHtml(r.email)}</span>` : ""}
          <span class="admin-uid">${escapeHtml(r.uid)}</span>
        </div>
        <div class="tile-group-head">${t("admin.groupProgress")}</div>
        ${r.state ? `
          <div class="stat-tiles">
            <div class="stat-tile"><div class="stat-num">${escapeHtml(r.state.player.rank)}</div><div class="stat-label">${t("admin.rank")}</div></div>
            <div class="stat-tile"><div class="stat-num">${escapeHtml(r.state.player.level)}</div><div class="stat-label">${t("admin.level")}</div></div>
            <div class="stat-tile"><div class="stat-num">${escapeHtml(r.state.player.exp)}</div><div class="stat-label">${t("admin.exp")}</div></div>
            <div class="stat-tile"><div class="stat-num">${escapeHtml(r.state.player.questsCompleted)}</div><div class="stat-label">${t("admin.questsDone")}</div></div>
          </div>` : `<div class="empty-note">${t("admin.noProgress")}</div>`}
        ${renderStandingProvenance(r)}
        <div class="tile-group-head" style="margin-top:16px;">${t("admin.groupRights")}</div>
        <div class="form-hint" style="margin-top:0;">${t("admin.currently", { status: r.isTargetAdmin ? t("admin.isAdmin") : t("admin.notAdmin") })}</div>
        <div class="btn-row" style="margin-top:8px;">
          <button class="btn btn-outline ${grantArmed ? "danger-arm" : ""}" data-action="admin-grant-admin" data-email="${escapeHtml(r.email)}" ${(ui.adminBusy || r.isTargetAdmin) ? "disabled" : ""}>${grantArmed ? t("intel.confirmAgain") : t("admin.makeAdmin")}</button>
          <button class="btn btn-danger-outline ${revokeArmed ? "danger-arm" : ""}" data-action="admin-revoke-admin" data-email="${escapeHtml(r.email)}" ${(ui.adminBusy || !r.isTargetAdmin) ? "disabled" : ""}>${revokeArmed ? t("intel.confirmAgain") : t("admin.removeAdmin")}</button>
        </div>
        <hr class="hr" />
        <div class="tile-group-head">${t("admin.sendMessage")}</div>
        <textarea class="field-textarea" placeholder="${t("admin.messagePlaceholder")}" data-bind="adminMsgText">${escapeHtml(ui.adminMsgText)}</textarea>
        <div class="field-row" style="margin-top:8px;align-items:flex-start;">
          <input class="field-input" type="number" step="any" placeholder="${t("admin.amountPlaceholder")}" data-bind="adminMsgAmount" value="${escapeHtml(ui.adminMsgAmount)}" />
          <button class="btn btn-primary" data-action="admin-send-adjustment" style="flex-shrink:0;" ${ui.adminMsgBusy ? "disabled" : ""}>${ui.adminMsgBusy ? t("admin.sending") : t("admin.send")}</button>
        </div>
        <div class="form-hint">${t("admin.adjustHint")}</div>
        ${ui.adminMsgError ? `<div class="toast-error">${escapeHtml(ui.adminMsgError)}</div>` : ""}
      </div>`;

    // Six queues used to sit on one page, so the last of them was a long
    // scroll away and an empty one still took a heading. They are tabs now,
    // each carrying how much is waiting in it.
    const queues = [
      { key: "appeals", tkey: "admin.tabAppeals", n: (ui.adminAppealQueue || []).length, render: () => renderAdminAppealQueue(ui) },
      { key: "answers", tkey: "admin.tabAnswers", n: (ui.adminReflections || []).length, render: () => renderAdminReflectionQueue(ui) },
      { key: "feedback", tkey: "admin.tabFeedback", n: (ui.adminFeedback || []).length, render: () => renderAdminFeedbackQueue(ui) },
      { key: "ai", tkey: "admin.tabAi", n: (ui.adminAiReports || []).length, render: () => renderAdminAiReportQueue(ui) },
      { key: "reports", tkey: "admin.tabReports", n: (ui.adminReports || []).length, render: () => renderAdminReportQueue(ui) },
      { key: "suspicion", tkey: "admin.tabSuspicion", n: (ui.adminFlagged || []).length, render: () => renderAdminSuspicionQueue(ui) },
    ];
    const waiting = queues.reduce((s, q) => s + q.n, 0);
    const tab = queues.some((q) => q.key === ui.adminTab) ? ui.adminTab : (queues.find((q) => q.n > 0) || queues[0]).key;
    const tabs = queues.map((q) => `
      <button class="chip filter-chip ${tab === q.key ? "active" : ""}" data-action="admin-tab" data-tab="${q.key}" aria-pressed="${tab === q.key}">${t(q.tkey)}${q.n ? `<span class="chip-count">${q.n}</span>` : ""}</button>`).join("");
    const when = ui.adminRefreshedAt ? new Date(ui.adminRefreshedAt).toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" }) : "";

    return `
      ${renderPageHead("admin", "admin.eyebrow", "admin.title")}
      <div class="sys-panel panel-pad admin-summary">
        <div class="admin-summary-line">
          <span class="stat-num">${waiting}</span>
          <span class="stat-label">${t("admin.waitingTotal")}</span>
        </div>
        <div class="admin-summary-right">
          ${when ? `<span class="today-count">${t("admin.updatedAt", { time: escapeHtml(when) })}</span>` : ""}
          <button class="link-btn" data-action="admin-refresh" ${ui.adminAppealBusy ? "disabled" : ""}>${t("lb.refresh")}</button>
        </div>
      </div>
      <div class="sys-panel panel-pad">
        <div class="field-label">${t("admin.nameOrEmail")}</div>
        <div class="field-row" style="align-items:flex-start;">
          <input class="field-input" type="text" placeholder="${t("admin.searchPlaceholder")}" data-bind="adminSearchEmail" value="${escapeHtml(ui.adminSearchEmail)}" />
          <button class="btn btn-primary" data-action="admin-search" style="flex-shrink:0;" ${ui.adminBusy ? "disabled" : ""}>${ui.adminBusy ? t("admin.searching") : t("admin.search")}</button>
        </div>
        ${ui.adminSearchError ? `<div class="toast-error" style="margin-top:8px;">${escapeHtml(ui.adminSearchError)}</div>` : ""}
        <div class="form-hint" style="margin-top:10px;">
          ${t("admin.syncDirHint")}
          <button class="link-btn" data-action="admin-backfill-directory" ${ui.adminBusy ? "disabled" : ""}>${t("admin.syncDir")}</button>
          · <button class="link-btn" data-action="admin-backfill-usernames" ${ui.adminBusy ? "disabled" : ""}>${t("admin.syncNames")}</button>
          · <button class="link-btn" data-action="admin-backfill-leaderboard" ${ui.adminBusy ? "disabled" : ""}>${t("admin.syncBoard")}</button>
          · <button class="link-btn" data-action="admin-backfill-baselines" ${ui.adminBusy ? "disabled" : ""}>${t("admin.convertBaselines")}</button>
        </div>
      </div>
      ${resultBlock}
      <div class="planner-tabs admin-tabs">${tabs}</div>
      ${(queues.find((q) => q.key === tab) || queues[0]).render()}`;
  }
  SYS.renderAdminPage = renderAdminPage;

  // Pending appeal queue — the human review path over the automatic
  // evaluator. Correcting a value writes a repricing pendingGrant rather
  // than touching EXP directly (see functions/index.js resolveAppeal); the
  // user's next pull recomputes the exact delta through the real ledger.
  // How much of a looked-up account's standing is backed by a price the
  // evaluator actually issued. Anything created before prices were recorded
  // counts as unbacked, so a high figure on a long-standing account is
  // expected and means little; a high figure on a new one does not.
  function renderStandingProvenance(r) {
    if (typeof r.expTotal !== "number") return "";
    const unverified = Number(r.expUnverified) || 0;
    const share = r.expTotal > 0 ? Math.round((unverified / r.expTotal) * 100) : 0;
    return `
      <div class="form-hint" style="margin-top:14px;">
        ${t("admin.standingFrom")}
        <b style="color:var(--ink);font-family:var(--font-mono);">${escapeHtml(r.expTotal)}</b>
        ${unverified !== 0 ? ` · <b style="color:${share >= 50 ? "var(--rust-text)" : "var(--gold-text)"};font-family:var(--font-mono);">${escapeHtml(unverified)}</b> ${t("admin.unbacked", { pct: share })}` : ` · ${t("admin.allBacked")}`}
      </div>`;
  }

  // What a big quest is holding back, and the way to release it. The task is
  // passed as `task`, not `t`, because `t` is the translator in this file.
  function renderTaskHeld(task) {
    if (!SYS.isGatedTask || !SYS.isGatedTask(task)) return "";
    const held = SYS.heldQuestExp(task);
    const r = task.reflections || {};
    const due = SYS.dueReflection(task);
    const waiting = [50, 100].some((cp) => r[cp] && r[cp].status === "held" && !(Number(r[cp].attemptsLeft) > 0));
    const rejectedCp = [50, 100].find((cp) => r[cp] && r[cp].status === "rejected");
    const nextCp = [50, 100].find((cp) => !(r[cp] && (r[cp].status === "accepted" || r[cp].status === "rejected")));
    let out = "";
    if (held > 0 && due) {
      out += `<div class="task-held">${icon("clock", 12)} ${t("reflect.held", { n: held })} <button class="link-btn" data-action="open-reflection" data-id="${task.id}" data-cp="${due}">${t("reflect.answer")}</button></div>`;
    } else if (held > 0 && waiting) {
      out += `<div class="task-held">${icon("clock", 12)} ${t("reflect.held", { n: held })} · ${t("reflect.waiting")}</div>`;
    } else if (held > 0 && nextCp) {
      out += `<div class="task-held">${icon("clock", 12)} ${t("reflect.heldUntil", { n: held, cp: nextCp })}</div>`;
    }
    if (rejectedCp) {
      const why = r[rejectedCp].reason ? " — " + escapeHtml(r[rejectedCp].reason) : "";
      const report = r[rejectedCp].reason ? ` <button class="link-btn" data-action="report-ai" data-surface="reflection" data-id="${escapeHtml(task.id)}" data-cp="${rejectedCp}">${t("aiReport.title")}</button>` : "";
      out += `<div class="task-held bad">${t("reflect.rejected")}${why}${report}</div>`;
    }
    return out;
  }

  function renderReflectionModal(state, ui) {
    const f = ui.reflectionFor || {};
    const task = (state.tasks || []).find((x) => x.id === f.taskId);
    if (!task) return "";
    const cp = f.cp === 100 ? 100 : 50;
    const entry = (task.reflections || {})[cp];
    return `
      <div class="modal-backdrop">
        <div class="sys-panel modal-box" data-stop-close="1">
          <div class="modal-title">${t("reflect.title")}</div>
          <div class="reflect-q">${cp === 100 ? t("reflect.q100") : t("reflect.q50")}</div>
          <div class="reflect-why">${t("reflect.why", { n: SYS.heldQuestExp(task), task: escapeHtml(task.title) })}</div>
          <textarea id="reflection-answer" class="field-input" rows="4" maxlength="600" data-bind="reflectionDraft" placeholder="${t("reflect.placeholder")}" style="width:100%;resize:vertical;">${escapeHtml(ui.reflectionDraft || "")}</textarea>
          ${entry && entry.status === "held" && entry.reason ? `<div class="reflect-reason">${escapeHtml(entry.reason)}</div>` : ""}
          ${ui.reflectionError ? `<div class="toast-error" style="margin-top:10px;">${escapeHtml(ui.reflectionError)}</div>` : ""}
          <div class="reflect-note">${t("reflect.privacy")}</div>
          <div class="btn-row" style="margin-top:14px;">
            <button class="btn btn-primary" data-action="submit-reflection" ${ui.reflectionBusy ? "disabled" : ""}>${ui.reflectionBusy ? t("reflect.checking") : t("reflect.send")}</button>
            <button class="btn btn-outline" data-action="close-modal">${t("reflect.later")}</button>
          </div>
        </div>
      </div>`;
  }

  function renderAdminSuspicionQueue(ui) {
    const list = ui.adminFlagged || [];
    const rows = list.map((a) => {
      const uid = a.uid || a.id;
      const who = (ui.adminFlaggedUsers || {})[uid];
      const label = who && (who.name || who.email)
        ? [who.name, who.email].filter(Boolean).map(escapeHtml).join(" · ")
        : escapeHtml(uid || "");
      const flag = a.flag || {};
      const reasons = (flag.reasons || []).map((r) =>
        `<li style="margin-top:3px;">${t("susp." + r.code)}${r.detail ? ` <span style="color:var(--faint);font-family:var(--font-mono);font-size:10.5px;">(${escapeHtml(r.detail)})</span>` : ""}</li>`
      ).join("");
      return `
        <div class="sys-panel" style="padding:14px 16px;margin-top:10px;">
          <div style="font-size:13px;color:var(--ink);font-weight:600;">${label}</div>
          <div style="font-size:12px;margin-top:4px;color:${flag.hidden ? "var(--danger, #b4544a)" : "var(--gold-text)"};">${flag.hidden ? t("admin.offRanking") : t("admin.noticeOnly")}</div>
          <ul style="margin:8px 0 0;padding-inline-start:18px;font-size:12.5px;color:var(--body);line-height:1.5;">${reasons}</ul>
          <div class="btn-row" style="margin-top:10px;">
            <button class="btn btn-primary" data-action="admin-restore-account" data-uid="${escapeHtml(uid)}" ${ui.adminFlaggedBusy ? "disabled" : ""}>${flag.hidden ? t("admin.restoreAccount") : t("admin.dismissFlag")}</button>
            ${flag.hidden ? `<button class="btn btn-outline" data-action="admin-keep-hidden" data-uid="${escapeHtml(uid)}" ${ui.adminFlaggedBusy ? "disabled" : ""}>${t("admin.keepHidden")}</button>` : ""}
          </div>
        </div>`;
    }).join("");
    return `
      <div class="sys-panel panel-pad" style="margin-top:16px;">
        <div class="panel-head">
          <div class="eyebrow" style="margin:0;">${t("admin.suspicionQueue")}</div>
        </div>
        ${list.length === 0 ? `<div class="empty-note">${t("admin.suspicionNone")}</div>` : rows}
      </div>`;
  }

  function renderAdminReflectionQueue(ui) {
    const list = ui.adminReflections || [];
    const rows = list.map((r) => {
      const who = (ui.adminReflectionUsers || {})[r.uid];
      const label = who && (who.name || who.email)
        ? [who.name, who.email].filter(Boolean).map(escapeHtml).join(" · ")
        : escapeHtml(r.uid || "");
      return `
        <div class="sys-panel" style="padding:14px 16px;margin-top:10px;">
          <div style="font-size:13px;color:var(--ink);font-weight:600;">${escapeHtml(r.title || "")}</div>
          <div class="task-meta" style="margin-top:4px;">
            <span class="meta-pair"><span>${escapeHtml(String(r.checkpoint))}%</span></span>
            <span class="meta-pair"><span>${escapeHtml(String(r.pt || 0))} xp</span></span>
          </div>
          <div style="margin-top:8px;font-size:12.5px;color:var(--ink);line-height:1.55;unicode-bidi:plaintext;">${escapeHtml(r.answer || "")}</div>
          ${r.reason ? `<div style="margin-top:6px;font-size:12px;color:var(--body);line-height:1.5;"><b style="color:var(--gold-text);">${t("admin.reflectAi")}</b> ${escapeHtml(r.reason)}</div>` : ""}
          <div style="font-family:var(--font-mono);font-size:10.5px;color:var(--faint);margin-top:6px;">${t("admin.from", { uid: label })}</div>
          <div class="btn-row" style="margin-top:10px;">
            <button class="btn btn-primary" data-action="admin-accept-reflection" data-id="${escapeHtml(r.id)}" ${ui.adminReflectionBusy ? "disabled" : ""}>${t("admin.reflectAccept")}</button>
            <button class="btn btn-danger-outline" data-action="admin-reject-reflection" data-id="${escapeHtml(r.id)}" ${ui.adminReflectionBusy ? "disabled" : ""}>${t("admin.reflectReject")}</button>
          </div>
        </div>`;
    }).join("");
    return `
      <div class="sys-panel panel-pad" style="margin-top:16px;">
        <div class="panel-head">
          <div class="eyebrow" style="margin:0;">${t("admin.reflectionQueue")}</div>
        </div>
        ${list.length === 0 ? `<div class="empty-note">${t("admin.reflectNone")}</div>` : rows}
      </div>`;
  }

  function renderAdminAppealQueue(ui) {
    const rows = ui.adminAppealQueue.map((a) => {
      const pointsVal = ui.adminAppealPoints[a.id] || "";
      return `
        <div class="sys-panel" style="padding:14px 16px;margin-top:10px;">
          <div style="font-size:13px;color:var(--ink);font-weight:600;">${escapeHtml(a.taskTitle)}</div>
          <div class="task-meta" style="margin-top:4px;">
            <span class="meta-pair"><span class="meta-label">${t("admin.current")}</span><span>${escapeHtml(a.currentPt)} xp${a.taskKind === "habit" ? "/repeat" : ""}</span></span>
            <span class="meta-pair"><span class="meta-label">${t("admin.kind")}</span><span>${t("admin." + (a.taskKind === "habit" ? "habit" : "quest"))}</span></span>
          </div>
          ${a.taskDescription ? `<div class="task-notes" style="margin-top:6px;">${escapeHtml(a.taskDescription)}</div>` : ""}
          <div style="margin-top:8px;font-size:12px;color:var(--body);line-height:1.5;"><b style="color:var(--gold-text);">${t("admin.theirReason")}</b> ${escapeHtml(a.reason)}</div>
          ${(() => {
            const who = (ui.adminAppealUsers || {})[a.userId];
            const label = who && (who.name || who.email)
              ? [who.name, who.email].filter(Boolean).map(escapeHtml).join(" · ")
              : escapeHtml(a.userId);
            return `<div style="font-family:var(--font-mono);font-size:10.5px;color:var(--faint);margin-top:6px;">${t("admin.from", { uid: label })}</div>`;
          })()}
          <div class="btn-row" style="margin-top:10px;">
            <input class="field-input" type="number" min="1" placeholder="${t("admin.correctedXp")}" style="max-width:130px;" data-bind="adminAppealPoints.${a.id}" value="${escapeHtml(pointsVal)}" />
            <button class="btn btn-primary" data-action="admin-resolve-appeal" data-id="${a.id}" ${ui.adminAppealBusy ? "disabled" : ""}>${t("admin.correctValue")}</button>
            <button class="btn btn-danger-outline" data-action="admin-reject-appeal" data-id="${a.id}" ${ui.adminAppealBusy ? "disabled" : ""}>${t("admin.uphold")}</button>
          </div>
        </div>`;
    }).join("");
    return `
      <div class="sys-panel panel-pad" style="margin-top:16px;">
        <div class="panel-head">
          <div class="eyebrow" style="margin:0;">${t("admin.appealQueue")}</div>
          <div style="display:flex;gap:14px;align-items:center;">
            <button class="link-btn" data-action="admin-export-appeals" ${ui.adminExportBusy ? "disabled" : ""}>${ui.adminExportBusy ? t("admin.exporting") : t("admin.exportAppeals")}</button>
            <button class="link-btn" data-action="admin-refresh-appeals" ${ui.adminAppealBusy ? "disabled" : ""}>${t("admin.refresh")}</button>
          </div>
        </div>
        ${ui.adminExportNote ? `<div class="form-hint" style="margin-bottom:8px;">${escapeHtml(ui.adminExportNote)}</div>` : ""}
        ${ui.adminAppealError ? `<div class="toast-error">${escapeHtml(ui.adminAppealError)}</div>` : ""}
        ${ui.adminAppealQueue.length === 0 ? `<div class="empty-note">${t("admin.nothingPending")}</div>` : rows}
      </div>`;
  }

  // ---------- page dispatcher ----------
  // ---------- Mail: everything waiting on this account, in one place ----------
  //
  // Nothing here is stored twice. Each row is built from what already exists
  // — the friendships, the races, the inbox, the appeals, the feedback, the
  // answers on gated quests — so the page cannot drift from the truth it is
  // reporting. What is actionable comes first; the rest is a record.

  function mailActionable(state, ui) {
    if (!ui.cloudUser) return { requests: [], challenges: [], unread: 0 };
    const me = ui.cloudUser.uid;
    const requests = (ui.friendships || []).filter((f) => f.status === "pending" && f.to === me).map((f) => otherOf(f, me));
    const challenges = (ui.races || []).filter((r) => r.status === "pending" && r.opponent === me);
    const unread = (ui.inbox || []).filter((m) => !m.read).length;
    return { requests, challenges, unread };
  }

  // The number on the tab: only things that want a decision or have not been
  // read. A finished race sitting in the record is not a chore.
  function mailBadge(state, ui) {
    const a = mailActionable(state, ui);
    return a.requests.length + a.challenges.length + a.unread;
  }
  SYS.mailBadge = mailBadge;

  function mailRow(iconName, cls, title, body, when, actions) {
    return `
      <div class="mail-row">
        <span class="mail-icon ${cls || ""}">${icon(iconName, 14)}</span>
        <div class="mail-body">
          <div class="mail-title">${title}</div>
          ${body ? `<div class="mail-text">${body}</div>` : ""}
          ${when ? `<div class="mail-when">${escapeHtml(when)}</div>` : ""}
        </div>
        ${actions ? `<div class="player-actions">${actions}</div>` : ""}
      </div>`;
  }

  function stampOf(ts) {
    const ms = ts && ts.toMillis ? ts.toMillis() : null;
    return ms ? new Date(ms).toLocaleDateString(dateLocale(), { day: "numeric", month: "short" }) : "";
  }

  function renderMailPage(state, ui) {
    const header = renderPageHead("mail", "mail.eyebrow", "mail.title");
    if (!ui.cloudUser) {
      return header + `
        <div class="sys-panel panel-pad">
          <div class="empty-hero">
            ${pageIcon("mail")}
            <div class="empty-hero-text">${t("mail.signedOut")}</div>
            <button class="btn btn-primary" data-action="open-settings">${t("account.signIn")}</button>
          </div>
        </div>`;
    }
    const me = ui.cloudUser.uid;
    const act = mailActionable(state, ui);

    const waiting = [];
    act.requests.forEach((uid) => {
      waiting.push(mailRow("users", "gold", t("mail.friendRequest", { name: escapeHtml(friendName(ui, uid)) }), "", "", `
        <button class="btn btn-primary btn-sm" data-action="friend-respond" data-uid="${escapeHtml(uid)}" data-accept="1">${t("friends.accept")}</button>
        <button class="btn btn-outline btn-sm" data-action="friend-respond" data-uid="${escapeHtml(uid)}" data-accept="0">${t("friends.decline")}</button>`));
    });
    act.challenges.forEach((r) => {
      const them = (r.users || []).find((u) => u !== me);
      waiting.push(mailRow("zap", "gold", t("races.challengedYou", { name: escapeHtml(friendName(ui, them)) }), escapeHtml(metricLabel(state, r.metric)), stampOf(r.createdAt), `
        <button class="btn btn-primary btn-sm" data-action="race-respond" data-id="${escapeHtml(r.id)}" data-accept="1">${t("races.accept")}</button>
        <button class="btn btn-outline btn-sm" data-action="race-respond" data-id="${escapeHtml(r.id)}" data-accept="0">${t("friends.decline")}</button>`));
    });

    const system = (ui.inbox || []).map((m) => `
      <div class="mail-row ${m.read ? "" : "unread"}" ${m.read ? "" : `data-action="mark-inbox-read" data-id="${escapeHtml(m.id)}" style="cursor:pointer;"`}>
        <span class="mail-icon ${m.read ? "" : "gold"}">${icon("shield", 14)}</span>
        <div class="mail-body">
          <div class="mail-title">${escapeHtml(m.text)}${m.amount ? ` <b style="color:${m.amount > 0 ? "var(--gold-text)" : "var(--rust-text)"}">${t("log.expChange", { sign: m.amount > 0 ? "+" : "", n: escapeHtml(m.amount) })}</b>` : ""}</div>
        </div>
        ${m.read ? "" : `<span class="mail-new">${t("log.new")}</span>`}
      </div>`).join("");

    // The record: things that have already happened and are worth seeing once.
    const history = [];
    (ui.races || []).filter((r) => r.status === "done")
      .sort((a, b) => ((b.endAt && b.endAt.toMillis ? b.endAt.toMillis() : 0) - (a.endAt && a.endAt.toMillis ? a.endAt.toMillis() : 0)))
      .slice(0, 5).forEach((r) => {
        const them = (r.users || []).find((u) => u !== me);
        const sc = r.scores || {};
        const outcome = r.winner == null ? t("races.tie") : r.winner === me ? t("races.won") : t("races.lost");
        history.push(mailRow("trophy", r.winner === me ? "gold" : r.winner == null ? "" : "rust",
          `${outcome} · ${t("races.vs", { name: escapeHtml(friendName(ui, them)) })}`,
          `${escapeHtml(Number(sc[me]) || 0)} – ${escapeHtml(Number(sc[them]) || 0)}`, stampOf(r.endAt), ""));
      });
    (ui.myAppeals || []).filter((a) => a.status === "resolved" || a.status === "rejected").slice(0, 5).forEach((a) => {
      history.push(mailRow("flag", a.status === "resolved" ? "gold" : "rust",
        t(a.status === "resolved" ? "mail.appealResolved" : "mail.appealRejected", { title: escapeHtml(a.taskTitle || "") }),
        a.status === "resolved" && a.newPt ? t("appeal.newValue", { n: escapeHtml(a.newPt) }) : "", "", ""));
    });
    (ui.myFeedback || []).filter((m) => m.reply).slice(0, 5).forEach((m) => {
      history.push(mailRow("check", "gold", t("feedback.replyFrom"), escapeHtml(m.reply), stampOf(m.repliedAt || m.createdAt), ""));
    });
    state.tasks.forEach((task) => {
      const r = task.reflections || {};
      [50, 100].forEach((cp) => {
        const e = r[cp];
        if (!e || (e.status !== "accepted" && e.status !== "rejected")) return;
        history.push(mailRow(e.status === "accepted" ? "check" : "x", e.status === "accepted" ? "gold" : "rust",
          t(e.status === "accepted" ? "mail.answerAccepted" : "mail.answerRejected", { title: escapeHtml(task.title) }),
          e.reason ? escapeHtml(e.reason) : "", "", ""));
      });
    });

    const nothing = !waiting.length && !system && !history.length;
    return header + (nothing
      ? `<div class="sys-panel panel-pad">
           <div class="empty-hero">
             ${pageIcon("mail")}
             <div class="empty-hero-text">${t("mail.empty")}</div>
           </div>
         </div>`
      : `
        ${waiting.length ? `<div class="sys-panel panel-pad">
          <div class="planner-section" style="margin-top:0;">${t("mail.waiting")} · ${waiting.length}</div>
          ${waiting.join("")}
        </div>` : ""}
        ${system ? `<div class="sys-panel panel-pad">
          <div class="friends-rank-head" style="margin-bottom:4px;">
            <span class="planner-section" style="margin:0;">${t("log.fromSystem")}${act.unread ? " · " + act.unread : ""}</span>
            ${act.unread ? `<button class="link-btn" data-action="inbox-read-all">${t("log.markAllRead")}</button>` : ""}
          </div>
          ${system}
        </div>` : ""}
        ${history.length ? `<div class="sys-panel panel-pad">
          <div class="planner-section" style="margin-top:0;">${t("mail.history")}</div>
          ${history.slice(0, 12).join("")}
        </div>` : ""}`);
  }
  SYS.renderMailPage = renderMailPage;

  function renderPage(state, ui) {
    switch (ui.page) {
      case "quests": return renderQuestsPage(state, ui);
      case "habits": return renderHabitsPage(state, ui);
      case "stats": return renderStatsPage(state, ui);
      case "intelligence": return renderIntelligencePage(state, ui);
      case "leaderboard": return renderLeaderboardPage(state, ui);
      case "log": return renderLogPage(state, ui);
      case "mail": return renderMailPage(state, ui);
      case "planner": return renderPlannerPage(state, ui);
      case "friends": return renderFriendsPage(state, ui);
      case "admin": return renderAdminPage(state, ui);
      default: return renderOverviewPage(state, ui);
    }
  }
  SYS.renderPage = renderPage;

  // ---------- notifications ----------
  const NOTIF_STYLE = {
    levelup: { key: "notif.levelup", color: "var(--gold-text)" },
    skillpoint: { key: "notif.skillpoint", color: "var(--gold-text)" },
    info: { key: "notif.info", color: "var(--gold-text)" },
    expLoss: { key: "notif.expLoss", color: "var(--dim)" },
    delevel: { key: "notif.delevel", color: "var(--dim)" },
    rankdown: { key: "notif.rankdown", color: "var(--rust-text)" },
    update: { key: "notif.update", color: "var(--gold-text)" },
  };
  function renderNotifStack(ui) {
    return ui.toasts.map((n) => {
      const style = NOTIF_STYLE[n.kind] || { key: "notif.exp", color: "var(--gold-text)" };
      // Only sticky notifications carry buttons — one that vanishes mid-reach
      // would be worse than none. The dismiss is there because a prompt you
      // can't put away is a prompt that gets resented.
      const actions = n.action ? `
          <div class="notif-actions">
            <button class="btn btn-primary btn-sm" data-action="${escapeHtml(n.action.name)}">${escapeHtml(n.action.label)}</button>
            <button class="notif-dismiss" data-action="dismiss-toast" data-id="${escapeHtml(n.id)}" aria-label="${t("update.later")}" title="${t("update.later")}">${icon("x", 13)}</button>
          </div>` : "";
      return `
        <div class="notif" data-action="dismiss-toast" data-id="${escapeHtml(n.id)}" title="${t("notif.dismiss")}">
          <div class="notif-kind" style="color:${style.color}">${t(style.key)}</div>
          <div class="notif-text">${escapeHtml(n.text)}${n.count > 1 ? ` <span class="notif-count">×${n.count}</span>` : ""}</div>
          ${actions}
        </div>`;
    }).join("");
  }
  SYS.renderNotifStack = renderNotifStack;

  // ---------- rank-up cinematic ----------
  function renderRankupLayer(ui) {
    if (!ui.rankupShowing) return `<div class="rankup-flash" id="rankup-flash"></div>`;
    const rank = ui.rankupShowing.rank;
    return `
      <div class="rankup-flash fire" id="rankup-flash"></div>
      <div class="rankup-overlay show" id="rankup-overlay" data-action="dismiss-rankup" role="alertdialog" aria-label="${t("rankup.aria")}">
        <div class="rankup-eyebrow">${t("rankup.notice")}</div>
        <div class="rankup-emblem" style="--glow:${(SYS.RANK_GLOW || {})[rank] || "217,160,91"}">
          <span class="rankup-aura"></span>
          ${SYS.rankArt(rank, 200, { lit: true })}
          <span class="rankup-sheen">${SYS.rankArt(rank, 200)}</span>
        </div>
        <div class="rankup-sub">${escapeHtml(ui.rankupShowing.text)}</div>
        <div class="rankup-hint">${t("rankup.dismiss")}</div>
      </div>`;
  }
  SYS.renderRankupLayer = renderRankupLayer;

  // ---------- modal ----------
  function renderModalLayer(state, ui) {
    if (!ui.modal) return "";
    if (ui.modal === "settings") return renderSettingsModal(state, ui);
    if (ui.modal === "timer") return renderTimerModal(state, ui);
    if (ui.modal === "logAmount") return renderLogSheet(state, ui);
    if (ui.modal === "library") return renderLibraryModal(state, ui);
    if (ui.modal === "syncChoice") return renderSyncChoiceModal(state, ui);
    if (ui.modal === "day") return renderDaySheet(state, ui);
    if (ui.modal === "time") return renderTimeSheet(ui);
    if (ui.modal === "reflection") return renderReflectionModal(state, ui);
    if (ui.modal === "carry") return renderCarryModal(state, ui);
    if (ui.modal === "eventForm") return renderEventForm(state, ui);
    if (ui.modal === "eventView") return renderEventView(state, ui);
    if (ui.modal === "eventMove") return renderEventMove(ui);
    if (ui.modal === "profile") return renderProfileModal(state, ui);
    if (ui.modal === "compare") return renderCompareModal(state, ui);
    if (ui.modal === "raceForm") return renderRaceForm(state, ui);
    if (ui.modal === "feedback") return renderFeedbackModal(ui);
    if (ui.modal === "deleteAccount") return renderDeleteAccountModal(ui);
    if (ui.modal === "aiReport") return renderAiReportModal(ui);
    return "";
  }
  SYS.renderModalLayer = renderModalLayer;

  // The reminder time as two wheels, hours and minutes, each a scroll-snapped
  // column. Every list is written out three times so it can wrap — 23 runs on
  // into 00 — and main.js quietly recentres on the middle copy once a spin
  // settles, and sets the scroll position after each render. The row height
  // lives in two places that must agree: --tw-row in CSS and TW_ROW in main.js.
  function renderTimeSheet(ui) {
    const d = ui.timeDraft || { h: 0, m: 0 };
    const pad = (n) => String(n).padStart(2, "0");
    const wheel = (part, count, cur, label) => `
      <div class="tw-col" data-tw="${part}" data-count="${count}" tabindex="0" role="spinbutton"
        aria-label="${label}" aria-valuemin="0" aria-valuemax="${count - 1}" aria-valuenow="${cur}" aria-valuetext="${pad(cur)}">
        ${Array.from({ length: count * 3 }, (_, i) => `<div class="tw-item" data-action="tw-pick" data-i="${i}">${pad(i % count)}</div>`).join("")}
      </div>`;
    return `
      <div class="modal-backdrop time-backdrop" data-action="close-time-backdrop">
        <div class="sys-panel modal-box time-sheet" data-stop-close="1" role="dialog" aria-label="${t("form.pickTime")}">
          <div class="day-head">
            <button class="wk-arrow" data-action="close-time" aria-label="${t("form.cancel")}">${icon("x", 15)}</button>
            <div class="time-title">${ui.timeTitle ? escapeHtml(ui.timeTitle) : t("form.pickTime")}</div>
            <span class="day-head-pad"></span>
          </div>
          <div class="tw" dir="ltr">
            <div class="tw-band"></div>
            ${wheel("h", 24, d.h, t("form.hours"))}
            ${wheel("m", 60, d.m, t("form.minutes"))}
          </div>
          <button class="btn-primary time-confirm" data-action="confirm-time">${t("form.confirmTime")}</button>
        </div>
      </div>`;
  }

  function renderSyncChoiceModal(state, ui) {
    // Asking which copy to keep without saying what differs makes the answer a
    // guess. It also hid a repeating prompt: something disagreed on every
    // launch and nothing on screen said what.
    // The planner syncs by itself and is not in either stored copy.
    const { planner, ...stateOnly } = state;
    const rows = SYS.describeStateDiff(stateOnly, ui.pendingCloudState) || [];
    const diff = !rows.length ? "" : `
          <div style="font-size:12px;line-height:1.7;margin-bottom:16px;border:1px solid var(--line);border-radius:8px;padding:10px 12px;">
            <div style="opacity:.7;margin-bottom:6px;text-transform:uppercase;letter-spacing:.08em;font-size:10px;">${t("sync.whatDiffers")}</div>
            ${rows.map((r) => `<div style="margin-bottom:3px;"><strong>${escapeHtml(r.key)}</strong> <span style="opacity:.8;unicode-bidi:plaintext;">${escapeHtml(r.detail)}</span></div>`).join("")}
          </div>`;
    // A save that is being refused is the whole explanation for a prompt that
    // keeps coming back: answering it writes, the write is rejected, and the
    // next launch finds the same disagreement. Say so here, where the question
    // is actually being asked.
    const blocked = !ui.pushError ? "" : `
          <div style="font-size:12px;line-height:1.6;margin-bottom:16px;border:1px solid var(--danger,#b4544a);border-radius:8px;padding:10px 12px;">
            <strong>${t("sync.cantSave")}</strong>
            <div style="opacity:.85;margin-top:4px;unicode-bidi:plaintext;">${escapeHtml(String(ui.pushError))}</div>
          </div>`;
    return `
      <div class="modal-backdrop">
        <div class="sys-panel modal-box" data-stop-close="1">
          <div class="modal-title">${t("sync.title")}</div>
          <div style="font-size:13px;color:var(--body);line-height:1.6;margin-bottom:18px;">
            ${t("sync.body")}
          </div>
          ${blocked}
          ${diff}
          ${renderSyncDiagnosis(ui)}
          <div class="btn-row" style="flex-direction:column;gap:8px;">
            <button class="btn btn-primary" data-action="sync-choice" data-choice="cloud" style="width:100%;">${t("sync.useCloud")}</button>
            <button class="btn btn-outline" data-action="sync-choice" data-choice="local" style="width:100%;">${t("sync.useLocal")}</button>
          </div>
        </div>
      </div>`;
  }

  // Admin only: this names server-side collections and is diagnostic, not
  // something to put in front of everyone answering a sync prompt.
  function renderSyncDiagnosis(ui) {
    const d = ui.syncDiag;
    if (!ui.isAdmin || !d) return "";
    const standing = (total) => {
      if (total == null) return "—";
      const s = SYS.expToStanding(total);
      return `${total} (${s.rank} Lv${s.level})`;
    };
    const p = d.push;
    const ago = (ms) => {
      if (!ms) return "never";
      const mins = Math.round((Date.now() - ms) / 60000);
      return mins < 1 ? "just now" : mins < 60 ? mins + "m ago" : Math.round(mins / 60) + "h ago";
    };
    const rows = [
      ["this device", standing(d.localTotal)],
      ["account doc", standing(d.cloudTotal)],
      ["journal (expTotals)", standing(d.journalTotal)],
      ["pending grants", d.grants == null ? "—" : String(d.grants)],
      ["unsent exp events", String(d.queued)],
      ["account doc written", ago(d.storedAt)],
      ["saves asked / written", !p ? "—" : p.asked + " / " + p.started],
      ["saves ok / failed", !p ? "—" : p.ok + " / " + p.failed + (p.lastError ? " (" + p.lastError + ")" : "")],
      ["saves dropped", !p ? "—" : p.superseded + " superseded, " + p.skippedNoUser + " no user"],
    ];
    return `
          <div style="font-size:12px;line-height:1.7;margin-bottom:16px;border:1px dashed var(--line);border-radius:8px;padding:10px 12px;">
            <div style="opacity:.7;margin-bottom:6px;text-transform:uppercase;letter-spacing:.08em;font-size:10px;">Diagnosis (admin)</div>
            ${rows.map((r) => `<div style="display:flex;gap:8px;justify-content:space-between;"><span style="opacity:.75;">${escapeHtml(r[0])}</span><span style="unicode-bidi:plaintext;">${escapeHtml(r[1])}</span></div>`).join("")}
          </div>`;
  }

  function fmtElapsed(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
  SYS.fmtElapsed = fmtElapsed;

  // The log sheet: one place to put an amount on today, built around a keypad
  // rather than a text field. A number input on a phone opens the OS keyboard
  // over the thing you are looking at, and its own tiny spinners are a poor
  // target; here the dial, the units and the digits are all on screen at once
  // and the ring shows where today lands before you commit to it.
  // A quit habit's day has two answers and no number, so the dial and the
  // keypad would be furniture. The note is kept, because "why" is the most
  // useful thing anyone ever writes about a slip.
  function renderQuitSheet(task, ui) {
    const today = SYS.todayKey();
    // The sheet writes to the day it was opened for, which is not always
    // today, so it names that day rather than saying "today" and meaning
    // Thursday.
    const day = sheetDay(ui);
    const other = day !== today;
    const clean = SYS.habitDoneOn(task, day);
    const slipped = SYS.habitSlipOn(task, day);
    const streak = SYS.habitStreak(task, day);
    return `
      <div class="modal-backdrop" data-action="close-amount-backdrop">
        <div class="sys-panel modal-box log-sheet" data-stop-close="1" role="dialog" aria-label="${SYS.t("quit.decide")}">
          <div class="log-head">
            <span class="log-emoji">${escapeHtml(SYS.taskIcon(task))}</span>
            <span class="log-name">${escapeHtml(task.title)}</span>
          </div>
          <div class="quit-state ${slipped ? "slip" : clean ? "clean" : ""}">
            ${other
              ? (slipped ? SYS.t("quit.slippedOn", { day: dayLabel(day) })
                : clean ? SYS.t("quit.cleanOn", { day: dayLabel(day) })
                : SYS.t("quit.undecidedOn", { day: dayLabel(day) }))
              : (slipped ? SYS.t("quit.slippedToday") : clean ? SYS.t("quit.cleanToday") : SYS.t("quit.undecided"))}
          </div>
          <div class="log-today" style="margin-bottom:16px;">${streak.n > 0
            ? SYS.t("quit.streak", { n: streak.n })
            : SYS.t("quit.noStreak")}</div>
          <div class="quit-actions">
            <button class="btn ${clean ? "btn-outline" : "btn-primary"}" data-action="quit-clean" data-id="${escapeHtml(task.id)}" ${clean ? "disabled" : ""}>
              ${icon("check", 14)} ${SYS.t("quit.markClean")}
            </button>
            <button class="btn btn-outline quit-slip-btn" data-action="quit-slip" data-id="${escapeHtml(task.id)}" ${slipped ? "disabled" : ""}>
              ${icon("x", 14)} ${SYS.t("quit.markSlip")}
            </button>
          </div>
          ${(clean || slipped) ? `<button class="btn btn-ghost btn-sm" data-action="quit-reset" data-id="${escapeHtml(task.id)}" style="width:100%;margin-top:8px;">${SYS.t("quit.undo")}</button>` : ""}
          ${renderDayNote(task, ui)}
          <button class="btn btn-ghost" data-action="close-amount" style="width:100%;margin-top:10px;">${SYS.t("form.cancel")}</button>
        </div>
      </div>`;
  }

  function renderLogSheet(state, ui) {
    const task = state.tasks.find((x) => x.id === ui.amountFor);
    if (!task) return "";
    if (SYS.isQuitHabit(task)) return renderQuitSheet(task, ui);
    const today = SYS.todayKey();
    const day = sheetDay(ui);
    const goalBase = SYS.habitGoalBase(task);
    const doneBase = SYS.habitAmountOn(task, day);
    const family = SYS.unitFamily(task.unit);
    const selUnit = family.includes(ui.amountUnit) ? ui.amountUnit : task.unit;

    // What is typed, in the goal's own terms, so the ring can show the
    // landing point rather than a number in whichever unit is selected.
    const typed = Number(ui.amountValue);
    const pendingBase = Number.isFinite(typed) ? (SYS.toBase(typed, selUnit, task.unit) || 0) : 0;
    const pct = (v) => Math.max(0, Math.min(100, goalBase > 0 ? (v / goalBase) * 100 : 0));
    const donePct = pct(doneBase);
    const totalPct = pct(doneBase + pendingBase);

    const shown = ui.amountValue === "" || ui.amountValue == null ? "0" : String(ui.amountValue);
    const chips = family.length < 2 ? "" : `
        <div class="log-units">
          ${family.map((u) => `<button class="log-unit ${u === selUnit ? "on" : ""}" data-action="amount-unit" data-unit="${escapeHtml(u)}">${escapeHtml(SYS.tUnit(u))}</button>`).join("")}
        </div>`;

    // Digits stay in their usual places in every language: a keypad is a
    // shape people reach for without reading, and mirroring it in Arabic
    // would move every key.
    const key = (k, label, cls, aria) => `<button class="pad-key ${cls || ""}" data-action="amount-key" data-key="${k}"${aria ? ` aria-label="${aria}"` : ""}>${label}</button>`;
    const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => key(d, d));

    return `
      <div class="modal-backdrop" data-action="close-amount-backdrop">
        <div class="sys-panel modal-box log-sheet" data-stop-close="1" role="dialog" aria-label="${SYS.t("task.addAmount")}">
          <div class="log-head">
            <span class="log-emoji">${escapeHtml(SYS.taskIcon(task))}</span>
            <span class="log-name">${escapeHtml(task.title)}</span>
          </div>

          <div class="log-ring">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle class="ring-track" cx="60" cy="60" r="52" pathLength="100" />
              <circle class="ring-pending" cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="${totalPct} 100" />
              <circle class="ring-done" cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="${donePct} 100" />
            </svg>
            <div class="log-dial">
              <button class="log-step" data-action="amount-step" data-delta="-1" aria-label="${SYS.t("task.stepDown")}">${icon("minus", 16)}</button>
              <div class="log-value">
                <div class="log-num">${escapeHtml(shown)}</div>
                <div class="log-goal">${escapeHtml(SYS.tUnit(selUnit))}</div>
              </div>
              <button class="log-step" data-action="amount-step" data-delta="1" aria-label="${SYS.t("task.stepUp")}">${icon("plus", 16)}</button>
            </div>
          </div>

          <div class="log-today">${day === today
            ? SYS.t("task.today", { progress: progressText(task, day) })
            : SYS.t("task.onDay", { day: dayLabel(day), progress: progressText(task, day) })}</div>

          ${chips}

          <div class="keypad">
            ${digits[0]}${digits[1]}${digits[2]}${key("clear", "AC", "pad-fn", SYS.t("task.clearAmount"))}
            ${digits[3]}${digits[4]}${digits[5]}${key("back", icon("backspace", 16), "pad-fn", SYS.t("task.backspace"))}
            ${digits[6]}${digits[7]}${digits[8]}<button class="pad-key pad-add" data-action="commit-amount" data-id="${escapeHtml(task.id)}" ${typed > 0 ? "" : "disabled"}>${SYS.t("task.add")}</button>
            ${key("0", "0", "pad-zero")}${key(".", ".")}
          </div>

          ${renderDayNote(task, ui)}

          <div class="log-actions">
            <button class="btn btn-outline btn-icon-inline" data-action="undo-day" data-id="${escapeHtml(task.id)}" ${doneBase > 0 ? "" : "disabled"}>${icon("undo", 14)} ${SYS.t("task.clearDay")}</button>
            <button class="btn btn-outline btn-icon-inline" data-action="fill-day" data-id="${escapeHtml(task.id)}" ${doneBase >= goalBase ? "disabled" : ""}>${icon("check", 14)} ${SYS.t("task.markDone")}</button>
          </div>
          <button class="btn btn-ghost" data-action="close-amount" style="width:100%;margin-top:10px;">${SYS.t("form.cancel")}</button>
        </div>
      </div>`;
  }
  // The note, collapsed by default. Most logging is a number and nothing
  // else, so the field only takes room once you ask for it — and it says
  // whether there is already something written, so a note is never hidden
  // behind a control that looks empty.
  function renderDayNote(task, ui) {
    const day = sheetDay(ui);
    const existing = SYS.habitNoteOn(task, day);
    const open = !!ui.noteOpen;
    const recent = SYS.habitNotes(task, 6).filter((n) => n.key !== day);
    const toggle = `
        <button class="log-note-toggle ${existing ? "has" : ""}" data-action="toggle-note" aria-expanded="${open}">
          ${icon("pencil", 12)} ${existing ? SYS.t("task.noteEdit") : SYS.t("task.noteAdd")}
        </button>`;
    if (!open) return toggle;
    return toggle + `
        <div class="log-note">
          <textarea class="field-input note-input" rows="2" maxlength="${SYS.MAX_NOTE_CHARS}"
            data-action="commit-note" data-id="${escapeHtml(task.id)}"
            placeholder="${SYS.t("task.notePlaceholder")}">${escapeHtml(existing)}</textarea>
          ${!recent.length ? "" : `<div class="note-list">
            ${recent.map((n) => `<div class="note-row ${n.done ? "done" : ""}">
              <span class="note-date">${escapeHtml(shortDate(n.key))}</span>
              <span class="note-text">${escapeHtml(n.note)}</span>
            </div>`).join("")}
          </div>`}
        </div>`;
  }

  // "Sep 10" rather than "2026-09-10": these are read in a list, next to
  // each other, where the year is the same on every line.
  function shortDate(key) {
    const [y, m, d] = String(key).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString(dateLocale(), { month: "short", day: "numeric" });
  }

  // The library. Grouped, because twenty-eight rows in one column is a list
  // to scroll rather than a thing to choose from.
  //
  // Each row shows what it will actually create — the amount and the schedule
  // — so picking one is not a surprise. What it does not show is the EXP: the
  // price comes from the server when it is added, and printing a number here
  // that the server has not issued yet would be inventing one.
  function renderLibraryModal(state, ui) {
    const mine = new Set(state.tasks.filter((x) => x.fromLibrary).map((x) => x.fromLibrary));
    const groups = SYS.LIBRARY_CATEGORIES.map((cat) => {
      const rows = SYS.HABIT_LIBRARY.filter((p) => p.category === cat).map((p) => {
        const added = mine.has(p.id);
        const busy = ui.libraryBusy === p.id;
        const amount = p.targetAmount + " " + SYS.tUnit(p.unit);
        return `
          <div class="lib-row ${added ? "added" : ""}">
            <span class="lib-emoji">${escapeHtml(p.emoji)}</span>
            <span class="lib-main">
              <span class="lib-title">${escapeHtml(SYS.t("preset." + p.id))}</span>
              <span class="lib-meta">${escapeHtml(amount)} · ${escapeHtml(SYS.scheduleLabel(p))}</span>
            </span>
            ${added
              ? `<span class="lib-done">${icon("check", 12)} ${SYS.t("library.have")}</span>`
              : `<button class="btn btn-outline btn-sm" data-action="add-from-library" data-id="${escapeHtml(p.id)}" ${busy || ui.libraryBusy ? "disabled" : ""}>${busy ? SYS.t("library.adding") : SYS.t("task.add")}</button>`}
          </div>`;
      }).join("");
      return `<div class="lib-group">
          <div class="modal-section-label">${SYS.t("presetCat." + cat)}</div>
          ${rows}
        </div>`;
    }).join("");

    return `
      <div class="modal-backdrop" data-action="close-library-backdrop">
        <div class="sys-panel modal-box" data-stop-close="1">
          <div class="modal-title">${t("library.title")}</div>
          <div class="form-hint" style="margin-bottom:14px;">${t("library.body")}</div>
          ${ui.cloudUser ? "" : `<div class="form-hint" style="color:var(--gold-text);margin-bottom:14px;">${t("library.signIn")}</div>`}
          ${ui.libraryError ? `<div class="form-hint" style="color:var(--rust-text);margin-bottom:14px;">${escapeHtml(ui.libraryError)}</div>` : ""}
          ${groups}
          <button class="btn btn-ghost" data-action="close-library" style="width:100%;margin-top:14px;">${t("form.cancel")}</button>
        </div>
      </div>`;
  }

  // The clock face. Three looks over one number: a ring that fills or
  // empties, flip cards, or the digits on their own.
  //
  // Only the last digit animates. The panel is redrawn whole every second,
  // so animating every card would mean all four flipping once a second — and
  // the only digit that certainly changed is the last one.
  function renderTimerFace(shownMs, pct, opts) {
    const style = opts.style;
    const caption = opts.caption
      ? `<div class="timer-of" id="timer-caption">${escapeHtml(opts.caption)}</div>`
      : "";
    const inner = `
      <div class="timer-face">
        <div id="timer-display" class="timer-clock">${fmtElapsed(shownMs)}</div>
        ${caption}
      </div>`;

    if (style === "flip") {
      const total = Math.floor(shownMs / 1000);
      const hours = Math.floor(total / 3600);
      // Over an hour the left pair becomes hours, which is the only way four
      // cards can carry it.
      const left = hours > 0 ? hours : Math.floor((total % 3600) / 60);
      const right = hours > 0 ? Math.floor((total % 3600) / 60) : total % 60;
      const digits = [
        Math.floor(left / 10) % 10, left % 10,
        Math.floor(right / 10) % 10, right % 10,
      ];
      return `
        <div class="timer-flip ${opts.running ? "live" : ""}">
          ${digits.map((d, i) => `<div class="flip-card ${i === 3 ? "ticking" : ""}"><span>${d}</span></div>`).join("")}
        </div>
        ${opts.caption ? `<div class="timer-of" id="timer-caption" style="margin-top:8px;">${escapeHtml(opts.caption)}</div>` : ""}`;
    }

    if (style === "plain") {
      return `<div class="timer-plain ${opts.running ? "live" : ""}">${inner}</div>`;
    }

    return `
      <div class="timer-ring ${opts.running ? "live" : ""}">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle class="ring-track" cx="60" cy="60" r="52" pathLength="100" />
          <circle class="ring-done" cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="${pct} 100" />
        </svg>
        ${inner}
      </div>`;
  }

  // The timer panel: a ring, the time, and one button that matters.
  //
  // Two ways to run it. A stopwatch counts up and you stop it when you are
  // done; a countdown counts down and logs itself at zero. The countdown is
  // the one that needs care, because it writes to the ledger without anyone
  // pressing anything — see finishCountdown in main.js.
  //
  // The ring means different things in each mode, and that is the point: it
  // empties as a countdown runs out, and fills as a stopwatch approaches the
  // day's goal.
  function renderTimerModal(state, ui) {
    const t = state.tasks.find((x) => x.id === ui.timer.taskId);
    if (!t) return "";
    const s = state.settings || {};
    const countdown = ui.timer.mode === "countdown";
    const running = !!ui.timer.running;
    const elapsedMs = ui.timer.accumulatedMs + (running ? (Date.now() - ui.timer.startedAt) : 0);

    // Both modes count the day: what the habit already holds, plus the part
    // of this session not yet written to it. One counts it up, the other
    // counts what is left of the goal.
    const goalBase = SYS.habitGoalBase(t);
    const doneBase = SYS.habitAmountOn(t, SYS.todayKey());
    const unflushedMs = Math.max(0, elapsedMs - (Number(ui.timer.loggedMs) || 0));
    const todayMs = doneBase * 1000 + unflushedMs;
    const shownMs = countdown ? ceilSecond(goalBase * 1000 - todayMs) : todayMs;
    const pct = SYS.timerRingPct(t, todayMs);

    // Set when the timer was opened from a different habit's card: there is
    // one timer, and this is where it currently is.
    const busyElsewhere = ui.timerOpenedFor && ui.timerOpenedFor !== t.id;
    const busy = busyElsewhere
      ? `<div class="form-hint" style="color:var(--gold-text);margin:12px 0 0;line-height:1.5;">${SYS.t("timer.busyOn", { title: escapeHtml(t.title) })}</div>`
      : "";
    const restored = ui.timer.capped
      ? `<div class="form-hint" style="color:var(--gold-text);margin:12px 0 0;line-height:1.5;">${SYS.t("timer.capped")}</div>`
      : ui.timer.restored
        ? `<div class="form-hint" style="color:var(--gold-text);margin:12px 0 0;line-height:1.5;">${SYS.t("timer.restored")}</div>`
        : "";

    const idle = !running && (Number(ui.timer.loggedMs) || 0) < 1000 && elapsedMs < 1000;
    const modeRow = `
        <div class="timer-modes">
          ${["stopwatch", "countdown"].map((m) => `<button class="timer-mode ${ui.timer.mode === m ? "on" : ""}" data-action="timer-mode" data-mode="${m}">${SYS.t("timer." + m)}</button>`).join("")}
        </div>`;
    // No length to choose: the habit's goal is the length. Changing how long
    // the countdown runs means changing what the day asks for, and that
    // belongs in the habit, not in a timer.

    // One button. Everything measured is written down as it goes, so there is
    // nothing a second button could do that pausing does not already do.
    const controls = `
        <div class="timer-controls">
          ${running
            ? `<button class="btn btn-primary timer-play" data-action="timer-pause">${icon("pause", 15)} ${SYS.t("timer.pause")}</button>`
            : `<button class="btn btn-primary timer-play" data-action="timer-start">${icon("play", 15)} ${idle ? SYS.t("timer.start") : SYS.t("timer.resume")}</button>`}
        </div>`;

    const tools = `
        <div class="timer-tools">
          <button class="timer-tool ${ui.timerPanel === "style" ? "on" : ""}" data-action="timer-style-panel">${icon("grid", 12)} ${SYS.t("timer.style")}</button>
          <button class="timer-tool ${ui.timerPanel === "sound" ? "on" : ""}" data-action="timer-sound-panel">${icon("bell", 13)} ${SYS.t("timer.sound")}</button>
          <button class="timer-tool ${ui.noteOpen ? "on" : ""}" data-action="toggle-note">${icon("pencil", 12)} ${SYS.t("timer.note")}</button>
        </div>`;

    return `
      <div class="modal-backdrop" data-action="close-timer-backdrop">
        <div class="sys-panel modal-box timer-sheet" data-stop-close="1">
          <div class="modal-title">${SYS.t("timer.title")}</div>
          <div class="timer-habit">${escapeHtml(SYS.taskIcon(t))} ${escapeHtml(t.title)}</div>

          ${renderTimerFace(shownMs, pct, {
            style: (s.timerStyle === "flip" || s.timerStyle === "plain") ? s.timerStyle : "ring",
            running,
            caption: countdown ? "" : timerCaption(t, todayMs),
          })}

          ${modeRow}
          ${controls}
          ${tools}
          ${ui.timerPanel === "style" ? renderStylePicker(state) : ""}
          ${ui.timerPanel === "sound" ? renderSoundPicker(state, ui) : ""}
          ${ui.noteOpen ? renderDayNote(t, ui) : ""}
          ${busy}${restored}
          <div class="btn-row" style="gap:8px;margin-top:14px;">
            <button class="btn btn-ghost" data-action="close-timer" style="flex:1;">${SYS.t(running ? "timer.hide" : "timer.keep")}</button>
            <button class="btn btn-ghost" data-action="timer-discard" style="flex:1;" ${(Number(ui.timer.loggedMs) || 0) < 1000 ? "disabled" : ""}>${SYS.t("timer.discard")}</button>
          </div>
        </div>
      </div>`;
  }

  // Three looks, shown by name. Small enough that a preview would be more
  // clutter than help — the clock above changes as soon as one is picked.
  function renderStylePicker(state) {
    const chosen = (state.settings || {}).timerStyle || "ring";
    return `
        <div class="sound-picker">
          <div class="sound-list">
            ${["ring", "flip", "plain"].map((k) => `<button class="sound-row ${k === chosen ? "on" : ""}" data-action="pick-style" data-style="${k}">
              <span class="sound-name">${SYS.t("style." + k)}</span>
              ${k === chosen ? icon("check", 13) : ""}
            </button>`).join("")}
          </div>
        </div>`;
  }

  // Two lists, one tab each, like every sound picker anyone has used. Pressing
  // a name plays it: a list of words for sounds is unusable otherwise.
  function renderSoundPicker(state, ui) {
    const s = state.settings || {};
    const tab = ui.soundTab === "end" ? "end" : "focus";
    const names = tab === "end" ? SYS.END_SOUNDS : SYS.FOCUS_SOUNDS;
    const chosen = tab === "end" ? (s.endSound || "default") : (s.focusSound || "silent");
    return `
        <div class="sound-picker">
          <div class="sound-tabs">
            ${["focus", "end"].map((k) => `<button class="sound-tab ${tab === k ? "on" : ""}" data-action="timer-sound-tab" data-tab="${k}">${SYS.t(k === "end" ? "timer.endNotification" : "timer.focusSound")}</button>`).join("")}
          </div>
          ${tab === "focus" ? `<div class="form-hint" style="margin-bottom:8px;">${SYS.t("timer.pickHint")}</div>` : ""}
          <div class="sound-list">
            ${names.map((n) => {
              // A recording is fetched the first time it is chosen, and two
              // seconds of nothing after a press is indistinguishable from a
              // broken button — so the row says what is happening.
              const loading = SYS.soundLoading && SYS.soundLoading() === n;
              const sounding = tab === "focus" && SYS.currentFocusSound && SYS.currentFocusSound() === n && n !== "silent";
              const dead = tab === "focus" && SYS.soundUnavailable && SYS.soundUnavailable(n);
              const right = loading ? `<span class="sound-loading">${SYS.t("sound.loading")}</span>`
                : dead ? `<span class="sound-loading">${SYS.t("sound.unavailable")}</span>`
                : sounding ? `<span class="sound-playing">${SYS.t("sound.playing")}</span>`
                : n === chosen ? icon("check", 13) : "";
              return `<button class="sound-row ${n === chosen ? "on" : ""} ${sounding ? "sounding" : ""}" data-action="pick-sound" data-kind="${tab}" data-name="${n}">
              <span class="sound-name">${SYS.t("sound." + n)}</span>
              ${right}
            </button>`;
            }).join("")}
          </div>
          <div class="form-hint" style="margin-top:8px;line-height:1.5;">${SYS.t(tab === "end" ? "timer.soundsMade" : "timer.soundsFiles")}</div>
        </div>`;
  }
  // Reminders, in Settings rather than per habit: permission is a decision
  // about the whole app, and the times themselves live on the habits.
  //
  // The three things that have to be true are reported separately, because
  // they fail separately and each has a different fix — the app not being
  // installed, permission not granted, and no subscription stored are not
  // one problem with one answer.
  function renderRemindersSection(ui) {
    const state = ui.pushState || "unknown";
    const withTimes = (ui.remindCount || 0);
    if (!SYS.pushSupported || !SYS.pushSupported()) {
      const needsInstall = SYS.pushNeedsInstall && SYS.pushNeedsInstall();
      return `
        <div class="modal-section-label">${t("push.section")}</div>
        <div class="form-hint" style="line-height:1.6;">${needsInstall ? t("push.installFirst") : t("push.unsupported")}</div>`;
    }
    if (!ui.cloudUser) {
      return `
        <div class="modal-section-label">${t("push.section")}</div>
        <div class="form-hint">${t("push.signIn")}</div>`;
    }
    const line = state === "enabled" ? t("push.on")
      : state === "denied" ? t("push.blocked")
      : state === "busy" ? t("push.working")
      : t("push.off");
    return `
      <div class="modal-section-label">${t("push.section")}</div>
      <div class="form-hint" style="margin-bottom:10px;line-height:1.6;">${line}</div>
      ${state === "enabled" && withTimes === 0 ? `<div class="form-hint" style="color:var(--gold-text);margin-bottom:10px;line-height:1.6;">${t("push.noTimes")}</div>` : ""}
      <div class="btn-row" style="gap:8px;">
        ${state === "enabled"
          ? `<button class="btn btn-outline" data-action="push-test" ${ui.pushTesting ? "disabled" : ""}>${ui.pushTesting ? t("push.sending") : t("push.test")}</button>
             <button class="btn btn-ghost" data-action="push-disable">${t("push.turnOff")}</button>`
          : `<button class="btn btn-primary" data-action="push-enable" ${state === "busy" || state === "denied" ? "disabled" : ""}>${t("push.turnOn")}</button>`}
      </div>
      ${ui.pushTested ? `<div class="form-hint" style="color:var(--gold-text);margin-top:10px;line-height:1.6;">${t("push.testSent")}</div>` : ""}
      ${ui.pushError ? `<div class="form-hint" style="color:var(--rust-text);margin-top:10px;line-height:1.6;">${escapeHtml(ui.pushError)}</div>` : ""}`;
  }

  // Everyone this account has blocked, by their current name, so a block can
  // be undone without having to find the person again.
  function renderBlockedList(ui) {
    const list = ui.blockedList;
    let body;
    if (!list) body = `<div class="form-hint">${t("lb.loading")}</div>`;
    else if (!list.length) body = `<div class="form-hint">${t("blocks.none")}</div>`;
    else body = list.map((b) => `
      <div class="friend-row">
        <button class="friend-name blocked-who" data-action="open-profile" data-uid="${escapeHtml(b.uid)}">
          <span class="blocked-avatar" aria-hidden="true">${escapeHtml((b.avatar && SYS.AVATARS[b.avatar]) || SYS.DEFAULT_AVATAR)}</span>
          <span>${b.name ? escapeHtml(b.name) : t("blocks.noName")}</span>
        </button>
        <button class="btn btn-outline btn-sm" data-action="unblock" data-uid="${escapeHtml(b.uid)}" ${ui.unblockBusy === b.uid ? "disabled" : ""}>${t("profile.unblock")}</button>
      </div>`).join("");
    return `<div class="modal-section-label">${t("blocks.title")}</div>${body}`;
  }

  function renderAccountSection(ui) {
    if (!SYS.Cloud || !SYS.Cloud.available()) {
      return `
        <div class="modal-section-label">${t("account.section")}</div>
        <div class="form-hint">${t("account.notSetUp")}</div>`;
    }
    if (ui.cloudUser) {
      const unverified = ui.cloudUser.emailVerified === false;
      return `
        <div class="modal-section-label">${t("account.section")}</div>
        <div style="font-size:13px;color:var(--ink);margin-bottom:10px;">${t("account.signedInAs")} <b>${escapeHtml(ui.cloudUser.email)}</b></div>
        ${unverified ? `
          <div style="font-size:12px;color:var(--gold-text);margin-bottom:10px;line-height:1.5;">
            ${t("account.unverified")}
            <button class="link-btn" style="margin-inline-start:4px;" data-action="account-resend-verification">${t("account.resend")}</button>
          </div>` : ""}
        <div class="form-hint" style="margin-bottom:4px;">${ui.syncStatus ? escapeHtml(ui.syncStatus) : t("account.syncs")}</div>
        <div class="form-hint" style="margin-bottom:10px;color:${ui.nameClaimed ? "" : "var(--gold-text)"};">${ui.nameClaimed ? t("name.hint") : t("name.unclaimed")}</div>
        <div class="btn-row" style="flex-wrap:wrap;">
          <button class="btn btn-primary" data-action="open-my-profile">${t("profile.mine")}</button>
          <button class="btn btn-outline" data-action="account-sign-out">${t("account.signOut")}</button>
        </div>
        <button class="link-btn delete-account-link" data-action="open-delete-account">${t("delete.title")}</button>`;
    }
    const f = ui.accountForm || { mode: "signin", email: "", password: "", error: null, info: null, busy: false };
    return `
      <div class="modal-section-label">${t("account.section")}</div>
      <button class="btn btn-outline btn-icon-inline" style="width:100%;justify-content:center;" data-action="account-google">${GOOGLE_ICON_SVG} ${t("account.continueGoogle")}</button>
      <hr class="hr" style="margin:14px 0;" />
      <div class="theme-switcher" style="margin-bottom:12px;">
        <button class="theme-option ${f.mode === "signin" ? "active" : ""}" data-action="set-account-mode" data-mode="signin">${t("account.signIn")}</button>
        <button class="theme-option ${f.mode === "signup" ? "active" : ""}" data-action="set-account-mode" data-mode="signup">${t("account.createAccount")}</button>
      </div>
      <input class="field-input" style="margin-bottom:8px;" type="email" placeholder="${t("account.email")}" data-bind="accountForm.email" value="${escapeHtml(f.email)}" />
      <input class="field-input" style="margin-bottom:10px;" type="password" placeholder="${t("account.password")}" data-bind="accountForm.password" value="${escapeHtml(f.password)}" />
      ${f.mode === "signin" ? `<button class="link-btn" style="display:block;margin-top:-4px;margin-bottom:10px;" data-action="account-forgot-password">${t("account.forgot")}</button>` : ""}
      ${f.error ? `<div class="toast-error" style="margin-bottom:10px;">${escapeHtml(f.error)}</div>` : ""}
      ${f.info ? `<div class="form-hint" style="color:var(--gold-text);margin-bottom:10px;">${escapeHtml(f.info)}</div>` : ""}
      <button class="btn btn-primary" data-action="account-submit" ${f.busy ? "disabled" : ""}>${f.busy ? t("account.wait") : (f.mode === "signup" ? t("account.createBtn") : t("account.signInBtn"))}</button>
      <div class="form-hint" style="margin-top:8px;">${t("account.hint")}</div>`;
  }

  function renderSettingsModal(state, ui) {
    const s = ui.settingsDraft || state.settings;
    const resetArmed = ui.armed && ui.armed.kind === "reset";
    const allThemeNames = [...Object.keys(SYS.THEMES), SYS.CUSTOM_THEME_NAME];
    // Dropdowns rather than a row of pills: both lists are open-ended (more
    // themes and languages are expected), and seven pills already wrapped and
    // collided. A native select also scales to any length and gets the
    // platform's own picker and hover highlighting for free.
    const themeOptions = allThemeNames.map((name) =>
      `<option value="${escapeHtml(name)}" ${state.settings.theme === name ? "selected" : ""}>${escapeHtml(name)}</option>`
    ).join("");
    const languageOptions = Object.keys(SYS.LANGUAGES).map((code) =>
      `<option value="${code}" ${SYS.currentLanguage() === code ? "selected" : ""}>${escapeHtml(SYS.LANGUAGES[code].name)}</option>`
    ).join("");
    const custom = state.settings.customTheme || { dark: true, accent: "#d9a05b", base: "#141110" };
    // Only three choices, because everything else in the palette is derived
    // from them — that's what keeps a hand-picked theme readable instead of
    // letting someone land on grey text over a grey background.
    const customControls = state.settings.theme !== SYS.CUSTOM_THEME_NAME ? "" : `
      <div style="margin-top:12px;">
        <div class="theme-switcher" style="margin-bottom:10px;">
          <button class="theme-option ${custom.dark ? "active" : ""}" data-action="set-custom-mode" data-dark="1">${t("settings.dark")}</button>
          <button class="theme-option ${!custom.dark ? "active" : ""}" data-action="set-custom-mode" data-dark="0">${t("settings.light")}</button>
        </div>
        <div class="field-row">
          <div>
            <div class="field-label">${t("settings.accent")}</div>
            <input type="color" class="field-input" style="padding:2px;height:38px;" data-action="set-custom-accent" value="${escapeHtml(custom.accent)}" />
          </div>
          <div>
            <div class="field-label">${t("settings.background")}</div>
            <input type="color" class="field-input" style="padding:2px;height:38px;" data-action="set-custom-base" value="${escapeHtml(custom.base)}" />
          </div>
        </div>
        <div class="form-hint">${t("settings.derivedHint")}</div>
      </div>`;
    return `
      <div class="modal-backdrop" data-action="close-modal-backdrop">
        <div class="sys-panel modal-box" data-stop-close="1">
          <div class="modal-title">${t("settings.title")}</div>

          <div class="modal-section">
            <div class="modal-section-label">${t("settings.appearance")}</div>
            <select class="field-select" data-action="set-theme">${themeOptions}</select>
            ${customControls}
          </div>

          <hr class="hr" />

          <div class="modal-section">
            <div class="modal-section-label">${t("settings.language")}</div>
            <select class="field-select" data-action="set-language">${languageOptions}</select>
          </div>

          <hr class="hr" />

          <div class="modal-section">
            ${renderAccountSection(ui)}
          </div>

          <hr class="hr" />

          <div class="modal-section">
            ${renderRemindersSection(ui)}
          </div>

          <hr class="hr" />

          <div class="modal-section">
            <div class="modal-section-label">${t("nav.planner")}</div>
            <button class="chip filter-chip ${state.settings.plannerShowHabits ? "active" : ""}" data-action="toggle-planner-habits" aria-pressed="${!!state.settings.plannerShowHabits}">${t("planner.showHabits")}</button>
            <div class="form-hint" style="line-height:1.5;">${t("planner.showHabitsHint")}</div>
          </div>

          <hr class="hr" />

          <div class="modal-section">
            <div class="modal-section-label">${t("feedback.title")}</div>
            <div class="form-hint" style="margin-top:0;line-height:1.5;">${t("feedback.settingsHint")}</div>
            <button class="btn btn-outline btn-icon-inline" data-action="open-feedback" style="margin-top:8px;">${icon("flag", 13)} ${t("feedback.open")}</button>
          </div>

          <hr class="hr" />

          <div class="modal-section">
            <div class="modal-section-label">${t("settings.rules")}</div>
            <div class="form-hint" style="margin-top:0;">${t("settings.rulesFixed")}</div>
            <div class="rank-table">
              ${SYS.RANKS.map((r, i) => `
                <div class="rank-table-row ${state.player.rank === r ? "current" : ""}">
                  <span class="rank-table-rank">${SYS.rankArt(r, 38)}<span class="rank-table-letter">${escapeHtml(r)}</span></span>
                  <span class="rank-table-cost">${t("settings.perLevel", { n: SYS.RANK_LEVEL_EXP[i] })}</span>
                  <span class="rank-table-pts">${t("settings.pointsRate", { n: SYS.RANK_POINTS_PER_100_EXP[i] })}</span>
                </div>`).join("")}
            </div>
          </div>

          <hr class="hr" />

          <div class="modal-section">
            <div class="modal-section-label">${t("settings.backup")}</div>
            <div class="btn-row">
              <button class="btn btn-outline btn-icon-inline" data-action="export-backup">${icon("download", 13)} ${t("settings.export")}</button>
              <button class="btn btn-outline btn-icon-inline" data-action="import-backup">${icon("upload", 13)} ${t("settings.import")}</button>
            </div>
            <div class="form-hint">${t("settings.backupHint")}</div>
            ${ui.importError ? `<div class="toast-error">${escapeHtml(ui.importError)}</div>` : ""}
          </div>

          <hr class="hr" />

          <div class="modal-section">
            <div class="modal-section-label">${t("settings.danger")}</div>
            <button class="btn btn-danger-outline" data-action="reset-data">${resetArmed ? t("settings.resetConfirm") : t("settings.reset")}</button>
          </div>

          <hr class="hr" />
          <button class="btn btn-ghost" data-action="close-modal" style="width:100%;">${t("settings.close")}</button>
        </div>
      </div>`;
  }

})(window.SYS = window.SYS || {});

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
    { page: "stats", key: "nav.stats", icon: "bar" },
    { page: "leaderboard", key: "nav.leaderboard", icon: "trophy" },
    { page: "intelligence", key: "nav.intelligence", icon: "grid" },
    { page: "log", key: "nav.log", icon: "clock" },
  ];
  function renderSidebar(ui) {
    const navItems = ui.isAdmin ? [...NAV_ITEMS, { page: "admin", key: "nav.admin", icon: "shield" }] : NAV_ITEMS;
    const unreadCount = (ui.inbox || []).filter((m) => !m.read).length;
    const items = navItems.map((n) => `
      <button class="nav-item ${ui.page === n.page ? "active" : ""}" data-action="nav" data-page="${n.page}" aria-label="${t(n.key)}">
        ${icon(n.icon, 16)}<span class="nav-label">${t(n.key)}</span>${n.page === "log" && unreadCount > 0 ? `<span class="banked-tag" style="margin-inline-start:auto;">${unreadCount}</span>` : ""}
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
      <button class="nav-item nav-settings" data-action="open-settings" aria-label="${t("nav.settings")}">${icon("gear", 16)}<span class="nav-label">${t("nav.settings")}</span></button>`;
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
  function renderOverviewPage(state, ui) {
    const p = state.player;
    const radar = buildRadarSVG(state.intTypes, state.intelligences);
    const totalTraits = state.intTypes.reduce((s, t) => s + (state.intelligences[t.key] ? state.intelligences[t.key].traits.length : 0), 0);
    const activeQuests = state.tasks.filter((t) => !t.recurring && t.completion < 100).length;
    const habitCount = state.tasks.filter((t) => t.recurring).length;
    const recent = state.log.slice(0, 3);

    return `
      <div class="page-header">
        <div class="eyebrow">${t("overview.eyebrow")}</div>
      </div>

      <div class="level-ring-wrap">
        <div class="level-ring" style="background:conic-gradient(var(--gold) 0% ${Math.round((p.exp / SYS.levelCost(p.rank)) * 100)}%, var(--track) ${Math.round((p.exp / SYS.levelCost(p.rank)) * 100)}% 100%)">
          <div class="level-ring-inner">
            <span class="level-ring-label">${t("overview.level")}</span>
            <span class="level-ring-num">${p.level}</span>
            <span class="level-ring-xp">${t("overview.xpOf", { exp: p.exp, of: SYS.levelCost(p.rank) })}</span>
          </div>
        </div>
        <h1 class="page-hero-title" style="margin-top:18px;">${escapeHtml(p.name)}</h1>
        <div class="page-hero-sub">${t("overview.subtitle", { rank: p.rank, n: p.questsCompleted })}</div>
      </div>

      <div class="stat-tiles" style="margin-top:26px;">
        <div class="stat-tile"><div class="stat-num">${activeQuests}</div><div class="stat-label">${t("overview.activeQuests")}</div></div>
        <div class="stat-tile"><div class="stat-num">${habitCount}</div><div class="stat-label">${t("overview.habits")}</div></div>
        <div class="stat-tile"><div class="stat-num">${totalTraits}</div><div class="stat-label">${t("overview.traitsTracked")}</div></div>
      </div>

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
          : `<div>${recent.map((e) => `
              <div class="log-entry">
                <span style="color:var(--gold-text);margin-top:2px;flex-shrink:0;">${icon("chevronRight", 13)}</span>
                <span class="text">${escapeHtml(e.text)}</span>
                <span class="date">${escapeHtml(e.date)}</span>
              </div>`).join("")}</div>`}
      </div>`;
  }
  SYS.renderOverviewPage = renderOverviewPage;

  // ---------- Intelligence page (card grid) ----------
  function renderIntelligencePage(state, ui) {
    const cards = state.intTypes.map((t) => {
      const intel = state.intelligences[t.key];
      if (!intel) return "";
      const isOpen = !!ui.expanded[t.key];
      const avg = SYS.avgTraitLevel(intel);
      const barPct = Math.min(100, avg * 3.6);
      const addOpen = ui.addTraitOpen === t.key;
      const draft = ui.addTraitDraft && ui.addTraitDraft.key === t.key ? ui.addTraitDraft : { name: "", ar: "" };

      const traitRows = intel.traits.map((tr) => {
        const armed = ui.armed && ui.armed.kind === "trait" && ui.armed.id === tr.id;
        return `
          <div class="trait-row">
            <span class="name">${escapeHtml(tr.name)}${tr.ar ? `<span class="ar">${escapeHtml(tr.ar)}</span>` : ""}</span>
            <span style="display:flex;align-items:center;gap:8px;">
              <span class="lv">${SYS.t("intel.lv", { n: tr.level })}</span>
              ${!ui.isAdmin || SYS.isSeedTrait(t.key, tr.name) ? "" : `<button class="trait-del icon-mini ${armed ? "danger-arm" : ""}" data-action="remove-trait" data-key="${t.key}" data-trait="${tr.id}" aria-label="${SYS.t("intel.removeTrait")}" title="${armed ? SYS.t("intel.confirmAgain") : SYS.t("intel.removeTrait")}">${icon(armed ? "check" : "trash", 12)}</button>`}
            </span>
          </div>`;
      }).join("");

      // The index of categories and traits is the vocabulary every task is
      // measured against, so it is curated rather than personal. Left open, two
      // people would be scored on different axes and a shared ranking would
      // stop meaning anything.
      const addTraitBlock = !ui.isAdmin ? "" : addOpen
        ? `<div class="add-trait-row">
            <input class="field-input" style="padding:6px 9px;font-size:12px;" placeholder="${SYS.t("intel.traitName")}" data-bind="addTraitDraft.name" value="${escapeHtml(draft.name)}" />
            <input class="field-input" style="padding:6px 9px;font-size:12px;max-width:110px;" placeholder="${SYS.t("intel.arabicOpt")}" data-bind="addTraitDraft.ar" value="${escapeHtml(draft.ar)}" />
            <button class="btn btn-outline btn-sm" data-action="submit-add-trait" data-key="${t.key}">${SYS.t("intel.add")}</button>
            <button class="btn btn-ghost btn-sm" data-action="cancel-add-trait">${SYS.t("form.cancel")}</button>
          </div>`
        : `<button class="link-btn" data-action="open-add-trait" data-key="${t.key}" style="align-self:flex-start;">${SYS.t("intel.addTrait")}</button>`;

      return `
        <div class="sys-panel intel-card">
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
          <div class="intel-bar-track"><div class="intel-bar-fill" style="width:${barPct}%"></div></div>
          ${isOpen ? `
            <div class="trait-list">
              ${traitRows}
              ${intel.remainder > 0.01 ? `<div class="remainder-note">${SYS.t("intel.remainder", { pct: (intel.remainder * 100).toFixed(0) })}</div>` : ""}
            </div>
            <div style="margin-top:8px;">${addTraitBlock}</div>
          ` : ""}
        </div>`;
    }).join("");

    return `
      <div class="page-header">
        <div class="eyebrow">${t("intel.eyebrow")}</div>
        <h1 class="page-title">${t("intel.title")}</h1>
      </div>
      <div class="intel-grid">
        ${cards}
        ${!ui.isAdmin ? "" : `
        <button class="sys-panel add-category-card" data-action="open-add-category">
          <span style="font-size:20px;line-height:1;">+</span>
          <span>${t("intel.addCategory")}</span>
        </button>`}
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
        <div style="max-width:180px;">
          <div class="field-label">${t("form.remindAt")}</div>
          <input class="field-input" type="time" step="300" data-bind="taskForm.remindAt" value="${escapeHtml(f.remindAt || "")}" />
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
    const done = !recurring && t.completion >= 100;
    const armed = ui.armed && ui.armed.kind === "task" && ui.armed.id === t.id;
    const typeSpans = t.types.map((k) => { const info = state.intTypes.find((x) => x.key === k); return info ? `<span style="color:${escapeHtml(info.color)}" title="${escapeHtml(info.name)}">${escapeHtml(info.short)}</span>` : ""; }).join("");
    const expTotal = SYS.ptToExp(t.pt);

    const checkOrSpacer = recurring
      ? `<div class="check-btn" style="cursor:default;" aria-hidden="true" title="${SYS.t("task.recurringHabit")}">${icon("repeat", 15)}</div>`
      : (t.mode === "simple" || t.mode === "allAtOnce")
        ? `<button class="check-btn ${done ? "done" : ""}" data-action="${done ? "reopen-task" : "complete-task"}" data-id="${t.id}" aria-label="${done ? SYS.t("task.markIncomplete") : SYS.t("task.complete")}">${done ? icon("check", 15) : ""}</button>`
        : `<div style="width:36px;flex-shrink:0;"></div>`;

    const stepper = t.mode === "gradual" ? `
      <div class="stepper-row">
        <button class="step-btn" data-action="task-step" data-id="${t.id}" data-delta="-5" aria-label="${SYS.t("task.decrease")}">${icon("minus", 11)}</button>
        <input class="range-slider" type="range" min="0" max="100" step="1" value="${t.completion}" style="--pct:${t.completion}%" data-action="task-slide" data-id="${t.id}" aria-label="${SYS.t("task.setPct")}" />
        <span class="progress-pct">${t.completion}%</span>
        <button class="step-btn plus" data-action="task-step" data-id="${t.id}" data-delta="5" aria-label="${SYS.t("task.increase")}">${icon("plus", 11)}</button>
      </div>` : "";

    return `
      <div class="task-row ${done ? "done" : ""}">
        <div class="task-body">
          ${checkOrSpacer}
          <div style="flex:1;min-width:0;">
            <div class="task-title-row">
              <div class="task-title ${done ? "done" : ""}">${escapeHtml(t.title)}</div>
              <span class="task-reward">${recurring ? SYS.t("task.rewardPerRepeat", { n: expTotal.toFixed(0) }) : SYS.t("task.reward", { n: expTotal.toFixed(0) })}</span>
              <div class="task-actions">
                ${ui.cloudUser ? `<button class="icon-mini" data-action="open-appeal-form" data-id="${t.id}" aria-label="${SYS.t("task.appeal")}" title="${SYS.t("task.appeal")}">${icon("flag", 13)}</button>` : ""}
                <button class="icon-mini" data-action="edit-task" data-id="${t.id}" aria-label="${SYS.t("task.edit")}">${icon("pencil", 13)}</button>
                <button class="icon-mini ${armed ? "danger-arm" : ""}" data-action="delete-task" data-id="${t.id}" aria-label="${SYS.t("task.delete")}" title="${armed ? SYS.t("intel.confirmAgain") : SYS.t("task.delete")}">${icon(armed ? "check" : "trash", 13)}</button>
              </div>
            </div>
            <div class="task-meta">
              <span class="meta-pair"><span class="meta-label">${SYS.t("task.priority")}</span><span style="color:${PRIORITY_VAR[SYS.PRIORITY_COLOR[t.priority]]}">${SYS.t("priority." + t.priority)}</span></span>
              ${recurring
                ? `<span class="meta-pair"><span class="meta-label">${SYS.t("task.repeats")}</span><span>${escapeHtml(SYS.scheduleLabel(t))}</span></span>`
                : `<span class="meta-pair"><span class="meta-label">${SYS.t("task.term")}</span><span>${SYS.t("term." + t.taskType)}</span></span>`}
              ${typeSpans.length ? `<span class="meta-pair"><span class="meta-label">${SYS.t("task.type")}</span>${typeSpans}</span>` : ""}
              ${renderTaskTarget(state, t)}
            </div>
            ${t.notes ? `<div class="task-notes">${escapeHtml(t.notes)}</div>` : ""}
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

  function renderQuestsPage(state, ui) {
    const showingForm = !!ui.taskForm && !ui.taskForm.recurring;
    const filter = ui.questFilter || "all";
    const oneOff = state.tasks.filter((t) => !t.recurring);
    const filtered = oneOff.filter((t) => filter === "all" ? true : filter === "active" ? t.completion < 100 : t.completion >= 100);
    const tasks = filtered.map((t) => renderTaskRow(state, ui, t)).join("");
    const filterChips = QUEST_FILTERS.map((f) => `<button class="chip filter-chip ${filter === f.key ? "active" : ""}" data-action="set-quest-filter" data-filter="${f.key}">${t(f.tkey)}</button>`).join("");

    return `
      <div class="page-header">
        <div class="eyebrow">${t("quests.eyebrow")}</div>
        <h1 class="page-title">${t("quests.title")}</h1>
      </div>
      <div class="sys-panel panel-pad">
        <div class="panel-head">
          <div class="chip-group">${filterChips}</div>
          ${!showingForm ? `<button class="btn btn-outline btn-icon-inline" data-action="open-quest-form">${icon("plus", 14)} ${t("quests.new")}</button>` : ""}
        </div>
        ${showingForm ? renderTaskForm(state, ui) : ""}
        ${filtered.length === 0 ? `<div class="empty-note">${oneOff.length === 0 ? t("quests.empty") : t("quests.emptyFilter")}</div>` : `<div>${tasks}</div>`}
      </div>
      ${renderSuggestionsSection(state, ui)}
      ${renderAppealSection(ui)}`;
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
    // Which days any habit was ticked on.
    const active = new Set();
    state.tasks.filter((x) => x.recurring).forEach((x) => {
      Object.keys(SYS.habitDays(x)).forEach((k) => { if (SYS.habitDoneOn(x, k)) active.add(k); });
    });
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
        <span class="wk-num">${d.getDate()}</span>
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
      return `<button class="hday ${on ? "on" : ""} ${k === today ? "now" : ""} ${k === day ? "sel" : ""} ${off ? "idle" : ""} ${dayNote ? "noted" : ""} ${slip ? "slipped" : ""}" ${future ? "disabled" : ""}
        data-action="toggle-habit-day" data-id="${t.id}" data-day="${k}"
        aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"></button>`;
    }).join("");
    return `
      <div class="habit-card ${done ? "done" : ""}">
        <div class="habit-icon ${dayPct >= 100 ? "full" : ""}" title="${escapeHtml(progressText(t, day))}">
          ${ringSvg(dayPct, "habit-ring")}
          <span class="habit-emoji">${escapeHtml(SYS.taskIcon(t))}</span>
        </div>
        <div class="habit-main">
          <div class="habit-title">${escapeHtml(t.title)}</div>
          <div class="habit-sub">
            <span class="habit-sched">${escapeHtml(SYS.scheduleLabel(t))}</span>
            ${t.remindAt ? `<span class="habit-remind">${icon("bell", 10)} ${escapeHtml(t.remindAt)}</span>` : ""}
            ${quitting
              ? `<span class="habit-amt">${day === today
                  ? (slippedToday ? SYS.t("quit.slippedToday") : SYS.t("quit.clean"))
                  : (slippedToday ? SYS.t("quit.slippedOn", { day: dayLabel(day) }) : SYS.t("quit.cleanDay", { day: dayLabel(day) }))}</span>`
              : `<span class="habit-amt">${escapeHtml(progressText(t, day))}</span>`}
            <span class="habit-xp">+${exp} xp</span>
            ${streak.n >= 2 ? `<span class="habit-streak">${SYS.t("task.streak." + streak.scope, { n: streak.n })}</span>` : ""}
          </div>
          <div class="hdays">${dots}</div>
        </div>
        <div class="habit-side">
          ${quitting
            ? `<button class="habit-check ${loggedToday ? "hit" : ""} ${slippedToday ? "slip" : ""}" data-action="open-amount" data-id="${t.id}"
                aria-haspopup="dialog" ${ahead ? "disabled" : ""}
                aria-label="${ahead ? SYS.t("habits.futureLocked") : SYS.t("quit.decide")}" title="${ahead ? SYS.t("habits.futureLocked") : SYS.t("quit.decide")}">${icon(slippedToday ? "x" : loggedToday ? "check" : "shield", 18)}</button>`
            : `<button class="habit-check ${loggedToday ? "hit" : ""}" data-action="open-amount" data-id="${t.id}"
                aria-haspopup="dialog" ${ahead ? "disabled" : ""}
                aria-label="${ahead ? SYS.t("habits.futureLocked") : SYS.t("task.addAmount")}" title="${ahead ? SYS.t("habits.futureLocked") : SYS.t("task.addAmount")}">${icon(loggedToday ? "check" : "plus", 18)}</button>`}
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

  function renderHabitsPage(state, ui) {
    const showingForm = !!ui.taskForm && ui.taskForm.recurring;
    // Archived habits are gone from here, which is the whole point of
    // archiving. They are still reachable — and un-archivable — from the
    // faint chips at the end of the Stats page's scope row.
    const habits = state.tasks.filter((t) => t.recurring && !SYS.isArchived(t));
    const rows = habits.map((t) => renderHabitCard(state, ui, t)).join("");

    return `
      <div class="page-header">
        <div class="eyebrow">${t("habits.eyebrow")}</div>
        <h1 class="page-title">${t("habits.title")}</h1>
      </div>
      <div class="sys-panel panel-pad">
        <div class="panel-head">
          <span></span>
          ${!showingForm ? `<button class="btn btn-outline btn-icon-inline" data-action="open-library">${icon("grid", 14)} ${t("library.button")}</button>` : ""}
          ${!showingForm ? `<button class="btn btn-outline btn-icon-inline" data-action="open-habit-form">${icon("plus", 14)} ${t("habits.new")}</button>` : ""}
        </div>
        ${showingForm ? renderTaskForm(state, ui) : ""}
        ${habits.length === 0 ? `<div class="empty-note">${t("habits.empty")}</div>` : renderWeekStrip(state, ui) + renderDayBanner(ui) + `<div class="habit-list">${rows}</div>`}
      </div>
      ${renderAppealSection(ui)}`;
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
    const sec = Math.round(base);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
    if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
    return `${s}s`;
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

  function renderStatsPage(state, ui) {
    const habits = state.tasks.filter((x) => x.recurring);
    const scope = ui.statsScope && habits.some((x) => x.id === ui.statsScope) ? ui.statsScope : null;
    const task = scope ? habits.find((x) => x.id === scope) : null;
    const offset = Number(ui.statsMonthOffset) || 0;
    const base = new Date();
    base.setMonth(base.getMonth() + offset, 1);
    const year = base.getFullYear(), month = base.getMonth();
    const monthName = base.toLocaleDateString(dateLocale(), { month: "long" });

    const header = `
      <div class="page-header">
        <div class="eyebrow">${t("stats.eyebrow")}</div>
        <h1 class="page-title">${escapeHtml(task ? task.title : t("stats.title"))}</h1>
      </div>`;

    if (!habits.length) {
      return header + `<div class="sys-panel panel-pad"><div class="empty-note">${t("stats.noHabits")}</div></div>`;
    }

    if (!task) {
      const all = SYS.statsAllTime(state);
      const rate = SYS.monthRate(state, null, year, month);
      return header + renderScopeChips(state, ui) + renderMonthCard(state, ui)
        + renderGauge(rate, t("stats.monthlyRate"), t("stats.rateHint"))
        + `<div class="stat-tiles">
            ${tile(all.perfectDays, t("stats.perfectDays"), t("stats.unitDays"))}
            ${tile(all.bestStreak, t("stats.bestStreak"), t("stats.unitDays"))}
            ${tile(all.habitsDone, t("stats.habitsDone"))}
            ${tile(all.dailyAverage >= 10 ? Math.round(all.dailyAverage) : Math.round(all.dailyAverage * 10) / 10, t("stats.dailyAverage"))}
          </div>`
        + renderDoneToday(state)
        + `<div class="sys-panel panel-pad" style="margin-top:16px;">
            <div class="card-head"><span class="card-title">${t("stats.expByMonth")}</span></div>
            ${renderLifetimeStats(ui)}
          </div>`;
    }

    const st = SYS.habitStats(task, year, month);
    const rate = SYS.monthRate(state, task.id, year, month);
    const archived = SYS.isArchived(task);
    // Pressing Edit down here used to set the form up and leave it on the
    // Habits page, so nothing appeared to happen until you went looking for
    // it. The form is rendered wherever it was opened from instead.
    const editing = ui.taskForm && ui.taskForm.formKind === "edit" && ui.taskForm.editId === task.id;
    return header + renderScopeChips(state, ui)
      + (archived ? `<div class="day-banner ahead" style="margin-bottom:12px;">${icon("download", 13)}<span>${t("stats.archivedNote")}</span></div>` : "")
      + (editing ? `<div class="sys-panel panel-pad" style="margin-bottom:16px;">${renderTaskForm(state, ui)}</div>` : "")
      + renderMonthCard(state, ui)
      + renderYearCard(state, ui, task)
      + `<div class="stat-tiles" style="margin-top:16px;">
          ${tile(st.successMonth, t("stats.successIn", { month: escapeHtml(monthName) }), t("stats.unitDays"))}
          ${tile(st.successTotal, t("stats.totalSuccess"), t("stats.unitDays"))}
          ${tile(st.currentStreak, t("stats.currentStreak"), t("stats.unitDays"))}
          ${tile(st.bestStreak, t("stats.bestStreak"), t("stats.unitDays"))}
          ${tile(fmtVolume(task, st.volMonth), t("stats.volIn", { month: escapeHtml(monthName) }))}
          ${tile(fmtVolume(task, st.volTotal), t("stats.volTotal"))}
          ${tile(fmtVolume(task, st.dailyAvg), t("stats.dailyAvg"))}
          ${tile(rate >= 10 ? Math.round(rate) : Math.round(rate * 10) / 10, t("stats.monthlyRate"), "%")}
        </div>`
      + renderMemosCard(task)
      + `<div class="habit-actions">
          <button class="btn btn-outline btn-icon-inline" data-action="edit-task" data-id="${escapeHtml(task.id)}">${icon("pencil", 14)} ${t("stats.editHabit")}</button>
          <button class="btn btn-outline btn-icon-inline" data-action="${archived ? "unarchive-habit" : "archive-habit"}" data-id="${escapeHtml(task.id)}">${icon(archived ? "upload" : "download", 14)} ${archived ? t("stats.unarchive") : t("stats.archive")}</button>
          ${(() => {
            // A full-width labelled button needs the confirmation in words.
            // Arming used to change only a border colour here, which is how a
            // two-press delete reads as a one-press delete.
            const armed = ui.armed && ui.armed.kind === "task" && ui.armed.id === task.id;
            return `<button class="btn btn-ghost btn-icon-inline ${armed ? "danger-arm" : ""}" data-action="delete-task" data-id="${escapeHtml(task.id)}">${icon(armed ? "check" : "trash", 14)} ${armed ? t("intel.confirmAgain") : t("stats.deleteHabit")}</button>`;
          })()}
        </div>`;
  }
  SYS.renderStatsPage = renderStatsPage;

  // ---------- Log page ----------
  function renderInboxSection(ui) {
    if (!ui.cloudUser || !ui.inbox.length) return "";
    const rows = ui.inbox.map((m) => `
      <div class="log-entry ${m.read ? "" : "unread"}" ${m.read ? "" : `data-action="mark-inbox-read" data-id="${m.id}" style="cursor:pointer;"`}>
        <span style="color:${m.read ? "var(--dim)" : "var(--gold-text)"};margin-top:2px;flex-shrink:0;">${icon("chevronRight", 13)}</span>
        <span class="text">${escapeHtml(m.text)}${m.amount ? ` <b style="color:${m.amount > 0 ? "var(--gold-text)" : "var(--rust-text)"}">${t("log.expChange", { sign: m.amount > 0 ? "+" : "", n: escapeHtml(m.amount) })}</b>` : ""}</span>
        ${!m.read ? `<span class="date" style="color:var(--gold-text);">${t("log.new")}</span>` : ""}
      </div>`).join("");
    return `
      <div class="sys-panel panel-pad" style="margin-bottom:16px;">
        <div class="eyebrow" style="margin-bottom:6px;">${t("log.fromSystem")}</div>
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
  function renderLeaderboardRow(r, position, isMe) {
    const posColor = position != null && position <= 3 ? "var(--gold-text)" : "var(--dim)";
    // Rank and level are read back out of the one number the server vouches
    // for, rather than shown as the client reported them alongside it — so a
    // row cannot claim a standing its EXP doesn't support.
    const standing = SYS.expToStanding(r.totalExp);
    return `
      <div class="lb-row ${isMe ? "me" : ""}">
        <span class="lb-pos" style="color:${posColor};">${position == null ? "—" : escapeHtml(position)}</span>
        <span class="lb-player">
          <span class="lb-name">${escapeHtml(r.displayName || "—")}${isMe ? ` <span class="lb-you-tag">${t("lb.you")}</span>` : ""}</span>
          <span class="lb-meta">${t("lb.playerLine", { rank: escapeHtml(standing.rank), level: escapeHtml(standing.level) })}</span>
        </span>
        <span class="lb-quests">${escapeHtml(r.questsCompleted)}</span>
        <span class="lb-total">${escapeHtml(r.totalExp)}</span>
      </div>`;
  }

  function renderLeaderboardPage(state, ui) {
    const header = `
      <div class="page-header">
        <div class="eyebrow">${t("lb.eyebrow")}</div>
        <h1 class="page-title">${t("lb.title")}</h1>
      </div>`;

    // Being ranked at all requires an account, so there is nothing useful to
    // show a signed-out visitor — and nothing to compare them against.
    if (!ui.cloudUser) {
      return header + `<div class="sys-panel panel-pad"><div class="empty-note">${t("lb.signedOut")}</div></div>`;
    }

    const rows = ui.leaderboard || [];
    const myUid = ui.cloudUser.uid;

    let running = 0, prevTotal = null;
    const positions = rows.map((r, i) => {
      if (r.totalExp !== prevTotal) { running = i + 1; prevTotal = r.totalExp; }
      return running;
    });
    const meIndex = rows.findIndex((r) => r.uid === myUid);

    let body;
    if (ui.leaderboardError) {
      body = `<div class="toast-error">${escapeHtml(ui.leaderboardError)}</div>`;
    } else if (ui.leaderboardBusy && !rows.length) {
      body = `<div class="empty-note">${t("lb.loading")}</div>`;
    } else if (!rows.length) {
      body = `<div class="empty-note">${t("lb.empty")}</div>`;
    } else {
      body = `
        <div class="lb-row lb-head">
          <span class="lb-pos">#</span>
          <span class="lb-player">${t("lb.colPlayer")}</span>
          <span class="lb-quests">${t("lb.colQuests")}</span>
          <span class="lb-total">${t("lb.colTotal")}</span>
        </div>` + rows.map((r, i) => renderLeaderboardRow(r, positions[i], r.uid === myUid)).join("");
    }

    // Three different reasons someone can be missing from the list, and they
    // need three different answers — "you're not here" with no explanation is
    // the one outcome a ranking page must never produce.
    let selfBlock = "";
    if (!ui.nameClaimed) {
      selfBlock = `<div class="sys-panel panel-pad" style="margin-top:16px;"><div class="form-hint" style="color:var(--gold-text);">${t("lb.unclaimedName")}</div></div>`;
    } else if (rows.length && meIndex === -1 && !ui.leaderboardBusy && !ui.leaderboardError) {
      selfBlock = ui.leaderboardMine
        ? `<div class="sys-panel panel-pad" style="margin-top:16px;">
             <div class="form-hint" style="margin-bottom:10px;">${t("lb.outsideTop", { n: rows.length })}</div>
             ${renderLeaderboardRow(ui.leaderboardMine, ui.leaderboardMyPosition, true)}
             ${ui.leaderboardMyPosition == null ? `<div class="form-hint" style="margin-top:8px;">${t("lb.positionUnknown")}</div>` : ""}
           </div>`
        : `<div class="sys-panel panel-pad" style="margin-top:16px;"><div class="form-hint">${t("lb.pending")}</div></div>`;
    }

    return header + `
      <div class="sys-panel panel-pad">
        <div class="lb-top">
          <span class="form-hint" style="margin:0;">${t("lb.subtitle")}</span>
          <button class="link-btn" data-action="refresh-leaderboard" ${ui.leaderboardBusy ? "disabled" : ""}>${t("lb.refresh")}</button>
        </div>
        ${body}
      </div>` + selfBlock;
  }
  SYS.renderLeaderboardPage = renderLeaderboardPage;

  function renderLogPage(state, ui) {
    const entries = state.log.length === 0
      ? `<div class="empty-note" style="padding:4px;">${t("overview.noMilestones")}</div>`
      : `<div>${state.log.map((e) => `
          <div class="log-entry">
            <span style="color:var(--gold-text);margin-top:2px;flex-shrink:0;">${icon("chevronRight", 13)}</span>
            <span class="text">${escapeHtml(e.text)}</span>
            <span class="date">${escapeHtml(e.date)}</span>
          </div>`).join("")}</div>`;
    return `
      <div class="page-header">
        <div class="eyebrow">${t("log.eyebrow")}</div>
        <h1 class="page-title">${t("log.title")}</h1>
      </div>
      ${renderInboxSection(ui)}
      <div class="sys-panel panel-pad">${entries}</div>`;
  }
  SYS.renderLogPage = renderLogPage;

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
        <div style="font-size:13px;color:var(--ink);margin-bottom:4px;"><b>${escapeHtml(r.name || r.email)}</b>${r.name && r.email ? ` · ${escapeHtml(r.email)}` : ""}</div>
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--faint);margin-bottom:14px;">${escapeHtml(r.uid)}</div>
        ${r.state ? `
          <div class="stat-tiles">
            <div class="stat-tile"><div class="stat-num">${escapeHtml(r.state.player.rank)}</div><div class="stat-label">${t("admin.rank")}</div></div>
            <div class="stat-tile"><div class="stat-num">${escapeHtml(r.state.player.level)}</div><div class="stat-label">${t("admin.level")}</div></div>
            <div class="stat-tile"><div class="stat-num">${escapeHtml(r.state.player.exp)}</div><div class="stat-label">${t("admin.exp")}</div></div>
            <div class="stat-tile"><div class="stat-num">${escapeHtml(r.state.player.questsCompleted)}</div><div class="stat-label">${t("admin.questsDone")}</div></div>
          </div>` : `<div class="empty-note">${t("admin.noProgress")}</div>`}
        ${renderStandingProvenance(r)}
        <div class="form-hint" style="margin-top:14px;">${t("admin.currently", { status: r.isTargetAdmin ? t("admin.isAdmin") : t("admin.notAdmin") })}</div>
        <div class="btn-row" style="margin-top:8px;">
          <button class="btn btn-outline ${grantArmed ? "danger-arm" : ""}" data-action="admin-grant-admin" data-email="${escapeHtml(r.email)}" ${(ui.adminBusy || r.isTargetAdmin) ? "disabled" : ""}>${grantArmed ? t("intel.confirmAgain") : t("admin.makeAdmin")}</button>
          <button class="btn btn-danger-outline ${revokeArmed ? "danger-arm" : ""}" data-action="admin-revoke-admin" data-email="${escapeHtml(r.email)}" ${(ui.adminBusy || !r.isTargetAdmin) ? "disabled" : ""}>${revokeArmed ? t("intel.confirmAgain") : t("admin.removeAdmin")}</button>
        </div>
        <hr class="hr" />
        <div class="modal-section-label">${t("admin.sendMessage")}</div>
        <textarea class="field-textarea" placeholder="${t("admin.messagePlaceholder")}" data-bind="adminMsgText">${escapeHtml(ui.adminMsgText)}</textarea>
        <div class="field-row" style="margin-top:8px;align-items:flex-start;">
          <input class="field-input" type="number" step="any" placeholder="${t("admin.amountPlaceholder")}" data-bind="adminMsgAmount" value="${escapeHtml(ui.adminMsgAmount)}" />
          <button class="btn btn-primary" data-action="admin-send-adjustment" style="flex-shrink:0;" ${ui.adminMsgBusy ? "disabled" : ""}>${ui.adminMsgBusy ? t("admin.sending") : t("admin.send")}</button>
        </div>
        <div class="form-hint">${t("admin.adjustHint")}</div>
        ${ui.adminMsgError ? `<div class="toast-error">${escapeHtml(ui.adminMsgError)}</div>` : ""}
      </div>`;

    return `
      <div class="page-header">
        <div class="eyebrow">${t("admin.eyebrow")}</div>
        <h1 class="page-title">${t("admin.title")}</h1>
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
      ${renderAdminAppealQueue(ui)}`;
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
          <button class="link-btn" data-action="admin-refresh-appeals" ${ui.adminAppealBusy ? "disabled" : ""}>${t("admin.refresh")}</button>
        </div>
        ${ui.adminAppealError ? `<div class="toast-error">${escapeHtml(ui.adminAppealError)}</div>` : ""}
        ${ui.adminAppealQueue.length === 0 ? `<div class="empty-note">${t("admin.nothingPending")}</div>` : rows}
      </div>`;
  }

  // ---------- page dispatcher ----------
  function renderPage(state, ui) {
    switch (ui.page) {
      case "quests": return renderQuestsPage(state, ui);
      case "habits": return renderHabitsPage(state, ui);
      case "stats": return renderStatsPage(state, ui);
      case "intelligence": return renderIntelligencePage(state, ui);
      case "leaderboard": return renderLeaderboardPage(state, ui);
      case "log": return renderLogPage(state, ui);
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
          <div class="notif-text">${escapeHtml(n.text)}</div>
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
        <div class="rankup-ring"><div class="rankup-ring-inner"><span class="rankup-letter">${rank}</span></div></div>
        <div class="rankup-sub">${escapeHtml(ui.rankupShowing.text)}</div>
        <div class="rankup-hint">${t("rankup.dismiss")}</div>
      </div>`;
  }
  SYS.renderRankupLayer = renderRankupLayer;

  // ---------- modal ----------
  function renderModalLayer(state, ui) {
    if (!ui.modal) return "";
    if (ui.modal === "settings") return renderSettingsModal(state, ui);
    if (ui.modal === "addCategory") return renderAddCategoryModal(state, ui);
    if (ui.modal === "timer") return renderTimerModal(state, ui);
    if (ui.modal === "logAmount") return renderLogSheet(state, ui);
    if (ui.modal === "library") return renderLibraryModal(state, ui);
    if (ui.modal === "syncChoice") return renderSyncChoiceModal(state, ui);
    if (ui.modal === "day") return renderDaySheet(state, ui);
    return "";
  }
  SYS.renderModalLayer = renderModalLayer;

  function renderSyncChoiceModal(state, ui) {
    // Asking which copy to keep without saying what differs makes the answer a
    // guess. It also hid a repeating prompt: something disagreed on every
    // launch and nothing on screen said what.
    const rows = SYS.describeStateDiff(state, ui.pendingCloudState) || [];
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
        <button class="btn btn-outline" data-action="account-sign-out">${t("account.signOut")}</button>`;
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
            <div class="modal-section-label">${t("settings.rules")}</div>
            <div class="form-hint" style="margin-top:0;">${t("settings.rulesFixed")}</div>
            <div class="rank-table">
              ${SYS.RANKS.map((r, i) => `
                <div class="rank-table-row ${state.player.rank === r ? "current" : ""}">
                  <span class="rank-table-rank">${escapeHtml(r)}</span>
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

  function renderAddCategoryModal(state, ui) {
    const d = ui.addCategoryDraft || { name: "", ar: "", short: "", color: "#cf9a5c" };
    return `
      <div class="modal-backdrop" data-action="close-modal-backdrop">
        <div class="sys-panel modal-box" data-stop-close="1">
          <div class="modal-title">${t("intel.newCategory")}</div>
          <div class="modal-section">
            <label class="field-label">${t("intel.name")}</label>
            <input class="field-input" data-bind="addCategoryDraft.name" value="${escapeHtml(d.name)}" placeholder="${t("intel.namePlaceholder")}" />
          </div>
          <div class="modal-section">
            <label class="field-label">${t("intel.arabicName")}</label>
            <input class="field-input" data-bind="addCategoryDraft.ar" value="${escapeHtml(d.ar)}" />
          </div>
          <div class="field-row">
            <div>
              <label class="field-label">${t("intel.shortCode")}</label>
              <input class="field-input" data-bind="addCategoryDraft.short" maxlength="6" value="${escapeHtml(d.short)}" placeholder="${t("intel.shortPlaceholder")}" />
            </div>
            <div>
              <label class="field-label">${t("intel.color")}</label>
              <input type="color" class="field-input" style="padding:2px;height:38px;" data-bind="addCategoryDraft.color" value="${escapeHtml(d.color)}" />
            </div>
          </div>
          ${ui.addCategoryError ? `<div class="toast-error">${escapeHtml(ui.addCategoryError)}</div>` : ""}
          <div class="btn-row" style="justify-content:flex-end;margin-top:16px;">
            <button class="btn btn-ghost" data-action="close-modal">${t("form.cancel")}</button>
            <button class="btn btn-primary" data-action="submit-add-category">${t("intel.createCategory")}</button>
          </div>
        </div>
      </div>`;
  }
})(window.SYS = window.SYS || {});

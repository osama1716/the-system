// Pure(ish) rendering: builds HTML/SVG strings from (state, uiState). No mutation,
// no event wiring here — main.js owns the store and delegates all events.
//
// UI, shared pieces: text helpers, icons, the sidebar and status bar, help and guide windows,
// the assessment, ranks and the overview's parts.
// One of the files ui.js was split into; the names they share travel through SYS._ui.
(function (SYS) {
  "use strict";
  const U = SYS._ui || (SYS._ui = {});

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
    return U.fmtElapsed(todayMs) + " / " + U.fmtElapsed(goalMs);
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
    if (SYS.isTimeUnit(task.unit)) return U.fmtElapsed(doneBase * 1000) + " / " + U.fmtElapsed(goalBase * 1000);
    const done = SYS.fromBase(doneBase, task.unit);
    const goal = Number(task.targetAmount) || 1;
    return done + " / " + goal + " " + SYS.tUnit(task.unit, goal);
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
    flame: `<path d="M12 3c.6 3.2 4.8 5.3 4.8 10.2A4.8 4.8 0 0 1 12 18a4.8 4.8 0 0 1-4.8-4.8c0-2.3 1.2-3.8 2.3-4.9.3 1.5 1 2.5 1.9 3 .6-2.9-.4-5.6.6-8.3z"/><path d="M8 21h8"/>`,
    lock: `<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>`,
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

  // `recent` is optional: a second set of values per category, drawn inside
  // the first. The outer outline is the lifetime total and is always there;
  // this one is what the last ninety days built, and the gap between them is
  // the part that says "built once, untouched since".
  function buildRadarSVG(intTypes, intelligences, recent) {
    const n = intTypes.length;
    if (n < 3) return `<div style="color:var(--faint);font-size:12px;text-align:center;padding:20px;">${t("overview.radarNeedsMore")}</div>`;
    const size = 260, cx = size / 2, cy = size / 2, R = 90, rings = 4;
    const avgs = intTypes.map((t) => SYS.categoryScore(intelligences[t.key]));
    // Headroom is proportional now that the numbers are sums rather than
    // averages: a flat "+3" was a fifth of the scale at average size and
    // invisible at a few hundred points. The floor keeps an empty radar from
    // dividing by nothing.
    const maxVal = Math.max(10, ...avgs) * 1.18;
    const angleFor = (i) => -Math.PI / 2 + i * ((2 * Math.PI) / n);

    // The emblem for one intelligence, or its short code when it has none.
    // Callers pass the whole type object; the radar in a public profile only
    // carries key and short, so nothing here may depend on colour or name.
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
      // An <image> rather than a <text>: the axis wears the same emblem the
      // cards below it do, so the two read as the same eight things.
      if ((SYS.INT_ART || []).indexOf(t.key) >= 0) {
        // Two of them, for the same reason the cards carry two: an <image>
        // takes a class and display:none like anything else.
        const at = `x="${(lx - 11).toFixed(1)}" y="${(ly - 11).toFixed(1)}" width="22" height="22"`;
        s += `<image class="nav-img-dark" href="${SYS.intArtSrc(t.key, 48)}" ${at} />`;
        s += `<image class="nav-img-light" href="${SYS.intArtSrc(t.key, 48, true)}" ${at} />`;
      } else {
        s += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-family="IBM Plex Mono, monospace" font-size="10.5" font-weight="500" style="fill:var(--dim)" text-anchor="middle" dominant-baseline="middle">${escapeHtml(t.short)}</text>`;
      }
    });
    const ptsFor = (vals) => intTypes.map((t, i) => {
      const a = angleFor(i);
      const r = R * Math.min(1, (Number(vals[i]) || 0) / maxVal);
      return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
    }).join(" ");
    s += `<polygon fill="var(--gold-soft)" stroke="var(--gold)" stroke-width="2" points="${ptsFor(avgs)}"/>`;
    if (recent) {
      // Unfilled and dashed, so it reads as a line drawn inside the shape
      // rather than a second shape competing with it. It can only ever be
      // smaller: it is part of the same total.
      const rec = intTypes.map((t) => Number(recent[t.key]) || 0);
      s += `<polygon fill="none" stroke="var(--ink)" stroke-opacity=".5" stroke-width="2" stroke-dasharray="5 4" points="${ptsFor(rec)}"/>`;
    }
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
    { page: "intelligence", key: "nav.intelligence", icon: "grid" },
    { page: "log", key: "nav.log", icon: "clock" },
  ];
  // Friends and mail live in the status bar instead, top right, with their
  // counts: they are where something arrives from other people, which is
  // what a corner like that is for, and it took the phone's bottom bar from
  // eleven buttons to nine.
  const STATUS_ITEMS = [
    { page: "shop", key: "nav.shop" },
    { page: "friends", key: "nav.friends" },
    { page: "mail", key: "nav.mail" },
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
  // Page art still being drawn shows its CSS stand-in until the file lands
  // (flip the entry in SYS.ART_PENDING when it does).
  const pendingArt = (page, cls) => page === "shop" && SYS.ART_PENDING.shop
    ? `<span class="shop-glyph ${cls}" aria-hidden="true"></span>` : "";
  const navImg = (page) => pendingArt(page, "nav-img") || `<img class="nav-img nav-img-dark" src="assets/icons/${page}-96.webp" alt="" width="26" height="26" draggable="false" />${SYS.DARK_ONLY_ART.indexOf(page) >= 0 ? "" : `<img class="nav-img nav-img-light" src="assets/icons/${page}-96-light.webp" alt="" width="26" height="26" draggable="false" />`}`;
  function renderSidebar(ui) {
    const navItems = ui.isAdmin ? [...NAV_ITEMS, { page: "admin", key: "nav.admin", icon: "shield" }] : NAV_ITEMS;
    const unreadCount = (ui.inbox || []).filter((m) => !m.read).length;
    const items = navItems.map((n) => `
      <button class="nav-item ${ui.page === n.page ? "active" : ""}" data-action="nav" data-page="${n.page}" aria-label="${t(n.key)}">
        ${navImg(n.page)}<span class="nav-label">${t(n.key)}</span>${n.page === "log" && unreadCount > 0 ? `<span class="banked-tag" style="margin-inline-start:auto;">${unreadCount}</span>` : ""}
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
      ? `<span class="name-edit-wrap"><input class="player-name-input" id="name-input" data-bind="__nameDraft" value="${escapeHtml(ui.__nameDraft ?? p.name)}" autofocus /><span class="name-edit-hint">${t("name.hint")}</span></span>`
      : `<button class="player-name-btn" data-action="edit-name" title="${t("status.rename")}">${escapeHtml(p.name)}</button>`;

    // The rank is its emblem, as everywhere else it is shown; its name is
    // the tooltip and what a screen reader hears. The level sits with the
    // bar it is measured by, rather than with the name.
    const rankName = t("status.rank", { rank: p.rank });
    return `
      <div class="statusbar-inner">
        <div class="status-id">
          ${ui.cloudUser || ui.lastMe ? `<button class="status-avatar" data-action="open-my-profile" title="${t("profile.title")}" aria-label="${t("profile.title")}">${U.framedAvatar(ui, (ui.cloudUser || ui.lastMe).uid, 64)}</button>` : ""}
          ${nameBlock}
          <button class="status-rank" data-action="open-ranks" aria-label="${escapeHtml(rankName)}" title="${escapeHtml(rankName)}">${rankArt(p.rank, 26)}</button>
          ${wornEmblems(state, 20)}
        </div>
        <div class="status-right">
          <div class="status-exp">
            <span class="lv-tag">${t("status.level", { n: p.level })}</span>
            <div class="exp-track"><div class="exp-fill" style="width:${Math.round((p.exp / SYS.levelCost(p.rank)) * 100)}%"></div></div>
            <span class="status-exp-label">${p.exp}/${SYS.levelCost(p.rank)}</span>
          </div>
          ${renderStatusSocial(ui)}
        </div>
      </div>`;
  }
  SYS.renderStatusbar = renderStatusbar;

  // Its own function, because the counts change far more often than the rest
  // of the bar: main.js swaps just this part in whenever the sidebar is
  // redrawn, so a count is never stale and a rename in progress is never
  // interrupted by a friend request arriving.
  function renderStatusSocial(ui) {
    const count = (page) => page === "friends" ? friendsBadge(ui) : U.mailBadge(null, ui);
    return `<div class="status-social">${renderGold(ui)}${renderStreak(ui)}${STATUS_ITEMS.map((n) => {
      const c = count(n.page);
      return `<button class="status-icon ${ui.page === n.page ? "active" : ""}" data-action="nav" data-page="${n.page}"
        aria-label="${t(n.key)}${c > 0 ? " (" + c + ")" : ""}" title="${t(n.key)}">
        ${navImg(n.page)}${c > 0 ? `<span class="status-count">${c}</span>` : ""}
      </button>`;
    }).join("")}</div>`;
  }
  SYS.renderStatusSocial = renderStatusSocial;

  // Gold, as games show it: the full number in the shop, a short one here.
  // Short form for the status bar: 1.3M, 12.3M, 4.5K — one decimal, the
  // letter always shown, Latin digits in every language.
  function goldShort(n) {
    const v = Number(n) || 0;
    const a = Math.abs(v);
    const one = (x) => (Math.floor(x * 10) / 10).toFixed(1).replace(/\.0$/, "");
    if (a >= 1e9) return one(v / 1e9) + "B";
    if (a >= 1e6) return one(v / 1e6) + "M";
    if (a >= 1e3) return one(v / 1e3) + "K";
    return String(v);
  }
  const goldFull = (n) => (Number(n) || 0).toLocaleString("en-US");
  function renderGold(ui) {
    if (!ui.cloudUser || !ui.wallet) return "";
    // The two balances, side by side and only shown; the shop is its own
    // icon beside them.
    // Each one names only itself.
    const gold = t("shop.goldOnly", { n: goldFull(ui.wallet.gold) });
    const aur = t("shop.aurOnly", { n: goldFull(ui.wallet.aurenite) });
    return `<span class="status-wallet">
      <span class="status-cur" role="img" aria-label="${escapeHtml(gold)}" title="${escapeHtml(gold)}"><span class="coin" aria-hidden="true"></span><span class="status-gold-n">${goldShort(ui.wallet.gold)}</span></span>
      <span class="status-cur status-aur" role="img" aria-label="${escapeHtml(aur)}" title="${escapeHtml(aur)}"><span class="gem" aria-hidden="true"></span><span class="status-gold-n">${goldShort(ui.wallet.aurenite)}</span></span>
    </span>`;
  }

  // Days in a row with something earned. Alive while the last counted day is
  // today or yesterday; lit once today has counted, dim while today still
  // needs something.
  function renderStreak(ui) {
    const s = ui.streak;
    if (!s || !s.lastDay) return "";
    const today = SYS.todayKey();
    const done = s.lastDay === today;
    // Alive while the days missed since are covered by freezes held.
    const held = Math.max(0, Number(ui.wallet && ui.wallet.freezes) || 0);
    let alive = done;
    for (let k = 0; k <= held && !alive; k++) if (SYS.shiftDay(s.lastDay, k + 1) === today) alive = true;
    if (!alive) return "";
    if (!(s.current > 0)) return "";
    const label = t(done ? "streak.done" : "streak.pending", { n: s.current, best: Math.max(s.best, s.current) });
    return `<span class="status-streak ${done ? "on" : ""}" role="img" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${icon("flame", 18)}<span class="status-streak-n">${s.current}</span></span>`;
  }

  // ---------- Overview page ----------
  // A section's picture icon at page-title size, both copies as in the nav.
  const pageIcon = (page) => pendingArt(page, "page-icon") || `<img class="page-icon nav-img-dark" src="assets/icons/${page}-96.webp" alt="" width="34" height="34" draggable="false" />${SYS.DARK_ONLY_ART.indexOf(page) >= 0 ? "" : `<img class="page-icon nav-img-light" src="assets/icons/${page}-96-light.webp" alt="" width="34" height="34" draggable="false" />`}`;

  // Every page opens the same way: the section's icon, what the page is, and
  // its name.
  // The small question mark that stands beside anything that needed a
  // caption. A caption explains the same thing to everyone forever; this
  // explains it to whoever asks, once.
  // The small size sits inside a line of text, beside the idea it explains;
  // the full size stands beside a page title.
  function helpMark(topic, small) {
    if ((SYS.HELP_TOPICS || []).indexOf(topic) < 0) return "";
    return `<button class="help-mark${small ? " help-mark-sm" : ""}" data-action="help" data-topic="${topic}"
      aria-label="${t("help.open")}" title="${t("help.open")}">?</button>`;
  }
  SYS.helpMark = helpMark;

  // The user guide, from Settings: a table of contents, then one chapter at a
  // time with its sections, and the chapters before and after it.
  function renderGuideModal(ui) {
    const chapters = SYS.GUIDE || [];
    const at = chapters.findIndex(([id]) => id === ui.guideChapter);
    const shell = (inner) => `
      <div class="modal-backdrop" data-action="close-modal-backdrop">
        <div class="sys-panel modal-box guide-box" data-stop-close="1" role="dialog" aria-label="${t("guide.title")}"><button class="wk-arrow modal-x" data-action="close-modal" aria-label="${t("event.close")}">${icon("x", 15)}</button>${inner}</div>
      </div>`;
    if (at < 0) {
      return shell(`
        <div class="modal-title">${t("guide.title")}</div>
        <div class="help-index guide-index">
          ${chapters.map(([id, n], i) => `
            <button class="help-row" data-action="open-guide" data-chapter="${id}">
              <span class="guide-num">${i + 1}</span>
              <span class="help-row-name">${escapeHtml(t("guide." + id + ".t"))}</span>
              ${icon("chevronRight", 14)}
            </button>`).join("")}
        </div>
`);
    }
    const [id, n] = chapters[at];
    const prev = chapters[at - 1], next = chapters[at + 1];
    const sections = Array.from({ length: n }, (_, k) => `
      <section class="guide-section">
        <h3 class="guide-h">${escapeHtml(t("guide." + id + "." + (k + 1) + ".h"))}</h3>
        <p class="help-body">${escapeHtml(t("guide." + id + "." + (k + 1) + ".b"))}</p>
      </section>`).join("");
    return shell(`
      <div class="modal-title"><span class="guide-num">${at + 1}</span> ${escapeHtml(t("guide." + id + ".t"))}</div>
      ${sections}
      <div class="guide-nav">
        <button class="btn btn-outline btn-icon-inline" data-action="open-guide">${icon("list", 13)} ${t("guide.back")}</button>
        <span class="guide-nav-steps">
          ${prev ? `<button class="btn btn-outline" data-action="open-guide" data-chapter="${prev[0]}">${escapeHtml(t("guide." + prev[0] + ".t"))}</button>` : ""}
          ${next ? `<button class="btn btn-primary" data-action="open-guide" data-chapter="${next[0]}">${escapeHtml(t("guide." + next[0] + ".t"))}</button>` : ""}
        </span>
      </div>`);
  }

  // Every rank, opened from your own: what a level costs in it, how many
  // skill points its work earns, and the EXP it starts at. Yours is marked.
  function renderRanksModal(state) {
    const rows = SYS.RANKS.map((r, i) => {
      return `
        <div class="rank-table-row rank-ladder-row ${state.player.rank === r ? "current" : ""}">
          <span class="rank-table-rank">${SYS.rankArt(r, 38)}</span>
          <span class="rank-ladder-nums">
            <span class="rank-table-cost">${t("settings.perLevel", { n: SYS.RANK_LEVEL_EXP[i] })}</span>
            <span class="rank-table-pts">${t("settings.pointsRate", { n: SYS.RANK_POINTS_PER_100_EXP[i] })}</span>
          </span>
        </div>`;
    }).reverse().join("");
    return `
      <div class="modal-backdrop" data-action="close-modal-backdrop">
        <div class="sys-panel modal-box" data-stop-close="1" role="dialog" aria-label="${t("ranks.title")}">
          <button class="wk-arrow modal-x" data-action="close-modal" aria-label="${t("event.close")}">${icon("x", 15)}</button>
          <div class="modal-title">${t("ranks.title")}</div>
          <p class="help-body">${escapeHtml(t("help.rank.b"))}</p>
          <p class="help-body">${escapeHtml(t("settings.rulesFixed"))}</p>
          <div class="rank-table">${rows}</div>
        </div>
      </div>`;
  }

  // With no topic it is the index, which is what makes this a help system
  // rather than sixteen disconnected tooltips: every topic is reachable from
  // any question mark in the application.
  function renderHelpModal(ui) {
    const topic = ui.helpTopic;
    const body = topic
      ? `
        <div class="modal-title">${escapeHtml(t("help." + topic + ".t"))}</div>
        <p class="help-body">${escapeHtml(t("help." + topic + ".b"))}</p>
        <div class="btn-row help-actions">
          ${SYS.hasTour && SYS.hasTour(topic)
            ? `<button class="btn btn-primary" data-action="tour-start" data-topic="${topic}">${t("tour.start")}</button>`
            : ""}
          <button class="btn ${SYS.hasTour && SYS.hasTour(topic) ? "btn-outline" : "btn-primary"}" data-action="close-modal">${t("settings.close")}</button>
        </div>`
      : `
        <div class="modal-title">${t("help.title")}</div>
        <div class="help-index">
          ${(SYS.HELP_TOPICS || []).map((k) => `
            <button class="help-row" data-action="help" data-topic="${k}">
              <span class="help-row-name">${escapeHtml(t("help." + k + ".t"))}</span>
              ${icon("chevronRight", 14)}
            </button>`).join("")}
        </div>
        <div class="btn-row help-actions">
          <button class="btn btn-primary" data-action="close-modal">${t("settings.close")}</button>
        </div>`;
    return `
      <div class="modal-backdrop">
        <div class="sys-panel modal-box help-box" data-stop-close="1" role="dialog"
          aria-label="${t("help.title")}">${body}</div>
      </div>`;
  }

  // The assessment, as the only thing on the screen.
  //
  // It can be put off but not skipped: "Later" closes it with every answer
  // given so far kept (settings.assessDraft, saved as each one lands), and it
  // reopens where it was left — from the overview's prompt, or the
  // Intelligence page, which stays shut until it is finished. The points it
  // hands out are only granted when the last answer is in, because they are a
  // budget shared out across all forty.
  //
  // One statement per screen, and going back is allowed — changing an answer
  // you have thought better of is not the same as skipping it.
  function renderAssessment(ui, state) {
    const qs = SYS.ASSESSMENT || [];
    const a = ui.assess || { i: 0, answers: {} };
    const total = qs.length;
    const later = `<button class="btn btn-outline assess-begin" data-action="assess-later">${t("ask.later")}</button>`;

    if (a.i < 0) {
      const begun = Object.keys(a.answers || {}).length;
      return `
        <div class="assess-layer">
          <div class="assess-card assess-intro">
            <div class="assess-title">${t("ask.title")}</div>
            <p class="assess-body">${t("ask.intro")}</p>
            <button class="btn btn-primary assess-begin" data-action="assess-begin">${begun ? t("ask.continue", { n: begun, total }) : t("ask.begin")}</button>
            ${later}
            ${ui.isAdmin ? `<button class="btn btn-outline assess-begin" data-action="assess-skip">${t("ask.skip")}</button>` : ""}
          </div>
        </div>`;
    }

    if (a.i >= total) {
      // Read off the state rather than a copy taken when the last answer
      // landed: whatever runGameAction does with its draft, the state is
      // where the answer actually is.
      const granted = ((state && state.assessment) || {}).granted || {};
      const rows = (SYS.DEFAULT_INT_TYPES || [])
        .map((type) => ({ type, n: Number(granted[type.key]) || 0 }))
        .filter((r) => r.n > 0)
        .sort((x, y) => y.n - x.n);
      return `
        <div class="assess-layer">
          <div class="assess-card assess-intro">
            <div class="assess-title">${t("ask.doneTitle")}</div>
            <p class="assess-body">${t("ask.doneBody")}</p>
            <div class="assess-result">
              ${rows.map((r) => `
                <div class="assess-result-row">
                  <span class="assess-result-name">${intArt(r.type, 24)} ${escapeHtml(intName(r.type))}</span>
                  <span class="assess-result-n">+${r.n}</span>
                </div>`).join("")}
            </div>
            ${renderProjection(ui, state)}
            <button class="btn btn-primary assess-begin" data-action="assess-enter">${t("ask.enter")}</button>
          </div>
        </div>`;
    }

    const q = qs[a.i];
    const chosen = a.answers[q.id];
    const step = (v, label) => `
      <button class="assess-choice ${String(chosen) === String(v) ? "on" : ""}"
        data-action="assess-answer" data-value="${v}">${label}</button>`;
    return `
      <div class="assess-layer">
        <div class="assess-card">
          <div class="assess-progress">
            <div class="assess-bar"><div class="assess-bar-fill" style="width:${(a.i / total) * 100}%"></div></div>
            <div class="assess-count">${t("ask.of", { n: a.i + 1, total })}</div>
          </div>
          <p class="assess-question">${escapeHtml(t("ask." + q.id))}</p>
          <div class="assess-scale">
            ${step(5, t("ask.s5"))}
            ${step(4, t("ask.s4"))}
            ${step(3, t("ask.s3"))}
            ${step(2, t("ask.s2"))}
            ${step(1, t("ask.s1"))}
          </div>
          ${step(SYS.ASSESSMENT_NA, t("ask.na"))}
          <div class="assess-foot">
            ${a.i > 0 ? `<button class="assess-back" data-action="assess-back">${t("ask.back")}</button>` : "<span></span>"}
            <button class="assess-back" data-action="assess-later">${t("ask.later")}</button>
          </div>
        </div>
      </div>`;
  }
  SYS.renderAssessment = renderAssessment;

  // Where the next ninety days lead at a chosen pace, under the starting
  // picture: the rank it would reach, and the day the next one arrives.
  function renderProjection(ui, state) {
    const paces = SYS.PROJECTION_PACES || [];
    const pace = paces.indexOf(ui.assess && ui.assess.pace) >= 0 ? ui.assess.pace : SYS.PROJECTION_DEFAULT_PACE;
    const days = SYS.PROJECTION_DAYS;
    const p = SYS.projectStanding(SYS.totalExp(state && state.player), pace, days);
    return `
      <div class="assess-proj">
        <div class="assess-proj-head">${t("ask.in90", { n: days })}</div>
        <div class="chip-group">
          ${paces.map((h) => `<button class="chip ${h === pace ? "active" : ""}" data-action="assess-pace" data-pace="${h}" aria-pressed="${h === pace}">${t("ask.pace." + h)}</button>`).join("")}
        </div>
        <div class="assess-proj-rank">
          ${rankArt(p.to.rank, 72)}
          <div>
            <div class="assess-proj-levels">${t("ask.levels", { n: p.levels })}</div>
            <div class="assess-proj-line">${t("lb.playerLine", { rank: p.to.rank, level: p.to.level })}</div>
            ${p.rankUpDay ? `<div class="assess-proj-day">${t("ask.rankUpDay", { d: p.rankUpDay })}</div>` : ""}
          </div>
        </div>
      </div>`;
  }

  // Where an unfinished assessment is picked up again: the overview, and in
  // place of the Intelligence page, which reads off it.
  function assessPrompt(state) {
    if (state.assessment) return "";
    const total = (SYS.ASSESSMENT || []).length || 1;
    const done = Object.keys(((state.settings || {}).assessDraft || {}).answers || {}).length;
    return `
      <div class="sys-panel panel-pad assess-prompt">
        <div class="assess-prompt-head">
          <span class="assess-prompt-title">${t("ask.promptTitle")}</span>
          <span class="assess-count">${t("ask.of", { n: done, total })}</span>
        </div>
        <div class="assess-bar"><div class="assess-bar-fill" style="width:${(done / total) * 100}%"></div></div>
        <button class="btn btn-primary" data-action="assess-open">${done ? t("ask.resume") : t("ask.begin")}</button>
      </div>`;
  }

  // One title, and it is the page's own name — the name in the sidebar. It
  // used to carry an eyebrow above a second, longer phrase, which read as two
  // titles stacked on each other and said the same thing twice.
  function renderPageHead(page) {
    return `
      <div class="page-header page-header-icon">
        ${pageIcon(page)}
        <h1 class="page-title">${t("nav." + page)}</h1>
        ${helpMark(page)}
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
          <span class="today-emoji">${U.taskIconHtml(x)}</span>
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
      <div class="sys-panel panel-pad week-bars">
        <div class="panel-head">
          <div class="eyebrow" style="margin:0;">${t("overview.week7")}${helpMark("exp", true)}</div>
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
  // The emblem for one intelligence, at the size the slot gives it. A
  // category the user added themselves has no drawing, so it keeps the short
  // code it always had.
  function intArt(type, px, cls) {
    if (!type) return "";
    if ((SYS.INT_ART || []).indexOf(type.key) < 0) {
      const tint = type.color ? ` style="color:${escapeHtml(type.color)}"` : "";
      return `<span class="int-code ${cls || ""}"${tint}>${escapeHtml(type.short || type.key)}</span>`;
    }
    // Both copies are emitted and CSS shows the one that fits the theme, the
    // way the nav icons and the brand mark already do. The hidden one is
    // display:none, so it takes no box and no margin with it.
    const emblem = (light) => `<img class="int-art ${light ? "nav-img-light" : "nav-img-dark"} ${cls || ""}"
      src="${SYS.intArtSrc(type.key, px, light)}"
      width="${px}" height="${px}" alt="" title="${escapeHtml(intName(type))}"
      loading="lazy" decoding="async" />`;
    return emblem(false) + emblem(true);
  }
  SYS.intArt = intArt;

  // An intelligence's name in the language the app is in. The eight built-in
  // ones are translated (int.<key> in i18n.js); the stored English name stays
  // what is saved, so switching language never rewrites anyone's data.
  function intName(type) {
    if (!type) return "";
    const key = "int." + type.key;
    const said = t(key);
    return said !== key ? said : (type.name || type.short || type.key);
  }
  SYS.intName = intName;

  // The emblems of the categories this person has taken past the bar. Worn
  // beside the name rather than shown on the intelligence page, because the
  // whole point is that the intelligences reach somewhere else.
  function wornEmblems(state, px) {
    const earned = (SYS.earnedCategories ? SYS.earnedCategories(state) : []).slice(0, 3);
    if (!earned.length) return "";
    const inner = earned.map((e) => {
      const type = (state.intTypes || []).find((t) => t.key === e.key);
      return type ? intArt(type, px, "worn-emblem") : "";
    }).join("");
    return `<span class="worn-emblems" title="${escapeHtml(t("intel.worn"))}">${inner}</span>`;
  }
  SYS.wornEmblems = wornEmblems;

  function rankArt(rank, px, cls) {
    const has = (SYS.RANK_ART || []).indexOf(rank) >= 0;
    if (!has) return `<span class="rank-letter-fallback ${cls || ""}">${escapeHtml(rank)}</span>`;
    const file = px > 128 ? 512 : 128;
    // Only the height is given. The emblems are trimmed to their artwork and
    // are wider the more ornament a rank carries, so a fixed square would
    // letterbox the winged ones and shrink their letter exactly where the
    // ladder means it to grow.
    return `<img class="rank-art ${cls || ""}" src="assets/ranks/${encodeURIComponent(rank)}-${file}.webp"
      height="${px}" alt="" aria-hidden="true" loading="lazy" decoding="async" />`;
  }
  SYS.rankArt = rankArt;

  function levelDial(pct, inner) {
    const shown = pct > 0 ? Math.max(pct, 2) : 0;
    const arc = (shown * 3.6).toFixed(1);
    const lead = Math.max(0, shown * 3.6 - 13).toFixed(1);
    const layer = (cls) => `
      <div class="dial-band ${cls}">
        <img class="nav-img-dark" src="assets/frames/dial-ring-512.webp" alt="" aria-hidden="true" width="512" height="512" />
        <img class="nav-img-light" src="assets/frames/dial-ring-512-light.webp" alt="" aria-hidden="true" width="512" height="512" />
      </div>`;
    return `
      <div class="level-ring" style="--arc:${arc}deg;--lead:${lead}deg">
        ${layer("dial-spent")}${layer("dial-won")}${layer("dial-edge")}
        <div class="level-ring-inner">${inner}</div>
      </div>`;
  }

  // Strongest and weakest, as the two buttons that open them. The intelligence
  // page has carried this line for a while; the overview showed the same
  // drawing and led nowhere, so the radar on the page people actually open
  // every day was the one that could not be acted on.
  function radarPoles(state) {
    const types = (state.intTypes || []).filter((x) => state.intelligences[x.key]);
    if (types.length < 2) return "";
    const scoreOf = (x) => SYS.categoryScore(state.intelligences[x.key]);
    const sorted = types.slice().sort((a, b) => scoreOf(b) - scoreOf(a));
    const best = sorted[0], worst = sorted[sorted.length - 1];
    if (!best || !worst || best.key === worst.key) return "";
    const pole = (label, type) => `
      <span class="intel-pole"><span class="intel-pole-label">${label}</span>
        <button class="intel-pole-name" data-action="intel-open" data-key="${escapeHtml(type.key)}" style="--cat:${escapeHtml(type.color)}">${escapeHtml(intName(type))}</button></span>`;
    return `<div class="intel-poles">${pole(t("intel.strongest"), best)}${pole(t("intel.weakest"), worst)}</div>`;
  }

  Object.assign(U, { t, escapeHtml, dateLocale, ceilSecond, timerCaption, progressText, weekdayLabels, scheduleLabel, renderSchedulePicker, PRIORITY_VAR, ICONS, GOOGLE_ICON_SVG, icon, buildRadarSVG, NAV_ITEMS, STATUS_ITEMS, friendsBadge, pendingArt, navImg, renderSidebar, renderStatusbar, renderStatusSocial, goldShort, goldFull, renderGold, renderStreak, pageIcon, helpMark, renderGuideModal, renderRanksModal, renderHelpModal, renderAssessment, renderProjection, assessPrompt, renderPageHead, renderTodayCard, renderWeekBars, logMark, intArt, intName, wornEmblems, rankArt, levelDial, radarPoles });
})(window.SYS = window.SYS || {});

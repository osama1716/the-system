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

  // Priority uses only the design's two functional accents (gold = notable,
  // rust = urgent) plus dim for low-key — not a per-value rainbow.
  const PRIORITY_VAR = { dim: "var(--dim)", gold: "var(--gold-text)", rust: "var(--rust-text)" };

  const ICONS = {
    plus: `<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>`,
    minus: `<line x1="5" y1="12" x2="19" y2="12"/>`,
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
      <div class="brand">
        <span class="brand-mark">
          <img src="icons/mark-on-dark.png" alt="" class="mark-for-dark" />
          <img src="icons/mark-on-light.png" alt="" class="mark-for-light" />
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
        <div class="radar-wrap" style="height:320px;display:flex;justify-content:center;">${radar}</div>
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

    const typeFields = f.recurring ? `
      <div class="field-row">
        <div>
          <div class="field-label">${t("task.priority")}</div>
          <select class="field-select" data-bind="taskForm.priority" data-action="noop">
            ${["Low", "Medium", "High"].map((o) => `<option value="${o}" ${f.priority === o ? "selected" : ""}>${t("priority." + o)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="field-row">
        <div style="max-width:140px;">
          <div class="field-label">${t("form.repeatsPerWeek")}</div>
          <input class="field-input" type="number" min="1" max="7" data-bind="taskForm.repeatsPerWeek" value="${escapeHtml(f.repeatsPerWeek)}" />
        </div>
        <div style="max-width:140px;">
          <div class="field-label">${t("form.amountPerRepeat")}</div>
          <input class="field-input" type="number" min="0" step="any" data-bind="taskForm.targetAmount" value="${escapeHtml(f.targetAmount)}" />
        </div>
      </div>
      <div>
        <div class="field-label">${t("form.unit")}</div>
        ${renderUnitPicker(f)}
      </div>` : `
      <div class="field-row">
        <div>
          <div class="field-label">${t("form.priorityLong")}</div>
          <select class="field-select" data-bind="taskForm.priority" data-action="noop">
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

  function renderRepeatRow(state, t) {
    const wp = SYS.weekProgress(t);
    const dots = Array.from({ length: t.repeatsPerWeek }).map((_, i) =>
      `<span class="repeat-dot ${i < wp.count ? "filled" : ""}"></span>`
    ).join("");
    const totalAmount = wp.logs.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const timeBased = SYS.isTimeUnit(t.unit);
    return `
      <div class="repeat-row">
        <div class="repeat-dots" title="${SYS.t("task.weekProgress", { done: wp.count, total: t.repeatsPerWeek })}">${dots}</div>
        <span class="repeat-progress-text">${SYS.t("task.weekProgress", { done: wp.count, total: t.repeatsPerWeek })}${totalAmount > 0 ? SYS.t("task.amountLogged", { amount: totalAmount, unit: escapeHtml(SYS.tUnit(t.unit)) }) : ""}</span>
        <div class="repeat-actions">
          <button class="icon-mini" data-action="undo-repeat" data-id="${t.id}" ${wp.count > 0 ? "" : "disabled"} aria-label="${SYS.t("task.undoLast")}" title="${SYS.t("task.undoLast")}">${icon("minus", 13)}</button>
          ${timeBased ? `<button class="btn btn-outline btn-sm btn-icon-inline" data-action="open-timer" data-id="${t.id}">${icon("timer", 13)} ${SYS.t("task.startTimer")}</button>` : ""}
          <button class="btn btn-outline btn-sm" data-action="log-repeat" data-id="${t.id}">${SYS.t("task.logAmount", { amount: t.targetAmount, unit: escapeHtml(SYS.tUnit(t.unit)) })}</button>
        </div>
      </div>`;
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
                ? `<span class="meta-pair"><span class="meta-label">${SYS.t("task.repeats")}</span><span>${SYS.t("task.repeatsPerWeek", { n: t.repeatsPerWeek })}</span></span>`
                : `<span class="meta-pair"><span class="meta-label">${SYS.t("task.term")}</span><span>${SYS.t("term." + t.taskType)}</span></span>`}
              ${typeSpans.length ? `<span class="meta-pair"><span class="meta-label">${SYS.t("task.type")}</span>${typeSpans}</span>` : ""}
            </div>
            ${t.notes ? `<div class="task-notes">${escapeHtml(t.notes)}</div>` : ""}
            ${recurring ? renderRepeatRow(state, t) : stepper}
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
  function renderHabitsPage(state, ui) {
    const showingForm = !!ui.taskForm && ui.taskForm.recurring;
    const habits = state.tasks.filter((t) => t.recurring);
    const rows = habits.map((t) => renderTaskRow(state, ui, t)).join("");

    return `
      <div class="page-header">
        <div class="eyebrow">${t("habits.eyebrow")}</div>
        <h1 class="page-title">${t("habits.title")}</h1>
      </div>
      <div class="sys-panel panel-pad">
        <div class="panel-head">
          <span></span>
          ${!showingForm ? `<button class="btn btn-outline btn-icon-inline" data-action="open-habit-form">${icon("plus", 14)} ${t("habits.new")}</button>` : ""}
        </div>
        ${showingForm ? renderTaskForm(state, ui) : ""}
        ${habits.length === 0 ? `<div class="empty-note">${t("habits.empty")}</div>` : `<div>${rows}</div>`}
      </div>
      ${renderAppealSection(ui)}`;
  }
  SYS.renderHabitsPage = renderHabitsPage;

  // ---------- Stats page ----------
  function todayShortDate() {
    const d = new Date();
    return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, "0")}`;
  }

  // Week view: 7 vertical bars (height = xp that day), Mon→Sun left to right.
  function renderWeekBars(days) {
    const maxXp = Math.max(1, ...days.map((d) => d.xp));
    const bars = days.map((d) => {
      const h = d.xp > 0 ? Math.max(6, Math.round((d.xp / maxXp) * 62)) : 6;
      const isToday = d.dateKey === SYS.todayKey();
      const label = d.date.toLocaleDateString(undefined, { weekday: "short" });
      return `
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:9px;min-width:0;">
          <div style="width:100%;border-radius:99px;background:${d.xp === 0 ? "var(--track)" : (isToday ? "var(--bar-today)" : "var(--bar-idle)")};height:${h}px;" title="${escapeHtml(d.dateKey)}: ${d.xp} xp"></div>
          <span style="font-family:var(--font-mono);font-size:10.5px;color:${isToday ? "var(--gold-text)" : "var(--dim)"};">${escapeHtml(label)}</span>
        </div>`;
    }).join("");
    return `<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:6px;height:74px;">${bars}</div>`;
  }

  // Month view: a vertical list, one row per day (oldest at top, chronological
  // top-to-bottom) — each row's bar fills left→right by that day's % of
  // existing habits that got at least one repeat logged.
  function renderMonthList(days) {
    const rows = days.map((d) => {
      const isToday = d.dateKey === SYS.todayKey();
      const label = d.date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      return `
        <div class="month-day-row ${isToday ? "today" : ""}">
          <span class="month-day-label">${escapeHtml(label)}</span>
          <div class="month-day-bar-track"><div class="month-day-bar-fill" style="width:${d.habitPct}%"></div></div>
          <span class="month-day-pct">${d.habitPct}%</span>
        </div>`;
    }).join("");
    return `<div class="month-list">${rows}</div>`;
  }

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

  function renderStatsPage(state, ui) {
    const span = ui.statsSpan === "month" ? "month" : ui.statsSpan === "lifetime" ? "lifetime" : "week";
    const weekOffset = ui.statsWeekOffset || 0;
    const monthOffset = ui.statsMonthOffset || 0;
    const data = span === "week" ? SYS.statsWeek(state, weekOffset) : SYS.statsMonth(state, monthOffset);
    const days = data.days;
    const activeDays = days.filter((d) => d.active).length;
    const totalXp = days.reduce((s, d) => s + d.xp, 0);
    const totalQuests = days.reduce((s, d) => s + d.quests, 0);
    const totalRepeats = days.reduce((s, d) => s + d.repeats, 0);
    const offset = span === "week" ? weekOffset : monthOffset;
    const navAction = span === "week" ? "set-stats-week-offset" : "set-stats-month-offset";
    const rangeLabel = span === "week" ? data.rangeLabel : data.monthLabel;

    return `
      <div class="page-header">
        <div class="eyebrow">${t("stats.eyebrow")}</div>
        <h1 class="page-title">${t("stats.title")}</h1>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
        <div class="theme-switcher" style="max-width:280px;">
          <button class="theme-option ${span === "week" ? "active" : ""}" data-action="set-stats-span" data-span="week">${t("stats.thisWeek")}</button>
          <button class="theme-option ${span === "month" ? "active" : ""}" data-action="set-stats-span" data-span="month">${t("stats.thisMonth")}</button>
          <button class="theme-option ${span === "lifetime" ? "active" : ""}" data-action="set-stats-span" data-span="lifetime">${t("stats.lifetime")}</button>
        </div>
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--dim);">${t("stats.today", { date: todayShortDate() })}</span>
      </div>

      ${span === "lifetime" ? "" : `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <button class="icon-mini" data-action="${navAction}" data-delta="-1" aria-label="${t("stats.previous")}">${icon("chevronLeft", 18)}</button>
        <div style="text-align:center;">
          <div style="font-size:15px;font-weight:600;color:var(--ink);">${escapeHtml(rangeLabel)}${offset !== 0 ? ` <button class="link-btn" data-action="${navAction}" data-delta="reset" style="margin-inline-start:6px;">${t("stats.todayBtn")}</button>` : ""}</div>
          <div style="font-family:var(--font-mono);font-size:12px;color:var(--faint);margin-top:2px;">${data.year}</div>
        </div>
        <button class="icon-mini" data-action="${navAction}" data-delta="1" aria-label="${t("stats.next")}">${icon("chevronRight", 18)}</button>
      </div>`}

      <div class="sys-panel panel-pad">
        ${span === "lifetime" ? renderLifetimeStats(ui) : `
        ${span === "week" ? renderWeekBars(days) : renderMonthList(days)}
        <div style="margin-top:14px;padding-top:13px;border-top:1px solid var(--border);display:flex;justify-content:space-between;">
          <span style="font-size:12px;color:var(--dim);">${t("stats.daysActive", { active: activeDays, total: days.length })}</span>
          <span style="font-size:12px;font-weight:500;color:var(--gold-text);">${t("stats.totalXp", { n: totalXp.toFixed(0) })}</span>
        </div>`}
      </div>
      ${span === "lifetime" ? "" : `
      <div class="stat-tiles" style="margin-top:16px;">
        <div class="stat-tile"><div class="stat-num">${totalQuests}</div><div class="stat-label">${t("stats.questsCompleted")}</div></div>
        <div class="stat-tile"><div class="stat-num">${totalRepeats}</div><div class="stat-label">${t("stats.repeatsLogged")}</div></div>
      </div>`}`;
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
    if (ui.modal === "syncChoice") return renderSyncChoiceModal(state, ui);
    return "";
  }
  SYS.renderModalLayer = renderModalLayer;

  function renderSyncChoiceModal(state, ui) {
    return `
      <div class="modal-backdrop">
        <div class="sys-panel modal-box" data-stop-close="1">
          <div class="modal-title">${t("sync.title")}</div>
          <div style="font-size:13px;color:var(--body);line-height:1.6;margin-bottom:18px;">
            ${t("sync.body")}
          </div>
          <div class="btn-row" style="flex-direction:column;gap:8px;">
            <button class="btn btn-primary" data-action="sync-choice" data-choice="cloud" style="width:100%;">${t("sync.useCloud")}</button>
            <button class="btn btn-outline" data-action="sync-choice" data-choice="local" style="width:100%;">${t("sync.useLocal")}</button>
          </div>
        </div>
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

  function renderTimerModal(state, ui) {
    const t = state.tasks.find((x) => x.id === ui.timer.taskId);
    if (!t) return "";
    const elapsedMs = ui.timer.accumulatedMs + (ui.timer.running ? (Date.now() - ui.timer.startedAt) : 0);
    return `
      <div class="modal-backdrop" data-action="close-timer-backdrop">
        <div class="sys-panel modal-box" data-stop-close="1" style="text-align:center;">
          <div class="modal-title">${t.recurring ? SYS.t("timer.title") : ""}</div>
          <div style="font-size:16px;font-weight:600;color:var(--ink);margin-bottom:22px;">${escapeHtml(t.title)}</div>
          <div id="timer-display" style="font-family:var(--font-display);font-size:52px;font-weight:600;letter-spacing:-0.03em;color:var(--ink-strong);margin:10px 0 26px;">${fmtElapsed(elapsedMs)}</div>
          <div class="btn-row" style="justify-content:center;gap:10px;">
            ${ui.timer.running
              ? `<button class="btn btn-outline btn-icon-inline" data-action="timer-pause">${icon("pause", 14)} ${SYS.t("timer.pause")}</button>`
              : `<button class="btn btn-primary btn-icon-inline" data-action="timer-start">${icon("play", 14)} ${ui.timer.accumulatedMs > 0 ? SYS.t("timer.resume") : SYS.t("timer.start")}</button>`}
            <button class="btn btn-outline btn-icon-inline" data-action="timer-stop-log" ${elapsedMs < 1000 ? "disabled" : ""}>${icon("stop", 13)} ${SYS.t("timer.stopLog")}</button>
          </div>
          <button class="btn btn-ghost" data-action="close-timer" style="width:100%;margin-top:18px;">${SYS.t("form.cancel")}</button>
        </div>
      </div>`;
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
            <div class="modal-section-label">${t("settings.rules")}</div>
            <div class="form-hint" style="margin-top:0;">${t("settings.rulesFixed")}</div>
            <div class="rank-table">
              ${SYS.RANKS.map((r, i) => `
                <div class="rank-table-row ${state.player.rank === r ? "current" : ""}">
                  <span class="rank-table-rank">${escapeHtml(r)}</span>
                  <span class="rank-table-cost">${t("settings.perLevel", { n: SYS.RANK_LEVEL_EXP[i] })}</span>
                  <span class="rank-table-pts">${t("settings.perLevelPoints", { n: SYS.RANK_SKILL_POINTS[i] })}</span>
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

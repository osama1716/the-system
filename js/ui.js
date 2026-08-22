// Pure(ish) rendering: builds HTML/SVG strings from (state, uiState). No mutation,
// no event wiring here — main.js owns the store and delegates all events.
(function (SYS) {
  "use strict";

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
    if (n < 3) return `<div style="color:var(--faint);font-size:12px;text-align:center;padding:20px;">Add at least 3 categories to see the radar.</div>`;
    const size = 260, cx = size / 2, cy = size / 2, R = 90, rings = 4;
    const avgs = intTypes.map((t) => SYS.avgTraitLevel(intelligences[t.key]));
    const maxVal = Math.max(5, ...avgs) + 3;
    const angleFor = (i) => -Math.PI / 2 + i * ((2 * Math.PI) / n);

    let s = `<svg viewBox="0 0 ${size} ${size}" width="100%" height="100%" role="img" aria-label="Intelligence radar chart">`;
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
    { page: "overview", label: "Overview", icon: "home" },
    { page: "quests", label: "Quests", icon: "list" },
    { page: "habits", label: "Habits", icon: "repeat" },
    { page: "stats", label: "Stats", icon: "bar" },
    { page: "intelligence", label: "Intelligence", icon: "grid" },
    { page: "log", label: "Log", icon: "clock" },
  ];
  function renderSidebar(ui) {
    const navItems = ui.isAdmin ? [...NAV_ITEMS, { page: "admin", label: "Admin", icon: "shield" }] : NAV_ITEMS;
    const unreadCount = (ui.inbox || []).filter((m) => !m.read).length;
    const items = navItems.map((n) => `
      <button class="nav-item ${ui.page === n.page ? "active" : ""}" data-action="nav" data-page="${n.page}" aria-label="${n.label}">
        ${icon(n.icon, 16)}<span class="nav-label">${n.label}</span>${n.page === "log" && unreadCount > 0 ? `<span class="banked-tag" style="margin-inline-start:auto;">${unreadCount}</span>` : ""}
      </button>`).join("");
    return `
      <div class="brand"><span class="brand-mark">◈</span><span class="brand-text">THE <b>SYSTEM</b></span></div>
      <nav class="nav-list">${items}</nav>
      <button class="nav-item nav-settings" data-action="open-settings" aria-label="Settings">${icon("gear", 16)}<span class="nav-label">Settings</span></button>`;
  }
  SYS.renderSidebar = renderSidebar;

  // ---------- persistent status bar (every page) ----------
  function renderStatusbar(state, ui) {
    const p = state.player;
    const nameBlock = ui.nameEditing
      ? `<input class="player-name-input" id="name-input" data-bind="__nameDraft" value="${escapeHtml(ui.__nameDraft ?? p.name)}" autofocus />`
      : `<button class="player-name-btn" data-action="edit-name" title="Click to rename">${escapeHtml(p.name)}</button>`;

    return `
      <div class="statusbar-inner">
        <div class="status-id">
          ${nameBlock}
          <span class="rank-badge">${p.rank}-RANK</span>
          <span class="lv-tag">LV. ${p.level}</span>
          ${p.bankedPoints > 0 ? `<span class="banked-tag">${icon("zap", 11)} ${p.bankedPoints}</span>` : ""}
        </div>
        <div class="status-exp">
          <div class="exp-track"><div class="exp-fill" style="width:${p.exp}%"></div></div>
          <span class="status-exp-label">${p.exp}/100</span>
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
        <div class="eyebrow">PLAYER STATUS</div>
      </div>

      <div class="level-ring-wrap">
        <div class="level-ring" style="background:conic-gradient(var(--gold) 0% ${p.exp}%, var(--track) ${p.exp}% 100%)">
          <div class="level-ring-inner">
            <span class="level-ring-label">LEVEL</span>
            <span class="level-ring-num">${p.level}</span>
            <span class="level-ring-xp">${p.exp} / 100 xp</span>
          </div>
        </div>
        <h1 class="page-hero-title" style="margin-top:18px;">${escapeHtml(p.name)}</h1>
        <div class="page-hero-sub">${p.rank}-Rank · ${p.questsCompleted} quest${p.questsCompleted === 1 ? "" : "s"} cleared</div>
      </div>

      <div class="stat-tiles" style="margin-top:26px;">
        <div class="stat-tile"><div class="stat-num">${activeQuests}</div><div class="stat-label">Active quests</div></div>
        <div class="stat-tile"><div class="stat-num">${habitCount}</div><div class="stat-label">Habits</div></div>
        <div class="stat-tile"><div class="stat-num">${totalTraits}</div><div class="stat-label">Traits tracked</div></div>
        <div class="stat-tile"><div class="stat-num">${p.bankedPoints}</div><div class="stat-label">Banked points</div></div>
      </div>

      <div class="sys-panel panel-pad">
        <div class="eyebrow" style="margin-bottom:6px;">INTELLIGENCE RADAR</div>
        <div class="radar-wrap" style="height:320px;display:flex;justify-content:center;">${radar}</div>
      </div>

      <div class="sys-panel panel-pad">
        <div class="panel-head">
          <div class="eyebrow">RECENT ACTIVITY</div>
          <button class="link-btn" data-action="nav" data-page="log">View full log →</button>
        </div>
        ${recent.length === 0
          ? `<div class="empty-note">No milestones yet. Clear quests to begin your ascent.</div>`
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
              <span class="lv">Lv ${tr.level}</span>
              <button class="trait-del icon-mini ${armed ? "danger-arm" : ""}" data-action="remove-trait" data-key="${t.key}" data-trait="${tr.id}" aria-label="Remove trait" title="${armed ? "Click again to confirm" : "Remove trait"}">${icon(armed ? "check" : "trash", 12)}</button>
            </span>
          </div>`;
      }).join("");

      const addTraitBlock = addOpen
        ? `<div class="add-trait-row">
            <input class="field-input" style="padding:6px 9px;font-size:12px;" placeholder="Trait name" data-bind="addTraitDraft.name" value="${escapeHtml(draft.name)}" />
            <input class="field-input" style="padding:6px 9px;font-size:12px;max-width:110px;" placeholder="Arabic (opt.)" data-bind="addTraitDraft.ar" value="${escapeHtml(draft.ar)}" />
            <button class="btn btn-outline btn-sm" data-action="submit-add-trait" data-key="${t.key}">Add</button>
            <button class="btn btn-ghost btn-sm" data-action="cancel-add-trait">Cancel</button>
          </div>`
        : `<button class="link-btn" data-action="open-add-trait" data-key="${t.key}" style="align-self:flex-start;">+ add trait</button>`;

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
          ${state.player.bankedPoints > 0 ? `<button class="mini-btn" data-action="spend-banked" data-key="${t.key}">+1 invest here</button>` : ""}
          ${isOpen ? `
            <div class="trait-list">
              ${traitRows}
              ${intel.remainder > 0.01 ? `<div class="remainder-note">Banked fractional progress: ${(intel.remainder * 100).toFixed(0)}% toward next point</div>` : ""}
            </div>
            <div style="margin-top:8px;">${addTraitBlock}</div>
          ` : ""}
        </div>`;
    }).join("");

    return `
      <div class="page-header">
        <div class="eyebrow">INTELLIGENCE</div>
        <h1 class="page-title">Categories &amp; traits</h1>
      </div>
      <div class="intel-grid">
        ${cards}
        <button class="sys-panel add-category-card" data-action="open-add-category">
          <span style="font-size:20px;line-height:1;">+</span>
          <span>Add category</span>
        </button>
      </div>`;
  }
  SYS.renderIntelligencePage = renderIntelligencePage;

  // ---------- quest form (add or edit) ----------
  function renderUnitPicker(f) {
    const known = SYS.UNIT_GROUPS.some((g) => g.units.includes(f.unit));
    const isCustom = f.unit === "custom" || !known;
    const groups = SYS.UNIT_GROUPS.map((g) => `
      <div class="unit-group">
        <span class="unit-group-label">${escapeHtml(g.label)}</span>
        <div class="chip-group">
          ${g.units.map((u) => `<button type="button" class="chip unit-chip ${f.unit === u ? "active" : ""}" style="${f.unit === u ? "background:var(--gold);border-color:var(--gold);" : "border-color:var(--gold-border);color:var(--gold-text);"}" data-action="set-unit" data-unit="${u}">${escapeHtml(u)}</button>`).join("")}
        </div>
      </div>`).join("");
    return `
      <div class="unit-picker">
        ${groups}
        <div class="unit-group">
          <span class="unit-group-label">Other</span>
          <div class="chip-group">
            <button type="button" class="chip unit-chip ${isCustom ? "active" : ""}" style="${isCustom ? "background:var(--gold);border-color:var(--gold);" : "border-color:var(--gold-border);color:var(--gold-text);"}" data-action="set-unit" data-unit="custom">Custom…</button>
          </div>
        </div>
      </div>
      ${isCustom ? `<input class="field-input" style="margin-top:8px;" placeholder="Custom unit (e.g. pushups)" data-bind="taskForm.customUnit" value="${escapeHtml(f.customUnit || (known ? "" : f.unit))}" />` : ""}`;
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
      : `<span class="chip" style="border-color:var(--border);color:var(--faint);">General</span>`;

    const valueBlock = isEdit
      ? `<div>
          <div class="field-label">Assigned by the system</div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span class="task-reward">+${escapeHtml(f.pt)} xp${f.recurring ? "/repeat" : ""}</span>
            <div class="chip-group">${assignedChips}</div>
          </div>
        </div>`
      : `<div class="form-hint" style="display:flex;align-items:center;gap:6px;">
          ${icon("shield", 13)} The system reviews this and sets its EXP value — you can't set your own.
        </div>`;

    const modeToggle = (!f.recurring && f.taskType === "Long Term") ? `
      <div class="mode-toggle">
        <span style="font-size:12px;color:var(--dim);align-self:center;">EXP mode:</span>
        <button type="button" class="chip ${f.expMode === "gradual" ? "active" : ""}" style="${f.expMode === "gradual" ? "background:var(--gold);border-color:var(--gold);" : "border-color:var(--gold-border);color:var(--gold-text);"}" data-action="set-exp-mode" data-mode="gradual">Gradual (scales with %)</button>
        <button type="button" class="chip ${f.expMode === "allAtOnce" ? "active" : ""}" style="${f.expMode === "allAtOnce" ? "background:var(--gold);border-color:var(--gold);" : "border-color:var(--gold-border);color:var(--gold-text);"}" data-action="set-exp-mode" data-mode="allAtOnce">All at once (100% only)</button>
      </div>` : "";

    const typeFields = f.recurring ? `
      <div class="field-row">
        <div>
          <div class="field-label">Priority</div>
          <select class="field-select" data-bind="taskForm.priority" data-action="noop">
            ${["Low", "Medium", "High"].map((o) => `<option value="${o}" ${f.priority === o ? "selected" : ""}>${o}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="field-row">
        <div style="max-width:140px;">
          <div class="field-label">Repeats per week</div>
          <input class="field-input" type="number" min="1" max="7" data-bind="taskForm.repeatsPerWeek" value="${escapeHtml(f.repeatsPerWeek)}" />
        </div>
        <div style="max-width:140px;">
          <div class="field-label">Amount per repeat</div>
          <input class="field-input" type="number" min="0" step="any" data-bind="taskForm.targetAmount" value="${escapeHtml(f.targetAmount)}" />
        </div>
      </div>
      <div>
        <div class="field-label">Unit</div>
        ${renderUnitPicker(f)}
      </div>` : `
      <div class="field-row">
        <div>
          <div class="field-label">Priority — how urgent this is</div>
          <select class="field-select" data-bind="taskForm.priority" data-action="noop">
            ${["Low", "Medium", "High"].map((o) => `<option value="${o}" ${f.priority === o ? "selected" : ""}>${o}</option>`).join("")}
          </select>
        </div>
        <div>
          <div class="field-label">Task type — how long it runs</div>
          <select class="field-select" data-bind="taskForm.taskType" data-action="change-task-type">
            ${["Short Term", "Medium Term", "Long Term"].map((o) => `<option value="${o}" ${f.taskType === o ? "selected" : ""}>${o}</option>`).join("")}
          </select>
        </div>
      </div>
      ${modeToggle}`;

    const typeToggle = f.lockType ? "" : `
        <div class="mode-toggle">
          <span style="font-size:12px;color:var(--dim);align-self:center;">Quest type:</span>
          <button type="button" class="chip ${!f.recurring ? "active" : ""}" style="${!f.recurring ? "background:var(--gold);border-color:var(--gold);" : "border-color:var(--gold-border);color:var(--gold-text);"}" data-action="set-recurring" data-value="0">One-off</button>
          <button type="button" class="chip ${f.recurring ? "active" : ""}" style="${f.recurring ? "background:var(--gold);border-color:var(--gold);" : "border-color:var(--gold-border);color:var(--gold-text);"}" data-action="set-recurring" data-value="1">Recurring habit</button>
        </div>`;

    return `
      <div class="quest-form">
        <input class="field-input" placeholder="${f.recurring ? "Habit name" : "Quest title"}" data-bind="taskForm.title" value="${escapeHtml(f.title)}" />
        ${typeToggle}
        ${typeFields}
        <div>
          <div class="field-label">${isEdit ? "Notes" : "Describe it"}</div>
          <textarea class="field-textarea" data-bind="taskForm.notes" placeholder="${isEdit ? "Optional notes..." : "What does this actually involve?"}">${escapeHtml(f.notes)}</textarea>
        </div>
        ${valueBlock}
        ${f.error ? `<div class="toast-error">${escapeHtml(f.error)}</div>` : ""}
        <div class="btn-row" style="justify-content:flex-end;">
          ${isEdit ? `<button class="btn btn-danger-outline" data-action="delete-task-from-form" data-id="${f.editId}" style="margin-right:auto;">${ui.armed && ui.armed.kind === "task" && ui.armed.id === f.editId ? "Confirm delete?" : "Delete quest"}</button>` : ""}
          <button class="btn btn-ghost" data-action="cancel-quest-form" ${f.busy ? "disabled" : ""}>Cancel</button>
          <button class="btn btn-primary" data-action="submit-quest-form" ${f.busy ? "disabled" : ""}>${f.busy ? "Evaluating…" : isEdit ? "Save changes" : "Accept quest"}</button>
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
        <div class="repeat-dots" title="${wp.count} of ${t.repeatsPerWeek} this week">${dots}</div>
        <span class="repeat-progress-text">${wp.count} of ${t.repeatsPerWeek} this week${totalAmount > 0 ? ` · ${totalAmount}${escapeHtml(t.unit)} logged` : ""}</span>
        <div class="repeat-actions">
          <button class="icon-mini" data-action="undo-repeat" data-id="${t.id}" ${wp.count > 0 ? "" : "disabled"} aria-label="Undo last log" title="Undo last log">${icon("minus", 13)}</button>
          ${timeBased ? `<button class="btn btn-outline btn-sm btn-icon-inline" data-action="open-timer" data-id="${t.id}">${icon("timer", 13)} Start timer</button>` : ""}
          <button class="btn btn-outline btn-sm" data-action="log-repeat" data-id="${t.id}">Log ${t.targetAmount}${escapeHtml(t.unit)}</button>
        </div>
      </div>`;
  }

  function renderTaskRow(state, ui, t) {
    const recurring = t.mode === "recurring";
    const done = !recurring && t.completion >= 100;
    const armed = ui.armed && ui.armed.kind === "task" && ui.armed.id === t.id;
    const typeSpans = t.types.map((k) => { const info = state.intTypes.find((x) => x.key === k); return info ? `<span style="color:${escapeHtml(info.color)}" title="Intelligence category: ${escapeHtml(info.name)}">${escapeHtml(info.short)}</span>` : ""; }).join("");
    const expTotal = SYS.ptToExp(t.pt, state.settings.expDivisor);

    const checkOrSpacer = recurring
      ? `<div class="check-btn" style="cursor:default;" aria-hidden="true" title="Recurring habit">${icon("repeat", 15)}</div>`
      : (t.mode === "simple" || t.mode === "allAtOnce")
        ? `<button class="check-btn ${done ? "done" : ""}" data-action="${done ? "reopen-task" : "complete-task"}" data-id="${t.id}" aria-label="${done ? "Mark incomplete" : "Complete quest"}">${done ? icon("check", 15) : ""}</button>`
        : `<div style="width:36px;flex-shrink:0;"></div>`;

    const stepper = t.mode === "gradual" ? `
      <div class="stepper-row">
        <button class="step-btn" data-action="task-step" data-id="${t.id}" data-delta="-5" aria-label="Decrease 5%">${icon("minus", 11)}</button>
        <input class="range-slider" type="range" min="0" max="100" step="1" value="${t.completion}" style="--pct:${t.completion}%" data-action="task-slide" data-id="${t.id}" aria-label="Set completion percentage" />
        <span class="progress-pct">${t.completion}%</span>
        <button class="step-btn plus" data-action="task-step" data-id="${t.id}" data-delta="5" aria-label="Increase 5%">${icon("plus", 11)}</button>
      </div>` : "";

    return `
      <div class="task-row ${done ? "done" : ""}">
        <div class="task-body">
          ${checkOrSpacer}
          <div style="flex:1;min-width:0;">
            <div class="task-title-row">
              <div class="task-title ${done ? "done" : ""}">${escapeHtml(t.title)}</div>
              <span class="task-reward">+${expTotal.toFixed(0)} xp${recurring ? "/repeat" : ""}</span>
              <div class="task-actions">
                ${ui.cloudUser ? `<button class="icon-mini" data-action="open-appeal-form" data-id="${t.id}" aria-label="Appeal this value" title="Appeal this value">${icon("flag", 13)}</button>` : ""}
                <button class="icon-mini" data-action="edit-task" data-id="${t.id}" aria-label="Edit quest">${icon("pencil", 13)}</button>
                <button class="icon-mini ${armed ? "danger-arm" : ""}" data-action="delete-task" data-id="${t.id}" aria-label="Delete quest" title="${armed ? "Click again to confirm" : "Delete quest"}">${icon(armed ? "check" : "trash", 13)}</button>
              </div>
            </div>
            <div class="task-meta">
              <span class="meta-pair"><span class="meta-label">Priority</span><span style="color:${PRIORITY_VAR[SYS.PRIORITY_COLOR[t.priority]]}">${t.priority}</span></span>
              ${recurring
                ? `<span class="meta-pair"><span class="meta-label">Repeats</span><span>${t.repeatsPerWeek}×/week</span></span>`
                : `<span class="meta-pair"><span class="meta-label">Term</span><span>${t.taskType}</span></span>`}
              ${typeSpans.length ? `<span class="meta-pair"><span class="meta-label">Type</span>${typeSpans}</span>` : ""}
            </div>
            ${t.notes ? `<div class="task-notes">${escapeHtml(t.notes)}</div>` : ""}
            ${recurring ? renderRepeatRow(state, t) : stepper}
          </div>
        </div>
      </div>`;
  }

  // ---------- Quests page (one-off tasks only) ----------
  const QUEST_FILTERS = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "done", label: "Done" },
  ];
  function renderQuestsPage(state, ui) {
    const showingForm = !!ui.taskForm && !ui.taskForm.recurring;
    const filter = ui.questFilter || "all";
    const oneOff = state.tasks.filter((t) => !t.recurring);
    const filtered = oneOff.filter((t) => filter === "all" ? true : filter === "active" ? t.completion < 100 : t.completion >= 100);
    const tasks = filtered.map((t) => renderTaskRow(state, ui, t)).join("");
    const filterChips = QUEST_FILTERS.map((f) => `<button class="chip filter-chip ${filter === f.key ? "active" : ""}" data-action="set-quest-filter" data-filter="${f.key}">${f.label}</button>`).join("");

    return `
      <div class="page-header">
        <div class="eyebrow">QUEST LOG</div>
        <h1 class="page-title">Your quests</h1>
      </div>
      <div class="sys-panel panel-pad">
        <div class="panel-head">
          <div class="chip-group">${filterChips}</div>
          ${!showingForm ? `<button class="btn btn-outline btn-icon-inline" data-action="open-quest-form">${icon("plus", 14)} New quest</button>` : ""}
        </div>
        ${showingForm ? renderTaskForm(state, ui) : ""}
        ${filtered.length === 0 ? `<div class="empty-note">${oneOff.length === 0 ? "No active quests. The System awaits your next move." : "Nothing in this filter."}</div>` : `<div>${tasks}</div>`}
      </div>
      ${renderAppealSection(ui)}`;
  }

  // Appeals — the human review path over the automatic evaluator. A user who
  // thinks a task was valued unfairly asks for a second look; these live in
  // Firestore rather than local state, so the section only appears with an
  // account (there's nobody to review an appeal otherwise).
  const APPEAL_STATUS_STYLE = {
    pending: { label: "Under review", color: "var(--dim)" },
    resolved: { label: "Value corrected", color: "var(--gold-text)" },
    rejected: { label: "Value upheld", color: "var(--rust-text)" },
  };
  function renderAppealForm(ui) {
    const f = ui.appealForm;
    return `
      <div class="quest-form" style="margin-top:10px;">
        <div class="field-label">Appealing: ${escapeHtml(f.taskTitle)}</div>
        <textarea class="field-textarea" placeholder="Why does this value look wrong?" data-bind="appealForm.reason">${escapeHtml(f.reason)}</textarea>
        ${f.error ? `<div class="toast-error">${escapeHtml(f.error)}</div>` : ""}
        <div class="btn-row" style="justify-content:flex-end;">
          <button class="btn btn-ghost" data-action="cancel-appeal-form" ${f.busy ? "disabled" : ""}>Cancel</button>
          <button class="btn btn-primary" data-action="submit-appeal-form" ${f.busy ? "disabled" : ""}>${f.busy ? "Submitting…" : "Submit appeal"}</button>
        </div>
      </div>`;
  }
  function renderAppealSection(ui) {
    if (!ui.cloudUser) return "";
    const showingForm = !!ui.appealForm;
    if (!showingForm && !ui.myAppeals.length) return "";
    const rows = ui.myAppeals.map((a) => {
      const style = APPEAL_STATUS_STYLE[a.status] || APPEAL_STATUS_STYLE.pending;
      const suffix = a.status === "resolved" && a.newPt ? ` · now ${escapeHtml(a.newPt)} xp` : "";
      return `
        <div class="log-entry">
          <span class="text">${escapeHtml(a.taskTitle)}</span>
          <span class="date" style="color:${style.color}">${style.label}${suffix}</span>
        </div>`;
    }).join("");
    return `
      <div class="sys-panel panel-pad" style="margin-top:16px;">
        <div class="eyebrow" style="margin-bottom:6px;">VALUE APPEALS</div>
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
        <div class="eyebrow">HABITS</div>
        <h1 class="page-title">Recurring habits</h1>
      </div>
      <div class="sys-panel panel-pad">
        <div class="panel-head">
          <span></span>
          ${!showingForm ? `<button class="btn btn-outline btn-icon-inline" data-action="open-habit-form">${icon("plus", 14)} New habit</button>` : ""}
        </div>
        ${showingForm ? renderTaskForm(state, ui) : ""}
        ${habits.length === 0 ? `<div class="empty-note">No recurring habits yet. Something you do every week belongs here, not in Quests.</div>` : `<div>${rows}</div>`}
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

  function renderStatsPage(state, ui) {
    const span = ui.statsSpan === "month" ? "month" : "week";
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
        <div class="eyebrow">STATISTICS</div>
        <h1 class="page-title">Your activity</h1>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
        <div class="theme-switcher" style="max-width:280px;">
          <button class="theme-option ${span === "week" ? "active" : ""}" data-action="set-stats-span" data-span="week">THIS WEEK</button>
          <button class="theme-option ${span === "month" ? "active" : ""}" data-action="set-stats-span" data-span="month">THIS MONTH</button>
        </div>
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--dim);">Today · ${todayShortDate()}</span>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <button class="icon-mini" data-action="${navAction}" data-delta="-1" aria-label="Previous">${icon("chevronLeft", 18)}</button>
        <div style="text-align:center;">
          <div style="font-size:15px;font-weight:600;color:var(--ink);">${escapeHtml(rangeLabel)}${offset !== 0 ? ` <button class="link-btn" data-action="${navAction}" data-delta="reset" style="margin-inline-start:6px;">Today</button>` : ""}</div>
          <div style="font-family:var(--font-mono);font-size:12px;color:var(--faint);margin-top:2px;">${data.year}</div>
        </div>
        <button class="icon-mini" data-action="${navAction}" data-delta="1" aria-label="Next">${icon("chevronRight", 18)}</button>
      </div>

      <div class="sys-panel panel-pad">
        ${span === "week" ? renderWeekBars(days) : renderMonthList(days)}
        <div style="margin-top:14px;padding-top:13px;border-top:1px solid var(--border);display:flex;justify-content:space-between;">
          <span style="font-size:12px;color:var(--dim);">${activeDays} of ${days.length} days active</span>
          <span style="font-size:12px;font-weight:500;color:var(--gold-text);">+${totalXp.toFixed(0)} xp</span>
        </div>
      </div>
      <div class="stat-tiles" style="margin-top:16px;">
        <div class="stat-tile"><div class="stat-num">${totalQuests}</div><div class="stat-label">Quests completed</div></div>
        <div class="stat-tile"><div class="stat-num">${totalRepeats}</div><div class="stat-label">Habit repeats logged</div></div>
      </div>`;
  }
  SYS.renderStatsPage = renderStatsPage;

  // ---------- Log page ----------
  function renderInboxSection(ui) {
    if (!ui.cloudUser || !ui.inbox.length) return "";
    const rows = ui.inbox.map((m) => `
      <div class="log-entry ${m.read ? "" : "unread"}" ${m.read ? "" : `data-action="mark-inbox-read" data-id="${m.id}" style="cursor:pointer;"`}>
        <span style="color:${m.read ? "var(--dim)" : "var(--gold-text)"};margin-top:2px;flex-shrink:0;">${icon("chevronRight", 13)}</span>
        <span class="text">${escapeHtml(m.text)}${m.amount ? ` <b style="color:${m.amount > 0 ? "var(--gold-text)" : "var(--rust-text)"}">(${m.amount > 0 ? "+" : ""}${escapeHtml(m.amount)} EXP)</b>` : ""}</span>
        ${!m.read ? `<span class="date" style="color:var(--gold-text);">new</span>` : ""}
      </div>`).join("");
    return `
      <div class="sys-panel panel-pad" style="margin-bottom:16px;">
        <div class="eyebrow" style="margin-bottom:6px;">FROM THE SYSTEM</div>
        <div>${rows}</div>
      </div>`;
  }

  function renderLogPage(state, ui) {
    const entries = state.log.length === 0
      ? `<div class="empty-note" style="padding:4px;">No milestones yet. Clear quests to begin your ascent.</div>`
      : `<div>${state.log.map((e) => `
          <div class="log-entry">
            <span style="color:var(--gold-text);margin-top:2px;flex-shrink:0;">${icon("chevronRight", 13)}</span>
            <span class="text">${escapeHtml(e.text)}</span>
            <span class="date">${escapeHtml(e.date)}</span>
          </div>`).join("")}</div>`;
    return `
      <div class="page-header">
        <div class="eyebrow">PROGRESSION LOG</div>
        <h1 class="page-title">Everything that happened</h1>
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
        <div class="modal-section-label">Result</div>
        <div style="font-size:13px;color:var(--ink);margin-bottom:4px;"><b>${escapeHtml(r.email)}</b></div>
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--faint);margin-bottom:14px;">${escapeHtml(r.uid)}</div>
        ${r.state ? `
          <div class="stat-tiles">
            <div class="stat-tile"><div class="stat-num">${escapeHtml(r.state.player.rank)}</div><div class="stat-label">Rank</div></div>
            <div class="stat-tile"><div class="stat-num">${escapeHtml(r.state.player.level)}</div><div class="stat-label">Level</div></div>
            <div class="stat-tile"><div class="stat-num">${escapeHtml(r.state.player.exp)}</div><div class="stat-label">EXP</div></div>
            <div class="stat-tile"><div class="stat-num">${escapeHtml(r.state.player.questsCompleted)}</div><div class="stat-label">Quests done</div></div>
          </div>` : `<div class="empty-note">No saved progress yet for this account.</div>`}
        <div class="form-hint" style="margin-top:14px;">Currently: ${r.isTargetAdmin ? "an admin" : "not an admin"}</div>
        <div class="btn-row" style="margin-top:8px;">
          <button class="btn btn-outline ${grantArmed ? "danger-arm" : ""}" data-action="admin-grant-admin" data-email="${escapeHtml(r.email)}" ${(ui.adminBusy || r.isTargetAdmin) ? "disabled" : ""}>${grantArmed ? "Click again to confirm" : "Make admin"}</button>
          <button class="btn btn-danger-outline ${revokeArmed ? "danger-arm" : ""}" data-action="admin-revoke-admin" data-email="${escapeHtml(r.email)}" ${(ui.adminBusy || !r.isTargetAdmin) ? "disabled" : ""}>${revokeArmed ? "Click again to confirm" : "Remove admin"}</button>
        </div>
        <hr class="hr" />
        <div class="modal-section-label">Send message / adjust EXP</div>
        <textarea class="field-textarea" placeholder="Message to this user..." data-bind="adminMsgText">${escapeHtml(ui.adminMsgText)}</textarea>
        <div class="field-row" style="margin-top:8px;align-items:flex-start;">
          <input class="field-input" type="number" step="any" placeholder="EXP amount (optional, can be negative)" data-bind="adminMsgAmount" value="${escapeHtml(ui.adminMsgAmount)}" />
          <button class="btn btn-primary" data-action="admin-send-adjustment" style="flex-shrink:0;" ${ui.adminMsgBusy ? "disabled" : ""}>${ui.adminMsgBusy ? "Sending…" : "Send"}</button>
        </div>
        <div class="form-hint">Leave the amount blank (or 0) to just send a message with no EXP change. Negative values apply a penalty.</div>
        ${ui.adminMsgError ? `<div class="toast-error">${escapeHtml(ui.adminMsgError)}</div>` : ""}
      </div>`;

    return `
      <div class="page-header">
        <div class="eyebrow">ADMIN</div>
        <h1 class="page-title">Look up a user</h1>
      </div>
      <div class="sys-panel panel-pad">
        <div class="field-label">Email</div>
        <div class="field-row" style="align-items:flex-start;">
          <input class="field-input" type="email" placeholder="user@example.com" data-bind="adminSearchEmail" value="${escapeHtml(ui.adminSearchEmail)}" />
          <button class="btn btn-primary" data-action="admin-search" style="flex-shrink:0;" ${ui.adminBusy ? "disabled" : ""}>${ui.adminBusy ? "Searching…" : "Search"}</button>
        </div>
        ${ui.adminSearchError ? `<div class="toast-error" style="margin-top:8px;">${escapeHtml(ui.adminSearchError)}</div>` : ""}
        <div class="form-hint" style="margin-top:10px;">
          Can't find someone who signed up before this Admin page existed?
          <button class="link-btn" data-action="admin-backfill-directory" ${ui.adminBusy ? "disabled" : ""}>Sync directory</button>
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
  function renderAdminAppealQueue(ui) {
    const rows = ui.adminAppealQueue.map((a) => {
      const pointsVal = ui.adminAppealPoints[a.id] || "";
      return `
        <div class="sys-panel" style="padding:14px 16px;margin-top:10px;">
          <div style="font-size:13px;color:var(--ink);font-weight:600;">${escapeHtml(a.taskTitle)}</div>
          <div class="task-meta" style="margin-top:4px;">
            <span class="meta-pair"><span class="meta-label">Current</span><span>${escapeHtml(a.currentPt)} xp${a.taskKind === "habit" ? "/repeat" : ""}</span></span>
            <span class="meta-pair"><span class="meta-label">Kind</span><span>${escapeHtml(a.taskKind || "quest")}</span></span>
          </div>
          ${a.taskDescription ? `<div class="task-notes" style="margin-top:6px;">${escapeHtml(a.taskDescription)}</div>` : ""}
          <div style="margin-top:8px;font-size:12px;color:var(--body);line-height:1.5;"><b style="color:var(--gold-text);">Their reason:</b> ${escapeHtml(a.reason)}</div>
          <div style="font-family:var(--font-mono);font-size:10.5px;color:var(--faint);margin-top:6px;">from ${escapeHtml(a.userId)}</div>
          <div class="btn-row" style="margin-top:10px;">
            <input class="field-input" type="number" min="1" placeholder="Corrected xp" style="max-width:130px;" data-bind="adminAppealPoints.${a.id}" value="${escapeHtml(pointsVal)}" />
            <button class="btn btn-primary" data-action="admin-resolve-appeal" data-id="${a.id}" ${ui.adminAppealBusy ? "disabled" : ""}>Correct value</button>
            <button class="btn btn-danger-outline" data-action="admin-reject-appeal" data-id="${a.id}" ${ui.adminAppealBusy ? "disabled" : ""}>Uphold</button>
          </div>
        </div>`;
    }).join("");
    return `
      <div class="sys-panel panel-pad" style="margin-top:16px;">
        <div class="panel-head">
          <div class="eyebrow" style="margin:0;">VALUE APPEALS</div>
          <button class="link-btn" data-action="admin-refresh-appeals" ${ui.adminAppealBusy ? "disabled" : ""}>Refresh</button>
        </div>
        ${ui.adminAppealError ? `<div class="toast-error">${escapeHtml(ui.adminAppealError)}</div>` : ""}
        ${ui.adminAppealQueue.length === 0 ? `<div class="empty-note">Nothing pending.</div>` : rows}
      </div>`;
  }

  // ---------- page dispatcher ----------
  function renderPage(state, ui) {
    switch (ui.page) {
      case "quests": return renderQuestsPage(state, ui);
      case "habits": return renderHabitsPage(state, ui);
      case "stats": return renderStatsPage(state, ui);
      case "intelligence": return renderIntelligencePage(state, ui);
      case "log": return renderLogPage(state, ui);
      case "admin": return renderAdminPage(state, ui);
      default: return renderOverviewPage(state, ui);
    }
  }
  SYS.renderPage = renderPage;

  // ---------- notifications ----------
  const NOTIF_STYLE = {
    levelup: { label: "LEVEL UP", color: "var(--gold-text)" },
    skillpoint: { label: "STAT INVESTED", color: "var(--gold-text)" },
    info: { label: "SYSTEM", color: "var(--gold-text)" },
    expLoss: { label: "PROGRESS ADJUSTED", color: "var(--dim)" },
    delevel: { label: "LEVEL REVERTED", color: "var(--dim)" },
    rankdown: { label: "RANK DOWN", color: "var(--rust-text)" },
  };
  function renderNotifStack(ui) {
    return ui.toasts.map((n) => {
      const style = NOTIF_STYLE[n.kind] || { label: "QUEST PROGRESS", color: "var(--gold-text)" };
      return `
        <div class="notif">
          <div class="notif-kind" style="color:${style.color}">${style.label}</div>
          <div class="notif-text">${escapeHtml(n.text)}</div>
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
      <div class="rankup-overlay show" id="rankup-overlay" data-action="dismiss-rankup" role="alertdialog" aria-label="Rank up">
        <div class="rankup-eyebrow">System notice</div>
        <div class="rankup-ring"><div class="rankup-ring-inner"><span class="rankup-letter">${rank}</span></div></div>
        <div class="rankup-sub">${escapeHtml(ui.rankupShowing.text)}</div>
        <div class="rankup-hint">click anywhere to continue</div>
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
          <div class="modal-title">Existing account data found</div>
          <div style="font-size:13px;color:var(--body);line-height:1.6;margin-bottom:18px;">
            Your account already has progress saved from another device. Which copy do you want to keep? The other one will be overwritten.
          </div>
          <div class="btn-row" style="flex-direction:column;gap:8px;">
            <button class="btn btn-primary" data-action="sync-choice" data-choice="cloud" style="width:100%;">Use my account's data (this device gets overwritten)</button>
            <button class="btn btn-outline" data-action="sync-choice" data-choice="local" style="width:100%;">Use this device's data (your account gets overwritten)</button>
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
          <div class="modal-title">${t.recurring ? "TIMER" : ""}</div>
          <div style="font-size:16px;font-weight:600;color:var(--ink);margin-bottom:22px;">${escapeHtml(t.title)}</div>
          <div id="timer-display" style="font-family:var(--font-display);font-size:52px;font-weight:600;letter-spacing:-0.03em;color:var(--ink-strong);margin:10px 0 26px;">${fmtElapsed(elapsedMs)}</div>
          <div class="btn-row" style="justify-content:center;gap:10px;">
            ${ui.timer.running
              ? `<button class="btn btn-outline btn-icon-inline" data-action="timer-pause">${icon("pause", 14)} Pause</button>`
              : `<button class="btn btn-primary btn-icon-inline" data-action="timer-start">${icon("play", 14)} ${ui.timer.accumulatedMs > 0 ? "Resume" : "Start"}</button>`}
            <button class="btn btn-outline btn-icon-inline" data-action="timer-stop-log" ${elapsedMs < 1000 ? "disabled" : ""}>${icon("stop", 13)} Stop &amp; log</button>
          </div>
          <button class="btn btn-ghost" data-action="close-timer" style="width:100%;margin-top:18px;">Cancel</button>
        </div>
      </div>`;
  }

  function renderAccountSection(ui) {
    if (!SYS.Cloud || !SYS.Cloud.available()) {
      return `
        <div class="modal-section-label">Account &amp; sync</div>
        <div class="form-hint">Cloud sync isn't set up for this copy of the app yet — see README.</div>`;
    }
    if (ui.cloudUser) {
      const unverified = ui.cloudUser.emailVerified === false;
      return `
        <div class="modal-section-label">Account &amp; sync</div>
        <div style="font-size:13px;color:var(--ink);margin-bottom:10px;">Signed in as <b>${escapeHtml(ui.cloudUser.email)}</b></div>
        ${unverified ? `
          <div style="font-size:12px;color:var(--gold-text);margin-bottom:10px;line-height:1.5;">
            Email not verified yet — check your inbox for the link.
            <button class="link-btn" style="margin-left:4px;" data-action="account-resend-verification">Resend email</button>
          </div>` : ""}
        <div class="form-hint" style="margin-bottom:10px;">${ui.syncStatus ? escapeHtml(ui.syncStatus) : "Your progress syncs automatically."}</div>
        <button class="btn btn-outline" data-action="account-sign-out">Sign out</button>`;
    }
    const f = ui.accountForm || { mode: "signin", email: "", password: "", error: null, info: null, busy: false };
    return `
      <div class="modal-section-label">Account &amp; sync</div>
      <button class="btn btn-outline btn-icon-inline" style="width:100%;justify-content:center;" data-action="account-google">${GOOGLE_ICON_SVG} Continue with Google</button>
      <hr class="hr" style="margin:14px 0;" />
      <div class="theme-switcher" style="margin-bottom:12px;">
        <button class="theme-option ${f.mode === "signin" ? "active" : ""}" data-action="set-account-mode" data-mode="signin">SIGN IN</button>
        <button class="theme-option ${f.mode === "signup" ? "active" : ""}" data-action="set-account-mode" data-mode="signup">CREATE ACCOUNT</button>
      </div>
      <input class="field-input" style="margin-bottom:8px;" type="email" placeholder="Email" data-bind="accountForm.email" value="${escapeHtml(f.email)}" />
      <input class="field-input" style="margin-bottom:10px;" type="password" placeholder="Password (6+ characters)" data-bind="accountForm.password" value="${escapeHtml(f.password)}" />
      ${f.mode === "signin" ? `<button class="link-btn" style="display:block;margin-top:-4px;margin-bottom:10px;" data-action="account-forgot-password">Forgot password?</button>` : ""}
      ${f.error ? `<div class="toast-error" style="margin-bottom:10px;">${escapeHtml(f.error)}</div>` : ""}
      ${f.info ? `<div class="form-hint" style="color:var(--gold-text);margin-bottom:10px;">${escapeHtml(f.info)}</div>` : ""}
      <button class="btn btn-primary" data-action="account-submit" ${f.busy ? "disabled" : ""}>${f.busy ? "Please wait…" : (f.mode === "signup" ? "Create account" : "Sign in")}</button>
      <div class="form-hint" style="margin-top:8px;">Lets you pick up the same progress on another device.</div>`;
  }

  function renderSettingsModal(state, ui) {
    const s = ui.settingsDraft || state.settings;
    const resetArmed = ui.armed && ui.armed.kind === "reset";
    const allThemeNames = [...Object.keys(SYS.THEMES), SYS.CUSTOM_THEME_NAME];
    const themeOptions = allThemeNames.map((name) =>
      `<button class="theme-option ${state.settings.theme === name ? "active" : ""}" data-action="set-theme" data-theme="${escapeHtml(name)}">${name.toUpperCase()}</button>`
    ).join("");
    const custom = state.settings.customTheme || { dark: true, accent: "#d9a05b", base: "#141110" };
    // Only three choices, because everything else in the palette is derived
    // from them — that's what keeps a hand-picked theme readable instead of
    // letting someone land on grey text over a grey background.
    const customControls = state.settings.theme !== SYS.CUSTOM_THEME_NAME ? "" : `
      <div style="margin-top:12px;">
        <div class="theme-switcher" style="margin-bottom:10px;">
          <button class="theme-option ${custom.dark ? "active" : ""}" data-action="set-custom-mode" data-dark="1">DARK</button>
          <button class="theme-option ${!custom.dark ? "active" : ""}" data-action="set-custom-mode" data-dark="0">LIGHT</button>
        </div>
        <div class="field-row">
          <div>
            <div class="field-label">Accent</div>
            <input type="color" class="field-input" style="padding:2px;height:38px;" data-action="set-custom-accent" value="${escapeHtml(custom.accent)}" />
          </div>
          <div>
            <div class="field-label">Background</div>
            <input type="color" class="field-input" style="padding:2px;height:38px;" data-action="set-custom-base" value="${escapeHtml(custom.base)}" />
          </div>
        </div>
        <div class="form-hint">Everything else — text, borders, panels — is derived from these so it stays readable.</div>
      </div>`;
    return `
      <div class="modal-backdrop" data-action="close-modal-backdrop">
        <div class="sys-panel modal-box" data-stop-close="1">
          <div class="modal-title">System settings</div>

          <div class="modal-section">
            <div class="modal-section-label">Appearance</div>
            <div class="theme-switcher">${themeOptions}</div>
            ${customControls}
          </div>

          <hr class="hr" />

          <div class="modal-section">
            ${renderAccountSection(ui)}
          </div>

          <hr class="hr" />

          <div class="modal-section">
            <div class="modal-section-label">Progression tuning</div>
            <div class="settings-row">
              <label for="exp-divisor">EXP divisor (Pt ÷ this = EXP — leave at 1 so Pt = EXP)</label>
              <input id="exp-divisor" class="field-input" type="number" min="1" data-bind="settingsDraft.expDivisor" value="${escapeHtml(s.expDivisor)}" />
            </div>
            <div class="settings-row">
              <label for="pts-per-level">Skill points per level</label>
              <input id="pts-per-level" class="field-input" type="number" min="1" data-bind="settingsDraft.pointsPerLevel" value="${escapeHtml(s.pointsPerLevel)}" />
            </div>
            <button class="btn btn-primary" data-action="save-settings">Save settings</button>
          </div>

          <hr class="hr" />

          <div class="modal-section">
            <div class="modal-section-label">Backup</div>
            <div class="btn-row">
              <button class="btn btn-outline btn-icon-inline" data-action="export-backup">${icon("download", 13)} Export JSON</button>
              <button class="btn btn-outline btn-icon-inline" data-action="import-backup">${icon("upload", 13)} Import JSON</button>
            </div>
            <div class="form-hint">Everything lives only in this browser's local storage — export a backup regularly, especially before clearing browser data.</div>
            ${ui.importError ? `<div class="toast-error">${escapeHtml(ui.importError)}</div>` : ""}
          </div>

          <hr class="hr" />

          <div class="modal-section">
            <div class="modal-section-label">Danger zone</div>
            <button class="btn btn-danger-outline" data-action="reset-data">${resetArmed ? "Click again to confirm reset" : "Reset to seed data"}</button>
          </div>

          <hr class="hr" />
          <button class="btn btn-ghost" data-action="close-modal" style="width:100%;">Close</button>
        </div>
      </div>`;
  }

  function renderAddCategoryModal(state, ui) {
    const d = ui.addCategoryDraft || { name: "", ar: "", short: "", color: "#cf9a5c" };
    return `
      <div class="modal-backdrop" data-action="close-modal-backdrop">
        <div class="sys-panel modal-box" data-stop-close="1">
          <div class="modal-title">New intelligence category</div>
          <div class="modal-section">
            <label class="field-label">Name</label>
            <input class="field-input" data-bind="addCategoryDraft.name" value="${escapeHtml(d.name)}" placeholder="e.g. Financial Intelligence" />
          </div>
          <div class="modal-section">
            <label class="field-label">Arabic name (optional)</label>
            <input class="field-input" data-bind="addCategoryDraft.ar" value="${escapeHtml(d.ar)}" />
          </div>
          <div class="field-row">
            <div>
              <label class="field-label">Short code</label>
              <input class="field-input" data-bind="addCategoryDraft.short" maxlength="6" value="${escapeHtml(d.short)}" placeholder="e.g. FIN" />
            </div>
            <div>
              <label class="field-label">Color</label>
              <input type="color" class="field-input" style="padding:2px;height:38px;" data-bind="addCategoryDraft.color" value="${escapeHtml(d.color)}" />
            </div>
          </div>
          ${ui.addCategoryError ? `<div class="toast-error">${escapeHtml(ui.addCategoryError)}</div>` : ""}
          <div class="btn-row" style="justify-content:flex-end;margin-top:16px;">
            <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
            <button class="btn btn-primary" data-action="submit-add-category">Create category</button>
          </div>
        </div>
      </div>`;
  }
})(window.SYS = window.SYS || {});

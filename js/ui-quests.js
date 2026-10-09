// UI: the overview and intelligence pages, the quest form, quest rows and the quests page.
// One of the files ui.js was split into; the names they share travel through SYS._ui.
(function (SYS) {
  "use strict";
  const U = SYS._ui || (SYS._ui = {});
  const { assessPrompt, buildRadarSVG, dateLocale, escapeHtml, helpMark, icon, intArt, intName, levelDial, logMark, pageIcon, radarPoles, rankArt, renderPageHead, renderSchedulePicker, renderTodayCard, renderWeekBars, t } = U;

  function renderOverviewPage(state, ui) {
    const p = state.player;
    const radar = buildRadarSVG(state.intTypes, state.intelligences);
    const activeQuests = state.tasks.filter((x) => !x.recurring && x.completion < 100).length;
    const today = SYS.todayKey();
    const dueToday = state.tasks.filter((x) => SYS.isAskedOn(x, today));
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
      ${renderPageHead("overview")}

      <div class="level-ring-wrap">
        <div class="ring-holder">
          ${levelDial(pct, `
            <span class="level-ring-label">${t("overview.level")}${helpMark("level", true)}</span>
            <span class="level-ring-num">${p.level}</span>
            <span class="level-ring-xp">${t("overview.xpOf", { exp: p.exp, of: SYS.levelCost(p.rank) })}</span>`)}
        </div>
        <div class="hero-rank"><button class="hero-rank-btn" data-action="open-ranks" title="${t("status.rank", { rank: p.rank })}">${rankArt(p.rank, 66)}</button>${helpMark("rank", true)}</div>
        <h1 class="page-hero-title">${escapeHtml(p.name)}</h1>
      </div>

      ${assessPrompt(state)}

      <div class="stat-tiles" style="margin-top:26px;">
        ${tile("quests", activeQuests, t("overview.activeQuests"), "list")}
        ${tile("habits", dueToday.length ? doneToday + "/" + dueToday.length : "0", t("overview.habitsToday"), "repeat")}
        ${tile("habits", streak, t("overview.streak"), "zap")}
        ${tile("stats", weekXp, t("overview.weekExp"), "bar")}
      </div>

      ${renderTodayCard(state, ui)}

      ${renderWeekBars(state)}

      <div class="sys-panel panel-pad overview-radar">
        <div class="eyebrow" style="margin-bottom:6px;">${t("overview.radar")}</div>
        ${radarPoles(state)}
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
                <span class="text">${escapeHtml(U.localLine(e.text))}</span>
                <span class="date">${escapeHtml(e.date)}</span>
              </div>`; }).join("")}</div>`}
      </div>`;
  }
  SYS.renderOverviewPage = renderOverviewPage;

  // ---------- Intelligence page (card grid) ----------
  function renderIntelligencePage(state, ui) {
    // Shut until the assessment is finished: the page is a reading of it.
    if (!state.assessment) return `${renderPageHead("intelligence")}${assessPrompt(state)}`;
    const sortMode = ui.intelSort === "name" ? "name" : "level";
    const types = state.intTypes.filter((x) => state.intelligences[x.key]);
    const avgOf = (x) => SYS.categoryScore(state.intelligences[x.key]);
    // The bar is each category against the strongest one, so the row of bars
    // says the same thing the radar does. There is no absolute ceiling to
    // measure against — a category can grow forever — and the old constant
    // (avg * 3.6, full at 27.8) was invented for a number that no longer
    // exists.
    const topScore = Math.max(0, ...types.map(avgOf));
    const ordered = types.slice().sort(sortMode === "name"
      ? (a, b) => intName(a).localeCompare(intName(b), dateLocale())
      : (a, b) => avgOf(b) - avgOf(a));
    const best = types.slice().sort((a, b) => avgOf(b) - avgOf(a))[0];
    const worst = types.slice().sort((a, b) => avgOf(a) - avgOf(b))[0];

    const cards = ordered.map((t) => {
      const intel = state.intelligences[t.key];
      const isOpen = !!ui.expanded[t.key];
      const avg = SYS.categoryScore(intel);
      const barPct = topScore > 0 ? (avg / topScore) * 100 : 0;
      // How far into the next point this category already is, not how much is
      // left — "100% to the next" on an untouched category read backwards.
      const toNext = Math.round((Number(intel.remainder) || 0) * 100);
      const topLevel = intel.traits.reduce((m, x) => Math.max(m, Number(x.level) || 0), 0);

      const traitRows = intel.traits.map((tr) => {
        const armed = ui.armed && ui.armed.kind === "trait" && ui.armed.id === tr.id;
        const isTop = topLevel > 0 && tr.level === topLevel;
        return `
          <div class="trait-row ${isTop ? "top" : ""}">
            <span class="name">${isTop ? `<span class="trait-star" title="${SYS.t("intel.strongestTrait")}">★</span>` : ""}${escapeHtml(SYS.traitName(tr))}</span>
            <span style="display:flex;align-items:center;gap:8px;">
              ${SYS.traitTier(tr.level) ? `<span class="trait-tier">${SYS.t("tier." + SYS.traitTier(tr.level))}</span>` : ""}
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
        <div class="sys-panel intel-card" id="intel-${escapeHtml(t.key)}" style="--mark:${escapeHtml(t.color)}">
          <button class="intel-card-head" data-action="toggle-intel" data-key="${t.key}" aria-expanded="${isOpen}">
            <div>
              <div class="intel-card-key">${intArt(t, 48, "intel-card-emblem")}</div>
              <div class="intel-card-name">${escapeHtml(intName(t))}</div>
              ${t.ar && SYS.currentLanguage() === "en" ? `<div class="intel-card-ar">${escapeHtml(t.ar)}</div>` : ""}
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="avg-badge">${avg}</span>
              <span class="chevron ${isOpen ? "open" : "closed"}">${icon("chevronDown", 13)}</span>
            </div>
          </button>
          ${toNext > 0 ? `<div class="intel-points">${SYS.t("intel.toNext", { pct: toNext })}</div>` : ""}
          <div class="intel-bar-track"><div class="intel-bar-fill" style="width:${barPct}%;background:${escapeHtml(t.color)};"></div></div>
          ${isOpen ? `
            <div class="trait-list">
              ${traitRows}
              ${intel.remainder > 0.01 ? `<div class="remainder-note">${SYS.t("intel.remainder", { pct: (intel.remainder * 100).toFixed(0) })}</div>` : ""}
            </div>
          ` : ""}
        </div>`;
    }).join("");

    const showRecent = !!state.settings.radarRecent;
    const radar = buildRadarSVG(state.intTypes, state.intelligences,
      showRecent ? SYS.recentScores(state, 90) : null);
    return `
      ${renderPageHead("intelligence")}
      <div class="sys-panel panel-pad intel-radar">
        <div style="height:300px;display:flex;justify-content:center;">${radar}</div>
        <div class="radar-switch">
          <button class="chip filter-chip ${showRecent ? "active" : ""}" data-action="toggle-radar-recent" aria-pressed="${showRecent}">${t("intel.recent")}</button>
          ${showRecent ? `<span class="radar-key">${t("intel.recentKey")}</span>` : ""}
        </div>
        ${best && worst && best.key !== worst.key ? `
          <div class="intel-poles">
            <span class="intel-pole"><span class="intel-pole-label">${t("intel.strongest")}</span>
              <button class="intel-pole-name" data-action="intel-open" data-key="${escapeHtml(best.key)}" style="--cat:${escapeHtml(best.color)}">${escapeHtml(intName(best))}</button></span>
            <span class="intel-pole"><span class="intel-pole-label">${t("intel.weakest")}</span>
              <button class="intel-pole-name" data-action="intel-open" data-key="${escapeHtml(worst.key)}" style="--cat:${escapeHtml(worst.color)}">${escapeHtml(intName(worst))}</button></span>
          </div>` : ""}
      </div>
      <div class="friends-rank-head" style="margin-bottom:10px;">
        <span class="planner-section" style="margin:0;">${t("intel.title")}${helpMark("traits", true)}</span>
        <span class="planner-tabs intel-sort">
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
          ${g.units.map((u) => `<button type="button" class="chip chip-gold unit-chip ${f.unit === u ? "active" : ""}" data-action="set-unit" data-unit="${u}">${escapeHtml(SYS.tUnit(u))}</button>`).join("")}
        </div>
      </div>`).join("");
    return `
      <div class="unit-picker">
        ${groups}
        <div class="unit-group">
          <span class="unit-group-label">${t("form.other")}</span>
          <div class="chip-group">
            <button type="button" class="chip chip-gold unit-chip ${isCustom ? "active" : ""}" data-action="set-unit" data-unit="custom">${t("form.custom")}</button>
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
          return t ? `<span class="chip chip-int" style="--lit-a:${escapeHtml(t.color)}">${intArt(t, 48)}</span>` : "";
        }).join("")
      : `<span class="chip" style="color:var(--faint);">${t("form.general")}</span>`;

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
        <button type="button" class="chip chip-gold ${f.expMode === "gradual" ? "active" : ""}" data-action="set-exp-mode" data-mode="gradual">${t("form.gradual")}</button>
        <button type="button" class="chip chip-gold ${f.expMode === "allAtOnce" ? "active" : ""}" data-action="set-exp-mode" data-mode="allAtOnce">${t("form.allAtOnce")}</button>
      </div>` : "";

    // A quit habit is measured by not happening, so the amount, the unit and
    // the schedule all go: it is one clean day at a time, every day. Hiding
    // them is the honest move — leaving them visible would imply they matter.
    const quitToggle = `
      <div class="chip-row" style="margin-bottom:9px;">
        <span style="font-size:12px;color:var(--dim);">${t("form.habitKind")}</span>
        <button type="button" class="chip chip-gold ${!f.quit ? "active" : ""}" data-action="set-quit" data-value="0">${t("form.kindBuild")}</button>
        <button type="button" class="chip chip-gold ${f.quit ? "active" : ""}" data-action="set-quit" data-value="1">${t("form.kindQuit")}</button>
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
          <div class="appearance-preview">${chosenIcon ? escapeHtml(chosenIcon) : SYS.TASK_MARK}</div>
          <input class="field-input icon-input" data-bind="taskForm.icon" value="${escapeHtml(f.icon || "")}"
            placeholder="${escapeHtml(SYS.taskIcon({ title: f.title }))}" maxlength="16" aria-label="${t("form.appearance")}" />
        </div>
        <div class="form-hint">${t("form.emojiOnly")}<span class="emoji-shortcut"> ${t(isMac ? "form.emojiHintMac" : "form.emojiHintWin")}</span></div>
      </div>`;

    const typeToggle = f.lockType ? "" : `
        <div class="mode-toggle">
          <span style="font-size:12px;color:var(--dim);align-self:center;">${t("form.questType")}</span>
          <button type="button" class="chip chip-gold ${!f.recurring ? "active" : ""}" data-action="set-recurring" data-value="0">${t("form.oneOff")}</button>
          <button type="button" class="chip chip-gold ${f.recurring ? "active" : ""}" data-action="set-recurring" data-value="1">${t("task.recurringHabit")}</button>
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
          <button class="btn btn-primary" data-action="submit-quest-form" ${f.busy ? "disabled" : ""}>${f.busy ? t("form.evaluating") : isEdit ? t("form.saveChanges") : t(f.recurring ? "form.acceptHabit" : "form.accept")}</button>
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
        ? escapeHtml(SYS.traitName(traits[idx]))
        : `<span style="color:var(--rust-text);" title="${escapeHtml(target.trait)}">${escapeHtml(target.trait)} — ${SYS.t("task.buildsUnmatched")}</span>`;
    });
    return `<span class="meta-pair"><span class="meta-label">${SYS.t("task.builds")}</span><span>${names.join(", ")}</span></span>`;
  }

  function renderTaskRow(state, ui, t) {
    const recurring = t.mode === "recurring";
    const awaiting = !recurring && questAwaiting(t);
    const done = !recurring && t.completion >= 100 && !awaiting;
    const armed = ui.armed && ui.armed.kind === "task" && ui.armed.id === t.id;
    const typeSpans = t.types.map((k) => { const info = state.intTypes.find((x) => x.key === k); return info ? intArt(info, 48, "task-int") : ""; }).join("");
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
            ${U.renderTaskHeld(t)}
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
        return info ? `<span class="chip chip-int" style="--lit-a:${escapeHtml(info.color)}">${intArt(info, 48)}</span>` : "";
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
           ${ui.cloudUser
             ? `<button class="btn btn-primary btn-icon-inline" data-action="open-quest-form">${icon("plus", 14)} ${t("quests.first")}</button>`
             : `<button class="btn btn-primary" data-action="open-settings">${t("account.signIn")}</button>`}
         </div>`
      : `<div class="empty-note">${t("quests.emptyFilter")}</div>`;

    return `
      ${renderPageHead("quests")}
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

  Object.assign(U, { renderOverviewPage, renderIntelligencePage, renderUnitPicker, renderTaskForm, renderTaskTarget, renderTaskRow, QUEST_FILTERS, renderSuggestionsSection, PRIORITY_ORDER, questAwaiting, questDone, sortQuests, renderQuestsPage, APPEAL_STATUS_STYLE, renderAppealForm, renderAppealSection });
})(window.SYS = window.SYS || {});

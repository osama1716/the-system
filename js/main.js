(function (SYS) {
  "use strict";

  let state = SYS.Storage.load() || SYS.defaultState();
  // Defensive merge in case a save predates a field added later.
  state.settings = { ...SYS.DEFAULT_SETTINGS, ...(state.settings || {}) };
  state.intTypes = Array.isArray(state.intTypes) && state.intTypes.length ? state.intTypes : SYS.DEFAULT_INT_TYPES.map((t) => ({ ...t }));
  state.levelHistory = Array.isArray(state.levelHistory) ? state.levelHistory : [];
  // The 8 built-in categories have no "edit color" UI, so any saved color on
  // one of these keys can only be a stale palette from a previous version of
  // the app — keep them synced to the current design tokens. Custom
  // user-added categories (picked via the color input) are left untouched.
  function syncDefaultIntTypeColors(intTypes) {
    const defaultColors = new Map(SYS.DEFAULT_INT_TYPES.map((t) => [t.key, t.color]));
    return intTypes.map((t) => defaultColors.has(t.key) ? { ...t, color: defaultColors.get(t.key) } : t);
  }
  {
    const migrated = syncDefaultIntTypeColors(state.intTypes);
    if (JSON.stringify(migrated) !== JSON.stringify(state.intTypes)) {
      state.intTypes = migrated;
      SYS.Storage.save(state);
    }
  }

  const ui = {
    page: "overview",
    questFilter: "all",
    expanded: {},
    addTraitOpen: null,
    addTraitDraft: null,
    taskForm: null,
    armed: null,
    nameEditing: false,
    __nameDraft: null,
    modal: null,
    settingsDraft: null,
    addCategoryDraft: null,
    addCategoryError: null,
    importError: null,
    rankupQueue: [],
    rankupShowing: null,
    toasts: [],
  };

  let toastSeq = 0;
  let armedTimer = null;
  let rankupTimer = null;

  function applyThemeAttribute() {
    document.documentElement.setAttribute("data-theme", state.settings.theme === "White & gold" ? "light" : "dark");
  }

  const $sidebar = document.getElementById("sidebar");
  const $statusbar = document.getElementById("statusbar");
  const $page = document.getElementById("page");
  const $notif = document.getElementById("notif-stack");
  const $rankup = document.getElementById("rankup-layer");
  const $modal = document.getElementById("modal-layer");
  const $importInput = document.getElementById("import-file-input");

  function renderSidebarInto() { $sidebar.innerHTML = SYS.renderSidebar(ui); }
  function renderStatusbarInto() {
    $statusbar.innerHTML = SYS.renderStatusbar(state, ui);
    if (ui.nameEditing) {
      const el = document.getElementById("name-input");
      if (el) { el.focus(); el.select(); }
    }
  }
  function renderPageInto() { $page.innerHTML = SYS.renderPage(state, ui); }
  function renderAppInto() { renderSidebarInto(); renderStatusbarInto(); renderPageInto(); }
  function renderModalInto() { $modal.innerHTML = SYS.renderModalLayer(state, ui); }
  function renderNotifInto() { $notif.innerHTML = SYS.renderNotifStack(ui); }
  function renderRankupInto() { $rankup.innerHTML = SYS.renderRankupLayer(ui); }

  function setPath(obj, path, value) {
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
    cur[parts[parts.length - 1]] = value;
  }

  function addToast(n) {
    const id = ++toastSeq;
    ui.toasts.push({ ...n, id });
    renderNotifInto();
    setTimeout(() => { ui.toasts = ui.toasts.filter((x) => x.id !== id); renderNotifInto(); }, 4200);
  }

  function maybeShowNextRankup() {
    if (ui.rankupShowing || !ui.rankupQueue.length) return;
    ui.rankupShowing = ui.rankupQueue.shift();
    renderRankupInto();
    SYS.Sound.play("rankup");
    rankupTimer = setTimeout(dismissRankup, 3800);
  }
  function dismissRankup() {
    if (rankupTimer) { clearTimeout(rankupTimer); rankupTimer = null; }
    if (!ui.rankupShowing) return;
    ui.rankupShowing = null;
    renderRankupInto();
    setTimeout(maybeShowNextRankup, 300);
  }

  const SOUND_KINDS = new Set(["levelup", "skillpoint", "delevel", "rankdown"]);
  function processNotifications(list) {
    (list || []).forEach((n) => {
      if (n.kind === "rankup") { ui.rankupQueue.push(n); return; }
      if (SOUND_KINDS.has(n.kind)) SYS.Sound.play(n.kind);
      addToast(n);
    });
    maybeShowNextRankup();
  }

  function runGameAction(mutator) {
    const draft = SYS.clone(state);
    const notifications = mutator(draft) || [];
    state = draft;
    SYS.Storage.save(state);
    renderAppInto();
    processNotifications(notifications);
  }

  function arm(kind, id) {
    if (armedTimer) clearTimeout(armedTimer);
    ui.armed = { kind, id };
    armedTimer = setTimeout(() => { ui.armed = null; renderAppInto(); renderModalInto(); }, 3000);
  }
  function disarm() {
    if (armedTimer) { clearTimeout(armedTimer); armedTimer = null; }
    ui.armed = null;
  }
  function isArmed(kind, id) { return !!ui.armed && ui.armed.kind === kind && ui.armed.id === id; }

  const ARMABLE = new Set(["delete-task", "remove-trait", "delete-task-from-form", "reset-data"]);

  function normalizeImportedState(parsed) {
    const base = SYS.defaultState();
    return {
      schema: 1,
      settings: { ...base.settings, ...(parsed.settings || {}) },
      player: { ...base.player, ...(parsed.player || {}) },
      intTypes: syncDefaultIntTypeColors(Array.isArray(parsed.intTypes) && parsed.intTypes.length ? parsed.intTypes : base.intTypes),
      intelligences: parsed.intelligences && typeof parsed.intelligences === "object" ? parsed.intelligences : base.intelligences,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      log: Array.isArray(parsed.log) ? parsed.log : [],
      levelHistory: Array.isArray(parsed.levelHistory) ? parsed.levelHistory : [],
    };
  }

  function commitName() {
    if (!ui.nameEditing) return;
    const val = (ui.__nameDraft || "").trim() || "Hunter";
    ui.nameEditing = false;
    ui.__nameDraft = null;
    runGameAction((draft) => { SYS.setName(draft, val); return []; });
  }

  // ---------------- event wiring ----------------

  document.addEventListener("input", (e) => {
    const bind = e.target.dataset && e.target.dataset.bind;
    if (bind) { setPath(ui, bind, e.target.value); return; }
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
      const t = state.tasks.find((x) => x.id === id);
      const wasDone = t ? t.completion >= 100 : false;
      runGameAction((draft) => SYS.applyTaskProgress(draft, id, newVal));
      const nowDone = state.tasks.find((x) => x.id === id)?.completion >= 100;
      if (!wasDone && nowDone) SYS.Sound.play("quest");
      return;
    }
    if (e.target.dataset && e.target.dataset.action === "change-task-type") {
      if (!ui.taskForm) return;
      if (ui.taskForm.taskType === "Long Term" && !["gradual", "allAtOnce"].includes(ui.taskForm.expMode)) {
        ui.taskForm.expMode = "gradual";
      }
      renderAppInto();
      return;
    }
    if (e.target.dataset && e.target.dataset.action === "change-unit") {
      renderAppInto();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.id === "name-input") {
      if (e.key === "Enter") { e.preventDefault(); e.target.blur(); }
      if (e.key === "Escape") { ui.nameEditing = false; ui.__nameDraft = null; renderAppInto(); }
    }
  });

  document.addEventListener("focusout", (e) => {
    if (e.target.id === "name-input") commitName();
  });

  $importInput.addEventListener("change", () => {
    const file = $importInput.files && $importInput.files[0];
    $importInput.value = "";
    if (!file) return;
    SYS.Storage.importFromFile(file).then((parsed) => {
      state = normalizeImportedState(parsed);
      SYS.Storage.save(state);
      applyThemeAttribute();
      SYS.Sound.setEnabled(state.settings.soundEnabled !== false);
      ui.modal = null;
      ui.expanded = {};
      ui.importError = null;
      renderAppInto();
      renderModalInto();
      addToast({ kind: "info", text: "Backup imported successfully." });
    }).catch((err) => {
      ui.importError = err.message;
      renderModalInto();
    });
  });

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    const key = el.dataset.key;
    const id = el.dataset.id;

    if (action === "close-modal-backdrop") {
      if (e.target.closest("[data-stop-close]")) return;
      ui.modal = null; ui.settingsDraft = null; ui.addCategoryDraft = null; ui.addCategoryError = null; ui.importError = null;
      renderModalInto();
      return;
    }

    if (ARMABLE.has(action)) {
      const armKind = action === "remove-trait" ? "trait" : action === "reset-data" ? "reset" : "task";
      const armId = action === "remove-trait" ? el.dataset.trait : action === "reset-data" ? "reset" : (id || el.dataset.id);
      if (!isArmed(armKind, armId)) {
        arm(armKind, armId);
        if (action === "reset-data") renderModalInto(); else renderAppInto();
        return;
      }
      disarm();
      // falls through to perform the confirmed action below
    } else if (ui.armed) {
      disarm();
    }

    switch (action) {
      case "open-settings":
        ui.modal = "settings"; ui.settingsDraft = { ...state.settings }; ui.importError = null;
        renderModalInto();
        break;
      case "close-modal":
        ui.modal = null; ui.settingsDraft = null; ui.addCategoryDraft = null; ui.addCategoryError = null; ui.importError = null;
        renderModalInto();
        break;
      case "save-settings": {
        const d = ui.settingsDraft;
        ui.modal = null;
        runGameAction((draft) => { SYS.updateSettings(draft, d); return []; });
        renderModalInto();
        break;
      }
      case "set-theme": {
        const themeName = el.dataset.theme;
        runGameAction((draft) => { SYS.setTheme(draft, themeName); return []; });
        applyThemeAttribute();
        renderModalInto();
        break;
      }
      case "set-sound": {
        const on = el.dataset.value === "1";
        runGameAction((draft) => { SYS.setSoundEnabled(draft, on); return []; });
        SYS.Sound.setEnabled(on);
        if (on) SYS.Sound.play("skillpoint");
        renderModalInto();
        break;
      }
      case "export-backup":
        SYS.Storage.exportToFile(state);
        addToast({ kind: "info", text: "Backup downloaded." });
        break;
      case "import-backup":
        $importInput.click();
        break;
      case "reset-data":
        state = SYS.defaultState();
        SYS.Storage.save(state);
        applyThemeAttribute();
        SYS.Sound.setEnabled(state.settings.soundEnabled !== false);
        ui.modal = null; ui.expanded = {};
        renderAppInto();
        renderModalInto();
        break;

      case "edit-name":
        ui.nameEditing = true; ui.__nameDraft = state.player.name;
        renderAppInto();
        break;

      case "toggle-intel":
        ui.expanded[key] = !ui.expanded[key];
        renderAppInto();
        break;
      case "spend-banked":
        runGameAction((draft) => {
          const name = SYS.spendBankedPoint(draft, key);
          return name ? [{ kind: "skillpoint", text: `+1 pt → ${name} (manual)` }] : [];
        });
        break;
      case "open-add-trait":
        ui.addTraitOpen = key; ui.addTraitDraft = { key, name: "", ar: "" };
        renderAppInto();
        break;
      case "cancel-add-trait":
        ui.addTraitOpen = null; ui.addTraitDraft = null;
        renderAppInto();
        break;
      case "submit-add-trait": {
        const d = ui.addTraitDraft;
        if (!d || !d.name.trim()) return;
        ui.addTraitOpen = null; ui.addTraitDraft = null;
        runGameAction((draft) => { SYS.addTrait(draft, key, d.name, d.ar); return []; });
        break;
      }
      case "remove-trait":
        runGameAction((draft) => { SYS.removeTrait(draft, key, el.dataset.trait); return []; });
        break;
      case "open-add-category":
        ui.modal = "addCategory"; ui.addCategoryDraft = { name: "", ar: "", short: "", color: "#4fd1ff" }; ui.addCategoryError = null;
        renderModalInto();
        break;
      case "submit-add-category": {
        const d = ui.addCategoryDraft;
        if (!d || !d.name.trim()) { ui.addCategoryError = "Name is required."; renderModalInto(); return; }
        const shortCode = (d.short && d.short.trim()) ? d.short.trim().toUpperCase() : d.name.trim().slice(0, 4).toUpperCase();
        const draft = SYS.clone(state);
        const newKey = SYS.addIntType(draft, { name: d.name, ar: d.ar, short: shortCode, color: d.color });
        state = draft;
        SYS.Storage.save(state);
        ui.expanded[newKey] = true;
        ui.modal = null; ui.addCategoryDraft = null; ui.addCategoryError = null;
        renderAppInto();
        renderModalInto();
        break;
      }

      case "open-quest-form":
        ui.taskForm = {
          formKind: "add", editId: null, title: "", priority: "Medium", taskType: "Short Term", types: [], pt: 100, expMode: "simple",
          notes: "", timeSpent: 0, error: null,
          recurring: false, repeatsPerWeek: 3, unit: "reps", targetAmount: 1, customUnit: "",
        };
        renderAppInto();
        break;
      case "edit-task": {
        const t = state.tasks.find((x) => x.id === id);
        if (!t) return;
        const knownUnits = SYS.UNIT_GROUPS.flatMap((g) => g.units);
        const unitIsKnown = t.recurring ? knownUnits.includes(t.unit) : true;
        ui.taskForm = {
          formKind: "edit", editId: id, title: t.title, priority: t.priority, taskType: t.taskType || "Short Term", types: [...t.types],
          pt: t.pt, expMode: t.mode === "gradual" ? "gradual" : "allAtOnce", notes: t.notes || "", timeSpent: t.timeSpent || 0, error: null,
          recurring: !!t.recurring,
          repeatsPerWeek: t.repeatsPerWeek || 3,
          unit: t.recurring ? (unitIsKnown ? t.unit : "custom") : "reps",
          targetAmount: t.targetAmount || 1,
          customUnit: t.recurring && !unitIsKnown ? t.unit : "",
        };
        renderAppInto();
        break;
      }
      case "cancel-quest-form":
        ui.taskForm = null;
        renderAppInto();
        break;
      case "toggle-form-type": {
        if (!ui.taskForm) return;
        const i = ui.taskForm.types.indexOf(key);
        if (i >= 0) ui.taskForm.types.splice(i, 1); else ui.taskForm.types.push(key);
        renderAppInto();
        break;
      }
      case "set-exp-mode":
        if (!ui.taskForm) return;
        ui.taskForm.expMode = el.dataset.mode;
        renderAppInto();
        break;
      case "set-recurring":
        if (!ui.taskForm) return;
        ui.taskForm.recurring = el.dataset.value === "1";
        renderAppInto();
        break;
      case "submit-quest-form": {
        const f = ui.taskForm;
        if (!f) return;
        if (!f.title || !f.title.trim()) { f.error = "Quest needs a title."; renderAppInto(); return; }
        const resolvedUnit = f.unit === "custom" ? ((f.customUnit || "").trim() || "unit") : f.unit;
        const formForEngine = {
          title: f.title, priority: f.priority, taskType: f.taskType, types: f.types, pt: f.pt, mode: f.expMode, notes: f.notes, timeSpent: f.timeSpent,
          recurring: f.recurring, repeatsPerWeek: f.repeatsPerWeek, unit: resolvedUnit, targetAmount: f.targetAmount,
        };
        const isEdit = f.formKind === "edit";
        const editId = f.editId;
        ui.taskForm = null;
        runGameAction((draft) => {
          if (isEdit) return SYS.updateTask(draft, editId, formForEngine);
          SYS.addTask(draft, formForEngine);
          return [];
        });
        break;
      }
      case "delete-task-from-form":
        ui.taskForm = null;
        runGameAction((draft) => { SYS.removeTask(draft, id); return []; });
        break;

      case "complete-task":
        runGameAction((draft) => SYS.completeSimpleTask(draft, id));
        SYS.Sound.play("quest");
        break;
      case "reopen-task":
        runGameAction((draft) => SYS.reopenSimpleTask(draft, id));
        break;
      case "delete-task":
        runGameAction((draft) => { SYS.removeTask(draft, id); return []; });
        break;
      case "task-step": {
        const t = state.tasks.find((x) => x.id === id);
        if (!t) return;
        const wasDone = t.completion >= 100;
        const delta = Number(el.dataset.delta);
        const newVal = t.completion + delta;
        runGameAction((draft) => SYS.applyTaskProgress(draft, id, newVal));
        const nowDone = state.tasks.find((x) => x.id === id)?.completion >= 100;
        if (!wasDone && nowDone) SYS.Sound.play("quest");
        break;
      }
      case "log-repeat":
        runGameAction((draft) => SYS.logRecurringRepeat(draft, id));
        SYS.Sound.play("quest");
        break;
      case "undo-repeat":
        runGameAction((draft) => SYS.undoLastRecurringRepeat(draft, id));
        break;

      case "dismiss-rankup":
        dismissRankup();
        break;

      case "nav":
        ui.page = el.dataset.page;
        renderSidebarInto();
        renderPageInto();
        break;
      case "set-quest-filter":
        ui.questFilter = el.dataset.filter;
        renderPageInto();
        break;

      default:
        break;
    }
  });

  // ---------------- boot ----------------
  applyThemeAttribute();
  SYS.Sound.setEnabled(state.settings.soundEnabled !== false);
  renderAppInto();
  renderNotifInto();
  renderRankupInto();
  renderModalInto();
})(window.SYS = window.SYS || {});

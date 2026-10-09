// Click handlers: navigation, quests, the assessment, settings, the shop and everything else.
// One of the files main.js was split into; the names they share travel through SYS._main.
(function (SYS) {
  "use strict";
  const M = SYS._main || (SYS._main = {});
  const { $importInput, ACTIONS, aiLimitText, applyThemeAttribute, blankSchedule, closeLogSheet, closeTimeSheet, dismissRankup, dismissToast, flushTimer, leaveLanding, logDay, markSuggestionHandled, maybeOpenReflection, needsSignIn, openAssessment, openSignIn, openTimeSheet, persist, playBrand, reconcileExpWithServer, refreshAdminAppealQueue, refreshAdminStats, refreshBlockedList, refreshFriendRows, refreshLeaderboard, refreshMyAppeals, refreshPushState, refreshRaceScores, refreshReflections, refreshRemindCount, refreshSuggestions, refreshUnlocks, refuseLocked, refuseOldDay, rememberMe, resetAmount, resumeIndex, saveAssessDraft, saveTimer, scheduleFromWeeklyCount, stopTimerTick, timerHasTime, toggleIn, ui } = M;

  ACTIONS["open-shop"] = function () {
    ui.modal = null; ui.page = "shop"; ui.shopArmed = null;
    M.renderModalInto();
    M.renderSidebarInto();
    M.renderPageInto();
  };

  ACTIONS["shop-tab"] = function ({ el }) {
    ui.shopTab = el.dataset.tab; ui.shopArmed = null;
    M.renderPageInto();
  };

  ACTIONS["shop-wear"] = function ({ el }) {
    const kind = el.dataset.kind;
    const id = el.dataset.id || null;
    if (ui.shopBusy) return;
    ui.shopBusy = "wear:" + kind;
    M.renderPageInto();
    SYS.Cloud.callWearItem(kind, id).then((res) => {
      ui.shopBusy = null;
      ui.myWorn = { ...(ui.myWorn || {}), [kind]: res ? res.id : id };
      if (kind === "frame" && ui.cloudUser) ui.frames = { ...(ui.frames || {}), [ui.cloudUser.uid]: ui.myWorn.frame };
      rememberMe();
      M.renderStatusbarInto();
      M.addToast({ kind: "info", text: SYS.t(id ? "shop.wearing" : "shop.tookOff") });
      M.renderPageInto();
    }).catch((err) => {
      ui.shopBusy = null;
      const code = err && err.details && err.details.code;
      M.addToast({ kind: "error", text: SYS.t(code ? "shop.err." + code.replace("shop-", "") : "shop.err.unknown") });
      M.renderPageInto();
    });
  };

  ACTIONS["shop-use-theme"] = function ({ el }) {
    const name = el.dataset.id;
    if (!SYS.ownsTheme(ui.wallet, name)) return;
    M.runGameAction((draft) => { SYS.setTheme(draft, name); return []; });
    applyThemeAttribute();
    M.renderAppInto();
  };

  ACTIONS["shop-buy"] = function ({ el }) {
    const key = el.dataset.kind + ":" + (el.dataset.id || "");
    if (ui.shopArmed !== key) { ui.shopArmed = key; M.renderPageInto(); return; }
    ui.shopArmed = null; ui.shopBusy = key;
    M.renderPageInto();
    const item = { kind: el.dataset.kind, id: el.dataset.id || undefined };
    SYS.Cloud.callBuyItem(item).then((res) => {
      ui.shopBusy = null;
      if (res && res.wallet) ui.wallet = res.wallet;
      if (item.kind === "theme") {
        M.runGameAction((draft) => { SYS.setTheme(draft, item.id); return []; });
        applyThemeAttribute();
      }
      M.addToast({ kind: "info", text: SYS.t("shop.bought") });
      M.renderAppInto();
    }).catch((err) => {
      ui.shopBusy = null;
      const code = err && err.details && err.details.code;
      M.addToast({ kind: "error", text: SYS.t(code ? "shop.err." + code.replace("shop-", "") : "shop.err.unknown") });
      M.renderPageInto();
    });
  };

  ACTIONS["landing-start"] = function () {
    leaveLanding();
    if (!M.state.assessment && !M.state.settings.assessDraft) ui.assess = { i: -1, answers: {}, result: null };
    M.renderAssessmentInto();
  };

  ACTIONS["landing-signin"] = function () {
    leaveLanding();
    refreshPushState();
    ui.modal = "settings"; ui.settingsDraft = { ...M.state.settings }; ui.importError = null;
    M.renderModalInto();
  };

  ACTIONS["open-settings"] = function () {
    refreshPushState();
    ui.modal = "settings"; ui.settingsDraft = { ...M.state.settings }; ui.importError = null;
    M.renderModalInto();
    // Best-effort refresh of emailVerified — reload() mutates the same
    // Firebase user object in place, so this just picks up a verification
    // click that happened since the last page load.
    if (SYS.Cloud && SYS.Cloud.available() && ui.cloudUser) {
      SYS.Cloud.reloadUser().then((user) => {
        if (user) { ui.cloudUser = { email: user.email, uid: user.uid, emailVerified: user.emailVerified }; M.renderModalInto(); }
      }).catch(() => {});
    }
  };

  ACTIONS["toggle-planner-habits"] = function () {
    M.runGameAction((draft) => { draft.settings.plannerShowHabits = !draft.settings.plannerShowHabits; return []; });
    M.renderPageInto();
  };

  ACTIONS["copy-invite"] = function () {
    const link = ui.inviteLink;
    if (!link) return;
    const done = () => M.addToast({ kind: "info", text: SYS.t("friends.copied") });
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(done).catch(() => {});
    } else {
      const box = document.querySelector(".invite-row .field-input");
      if (box) { box.select(); try { document.execCommand("copy"); done(); } catch (e) { /* nothing to fall back to */ } }
    }
  };

  ACTIONS["close-modal"] = function () {
    if (ui.deleteAccount && ui.deleteAccount.busy) return;
    ui.deleteAccount = null; ui.aiReport = null;
    ui.modal = null; ui.settingsDraft = null; ui.importError = null; ui.helpTopic = null;
    ui.eventForm = null; ui.eventView = null;
    ui.profileUid = null; ui.profileEdit = null; ui.profileReport = null;
    ui.raceForm = null;
    ui.feedback = null;
    M.renderModalInto();
    // A drag that was not confirmed goes back where it came from.
    if (ui.eventMove) { ui.eventMove = null; M.renderPageInto(); }
  };

  ACTIONS["assess-begin"] = function () {
    const d = M.state.settings.assessDraft || {};
    ui.assess.answers = { ...(d.answers || {}), ...(ui.assess.answers || {}) };
    ui.assess.i = resumeIndex({ answers: ui.assess.answers, i: d.i });
    M.renderAssessmentInto();
  };

  ACTIONS["assess-open"] = function () {
    openAssessment();
  };

  ACTIONS["assess-later"] = function () {
    saveAssessDraft();
    ui.assess = null;
    M.renderAssessmentInto();
    M.renderAppInto();
  };

  ACTIONS["assess-back"] = function () {
    if (ui.assess.i > 0) ui.assess.i -= 1;
    saveAssessDraft();
    M.renderAssessmentInto();
  };

  ACTIONS["assess-answer"] = function ({ el }) {
    const q = (SYS.ASSESSMENT || [])[ui.assess.i];
    if (!q) return;
    const raw = el.dataset.value;
    ui.assess.answers[q.id] = raw === SYS.ASSESSMENT_NA ? SYS.ASSESSMENT_NA : Number(raw);
    ui.assess.i += 1;
    // The last answer is what applies it. Nothing is granted until every
    // statement has been answered, because the budget is shared out
    // between them \u2014 a half-answered test would hand the whole of it to
    // whichever half was answered.
    if (ui.assess.i >= (SYS.ASSESSMENT || []).length) {
      M.runGameAction((draft) => {
        SYS.applyAssessment(draft, ui.assess.answers);
        delete draft.settings.assessDraft;
        return [];
      });
      M.renderAppInto();
    } else {
      // Every answer is kept the moment it is given, on this account, so
      // closing the app mid-way \u2014 or carrying on from another device \u2014
      // loses nothing.
      saveAssessDraft();
    }
    M.renderAssessmentInto();
  };

  ACTIONS["assess-skip"] = function () {
    if (!ui.isAdmin) return;
    M.runGameAction((draft) => { SYS.skipAssessment(draft); return []; });
    ui.assess = null;
    M.renderAssessmentInto();
    M.renderAppInto();
  };

  ACTIONS["assess-pace"] = function ({ el }) {
    const h = Number(el.dataset.pace);
    if (ui.assess && (SYS.PROJECTION_PACES || []).indexOf(h) >= 0) { ui.assess.pace = h; M.renderAssessmentInto(); }
  };

  ACTIONS["assess-enter"] = function () {
    ui.assess = null;
    M.renderAssessmentInto();
    M.renderAppInto();
  };

  ACTIONS["toggle-radar-recent"] = function () {
    const on = !M.state.settings.radarRecent;
    M.runGameAction((draft) => { SYS.setRadarRecent(draft, on); return []; });
    M.renderPageInto();
  };

  ACTIONS["set-account-mode"] = function ({ el }) {
    ui.accountForm.mode = el.dataset.mode;
    ui.accountForm.error = null;
    ui.accountForm.info = null;
    M.renderModalInto();
  };

  ACTIONS["sync-choice"] = function ({ el }) {
    const choice = el.dataset.choice;
    if (choice === "cloud" && ui.pendingCloudState) M.applyRemoteState(ui.pendingCloudState);
    else if (choice === "local") SYS.Cloud.push(M.state);
    ui.pendingCloudState = null;
    ui.modal = null;
    M.renderModalInto();
  };

  ACTIONS["replay-brand"] = function () {
    playBrand();
  };

  ACTIONS["export-backup"] = function () {
    SYS.Storage.exportToFile(M.state);
    M.addToast({ kind: "info", text: SYS.t("common.backupDownloaded") });
  };

  ACTIONS["import-backup"] = function () {
    $importInput.click();
  };

  ACTIONS["reset-data"] = function () {
    M.state = SYS.defaultState();
    persist(M.state);
    // A reset empties the planner too, on every device.
    SYS.PlannerSync.commit(M.state.planner);
    applyThemeAttribute();
    ui.modal = null; ui.expanded = {};
    M.renderAppInto();
    M.renderModalInto();
  };

  ACTIONS["edit-name"] = function () {
    ui.nameEditing = true; ui.__nameDraft = M.state.player.name;
    M.renderAppInto();
  };

  ACTIONS["intel-sort"] = function ({ el }) {
    ui.intelSort = el.dataset.sort === "name" ? "name" : "level";
    M.renderPageInto();
  };

  // Straight to the category that needs the work, opened as it lands.
  ACTIONS["intel-open"] = function ({ el }) {
    const key = el.dataset.key;
    if (!key) return;
    ui.expanded[key] = true;
    // The overview's radar carries this button too, and there the card
    // being opened is on another page entirely — without this the button
    // expanded something nobody could see and appeared to do nothing.
    if (ui.page !== "intelligence") {
      ui.page = "intelligence";
      M.renderSidebarInto();
    }
    M.renderPageInto();
    const card = document.getElementById("intel-" + key);
    if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  ACTIONS["toggle-intel"] = function ({ key }) {
    ui.expanded[key] = !ui.expanded[key];
    M.renderAppInto();
  };

  // Categories and traits cannot be added from the app — see
  // renderIntelligencePage. Removing a non-seed trait left over from before
  // stays with the admin.
  ACTIONS["remove-trait"] = function ({ el, key }) {
    if (!ui.isAdmin) return;
    M.runGameAction((draft) => { SYS.removeTrait(draft, key, el.dataset.trait); return []; });
  };

  ACTIONS["open-quest-form"] = function () {
    if (needsSignIn()) { openSignIn(); return; }
    ui.taskForm = {
      formKind: "add", editId: null, title: "", priority: "Medium", taskType: "Short Term", types: [], pt: 100, expMode: "simple",
      notes: "", error: null, busy: false, lockType: true,
      recurring: false, quit: false, reminders: [], remindNote: "", schedule: blankSchedule(), unit: "reps", targetAmount: 1, customUnit: "",
      icon: "",
    };
    M.renderAppInto();
  };

  ACTIONS["open-habit-form"] = function () {
    if (needsSignIn()) { openSignIn(); return; }
    ui.taskForm = {
      formKind: "add", editId: null, title: "", priority: "Medium", taskType: "Short Term", types: [], pt: 20, expMode: "simple",
      notes: "", error: null, busy: false, lockType: true,
      recurring: true, quit: false, reminders: [], remindNote: "", schedule: blankSchedule(), unit: "reps", targetAmount: 1, customUnit: "",
      icon: "",
    };
    M.renderAppInto();
  };

  ACTIONS["open-appeal-form"] = function ({ id }) {
    const t = M.state.tasks.find((x) => x.id === id);
    if (!t) return;
    ui.appealForm = { taskId: t.id, taskTitle: t.title, reason: "", error: null, busy: false };
    M.renderPageInto();
  };

  ACTIONS["cancel-appeal-form"] = function () {
    ui.appealForm = null;
    M.renderPageInto();
  };

  ACTIONS["submit-appeal-form"] = function () {
    const f = ui.appealForm;
    if (!f || f.busy) return;
    if (f.reason.trim().length < 10) { f.error = SYS.t("appeal.needsReason"); M.renderPageInto(); return; }
    const task = M.state.tasks.find((x) => x.id === f.taskId);
    if (!task) { ui.appealForm = null; M.renderPageInto(); return; }
    f.busy = true; f.error = null;
    M.renderPageInto();
    SYS.Cloud.createAppeal(task, f.reason).then(() => {
      ui.appealForm = null;
      M.addToast({ kind: "info", text: SYS.t("appeal.submitted") });
      refreshMyAppeals();
      M.renderPageInto();
    }).catch((err) => {
      f.busy = false;
      const code = err && err.details && err.details.code;
      const key = { "appeal-limit": "appeal.limit", "appeal-open": "appeal.open", "appeal-unpriced": "appeal.unpriced", "appeal-reason": "appeal.needsReason" }[code];
      f.error = key ? SYS.t(key) : (err && err.message) || "Couldn't submit that.";
      M.renderPageInto();
    });
  };

  ACTIONS["open-reflection"] = function ({ el, id }) {
    const task = M.state.tasks.find((x) => x.id === id);
    if (!task) return;
    ui.reflectionFor = { taskId: id, cp: Number(el.dataset.cp) === 100 ? 100 : 50 };
    ui.reflectionDraft = "";
    ui.reflectionError = null;
    ui.reflectionBusy = false;
    ui.modal = "reflection";
    M.renderModalInto();
  };

  ACTIONS["submit-reflection"] = function () {
    const f = ui.reflectionFor || {};
    const task = M.state.tasks.find((x) => x.id === f.taskId);
    if (!task || !task.priceId || ui.reflectionBusy) return;
    const answer = String(ui.reflectionDraft || "").trim();
    if (answer.length < 8) { ui.reflectionError = SYS.t("reflect.tooShort"); M.renderModalInto(); return; }
    ui.reflectionBusy = true; ui.reflectionError = null;
    M.renderModalInto();
    SYS.Cloud.callSubmitReflection(task.priceId, f.cp, answer).then((res) => {
      ui.reflectionBusy = false;
      const current = { ...(task.reflections || {}) };
      current[f.cp] = { status: res.status, reason: res.reason || "", attemptsLeft: Number(res.attemptsLeft) || 0 };
      M.runGameAction((draft) => SYS.applyReflections(draft, { [task.priceId]: current }));
      if (res.status === "accepted") {
        ui.modal = null;
        M.addToast({ kind: "info", text: SYS.t("reflect.accepted", { n: Number(res.released) || 0 }) });
      } else if (!(Number(res.attemptsLeft) > 0)) {
        // Out of rewrites: it waits for a person now, so there is nothing
        // left to do in this sheet.
        ui.modal = null;
        M.addToast({ kind: "info", text: SYS.t("reflect.waiting") });
      } else {
        // Kept, so the reason can be acted on without starting again.
        ui.reflectionDraft = answer;
      }
      M.renderModalInto();
    }).catch((err) => {
      ui.reflectionBusy = false;
      ui.reflectionError = (err && err.message) || "That couldn't be checked.";
      M.renderModalInto();
    });
  };

  ACTIONS["mark-inbox-read"] = function ({ el }) {
    const msgId = el.dataset.id;
    const msg = ui.inbox.find((m) => m.id === msgId);
    if (!msg || msg.read) return;
    msg.read = true; // optimistic — this is a low-stakes, same-user toggle
    M.renderPageInto();
    M.renderSidebarInto();
    SYS.Cloud.markInboxRead(msgId).catch(() => {});
  };

  ACTIONS["edit-task"] = function ({ id }) {
    const t = M.state.tasks.find((x) => x.id === id);
    if (!t) return;
    const knownUnits = SYS.UNIT_GROUPS.flatMap((g) => g.units);
    const unitIsKnown = t.recurring ? knownUnits.includes(t.unit) : true;
    ui.taskForm = {
      formKind: "edit", editId: id, title: t.title, priority: t.priority, taskType: t.taskType || "Short Term", types: [...t.types],
      pt: t.pt, expMode: t.mode === "gradual" ? "gradual" : "allAtOnce", notes: t.notes || "", error: null, busy: false, lockType: false, traitTargets: t.traitTargets || [], priceId: t.priceId || null,
      recurring: !!t.recurring,
      quit: !!t.quit,
      reminders: SYS.reminderTimes(t), remindNote: t.remindNote || "",
      schedule: Object.assign(blankSchedule(), SYS.scheduleOf(t)),
      unit: t.recurring ? (unitIsKnown ? t.unit : "custom") : "reps",
      targetAmount: t.targetAmount || 1,
      customUnit: t.recurring && !unitIsKnown ? t.unit : "",
      icon: t.icon || "",
    };
    M.renderAppInto();
    // On the Stats page the form opens under the habit's buttons, which on
    // a phone is usually below the fold. Bring it into view, or the press
    // looks like it did nothing.
    {
      const box = document.querySelector(".stats-edit");
      if (box) box.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  };

  ACTIONS["cancel-quest-form"] = function () {
    ui.taskForm = null;
    M.renderAppInto();
  };

  ACTIONS["set-exp-mode"] = function ({ el }) {
    if (!ui.taskForm) return;
    ui.taskForm.expMode = el.dataset.mode;
    M.renderAppInto();
  };

  ACTIONS["set-recurring"] = function ({ el }) {
    if (!ui.taskForm) return;
    ui.taskForm.recurring = el.dataset.value === "1";
    M.renderAppInto();
  };

  ACTIONS["set-unit"] = function ({ el }) {
    if (!ui.taskForm) return;
    ui.taskForm.unit = el.dataset.unit;
    M.renderAppInto();
  };

  ACTIONS["submit-quest-form"] = function () {
    const f = ui.taskForm;
    if (!f || f.busy) return;
    if (!f.title || !f.title.trim()) { f.error = SYS.t("form.needsTitle"); M.renderAppInto(); return; }
    if (f.formKind !== "edit" && (!f.notes || f.notes.trim().length < 10)) {
      f.error = SYS.t("form.needsDescription");
      M.renderAppInto();
      return;
    }
    const resolvedUnit = f.unit === "custom" ? ((f.customUnit || "").trim() || "unit") : f.unit;
    const isEdit = f.formKind === "edit";
    const editId = f.editId;

    const commit = (pt, types, traitTargets, priceId) => {
      const formForEngine = {
        title: f.title, priority: f.priority, taskType: f.taskType, types, pt, mode: f.expMode, notes: f.notes,
        recurring: f.recurring, quit: !!f.quit, reminders: f.reminders, remindNote: f.remindNote, schedule: f.schedule, unit: resolvedUnit, targetAmount: f.targetAmount,
        traitTargets, priceId,
        // Which price this one replaces, so the server moves what the old
        // one already paid instead of paying the same work twice.
        fromPriceId: priceId && f.priceId && priceId !== f.priceId ? f.priceId : null,
        // The payload is built field by field rather than spread from the
        // form, so anything added to the form has to be added here too or
        // it is silently dropped on save — which is exactly what happened
        // to these two the first time.
        icon: f.icon,
      };
      ui.taskForm = null;
      M.runGameAction((draft) => {
        if (isEdit) return SYS.updateTask(draft, editId, formForEngine);
        SYS.addTask(draft, formForEngine);
        return [];
      });
      // Straight away, not on the next page change: a task that opens in
      // two days must not sit there looking ready for the seconds it takes
      // somebody to reach for it.
      refreshUnlocks(true);
      refreshReflections();
    };

    // An edit that changes what the task *is* gets priced again; an edit
    // that changes how it looks does not.
    //
    // Editing used to never re-evaluate, to stop someone editing until
    // they liked the number. That left the opposite and much larger hole:
    // "finish the app" priced at 1800, then retitled "play one football
    // match", keeps 1800 — and since the server pays from the stored
    // price, it pays the old one. Re-pricing is the honest side of the
    // trade: the value follows the task, the old evaluation is discarded,
    // and the daily evaluation cap is what stops the fishing.
    const original = isEdit ? M.state.tasks.find((x) => x.id === editId) : null;
    const materialEdit = !!original && (
      original.title.trim() !== f.title.trim() ||
      (original.notes || "").trim() !== (f.notes || "").trim() ||
      !!original.recurring !== !!f.recurring ||
      !!original.quit !== !!f.quit ||
      (original.recurring && (
        JSON.stringify(SYS.sanitizeSchedule(SYS.scheduleOf(original))) !== JSON.stringify(SYS.sanitizeSchedule(f.schedule)) ||
        original.unit !== resolvedUnit ||
        (Number(original.targetAmount) || 1) !== (Number(f.targetAmount) || 1)
      ))
    );
    if (isEdit && !materialEdit) { commit(f.pt, f.types, f.traitTargets, f.priceId); return; }
    // A re-priced task needs a description to be priced fairly, exactly as
    // a new one does — the check above skips edits, which is right up to
    // the moment the edit is the thing being priced.
    if (isEdit && (!f.notes || f.notes.trim().length < 10)) {
      f.error = SYS.t("form.needsDescription");
      M.renderAppInto();
      return;
    }

    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.cloudUser) {
      f.error = SYS.t("form.signInToAdd");
      M.renderAppInto();
      return;
    }
    if (!navigator.onLine) {
      f.error = SYS.t("form.offline");
      M.renderAppInto();
      return;
    }

    f.busy = true; f.error = null;
    M.renderAppInto();
    SYS.Cloud.callEvaluateTask({
      title: f.title,
      description: f.notes,
      kind: f.recurring ? "habit" : "quest",
      quit: !!(f.recurring && f.quit),
      // Both: the schedule says what was actually committed to, and
      // the rate is what makes two schedules comparable. The rate also
      // keeps a server that predates schedules able to price the task.
      schedule: f.recurring ? SYS.sanitizeSchedule(f.schedule) : undefined,
      repeatsPerWeek: SYS.weeklyRate({ schedule: SYS.sanitizeSchedule(f.schedule) }),
      unit: resolvedUnit,
      targetAmount: f.targetAmount,
      traits: SYS.Cloud.traitsForEvaluation(M.state),
    }).then((result) => {
      commit(result.pt, result.types || [], result.traitTargets || [], result.priceId);
      ui.lastAiEval = { title: String(f.title || "").trim(), rationale: result.rationale || "" };
      const aimed = (result.traitTargets || []).map((t) => t.trait).filter(Boolean).join(", ");
      M.addToast({
        kind: "info",
        text: (result.rationale
          ? `+${result.pt} xp — ${result.rationale}`
          : `The system valued this at +${result.pt} xp.`) +
          (aimed ? ` → ${aimed}` : ""),
      });
    }).catch((err) => {
      if (!ui.taskForm) return; // form was closed while the call was in flight
      ui.taskForm.busy = false;
      // Admins get the operational cause appended; see describeApiFailure
      // in functions/index.js. Nobody else is sent it.
      const detail = ui.isAdmin && err && err.details && err.details.reason;
      ui.taskForm.error = (aiLimitText(err) || err.message || "The system couldn't evaluate that. Try again.") +
        (detail ? " (" + detail + ")" : "");
      M.renderAppInto();
    });
  };

  ACTIONS["delete-task-from-form"] = function ({ id }) {
    ui.taskForm = null;
    M.runGameAction((draft) => { SYS.removeTask(draft, id); return []; });
  };

  ACTIONS["complete-task"] = function ({ id }) {
    const t = M.state.tasks.find((x) => x.id === id);
    if (t && refuseLocked(t)) return;
    M.runGameAction((draft) => SYS.completeSimpleTask(draft, id));
    maybeOpenReflection(id);
  };

  ACTIONS["reopen-task"] = function ({ id }) {
    M.runGameAction((draft) => SYS.reopenSimpleTask(draft, id));
  };

  ACTIONS["delete-task"] = function ({ id }) {
    M.runGameAction((draft) => { SYS.removeTask(draft, id); return []; });
  };

  ACTIONS["task-step"] = function ({ el, id }) {
    const t = M.state.tasks.find((x) => x.id === id);
    if (!t) return;
    const delta = Number(el.dataset.delta);
    // Only going forward is held back. Taking progress off is always
    // allowed: it gives EXP back, and its hours with it.
    if (delta > 0 && refuseLocked(t)) return;
    const newVal = t.completion + delta;
    M.runGameAction((draft) => SYS.applyTaskProgress(draft, id, newVal));
    maybeOpenReflection(id);
  };

  ACTIONS["set-quit"] = function ({ el }) {
    const f = ui.taskForm;
    if (!f) return;
    f.quit = el.dataset.value === "1";
    M.renderAppInto();
  };

  ACTIONS["toggle-schedule-day"] = function ({ el }) {
    const f = ui.taskForm;
    if (!f || !f.schedule) return;
    f.schedule.days = toggleIn(f.schedule.days, Number(el.dataset.day));
    M.renderAppInto();
  };

  ACTIONS["toggle-schedule-date"] = function ({ el }) {
    const f = ui.taskForm;
    if (!f || !f.schedule) return;
    f.schedule.days = toggleIn(f.schedule.days, Number(el.dataset.date));
    M.renderAppInto();
  };

  ACTIONS["push-enable"] = function () {
    ui.pushState = "busy";
    ui.pushError = null;
    ui.pushTested = false;
    M.renderModalInto();
    SYS.enablePush().then((result) => {
      // "denied" is the one that cannot be undone from here: once a
      // browser has been told no, only its own settings can change that,
      // and pretending otherwise would send someone round in circles.
      ui.pushState = result === "enabled" ? "enabled" : result === "denied" ? "denied" : "off";
      if (result === "failed") ui.pushError = SYS.t("push.failed");
      refreshRemindCount();
      M.renderModalInto();
    });
  };

  ACTIONS["push-disable"] = function () {
    ui.pushState = "busy";
    ui.pushTested = false;
    ui.pushError = null;
    M.renderModalInto();
    SYS.disablePush().then(() => {
      ui.pushState = "off";
      M.renderModalInto();
    });
  };

  ACTIONS["push-test"] = function () {
    if (ui.pushTesting || !SYS.Cloud.callSendTestPush) return;
    ui.pushError = null;
    ui.pushTested = false;
    ui.pushTesting = true;
    M.renderModalInto();
    SYS.Cloud.callSendTestPush()
      .then(() => { ui.pushTesting = false; ui.pushTested = true; M.renderModalInto(); })
      .catch((err) => {
        ui.pushTesting = false;
        ui.pushError = (err && err.message) || SYS.t("push.failed");
        M.renderModalInto();
      });
  };

  ACTIONS["open-library"] = function () {
    if (needsSignIn()) { openSignIn(); return; }
    ui.modal = "library";
    ui.libraryBusy = null;
    ui.libraryError = null;
    M.renderModalInto();
  };

  ACTIONS["close-library"] = function () {
    ui.modal = null; ui.libraryBusy = null; ui.libraryError = null;
    M.renderModalInto();
  };

  ACTIONS["close-library-backdrop"] = function ({ e }) {
    if (e.target.closest("[data-stop-close]")) return;
    ui.modal = null; ui.libraryBusy = null; ui.libraryError = null;
    M.renderModalInto();
  };

  ACTIONS["add-from-library"] = function ({ id }) {
    const preset = SYS.libraryPreset(id);
    if (!preset || ui.libraryBusy) return;
    if (!ui.cloudUser || !SYS.Cloud.callPriceLibraryHabit) {
      ui.libraryError = SYS.t("library.signIn");
      M.renderModalInto();
      return;
    }
    ui.libraryBusy = id;
    ui.libraryError = null;
    M.renderModalInto();
    // The client sends the id and the schedule and is told what the habit
    // is worth. It never proposes a number: an EXP entry is checked
    // against a price the server issued, so a price made up here would
    // buy nothing but an unverifiable task.
    SYS.Cloud.callPriceLibraryHabit({ presetId: id, schedule: preset.schedule })
      .then((res) => {
        const title = SYS.t("preset." + id);
        M.runGameAction((draft) => {
          SYS.addTask(draft, {
            title,
            priority: "Medium",
            taskType: "Recurring",
            types: res.types || [],
            pt: res.pt,
            mode: "simple",
            notes: "",
            recurring: true,
            schedule: res.schedule || preset.schedule,
            unit: res.unit || preset.unit,
            targetAmount: res.targetAmount || preset.targetAmount,
            traitTargets: res.traitTargets || [],
            priceId: res.priceId,
            fromLibrary: id,
            icon: preset.emoji,
          });
          return [{ kind: "info", text: SYS.t("library.added", { title }) }];
        });
        ui.libraryBusy = null;
        M.renderModalInto();
      })
      .catch((err) => {
        ui.libraryBusy = null;
        ui.libraryError = aiLimitText(err) || (err && err.message) || SYS.t("library.failed");
        M.renderModalInto();
      });
  };

  ACTIONS["close-amount"] = function () {
    closeLogSheet();
  };

  ACTIONS["close-amount-backdrop"] = function ({ e }) {
    if (e.target.closest("[data-stop-close]")) return;
    closeLogSheet();
  };

  ACTIONS["toggle-note"] = function () {
    ui.noteOpen = !ui.noteOpen;
    M.renderModalInto();
    // Straight into the field: the toggle was the decision to write.
    if (ui.noteOpen) {
      const box = document.querySelector(".note-input");
      if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
    }
  };

  ACTIONS["commit-amount"] = function ({ id }) {
    const task = M.state.tasks.find((x) => x.id === id);
    if (!task) return;
    const value = Number(ui.amountValue);
    if (!Number.isFinite(value) || value === 0) return;
    const unit = SYS.unitFamily(task.unit).includes(ui.amountUnit) ? ui.amountUnit : task.unit;
    if (value > 0 && refuseOldDay(logDay())) return;
    M.runGameAction((draft) => SYS.addHabitAmount(draft, id, logDay(), value, unit));
    // The sheet stays up so a second helping is one press away, which is
    // the whole point of a keypad over a one-shot box.
    resetAmount();
    M.renderModalInto();
  };

  ACTIONS["fill-day"] = function ({ id }) {
    if (refuseOldDay(logDay())) return;
    M.runGameAction((draft) => SYS.logHabitDay(draft, id, logDay()));
    closeLogSheet();
  };

  // One control for both directions: an empty day fills in, a filled one
  // clears. The day is passed explicitly so yesterday can be corrected
  // without pretending it is today.
  ACTIONS["toggle-habit-day"] = function ({ el, id }) {
    const day = el.dataset.day;
    const task = M.state.tasks.find((x) => x.id === id);
    if (!task || !day) return;
    if (!SYS.habitDoneOn(task, day) && refuseOldDay(day)) return;
    M.runGameAction((draft) => SYS.habitDoneOn(draft.tasks.find((x) => x.id === id), day)
      ? SYS.unlogHabitDay(draft, id, day)
      : SYS.logHabitDay(draft, id, day));
  };

  // Moving the page to another day. The week offset and the chosen day
  // are kept apart on purpose: the arrows move the window, picking a cell
  // moves the day, and neither silently does the other's job.
  ACTIONS["pick-day"] = function ({ el }) {
    const day = el.dataset.day;
    if (!day) return;
    // Choosing today clears the override rather than storing today's
    // key, so the page keeps following the clock past midnight.
    ui.habitDay = day === SYS.todayKey() ? null : day;
    M.renderAppInto();
  };

  ACTIONS["open-timer"] = function ({ id }) {
    stopTimerTick();
    ui.timerOpenedFor = id;
    if (!ui.timer || (ui.timer.taskId !== id && !timerHasTime())) {
      ui.timer = {
        taskId: id,
        running: false,
        startedAt: null,
        accumulatedMs: 0,
        loggedMs: 0,
        mode: (M.state.settings || {}).timerMode === "countdown" ? "countdown" : "stopwatch",
      };
      saveTimer();
    }
    ui.timerPanel = null;
    ui.modal = "timer";
    M.renderModalInto();
  };

  ACTIONS["close-timer"] = function () {
    if (!(ui.timer && ui.timer.running) && SYS.stopFocusSound) SYS.stopFocusSound();
    // The session survives the panel either way: running stays running,
    // because a countdown you have to keep watching is not a countdown,
    // and a paused one keeps its minutes rather than losing them to a
    // dismissed panel.
    flushTimer();
    ui.modal = null;
    ui.timerPanel = null;
    M.renderModalInto();
  };

  ACTIONS["pick-style"] = function ({ el }) {
    M.runGameAction((draft) => { draft.settings.timerStyle = el.dataset.style; return []; });
    M.renderModalInto();
  };

  ACTIONS["pick-sound"] = function ({ el }) {
    const kind = el.dataset.kind === "end" ? "end" : "focus";
    const name = el.dataset.name;
    M.runGameAction((draft) => {
      if (kind === "end") draft.settings.endSound = name;
      else draft.settings.focusSound = name;
      return [];
    });
    const running = !!(ui.timer && ui.timer.running);
    if (kind === "end") {
      if (SYS.previewSound) SYS.previewSound("end", name);
    } else if (SYS.currentFocusSound && SYS.currentFocusSound() === name && !running) {
      // Already sounding, and nothing depends on it: a second press is
      // how you stop listening.
      if (SYS.stopFocusSound) SYS.stopFocusSound();
    } else if (running) {
      // Mid-session it swaps and keeps playing.
      if (SYS.startFocusSound) SYS.startFocusSound(name);
    } else if (SYS.previewSound) {
      // Plays until it is stopped. A list of words for sounds tells you
      // nothing, and two seconds of a texture tells you barely more.
      SYS.previewSound("focus", name);
    }
    M.renderModalInto();
  };

  ACTIONS["close-timer-backdrop"] = function ({ e }) {
    if (e.target.closest("[data-stop-close]")) return;
    // An audition is for choosing; it has no business outliving the panel.
    // A running session's sound is left alone.
    if (!(ui.timer && ui.timer.running) && SYS.stopFocusSound) SYS.stopFocusSound();

    stopTimerTick();
    if (ui.timer && ui.timer.running) {
      ui.timer.accumulatedMs += Date.now() - ui.timer.startedAt;
      ui.timer.running = false;
      ui.timer.startedAt = null;
    }
    saveTimer();
    ui.modal = null;
    M.renderModalInto();
  };

  ACTIONS["dismiss-rankup"] = function () {
    dismissRankup();
  };

  ACTIONS["nav"] = function ({ el }) {
    ui.page = el.dataset.page;
    M.renderSidebarInto();
    M.renderPageInto();
    if (ui.page === "admin") { refreshAdminAppealQueue(); refreshAdminStats(); }
    if (ui.page === "quests" || ui.page === "habits" || ui.page === "overview") refreshUnlocks();
    if (ui.page === "quests" || ui.page === "overview") refreshReflections();
    if (ui.page === "leaderboard") refreshLeaderboard();
    if (ui.page === "planner") M.maybeAskCarry();
    if (ui.page === "friends") { refreshFriendRows(); refreshBlockedList(); refreshRaceScores(); }
    if (ui.page === "mail") { refreshFriendRows(); refreshMyAppeals(); M.refreshMyFeedback(); }
    if (ui.page === "quests" && !ui.suggestions) refreshSuggestions();
    // The EXP-by-month list at the foot of the Stats page comes from the
    // server's journal, not from local state, so opening the page is the
    // moment to go and get it rather than wait for the next sync.
    if (ui.page === "stats" && !ui.expMonths) reconcileExpWithServer();
  };

  ACTIONS["refresh-leaderboard"] = function () {
    refreshLeaderboard();
  };

  ACTIONS["accept-suggestion"] = function ({ el }) {
    const id = el.dataset.id;
    const s = ((ui.suggestions && ui.suggestions.items) || []).find((x) => x.id === id);
    if (!s) return;
    // No evaluation call: the value came with the suggestion, recorded
    // server-side when it was drawn up, so a journal entry against it
    // verifies exactly like one from a task the person wrote themselves.
    M.runGameAction((draft) => {
      SYS.addTask(draft, {
        title: s.title,
        priority: "Medium",
        taskType: s.kind === "habit" ? "Recurring" : "Medium Term",
        types: s.types || [],
        pt: s.pt,
        mode: "simple",
        notes: s.description || "",
        recurring: s.kind === "habit",
        schedule: Object.assign(blankSchedule(), scheduleFromWeeklyCount(s.repeatsPerWeek)),
        unit: s.unit || "reps",
        targetAmount: s.targetAmount || 1,
        traitTargets: s.traitTargets || [],
        priceId: s.priceId,
      });
      return [];
    });
    markSuggestionHandled(id);
    M.addToast({ kind: "info", text: SYS.t("suggest.accepted", { title: s.title }) });
  };

  ACTIONS["dismiss-suggestion"] = function ({ el }) {
    markSuggestionHandled(el.dataset.id);
  };

  ACTIONS["reload-app"] = function () {
    location.reload();
  };

  // Also fires when the body of a notification is clicked — see
  // renderNotifStack. Somebody who has finished reading should be able to
  // clear it rather than wait out a timer sized for someone slower.
  ACTIONS["tour-start"] = function ({ el }) {
    ui.modal = null; ui.helpTopic = null;
    M.renderModalInto();
    if (el.dataset.topic && el.dataset.topic !== ui.page) {
      ui.page = el.dataset.topic;
      M.renderSidebarInto();
      M.renderPageInto();
    }
    SYS.startTour(el.dataset.topic);
  };

  ACTIONS["open-ranks"] = function () {
    ui.modal = "ranks";
    M.renderModalInto();
  };

  ACTIONS["open-guide"] = function ({ el }) {
    ui.modal = "guide";
    ui.guideChapter = el.dataset.chapter || null;
    M.renderModalInto();
  };

  ACTIONS["help"] = function ({ el }) {
    ui.modal = "help";
    ui.helpTopic = el.dataset.topic || null;
    M.renderModalInto();
  };

  ACTIONS["dismiss-toast"] = function ({ el }) {
    dismissToast(Number(el.dataset.id));
  };

  ACTIONS["set-quest-filter"] = function ({ el }) {
    ui.questFilter = el.dataset.filter;
    M.renderPageInto();
  };

  // Which habit the whole Stats page is answering about. An empty id is
  // "All" — stored as null rather than "" so nothing can mistake it for
  // a habit whose id happens to be falsy.
  // Tapping a day in the calendar opens what happened on it. Always all
  // habits, whatever the page is scoped to: the question a day asks is
  // "what did I do", and narrowing that to one habit would make it a
  // worse answer than the calendar already gives.
  ACTIONS["set-compare-span"] = function ({ el }) {
    if (!["week", "month", "year"].includes(el.dataset.span)) return;
    ui.compareSpan = el.dataset.span;
    M.renderPageInto();
  };

  ACTIONS["toggle-compare-table"] = function () {
    ui.compareTable = !ui.compareTable;
    M.renderPageInto();
  };

  ACTIONS["open-time-sheet"] = function ({ el }) {
    if (!ui.taskForm) return;
    openTimeSheet(el.dataset.slot || "new");
  };

  ACTIONS["remove-reminder"] = function ({ el }) {
    if (!ui.taskForm) return;
    const list = (ui.taskForm.reminders || []).slice();
    list.splice(Number(el.dataset.slot), 1);
    ui.taskForm.reminders = SYS.sanitizeReminders(list);
    M.renderAppInto();
  };

  ACTIONS["confirm-time"] = function () {
    const d = ui.timeDraft;
    if (ui.timeFor && ui.eventForm && d) {
      const f = ui.eventForm;
      const hhmm = String(d.h).padStart(2, "0") + ":" + String(d.m).padStart(2, "0");
      // Each time is set on its own; the end does not follow the start.
      // A start moved past the end makes a night, and the form says so.
      if (ui.timeFor === "from") f.from = hhmm;
      else f.to = hhmm;
      f.error = null;
      closeTimeSheet();
      return;
    }
    if (ui.taskForm && d) {
      const hhmm = String(d.h).padStart(2, "0") + ":" + String(d.m).padStart(2, "0");
      const list = (ui.taskForm.reminders || []).slice();
      const slot = ui.timeSlot;
      if (slot == null || slot === "new" || !(Number(slot) < list.length)) list.push(hhmm);
      else list[Number(slot)] = hhmm;
      // Sorted and deduplicated: a time added twice is one reminder.
      ui.taskForm.reminders = SYS.sanitizeReminders(list);
    }
    closeTimeSheet();
    M.renderAppInto();
  };

  ACTIONS["close-time"] = function () {
    closeTimeSheet();
  };

  ACTIONS["close-time-backdrop"] = function ({ e }) {
    if (e.target.closest("[data-stop-close]")) return;
    closeTimeSheet();
  };

  ACTIONS["close-day"] = function () {
    ui.modal = null; ui.dayKey = null;
    M.renderModalInto();
  };

  ACTIONS["close-day-backdrop"] = function ({ e }) {
    if (e.target.closest("[data-stop-close]")) return;
    ui.modal = null; ui.dayKey = null;
    M.renderModalInto();
  };

  ACTIONS["shift-day-sheet"] = function ({ el }) {
    const delta = Number(el.dataset.delta);
    if (!Number.isFinite(delta)) return;
    const next = SYS.shiftDay(ui.dayKey || SYS.todayKey(), delta);
    // Forwards stops at today, which is also where the arrow greys out.
    if (next > SYS.todayKey()) return;
    ui.dayKey = next;
    M.renderModalInto();
  };


})(window.SYS = window.SYS || {});

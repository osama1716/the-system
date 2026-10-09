// Click handlers: the admin page.
// One of the files main.js was split into; the names they share travel through SYS._main.
(function (SYS) {
  "use strict";
  const M = SYS._main || (SYS._main = {});
  const { ACTIONS, openProfile, refreshAdminAppealQueue, refreshAdminReflectionQueue, refreshAdminStats, refreshAdminSuspicionQueue, ui } = M;

  ACTIONS["admin-open-profile"] = function ({ el }) {
    openProfile(el.dataset.uid);
  };

  ACTIONS["admin-ai-report-close"] = function ({ el }) {
    const rid = el.dataset.id;
    if (!rid || ui.adminAiReportBusy) return;
    ui.adminAiReportBusy = true;
    M.renderPageInto();
    SYS.Cloud.callCloseAiReport(rid).then(() => {
      ui.adminAiReports = ui.adminAiReports.filter((x) => x.id !== rid);
    }).catch((err) => {
      M.addToast({ kind: "info", text: (err && err.message) || "That didn't work." });
    }).then(() => {
      ui.adminAiReportBusy = false;
      M.refreshAdminAiReports();
      if (ui.page === "admin") M.renderPageInto();
    });
  };

  ACTIONS["admin-feedback-shot"] = function ({ el }) {
    const id = el.dataset.id;
    if (!id) return;
    SYS.Cloud.fetchFeedbackShot(id).then((data) => {
      if (!data) return;
      ui.adminFeedbackShots[id] = data;
      if (ui.page === "admin") M.renderPageInto();
    }).catch(() => {});
  };

  ACTIONS["admin-feedback-answer"] = function ({ el }) {
    const id = el.dataset.id;
    if (!id || ui.adminFeedbackBusy) return;
    const reply = el.dataset.reply === "1" ? String(ui.adminFeedbackReply[id] || "").trim() : "";
    if (el.dataset.reply === "1" && !reply) { M.addToast({ kind: "info", text: SYS.t("feedback.errReply") }); return; }
    ui.adminFeedbackBusy = true;
    M.renderPageInto();
    SYS.Cloud.callAnswerFeedback(id, reply).then(() => {
      delete ui.adminFeedbackReply[id];
      delete ui.adminFeedbackShots[id];
      ui.adminFeedback = ui.adminFeedback.filter((m) => m.id !== id);
      M.addToast({ kind: "info", text: SYS.t(reply ? "feedback.replySent" : "feedback.closed") });
    }).catch((err) => {
      M.addToast({ kind: "info", text: (err && err.message) || "That didn't work." });
    }).then(() => {
      ui.adminFeedbackBusy = false;
      M.refreshAdminFeedback();
      if (ui.page === "admin") M.renderPageInto();
    });
  };

  ACTIONS["admin-report"] = function ({ el }) {
    if (ui.adminReportBusy) return;
    ui.adminReportBusy = true;
    M.renderPageInto();
    SYS.Cloud.callReviewReport(el.dataset.id, el.dataset.act).then(() => {
      M.addToast({ kind: "info", text: SYS.t("admin.reportDone") });
    }).catch((err) => {
      M.addToast({ kind: "info", text: (err && err.message) || "That didn't work." });
    }).then(() => {
      ui.adminReportBusy = false;
      M.refreshAdminReports();
    });
  };

  ACTIONS["admin-set-cap"] = function () {
    const raw = ui.adminCapDraft != null && String(ui.adminCapDraft).trim() !== "" ? ui.adminCapDraft
      : (ui.adminStats && ui.adminStats.ai ? ui.adminStats.ai.cap : null);
    const n = raw == null ? NaN : Number(raw);
    if (!Number.isInteger(n) || n < 0) { ui.adminCapError = SYS.t("admin.capInvalid"); M.renderPageInto(); return; }
    ui.adminCapBusy = true; ui.adminCapError = null; M.renderPageInto();
    SYS.Cloud.callSetAiCap(n).then((res) => {
      if (ui.adminStats && ui.adminStats.ai) ui.adminStats.ai.cap = res.cap;
      ui.adminCapDraft = null;
      M.addToast({ kind: "info", text: SYS.t("admin.capSaved", { n: res.cap }) });
    }).catch((err) => { ui.adminCapError = (err && err.message) || "failed"; })
      .then(() => { ui.adminCapBusy = false; M.renderPageInto(); });
  };

  ACTIONS["admin-billing"] = function ({ el }) {
    const field = el.dataset.field;
    const draftKey = { balance: "adminBalDraft", topup: "adminTopDraft", limit: "adminLimDraft" }[field];
    const dollars = Number(String(ui[draftKey] == null ? "" : ui[draftKey]).replace(",", "."));
    if (!draftKey || !(dollars >= 0) || String(ui[draftKey] == null ? "" : ui[draftKey]).trim() === "") {
      ui.adminBillError = SYS.t("admin.billInvalid"); M.renderPageInto(); return;
    }
    const cents = Math.round(dollars * 100);
    const body = field === "balance" ? { balanceCents: cents } : field === "topup" ? { topUpCents: cents } : { monthlyLimitCents: cents };
    ui.adminBillBusy = field; ui.adminBillError = null; M.renderPageInto();
    SYS.Cloud.callSetBilling(body).then(() => {
      ui[draftKey] = null;
      M.addToast({ kind: "info", text: SYS.t("admin.billSaved") });
      refreshAdminStats();
    }).catch((err) => { ui.adminBillError = (err && err.message) || "failed"; })
      .then(() => { ui.adminBillBusy = null; M.renderPageInto(); });
  };

  ACTIONS["admin-tab"] = function ({ el }) {
    ui.adminTab = el.dataset.tab || "appeals";
    M.renderPageInto();
  };

  ACTIONS["admin-refresh"] = function () {
    refreshAdminAppealQueue();
    refreshAdminStats();
  };

  ACTIONS["admin-search"] = function () {
    const query = (ui.adminSearchEmail || "").trim();
    ui.adminSearchError = null; ui.adminResult = null;
    if (!query) { ui.adminSearchError = SYS.t("admin.enterQuery"); M.renderPageInto(); return; }
    ui.adminBusy = true;
    M.renderPageInto();
    // Resolves a display name or an email — the function works out which.
    SYS.Cloud.callLookupUser(query).then((found) =>
      Promise.all([
        SYS.Cloud.fetchUserState(found.uid),
        SYS.Cloud.callGetAdminStatus(found.uid),
      ]).then(([data, status]) => {
        ui.adminBusy = false;
        ui.adminResult = {
          uid: found.uid, email: found.email, name: found.name,
          state: data ? data.state : null,
          isTargetAdmin: status.admin,
          // What their standing rests on: a price the evaluator issued, or
          // their own word. See recordExpEvent in functions/index.js.
          expTotal: status.expTotal, expUnverified: status.expUnverified,
        };
        M.renderPageInto();
      })
    ).catch((err) => {
      ui.adminBusy = false;
      ui.adminSearchError = err.message || SYS.t("admin.notFound");
      M.renderPageInto();
    });
  };

  ACTIONS["admin-grant-admin"] = function ({ el, action }) {
    const email = el.dataset.email;
    const makeAdmin = action === "admin-grant-admin";
    ui.adminBusy = true;
    M.renderPageInto();
    SYS.Cloud.callSetAdmin(email, makeAdmin).then(() => {
      ui.adminBusy = false;
      if (ui.adminResult && ui.adminResult.email === email) ui.adminResult.isTargetAdmin = makeAdmin;
      M.addToast({ kind: "info", text: `${email} ${makeAdmin ? "is now" : "is no longer"} an admin.` });
      M.renderPageInto();
    }).catch((err) => {
      ui.adminBusy = false;
      ui.adminSearchError = err.message || "That didn't work.";
      M.renderPageInto();
    });
  };

  ACTIONS["admin-revoke-admin"] = function ({ el, action }) {
    const email = el.dataset.email;
    const makeAdmin = action === "admin-grant-admin";
    ui.adminBusy = true;
    M.renderPageInto();
    SYS.Cloud.callSetAdmin(email, makeAdmin).then(() => {
      ui.adminBusy = false;
      if (ui.adminResult && ui.adminResult.email === email) ui.adminResult.isTargetAdmin = makeAdmin;
      M.addToast({ kind: "info", text: `${email} ${makeAdmin ? "is now" : "is no longer"} an admin.` });
      M.renderPageInto();
    }).catch((err) => {
      ui.adminBusy = false;
      ui.adminSearchError = err.message || "That didn't work.";
      M.renderPageInto();
    });
  };

  ACTIONS["admin-backfill-usernames"] = function () {
    ui.adminBusy = true; ui.adminSearchError = null;
    M.renderPageInto();
    SYS.Cloud.callBackfillUsernames().then((res) => {
      ui.adminBusy = false;
      const conflictNote = res.conflicts.length
        ? " " + res.conflicts.map((c) => (c.email || c.uid) + " (" + c.name + ")").join(", ") + " still need to choose a different name."
        : "";
      M.addToast({ kind: "info", text: `Reserved ${res.claimed} name(s); ${res.alreadyHeld} already held.${conflictNote}` });
      M.renderPageInto();
    }).catch((err) => {
      ui.adminBusy = false;
      ui.adminSearchError = err.message || "Sync failed.";
      M.renderPageInto();
    });
  };

  ACTIONS["admin-backfill-baselines"] = function () {
    ui.adminBusy = true; ui.adminSearchError = null;
    M.renderPageInto();
    SYS.Cloud.callBackfillExpBaselines().then((res) => {
      ui.adminBusy = false;
      // Worth saying out loud when it converts nothing: "already done" and
      // "nothing to do" look the same from a count of zero, and one of them
      // means the button did not work.
      const note = res.converted
        ? `Converted ${res.converted} baseline(s).`
        : `Nothing to convert — ${res.alreadyDone} already on the current scale, ${res.noBaseline} with no baseline yet.`;
      M.addToast({ kind: "info", text: note + " Run “Sync leaderboard” next so the public rows are recomputed." });
      M.renderPageInto();
    }).catch((err) => {
      ui.adminBusy = false;
      ui.adminSearchError = err.message || "Conversion failed.";
      M.renderPageInto();
    });
  };

  ACTIONS["admin-backfill-leaderboard"] = function () {
    ui.adminBusy = true; ui.adminSearchError = null;
    M.renderPageInto();
    SYS.Cloud.callBackfillLeaderboard().then((res) => {
      ui.adminBusy = false;
      const missing = res.skippedNoName
        ? ` ${res.skippedNoName} account(s) have no reserved name, so they stay off the board — run “Reserve existing names” first, then this again.`
        : "";
      M.addToast({ kind: "info", text: `Leaderboard synced — ${res.written} row(s) written.${missing}` });
      M.renderPageInto();
    }).catch((err) => {
      ui.adminBusy = false;
      ui.adminSearchError = err.message || "Sync failed.";
      M.renderPageInto();
    });
  };

  ACTIONS["admin-backfill-directory"] = function () {
    ui.adminBusy = true; ui.adminSearchError = null;
    M.renderPageInto();
    SYS.Cloud.callBackfillUserDirectory().then((res) => {
      ui.adminBusy = false;
      M.addToast({ kind: "info", text: `Directory synced — ${res.usersProcessed} account(s) checked.` });
      M.renderPageInto();
    }).catch((err) => {
      ui.adminBusy = false;
      ui.adminSearchError = err.message || "Sync failed.";
      M.renderPageInto();
    });
  };

  ACTIONS["admin-refresh-appeals"] = function () {
    refreshAdminAppealQueue();
  };

  ACTIONS["admin-resolve-appeal"] = function ({ el }) {
    const appealId = el.dataset.id;
    const points = Number(ui.adminAppealPoints[appealId]);
    if (!Number.isFinite(points) || points < 1) {
      ui.adminAppealError = SYS.t("admin.needValue");
      M.renderPageInto();
      return;
    }
    ui.adminAppealBusy = true; ui.adminAppealError = null;
    M.renderPageInto();
    SYS.Cloud.callResolveAppeal(appealId, points).then(() => {
      ui.adminAppealBusy = false;
      M.addToast({ kind: "info", text: `Value corrected to ${points} xp.` });
      refreshAdminAppealQueue();
    }).catch((err) => {
      ui.adminAppealBusy = false;
      ui.adminAppealError = err.message || "That didn't work.";
      M.renderPageInto();
    });
  };

  ACTIONS["admin-restore-account"] = function ({ el, action }) {
    const targetUid = el.dataset.uid;
    const restore = action === "admin-restore-account";
    ui.adminFlaggedBusy = true;
    M.renderPageInto();
    SYS.Cloud.callReviewSuspicion(targetUid, restore).then(() => {
      ui.adminFlaggedBusy = false;
      M.addToast({ kind: "info", text: (restore ? SYS.t("admin.restoreAccount") : SYS.t("admin.keepHidden")) + " ✓" });
      refreshAdminSuspicionQueue();
    }).catch((err) => {
      ui.adminFlaggedBusy = false;
      M.addToast({ kind: "info", text: (err && err.message) || "That didn't work." });
      M.renderPageInto();
    });
  };

  ACTIONS["admin-keep-hidden"] = function ({ el, action }) {
    const targetUid = el.dataset.uid;
    const restore = action === "admin-restore-account";
    ui.adminFlaggedBusy = true;
    M.renderPageInto();
    SYS.Cloud.callReviewSuspicion(targetUid, restore).then(() => {
      ui.adminFlaggedBusy = false;
      M.addToast({ kind: "info", text: (restore ? SYS.t("admin.restoreAccount") : SYS.t("admin.keepHidden")) + " ✓" });
      refreshAdminSuspicionQueue();
    }).catch((err) => {
      ui.adminFlaggedBusy = false;
      M.addToast({ kind: "info", text: (err && err.message) || "That didn't work." });
      M.renderPageInto();
    });
  };

  ACTIONS["admin-accept-reflection"] = function ({ el, action }) {
    const rid = el.dataset.id;
    const accept = action === "admin-accept-reflection";
    ui.adminReflectionBusy = true;
    M.renderPageInto();
    SYS.Cloud.callReviewReflection(rid, accept).then(() => {
      ui.adminReflectionBusy = false;
      M.addToast({ kind: "info", text: (accept ? SYS.t("admin.reflectAccept") : SYS.t("admin.reflectReject")) + " ✓" });
      refreshAdminReflectionQueue();
    }).catch((err) => {
      ui.adminReflectionBusy = false;
      M.addToast({ kind: "info", text: (err && err.message) || "That didn't work." });
      M.renderPageInto();
    });
  };

  ACTIONS["admin-reject-reflection"] = function ({ el, action }) {
    const rid = el.dataset.id;
    const accept = action === "admin-accept-reflection";
    ui.adminReflectionBusy = true;
    M.renderPageInto();
    SYS.Cloud.callReviewReflection(rid, accept).then(() => {
      ui.adminReflectionBusy = false;
      M.addToast({ kind: "info", text: (accept ? SYS.t("admin.reflectAccept") : SYS.t("admin.reflectReject")) + " ✓" });
      refreshAdminReflectionQueue();
    }).catch((err) => {
      ui.adminReflectionBusy = false;
      M.addToast({ kind: "info", text: (err && err.message) || "That didn't work." });
      M.renderPageInto();
    });
  };

  ACTIONS["admin-reject-appeal"] = function ({ el }) {
    const appealId = el.dataset.id;
    ui.adminAppealBusy = true; ui.adminAppealError = null;
    M.renderPageInto();
    SYS.Cloud.callRejectAppeal(appealId).then(() => {
      ui.adminAppealBusy = false;
      M.addToast({ kind: "info", text: "Appeal rejected — value stands." });
      refreshAdminAppealQueue();
    }).catch((err) => {
      ui.adminAppealBusy = false;
      ui.adminAppealError = err.message || "That didn't work.";
      M.renderPageInto();
    });
  };

  ACTIONS["admin-export-appeals"] = function () {
    if (ui.adminExportBusy || !SYS.Cloud.callExportAppealsForEval) return;
    ui.adminExportBusy = true; ui.adminExportNote = null; ui.adminAppealError = null;
    M.renderPageInto();
    SYS.Cloud.callExportAppealsForEval().then((res) => {
      ui.adminExportBusy = false;
      ui.adminExportNote = SYS.t("admin.exportDone", { n: (res && res.count) || 0 });
      M.renderPageInto();
    }).catch((err) => {
      ui.adminExportBusy = false;
      ui.adminAppealError = (err && err.message) || "That didn't work.";
      M.renderPageInto();
    });
  };

  ACTIONS["admin-send-adjustment"] = function () {
    const r = ui.adminResult;
    if (!r) return;
    const text = (ui.adminMsgText || "").trim();
    const amountRaw = (ui.adminMsgAmount || "").trim();
    const amount = amountRaw === "" ? 0 : Number(amountRaw);
    if (!text) { ui.adminMsgError = SYS.t("admin.needMessage"); M.renderPageInto(); return; }
    if (amountRaw !== "" && !Number.isFinite(amount)) { ui.adminMsgError = "Amount must be a number."; M.renderPageInto(); return; }
    ui.adminMsgBusy = true; ui.adminMsgError = null;
    M.renderPageInto();
    SYS.Cloud.callApplyAdjustment(r.uid, text, amount).then(() => {
      ui.adminMsgBusy = false;
      ui.adminMsgText = ""; ui.adminMsgAmount = "";
      M.addToast({ kind: "info", text: amount ? `Sent, with a ${amount > 0 ? "+" : ""}${amount} EXP adjustment.` : "Message sent." });
      M.renderPageInto();
    }).catch((err) => {
      ui.adminMsgBusy = false;
      ui.adminMsgError = err.message || "Couldn't send that.";
      M.renderPageInto();
    });
  };


})(window.SYS = window.SYS || {});

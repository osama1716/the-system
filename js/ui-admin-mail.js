// UI: AI reports, feedback, the admin page, mail, and the page switch.
// One of the files ui.js was split into; the names they share travel through SYS._ui.
(function (SYS) {
  "use strict";
  const U = SYS._ui || (SYS._ui = {});
  const { dateLocale, escapeHtml, friendName, helpMark, icon, metricLabel, otherOf, pageIcon, renderFriendsPage, renderHabitsPage, renderIntelligencePage, renderLeaderboardPage, renderLogPage, renderOverviewPage, renderPageHead, renderPlannerPage, renderQuestsPage, renderStatsPage, t } = U;

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
      ${renderPageHead("admin")}
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
      ${renderAdminStats(ui)}
      <div class="sys-panel panel-pad">
        <div class="field-label">${t("admin.nameOrEmail")}</div>
        <div class="field-row" style="align-items:flex-start;">
          <input class="field-input" type="text" placeholder="${t("admin.searchPlaceholder")}" data-bind="adminSearchEmail" value="${escapeHtml(ui.adminSearchEmail)}" />
          <button class="btn btn-primary" data-action="admin-search" style="flex-shrink:0;" ${ui.adminBusy ? "disabled" : ""}>${ui.adminBusy ? t("admin.searching") : t("admin.search")}</button>
        </div>
        ${ui.adminSearchError ? `<div class="toast-error" style="margin-top:8px;">${escapeHtml(ui.adminSearchError)}</div>` : ""}
        <div class="form-hint" style="margin-top:10px;">
          ${t("admin.syncDirHint")}
          <div class="admin-tool-links">
            <button class="link-btn" data-action="admin-backfill-directory" ${ui.adminBusy ? "disabled" : ""}>${t("admin.syncDir")}</button>
            <button class="link-btn" data-action="admin-backfill-usernames" ${ui.adminBusy ? "disabled" : ""}>${t("admin.syncNames")}</button>
            <button class="link-btn" data-action="admin-backfill-leaderboard" ${ui.adminBusy ? "disabled" : ""}>${t("admin.syncBoard")}</button>
            <button class="link-btn" data-action="admin-backfill-baselines" ${ui.adminBusy ? "disabled" : ""}>${t("admin.convertBaselines")}</button>
          </div>
        </div>
      </div>
      ${resultBlock}
      <div class="planner-tabs admin-tabs">${tabs}</div>
      ${(queues.find((q) => q.key === tab) || queues[0]).render()}`;
  }
  SYS.renderAdminPage = renderAdminPage;

  // What Claude has cost this app this month (its own ledger), the monthly
  // limit and balance the admin last entered from Anthropic's Console, and a
  // way straight to the Console to top up.
  const CONSOLE_BILLING_URL = "https://platform.claude.com/settings/billing";
  function renderAdminBilling(ui, b) {
    if (!b) return "";
    const usd = (cents) => "$" + (cents / 100).toFixed(2);
    const month = b.monthMicros / 10000; // in cents
    const limit = b.monthlyLimitCents;
    const share = limit ? Math.min(100, (month / limit) * 100) : 0;
    const warnLimit = limit && share >= 80;
    const warnBalance = b.balanceCents != null && b.balanceCents < 200;
    const row = (field, draftKey, label, placeholder) => `
      <div class="admin-bill-row">
        <label class="field-label" for="bill-${field}">${label}</label>
        <div class="field-row" style="align-items:center;">
          <input id="bill-${field}" class="field-input" type="number" min="0" step="0.01" inputmode="decimal" placeholder="${placeholder}"
            data-bind="${draftKey}" value="${escapeHtml(ui[draftKey] == null ? "" : ui[draftKey])}" />
          <button class="btn btn-outline" data-action="admin-billing" data-field="${field}" style="flex:0 0 auto;" ${ui.adminBillBusy ? "disabled" : ""}>${t(ui.adminBillBusy === field ? "admin.sending" : "admin.capSave")}</button>
        </div>
      </div>`;
    return `
      <div class="admin-bill">
        <div class="admin-bill-head">
          <div class="tile-group-head" style="margin:0;">${t("admin.billTitle")}</div>
          <a class="btn btn-primary" href="${CONSOLE_BILLING_URL}" target="_blank" rel="noopener noreferrer">${t("admin.billTopUpLink")}</a>
        </div>
        <div class="stat-tiles admin-stat-tiles">
          <div class="stat-tile"><div class="stat-num">${usd(month)}</div><div class="stat-label">${t("admin.billMonth")}</div><div class="admin-stat-sub">${t("admin.billCalls", { n: b.monthCalls })}</div></div>
          <div class="stat-tile ${warnLimit ? "admin-warn" : ""}"><div class="stat-num">${limit != null ? usd(limit) : "—"}</div><div class="stat-label">${t("admin.billLimit")}</div>${limit ? `<div class="admin-bill-track"><span style="width:${share.toFixed(1)}%"></span></div>` : ""}</div>
          <div class="stat-tile ${warnBalance ? "admin-warn" : ""}"><div class="stat-num">${b.balanceCents != null ? usd(b.balanceCents) : "—"}</div><div class="stat-label">${t("admin.billBalance")}</div>${b.lastTopUpCents != null ? `<div class="admin-stat-sub">${t("admin.billLastTopUp", { n: usd(b.lastTopUpCents) })}</div>` : ""}</div>
        </div>
        <div class="admin-bill-forms">
          ${row("topup", "adminTopDraft", t("admin.billAddTopUp"), "20.00")}
          ${row("balance", "adminBalDraft", t("admin.billSetBalance"), "1.94")}
          ${row("limit", "adminLimDraft", t("admin.billSetLimit"), "10.00")}
        </div>
        ${ui.adminBillError ? `<div class="toast-error" style="margin-top:8px;">${escapeHtml(ui.adminBillError)}</div>` : ""}
        <div class="form-hint">${t("admin.billNote")}</div>
      </div>`;
  }

  // The numbers that say whether people stay: signups, who is active, who
  // came back the next day and in their second week, how far they got with
  // the opening assessment, streaks, and today's AI against its cap.
  function renderAdminStats(ui) {
    const s = ui.adminStats;
    if (!s) {
      return `<div class="sys-panel panel-pad admin-stats"><div class="empty-note">${ui.adminStatsError
        ? escapeHtml(ui.adminStatsError) : t("admin.statsLoading")}</div></div>`;
    }
    const pct = (k, n) => (n ? Math.round((k / n) * 100) + "%" : "—");
    const tile = (num, label, sub) => `
      <div class="stat-tile"><div class="stat-num">${escapeHtml(num)}</div><div class="stat-label">${label}</div>${sub ? `<div class="admin-stat-sub">${sub}</div>` : ""}</div>`;
    const bars = (rows, max) => `
      <div class="admin-bars">${rows.map((r) => `
        <div class="admin-bar" title="${escapeHtml(r.day)}: ${r.n}">
          <span class="admin-bar-fill" style="height:${max ? Math.max(4, Math.round((r.n / max) * 100)) : 4}%"></span>
          <span class="admin-bar-n">${r.n || ""}</span>
        </div>`).join("")}</div>`;
    const sMax = Math.max(1, ...s.signups.map((r) => r.n));
    const visits = s.visits || [];
    const vMax = Math.max(1, ...visits.map((r) => r.n));
    // "5 minutes ago", in the app's language, from the browser's own words.
    const ago = (ms) => {
      const sec = Math.round((ms - Date.now()) / 1000);
      const units = [["day", 86400], ["hour", 3600], ["minute", 60]];
      const [unit, size] = units.find(([, n]) => Math.abs(sec) >= n) || ["second", 1];
      try { return new Intl.RelativeTimeFormat(SYS.currentLanguage ? SYS.currentLanguage() : "en", { numeric: "auto" }).format(Math.round(sec / size), unit); }
      catch (e) { return new Date(ms).toLocaleString(); }
    };
    const seen = s.seen || [];
    const aiToday = s.ai.days[s.ai.days.length - 1].n;
    const a = s.assessment;
    return `
      <div class="sys-panel panel-pad admin-stats">
        <div class="admin-stats-head">
          <div class="tile-group-head" style="margin:0;">${t("admin.statsTitle")}</div>
          ${ui.adminStatsBusy ? `<span class="today-count">${t("lb.loading")}</span>` : ""}
        </div>
        <div class="stat-tiles admin-stat-tiles">
          ${tile(s.accounts, t("admin.statsAccounts"))}
          ${visits.length ? tile(visits[visits.length - 1].n, t("admin.statsVisitors"), t("admin.statsWeek", { n: visits.slice(-7).reduce((x, r) => x + r.n, 0) })) : ""}
          ${tile(s.newToday, t("admin.statsNewToday"), t("admin.statsWeek", { n: s.new7 }))}
          ${tile(s.activeToday, t("admin.statsActiveToday"), t("admin.statsWeek", { n: s.active7 }))}
          ${tile(pct(s.d1.kept, s.d1.cohort), t("admin.statsD1"), t("admin.statsOf", { k: s.d1.kept, n: s.d1.cohort }))}
          ${tile(pct(s.d7.kept, s.d7.cohort), t("admin.statsD7"), t("admin.statsOf", { k: s.d7.kept, n: s.d7.cohort }))}
          ${tile(s.streaks.alive, t("admin.statsStreaks"), t("admin.statsLongest", { n: s.streaks.longest }))}
          ${tile("\u2066" + aiToday + " / " + s.ai.cap + "\u2069", t("admin.statsAi"))}
        </div>
        <div class="admin-stats-cols">
          <div>
            <div class="field-label">${t("admin.statsSignups")}</div>
            ${bars(s.signups, sMax)}
          </div>
          <div>
            <div class="field-label">${t("admin.statsAssessment")}</div>
            <div class="admin-assess">
              <span><b>${a.done}</b> ${t("admin.statsDone")}</span>
              <span><b>${a.inProgress}</b> ${t("admin.statsInProgress")}</span>
              <span><b>${a.notStarted}</b> ${t("admin.statsNotStarted")}</span>
              <span><b>${a.skipped}</b> ${t("admin.statsSkipped")}</span>
            </div>
          </div>
        </div>
        ${visits.length ? `
        <div class="admin-stats-cols">
          <div>
            <div class="field-label">${t("admin.statsVisits")}</div>
            ${bars(visits, vMax)}
          </div>
          <div>
            <div class="field-label">${t("admin.statsSeen")}</div>
            ${seen.length ? `<div class="admin-seen">${seen.map((r) => `
              <div class="admin-seen-row">
                <span class="admin-seen-name">${r.name ? escapeHtml(r.name) : `<i>${t("admin.statsNoName")}</i>`}</span>
                <span class="admin-seen-email">${escapeHtml(r.email || "")}</span>
                <span class="admin-seen-at">${escapeHtml(ago(r.at))}</span>
              </div>`).join("")}</div>` : `<div class="empty-note">${t("admin.statsSeenNone")}</div>`}
          </div>
        </div>` : ""}
        ${renderAdminBilling(ui, s.billing)}
        <div class="admin-cap">
          <label class="field-label" for="admin-cap-input">${t("admin.capLabel")}</label>
          <div class="field-row" style="align-items:center;">
            <input id="admin-cap-input" class="field-input" type="number" min="0" step="1" inputmode="numeric"
              data-bind="adminCapDraft" value="${escapeHtml(ui.adminCapDraft != null ? ui.adminCapDraft : s.ai.cap)}" />
            <button class="btn btn-primary" data-action="admin-set-cap" style="flex:0 0 auto;" ${ui.adminCapBusy ? "disabled" : ""}>${t(ui.adminCapBusy ? "admin.sending" : "admin.capSave")}</button>
          </div>
          ${ui.adminCapError ? `<div class="toast-error" style="margin-top:8px;">${escapeHtml(ui.adminCapError)}</div>` : ""}
          <div class="form-hint">${t("admin.capHint")}</div>
        </div>
        <div class="form-hint">${t("admin.statsNote")}</div>
      </div>`;
  }

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
      out += `<div class="task-held">${icon("clock", 12)} ${t("reflect.held", { n: held })}${helpMark("verification", true)} <button class="link-btn" data-action="open-reflection" data-id="${task.id}" data-cp="${due}">${t("reflect.answer")}</button></div>`;
    } else if (held > 0 && waiting) {
      out += `<div class="task-held">${icon("clock", 12)} ${t("reflect.held", { n: held })} · ${t("reflect.waiting")}${helpMark("verification", true)}</div>`;
    } else if (held > 0 && nextCp) {
      out += `<div class="task-held">${icon("clock", 12)} ${t("reflect.heldUntil", { n: held, cp: nextCp })}${helpMark("verification", true)}</div>`;
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
    const header = renderPageHead("mail");
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
        ${waiting.length ? `<div class="sys-panel panel-pad mail-waiting">
          <div class="planner-section" style="margin-top:0;">${t("mail.waiting")} · ${waiting.length}</div>
          ${waiting.join("")}
        </div>` : ""}
        ${system ? `<div class="sys-panel panel-pad mail-system">
          <div class="friends-rank-head" style="margin-bottom:4px;">
            <span class="planner-section" style="margin:0;">${t("log.fromSystem")}${act.unread ? " · " + act.unread : ""}</span>
            ${act.unread ? `<button class="link-btn" data-action="inbox-read-all">${t("log.markAllRead")}</button>` : ""}
          </div>
          ${system}
        </div>` : ""}
        ${history.length ? `<div class="sys-panel panel-pad mail-history">
          <div class="planner-section" style="margin-top:0;">${t("mail.history")}</div>
          ${history.slice(0, 12).join("")}
        </div>` : ""}`);
  }
  SYS.renderMailPage = renderMailPage;

  // A theme's name in the app's language; saved settings keep the English.
  function themeName(name) {
    const said = t("theme." + name);
    return said === "theme." + name ? name : said;
  }

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
      case "shop": return U.renderShopPage(state, ui);
      case "admin": return renderAdminPage(state, ui);
      default: return renderOverviewPage(state, ui);
    }
  }
  SYS.renderPage = renderPage;

  Object.assign(U, { AI_REASON_KEYS, AI_SURFACE_KEYS, renderAiReportModal, renderAdminAiReportQueue, FEEDBACK_KINDS, feedbackDate, renderFeedbackModal, renderAdminFeedbackQueue, renderAdminReportQueue, renderAdminPage, CONSOLE_BILLING_URL, renderAdminBilling, renderAdminStats, renderStandingProvenance, renderTaskHeld, renderReflectionModal, renderAdminSuspicionQueue, renderAdminReflectionQueue, renderAdminAppealQueue, mailActionable, mailBadge, mailRow, stampOf, renderMailPage, themeName, renderPage });
})(window.SYS = window.SYS || {});

// Click handlers: profiles, friends, races, the ranking, the account, reports and feedback.
// One of the files main.js was split into; the names they share travel through SYS._main.
(function (SYS) {
  "use strict";
  const M = SYS._main || (SYS._main = {});
  const { $feedbackShotInput, ACTIONS, SIGNED_OUT, accountErrorText, deleteAccountNow, feedbackErrorText, flushExpQueue, friendErrorText, loadMoreLeaderboard, openAiReport, openCompare, openDeleteAccount, openFeedback, openFriendsTab, openProfile, raceErrorText, refreshFriendRows, refreshLeaderboard, refreshRaceScores, rememberMe, resetLocalState, runFriendSearch, ui, writeOwner } = M;

  ACTIONS["open-profile"] = function ({ el }) {
    openProfile(el.dataset.uid);
  };

  ACTIONS["open-my-profile"] = function () {
    if (ui.cloudUser) openProfile(ui.cloudUser.uid);
  };

  ACTIONS["profile-edit"] = function () {
    const p = (ui.profile && ui.profile.profile) || {};
    const w = p.worn || {};
    ui.profileEdit = { avatar: p.avatar || null, bio: p.bio || "", frame: w.frame || null, background: w.background || null, busy: false, error: null };
    M.renderModalInto();
  };

  ACTIONS["profile-avatar"] = function ({ el }) {
    if (ui.profileEdit) { ui.profileEdit.avatar = el.dataset.id; M.renderModalInto(); }
  };

  ACTIONS["profile-wear"] = function ({ el }) {
    if (ui.profileEdit) { ui.profileEdit[el.dataset.kind === "frame" ? "frame" : "background"] = el.dataset.id || null; M.renderModalInto(); }
  };

  ACTIONS["profile-edit-cancel"] = function () {
    ui.profileEdit = null;
    M.renderModalInto();
  };

  ACTIONS["profile-save"] = function () {
    const e = ui.profileEdit;
    if (!e || e.busy) return;
    e.busy = true;
    e.error = null;
    M.renderModalInto();
    const was = (ui.profile && ui.profile.profile && ui.profile.profile.worn) || {};
    const wearing = ["frame", "background"].filter((k) => (was[k] || null) !== (e[k] || null));
    SYS.Cloud.callUpdateProfile({ avatar: e.avatar || null, bio: e.bio || "" }).then((saved) =>
      // What is worn changed too: one call each, through the server's
      // ownership check.
      wearing.reduce((chain, k) => chain.then(() => SYS.Cloud.callWearItem(k, e[k])), Promise.resolve()).then(() => saved)
    ).then((saved) => {
      const worn = { ...was };
      wearing.forEach((k) => { worn[k] = e[k] || null; });
      if (ui.profile) ui.profile.profile = { ...(ui.profile.profile || {}), avatar: saved.avatar, bio: saved.bio, worn };
      ui.myWorn = worn;
      if (ui.cloudUser) ui.frames = { ...(ui.frames || {}), [ui.cloudUser.uid]: worn.frame || null };
      if (ui.cloudUser) ui.avatars = { ...(ui.avatars || {}), [ui.cloudUser.uid]: saved.avatar || null };
      rememberMe();
      ui.profileEdit = null;
      M.renderModalInto();
      M.renderStatusbarInto();
    }).catch((err) => {
      e.busy = false;
      e.error = M.refusalText(err);
      M.renderModalInto();
    });
  };

  ACTIONS["open-delete-account"] = function () {
    openDeleteAccount();
  };

  ACTIONS["delete-account-confirm"] = function () {
    deleteAccountNow();
  };

  ACTIONS["report-ai"] = function ({ el }) {
    openAiReport(el.dataset.surface, el);
  };

  ACTIONS["ai-report-reason"] = function ({ el }) {
    if (ui.aiReport) { ui.aiReport.reason = el.dataset.reason; M.renderModalInto(); }
  };

  ACTIONS["ai-report-send"] = function () {
    const r = ui.aiReport;
    if (!r || !r.reason || r.busy) return;
    r.busy = true; r.error = null;
    M.renderModalInto();
    SYS.Cloud.callReportAi({ surface: r.surface, reason: r.reason, content: r.content, context: r.context, note: r.note || "" }).then(() => {
      if (ui.aiReport !== r) return;
      r.busy = false; r.sent = true;
      M.renderModalInto();
    }).catch((err) => {
      if (ui.aiReport !== r) return;
      r.busy = false;
      r.error = err && err.details && err.details.code === "too-many" ? SYS.t("feedback.errTooMany") : ((err && err.message) || SYS.t("profile.saveFailed"));
      M.renderModalInto();
    });
  };

  ACTIONS["open-feedback"] = function () {
    openFeedback();
  };

  ACTIONS["feedback-kind"] = function ({ el }) {
    if (ui.feedback) { ui.feedback.kind = el.dataset.kind; ui.feedback.sent = false; M.renderModalInto(); }
  };

  ACTIONS["feedback-attach"] = function () {
    if (ui.feedback && $feedbackShotInput) $feedbackShotInput.click();
  };

  ACTIONS["feedback-remove-shot"] = function () {
    if (ui.feedback) { ui.feedback.shot = null; M.renderModalInto(); }
  };

  ACTIONS["feedback-send"] = function () {
    const f = ui.feedback;
    if (!f || f.busy || f.shotBusy || !ui.cloudUser) return;
    const text = String(f.text || "").trim();
    if (text.length < 3) { f.error = SYS.t("feedback.errText"); f.sent = false; M.renderModalInto(); return; }
    f.busy = true; f.error = null; f.sent = false;
    M.renderModalInto();
    const device = {
      ua: navigator.userAgent,
      lang: SYS.currentLanguage ? SYS.currentLanguage() : "",
      platform: (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "",
      screen: window.innerWidth + "x" + window.innerHeight + "@" + (window.devicePixelRatio || 1),
      standalone: !!(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches),
      page: ui.page || "",
    };
    SYS.Cloud.callSendFeedback({ kind: f.kind, text, shot: f.shot || null, device }).then(() => {
      if (ui.feedback !== f) return;
      f.busy = false; f.text = ""; f.shot = null; f.sent = true;
      M.renderModalInto();
      M.refreshMyFeedback();
    }).catch((err) => {
      if (ui.feedback !== f) return;
      f.busy = false;
      f.error = feedbackErrorText(err);
      M.renderModalInto();
    });
  };

  ACTIONS["profile-report"] = function () {
    ui.profileReport = { reason: null, note: "", busy: false, error: null };
    ui.profileReportSent = false;
    M.renderModalInto();
  };

  ACTIONS["report-reason"] = function ({ el }) {
    if (ui.profileReport) { ui.profileReport.reason = el.dataset.reason; M.renderModalInto(); }
  };

  ACTIONS["report-cancel"] = function () {
    ui.profileReport = null;
    M.renderModalInto();
  };

  ACTIONS["report-send"] = function () {
    const r = ui.profileReport;
    if (!r || !r.reason || r.busy) return;
    r.busy = true;
    M.renderModalInto();
    SYS.Cloud.callReportUser({ uid: ui.profileUid, reason: r.reason, note: r.note || "" }).then(() => {
      ui.profileReport = null;
      ui.profileReportSent = true;
      M.renderModalInto();
    }).catch((err) => {
      r.busy = false;
      r.error = (err && err.message) || SYS.t("profile.saveFailed");
      M.renderModalInto();
    });
  };

  ACTIONS["profile-block"] = function () {
    const target = ui.profileUid;
    if (!target || ui.profileBlockBusy) return;
    const block = !ui.blocks.has(target);
    ui.profileBlockBusy = true;
    M.renderModalInto();
    SYS.Cloud.setBlocked(target, block).then(() => {
      if (block) ui.blocks.add(target); else ui.blocks.delete(target);
      // A block ends a friendship or a request, too.
      if (block && SYS.friendStatus(ui, target) !== "none") return SYS.Cloud.callRemoveFriend(target).catch(() => {});
    }).then(() => {
      M.addToast({ kind: "info", text: SYS.t(block ? "profile.blockedToast" : "profile.unblockedToast") });
    }).catch((err) => {
      M.addToast({ kind: "info", text: (err && err.message) || SYS.t("profile.saveFailed") });
    }).then(() => {
      ui.profileBlockBusy = false;
      if (ui.modal === "profile") M.renderModalInto();
    });
  };

  ACTIONS["unblock"] = function ({ el }) {
    const target = el.dataset.uid;
    if (!target || ui.unblockBusy) return;
    ui.unblockBusy = target;
    M.renderPageInto();
    SYS.Cloud.setBlocked(target, false).then(() => {
      ui.blocks.delete(target);
      ui.blockedList = (ui.blockedList || []).filter((b) => b.uid !== target);
      M.addToast({ kind: "info", text: SYS.t("profile.unblockedToast") });
    }).catch((err) => M.addToast({ kind: "info", text: (err && err.message) || SYS.t("profile.saveFailed") })).then(() => {
      ui.unblockBusy = null;
      if (ui.page === "friends") M.renderPageInto();
    });
  };

  ACTIONS["lb-mode"] = function ({ el }) {
    ui.lbMode = ["week", "season"].indexOf(el.dataset.mode) >= 0 ? el.dataset.mode : "total";
    ui.leaderboard = null;
    refreshLeaderboard();
    M.renderPageInto();
  };

  ACTIONS["lb-more"] = function () {
    loadMoreLeaderboard();
  };

  ACTIONS["lb-tab"] = function ({ el }) {
    ui.lbTab = el.dataset.tab === "friends" ? "friends" : "world";
    if (ui.lbTab === "friends") refreshFriendRows();
    M.renderPageInto();
  };

  ACTIONS["friends-view"] = function ({ el }) {
    ui.friendsWeek = el.dataset.week === "1";
    M.renderPageInto();
  };

  ACTIONS["friend-sort"] = function ({ el }) {
    ui.friendSort = el.dataset.sort === "name" ? "name" : "exp";
    M.renderPageInto();
  };

  ACTIONS["friend-focus-search"] = function () {
    const box = document.getElementById("friend-search");
    if (box) box.focus();
  };

  ACTIONS["friend-search"] = function () {
    runFriendSearch();
  };

  ACTIONS["friend-add-uid"] = function ({ el }) {
    if (ui.friendBusy) return;
    ui.friendBusy = true;
    M.renderAppInto(); M.renderModalInto();
    SYS.Cloud.callSendFriendRequest({ uid: el.dataset.uid }).then((res) => {
      M.addToast({ kind: "info", text: SYS.t(res.status === "friends" ? "friends.nowFriends" : "friends.requestSent", { name: "" }) });
    }).catch((err) => {
      M.addToast({ kind: "info", text: friendErrorText(err) });
    }).then(() => {
      ui.friendBusy = false;
      M.renderAppInto(); M.renderModalInto();
    });
  };

  ACTIONS["friend-respond"] = function ({ el }) {
    SYS.Cloud.callRespondFriendRequest(el.dataset.uid, el.dataset.accept === "1")
    .catch((err) => M.addToast({ kind: "info", text: friendErrorText(err) }));
  };

  ACTIONS["friend-remove"] = function ({ el }) {
    SYS.Cloud.callRemoveFriend(el.dataset.uid)
    .catch((err) => M.addToast({ kind: "info", text: friendErrorText(err) }));
  };

  ACTIONS["friend-remove-armed"] = function ({ el }) {
    SYS.Cloud.callRemoveFriend(el.dataset.uid)
    .catch((err) => M.addToast({ kind: "info", text: friendErrorText(err) }));
  };

  ACTIONS["friend-invite"] = function () {
    if (ui.inviteBusy) return;
    ui.inviteBusy = true;
    M.renderPageInto();
    SYS.Cloud.callCreateInvite().then((res) => {
      const link = location.origin + location.pathname + "#invite=" + res.token;
      ui.inviteLink = link;
      // The phone's own share sheet where there is one (WhatsApp and the
      // rest are in it); otherwise the link is copied.
      if (navigator.share) {
        navigator.share({ title: "The System", text: SYS.t("friends.shareText"), url: link }).catch(() => {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(link).then(() => M.addToast({ kind: "info", text: SYS.t("friends.copied") })).catch(() => {});
      }
    }).catch((err) => M.addToast({ kind: "info", text: friendErrorText(err) })).then(() => {
      ui.inviteBusy = false;
      M.renderPageInto();
    });
  };

  ACTIONS["race-open-form"] = function ({ el }) {
    ui.raceForm = { uid: el.dataset.uid, metric: "total", busy: false };
    ui.modal = "raceForm";
    M.renderModalInto();
  };

  ACTIONS["race-metric"] = function ({ el }) {
    if (ui.raceForm) { ui.raceForm.metric = el.dataset.metric; M.renderModalInto(); }
  };

  ACTIONS["race-send"] = function () {
    const f = ui.raceForm;
    if (!f || f.busy) return;
    f.busy = true;
    M.renderModalInto();
    SYS.Cloud.callCreateRace(f.uid, f.metric).then(() => {
      ui.raceForm = null;
      ui.modal = null;
      M.renderModalInto();
      M.addToast({ kind: "info", text: SYS.t("races.sent") });
      if (ui.page !== "friends") openFriendsTab();
    }).catch((err) => {
      f.busy = false;
      M.renderModalInto();
      M.addToast({ kind: "info", text: raceErrorText(err) });
    });
  };

  ACTIONS["race-respond"] = function ({ el }) {
    SYS.Cloud.callRespondRace(el.dataset.id, el.dataset.accept === "1")
    .catch((err) => M.addToast({ kind: "info", text: raceErrorText(err) }));
  };

  ACTIONS["race-cancel"] = function ({ el }) {
    SYS.Cloud.callCancelRace(el.dataset.id)
    .catch((err) => M.addToast({ kind: "info", text: raceErrorText(err) }));
  };

  ACTIONS["race-refresh"] = function () {
    refreshRaceScores();
  };

  ACTIONS["open-compare"] = function ({ el }) {
    openCompare(el.dataset.uid);
  };

  ACTIONS["account-submit"] = function () {
    const f = ui.accountForm;
    if (!f.email || !f.password) { f.error = SYS.t("account.needBoth"); M.renderModalInto(); return; }
    const wasSignup = f.mode === "signup";
    f.busy = true; f.error = null; f.info = null;
    M.renderModalInto();
    const req = wasSignup ? SYS.Cloud.signUp(f.email, f.password) : SYS.Cloud.signIn(f.email, f.password);
    req.then(() => {
      ui.accountForm = { mode: "signin", email: "", password: "", error: null, info: null, busy: false };
      M.renderModalInto();
      if (wasSignup) M.addToast({ kind: "info", text: SYS.t("account.created") });
    }).catch((err) => {
      f.busy = false;
      f.error = accountErrorText(err);
      M.renderModalInto();
    });
  };

  ACTIONS["account-google"] = function () {
    const f = ui.accountForm;
    f.error = null; f.info = null; f.busy = true;
    M.renderModalInto();
    SYS.Cloud.signInWithGoogle().then(() => {
      // onAuthStateChanged (already wired above) picks up the signed-in
      // user and re-renders the settings modal on its own.
      f.busy = false;
    }).catch((err) => {
      f.busy = false;
      const code = err && err.code;
      f.error = code === "auth/popup-blocked"
        ? SYS.t("account.popupBlocked")
        : code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request"
          ? null // user just closed it — not an error worth showing
          : (err && err.message) || "Couldn't sign in with Google.";
      M.renderModalInto();
    });
  };

  ACTIONS["account-forgot-password"] = function () {
    const f = ui.accountForm;
    f.error = null; f.info = null;
    if (!f.email) { f.error = SYS.t("account.enterEmailFirst"); M.renderModalInto(); return; }
    SYS.Cloud.sendPasswordReset(f.email).then(() => {
      f.info = SYS.t("account.resetSent");
      M.renderModalInto();
    }).catch((err) => {
      f.error = accountErrorText(err);
      M.renderModalInto();
    });
  };

  ACTIONS["account-resend-verification"] = function () {
    const now = Date.now();
    if (now - ui.lastVerifyResendAt < 30000) return;
    ui.lastVerifyResendAt = now;
    SYS.Cloud.sendVerificationEmail().then(() => {
      ui.syncStatus = "Verification email sent — check your inbox.";
      M.renderModalInto();
    }).catch(() => {
      ui.syncStatus = "Couldn't send that right now — try again shortly.";
      M.renderModalInto();
    });
  };

  ACTIONS["account-sign-out"] = function () {
    if (ui.signingOut) return;
    ui.signingOut = true;
    if (SYS.Cloud.flushPush) SYS.Cloud.flushPush();
    flushExpQueue();
    const waitForQueue = (left) => new Promise((done) => {
      const tick = (n) => (!M.expQueue.length && !M.expFlushing) || n <= 0 ? done() : setTimeout(() => tick(n - 1), 200);
      tick(left);
    });
    waitForQueue(20).then(() => SYS.Cloud.signOut()).then(() => {
      writeOwner(SIGNED_OUT);
      resetLocalState();
    }).catch(() => {}).then(() => {
      ui.signingOut = false;
      M.renderModalInto();
    });
  };

  ACTIONS["inbox-read-all"] = function () {
    const unread = (ui.inbox || []).filter((m) => !m.read);
    if (!unread.length) return;
    unread.forEach((m) => { m.read = true; });
    M.renderPageInto();
    M.renderSidebarInto();
    unread.forEach((m) => SYS.Cloud.markInboxRead(m.id).catch(() => {}));
  };


})(window.SYS = window.SYS || {});

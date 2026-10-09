// App: profiles, friends, races, comparisons, blocks, account deletion, AI reports and feedback.
// One of the files main.js was split into; the names they share travel through SYS._main.
(function (SYS) {
  "use strict";
  const M = SYS._main || (SYS._main = {});
  const { ui } = M;

  // ---------------- profiles ----------------

  function openProfile(uid) {
    if (!uid || !ui.cloudUser) return;
    ui.profileUid = uid;
    ui.profile = null;
    ui.profileRank = null;
    ui.profileError = null;
    ui.profileEdit = null;
    ui.profileReport = null;
    ui.profileReportSent = false;
    ui.modal = "profile";
    M.renderModalInto();
    SYS.Cloud.fetchProfile(uid).then((data) => {
      if (ui.profileUid !== uid) return;
      ui.profile = data;
      if (ui.modal === "profile") M.renderModalInto();
      if (data && data.row && !data.row.hidden) {
        return SYS.Cloud.fetchMyRank(Number(data.row.totalExp) || 0).then((rank) => {
          if (ui.profileUid !== uid) return;
          ui.profileRank = rank;
          if (ui.modal === "profile") M.renderModalInto();
        });
      }
    }).catch((err) => {
      ui.profileError = (err && err.message) || SYS.t("profile.loadFailed");
      if (ui.modal === "profile") M.renderModalInto();
    });
  }

  // The server's refusal of a name or a bio carries the moderator's reason.
  function refusalText(err) {
    const details = err && err.details;
    if (details && details.code === "not-allowed") {
      return SYS.t("profile.notAllowed") + (details.reason ? " " + details.reason : "");
    }
    return (err && err.message) || SYS.t("profile.saveFailed");
  }

  // ---------------- friends ----------------

  let stopWatchingFriends = null;
  function watchFriends(signedIn) {
    if (stopWatchingFriends) { stopWatchingFriends(); stopWatchingFriends = null; }
    ui.friendships = [];
    ui.friendRequestsIn = 0;
    if (!signedIn || !SYS.Cloud.watchFriendships) return;
    stopWatchingFriends = SYS.Cloud.watchFriendships((list) => {
      ui.friendships = list;
      ui.friendRequestsIn = list.filter((f) => f.status === "pending" && f.to === ui.cloudUser.uid).length;
      refreshFriendRows();
      M.renderSidebarInto();
      if (ui.page === "leaderboard") M.renderPageInto();
      if (ui.modal === "profile") M.renderModalInto();
    });
  }

  // Names and EXP for everyone in the list, and this account's own row.
  function refreshFriendRows() {
    if (!ui.cloudUser) return;
    const me = ui.cloudUser.uid;
    const uids = [...new Set(ui.friendships.map((f) => (f.users || []).find((u) => u !== me)).filter(Boolean))];
    SYS.Cloud.fetchLeaderboardRows(uids.concat(me)).then((rows) => {
      const map = {};
      rows.forEach((r) => { map[r.uid] = r; });
      ui.myRow = map[me] || null;
      delete map[me];
      ui.friendRows = map;
      if (ui.page === "leaderboard" || ui.page === "friends") M.renderPageInto();
    }).catch(() => {});
    loadAvatars(uids);
  }

  // Avatars live on profiles, which are read one at a time (a profile its
  // owner has hidden from this account is simply skipped).
  function loadAvatars(uids) {
    const missing = uids.filter((uid) => !(uid in ui.avatars));
    if (!missing.length || !SYS.Cloud.fetchProfile) return;
    missing.forEach((uid) => { ui.avatars[uid] = null; });
    Promise.all(missing.map((uid) => SYS.Cloud.fetchProfile(uid)
      .then((p) => {
        ui.avatars[uid] = p && p.profile ? p.profile.avatar || null : null;
        const f = p && p.profile && p.profile.worn && p.profile.worn.frame;
        if (f) ui.frames = { ...(ui.frames || {}), [uid]: f };
      })
      .catch(() => {}))).then(() => {
      if (ui.page === "friends" || ui.page === "leaderboard") M.renderPageInto();
    });
  }

  function runFriendSearch() {
    const q = (ui.friendSearch || "").trim();
    if ([...q].length < 2 || ui.friendSearchBusy) return;
    ui.friendSearchBusy = true;
    M.renderPageInto();
    SYS.Cloud.callSearchPlayers(q).then((res) => {
      const results = (res && res.results) || [];
      ui.friendResults = results;
      const uids = results.map((r) => r.uid);
      loadAvatars(uids);
      return SYS.Cloud.fetchLeaderboardRows(uids).then((rows) => {
        rows.forEach((r) => { ui.searchRows[r.uid] = r; });
      });
    }).catch((err) => {
      M.addToast({ kind: "info", text: (err && err.message) || SYS.t("profile.saveFailed") });
    }).then(() => {
      ui.friendSearchBusy = false;
      if (ui.page === "friends") M.renderPageInto();
      const box = document.getElementById("friend-search");
      if (box) box.focus();
    });
  }

  // A friend call's refusal, in the reader's language.
  function friendErrorText(err) {
    const details = (err && err.details) || {};
    const key = { "no-such-player": "friends.noSuchPlayer", self: "friends.self", full: "friends.full", "bad-invite": "friends.badInvite",
      "no-request": "friends.noRequest", "blocked-by": "friends.blockedBy", "you-blocked": "friends.youBlocked" }[details.code];
    return key ? SYS.t(key, { name: details.name || "" }) : (err && err.message) || SYS.t("profile.saveFailed");
  }

  // An invite link opened: remembered until someone is signed in to take it.
  const INVITE_KEY = "the-system:invite";
  (function captureInvite() {
    const m = /^#invite=([0-9a-f]{24})$/.exec(location.hash || "");
    if (!m) return;
    try { sessionStorage.setItem(INVITE_KEY, m[1]); } catch (e) { /* storage blocked */ }
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
  })();
  function takePendingInvite() {
    let token = null;
    try { token = sessionStorage.getItem(INVITE_KEY); } catch (e) { return; }
    if (!token) return;
    if (!ui.cloudUser) {
      M.addToast({ kind: "info", text: SYS.t("friends.inviteSignIn") });
      return;
    }
    try { sessionStorage.removeItem(INVITE_KEY); } catch (e) { /* ignore */ }
    SYS.Cloud.callAcceptInvite(token).then((res) => {
      M.addToast({ kind: "info", text: SYS.t("friends.nowFriends", { name: res.name || "" }) });
      openFriendsTab();
    }).catch((err) => M.addToast({ kind: "info", text: friendErrorText(err) }));
  }
  setTimeout(() => { if (!ui.cloudUser) takePendingInvite(); }, 3500);

  function openFriendsTab() {
    ui.page = "friends";
    M.renderSidebarInto();
    M.renderPageInto();
    refreshFriendRows();
    refreshBlockedList();
    refreshRaceScores();
  }
  if (location.hash === "#delete-account") {
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
    setTimeout(openDeleteAccount, 0);
  }
  try {
    if (window.sessionStorage.getItem("the-system:deleted")) {
      window.sessionStorage.removeItem("the-system:deleted");
      setTimeout(() => M.addToast({ kind: "info", sticky: true, text: SYS.t("delete.done") }), 0);
    }
  } catch (e) { /* storage blocked */ }
  if (location.hash === "#feedback") {
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
    setTimeout(openFeedback, 0);
  }
  if (location.hash === "#friends") {
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
    setTimeout(openFriendsTab, 0);
  }

  let stopWatchingRaces = null;
  function watchRaces(signedIn) {
    if (stopWatchingRaces) { stopWatchingRaces(); stopWatchingRaces = null; }
    ui.races = [];
    if (!signedIn || !SYS.Cloud.watchRaces) return;
    stopWatchingRaces = SYS.Cloud.watchRaces((list) => {
      const becameActive = list.some((r) => r.status === "active" && !(r.id in ui.raceScores));
      ui.races = list;
      M.renderSidebarInto();
      if (ui.page === "friends") M.renderPageInto();
      if (becameActive && ui.page === "friends") refreshRaceScores();
    });
  }

  // Live scores for the races under way, from the server's journal.
  function refreshRaceScores() {
    const active = (ui.races || []).filter((r) => r.status === "active");
    if (!active.length || ui.raceScoresBusy) return;
    ui.raceScoresBusy = true;
    Promise.all(active.map((r) => SYS.Cloud.callRaceStatus(r.id)
      .then((res) => { ui.raceScores[r.id] = res.scores || {}; })
      .catch(() => {}))).then(() => {
      ui.raceScoresBusy = false;
      if (ui.page === "friends") M.renderPageInto();
    });
  }

  function raceErrorText(err) {
    const details = (err && err.details) || {};
    const key = { "not-friends": "races.notFriends", "already-open": "races.alreadyOpen", "too-many": "races.tooMany", "no-race": "races.noRace", "bad-metric": "races.badMetric" }[details.code];
    return key ? SYS.t(key) : friendErrorText(err);
  }

  function openCompare(uid) {
    ui.compareUid = uid;
    ui.compare = null;
    ui.modal = "compare";
    M.renderModalInto();
    Promise.all([SYS.Cloud.fetchProfile(ui.cloudUser.uid), SYS.Cloud.fetchProfile(uid)]).then(([me, them]) => {
      if (ui.compareUid !== uid) return;
      ui.compare = { me, them };
      if (ui.modal === "compare") M.renderModalInto();
    }).catch((err) => {
      ui.compare = { error: (err && err.message) || SYS.t("profile.loadFailed") };
      if (ui.modal === "compare") M.renderModalInto();
    });
  }

  // The blocked accounts with their current names and avatars, for Settings.
  function refreshBlockedList() {
    if (!SYS.Cloud || !SYS.Cloud.fetchBlocks || !ui.cloudUser) return;
    ui.blockedList = null;
    SYS.Cloud.fetchBlocks().then((ids) => {
      ui.blocks = new Set(ids);
      return Promise.all(ids.map((uid) => SYS.Cloud.fetchProfile(uid)
        .then((p) => ({ uid, name: p && p.row ? p.row.displayName : "", avatar: p && p.profile ? p.profile.avatar : null }))
        .catch(() => ({ uid, name: "", avatar: null }))));
    }).then((list) => {
      ui.blockedList = list;
      if (ui.page === "friends") M.renderPageInto();
    }).catch(() => {
      ui.blockedList = [];
      if (ui.page === "friends") M.renderPageInto();
    });
  }

  function refreshBlocks() {
    if (!SYS.Cloud || !SYS.Cloud.fetchBlocks || !ui.cloudUser) return;
    SYS.Cloud.fetchBlocks().then((ids) => { ui.blocks = new Set(ids); }).catch(() => {});
  }

  // ---------------- deleting the account ----------------

  function openDeleteAccount() {
    ui.modal = "deleteAccount";
    ui.deleteAccount = { typed: "", busy: false, error: null };
    M.renderModalInto();
  }

  // Nothing of the account is left on this device either: the saves waiting
  // to go are dropped before the server starts, and once it is done the app
  // signs out, forgets everything it kept, and starts again from nothing.
  function deleteAccountNow() {
    const d = ui.deleteAccount;
    if (!d || d.busy || !ui.cloudUser) return;
    const typed = String(d.typed || "").trim().toLowerCase();
    if (typed !== SYS.t("delete.word").toLowerCase() && typed !== "delete") {
      d.error = SYS.t("delete.typeExactly", { word: SYS.t("delete.word") });
      M.renderModalInto();
      return;
    }
    d.busy = true; d.error = null;
    M.renderModalInto();
    SYS.PlannerSync.detach();
    if (M.stopWatchingState) { M.stopWatchingState(); M.stopWatchingState = null; }
    watchFriends(false);
    watchRaces(false);
    SYS.Cloud.cancelPush();
    SYS.Cloud.callDeleteAccount().then(() => {
      // This device stops asking for notifications for an account that is gone.
      const unsubscribed = SYS.disablePush ? Promise.resolve().then(() => SYS.disablePush()).catch(() => {}) : Promise.resolve();
      return Promise.race([unsubscribed, new Promise((r) => setTimeout(r, 2500))])
        .then(() => SYS.Cloud.signOut().catch(() => {}));
    }).then(() => {
      try {
        Object.keys(window.localStorage).filter((k) => k.indexOf("the-system") === 0).forEach((k) => window.localStorage.removeItem(k));
        window.sessionStorage.clear();
      } catch (e) { /* storage blocked: nothing kept to forget */ }
      try { window.sessionStorage.setItem("the-system:deleted", "1"); } catch (e) { /* only the notice is lost */ }
      location.replace(location.pathname + location.search);
    }).catch((err) => {
      d.busy = false;
      d.error = (err && err.message) || SYS.t("profile.saveFailed");
      // Still signed in: pick the live copy back up.
      SYS.Cloud.resumePush();
      if (ui.cloudUser) {
        SYS.PlannerSync.attach(ui.cloudUser.uid, M.onPlannerFromServer);
        watchFriends(true);
        watchRaces(true);
      }
      M.renderModalInto();
    });
  }

  // ---------------- reporting what the AI said ----------------

  function openAiReport(surface, el) {
    const id = el.dataset.id;
    let content = "", context = {};
    if (surface === "evaluation") {
      const task = M.state.tasks.find((x) => x.id === id);
      if (!task) return;
      const last = ui.lastAiEval && ui.lastAiEval.title === String(task.title || "").trim() ? ui.lastAiEval.rationale : "";
      content = task.title + " → " + (Number(task.pt) || 0) + " pt" + (last ? "\n" + last : "");
      context = { title: task.title, pt: task.pt, taskId: task.id, priceId: task.priceId || "" };
    } else if (surface === "suggestion") {
      const s = ((ui.suggestions && ui.suggestions.items) || []).find((x) => x.id === id);
      if (!s) return;
      content = [s.title, s.description, s.reason].filter(Boolean).join("\n");
      context = { title: s.title, pt: s.pt, suggestionId: s.id, weekKey: ui.suggestions.weekKey || "" };
    } else if (surface === "reflection") {
      const task = M.state.tasks.find((x) => x.id === id);
      const cp = Number(el.dataset.cp);
      const r = task && task.reflections && task.reflections[cp];
      if (!r || !r.reason) return;
      content = r.reason;
      context = { title: task.title, taskId: task.id, checkpoint: cp };
    } else return;
    ui.aiReport = { surface, content, context, reason: null, note: "", busy: false, error: null, sent: false };
    ui.modal = "aiReport";
    M.renderModalInto();
  }

  function refreshAdminAiReports() {
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.isAdmin || !SYS.Cloud.fetchOpenAiReports) return;
    SYS.Cloud.fetchOpenAiReports().then((list) => {
      ui.adminAiReports = list;
      if (ui.page === "admin") M.renderPageInto();
    }).catch(() => {});
  }

  // ---------------- feedback ----------------

  function openFeedback() {
    ui.modal = "feedback";
    ui.feedback = { kind: "bug", text: "", shot: null, shotBusy: false, busy: false, error: null, sent: false };
    ui.myFeedback = null;
    M.renderModalInto();
    refreshMyFeedback();
  }

  function refreshMyFeedback() {
    if (!SYS.Cloud || !SYS.Cloud.fetchMyFeedback || !ui.cloudUser) return;
    SYS.Cloud.fetchMyFeedback().then((list) => {
      ui.myFeedback = list;
      if (ui.modal === "feedback") M.renderModalInto();
    }).catch(() => {
      ui.myFeedback = [];
      if (ui.modal === "feedback") M.renderModalInto();
    });
  }

  function refreshAdminFeedback() {
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.isAdmin || !SYS.Cloud.fetchOpenFeedback) return;
    SYS.Cloud.fetchOpenFeedback().then((list) => {
      ui.adminFeedback = list;
      if (ui.page === "admin") M.renderPageInto();
    }).catch(() => {});
  }

  // A screenshot, made small enough to travel inside one document: at most
  // 1400px on its longer side as a JPEG, and smaller again until it fits.
  const SHOT_MAX_CHARS = 850000;
  function shrinkImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type || "")) { reject(new Error("not-image")); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        let side = 1400, quality = 0.75, out = "";
        for (let i = 0; i < 6; i++) {
          const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          out = canvas.toDataURL("image/jpeg", quality);
          if (out.length <= SHOT_MAX_CHARS) { resolve(out); return; }
          side = Math.round(side * 0.75);
          quality = Math.max(0.5, quality - 0.08);
        }
        reject(new Error("too-big"));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("not-image")); };
      img.src = url;
    });
  }

  function feedbackErrorText(err) {
    const code = err && err.details && err.details.code;
    if (code === "text") return SYS.t("feedback.errText");
    if (code === "too-many") return SYS.t("feedback.errTooMany");
    if (code === "shot") return SYS.t("feedback.errShot");
    return (err && err.message) || SYS.t("profile.saveFailed");
  }

  function refreshAdminReports() {
    if (!SYS.Cloud || !SYS.Cloud.available() || !ui.isAdmin || !SYS.Cloud.fetchOpenReports) return;
    SYS.Cloud.fetchOpenReports().then((list) => {
      ui.adminReports = list;
      if (ui.page === "admin") M.renderPageInto();
    }).catch(() => {});
  }

  Object.assign(M, { openProfile, refusalText, stopWatchingFriends, watchFriends, refreshFriendRows, loadAvatars, runFriendSearch, friendErrorText, INVITE_KEY, takePendingInvite, openFriendsTab, stopWatchingRaces, watchRaces, refreshRaceScores, raceErrorText, openCompare, refreshBlockedList, refreshBlocks, openDeleteAccount, deleteAccountNow, openAiReport, refreshAdminAiReports, openFeedback, refreshMyFeedback, refreshAdminFeedback, SHOT_MAX_CHARS, shrinkImage, feedbackErrorText, refreshAdminReports });
})(window.SYS = window.SYS || {});

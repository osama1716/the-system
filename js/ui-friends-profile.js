// UI: portraits and frames, the friends page, races, comparisons, profiles and account deletion.
// One of the files ui.js was split into; the names they share travel through SYS._ui.
(function (SYS) {
  "use strict";
  const U = SYS._ui || (SYS._ui = {});
  const { MEDALS, dateLocale, escapeHtml, icon, intArt, intName, pageIcon, renderPageHead, t } = U;

  // ---------- Friends (functions/friends.js) ----------

  // The other person in a friendship document.
  function otherOf(f, me) { return (f.users || []).find((u) => u !== me); }

  // Where this account stands with `uid`: none | sent | received | friends.
  function friendStatus(ui, uid) {
    const me = ui.cloudUser && ui.cloudUser.uid;
    const f = (ui.friendships || []).find((x) => otherOf(x, me) === uid);
    if (!f) return "none";
    if (f.status === "accepted") return "friends";
    return f.from === me ? "sent" : "received";
  }
  SYS.friendStatus = friendStatus;

  function weekExpOf(row) {
    return row && row.weekKey === SYS.currentWeekKey() ? Number(row.weekExp) || 0 : 0;
  }

  function friendName(ui, uid) {
    const row = (ui.friendRows || {})[uid];
    return row && row.displayName ? row.displayName : "…";
  }

  // The id this player shows: the one they chose, or the one their uid falls
  // on. Never nothing — see defaultAvatarFor in constants.js.
  function avatarOf(ui, uid) {
    const id = ((ui || {}).avatars || {})[uid];
    return (id && SYS.AVATARS[id]) ? id : SYS.defaultAvatarFor(uid);
  }

  // A portrait at the size the slot gives it. The width and height are set on
  // the tag as well as in CSS so the row does not reflow as the file arrives.
  function avatarImg(ui, uid, px, cls) {
    return portraitImg(avatarOf(ui, uid), px, cls, uid);
  }

  // Backgrounds that move: the still stays as the element's own background,
  // so it shows until the video's first frame (the same picture) is ready,
  // and it is all that shows for people who ask for reduced motion. Feathers
  // fall over the angel sky from js/feathers.js.
  const BG_VIDEOS = { angel: { feathers: true }, crystal: {} };
  function bgVideo(id) {
    if (!BG_VIDEOS[id] || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return "";
    return `<video class="bg-video" src="assets/backgrounds/${escapeHtml(id)}.mp4" autoplay muted loop playsinline aria-hidden="true"></video>` +
      (BG_VIDEOS[id].feathers ? `<canvas class="bg-video" data-feathers="${escapeHtml(id)}" aria-hidden="true"></canvas>` : "");
  }

  // The portrait with the frame its owner wears from the shop, animated, as
  // a canvas laid over it and larger than it (the art's opening is a little
  // over half its width). Not on the podium: the monument is the frame there.
  function framedAvatar(ui, uid, px) {
    const f = ((ui || {}).frames || {})[uid];
    const img = avatarImg(ui, uid, px);
    return f && SYS.SHOP.framePrices[f]
      ? `${img}<canvas class="av-frame" data-frame="${escapeHtml(f)}" width="1" height="1" aria-hidden="true"></canvas>`
      : img;
  }

  // A quest's or habit's icon as markup: its emoji, or the app's own mark.
  function taskIconHtml(task) {
    const i = SYS.taskIcon(task);
    return i ? escapeHtml(i) : SYS.TASK_MARK;
  }
  SYS.taskIconHtml = taskIconHtml;

  function portraitImg(id, px, cls, uid) {
    const safe = SYS.AVATARS[id] ? id : SYS.defaultAvatarFor(uid);
    return `<img class="av ${cls || ""}" src="${SYS.avatarSrc(safe, px)}"
      width="${px}" height="${px}" alt="" aria-hidden="true" loading="lazy" decoding="async" />`;
  }

  // One player as a row: avatar and name (opening the profile), their rank,
  // and whatever buttons belong on the right.
  function playerRow(ui, uid, name, row, actions) {
    const standing = row ? SYS.expToStanding(row.totalExp) : null;
    return `
      <div class="player-row">
        <button class="player-open" data-action="open-profile" data-uid="${escapeHtml(uid)}">
          <span class="player-avatar">${framedAvatar(ui, uid, 96)}</span>
          <span class="player-text">
            <span class="player-name">${escapeHtml(name || "…")}</span>
            ${standing ? `<span class="lb-meta">${t("lb.playerLine", { rank: escapeHtml(standing.rank), level: escapeHtml(standing.level) })}</span>` : ""}
          </span>
        </button>
        <div class="player-actions">${actions}</div>
      </div>`;
  }

  function friendActions(ui, uid) {
    const st = friendStatus(ui, uid);
    if (st === "friends") return `<span class="friend-tag">${icon("check", 12)} ${t("friends.areFriends")}</span>`;
    if (st === "sent") return `<button class="btn btn-outline btn-sm" data-action="friend-remove" data-uid="${escapeHtml(uid)}">${t("friends.requested")}</button>`;
    if (st === "received") return `<button class="btn btn-primary btn-sm" data-action="friend-respond" data-uid="${escapeHtml(uid)}" data-accept="1">${t("friends.accept")}</button>`;
    return `<button class="btn btn-primary btn-sm" data-action="friend-add-uid" data-uid="${escapeHtml(uid)}" ${ui.friendBusy ? "disabled" : ""}>${icon("plus", 12)} ${t("friends.add")}</button>`;
  }

  // The friends ranking, as the Friends tab of the Ranking page shows it.
  function renderFriendsRanking(state, ui) {
    const me = ui.cloudUser.uid;
    const friends = (ui.friendships || []).filter((f) => f.status === "accepted").map((f) => otherOf(f, me));
    const week = ui.friendsWeek;
    const score = (uid) => {
      const row = uid === me ? ui.myRow : (ui.friendRows || {})[uid];
      return week ? weekExpOf(row) : (row ? Number(row.totalExp) || 0 : 0);
    };
    const ranked = friends.concat(ui.myRow ? [me] : []).sort((a, b) => score(b) - score(a));
    const rows = ranked.map((uid, i) => {
      const row = uid === me ? ui.myRow : (ui.friendRows || {})[uid];
      const standing = row ? SYS.expToStanding(row.totalExp) : null;
      return `
        <button class="lb-row lb-row-btn ${uid === me ? "me" : ""}" data-action="open-profile" data-uid="${escapeHtml(uid)}">
          <span class="lb-pos ${i < 3 ? MEDALS[i] : ""}">${i + 1}</span>
          <span class="lb-face">${framedAvatar(ui, uid, 24)}</span>
          <span class="lb-player">
            <span class="lb-name">${escapeHtml(uid === me ? (row && row.displayName) || state.player.name : friendName(ui, uid))}${uid === me ? ` <span class="lb-you-tag">${t("lb.you")}</span>` : ""}</span>
            ${standing ? `<span class="lb-meta">${t("lb.playerLine", { rank: escapeHtml(standing.rank), level: escapeHtml(standing.level) })}</span>` : ""}
          </span>
          <span class="lb-total">${escapeHtml(score(uid))}</span>
        </button>`;
    }).join("");
    return `
      <div class="friends-rank-head">
        <span class="planner-tabs">
          <button class="chip filter-chip ${week ? "" : "active"}" data-action="friends-view" data-week="0" aria-pressed="${!week}">${t("friends.allTime")}</button>
          <button class="chip filter-chip ${week ? "active" : ""}" data-action="friends-view" data-week="1" aria-pressed="${!!week}">${t("friends.thisWeek")}</button>
        </span>
        <button class="link-btn" data-action="nav" data-page="friends">${t("friends.manage")}</button>
      </div>
      ${friends.length ? rows : `<div class="empty-note">${t("friends.noneRanking")}</div>`}`;
  }

  // The Friends section: find people, answer requests, the friends, and — at
  // the side on a wide screen, at the foot on a phone — the blocked list.
  // How the two of you have done against each other, from the races both
  // sides can see. Kept out of the profile's own record, which is everybody.
  function headToHead(ui, uid) {
    const me = ui.cloudUser && ui.cloudUser.uid;
    let won = 0, lost = 0, tied = 0;
    (ui.races || []).forEach((r) => {
      if (r.status !== "done" || !r.users || r.users.indexOf(uid) < 0) return;
      if (r.winner == null) tied++;
      else if (r.winner === me) won++;
      else lost++;
    });
    return { won, lost, tied, any: won + lost + tied > 0 };
  }

  // One friend, with everything worth knowing before pressing anything: who
  // they are, where they stand, this week between you, and your record.
  function friendCard(state, ui, uid) {
    const me = ui.cloudUser.uid;
    const row = (ui.friendRows || {})[uid];
    const standing = row ? SYS.expToStanding(row.totalExp) : null;
    const theirWeek = weekExpOf(row);
    const myWeek = weekExpOf(ui.myRow);
    const h = headToHead(ui, uid);
    const racing = (ui.races || []).some((r) => r.status === "active" && r.users && r.users.indexOf(uid) >= 0);
    return `
      <div class="friend-card">
        <button class="player-open" data-action="open-profile" data-uid="${escapeHtml(uid)}">
          <span class="player-avatar">${framedAvatar(ui, uid, 96)}</span>
          <span class="player-text">
            <span class="player-name">${escapeHtml(friendName(ui, uid))}</span>
            ${standing ? `<span class="lb-meta">${t("lb.playerLine", { rank: escapeHtml(standing.rank), level: escapeHtml(standing.level) })} · ${escapeHtml(row.totalExp)} xp</span>` : ""}
          </span>
        </button>
        <div class="friend-facts">
          ${row ? `<span class="friend-fact ${theirWeek > myWeek ? "behind" : theirWeek < myWeek ? "ahead" : ""}">${t("friends.weekLine", { mine: myWeek, theirs: theirWeek })}</span>` : ""}
          ${h.any ? `<span class="friend-fact">${t("friends.record", { w: h.won, l: h.lost })}${h.tied ? " · " + t("friends.ties", { n: h.tied }) : ""}</span>` : ""}
          ${racing ? `<span class="friend-fact racing">${icon("zap", 10)} ${t("friends.racingNow")}</span>` : ""}
        </div>
        <div class="player-actions">
          <button class="btn btn-primary btn-sm" data-action="race-open-form" data-uid="${escapeHtml(uid)}" ${racing ? "disabled" : ""}>${t("races.challengeShort")}</button>
          <button class="btn btn-outline btn-sm" data-action="open-compare" data-uid="${escapeHtml(uid)}">${t("friends.compare")}</button>
        </div>
      </div>`;
  }

  function renderFriendsPage(state, ui) {
    const header = renderPageHead("friends");
    if (!ui.cloudUser) {
      return header + `
        <div class="sys-panel panel-pad">
          <div class="empty-hero">
            ${pageIcon("friends")}
            <div class="empty-hero-text">${t("friends.signedOut")}</div>
            <button class="btn btn-primary" data-action="open-settings">${t("account.signIn")}</button>
          </div>
        </div>`;
    }
    const me = ui.cloudUser.uid;
    const list = ui.friendships || [];
    const received = list.filter((f) => f.status === "pending" && f.to === me).map((f) => otherOf(f, me));
    const sent = list.filter((f) => f.status === "pending" && f.from === me).map((f) => otherOf(f, me));
    const byName = (a, b) => friendName(ui, a).localeCompare(friendName(ui, b));
    const expOf = (uid) => { const r = (ui.friendRows || {})[uid]; return r ? Number(r.totalExp) || 0 : -1; };
    const sortMode = ui.friendSort === "name" ? "name" : "exp";
    const friends = list.filter((f) => f.status === "accepted").map((f) => otherOf(f, me))
      .sort(sortMode === "name" ? byName : (a, b) => expOf(b) - expOf(a) || byName(a, b));
    const rowOf = (uid) => (ui.friendRows || {})[uid] || (ui.searchRows || {})[uid];

    // Anything waiting on a decision comes first; the rest of the page is
    // there whenever you want it, this is not.
    const requests = received.length || sent.length ? `
      <div class="sys-panel panel-pad">
        ${received.length ? `<div class="planner-section" style="margin-top:0;">${t("friends.requests")} · ${received.length}</div>
          ${received.map((uid) => playerRow(ui, uid, friendName(ui, uid), rowOf(uid), `
            <button class="btn btn-primary btn-sm" data-action="friend-respond" data-uid="${escapeHtml(uid)}" data-accept="1">${t("friends.accept")}</button>
            <button class="btn btn-outline btn-sm" data-action="friend-respond" data-uid="${escapeHtml(uid)}" data-accept="0">${t("friends.decline")}</button>`)).join("")}` : ""}
        ${sent.length ? `<div class="planner-section" ${received.length ? "" : `style="margin-top:0;"`}>${t("friends.sent")} · ${sent.length}</div>
          ${sent.map((uid) => playerRow(ui, uid, friendName(ui, uid), rowOf(uid), `
            <button class="btn btn-ghost btn-sm" data-action="friend-remove" data-uid="${escapeHtml(uid)}">${t("friends.cancel")}</button>`)).join("")}` : ""}
      </div>` : "";

    const results = ui.friendResults;
    const search = `
      <div class="sys-panel panel-pad">
        <div class="friend-add">
          <input class="field-input" id="friend-search" data-bind="friendSearch" value="${escapeHtml(ui.friendSearch || "")}" placeholder="${t("friends.searchPlaceholder")}" aria-label="${t("friends.searchPlaceholder")}" autocomplete="off" />
          <button class="btn btn-primary" data-action="friend-search" ${ui.friendSearchBusy ? "disabled" : ""}>${t("friends.search")}</button>
        </div>
        ${results ? (results.length
          ? `<div class="search-results">${results.map((r) => playerRow(ui, r.uid, r.name, rowOf(r.uid), friendActions(ui, r.uid))).join("")}</div>`
          : `<div class="search-none">
               <div class="empty-note" style="padding:8px 4px;">${t("friends.noResults")}</div>
               <button class="btn btn-outline btn-sm btn-icon-inline" data-action="friend-invite" ${ui.inviteBusy ? "disabled" : ""}>${icon("upload", 12)} ${t("friends.inviteInstead")}</button>
             </div>`) : ""}
        <div class="btn-row" style="margin-top:12px;flex-wrap:wrap;">
          <button class="btn btn-outline btn-icon-inline" data-action="friend-invite" ${ui.inviteBusy ? "disabled" : ""}>${icon("plus", 13)} ${t("friends.inviteLink")}</button>
        </div>
        ${ui.inviteLink ? `<div class="invite-box">
            <div class="invite-row">
              <input class="field-input" readonly value="${escapeHtml(ui.inviteLink)}" aria-label="${t("friends.inviteLink")}" />
              <button class="btn btn-primary btn-sm" data-action="copy-invite">${t("friends.copy")}</button>
            </div>
            <div class="form-hint">${t("friends.inviteHint")} · ${t("friends.inviteDays")}</div>
          </div>` : ""}
      </div>`;

    const friendList = `
      <div class="sys-panel panel-pad friends-list-panel">
        <div class="friends-rank-head" style="margin-bottom:4px;">
          <span class="planner-section" style="margin:0;">${t("friends.list")} · ${friends.length}</span>
          ${friends.length > 1 ? `<span class="planner-tabs">
            <button class="chip filter-chip ${sortMode === "exp" ? "active" : ""}" data-action="friend-sort" data-sort="exp" aria-pressed="${sortMode === "exp"}">${t("friends.sortExp")}</button>
            <button class="chip filter-chip ${sortMode === "name" ? "active" : ""}" data-action="friend-sort" data-sort="name" aria-pressed="${sortMode === "name"}">${t("friends.sortName")}</button>
          </span>` : ""}
        </div>
        ${friends.length
          ? friends.map((uid) => friendCard(state, ui, uid)).join("")
          : `<div class="empty-hero">
               ${pageIcon("friends")}
               <div class="empty-hero-text">${t("friends.none")}</div>
               <div class="btn-row" style="justify-content:center;">
                 <button class="btn btn-primary btn-icon-inline" data-action="friend-focus-search">${icon("users", 13)} ${t("friends.findPlayer")}</button>
                 <button class="btn btn-outline btn-icon-inline" data-action="friend-invite" ${ui.inviteBusy ? "disabled" : ""}>${icon("upload", 13)} ${t("friends.inviteLink")}</button>
               </div>
             </div>`}
      </div>`;

    const blocked = `<div class="sys-panel panel-pad">${U.renderBlockedList(ui)}</div>`;
    return header + `
      <div class="friends-layout">
        <div class="friends-main">${requests}${search}${renderRacesPanel(state, ui)}${friendList}
          <details class="blocked-fold">
            <summary>${t("blocks.title")}${(ui.blockedList || []).length ? " · " + (ui.blockedList || []).length : ""}</summary>
            ${blocked}
          </details>
        </div>
        <aside class="friends-side">${blocked}</aside>
      </div>`;
  }
  SYS.renderFriendsPage = renderFriendsPage;

  // ---------- Weekly races (functions/races.js) ----------

  function metricLabel(state, metric) {
    if (metric === "total") return t("races.total");
    const type = (state.intTypes || []).find((x) => x.key === metric);
    if (!type) return metric;
    return intName(type);
  }

  function timeLeft(endMs) {
    const ms = Math.max(0, endMs - Date.now());
    const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24;
    return d > 0 ? t("races.leftDays", { d, h }) : t("races.leftHours", { h: Math.max(1, h) });
  }

  function renderRacesPanel(state, ui) {
    const me = ui.cloudUser.uid;
    const races = ui.races || [];
    const other = (r) => r.users.find((u) => u !== me);
    const incoming = races.filter((r) => r.status === "pending" && r.opponent === me);
    const outgoing = races.filter((r) => r.status === "pending" && r.challenger === me);
    const active = races.filter((r) => r.status === "active");
    const done = races.filter((r) => r.status === "done")
      .sort((a, b) => (b.endAt && b.endAt.toMillis ? b.endAt.toMillis() : 0) - (a.endAt && a.endAt.toMillis ? a.endAt.toMillis() : 0))
      .slice(0, 5);
    if (!races.some((r) => ["pending", "active", "done"].indexOf(r.status) >= 0)) {
      return `
        <div class="sys-panel panel-pad races-panel">
          <div class="planner-section" style="margin-top:0;">${t("races.title")}</div>
          <div class="form-hint">${t("races.empty")}</div>
        </div>`;
    }
    const activeRows = active.map((r) => {
      const them = other(r);
      const s = (ui.raceScores || {})[r.id];
      const mine = s ? Number(s[me]) || 0 : null, theirs = s ? Number(s[them]) || 0 : null;
      const share = s && (mine + theirs) > 0 ? Math.round(Math.max(0, mine) / Math.max(1, Math.max(0, mine) + Math.max(0, theirs)) * 100) : 50;
      return `
        <div class="race-card">
          <div class="race-head">
            <button class="friend-name" data-action="open-profile" data-uid="${escapeHtml(them)}">${t("races.vs", { name: escapeHtml(friendName(ui, them)) })}</button>
            <span class="race-metric">${escapeHtml(metricLabel(state, r.metric))}</span>
          </div>
          <div class="race-score">
            <span class="race-me">${t("lb.you")} <b>${mine == null ? "…" : escapeHtml(mine)}</b></span>
            <span class="race-them"><b>${theirs == null ? "…" : escapeHtml(theirs)}</b> ${escapeHtml(friendName(ui, them))}</span>
          </div>
          <div class="race-bar"><div class="race-bar-me" style="width:${share}%;"></div></div>
          <div class="race-foot">${r.endAt && r.endAt.toMillis ? escapeHtml(timeLeft(r.endAt.toMillis())) : ""}</div>
        </div>`;
    }).join("");
    const row = (r, text, actions) => `
      <div class="player-row">
        <div class="race-line"><span>${text}</span><span class="race-metric">${escapeHtml(metricLabel(state, r.metric))}</span></div>
        <div class="player-actions">${actions}</div>
      </div>`;
    return `
      <div class="sys-panel panel-pad races-panel">
        <div class="friends-rank-head" style="margin-bottom:6px;">
          <span class="planner-section" style="margin:0;">${t("races.title")}</span>
          ${active.length ? `<button class="link-btn" data-action="race-refresh" ${ui.raceScoresBusy ? "disabled" : ""}>${t("lb.refresh")}</button>` : ""}
        </div>
        ${incoming.map((r) => row(r, t("races.challengedYou", { name: escapeHtml(friendName(ui, r.challenger)) }), `
          <button class="btn btn-primary btn-sm" data-action="race-respond" data-id="${escapeHtml(r.id)}" data-accept="1">${t("races.accept")}</button>
          <button class="btn btn-outline btn-sm" data-action="race-respond" data-id="${escapeHtml(r.id)}" data-accept="0">${t("friends.decline")}</button>`)).join("")}
        ${activeRows}
        ${outgoing.map((r) => row(r, t("races.waiting", { name: escapeHtml(friendName(ui, r.opponent)) }), `
          <button class="btn btn-ghost btn-sm" data-action="race-cancel" data-id="${escapeHtml(r.id)}">${t("friends.cancel")}</button>`)).join("")}
        ${done.length ? `<div class="planner-section">${t("races.recent")}</div>` : ""}
        ${done.map((r) => {
          const them = other(r);
          const sc = r.scores || {};
          const result = r.winner == null ? t("races.tie") : r.winner === me ? t("races.won") : t("races.lost");
          return row(r, `<b class="race-result ${r.winner == null ? "" : r.winner === me ? "won" : "lost"}">${result}</b> ${t("races.vs", { name: escapeHtml(friendName(ui, them)) })} · ${escapeHtml(Number(sc[me]) || 0)} – ${escapeHtml(Number(sc[them]) || 0)}`, "");
        }).join("")}
      </div>`;
  }

  function renderRaceForm(state, ui) {
    const f = ui.raceForm;
    if (!f) return "";
    const close = `<button class="wk-arrow" data-action="close-modal" aria-label="${t("event.close")}">${icon("x", 15)}</button>`;
    const metrics = ["total"].concat((state.intTypes || []).map((x) => x.key));
    return `
      <div class="modal-backdrop" data-action="close-modal-backdrop">
        <div class="sys-panel modal-box profile-box" data-stop-close="1" role="dialog" aria-label="${t("races.challenge")}">
          <div class="day-head"><span class="day-head-pad"></span><div class="time-title">${t("races.challenge")}</div>${close}</div>
          <div class="carry-body">${t("races.formBody", { name: escapeHtml(friendName(ui, f.uid)) })}</div>
          <div class="field-label" style="margin-top:12px;">${t("races.on")}</div>
          <div class="planner-tabs race-metrics">
            ${metrics.map((m) => `<button type="button" class="chip filter-chip ${f.metric === m ? "active" : ""}" data-action="race-metric" data-metric="${escapeHtml(m)}" aria-pressed="${f.metric === m}">${escapeHtml(metricLabel(state, m))}</button>`).join("")}
          </div>
          ${f.metric !== "total" ? `<div class="form-hint" style="line-height:1.5;">${t("races.categoryHint")}</div>` : ""}
          <div class="btn-row" style="margin-top:16px;">
            <button class="btn btn-primary" data-action="race-send" ${f.busy ? "disabled" : ""}>${t("races.send")}</button>
            <button class="btn btn-outline" data-action="close-modal">${t("event.cancel")}</button>
          </div>
        </div>
      </div>`;
  }

  // Two intelligence maps on one chart, and who is ahead in each.
  function renderCompareModal(state, ui) {
    const c = ui.compare;
    const close = `<button class="wk-arrow" data-action="close-modal" aria-label="${t("event.close")}">${icon("x", 15)}</button>`;
    const head = `<div class="day-head"><span class="day-head-pad"></span><div class="time-title">${t("friends.compare")}</div>${close}</div>`;
    const shell = (inner) => `
      <div class="modal-backdrop" data-action="close-modal-backdrop">
        <div class="sys-panel modal-box profile-box" data-stop-close="1" role="dialog" aria-label="${t("friends.compare")}">${head}${inner}</div>
      </div>`;
    if (!c || !c.them) return shell(c && c.error ? `<div class="toast-error">${escapeHtml(c.error)}</div>` : `<div class="empty-note">${t("lb.loading")}</div>`);
    if (c.them.blockedBy) return shell(`<div class="empty-note blocked-note">${t("friends.blockedBy", { name: escapeHtml((c.them.row && c.them.row.displayName) || "—") })}</div>`);
    const mine = (c.me && c.me.profile && c.me.profile.categories) || [];
    const theirs = (c.them.profile && c.them.profile.categories) || [];
    const keys = mine.map((x) => x.key).filter((k) => theirs.some((y) => y.key === k));
    if (keys.length < 3) return shell(`<div class="empty-note">${t("friends.compareEmpty")}</div>`);
    // `score` since the sum replaced the average; `avg` on profiles older than that.
    const val = (list, k) => { const c = list.find((x) => x.key === k) || {}; return Number(c.score != null ? c.score : c.avg) || 0; };
    const short = (k) => (mine.find((x) => x.key === k) || {}).short || k;
    const size = 260, cx = 130, cy = 130, R = 90, n = keys.length;
    const maxVal = Math.max(5, ...keys.map((k) => Math.max(val(mine, k), val(theirs, k)))) + 3;
    const ang = (i) => -Math.PI / 2 + i * (2 * Math.PI / n);
    const pts = (list) => keys.map((k, i) => { const r = R * Math.min(1, val(list, k) / maxVal); return (cx + r * Math.cos(ang(i))).toFixed(1) + "," + (cy + r * Math.sin(ang(i))).toFixed(1); }).join(" ");
    let svg = `<svg viewBox="0 0 ${size} ${size}" width="100%" height="100%" role="img" aria-label="${t("friends.compare")}">`;
    for (let ring = 1; ring <= 4; ring++) {
      svg += `<polygon fill="none" stroke="var(--border)" stroke-width="1" points="${keys.map((k, i) => (cx + R * ring / 4 * Math.cos(ang(i))).toFixed(1) + "," + (cy + R * ring / 4 * Math.sin(ang(i))).toFixed(1)).join(" ")}"/>`;
    }
    keys.forEach((k, i) => {
      svg += `<text x="${(cx + (R + 18) * Math.cos(ang(i))).toFixed(1)}" y="${(cy + (R + 18) * Math.sin(ang(i))).toFixed(1)}" font-family="IBM Plex Mono, monospace" font-size="10.5" style="fill:var(--dim)" text-anchor="middle" dominant-baseline="middle">${escapeHtml(short(k))}</text>`;
    });
    svg += `<polygon fill="var(--rust-soft, rgba(180,84,74,.18))" stroke="var(--rust)" stroke-width="2" points="${pts(theirs)}"/>`;
    svg += `<polygon fill="var(--gold-soft)" stroke="var(--gold)" stroke-width="2" points="${pts(mine)}"/></svg>`;
    const myName = (c.me && c.me.row && c.me.row.displayName) || state.player.name;
    const theirName = (c.them.row && c.them.row.displayName) || "—";
    const rows = keys.map((k) => {
      const a = val(mine, k), b = val(theirs, k);
      return `<div class="cmp-row"><span class="cmp-cat">${escapeHtml(short(k))}</span><span class="cmp-val ${a > b ? "win" : ""}">${a}</span><span class="cmp-val ${b > a ? "win them" : ""}">${b}</span></div>`;
    }).join("");
    return shell(`
      <div class="cmp-legend"><span class="cmp-dot me"></span>${escapeHtml(myName)} <span class="cmp-dot them"></span>${escapeHtml(theirName)}</div>
      <div class="profile-radar">${svg}</div>
      <div class="cmp-table">
        <div class="cmp-row cmp-head"><span class="cmp-cat"></span><span class="cmp-val">${escapeHtml(myName)}</span><span class="cmp-val">${escapeHtml(theirName)}</span></div>
        ${rows}
      </div>`);
  }

  // ---------- Public profile ----------
  //
  // Two public documents read together (see functions/profile.js): the
  // ranking row for the name and the journal's EXP, and profiles/{uid} for
  // the avatar, bio, intelligences and join date.
  // The same emblems, for a profile that is not this device's. Its categories
  // arrive already scored from the server, so the bar is read off those rather
  // than off any local state — and a profile written before `score` existed
  // falls back to the old field the way the radar does.
  function profileWorn(p, px) {
    const cats = Array.isArray(p && p.categories) ? p.categories : [];
    const earned = cats
      .map((c) => ({ key: c.key, short: c.short, score: Number(c.score != null ? c.score : c.avg) || 0 }))
      .filter((c) => c.score >= (SYS.CATEGORY_EMBLEM_AT || Infinity))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    if (!earned.length) return "";
    return `<span class="worn-emblems" title="${escapeHtml(t("intel.worn"))}">${earned.map((c) => intArt(c, px, "worn-emblem")).join("")}</span>`;
  }

  function profileAvatar(uid, id, px) {
    return portraitImg(id, px || 192, "", uid);
  }

  function renderProfileModal(state, ui) {
    const uid = ui.profileUid;
    if (!uid) return "";
    const me = !!ui.cloudUser && ui.cloudUser.uid === uid;
    const data = ui.profile;
    const close = `<button class="wk-arrow" data-action="close-modal" aria-label="${t("event.close")}">${icon("x", 15)}</button>`;
    // Set below once the profile has loaded; while editing it follows the
    // picks, so the card shows the look before it is saved.
    let bgNow = null;
    const shell = (inner) => {
      const bg = bgNow;
      return `
      <div class="modal-backdrop" data-action="close-modal-backdrop">
        <div class="sys-panel modal-box profile-box ${bg ? "profile-box-bg" : ""}" data-stop-close="1" role="dialog" aria-label="${t("profile.title")}">
          ${bg ? `<div class="profile-bg" style="background-image:url('assets/backgrounds/${escapeHtml(bg)}.jpg')" aria-hidden="true">${bgVideo(bg)}</div>` : ""}
          ${inner}
        </div>
      </div>`;
    };
    if (ui.profileError) return shell(`<div class="day-head"><span class="day-head-pad"></span><div class="time-title">${t("profile.title")}</div>${close}</div><div class="toast-error">${escapeHtml(ui.profileError)}</div>`);
    if (!data) return shell(`<div class="day-head"><span class="day-head-pad"></span><div class="time-title">${t("profile.title")}</div>${close}</div><div class="empty-note">${t("lb.loading")}</div>`);

    const p = data.profile || {};
    const row = data.row;
    if (data.blockedBy) {
      return shell(`<div class="day-head"><span class="day-head-pad"></span><div class="time-title">${t("profile.title")}</div>${close}</div>
        <div class="empty-note blocked-note">${t("friends.blockedBy", { name: escapeHtml((row && row.displayName) || "—") })}</div>`);
    }
    const standing = row ? SYS.expToStanding(row.totalExp) : null;
    const edit = me && ui.profileEdit;
    const report = !me && ui.profileReport;
    const blocked = !me && ui.blocks && ui.blocks.has(uid);

    const cats = Array.isArray(p.categories) ? p.categories : [];
    const radar = cats.length >= 3
      ? SYS.buildRadarSVG(cats.map((c) => ({ key: c.key, short: c.short })), Object.fromEntries(cats.map((c) => [c.key, { traits: [{ level: Number(c.score != null ? c.score : c.avg) || 0 }] }])))
      : "";
    const traitName = (x) => SYS.traitName(x);
    const joined = p.joinedAt && p.joinedAt.toDate ? p.joinedAt.toDate().toLocaleDateString(dateLocale(), { month: "long", year: "numeric" }) : null;

    // A frame or a background bought from the shop (profiles/{uid}.worn,
    // written by the server only for what the wallet holds). Either one
    // turns the head into the large, centred portrait the art needs.
    const worn = edit ? { frame: ui.profileEdit.frame, background: ui.profileEdit.background } : (p.worn || {});
    const frameId = worn.frame && SYS.SHOP.framePrices[worn.frame] ? worn.frame : null;
    const bgId = worn.background && (SYS.SHOP.backgroundPrices || {})[worn.background] ? worn.background : null;
    bgNow = bgId;
    const big = !!(frameId || bgId);
    const head = big ? `
      <div class="profile-head profile-head-big">
        ${standing ? `<span class="profile-rank">${SYS.rankArt(standing.rank, 52)}</span>` : "<span></span>"}
        ${close}
        <div class="profile-portrait ${frameId ? "has-frame" : ""}">
          <span class="profile-portrait-face">${profileAvatar(uid, edit ? ui.profileEdit.avatar : p.avatar, 256)}</span>
          ${frameId ? `<canvas class="profile-portrait-frame" data-frame="${escapeHtml(frameId)}" width="1" height="1" aria-hidden="true"></canvas>` : ""}
        </div>
        <div class="profile-id">
          <div class="profile-name">${escapeHtml(row ? row.displayName : (me ? state.player.name : "—"))}${me ? ` <span class="lb-you-tag">${t("lb.you")}</span>` : ""}</div>
          ${profileWorn(p, 18)}
          ${standing ? `<div class="profile-sub">${escapeHtml(t("lb.playerLine", { rank: standing.rank, level: standing.level }))}</div>` : ""}
        </div>
      </div>` : `
      <div class="profile-head">
        <div class="profile-avatar">${profileAvatar(uid, edit ? ui.profileEdit.avatar : p.avatar, 192)}</div>
        <div class="profile-id">
          <div class="profile-name">${escapeHtml(row ? row.displayName : (me ? state.player.name : "—"))}${me ? ` <span class="lb-you-tag">${t("lb.you")}</span>` : ""}</div>
          ${profileWorn(p, 18)}
          ${standing ? `<div class="profile-sub">${escapeHtml(t("lb.playerLine", { rank: standing.rank, level: standing.level }))}</div>` : ""}
        </div>
        ${standing ? `<span class="profile-rank">${SYS.rankArt(standing.rank, 62)}</span>` : ""}
        ${close}
      </div>`;

    // What can be put on: what the wallet holds, or anything for the admin.
    // Nothing to choose from, no row.
    const wearPicker = (kind, current) => {
      const catalogue = kind === "frame" ? SYS.SHOP.framePrices : (SYS.SHOP.backgroundPrices || {});
      const owned = ((ui.wallet || {})[kind === "frame" ? "frames" : "backgrounds"]) || [];
      const ids = Object.keys(catalogue).filter((id) => ui.isAdmin || owned.indexOf(id) >= 0);
      if (!ids.length) return "";
      const thumb = (id) => kind === "frame"
        ? `<img src="assets/frames/aurenite-${escapeHtml(id)}-128.webp" alt="" width="40" height="40">`
        : `<span class="wear-bg-thumb" style="background-image:url('assets/backgrounds/${escapeHtml(id)}.jpg')"></span>`;
      const pick = (id) => `<button type="button" class="wear-pick ${(current || null) === id ? "on" : ""}" data-action="profile-wear" data-kind="${kind}" data-id="${id ? escapeHtml(id) : ""}" aria-pressed="${(current || null) === id}">${id ? thumb(id) : `<span class="wear-none">${t("profile.none")}</span>`}</button>`;
      return `
        <div class="field-label" style="margin-top:14px;">${t(kind === "frame" ? "profile.frame" : "profile.background")}</div>
        <div class="wear-grid">${pick(null)}${ids.map(pick).join("")}</div>`;
    };

    if (edit) {
      const e = ui.profileEdit;
      const bio = e.bio || "";
      return shell(`${head}
        <div class="field-label" style="margin-top:14px;">${t("profile.avatar")}</div>
        <div class="avatar-grid">
          ${Object.keys(SYS.AVATARS).map((id) => `<button type="button" class="avatar-pick ${e.avatar === id ? "on" : ""}" data-action="profile-avatar" data-id="${id}" aria-pressed="${e.avatar === id}" aria-label="${escapeHtml(SYS.AVATARS[id])}">${portraitImg(id, 64)}</button>`).join("")}
        </div>
        ${wearPicker("frame", e.frame)}
        ${wearPicker("background", e.background)}
        <label class="field-label" for="profile-bio" style="margin-top:14px;">${t("profile.bio")}</label>
        <textarea id="profile-bio" class="field-textarea" rows="2" maxlength="${SYS.PROFILE_BIO_MAX}" data-bind="profileEdit.bio" placeholder="${t("profile.bioPlaceholder")}">${escapeHtml(bio)}</textarea>
        <div class="form-hint">${t("profile.bioHint", { n: SYS.PROFILE_BIO_MAX })}</div>
        ${e.error ? `<div class="toast-error" style="margin-top:10px;">${escapeHtml(e.error)}</div>` : ""}
        <div class="btn-row" style="margin-top:14px;">
          <button class="btn btn-primary" data-action="profile-save" ${e.busy ? "disabled" : ""}>${e.busy ? t("profile.checking") : t("event.save")}</button>
          <button class="btn btn-outline" data-action="profile-edit-cancel" ${e.busy ? "disabled" : ""}>${t("event.cancel")}</button>
        </div>`);
    }

    const stats = `
      <div class="profile-stats">
        <div class="stat-tile"><div class="stat-num">${row ? escapeHtml(row.totalExp) : "—"}</div><div class="stat-label">${t("profile.totalExp")}</div></div>
        <div class="stat-tile"><div class="stat-num">${row && !row.hidden && ui.profileRank ? "#" + escapeHtml(ui.profileRank) : "—"}</div><div class="stat-label">${t("profile.worldRank")}</div></div>
      </div>`;

    const reportForm = report ? `
      <div class="profile-report">
        <div class="field-label">${t("profile.reportWhy")}</div>
        <div class="planner-tabs">
          ${["name", "bio", "cheating", "other"].map((r) => `<button type="button" class="chip filter-chip ${ui.profileReport.reason === r ? "active" : ""}" data-action="report-reason" data-reason="${r}" aria-pressed="${ui.profileReport.reason === r}">${t({ name: "profile.reportName", bio: "profile.reportBio", cheating: "profile.reportCheating", other: "profile.reportOther" }[r])}</button>`).join("")}
        </div>
        <input class="field-input" style="margin-top:10px;" maxlength="200" data-bind="profileReport.note" value="${escapeHtml(ui.profileReport.note || "")}" placeholder="${t("profile.reportNote")}" aria-label="${t("profile.reportNote")}" />
        ${ui.profileReport.error ? `<div class="toast-error" style="margin-top:10px;">${escapeHtml(ui.profileReport.error)}</div>` : ""}
        <div class="btn-row" style="margin-top:12px;">
          <button class="btn btn-primary" data-action="report-send" ${!ui.profileReport.reason || ui.profileReport.busy ? "disabled" : ""}>${t("profile.reportSend")}</button>
          <button class="btn btn-outline" data-action="report-cancel">${t("event.cancel")}</button>
        </div>
      </div>` : "";

    return shell(`${head}
      ${p.bio ? `<div class="profile-bio">${escapeHtml(p.bio)}</div>` : ""}
      ${!row ? `<div class="form-hint" style="margin-top:10px;">${me ? t("name.unclaimed") : t("profile.notRanked")}</div>` : ""}
      ${stats}
      ${radar ? `<div class="profile-radar">${radar}</div>` : ""}
      ${p.topTraits && p.topTraits.length ? `
        <div class="field-label" style="margin-top:12px;">${t("profile.topTraits")}</div>
        <div class="profile-traits">${p.topTraits.map((x) => `<span class="profile-trait"><b>${escapeHtml(traitName(x))}</b> <span>${escapeHtml(x.short)} · ${escapeHtml(x.level)}</span></span>`).join("")}</div>` : ""}
      ${(p.raceWins || p.raceLosses || p.raceTies) ? `<div class="profile-record">${icon("trophy", 13)} ${t("races.record", { w: escapeHtml(p.raceWins || 0), l: escapeHtml(p.raceLosses || 0), t: escapeHtml(p.raceTies || 0) })}</div>` : ""}
      ${joined ? `<div class="form-hint" style="margin-top:12px;">${t("profile.joined", { date: escapeHtml(joined) })}</div>` : ""}
      ${reportForm}
      ${ui.profileReportSent ? `<div class="form-hint" style="color:var(--gold-text);margin-top:10px;">${t("profile.reportThanks")}</div>` : ""}
      <div class="btn-row profile-actions">
        ${me ? `<button class="btn btn-primary" data-action="profile-edit">${icon("pencil", 13)} ${t("profile.edit")}</button>` : `
          ${blocked || !row ? "" : (() => {
            const st = friendStatus(ui, uid);
            const armed = !!ui.armed && ui.armed.kind === "task" && ui.armed.id === "friend:" + uid;
            if (st === "friends") return `<button class="btn btn-primary" data-action="race-open-form" data-uid="${escapeHtml(uid)}">${t("races.challengeShort")}</button>
              <span class="friend-tag">${icon("check", 12)} ${t("friends.areFriends")}</span>
              <button class="btn btn-ghost btn-sm ${armed ? "danger-arm" : ""}" data-action="friend-remove-armed" data-id="friend:${escapeHtml(uid)}" data-uid="${escapeHtml(uid)}">${armed ? t("intel.confirmAgain") : t("friends.remove")}</button>`;
            if (st === "sent") return `<button class="btn btn-outline" data-action="friend-remove" data-uid="${escapeHtml(uid)}">${t("friends.requested")}</button>`;
            if (st === "received") return `<button class="btn btn-primary" data-action="friend-respond" data-uid="${escapeHtml(uid)}" data-accept="1">${t("friends.accept")}</button>`;
            return `<button class="btn btn-primary" data-action="friend-add-uid" data-uid="${escapeHtml(uid)}" ${ui.friendBusy ? "disabled" : ""}>${icon("plus", 13)} ${t("friends.add")}</button>`;
          })()}
          ${row ? `<button class="btn btn-outline" data-action="open-compare" data-uid="${escapeHtml(uid)}">${t("friends.compare")}</button>` : ""}
          ${report ? "" : `<button class="btn btn-outline" data-action="profile-report">${icon("flag", 13)} ${t("profile.report")}</button>`}
          <button class="btn btn-outline ${blocked ? "" : "btn-ghost"}" data-action="profile-block" ${ui.profileBlockBusy ? "disabled" : ""}>${blocked ? t("profile.unblock") : t("profile.block")}</button>`}
      </div>`);
  }

  // ---------- Deleting the account ----------

  function renderDeleteAccountModal(ui) {
    const d = ui.deleteAccount;
    if (!d) return "";
    const close = `<button class="wk-arrow" data-action="close-modal" aria-label="${t("event.close")}" ${d.busy ? "disabled" : ""}>${icon("x", 15)}</button>`;
    const word = t("delete.word");
    const body = !ui.cloudUser ? `
      <div class="carry-body">${t("delete.signInFirst")}</div>
      <div class="btn-row" style="margin-top:14px;">
        <button class="btn btn-primary" data-action="open-settings">${t("nav.settings")}</button>
      </div>` : `
      <div class="carry-body">${t("delete.intro", { email: escapeHtml(ui.cloudUser.email || "") })}</div>
      <ul class="delete-list">
        <li>${t("delete.itemProgress")}</li>
        <li>${t("delete.itemPublic")}</li>
        <li>${t("delete.itemSocial")}</li>
        <li>${t("delete.itemMessages")}</li>
        <li>${t("delete.itemSignIn")}</li>
      </ul>
      <div class="delete-warn">${icon("shield", 13)} ${t("delete.cannotUndo")}</div>
      <div class="field-label" style="margin-top:12px;">${t("delete.typeToConfirm", { word: escapeHtml(word) })}</div>
      <input id="delete-confirm-input" class="field-input" autocomplete="off" autocapitalize="off" spellcheck="false" data-bind="deleteAccount.typed" value="${escapeHtml(d.typed || "")}" aria-label="${t("delete.typeToConfirm", { word: escapeHtml(word) })}" ${d.busy ? "disabled" : ""} />
      ${d.error ? `<div class="toast-error" style="margin-top:10px;">${escapeHtml(d.error)}</div>` : ""}
      <div class="btn-row" style="margin-top:14px;flex-wrap:wrap;">
        <button class="btn btn-danger-outline" data-action="delete-account-confirm" ${d.busy ? "disabled" : ""}>${t(d.busy ? "delete.deleting" : "delete.confirm")}</button>
        <button class="btn btn-outline" data-action="close-modal" ${d.busy ? "disabled" : ""}>${t("form.cancel")}</button>
      </div>`;
    return `
      <div class="modal-backdrop" ${d.busy ? "" : `data-action="close-modal-backdrop"`}>
        <div class="sys-panel modal-box profile-box" data-stop-close="1" role="dialog" aria-label="${t("delete.title")}">
          <div class="day-head"><span class="day-head-pad"></span><div class="time-title">${t("delete.title")}</div>${close}</div>
          ${body}
        </div>
      </div>`;
  }

  Object.assign(U, { otherOf, friendStatus, weekExpOf, friendName, avatarOf, avatarImg, BG_VIDEOS, bgVideo, framedAvatar, taskIconHtml, portraitImg, playerRow, friendActions, renderFriendsRanking, headToHead, friendCard, renderFriendsPage, metricLabel, timeLeft, renderRacesPanel, renderRaceForm, renderCompareModal, profileWorn, profileAvatar, renderProfileModal, renderDeleteAccountModal });
})(window.SYS = window.SYS || {});

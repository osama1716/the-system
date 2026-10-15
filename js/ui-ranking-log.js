// UI: the inbox section, the ranking page and the log.
// One of the files ui.js was split into; the names they share travel through SYS._ui.
(function (SYS) {
  "use strict";
  const U = SYS._ui || (SYS._ui = {});
  const { escapeHtml, icon, logMark, pageIcon, rankArt, renderPageHead, t } = U;

  // ---------- Log page ----------
  function renderInboxSection(ui) {
    if (!ui.cloudUser || !ui.inbox.length) return "";
    const unread = ui.inbox.filter((m) => !m.read).length;
    const rows = ui.inbox.map((m) => `
      <div class="log-entry ${m.read ? "" : "unread"}" ${m.read ? "" : `data-action="mark-inbox-read" data-id="${m.id}" style="cursor:pointer;"`}>
        <span class="log-mark ${m.read ? "" : "up"}">${icon("chevronRight", 13)}</span>
        <span class="text">${escapeHtml(m.text)}${m.amount ? ` <b style="color:${m.amount > 0 ? "var(--gold-text)" : "var(--rust-text)"}">${t("log.expChange", { sign: m.amount > 0 ? "+" : "", n: escapeHtml(m.amount) })}</b>` : ""}</span>
        ${!m.read ? `<span class="date" style="color:var(--gold-text);">${t("log.new")}</span>` : ""}
      </div>`).join("");
    return `
      <div class="sys-panel panel-pad log-inbox" style="margin-bottom:16px;">
        <div class="friends-rank-head" style="margin-bottom:6px;">
          <span class="eyebrow" style="margin:0;">${t("log.fromSystem")}${unread ? " · " + unread : ""}</span>
          ${unread ? `<button class="link-btn" data-action="inbox-read-all">${t("log.markAllRead")}</button>` : ""}
        </div>
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
  const MEDALS = ["gold", "silver", "bronze"];

  // One line of the board, the way games show one: place, player, rank and
  // level, score. The first three wear their medal colours, your own line is
  // outlined, and a faint bar behind each line is its score against the
  // leader's (share, 0–100), so the gaps can be read without arithmetic.
  function renderLeaderboardRow(r, position, isMe, ui, score, share) {
    const medal = position != null && position <= 3 ? MEDALS[position - 1] : "";
    // Rank and level are read back out of the one number the server vouches
    // for, rather than shown as the client reported them alongside it — so a
    // row cannot claim a standing its EXP doesn't support.
    const standing = SYS.expToStanding(r.totalExp);
    // Where this row was when the week's snapshot was taken (snapshotRanks in
    // functions/index.js): up, down, or new to the board.
    const was = Number(r.lastRank) || 0;
    const move = was && position ? was - position : 0;
    const moveTag = !was
      ? ""
      : move === 0
        ? `<span class="lb-move same" title="${t("lb.moveSame")}">•</span>`
        : `<span class="lb-move ${move > 0 ? "up" : "down"}" title="${t(move > 0 ? "lb.moveUp" : "lb.moveDown", { n: Math.abs(move) })}">${move > 0 ? "▲" : "▼"}${Math.abs(move)}</span>`;
    const value = Number(score == null ? r.totalExp : score) || 0;
    return `
      <button class="lb-row lb-row-btn ${isMe ? "me" : ""} ${medal ? "medal-" + medal : ""}" style="--share:${Math.max(0, Math.min(100, Number(share) || 0)).toFixed(1)}%" data-action="open-profile" data-uid="${escapeHtml(r.uid)}">
        <span class="lb-pos ${medal}"><span class="lb-pos-n"><span>${position == null ? "—" : escapeHtml(position)}</span></span>${moveTag}</span>
        <span class="lb-who">
          <span class="lb-face">${U.framedAvatar(ui, r.uid, 32)}</span>
          <span class="lb-name"><span class="lb-name-text">${escapeHtml(r.displayName || "—")}</span>${isMe ? `<span class="lb-you-tag">${t("lb.you")}</span>` : ""}</span>
        </span>
        <span class="lb-standing">${rankArt(standing.rank, 24, "lb-rank")}<span class="lb-lv">${t("intel.lv", { n: escapeHtml(standing.level) })}</span></span>
        <span class="lb-total">${escapeHtml(value.toLocaleString("en-US"))}</span>
      </button>`;
  }
  // The row of headings over the board's columns.
  function boardHead(scoreLabel) {
    return `
      <div class="lb-head" aria-hidden="true">
        <span class="lb-h-pos">#</span>
        <span class="lb-h-who">${t("lb.colPlayer")}</span>
        <span class="lb-h-rank">${t("lb.colRank")}</span>
        <span class="lb-h-score">${escapeHtml(scoreLabel)}</span>
      </div>`;
  }
  U.renderLeaderboardRow = renderLeaderboardRow;
  U.boardHead = boardHead;

  // The season above its board: its number, the day it ends, and what is
  // left of it as one big figure (days, or hours on the last day) with a bar
  // that empties as it runs.
  function renderSeasonBanner(season) {
    if (season.upcoming) {
      return `
        <div class="lb-season lb-season-soon">
          <div class="lb-season-text">
            <div class="lb-season-name">${t("lb.seasonName", { n: 1 })}</div>
            <div class="lb-season-ends">${t("lb.seasonSoon")}</div>
          </div>
        </div>`;
    }
    const now = Date.now();
    const total = season.end - season.start;
    const left = Math.max(0, season.end - now);
    const hours = Math.ceil(left / 3600000);
    const big = hours > 24 ? Math.ceil(left / 86400000) : hours;
    const unit = t(hours > 24 ? "lb.daysLeftLabel" : "lb.hoursLeftLabel");
    let ends = "";
    try { ends = new Intl.DateTimeFormat(SYS.currentLanguage(), { day: "numeric", month: "long" }).format(new Date(season.end - 1)); } catch (e) {}
    const pct = Math.max(0, Math.min(100, (left / total) * 100));
    return `
        <div class="lb-season">
          <div class="lb-season-text">
            <div class="lb-season-name">${t("lb.seasonName", { n: season.n })}</div>
            ${ends ? `<div class="lb-season-ends">${t("lb.seasonEnds", { date: escapeHtml(ends) })}</div>` : ""}
          </div>
          <div class="lb-season-count"><b>${big}</b><span>${unit}</span></div>
          <div class="lb-season-track"><span style="width:${pct.toFixed(1)}%"></span></div>
        </div>`;
  }

  function renderLeaderboardPage(state, ui) {
    const header = renderPageHead("leaderboard")
      + (ui.cloudUser && ui.leaderboardUnderReview
        ? `<div class="sys-panel panel-pad lb-review">${t("lb.underReview")}</div>`
        : "");

    // Being ranked at all requires an account, so there is nothing useful to
    // show a signed-out visitor — and nothing to compare them against.
    if (!ui.cloudUser) {
      return header + `
        <div class="sys-panel panel-pad">
          <div class="empty-hero">
            ${pageIcon("leaderboard")}
            <div class="empty-hero-text">${t("lb.signedOut")}</div>
            <button class="btn btn-primary" data-action="open-settings">${t("account.signIn")}</button>
          </div>
        </div>`;
    }

    const rows = ui.leaderboard || [];
    const myUid = ui.cloudUser.uid;

    const mode = ["week", "season"].indexOf(ui.lbMode) >= 0 ? ui.lbMode : "total";
    const season = SYS.currentSeason();
    // One intelligence's board: the EXP earned in it, as the server counted it
    // from the categories each task was priced with.
    const cat = null;
    const scoreOf = (r) => (mode === "week" ? Number(r.weekExp) || 0
      : mode === "season" ? Number(r.seasonExp) || 0
      : cat ? Math.round(Number((r.cats || {})[cat]) || 0)
      : Number(r.totalExp) || 0);
    // Shown in the row instead of the total whenever the board is not the
    // total, so the number beside a name is the one it is ranked by.
    const shown = (r) => (mode !== "total" || cat ? scoreOf(r) : null);
    let running = 0, prevTotal = null;
    const positions = rows.map((r, i) => {
      if (scoreOf(r) !== prevTotal) { running = i + 1; prevTotal = scoreOf(r); }
      return running;
    });
    const meIndex = rows.findIndex((r) => r.uid === myUid);

    let body;
    if (ui.leaderboardError) {
      body = `<div class="toast-error">${escapeHtml(ui.leaderboardError)}</div>`;
    } else if (ui.leaderboardBusy && !rows.length) {
      body = `<div class="empty-note">${t("lb.loading")}</div>`;
    } else if (!rows.length) {
      body = mode === "season" && season.upcoming ? ""
        : `<div class="empty-note">${t(mode === "week" ? "lb.emptyWeek" : mode === "season" ? "lb.emptySeason" : "lb.empty")}</div>`;
    } else {
      // Deep in the list your own row is off-screen for the whole scroll, so
      // it sticks to the bottom of the board while the board is in view.
      const top = Math.max(1, ...rows.map(scoreOf));
      const shareOf = (r) => (scoreOf(r) / top) * 100;
      const sticky = meIndex >= 10
        ? `<div class="lb-sticky">${renderLeaderboardRow(rows[meIndex], positions[meIndex], true, ui, scoreOf(rows[meIndex]), shareOf(rows[meIndex]))}</div>`
        : "";
      body = `<div class="lb-board">`
        + boardHead(t(mode === "week" ? "lb.colWeek" : mode === "season" ? "lb.colSeason" : "lb.colTotal"))
        + `<div class="lb-list">`
        + rows.map((r, i) => renderLeaderboardRow(r, positions[i], r.uid === myUid, ui, scoreOf(r), shareOf(r))).join("")
        + sticky
        + `</div></div>`
        + (ui.leaderboardMore
          ? `<button class="btn btn-outline lb-more" data-action="lb-more" ${ui.leaderboardMoreBusy ? "disabled" : ""}>${t(ui.leaderboardMoreBusy ? "lb.loading" : "lb.more")}</button>`
          : "");
    }

    // Three different reasons someone can be missing from the list, and they
    // need three different answers — "you're not here" with no explanation is
    // the one outcome a ranking page must never produce.
    let selfBlock = "";
    // The board shows the name that was reserved, which is not always the one
    // on this device. Saying so beats letting someone hunt for a row that is
    // there under another name.
    const boardName = meIndex >= 0 ? (rows[meIndex].displayName || "") : (ui.leaderboardMine && ui.leaderboardMine.displayName) || "";
    const myName = (state.player && state.player.name) || "";
    const nameNote = boardName && myName && boardName !== myName
      ? `<div class="sys-panel panel-pad" style="margin-top:16px;"><div class="form-hint">${t("lb.shownAs", { name: escapeHtml(boardName) })}</div></div>`
      : "";
    if (!ui.nameClaimed && meIndex === -1 && !boardName) {
      selfBlock = `<div class="sys-panel panel-pad" style="margin-top:16px;"><div class="form-hint" style="color:var(--gold-text);">${t("lb.unclaimedName")}</div></div>`;
    } else if (mode !== "total" && !(mode === "season" && season.upcoming) && meIndex === -1 && ui.leaderboardMine && !ui.leaderboardBusy && !ui.leaderboardError) {
      // The week's and the season's boards only hold who scored in them;
      // someone with nothing yet is not missing, they are on zero.
      selfBlock = `<div class="sys-panel panel-pad" style="margin-top:16px;">
          <div class="form-hint" style="margin-bottom:10px;">${t(mode === "season" ? "lb.noSeasonExp" : "lb.noWeekExp")}</div>
          ${renderLeaderboardRow(ui.leaderboardMine, null, true, ui, 0, 0)}
        </div>`;
    } else if (cat && meIndex === -1 && ui.leaderboardMine && !ui.leaderboardBusy && !ui.leaderboardError
        && !(Number((ui.leaderboardMine.cats || {})[cat]) > 0)) {
      // Nothing earned in this intelligence yet: not missing, just not on it.
      selfBlock = `<div class="sys-panel panel-pad" style="margin-top:16px;">
          <div class="form-hint">${t("lb.noCatExp")}</div>
        </div>`;
    } else if (rows.length && meIndex === -1 && !ui.leaderboardBusy && !ui.leaderboardError && mode !== "week") {
      selfBlock = ui.leaderboardMine
        ? `<div class="sys-panel panel-pad" style="margin-top:16px;">
             <div class="form-hint" style="margin-bottom:10px;">${t("lb.outsideTop", { n: rows.length })}</div>
             ${renderLeaderboardRow(ui.leaderboardMine, ui.leaderboardMyPosition, true, ui, scoreOf(ui.leaderboardMine), 0)}
             ${ui.leaderboardMyPosition == null ? `<div class="form-hint" style="margin-top:8px;">${t("lb.positionUnknown")}</div>` : ""}
           </div>`
        : `<div class="sys-panel panel-pad" style="margin-top:16px;"><div class="form-hint">${t("lb.pending")}</div></div>`;
    }

    const tabs = `
        <div class="planner-tabs lb-tabs">
          <button class="chip filter-chip ${ui.lbTab === "friends" ? "" : "active"}" data-action="lb-tab" data-tab="world" aria-pressed="${ui.lbTab !== "friends"}">${t("friends.world")}</button>
          <button class="chip filter-chip ${ui.lbTab === "friends" ? "active" : ""}" data-action="lb-tab" data-tab="friends" aria-pressed="${ui.lbTab === "friends"}">${t("friends.tab")}${ui.friendRequestsIn ? ` <span class="banked-tag" style="display:inline-flex;margin-inline-start:4px;">${ui.friendRequestsIn}</span>` : ""}</button>
        </div>`;
    if (ui.lbTab === "friends") {
      return header + `<div class="sys-panel panel-pad">${tabs}${U.renderFriendsRanking(state, ui)}</div>`;
    }
    return header + `
      <div class="sys-panel panel-pad">
        ${tabs}
        <div class="planner-tabs lb-modes">
          <button class="chip filter-chip ${mode === "season" ? "active" : ""}" data-action="lb-mode" data-mode="season" aria-pressed="${mode === "season"}">${t("lb.modeSeason")}</button>
          <button class="chip filter-chip ${mode === "total" ? "active" : ""}" data-action="lb-mode" data-mode="total" aria-pressed="${mode === "total"}">${t("lb.modeAll")}</button>
          <button class="chip filter-chip ${mode === "week" ? "active" : ""}" data-action="lb-mode" data-mode="week" aria-pressed="${mode === "week"}">${t("lb.modeWeek")}</button>
        </div>
        ${mode === "season" ? renderSeasonBanner(season) : ""}
        <div class="lb-top">
          <button class="link-btn" data-action="refresh-leaderboard" ${ui.leaderboardBusy ? "disabled" : ""}>${t("lb.refresh")}</button>
        </div>
        ${body}
      </div>` + selfBlock + nameNote;
  }
  SYS.renderLeaderboardPage = renderLeaderboardPage;

  // The figures inside a line of the record, picked out of the sentence: the
  // level span and every "+N" it bought, so the eye lands on the numbers.

  // The record and the notifications are saved as English lines (old ones
  // too), so they are translated here, as they are shown. A line this does
  // not recognise is shown as it is.
  function localLine(text) {
    const s = String(text || "");
    if (SYS.currentLanguage() === "en") return s;
    let m;
    if ((m = s.match(/^RANK UP → ([A-Z])-Rank$/))) return t("line.rankUp", { rank: m[1] });
    if ((m = s.match(/^RANK DOWN → ([A-Z])-Rank \(progress reverted\)$/))) return t("line.rankDown", { rank: m[1] });
    if ((m = s.match(/^Welcome to ([A-Z])-Rank$/))) return t("line.welcome", { rank: m[1] });
    if ((m = s.match(/^Dropped to ([A-Z])-Rank$/))) return t("line.dropped", { rank: m[1] });
    if ((m = s.match(/^\+(\d+) pt → (.+) \([A-Z]+\)$/))) return t("line.point", { n: m[1], trait: SYS.traitName(m[2]) });
    if ((m = s.match(/^Level (\d+) → (\d+)( \(reverted\))?(?:: (.+))?$/))) {
      const points = m[4] ? m[4].split(", ").map((p) => {
        const q = p.match(/^\+(\d+) [A-Z]+ → (.+)$/);
        return q ? t("line.point", { n: q[1], trait: SYS.traitName(q[2]) }) : p;
      }) : [];
      return t("line.level", { from: m[1], to: m[2] }) + (m[3] ? t("line.reverted") : "") + (points.length ? ": " + points.join({ ar: "، ", ja: "、", zh: "、" }[SYS.currentLanguage()] || ", ") : "");
    }
    if ((m = s.match(/^(.+) is now worth (\d+) xp per repeat\.$/))) return t("line.worthRepeat", { title: m[1], n: m[2] });
    if ((m = s.match(/^(.+) is now worth (\d+) xp\.$/))) return t("line.worth", { title: m[1], n: m[2] });
    if ((m = s.match(/^(Weekly|Monthly|Cycle) goal reached — (.+)$/))) return t("line.goal." + { Weekly: "week", Monthly: "month", Cycle: "window" }[m[1]], { title: m[2] });
    if ((m = s.match(/^(\d+) (days|weeks|months|cycles) in a row — (.+)$/))) return t("line.row." + m[2], { n: m[1], title: m[3] });
    if (s === "That day hasn't happened yet.") return t("habits.futureLocked");
    return s;
  }
  SYS.localLine = localLine;

  function logText(text) {
    const safe = escapeHtml(localLine(text));
    return safe
      .replace(/(\+\d+(?:\.\d+)?)/g, '<b class="log-plus">$1</b>')
      .replace(/(Level\s\d+\s→\s\d+)/g, '<b class="log-span">$1</b>')
      .replace(/(RANK (?:UP|DOWN)\s→\s[A-Z]-Rank)/g, '<b class="log-span">$1</b>');
  }

  const LOG_FILTERS = [
    { key: "all", tkey: "log.filterAll" },
    { key: "levels", tkey: "log.filterLevels" },
    { key: "ranks", tkey: "log.filterRanks" },
    { key: "system", tkey: "log.filterSystem" },
  ];

  // "Today" and "yesterday" by the same locale string the entries carry, so
  // no parsing of a date that was written for reading rather than for sorting.
  function dayHeading(dateText) {
    const today = new Date().toLocaleDateString();
    const yest = new Date(Date.now() - 86400000).toLocaleDateString();
    if (dateText === today) return t("log.today");
    if (dateText === yest) return t("log.yesterday");
    return dateText;
  }

  function renderLogPage(state, ui) {
    const filter = ui.logFilter || "all";
    const isRank = (e) => /^RANK /.test(String(e.text || ""));
    const all = state.log || [];
    const entries = all.filter((e) => filter === "all" ? true : filter === "ranks" ? isRank(e) : filter === "levels" ? !isRank(e) : false);

    // One heading per day rather than a date on every line.
    let lastDay = null;
    const list = entries.map((e) => {
      const m = logMark(e.text);
      const head = e.date !== lastDay ? `<div class="log-day">${escapeHtml(dayHeading(e.date))}</div>` : "";
      lastDay = e.date;
      return head + `
        <div class="log-entry">
          <span class="log-mark ${m.cls}">${icon(m.name, 13)}</span>
          <span class="text">${logText(e.text)}</span>
        </div>`;
    }).join("");

    const empty = all.length === 0
      ? `<div class="empty-hero">
           ${pageIcon("log")}
           <div class="empty-hero-text">${t("log.empty")}</div>
           <button class="btn btn-primary" data-action="nav" data-page="quests">${t("quests.new")}</button>
         </div>`
      : `<div class="empty-note">${t("log.emptyFilter")}</div>`;

    const chips = LOG_FILTERS.map((f) => `
      <button class="chip filter-chip ${filter === f.key ? "active" : ""}" data-action="log-filter" data-filter="${f.key}" aria-pressed="${filter === f.key}">${t(f.tkey)}</button>`).join("");

    return `
      ${renderPageHead("log")}
      ${filter === "system" || filter === "all" ? renderInboxSection(ui) : ""}
      <div class="sys-panel panel-pad log-record">
        <div class="planner-tabs log-filters" style="margin-bottom:12px;">${chips}</div>
        ${filter === "system"
          ? (ui.cloudUser && ui.inbox.length ? "" : `<div class="empty-note">${t("log.noSystem")}</div>`)
          : (entries.length ? list : empty)}
      </div>`;
  }
  SYS.renderLogPage = renderLogPage;

  Object.assign(U, { renderInboxSection, MEDALS, renderLeaderboardRow, renderSeasonBanner, renderLeaderboardPage, localLine, logText, LOG_FILTERS, dayHeading, renderLogPage });
})(window.SYS = window.SYS || {});

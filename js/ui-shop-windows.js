// UI: the shop, notices, the window layer and every remaining window (time, sync, logging,
// library, timer, settings).
// One of the files ui.js was split into; the names they share travel through SYS._ui.
(function (SYS) {
  "use strict";
  const U = SYS._ui || (SYS._ui = {});
  const { GOOGLE_ICON_SVG, bgVideo, ceilSecond, dateLocale, dayLabel, escapeHtml, goldFull, icon, navImg, pageIcon, portraitImg, progressText, renderAiReportModal, renderCarryModal, renderCompareModal, renderDaySheet, renderDeleteAccountModal, renderEventForm, renderEventMove, renderEventView, renderFeedbackModal, renderGuideModal, renderHelpModal, renderProfileModal, renderRaceForm, renderRanksModal, renderReflectionModal, sheetDay, t, themeName, timerCaption } = U;

  // ---------- the shop ----------
  // A page of its own, as a game's shop is: three shelves, and every item
  // shown as it would look on you — a theme as the app in its colours, a
  // frame around your own portrait. Gold buys the themes and the freezes;
  // Aurenite is bought and only bought, so until payments exist the frames
  // are shown and marked as coming.
  function renderShopPage(state, ui) {
    const w = ui.wallet || { gold: 0, aurenite: 0, themes: [], frames: [], freezes: 0 };
    const shop = SYS.SHOP;
    const tab = ["themes", "items", "frames", "backgrounds"].indexOf(ui.shopTab) >= 0 ? ui.shopTab : "themes";
    // `plain`: the price is already shown beside the item, so the button
    // just says what it does.
    const buyBtn = (kind, id, price, enough, blocked, plain) => {
      const key = kind + ":" + (id || "");
      const armed = ui.shopArmed === key;
      const busy = ui.shopBusy === key;
      const label = busy ? t("shop.wait")
        : armed ? t("shop.confirm", { n: goldFull(price) })
        : plain ? t("shop.buy")
        : `<span class="coin" aria-hidden="true"></span> ${goldFull(price)}`;
      return `<button class="btn ${armed ? "btn-primary" : "btn-outline"} shop-buy" data-action="shop-buy" data-kind="${kind}" ${id ? `data-id="${escapeHtml(id)}"` : ""}
        ${(!enough || busy || blocked) ? "disabled" : ""}>${label}</button>`;
    };

    // The app in miniature, painted in the theme's own colours: a rail of
    // page icons, the status bar with its level, a quest card and
    // its button. Real icons, so it looks like the app.
    const themePreview = (th) => `
      <div class="shop-preview" style="background:${th.appBg};color:${th.ink};--pv-gold:${th.gold};--pv-border:${th.goldBorder};">
        <div class="shop-pv-rail" style="border-color:${th.border};">
          ${["overview", "quests", "habits", "leaderboard"].map((p) => `<img src="assets/icons/${p}-96.webp" alt="" width="18" height="18" />`).join("")}
        </div>
        <div class="shop-pv-main">
          <div class="shop-pv-bar" style="border-color:${th.border};">
            <span class="shop-pv-name" style="background:${th.ink};"></span>
            <span class="shop-pv-track" style="background:${th.track};"><span style="background:${th.barGold};"></span></span>
          </div>
          <div class="shop-pv-card" style="background:${th.card};border-color:${th.goldBorder};">
            <span class="shop-pv-line" style="background:${th.ink};"></span>
            <span class="shop-pv-line short" style="background:${th.faint};"></span>
            <div class="shop-pv-foot">
              <span class="shop-pv-pts" style="color:${th.goldText};">+120</span>
              <span class="shop-pv-btn" style="background:${th.gold};color:${th.onGold};">${icon("check", 10)}</span>
            </div>
          </div>
        </div>
      </div>`;

    const themes = Object.keys(SYS.THEMES).map((name) => {
      const th = SYS.THEMES[name];
      const own = SYS.ownsTheme(w, name);
      const wearing = state.settings.theme === name;
      const price = shop.themePrices[name] || 0;
      const action = wearing
        ? `<span class="shop-tag">${icon("check", 12)} ${t("shop.inUse")}</span>`
        : own
          ? `<button class="btn btn-outline" data-action="shop-use-theme" data-id="${escapeHtml(name)}">${t("shop.use")}</button>`
          : buyBtn("theme", name, price, w.gold >= price, false, true);
      return `
        <div class="shop-card shop-theme ${wearing ? "wearing" : ""} ${own ? "owned" : "locked"}" style="--card-glow:${th.gold};">
          ${themePreview(th)}
          ${!own ? `<span class="shop-lock" aria-hidden="true">${icon("lock", 13)}</span>` : ""}
          <div class="shop-card-row">
            <div class="shop-card-name">${escapeHtml(themeName(name))}</div>
            ${!own ? `<span class="shop-price"><span class="coin" aria-hidden="true"></span>${goldFull(price)}</span>` : ""}
          </div>
          ${action}
        </div>`;
    }).join("");

    const freezeFull = w.freezes >= shop.freezeMax;
    const items = `
      <div class="shop-card shop-card-wide">
        <div class="shop-item-art">${icon("flame", 44)}</div>
        <div class="shop-card-body">
          <div class="shop-card-name">${t("shop.freeze")}</div>
          <div class="shop-pips">${Array.from({ length: shop.freezeMax }, (_, i) =>
            `<span class="shop-pip ${i < w.freezes ? "on" : ""}"></span>`).join("")}
            <span class="shop-pips-n">${t("shop.freezeHeld", { n: w.freezes, max: shop.freezeMax })}</span></div>
        </div>
        ${buyBtn("freeze", null, shop.freezePrice, w.gold >= shop.freezePrice, freezeFull)}
      </div>`;

    const me = ui.cloudUser && ui.cloudUser.uid;
    // Owned (or, for the admin, anything): put it on the profile, or take it
    // off. Everything else waits for payments.
    const wearBtn = (kind, id) => {
      const owned = ((kind === "frame" ? w.frames : w.backgrounds) || []).indexOf(id) >= 0;
      const on = ((ui.myWorn || {})[kind]) === id;
      const busy = ui.shopBusy === "wear:" + kind;
      if (on) return `<button class="btn btn-outline" data-action="shop-wear" data-kind="${kind}" data-id="" ${busy ? "disabled" : ""}>${t("shop.takeOff")}</button>`;
      if (owned || ui.isAdmin) return `<button class="btn btn-outline" data-action="shop-wear" data-kind="${kind}" data-id="${escapeHtml(id)}" ${busy ? "disabled" : ""}>${t("shop.use")}</button>`;
      return `<button class="btn btn-outline" disabled>${t("shop.soon")}</button>`;
    };
    // What you have on says so where the price would be, and what you own
    // shows no price at all (as with themes); the button under it does the rest.
    const cardName = (kind, id, price) => {
      if (((ui.myWorn || {})[kind]) === id) return `<div class="shop-card-name shop-in-use">${icon("check", 14)} ${t("shop.inUse")}</div>`;
      if (((kind === "frame" ? w.frames : w.backgrounds) || []).indexOf(id) >= 0) return `<div class="shop-card-name shop-owned">${t("shop.owned")}</div>`;
      return `<div class="shop-card-name"><span class="gem" aria-hidden="true"></span> ${goldFull(price)}</div>`;
    };
    const backgrounds = Object.keys(shop.backgroundPrices || {}).map((id) => `
        <div class="shop-card">
          <div class="shop-bg-stage" style="background-image:url('assets/backgrounds/${escapeHtml(id)}.jpg')">
            ${bgVideo(id)}
            ${me ? `<span class="shop-bg-face">${U.framedAvatar(ui, me, 128)}</span>` : ""}
          </div>
          ${cardName("background", id, shop.backgroundPrices[id])}
          ${wearBtn("background", id)}
        </div>`).join("");
    const frames = Object.keys(shop.framePrices).map((id) => `
        <div class="shop-card">
          <div class="shop-frame-stage">
            <div class="shop-frame-pf">
              ${me ? `<span class="shop-frame-face">${U.avatarImg(ui, me, 256)}</span>` : ""}
              <canvas class="shop-frame-art" data-frame="${id}" width="1" height="1" aria-hidden="true"></canvas>
            </div>
          </div>
          ${cardName("frame", id, shop.framePrices[id])}
          ${wearBtn("frame", id)}
        </div>`).join("");

    const tabBtn = (k) => `<button class="chip filter-chip ${tab === k ? "active" : ""}" data-action="shop-tab" data-tab="${k}" aria-pressed="${tab === k}">${t("shop." + k)}</button>`;
    return `
      <div class="page-header page-header-icon shop-head">
        ${pageIcon("shop")}
        <h1 class="page-title">${t("nav.shop")}</h1>
        <div class="shop-balance"><span class="coin coin-lg" aria-hidden="true"></span> ${goldFull(w.gold)}</div>
      </div>
      <div class="sys-panel panel-pad">
        <div class="chip-group shop-tabs">${tabBtn("themes")}${tabBtn("items")}${tabBtn("frames")}${tabBtn("backgrounds")}</div>
        <div class="shop-shelf ${tab === "items" ? "shop-shelf-wide" : ""}">
          ${tab === "themes" ? themes : tab === "items" ? items : tab === "frames" ? frames : backgrounds}
        </div>
      </div>`;
  }

  // ---------- notifications ----------
  const NOTIF_STYLE = {
    levelup: { key: "notif.levelup", color: "var(--gold-text)" },
    skillpoint: { key: "notif.skillpoint", color: "var(--gold-text)" },
    info: { key: "notif.info", color: "var(--gold-text)" },
    expLoss: { key: "notif.expLoss", color: "var(--dim)" },
    delevel: { key: "notif.delevel", color: "var(--dim)" },
    rankdown: { key: "notif.rankdown", color: "var(--rust-text)" },
    update: { key: "notif.update", color: "var(--gold-text)" },
  };
  function renderNotifStack(ui) {
    return ui.toasts.map((n) => {
      const style = NOTIF_STYLE[n.kind] || { key: "notif.exp", color: "var(--gold-text)" };
      // Only sticky notifications carry buttons — one that vanishes mid-reach
      // would be worse than none. The dismiss is there because a prompt you
      // can't put away is a prompt that gets resented.
      const actions = n.action ? `
          <div class="notif-actions">
            <button class="btn btn-primary btn-sm" data-action="${escapeHtml(n.action.name)}">${escapeHtml(n.action.label)}</button>
            <button class="notif-dismiss" data-action="dismiss-toast" data-id="${escapeHtml(n.id)}" aria-label="${t("update.later")}" title="${t("update.later")}">${icon("x", 13)}</button>
          </div>` : "";
      return `
        <div class="notif" data-action="dismiss-toast" data-id="${escapeHtml(n.id)}" title="${t("notif.dismiss")}">
          <div class="notif-kind" style="color:${style.color}">${t(style.key)}</div>
          <div class="notif-text">${escapeHtml(U.localLine(n.text))}${n.count > 1 ? ` <span class="notif-count">×${n.count}</span>` : ""}</div>
          ${actions}
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
      <div class="rankup-overlay show" id="rankup-overlay" data-action="dismiss-rankup" role="alertdialog" aria-label="${t("rankup.aria")}">
        <div class="rankup-eyebrow">${t("rankup.notice")}</div>
        <div class="rankup-emblem" style="--glow:${(SYS.RANK_GLOW || {})[rank] || "217,160,91"}">
          <span class="rankup-aura"></span>
          ${SYS.rankArt(rank, 200)}
          <span class="rankup-sheen">${SYS.rankArt(rank, 200)}</span>
        </div>
        <div class="rankup-sub">${escapeHtml(ui.rankupShowing.text)}</div>
        <div class="rankup-hint">${t("rankup.dismiss")}</div>
      </div>`;
  }
  SYS.renderRankupLayer = renderRankupLayer;

  // ---------- modal ----------
  function renderModalLayer(state, ui) {
    if (!ui.modal) return "";
    if (ui.modal === "help") return renderHelpModal(ui);
    if (ui.modal === "ranks") return renderRanksModal(state);
    if (ui.modal === "guide") return renderGuideModal(ui);
    if (ui.modal === "settings") return renderSettingsModal(state, ui);
    if (ui.modal === "timer") return renderTimerModal(state, ui);
    if (ui.modal === "logAmount") return renderLogSheet(state, ui);
    if (ui.modal === "library") return renderLibraryModal(state, ui);
    if (ui.modal === "syncChoice") return renderSyncChoiceModal(state, ui);
    if (ui.modal === "day") return renderDaySheet(state, ui);
    if (ui.modal === "time") return renderTimeSheet(ui);
    if (ui.modal === "reflection") return renderReflectionModal(state, ui);
    if (ui.modal === "carry") return renderCarryModal(state, ui);
    if (ui.modal === "eventForm") return renderEventForm(state, ui);
    if (ui.modal === "eventView") return renderEventView(state, ui);
    if (ui.modal === "eventMove") return renderEventMove(ui);
    if (ui.modal === "profile") return renderProfileModal(state, ui);
    if (ui.modal === "compare") return renderCompareModal(state, ui);
    if (ui.modal === "raceForm") return renderRaceForm(state, ui);
    if (ui.modal === "feedback") return renderFeedbackModal(ui);
    if (ui.modal === "deleteAccount") return renderDeleteAccountModal(ui);
    if (ui.modal === "aiReport") return renderAiReportModal(ui);
    return "";
  }
  SYS.renderModalLayer = renderModalLayer;

  // The reminder time as two wheels, hours and minutes, each a scroll-snapped
  // column. Every list is written out three times so it can wrap — 23 runs on
  // into 00 — and main.js quietly recentres on the middle copy once a spin
  // settles, and sets the scroll position after each render. The row height
  // lives in two places that must agree: --tw-row in CSS and TW_ROW in main.js.
  function renderTimeSheet(ui) {
    const d = ui.timeDraft || { h: 0, m: 0 };
    const pad = (n) => String(n).padStart(2, "0");
    const wheel = (part, count, cur, label) => `
      <div class="tw-col" data-tw="${part}" data-count="${count}" tabindex="0" role="spinbutton"
        aria-label="${label}" aria-valuemin="0" aria-valuemax="${count - 1}" aria-valuenow="${cur}" aria-valuetext="${pad(cur)}">
        ${Array.from({ length: count * 3 }, (_, i) => `<div class="tw-item" data-action="tw-pick" data-i="${i}">${pad(i % count)}</div>`).join("")}
      </div>`;
    return `
      <div class="modal-backdrop time-backdrop" data-action="close-time-backdrop">
        <div class="sys-panel modal-box time-sheet" data-stop-close="1" role="dialog" aria-label="${t("form.pickTime")}">
          <div class="day-head">
            <button class="wk-arrow" data-action="close-time" aria-label="${t("form.cancel")}">${icon("x", 15)}</button>
            <div class="time-title">${ui.timeTitle ? escapeHtml(ui.timeTitle) : t("form.pickTime")}</div>
            <span class="day-head-pad"></span>
          </div>
          <div class="tw" dir="ltr">
            <div class="tw-band"></div>
            ${wheel("h", 24, d.h, t("form.hours"))}
            ${wheel("m", 60, d.m, t("form.minutes"))}
          </div>
          <button class="btn-primary time-confirm" data-action="confirm-time">${t("form.confirmTime")}</button>
        </div>
      </div>`;
  }

  // The stored fields, grouped into what a person would call them. The field
  // names themselves are for the admin's diagnosis only.
  const SYNC_AREAS = {
    tasks: "tasks", archive: "tasks", habitTouches: "tasks", suggestions: "tasks",
    player: "progress", levelHistory: "progress",
    intelligences: "intel", intTypes: "intel", assessment: "intel",
    log: "history", dailyStats: "history",
    settings: "settings",
  };
  function syncAreas(rows) {
    const order = ["tasks", "progress", "intel", "history", "settings", "other"];
    const seen = new Set(rows.map((r) => SYNC_AREAS[r.key] || "other"));
    return order.filter((a) => seen.has(a));
  }

  function renderSyncChoiceModal(state, ui) {
    // Asking which copy to keep without saying what differs makes the answer a
    // guess. It also hid a repeating prompt: something disagreed on every
    // launch and nothing on screen said what.
    // The planner syncs by itself and is not in either stored copy.
    const { planner, ...stateOnly } = state;
    const rows = SYS.describeStateDiff(stateOnly, ui.pendingCloudState) || [];
    const diff = !rows.length ? "" : `
          <div style="font-size:12px;line-height:1.7;margin-bottom:16px;border:1px solid var(--line);border-radius:8px;padding:10px 12px;">
            <div style="opacity:.7;margin-bottom:6px;text-transform:uppercase;letter-spacing:.08em;font-size:10px;">${t("sync.whatDiffers")}</div>
            ${ui.isAdmin
              ? rows.map((r) => `<div style="margin-bottom:3px;"><strong>${escapeHtml(r.key)}</strong> <span style="opacity:.8;unicode-bidi:plaintext;">${escapeHtml(r.detail)}</span></div>`).join("")
              : syncAreas(rows).map((a) => `<div style="margin-bottom:3px;">${t("sync.area." + a)}</div>`).join("")}
          </div>`;
    // A save that is being refused is the whole explanation for a prompt that
    // keeps coming back: answering it writes, the write is rejected, and the
    // next launch finds the same disagreement. Say so here, where the question
    // is actually being asked.
    const blocked = !ui.pushError ? "" : `
          <div style="font-size:12px;line-height:1.6;margin-bottom:16px;border:1px solid var(--danger,#b4544a);border-radius:8px;padding:10px 12px;">
            <strong>${t("sync.cantSave")}</strong>
            <div style="opacity:.85;margin-top:4px;unicode-bidi:plaintext;">${escapeHtml(String(ui.pushError))}</div>
          </div>`;
    return `
      <div class="modal-backdrop">
        <div class="sys-panel modal-box" data-stop-close="1">
          <div class="modal-title">${t("sync.title")}</div>
          <div style="font-size:13px;color:var(--body);line-height:1.6;margin-bottom:18px;">
            ${t("sync.body")}
          </div>
          ${blocked}
          ${diff}
          ${renderSyncDiagnosis(ui)}
          <div class="btn-row" style="flex-direction:column;gap:8px;">
            <button class="btn btn-primary" data-action="sync-choice" data-choice="cloud" style="width:100%;">${t("sync.useCloud")}</button>
            <button class="btn btn-outline" data-action="sync-choice" data-choice="local" style="width:100%;">${t("sync.useLocal")}</button>
          </div>
        </div>
      </div>`;
  }

  // Admin only: this names server-side collections and is diagnostic, not
  // something to put in front of everyone answering a sync prompt.
  function renderSyncDiagnosis(ui) {
    const d = ui.syncDiag;
    if (!ui.isAdmin || !d) return "";
    const standing = (total) => {
      if (total == null) return "—";
      const s = SYS.expToStanding(total);
      return `${total} (${s.rank} Lv${s.level})`;
    };
    const p = d.push;
    const ago = (ms) => {
      if (!ms) return "never";
      const mins = Math.round((Date.now() - ms) / 60000);
      return mins < 1 ? "just now" : mins < 60 ? mins + "m ago" : Math.round(mins / 60) + "h ago";
    };
    const rows = [
      ["this device", standing(d.localTotal)],
      ["account doc", standing(d.cloudTotal)],
      ["journal (expTotals)", standing(d.journalTotal)],
      ["pending grants", d.grants == null ? "—" : String(d.grants)],
      ["unsent exp events", String(d.queued)],
      ["account doc written", ago(d.storedAt)],
      ["saves asked / written", !p ? "—" : p.asked + " / " + p.started],
      ["saves ok / failed", !p ? "—" : p.ok + " / " + p.failed + (p.lastError ? " (" + p.lastError + ")" : "")],
      ["saves dropped", !p ? "—" : p.superseded + " superseded, " + p.skippedNoUser + " no user"],
    ];
    return `
          <div style="font-size:12px;line-height:1.7;margin-bottom:16px;border:1px dashed var(--line);border-radius:8px;padding:10px 12px;">
            <div style="opacity:.7;margin-bottom:6px;text-transform:uppercase;letter-spacing:.08em;font-size:10px;">Diagnosis (admin)</div>
            ${rows.map((r) => `<div style="display:flex;gap:8px;justify-content:space-between;"><span style="opacity:.75;">${escapeHtml(r[0])}</span><span style="unicode-bidi:plaintext;">${escapeHtml(r[1])}</span></div>`).join("")}
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

  // The log sheet: one place to put an amount on today, built around a keypad
  // rather than a text field. A number input on a phone opens the OS keyboard
  // over the thing you are looking at, and its own tiny spinners are a poor
  // target; here the dial, the units and the digits are all on screen at once
  // and the ring shows where today lands before you commit to it.
  // A quit habit's day has two answers and no number, so the dial and the
  // keypad would be furniture. The note is kept, because "why" is the most
  // useful thing anyone ever writes about a slip.
  function renderQuitSheet(task, ui) {
    const today = SYS.todayKey();
    // The sheet writes to the day it was opened for, which is not always
    // today, so it names that day rather than saying "today" and meaning
    // Thursday.
    const day = sheetDay(ui);
    const other = day !== today;
    const clean = SYS.habitDoneOn(task, day);
    const slipped = SYS.habitSlipOn(task, day);
    const streak = SYS.habitStreak(task, day);
    return `
      <div class="modal-backdrop" data-action="close-amount-backdrop">
        <div class="sys-panel modal-box log-sheet" data-stop-close="1" role="dialog" aria-label="${SYS.t("quit.decide")}">
          <div class="log-head">
            <span class="log-emoji">${U.taskIconHtml(task)}</span>
            <span class="log-name">${escapeHtml(task.title)}</span>
          </div>
          <div class="quit-state ${slipped ? "slip" : clean ? "clean" : ""}">
            ${other
              ? (slipped ? SYS.t("quit.slippedOn", { day: dayLabel(day) })
                : clean ? SYS.t("quit.cleanOn", { day: dayLabel(day) })
                : SYS.t("quit.undecidedOn", { day: dayLabel(day) }))
              : (slipped ? SYS.t("quit.slippedToday") : clean ? SYS.t("quit.cleanToday") : SYS.t("quit.undecided"))}
          </div>
          <div class="log-today" style="margin-bottom:16px;">${streak.n > 0
            ? SYS.t("quit.streak", { n: streak.n })
            : SYS.t("quit.noStreak")}</div>
          <div class="quit-actions">
            <button class="btn ${clean ? "btn-outline" : "btn-primary"}" data-action="quit-clean" data-id="${escapeHtml(task.id)}" ${clean ? "disabled" : ""}>
              ${icon("check", 14)} ${SYS.t("quit.markClean")}
            </button>
            <button class="btn btn-outline quit-slip-btn" data-action="quit-slip" data-id="${escapeHtml(task.id)}" ${slipped ? "disabled" : ""}>
              ${icon("x", 14)} ${SYS.t("quit.markSlip")}
            </button>
          </div>
          ${(clean || slipped) ? `<button class="btn btn-ghost btn-sm" data-action="quit-reset" data-id="${escapeHtml(task.id)}" style="width:100%;margin-top:8px;">${SYS.t("quit.undo")}</button>` : ""}
          ${renderDayNote(task, ui)}
          <button class="btn btn-ghost" data-action="close-amount" style="width:100%;margin-top:10px;">${SYS.t("form.cancel")}</button>
        </div>
      </div>`;
  }

  function renderLogSheet(state, ui) {
    const task = state.tasks.find((x) => x.id === ui.amountFor);
    if (!task) return "";
    if (SYS.isQuitHabit(task)) return renderQuitSheet(task, ui);
    const today = SYS.todayKey();
    const day = sheetDay(ui);
    const goalBase = SYS.habitGoalBase(task);
    const doneBase = SYS.habitAmountOn(task, day);
    const family = SYS.unitFamily(task.unit);
    const selUnit = family.includes(ui.amountUnit) ? ui.amountUnit : task.unit;

    // What is typed, in the goal's own terms, so the ring can show the
    // landing point rather than a number in whichever unit is selected.
    const typed = Number(ui.amountValue);
    const pendingBase = Number.isFinite(typed) ? (SYS.toBase(typed, selUnit, task.unit) || 0) : 0;
    const pct = (v) => Math.max(0, Math.min(100, goalBase > 0 ? (v / goalBase) * 100 : 0));
    const donePct = pct(doneBase);
    const totalPct = pct(doneBase + pendingBase);

    const shown = ui.amountValue === "" || ui.amountValue == null ? "0" : String(ui.amountValue);
    const chips = family.length < 2 ? "" : `
        <div class="log-units">
          ${family.map((u) => `<button class="log-unit ${u === selUnit ? "on" : ""}" data-action="amount-unit" data-unit="${escapeHtml(u)}">${escapeHtml(SYS.tUnit(u))}</button>`).join("")}
        </div>`;

    // Digits stay in their usual places in every language: a keypad is a
    // shape people reach for without reading, and mirroring it in Arabic
    // would move every key.
    const key = (k, label, cls, aria) => `<button class="pad-key ${cls || ""}" data-action="amount-key" data-key="${k}"${aria ? ` aria-label="${aria}"` : ""}>${label}</button>`;
    const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => key(d, d));

    return `
      <div class="modal-backdrop" data-action="close-amount-backdrop">
        <div class="sys-panel modal-box log-sheet" data-stop-close="1" role="dialog" aria-label="${SYS.t("task.addAmount")}">
          <div class="log-head">
            <span class="log-emoji">${U.taskIconHtml(task)}</span>
            <span class="log-name">${escapeHtml(task.title)}</span>
          </div>

          <div class="log-ring">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle class="ring-track" cx="60" cy="60" r="52" pathLength="100" />
              <circle class="ring-pending" cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="${totalPct} 100" />
              <circle class="ring-done" cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="${donePct} 100" />
            </svg>
            <div class="log-dial">
              <button class="log-step" data-action="amount-step" data-delta="-1" aria-label="${SYS.t("task.stepDown")}">${icon("minus", 16)}</button>
              <div class="log-value">
                <div class="log-num">${escapeHtml(shown)}</div>
                <div class="log-goal">${escapeHtml(SYS.tUnit(selUnit))}</div>
              </div>
              <button class="log-step" data-action="amount-step" data-delta="1" aria-label="${SYS.t("task.stepUp")}">${icon("plus", 16)}</button>
            </div>
          </div>

          <div class="log-today">${day === today
            ? SYS.t("task.today", { progress: progressText(task, day) })
            : SYS.t("task.onDay", { day: dayLabel(day), progress: progressText(task, day) })}</div>

          ${chips}

          <div class="keypad">
            ${digits[0]}${digits[1]}${digits[2]}${key("clear", "AC", "pad-fn", SYS.t("task.clearAmount"))}
            ${digits[3]}${digits[4]}${digits[5]}${key("back", icon("backspace", 16), "pad-fn", SYS.t("task.backspace"))}
            ${digits[6]}${digits[7]}${digits[8]}<button class="pad-key pad-add" data-action="commit-amount" data-id="${escapeHtml(task.id)}" ${typed > 0 ? "" : "disabled"}>${SYS.t("task.add")}</button>
            ${key("0", "0", "pad-zero")}${key(".", ".")}
          </div>

          ${renderDayNote(task, ui)}

          <div class="log-actions">
            <button class="btn btn-outline btn-icon-inline" data-action="undo-day" data-id="${escapeHtml(task.id)}" ${doneBase > 0 ? "" : "disabled"}>${icon("undo", 14)} ${SYS.t("task.clearDay")}</button>
            <button class="btn btn-outline btn-icon-inline" data-action="fill-day" data-id="${escapeHtml(task.id)}" ${doneBase >= goalBase ? "disabled" : ""}>${icon("check", 14)} ${SYS.t("task.markDone")}</button>
          </div>
          <button class="btn btn-ghost" data-action="close-amount" style="width:100%;margin-top:10px;">${SYS.t("form.cancel")}</button>
        </div>
      </div>`;
  }
  // The note, collapsed by default. Most logging is a number and nothing
  // else, so the field only takes room once you ask for it — and it says
  // whether there is already something written, so a note is never hidden
  // behind a control that looks empty.
  function renderDayNote(task, ui) {
    const day = sheetDay(ui);
    const existing = SYS.habitNoteOn(task, day);
    const open = !!ui.noteOpen;
    const recent = SYS.habitNotes(task, 6).filter((n) => n.key !== day);
    const toggle = `
        <button class="log-note-toggle ${existing ? "has" : ""}" data-action="toggle-note" aria-expanded="${open}">
          ${icon("pencil", 12)} ${existing ? SYS.t("task.noteEdit") : SYS.t("task.noteAdd")}
        </button>`;
    if (!open) return toggle;
    return toggle + `
        <div class="log-note">
          <textarea class="field-input note-input" rows="2" maxlength="${SYS.MAX_NOTE_CHARS}"
            data-action="commit-note" data-id="${escapeHtml(task.id)}"
            placeholder="${SYS.t("task.notePlaceholder")}">${escapeHtml(existing)}</textarea>
          ${!recent.length ? "" : `<div class="note-list">
            ${recent.map((n) => `<div class="note-row ${n.done ? "done" : ""}">
              <span class="note-date">${escapeHtml(shortDate(n.key))}</span>
              <span class="note-text">${escapeHtml(n.note)}</span>
            </div>`).join("")}
          </div>`}
        </div>`;
  }

  // "Sep 10" rather than "2026-09-10": these are read in a list, next to
  // each other, where the year is the same on every line.
  function shortDate(key) {
    const [y, m, d] = String(key).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString(dateLocale(), { month: "short", day: "numeric" });
  }

  // The library. Grouped, because twenty-eight rows in one column is a list
  // to scroll rather than a thing to choose from.
  //
  // Each row shows what it will actually create — the amount and the schedule
  // — so picking one is not a surprise. What it does not show is the EXP: the
  // price comes from the server when it is added, and printing a number here
  // that the server has not issued yet would be inventing one.
  function renderLibraryModal(state, ui) {
    const mine = new Set(state.tasks.filter((x) => x.fromLibrary).map((x) => x.fromLibrary));
    const groups = SYS.LIBRARY_CATEGORIES.map((cat) => {
      const rows = SYS.HABIT_LIBRARY.filter((p) => p.category === cat).map((p) => {
        const added = mine.has(p.id);
        const busy = ui.libraryBusy === p.id;
        const amount = p.targetAmount + " " + SYS.tUnit(p.unit, p.targetAmount);
        return `
          <div class="lib-row ${added ? "added" : ""}">
            <span class="lib-emoji">${escapeHtml(p.emoji)}</span>
            <span class="lib-main">
              <span class="lib-title">${escapeHtml(SYS.t("preset." + p.id))}</span>
              <span class="lib-meta">${escapeHtml(amount)} · ${escapeHtml(SYS.scheduleLabel(p))}</span>
            </span>
            ${added
              ? `<span class="lib-done">${icon("check", 12)} ${SYS.t("library.have")}</span>`
              : `<button class="btn btn-outline btn-sm" data-action="add-from-library" data-id="${escapeHtml(p.id)}" ${busy || ui.libraryBusy ? "disabled" : ""}>${busy ? SYS.t("library.adding") : SYS.t("task.add")}</button>`}
          </div>`;
      }).join("");
      return `<div class="lib-group">
          <div class="modal-section-label">${SYS.t("presetCat." + cat)}</div>
          ${rows}
        </div>`;
    }).join("");

    return `
      <div class="modal-backdrop" data-action="close-library-backdrop">
        <div class="sys-panel modal-box modal-has-x" data-stop-close="1">
          <button class="wk-arrow modal-x" data-action="close-library" aria-label="${t("event.close")}">${icon("x", 15)}</button>
          <div class="modal-title">${t("library.title")}</div>
          <div class="form-hint" style="margin-bottom:14px;">${t("library.body")}</div>
          ${ui.cloudUser ? "" : `<div class="form-hint" style="color:var(--gold-text);margin-bottom:14px;">${t("library.signIn")}</div>`}
          ${ui.libraryError ? `<div class="form-hint" style="color:var(--rust-text);margin-bottom:14px;">${escapeHtml(ui.libraryError)}</div>` : ""}
          ${groups}
          <button class="btn btn-ghost" data-action="close-library" style="width:100%;margin-top:14px;">${t("form.cancel")}</button>
        </div>
      </div>`;
  }

  // The clock face. Three looks over one number: a ring that fills or
  // empties, flip cards, or the digits on their own.
  //
  // Only the last digit animates. The panel is redrawn whole every second,
  // so animating every card would mean all four flipping once a second — and
  // the only digit that certainly changed is the last one.
  function renderTimerFace(shownMs, pct, opts) {
    const style = opts.style;
    const caption = opts.caption
      ? `<div class="timer-of" id="timer-caption">${escapeHtml(opts.caption)}</div>`
      : "";
    const inner = `
      <div class="timer-face">
        <div id="timer-display" class="timer-clock">${fmtElapsed(shownMs)}</div>
        ${caption}
      </div>`;

    if (style === "flip") {
      const total = Math.floor(shownMs / 1000);
      const hours = Math.floor(total / 3600);
      // Over an hour the left pair becomes hours, which is the only way four
      // cards can carry it.
      const left = hours > 0 ? hours : Math.floor((total % 3600) / 60);
      const right = hours > 0 ? Math.floor((total % 3600) / 60) : total % 60;
      const digits = [
        Math.floor(left / 10) % 10, left % 10,
        Math.floor(right / 10) % 10, right % 10,
      ];
      return `
        <div class="timer-flip ${opts.running ? "live" : ""}">
          ${digits.map((d, i) => `<div class="flip-card ${i === 3 ? "ticking" : ""}"><span>${d}</span></div>`).join("")}
        </div>
        ${opts.caption ? `<div class="timer-of" id="timer-caption" style="margin-top:8px;">${escapeHtml(opts.caption)}</div>` : ""}`;
    }

    if (style === "plain") {
      return `<div class="timer-plain ${opts.running ? "live" : ""}">${inner}</div>`;
    }

    return `
      <div class="timer-ring ${opts.running ? "live" : ""}">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle class="ring-track" cx="60" cy="60" r="52" pathLength="100" />
          <circle class="ring-done" cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="${pct} 100" />
        </svg>
        ${inner}
      </div>`;
  }

  // The timer panel: a ring, the time, and one button that matters.
  //
  // Two ways to run it. A stopwatch counts up and you stop it when you are
  // done; a countdown counts down and logs itself at zero. The countdown is
  // the one that needs care, because it writes to the ledger without anyone
  // pressing anything — see finishCountdown in main.js.
  //
  // The ring means different things in each mode, and that is the point: it
  // empties as a countdown runs out, and fills as a stopwatch approaches the
  // day's goal.
  function renderTimerModal(state, ui) {
    const t = state.tasks.find((x) => x.id === ui.timer.taskId);
    if (!t) return "";
    const s = state.settings || {};
    const countdown = ui.timer.mode === "countdown";
    const running = !!ui.timer.running;
    const elapsedMs = ui.timer.accumulatedMs + (running ? (Date.now() - ui.timer.startedAt) : 0);

    // Both modes count the day: what the habit already holds, plus the part
    // of this session not yet written to it. One counts it up, the other
    // counts what is left of the goal.
    const goalBase = SYS.habitGoalBase(t);
    const doneBase = SYS.habitAmountOn(t, SYS.todayKey());
    const unflushedMs = Math.max(0, elapsedMs - (Number(ui.timer.loggedMs) || 0));
    const todayMs = doneBase * 1000 + unflushedMs;
    const shownMs = countdown ? ceilSecond(goalBase * 1000 - todayMs) : todayMs;
    const pct = SYS.timerRingPct(t, todayMs);

    // Set when the timer was opened from a different habit's card: there is
    // one timer, and this is where it currently is.
    const busyElsewhere = ui.timerOpenedFor && ui.timerOpenedFor !== t.id;
    const busy = busyElsewhere
      ? `<div class="form-hint" style="color:var(--gold-text);margin:12px 0 0;line-height:1.5;">${SYS.t("timer.busyOn", { title: escapeHtml(t.title) })}</div>`
      : "";
    const restored = ui.timer.capped
      ? `<div class="form-hint" style="color:var(--gold-text);margin:12px 0 0;line-height:1.5;">${SYS.t("timer.capped")}</div>`
      : ui.timer.restored
        ? `<div class="form-hint" style="color:var(--gold-text);margin:12px 0 0;line-height:1.5;">${SYS.t("timer.restored")}</div>`
        : "";

    const idle = !running && (Number(ui.timer.loggedMs) || 0) < 1000 && elapsedMs < 1000;
    const modeRow = `
        <div class="timer-modes">
          ${["stopwatch", "countdown"].map((m) => `<button class="timer-mode ${ui.timer.mode === m ? "on" : ""}" data-action="timer-mode" data-mode="${m}">${SYS.t("timer." + m)}</button>`).join("")}
        </div>`;
    // No length to choose: the habit's goal is the length. Changing how long
    // the countdown runs means changing what the day asks for, and that
    // belongs in the habit, not in a timer.

    // One button. Everything measured is written down as it goes, so there is
    // nothing a second button could do that pausing does not already do.
    const controls = `
        <div class="timer-controls">
          ${running
            ? `<button class="btn btn-primary timer-play" data-action="timer-pause">${icon("pause", 15)} ${SYS.t("timer.pause")}</button>`
            : `<button class="btn btn-primary timer-play" data-action="timer-start">${icon("play", 15)} ${idle ? SYS.t("timer.start") : SYS.t("timer.resume")}</button>`}
        </div>`;

    const tools = `
        <div class="timer-tools">
          <button class="timer-tool ${ui.timerPanel === "style" ? "on" : ""}" data-action="timer-style-panel">${icon("grid", 12)} ${SYS.t("timer.style")}</button>
          <button class="timer-tool ${ui.timerPanel === "sound" ? "on" : ""}" data-action="timer-sound-panel">${icon("bell", 13)} ${SYS.t("timer.sound")}</button>
          <button class="timer-tool ${ui.noteOpen ? "on" : ""}" data-action="toggle-note">${icon("pencil", 12)} ${SYS.t("timer.note")}</button>
        </div>`;

    return `
      <div class="modal-backdrop" data-action="close-timer-backdrop">
        <div class="sys-panel modal-box timer-sheet" data-stop-close="1">
          <div class="modal-title">${SYS.t("timer.title")}</div>
          <div class="timer-habit">${U.taskIconHtml(t)} ${escapeHtml(t.title)}</div>

          ${renderTimerFace(shownMs, pct, {
            style: (s.timerStyle === "flip" || s.timerStyle === "plain") ? s.timerStyle : "ring",
            running,
            caption: countdown ? "" : timerCaption(t, todayMs),
          })}

          ${modeRow}
          ${controls}
          ${tools}
          ${ui.timerPanel === "style" ? renderStylePicker(state) : ""}
          ${ui.timerPanel === "sound" ? renderSoundPicker(state, ui) : ""}
          ${ui.noteOpen ? renderDayNote(t, ui) : ""}
          ${busy}${restored}
          <div class="btn-row" style="gap:8px;margin-top:14px;">
            <button class="btn btn-ghost" data-action="close-timer" style="flex:1;">${SYS.t(running ? "timer.hide" : "timer.keep")}</button>
            <button class="btn btn-ghost" data-action="timer-discard" style="flex:1;" ${(Number(ui.timer.loggedMs) || 0) < 1000 ? "disabled" : ""}>${SYS.t("timer.discard")}</button>
          </div>
        </div>
      </div>`;
  }

  // Three looks, shown by name. Small enough that a preview would be more
  // clutter than help — the clock above changes as soon as one is picked.
  function renderStylePicker(state) {
    const chosen = (state.settings || {}).timerStyle || "ring";
    return `
        <div class="sound-picker">
          <div class="sound-list">
            ${["ring", "flip", "plain"].map((k) => `<button class="sound-row ${k === chosen ? "on" : ""}" data-action="pick-style" data-style="${k}">
              <span class="sound-name">${SYS.t("style." + k)}</span>
              ${k === chosen ? icon("check", 13) : ""}
            </button>`).join("")}
          </div>
        </div>`;
  }

  // Two lists, one tab each, like every sound picker anyone has used. Pressing
  // a name plays it: a list of words for sounds is unusable otherwise.
  function renderSoundPicker(state, ui) {
    const s = state.settings || {};
    const tab = ui.soundTab === "end" ? "end" : "focus";
    const names = tab === "end" ? SYS.END_SOUNDS : SYS.FOCUS_SOUNDS;
    const chosen = tab === "end" ? (s.endSound || "default") : (s.focusSound || "silent");
    return `
        <div class="sound-picker">
          <div class="sound-tabs">
            ${["focus", "end"].map((k) => `<button class="sound-tab ${tab === k ? "on" : ""}" data-action="timer-sound-tab" data-tab="${k}">${SYS.t(k === "end" ? "timer.endNotification" : "timer.focusSound")}</button>`).join("")}
          </div>
          ${tab === "focus" ? `<div class="form-hint" style="margin-bottom:8px;">${SYS.t("timer.pickHint")}</div>` : ""}
          <div class="sound-list">
            ${names.map((n) => {
              // A recording is fetched the first time it is chosen, and two
              // seconds of nothing after a press is indistinguishable from a
              // broken button — so the row says what is happening.
              const loading = SYS.soundLoading && SYS.soundLoading() === n;
              const sounding = tab === "focus" && SYS.currentFocusSound && SYS.currentFocusSound() === n && n !== "silent";
              const dead = tab === "focus" && SYS.soundUnavailable && SYS.soundUnavailable(n);
              const right = loading ? `<span class="sound-loading">${SYS.t("sound.loading")}</span>`
                : dead ? `<span class="sound-loading">${SYS.t("sound.unavailable")}</span>`
                : sounding ? `<span class="sound-playing">${SYS.t("sound.playing")}</span>`
                : n === chosen ? icon("check", 13) : "";
              return `<button class="sound-row ${n === chosen ? "on" : ""} ${sounding ? "sounding" : ""}" data-action="pick-sound" data-kind="${tab}" data-name="${n}">
              <span class="sound-name">${SYS.t("sound." + n)}</span>
              ${right}
            </button>`;
            }).join("")}
          </div>
          <div class="form-hint" style="margin-top:8px;line-height:1.5;">${SYS.t(tab === "end" ? "timer.soundsMade" : "timer.soundsFiles")}</div>
        </div>`;
  }
  // Reminders, in Settings rather than per habit: permission is a decision
  // about the whole app, and the times themselves live on the habits.
  //
  // The three things that have to be true are reported separately, because
  // they fail separately and each has a different fix — the app not being
  // installed, permission not granted, and no subscription stored are not
  // one problem with one answer.
  function renderRemindersSection(ui) {
    const state = ui.pushState || "unknown";
    const withTimes = (ui.remindCount || 0);
    if (!SYS.pushSupported || !SYS.pushSupported()) {
      const needsInstall = SYS.pushNeedsInstall && SYS.pushNeedsInstall();
      return `
        <div class="modal-section-label">${t("push.section")}</div>
        <div class="form-hint" style="line-height:1.6;">${needsInstall ? t("push.installFirst") : t("push.unsupported")}</div>`;
    }
    if (!ui.cloudUser) {
      return `
        <div class="modal-section-label">${t("push.section")}</div>
        <div class="form-hint">${t("push.signIn")}</div>`;
    }
    const line = state === "enabled" ? t("push.on")
      : state === "denied" ? t("push.blocked")
      : state === "busy" ? t("push.working")
      : t("push.off");
    return `
      <div class="modal-section-label">${t("push.section")}</div>
      <div class="form-hint" style="margin-bottom:10px;line-height:1.6;">${line}</div>
      ${state === "enabled" && withTimes === 0 ? `<div class="form-hint" style="color:var(--gold-text);margin-bottom:10px;line-height:1.6;">${t("push.noTimes")}</div>` : ""}
      <div class="btn-row" style="gap:8px;">
        ${state === "enabled"
          ? `<button class="btn btn-ghost" data-action="push-disable">${t("push.turnOff")}</button>`
          : `<button class="btn btn-primary" data-action="push-enable" ${state === "busy" || state === "denied" ? "disabled" : ""}>${t("push.turnOn")}</button>`}
      </div>
      ${ui.pushError ? `<div class="form-hint" style="color:var(--rust-text);margin-top:10px;line-height:1.6;">${escapeHtml(ui.pushError)}</div>` : ""}`;
  }

  // Everyone this account has blocked, by their current name, so a block can
  // be undone without having to find the person again.
  function renderBlockedList(ui) {
    const list = ui.blockedList;
    let body;
    if (!list) body = `<div class="form-hint">${t("lb.loading")}</div>`;
    else if (!list.length) body = `<div class="form-hint">${t("blocks.none")}</div>`;
    else body = list.map((b) => `
      <div class="friend-row">
        <button class="friend-name blocked-who" data-action="open-profile" data-uid="${escapeHtml(b.uid)}">
          <span class="blocked-avatar">${portraitImg(b.avatar, 64, "", b.uid)}</span>
          <span>${b.name ? escapeHtml(b.name) : t("blocks.noName")}</span>
        </button>
        <button class="btn btn-outline btn-sm" data-action="unblock" data-uid="${escapeHtml(b.uid)}" ${ui.unblockBusy === b.uid ? "disabled" : ""}>${t("profile.unblock")}</button>
      </div>`).join("");
    return `<div class="modal-section-label">${t("blocks.title")}</div>${body}`;
  }

  function renderAccountSection(ui) {
    if (!SYS.Cloud || !SYS.Cloud.available()) {
      return `
        <div class="modal-section-label">${t("account.section")}</div>
        <div class="form-hint">${t("account.notSetUp")}</div>`;
    }
    if (ui.cloudUser) {
      const unverified = ui.cloudUser.emailVerified === false;
      return `
        <div class="modal-section-label">${t("account.section")}</div>
        <div style="font-size:13px;color:var(--ink);margin-bottom:10px;">${t("account.signedInAs")} <b>${escapeHtml(ui.cloudUser.email)}</b></div>
        ${unverified ? `
          <div style="font-size:12px;color:var(--gold-text);margin-bottom:10px;line-height:1.5;">
            ${t("account.unverified")}
            <button class="link-btn" style="margin-inline-start:4px;" data-action="account-resend-verification">${t("account.resend")}</button>
          </div>` : ""}
        ${ui.syncStatus ? `<div class="form-hint" style="margin-bottom:4px;">${escapeHtml(ui.syncStatus)}</div>` : ""}
        ${ui.nameClaimed ? "" : `<div class="form-hint" style="margin-bottom:10px;color:var(--gold-text);">${t("name.unclaimed")}</div>`}
        <div class="btn-row" style="flex-wrap:wrap;">
          <button class="btn btn-primary" data-action="open-my-profile">${t("profile.mine")}</button>
          <button class="btn btn-outline" data-action="account-sign-out">${t("account.signOut")}</button>
        </div>
        <button class="link-btn delete-account-link" data-action="open-delete-account">${t("delete.title")}</button>`;
    }
    const f = ui.accountForm || { mode: "signin", email: "", password: "", error: null, info: null, busy: false };
    return `
      <div class="modal-section-label">${t("account.section")}</div>
      <button class="btn btn-outline btn-icon-inline" style="width:100%;justify-content:center;" data-action="account-google">${GOOGLE_ICON_SVG} ${t("account.continueGoogle")}</button>
      <hr class="hr" style="margin:14px 0;" />
      <div class="theme-switcher" style="margin-bottom:12px;">
        <button class="theme-option ${f.mode === "signin" ? "active" : ""}" data-action="set-account-mode" data-mode="signin">${t("account.signIn")}</button>
        <button class="theme-option ${f.mode === "signup" ? "active" : ""}" data-action="set-account-mode" data-mode="signup">${t("account.createAccount")}</button>
      </div>
      <input class="field-input" style="margin-bottom:8px;" type="email" placeholder="${t("account.email")}" data-bind="accountForm.email" value="${escapeHtml(f.email)}" />
      <input class="field-input" style="margin-bottom:10px;" type="password" placeholder="${t("account.password")}" data-bind="accountForm.password" value="${escapeHtml(f.password)}" />
      ${f.mode === "signin" ? `<button class="link-btn" style="display:block;margin-top:-4px;margin-bottom:10px;" data-action="account-forgot-password">${t("account.forgot")}</button>` : ""}
      ${f.error ? `<div class="toast-error" style="margin-bottom:10px;">${escapeHtml(f.error)}</div>` : ""}
      ${f.info ? `<div class="form-hint" style="color:var(--gold-text);margin-bottom:10px;">${escapeHtml(f.info)}</div>` : ""}
      <button class="btn btn-primary" data-action="account-submit" ${f.busy ? "disabled" : ""}>${f.busy ? t("account.wait") : (f.mode === "signup" ? t("account.createBtn") : t("account.signInBtn"))}</button>
      <div class="form-hint" style="margin-top:8px;">${t("account.hint")}</div>`;
  }

  function renderSettingsModal(state, ui) {
    const s = ui.settingsDraft || state.settings;
    // Dropdowns rather than a row of pills: both lists are open-ended (more
    // themes and languages are expected), and seven pills already wrapped and
    // collided. A native select also scales to any length and gets the
    // platform's own picker and hover highlighting for free.
    const themeSelect = (action, names, current) =>
      `<select class="field-select" data-action="${action}">${names.map((name) =>
        `<option value="${escapeHtml(name)}" ${current === name ? "selected" : ""}>${escapeHtml(themeName(name))}</option>`
      ).join("")}</select>`;
    // Only what this account owns; the rest are in the shop.
    const owned = Object.keys(SYS.THEMES).filter((n) => SYS.ownsTheme(ui.wallet, n));
    const appearance = themeSelect("set-theme", owned, state.settings.theme);
    const languageOptions = Object.keys(SYS.LANGUAGES).map((code) =>
      `<option value="${code}" ${SYS.currentLanguage() === code ? "selected" : ""}>${escapeHtml(SYS.LANGUAGES[code].name)}</option>`
    ).join("");
    return `
      <div class="modal-backdrop" data-action="close-modal-backdrop">
        <div class="sys-panel modal-box modal-has-x" data-stop-close="1">
          <button class="wk-arrow modal-x" data-action="close-modal" aria-label="${t("event.close")}">${icon("x", 15)}</button>
          <div class="modal-title">${t("settings.title")}</div>

          <div class="modal-section">
            <div class="modal-section-label">${t("settings.appearance")}</div>
            ${appearance}
            ${ui.cloudUser ? `<div style="margin-top:10px;">
              <button class="btn btn-outline btn-icon-inline" data-action="open-shop">${navImg("shop")} ${t("nav.shop")}</button>
            </div>` : ""}
          </div>

          <hr class="hr" />

          <div class="modal-section">
            <div class="modal-section-label">${t("settings.language")}</div>
            <select class="field-select" data-action="set-language">${languageOptions}</select>
          </div>

          <hr class="hr" />

          <div class="modal-section">
            ${renderAccountSection(ui)}
          </div>

          <hr class="hr" />

          <div class="modal-section">
            ${renderRemindersSection(ui)}
          </div>

          <hr class="hr" />


          <div class="modal-section">
            <div class="modal-section-label">${t("guide.section")}</div>
            <button class="btn btn-outline btn-icon-inline" data-action="open-guide">${t("guide.open")}</button>
          </div>

          <hr class="hr" />

          <div class="modal-section">
            <div class="modal-section-label">${t("feedback.title")}</div>
            <div class="form-hint" style="margin-top:0;line-height:1.5;">${t("feedback.settingsHint")}</div>
            <button class="btn btn-outline btn-icon-inline" data-action="open-feedback" style="margin-top:8px;">${icon("flag", 13)} ${t("feedback.open")}</button>
          </div>

          <hr class="hr" />


          <button class="btn btn-ghost" data-action="close-modal" style="width:100%;">${t("settings.close")}</button>
        </div>
      </div>`;
  }

  Object.assign(U, { renderShopPage, NOTIF_STYLE, renderNotifStack, renderRankupLayer, renderModalLayer, renderTimeSheet, SYNC_AREAS, syncAreas, renderSyncChoiceModal, renderSyncDiagnosis, fmtElapsed, renderQuitSheet, renderLogSheet, renderDayNote, shortDate, renderLibraryModal, renderTimerFace, renderTimerModal, renderStylePicker, renderSoundPicker, renderRemindersSection, renderBlockedList, renderAccountSection, renderSettingsModal });
})(window.SYS = window.SYS || {});

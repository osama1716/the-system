// The weekly report: one week of work in one window, and the same week drawn
// as a picture to share. It opens by itself on the first visit of a new week
// (for the week just finished), and from the overview's week window at any
// time. The picture is drawn here, on a canvas, from the app's own fonts and
// art, so it looks like the app and needs no server.
(function (SYS) {
  "use strict";
  const U = SYS._ui || (SYS._ui = {});
  const { t, escapeHtml, icon, intArt, intName, rankArt, dateLocale } = U;

  // What a week (offset 0 = this one, -1 = the last) adds up to. Daily
  // Quests are the calendar's perfect days, out of the days that asked for
  // anything; goals met are habits finished on days that asked for them.
  // "Grew most" reads the per-day score snapshots: where each intelligence
  // stood at the week's end, less where it stood before the week began.
  function weekReport(state, offset) {
    const wk = SYS.statsWeek(state, offset);
    const today = SYS.todayKey();
    const days = wk.days.map((d) => {
      const past = d.dateKey <= today;
      const ring = past ? SYS.dayRing(state, d.dateKey) : { required: 0, complete: 0, perfect: false };
      return { key: d.dateKey, date: d.date, xp: d.xp, quests: d.quests, asked: ring.required > 0, perfect: ring.perfect, goals: ring.complete, future: !past };
    });
    const sum = (f) => days.reduce((s, d) => s + f(d), 0);
    const best = days.reduce((b, d) => (d.xp > (b ? b.xp : 0) ? d : b), null);
    const start = days[0].key, end = days[6].key;
    const log = Array.isArray(state.player && state.player.scoreLog) ? state.player.scoreLog : [];
    let base = null, last = null;
    log.forEach((e) => { if (e && e.d < start) base = e.s || {}; if (e && e.d <= end) last = e.s || {}; });
    if (!base) base = (state.player && state.player.scoreFloor) || {};
    let grew = null;
    (state.intTypes || []).forEach((type) => {
      if (!state.intelligences[type.key]) return;
      const now = offset === 0 || !last ? SYS.categoryScore(state.intelligences[type.key]) : Number(last[type.key]) || 0;
      const n = now - (Number(base[type.key]) || 0);
      if (n > 0 && (!grew || n > grew.n)) grew = { type, n };
    });
    return {
      offset, start, end, days, best,
      xp: sum((d) => d.xp),
      questDays: sum((d) => (d.perfect ? 1 : 0)),
      askedDays: sum((d) => (d.asked ? 1 : 0)),
      goals: sum((d) => d.goals),
      quests: sum((d) => d.quests),
      grew,
    };
  }
  SYS.weekReport = weekReport;

  const num = (n) => Number(n || 0).toLocaleString("en-US");
  function rangeLabel(r) {
    const f = (d) => d.toLocaleDateString(dateLocale(), { month: "short", day: "numeric" });
    return f(r.days[0].date) + " – " + f(r.days[6].date);
  }
  const dayShort = (d) => d.toLocaleDateString(dateLocale(), { weekday: "short" });
  const dayLong = (d) => d.toLocaleDateString(dateLocale(), { weekday: "long" });

  function renderWeekCardModal(state, ui) {
    const w = ui.weekCard || { offset: -1 };
    const r = weekReport(state, w.offset);
    const max = Math.max(1, ...r.days.map((d) => d.xp));
    const me = ui.cloudUser || ui.lastMe;
    const p = state.player;
    const tile = (label, value) => `<div class="wkr-tile"><span class="wkr-k">${label}</span><span class="wkr-v" dir="ltr">${value}</span></div>`;
    const tab = (off, key) => `<button class="chip filter-chip ${w.offset === off ? "active" : ""}" data-action="week-card-tab" data-offset="${off}" aria-pressed="${w.offset === off}">${t(key)}</button>`;
    return `
      <div class="modal-backdrop" data-action="close-modal-backdrop">
        <div class="sys-panel modal-box wkr-box" data-stop-close="1" role="dialog" aria-label="${escapeHtml(t("wk.title"))}">
          <div class="modal-title">${t("wk.title")}</div>
          <div class="planner-tabs wkr-tabs">${tab(-1, "wk.lastWeek")}${tab(0, "wk.thisWeek")}</div>
          <div class="wkr-range" dir="auto">${escapeHtml(rangeLabel(r))}</div>
          <div class="wkr-who">
            <span class="wkr-face">${U.avatarImg(ui, me && me.uid, 64)}</span>
            <span class="wkr-name"><b>${escapeHtml(p.name)}</b><span dir="ltr">${t("status.level", { n: p.level })}</span></span>
            <span class="wkr-rank">${rankArt(p.rank, 44)}</span>
          </div>
          <div class="wkr-grid">
            ${tile(t("wk.exp"), "+" + num(r.xp))}
            ${tile(t("wk.quests"), r.questDays + "/" + r.askedDays)}
            ${tile(t("wk.goals"), num(r.goals))}
            ${tile(t("wk.questsDone"), num(r.quests))}
          </div>
          <div class="wkr-days">
            ${r.days.map((d) => `
              <div class="wkr-day ${d.perfect ? "perfect" : ""} ${d.future ? "future" : ""}" title="${escapeHtml(dayLong(d.date))} · ${escapeHtml(num(d.xp))}">
                <span class="wkr-mark" aria-hidden="true"></span>
                <span class="wkr-bar"><span style="height:${d.xp > 0 ? Math.max(6, Math.round((d.xp / max) * 100)) : 0}%"></span></span>
                <span class="wkr-dl">${escapeHtml(dayShort(d.date))}</span>
              </div>`).join("")}
          </div>
          <div class="wkr-lines">
            ${r.grew ? `<div class="wkr-line"><span class="wkr-k">${t("wk.growth")}</span><span class="wkr-grew">${intArt(r.grew.type, 22)}<span>${escapeHtml(intName(r.grew.type))}</span><b dir="ltr">+${num(r.grew.n)}</b></span></div>` : ""}
            ${r.best ? `<div class="wkr-line"><span class="wkr-k">${t("wk.bestDay")}</span><span>${escapeHtml(dayLong(r.best.date))} <b>${escapeHtml(t("overview.weekTotal", { n: num(r.best.xp) }))}</b></span></div>` : ""}
          </div>
          <div class="btn-row wkr-actions">
            <button class="btn btn-primary" data-action="week-card-share" ${w.busy ? "disabled" : ""}>${icon("share", 14)} ${t("wk.share")}</button>
            <button class="btn btn-outline" data-action="close-modal">${t("settings.close")}</button>
          </div>
        </div>
      </div>`;
  }
  SYS.renderWeekCardModal = renderWeekCardModal;

  // ---------- the picture ---------------------------------------------------
  // 1080 × 1350, the portrait size feeds show whole. A System window: navy,
  // a cyan rim with a faint inner rim and corner notches, the title in a tag
  // between two rules. Arabic is laid out mirrored, as the app is.
  const W = 1080, H = 1350;
  const LINE = "#8fdcff", SOFT = "rgba(143,220,255,.32)", GLOW = "rgba(56,170,255,.75)", INK = "#eaf6ff", DIM = "rgba(234,246,255,.55)";

  function loadImage(src) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = src;
    });
  }

  async function weekCardImage(state, ui, offset) {
    const r = weekReport(state, offset);
    const rtl = SYS.currentDir() === "rtl";
    const me = ui.cloudUser || ui.lastMe;
    const p = state.player;
    const DISPLAY = rtl ? "Changa, Rajdhani, sans-serif" : "Rajdhani, Changa, sans-serif";
    const BODY = rtl ? "Changa, Outfit, sans-serif" : "Outfit, Changa, sans-serif";
    const MONO = "'IBM Plex Mono', Changa, monospace";
    const sample = [t("wk.title"), t("wk.exp"), t("wk.quests"), t("wk.goals"), t("wk.questsDone"), t("wk.growth"), t("wk.bestDay"), p.name, rangeLabel(r)].join(" ") + " 0123456789+/";
    await Promise.all(["700 40px Rajdhani", "600 40px Rajdhani", "600 40px Outfit", "700 40px Changa", "600 40px Changa", "400 40px 'IBM Plex Mono'"]
      .map((f) => document.fonts.load(f, sample).catch(() => null)));
    const [logo, face, emblem, grewArt] = await Promise.all([
      loadImage("icons/mark-on-dark.png"),
      loadImage(SYS.avatarSrc(U.avatarOf(ui, me && me.uid), 256)),
      (SYS.RANK_ART || []).indexOf(p.rank) >= 0 ? loadImage("assets/ranks/" + encodeURIComponent(p.rank) + "-512.webp") : null,
      r.grew && (SYS.INT_ART || []).indexOf(r.grew.type.key) >= 0 ? loadImage(SYS.intArtSrc(r.grew.type.key, 96)) : null,
    ]);

    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.direction = rtl ? "rtl" : "ltr";
    const X = (x) => (rtl ? W - x : x);
    const start = rtl ? "right" : "left", end = rtl ? "left" : "right";
    const spaced = (em) => { if ("letterSpacing" in g) g.letterSpacing = rtl ? "0px" : em + "px"; };
    const text = (s, x, y, font, color, align, glow) => {
      g.save(); g.font = font; g.fillStyle = color; g.textAlign = align || start; g.textBaseline = "alphabetic";
      if (glow) { g.shadowColor = GLOW; g.shadowBlur = glow; }
      g.fillText(s, x, y); g.restore();
    };

    // the night behind the window
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#04122a"); bg.addColorStop(1, "#020812");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const halo = g.createRadialGradient(W / 2, 260, 40, W / 2, 260, 760);
    halo.addColorStop(0, "rgba(56,170,255,.20)"); halo.addColorStop(1, "rgba(56,170,255,0)");
    g.fillStyle = halo; g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(143,220,255,.05)"; g.lineWidth = 1;
    for (let x = 0; x <= W; x += 54) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke(); }
    for (let y = 0; y <= H; y += 54) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }

    // the window: rim, inner rim, notched corners
    const M0 = 56, M1 = 70;
    g.save(); g.fillStyle = "rgba(6,18,38,.72)"; g.fillRect(M0, M0, W - 2 * M0, H - 2 * M0);
    g.shadowColor = GLOW; g.shadowBlur = 28; g.strokeStyle = LINE; g.lineWidth = 3; g.strokeRect(M0, M0, W - 2 * M0, H - 2 * M0); g.restore();
    g.strokeStyle = SOFT; g.lineWidth = 1.5; g.strokeRect(M1, M1, W - 2 * M1, H - 2 * M1);
    g.save(); g.strokeStyle = LINE; g.lineWidth = 7; g.shadowColor = GLOW; g.shadowBlur = 16;
    [[M0 - 8, M0 - 8, 1, 1], [W - M0 + 8, M0 - 8, -1, 1], [M0 - 8, H - M0 + 8, 1, -1], [W - M0 + 8, H - M0 + 8, -1, -1]].forEach(([x, y, sx, sy]) => {
      g.beginPath(); g.moveTo(x, y + sy * 46); g.lineTo(x, y); g.lineTo(x + sx * 46, y); g.stroke();
    });
    g.restore();

    // the brand
    if (logo) { const s = 62; g.drawImage(logo, W / 2 - 150, 104, s * (logo.width / logo.height), s); }
    spaced(6); text("THE SYSTEM", W / 2 - 66, 148, "700 34px Rajdhani, sans-serif", INK, "left"); spaced(0);

    // the title, in its tag between two rules
    g.save(); g.font = "700 46px " + DISPLAY; spaced(10);
    const title = rtl ? t("wk.title") : t("wk.title").toUpperCase();
    const tw = g.measureText(title).width + 64;
    g.restore();
    const ty = 196, th = 74;
    g.strokeStyle = SOFT; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(M1 + 30, ty + th / 2); g.lineTo(W / 2 - tw / 2 - 18, ty + th / 2); g.moveTo(W / 2 + tw / 2 + 18, ty + th / 2); g.lineTo(W - M1 - 30, ty + th / 2); g.stroke();
    g.save(); g.fillStyle = "rgba(56,170,255,.12)"; g.fillRect(W / 2 - tw / 2, ty, tw, th);
    g.shadowColor = GLOW; g.shadowBlur = 18; g.strokeStyle = LINE; g.lineWidth = 2.5; g.strokeRect(W / 2 - tw / 2, ty, tw, th); g.restore();
    spaced(10); text(title, W / 2, ty + 51, "700 46px " + DISPLAY, "#ffffff", "center", 14); spaced(0);
    text(rangeLabel(r), W / 2, 330, "400 30px " + MONO, DIM, "center");

    // who
    const fy = 376, fs = 150;
    if (face) {
      g.save(); g.beginPath(); g.arc(X(M1 + 60 + fs / 2), fy + fs / 2, fs / 2, 0, Math.PI * 2); g.clip();
      g.drawImage(face, X(M1 + 60 + fs / 2) - fs / 2, fy, fs, fs); g.restore();
    }
    g.save(); g.shadowColor = GLOW; g.shadowBlur = 16; g.strokeStyle = LINE; g.lineWidth = 4;
    g.beginPath(); g.arc(X(M1 + 60 + fs / 2), fy + fs / 2, fs / 2 + 4, 0, Math.PI * 2); g.stroke(); g.restore();
    text(p.name, X(M1 + 60 + fs + 34), fy + 70, "600 54px " + BODY, "#ffffff", start);
    spaced(4); text(t("status.level", { n: p.level }), X(M1 + 60 + fs + 36), fy + 122, "700 34px " + DISPLAY, LINE, start); spaced(0);
    if (emblem) { const eh = 150, ew = eh * (emblem.width / emblem.height); g.drawImage(emblem, rtl ? M1 + 60 : W - M1 - 60 - ew, fy, ew, eh); }

    // the four figures
    const tiles = [[t("wk.exp"), "+" + num(r.xp)], [t("wk.quests"), r.questDays + "/" + r.askedDays], [t("wk.goals"), num(r.goals)], [t("wk.questsDone"), num(r.quests)]];
    const gx = M1 + 40, gw = (W - 2 * M1 - 80 - 28) / 2, gh = 150, gy = 566;
    tiles.forEach(([label, value], i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x0 = rtl ? W - gx - gw - col * (gw + 28) : gx + col * (gw + 28), y0 = gy + row * (gh + 24);
      g.fillStyle = "rgba(10,30,60,.55)"; g.fillRect(x0, y0, gw, gh);
      g.strokeStyle = SOFT; g.lineWidth = 1.5; g.strokeRect(x0, y0, gw, gh);
      g.fillStyle = LINE; g.fillRect(rtl ? x0 + gw - 5 : x0, y0, 5, gh);
      spaced(4); text(rtl ? label : label.toUpperCase(), rtl ? x0 + gw - 28 : x0 + 28, y0 + 48, "700 26px " + DISPLAY, DIM, rtl ? "right" : "left"); spaced(0);
      g.save(); g.direction = "ltr"; text(value, rtl ? x0 + gw - 28 : x0 + 28, y0 + 124, "700 74px Rajdhani, sans-serif", "#ffffff", rtl ? "right" : "left", 18); g.restore();
    });

    // the seven days
    const by = 922, bh = 150, bx0 = M1 + 60, bw = W - 2 * M1 - 120, step = bw / 7, max = Math.max(1, ...r.days.map((d) => d.xp));
    g.strokeStyle = SOFT; g.lineWidth = 1.5; g.beginPath(); g.moveTo(bx0, by + bh + 0.5); g.lineTo(bx0 + bw, by + bh + 0.5); g.stroke();
    r.days.forEach((d, i) => {
      const cx = X(bx0 + step * i + step / 2);
      const h = d.xp > 0 ? Math.max(8, Math.round((d.xp / max) * (bh - 24))) : 0;
      if (h) {
        const grad = g.createLinearGradient(0, by + bh - h, 0, by + bh);
        grad.addColorStop(0, "#bfeaff"); grad.addColorStop(1, "rgba(56,170,255,.55)");
        g.save(); if (d.perfect) { g.shadowColor = GLOW; g.shadowBlur = 18; }
        g.fillStyle = grad; g.fillRect(cx - 22, by + bh - h, 44, h); g.restore();
      } else { g.fillStyle = SOFT; g.fillRect(cx - 22, by + bh - 4, 44, 4); }
      if (d.perfect) {   // a met Daily Quest: a lit diamond over the day
        const my = by + bh - h - 22;
        g.save(); g.fillStyle = "#ffffff"; g.shadowColor = GLOW; g.shadowBlur = 14;
        g.beginPath(); g.moveTo(cx, my - 9); g.lineTo(cx + 9, my); g.lineTo(cx, my + 9); g.lineTo(cx - 9, my); g.closePath(); g.fill(); g.restore();
      }
      text(dayShort(d.date), cx, by + bh + 40, "500 26px " + BODY, d.perfect ? INK : DIM, "center");
    });

    // what grew, and the best day
    let ly = 1180;
    const line = (label, value, art) => {
      spaced(4); text(rtl ? label : label.toUpperCase(), X(M1 + 60), ly, "700 26px " + DISPLAY, DIM, start); spaced(0);
      text(value, X(W - M1 - 60), ly, "600 32px " + BODY, INK, end);
      if (art) { g.save(); g.font = "600 32px " + BODY; const vw = g.measureText(value).width; g.restore(); g.drawImage(art, rtl ? M1 + 60 + vw + 14 : W - M1 - 60 - vw - 14 - 40, ly - 32, 40, 40); }
      ly += 62;
    };
    // the figure kept left-to-right, or Arabic shows "+9" as "9+"
    if (r.grew) line(t("wk.growth"), intName(r.grew.type) + "  " + String.fromCharCode(0x2066) + "+" + num(r.grew.n) + String.fromCharCode(0x2069), grewArt);
    if (r.best) line(t("wk.bestDay"), dayLong(r.best.date) + " · " + t("overview.weekTotal", { n: num(r.best.xp) }));

    return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/png"));
  }
  SYS.weekCardImage = weekCardImage;

  Object.assign(U, { weekReport, renderWeekCardModal, weekCardImage });
})(window.SYS = window.SYS || {});

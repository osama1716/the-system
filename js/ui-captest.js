// UI: the capability tests — the Abilities window on the overview, and the test itself,
// drawn in the assessment's layer (js/main-captest.js runs it).
// One of the files ui.js was split into; the names they share travel through SYS._ui.
(function (SYS) {
  "use strict";
  const U = SYS._ui || (SYS._ui = {});
  const { dateLocale, escapeHtml, icon, t } = U;

  const corners = `<i class="sysw-c tl"></i><i class="sysw-c tr"></i><i class="sysw-c bl"></i><i class="sysw-c br"></i>`;
  const dayOf = (ms) => new Date(ms).toLocaleDateString(dateLocale(), { weekday: "short", day: "numeric", month: "short" });
  // An age range keeps its own direction inside an Arabic sentence ("55+", not "+55").
  const iso = (band) => "⁦" + band + "⁩";
  const memoryOf = (state) => (((state && state.settings) || {}).capability || {}).memory || null;
  SYS.capMemoryOf = memoryOf;

  // What a span says about its owner, under the number: where it stands among
  // people of the same age, or that it waits for a retake.
  function standing(r) {
    if (!r || !r.span) return "";
    if (r.pending) return t("cap.pending");
    if (r.pct != null) return t("cap.better", { pct: r.pct, band: iso(r.band) });
    return t("cap.fewYet", { band: iso(r.band) });
  }

  // The overview's window. Kept apart from the STATUS window on purpose: the
  // rank there is what you did; this is what you can do, and only a test
  // taken here moves it.
  function renderAbilityWindow(state) {
    const r = memoryOf(state);
    const value = r && r.span ? r.span : t("cap.take");
    const line = standing(r);
    return `
      <section class="sys-panel sysw-win sysw-ability">${corners}
        <div class="sysw-head"><span class="sysw-tag">${t("cap.title")}</span></div>
        <button class="sysw-row" data-action="cap-open" data-test="memory"><span>${t("cap.memory")}</span><span class="sysw-count">${escapeHtml(String(value))}</span></button>
        ${line ? `<div class="cap-line">${escapeHtml(line)}</div>` : ""}
      </section>`;
  }
  SYS.renderAbilityWindow = renderAbilityWindow;

  // Digits keep their places in every language, as on the amount keypad. It
  // stays on screen, shut, while the digits show, so the window keeps one size
  // through the whole test instead of growing when it is time to answer.
  function keypad(len, typed, shut) {
    const off = shut ? " disabled" : "";
    const key = (k, label, cls, aria) => `<button class="pad-key ${cls || ""}" data-action="cap-key" data-key="${k}"${aria ? ` aria-label="${aria}"` : ""}${off}>${label}</button>`;
    const d = (n) => key(String(n), String(n));
    return `
      <div class="keypad cap-pad">
        ${d(1)}${d(2)}${d(3)}${d(4)}${d(5)}${d(6)}${d(7)}${d(8)}${d(9)}
        ${key("back", icon("backspace", 16), "pad-fn", t("cap.delete"))}${d(0)}
        <button class="pad-key pad-add cap-ok" data-action="cap-key" data-key="ok" ${typed.length && !shut ? "" : "disabled"}>${t("cap.ok")}</button>
      </div>`;
  }
  function slots(len, typed, mark) {
    return `<div class="cap-slots ${mark ? "cap-" + mark : ""}" dir="ltr">${Array.from({ length: len }, (_, i) =>
      `<span class="cap-slot ${i < typed.length ? "filled" : ""}">${escapeHtml(typed[i] || "")}</span>`).join("")}</div>`;
  }

  function renderCapTest(ui, state) {
    const c = ui.capTest;
    if (!c) return "";
    const frame = (inner) => `<div class="assess-layer cap-layer"><div class="assess-card cap-card cap-${c.phase}">${inner}</div></div>`;
    const title = `<div class="assess-title">${t("cap.memory")}</div>`;
    const close = (label) => `<button class="btn btn-outline assess-begin" data-action="cap-close">${label || t("cap.close")}</button>`;

    if (c.phase === "intro") {
      const r = memoryOf(state);
      if (r && r.nextAt > Date.now()) {
        return frame(`${title}<p class="assess-body">${t("cap.nextOn", { date: dayOf(r.nextAt) })}</p>${close()}`);
      }
      const chips = (SYS.CAP_AGE_BANDS || []).map((b) =>
        `<button class="chip ${b === c.band ? "active" : ""}" data-action="cap-band" data-band="${b}" aria-pressed="${b === c.band}" dir="ltr">${b}</button>`).join("");
      return frame(`${title}
        <p class="assess-body">${t("cap.how")}</p>
        <p class="assess-body cap-rule">${t("cap.noLeave")}</p>
        <div class="cap-age"><div class="assess-proj-head">${t("cap.age")}</div><div class="chip-group">${chips}</div></div>
        <button class="btn btn-primary assess-begin" data-action="cap-start" ${c.band ? "" : "disabled"}>${t("cap.start")}</button>
        ${close(t("ask.later"))}`);
    }

    if (c.phase === "loading" || c.phase === "sending") {
      return frame(`${title}<p class="assess-body cap-wait">${t(c.phase === "sending" ? "cap.scoring" : "cap.loading")}</p>`);
    }

    if (c.phase === "show" || c.phase === "answer" || c.phase === "mark") {
      const head = `<div class="assess-progress"><div class="assess-count">${t("cap.len", { n: c.len })}</div></div>`;
      const typed = c.typed || "";
      // One screen above the keypad: the digit while they show, then the
      // answer typed so far, in the same place and the same size.
      if (c.phase === "show") {
        return frame(`${title}${head}<div class="cap-stage" aria-hidden="true"><span class="cap-digit"></span></div>${keypad(c.len, "", true)}`);
      }
      const markText = c.phase === "mark" ? `<div class="cap-mark cap-${c.mark}">${t("cap.mark." + c.mark)}</div>` : `<div class="cap-mark">${t("cap.yourTurn")}</div>`;
      // The bar runs down the time left to answer; drawn again with a negative
      // delay, it carries on from where it was rather than starting over.
      const used = Math.max(0, Date.now() - (c.answerWall || Date.now()));
      const timer = c.phase === "answer"
        ? `<div class="cap-timer"><i style="animation-duration:${c.limit}ms;animation-delay:-${used}ms"></i></div>` : `<div class="cap-timer"></div>`;
      return frame(`${title}${head}<div class="cap-stage cap-stage-answer">${slots(c.len, typed, c.phase === "mark" ? c.mark : "")}${markText}${timer}</div>${keypad(c.len, typed, c.phase !== "answer")}`);
    }

    if (c.phase === "result") {
      const res = c.result || {};
      if (!res.valid) {
        return frame(`${title}<p class="assess-body">${t("cap.void")}</p>
          <p class="assess-body cap-rule">${t(res.reason === "left" ? "cap.voidLeft" : "cap.voidOther")}</p>
          ${res.nextAt ? `<p class="assess-body cap-next">${t("cap.nextOn", { date: dayOf(res.nextAt) })}</p>` : ""}${close()}`);
      }
      const line = res.pending ? t("cap.pending")
        : res.pct != null ? t("cap.better", { pct: res.pct, band: iso(res.band) }) : t("cap.fewYet", { band: iso(res.band) });
      // This test's span is the big number; what counts is the middle of the
      // last three, said underneath when the two differ.
      const counted = res.counted && res.score != null && res.score !== res.span
        ? `<p class="assess-body cap-counted">${t("cap.counted", { n: res.score })}</p>` : "";
      return frame(`${title}
        <div class="cap-result"><span class="cap-span">${res.span}</span><span class="cap-span-label">${t("cap.spanLabel")}</span></div>
        ${counted}
        <p class="assess-body">${escapeHtml(line)}</p>
        <p class="assess-body cap-rule">${t("cap.typical")}</p>
        <p class="assess-body cap-next">${t("cap.nextOn", { date: dayOf(res.nextAt) })}</p>
        ${close()}`);
    }

    // error
    return frame(`${title}<p class="assess-body">${escapeHtml(c.error || t("cap.err"))}</p>${close()}`);
  }
  SYS.renderCapTest = renderCapTest;
})(window.SYS = window.SYS || {});

// App: running a capability test — the memory test's sequences, the keypad and keyboard, and
// leaving the app in the middle of one. Scored on the server (functions/captest.js).
// One of the files main.js was split into; the names they share travel through SYS._main.
(function (SYS) {
  "use strict";
  const M = SYS._main || (SYS._main = {});
  const { ACTIONS, ui } = M;

  // The step rule, the same as next() in functions/captest.js, which scores
  // the test by it; tests/test-captest.js holds the two together. A right
  // answer moves to one digit more; a wrong one gets a second sequence of the
  // same length; a second wrong one ends the test.
  function capNext(len, attempt, correct, max) {
    if (correct) return len >= max ? null : { len: len + 1, attempt: 0 };
    if (attempt === 0) return { len, attempt: 1 };
    return null;
  }
  SYS.capNext = capNext;

  // The sequences arrive disguised (pack() in functions/captest.js).
  function capUnpack(packed, sessionId) {
    const k = String(sessionId).split("").map((c) => c.charCodeAt(0) % 10);
    const out = {};
    Object.keys(packed || {}).forEach((len) => {
      out[len] = packed[len].map((s, j) => s.split("").map((d, i) => (Number(d) - k[(i + j * 7 + Number(len)) % k.length] + 10) % 10).join(""));
    });
    return out;
  }
  SYS.capUnpack = capUnpack;

  let timers = [];
  const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };
  function stopTimers() { timers.forEach(clearTimeout); timers = []; }
  const draw = () => M.renderAssessmentInto();
  const layer = () => document.getElementById("assess-layer");

  // What the overview shows, kept with the settings so every device has it.
  // The server's own copy (capTests) is the one that counts.
  function keepResult(res) {
    M.runGameAction((draft) => {
      const cap = draft.settings.capability = draft.settings.capability || {};
      const prev = cap.memory || {};
      if (res.valid && res.counted) {
        // The span that counts (the middle of the last three), and this test's own.
        cap.memory = { span: res.score != null ? res.score : res.span, last: res.span, pct: res.pct, n: res.n, band: res.band, at: Date.now(), nextAt: res.nextAt, pending: false };
      } else if (res.valid) {
        cap.memory = { ...prev, pending: true, pendingSpan: res.span, nextAt: res.nextAt };
      } else {
        cap.memory = { ...prev, nextAt: res.nextAt };
      }
      return [];
    });
  }

  function fail(c, err) {
    if (ui.capTest !== c) return;
    stopTimers();
    const d = err && err.details;
    if (d && d.code === "cap-wait" && d.nextAt) {
      keepResult({ valid: false, nextAt: d.nextAt });
      c.phase = "intro";
    } else {
      c.phase = "error";
      c.error = d && d.code === "subscription-needed" ? SYS.t("paywall.title") : SYS.t("cap.err");
    }
    draw();
  }

  // One sequence: a beat, then each digit for showMs and a gap, then the answer.
  function showTrial(c) {
    c.phase = "show"; c.typed = ""; c.leftThis = false;
    draw();
    const seq = c.seqs[c.len][c.attempt];
    let i = 0;
    const digit = () => layer().querySelector(".cap-digit");
    const step = () => {
      if (ui.capTest !== c || c.phase !== "show") return;
      if (i >= seq.length) { startAnswer(c); return; }
      const el = digit();
      if (el) { el.textContent = seq[i]; el.classList.add("on"); }
      later(() => {
        const e2 = digit();
        if (e2) { e2.textContent = ""; e2.classList.remove("on"); }
        i++;
        later(step, c.rules.gapMs);
      }, c.rules.showMs);
    };
    later(step, 700);
  }

  function startAnswer(c) {
    c.phase = "answer";
    c.limit = c.rules.answerBaseMs + c.rules.answerPerDigitMs * c.len;
    c.answerAt = performance.now();
    c.answerWall = Date.now();
    draw();
    later(() => submitTrial(c), c.limit);
  }

  // The answer so far, without drawing the window again.
  function paintTyped(c) {
    const box = layer();
    box.querySelectorAll(".cap-slot").forEach((s, i) => { s.textContent = c.typed[i] || ""; s.classList.toggle("filled", i < c.typed.length); });
    const ok = box.querySelector(".cap-ok");
    if (ok) ok.disabled = !c.typed.length;
  }

  function submitTrial(c) {
    if (ui.capTest !== c || (c.phase !== "answer" && !c.leftThis)) return;
    stopTimers();
    const ms = Math.round(performance.now() - (c.answerAt || performance.now()));
    const correct = !c.leftThis && c.typed === c.seqs[c.len][c.attempt];
    c.trials.push({ len: c.len, attempt: c.attempt, answer: c.typed, ms, left: !!c.leftThis });
    if (c.leftThis) c.left++;
    c.mark = c.leftThis ? "left" : correct ? "right" : "wrong";
    c.phase = "mark";
    draw();
    const nxt = capNext(c.len, c.attempt, correct, c.rules.max);
    later(() => {
      if (ui.capTest !== c) return;
      if (!nxt || c.left >= c.rules.leftLimit) { finish(c); return; }
      c.len = nxt.len; c.attempt = nxt.attempt;
      showTrial(c);
    }, 800);
  }

  function finish(c) {
    c.phase = "sending";
    draw();
    SYS.Cloud.callFinishMemoryTest(c.sessionId, c.trials).then((res) => {
      if (ui.capTest !== c) return;
      c.result = res;
      c.phase = "result";
      keepResult(res);
      draw();
    }).catch((err) => fail(c, err));
  }

  function typeKey(k) {
    const c = ui.capTest;
    if (!c || c.phase !== "answer") return;
    if (k === "ok") { if (c.typed.length) submitTrial(c); return; }
    if (k === "back") c.typed = c.typed.slice(0, -1);
    else if (/^[0-9]$/.test(k) && c.typed.length < c.len) c.typed += k;
    paintTyped(c);
  }

  // Leaving the app — another tab, another app, the home screen — while a
  // sequence is showing or being answered ends that sequence as wrong: the
  // digits are not to be written down somewhere else. The third time ends the test.
  function leftApp() {
    const c = ui.capTest;
    if (!c || (c.phase !== "show" && c.phase !== "answer") || c.leftThis) return;
    stopTimers();
    c.leftThis = true;
    if (c.phase === "show") { c.typed = ""; c.answerAt = performance.now(); }
    submitTrial(c);
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) leftApp(); });
  window.addEventListener("blur", leftApp);

  document.addEventListener("keydown", (e) => {
    const c = ui.capTest;
    if (!c || c.phase !== "answer") return;
    if (/^[0-9]$/.test(e.key)) typeKey(e.key);
    else if (e.key === "Backspace") typeKey("back");
    else if (e.key === "Enter") typeKey("ok");
    else return;
    e.preventDefault();
  });

  ACTIONS["cap-open"] = function () {
    if (!SYS.entitled(ui)) return;
    ui.capTest = { phase: "intro", test: "memory", band: (M.state.settings || {}).capAge || null };
    draw();
  };

  ACTIONS["cap-band"] = function ({ el }) {
    if (!ui.capTest) return;
    ui.capTest.band = el.dataset.band;
    draw();
  };

  ACTIONS["cap-start"] = function () {
    const c = ui.capTest;
    if (!c || !c.band || c.phase !== "intro") return;
    c.phase = "loading";
    draw();
    if ((M.state.settings || {}).capAge !== c.band) M.runGameAction((draft) => { draft.settings.capAge = c.band; return []; });
    SYS.Cloud.callStartMemoryTest(c.band).then((res) => {
      if (ui.capTest !== c) return;
      c.sessionId = res.sessionId;
      c.rules = res.rules;
      c.seqs = capUnpack(res.seqs, res.sessionId);
      c.len = res.rules.start; c.attempt = 0; c.trials = []; c.left = 0;
      showTrial(c);
    }).catch((err) => fail(c, err));
  };

  ACTIONS["cap-key"] = function ({ el }) {
    typeKey(el.dataset.key);
  };

  // Only offered before the test starts and after it ends: halfway, the way
  // out is leaving, which counts.
  ACTIONS["cap-close"] = function () {
    stopTimers();
    ui.capTest = null;
    draw();
    M.renderPageInto();
  };

  Object.assign(M, { capNext, capUnpack });
})(window.SYS = window.SYS || {});

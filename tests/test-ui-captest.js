// The memory test, played in a headless Chrome the way a person would:
//   node tests/test-ui-captest.js
//
// The overview's Abilities window opens the test; the digits appear one at a
// time and are read off the screen as they show; they are typed back on the
// keypad (and once on the keyboard); a wrong answer gets a second sequence;
// leaving the window during a sequence counts it as wrong; and what reaches
// the server is exactly what happened. The server is stood in for in the page,
// with sequences packed the way the real one packs them.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { findChrome, serve, devtools } = require("./lib-chrome");
const CAP = require(path.join(__dirname, "..", "functions", "captest.js"));

async function inPage(cfg) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !(window.SYS && SYS.__uiTest); i++) await sleep(100);
  const T = SYS.__uiTest;
  if (!T) return ["the ?uitest hook never appeared"];
  const ui = T.ui, problems = [];
  ui.landing = false; ui.assess = null;
  ["landing-layer", "assess-layer"].forEach((id) => { const el = document.getElementById(id); if (el) el.innerHTML = ""; });
  ui.cloudUser = { uid: "u-me", email: "t@example.com", emailVerified: true, createdAt: Date.now() };
  const st = SYS.clone(T.getState());
  st.assessment = st.assessment || { takenAt: Date.now(), answers: {}, granted: {}, neverTried: [], skipped: true };
  // A result from an earlier run in this browser would hold the test shut for a week.
  delete st.settings.capability; delete st.settings.capAge;
  T.setState(st);
  SYS.setLanguageCode(cfg.lang);
  document.documentElement.lang = SYS.currentLanguage();
  document.documentElement.dir = SYS.currentDir();
  ui.page = "overview"; ui.modal = null; T.render();
  await sleep(300);

  let sent = null;
  SYS.Cloud.callStartMemoryTest = (band) => Promise.resolve({ sessionId: cfg.sessionId, seqs: cfg.packed, rules: cfg.rules, band });
  SYS.Cloud.callFinishMemoryTest = (sid, trials) => {
    sent = { sid, trials: JSON.parse(JSON.stringify(trials)) };
    return Promise.resolve({ valid: true, span: 3, counted: true, pending: false, pct: null, n: 1, band: "25-34", nextAt: Date.now() + 7 * 86400000 });
  };
  const $ = (s) => document.querySelector(s);
  const click = (s) => { const e = $(s); if (!e) { problems.push("nothing to press: " + s); return false; } e.click(); return true; };
  const phase = () => { const c = $("#assess-layer .cap-card"); return c ? (c.className.match(/cap-(intro|loading|show|answer|mark|sending|result|error)\b/) || [])[1] : null; };
  const until = async (want, ms) => { const end = Date.now() + (ms || 15000); while (phase() !== want && Date.now() < end) await sleep(40); return phase() === want; };
  // Reads the digits off the screen as they are shown, until the keypad appears.
  const watch = async () => {
    const seen = []; let last = "";
    const end = Date.now() + 20000;
    while (phase() === "show" && Date.now() < end) {
      const d = ($("#assess-layer .cap-digit") || {}).textContent || "";
      if (d && d !== last) seen.push(d);
      last = d;
      await sleep(30);
    }
    return seen.join("");
  };

  const win = $(".sysw-ability");
  if (!win) return problems.concat(["the overview has no Abilities window"]);
  if (!win.querySelector(".sysw-count") || !win.querySelector(".sysw-count").textContent.trim()) problems.push("the Abilities window shows no value: " + win.textContent.trim());
  click('.sysw-ability [data-action="cap-open"]');
  await sleep(200);
  if (phase() !== "intro") return problems.concat(["the test did not open on its first screen (" + phase() + ")"]);
  if (!$('[data-action="cap-start"]').disabled) problems.push("Start can be pressed before an age range is chosen");
  click('[data-action="cap-band"][data-band="25-34"]');
  await sleep(100);
  if ($('[data-action="cap-start"]').disabled) problems.push("Start stays shut after choosing an age range");
  click('[data-action="cap-start"]');

  // 1. three digits, read off the screen and typed back on the keypad
  if (!(await until("show"))) return problems.concat(["the first sequence never showed (" + phase() + ")"]);
  const s1 = await watch();
  if (s1 !== cfg.truth["3"][0]) problems.push("the screen showed " + s1 + " for the first sequence, the server made " + cfg.truth["3"][0]);
  if (phase() !== "answer") return problems.concat(["no keypad after the digits (" + phase() + ")"]);
  for (const d of s1) click('#assess-layer [data-action="cap-key"][data-key="' + d + '"]');
  const slots = [...document.querySelectorAll("#assess-layer .cap-slot")].map((s) => s.textContent).join("");
  if (slots !== s1) problems.push("the slots show " + slots + " after typing " + s1);
  click('#assess-layer [data-action="cap-key"][data-key="ok"]');
  await sleep(100);
  if (!$("#assess-layer .cap-mark.cap-right")) problems.push("a right answer is not marked right");

  // 2. four digits, answered wrong on the keyboard
  if (!(await until("show"))) return problems.concat(["the second sequence never showed"]);
  const s2 = await watch();
  if (s2.length !== 4) problems.push("the second sequence was not four digits: " + s2);
  const wrong = s2.split("").reverse().join("");
  for (const k of wrong.split("").concat(["Backspace"], [wrong[3]], ["Enter"])) document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  await sleep(100);
  if (!$("#assess-layer .cap-mark.cap-wrong")) problems.push("a wrong answer is not marked wrong");

  // 3. the second try at four: the window is left while the digits show
  if (!(await until("show"))) return problems.concat(["no second try after a wrong answer (" + phase() + ")"]);
  await sleep(1300);
  window.dispatchEvent(new Event("blur"));
  await sleep(100);
  if (!$("#assess-layer .cap-mark.cap-left")) problems.push("leaving the window during a sequence is not marked (" + phase() + ")");

  // two wrong at four: the test ends and is handed in
  if (!(await until("result", 6000))) return problems.concat(["no result after two wrong answers (" + phase() + ")"]);
  if (!sent) return problems.concat(["nothing was handed in"]);
  const tr = sent.trials;
  const shape = tr.map((x) => x.len + "/" + x.attempt + (x.left ? "L" : "")).join(" ");
  if (sent.sid !== cfg.sessionId) problems.push("handed in under another test's id");
  if (shape !== "3/0 4/0 4/1L") problems.push("the trials handed in were " + shape);
  if (tr[0] && tr[0].answer !== cfg.truth["3"][0]) problems.push("the first answer handed in was " + tr[0].answer);
  if (tr[1] && tr[1].answer !== wrong) problems.push("the keyboard answer handed in was " + tr[1].answer + ", typed " + wrong);
  if (tr[0] && !(tr[0].ms > 0 && tr[0].ms < 20000)) problems.push("the first answer's time is " + tr[0].ms);
  if (!/3/.test(($("#assess-layer .cap-span") || {}).textContent || "")) problems.push("the result does not show the span");
  click('#assess-layer [data-action="cap-close"]');
  await sleep(500);
  if ($("#assess-layer .cap-card")) problems.push("the test window did not close");
  const after = ($(".sysw-ability .sysw-count") || {}).textContent || "";
  if (after.trim() !== "3") problems.push("the overview shows " + after + " after a span of 3");
  if (!(T.getState().settings.capability || {}).memory) problems.push("the result was not kept with the settings");
  // Within the week the window says when, instead of starting another.
  click('.sysw-ability [data-action="cap-open"]');
  await sleep(200);
  if ($('#assess-layer [data-action="cap-start"]')) problems.push("a second test can be started inside the week");
  click('#assess-layer [data-action="cap-close"]');
  await sleep(300);
  return problems;
}

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log("skipped — no Chrome or Edge found (set CHROME to its path)"); return; }
  const seqs = CAP.makeSequences(Math.random);
  const sessionId = "test-session-1";
  const M = CAP.MEMORY;
  const cfg = { sessionId, truth: seqs, packed: CAP.pack(seqs, sessionId),
    rules: { start: M.start, max: M.max, showMs: M.showMs, gapMs: M.gapMs, answerBaseMs: M.answerBaseMs, answerPerDigitMs: M.answerPerDigitMs, leftLimit: M.leftLimit } };
  const srv = await serve();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sys-captest-"));
  const { proc, ws, send } = await devtools(chrome, profile);
  const all = [];
  try {
    for (const [width, lang] of [[1280, "en"], [390, "ar"]]) {
      const { targetId } = await send("Target.createTarget", { url: "about:blank" });
      const { sessionId: sid } = await send("Target.attachToTarget", { targetId, flatten: true });
      const s = (m, p) => send(m, p, sid);
      await s("Network.enable");
      await s("Network.setBlockedURLs", { urls: ["https://*", "*gstatic.com*", "*googleapis.com*", "*google.com*", "*recaptcha*"] });
      await s("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 });
      await s("Page.enable");
      await s("Page.navigate", { url: "http://127.0.0.1:" + srv.address().port + "/index.html?uitest" });
      await new Promise((r) => setTimeout(r, 2500));
      const res = await s("Runtime.evaluate", { expression: "(" + inPage.toString() + ")(" + JSON.stringify({ ...cfg, lang }) + ")", awaitPromise: true, returnByValue: true });
      const tag = width + "px " + lang;
      if (res.exceptionDetails) all.push(tag + ": the check itself failed — " + (res.exceptionDetails.exception && res.exceptionDetails.exception.description || res.exceptionDetails.text));
      else all.push(...res.result.value.map((p) => tag + ": " + p));
      await send("Target.closeTarget", { targetId });
    }
  } finally {
    try { ws.close(); } catch (e) {}
    proc.kill();
    srv.close();
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }, 500);
  }
  all.forEach((p) => console.log("  FAIL  " + p));
  console.log(all.length ? all.length + " bugs" : "all passed — read off the screen, typed back, handed in as it happened");
  if (all.length) process.exitCode = 1;
}

main().catch((e) => { console.log("FAIL  " + (e && e.stack || e)); process.exitCode = 1; });

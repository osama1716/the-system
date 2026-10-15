// The System-window look, in a real (headless) Chrome:  node tests/test-ui-blue.js
//
// What went wrong by eye on 2026-10-12/13, so it cannot come back unseen:
//   - a page title off the middle of its window, or the "?" lying on the rule
//     beside it (the title tag must be centred; the mark stands outside it),
//   - the + keys on the habit cards not in one column,
//   - a window's motion cut short or started over when the page is drawn
//     again (the glow then "arrives late" and the page jumps),
//   - a window still wearing animation styles after it has arrived,
//   - a script error or a page wider than the screen in English, Arabic
//     (mirrored) or Japanese, on a desktop and on a phone.
// No account, no network: same arrangement as test-phone-layout.js.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { findChrome, serve, devtools } = require("./lib-chrome");

const CONFIGS = [
  { name: "desktop en", width: 1000, height: 800, mobile: false, lang: "en" },
  { name: "desktop ar", width: 1000, height: 800, mobile: false, lang: "ar" },
  { name: "phone en", width: 390, height: 800, mobile: true, lang: "en" },
  { name: "phone ja", width: 390, height: 800, mobile: true, lang: "ja" },
];

async function inPage(cfg) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !(window.SYS && SYS.__uiTest); i++) await sleep(100);
  const T = SYS.__uiTest;
  if (!T) return ["the ?uitest hook never appeared"];
  const ui = T.ui, problems = [], at = (where, msg) => problems.push(cfg.name + " · " + where + ": " + msg);
  const errors = [];
  window.addEventListener("error", (e) => errors.push(e.message + " @" + String(e.filename || "").split("/").pop() + ":" + e.lineno));
  window.addEventListener("unhandledrejection", (e) => errors.push("rejection: " + (e.reason && e.reason.message || e.reason)));

  const st = SYS.clone(T.getState());
  st.tasks = [];
  SYS.addTask(st, { title: "Read a book", priority: "High", types: ["LING"], pt: 50, taskType: "Short Term" });
  const habit = (title, unit, n) => SYS.addTask(st, { title, priority: "Medium", types: ["BODY"], pt: 20, recurring: true, schedule: { type: "daily" }, unit, targetAmount: n });
  habit("Drink water", "L", 2); habit("Deep work session", "min", 30); habit("Sleep 7–8 hours", "times", 1); habit("Morning workout", "min", 20);
  T.setState(st);
  ui.landing = false; ui.assess = null;
  ["landing-layer", "assess-layer"].forEach((id) => { const el = document.getElementById(id); if (el) el.innerHTML = ""; });
  ui.cloudUser = { uid: "u-tester", email: "t@example.com", emailVerified: true };
  ui.wallet = { gold: 45000, aurenite: 450, themes: [], frames: [], backgrounds: [], freezes: 0 };

  SYS.setLanguageCode(cfg.lang);
  document.documentElement.lang = SYS.currentLanguage();
  document.documentElement.dir = SYS.currentDir();
  const W = window.innerWidth;
  const rtl = document.documentElement.dir === "rtl";
  const show = async (p) => { ui.modal = null; ui.page = p; T.render(); await sleep(900); window.scrollTo(0, 0); };
  const inPageRunning = () => document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.closest &&
    a.effect.target.closest("#page") && a.playState === "running" && a.effect.getTiming().iterations !== Infinity);

  const pages = ["overview", "quests", "habits", "planner", "stats", "leaderboard", "intelligence", "log", "shop", "friends", "mail"];
  for (const p of pages) {
    try { await show(p); } catch (e) { at(p, "failed to draw — " + e.message); continue; }
    if (document.documentElement.scrollWidth - W > 1) at(p, "the page is wider than the screen");
    // the title tag is in the middle of its header; the help mark stands outside the tag
    const head = document.querySelector("#page .page-header");
    if (head) {
      const h = head.getBoundingClientRect(), t = head.querySelector(".page-title").getBoundingClientRect();
      if (Math.abs((h.left + h.width / 2) - (t.left + t.width / 2)) > 2) at(p, "the title is off the middle of its window");
      const mark = head.querySelector(".help-mark");
      if (mark) {
        const m = mark.getBoundingClientRect();
        const clear = rtl ? m.right <= t.left - 4 : m.left >= t.right + 4;
        if (!clear) at(p, "the ? mark is not clear of the title tag");
      }
    }
    // the habits' + keys sit in one column
    if (p === "habits") {
      const xs = [...document.querySelectorAll(".habit-card .habit-check")].map((b) => Math.round(b.getBoundingClientRect().left));
      if (xs.length > 1 && new Set(xs).size > 1) at(p, "the + keys are not in one column: " + xs.join(", "));
    }
    // nothing of the arrival motion is left on a page that has settled
    const running = inPageRunning();
    if (running.length) at(p, running.length + " animation(s) still running after the page settled");
    const panel = document.querySelector("#page .sys-panel");
    if (panel) { const cs = getComputedStyle(panel); if (cs.filter !== "none" || cs.opacity !== "1") at(p, "a window kept animation styles (filter " + cs.filter + ", opacity " + cs.opacity + ")"); }
  }
  for (const m of ["settings", "ranks", "guide", "library"]) {
    try { ui.page = "overview"; ui.modal = m; T.render(); await sleep(700); } catch (e) { at("window " + m, "failed to draw — " + e.message); continue; }
    if (!document.querySelector(".modal-box")) at("window " + m, "did not open");
    if (document.documentElement.scrollWidth - W > 1) at("window " + m, "wider than the screen");
    ui.modal = null; T.render(); await sleep(300);
  }
  ui.modal = null; ui.page = "overview"; T.render(); await sleep(500);

  // Motion: change page through the sidebar or tab bar, and draw the page
  // again while it is arriving, as a data load does. A window's opacity must
  // only ever go up from the moment it appears.
  const nav = document.querySelector('[data-action="nav"][data-page="quests"]');
  if (nav) {
    const seen = new Map(); let drops = 0; const t0 = performance.now();
    let late = 0; const lateStart = (e) => { if (e.animationName === "swArrive" && performance.now() - t0 > 560) late++; };
    document.addEventListener("animationstart", lateStart, true);
    const track = () => {
      // by position, not by element: a redraw replaces the elements
      document.querySelectorAll("#page .sys-panel").forEach((el, i) => {
        const o = +getComputedStyle(el).opacity;
        const prev = seen.get(i);
        if (prev !== undefined && o < prev - 0.05) drops++;
        seen.set(i, o);
      });
      if (performance.now() - t0 < 900) requestAnimationFrame(track);
    };
    requestAnimationFrame(track);
    nav.click();
    // drawn again early (motion under way) and again late (motion just over):
    // neither may start a window's arrival over
    setTimeout(() => T.render(), 150);
    setTimeout(() => T.render(), 650);
    await sleep(1300);
    document.removeEventListener("animationstart", lateStart, true);
    if (drops) at("page change", "a window's motion went backwards " + drops + " time(s) (restarted when the page was drawn again)");
    if (late) at("page change", late + " window(s) arrived a second time when the page was drawn again after the motion");
    const stuck = inPageRunning();
    if (stuck.length) at("page change", stuck.length + " animation(s) never finished");
  }
  errors.forEach((e) => at("script", e));
  return problems;
}

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log("skipped — no Chrome or Edge found (set CHROME to its path)"); return; }
  const srv = await serve();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sys-blue-"));
  const { proc, ws, send } = await devtools(chrome, profile);
  const all = [];
  try {
    for (const cfg of CONFIGS) {
      const { targetId } = await send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
      const s = (m, p) => send(m, p, sessionId);
      await s("Network.enable");
      await s("Network.setBlockedURLs", { urls: ["https://*", "*gstatic.com*", "*googleapis.com*", "*google.com*", "*recaptcha*"] });
      await s("Emulation.setDeviceMetricsOverride", { width: cfg.width, height: cfg.height, deviceScaleFactor: 1, mobile: cfg.mobile });
      await s("Page.enable");
      await s("Page.navigate", { url: "http://127.0.0.1:" + srv.address().port + "/index.html?uitest" });
      await new Promise((r) => setTimeout(r, 2500));
      const res = await s("Runtime.evaluate", { expression: "(" + inPage.toString() + ")(" + JSON.stringify(cfg) + ")", awaitPromise: true, returnByValue: true });
      if (res.exceptionDetails) all.push(cfg.name + ": the check itself failed — " + (res.exceptionDetails.exception && res.exceptionDetails.exception.description || res.exceptionDetails.text));
      else all.push(...res.result.value);
      await send("Target.closeTarget", { targetId });
    }
  } finally {
    try { ws.close(); } catch (e) {}
    proc.kill();
    srv.close();
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }, 500);
  }
  all.forEach((p) => console.log("  FAIL  " + p));
  console.log(all.length ? all.length + " bugs" : "all passed — " + CONFIGS.map((c) => c.name).join(", "));
  if (all.length) process.exitCode = 1;
}

main().catch((e) => { console.log("FAIL  " + (e && e.stack || e)); process.exitCode = 1; });

// How a System window opens and closes, frame by frame, in a real (headless)
// Chrome:  node tests/test-window-motion.js
//
// Built 2026-10-25 to the anime, studied frame by frame (six drawings, each
// held two frames of 24; the sheet is in the-system-assets/tools/
// window-directions/MOTION-SHEET.md). The motion is stopped and set to each
// drawing in turn, so what is checked is what each one shows, however fast
// this machine is:
//   drawing 1   a bar across the window's middle, flashing; the window not there
//   drawing 4   the bars a quarter of the window apart, only its middle showing,
//               the flash over
//   drawing 5   fully open, 6% larger, the bars on its edges
//   drawing 6   its own size, the bars on its edges
//   after       no light left, nothing running, the window whole
//   closing     by its third drawing the window is gone; then the light too
//   a big notice opens the same way and keeps its bars; a page's windows open
//   without a single flash (a dozen of them hurt his eyes); less motion: none
// No account, no network: same arrangement as test-ui-blue.js.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { findChrome, serve, devtools } = require("./lib-chrome");

const CONFIGS = [
  { name: "phone", width: 390, height: 800, mobile: true },
  { name: "desktop", width: 1000, height: 800, mobile: false },
];

async function inPage(cfg) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !(window.SYS && SYS.__uiTest); i++) await sleep(100);
  const T = SYS.__uiTest;
  if (!T) return ["the ?uitest hook never appeared"];
  const ui = T.ui, problems = [], at = (where, msg) => problems.push(cfg.name + " · " + where + ": " + msg);
  const errors = [];
  window.addEventListener("error", (e) => errors.push(e.message));
  const st = SYS.clone(T.getState());
  st.tasks = [];
  st.assessment = st.assessment || { takenAt: Date.now(), answers: {}, granted: {}, neverTried: [], skipped: true };
  const habit = (title, unit, n) => SYS.addTask(st, { title, priority: "Medium", types: ["BODY"], pt: 20, recurring: true, schedule: { type: "daily" }, unit, targetAmount: n });
  habit("Drink water", "L", 2); habit("Deep work session", "min", 30);
  T.setState(st);
  ui.landing = false; ui.assess = null;
  ["landing-layer", "assess-layer"].forEach((id) => { const el = document.getElementById(id); if (el) el.innerHTML = ""; });
  ui.cloudUser = { uid: "u-tester", email: "t@example.com", emailVerified: true };
  ui.modal = null; ui.page = "overview"; T.render();
  await sleep(1200);

  const FRAME = 1000 / 12;
  // The app takes a window's motion off on timers; while the frames are being
  // looked at, those wait, and run once it is over.
  let held = [];
  const realTimeout = window.setTimeout;
  const hold = () => { held = []; window.setTimeout = (f) => { held.push(f); return 0; }; };
  const release = () => { window.setTimeout = realTimeout; held.forEach((f) => { try { f(); } catch (e) {} }); held = []; };
  const finite = () => document.getAnimations().filter((a) => a.effect && a.effect.getTiming().iterations !== Infinity);
  // Stop everything at a moment after the start. A window drawn again part-way
  // carries how far in it was as a negative delay: it is set to the same moment.
  const frame = (n) => {
    const t = (n - 1) * FRAME + 8;
    finite().forEach((a) => { const d = a.effect.getTiming().delay; a.pause(); a.currentTime = d < 0 ? Math.max(0, t + d) : t; });
  };
  const play = () => finite().forEach((a) => a.play());
  const bars = () => [...document.querySelectorAll(".swfx .swfx-bar")].filter((el) => getComputedStyle(el).opacity !== "0").map((el) => el.getBoundingClientRect());
  const midY = (r) => r.top + r.height / 2;
  // the anime's aqua, which only the moments flash
  const flashing = (sel) => [...document.querySelectorAll(sel)].some((el) => getComputedStyle(el).opacity !== "0" && /92, 252, 252/.test(getComputedStyle(el).backgroundImage));
  const shown = (el) => +getComputedStyle(el).opacity;

  // ---- a window opening ----
  hold();
  ui.modal = "ranks"; T.render(); frame(1);
  const box = () => document.querySelector("#modal-layer .modal-box");
  if (!box()) { at("open", "the window did not open"); release(); return problems; }
  const stand = () => { const b = box(), r = b.getBoundingClientRect(); return { cy: r.top + r.height / 2, h: b.offsetHeight, w: b.offsetWidth, r }; };
  let s = stand(), b = bars();
  if (shown(box()) > 0.01) at("frame 1", "the window is already there (opacity " + shown(box()) + ")");
  if (b.length !== 2) at("frame 1", b.length + " bar(s) of light, not 2");
  else {
    if (b.some((r) => Math.abs(midY(r) - s.cy) > 3)) at("frame 1", "the light is not across the window's middle (" + b.map((r) => Math.round(midY(r))).join(", ") + " vs " + Math.round(s.cy) + ")");
    if (b.some((r) => r.width < s.w)) at("frame 1", "the bar is narrower than the window");
  }
  if (!flashing(".swfx .swfx-bar")) at("frame 1", "a window opened does not flash");
  frame(4); s = stand(); b = bars();
  if (shown(box()) < 0.99) at("frame 4", "the window's middle is not showing (opacity " + shown(box()) + ")");
  const clip = getComputedStyle(box()).clipPath;
  if (!/37\.5%/.test(clip)) at("frame 4", "more than the window's middle shows (clip " + clip + ")");
  if (flashing(".swfx .swfx-bar")) at("frame 4", "the light is still flashing");
  if (b.length === 2) {
    const [top, bot] = b.sort((x, y) => x.top - y.top);
    const off = [s.cy - midY(top), midY(bot) - s.cy];
    if (off.some((d) => d < s.h * .1 || d > s.h * .25)) at("frame 4", "the bars are not a quarter of the window apart (" + off.map(Math.round).join(", ") + " of " + s.h + ")");
  }
  frame(5); s = stand(); b = bars();
  const grown = s.r.height / s.h;
  if (grown < 1.04 || grown > 1.08) at("frame 5", "the window is not 6% larger (" + grown.toFixed(3) + ")");
  if (b.length === 2) {
    const [top, bot] = b.sort((x, y) => x.top - y.top);
    if (Math.abs(midY(top) - s.r.top) > 4 || Math.abs(midY(bot) - s.r.bottom) > 4) at("frame 5", "the bars are not on its edges");
  }
  frame(6); s = stand(); b = bars();
  if (Math.abs(s.r.height - s.h) > 1) at("frame 6", "the window is not its own size (" + Math.round(s.r.height) + " vs " + s.h + ")");
  if (b.length === 2) {
    const [top, bot] = b.sort((x, y) => x.top - y.top);
    if (Math.abs(midY(top) - s.r.top) > 3 || Math.abs(midY(bot) - s.r.bottom) > 3) at("frame 6", "the bars are not on its edges");
  }
  frame(9);
  if (bars().length) at("frame 9", "the light is still showing after its eight frames");
  play(); release(); await sleep(600);
  if (box().getAnimations().length) at("after opening", "the window is still moving");
  if (shown(box()) < 1 || box().classList.contains("sys-open")) at("after opening", "the window is not whole");

  // ---- left to run in real time, the light is gone soon after ----
  ui.modal = null; T.render(); await sleep(500);
  ui.modal = "guide"; T.render(); await sleep(900);
  if (document.querySelector(".swfx")) at("after opening", "the light is still there");
  ui.modal = "ranks"; T.render(); await sleep(900);

  // ---- the same window closing ----
  hold();
  ui.modal = null; T.render(); frame(1);
  const ghost = () => document.querySelector(".sys-ghost .modal-box");
  if (!ghost()) at("closing", "no window being taken down");
  else {
    if (shown(ghost()) < 0.99) at("closing frame 1", "the window is already gone");
    frame(3);
    if (shown(ghost()) > 0.01) at("closing frame 3", "the window is still there (opacity " + shown(ghost()) + ")");
    if (bars().length !== 2) at("closing frame 3", "the light is not there to take it down");
  }
  play(); release(); await sleep(500);
  if (document.querySelector(".sys-ghost, .swfx")) at("after closing", "the window or its light is left on the screen");

  // ---- a big notice: the same opening, and it keeps its bars ----
  try { localStorage.removeItem("sys-quest-arrived"); } catch (e) {}
  hold();
  SYS._main.maybeAnnounceDailyQuest(); frame(1);
  const big = () => document.querySelector(".notif.notif-big");
  if (!big()) at("notice", "the Daily Quest did not arrive");
  else {
    if (shown(big()) > 0.01) at("notice frame 1", "the notice is already there");
    if (bars().length !== 2) at("notice frame 1", "no bar of light across it");
    frame(6);
    if (shown(big()) < 0.99) at("notice frame 6", "the notice is not open");
    play(); release(); await sleep(600);
    const kept = big().querySelector(".sw-bars");
    if (!kept) at("notice", "the notice does not keep its bars");
    else {
      // a spark runs along them: the same bars a moment apart are not the same
      const spark = kept.getAnimations({ subtree: true }).find((x) => x.effect && x.effect.pseudoElement === "::before");
      if (!spark) at("notice", "no spark runs along its bars");
      else {
        spark.pause(); spark.currentTime = 0; const a = getComputedStyle(kept, "::before").transform;
        spark.currentTime = 600; const b2 = getComputedStyle(kept, "::before").transform; spark.play();
        if (a === b2) at("notice", "the spark along its bars does not move");
      }
    }
    big().querySelector(".notif-big-x").click(); await sleep(600);
  }
  release();

  // ---- the phone's menu, the way between pages: no flash coming or going ----
  ui.modal = null; T.render(); await sleep(600);
  hold();
  ui.modal = "menu"; T.render();
  if (!box()) at("menu", "the menu did not open");
  for (let n = 1; n <= 8; n++) { frame(n); if (flashing(".swfx .swfx-bar")) { at("menu drawing " + n, "the menu flashes"); break; } }
  play(); release(); await sleep(900);
  hold();
  ui.modal = null; T.render();
  for (let n = 1; n <= 4; n++) { frame(n); if (flashing(".swfx .swfx-bar")) { at("menu closing drawing " + n, "the menu flashes as it goes"); break; } }
  play(); release(); await sleep(600);

  // ---- a page's windows: the same opening, without a single flash ----
  ui.modal = null; ui.page = "overview"; T.render(); await sleep(1200);
  hold();
  ui.page = "quests"; T.render();
  release();
  if (!document.querySelector(".swfx.fx-page")) at("page", "the page's windows got no light");
  for (let n = 1; n <= 8; n++) { frame(n); if (flashing(".swfx.fx-page .swfx-bar")) { at("page drawing " + n, "a page's window flashes"); break; } }
  play(); await sleep(1000);
  errors.forEach((e) => at("script", e));
  return problems;
}

// with less motion asked for: a window simply opens, with no light and no motion
async function lessMotion() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const T = SYS.__uiTest, ui = T.ui, problems = [];
  ui.modal = null; T.render(); await sleep(300);
  let lit = 0;
  const mo = new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.classList && n.classList.contains("swfx")) lit++; })));
  mo.observe(document.body, { childList: true });
  ui.modal = "ranks"; T.render();
  const box = document.querySelector("#modal-layer .modal-box");
  const moving = box ? box.getAnimations().length : -1;
  await sleep(100); mo.disconnect();
  if (!box) problems.push("less motion: the window did not open");
  if (moving > 0) problems.push("less motion: the window still moves");
  if (lit) problems.push("less motion: the light still plays");
  ui.modal = null; T.render();
  return problems;
}

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log("skipped — no Chrome or Edge found (set CHROME to its path)"); return; }
  const srv = await serve();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sys-motion-"));
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
      const run = async (fn, arg) => {
        const res = await s("Runtime.evaluate", { expression: "(" + fn.toString() + ")(" + JSON.stringify(arg) + ")", awaitPromise: true, returnByValue: true });
        if (res.exceptionDetails) all.push(cfg.name + ": the check itself failed — " + (res.exceptionDetails.exception && res.exceptionDetails.exception.description || res.exceptionDetails.text));
        else all.push(...res.result.value);
      };
      await run(inPage, cfg);
      // The overview standing still costs the page nothing: its window's sparks
      // are the graphics card's work. Moved as a background they had it
      // restyled every frame (about 70 times a second, found 2026-10-25).
      await s("Runtime.evaluate", { expression: "SYS.__uiTest.ui.modal = null; SYS.__uiTest.ui.page = 'overview'; SYS.__uiTest.render(); 1" });
      await new Promise((r) => setTimeout(r, 1500));
      await s("Performance.enable");
      const count = async () => (await s("Performance.getMetrics")).metrics.find((m) => m.name === "RecalcStyleCount").value;
      const before = await count();
      await new Promise((r) => setTimeout(r, 2000));
      const restyled = (await count()) - before;
      if (restyled > 20) all.push(cfg.name + " · idle overview: restyled " + restyled + " times in 2 seconds of standing still");
      await s("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
      await run(lessMotion);
      await send("Target.closeTarget", { targetId });
    }
  } finally {
    try { ws.close(); } catch (e) {}
    proc.kill();
    srv.close();
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }, 500);
  }
  all.forEach((p) => console.log("  FAIL  " + p));
  console.log(all.length ? all.length + " bugs" : "all passed — " + CONFIGS.map((c) => c.name).join(", ") + ", and less motion");
  if (all.length) process.exitCode = 1;
}

main().catch((e) => { console.log("FAIL  " + (e && e.stack || e)); process.exitCode = 1; });

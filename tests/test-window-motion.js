// How a System window opens and closes, moment by moment, in a real
// (headless) Chrome:  node tests/test-window-motion.js
//
// Built 2026-10-25 to the anime (the sheet is in the-system-assets/tools/
// window-directions/MOTION-SHEET.md) and drawn smoothly since 2026-10-26: held
// drawings read as a stutter on a phone, and the window's middle showed only
// after 125ms. The motion is stopped and set to each moment in turn, so what
// is checked is what each one shows, however fast this machine is:
//   at once     the first frame after the press already shows the window's
//               middle opening between two lines, its own top and bottom edges
//   all along   the lines ride the edges of what is shown; it opens a little
//               more every frame (nothing held); the light is no brighter than
//               the window's own edges (its border's thin line and glow, or a
//               big window's own bars; bright bars flared, 2026-10-26)
//   200ms       whole, the lines gone where its own edges now are; a window
//               opened then stands a touch larger and settles by 320ms
//   closing     folds to its middle between its edges from the first frame,
//               shut by 160ms, its last line gone soon after
//   a big notice opens between its own bars and keeps them; the phone's menu
//   and a page's windows open without growing, a page's windows 40ms apart;
//   opening a window does not have the page laid out again on every frame;
//   less motion: none of it
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

  // The app takes a window's motion off on timers; while the moments are
  // being looked at, those wait, and run once it is over.
  let held = [];
  const realTimeout = window.setTimeout;
  const hold = () => { held = []; window.setTimeout = (f, ms) => { held.push([f, ms || 0]); return 0; }; };
  const release = () => { window.setTimeout = realTimeout; held.forEach(([f]) => { try { f(); } catch (e) {} }); held = []; };
  const finite = () => document.getAnimations().filter((a) => a.effect && a.effect.getTiming().iterations !== Infinity);
  // Stop everything `ms` after the start. A window drawn again part-way
  // carries how far in it was as a negative delay: it is set to the same moment.
  const moment = (ms) => {
    finite().forEach((a) => { const d = a.effect.getTiming().delay; a.pause(); a.currentTime = d < 0 ? Math.max(0, ms + d) : ms; });
  };
  const play = () => finite().forEach((a) => a.play());
  const lines = (sel) => [...document.querySelectorAll(sel || ".swfx .swfx-bar")].filter((el) => getComputedStyle(el).opacity !== "0");
  const bars = (sel) => lines(sel).map((el) => el.getBoundingClientRect()).sort((x, y) => x.top - y.top);
  const midY = (r) => r.top + r.height / 2;
  // No brighter than the window's own edges: a line of its border's 1px with a
  // glow no wider than the window's own 16px, or, over a big window, its bars
  // drawn exactly as its .sw-bars are.
  const ref = document.createElement("i"); ref.className = "sw-bars"; document.body.appendChild(ref);
  const KEPT = getComputedStyle(ref).filter; ref.remove();
  const glaring = (sel) => lines(sel).some((el) => {
    const cs = getComputedStyle(el), h = el.getBoundingClientRect().height;
    if (el.closest(".fx-kept")) return cs.filter !== KEPT || h > 6.5;
    const px = (cs.boxShadow.match(/-?[\d.]+px/g) || []).map(parseFloat);
    return h > 1.5 || Math.max(0, ...px) > 16 || cs.backgroundImage !== "none";
  });
  // How much of the window shows, from its clip: 0 (folded to its middle, or
  // not there at all) to 1 (whole, its glow and all); no clip at all is whole.
  const open = (el) => {
    if (+getComputedStyle(el).opacity < 0.01) return 0;
    const c = getComputedStyle(el).clipPath;
    if (!c || c === "none") return 1;
    const m = c.match(/^inset\(\s*(-?[\d.e+-]+)(%|px)/);
    if (!m) return NaN;
    const top = m[2] === "%" ? parseFloat(m[1]) / 100 * el.offsetHeight : parseFloat(m[1]);
    return Math.min(1, 1 - Math.max(0, top) / (el.offsetHeight / 2));
  };
  // the shown part's top and bottom on the screen, about the window's middle
  const shownEdges = (el) => {
    const r = el.getBoundingClientRect(), cy = r.top + r.height / 2, half = open(el) * el.offsetHeight / 2;
    return [cy - half, cy + half];
  };
  const grownBy = (el) => el.getBoundingClientRect().height / el.offsetHeight;
  // The lines lie on the edges of what shows (2px either way), across the
  // window's width.
  const onEdges = (el, where, sel) => {
    const b = bars(sel), [t, u] = shownEdges(el);
    if (b.length !== 2) { at(where, b.length + " line(s) of light, not 2"); return; }
    if (Math.abs(midY(b[0]) - t) > 2.5 || Math.abs(midY(b[1]) - u) > 2.5) at(where, "the lines are not on the edges of what shows (" + b.map((r) => Math.round(midY(r))).join(", ") + " vs " + Math.round(t) + ", " + Math.round(u) + ")");
    const w = el.offsetWidth;
    if (b.some((r) => Math.abs(r.width - w) > 1 && Math.abs(r.width - w - 12) > 1)) at(where, "a line is not the window's width");
  };
  // Opens a little more every 8ms, never held and never jumping: held
  // drawings showed the same picture for 83ms (2026-10-26).
  const smooth = (el, where, from, to, closing) => {
    let last = closing ? 1 : 0;
    for (let ms = from; ms <= to; ms += 8) {
      moment(ms);
      const o = open(el);
      if (closing ? o >= last : o <= last) { at(where, "held at " + ms + "ms: no further than 8ms before (" + o.toFixed(4) + ")"); return; }
      if (Math.abs(o - last) > .45) { at(where, "jumps at " + ms + "ms (" + o.toFixed(3) + ")"); return; }
      if (glaring()) { at(where, "the light is brighter than the window's edges at " + ms + "ms"); return; }
      last = o;
    }
  };

  // ---- a window opening ----
  hold();
  ui.modal = "ranks"; T.render();
  const box = () => document.querySelector("#modal-layer .modal-box");
  if (!box()) { at("open", "the window did not open"); release(); return problems; }
  moment(0);
  if (open(box()) > 0.02) at("open, 0ms", "more than a line of the window shows before it opens (" + open(box()).toFixed(3) + ")");
  moment(16);
  if (!(open(box()) >= 0.2)) at("open, first frame", "the window's middle is not opening yet (" + open(box()).toFixed(3) + " shown at 16ms)");
  onEdges(box(), "open, first frame");
  moment(100); onEdges(box(), "open, 100ms");
  if (glaring()) at("open, 100ms", "the light is brighter than the window's edges");
  smooth(box(), "opening", 8, 160);
  moment(196);
  if (!(open(box()) > 0.97)) at("open, 196ms", "not yet open (" + open(box()).toFixed(3) + ")");
  moment(205);
  if (open(box()) < 1) at("open, 205ms", "still clipped (the glow of its edges cut off)");
  if (bars().length) at("open, 205ms", "the light is still over the window, on top of its own edges");
  moment(250);
  const g = grownBy(box());
  if (g < 1.01 || g > 1.03) at("open, 250ms", "a window opened does not stand a touch larger (" + g.toFixed(3) + ")");
  moment(330);
  if (Math.abs(grownBy(box()) - 1) > 0.002) at("open, 330ms", "the window is not its own size (" + grownBy(box()).toFixed(3) + ")");
  play(); release(); await sleep(600);
  if (box().getAnimations().length) at("after opening", "the window is still moving");
  if (open(box()) < 1 || box().classList.contains("sys-open")) at("after opening", "the window is not whole");

  // ---- left to run in real time, the light is gone soon after ----
  ui.modal = null; T.render(); await sleep(500);
  ui.modal = "guide"; T.render(); await sleep(400);
  if (document.querySelector(".swfx")) at("after opening", "the light is still there");
  ui.modal = "ranks"; T.render(); await sleep(600);

  // ---- the same window closing ----
  hold();
  ui.modal = null; T.render();
  const ghost = () => document.querySelector(".sys-ghost .modal-box");
  if (!ghost()) at("closing", "no window being taken down");
  else {
    moment(16);
    const o = open(ghost());
    if (!(o < 0.85)) at("closing, first frame", "the window has not begun to fold to its middle (" + o.toFixed(3) + ")");
    onEdges(ghost(), "closing, first frame");
    smooth(ghost(), "closing", 8, 120, true);
    moment(80); onEdges(ghost(), "closing, 80ms");
    // the page behind brightens with it: the backdrop's way out, played as its
    // way in reversed, held the page dimmed until the very end (2026-10-26)
    const scrim = document.querySelector(".modal-backdrop.sys-ghost");
    const dim = () => { const c = getComputedStyle(scrim).backgroundColor.match(/[\d.]+/g) || []; return c.length === 4 ? +c[3] : c.length === 3 ? 1 : 0; };
    if (scrim) {
      moment(0); const d0 = dim(); moment(80);
      if (!(d0 > 0)) at("closing", "the window's backdrop dims nothing to begin with");
      else if (dim() > d0 * 0.5) at("closing, 80ms", "the page behind is still dimmed as it was while the window was open");
    }
    moment(165);
    if (open(ghost()) > 0.01) at("closing, 165ms", "the window is not shut (" + open(ghost()).toFixed(3) + ")");
    const b = bars();
    if (b.length !== 2 || Math.abs(midY(b[0]) - midY(b[1])) > 1) at("closing, 165ms", "its edges have not met in one line");
    if (glaring()) at("closing, 165ms", "the light is brighter than the window's edges");
    moment(225);
    if (bars().length) at("closing, 225ms", "the last line has not gone");
  }
  play(); release(); await sleep(400);
  if (document.querySelector(".sys-ghost, .swfx")) at("after closing", "the window or its light is left on the screen");

  // ---- a big notice: the same opening, between its own bars, and it keeps them ----
  try { localStorage.removeItem("sys-quest-arrived"); } catch (e) {}
  hold();
  SYS._main.maybeAnnounceDailyQuest();
  const big = () => document.querySelector(".notif.notif-big");
  if (!big()) at("notice", "the Daily Quest did not arrive");
  else {
    moment(16);
    if (!(open(big()) >= 0.2)) at("notice, first frame", "it is not opening yet");
    if (bars(".swfx.fx-kept .swfx-bar").length !== 2) at("notice, first frame", "its light is not its own bars");
    else onEdges(big(), "notice, first frame", ".swfx.fx-kept .swfx-bar");
    if (glaring()) at("notice, first frame", "the light over it is not its own bars as they stand");
    moment(100);
    if (glaring()) at("notice, 100ms", "the light over it is not its own bars as they stand");
    moment(330);
    if (open(big()) < 1) at("notice, 330ms", "the notice is not open");
    if (bars().length) at("notice, 330ms", "the light is still over it, on top of its own bars");
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
    hold();
    big().querySelector(".notif-big-x").click(); moment(16);
    if (bars(".swfx.fx-kept .swfx-bar").length !== 2) at("notice closing", "it does not go between its own bars");
    if (glaring()) at("notice closing", "the light is brighter than its own bars");
    play(); release(); await sleep(600);
  }
  release();

  // ---- the phone's menu, the way between pages: it only opens, no glare ----
  ui.modal = null; T.render(); await sleep(600);
  hold();
  ui.modal = "menu"; T.render();
  if (!box()) at("menu", "the menu did not open");
  else {
    moment(16); onEdges(box(), "menu, first frame");
    smooth(box(), "menu opening", 8, 160);
    for (let ms = 0; ms <= 320; ms += 16) {
      moment(ms);
      if (glaring()) { at("menu, " + ms + "ms", "the light is brighter than the menu's edges"); break; }
      if (grownBy(box()) > 1.002) { at("menu, " + ms + "ms", "the menu stands larger, as a moment does"); break; }
    }
    moment(205);
    if (open(box()) < 1 || bars().length) at("menu, 205ms", "not whole with its own edges yet");
  }
  play(); release(); await sleep(600);
  hold();
  ui.modal = null; T.render();
  for (let ms = 0; ms <= 220; ms += 16) { moment(ms); if (glaring()) { at("menu closing, " + ms + "ms", "the light is brighter than the menu's edges"); break; } }
  play(); release(); await sleep(400);

  // ---- a page's windows: the same opening, 40ms apart, never larger ----
  // to the overview, which has several windows (the quests page here has one)
  ui.modal = null; ui.page = "quests"; T.render(); await sleep(800);
  hold();
  ui.page = "overview"; T.render();
  // its lights are laid once everything the press changes is drawn
  await Promise.resolve();
  const wins = [...document.querySelectorAll("#page .sw-win")];
  if (wins.length < 3) at("page", "only " + wins.length + " window(s) arriving on the page, too few to see their order");
  if (!document.querySelector(".swfx.fx-page")) at("page", "the page's windows got no light");
  const delays = wins.map((w) => { const a = w.getAnimations()[0]; return a ? a.effect.getTiming().delay : NaN; });
  if (delays.some((d, i) => !(Math.abs(d - Math.min(i, 3) * 40) < 4))) at("page", "its windows do not open 40ms apart, the fifth with the fourth (" + delays.join(", ") + ")");
  if (wins[0]) { moment(16); if (!(open(wins[0]) >= 0.2)) at("page, first frame", "its first window is not opening yet"); onEdges(wins[0], "page, first frame", ".swfx.fx-page .swfx-bar"); }
  for (let ms = 0; ms <= 340; ms += 16) {
    moment(ms);
    if (glaring(".swfx.fx-page .swfx-bar")) { at("page, " + ms + "ms", "the light is brighter than a window's edges"); break; }
    if (wins.some((w) => grownBy(w) > 1.002)) { at("page, " + ms + "ms", "a page's window stands larger"); break; }
  }
  moment(330);
  if (wins.some((w) => open(w) < 1)) at("page, 330ms", "not every window on the page stands whole");
  play(); release(); await sleep(800);
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
      const metric = async (name) => (await s("Performance.getMetrics")).metrics.find((m) => m.name === name).value;
      const before = await metric("RecalcStyleCount");
      await new Promise((r) => setTimeout(r, 2000));
      const restyled = (await metric("RecalcStyleCount")) - before;
      if (restyled > 20) all.push(cfg.name + " · idle overview: restyled " + restyled + " times in 2 seconds of standing still");
      // Opening a window or a page, in real time, runs no script frame by
      // frame and lays the page out a few times, not on every frame: the light
      // measured its window on each frame and a title decoded letter by
      // letter, 55 frame callbacks and 40 layouts an opening (2026-10-26). The
      // motion is the browser's own, which keeps it smooth on a busy phone.
      await s("Runtime.evaluate", { expression: "(() => { const raf = window.requestAnimationFrame.bind(window); window.__frames = 0; window.requestAnimationFrame = (f) => { window.__frames++; return raf(f); }; return 1; })()" });
      const steps = [["opening the settings", null, `document.querySelector('[data-action="open-settings"]').click()`],
        ["opening the menu", null, `SYS.__uiTest.ui.modal = "menu"; SYS.__uiTest.render()`],
        ["moving to another page", `SYS.__uiTest.ui.modal = "menu"; SYS.__uiTest.render()`, `(document.querySelector('#modal-layer [data-page="quests"]') || document.querySelector('[data-action="nav"][data-page="quests"]')).click()`]];
      for (const [what, before, act] of steps) {
        await s("Runtime.evaluate", { expression: "SYS.__uiTest.ui.modal = null; SYS.__uiTest.ui.page = 'overview'; SYS.__uiTest.render(); " + (before || "") + "; 1" });
        await new Promise((r) => setTimeout(r, 600));
        const l0 = await metric("LayoutCount");
        await s("Runtime.evaluate", { expression: "window.__frames = 0; " + act + "; 1" });
        await new Promise((r) => setTimeout(r, 600));
        const laid = (await metric("LayoutCount")) - l0;
        const frames = (await s("Runtime.evaluate", { expression: "window.__frames", returnByValue: true })).result.value;
        if (laid > 15) all.push(cfg.name + " · " + what + ": the page was laid out " + laid + " times in 600ms");
        if (frames > 3) all.push(cfg.name + " · " + what + ": script ran on " + frames + " frames of the motion");
      }
      await s("Runtime.evaluate", { expression: "SYS.__uiTest.ui.modal = null; SYS.__uiTest.render(); 1" });
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

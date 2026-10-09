// Every page and window at phone width, in a real (headless) Chrome:
//   node tests/test-phone-layout.js
//
// The layout bugs found by eye on 2026-10-09 — a quest title squeezed to one
// letter a line, the status bar's right side sliding over the rank, a frame
// lying over the first letter of a name — are what this looks for, so they
// cannot come back unseen:
//   - anything wider than the screen (the page scrolling sideways),
//   - text squeezed into a column narrower than a few letters,
//   - pieces of the status bar, a ranking row or a quest's title row
//     overlapping each other.
//
// No account and no network: the app runs from a local server with every
// outside address blocked (so Firebase never loads and nothing reaches the
// real project), and opens with ?uitest, which hands this script the display
// state (see main.js). The script fills it with sample data written to be
// awkward — long names, big balances, a worn frame, held quests — and draws
// each page in turn. No packages: Chrome is driven over its DevTools socket.
// Without Chrome installed it says so and passes.
"use strict";
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const WIDTHS = [360, 390];

function findChrome() {
  const c = [
    process.env.CHROME,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  return c.find((p) => p && fs.existsSync(p)) || null;
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".mp4": "video/mp4",
  ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".ico": "image/x-icon" };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

async function devtools(chrome, profile) {
  const proc = spawn(chrome, ["--headless=new", "--remote-debugging-port=0", "--user-data-dir=" + profile,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--mute-audio", "about:blank"],
    { stdio: "ignore" });
  const portFile = path.join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await new Promise((r) => setTimeout(r, 100));
  const [port, wsPath] = fs.readFileSync(portFile, "utf8").trim().split(/\r?\n/);
  const ws = new WebSocket("ws://127.0.0.1:" + port + wsPath);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) {
      const { resolve, reject } = waiting.get(msg.id);
      waiting.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const m = { id: ++id, method, params };
    if (sessionId) m.sessionId = sessionId;
    waiting.set(m.id, { resolve, reject });
    ws.send(JSON.stringify(m));
  });
  return { proc, ws, send };
}

// Runs inside the page. Returns a list of problems, each a short line.
async function inPage(width) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !(window.SYS && SYS.__uiTest); i++) await sleep(100);
  const T = SYS.__uiTest;
  if (!T) return ["the ?uitest hook never appeared"];
  const ui = T.ui;
  const problems = [];
  const me = "u-tester";

  // ---- sample data, awkward on purpose ------------------------------------
  const st = SYS.clone(T.getState());
  st.player.name = "Administrator Longname";
  st.tasks = [];
  const quest = (title, extra) => SYS.addTask(st, { title, priority: "High", types: ["LING"], pt: 50, taskType: "Short Term", ...extra });
  quest("read book");
  quest("Fast typing on the keyboard with all ten fingers", { taskType: "Long Term", mode: "slider", priority: "Medium" });
  quest("Reading “Animal Farm” and writing a one-page summary of every chapter", { priority: "Low" });
  const habit = (title, unit, targetAmount) => SYS.addTask(st, { title, priority: "Medium", types: ["BODY"], pt: 20, recurring: true, schedule: { type: "daily" }, unit, targetAmount });
  habit("Drink water", "L", 2);
  habit("Deep work session without the phone anywhere near the desk", "min", 30);
  habit("Sleep 7–8 hours every day", "times", 1);
  T.setState(st);
  // Every quest shows a held reward: the widest a title row gets.
  SYS.isGatedTask = () => true;
  SYS.heldQuestExp = () => 12500;

  ui.landing = false;
  ui.assess = null;
  ["landing-layer", "assess-layer"].forEach((id) => { const el = document.getElementById(id); if (el) el.innerHTML = ""; });
  ui.cloudUser = { uid: me, email: "a.very.long.address@example.com", emailVerified: true };
  ui.isAdmin = true;
  ui.avatars = { [me]: "a08", "u-2": "a03", "u-3": "a11" };
  ui.frames = { [me]: "hud", "u-2": "angel" };
  ui.wallet = { gold: 12345678, aurenite: 4500, themes: [], frames: ["hud", "angel"], backgrounds: ["angel"], freezes: 2 };
  ui.myWorn = { frame: "hud", background: "angel" };
  ui.streak = { lastDay: SYS.todayKey(), current: 123, best: 456 };
  const names = ["Administrator Longname", "Osama", "Seraphina Nightingale-Valdez", "Q", "Kenji", "Maximilian", "Lea", "Zhang Wei", "Noor", "Aleksandr"];
  ui.leaderboard = names.map((n, i) => ({ uid: i === 0 ? me : "u-" + (i + 1), displayName: n, totalExp: 1234567 - i * 98765,
    weekExp: 99999 - i * 777, seasonExp: 555555 - i * 4444, lastRank: i % 3 === 0 ? i + 2 : i, cats: {} }));
  ui.leaderboardMine = ui.leaderboard[0];
  ui.friendships = names.slice(1, 5).map((n, i) => ({ users: [me, "u-" + (i + 2)], status: "accepted", from: me, to: "u-" + (i + 2) }));
  ui.friendRows = Object.fromEntries(ui.leaderboard.map((r) => [r.uid, r]));
  ui.myRow = ui.leaderboard[0];

  // ---- the checks -----------------------------------------------------------
  const W = window.innerWidth;
  const visible = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0"; };
  const label = (e) => e.tagName.toLowerCase() + (typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : "") +
    (e.textContent && e.textContent.trim() ? " “" + e.textContent.trim().slice(0, 24) + "”" : "");
  const clipped = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== "visible") return true; } return false; };
  // What of an element is actually on screen: its box cut down by every
  // ancestor that clips (a tag inside an ellipsised name is cut off there,
  // not lying over the next column).
  const seen = (e) => {
    const r = e.getBoundingClientRect();
    let b = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      if (getComputedStyle(p).overflowX === "visible" && getComputedStyle(p).overflowY === "visible") continue;
      const q = p.getBoundingClientRect();
      b = { left: Math.max(b.left, q.left), right: Math.min(b.right, q.right), top: Math.max(b.top, q.top), bottom: Math.min(b.bottom, q.bottom) };
    }
    return b;
  };
  const overlap = (a, b) => { const x = Math.min(a.right, b.right) - Math.max(a.left, b.left); const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); return x > 3 && y > 3; };

  function check(where) {
    const found = [];
    const sideways = document.documentElement.scrollWidth - W;
    if (sideways > 1) found.push("the page is " + sideways + "px wider than the screen");
    document.querySelectorAll("#app *, #modal-layer *").forEach((e) => {
      if (!visible(e) || e.closest(".visually-hidden")) return;
      const r = e.getBoundingClientRect();
      if ((r.right > W + 1 || r.left < -1) && !clipped(e) && e.children.length === 0) found.push(label(e) + " reaches past the screen edge");
      // Squeezed text: four or more letters forced into a column a couple of
      // letters wide, running down several lines.
      if (e.children.length === 0 && (e.textContent || "").trim().length >= 4) {
        const fs = parseFloat(getComputedStyle(e).fontSize) || 14;
        if (r.width < fs * 2.2 && r.height > fs * 3.5) found.push(label(e) + " is squeezed to " + Math.round(r.width) + "px wide");
      }
    });
    // Rows whose pieces must sit side by side without covering each other.
    document.querySelectorAll(".statusbar-inner, .lb-row, .task-title-row, .friend-card, .shop-card-name").forEach((row) => {
      if (!visible(row)) return;
      const parts = Array.from(row.querySelectorAll("*")).filter((e) => visible(e) && !e.closest(".visually-hidden") &&
        (e.children.length === 0 || e.matches("button, img")) && !e.matches("canvas.av-frame, .exp-track, .exp-fill, svg *"));
      for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i], b = parts[j];
        if (a.contains(b) || b.contains(a)) continue;
        // The portrait's own pieces — face, frame, level badge — are layered on purpose.
        const pa = a.closest(".status-avatar, .lb-face"), pb = b.closest(".status-avatar, .lb-face");
        if (pa && pa === pb) continue;
        if (overlap(seen(a), seen(b))) found.push(label(a) + " overlaps " + label(b));
      }
    });
    // A worn frame reaches past its face, but not onto the name beside it.
    document.querySelectorAll("canvas.av-frame").forEach((c) => {
      if (!visible(c)) return;
      const row = c.closest(".lb-row, .statusbar-inner, .friend-card");
      if (!row) return;
      const fr = c.getBoundingClientRect();
      row.querySelectorAll(".lb-name, .player-name-btn, .lb-you-tag, .lv-tag").forEach((n) => {
        if (visible(n) && overlap(fr, seen(n))) found.push("a worn frame covers " + label(n));
      });
    });
    [...new Set(found)].forEach((f) => problems.push(width + "px · " + where + ": " + f));
  }

  async function show(where, set) {
    try {
      set();
      T.render();
      await sleep(350);
      window.scrollTo(0, 0);
      check(where);
    } catch (e) { problems.push(width + "px · " + where + ": the page failed to draw — " + (e && e.message)); }
  }

  const pages = ["overview", "quests", "habits", "planner", "stats", "leaderboard", "intelligence", "log", "shop", "friends", "mail", "admin"];
  for (const p of pages) await show(p, () => { ui.modal = null; ui.page = p; });
  for (const v of ["week", "month"]) await show("planner " + v, () => { ui.page = "planner"; ui.plannerView = v; });
  ui.plannerView = "day";
  for (const m of ["season", "week"]) await show("ranking " + m, () => { ui.page = "leaderboard"; ui.lbMode = m; });
  for (const tab of ["items", "frames", "backgrounds"]) await show("shop " + tab, () => { ui.page = "shop"; ui.shopTab = tab; });
  ui.page = "overview";
  for (const m of ["settings", "library", "ranks", "guide"]) await show("the " + m + " window", () => { ui.modal = m; });
  ui.modal = null;
  return problems;
}

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log("skipped — no Chrome or Edge found (set CHROME to its path)"); return; }
  const srv = await serve();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sys-phone-"));
  const { proc, ws, send } = await devtools(chrome, profile);
  const all = [];
  try {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const s = (m, p) => send(m, p, sessionId);
    await s("Network.enable");
    // Only this machine: Firebase, fonts and everything else outside stay out.
    await s("Network.setBlockedURLs", { urls: ["https://*", "*gstatic.com*", "*googleapis.com*", "*google.com*", "*recaptcha*"] });
    for (const width of WIDTHS) {
      await s("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 2, mobile: true });
      await s("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      await s("Page.enable");
      await s("Page.navigate", { url: "http://127.0.0.1:" + srv.address().port + "/index.html?uitest" });
      await new Promise((r) => setTimeout(r, 2500));
      const res = await s("Runtime.evaluate", { expression: "(" + inPage.toString() + ")(" + width + ")", awaitPromise: true, returnByValue: true });
      if (res.exceptionDetails) all.push(width + "px: the check itself failed — " + (res.exceptionDetails.exception && res.exceptionDetails.exception.description || res.exceptionDetails.text));
      else all.push(...res.result.value);
    }
  } finally {
    try { ws.close(); } catch (e) {}
    proc.kill();
    srv.close();
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }, 500);
  }
  all.forEach((p) => console.log("  FAIL  " + p));
  console.log(all.length ? all.length + " bugs" : "all passed — " + WIDTHS.join(" and ") + "px, every page and window");
  if (all.length) process.exitCode = 1;
}

main().catch((e) => { console.log("FAIL  " + (e && e.stack || e)); process.exitCode = 1; });

// The guided tours, walked for real in a headless Chrome:  node tests/test-tours.js
//
// Two promises a walk makes, both broken by eye on 2026-10-15 and held here:
//   1. It follows the screen: within one part of the page (a step with `act`
//      or `phase` starts a new part) every step points at something lower on
//      the page than the step before it, or further along the same row.
//   2. It explains the page: every control the page shows during the walk is
//      inside something a step pointed at — a button nobody explains is a
//      button the walk forgot (the quest description, 2026-10-15).
// Sample data fills every page (habits, quests, directives, friends, races,
// mail, ranking), so steps that need content have it. No account, no network.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { findChrome, serve, devtools } = require("./lib-chrome");

// Controls that are deliberately not steps of their page's walk.
const NOT_IN_WALKS = new Set([
  "help",              // the "?" that starts the walk itself
  "tour-start",
  "nav",               // links to other pages (each has its own walk)
  "planner-focus-add", // the empty planner's shortcut to the to-do field
]);

async function inPage(cfg) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !(window.SYS && SYS.__uiTest); i++) await sleep(100);
  const T = SYS.__uiTest;
  if (!T) return ["the ?uitest hook never appeared"];
  const ui = T.ui, me = "u-me", problems = [];

  const st = SYS.clone(T.getState());
  st.tasks = [];
  st.assessment = st.assessment || { takenAt: Date.now(), answers: {}, granted: {}, neverTried: [], skipped: true };
  const lv = { self: 9, social: 4, linguistic: 12, logical: 7, bodily: 15, natural: 2, visual: 6, musical: 1 };
  for (const k in st.intelligences) { const tr = st.intelligences[k].traits || []; if (tr[0]) tr[0].level = lv[k] != null ? lv[k] : 3; }
  const habit = (title, unit, n) => SYS.addTask(st, { title, priority: "Medium", types: ["BODY"], pt: 20, recurring: true, schedule: { type: "daily" }, unit, targetAmount: n });
  habit("Drink water", "L", 2); habit("Deep work session", "min", 30); habit("Sleep 7–8 hours", "times", 1);
  SYS.addTask(st, { title: "Read 20 pages of a book", priority: "High", types: ["LING"], pt: 50, taskType: "Short Term" });
  T.setState(st);
  ui.landing = false; ui.assess = null;
  ["landing-layer", "assess-layer"].forEach((id) => { const el = document.getElementById(id); if (el) el.innerHTML = ""; });
  ui.cloudUser = { uid: me, email: "t@example.com", emailVerified: true };
  ui.wallet = { gold: 45000, aurenite: 450, themes: [], frames: [], backgrounds: [], freezes: 1 };
  const names = ["Me", "Kenji", "Noor", "Lea", "Zhang Wei"];
  ui.leaderboard = names.map((n, i) => ({ uid: i ? "u-" + i : me, displayName: n, totalExp: 9000 - i * 900, weekExp: 900 - i * 90, seasonExp: 4000 - i * 400, lastRank: i, cats: {} }));
  ui.leaderboardMine = ui.leaderboard[0]; ui.leaderboardError = null; ui.leaderboardBusy = false;
  ui.friendships = [
    { users: [me, "u-1"], status: "accepted", from: me, to: "u-1" },
    { users: ["u-2", me], status: "pending", from: "u-2", to: me },
  ];
  ui.friendRows = Object.fromEntries(ui.leaderboard.map((r) => [r.uid, r]));
  ui.races = [{ id: "r1", users: [me, "u-1"], status: "active", metric: "exp", challenger: me, opponent: "u-1", endAt: { toMillis: () => Date.now() + 3 * 864e5 } }];
  ui.raceScores = { r1: { [me]: 320, "u-1": 280 } };
  ui.inbox = [{ id: "m1", text: "Your answer was accepted.", amount: 50, read: false }];
  ui.blockedList = [];
  ui.suggestionsError = null; ui.suggestionsBusy = false;
  ui.suggestions = { weekKey: "t", items: [{ id: "s1", kind: "quest", title: "Write a summary", description: "One page.", pt: 60, types: ["LING"], reason: "Weakest" }] };
  st.planner = st.planner || {};
  T.render();

  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
  const controls = () => [...document.querySelectorAll("#page [data-action], #page input, #page select, #page textarea")].filter(vis);
  const labelOf = (e) => (e.getAttribute("data-action") || e.getAttribute("data-bind") || e.tagName.toLowerCase());

  for (const name of Object.keys(SYS.TOURS)) {
    const tour = SYS.TOURS[name];
    ui.modal = null; ui.taskForm = null; ui.page = name; T.render(); await sleep(500);
    if (name === "planner") {   // a to-do, so its own step has something to show
      const box = document.querySelector('[data-bind="plannerDraft"]');
      if (box) { box.value = "Buy milk"; box.dispatchEvent(new Event("input", { bubbles: true })); document.querySelector('[data-action="planner-add"]').click(); await sleep(300); }
    }
    window.scrollTo(0, 0);
    if (!SYS.startTour(name)) { problems.push(name + ": the walk did not start"); continue; }
    const seen = new Set(), covered = new Set(), shown = [];
    let prev = null;
    for (let guard = 0; guard < 40; guard++) {
      await sleep(450);
      const root = document.querySelector(".tour-root");
      if (!root) break;
      if (root.classList.contains("tour-waiting")) { await sleep(400); }
      const k = (document.documentElement.getAttribute("data-tour") || "").split(".").slice(1).join(".");
      const step = tour.steps.find((s) => s.k === k);
      const target = step && [...document.querySelectorAll(step.sel)].find((e) => e.getClientRects().length);
      // Every kind of control must be explained once: one "+" on one habit
      // speaks for the "+" on every habit.
      controls().forEach((c) => seen.add(labelOf(c)));
      if (target) {
        controls().forEach((c) => { if (target === c || target.contains(c)) covered.add(labelOf(c)); });
        const r = target.getBoundingClientRect();
        // The status bar and the menu stay put while the page scrolls.
        const fixed = !!target.closest("#statusbar, #sidebar");
        const pos = { k, top: Math.round(r.top + (fixed ? 0 : scrollY)), left: Math.round(r.left + scrollX), fresh: !!(step.act || step.phase) };
        if (prev && !pos.fresh && !cfg.rtl) {
          const sameRow = Math.abs(pos.top - prev.top) <= 10;
          if (!sameRow && pos.top < prev.top) problems.push(name + ": step \"" + k + "\" (y " + pos.top + ") comes after \"" + prev.k + "\" (y " + prev.top + ") but is higher on the screen");
          if (sameRow && pos.left < prev.left - 10) problems.push(name + ": step \"" + k + "\" is left of \"" + prev.k + "\" on the same row but comes after it");
        }
        prev = pos; shown.push(k);
      }
      const next = root.querySelector(".tour-next");
      if (!next) break;
      next.click();
    }
    if (document.querySelector(".tour-root")) { SYS.stopTour(); problems.push(name + ": the walk did not end"); }
    const skip = new Set(cfg.skip);
    const byLabel = [...seen].filter((l) => !covered.has(l) && !skip.has(l));
    if (byLabel.length) problems.push(name + ": controls the walk never explains: " + byLabel.join(", "));
    if (shown.length < 2) problems.push(name + ": only " + shown.length + " step(s) found something to point at");
  }
  return problems;
}

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log("skipped — no Chrome or Edge found (set CHROME to its path)"); return; }
  const srv = await serve();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sys-tours-"));
  const { proc, ws, send } = await devtools(chrome, profile);
  const all = [];
  try {
    const cfg = { name: "desktop en", rtl: false, skip: [...NOT_IN_WALKS] };
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const s = (m, p) => send(m, p, sessionId);
    await s("Network.enable");
    await s("Network.setBlockedURLs", { urls: ["https://*", "*gstatic.com*", "*googleapis.com*", "*google.com*", "*recaptcha*"] });
    await s("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await s("Page.enable");
    await s("Page.navigate", { url: "http://127.0.0.1:" + srv.address().port + "/index.html?uitest" });
    await new Promise((r) => setTimeout(r, 2500));
    const res = await s("Runtime.evaluate", { expression: "(" + inPage.toString() + ")(" + JSON.stringify(cfg) + ")", awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) all.push("the check itself failed — " + (res.exceptionDetails.exception && res.exceptionDetails.exception.description || res.exceptionDetails.text));
    else all.push(...res.result.value);
  } finally {
    try { ws.close(); } catch (e) {}
    proc.kill();
    srv.close();
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }, 500);
  }
  all.forEach((p) => console.log("  FAIL  " + p));
  console.log(all.length ? all.length + " bugs" : "all passed — every walk in screen order, every control explained");
  if (all.length) process.exitCode = 1;
}

main().catch((e) => { console.log("FAIL  " + (e && e.stack || e)); process.exitCode = 1; });

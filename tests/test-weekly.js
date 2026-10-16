// The weekly report, in a headless Chrome:  node tests/test-weekly.js
//
// What it promises (2026-10-15):
//   - its figures are the week's: EXP, Daily Quests (perfect days out of the
//     days that asked), goals met, quests done, the intelligence that grew most;
//   - it opens by itself once a week, for the week just finished, only when
//     that week had anything in it, and the Daily Quest waits until it closes;
//   - the overview's week window opens it, and its picture is a 1080 × 1350 PNG.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { findChrome, serve, devtools } = require("./lib-chrome");

async function inPage() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !(window.SYS && SYS.__uiTest && SYS._main); i++) await sleep(100);
  const T = SYS.__uiTest, M = SYS._main;
  if (!T || !M) return ["the ?uitest hook never appeared"];
  const problems = [], ui = T.ui;
  ["sys-week-report", "sys-quest-arrived"].forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
  ui.landing = false; ui.assess = null; ui.modal = null;
  ["landing-layer", "assess-layer"].forEach((id) => { const el = document.getElementById(id); if (el) el.innerHTML = ""; });

  // An empty last week: nothing opens, and the week counts as greeted.
  const blank = SYS.clone(T.getState()); blank.tasks = []; blank.dailyStats = {}; T.setState(blank);
  M.greetOnOpen(); await sleep(300);
  if (ui.modal) problems.push("the report opened for a week with nothing in it");
  try { localStorage.removeItem("sys-week-report"); } catch (e) {}

  // A week of work: three daily habits since a month ago, all met on four
  // days of last week; EXP and quests on every day; LING grew by 9.
  const st = SYS.clone(T.getState());
  const today = SYS.todayKey();
  const last = SYS.statsWeek(st, -1).days.map((d) => d.dateKey);
  const habit = (title) => SYS.addTask(st, { title, priority: "Medium", types: ["BODY"], pt: 20, recurring: true, schedule: { type: "daily" }, unit: "times", targetAmount: 1 });
  habit("A"); habit("B"); habit("C");
  st.tasks.forEach((x) => {
    x.createdAt = Date.now() - 40 * 864e5;
    x.days = {};
    last.forEach((k, i) => { if (i < 4 || (i === 4 && x.title === "A")) x.days[k] = { amount: 1, n: 1 }; });
  });
  st.dailyStats = {};
  last.forEach((k, i) => { st.dailyStats[k] = { xp: 100 * (i + 1), quests: 1, repeats: 0, habitIds: [] }; });
  const keys = Object.keys(st.intelligences);
  const before = {}, after = {};
  keys.forEach((k, i) => { before[k] = 10; after[k] = 10 + (k === "linguistic" ? 9 : i % 3); });
  st.player.scoreLog = [{ d: SYS.shiftDay(last[0], -3), s: before }, { d: last[6], s: after }];
  T.setState(st);
  ui.page = "overview"; T.render(); await sleep(300);

  const r = SYS.weekReport(T.getState(), -1);
  const want = { xp: 2800, questDays: 4, askedDays: 7, goals: 13, quests: 7 };
  Object.keys(want).forEach((k) => { if (r[k] !== want[k]) problems.push("last week's " + k + " is " + r[k] + ", not " + want[k]); });
  if (!r.grew || r.grew.type.key !== "linguistic" || r.grew.n !== 9) problems.push("grew most is " + JSON.stringify(r.grew && [r.grew.type.key, r.grew.n]) + ", not linguistic +9");
  if (!r.best || r.best.key !== last[6]) problems.push("the best day is not the week's last");

  // The first open of the week: the report, and the quest after it.
  M.greetOnOpen(); await sleep(500);
  if (ui.modal !== "weekCard") problems.push("the first open of a week did not open the report (" + ui.modal + ")");
  else {
    if (ui.weekCard.offset !== -1) problems.push("the report opened on this week, not the one just finished");
    if (document.querySelector(".notif-big")) problems.push("the Daily Quest came over the open report");
    const tiles = [...document.querySelectorAll(".wkr-tile .wkr-v")].map((e) => e.textContent);
    if (tiles.join(" ") !== "+2,800 4/7 13 7") problems.push("the report shows " + tiles.join(" "));
    document.querySelector('.wkr-box [data-action="close-modal"]').click();
    await sleep(900);
    if (![...document.querySelectorAll(".notif-big")].some((n) => n.querySelector(".nq-goals"))) problems.push("the Daily Quest was not announced once the report was closed");
    document.querySelectorAll(".notif-big .notif-big-x").forEach((n) => n.click());
    await sleep(400);
  }
  M.greetOnOpen(); await sleep(400);
  if (ui.modal) problems.push("the report opened twice in one week");

  // From the week window, and the picture.
  const open = document.querySelector(".week-bars .wkr-open");
  if (!open) problems.push("the overview's week window has no way to the report");
  else {
    open.click(); await sleep(400);
    if (ui.modal !== "weekCard") problems.push("the week window's button did not open the report");
    document.querySelector('[data-action="week-card-tab"][data-offset="-1"]').click(); await sleep(300);
    if (ui.weekCard.offset !== -1) problems.push("the Last week tab did not switch the report");
    const blob = await M.prepareWeekImage();
    if (!blob || blob.type !== "image/png") problems.push("no PNG for the picture");
    else {
      const bmp = await createImageBitmap(blob);
      if (bmp.width !== 1080 || bmp.height !== 1350) problems.push("the picture is " + bmp.width + " × " + bmp.height);
    }
  }
  return problems;
}

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log("skipped — no Chrome or Edge found (set CHROME to its path)"); return; }
  const srv = await serve();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sys-wk-"));
  const { proc, ws, send } = await devtools(chrome, profile);
  const all = [];
  try {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const s = (m, p) => send(m, p, sessionId);
    await s("Network.enable");
    await s("Network.setBlockedURLs", { urls: ["https://*", "*gstatic.com*", "*googleapis.com*", "*google.com*", "*recaptcha*"] });
    await s("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await s("Page.enable");
    await s("Page.navigate", { url: "http://127.0.0.1:" + srv.address().port + "/index.html?uitest" });
    await new Promise((r) => setTimeout(r, 2500));
    const res = await s("Runtime.evaluate", { expression: "(" + inPage.toString() + ")()", awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) all.push("the check itself failed — " + (res.exceptionDetails.exception && res.exceptionDetails.exception.description || res.exceptionDetails.text));
    else all.push(...res.result.value);
  } finally {
    try { ws.close(); } catch (e) {}
    proc.kill();
    srv.close();
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }, 500);
  }
  all.forEach((p) => console.log("  FAIL  " + p));
  console.log(all.length ? all.length + " bugs" : "all passed — the week's figures, once a week, the quest after it, a 1080 × 1350 picture");
  if (all.length) process.exitCode = 1;
}

main().catch((e) => { console.log("FAIL  " + (e && e.stack || e)); process.exitCode = 1; });

// The Daily Quest on the overview, in a headless Chrome:  node tests/test-daily-quest.js
//
// What it promises (2026-10-15):
//   - its goals are the habits the day asks for, by the calendar's own rule,
//     each with its count in brackets; a habit with days to spare is a bonus;
//   - it is announced once a day, and only when there is something to do;
//   - the press that meets the last goal completes it, said once a day, and
//     after a level reached by the same press rather than on top of it;
//   - its clock runs without the window being drawn again.
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
  const big = () => [...document.querySelectorAll(".notif-big")].map((n) => n.className.includes("notif-quest") ? (n.querySelector(".nq-goals") ? "arrived" : "done") : "levelup");
  const closeBig = async () => { document.querySelectorAll(".notif-big").forEach((n) => n.click()); await sleep(500); };
  try { localStorage.removeItem("sys-quest-arrived"); } catch (e) {}
  ui.landing = false; ui.assess = null;
  ["landing-layer", "assess-layer"].forEach((id) => { const el = document.getElementById(id); if (el) el.innerHTML = ""; });

  // Nothing to do: no announcement, and the day stays free to announce later.
  const st0 = SYS.clone(T.getState()); st0.tasks = []; T.setState(st0);
  ui.page = "overview"; T.render();
  M.maybeAnnounceDailyQuest(); await sleep(300);
  if (big().length) problems.push("announced a Daily Quest with no goals in it");

  const st = SYS.clone(T.getState());
  const habit = (title, unit, n, schedule) => SYS.addTask(st, { title, priority: "Medium", types: ["BODY"], pt: 20, recurring: true, schedule: schedule || { type: "daily" }, unit, targetAmount: n });
  habit("Drink water", "L", 2); habit("Deep work session", "min", 30); habit("Sleep 7–8 hours", "times", 1);
  habit("Swim", "times", 1, { type: "perWeek", n: 1 });
  T.setState(st); T.render(); await sleep(300);
  const today = SYS.todayKey();
  const swim = T.getState().tasks.find((x) => x.title === "Swim");
  const swimOwed = SYS.markAsked(SYS.markOn(swim, today));   // owed only on the week's last day

  const rows = [...document.querySelectorAll(".today-panel .dq-goal")];
  const goalRows = rows.filter((r) => !r.classList.contains("dq-bonus"));
  const counts = goalRows.map((r) => r.querySelector(".dq-count").textContent);
  if (goalRows.length !== (swimOwed ? 4 : 3)) problems.push("the window shows " + goalRows.length + " goals, not the " + (swimOwed ? 4 : 3) + " the day asks for");
  if (!swimOwed && !document.querySelector(".today-panel .dq-bonus")) problems.push("a habit with days to spare is not shown as a bonus goal");
  ["[0/2 " + SYS.tUnit("L", 2) + "]", "[00:00/30:00]", "[0/1]"].forEach((c) => { if (!counts.includes(c)) problems.push("no goal counted " + c + " (got " + counts.join(", ") + ")"); });
  const head = document.querySelector(".today-panel .dq-goals");
  if (!head || !/\[0\/[34]\]/.test(head.textContent)) problems.push("the GOALS count is not [0/n]: " + (head && head.textContent));

  // The clock runs without the window being drawn again.
  const panel = document.querySelector(".today-panel"), clock = document.querySelector(".dq-left");
  const before = clock && clock.textContent;
  await sleep(1300);
  if (!clock || clock.textContent === before) problems.push("the clock did not move");
  if (document.querySelector(".today-panel") !== panel) problems.push("the window was drawn again to move the clock");

  // Announced once a day.
  M.maybeAnnounceDailyQuest(); await sleep(300);
  if (big().join() !== "arrived") problems.push("the first open of the day did not announce the quest (" + big().join() + ")");
  else if (document.querySelectorAll(".notif-big .nq-goal").length !== (swimOwed ? 4 : 3)) problems.push("the announcement does not list the goals");
  await closeBig();
  M.maybeAnnounceDailyQuest(); await sleep(300);
  if (big().length) problems.push("the quest was announced twice in one day");

  // Meeting every goal through the real press path; the last press also
  // reaches a level.
  const ids = SYS.dailyQuest(M.state, today).goals.map((x) => x.id);
  const meet = (id, last) => M.runGameAction((d) => {
    const t = d.tasks.find((x) => x.id === id);
    t.days = Object.assign({}, t.days, { [today]: { amount: SYS.habitGoalBase(t), n: 1 } });
    return last ? [{ kind: "levelup", text: "Level 1 → 2" }] : [];
  });
  ids.slice(0, -1).forEach((id) => meet(id, false));
  await sleep(300);
  if (big().length) problems.push("completed before the last goal was met");
  meet(ids[ids.length - 1], true);
  await sleep(400);
  if (big().join() !== "levelup") problems.push("the level and the completion did not come one at a time, level first (" + big().join() + ")");
  await closeBig(); await sleep(300);
  if (big().join() !== "done") problems.push("after the level, the Daily Quest complete notice did not follow (" + big().join() + ")");
  await closeBig();
  if (!document.querySelector(".today-panel .dq-stamp")) problems.push("the window is not stamped complete");
  if (document.querySelector(".today-panel .dq-left")) problems.push("a completed quest still shows its clock");

  // Taking a goal back and meeting it again is not news.
  M.runGameAction((d) => { const t = d.tasks.find((x) => x.id === ids[0]); t.days = Object.assign({}, t.days, { [today]: { amount: 0, n: 0 } }); return []; });
  if (document.querySelector(".today-panel .dq-stamp")) problems.push("still stamped complete with a goal taken back");
  meet(ids[0], false); await sleep(400);
  if (big().length) problems.push("completed twice in one day");
  return problems;
}

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log("skipped — no Chrome or Edge found (set CHROME to its path)"); return; }
  const srv = await serve();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sys-dq-"));
  const { proc, ws, send } = await devtools(chrome, profile);
  const all = [];
  try {
    for (const lang of ["en", "ar"]) {
      const { targetId } = await send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
      const s = (m, p) => send(m, p, sessionId);
      await s("Network.enable");
      await s("Network.setBlockedURLs", { urls: ["https://*", "*gstatic.com*", "*googleapis.com*", "*google.com*", "*recaptcha*"] });
      await s("Emulation.setDeviceMetricsOverride", { width: lang === "ar" ? 390 : 1280, height: 900, deviceScaleFactor: 1, mobile: lang === "ar" });
      await s("Page.enable");
      await s("Page.navigate", { url: "http://127.0.0.1:" + srv.address().port + "/index.html?uitest" });
      await new Promise((r) => setTimeout(r, 2500));
      if (lang === "ar") await s("Runtime.evaluate", { expression: "SYS.setLanguageCode('ar'); document.documentElement.dir = 'rtl'; 1" });
      const res = await s("Runtime.evaluate", { expression: "(" + inPage.toString() + ")()", awaitPromise: true, returnByValue: true });
      if (res.exceptionDetails) all.push(lang + ": the check itself failed — " + (res.exceptionDetails.exception && res.exceptionDetails.exception.description || res.exceptionDetails.text));
      else all.push(...res.result.value.map((p) => lang + ": " + p));
      await send("Target.closeTarget", { targetId });
    }
  } finally {
    try { ws.close(); } catch (e) {}
    proc.kill();
    srv.close();
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }, 500);
  }
  all.forEach((p) => console.log("  FAIL  " + p));
  console.log(all.length ? all.length + " bugs" : "all passed — goals, counts, clock, one announcement a day, one completion a day");
  if (all.length) process.exitCode = 1;
}

main().catch((e) => { console.log("FAIL  " + (e && e.stack || e)); process.exitCode = 1; });

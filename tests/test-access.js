// Who may use what (SYS.PAYWALL, decided 2026-10-16), in a headless Chrome:
//   node tests/test-access.js
//
// Signed out: every page can be looked through, each says how to get in, and
// anything that would do something opens the sign-in instead — Start on the
// landing page included, on "create account".
// Signed in without a subscription, once the switch is on: the planner, shop,
// friends, mail and ranking work; every other page is the subscription
// screen, marked with a lock in the menu. A trial account, an admin, and
// everyone while the switch is off, have every page.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { findChrome, serve, devtools } = require("./lib-chrome");

async function inPage(width) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !(window.SYS && SYS.__uiTest && SYS._main); i++) await sleep(100);
  const T = SYS.__uiTest, M = SYS._main;
  if (!T || !M) return ["the ?uitest hook never appeared"];
  const ui = T.ui, problems = [], phone = width < 700;
  const reset = () => { ui.modal = null; ui.settingsDraft = null; ui.eventForm = null; ui.taskForm = null; ui.assess = null; M.renderModalInto(); M.renderAssessmentInto(); };
  ui.landing = false; ui.assess = null;
  ["landing-layer", "assess-layer"].forEach((id) => { const el = document.getElementById(id); if (el) el.innerHTML = ""; });

  const go = async (page) => { reset(); ui.page = page; T.render(); await sleep(250); };
  // ---- before Firebase has answered (2026-10-16: the line showed while signed in) ----
  ui.cloudUser = null; ui.lastMe = { uid: "u-me" }; ui.authKnown = false;
  await go("overview");
  if (document.querySelector("#page .signin-wall")) problems.push("a device that remembers an account shows the sign-in line before Firebase has answered");
  if (M.needsSignIn()) problems.push("a remembered device is sent to the sign-in before Firebase has answered");
  ui.authKnown = true;

  // ---- signed out ----
  ui.cloudUser = null; ui.lastMe = null;
  await go("overview");
  if (!document.querySelector("#page .signin-wall")) problems.push("signed out, the overview does not say to sign in");
  await go("leaderboard");
  if (document.querySelector("#page .signin-wall")) problems.push("signed out, the ranking says to sign in twice");
  // Moving around still works.
  if (phone) {
    document.querySelector(".nav-menu-btn").click(); await sleep(250);
    const q = document.querySelector('.menu-grid [data-page="quests"]');
    if (q) { q.click(); await sleep(250); }
  } else {
    const q = document.querySelector('#sidebar .nav-item[data-page="quests"]');
    if (q) { q.click(); await sleep(250); }
  }
  if (ui.page !== "quests") problems.push("signed out, the menu does not move to another page (still on " + ui.page + ")");
  // Doing anything opens the sign-in.
  const tries = [
    ["quests", '[data-action="open-quest-form"]', "a new quest"],
    ["planner", '.tl-slot[data-hour="10"]', "a new event from the timeline"],
    ["planner", '[data-action="event-new"]', "a new event"],
  ];
  for (const [page, sel, what] of tries) {
    await go(page);
    const el = document.querySelector(sel);
    if (!el) { problems.push("signed out, no control for " + what + " on " + page); continue; }
    el.click(); await sleep(250);
    if (ui.modal !== "settings" || ui.eventForm || ui.taskForm) problems.push("signed out, " + what + " opened " + (ui.modal || "nothing") + " instead of the sign-in");
  }
  await go("planner");
  const before = JSON.stringify(T.getState().planner || null);
  ui.plannerDraft = "Buy milk"; M.addPlannerTodo(); await sleep(200);
  if (JSON.stringify(T.getState().planner || null) !== before) problems.push("signed out, Enter in the planner still added a to-do");
  if (ui.modal !== "settings") problems.push("signed out, Enter in the planner did not open the sign-in");
  // Start on the landing page asks for an account first.
  reset(); ui.landing = true; M.renderLandingInto(); await sleep(250);
  const start = document.querySelector('#landing-layer [data-action="landing-start"]');
  if (start) {
    start.click(); await sleep(300);
    if (ui.assess) problems.push("signed out, Start went straight into the assessment");
    if (ui.modal !== "settings" || !ui.accountForm || ui.accountForm.mode !== "signup") problems.push("signed out, Start did not open the sign-in on create-account");
  } else problems.push("the landing page has no Start");
  ui.landing = false; M.renderLandingInto(); reset();

  // ---- signed in, the switch off (today): everything ----
  ui.cloudUser = { uid: "u-me", email: "t@example.com", emailVerified: true, createdAt: Date.now() - 30 * 86400000 };
  ui.isAdmin = false;
  await go("quests");
  if (document.querySelector("#page .paywall")) problems.push("with the switch off, quests show the subscription screen");
  if (document.querySelector("#page .signin-wall")) problems.push("signed in, the page still says to sign in");

  // ---- signed in, the switch on, no subscription ----
  SYS.PAYWALL.on = true;
  try {
    for (const page of ["overview", "quests", "habits", "stats", "intelligence", "log"]) {
      await go(page);
      if (!document.querySelector("#page .paywall")) problems.push("without a subscription, " + page + " is open");
    }
    for (const page of ["planner", "shop", "friends", "mail", "leaderboard"]) {
      await go(page);
      if (document.querySelector("#page .paywall")) problems.push("without a subscription, " + page + " (free) shows the subscription screen");
    }
    await go("planner");
    const lockSel = phone ? '.menu-grid [data-page="quests"].locked' : '#sidebar .nav-item[data-page="quests"].locked';
    if (phone) { document.querySelector(".nav-menu-btn").click(); await sleep(250); }
    if (!document.querySelector(lockSel)) problems.push("the menu does not mark quests as locked");
    if (document.querySelector(phone ? '.menu-grid [data-page="planner"].locked' : '#sidebar .nav-item[data-page="planner"].locked')) problems.push("the menu marks the planner as locked");
    await go("quests");
    const back = document.querySelector('#page .paywall [data-page="planner"]');
    if (back) { back.click(); await sleep(250); }
    if (ui.page !== "planner") problems.push("the subscription screen's button does not lead to the planner");
    // A trial account and an admin have everything.
    ui.cloudUser.createdAt = Date.now() - 2 * 86400000;
    await go("quests");
    if (document.querySelector("#page .paywall")) problems.push("a two-day-old account (in its trial) sees the subscription screen");
    ui.cloudUser.createdAt = Date.now() - 30 * 86400000; ui.isAdmin = true;
    await go("quests");
    if (document.querySelector("#page .paywall")) problems.push("the admin sees the subscription screen");
    ui.isAdmin = false;
  } finally { SYS.PAYWALL.on = false; }
  return problems;
}

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log("skipped — no Chrome or Edge found (set CHROME to its path)"); return; }
  const srv = await serve();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sys-access-"));
  const { proc, ws, send } = await devtools(chrome, profile);
  const all = [];
  try {
    for (const width of [1280, 390]) {
      const { targetId } = await send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
      const s = (m, p) => send(m, p, sessionId);
      await s("Network.enable");
      await s("Network.setBlockedURLs", { urls: ["https://*", "*gstatic.com*", "*googleapis.com*", "*google.com*", "*recaptcha*"] });
      await s("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 });
      await s("Page.enable");
      await s("Page.navigate", { url: "http://127.0.0.1:" + srv.address().port + "/index.html?uitest" });
      await new Promise((r) => setTimeout(r, 2500));
      const res = await s("Runtime.evaluate", { expression: "(" + inPage.toString() + ")(" + width + ")", awaitPromise: true, returnByValue: true });
      if (res.exceptionDetails) all.push(width + "px: the check itself failed — " + (res.exceptionDetails.exception && res.exceptionDetails.exception.description || res.exceptionDetails.text));
      else all.push(...res.result.value.map((p) => width + "px: " + p));
      await send("Target.closeTarget", { targetId });
    }
  } finally {
    try { ws.close(); } catch (e) {}
    proc.kill();
    srv.close();
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }, 500);
  }
  all.forEach((p) => console.log("  FAIL  " + p));
  console.log(all.length ? all.length + " bugs" : "all passed — signed out looks but signs in to act; without a subscription only the free pages open");
  if (all.length) process.exitCode = 1;
}

main().catch((e) => { console.log("FAIL  " + (e && e.stack || e)); process.exitCode = 1; });

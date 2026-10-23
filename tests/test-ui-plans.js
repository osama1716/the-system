// The plans window and the trial banner in a headless Chrome:  node tests/test-ui-plans.js
//
// With the paywall on: a trial's last day shows the banner above the page, and
// its button opens the plans with the yearly plan chosen; choosing monthly
// moves the buy button with it; buying says payments open soon (until Paddle);
// a locked page's notice opens the same window; the end of the starting
// picture leads straight to the plans, with a way to carry on the trial. With
// the paywall off, none of it shows.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { findChrome, serve, devtools } = require("./lib-chrome");

async function inPage(cfg) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !(window.SYS && SYS.__uiTest); i++) await sleep(100);
  const T = SYS.__uiTest;
  if (!T) return ["the ?uitest hook never appeared"];
  const ui = T.ui, problems = [];
  const $ = (s) => document.querySelector(s);
  const click = (s) => { const e = $(s); if (!e) { problems.push("nothing to press: " + s); return false; } e.click(); return true; };
  ui.landing = false; ui.assess = null;
  ["landing-layer", "assess-layer"].forEach((id) => { const el = document.getElementById(id); if (el) el.innerHTML = ""; });
  const st = SYS.clone(T.getState());
  st.assessment = st.assessment || { takenAt: Date.now(), answers: {}, granted: {}, neverTried: [], skipped: true };
  T.setState(st);
  SYS.setLanguageCode(cfg.lang); document.documentElement.lang = SYS.currentLanguage(); document.documentElement.dir = SYS.currentDir();
  const account = (ageDays) => { ui.cloudUser = { uid: "u-me", email: "t@example.com", emailVerified: true, createdAt: Date.now() - ageDays * 86400000 }; ui.isAdmin = false; ui.subscribed = false; };

  // paywall off: nothing of it
  SYS.PAYWALL.on = false;
  account(6.5);
  ui.page = "overview"; ui.modal = null; T.render(); await sleep(400);
  if ($(".trial-banner")) problems.push("a trial banner with the paywall off");

  // paywall on, last day of the trial
  SYS.PAYWALL.on = true;
  T.render(); await sleep(400);
  const banner = $(".trial-banner");
  if (!banner) problems.push("no banner on the last day of a trial");
  else if (banner.textContent.indexOf(SYS.t("trial.ends1")) < 0) problems.push("the banner says: " + banner.textContent.trim());
  click('.trial-banner [data-action="open-plans"]'); await sleep(700);
  const annual = $('#modal-layer .plan-card[data-plan="annual"]'), monthly = $('#modal-layer .plan-card[data-plan="monthly"]');
  if (!annual || !monthly) return problems.concat(["the plans window did not open with both plans"]);
  if (annual.getAttribute("aria-pressed") !== "true" || monthly.getAttribute("aria-pressed") !== "false") problems.push("the yearly plan is not the one chosen first");
  if (annual.textContent.indexOf("4.17") < 0 || annual.textContent.indexOf("49.99") < 0) problems.push("the yearly plan does not show $4.17 a month and $49.99 a year: " + annual.textContent.replace(/\s+/g, " "));
  if (annual.textContent.indexOf("48") < 0) problems.push("the yearly plan does not show the saving");
  if (monthly.textContent.indexOf("7.99") < 0) problems.push("the monthly plan does not show $7.99");
  if ($('#modal-layer .plan-buy').dataset.plan !== "annual") problems.push("the buy button is not for the yearly plan");
  if ($('#modal-layer .plan-later')) problems.push("'carry on the trial' shown when the window was opened from the banner");
  click('#modal-layer .plan-card[data-plan="monthly"]'); await sleep(200);
  if ($('#modal-layer .plan-card[data-plan="monthly"]').getAttribute("aria-pressed") !== "true") problems.push("choosing monthly does not mark it");
  if ($('#modal-layer .plan-buy').dataset.plan !== "monthly") problems.push("the buy button did not follow the choice");
  click('#modal-layer .plan-buy'); await sleep(300);
  const toast = [...document.querySelectorAll("#notif-stack *")].map((e) => e.textContent).join(" ");
  if (toast.indexOf(SYS.t("plans.soon")) < 0) problems.push("buying before payments says nothing (" + toast.slice(0, 80) + ")");
  ui.modal = null; T.render(); await sleep(300);

  // two days left
  account(5.5); T.render(); await sleep(300);
  if (!$(".trial-banner") || $(".trial-banner").textContent.indexOf(SYS.t("trial.ends2")) < 0) problems.push("no two-days banner");
  // three days in: no banner yet
  account(3); T.render(); await sleep(300);
  if ($(".trial-banner")) problems.push("a banner four days before the end");

  // the trial over: the locked page's notice opens the plans
  account(9); ui.page = "quests"; T.render(); await sleep(400);
  if (!click('.paywall [data-action="open-plans"]')) problems.push("the locked page has no way to the plans");
  await sleep(600);
  if (!$('#modal-layer .plans-box')) problems.push("the notice's button did not open the plans");
  ui.modal = null; ui.page = "overview";

  // the end of the starting picture leads to the plans, with a way to carry on
  account(0.1); T.render(); await sleep(300);
  ui.assess = { i: (SYS.ASSESSMENT || []).length, answers: {}, result: null };
  const st2 = SYS.clone(T.getState()); st2.assessment = st2.assessment || { takenAt: Date.now(), answers: {}, granted: {}, neverTried: [] }; T.setState(st2);
  SYS._main.renderAssessmentInto(); await sleep(900);
  if (!click('#assess-layer [data-action="assess-enter"]')) return problems;
  await sleep(900);
  if (!$('#modal-layer .plans-box')) problems.push("the end of the starting picture did not lead to the plans");
  else if (!$('#modal-layer .plan-later')) problems.push("no way to carry on the free trial from there");
  else { click('#modal-layer .plan-later'); await sleep(600); if ($('#modal-layer .plans-box')) problems.push("'carry on the trial' did not close the window"); }

  SYS.PAYWALL.on = false;
  return problems;
}

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log("skipped — no Chrome or Edge found (set CHROME to its path)"); return; }
  const srv = await serve();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sys-plans-"));
  const { proc, ws, send } = await devtools(chrome, profile);
  const all = [];
  try {
    for (const [width, lang] of [[1280, "en"], [390, "ar"]]) {
      const { targetId } = await send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
      const s = (m, p) => send(m, p, sessionId);
      await s("Network.enable");
      await s("Network.setBlockedURLs", { urls: ["https://*", "*gstatic.com*", "*googleapis.com*", "*google.com*", "*recaptcha*"] });
      await s("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 });
      await s("Page.enable");
      await s("Page.navigate", { url: "http://127.0.0.1:" + srv.address().port + "/index.html?uitest" });
      await new Promise((r) => setTimeout(r, 2500));
      const res = await s("Runtime.evaluate", { expression: "(" + inPage.toString() + ")(" + JSON.stringify({ lang }) + ")", awaitPromise: true, returnByValue: true });
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
  console.log(all.length ? all.length + " bugs" : "all passed — the banner, the plans with yearly first, the notice's way there, and after the starting picture");
  if (all.length) process.exitCode = 1;
}

main().catch((e) => { console.log("FAIL  " + (e && e.stack || e)); process.exitCode = 1; });

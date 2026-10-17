// The phone fixes of 2026-10-16, in a headless Chrome:  node tests/test-phone-ui.js
//
//   - the time wheels move up and down only (the number in the band was drawn
//     wider than its column, so on a phone the column slid sideways too);
//   - a tap on the number in the band lets the time be typed;
//   - a tap on the planner's timeline starts the event where the tap landed
//     (to the quarter hour, or where the event before it ends), not on the hour;
//   - an event never reaches into the one that starts when it ends;
//   - while a window is open the page behind it does not scroll;
//   - the planner's now-line is white light, not the old rust;
//   - on a phone one menu button opens every page, instead of a bar of icons;
//   - the phone status bar keeps the portrait's frame inside it and spells out
//     the level's progress: LV n, the bar, x/y, LV n+1.
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
  const ui = T.ui, me = "u-me", problems = [], phone = width < 700;
  ui.landing = false; ui.assess = null;
  ["landing-layer", "assess-layer"].forEach((id) => { const el = document.getElementById(id); if (el) el.innerHTML = ""; });
  ui.cloudUser = { uid: me, email: "t@example.com", emailVerified: true };
  ui.frames = { [me]: "hud" };
  const day = SYS.todayKey();
  const st = SYS.clone(T.getState());
  st.player.level = 4; st.player.exp = 35;
  const ev = (title, from, to) => SYS.addEvent(st, { title, start: day, end: day, allDay: false, from, to, reminders: [], repeat: { type: "none" } });
  ev("Gym", "07:00", "07:20"); ev("Study", "07:20", "07:50"); ev("Call", "09:00", "09:15"); ev("Read", "09:15", "10:00");
  T.setState(st);
  ui.page = "overview"; T.render(); await sleep(300);
  const click = (el, y) => {
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: y != null ? y : r.top + r.height / 2, detail: 1 };
    el.dispatchEvent(new MouseEvent("click", o));
  };

  // ---- time wheels ----
  ui.taskForm = { reminders: [] };
  M.openTimeSheet("new"); await sleep(300);
  ui.timeDraft = { h: 9, m: 30 }; M.placeWheels(); await sleep(100);
  document.querySelectorAll(".tw-col").forEach((col) => {
    if (col.scrollWidth > col.clientWidth + 0.5) problems.push("the " + col.dataset.tw + " wheel is " + (col.scrollWidth - col.clientWidth) + "px wider than itself: it slides sideways");
    if (getComputedStyle(col).touchAction !== "pan-y") problems.push("the " + col.dataset.tw + " wheel lets a finger pan sideways (touch-action " + getComputedStyle(col).touchAction + ")");
  });
  const hours = document.querySelector('.tw-col[data-tw="h"]');
  const selH = hours && hours.querySelector(".tw-item.sel");
  if (!selH) problems.push("no hour is marked in the band");
  else {
    click(selH); await sleep(100);
    let box = document.querySelector(".tw-type");
    if (!box) problems.push("a tap on the hour in the band does not let it be typed");
    else {
      box.value = "7"; box.dispatchEvent(new Event("input", { bubbles: true })); await sleep(100);
      box = document.querySelector(".tw-type");
      if (ui.timeDraft.h !== 7) problems.push("typing 7 for the hour left the hour at " + ui.timeDraft.h);
      if (!box || document.activeElement !== box) problems.push("after the hour, the minutes are not ready to be typed");
      if (box) { box.value = "45"; box.dispatchEvent(new Event("input", { bubbles: true })); await sleep(100); }
      if (ui.timeDraft.m !== 45) problems.push("typing 45 for the minutes left them at " + ui.timeDraft.m);
      const mSel = document.querySelector('.tw-col[data-tw="m"] .tw-item.sel');
      if (!mSel || mSel.textContent.trim() !== "45") problems.push("the minutes wheel does not show the typed 45 (" + (mSel && mSel.textContent.trim()) + ")");
      if (document.querySelector(".tw-type")) problems.push("the typing field stays after two digits");
      // Typed and then left: a real value is kept, a wrong one is not.
      click(document.querySelector('.tw-col[data-tw="h"] .tw-item.sel')); await sleep(50);
      box = document.querySelector(".tw-type");
      if (box) { box.value = "1"; box.dispatchEvent(new Event("input", { bubbles: true })); box.blur(); await sleep(50); }
      if (ui.timeDraft.h !== 1) problems.push("an hour of 1 typed and left was not kept (" + ui.timeDraft.h + ")");
    }
  }
  // While the sheet is open, the page behind it holds still.
  if (!document.documentElement.classList.contains("page-locked") || getComputedStyle(document.documentElement).overflowY !== "hidden") problems.push("the page behind an open window can still scroll");
  document.querySelector('[data-action="close-time"]').click(); await sleep(60);
  // While the window is taken down nothing behind it can be pressed; once it
  // is gone, everything can.
  const mid = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
  if (!mid || !mid.closest(".sys-ghost")) problems.push("half-way through closing, a tap reaches the page behind the window");
  await sleep(480);
  if (document.querySelector(".sys-ghost")) problems.push("the closing window is still there after its exit");
  ui.modal = null; T.render(); await sleep(200);
  if (document.documentElement.classList.contains("page-locked")) problems.push("the page stays locked after the window closed");

  // ---- where a tap on the timeline starts an event ----
  const slot = (h, m) => SYS.slotTimes(T.getState(), day, h * 60 + m);
  const want = (what, got, from, to) => { if (got.from !== from || got.to !== to) problems.push(what + ": " + got.from + "–" + got.to + ", not " + from + "–" + to); };
  want("a tap just after a task that ends at 7:50", slot(7, 53), "07:50", "08:50");
  want("a tap in free time at 10:40", slot(10, 40), "10:30", "11:30");
  want("a tap at 8:50 with Call at 9:00", slot(8, 50), "08:45", "09:00");
  want("a tap right after Read ends at 10:00", slot(10, 3), "10:00", "11:00");
  ui.page = "planner"; ui.plannerView = "day"; ui.plannerDay = day; T.render(); await sleep(500);
  const tl = document.querySelector('.tl-slot[data-hour="10"]');
  if (tl) {
    const r = tl.getBoundingClientRect();
    tl.scrollIntoView({ block: "center" }); await sleep(100);
    const r2 = tl.getBoundingClientRect();
    click(tl, r2.top + r2.height * 0.8); await sleep(300);
    const f = ui.eventForm;
    if (!f || f.from !== "10:45") problems.push("a tap three quarters into 10 o'clock opened the form at " + (f && f.from) + ", not 10:45");
    ui.modal = null; ui.eventForm = null; T.render(); await sleep(200);
  } else problems.push("no 10 o'clock slot on the timeline");

  // ---- events that touch stay apart ----
  const blocks = [...document.querySelectorAll(".tl-event")].map((b) => ({ t: b.querySelector(".tl-event-title").textContent, r: b.getBoundingClientRect() }));
  const by = (n) => (blocks.find((b) => b.t === n) || {}).r;
  for (const [a, b] of [["Gym", "Study"], ["Call", "Read"]]) {
    const ra = by(a), rb = by(b);
    if (!ra || !rb) { problems.push("the planner did not draw " + a + " and " + b); continue; }
    if (ra.bottom > rb.top - 2) problems.push(a + " reaches into " + b + " (its foot at " + ra.bottom.toFixed(1) + ", " + b + " starts at " + rb.top.toFixed(1) + ")");
  }

  // ---- the now-line ----
  const now = document.querySelector(".tl-now");
  if (now) {
    const m = getComputedStyle(now).backgroundColor.match(/\d+/g).map(Number);
    if (!(m[0] > 200 && m[1] > 200 && m[2] > 200)) problems.push("the now-line is " + getComputedStyle(now).backgroundColor + ", not white light");
  } else problems.push("no now-line on today's timeline");

  // ---- navigation ----
  ui.page = "overview"; T.render(); await sleep(300);
  const btn = document.querySelector("#sidebar .nav-menu-btn");
  const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== "none" && getComputedStyle(e).visibility !== "hidden";
  if (phone) {
    if (vis(document.querySelector("#sidebar .nav-list"))) problems.push("the phone still shows the bar of page icons");
    if (!vis(btn)) problems.push("the phone has no menu button");
    else {
      btn.click(); await sleep(400);
      const items = [...document.querySelectorAll(".menu-grid .menu-item")];
      if (items.length < 9) problems.push("the menu shows " + items.length + " pages");
      if (!document.documentElement.classList.contains("page-locked")) problems.push("the page behind the menu can still scroll");
      const quests = items.find((b) => b.dataset.page === "quests");
      if (quests) { quests.click(); await sleep(400); }
      if (ui.page !== "quests" || ui.modal) problems.push("choosing Quests in the menu left page " + ui.page + ", window " + ui.modal);
      ui.page = "overview"; T.render(); await sleep(200);
    }
  } else if (vis(btn)) problems.push("the menu button shows on a wide screen");

  // ---- phone status bar ----
  if (phone) {
    const bar = document.getElementById("statusbar").getBoundingClientRect();
    const frame = document.querySelector("#statusbar canvas.av-frame");
    const exp = document.querySelector("#statusbar .status-exp");
    if (frame) {
      const f = frame.getBoundingClientRect();
      if (f.bottom > bar.bottom + 0.5) problems.push("the portrait's frame runs " + (f.bottom - bar.bottom).toFixed(1) + "px past the bottom of the status bar");
      if (exp) {
        const e = exp.getBoundingClientRect();
        const overlap = Math.min(f.right, e.right) - Math.max(f.left, e.left);
        if (overlap > 0 && Math.min(f.bottom, e.bottom) - Math.max(f.top, e.top) > 0) problems.push("the portrait's frame lies over the level's progress row");
      }
    } else problems.push("no frame drawn in the phone status bar");
    const track = exp && exp.querySelector(".exp-track");
    if (!track || track.getBoundingClientRect().width < 100) problems.push("the level's progress bar is not shown as a bar of its own on the phone");
    const next = exp && exp.querySelector(".status-exp-next");
    if (!vis(next) || !/5/.test(next.textContent)) problems.push("the phone status bar does not say which level the bar leads to");
    const label = exp && exp.querySelector(".status-exp-label");
    if (!vis(label) || label.textContent.trim() !== "35/100") problems.push("the phone status bar does not show 35/100");
  }
  return problems;
}

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log("skipped — no Chrome or Edge found (set CHROME to its path)"); return; }
  const srv = await serve();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sys-phone-ui-"));
  const { proc, ws, send } = await devtools(chrome, profile);
  const all = [];
  try {
    for (const [width, lang] of [[390, "en"], [390, "ar"], [1280, "en"]]) {
      const { targetId } = await send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
      const s = (m, p) => send(m, p, sessionId);
      await s("Network.enable");
      await s("Network.setBlockedURLs", { urls: ["https://*", "*gstatic.com*", "*googleapis.com*", "*google.com*", "*recaptcha*"] });
      await s("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: width < 700 });
      await s("Page.enable");
      await s("Page.navigate", { url: "http://127.0.0.1:" + srv.address().port + "/index.html?uitest" });
      await new Promise((r) => setTimeout(r, 2500));
      if (lang === "ar") await s("Runtime.evaluate", { expression: "SYS.setLanguageCode('ar'); document.documentElement.dir = 'rtl'; 1" });
      const res = await s("Runtime.evaluate", { expression: "(" + inPage.toString() + ")(" + width + ")", awaitPromise: true, returnByValue: true });
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
  console.log(all.length ? all.length + " bugs" : "all passed — wheels, typed times, timeline taps, gaps, locked page, now-line, menu, phone status bar");
  if (all.length) process.exitCode = 1;
}

main().catch((e) => { console.log("FAIL  " + (e && e.stack || e)); process.exitCode = 1; });

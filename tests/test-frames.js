// A worn frame sits on its portrait, everywhere, in a headless Chrome:
//   node tests/test-frames.js
//
// The frame is drawn from the box it is centred on and is 182% of it, its
// opening about 55%. The portrait must fill that same box: on 2026-10-15 the
// ranking table's box grew to 32px while the photo kept 22px in the corner,
// and every frame there sat up and to the left of its face.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { findChrome, serve, devtools } = require("./lib-chrome");

async function inPage(width) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !(window.SYS && SYS.__uiTest); i++) await sleep(100);
  const T = SYS.__uiTest;
  if (!T) return ["the ?uitest hook never appeared"];
  const ui = T.ui, me = "u-me", problems = [];
  ui.landing = false; ui.assess = null;
  ["landing-layer", "assess-layer"].forEach((id) => { const el = document.getElementById(id); if (el) el.innerHTML = ""; });
  ui.cloudUser = { uid: me, email: "t@example.com", emailVerified: true };
  const names = ["Me", "Kenji", "Noor", "Lea", "Zhang Wei"];
  ui.leaderboard = names.map((n, i) => ({ uid: i ? "u-" + i : me, displayName: n, totalExp: 9000 - i * 900, weekExp: 900 - i * 90, seasonExp: 4000 - i * 400, lastRank: i, cats: {} }));
  ui.leaderboardMine = ui.leaderboard[0]; ui.leaderboardError = null; ui.leaderboardBusy = false;
  ui.friendships = [{ users: [me, "u-1"], status: "accepted", from: me, to: "u-1" }, { users: [me, "u-2"], status: "accepted", from: me, to: "u-2" }];
  ui.friendRows = Object.fromEntries(ui.leaderboard.map((r) => [r.uid, r]));
  const ids = Object.keys(SYS.SHOP.framePrices);
  ui.frames = {};
  ui.leaderboard.forEach((r, i) => { ui.frames[r.uid] = ids[i % ids.length]; });

  const check = (where) => {
    const frames = [...document.querySelectorAll(".av-frame")].filter((c) => c.getClientRects().length);
    frames.forEach((c, i) => {
      const av = c.parentElement.querySelector(".av");
      if (!av) { problems.push(where + ": a frame with no portrait under it"); return; }
      const f = c.getBoundingClientRect(), a = av.getBoundingClientRect();
      const dx = (f.left + f.width / 2) - (a.left + a.width / 2), dy = (f.top + f.height / 2) - (a.top + a.height / 2);
      const fill = a.width / f.width;
      if (Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5 || fill < 0.5 || fill > 0.6) {
        problems.push(where + " @" + width + "px: frame " + (i + 1) + " is off its portrait (moved " + dx.toFixed(1) + "," + dy.toFixed(1) + "px, portrait " + Math.round(fill * 100) + "% of the frame, not ~55%)");
      }
    });
    return frames.length;
  };
  const screens = [
    ["ranking", () => { ui.page = "leaderboard"; ui.lbTab = "world"; }],
    ["ranking, friends", () => { ui.page = "leaderboard"; ui.lbTab = "friends"; }],
    ["friends page", () => { ui.page = "friends"; }],
  ];
  for (const [where, go] of screens) {
    ui.modal = null; go(); T.render(); await sleep(500);
    const n = check(where);
    if (where === "ranking" && n < 3) problems.push("ranking @" + width + "px: only " + n + " frames drawn — the check saw nothing");
  }
  return problems;
}

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log("skipped — no Chrome or Edge found (set CHROME to its path)"); return; }
  const srv = await serve();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sys-frames-"));
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
  console.log(all.length ? all.length + " bugs" : "all passed — every worn frame sits on its portrait");
  if (all.length) process.exitCode = 1;
}

main().catch((e) => { console.log("FAIL  " + (e && e.stack || e)); process.exitCode = 1; });

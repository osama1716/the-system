// The app as an installed one, in a headless Chrome:  node tests/test-offline.js
//
// Opened once online, the service worker takes every picture, sound and font
// down (assets.json). Then the server is shut and the app is opened again, with
// "?" in the address as an ad link would have it, and every page is drawn:
// nothing may fail, no picture may come up empty, and the text must be in the
// app's own typeface. Held since 2026-10-15, when an address with "?" in it
// opened to the browser's offline error and the fonts still came from Google.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { findChrome, serve, devtools, ROOT } = require("./lib-chrome");

const PAGES = ["overview", "quests", "habits", "planner", "stats", "leaderboard", "friends", "intelligence", "mail", "log", "shop", "settings"];

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log("skipped — no Chrome or Edge found (set CHROME to its path)"); return; }
  const srv = await serve();
  const port = srv.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sys-offline-"));
  const { proc, ws, send } = await devtools(chrome, profile);
  const problems = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const s = (m, p) => send(m, p, sessionId);
    const urls = new Map(), failed = [];
    ws.addEventListener("message", (m) => {
      const d = JSON.parse(m.data);
      if (d.sessionId !== sessionId) return;
      if (d.method === "Network.requestWillBeSent") urls.set(d.params.requestId, d.params.request.url);
      if (d.method === "Network.loadingFailed" && !d.params.canceled && !d.params.blockedReason) {
        const u = urls.get(d.params.requestId) || "";
        if (u.startsWith("http://127.0.0.1:" + port)) failed.push(u.split("/").slice(3).join("/") + " (" + d.params.errorText + ")");
      }
    });
    await s("Network.enable");
    await s("Network.setBlockedURLs", { urls: ["https://*", "*gstatic.com*", "*googleapis.com*", "*google.com*", "*recaptcha*"] });
    await s("Page.enable");
    await s("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    const ev = async (expr) => {
      const r = await s("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
      return r.result.value;
    };
    await s("Page.navigate", { url: "http://127.0.0.1:" + port + "/index.html?uitest" });

    // Online: wait for the whole list to be on the phone.
    const want = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, "assets.json"), "utf8")));
    let held = [];
    for (let i = 0; i < 80 && held.length < want.length; i++) {
      await sleep(500);
      held = await ev("caches.open('the-system-assets').then((c) => c.keys()).then((k) => k.map((r) => new URL(r.url).pathname.slice(1)).filter((p) => !p.includes('__assets-held')))").catch(() => []);
    }
    const missing = want.filter((rel) => !held.includes(rel));
    if (missing.length) problems.push("never stored on the phone: " + missing.slice(0, 8).join(", ") + (missing.length > 8 ? " …" : ""));
    if (!want.some((rel) => rel.endsWith(".woff2"))) problems.push("assets.json lists no fonts");

    // Offline from here on.
    srv.closeAllConnections();
    srv.close();
    failed.length = 0;
    await s("Page.navigate", { url: "http://127.0.0.1:" + port + "/index.html?uitest&utm_source=ad" });
    let up = false;
    for (let i = 0; i < 40 && !up; i++) { await sleep(150); up = await ev("!!(window.SYS && SYS.__uiTest)").catch(() => false); }
    if (!up) problems.push("offline, the app did not open from an address with \"?\" in it");
    else {
      await ev("(() => { const T = SYS.__uiTest; T.ui.landing = false; T.ui.assess = null; ['landing-layer', 'assess-layer'].forEach((id) => { const el = document.getElementById(id); if (el) el.innerHTML = ''; }); return 1; })()");
      for (const page of PAGES) {
        await ev("(() => { const T = SYS.__uiTest; T.ui.modal = null; T.ui.page = '" + page + "'; T.render(); return 1; })()");
        await sleep(400);
        const empty = await ev("[...document.images].filter((i) => i.currentSrc && i.complete && !i.naturalWidth).map((i) => i.currentSrc.split('/').slice(3).join('/'))");
        if (empty.length) problems.push(page + ": pictures that came up empty offline: " + empty.join(", "));
      }
      const fonts = await ev("document.fonts.ready.then(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/\"/g, '')))");
      if (!fonts.includes("Outfit")) problems.push("offline, the text is not in Outfit (fonts loaded: " + (fonts.join(", ") || "none") + ")");
      const sounds = await ev("Promise.all(['rain', 'cafe'].map((n) => fetch('assets/sounds/' + n + '.mp3').then((r) => r.ok).catch(() => false)))");
      if (sounds.includes(false)) problems.push("offline, a sound did not play from the phone");
      const kept = await ev("(SYS._artKept || []).filter((i) => i.complete && !i.naturalWidth).map((i) => i.src.split('/').slice(3).join('/'))");
      if (kept.length) problems.push("art held ready for a tap is missing: " + kept.join(", "));
    }
    [...new Set(failed)].forEach((f) => problems.push("failed offline: " + f));
  } finally {
    try { ws.close(); } catch (e) {}
    proc.kill();
    try { srv.close(); } catch (e) {}
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }, 500);
  }
  problems.forEach((p) => console.log("  FAIL  " + p));
  console.log(problems.length ? problems.length + " bugs" : "all passed — every page opens offline, with its pictures, sounds and fonts");
  if (problems.length) process.exitCode = 1;
}

main().catch((e) => { console.log("FAIL  " + (e && e.stack || e)); process.exitCode = 1; });

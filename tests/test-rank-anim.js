// A rank emblem whose flames move (SYS.RANK_ANIM), in a headless Chrome:
//   node tests/test-rank-anim.js
//
// The moving emblem is drawn over the still one from where the still sits in
// its video, so wherever an emblem appears — status bar, ranks window,
// ranking, profile — it must take the still's place to the pixel, and move.
// A rank without a moving emblem stays the plain picture, and so does every
// rank for someone who asks for reduced motion.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { findChrome, serve, devtools } = require("./lib-chrome");

async function inPage(reduced) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !(window.SYS && SYS.__uiTest); i++) await sleep(100);
  const T = SYS.__uiTest;
  if (!T) return ["the ?uitest hook never appeared"];
  const ui = T.ui, me = "u-me", problems = [];
  ui.landing = false; ui.assess = null;
  ["landing-layer", "assess-layer"].forEach((id) => { const el = document.getElementById(id); if (el) el.innerHTML = ""; });
  ui.cloudUser = { uid: me, email: "t@example.com", emailVerified: true, createdAt: Date.now() };
  const animated = Object.keys(SYS.RANK_ANIM || {});
  if (!animated.length) return ["no rank has a moving emblem"];
  // Every rank that has a moving emblem, one after another, in every place.
  for (const R of animated) {
    let exp = 100;
    while (SYS.expToStanding(exp).rank !== R && exp < 1e9) exp = Math.ceil(exp * 1.15);
    const st = SYS.clone(T.getState()); st.player.rank = R; T.setState(st);
    ui.leaderboard = [{ uid: me, displayName: "Me", totalExp: exp, weekExp: 10, seasonExp: 10, lastRank: 0, cats: {} },
      { uid: "u-2", displayName: "Low", totalExp: 10, weekExp: 1, seasonExp: 1, lastRank: 1, cats: {} }];
    ui.leaderboardMine = ui.leaderboard[0]; ui.leaderboardError = null; ui.leaderboardBusy = false;

    const check = (where) => {
      const spans = [...document.querySelectorAll(".rank-anim")].filter((s) => s.getClientRects().length);
      if (reduced) { if (spans.length) problems.push(where + ": a moving emblem with reduced motion asked for"); return spans.length; }
      spans.forEach((s) => {
        const c = s.querySelector("canvas.rank-anim-art"), im = s.querySelector("img.rank-anim-still");
        if (!c || !im) { problems.push(where + ": a moving emblem without its canvas or its still"); return; }
        // the ranks window shows the whole ladder: each emblem is held to its own box
        const drawn = (c.dataset.frame || "").replace("rank-", "");
        if (!SYS.RANK_ANIM[drawn]) { problems.push(where + ": a moving emblem for " + drawn + ", which has none"); return; }
        const [x0, y0, x1, y1] = SYS.RANK_ANIM[drawn].box;
        const cr = c.getBoundingClientRect(), ir = im.getBoundingClientRect();
        const want = { left: cr.left + x0 * cr.width, top: cr.top + y0 * cr.height, right: cr.left + x1 * cr.width, bottom: cr.top + y1 * cr.height };
        const off = Math.max(Math.abs(want.left - ir.left), Math.abs(want.top - ir.top), Math.abs(want.right - ir.right), Math.abs(want.bottom - ir.bottom));
        if (off > 1.2) problems.push(where + ": the moving " + drawn + " emblem is " + off.toFixed(1) + "px off the still's place (" + Math.round(ir.height) + "px tall)");
        if (Math.abs(cr.width - cr.height) > 1) problems.push(where + ": the moving emblem is not square");
      });
      return spans.length;
    };
    const places = [
      ["status bar", () => { ui.modal = null; ui.page = "overview"; }],
      ["ranks window", () => { ui.modal = "ranks"; }],
      ["ranking", () => { ui.modal = null; ui.page = "leaderboard"; ui.lbTab = "world"; }],
      ["profile", () => {
        ui.page = "overview"; ui.modal = "profile"; ui.profileUid = me; ui.profileEdit = null;
        ui.profile = { profile: { avatar: "a03", bio: "", worn: {} }, row: ui.leaderboard[0] };
      }],
    ];
    for (const [where, go] of places) {
      go(); T.render(); await sleep(700);
      const n = check(where);
      if (!reduced && !n) problems.push(where + ": no moving " + R + " emblem drawn");
    }
    if (!reduced) {
      // It moves: two looks at the status bar's emblem a moment apart differ.
      ui.modal = null; ui.page = "overview"; T.render(); await sleep(1500);
      const c = document.querySelector("#statusbar canvas.rank-anim-art");
      const grab = () => { const g = c.getContext("2d"); return Array.from(g.getImageData(0, 0, c.width, c.height).data.filter((v, i) => i % 97 === 0)); };
      if (!c || c.width < 64) problems.push("the status bar's moving " + R + " emblem was never drawn (" + (c ? c.width : "no canvas") + ")");
      else {
        const a = grab(); await sleep(600); const b = grab();
        if (a.every((v, i) => v === b[i])) problems.push("the status bar's " + R + " emblem does not move");
      }
    }
  }
  if (!reduced) {
    // Each box is true to the pictures: the still emblem, drawn into the video's square at
    // its box, lines up with the video's own first frame (<rank>-anim-still.webp) to within a
    // pixel at 512. The checks above only hold the drawing to the box; this holds the box to
    // the art, where a wrong number would show as the emblem jumping when the video starts.
    const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error(src)); i.src = src; });
    const N = 512;
    const alphaOf = (draw) => {
      const cv = document.createElement("canvas"); cv.width = cv.height = N;
      const g = cv.getContext("2d"); draw(g);
      const d = g.getImageData(0, 0, N, N).data, a = new Float32Array(N * N);
      for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] / 255;
      return a;
    };
    for (const R of animated) {
      const [x0, y0, x1, y1] = SYS.RANK_ANIM[R].box;
      const [video, still] = await Promise.all([load("assets/ranks/" + R + "-anim-still.webp"), load("assets/ranks/" + R + "-512.webp")]);
      const V = alphaOf((g) => g.drawImage(video, 0, 0, N, N));
      const S = alphaOf((g) => g.drawImage(still, x0 * N, y0 * N, (x1 - x0) * N, (y1 - y0) * N));
      let best = null;
      for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
        let e = 0;
        for (let y = 16; y < N - 16; y += 2) for (let x = 16; x < N - 16; x += 2) {
          const s = S[y * N + x];
          if (s > 0.9) e += 1 - V[(y + dy) * N + (x + dx)];   // the still's solid parts, solid in the video too
        }
        if (!best || e < best.e) best = { e, dx, dy };
      }
      if (Math.abs(best.dx) > 1 || Math.abs(best.dy) > 1) {
        problems.push(R + "'s box is off the art: the still lines up with the video " + best.dx + "," + best.dy + " px away (at 512)");
      }
    }
    // Another rank stays a plain picture.
    const st2 = SYS.clone(T.getState()); st2.player.rank = "F"; T.setState(st2); T.render(); await sleep(200);
    if (document.querySelector("#statusbar .rank-anim") || !document.querySelector("#statusbar img.rank-art")) problems.push("rank F is drawn as a moving emblem");
  }
  return problems;
}

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log("skipped — no Chrome or Edge found (set CHROME to its path)"); return; }
  const srv = await serve();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sys-rank-anim-"));
  const { proc, ws, send } = await devtools(chrome, profile);
  const all = [];
  try {
    for (const [width, reduced] of [[1280, false], [390, false], [390, true]]) {
      const { targetId } = await send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
      const s = (m, p) => send(m, p, sessionId);
      await s("Network.enable");
      await s("Network.setBlockedURLs", { urls: ["https://*", "*gstatic.com*", "*googleapis.com*", "*google.com*", "*recaptcha*"] });
      await s("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 2, mobile: width < 700 });
      if (reduced) await s("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
      await s("Page.enable");
      await s("Page.navigate", { url: "http://127.0.0.1:" + srv.address().port + "/index.html?uitest" });
      await new Promise((r) => setTimeout(r, 2500));
      const res = await s("Runtime.evaluate", { expression: "(" + inPage.toString() + ")(" + reduced + ")", awaitPromise: true, returnByValue: true });
      const tag = width + "px" + (reduced ? ", reduced motion" : "");
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
  console.log(all.length ? all.length + " bugs" : "all passed — the moving emblem takes the still's place everywhere, and moves");
  if (all.length) process.exitCode = 1;
}

main().catch((e) => { console.log("FAIL  " + (e && e.stack || e)); process.exitCode = 1; });

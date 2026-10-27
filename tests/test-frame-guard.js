// No other site may show the app inside a frame of its own (clickjacking), in
// a headless Chrome:  node tests/test-frame-guard.js
//
// GitHub Pages sends no header that forbids framing, so the inline script at
// the top of index.html hides a page framed from another origin. A second
// local server on another port is "another site". The app on its own, and in
// a frame of its own site, must still show.
"use strict";
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { findChrome, serve, devtools } = require("./lib-chrome");

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log("skipped — no Chrome or Edge found (set CHROME to its path)"); return; }
  const app = await serve();
  const appUrl = "http://127.0.0.1:" + app.address().port + "/index.html";
  // "/" frames the app from the first server: another origin. "/same" frames
  // this server's own copy of the app, which it passes through from the first.
  const frame = (src) => '<!DOCTYPE html><title>a page with a frame</title><iframe src="' + src + '" width="800" height="600"></iframe>';
  const other = http.createServer((req, res) => {
    if (req.url === "/" || req.url === "/same") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(frame(req.url === "/" ? appUrl : "/index.html"));
      return;
    }
    http.get("http://127.0.0.1:" + app.address().port + req.url, (up) => { res.writeHead(up.statusCode, up.headers); up.pipe(res); })
      .on("error", () => { res.writeHead(502); res.end(); });
  });
  await new Promise((r) => other.listen(0, "127.0.0.1", r));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sys-frame-guard-"));
  const { proc, ws, send } = await devtools(chrome, profile);
  const problems = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const s = (m, p) => send(m, p, sessionId);
    await s("Network.enable");
    await s("Network.setBlockedURLs", { urls: ["https://*", "*gstatic.com*", "*googleapis.com*", "*google.com*", "*recaptcha*"] });
    await s("Page.enable");
    const shown = "getComputedStyle(document.documentElement).display !== 'none'";

    await s("Page.navigate", { url: appUrl });
    await sleep(2000);
    let r = await s("Runtime.evaluate", { expression: shown, returnByValue: true });
    if (r.result.value !== true) problems.push("the app on its own is hidden");

    // In a frame: the app's own page cannot make one (its frame-src), so a
    // plain page of each origin does.
    const framed = async (page, wantUrl) => {
      await s("Page.navigate", { url: "http://127.0.0.1:" + other.address().port + page });
      await sleep(2500);
      const tree = await s("Page.getFrameTree");
      const child = (tree.frameTree.childFrames || [])[0];
      if (!child || child.frame.url !== wantUrl) return "never loaded";
      const { executionContextId } = await s("Page.createIsolatedWorld", { frameId: child.frame.id });
      const res = await s("Runtime.evaluate", { expression: shown, contextId: executionContextId, returnByValue: true });
      return res.result.value ? "shown" : "hidden";
    };
    const same = await framed("/same", "http://127.0.0.1:" + other.address().port + "/index.html");
    if (same !== "shown") problems.push("the app in a frame of its own site: " + same);
    const cross = await framed("/", appUrl);
    if (cross !== "hidden") problems.push("the app in another site's frame: " + cross);
    await send("Target.closeTarget", { targetId });
  } finally {
    try { ws.close(); } catch (e) {}
    proc.kill();
    app.close();
    other.close();
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }, 500);
  }
  problems.forEach((p) => console.log("  FAIL  " + p));
  console.log(problems.length ? problems.length + " bugs" : "all passed — another site's frame shows nothing; the app alone and in its own frame shows");
  if (problems.length) process.exitCode = 1;
}

main().catch((e) => { console.log("FAIL  " + (e && e.stack || e)); process.exitCode = 1; });

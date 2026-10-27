// A new account's password is 8 characters or more, in a headless Chrome:
//   node tests/test-password-min.js
//
// Firebase alone takes 6. The form refuses a shorter one before anything is
// sent, says so in the app's language, and still lets an older account sign
// in with the shorter password it already has.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { findChrome, serve, devtools } = require("./lib-chrome");

async function inPage() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !(window.SYS && SYS.__uiTest); i++) await sleep(100);
  const T = SYS.__uiTest;
  if (!T) return ["the ?uitest hook never appeared"];
  const ui = T.ui, problems = [];
  ui.landing = false; ui.assess = null; ui.cloudUser = null;
  const sent = [];
  SYS.Cloud = SYS.Cloud || {};
  SYS.Cloud.available = () => true; // Firebase itself is blocked here
  SYS.Cloud.signUp = (email, password) => { sent.push(["up", password]); return Promise.resolve(); };
  SYS.Cloud.signIn = (email, password) => { sent.push(["in", password]); return Promise.resolve(); };
  const click = (action, mode) => {
    let el = document.querySelector('[data-action="' + action + '"]' + (mode ? '[data-mode="' + mode + '"]' : ""));
    if (!el) { el = document.createElement("button"); el.dataset.action = action; document.body.appendChild(el); }
    el.click();
  };
  const type = (bind, value) => {
    const el = document.querySelector('[data-bind="' + bind + '"]');
    if (!el) return false;
    el.value = value; el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  };
  const error = () => { const e = document.querySelector(".toast-error"); return e ? e.textContent : ""; };

  click("open-settings"); await sleep(400);
  click("set-account-mode", "signup"); await sleep(200);
  if (!type("accountForm.email", "new@example.test") || !type("accountForm.password", "abc123")) return ["the sign-up form never showed"];
  click("account-submit"); await sleep(300);
  if (sent.length) problems.push("a 6-character password was sent to create an account");
  if (!/8/.test(error())) problems.push("no error naming 8 characters (saw: " + JSON.stringify(error()) + ")");

  type("accountForm.password", "abcd1234");
  click("account-submit"); await sleep(300);
  if (!(sent.length === 1 && sent[0][0] === "up" && sent[0][1] === "abcd1234")) problems.push("an 8-character password did not go through: " + JSON.stringify(sent));

  click("open-settings"); await sleep(300);
  click("set-account-mode", "signin"); await sleep(200);
  type("accountForm.email", "old@example.test"); type("accountForm.password", "abc123");
  click("account-submit"); await sleep(300);
  if (!sent.some((s) => s[0] === "in" && s[1] === "abc123")) problems.push("an older account could not sign in with its 6-character password");
  return problems;
}

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log("skipped — no Chrome or Edge found (set CHROME to its path)"); return; }
  const srv = await serve();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sys-password-"));
  const { proc, ws, send } = await devtools(chrome, profile);
  let problems = [];
  try {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const s = (m, p) => send(m, p, sessionId);
    await s("Network.enable");
    await s("Network.setBlockedURLs", { urls: ["https://*", "*gstatic.com*", "*googleapis.com*", "*google.com*", "*recaptcha*"] });
    await s("Page.enable");
    await s("Page.navigate", { url: "http://127.0.0.1:" + srv.address().port + "/index.html?uitest" });
    await new Promise((r) => setTimeout(r, 2500));
    const res = await s("Runtime.evaluate", { expression: "(" + inPage.toString() + ")()", awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) problems.push("the check itself failed — " + (res.exceptionDetails.exception && res.exceptionDetails.exception.description || res.exceptionDetails.text));
    else problems = problems.concat(res.result.value);
    await send("Target.closeTarget", { targetId });
  } finally {
    try { ws.close(); } catch (e) {}
    proc.kill();
    srv.close();
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }, 500);
  }
  problems.forEach((p) => console.log("  FAIL  " + p));
  console.log(problems.length ? problems.length + " bugs" : "all passed — under 8 refused before sending, 8 goes through, an older account still signs in");
  if (problems.length) process.exitCode = 1;
}

main().catch((e) => { console.log("FAIL  " + (e && e.stack || e)); process.exitCode = 1; });

// Which Firebase project the page talks to is decided by where it is served
// from:  node tests/test-backend-choice.js
// The live site, any other host and this machine by default must stay on the
// live project; only the staging site, or this machine asked with
// ?backend=staging, may use the staging one — and staging has no App Check.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const LIVE = "the-system-44ff7", STAGING = "the-system-staging-efdc1";
const src = (f) => fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8");
let bad = 0;
const fail = (m) => { bad++; console.log("  FAIL  " + m); };

function load(hostname, search) {
  const sandbox = { window: {}, location: { hostname, search } };
  sandbox.self = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(src("firebase-config.js"), sandbox);
  vm.runInContext(src("appcheck-config.js"), sandbox);
  return sandbox.window;
}

const cases = [
  ["osama1716.github.io", "", LIVE, false],
  ["osama1716.github.io", "?backend=staging", LIVE, false],
  ["thesystemhq.com", "", LIVE, false],
  ["the-system-44ff7.web.app", "", LIVE, false],
  ["localhost", "", LIVE, false],
  ["127.0.0.1", "?uitest", LIVE, false],
  ["localhost", "?backend=staging", STAGING, true],
  ["127.0.0.1", "?x=1&backend=staging", STAGING, true],
  ["the-system-staging-efdc1.web.app", "", STAGING, true],
  ["the-system-staging-efdc1.firebaseapp.com", "", STAGING, true],
  ["evil-the-system-staging-efdc1.web.app", "", LIVE, false],
];
for (const [host, search, project, staging] of cases) {
  const w = load(host, search);
  const label = host + search;
  if (w.FIREBASE_CONFIG.projectId !== project) fail(label + " uses " + w.FIREBASE_CONFIG.projectId + ", expected " + project);
  if (!!w.FIREBASE_STAGING !== staging) fail(label + " staging flag is " + !!w.FIREBASE_STAGING);
  if (staging && w.FIREBASE_APPCHECK_SITE_KEY) fail(label + " (staging) has an App Check key");
  if (!staging && !w.FIREBASE_APPCHECK_SITE_KEY) fail(label + " (live) lost its App Check key");
  if (staging && w.FIREBASE_CONFIG.authDomain.indexOf("staging") < 0) fail(label + " staging authDomain does not name staging");
}
console.log(bad ? bad + " bugs" : "all passed — " + cases.length + " hosts");
if (bad) process.exitCode = 1;

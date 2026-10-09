// The site serves app.min.js and app.min.css, built from js/ and styles.css
// by scripts/build.js. A change to a source that is pushed without building
// would never reach anyone — this fails until the built files match.
//   node tests/test-build-fresh.js
"use strict";
const { spawnSync } = require("child_process");
const path = require("path");

const r = spawnSync(process.execPath, [path.join(__dirname, "..", "scripts", "build.js"), "--check"], { encoding: "utf8" });
const said = ((r.stdout || "") + (r.stderr || "")).trim();
if (r.status === 0) console.log("all passed — the built files match their sources");
else if (r.status === 2) { console.log("FAIL  " + said); process.exitCode = 1; }
else { console.log("FAIL  " + said + " — run: node scripts/build.js"); process.exitCode = 1; }

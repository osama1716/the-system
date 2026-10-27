// The site serves app.min.js and app.min.css, built from js/ and css/
// by scripts/build.js. A change to a source that is pushed without building
// would never reach anyone — this fails until the built files match.
//   node tests/test-build-fresh.js
"use strict";
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "build.js"), "--check"], { encoding: "utf8" });
const said = ((r.stdout || "") + (r.stderr || "")).trim();

// The source maps stay on this machine (scripts/build.js, 2026-10-27): served,
// they handed every visitor the readable source with its comments.
const hosting = JSON.parse(fs.readFileSync(path.join(ROOT, "firebase.json"), "utf8")).hosting;
const ignored = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8").split(/\r?\n/);
const mapLeaks = [
  ...["app.min.js", "app.min.css"].filter((f) => /sourceMappingURL/.test(fs.readFileSync(path.join(ROOT, f), "utf8"))).map((f) => f + " names a map"),
  ...["app.min.js.map", "app.min.css.map"].filter((f) => fs.existsSync(path.join(ROOT, f))).map((f) => f + " sits beside the site"),
  ...(ignored.includes("maps/") && ignored.includes("*.map") ? [] : [".gitignore lets maps into git"]),
  ...(hosting.ignore.includes("**/*.map") ? [] : ["firebase.json would deploy maps"]),
];

if (mapLeaks.length) { console.log("FAIL  source maps would be served: " + mapLeaks.join("; ")); process.exitCode = 1; }
else if (r.status === 0) console.log("all passed — the built files match their sources, and no source map is served");
else if (r.status === 2) { console.log("FAIL  " + said); process.exitCode = 1; }
else { console.log("FAIL  " + said + " — run: node scripts/build.js"); process.exitCode = 1; }

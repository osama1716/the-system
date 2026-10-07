// The service worker must parse. A syntax error there fails its install
// silently, and every device keeps running the previous version.
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const REPO = path.resolve(__dirname, "..");

let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };

for (const f of ["sw.js", "js/sw-register.js", "js/frame-player.js"]) {
  const r = spawnSync(process.execPath, ["--check", path.join(REPO, f)], { encoding: "utf8" });
  check(f + " parses", r.status === 0, (r.stderr || "").split("\n").slice(0, 3).join(" "));
}
const sw = fs.readFileSync(path.join(REPO, "sw.js"), "utf8");
const listed = (sw.match(/"\.\/[^"]+"/g) || []).map((s) => s.slice(3, -1));
const missing = listed.filter((p) => !fs.existsSync(path.join(REPO, p)));
check("every file the service worker names exists", missing.length === 0, missing.join(", "));

console.log("");
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);

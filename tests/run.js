// Runs every test and audit in this folder:  node tests/run.js
//
// Each file is its own Node process with no dependencies — the client files
// are loaded into a vm sandbox, the functions files are required directly —
// so nothing needs installing. A file fails if it exits non-zero or its last
// line reports a failure; the runner exits non-zero if any file failed.
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const here = __dirname;
const files = fs.readdirSync(here)
  .filter((f) => /^test-.*\.js$/.test(f))
  .sort()
  .map((f) => path.join(here, f))
  .concat(["static.js", "invariants.js", "a11y.js"].map((f) => path.join(here, "audit", f)));

const failed = [];
for (const file of files) {
  const r = spawnSync(process.execPath, [file], { encoding: "utf8" });
  const out = ((r.stdout || "") + (r.stderr || "")).trim().split(/\r?\n/);
  const last = out[out.length - 1] || "";
  const reportsFailure = /FAIL|[1-9]\d* bugs?\b|^[1-9]\d* with neither/.test(last) ||
    out.some((l) => /^[1-9]\d* with neither aria-label/.test(l));
  const ok = r.status === 0 && !reportsFailure;
  console.log((ok ? "ok    " : "FAIL  ") + path.relative(here, file).split(path.sep).join("/") + "  — " + last);
  if (!ok) {
    failed.push(file);
    out.filter((l) => /FAIL|bug/.test(l)).slice(0, 10).forEach((l) => console.log("        " + l.trim()));
  }
}
console.log(failed.length ? failed.length + " file(s) failed" : "all passed");
process.exit(failed.length ? 1 : 0);

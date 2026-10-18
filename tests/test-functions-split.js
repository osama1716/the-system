// The Cloud Functions after functions/index.js was split (2026-10-18) into
// api/ (the deployed functions, one file per area) and server/ (what they
// share). A missing import there is not a load error: it is a ReferenceError
// the first time that one function runs, which for an admin backfill could be
// months later. So this reads every file and holds them to the rules:
//
//  - every api/ file is gathered by index.js, and what each exports is a
//    function index.js deploys under the same name;
//  - server/ files deploy nothing, and no file reaches into an api/ file;
//  - a name a file uses that another functions file declares is declared or
//    imported in that file too;
//  - every callable comes from server/base.js, the wrapper that demands App
//    Check — nothing takes onCall from firebase-functions itself.
"use strict";
const fs = require("fs");
const path = require("path");
const { names } = require("./lib-js-names");

const F = path.join(__dirname, "..", "functions");
let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };

const FILES = require("./functions-files").map((f) => f.slice("functions/".length));
const src = Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(F, f), "utf8").replace(/\r\n/g, "\n")]));
const api = FILES.filter((f) => f.startsWith("api/"));
const server = FILES.filter((f) => f.startsWith("server/"));

console.log("");
console.log("gathered");
{
  const areas = (src["index.js"].match(/const AREAS = \[([^\]]*)\]/) || [])[1] || "";
  const listed = [...areas.matchAll(/"([\w-]+)"/g)].map((m) => "api/" + m[1] + ".js").sort();
  check("index.js lists every file in api/, and only those", listed.join() === api.slice().sort().join(),
    "listed " + listed.join(", ") + " / on disk " + api.join(", "));
  check("index.js defines no function of its own", !/^exports\.\w+ = /m.test(src["index.js"]));
  const fromApi = api.flatMap((f) => [...src[f].matchAll(/^exports\.(\w+) = /gm)].map((m) => m[1]));
  check("no two areas export the same name", new Set(fromApi).size === fromApi.length);
  check("at least the 65 there were before the split", fromApi.length >= 65, String(fromApi.length));
  const noModuleExports = api.filter((f) => /module\.exports/.test(src[f]));
  check("api files export only deployed functions", !noModuleExports.length, noModuleExports.join(", "));
  const deploys = server.filter((f) => /^exports\.\w+ = /m.test(src[f]));
  check("server files deploy nothing", !deploys.length, deploys.join(", "));
}

console.log("");
console.log("who may require whom");
{
  const bad = [];
  for (const f of FILES) {
    for (const m of src[f].matchAll(/require\("(\.[^"]+)"\)/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1]));
      if (target.startsWith("api/") && f !== "index.js") bad.push(f + " -> " + m[1]);
      if (f.startsWith("server/") && !/^(server\/|[\w-]+(\.js)?$)/.test(target)) bad.push(f + " -> " + m[1]);
      const file = path.join(F, target.endsWith(".js") ? target : target + ".js");
      if (!fs.existsSync(file)) bad.push(f + " -> " + m[1] + " (no such file)");
    }
  }
  check("api files never require each other; server files only server/ and the plain modules", !bad.length, bad.join("; "));
  // A loop among server/ files would hand one of them undefined for a name it
  // destructures at load, and nothing would say so until that name is called.
  const deps = Object.fromEntries(server.map((f) => [f, [...src[f].matchAll(/require\("\.\/([\w-]+)"\)/g)].map((m) => "server/" + m[1] + ".js")]));
  const loops = [];
  const visit = (f, trail) => {
    if (trail.includes(f)) { loops.push(trail.concat(f).join(" -> ")); return; }
    for (const d of deps[f] || []) visit(d, trail.concat(f));
  };
  server.forEach((f) => visit(f, []));
  check("server files never require each other in a loop", !loops.length, loops[0]);
  const raw = FILES.filter((f) => f !== "server/base.js" && /require\("firebase-functions\/v2\/https"\)/.test(src[f]));
  check("only server/base.js takes onCall from firebase-functions (App Check)", !raw.length, raw.join(", "));
  const v2 = FILES.filter((f) => f !== "server/base.js" && /setGlobalOptions|initializeApp\(/.test(src[f]));
  check("the region and the Admin SDK are set in one place", !v2.length, v2.join(", "));
}

console.log("");
console.log("every name a file uses is its own or imported");
{
  const info = Object.fromEntries(FILES.map((f) => [f, names(src[f])]));
  const owner = new Map(); // a top-level name -> the files that declare it
  for (const f of FILES) for (const d of info[f].declared) owner.set(d, (owner.get(d) || []).concat(f));
  const missing = [];
  for (const f of FILES) {
    for (const u of info[f].used) {
      if (info[f].declared.has(u) || info[f].imported.has(u) || !owner.has(u)) continue;
      missing.push(f + " uses " + u + " (declared in " + owner.get(u).join(", ") + ")");
    }
  }
  check("no file uses another's name without importing it", !missing.length, missing.slice(0, 8).join("; "));

  // and what a file imports from server/ is something that file exports
  const wrong = [];
  for (const f of FILES) {
    for (const m of src[f].matchAll(/const \{([^}]+)\} = require\("(\.\.?\/(?:server\/)?[\w-]+)"\);/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[2])) + ".js";
      if (!target.startsWith("server/")) continue;
      const ex = (src[target].match(/module\.exports = \{([^}]*)\}/) || [])[1] || "";
      const exported = new Set(ex.split(",").map((s) => s.trim()).filter(Boolean));
      for (const name of m[1].split(",").map((s) => s.trim().split(":")[0].trim()).filter(Boolean)) {
        if (!exported.has(name)) wrong.push(f + " imports " + name + " from " + target);
        else if (!info[target].declared.has(name) && !info[target].imported.has(name)) wrong.push(target + " exports " + name + " without declaring it");
      }
    }
  }
  check("every import is something its file exports", !wrong.length, wrong.slice(0, 8).join("; "));
}

console.log("");
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);

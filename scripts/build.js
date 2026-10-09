// Builds what the site actually serves:
//   app.min.js   — every script in js/load-order.json, in that order, minified
//   app.min.css  — styles.css, minified
//   assets.json  — every picture, video and sound, with a hash of each (see assetList)
// (each with a .map beside it, so an error still points at readable code).
//
//   node scripts/build.js           write the files
//   node scripts/build.js --check   only say whether they are up to date
//
// The sources stay the files to edit; index.html loads only these two, so a
// first visit downloads two files instead of forty, about a quarter smaller
// over the wire. Run it before testing or pushing — tests/test-build-fresh.js
// fails while the built files are behind their sources.
//
// The split files (ui-*.js, main-*.js) must be loaded as this one script,
// never as separate <script> tags: a later file's functions are only reached
// through SYS._ui / SYS._main once it has run, and between separate scripts a
// sign-in callback can fire before the rest have loaded (it did, for the
// forty minutes the split files were served one by one: "M.watchFriends is
// not a function"). In one script everything is defined before any callback.
//
// Needs esbuild: `npm install` in scripts/ once.
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let esbuild;
try { esbuild = require("esbuild"); } catch (e) {
  console.error("esbuild is not installed: run `npm install` in scripts/");
  process.exit(2);
}

// Line endings differ between checkouts (git turns LF into CRLF on Windows);
// the output must not depend on them.
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

// Every picture, video and sound the app can show, each with a short hash of
// its bytes. The service worker downloads the whole list in the background
// after the app opens and keeps it, so nothing waits on the network when a
// page or a frame is opened; a file whose hash changed is fetched again, and
// nothing else is.
function assetList() {
  const crypto = require("crypto");
  const files = {};
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = dir + "/" + e.name;
      if (e.isDirectory()) walk(rel);
      else if (/\.(webp|jpg|png|mp4|mp3|woff2)$/i.test(e.name)) {
        files[rel] = crypto.createHash("sha1").update(fs.readFileSync(path.join(ROOT, rel))).digest("hex").slice(0, 10);
      }
    }
  };
  walk("assets");
  // The brand mark the stylesheet and the landing page draw.
  ["icons/mark-on-dark.png", "icons/mark-on-light.png"].forEach((rel) => {
    files[rel] = crypto.createHash("sha1").update(fs.readFileSync(path.join(ROOT, rel))).digest("hex").slice(0, 10);
  });
  const sorted = Object.fromEntries(Object.keys(files).sort().map((k) => [k, files[k]]));
  return JSON.stringify(sorted, null, 0).replace(/","/g, '",\n"').replace(/^\{/, "{\n").replace(/\}$/, "\n}") + "\n";
}

function build() {
  const order = JSON.parse(read("js/load-order.json"));
  // One script after another, each opened by its name so the map's source
  // still says where a line came from.
  const joined = order.map((f) => "// ==== " + f + " ====\n" + read(f).replace(/\n*$/, "\n")).join(";\n");
  const js = esbuild.transformSync(joined, {
    loader: "js", minify: true, target: "es2020", charset: "utf8",
    sourcemap: "external", sourcefile: "app.js", sourcesContent: true, legalComments: "none",
  });
  const css = esbuild.transformSync(read("styles.css"), {
    loader: "css", minify: true, charset: "utf8",
    sourcemap: "external", sourcefile: "styles.css", sourcesContent: true,
  });
  return {
    "assets.json": assetList(),
    "app.min.js": js.code.replace(/\n*$/, "\n") + "//# sourceMappingURL=app.min.js.map\n",
    "app.min.js.map": js.map,
    "app.min.css": css.code.replace(/\n*$/, "\n") + "/*# sourceMappingURL=app.min.css.map */\n",
    "app.min.css.map": css.map,
  };
}

const out = build();
if (process.argv.includes("--check")) {
  const stale = Object.keys(out).filter((f) => {
    const p = path.join(ROOT, f);
    return !fs.existsSync(p) || fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n") !== out[f];
  });
  console.log(stale.length ? "stale: " + stale.join(", ") : "up to date");
  process.exit(stale.length ? 1 : 0);
}
for (const [f, text] of Object.entries(out)) fs.writeFileSync(path.join(ROOT, f), text);
const kb = (f) => (fs.statSync(path.join(ROOT, f)).size / 1024).toFixed(0) + " KB";
console.log("built app.min.js (" + kb("app.min.js") + ") and app.min.css (" + kb("app.min.css") + ")");

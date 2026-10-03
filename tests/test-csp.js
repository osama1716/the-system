// The Content-Security-Policy in index.html.
//
// It allows exactly one inline script, by hash. Editing that script — even a
// comment in it — changes the hash, and the browser then refuses to run it,
// which costs the theme before first paint. This recomputes the hash the way
// the browser does (over the served text; Pages serves the repo's LF copy) so
// the run fails instead of the page.
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const REPO = path.resolve(__dirname, "..");
let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };

const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8").replace(/\r\n/g, "\n");
const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
check("index.html carries a Content-Security-Policy", !!meta);
const csp = meta ? meta[1] : "";
const directive = (name) => (csp.split(";").map((x) => x.trim()).find((x) => x.indexOf(name + " ") === 0) || "");

check("it comes before any script", meta && html.indexOf(meta[0]) < html.indexOf("<script"));

const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
check("one inline script, the theme", inline.length === 1, inline.length + " found");
inline.forEach((body, i) => {
  const hash = "sha256-" + crypto.createHash("sha256").update(body, "utf8").digest("base64");
  check("inline script " + (i + 1) + " is allowed by its hash", directive("script-src").includes("'" + hash + "'"),
    "update script-src to '" + hash + "'");
});
check("no 'unsafe-inline' or 'unsafe-eval' for scripts", !/unsafe-(inline|eval)/.test(directive("script-src")));
check("no plugins", directive("object-src") === "object-src 'none'");

const external = [...html.matchAll(/<script src="(https:[^"]+)"([^>]*)><\/script>/g)];
check("every script from elsewhere is pinned by integrity",
  external.length > 0 && external.every((m) => /integrity="sha384-[A-Za-z0-9+/=]+"/.test(m[2]) && /crossorigin="anonymous"/.test(m[2])),
  external.filter((m) => !/integrity=/.test(m[2])).map((m) => m[1]).join(", "));

// Inline handlers are refused by the policy, so none may be written.
const handler = /\son(click|load|error|change|input|submit|mouse\w+|key\w+)\s*=/i;
const offenders = [];
["index.html", ...fs.readdirSync(path.join(REPO, "js")).filter((f) => f.endsWith(".js")).map((f) => "js/" + f)].forEach((rel) => {
  fs.readFileSync(path.join(REPO, rel), "utf8").split("\n").forEach((line, i) => {
    if (handler.test(line) && !/^\s*\/\//.test(line)) offenders.push(rel + ":" + (i + 1));
  });
});
check("no inline event handlers anywhere in the markup the app writes", !offenders.length, offenders.join(", "));

console.log("");
console.log(fails ? fails + " FAIL" : "all passed");
process.exit(fails ? 1 : 0);

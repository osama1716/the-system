// A static audit of the whole app: the checks that can be made without
// running it. Written to a file, with every pattern a regex literal, because
// a regex built from a string loses its backslashes on the way in and then
// passes for the wrong reason.
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(REPO, p), "utf8");
const exists = (p) => fs.existsSync(path.join(REPO, p));
const findings = [];
const note = (area, level, msg) => findings.push({ area, level, msg });

const CLIENT_JS = ["i18n.js", "constants.js", "storage.js", "engine.js", "planner.js", "planner-sync.js", "cloud.js", "sound.js", "push.js", "ui.js", "main.js"]
  .map((f) => "js/" + f);
const ALL_JS = CLIENT_JS.concat(["sw.js"]);

// ------------------------------------------------- shadowed functions ----
// Two `function foo()` declarations in one scope: the second silently wins
// and the first stops existing. This cost real time once — a new helper
// called daysBetween replaced the engine's own, which three schedule shapes
// depend on, and the only symptom was interval habits becoming due on the
// wrong days. Nothing in a syntax check or a linter-free project catches it.
for (const f of ALL_JS.concat(["functions/index.js", "functions/reminders.js", "functions/presets.js",
  "functions/progress.js", "functions/effort.js", "functions/evaluation-prompt.js",
  "functions/reflection.js", "functions/reflection-prompt.js", "functions/suspicion.js", "functions/event-reminders.js"])) {
  const seen = new Map();
  for (const m of read(f).matchAll(/^\s*function ([A-Za-z_$][\w$]*)\s*\(/gm)) {
    seen.set(m[1], (seen.get(m[1]) || 0) + 1);
  }
  for (const [name, n] of seen) {
    if (n > 1) note("shadowing", "bug", f + ": function " + name + "() is declared " + n + " times");
  }
}
note("shadowing", "ok", "no function name is declared twice in the same file");

// ---------------------------------------------------------------- i18n ----
const i18n = read("js/i18n.js");
const LANGS = ["en", "ar", "es", "fr", "de", "ja", "zh"];

// Rows look like:   "some.key": { en: "...", ar: "...", ... },
const defined = new Map();
for (const line of i18n.split(/\r?\n/)) {
  const m = line.match(/^\s{4}"([^"]+)":\s*\{/);
  if (!m) continue;
  const missing = LANGS.filter((l) => line.indexOf(l + ': "') < 0);
  defined.set(m[1], missing);
}
for (const [key, missing] of defined) {
  if (missing.length) note("i18n", "bug", key + " is missing: " + missing.join(", "));
}

// Every key the client could hand to t(). Matching on "the literal appears
// somewhere" rather than "the literal sits right after t(" on purpose: keys
// reach t() through a ternary, a table of nav items, a variable, or a
// concatenation, and a stricter pattern reports thirty keys as dead that are
// used on every screen.
// Form field paths are dotted too — data-bind="taskForm.title" has the same
// shape as an i18n key and is not one. Two ways they appear: inline in the
// attribute, and passed to a field helper as an argument (the schedule's
// number fields), which is why the prefix list is here as well.
const BIND_ROOTS = ["taskForm.", "appealForm.", "accountForm."];
const binds = new Set();
for (const f of CLIENT_JS) {
  for (const m of read(f).matchAll(/data-bind="([^"]+)"/g)) binds.add(m[1]);
}
const isBindPath = (s) => binds.has(s) || BIND_ROOTS.some((r) => s.indexOf(r) === 0);
const referenced = new Set();
const dynamicPrefixes = new Set();
for (const f of CLIENT_JS) {
  const src = read(f);
  for (const m of src.matchAll(/"([a-z][a-zA-Z0-9]*\.[a-zA-Z0-9._]+)"/g)) {
    if (!isBindPath(m[1])) referenced.add(m[1]);
  }
  // SYS.t("task.streak." + scope) — the prefix is real, the rest is computed.
  for (const m of src.matchAll(/"([a-z][a-zA-Z0-9]*\.(?:[a-zA-Z0-9._]+\.)?)"\s*\+/g)) dynamicPrefixes.add(m[1]);
}
for (const key of referenced) {
  if (defined.has(key)) continue;
  // A key built by concatenation is covered by its prefix instead.
  if ([...dynamicPrefixes].some((p) => key.indexOf(p) === 0)) continue;
  note("i18n", "bug", "used in code but not defined: " + key);
}
const unused = [];
for (const key of defined.keys()) {
  if (referenced.has(key)) continue;
  if ([...dynamicPrefixes].some((p) => key.indexOf(p) === 0)) continue;
  unused.push(key);
}
if (unused.length) note("i18n", "info", unused.length + " defined but never referenced: " + unused.join(", "));
note("i18n", "ok", defined.size + " keys, " + LANGS.length + " languages");

// ------------------------------------------------------------- actions ----
// Everything the UI can emit, against everything main.js handles. A button
// with no handler does nothing when pressed; a handler with no button is
// either dead or reachable only by a path worth knowing about.
const emitted = new Set();
for (const f of CLIENT_JS.concat(["index.html"])) {
  const src = read(f);
  for (const m of src.matchAll(/data-action="([a-z0-9-]+)"/g)) emitted.add(m[1]);
}
const main = read("js/main.js");
const handled = new Set();
for (const m of main.matchAll(/case "([a-z0-9-]+)":/g)) handled.add(m[1]);
for (const m of main.matchAll(/===\s*"([a-z0-9-]+)"/g)) handled.add(m[1]);
for (const m of main.matchAll(/action ===\s*"([a-z0-9-]+)"/g)) handled.add(m[1]);

for (const a of [...emitted].sort()) {
  if (!handled.has(a)) note("actions", "bug", 'data-action="' + a + '" has no handler');
}
const orphanHandlers = [...handled].filter((a) => !emitted.has(a) && /-/.test(a)).sort();
if (orphanHandlers.length) note("actions", "info", "handled but never emitted: " + orphanHandlers.join(", "));
note("actions", "ok", emitted.size + " actions emitted, " + handled.size + " handled");

// ----------------------------------------------------------- the shell ----
const html = read("index.html");
const scripts = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map((m) => m[1]);
for (const s of scripts) if (!exists(s)) note("shell", "bug", "index.html loads a file that is not there: " + s);
for (const f of CLIENT_JS) {
  if (f === "js/i18n.js" || scripts.includes(f)) continue;
  if (!scripts.includes(f)) note("shell", "bug", f + " exists but index.html never loads it");
}

const sw = read("sw.js");
const cacheName = (sw.match(/CACHE_NAME = "([^"]+)"/) || [])[1];
const coreBlock = (sw.match(/CORE_ASSETS = \[([\s\S]*?)\]/) || [])[1] || "";
const core = [...coreBlock.matchAll(/"\.\/([^"]*)"/g)].map((m) => m[1]);
for (const c of core) {
  const p = c === "" ? "index.html" : c;
  if (!exists(p)) note("pwa", "bug", "the service worker precaches a file that is not there: " + c);
}
for (const s of scripts) {
  if (!core.includes(s)) note("pwa", "warn", s + " is loaded by the page but not precached — offline it will 404");
}
note("pwa", "ok", "cache " + cacheName + ", " + core.length + " precached assets");

// Icons the manifest and the page promise.
const manifest = JSON.parse(read("manifest.json"));
for (const ic of manifest.icons || []) {
  if (!exists(ic.src.replace(/^\.\//, ""))) note("pwa", "bug", "manifest icon missing: " + ic.src);
}
for (const m of html.matchAll(/href="(icons\/[^"]+)"/g)) {
  if (!exists(m[1])) note("pwa", "bug", "index.html links a missing icon: " + m[1]);
}

// ---------------------------------------------------------------- css -----
// Class names the UI writes, against the stylesheet. Heuristic by nature:
// a class can be styled by a parent selector, so this only reports names
// that appear nowhere in the CSS at all.
const css = read("styles.css");
const usedClasses = new Set();
for (const f of CLIENT_JS) {
  const src = read(f);
  for (const m of src.matchAll(/class="([^"${]+)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c) usedClasses.add(c);
  }
}
const unstyled = [...usedClasses].filter((c) => css.indexOf("." + c) < 0).sort();
if (unstyled.length) note("css", "warn", "classes with no rule anywhere: " + unstyled.join(", "));
note("css", "ok", usedClasses.size + " static class names checked");

// ------------------------------------------------------------ secrets -----
// The VAPID private key and the API key must not be in the repository. This
// looks for the shapes rather than for known values, so a new one that
// wanders in is caught too.
const suspects = [];
function walk(dir) {
  for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
    const rel = dir ? dir + "/" + e.name : e.name;
    if (/^(\.git|node_modules|The System Growth Tracker)$/.test(e.name)) continue;
    if (e.isDirectory()) { walk(rel); continue; }
    if (!/\.(js|json|html|css|md|rules|txt|yml|yaml)$/.test(e.name)) continue;
    let src;
    try { src = read(rel); } catch (err) { continue; }
    if (/sk-ant-[A-Za-z0-9_-]{20,}/.test(src)) suspects.push(rel + ": an Anthropic key shape");
    if (/VAPID_PRIVATE_KEY\s*[:=]\s*"[A-Za-z0-9_-]{20,}"/.test(src)) suspects.push(rel + ": a VAPID private key literal");
  }
}
walk("");
for (const s of suspects) note("secrets", "bug", s);
if (!suspects.length) note("secrets", "ok", "no key material found in tracked files");

// ------------------------------------------------------------- output -----
const order = { bug: 0, warn: 1, info: 2, ok: 3 };
findings.sort((a, b) => order[a.level] - order[b.level] || a.area.localeCompare(b.area));
const counts = { bug: 0, warn: 0, info: 0, ok: 0 };
for (const f of findings) counts[f.level]++;
for (const f of findings) console.log(f.level.toUpperCase().padEnd(5) + " [" + f.area + "] " + f.msg);
console.log("");
console.log(counts.bug + " bugs, " + counts.warn + " warnings, " + counts.info + " notes");

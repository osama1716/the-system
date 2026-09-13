// Buttons that say nothing.
//
// A button whose only content is an icon is a blank to a screen reader and a
// guess to everyone else once the tooltip is gone. This finds the ones with
// no aria-label and no text of their own.
const fs = require("fs");
const src = fs.readFileSync(require("path").join(__dirname, "..", "..", "js", "ui.js"), "utf8");

// Split on button openings, then take each tag and the text up to </button>.
const parts = src.split("<button");
let total = 0, unlabelled = [];
for (let i = 1; i < parts.length; i++) {
  const chunk = parts[i];
  const gt = chunk.indexOf(">");
  if (gt < 0) continue;
  const attrs = chunk.slice(0, gt);
  const closeAt = chunk.indexOf("</button>");
  const body = closeAt < 0 ? chunk.slice(gt + 1, gt + 200) : chunk.slice(gt + 1, closeAt);
  total++;
  if (/aria-label/.test(attrs)) continue;
  // Text of its own: anything that is not an icon() call, whitespace, or an
  // interpolation of one.
  const stripped = body
    .replace(/\$\{icon\([^)]*\)\}/g, "")
    .replace(/\$\{[^}]*\}/g, "X")
    .replace(/<[^>]*>/g, "")
    .trim();
  if (stripped === "") {
    const line = src.slice(0, src.indexOf("<button" + chunk.slice(0, 40))).split(/\r?\n/).length;
    unlabelled.push("ui.js:" + line + "  " + attrs.trim().slice(0, 90));
  }
}
console.log(total + " buttons in ui.js");
console.log(unlabelled.length + " with neither aria-label nor text of their own");
for (const u of unlabelled) console.log("  " + u);

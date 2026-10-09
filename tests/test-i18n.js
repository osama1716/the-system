// Every string in every language: present, in the right script, with the
// same placeholders and markup as the English. What it cannot judge is
// whether a sentence reads well; that is a human (or a careful reader's) job.
const fs = require("fs"), path = require("path"), vm = require("vm");
const REPO = path.resolve(__dirname, "..");
const SYS = {};
const sb = { SYS, window: { SYS }, console };
vm.createContext(sb);
for (const f of ["i18n.js", "traits-i18n.js", "landing.js"]) {
  vm.runInContext(fs.readFileSync(path.join(REPO, "js", f), "utf8")
    .replace(/\}\)\(window\.SYS[^)]*\);?\s*$/, "})(SYS);"), sb, { filename: f });
}
let fails = 0;
const problems = [];
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };
const LANGS = Object.keys(SYS.LANGUAGES);

// The same table shape for both sources: key -> { lang: text }.
const tables = { app: SYS.STRINGS, landing: {} };
for (const lang of Object.keys(SYS.LANDING_STRINGS)) {
  for (const [k, v] of Object.entries(SYS.LANDING_STRINGS[lang])) (tables.landing[k] = tables.landing[k] || {})[lang] = v;
}

// The built-in traits: one row of six translations each.
tables.traits = {};
for (const [name, row] of Object.entries(SYS.TRAIT_NAMES)) {
  tables.traits["trait." + name] = { en: name };
  ["ar", "es", "fr", "de", "ja", "zh"].forEach((l, i) => { tables.traits["trait." + name][l] = row[i]; });
}
// Same in every language and right to be: words that are the same word.
const SAME_OK = new Set(["profile.reportNote:de", "trait.Yoga:es", "trait.Yoga:fr", "trait.Yoga:de", "trait.Leadership:fr",
  "trait.Camping:fr", "trait.Camping:de", "trait.Animation:fr", "trait.Animation:de", "trait.Sport:fr"]);

// Words that stay as they are in every language.
const KEEP = /The System|Console|iPhone|README|ToDo|Win|Control|Command|Space|user@example\.com|firestore:rules|EXP|SQL|AI|Aurenite|Coreon|PDF|JSON|CSV|Google|Firebase|Claude|Anthropic|App Check|PIN|ID|URL|OK|km|kg|ml|cm|min|h\b|[GFEDCBAS]\b|S\d|\{[a-zA-Z]+\}|<[^>]+>|&[a-z]+;/g;
const latinWords = (s) => (s.replace(KEEP, " ").match(/[A-Za-z]{3,}/g) || []);
const placeholders = (s) => (s.match(/\{[a-zA-Z]+\}/g) || []).sort().join(",");
const tags = (s) => (s.match(/<\/?[a-z]+/g) || []).sort().join(",");
const ARABIC = /[؀-ۿ]/, KANA = /[぀-ヿ]/, HAN = /[一-鿿]/;

for (const [name, table] of Object.entries(tables)) {
  for (const [key, entry] of Object.entries(table)) {
    const en = entry.en;
    if (typeof en !== "string") { problems.push([name, key, "en", "no English"]); continue; }
    for (const lang of LANGS) {
      const v = entry[lang];
      const p = (why) => problems.push([name, key, lang, why + "  →  " + JSON.stringify(v)]);
      if (typeof v !== "string" || !v.trim()) { p("missing"); continue; }
      if (lang === "en") continue;
      if (placeholders(v) !== placeholders(en)) p("placeholders differ from English " + placeholders(en));
      if (tags(v) !== tags(en)) p("markup differs from English");
      if (lang !== "ar" && ARABIC.test(v)) p("Arabic letters");
      if (lang !== "ja" && lang !== "zh" && (KANA.test(v) || HAN.test(v))) p("CJK letters");
      if (lang === "zh" && KANA.test(v)) p("Japanese kana in Chinese");
      if (["ar", "ja", "zh"].includes(lang)) {
        const w = latinWords(v);
        if (w.length) p("untranslated English? " + w.join(" "));
        if (lang === "ar" && /[a-z]/i.test(en.replace(KEEP, "")) && !ARABIC.test(v) && v === en) p("same as English");
      } else if (v === en && latinWords(en).length >= 1 && !SAME_OK.has(key + ":" + lang) && name !== "app") p("same as English");
      else if (v === en && latinWords(en).length >= 2 && !SAME_OK.has(key + ":" + lang)) p("same as English");
    }
  }
}

console.log("checked " + Object.keys(tables.app).length + " app keys and " + Object.keys(tables.landing).length + " landing keys in " + LANGS.length + " languages");
for (const [name, key, lang, why] of problems) console.log("  " + name + "  " + key + "  [" + lang + "]  " + why);
check("every string is present, in its own script, with the English placeholders and markup", problems.length === 0, problems.length + " problems");
const seeded = (fs.readFileSync(path.join(REPO, "js", "constants.js"), "utf8").match(/\{ id: "[^"]+", name: "[^"]+", ar: /g) || [])
  .map((x) => x.match(/name: "([^"]+)"/)[1]);
const untranslated = seeded.filter((n) => !SYS.TRAIT_NAMES[n]);
check("every built-in trait has its translations", seeded.length > 80 && !untranslated.length, untranslated.join(", "));
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);

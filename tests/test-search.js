// Player search (functions/search.js): exact first, then close, then near.
const path = require("path");
const REPO = path.resolve(__dirname, "..").split(path.sep).join("/") + "/";
const S = require(REPO + "functions/search.js");
let fails = 0;
const check = (name, c, d) => { if (!c) { fails++; console.log("  FAIL  " + name + (d ? "  " + d : "")); } else console.log("  ok    " + name); };

const people = [
  "Osama", "Osama_Dev", "osamaa", "Usama", "ShadowMonarch", "Shadow", "TheShadowKing", "أسامة", "اسامه", "سامي",
  "Hunter", "Hunter77", "Bob", "Sung Jin Woo", "jinwoo", "Ōsaka", "李明",
].map((name, i) => ({ uid: "u" + i, name }));
const names = (q, ex) => S.search(q, people, ex).map((r) => r.name);

console.log("");
console.log("folding");
check("case, spacing and underscores", S.fold("  Osama_Dev ") === "osama dev");
check("Arabic variants are one", S.fold("أسامة") === S.fold("اسامه"));
check("accents go", S.fold("Ōsaka") === "osaka");
check("Arabic diacritics and tatweel go", S.fold("سَامـي") === "سامي");

console.log("");
console.log("ranking");
check("the exact name comes first", names("Osama")[0] === "Osama", names("Osama").join(", "));
check("case does not matter for exact", names("osama")[0] === "Osama");
check("then names that start with it", names("Osama").slice(1, 3).sort().join() === ["Osama_Dev", "osamaa"].sort().join(), names("Osama").join(", "));
check("and a one-letter difference is found", names("Osama").includes("Usama"), names("Osama").join(", "));
check("a prefix finds the rest", names("Shad").slice(0, 2).join() === "Shadow,ShadowMonarch", names("Shad").join(", "));
check("a word inside a name", names("king").includes("TheShadowKing") && names("woo").includes("Sung Jin Woo"));
check("a typo still finds it", names("Shdaow").includes("Shadow"), names("Shdaow").join(", "));
check("a typo at the start of a long name", names("sahdowmon").includes("ShadowMonarch"), names("sahdowmon").join(", "));
check("Arabic spelt differently finds both", names("اسامة").slice(0, 2).sort().join() === ["أسامة", "اسامه"].sort().join(), names("اسامة").join(", "));
check("Chinese exact", names("李明")[0] === "李明");
check("nothing unrelated", !names("Osama").includes("Bob") && names("zzzz").length === 0);
check("yourself left out", !names("Osama", ["u0"]).includes("Osama"));
check("never more than the cap", S.search("a", Array.from({ length: 100 }, (_, i) => ({ uid: "x" + i, name: "a" + i }))).length === S.RESULTS);

console.log("");
console.log("shards");
const shards = new Set(people.map((p) => S.shardOf(S.fold(p.name))));
check("names spread over shards", shards.size > 3 && [...shards].every((s) => Number(s) < S.SHARDS));
check("the same key always lands in the same shard", S.shardOf("osama") === S.shardOf("osama"));

console.log("");
console.log(fails ? fails + " FAIL" : "all passed");
process.exit(fails ? 1 : 0);

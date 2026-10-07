// The daily streak (functions/streak.js): counted from paid days, and the
// evening nudge's timing.
const fs = require("fs"), path = require("path");
const REPO = path.resolve(__dirname, "..");
const STREAK = require(path.join(REPO, "functions", "streak.js"));

let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };

console.log("counting days");
{
  let s = STREAK.advance(null, "2026-10-07");
  check("a first paid day starts at one", s.current === 1 && s.best === 1 && s.lastDay === "2026-10-07", JSON.stringify(s));
  const same = STREAK.advance(s, "2026-10-07");
  check("the same day twice changes nothing", same.current === 1, JSON.stringify(same));
  s = STREAK.advance(s, "2026-10-08");
  s = STREAK.advance(s, "2026-10-09");
  check("consecutive days add up", s.current === 3 && s.best === 3, JSON.stringify(s));
  const gap = STREAK.advance(s, "2026-10-11");
  check("a missed day starts again", gap.current === 1 && gap.best === 3, JSON.stringify(gap));
  const back = STREAK.advance(s, "2026-10-05");
  check("an earlier date neither extends nor breaks", back.current === 3 && back.lastDay === "2026-10-09", JSON.stringify(back));
  const month = STREAK.advance({ current: 5, best: 5, lastDay: "2026-10-31" }, "2026-11-01");
  check("a month boundary is one day", month.current === 6, JSON.stringify(month));
}

console.log("");
console.log("alive or ended");
{
  const s = { current: 4, best: 9, lastDay: "2026-10-07" };
  check("today counted: alive and done", STREAK.live(s, "2026-10-07").current === 4 && STREAK.live(s, "2026-10-07").doneToday);
  const y = STREAK.live(s, "2026-10-08");
  check("counted yesterday: alive, today still open", y.current === 4 && !y.doneToday, JSON.stringify(y));
  check("two days ago: ended", STREAK.live(s, "2026-10-09").current === 0);
  check("the best survives the end", STREAK.live(s, "2026-10-20").best === 9);
}

console.log("");
console.log("when the nudge goes");
{
  // Amman is UTC+3 in October 2026: 20:00 there is 17:00 UTC.
  const amman = STREAK.rescueAt("2026-10-07", "Asia/Amman");
  check("the evening after the last day, in the person's zone", new Date(amman).toISOString() === "2026-10-08T17:00:00.000Z", new Date(amman).toISOString());
  // New York leaves daylight time on 1 November 2026: 20:00 is 01:00 UTC next day.
  const ny = STREAK.rescueAt("2026-10-31", "America/New_York");
  check("across a clock change", new Date(ny).toISOString() === "2026-11-02T01:00:00.000Z", new Date(ny).toISOString());
  const utc = STREAK.rescueAt("2026-10-07", "Not/AZone");
  check("an unknown zone falls back to UTC", new Date(utc).toISOString() === "2026-10-08T20:00:00.000Z", new Date(utc).toISOString());
}

console.log("");
console.log("what it says, and where it is wired");
{
  const i18n = fs.readFileSync(path.join(REPO, "js", "i18n.js"), "utf8");
  const langs = (i18n.match(/^\s{4}([a-z]{2}): \{ name:/gm) || []).map((l) => l.trim().slice(0, 2));
  check("the nudge is written in every language the app speaks",
    langs.length > 0 && langs.every((l) => STREAK.RESCUE_TEXT[l]), langs.join(","));
  check("and carries the count", STREAK.rescuePayload(12, "ar").title.includes("12"));
  const rules = fs.readFileSync(path.join(REPO, "firestore.rules"), "utf8");
  check("the rules let only the server write it",
    /match \/streaks\/\{userId\} \{\s*\/?\/?[^}]*allow read: if isOwner\(userId\) \|\| isAdmin\(\);\s*allow write: if false;/.test(rules));
  const index = fs.readFileSync(path.join(REPO, "functions", "index.js"), "utf8");
  check("erasing an account removes it", /const singles = \[[^\]]*"streaks"/.test(index));
}

console.log("");
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);

// Seasons (functions/season.js) and the app's copy of their calendar.
const fs = require("fs"), path = require("path"), vm = require("vm");
const REPO = path.resolve(__dirname, "..");
const SEASON = require(path.join(REPO, "functions", "season.js"));
const SYS = {};
const sb = { SYS, window: {}, console, Math, JSON, Object, Array, Number, String, Boolean, RegExp, Date, Set, Map, Intl,
  crypto: { randomUUID: () => "id" + Math.random() } };
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(REPO, "js", "constants.js"), "utf8")
  .replace(/\}\)\(window\.SYS[^)]*\);?\s*$/, "})(SYS);"), sb, { filename: "constants.js" });

let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };

console.log("the schedule");
check("the app and the server agree on the start", SYS.SEASON_START_MS === SEASON.SEASON_START_MS);
check("and the length", SYS.SEASON_DAYS === SEASON.SEASON_DAYS && SEASON.SEASON_DAYS === 56);
if (SEASON.SEASON_START_MS == null) {
  check("unscheduled: nothing is a season", SEASON.seasonKeyOf(new Date()) === null && SYS.currentSeason().upcoming === true);
  check("and a row gains no season figure", JSON.stringify(SEASON.nextSeason({}, null, 50)) === "{}");
} else {
  check("it starts on a Monday", new Date(SEASON.SEASON_START_MS).getUTCDay() === 1);
  check("the app names it as the server does", SYS.currentSeason(new Date(SEASON.SEASON_START_MS + 3600000)).key ===
    SEASON.seasonKeyOf(new Date(SEASON.SEASON_START_MS + 3600000)));
}

console.log("");
console.log("with a start set (a Monday in December)");
const start = Date.UTC(2026, 11, 7);
check("before it, none", SEASON.seasonKeyOf(new Date(start - 1), start) === null);
check("its first moment", SEASON.seasonKeyOf(new Date(start), start) === "S1@2026-12-07");
check("eight weeks later, the next", SEASON.seasonKeyOf(new Date(start + 56 * 86400000), start) === "S2@2027-02-01");
check("the October test's rows can never match a real season",
  SEASON.nextSeason({ seasonKey: "S1", seasonExp: 900 }, "S1@2026-12-07", 50).seasonExp === 50);
check("adds within a season", SEASON.nextSeason({ seasonKey: "S1@2026-12-07", seasonExp: 300 }, "S1@2026-12-07", 50).seasonExp === 350);

console.log("");
console.log("wired in");
const idx = JSON.parse(fs.readFileSync(path.join(REPO, "firestore.indexes.json"), "utf8"));
check("the season board has its index", idx.indexes.some((i) => i.collectionGroup === "leaderboard" &&
  i.fields.map((f) => f.fieldPath).join() === "seasonKey,seasonExp"));

console.log("");
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);

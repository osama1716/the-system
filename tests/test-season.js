// Seasons (functions/season.js) and the app's copy of their calendar.
const fs = require("fs"), path = require("path"), vm = require("vm");
const REPO = path.resolve(__dirname, "..");
const SEASON = require(path.join(REPO, "functions", "season.js"));
const FRIENDS = require(path.join(REPO, "functions", "friends.js"));
const SYS = {};
const sb = { SYS, window: {}, console, Math, JSON, Object, Array, Number, String, Boolean, RegExp, Date, Set, Map, Intl,
  crypto: { randomUUID: () => "id" + Math.random() } };
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(REPO, "js", "constants.js"), "utf8")
  .replace(/\}\)\(window\.SYS[^)]*\);?\s*$/, "})(SYS);"), sb, { filename: "constants.js" });

let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };

console.log("the calendar");
check("the app and the server start on the same day", SYS.SEASON_START_MS === SEASON.SEASON_START_MS);
check("and last as long", SYS.SEASON_DAYS === SEASON.SEASON_DAYS && SEASON.SEASON_DAYS === 56);
check("it starts on a Monday", new Date(SEASON.SEASON_START_MS).getUTCDay() === 1);
check("before it, season 0", SEASON.seasonOf(new Date("2026-10-04T23:59:59Z")) === 0);
check("its first moment is season 1", SEASON.seasonKeyOf(new Date("2026-10-05T00:00:00Z")) === "S1");
check("its last day is still season 1", SEASON.seasonOf(new Date("2026-11-29T23:59:59Z")) === 1);
check("then season 2", SEASON.seasonOf(new Date("2026-11-30T00:00:00Z")) === 2);
const s = SYS.currentSeason(new Date("2026-10-07T12:00:00Z"));
check("the app agrees, with days left", s.key === "S1" && s.daysLeft === 54, JSON.stringify(s));
check("the server and the app agree on every day of a year", (() => {
  for (let d = 0; d < 366; d++) {
    const at = new Date(SEASON.SEASON_START_MS + d * 86400000 + 3600000);
    if (SYS.currentSeason(at).key !== SEASON.seasonKeyOf(at)) return false;
  }
  return true;
})());

console.log("");
console.log("the season's figure on a row");
const firstWeek = FRIENDS.weekKeyOf(new Date(SEASON.SEASON_START_MS));
check("adds within a season", SEASON.nextSeason({ seasonKey: "S1", seasonExp: 300 }, "S1", 50, firstWeek).seasonExp === 350);
check("starts again in a new one", SEASON.nextSeason({ seasonKey: "S1", seasonExp: 300 }, "S2", 50, firstWeek).seasonExp === 50);
check("a row from before seasons picks up the first week it missed",
  SEASON.nextSeason({ weekKey: firstWeek, weekExp: 420 }, "S1", 30, firstWeek).seasonExp === 450);
check("but not a later week's", SEASON.nextSeason({ weekKey: "2026-W43", weekExp: 420 }, "S1", 30, firstWeek).seasonExp === 30);
check("and not in a later season", SEASON.nextSeason({ weekKey: firstWeek, weekExp: 420 }, "S2", 30, firstWeek).seasonExp === 30);

console.log("");
console.log("wired in");
const idx = JSON.parse(fs.readFileSync(path.join(REPO, "firestore.indexes.json"), "utf8"));
check("the season board has its index", idx.indexes.some((i) => i.collectionGroup === "leaderboard" &&
  i.fields.map((f) => f.fieldPath).join() === "seasonKey,seasonExp"));

console.log("");
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);

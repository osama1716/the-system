// Weekly races (functions/races.js): who may challenge, and the score.
const path = require("path");
const REPO = path.resolve(__dirname, "..").split(path.sep).join("/") + "/";
const R = require(REPO + "functions/races.js");
let fails = 0;
const check = (name, c, d) => { if (!c) { fails++; console.log("  FAIL  " + name + (d ? "  " + d : "")); } else console.log("  ok    " + name); };

console.log("");
console.log("who may challenge");
const d = (over) => R.decideChallenge(Object.assign({ me: "a", them: "b", friends: true, blockedBy: false, youBlocked: false, openBetween: false, openCount: 1 }, over));
check("friends with nothing open", d({}) === "ok");
check("not yourself", d({ them: "a" }) === "self");
check("only friends", d({ friends: false }) === "not-friends");
check("a block first", d({ blockedBy: true, friends: false }) === "blocked-by" && d({ youBlocked: true }) === "you-blocked");
check("one race at a time per pair", d({ openBetween: true }) === "already-open");
check("a cap on open races", d({ openCount: R.MAX_OPEN }) === "too-many");

console.log("");
console.log("the metric");
check("total always", R.metricOk("total", []));
check("an intelligence the challenger has", R.metricOk("bodily", ["self", "bodily"]));
check("not an unknown one", !R.metricOk("flying", ["self", "bodily"]) && !R.metricOk(null, ["self"]));

console.log("");
console.log("the window");
{
  const w = R.windowFrom(1000);
  check("seven days from acceptance", w.startAt === 1000 && w.endAt === 1000 + 7 * 86400000);
}

console.log("");
console.log("scoring from the journal");
{
  const events = [
    { delta: 60, source: "Read a book", priceId: "p1", server: true },       // self + linguistic
    { delta: 20, source: "Walk", priceId: "p2", server: true },              // bodily
    { delta: -20, source: "Walk", priceId: "p2", server: true },             // undone
    { delta: 30, source: "Gym", priceId: "p3", server: true },               // bodily
    { delta: 500, source: "Adjustment: bonus", server: true },               // admin
    { delta: 40, source: "Old task", server: false },                        // unverified, no price
    { delta: 50, source: "Legacy price", priceId: "p9", server: true },     // price without types
  ];
  const types = { p1: ["self", "linguistic"], p2: ["bodily"], p3: ["bodily"], p9: null };
  check("total counts everything the journal counts", R.scoreOf(events, types, "total", true) === 60 + 20 - 20 + 30 + 40 + 50, R.scoreOf(events, types, "total", true));
  check("an admin adjustment is nobody's effort", R.scoreOf([events[4]], types, "total", true) === 0);
  check("unverified entries stop counting when the journal stops counting them", R.scoreOf([events[5]], types, "total", false) === 0);
  check("an intelligence counts its own tasks, undo included", R.scoreOf(events, types, "bodily", true) === 30, R.scoreOf(events, types, "bodily", true));
  check("split across a task's intelligences", R.scoreOf(events, types, "self", true) === 30);
  check("a price without types counts only in total", R.scoreOf([events[6]], types, "bodily", true) === 0);
  check("an unverified entry has no intelligence", R.scoreOf([events[5]], types, "bodily", true) === 0);
}

console.log("");
console.log("the result");
check("the higher score wins", R.outcome("a", "b", { a: 120, b: 80 }).winner === "a" && R.outcome("a", "b", { a: 10, b: 80 }).winner === "b");
check("a draw is a tie", R.outcome("a", "b", { a: 50, b: 50 }).winner === null);
check("nothing earned by either is a tie", R.outcome("a", "b", {}).winner === null);

console.log("");
console.log(fails ? fails + " FAIL" : "all passed");
process.exit(fails ? 1 : 0);

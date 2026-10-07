// The admin's numbers (functions/stats.js).
const path = require("path");
const STATS = require(path.join(__dirname, "..", "functions", "stats.js"));

let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };

const now = Date.parse("2026-10-30T12:00:00Z");
const day = (k) => Date.parse(k + "T09:00:00Z");
const users = [
  { uid: "a", createdMs: day("2026-10-01") }, // came back next day and in week 2
  { uid: "b", createdMs: day("2026-10-01") }, // never came back
  { uid: "c", createdMs: day("2026-10-20") }, // next day only; too new for week 2
  { uid: "d", createdMs: day("2026-10-30") }, // today
  { uid: "e", createdMs: day("2026-10-29") }, // yesterday: no next day to judge yet
];
const activity = {
  a: new Set(["2026-10-01", "2026-10-02", "2026-10-09", "2026-10-30"]),
  b: new Set(["2026-10-01"]),
  c: new Set(["2026-10-20", "2026-10-21", "2026-10-26"]),
  d: new Set(["2026-10-30"]),
  e: new Set(),
};
const s = STATS.summarise(users, activity, now);

console.log("counts");
check("accounts", s.accounts === 5);
check("new today", s.newToday === 1, String(s.newToday));
check("new in 7 days", s.new7 === 2, String(s.new7));
check("active today", s.activeToday === 2, String(s.activeToday));
check("active in 7 days", s.active7 === 3, String(s.active7));
check("fourteen days of sign-ups ending today", s.signups.length === 14 && s.signups[13].day === "2026-10-30" && s.signups[13].n === 1);

console.log("");
console.log("coming back");
check("next day: a and c of a, b, c (d and e too new)", s.d1.cohort === 3 && s.d1.kept === 2, JSON.stringify(s.d1));
check("week 2: a of a and b (c too new)", s.d7.cohort === 2 && s.d7.kept === 1, JSON.stringify(s.d7));

console.log("");
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);

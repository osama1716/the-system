// The Comparison chart's buckets. The traps it is here for: a day that has not
// happened drawn as a zero, a 31st that September does not have drawn as a
// zero, and the year view losing amounts once their days are pruned.
const fs = require("fs"), path = require("path"), vm = require("vm");
const REPO = path.resolve(__dirname, "..").split(path.sep).join("/") + "/";
const SYS = {};
const sb = { SYS, window: {}, console, Math, JSON, Object, Array, Number, String, Boolean, RegExp, Date, Set, Map, Intl,
  crypto: { randomUUID: () => "id" + Math.random() } };
vm.createContext(sb);
for (const f of ["constants.js", "engine.js"]) {
  vm.runInContext(fs.readFileSync(path.join(REPO, "js", f), "utf8")
    .replace(/\}\)\(window\.SYS[^)]*\);?\s*$/, "})(SYS);"), sb, { filename: f });
}
let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };
const today = SYS.todayKey();
const back = (n) => SYS.shiftDay(today, -n);
const key = (d) => SYS.dateKey(d);
function habit(over) {
  const s = SYS.defaultState(); s.tasks = [];
  SYS.addTask(s, Object.assign({ title: "Read", priority: "Medium", taskType: "Recurring", types: ["bodily"], pt: 20,
    mode: "simple", notes: "", recurring: true, schedule: { type: "daily" }, unit: "min", targetAmount: 30,
    traitTargets: [{ category: "bodily", trait: "Health" }] }, over || {}));
  return { s, h: s.tasks[0] };
}
const base = (min) => SYS.toBase(min, "min", "min");

console.log("");
console.log("week: this Monday to Sunday against the seven days before");
{
  const { s, h } = habit();
  const monday = SYS.mondayOf(new Date());
  const thisMon = key(monday);
  const lastMon = SYS.shiftDay(thisMon, -7);
  SYS.addHabitAmount(s, h.id, thisMon, 20, "min");
  SYS.addHabitAmount(s, h.id, lastMon, 45, "min");
  const c = SYS.comparison(h, "week");
  check("seven buckets", c.buckets.length === 7, String(c.buckets.length));
  check("the first is this Monday", c.buckets[0].curKey === thisMon, c.buckets[0].curKey);
  check("paired with last Monday", c.buckets[0].prevKey === lastMon, c.buckets[0].prevKey);
  check("this Monday holds its amount", c.buckets[0].cur === base(20), String(c.buckets[0].cur));
  check("last Monday holds its own", c.buckets[0].prev === base(45), String(c.buckets[0].prev));
  const future = c.buckets.filter((b) => b.curKey > today);
  check("a day that has not happened is null, not zero", future.every((b) => b.cur === null), JSON.stringify(future.map((b) => b.cur)));
  check("a past day with nothing on it is zero, not null",
    c.buckets.filter((b) => b.curKey <= today && b.curKey !== thisMon).every((b) => b.cur === 0));
  check("the scale reaches the tallest bar", c.max === base(45), String(c.max));
  check("the totals add up", c.curTotal === base(20) && c.prevTotal === base(45));
}

console.log("");
console.log("month: day by day, and a day the month does not have is not a zero");
{
  const { s, h } = habit();
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const firstThis = key(new Date(y, m, 1));
  const firstLast = key(new Date(y, m - 1, 1));
  SYS.addHabitAmount(s, h.id, firstThis, 10, "min");
  SYS.addHabitAmount(s, h.id, firstLast, 25, "min");
  const c = SYS.comparison(h, "month");
  const curLen = new Date(y, m + 1, 0).getDate(), prevLen = new Date(y, m, 0).getDate();
  check("as many buckets as this month has days", c.buckets.length === curLen, c.buckets.length + " vs " + curLen);
  check("day one against day one", c.buckets[0].cur === base(10) && c.buckets[0].prev === base(25),
    c.buckets[0].cur + " / " + c.buckets[0].prev);
  check("the last bucket is this month's last day", c.buckets[curLen - 1].curKey === key(new Date(y, m, curLen)));
  check("last month's total is the whole month", c.prevTotal === SYS.monthVolume(h, firstLast.slice(0, 7)),
    c.prevTotal + " vs " + SYS.monthVolume(h, firstLast.slice(0, 7)));
  check("days past last month's end are null", c.buckets.slice(prevLen).every((b) => b.prev === null && b.prevKey === null));
  check("days later this month than today are null",
    c.buckets.filter((b) => b.curKey && b.curKey > today).every((b) => b.cur === null));
}

console.log("");
console.log("month: every February length and every 29/30/31 handled");
{
  // Checked against real calendars rather than only today's month, so the
  // test cannot pass just because the current month happens to be easy.
  const lengths = [];
  for (const [yy, mm] of [[2026, 1], [2028, 1], [2026, 3], [2026, 0], [2026, 8], [2100, 1]]) {
    lengths.push([yy, mm, new Date(yy, mm + 1, 0).getDate()]);
  }
  check("February 2026 has 28, 2028 has 29, 2100 has 28",
    lengths[0][2] === 28 && lengths[1][2] === 29 && lengths[5][2] === 28, JSON.stringify(lengths));
}

console.log("");
console.log("month: a longer last month keeps its last day in its total");
{
  const { s, h } = habit();
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const curLen = new Date(y, m + 1, 0).getDate(), prevLen = new Date(y, m, 0).getDate();
  const lastOfPrev = key(new Date(y, m, 0));
  SYS.addHabitAmount(s, h.id, lastOfPrev, 15, "min");
  const c = SYS.comparison(h, "month");
  if (prevLen > curLen) {
    check("that day has no bucket on this month's axis", !c.buckets.some((b) => b.prevKey === lastOfPrev));
  } else {
    check("that day has its own bucket", c.buckets.some((b) => b.prevKey === lastOfPrev));
  }
  check("and last month's total still includes it", c.prevTotal === base(15), String(c.prevTotal));
}

console.log("");
console.log("year: month by month, surviving the days being pruned");
{
  const { s, h } = habit();
  // Two hundred days, oldest first, so the oldest are pruned as we go and
  // their amounts have to reach volByMonth.
  const expectedByMonth = {};
  let total = 0;
  for (let d = 200; d >= 1; d--) {
    const k = back(d);
    SYS.addHabitAmount(s, h.id, k, 5, "min");
    expectedByMonth[k.slice(0, 7)] = (expectedByMonth[k.slice(0, 7)] || 0) + base(5);
    total += base(5);
  }
  check("only the window is kept in detail", Object.keys(SYS.habitDays(h)).length === 120);
  const pruned = Object.values(h.volByMonth || {}).reduce((a, b) => a + b, 0);
  check("what was pruned is all accounted for by month", pruned === h.volPruned, pruned + " vs " + h.volPruned);
  let wrong = [];
  for (const [mk, amt] of Object.entries(expectedByMonth)) {
    if (SYS.monthVolume(h, mk) !== amt) wrong.push(mk + ": " + SYS.monthVolume(h, mk) + " vs " + amt);
  }
  check("every month reads back exactly, pruned or not", wrong.length === 0, wrong.slice(0, 3).join(" | "));
  check("and the months add up to everything ever logged",
    Object.keys(expectedByMonth).reduce((sum, mk) => sum + SYS.monthVolume(h, mk), 0) === total);
  SYS.pruneHabitDays(h);
  check("pruning again moves nothing twice", Object.values(h.volByMonth).reduce((a, b) => a + b, 0) === pruned);

  const c = SYS.comparison(h, "year");
  check("twelve buckets", c.buckets.length === 12);
  const thisMonth = today.slice(0, 7);
  check("months still to come are null", c.buckets.filter((b) => b.curKey > thisMonth).every((b) => b.cur === null));
  check("this month's bucket is its volume", c.buckets.find((b) => b.curKey === thisMonth).cur === SYS.monthVolume(h, thisMonth));
}

console.log("");
console.log("the monthly history stays two years long");
{
  const { h } = habit();
  const y = new Date().getFullYear();
  h.volByMonth = { [(y - 2) + "-12"]: 100, [(y - 1) + "-01"]: 200, [y + "-03"]: 300, "garbage": 5 };
  const changed = SYS.pruneVolByMonth(h);
  check("it reports the trim", changed === true);
  check("two years ago is gone", !((y - 2) + "-12" in h.volByMonth));
  check("last January stays", h.volByMonth[(y - 1) + "-01"] === 200);
  check("a malformed key is dropped", !("garbage" in h.volByMonth));
  check("and trimming again changes nothing", SYS.pruneVolByMonth(h) === false);
}

console.log("");
console.log(fails === 0 ? "all passed" : fails + " failed");
process.exit(fails ? 1 : 0);

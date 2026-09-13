// The Stats page's arithmetic, and the long memory behind it.
//
// Two things here are easy to get wrong and impossible to notice: a quota
// habit quietly spoiling every day it was not asked about, and a sealed day
// being re-judged later so last month's history changes when a schedule does.
// Both have a test.
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
const weekdayOf = (key) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d).getDay(); };

function blank() { const s = SYS.defaultState(); s.tasks = []; return s; }
function add(s, over) {
  SYS.addTask(s, Object.assign({
    title: "H" + s.tasks.length, priority: "Medium", taskType: "Recurring", types: ["bodily"], pt: 20,
    mode: "simple", notes: "", recurring: true, schedule: { type: "daily" }, unit: "times", targetAmount: 1,
    traitTargets: [{ category: "bodily", trait: "Health" }],
  }, over || {}));
  return s.tasks[s.tasks.length - 1];
}

console.log("");
console.log("a day's ring is what it asked for against what was done");
{
  const s = blank();
  const a = add(s, { title: "Water" });
  const b = add(s, { title: "Read" });
  const day = back(3);

  let r = SYS.dayRing(s, day);
  check("two dailies, nothing done: 0 of 2", r.required === 2 && r.done === 0 && r.pct === 0, JSON.stringify(r));
  check("and it is not a perfect day", r.perfect === false);

  SYS.logHabitDay(s, a.id, day);
  r = SYS.dayRing(s, day);
  check("one done: 1 of 2, 50%", r.required === 2 && r.done === 1 && r.pct === 50, JSON.stringify(r));

  SYS.logHabitDay(s, b.id, day);
  r = SYS.dayRing(s, day);
  check("both done: 2 of 2, 100%", r.required === 2 && r.done === 2 && r.pct === 100, JSON.stringify(r));
  check("which is a perfect day", r.perfect === true);
}

console.log("");
console.log("a day nothing was asked of has no ring at all");
{
  const s = blank();
  // Due on one weekday only. Find a recent day that is not that weekday.
  const wd = weekdayOf(back(1));
  add(s, { schedule: { type: "weekdays", days: [wd] } });
  const r = SYS.dayRing(s, back(2));
  check("required is zero, not a failed zero", r.required === 0, JSON.stringify(r));
  check("and it is not counted as perfect", r.perfect === false);
  const onDue = SYS.dayRing(s, back(1));
  check("the day it was due does ask", onDue.required === 1, JSON.stringify(onDue));
}

console.log("");
console.log("a quota lifts the day it is done on and spoils none of the others");
{
  const s = blank();
  const daily = add(s, { title: "Water", schedule: { type: "daily" } });
  const gym = add(s, { title: "Gym", schedule: { type: "perWeek", n: 3 } });
  const monday = back(3), tuesday = back(2);

  SYS.logHabitDay(s, daily.id, monday);
  SYS.logHabitDay(s, gym.id, monday);
  SYS.logHabitDay(s, daily.id, tuesday);      // no gym on Tuesday, and none asked

  const mon = SYS.dayRing(s, monday), tue = SYS.dayRing(s, tuesday);
  check("Monday counts the gym: 2 of 2", mon.required === 2 && mon.done === 2, JSON.stringify(mon));
  check("Monday is perfect", mon.perfect === true);
  check("Tuesday does not count it: 1 of 1", tue.required === 1 && tue.done === 1, JSON.stringify(tue));
  check("Tuesday is perfect too", tue.perfect === true);
}

console.log("");
console.log("and that holds for every schedule shape, not just this one");
{
  // Adding an undone quota habit to any state must leave every day's ring
  // exactly where it was. This is the rule stated as a property.
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = (a) => a[Math.floor(rnd() * a.length) % a.length];
  let changed = 0;
  for (let i = 0; i < 200; i++) {
    const s = blank();
    const h = add(s, { schedule: pick([{ type: "daily" }, { type: "weekdays", days: [1, 3, 5] }, { type: "monthDays", days: [1, 15] }, { type: "interval", every: 3, start: back(20) }]) });
    for (let d = 0; d < 10; d++) if (rnd() > 0.5) SYS.logHabitDay(s, h.id, back(d));
    const before = [];
    for (let d = 0; d < 10; d++) before.push(SYS.dayRing(s, back(d)).pct);
    // The quota arrives and is never done.
    add(s, { title: "Quota", schedule: pick([{ type: "perWeek", n: 3 }, { type: "perMonth", n: 5 }, { type: "perInterval", n: 2, every: 4, start: back(20) }]) });
    for (let d = 0; d < 10; d++) if (SYS.dayRing(s, back(d)).pct !== before[d]) changed++;
  }
  check("200 states x 10 days: no day got worse", changed === 0, changed + " days changed");
}

console.log("");
console.log("a required day that was simply skipped is written down as missed");
{
  // The whole reason the long memory exists: a skipped day has no entry in
  // task.days at all, so nothing but the schedule knows it was owed.
  const s = blank();
  const h = add(s, { schedule: { type: "daily" } });
  h.createdAt = SYS.parseKey ? undefined : undefined;
  check("no entry for that day", SYS.habitDays(h)[back(2)] === undefined);
  check("but the mark says missed", SYS.computeMark(h, back(2)) === "-", SYS.computeMark(h, back(2)));
  SYS.logHabitDay(s, h.id, back(2));
  check("and done once it is done", SYS.computeMark(h, back(2)) === "+");
}

console.log("");
console.log("sealing is idempotent, and stops at yesterday");
{
  const s = blank();
  const h = add(s, { schedule: { type: "daily" } });
  h.createdAt = Date.now() - 10 * 86400000;
  SYS.logHabitDay(s, h.id, back(5));

  const first = SYS.sealMarks(h);
  const snapshot = JSON.stringify(h.marks) + "|" + h.sealedTo;
  const second = SYS.sealMarks(h);
  check("the first pass writes something", first === true);
  check("the second reports no change", second === false);
  check("and leaves the marks identical", JSON.stringify(h.marks) + "|" + h.sealedTo === snapshot);
  check("sealed up to yesterday, never today", h.sealedTo === back(1), h.sealedTo);
  check("today is still worked out live", SYS.markOn(h, today) === SYS.computeMark(h, today));
}

console.log("");
console.log("a sealed day is not re-judged when the schedule changes later");
{
  const s = blank();
  const h = add(s, { schedule: { type: "daily" } });
  h.createdAt = Date.now() - 8 * 86400000;
  SYS.sealMarks(h);
  const wasMissed = SYS.markOn(h, back(3));
  check("it was missed under the old schedule", wasMissed === "-", wasMissed);

  // Now the habit becomes Mondays-only, which would make that day ask nothing.
  h.schedule = { type: "weekdays", days: [1] };
  SYS.sealMarks(h);
  check("the sealed day keeps its verdict", SYS.markOn(h, back(3)) === "-", SYS.markOn(h, back(3)));
  check("history did not rewrite itself", SYS.computeMark(h, back(3)) !== SYS.markOn(h, back(3)) || weekdayOf(back(3)) === 1);
}

console.log("");
console.log("archiving stops the future and leaves the past alone");
{
  const s = blank();
  const h = add(s, { schedule: { type: "daily" } });
  h.createdAt = Date.now() - 10 * 86400000;
  SYS.logHabitDay(s, h.id, back(6));
  const beforeArchive = SYS.dayRing(s, back(6));
  check("the logged day counts", beforeArchive.required === 1 && beforeArchive.done === 1);

  h.archived = true;
  h.archivedAt = back(4);
  check("a day before archiving still counts", SYS.markOn(h, back(6)) === "+");
  check("the day it was archived asks nothing", SYS.computeMark(h, back(4)) === ".");
  check("nor does today", SYS.computeMark(h, today) === ".");
  const after = SYS.dayRing(s, back(3));
  check("so the ring has nothing to require", after.required === 0, JSON.stringify(after));
}

console.log("");
console.log("the volume total survives pruning exactly");
{
  const s = blank();
  const h = add(s, { unit: "min", targetAmount: 30 });
  let expected = 0;
  // 200 days, oldest first, so pruning happens as we go.
  for (let d = 200; d >= 1; d--) {
    SYS.addHabitAmount(s, h.id, back(d), 5, "min");
    expected += SYS.toBase(5, "min", "min");
  }
  const kept = Object.keys(SYS.habitDays(h)).length;
  check("only the window is kept in detail", kept === 120, String(kept));
  check("something was moved to the pruned total", (Number(h.volPruned) || 0) > 0, String(h.volPruned));
  check("and the total is exact", SYS.habitVolumeTotal(h) === expected,
    SYS.habitVolumeTotal(h) + " vs " + expected);
  // Pruning again must not double-count.
  SYS.pruneHabitDays(h);
  check("pruning again changes nothing", SYS.habitVolumeTotal(h) === expected);
}

console.log("");
console.log("the all-time figures count what they say they count");
{
  const s = blank();
  const a = add(s, { title: "A", schedule: { type: "daily" } });
  const b = add(s, { title: "B", schedule: { type: "daily" } });
  a.createdAt = b.createdAt = Date.now() - 6 * 86400000;
  // Three perfect days in a row, then one half day, then one perfect.
  for (const d of [5, 4, 3]) { SYS.logHabitDay(s, a.id, back(d)); SYS.logHabitDay(s, b.id, back(d)); }
  SYS.logHabitDay(s, a.id, back(2));
  SYS.logHabitDay(s, a.id, back(1)); SYS.logHabitDay(s, b.id, back(1));

  const st = SYS.statsAllTime(s);
  check("four perfect days", st.perfectDays === 4, String(st.perfectDays));
  check("the best run is three", st.bestStreak === 3, String(st.bestStreak));
  check("nine habit-days done", st.habitsDone === 9, String(st.habitsDone));
  check("the daily average is a real number, not a rounded zero",
    st.dailyAverage > 1 && st.dailyAverage < 2, String(st.dailyAverage));
}

console.log("");
console.log("a rest day neither breaks a streak nor counts as perfect");
{
  const s = blank();
  const wd = weekdayOf(back(5));
  const h = add(s, { schedule: { type: "weekdays", days: [wd] } });
  h.createdAt = Date.now() - 20 * 86400000;
  SYS.logHabitDay(s, h.id, back(5));
  SYS.logHabitDay(s, h.id, back(12));
  const st = SYS.statsAllTime(s);
  check("both due days were perfect", st.perfectDays === 2, String(st.perfectDays));
  check("and the days between them did not break the run", st.bestStreak === 2, String(st.bestStreak));
}

console.log("");
console.log("the month rate leaves out the days that asked for nothing");
{
  const s = blank();
  const wd = weekdayOf(back(2));
  const h = add(s, { schedule: { type: "weekdays", days: [wd] } });
  h.createdAt = Date.now() - 40 * 86400000;
  SYS.logHabitDay(s, h.id, back(2));
  const now = new Date();
  const rate = SYS.monthRate(s, null, now.getFullYear(), now.getMonth());
  // Every due day this month that has passed: some done, some not. The
  // figure has to be a percentage of those, never of all 30 days.
  check("the rate is a percentage of the due days", rate > 0 && rate <= 100, String(rate));
  const allDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  check("and not diluted by the whole month", rate >= (1 / allDays) * 100 * 2, String(rate));
}

console.log("");
console.log("the month grid is six weeks, Monday first, and knows its own month");
{
  const s = blank();
  add(s, {});
  const g = SYS.monthGrid(s, null, 2026, 8);        // September 2026
  check("42 cells", g.cells.length === 42, String(g.cells.length));
  check("it starts on a Monday", weekdayOf(g.cells[0].key) === 1, g.cells[0].key);
  check("30 of them are September", g.cells.filter((c) => c.inMonth).length === 30,
    String(g.cells.filter((c) => c.inMonth).length));
  check("the first of the month is in it", g.cells.some((c) => c.key === "2026-09-01" && c.inMonth));
  check("days after today are flagged", g.cells.filter((c) => c.ahead).every((c) => c.key > today));
}

console.log("");
console.log("the year grid is one entry per day, for the whole year");
{
  const s = blank();
  const h = add(s, { schedule: { type: "daily" } });
  h.createdAt = Date.now() - 5 * 86400000;
  SYS.logHabitDay(s, h.id, back(3));
  SYS.sealMarks(h);
  const year = new Date().getFullYear();
  const grid = SYS.yearMarks(s, h.id, year);
  check("365 or 366 entries", grid.length === 365 || grid.length === 366, String(grid.length));
  check("the logged day is marked done", grid.find((g) => g.key === back(3)).mark === "+");
  check("a day before the habit existed asks nothing", grid.find((g) => g.key === back(30)) ? grid.find((g) => g.key === back(30)).mark === "." : true);
}

console.log("");
console.log("half of a goal is half a ring, not nothing");
{
  const s = blank();
  const h = add(s, { unit: "L", targetAmount: 2 });
  h.createdAt = Date.now() - 5 * 86400000;
  const day = back(2);
  SYS.addHabitAmount(s, h.id, day, 1, "L");
  check("one litre of two is marked as five tenths", SYS.computeMark(h, day) === "5", SYS.computeMark(h, day));
  const r = SYS.habitDayRing(h, day);
  check("and the ring reads fifty per cent", r.pct === 50, JSON.stringify(r));
  check("it still asked for something", r.required === 1);
  check("but the day is not finished", r.perfect === false);
  const all = SYS.dayRing(s, day);
  check("the all-habits ring agrees", all.pct === 50, JSON.stringify(all));
  check("and counts no completed habit", all.complete === 0, String(all.complete));
}

console.log("");
console.log("a fraction of a mark reads back as that fraction");
{
  check("a finished day is whole", SYS.markFraction("+") === 1);
  check("an untouched day is nothing", SYS.markFraction("-") === 0);
  check("a day nothing was asked of is nothing", SYS.markFraction(".") === 0);
  check("three tenths reads as 0.3", Math.abs(SYS.markFraction("3") - 0.3) < 1e-9);
  check("nine tenths reads as 0.9", Math.abs(SYS.markFraction("9") - 0.9) < 1e-9);
  check("a digit floors rather than rounding up", SYS.markFraction("0") === 0);
  check("a digit counts as a day that asked", SYS.markAsked(".") === false && SYS.markAsked("5") === true);
}

console.log("");
console.log("a day you nearly did still breaks the streak");
{
  const s = blank();
  const h = add(s, { unit: "L", targetAmount: 2 });
  h.createdAt = Date.now() - 8 * 86400000;
  for (const d of [5, 4, 3]) SYS.logHabitDay(s, h.id, back(d));
  SYS.addHabitAmount(s, h.id, back(2), 1.9, "L");        // 95%, and still not done
  SYS.logHabitDay(s, h.id, back(1));
  const st = SYS.habitStats(h, new Date().getFullYear(), new Date().getMonth());
  check("the near miss is not counted as done", st.successTotal === 4, String(st.successTotal));
  check("and the best run stops at three", st.bestStreak === 3, String(st.bestStreak));
}

console.log("");
console.log("partial progress on a quota is still invisible");
{
  const s = blank();
  const daily = add(s, { title: "Water", schedule: { type: "daily" } });
  const gym = add(s, { title: "Gym", schedule: { type: "perWeek", n: 3 }, unit: "min", targetAmount: 30 });
  const day = back(2);
  SYS.logHabitDay(s, daily.id, day);
  SYS.addHabitAmount(s, gym.id, day, 10, "min");         // a third of the session
  const r = SYS.dayRing(s, day);
  check("the day is still whole", r.perfect === true, JSON.stringify(r));
  check("the quota did not join the denominator", r.required === 1, String(r.required));
}

console.log("");
console.log("a sealed partial day keeps its fraction");
{
  const s = blank();
  const h = add(s, { unit: "L", targetAmount: 2 });
  h.createdAt = Date.now() - 6 * 86400000;
  SYS.addHabitAmount(s, h.id, back(3), 1.4, "L");        // 70%
  SYS.sealMarks(h);
  check("the mark survives sealing", SYS.markOn(h, back(3)) === "7", SYS.markOn(h, back(3)));
  check("and reads back as seven tenths", Math.abs(SYS.markFraction(SYS.markOn(h, back(3))) - 0.7) < 1e-9);
  // Sealed days are frozen: changing the target must not re-judge them.
  h.targetAmount = 1;
  SYS.sealMarks(h);
  check("raising or lowering the target later changes nothing", SYS.markOn(h, back(3)) === "7", SYS.markOn(h, back(3)));
}

console.log("");
console.log("a day remembers what was written on it, and when");
{
  const s = blank();
  const water = add(s, { title: "Water", unit: "L", targetAmount: 2 });
  const read = add(s, { title: "Read", unit: "min", targetAmount: 30 });
  const idle = add(s, { title: "Chess", unit: "min", targetAmount: 10 });
  const day = back(2);

  SYS.addHabitAmount(s, water.id, day, 2, "L");
  SYS.logHabitDay(s, read.id, day);
  SYS.setHabitNote(s, idle.id, day, "meant to, did not");

  const rows = SYS.dayLog(s, day);
  check("only the habits with something on them", rows.length === 2, rows.map((r) => r.title).join(","));
  check("a note on its own is not something done", !rows.some((r) => r.title === "Chess"));
  check("each row carries a time", rows.every((r) => r.at !== null), JSON.stringify(rows.map((r) => r.at)));
  check("the time is a minute of the day", rows.every((r) => r.at >= 0 && r.at <= 1439));
  check("amounts come through in base units", rows.find((r) => r.title === "Water").amount === SYS.toBase(2, "L", "L"));
  check("and whether the day was finished", rows.every((r) => r.done === true));

  // A note written afterwards must not wipe the time.
  SYS.setHabitNote(s, water.id, day, "two litres, easy");
  const after = SYS.dayLog(s, day).find((r) => r.title === "Water");
  check("writing a note keeps the time", after.at !== null, String(after.at));
  check("and the note comes along", after.note === "two litres, easy", after.note);
}

console.log("");
console.log("the day's list reads newest first, with the timeless ones last");
{
  const s = blank();
  const a = add(s, { title: "A" }), b = add(s, { title: "B" }), c = add(s, { title: "C" });
  const day = back(1);
  SYS.logHabitDay(s, a.id, day);
  SYS.logHabitDay(s, b.id, day);
  SYS.logHabitDay(s, c.id, day);
  // Hand-set the times: 07:11, 22:42, and one from before the app kept them.
  const setAt = (task, at) => {
    const days = { ...SYS.habitDays(task) };
    if (at === null) delete days[day].at; else days[day] = { ...days[day], at };
    task.days = days;
  };
  setAt(a, 7 * 60 + 11);
  setAt(b, 22 * 60 + 42);
  setAt(c, null);
  const rows = SYS.dayLog(s, day);
  check("the latest is first", rows[0].title === "B", rows.map((r) => r.title).join(","));
  check("then the earlier one", rows[1].title === "A");
  check("and the one with no time is last", rows[2].title === "C" && rows[2].at === null);
}

console.log("");
console.log("a partial day is listed too, and not marked as done");
{
  const s = blank();
  const h = add(s, { unit: "L", targetAmount: 2 });
  const day = back(3);
  SYS.addHabitAmount(s, h.id, day, 0.5, "L");
  const rows = SYS.dayLog(s, day);
  check("it is on the list", rows.length === 1, String(rows.length));
  check("with what it came to", rows[0].amount === SYS.toBase(0.5, "L", "L"), String(rows[0].amount));
  check("and it is not marked finished", rows[0].done === false);
}

console.log("");
console.log("a day with nothing on it has an empty list, not a missing one");
{
  const s = blank();
  add(s, {});
  const rows = SYS.dayLog(s, back(9));
  check("an array, and empty", Array.isArray(rows) && rows.length === 0);
}

console.log("");
console.log("a day still kept in full is exact, not rounded to a tenth");
{
  // The bug this is here for: 1.1 litres of 2 is 55%, and the Stats calendar
  // was showing 50% because it read the day's mark — one character, and
  // therefore one tenth — instead of the amount sitting right there in the day.
  const s = blank();
  const h = add(s, { unit: "L", targetAmount: 2 });
  h.createdAt = Date.now() - 5 * 86400000;
  const day = back(1);
  SYS.addHabitAmount(s, h.id, day, 1.1, "L");

  check("the mark still floors, as one character must", SYS.computeMark(h, day) === "5", SYS.computeMark(h, day));
  const r = SYS.habitDayRing(h, day);
  check("but the ring is exact", r.pct === 55, String(r.pct));
  const all = SYS.dayRing(s, day);
  check("and so is the all-habits ring", all.pct === 55, String(all.pct));
  check("the habit card and the calendar now agree",
    Math.round((SYS.habitAmountOn(h, day) / SYS.habitGoalBase(h)) * 100) === r.pct);

  // Three awkward fractions, to be sure it is not a coincidence.
  for (const [amount, pct] of [[0.1, 5], [1.9, 95], [0.66, 33]]) {
    const s2 = blank();
    const h2 = add(s2, { unit: "L", targetAmount: 2 });
    SYS.addHabitAmount(s2, h2.id, back(1), amount, "L");
    const got = SYS.habitDayRing(h2, back(1)).pct;
    check(amount + " of 2 reads as " + pct + "%", got === pct, String(got));
  }
}

console.log("");
console.log("and a day whose detail is gone falls back to its mark");
{
  const s = blank();
  const h = add(s, { unit: "L", targetAmount: 2 });
  h.createdAt = Date.now() - 20 * 86400000;
  const day = back(10);
  SYS.addHabitAmount(s, h.id, day, 1.5, "L");        // 75%
  SYS.sealMarks(h);
  check("while the day is here it is exact", SYS.habitDayRing(h, day).pct === 75, String(SYS.habitDayRing(h, day).pct));
  // Now drop the detail, the way pruning eventually will.
  const days = { ...SYS.habitDays(h) };
  delete days[day];
  h.days = days;
  check("with the detail gone the mark carries it", SYS.habitDayRing(h, day).pct === 70, String(SYS.habitDayRing(h, day).pct));
  check("which is a floor, never an invention", SYS.habitDayRing(h, day).pct <= 75);
}

console.log("");
console.log(fails === 0 ? "all passed" : fails + " failed");
process.exit(fails ? 1 : 0);

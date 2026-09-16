// Accounts that behave in ways honest use does not (functions/suspicion.js).
// The point of every test here that expects nothing: an honest person having
// an intense week must not be taken off the ranking.
const path = require("path");
const REPO = path.resolve(__dirname, "..").split(path.sep).join("/") + "/";
const S = require(REPO + "functions/suspicion.js");

let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };

const TODAY = "2026-09-20";
const back = (n) => S.shiftDayKey(TODAY, -n);
const NOW = new Date(TODAY + "T12:00:00Z").getTime();

// ---------------------------------------------------------- effort streak --
const days = (hours, n, gapAt) => {
  const out = {};
  for (let i = 0; i < n; i++) if (i !== gapAt) out[back(i)] = hours;
  return out;
};
check("four heavy days is an intense week, not a flag", S.effortStreak(days(13, 4), TODAY) === null);
check("five heavy days in a row is", !!S.effortStreak(days(13, 5), TODAY));
check("twelve hours exactly is not heavy", S.effortStreak(days(12, 7), TODAY) === null);
check("a day off in the middle breaks the run", S.effortStreak(days(13, 6, 3), TODAY) === null);
check("a run from three weeks ago still counts", !!S.effortStreak(
  Object.fromEntries([20, 21, 22, 23, 24].map((i) => [back(i), 13.5])), TODAY));
check("a run older than the lookback does not",
  S.effortStreak(Object.fromEntries([40, 41, 42, 43, 44].map((i) => [back(i), 13.5])), TODAY) === null);

// --------------------------------------------------------- backfill burst --
const burst = (n, spacingMs) => Array.from({ length: n }, (_, i) => NOW + i * spacingMs);
check("filling in two forgotten days is normal", S.backfillBurst(burst(2, 1000)) === null);
check("nine marks in a minute is still under", S.backfillBurst(burst(9, 1000)) === null);
check("ten past days in a minute is a flag", !!S.backfillBurst(burst(10, 5000)));
check("ten spread over ten minutes is not", S.backfillBurst(burst(10, 60000)) === null);

// -------------------------------------------------------------- daily EXP --
check("a big honest day is under the ceiling", S.dailyExp({ [TODAY]: 1900 }, TODAY) === null);
check("more than the caps allow in one day is a flag", !!S.dailyExp({ [back(2)]: 4000 }, TODAY));
check("only the last week is looked at", S.dailyExp({ [back(9)]: 4000 }, TODAY) === null);

// ------------------------------------------------------------- rejections --
check("one rejected answer is a misunderstanding", S.rejections([NOW - S.DAY_MS], NOW) === null);
check("two within a month is a flag", !!S.rejections([NOW - S.DAY_MS, NOW - 10 * S.DAY_MS], NOW));
check("two, but one of them old, is not", S.rejections([NOW - S.DAY_MS, NOW - 40 * S.DAY_MS], NOW) === null);

// ------------------------------------------------------------ unlock rush --
const rush = (closeCount) => Array.from({ length: 10 }, (_, i) =>
  ({ minutesAfterUnlock: i < closeCount ? 1 : 180, at: NOW + i }));
check("pressing as soon as a task opens, sometimes, is normal", S.unlockRush(rush(6)) === null);
check("doing it for nearly every quest is noted", !!S.unlockRush(rush(7)));
check("…but it never hides an account on its own", S.unlockRush(rush(10)).hides === false);
check("too few quests to judge says nothing", S.unlockRush(rush(7).slice(0, 8)) === null);

// ----------------------------------------------------------------- flags --
const heavy = S.evaluate({ effortDays: days(13, 5) }, TODAY, NOW);
let f = S.nextFlag(null, heavy, NOW);
check("a hiding reason flags and hides the account", f.flag.flagged && f.flag.hidden && f.alert.length === 1);
f = S.nextFlag(f.flag, heavy, NOW + 1000);
check("the same reason again is not a new alert", f.flag.hidden && f.alert.length === 0);
const onlyRush = S.evaluate({ unlockGaps: rush(9) }, TODAY, NOW);
const r = S.nextFlag(null, onlyRush, NOW);
check("a notice-only reason flags without hiding", r.flag.flagged && !r.flag.hidden && r.alert.length === 1);

// Restoring: the same old evidence must not raise the flag again.
const restored = S.afterReview(f.flag, true, NOW + 2000);
check("an admin's restore clears and unhides", !restored.flagged && !restored.hidden);
const again = S.nextFlag(restored, heavy, NOW + 3000);
check("…and the evidence it was cleared over does not bring it back", !again.flag.flagged && again.alert.length === 0);
const newer = S.evaluate({ effortDays: Object.fromEntries([0, 1, 2, 3, 4].map((i) => [S.shiftDayKey("2026-10-10", -i), 13])) },
  "2026-10-10", new Date("2026-10-10T12:00:00Z").getTime());
check("new evidence after the restore does", S.nextFlag(restored, newer, NOW + 30 * S.DAY_MS).flag.hidden);
check("keeping it hidden just records the look", S.afterReview(f.flag, false, NOW).hidden === true);
check("evidence lists stay bounded", S.pushBounded(Array.from({ length: 50 }, (_, i) => i), 99, 20).length === 20);

console.log(fails ? "\n" + fails + " failed" : "\nall passed");
process.exit(fails ? 1 : 0);

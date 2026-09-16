// When a task unlocks, and what a day can hold (functions/effort.js).
//
// The worked example the user and I agreed on is in here verbatim: a 20-hour
// task added at 18:00 with four hours already spent that day unlocks tomorrow
// at 14:00, and finishing a three-hour task tomorrow morning pushes it to
// 03:00 the day after. If either of those two numbers changes, the rule the
// feature was explained with has changed, and that needs saying out loud.
const path = require("path");
const REPO = path.resolve(__dirname, "..").split(path.sep).join("/") + "/";
const E = require(REPO + "functions/effort.js");

let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };
const at = (day, hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return E.stamp(day, h * 60 + m);
};
const show = (s) => (s ? s.dayKey + " " + String(Math.floor(s.minutes / 60)).padStart(2, "0") + ":" + String(s.minutes % 60).padStart(2, "0") : "never");

const D1 = "2026-09-16", D2 = "2026-09-17", D3 = "2026-09-18";

// ------------------------------------------------- the worked example -----
// Twenty hours of effort, added at 18:00, on a day that already holds four.
// Today can give six (18:00 to midnight); tomorrow can give fourteen (the
// cap). Six plus fourteen is twenty, and the fourteenth hour of tomorrow
// lands at 14:00.
const opened = at(D1, "18:00");
const ledgerToday = { [D1]: 4 };
check("20h added at 18:00 with 4h already spent unlocks tomorrow 14:00",
  show(E.unlockAt(opened, 20, 0, ledgerToday)) === D2 + " 14:00", show(E.unlockAt(opened, 20, 0, ledgerToday)));

// Then a three-hour task is finished tomorrow morning. Tomorrow now has only
// eleven left, so three hours of the twenty spill into the day after.
const ledgerPlus3 = { [D1]: 4, [D2]: 3 };
check("…and a 3h task finished tomorrow pushes it to 03:00 the day after",
  show(E.unlockAt(opened, 20, 0, ledgerPlus3)) === D3 + " 03:00", show(E.unlockAt(opened, 20, 0, ledgerPlus3)));

// ------------------------------------------------------- small pieces -----
check("a task with no hours and no days is open at once",
  show(E.unlockAt(at(D1, "09:00"), 0, 0, {})) === D1 + " 09:00");
check("two hours added at 09:00 unlocks at 11:00",
  show(E.unlockAt(at(D1, "09:00"), 2, 0, {})) === D1 + " 11:00");
check("thirty minutes unlocks half an hour later",
  show(E.unlockAt(at(D1, "09:00"), 0.5, 0, {})) === D1 + " 09:30");
check("a day already full pushes even a short task to tomorrow",
  show(E.unlockAt(at(D1, "09:00"), 1, 0, { [D1]: 14 })) === D2 + " 01:00");
check("added at 23:00, six hours cannot finish tonight",
  show(E.unlockAt(at(D1, "23:00"), 6, 0, {})) === D2 + " 05:00");

// ---------------------------------------------------------- the days ------
// A month without sugar has almost no hands-on hours and cannot be finished
// early whatever the hours say.
check("a 30-day challenge unlocks 30 days on, at the same time of day",
  show(E.unlockAt(at(D1, "10:30"), 1, 30, {})) === "2026-10-16 10:30");
check("the later of hours and days wins — days here",
  show(E.unlockAt(at(D1, "10:00"), 2, 3, {})) === "2026-09-19 10:00");
check("…and hours here",
  show(E.unlockAt(at(D1, "10:00"), 40, 1, {})) === D3 + " 12:00");

// ------------------------------------------------------- is it open yet ---
check("not open a minute early", !E.isUnlocked(at(D1, "09:00"), at(D1, "10:59"), 2, 0, {}));
check("open on the minute", E.isUnlocked(at(D1, "09:00"), at(D1, "11:00"), 2, 0, {}));
check("open the next day", E.isUnlocked(at(D1, "09:00"), at(D2, "00:05"), 2, 0, {}));

// ------------------------------------------------------ what was possible --
check("nothing is available before the task existed", E.availableHours(at(D2, "09:00"), at(D1, "23:00"), {}) === 0);
check("six hours are available from 18:00 to midnight", E.availableHours(at(D1, "18:00"), at(D2, "00:00"), {}) === 6);
check("a day that is already full offers nothing",
  E.availableHours(at(D1, "09:00"), at(D1, "23:00"), { [D1]: 14 }) === 0);
check("across two days, each day offers at most the cap",
  E.availableHours(at(D1, "00:00"), at(D2, "23:59"), {}) === 2 * E.DAILY_CAP_HOURS,
  String(E.availableHours(at(D1, "00:00"), at(D2, "23:59"), {})));

// ------------------------------------------------------------ charging ----
check("a quest charges the share just finished", E.chargeFor(20, 0.25) === 5);
check("a habit repeat charges one repeat", E.chargeFor(1.5, 1) === 1.5);
check("a one-minute habit still costs two minutes", E.chargeFor(0.016, 1) === E.MIN_CHARGE_HOURS);
check("so does something estimated at nothing", E.chargeFor(0, 1) === E.MIN_CHARGE_HOURS);
check("fifty trivial habits fill under two hours", 50 * E.MIN_CHARGE_HOURS < 2);

// ------------------------------------------------------------- ledger -----
// Earliest day first: the oldest hours are the ones nothing else can use.
const spent = E.spend({}, at(D1, "18:00"), at(D2, "12:00"), 10);
check("spending fills the opening day first",
  spent.days[D1] === 6 && spent.days[D2] === 4 && spent.unplaced === 0, JSON.stringify(spent));
const spentOverCap = E.spend({ [D1]: 12 }, at(D1, "00:00"), at(D2, "23:00"), 10);
check("no day is filled past the cap",
  spentOverCap.days[D1] === 14 && spentOverCap.days[D2] === 8, JSON.stringify(spentOverCap));
// What does not fit is handed back, never forced in.
const noRoom = E.spend({ [D1]: 14 }, at(D1, "08:00"), at(D1, "20:00"), 3);
check("a charge with nowhere to go comes back unplaced",
  noRoom.unplaced === 3 && noRoom.days[D1] === 14, JSON.stringify(noRoom));
const refunded = E.refund({ [D1]: 6, [D2]: 4 }, at(D2, "12:00"), 4);
check("a refund comes off the latest day first", refunded[D1] === 6 && refunded[D2] === undefined, JSON.stringify(refunded));
const refundedAll = E.refund({ [D1]: 6, [D2]: 4 }, at(D2, "12:00"), 10);
check("refunding everything empties the ledger", Object.keys(refundedAll).length === 0, JSON.stringify(refundedAll));
check("spend then refund is the ledger you started with",
  JSON.stringify(E.refund(E.spend({ [D1]: 2 }, at(D1, "10:00"), at(D1, "20:00"), 5).days, at(D1, "20:00"), 5)) === JSON.stringify({ [D1]: 2 }));
const old = {};
old[E.shiftDayKey(D1, -200)] = 5;
old[D1] = 3;
check("days older than the horizon are dropped", JSON.stringify(E.prune(old, D1)) === JSON.stringify({ [D1]: 3 }));

// -------------------------------------------------------- the honest cap --
// The point of the whole thing: a day cannot hold more than a day of work,
// however many tasks are thrown at it.
let ledger = {};
let refused = 0;
for (let i = 0; i < 30; i++) {
  const r = E.spend(ledger, at(D1, "00:00"), at(D1, "23:59"), 1);
  if (r.unplaced > 0) { refused++; continue; } // the caller would refuse this completion
  ledger = r.days;
}
check("thirty one-hour tasks in one day cannot all be charged to it",
  ledger[D1] === E.DAILY_CAP_HOURS && refused === 16, "charged " + ledger[D1] + ", refused " + refused);

console.log(fails ? "\n" + fails + " failed" : "\nall passed");
process.exit(fails ? 1 : 0);

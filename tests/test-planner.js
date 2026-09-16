// The planner's day list, against the shipped code. Dates are fixed.
const fs = require("fs"), path = require("path"), vm = require("vm");
const REPO = path.resolve(__dirname, "..").split(path.sep).join("/") + "/";
const SYS = {};
let n = 0;
const sb = { SYS, window: {}, console, Math, JSON, Object, Array, Number, String, Boolean, RegExp, Date, Set, Map, Intl,
  crypto: { randomUUID: () => "id" + (++n) } };
vm.createContext(sb);
for (const f of ["constants.js", "engine.js", "planner.js"]) {
  vm.runInContext(fs.readFileSync(path.join(REPO, "js", f), "utf8")
    .replace(/\}\)\(window\.SYS[^)]*\);?\s*$/, "})(SYS);"), sb, { filename: f });
}
let fails = 0;
const check = (name, c, d) => { if (!c) { fails++; console.log("  FAIL  " + name + (d ? "  " + d : "")); } else console.log("  ok    " + name); };

const MON = "2026-09-14", TUE = "2026-09-15", WED = "2026-09-16";
const fresh = () => { const s = {}; SYS.normalizePlanner(s, WED); return s; };

console.log("");
console.log("adding and listing");
{
  const s = fresh();
  check("an empty title is refused", SYS.addTodo(s, { title: "   ", day: WED, today: WED }) === null);
  check("a bad day is refused", SYS.addTodo(s, { title: "x", day: "tomorrow", today: WED }) === null);
  const a = SYS.addTodo(s, { title: "  call   the bank ", day: WED, today: WED, now: 1 });
  const b = SYS.addTodo(s, { title: "buy milk", day: WED, today: WED, now: 2 });
  SYS.addTodo(s, { title: "other day", day: TUE, today: WED, now: 3 });
  check("whitespace is tidied", a.title === "call the bank", a.title);
  check("a long title is cut", SYS.addTodo(s, { title: "y".repeat(500), day: WED, today: WED }).title.length === SYS.PLANNER_TITLE_MAX);
  SYS.toggleTodo(s, a.id, 10);
  const list = SYS.todosOn(s, WED).map((x) => x.title);
  check("open items come before finished ones", list[0] === "buy milk" && list[list.length - 1] === "call the bank", JSON.stringify(list));
  check("only that day's items", SYS.todosOn(s, WED).every((x) => x.day === WED));
  SYS.toggleTodo(s, a.id);
  check("unticking clears the time", !a.done && a.doneAt === null);
  check("rename keeps the item", SYS.renameTodo(s, b.id, "buy oat milk").title === "buy oat milk");
  check("rename to nothing is refused", SYS.renameTodo(s, b.id, "  ") === null && b.title === "buy oat milk");
  check("delete removes it", SYS.deleteTodo(s, b.id) && !SYS.todosOn(s, WED).some((x) => x.id === b.id));
}

console.log("");
console.log("the morning question");
{
  const s = fresh();
  const left = SYS.addTodo(s, { title: "left over", day: MON, today: MON, now: 1 });
  const done = SYS.addTodo(s, { title: "finished", day: MON, today: MON, now: 2 });
  const stay = SYS.addTodo(s, { title: "stays put", day: TUE, today: TUE, now: 3 });
  const today = SYS.addTodo(s, { title: "today's", day: WED, today: WED, now: 4 });
  SYS.toggleTodo(s, done.id);
  const pending = SYS.pendingCarry(s, WED).map((x) => x.id);
  check("unfinished past items are asked about", pending.length === 2 && pending[0] === left.id && pending[1] === stay.id, JSON.stringify(pending));
  check("finished and today's items are not", !pending.includes(done.id) && !pending.includes(today.id));

  const backfilled = SYS.addTodo(s, { title: "written onto yesterday", day: TUE, today: WED });
  check("an item written onto a past day is not asked about", !SYS.pendingCarry(s, WED).some((x) => x.id === backfilled.id));

  const moved = SYS.carryTodos(s, [left.id], WED);
  check("only the chosen one moves", moved === 1 && left.day === WED && stay.day === TUE);
  check("it remembers where it came from", left.from === MON);
  check("nothing is asked twice the same morning", SYS.pendingCarry(s, WED).length === 0);
  check("the one left behind is not asked about again", SYS.pendingCarry(s, "2026-09-17").every((x) => x.id !== stay.id));
  const again = SYS.pendingCarry(s, "2026-09-17").map((x) => x.id);
  check("a moved item left unfinished again is asked about again", again.includes(left.id) && again.includes(today.id), JSON.stringify(again));
  SYS.carryTodos(s, [left.id], "2026-09-17");
  check("moving twice keeps the first day", left.from === MON && left.day === "2026-09-17");
  SYS.toggleTodo(s, done.id);
  check("unticking an old finished item brings the question back", SYS.pendingCarry(s, "2026-09-17").some((x) => x.id === done.id));
}

console.log("");
console.log("normalising");
{
  const s = { planner: { todos: [
    { id: "a", title: "ok", day: WED, createdAt: 1 },
    { id: "a", title: "duplicate id", day: WED },
    { id: "b", title: "", day: WED },
    { id: "c", title: "no day" },
    { id: "d", title: "ancient", day: "2025-01-01" },
    null, "junk",
    { id: "e", title: "kept", day: TUE, done: true, doneAt: 5, extra: "dropped" },
  ] } };
  SYS.normalizePlanner(s, WED);
  const ids = s.planner.todos.map((x) => x.id);
  check("junk, blanks, duplicates and old days are dropped", JSON.stringify(ids) === JSON.stringify(["a", "e"]), JSON.stringify(ids));
  check("unknown fields are dropped", !("extra" in s.planner.todos[1]));
  const once = JSON.stringify(s);
  SYS.normalizePlanner(s, WED);
  check("idempotent", JSON.stringify(s) === once);
  const none = {};
  SYS.normalizePlanner(none, WED);
  check("a state without a planner gets an empty one", Array.isArray(none.planner.todos) && none.planner.todos.length === 0);

  const big = { planner: { todos: [] } };
  for (let i = 0; i < 1600; i++) big.planner.todos.push({ id: "t" + i, title: "x", day: i < 100 ? MON : WED, createdAt: i });
  SYS.normalizePlanner(big, WED);
  check("the cap drops the oldest days first", big.planner.todos.length === 1500 && big.planner.todos.every((x) => x.day === WED), big.planner.todos.length);
}

console.log("");
console.log("events");
{
  const s = fresh();
  const on = (day) => SYS.eventsOn(s, day).map((o) => o.title + (o.allDay ? "" : "@" + o.from + "-" + o.to));
  check("no title is refused", SYS.addEvent(s, { title: " ", start: WED, from: "09:00", to: "10:00" }) === null);
  check("an end before the start is a night, not an error", SYS.eventError({ title: "x", start: WED, from: "22:00", to: "02:00" }) === null);
  check("an end equal to the start is refused", SYS.eventError({ title: "x", start: WED, from: "10:00", to: "10:00" }) === "time");
  check("all-day needs no times", SYS.eventError({ title: "x", start: WED, allDay: true }) === null);

  const once = SYS.addEvent(s, { title: "Dentist", start: WED, from: "16:00", to: "17:00" });
  check("a one-off is on its day only", on(WED).includes("Dentist@16:00-17:00") && on(TUE).length === 0 && on("2026-09-17").length === 0);

  // Lectures Sunday and Tuesday, 10-12, from Sun 13 Sep.
  const lec = SYS.addEvent(s, { title: "Lecture", start: "2026-09-13", from: "10:00", to: "12:00", repeat: { type: "weekly", days: [0, 2] } });
  check("weekly lands on its weekdays", on(TUE).includes("Lecture@10:00-12:00") && on("2026-09-20").includes("Lecture@10:00-12:00") && !on(MON).length && !on(WED).includes("Lecture@10:00-12:00"));
  check("not before its first day", !on("2026-09-08").includes("Lecture@10:00-12:00"));
  check("weekly with no days uses the start's weekday", SYS.addEvent(fresh(), { title: "w", start: WED, from: "08:00", to: "09:00", repeat: { type: "weekly", days: [] } }).repeat.days.join() === "3");

  const monthly = SYS.addEvent(s, { title: "Rent", start: "2026-08-31", allDay: true, repeat: { type: "monthly" } });
  check("monthly keeps its date, on the last day of a shorter month", SYS.eventOccursOn(monthly, "2026-10-31") && SYS.eventOccursOn(monthly, "2026-09-30") && !SYS.eventOccursOn(monthly, "2026-09-01") && !SYS.eventOccursOn(monthly, "2026-10-30"));
  check("february gets the 28th", SYS.eventOccursOn(monthly, "2027-02-28"));
  const lastDay = SYS.addEvent(s, { title: "Close the books", start: "2026-09-10", allDay: true, repeat: { type: "monthly", monthBy: "lastDay" } });
  check("last day of the month", SYS.eventOccursOn(lastDay, "2026-09-30") && SYS.eventOccursOn(lastDay, "2026-10-31") && SYS.eventOccursOn(lastDay, "2027-02-28") && !SYS.eventOccursOn(lastDay, "2026-10-30"));
  // Tue 15 Sep 2026 is the third Tuesday.
  const third = SYS.addEvent(s, { title: "Club", start: TUE, from: "19:00", to: "21:00", repeat: { type: "monthly", monthBy: "weekday" } });
  check("the third Tuesday each month", SYS.eventOccursOn(third, "2026-10-20") && SYS.eventOccursOn(third, "2026-11-17") && !SYS.eventOccursOn(third, "2026-10-13") && !SYS.eventOccursOn(third, "2026-10-21"));
  // Tue 29 Sep 2026 is in the fifth week: it means the last Tuesday.
  const lastTue = SYS.addEvent(fresh(), { title: "Review", start: "2026-09-29", from: "09:00", to: "10:00", repeat: { type: "monthly", monthBy: "weekday" } });
  check("a fifth-week start means the last one", SYS.eventOccursOn(lastTue, "2026-10-27") && SYS.eventOccursOn(lastTue, "2026-12-29") && !SYS.eventOccursOn(lastTue, "2026-10-20"));
  SYS.deleteEvent(s, lastDay.id, lastDay.start, "all");
  SYS.deleteEvent(s, third.id, third.start, "all");
  const daily = SYS.addEvent(s, { title: "Standup", start: MON, from: "09:00", to: "09:15", repeat: { type: "daily", until: WED } });
  check("until is the last day", on(WED).includes("Standup@09:00-09:15") && !on("2026-09-17").includes("Standup@09:00-09:15"));
  check("all-day sorts first", SYS.eventsOn(s, WED)[0].allDay === false ? on(WED)[0] === "Standup@09:00-09:15" : true);

  // This only: a different time on one Tuesday.
  SYS.updateEvent(s, lec.id, TUE, { title: "Lecture (room 2)", start: TUE, from: "11:00", to: "13:00" }, "this");
  check("editing one day changes only that day", on(TUE).includes("Lecture (room 2)@11:00-13:00") && on("2026-09-20").includes("Lecture@10:00-12:00"));
  // This only, moved to another date.
  SYS.updateEvent(s, lec.id, "2026-09-20", { title: "Lecture", start: "2026-09-21", from: "10:00", to: "12:00" }, "this");
  check("moving one day leaves a gap and a one-off", !on("2026-09-20").some((x) => x.startsWith("Lecture")) && on("2026-09-21").includes("Lecture@10:00-12:00"));
  check("the moved one does not repeat", !on("2026-09-28").includes("Lecture@10:00-12:00") && on("2026-09-27").includes("Lecture@10:00-12:00"));

  // This and following, from Tue 29 Sep: a new time.
  SYS.updateEvent(s, lec.id, "2026-09-29", { title: "Lecture", start: "2026-09-29", from: "14:00", to: "16:00", repeat: { type: "weekly", days: [0, 2] } }, "following");
  check("following changes from that day on", on("2026-09-29").includes("Lecture@14:00-16:00") && on("2026-10-04").includes("Lecture@14:00-16:00"));
  check("and leaves the days before alone", on("2026-09-27").includes("Lecture@10:00-12:00") && on(TUE).includes("Lecture (room 2)@11:00-13:00"));
  check("with no double on the split day", on("2026-09-29").filter((x) => x.startsWith("Lecture")).length === 1);

  // Following on the very first day edits the whole series in place.
  const d2 = SYS.addEvent(s, { title: "Gym", start: MON, from: "18:00", to: "19:00", repeat: { type: "daily" } });
  const before = s.planner.events.length;
  SYS.updateEvent(s, d2.id, MON, { title: "Gym", start: MON, from: "19:00", to: "20:00", repeat: { type: "daily" } }, "following");
  check("following from the first day is an in-place edit", s.planner.events.length === before && on(WED).includes("Gym@19:00-20:00"));

  // Deletes.
  SYS.deleteEvent(s, d2.id, TUE, "this");
  check("delete this day only", !on(TUE).includes("Gym@19:00-20:00") && on(WED).includes("Gym@19:00-20:00"));
  SYS.deleteEvent(s, d2.id, "2026-09-18", "following");
  check("delete following ends it the day before", on("2026-09-17").includes("Gym@19:00-20:00") && !on("2026-09-18").includes("Gym@19:00-20:00"));
  SYS.deleteEvent(s, once.id, WED, "this");
  check("deleting a one-off removes it", !SYS.findEvent(s, once.id));
  SYS.deleteEvent(s, d2.id, MON, "following");
  check("delete following from the first day removes the series", !SYS.findEvent(s, d2.id));

  const night = SYS.addEvent(s, { title: "Night shift", start: "2026-09-18", from: "22:00", to: "06:00", repeat: { type: "none" } });
  const fri = SYS.timelineOn(s, "2026-09-18").timed.find((o) => o.id === night.id);
  const sat = SYS.timelineOn(s, "2026-09-19").timed.find((o) => o.id === night.id);
  check("a night is drawn to midnight on its day", fri && fri.overnight && fri.segFrom === "22:00" && fri.segTo === "24:00" && !fri.spill);
  check("and carried into the next morning", sat && sat.spill && sat.segFrom === "00:00" && sat.segTo === "06:00" && sat.day === "2026-09-18");
  check("the morning part is not a second event", SYS.eventsOn(s, "2026-09-19").every((o) => o.id !== night.id));
  SYS.deleteEvent(s, night.id, night.start, "all");

  const snap = JSON.stringify(s.planner);
  SYS.normalizePlanner(s, WED);
  check("normalising a good planner changes nothing", JSON.stringify(s.planner) === snap);
}

console.log("");
console.log("laying out a day");
{
  const occ = (title, from, to) => ({ title, from, to, allDay: false });
  const out = SYS.layoutDay([occ("a", "09:00", "10:00"), occ("b", "09:30", "11:00"), occ("c", "10:00", "10:30"), occ("d", "12:00", "13:00")]);
  const by = Object.fromEntries(out.map((o) => [o.title, o.col + "/" + o.cols]));
  check("overlaps share columns", by.a === "0/2" && by.b === "1/2" && by.c === "0/2", JSON.stringify(by));
  check("a lone event takes the full width", by.d === "0/1", JSON.stringify(by));
}

console.log("");
console.log(fails ? fails + " FAIL" : "all passed");
process.exit(fails ? 1 : 0);

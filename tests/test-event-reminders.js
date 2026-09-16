// Planner event reminders. The occurrence rules exist twice — js/planner.js
// for the app, functions/event-reminders.js for the scheduler — so the first
// half walks both across real dates and requires them to agree on every day.
// The second half checks when the scheduler sends.
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
const ER = require(REPO + "functions/event-reminders.js");

let fails = 0;
const check = (name, c, d) => { if (!c) { fails++; console.log("  FAIL  " + name + (d ? "  " + d : "")); } else console.log("  ok    " + name); };

console.log("");
console.log("the app and the scheduler agree on which days an event happens");
{
  const s = {};
  SYS.normalizePlanner(s, "2026-09-16");
  const inputs = [
    { title: "once", start: "2026-09-16", from: "10:00", to: "11:00" },
    { title: "daily", start: "2026-09-10", from: "07:00", to: "07:30", repeat: { type: "daily", until: "2026-10-05" } },
    { title: "weekly", start: "2026-09-13", from: "10:00", to: "12:00", repeat: { type: "weekly", days: [0, 2, 5] } },
    { title: "weekly-default", start: "2026-09-16", from: "10:00", to: "12:00", repeat: { type: "weekly" } },
    { title: "monthly-31", start: "2026-01-31", allDay: true, repeat: { type: "monthly" } },
    { title: "monthly-3rd-tue", start: "2026-09-15", from: "19:00", to: "21:00", repeat: { type: "monthly", monthBy: "weekday" } },
    { title: "monthly-last-tue", start: "2026-09-29", from: "19:00", to: "21:00", repeat: { type: "monthly", monthBy: "weekday" } },
    { title: "monthly-lastday", start: "2026-02-10", allDay: true, repeat: { type: "monthly", monthBy: "lastDay" } },
    { title: "night", start: "2026-09-18", from: "22:00", to: "02:00", repeat: { type: "weekly", days: [5] } },
  ];
  const events = inputs.map((i) => SYS.addEvent(s, i));
  // A skipped day and a one-day edit on the weekly one.
  SYS.deleteEvent(s, events[2].id, "2026-09-20", "this");
  SYS.updateEvent(s, events[2].id, "2026-09-22", { title: "moved lecture", start: "2026-09-22", from: "13:00", to: "14:00" }, "this");
  const stored = JSON.parse(JSON.stringify(s.planner.events));
  let disagreements = [];
  for (let d = 0; d < 800; d++) {
    const day = SYS.shiftDay("2026-01-01", d);
    stored.forEach((ev) => {
      const app = SYS.eventOccursOn(ev, day);
      const server = ER.occursOn(ev, day);
      if (app !== server) disagreements.push(ev.title + " " + day + " app=" + app + " server=" + server);
    });
  }
  check("every event, every day of 800", disagreements.length === 0, disagreements.slice(0, 5).join("; "));
  const edited = ER.occurrenceOn(stored.find((e) => e.title === "weekly"), "2026-09-22");
  check("the server reads a day's own edit", edited && edited.title === "moved lecture" && edited.from === "13:00");
  check("reminders are cleaned the same way", JSON.stringify(SYS.cleanEventReminders([30, "10", 0, 30, -5, 99999, 1.5, 1440, 60, 5])) ===
    JSON.stringify(ER.reminderOffsets({ reminders: [30, "10", 0, 30, -5, 99999, 1.5, 1440, 60, 5] })));
}

console.log("");
console.log("when the scheduler sends");
{
  // 2026-09-16 in UTC; the zone is UTC so local time is the clock below.
  const at = (hhmm, day) => new Date((day || "2026-09-16") + "T" + hhmm + ":00Z");
  const state = { planner: { events: [
    { id: "a", title: "Dentist", start: "2026-09-16", from: "16:00", to: "17:00", repeat: { type: "none" }, reminders: [0, 30, 1440] },
    { id: "b", title: "Rent", start: "2026-09-17", allDay: true, repeat: { type: "none" }, reminders: [0, 1440] },
    { id: "c", title: "No reminders", start: "2026-09-16", from: "16:00", to: "17:00", repeat: { type: "none" } },
    { id: "d", title: "Standup", start: "2026-09-01", from: "09:00", to: "09:15", repeat: { type: "daily" }, skip: ["2026-09-16"], reminders: [10] },
  ] }, settings: { language: "en" } };
  const send = (now, sent) => ER.explainEventReminders(state, now, "UTC", 5, sent).candidates.filter((c) => c.reason === "send").map((c) => c.event.id + "@" + c.day + "-" + c.offset);

  check("30 minutes before", JSON.stringify(send(at("15:30"))) === JSON.stringify(["a@2026-09-16-30"]), JSON.stringify(send(at("15:30"))));
  check("still caught by a run a few minutes late", send(at("15:33")).includes("a@2026-09-16-30"));
  check("not before its time", send(at("15:29")).length === 0);
  check("not once the window has passed", !send(at("15:36")).includes("a@2026-09-16-30"));
  check("at the start", send(at("16:00")).includes("a@2026-09-16-0"));
  check("an all-day event a day before counts from 09:00", send(at("09:00")).includes("b@2026-09-17-1440"));
  check("and on its day at 09:00", send(at("09:00", "2026-09-17")).includes("b@2026-09-17-0"));
  check("a skipped day does not remind", !send(at("08:50")).some((x) => x.startsWith("d@2026-09-16")));
  check("the next day does", send(at("08:50", "2026-09-17")).includes("d@2026-09-17-10"));
  check("an event without reminders never sends", !send(at("16:00")).some((x) => x.startsWith("c@")));
  const once = ER.explainEventReminders(state, at("15:30"), "UTC", 5).candidates.map((c) => c.key);
  check("what was sent is not sent again", send(at("15:32"), once).length === 0);
  check("the day before's 16:00 reminder for a 16:00 event the next day", (() => {
    const s2 = { planner: { events: [{ id: "e", title: "Flight", start: "2026-09-17", from: "16:00", to: "18:00", repeat: { type: "none" }, reminders: [1440] }] } };
    return ER.explainEventReminders(s2, at("16:00"), "UTC", 5).candidates.some((c) => c.day === "2026-09-17" && c.offset === 1440);
  })());
  // Just after midnight, yesterday's last minutes are not looked back into.
  const late = { planner: { events: [{ id: "f", title: "Late", start: "2026-09-16", from: "23:59", to: "23:59", repeat: { type: "none" }, reminders: [0] }] } };
  late.planner.events[0].to = "00:30";
  check("no reaching back across midnight", ER.explainEventReminders(late, at("00:02", "2026-09-17"), "UTC", 5).candidates.length === 0);
  // In a zone, "16:00" is that zone's afternoon.
  const amman = ER.explainEventReminders(state, new Date("2026-09-16T12:30:00Z"), "Asia/Amman", 5).candidates.map((c) => c.event.id + "-" + c.offset);
  check("local time in the person's zone", amman.includes("a-30"), JSON.stringify(amman));

  const one = ER.explainEventReminders(state, at("15:30"), "UTC", 5).candidates;
  const p1 = ER.eventPayload(one, "en");
  check("one event: its title and when", p1.title === "Dentist" && p1.body === "In 30 min · 16:00–17:00" && p1.url === "./#planner", JSON.stringify(p1));
  const ar = ER.eventPayload(one, "ar");
  check("in the account's language", ar.body.indexOf("بعد 30 دقيقة") === 0, ar.body);
  const two = ER.eventPayload([one[0], { occ: { title: "Gym" }, offset: 0 }], "en");
  check("several at once: one notification", two.title === "2 events" && two.body === "Dentist · Gym", JSON.stringify(two));
}

console.log("");
console.log(fails ? fails + " FAIL" : "all passed");
process.exit(fails ? 1 : 0);

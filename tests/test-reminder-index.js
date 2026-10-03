// The reminder index (functions/reminder-index.js) may only ever say "maybe":
// every reminder the scheduler would consider at a moment must be found by
// it, or that reminder silently never comes. Checked as a property: random
// habits and events, random zones, random moments — including both
// daylight-saving nights — and whenever explainReminders or
// explainEventReminders has a candidate, the account's slots must meet the
// window's.
const path = require("path");
const REPO = path.resolve(__dirname, "..").split(path.sep).join("/") + "/";
const RI = require(REPO + "functions/reminder-index.js");
const R = require(REPO + "functions/reminders.js");
const ER = require(REPO + "functions/event-reminders.js");

let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };

console.log("");
console.log("what goes into an account's slots");
{
  const state = {
    tasks: [
      { id: "h1", recurring: true, reminders: ["07:00", "21:30"] },
      { id: "h2", recurring: true, remindAt: "06:15" },
      { id: "q1", recurring: false, reminders: ["08:05"] },
    ],
  };
  const events = [
    { id: "e1", start: "2026-10-01", from: "00:10", reminders: [30, 0] },
    { id: "e2", start: "2026-10-01", allDay: true, reminders: [60] },
    { id: "e3", start: "2026-10-01", from: "10:00", reminders: [1440], edits: { "2026-10-08": { from: "11:30" } } },
  ];
  const times = RI.localTimes(state, events);
  const has = (t) => times.indexOf(t) >= 0;
  check("each habit time, the older single time too", has("07:00") && has("21:30") && has("06:15"));
  check("not a quest's", !has("08:05"));
  check("an event reminder that crosses midnight lands on the evening before", has("23:40") && has("00:10"));
  check("an all-day event counts from 09:00", has("08:00"));
  check("a day's edited start counts too", has("10:00") && has("11:30"));
  check("slots per zone", JSON.stringify(RI.slotsFor(["07:00"], ["Asia/Amman", "UTC"])) === JSON.stringify(["Asia/Amman|07:00", "UTC|07:00"]));
  check("zones from the devices, UTC when one has none", JSON.stringify(RI.zonesOf([{ tz: "Asia/Amman" }, {}, { tz: "Asia/Amman" }])) === JSON.stringify(["Asia/Amman", "UTC"]));
  check("chunks of thirty", RI.chunks(Array.from({ length: 65 }, (_, i) => i), 30).map((c) => c.length).join(",") === "30,30,5");
}

console.log("");
console.log("the window");
{
  const now = new Date(Date.UTC(2026, 9, 3, 21, 3)); // 00:03 in Amman (UTC+3)
  const w = RI.windowSlots(now, "Asia/Amman", 10);
  check("ten local minutes ending now", w.length === 10 && w[0] === "Asia/Amman|00:03" && w[9] === "Asia/Amman|23:54", JSON.stringify(w));
}

console.log("");
console.log("never a reminder the index misses");
{
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const time = () => String(Math.floor(rnd() * 24)).padStart(2, "0") + ":" + String(Math.floor(rnd() * 60)).padStart(2, "0");
  const zones = ["Asia/Amman", "UTC", "America/New_York", "Europe/Berlin", "Asia/Kolkata", "Pacific/Auckland", "America/Los_Angeles"];
  const day = (base, add) => { const d = new Date(Date.UTC(2026, base, 1 + add)); return d.toISOString().slice(0, 10); };
  // Moments spread over the year, plus the two nights the clocks change in
  // New York, Berlin and Auckland.
  const moments = [];
  for (let i = 0; i < 400; i++) moments.push(new Date(Date.UTC(2026, 0, 1) + rnd() * 365 * 86400000));
  [Date.UTC(2026, 2, 8, 7, 0), Date.UTC(2026, 10, 1, 6, 0), Date.UTC(2026, 2, 29, 1, 0), Date.UTC(2026, 9, 25, 1, 0),
    Date.UTC(2026, 3, 4, 14, 0), Date.UTC(2026, 8, 26, 14, 0)].forEach((t) => { for (let k = -30; k <= 90; k += 3) moments.push(new Date(t + k * 60000)); });

  let checked = 0, missed = 0, example = "";
  for (let trial = 0; trial < 3000; trial++) {
    const tasks = [];
    for (let i = 0; i < 1 + Math.floor(rnd() * 3); i++) {
      tasks.push({ id: "h" + i, recurring: true, schedule: { type: "daily" }, reminders: [time(), time()].slice(0, 1 + Math.floor(rnd() * 2)) });
    }
    const events = [];
    for (let i = 0; i < Math.floor(rnd() * 3); i++) {
      const allDay = rnd() < 0.2;
      events.push({
        id: "e" + i, start: day(Math.floor(rnd() * 12), 0), allDay, from: allDay ? undefined : time(),
        repeat: { type: pick(["none", "daily", "weekly"]) },
        reminders: [pick([0, 5, 15, 30, 60, 120, 1440, 2880])],
      });
    }
    const state = { tasks, planner: { events } };
    const subs = [{ tz: pick(zones) }, { tz: pick(zones) }].slice(0, 1 + Math.floor(rnd() * 2));
    const slots = new Set(RI.slotsFor(RI.localTimes(state, []), RI.zonesOf(subs)));
    // Half the moments are chosen near one of the account's own times, so the
    // cases that matter — something actually due — are common rather than rare.
    const own = RI.localTimes(state, []);
    for (let m = 0; m < 8; m++) {
      let now = pick(moments);
      if (m % 2 && own.length) {
        const z = pick(subs).tz, t = pick(own);
        const local = R.localParts(now, z).hhmm;
        const diff = (Number(t.slice(0, 2)) * 60 + Number(t.slice(3))) - (Number(local.slice(0, 2)) * 60 + Number(local.slice(3)));
        now = new Date(now.getTime() + (diff + Math.floor(rnd() * 12)) * 60000);
      }
      subs.forEach((s) => {
        const h = R.explainReminders(state, now, s.tz, 10).candidates.length;
        const e = ER.explainEventReminders(state, now, s.tz, 10).candidates.length;
        if (!h && !e) return;
        checked++;
        const hit = RI.windowSlots(now, s.tz, 10).some((k) => slots.has(k));
        if (!hit) { missed++; if (!example) example = s.tz + " " + now.toISOString() + " " + JSON.stringify(state).slice(0, 300); }
      });
    }
  }
  check("every moment the scheduler had something to consider, the index found the account (" + checked + " cases)", checked > 50 && missed === 0, missed + " missed: " + example);
}

console.log("");
console.log(fails ? fails + " FAIL" : "all passed");
process.exit(fails ? 1 : 0);

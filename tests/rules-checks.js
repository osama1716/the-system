// The Firestore security rules, against the real rules engine in the local
// emulator. Not run directly: tests/test-rules.js starts the emulator and runs
// this inside it. No packages — plain HTTP to the emulator's REST interface.
//
// A person is a token the emulator reads without checking a signature; the
// token "owner" is the emulator's own bypass, used only to put test data in.
"use strict";
const HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const PROJECT = process.env.GCLOUD_PROJECT || "demo-the-system";
const BASE = "http://" + HOST + "/v1/projects/" + PROJECT + "/databases/(default)/documents";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const token = (uid, claims) => b64({ alg: "none", typ: "JWT" }) + "." + b64({ user_id: uid, sub: uid, ...claims }) + ".";
const who = {
  anon: null,
  u1: token("u1"),
  u2: token("u2"),
  admin: token("boss", { admin: true }),
  seed: "owner",
};

async function call(person, method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (who[person]) headers.Authorization = "Bearer " + who[person];
  const res = await fetch(path.startsWith("http") ? path : BASE + "/" + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return res.status;
}
const read = (person, path) => call(person, "GET", path);
const str = (s) => ({ stringValue: s });
const map = (o) => ({ mapValue: { fields: o } });
// A write through :commit, so updatedAt can be the server's request time.
const write = (person, path, fields, withTime = true) => call(person, "POST", BASE + ":commit", {
  writes: [{
    update: { name: "projects/" + PROJECT + "/databases/(default)/documents/" + path, fields },
    ...(withTime ? { updateTransforms: [{ fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }] } : {}),
  }],
});
const del = (person, path) => call(person, "DELETE", path);

// Any JSON value in the REST interface's typed form.
const val = (v) => v === null ? { nullValue: null }
  : typeof v === "boolean" ? { booleanValue: v }
  : typeof v === "number" ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
  : typeof v === "string" ? { stringValue: v }
  : Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
  : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } };

// The app's own planner code, for the shape it sends (toWire, LIMITS).
function plannerApp() {
  const fs = require("fs"), path = require("path"), vm = require("vm");
  const SYS = {};
  const sb = { SYS, window: { localStorage: { getItem: () => null, setItem: () => {} } }, console, Math, JSON, Object, Array, Number, String, Boolean, RegExp, Date, Set, Map, Intl,
    crypto: { randomUUID: () => "id" }, setTimeout: () => 0, clearTimeout: () => {} };
  vm.createContext(sb);
  for (const f of ["constants.js", ...require("./engine-files"), "planner.js", "planner-sync.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8")
      .replace(/\}\)\(window\.SYS[^)]*\);?\s*$/, "})(SYS);"), sb, { filename: f });
  }
  return SYS.PlannerSync.core;
}

const validState = () => ({ state: map({ schema: { integerValue: "1" }, tasks: { arrayValue: { values: [] } } }) });

const results = [];
const expect = (name, got, want) => results.push({ name, got, want, ok: want === "ok" ? got === 200 : got === 403 });

(async () => {
  // data to read: the emulator's bypass writes without rules
  for (const [path, fields] of [
    ["users/u1", { state: map({ schema: { integerValue: "1" } }) }],
    ["wallets/u1", { gold: { integerValue: "100" } }],
    ["leaderboard/u1", { totalExp: { integerValue: "5" } }],
    ["config/secret", { key: str("x") }],
    ["usernames/osama", { uid: str("u1") }],
    ["capTests/u1", { memory: map({ nextAt: { integerValue: "0" } }) }],
    ["capStats/memory", { bands: map({}) }],
    ["users/u1/inbox/m1", { text: str("hi"), read: { booleanValue: false } }],
    ["subscriptions/u1", { active: { booleanValue: true }, plan: str("monthly") }],
    ["paddleSubs/sub_1", { uid: str("u1"), status: str("active") }],
  ]) await write("seed", path, fields, false);

  // --- the user document
  expect("anyone not signed in cannot read a user's state", await read("anon", "users/u1"), "deny");
  expect("a user reads their own state", await read("u1", "users/u1"), "ok");
  expect("a user cannot read someone else's state", await read("u2", "users/u1"), "deny");
  expect("the admin can read a user's state", await read("admin", "users/u1"), "ok");
  expect("a user saves a valid state of their own", await write("u1", "users/u1", validState()), "ok");
  expect("a user cannot save into someone else's document", await write("u2", "users/u1", validState()), "deny");
  expect("the admin cannot write a user's state", await write("admin", "users/u1", validState()), "deny");
  expect("a save with an extra top-level field is refused", await write("u1", "users/u1", { ...validState(), gold: { integerValue: "999999" } }), "deny");
  expect("a save with a field the state does not have is refused", await write("u1", "users/u1",
    { state: map({ schema: { integerValue: "1" }, wallet: map({ gold: { integerValue: "999999" } }) }) }), "deny");
  expect("a save without the server's time as updatedAt is refused", await write("u1", "users/u1", validState(), false), "deny");
  expect("nobody deletes a user document", await del("u1", BASE + "/users/u1"), "deny");

  // --- money and ranking: the server writes, people only look
  expect("a user reads their own wallet", await read("u1", "wallets/u1"), "ok");
  expect("a user cannot read someone else's wallet", await read("u2", "wallets/u1"), "deny");
  expect("a user cannot write their own wallet", await write("u1", "wallets/u1", { gold: { integerValue: "99999999" } }, false), "deny");
  // A test under way holds its own answers, so not even its owner reads it.
  expect("a user cannot read their own capability test", await read("u1", "capTests/u1"), "deny");
  expect("a user cannot write their own capability test", await write("u1", "capTests/u1", { memory: map({ nextAt: { integerValue: "0" } }) }, false), "deny");
  expect("a user cannot read the age-band spans", await read("u1", "capStats/memory"), "deny");
  expect("a user cannot write the age-band spans", await write("u1", "capStats/memory", { bands: map({}) }, false), "deny");
  expect("a user cannot clear their trial notices", await write("u1", "trialNotices/u1", { d2: { integerValue: "0" } }, false), "deny");
  // A subscription is written by the payments webhook only (functions/access.js reads it).
  expect("a user cannot give themselves a subscription", await write("u1", "subscriptions/u1", { active: { booleanValue: true } }, false), "deny");
  expect("a user reads their own subscription", await read("u1", "subscriptions/u1"), "ok");
  expect("a user cannot read someone else's subscription", await read("u2", "subscriptions/u1"), "deny");
  expect("nobody reads the webhook's own records", await read("u1", "paddleSubs/sub_1"), "deny");
  expect("a signed-in user reads the leaderboard", await read("u2", "leaderboard/u1"), "ok");
  expect("a visitor cannot read the leaderboard", await read("anon", "leaderboard/u1"), "deny");
  expect("a user cannot write to the leaderboard", await write("u1", "leaderboard/u1", { totalExp: { integerValue: "99999999" } }, false), "deny");
  expect("a user cannot write their own exp events", await write("u1", "users/u1/expEvents/e1", { amount: { integerValue: "9999" } }, false), "deny");
  expect("a user cannot grant themselves a pending grant", await write("u1", "users/u1/pendingGrants/g1", { exp: { integerValue: "9999" } }, false), "deny");

  // --- a device's reminder subscription: its zone joins the list the scheduler walks every minute
  const device = (tz) => ({ endpoint: str("https://fcm.googleapis.com/fcm/send/abc"), p256dh: str("k"), auth: str("a"), tz: str(tz) });
  expect("a device saves its subscription with its zone", await write("u1", "users/u1/pushSubs/d1", device("Asia/Amman")), "ok");
  expect("a three-part zone is a zone too", await write("u1", "users/u1/pushSubs/d2", device("America/Argentina/Buenos_Aires")), "ok");
  expect("a zone with a space in it is refused", await write("u1", "users/u1/pushSubs/d3", device("Asia/Amman junk")), "deny");
  expect("a zone longer than any real one is refused", await write("u1", "users/u1/pushSubs/d4", device("z".repeat(41))), "deny");
  expect("a user cannot add a device to someone else's account", await write("u2", "users/u1/pushSubs/d5", device("UTC")), "deny");

  // --- the inbox: its owner marks a message read, and nothing else
  expect("a user marks their message read", await write("u1", "users/u1/inbox/m1", { text: str("hi"), read: { booleanValue: true } }, false), "ok");
  expect("'read' is only ever true or false", await write("u1", "users/u1/inbox/m1", { text: str("hi"), read: str("x".repeat(5000)) }, false), "deny");
  expect("a user cannot rewrite the message itself", await write("u1", "users/u1/inbox/m1", { text: str("changed"), read: { booleanValue: true } }, false), "deny");

  // --- the planner: every field of an item is bounded (LIMITS in js/planner-sync.js)
  {
    const P = plannerApp();
    const L = P.LIMITS;
    const planner = (person, id, kind, data, deleted = false) => call(person, "POST", BASE + ":commit", {
      writes: [{
        update: { name: "projects/" + PROJECT + "/databases/(default)/documents/users/u1/plannerItems/" + id,
          fields: { kind: val(kind), data: val(data), u: val(5), deleted: val(deleted) } },
        updateTransforms: [{ fieldPath: "s", setToServerValue: "REQUEST_TIME" }],
      }],
    });
    const days = (n) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2020, 0, 1) + i * 86400000).toISOString().slice(0, 10));
    const todo = P.toWire("todo", { id: "t1", title: "Call the bank", day: "2026-09-18", done: false, createdAt: 1 });
    const series = P.toWire("event", { id: "e1", title: "Gym", start: "2026-01-05", from: "18:00", to: "19:00", span: 0,
      repeat: { type: "weekly", days: [1, 3], until: null }, skip: ["2026-01-07"], reminders: [10],
      edits: { "2026-01-12": { title: "Gym | legs", from: "07:00", to: "08:00" } }, createdAt: 1 });
    const huge = { ...series, title: "x".repeat(900), skip: days(1500), reminders: [1, 2, 3, 4, 5, 6], edits: {} };
    days(900).forEach((k) => { huge.edits[k] = { title: "y".repeat(300), from: "07:00", to: "08:00" }; });
    const biggest = P.toWire("event", huge);
    expect("a user saves a to-do", await planner("u1", "t1", "todo", todo), "ok");
    expect("a user saves a series with a changed day", await planner("u1", "e1", "event", series), "ok");
    expect("the biggest item the app can send is taken", await planner("u1", "e2", "event", biggest), "ok");
    expect("a deleted item is saved as an empty tombstone", await planner("u1", "e1", "event", {}, true), "ok");
    expect("an event from a device on the old app, with no changed days, is taken", await planner("u1", "e3", "event", { ...series, edits: {} }), "ok");
    expect("a user cannot save into someone else's planner", await planner("u2", "t2", "todo", todo), "deny");
    expect("a tombstone carrying data is refused", await planner("u1", "e4", "event", series, true), "deny");
    expect("a title over the app's 200 is refused", await planner("u1", "t3", "todo", { ...todo, title: "x".repeat(L.title + 1) }), "deny");
    expect("a field the planner does not have is refused", await planner("u1", "t4", "todo", { ...todo, note: "x" }), "deny");
    expect("a yes/no field carrying text is refused", await planner("u1", "t5", "todo", { ...todo, done: "x".repeat(5000) }), "deny");
    expect("one skipped day too many is refused", await planner("u1", "e5", "event", { ...series, skip: days(L.skip + 1) }), "deny");
    expect("changed days over their length are refused", await planner("u1", "e6", "event",
      { ...series, edits: [biggest.edits.join("").slice(0, 200)].concat(biggest.edits) }), "deny");
    expect("one changed day too many is refused", await planner("u1", "e10", "event",
      { ...series, edits: days(L.edits + 1).map((k) => k + "|||") }), "deny");
    expect("changed days as a map, where rules cannot measure them, are refused", await planner("u1", "e7", "event",
      { ...series, edits: { "2026-01-12": { title: "x".repeat(5000) } } }), "deny");
    expect("a reminder that is not a number is refused", await planner("u1", "e8", "event", { ...series, reminders: [{ big: "x" }] }), "deny");
    expect("a repeat with a field of its own is refused", await planner("u1", "e9", "event", { ...series, repeat: { ...series.repeat, junk: "x".repeat(5000) } }), "deny");
  }

  // --- server-only collections
  expect("nobody reads the server's config, admin included", await read("admin", "config/secret"), "deny");
  expect("a user cannot claim a username directly", await write("u2", "usernames/osama", { uid: str("u2") }, false), "deny");
  expect("a user reads a username's owner when signed in", await read("u2", "usernames/osama"), "ok");
  expect("a visitor cannot read usernames", await read("anon", "usernames/osama"), "deny");

  results.filter((r) => !r.ok).forEach((r) => console.log("  FAIL  " + r.name + " (got HTTP " + r.got + ", wanted " + (r.want === "ok" ? "allowed" : "refused") + ")"));
  const bad = results.filter((r) => !r.ok).length;
  console.log(bad ? bad + " bugs" : "all passed — " + results.length + " rule checks");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log("FAIL  " + (e && e.stack || e)); process.exit(1); });

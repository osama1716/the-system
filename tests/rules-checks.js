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

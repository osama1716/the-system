// AI valuations a day by who is asking (2026-10-23):  node tests/test-trial-cap.js
//
// Subscribers and admins keep 10 a day; everyone else — an account in its
// trial, and everyone while the paywall is still off — gets 3. The rule is
// read (functions/access.js standing, ai-config evaluationsPerDay), played on
// the real requireEntitled and consumeEvaluationQuota with an in-memory
// Firestore, and each of the four AI callables is held to passing it on.
"use strict";
const Module = require("module");
const path = require("path");

let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };
const REPO = path.resolve(__dirname, "..");
const AI = require(path.join(REPO, "functions", "ai-config.js"));
const ACCESS = require(path.join(REPO, "functions", "access.js"));

console.log("");
console.log("the rule");
{
  const now = Date.UTC(2026, 9, 23);
  const s = (o) => ACCESS.standing({ now, createdAt: NaN, isAdmin: false, subscription: null, ...o });
  check("an admin is an admin", s({ isAdmin: true }) === "admin");
  check("an active subscription is a subscriber", s({ subscription: { active: true } }) === "subscriber" && s({ subscription: { active: true, until: now + 1 } }) === "subscriber");
  check("an ended one is not", s({ subscription: { active: true, until: now - 1 } }) === "none");
  check("a new account is in its trial", s({ createdAt: now - 3 * 86400000 }) === "trial");
  check("and not after it", s({ createdAt: now - 8 * 86400000 }) === "none");
  check("subscribers and admins: 10 a day", AI.evaluationsPerDay("subscriber") === 10 && AI.evaluationsPerDay("admin") === 10);
  check("a trial, and everyone while the paywall is off: 3", AI.evaluationsPerDay("trial") === 3 && AI.evaluationsPerDay("open") === 3);
  check("anything unknown gets the small allowance, not the big one", AI.evaluationsPerDay(undefined) === 3);
}

// ------------------------------------------------- the real server code ----
const store = new Map();
// The counters are flat maps written with {merge: true}: a write merges its fields in.
const docRef = (p) => ({
  get: async () => ({ exists: store.has(p), data: () => (store.has(p) ? { ...store.get(p) } : undefined) }),
  write: (d) => store.set(p, { ...(store.get(p) || {}), ...d }),
});
let createdAt = Date.now(), subscribed = false;
const subscriptionDoc = { get: async () => ({ exists: subscribed, data: () => ({ active: true }) }) };
const fsStub = () => ({
  collection: (c) => ({ doc: (id) => (c === "subscriptions" ? subscriptionDoc : docRef(c + "/" + id)) }),
  runTransaction: async (fn) => {
    const writes = [];
    await fn({ get: (r) => r.get(), set: (r, d) => writes.push([r, d]) });
    writes.forEach(([r, d]) => r.write(d));
  },
});
class HttpsError extends Error { constructor(c, m, d) { super(m); this.code = c; this.details = d; } }
const stubs = {
  "firebase-functions/v2/https": { onCall: (...a) => a[a.length - 1], HttpsError },
  "firebase-functions/v2": { setGlobalOptions() {} },
  "firebase-functions/params": { defineSecret: () => ({ value: () => "" }) },
  "firebase-admin": { initializeApp() {}, firestore: Object.assign(fsStub, { FieldValue: {} }), auth: () => ({ getUser: async () => ({ metadata: { creationTime: new Date(createdAt).toUTCString() } }) }) },
  "@anthropic-ai/sdk": class {},
};
const realLoad = Module._load;
Module._load = function (req, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(stubs, req)) return stubs[req];
  return realLoad.call(this, req, parent, isMain);
};
const BASE = require(path.join(REPO, "functions", "server", "base.js"));
const AIS = require(path.join(REPO, "functions", "server", "ai.js"));
const req = (uid, admin) => ({ auth: { uid, token: admin ? { admin: true } : {} } });
const quiet = async (p) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await p; } finally { console.log = l; console.warn = w; } };
// how many valuations an account gets today before it is refused
async function allowance(uid, who) {
  let n = 0;
  for (let i = 0; i < 15; i++) {
    try { await quiet(AIS.consumeEvaluationQuota(uid, AI.evaluationsPerDay(who))); n++; } catch (e) { if (e.details && e.details.code === "ai-user-limit") { return { n, limit: e.details.limit }; } throw e; }
  }
  return { n };
}

(async () => {
  console.log("");
  console.log("played on the server code");
  const was = ACCESS.PAYWALL.on;
  ACCESS.PAYWALL.on = false;
  let who = await BASE.requireEntitled(req("open1"));
  let got = await allowance("open1", who);
  check("paywall off: an account is \"open\" and gets 3 a day", who === "open" && got.n === 3 && got.limit === 3, who + " " + JSON.stringify(got));
  who = await BASE.requireEntitled(req("boss", true));
  got = await allowance("boss", who);
  check("paywall off: the admin keeps 10", who === "admin" && got.n === 10, who + " " + JSON.stringify(got));

  ACCESS.PAYWALL.on = true;
  createdAt = Date.now() - 2 * 86400000; subscribed = false;
  who = await quiet(BASE.requireEntitled(req("trial1")));
  got = await allowance("trial1", who);
  check("paywall on: an account in its trial gets 3 a day", who === "trial" && got.n === 3, who + " " + JSON.stringify(got));
  createdAt = Date.now() - 30 * 86400000; subscribed = true;
  who = await quiet(BASE.requireEntitled(req("sub1")));
  got = await allowance("sub1", who);
  check("paywall on: a subscriber gets 10 a day", who === "subscriber" && got.n === 10, who + " " + JSON.stringify(got));
  subscribed = false;
  let refused = null;
  try { await quiet(BASE.requireEntitled(req("gone1"))); } catch (e) { refused = e; }
  check("paywall on: after the trial, without a subscription, none at all", refused && refused.details && refused.details.code === "subscription-needed");
  ACCESS.PAYWALL.on = was;

  console.log("");
  console.log("every AI callable passes it on");
  const src = require("./functions-files").source();
  for (const name of ["evaluateTask", "priceLibraryHabit", "suggestQuests", "submitReflection"]) {
    const at = src.indexOf("exports." + name + " = ");
    const body = at < 0 ? "" : src.slice(at, src.indexOf("\nexports.", at + 10) > 0 ? src.indexOf("\nexports.", at + 10) : undefined);
    const quota = body.split("\n").filter((l) => l.includes("await consumeEvaluationQuota("));
    check(name + " asks who is calling and gives that allowance",
      /const who = await requireEntitled\(request\);/.test(body) && quota.length > 0 && quota.every((q) => q.includes("AI.evaluationsPerDay(who)")), quota.map((q) => q.trim()).join(" | "));
  }

  console.log("");
  console.log(fails ? fails + " FAILED" : "all passed");
  process.exit(fails ? 1 : 0);
})().catch((err) => { console.log("FAIL  " + (err && err.stack || err)); process.exit(1); });

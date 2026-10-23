// The plans and the end of a trial (2026-10-23):  node tests/test-plans.js
//
// His prices — one list for every country, $7.99 a month, $49.99 a year — and
// what the plans window says about them; the banner of a trial's last two days;
// and the notices sent then, played on the real sendTrialNotices with an
// in-memory Firestore and the push service stood in for: once each, in the
// person's language, never to a subscriber or an admin, and nothing at all
// while the paywall is off.
"use strict";
const Module = require("module");
const path = require("path");
const fs = require("fs");
const vm = require("vm");

let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };
const REPO = path.resolve(__dirname, "..");
const DAY = 86400000;

// ---------------------------------------------------------------- the app ----
const SYS = {};
const sb = { SYS, window: { SYS }, console, Math, JSON, Object, Array, Number, String, Boolean, RegExp, Date, Set, Map, Intl };
vm.createContext(sb);
for (const f of ["i18n.js", "constants.js"]) {
  vm.runInContext(fs.readFileSync(path.join(REPO, "js", f), "utf8").replace(/\}\)\(window\.SYS[^)]*\);?\s*$/, "})(SYS);"), sb, { filename: f });
}

console.log("");
console.log("the prices");
check("one monthly price: $7.99", SYS.PLANS.monthly.price === 7.99);
check("one yearly price: $49.99", SYS.PLANS.annual.price === 49.99);
check("the yearly plan is $4.17 a month", SYS.planPerMonth("annual") === 4.17);
check("and saves 48% against twelve monthly payments", SYS.planSaving() === 48);
check("no price depends on a country", !/country|region|ppp/i.test(JSON.stringify(SYS.PLANS)));

console.log("");
console.log("the days left in a trial");
{
  const now = Date.UTC(2026, 9, 23, 12);
  const ui = (o) => ({ cloudUser: { uid: "u", createdAt: now - o.age * DAY }, isAdmin: !!o.admin, subscribed: !!o.sub });
  const was = SYS.PAYWALL.on;
  SYS.PAYWALL.on = false;
  check("nothing while the paywall is off", SYS.trialDaysLeft(ui({ age: 6.5 }), now) === 0);
  SYS.PAYWALL.on = true;
  check("half a day left reads as the last day", SYS.trialDaysLeft(ui({ age: 6.5 }), now) === 1);
  check("a day and a half left reads as two", SYS.trialDaysLeft(ui({ age: 5.5 }), now) === 2);
  check("three days in, four are left", SYS.trialDaysLeft(ui({ age: 3 }), now) === 4);
  check("a trial that ended has none", SYS.trialDaysLeft(ui({ age: 8 }), now) === 0);
  check("a subscriber has no trial to end", SYS.trialDaysLeft(ui({ age: 6.5, sub: true }), now) === 0);
  check("nor has an admin", SYS.trialDaysLeft(ui({ age: 6.5, admin: true }), now) === 0);
  SYS.PAYWALL.on = was;
}

// -------------------------------------------------------------- the notices ----
const TRIAL = require(path.join(REPO, "functions", "trial.js"));
console.log("");
console.log("which notice is due");
{
  const now = Date.UTC(2026, 9, 23, 12);
  check("two days before the end: the first", TRIAL.noticeFor(now - 5.5 * DAY, now, 7) === "d2");
  check("on the last day: the second", TRIAL.noticeFor(now - 6.5 * DAY, now, 7) === "d1");
  check("earlier, none", TRIAL.noticeFor(now - 3 * DAY, now, 7) === null);
  check("after the end, none", TRIAL.noticeFor(now - 7.5 * DAY, now, 7) === null);
  const langs = Object.keys(SYS.LANGUAGES || {});
  check("written in every language the app speaks", langs.length >= 7 && langs.every((l) => TRIAL.NOTICE_TEXT[l] && TRIAL.NOTICE_TEXT[l].d2.title && TRIAL.NOTICE_TEXT[l].d1.body), langs.join(","));
  check("an unknown language falls back to English", TRIAL.noticePayload("d1", "xx").title === TRIAL.NOTICE_TEXT.en.d1.title);
}

// A Firestore with just what sendTrialNotices touches.
const store = new Map();
const docSnap = (p) => ({ id: p.split("/").pop(), exists: store.has(p), data: () => (store.has(p) ? { ...store.get(p) } : undefined), ref: { delete: async () => store.delete(p) } });
const ref = (p) => ({ get: async () => docSnap(p), set: async (d, o) => store.set(p, o && o.merge ? { ...(store.get(p) || {}), ...d } : { ...d }) });
const col = (c, filters = []) => ({
  doc: (id) => Object.assign(ref(c + "/" + id), { collection: (sub) => col(c + "/" + id + "/" + sub) }),
  where: (f, op, v) => col(c, filters.concat([[f, op, v]])),
  get: async () => {
    const keys = [...store.keys()].filter((k) => k.startsWith(c + "/") && k.split("/").length === c.split("/").length + 1);
    const docs = keys.map(docSnap).filter((d) => filters.every(([f, op, v]) => {
      const x = d.data()[f]; const a = x && x.toMillis ? x.toMillis() : x; const b = v && v.toMillis ? v.toMillis() : v;
      return op === ">" ? a > b : op === "<=" ? a <= b : op === ">=" ? a >= b : op === "<" ? a < b : a === b;
    }));
    reads += docs.length + 1;
    return { docs, empty: !docs.length, size: docs.length };
  },
});
let reads = 0;
const ts = (ms) => ({ toMillis: () => ms });
const pushed = [];
const stubs = {
  "firebase-admin": { initializeApp() {}, firestore: Object.assign(() => ({ collection: (c) => col(c) }), { Timestamp: { fromMillis: ts }, FieldValue: {} }) },
  "web-push": { setVapidDetails() {}, sendNotification: async (sub, body) => { pushed.push({ endpoint: sub.endpoint, payload: JSON.parse(body) }); } },
  "firebase-functions/v2/https": { onCall: (...a) => a[a.length - 1], HttpsError: class extends Error {} },
  "firebase-functions/v2": { setGlobalOptions() {} },
  "firebase-functions/params": { defineSecret: () => ({ value: () => "" }) },
};
const realLoad = Module._load;
Module._load = function (req, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(stubs, req)) return stubs[req];
  return realLoad.call(this, req, parent, isMain);
};
const { sendTrialNotices } = require(path.join(REPO, "functions", "server", "trial.js"));
const ACCESS = require(path.join(REPO, "functions", "access.js"));
const db = stubs["firebase-admin"].firestore();
const quiet = async (p) => { const l = console.log; console.log = () => {}; try { return await p; } finally { console.log = l; } };

(async () => {
  console.log("");
  console.log("the notices, sent");
  const now = new Date(Date.UTC(2026, 9, 23, 12, 7));
  const n = now.getTime();
  const account = (uid, ageDays, o = {}) => {
    store.set("userDirectory/" + uid, { email: uid + "@x", createdAt: ts(n - ageDays * DAY) });
    if (o.device !== false) store.set("users/" + uid + "/pushSubs/d1", { endpoint: "https://fcm.googleapis.com/fcm/send/" + uid, p256dh: "k", auth: "a" });
    store.set("users/" + uid, { state: { settings: { language: o.lang || "en" } } });
    if (o.sub) store.set("subscriptions/" + uid, { active: true });
    if (o.admin) store.set("adminDirectory/" + uid, { since: 1 });
  };
  account("twoleft", 5.5);
  account("lastday", 6.5, { lang: "ar" });
  account("early", 2);
  account("ended", 8);
  account("payer", 5.5, { sub: true });
  account("boss", 6.5, { admin: true });
  account("nophone", 5.5, { device: false });

  const was = ACCESS.PAYWALL.on;
  ACCESS.PAYWALL.on = false;
  reads = 0;
  await quiet(sendTrialNotices(db, now));
  check("with the paywall off, nothing is read or sent", reads === 0 && pushed.length === 0);

  ACCESS.PAYWALL.on = true;
  await quiet(sendTrialNotices(db, now));
  const to = (uid) => pushed.filter((p) => p.endpoint.endsWith("/" + uid));
  check("two days before the end, the first notice", to("twoleft").length === 1 && to("twoleft")[0].payload.title === TRIAL.NOTICE_TEXT.en.d2.title);
  check("on the last day, the second, in the person's language", to("lastday").length === 1 && to("lastday")[0].payload.title === TRIAL.NOTICE_TEXT.ar.d1.title);
  check("not before its time, nor after the trial", to("early").length === 0 && to("ended").length === 0);
  check("never to a subscriber or an admin", to("payer").length === 0 && to("boss").length === 0);
  check("no device, no notice, no error", to("nophone").length === 0);
  const before = pushed.length;
  await quiet(sendTrialNotices(db, new Date(n + 3600000)));
  check("an hour later, nothing is sent twice", pushed.length === before, (pushed.length - before) + " more");
  ACCESS.PAYWALL.on = was;

  console.log("");
  console.log(fails ? fails + " FAILED" : "all passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log("FAIL  " + (e && e.stack || e)); process.exit(1); });

// Nothing but the server can move a public standing.
//
// Two doors were open until 2026-10-02, and both are checked here against the
// real functions/index.js, loaded with an in-memory Firestore in place of the
// real one:
//
//  1. A device could write its own journal entries, of any size, and they
//     counted. COUNT_UNVERIFIED_EXP is off: such an entry moves nothing.
//  2. The first time an account's row was written, whatever EXP its device
//     claimed became its permanent baseline. A new account starts at zero now,
//     however high its own copy says it stands.
const Module = require("module");
const path = require("path");

let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };

// ------------------------------------------------------ in-memory Firestore --
const store = new Map(); // "col/doc/col/doc" -> data
const INC = Symbol("inc"), DEL = Symbol("del"), TS = Symbol("ts");
const FieldValue = {
  increment: (n) => ({ [INC]: n }),
  delete: () => ({ [DEL]: true }),
  serverTimestamp: () => ({ [TS]: true }),
  arrayUnion: (...v) => ({ union: v }),
  arrayRemove: (...v) => ({ remove: v }),
};
const isPlain = (v) => v && typeof v === "object" && !Array.isArray(v) && !(INC in v) && !(DEL in v) && !(TS in v);
// set(..., {merge}) merges nested maps; update() replaces a map field whole,
// as Firestore does (only a dotted path would reach inside it).
function apply(prev, patch, merge, deep = merge) {
  const out = merge && prev ? { ...prev } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && INC in v) out[k] = (Number(out[k]) || 0) + v[INC];
    else if (v && typeof v === "object" && DEL in v) delete out[k];
    else if (v && typeof v === "object" && TS in v) out[k] = { toDate: () => new Date() };
    else if (isPlain(v) && deep) out[k] = apply(isPlain(out[k]) ? out[k] : {}, v, true);
    else if (isPlain(v)) out[k] = apply({}, v, false);
    else out[k] = v;
  }
  return out;
}
function docRef(p) {
  return {
    id: p.split("/").pop(), path: p,
    collection: (c) => colRef(p + "/" + c),
    get: async () => ({ exists: store.has(p), id: p.split("/").pop(), ref: docRef(p), data: () => store.get(p) }),
    set: async (d, o) => { store.set(p, apply(store.get(p), d, !!(o && o.merge))); },
    update: async (d) => { if (!store.has(p)) throw new Error("no doc " + p); store.set(p, apply(store.get(p), d, true, false)); },
    delete: async () => { store.delete(p); },
  };
}
let auto = 0;
// Equality filters on top-level fields are honoured; anything else is ignored.
function colRef(p, filters = []) {
  return {
    doc: (id) => docRef(p + "/" + (id || "auto" + (++auto))),
    add: async (d) => { const r = docRef(p + "/auto" + (++auto)); await r.set(d); return r; },
    get: async () => {
      const docs = [...store.keys()].filter((k) => k.startsWith(p + "/") && k.split("/").length === p.split("/").length + 1)
        .filter((k) => filters.every(([f, v]) => (store.get(k) || {})[f] === v))
        .map((k) => ({ id: k.split("/").pop(), exists: true, ref: docRef(k), data: () => store.get(k) }));
      return { docs, size: docs.length, empty: !docs.length, forEach: (f) => docs.forEach(f) };
    },
    where(f, op, v) { return op === "==" && typeof f === "string" ? colRef(p, filters.concat([[f, v]])) : this; },
    orderBy() { return this; }, limit() { return this; },
  };
}
const firestore = () => ({
  collection: colRef, doc: docRef,
  runTransaction: async (fn) => fn({
    get: (r) => r.get(), set: (r, d, o) => r.set(d, o), update: (r, d) => r.update(d), delete: (r) => r.delete(),
  }),
  batch: () => { const ops = []; return { set: (r, d, o) => ops.push(() => r.set(d, o)), update: (r, d) => ops.push(() => r.update(d)), delete: (r) => ops.push(() => r.delete()), commit: async () => { for (const op of ops) await op(); } }; },
});
firestore.FieldValue = FieldValue;
firestore.Timestamp = { now: () => ({ toDate: () => new Date(), toMillis: () => Date.now() }), fromDate: (d) => ({ toDate: () => d }) };
const adminStub = { initializeApp() {}, firestore, auth: () => ({}), messaging: () => ({}), app: () => ({}) };

// ------------------------------------------------- firebase-functions stubs --
const passFn = (...a) => a[a.length - 1];
const callableOpts = []; // the options every onCall was created with
const anything = () => new Proxy(function () {}, { get: (t, k) => (k === "then" ? undefined : anything()), apply: (t, s, a) => (typeof a[a.length - 1] === "function" ? a[a.length - 1] : anything()) });
const stubs = {
  "firebase-functions/v2/https": { onCall: (...a) => { callableOpts.push(a.length > 1 ? a[0] : {}); return a[a.length - 1]; }, onRequest: passFn, HttpsError: class extends Error { constructor(c, m, d) { super(m); this.code = c; this.details = d; } } },
  "firebase-functions/v2/firestore": { onDocumentWritten: passFn, onDocumentCreated: passFn, onDocumentUpdated: passFn, onDocumentDeleted: passFn },
  "firebase-functions/v2/scheduler": { onSchedule: passFn },
  "firebase-functions/v2": { setGlobalOptions() {} },
  "firebase-functions/params": { defineSecret: () => ({ value: () => "" }), defineString: () => ({ value: () => "" }) },
  "firebase-functions/v1": anything(),
  "firebase-functions": anything(),
  "firebase-admin": adminStub,
  "@anthropic-ai/sdk": anything(),
  "web-push": anything(),
};
const realLoad = Module._load;
Module._load = function (req, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(stubs, req)) return stubs[req];
  return realLoad.call(this, req, parent, isMain);
};
const quiet = console.log; console.log = () => {};
const F = require(path.join(__dirname, "..", "functions", "index.js"));
console.log = quiet;

const created = (uid, data) => ({ params: { uid, eventId: "e" + (++auto) }, data: { data: () => data } });
const written = (uid, before, after) => ({ params: { uid }, data: {
  before: before ? { exists: true, data: () => ({ state: { player: before } }) } : { exists: false, data: () => undefined },
  after: { exists: true, data: () => ({ state: { player: after } }) },
} });
const totals = (uid) => store.get("expTotals/" + uid) || {};
const row = (uid) => store.get("leaderboard/" + uid);
const silent = async (p) => { const l = console.log; console.log = () => {}; try { return await p; } finally { console.log = l; } };

(async () => {
  console.log("");
  console.log("App Check");
  check("every callable refuses a call without an App Check token",
    callableOpts.length > 30 && callableOpts.every((o) => o && o.enforceAppCheck === true),
    callableOpts.length + " callables, " + callableOpts.filter((o) => !o || o.enforceAppCheck !== true).length + " not enforced");

  console.log("");
  console.log("a device's own word moves nothing");
  {
    await silent(F.recordExpEvent(created("cheat1", { delta: 100000, source: "forged" })));
    check("an entry the server did not write is ignored", totals("cheat1").journalExp === undefined && !row("cheat1"));
    await silent(F.recordExpEvent(created("cheat1", { delta: 40, source: "Reading", server: true })));
    check("a server entry still counts", totals("cheat1").journalExp === 40, JSON.stringify(totals("cheat1")));
  }

  console.log("");
  console.log("a new account starts at zero, whatever it claims");
  {
    store.set("userDirectory/cheat2", { name: "Cheat", usernameKey: "cheat" });
    const forged = { name: "Cheat", rank: "S", level: 100, exp: 199, questsCompleted: 3 };
    await silent(F.mirrorLeaderboard(written("cheat2", null, forged)));
    check("its baseline is zero", totals("cheat2").baseline === 0, JSON.stringify(totals("cheat2")));
    check("and so is its public total", row("cheat2") && row("cheat2").totalExp === 0, JSON.stringify(row("cheat2")));
    await silent(F.recordExpEvent(created("cheat2", { delta: 30, source: "Reading", server: true })));
    check("earned EXP is added to nothing", totals("cheat2").journalExp === 30 && row("cheat2").totalExp === 30,
      JSON.stringify(row("cheat2")));
  }

  console.log("");
  console.log("an account that already had a baseline keeps it");
  {
    store.set("userDirectory/old", { name: "Old", usernameKey: "old" });
    store.set("expTotals/old", { baseline: 5000, baselineCurve: 3, journalExp: 200 });
    store.set("leaderboard/old", { displayName: "Old", totalExp: 5200 });
    await silent(F.mirrorLeaderboard(written("old", { rank: "E", level: 1, exp: 0 }, { rank: "S", level: 100, exp: 0 })));
    check("a forged copy does not move it", totals("old").baseline === 5000 && row("old").totalExp === 5200, JSON.stringify(row("old")));
    await silent(F.recordExpEvent(created("old", { delta: 50, source: "Reading", server: true })));
    check("and real work adds to it", row("old").totalExp === 5250, JSON.stringify(row("old")));
  }

  console.log("");
  console.log("EXP per intelligence, for the board's filter");
  {
    store.set("userDirectory/reader", { name: "Reader", usernameKey: "reader" });
    await silent(F.mirrorLeaderboard(written("reader", null, { rank: "G", level: 1, exp: 0 })));
    store.set("aiPrices/reader/prices/p1", { pt: 360, types: ["linguistic", "self"] });
    store.set("aiPrices/reader/prices/p2", { pt: 30, types: [] });
    await silent(F.recordExpEvent(created("reader", { delta: 60, source: "Read", server: true, priceId: "p1" })));
    check("an entry is split across the intelligences its price named",
      JSON.stringify(row("reader").cats) === JSON.stringify({ self: 30, linguistic: 30 }) ||
      (row("reader").cats.linguistic === 30 && row("reader").cats.self === 30), JSON.stringify(row("reader").cats));
    await silent(F.recordExpEvent(created("reader", { delta: 30, source: "Bills", server: true, priceId: "p2" })));
    check("a chore moves the total and no intelligence", row("reader").totalExp === 90 &&
      row("reader").cats.linguistic === 30 && Object.keys(row("reader").cats).length === 2, JSON.stringify(row("reader")));
    await silent(F.recordExpEvent(created("reader", { delta: 50, source: "Adjustment: bonus", server: true })));
    check("an admin's adjustment builds no intelligence", row("reader").cats.linguistic === 30, JSON.stringify(row("reader").cats));
    await silent(F.recordExpEvent(created("reader", { delta: -60, source: "Read (undone)", server: true, priceId: "p1" })));
    check("taking it back takes the intelligence off the row", !("linguistic" in row("reader").cats), JSON.stringify(row("reader").cats));
  }

  console.log("");
  console.log("the AI limits: one per account, one for everybody");
  {
    const AI = require(path.join(__dirname, "..", "functions", "ai-config.js"));
    const today = new Date().toISOString().slice(0, 10);
    const ask = (uid) => silent(F.evaluateTask({ auth: { uid, token: {} },
      data: { title: "Read a novel", description: "Read the whole of a 300 page novel", kind: "quest" } }))
      .then(() => null, (e) => e);
    check("ten a day per account", AI.MAX_EVALUATIONS_PER_DAY === 10);
    store.set("aiUsage/busy", { date: today, count: AI.MAX_EVALUATIONS_PER_DAY });
    const e1 = await ask("busy");
    check("an account at its limit is refused, with a code the app translates",
      e1 && e1.code === "resource-exhausted" && e1.details && e1.details.code === "ai-user-limit" && e1.details.limit === 10,
      e1 && e1.message);
    check("and nothing is counted against everybody for it", !store.get("aiBudget/" + today));
    store.set("aiBudget/" + today, { count: AI.GLOBAL_MAX_EVALUATIONS_PER_DAY });
    const e2 = await ask("fresh");
    check("past everybody's limit, a fresh account is refused too",
      e2 && e2.code === "resource-exhausted" && e2.details && e2.details.code === "ai-global-limit", e2 && e2.message);
    check("and its own count is not spent", !store.get("aiUsage/fresh"));
    store.set("aiBudget/" + today, { count: 5 });
    await ask("fresh");
    check("under both limits, both counts move", store.get("aiUsage/fresh").count === 1 && store.get("aiBudget/" + today).count === 6,
      JSON.stringify([store.get("aiUsage/fresh"), store.get("aiBudget/" + today)]));
  }

  console.log("");
  console.log("an appeal carries the recorded price, not the device's word");
  {
    const auth = { uid: "appellant", token: {} };
    const file = (data) => silent(F.fileAppeal({ auth, data })).then((r) => r, (e) => e);
    store.set("aiPrices/appellant/prices/pq", { pt: 400, title: "Write a short story", kind: "quest" });
    const r1 = await file({ taskId: "t1", priceId: "pq", reason: "This took me three weekends of work.",
      title: "Forged title", currentPt: 1, description: "A story of 3000 words" });
    const filed = r1 && r1.id ? store.get("appeals/" + r1.id) : null;
    check("filed through the server", !!filed, JSON.stringify(r1));
    check("title and value come from the price", filed && filed.taskTitle === "Write a short story" && filed.currentPt === 400 && filed.status === "pending",
      JSON.stringify(filed));
    const r2 = await file({ taskId: "t1", priceId: "pq", reason: "Again, it really was worth more." });
    check("one appeal per task waits at a time", r2 && r2.details && r2.details.code === "appeal-open", r2 && r2.message);
    const r3 = await file({ taskId: "t9", priceId: "nope", reason: "This one has no price at all." });
    check("a task with no recorded price cannot be appealed", r3 && r3.details && r3.details.code === "appeal-unpriced");
    const r4 = await file({ taskId: "t1", priceId: "pq", reason: "short" });
    check("an argument has to say something", r4 && r4.details && r4.details.code === "appeal-reason");
    for (let i = 0; i < 6; i++) store.set("aiPrices/appellant/prices/x" + i, { pt: 10, title: "T" + i, kind: "quest" });
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await file({ taskId: "x" + i, priceId: "x" + i, reason: "Worth more than this, honestly." }));
    const refused = results.filter((r) => r && r.details && r.details.code === "appeal-limit").length;
    check("five a day, then refused", refused === 2, results.map((r) => (r && r.id) ? "ok" : r && r.details && r.details.code).join(","));
  }

  console.log("");
  console.log("daily allowances are private");
  {
    store.set("counters/renamer", { renames: { day: new Date().toISOString().slice(0, 10), n: 10 } });
    store.set("userDirectory/renamer", { name: "Old Name", usernameKey: "old name" });
    const e = await silent(F.claimUsername({ auth: { uid: "renamer", token: {} }, data: { name: "Brand New" } })).then(() => null, (x) => x);
    check("a name can be tried only so many times a day", e && e.details && e.details.code === "rename-limit", e && e.message);
    store.set("profiles/searcher", { bio: "hi", searches: { day: "2026-01-01", n: 4 } });
    await silent(F.searchPlayers({ auth: { uid: "searcher", token: {} }, data: { q: "ab" } }));
    check("a search is counted where nobody else can read it", store.get("counters/searcher") && store.get("counters/searcher").searches.n === 1,
      JSON.stringify(store.get("counters/searcher")));
    check("and not on the public profile", !("searches" in store.get("profiles/searcher")) || store.get("profiles/searcher").searches.day === "2026-01-01");
  }

  console.log("");
  console.log(fails ? fails + " FAIL" : "all passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log("  FAIL  threw: " + (e && e.stack || e)); process.exit(1); });

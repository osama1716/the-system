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
function apply(prev, patch, merge) {
  const out = merge && prev ? { ...prev } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && INC in v) out[k] = (Number(out[k]) || 0) + v[INC];
    else if (v && typeof v === "object" && DEL in v) delete out[k];
    else if (v && typeof v === "object" && TS in v) out[k] = { toDate: () => new Date() };
    else if (isPlain(v) && merge) out[k] = apply(isPlain(out[k]) ? out[k] : {}, v, true);
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
    update: async (d) => { if (!store.has(p)) throw new Error("no doc " + p); store.set(p, apply(store.get(p), d, true)); },
    delete: async () => { store.delete(p); },
  };
}
let auto = 0;
function colRef(p) {
  return {
    doc: (id) => docRef(p + "/" + (id || "auto" + (++auto))),
    get: async () => {
      const docs = [...store.keys()].filter((k) => k.startsWith(p + "/") && k.split("/").length === p.split("/").length + 1)
        .map((k) => ({ id: k.split("/").pop(), exists: true, ref: docRef(k), data: () => store.get(k) }));
      return { docs, size: docs.length, empty: !docs.length, forEach: (f) => docs.forEach(f) };
    },
    where() { return this; }, orderBy() { return this; }, limit() { return this; },
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
const anything = () => new Proxy(function () {}, { get: (t, k) => (k === "then" ? undefined : anything()), apply: (t, s, a) => (typeof a[a.length - 1] === "function" ? a[a.length - 1] : anything()) });
const stubs = {
  "firebase-functions/v2/https": { onCall: passFn, onRequest: passFn, HttpsError: class extends Error { constructor(c, m) { super(m); this.code = c; } } },
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
  console.log(fails ? fails + " FAIL" : "all passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log("  FAIL  threw: " + (e && e.stack || e)); process.exit(1); });

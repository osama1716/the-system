// The capability tests (functions/captest.js, functions/api/capability.js,
// js/main-captest.js):  node tests/test-capability.js
//
// The memory test is only worth something if it cannot be talked into a
// better number. So this plays the whole thing against the real callables, on
// an in-memory Firestore: an honest run, and every way the device could lie —
// a sequence out of the rule's order, a hand-in faster than the digits could
// be shown, answers typed faster than a person types, leaving the app, a
// second start inside the week, a jump that waits for a retake. And the app's
// own copy of the step rule must agree with the server's on every case.
"use strict";
const Module = require("module");
const path = require("path");
const fs = require("fs");
const vm = require("vm");

let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };
const REPO = path.resolve(__dirname, "..");
const CAP = require(path.join(REPO, "functions", "captest.js"));
const M = CAP.MEMORY;

// ------------------------------------------------------------ the rules ----
console.log("");
console.log("sequences");
{
  let rnd = 12345;
  const rand = () => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd / 2147483648; };
  let bad = null;
  for (let k = 0; k < 400 && !bad; k++) {
    const seqs = CAP.makeSequences(rand);
    for (let len = M.start; len <= M.max; len++) {
      for (const s of seqs[len]) {
        const d = s.split("").map(Number);
        const counts = {};
        d.forEach((x) => { counts[x] = (counts[x] || 0) + 1; });
        if (s.length !== len || !/^[0-9]+$/.test(s)) bad = "length " + s;
        else if (d.some((x, i) => i && x === d[i - 1])) bad = "a digit twice in a row: " + s;
        else if (Object.values(counts).some((n) => n > 2)) bad = "a digit three times: " + s;
        else if (d.some((x, i) => i >= 2 && d[i - 1] - d[i - 2] === x - d[i - 1] && Math.abs(x - d[i - 1]) === 1)) bad = "a run: " + s;
      }
    }
  }
  check("two of every length, no repeats in a row, no digit three times, no 123 runs", !bad, bad);
  const seqs = CAP.makeSequences(Math.random);
  const packed = CAP.pack(seqs, "abc123XYZ");
  check("what the device receives is not the digits as they are", JSON.stringify(packed) !== JSON.stringify(seqs));
  check("and unpacks back to them", JSON.stringify(CAP.unpack(packed, "abc123XYZ")) === JSON.stringify(seqs));
}

// An honest run: right up to `span`, then wrong twice.
function honest(seqs, span, opts) {
  const o = opts || {};
  const trials = [];
  let at = { len: M.start, attempt: 0 };
  while (at) {
    const right = at.len <= span;
    trials.push({ len: at.len, attempt: at.attempt, answer: right ? seqs[at.len][at.attempt] : "0".repeat(at.len), ms: o.ms != null ? o.ms : 1500 + 400 * at.len, left: false });
    at = CAP.next(at.len, at.attempt, right);
  }
  return trials;
}

console.log("");
console.log("scoring");
{
  const seqs = CAP.makeSequences(Math.random);
  for (const span of [3, 5, 7, 9, 12]) {
    const r = CAP.score(seqs, honest(seqs, span));
    check("an honest run to " + span + " scores " + span, r.ok && r.span === span, JSON.stringify(r));
  }
  const t7 = honest(seqs, 7);
  check("a run that answers nothing right scores 0", CAP.score(seqs, honest(seqs, 0)).span === 0);
  const skipped = t7.filter((tr) => tr.len !== 4);
  check("skipping a length is refused", CAP.score(seqs, skipped).reason === "order");
  const extra = t7.concat([{ len: 9, attempt: 0, answer: seqs[9][0], ms: 4000, left: false }]);
  check("a sequence after the test ended is refused", CAP.score(seqs, extra).reason === "extra");
  check("a test that stops before the rule ends it is refused", CAP.score(seqs, t7.slice(0, 3)).reason === "unfinished");
  const fake = honest(seqs, 7).map((tr) => ({ ...tr }));
  fake[fake.length - 1].answer = seqs[8][1]; fake[fake.length - 2].answer = seqs[8][0];
  check("claiming the right answer while the order says it was wrong is refused", CAP.score(seqs, fake).reason === "order");
  check("answers typed faster than a person can are refused", CAP.score(seqs, honest(seqs, 7, { ms: 200 })).reason === "too-fast");
  const late = honest(seqs, 7).map((tr) => (tr.len === 6 ? { ...tr, ms: CAP.answerLimitMs(6) + 5000 } : tr));
  check("an answer past its time does not count", CAP.score(seqs, late).ok === false || CAP.score(seqs, late).span < 7);
  const left = honest(seqs, 7).map((tr) => (tr.len === 5 ? { ...tr, left: true } : tr));
  const rl = CAP.score(seqs, left);
  check("a sequence the app was left during counts as wrong", rl.ok === false || rl.span < 7, JSON.stringify(rl));
  // Leaving the app three times, each followed by a right second try: the app
  // stops the test at the third, before the rule would.
  const quit = [];
  for (const len of [3, 4, 5]) {
    quit.push({ len, attempt: 0, answer: "", ms: 0, left: true });
    if (len < 5) quit.push({ len, attempt: 1, answer: seqs[len][1], ms: 3000, left: false });
  }
  check("leaving the app three times voids the test", CAP.score(seqs, quit).reason === "left", JSON.stringify(CAP.score(seqs, quit)));
}

console.log("");
console.log("counting, the week, and where a span stands");
{
  const now = Date.UTC(2026, 9, 22);
  check("a first ordinary span counts", CAP.decide({}, 7, now).counted === true);
  check("a first span this rare waits for a retake", CAP.decide({}, 11, now).pending === true);
  const m = { counted: { span: 6 } };
  check("a rise of three over the counted span waits", CAP.decide(m, 9, now).pending === true);
  check("a rise of two counts", CAP.decide(m, 8, now).counted === true);
  check("a retake within one of the waiting span counts", CAP.decide({ counted: { span: 6 }, pending: { span: 9 } }, 10, now).counted === true);
  check("a retake far from it waits again", CAP.decide({ counted: { span: 6 }, pending: { span: 11 } }, 9, now).pending === true);
  check("a counted test waits a week", CAP.decide({}, 7, now).nextAt === now + M.cooldownDays * 86400000);
  check("a waiting one only a day", CAP.decide(m, 10, now).nextAt === now + M.retryHours * 3600000);
  check("no start before the date", !CAP.canStart({ nextAt: now + 1 }, now).ok && CAP.canStart({ nextAt: now }, now).ok);
  check("no share until the band has enough people", CAP.share({ 7: M.minBand - 1 }, 7).pct === null);
  const hist = { 5: 10, 6: 10, 7: 10, 8: 10 };
  check("the share counts those below and half of those level", CAP.share(hist, 7).pct === Math.round(100 * (20 + 5) / 40));
}

// --------------------------------------------- the callables, for real ----
const store = new Map();
const docRef = (p) => ({
  id: p.split("/").pop(), path: p,
  get: async () => ({ exists: store.has(p), data: () => (store.has(p) ? JSON.parse(JSON.stringify(store.get(p))) : undefined) }),
  set: async (d) => { store.set(p, JSON.parse(JSON.stringify(d))); },
});
const firestore = () => ({
  collection: (c) => ({ doc: (id) => docRef(c + "/" + id) }),
  runTransaction: async (fn) => {
    const writes = [];
    const out = await fn({ get: (r) => r.get(), set: (r, d) => { writes.push(() => r.set(d)); } });
    for (const w of writes) await w();
    return out;
  },
});
let createdAt = Date.now();
let subscribed = false;
const adminStub = {
  initializeApp() {},
  firestore: Object.assign(() => {
    const f = firestore();
    const col = f.collection;
    f.collection = (c) => (c === "subscriptions" ? { doc: () => ({ get: async () => ({ exists: subscribed, data: () => ({ active: true }) }) }) } : col(c));
    return f;
  }, { FieldValue: {} }),
  auth: () => ({ getUser: async () => ({ metadata: { creationTime: new Date(createdAt).toUTCString() } }) }),
};
class HttpsError extends Error { constructor(c, m, d) { super(m); this.code = c; this.details = d; } }
const callableOpts = [];
const stubs = {
  "firebase-functions/v2/https": { onCall: (...a) => { callableOpts.push(a.length > 1 ? a[0] : {}); return a[a.length - 1]; }, HttpsError },
  "firebase-functions/v2": { setGlobalOptions() {} },
  "firebase-functions/params": { defineSecret: () => ({ value: () => "" }) },
  "firebase-admin": adminStub,
};
const realLoad = Module._load;
Module._load = function (req, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(stubs, req)) return stubs[req];
  return realLoad.call(this, req, parent, isMain);
};
const F = require(path.join(REPO, "functions", "api", "capability.js"));
const ACCESS = require(path.join(REPO, "functions", "access.js"));
let clock = Date.UTC(2026, 9, 22, 9, 0, 0);
Date.now = () => clock;
const quiet = async (p) => { const l = console.log; console.log = () => {}; try { return await p; } finally { console.log = l; } };
const req = (uid, data) => ({ auth: { uid, token: {} }, data });
const call = (fn, uid, data) => quiet(fn(req(uid, data)));
const refused = async (p) => { try { await p; return null; } catch (e) { return e; } };

// Starts a test and plays it: honestly to `span`, or with `tamper` applied to
// the trials, handing in `elapsed` ms after the start.
async function play(uid, span, opts) {
  const o = opts || {};
  const st = await call(F.startMemoryTest, uid, { ageBand: o.band || "25-34" });
  const stored = store.get("capTests/" + uid).memory.session.seqs;
  const seqs = CAP.unpack(st.seqs, st.sessionId);
  let trials = honest(seqs, span);
  if (o.tamper) trials = o.tamper(trials, seqs);
  const elapsed = o.elapsed != null ? o.elapsed : CAP.minElapsedMs(trials) + trials.length * 3000;
  clock += elapsed;
  const res = await call(F.finishMemoryTest, uid, { sessionId: o.sessionId || st.sessionId, trials });
  return { st, res, stored, seqs };
}
const week = 7 * 86400000 + 1000;

(async () => {
  console.log("");
  console.log("the callables");
  check("both demand App Check", callableOpts.length === 2 && callableOpts.every((o) => o && o.enforceAppCheck === true));

  const a = await play("alice", 7);
  check("an honest run is scored and counted", a.res.valid && a.res.span === 7 && a.res.counted, JSON.stringify(a.res));
  check("the device receives the sequences disguised, not as the server keeps them", JSON.stringify(a.st.seqs) !== JSON.stringify(a.stored));
  check("and they unpack to exactly what the server keeps", JSON.stringify(a.seqs) === JSON.stringify(a.stored));
  check("the band's spans hold it", (store.get("capStats/memory").bands["25-34"] || {})[7] === 1);
  check("and no share is claimed from one person", a.res.pct === null);
  check("the test under way is gone afterwards", !store.get("capTests/alice").memory.session);

  const again = await refused(call(F.startMemoryTest, "alice", { ageBand: "25-34" }));
  check("a second test inside the week is refused, with the date", again && again.details && again.details.code === "cap-wait" && again.details.nextAt > clock);

  clock += week;
  const fast = await play("alice", 7, { elapsed: 3000 });
  check("a hand-in sooner than the digits could be shown is void", fast.res.valid === false && fast.res.reason === "too-fast", JSON.stringify(fast.res));
  check("and a void test leaves the counted span where it was", store.get("capTests/alice").memory.counted.span === 7);

  clock += week;
  const order = await play("alice", 7, { tamper: (t) => t.filter((tr) => tr.len !== 5) });
  check("a run that skips a length is void", order.res.valid === false && order.res.reason === "order");

  clock += week;
  const wrongSession = await refused(play("alice", 7, { sessionId: "not-it" }));
  check("a hand-in for another test is refused", wrongSession && wrongSession.details && wrongSession.details.code === "cap-no-test");

  clock += week;
  const jump = await play("alice", 11);
  check("a jump of four over the counted span waits for a retake", jump.res.valid && jump.res.pending && !jump.res.counted);
  check("and stays out of the band until then", (store.get("capStats/memory").bands["25-34"] || {})[11] === undefined);
  clock += 25 * 3600000;
  const confirm = await play("alice", 10);
  check("a retake within one confirms it, a day later", confirm.res.valid && confirm.res.counted && confirm.res.span === 10, JSON.stringify(confirm.res));
  const band = store.get("capStats/memory").bands["25-34"];
  check("the old span leaves the band and the new one joins", band[7] === undefined && band[10] === 1, JSON.stringify(band));

  // Enough people for a share.
  for (let i = 0; i < 40; i++) { clock += 1000; await play("p" + i, 4 + (i % 6)); }
  clock += 1000;
  const bob = await play("bob", 8);
  check("once the band is full enough, a share of it is given", bob.res.pct != null && bob.res.pct > 50 && bob.res.pct < 100, JSON.stringify(bob.res));
  const other = await play("carol", 8, { band: "45-54" });
  check("each band compares only its own people", other.res.pct === null && other.res.n === 1);

  console.log("");
  console.log("free accounts are given nothing that costs");
  const was = ACCESS.PAYWALL.on;
  ACCESS.PAYWALL.on = true;
  createdAt = clock - 30 * 86400000; subscribed = false;
  const free = await refused(call(F.startMemoryTest, "dave", { ageBand: "18-24" }));
  check("an account past its trial without a subscription cannot start one", free && free.code === "permission-denied", free && free.message);
  check("and nothing was written for it", !store.has("capTests/dave"));
  createdAt = clock - 2 * 86400000;
  check("an account in its trial can", !!(await call(F.startMemoryTest, "erin", { ageBand: "18-24" })).sessionId);
  createdAt = clock - 30 * 86400000; subscribed = true;
  check("and so can a subscriber", !!(await call(F.startMemoryTest, "fay", { ageBand: "18-24" })).sessionId);
  ACCESS.PAYWALL.on = was;

  console.log("");
  console.log("the app's copy of the rules");
  const SYS = {};
  const sb = { SYS, window: { SYS, addEventListener() {} }, document: { addEventListener() {} }, console, Math, JSON, Object, Array, Number, String, Boolean, RegExp, Date, Set, Map, Intl };
  sb.window.SYS = SYS;
  vm.createContext(sb);
  SYS._main = { ACTIONS: {}, ui: {} };
  for (const f of ["constants.js", "main-captest.js"]) {
    vm.runInContext(fs.readFileSync(path.join(REPO, "js", f), "utf8").replace(/\}\)\(window\.SYS[^)]*\);?\s*$/, "})(SYS);"), sb, { filename: f });
  }
  let differ = null;
  for (let len = M.start; len <= M.max; len++) for (const attempt of [0, 1]) for (const correct of [true, false]) {
    if (JSON.stringify(SYS.capNext(len, attempt, correct, M.max)) !== JSON.stringify(CAP.next(len, attempt, correct))) differ = len + "/" + attempt + "/" + correct;
  }
  check("the step rule is the same in the app and on the server", !differ, differ);
  const seqs = CAP.makeSequences(Math.random);
  check("the app unpacks what the server packs", JSON.stringify(SYS.capUnpack(CAP.pack(seqs, "s3ss10n"), "s3ss10n")) === JSON.stringify(seqs));
  check("the age bands are the same", JSON.stringify(SYS.CAP_AGE_BANDS) === JSON.stringify(CAP.AGE_BANDS));
  check("the button's actions are all there", ["cap-open", "cap-band", "cap-start", "cap-key", "cap-close"].every((k) => typeof SYS._main.ACTIONS[k] === "function"));

  console.log("");
  console.log(fails ? fails + " FAILED" : "all passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log("FAIL  " + (e && e.stack || e)); process.exit(1); });

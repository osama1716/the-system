// The cloud save queue in js/cloud.js, driven against a stand-in Firebase
// whose writes resolve only when the test says so.
//
// Saves run as a read-then-write transaction, so a write shows up a tick
// after it is asked for.
//
// A save waits 900 ms so a burst of changes becomes one write. A reload inside
// that wait used to keep the change on the device and lose it from the
// account. What has to hold now: the wait can be flushed; the device remembers
// that it holds a change the account has not got, until the newest save
// lands; an older write landing does not clear that; a refused or throwing
// save leaves it set; and the mark belongs to one account.
const fs = require("fs"), path = require("path"), vm = require("vm");
const REPO = path.resolve(__dirname, "..").split(path.sep).join("/") + "/";

let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = () => new Promise((r) => setImmediate(r));

function makeWorld() {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const writes = [];
  let remoteState = null;
  let throwNext = null;
  let authCallback = null;
  const docRef = (uid) => ({
    set(data) {
      if (throwNext) { const e = throwNext; throwNext = null; throw e; }
      let resolve, reject;
      const promise = new Promise((a, b) => { resolve = a; reject = b; });
      writes.push({ uid, data, resolve, reject });
      return promise;
    },
    get: () => Promise.resolve({ exists: true, data: () => ({ state: remoteState, updatedAt: { toMillis: () => Date.now() } }) }),
    collection: () => ({ doc: () => docRef(uid) }),
  });
  // Transactions as the SDK runs them: the function reads and queues a write,
  // and the write happens when the function has finished. A write that throws
  // rejects the transaction.
  const runTransaction = (fn) => {
    let queued = null;
    const tx = { get: (ref) => ref.get(), set: (ref, data) => { queued = { ref, data }; } };
    return Promise.resolve(fn(tx)).then((result) => {
      if (!queued) return result;
      try {
        return queued.ref.set(queued.data).then(() => result);
      } catch (e) {
        return Promise.reject(e);
      }
    });
  };
  const firestore = () => ({ collection: () => ({ doc: (id) => docRef(id) }), runTransaction });
  firestore.FieldValue = { serverTimestamp: () => "SERVER_TIME" };
  const firebase = {
    initializeApp: () => ({}),
    auth: () => ({ onAuthStateChanged: (cb) => { authCallback = cb; } }),
    firestore,
    functions: () => ({}),
    app: () => ({ functions: () => ({ httpsCallable: () => () => Promise.resolve({ data: {} }) }) }),
  };
  const SYS = {};
  const window = { FIREBASE_CONFIG: { apiKey: "test" }, firebase, SYS };
  const quiet = { log() {}, warn() {}, error() {} };
  const sb = { window, SYS, firebase, localStorage, console: quiet, setTimeout, clearTimeout, Promise, JSON, Object, Array,
    Number, String, Boolean, Date, Math, Map, Set, Error, Blob };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(REPO + "js/cloud.js", "utf8").replace(/\}\)\(window\.SYS[^)]*\);?\s*$/, "})(SYS);"), sb, { filename: "cloud.js" });
  const Cloud = SYS.Cloud;
  if (!Cloud || typeof Cloud.init !== "function") throw new Error("cloud.js no longer exports init()");
  Cloud.init();
  const errors = [];
  Cloud.setPushErrorHandler((e) => errors.push(e));
  const signIn = (uid) => authCallback && authCallback({ uid, email: uid + "@example.com" });
  return { Cloud, writes, errors, signIn, throwOnNextWrite: (e) => { throwNext = e; }, setRemote: (st) => { remoteState = st; } };
}

(async () => {
  console.log("flushing the wait");
  {
    const w = makeWorld();
    w.signIn("alice");
    check("nothing unsaved before any change", w.Cloud.unsavedSince() === null);
    w.Cloud.push({ n: 1 });
    check("a change is remembered as unsaved at once", typeof w.Cloud.unsavedSince() === "number");
    check("and nothing is written during the wait", w.writes.length === 0);
    w.Cloud.flushPush();
    await tick(); await tick(); // the save reads the account's copy first, in a transaction
    check("flushing writes it now", w.writes.length === 1 && w.writes[0].data.state.n === 1);
    w.Cloud.flushPush();
    await tick(); await tick(); // the save reads the account's copy first, in a transaction
    check("a second flush with nothing waiting writes nothing", w.writes.length === 1);
    check("still unsaved while the write is in flight", w.Cloud.unsavedSince() !== null);
    w.writes[0].resolve();
    await tick(); await tick();
    check("cleared once it lands", w.Cloud.unsavedSince() === null);
  }

  console.log("");
  console.log("the wait still works on its own");
  {
    const w = makeWorld();
    w.signIn("alice");
    w.Cloud.push({ n: 1 });
    w.Cloud.push({ n: 2 });
    w.Cloud.push({ n: 3 });
    await wait(1000);
    check("a burst becomes one write of the last state", w.writes.length === 1 && w.writes[0].data.state.n === 3, JSON.stringify(w.writes.map((x) => x.data.state.n)));
    w.writes[0].resolve();
    await tick(); await tick();
    check("and landing clears the mark", w.Cloud.unsavedSince() === null);
  }

  console.log("");
  console.log("an older write landing does not clear a newer change");
  {
    const w = makeWorld();
    w.signIn("alice");
    w.Cloud.push({ n: 1 });
    w.Cloud.flushPush();
    await tick(); await tick(); // the save reads the account's copy first, in a transaction
    const first = w.Cloud.unsavedSince();
    w.Cloud.push({ n: 2 });                // waiting, not yet written
    w.writes[0].resolve();                  // the older write lands
    await tick(); await tick();
    check("still unsaved: the newer change is waiting", w.Cloud.unsavedSince() !== null);
    check("and it still dates from the first unsaved change", w.Cloud.unsavedSince() === first);
    w.Cloud.flushPush();
    await tick(); await tick(); // the save reads the account's copy first, in a transaction
    w.Cloud.push({ n: 3 });
    w.Cloud.flushPush();
    await tick(); await tick(); // the save reads the account's copy first, in a transaction                    // two writes in flight now
    w.writes[1].resolve();                  // the middle one lands first
    await tick(); await tick();
    check("still unsaved: the newest write has not landed", w.Cloud.unsavedSince() !== null);
    w.writes[2].resolve();
    await tick(); await tick();
    check("cleared when the newest one lands", w.Cloud.unsavedSince() === null);
  }

  console.log("");
  console.log("failures leave the mark");
  {
    const w = makeWorld();
    w.signIn("alice");
    w.Cloud.push({ n: 1 });
    w.Cloud.flushPush();
    await tick(); await tick(); // the save reads the account's copy first, in a transaction
    const err = Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    w.writes[0].reject(err);
    await tick(); await tick();
    check("a refused save stays unsaved", w.Cloud.unsavedSince() !== null);
    check("and is reported", w.errors.length === 1 && w.errors[0].code === "permission-denied");

    w.throwOnNextWrite(Object.assign(new Error("Nested arrays are not supported"), { code: "invalid-argument" }));
    w.Cloud.push({ n: 2 });
    let threw = false;
    try { w.Cloud.flushPush(); } catch (e) { threw = true; }
    await tick(); await tick();
    await tick(); await tick();
    check("a save that throws does not throw out of the queue", !threw);
    check("it is reported like any other failure", w.errors.length === 2 && w.errors[1].code === "invalid-argument");
    check("and stays unsaved", w.Cloud.unsavedSince() !== null);
  }

  console.log("");
  console.log("the mark belongs to one account");
  {
    const w = makeWorld();
    w.signIn("alice");
    w.Cloud.push({ n: 1 });
    check("alice has an unsaved change", w.Cloud.unsavedSince() !== null);
    w.signIn("bob");
    check("bob, on the same device, does not inherit it", w.Cloud.unsavedSince() === null);
    w.signIn("alice");
    check("and alice still has it", w.Cloud.unsavedSince() !== null);
    w.Cloud.clearUnsaved();
    check("clearUnsaved clears it", w.Cloud.unsavedSince() === null);
  }

  console.log("");
  console.log("another device wrote since this one last synced");
  {
    const w = makeWorld();
    w.signIn("alice");
    w.Cloud.push({ n: 1, a: 1 });
    w.Cloud.flushPush();
    await tick(); await tick();
    w.writes[0].resolve();
    await tick(); await tick();
    check("a landed save becomes the base", JSON.stringify(w.Cloud.getBase()) === JSON.stringify({ n: 1, a: 1 }));
    const seen = [];
    w.Cloud.setMergeHandler((base, local, remote) => { seen.push({ base, local, remote }); return { state: { n: local.n, a: remote.a }, standingConflict: false }; });
    const adopted = [];
    w.Cloud.setMergedWriteHandler((written, sent) => adopted.push({ written, sent }));
    w.setRemote({ n: 1, a: 2 });            // the laptop changed `a`
    w.Cloud.push({ n: 5, a: 1 });          // this device changed `n`
    w.Cloud.flushPush();
    await tick(); await tick();
    check("the merge is asked with base, this copy and the account's", seen.length === 1 && seen[0].base.n === 1 && seen[0].local.n === 5 && seen[0].remote.a === 2);
    check("what is written is the merge, not this copy", w.writes[1] && w.writes[1].data.state.n === 5 && w.writes[1].data.state.a === 2);
    w.writes[1].resolve();
    await tick(); await tick();
    check("the app is told, to take the merge in", adopted.length === 1 && adopted[0].written.a === 2);
    check("and the merge becomes the base", w.Cloud.getBase().a === 2 && w.Cloud.getBase().n === 5);
    w.setRemote({ n: 5, a: 2 });
    w.Cloud.push({ n: 6, a: 2 });
    w.Cloud.flushPush();
    await tick(); await tick();
    check("an account copy equal to the base is simply written over", seen.length === 1 && w.writes[2].data.state.n === 6);
  }

  console.log("");
  console.log("signed out, nothing is queued or remembered");
  {
    const w = makeWorld();
    w.Cloud.push({ n: 1 });
    w.Cloud.flushPush();
    await tick(); await tick(); // the save reads the account's copy first, in a transaction
    check("no write and no mark without an account", w.writes.length === 0 && w.Cloud.unsavedSince() === null);
  }

  console.log("");
  console.log("in step with the account");
  {
    const w = makeWorld();
    w.signIn("alice");
    check("a device that never synced is not in step", w.Cloud.hasSyncedHere() === false);
    w.Cloud.push({ n: 1 });
    w.Cloud.flushPush();
    await tick(); await tick(); // the save reads the account's copy first, in a transaction
    w.writes[0].resolve();
    await tick(); await tick();
    check("a landed save puts it in step", w.Cloud.hasSyncedHere() === true);
    w.signIn("bob");
    check("per account: bob is not in step on this device", w.Cloud.hasSyncedHere() === false);
    w.Cloud.markSyncedHere();
    check("taking the account's copy puts bob in step", w.Cloud.hasSyncedHere() === true);
  }

  console.log("");
  console.log("deciding between two different copies");
  {
    const w = makeWorld();
    const d = (over) => w.Cloud.decideSync(Object.assign({
      journalKnown: true, localMatches: true, cloudMatches: true, deviceIsNewer: false, deviceBehind: false,
    }, over));
    // The reported bug: a change on the phone, then the laptop opens.
    check("laptop behind, phone changed EXP: take the account's copy",
      d({ localMatches: false, cloudMatches: true, deviceBehind: true }) === "take-cloud");
    check("laptop behind, phone changed something else: take the account's copy",
      d({ deviceBehind: true }) === "take-cloud");
    check("laptop behind and the journal cannot be read: still take it",
      d({ journalKnown: false, localMatches: false, cloudMatches: false, deviceBehind: true }) === "take-cloud");
    // This device is ahead.
    check("an unsaved change here, newer than the account copy: push it",
      d({ deviceIsNewer: true }) === "push-local");
    check("the journal vouches for this device and not the account: push it",
      d({ localMatches: true, cloudMatches: false }) === "push-local");
    check("…even when this device looked behind",
      d({ localMatches: true, cloudMatches: false, deviceBehind: true }) === "push-local");
    // Genuinely unclear.
    check("both copies changed (unsaved here, not newer): ask", d({}) === "ask");
    check("a device never in step with this account: ask",
      d({ localMatches: false, cloudMatches: true }) === "ask");
    check("the journal contradicts both: ask",
      d({ localMatches: false, cloudMatches: false, deviceBehind: true }) === "ask");
    check("no journal and not known to be behind: ask",
      d({ journalKnown: false, localMatches: false, cloudMatches: false }) === "ask");
  }

  console.log("");
  console.log(fails ? fails + " FAILED" : "all passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log("  FAIL  crashed: " + (e && e.stack)); process.exit(1); });

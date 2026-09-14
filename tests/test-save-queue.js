// The cloud save queue in js/cloud.js, driven against a stand-in Firebase
// whose writes resolve only when the test says so.
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
    get: () => Promise.resolve({ exists: true, data: () => ({ updatedAt: { toMillis: () => Date.now() } }) }),
    collection: () => ({ doc: () => docRef(uid) }),
  });
  const firestore = () => ({ collection: () => ({ doc: (id) => docRef(id) }) });
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
  return { Cloud, writes, errors, signIn, throwOnNextWrite: (e) => { throwNext = e; } };
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
    check("flushing writes it now", w.writes.length === 1 && w.writes[0].data.state.n === 1);
    w.Cloud.flushPush();
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
    const first = w.Cloud.unsavedSince();
    w.Cloud.push({ n: 2 });                // waiting, not yet written
    w.writes[0].resolve();                  // the older write lands
    await tick(); await tick();
    check("still unsaved: the newer change is waiting", w.Cloud.unsavedSince() !== null);
    check("and it still dates from the first unsaved change", w.Cloud.unsavedSince() === first);
    w.Cloud.flushPush();
    w.Cloud.push({ n: 3 });
    w.Cloud.flushPush();                    // two writes in flight now
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
  console.log("signed out, nothing is queued or remembered");
  {
    const w = makeWorld();
    w.Cloud.push({ n: 1 });
    w.Cloud.flushPush();
    check("no write and no mark without an account", w.writes.length === 0 && w.Cloud.unsavedSince() === null);
  }

  console.log("");
  console.log(fails ? fails + " FAILED" : "all passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log("  FAIL  crashed: " + (e && e.stack)); process.exit(1); });

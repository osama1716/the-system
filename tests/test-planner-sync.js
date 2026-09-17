// The planner's item-by-item sync (js/planner-sync.js), pure parts. Two
// devices are simulated as two stores passing documents through a fake server.
const fs = require("fs"), path = require("path"), vm = require("vm");
const REPO = path.resolve(__dirname, "..").split(path.sep).join("/") + "/";
const SYS = {};
let n = 0;
const sb = { SYS, window: { localStorage: { getItem: () => null, setItem: () => {} } }, console, Math, JSON, Object, Array, Number, String, Boolean, RegExp, Date, Set, Map, Intl,
  crypto: { randomUUID: () => "id" + (++n) }, setTimeout: () => 0, clearTimeout: () => {} };
vm.createContext(sb);
for (const f of ["constants.js", "engine.js", "planner.js", "planner-sync.js"]) {
  vm.runInContext(fs.readFileSync(path.join(REPO, "js", f), "utf8")
    .replace(/\}\)\(window\.SYS[^)]*\);?\s*$/, "})(SYS);"), sb, { filename: f });
}
const C = SYS.PlannerSync.core;
let fails = 0;
const check = (name, c, d) => { if (!c) { fails++; console.log("  FAIL  " + name + (d ? "  " + d : "")); } else console.log("  ok    " + name); };

// A server that stores what devices send and hands back everything newer
// than a cursor, stamping each write with its own clock.
function server() {
  const docs = {};
  let clock = 1000;
  return {
    write(items) { items.forEach((it) => { docs[it.id] = { id: it.id, kind: it.kind, data: it.deleted ? null : JSON.parse(JSON.stringify(it.data)), u: it.u, deleted: !!it.deleted, s: ++clock }; }); },
    since(cursor) { return Object.values(docs).filter((d) => d.s > cursor).map((d) => ({ ...d, data: d.data && reorder(d.data) })); },
    docs,
  };
}
// Firestore gives map keys back in its own order.
function reorder(o) {
  if (Array.isArray(o)) return o.map(reorder);
  if (!o || typeof o !== "object") return o;
  const out = {};
  Object.keys(o).sort().reverse().forEach((k) => { out[k] = reorder(o[k]); });
  return out;
}
function device(uid) {
  const store = C.emptyStore();
  C.adoptUser(store, uid);
  return {
    store,
    planner() { return C.view(store); },
    change(fn, now) { const p = C.view(store); fn(p); return C.commit(store, p, now); },
    push(srv) { const sent = store.outbox.map((id) => ({ id, ...store.items[id] })); srv.write(sent); C.acknowledge(store, sent.map((x) => ({ id: x.id, u: x.u }))); return sent.length; },
    pull(srv) { return C.applyRemote(store, srv.since(store.cursor)); },
  };
}
const holder = (p) => ({ planner: p });

console.log("");
console.log("two devices, each adding something before either syncs");
{
  const srv = server();
  const phone = device("u1"), laptop = device("u1");
  phone.change((p) => SYS.addEvent(holder(p), { id: "ev1", title: "Dentist", start: "2026-09-18", from: "16:00", to: "17:00", now: 1 }), 100);
  laptop.change((p) => SYS.addTodo(holder(p), { id: "td1", title: "Buy milk", day: "2026-09-18", today: "2026-09-18", now: 2 }), 110);
  phone.push(srv); laptop.push(srv);
  phone.pull(srv); laptop.pull(srv);
  const a = phone.planner(), b = laptop.planner();
  check("the phone has both", a.events.length === 1 && a.todos.length === 1);
  check("the laptop has both", b.events.length === 1 && b.todos.length === 1);
  check("nothing is left to send", phone.store.outbox.length === 0 && laptop.store.outbox.length === 0);
  check("the server's key order is not mistaken for a change", phone.change(() => {}, 120) === 0 && laptop.change(() => {}, 120) === 0);
}

console.log("");
console.log("the same item changed on both");
{
  const srv = server();
  const phone = device("u1"), laptop = device("u1");
  phone.change((p) => SYS.addTodo(holder(p), { id: "t", title: "v1", day: "2026-09-18", today: "2026-09-18" }), 100);
  phone.push(srv); laptop.pull(srv);
  phone.change((p) => SYS.renameTodo(holder(p), "t", "phone edit"), 200);
  laptop.change((p) => SYS.renameTodo(holder(p), "t", "laptop edit"), 300);
  phone.push(srv); laptop.push(srv);
  phone.pull(srv); laptop.pull(srv);
  check("the later change wins on both", phone.planner().todos[0].title === "laptop edit" && laptop.planner().todos[0].title === "laptop edit",
    phone.planner().todos[0].title + " / " + laptop.planner().todos[0].title);
}

console.log("");
console.log("a deletion reaches a device that was offline");
{
  const srv = server();
  const phone = device("u1"), laptop = device("u1");
  phone.change((p) => SYS.addEvent(holder(p), { id: "e", title: "Gym", start: "2026-09-18", from: "18:00", to: "19:00" }), 100);
  phone.push(srv); laptop.pull(srv);
  phone.change((p) => SYS.deleteEvent(holder(p), "e", "2026-09-18", "all"), 200);
  phone.push(srv);
  check("the server keeps a tombstone", srv.docs.e && srv.docs.e.deleted === true);
  laptop.pull(srv);
  check("the laptop drops it", laptop.planner().events.length === 0);
  check("and does not send it back", laptop.change(() => {}, 300) === 0 && laptop.store.outbox.length === 0);
}

console.log("");
console.log("an old copy inside a saved state");
{
  const srv = server();
  const phone = device("u1"), laptop = device("u1");
  const old = { todos: [{ id: "old1", title: "From before", day: "2026-09-10", done: false, createdAt: 1 }], events: [] };
  check("its items are taken", C.absorb(phone.store, old) === 1 && phone.planner().todos.length === 1);
  check("taken once", C.absorb(phone.store, old) === 0);
  phone.push(srv); laptop.pull(srv);
  laptop.change((p) => SYS.deleteTodo(holder(p), "old1"), 500);
  laptop.push(srv); phone.pull(srv);
  check("deleted elsewhere", phone.planner().todos.length === 0);
  check("a stale state brought back later does not revive it", C.absorb(phone.store, old) === 0 && phone.planner().todos.length === 0);
  // A device that still had the old copy reads the server before it sends
  // anything (see heardFromServer in planner-sync.js).
  const fresh = device("u1");
  C.absorb(fresh.store, old);
  fresh.pull(srv);
  check("nor on a device that still had it: the server's delete is newer", fresh.planner().todos.length === 0 && fresh.store.outbox.length === 0);
  fresh.push(srv);
  check("so there is nothing to send back", srv.docs.old1.deleted === true);
}

console.log("");
console.log("waiting changes and a different account");
{
  const srv = server();
  const phone = device("u1");
  phone.change((p) => SYS.addTodo(holder(p), { id: "w", title: "offline edit", day: "2026-09-18", today: "2026-09-18" }), 900);
  srv.write([{ id: "w", kind: "todo", data: { id: "w", title: "older on server", day: "2026-09-18", done: false, doneAt: null, createdAt: 0, from: null, asked: false }, u: 800, deleted: false }]);
  phone.pull(srv);
  check("a newer change waiting to go out is kept", phone.planner().todos[0].title === "offline edit" && phone.store.outbox.includes("w"));
  C.adoptUser(phone.store, "u2");
  check("another account starts empty", phone.planner().todos.length === 0 && phone.store.outbox.length === 0 && phone.store.cursor === 0);
  const anon = C.emptyStore();
  C.commit(anon, { todos: [{ id: "x", title: "signed out", day: "2026-09-18", done: false, doneAt: null, createdAt: 0, from: null, asked: false }], events: [] }, 5);
  C.adoptUser(anon, "u3");
  check("what was written signed out goes to whoever signs in", anon.uid === "u3" && anon.outbox.includes("x"));
}

console.log("");
console.log(fails ? fails + " FAIL" : "all passed");
process.exit(fails ? 1 : 0);

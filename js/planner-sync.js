// Where the planner lives: one record per to-do and per event, outside the
// saved state.
//
// It used to ride inside the one state document, and that cost two things.
// The document has a size limit, so old days had to be pruned; and the whole
// document syncs as one piece, so an event added on the phone and a to-do
// added on the laptop before either synced meant one of them was lost. As
// separate records, each item syncs on its own and nothing needs pruning.
//
// The shape of it:
// - `items` holds every item this device knows, keyed by id, each with the
//   time it was last changed (`u`). A deleted item stays as a tombstone
//   (`deleted: true`), so a device that was offline when it was deleted
//   learns about it instead of putting it back.
// - `outbox` lists the ids changed here and not yet confirmed by the server.
// - `cursor` is the server time of the newest change already seen, so opening
//   the app reads only what changed since, not everything again.
// The newer `u` wins when two devices changed the same item.
//
// Everything in `core` is pure and is tested in tests/test-planner-sync.js;
// the rest is localStorage and the listener.
(function (SYS) {
  "use strict";

  const KEY = "the-system:planner";
  const BATCH = 400;

  function emptyStore() { return { uid: null, items: {}, outbox: [], cursor: 0 }; }

  function queue(store, id) {
    if (store.outbox.indexOf(id) < 0) store.outbox.push(id);
  }

  // The planner as the app uses it, built from the live items.
  function view(store) {
    const todos = [], events = [];
    Object.keys(store.items).forEach((id) => {
      const it = store.items[id];
      if (!it || it.deleted || !it.data) return;
      (it.kind === "todo" ? todos : events).push(it.data);
    });
    const holder = { planner: { todos, events } };
    SYS.normalizePlanner(holder);
    return holder.planner;
  }

  function listsOf(planner) {
    const out = [];
    ((planner && planner.todos) || []).forEach((x) => { if (x && x.id) out.push({ kind: "todo", data: x }); });
    ((planner && planner.events) || []).forEach((x) => { if (x && x.id) out.push({ kind: "event", data: x }); });
    return out;
  }

  // A planner found inside an old saved state. Only ids this device has never
  // seen are taken, and as older than any real change (u: 1): a tombstone or
  // a newer edit from another device always wins over a copy from before.
  function absorb(store, planner) {
    let taken = 0;
    listsOf(planner).forEach(({ kind, data }) => {
      if (store.items[data.id]) return;
      store.items[data.id] = { kind, data, u: 1, deleted: false };
      queue(store, data.id);
      taken++;
    });
    return taken;
  }

  // Records what the app's planner now holds: new and changed items get a new
  // time and go out; items that are gone become tombstones and go out.
  // Compared with deepEqual rather than JSON, because the server hands maps
  // back with their keys in its own order.
  function commit(store, planner, now) {
    const at = now || Date.now();
    const present = new Set();
    let changed = 0;
    listsOf(planner).forEach(({ kind, data }) => {
      present.add(data.id);
      const prev = store.items[data.id];
      if (prev && !prev.deleted && prev.kind === kind && SYS.deepEqual(prev.data, data)) return;
      store.items[data.id] = { kind, data: JSON.parse(JSON.stringify(data)), u: Math.max(at, prev ? prev.u + 1 : 0), deleted: false };
      queue(store, data.id);
      changed++;
    });
    Object.keys(store.items).forEach((id) => {
      const it = store.items[id];
      if (it.deleted || present.has(id)) return;
      store.items[id] = { kind: it.kind, data: null, u: Math.max(at, it.u + 1), deleted: true };
      queue(store, id);
      changed++;
    });
    return changed;
  }

  // Changes from the server. A newer local change still waiting to go out is
  // kept; otherwise the server's copy is taken. The cursor only moves on
  // changes the server has actually stamped.
  function applyRemote(store, docs) {
    let changed = 0;
    docs.forEach((d) => {
      if (!d || !d.id || (d.kind !== "todo" && d.kind !== "event")) return;
      const local = store.items[d.id];
      const waiting = store.outbox.indexOf(d.id) >= 0;
      if (!local || d.u > local.u || (d.u === local.u && !waiting)) {
        const next = { kind: d.kind, data: d.deleted ? null : d.data, u: d.u, deleted: !!d.deleted };
        const same = local && local.u === next.u && local.deleted === next.deleted && SYS.deepEqual(local.data, next.data);
        store.items[d.id] = next;
        if (!same) changed++;
      }
      if (waiting && local && d.u >= local.u && !d.pending) store.outbox = store.outbox.filter((x) => x !== d.id);
      if (!d.pending && d.s > store.cursor) store.cursor = d.s;
    });
    return changed;
  }

  // The server confirmed these writes. An item changed again since stays
  // queued for its newer version.
  function acknowledge(store, sent) {
    sent.forEach(({ id, u }) => {
      const it = store.items[id];
      if (it && it.u === u) store.outbox = store.outbox.filter((x) => x !== id);
    });
  }

  // Signing in as someone else must not show, or upload, the last account's
  // planner. Items written while signed out belong to whoever signs in next.
  function adoptUser(store, uid) {
    if (store.uid && uid && store.uid !== uid) {
      store.items = {};
      store.outbox = [];
      store.cursor = 0;
    }
    if (uid) store.uid = uid;
  }

  const core = { emptyStore, view, absorb, commit, applyRemote, acknowledge, adoptUser };

  // ---------- the device's copy ----------

  let store = null;
  function load() {
    if (store) return store;
    try {
      const raw = window.localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      store = parsed && typeof parsed === "object" && parsed.items ? { ...emptyStore(), ...parsed } : emptyStore();
      if (!Array.isArray(store.outbox)) store.outbox = [];
    } catch (e) {
      store = emptyStore();
    }
    return store;
  }
  function save() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(load()));
    } catch (e) {
      console.warn("[TheSystem] couldn't save the planner on this device.", e);
    }
  }

  // ---------- the server ----------

  let unwatch = null;
  // Nothing goes out until the server's copy has been read once. A device
  // holding an old copy of something deleted elsewhere would otherwise send
  // it back before hearing that it was deleted, and the server keeps the last
  // write it is given.
  let heardFromServer = false;
  let onRemoteChange = null;
  let flushTimer = null;
  let flushing = false;

  function flushSoon() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => { flushTimer = null; flush(); }, 150);
  }

  function flush() {
    const s = load();
    if (flushing || !heardFromServer || !s.outbox.length || !unwatch || !SYS.Cloud || !SYS.Cloud.writePlannerItems) return;
    const ids = s.outbox.slice(0, BATCH);
    const sent = ids.map((id) => ({ id, ...s.items[id] })).filter((x) => x.kind);
    flushing = true;
    SYS.Cloud.writePlannerItems(sent)
      .then(() => {
        acknowledge(s, sent.map((x) => ({ id: x.id, u: x.u })));
        save();
        flushing = false;
        if (s.outbox.length) flushSoon();
      })
      .catch((e) => {
        flushing = false;
        console.warn("[TheSystem] planner sync failed; will retry", e);
      });
  }

  function attach(uid, onChange) {
    const s = load();
    detach();
    adoptUser(s, uid);
    save();
    onRemoteChange = onChange;
    if (!SYS.Cloud || !SYS.Cloud.watchPlannerItems) return;
    heardFromServer = false;
    unwatch = SYS.Cloud.watchPlannerItems(s.cursor, (docs) => {
      heardFromServer = true;
      const changed = applyRemote(load(), docs);
      save();
      if (changed && onRemoteChange) onRemoteChange();
      flush();
    }, (e) => console.warn("[TheSystem] planner listener stopped", e));
  }

  function detach() {
    if (unwatch) { try { unwatch(); } catch (e) { /* already gone */ } }
    unwatch = null;
    heardFromServer = false;
  }

  SYS.PlannerSync = {
    core,
    view: () => view(load()),
    absorbLegacy(planner) {
      const n = absorb(load(), planner);
      if (n) { save(); flushSoon(); }
      return n;
    },
    commit(planner) {
      const n = commit(load(), planner);
      if (n) { save(); flushSoon(); }
      return n;
    },
    attach, detach, flush,
  };
})(window.SYS = window.SYS || {});

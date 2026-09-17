// Putting two copies of the saved state back together.
//
// Until this existed, two copies that differed — a change on the phone, a
// different change on the laptop — could only be settled by keeping one and
// losing the other, which is why the app asked "which copy do you want to
// keep?". With the copy both started from (the last one this device synced,
// `base`), each side's own changes can be seen and kept:
//
// - Habits and quests merge one by one, and inside each one field by field;
//   a habit's days merge day by day. A task added on one side stays; a task
//   deleted on one side goes, unless the other side changed it meanwhile.
// - Settings merge key by key; the display name on its own.
// - The standing — player EXP, level and rank, the trait levels, the level
//   history, the log and the daily stats — moves as one piece, because its
//   parts only make sense together (the history undoes exactly the levels
//   the traits hold). When only one side changed it, that side is taken
//   whole. When both did, the account's copy is taken and `standingConflict`
//   says so: main.js then corrects the total from the EXP journal, which has
//   every device's EXP in it.
//
// Where both sides changed the very same value, the account's copy wins: it
// is the one other devices may already have seen.
(function (SYS) {
  "use strict";

  const eq = (a, b) => SYS.deepEqual(a, b);
  const STANDING_KEYS = ["intelligences", "levelHistory", "log", "dailyStats"];
  const DATE_KEYED = ["days", "marks", "volByMonth"];
  const isMap = (v) => Object.prototype.toString.call(v) === "[object Object]";

  // One value on three sides.
  function pick(base, local, remote) {
    if (eq(local, base)) return { value: remote, conflict: false };
    if (eq(remote, base) || eq(local, remote)) return { value: local, conflict: false };
    return { value: remote, conflict: true };
  }

  // An object merged key by key. A key missing on a side was deleted there
  // if the base had it, and never added there if it did not.
  function mergeKeys(base, local, remote, mergeValue) {
    const b = base || {}, l = local || {}, r = remote || {};
    const keys = [];
    [r, l, b].forEach((o) => Object.keys(o).forEach((k) => { if (keys.indexOf(k) < 0) keys.push(k); }));
    const out = {};
    let conflicts = 0;
    keys.forEach((k) => {
      const inB = Object.prototype.hasOwnProperty.call(b, k);
      const inL = Object.prototype.hasOwnProperty.call(l, k);
      const inR = Object.prototype.hasOwnProperty.call(r, k);
      if (inL && inR) {
        const m = mergeValue ? mergeValue(inB ? b[k] : undefined, l[k], r[k], k) : pick(inB ? b[k] : undefined, l[k], r[k]);
        out[k] = m.value;
        if (m.conflict) conflicts++;
      } else if (inL || inR) {
        const kept = inL ? l[k] : r[k];
        // Only on one side: added there, or deleted on the other. A deletion
        // stands only if the side that kept it left it as it was.
        if (!inB || !eq(kept, b[k])) out[k] = kept;
      }
    });
    return { value: out, conflicts };
  }

  function mergeTask(base, local, remote) {
    if (base === undefined) return pick(base, local, remote);
    const m = mergeKeys(base, local, remote, (b, l, r, key) => {
      // A habit's record of days (and the sealed verdicts and monthly totals
      // kept beside it) is keyed by date: one device logging Monday and the
      // other Tuesday are two changes, not a conflict.
      if (DATE_KEYED.indexOf(key) >= 0 && isMap(l) && isMap(r)) {
        const inner = mergeKeys(isMap(b) ? b : {}, l, r);
        return { value: inner.value, conflict: inner.conflicts > 0 };
      }
      return pick(b, l, r);
    });
    return { value: m.value, conflict: m.conflicts > 0 };
  }

  // Tasks keep the account's order, with this device's new ones after it.
  function mergeTasks(base, local, remote) {
    const byId = (list) => {
      const map = {};
      (Array.isArray(list) ? list : []).forEach((t) => { if (t && t.id != null) map[t.id] = t; });
      return map;
    };
    const m = mergeKeys(byId(base), byId(local), byId(remote), mergeTask);
    const order = [];
    (Array.isArray(remote) ? remote : []).concat(Array.isArray(local) ? local : []).forEach((t) => {
      if (t && t.id != null && Object.prototype.hasOwnProperty.call(m.value, t.id) && order.indexOf(t.id) < 0) order.push(t.id);
    });
    return { value: order.map((id) => m.value[id]), conflicts: m.conflicts };
  }

  function standingOf(s) {
    const out = {};
    if (s && s.player) {
      const { name, ...rest } = s.player;
      out.player = rest;
    }
    STANDING_KEYS.forEach((k) => { if (s && k in s) out[k] = s[k]; });
    return out;
  }

  function mergeStates(base, local, remote) {
    const b = base || {}, l = local || {}, r = remote || {};
    const out = {};
    let conflicts = 0;

    const tasks = mergeTasks(b.tasks, l.tasks, r.tasks);
    out.tasks = tasks.value;
    conflicts += tasks.conflicts;

    const settings = mergeKeys(b.settings, l.settings, r.settings);
    out.settings = settings.value;
    conflicts += settings.conflicts;

    const standing = pick(standingOf(b), standingOf(l), standingOf(r));
    const name = pick(b.player && b.player.name, l.player && l.player.name, r.player && r.player.name);
    if (name.conflict) conflicts++;
    out.player = { ...(standing.value.player || {}) };
    if (name.value !== undefined) out.player.name = name.value;
    STANDING_KEYS.forEach((k) => { if (k in standing.value) out[k] = standing.value[k]; });

    // Everything else there is, whole.
    const rest = new Set([...Object.keys(r), ...Object.keys(l)]);
    ["tasks", "settings", "player", "planner"].concat(STANDING_KEYS).forEach((k) => rest.delete(k));
    rest.forEach((k) => {
      if (k === "schema") { out.schema = Math.max(Number(l.schema) || 0, Number(r.schema) || 0) || l.schema || r.schema; return; }
      const m = pick(b[k], l[k], r[k]);
      if (m.value !== undefined) out[k] = m.value;
      if (m.conflict) conflicts++;
    });

    return { state: out, standingConflict: standing.conflict, conflicts };
  }

  SYS.mergeStates = mergeStates;
})(window.SYS = window.SYS || {});

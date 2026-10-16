// Game rules: EXP conversion, skill-point allocation, task/trait mutations.
// Every function takes a state object it is allowed to mutate in place (callers
// pass a fresh clone) and returns { notifications } describing what happened,
// so the UI layer can render toasts without knowing any game-rule details.
// Game rules, the base: cloning and comparing state, EXP from points, progress reports, the reflection gate on big quests, week keys.
// One of the files engine.js was split into (2026-10-16); the names they share travel through
// SYS._engine, and each file takes what it needs from the files loaded before it.
(function (SYS) {
  "use strict";
  const E = SYS._engine || (SYS._engine = {});
  // Defined in a file that loads after this one; looked up when called.
  const shiftDay = (...args) => E.shiftDay(...args);
  const todayKey = (...args) => E.todayKey(...args);

  // i18n.js loads before this file in index.html, so SYS.t is there in the app.
  // Guarded anyway: this file is the EXP ledger, and it must not be brought
  // down by the absence of a translation table. Falls back to the key, exactly
  // as SYS.t itself does for a string it does not have.
  function tr(key, vars) {
    return typeof SYS.t === "function" ? SYS.t(key, vars) : key;
  }


  function clone(x) {
    return typeof structuredClone === "function" ? structuredClone(x) : JSON.parse(JSON.stringify(x));
  }
  SYS.clone = clone;

  // Key-order-independent structural equality for two JSON-shaped state
  // trees (used to tell "cloud copy exists" apart from "cloud copy actually
  // differs from what's already here" when reconciling cloud sync — a plain
  // JSON.stringify comparison would false-positive on harmless key reordering
  // from a Firestore round-trip).
  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
      return true;
    }
    const aKeys = Object.keys(a), bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  SYS.deepEqual = deepEqual;

  // What actually differs between two copies of the state, in words.
  //
  // The sync prompt asked which copy to keep without ever saying what was at
  // stake, so answering it was a guess. It also made a repeating prompt
  // impossible to diagnose: something kept disagreeing on every launch and
  // there was no way to see what. Both are the same missing sentence.
  //
  // Deliberately shallow and bounded — this describes a disagreement, it does
  // not dump the state. Counts and field names, never whole records.
  function countOf(v) {
    if (Array.isArray(v)) return v.length + " item(s)";
    if (v && typeof v === "object") return Object.keys(v).length + " entr(ies)";
    if (v === undefined) return "missing";
    return JSON.stringify(v);
  }

  function describeValueDiff(a, b) {
    if (Array.isArray(a) || Array.isArray(b)) {
      const la = Array.isArray(a) ? a.length : 0, lb = Array.isArray(b) ? b.length : 0;
      if (la !== lb) return "this device " + la + ", account " + lb;
      return "same count (" + la + "), different contents";
    }
    if (a && b && typeof a === "object" && typeof b === "object") {
      const fields = [...new Set([...Object.keys(a), ...Object.keys(b)])]
        .filter((k) => !deepEqual(a[k], b[k]));
      if (!fields.length) return "different";
      // Named fields with values are what makes a player mismatch readable.
      return fields.slice(0, 6).map((k) => {
        const av = a[k], bv = b[k];
        const scalar = (x) => x === null || typeof x !== "object";
        return scalar(av) && scalar(bv)
          ? k + ": " + JSON.stringify(av) + " vs " + JSON.stringify(bv)
          : k + " (" + countOf(av) + " vs " + countOf(bv) + ")";
      }).join(", ") + (fields.length > 6 ? ", +" + (fields.length - 6) + " more" : "");
    }
    return countOf(a) + " vs " + countOf(b);
  }

  // local first, cloud second, in every pair — matching the order the two
  // buttons are offered in, so the reader is never guessing which is which.
  SYS.describeStateDiff = function (local, cloud) {
    const a = local || {}, b = cloud || {};
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
      .filter((k) => !deepEqual(a[k], b[k]))
      .map((k) => ({ key: k, detail: describeValueDiff(a[k], b[k]) }));
  };

  // A task's value and its EXP are the same number. Kept as a named function
  // rather than inlined so the one place that decides this stays findable.
  function ptToExp(pt) {
    return Number(pt) || 0;
  }
  SYS.ptToExp = ptToExp;

  // How far back a habit day can still be marked done: today and the three
  // before it. Clearing a day is allowed however old — it only gives back.
  // The server holds the same line (functions/progress.js BACKFILL_DAYS) and
  // pays nothing past it; the app checks it at the controls (main.js) so a
  // tap says so up front rather than looking counted and then quietly not
  // being. Not inside logHabitDay itself: the engine also replays history —
  // imports, tests, the stats that are built from old days — and that is not
  // somebody marking a day.
  const HABIT_BACKFILL_DAYS = 3;
  SYS.HABIT_BACKFILL_DAYS = HABIT_BACKFILL_DAYS;
  function canLogHabitDay(key) {
    return key <= todayKey() && key >= shiftDay(todayKey(), -HABIT_BACKFILL_DAYS);
  }
  SYS.canLogHabitDay = canLogHabitDay;

  // A progress report with no EXP attached. The journal hook in applyExpDelta
  // only fires when EXP moves; this is for the progress the server still has
  // to hear about when it does not. Same guard as that hook, so a reconcile or
  // a replay never reports anything.
  function reportProgress(t, progress) {
    if (!t || !t.priceId || SYS.suppressExpJournal || typeof SYS.onProgressReport !== "function") return;
    try { SYS.onProgressReport({ priceId: t.priceId, progress }, t.title); }
    catch (e) { console.warn("[TheSystem] progress report hook failed", e); }
  }

  // ---------- the reflection question (phase 5) ----------
  //
  // Mirrors functions/reflection.js and the gate in functions/progress.js, so
  // what this device grants is what the server pays: a gated quest shows its
  // held points as held, rather than granting them and having the next
  // reconcile take them back. tests/test-reflection.js holds the two together.
  const REFLECTION_THRESHOLD_PT = 300;
  const REFLECTION_CHECKPOINTS = [50, 100];
  SYS.REFLECTION_THRESHOLD_PT = REFLECTION_THRESHOLD_PT;
  SYS.REFLECTION_CHECKPOINTS = REFLECTION_CHECKPOINTS;

  // Only a priced quest can be gated: the server gates by the price record.
  function isGatedTask(t) {
    return !!t && !t.recurring && !!t.priceId && (Number(t.pt) || 0) >= REFLECTION_THRESHOLD_PT;
  }
  SYS.isGatedTask = isGatedTask;

  // What was paid before a quest became gated stays paid — the same rule the
  // server applies the first time it sees a ledger under the gate. Stamped
  // once, when a quest first counts as gated.
  function ensureGateSeen(t) {
    if (!isGatedTask(t) || t.gateSeen) return false;
    t.gateSeen = 1;
    t.grandfatheredExp = Math.max(0, Number(t.expBaseline) || 0);
    return true;
  }
  SYS.ensureGateSeen = ensureGateSeen;

  function payableQuestExp(t, completion) {
    const c = Math.max(0, Math.min(100, Number(completion) || 0));
    const full = Math.floor(ptToExp(t.pt) * (c / 100));
    if (!isGatedTask(t)) return full;
    const r = t.reflections || {};
    const accepted = (cp) => !!(r[cp] && r[cp].status === "accepted");
    const firstHalf = Math.floor(ptToExp(t.pt) * (Math.min(c, 50) / 100));
    const payable = (accepted(50) ? firstHalf : 0) + (accepted(100) ? full - firstHalf : 0);
    return Math.min(full, Math.max(payable, Math.max(0, Number(t.grandfatheredExp) || 0)));
  }
  SYS.payableQuestExp = payableQuestExp;

  function heldQuestExp(t) {
    if (!isGatedTask(t)) return 0;
    return Math.floor(ptToExp(t.pt) * ((Number(t.completion) || 0) / 100)) - payableQuestExp(t, t.completion);
  }
  SYS.heldQuestExp = heldQuestExp;

  // The question this quest is waiting on — mirrors reflection.js dueCheckpoint.
  function dueReflection(t) {
    if (!isGatedTask(t)) return null;
    const c = Number(t.completion) || 0;
    const r = t.reflections || {};
    for (const cp of REFLECTION_CHECKPOINTS) {
      if (c < cp) return null;
      const e = r[cp];
      if (!e || !e.status) return cp;
      if (e.status === "held" && (Number(e.attemptsLeft) || 0) > 0) return cp;
    }
    return null;
  }
  SYS.dueReflection = dueReflection;

  function reflectionShape(incoming) {
    const out = {};
    REFLECTION_CHECKPOINTS.forEach((cp) => {
      const e = incoming && incoming[cp];
      if (e && e.status) out[cp] = { status: e.status, reason: String(e.reason || ""), attemptsLeft: Number(e.attemptsLeft) || 0 };
    });
    return out;
  }

  // Answers as the server has them, written onto the tasks. A half that has
  // just been released shows up in the EXP at once, through the same path as
  // any progress — and the report that sends is a no-op on the server, which
  // has already paid it.
  function applyReflections(state, byPrice) {
    const notes = [];
    (state.tasks || []).forEach((t) => {
      if (!t.priceId || !byPrice || !byPrice[t.priceId]) return;
      const incoming = byPrice[t.priceId];
      const next = reflectionShape(incoming);
      let changed = JSON.stringify(next) !== JSON.stringify(t.reflections || {});
      if (Number.isFinite(Number(incoming.grandfathered)) && Number(incoming.grandfathered) !== Number(t.grandfatheredExp)) {
        t.grandfatheredExp = Number(incoming.grandfathered);
        t.gateSeen = 1;
        changed = true;
      }
      if (!changed) return;
      t.reflections = next;
      notes.push(...applyTaskProgress(state, t.id, t.completion));
    });
    return notes;
  }
  SYS.applyReflections = applyReflections;

  function reflectionsDiffer(state, byPrice) {
    return (state.tasks || []).some((t) => {
      const incoming = t.priceId && byPrice && byPrice[t.priceId];
      if (!incoming) return false;
      if (JSON.stringify(reflectionShape(incoming)) !== JSON.stringify(t.reflections || {})) return true;
      return Number.isFinite(Number(incoming.grandfathered)) && Number(incoming.grandfathered) !== Number(t.grandfatheredExp);
    });
  }
  SYS.reflectionsDiffer = reflectionsDiffer;

  // ISO-8601 week key (e.g. "2026-W34") — the boundary a recurring habit's
  // weekly count resets against.
  function isoWeekKey(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    const weekNum = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
    return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
  }
  SYS.isoWeekKey = isoWeekKey;

  Object.assign(E, { tr, clone, deepEqual, countOf, describeValueDiff, ptToExp, HABIT_BACKFILL_DAYS, canLogHabitDay, reportProgress, REFLECTION_THRESHOLD_PT, REFLECTION_CHECKPOINTS, isGatedTask, ensureGateSeen, payableQuestExp, heldQuestExp, dueReflection, reflectionShape, applyReflections, reflectionsDiffer, isoWeekKey });
})(window.SYS = window.SYS || {});

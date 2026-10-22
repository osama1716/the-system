// The capability tests: starting one and handing in the answers. The rules are in
// functions/captest.js. Two calls a test, so each costs next to nothing, and
// both refuse an account without a subscription or trial — a free account is
// given nothing that costs.
//
// capTests/{uid} = { memory: { session, spans, counted, pending, nextAt, history } },
// and capStats/memory = { bands: { "<band>": { "<span>": count } } }, one
// counted span per person. Both server only, both small, so each transaction
// writes them whole.
"use strict";

const crypto = require("crypto");
const admin = require("firebase-admin");
const CAP = require("../captest.js");
const { HttpsError, onCall, requireEntitled } = require("../server/base");

const rand = () => crypto.randomInt(0, 1e9) / 1e9;
const HOUR = 3600000;

// Starts a memory test: makes its sequences and keeps them here, and hands the
// device a disguised copy to show. One test at a time, once every two months.
exports.startMemoryTest = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  await requireEntitled(request);
  const uid = request.auth.uid;
  const band = String((request.data || {}).ageBand || "");
  if (CAP.AGE_BANDS.indexOf(band) < 0) throw new HttpsError("invalid-argument", "Choose an age range.");
  const db = admin.firestore();
  const ref = db.collection("capTests").doc(uid);
  const now = Date.now();
  const id = crypto.randomBytes(9).toString("base64url");
  const seqs = CAP.makeSequences(rand);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const doc = snap.exists ? snap.data() : {};
    const m = doc.memory || {};
    const gate = CAP.canStart(m, now);
    if (!gate.ok) throw new HttpsError("failed-precondition", "Not yet.", { code: "cap-wait", nextAt: gate.nextAt });
    // Starting takes the attempt: a test left halfway is not a free look at the
    // digits. It can be tried again the next day.
    tx.set(ref, { ...doc, memory: { ...m, session: { id, startedAt: now, seqs, band }, nextAt: now + CAP.MEMORY.retryHours * HOUR } });
  });
  const M = CAP.MEMORY;
  return {
    sessionId: id,
    seqs: CAP.pack(seqs, id),
    rules: { start: M.start, max: M.max, showMs: M.showMs, gapMs: M.gapMs, answerBaseMs: M.answerBaseMs, answerPerDigitMs: M.answerPerDigitMs, leftLimit: M.leftLimit },
  };
});

// Hands in a memory test: what was typed for each sequence, how long each
// answer took, and whether the app was left during it. Scored here.
exports.finishMemoryTest = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  await requireEntitled(request);
  const uid = request.auth.uid;
  const d = request.data || {};
  const trials = Array.isArray(d.trials) ? d.trials.slice(0, 40).map((tr) => ({
    len: Number(tr && tr.len), attempt: Number(tr && tr.attempt),
    answer: typeof (tr && tr.answer) === "string" ? tr.answer.slice(0, 12) : "",
    ms: Math.round(Number(tr && tr.ms)), left: !!(tr && tr.left),
  })) : [];
  const db = admin.firestore();
  const ref = db.collection("capTests").doc(uid);
  const statsRef = db.collection("capStats").doc("memory");
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const [snap, statsSnap] = await Promise.all([tx.get(ref), tx.get(statsRef)]);
    const doc = snap.exists ? snap.data() : {};
    const m = doc.memory || {};
    const s = m.session;
    if (!s || s.id !== d.sessionId) throw new HttpsError("failed-precondition", "No such test.", { code: "cap-no-test" });
    // What is kept afterwards: the test is over either way.
    const save = (entry, patch) => {
      const { session, ...rest } = m;
      const history = [entry].concat(m.history || []).slice(0, CAP.MEMORY.keepHistory);
      tx.set(ref, { ...doc, memory: { ...rest, ...patch, history } });
    };
    const voidIt = (reason) => {
      const nextAt = now + CAP.MEMORY.retryHours * HOUR;
      save({ at: now, valid: false, reason }, { nextAt });
      console.log("[captest] " + uid.slice(0, 6) + " memory void: " + reason);
      return { valid: false, reason, nextAt };
    };
    if (now - s.startedAt > CAP.MEMORY.sessionMinutes * 60000) return voidIt("expired");
    // The digits alone take a second each to show: a hand-in that comes back
    // sooner than that never showed them.
    if (now - s.startedAt < CAP.minElapsedMs(trials) * 0.9) return voidIt("too-fast");
    const r = CAP.score(s.seqs, trials);
    if (!r.ok) return voidIt(r.reason);

    const dec = CAP.decide(m, r.span, now);
    const patch = { nextAt: dec.nextAt };
    let place = { pct: null, n: 0 };
    let score = m.counted ? m.counted.span : null;
    if (dec.counted) {
      // What counts is the middle of the last three results, and one counted
      // span per person: the old one leaves the band it was in.
      const spans = CAP.nextSpans(m, r.span);
      score = CAP.middle(spans);
      const bands = JSON.parse(JSON.stringify(((statsSnap.exists ? statsSnap.data() : {}).bands) || {}));
      const bump = (band, span, by) => {
        const b = bands[band] = bands[band] || {};
        b[span] = Math.max(0, (Number(b[span]) || 0) + by);
        if (!b[span]) delete b[span];
      };
      if (m.counted && m.counted.band) bump(m.counted.band, m.counted.span, -1);
      bump(s.band, score, 1);
      tx.set(statsRef, { bands });
      place = CAP.share(bands[s.band], score);
      patch.spans = spans;
      patch.counted = { span: score, last: r.span, at: now, band: s.band, pct: place.pct, n: place.n };
      patch.pending = null;
    } else {
      patch.pending = { span: r.span, at: now, band: s.band };
    }
    save({ at: now, valid: true, span: r.span, band: s.band, counted: dec.counted, left: r.left }, patch);
    console.log("[captest] " + uid.slice(0, 6) + " memory " + r.span + (dec.counted ? " counted" : " pending") + " (" + s.band + ")");
    // `span` is this test's result; `score` the span that counts.
    return { valid: true, span: r.span, score, counted: dec.counted, pending: dec.pending, pct: place.pct, n: place.n, band: s.band, nextAt: dec.nextAt };
  });
});

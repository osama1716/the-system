// Recording progress on a priced task, when it may next be recorded, and the
// reflection question that releases the points a big quest holds back.
"use strict";

const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const Anthropic = require("@anthropic-ai/sdk");
const AI = require("../ai-config");
// Which habits are worth interrupting somebody about, and when — see the top
// of that file for why the schedule rules exist twice.
const REMINDERS = require("../reminders.js");
// What reported progress on a priced task is worth — see recordProgress.
const PROGRESS = require("../progress.js");
const STREAK = require("../streak.js");
const SHOP = require("../shop.js");
// When a task may honestly be recorded as done, and what a day can hold.
const EFFORT = require("../effort.js");
// Big quests hold half their points until a short answer releases them.
const REFLECTION = require("../reflection.js");
const REFLECTION_PROMPT = require("../reflection-prompt.js");
// Accounts that behave in ways honest use does not — see suspicion.js.
const SUSPICION = require("../suspicion.js");
const { ANTHROPIC_API_KEY, HttpsError, VAPID_PRIVATE_KEY, onCall, requireEntitled } = require("../server/base");
const { notifyAdmins } = require("../server/push");
const { consumeEvaluationQuota, trackAiCost } = require("../server/ai");
const { rankIdxOfTotal, readExpTotals } = require("../server/standing");
const { recordSuspicion } = require("../server/watch");

// ---------------------------------------------------------------------------
// recordProgress — the device says what happened to a priced task; this
// decides what it is worth and writes the journal entry itself.
//
// Each task has a ledger at progressLedger/{uid}/prices/{priceId} of what has
// already been paid for it (see functions/progress.js). A report pays the
// difference between that and what the reported state is worth, so sending
// one twice, or replaying an old one, pays nothing. Settled one report at a
// time in a transaction, because two devices can report the same task at
// once and a ledger read twice before either write would pay twice.
//
// `tz` is the device's zone, used only to know which day is "today" for the
// three-day window on habits. It is the device's say-so, and the most a false
// zone can move that window is about a day.
// ---------------------------------------------------------------------------
exports.recordProgress = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  // EXP from priced tasks is a paid feature too. A refused report stays in
  // the device's queue (flushExpQueue keeps what failed) and pays once the
  // account is subscribed.
  await requireEntitled(request);
  const uid = request.auth.uid;
  const { reports, tz } = request.data || {};
  if (!Array.isArray(reports) || !reports.length || reports.length > 200) {
    throw new HttpsError("invalid-argument", "Expected { reports: [1..200], tz }.");
  }
  const tzSafe = typeof tz === "string" ? tz.slice(0, 60) : "UTC";
  const nowStamp = localStamp(null, tzSafe);
  const todayKey = nowStamp.dayKey;
  const db = admin.firestore();
  const results = [];

  for (const raw of reports) {
    const report = PROGRESS.cleanReport(raw);
    if (!report) { results.push({ status: "refused", reason: "shape", delta: 0 }); continue; }
    const priceRef = db.collection("aiPrices").doc(uid).collection("prices").doc(report.priceId);
    const ledgerRef = db.collection("progressLedger").doc(uid).collection("prices").doc(report.priceId);
    try {
      const outcome = await db.runTransaction(async (tx) => {
        const price = await tx.get(priceRef);
        if (!price.exists) return { status: "refused", reason: "unpriced", delta: 0 };
        const priceData = price.data();
        const ledgerSnap = await tx.get(ledgerRef);
        const kind = priceData.kind === "habit" ? "habit" : "quest";
        // A task that was edited and priced again: what the retired price
        // already paid comes across once, and that price is then spent, so
        // editing in a circle cannot be used to collect twice.
        const oldRef = report.replaces
          ? db.collection("progressLedger").doc(uid).collection("prices").doc(report.replaces)
          : null;
        const oldSnap = oldRef ? await tx.get(oldRef) : null;
        let retireOld = null;
        let ledger;
        if (ledgerSnap.exists) {
          ledger = ledgerSnap.data();
        } else if (oldSnap && oldSnap.exists && !oldSnap.data().movedTo) {
          ledger = PROGRESS.transferLedger(oldSnap.data(), kind);
          // Written later, with everything else. A transaction may not read
          // after it has written, and the effort ledger and the reflections
          // are still to be read — writing here made every report on a
          // re-priced task fail outright.
          retireOld = { ...oldSnap.data(), movedTo: report.priceId };
          console.log("[progress] " + uid.slice(0, 6) + " moved " + report.replaces.slice(0, 6) +
            " -> " + report.priceId.slice(0, 6) + " carrying " +
            (kind === "habit" ? ledger.legacyExp : ledger.exp));
        } else {
          // First report for this task since the ledger existed: whatever the
          // old journal already paid against this price is paid.
          const earlier = await tx.get(
            db.collection("users").doc(uid).collection("expEvents").where("priceId", "==", report.priceId)
          );
          let seeded = 0;
          earlier.forEach((d) => { seeded += Number(d.data().delta) || 0; });
          ledger = PROGRESS.newLedger(kind, seeded);
        }
        // A quest worth enough to ask about pays only the halves its answers
        // have released. Read now, with the other reads: a transaction cannot
        // read after it writes.
        let gate = null;
        if (kind === "quest" && REFLECTION.isGated(priceData)) {
          const reflections = {};
          for (const cp of REFLECTION.CHECKPOINTS) {
            const snap = await tx.get(reflectionRef(db, uid, report.priceId, cp));
            if (snap.exists) reflections[cp] = snap.data();
          }
          // What was paid before the gate existed stays paid. Recorded once,
          // the first time a ledger is seen under the gate.
          const grandfathered = ledger.gateVersion
            ? Math.max(0, Number(ledger.grandfatheredExp) || 0)
            : Math.max(0, Number(ledger.exp) || 0);
          gate = { reflections, grandfathered };
        }
        const settled = PROGRESS.settleReport(priceData, ledger, report, todayKey, gate);
        if (settled.status !== "ok") return settled;

        // Is this open yet, and does the day have room for it?
        //
        // The evaluator's hours are what a task costs; a day holds fourteen of
        // them and no more. Both checks happen before the EXP is written, so a
        // refusal pays nothing — see effort.js for the arithmetic.
        //
        // A task priced before the estimates existed has 0/0, which locks
        // nothing: it still costs the minimum, so the cap keeps meaning
        // something, but it is never held back.
        const est = PROGRESS.cleanEstimates(priceData, priceData.pt, kind);
        const effortRef = db.collection("effortLedger").doc(uid);
        const effortSnap = await tx.get(effortRef);
        const effortDays = (effortSnap.exists && effortSnap.data().days) || {};
        // A quest's hours accumulate from the moment it was priced; a habit
        // repeat belongs to its own day and starts at that day's midnight.
        const openedAt = kind === "habit"
          ? EFFORT.stamp(report.day, 0)
          : localStamp(priceData.createdAt, tzSafe);
        const chargedHours = Math.max(0, Number(ledger.hoursCharged) || 0);
        const repeatCharge = EFFORT.chargeFor(est.effortHours, 1);
        let deltaHours = kind === "habit"
          ? (report.done ? repeatCharge : -Math.min(chargedHours, repeatCharge))
          : (est.effortHours * Math.max(0, Math.min(100, report.completion)) / 100) - chargedHours;
        // What decides whether the time lock and the day's cap apply is
        // progress, not payment. A gated quest can move forward while paying
        // nothing — its answer is outstanding — and keying this on the EXP
        // paid let exactly that progress skip the lock, then collect in full
        // the moment the answer was accepted.
        const prevCompletion = Number.isFinite(Number(ledger.completion)) ? Number(ledger.completion) : null;
        const movingUp = kind === "habit"
          ? settled.delta > 0
          : (prevCompletion === null ? settled.delta > 0 : report.completion > prevCompletion);
        // Nothing is ever free: moving forward costs its day at least the
        // minimum, which is what makes the cap bite on habits that take a
        // minute.
        if (movingUp) deltaHours = Math.max(deltaHours, EFFORT.MIN_CHARGE_HOURS);

        // What the suspicion check needs to hear about this report, gathered
        // here where the numbers are, and acted on after the transaction.
        let suspicionNote = null;
        let nextEffort = null;
        if (movingUp && deltaHours > 0) {
          // minDays applies to the share being claimed: half of a thirty-day
          // challenge needs fifteen days, not thirty.
          const needDays = kind === "habit" ? 0
            : Math.round(est.minDays * Math.max(0, Math.min(100, report.completion)) / 100);
          const unlock = EFFORT.unlockAt(openedAt, deltaHours, needDays, effortDays);
          if (!unlock || !EFFORT.isUnlocked(openedAt, nowStamp, deltaHours, needDays, effortDays)) {
            return { status: "refused", reason: "locked", delta: 0, unlock: unlock || null };
          }
          const put = EFFORT.spend(effortDays, openedAt, nowStamp, deltaHours);
          if (put.unplaced > 0) {
            return { status: "refused", reason: "day-full", delta: 0, unlock: unlock || null };
          }
          nextEffort = put.days;
          suspicionNote = { effort: true };
          // How long after it opened a quest was finished. Only finishing
          // counts — a quest nudged forward a percent at a time would flood the
          // sample with noise.
          if (kind === "quest" && report.completion >= 100 && unlock) {
            suspicionNote.unlockGap = EFFORT.daysBetween(unlock.dayKey, nowStamp.dayKey) * 1440 +
              (nowStamp.minutes - unlock.minutes);
          }
        } else if (deltaHours < 0) {
          // Undoing gives the hours back, newest day first.
          nextEffort = EFFORT.refund(effortDays, nowStamp, -deltaHours);
        }
        // A past habit day marked now. One or two is somebody catching up;
        // the suspicion check looks for many inside a minute.
        if (kind === "habit" && report.done && report.day < todayKey && settled.delta > 0) {
          suspicionNote = { ...(suspicionNote || {}), backfill: true };
        }
        settled.suspicion = suspicionNote;

        // ---- every read is done; from here on, only writes ----
        if (retireOld && oldRef) {
          tx.set(oldRef, { ...retireOld, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        }
        if (nextEffort) {
          tx.set(effortRef, { days: nextEffort, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        }
        tx.set(ledgerRef, {
          ...settled.ledger,
          hoursCharged: Math.round(Math.max(0, chargedHours + (nextEffort ? deltaHours : 0)) * 1000) / 1000,
          ...(gate ? { gateVersion: 1, grandfatheredExp: gate.grandfathered } : {}),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        if (settled.delta) {
          tx.create(db.collection("users").doc(uid).collection("expEvents").doc(), {
            delta: settled.delta,
            source: report.source,
            at: admin.firestore.FieldValue.serverTimestamp(),
            priceId: report.priceId,
            server: true,
          });
        }
        return settled;
      });
      // Every report, not only the refusals. A standing that moves for a
      // reason nobody can name is the one thing this whole design is against,
      // and these lines are the only place the reason exists: what was
      // reported, what it was worth, and what had already been paid.
      console.log("[progress] " + uid.slice(0, 6) + " " + report.kind + " " + report.priceId.slice(0, 6) +
        " " + (report.kind === "habit" ? report.day + (report.done ? " done" : " cleared") : "at " + report.completion + "%") +
        " -> " + outcome.status + (outcome.reason ? " (" + outcome.reason + ")" : "") +
        " delta " + outcome.delta + " | today " + todayKey);
      results.push({ priceId: report.priceId, status: outcome.status, reason: outcome.reason || null,
        delta: outcome.delta, unlock: outcome.unlock || null });
      if (outcome.status === "ok" && outcome.suspicion) {
        const note = outcome.suspicion;
        await recordSuspicion(uid, (ev) => {
          if (note.backfill) ev.backfills = SUSPICION.pushBounded(ev.backfills, Date.now(), 30);
          if (Number.isFinite(note.unlockGap)) {
            ev.unlockGaps = SUSPICION.pushBounded(ev.unlockGaps, { minutesAfterUnlock: note.unlockGap, at: Date.now() }, 20);
          }
        });
      }
    } catch (err) {
      console.error("[progress] " + uid.slice(0, 6) + " failed on " + report.priceId.slice(0, 6), err && err.message);
      results.push({ priceId: report.priceId, status: "error", delta: 0 });
    }
  }
  // The daily streak moves only on a day something was actually paid.
  let streak = null;
  if (results.some((r) => r.status === "ok" && r.delta > 0)) {
    streak = await bumpStreak(db, uid, todayKey, tzSafe).catch((err) => {
      console.error("[streak] " + uid.slice(0, 6) + " not updated", err && err.message);
      return null;
    });
  }
  return { results, todayKey, streak };
});

// streaks/{uid}: { current, best, lastDay, tz, rescueAt, rescueSent }.
// rescueAt is when the evening nudge would go if nothing else is earned —
// moving it forward each day is what keeps the scheduler's query to the few
// accounts actually about to lose one.
async function bumpStreak(db, uid, todayKey, tz) {
  const ref = db.collection("streaks").doc(uid);
  const walletRef = db.collection("wallets").doc(uid);
  // Only needed when this is the account's first gold: a new wallet starts
  // at the rank already held (see payGold).
  const rankNow = rankIdxOfTotal((await readExpTotals(uid)).total);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const walletSnap = await tx.get(walletRef);
    const prev = snap.exists ? snap.data() : null;
    const wallet = walletSnap.exists ? SHOP.cleanWallet(walletSnap.data(), rankNow) : null;
    const held = wallet ? wallet.freezes : 0;
    const next = STREAK.advance(prev, todayKey, held);
    if (prev && prev.lastDay === next.lastDay && prev.current === next.current && prev.tz === tz) {
      return STREAK.live(prev, todayKey, held);
    }
    const left = held - next.used;
    const gold = SHOP.streakGold(prev ? Number(prev.current) || 0 : 0, next.current);
    tx.set(ref, {
      current: next.current, best: next.best, lastDay: next.lastDay,
      tz,
      // The last evening it can still be kept: freezes push it out a day each.
      rescueAt: STREAK.rescueAt(STREAK.shiftDayKey(next.lastDay, left), tz),
      rescueSent: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    if (wallet && (next.used || gold)) {
      tx.set(walletRef, { ...wallet, freezes: left, gold: wallet.gold + gold,
        updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    } else if (!wallet && gold) {
      const fresh = SHOP.blankWallet(rankNow);
      tx.set(walletRef, { ...fresh, gold, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
    if (next.used || gold) console.log("[streak] " + uid.slice(0, 6) + " day " + next.current + (next.used ? ", " + next.used + " freeze(s) used" : "") + (gold ? ", +" + gold + " gold" : ""));
    return STREAK.live(next, todayKey, left);
  });
}

// ---------------------------------------------------------------------------
// The reflection question — see functions/reflection.js for the rule.
//
// reflections/{uid}__{priceId}__{checkpoint} holds one answer and its fate.
// Kept as its own collection, not on the progress ledger, because the admin
// queue and the five-day lenient look both need to find held answers across
// every account, and a map inside a ledger cannot be queried.
// ---------------------------------------------------------------------------
function reflectionRef(db, uid, priceId, cp) {
  return db.collection("reflections").doc(uid + "__" + priceId + "__" + cp);
}

// One judgment. Throws on an API failure — callers decide what that means,
// because for a person waiting it is an error, and for the scheduler it is
// "try again next run".
async function judgeReflection(input) {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
  const response = await client.messages.create(REFLECTION_PROMPT.buildReflectionRequest(input));
  trackAiCost(response);
  if (response.stop_reason === "refusal") return { verdict: "hold", reason: "" };
  const block = (response.content || []).find((b) => b.type === "text");
  const parsed = JSON.parse(block.text);
  return {
    verdict: parsed.verdict === "accept" ? "accept" : "hold",
    reason: String(parsed.reason || "").slice(0, 300),
  };
}

// Pays whatever an accepted answer has just released, from the progress the
// quest already reached. Idempotent: the ledger remembers what it paid, so a
// second call, or the app reporting the same progress afterwards, pays nothing.
async function payReleased(db, uid, priceId) {
  const priceRef = db.collection("aiPrices").doc(uid).collection("prices").doc(priceId);
  const ledgerRef = db.collection("progressLedger").doc(uid).collection("prices").doc(priceId);
  return db.runTransaction(async (tx) => {
    const price = await tx.get(priceRef);
    const ledgerSnap = await tx.get(ledgerRef);
    if (!price.exists || !ledgerSnap.exists) return 0;
    const priceData = price.data();
    const ledger = ledgerSnap.data();
    const reflections = {};
    for (const cp of REFLECTION.CHECKPOINTS) {
      const snap = await tx.get(reflectionRef(db, uid, priceId, cp));
      if (snap.exists) reflections[cp] = snap.data();
    }
    const completion = Number.isFinite(Number(ledger.completion))
      ? Number(ledger.completion)
      : Math.floor((Number(ledger.exp) || 0) / Math.max(1, Number(priceData.pt) || 1) * 100);
    const gate = {
      reflections,
      grandfathered: ledger.gateVersion ? Math.max(0, Number(ledger.grandfatheredExp) || 0) : Math.max(0, Number(ledger.exp) || 0),
    };
    const settled = PROGRESS.settleReport(priceData, ledger, { kind: "quest", completion, priceId }, "", gate);
    if (settled.status !== "ok" || !settled.delta) return 0;
    tx.set(ledgerRef, { ...settled.ledger, gateVersion: 1, grandfatheredExp: gate.grandfathered,
      updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    tx.create(db.collection("users").doc(uid).collection("expEvents").doc(), {
      delta: settled.delta,
      source: String("Answer accepted: " + (priceData.title || "")).slice(0, 80),
      at: admin.firestore.FieldValue.serverTimestamp(),
      priceId,
      server: true,
    });
    return settled.delta;
  });
}

// submitReflection — somebody answers a big quest's question.
exports.submitReflection = onCall({ secrets: [ANTHROPIC_API_KEY, VAPID_PRIVATE_KEY] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const who = await requireEntitled(request);
  const uid = request.auth.uid;
  const { priceId, checkpoint, answer, lang } = request.data || {};
  if (typeof priceId !== "string" || !/^[A-Za-z0-9]{1,40}$/.test(priceId)) {
    throw new HttpsError("invalid-argument", "Which task is this about?");
  }
  const cp = Number(checkpoint);
  if (!REFLECTION.CHECKPOINTS.includes(cp)) throw new HttpsError("invalid-argument", "Unknown checkpoint.");
  if (!REFLECTION.answerLongEnough(answer)) {
    throw new HttpsError("invalid-argument", "Write a sentence about what you actually did.");
  }

  const db = admin.firestore();
  const price = await db.collection("aiPrices").doc(uid).collection("prices").doc(priceId).get();
  if (!price.exists || !REFLECTION.isGated(price.data())) {
    throw new HttpsError("failed-precondition", "This task doesn't ask for an answer.");
  }
  const priceData = price.data();
  const ledgerSnap = await db.collection("progressLedger").doc(uid).collection("prices").doc(priceId).get();
  const ledger = ledgerSnap.exists ? ledgerSnap.data() : {};
  const reached = Number.isFinite(Number(ledger.completion))
    ? Number(ledger.completion)
    : Math.floor((Number(ledger.exp) || 0) / Math.max(1, Number(priceData.pt) || 1) * 100);
  if (reached < cp) throw new HttpsError("failed-precondition", "This question opens at " + cp + "%.");

  const ref = reflectionRef(db, uid, priceId, cp);
  const existing = await ref.get();
  const record = existing.exists ? existing.data() : null;
  if (record && record.status === "accepted") return { status: "accepted", reason: record.reason || "", released: 0 };
  if (record && record.status === "rejected") {
    throw new HttpsError("failed-precondition", "This answer was already reviewed.");
  }
  if (record && record.status === "held" && !REFLECTION.canResubmit(record)) {
    throw new HttpsError("failed-precondition", "This answer is waiting for a person to look at it.");
  }

  // A judgment costs money, so it draws on the same daily allowance as pricing.
  await consumeEvaluationQuota(uid, AI.evaluationsPerDay(who));

  const clean = REFLECTION.cleanAnswer(answer);
  let verdict;
  try {
    verdict = await judgeReflection({
      title: priceData.title, description: priceData.description || "",
      checkpoint: cp, answer: clean, mode: "strict", lang,
    });
  } catch (err) {
    console.error("[reflection] judge failed", err && err.message);
    throw new HttpsError("internal", "That couldn't be checked right now. Please try again.");
  }

  const next = REFLECTION.afterJudge(record, verdict.verdict, verdict.reason, clean, Date.now(), "ai");
  await ref.set({
    ...next, uid, priceId, checkpoint: cp,
    title: String(priceData.title || "").slice(0, 120), pt: Number(priceData.pt) || 0,
    lang: typeof lang === "string" ? lang.slice(0, 5) : null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log("[reflection] " + uid.slice(0, 6) + " " + priceId.slice(0, 6) + " @" + cp + " -> " + next.status +
    " (attempt " + next.attempts + ")");

  let released = 0;
  if (next.status === "accepted") {
    released = await payReleased(db, uid, priceId);
  } else if (!record || record.status !== "held") {
    // Only the first hold tells an admin. A rewrite of an answer they have
    // already been told about is the same question, not a new one.
    await notifyAdmins({
      title: "Answer waiting",
      body: String(priceData.title || "A task").slice(0, 70) + " · " + cp + "%",
      tag: "admin-reflection",
      url: "./#admin",
    });
  }
  return { status: next.status, reason: next.reason, released, attemptsLeft: REFLECTION.MAX_ATTEMPTS - next.attempts };
});

// reviewReflection — an admin decides a held answer. Final either way.
exports.reviewReflection = onCall(async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  const { id, accept } = request.data || {};
  if (typeof id !== "string" || !/^[A-Za-z0-9_]{1,120}$/.test(id) || typeof accept !== "boolean") {
    throw new HttpsError("invalid-argument", "Expected { id: string, accept: boolean }.");
  }
  const db = admin.firestore();
  const ref = db.collection("reflections").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "That answer no longer exists.");
  const record = snap.data();
  if (record.status !== "held") throw new HttpsError("failed-precondition", "This answer was already decided.");
  await ref.set({ ...REFLECTION.afterAdmin(record, accept, Date.now()),
    updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  const released = accept ? await payReleased(db, record.uid, record.priceId) : 0;
  if (!accept) await recordSuspicion(record.uid, (ev) => { ev.rejectedAt = SUSPICION.pushBounded(ev.rejectedAt, Date.now(), 10); });
  console.log("[reflection] admin " + (accept ? "accepted" : "rejected") + " " + id.slice(0, 20) + " released " + released);
  return { status: accept ? "accepted" : "rejected", released };
});

// reflectionStatus — where each of these quests' answers stand, for the app.
exports.reflectionStatus = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid;
  const { priceIds } = request.data || {};
  if (!Array.isArray(priceIds) || !priceIds.length || priceIds.length > 100) {
    throw new HttpsError("invalid-argument", "Expected { priceIds: [1..100] }.");
  }
  const db = admin.firestore();
  const out = {};
  for (const id of priceIds.filter((x) => typeof x === "string" && /^[A-Za-z0-9]{1,40}$/.test(x)).slice(0, 100)) {
    const entry = {};
    for (const cp of REFLECTION.CHECKPOINTS) {
      const snap = await reflectionRef(db, uid, id, cp).get();
      if (!snap.exists) continue;
      const r = snap.data();
      entry[cp] = { status: r.status, reason: r.reason || "",
        attemptsLeft: Math.max(0, REFLECTION.MAX_ATTEMPTS - (Number(r.attempts) || 0)) };
    }
    const ledgerSnap = await db.collection("progressLedger").doc(uid).collection("prices").doc(id).get();
    if (ledgerSnap.exists && ledgerSnap.data().gateVersion) {
      entry.grandfathered = Math.max(0, Number(ledgerSnap.data().grandfatheredExp) || 0);
    }
    out[id] = entry;
  }
  return { reflections: out };
});

// Every six hours: answers held for five days with no admin decision get the
// lenient look. Nobody's points should stay frozen because nobody looked.
exports.lenientReflections = onSchedule(
  { schedule: "every 6 hours", timeZone: "UTC", secrets: [ANTHROPIC_API_KEY] },
  async () => {
    const db = admin.firestore();
    const cutoff = Date.now() - REFLECTION.ADMIN_WINDOW_DAYS * REFLECTION.DAY_MS;
    const held = await db.collection("reflections").where("status", "==", "held").get();
    let looked = 0, accepted = 0;
    for (const doc of held.docs) {
      const record = doc.data();
      if (!REFLECTION.dueForLenient(record, Date.now())) continue;
      if (!(Number(record.heldAt) <= cutoff)) continue;
      looked++;
      try {
        const price = await db.collection("aiPrices").doc(record.uid).collection("prices").doc(record.priceId).get();
        const p = price.exists ? price.data() : {};
        const verdict = await judgeReflection({
          title: p.title || record.title, description: p.description || "",
          checkpoint: record.checkpoint, answer: record.answer, mode: "lenient", lang: record.lang,
        });
        if (verdict.verdict === "accept") {
          await doc.ref.set({ ...REFLECTION.afterJudge(record, "accept", verdict.reason, null, Date.now(), "ai-lenient"),
            updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          await payReleased(db, record.uid, record.priceId);
          accepted++;
        } else {
          // Lenient still says no: it stops being held and is rejected, so the
          // person gets a decision instead of waiting for ever.
          await doc.ref.set({ ...REFLECTION.afterAdmin(record, false, Date.now()), decidedBy: "ai-lenient",
            reason: verdict.reason || record.reason || "",
            updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          await recordSuspicion(record.uid, (ev) => { ev.rejectedAt = SUSPICION.pushBounded(ev.rejectedAt, Date.now(), 10); });
        }
      } catch (err) {
        console.error("[reflection] lenient look failed for " + doc.id.slice(0, 20), err && err.message);
      }
    }
    if (looked) console.log("[reflection] lenient look: " + looked + " looked at, " + accepted + " accepted");
  }
);

// A Firestore timestamp as a point in somebody's own day, which is the only
// form effort.js works in.
function localStamp(ts, tz) {
  const date = ts && typeof ts.toDate === "function" ? ts.toDate() : new Date();
  const parts = REMINDERS.localParts(date, tz);
  const [h, m] = String(parts.hhmm || "00:00").split(":").map(Number);
  return EFFORT.stamp(parts.dayKey, (h || 0) * 60 + (m || 0));
}

// ---------------------------------------------------------------------------
// unlockTimes — when each of these tasks can next be recorded.
//
// The app shows the moment and nothing else: never the estimated hours, which
// would tell somebody exactly what to claim. The figure is computed here for
// the same reason — a device that worked it out locally could be talked out of
// it.
// ---------------------------------------------------------------------------
exports.unlockTimes = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid;
  const { priceIds, tz } = request.data || {};
  if (!Array.isArray(priceIds) || !priceIds.length || priceIds.length > 100) {
    throw new HttpsError("invalid-argument", "Expected { priceIds: [1..100], tz }.");
  }
  const tzSafe = typeof tz === "string" ? tz.slice(0, 60) : "UTC";
  const nowStamp = localStamp(null, tzSafe);
  const db = admin.firestore();
  const effortSnap = await db.collection("effortLedger").doc(uid).get();
  const effortDays = (effortSnap.exists && effortSnap.data().days) || {};

  const unlocks = {};
  const wanted = priceIds.filter((id) => typeof id === "string" && /^[A-Za-z0-9]{1,40}$/.test(id)).slice(0, 100);
  for (const id of wanted) {
    const price = await db.collection("aiPrices").doc(uid).collection("prices").doc(id).get();
    if (!price.exists) continue;
    const p = price.data();
    const kind = p.kind === "habit" ? "habit" : "quest";
    const est = PROGRESS.cleanEstimates(p, p.pt, kind);
    const ledgerSnap = await db.collection("progressLedger").doc(uid).collection("prices").doc(id).get();
    const chargedHours = ledgerSnap.exists ? Math.max(0, Number(ledgerSnap.data().hoursCharged) || 0) : 0;
    // What the next whole step costs: one repeat for a habit, whatever is left
    // of a quest. Never less than the minimum, so a task with no estimate
    // still answers with a real moment rather than "now, always".
    const need = kind === "habit"
      ? EFFORT.chargeFor(est.effortHours, 1)
      : Math.max(EFFORT.MIN_CHARGE_HOURS, Math.round((est.effortHours - chargedHours) * 1000) / 1000);
    const openedAt = kind === "habit" ? EFFORT.stamp(nowStamp.dayKey, 0) : localStamp(p.createdAt, tzSafe);
    const unlock = EFFORT.unlockAt(openedAt, need, kind === "habit" ? 0 : est.minDays, effortDays);
    unlocks[id] = {
      locked: !EFFORT.isUnlocked(openedAt, nowStamp, need, kind === "habit" ? 0 : est.minDays, effortDays),
      day: unlock ? unlock.dayKey : null,
      minutes: unlock ? unlock.minutes : null,
    };
  }
  return { unlocks, day: nowStamp.dayKey, minutes: nowStamp.minutes };
});

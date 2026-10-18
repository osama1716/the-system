// Appeals against the value a task was given, the admin's answer to them, and
// adjustments the admin sends.
"use strict";

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const { HttpsError, VAPID_PRIVATE_KEY, onCall, takeDailyAllowance } = require("../server/base");
const { notifyAdmins } = require("../server/push");

// ---------------------------------------------------------------------------
// resolveAppeal / rejectAppeal — admin-only. A user disputes the value the
// evaluator gave one of their tasks; a person looks again. Resolving does
// NOT write player.exp directly (see plan doc "Why pendingGrants") and does
// not even compute the EXP difference here — the server has no reliable view
// of how much of that task's value the user has already banked (a quest at
// 40%, a habit with 12 repeats logged). It records the corrected price and
// lets the client re-run the same repricing path an edit already uses, which
// produces the exact delta and keeps the undo ledger consistent.
// A transaction guards against the same appeal being resolved twice.
// ---------------------------------------------------------------------------
// fileAppeal — a person disputes the value one of their tasks was given.
//
// Appeals used to be written from the device straight into `appeals`, so
// everything the admin read there — the title, the value being disputed —
// was the device's own word, and nothing bounded how many there were or how
// long they ran, each one a notification on an admin's phone. The value and
// title now come from the price the evaluator recorded; the device supplies
// only which task, its description and the argument.
const APPEALS_PER_DAY = 5;
const APPEAL_REASON_MIN = 10;
const APPEAL_REASON_MAX = 1000;
const APPEAL_DESCRIPTION_MAX = 600;

exports.fileAppeal = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid;
  const { taskId, priceId, reason, description } = request.data || {};
  if (typeof priceId !== "string" || !/^[A-Za-z0-9]{1,40}$/.test(priceId)) {
    throw new HttpsError("failed-precondition", "unpriced", { code: "appeal-unpriced" });
  }
  const why = typeof reason === "string" ? reason.trim().slice(0, APPEAL_REASON_MAX) : "";
  if (why.length < APPEAL_REASON_MIN) throw new HttpsError("invalid-argument", "reason", { code: "appeal-reason" });
  const db = admin.firestore();
  const price = await db.collection("aiPrices").doc(uid).collection("prices").doc(priceId).get();
  if (!price.exists) throw new HttpsError("failed-precondition", "unpriced", { code: "appeal-unpriced" });
  const open = await db.collection("appeals").where("userId", "==", uid).where("priceId", "==", priceId)
    .where("status", "==", "pending").limit(1).get();
  if (!open.empty) throw new HttpsError("already-exists", "open", { code: "appeal-open" });
  await takeDailyAllowance(db, uid, "appeals", APPEALS_PER_DAY, "appeal-limit");
  const p = price.data();
  const ref = await db.collection("appeals").add({
    userId: uid,
    taskId: typeof taskId === "string" ? taskId.slice(0, 80) : null,
    priceId,
    taskTitle: String(p.title || "").slice(0, 120),
    taskDescription: typeof description === "string" ? description.trim().slice(0, APPEAL_DESCRIPTION_MAX) : "",
    taskKind: p.kind === "habit" ? "habit" : "quest",
    currentPt: Number(p.pt) || 0,
    reason: why,
    status: "pending",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { id: ref.id };
});

exports.resolveAppeal = onCall(async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  const { appealId, newPt } = request.data || {};
  const ptNum = Number(newPt);
  if (typeof appealId !== "string" || !appealId.trim()) {
    throw new HttpsError("invalid-argument", "Expected { appealId: string, newPt: number }.");
  }
  if (!Number.isFinite(ptNum) || ptNum < 1 || ptNum > 5000) {
    throw new HttpsError("invalid-argument", "The corrected value must be between 1 and 5000.");
  }
  const rounded = Math.round(ptNum);
  const db = admin.firestore();
  const appealRef = db.collection("appeals").doc(appealId);
  const result = await db.runTransaction(async (tx) => {
    const doc = await tx.get(appealRef);
    if (!doc.exists) throw new HttpsError("not-found", "That appeal no longer exists.");
    const data = doc.data();
    if (data.status !== "pending") throw new HttpsError("failed-precondition", "This appeal was already reviewed.");
    // The recorded price moves with the decision. EXP is computed on the
    // server from that price (recordProgress), so a corrected value that only
    // changed on the device would be paid at the old rate — or, going up,
    // not at all. Appeals made before they carried a priceId have nothing to
    // move, and fall back to the task being repriced on the device alone.
    const priceRef = typeof data.priceId === "string" && /^[A-Za-z0-9]{1,40}$/.test(data.priceId)
      ? db.collection("aiPrices").doc(data.userId).collection("prices").doc(data.priceId)
      : null;
    const price = priceRef ? await tx.get(priceRef) : null;
    tx.update(appealRef, { status: "resolved", newPt: rounded });
    if (price && price.exists) {
      tx.update(priceRef, { pt: rounded, repricedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
    const grantRef = db.collection("users").doc(data.userId).collection("pendingGrants").doc();
    tx.set(grantRef, {
      // No `amount` here: this grant reprices a task rather than handing out
      // a flat sum. The client computes the resulting EXP delta itself.
      repriceTask: { taskId: data.taskId, newPt: rounded },
      reason: data.taskTitle,
      sourceType: "appeal",
      appealId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { userId: data.userId, taskTitle: data.taskTitle };
  });
  return { appealId, newPt: rounded, ...result };
});

exports.rejectAppeal = onCall(async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  const { appealId } = request.data || {};
  if (typeof appealId !== "string" || !appealId.trim()) {
    throw new HttpsError("invalid-argument", "Expected { appealId: string }.");
  }
  const db = admin.firestore();
  const appealRef = db.collection("appeals").doc(appealId);
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(appealRef);
    if (!doc.exists) throw new HttpsError("not-found", "That appeal no longer exists.");
    if (doc.data().status !== "pending") throw new HttpsError("failed-precondition", "This appeal was already reviewed.");
    tx.update(appealRef, { status: "rejected" });
  });
  return { appealId };
});

// ---------------------------------------------------------------------------
// applyAdjustment — admin-only. Sends a message to a specific user, and if a
// non-zero amount is given, grants (or takes back, if negative) EXP for it
// via the same pendingGrants mechanism as mission approval — never written
// directly, for the same race-with-push() reason. Message and grant are
// written in one batch so the user always sees *why* their EXP changed,
// matching the transparency the existing undo/ledger design already has.
// applyExpDelta already handles negative deltas symmetrically (that's the
// whole undo mechanism), so penalties need no new client-side logic at all.
// ---------------------------------------------------------------------------
exports.applyAdjustment = onCall(async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  const { targetUid, text, amount } = request.data || {};
  if (typeof targetUid !== "string" || !targetUid.trim()) {
    throw new HttpsError("invalid-argument", "Expected { targetUid: string, text: string, amount?: number }.");
  }
  if (typeof text !== "string" || !text.trim()) {
    throw new HttpsError("invalid-argument", "Message text is required.");
  }
  const amountNum = amount === null || amount === undefined || amount === "" ? 0 : Number(amount);
  if (!Number.isFinite(amountNum)) {
    throw new HttpsError("invalid-argument", "Amount must be a number.");
  }
  await admin.auth().getUser(targetUid.trim()); // throws auth/user-not-found if the uid is bogus

  const db = admin.firestore();
  const userRef = db.collection("users").doc(targetUid.trim());
  const batch = db.batch();
  batch.set(userRef.collection("inbox").doc(), {
    text: text.trim(),
    amount: amountNum || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    read: false,
  });
  if (amountNum) {
    const rounded = Math.round(amountNum);
    batch.set(userRef.collection("pendingGrants").doc(), {
      amount: rounded,
      reason: text.trim(),
      sourceType: "adjustment",
      // Already in the journal — written just below, by the server. The
      // device applies it to its own EXP and does not report it again.
      journaled: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.set(userRef.collection("expEvents").doc(), {
      delta: rounded,
      source: ("Adjustment: " + text.trim()).slice(0, 80),
      at: admin.firestore.FieldValue.serverTimestamp(),
      server: true,
    });
  }
  await batch.commit();
  return { targetUid: targetUid.trim(), amount: amountNum };
});

// Every value appeal, anonymised, written to the function's log for improving
// the evaluator. An appeal is the one place the product records the evaluator
// being wrong in a real person's opinion, which makes it the best material an
// eval or a prompt example can be built from — and the logs are where the
// eval work can read it, since nothing outside the app can read Firestore.
// No uid, name or email: the task, what the evaluator gave, what was argued,
// and what an admin decided. In chunks, because one log entry has a size cap.
exports.exportAppealsForEval = onCall(async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  const snap = await admin.firestore().collection("appeals").orderBy("createdAt", "desc").limit(500).get();
  const rows = snap.docs.map((doc) => {
    const a = doc.data() || {};
    const corrected = Number(a.newPt);
    return {
      kind: a.taskKind === "habit" ? "habit" : "quest",
      title: String(a.taskTitle || "").slice(0, 120),
      description: String(a.taskDescription || "").slice(0, 600),
      evaluatorPt: Number.isFinite(Number(a.currentPt)) ? Number(a.currentPt) : null,
      reason: String(a.reason || "").slice(0, 400),
      status: ["pending", "resolved", "rejected"].includes(a.status) ? a.status : "pending",
      correctedPt: Number.isFinite(corrected) ? corrected : null,
    };
  });
  const CHUNK = 40;
  const chunks = Math.max(1, Math.ceil(rows.length / CHUNK));
  const stamp = new Date().toISOString();
  for (let i = 0; i < chunks; i++) {
    console.log("[appeals-export] " + JSON.stringify({ stamp, part: i + 1, of: chunks, total: rows.length, rows: rows.slice(i * CHUNK, (i + 1) * CHUNK) }));
  }
  return { count: rows.length };
});

// A new appeal. Title and the value in dispute only — the reason is the
// person's own words and can wait for the admin page, where it is read in
// full rather than cut off on a lock screen.
exports.notifyAdminsOfAppeal = onDocumentCreated(
  { document: "appeals/{appealId}", secrets: [VAPID_PRIVATE_KEY] },
  async (event) => {
    const data = event.data && event.data.data();
    if (!data || data.status !== "pending") return;
    await notifyAdmins({
      title: "New appeal",
      body: String(data.taskTitle || "A task").slice(0, 80) + " · " + (Number(data.currentPt) || 0) + " pt",
      tag: "admin-appeal",
      url: "./#admin",
    });
  }
);

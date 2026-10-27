// Reports about what the AI said, and feedback to the admins and their answers
// (functions/feedback.js).
"use strict";

const admin = require("firebase-admin");
const FEEDBACK = require("../feedback.js");
const { HttpsError, VAPID_PRIVATE_KEY, onCall, takeDailyAllowance } = require("../server/base");
const { configurePush, notifyAdmins, pushTo } = require("../server/push");
const { displayNameOf } = require("../server/social");

// ---------------------------------------------------------------------------
// Reporting what the AI said (Google Play's generative-AI policy)
//
// An evaluation, a weekly suggestion or a judged answer the person finds
// offensive, harmful or wrong. Kept with a copy of what was shown, since the
// text itself may not be stored anywhere else; admins are notified and close
// it from the admin page.

exports.reportAi = onCall({ secrets: [VAPID_PRIVATE_KEY] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid;
  const r = FEEDBACK.cleanAiReport(request.data);
  if (r.error) throw new HttpsError("invalid-argument", r.error, { code: r.error });
  const db = admin.firestore();
  await takeDailyAllowance(db, uid, "aiReports", FEEDBACK.AI_REPORTS_PER_DAY, "too-many");
  const name = await displayNameOf(db, uid);
  await db.collection("aiReports").add({
    uid, name, surface: r.surface, content: r.content, context: r.context,
    reason: r.reason, note: r.note, status: "open",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await notifyAdmins({
    title: "AI output reported · " + r.surface,
    body: (r.reason + " · " + r.content).slice(0, 170),
    tag: "admin-ai-report",
    url: "./#admin",
  });
  return { ok: true };
});

exports.closeAiReport = onCall(async (request) => {
  if (!request.auth || request.auth.token.admin !== true) throw new HttpsError("permission-denied", "Admin only.");
  const { id } = request.data || {};
  if (typeof id !== "string" || !id) throw new HttpsError("invalid-argument", "Expected { id }.");
  const ref = admin.firestore().collection("aiReports").doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new HttpsError("not-found", "No such report.");
  await ref.set({ status: "done", closedBy: request.auth.uid, closedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Feedback (functions/feedback.js)
//
// A player writes from Settings; every admin gets a notification and the
// message waits in the admin page. Closing it may carry a reply, which is
// pushed to the player and shown under their message.

exports.sendFeedback = onCall({ secrets: [VAPID_PRIVATE_KEY] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid;
  const f = FEEDBACK.cleanFeedback(request.data);
  if (f.error) throw new HttpsError("invalid-argument", f.error, { code: f.error });
  const db = admin.firestore();
  await takeDailyAllowance(db, uid, "feedback", FEEDBACK.PER_DAY, "too-many");
  const name = await displayNameOf(db, uid);
  const ref = db.collection("feedback").doc();
  const batch = db.batch();
  batch.set(ref, {
    uid, name, email: String(request.auth.token.email || ""),
    kind: f.kind, text: f.text, device: f.device, hasShot: !!f.shot,
    status: "open", createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  if (f.shot) batch.set(db.collection("feedbackShots").doc(ref.id), { uid, data: f.shot });
  await batch.commit();
  await notifyAdmins({
    title: "New feedback · " + f.kind,
    body: ((name ? name + ": " : "") + f.text).slice(0, 170),
    tag: "admin-feedback",
    url: "./#admin",
  });
  return { id: ref.id };
});

exports.answerFeedback = onCall({ secrets: [VAPID_PRIVATE_KEY] }, async (request) => {
  if (!request.auth || request.auth.token.admin !== true) throw new HttpsError("permission-denied", "Admin only.");
  const { id } = request.data || {};
  if (typeof id !== "string" || !id) throw new HttpsError("invalid-argument", "Expected { id, reply? }.");
  const reply = FEEDBACK.cleanReply((request.data || {}).reply);
  const db = admin.firestore();
  const ref = db.collection("feedback").doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new HttpsError("not-found", "No such message.");
  const update = { status: "done", closedBy: request.auth.uid, closedAt: admin.firestore.FieldValue.serverTimestamp() };
  if (reply) { update.reply = reply; update.repliedAt = admin.firestore.FieldValue.serverTimestamp(); }
  await ref.set(update, { merge: true });
  if (reply) {
    try {
      configurePush();
      const uid = doc.data().uid;
      const [subs, userDoc] = await Promise.all([
        db.collection("users").doc(uid).collection("pushSubs").get(),
        db.collection("users").doc(uid).get(),
      ]);
      const state = userDoc.exists ? (userDoc.data() || {}).state : null;
      const lang = (state && state.settings && state.settings.language) || "en";
      const payload = { ...FEEDBACK.replyMessage(lang, reply), tag: "feedback", url: "./#feedback" };
      for (const sub of subs.docs) await pushTo(sub, payload);
    } catch (err) {
      console.warn("[feedback] notify failed", err && err.message);
    }
  }
  return { ok: true, replied: !!reply };
});

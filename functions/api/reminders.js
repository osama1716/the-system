// Reminders: the index of who may have one due, the scheduler that sends them,
// and the device test and key the Settings page uses.
"use strict";

const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
// Which habits are worth interrupting somebody about, and when — see the top
// of that file for why the schedule rules exist twice.
const REMINDERS = require("../reminders.js");
const EVENT_REMINDERS = require("../event-reminders.js");
// Which accounts could have a reminder due now, without reading them all.
const REMINDER_INDEX = require("../reminder-index.js");
const STREAK = require("../streak.js");
const SHOP = require("../shop.js");
const { HttpsError, VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, onCall } = require("../server/base");
const { configurePush, pushTo } = require("../server/push");
const { sendTrialNotices } = require("../server/trial");

// ---------------------------------------------------------------------------
// Reminders
//
// A notification has to be worth the interruption. The scheduler checks three
// things before sending one: the habit is due today on its own schedule, it
// has not been logged yet, and it is the right time in the person's own
// timezone — which is stored with their subscription, because the server has
// no other way to know what "07:00" means to them.

// The scheduler wakes every minute, so a reminder set for 07:00 arrives at
// 07:00 rather than up to five minutes after. Each run looks back over a
// catch-up window instead of exactly one minute — a run that starts late, or
// is skipped, must not drop a reminder — and a per-device record of what was
// already sent today (reminderSent) keeps the overlap from sending it twice.
const REMINDER_WINDOW_MINUTES = 10;

// The evening nudge: streaks whose rescue time passed within the last hour
// and were not extended since (extending moves rescueAt to the next evening,
// so they drop out of this query by themselves).
async function sendStreakRescues(db, now) {
  const nowMs = now.getTime();
  const snap = await db.collection("streaks")
    .where("rescueAt", "<=", nowMs).where("rescueAt", ">", nowMs - 60 * 60 * 1000).get();
  let sent = 0;
  for (const doc of snap.docs) {
    const s = doc.data() || {};
    if (s.rescueSent) continue;
    const uid = doc.id;
    const today = REMINDERS.localParts(now, s.tz || "UTC").dayKey;
    const walletSnap = await db.collection("wallets").doc(uid).get();
    const held = walletSnap.exists ? SHOP.cleanWallet(walletSnap.data(), 0).freezes : 0;
    const state = STREAK.live(s, today, held);
    // A freeze still covers today: nothing ends tonight.
    const coveredTonight = s.lastDay && STREAK.daysBetween(s.lastDay, today) <= held;
    // Mark first: one nudge an evening is the promise, and a failed send is
    // better missed than repeated every minute for an hour.
    await doc.ref.update({ rescueSent: true }).catch(() => {});
    if (state.doneToday || coveredTonight || state.current < STREAK.RESCUE_MIN_DAYS) continue;
    const subs = await db.collection("users").doc(uid).collection("pushSubs").get();
    if (subs.empty) continue;
    const userSnap = await db.collection("users").doc(uid).get();
    const st = userSnap.exists ? (userSnap.data() || {}).state : null;
    const lang = (st && st.settings && st.settings.language) || "en";
    const payload = STREAK.rescuePayload(state.current, lang);
    for (const sub of subs.docs) {
      const result = await pushTo(sub, payload);
      if (result === "sent") sent++;
    }
    console.log("[streak] " + uid.slice(0, 6) + " " + state.current + "-day streak nudged on " + subs.size + " device(s)");
  }
  return sent;
}

// The events that have reminders, kept in one small document per account so
// the minute-by-minute scheduler reads one document instead of every planner
// item. Written in a transaction and only by a newer change (`u`), because
// triggers are not guaranteed to arrive in order.
exports.mirrorPlannerReminders = onDocumentWritten("users/{uid}/plannerItems/{itemId}", async (event) => {
  const after = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
  if (!after || after.kind !== "event") {
    const before = event.data && event.data.before && event.data.before.exists ? event.data.before.data() : null;
    if (!before || before.kind !== "event") return;
  }
  const db = admin.firestore();
  const ref = db.collection("plannerReminders").doc(event.params.uid);
  const id = event.params.itemId;
  const u = after ? Number(after.u) || 0 : Date.now();
  const keep = !!(after && !after.deleted && after.data && EVENT_REMINDERS.reminderOffsets(after.data).length);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? ((snap.data() || {}).events || {})[id] : null;
    const seen = snap.exists ? ((snap.data() || {}).seen || {})[id] : 0;
    if (seen && seen > u) return;
    const events = {};
    events[id] = keep ? { ...after.data, id } : admin.firestore.FieldValue.delete();
    const seenUpdate = {};
    seenUpdate[id] = u;
    // Nothing to remove and no mirror: an account being deleted must not
    // have its mirror written back by the deletes of its own items.
    if (!after && !snap.exists) return;
    if (!keep && !current && !snap.exists) {
      tx.set(ref, { seen: seenUpdate }, { merge: true });
      return;
    }
    tx.set(ref, { events, seen: seenUpdate }, { merge: true });
  });
});

// ---------------------------------------------------------------------------
// The reminder index — see functions/reminder-index.js.
//
// reminderIndex/{uid} = { slots: ["<zone>|HH:MM", …], zones }, every local
// time at which something of this account could remind, in each zone its
// devices are in. reminderMeta/zones = { list }: every zone any account has
// used, which is what the scheduler builds its question from.
//
// Kept by three triggers, one per thing it is built from: the saved state
// (habit times, and events from an app that has not updated), the planner
// event mirror, and the devices. Each compares what the index depends on
// before and after, so the ordinary save that changes nothing about
// reminders costs no reads.
async function rebuildReminderIndex(db, uid) {
  const [userDoc, mirror, subs] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("plannerReminders").doc(uid).get(),
    db.collection("users").doc(uid).collection("pushSubs").get(),
  ]);
  const state = userDoc.exists ? (userDoc.data() || {}).state : null;
  const events = mirror.exists ? Object.values((mirror.data() || {}).events || {}) : [];
  const zones = REMINDER_INDEX.zonesOf(subs.docs.map((d) => d.data()));
  const times = state ? REMINDER_INDEX.localTimes(state, events) : [];
  const ref = db.collection("reminderIndex").doc(uid);
  if (!zones.length || !times.length) {
    await ref.delete();
    return;
  }
  await ref.set({ slots: REMINDER_INDEX.slotsFor(times, zones), zones, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  await db.collection("reminderMeta").doc("zones").set({ list: admin.firestore.FieldValue.arrayUnion(...zones) }, { merge: true });
}

exports.indexRemindersOnState = onDocumentWritten("users/{uid}", async (event) => {
  const stateOf = (snap) => (snap && snap.exists ? (snap.data() || {}).state : null);
  const before = stateOf(event.data && event.data.before);
  const after = stateOf(event.data && event.data.after);
  const timesOf = (s) => JSON.stringify(s ? REMINDER_INDEX.localTimes(s, []) : []);
  if (before && after && timesOf(before) === timesOf(after)) return;
  await rebuildReminderIndex(admin.firestore(), event.params.uid);
});

exports.indexRemindersOnEvents = onDocumentWritten("plannerReminders/{uid}", async (event) => {
  const timesOf = (snap) => JSON.stringify(snap && snap.exists
    ? REMINDER_INDEX.localTimes({}, Object.values((snap.data() || {}).events || {})) : []);
  if (timesOf(event.data && event.data.before) === timesOf(event.data && event.data.after)) return;
  await rebuildReminderIndex(admin.firestore(), event.params.uid);
});

exports.indexRemindersOnDevices = onDocumentWritten("users/{uid}/pushSubs/{subId}", async (event) => {
  const zoneOf = (snap) => (snap && snap.exists ? String((snap.data() || {}).tz || "UTC") : null);
  if (zoneOf(event.data && event.data.before) === zoneOf(event.data && event.data.after)) return;
  await rebuildReminderIndex(admin.firestore(), event.params.uid);
});

// Once, the first time the scheduler finds no index: every account that has a
// device gets its entry, so nobody subscribed before the index existed is
// left out of it.
async function backfillReminderIndex(db) {
  const subs = await db.collectionGroup("pushSubs").get();
  const uids = new Set();
  subs.forEach((doc) => { const p = doc.ref.parent.parent; if (p) uids.add(p.id); });
  for (const uid of uids) await rebuildReminderIndex(db, uid);
  await db.collection("reminderMeta").doc("zones").set({ builtAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  console.log("[reminders] built the index for " + uids.size + " account(s)");
}

// Every minute: the accounts whose index has a time inside the window that
// ends now, in any zone in use — and only they — are read and decided on.
// It used to read every subscribed account's whole state every minute.
//
// Every decision near a reminder time is logged with its reason — sent, done
// today, not due today, archived, already sent — so a reminder that does not
// arrive can be explained from the logs. Minutes with no reminder in them log
// nothing, which is almost all of them.
exports.sendReminders = onSchedule(
  { schedule: "every 1 minutes", timeZone: "UTC", secrets: [VAPID_PRIVATE_KEY] },
  async () => {
    configurePush();
    const db = admin.firestore();
    const now = new Date();
    // Every five minutes, one line on what the scheduler is working from, and
    // one per device of each account near a time: its zone, the local time,
    // and that account's reminder times — times only, no titles.
    const summary = now.getUTCMinutes() % 5 === 0;
    let zonesDoc = await db.collection("reminderMeta").doc("zones").get();
    if (!zonesDoc.exists) {
      await backfillReminderIndex(db);
      zonesDoc = await db.collection("reminderMeta").doc("zones").get();
    }
    const zones = (zonesDoc.exists && Array.isArray(zonesDoc.data().list)) ? zonesDoc.data().list : [];
    const keys = [].concat(...zones.map((z) => REMINDER_INDEX.windowSlots(now, z, REMINDER_WINDOW_MINUTES)));
    const near = new Set();
    for (const chunk of REMINDER_INDEX.chunks(keys, 30)) {
      const snap = await db.collection("reminderIndex").where("slots", "array-contains-any", chunk).get();
      snap.forEach((d) => near.add(d.id));
    }
    if (summary) console.log("[reminders] " + zones.length + " zone(s); " + near.size + " account(s) near a reminder time");

    // Grouped by owner, so one person's habits are read once however many
    // devices they have subscribed.
    const byUser = new Map();
    for (const uid of near) {
      const subs = await db.collection("users").doc(uid).collection("pushSubs").get();
      if (!subs.empty) byUser.set(uid, subs.docs);
    }

    let sent = 0, gone = 0;
    for (const [uid, docs] of byUser) {
      const snap = await db.collection("users").doc(uid).get();
      const state = snap.exists ? (snap.data() || {}).state : null;
      if (!state) {
        if (summary) console.log("[reminders] " + uid.slice(0, 6) + " has " + docs.length + " device(s) but no saved state");
        continue;
      }
      // Planner events live as their own items now; their reminders come from
      // the mirror mirrorPlannerReminders keeps. A planner still inside the
      // state is from an app that has not updated yet, and counts too.
      const mirror = await db.collection("plannerReminders").doc(uid).get();
      const mirrored = mirror.exists ? ((mirror.data() || {}).events || {}) : {};
      const legacy = (state.planner && Array.isArray(state.planner.events) ? state.planner.events : [])
        .filter((ev) => ev && ev.id && !(ev.id in mirrored) && !((mirror.data() || {}).seen || {})[ev.id]);
      const eventState = { planner: { events: Object.values(mirrored).concat(legacy) } };
      for (const doc of docs) {
        const tz = (doc.data() || {}).tz || "UTC";
        if (summary) {
          const times = (Array.isArray(state.tasks) ? state.tasks : [])
            .filter((t) => t && t.recurring).flatMap((t) => REMINDERS.reminderTimes(t));
          console.log("[reminders] " + uid.slice(0, 6) + " device " + doc.id.slice(0, 6) + " " +
            ((doc.data() || {}).tz ? tz : "UTC (no zone saved)") + " local " +
            REMINDERS.localParts(now, tz).hhmm + " | times: " + (times.length ? times.join(", ") : "none") +
            " | events with reminders: " + eventState.planner.events
              .filter((ev) => EVENT_REMINDERS.reminderOffsets(ev).length).length);
        }
        // A first look with no record of what was sent: when nothing is
        // anywhere near its time this device costs no further reads.
        const first = REMINDERS.explainReminders(state, now, tz, REMINDER_WINDOW_MINUTES);
        const firstEvents = EVENT_REMINDERS.explainEventReminders(eventState, now, tz, REMINDER_WINDOW_MINUTES);
        if (!first.candidates.length && !firstEvents.candidates.length) continue;

        const recordRef = db.collection("reminderSent").doc(uid + "__" + doc.id);
        const recordSnap = await recordRef.get();
        const record = recordSnap.exists ? (recordSnap.data() || {}) : {};
        const sentToday = record.day === first.dayKey && Array.isArray(record.ids) ? record.ids : [];
        const decision = REMINDERS.explainReminders(state, now, tz, REMINDER_WINDOW_MINUTES, sentToday);
        const dueNow = decision.candidates.filter((c) => c.reason === "send");
        const due = dueNow.map((c) => c.task).filter((t, i, all) => all.indexOf(t) === i);
        const eventDecision = EVENT_REMINDERS.explainEventReminders(eventState, now, tz, REMINDER_WINDOW_MINUTES, sentToday);
        const eventsDue = eventDecision.candidates.filter((c) => c.reason === "send");
        const lang = (state.settings && state.settings.language) || "en";
        const recorded = sentToday.slice();

        let result = "";
        // Planner events go as their own notification, under their own tag, so
        // one arriving in the same minute as a habit does not replace it.
        if (eventsDue.length) {
          result = await pushTo(doc, EVENT_REMINDERS.eventPayload(eventsDue, lang));
          if (result === "sent") {
            sent++;
            eventsDue.forEach((c) => recorded.push(c.key));
            await recordRef.set({ day: eventDecision.dayKey, ids: recorded.slice() })
              .catch((err) => console.error("[reminders] could not record the send", err && err.message));
          }
          if (result === "gone") gone++;
        }
        if (due.length && result !== "gone") {
          // One notification per device, listing everything due at once.
          // Three separate buzzes for three habits set to 07:00 is how people
          // learn to swipe notifications away without reading them. A single
          // habit says its own message when it has one.
          const titles = due.map((t) => String(t.title || "").slice(0, 60));
          const payload = due.length === 1
            ? { title: titles[0], body: REMINDERS.reminderNote(due[0]) || "Time for this one.", tag: "reminder", url: "./#habits" }
            : { title: due.length + " habits now", body: titles.join(" · "), tag: "reminder", url: "./#habits" };
          result = await pushTo(doc, payload);
          if (result === "sent") {
            sent++;
            // Recorded after the send rather than before: a failed write means
            // a repeat next minute, which is better than a reminder marked as
            // sent that never went.
            dueNow.forEach((c) => recorded.push(REMINDERS.sentKey(c.task, c.at)));
            await recordRef.set({ day: decision.dayKey, ids: recorded.slice() })
              .catch((err) => console.error("[reminders] could not record the send", err && err.message));
          }
          if (result === "gone") gone++;
        }
        // One line per device near a reminder time: an id prefix rather than
        // the id, the zone and local time the decision was made at, and each
        // habit's verdict.
        console.log("[reminders] " + uid.slice(0, 6) + " " + tz + " " + decision.localTime + " | " +
          decision.candidates.map((c) => String(c.task.title || "").slice(0, 30) + " @" + c.at + ": " + c.reason)
            .concat(eventDecision.candidates.map((c) => "event " + String(c.occ.title).slice(0, 30) + " " + c.day + " -" + c.offset + "m: " + c.reason))
            .join("; ") +
          (result ? " -> " + result : ""));
      }
    }
    if (sent || gone) console.log("[reminders] sent " + sent + ", pruned " + gone);
    await sendStreakRescues(db, now).catch((err) => console.error("[streak] rescue run failed", err && err.message));
    // A trial's last days, once an hour (server/trial.js; nothing while the paywall is off).
    if (now.getUTCMinutes() === 7) await sendTrialNotices(db, now).catch((err) => console.error("[trial] notice run failed", err && err.message));
  }
);

// The button in Settings. Proving a notification can actually arrive on this
// device is not a nicety: permission can be granted while delivery is still
// blocked at the OS level, and a reminder that silently never comes is worse
// than one that was never offered.
exports.sendTestPush = onCall({ secrets: [VAPID_PRIVATE_KEY] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  configurePush();
  const db = admin.firestore();
  const subs = await db.collection("users").doc(request.auth.uid).collection("pushSubs").get();
  if (subs.empty) {
    throw new HttpsError("failed-precondition", "This device isn't set up for reminders yet.");
  }
  let sent = 0, gone = 0;
  for (const doc of subs.docs) {
    const result = await pushTo(doc, {
      title: "The System",
      body: "Reminders are working on this device.",
      tag: "test",
      url: "./#habits",
    });
    if (result === "sent") sent++;
    if (result === "gone") gone++;
  }
  if (!sent) throw new HttpsError("internal", "The notification could not be delivered.");
  return { sent, gone };
});

// The public key the browser needs in order to subscribe. Served from here so
// there is one copy of it, rather than the same string pasted into the client
// and drifting from the key the server actually signs with.
exports.pushConfig = onCall(async () => ({ publicKey: VAPID_PUBLIC_KEY }));

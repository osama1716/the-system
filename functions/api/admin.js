// The admin page: who is an admin, billing and the AI cap, the stats, and the
// visit and save-failure reports that feed them.
"use strict";

const admin = require("firebase-admin");
const STREAK = require("../streak.js");
const STATS = require("../stats.js");
const { HttpsError, isAdminRequest, onCall } = require("../server/base");
const { setAdminDirectoryEntry } = require("../server/push");
const { AI_CAP_MAX, aiCapRef, billingRef, capFrom } = require("../server/ai");
const { readExpTotals } = require("../server/standing");

// setBilling — the admin tells the app what Anthropic's Console says: the
// balance right now (resets the running spend), a top-up just made (adds to
// it), or the monthly spend limit. Amounts in cents.
exports.setBilling = onCall(async (request) => {
  if (!isAdminRequest(request)) throw new HttpsError("permission-denied", "Admins only.");
  const d = request.data || {};
  const cents = (v) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 100000000) throw new HttpsError("invalid-argument", "Amounts are whole cents from 0.");
    return n;
  };
  const db = admin.firestore();
  const ref = billingRef(db);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists ? snap.data() : {};
    const next = {};
    if (d.balanceCents != null) {
      next.balanceAnchorCents = cents(d.balanceCents);
      next.anchorAt = admin.firestore.FieldValue.serverTimestamp();
      next.spentSinceAnchorMicros = 0;
    }
    if (d.topUpCents != null) {
      next.balanceAnchorCents = (Number(cur.balanceAnchorCents) || 0) + cents(d.topUpCents);
      if (!cur.anchorAt) next.anchorAt = admin.firestore.FieldValue.serverTimestamp();
      next.lastTopUpCents = cents(d.topUpCents);
      next.lastTopUpAt = admin.firestore.FieldValue.serverTimestamp();
    }
    if (d.monthlyLimitCents != null) next.monthlyLimitCents = cents(d.monthlyLimitCents);
    if (!Object.keys(next).length) throw new HttpsError("invalid-argument", "Nothing to set.");
    tx.set(ref, next, { merge: true });
  });
  console.log("[billing] " + request.auth.uid.slice(0, 6) + " set " + Object.keys(d).join(","));
  return { ok: true };
});

// adminStats — the admin's numbers (functions/stats.js). Reads every
// non-admin account's last 35 days of journal entries: fine for hundreds of
// accounts; past a few thousand this wants a nightly rollup instead.
exports.adminStats = onCall({ timeoutSeconds: 120, memory: "512MiB" }, async (request) => {
  if (!isAdminRequest(request)) throw new HttpsError("permission-denied", "Admins only.");
  const db = admin.firestore();
  const now = Date.now();
  const users = [];
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    page.users.forEach((u) => {
      if (u.customClaims && u.customClaims.admin) return;
      users.push({ uid: u.uid, createdMs: Date.parse(u.metadata.creationTime) });
    });
    pageToken = page.pageToken;
  } while (pageToken);

  const since = admin.firestore.Timestamp.fromMillis(now - 35 * 86400000);
  const activity = {};
  await Promise.all(users.map(async (u) => {
    const snap = await db.collection("users").doc(u.uid).collection("expEvents")
      .where("at", ">=", since).select("at", "delta").get();
    const days = new Set();
    snap.forEach((d) => {
      const x = d.data();
      if ((Number(x.delta) || 0) > 0 && x.at && typeof x.at.toMillis === "function") days.add(STATS.dayKey(x.at.toMillis()));
    });
    activity[u.uid] = days;
  }));
  const out = STATS.summarise(users, activity, now);

  // How far each account got with the opening assessment.
  const known = new Set(users.map((u) => u.uid));
  const assessment = { done: 0, skipped: 0, inProgress: 0, notStarted: 0 };
  const docs = await db.collection("users")
    .select("state.assessment.takenAt", "state.assessment.skipped", "state.settings.assessDraft.i").get();
  const seen = new Set();
  docs.forEach((d) => {
    if (!known.has(d.id)) return;
    seen.add(d.id);
    const s = ((d.data() || {}).state) || {};
    if (s.assessment && !s.assessment.skipped) assessment.done++;
    else if (s.assessment) assessment.skipped++;
    else if (s.settings && s.settings.assessDraft) assessment.inProgress++;
    else assessment.notStarted++;
  });
  assessment.notStarted += users.filter((u) => !seen.has(u.uid)).length;
  out.assessment = assessment;

  // Streaks alive today (freezes aside), and the longest of them.
  const streaks = { alive: 0, longest: 0 };
  (await db.collection("streaks").get()).forEach((d) => {
    if (!known.has(d.id)) return;
    const l = STREAK.live(d.data(), out.today, 0);
    if (l.current > 0) { streaks.alive++; streaks.longest = Math.max(streaks.longest, l.current); }
  });
  out.streaks = streaks;

  // AI valuations per day against the global cap, the last 7 days.
  const ai = { cap: capFrom(await aiCapRef(db).get()), days: [] };
  for (let i = 6; i >= 0; i--) {
    const day = STATS.shift(out.today, -i);
    const snap = await db.collection("aiBudget").doc(day).get();
    ai.days.push({ day, n: snap.exists ? Number(snap.data().count) || 0 : 0 });
  }
  out.ai = ai;

  // What Claude has cost this app (its own ledger), and what the admin last
  // said about the account.
  const month = new Date(now).toISOString().slice(0, 7);
  const spendSnap = await db.collection("aiSpend").doc(month).get();
  const bill = (await billingRef(db).get()).data() || {};
  out.billing = {
    month,
    monthMicros: spendSnap.exists ? Number(spendSnap.data().costMicros) || 0 : 0,
    monthCalls: spendSnap.exists ? Number(spendSnap.data().calls) || 0 : 0,
    monthlyLimitCents: bill.monthlyLimitCents != null ? Number(bill.monthlyLimitCents) : null,
    balanceCents: bill.balanceAnchorCents != null
      ? Math.round(Number(bill.balanceAnchorCents) - (Number(bill.spentSinceAnchorMicros) || 0) / 10000) : null,
    lastTopUpCents: bill.lastTopUpCents != null ? Number(bill.lastTopUpCents) : null,
  };
  // Visitors: devices that opened the app each day (UTC), signed in or not.
  const visits = [];
  for (let i = 13; i >= 0; i--) {
    const day = STATS.shift(out.today, -i);
    const c = await db.collection("visits").doc(day).collection("devices").count().get();
    visits.push({ day, n: c.data().count || 0 });
  }
  out.visits = visits;
  // Who was here: accounts by when they last opened the app, newest first,
  // with the name they chose and the email they signed in with.
  const seenSnap = await db.collection("lastSeen").orderBy("at", "desc").limit(50).get();
  const seenRows = seenSnap.docs.filter((d) => known.has(d.id) && d.data().at);
  const dirDocs = seenRows.length ? await db.getAll(...seenRows.map((d) => db.collection("userDirectory").doc(d.id))) : [];
  out.seen = seenRows.map((d, i) => {
    const dir = dirDocs[i] && dirDocs[i].exists ? dirDocs[i].data() : {};
    return { name: dir.name || null, email: dir.email || null, at: d.data().at.toMillis() };
  });
  console.log("[stats] " + users.length + " accounts, " + out.activeToday + " active today");
  return out;
});

// noteVisit — the app was opened. Counts devices per day (signed in or not)
// and, for an account, when it was last seen; nothing else about the visitor
// is kept. The client calls it at most every half hour.
exports.noteVisit = onCall(async (request) => {
  const device = (request.data || {}).device;
  if (typeof device !== "string" || !/^[A-Za-z0-9_-]{8,40}$/.test(device)) {
    throw new HttpsError("invalid-argument", "Expected { device }.");
  }
  const db = admin.firestore();
  const day = STATS.dayKey(Date.now());
  const at = admin.firestore.FieldValue.serverTimestamp();
  const writes = [db.collection("visits").doc(day).collection("devices").doc(device)
    .set({ at, signedIn: !!request.auth }, { merge: true })];
  if (request.auth) writes.push(db.collection("lastSeen").doc(request.auth.uid).set({ at }));
  await Promise.all(writes);
  return { ok: true };
});

// ---------------------------------------------------------------------------
// setAdmin — promote/demote an account by email. Admin-only (checks the
// caller's own custom claim, set once via scripts/bootstrap-admin.js for the
// very first admin). Custom claims only appear in a fresh ID token, so the
// affected account must sign out and back in for this to take effect.
// ---------------------------------------------------------------------------
exports.setAdmin = onCall(async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  const { email, admin: makeAdmin } = request.data || {};
  if (typeof email !== "string" || !email.trim() || typeof makeAdmin !== "boolean") {
    throw new HttpsError("invalid-argument", "Expected { email: string, admin: boolean }.");
  }
  const user = await admin.auth().getUserByEmail(email.trim());
  await admin.auth().setCustomUserClaims(user.uid, { admin: makeAdmin });
  await setAdminDirectoryEntry(user.uid, makeAdmin);
  return { uid: user.uid, email: user.email, admin: makeAdmin };
});

// ---------------------------------------------------------------------------
// getAdminStatus — admin-only. Custom claims live only in Firebase Auth, not
// Firestore, so there's no way for the client to know another account's
// current admin status without a server round-trip like this one. Used so
// the admin panel can disable "Make admin"/"Remove admin" appropriately
// instead of letting either be clicked regardless of current state.
// ---------------------------------------------------------------------------
exports.getAdminStatus = onCall(async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  const { uid } = request.data || {};
  if (typeof uid !== "string" || !uid.trim()) {
    throw new HttpsError("invalid-argument", "Expected { uid: string }.");
  }
  const user = await admin.auth().getUser(uid.trim());
  const totals = await readExpTotals(uid.trim());
  return {
    uid: user.uid,
    admin: !!(user.customClaims && user.customClaims.admin === true),
    // How much of this account's standing is backed by a price the evaluator
    // issued, and how much rests on its own say-so.
    expTotal: totals.total,
    expUnverified: totals.unverified,
  };
});

// ---------------------------------------------------------------------------
// backfillUserDirectory — admin-only. onUserCreate only fires for accounts
// created AFTER these functions were first deployed; any account that
// existed before that (including the very first admin's own account) has no
// userDirectory entry and can't be found by the admin search until this
// runs once. Safe to re-run any time — only fills in what's missing.
// ---------------------------------------------------------------------------
exports.backfillUserDirectory = onCall(async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  const db = admin.firestore();
  let nextPageToken;
  let written = 0;
  do {
    const page = await admin.auth().listUsers(1000, nextPageToken);
    const batch = db.batch();
    for (const user of page.users) {
      const ref = db.collection("userDirectory").doc(user.uid);
      batch.set(ref, {
        email: user.email || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      written += 1;
    }
    if (page.users.length) await batch.commit();
    nextPageToken = page.pageToken;
  } while (nextPageToken);
  return { usersProcessed: written };
});

// setAiCap — the admin changes the global cap. Takes effect on the next
// valuation anywhere, since every valuation reads it.
exports.setAiCap = onCall(async (request) => {
  if (!isAdminRequest(request)) throw new HttpsError("permission-denied", "Admins only.");
  const n = Number((request.data || {}).cap);
  if (!Number.isInteger(n) || n < 0 || n > AI_CAP_MAX) {
    throw new HttpsError("invalid-argument", "The cap must be a whole number from 0 to " + AI_CAP_MAX + ".");
  }
  await aiCapRef(admin.firestore()).set({
    globalCap: n, setBy: request.auth.uid, setAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log("[ai-budget] global daily cap set to " + n + " by " + request.auth.uid.slice(0, 6));
  return { cap: n };
});

// A cloud save the database refused, reported by the app so the reason reaches
// the logs. The write goes straight from the browser to Firestore, so a
// refusal otherwise leaves nothing on the server side at all — only a notice
// on someone's screen that says it failed and not why. Sizes and counts only,
// never content: the code and message, the document's size and each part of
// it, and how long the lists the rules cap have grown.
exports.reportSaveFailure = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const d = request.data || {};
  const num = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
  const sizes = {};
  Object.keys(d.sizesKB || {}).slice(0, 20).forEach((k) => { sizes[String(k).slice(0, 30)] = num(d.sizesKB[k]); });
  const counts = {};
  Object.keys(d.counts || {}).slice(0, 20).forEach((k) => { counts[String(k).slice(0, 30)] = num(d.counts[k]); });
  console.log("[save-failure] " + request.auth.uid.slice(0, 6) +
    " code=" + String(d.code || "").slice(0, 60) +
    " totalKB=" + num(d.totalKB) +
    " sizesKB=" + JSON.stringify(sizes) +
    " counts=" + JSON.stringify(counts) +
    " message=" + String(d.message || "").slice(0, 300));
  return { ok: true };
});

// Claiming, checking and looking up display names.
"use strict";

const admin = require("firebase-admin");
const SEARCH = require("../search.js");
const { ANTHROPIC_API_KEY, HttpsError, onCall, takeDailyAllowance } = require("../server/base");
const { moderateText } = require("../server/ai");
const { writeLeaderboardEntry } = require("../server/standing");
const { USERNAME_MAX, USERNAME_MIN, USERNAME_RE, normalizeUsername } = require("../server/names");

// ---------------------------------------------------------------------------
// Usernames
//
// Display names have to be unique because a global ranking is meaningless if
// two people can present as the same person. Uniqueness is enforced here and
// not in the client: two clients checking "is this free?" and then writing
// would both pass. The name is the document ID in `usernames`, so the
// database itself rejects the second writer, and the whole change is one
// transaction — the old name is released and the new one taken together, so a
// failure can never leave someone with two names or none.
// ---------------------------------------------------------------------------

// Releasing a name used to be instantaneous: the old record was deleted in the
// same transaction that took the new one. That let anyone standing by take the
// name a known player had just left, and on a public leaderboard the people
// reading it have no way to tell that the name changed hands.
//
// So a released name is not deleted, it is parked: the record stays, still
// pointing at its previous owner, with an expiry. Until that passes nobody else
// can take it — and the previous owner can always take it back, which also
// makes an accidental rename undoable rather than final.
//
// No cleanup job: an expired record is simply overwritten by whoever claims it
// next, so nothing accumulates that a later claim doesn't clear on its own.
const USERNAME_COOLDOWN_DAYS = 30;
const RENAMES_PER_DAY = 10;
const USERNAME_COOLDOWN_MS = USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

// What, if anything, stops `uid` from taking the name this document holds.
// Returns null when the name is theirs for the asking.
function claimBlocker(doc, uid) {
  if (!doc.exists) return null;
  const data = doc.data();
  // Their own — whether they hold it now or released it and it is still parked.
  if (data.uid === uid) return null;
  // No expiry means somebody is actively using it.
  if (!data.heldUntil) return { reason: "taken" };
  const untilMs = data.heldUntil.toMillis();
  if (untilMs <= Date.now()) return null; // cooled off, free to take
  return { reason: "cooldown", untilMs, days: Math.max(1, Math.ceil((untilMs - Date.now()) / 86400000)) };
}

function claimError(blocker) {
  if (blocker.reason === "cooldown") {
    return new HttpsError(
      "already-exists",
      `That name was recently released and stays reserved for its previous owner for another ${blocker.days} day(s).`,
      { reason: "cooldown", availableInDays: blocker.days }
    );
  }
  return new HttpsError("already-exists", "That name is already taken.", { reason: "taken" });
}

exports.claimUsername = onCall({ secrets: [ANTHROPIC_API_KEY] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const { name } = request.data || {};
  if (typeof name !== "string") throw new HttpsError("invalid-argument", "Expected { name: string }.");

  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length < USERNAME_MIN || trimmed.length > USERNAME_MAX) {
    throw new HttpsError("invalid-argument", `Name must be between ${USERNAME_MIN} and ${USERNAME_MAX} characters.`);
  }
  if (!USERNAME_RE.test(trimmed)) {
    throw new HttpsError("invalid-argument", "Names can use letters, numbers, spaces, _ and - only.");
  }

  const uid = request.auth.uid;
  const key = normalizeUsername(trimmed);
  const db = admin.firestore();
  const newRef = db.collection("usernames").doc(key);
  const dirRef = db.collection("userDirectory").doc(uid);

  // A name is public on the ranking and the profile, so it is checked the way
  // a bio is — unless it is the name this account already holds.
  const held = await dirRef.get();
  if (!(held.exists && held.data().usernameKey === key)) {
    // Each check is a paid model call, so a name may be tried only so many
    // times a day — refused names included, or trying them would be free.
    await takeDailyAllowance(db, uid, "renames", RENAMES_PER_DAY, "rename-limit");
    const verdict = await moderateText("name", trimmed);
    if (!verdict.allowed) throw new HttpsError("failed-precondition", "not-allowed", { code: "not-allowed", reason: verdict.reason });
  }

  await db.runTransaction(async (tx) => {
    // All reads must precede all writes inside a Firestore transaction.
    const [newDoc, dirDoc] = await Promise.all([tx.get(newRef), tx.get(dirRef)]);
    const blocker = claimBlocker(newDoc, uid);
    if (blocker) throw claimError(blocker);

    const previousKey = dirDoc.exists ? dirDoc.data().usernameKey : null;
    const previousName = dirDoc.exists ? dirDoc.data().name : null;

    if (previousKey && previousKey !== key) {
      // Parked, not deleted — see USERNAME_COOLDOWN_DAYS above. Written as a
      // full set so a name reclaimed later replaces this record outright and
      // loses the expiry, rather than carrying a stale one forward.
      tx.set(db.collection("usernames").doc(previousKey), {
        uid,
        name: previousName || previousKey,
        releasedAt: admin.firestore.FieldValue.serverTimestamp(),
        heldUntil: admin.firestore.Timestamp.fromMillis(Date.now() + USERNAME_COOLDOWN_MS),
      });
    }
    tx.set(newRef, { uid, name: trimmed, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    // The search index follows the claim: the new name in, the old one out
    // (one write when both live in the same shard).
    const indexWrites = {};
    const indexOf = (k) => (indexWrites[SEARCH.shardOf(k)] = indexWrites[SEARCH.shardOf(k)] || {});
    if (previousKey && previousKey !== key) indexOf(previousKey)[previousKey] = admin.firestore.FieldValue.delete();
    indexOf(key)[key] = { uid, name: trimmed };
    Object.keys(indexWrites).forEach((shard) => tx.set(db.collection("nameIndex").doc(shard), { n: indexWrites[shard] }, { merge: true }));
    // Mirrored onto the directory so the admin panel resolves a uid to both a
    // name and an email in one read, and so the previous claim is known next
    // time without a query.
    tx.set(dirRef, { name: trimmed, usernameKey: key }, { merge: true });
  });

  // The board shows the claimed name, so a rename has to reach it now
  // instead of waiting for this account's next state push — otherwise the
  // leaderboard keeps showing a name its owner has already given up, which is
  // the exact confusion uniqueness exists to prevent. Best-effort on purpose:
  // the claim itself has already committed, and a lagging mirror must not be
  // reported back as a failed rename.
  try {
    const userDoc = await db.collection("users").doc(uid).get();
    const player = userDoc.exists && userDoc.data().state ? userDoc.data().state.player : null;
    if (player) await writeLeaderboardEntry(uid, player);
  } catch (err) {
    console.warn("[claimUsername] leaderboard mirror failed", err);
  }

  return { name: trimmed };
});

// Availability preview for the rename field. Read-only and cheap; the claim
// itself is still the thing that decides, since a name can be taken between
// the check and the write.
exports.checkUsername = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const { name } = request.data || {};
  if (typeof name !== "string" || !name.trim()) return { available: false, reason: "empty" };
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length < USERNAME_MIN || trimmed.length > USERNAME_MAX) return { available: false, reason: "length" };
  if (!USERNAME_RE.test(trimmed)) return { available: false, reason: "charset" };
  const doc = await admin.firestore().collection("usernames").doc(normalizeUsername(trimmed)).get();
  const blocker = claimBlocker(doc, request.auth.uid);
  if (!blocker) return { available: true, reason: "ok" };
  return { available: false, reason: blocker.reason, availableInDays: blocker.days || null };
});

// Admin-only migration: accounts that existed before names became unique
// never reserved theirs, so searching by name can't find them. This walks the
// directory and claims each account's current name where it's still free.
//
// Duplicates are the interesting case, and they're real: two accounts can
// both be called "Osama" because nothing stopped them at the time. Only one
// can keep it. Rather than pick a winner by renaming someone behind their
// back — their name is about to become public on a leaderboard — the first
// claim wins and the rest are reported back as conflicts, so a person is
// asked to choose instead of being assigned something.
// Safe to re-run: an account that already holds its name is skipped.
exports.backfillUsernames = onCall(async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  const db = admin.firestore();
  const dirSnap = await db.collection("userDirectory").get();

  let claimed = 0, alreadyHeld = 0, skippedInvalid = 0;
  const conflicts = [];

  for (const dirDoc of dirSnap.docs) {
    const uid = dirDoc.id;
    if (dirDoc.data().usernameKey) { alreadyHeld++; continue; }

    const userDoc = await db.collection("users").doc(uid).get();
    const rawName = userDoc.exists && userDoc.data().state && userDoc.data().state.player
      ? userDoc.data().state.player.name : null;
    if (typeof rawName !== "string") { skippedInvalid++; continue; }

    const trimmed = rawName.trim().replace(/\s+/g, " ");
    if (trimmed.length < USERNAME_MIN || trimmed.length > USERNAME_MAX || !USERNAME_RE.test(trimmed)) {
      skippedInvalid++;
      conflicts.push({ uid, email: dirDoc.data().email || null, name: trimmed, reason: "invalid" });
      continue;
    }

    const key = normalizeUsername(trimmed);
    try {
      await db.runTransaction(async (tx) => {
        const existing = await tx.get(db.collection("usernames").doc(key));
        const blocker = claimBlocker(existing, uid);
        if (blocker) throw claimError(blocker);
        tx.set(db.collection("usernames").doc(key), {
          uid, name: trimmed, updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        tx.set(db.collection("userDirectory").doc(uid), { name: trimmed, usernameKey: key }, { merge: true });
      });
      claimed++;
    } catch (err) {
      conflicts.push({ uid, email: dirDoc.data().email || null, name: trimmed, reason: "taken" });
    }
  }

  return { total: dirSnap.size, claimed, alreadyHeld, skippedInvalid, conflicts };
});

// Admin-only: resolve a name or an email to a directory entry, so the admin
// can search by either.
exports.lookupUser = onCall(async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  const { query } = request.data || {};
  if (typeof query !== "string" || !query.trim()) {
    throw new HttpsError("invalid-argument", "Expected { query: string }.");
  }
  const q = query.trim();
  const db = admin.firestore();

  // An "@" means it can only be an email; otherwise try the name first and
  // fall back to email, so an admin can paste either without choosing a mode.
  if (!q.includes("@")) {
    const nameDoc = await db.collection("usernames").doc(normalizeUsername(q)).get();
    if (nameDoc.exists) {
      const uid = nameDoc.data().uid;
      const dir = await db.collection("userDirectory").doc(uid).get();
      // The directory holds the account's *current* name. Searching a name
      // that is merely parked should still find its owner — but it must show
      // who they are now, not the name they have already moved on from.
      return {
        uid,
        name: (dir.exists && dir.data().name) || nameDoc.data().name,
        email: dir.exists ? dir.data().email : null,
      };
    }
  }
  const snap = await db.collection("userDirectory").where("email", "==", q).limit(1).get();
  if (snap.empty) throw new HttpsError("not-found", "No account found with that name or email.");
  const d = snap.docs[0];
  return { uid: d.id, name: d.data().name || null, email: d.data().email || null };
});

// Admin-only: attach name + email to a list of uids, for the appeal queue.
// Looked up rather than trusted from the appeal document, so it can't be
// forged by the client that filed it and stays correct after a rename.
exports.resolveUsers = onCall(async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  const { uids } = request.data || {};
  if (!Array.isArray(uids)) throw new HttpsError("invalid-argument", "Expected { uids: string[] }.");
  const unique = [...new Set(uids.filter((u) => typeof u === "string" && u))].slice(0, 100);
  if (!unique.length) return { users: {} };

  const db = admin.firestore();
  const docs = await db.getAll(...unique.map((u) => db.collection("userDirectory").doc(u)));
  const users = {};
  docs.forEach((d) => {
    if (d.exists) users[d.id] = { name: d.data().name || null, email: d.data().email || null };
  });
  return { users };
});

// Friend requests, invites and removing a friend.
"use strict";

const admin = require("firebase-admin");
const FRIENDS = require("../friends.js");
const { HttpsError, VAPID_PRIVATE_KEY, onCall, takeDailyAllowance } = require("../server/base");
const { blockError, blocksBetween, displayNameOf, notifyUser } = require("../server/social");
const { normalizeUsername } = require("../server/names");

// ---------------------------------------------------------------------------
// Friends (functions/friends.js)

async function friendCountOf(db, uid) {
  const snap = await db.collection("friendships").where("users", "array-contains", uid)
    .where("status", "==", "accepted").count().get();
  return snap.data().count;
}

// Asks someone to be friends, found by uid or by their claimed name. Asking
// someone who has already asked you accepts it.
exports.sendFriendRequest = onCall({ secrets: [VAPID_PRIVATE_KEY] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const me = request.auth.uid;
  const db = admin.firestore();
  const data = request.data || {};
  let them = typeof data.uid === "string" ? data.uid : null;
  if (!them && typeof data.name === "string" && data.name.trim()) {
    const claim = await db.collection("usernames").doc(normalizeUsername(data.name.trim().replace(/\s+/g, " "))).get();
    them = claim.exists && !claim.data().releasedAt ? claim.data().uid : null;
    if (!them) throw new HttpsError("not-found", "no-such-player", { code: "no-such-player" });
  }
  if (!them || !/^[A-Za-z0-9]{10,40}$/.test(them)) throw new HttpsError("invalid-argument", "Expected { uid } or { name }.");

  const ref = db.collection("friendships").doc(FRIENDS.pairId(me, them));
  const [existing, blocks, count, themRow] = await Promise.all([
    ref.get(), them === me ? {} : blocksBetween(db, me, them), friendCountOf(db, me),
    db.collection("leaderboard").doc(them).get(),
  ]);
  if (!themRow.exists && them !== me) throw new HttpsError("not-found", "no-such-player", { code: "no-such-player" });
  const decision = FRIENDS.decideRequest({ me, them, existing: existing.exists ? existing.data() : null, ...blocks, friendCount: count });
  const myName = await displayNameOf(db, me);
  switch (decision) {
    case "create":
      // Only a request actually sent counts.
      await takeDailyAllowance(db, me, "friendRequests", FRIENDS.REQUESTS_PER_DAY, "too-many", "That's enough requests for today.");
      await ref.set({ users: [me, them].sort(), status: "pending", from: me, to: them, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      await notifyUser(them, "request", myName);
      return { status: "sent" };
    case "accept":
      await ref.set({ status: "accepted", acceptedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      await notifyUser(them, "accepted", myName);
      return { status: "friends" };
    case "already-friends": return { status: "friends" };
    case "already-sent": return { status: "sent" };
    default:
      // "self", "full" or a block — said as a code the app words itself.
      if (decision === "blocked-by" || decision === "you-blocked") throw blockError(decision, String(themRow.data().displayName || ""));
      throw new HttpsError("failed-precondition", decision, { code: decision });
  }
});

exports.respondFriendRequest = onCall({ secrets: [VAPID_PRIVATE_KEY] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const me = request.auth.uid;
  const { uid: them, accept } = request.data || {};
  if (typeof them !== "string" || typeof accept !== "boolean") throw new HttpsError("invalid-argument", "Expected { uid, accept }.");
  const db = admin.firestore();
  const ref = db.collection("friendships").doc(FRIENDS.pairId(me, them));
  const snap = await ref.get();
  if (!snap.exists || snap.data().status !== "pending" || snap.data().to !== me) {
    throw new HttpsError("failed-precondition", "no-request", { code: "no-request" });
  }
  if (!accept) {
    await ref.delete();
    return { status: "declined" };
  }
  if (await friendCountOf(db, me) >= FRIENDS.MAX_FRIENDS) throw new HttpsError("failed-precondition", "full", { code: "full" });
  await ref.set({ status: "accepted", acceptedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  await notifyUser(them, "accepted", await displayNameOf(db, me));
  return { status: "friends" };
});

// Unfriends, withdraws a request, or refuses one — whichever there is.
exports.removeFriend = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const them = (request.data || {}).uid;
  if (typeof them !== "string") throw new HttpsError("invalid-argument", "Expected { uid }.");
  await admin.firestore().collection("friendships").doc(FRIENDS.pairId(request.auth.uid, them)).delete();
  return { status: "removed" };
});

// A link that makes whoever opens it (and signs in) a friend at once: sending
// the link is the inviter's yes, opening it is the other's.
exports.createInvite = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const me = request.auth.uid;
  const db = admin.firestore();
  await takeDailyAllowance(db, me, "invites", FRIENDS.INVITES_PER_DAY, "too-many", "That's enough invite links for today.");
  const token = require("crypto").randomBytes(12).toString("hex");
  await db.collection("invites").doc(token).set({
    uid: me,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + FRIENDS.INVITE_DAYS * 86400000),
  });
  return { token };
});

exports.acceptInvite = onCall({ secrets: [VAPID_PRIVATE_KEY] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const me = request.auth.uid;
  const token = (request.data || {}).token;
  if (typeof token !== "string" || !/^[0-9a-f]{24}$/.test(token)) throw new HttpsError("invalid-argument", "bad-invite", { code: "bad-invite" });
  const db = admin.firestore();
  const invite = await db.collection("invites").doc(token).get();
  if (!invite.exists || invite.data().expiresAt.toMillis() < Date.now()) throw new HttpsError("not-found", "bad-invite", { code: "bad-invite" });
  const them = invite.data().uid;
  if (them === me) throw new HttpsError("failed-precondition", "self", { code: "self" });
  const blocks = await blocksBetween(db, me, them);
  if (blocks.blockedBy) throw blockError("blocked-by", await displayNameOf(db, them));
  if (blocks.youBlocked) throw blockError("you-blocked", await displayNameOf(db, them));
  const ref = db.collection("friendships").doc(FRIENDS.pairId(me, them));
  const existing = await ref.get();
  if (!(existing.exists && existing.data().status === "accepted")) {
    const [mine, theirs] = await Promise.all([friendCountOf(db, me), friendCountOf(db, them)]);
    if (mine >= FRIENDS.MAX_FRIENDS || theirs >= FRIENDS.MAX_FRIENDS) throw new HttpsError("failed-precondition", "full", { code: "full" });
    await ref.set({
      users: [me, them].sort(), status: "accepted", from: them, to: me, via: "invite",
      createdAt: admin.firestore.FieldValue.serverTimestamp(), acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await notifyUser(them, "invited", await displayNameOf(db, me));
  }
  return { status: "friends", uid: them, name: await displayNameOf(db, them) };
});

// Claimed names: how two are compared, what one may contain, and the index the
// player search reads.
"use strict";

const admin = require("firebase-admin");
const SEARCH = require("../search.js");

// Case- and spacing-insensitive key, so "Osama", "osama" and "  osama  " are
// the same claim. Arabic and other scripts are allowed through; only the
// separators are normalised.
function normalizeUsername(name) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// Two, not three: a Chinese or Japanese name of two characters is complete
// and ordinary, and a Latin-calibrated minimum rejects them outright.
const USERNAME_MIN = 2;
const USERNAME_MAX = 20;
// Any script's letters and digits, plus combining marks. Marks are separate
// code points that aren't themselves "letters", so leaving them out rejects
// perfectly normal Devanagari, Thai, Hebrew and vocalised Arabic names —
// found by testing sixteen scripts rather than assuming Latin behaviour
// generalises. Spaces, _ and - are allowed inside but never at either end,
// and nothing that could read as markup gets through.
const USERNAME_RE = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} _-]*[\p{L}\p{N}\p{M}]$/u;

// ---------------------------------------------------------------------------
// Player search (functions/search.js)
//
// nameIndex/{shard} = { n: { [usernameKey]: { uid, name } } } — every claimed
// name, in 16 small documents, kept by claimUsername and reviewReport.
// nameIndex/_meta.built says the index was filled from `usernames` once, so
// names claimed before it existed are in it too.

function nameIndexRef(db, key) {
  return db.collection("nameIndex").doc(SEARCH.shardOf(key));
}

async function ensureNameIndex(db) {
  const meta = db.collection("nameIndex").doc("_meta");
  if ((await meta.get()).exists) return;
  const snap = await db.collection("usernames").get();
  const shards = {};
  snap.docs.forEach((d) => {
    const data = d.data();
    if (data.releasedAt || !data.uid) return;
    const shard = SEARCH.shardOf(d.id);
    (shards[shard] = shards[shard] || {})[d.id] = { uid: data.uid, name: String(data.name || d.id) };
  });
  const batch = db.batch();
  Object.keys(shards).forEach((shard) => batch.set(db.collection("nameIndex").doc(shard), { n: shards[shard] }, { merge: true }));
  batch.set(meta, { built: admin.firestore.FieldValue.serverTimestamp(), names: snap.size });
  await batch.commit();
  console.log("[search] built the name index from " + snap.size + " name(s)");
}

// The whole index, kept in memory for a minute: searches as someone types
// cost nothing beyond the first.
let nameIndexCache = { at: 0, entries: [] };
async function nameIndexEntries(db) {
  if (Date.now() - nameIndexCache.at < 60000) return nameIndexCache.entries;
  await ensureNameIndex(db);
  const docs = await Promise.all(Array.from({ length: SEARCH.SHARDS }, (_, i) => db.collection("nameIndex").doc(String(i)).get()));
  const entries = [];
  docs.forEach((d) => { if (d.exists) Object.values((d.data() || {}).n || {}).forEach((e) => entries.push(e)); });
  nameIndexCache = { at: Date.now(), entries };
  return entries;
}

module.exports = { USERNAME_MAX, USERNAME_MIN, USERNAME_RE, nameIndexEntries, nameIndexRef, normalizeUsername };

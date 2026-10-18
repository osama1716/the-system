// The shop: buying with gold and wearing what you own. The rules are in
// functions/shop.js.
"use strict";

const admin = require("firebase-admin");
const STREAK = require("../streak.js");
const SHOP = require("../shop.js");
const { HttpsError, isAdminRequest, onCall } = require("../server/base");
const { rankIdxOfTotal, readExpTotals } = require("../server/standing");

// buyItem — spends gold (or, once payments exist, Aurenite) on one thing.
exports.buyItem = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid;
  const d = request.data || {};
  const item = { kind: String(d.kind || "").slice(0, 20), id: typeof d.id === "string" ? d.id.slice(0, 60) : undefined };
  const db = admin.firestore();
  const ref = db.collection("wallets").doc(uid);
  const streakRef = db.collection("streaks").doc(uid);
  const out = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const streakSnap = item.kind === "freeze" ? await tx.get(streakRef) : null;
    const totals = snap.exists ? null : await readExpTotals(uid);
    const wallet = SHOP.cleanWallet(snap.exists ? snap.data() : null, totals ? rankIdxOfTotal(totals.total) : 0);
    const res = SHOP.buy(wallet, item);
    if (!res.ok) return res;
    tx.set(ref, { ...res.wallet, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    // A freeze moves the streak's last evening a day further out.
    if (streakSnap && streakSnap.exists && streakSnap.data().lastDay) {
      const st = streakSnap.data();
      tx.update(streakRef, { rescueAt: STREAK.rescueAt(STREAK.shiftDayKey(st.lastDay, res.wallet.freezes), st.tz || "UTC"), rescueSent: false });
    }
    return res;
  });
  console.log("[shop] " + uid.slice(0, 6) + " " + item.kind + (item.id ? " " + item.id : "") + " -> " + (out.ok ? "bought, gold " + out.wallet.gold : out.error));
  if (!out.ok) throw new HttpsError("failed-precondition", out.error, { code: "shop-" + out.error });
  return { wallet: out.wallet };
});

// wearItem — puts a frame or a background on the public profile (or takes it
// off, with no id). profiles/{uid}.worn = { frame, background }; written only
// here, and only with what the wallet holds (an admin may try anything).
exports.wearItem = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = request.auth.uid;
  const d = request.data || {};
  const kind = String(d.kind || "").slice(0, 20);
  const db = admin.firestore();
  const snap = await db.collection("wallets").doc(uid).get();
  const wallet = SHOP.cleanWallet(snap.exists ? snap.data() : null, 0);
  const res = SHOP.wear(wallet, kind, typeof d.id === "string" ? d.id.slice(0, 60) : null, isAdminRequest(request));
  console.log("[wear] " + uid.slice(0, 6) + " " + kind + " " + (d.id || "-") + " -> " + (res.ok ? "ok" : res.error));
  if (!res.ok) throw new HttpsError("failed-precondition", res.error, { code: "shop-" + res.error });
  await db.collection("profiles").doc(uid).set({ worn: { [kind]: res.id } }, { merge: true });
  return { kind, id: res.id };
});

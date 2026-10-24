// What a Paddle notification means for an account — the pure half of the
// payments webhook (functions/api/payments.js), so it can be tested without
// Firebase or Paddle.
//
// Paddle is the merchant of record: it charges the card, retries a failed
// renewal, sends the receipts. All the app keeps is whether an account is
// paid for, and until when: subscriptions/{uid} = { active, until, … }, which
// functions/access.js reads on the server and the plans window on the device.
// The rules agreed for it (2026-10-23):
// - a paid period runs to the end of what was paid for, a little past it, so
//   the renewal has time to arrive before anything locks;
// - a failed renewal keeps the account open for GRACE_DAYS while Paddle
//   retries, then locks it, and the next successful charge opens it again;
// - a cancelled subscription runs to the end of its period;
// - a refund, or a chargeback, locks it at once.
//
// Whose a subscription is comes only from a checkout the server started
// (startCheckout, paddleCheckouts/{transactionId}), never from the customData
// a browser hands Paddle: anyone can open a checkout with the public client
// token and name any account in it.
"use strict";

const crypto = require("crypto");

const DAY_MS = 86400000;
const GRACE_DAYS = 7;
// How far past the end of a paid period the account stays open while the
// renewal's notification is on its way.
const PERIOD_SLACK_MS = DAY_MS;
// How old a signed notification may be. Paddle's own libraries allow five
// seconds; a clock a little off, or a slow cold start, should not turn a real
// payment away, and a replay of an old one is refused by its event id anyway.
const SIGNATURE_TOLERANCE_S = 300;

// "ts=1671552777;h1=eb4d…" — h1 may come more than once while Paddle rotates
// a secret.
function parseSignature(header) {
  const out = { ts: null, h1: [] };
  String(header || "").split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i < 0) return;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === "ts") out.ts = v;
    if (k === "h1" && /^[0-9a-f]{64}$/i.test(v)) out.h1.push(v.toLowerCase());
  });
  return out;
}

// HMAC-SHA256 over "<ts>:<raw body>" with this destination's secret. The body
// must be the bytes as they arrived: parsing and re-serialising changes them.
function verifySignature(header, rawBody, secret, nowS) {
  const { ts, h1 } = parseSignature(header);
  if (!ts || !/^\d{1,12}$/.test(ts) || !h1.length || !secret) return false;
  if (Math.abs(Number(nowS) - Number(ts)) > SIGNATURE_TOLERANCE_S) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ""), "utf8");
  const mac = crypto.createHmac("sha256", String(secret)).update(ts + ":").update(body).digest();
  return h1.some((sig) => {
    const given = Buffer.from(sig, "hex");
    return given.length === mac.length && crypto.timingSafeEqual(given, mac);
  });
}

// A Firebase uid, as startCheckout records it.
function isUid(x) { return typeof x === "string" && /^[A-Za-z0-9]{10,128}$/.test(x); }

// The two plans and their Paddle prices. Not secret — a price id is shown to
// every buyer — but different in the Sandbox and live. null until the owner
// creates them in Paddle; startCheckout refuses to start while one is.
const PLANS = ["monthly", "annual"];
const PRICE_IDS = {
  sandbox: { monthly: null, annual: null },
  live: { monthly: null, annual: null },
};
function priceFor(plan, sandbox) {
  const id = (PRICE_IDS[sandbox ? "sandbox" : "live"] || {})[plan];
  return typeof id === "string" && /^pri_[a-z0-9]{26}$/.test(id) ? id : null;
}

function ms(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

// "annual" or "monthly", from how often it renews.
function planOf(sub) {
  const cycle = (sub && sub.billing_cycle) ||
    (sub && Array.isArray(sub.items) && sub.items[0] && sub.items[0].price && sub.items[0].price.billing_cycle) || null;
  if (!cycle) return null;
  if (cycle.interval === "year" && Number(cycle.frequency) === 1) return "annual";
  if (cycle.interval === "month" && Number(cycle.frequency) === 1) return "monthly";
  return null;
}

// paddleSubs/{subscriptionId}: what the latest notification said about one
// subscription. `prev` is what was stored; null back means this notification
// is older than it (Paddle does not promise order) and changes nothing.
function nextSubRecord(prev, sub, occurredAtMs) {
  const at = Number(occurredAtMs) || 0;
  if (prev && Number(prev.eventAt) > at) return null;
  const status = String(sub.status || "");
  const change = sub.scheduled_change && sub.scheduled_change.action === "cancel" ? sub.scheduled_change : null;
  const price = Array.isArray(sub.items) && sub.items[0] && sub.items[0].price ? sub.items[0].price.id || null : null;
  return {
    id: String(sub.id),
    // Only ever the link a server-started checkout made; see the top.
    uid: (prev && prev.uid) || null,
    customerId: sub.customer_id || (prev && prev.customerId) || null,
    status,
    plan: planOf(sub) || (prev && prev.plan) || null,
    priceId: price || (prev && prev.priceId) || null,
    periodEndsAt: sub.current_billing_period ? ms(sub.current_billing_period.ends_at) : (prev && prev.periodEndsAt) || null,
    renewsAt: change ? null : ms(sub.next_billed_at),
    cancelAt: change ? ms(change.effective_at) : null,
    // When the renewal first failed; kept through the retries, cleared once paid.
    pastDueSince: status === "past_due" ? ((prev && prev.pastDueSince) || at) : null,
    refundedAt: (prev && prev.refundedAt) || null,
    eventAt: at,
  };
}

// What the account may do on the strength of one subscription record.
function entitlement(rec) {
  if (!rec) return { active: false, until: null };
  if (rec.refundedAt) return { active: false, until: Number(rec.refundedAt) };
  if (rec.status === "active" || rec.status === "trialing") {
    const end = Number(rec.periodEndsAt) || 0;
    return { active: true, until: rec.cancelAt ? end : end + PERIOD_SLACK_MS };
  }
  if (rec.status === "past_due") return { active: true, until: Number(rec.pastDueSince) + GRACE_DAYS * DAY_MS };
  return { active: false, until: Number(rec.eventAt) || null };
}

// subscriptions/{uid} as the account reads it.
function accountDoc(rec) {
  const e = entitlement(rec);
  return {
    provider: "paddle",
    subscriptionId: rec.id,
    status: rec.refundedAt ? "refunded" : rec.status,
    plan: rec.plan,
    active: e.active,
    until: e.until,
    renewsAt: rec.renewsAt,
    cancelAt: rec.cancelAt,
    pastDueSince: rec.pastDueSince,
  };
}

function isPaid(doc, now) {
  return !!doc && doc.active === true && (doc.until == null || Number(doc.until) > now);
}

// What an account shows when it has more than one subscription — an old one
// cancelled, a second bought by mistake, one refunded: the paid one that runs
// longest; with none paid, the one heard from last. Never the latest
// notification on its own, or a refund of one would lock the account while
// another is still paid for.
function bestAccountDoc(records, now) {
  const known = (records || []).filter((r) => r && (r.status || r.refundedAt));
  if (!known.length) return null;
  const paid = known.filter((r) => isPaid(accountDoc(r), now));
  const pick = paid.length
    ? paid.sort((a, b) => Number(accountDoc(b).until) - Number(accountDoc(a).until))[0]
    : known.sort((a, b) => (Number(b.eventAt) || 0) - (Number(a.eventAt) || 0))[0];
  return accountDoc(pick);
}

// A refund or a chargeback Paddle has approved: the account locks at once,
// and the subscription is cancelled so it does not renew. A partial refund (a
// goodwill amount back) leaves it as it is.
function locksAccount(adjustment) {
  if (!adjustment || adjustment.status !== "approved" || typeof adjustment.subscription_id !== "string") return false;
  if (adjustment.action === "chargeback") return true;
  return adjustment.action === "refund" && adjustment.type !== "partial";
}

module.exports = {
  DAY_MS, GRACE_DAYS, PERIOD_SLACK_MS, SIGNATURE_TOLERANCE_S,
  PLANS, PRICE_IDS, priceFor,
  parseSignature, verifySignature, isUid, planOf, nextSubRecord, entitlement, accountDoc, isPaid, bestAccountDoc, locksAccount,
};

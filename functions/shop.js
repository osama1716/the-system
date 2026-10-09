// The two currencies and the shop.
//
// Gold is earned and only earned: ten for every EXP the journal pays, and
// lump sums for a streak reaching 7, 30 and 100 days and for each new rank.
// Aurenite is bought and only bought — nothing in the app ever hands it out —
// so until payments exist the things priced in it are shown and cannot be
// had.
//
// Everything here is decided on the server: wallets/{uid} is written only by
// the journal trigger, the streak and buyItem, and the device reads it. A
// balance the device could write is a number anybody can retype.
//
// Pure functions only, so they can be tested without Firebase.
"use strict";

const GOLD_PER_EXP = 10;
const STREAK_GOLD = { 7: 2500, 30: 10000, 100: 40000 };
const RANK_UP_GOLD = 30000;

// The theme every account has, and the ones sold for gold. MUST match the
// dark themes in js/constants.js (tests/test-shop.js holds them together).
const FREE_THEME = "Black & dark gold";
const THEME_PRICES = {
  "Black & pale gold": 10000,
  "Black & blond": 10000,
  "Black & light brown": 10000,
};

const FREEZE_PRICE = 5000;
const FREEZE_MAX = 2;

// Priced in Aurenite. Not for sale until payments exist.
const FRAME_PRICES = { hud: 450, angel: 450, crystal: 450 };
// Profile backgrounds, the other half of a pack. Same rules as frames.
const BACKGROUND_PRICES = { angel: 450, crystal: 450, hud: 450 };
const AURENITE_ON_SALE = false;

function blankWallet(rankIdx) {
  return { gold: 0, aurenite: 0, themes: [], frames: [], backgrounds: [], freezes: 0, rankRewarded: Math.max(0, rankIdx | 0) };
}

function cleanWallet(w, rankIdx) {
  const b = blankWallet(rankIdx);
  if (!w) return b;
  return {
    gold: Math.round(Number(w.gold) || 0),
    aurenite: Math.max(0, Math.round(Number(w.aurenite) || 0)),
    themes: Array.isArray(w.themes) ? w.themes.filter((n) => typeof n === "string") : [],
    frames: Array.isArray(w.frames) ? w.frames.filter((n) => typeof n === "string") : [],
    backgrounds: Array.isArray(w.backgrounds) ? w.backgrounds.filter((n) => typeof n === "string") : [],
    freezes: Math.max(0, Math.min(FREEZE_MAX, Number(w.freezes) || 0)),
    rankRewarded: Number.isFinite(Number(w.rankRewarded)) ? Number(w.rankRewarded) : b.rankRewarded,
  };
}

// One journal movement. Gold follows EXP both ways — an undone task takes
// its gold back, and the balance may go below zero, because otherwise doing,
// spending, undoing and doing again would mint gold. A rank pays once, the
// first time it is reached; falling back and climbing again pays nothing.
function onExp(wallet, delta, rankIdxAfter) {
  const w = { ...wallet };
  const d = Math.round(Number(delta) || 0);
  w.gold += d * GOLD_PER_EXP;
  let rankGold = 0;
  if (rankIdxAfter > w.rankRewarded) {
    rankGold = (rankIdxAfter - w.rankRewarded) * RANK_UP_GOLD;
    w.gold += rankGold;
    w.rankRewarded = rankIdxAfter;
  }
  return { wallet: w, rankGold };
}

// A streak that has just moved to `current` days. Paid on the day the
// milestone is reached, each time a streak reaches it.
function streakGold(prevCurrent, current) {
  if (current === prevCurrent) return 0;
  return STREAK_GOLD[current] || 0;
}

// What buying `item` does to `wallet`, or why it cannot.
//   { kind: "theme", id: <theme name> } | { kind: "freeze" } | { kind: "frame", id } | { kind: "background", id }
function buy(wallet, item) {
  const w = { ...wallet, themes: wallet.themes.slice(), frames: wallet.frames.slice(), backgrounds: (wallet.backgrounds || []).slice() };
  const kind = item && item.kind;
  if (kind === "theme") {
    const price = THEME_PRICES[item.id];
    if (!price) return { ok: false, error: "unknown" };
    if (item.id === FREE_THEME || w.themes.indexOf(item.id) >= 0) return { ok: false, error: "owned" };
    if (w.gold < price) return { ok: false, error: "gold" };
    w.gold -= price;
    w.themes.push(item.id);
    return { ok: true, wallet: w };
  }
  if (kind === "freeze") {
    if (w.freezes >= FREEZE_MAX) return { ok: false, error: "full" };
    if (w.gold < FREEZE_PRICE) return { ok: false, error: "gold" };
    w.gold -= FREEZE_PRICE;
    w.freezes += 1;
    return { ok: true, wallet: w };
  }
  if (kind === "frame") {
    const price = FRAME_PRICES[item.id];
    if (!price) return { ok: false, error: "unknown" };
    if (!AURENITE_ON_SALE) return { ok: false, error: "soon" };
    if (w.frames.indexOf(item.id) >= 0) return { ok: false, error: "owned" };
    if (w.aurenite < price) return { ok: false, error: "aurenite" };
    w.aurenite -= price;
    w.frames.push(item.id);
    return { ok: true, wallet: w };
  }
  if (kind === "background") {
    const price = BACKGROUND_PRICES[item.id];
    if (!price) return { ok: false, error: "unknown" };
    if (!AURENITE_ON_SALE) return { ok: false, error: "soon" };
    if (w.backgrounds.indexOf(item.id) >= 0) return { ok: false, error: "owned" };
    if (w.aurenite < price) return { ok: false, error: "aurenite" };
    w.aurenite -= price;
    w.backgrounds.push(item.id);
    return { ok: true, wallet: w };
  }
  return { ok: false, error: "unknown" };
}

// Putting on (or, with no id, taking off) a frame or a background shown on
// the public profile. Only what the wallet holds — or, for an admin trying
// the look before anything is sold, anything in the catalogue.
function wear(wallet, kind, id, isAdmin) {
  const list = kind === "frame" ? FRAME_PRICES : kind === "background" ? BACKGROUND_PRICES : null;
  if (!list) return { ok: false, error: "unknown" };
  if (id === null || id === undefined || id === "") return { ok: true, id: null };
  if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(list, id)) return { ok: false, error: "unknown" };
  const owned = (kind === "frame" ? wallet.frames : wallet.backgrounds) || [];
  if (!isAdmin && owned.indexOf(id) < 0) return { ok: false, error: "notOwned" };
  return { ok: true, id };
}

module.exports = {
  GOLD_PER_EXP, STREAK_GOLD, RANK_UP_GOLD, FREE_THEME, THEME_PRICES, FREEZE_PRICE, FREEZE_MAX,
  FRAME_PRICES, BACKGROUND_PRICES, AURENITE_ON_SALE,
  blankWallet, cleanWallet, onExp, streakGold, buy, wear,
};

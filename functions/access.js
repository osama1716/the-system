// Who may use what — the server's half of SYS.PAYWALL in js/constants.js
// (decided 2026-10-16; tests/test-access-server.js holds the two together).
//
// Signed in without a subscription, an account keeps the planner, the shop,
// friends, mail and the ranking. What costs money to run — the AI pricing of
// quests and habits, the weekly suggestions, the reflection review — and the
// EXP those priced tasks pay are for a subscription, or for a new account's
// first `trialDays`. The app hides those pages; this is what holds when
// somebody goes round the app. `on` stays false until payments exist, and
// while it is false nothing is read and nothing is refused.
//
// Pure, so it can be tested without Firebase.
"use strict";

const PAYWALL = { on: false, trialDays: 7, free: ["planner", "shop", "friends", "mail", "leaderboard"] };
const DAY_MS = 86400000;

// now and createdAt in ms; subscription is subscriptions/{uid} (written by
// the payments webhook only): { active: true, until: <ms or absent> }.
function entitled({ now, createdAt, isAdmin, subscription }) {
  if (!PAYWALL.on || isAdmin) return true;
  if (subscription && subscription.active === true && (subscription.until == null || Number(subscription.until) > now)) return true;
  return Number.isFinite(createdAt) && now < createdAt + PAYWALL.trialDays * DAY_MS;
}

module.exports = { PAYWALL, DAY_MS, entitled };

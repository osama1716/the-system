// The server's half of who may use what (functions/access.js):
//   node tests/test-access-server.js
//
// The same rule as the app's SYS.PAYWALL, refused on the server for whoever
// goes round the app: the AI that prices quests and habits, the weekly
// suggestions, the reflection review and the EXP priced tasks pay. Profile
// moderation stays free with the profiles it guards.
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const REPO = path.resolve(__dirname, "..");
const ACCESS = require(path.join(REPO, "functions", "access.js"));
const SYS = {};
const sb = { SYS, window: {}, console, Math, JSON, Object, Array, Number, String, Boolean, RegExp, Date, Set, Map, Intl };
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(REPO, "js", "constants.js"), "utf8").replace(/\}\)\(window\.SYS[^)]*\);?\s*$/, "})(SYS);"), sb, { filename: "constants.js" });

let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };

console.log("the app and the server hold the same rule");
check("same switch, trial and free pages", JSON.stringify(SYS.PAYWALL) === JSON.stringify(ACCESS.PAYWALL), JSON.stringify(SYS.PAYWALL) + " vs " + JSON.stringify(ACCESS.PAYWALL));
check("off until payments exist", ACCESS.PAYWALL.on === false);

console.log("");
console.log("who is let through, with the switch on");
{
  const was = ACCESS.PAYWALL.on;
  ACCESS.PAYWALL.on = true;
  const now = Date.UTC(2026, 9, 16), day = ACCESS.DAY_MS;
  const ok = (o) => ACCESS.entitled({ now, createdAt: now - 30 * day, isAdmin: false, subscription: null, ...o });
  check("an old account with nothing: refused", !ok({}));
  check("in its trial: let through", ok({ createdAt: now - 2 * day }));
  check("the trial's last moment, and just after", ok({ createdAt: now - 7 * day + 1000 }) && !ok({ createdAt: now - 7 * day }));
  check("an unknown creation time: refused", !ok({ createdAt: NaN }));
  check("the admin: let through", ok({ isAdmin: true }));
  check("an active subscription: let through", ok({ subscription: { active: true } }) && ok({ subscription: { active: true, until: now + day } }));
  check("an ended or inactive one: refused", !ok({ subscription: { active: true, until: now - 1 } }) && !ok({ subscription: { active: false } }) && !ok({ subscription: { active: "yes" } }));
  ACCESS.PAYWALL.on = was;
  check("with the switch off, everyone", ACCESS.entitled({ now, createdAt: NaN, isAdmin: false, subscription: null }));
}

console.log("");
console.log("wired into the paid functions, and only those");
{
  const index = require("./functions-files").source();
  const head = (name) => {
    const at = index.indexOf("exports." + name + " = ");
    return at < 0 ? "" : index.slice(at, at + 700);
  };
  for (const name of ["evaluateTask", "priceLibraryHabit", "suggestQuests", "submitReflection", "recordProgress"]) {
    check(name + " refuses without a subscription", /await requireEntitled\(request\);/.test(head(name)));
  }
  // updateProfile is free except for a new bio (tests/test-profile-cost.js plays it).
  for (const name of ["claimUsername", "buyItem", "wearItem", "sendFriendRequest", "mirrorPlannerReminders"]) {
    const h = head(name);
    check(name + " stays free", h && !/requireEntitled/.test(h));
  }
  check("the check reads the subscription the webhook writes", /collection\("subscriptions"\)\.doc\(uid\)/.test(index));
  check("and does nothing while the switch is off", /if \(!ACCESS\.PAYWALL\.on\) return;/.test(index));
}

console.log("");
console.log(fails ? fails + " FAILED" : "all passed");
if (fails) process.exitCode = 1;

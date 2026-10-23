// App: opening the plans window, choosing a plan, and buying it — the checkout itself comes
// with the payments (Paddle), so until then buying says payments open soon.
// One of the files main.js was split into; the names they share travel through SYS._main.
(function (SYS) {
  "use strict";
  const M = SYS._main || (SYS._main = {});
  const { ACTIONS, ui } = M;

  // Whether this account is someone the plans are for: signed in, the paywall
  // on, not paying already, not an admin.
  function plansFor() {
    return SYS.PAYWALL.on && !!ui.cloudUser && !ui.subscribed && !ui.isAdmin;
  }

  function openPlans(from) {
    ui.plans = { pick: "annual", from: from || null };
    ui.modal = "plans";
    M.renderModalInto();
  }

  // Right after the starting picture's "your rank in 90 days": the moment
  // the app is worth the most to someone, so the plans come next.
  function offerPlans(from) {
    if (plansFor()) openPlans(from);
  }

  ACTIONS["open-plans"] = function () { openPlans(null); };

  ACTIONS["plans-pick"] = function ({ el }) {
    if (!ui.plans) ui.plans = {};
    ui.plans.pick = el.dataset.plan === "monthly" ? "monthly" : "annual";
    M.renderModalInto();
  };

  ACTIONS["plans-buy"] = function ({ el }) {
    const plan = el.dataset.plan === "monthly" ? "monthly" : "annual";
    if (SYS.Payments && SYS.Payments.ready) { SYS.Payments.checkout(plan); return; }
    M.addToast({ kind: "info", text: SYS.t("plans.soon") });
  };

  Object.assign(M, { openPlans, offerPlans, plansFor });
})(window.SYS = window.SYS || {});

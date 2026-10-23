// UI: the plans window (choosing yearly or monthly) and the banner of a trial's last days.
// One of the files ui.js was split into; the names they share travel through SYS._ui.
(function (SYS) {
  "use strict";
  const U = SYS._ui || (SYS._ui = {});
  const { icon, t } = U;

  // A sum keeps its sign and digits in order inside an Arabic sentence.
  const usd = (n) => "⁦$" + n.toFixed(2) + "⁩";

  // The plans. The yearly one is chosen when the window opens; the price of a
  // month on it is the number that sells it, so it is the large one.
  function renderPlansModal(state, ui) {
    const pick = (ui.plans && ui.plans.pick) || "annual";
    const fromTrial = ui.plans && ui.plans.from === "assess";
    const card = (plan) => {
      const on = pick === plan;
      const p = SYS.PLANS[plan];
      const big = plan === "annual" ? t("plans.perMonth", { price: usd(SYS.planPerMonth("annual")) }) : t("plans.perMonth", { price: usd(p.price) });
      const small = plan === "annual" ? t("plans.billedYearly", { price: usd(p.price) }) : t("plans.billedMonthly");
      return `
        <button type="button" class="plan-card ${on ? "on" : ""}" data-action="plans-pick" data-plan="${plan}" aria-pressed="${on}">
          <span class="plan-top"><span class="plan-name">${t(plan === "annual" ? "plans.annual" : "plans.monthly")}</span>
            ${plan === "annual" ? `<span class="plan-badge">${t("plans.save", { n: SYS.planSaving() })}</span>` : ""}</span>
          <span class="plan-price">${big}</span>
          <span class="plan-billed">${small}</span>
        </button>`;
    };
    const feature = (key, ic) => `<li><span class="plan-tick">${icon(ic, 14)}</span>${t(key)}</li>`;
    return `
      <div class="modal-backdrop" data-action="close-modal-backdrop">
        <div class="sys-panel modal-box plans-box" data-stop-close="1" role="dialog" aria-label="${t("plans.title")}">
          <button class="wk-arrow modal-x" data-action="close-modal" aria-label="${t("event.close")}">${icon("x", 15)}</button>
          <div class="modal-title">${t("plans.title")}</div>
          <div class="plan-cards" role="group" aria-label="${t("plans.title")}">${card("annual")}${card("monthly")}</div>
          <ul class="plan-features">
            ${feature("plans.f.ai", "check")}
            ${feature("plans.f.pages", "check")}
            ${feature("plans.f.ability", "check")}
            ${feature("plans.f.daily", "check")}
          </ul>
          <button class="btn btn-primary plan-buy" data-action="plans-buy" data-plan="${pick}">${t("plans.buy")}</button>
          ${fromTrial ? `<button class="btn btn-outline plan-later" data-action="close-modal">${t("plans.later")}</button>` : ""}
          <p class="plan-fine">${t("plans.cancel")}</p>
        </div>
      </div>`;
  }
  SYS.renderPlansModal = renderPlansModal;

  // The last two days of a trial, above every page: how long is left, and the plans.
  function renderTrialBanner(ui) {
    const left = SYS.trialDaysLeft(ui);
    if (!left || left > 2) return "";
    return `
      <div class="sys-panel trial-banner">
        <span class="trial-banner-text">${t(left === 1 ? "trial.ends1" : "trial.ends2")}</span>
        <button class="btn btn-primary" data-action="open-plans">${t("plans.see")}</button>
      </div>`;
  }
  SYS.renderTrialBanner = renderTrialBanner;
})(window.SYS = window.SYS || {});

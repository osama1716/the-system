// Guided tours: the part of help that points at the real thing.
//
// A topic in the help sheet can be read, and some of them can be *walked*.
// A walk dims the page, cuts a hole over one real control, and puts a bubble
// beside it with an arrow — then steps to the next control. It is the only
// way to explain "press this, then choose that" without asking someone to
// hold a paragraph in their head while they look for a button.
//
// A tour is data: see SYS.TOURS at the bottom. Each step names
//   sel   the element to spotlight, as a selector
//   k     the i18n suffix, read as tour.<tour>.<k>
//   act   optional: a selector to click BEFORE the step, so the target can
//         exist at all (the form has to be open before its fields are there)
//   place optional: "top" or "bottom" to force which side the bubble sits on
//
// Three things make this harder than it looks, and each is handled below:
//
//  1. The application re-renders a whole page into the DOM on every action,
//     so the element found for step N is a different object by step N+1.
//     Nothing is held across steps; every step re-queries.
//  2. An `act` click triggers that re-render, and the element the next step
//     wants does not exist until it finishes. Steps wait for their target
//     rather than assuming it is there.
//  3. A step whose target never arrives must not strand the walk. It is
//     skipped, and the walk carries on.
(function (SYS) {
  "use strict";

  const t = (k, v) => (SYS.t ? SYS.t(k, v) : k);

  let root = null;      // the overlay, while a tour is running
  let steps = null;     // the tour being walked
  let name = "";        // which tour, for the i18n prefix
  let at = 0;           // which step
  let target = null;    // the element this step is pointing at
  let onMove = null;    // the scroll/resize listener, while a step is showing

  const PAD = 6;        // how far the ring stands off the control
  const GAP = 14;       // between the ring and the bubble

  function build() {
    root = document.createElement("div");
    root.className = "tour-root";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-live", "polite");
    root.innerHTML =
      '<div class="tour-spot"></div>' +
      // The arrow is a sibling of the bubble, not a child: the bubble is
      // clipped to its own cut-corner shape, and a clip-path clips
      // descendants too, so an arrow poking out of its edge was cut away.
      '<div class="tour-arrow"></div>' +
      '<div class="tour-bubble">' +
        '<div class="tour-count"></div>' +
        '<p class="tour-text"></p>' +
        '<div class="tour-row">' +
          '<button class="btn btn-ghost tour-skip" type="button"></button>' +
          '<span class="tour-spacer"></span>' +
          '<button class="btn btn-outline tour-back" type="button"></button>' +
          '<button class="btn btn-primary tour-next" type="button"></button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);
    root.querySelector(".tour-skip").addEventListener("click", stop);
    root.querySelector(".tour-back").addEventListener("click", () => go(at - 1));
    root.querySelector(".tour-next").addEventListener("click", () => go(at + 1));
    // The overlay takes every click, so nothing underneath can move while a
    // step is pointing at it. The walk advances by its own buttons only.
    root.addEventListener("click", (e) => { if (e.target === root) stop(); });
    document.addEventListener("keydown", onKey, true);
  }

  function onKey(e) {
    if (!root) return;
    if (e.key === "Escape") { e.preventDefault(); stop(); }
    else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); go(at + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(at - 1); }
  }

  // Wait for a selector to appear, because the click that makes it appear
  // also re-renders the page it appears on.
  function find(sel, tries) {
    return new Promise((res) => {
      let n = tries == null ? 12 : tries;
      const tick = () => {
        const el = document.querySelector(sel);
        if (el && el.getClientRects().length) return res(el);
        if (--n <= 0) return res(null);
        setTimeout(tick, 60);
      };
      tick();
    });
  }

  function place() {
    if (!root || !target) return;
    const r = target.getBoundingClientRect();
    const spot = root.querySelector(".tour-spot");
    spot.style.left = (r.left - PAD) + "px";
    spot.style.top = (r.top - PAD) + "px";
    spot.style.width = (r.width + PAD * 2) + "px";
    spot.style.height = (r.height + PAD * 2) + "px";

    const bub = root.querySelector(".tour-bubble");
    const arrow = root.querySelector(".tour-arrow");
    const bh = bub.offsetHeight, bw = bub.offsetWidth;
    const forced = steps[at] && steps[at].place;
    // Below the control if there is room for the bubble there, above if not.
    const roomBelow = window.innerHeight - r.bottom - PAD - GAP;
    const below = forced === "bottom" || (forced !== "top" && roomBelow >= bh + 12);

    let top = below ? r.bottom + PAD + GAP : r.top - PAD - GAP - bh;
    top = Math.max(10, Math.min(top, window.innerHeight - bh - 10));

    const side = 14;
    let left = r.left + r.width / 2 - bw / 2;
    left = Math.max(side, Math.min(left, window.innerWidth - bw - side));

    bub.style.top = top + "px";
    bub.style.left = left + "px";
    bub.classList.toggle("tour-below", below);

    // The arrow points back at the middle of the control, clamped so it stays
    // on the bubble's own edge rather than floating off its corner. It is
    // positioned in the viewport, since it is no longer inside the bubble.
    const ax = Math.max(18, Math.min(r.left + r.width / 2 - left, bw - 18));
    arrow.style.left = (left + ax - 7) + "px";
    arrow.style.top = (below ? top - 7 : top + bh - 7) + "px";
  }

  async function go(i) {
    if (!root) return;
    if (i < 0) return;
    if (i >= steps.length) return stop();

    at = i;
    const step = steps[at];
    root.classList.add("tour-waiting");

    if (step.act) {
      const opener = document.querySelector(step.act);
      if (opener) { opener.click(); await new Promise((r) => setTimeout(r, 120)); }
    }

    target = await find(step.sel);
    if (!target) {
      // Nothing to point at — this build of the page does not have it.
      // Carry on rather than stranding the walk.
      return go(at + (i >= at ? 1 : -1));
    }

    target.scrollIntoView({ block: "center", inline: "nearest" });
    await new Promise((r) => setTimeout(r, 90));

    const last = at === steps.length - 1;
    root.querySelector(".tour-count").textContent = t("tour.step", { n: at + 1, total: steps.length });
    root.querySelector(".tour-text").textContent = t("tour." + name + "." + step.k);
    root.querySelector(".tour-skip").textContent = t("tour.skip");
    const back = root.querySelector(".tour-back");
    back.textContent = t("tour.back");
    back.hidden = at === 0;
    root.querySelector(".tour-next").textContent = last ? t("tour.done") : t("tour.next");

    root.classList.remove("tour-waiting");
    place();

    if (!onMove) {
      onMove = () => place();
      window.addEventListener("resize", onMove);
      window.addEventListener("scroll", onMove, true);
    }
  }

  function stop() {
    if (!root) return;
    // Put the page back the way the walk found it.
    const tour = SYS.TOURS && SYS.TOURS[name];
    if (tour && tour.cleanup) {
      const c = document.querySelector(tour.cleanup);
      if (c) c.click();
    }
    if (onMove) {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      onMove = null;
    }
    document.removeEventListener("keydown", onKey, true);
    root.remove();
    root = null; steps = null; target = null; name = ""; at = 0;
  }

  SYS.hasTour = function (topic) {
    return !!(SYS.TOURS && SYS.TOURS[topic] && SYS.TOURS[topic].steps.length);
  };

  SYS.startTour = function (topic) {
    if (root) stop();
    if (!SYS.hasTour(topic)) return false;
    name = topic;
    steps = SYS.TOURS[topic].steps;
    build();
    go(0);
    return true;
  };

  SYS.stopTour = stop;

  // ---------------------------------------------------------------- tours --
  //
  // Selectors are the application's own data-action and data-bind hooks
  // wherever possible: those are what the click handlers key off, so they are
  // the least likely thing in the markup to be renamed under us.
  SYS.TOURS = {
    quests: {
      // The walk opens the form; if it ends while the form is open, close it.
      cleanup: '[data-action="cancel-quest-form"]',
      steps: [
        { sel: ".page-header", k: "page", place: "bottom" },
        { sel: '[data-action="set-quest-filter"]', k: "filter" },
        { sel: '.btn[data-action="open-quest-form"]', k: "new" },
        { sel: '[data-bind="taskForm.title"]', k: "title", act: '.btn[data-action="open-quest-form"]' },
        { sel: '[data-bind="taskForm.taskType"]', k: "term" },
        { sel: '[data-bind="taskForm.priority"]', k: "priority" },
        { sel: '[data-action="submit-quest-form"]', k: "save" },
        { sel: ".check-btn", k: "complete", act: '[data-action="cancel-quest-form"]' },
        { sel: ".task-reward", k: "reward" },
      ],
    },
  };
})(window.SYS = window.SYS || {});

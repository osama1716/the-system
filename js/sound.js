// Tiny synthesized sound effects — Web Audio API oscillators only, no audio
// files. Everything here is original (a few sine/triangle tones with a short
// envelope), so there's no licensing question at all.
(function (SYS) {
  "use strict";

  let ctx = null;
  let enabled = true;

  function getCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // One note: oscillator + a quick linear attack / exponential decay envelope.
  function tone(c, t0, freq, duration, { type = "sine", gain = 0.16 } = {}) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
  }

  const RECIPES = {
    // Quest completed: a quick two-note "ding-ding" rising.
    quest: (c, now) => {
      tone(c, now, 659.25, 0.11, { type: "triangle", gain: 0.15 });
      tone(c, now + 0.09, 880, 0.16, { type: "triangle", gain: 0.17 });
    },
    // Level up: a three-note major arpeggio.
    levelup: (c, now) => {
      tone(c, now, 523.25, 0.13, { type: "triangle", gain: 0.14 });
      tone(c, now + 0.1, 659.25, 0.13, { type: "triangle", gain: 0.15 });
      tone(c, now + 0.2, 783.99, 0.24, { type: "triangle", gain: 0.17 });
    },
    // Rank up: a soft sustained pad underneath a longer ascending arpeggio.
    rankup: (c, now) => {
      tone(c, now, 392, 0.55, { type: "sine", gain: 0.08 });
      tone(c, now, 523.25, 0.55, { type: "sine", gain: 0.06 });
      tone(c, now + 0.05, 523.25, 0.18, { type: "triangle", gain: 0.13 });
      tone(c, now + 0.22, 659.25, 0.18, { type: "triangle", gain: 0.14 });
      tone(c, now + 0.39, 783.99, 0.18, { type: "triangle", gain: 0.15 });
      tone(c, now + 0.56, 1046.5, 0.4, { type: "triangle", gain: 0.18 });
    },
    // Skill point invested: a very short high tick.
    skillpoint: (c, now) => tone(c, now, 987.77, 0.07, { type: "sine", gain: 0.11 }),
    // Progress reverted: soft two-note descent, informative not punishing.
    delevel: (c, now) => {
      tone(c, now, 659.25, 0.1, { type: "sine", gain: 0.09 });
      tone(c, now + 0.08, 523.25, 0.14, { type: "sine", gain: 0.09 });
    },
    // Rank down: a quieter three-note descent, deliberately muted next to rankup.
    rankdown: (c, now) => {
      tone(c, now, 523.25, 0.14, { type: "sine", gain: 0.1 });
      tone(c, now + 0.1, 415.3, 0.14, { type: "sine", gain: 0.1 });
      tone(c, now + 0.2, 329.63, 0.22, { type: "sine", gain: 0.1 });
    },
  };

  SYS.Sound = {
    setEnabled(v) { enabled = !!v; },
    play(kind) {
      if (!enabled) return;
      const recipe = RECIPES[kind];
      if (!recipe) return;
      try {
        const c = getCtx();
        if (!c) return;
        recipe(c, c.currentTime);
      } catch (e) {
        // Audio unavailable for some reason — never let sound break gameplay.
      }
    },
  };
})(window.SYS = window.SYS || {});

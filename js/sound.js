// Synthesized sound effects — Web Audio API oscillators only, no audio files.
// Everything here is original (a fundamental + a couple of quiet harmonics,
// shaped like a soft bell instead of a flat beep), so there's no licensing
// question at all.
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

  // A single bell-like note: a sine fundamental plus two quiet harmonics,
  // each with its own quick attack / exponential decay. Layering harmonics
  // (instead of one flat oscillator) is what makes it read as a soft "ding"
  // rather than a synthesizer beep.
  function bell(c, t0, freq, duration, gain) {
    gain = gain == null ? 0.15 : gain;
    const harmonics = [[1, 1], [2.01, 0.32], [3.0, 0.14]];
    harmonics.forEach(([mult, rel]) => {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq * mult, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(gain * rel, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(g).connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.05);
    });
  }

  // Warm pentatonic-ish scale (no dissonant intervals) used across every cue,
  // so the whole set feels like one consistent instrument.
  const C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5;

  const RECIPES = {
    quest: (c, now) => bell(c, now, E5, 0.45, 0.16),
    levelup: (c, now) => {
      bell(c, now, C5, 0.22, 0.13);
      bell(c, now + 0.12, E5, 0.22, 0.14);
      bell(c, now + 0.24, G5, 0.5, 0.17);
    },
    rankup: (c, now) => {
      bell(c, now, C5, 0.7, 0.08);
      bell(c, now + 0.06, C5, 0.22, 0.12);
      bell(c, now + 0.22, E5, 0.22, 0.13);
      bell(c, now + 0.38, G5, 0.22, 0.14);
      bell(c, now + 0.54, C6, 0.75, 0.18);
    },
    skillpoint: (c, now) => bell(c, now, A5, 0.16, 0.1),
    delevel: (c, now) => {
      bell(c, now, D5, 0.18, 0.09);
      bell(c, now + 0.09, C5, 0.24, 0.09);
    },
    rankdown: (c, now) => {
      bell(c, now, G5, 0.2, 0.09);
      bell(c, now + 0.12, E5, 0.2, 0.09);
      bell(c, now + 0.24, C5, 0.35, 0.09);
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

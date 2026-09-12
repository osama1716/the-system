// Timer sounds, generated rather than shipped.
//
// Every sound here is synthesised by the Web Audio API at the moment it
// plays. No files: nothing to download, nothing to cache, nothing to license,
// and it works with the tab offline on the first run. A tick is a filtered
// click; rain, ocean, storm and fire are all shaped noise; the end chimes are
// a few oscillators with an envelope.
//
// What that rules out is anything that is a recording rather than a texture —
// birdsong, a cafe, a piece of music. Those need audio files from a source
// whose licence allows it, and inventing them is not an option.
(function (SYS) {
  "use strict";

  // Browsers refuse to start audio until the person has interacted with the
  // page, so the context is created on the first press rather than on load,
  // and every entry point tolerates not having one.
  let ctx = null;
  let master = null;
  let focusNodes = null;       // what a looping focus sound is currently using
  let focusName = "silent";
  let noiseBuffer = null;

  const FOCUS_SOUNDS = ["silent", "tick", "rain", "ocean", "water", "storm", "fire", "hum"];
  const END_SOUNDS = ["silent", "default", "ding", "chord", "drum", "universe", "rhythm"];
  SYS.FOCUS_SOUNDS = FOCUS_SOUNDS;
  SYS.END_SOUNDS = END_SOUNDS;

  function context() {
    if (ctx) return ctx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  // Called from the press that starts a timer. Safari in particular suspends
  // the context until a gesture resumes it, and a suspended context plays
  // silence without reporting anything.
  function unlock() {
    const c = context();
    if (c && c.state === "suspended" && c.resume) { try { c.resume(); } catch (e) {} }
    return !!c;
  }

  // Two seconds of white noise, built once and looped. Generating noise per
  // sample at playback time is the one thing here that would actually cost
  // something on a phone.
  function noise() {
    const c = context();
    if (!c) return null;
    if (!noiseBuffer) {
      const len = c.sampleRate * 2;
      noiseBuffer = c.createBuffer(1, len, c.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    return src;
  }

  // A slow random wobble on whatever it is connected to: what turns flat
  // noise into waves, gusts or crackle.
  function wobble(param, low, high, seconds) {
    const c = context();
    if (!c) return null;
    const lfo = c.createOscillator();
    const depth = c.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 1 / Math.max(0.5, seconds);
    depth.gain.value = (high - low) / 2;
    param.value = (high + low) / 2;
    lfo.connect(depth);
    depth.connect(param);
    lfo.start();
    return lfo;
  }

  function stopFocus() {
    if (!focusNodes) return;
    const c = ctx;
    try {
      // Faded rather than cut: stopping a noise source outright is an audible
      // click, which is a poor reward for pressing pause.
      if (c && focusNodes.gain) {
        focusNodes.gain.gain.cancelScheduledValues(c.currentTime);
        focusNodes.gain.gain.setTargetAtTime(0, c.currentTime, 0.08);
      }
      const nodes = focusNodes;
      setTimeout(() => {
        (nodes.stoppable || []).forEach((n) => { try { n.stop(); } catch (e) {} });
        if (nodes.ticker) clearInterval(nodes.ticker);
      }, 350);
    } catch (e) { /* nothing worth reporting: this is a sound stopping */ }
    focusNodes = null;
    focusName = "silent";
  }
  SYS.stopFocusSound = stopFocus;

  // One short click. Used by the tick loop and by the rain droplets.
  function click(at, freq, gainValue, length) {
    const c = context();
    if (!c) return;
    const src = noise();
    if (!src) return;
    const band = c.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = freq;
    band.Q.value = 6;
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gainValue, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + length);
    src.connect(band); band.connect(g); g.connect(master);
    src.start(at);
    src.stop(at + length + 0.05);
  }

  function startFocus(name) {
    stopFocus();
    const wanted = FOCUS_SOUNDS.indexOf(name) >= 0 ? name : "silent";
    if (wanted === "silent") return;
    const c = context();
    if (!c) return;

    const gain = c.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    const stoppable = [];
    let ticker = null;

    if (wanted === "tick") {
      // A clock tick is a click once a second, not a tone. Driven by an
      // interval because it has to keep time with the seconds themselves.
      const beat = () => click(c.currentTime + 0.01, 1800, 0.5, 0.04);
      beat();
      ticker = setInterval(beat, 1000);
      gain.gain.value = 1;
    } else {
      const src = noise();
      if (!src) return;
      stoppable.push(src);
      const filter = c.createBiquadFilter();

      if (wanted === "rain") {
        filter.type = "highpass";
        filter.frequency.value = 1200;
        gain.gain.setTargetAtTime(0.22, c.currentTime, 0.4);
        // Droplets over the hiss, at uneven intervals so it does not pulse.
        ticker = setInterval(() => {
          if (Math.random() < 0.7) click(c.currentTime + Math.random() * 0.2, 2200 + Math.random() * 2500, 0.18, 0.03);
        }, 180);
      } else if (wanted === "ocean") {
        filter.type = "lowpass";
        // Long swells: the wobble is the wave.
        stoppable.push(wobble(filter.frequency, 300, 900, 9));
        stoppable.push(wobble(gain.gain, 0.08, 0.34, 9));
      } else if (wanted === "water") {
        filter.type = "bandpass";
        filter.frequency.value = 700;
        filter.Q.value = 0.8;
        stoppable.push(wobble(gain.gain, 0.12, 0.26, 3));
      } else if (wanted === "storm") {
        filter.type = "lowpass";
        stoppable.push(wobble(filter.frequency, 200, 1400, 5));
        stoppable.push(wobble(gain.gain, 0.14, 0.4, 4));
      } else if (wanted === "fire") {
        filter.type = "lowpass";
        filter.frequency.value = 420;
        gain.gain.setTargetAtTime(0.16, c.currentTime, 0.4);
        // Crackle: short bright pops at random, which is most of what a fire
        // actually sounds like.
        ticker = setInterval(() => {
          const n = Math.random();
          if (n < 0.5) click(c.currentTime + Math.random() * 0.3, 1400 + Math.random() * 2600, 0.12 + Math.random() * 0.1, 0.02 + Math.random() * 0.03);
        }, 140);
      } else {
        // hum: flat, quiet, nothing moving. The least distracting option for
        // anyone who just wants the room to stop being silent.
        filter.type = "lowpass";
        filter.frequency.value = 550;
        gain.gain.setTargetAtTime(0.14, c.currentTime, 0.5);
      }

      src.connect(filter);
      filter.connect(gain);
      src.start();
    }

    focusNodes = { gain, stoppable: stoppable.filter(Boolean), ticker };
    focusName = wanted;
  }
  SYS.startFocusSound = startFocus;
  SYS.currentFocusSound = function () { return focusName; };

  function tone(at, freq, length, gainValue, type) {
    const c = context();
    if (!c) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gainValue, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(g); g.connect(master);
    osc.start(at);
    osc.stop(at + length + 0.05);
  }

  // The end-of-countdown sounds. Short, distinct from each other, and none of
  // them alarming — this marks the end of a session that went well.
  function playEnd(name) {
    const wanted = END_SOUNDS.indexOf(name) >= 0 ? name : "default";
    if (wanted === "silent") return;
    const c = context();
    if (!c) return;
    const t = c.currentTime + 0.02;
    if (wanted === "default") {
      tone(t, 880, 0.5, 0.35);
      tone(t + 0.14, 1320, 0.6, 0.3);
    } else if (wanted === "ding") {
      // A bell is a fundamental plus a slightly detuned partial above it.
      tone(t, 1046, 1.6, 0.35);
      tone(t, 2093, 1.2, 0.12);
      tone(t + 0.002, 1051, 1.5, 0.1);
    } else if (wanted === "chord") {
      [523, 659, 784].forEach((f, i) => tone(t + i * 0.06, f, 1.4, 0.22));
    } else if (wanted === "drum") {
      // Kick: a sine dropping in pitch. Snare: a noise burst.
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(50, t + 0.18);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      osc.connect(g); g.connect(master);
      osc.start(t); osc.stop(t + 0.3);
      click(t + 0.22, 1600, 0.4, 0.12);
      click(t + 0.38, 1600, 0.25, 0.1);
    } else if (wanted === "universe") {
      // A slow rise, two oscillators slightly apart so it shimmers.
      [0, 3].forEach((detune) => {
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(220 + detune, t);
        osc.frequency.exponentialRampToValueAtTime(880 + detune, t + 1.1);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.16, t + 0.4);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
        osc.connect(g); g.connect(master);
        osc.start(t); osc.stop(t + 1.7);
      });
    } else if (wanted === "rhythm") {
      [0, 0.16, 0.32].forEach((offset, i) => tone(t + offset, i === 2 ? 1318 : 988, 0.22, 0.3, "square"));
    }
  }
  SYS.playEndSound = playEnd;

  // For the picker: pressing a name should let you hear it, and the focus
  // textures need a second or two to be recognisable.
  SYS.previewSound = function (kind, name) {
    unlock();
    if (kind === "end") { playEnd(name); return; }
    startFocus(name);
    setTimeout(() => { if (focusName === name) stopFocus(); }, 2500);
  };

  SYS.unlockSound = unlock;
})(window.SYS = window.SYS || {});

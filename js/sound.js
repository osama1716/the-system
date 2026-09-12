// Timer sounds: recordings where a recording is the only honest answer, and
// synthesis for everything else.
//
// The textures — rain, fire, ocean, a creek, wind, a forest, a cafe — are CC0
// files under assets/sounds (see the CREDITS there for each source and
// licence). They are fetched the first time one is chosen rather than shipped
// with the app: most people will use one or two, and 2 MB of audio has no
// business in a first page load. The service worker caches whatever it serves,
// so a sound works offline from its second use onward.
//
// Everything else is still made here and needs no file: the tick, which has to
// land exactly on the second, and the end chimes, which are a few oscillators
// and an envelope. Synthesis is also the fallback — a file that has not
// arrived yet plays its generated version instead of silence, because silence
// looks like a bug.
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

  // Which textures have a recording, and where. Swap these paths for a
  // bundled copy and nothing else changes — the loader does not care whether
  // the file arrives from the network or from the cache.
  // MP3, not Ogg. Safari's Web Audio has no Vorbis decoder, so every one of
  // these failed to decode on an iPhone — the ones with a synthesised voice
  // quietly fell back to it and the two without played nothing at all. MP3
  // decodes everywhere.
  const FILE_SOUNDS = {
    rain: "assets/sounds/rain.mp3",
    fire: "assets/sounds/fire.mp3",
    ocean: "assets/sounds/ocean.mp3",
    water: "assets/sounds/water.mp3",
    storm: "assets/sounds/storm.mp3",
    forest: "assets/sounds/forest.mp3",
    cafe: "assets/sounds/cafe.mp3",
  };
  // Which textures can be approximated while their file downloads. Birdsong
  // and a room full of people cannot: a noise generator standing in for
  // either is worse than the short wait, and the picker says it is loading.
  const SYNTH_VOICES = { tick: 1, rain: 1, fire: 1, ocean: 1, water: 1, storm: 1, hum: 1 };

  const buffers = {};          // name -> decoded AudioBuffer, once fetched
  const failed = {};           // name -> true, so a dead file is not retried forever
  let loadingName = null;

  const FOCUS_SOUNDS = ["silent", "tick", "rain", "fire", "ocean", "water", "storm", "forest", "cafe", "hum"];
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

  // Someone may want to know that a sound is on its way — the picker shows it,
  // since a two-second silence after a press is indistinguishable from a bug.
  SYS.soundLoading = function () { return loadingName; };
  SYS.onSoundState = null;
  function announce() { if (typeof SYS.onSoundState === "function") { try { SYS.onSoundState(); } catch (e) {} } }

  // Fetch and decode once, then keep it. decodeAudioData is the only part
  // that needs the context, which is why this cannot run before a gesture.
  function loadBuffer(name) {
    const path = FILE_SOUNDS[name];
    const c = context();
    if (!path || !c || failed[name]) return Promise.resolve(null);
    if (buffers[name]) return Promise.resolve(buffers[name]);
    loadingName = name;
    announce();
    return fetch(path)
      .then((res) => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.arrayBuffer();
      })
      .then((raw) => new Promise((resolve, reject) => {
        // The callback form, because Safari's decodeAudioData does not return
        // a promise on older versions.
        const ok = (buf) => resolve(buf);
        const bad = (err) => reject(err || new Error("decode failed"));
        const maybe = c.decodeAudioData(raw, ok, bad);
        if (maybe && typeof maybe.then === "function") maybe.then(ok, bad);
      }))
      .then((buf) => {
        buffers[name] = buf;
        return buf;
      })
      .catch(() => {
        // Marked dead so every future press does not wait on the same
        // failure; the synthesised version covers for it.
        failed[name] = true;
        return null;
      })
      .then((buf) => {
        if (loadingName === name) { loadingName = null; announce(); }
        return buf;
      });
  }

  // A recording, looped. Faded in for the same reason the synthesised ones
  // are faded out: a noise source starting at full gain is a click.
  function playBuffer(name, buffer) {
    const c = context();
    if (!c || !buffer) return false;
    const src = c.createBufferSource();
    const gain = c.createGain();
    src.buffer = buffer;
    src.loop = true;
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.7, c.currentTime, 0.5);
    src.connect(gain);
    gain.connect(master);
    src.start();
    focusNodes = { gain, stoppable: [src], ticker: null };
    focusName = name;
    return true;
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

  // A droplet: noise through a sharp resonant filter, which rings briefly at
  // a pitch. What makes rain sound like water rather than static.
  function drip(at, freq, gainValue) {
    const c = context();
    if (!c) return;
    const src = noise();
    if (!src) return;
    const band = c.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.setValueAtTime(freq, at);
    band.frequency.exponentialRampToValueAtTime(Math.max(120, freq * 0.55), at + 0.09);
    band.Q.value = 14;
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gainValue, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
    src.connect(band); band.connect(g); g.connect(master);
    src.start(at);
    src.stop(at + 0.16);
  }

  // A crackle: very short, bright, unpitched. Deliberately not a drip — the
  // difference between the two is what tells rain and fire apart.
  function crackle(at, freq, gainValue) {
    const c = context();
    if (!c) return;
    const src = noise();
    if (!src) return;
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gainValue, at + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
    src.connect(hp); hp.connect(g); g.connect(master);
    src.start(at);
    src.stop(at + 0.06);
  }

  function startFocus(name) {
    stopFocus();
    const wanted = FOCUS_SOUNDS.indexOf(name) >= 0 ? name : "silent";
    if (wanted === "silent") return;
    const c = context();
    if (!c) return;

    // The recording if it is here, the recording once it arrives, and the
    // generated version in the meantime. The check on focusName before
    // swapping matters: by the time a download finishes, the person may have
    // picked something else or stopped the timer, and starting then would be
    // a sound nobody asked for.
    if (FILE_SOUNDS[wanted]) {
      if (buffers[wanted]) { playBuffer(wanted, buffers[wanted]); return; }
      if (!failed[wanted]) {
        focusName = wanted;     // claimed now, so a later arrival can check it
        loadBuffer(wanted).then((buf) => {
          if (buf && focusName === wanted) { stopFocus(); playBuffer(wanted, buf); }
        });
        // Nothing to stand in with: wait for the file rather than play
        // something that is not what was asked for.
        if (!SYNTH_VOICES[wanted]) return;
      } else if (!SYNTH_VOICES[wanted]) {
        // The file will not come and there is no voice for it. Silence is the
        // honest outcome, and the only one that is not a different sound.
        return;
      }
    }

    const gain = c.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    const stoppable = [];
    let ticker = null;

    if (wanted === "tick") {
      // No interval of its own. A tick that runs on its own clock drifts
      // against the digits on screen within a minute, and a clock whose
      // sound and face disagree is worse than a silent one — so the timer
      // calls SYS.tickSound() from the same beat that redraws the seconds.
      tickOnce();
      gain.gain.value = 1;
    } else {
      const src = noise();
      if (!src) return;
      stoppable.push(src);
      const filter = c.createBiquadFilter();

      if (wanted === "rain") {
        // Rain is three things at once, and the first attempt had only one of
        // them — bright hiss, which on its own sounds like static.
        //
        //   1. the hiss, rolled off at the top so it is not harsh
        //   2. a low body underneath, which is what makes it sound outdoors
        //      rather than inside a speaker
        //   3. droplets, which are short and *pitched* — a resonant filter
        //      rings for a few milliseconds, where a plain click does not
        filter.type = "bandpass";
        filter.frequency.value = 2000;
        filter.Q.value = 0.5;
        const body = noise();
        const bodyFilter = c.createBiquadFilter();
        const bodyGain = c.createGain();
        bodyFilter.type = "lowpass";
        bodyFilter.frequency.value = 380;
        bodyGain.gain.value = 0.5;
        body.connect(bodyFilter); bodyFilter.connect(bodyGain); bodyGain.connect(gain);
        body.start();
        stoppable.push(body);
        stoppable.push(wobble(bodyGain.gain, 0.3, 0.7, 7));
        gain.gain.setTargetAtTime(0.3, c.currentTime, 0.6);
        ticker = setInterval(() => {
          // Two or three at a time, at random offsets: real rain does not
          // land on a grid.
          const drops = 1 + Math.floor(Math.random() * 3);
          for (let i = 0; i < drops; i++) {
            drip(c.currentTime + Math.random() * 0.24, 900 + Math.random() * 2400, 0.05 + Math.random() * 0.07);
          }
        }, 260);
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
        // A fire is a low roar with crackles *in bursts*. Spacing the pops
        // evenly, as the first attempt did, sounds like interference rather
        // than burning wood: the clustering is the whole character.
        filter.type = "lowpass";
        filter.frequency.value = 260;
        stoppable.push(wobble(filter.frequency, 180, 340, 6));
        gain.gain.setTargetAtTime(0.34, c.currentTime, 0.6);
        ticker = setInterval(() => {
          if (Math.random() < 0.55) {
            const pops = 1 + Math.floor(Math.random() * 4);
            for (let i = 0; i < pops; i++) {
              // Each pop is shorter and quieter than a droplet, and bright:
              // this is the snap of sap, not a tap on glass.
              crackle(c.currentTime + i * (0.02 + Math.random() * 0.05), 2600 + Math.random() * 3200, 0.05 + Math.random() * 0.06);
            }
          }
        }, 210);
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

  // The synthesised stand-ins for the recordings that have none. Forest and
  // cafe deliberately have no fallback: birdsong and a room full of people
  // are not textures, and a noise generator pretending to be either would be
  // worse than waiting for the file.
  SYS.hasRecording = function (name) { return !!FILE_SOUNDS[name]; };
  // True once a file has failed to arrive or to decode. The picker says so
  // rather than leaving a row that does nothing when pressed.
  SYS.soundUnavailable = function (name) { return !!failed[name] && !SYNTH_VOICES[name]; };
  // One tick. Called by whatever owns the seconds, so the sound lands with
  // the digit rather than near it.
  function tickOnce() {
    const c = context();
    if (!c) return;
    click(c.currentTime + 0.005, 1750, 0.45, 0.035);
  }
  SYS.tickSound = function () {
    if (focusName !== "tick") return;
    tickOnce();
  };

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
  // Choosing by ear. It plays and keeps playing — the timer is not running
  // yet, so there is nothing to cut it short for, and a two-second sample was
  // useless anyway: a texture needs longer than that to judge, and when the
  // file took two seconds to arrive the sample was over before it started.
  //
  // Stopped by pressing the same sound again, or by leaving the panel.
  SYS.previewSound = function (kind, name) {
    unlock();
    if (kind === "end") { playEnd(name); return; }
    startFocus(name);
  };

  SYS.unlockSound = unlock;
})(window.SYS = window.SYS || {});

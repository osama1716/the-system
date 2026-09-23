// The fire on the level dial.
//
// The arc of progress is drawn by a fragment shader rather than by a gradient:
// a real flame, lit only as far round the circle as the player has got.
//
// Written here rather than borrowed. A circular fire progress bar is an idea
// anyone may have, but the code that makes one is its author's, and shaders
// posted on Shadertoy carry a non-commercial licence unless the author says
// otherwise — which would keep this app from ever charging for itself. So the
// hash, the noise, the way the flame is built and the way it is coloured are
// all ours, and nothing here needs anyone's permission.
//
// How it works. Every pixel is put into the ring's own coordinates: how far
// round the circle it is, and how far out from the rim. Fractal noise is
// sampled in those coordinates and dragged outward over time, which is what
// makes the fire climb; how high the noise reaches at a point decides whether
// that point is burning. Arc length is divided by the flame's height before
// it is sampled, so the noise cells stay square and the fire looks the same
// at every dial size. Colour is temperature: the body of the flame in the
// theme's own gold, and only the hottest part opened up towards white.
//
// One canvas and one WebGL context are made for the life of the tab and moved
// into whatever markup the Overview has just been re-rendered into — a page
// render happens on every state change, and a fresh context per render would
// run a browser out of them. The loop stops when the Overview is left, when
// the dial scrolls out of view, and while the tab is in the background.
// Anyone who asked for less movement gets a single frame and no loop. If
// WebGL is missing or the context is lost, nothing is drawn at all and the
// gradient underneath goes on reporting the same number.
(function (SYS) {
  "use strict";

  const VERT = [
    "attribute vec2 p;",
    "void main() { gl_Position = vec4(p, 0.0, 1.0); }",
  ].join("\n");

  const FRAG = [
    "precision highp float;",
    "uniform vec2 iResolution;",
    "uniform float uTime;",
    "uniform float uProgress;",   // 0..1, how far round the fire is lit
    "uniform vec3 uHot;",         // the colour of the hottest part
    "uniform vec3 uBody;",        // the colour of the body of the flame
    "uniform float uRing;",       // the rim, as a share of the canvas
    "uniform float uWidth;",      // how tall the flame stands off the rim
    "uniform float uGain;",       // overall brightness
    "",
    "const float TAU = 6.283185307179586;",
    "",
    "float hash(vec2 p) {",
    "  p = fract(p * vec2(127.13, 311.7));",
    "  p += dot(p, p.yx + 41.27);",
    "  return fract(p.x * p.y * 2.037);",
    "}",
    "",
    "float vnoise(vec2 p) {",
    "  vec2 i = floor(p);",
    "  vec2 f = fract(p);",
    "  vec2 u = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),",
    "             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);",
    "}",
    "",
    // Each octave is turned as well as scaled, so the grid the noise is built
    // on never lines up with itself and the flame keeps no square edges.
    "float fbm(vec2 p) {",
    "  float sum = 0.0;",
    "  float amp = 0.5;",
    "  mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);",
    "  for (int i = 0; i < 4; i++) {",
    "    sum += amp * vnoise(p);",
    "    p = turn * p * 2.07;",
    "    amp *= 0.5;",
    "  }",
    "  return sum;",
    "}",
    "",
    "void main() {",
    "  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution) / iResolution.y;",
    "  float dist = length(uv);",
    // Nought at twelve o'clock and growing clockwise, to match the gradient
    // underneath and the way anyone reads a dial.
    "  float around = mod(TAU * 0.25 - atan(uv.y, uv.x), TAU);",
    "  float lit = uProgress * TAU;",
    "  if (around > lit || uProgress <= 0.0) { gl_FragColor = vec4(0.0); return; }",
    "",
    // Ring coordinates: `up` is how far out from the rim, in flame heights;
    // `along` is arc length in the same unit, so the noise cells stay square.
    "  float up = (dist - uRing) / uWidth;",
    "  float along = around * uRing / uWidth;",
    "",
    "  vec2 q = vec2(along * 2.1 + uTime * 0.45, up * 1.25 - uTime * 1.3);",
    "  float n = fbm(q);",
    "  float fine = fbm(q * 2.3 + vec2(17.4, -6.1) - vec2(uTime * 0.2, uTime * 0.85));",
    "  float reach = n * 0.74 + fine * 0.36;",
    "",
    // Burning where the noise reaches past this point. Going inward costs
    // much more than going outward, so the flame sits on the rim and climbs
    // away from it instead of bleeding across the face of the dial.
    "  float climb = reach * 1.7 - max(up, 0.0) - max(-up, 0.0) * 3.4;",
    "  float flame = smoothstep(0.0, 0.3, climb) * exp(-max(up, 0.0) * 0.85);",
    "  float core = exp(-abs(up) * 9.0) * (0.45 + 0.55 * reach);",
    "  float heat = (flame * 0.62 + core * 1.15) * uGain;",
    "",
    // Both ends are brought down so the fire starts and stops rather than
    // being chopped off, and the fade is never wider than the lit arc itself.
    "  float cap = min(0.11, lit * 0.45);",
    "  heat *= smoothstep(0.0, cap, around) * smoothstep(0.0, cap, lit - around);",
    "",
    // Colour is temperature, and heat is carried by the alpha alone — never
    // by darkening the colour. Multiplying a colour by its intensity is what
    // a flame on black wants, and it is exactly what turns the faint edge of
    // the same flame into grey smoke on a cream page. Here the coolest pixel
    // is still saturated gold; it is simply more transparent.
    "  vec3 col = mix(uBody, uHot, clamp(heat - 0.35, 0.0, 1.0));",
    "  col = mix(col, mix(uHot, vec3(1.0), 0.6), clamp((heat - 1.0) * 0.95, 0.0, 1.0));",
    "  gl_FragColor = vec4(clamp(col, 0.0, 1.0), clamp(heat, 0.0, 1.0));",
    "}",
  ].join("\n");

  let canvas = null;     // the one canvas, kept for the life of the tab
  let gl = null;
  let uni = null;
  let frame = 0;
  let side = 0;
  let t0 = 0;
  let dead = false;      // no WebGL, or the context went away for good
  let mounted = false;   // the canvas is in a page that wants it
  let watcher = null;    // stops the loop while the dial is scrolled past

  // The flame takes its colour from whatever the current theme calls gold,
  // rather than from a pair of constants: a player on a custom palette gets
  // fire in their own colour instead of the default amber. The hot part is
  // that colour opened right up, and the body is the same hue pulled down
  // and reddened, which is the direction a real flame cools in. Read when
  // the page mounts, because it cannot change without one.
  let hot = [1, 0.74, 0.42];
  let body = [1, 0.44, 0.13];

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return sh;
    console.warn("aura: shader failed —", gl.getShaderInfoLog(sh));
    return null;
  }

  function readAccent() {
    const raw = getComputedStyle(canvas).getPropertyValue("--gold").trim();
    let rgb = null;
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
    if (hex) {
      const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
      rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    } else {
      const fn = /rgba?\(([^)]+)\)/i.exec(raw);
      if (fn) {
        const p = fn[1].split(/[,\s/]+/).map(parseFloat);
        if (p.length >= 3 && p.every((n) => n === n)) rgb = [p[0] / 255, p[1] / 255, p[2] / 255];
      }
    }
    if (!rgb) return;
    const mx = Math.max(rgb[0], rgb[1], rgb[2]) || 1;
    const pure = [rgb[0] / mx, rgb[1] / mx, rgb[2] / mx];
    hot = [pure[0], 0.5 + pure[1] * 0.5, 0.2 + pure[2] * 0.6];
    body = [pure[0], pure[1] * 0.62, pure[2] * 0.3];
  }

  function build() {
    canvas = document.createElement("canvas");
    canvas.className = "fire-ring";
    canvas.setAttribute("aria-hidden", "true");
    const opts = { alpha: true, premultipliedAlpha: false, antialias: false, depth: false };
    gl = canvas.getContext("webgl", opts) || canvas.getContext("experimental-webgl", opts);
    if (!gl) return false;

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("aura: link failed —", gl.getProgramInfoLog(prog));
      return false;
    }
    gl.useProgram(prog);

    // One triangle big enough to cover the clip space: there is no geometry
    // to speak of here, the whole picture is the fragment shader.
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = (n) => gl.getUniformLocation(prog, n);
    uni = {
      res: u("iResolution"), time: u("uTime"), progress: u("uProgress"),
      hot: u("uHot"), body: u("uBody"), ring: u("uRing"),
      width: u("uWidth"), gain: u("uGain"),
    };

    // No blending on purpose. One triangle covers the whole canvas and
    // nothing overlaps, so every fragment simply writes its own colour and
    // its own alpha. Blending here would have multiplied the colour by the
    // alpha on the way in, and the page compositor — told the buffer is not
    // premultiplied — would have done it a second time, which is what turns
    // the faint edge of a flame into grey soot on a light background.
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); pause(); dead = true; });
    t0 = performance.now();
    return true;
  }

  function pause() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  function quiet() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // Scrolled past the dial, the shader would go on running for nobody. The
  // tab going to the background is already handled for us, since a browser
  // stops serving animation frames to a page nobody is looking at.
  function watch() {
    if (watcher || !window.IntersectionObserver) return;
    watcher = new IntersectionObserver((entries) => {
      if (entries[entries.length - 1].isIntersecting) {
        if (mounted && !frame && !quiet()) frame = requestAnimationFrame(draw);
      } else {
        pause();
      }
    }, { rootMargin: "80px" });
    watcher.observe(canvas);
  }

  function size() {
    // The flame is soft-edged, so it survives being drawn under its own size;
    // capping the ratio keeps a phone from rendering four times the pixels
    // for a glow nobody can resolve at that distance.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const px = Math.min(1536, Math.round((canvas.clientWidth || 0) * dpr));
    if (!px || px === side) return;
    side = px;
    canvas.width = side;
    canvas.height = side;
    gl.viewport(0, 0, side, side);
    gl.uniform2f(uni.res, side, side);
  }

  function draw(now) {
    frame = 0;
    if (dead || !canvas.isConnected) return;
    size();
    if (!side) { frame = requestAnimationFrame(draw); return; }

    const ds = canvas.dataset;
    const num = (k, fallback) => {
      const v = parseFloat(ds[k]);
      return v === v ? v : fallback;
    };
    gl.uniform1f(uni.time, (now - t0) / 1000 * num("speed", 1));
    gl.uniform1f(uni.progress, Math.max(0, Math.min(1, num("progress", 0))));
    gl.uniform1f(uni.ring, num("ring", 0.33));
    gl.uniform1f(uni.width, num("width", 0.075));
    gl.uniform1f(uni.gain, num("gain", 1));
    gl.uniform3fv(uni.hot, hot);
    gl.uniform3fv(uni.body, body);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    frame = requestAnimationFrame(draw);
  }

  // Called after every page render: the canvas is moved into the slot the
  // new markup left for it, or the loop stops because this page has none.
  SYS.mountAura = function (root) {
    pause();
    mounted = false;
    const slot = root ? root.querySelector(".fire-slot") : null;
    if (!slot || dead) return;
    if (!canvas && !build()) { dead = true; return; }

    slot.appendChild(canvas);
    Object.keys(slot.dataset).forEach((k) => { canvas.dataset[k] = slot.dataset[k]; });
    readAccent();
    mounted = true;
    watch();
    // The dial's own gradient is the fallback, so it is only dimmed once
    // there is a flame to dim it for.
    const holder = slot.closest(".ring-holder");
    if (holder) holder.classList.add("lit");

    if (quiet()) {
      draw(t0 + 2200);             // one frame, taken from a lively moment
      pause();
      return;
    }
    frame = requestAnimationFrame(draw);
  };
})(window.SYS = window.SYS || {});

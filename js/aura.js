// The fire on the level dial.
//
// The arc of progress is drawn by a fragment shader rather than by a gradient:
// a real flame, lit only as far round the circle as the player has got.
//
//   ---------------------------------------------------------------------
//   LICENCE — READ BEFORE THE APP EVER CHARGES FOR ITSELF
//
//   The shader below is adapted from "Magical fire ring progress" by
//   tejainece, https://www.shadertoy.com/view/tXB3zc. That page states no
//   licence, so Shadertoy's default applies: CC BY-NC-SA 3.0. NC forbids
//   commercial use, and adapting the code does not escape it — a derivative
//   work carries its original's licence however much of it is rewritten.
//
//   This was shipped as a considered decision, not an oversight. Before the
//   app takes money, one of these has to happen: the author gives written
//   permission, or this file goes back to the version written from scratch,
//   which is in the history at commit 580bbb0 ("Level dial: the arc of
//   progress burns"). Nothing else in the app depends on which one is here.
//   ---------------------------------------------------------------------
//
// What is ours in this file: the sweep is driven by the player's progress
// rather than by the clock, the colours are taken from whatever the current
// theme calls gold instead of being fixed violet, the result is written with
// a real alpha so it can sit over a cream page as well as a dark one, and
// the ring's placement is given as a share of the canvas so the same flame
// lands on the rim at every dial size.
//
// One canvas and one WebGL context are made for the life of the tab and
// moved into whatever markup the Overview has just been re-rendered into —
// a render happens on every state change, and a fresh context per render
// would run a browser out of them. The loop stops when the Overview is left,
// when the dial scrolls out of view, and while the tab is in the background.
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
    "uniform float iTime;",
    "uniform float uProgress;",    // 0..1, how far round the fire is lit
    "uniform vec3 uFire;",         // the hot colour, from the theme
    "uniform vec3 uSmoke;",        // the cooler colour it falls off to
    "uniform float uRadius;",
    "uniform float uThickness;",
    "uniform float uIntensity;",
    "uniform float uGain;",
    "",
    "const float M_PI = 3.1415926535897932384626433832795;",
    "const float inner = 1.0;",
    "const float direction = 1.0;",
    "const float smokeSmoothness = 50.0;",
    "",
    "float angleToClockLike(vec2 uv) {",
    "  float angle = atan(-uv.y, -uv.x) + M_PI;",
    "  return mod(-angle + M_PI / 2.0, 2.0 * M_PI);",
    "}",
    "",
    "vec3 polarMap(vec2 uv, float dir, float shift, float radius, float intensity, float innerAmt) {",
    "  intensity = 40.0 / intensity;",
    "  float angle = angleToClockLike(uv);",
    "  float px = dir * angle / (2.0 * M_PI) + shift;",
    "  float py = length(uv) * (1.0 + innerAmt * 2.0 * intensity) - innerAmt * intensity + (intensity - radius * intensity);",
    "  return vec3(px, py, angle);",
    "}",
    "",
    "float rand(vec2 n) { return fract(sin(dot(n, vec2(12.9898, 12.1414))) * 83758.5453); }",
    "",
    "float noise(vec2 n) {",
    "  const vec2 d = vec2(0.0, 1.0);",
    "  vec2 b = floor(n);",
    "  vec2 f = smoothstep(vec2(0.0), vec2(1.0), fract(n));",
    "  return mix(mix(rand(b), rand(b + d.yx), f.x), mix(rand(b + d.xy), rand(b + d.yy), f.x), f.y);",
    "}",
    "",
    "vec3 ramp(float t) { return (t <= 0.5 ? uFire : uSmoke) / t; }",
    "",
    "float fire(vec2 n) { return noise(n) + noise(n * 2.1) * 0.6 + noise(n * 5.4) * 0.42; }",
    "",
    "float shade(vec2 uv, float t) {",
    "  uv.x += uv.y < 0.5 ? 23.0 + t * 0.035 : -11.0 + t * 0.03;",
    "  uv.x *= smokeSmoothness;",
    "  uv.y = 0.9 * abs(uv.y - 0.5);",
    "  float r = fire(uv - t);",
    "  return pow(2.0 * uv.y * r, 4.0);",
    "}",
    "",
    "vec3 shaded(float grad) {",
    "  grad = sqrt(grad) / uThickness;",
    "  vec3 c = ramp(grad);",
    "  return c / (1.0 + max(vec3(0.0), c));",
    "}",
    "",
    "void main() {",
    "  vec2 uv = gl_FragCoord.xy / iResolution.xy - 0.5;",
    "  vec3 polar = polarMap(uv, direction, 0.0, uRadius, uIntensity, inner);",
    "  float fullAngle = uProgress * 2.0 * M_PI;",
    "  if (polar.z > fullAngle || uProgress <= 0.0) { gl_FragColor = vec4(0.0); return; }",
    "  vec3 c = shaded(shade(polar.xy, iTime)) * uGain;",
    // Both ends of the arc are brought down so the fire starts and stops
    // instead of being chopped off at a hard edge. The fade is never wider
    // than the lit arc itself, or a dial barely begun would have no fire.
    "  float cap = min(0.09, fullAngle * 0.45);",
    "  if (polar.z < cap) c *= 0.3 + 0.7 * polar.z / cap;",
    "  if (polar.z > fullAngle - cap) c *= 0.3 + 0.7 * (1.0 - (polar.z - (fullAngle - cap)) / cap);",
    // How bright the pixel came out becomes the alpha, and the colour is
    // divided back out by it. The shader was written for a black page, where
    // a dim pixel simply IS a dark colour; written straight into an alpha
    // buffer that same pixel is a dark colour half-covering whatever is
    // behind it, which turns the edge of the flame into soot on a cream
    // page. Undoing the multiply leaves the colour saturated at every
    // brightness and lets the alpha carry the falloff on its own.
    "  float a = clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0);",
    // The smoke carries on past the flame all the way to the edge of the
    // canvas, where it stops dead and draws a square. Fading it out before
    // it gets there leaves the flame untouched and the square gone; the
    // curve on the alpha pushes the faintest haze under the floor rather
    // than letting the divide below open it back up into visible colour.
    "  a *= 1.0 - smoothstep(0.40, 0.485, length(uv));",
    "  a = pow(a, 1.3);",
    "  if (a <= 0.01) { gl_FragColor = vec4(0.0); return; }",
    "  gl_FragColor = vec4(clamp(c / max(max(c.r, max(c.g, c.b)), 0.001), 0.0, 1.0), a);",
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
  // fire in their own colour instead of the default amber. The hot colour is
  // that gold opened right up to its brightest, and the cooler one is the
  // same hue pulled down and reddened, which is the way a real flame cools.
  let hot = [1, 0.74, 0.42];
  let smoke = [1, 0.44, 0.13];

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
    smoke = [pure[0], pure[1] * 0.6, pure[2] * 0.32];
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
      res: u("iResolution"), time: u("iTime"), progress: u("uProgress"),
      fire: u("uFire"), smoke: u("uSmoke"), radius: u("uRadius"),
      thickness: u("uThickness"), intensity: u("uIntensity"), gain: u("uGain"),
    };

    // No blending on purpose. One triangle covers the whole canvas and
    // nothing overlaps, so every fragment simply writes its own colour and
    // its own alpha. Blending here would multiply the colour by the alpha on
    // the way in, and the page compositor — told the buffer is not
    // premultiplied — would do it a second time.
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
    // Where the flame sits is given as a share of the canvas, which is a
    // thing the markup can reason about; the shader wants its own `radius`,
    // and this is the arithmetic between the two.
    const intensity = num("intensity", 2.4);
    const spread = 40 / intensity;
    gl.uniform1f(uni.radius, (num("ring", 0.33) * (1 + 2 * spread) - 0.5) / spread);
    gl.uniform1f(uni.intensity, intensity);
    gl.uniform1f(uni.time, (now - t0) / 1000 * num("speed", 1));
    gl.uniform1f(uni.progress, Math.max(0, Math.min(1, num("progress", 0))));
    gl.uniform1f(uni.thickness, num("thickness", 1));
    gl.uniform1f(uni.gain, num("gain", 1));
    gl.uniform3fv(uni.fire, hot);
    gl.uniform3fv(uni.smoke, smoke);
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

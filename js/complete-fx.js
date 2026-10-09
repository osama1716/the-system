// A pack's finishing touch: what plays where you tapped when a quest or a
// habit is done. It comes free with any piece of its pack you own, so it is
// shown by pack, not bought on its own.
//
// Angel: a soft gold glow at the tap, and a handful of the background's own
// feathers thrown up and out, which then drift down swaying and fade.
// One canvas over the page, made when something plays and removed when the
// last of it has faded; people who ask for reduced motion see nothing.
(function (SYS) {
  "use strict";

  const reduce = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FEATHERS = [0, 1, 2, 3, 4, 5].map((k) => {
    const img = new Image();
    img.src = "assets/backgrounds/feathers/f" + k + ".png";
    return img;
  });
  const rand = (a, b) => a + Math.random() * (b - a);

  let canvas = null, ctx = null, items = [], running = false, last = 0;

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement("canvas");
    canvas.className = "complete-fx";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d");
  }
  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth, H = window.innerHeight;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { W, H };
  }

  const KINDS = {
    angel(x, y) {
      items.push({ kind: "glow", x, y, t: 0, life: 0.7 });
      const n = 9 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + rand(-1.35, 1.35);      // up and out, never straight down
        const sp = rand(260, 520);
        items.push({
          kind: "feather", img: FEATHERS[i % FEATHERS.length],
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: rand(1.4, 1.9),
          size: rand(26, 40), w: (2 * Math.PI) / rand(0.9, 1.5), ph: rand(0, 6.3),
          amp: rand(14, 26), flip: Math.random() < 0.5 ? -1 : 1, tilt: rand(-0.5, 0.5),
        });
      }
    },
  };

  function step(dt) {
    items.forEach((p) => {
      p.t += dt;
      if (p.kind !== "feather") return;
      // The throw slows quickly in the air; after it, a slow fall.
      const drag = Math.exp(-3 * dt);
      p.vx *= drag; p.vy = p.vy * drag + 38 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    });
    items = items.filter((p) => p.t < p.life);
  }

  function draw() {
    const { W, H } = fit();
    ctx.clearRect(0, 0, W, H);
    items.forEach((p) => {
      const k = p.t / p.life;
      if (p.kind === "glow") {
        const r = 18 + 70 * Math.sqrt(k);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        const a = 0.55 * (1 - k);
        g.addColorStop(0, "rgba(255, 244, 214, " + a + ")");
        g.addColorStop(0.45, "rgba(232, 196, 120, " + a * 0.5 + ")");
        g.addColorStop(1, "rgba(232, 196, 120, 0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 2 * Math.PI); ctx.fill();
        return;
      }
      if (!p.img.complete || !p.img.naturalWidth) return;
      const s = Math.sin(p.w * p.t + p.ph);
      // The sway grows as the throw dies away, so it reads as a fall.
      const settle = Math.min(1, p.t / 0.5);
      const fw = p.size, fh = fw * p.img.naturalHeight / p.img.naturalWidth;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.t / 0.08) * (k > 0.6 ? (1 - k) / 0.4 : 1);
      ctx.translate(p.x + p.amp * s * settle, p.y);
      ctx.rotate(p.tilt + 0.5 * Math.cos(p.w * p.t + p.ph) * settle);
      ctx.scale(p.flip, 1);
      ctx.drawImage(p.img, -fw / 2, -fh / 2, fw, fh);
      ctx.restore();
    });
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt);
    if (!items.length) { running = false; canvas.remove(); canvas = null; return; }
    draw();
    requestAnimationFrame(frame);
  }

  // pack: a pack id ("angel", …); x, y: where on the screen it starts.
  function play(pack, x, y) {
    if (!KINDS[pack] || reduce()) return;
    ensureCanvas();
    KINDS[pack](x, y);
    if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
  }

  SYS.CompleteFx = { play, has: (pack) => !!KINDS[pack] };
})(window.SYS = window.SYS || {});

// Feathers falling over a moving background.
//
// The background video is clouds and light only; the feathers are cut from
// the same footage and fall here instead, so each one starts at a random spot
// and a new one follows when it has gone — a 15-second video could only
// repeat the same few paths. Positions are kept as fractions of the box, per
// background, and drawn into every <canvas data-feathers="id"> on the page,
// so a re-render (a sync, a tick) draws the same feathers on the new canvas
// instead of starting over.
(function (SYS) {
  "use strict";

  const SPRITES = [0, 1, 2, 3, 4, 5].map((k) => {
    const img = new Image();
    img.src = "assets/backgrounds/feathers/f" + k + ".png";
    return img;
  });
  const MAX = 8;
  const skies = {};
  let running = false, last = 0;

  const rand = (a, b) => a + Math.random() * (b - a);

  function spawn(sky) {
    const depth = rand(0.6, 1);       // nearer feathers are larger, faster, brighter
    sky.parts.push({
      img: SPRITES[Math.floor(Math.random() * SPRITES.length)],
      x0: rand(0.08, 0.92), y: -0.12, t: 0,
      vy: depth / rand(8, 12),         // a whole fall takes about 8–20 s
      amp: rand(0.025, 0.06), w: (2 * Math.PI) / rand(2.6, 4.2), ph: rand(0, 2 * Math.PI),
      tilt: rand(-0.25, 0.25), flip: Math.random() < 0.5 ? -1 : 1,
      size: depth * rand(0.15, 0.21), alpha: 0.7 + 0.3 * depth,
    });
    sky.next = rand(0.8, 1.9);
  }

  function step(sky, dt) {
    sky.next -= dt;
    if (sky.next <= 0 && sky.parts.length < MAX) spawn(sky);
    sky.parts.forEach((p) => {
      p.t += dt;
      // A feather swings like a pendulum as it drops, slower at each end.
      p.y += p.vy * dt * (0.75 + 0.25 * Math.abs(Math.cos(p.w * p.t + p.ph)));
    });
    sky.parts = sky.parts.filter((p) => p.y < 1.15);
  }

  function draw(sky, c) {
    const W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const unit = Math.min(W, H * 1.1);
    sky.parts.forEach((p) => {
      if (!p.img.complete || !p.img.naturalWidth) return;
      const s = Math.sin(p.w * p.t + p.ph);
      const x = (p.x0 + p.amp * s) * W, y = p.y * H;
      const fw = p.size * unit, fh = fw * p.img.naturalHeight / p.img.naturalWidth;
      g.save();
      g.globalAlpha = p.alpha * Math.min(1, p.t / 0.8);
      g.translate(x, y);
      g.rotate(p.tilt + 0.4 * Math.cos(p.w * p.t + p.ph));
      g.scale(p.flip, 1);
      g.drawImage(p.img, -fw / 2, -fh / 2, fw, fh);
      g.restore();
    });
  }

  function frame(now) {
    const canvases = Array.from(document.querySelectorAll("canvas[data-feathers]"));
    if (!canvases.length) { running = false; return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const seen = {};
    canvases.forEach((c) => {
      const id = c.dataset.feathers;
      const sky = skies[id] || (skies[id] = { parts: [], next: 0.4 });
      if (!seen[id]) { step(sky, dt); seen[id] = true; }
      draw(sky, c);
    });
    requestAnimationFrame(frame);
  }

  // Called after anything that may have drawn a background onto the page.
  function refresh() {
    if (running || !document.querySelector("canvas[data-feathers]")) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  SYS.Feathers = { refresh };
})(window.SYS = window.SYS || {});

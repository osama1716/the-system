// Animated Aurenite frames.
//
// A frame ships as one packed video: colour on the left half, alpha on the
// right (filmed over black, so the colour is unmultiplied by its alpha). One
// hidden <video> per frame is decoded once and drawn into every
// <canvas data-frame="id"> on the page; when none is left on the page it
// pauses. People who ask for reduced motion get the still instead.
(function (SYS) {
  "use strict";

  const players = {};
  const reduce = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const src = (id) => "assets/frames/aurenite-" + id;

  function canvasesFor(id) {
    return Array.from(document.querySelectorAll('canvas[data-frame="' + id + '"]'));
  }

  function start(id) {
    const v = document.createElement("video");
    v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
    v.setAttribute("playsinline", ""); v.setAttribute("muted", "");
    v.src = src(id) + ".mp4";
    const work = document.createElement("canvas");
    const wctx = work.getContext("2d", { willReadFrequently: true });
    const p = { v, S: 0, out: null, running: false };
    players[id] = p;

    function draw() {
      const targets = canvasesFor(id);
      if (!targets.length) { p.running = false; v.pause(); return; }
      if (v.readyState >= 2) {
        if (!p.S) {
          p.S = v.videoHeight; work.width = p.S * 2; work.height = p.S;
          p.out = new ImageData(p.S, p.S);
        }
        const S = p.S;
        wctx.drawImage(v, 0, 0);
        const px = wctx.getImageData(0, 0, S * 2, S).data, o = p.out.data;
        for (let y = 0; y < S; y++) {
          let li = y * S * 8, ai = li + S * 4, oi = y * S * 4;
          for (let x = 0; x < S; x++, li += 4, ai += 4, oi += 4) {
            const a = px[ai];
            if (a < 3) { o[oi + 3] = 0; continue; }
            const k = 255 / a;
            o[oi] = Math.min(255, px[li] * k);
            o[oi + 1] = Math.min(255, px[li + 1] * k);
            o[oi + 2] = Math.min(255, px[li + 2] * k);
            o[oi + 3] = a;
          }
        }
        targets.forEach((c) => {
          if (c.width !== S) { c.width = S; c.height = S; }
          c.getContext("2d").putImageData(p.out, 0, 0);
        });
      }
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(draw); else requestAnimationFrame(draw);
    }
    p.loop = () => {
      if (p.running) return;
      p.running = true;
      v.play().catch(() => {});
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(draw); else requestAnimationFrame(draw);
    };
    return p;
  }

  // Called after anything that may have drawn a frame onto the page.
  function refresh() {
    const ids = Array.from(new Set(Array.from(document.querySelectorAll("canvas[data-frame]")).map((c) => c.dataset.frame)));
    ids.forEach((id) => {
      if (reduce()) {
        canvasesFor(id).forEach((c) => {
          const img = new Image();
          img.className = c.className; img.alt = ""; img.src = src(id) + "-still.png";
          c.replaceWith(img);
        });
        return;
      }
      (players[id] || start(id)).loop();
    });
  }

  SYS.FramePlayer = { refresh };
})(window.SYS = window.SYS || {});

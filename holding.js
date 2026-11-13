// Apulius holding page: "Tesserae".
// The sign is made of mosaic tiles. They fly in and lay themselves into the mark;
// the curve heals into one smooth stroke; the name re-forms, tile by tile, between
// apulius and ⴰⴼⵓⵍⴰⵢ. Touch the sign and it turns back into data, then heals.
(function () {
  "use strict";
  var RECTS = [[24.5, 6.5], [24.5, 36.5], [30.5, 6.5], [30.5, 12.5], [30.5, 30.5], [30.5, 36.5], [36.5, 12.5], [36.5, 18.5], [36.5, 24.5], [36.5, 30.5]];               // pixel half of the mark, in 48-unit grid
  var WORDS = ["apulius", "ⴰⴼⵓⵍⴰⵢ"];
  var FONTS = ['500 100px "Jost"', '400 100px "Noto Sans Tifinagh"'];
  var CYCLE = 6200;                    // ms between name changes
  var canvas = document.getElementById("stage");
  var ctx = canvas.getContext("2d");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var scheme = window.matchMedia("(prefers-color-scheme: dark)");

  var W = 0, H = 0, DPR = 1, L = null, col = null;
  var tiles = [], arcTiles = [], letters = [];
  var heal = 0, healTarget = 0, lang = 0, nextSwap = 0, start = 0, lastTouch = -1e9, ringBreak = 0;
  var pointer = { x: -1e5, y: -1e5, inside: false };
  var hint = document.getElementById("hint");
  var touched = false;

  // ---------- colours from the CSS (follows light / dark mode)
  function hex(v) {
    v = v.trim().replace("#", "");
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  }
  function readColours() {
    var cs = getComputedStyle(document.documentElement);
    col = { ink: hex(cs.getPropertyValue("--ink")), cedar: hex(cs.getPropertyValue("--cedar")), earth: hex(cs.getPropertyValue("--earth")) };
    col.shades = [];
    for (var i = 0; i < 8; i++) {
      var k = i / 7;
      col.shades.push("rgb(" + [0, 1, 2].map(function (c) { return Math.round(col.ink[c] + (col.cedar[c] - col.ink[c]) * k); }).join(",") + ")");
    }
    col.cedarCss = "rgb(" + col.cedar.join(",") + ")";
    col.inkCss = "rgb(" + col.ink.join(",") + ")";
  }

  // ---------- geometry
  function layout() {
    W = window.innerWidth; H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    var M = Math.min(W * 0.5, H * 0.30, 280);          // mark size
    var u = M / 48;
    var wordW = Math.min(W * 0.74, M * 2.35);            // width of the name
    var F = wordW / 3.35;                                 // Jost: "apulius" ≈ 3.35 em wide
    var gap = M * 0.16;
    var total = M + gap + F * 0.8;
    var top = H * 0.47 - total / 2;
    L = { M: M, u: u, ox: W / 2 - 23.5 * u, oy: top, F: F, wordW: wordW, wordY: top + M + gap + F * 0.4 };
  }

  function sampleWord(text, font, targetWidth, cy, step) {
    var c = document.createElement("canvas");
    var x = c.getContext("2d");
    x.font = font;
    var w0 = x.measureText(text).width;
    var size = 100 * targetWidth / w0;
    var f = font.replace("100px", size.toFixed(1) + "px");
    c.width = Math.ceil(targetWidth + 40); c.height = Math.ceil(size * 1.6);
    x.font = f; x.fillStyle = "#000"; x.textBaseline = "middle"; x.textAlign = "center";
    x.fillText(text, c.width / 2, c.height / 2);
    var d = x.getImageData(0, 0, c.width, c.height).data, pts = [];
    for (var yy = step / 2; yy < c.height; yy += step) {
      for (var xx = step / 2; xx < c.width; xx += step) {
        if (d[(Math.floor(yy) * c.width + Math.floor(xx)) * 4 + 3] > 120) {
          pts.push([W / 2 - c.width / 2 + xx, cy - c.height / 2 + yy]);
        }
      }
    }
    return pts;
  }

  function scatter(p, far) {
    var a = Math.random() * Math.PI * 2, r = (far ? 0.65 : 0.25) * Math.max(W, H) * (0.6 + Math.random() * 0.6);
    p.x = W / 2 + Math.cos(a) * r; p.y = H / 2 + Math.sin(a) * r;
    p.vx = 0; p.vy = 0;
  }

  function build(intro) {
    var u = L.u, ox = L.ox, oy = L.oy;
    // 1. Pixel half: the ten squares of the mark
    tiles = RECTS.map(function (r, i) {
      var p = { tx: ox + (r[0] + 2.5) * u, ty: oy + (r[1] + 2.5) * u, s: 5 * u, delay: 350 + i * 90 };
      if (intro) scatter(p, true); else { p.x = p.tx; p.y = p.ty; p.vx = p.vy = 0; }
      return p;
    });
    // 2. Curve half: small cedar tiles laid on the left half of the ring
    arcTiles = [];
    var step = 1.85, cx = 24, cy = 24;
    for (var gy = 6; gy <= 42; gy += step) {
      for (var gx = 4; gx <= 24; gx += step) {
        var dx = gx - cx, dy = gy - cy, r = Math.sqrt(dx * dx + dy * dy);
        if (gx <= 24.2 && r >= 11.6 && r <= 18.4) {
          var a = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);   // π/2 bottom → π left → 3π/2 top
          var along = (a - Math.PI / 2) / Math.PI;                       // 0 at the bottom, 1 at the top
          var p = { tx: ox + gx * u, ty: oy + gy * u, s: step * u * 0.82, along: along, delay: 150 + along * 650 };
          if (intro) scatter(p, true); else { p.x = p.tx; p.y = p.ty; p.vx = p.vy = 0; }
          arcTiles.push(p);
        }
      }
    }
    // 3. The name: tiles that move between the Latin and the Amazigh word
    var g = Math.max(2.2, L.F / 25);
    var A = sampleWord(WORDS[0], FONTS[0], L.wordW, L.wordY, g);
    var B = sampleWord(WORDS[1], FONTS[1], L.wordW * 0.92, L.wordY, g);
    var byX = function (p, q) { return p[0] - q[0] || p[1] - q[1]; };
    A.sort(byX); B.sort(byX);
    var N = Math.max(A.length, B.length);
    letters = [];
    for (var i = 0; i < N; i++) {
      var a2 = A[Math.floor(i * A.length / N)], b2 = B[Math.floor(i * B.length / N)];
      var q = { A: a2, B: b2, s: g * 0.84, delay: 900 + ((a2[0] - (W / 2 - L.wordW / 2)) / L.wordW) * 700 + Math.random() * 120, switchAt: 0 };
      var t = lang === 0 ? a2 : b2;
      q.tx = t[0]; q.ty = t[1];
      if (intro) scatter(q, false); else { q.x = q.tx; q.y = q.ty; q.vx = q.vy = 0; }
      letters.push(q);
    }
  }

  // ---------- behaviour
  function swapName(now, ox, oy) {
    lang = 1 - lang;
    var span = L.wordW;
    letters.forEach(function (q) {
      var from = ox === undefined ? (q.x - (W / 2 - span / 2)) / span : Math.hypot(q.x - ox, q.y - oy) / span;
      q.switchAt = now + Math.max(0, from) * 650 + Math.random() * 140;
      // a small lift so the tiles travel in an arc, like pieces being moved by hand
      q.vy -= 2 + Math.random() * 3;
    });
    nextSwap = now + CYCLE;
  }

  function impulse(x, y, power) {
    function push(p) {
      var dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy) + 0.01;
      var f = power * Math.exp(-d / (L.M * 0.55));
      p.vx += dx / d * f; p.vy += dy / d * f;
    }
    tiles.forEach(push); arcTiles.forEach(push); letters.forEach(push);
  }

  function nearRing(x, y) {
    var cx = L.ox + 24 * L.u, cy = L.oy + 24 * L.u;
    return Math.hypot(x - cx, y - cy) < 22 * L.u;
  }

  function step(p, now, k, damp, repel) {
    if (now < start + (p.delay || 0)) return;
    var ax = (p.tx - p.x) * k, ay = (p.ty - p.y) * k;
    if (repel && pointer.inside) {
      var dx = p.x - pointer.x, dy = p.y - pointer.y, d2 = dx * dx + dy * dy, R = L.M * 0.42;
      if (d2 < R * R) {
        var d = Math.sqrt(d2) + 0.01, f = (1 - d / R); f = f * f * 2.2;
        ax += dx / d * f; ay += dy / d * f;
      }
    }
    p.vx = (p.vx + ax) * damp; p.vy = (p.vy + ay) * damp;
    p.x += p.vx; p.y += p.vy;
  }

  // ---------- drawing
  function drawSquare(x, y, s) { ctx.fillRect(x - s / 2, y - s / 2, s, s); }

  function frame(now) {
    if (!start) { start = now; nextSwap = now + 3400 + CYCLE * 0.4; }
    var t = now - start;

    // Ring: heals after the intro; breaks when touched or every third cycle
    if (t > 1700 && now - lastTouch > 1100 && now > ringBreak) healTarget = 1;
    heal += (healTarget - heal) * (healTarget > heal ? 0.035 : 0.09);
    if (now > nextSwap) {
      swapName(now);
      if (Math.random() < 0.34) { healTarget = 0; ringBreak = now + 1500; }
    }

    // Physics
    tiles.forEach(function (p) { step(p, now, 0.055, 0.8, true); });
    arcTiles.forEach(function (p) {
      var healed = p.along < heal - 0.02;
      step(p, now, healed ? 0.2 : 0.06, healed ? 0.6 : 0.82, !healed);
    });
    letters.forEach(function (q) {
      if (q.switchAt && now >= q.switchAt) {
        var tt = lang === 0 ? q.A : q.B; q.tx = tt[0]; q.ty = tt[1]; q.switchAt = 0;
      }
      step(q, now, 0.045, 0.83, true);
    });

    // Paint
    ctx.clearRect(0, 0, W, H);

    // the healed part of the curve, drawn as one smooth stroke from bottom to top
    if (heal > 0.002) {
      ctx.save();
      ctx.strokeStyle = col.cedarCss; ctx.lineWidth = 7 * L.u; ctx.lineCap = "butt";
      ctx.beginPath();
      ctx.arc(L.ox + 24 * L.u, L.oy + 24 * L.u, 15 * L.u, Math.PI / 2, Math.PI / 2 + Math.PI * Math.min(1, heal));
      ctx.stroke(); ctx.restore();
    }
    // curve tiles not yet healed
    ctx.fillStyle = col.cedarCss;
    arcTiles.forEach(function (p) {
      if (t < (p.delay || 0)) return;
      var edge = (p.along - heal) / 0.06;                  // soft edge where the stroke meets the tiles
      if (edge <= 0) return;
      var s = p.s * Math.min(1, edge);
      drawSquare(p.x, p.y, s);
    });
    // the ten pixels
    ctx.fillStyle = col.inkCss;
    tiles.forEach(function (p) { if (t >= p.delay) drawSquare(p.x, p.y, p.s * 0.98); });

    // the name: tiles turn cedar while they move, and settle in ink
    var buckets = [[], [], [], [], [], [], [], []];
    var span = L.wordW + 240, waveX = W / 2 - span / 2 + ((t % 5600) / 5600) * span * 1.6;
    letters.forEach(function (q) {
      if (t < q.delay) return;
      var v = Math.hypot(q.vx, q.vy);
      var glow = Math.max(0, 1 - Math.abs(q.x - waveX) / (L.F * 0.45));   // a slow light passes through the letters
      buckets[Math.min(7, Math.floor(v * 1.4 + glow * 5))].push(q);
    });
    for (var b = 0; b < 8; b++) {
      if (!buckets[b].length) continue;
      ctx.fillStyle = col.shades[b];
      for (var i = 0; i < buckets[b].length; i++) { var q = buckets[b][i]; drawSquare(q.x, q.y, q.s); }
    }

    if (!reduce.matches) requestAnimationFrame(frame);
  }

  function drawStill() {
    heal = 1; healTarget = 1; lang = 0; start = performance.now() - 1e6; nextSwap = Infinity;
    build(false);
    frame(performance.now());
  }

  // ---------- events
  function onMove(e) {
    var p = e.touches ? e.touches[0] : e;
    pointer.x = p.clientX; pointer.y = p.clientY; pointer.inside = true;
    if (nearRing(pointer.x, pointer.y)) { healTarget = 0; lastTouch = performance.now(); }
    if (!touched) { touched = true; if (hint) hint.classList.add("gone"); }
  }
  function onLeave() { pointer.inside = false; pointer.x = pointer.y = -1e5; }
  function onTap(e) {
    var p = e.changedTouches ? e.changedTouches[0] : e;
    var now = performance.now();
    impulse(p.clientX, p.clientY, 9);
    if (nearRing(p.clientX, p.clientY)) { healTarget = 0; lastTouch = now; }
    if (now - (nextSwap - CYCLE) > 900) swapName(now, p.clientX, p.clientY);
    if (!touched) { touched = true; if (hint) hint.classList.add("gone"); }
  }

  var resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { layout(); build(false); if (reduce.matches) drawStill(); }, 120);
  }

  function run() {
    readColours(); layout();
    document.documentElement.classList.add("live");
    if (reduce.matches) { drawStill(); return; }
    build(true);
    requestAnimationFrame(frame);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onTap, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    document.addEventListener("pointerout", function (e) { if (!e.relatedTarget) onLeave(); });
    window.addEventListener("pointerup", function (e) { if (e.pointerType !== "mouse") onLeave(); });
  }

  window.addEventListener("resize", onResize);
  scheme.addEventListener && scheme.addEventListener("change", function () { readColours(); if (reduce.matches) drawStill(); });

  Promise.all(FONTS.map(function (f) { return document.fonts.load(f, WORDS.join("")); }))
    .catch(function () {})
    .then(function () { return document.fonts.ready; })
    .then(run);
})();


  /* =================================================================================================
     Art drawn in code: faceted gems (one silhouette per colour), specials, the board tray, effects, a fallback actor. */
  var LIGHT = [-0.62, -0.78];
  /* outline of a shape as polygon points on a unit radius (y down) */
  var SHAPES = {};
  function poly(n, rot, rx, ry) { var p = []; for (var i = 0; i < n; i++) { var a = rot + i * TAU / n; p.push([Math.cos(a) * rx, Math.sin(a) * (ry || rx)]); } return p; }
  SHAPES.cushion = function () { var p = [], s = 0.84, k = 0.3; [[-s + k, -s], [s - k, -s], [s, -s + k], [s, s - k], [s - k, s], [-s + k, s], [-s, s - k], [-s, -s + k]].forEach(function (q) { p.push(q); }); return p; };
  SHAPES.hex = function () { return poly(6, -Math.PI / 2, 0.98, 0.98); };
  SHAPES.star = function () { var p = []; for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? 0.56 : 1.04; p.push([Math.cos(a) * q, Math.sin(a) * q + 0.06]); } return p; };
  SHAPES.tri = function () { return [[0, -0.98], [0.95, 0.72], [-0.95, 0.72]]; };
  SHAPES.kite = function () { return [[0, -1.0], [0.72, -0.12], [0, 0.98], [-0.72, -0.12]]; };
  SHAPES.oval = function () { return poly(14, -Math.PI / 2, 0.7, 0.98); };
  SHAPES.round = function () { return poly(12, -Math.PI / 2, 0.92, 0.92); };
  SHAPES.drop = function () {
    var p = [[0, -1.02]];
    for (var i = 0; i <= 12; i++) { var a = -0.18 * Math.PI + i * (1.36 * Math.PI) / 12; p.push([Math.cos(a) * 0.74, 0.22 + Math.sin(a) * 0.74]); }
    return p;
  };
  SHAPES.heart = function () {
    var p = [];
    for (var i = 0; i < 20; i++) { var t = Math.PI - i * TAU / 20, x = 16 * Math.pow(Math.sin(t), 3), y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)); p.push([x / 17.5, y / 17 + 0.12]); }
    return p;
  };
  SHAPES.moon = function () {
    var p = [], i, a;
    for (i = 0; i <= 10; i++) { a = -0.62 * Math.PI + i * 1.24 * Math.PI / 10; p.push([Math.cos(a + Math.PI / 2) * -0.95 + 0.12, Math.sin(a + Math.PI / 2) * 0.95]); }
    for (i = 10; i >= 0; i--) { a = -0.5 * Math.PI + i * Math.PI / 10; p.push([0.12 + Math.cos(a + Math.PI) * -0.6 - 0.32, Math.sin(a) * 0.72]); }
    return p;
  };
  var SHAPE_CACHE = {};
  function shapePts(name) { if (!SHAPE_CACHE[name]) SHAPE_CACHE[name] = (SHAPES[name] || SHAPES.round)(); return SHAPE_CACHE[name]; }
  function pathPts(g, pts, x, y, r, sx, sy) { g.beginPath(); pts.forEach(function (q, i) { var px = x + q[0] * r * (sx || 1), py = y + q[1] * r * (sy || 1); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.closePath(); }

  /* one faceted gem at (x, y), radius r: rim facets lit from the upper left, a table, a glint, a dark outline */
  function paintGem(g, def, x, y, r) {
    var col = def.colors || ['#222', '#888', '#ddd', '#fff'], pts = shapePts(def.shape);
    if (def.draw) { def.draw(g, x, y, r, 0); return; }
    // contact shadow
    g.save(); g.globalAlpha *= 0.42; g.fillStyle = '#000'; g.beginPath(); g.ellipse(x + r * 0.06, y + r * 0.86, r * 0.7, r * 0.17, 0, 0, TAU); g.fill(); g.restore();
    var cx = 0, cy = 0; pts.forEach(function (q) { cx += q[0]; cy += q[1]; }); cx /= pts.length; cy /= pts.length;
    var tab = pts.map(function (q) { return [cx + (q[0] - cx) * 0.56 - 0.05, cy + (q[1] - cy) * 0.56 - 0.07]; });
    // rim facets
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length], ta = tab[i], tb = tab[(i + 1) % pts.length];
      var mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - cy, ml = Math.sqrt(mx * mx + my * my) || 1;
      var f = 0.5 + 0.5 * ((mx / ml) * LIGHT[0] + (my / ml) * LIGHT[1]);
      var c = f > 0.52 ? mix(col[1], col[2], (f - 0.52) / 0.48 * 0.9) : mix(col[0], col[1], 0.25 + f / 0.52 * 0.75);
      g.beginPath(); g.moveTo(x + a[0] * r, y + a[1] * r); g.lineTo(x + b[0] * r, y + b[1] * r); g.lineTo(x + tb[0] * r, y + tb[1] * r); g.lineTo(x + ta[0] * r, y + ta[1] * r); g.closePath();
      g.fillStyle = c; g.fill(); g.strokeStyle = c; g.lineWidth = Math.max(0.5, r * 0.02); g.stroke();
    }
    // table: a soft gradient, brighter to the upper left, with a darker lower band (depth)
    var gr = g.createLinearGradient(x - r * 0.5, y - r * 0.55, x + r * 0.4, y + r * 0.5);
    gr.addColorStop(0, col[2]); gr.addColorStop(0.45, mix(col[1], col[2], 0.35)); gr.addColorStop(1, mix(col[0], col[1], 0.7));
    pathPts(g, tab, x, y, r); g.fillStyle = gr; g.fill();
    // facet lines on the table edge (crisp cut look)
    g.lineWidth = Math.max(0.6, r * 0.035); g.strokeStyle = rgba(col[3], 0.38); g.stroke();
    for (i = 0; i < pts.length; i++) { g.beginPath(); g.moveTo(x + pts[i][0] * r, y + pts[i][1] * r); g.lineTo(x + tab[i][0] * r, y + tab[i][1] * r); g.strokeStyle = rgba(col[0], 0.28); g.lineWidth = Math.max(0.5, r * 0.025); g.stroke(); }
    // inner glow (light passing through the stone, lower right)
    var ig = g.createRadialGradient(x + r * 0.22, y + r * 0.28, 0, x + r * 0.22, y + r * 0.28, r * 0.6);
    ig.addColorStop(0, rgba(col[2], 0.55)); ig.addColorStop(1, rgba(col[2], 0));
    g.save(); pathPts(g, pts, x, y, r); g.clip(); g.fillStyle = ig; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
    // outline
    pathPts(g, pts, x, y, r); g.lineJoin = 'round'; g.lineWidth = Math.max(1, r * 0.085); g.strokeStyle = mix(col[0], '#000000', 0.35); g.stroke();
    // rim light on the upper-left edges
    g.save(); pathPts(g, pts, x, y, r * 0.93); g.clip();
    pathPts(g, pts, x - r * 0.04, y - r * 0.05, r * 0.93); g.lineWidth = Math.max(0.8, r * 0.07); g.strokeStyle = rgba(col[3], 0.5); g.stroke(); g.restore();
    // glint: a bright soft spot and a small four-point star on the upper-left of the table
    var gx = x + (tab[0][0] * 0.3 - 0.3) * r, gy = y + (cy - 0.36) * r;
    var gl = g.createRadialGradient(gx, gy, 0, gx, gy, r * 0.3); gl.addColorStop(0, rgba(col[3], 0.95)); gl.addColorStop(1, rgba(col[3], 0));
    g.fillStyle = gl; g.beginPath(); g.ellipse(gx, gy, r * 0.3, r * 0.2, -0.6, 0, TAU); g.fill();
    g.fillStyle = col[3]; g.beginPath(); g.ellipse(gx - r * 0.02, gy, r * 0.11, r * 0.06, -0.6, 0, TAU); g.fill();
  }
  /* the Prism: a round brilliant with a rainbow table */
  var PRISM = { shape: 'round', colors: ['#3a3050', '#c8c0e0', '#ffffff', '#ffffff'] };
  function paintPrism(g, x, y, r, t) {
    paintGem(g, PRISM, x, y, r);
    g.save(); pathPts(g, shapePts('round'), x, y, r * 0.8); g.clip();
    var hues = ['#ff5a6a', '#ffb43a', '#ffe85a', '#5ae07a', '#4ab4ff', '#9a6aff'];
    for (var i = 0; i < 12; i++) {
      var a0 = t * 0.8 + i * TAU / 12, a1 = a0 + TAU / 12;
      g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, a0, a1); g.closePath(); g.fillStyle = rgba(hues[i % 6], 0.55); g.fill();
    }
    var w = g.createRadialGradient(x - r * 0.15, y - r * 0.2, 0, x, y, r * 0.8); w.addColorStop(0, 'rgba(255,255,255,0.95)'); w.addColorStop(0.35, 'rgba(255,255,255,0.35)'); w.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = w; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
    pathPts(g, shapePts('round'), x, y, r); g.lineWidth = Math.max(1, r * 0.085); g.strokeStyle = '#2a2040'; g.stroke();
    sparkle(g, x - r * 0.32, y - r * 0.36, r * (0.32 + 0.1 * Math.sin(t * 5)), '#ffffff', 0.95);
  }
  function sparkle(g, x, y, s, c, a) {
    g.save(); g.globalAlpha *= a; g.fillStyle = c; g.beginPath();
    g.moveTo(x, y - s); g.quadraticCurveTo(x, y, x + s, y); g.quadraticCurveTo(x, y, x, y + s); g.quadraticCurveTo(x, y, x - s, y); g.quadraticCurveTo(x, y, x, y - s); g.fill(); g.restore();
  }
  /* special marks on top of a gem: Row / Column shards get two light bands and outward chevrons, a Blast gem a gold
     setting with four studs and a pulsing halo */
  function paintSpecial(g, def, sp, x, y, r, t) {
    var col = def.colors || ['#222', '#888', '#ddd', '#fff'];
    if (sp === 'h' || sp === 'v') {
      var horiz = sp === 'h', pts = shapePts(def.shape);
      g.save(); pathPts(g, pts, x, y, r * 0.96); g.clip();
      var sh = 0.5 + 0.5 * Math.sin(t * 6);
      for (var k = -1; k <= 1; k += 2) {
        var off = k * r * 0.26, gr = horiz ? g.createLinearGradient(0, y + off - r * 0.12, 0, y + off + r * 0.12) : g.createLinearGradient(x + off - r * 0.12, 0, x + off + r * 0.12, 0);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,' + (0.7 + 0.25 * sh) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; if (horiz) g.fillRect(x - r, y + off - r * 0.12, r * 2, r * 0.24); else g.fillRect(x + off - r * 0.12, y - r, r * 0.24, r * 2);
      }
      g.restore();
      // chevrons pointing out along the line it clears
      for (var s = -1; s <= 1; s += 2) {
        var cx = horiz ? x + s * r * 1.02 : x, cy = horiz ? y : y + s * r * 1.02, d = r * 0.26;
        g.beginPath();
        if (horiz) { g.moveTo(cx + s * d, cy); g.lineTo(cx - s * d * 0.3, cy - d); g.lineTo(cx - s * d * 0.3, cy + d); }
        else { g.moveTo(cx, cy + s * d); g.lineTo(cx - d, cy - s * d * 0.3); g.lineTo(cx + d, cy - s * d * 0.3); }
        g.closePath(); g.fillStyle = '#fffbe8'; g.fill(); g.lineWidth = Math.max(1, r * 0.06); g.strokeStyle = mix(col[0], '#000000', 0.3); g.stroke();
      }
    } else if (sp === 'bomb') {
      var p = 0.5 + 0.5 * Math.sin(t * 4.5);
      g.save(); g.globalCompositeOperation = 'source-over';
      g.beginPath(); g.arc(x, y, r * 1.0, 0, TAU); g.lineWidth = r * 0.16; g.strokeStyle = '#3a2208'; g.stroke();
      var ring = g.createLinearGradient(x - r, y - r, x + r, y + r); ring.addColorStop(0, '#fff0b0'); ring.addColorStop(0.4, '#e8b03a'); ring.addColorStop(1, '#8a5a12');
      g.beginPath(); g.arc(x, y, r * 1.0, 0, TAU); g.lineWidth = r * 0.1; g.strokeStyle = ring; g.stroke();
      for (var q = 0; q < 4; q++) { var a = Math.PI / 4 + q * Math.PI / 2, sx = x + Math.cos(a) * r, sy = y + Math.sin(a) * r; g.beginPath(); g.arc(sx, sy, r * 0.13, 0, TAU); g.fillStyle = '#f2c85a'; g.fill(); g.lineWidth = Math.max(1, r * 0.05); g.strokeStyle = '#4a2a08'; g.stroke(); g.beginPath(); g.arc(sx - r * 0.04, sy - r * 0.04, r * 0.05, 0, TAU); g.fillStyle = '#fff6d0'; g.fill(); }
      g.restore();
      g.save(); g.globalAlpha *= 0.35 + 0.35 * p; sparkle(g, x + r * 0.1, y - r * 0.05, r * 0.42, '#fffbe8', 1); g.restore();
    }
  }
  function haloSpecial(g, def, sp, x, y, r, t) {
    var col = (def && def.colors) || ['#222', '#888', '#ddd', '#fff'], p = 0.5 + 0.5 * Math.sin(t * 4.5), c = sp === 'prism' ? '#ffffff' : col[2];
    var gr = g.createRadialGradient(x, y, r * 0.5, x, y, r * 1.45); gr.addColorStop(0, rgba(c, 0.35 + 0.2 * p)); gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 1.45, 0, TAU); g.fill();
  }

  /* gem sprites are cached per (gem, special, device px); the tray is cached per layout */
  function GemCache() { this.c = {}; this.n = 0; }
  GemCache.prototype.get = function (key, w, paint) {
    var e = this.c[key]; if (e) return e;
    if (this.n > 160) { this.c = {}; this.n = 0; }
    var cv = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(w, w) : (function () { var k = document.createElement('canvas'); k.width = w; k.height = w; return k; })();
    var q = cv.getContext('2d'); paint(q); this.c[key] = cv; this.n++; return cv;
  };

  /* a fallback actor (used only when the host gives no drawActor): a shaded cloaked figure or a round creature */
  function paintFallbackActor(g, a) {
    var x = a.x, y = a.footY, h = a.h, f = a.facing === 'left' ? -1 : 1, col = a.kind === 'hero' ? ['#2a3a5a', '#4a6a9a', '#9ab8e8'] : ['#3a1a1a', '#8a3a2a', '#e08a6a'];
    g.save(); g.globalAlpha *= a.alpha == null ? 1 : a.alpha;
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(x, y, h * 0.24, h * 0.05, 0, 0, TAU); g.fill();
    var gr = g.createLinearGradient(x - h * 0.2, y - h, x + h * 0.25, y); gr.addColorStop(0, col[2]); gr.addColorStop(0.5, col[1]); gr.addColorStop(1, col[0]);
    g.fillStyle = gr; g.beginPath(); g.moveTo(x - h * 0.2, y); g.quadraticCurveTo(x - h * 0.24, y - h * 0.6, x, y - h * 0.72); g.quadraticCurveTo(x + h * 0.24, y - h * 0.6, x + h * 0.2, y); g.closePath(); g.fill();
    g.beginPath(); g.arc(x, y - h * 0.8, h * 0.15, 0, TAU); g.fill(); g.lineWidth = Math.max(1, h * 0.02); g.strokeStyle = col[0]; g.stroke();
    g.fillStyle = '#fff6d0'; g.beginPath(); g.arc(x + f * h * 0.07, y - h * 0.82, h * 0.025, 0, TAU); g.fill();
    if (a.flash) { g.globalAlpha *= a.flash; g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y - h * 0.5, h * 0.3, 0, TAU); g.fill(); }
    g.restore();
  }

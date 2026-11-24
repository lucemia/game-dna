
  /* ------------------------------------------------------------------ drawing ------------------------------------------------------------------ */
  var COLS = ['#f2f0d8', '#7fe8ff', '#ffcf6a', '#9fffcf', '#ff9a50', '#fff0b8', '#ff6b7d'];
  function mkCanvas(w, h) {
    if (typeof document === 'undefined') return null;
    var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c;
  }
  function devScale(ctx) { try { var T = ctx.getTransform(); return Math.sqrt(Math.abs(T.a * T.d - T.b * T.c)) || 1; } catch (e) { return 1; } }
  function shade(hex, k) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return hex;
    var v = parseInt(m[1], 16), r = v >> 16 & 255, g = v >> 8 & 255, b = v & 255;
    if (k < 0) { r *= 1 + k; g *= 1 + k; b *= 1 + k; } else { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }
  function rrect(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  /* built-in painter: used when the host gives no paintActor / drawActor (a plain creature, readable at any size, origin at the feet) */
  function builtinPaint(g, look, x, y, o, pal) {
    var h = o.h, f = o.facing === 'left' ? -1 : 1, body = (pal && pal.body) || (look === 'hero' ? '#4c78c8' : '#7c9a5a'), eye = (pal && pal.eye) || '#ffffff';
    g.save(); g.translate(x, y); g.scale(f, 1);
    if (look === 'hero') {
      var cg = g.createLinearGradient(-h * 0.3, -h, h * 0.3, 0); cg.addColorStop(0, '#2c3f78'); cg.addColorStop(1, '#16203f');
      g.fillStyle = cg; g.beginPath(); g.moveTo(-h * 0.2, -h * 0.72); g.quadraticCurveTo(-h * 0.42, -h * 0.2, -h * 0.3, 0); g.lineTo(h * 0.14, 0); g.quadraticCurveTo(h * 0.1, -h * 0.4, h * 0.12, -h * 0.72); g.closePath(); g.fill();
      g.fillStyle = '#c9cfdc'; rrect(g, -h * 0.17, -h * 0.74, h * 0.34, h * 0.5, h * 0.08); g.fill();
      g.fillStyle = '#e8c7a2'; g.beginPath(); g.arc(0, -h * 0.82, h * 0.15, 0, TAU); g.fill();
      g.fillStyle = '#5a3a26'; g.beginPath(); g.arc(-h * 0.02, -h * 0.88, h * 0.15, Math.PI * 0.95, Math.PI * 2.05); g.fill();
      g.fillStyle = '#1b1b24'; g.fillRect(h * 0.06, -h * 0.84, h * 0.04, h * 0.05);
      g.strokeStyle = '#e9f2ff'; g.lineWidth = h * 0.06; g.lineCap = 'round'; g.beginPath(); g.moveTo(h * 0.16, -h * 0.4); g.lineTo(h * 0.42, -h * 0.68); g.stroke();
      g.fillStyle = '#3a2a20'; g.fillRect(-h * 0.14, -h * 0.06, h * 0.11, h * 0.06); g.fillRect(h * 0.02, -h * 0.06, h * 0.11, h * 0.06);
    } else {
      var w = h * 0.62, bg = g.createRadialGradient(-w * 0.25, -h * 0.65, h * 0.05, 0, -h * 0.4, h * 0.6);
      bg.addColorStop(0, shade(body, 0.35)); bg.addColorStop(0.6, body); bg.addColorStop(1, shade(body, -0.45));
      g.fillStyle = shade(body, -0.6); g.beginPath(); g.ellipse(0, -h * 0.42, w * 0.55, h * 0.45, 0, 0, TAU); g.fill();
      g.fillStyle = bg; g.beginPath(); g.ellipse(0, -h * 0.43, w * 0.52, h * 0.42, 0, 0, TAU); g.fill();
      g.fillStyle = eye; g.beginPath(); g.ellipse(w * 0.12, -h * 0.55, h * 0.07, h * 0.09, 0, 0, TAU); g.ellipse(w * 0.34, -h * 0.55, h * 0.06, h * 0.085, 0, 0, TAU); g.fill();
      g.fillStyle = '#141018'; g.beginPath(); g.arc(w * 0.15, -h * 0.54, h * 0.035, 0, TAU); g.arc(w * 0.36, -h * 0.54, h * 0.03, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(-w * 0.2, -h * 0.68, w * 0.14, h * 0.07, -0.5, 0, TAU); g.fill();
    }
    g.restore();
    return true;
  }

  function Painter(sim, opt) { this.S = sim; this.opt = opt; this.cache = {}; this.ncache = 0; this.order = new Int32Array(sim.cap + 8); this.key = new Float32Array(sim.cap + 8); this.shadowC = null; this.glow = {}; this.ground = null; this.font = 'system-ui, "Segoe UI", Roboto, sans-serif'; this.title = 'Georgia, "Times New Roman", serif'; }
  var PP = Painter.prototype;

  /* one static pose of a look, facing a side, h px tall, at device scale s: painted once by the host, then reused */
  PP.sprite = function (look, facing, h, s, frame, outline) {
    var hb = Math.max(4, Math.round(h)), sb = Math.round(s * 4) / 4 || 1, fr = frame == null || frame < 0 ? -1 : frame | 0, key = look + '|' + facing + '|' + hb + '|' + sb + '|' + fr + (outline ? '|o' : ''), c = this.cache[key];
    if (c) return c;
    if (this.ncache > 400) { this.cache = {}; this.ncache = 0; }
    var W = hb * 2.6 * sb, Hh = hb * 1.5 * sb, can = mkCanvas(W, Hh); if (!can) return null;
    var g = can.getContext('2d'), fx = W / 2, fy = hb * 1.32 * sb;
    g.setTransform(sb, 0, 0, sb, 0, 0); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    var pal = this.palOf(look), ok = false, o = { h: hb, facing: facing }; if (fr >= 0) o.frame = fr;
    if (this.opt.paintActor) ok = safe(this.opt.paintActor, g, look, fx / sb, fy / sb, o) === true;
    if (!ok) builtinPaint(g, look, fx / sb, fy / sb, o, pal);
    if (outline) {   // a dark rim around the silhouette (the hero reads inside any crowd)
      var sil = mkCanvas(W, Hh), q0 = sil.getContext('2d'); q0.drawImage(can, 0, 0); q0.globalCompositeOperation = 'source-atop'; q0.fillStyle = '#0b0a14'; q0.fillRect(0, 0, W, Hh);
      var ol = mkCanvas(W, Hh), q1 = ol.getContext('2d'), rr = Math.max(1.2, 1.1 * sb);
      for (var a = 0; a < 8; a++) q1.drawImage(sil, Math.cos(a * TAU / 8) * rr, Math.sin(a * TAU / 8) * rr);
      q1.drawImage(can, 0, 0); can = ol;
    }
    var fl = mkCanvas(W, Hh), q = fl.getContext('2d'); q.drawImage(can, 0, 0); q.globalCompositeOperation = 'source-atop'; q.fillStyle = '#ffffff'; q.fillRect(0, 0, W, Hh);
    c = this.cache[key] = { c: can, flash: fl, fx: fx, fy: fy, s: sb, h: hb };
    this.ncache++;
    return c;
  };
  PP.palOf = function (look) { var L = this.S.lib.enemies, k; for (k in L) if (L[k].look === look) return L[k].palette; return null; };
  PP.shadow = function () {
    if (this.shadowC) return this.shadowC;
    var c = mkCanvas(64, 32); if (!c) return null; var g = c.getContext('2d'), rg = g.createRadialGradient(32, 16, 0, 32, 16, 32);
    rg.addColorStop(0, 'rgba(8,10,6,0.55)'); rg.addColorStop(0.55, 'rgba(8,10,6,0.32)'); rg.addColorStop(1, 'rgba(8,10,6,0)');
    g.setTransform(1, 0, 0, 0.5, 0, 0); g.fillStyle = rg; g.beginPath(); g.arc(32, 32, 32, 0, TAU); g.fill();
    return (this.shadowC = c);
  };
  PP.glowSprite = function (color) {
    var c = this.glow[color]; if (c) return c;
    c = mkCanvas(64, 64); if (!c) return null; var g = c.getContext('2d'), rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,0.95)'); rg.addColorStop(0.18, color); rg.addColorStop(0.5, shade(color, -0.2).replace('rgb', 'rgba').replace(')', ',0.35)')); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64); return (this.glow[color] = c);
  };

  /* ---------- the built-in ground: a painted meadow, one cached seamless tile + hashed decals ---------- */
  PP.groundTile = function (s) {
    var sb = Math.min(3, s || 1);   // device scale: the tile is copied 1:1 (1 px overlap), never resampled
    if (this.ground && Math.abs(this.ground.s - sb) < 1e-3) return this.ground;
    var T = 384, c = mkCanvas(Math.ceil(T * sb) + 1, Math.ceil(T * sb) + 1); if (!c) return null;
    var g = c.getContext('2d'), r = mulberry(77), i, x, y, k, pal = this.opt.groundPalette || {};
    g.setTransform(sb, 0, 0, sb, 0, 0);
    g.fillStyle = pal.base || '#3d5a2c'; g.fillRect(0, 0, T + 2, T + 2);
    function blot(cx, cy, rad, col) { for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++) { var gx = cx + ox * T, gy = cy + oy * T; if (gx + rad < 0 || gx - rad > T + 2 || gy + rad < 0 || gy - rad > T + 2) continue; var rg = g.createRadialGradient(gx, gy, 0, gx, gy, rad); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(gx - rad, gy - rad, rad * 2, rad * 2); } }
    for (i = 0; i < 26; i++) blot(r() * T, r() * T, 40 + r() * 90, r() < 0.5 ? (pal.light || 'rgba(120,150,70,0.30)') : (pal.dark || 'rgba(20,40,20,0.32)'));
    for (i = 0; i < 7; i++) blot(r() * T, r() * T, 22 + r() * 40, pal.dirt || 'rgba(110,86,52,0.38)');
    g.lineCap = 'round';
    for (i = 0; i < 340; i++) {   // grass tufts: 3-5 curved blades from one root, darker base, lit tips (wrapped at the edges)
      x = 8 + r() * (T - 16); y = 10 + r() * (T - 18); k = r(); var nb = 3 + ((r() * 3) | 0), len = 3 + r() * 4;
      g.fillStyle = 'rgba(18,34,16,0.35)'; g.beginPath(); g.ellipse(x, y + 0.5, 2.6, 1, 0, 0, TAU); g.fill();
      for (var bl = 0; bl < nb; bl++) {
        var lean = (bl - (nb - 1) / 2) * 1.3 + (r() - 0.5), ln = len * (0.7 + r() * 0.5);
        g.strokeStyle = k < 0.5 ? (pal.blade1 || 'rgba(34,62,28,0.6)') : k < 0.88 ? (pal.blade2 || 'rgba(96,134,58,0.6)') : (pal.blade3 || 'rgba(150,176,88,0.55)');
        g.lineWidth = 0.9; g.beginPath(); g.moveTo(x + lean * 0.2, y); g.quadraticCurveTo(x + lean * 0.4, y - ln * 0.6, x + lean, y - ln); g.stroke();
      }
    }
    for (i = 0; i < 60; i++) {   // small flowers and pebbles
      x = 6 + r() * (T - 12); y = 6 + r() * (T - 12); k = r();
      if (k < 0.55) { var fc = ['#f3e9b5', '#e9a8c8', '#b8d3ff', '#ffd27a'][(r() * 4) | 0]; g.fillStyle = 'rgba(20,30,15,0.35)'; g.beginPath(); g.arc(x + 0.6, y + 0.8, 1.9, 0, TAU); g.fill(); g.fillStyle = fc; for (var p = 0; p < 5; p++) { g.beginPath(); g.arc(x + Math.cos(p * 1.256) * 1.3, y + Math.sin(p * 1.256) * 1.3, 0.95, 0, TAU); g.fill(); } g.fillStyle = '#f7d35a'; g.beginPath(); g.arc(x, y, 0.7, 0, TAU); g.fill(); }
      else { var pr = 1.5 + r() * 2.2; g.fillStyle = 'rgba(15,20,12,0.4)'; g.beginPath(); g.ellipse(x + 0.8, y + 1, pr, pr * 0.7, 0, 0, TAU); g.fill(); var pg = g.createLinearGradient(x - pr, y - pr, x + pr, y + pr); pg.addColorStop(0, '#b9b4a2'); pg.addColorStop(1, '#6d6a5e'); g.fillStyle = pg; g.beginPath(); g.ellipse(x, y, pr, pr * 0.72, 0, 0, TAU); g.fill(); }
    }
    return (this.ground = { c: c, s: sb, T: T });
  };
  /* flat decals on a 256 px world grid, chosen by hash: flagstone patches, moss rocks, mushroom rings, dirt scars */
  PP.decal = function (g, kind, x, y, r) {
    var i, a;
    if (kind === 0) {   // old flagstones: irregular slabs with a lit top edge, moss in the cracks
      for (i = 0; i < 7; i++) { a = i * 0.9 + r; var sx = x + Math.cos(a) * (8 + i * 4), sy = y + Math.sin(a) * (5 + i * 2.5), w = 12 + (i % 3) * 3, h = 7 + (i % 2) * 2, j1 = Math.sin(i * 7.1 + r) * 1.6, j2 = Math.cos(i * 3.3 + r) * 1.4;
        g.fillStyle = 'rgba(10,14,8,0.5)'; g.beginPath(); g.moveTo(sx - w / 2 + 1, sy - h / 2 + 2 + j1); g.lineTo(sx + w / 2 + 1, sy - h / 2 + 2); g.lineTo(sx + w / 2 + 1 + j2, sy + h / 2 + 2); g.lineTo(sx - w / 2 + 1, sy + h / 2 + 2 - j2); g.closePath(); g.fill();
        var sg = g.createLinearGradient(sx, sy - h / 2, sx, sy + h / 2); sg.addColorStop(0, '#b4ae96'); sg.addColorStop(0.5, '#8d8873'); sg.addColorStop(1, '#666251'); g.fillStyle = sg;
        g.beginPath(); g.moveTo(sx - w / 2, sy - h / 2 + j1); g.lineTo(sx + w / 2, sy - h / 2); g.lineTo(sx + w / 2 + j2, sy + h / 2); g.lineTo(sx - w / 2, sy + h / 2 - j2); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(230,224,200,0.45)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(sx - w / 2 + 0.5, sy - h / 2 + j1 + 0.6); g.lineTo(sx + w / 2 - 0.5, sy - h / 2 + 0.6); g.stroke();
        g.strokeStyle = 'rgba(40,36,28,0.55)'; g.beginPath(); g.moveTo(sx - w * 0.1, sy - h * 0.3); g.lineTo(sx + w * 0.05, sy + h * 0.1); g.lineTo(sx + w * 0.2, sy + h * 0.25); g.stroke();
        g.fillStyle = 'rgba(96,140,60,0.7)'; g.beginPath(); g.ellipse(sx - w * 0.3, sy + h * 0.32, w * 0.2, h * 0.14, 0.2, 0, TAU); g.fill(); }
    } else if (kind === 1) {   // moss boulder (low)
      g.fillStyle = 'rgba(8,12,6,0.45)'; g.beginPath(); g.ellipse(x + 3, y + 5, 17, 7, 0, 0, TAU); g.fill();
      var rg = g.createRadialGradient(x - 5, y - 8, 2, x, y - 3, 18); rg.addColorStop(0, '#b2ad9a'); rg.addColorStop(0.7, '#75705f'); rg.addColorStop(1, '#4a473d'); g.fillStyle = rg;
      g.beginPath(); g.moveTo(x - 15, y + 3); g.quadraticCurveTo(x - 16, y - 10, x - 4, y - 13); g.quadraticCurveTo(x + 12, y - 14, x + 15, y - 2); g.quadraticCurveTo(x + 14, y + 5, x, y + 5); g.closePath(); g.fill();
      g.fillStyle = 'rgba(110,160,70,0.85)'; g.beginPath(); g.moveTo(x - 13, y - 5); g.quadraticCurveTo(x - 6, y - 15, x + 6, y - 12); g.quadraticCurveTo(x - 2, y - 8, x - 13, y - 5); g.fill();
    } else if (kind === 2) {   // mushroom ring
      for (i = 0; i < 9; i++) { a = i / 9 * TAU + r; var mx = x + Math.cos(a) * 20, my = y + Math.sin(a) * 12;
        g.fillStyle = 'rgba(10,14,8,0.4)'; g.beginPath(); g.ellipse(mx + 1, my + 1.5, 3.4, 1.6, 0, 0, TAU); g.fill();
        g.fillStyle = '#e8dcc0'; g.fillRect(mx - 0.8, my - 3.5, 1.6, 3.5);
        g.fillStyle = i % 3 ? '#c4583e' : '#d7a04a'; g.beginPath(); g.ellipse(mx, my - 3.6, 3.2, 2.2, 0, Math.PI, TAU); g.fill();
        g.fillStyle = 'rgba(255,240,220,0.8)'; g.fillRect(mx - 1.4, my - 5, 0.9, 0.9); }
    } else {   // dirt scar with roots
      var dg = g.createRadialGradient(x, y, 2, x, y, 30); dg.addColorStop(0, 'rgba(96,72,44,0.75)'); dg.addColorStop(1, 'rgba(96,72,44,0)'); g.fillStyle = dg; g.beginPath(); g.ellipse(x, y, 34, 18, r, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(58,40,24,0.7)'; g.lineWidth = 1.3; for (i = 0; i < 4; i++) { g.beginPath(); g.moveTo(x - 18 + i * 9, y - 4 + (i % 2) * 6); g.quadraticCurveTo(x - 10 + i * 9, y + 6, x - 2 + i * 9, y - 2); g.stroke(); }
    }
  };
  PP.drawGround = function (g, ox, oy, s) {
    var S = this.S, v = S.view;
    if (this.opt.drawGround && safe(this.opt.drawGround, g, { x: -ox + v.x, y: -oy + v.y, w: v.w, h: v.h }, v, S.t) === true) return;
    var G = this.groundTile(s); if (!G) { g.fillStyle = '#3d5a2c'; g.fillRect(v.x, v.y, v.w, v.h); return; }
    var T = G.T, wx0 = -ox + v.x, wy0 = -oy + v.y, tx0 = Math.floor(wx0 / T), ty0 = Math.floor(wy0 / T);
    for (var ty = ty0; ty * T < wy0 + v.h; ty++) for (var tx = tx0; tx * T < wx0 + v.w; tx++) {
      var X = tx * T + ox, Y = ty * T + oy;
      if (Math.abs(s - G.s) < 1e-3) { var T0g = g.getTransform(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(G.c, Math.round(T0g.e + X * T0g.a), Math.round(T0g.f + Y * T0g.d)); g.setTransform(T0g); }
      else { var x0 = Math.round(X * s) / s, x1 = Math.round((X + T) * s) / s, y0 = Math.round(Y * s) / s, y1 = Math.round((Y + T) * s) / s; g.drawImage(G.c, x0, y0, x1 - x0, y1 - y0); }
    }
    var D = 256, cx0 = Math.floor((wx0 - 40) / D), cy0 = Math.floor((wy0 - 40) / D);
    for (var cy = cy0; cy * D < wy0 + v.h + 40; cy++) for (var cx = cx0; cx * D < wx0 + v.w + 40; cx++) {
      var hsh = hashSeed(cx + ',' + cy), kind = hsh % 7; if (kind > 3 || kind === 0) continue;   // (kind 0, flat ruin slabs, retired in v1.2.0)
      this.decal(g, kind, cx * D + 40 + (hsh >>> 8) % 176 + ox, cy * D + 40 + (hsh >>> 16) % 176 + oy, (hsh >>> 4) % 100 / 16);
    }
  };

  /* ---------- the world ---------- */
  PP.drawWorld = function (g) {
    var S = this.S, v = S.view, H = S.hero, s = devScale(g), T0 = g.getTransform(), t = S.t, i;
    var sh = S.shakeA > 0 ? S.shakeA : 0, shx = sh ? Math.sin(S.frame * 1.7) * sh : 0, shy = sh ? Math.cos(S.frame * 2.3) * sh * 0.7 : 0;
    var ox = Math.round((v.x + v.w / 2 - S.cam.x + shx) * s) / s, oy = Math.round((v.y + v.h / 2 - S.cam.y + shy) * s) / s;
    this.ox = ox; this.oy = oy; this.frame = S.frame;
    g.save(); g.beginPath(); g.rect(v.x, v.y, v.w, v.h); g.clip();
    this.drawGround(g, ox, oy, s);
    /* ground layer: rings, slam telegraph, pickups, gems */
    for (i = 0; i < S.rings.length; i++) { var R = S.rings[i]; if (!R.on) continue; var k = R.t / R.dur, rx = R.r * (R.kind === 'slam' ? 1 : 0.35 + 0.65 * ease(k * 1.4)), a = (1 - k);
      g.save(); g.translate(R.x + ox, R.y + oy); g.scale(1, 0.62);
      var rg = g.createRadialGradient(0, 0, rx * 0.2, 0, 0, rx); rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(0.75, R.kind === 'slam' ? 'rgba(255,150,80,' + 0.25 * a + ')' : 'rgba(255,215,120,' + 0.22 * a + ')'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill();
      g.strokeStyle = R.kind === 'slam' ? 'rgba(255,190,120,' + a + ')' : 'rgba(255,236,170,' + a * 0.9 + ')'; g.lineWidth = (R.kind === 'slam' ? 6 : 4) * (0.4 + a); g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,' + a * 0.6 + ')'; g.lineWidth = 1.2; g.beginPath(); g.arc(0, 0, rx - 2, 0, TAU); g.stroke(); g.restore(); }
    if (S.slam && !S.slam.done) { var sk = clamp(S.slam.t / S.slam.windup, 0, 1), pul = 0.5 + 0.5 * Math.sin(S.slam.t / 60);   // danger zone: red fill that fills up, a pulsing rim, cracks
      g.save(); g.translate(S.slam.x + ox, S.slam.y + oy); g.scale(1, 0.62);
      var zg = g.createRadialGradient(0, 0, 0, 0, 0, S.slam.r); zg.addColorStop(0, 'rgba(255,60,40,' + (0.12 + 0.2 * sk) + ')'); zg.addColorStop(0.8, 'rgba(230,40,30,' + (0.28 + 0.25 * sk) + ')'); zg.addColorStop(1, 'rgba(255,80,50,0.55)');
      g.fillStyle = zg; g.beginPath(); g.arc(0, 0, S.slam.r, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,120,80,' + (0.25 + 0.2 * pul) + ')'; g.beginPath(); g.arc(0, 0, S.slam.r * ease(sk), 0, TAU); g.fill();
      g.strokeStyle = 'rgba(30,6,6,0.7)'; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, S.slam.r, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(255,' + (90 + 80 * pul | 0) + ',70,1)'; g.lineWidth = 3 + 1.5 * pul; g.beginPath(); g.arc(0, 0, S.slam.r, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(60,10,8,' + (0.3 + 0.4 * sk) + ')'; g.lineWidth = 2; for (var cr = 0; cr < 7; cr++) { var ca = cr * 0.9 + 0.4; g.beginPath(); g.moveTo(Math.cos(ca) * 14, Math.sin(ca) * 14); g.lineTo(Math.cos(ca + 0.2) * S.slam.r * 0.55 * sk, Math.sin(ca + 0.2) * S.slam.r * 0.55 * sk); g.lineTo(Math.cos(ca - 0.1) * S.slam.r * 0.9 * sk, Math.sin(ca - 0.1) * S.slam.r * 0.9 * sk); g.stroke(); }
      g.restore(); }
    for (i = 0; i < S.pickups.length; i++) this.potion(g, S.pickups[i].x + ox, S.pickups[i].y + oy, S.pickups[i].t);
    var vx0 = v.x - ox - 20, vx1 = v.x + v.w - ox + 20, vy0 = v.y - oy - 20, vy1 = v.y + v.h - oy + 20;
    for (i = 0; i < S.ng; i++) { var gx = S.gx[i], gy = S.gy[i]; if (gx < vx0 || gx > vx1 || gy < vy0 || gy > vy1) continue; this.gem(g, gx + ox, gy + oy, S.gv[i], t + i * 97); }
    /* actors: visible enemies + hero, y-sorted */
    var n = 0, ord = this.order, key = this.key, mx = 60, my0 = 20, my1 = 120;
    for (i = 0; i < S.n; i++) { if (S.edead[i]) continue; var ex = S.ex[i], ey = S.ey[i]; if (ex < vx0 - mx || ex > vx1 + mx || ey < vy0 - my0 || ey > vy1 + my1) continue; ord[n] = i; key[n] = ey; n++; }
    ord[n] = -1; key[n] = H.y; n++;
    this.sortN(n);
    this.drawn = n;
    var sc = this.shadow();
    g.globalAlpha = 1;
    if (sc) for (i = 0; i < n; i++) { var j = ord[i], ax = j < 0 ? H.x : S.ex[j], ay = j < 0 ? H.y : S.ey[j], d = j < 0 ? null : S.kindDefs[S.ek[j]], hh = j < 0 ? 44 : d.h, sw = hh * (d && d.boss ? 0.95 : d && d.gait === 'hop' ? 1.1 : 0.7);
      g.drawImage(sc, ax + ox - sw / 2, ay + oy - sw * 0.17, sw, sw * 0.34 * (d && d.hover ? 0.8 : 1)); }
    for (i = 0; i < S.corpses.length; i++) if (S.corpses[i].on) this.corpse(g, S.corpses[i], ox, oy, s, T0);
    for (i = 0; i < n; i++) { var jj = ord[i]; if (jj >= 0) this.enemy(g, jj, ox, oy, s, T0); }
    g.setTransform(T0);
    if (S.phase !== 'lost' && S.phase !== 'idle') {   // hero marker after the foes: a gold ring at the feet, then the hero on top of everything
      g.save(); g.translate(H.x + ox, H.y + oy + 1); g.scale(1, 0.42);
      g.strokeStyle = 'rgba(10,8,20,0.6)'; g.lineWidth = 4.5; g.beginPath(); g.arc(0, 0, 18, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(255,214,120,0.95)'; g.lineWidth = 2.2; g.beginPath(); g.arc(0, 0, 18, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(255,250,220,0.8)'; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, 18, -2.5, -0.65); g.stroke(); g.restore();
    }
    if (S.phase !== 'idle') this.hero(g, ox, oy, s, T0);   // before start() the field is a backdrop (title screens)
    g.setTransform(T0);
    /* weapons and shots */
    this.blades(g, ox, oy);
    this.projectiles(g, ox, oy);
    this.particles(g, ox, oy);
    this.heroBar(g, ox, oy);
    if (S.P.numbers !== 'off') this.numbers(g, ox, oy);
    if (S.hurtT > 0 && S.P.reduced !== 'on') { var vg = g.createRadialGradient(v.x + v.w / 2, v.y + v.h / 2, v.h * 0.35, v.x + v.w / 2, v.y + v.h / 2, v.w * 0.62); vg.addColorStop(0, 'rgba(160,0,0,0)'); vg.addColorStop(1, 'rgba(170,10,10,' + 0.38 * S.hurtT / 260 + ')'); g.fillStyle = vg; g.fillRect(v.x, v.y, v.w, v.h); }
    g.restore();
  };
  PP.sortN = function (n) {   // insertion sort: the order is nearly the same frame to frame
    var ord = this.order, key = this.key, prev = this._prev, i, j;
    for (i = 1; i < n; i++) { var k = key[i], o = ord[i]; j = i - 1; while (j >= 0 && key[j] > k) { key[j + 1] = key[j]; ord[j + 1] = ord[j]; j--; } key[j + 1] = k; ord[j + 1] = o; }
  };
  /* draw one cached actor: feet at (X, Y) in logical px; waddle rot, hop and squash from the walk phase */
  PP.blit = function (g, look, face, h, X, Y, s, T0, pose, flash, alpha, trace, frame, outline) {
    var sp = this.sprite(look, face < 0 ? 'left' : 'right', h, s, frame, outline); if (!sp) return;
    var rot = pose.rot || 0, sx = pose.sx || 1, sy = pose.sy || 1, c = Math.cos(rot), sn = Math.sin(rot), k = s / sp.s;
    var e = T0.e + X * T0.a, f = T0.f + Y * T0.d;
    g.setTransform(c * sx * k, sn * sx * k, -sn * sy * k, c * sy * k, Math.round(e), Math.round(f));
    if (alpha < 1) g.globalAlpha = alpha;
    g.drawImage(sp.c, -sp.fx, -sp.fy);
    if (flash > 0) { g.globalAlpha = alpha * flash; g.drawImage(sp.flash, -sp.fx, -sp.fy); }
    if (alpha < 1 || flash > 0) g.globalAlpha = 1;
    if (trace && root.__spriteTrace && this.opt.traceDraw) safe(this.opt.traceDraw, look, X, Y + (pose.lift || 0), h, face < 0 ? 'left' : 'right');
  };
  PP.walkPose = function (ph, moving, hover, t, seed, heavy) {   // the fallback for single-pose walkers: a small waddle
    var P = this._pose || (this._pose = {});
    var a = Math.sin(ph * Math.PI), hop = Math.abs(a);
    P.rot = moving ? a * (heavy ? 0.035 : 0.06) : Math.sin(t / 900 + seed) * 0.015;
    P.lift = hover ? 0 : (moving ? hop * (heavy ? 1.2 : 2) : 0);
    P.sy = 1 + (moving ? (hop - 0.5) * 0.05 : Math.sin(t / 520 + seed) * 0.018); P.sx = 2 - P.sy;
    return P;
  };
  /* motion by gait, all derived from game time, the walk phase and the foe's own numbers (so frozen stills equal play):
     hop (blobs jump with squash and stretch), fly (wing beat bob and stretch, tilt into the flight), float (slow drift and bob),
     glide (robes: sway and a soft bob, no steps), stomp (the boss: a heavy rise, lean and slam per footfall) */
  PP.gaitPose = function (i, d) {
    var S = this.S, P = this._pose || (this._pose = {}), t = S.t, sd = (S.euid[i] % 97) / 97, vx = S.evx[i], spd = Math.abs(vx) + Math.abs(S.evy[i]), g = d.gait;
    P.rot = 0; P.sx = 1; P.sy = 1; P.lift = 0;
    if (g === 'hop') {
      var hk = t / 640 + sd; hk -= Math.floor(hk); var air = Math.sin(Math.PI * hk);
      P.lift = air * d.h * 0.32;
      if (hk < 0.1) { P.sy = 0.8 + hk * 2; } else if (hk > 0.9) { P.sy = 0.8 + (1 - hk) * 2; } else P.sy = 1 + air * 0.12;
      P.sx = 1 / Math.sqrt(P.sy); P.rot = clamp(vx / (d.speed || 40), -1, 1) * 0.08 * air;
    } else if (g === 'fly') {
      var w = Math.sin(t / 85 + sd * 40);
      P.sy = 1 + w * 0.07; P.sx = 1 - w * 0.03; P.lift = (w * 0.5 + 0.5) * d.h * 0.06; P.rot = clamp(vx / (d.speed || 60), -1, 1) * 0.14;
    } else if (g === 'float') {
      P.lift = Math.sin(t / 460 + sd * 30) * d.h * 0.05; P.sy = 1 + Math.sin(t / 300 + sd * 20) * 0.04; P.sx = 2 - P.sy; P.rot = clamp(vx / 50, -1, 1) * 0.1;
    } else if (g === 'glide') {
      P.rot = Math.sin(t / 520 + sd * 20) * 0.03 + clamp(vx / 60, -1, 1) * 0.04; P.lift = Math.sin(t / 380 + sd * 20) * 1.2 + 1; P.sy = 1 + Math.sin(t / 380 + sd * 20) * 0.015; P.sx = 2 - P.sy;
    } else if (g === 'stomp') {
      var ph = S.eph[i], k = ph - Math.floor(ph), side = Math.floor(ph) % 2 ? 1 : -1, moving = spd > 4;
      if (moving) { P.lift = Math.sin(Math.PI * k) * 5; P.rot = side * 0.05 * Math.sin(Math.PI * k); P.sy = k < 0.12 ? 0.94 + k * 0.5 : 1; P.sx = 2 - P.sy; }
      else { P.sy = 1 + Math.sin(t / 900) * 0.01; P.sx = 2 - P.sy; }
    } else return this.walkPose(S.eph[i], spd > 6, d.hover, t, S.euid[i] * 0.37, d.boss);
    return P;
  };
  PP.enemy = function (g, i, ox, oy, s, T0) {
    var S = this.S, H = S.hero, d = S.kindDefs[S.ek[i]], P = this.gaitPose(i, d);
    var lift = (d.hover ? d.hover * d.h : 0) + P.lift;
    if (d.boss && S.slam && !S.slam.done) { var k = S.slam.t / S.slam.windup; P.sy = 1 + 0.08 * Math.sin(k * Math.PI * 0.5) - (k > 0.85 ? 0.14 : 0); P.sx = 2 - P.sy; P.rot = 0; lift = k > 0.85 ? 0 : k * 12; }
    P.lift = lift;
    var fl = 0; if (S.eflash[i] > 0) { var near = Math.abs(S.ex[i] - H.x) < 46 && Math.abs(S.ey[i] - H.y) < 40; fl = d.boss ? 0.3 * S.eflash[i] / 110 : near ? 0.3 : 0.8; }
    this.blit(g, d.look, S.eface[i], d.h, S.ex[i] + ox, S.ey[i] + oy - lift, s, T0, P, fl, 1, true);
    if (d.elite && !d.boss) { g.setTransform(T0); this.eliteMark(g, S.ex[i] + ox, S.ey[i] + oy - d.h - lift - 6, S.t); }
  };
  PP.hero = function (g, ox, oy, s, T0) {
    var S = this.S, H = S.hero, moving = Math.abs(H.vx) + Math.abs(H.vy) > 8, HF = this.opt.heroFrames, P, frame = -1, hh = num(this.opt.heroH, 44);
    if (HF && HF.n > 1) {   // a walk sheet: frame 0 idle, 1..n-1 the cycle, advanced by distance walked (one stride = two frames)
      P = this._hp || (this._hp = {}); P.rot = 0; P.sx = 1; P.sy = 1; P.lift = 0;
      frame = moving ? 1 + Math.floor((H.dist || 0) / (hh * num(HF.stride, 0.6) / 2)) % (HF.n - 1) : 0;
      if (!moving) { P.sy = 1 + Math.sin(S.t / 520) * 0.012; P.sx = 2 - P.sy; }
    } else P = this.walkPose(H.phase, moving, 0, S.t, 0.3, false);
    var flash = S.hurtT > 160 ? 0.6 : 0;
    if (S.phase === 'lost') { var k = clamp(S.endT / 700, 0, 1); P.rot = -1.2 * ease(k) * H.face; P.lift = 0; }
    else if (H.iframes > 0 && Math.floor(H.iframes / 90) % 2) flash = Math.max(flash, 0.45);   // invulnerable: a blink, never see-through
    this.blit(g, 'hero', H.face, hh, H.x + ox, H.y + oy - P.lift, s, T0, P, flash, 1, true, frame, true);
  };
  PP.corpse = function (g, c, ox, oy, s, T0) {
    var k = c.t / c.dur, P = this._cp || (this._cp = {});
    P.rot = (c.boss ? 0.3 : 0.5) * ease(k) * -c.face; P.sx = 1 + 0.15 * k; P.sy = 1 - 0.35 * ease(k); P.lift = 0;
    this.blit(g, c.look, c.face, c.h, c.x + ox, c.y + oy - c.hover * c.h * (1 - k), s, T0, P, k < 0.25 ? 0.9 - k * 2 : 0, 1 - ease(k), false);
  };
  PP.eliteMark = function (g, x, y, t) {
    g.save(); g.translate(x, y + Math.sin(t / 300) * 1.5);
    g.fillStyle = 'rgba(20,10,8,0.7)'; g.beginPath(); g.moveTo(0, 5); g.lineTo(-5, -2); g.lineTo(5, -2); g.closePath(); g.fill();
    g.fillStyle = '#ffcf5a'; g.beginPath(); g.moveTo(0, 3.6); g.lineTo(-3.6, -1.6); g.lineTo(3.6, -1.6); g.closePath(); g.fill();
    g.restore();
  };
  PP.gem = function (g, x, y, v, t) {
    var col = v >= 10 ? ['#ffe27a', '#b87a10'] : v >= 5 ? ['#e3a7ff', '#7a35b8'] : v >= 2 ? ['#a8ffb8', '#2f9e55'] : ['#a8e6ff', '#2f74c9'], sz = v >= 10 ? 6 : v >= 5 ? 5.2 : v >= 2 ? 4.4 : 3.8;
    var b = Math.sin(t / 260) * 1.4;
    g.fillStyle = 'rgba(6,10,6,0.35)'; g.beginPath(); g.ellipse(x, y + 1.5, sz * 0.8, sz * 0.3, 0, 0, TAU); g.fill();
    y -= 4 + b;
    var gg = g.createLinearGradient(x - sz, y - sz * 1.3, x + sz, y + sz * 1.3); gg.addColorStop(0, col[0]); gg.addColorStop(1, col[1]);
    g.fillStyle = gg; g.beginPath(); g.moveTo(x, y - sz * 1.35); g.lineTo(x + sz, y); g.lineTo(x, y + sz * 1.35); g.lineTo(x - sz, y); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(10,16,30,0.75)'; g.lineWidth = 0.8; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.moveTo(x, y - sz * 1.2); g.lineTo(x + sz * 0.5, y - sz * 0.1); g.lineTo(x, y); g.closePath(); g.fill();
    if ((t / 700 | 0) % 5 === 0) { var k = (t % 700) / 700; g.fillStyle = 'rgba(255,255,255,' + (1 - k) + ')'; g.fillRect(x - 0.5 + sz * 0.4, y - sz - 2 - k * 3, 1, 3); g.fillRect(x - 1.5 + sz * 0.4, y - sz - 1 - k * 3, 3, 1); }
  };
  PP.potion = function (g, x, y, t) {
    var b = Math.sin(t / 300) * 1.5;
    g.fillStyle = 'rgba(6,10,6,0.4)'; g.beginPath(); g.ellipse(x, y + 1, 7, 2.6, 0, 0, TAU); g.fill();
    y -= 6 + b;
    var gl = this.glowSprite('#ff6b7d'); if (gl) { g.globalAlpha = 0.35 + 0.15 * Math.sin(t / 200); g.drawImage(gl, x - 14, y - 16, 28, 28); g.globalAlpha = 1; }
    g.fillStyle = '#2a1414'; g.beginPath(); g.arc(x, y, 6.4, 0, TAU); g.fill(); g.fillRect(x - 2.6, y - 10, 5.2, 6);
    var pg = g.createRadialGradient(x - 2, y - 2, 0.5, x, y, 6); pg.addColorStop(0, '#ffb3b8'); pg.addColorStop(0.5, '#e0304a'); pg.addColorStop(1, '#7a1022');
    g.fillStyle = pg; g.beginPath(); g.arc(x, y, 5.2, 0, TAU); g.fill();
    g.fillStyle = '#d9c7a0'; g.fillRect(x - 1.8, y - 9.5, 3.6, 4.6); g.fillStyle = '#8a5a30'; g.fillRect(x - 2.2, y - 11, 4.4, 2);
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(x - 2, y - 2.4, 1.3, 2, -0.5, 0, TAU); g.fill();
  };
  PP.blades = function (g, ox, oy) {
    var S = this.S, H = S.hero, ar = 1 + H.mods.reach; if (S.phase !== 'play') return;
    for (var wi = 0; wi < H.weapons.length; wi++) {
      var w = H.weapons[wi], d = S.lib.weapons[w.id]; if (!d || d.kind !== 'orbit') continue;
      var L = S.wlv(w), rr = L.r * ar, cx = H.x + ox, cy = H.y - 12 + oy, sz = 8 * (L.size || 1) * ar;
      for (var b = 0; b < L.n; b++) {
        var a = w.ang + b * TAU / L.n;
        g.save(); g.translate(cx, cy); g.scale(1, 0.62);
        g.strokeStyle = 'rgba(200,225,255,0.22)'; g.lineWidth = sz * 0.9; g.lineCap = 'round'; g.beginPath(); g.arc(0, 0, rr, a - 0.75, a - 0.05); g.stroke();
        g.strokeStyle = 'rgba(230,242,255,0.35)'; g.lineWidth = sz * 0.35; g.beginPath(); g.arc(0, 0, rr, a - 0.4, a - 0.02); g.stroke();
        g.restore();
        var bx = cx + Math.cos(a) * rr, by = cy + Math.sin(a) * rr * 0.62, spin = S.t / 60 + b;
        g.save(); g.translate(bx, by); g.rotate(spin);
        g.fillStyle = 'rgba(10,14,30,0.55)'; g.beginPath(); g.arc(0.8, 1.2, sz, 0.3, Math.PI * 1.25); g.arc(sz * 0.35 + 0.8, 1.2 - sz * 0.25, sz * 0.72, Math.PI * 1.2, 0.35, true); g.closePath(); g.fill();
        var bg = g.createLinearGradient(-sz, -sz, sz, sz); bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.5, '#b9cdf0'); bg.addColorStop(1, '#5e78b0');
        g.fillStyle = bg; g.beginPath(); g.arc(0, 0, sz, 0.3, Math.PI * 1.25); g.arc(sz * 0.35, -sz * 0.25, sz * 0.72, Math.PI * 1.2, 0.35, true); g.closePath(); g.fill();
        g.strokeStyle = '#26324f'; g.lineWidth = 0.9; g.stroke();
        g.fillStyle = '#ffd36a'; g.beginPath(); g.arc(0, 0, sz * 0.18, 0, TAU); g.fill();
        g.restore();
      }
    }
  };
  PP.projectiles = function (g, ox, oy) {
    var S = this.S, i, gl = this.glowSprite('#7fe8ff'), gl2 = this.glowSprite('#ffe7a0');
    for (i = 0; i < S.np; i++) {
      var x = S.px[i] + ox, y = S.py[i] + oy, vx = S.pvx[i], vy = S.pvy[i], vl = Math.sqrt(vx * vx + vy * vy) || 1, ux = vx / vl, uy = vy / vl, k = S.pkind[i], sz = S.psize[i], fade = clamp(S.plife[i] / 200, 0, 1);
      if (k === 2) {   // a cultist's ember orb: dark core, hot rim, a short smoky tail
        var eg = this.glowSprite('#ff6a3c');
        for (var tq = 3; tq >= 1; tq--) { g.globalAlpha = 0.16 * (4 - tq); g.fillStyle = '#7a2a40'; g.beginPath(); g.arc(x - ux * tq * 4.5, y - uy * tq * 4.5, 4.2 * (1 - tq * 0.15), 0, TAU); g.fill(); }
        g.globalAlpha = 0.8; if (eg) g.drawImage(eg, x - 10, y - 10, 20, 20);
        g.globalAlpha = 1; g.fillStyle = '#3a0c1a'; g.beginPath(); g.arc(x, y, 3.6, 0, TAU); g.fill(); g.strokeStyle = '#ffb070'; g.lineWidth = 1.4; g.stroke();
        g.fillStyle = '#ffe2b0'; g.beginPath(); g.arc(x - 1, y - 1, 1.1, 0, TAU); g.fill();
        continue;
      }
      if (k === 1) {   // lance of light
        var L = 54 * sz;
        g.save(); g.translate(x, y); g.rotate(Math.atan2(vy, vx)); g.globalAlpha = fade;
        if (gl2) { g.globalAlpha = 0.55 * fade; g.drawImage(gl2, -L * 0.75, -12 * sz, L * 1.2, 24 * sz); g.globalAlpha = fade; }
        var lg = g.createLinearGradient(-L * 0.7, 0, L * 0.3, 0); lg.addColorStop(0, 'rgba(255,214,120,0)'); lg.addColorStop(0.6, 'rgba(255,236,170,0.9)'); lg.addColorStop(1, '#ffffff');
        g.fillStyle = lg; g.beginPath(); g.moveTo(L * 0.34, 0); g.lineTo(L * 0.1, -3.4 * sz); g.lineTo(-L * 0.7, -1.2 * sz); g.lineTo(-L * 0.7, 1.2 * sz); g.lineTo(L * 0.1, 3.4 * sz); g.closePath(); g.fill();
        g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(L * 0.3, 0); g.lineTo(0, -1.2 * sz); g.lineTo(-L * 0.4, 0); g.lineTo(0, 1.2 * sz); g.closePath(); g.fill();
        g.restore(); continue;
      }
      // seeker bolt: tail + glow + core
      for (var q = 3; q >= 1; q--) { g.globalAlpha = 0.18 * (4 - q) * fade; g.fillStyle = '#7fe8ff'; g.beginPath(); g.arc(x - ux * q * 5, y - uy * q * 5, 3.2 * sz * (1 - q * 0.18), 0, TAU); g.fill(); }
      g.globalAlpha = 0.85 * fade; if (gl) g.drawImage(gl, x - 11 * sz, y - 11 * sz, 22 * sz, 22 * sz);
      g.globalAlpha = fade; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y, 2.3 * sz, 0, TAU); g.fill();
      g.globalAlpha = 1;
    }
  };
  PP.particles = function (g, ox, oy) {
    var S = this.S, i;
    for (i = 0; i < S.fn; i++) {
      if (S.flife[i] <= 0) continue;
      var k = S.flife[i] / S.fmax[i], x = S.fx[i] + ox, y = S.fy[i] + oy - S.fz[i], sz = S.fsize[i] * (0.4 + 0.6 * k), c = S.fcol[i];
      g.globalAlpha = Math.min(1, k * 1.4);
      g.fillStyle = c === 0 ? '#e9e2c4' : c === 2 ? '#ffcf6a' : c === 3 ? '#cfe8a0' : c === 4 ? '#ffb070' : c === 5 ? '#fff4c8' : c === 6 ? '#ff8a9a' : '#9eefff';
      g.beginPath(); g.arc(x, y, sz * 0.55, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
  };
  PP.heroBar = function (g, ox, oy) {
    var S = this.S, H = S.hero; if (S.phase === 'lost' || S.phase === 'idle') return;
    var x = H.x + ox - 16, y = H.y + oy + 6, w = 32, k = clamp(H.hp / H.maxHp, 0, 1);
    g.fillStyle = 'rgba(8,8,14,0.75)'; rrect(g, x - 1.5, y - 1.5, w + 3, 6, 2.5); g.fill();
    var hg = g.createLinearGradient(0, y, 0, y + 3); hg.addColorStop(0, k < 0.3 ? '#ff8a7a' : '#ff6a6a'); hg.addColorStop(1, '#b0202c');
    g.fillStyle = hg; rrect(g, x, y, Math.max(2, w * k), 3, 1.5); g.fill();
  };
  PP.numbers = function (g, ox, oy) {
    var S = this.S; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
    for (var i = 0; i < S.nums.length; i++) {
      var q = S.nums[i]; if (!q.on) continue; var k = q.t / 700, y = q.y + oy - 10 * ease(k * 2), a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3, sc = q.t < 90 ? 1 + 0.5 * (1 - q.t / 90) : 1;
      if (y < S.view.y + 58) continue;   // never under the XP bar, timer and kill count
      g.globalAlpha = a; g.font = '700 ' + Math.round((q.big ? 13 : 10) * sc) + 'px ' + this.font;
      g.strokeStyle = 'rgba(20,10,10,0.9)'; g.lineWidth = 3; g.strokeText(String(q.v), q.x + ox, y);
      g.fillStyle = q.big ? '#ffd35a' : '#ffffff'; g.fillText(String(q.v), q.x + ox, y);
    }
    g.globalAlpha = 1;
  };

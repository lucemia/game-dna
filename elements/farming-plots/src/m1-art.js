
  /* =====================================================================================================
     Art: everything drawn in code, 1 art px = 1 world px, light from the top left, cached canvases.
     ===================================================================================================== */
  var CACHE = {};
  function mkCanvas(w, h) { if (typeof document === 'undefined') return null; var c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }
  function cached(key, fn) { if (CACHE[key] !== undefined) return CACHE[key]; var v = null; try { v = fn(); } catch (e) { warn('art ' + key, e); } CACHE[key] = v; return v; }
  function Pix(w, h, ox, oy) {
    var px = new Array(w * h); ox = ox || 0; oy = oy || 0;
    var P = {
      w: w, h: h,
      set: function (x, y, c) { x = (x | 0) + ox; y = (y | 0) + oy; if (x < 0 || y < 0 || x >= w || y >= h || !c) return; px[y * w + x] = c; },
      get: function (x, y) { x = (x | 0) + ox; y = (y | 0) + oy; return x < 0 || y < 0 || x >= w || y >= h ? null : px[y * w + x] || null; },
      del: function (x, y) { x = (x | 0) + ox; y = (y | 0) + oy; if (x >= 0 && y >= 0 && x < w && y < h) px[y * w + x] = null; },
      r: function (x, y, ww, hh, c) { for (var j = 0; j < hh; j++) for (var i = 0; i < ww; i++) P.set(x + i, y + j, c); },
      line: function (x0, y0, x1, y1, c, wd) {
        x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
        var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy, n = 0;
        while (n++ < 200) { P.set(x0, y0, c); if (wd > 1) P.set(x0 + 1, y0, c); if (x0 === x1 && y0 === y1) break; var e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
      },
      // shaded ellipse, ramp dark..light (4), light from the upper left
      ball: function (cx, cy, rx, ry, ramp, spec) {
        for (var y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (var x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          var nx = (x + 0.5 - cx) / Math.max(0.5, rx), ny = (y + 0.5 - cy) / Math.max(0.5, ry), d = nx * nx + ny * ny; if (d > 1) continue;
          var nz = Math.sqrt(Math.max(0, 1 - d)), lum = -0.5 * nx - 0.6 * ny + 0.6 * nz, k = lum > 0.82 ? 3 : lum > 0.42 ? 2 : lum > 0.02 ? 1 : 0;
          if (k === 3 && !spec) k = 2; P.set(x, y, ramp[k]);
        }
      },
      outline: function (col) {
        var add = [], x, y;
        for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
          if (px[y * w + x]) continue;
          var g = function (X, Y) { return X >= 0 && Y >= 0 && X < w && Y < h && px[Y * w + X]; };
          if (g(x + 1, y) || g(x - 1, y) || g(x, y + 1) || g(x, y - 1)) add.push(y * w + x);
        }
        add.forEach(function (i) { px[i] = col; });
      },
      canvas: function () { var c = mkCanvas(w, h); if (!c) return null; var g = c.getContext('2d'); for (var i = 0; i < w * h; i++) if (px[i]) { g.fillStyle = px[i]; g.fillRect(i % w, (i / w) | 0, 1, 1); } return c; }
    };
    return P;
  }
  function mirror(c) { if (!c) return c; var o = mkCanvas(c.width, c.height), g = o.getContext('2d'); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0); return o; }

  /* ---------- the farmer: 18 x 24 canvas, feet on row 23, 4 facings, idle + 4 walk frames (arms swing against the legs),
     tool poses raise / strike, a lift pose (holding a harvest over the head). The side art faces right; left is its
     mirror (no asymmetric gear is baked in: tools are drawn by code, light comes from the top). ---------- */
  var FC = { OL: '#2a1a22', SK: '#f4c8a0', SKD: '#d8966c', HR: '#7a4424', HRD: '#4e2a16', HRL: '#a86634', HAT: '#ecc664', HATL: '#fbe69a', HATD: '#b88c38',
    BAND: '#c4483a', BANDD: '#8a2a26', SH: '#f2ead6', SHD: '#c9b896', OV: '#3e6ab0', OVL: '#5c8ed4', OVD: '#28487c', BT: '#6e4426', BTD: '#3e2416', EYE: '#2a1a22', BL: '#ec9a8a', BTN: '#f0d070', HND: '#f2c69e', HNDD: '#d6946a' };   // hands: their own (near-skin) keys, so checks can find them
  var FARMER = { w: 18, h: 24, foot: 23, cx: 9 };
  // Tool poses: 'raise' / 'strike' for long tools (hoe, sickle: both hands on the handle, raised overhead, then brought
  // down onto the faced tile), 'hold' / 'pour' for carried tools (can, seed pouch: held in both hands at the chest, then
  // tipped). Hand points in canvas px: the tool's grip is drawn from here; null = the tool is hidden by the body.
  var HAND = {
    down: { raise: [9, 1], strike: [9, 18], hold: [9, 15], pour: [9, 17], lift: [9, 5] },
    up: { raise: [9, 1], strike: [9, 5], hold: null, pour: null, lift: [9, 5] },
    right: { raise: [3, 0], strike: [13, 16], hold: [12, 14], pour: [13, 15], lift: [12, 5] }
  };
  function armLineP(P, sx, sy, hx, hy, sleeve) {
    var n = Math.max(Math.abs(hx - sx), Math.abs(hy - sy)), i;
    for (i = 0; i <= n; i++) { var x = Math.round(sx + (hx - sx) * i / Math.max(1, n)), y = Math.round(sy + (hy - sy) * i / Math.max(1, n)); P.r(x, y, 2, 1, sleeve); }
  }
  function paintFarmerFront(P, back, walk, pose) {
    var C = FC, o = (walk === 1 || walk === 3) ? -1 : 0, toolPose = pose === 'raise' || pose === 'strike' || pose === 'hold' || pose === 'pour' || pose === 'lift';
    var lift = walk === 0 ? [2, 0] : walk === 2 ? [0, 2] : [0, 0];
    // legs and boots (not bobbed; a bob stretches the leg one row up)
    [[4, lift[0]], [8, lift[1]]].forEach(function (L, i) {
      var x0 = L[0], lf = L[1];
      for (var y = 16 + o + 1; y <= 18 - lf; y++) { P.r(x0, y, 4, 1, C.OV); P.set(i ? x0 : x0 + 3, y, C.OVD); }
      P.r(x0, 19 - lf, 4, 2, C.BT); P.set(x0, 19 - lf, '#8a5a34'); P.r(x0, 21 - lf, 4, 1, C.BTD);
    });
    // walking / idle / lift arms (behind the torso edge): swing against the legs
    var sw = walk === 0 ? [-1, 1] : walk === 2 ? [1, -1] : [0, 0];
    function arm(x0, s, shade) {
      if (pose === 'lift') { P.r(x0, 6 + o, 2, 7, shade ? C.SHD : C.SH); P.r(x0, 4 + o, 2, 2, C.HND); return; }
      var len = 4 + s; P.r(x0, 12 + o, 2, len, shade ? C.SHD : C.SH); P.r(x0, 12 + o + len, 2, 1, back ? C.HNDD : C.HND);
    }
    if (!toolPose) { arm(2, sw[0], false); arm(14, sw[1], true); }
    // torso
    P.r(4, 12 + o, 10, 4, C.SH); P.set(4, 13 + o, C.SHD); P.set(13, 13 + o, C.SHD); P.set(13, 14 + o, C.SHD);
    if (!back) {
      P.r(6, 12 + o, 6, 1, C.BAND); P.r(8, 13 + o, 2, 1, C.BANDD);
      P.r(6, 13 + o, 6, 4, C.OV); P.r(6, 13 + o, 6, 1, C.OVL); P.set(11, 14 + o, C.OVD); P.set(11, 15 + o, C.OVD);
      P.set(5, 12 + o, C.OVD); P.set(12, 12 + o, C.OVD); P.set(6, 13 + o, C.BTN); P.set(11, 13 + o, C.BTN); P.r(8, 15 + o, 2, 1, C.OVD);
    } else {
      P.r(8, 12 + o, 2, 1, C.BAND);
      P.r(5, 14 + o, 8, 3, C.OV); P.set(5, 12 + o, C.OVD); P.set(6, 13 + o, C.OVD); P.set(12, 12 + o, C.OVD); P.set(11, 13 + o, C.OVD); P.set(7, 14 + o, C.OVD); P.set(10, 14 + o, C.OVD);
      P.set(12, 15 + o, C.OVD); P.set(12, 16 + o, C.OVD);
    }
    P.r(5, 16 + o, 8, 1, C.OV); P.set(12, 16 + o, C.OVD);
    // head
    if (!back) {
      P.r(5, 7 + o, 8, 5, C.SK); P.r(12, 7 + o, 1, 5, C.SKD); P.r(6, 11 + o, 6, 1, C.SK); P.set(5, 11 + o, C.SKD); P.set(12, 11 + o, C.SKD);
      P.r(4, 6 + o, 10, 1, C.HRD); P.r(4, 7 + o, 1, 4, C.HR); P.r(13, 7 + o, 1, 4, C.HRD); P.set(5, 7 + o, C.HR); P.set(12, 7 + o, C.HRD);
      P.r(6, 8 + o, 1, 2, C.EYE); P.r(11, 8 + o, 1, 2, C.EYE); P.set(5, 10 + o, C.BL); P.set(12, 10 + o, C.BL); P.r(8, 10 + o, 2, 1, C.SKD);
    } else {
      P.r(4, 6 + o, 10, 6, C.HR); P.r(4, 6 + o, 10, 1, C.HRD); P.r(6, 7 + o, 4, 1, C.HRL); P.set(5, 8 + o, C.HRL); P.r(5, 11 + o, 8, 1, C.HRD); P.set(13, 8 + o, C.HRD); P.set(13, 9 + o, C.HRD);
    }
    // straw hat: crown, band, brim
    P.r(5, 1 + o, 8, 3, C.HAT); P.r(6, 1 + o, 6, 1, C.HATL); P.set(12, 2 + o, C.HATD); P.set(12, 3 + o, C.HATD);
    P.r(5, 4 + o, 8, 1, C.BAND); P.set(12, 4 + o, C.BANDD);
    P.r(2, 5 + o, 14, 1, C.HAT); P.r(3, 5 + o, 4, 1, C.HATL); P.set(15, 5 + o, C.HATD);
    P.set(2, 5 + o, C.HATD); P.r(4, 6 + o, 1, 1, C.HATD); P.r(13, 6 + o, 1, 1, C.HATD);
    // tool poses: both arms reach the grip; the hands are drawn last (over the brim when raised)
    if (pose === 'raise' || pose === 'lift') {   // both hands overhead (a long tool's grip, or the harvest resting on them)
      armLineP(P, 3, 12, 2, 7, C.SH); armLineP(P, 2, 7, 6, 1, C.SH); armLineP(P, 14, 12, 15, 7, C.SHD); armLineP(P, 15, 7, 11, 1, C.SHD);
      P.r(7, -1, 4, 2, C.HND); P.set(10, 0, C.HNDD); P.r(7, 1, 1, 1, C.SH); P.r(10, 1, 1, 1, C.SHD);
    } else if (pose === 'strike' && !back) {
      armLineP(P, 3, 12, 6, 16, C.SH); armLineP(P, 14, 12, 11, 16, C.SHD); P.r(7, 16, 4, 2, C.HND); P.r(10, 17, 1, 1, C.HNDD);
    } else if (pose === 'strike' && back) {
      armLineP(P, 3, 12, 5, 6, C.SH); armLineP(P, 14, 12, 12, 6, C.SHD); P.r(7, 3, 4, 2, C.HND); P.set(10, 4, C.HNDD);
    } else if ((pose === 'hold' || pose === 'pour') && !back) {
      var hy = pose === 'hold' ? 13 : 15;
      armLineP(P, 3, 12, 6, hy, C.SH); armLineP(P, 14, 12, 11, hy, C.SHD); P.r(7, hy, 4, 2, C.HND); P.set(10, hy + 1, C.HNDD);
    } else if (pose === 'hold' || pose === 'pour') {
      armLineP(P, 3, 12, 5, 13, C.SH); armLineP(P, 14, 12, 12, 13, C.SHD);
    }
  }
  function paintFarmerSide(P, walk, pose) {
    var C = FC, o = (walk === 1 || walk === 3) ? -1 : 0;
    var a = walk === 0 ? 2 : walk === 2 ? -2 : 0, liftN = walk === 3 ? 1 : 0, liftF = walk === 1 ? 1 : 0;
    var s = walk === 0 ? -1 : walk === 2 ? 1 : 0;           // near arm swings against the near leg
    function leg(foot, lf, near) {
      for (var y = 16 + o + 1; y <= 18 - lf; y++) { var t = (y - 16) / 3, x = 7 + Math.round(foot * t); P.r(x, y, 3, 1, near ? C.OV : C.OVD); if (near) P.set(x + 2, y, C.OVD); }
      var fx = 7 + foot; P.r(fx, 19 - lf, 4, 2, near ? C.BT : C.BTD); if (near) P.set(fx + 3, 19 - lf, '#8a5a34'); P.r(fx, 21 - lf, 4, 1, near ? C.BTD : '#2a1810');
    }
    function armLine(sx, sy, hx, hy, sleeve, hand) {
      var n = Math.max(Math.abs(hx - sx), Math.abs(hy - sy)), i;
      for (i = 0; i <= n; i++) { var x = Math.round(sx + (hx - sx) * i / Math.max(1, n)), y = Math.round(sy + (hy - sy) * i / Math.max(1, n)); P.r(x, y, 2, 1, i >= n ? hand : sleeve); }
    }
    // far leg and far arm first (darker), then the body, then the near leg and arm
    leg(-a, liftF, false);
    if (!pose) armLine(7, 13 + o, 7 - 3 * s, 16 + o - Math.abs(s), C.SHD, C.HNDD);
    // torso
    P.r(5, 12 + o, 6, 5, C.OV); P.r(5, 12 + o, 2, 4, C.SH); P.set(5, 15 + o, C.SHD); P.r(8, 12 + o, 3, 1, C.OVL); P.set(7, 12 + o, C.OVD); P.set(7, 13 + o, C.OVD);
    P.r(6, 12 + o, 4, 1, C.BAND); P.set(10, 13 + o, C.BTN); P.r(5, 16 + o, 6, 1, C.OVD);
    leg(a, liftN, true);
    if (pose === 'raise') { armLine(6, 12, 3, 7, C.SH, C.SH); armLine(3, 7, 2, 1, C.SH, C.SH); }   // both arms up behind the head
    // head (faces right)
    P.r(7, 7 + o, 5, 5, C.SK); P.r(12, 9 + o, 1, 1, C.SK); P.r(7, 11 + o, 4, 1, C.SK);
    P.r(4, 6 + o, 3, 5, C.HR); P.r(4, 6 + o, 9, 1, C.HRD); P.set(4, 11 + o, C.HRD); P.set(5, 11 + o, C.HRD); P.set(5, 7 + o, C.HRL); P.set(7, 7 + o, C.HR);
    P.r(10, 8 + o, 1, 2, C.EYE); P.r(6, 8 + o, 1, 2, C.SKD); P.set(9, 10 + o, C.BL); P.set(11, 11 + o, C.SKD);
    // hat
    P.r(4, 1 + o, 7, 3, C.HAT); P.r(5, 1 + o, 5, 1, C.HATL); P.set(10, 2 + o, C.HATD); P.set(10, 3 + o, C.HATD);
    P.r(4, 4 + o, 7, 1, C.BAND); P.set(10, 4 + o, C.BANDD);
    P.r(1, 5 + o, 14, 1, C.HAT); P.r(2, 5 + o, 4, 1, C.HATL); P.set(14, 5 + o, C.HATD); P.set(1, 5 + o, C.HATD);
    // near arm (both hands on the tool: the far hand is hidden behind the near one)
    if (pose === 'raise') { P.r(2, -1, 2, 2, C.HND); P.set(3, 0, C.HNDD); }
    else if (pose === 'strike') { armLine(8, 13, 11, 15, C.SH, C.SH); P.r(12, 14, 2, 2, C.HND); }
    else if (pose === 'hold') { armLine(8, 13, 10, 13, C.SH, C.SH); P.r(11, 12, 2, 2, C.HND); }
    else if (pose === 'pour') { armLine(8, 13, 11, 14, C.SH, C.SH); P.r(12, 13, 2, 2, C.HND); }
    else if (pose === 'lift') { P.r(12, 6 + o, 2, 7, C.SH); P.r(11, 12 + o, 1, 1, C.SH); P.r(12, 4 + o, 2, 2, C.HND); }
    else armLine(7, 13 + o, 7 + 3 * s, 16 + o - Math.abs(s), C.SH, C.HND);
  }
  function farmerCanvas(dir, frame, pose) {
    var walk = pose ? -1 : (frame == null ? -1 : frame & 3);
    var side = dir === 'left' || dir === 'right';
    return cached('farmer:' + (side ? 'side' : dir) + ':' + walk + ':' + (pose || '') + (dir === 'left' ? ':L' : ''), function () {
      if (dir === 'left') return mirror(farmerCanvas('right', frame, pose));
      var P = Pix(FARMER.w, FARMER.h, 0, 1);
      if (side) paintFarmerSide(P, walk, pose); else paintFarmerFront(P, dir === 'up', walk, pose);
      P.outline(FC.OL);
      return P.canvas();
    });
  }
  function handPoint(dir, pose) {
    var t = HAND[dir === 'left' ? 'right' : dir] || HAND.down, h = t[pose];
    if (h === undefined) h = [9, 14]; if (h === null) return null;
    return dir === 'left' ? [FARMER.w - 1 - h[0], h[1]] : [h[0], h[1]];
  }
  function carried(tool) { return !!tool && (tool.icon === 'can' || tool.icon === 'seeds'); }
  // the drawn pose for a use phase ('raise' | 'strike') and tool: {pose, hand (canvas px) or null, behind}
  function toolPose(dir, phase, tool) {
    if (phase === 'lift' || !phase) return { pose: phase || null, hand: null, behind: false };
    var pose = carried(tool) ? (phase === 'raise' ? 'hold' : 'pour') : phase, hand = tool ? handPoint(dir, pose) : null;
    return { pose: pose, hand: hand, behind: dir === 'up' || (dir === 'down' && pose === 'raise') };
  }

  /* ---------- tools in the hand (drawn in world px, pixel crisp) ---------- */
  function px(ctx, x, y, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); }
  function pline(ctx, x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1); ctx.fillStyle = c;
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy, n = 0;
    while (n++ < 120) { ctx.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; var e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  // a handle: dark edge + wood core, from the grip (x0, y0) to the head (x1, y1)
  function handle(ctx, x0, y0, x1, y1, wood, vertical) { pline(ctx, x0 + (vertical ? 1 : 0), y0 + (vertical ? 0 : 1), x1 + (vertical ? 1 : 0), y1 + (vertical ? 0 : 1), '#3a2414'); pline(ctx, x0, y0, x1, y1, wood); }
  // the tool in the hands at (hx, hy) (the grip), for a drawn pose (raise | strike | hold | pour)
  function drawToolHeld(ctx, tool, dir, hx, hy, pose) {
    var c = tool.colors || TOOLS.hoe.colors, metal = c[0], wood = c[1], hi = c[2], icon = tool.icon, side = dir === 'left' || dir === 'right', sg = dir === 'left' ? -1 : 1;
    hx = Math.round(hx); hy = Math.round(hy);
    if (typeof icon === 'function') icon = 'hoe';
    if (icon === 'can' || icon === 'seeds') {
      var pour = pose === 'pour', bx = side ? hx + sg * 2 : hx, by = hy + 3;
      if (icon === 'can') {
        // body 8 x 6 hanging from the hands; the spout points forward (side) or toward the viewer (front); tipped when pouring
        ctx.fillStyle = '#16262a'; ctx.fillRect(bx - 4, by - 2, 9, 7);
        ctx.fillStyle = metal; ctx.fillRect(bx - 3, by - 1, 7, 5); ctx.fillStyle = wood; ctx.fillRect(bx - 3, by - 1, 7, 1); ctx.fillStyle = hi; ctx.fillRect(bx - 2, by, 2, 2);
        ctx.fillStyle = '#16262a'; ctx.fillRect(bx - 1, hy, 3, 1); ctx.fillStyle = metal; ctx.fillRect(bx, hy + 1, 1, 1);   // the bail handle up to the hands
        if (side) { var sx = sg > 0 ? bx + 4 : bx - 4; pline(ctx, sx, by + 1, sx + sg * 3, by + (pour ? 4 : -1), metal); px(ctx, sx + sg * 3, by + (pour ? 5 : -2), hi); }
        else { pline(ctx, bx + 4, by + 2, bx + 6, by + (pour ? 6 : 0), metal); px(ctx, bx + 6, by + (pour ? 7 : -1), hi); }
      } else {
        // the seed pouch held in both hands, mouth open toward the work
        ctx.fillStyle = '#3a2414'; ctx.fillRect(bx - 3, by - 2, 7, 7); ctx.fillStyle = metal; ctx.fillRect(bx - 2, by - 1, 5, 5); ctx.fillStyle = hi; ctx.fillRect(bx - 2, by - 1, 2, 1); ctx.fillStyle = wood; ctx.fillRect(bx - 1, hy, 3, 1);
        if (pour) { ctx.fillStyle = '#f0e0a8'; ctx.fillRect(bx + (side ? sg * 4 : 0), by + 5, 1, 1); ctx.fillRect(bx + (side ? sg * 5 : 1), by + 6, 1, 1); }
      }
      return;
    }
    // long tools: hoe and sickle; the shaft starts at the grip
    var L = icon === 'sickle' ? 5 : 8, ex, ey, vertical = !side;
    if (dir === 'down' && pose === 'raise') { ex = hx; ey = hy - 1 - L; handle(ctx, hx, hy - 1, ex, ey, wood, true); }
    else if (dir === 'down') { ex = hx; ey = hy + 1 + L; handle(ctx, hx, hy + 1, ex, ey, wood, true); }
    else if (dir === 'up' && pose === 'raise') { ex = hx; ey = hy - 1 - L; handle(ctx, hx, hy - 1, ex, ey, wood, true); }
    else if (dir === 'up') { ex = hx; ey = hy - 1 - L - 5; handle(ctx, hx, hy - 1, ex, ey, wood, true); }
    else if (pose === 'raise') { ex = hx - sg * 4; ey = hy - L; handle(ctx, hx - sg, hy - 1, ex, ey, wood, false); }
    else { ex = hx + sg * (L - 1); ey = hy + 5; handle(ctx, hx + sg, hy + 1, ex, ey, wood, false); }
    var X = Math.round(ex), Y = Math.round(ey), up = (dir === 'down' && pose === 'raise') || dir === 'up' || (side && pose === 'raise');
    if (icon === 'sickle') {
      // a crescent blade hooking forward from the shaft end (a 6 px arc with a bright edge)
      var bs = side ? sg : 1, vy = up ? -1 : 1, arc = [[0, 0], [1, vy], [2, 2 * vy], [3, 2 * vy], [4, vy], [5, 0], [5, -vy]];
      ctx.fillStyle = '#20202c'; arc.forEach(function (q) { ctx.fillRect(X + q[0] * bs - 1, Y + q[1] - 1, 3, 3); });
      arc.forEach(function (q, i) { px(ctx, X + q[0] * bs, Y + q[1], i >= 4 ? hi : metal); }); px(ctx, X + 2 * bs, Y + 3 * vy, hi); px(ctx, X + 3 * bs, Y + 3 * vy, hi);
    } else if (vertical) {
      // hoe seen end-on: the blade across the shaft end
      ctx.fillStyle = '#20202c'; ctx.fillRect(X - 3, Y - (up ? 2 : 0), 7, 3);
      ctx.fillStyle = metal; ctx.fillRect(X - 2, Y - (up ? 1 : 0) + (up ? 0 : 0), 5, 1); ctx.fillStyle = hi; ctx.fillRect(X - 2, Y + (up ? 0 : 1), 5, 1);
    } else {
      // hoe from the side: the blade bends down (forward) from the shaft end
      ctx.fillStyle = '#20202c'; ctx.fillRect(X - 1, Y - 1, 3, 6);
      ctx.fillStyle = metal; ctx.fillRect(X, Y, 1, 4); ctx.fillStyle = hi; ctx.fillRect(X + (sg > 0 ? 0 : 0), Y, 1, 1); px(ctx, X + sg, Y + 4, metal);
    }
  }

  // the harvest held overhead: the 14 px crop icon's top left in canvas px, its art resting on the hands (front / back: both
  // hands together above the hat, rows 0-1; side: the raised hand, rows 5-6)
  var LIFT = { n: 0 };   // world draws of a carried crop (checks: exactly one per lift frame)
  function liftAnchor(dir) { return dir === 'right' ? [5, -7] : dir === 'left' ? [FARMER.w - 5 - 14, -7] : [2, -13]; }
  // the farmer with the tool in his hands (tools away from the camera are drawn behind him); lift = a crop look held overhead
  function drawFarmerFull(ctx, x, y, dir, frame, phase, useDef, liftLook) {
    var tp = toolPose(dir, phase, useDef), im = farmerCanvas(dir, frame < 0 ? null : frame, tp.pose); if (!im) return false;
    var X = Math.round(x) - FARMER.cx, Y = Math.round(y) - FARMER.foot, hp = useDef ? tp.hand : null;
    ctx.fillStyle = 'rgba(20,14,10,0.28)'; ctx.fillRect(X + 4, Y + FARMER.foot - 1, 10, 2); ctx.fillRect(X + 5, Y + FARMER.foot, 8, 1);
    if (hp && tp.behind) drawToolHeld(ctx, useDef, dir, X + hp[0], Y + hp[1], tp.pose);
    if (phase === 'lift' && liftLook) { var la = liftAnchor(dir); LIFT.n++; drawIcon(ctx, 'crop', X + la[0], Y + la[1], 14, null, liftLook); }   // held in the hands, behind the fingers
    ctx.drawImage(im, X, Y);
    if (hp && !tp.behind) drawToolHeld(ctx, useDef, dir, X + hp[0], Y + hp[1], tp.pose);
    return true;
  }

  /* ---------- crops: 16 x 32 canvases, the plot tile is rows 16..31, the plant stands on row 26 ---------- */
  var DEAD_LEAF = ['#3a2a18', '#6a4a28', '#94703c', '#b8945a'], DEAD_FRUIT = ['#4a3420', '#7a5a38', '#a07c50', '#c0a070'];
  function paintCrop(P, look, p, ripe, seed) {
    var L = look.leaf, F = look.fruit, k = look.kind, bx = 8, by = 26, i;
    if (p <= 0) {   // seed: a raked mound with seeds showing
      P.ball(8, 26, 3.5, 1.6, ['#5a3a20', '#7a5232', '#94683e', '#b08452']); P.set(7, 25, '#e8d8a0'); P.set(9, 26, '#e8d8a0'); P.set(8, 26, '#c8b070'); return;
    }
    function leaf(ang, len, w, ox, oy) {   // a pointed leaf from (ox, oy) (default: the base), shaded along its length
      var a = ang * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), X0 = ox == null ? bx : ox, Y0 = oy == null ? by : oy;
      for (var t = 0; t <= len; t += 0.5) { var x = X0 + dx * t, y = Y0 + dy * t, ww = Math.max(0, w * Math.sin(Math.PI * Math.min(1, (t + 0.6) / (len + 0.6)))); for (var s = -ww; s <= ww; s += 0.5) { var X = x - dy * s, Y = y + dx * s, sh = s < -ww * 0.3 ? 3 : s > ww * 0.4 ? 1 : 2; P.set(Math.round(X), Math.round(Y), L[t > len - 1 && sh === 3 ? 2 : sh]); } P.set(Math.round(x), Math.round(y), L[1]); }
    }
    if (k === 'root') {
      var n = p < 0.5 ? 2 : 4, ln = 2 + p * 6;
      if (n === 2) { leaf(-125, ln, 1.3); leaf(-55, ln, 1.3); } else { leaf(-150, ln * 0.75, 1.4); leaf(-115, ln, 1.6); leaf(-65, ln, 1.6); leaf(-30, ln * 0.75, 1.4); leaf(-90, ln * 0.9, 1.4); }
      if (ripe) { P.ball(8, 27, 4, 2.6, F, true); P.set(8, 29, F[0]); P.r(6, 25, 5, 1, F[2]); P.set(7, 24, F[1]); }
      else if (p > 0.6) { P.ball(8, 27, 2.5, 1.4, F); }
      return;
    }
    if (k === 'leafy') {
      var r = 1.6 + p * 4.6;
      if (p < 0.3) { leaf(-130, 3, 1.2); leaf(-50, 3, 1.2); return; }
      for (i = 0; i < 6; i++) { var aa = -180 + i * 36; leaf(aa, r + 1.2, 1.7); }
      P.ball(8, 25.5 - r * 0.25, r * 0.9, r * 0.72, L, false);
      if (ripe) { P.ball(8, 24.5, r * 0.75, r * 0.62, F, true); P.line(8, 22, 8, 26, F[0]); P.set(6, 23, F[3]); }
      return;
    }
    if (k === 'vine') {
      var h = 4 + p * 12, top = Math.round(by - h);
      P.r(11, top - 1, 1, by - top + 2, '#7a5232'); P.r(12, top - 1, 1, by - top + 2, '#5a3a20'); P.set(11, top - 2, '#a87c4a');
      for (var y = by - 1, n2 = 0; y > top + 1; y -= 3, n2++) { var side = n2 % 2 ? 1 : -1; leaf(side > 0 ? -25 : -155, 2.4 + p * 1.6, 1.3, side > 0 ? 12 : 11, y); }
      leaf(-110, 2 + p * 2, 1.2, 11, top + 1);
      bx = 8; by = 26;
      if (p > 0.55 && !ripe && !look.dead) { P.set(9, top + 3, '#ffe070'); P.set(13, top + 6, '#ffe070'); P.set(8, top + 8, '#ffe070'); }
      if (ripe) { [[7, top + 3], [13, top + 6], [8, top + 9], [12, top + 11]].forEach(function (q) { P.ball(q[0], q[1], 1.7, 1.7, F, true); P.set(q[0], q[1] - 2, L[2]); }); }
      return;
    }
    if (k === 'stalk') {
      var hh = 3 + p * 19, tp = Math.round(by - hh);
      P.r(8, tp, 2, by - tp + 1, L[2]); P.r(9, tp, 1, by - tp + 1, L[1]);
      for (var yy = by - 2, j = 0; yy > tp + 2; yy -= 4, j++) { var sd = j % 2 ? 1 : -1; for (var t2 = 0; t2 < 3 + p * 4; t2++) P.set(9 + sd * (t2 + 1), yy + Math.floor(t2 * t2 / 8), t2 > 3 ? L[1] : L[2 + (sd < 0 ? 1 : 0)]); }
      if (p > 0.6) { P.set(8, tp - 1, '#c8a050'); P.set(7, tp - 2, '#c8a050'); P.set(10, tp - 2, '#a87c40'); P.set(9, tp - 3, '#e0c070'); }
      if (ripe) { var cy = Math.round(by - hh * 0.55); P.ball(11, cy, 1.6, 3.2, F, true); P.set(10, cy + 3, L[2]); P.set(12, cy + 3, L[1]); P.set(11, cy - 4, '#d8b860'); }
      return;
    }
    if (k === 'gourd') {
      var rr = 2 + p * 5;
      leaf(-170, rr, 1.8); leaf(-10, rr, 1.8); leaf(-120, rr * 0.8, 1.9); leaf(-60, rr * 0.8, 1.9);
      if (ripe) { P.ball(8, 25.5, 5.5, 3.8, F, true); P.line(8, 22, 8, 29, F[0]); P.line(5, 23, 5, 28, F[1]); P.line(11, 23, 11, 28, F[1]); P.r(8, 21, 1, 2, '#5a3a20'); P.set(9, 21, L[2]); }
      else if (p > 0.6) { P.ball(8, 26, 2.2, 1.7, L, true); }
      return;
    }
    // flower (and unknown kinds)
    var fh = 3 + p * 14, ft = Math.round(by - fh);
    P.r(8, ft, 1, by - ft + 1, L[2]); P.r(9, ft + 1, 1, by - ft, L[1]);
    for (var y3 = by - 2, j3 = 0; y3 > ft + 2; y3 -= 4, j3++) leaf(j3 % 2 ? -20 : -160, 2 + p * 2.5, 1.4, 8.5, y3);
    if (ripe) { for (i = 0; i < 10; i++) { var a3 = i * Math.PI / 5; P.ball(8.5 + Math.cos(a3) * 3.2, ft + Math.sin(a3) * 3, 1.3, 1.3, F, true); } P.ball(8.5, ft, 2.2, 2.2, ['#3a2010', '#5a3418', '#7a4a20', '#9a6a30']); }
    else if (p > 0.6) { P.ball(8.5, ft, 1.6, 1.8, L, true); }
  }
  function cropCanvas(id, def, stage, dead) {
    return cached('crop:' + id + ':' + stage + ':' + (dead ? 1 : 0) + ':' + def.stages, function () {
      if (typeof def.draw === 'function') return null;
      var P = Pix(16, 32), look = def.look, ripe = stage >= def.stages - 1, p = stage / (def.stages - 1);
      var lk = dead ? { kind: look.kind, leaf: DEAD_LEAF, fruit: DEAD_FRUIT, dead: true } : look;
      paintCrop(P, lk, dead ? Math.max(p, 0.34) * 0.8 : p, ripe && !dead, hsh(stage, 1, 3));
      P.outline(dead ? '#2a1c10' : '#14261a');
      return P.canvas();
    });
  }

  /* ---------- tilled soil: one 16 x 16 tile per neighbour mask (N E S W) and wetness ---------- */
  var SOIL = { dry: ['#4a2e18', '#6e4a2c', '#8a603a', '#a47a4a', '#bc9460'], wet: ['#2e1c10', '#43291a', '#563622', '#6a442c', '#7e5638'] };
  function soilCanvas(mask, wet, v) {
    return cached('soil:' + mask + ':' + (wet ? 1 : 0) + ':' + (v & 3), function () {
      var c = mkCanvas(16, 16); if (!c) return null; var g = c.getContext('2d'), R = wet ? SOIL.wet : SOIL.dry, N = mask & 1, E = mask & 2, S = mask & 4, W = mask & 8, x, y;
      for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) {
        var fr = y % 5, col = fr === 0 ? R[1] : fr === 1 ? R[3] : fr === 4 ? R[1] : R[2];
        var hv = hsh(x, y, 7 + v * 13); if (fr >= 2 && fr <= 3 && hv > 0.86) col = R[3]; if (fr === 2 && hv < 0.08) col = R[1];
        if (!N && y === 0) col = R[0]; if (!N && y === 1) col = R[1];
        if (!S && y === 15) col = R[4]; if (!S && y === 14) col = R[3];
        if (!W && x === 0) col = R[1]; if (!E && x === 15) col = R[0];
        if ((!N && !W && x === 0 && y === 0) || (!N && !E && x === 15 && y === 0) || (!S && !W && x === 0 && y === 15) || (!S && !E && x === 15 && y === 15)) continue;
        g.fillStyle = col; g.fillRect(x, y, 1, 1);
      }
      if (wet) { for (var i = 0; i < 5; i++) { var sx = 2 + Math.floor(hsh(i, v, 31) * 12), sy = 2 + Math.floor(hsh(i, v, 37) * 12); g.fillStyle = 'rgba(150,190,230,0.55)'; g.fillRect(sx, sy, 1, 1); } }
      return c;
    });
  }

  /* ---------- icons (12 x 12 art, drawn scaled and crisp on the HUD) ---------- */
  function iconCanvas(kind, colors, extra) {
    return cached('icon:' + kind + ':' + (colors || []).join(',') + ':' + (extra || ''), function () {
      var P = Pix(14, 14, 1, 1), c = colors || [], i;
      if (kind === 'hoe') { P.line(2, 11, 9, 3, '#a87240', 1); P.line(3, 11, 10, 3, '#7a4a2a'); P.r(8, 1, 4, 2, '#8a94b4'); P.r(8, 1, 4, 1, '#d0d8ec'); P.r(10, 3, 2, 2, '#58607e'); }
      else if (kind === 'can') { var m = c[0] || '#3a8a7a', l = c[1] || '#5cb8a0', h = c[2] || '#a8ecd8'; P.r(2, 4, 7, 6, m); P.r(2, 4, 7, 1, l); P.r(3, 5, 2, 3, h); P.line(9, 6, 11, 3, m); P.r(11, 2, 2, 2, l); P.r(3, 2, 5, 1, '#2a4a40'); P.set(2, 3, '#2a4a40'); P.set(8, 3, '#2a4a40'); P.r(2, 10, 7, 1, '#2a5a50'); }
      else if (kind === 'seeds') { var fr = c[1] || '#58a444', fl = c[2] || '#8ccc5c'; P.r(2, 2, 8, 10, '#e8d8b0'); P.r(2, 2, 8, 1, '#f8f0d8'); P.r(9, 2, 1, 10, '#c0aa80'); P.r(3, 4, 6, 5, fl); P.ball(6, 6.5, 2.2, 2.2, [c[0] || '#2f7a3a', fr, fl, '#ffffff'], true); P.r(3, 10, 6, 1, '#a88a58'); P.set(5, 11, '#7a5a30'); }
      else if (kind === 'sickle') { P.line(1, 11, 4, 7, '#7a4a2a'); P.line(2, 11, 5, 7, '#a87240'); for (i = 0; i <= 12; i++) { var a = Math.PI * (1.05 + i * 0.075); P.set(Math.round(7.5 + Math.cos(a) * 4.6), Math.round(6.5 + Math.sin(a) * 4.6), '#e8eef8'); P.set(Math.round(7.5 + Math.cos(a) * 3.6), Math.round(6.5 + Math.sin(a) * 3.6), i > 10 ? '#e8eef8' : '#8a94b4'); } P.set(12, 7, '#ffffff'); }
      else if (kind === 'coin') { P.ball(6, 6, 4.5, 4.5, ['#a86a10', '#e8b030', '#ffd860', '#fff6c0'], true); P.r(5, 4, 1, 5, '#a86a10'); P.r(6, 4, 1, 5, '#ffe890'); }
      else if (kind === 'blossom') { for (i = 0; i < 5; i++) { var a2 = -Math.PI / 2 + i * Math.PI * 2 / 5; P.ball(6 + Math.cos(a2) * 3, 6 + Math.sin(a2) * 3, 2.1, 2.1, ['#c04a7a', '#ec7aa8', '#ffc0d8', '#ffffff'], true); } P.ball(6, 6, 1.4, 1.4, ['#c88a10', '#f0c030', '#ffe070', '#fff']); }
      else if (kind === 'sun') { for (i = 0; i < 8; i++) { var a3 = i * Math.PI / 4; P.line(6 + Math.cos(a3) * 4, 6 + Math.sin(a3) * 4, 6 + Math.cos(a3) * 5.6, 6 + Math.sin(a3) * 5.6, '#f0a020'); } P.ball(6, 6, 3.4, 3.4, ['#d87010', '#f8b020', '#ffe070', '#fff8d0'], true); }
      else if (kind === 'leaf') { P.ball(6, 6, 4.5, 3.2, ['#8a2a10', '#d8642a', '#f8a040', '#ffd890'], true); P.line(2, 10, 10, 2, '#7a3010'); }
      else if (kind === 'flake') { [[0, -5, 0, 5], [-5, 0, 5, 0], [-3, -3, 3, 3], [-3, 3, 3, -3]].forEach(function (q) { P.line(6 + q[0], 6 + q[1], 6 + q[2], 6 + q[3], '#d8ecff'); }); P.set(6, 6, '#ffffff'); }
      else if (kind === 'rain') { P.ball(6, 4, 4.5, 2.6, ['#4a5a7a', '#7a8aaa', '#aab8d0', '#e0e8f4']); [[3, 8], [6, 9], [9, 8], [4, 11], [8, 11]].forEach(function (q) { P.set(q[0], q[1], '#5aa8f0'); P.set(q[0], q[1] + 1, '#2a78c8'); }); }
      else if (kind === 'moon') { P.ball(6, 6, 4.4, 4.4, ['#8a8aa8', '#c8c8dc', '#f0f0f8', '#ffffff'], true); P.ball(8, 4.5, 3.4, 3.4, ['#1a1a30', '#1a1a30', '#1a1a30', '#1a1a30']); for (var y4 = 0; y4 < 14; y4++) for (var x4 = 0; x4 < 14; x4++) if (P.get(x4 - 1, y4 - 1) === '#1a1a30') P.del(x4 - 1, y4 - 1); }
      else if (kind === 'crop' && extra) { var lk = extra; paintCropIcon(P, lk); }
      P.outline('#2a1a22');
      return P.canvas();
    });
  }
  function paintCropIcon(P, look) {
    var L = look.leaf || DEAD_LEAF, F = look.fruit || DEAD_FRUIT, k = look.kind;
    if (k === 'root') { P.ball(6, 7.5, 4, 3.6, F, true); P.r(5, 1, 1, 4, L[2]); P.r(7, 1, 1, 4, L[1]); P.set(4, 2, L[2]); P.set(8, 2, L[3]); P.set(6, 11, F[0]); }
    else if (k === 'leafy') { P.ball(6, 6.5, 5, 4.6, L, false); P.ball(6, 6, 3.4, 3.2, F, true); P.line(6, 3, 6, 9, F[0]); }
    else if (k === 'vine') { P.ball(6, 7, 4.4, 4.2, F, true); P.r(4, 2, 5, 1, L[2]); P.r(6, 1, 1, 2, L[1]); }
    else if (k === 'stalk') { P.ball(6, 6, 2.6, 5.2, F, true); P.line(3, 11, 5, 4, L[2]); P.line(9, 11, 7, 4, L[1]); }
    else if (k === 'gourd') { P.ball(6, 7, 5.4, 4.2, F, true); P.line(6, 3, 6, 11, F[0]); P.line(3, 4, 3, 10, F[1]); P.line(9, 4, 9, 10, F[1]); P.r(6, 1, 1, 2, '#5a3a20'); }
    else { for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4; P.ball(6 + Math.cos(a) * 3.4, 6 + Math.sin(a) * 3.4, 1.6, 1.6, F, true); } P.ball(6, 6, 2.2, 2.2, ['#3a2010', '#5a3418', '#7a4a20', '#9a6a30']); }
  }
  function lookKey(look) { return look ? [look.kind].concat(look.leaf || [], look.fruit || []).join('/') : 'x'; }
  function drawIcon(ctx, kind, x, y, size, colors, look) {
    if (typeof kind === 'function') { safe(kind, [ctx, x, y, size], 'tool.icon'); return; }
    var c = kind === 'crop' ? cached('icon:crop:' + lookKey(look), function () { var P = Pix(14, 14, 1, 1); paintCropIcon(P, look || {}); P.outline('#2a1a22'); return P.canvas(); }) : iconCanvas(kind, colors);
    if (!c) return; var s = Math.max(1, Math.floor(size / 14)), w = 14 * s;
    var sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false; ctx.drawImage(c, Math.round(x + (size - w) / 2), Math.round(y + (size - w) / 2), w, w); ctx.imageSmoothingEnabled = sm;
  }

  /* ---------- HUD panels: a wood frame with brass corners over parchment (CSS px) ---------- */
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); }
  function panel(ctx, x, y, w, h, o) {
    o = o || {}; x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    ctx.save();
    ctx.fillStyle = 'rgba(20,10,8,0.35)'; rr(ctx, x + 1, y + 3, w, h, 7); ctx.fill();
    ctx.fillStyle = '#3a2214'; rr(ctx, x, y, w, h, 7); ctx.fill();
    var g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#b47a42'); g.addColorStop(0.5, '#8e5a2e'); g.addColorStop(1, '#6e4222');
    ctx.fillStyle = g; rr(ctx, x + 2, y + 2, w - 4, h - 4, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,160,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 7, y + 2.5); ctx.lineTo(x + w - 7, y + 2.5); ctx.stroke();
    var b = o.border == null ? 5 : o.border, pg = ctx.createLinearGradient(0, y + b, 0, y + h - b);
    pg.addColorStop(0, o.dark ? '#3a2a22' : '#fbf0d4'); pg.addColorStop(1, o.dark ? '#2a1c16' : '#ecd9ac');
    ctx.fillStyle = '#4a2c18'; rr(ctx, x + b - 1, y + b - 1, w - 2 * b + 2, h - 2 * b + 2, 4); ctx.fill();
    ctx.fillStyle = pg; rr(ctx, x + b, y + b, w - 2 * b, h - 2 * b, 3); ctx.fill();
    [[x + 4, y + 4], [x + w - 6, y + 4], [x + 4, y + h - 6], [x + w - 6, y + h - 6]].forEach(function (q) { ctx.fillStyle = '#5a3a14'; ctx.fillRect(q[0] - 1, q[1] - 1, 4, 4); ctx.fillStyle = '#f0c860'; ctx.fillRect(q[0], q[1], 2, 2); ctx.fillStyle = '#fff4c0'; ctx.fillRect(q[0], q[1], 1, 1); });
    ctx.restore();
  }
  var TRUNC = { n: 0, last: '' };   // strings the HUD had to shorten (a check requires 0)
  var FONT = '"Trebuchet MS", "Segoe UI", system-ui, -apple-system, sans-serif';
  function text(ctx, s, x, y, o) {
    o = o || {}; ctx.save(); ctx.font = (o.weight || 700) + ' ' + (o.size || 13) + 'px ' + FONT; ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic';
    var str = String(s); if (o.max && ctx.measureText(str).width > o.max) { TRUNC.n++; TRUNC.last = str; while (str.length > 2 && ctx.measureText(str).width > o.max) str = str.slice(0, -2) + '.'; }
    if (o.ow) { ctx.lineJoin = 'round'; ctx.lineWidth = o.ow; ctx.strokeStyle = o.oc || 'rgba(30,16,10,0.9)'; ctx.strokeText(str, x, y); }
    ctx.fillStyle = o.color || '#4a2c18'; ctx.fillText(str, x, y); var w = ctx.measureText(str).width; ctx.restore(); return w;
  }

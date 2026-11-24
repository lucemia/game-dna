
  /* =====================================================================================================
     Art: everything drawn in code at 1 art px = 1 logical px, light from the top left, cached canvases
     ===================================================================================================== */
  var OL = '#120c1a';                       // outline
  var VOID = '#08060d';
  var SPR = {};                             // sprite cache
  // a tiny pixel buffer: set / get / outline / canvas
  function Pix(w, h) {
    var px = new Array(w * h);
    var P = {
      w: w, h: h,
      set: function (x, y, c) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= w || y >= h || !c) return; px[y * w + x] = c; },
      clear: function (x, y) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < w && y < h) px[y * w + x] = null; },
      get: function (x, y) { return x < 0 || y < 0 || x >= w || y >= h ? null : px[y * w + x] || null; },
      rect: function (x, y, ww, hh, c) { for (var j = 0; j < hh; j++) for (var i = 0; i < ww; i++) P.set(x + i, y + j, c); },
      outline: function (col, diag) {
        var add = [];
        for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
          if (px[y * w + x]) continue;
          var n = P.get(x + 1, y) || P.get(x - 1, y) || P.get(x, y + 1) || P.get(x, y - 1) || (diag && (P.get(x + 1, y + 1) || P.get(x - 1, y - 1) || P.get(x + 1, y - 1) || P.get(x - 1, y + 1)));
          if (n && n !== col) add.push(y * w + x);
        }
        add.forEach(function (i) { px[i] = col; });
      },
      rows: function (rows, key, ox, oy) { rows.forEach(function (r, y) { for (var x = 0; x < r.length; x++) { var ch = r.charAt(x); if (ch === '.' || ch === ' ') continue; P.set((ox || 0) + x, (oy || 0) + y, key[ch]); } }); },
      canvas: function () {
        var c = mkCanvas(w, h); if (!c) return null; var g = c.getContext('2d');
        for (var i = 0; i < w * h; i++) if (px[i]) { g.fillStyle = px[i]; g.fillRect(i % w, (i / w) | 0, 1, 1); }
        return c;
      }
    };
    return P;
  }
  // shaded ellipse: ramp = [dark, mid, light, hi]; light from the upper left; o = {top: only y <= cy, spec: highlight spot}
  function blob(P, cx, cy, rx, ry, ramp, o) {
    o = o || {};
    for (var y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (var x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      var nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, d = nx * nx + ny * ny;
      if (d > 1) continue; if (o.top && y + 0.5 > cy) continue; if (o.bottom && y + 0.5 < cy) continue;
      var nz = Math.sqrt(Math.max(0, 1 - d)), lum = -0.55 * nx - 0.65 * ny + 0.55 * nz;
      var k = lum > 0.78 ? 3 : lum > 0.38 ? 2 : lum > -0.05 ? 1 : 0;
      if (k === 3 && !o.spec) k = 2;
      if (d > 0.82 && k > 1 && ny > -0.2) k = 1;
      P.set(x, y, ramp[k]);
    }
  }
  function cached(key, fn) { if (SPR[key] !== undefined) return SPR[key]; var v = null; try { v = fn(); } catch (e) { warn('art ' + key, e); } SPR[key] = v; return v; }

  /* ---------- hero: hooded wanderer, 4 facings, 4-frame walk (side 'left' is a painted variant: light stays top-left) ---------- */
  var HERO_KEY = { H: '#5cb0a4', h: '#2f7a76', d: '#1c4a52', D: '#12303a', s: '#f2c8a0', S: '#c88e6a', e: '#1a1024', r: '#d0463c', R: '#8a2430',
    b: '#6a4428', y: '#f0c860', l: '#3c3450', L: '#2a2438', k: '#6a4226', K: '#40261a', w: '#fff4e0', m: '#a8b4c8', M: '#6a7488' };
  var HERO = {
    down: ['....DDDDDD....', '...DHHhhhhdD..', '..DHHhhhhhhdD.', '..DHhhhhhhhdD.', '..DhdssssssdD.', '..DhsesssesdD.', '..DhsssssSSdD.', '...DrrRrrrRD..',
      '..DhrrrrRRRdD.', '.DHhhhhhhhhddD', '.DShhbbybbhdSD', '.DDhhhhhhhhdDD', '..DhhhhhhhddD.'],
    up: ['....DDDDDD....', '...DHHhhhhdD..', '..DHHhhhhhhdD.', '..DHhhhhhhhdD.', '..DHhhhhhhhdD.', '..DhhhhhhhhdD.', '..DhhhhhhhddD.', '...DrrrrrRRD..',
      '..DHhhhhhhhdD.', '.DHhhmhhhhhddD', '.DShhMhhhhhdSD', '.DDhhhhhhhhdDD', '..DhhhhhhhddD.'],
    side: ['....DDDDDD....', '...DHHhhhhhD..', '..DHHhhhhhhhD.', '..DHhhhhhssSD.', '..DHhhhhsssesD', '..DhhhhhssssSD', '..DhhhhhsssSD.', '...DhhrrrrRD..',
      '...DHhhhhhdD..', '..DHhhhhhhhdD.', '..DHhhhbyhhdD.', '..DhhhhhhhsSD.', '...DhhhhhddD..']
  };
  var HERO_LEGS = {
    front: [['...DllD.DlLD..', '...DkkD.DkKD..', '...DDDD.DDDD..'], ['...DllD.DlLD..', '...DkkD.DDDD..', '...DDDD.......'],
      ['...DllD.DlLD..', '...DkkD.DkKD..', '...DDDD.DDDD..'], ['...DllD.DlLD..', '...DDDD.DkKD..', '........DDDD..']],
    side: [['...DllllD.....', '...DkkkKD.....', '...DDDDDD.....'], ['..DllD.DLLD...', '.DkkD...DKKD..', '.DDD.....DDD..'],
      ['...DllllD.....', '...DkkkKD.....', '...DDDDDD.....'], ['...DLlD.DlD...', '..DKKD.DkkD...', '..DDD..DDD....']]
  };
  function heroSprite(dir, frame, flash) {
    return cached('hero:' + dir + frame + (flash ? 'f' : ''), function () {
      var P = Pix(16, 18), side = dir === 'left' || dir === 'right', rows = HERO[side ? 'side' : dir], legs = HERO_LEGS[side ? 'side' : 'front'][frame % 4];
      var bob = frame % 2 ? 1 : 0, key = HERO_KEY;
      var all = rows.concat(legs);
      if (dir === 'left') {
        var SW = { H: 'd', d: 'H' }; all = all.map(function (r) { var o = ''; for (var i = r.length - 1; i >= 0; i--) { var c = r.charAt(i); o += SW[c] || c; } return o; });
      }
      all.forEach(function (r, y) { for (var x = 0; x < r.length; x++) { var c = r.charAt(x); if (c === '.') continue; var yy = y + (y < 13 ? bob : 0) + 1; P.set(x + 1, yy, c === 'D' ? (flash ? '#ffffff' : OL) : key[c]); } });
      return P.canvas();
    });
  }

  /* ---------- monsters (procedural pixel painting, light from the top left, eyes on the facing side) ---------- */
  var LOOKS = {
    slime: { w: 18, h: 16, ramp: ['#1f5a2e', '#3a9a44', '#6cd060', '#d8ffc0'], eye: '#10240f' },
    ember: { w: 18, h: 22, ramp: ['#6a1a0e', '#c8401e', '#f07a34', '#ffd0a0'], eye: '#2a0804', light: '#ff8a3a' },
    bat: { w: 22, h: 14, ramp: ['#2a1838', '#4a2c60', '#6e4a8a', '#b090d0'], eye: '#ff5a4a', fly: 7 },
    spore: { w: 16, h: 17, ramp: ['#5a1a1a', '#a8322a', '#e0603a', '#ffb090'], stem: ['#9a8a72', '#d8c8a8', '#f4ead4'], eye: '#2a1414' },
    wisp: { w: 14, h: 18, ramp: ['#1a3a8a', '#2e7ae0', '#7ac8ff', '#f0fbff'], eye: '#0c1a40', fly: 5, light: '#7ac8ff' },
    crown: { w: 28, h: 30, ramp: ['#1c1030', '#3a2258', '#5a3a80', '#8a6ab0'], eye: '#ffe066', fly: 6, light: '#c08aff' }
  };
  function lookOf(def) { return LOOKS[def && def.look] || LOOKS.slime; }
  function rampOf(def) {
    var L = lookOf(def), p = def && def.palette;
    if (!p) return L.ramp;
    return [p.dark || L.ramp[0], p.main || L.ramp[1], p.light || L.ramp[2], p.hi || mix(p.light || L.ramp[2], '#ffffff', 0.6)];
  }
  // one monster frame: facing 'left' | 'right', frame 0..3, flash = white silhouette
  function monsterSprite(def, facing, frame, flash) {
    var look = (def && def.look) || 'slime';
    return cached('m:' + (def && def.__id) + ':' + facing + frame + (flash ? 'f' : ''), function () {
      var L = lookOf(def), R = rampOf(def), eye = (def && def.palette && def.palette.eye) || L.eye, P = Pix(L.w, L.h), s = facing === 'left' ? -1 : 1;
      var cx = L.w / 2;
      if (look === 'slime' || look === 'ember') {
        var sq = frame === 4 ? [5.4, 6.6, 0] : [[6.6, 5.2, 0], [7.2, 4.6, 0], [6.0, 5.8, 0], [6.3, 5.4, 0]][frame % 4];
        var cy = L.h - 1 - sq[1];
        blob(P, cx, cy, sq[0], sq[1], R, { spec: true });
        // inner shading bubbles and a glossy rim
        P.set(cx - 3, cy - sq[1] + 2, R[3]); P.set(cx - 2, cy - sq[1] + 1, R[3]); P.set(cx - 4, cy - sq[1] + 3, R[2]);
        P.set(cx + 2, cy + 2, R[0]); P.set(cx + 3, cy + 1, R[0]);
        var ex = Math.round(cx + s * 1.5), ey = Math.round(cy - 1);
        [[ex - 2, ey], [ex + 2, ey]].forEach(function (e) { P.set(e[0], e[1], eye); P.set(e[0], e[1] + 1, eye); P.set(e[0] + (s > 0 ? 0 : 0), e[1] - 0, eye); P.set(e[0], e[1], '#ffffff'); });
        P.set(ex - 2, ey + 1, eye); P.set(ex + 2, ey + 1, eye);
        P.set(ex, ey + 3, R[0]); P.set(ex + s, ey + 3, R[0]);
        if (frame === 4) { P.set(ex - 1, ey + 3, '#1a0a0a'); P.set(ex, ey + 3, '#1a0a0a'); P.set(ex + 1, ey + 3, '#1a0a0a'); P.set(ex, ey + 4, '#1a0a0a'); }
        if (look === 'ember') {
          // a crown of flame on the head: three tongues that flicker per frame, white-hot at the root
          var top = Math.round(cy - sq[1]), FL = ['#ff4a12', '#ff9a2a', '#ffe070', '#fffbe0'], hs = [[-3, 4], [0, 6], [3, 4]], fl = frame % 4;
          hs.forEach(function (q, i) { var hgt = q[1] + ((fl + i) % 3 === 0 ? 1 : 0) - ((fl + i) % 3 === 2 ? 1 : 0); for (var j = 0; j < hgt; j++) { var wdt = j < hgt - 2 ? 1 : 0, c2 = j < 1 ? FL[3] : j < 2 ? FL[2] : j < hgt - 1 ? FL[1] : FL[0]; for (var k = -wdt; k <= wdt; k++) P.set(Math.round(cx + q[0] + k + (j > hgt - 3 ? (i - 1) * 0.5 : 0)), top - j + 1, c2); } });
          [[ex - 2, ey], [ex + 2, ey]].forEach(function (e) { P.set(e[0], e[1], '#fff2a0'); P.set(e[0], e[1] + 1, '#ffb030'); });
        }
        P.outline(OL);
      } else if (look === 'bat') {
        var wy = frame === 4 ? -4 : [-3, 0, 3, 0][frame % 4], by = 6;
        // wings: membrane from the body to the tips, scalloped trailing edge
        for (var side = -1; side <= 1; side += 2) {
          for (var i = 0; i < 8; i++) {
            var x = Math.round(cx + side * (3 + i)), top = Math.round(by - 1 + (wy * i) / 7 - (i < 3 ? 1 : 0)), len = Math.max(1, 4 - Math.floor(i / 2) - ((i % 3) === 2 ? 1 : 0));
            for (var j = 0; j < len; j++) P.set(x, top + j, j === 0 ? R[2] : j === 1 ? R[1] : R[0]);
          }
          P.set(Math.round(cx + side * 10), Math.round(by - 1 + wy) , R[2]);
        }
        blob(P, cx, by + 1, 3.4, 3.2, R, { spec: true });
        P.set(cx - 2, by - 3, R[1]); P.set(cx - 2, by - 2, R[1]); P.set(cx + 1, by - 3, R[1]); P.set(cx + 1, by - 2, R[1]);   // ears
        var bx = Math.round(cx - 0.5 + s * 1);
        P.set(bx - 1, by + 1, eye); P.set(bx + 1, by + 1, eye);
        P.set(bx + (s > 0 ? 1 : -1), by + 3, '#f4ead4');                                                                 // fang
        if (frame === 4) { P.set(bx, by + 3, '#2a0a10'); P.set(bx - s, by + 3, '#f4ead4'); }
        P.outline(OL);
      } else if (look === 'spore') {
        var hop = frame === 4 ? -2 : [0, -1, 1, 0][frame % 4], base = L.h - 1;
        var st = L.stem;
        P.rect(cx - 3, base - 6 + hop, 6, 5 - hop, st[1]); P.rect(cx - 3, base - 6 + hop, 1, 5 - hop, st[2]); P.rect(cx + 2, base - 6 + hop, 1, 5 - hop, st[0]);
        P.set(cx - 3, base, st[0]); P.set(cx - 2, base, st[0]); P.set(cx + 1, base, st[0]); P.set(cx + 2, base, st[0]);    // feet
        var fx = Math.round(cx - 0.5 + s * 1);
        P.set(fx - 1, base - 4 + hop, eye); P.set(fx + 1, base - 4 + hop, eye); P.set(fx, base - 2 + hop, st[0]);
        blob(P, cx, base - 6 + hop, 7, 5.5, R, { top: true, spec: true });
        P.rect(cx - 6, base - 6 + hop, 12, 1, R[0]);
        [[-3, -9], [2, -10], [4, -7], [-5, -7], [0, -8]].forEach(function (q) { P.set(cx + q[0], base + q[1] + hop, '#f8ecd8'); });
        P.outline(OL);
      } else if (look === 'wisp') {
        var fl = frame === 4 ? 2 : [0, 1, 0, -1][frame % 4];
        for (var y = 0; y < L.h - 4; y++) {
          var u = y / (L.h - 5), wdt = u < 0.45 ? 1 + u * 9 : 5 - (u - 0.45) * 2, off = Math.round(Math.sin(u * 6 + frame) * (1 - u) * 1.5) + (y < 5 ? fl : 0);
          for (var x2 = -Math.floor(wdt); x2 <= Math.floor(wdt); x2++) {
            var e = Math.abs(x2) / Math.max(1, wdt), k = e > 0.8 ? 0 : e > 0.5 ? 1 : u > 0.35 && e < 0.3 ? 3 : 2;
            if (x2 < -wdt * 0.3 && k === 1 && u > 0.4) k = 2;
            P.set(Math.round(cx + x2 + off), y + 1, R[k]);
          }
        }
        var wx = Math.round(cx - 0.5 + s * 1.2), wy2 = L.h - 9;
        P.set(wx - 1, wy2, eye); P.set(wx + 1, wy2, eye); P.set(wx - 1, wy2 + 1, eye); P.set(wx + 1, wy2 + 1, eye);
        P.outline(shade(R[0], 0.6));
      } else if (look === 'crown') {
        var sw = [0, 1, 0, -1][frame % 4], top = 8;
        // cloak: a hooded teardrop with a tattered hem that sways
        for (var y3 = top; y3 < L.h - 1; y3++) {
          var u3 = (y3 - top) / (L.h - 1 - top), half = u3 < 0.3 ? 4 + u3 * 18 : 9.4 + u3 * 2.5;
          for (var x3 = -Math.floor(half); x3 <= Math.floor(half); x3++) {
            var hem = y3 > L.h - 5 && ((x3 + sw + 20) % 4 === 0 || (x3 + sw + 21) % 4 === 0) && y3 > L.h - 3;
            if (hem) continue;
            var e3 = x3 / half, k3 = e3 < -0.55 ? 2 : e3 > 0.45 ? 0 : 1;
            if (u3 < 0.15 && e3 < 0) k3 = 2;
            if (Math.abs(x3 + 3) < 1 && u3 > 0.35) k3 = 0;
            if (Math.abs(x3 - 3) < 1 && u3 > 0.4) k3 = 0;
            P.set(Math.round(cx + x3 - 0.5), y3, R[k3]);
          }
        }
        // hollow face and eyes
        for (var y4 = top + 2; y4 < top + 8; y4++) for (var x4 = -4; x4 <= 3; x4++) if ((x4 + 0.5) * (x4 + 0.5) / 18 + (y4 - top - 4.5) * (y4 - top - 4.5) / 10 < 1) P.set(Math.round(cx + x4), y4, '#07040c');
        var ex2 = Math.round(cx + s * 1.2);
        P.set(ex2 - 2, top + 4, eye); P.set(ex2 - 1, top + 4, eye); P.set(ex2 + 1, top + 4, eye); P.set(ex2 + 2, top + 4, eye);
        P.set(ex2 - 2, top + 5, '#c89a20'); P.set(ex2 + 2, top + 5, '#c89a20');
        // crown
        var cr = ['#7a4a10', '#d8a030', '#ffe070', '#fff8c0'];
        for (var x5 = -5; x5 <= 5; x5++) { P.set(Math.round(cx + x5), top - 1, x5 < -2 ? cr[2] : x5 > 2 ? cr[0] : cr[1]); P.set(Math.round(cx + x5), top, cr[0]); }
        [-5, -2, 1, 4].forEach(function (q, i) { P.set(Math.round(cx + q), top - 2, cr[i < 2 ? 2 : 1]); P.set(Math.round(cx + q), top - 3, cr[i < 2 ? 3 : 2]); P.set(Math.round(cx + q + 1), top - 2, cr[1]); });
        P.set(Math.round(cx - 0.5), top - 1, '#ff3a6a'); P.set(Math.round(cx + 0.5), top - 1, '#c01a40');
        // claws
        var hx = Math.round(cx + s * (frame === 4 ? 11 : 9)), hy = top + (frame === 4 ? 8 : 13) + sw;
        P.set(hx, hy, '#d8d0e8'); P.set(hx + s, hy + 1, '#d8d0e8'); P.set(hx, hy + 1, '#a8a0c0'); P.set(hx - s, hy + 1, '#d8d0e8');
        P.outline(OL);
      } else { blob(P, cx, L.h / 2, L.w / 2 - 1, L.h / 2 - 1, R); P.outline(OL); }
      if (flash) { var F = Pix(L.w, L.h); for (var yy = 0; yy < L.h; yy++) for (var xx = 0; xx < L.w; xx++) if (P.get(xx, yy)) F.set(xx, yy, '#ffffff'); return F.canvas(); }
      return P.canvas();
    });
  }

  /* ---------- items, chests, features ---------- */
  var ITEM_ART = {
    potion: ['...kk...', '...KK...', '..gwgg..', '.gwllg..', 'gwlllLg.', 'glllLLg.', 'gLLLLLg.', '.gggggg.'],
    coins: ['..oooo....', '.oyyYYo...', '.oYYYYoooo', '..oooooyyo', 'ooooo.oYYo', 'oyyYYooooo', 'oYYYYYYYo.', '.ooooooo..'],
    scroll: ['.oooooooo.', 'opppppppPo', '.oppqqppo.', '.opppqppo.', '.oppqqqpo.', '.oppppppo.', 'opppppppPo', '.oooooooo.'],
    shard: ['....o...', '...olo..', '..ollLo.', '.ollwLLo', '.olwlLLo', '..olLLo.', '...oLo..', '....o...'],
    heart: ['.oo..oo.', 'olwLolLo', 'owlllLLo', 'olllLLLo', '.olllLo.', '..olLo..', '...oo...']
  };
  function itemSprite(def) {
    var look = def && def.look;
    return cached('item:' + (def && def.__id) + ':' + look, function () {
      var rows = ITEM_ART[look] || ITEM_ART.coins, P = Pix(12, 10), col = (def && def.color) || '#e8364a';
      var key = { o: OL, k: '#c8a070', K: '#8a6040', g: '#a8c4d8', w: '#ffffff', l: col, L: shade(col, 0.62), y: '#ffe070', Y: '#d8a030', p: '#f0e2c0', P: '#c8b088', q: '#8a6a4a' };
      if (look === 'shard' || look === 'heart') key.w = mix(col, '#ffffff', 0.75);
      P.rows(rows, key, Math.floor((12 - rows[0].length) / 2), 10 - rows.length);
      if (look === 'potion') P.outline(OL);
      return P.canvas();
    });
  }
  var CHEST = {
    closed: ['..oooooooooo..', '.oNNNNNNNNNNo.', 'oNnnnnnnnnnnBo', 'onnnnnnnnnnnBo', 'oyyyyyyyyyyyYo', 'oBbbbbyYbbbbBo', 'obbbbbYYbbbbBo', 'obbbbbbbbbbbBo', 'oyyyyyyyyyyyYo', 'oBbbbbbbbbbbBo', '.oooooooooooo.'],
    open: ['..oooooooooo..', '.oDDDDDDDDDDo.', 'oDNNNNNNNNNNDo', 'oNwwuwuuwuwwNo', 'oyyyyyyyyyyyYo', 'oBbbbbbbbbbbBo', 'obbbbbbbbbbbBo', 'obbbbbbbbbbbBo', 'oyyyyyyyyyyyYo', 'oBbbbbbbbbbbBo', '.oooooooooooo.']
  };
  function chestSprite(open) {
    return cached('chest:' + open, function () {
      var P = Pix(14, 11); P.rows(CHEST[open ? 'open' : 'closed'], { o: OL, N: '#c88a4c', n: '#a06a38', b: '#7a4a28', B: '#4e2e1a', y: '#e8c060', Y: '#a87a28', D: '#2a1810', w: '#fff4b0', u: '#ffd060' }); return P.canvas();
    });
  }

  /* ---------- floor and wall tiles (baked once per floor into one ground canvas) ---------- */
  var FLOOR_STYLES = {
    flag: { base: '#3d3548', light: '#4b4258', dark: '#2f2839', gap: '#211b29' },
    tile: { base: '#373c50', light: '#454b62', dark: '#2b2f40', gap: '#1d2030' },
    brick: { base: '#46383a', light: '#564547', dark: '#372b2d', gap: '#241b1e' },
    moss: { base: '#34403a', light: '#41503f', dark: '#28322d', gap: '#1a221e' },
    path: { base: '#322b3a', light: '#3d3546', dark: '#272130', gap: '#1b1622' },
    throne: { base: '#3a2c48', light: '#4a3a5c', dark: '#2c2038', gap: '#1c1426' }
  };
  var WC = { top: '#2a2236', topHi: '#3c3250', rim: '#5a4c70', rimHi: '#7a6a90', mortar: '#211a2a', brick: ['#4a3f58', '#54485f', '#5e526a', '#463b52'], brickHi: '#71658a', brickLo: '#352c40', base: '#1a1422' };
  function floorStyle(map, x, y, lib) {
    var r = map.room[y * map.w + x];
    if (r < 0) return FLOOR_STYLES.path;
    var room = map.rooms[r], def = lib.rooms[room.type] || {};
    if (room.type === 'throne') return FLOOR_STYLES.throne;
    var f = def.floor; if (f && typeof f === 'object') return f;
    return FLOOR_STYLES[f] || FLOOR_STYLES.flag;
  }
  function paintFloor(g, map, x, y, lib) {
    var st = floorStyle(map, x, y, lib), X = x * T, Y = y * T, sd = map.seed + map.floor * 13;
    var corridor = map.room[y * map.w + x] < 0, roomDef = corridor ? null : lib.rooms[map.rooms[map.room[y * map.w + x]].type];
    var styleKey = corridor ? 'path' : roomDef && typeof roomDef.floor === 'string' ? roomDef.floor : 'flag';
    g.fillStyle = st.gap; g.fillRect(X, Y, T, T);
    if (styleKey === 'tile' || map.rooms[map.room[y * map.w + x]] && map.rooms[map.room[y * map.w + x]].type === 'throne') {
      for (var j = 0; j < 2; j++) for (var i = 0; i < 2; i++) {
        var v = hash(x * 2 + i, y * 2 + j, sd), c = v < 0.25 ? st.dark : v > 0.85 ? st.light : st.base;
        g.fillStyle = c; g.fillRect(X + i * 8 + 1, Y + j * 8 + 1, 7, 7);
        g.fillStyle = st.light; g.fillRect(X + i * 8 + 1, Y + j * 8 + 1, 7, 1); g.fillRect(X + i * 8 + 1, Y + j * 8 + 1, 1, 7);
        g.fillStyle = st.dark; g.fillRect(X + i * 8 + 2, Y + j * 8 + 7, 6, 1);
      }
    } else if (styleKey === 'brick') {
      for (var row = 0; row < 4; row++) {
        var off = (row + y) % 2 ? 4 : 0;
        for (var b = -1; b < 2; b++) {
          var bx = X + b * 8 + off, v2 = hash(x * 3 + b, y * 4 + row, sd);
          var c2 = v2 < 0.3 ? st.dark : v2 > 0.8 ? st.light : st.base;
          var x0 = Math.max(X, bx + 1), x1 = Math.min(X + T, bx + 8); if (x1 <= x0) continue;
          g.fillStyle = c2; g.fillRect(x0, Y + row * 4 + 1, x1 - x0, 3);
          g.fillStyle = st.light; g.fillRect(x0, Y + row * 4 + 1, x1 - x0, 1);
        }
      }
    } else {
      // flagstones: four irregular stones per cell (split lines jittered per cell)
      var sx = 5 + Math.floor(hash(x, y, sd + 1) * 6), sy = 5 + Math.floor(hash(x, y, sd + 2) * 6);
      var rects = [[0, 0, sx, sy], [sx, 0, T - sx, sy], [0, sy, sx, T - sy], [sx, sy, T - sx, T - sy]];
      if (hash(x, y, sd + 3) < 0.3) rects = [[0, 0, T, sy], [0, sy, sx, T - sy], [sx, sy, T - sx, T - sy]];
      rects.forEach(function (r, k) {
        var v3 = hash(x * 4 + k, y * 4 + k, sd + 4), c3 = v3 < 0.22 ? st.dark : v3 > 0.82 ? st.light : st.base;
        if (r[2] < 2 || r[3] < 2) return;
        g.fillStyle = c3; g.fillRect(X + r[0] + 1, Y + r[1] + 1, r[2] - 1, r[3] - 1);
        g.fillStyle = mix(c3, '#ffffff', 0.08); g.fillRect(X + r[0] + 1, Y + r[1] + 1, r[2] - 1, 1); g.fillRect(X + r[0] + 1, Y + r[1] + 1, 1, r[3] - 1);
        g.fillStyle = mix(c3, '#000000', 0.18); g.fillRect(X + r[0] + 2, Y + r[1] + r[3] - 1, r[2] - 2, 1);
      });
      // speckle and a crack now and then
      for (var q = 0; q < 3; q++) { var hx = Math.floor(hash(x, y, sd + 10 + q) * 14) + 1, hy = Math.floor(hash(x, y, sd + 20 + q) * 14) + 1; g.fillStyle = q ? st.dark : st.light; g.fillRect(X + hx, Y + hy, 1, 1); }
      if (hash(x, y, sd + 30) < 0.12) { g.fillStyle = st.gap; var cx = X + 3 + Math.floor(hash(x, y, sd + 31) * 9), cy = Y + 3 + Math.floor(hash(x, y, sd + 32) * 9); g.fillRect(cx, cy, 1, 1); g.fillRect(cx + 1, cy + 1, 1, 1); g.fillRect(cx + 1, cy + 2, 1, 1); g.fillRect(cx + 2, cy + 3, 1, 1); }
      if (styleKey === 'moss') { for (var q2 = 0; q2 < 4; q2++) if (hash(x, y, sd + 40 + q2) < 0.55) { g.fillStyle = q2 % 2 ? '#4a6a3a' : '#5a7e44'; g.fillRect(X + Math.floor(hash(x, y, sd + 50 + q2) * 13) + 1, Y + Math.floor(hash(x, y, sd + 60 + q2) * 13) + 1, 2, 1); } }
    }
    // edge shading (floor autotile): shadows cast by walls to the north, west and east, and inner corners
    var wN = isWallish(map, x, y - 1), wW = isWallish(map, x - 1, y), wE = isWallish(map, x + 1, y), wNW = isWallish(map, x - 1, y - 1), wNE = isWallish(map, x + 1, y - 1);
    g.fillStyle = 'rgba(8,4,16,0.55)';
    if (wN) { g.fillRect(X, Y, T, 3); g.fillStyle = 'rgba(8,4,16,0.28)'; g.fillRect(X, Y + 3, T, 2); g.fillStyle = 'rgba(8,4,16,0.55)'; }
    if (wW) g.fillRect(X, Y + (wN ? 3 : 0), 2, T - (wN ? 3 : 0));
    if (wE) { g.fillStyle = 'rgba(8,4,16,0.35)'; g.fillRect(X + T - 1, Y + (wN ? 3 : 0), 1, T - (wN ? 3 : 0)); }
    g.fillStyle = 'rgba(8,4,16,0.5)';
    if (!wN && !wW && wNW) g.fillRect(X, Y, 2, 2);
    if (!wN && !wE && wNE) g.fillRect(X + T - 2, Y, 2, 2);
  }
  function tileAt(map, x, y) { return x < 0 || y < 0 || x >= map.w || y >= map.h ? ROCK : map.tiles[y * map.w + x]; }
  function isWallish(map, x, y) { var t = tileAt(map, x, y); return t === WALL || t === ROCK; }
  function isOpenT(map, x, y) { var t = tileAt(map, x, y); return t === FLOOR || t === DOOR || t === STAIRS; }
  // wall piece for autotiling: face (floor or door below) or top, plus which sides meet open floor
  function wallPiece(map, x, y) {
    var below = tileAt(map, x, y + 1);
    return { face: below === FLOOR || below === STAIRS || below === DOOR, n: isOpenT(map, x, y - 1), e: isOpenT(map, x + 1, y), w: isOpenT(map, x - 1, y), s: isOpenT(map, x, y + 1),
      ne: isOpenT(map, x + 1, y - 1), nw: isOpenT(map, x - 1, y - 1), se: isOpenT(map, x + 1, y + 1), sw: isOpenT(map, x - 1, y + 1),
      faceW: tileAt(map, x - 1, y) === WALL && isOpenT(map, x - 1, y + 1), faceE: tileAt(map, x + 1, y) === WALL && isOpenT(map, x + 1, y + 1) };
  }
  function paintWall(g, map, x, y) {
    var X = x * T, Y = y * T, p = wallPiece(map, x, y), sd = map.seed + 77;
    // top surface (the wall's cap seen from above); a face tile keeps its top 4 px as the cap
    var capH = p.face ? 4 : T;
    g.fillStyle = WC.top; g.fillRect(X, Y, T, capH);
    // the cap is laid in large dark slabs: joints every 8 px (offset per row), a faint lit edge under each joint
    for (var yy = 0; yy < capH; yy++) {
      var wy = Y + yy;
      if (wy % 8 === 0) { g.fillStyle = '#1f1828'; g.fillRect(X, wy, T, 1); continue; }
      if (wy % 8 === 1) { g.fillStyle = '#30283f'; g.fillRect(X, wy, T, 1); }
      var off = Math.floor(wy / 8) % 2 ? 4 : 0;
      for (var xx = 0; xx < T; xx++) if ((X + xx + off) % 12 === 0) { g.fillStyle = '#1f1828'; g.fillRect(X + xx, wy, 1, 1); }
    }
    for (var q = 0; q < 4; q++) { var hx = Math.floor(hash(x, y, sd + q) * 15), hy = Math.floor(hash(x, y, sd + 9 + q) * Math.max(1, capH - 1)); g.fillStyle = q % 2 ? WC.topHi : '#1f1828'; g.fillRect(X + hx, Y + hy, 1, 1); }
    // rims where the cap meets open floor (outer edges), with corner pixels trimmed (outer corners) and notches (inner corners)
    g.fillStyle = WC.rim;
    if (p.n) { g.fillRect(X, Y, T, 2); g.fillStyle = WC.rimHi; g.fillRect(X, Y, T, 1); g.fillStyle = WC.rim; }
    if (p.w) { g.fillRect(X, Y, 2, capH); g.fillStyle = WC.rimHi; g.fillRect(X, Y, 1, capH); g.fillStyle = WC.rim; }
    if (p.e) { g.fillStyle = '#3e3352'; g.fillRect(X + T - 2, Y, 2, capH); g.fillStyle = WC.rim; }
    if (!p.face && p.s) { g.fillStyle = '#3e3352'; g.fillRect(X, Y + T - 2, T, 2); }
    if (!p.n && !p.w && p.nw) { g.fillStyle = WC.rimHi; g.fillRect(X, Y, 2, 1); g.fillRect(X, Y, 1, 2); }
    if (!p.n && !p.e && p.ne) { g.fillStyle = WC.rim; g.fillRect(X + T - 2, Y, 2, 1); g.fillRect(X + T - 1, Y, 1, 2); }
    if (!p.face && !p.s && !p.w && p.sw) { g.fillStyle = '#3e3352'; g.fillRect(X, Y + T - 1, 2, 1); }
    if (!p.face && !p.s && !p.e && p.se) { g.fillStyle = '#3e3352'; g.fillRect(X + T - 2, Y + T - 1, 2, 1); }
    g.fillStyle = OL;
    if (p.n && p.w) g.fillRect(X, Y, 1, 1);
    if (p.n && p.e) g.fillRect(X + T - 1, Y, 1, 1);
    if (!p.face) return;
    // the face: brick courses with offset joints, light on the upper edge of each brick, a dark base where it meets the floor
    var FY = Y + capH;
    g.fillStyle = WC.rimHi; g.fillRect(X, FY - 1, T, 1);
    g.fillStyle = WC.mortar; g.fillRect(X, FY, T, T - capH);
    for (var row = 0; row < 3; row++) {
      var off = (row + x) % 2 ? 4 : 0, by = FY + row * 4;
      for (var b = -1; b < 2; b++) {
        var bx = X + b * 8 + off, x0 = Math.max(X, bx + 1), x1 = Math.min(X + T, bx + 8); if (x1 <= x0) continue;
        var v = hash(x * 3 + b, y * 3 + row, sd + 5), c = WC.brick[Math.floor(v * 4)];
        g.fillStyle = c; g.fillRect(x0, by + 1, x1 - x0, 3);
        g.fillStyle = mix(c, WC.brickHi, 0.55); g.fillRect(x0, by + 1, x1 - x0, 1);
        g.fillStyle = WC.brickLo; g.fillRect(x0, by + 3, x1 - x0, 1);
        if (v > 0.9) { g.fillStyle = WC.mortar; g.fillRect(x0 + 2, by + 2, 1, 1); g.fillRect(x0 + 3, by + 3, 1, 1); }
      }
    }
    // face ends: a lit left edge and a shaded right edge where the face turns a corner
    if (!p.faceW) { g.fillStyle = 'rgba(160,140,190,0.35)'; g.fillRect(X, FY, 1, T - capH); }
    if (!p.faceE) { g.fillStyle = 'rgba(6,2,12,0.45)'; g.fillRect(X + T - 2, FY, 2, T - capH); }
    g.fillStyle = WC.base; g.fillRect(X, Y + T - 1, T, 1);
    // moss or a drip stain at the foot now and then
    var hv = hash(x, y, sd + 40);
    if (hv < 0.18) { g.fillStyle = '#3c5a34'; g.fillRect(X + 2 + Math.floor(hv * 40) % 10, Y + T - 3, 3, 2); g.fillStyle = '#56783e'; g.fillRect(X + 3 + Math.floor(hv * 40) % 10, Y + T - 3, 1, 1); }
    else if (hv > 0.9) { g.fillStyle = 'rgba(20,14,30,0.5)'; g.fillRect(X + 5 + Math.floor(hv * 70) % 7, FY + 2, 1, 8); }
  }
  function paintStairs(g, x, y) {
    var X = x * T, Y = y * T;
    g.fillStyle = '#0a0612'; g.fillRect(X + 1, Y + 1, 14, 14);
    var steps = ['#6a5e7e', '#544a66', '#3e364e', '#2a2438', '#1a1626'];
    for (var i = 0; i < 5; i++) { g.fillStyle = steps[i]; g.fillRect(X + 2 + i, Y + 2 + i * 2.6 | 0, 12 - i, 2); g.fillStyle = mix(steps[i], '#ffffff', 0.18); g.fillRect(X + 2 + i, (Y + 2 + i * 2.6) | 0, 12 - i, 1); }
    g.fillStyle = '#7a6c92'; g.fillRect(X, Y, T, 1); g.fillRect(X, Y, 1, T);
    g.fillStyle = '#241c30'; g.fillRect(X + T - 1, Y, 1, T); g.fillRect(X, Y + T - 1, T, 1);
  }
  // decor kinds (each fits inside its 16 px cell); v = 0..1 variation; t = ms (animated kinds)
  var DECOR = {
    rubble: function (g, X, Y, v) { var pts = [[3, 10, 3], [8, 12, 2], [11, 8, 2], [6, 6, 1], [12, 13, 1]]; pts.forEach(function (p, i) { if (i > 2 + v * 3) return; g.fillStyle = '#1e1828'; g.fillRect(X + p[0], Y + p[1] + 1, p[2] + 1, 1); g.fillStyle = '#5e5470'; g.fillRect(X + p[0], Y + p[1], p[2], p[2] > 1 ? 2 : 1); g.fillStyle = '#7e7290'; g.fillRect(X + p[0], Y + p[1], 1, 1); }); },
    bones: function (g, X, Y, v) {
      var B = '#e6dcc4', b = '#b0a488', o = '#3a3040', fx = v < 0.5 ? 0 : 1;
      g.fillStyle = o; g.fillRect(X + 3, Y + 10, 9, 3); g.fillStyle = B; g.fillRect(X + 4, Y + 11, 7, 1); g.fillRect(X + 3, Y + 10, 2, 1); g.fillRect(X + 3, Y + 12, 2, 1); g.fillRect(X + 10, Y + 10, 2, 1); g.fillRect(X + 10, Y + 12, 2, 1);
      if (v > 0.35) { var sx = X + 7 + fx * 2, sy = Y + 3; g.fillStyle = o; g.fillRect(sx - 1, sy - 1, 7, 7); g.fillStyle = B; g.fillRect(sx, sy, 5, 4); g.fillRect(sx + 1, sy + 4, 3, 1); g.fillStyle = b; g.fillRect(sx + 3, sy + 1, 2, 3); g.fillStyle = '#1a1220'; g.fillRect(sx + 1, sy + 2, 1, 1); g.fillRect(sx + 3, sy + 2, 1, 1); }
    },
    moss: function (g, X, Y, v) { var cols = ['#2e4a2a', '#3e6234', '#548042', '#6e9a4e']; for (var i = 0; i < 9; i++) { var px = 2 + Math.floor(hash(i, v * 1000, 5) * 11), py = 4 + Math.floor(hash(i, v * 1000, 6) * 10); g.fillStyle = cols[i % 4]; g.fillRect(X + px, Y + py, 2 + (i % 2), 1); } },
    puddle: function (g, X, Y, v, t) { g.fillStyle = '#1c2a3e'; g.fillRect(X + 3, Y + 6, 10, 5); g.fillRect(X + 2, Y + 7, 12, 3); g.fillStyle = '#2c4a66'; g.fillRect(X + 4, Y + 7, 8, 3); g.fillStyle = '#5a8ab0'; var sh = Math.floor((t || 0) / 400 + v * 7) % 4; g.fillRect(X + 4 + sh, Y + 7, 3, 1); g.fillStyle = '#a8d0f0'; g.fillRect(X + 5 + sh, Y + 7, 1, 1); },
    cobweb: function (g, X, Y, v, t, dc) {
      var L = dc && dc.corner === 'r'; g.fillStyle = 'rgba(220,214,236,0.55)';
      for (var i = 0; i < 9; i++) { g.fillRect(L ? X + 15 - i : X + i, Y + i * 0, 1, 1); g.fillRect(L ? X + 15 : X, Y + i, 1, 1); g.fillRect(L ? X + 15 - Math.floor(i * 0.7) : X + Math.floor(i * 0.7), Y + Math.floor(i * 0.7), 1, 1); }
      g.fillStyle = 'rgba(220,214,236,0.35)'; for (var j = 0; j < 6; j++) { g.fillRect(L ? X + 15 - j : X + j, Y + 4, 1, 1); g.fillRect(L ? X + 11 : X + 4, Y + j, 1, 1); }
    },
    urn: function (g, X, Y, v) {
      var P = cached('urn' + (v > 0.5 ? 1 : 0), function () { var Q = Pix(10, 13); var R = v > 0.5 ? ['#5a2a1a', '#8a4a2a', '#b8703e', '#e8a868'] : ['#2a3a4a', '#3e5a6e', '#5e8098', '#a8c8d8']; blob(Q, 5, 7.5, 4.2, 4.5, R, { spec: true }); Q.rect(3, 1, 4, 3, R[1]); Q.rect(3, 1, 1, 3, R[2]); Q.rect(2, 1, 6, 1, R[2]); Q.rect(2, 7, 6, 1, R[0]); Q.outline(OL); return Q.canvas(); });
      g.fillStyle = 'rgba(8,4,16,0.45)'; g.fillRect(X + 4, Y + 14, 9, 1); if (P) g.drawImage(P, X + 3, Y + 2);
    },
    crate: function (g, X, Y, v) {
      var P = cached('crate', function () { var Q = Pix(14, 14); Q.rect(1, 1, 12, 4, '#b07a44'); Q.rect(1, 1, 12, 1, '#d0a060'); Q.rect(1, 5, 12, 8, '#8a5a30'); Q.rect(1, 5, 12, 1, '#a06a38'); Q.rect(1, 12, 12, 1, '#5a3a20');
        Q.rect(2, 6, 1, 6, '#5a3a20'); Q.rect(11, 6, 1, 6, '#5a3a20'); for (var i = 0; i < 8; i++) Q.set(3 + i, 11 - i * 0.7, '#6a4426'); Q.rect(3, 2, 8, 1, '#8a5a30'); Q.outline(OL); return Q.canvas(); });
      g.fillStyle = 'rgba(8,4,16,0.45)'; g.fillRect(X + 2, Y + 14, 13, 2); if (P) g.drawImage(P, X + 1, Y + 1);
    },
    barrel: function (g, X, Y, v) {
      var P = cached('barrel', function () { var Q = Pix(12, 14); blob(Q, 6, 8, 5, 5.5, ['#5a3418', '#8a5428', '#b07438', '#d89a58']); Q.rect(1, 4, 10, 1, '#4a4a58'); Q.rect(1, 11, 10, 1, '#4a4a58'); Q.rect(2, 4, 3, 1, '#8a8aa0');
        for (var x = 2; x < 10; x++) { Q.set(x, 2, '#c08a4a'); Q.set(x, 3, '#7a4a24'); } Q.set(3, 2, '#e0b070'); Q.outline(OL); return Q.canvas(); });
      g.fillStyle = 'rgba(8,4,16,0.45)'; g.fillRect(X + 3, Y + 14, 11, 2); if (P) g.drawImage(P, X + 2, Y + 1);
    },
    candles: function (g, X, Y, v, t) {
      var c = [[4, 9, 5], [8, 7, 7], [11, 10, 4]];
      c.forEach(function (q, i) {
        var bx = X + q[0], by = Y + q[1]; g.fillStyle = '#3a2e30'; g.fillRect(bx - 1, by + q[2], 4, 1);
        g.fillStyle = '#e8dcc0'; g.fillRect(bx, by, 2, q[2]); g.fillStyle = '#b8a888'; g.fillRect(bx + 1, by + 1, 1, q[2] - 1);
        var fl = Math.floor(((t || 0) / 110 + i * 3 + v * 10)) % 3;
        g.fillStyle = '#ff9a3a'; g.fillRect(bx, by - 2, 2, 2); g.fillStyle = '#ffe080'; g.fillRect(bx + (fl === 1 ? 1 : 0), by - 3 - (fl === 2 ? 1 : 0), 1, 2);
      });
    },
    shrooms: function (g, X, Y, v, t) {
      var gl = 0.55 + 0.25 * Math.sin((t || 0) / 500 + v * 6);
      [[4, 10, 3], [9, 7, 4], [11, 12, 2]].forEach(function (q) {
        g.fillStyle = '#c8d8b0'; g.fillRect(X + q[0], Y + q[1], 1, q[2] + 1);
        g.fillStyle = 'rgba(120,255,200,' + (gl * 0.35) + ')'; g.fillRect(X + q[0] - 2, Y + q[1] - 3, 5, 4);
        g.fillStyle = '#4ae0b0'; g.fillRect(X + q[0] - 1, Y + q[1] - 1, 3, 1); g.fillStyle = '#9affe0'; g.fillRect(X + q[0], Y + q[1] - 2, 1, 1);
      });
    }
  };
  var ANIM_DECOR = { candles: 1, puddle: 1, shrooms: 1 };
  function drawDecor(g, dc, X, Y, t) {
    var f = typeof dc.kind === 'function' ? dc.kind : DECOR[dc.kind];
    if (typeof f === 'function') { try { f(g, X, Y, dc.v, t, dc); } catch (e) { warn('decor', e); } }
  }
  function bakeGround(map, lib) {
    var c = mkCanvas(map.w * T, map.h * T); if (!c) return null;
    var g = c.getContext('2d'); g.fillStyle = VOID; g.fillRect(0, 0, c.width, c.height);
    for (var y = 0; y < map.h; y++) for (var x = 0; x < map.w; x++) {
      var t = map.tiles[y * map.w + x];
      if (t === FLOOR || t === DOOR) paintFloor(g, map, x, y, lib);
      else if (t === STAIRS) { paintFloor(g, map, x, y, lib); paintStairs(g, x, y); }
      else if (t === WALL) paintWall(g, map, x, y);
    }
    map.decor.forEach(function (dc) { if (typeof dc.kind === 'string' && ANIM_DECOR[dc.kind]) return; drawDecor(g, dc, dc.x * T, dc.y * T, 0); });
    // a rug in front of the throne
    map.rooms.forEach(function (r) {
      if (r.type !== 'throne') return;
      var x0 = Math.round(r.cx) * T - 8, y0 = (r.y + 2) * T, h = (r.h - 2) * T - 4;
      g.fillStyle = '#3a0e1c'; g.fillRect(x0 + 2, y0, 28, h); g.fillStyle = '#7a1e30'; g.fillRect(x0 + 4, y0, 24, h); g.fillStyle = '#d8a030'; g.fillRect(x0 + 5, y0, 1, h); g.fillRect(x0 + 26, y0, 1, h);
      for (var yy = y0 + 6; yy < y0 + h - 4; yy += 10) { g.fillStyle = '#a83448'; g.fillRect(x0 + 13, yy, 6, 2); g.fillRect(x0 + 15, yy - 2, 2, 6); }
    });
    return c;
  }
  // doors: a face door (in a wall whose neighbours show faces) or a top-view door slab; open doors swing to the jamb
  function drawDoor(g, map, d, X, Y, t) {
    if (!d.door) return;
    var faceRow = d.axis === 'h' && wallPiece(map, d.x - 1, d.y).face;
    if (faceRow) {
      g.fillStyle = WC.top; g.fillRect(X, Y, T, 4); g.fillStyle = WC.rimHi; g.fillRect(X, Y + 3, T, 1);
      g.fillStyle = '#2a1e1a'; g.fillRect(X + 1, Y + 4, 14, 12);
      if (d.open) {
        g.fillStyle = '#0c0812'; g.fillRect(X + 3, Y + 5, 10, 11);
        g.fillStyle = '#7a4a28'; g.fillRect(X + 2, Y + 5, 2, 11); g.fillStyle = '#a06a38'; g.fillRect(X + 2, Y + 5, 1, 11);
      } else {
        g.fillStyle = '#8a5a30'; g.fillRect(X + 3, Y + 5, 10, 11);
        g.fillStyle = '#a87240'; for (var i = 0; i < 3; i++) g.fillRect(X + 3 + i * 4, Y + 5, 1, 11);
        g.fillStyle = '#5a3a20'; for (var j = 0; j < 3; j++) g.fillRect(X + 6 + j * 4, Y + 5, 1, 11);
        g.fillStyle = '#4a4a5a'; g.fillRect(X + 3, Y + 7, 10, 1); g.fillRect(X + 3, Y + 13, 10, 1); g.fillStyle = '#8a8aa0'; g.fillRect(X + 3, Y + 7, 3, 1);
        g.fillStyle = '#e8c060'; g.fillRect(X + 10, Y + 10, 2, 2);
      }
      g.fillStyle = '#5a4c70'; g.fillRect(X + 1, Y + 4, 2, 12); g.fillRect(X + 13, Y + 4, 2, 12); g.fillStyle = '#7a6a90'; g.fillRect(X + 1, Y + 4, 1, 12);
      return;
    }
    // top view: the door is a plank slab across the opening (h: horizontal slab, v: vertical slab)
    var horiz = d.axis === 'h';
    g.fillStyle = 'rgba(8,4,16,0.5)';
    if (d.open) {
      // open: the leaf is swung flat into the wall; only a worn wooden sill and the iron hinge pins show
      if (horiz) { g.fillStyle = '#3a2416'; g.fillRect(X, Y + 7, T, 3); g.fillStyle = '#6a4426'; g.fillRect(X, Y + 7, T, 1); g.fillStyle = '#8a8aa0'; g.fillRect(X, Y + 6, 2, 1); g.fillRect(X, Y + 10, 2, 1); }
      else { g.fillStyle = '#3a2416'; g.fillRect(X + 7, Y, 3, T); g.fillStyle = '#6a4426'; g.fillRect(X + 7, Y, 1, T); g.fillStyle = '#8a8aa0'; g.fillRect(X + 6, Y, 1, 2); g.fillRect(X + 10, Y, 1, 2); }
      return;
    }
    if (horiz) { g.fillRect(X, Y + 9, T, 3); g.fillStyle = '#5a3a20'; g.fillRect(X, Y + 5, T, 5); g.fillStyle = '#9a6634'; g.fillRect(X, Y + 5, T, 3); g.fillStyle = '#c08a4a'; g.fillRect(X, Y + 5, T, 1); g.fillStyle = '#4a4a5a'; g.fillRect(X + 3, Y + 5, 1, 5); g.fillRect(X + 12, Y + 5, 1, 5); g.fillStyle = OL; g.fillRect(X, Y + 4, T, 1); g.fillRect(X, Y + 10, T, 1); }
    else { g.fillRect(X + 9, Y + 1, 3, T); g.fillStyle = '#5a3a20'; g.fillRect(X + 5, Y, 5, T); g.fillStyle = '#9a6634'; g.fillRect(X + 5, Y, 3, T); g.fillStyle = '#c08a4a'; g.fillRect(X + 5, Y, 1, T); g.fillStyle = '#4a4a5a'; g.fillRect(X + 5, Y + 3, 5, 1); g.fillRect(X + 5, Y + 12, 5, 1); g.fillStyle = OL; g.fillRect(X + 4, Y, 1, T); g.fillRect(X + 10, Y, 1, T); }
  }
  function drawTorch(g, X, Y, t, seed) {
    // iron sconce on the wall face and a 3-frame flame
    var fl = Math.floor(t / 90 + seed * 7) % 3;
    g.fillStyle = OL; g.fillRect(X + 6, Y + 8, 4, 5); g.fillStyle = '#5a5a6a'; g.fillRect(X + 7, Y + 9, 2, 3); g.fillStyle = '#8a8aa0'; g.fillRect(X + 7, Y + 9, 1, 1);
    g.fillStyle = '#3a2416'; g.fillRect(X + 7, Y + 6, 2, 3);
    var F = [['.oo.', 'oyyo', 'oyYo', '.oo.'], ['..o.', '.oyo', 'oyYo', '.oo.'], ['.o..', 'oyo.', 'oYyo', '.oo.']][fl];
    var K = { o: '#ff7a2a', y: '#ffd060', Y: '#fff8d0' };
    F.forEach(function (r, j) { for (var i = 0; i < 4; i++) { var c = r.charAt(i); if (c !== '.') { g.fillStyle = K[c]; g.fillRect(X + 6 + i, Y + 2 + j, 1, 1); } } });
  }
  // the empty throne of the last floor: a high carved back, gold trim, a red cushion (blocks the cell)
  function drawThrone(g, X, Y) {
    var P = cached('throne', function () {
      var Q = Pix(16, 26), st = ['#2a2038', '#4a3a62', '#6a5a88', '#9a8ab8'], au = ['#7a4a10', '#d8a030', '#ffe070'];
      Q.rect(3, 2, 10, 15, st[1]); Q.rect(3, 2, 2, 15, st[2]); Q.rect(11, 2, 2, 15, st[0]);
      Q.rect(5, 0, 6, 3, st[2]); Q.set(7, 0, au[2]); Q.set(8, 0, au[1]); Q.rect(6, 4, 4, 10, '#3a1a34'); Q.rect(6, 4, 1, 10, '#5a2a4a');
      Q.rect(1, 14, 14, 4, st[1]); Q.rect(1, 14, 14, 1, st[3]); Q.rect(2, 18, 12, 6, st[1]); Q.rect(2, 18, 2, 6, st[2]); Q.rect(12, 18, 2, 6, st[0]);
      Q.rect(4, 15, 8, 3, '#a82a3a'); Q.rect(4, 15, 8, 1, '#e05060'); Q.rect(1, 14, 14, 1, au[1]); Q.set(1, 14, au[2]); Q.set(3, 3, au[1]); Q.set(12, 3, au[0]);
      Q.rect(2, 24, 12, 1, st[0]); Q.outline(OL); return Q.canvas();
    });
    g.fillStyle = 'rgba(8,4,16,0.5)'; g.fillRect(X + 1, Y + 14, 15, 2);
    if (P) g.drawImage(P, X, Y - 10);
  }
  function drawFountain(g, X, Y, t, used) {
    var P = cached('fountain', function () { var Q = Pix(16, 16); blob(Q, 8, 9, 7, 5.5, ['#3a3448', '#5a5270', '#7e7698', '#b8b0d0']); for (var y = 6; y < 13; y++) for (var x = 3; x < 14; x++) if ((x - 8) * (x - 8) / 22 + (y - 9) * (y - 9) / 10 < 1) Q.clear(x, y); Q.outline(OL); for (var y2 = 6; y2 < 13; y2++) for (var x2 = 3; x2 < 14; x2++) { var e2 = (x2 - 8) * (x2 - 8) / 22 + (y2 - 9) * (y2 - 9) / 10; if (e2 < 1 && e2 > 0.62 && y2 < 9) Q.set(x2, y2, '#2a2438'); } return Q.canvas(); });
    g.fillStyle = 'rgba(8,4,16,0.5)'; g.fillRect(X + 2, Y + 14, 13, 2);
    g.fillStyle = used ? '#1c3a58' : '#2a6aa8'; g.fillRect(X + 4, Y + 7, 9, 5); g.fillRect(X + 3, Y + 8, 11, 3);
    if (used) { var s0 = Math.floor(t / 600) % 4; g.fillStyle = '#3a6a90'; g.fillRect(X + 5 + s0, Y + 9, 2, 1); }
    if (!used) { var s = Math.floor(t / 200) % 3; g.fillStyle = '#7ac8ff'; g.fillRect(X + 5 + s * 2, Y + 8, 2, 1); g.fillStyle = '#d8f4ff'; g.fillRect(X + 9 - s, Y + 10, 1, 1); g.fillStyle = '#a8e8ff'; g.fillRect(X + 8, Y + 4 + (Math.floor(t / 120) % 3), 1, 1); }
    if (P) g.drawImage(P, X, Y);
    g.fillStyle = '#6a6286'; g.fillRect(X + 7, Y + 3, 2, 5); g.fillStyle = '#9a92b8'; g.fillRect(X + 7, Y + 3, 1, 5);
  }

  // the hero's sword: held ready at the side, raised on the wind-up, thrust toward the target on the strike (8 directions)
  function swordPose(h) {
    var side = h.face === 'left' ? -1 : 1, L2 = h.lunge;
    if (L2 && L2.attack) {
      var u = L2.t / L2.dur, l = Math.sqrt(L2.dx * L2.dx + L2.dy * L2.dy) || 1, dx = L2.dx / l, dy = L2.dy / l, sx = L2.dx ? (L2.dx > 0 ? 1 : -1) : side;
      if (u < 0.35) return { hx: sx * 4, hy: -12, dx: -sx * 0.45, dy: -1, len: 7, behind: false, swing: 1 };
      return { hx: Math.round(dx * 5) + (L2.dx ? 0 : 5), hy: -7 + Math.round(dy * 3), dx: dx, dy: dy, len: 9, behind: false, swing: 2 };
    }
    if (h.dir === 'up') return { hx: -3, hy: -9, dx: 0.7, dy: -0.7, len: 6, behind: true };
    if (h.dir === 'down') return { hx: 6, hy: -5, dx: 0, dy: -1, len: 7, behind: false };
    return { hx: side * 5, hy: -6, dx: side * 0.7, dy: -0.7, len: 7, behind: false };
  }
  function drawSword(g, x, y, s2) {
    var x0 = x + s2.hx, y0 = y + s2.hy, pts = [];
    var ax = Math.abs(s2.dx), ay = Math.abs(s2.dy), sx = ax < 0.3 ? 0 : s2.dx > 0 ? 1 : -1, sy = ay < 0.3 ? 0 : s2.dy > 0 ? 1 : -1;
    for (var i = 1; i <= s2.len; i++) pts.push([x0 + sx * i, y0 + sy * i]);
    g.fillStyle = OL; pts.forEach(function (p) { g.fillRect(p[0] - 1, p[1] - 1, 3, 3); }); g.fillRect(x0 - 2, y0 - 2, 5, 5);
    pts.forEach(function (p, i) { g.fillStyle = i === pts.length - 1 ? '#ffffff' : i % 2 ? '#c8d4e8' : '#eef4ff'; g.fillRect(p[0], p[1], 1, 1); });
    if (s2.swing === 2) { g.fillStyle = 'rgba(255,255,255,0.35)'; pts.forEach(function (p) { g.fillRect(p[0] - sy, p[1] + sx, 1, 1); }); }
    // cross-guard across the blade, a leather grip under it
    var gx = sy, gy = -sx; if (!gx && !gy) gx = 1;
    g.fillStyle = '#e8b840'; g.fillRect(x0 + gx, y0 + gy, 1, 1); g.fillRect(x0 - gx, y0 - gy, 1, 1); g.fillRect(x0, y0, 1, 1);
    g.fillStyle = '#6a4226'; g.fillRect(x0 - sx, y0 - sy, 1, 1);
  }

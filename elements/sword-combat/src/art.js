/* Sword-combat art kit (demo + starter): original procedural 16-bit pixel art, 16 px tiles, a 12x16 hero.
   Global SCART = { hero(face, frame, pose) -> canvas, tile(kind, col, row, t) -> canvas, noise(x, y, k), paint(...) }. */
var SCART = (function () {
  'use strict';
  var INK = [16, 12, 24];
  function noise(x, y, k) { var h = Math.imul(x + 1013 * k, 2654435761) ^ Math.imul(y + 7, 40503); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; }
  function paint(w, h, fn, outlined) {
    var pad = outlined ? 1 : 0, c = document.createElement('canvas'); c.width = w + 2 * pad; c.height = h + 2 * pad;
    var x = c.getContext('2d');
    fn(function (px, py, pw, ph, col) { x.fillStyle = col; x.fillRect(px + pad, py + pad, pw, ph); });
    if (outlined) {
      var id = x.getImageData(0, 0, c.width, c.height), d = id.data, cw = c.width, mark = [];
      for (var i = 0; i < cw * c.height; i++) { if (d[i * 4 + 3]) continue; var px = i % cw, py = (i / cw) | 0;
        if ((px > 0 && d[(i - 1) * 4 + 3]) || (px < cw - 1 && d[(i + 1) * 4 + 3]) || (py > 0 && d[(i - cw) * 4 + 3]) || (py < c.height - 1 && d[(i + cw) * 4 + 3])) mark.push(i); }
      for (var j = 0; j < mark.length; j++) { var q = mark[j] * 4; d[q] = INK[0]; d[q + 1] = INK[1]; d[q + 2] = INK[2]; d[q + 3] = 255; }
      x.putImageData(id, 0, 0);
    }
    return c;
  }
  function flip(src) { var c = document.createElement('canvas'); c.width = src.width; c.height = src.height; var x = c.getContext('2d'); x.scale(-1, 1); x.drawImage(src, -src.width, 0); return c; }

  // ---------------------------------------------------------------- hero (12x16 + outline): teal tunic, auburn hair, round shield
  var HAIR = '#8a4a2a', HAIR_L = '#b86a3a', SKIN = '#f4c49a', SKIN_D = '#d89a70', TUN = '#2a9a9a', TUN_D = '#1a6670', TUN_L = '#5ad0c8',
    BELT = '#c8963a', PANTS = '#5a4a6a', BOOT = '#4a2e1e', SH = '#c8a050', SH_D = '#8a6a2a', SH_R = '#e05a3a';
  function legs(R, f, a, b, y) { y = y || 12; if (!f) { R(a, y, 2, 3, PANTS); R(b, y, 2, 3, PANTS); R(a, y + 3, 2, 1, BOOT); R(b, y + 3, 2, 1, BOOT); } else { R(a, y, 2, 2, PANTS); R(a, y + 2, 2, 1, BOOT); R(b, y, 2, 3, PANTS); R(b, y + 3, 2, 1, BOOT); } }
  var HERO = {
    down: function (f, atk) { return function (R) {
      R(3, 0, 6, 1, HAIR); R(2, 1, 8, 3, HAIR); R(3, 1, 3, 1, HAIR_L); R(3, 3, 6, 4, SKIN); R(3, 3, 6, 1, HAIR); R(2, 4, 1, 2, HAIR); R(9, 4, 1, 2, HAIR);
      R(4, 4, 1, 2, '#1a1a2a'); R(7, 4, 1, 2, '#1a1a2a'); R(5, 6, 2, 1, SKIN_D);
      R(2, 7, 8, 5, TUN); R(2, 7, 1, 5, TUN_D); R(9, 7, 1, 5, TUN_D); R(5, 7, 2, 4, TUN_L); R(2, 10, 8, 1, BELT); R(6, 10, 1, 1, '#f0d070');
      if (atk) { R(10, 8, 2, 2, SKIN); R(0, 8, 2, 3, SKIN); } else { R(1, 8, 1, 3, SKIN); R(10, 8, 1, 3, SKIN); R(0, 7, 2, 4, SH); R(0, 8, 1, 2, SH_R); }
      legs(R, f, f ? 6 : 3, f ? 3 : 7);
    }; },
    up: function (f, atk) { return function (R) {
      R(3, 0, 6, 1, HAIR); R(2, 1, 8, 6, HAIR); R(4, 2, 3, 1, HAIR_L); R(3, 5, 6, 1, HAIR_L);
      R(2, 7, 8, 5, TUN); R(9, 7, 1, 5, TUN_D); R(2, 7, 1, 5, TUN_D); R(4, 8, 4, 2, TUN_L); R(2, 10, 8, 1, BELT);
      if (atk) { R(1, 6, 2, 2, SKIN); } else { R(1, 8, 1, 3, SKIN); }
      R(9, 7, 3, 5, SH); R(10, 8, 1, 3, SH_R); R(9, 11, 3, 1, SH_D);
      legs(R, f, f ? 3 : 7, f ? 7 : 3);
    }; },
    right: function (f, atk) { return function (R) {
      R(3, 0, 6, 1, HAIR); R(2, 1, 7, 3, HAIR); R(2, 4, 3, 3, HAIR); R(4, 1, 3, 1, HAIR_L); R(5, 3, 5, 4, SKIN); R(5, 3, 4, 1, HAIR);
      R(8, 4, 1, 2, '#1a1a2a'); R(9, 6, 1, 1, SKIN_D);
      R(3, 7, 6, 5, TUN); R(3, 7, 1, 5, TUN_D); R(5, 7, 2, 3, TUN_L); R(3, 10, 6, 1, BELT);
      if (atk) { R(9, 8, 3, 2, SKIN); } else { R(6, 8, 2, 3, SKIN); }
      R(1, 7, 3, 5, SH); R(1, 8, 1, 3, SH_D); R(2, 9, 1, 1, SH_R);
      if (!f) { R(4, 12, 2, 3, PANTS); R(6, 12, 2, 3, PANTS); R(4, 15, 2, 1, BOOT); R(6, 15, 3, 1, BOOT); }
      else { R(2, 12, 2, 3, PANTS); R(8, 12, 2, 3, PANTS); R(1, 15, 3, 1, BOOT); R(8, 15, 3, 1, BOOT); }
    }; }
  };
  var heroCache = {};
  function hero(face, f, atk) {
    var key = face + (f ? 1 : 0) + (atk ? 'a' : '');
    if (heroCache[key]) return heroCache[key];
    var c;
    if (face === 'left') c = flip(hero('right', f, atk));
    else c = paint(12, 16, (HERO[face] || HERO.down)(f ? 1 : 0, atk), true);
    return (heroCache[key] = c);
  }

  // ---------------------------------------------------------------- tiles (16x16, no outline)
  function grass(R, k, c, r) {
    R(0, 0, 16, 16, '#5aa84a');
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) { var n = noise(x + c * 16, y + r * 16, k); if (n < 0.06) R(x, y, 1, 2, '#3e8a3a'); else if (n > 0.965) R(x, y, 1, 1, '#8ad468'); else if (n > 0.93) R(x, y, 1, 1, '#6cbc52'); }
  }
  var KIND = {
    grass: function (c, r) { return function (R) { grass(R, 1, c, r); }; },
    flowers: function (c, r) { return function (R) { grass(R, 2, c, r); var cols = ['#f0e070', '#f4f4f8', '#e86a8a']; for (var i = 0; i < 4; i++) { var x = 2 + Math.floor(noise(i, c, r + 31) * 11), y = 2 + Math.floor(noise(i, r, c + 17) * 11), cl = cols[(i + c) % 3]; R(x, y, 3, 1, cl); R(x + 1, y - 1, 1, 3, cl); R(x + 1, y, 1, 1, '#f0a030'); } }; },
    path: function (c, r) { return function (R) { R(0, 0, 16, 16, '#c8a46a'); for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) { var n = noise(x + c * 16, y + r * 16, 5); if (n < 0.07) R(x, y, 1, 1, '#a8844a'); else if (n > 0.95) R(x, y, 1, 1, '#e4c48a'); else if (n > 0.9 && n < 0.91) R(x, y, 2, 1, '#8a6a3a'); } }; },
    tree: function (c, r) { return function (R) {
      grass(R, 3, c, r); R(6, 12, 4, 4, '#5a3a22'); R(6, 12, 1, 4, '#3a2416'); R(3, 14, 10, 2, 'rgba(0,0,0,0.25)');
      R(3, 0, 10, 1, '#1e5a2a'); R(1, 1, 14, 2, '#2a7a34'); R(0, 3, 16, 7, '#2a7a34'); R(1, 10, 14, 2, '#1e5a2a'); R(3, 12, 10, 1, '#14401e');
      R(3, 2, 5, 2, '#4aa44a'); R(2, 4, 3, 2, '#4aa44a'); R(8, 3, 3, 1, '#5ab85a'); R(4, 1, 2, 1, '#7ad06a'); R(0, 7, 16, 2, '#22682c'); R(11, 5, 3, 2, '#22682c');
    }; },
    bush: function (c, r) { return function (R) { grass(R, 4, c, r); R(2, 13, 12, 2, 'rgba(0,0,0,0.25)'); R(3, 3, 10, 2, '#2e8a3a'); R(1, 5, 14, 7, '#2e8a3a'); R(2, 12, 12, 1, '#1e5a2a'); R(3, 4, 4, 2, '#5ac05a'); R(2, 6, 2, 2, '#5ac05a'); R(9, 5, 3, 1, '#4aa44a'); R(1, 10, 14, 2, '#22682c'); R(6, 7, 1, 1, '#e84a4a'); R(10, 9, 1, 1, '#e84a4a'); }; },
    rock: function (c, r) { return function (R) { grass(R, 6, c, r); R(2, 13, 12, 2, 'rgba(0,0,0,0.3)'); R(3, 4, 10, 9, '#8a8a9a'); R(2, 6, 12, 6, '#8a8a9a'); R(4, 3, 7, 1, '#a8a8b8'); R(3, 5, 5, 2, '#c0c0cc'); R(3, 12, 10, 1, '#5a5a6a'); R(11, 7, 2, 4, '#6a6a7a'); R(7, 8, 1, 2, '#6a6a7a'); }; },
    water: function (c, r, t) { return function (R) { R(0, 0, 16, 16, '#2a6ac0'); for (var y = 1; y < 16; y += 4) { var o = (y * 3 + c * 5 + (t ? 4 : 0)) % 16; R(o, y, 5, 1, '#5a9ae0'); R((o + 9) % 16, y + 2, 3, 1, '#1e4e98'); } if (noise(c, r, 9) > 0.7) R(4 + (t ? 1 : 0), 6, 1, 1, '#c8e8ff'); }; },
    floor: function (c, r) { return function (R) {
      // large flagstones (32x32 blocks split into 1-3 slabs), each slab its own cool-grey tone, soft low-contrast seams
      var bx = c >> 1, by = r >> 1, lx = (c & 1) * 16, ly = (r & 1) * 16, kind = Math.floor(noise(bx, by, 31) * 3);
      var tones = ['#8e8a96', '#86828f', '#94909c', '#8a8692', '#827e8c'], seam = '#6e6a78', lite = '#a29eaa';
      function slab(px, py) { var sx = kind === 1 ? (px < 18 ? 0 : 1) : 0, sy = kind === 2 ? (py < 14 ? 0 : 1) : 0; return { k: Math.floor(noise(bx * 2 + sx, by * 2 + sy, 37) * 5), x0: kind === 1 ? (sx ? 18 : 0) : 0, y0: kind === 2 ? (sy ? 14 : 0) : 0 }; }
      for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
        var px = lx + x, py = ly + y, sl = slab(px, py), col = tones[sl.k];
        var edge = px === 0 || py === 0 || (kind === 1 && px === 18) || (kind === 2 && py === 14);
        var top = py === sl.y0 + 1 || px === sl.x0 + 1;
        var n = noise(px + bx * 32, py + by * 32, 7);
        R(x, y, 1, 1, edge ? seam : top ? lite : n < 0.05 ? '#7c7886' : n > 0.97 ? '#a4a0ac' : col);
      }
      if (noise(c, r, 12) > 0.86) { R(3, 9, 3, 1, '#5a7a4a'); R(4, 8, 1, 1, '#6a9058'); }
      if (noise(c, r, 14) > 0.9) { R(8, 4, 3, 1, '#6e6a78'); R(10, 5, 1, 2, '#6e6a78'); R(11, 7, 2, 1, '#6e6a78'); }
    }; },
    wall: function (c, r) { return function (R) {
      R(0, 0, 16, 16, '#5a5068'); R(0, 0, 16, 5, '#7a7090'); R(0, 0, 16, 1, '#9a90b0'); R(0, 5, 16, 1, '#3a3248');
      for (var y = 6; y < 16; y += 5) { R(0, y + 4, 16, 1, '#3a3248'); for (var x = ((y / 5) & 1) ? 3 : 8; x < 16; x += 10) R(x, y, 1, 4, '#3a3248'); R(0, y, 16, 1, '#6a6080'); }
      if (noise(c, r, 13) > 0.6) { R(2, 1, 3, 2, '#5a8a4a'); R(3, 3, 1, 3, '#4a7a3a'); }
    }; },
    pillar: function (c, r) { return function (R) { R(0, 0, 16, 16, '#8a8692'); R(2, 13, 12, 3, 'rgba(0,0,0,0.3)'); R(3, 1, 10, 13, '#a49cb8'); R(3, 1, 10, 2, '#c4bcd4'); R(3, 1, 2, 13, '#c4bcd4'); R(11, 1, 2, 13, '#6a6280'); R(2, 12, 12, 3, '#7a7290'); R(2, 0, 12, 2, '#7a7290'); R(7, 5, 2, 4, '#8a82a0'); }; },
    gate: function (c, r, t) { return function (R) { R(0, 0, 16, 16, '#3a3248'); R(1, 0, 14, 16, '#5a3a2a'); for (var x = 2; x < 15; x += 4) R(x, 0, 1, 16, '#3a2216'); R(1, 5, 14, 2, '#8a8aa0'); R(1, 11, 14, 2, '#8a8aa0'); R(6, 6, 4, 4, t ? '#ff6a4a' : '#c83a2a'); R(7, 7, 2, 2, '#ffd23a'); }; },
    shrine: function (c, r, t) { return function (R) { R(0, 0, 16, 16, '#8a8292'); R(1, 9, 14, 6, '#c4bcd4'); R(1, 9, 14, 1, '#e4dcf4'); R(1, 14, 14, 1, '#6a6280'); R(3, 7, 10, 2, '#a49cb8'); R(5, 1, 6, 6, t ? '#9af0ff' : '#5ac8e8'); R(6, 0, 4, 1, '#5ac8e8'); R(6, 2, 2, 3, '#e8fcff'); R(5, 7, 6, 1, '#3a8ab8'); }; },
    stairs: function (c, r) { return function (R) { R(0, 0, 16, 16, '#3a3248'); for (var y = 0; y < 16; y += 4) { R(1, y, 14, 3, '#a49cb8'); R(1, y, 14, 1, '#c4bcd4'); } }; }
  };
  var tileCache = {};
  function tile(kind, c, r, t) {
    var anim = kind === 'water' || kind === 'gate' || kind === 'shrine', fr = anim ? (t >> 5) & 1 : 0;
    var vary = kind === 'grass' || kind === 'path' || kind === 'floor' || kind === 'flowers' || kind === 'water' || kind === 'wall' ? ((c * 7 + r * 13) & 7) : 0;
    var key = kind + ':' + vary + ':' + fr + (kind === 'flowers' || kind === 'floor' || kind === 'wall' ? ':' + c + ',' + r : '');
    if (tileCache[key]) return tileCache[key];
    var f = (KIND[kind] || KIND.grass)(kind === 'flowers' || kind === 'floor' || kind === 'wall' ? c : vary, kind === 'flowers' || kind === 'floor' || kind === 'wall' ? r : vary * 3, fr);
    return (tileCache[key] = paint(16, 16, f, false));
  }
  return { hero: hero, tile: tile, noise: noise, paint: paint, flip: flip };
})();

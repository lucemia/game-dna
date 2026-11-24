  /* ---------- the season repaint (starter and demo): an exact palette swap of the pixel-kit art, per season ----------
     Index-wise ramp swaps of the kit's grass, lush, dry, leaf and pine colours (Spring: fresh cool greens; Summer: deep,
     warm, saturated greens; Fall: golden grass and rust / amber trees; Winter: snow), plus a scatter on the ground
     canvases only (Spring petals, Summer buttercups, Fall leaf litter), placed by a position hash (deterministic). */
  var SEASON_PAINT = (function () {
    var RAMPS = {
      spring: { grass: ['#2a5a3c', '#3c7c48', '#4c984e', '#5aa852', '#70bc5e', '#94d276', '#c0e898'], lush: ['#1e4c34', '#2c6a40', '#3a8446', '#4a9a4c', '#66b45c'],
        leaf: ['#1c4a34', '#2a6a3c', '#3c8a44', '#56aa52', '#7cc666', '#b0e08c'] },
      summer: { grass: ['#2e4a16', '#44691c', '#5c8622', '#6c9824', '#86ae2e', '#a6c43e', '#cede62'], lush: ['#26420f', '#385e16', '#4a761c', '#5c8a22', '#7ca230'],
        dry: ['#8a8a2a', '#a8a232', '#c2b83e', '#dacc52'], leaf: ['#16340f', '#244e14', '#346c1a', '#4c8c22', '#70ac2e', '#a2cc48'], pine: ['#0c2a1c', '#164026', '#205a2c', '#2e7432', '#46923c'] },
      fall: { grass: ['#5a4c1a', '#82701e', '#a48a24', '#b89c2a', '#ceb038', '#e2c44c', '#f4da70'], lush: ['#463c14', '#685a1c', '#86742a', '#9c8630', '#bca040'],
        dry: ['#9a6a2a', '#b47e32', '#cc943e', '#e2ac52'], leaf: ['#4a1c1c', '#7a2c20', '#a8482a', '#cc7030', '#e89a44', '#f8c868'], pine: ['#1a2a24', '#28402e', '#3a5634', '#50703c', '#6a8a48'] },
      winter: { grass: ['#6a7890', '#909eb6', '#b4c0d4', '#ccd6e4', '#dfe7f1', '#eef3f9', '#ffffff'], lush: ['#7a88a0', '#a0aec4', '#c4d0e0', '#dce4ee', '#f4f8fc'],
        leaf: ['#3a4658', '#566478', '#7c8aa0', '#b0bccc', '#dce4ee', '#ffffff'] }
    };
    var SCATTER = { spring: [['#ffd6e6', '#f08ab4'], ['#ffffff', '#e0d8f0']], summer: [['#ffe45a', '#d8a020']], fall: [['#e0602a', '#9a3a18'], ['#f0a030', '#b86a18'], ['#c83a22', '#7a2014']] };
    var REMAP = {}, RECOL = typeof Map === 'function' ? new Map() : null;
    function hex(h) { var n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
    function hh(x, y, s) { var n = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul((s | 0) + 1, 83492791); n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); n ^= n >>> 15; return (n >>> 0) / 4294967296; }
    function rampMap(pal, season) {
      if (REMAP[season]) return REMAP[season];
      var R = RAMPS[season] || {}, out = {}, grass = {};
      for (var key in R) { var from = pal[key]; if (!from) continue; from.forEach(function (c, i) { if (!R[key][i]) return; var a = parseInt(c.slice(1), 16); out[a] = hex(R[key][i]); if (key === 'grass' || key === 'lush') grass[a] = 1; }); }
      return (REMAP[season] = { map: out, grass: grass });
    }
    // recolour one canvas for a season (cached per canvas); ground = true adds the season's scatter on grass pixels
    function recolor(pal, c, season, ground) {
      if (!c || !RECOL || !RAMPS[season] || !Object.keys(RAMPS[season]).length) return c;
      var per = RECOL.get(c); if (!per) { per = {}; RECOL.set(c, per); }
      if (per[season]) return per[season];
      var M = rampMap(pal, season), o = document.createElement('canvas'); o.width = c.width; o.height = c.height; var q = o.getContext('2d');
      q.drawImage(c, 0, 0);
      try {
        var d = q.getImageData(0, 0, o.width, o.height), a = d.data, W = o.width, isG = new Uint8Array(W * o.height);
        for (var i = 0, p = 0; i < a.length; i += 4, p++) { if (!a[i + 3]) continue; var key = (a[i] << 16) | (a[i + 1] << 8) | a[i + 2], v = M.map[key]; if (M.grass[key]) isG[p] = 1; if (v) { a[i] = v[0]; a[i + 1] = v[1]; a[i + 2] = v[2]; } }
        var S = ground && SCATTER[season], dens = season === 'fall' ? 0.012 : 0.004;
        if (S) for (var y = 1; y < o.height - 1; y++) for (var x = 1; x < W - 1; x++) {
          if (!isG[y * W + x] || !isG[y * W + x + 1] || !isG[(y + 1) * W + x] || hh(x, y, 77) > dens) continue;
          var col = S[Math.floor(hh(x, y, 78) * S.length)], c0 = hex(col[0]), c1 = hex(col[1]), j = (y * W + x) * 4, j2 = j + 4, j3 = j + W * 4;
          a[j] = c0[0]; a[j + 1] = c0[1]; a[j + 2] = c0[2]; a[j2] = c1[0]; a[j2 + 1] = c1[1]; a[j2 + 2] = c1[2];
          if (season === 'fall') { a[j3] = c1[0]; a[j3 + 1] = c1[1]; a[j3 + 2] = c1[2]; }
        }
        q.putImageData(d, 0, 0);
      } catch (e) { /* a tainted canvas keeps the kit colours */ }
      return (per[season] = o);
    }
    return { recolor: recolor, RAMPS: RAMPS };
  })();

  /* ---------- the shipping bin (starter and demo): a lidded wooden bin, 18 x 14, base centre at (x, y); open = the lid
     swung up on its back hinges ---------- */
  function SHIP_BIN(q, x, y, open) {
    var X = Math.round(x) - 9, Y = Math.round(y) - 14;
    q.fillStyle = 'rgba(20,14,10,0.3)'; q.fillRect(X + 1, Y + 13, 18, 2);
    q.fillStyle = '#2a1a12'; q.fillRect(X, Y + 3, 18, 11);
    q.fillStyle = '#a87240'; q.fillRect(X + 1, Y + 4, 16, 9); q.fillStyle = '#82502c'; q.fillRect(X + 1, Y + 7, 16, 1); q.fillRect(X + 1, Y + 10, 16, 1);
    q.fillStyle = '#cc9a5c'; q.fillRect(X + 1, Y + 4, 16, 1); q.fillStyle = '#58607e'; q.fillRect(X + 3, Y + 4, 1, 9); q.fillRect(X + 14, Y + 4, 1, 9); q.fillStyle = '#9aa4c0'; q.fillRect(X + 3, Y + 5, 1, 1); q.fillRect(X + 14, Y + 5, 1, 1);
    if (!open) { q.fillStyle = '#2a1a12'; q.fillRect(X - 1, Y, 20, 4); q.fillStyle = '#c88a4c'; q.fillRect(X, Y + 1, 18, 2); q.fillStyle = '#e8b878'; q.fillRect(X, Y + 1, 18, 1); }
    else {
      // the lid swung up on its back hinges: it stands on the box's back edge (its underside faces us), the open box shows inside
      q.fillStyle = '#2a1a12'; q.fillRect(X - 1, Y - 6, 20, 10);
      q.fillStyle = '#a8703c'; q.fillRect(X, Y - 5, 18, 7); q.fillStyle = '#8a5a30'; q.fillRect(X, Y - 2, 18, 1); q.fillStyle = '#c88a4c'; q.fillRect(X, Y - 5, 18, 1);
      q.fillStyle = '#58607e'; q.fillRect(X + 3, Y + 1, 2, 2); q.fillRect(X + 13, Y + 1, 2, 2); q.fillStyle = '#9aa4c0'; q.fillRect(X + 3, Y + 1, 1, 1); q.fillRect(X + 13, Y + 1, 1, 1);
      q.fillStyle = '#3a2414'; q.fillRect(X + 1, Y + 3, 16, 2); q.fillStyle = '#5a3a20'; q.fillRect(X + 1, Y + 5, 16, 1);
    }
    q.fillStyle = '#ffe070'; q.fillRect(X + 8, Y + 6, 2, 2); q.fillStyle = '#b8862a'; q.fillRect(X + 8, Y + 8, 2, 1);
  }

/* GameDNA D-01 · Palette-swap variants · module v1 (plain script, no dependencies, one global: GameDNA_PaletteSwap)
 *
 *   const PS = GameDNA_PaletteSwap.create({
 *     params: { hueTol: 24, strength: 0.6 },   // see DEFAULTS
 *     skin: 'pixel16',                         // optional; team-a/b/n ramps and the inspector come from GameDNA_Skin when loaded
 *   });
 *   ctx.drawImage(PS.variant(sprite, 'team-red'), x, y);      // where the game already draws the sprite: that is the whole integration
 *   PS.variant(sprite, 'team-blue+spent')                     // chain with '+': team colour, then greyed
 *   PS.update(dtMs)                                           // fixed step: the clock of the animated variants (lowhp pulse)
 *
 *   sprite = a canvas, a loaded <img>, an ImageBitmap, or a palette-indexed string sprite { rows: ['..oo..'], pal: { o: '#101018' } }.
 *   Variants are built once per (sprite, name) from the sprite's own pixels and cached; later calls are a lookup.
 *   Names: base, team-blue, team-red, team-green, team-yellow, team-a, team-b, team-n, elite, rare,
 *          poison, petrify, frozen, lowhp (animated), spent, flash, shadow, plus anything added with define().
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var DEFAULTS = { hueTol: 24, protectSkin: 'auto', target: 'primary', strength: 0.6, pulseHz: 2, pulseSteps: 4,
    spentDim: 0.6, keepOutline: 'on', elite: 'violet', eliteEdge: 'on' };

  /* ---------- target ramps, dark -> light (hand-picked 5-step ramps) ---------- */
  var RAMPS = {
    blue:   ['#141e58', '#2440a0', '#3a6ce0', '#78a8f6', '#c8e0ff'],
    red:    ['#4a0c14', '#94182a', '#d23a30', '#f2845c', '#ffd2b4'],
    green:  ['#10361a', '#1f6a2a', '#38a43a', '#7cd65a', '#d2f6a2'],
    yellow: ['#4e3006', '#966010', '#dca21c', '#f6d64c', '#fff6b4'],
    violet: ['#1e0828', '#4a1256', '#88268a', '#cc52b0', '#ffaee0'],
    crimson:['#24040a', '#5c0a16', '#a8142a', '#ec4848', '#ffbc9c'],
    gold:   ['#2c1a04', '#6a4808', '#b8860e', '#f2c834', '#fff7c4'],
    shadow: ['#0a0812', '#1c1828', '#34304a', '#5e5878', '#a29cc0'],
    rare:   ['#123040', '#246c80', '#3eb0be', '#8ce8de', '#eefffa'],
    rarePink: ['#3a1430', '#7a3466', '#d06aa2', '#f8b0cc', '#fff0f4'],
    poison: ['#1c1430', '#3e2a5a', '#5e8a2a', '#9ed24a', '#e4ff9c'],
    petrify:['#2a2624', '#524c46', '#837b70', '#b6ae9f', '#e8e2d4'],
    frozen: ['#0e2448', '#24569a', '#56a0e2', '#a6dcff', '#f4fdff'],
    lowhp:  ['#3a0606', '#8a1210', '#e0301c', '#ff7a5a', '#ffd4c4']
  };
  var LABEL = { primary: 'primary', secondary: 'secondary', accent1: 'acc 1', accent2: 'acc 2', accent3: 'acc 3', accent4: 'acc 4', skin: 'skin', neutral: 'neutral', outline: 'outline' };
  // 3x5 pixel font for the inspector when no skin is loaded (crisp fillRects, never the system font)
  var F35 = { A: '25755', B: '65656', C: '34443', D: '65556', E: '74647', F: '74644', G: '34553', H: '55755', I: '72227', J: '11152', K: '55655',
    L: '44447', M: '57555', N: '65555', O: '25552', P: '65644', Q: '25573', R: '65655', S: '34216', T: '72222', U: '55557', V: '55552',
    W: '55575', X: '55255', Y: '55222', Z: '71247', 0: '75557', 1: '26227', 2: '61247', 3: '61216', 4: '55711', 5: '74616', 6: '34757',
    7: '71222', 8: '75757', 9: '75716', '+': '02720', '-': '00700', '.': '00002' };
  function tiny(ctx, str, x, y, col) {
    str = String(str).toUpperCase();
    for (var pass = 0; pass < 2; pass++) {
      ctx.fillStyle = pass ? col : '#06061a';
      for (var i = 0, cx = x + (pass ? 0 : 1); i < str.length; i++, cx += 4) {
        var f = F35[str[i]]; if (!f) continue;
        for (var ry = 0; ry < 5; ry++) for (var b = 0; b < 3; b++) if ((f.charCodeAt(ry) - 48) & (4 >> b)) ctx.fillRect(cx + b, y + ry + (pass ? 0 : 1), 1, 1);
      }
    }
  }
  var EDGE = { violet: '#2e0a30', crimson: '#30040c', gold: '#3a2204', shadow: '#000000' };

  /* ---------- colour helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hexToRgb(h) {
    if (Array.isArray(h)) return [h[0] | 0, h[1] | 0, h[2] | 0];
    var s = String(h || '').trim(), m;
    if ((m = /^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i.exec(s))) return [+m[1], +m[2], +m[3]];
    s = s.replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var n = parseInt(s.slice(0, 6), 16);
    return isNaN(n) ? [255, 0, 255] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(c) { return '#' + ((1 << 24) | (c[0] << 16) | (c[1] << 8) | c[2]).toString(16).slice(1); }
  function luma(r, g, b) { return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
  function hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
    if (d > 1e-6) {
      s = d / (1 - Math.abs(2 * l - 1) || 1);
      h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [h, clamp(s, 0, 1), l];
  }
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }
  function mix(a, b, t) { return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]; }
  function hueDist(a, b) { var d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }
  function sample(stops, p) {           // stops: [[r,g,b]...] dark -> light; p 0..1
    p = clamp(p, 0, 1) * (stops.length - 1);
    var i = Math.floor(p), f = p - i;
    if (i >= stops.length - 1) return stops[stops.length - 1].slice();
    return mix(stops[i], stops[i + 1], f);
  }
  // 5-step ramp from one base colour, with pixel-art hue shifting (shadows toward blue/violet, lights toward yellow)
  function rampFromBase(hex) {
    var c = hexToRgb(hex), q = hsl(c[0], c[1], c[2]), h = q[0], s = Math.max(0.35, q[1]);
    var toward = function (from, to, amt) { var d = ((to - from + 540) % 360) - 180; return from + clamp(d, -amt, amt); };
    var L = [0.15, 0.3, 0.46, 0.66, 0.86], S = [s * 0.75, s * 0.85, s, s * 0.9, s * 0.65], SH = [-16, -8, 0, 8, 16];
    return L.map(function (l, i) { return rgbToHex(hslToRgb(SH[i] < 0 ? toward(h, 250, -SH[i]) : toward(h, 55, SH[i]), clamp(S[i], 0, 1), l)); });
  }

  // elite and rare must read as different from the sprite: when the chosen ramp's hue is within 45 deg of the sprite's primary ramp,
  // use the candidate farthest from it (team colours never do this: a blue team stays blue)
  function rampHue(id) { var c = hexToRgb(RAMPS[id][2]); return hsl(c[0], c[1], c[2])[0]; }
  function contrastPick(info, want, cands) {
    var pr = null; info.ramps.forEach(function (r) { if (!pr && r.role === 'primary') pr = r; });
    if (!pr || hueDist(rampHue(want), pr.hue) >= 45 || want === 'shadow') return want;
    var best = want, bd = -1;
    cands.forEach(function (id) { var d = hueDist(rampHue(id), pr.hue); if (d > bd) { bd = d; best = id; } });
    return best;
  }

  /* ---------- canvas helpers ---------- */
  function newCanvas(w, h) {
    if (root.document && root.document.createElement) { var c = root.document.createElement('canvas'); c.width = w; c.height = h; return c; }
    if (typeof root.OffscreenCanvas === 'function') return new root.OffscreenCanvas(w, h);
    return null;
  }
  function sizeOf(src) {
    if (!src || typeof src !== 'object') return null;
    if (typeof root.HTMLImageElement === 'function' && src instanceof root.HTMLImageElement) {
      if (!src.complete || !src.naturalWidth) return null;
      return { w: src.naturalWidth, h: src.naturalHeight };
    }
    var w = src.width, h = src.height;
    if (typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0) return { w: w | 0, h: h | 0 };
    return null;
  }
  function isRows(src) { return src && typeof src === 'object' && Array.isArray(src.rows) && (src.pal || src.palette); }

  /* ---------- ramp detection ---------- */
  // Returns { colors: [{key, rgb, n, h, s, l, y, role, ramp, pos}], ramps: [{role, keys (dark->light), n, hue}], mask }
  function analyse(data, P, explicit) {
    var counts = new Map(), d = data, i, key, total = 0;
    for (i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 16) continue;
      key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      counts.set(key, (counts.get(key) || 0) + 1); total++;
    }
    var mask = 0xffffff;
    if (counts.size > 768) {                      // smooth / antialiased art: work on 5-bit-per-channel buckets
      mask = 0xf8f8f8; var q = new Map();
      counts.forEach(function (n, k) { var kk = k & mask; q.set(kk, (q.get(kk) || 0) + n); });
      counts = q;
    }
    var colors = [], byKey = {};
    counts.forEach(function (n, k) {
      var r = (k >> 16) & 255, g = (k >> 8) & 255, b = k & 255, H = hsl(r, g, b), mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      var c = { key: k, rgb: [r, g, b], n: n, h: H[0], s: H[1], l: H[2], y: luma(r, g, b), role: null, ramp: -1, pos: 0 };
      if (P.keepOutline !== 'off' && c.y < 0.13) c.role = 'outline';
      else if (mx - mn < 22 || c.s < 0.14 || (c.y > 0.92 && c.s < 0.45)) c.role = 'neutral';
      else c.skin = c.h >= 10 && c.h <= 48 && c.s >= 0.25 && c.s <= 0.92 && c.l >= 0.5 && c.l <= 0.9;
      colors.push(c); byKey[k] = c;
    });
    var ramps = [];
    if (explicit) {                               // setRamps(): the designer named the ramps
      Object.keys(explicit).forEach(function (role) {
        var keys = [];
        (explicit[role] || []).forEach(function (hex) { var rgb = hexToRgb(hex), k = ((rgb[0] << 16) | (rgb[1] << 8) | rgb[2]) & mask; if (byKey[k]) keys.push(k); });
        if (keys.length) ramps.push({ role: role, keys: keys, n: 0, hue: 0, explicit: true });
      });
      ramps.forEach(function (r, ri) { r.keys.forEach(function (k, pi) { var c = byKey[k]; c.role = r.role; c.ramp = ri; c.pos = pi; r.n += c.n; }); });
      colors.forEach(function (c) { if (!c.role) c.role = c.y < 0.13 && P.keepOutline !== 'off' ? 'outline' : 'neutral'; });
      return finish(colors, ramps, mask, total);
    }
    var tol = Math.max(4, +P.hueTol || 24);
    function cluster(list) {
      var parent = list.map(function (_, j) { return j; });
      function find(j) { while (parent[j] !== j) j = parent[j] = parent[parent[j]]; return j; }
      for (var a = 0; a < list.length; a++) for (var b = a + 1; b < list.length; b++) {
        var A = list[a], B = list[b], dist = hueDist(A.h, B.h) / tol + Math.max(0, Math.abs(A.s - B.s) - 0.15) / 0.35;
        if (dist <= 1) parent[find(a)] = find(b);
      }
      var groups = {};
      list.forEach(function (c, j) { var r = find(j); (groups[r] = groups[r] || []).push(c); });
      return Object.keys(groups).map(function (k) { return groups[k]; });
    }
    var chroma = colors.filter(function (c) { return !c.role; });
    var skin = chroma.filter(function (c) { return c.skin; }), rest = chroma.filter(function (c) { return !c.skin; });
    var groups = cluster(rest), skinN = skin.reduce(function (s, c) { return s + c.n; }, 0);
    var biggest = groups.reduce(function (m, g) { return Math.max(m, g.reduce(function (s, c) { return s + c.n; }, 0)); }, 0);
    var protect = P.protectSkin === 'on' || (P.protectSkin !== 'off' && skin.length && skinN < biggest);
    if (!protect && skin.length) groups = cluster(chroma);
    else if (skin.length) groups.push(skin.map(function (c) { c.isSkin = true; return c; }));
    groups.forEach(function (g) {
      var n = g.reduce(function (s, c) { return s + c.n; }, 0), hx = 0, hy = 0;
      g.forEach(function (c) { hx += Math.cos(c.h * Math.PI / 180) * c.n; hy += Math.sin(c.h * Math.PI / 180) * c.n; });
      g.sort(function (a, b) { return a.y - b.y; });
      // leather, wood and hair browns (hue 12-50, lightness < 0.5) weigh half when ranking: the team area is the clothing, not the belt
      var brownN = g.reduce(function (s, c) { return s + (c.h >= 12 && c.h <= 50 && c.l < 0.5 ? c.n : 0); }, 0);
      ramps.push({ role: g[0].isSkin ? 'skin' : null, keys: g.map(function (c) { return c.key; }), n: n, rank: brownN * 2 > n ? n * 0.5 : n,
        hue: Math.round((Math.atan2(hy, hx) * 180 / Math.PI + 360) % 360) });
    });
    ramps.sort(function (a, b) { return (a.role === 'skin') - (b.role === 'skin') || b.rank - a.rank || b.n - a.n; });
    var names = ['primary', 'secondary'], k2 = 0;
    ramps.forEach(function (r) { if (!r.role) r.role = names[k2] || 'accent' + (k2 - 1); if (r.role !== 'skin') k2++; });
    ramps.forEach(function (r, ri) { r.keys.forEach(function (k, pi) { var c = byKey[k]; c.role = r.role; c.ramp = ri; c.pos = pi; }); });
    return finish(colors, ramps, mask, total);
  }
  function finish(colors, ramps, mask, total) {
    var neutral = colors.filter(function (c) { return c.role === 'neutral'; }).sort(function (a, b) { return a.y - b.y; });
    var outline = colors.filter(function (c) { return c.role === 'outline'; }).sort(function (a, b) { return a.y - b.y; });
    if (neutral.length) ramps.push({ role: 'neutral', keys: neutral.map(function (c) { return c.key; }), n: neutral.reduce(function (s, c) { return s + c.n; }, 0), hue: 0 });
    if (outline.length) ramps.push({ role: 'outline', keys: outline.map(function (c) { return c.key; }), n: outline.reduce(function (s, c) { return s + c.n; }, 0), hue: 0 });
    var byKey = {}; colors.forEach(function (c) { byKey[c.key] = c; });
    ramps.forEach(function (r, ri) { r.keys.forEach(function (k, pi) { byKey[k].ramp = ri; byKey[k].pos = pi; }); });
    return { colors: colors, byKey: byKey, ramps: ramps, mask: mask, total: total };
  }

  /* ---------- the module ---------- */
  function create(options) {
    var o = options || {};
    var P = {}, k;
    for (k in DEFAULTS) P[k] = DEFAULTS[k];
    setParamsInto(o.params);
    var SK = o.skin === false || !root.GameDNA_Skin ? null : safe(function () { return root.GameDNA_Skin.resolve(o.skin); }, null);
    var cache = typeof WeakMap === 'function' ? new WeakMap() : null, rowsCache = typeof WeakMap === 'function' ? new WeakMap() : null;
    var custom = {}, explicitRamps = typeof WeakMap === 'function' ? new WeakMap() : null;
    var warned = {}, clock = 0, updated = false, noClockCalls = 0;
    var S = { calls: 0, hits: 0, builds: 0, buildMs: 0, sources: 0, variants: 0, fallbacks: 0, rebuilds: 0 };
    var api = {};

    function warnOnce(key, msg) { if (warned[key]) return; warned[key] = 1; if (root.console && console.warn) console.warn('GameDNA_PaletteSwap: ' + msg); if (typeof o.onWarn === 'function') safe(function () { o.onWarn(key, msg); }); }
    function safe(fn, dflt) { try { return fn(); } catch (e) { return dflt; } }
    function setParamsInto(p) {
      if (!p) return;
      for (var key in p) if (Object.prototype.hasOwnProperty.call(DEFAULTS, key) && p[key] != null && p[key] !== '') {
        var v = p[key], d = DEFAULTS[key];
        P[key] = typeof d === 'number' ? (isFinite(+v) ? +v : d) : String(v);
      }
    }
    function stops(list) { return list.map(hexToRgb); }
    function teamRamp(id) {
      if (RAMPS[id]) return RAMPS[id];
      var base = SK && SK.palette && SK.palette.team ? SK.palette.team[id] : null;
      return rampFromBase(base || { a: '#3a64d8', b: '#d85a48', n: '#4c5a8a' }[id] || '#888888');
    }

    // one step of a variant chain -> a colour function (rgb, colourInfo) -> rgb, or null for an unknown name
    function stepFn(name, info, level) {
      var outlineKeep = P.keepOutline !== 'off';
      var roles = P.target === 'all' ? null : P.target === 'primary+secondary' ? { primary: 1, secondary: 1 } : { primary: 1 };
      function teamFn(stopsList, edge) {
        var S5 = stops(stopsList);
        var pos = {};                       // per ramp: positions in the target ramp, keeping the source's dark -> light order
        info.ramps.forEach(function (r, ri) {
          if (r.role === 'neutral' || r.role === 'outline' || r.role === 'skin') return;
          if (roles ? !roles[r.role] : false) return;
          var ys = r.keys.map(function (kk) { return info.byKey[kk].y; }), n = ys.length;
          var lo = clamp((ys[0] - 0.08) / 0.84, 0, 1), hi = clamp((ys[n - 1] - 0.08) / 0.84, 0, 1);
          if (hi - lo < 0.4) { var mid = (hi + lo) / 2; lo = clamp(mid - 0.2, 0, 0.6); hi = lo + 0.4; }
          pos[ri] = r.keys.map(function (_, j) { return n === 1 ? (lo + hi) / 2 : lo + (hi - lo) * j / (n - 1); });
        });
        return function (rgb, c) {
          if (c && pos[c.ramp]) return sample(S5, pos[c.ramp][c.pos]);
          if (edge && c && c.role === 'outline') return mix(rgb, hexToRgb(edge), 0.75);
          return rgb;
        };
      }
      function tintFn(stopsList, amt) {
        var S5 = stops(stopsList);
        return function (rgb, c) {
          if (outlineKeep && c && c.role === 'outline') return rgb;
          return mix(rgb, sample(S5, clamp((luma(rgb[0], rgb[1], rgb[2]) - 0.06) / 0.88, 0, 1)), amt);
        };
      }
      if (custom[name]) {
        var cs = custom[name];
        if (cs.fn) return function (rgb, c) { var r = safe(function () { return cs.fn(rgb.slice(), c ? { role: c.role, pos: c.pos } : null); }, null); return Array.isArray(r) ? r : typeof r === 'string' ? hexToRgb(r) : rgb; };
        if (cs.map) { var M = {}; Object.keys(cs.map).forEach(function (h) { var a = hexToRgb(h); M[(a[0] << 16) | (a[1] << 8) | a[2]] = hexToRgb(cs.map[h]); }); return function (rgb) { var r = M[(rgb[0] << 16) | (rgb[1] << 8) | rgb[2]]; return r ? r.slice() : rgb; }; }
        if (cs.kind === 'tint') return tintFn(cs.ramp, cs.strength != null ? +cs.strength : P.strength);
        return teamFn(cs.ramp || RAMPS.blue, cs.edge);
      }
      var m = /^team-(.+)$/.exec(name);
      if (m) return (RAMPS[m[1]] || /^[abn]$/.test(m[1])) && ['violet', 'crimson', 'gold', 'shadow', 'rare', 'poison', 'petrify', 'frozen', 'lowhp'].indexOf(m[1]) < 0 ? teamFn(teamRamp(m[1])) : null;
      switch (name) {
        case 'elite': var el = contrastPick(info, RAMPS[P.elite] ? P.elite : 'violet', ['violet', 'crimson', 'gold']);
          return teamFn(RAMPS[el], P.eliteEdge !== 'off' ? (EDGE[el] || EDGE.violet) : null);
        case 'rare': return teamFn(RAMPS[contrastPick(info, 'rare', ['rare', 'rarePink'])]);
        case 'poison': return tintFn(RAMPS.poison, clamp(P.strength, 0, 1));
        case 'frozen': return tintFn(RAMPS.frozen, clamp(P.strength + 0.15, 0, 1));
        case 'petrify': return tintFn(RAMPS.petrify, 1);
        case 'lowhp': return tintFn(RAMPS.lowhp, clamp(P.strength, 0, 1) * level);
        case 'spent': return function (rgb, c) {
          if (outlineKeep && c && c.role === 'outline') return rgb;
          var v = luma(rgb[0], rgb[1], rgb[2]) * clamp(P.spentDim, 0.1, 1) * 255;
          return [Math.round(v), Math.round(v), Math.round(Math.min(255, v + 10))];
        };
        case 'flash': return function () { return [255, 255, 255]; };
        case 'shadow': return function () { return [10, 8, 20]; };
      }
      return null;
    }

    function entryFor(src) {
      if (isRows(src)) src = api.fromRows(src);
      var sz = sizeOf(src);
      if (!sz) return { src: src, entry: null, why: src && typeof src === 'object' ? 'notready' : 'nosrc' };
      var e = cache && cache.get(src);
      if (e && (e.w !== sz.w || e.h !== sz.h || e.ver !== (src.__psVersion || 0))) { forget(src); e = null; S.rebuilds++; }
      if (!e) {
        var t0 = now();
        var c = newCanvas(sz.w, sz.h); if (!c) return { src: src, entry: null, why: 'nocanvas' };
        var g = c.getContext('2d'), img;
        try { g.drawImage(src, 0, 0); img = g.getImageData(0, 0, sz.w, sz.h); }
        catch (x) { return { src: src, entry: null, why: 'tainted' }; }
        e = { w: sz.w, h: sz.h, ver: src.__psVersion || 0, img: img, info: analyse(img.data, P, explicitRamps && explicitRamps.get(src)), variants: new Map() };
        if (cache) cache.set(src, e);
        S.sources++; S.buildMs += now() - t0;
      }
      return { src: src, entry: e };
    }
    function forget(src) {          // drop one sprite's cache entry; stats().variants / sources count what is cached now
      var e = cache && cache.get(src); if (!e) return;
      S.variants = Math.max(0, S.variants - (e.live || 0)); S.sources = Math.max(0, S.sources - 1); cache.delete(src);
    }
    function now() { return root.performance && performance.now ? performance.now() : Date.now(); }

    function build(e, parts, levels) {
      var t0 = now(), fns = [], order = parts.map(function (p, i) { return i; });
      // ramp swaps (team, elite, rare, custom ramps) run before whole-sprite tints, whatever order the name lists them in
      order.sort(function (a, b) { return isSwap(parts[b]) - isSwap(parts[a]) || a - b; });
      for (var i = 0; i < order.length; i++) {
        var nm = parts[order[i]];
        if (nm === 'base' || nm === '') continue;
        var f = stepFn(nm, e.info, levels[order[i]]);
        if (!f) return null;
        fns.push(f);
      }
      var map = new Map(), info = e.info;
      info.colors.forEach(function (c) {
        var rgb = c.rgb.slice();
        for (var j = 0; j < fns.length; j++) rgb = fns[j](rgb, c);
        map.set(c.key, rgb);
      });
      var out = newCanvas(e.w, e.h), g = out.getContext('2d'), img = g.createImageData(e.w, e.h), s = e.img.data, d = img.data, mask = info.mask;
      for (var p = 0; p < s.length; p += 4) {
        var a = s[p + 3]; d[p + 3] = a;
        if (a < 16) { d[p] = s[p]; d[p + 1] = s[p + 1]; d[p + 2] = s[p + 2]; continue; }
        var key = ((s[p] << 16) | (s[p + 1] << 8) | s[p + 2]), to = map.get(key & mask);
        if (!to) { d[p] = s[p]; d[p + 1] = s[p + 1]; d[p + 2] = s[p + 2]; continue; }
        if (mask !== 0xffffff) {                  // bucketed colours: carry the pixel's offset from its bucket
          var b0 = (key & mask), dr = s[p] - ((b0 >> 16) & 255), dg = s[p + 1] - ((b0 >> 8) & 255), db = s[p + 2] - (b0 & 255);
          d[p] = clamp(to[0] + dr, 0, 255); d[p + 1] = clamp(to[1] + dg, 0, 255); d[p + 2] = clamp(to[2] + db, 0, 255);
        } else { d[p] = to[0]; d[p + 1] = to[1]; d[p + 2] = to[2]; }
      }
      g.putImageData(img, 0, 0);
      try { out.__psMap = map; } catch (x) { /* frozen canvas object: the inspector shows no mapping */ }
      S.builds++; S.variants++; e.live = (e.live || 0) + 1; S.buildMs += now() - t0;
      return out;
    }

    function isSwap(nm) {
      if (custom[nm]) return custom[nm].kind === 'tint' || custom[nm].fn || custom[nm].map ? 0 : 1;
      return /^team-/.test(nm) || nm === 'elite' || nm === 'rare' ? 1 : 0;
    }
    function pulseLevel() {
      var steps = Math.max(2, Math.round(P.pulseSteps) || 4), ph = (clock / 1000 * Math.max(0.05, P.pulseHz)) % 1;
      var amt = (1 - Math.cos(ph * 2 * Math.PI)) / 2;
      return Math.round(amt * (steps - 1)) / (steps - 1);
    }

    /* variant(src, name, opts) -> a canvas to draw instead of src (or src itself when nothing can be done; never throws) */
    api.variant = function (src, name, opts) {
      S.calls++;
      try {
        name = String(name == null ? 'base' : name).trim().toLowerCase();
        var r = entryFor(src);
        if (!r.entry) {
          S.fallbacks++;
          if (r.why === 'tainted') warnOnce('taint:' + name, 'cannot read the pixels of this sprite (cross-origin image without CORS): drawn unchanged. Serve it from the same origin or convert it to a canvas.');
          else if (r.why === 'notready') warnOnce('notready', 'a sprite was not loaded yet (or has no size): drawn unchanged this frame; the variant is built on the first call after it loads.');
          return r.src;
        }
        if (name === 'base' || name === '') { S.hits++; return r.src; }
        var parts = name.split('+').map(function (s) { return s.trim(); }), levels = parts.map(function () { return 1; }), key = name;
        var pulse = parts.indexOf('lowhp');
        if (pulse >= 0) {
          var lv = opts && opts.level != null ? clamp(+opts.level, 0, 1) : pulseLevel();
          if (!updated && !(opts && opts.level != null) && ++noClockCalls > 120) warnOnce('noclock', '"lowhp" pulses on the module clock, but update(dtMs) was never called: call it once per fixed step.');
          levels[pulse] = lv; key = name + '#' + lv.toFixed(3);
          if (lv === 0 && parts.length === 1) { S.hits++; return r.src; }
        }
        var v = r.entry.variants.get(key);
        if (v) { S.hits++; return v; }
        v = build(r.entry, parts, levels);
        if (!v) { S.fallbacks++; warnOnce('name:' + name, 'unknown variant "' + name + '": drawn unchanged. Known: ' + api.names().join(', ') + '.'); r.entry.variants.set(key, r.src); return r.src; }
        r.entry.variants.set(key, v);
        if (S.sources > 256) warnOnce('thrash', 'many new sprite objects: is a new canvas made every frame? Pass the same (baked) sprite object each frame, or call invalidate(sprite) when its pixels change.');
        return v;
      } catch (x) { S.fallbacks++; warnOnce('variant', 'variant() failed: ' + x); return isRows(src) ? safe(function () { return api.fromRows(src); }, null) : src; }
    };
    /* draw(ctx, src, name, x, y, opts): drawImage of the variant; opts {flipX, alpha, w, h} */
    api.draw = function (ctx, src, name, x, y, opts) {
      try {
        var v = api.variant(src, name, opts), sz = sizeOf(v); if (!sz || !ctx) return;
        opts = opts || {}; var w = opts.w || sz.w, h = opts.h || sz.h, a0 = ctx.globalAlpha;
        if (opts.alpha != null) ctx.globalAlpha = a0 * clamp(+opts.alpha, 0, 1);
        if (opts.flipX) { ctx.save(); ctx.translate(Math.round(x) + w, Math.round(y)); ctx.scale(-1, 1); ctx.drawImage(v, 0, 0, w, h); ctx.restore(); }
        else ctx.drawImage(v, Math.round(x), Math.round(y), w, h);
        ctx.globalAlpha = a0;
      } catch (x2) { warnOnce('draw', 'draw() failed: ' + x2); }
    };
    /* fromRows({rows, pal}) -> canvas: a palette-indexed string sprite, baked once ('.' or a missing key = transparent) */
    api.fromRows = function (spec) {
      if (!isRows(spec)) return null;
      var c = rowsCache && rowsCache.get(spec); if (c) return c;
      var rows = spec.rows, pal = spec.pal || spec.palette, w = 0;
      rows.forEach(function (r) { w = Math.max(w, String(r).length); });
      c = newCanvas(Math.max(1, w), Math.max(1, rows.length));
      var g = c.getContext('2d');
      rows.forEach(function (r, y) { r = String(r); for (var x = 0; x < r.length; x++) { var col = pal[r[x]]; if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } } });
      if (rowsCache) rowsCache.set(spec, c);
      return c;
    };
    /* ramps(src) -> [{role, colors: ['#hex' dark -> light], pixels, hue}] as detected (or as set with setRamps) */
    api.ramps = function (src) {
      try {
        var r = entryFor(src); if (!r.entry) return [];
        return r.entry.info.ramps.map(function (rp) { return { role: rp.role, colors: rp.keys.map(function (k2) { return rgbToHex(r.entry.info.byKey[k2].rgb); }), pixels: rp.n, hue: rp.hue }; });
      } catch (x) { return []; }
    };
    /* setRamps(src, {primary: ['#dark', ..., '#light'], secondary: [...], skin: [...]}): explicit mapping; colours not listed stay fixed */
    api.setRamps = function (src, spec) {
      try {
        if (isRows(src)) src = api.fromRows(src);
        if (!src || !explicitRamps) return;
        if (spec) explicitRamps.set(src, spec); else explicitRamps.delete(src);
        forget(src);
      } catch (x) { warnOnce('setRamps', 'setRamps() failed: ' + x); }
    };
    /* define(name, spec): spec = {ramp: [5 hex dark->light], kind: 'team'|'tint', strength, edge} or {map: {'#from': '#to'}} or {fn(rgb, {role, pos}) -> rgb} */
    api.define = function (name, spec) {
      if (!name || !spec) return;
      custom[String(name).toLowerCase()] = spec;
      api.invalidate();
    };
    api.names = function () {
      return ['base', 'team-blue', 'team-red', 'team-green', 'team-yellow', 'team-a', 'team-b', 'team-n', 'elite', 'rare',
        'poison', 'petrify', 'frozen', 'lowhp', 'spent', 'flash', 'shadow'].concat(Object.keys(custom));
    };
    /* invalidate(src?): forget cached variants of one sprite (its pixels changed) or of all sprites */
    api.invalidate = function (src) {
      if (src && typeof src === 'object') { if (isRows(src)) src = rowsCache && rowsCache.get(src); if (src) forget(src); }
      else if (typeof WeakMap === 'function') { cache = new WeakMap(); S.variants = 0; S.sources = 0; }
    };
    api.update = function (dtMs) { var d = +dtMs; if (isFinite(d) && d > 0) clock += Math.min(d, 1000); updated = true; };
    api.time = function () { return clock; };
    api.pulse = function () { return pulseLevel(); };
    api.setParams = function (p) { setParamsInto(p); api.invalidate(); };
    api.params = function () { var c = {}; for (var kk in P) c[kk] = P[kk]; return c; };
    api.clear = function () { api.invalidate(); clock = 0; };
    api.stats = function () { var c = {}; for (var kk in S) c[kk] = S[kk]; c.buildMs = Math.round(S.buildMs * 10) / 10; c.hitRate = S.calls ? Math.round(S.hits / S.calls * 1000) / 1000 : 0; return c; };
    api.ramp = function (id) { return (RAMPS[id] || teamRamp(id)).slice(); };

    /* drawRamps(ctx, src, x, y, opts): inspector panel (detected ramps -> what a variant maps them to), drawn through the skin */
    api.drawRamps = function (ctx, src, x, y, opts) {
      try {
        opts = opts || {};
        var r = entryFor(src); if (!r.entry || !ctx) return null;
        var ramps = r.entry.info.ramps, sw = opts.swatch || 7, rowH = Math.max(sw + 2, 9), maxN = 0;
        ramps.forEach(function (rp) { maxN = Math.max(maxN, rp.keys.length); });
        maxN = Math.min(maxN, opts.maxSwatches || 8);
        var labels = ramps.map(function (rp) { return (LABEL[rp.role] || rp.role).toUpperCase(); });
        var tw = function (s2) { return SK && SK.measure ? SK.measure(s2, { font: 'ui' }) : s2.length * 4 - 1; };
        var labelW = 6 + labels.reduce(function (m, l) { return Math.max(m, tw(l)); }, 0) + 5;
        var w = opts.w || labelW + maxN * sw + (opts.variant ? maxN * sw + 16 : 0) + 8, h = opts.h || 10 + ramps.length * rowH;
        if (SK && SK.frame) SK.frame(ctx, { x: x, y: y, w: w, h: h }, { role: 'window', team: 'n' });
        else { ctx.fillStyle = '#06061a'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#262e4e'; ctx.fillRect(x + 1, y + 1, w - 2, h - 2); ctx.fillStyle = '#4c5a8a'; ctx.fillRect(x + 1, y + 1, w - 2, 1); }
        var vmap = opts.variant ? (api.variant(src, opts.variant, { level: 1 }) || {}).__psMap : null;
        var rows = Math.max(1, Math.floor((h - 8) / rowH)), shown = ramps.length > rows ? rows - 1 : ramps.length;
        var label = function (str, lx, ly, primary) {
          if (SK && SK.text) SK.text(ctx, str, lx, ly, { font: 'ui', color: SK.lookup ? SK.lookup(primary ? 'text.accent' : 'text.label') : '#ffe070' });
          else tiny(ctx, str, lx, ly + 1, primary ? '#ffe070' : '#b8d0ff');
        };
        ramps.slice(0, shown).forEach(function (rp, i) {
          var yy = y + 5 + i * rowH, sy = yy + ((rowH - sw) >> 1) - 1;
          label(labels[i], x + 6, yy, rp.role === 'primary');
          rp.keys.slice(0, maxN).forEach(function (k2, j) {
            var c = r.entry.info.byKey[k2].rgb, sx = x + labelW + j * sw;
            ctx.fillStyle = '#06061a'; ctx.fillRect(sx - 1, sy - 1, sw + 1, sw + 1);
            ctx.fillStyle = rgbToHex(c); ctx.fillRect(sx, sy, sw - 1, sw - 1);
            if (vmap) {
              var to = vmap.get(k2) || c, tx = x + labelW + maxN * sw + 16 + j * sw;
              ctx.fillStyle = '#06061a'; ctx.fillRect(tx - 1, sy - 1, sw + 1, sw + 1);
              ctx.fillStyle = rgbToHex(to); ctx.fillRect(tx, sy, sw - 1, sw - 1);
            }
          });
          if (vmap) { var ax = x + labelW + maxN * sw + 4, ay = sy + ((sw - 1) >> 1); ctx.fillStyle = '#c8d4f4'; ctx.fillRect(ax, ay, 8, 1); ctx.fillRect(ax + 6, ay - 1, 1, 3); ctx.fillRect(ax + 5, ay - 2, 1, 5); }
        });
        if (shown < ramps.length) label((ramps.length - shown) + ' MORE', x + 6, y + 5 + shown * rowH, false);
        return { x: x, y: y, w: w, h: h };
      } catch (x3) { warnOnce('drawRamps', 'drawRamps() failed: ' + x3); return null; }
    };
    api.version = VERSION;
    return api;
  }

  root.GameDNA_PaletteSwap = { create: create, version: VERSION, ramps: RAMPS, rampFromBase: rampFromBase, DEFAULTS: DEFAULTS };
})(typeof window !== 'undefined' ? window : this);

/* wfc-town-3d.js - Game DNA N-06 module v1.1.0 (2026-11-18)
 * Wave-collapse town builder on a grid, rendered with three.js 0.149.0 (window.THREE).
 * One global: GameDNA_WfcTown3D. Plain classic script, ASCII only, no import/export.
 * Two layers:
 *   createTown(opts)  pure data, no DOM, no three.js: column heights per cell (0 sea, 1 land, 2+ = 1+ storeys),
 *                     a socket rule table, a wave-function-collapse solver that resolves every slot (land, ground
 *                     storey, upper storey, roof) from its neighbours, local re-solve on each edit, exact undo / redo,
 *                     an exhaustive verifier and counts.
 *   create(opts)      the 3D view of a town: code-built low-poly houses (walls, windows, doors, balconies, arches,
 *                     stairs, gable / hip / flat / turret roofs), island slabs, paths, trees, sea, sky, soft shadows,
 *                     an orbit camera, picking, a hover ghost, pop animation, gulls, palettes and a 2D fallback.
 * Deterministic from a seed and the edit history; every animation is driven by update(dt). See README.md.
 */
(function (root) {
  'use strict';
  var VERSION = '1.1.0';
  var STOREY = 0.7;                 // world units per storey; a cell is 1 x 1
  var SLAB = 0.45;                  // depth of the island slab under y = 0
  var WATER_Y = -0.14;
  var FACING_OFFSET = -Math.PI / 2; // built-in creatures (gulls) are modelled with the beak on local +X
  var DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1], DNAME = ['E', 'S', 'W', 'N']; // E = +X, S = +Z
  var MAXH = 8;

  function mulberry(seed) { var a = (seed >>> 0) || 1; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash() { var h = 2166136261 >>> 0; for (var i = 0; i < arguments.length; i++) { var v = arguments[i] | 0; for (var k = 0; k < 4; k++) { h ^= (v >>> (k * 8)) & 255; h = Math.imul(h, 16777619) >>> 0; } } return h >>> 0; }
  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function warn(msg) { try { console.warn('[GameDNA_WfcTown3D] ' + msg); } catch (e) {} }

  // ================================================================== RULES (data, extendable)
  // Horizontal sockets (one char each):
  //   w sea edge      g grass edge     p path crosses this edge   u stair rising toward this edge
  //   b joined to the next storey of the same block              W wall with windows   D door (ground storey)
  //   K balcony (upper storey)   S plain wall a stair lands on   A arch passage opening
  //   e roof eave     r roof ridge continues     n gable end     f flat roof edge (parapet)   c turret (free-standing)
  // Vertical sockets: up of a storey 't' (anything built above) or 'F' (a stair lands on it: needs a flat roof above),
  //   up of an arch 'h' (needs a storey above); down of a storey 'T', of a flat roof 'L', of a sloped roof 'R'.
  var RULES = {
    pairs: {},       // 'ab' and 'ba' -> true
    air: {},         // sockets allowed to face open air (a lower neighbour, or above the map)
    edge: 'w',       // what lies outside the grid at ground level (the sea)
    vpairs: {},      // lowerUp + upperDown -> true
    tiles: [],       // registered extra tiles
    faceW: { W: 1, D: 2.6, S: 0.45, K: 0.38, b: 1 },
    weights: { grass: 6, path2: 0.55, path1: 0.15, path3: 0.3, path4: 0.12, landStair: 0.6, arch: 9, gable: 2.2, ridge: 1.6, hip: 1.0, flat: 0.8, roofStair: 0.9, turret: 7 }
  };
  function addPair(a, b) { RULES.pairs[a + b] = true; RULES.pairs[b + a] = true; }
  ['ww', 'wg', 'wW', 'gg', 'pp', 'gW', 'pD', 'pA', 'uS', 'bb', 'AA', 'rr', 'ee', 'ff', 'nn', 'nf', 'ef', 'en', 'We', 'Wn', 'Wf'].forEach(function (s) { addPair(s[0], s[1]); });
  'WKenfc'.split('').forEach(function (s) { RULES.air[s] = true; });
  ['tT', 'hT', 'tL', 'FL', 'tR'].forEach(function (s) { RULES.vpairs[s] = true; });
  function hcomp(a, b) { return RULES.pairs[a + b] === true; }
  function vcomp(up, dn) { return RULES.vpairs[up + dn] === true; }

  function rotSides(s, k) { var o = ''; for (var d = 0; d < 4; d++) o += s[(d - k + 8) % 4]; return o; } // side d of the result = side d-k of s
  // A registered tile: {id, slot: 'water'|'land'|'ground'|'storey'|'roof', sides: 'ESWN' 4 sockets, rotate: true,
  //   weight, up, down, minH, maxH, build(api, info)}. New sockets need registerPair / allowAir.
  function registerTile(def) {
    if (!def || !def.id || !def.slot || !def.sides || String(def.sides).length !== 4) { warn('registerTile needs {id, slot, sides: 4 sockets}'); return false; }
    if (['water', 'land', 'ground', 'storey', 'roof'].indexOf(def.slot) < 0) { warn('registerTile: slot must be water, land, ground, storey or roof'); return false; }
    for (var i = 0; i < RULES.tiles.length; i++) if (RULES.tiles[i].id === def.id) { RULES.tiles[i] = def; return true; }
    RULES.tiles.push(def); return true;
  }
  function rulesCopy() {
    return { pairs: Object.keys(RULES.pairs).filter(function (k) { return k[0] <= k[1]; }).sort(), air: Object.keys(RULES.air).sort(), edge: RULES.edge,
      vpairs: Object.keys(RULES.vpairs).sort(), tiles: RULES.tiles.map(function (t) { return t.id; }) };
  }

  // ================================================================== TOWN (pure data)
  function slotClass(H, y) { if (H === 0) return 'water'; if (H === 1) return 'land'; if (y === 0) return 'ground'; if (y < H - 1) return 'storey'; return 'roof'; }
  function slotCount(H) { return H <= 1 ? 1 : H; }
  function mk(id, s, up, dn, w, extra) { var t = { id: id, s: s, up: up, dn: dn, w: w }; if (extra) for (var k in extra) t[k] = extra[k]; t.sig = id + ':' + s + ':' + up + dn + (t.v != null ? ':' + t.v : ''); return t; }

  function createTown(opts) {
    opts = opts || {};
    var W = clamp(num(opts.w, 12) | 0, 3, 40), D = clamp(num(opts.d, opts.w || 12) | 0, 3, 40);
    var maxH = clamp(num(opts.maxH, 6) | 0, 2, MAXH);
    var seed = num(opts.seed, 1) >>> 0;
    var radius = clamp(num(opts.radius, 2) | 0, 1, 6);
    var Hs = new Int8Array(W * D), tiles = {}, serial = 0, undoS = [], redoS = [], lastInfo = null;
    var stats = { solves: 0, retries: 0, fallbacks: 0, full: 0 };
    var town = { w: W, d: D, maxH: maxH, seed: seed, version: VERSION };
    function inG(x, z) { return x >= 0 && z >= 0 && x < W && z < D; }
    function H(x, z) { return inG(x, z) ? Hs[z * W + x] : -1; }
    function key(x, y, z) { return x + ',' + y + ',' + z; }
    if (opts.heights) { // rows of digits, or an array of numbers
      var hh = opts.heights;
      for (var z0 = 0; z0 < D; z0++) for (var x0 = 0; x0 < W; x0++) {
        var v = Array.isArray(hh) && typeof hh[0] === 'string' ? +(String(hh[z0] || '')[x0] || 0) : num(Array.isArray(hh) ? hh[z0 * W + x0] : 0, 0);
        Hs[z0 * W + x0] = clamp(v | 0, 0, maxH);
      }
    }

    // ---------- candidate tiles per slot (occupancy decides the slot class; sockets decide the rest)
    function landCands() {
      var out = [], wt = RULES.weights;
      for (var m = 0; m < 16; m++) {
        var s = '', bits = 0;
        for (var d = 0; d < 4; d++) { var on = (m >> d) & 1; s += on ? 'p' : 'g'; bits += on; }
        var w = bits === 0 ? wt.grass : bits === 1 ? wt.path1 : bits === 2 ? wt.path2 : bits === 3 ? wt.path3 : wt.path4;
        out.push(mk(bits ? 'path' : 'grass', s, 'a', '_', w));
      }
      for (d = 0; d < 4; d++) out.push(mk('land-stair', rotSides('uggg', d), 'a', '_', wt.landStair));
      return out;
    }
    function storeyCands(x, y, z, ground) {
      var Hx = H(x, z), opts4 = [];
      for (var d = 0; d < 4; d++) {
        var nh = H(x + DX[d], z + DZ[d]);
        if (nh >= y + 2) opts4.push(['b']);                               // the neighbour has a storey at this level: joined
        else opts4.push(ground ? ['W', 'D', 'S'] : ['W', 'K', 'S']);
      }
      var out = [], fw = RULES.faceW;
      (function rec(d, s, nd, nk, ns, w) {
        if (d === 4) { var hasS = ns > 0; out.push(mk(ground ? 'house' : 'storey', s, hasS ? 'F' : (y < Hx - 2 ? 't' : 't'), ground ? '_' : 'T', w)); return; }
        opts4[d].forEach(function (c) {
          if (c === 'D' && nd) return; if (c === 'K' && nk) return; if (c === 'S' && ns) return;
          rec(d + 1, s + c, nd + (c === 'D'), nk + (c === 'K'), ns + (c === 'S'), w * (fw[c] || 1));
        });
      })(0, '', 0, 0, 0, 1);
      if (ground && Hx >= 3) { out.push(mk('arch', 'AbAb', 'h', '_', RULES.weights.arch)); out.push(mk('arch', 'bAbA', 'h', '_', RULES.weights.arch)); }
      return out;
    }
    function roofCands(x, y, z) {
      var out = [], wt = RULES.weights, Hx = H(x, z);
      var ends = [['r', 'r'], ['r', 'n'], ['n', 'r'], ['n', 'n']];
      ends.forEach(function (e) {
        var w = wt.gable * (e[0] === 'r' ? wt.ridge : 1) * (e[1] === 'r' ? wt.ridge : 1);
        out.push(mk('roof-gable', e[0] + 'e' + e[1] + 'e', 'a', 'R', w));   // ridge along X
        out.push(mk('roof-gable', 'e' + e[0] + 'e' + e[1], 'a', 'R', w));   // ridge along Z
      });
      out.push(mk('roof-hip', 'eeee', 'a', 'R', wt.hip));
      out.push(mk('roof-flat', 'ffff', 'a', 'L', wt.flat));
      for (var d = 0; d < 4; d++) out.push(mk('roof-stair', rotSides('ufff', d), 'a', 'L', wt.roofStair));
      if (Hx >= 4) out.push(mk('roof-turret', 'cccc', 'a', 'R', wt.turret));
      return out;
    }
    function extraCands(cls, Hx) {
      var out = [];
      RULES.tiles.forEach(function (t) {
        if (t.slot !== cls) return; if (t.minH != null && Hx < t.minH) return; if (t.maxH != null && Hx > t.maxH) return;
        var seen = {}, n = t.rotate === false ? 1 : 4;
        var dflt = { water: ['a', '_'], land: ['a', '_'], ground: ['t', '_'], storey: ['t', 'T'], roof: ['a', 'R'] }[cls];
        for (var k = 0; k < n; k++) {
          var s = rotSides(String(t.sides), k); if (seen[s]) continue; seen[s] = 1;
          out.push(mk(t.id, s, t.up || dflt[0], t.down || dflt[1], num(t.weight, 1), { ext: true, rot: k }));
        }
      });
      return out;
    }
    function candidates(x, y, z) {
      var Hx = H(x, z), cls = slotClass(Hx, y), out;
      if (cls === 'water') out = [mk('water', 'wwww', 'a', '_', 1)];
      else if (cls === 'land') out = landCands();
      else if (cls === 'ground') out = storeyCands(x, y, z, true);
      else if (cls === 'storey') out = storeyCands(x, y, z, false);
      else out = roofCands(x, y, z);
      return out.concat(extraCands(cls, Hx));
    }

    // ---------- the solver
    // Slots: one per (x, y, z) that holds something. Neighbours: slot index, AIR (-1), EDGE (-2, the sea at y 0).
    function buildSlots() {
      var slots = [], index = {};
      for (var z = 0; z < D; z++) for (var x = 0; x < W; x++) {
        var n = slotCount(H(x, z));
        for (var y = 0; y < n; y++) { index[key(x, y, z)] = slots.length; slots.push({ x: x, y: y, z: z, cls: slotClass(H(x, z), y), k: key(x, y, z) }); }
      }
      slots.forEach(function (s) {
        var nb = [];
        for (var d = 0; d < 4; d++) {
          var nx = s.x + DX[d], nz = s.z + DZ[d];
          if (!inG(nx, nz)) nb.push(s.y === 0 ? -2 : -1);
          else { var j = index[key(nx, s.y, nz)]; nb.push(j == null ? -1 : j); }
        }
        var up = index[key(s.x, s.y + 1, s.z)]; nb.push(up == null ? -1 : up);
        var dn = s.y > 0 ? index[key(s.x, s.y - 1, s.z)] : null; nb.push(dn == null ? -3 : dn);
        s.nb = nb;
      });
      return { slots: slots, index: index };
    }
    // Does tile t (in slot a) have support from slot b's alive candidates in direction d (0..3 horizontal, 4 up, 5 down)?
    function supported(t, d, B) {
      if (d < 4) {
        var o = (d + 2) % 4, mine = t.s[d];
        for (var i = 0; i < B.cand.length; i++) if (B.alive[i] && hcomp(mine, B.cand[i].s[o])) return true;
        return false;
      }
      for (i = 0; i < B.cand.length; i++) if (B.alive[i] && (d === 4 ? vcomp(t.up, B.cand[i].dn) : vcomp(B.cand[i].up, t.dn))) return true;
      return false;
    }
    function staticOk(t, s) {
      for (var d = 0; d < 4; d++) {
        var nb = s.nb[d];
        if (nb === -1 && !RULES.air[t.s[d]]) return false;
        if (nb === -2 && !hcomp(t.s[d], RULES.edge)) return false;
      }
      if (s.nb[4] === -1 && t.up !== 'a') return false;
      if (s.nb[5] === -3 && t.dn !== '_') return false;
      return true;
    }
    function solve(prevTiles, region, rng) {
      var S = buildSlots(), slots = S.slots;
      slots.forEach(function (s) {
        var all = candidates(s.x, s.y, s.z), keep = null;
        if (prevTiles && !region(s.x, s.z)) {
          var p = prevTiles[s.k];
          if (p) for (var i = 0; i < all.length; i++) if (all[i].sig === p.sig) { keep = all[i]; break; }
        }
        s.cand = keep ? [keep] : all; s.fixed = !!keep;
        s.alive = new Uint8Array(s.cand.length); s.n = 0;
        for (i = 0; i < s.cand.length; i++) if (staticOk(s.cand[i], s)) { s.alive[i] = 1; s.n++; }
      });
      // arc consistency (AC-3): revise every slot against every neighbour until nothing changes
      var queue = [], inQ = new Uint8Array(slots.length);
      for (var i = 0; i < slots.length; i++) { queue.push(i); inQ[i] = 1; }
      function propagate() {
        while (queue.length) {
          var bi = queue.shift(); inQ[bi] = 0; var B = slots[bi];
          if (B.n === 0) return false;
          for (var d = 0; d < 6; d++) {
            var ai = B.nb[d]; if (ai < 0) continue;
            var A = slots[ai], od = d < 4 ? (d + 2) % 4 : (d === 4 ? 5 : 4), changed = false;
            for (var c = 0; c < A.cand.length; c++) if (A.alive[c] && !supported(A.cand[c], od, B)) { A.alive[c] = 0; A.n--; changed = true; }
            if (A.n === 0) return false;
            if (changed && !inQ[ai]) { queue.push(ai); inQ[ai] = 1; }
          }
        }
        return true;
      }
      if (!propagate()) return null;
      // collapse: lowest entropy first (seeded noise breaks ties), weighted pick, propagate
      for (;;) {
        var best = -1, bestE = Infinity;
        for (i = 0; i < slots.length; i++) {
          var s = slots[i]; if (s.n <= 1) continue;
          var sw = 0, swl = 0;
          for (var c = 0; c < s.cand.length; c++) if (s.alive[c]) { var w = s.cand[c].w; sw += w; swl += w * Math.log(w); }
          var e = Math.log(sw) - swl / sw + rng() * 1e-3;
          if (e < bestE) { bestE = e; best = i; }
        }
        if (best < 0) break;
        s = slots[best]; var tot = 0;
        for (c = 0; c < s.cand.length; c++) if (s.alive[c]) tot += s.cand[c].w;
        var r = rng() * tot, pick = -1;
        for (c = 0; c < s.cand.length; c++) if (s.alive[c]) { pick = c; r -= s.cand[c].w; if (r <= 0) break; }
        for (c = 0; c < s.cand.length; c++) if (s.alive[c] && c !== pick) { s.alive[c] = 0; s.n--; }
        queue.push(best); inQ[best] = 1;
        if (!propagate()) return null;
      }
      var out = {};
      slots.forEach(function (s) { for (var c = 0; c < s.cand.length; c++) if (s.alive[c]) { out[s.k] = s.cand[c]; break; } });
      return out;
    }
    // Guaranteed-valid assignment (plain walls, flat roofs, grass): used only when the solver keeps failing.
    function fallback() {
      var out = {};
      for (var z = 0; z < D; z++) for (var x = 0; x < W; x++) {
        var Hx = H(x, z), n = slotCount(Hx);
        for (var y = 0; y < n; y++) {
          var cls = slotClass(Hx, y), t;
          if (cls === 'water') t = mk('water', 'wwww', 'a', '_', 1);
          else if (cls === 'land') t = mk('grass', 'gggg', 'a', '_', 1);
          else if (cls === 'roof') t = mk('roof-flat', 'ffff', 'a', 'L', 1);
          else { var s = ''; for (var d = 0; d < 4; d++) s += H(x + DX[d], z + DZ[d]) >= y + 2 ? 'b' : 'W'; t = mk(cls === 'ground' ? 'house' : 'storey', s, 't', cls === 'ground' ? '_' : 'T', 1); }
          out[key(x, y, z)] = t;
        }
      }
      return out;
    }
    function resolveAround(cx, cz, full) {
      stats.solves++;
      var radii = full ? [] : [radius, radius + 2, radius + 4];
      for (var a = 0; a < radii.length; a++) {
        var R = radii[a], rng = mulberry(hash(seed, serial, cx, cz, a, 77));
        var res = solve(tiles, function (x, z) { return Math.abs(x - cx) <= R && Math.abs(z - cz) <= R; }, rng);
        if (res) { tiles = res; return { radius: R, fallback: false }; }
        stats.retries++;
      }
      stats.full++;
      for (var k = 0; k < 6; k++) {
        res = solve(null, null, mulberry(hash(seed, serial, cx, cz, 100 + k)));
        if (res) { tiles = res; return { radius: -1, fallback: false }; }
        stats.retries++;
      }
      stats.fallbacks++; tiles = fallback(); return { radius: -1, fallback: true };
    }

    // ---------- snapshots, edits, undo / redo
    function snapshot() { return { H: Array.prototype.slice.call(Hs), tiles: Object.assign({}, tiles), serial: serial }; }
    function restore(sn) { for (var i = 0; i < Hs.length; i++) Hs[i] = sn.H[i]; tiles = Object.assign({}, sn.tiles); serial = sn.serial; }
    function colSig(x, z) { var n = slotCount(H(x, z)), s = H(x, z) + '|'; for (var y = 0; y < n; y++) { var t = tiles[key(x, y, z)]; s += (t ? t.sig : '?') + ';'; } return s; }
    function diffCols(before) { var out = []; for (var z = 0; z < D; z++) for (var x = 0; x < W; x++) if (before[z * W + x] !== colSig(x, z)) out.push({ x: x, z: z }); return out; }
    function allSigs() { var a = []; for (var z = 0; z < D; z++) for (var x = 0; x < W; x++) a.push(colSig(x, z)); return a; }
    town.set = function (x, z, h, kind) {
      x |= 0; z |= 0; if (!inG(x, z)) return null;
      h = clamp(h | 0, 0, maxH); var from = H(x, z); if (h === from) return null;
      var before = allSigs(), snap = snapshot();
      Hs[z * W + x] = h; serial++;
      var r = resolveAround(x, z, false);
      undoS.push(snap); if (undoS.length > num(opts.maxUndo, 400)) undoS.shift(); redoS.length = 0;
      lastInfo = { kind: kind || 'set', x: x, z: z, from: from, to: h, serial: serial, radius: r.radius, fallback: r.fallback, changed: diffCols(before) };
      return lastInfo;
    };
    town.grow = function (x, z) { return town.set(x, z, H(x, z) + 1, 'grow'); };
    town.shrink = function (x, z) { return town.set(x, z, H(x, z) - 1, 'shrink'); };
    town.undo = function () {
      if (!undoS.length) return null; var before = allSigs(); redoS.push(snapshot()); restore(undoS.pop());
      lastInfo = { kind: 'undo', serial: serial, changed: diffCols(before) }; return lastInfo;
    };
    town.redo = function () {
      if (!redoS.length) return null; var before = allSigs(); undoS.push(snapshot()); restore(redoS.pop());
      lastInfo = { kind: 'redo', serial: serial, changed: diffCols(before) }; return lastInfo;
    };
    town.canUndo = function () { return undoS.length > 0; };
    town.canRedo = function () { return redoS.length > 0; };
    town.clearHistory = function () { undoS.length = 0; redoS.length = 0; };
    town.resolveAll = function () { var before = allSigs(); serial++; var r = resolveAround(0, 0, true); lastInfo = { kind: 'resolve', serial: serial, fallback: r.fallback, changed: diffCols(before) }; return lastInfo; };
    town.load = function (heights) { // replace the whole map (clears history)
      for (var z = 0; z < D; z++) for (var x = 0; x < W; x++) { var v = typeof heights[0] === 'string' ? +(String(heights[z] || '')[x] || 0) : heights[z * W + x]; Hs[z * W + x] = clamp(num(v, 0) | 0, 0, maxH); }
      tiles = {}; serial = 0; town.clearHistory(); return town.resolveAll();
    };
    town.snapshot = snapshot;
    town.H = H; town.inGrid = inG;
    town.tile = function (x, y, z) { return tiles[key(x, y, z)] || null; };
    town.column = function (x, z) { var n = slotCount(H(x, z)), out = []; for (var y = 0; y < n; y++) out.push(tiles[key(x, y, z)] || null); return out; };
    town.heights = function () { var rows = []; for (var z = 0; z < D; z++) { var r = ''; for (var x = 0; x < W; x++) r += H(x, z); rows.push(r); } return rows; };
    town.slots = function () { // every slot with its class and tile (for verifiers and probes)
      var out = [];
      for (var z = 0; z < D; z++) for (var x = 0; x < W; x++) { var Hx = H(x, z), n = slotCount(Hx); for (var y = 0; y < n; y++) { var t = tiles[key(x, y, z)]; out.push({ x: x, y: y, z: z, cls: slotClass(Hx, y), id: t ? t.id : null, s: t ? t.s : null, up: t ? t.up : null, dn: t ? t.dn : null }); } }
      return out;
    };
    town.serialize = function () { var a = town.heights().join('/') + '#' + serial + '#'; var ks = Object.keys(tiles).sort(); for (var i = 0; i < ks.length; i++) a += ks[i] + '=' + tiles[ks[i]].sig + ';'; return a; };
    town.serial = function () { return serial; };
    town.last = function () { return lastInfo; };
    town.stats = function () { return Object.assign({}, stats, { undo: undoS.length, redo: redoS.length }); };
    town.rules = rulesCopy;
    // Exhaustive verifier: every slot holds a tile of its class; every side, top and bottom matches its neighbour.
    town.verify = function () {
      var bad = [], checked = 0;
      for (var z = 0; z < D; z++) for (var x = 0; x < W; x++) {
        var Hx = H(x, z), n = slotCount(Hx);
        for (var y = 0; y < n; y++) {
          var t = tiles[key(x, y, z)], cls = slotClass(Hx, y);
          if (!t) { bad.push({ x: x, y: y, z: z, what: 'empty slot' }); continue; }
          var okIds = { water: ['water'], land: ['grass', 'path', 'land-stair'], ground: ['house', 'arch'], storey: ['storey'], roof: ['roof-gable', 'roof-hip', 'roof-flat', 'roof-stair', 'roof-turret'] }[cls];
          var ext = RULES.tiles.some(function (e) { return e.id === t.id && e.slot === cls; });
          if (okIds.indexOf(t.id) < 0 && !ext) bad.push({ x: x, y: y, z: z, what: t.id + ' in a ' + cls + ' slot' });
          for (var d = 0; d < 4; d++) {
            var nx = x + DX[d], nz = z + DZ[d], a = t.s[d], b; checked++;
            if (!inG(nx, nz)) b = y === 0 ? RULES.edge : null;
            else { var u = tiles[key(nx, y, nz)]; b = y < slotCount(H(nx, nz)) ? (u ? u.s[(d + 2) % 4] : '?') : null; }
            if (b === null ? !RULES.air[a] : !hcomp(a, b)) bad.push({ x: x, y: y, z: z, d: DNAME[d], what: a + ' vs ' + (b === null ? 'air' : b) });
          }
          checked++;
          var above = y + 1 < n ? tiles[key(x, y + 1, z)] : null;
          if (above ? !vcomp(t.up, above.dn) : t.up !== 'a') bad.push({ x: x, y: y, z: z, what: 'top ' + t.up + ' vs ' + (above ? above.dn : 'air') });
        }
      }
      return { ok: bad.length === 0, checked: checked, violations: bad };
    };
    town.counts = function () {
      var c = { land: 0, houses: 0, storeys: 0, tallest: 0, doors: 0, windows: 0, balconies: 0, arches: 0, stairs: 0, paths: 0, turrets: 0, gables: 0, hips: 0, flats: 0, extra: {} };
      for (var z = 0; z < D; z++) for (var x = 0; x < W; x++) {
        var Hx = H(x, z); if (Hx >= 1) c.land++; if (Hx >= 2) { c.houses++; c.storeys += Hx - 1; c.tallest = Math.max(c.tallest, Hx - 1); }
        var col = town.column(x, z);
        col.forEach(function (t) {
          if (!t) return;
          for (var d = 0; d < 4; d++) { if (t.s[d] === 'D') c.doors++; if (t.s[d] === 'W') c.windows++; if (t.s[d] === 'K') c.balconies++; }
          if (t.id === 'arch') c.arches++; if (t.id === 'land-stair' || t.id === 'roof-stair') c.stairs++; if (t.id === 'path') c.paths++;
          if (t.id === 'roof-turret') c.turrets++; if (t.id === 'roof-gable') c.gables++; if (t.id === 'roof-hip') c.hips++; if (t.id === 'roof-flat' || t.id === 'roof-stair') c.flats++;
          if (t.ext) c.extra[t.id] = (c.extra[t.id] || 0) + 1;
        });
      }
      return c;
    };
    town.resolveAll();
    town.clearHistory();
    return town;
  }

  // ================================================================== PALETTES
  var PALETTES = {
    harbour: { name: 'Harbour', sky: ['#5fb4e6', '#cdeefa'], fog: '#cfeaf6', sea: '#2c8fb4', shallow: '#74d0d4', foam: '#f4fbff',
      grass: ['#86bd62', '#7cb55b', '#92c46b'], lip: '#6fa64e', earth: '#c4a77d', rock: '#a69a88', path: '#ead9b5', pathEdge: '#c9b48c', terrace: '#e8dcc6',
      walls: ['#fbf5e9', '#f7e3c4', '#f4d2c0', '#e3eef1', '#f8ecc9', '#dcead6', '#f1dce6'], trim: '#ffffff', plinth: '#cdbfa6',
      roofs: ['#d8684a', '#c85b3f', '#e27b55', '#d07448'], shutters: ['#3f7fb0', '#5f9c6c', '#d68a3a', '#3e8f93'], accent: ['#e85d5d', '#f2b134', '#4fa3d8', '#8cc26b'],
      wood: '#8b5b3b', glass: '#36587a', glow: '#ffcf7a', leaf: ['#5aa64a', '#4a9a45', '#78bc58', '#3f8f4a'], trunk: '#7a5236',
      sun: '#fff1d6', sunI: 1.15, sunDir: [-0.55, 1, 0.42], hemi: ['#e2f4ff', '#8f8466'], hemiI: 0.72, lit: 0 },
    highland: { name: 'Highland', sky: ['#7b9bbd', '#dfe8ee'], fog: '#d9e3ea', sea: '#3d7896', shallow: '#6fa9b4', foam: '#eef4f7',
      grass: ['#7aa859', '#6f9e52', '#86b264'], lip: '#668f48', earth: '#9c8a70', rock: '#8e8a84', path: '#cfc6b4', pathEdge: '#a69d8a', terrace: '#cfcac0',
      walls: ['#e9e4da', '#d9d2c4', '#cfc8ba', '#e6d8bd', '#d6cfc2', '#ece6dc'], trim: '#f6f3ec', plinth: '#9b958a',
      roofs: ['#55687f', '#4b5d73', '#62758a', '#6b5a52'], shutters: ['#7b2f2f', '#2f5a4a', '#344c6e', '#8a6a2f'], accent: ['#c94a3a', '#e0b13f', '#3f6fa8', '#5f9e5a'],
      wood: '#6e4a33', glass: '#2e4357', glow: '#ffd38a', leaf: ['#3f7d44', '#36703f', '#55904f', '#2f6a44'], trunk: '#5f4330',
      sun: '#fff6e8', sunI: 1.0, sunDir: [-0.6, 0.9, 0.35], hemi: ['#e6eef5', '#6f6a5c'], hemiI: 0.78, lit: 0 },
    dusk: { name: 'Lantern dusk', sky: ['#3b3f7a', '#f2a47a'], fog: '#c98f86', sea: '#3b5f8a', shallow: '#5d86a6', foam: '#f6dccf',
      grass: ['#6f9a5c', '#66905a', '#79a565'], lip: '#5d824c', earth: '#9a7b62', rock: '#857a78', path: '#d9bfa0', pathEdge: '#ad9278', terrace: '#d4c2b2',
      walls: ['#f4e1cf', '#efcfbf', '#e6d4dc', '#d8dde8', '#f2e2bf', '#dbe1cf'], trim: '#fbefe6', plinth: '#b39f8f',
      roofs: ['#b9583f', '#a64c45', '#c96a4a', '#8f5a6e'], shutters: ['#355f8a', '#4f7d5e', '#a8622e', '#3d6f78'], accent: ['#e85d5d', '#f2b134', '#4fa3d8', '#8cc26b'],
      wood: '#73492f', glass: '#2d3550', glow: '#ffc56a', leaf: ['#4d7f45', '#43733f', '#5f8f50', '#3a6a45'], trunk: '#5f4030',
      sun: '#ffb27a', sunI: 0.85, sunDir: [-0.8, 0.45, 0.25], hemi: ['#a6a8e0', '#5a4a52'], hemiI: 0.7, lit: 1 },
    blossom: { name: 'Blossom', sky: ['#8fd0e8', '#fbe9ef'], fog: '#f3e6ee', sea: '#45b5b0', shallow: '#93dccf', foam: '#ffffff',
      grass: ['#a3d07a', '#97c871', '#b0d987'], lip: '#8fbd66', earth: '#d0ae8a', rock: '#b5a598', path: '#f1e1c6', pathEdge: '#d6bf9c', terrace: '#f1e6da',
      walls: ['#fde9ee', '#f9d6df', '#e6f3ea', '#fff3dc', '#e4ecfb', '#f6e2f3'], trim: '#ffffff', plinth: '#d9c4c4',
      roofs: ['#3fa39a', '#4b8fb8', '#e07a8f', '#5fae8a'], shutters: ['#e07a8f', '#4b8fb8', '#e2a33a', '#3fa39a'], accent: ['#ff7a9a', '#ffc94a', '#5ab8e6', '#86d07a'],
      wood: '#946545', glass: '#3d5f7f', glow: '#ffd98a', leaf: ['#7cc06a', '#f2a7c3', '#6db35e', '#f6c1d4'], trunk: '#8a5d3e',
      sun: '#fff4e8', sunI: 0.98, sunDir: [-0.5, 1, 0.5], hemi: ['#fff0f6', '#9a8a70'], hemiI: 0.75, lit: 0 }
  };

  // ================================================================== GEOMETRY BUILDER (merged, vertex-coloured)
  function rgb(hex) { hex = String(hex).replace('#', ''); if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]; var n = parseInt(hex, 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
  function shade(c, f) { return [clamp(c[0] * f, 0, 1), clamp(c[1] * f, 0, 1), clamp(c[2] * f, 0, 1)]; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function Geo() { this.p = []; this.c = []; }
  Geo.prototype.tri = function (a, b, c, col) { this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); for (var i = 0; i < 3; i++) this.c.push(col[0], col[1], col[2]); };
  Geo.prototype.quad = function (a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); };
  // axis-aligned box; skip = bitmask of faces to leave out: 1 +x, 2 -x, 4 +y, 8 -y, 16 +z, 32 -z
  Geo.prototype.box = function (x0, y0, z0, x1, y1, z1, col, skip, topCol) {
    skip = skip || 0; var t = topCol || col;
    if (!(skip & 1)) this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], col);
    if (!(skip & 2)) this.quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], col);
    if (!(skip & 4)) this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], t);
    if (!(skip & 8)) this.quad([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], col);
    if (!(skip & 16)) this.quad([x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1], col);
    if (!(skip & 32)) this.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], col);
  };
  // low-poly blob (octahedron-ish sphere) for canopies, flowers, finials
  Geo.prototype.blob = function (x, y, z, rx, ry, rz, col, seg) {
    seg = seg || 6; var rings = 3, pts = [];
    for (var i = 0; i <= rings; i++) { var v = i / rings * Math.PI, row = []; for (var j = 0; j < seg; j++) { var u = j / seg * Math.PI * 2 + (i % 2) * Math.PI / seg; row.push([x + Math.sin(v) * Math.cos(u) * rx, y + Math.cos(v) * ry, z + Math.sin(v) * Math.sin(u) * rz]); } pts.push(row); }
    for (i = 0; i < rings; i++) for (j = 0; j < seg; j++) {
      var a = pts[i][j], b = pts[i][(j + 1) % seg], c = pts[i + 1][j], d = pts[i + 1][(j + 1) % seg];
      var cc = shade(col, 1.04 - i * 0.06);
      if (i === 0) this.tri(a, d, c, cc); else if (i === rings - 1) this.tri(a, b, c, cc); else this.quad(a, b, d, c, cc);
    }
  };
  Geo.prototype.cyl = function (x, y, z, r0, r1, h, col, seg, cap) {
    seg = seg || 8;
    for (var j = 0; j < seg; j++) {
      var a0 = j / seg * Math.PI * 2, a1 = (j + 1) / seg * Math.PI * 2;
      var p0 = [x + Math.cos(a0) * r0, y, z + Math.sin(a0) * r0], p1 = [x + Math.cos(a1) * r0, y, z + Math.sin(a1) * r0];
      var q0 = [x + Math.cos(a0) * r1, y + h, z + Math.sin(a0) * r1], q1 = [x + Math.cos(a1) * r1, y + h, z + Math.sin(a1) * r1];
      if (r1 > 0.0001) this.quad(p0, q0, q1, p1, col); else this.tri(p0, [x, y + h, z], p1, col);
      if (cap !== false && r1 > 0.0001) this.tri(q0, [x, y + h, z], q1, shade(col, 1.06));
    }
  };

  // ================================================================== 3D VIEW
  function create(opts) {
    opts = opts || {};
    var THREE = opts.THREE || root.THREE;
    var town = opts.town || createTown(opts);
    var W = town.w, D = town.d;
    var P = Object.assign({ palette: 'harbour', yaw: 45, pitch: 36, zoom: 1, shadows: 'soft', quality: 'high', gulls: 3, pop: 'on', ghost: 'on', grid: 0.22, fov: 30 }, opts.params || {});
    var seed = town.seed;
    var self = { version: VERSION, town: town, params: P, FACING_OFFSET: FACING_OFFSET, STOREY: STOREY, gl: false, error: null };
    var canvas = opts.canvas || null, overlay = opts.overlay || null, octx = overlay ? overlay.getContext('2d') : null;
    var cssW = 960, cssH = 540, dpr = 1, clock = 0;
    var pal = PALETTES[P.palette] || PALETTES.harbour;
    function wx(x) { return x - (W - 1) / 2; } function wz(z) { return z - (D - 1) / 2; }
    function cb(name) { var f = opts[name]; return typeof f === 'function' ? function () { try { return f.apply(null, arguments); } catch (e) { warn(name + ' threw: ' + e.message); } } : null; }
    var onEdit = cb('onEdit');

    if (!THREE) { self.error = 'three.js is not loaded: put three.min.js (0.149.0) in a script tag before this module'; warn(self.error); }
    var renderer = null;
    if (THREE && canvas) {
      try {
        var ctxGL = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!ctxGL) throw new Error('no WebGL context');
        renderer = new THREE.WebGLRenderer({ canvas: canvas, context: ctxGL, antialias: true, alpha: false, powerPreference: 'high-performance' });
        renderer.shadowMap.enabled = P.shadows !== 'off'; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        self.gl = true;
      } catch (e) { renderer = null; self.error = 'WebGL is not available (' + e.message + ')'; warn(self.error); }
    }
    var has3D = !!renderer;
    self.renderer = renderer;

    var scene = null, camera = null, sun = null, hemi = null, water = null, shallow = null, ghost = null, cols = {}, gulls = [], puffs = [];
    var mats = {}, waterTex = null, skyTex = null;
    var cam = { yaw: num(P.yaw, 45), yawT: num(P.yaw, 45), pitch: num(P.pitch, 36), pitchT: num(P.pitch, 36), zoom: num(P.zoom, 1), zoomT: num(P.zoom, 1) };
    var hover = null, hoverMode = 'grow';

    // ---------- materials and environment
    function canvasTex(w, h, draw) { var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); var t = new THREE.CanvasTexture(c); return t; }
    function makeEnv() {
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(num(P.fov, 30), 16 / 9, 0.5, 400);
      hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.7); scene.add(hemi);
      sun = new THREE.DirectionalLight(0xffffff, 1); sun.castShadow = P.shadows !== 'off';
      var span = Math.max(W, D) * 0.5 + 3;
      sun.shadow.camera.left = -span; sun.shadow.camera.right = span; sun.shadow.camera.top = span; sun.shadow.camera.bottom = -span;
      sun.shadow.camera.near = 1; sun.shadow.camera.far = 80; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.025;
      var ms = P.quality === 'low' ? 1024 : 2048; sun.shadow.mapSize.set(ms, ms); sun.shadow.radius = 3;
      scene.add(sun); scene.add(sun.target);
      mats.solid = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.86, metalness: 0, side: THREE.DoubleSide });
      mats.glass = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.25, metalness: 0.15, side: THREE.DoubleSide, emissive: new THREE.Color(0xffc56a), emissiveIntensity: 0 });
      mats.foam = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false });
      mats.lamp = new THREE.MeshBasicMaterial({ vertexColors: true }); // lantern glass: unlit, always bright (warm glow at dusk)
      // sea: one big plane with a code-drawn ripple texture, animated by update()
      waterTex = canvasTex(256, 256, function (g, w, h) {
        var r = mulberry(seed * 13 + 5); g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
        for (var i = 0; i < 90; i++) { g.strokeStyle = 'rgba(0,40,70,' + (0.05 + r() * 0.07) + ')'; g.lineWidth = 2 + r() * 2; var x = r() * w, y = r() * h, l = 12 + r() * 30; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 3, x + l, y); g.stroke(); }
        for (i = 0; i < 70; i++) { g.strokeStyle = 'rgba(255,255,255,' + (0.25 + r() * 0.35) + ')'; g.lineWidth = 1.5; var x2 = r() * w, y2 = r() * h, l2 = 6 + r() * 16; g.beginPath(); g.moveTo(x2, y2); g.quadraticCurveTo(x2 + l2 / 2, y2 - 2, x2 + l2, y2); g.stroke(); }
      });
      waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping; waterTex.repeat.set(40, 40);
      water = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshLambertMaterial({ map: waterTex }));
      water.rotation.x = -Math.PI / 2; water.position.y = WATER_Y; water.receiveShadow = true; scene.add(water);
      // build area: a lighter shallow square with faint cell dots, so players see where they can build
      shallow = new THREE.Mesh(new THREE.PlaneGeometry(W + 3, D + 3), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 1 }));
      shallow.rotation.x = -Math.PI / 2; shallow.position.y = WATER_Y + 0.004; scene.add(shallow);
      ghost = new THREE.Group();
      var gb = new THREE.BoxGeometry(1, 1, 1);
      ghost.add(new THREE.Mesh(gb, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false })));
      ghost.add(new THREE.LineSegments(new THREE.EdgesGeometry(gb), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })));
      ghost.visible = false; scene.add(ghost);
    }
    function applyPalette() {
      pal = PALETTES[P.palette] || PALETTES.harbour;
      var sky = pal.sky;
      if (skyTex) skyTex.dispose();
      skyTex = canvasTex(64, 512, function (g, w, h) { // vertical gradient with a 2 % ordered dither: no 8-bit bands
        var a = rgb(sky[0]), b = rgb(sky[1]), img = g.createImageData(w, h), B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
        for (var y = 0; y < h; y++) { var t = Math.min(1, y / (h * 0.62)); t = t * t * (3 - 2 * t);
          for (var x = 0; x < w; x++) { var dth = (B4[(y & 3) * 4 + (x & 3)] / 16 - 0.5) / 255 * 1.5, i = (y * w + x) * 4;
            for (var c = 0; c < 3; c++) img.data[i + c] = Math.round(clamp(a[c] + (b[c] - a[c]) * t + dth, 0, 1) * 255); img.data[i + 3] = 255; } }
        g.putImageData(img, 0, 0); });
      scene.background = skyTex;
      scene.fog = new THREE.Fog(pal.fog, 30, 95);
      hemi.color.set(pal.hemi[0]); hemi.groundColor.set(pal.hemi[1]); hemi.intensity = pal.hemiI * 0.78;
      sun.color.set(pal.sun); sun.intensity = pal.sunI * 0.82;
      var sd = new THREE.Vector3(pal.sunDir[0], pal.sunDir[1], pal.sunDir[2]).normalize().multiplyScalar(30);
      sun.position.copy(sd); sun.target.position.set(0, 0, 0);
      water.material.color.set(pal.sea);
      mats.glass.emissive.set(pal.glow); mats.glass.emissiveIntensity = pal.lit ? 0.95 : 0;
      var old = shallow.material.map; if (old) old.dispose();
      shallow.material.map = canvasTex(256, 256, function (g, w, h) {
        var sh = rgb(pal.shallow), cx = w / 2, gr = g.createRadialGradient(cx, cx, w * 0.2, cx, cx, w * 0.5);
        var c0 = 'rgba(' + (sh[0] * 255 | 0) + ',' + (sh[1] * 255 | 0) + ',' + (sh[2] * 255 | 0) + ',';
        gr.addColorStop(0, c0 + '0.85)'); gr.addColorStop(0.75, c0 + '0.55)'); gr.addColorStop(1, c0 + '0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        var cell = w / (W + 3) * 1, ox = cell * 1.5, oy = h / (D + 3) * 1.5, ch = h / (D + 3);
        g.fillStyle = 'rgba(255,255,255,' + num(P.grid, 0.22) * 2.2 + ')';
        for (var z = 0; z <= D; z++) for (var x = 0; x <= W; x++) { g.beginPath(); g.arc(ox + x * cell, oy + z * ch, 0.9, 0, 7); g.fill(); }
      });
      shallow.material.needsUpdate = true;
      rebuildAll();
    }

    // ---------- per-column geometry
    function lampCol() { return rgb(pal.lit ? '#ffd27a' : '#ffefc0'); }
    function colRng(x, z, k) { return mulberry(hash(seed, x, z, k || 0)); }
    // A building = cells joined at the same height: they share wall, roof, shutter and accent colours (anchor = its first cell).
    var groupOf = [];
    function computeGroups() {
      var g = new Array(W * D).fill(-1);
      for (var i = 0; i < W * D; i++) {
        if (g[i] >= 0) continue; var x0 = i % W, z0 = (i / W) | 0, h = town.H(x0, z0); g[i] = i; if (h < 2) continue;
        var st = [i];
        while (st.length) { var k = st.pop(), kx = k % W, kz = (k / W) | 0; for (var d = 0; d < 4; d++) { var nx = kx + DX[d], nz = kz + DZ[d], j = nz * W + nx; if (town.inGrid(nx, nz) && g[j] < 0 && town.H(nx, nz) === h) { g[j] = i; st.push(j); } } }
      }
      return g;
    }
    function colStyle(x, z) {
      var a = groupOf.length ? groupOf[z * W + x] : z * W + x, ra = colRng(a % W, (a / W) | 0, 1), r = colRng(x, z, 2);
      return { wall: rgb(pal.walls[(ra() * pal.walls.length) | 0]), roof: rgb(pal.roofs[(ra() * pal.roofs.length) | 0]), shutter: rgb(pal.shutters[(ra() * pal.shutters.length) | 0]),
        accent: rgb(pal.accent[(ra() * pal.accent.length) | 0]), win: (ra() * 3) | 0, shop: r() < 0.45, chimney: r() < 0.5, twin: ra() < 0.35, r: r };
    }
    // face helper: side d of the cell centred at (X, Z); u along the face (tangent), h height, o outward from the face plane
    function faceBox(g, X, Z, d, u0, u1, h0, h1, o0, o1, col, skip) {
      var nx = DX[d], nz = DZ[d], tx = -nz, tz = nx;
      var ax = X + nx * (0.5 + o0) + tx * u0, az = Z + nz * (0.5 + o0) + tz * u0;
      var bx = X + nx * (0.5 + o1) + tx * u1, bz = Z + nz * (0.5 + o1) + tz * u1;
      g.box(Math.min(ax, bx), h0, Math.min(az, bz), Math.max(ax, bx), h1, Math.max(az, bz), col, skip);
    }
    function facePt(X, Z, d, u, h, o) { var nx = DX[d], nz = DZ[d]; return [X + nx * (0.5 + o) + -nz * u, h, Z + nz * (0.5 + o) + nx * u]; }
    function faceArc(g, X, Z, d, uc, hc, r, o, col, seg) { // half disc on the face plane, flat side down
      seg = seg || 8; var c = facePt(X, Z, d, uc, hc, o);
      for (var i = 0; i < seg; i++) { var a0 = Math.PI * i / seg, a1 = Math.PI * (i + 1) / seg; g.tri(c, facePt(X, Z, d, uc + Math.cos(a0) * r, hc + Math.sin(a0) * r, o), facePt(X, Z, d, uc + Math.cos(a1) * r, hc + Math.sin(a1) * r, o), col); }
    }
    function faceDisc(g, X, Z, d, uc, hc, r, o, col, seg) { faceArc(g, X, Z, d, uc, hc, r, o, col, seg); faceArc(g, X, Z, (d + 2) % 4 === d ? d : d, uc, hc, -r, o, col, seg); }

    function windowAt(G, X, Z, d, uc, hc, w, h, st, style) {
      var trim = rgb(pal.trim), glass = shade(rgb(pal.glass), 1), g = G.solid, gl = G.glass;
      faceBox(g, X, Z, d, uc - w / 2 - 0.03, uc + w / 2 + 0.03, hc - h / 2 - 0.03, hc + h / 2 + 0.03, 0, 0.018, trim);
      if (style === 1) faceArc(g, X, Z, d, uc, hc + h / 2 + 0.0, w / 2 + 0.03, 0.019, trim, 8);
      faceBox(gl, X, Z, d, uc - w / 2, uc + w / 2, hc - h / 2, hc + h / 2, 0.019, 0.024, glass);
      if (style === 1) faceArc(gl, X, Z, d, uc, hc + h / 2, w / 2, 0.025, glass, 8);
      faceBox(g, X, Z, d, uc - 0.008, uc + 0.008, hc - h / 2, hc + h / 2 + (style === 1 ? w / 2 : 0), 0.024, 0.032, trim);
      faceBox(g, X, Z, d, uc - w / 2, uc + w / 2, hc + h * 0.08 - 0.008, hc + h * 0.08 + 0.008, 0.024, 0.032, trim);
      faceBox(g, X, Z, d, uc - w / 2 - 0.05, uc + w / 2 + 0.05, hc - h / 2 - 0.065, hc - h / 2 - 0.03, 0, 0.07, trim);
      if (style === 0) { // shutters with slats
        [-1, 1].forEach(function (sgn) {
          var a = uc + sgn * (w / 2 + 0.035), b = uc + sgn * (w / 2 + 0.035 + w * 0.46);
          faceBox(g, X, Z, d, Math.min(a, b), Math.max(a, b), hc - h / 2 - 0.01, hc + h / 2 + 0.01, 0, 0.022, st.shutter);
          for (var k = 0; k < 3; k++) { var hh = hc - h / 2 + h * (0.22 + k * 0.28); faceBox(g, X, Z, d, Math.min(a, b) + 0.012, Math.max(a, b) - 0.012, hh, hh + 0.012, 0.022, 0.028, shade(st.shutter, 0.78)); }
        });
      } else if (style === 2) { // flower box
        faceBox(g, X, Z, d, uc - w / 2 - 0.03, uc + w / 2 + 0.03, hc - h / 2 - 0.13, hc - h / 2 - 0.065, 0.0, 0.08, rgb(pal.wood));
        var r = mulberry(hash(seed, X * 100, Z * 100, d, hc * 100));
        for (var k = 0; k < 4; k++) { var p = facePt(X, Z, d, uc - w / 2 + (k + 0.5) * (w / 4), hc - h / 2 - 0.05, 0.045); g.blob(p[0], p[1], p[2], 0.035, 0.03, 0.035, k % 2 ? rgb(pal.leaf[0]) : rgb(pal.accent[(r() * pal.accent.length) | 0]), 5); }
      }
    }
    function doorAt(G, X, Z, d, y0, st) {
      var g = G.solid, trim = rgb(pal.trim), wood = shade(st.shutter, 0.85);
      faceBox(g, X, Z, d, -0.19, 0.19, y0, y0 + 0.43, 0, 0.018, trim); faceArc(g, X, Z, d, 0, y0 + 0.43, 0.19, 0.018, trim, 8);
      faceBox(g, X, Z, d, -0.14, 0.14, y0 + 0.02, y0 + 0.43, 0.018, 0.034, wood); faceArc(g, X, Z, d, 0, y0 + 0.43, 0.14, 0.034, wood, 8);
      faceBox(g, X, Z, d, -0.006, 0.006, y0 + 0.03, y0 + 0.55, 0.034, 0.038, shade(wood, 0.7));
      faceBox(g, X, Z, d, 0.07, 0.095, y0 + 0.24, y0 + 0.265, 0.034, 0.05, rgb('#e8c25a'));
      faceBox(g, X, Z, d, -0.25, 0.25, y0, y0 + 0.035, 0, 0.13, rgb(pal.plinth));   // step
      // lantern on a bracket
      faceBox(g, X, Z, d, 0.25, 0.27, y0 + 0.5, y0 + 0.52, 0, 0.07, rgb('#3a3a3a'));
      faceBox(g, X, Z, d, 0.255, 0.265, y0 + 0.4, y0 + 0.52, 0, 0.07, rgb('#3a3a3a'));                       // wall bracket
      faceBox(G.lamp, X, Z, d, 0.235, 0.285, y0 + 0.42, y0 + 0.5, 0.04, 0.09, lampCol());
      faceBox(g, X, Z, d, 0.23, 0.29, y0 + 0.405, y0 + 0.42, 0.035, 0.095, rgb('#3a3a3a'));
      faceBox(g, X, Z, d, 0.23, 0.29, y0 + 0.5, y0 + 0.52, 0.035, 0.095, rgb('#3a3a3a'));
    }
    function shopFront(G, X, Z, d, y0, st, cl) { // wide window with a striped awning on ground storeys
      var g = G.solid, a0 = cl && cl[0] ? 1 : 0, a1 = cl && cl[1] ? 5 : 6;
      faceBox(g, X, Z, d, -0.33, 0.33, y0 + 0.1, y0 + 0.42, 0, 0.02, rgb(pal.trim));
      faceBox(G.glass, X, Z, d, -0.29, 0.29, y0 + 0.13, y0 + 0.39, 0.02, 0.026, rgb(pal.glass));
      faceBox(g, X, Z, d, -0.006, 0.006, y0 + 0.13, y0 + 0.39, 0.026, 0.032, rgb(pal.trim));
      for (var i = a0; i < a1; i++) { // awning: six stripes, sloping out and down
        var u0 = -0.36 + i * 0.12, u1 = u0 + 0.12, col = i % 2 ? rgb(pal.trim) : st.accent;
        g.quad(facePt(X, Z, d, u0, y0 + 0.55, 0), facePt(X, Z, d, u1, y0 + 0.55, 0), facePt(X, Z, d, u1, y0 + 0.47, 0.17), facePt(X, Z, d, u0, y0 + 0.47, 0.17), col);
        g.quad(facePt(X, Z, d, u0, y0 + 0.47, 0.17), facePt(X, Z, d, u1, y0 + 0.47, 0.17), facePt(X, Z, d, u1, y0 + 0.43, 0.17), facePt(X, Z, d, u0, y0 + 0.43, 0.17), shade(col, 0.9));
      }
    }
    function balconyAt(G, X, Z, d, y0, st, cl) {
      var g = G.solid, trim = rgb(pal.trim), rail = shade(st.shutter, 0.8), uL = cl && cl[0] ? -0.2 : -0.34, uR = cl && cl[1] ? 0.2 : 0.34;
      faceBox(g, X, Z, d, -0.15, 0.15, y0 + 0.05, y0 + 0.55, 0, 0.018, trim);
      faceBox(G.glass, X, Z, d, -0.12, 0.12, y0 + 0.07, y0 + 0.52, 0.018, 0.024, rgb(pal.glass));
      faceBox(g, X, Z, d, -0.006, 0.006, y0 + 0.07, y0 + 0.52, 0.024, 0.03, trim);
      faceBox(g, X, Z, d, uL, uR, y0 + 0.0, y0 + 0.05, 0, 0.24, trim);              // slab
      faceBox(g, X, Z, d, uL, uR, y0 + 0.25, y0 + 0.275, 0.21, 0.24, rail);          // front rail
      faceBox(g, X, Z, d, uL, uL + 0.025, y0 + 0.25, y0 + 0.275, 0, 0.24, rail); faceBox(g, X, Z, d, uR - 0.025, uR, y0 + 0.25, y0 + 0.275, 0, 0.24, rail);
      var nb = Math.round((uR - uL) / 0.0825);
      for (var i = 0; i <= nb; i++) { var u = uL + 0.01 + i * (uR - uL - 0.02) / nb; faceBox(g, X, Z, d, u - 0.008, u + 0.008, y0 + 0.05, y0 + 0.25, 0.215, 0.23, rail); }
      var p = facePt(X, Z, d, uR - 0.1, y0 + 0.05, 0.1); g.cyl(p[0], p[1], p[2], 0.04, 0.05, 0.07, rgb('#c46a42'), 6); g.blob(p[0], p[1] + 0.11, p[2], 0.07, 0.06, 0.07, rgb(pal.leaf[1]), 6);
    }
    function stairs(G, X, Z, d, y0, rise, st) { // stone steps rising toward side d, against the wall: one clean profile
      var g = G.solid, stone = rgb(pal.plinth), n = 5, w0 = -0.2, w1 = 0.2, o0 = -0.62, dep = 0.124, side = shade(stone, 0.9);
      for (var i = 0; i < n; i++) {
        var oa = o0 + i * dep, ob = i === n - 1 ? 0 : oa + dep, h0 = y0 + rise * i / n, h1 = y0 + rise * (i + 1) / n;
        g.quad(facePt(X, Z, d, w0, h1, oa), facePt(X, Z, d, w1, h1, oa), facePt(X, Z, d, w1, h1, ob), facePt(X, Z, d, w0, h1, ob), i % 2 ? stone : shade(stone, 1.05)); // tread
        g.quad(facePt(X, Z, d, w0, h0, oa), facePt(X, Z, d, w1, h0, oa), facePt(X, Z, d, w1, h1, oa), facePt(X, Z, d, w0, h1, oa), shade(stone, 0.82));            // riser
        [w0, w1].forEach(function (u) { g.quad(facePt(X, Z, d, u, y0, oa), facePt(X, Z, d, u, y0, ob), facePt(X, Z, d, u, h1, ob), facePt(X, Z, d, u, h1, oa), side); }); // side wall under this tread
      }
      faceBox(g, X, Z, d, w1, w1 + 0.03, y0, y0 + rise + 0.18, -0.03, 0, rgb(pal.wood));                // newel at the top
      var a = facePt(X, Z, d, w1 + 0.015, y0 + 0.2, -0.6), b = facePt(X, Z, d, w1 + 0.015, y0 + rise + 0.17, -0.02);
      var dx = b[0] - a[0], dz = b[2] - a[2];
      for (var k = 0; k < 4; k++) { var t = (k + 0.5) / 4, px = a[0] + dx * t, pz = a[2] + dz * t, py = y0 + rise * t; g.box(px - 0.012, py, pz - 0.012, px + 0.012, py + 0.18, pz + 0.012, rgb(pal.wood)); }
      var side = 0.012; g.quad([a[0] - side, a[1], a[2] - side], [b[0] - side, b[1], b[2] - side], [b[0] + side, b[1] + 0.02, b[2] + side], [a[0] + side, a[1] + 0.02, a[2] + side], rgb(pal.wood));
    }
    function tree(g, x, y, z, r, s) {
      var leaf = rgb(pal.leaf[(r() * pal.leaf.length) | 0]), trunk = rgb(pal.trunk);
      g.cyl(x, y, z, 0.05 * s, 0.035 * s, 0.32 * s, trunk, 6);
      if (r() < 0.35) { // pine: stacked cones
        for (var i = 0; i < 3; i++) g.cyl(x, y + (0.22 + i * 0.17) * s, z, (0.27 - i * 0.07) * s, 0, 0.3 * s, shade(leaf, 0.9 + i * 0.06), 7);
      } else {
        g.blob(x, y + 0.48 * s, z, 0.24 * s, 0.22 * s, 0.24 * s, leaf, 7);
        g.blob(x + 0.1 * s, y + 0.62 * s, z - 0.05 * s, 0.16 * s, 0.15 * s, 0.16 * s, shade(leaf, 1.1), 6);
        g.blob(x - 0.1 * s, y + 0.4 * s, z + 0.08 * s, 0.15 * s, 0.13 * s, 0.15 * s, shade(leaf, 0.92), 6);
      }
    }
    function lamp(G, x, y, z) {
      var g = G.solid, iron = rgb('#3b3d42');
      g.box(x - 0.025, y, z - 0.025, x + 0.025, y + 0.04, z + 0.025, iron); g.box(x - 0.012, y, z - 0.012, x + 0.012, y + 0.42, z + 0.012, iron);
      G.lamp.box(x - 0.035, y + 0.42, z - 0.035, x + 0.035, y + 0.5, z + 0.035, lampCol());
      g.cyl(x, y + 0.5, z, 0.055, 0, 0.05, iron, 4);
    }
    function landTop(G, x, z, X, Z, t, H) {
      var g = G.solid, r = colRng(x, z, 3), gr = rgb(pal.grass[(r() * pal.grass.length) | 0]);
      g.quad([X - 0.5, 0, Z - 0.5], [X - 0.5, 0, Z + 0.5], [X + 0.5, 0, Z + 0.5], [X + 0.5, 0, Z - 0.5], gr);
      if (!t) return;
      if (t.id === 'path') {
        var pc = rgb(pal.path), pe = rgb(pal.pathEdge), wdt = 0.21;
        function rect(x0, z0, x1, z1, y, c) { g.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], c); }
        rect(X - wdt - 0.03, Z - wdt - 0.03, X + wdt + 0.03, Z + wdt + 0.03, 0.004, pe); rect(X - wdt, Z - wdt, X + wdt, Z + wdt, 0.007, pc);
        for (var d = 0; d < 4; d++) if (t.s[d] === 'p') {
          var ax = DX[d], az = DZ[d];
          if (ax) { var xa = ax > 0 ? X + wdt : X - 0.5, xb = ax > 0 ? X + 0.5 : X - wdt; rect(xa, Z - wdt - 0.03, xb, Z + wdt + 0.03, 0.004, pe); rect(xa, Z - wdt, xb, Z + wdt, 0.007, pc); }
          else { var za = az > 0 ? Z + wdt : Z - 0.5, zb = az > 0 ? Z + 0.5 : Z - wdt; rect(X - wdt - 0.03, za, X + wdt + 0.03, zb, 0.004, pe); rect(X - wdt, za, X + wdt, zb, 0.007, pc); }
        }
        for (var k = 0; k < 14; k++) { var cx = X + (r() - 0.5) * 0.36, cz = Z + (r() - 0.5) * 0.36; rect(cx - 0.025, cz - 0.02, cx + 0.025, cz + 0.02, 0.009, shade(pc, 0.9 + r() * 0.12)); }
        var ends = 0; for (d = 0; d < 4; d++) ends += t.s[d] === 'p';
        if (ends >= 2 && r() < 0.45) { var cnr = r() * 4 | 0, lx = X + (cnr & 1 ? 0.36 : -0.36), lz = Z + (cnr & 2 ? 0.36 : -0.36); lamp(G, lx, 0, lz); }
        else if (r() < 0.5) { var bx = X + (r() < 0.5 ? 0.37 : -0.37), bz = Z + (r() < 0.5 ? 0.37 : -0.37); g.blob(bx, 0.07, bz, 0.1, 0.09, 0.1, rgb(pal.leaf[(r() * 4) | 0]), 6); }
      } else if (t.id === 'land-stair') {
        var sd = t.s.indexOf('u'); stairs(G, X, Z, sd, 0, STOREY, colStyle(x, z));
        g.blob(X + DX[(sd + 1) % 4] * 0.32 - DX[sd] * 0.3, 0.08, Z + DZ[(sd + 1) % 4] * 0.32 - DZ[sd] * 0.3, 0.11, 0.1, 0.11, rgb(pal.leaf[0]), 6);
      } else if (t.id === 'grass') {
        var roll = r();
        if (roll < 0.42) { tree(g, X + (r() - 0.5) * 0.14, 0, Z + (r() - 0.5) * 0.14, r, 0.9 + r() * 0.35); if (r() < 0.5) g.blob(X + 0.3, 0.06, Z - 0.28, 0.09, 0.08, 0.09, rgb(pal.leaf[2]), 6); }
        else if (roll < 0.6) { for (var b = 0; b < 3; b++) g.blob(X + (r() - 0.5) * 0.6, 0.07, Z + (r() - 0.5) * 0.6, 0.11, 0.1, 0.11, rgb(pal.leaf[(r() * pal.leaf.length) | 0]), 6); }
        else if (roll < 0.78) { for (b = 0; b < 9; b++) { var fx = X + (r() - 0.5) * 0.8, fz = Z + (r() - 0.5) * 0.8; g.box(fx - 0.005, 0, fz - 0.005, fx + 0.005, 0.07, fz + 0.005, rgb(pal.leaf[1])); g.blob(fx, 0.08, fz, 0.03, 0.025, 0.03, rgb(pal.accent[(r() * pal.accent.length) | 0]), 5); } }
        else if (roll < 0.86) { // well
          g.cyl(X, 0, Z, 0.17, 0.17, 0.16, rgb(pal.rock), 8); g.cyl(X, 0.16, Z, 0.19, 0.19, 0.03, shade(rgb(pal.rock), 1.1), 8);
          g.box(X - 0.17, 0.16, Z - 0.015, X - 0.14, 0.5, Z + 0.015, rgb(pal.wood)); g.box(X + 0.14, 0.16, Z - 0.015, X + 0.17, 0.5, Z + 0.015, rgb(pal.wood));
          g.quad([X - 0.24, 0.46, Z - 0.16], [X, 0.6, Z - 0.16], [X, 0.6, Z + 0.16], [X - 0.24, 0.46, Z + 0.16], rgb(pal.roofs[0]));
          g.quad([X + 0.24, 0.46, Z - 0.16], [X, 0.6, Z - 0.16], [X, 0.6, Z + 0.16], [X + 0.24, 0.46, Z + 0.16], shade(rgb(pal.roofs[0]), 0.9));
        } else { for (b = 0; b < 6; b++) { var tx = X + (r() - 0.5) * 0.8, tz = Z + (r() - 0.5) * 0.8; g.tri([tx - 0.03, 0, tz], [tx + 0.03, 0, tz], [tx + (r() - 0.5) * 0.03, 0.09, tz], shade(gr, 0.85)); } }
      } else if (t.ext) {
        extBuild(G, x, z, X, Z, t, 0, H);
      }
    }
    function slab(G, x, z, X, Z, H) { // island block under every land / building cell
      var g = G.solid, r = colRng(x, z, 4), earth = rgb(pal.earth), lip = rgb(pal.lip);
      for (var d = 0; d < 4; d++) {
        var nh = town.H(x + DX[d], z + DZ[d]); if (nh >= 1) continue;
        var bot = -SLAB, top = 0;
        faceBox(g, X, Z, d, -0.5, 0.5, -0.07, top, -0.001, 0, H >= 2 ? rgb(pal.plinth) : lip, 0);
        faceBox(g, X, Z, d, -0.5, 0.5, bot, -0.07, -0.001, 0, shade(earth, 0.95 + r() * 0.1), 0);
        for (var k = 0; k < 2; k++) if (r() < 0.55) { var p = facePt(X, Z, d, (r() - 0.5) * 0.8, WATER_Y + 0.02, 0.04); g.blob(p[0], p[1], p[2], 0.07 + r() * 0.05, 0.05 + r() * 0.04, 0.07 + r() * 0.05, shade(rgb(pal.rock), 0.9 + r() * 0.2), 5); }
        // foam strip on the water along this side
        var f = G.foam, fo = rgb(pal.foam), a = facePt(X, Z, d, -0.5, WATER_Y + 0.012, 0), b = facePt(X, Z, d, 0.5, WATER_Y + 0.012, 0), c = facePt(X, Z, d, 0.5, WATER_Y + 0.012, 0.09), e = facePt(X, Z, d, -0.5, WATER_Y + 0.012, 0.09);
        f.quad(a, b, c, e, fo);
      }
      if (H >= 2) { var pv = rgb(pal.plinth); g.quad([X - 0.5, 0, Z - 0.5], [X - 0.5, 0, Z + 0.5], [X + 0.5, 0, Z + 0.5], [X + 0.5, 0, Z - 0.5], pv); } // paving under the house: no sea shows through any ground seam
    }
    function storey(G, x, z, X, Z, y, t, H, st) {
      var g = G.solid, y0 = y * STOREY, y1 = y0 + STOREY, wall = shade(st.wall, 1 - y * 0.012), trim = rgb(pal.trim), ground = y === 0;
      if (t.id === 'arch') return archStorey(G, x, z, X, Z, t, st);
      var ext = []; for (var d = 0; d < 4; d++) ext.push(t.s[d] !== 'b');
      for (d = 0; d < 4; d++) {
        if (!ext[d]) continue;
        var s = t.s[d], nh = town.H(x + DX[d], z + DZ[d]);
        faceBox(g, X, Z, d, -0.5, 0.5, y0, y1, -0.001, 0, wall, 0);
        var eL = ext[(d + 3) % 4] ? 0.035 : 0, eR = ext[(d + 1) % 4] ? 0.035 : 0;  // corner overlap where the next side is outside too
        faceBox(g, X, Z, d, -0.5 - eL, 0.5 + eR, y1 - 0.055, y1, 0, 0.035, trim);    // cornice
        if (ext[(d + 1) % 4]) faceBox(g, X, Z, d, 0.43, 0.5, y0, y1 - 0.055, 0, 0.012, shade(wall, 0.93)); // corner pilaster
        if (ext[(d + 3) % 4]) faceBox(g, X, Z, d, -0.5, -0.43, y0, y1 - 0.055, 0, 0.012, shade(wall, 0.93));
        if (ground && s !== 'D') faceBox(g, X, Z, d, -0.5 - eL * 0.6, 0.5 + eR * 0.6, y0, y0 + 0.07, 0, 0.022, rgb(pal.plinth));
        if (ground && s === 'D') { faceBox(g, X, Z, d, -0.5 - eL * 0.6, -0.25, y0, y0 + 0.07, 0, 0.022, rgb(pal.plinth)); faceBox(g, X, Z, d, 0.25, 0.5 + eR * 0.6, y0, y0 + 0.07, 0, 0.022, rgb(pal.plinth)); }
        var hc = y0 + 0.37, besideRoof = nh === y + 1 && !(function () { var nt = town.tile(x + DX[d], y, z + DZ[d]); return nt && (nt.id === 'roof-flat' || nt.id === 'roof-stair'); })();
        var cl = [town.H(x + DX[d] + DX[(d + 3) % 4], z + DZ[d] + DZ[(d + 3) % 4]) >= y + 2, town.H(x + DX[d] + DX[(d + 1) % 4], z + DZ[d] + DZ[(d + 1) % 4]) >= y + 2]; // concave corners in front
        if (s === 'D') doorAt(G, X, Z, d, y0, st);
        else if (s === 'K') balconyAt(G, X, Z, d, y0, st, cl);
        else if (s === 'S') { faceDisc(g, X, Z, d, 0, y0 + 0.42, 0.06, 0.01, shade(wall, 0.85), 8); }
        else if (s === 'W') {
          if (besideRoof) { faceDisc(G.glass, X, Z, d, 0, y0 + 0.5, 0.06, 0.012, rgb(pal.glass), 8); }
          else if (ground && st.shop) shopFront(G, X, Z, d, y0, st, cl);
          else if (st.twin) { windowAt(G, X, Z, d, -0.19, hc, 0.15, 0.28, st, st.win); windowAt(G, X, Z, d, 0.19, hc, 0.15, 0.28, st, st.win === 0 ? 1 : st.win); }
          else windowAt(G, X, Z, d, 0, hc, 0.22, 0.3, st, st.win);
        } else if (t.ext) { /* registered storey sockets: builder draws below */ }
      }
      if (t.ext) extBuild(G, x, z, X, Z, t, y, H);
    }
    function archStorey(G, x, z, X, Z, t, st) {
      var g = G.solid, wall = st.wall, trim = rgb(pal.trim), axisX = t.s[0] === 'A', R = 0.25, HS = 0.34, y1 = STOREY;
      var ad = axisX ? [0, 2] : [1, 3];
      ad.forEach(function (d) { // facade with an arched opening, 0.08 thick
        faceBox(g, X, Z, d, -0.5, -R, 0, y1, -0.08, 0, wall); faceBox(g, X, Z, d, R, 0.5, 0, y1, -0.08, 0, wall);
        var seg = 9;
        for (var i = 0; i < seg; i++) { // spandrel above the arch: fan from the arch curve up to the storey top
          var a0 = Math.PI * i / seg, a1 = Math.PI * (i + 1) / seg;
          var p0 = [Math.cos(a0) * R, HS + Math.sin(a0) * R], p1 = [Math.cos(a1) * R, HS + Math.sin(a1) * R];
          [0, -0.08].forEach(function (o) { g.quad(facePt(X, Z, d, p0[0], p0[1], o), facePt(X, Z, d, p0[0], y1, o), facePt(X, Z, d, p1[0], y1, o), facePt(X, Z, d, p1[0], p1[1], o), wall); });
          g.quad(facePt(X, Z, d, p0[0], p0[1], 0), facePt(X, Z, d, p1[0], p1[1], 0), facePt(X, Z, d, p1[0], p1[1], -0.08), facePt(X, Z, d, p0[0], p0[1], -0.08), shade(wall, 0.85));
          var q0 = [Math.cos(a0) * (R + 0.06), HS + Math.sin(a0) * (R + 0.06)], q1 = [Math.cos(a1) * (R + 0.06), HS + Math.sin(a1) * (R + 0.06)]; // bevelled stone voussoirs
          var vc = i % 2 ? rgb(pal.plinth) : shade(rgb(pal.plinth), 1.08), cx = (p0[0] + p1[0] + q0[0] + q1[0]) / 4, cy = (p0[1] + p1[1] + q0[1] + q1[1]) / 4;
          var bev = function (p) { return [p[0] + (cx - p[0]) * 0.22, p[1] + (cy - p[1]) * 0.22]; }, B0 = [p0, q0, q1, p1], F0 = B0.map(bev);
          g.quad(facePt(X, Z, d, F0[0][0], F0[0][1], 0.03), facePt(X, Z, d, F0[1][0], F0[1][1], 0.03), facePt(X, Z, d, F0[2][0], F0[2][1], 0.03), facePt(X, Z, d, F0[3][0], F0[3][1], 0.03), vc);
          for (var e = 0; e < 4; e++) { var e2 = (e + 1) % 4; g.quad(facePt(X, Z, d, B0[e][0], B0[e][1], 0.002), facePt(X, Z, d, B0[e2][0], B0[e2][1], 0.002), facePt(X, Z, d, F0[e2][0], F0[e2][1], 0.03), facePt(X, Z, d, F0[e][0], F0[e][1], 0.03), shade(vc, 0.8)); }
        }
        faceBox(g, X, Z, d, -0.04, 0.04, HS + R + 0.02, y1 - 0.075, 0, 0.045, shade(rgb(pal.plinth), 1.12));   // keystone, clear of the cornice
        faceBox(g, X, Z, d, -0.535, -0.1, y1 - 0.055, y1, 0, 0.035, trim); faceBox(g, X, Z, d, 0.1, 0.535, y1 - 0.055, y1, 0, 0.035, trim); // cornice stops at the arch
        faceBox(g, X, Z, d, -0.5, -R, 0, 0.07, 0, 0.022, rgb(pal.plinth)); faceBox(g, X, Z, d, R, 0.5, 0, 0.07, 0, 0.022, rgb(pal.plinth));
        faceBox(g, X, Z, d, -R - 0.03, -R, 0, HS, 0, 0.015, rgb(pal.plinth)); faceBox(g, X, Z, d, R, R + 0.03, 0, HS, 0, 0.015, rgb(pal.plinth));
      });
      // passage: side walls, barrel vault, cobbles, a hanging lantern
      var dA = ad[0], L = 0.42, inner = shade(wall, 0.62);
      function P2(u, h, a) { return facePt(X, Z, dA, u, h, a - 0.5); } // u across, a along the passage axis (-0.5..0.5 from the centre)
      var segA = [-L, -0.2, 0.2, L], dark = [0.85, 0.55, 0.85];               // the vault darkens toward its middle; both ends stay lit
      for (var k = 0; k < 3; k++) {
        var aa = segA[k], ab = segA[k + 1], f = dark[k];
        g.quad(P2(-R, 0, aa), P2(-R, HS, aa), P2(-R, HS, ab), P2(-R, 0, ab), shade(inner, f)); g.quad(P2(R, 0, aa), P2(R, HS, aa), P2(R, HS, ab), P2(R, 0, ab), shade(inner, f));
        for (var i = 0; i < 9; i++) { var a0 = Math.PI * i / 9, a1 = Math.PI * (i + 1) / 9; g.quad(P2(Math.cos(a0) * R, HS + Math.sin(a0) * R, aa), P2(Math.cos(a1) * R, HS + Math.sin(a1) * R, aa), P2(Math.cos(a1) * R, HS + Math.sin(a1) * R, ab), P2(Math.cos(a0) * R, HS + Math.sin(a0) * R, ab), shade(inner, f * (0.92 + (i % 2) * 0.06))); }
      }
      var pc = rgb(pal.path), pe = rgb(pal.pathEdge);
      g.quad(P2(-R, 0.006, -0.5), P2(R, 0.006, -0.5), P2(R, 0.006, 0.5), P2(-R, 0.006, 0.5), shade(pe, 0.9));
      for (var c = 0; c < 6; c++) { var ca = -0.5 + c / 6, cb = ca + 1 / 6, fl = Math.abs(ca + 1 / 12) < 0.25 ? 0.62 : 0.85; // cobble rows, darker under the vault
        for (var q = 0; q < 3; q++) { var ua = -R + 0.02 + q * (2 * R - 0.04) / 3 + (c % 2) * 0.03, ub = ua + (2 * R - 0.04) / 3 - 0.02; if (ub > R - 0.01) ub = R - 0.01; g.quad(P2(ua, 0.009, ca + 0.01), P2(ub, 0.009, ca + 0.01), P2(ub, 0.009, cb - 0.01), P2(ua, 0.009, cb - 0.01), shade(pc, fl * (0.95 + ((c + q) % 2) * 0.06))); } }
      var lp = P2(0, HS + R - 0.05, 0); g.box(lp[0] - 0.006, lp[1] - 0.1, lp[2] - 0.006, lp[0] + 0.006, lp[1], lp[2] + 0.006, rgb('#3a3a3a'));
      G.lamp.box(lp[0] - 0.03, lp[1] - 0.18, lp[2] - 0.03, lp[0] + 0.03, lp[1] - 0.1, lp[2] + 0.03, lampCol());
    }
    function roofPiece(G, x, z, X, Z, y, t, H, st) {
      var g = G.solid, B = y * STOREY, roof = st.roof, wall = st.wall, trim = rgb(pal.trim);
      var kind = []; // per side: 'air' | 'same' | 'tall'
      for (var d = 0; d < 4; d++) { var nh = town.H(x + DX[d], z + DZ[d]); kind.push(nh === H ? 'same' : nh > H ? 'tall' : 'air'); }
      var ov = kind.map(function (k) { return k === 'air' ? 0.09 : 0; });
      if (t.id === 'roof-flat' || t.id === 'roof-stair') {
        var tc = rgb(pal.terrace);
        g.quad([X - 0.5, B + 0.012, Z - 0.5], [X - 0.5, B + 0.012, Z + 0.5], [X + 0.5, B + 0.012, Z + 0.5], [X + 0.5, B + 0.012, Z - 0.5], tc);
        for (var i = 1; i < 4; i++) { var o = -0.5 + i * 0.25; g.box(X + o - 0.004, B + 0.012, Z - 0.5, X + o + 0.004, B + 0.016, Z + 0.5, shade(tc, 0.9)); g.box(X - 0.5, B + 0.012, Z + o - 0.004, X + 0.5, B + 0.016, Z + o + 0.004, shade(tc, 0.9)); }
        var sd = t.id === 'roof-stair' ? t.s.indexOf('u') : -1;
        for (d = 0; d < 4; d++) {
          if (kind[d] === 'tall' || d === sd) continue;
          var nt = kind[d] === 'same' ? town.tile(x + DX[d], y, z + DZ[d]) : null;
          if (nt && (nt.id === 'roof-flat' || nt.id === 'roof-stair')) continue;   // terrace continues
          var gap = kind[d] === 'air' && incomingStair(x, z, d, H);
          var eL = 0, eR = 0;
          if (gap) { faceBox(g, X, Z, d, -0.5, -0.22, B, B + 0.15, -0.07, 0, wall); faceBox(g, X, Z, d, 0.22, 0.5, B, B + 0.15, -0.07, 0, wall); faceBox(g, X, Z, d, -0.51, -0.22, B + 0.15, B + 0.18, -0.08, 0.01, trim); faceBox(g, X, Z, d, 0.22, 0.51, B + 0.15, B + 0.18, -0.08, 0.01, trim); }
          else { faceBox(g, X, Z, d, -0.5, 0.5, B, B + 0.15, -0.07, 0, wall); faceBox(g, X, Z, d, -0.51 - eL, 0.51 + eR, B + 0.15, B + 0.18, -0.08, 0.01, trim); }
        }
        if (sd >= 0) stairs(G, X, Z, sd, B + 0.012, STOREY - 0.012, st);
        terraceDecor(G, x, z, X, Z, B + 0.012, sd, st);
        if (t.ext) extBuild(G, x, z, X, Z, t, y, H);
        return;
      }
      if (t.id === 'roof-turret') {
        g.cyl(X, B, Z, 0.53, 0.53, 0.06, trim, 12);
        g.cyl(X, B + 0.06, Z, 0.62, 0, 1.0, roof, 12);
        g.cyl(X, B + 0.06, Z, 0.625, 0.36, 0.38, shade(roof, 0.93), 12, false);
        g.box(X - 0.01, B + 1.0, Z - 0.01, X + 0.01, B + 1.3, Z + 0.01, rgb('#4a4a4a'));
        g.blob(X, B + 1.06, Z, 0.035, 0.035, 0.035, rgb('#e8c25a'), 6);
        g.tri([X + 0.01, B + 1.29, Z], [X + 0.01, B + 1.17, Z], [X + 0.24, B + 1.24, Z + 0.02], st.accent);
        return;
      }
      if (t.id === 'roof-hip') {
        var RH = 0.46, x0 = X - 0.5 - ov[2], x1 = X + 0.5 + ov[0], z0 = Z - 0.5 - ov[3], z1 = Z + 0.5 + ov[1], ap = [X, B + RH, Z];
        function ey(d) { return B - ov[d] * 0.9; }
        var c00 = [x0, Math.min(ey(2), ey(3)), z0], c10 = [x1, Math.min(ey(0), ey(3)), z0], c11 = [x1, Math.min(ey(0), ey(1)), z1], c01 = [x0, Math.min(ey(2), ey(1)), z1];
        g.tri(c10, ap, c11, roof); g.tri(c11, ap, c01, shade(roof, 0.94)); g.tri(c01, ap, c00, shade(roof, 1.05)); g.tri(c00, ap, c10, shade(roof, 0.97));
        hipBands(g, [c10, c11, c01, c00], ap, roof);
        g.blob(X, B + RH + 0.02, Z, 0.04, 0.04, 0.04, shade(roof, 0.7), 5);
        if (st.chimney) chimney(g, X + 0.18, Z - 0.12, B + 0.12, B + RH + 0.12, st);
        return;
      }
      if (t.id === 'roof-gable') {
        var axisX = t.s[1] === 'e'; // eaves on S / N: ridge along X
        var aP = axisX ? 0 : 1, aN = axisX ? 2 : 3, cP = axisX ? 1 : 0, cN = axisX ? 3 : 2;
        var RH2 = 0.44;
        function endExt(d) { return t.s[d] === 'r' ? 0.5 : kind[d] === 'air' ? 0.5 + 0.07 : 0.5 - 0.012; }
        var eP = endExt(aP), eN = endExt(aN), wP = 0.5 + ov[cP], wN = 0.5 + ov[cN];
        // local frame: a along the ridge (+ toward side aP), c across (+ toward side cP)
        var A = [DX[aP], DZ[aP]], C = [DX[cP], DZ[cP]];
        function L(a, c, h) { return [X + A[0] * a + C[0] * c, B + h, Z + A[1] * a + C[1] * c]; }
        function hAt(c) { return RH2 * (1 - Math.abs(c) / 0.5); }
        var bands = 4;
        [[wP, 1], [wN, -1]].forEach(function (side) {
          var w = side[0], sg = side[1];
          for (var b = 0; b < bands; b++) {
            var c0 = sg * w * b / bands, c1 = sg * w * (b + 1) / bands, col = shade(roof, (sg > 0 ? 1 : 0.92) * (b % 2 ? 0.95 : 1.02));
            g.quad(L(-eN, c0, hAt(c0)), L(eP, c0, hAt(c0)), L(eP, c1, hAt(c1)), L(-eN, c1, hAt(c1)), col);
          }
          var ce = sg * w; // fascia under the eave
          g.quad(L(-eN, ce, hAt(ce)), L(eP, ce, hAt(ce)), L(eP, ce, hAt(ce) - 0.045), L(-eN, ce, hAt(ce) - 0.045), shade(roof, 0.7));
        });
        var rc = shade(roof, 0.72); // ridge cap
        g.quad(L(-eN, -0.04, RH2 - 0.02), L(eP, -0.04, RH2 - 0.02), L(eP, 0, RH2 + 0.03), L(-eN, 0, RH2 + 0.03), rc);
        g.quad(L(-eN, 0.04, RH2 - 0.02), L(eP, 0.04, RH2 - 0.02), L(eP, 0, RH2 + 0.03), L(-eN, 0, RH2 + 0.03), shade(rc, 0.9));
        [[aP, eP, 1], [aN, eN, -1]].forEach(function (en) {
          var d = en[0], sgn = en[2], ex = sgn * Math.min(en[1], 0.5 - 0.004);
          if (t.s[d] !== 'n') return;
          g.tri(L(ex, -0.5, 0), L(ex, 0.5, 0), L(ex, 0, RH2), wall);                        // gable wall
          var e2 = sgn * en[1];
          g.quad(L(e2, -wN, hAt(-wN)), L(e2, 0, RH2), L(e2, 0, RH2 + 0.05), L(e2, -wN, hAt(-wN) + 0.05), trim); // barge boards
          g.quad(L(e2, wP, hAt(wP)), L(e2, 0, RH2), L(e2, 0, RH2 + 0.05), L(e2, wP, hAt(wP) + 0.05), trim);
          if (kind[d] === 'air') { var p = L(ex + sgn * 0.004, 0, 0.17); faceDisc(G.glass, p[0] - DX[d] * 0.5, p[2] - DZ[d] * 0.5, d, 0, p[1], 0.055, 0.0, rgb(pal.glass), 8); faceDisc(g, p[0] - DX[d] * 0.5, p[2] - DZ[d] * 0.5, d, 0, p[1], 0.075, -0.003, trim, 8); }
        });
        if (st.chimney && H >= 3) { var cpt = L(0.22 * (eP > 0.45 ? 1 : -1), 0.18, 0); chimney(g, cpt[0], cpt[2], B + 0.1, B + RH2 + 0.16, st); }
        return;
      }
      if (t.ext) extBuild(G, x, z, X, Z, t, y, H);
    }
    function hipBands(g, cs, ap, roof) { // a darker course line half way up each slope
      for (var i = 0; i < 4; i++) {
        var a = cs[i], b = cs[(i + 1) % 4], t = 0.5;
        var p = [a[0] + (ap[0] - a[0]) * t, a[1] + (ap[1] - a[1]) * t, a[2] + (ap[2] - a[2]) * t], q = [b[0] + (ap[0] - b[0]) * t, b[1] + (ap[1] - b[1]) * t, b[2] + (ap[2] - b[2]) * t];
        var p2 = [p[0], p[1] + 0.012, p[2]], q2 = [q[0], q[1] + 0.012, q[2]];
        g.quad(p, q, q2, p2, shade(roof, 0.75));
      }
    }
    function chimney(g, cx, cz, y0, y1, st) {
      var c = shade(st.wall, 0.86); g.box(cx - 0.06, y0, cz - 0.06, cx + 0.06, y1, cz + 0.06, c);
      g.box(cx - 0.075, y1, cz - 0.075, cx + 0.075, y1 + 0.035, cz + 0.075, rgb(pal.trim));
      g.box(cx - 0.04, y1 + 0.035, cz - 0.04, cx + 0.04, y1 + 0.05, cz + 0.04, rgb('#3a3a3a'));
    }
    function incomingStair(x, z, d, H) { // a lower neighbour on side d climbs to this roof: leave a gap in the parapet
      var nx = x + DX[d], nz = z + DZ[d], nh = town.H(nx, nz); if (nh !== H - 1 && !(H === 2 && nh === 1)) return false;
      var t = town.tile(nx, nh <= 1 ? 0 : nh - 1, nz); return !!(t && t.s[(d + 2) % 4] === 'u');
    }
    function terraceDecor(G, x, z, X, Z, y, sd, st) {
      var g = G.solid, r = colRng(x, z, 6), roll = r();
      var free = [0, 1, 2, 3].filter(function (q) { var cx = q & 1 ? 1 : -1, cz = q & 2 ? 1 : -1; if (sd < 0) return true; return !(DX[sd] * cx > 0 || DZ[sd] * cz > 0) || (DX[sd] === 0 && cx * ((sd === 1) ? 1 : -1) < 0) ; });
      function spot() { var q = free.length ? free[(r() * free.length) | 0] : 0; return [X + (q & 1 ? 0.25 : -0.25), Z + (q & 2 ? 0.25 : -0.25)]; }
      if (sd >= 0) { var p = [X - DX[sd] * 0.28 + DX[(sd + 1) % 4] * 0.28, Z - DZ[sd] * 0.28 + DZ[(sd + 1) % 4] * 0.28]; g.cyl(p[0], y, p[1], 0.06, 0.07, 0.1, rgb('#c46a42'), 6); g.blob(p[0], y + 0.16, p[1], 0.1, 0.09, 0.1, rgb(pal.leaf[0]), 6); return; }
      if (roll < 0.35) { // parasol table
        var s = spot(); g.cyl(s[0], y, s[1], 0.012, 0.012, 0.36, rgb('#eeeeee'), 4); g.cyl(s[0], y + 0.3, s[1], 0.24, 0, 0.1, st.accent, 8, false);
        g.cyl(s[0], y, s[1], 0.08, 0.08, 0.14, rgb(pal.wood), 8);
      } else if (roll < 0.65) { // laundry line
        var a = [X - 0.32, Z - 0.1], b = [X + 0.32, Z + 0.1];
        g.box(a[0] - 0.012, y, a[1] - 0.012, a[0] + 0.012, y + 0.36, a[1] + 0.012, rgb(pal.wood)); g.box(b[0] - 0.012, y, b[1] - 0.012, b[0] + 0.012, y + 0.36, b[1] + 0.012, rgb(pal.wood));
        g.quad([a[0], y + 0.345, a[1]], [b[0], y + 0.345, b[1]], [b[0], y + 0.35, b[1]], [a[0], y + 0.35, a[1]], rgb('#f0f0f0'));
        for (var k = 0; k < 3; k++) { var t0 = 0.18 + k * 0.25, px = a[0] + (b[0] - a[0]) * t0, pz = a[1] + (b[1] - a[1]) * t0, ux = (b[0] - a[0]) * 0.09, uz = (b[1] - a[1]) * 0.09;
          g.quad([px, y + 0.345, pz], [px + ux, y + 0.345, pz + uz], [px + ux, y + 0.2, pz + uz], [px, y + 0.2, pz], k === 1 ? rgb('#ffffff') : rgb(pal.accent[(k + 1) % pal.accent.length])); }
      } else { // planters
        for (k = 0; k < 2; k++) { var sp = spot(); g.box(sp[0] - 0.09, y, sp[1] - 0.09, sp[0] + 0.09, y + 0.1, sp[1] + 0.09, rgb(pal.wood)); g.blob(sp[0], y + 0.15, sp[1], 0.12, 0.09, 0.12, rgb(pal.leaf[(r() * pal.leaf.length) | 0]), 6); }
      }
    }
    // Registered tiles draw through a small API in cell-local coordinates (origin = cell centre at the slot's floor).
    function extBuild(G, x, z, X, Z, t, y, H) {
      var def = null; for (var i = 0; i < RULES.tiles.length; i++) if (RULES.tiles[i].id === t.id) def = RULES.tiles[i];
      if (!def || typeof def.build !== 'function') { G.solid.box(X - 0.3, y * STOREY, Z - 0.3, X + 0.3, y * STOREY + 0.3, Z + 0.3, rgb('#d0a0ff')); return; }
      var y0 = y * STOREY, r = colRng(x, z, 9 + y);
      function col(c) { if (Array.isArray(c)) return c; if (typeof c === 'string' && c[0] === '#') return rgb(c); var v = pal[c]; if (Array.isArray(v)) v = v[0]; return v ? rgb(v) : rgb('#cccccc'); }
      var api = {
        box: function (x0, y0b, z0, x1, y1, z1, c) { G.solid.box(X + x0, y0 + y0b, Z + z0, X + x1, y0 + y1, Z + z1, col(c)); },
        glass: function (x0, y0b, z0, x1, y1, z1, c) { G.glass.box(X + x0, y0 + y0b, Z + z0, X + x1, y0 + y1, Z + z1, col(c || 'glass')); },
        blob: function (bx, by, bz, rad, c) { G.solid.blob(X + bx, y0 + by, Z + bz, rad, rad * 0.9, rad, col(c), 6); },
        cyl: function (bx, by, bz, r0, r1, h, c) { G.solid.cyl(X + bx, y0 + by, Z + bz, r0, r1, h, col(c), 8); },
        tri: function (a, b, c2, c) { G.solid.tri([X + a[0], y0 + a[1], Z + a[2]], [X + b[0], y0 + b[1], Z + b[2]], [X + c2[0], y0 + c2[1], Z + c2[2]], col(c)); },
        faceBox: function (d, u0, u1, h0, h1, o0, o1, c) { faceBox(G.solid, X, Z, d, u0, u1, y0 + h0, y0 + h1, o0, o1, col(c)); },
        color: col, rng: r, STOREY: STOREY
      };
      var nbH = [], nbId = [];
      for (var d = 0; d < 4; d++) { var nh = town.H(x + DX[d], z + DZ[d]), nt = town.tile(x + DX[d], y, z + DZ[d]); nbH.push(nh); nbId.push(nt ? nt.id : null); }
      try { def.build(api, { x: x, z: z, y: y, H: H, sides: t.s, rot: t.rot || 0, palette: pal, wall: colStyle(x, z).wall, dirs: [[1, 0], [0, 1], [-1, 0], [0, -1]], nbH: nbH, nbId: nbId }); }
      catch (e) { warn('tile ' + t.id + ' build threw: ' + e.message); }
    }
    function buildColumn(x, z) {
      var old = cols[x + ',' + z]; if (old) { scene.remove(old.group); old.group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }
      var H = town.H(x, z), X = wx(x), Z = wz(z);
      var G = { solid: new Geo(), glass: new Geo(), foam: new Geo(), lamp: new Geo() }, st = colStyle(x, z);
      if (H >= 1) {
        slab(G, x, z, X, Z, H);
        if (H === 1) landTop(G, x, z, X, Z, town.tile(x, 0, z), H);
        else {
          for (var y = 0; y < H - 1; y++) storey(G, x, z, X, Z, y, town.tile(x, y, z), H, st);
          roofPiece(G, x, z, X, Z, H - 1, town.tile(x, H - 1, z), H, st);
        }
      }
      var group = new THREE.Group(); group.position.set(X, 0, Z);
      ['solid', 'glass', 'foam', 'lamp'].forEach(function (k) {
        var g = G[k]; if (!g.p.length) return;
        var pos = new Float32Array(g.p.length); for (var i = 0; i < g.p.length; i += 3) { pos[i] = g.p[i] - X; pos[i + 1] = g.p[i + 1]; pos[i + 2] = g.p[i + 2] - Z; }
        var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.c), 3));
        geo.computeVertexNormals(); geo.computeBoundingSphere();
        var m = new THREE.Mesh(geo, mats[k]); m.castShadow = k === 'solid' || k === 'glass'; m.receiveShadow = k === 'solid' || k === 'glass'; m.userData.cell = { x: x, z: z };
        group.add(m);
      });
      scene.add(group);
      cols[x + ',' + z] = { group: group, pop: old ? old.pop : 0, popAmp: old ? old.popAmp : 0 };
    }
    function rebuildAll() { if (!has3D) return; groupOf = computeGroups(); for (var z = 0; z < D; z++) for (var x = 0; x < W; x++) buildColumn(x, z); }
    function rebuildAround(changed, focus) {
      if (!has3D) return;
      var set = {};
      (changed || []).forEach(function (c) { for (var d = -1; d < 4; d++) { var x = c.x + (d < 0 ? 0 : DX[d]), z = c.z + (d < 0 ? 0 : DZ[d]); if (town.inGrid(x, z)) set[x + ',' + z] = 1; } });
      if (focus) set[focus.x + ',' + focus.z] = 1;
      var ng = computeGroups(); for (var i = 0; i < W * D; i++) if (ng[i] !== groupOf[i]) set[(i % W) + ',' + ((i / W) | 0)] = 1; groupOf = ng; // recoloured buildings
      Object.keys(set).forEach(function (k) { var a = k.split(','); buildColumn(+a[0], +a[1]); });
      if (P.pop !== 'off') (changed || []).forEach(function (c) { var o = cols[c.x + ',' + c.z]; if (o) { o.pop = 1; o.popAmp = focus && focus.x === c.x && focus.z === c.z ? 1 : 0.35; } });
    }

    // ---------- gulls (flying creatures: facing rule applies, feet rule does not)
    function makeGull(i) {
      var root2 = new THREE.Group(), model = new THREE.Group(); root2.add(model);
      var white = new THREE.MeshStandardMaterial({ color: 0xf7f7f2, flatShading: true, roughness: 0.8 }), grey = new THREE.MeshStandardMaterial({ color: 0xb4bcc6, flatShading: true, roughness: 0.8, side: THREE.DoubleSide }), dark = new THREE.MeshStandardMaterial({ color: 0x2f3338, flatShading: true, side: THREE.DoubleSide }), beakM = new THREE.MeshStandardMaterial({ color: 0xf2a33a, flatShading: true });
      var body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), white); body.scale.set(0.34, 0.12, 0.12); model.add(body); // long axis on +X: the beak side
      var head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 1), white); head.position.set(0.17, 0.04, 0); model.add(head);
      [-1, 1].forEach(function (sd) { var eye = new THREE.Mesh(new THREE.IcosahedronGeometry(0.012, 0), dark); eye.position.set(0.205, 0.055, sd * 0.045); model.add(eye); });
      var beak = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.08, 5), beakM); beak.rotation.z = -Math.PI / 2; beak.position.set(0.25, 0.03, 0); model.add(beak);
      var tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), grey); tail.rotation.z = Math.PI / 2; tail.position.set(-0.2, 0.01, 0); tail.scale.set(1, 1, 0.4); model.add(tail);
      var wings = [];
      [-1, 1].forEach(function (s) {
        var pivot = new THREE.Group(); pivot.position.set(0.02, 0.03, s * 0.04); model.add(pivot);
        function poly(pts, mat) { var g = new THREE.BufferGeometry(), a = []; for (var k = 1; k < pts.length - 1; k++) a.push.apply(a, pts[0].concat(pts[k], pts[k + 1])); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); g.computeVertexNormals(); return new THREE.Mesh(g, mat); }
        var inner = poly([[0.06, 0, 0], [0.07, 0.004, s * 0.17], [-0.03, 0.004, s * 0.17], [-0.08, 0, 0]], grey); pivot.add(inner);   // swept inner wing
        var elbow = new THREE.Group(); elbow.position.set(0, 0.004, s * 0.17); pivot.add(elbow);
        elbow.add(poly([[0.07, 0, 0], [-0.005, 0, s * 0.13], [-0.045, 0, s * 0.12], [-0.03, 0, 0]], grey));                              // outer wing
        elbow.add(poly([[-0.005, 0, s * 0.13], [-0.03, 0, s * 0.2], [-0.05, 0, s * 0.125], [-0.045, 0, s * 0.12]], dark));               // black tip
        pivot.userData.s = s; pivot.userData.elbow = elbow; wings.push(pivot);
      });
      var nose = new THREE.Object3D(); nose.rotation.y = Math.PI / 2; model.add(nose); // nose marker: its +Z is the model's +X (beak)
      // Box3 auto-scale to 0.42 world units wingspan-ish height reference, centred
      var box = new THREE.Box3().setFromObject(model), sz = new THREE.Vector3(); box.getSize(sz);
      var sc = 0.5 / Math.max(sz.x, sz.z); model.scale.setScalar(sc);
      root2.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
      scene.add(root2);
      var r = mulberry(hash(seed, 900 + i));
      return { id: 'gull' + (i + 1), root: root2, model: model, nose: nose, wings: wings, cx: (r() - 0.5) * W * 0.5, cz: (r() - 0.5) * D * 0.5, R: 2.5 + r() * Math.max(W, D) * 0.28, alt: 3.8 + r() * 1.4, w: (0.28 + r() * 0.12) * (r() < 0.5 ? -1 : 1), ph: r() * 6.28, flap: r() * 6.28, yaw: 0, v: [1, 0] };
    }
    function gullPos(g, t) { var a = g.ph + g.w * t; return [g.cx + Math.cos(a) * g.R, g.alt + Math.sin(t * 0.7 + g.ph) * 0.25, g.cz + Math.sin(a) * g.R]; }
    function updateGulls() {
      var t = clock / 1000;
      gulls.forEach(function (g) {
        var p = gullPos(g, t), q = gullPos(g, t + 0.05);
        g.v = [q[0] - p[0], q[2] - p[2]];
        g.yaw = Math.atan2(g.v[0], g.v[1]) + FACING_OFFSET;
        g.root.position.set(p[0], p[1], p[2]); g.root.rotation.set(0, g.yaw, 0);
        g.model.rotation.x = -Math.sign(g.w) * 0.32;                         // bank into the turn (roll about the beak axis)
        var glide = Math.sin(t * 0.9 + g.ph) > 0.2, f = glide ? 0.12 : Math.sin(t * 11 + g.flap) * 0.55;
        g.wings.forEach(function (w) { w.rotation.x = w.userData.s * f; w.userData.elbow.rotation.x = -w.userData.s * f * 0.6; });
      });
    }

    // ---------- camera
    var focusT = { x: 0, z: 0, y: 0.6 }, focusC = { x: 0, z: 0, y: 0.6 };
    function camTarget() { return new THREE.Vector3(focusC.x, focusC.y, focusC.z); }
    // centre the orbit on a cell (null = the island centre); eased by update()
    self.focus = function (x, z, instant) {
      if (x == null) { focusT = { x: 0, z: 0, y: 0.6 }; } else { var Hh = town.H(x, z); focusT = { x: wx(x), z: wz(z), y: Hh >= 2 ? Math.min(2.2, (Hh - 1) * STOREY * 0.5) : 0.3 }; }
      if (instant) focusC = { x: focusT.x, y: focusT.y, z: focusT.z };
    };
    function placeCamera() {
      if (!has3D) return;
      var span = Math.max(W, D), dist = (span * 1.12 + 3.5) / cam.zoom, yr = cam.yaw * Math.PI / 180, pr = cam.pitch * Math.PI / 180, tg = camTarget();
      camera.position.set(tg.x + Math.sin(yr) * Math.cos(pr) * dist, tg.y + Math.sin(pr) * dist, tg.z + Math.cos(yr) * Math.cos(pr) * dist);
      camera.lookAt(tg); camera.updateMatrixWorld();
    }
    self.orbit = function (dYaw) { cam.yawT += num(dYaw, 0); };
    self.setYaw = function (deg, instant) { cam.yawT = num(deg, cam.yawT); if (instant) cam.yaw = cam.yawT; };
    self.setPitch = function (deg, instant) { cam.pitchT = clamp(num(deg, cam.pitchT), 15, 75); if (instant) cam.pitch = cam.pitchT; };
    self.zoomBy = function (f) { cam.zoomT = clamp(cam.zoomT * num(f, 1), 0.55, 2.6); };
    self.setZoom = function (z, instant) { cam.zoomT = clamp(num(z, 1), 0.55, 2.6); if (instant) cam.zoom = cam.zoomT; };
    self.camera3 = function () { return { yaw: cam.yaw, pitch: cam.pitch, zoom: cam.zoom, yawTarget: cam.yawT }; };
    // screen direction (dx right, dy down) -> grid step [x, z] for the current camera yaw
    self.gridDirFromScreen = function (dx, dy) {
      var yr = cam.yaw * Math.PI / 180, fx = -Math.sin(yr), fz = -Math.cos(yr), rx = Math.cos(yr), rz = -Math.sin(yr); // camera forward / right on the ground
      var vx = rx * dx - fx * dy, vz = rz * dx - fz * dy;
      return Math.abs(vx) >= Math.abs(vz) ? [Math.sign(vx), 0] : [0, Math.sign(vz)];
    };

    // ---------- picking and anchors (CSS px of the canvas)
    function colTop(H) { return H <= 0 ? WATER_Y : H === 1 ? 0 : (H - 1) * STOREY + 0.45; }
    self.pick = function (px, py) {
      if (!has3D) { var L = flatLayout(), gx = Math.floor((px - L.ox) / L.cs), gz = Math.floor((py - L.oy) / L.cs); return town.inGrid(gx, gz) ? { x: gx, z: gz, h: town.H(gx, gz) } : null; }
      var ndc = new THREE.Vector2(px / cssW * 2 - 1, -(py / cssH) * 2 + 1), rc = new THREE.Raycaster(); rc.setFromCamera(ndc, camera);
      var o = rc.ray.origin, dv = rc.ray.direction, best = null, bt = Infinity;
      for (var z = 0; z < D; z++) for (var x = 0; x < W; x++) {
        var X = wx(x), Z = wz(z), H = town.H(x, z), y0 = H >= 1 ? -SLAB : WATER_Y - 0.01, y1 = colTop(H);
        var lo = [X - 0.5, y0, Z - 0.5], hi = [X + 0.5, y1, Z + 0.5], t0 = -Infinity, t1 = Infinity, ok = true, ov = [o.x, o.y, o.z], dd = [dv.x, dv.y, dv.z];
        for (var a = 0; a < 3 && ok; a++) {
          if (Math.abs(dd[a]) < 1e-9) { if (ov[a] < lo[a] || ov[a] > hi[a]) ok = false; continue; }
          var ta = (lo[a] - ov[a]) / dd[a], tb = (hi[a] - ov[a]) / dd[a]; if (ta > tb) { var tt = ta; ta = tb; tb = tt; }
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) ok = false;
        }
        if (ok && t0 > 0 && t0 < bt) { bt = t0; best = { x: x, z: z, h: H }; }
      }
      return best;
    };
    self.anchorOf = function (x, z) {
      var H = town.H(x, z); if (H < 0) return null;
      if (!has3D) { var L = flatLayout(); return { x: L.ox + (x + 0.5) * L.cs, y: L.oy + z * L.cs, footY: L.oy + (z + 1) * L.cs, visible: true }; }
      var v = new THREE.Vector3(wx(x), colTop(H) + 0.05, wz(z)).project(camera), f = new THREE.Vector3(wx(x), Math.max(0, H >= 1 ? 0 : WATER_Y), wz(z)).project(camera);
      return { x: (v.x + 1) / 2 * cssW, y: (1 - v.y) / 2 * cssH, footY: (1 - f.y) / 2 * cssH, footX: (f.x + 1) / 2 * cssW, visible: v.z < 1 };
    };
    self.worldToScreen = function (X, Y, Z) { if (!has3D) return null; var v = new THREE.Vector3(X, Y, Z).project(camera); return { x: (v.x + 1) / 2 * cssW, y: (1 - v.y) / 2 * cssH, visible: v.z < 1 }; };
    self.cellWorld = function (x, z) { return { x: wx(x), y: colTop(town.H(x, z)), z: wz(z) }; };
    self.setHover = function (c, mode) { hover = c && town.inGrid(c.x, c.z) ? { x: c.x, z: c.z } : null; hoverMode = mode === 'shrink' ? 'shrink' : 'grow'; };
    self.hover = function () { return hover ? { x: hover.x, z: hover.z, mode: hoverMode } : null; };

    // ---------- edits (through the view so the scene follows)
    function after(info, focus) {
      if (!info) return null;
      rebuildAround(info.changed, focus);
      if (has3D && focus && info.kind !== 'undo' && info.kind !== 'redo') puff(focus.x, focus.z, info.to >= info.from);
      if (onEdit) onEdit(info);
      return info;
    }
    self.grow = function (x, z) { var c = { x: x, z: z }; return after(town.grow(x, z), c); };
    self.shrink = function (x, z) { var c = { x: x, z: z }; return after(town.shrink(x, z), c); };
    self.set = function (x, z, h) { return after(town.set(x, z, h, 'set'), { x: x, z: z }); };
    self.undo = function () { return after(town.undo(), null); };
    self.redo = function () { return after(town.redo(), null); };
    self.load = function (rows) { var i = town.load(rows); rebuildAll(); if (onEdit) onEdit(i); return i; };
    self.resolveAll = function () { var i = town.resolveAll(); rebuildAll(); return i; };

    // dust puffs on an edit (deterministic, driven by update)
    function puff(x, z, up) {
      var H = town.H(x, z), y = H >= 2 ? (H - 1) * STOREY : 0;
      for (var i = 0; i < 6; i++) {
        var m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 2), new THREE.MeshBasicMaterial({ color: up ? 0xffffff : 0xd8cbb5, transparent: true, opacity: 0.8, depthWrite: false }));
        var a = i / 6 * Math.PI * 2 + 0.3; m.position.set(wx(x) + Math.cos(a) * 0.45, y + 0.05, wz(z) + Math.sin(a) * 0.45); scene.add(m);
        puffs.push({ m: m, a: a, t: 0 });
      }
    }

    // ---------- update / render
    self.update = function (dt) {
      dt = num(dt, 0); if (dt < 0) dt = 0; clock += dt;
      var k = 1 - Math.pow(0.0001, dt / 1000 * 0.9); // ~10 % per frame at 60 Hz
      cam.yaw += (cam.yawT - cam.yaw) * k; cam.pitch += (cam.pitchT - cam.pitch) * k; cam.zoom += (cam.zoomT - cam.zoom) * k;
      if (Math.abs(cam.yawT - cam.yaw) < 0.01) cam.yaw = cam.yawT;
      focusC.x += (focusT.x - focusC.x) * k; focusC.y += (focusT.y - focusC.y) * k; focusC.z += (focusT.z - focusC.z) * k;
      if (!has3D) return;
      waterTex.offset.set((clock / 1000) * 0.012, (clock / 1000) * 0.006);
      mats.foam.opacity = 0.55 + 0.25 * Math.sin(clock / 1000 * 1.7);
      Object.keys(cols).forEach(function (kk) {
        var c = cols[kk]; if (c.pop <= 0) { c.group.scale.set(1, 1, 1); return; }
        c.pop = Math.max(0, c.pop - dt / 420); var p = 1 - c.pop, a = c.popAmp;
        var sy = 1 + a * (Math.sin(p * Math.PI * 2) * 0.2 * (1 - p)), sxz = 1 - a * (Math.sin(p * Math.PI * 2) * 0.08 * (1 - p));
        c.group.scale.set(sxz, sy, sxz);
      });
      for (var i = puffs.length - 1; i >= 0; i--) {
        var pf = puffs[i]; pf.t += dt / 520; var e = ease(pf.t);
        pf.m.position.x += Math.cos(pf.a) * dt / 1000 * 0.5; pf.m.position.z += Math.sin(pf.a) * dt / 1000 * 0.5; pf.m.position.y += dt / 1000 * 0.25;
        pf.m.scale.setScalar(0.6 + e * 1.1); pf.m.material.opacity = 0.8 * (1 - e);
        if (pf.t >= 1) { scene.remove(pf.m); pf.m.geometry.dispose(); pf.m.material.dispose(); puffs.splice(i, 1); }
      }
      updateGulls();
      // hover ghost: the storey a click would add (white) or remove (red)
      if (ghost) {
        if (hover && P.ghost !== 'off') {
          var H = town.H(hover.x, hover.z), shrink = hoverMode === 'shrink';
          if (shrink && H <= 0) ghost.visible = false;
          else {
            var y0, y1;
            if (shrink) { if (H === 1) { y0 = -0.2; y1 = 0.02; } else { y0 = (H - 2) * STOREY; y1 = (H - 1) * STOREY + 0.45; } }
            else if (H === 0) { y0 = -0.2; y1 = 0.02; } else if (H >= town.maxH) { y0 = (H - 1) * STOREY; y1 = y0 + 0.5; } else { y0 = (H - 1) * STOREY; y1 = H * STOREY; }
            ghost.visible = true; ghost.position.set(wx(hover.x), (y0 + y1) / 2, wz(hover.z)); ghost.scale.set(1.04, y1 - y0 + 0.02, 1.04);
            var pulse = 0.22 + 0.1 * Math.sin(clock / 1000 * 6);
            ghost.children[0].material.color.set(shrink || H >= town.maxH ? 0xff6a5a : 0xffffff); ghost.children[0].material.opacity = pulse;
            ghost.children[1].material.color.set(shrink || H >= town.maxH ? 0xff8a7a : 0xffffff);
          }
        } else ghost.visible = false;
      }
    };
    self.render = function () {
      if (!has3D) { drawFallback(); return; }
      placeCamera(); renderer.render(scene, camera);
    };
    self.resize = function (w, h, ratio) {
      cssW = Math.max(1, num(w, cssW)); cssH = Math.max(1, num(h, cssH)); dpr = num(ratio, 1);
      if (has3D) { renderer.setPixelRatio(dpr); renderer.setSize(cssW, cssH, false); camera.aspect = cssW / cssH; camera.fov = num(P.fov, 30) * (cssW < cssH ? 1.45 : 1); if (cssW < cssH) camera.setViewOffset(cssW, cssH, 0, -cssH * num(P.portraitShift, 0.1), cssW, cssH); else camera.clearViewOffset(); camera.updateProjectionMatrix(); }
      if (overlay) { overlay.width = Math.round(cssW * dpr); overlay.height = Math.round(cssH * dpr); }
    };
    self.size = function () { return { w: cssW, h: cssH, dpr: dpr }; };
    function flatLayout() { var cs = Math.floor(Math.min(cssW / (W + 2), (cssH - 60) / (D + 2))); return { cs: cs, ox: (cssW - cs * W) / 2, oy: (cssH - cs * D) / 2 - 10 }; }
    function drawFallback() {
      if (!octx) return; var L = flatLayout(), g = octx; g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#2b5f78'; g.fillRect(0, 0, cssW, cssH);
      for (var z = 0; z < D; z++) for (var x = 0; x < W; x++) {
        var H = town.H(x, z), X = L.ox + x * L.cs, Y = L.oy + z * L.cs;
        g.fillStyle = H === 0 ? '#3aa3c2' : H === 1 ? '#8fc76a' : 'rgb(' + (245 - H * 12) + ',' + (225 - H * 14) + ',' + (200 - H * 14) + ')'; g.fillRect(X, Y, L.cs - 1, L.cs - 1);
        if (H >= 2) { g.fillStyle = '#3a2a20'; g.font = 'bold ' + Math.max(9, L.cs * 0.4 | 0) + 'px sans-serif'; g.textAlign = 'center'; g.fillText(String(H - 1), X + L.cs / 2, Y + L.cs * 0.65); }
      }
      if (hover) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(L.ox + hover.x * L.cs, L.oy + hover.z * L.cs, L.cs - 1, L.cs - 1); }
      g.textAlign = 'center'; g.fillStyle = '#ffe6a8'; g.font = 'bold 14px sans-serif'; g.fillText('3D view unavailable (no WebGL): showing a top-down map', cssW / 2, Math.max(16, L.oy - 10)); g.textAlign = 'left';
    }
    self.overlayContext = function () { if (!octx) return null; octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, overlay.width, overlay.height); octx.setTransform(dpr, 0, 0, dpr, 0, 0); if (!has3D) drawFallback(); return octx; };
    self.setParams = function (o) {
      o = o || {}; var repal = o.palette != null && o.palette !== P.palette, regrid = o.grid != null && o.grid !== P.grid;
      Object.assign(P, o);
      if (o.yaw != null) self.setYaw(o.yaw); if (o.pitch != null) self.setPitch(o.pitch); if (o.zoom != null) self.setZoom(o.zoom);
      if (has3D && o.shadows != null) { renderer.shadowMap.enabled = P.shadows !== 'off'; sun.castShadow = P.shadows !== 'off'; scene.traverse(function (x) { if (x.material) (Array.isArray(x.material) ? x.material : [x.material]).forEach(function (m) { m.needsUpdate = true; }); }); }
      if (has3D && o.fov != null) self.resize(cssW, cssH, dpr);
      if (has3D && o.gulls != null) { gulls.forEach(function (g) { scene.remove(g.root); }); gulls = []; for (var i = 0; i < (num(P.gulls, 3) | 0); i++) gulls.push(makeGull(i)); }
      if (has3D && (repal || regrid)) applyPalette();
    };
    self.palettes = function () { return Object.keys(PALETTES).map(function (k) { return { id: k, name: PALETTES[k].name, swatch: [PALETTES[k].walls[1], PALETTES[k].roofs[0], PALETTES[k].sea] }; }); };
    self.palette = function () { return P.palette; };
    self.clock = function () { return clock; };
    self.scene = function () { return scene; };
    self.three = function () { return { THREE: THREE, scene: scene, camera: camera, renderer: renderer }; };
    self.actors = function () { return gulls.map(function (g) { return g.id; }); };
    // Text state: town summary + creatures with facing measured on the model (getWorldDirection of the nose marker)
    self.state = function () {
      var v = new (THREE ? THREE.Vector3 : function () {})(), actors = [];
      gulls.forEach(function (g) {
        g.root.updateMatrixWorld(true); g.nose.getWorldDirection(v);
        var m = Math.hypot(g.v[0], g.v[1]) || 1, mv = [g.v[0] / m, g.v[1] / m], fm = Math.hypot(v.x, v.z) || 1;
        var ang = Math.acos(clamp((v.x * mv[0] + v.z * mv[1]) / fm, -1, 1)) * 180 / Math.PI;
        actors.push({ id: g.id, kind: 'gull', x: +g.root.position.x.toFixed(3), y: +g.root.position.y.toFixed(3), z: +g.root.position.z.toFixed(3), yaw: +g.yaw.toFixed(4),
          moveDir: [+mv[0].toFixed(3), +mv[1].toFixed(3)], forward: [+(v.x / fm).toFixed(3), +(v.z / fm).toFixed(3)], moveAngle: +ang.toFixed(1), facesMove: ang <= 15, flying: true, target: null });
      });
      var vf = town.verify();
      return { t: Math.round(clock), palette: P.palette, camera: { yaw: +cam.yaw.toFixed(2), pitch: +cam.pitch.toFixed(2), zoom: +cam.zoom.toFixed(3) }, grid: { w: W, d: D, maxH: town.maxH },
        heights: town.heights(), counts: town.counts(), verify: { ok: vf.ok, checked: vf.checked, violations: vf.violations.length }, serial: town.serial(), hover: self.hover(), last: town.last() ? { kind: town.last().kind, x: town.last().x, z: town.last().z, from: town.last().from, to: town.last().to } : null,
        actors: actors, webgl: has3D };
    };

    if (has3D) {
      makeEnv();
      for (var gi = 0; gi < (num(P.gulls, 3) | 0); gi++) gulls.push(makeGull(gi));
      applyPalette();
      self.resize(canvas.clientWidth || 960, canvas.clientHeight || 540, 1);
      updateGulls(); placeCamera();
    }
    return self;
  }

  root.GameDNA_WfcTown3D = {
    VERSION: VERSION, STOREY: STOREY, FACING_OFFSET: FACING_OFFSET, MAXH: MAXH, DIRS: DNAME.slice(),
    createTown: createTown, create: create,
    registerTile: registerTile, registerPair: function (a, b) { if (!a || !b || a.length !== 1 || b.length !== 1) { warn('registerPair takes two one-letter sockets'); return false; } addPair(a, b); return true; },
    allowAir: function (s) { if (s && s.length === 1) RULES.air[s] = true; }, allowVertical: function (up, dn) { RULES.vpairs[up + dn] = true; },
    setWeight: function (k, v) { if (k in RULES.weights) RULES.weights[k] = num(v, RULES.weights[k]); else if (k in RULES.faceW) RULES.faceW[k] = num(v, RULES.faceW[k]); },
    rules: rulesCopy, compatible: hcomp, PALETTES: PALETTES
  };
})(typeof window !== 'undefined' ? window : this);

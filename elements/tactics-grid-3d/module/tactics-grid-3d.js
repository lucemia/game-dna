/* tactics-grid-3d.js - Game DNA N-03 module v1.0.0 (2026-11-18)
 * A 3D heightmap battlefield for turn-based grid tactics, built on three.js 0.149.0 (window.THREE).
 * One global: GameDNA_TacticsGrid3D. Plain classic script, ASCII only, no import/export.
 * Owns: terraced terrain with code-drawn textures, props, sky and light; low-poly procedural units with
 * code animation (walk tile by tile, hop terraces, lunge, cast, hurt, defeat); move / attack / threat
 * overlays, path arrow and cursor; the 90-degree orbit camera with zoom; picking and world->screen anchors;
 * the movement rules (height cost, jump limit, water) and range sets; a text state with facing checks.
 * The game keeps turns, stats, damage and AI. See README.md.
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var LEVEL = 0.5;               // world units per height level (a tile is 1 x 1)
  var FACING_OFFSET = -Math.PI / 2; // built-in figures are modelled with their nose on local +X
  var NOSE_LOCAL_YAW = Math.PI / 2; // art fact: the nose marker's +Z points along the figure's +X (face side)
  var DEG = Math.PI / 180;
  var BASE_Y = -2.2;             // bottom of the diorama block

  var DEFAULTS = {
    zoom: 2, camStep: 0, pitch: 33, overlay: 'pulse', threat: 'hover', shadows: 'soft', light: 'day',
    climbCost: 1, jump: 2, fall: 1, unitHeight: 0.95, walkMs: 250, turnMs: 380, meleeH: 3, grid: 0.22,
    decor: 'on', quality: 'high'
  };
  var TER = {
    g: { name: 'Grass', cost: 1 }, s: { name: 'Stone', cost: 1 }, d: { name: 'Sand', cost: 2 },
    w: { name: 'Water', cost: 99 }
  };
  var BLOCKING = { T: 'Tree', r: 'Rock', R: 'Ruin', P: 'Pine' };

  function warnOnce(o, key, msg) { if (!o._warned) o._warned = {}; if (o._warned[key]) return; o._warned[key] = 1; try { console.warn('[GameDNA_TacticsGrid3D] ' + msg); } catch (e) {} }
  function mulberry(seed) { var a = (seed >>> 0) || 1; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  function keyOf(x, z, w) { return z * w + x; }

  // ------------------------------------------------------------------ map parsing
  function parseMap(m) {
    if (!m) throw new Error('GameDNA_TacticsGrid3D: options.map is required ({heights:[rows], terrain:[rows], props:[rows]})');
    var hs = m.heights || m.height, ts = m.terrain || [], ps = m.props || [];
    var h = m.h || hs.length, w = m.w || String(hs[0]).length, tiles = [];
    for (var z = 0; z < h; z++) for (var x = 0; x < w; x++) {
      var hc = String(hs[z] || '')[x], tc = String(ts[z] || '')[x], pc = String(ps[z] || '')[x];
      var t = TER[tc] ? tc : 'g', p = BLOCKING[pc] ? pc : (pc === 'f' || pc === 'b' ? pc : '');
      tiles.push({ x: x, z: z, h: num(hc, 0), t: t, prop: p });
    }
    return { w: w, h: h, tiles: tiles };
  }

  // ------------------------------------------------------------------ code-drawn textures
  function canvasTex(THREE, size, draw, repeat) {
    var c = document.createElement('canvas'); c.width = c.height = size;
    var g = c.getContext('2d'); draw(g, size);
    var tx = new THREE.CanvasTexture(c);
    if (repeat) { tx.wrapS = tx.wrapT = THREE.RepeatWrapping; }
    tx.anisotropy = 4;
    return tx;
  }
  function speckle(g, S, r, n, cols, a0, a1, s0, s1) {
    for (var i = 0; i < n; i++) {
      g.globalAlpha = lerp(a0, a1, r()); g.fillStyle = cols[(r() * cols.length) | 0];
      var s = lerp(s0, s1, r()); g.fillRect(r() * S, r() * S, s, s);
    }
    g.globalAlpha = 1;
  }
  function tileLines(g, S, n, col, a) { // faint tile seams every S/n px (texture spans n tiles)
    g.globalAlpha = a; g.fillStyle = col; var step = S / n;
    for (var i = 0; i < n; i++) { g.fillRect(i * step, 0, 2, S); g.fillRect(0, i * step, S, 2); }
    g.globalAlpha = a * 0.5; g.fillStyle = '#ffffff';
    for (i = 0; i < n; i++) { g.fillRect(i * step + 2, 0, 1, S); g.fillRect(0, i * step + 2, S, 1); }
    g.globalAlpha = 1;
  }
  function makeTextures(THREE, seed, mood) {
    var T = {}, r = mulberry(seed * 7 + 11), S = 512;
    T.grass = canvasTex(THREE, S, function (g) {
      var gr = g.createLinearGradient(0, 0, S, S); gr.addColorStop(0, mood.grassA); gr.addColorStop(1, mood.grassB);
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
      for (var i = 0; i < 70; i++) { // soft patches
        g.globalAlpha = 0.10; g.fillStyle = r() < 0.5 ? mood.grassC : mood.grassD;
        g.beginPath(); g.arc(r() * S, r() * S, 18 + r() * 46, 0, 7); g.fill();
      }
      g.globalAlpha = 1;
      for (i = 0; i < 2600; i++) { // blades
        var x = r() * S, y = r() * S, l = 4 + r() * 7, c = [mood.grassC, mood.grassD, mood.grassE, mood.grassA][(r() * 4) | 0];
        g.strokeStyle = c; g.globalAlpha = 0.55 + r() * 0.45; g.lineWidth = 1.2 + r();
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y - l); g.stroke();
      }
      g.globalAlpha = 1;
      for (i = 0; i < 70; i++) { // tiny flowers
        g.fillStyle = ['#fff6d8', '#ffe27a', '#f6b3c8'][(r() * 3) | 0];
        var fx = r() * S, fy = r() * S; g.fillRect(fx, fy, 3, 3); g.fillStyle = '#c99b2e'; g.fillRect(fx + 1, fy + 1, 1, 1);
      }
      tileLines(g, S, 4, '#1f3b14', 0.22);
    }, true);
    T.stone = canvasTex(THREE, S, function (g) {
      g.fillStyle = mood.stoneA; g.fillRect(0, 0, S, S);
      var step = S / 4;
      for (var ty = 0; ty < 4; ty++) for (var tx = 0; tx < 4; tx++) { // 2x2 flagstones per tile, staggered
        for (var k = 0; k < 4; k++) {
          var x0 = tx * step + (k % 2) * step / 2 + 3, y0 = ty * step + ((k / 2) | 0) * step / 2 + 3, w = step / 2 - 6, h = step / 2 - 6;
          var l = 0.82 + r() * 0.3, base = mood.stoneB;
          g.fillStyle = base; g.globalAlpha = 1; roundRect(g, x0, y0, w, h, 6); g.fill();
          g.globalAlpha = (l - 0.82) * 1.6; g.fillStyle = '#ffffff'; roundRect(g, x0, y0, w, h, 6); g.fill();
          g.globalAlpha = 0.18; g.fillStyle = '#ffffff'; g.fillRect(x0 + 3, y0 + 2, w - 6, 3);
          g.globalAlpha = 0.22; g.fillStyle = '#000000'; g.fillRect(x0 + 3, y0 + h - 4, w - 6, 3);
          if (r() < 0.35) { g.globalAlpha = 0.35; g.strokeStyle = '#3d3a36'; g.lineWidth = 1.2; g.beginPath(); var cx = x0 + r() * w, cy = y0 + r() * h; g.moveTo(cx, cy); for (var q = 0; q < 3; q++) { cx += (r() - 0.5) * 22; cy += (r() - 0.5) * 22; g.lineTo(cx, cy); } g.stroke(); }
          if (r() < 0.3) { g.globalAlpha = 0.35; g.fillStyle = mood.moss; g.beginPath(); g.arc(x0 + (r() < 0.5 ? 0 : w), y0 + r() * h, 5 + r() * 8, 0, 7); g.fill(); }
        }
      }
      g.globalAlpha = 1; speckle(g, S, r, 2500, ['#000000', '#ffffff'], 0.04, 0.12, 1, 2);
      tileLines(g, S, 4, '#25221f', 0.3);
    }, true);
    T.sand = canvasTex(THREE, S, function (g) {
      g.fillStyle = mood.sandA; g.fillRect(0, 0, S, S);
      for (var i = 0; i < 26; i++) { // ripples
        g.strokeStyle = i % 2 ? mood.sandB : '#fff3d0'; g.globalAlpha = 0.28; g.lineWidth = 2;
        g.beginPath(); var y = (i / 26) * S + r() * 6; g.moveTo(0, y);
        for (var x = 0; x <= S; x += 16) g.lineTo(x, y + Math.sin(x / 40 + i) * 4); g.stroke();
      }
      speckle(g, S, r, 5000, [mood.sandB, '#fff8e0', '#9b8358'], 0.15, 0.45, 1, 2.2);
      for (i = 0; i < 24; i++) { g.globalAlpha = 0.8; g.fillStyle = ['#8f8a80', '#b6ada0', '#7a6e60'][(r() * 3) | 0]; g.beginPath(); g.ellipse(r() * S, r() * S, 2 + r() * 3, 1.5 + r() * 2, r() * 3, 0, 7); g.fill(); }
      g.globalAlpha = 1; tileLines(g, S, 4, '#6d5a35', 0.2);
    }, true);
    T.bed = canvasTex(THREE, 256, function (g, s) {
      g.fillStyle = '#5f6b55'; g.fillRect(0, 0, s, s); speckle(g, s, r, 1800, ['#3f4a3a', '#7d8a6a', '#a59e7a'], 0.2, 0.6, 1, 3);
    }, true);
    T.cliff = canvasTex(THREE, S, function (g) { // dirt cliff, grass lip at the top (v = 1)
      g.fillStyle = mood.dirtA; g.fillRect(0, 0, S, S);
      for (var i = 0; i < 9; i++) { g.globalAlpha = 0.35; g.fillStyle = i % 2 ? mood.dirtB : mood.dirtC; var y = (i / 9) * S + r() * 10; g.fillRect(0, y, S, 10 + r() * 22); }
      g.globalAlpha = 1;
      for (i = 0; i < 90; i++) { // embedded stones
        var x = r() * S, yy = 60 + r() * (S - 60), rw = 6 + r() * 16, rh = 4 + r() * 9;
        g.fillStyle = ['#7d7468', '#968b7b', '#615a50'][(r() * 3) | 0]; g.beginPath(); g.ellipse(x, yy, rw, rh, 0, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(x - rw * 0.2, yy - rh * 0.35, rw * 0.6, rh * 0.4, 0, 0, 7); g.fill();
      }
      speckle(g, S, r, 3000, ['#2b1d12', '#a07a52'], 0.1, 0.3, 1, 2.5);
      var lip = g.createLinearGradient(0, 0, 0, 44); lip.addColorStop(0, mood.grassC); lip.addColorStop(1, mood.grassA);
      g.fillStyle = lip; g.fillRect(0, 0, S, 26);
      for (i = 0; i < 260; i++) { var lx = r() * S, ll = 6 + r() * 20; g.strokeStyle = r() < 0.5 ? mood.grassC : mood.grassD; g.lineWidth = 2 + r() * 2; g.beginPath(); g.moveTo(lx, 20); g.lineTo(lx + (r() - 0.5) * 6, 20 + ll); g.stroke(); }
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 26, S, 3);
    }, true);
    T.rockCliff = canvasTex(THREE, S, function (g) {
      g.fillStyle = mood.stoneA; g.fillRect(0, 0, S, S);
      var row = 0;
      for (var y = 0; y < S; y += 42) { // masonry courses
        var off = (row++ % 2) * 40;
        for (var x = -off; x < S; x += 80) {
          var l = r(); g.fillStyle = mood.stoneB; roundRect(g, x + 3, y + 3, 74, 36, 5); g.fill();
          g.fillStyle = 'rgba(255,255,255,' + (0.06 + l * 0.14) + ')'; roundRect(g, x + 3, y + 3, 74, 36, 5); g.fill();
          g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 6, y + 34, 68, 4);
          if (r() < 0.25) { g.fillStyle = mood.moss; g.globalAlpha = 0.45; g.beginPath(); g.arc(x + r() * 74, y + 3, 8 + r() * 10, 0, 7); g.fill(); g.globalAlpha = 1; }
        }
      }
      speckle(g, S, r, 2500, ['#000000', '#ffffff'], 0.04, 0.12, 1, 2);
    }, true);
    T.water = canvasTex(THREE, 256, function (g, s) {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
      for (var i = 0; i < 60; i++) {
        g.strokeStyle = 'rgba(30,70,90,' + (0.15 + r() * 0.2) + ')'; g.lineWidth = 1.5 + r() * 2;
        var x = r() * s, y = r() * s, l = 14 + r() * 30; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 4, x + l, y); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 2, y - 2); g.quadraticCurveTo(x + l / 2, y - 6, x + l - 4, y - 2); g.stroke();
      }
    }, true);
    T.foam = canvasTex(THREE, 128, function (g, s) {
      var gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
      for (var i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(r() * s, r() * s * 0.4, 1 + r() * 3, 0, 7); g.fill(); }
    }, true);
    T.stripes = canvasTex(THREE, 64, function (g, s) {
      g.clearRect(0, 0, s, s); g.strokeStyle = '#ffffff'; g.lineWidth = 9;
      for (var i = -s; i < s * 2; i += 22) { g.beginPath(); g.moveTo(i, s); g.lineTo(i + s, 0); g.stroke(); }
    }, true);
    T.glow = canvasTex(THREE, 64, function (g, s) {
      var gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    }, false);
    T.cloud = canvasTex(THREE, 128, function (g, s) {
      for (var i = 0; i < 9; i++) { var x = s * (0.25 + r() * 0.5), y = s * (0.4 + r() * 0.2), rad = s * (0.12 + r() * 0.16); var gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }
    }, false);
    T.sky = canvasTex(THREE, 256, function (g, s) {
      var gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, mood.skyTop); gr.addColorStop(0.62, mood.skyMid); gr.addColorStop(1, mood.skyLow);
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    }, false);
    return T;
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  var MOODS = {
    day: { skyTop: '#5f97d6', skyMid: '#a9cbe8', skyLow: '#f2dfbf', fog: 0xcfdbe3, sun: 0xfff1d6, sunI: 1.05, hemiSky: 0xbfd8f2, hemiGround: 0x6b5a3e, hemiI: 0.62,
      grassA: '#6c9a3c', grassB: '#7fac45', grassC: '#93bf55', grassD: '#4f7d2f', grassE: '#a8cc63', stoneA: '#77716a', stoneB: '#a59d92', moss: '#5f7f34',
      sandA: '#d9c08a', sandB: '#c4a56c', dirtA: '#7a5638', dirtB: '#5e4029', dirtC: '#93694a', water: 0x3f9fb8, sunDir: [-0.55, 1, 0.35] },
    dusk: { skyTop: '#3b3f78', skyMid: '#c0739a', skyLow: '#f7b77a', fog: 0xd9a58e, sun: 0xffc48c, sunI: 1.0, hemiSky: 0x9a8fc4, hemiGround: 0x5a3d33, hemiI: 0.58,
      grassA: '#6b8f3d', grassB: '#7a9a42', grassC: '#93ae55', grassD: '#4c6c30', grassE: '#b2b85c', stoneA: '#77685f', stoneB: '#a8928a', moss: '#5f7034',
      sandA: '#d8b07f', sandB: '#bf9165', dirtA: '#734c36', dirtB: '#583827', dirtC: '#8f6047', water: 0x4f86a8, sunDir: [-0.8, 0.55, 0.15] }
  };

  // ------------------------------------------------------------------ figures (low-poly, nose on +X)
  var LOOKS = {
    knight: { scale: 1.0 }, lancer: { scale: 1.0 }, archer: { scale: 0.97 }, brute: { scale: 1.1 }, shaman: { scale: 1.0 }
  };
  var TEAM = {
    a: { cloth: 0x2f68c9, cloth2: 0x1f4a94, trim: 0xe3b84e, metal: 0xc4ccd6, ring: 0x58b4ff },
    b: { cloth: 0xb8362c, cloth2: 0x7e2320, trim: 0xd8c7a0, metal: 0x6d6f74, ring: 0xff6050 }
  };

  var DIM_GREY = null, CORPSE_CLAMP = true;
  function buildFigure(THREE, cls, look) {
    if (!DIM_GREY) DIM_GREY = new THREE.Color(0xb4bccc);
    var M = {}, mats = [];
    function mat(name, color, extra) {
      var m = new THREE.MeshLambertMaterial(Object.assign({ color: color, flatShading: true }, extra || {}));
      m.userData.base = new THREE.Color(color); m.userData.name = name; mats.push(m); M[name] = m; return m;
    }
    var c = look;
    mat('cloth', c.cloth); mat('cloth2', c.cloth2); mat('trim', c.trim); mat('metal', c.metal);
    mat('skin', cls === 'brute' ? 0x8c9a6a : cls === 'shaman' ? 0x8d7b9a : 0xe2b48f);
    mat('leather', 0x6a4528); mat('dark', 0x2c2522); mat('wood', 0x8a5a32); mat('eye', 0x1a1412);
    mat('glow', cls === 'shaman' ? 0xff7bf0 : 0xfff2b0, { emissive: cls === 'shaman' ? 0xd83dd0 : 0x806020 });
    var fig = new THREE.Group(); fig.name = 'figure';
    var P = {}; // rig parts
    function box(w, h, d, m, x, y, z, parent, tag) {
      var g = new THREE.BoxGeometry(w, h, d); var me = new THREE.Mesh(g, m); me.position.set(x, y, z);
      me.castShadow = true; me.receiveShadow = false; if (tag) me.userData[tag] = true; (parent || fig).add(me); return me;
    }
    function piv(x, y, z, parent) { var gq = new THREE.Group(); gq.position.set(x, y, z); (parent || fig).add(gq); return gq; }
    function mesh(geo, m, x, y, z, parent, tag) { var me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = true; if (tag) me.userData[tag] = true; (parent || fig).add(me); return me; }
    var bulky = cls === 'brute', robe = cls === 'shaman';
    var bw = bulky ? 1.25 : 1;
    // hips + legs (pivots at hip, knee)
    P.hips = piv(0, 0.74, 0);
    ['L', 'R'].forEach(function (s) {
      var zs = s === 'L' ? -1 : 1;
      var leg = piv(0, 0, 0.14 * zs * bw, P.hips);
      box(0.24 * bw, 0.36, 0.22 * bw, robe ? M.dark : (cls === 'knight' ? M.metal : M.cloth2), 0, -0.18, 0, leg);
      var knee = piv(0, -0.35, 0, leg);
      box(0.21 * bw, 0.31, 0.2 * bw, cls === 'knight' ? M.metal : M.leather, 0, -0.155, 0, knee);
      var foot = piv(0, -0.3, 0, knee);
      box(0.34 * bw, 0.11, 0.23 * bw, M.dark, 0.05, -0.055, 0, foot, 'foot');
      P['leg' + s] = leg; P['knee' + s] = knee; P['foot' + s] = foot;
    });
    // torso
    P.torso = piv(0, 0, 0, P.hips);
    var chestGeo = new THREE.CylinderGeometry(0.4 * bw, 0.3 * bw, 0.6, 4, 1); chestGeo.rotateY(Math.PI / 4); chestGeo.scale(0.78, 1, 1.0);
    mesh(chestGeo, cls === 'knight' ? M.metal : cls === 'brute' ? M.leather : M.cloth, 0, 0.34, 0, P.torso);
    box(0.3 * bw, 0.14, 0.4 * bw, M.leather, 0, 0.05, 0, P.torso); // belt
    box(0.06, 0.08, 0.08, M.trim, 0.16 * bw, 0.05, 0, P.torso); // buckle (front)
    if (cls === 'knight') { box(0.06, 0.5, 0.26, M.cloth, 0.16, 0.16, 0, P.torso); box(0.065, 0.06, 0.27, M.trim, 0.165, 0.42, 0, P.torso); box(0.065, 0.06, 0.27, M.trim, 0.165, -0.08, 0, P.torso); }
    if (cls === 'lancer') { box(0.29, 0.07, 0.42, M.trim, 0, 0.6, 0, P.torso); box(0.06, 0.3, 0.07, M.trim, 0.13, 0.3, 0.1, P.torso); }
    if (cls === 'archer') { box(0.25, 0.5, 0.36, M.leather, 0.03, 0.33, 0, P.torso); box(0.07, 0.62, 0.06, M.leather, 0, 0.34, 0.0, P.torso).rotation.x = 0.7; }
    if (cls === 'brute') { box(0.36, 0.2, 0.62, M.cloth, 0, 0.12, 0, P.torso); var strap = box(0.4, 0.07, 0.07, M.dark, 0, 0.4, 0, P.torso); strap.rotation.x = 0.9; }
    if (robe) { var skirt = new THREE.CylinderGeometry(0.22, 0.42, 0.78, 7, 1); mesh(skirt, M.cloth, 0, -0.38, 0, P.torso); box(0.2, 0.06, 0.4, M.trim, 0.02, 0.0, 0, P.torso);
      var neck = new THREE.TorusGeometry(0.2, 0.035, 4, 10); neck.rotateX(Math.PI / 2); mesh(neck, M.trim, 0, 0.6, 0, P.torso); }
    // cape / quiver at the back (-X)
    if (cls === 'knight') { P.cape = piv(-0.15, 0.6, 0, P.torso); box(0.04, 0.95, 0.5, M.cloth, -0.02, -0.46, 0, P.cape, 'noSize'); box(0.045, 0.06, 0.5, M.trim, -0.02, -0.92, 0, P.cape, 'noSize'); }
    if (cls === 'archer') { var qv = piv(-0.17, 0.4, 0.06, P.torso); qv.rotation.x = 0.35; box(0.12, 0.5, 0.14, M.leather, 0, 0, 0, qv, 'noSize'); for (var qa = 0; qa < 3; qa++) box(0.02, 0.14, 0.05, M.trim, 0.0, 0.3, -0.04 + qa * 0.04, qv, 'noSize'); }
    // head
    P.neck = piv(0, 0.66, 0, P.torso);
    box(0.12, 0.08, 0.12, M.skin, 0, 0.02, 0, P.neck);
    P.head = piv(0, 0.05, 0, P.neck); P.head.scale.setScalar(1.45);
    var headGeo = new THREE.IcosahedronGeometry(0.17, 1); headGeo.scale(1.0, 1.08, 0.95);
    mesh(headGeo, M.skin, 0.01, 0.15, 0, P.head);
    // eyes on the +X face (what the critic reads as "front")
    if (cls === 'brute') { box(0.04, 0.04, 0.055, M.glow, 0.17, 0.17, -0.065, P.head); box(0.04, 0.04, 0.055, M.glow, 0.17, 0.17, 0.065, P.head); box(0.05, 0.03, 0.2, M.dark, 0.17, 0.21, 0, P.head);
      box(0.04, 0.09, 0.035, M.trim, 0.17, 0.04, -0.08, P.head).rotation.z = 0.25; box(0.04, 0.09, 0.035, M.trim, 0.17, 0.04, 0.08, P.head).rotation.z = 0.25; }
    else if (robe) { box(0.05, 0.05, 0.06, M.glow, 0.2, 0.15, -0.065, P.head); box(0.05, 0.05, 0.06, M.glow, 0.2, 0.15, 0.065, P.head); }
    else { box(0.03, 0.04, 0.04, M.eye, 0.165, 0.17, -0.06, P.head); box(0.03, 0.04, 0.04, M.eye, 0.165, 0.17, 0.06, P.head); }
    if (cls === 'knight') {
      var helm = new THREE.CylinderGeometry(0.2, 0.21, 0.27, 8, 1); mesh(helm, M.metal, 0.0, 0.2, 0, P.head);
      var dome = new THREE.SphereGeometry(0.2, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2); mesh(dome, M.metal, 0, 0.33, 0, P.head);
      box(0.04, 0.035, 0.26, M.dark, 0.2, 0.19, 0, P.head); box(0.03, 0.14, 0.03, M.dark, 0.205, 0.12, 0, P.head);
      var plume = box(0.3, 0.12, 0.05, M.cloth, -0.04, 0.5, 0, P.head, 'noSize'); plume.rotation.z = -0.25;
    } else if (cls === 'lancer') {
      var cone = new THREE.ConeGeometry(0.21, 0.3, 8); mesh(cone, M.metal, 0, 0.42, 0, P.head);
      var brim = new THREE.CylinderGeometry(0.22, 0.22, 0.05, 8); mesh(brim, M.metal, 0, 0.28, 0, P.head);
      box(0.17, 0.05, 0.02, M.metal, 0.12, 0.2, 0.0, P.head); // nasal guard
      box(0.05, 0.09, 0.32, M.cloth, -0.06, 0.02, 0, P.head); // scarf
      box(0.06, 0.16, 0.26, M.dark, -0.15, 0.17, 0, P.head); // hair at the nape (back reads as back)
    } else if (cls === 'archer') {
      var hood = new THREE.ConeGeometry(0.22, 0.42, 7); hood.translate(0, 0.08, 0); var hm = mesh(hood, M.cloth, -0.04, 0.33, 0, P.head); hm.rotation.z = 0.35;
      box(0.12, 0.2, 0.36, M.cloth, -0.1, 0.12, 0, P.head);
    } else if (cls === 'brute') {
      var bh = new THREE.CylinderGeometry(0.17, 0.2, 0.13, 7); mesh(bh, M.metal, -0.02, 0.33, 0, P.head); var bd = new THREE.SphereGeometry(0.17, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2); mesh(bd, M.metal, -0.02, 0.39, 0, P.head);
      [-1, 1].forEach(function (s) { var horn = new THREE.ConeGeometry(0.06, 0.3, 5); var hm2 = mesh(horn, M.trim, 0.0, 0.42, 0.19 * s, P.head, 'noSize'); hm2.rotation.x = -0.9 * s; });

    } else if (robe) {
      var hd = new THREE.ConeGeometry(0.24, 0.48, 6); var hdm = mesh(hd, M.cloth2, -0.09, 0.36, 0, P.head); hdm.rotation.z = 0.3;
      box(0.14, 0.3, 0.38, M.cloth2, -0.12, 0.12, 0, P.head);
      box(0.03, 0.06, 0.34, M.trim, 0.08, 0.3, 0, P.head); // hood rim over a dark face
      box(0.02, 0.2, 0.26, M.dark, 0.17, 0.12, 0, P.head);
    }
    // arms (shoulder pivot, elbow pivot, hand)
    ['L', 'R'].forEach(function (s) {
      var zs = s === 'L' ? -1 : 1;
      var sh = piv(0, 0.54, 0.36 * zs * bw, P.torso);
      box(0.18 * bw, 0.34, 0.18 * bw, bulky ? M.skin : (robe ? M.cloth : M.cloth2), 0, -0.15, 0, sh);
      if (cls === 'knight' || cls === 'lancer' || bulky) { var pad = new THREE.SphereGeometry(0.13 * bw, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2); mesh(pad, M.metal, 0, 0.0, 0.02 * zs, sh); }
      var el = piv(0, -0.31, 0, sh);
      box(0.16 * bw, 0.3, 0.16 * bw, bulky ? M.skin : (cls === 'knight' ? M.metal : M.leather), 0, -0.14, 0, el);
      var hand = piv(0, -0.31, 0, el);
      box(0.15 * bw, 0.14, 0.15 * bw, cls === 'knight' ? M.dark : M.skin, 0, 0, 0, hand);
      P['arm' + s] = sh; P['elbow' + s] = el; P['hand' + s] = hand;
    });
    // weapons (right hand = +Z side). Hand local: -Y continues the forearm; held items are noSize.
    var wpn = new THREE.Group(); wpn.name = 'weapon'; P.handR.add(wpn); P.weapon = wpn;
    if (cls === 'knight') {
      box(0.05, 0.22, 0.05, M.leather, 0, 0, 0, wpn, 'noSize');
      box(0.07, 0.05, 0.3, M.trim, 0, 0.12, 0, wpn, 'noSize');
      box(0.03, 0.78, 0.09, M.metal, 0, 0.53, 0, wpn, 'noSize');
      var tip = new THREE.ConeGeometry(0.065, 0.14, 4); tip.rotateY(Math.PI / 4); tip.scale(0.4, 1, 1); mesh(tip, M.metal, 0, 0.98, 0, wpn, 'noSize');
      box(0.06, 0.06, 0.06, M.trim, 0, -0.13, 0, wpn, 'noSize');
      // kite shield on the left forearm, facing outward/forward
      var sg = new THREE.Shape(); sg.moveTo(0, 0.3); sg.lineTo(0.22, 0.22); sg.lineTo(0.18, -0.12); sg.lineTo(0, -0.36); sg.lineTo(-0.18, -0.12); sg.lineTo(-0.22, 0.22); sg.lineTo(0, 0.3);
      var sgeo = new THREE.ExtrudeGeometry(sg, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.025, bevelSegments: 1 });
      var shield = new THREE.Group(); P.elbowL.add(shield); shield.position.set(0.03, -0.17, -0.1); shield.rotation.y = -Math.PI / 2 + 0.55; P.shield = shield;
      mesh(sgeo, M.cloth, 0, 0, 0, shield, 'noSize');
      var rim = new THREE.ExtrudeGeometry(sg, { depth: 0.02, bevelEnabled: false }); rim.scale(1.1, 1.08, 1); mesh(rim, M.trim, 0, 0, -0.015, shield, 'noSize');
      box(0.1, 0.1, 0.03, M.trim, 0, 0.05, 0.08, shield, 'noSize').rotation.z = Math.PI / 4;
    } else if (cls === 'lancer') {
      box(0.045, 2.0, 0.045, M.wood, 0, 0.35, 0, wpn, 'noSize');
      var sp = new THREE.ConeGeometry(0.07, 0.3, 4); mesh(sp, M.metal, 0, 1.5, 0, wpn, 'noSize');
      box(0.02, 0.1, 0.14, M.cloth, 0, 1.28, 0.05, wpn, 'noSize');
    } else if (cls === 'archer') {
      var bow = new THREE.Group(); P.handL.add(bow); P.bow = bow;
      var arc = new THREE.TorusGeometry(0.5, 0.032, 4, 16, Math.PI * 0.8); arc.rotateZ(-Math.PI * 0.4); arc.translate(-0.5, 0, 0);
      mesh(arc, M.wood, 0, 0, 0, bow, 'noSize');
      var strG = new THREE.CylinderGeometry(0.008, 0.008, 0.95, 3); mesh(strG, M.trim, -0.345, 0, 0, bow, 'noSize');
      box(0.07, 0.12, 0.07, M.leather, 0, 0, 0, bow, 'noSize');
      box(0.03, 0.05, 0.05, M.leather, 0, 0, 0, wpn, 'noSize');
    } else if (cls === 'brute') {
      box(0.06, 1.25, 0.06, M.wood, 0, 0.3, 0, wpn, 'noSize');
      var ax = new THREE.Shape(); ax.moveTo(0, 0); ax.quadraticCurveTo(0.22, 0.05, 0.36, 0.26); ax.lineTo(0.38, -0.3); ax.quadraticCurveTo(0.22, -0.1, 0, -0.12); ax.lineTo(0, 0);
      var axg = new THREE.ExtrudeGeometry(ax, { depth: 0.04, bevelEnabled: false }); axg.translate(0, 0, -0.02);
      var axm = mesh(axg, M.metal, 0.02, 0.85, 0, wpn, 'noSize'); axm.rotation.y = 0;
      box(0.08, 0.12, 0.08, M.dark, 0, 0.82, 0, wpn, 'noSize');
    } else if (robe) {
      box(0.045, 1.6, 0.045, M.wood, 0, 0.3, 0, wpn, 'noSize');
      var orb = new THREE.IcosahedronGeometry(0.11, 0); mesh(orb, M.glow, 0, 1.18, 0, wpn, 'noSize');
      var claw = new THREE.TorusGeometry(0.11, 0.022, 3, 6, Math.PI * 1.3); claw.rotateZ(-Math.PI * 0.15); mesh(claw, M.trim, 0, 1.15, 0, wpn, 'noSize');
      box(0.02, 0.18, 0.08, M.cloth, 0.0, 1.0, 0.05, wpn, 'noSize');
      P.orb = wpn;
    }
    // held weapons get their own materials so a falling unit can drop (fade) them before they cross other tiles
    var wmats = [];
    [P.weapon, P.bow].forEach(function (gq) { if (!gq) return; gq.traverse(function (o) { if (o.isMesh) { var m = o.material.clone(); m.userData = { base: o.material.userData.base, name: o.material.userData.name }; o.material = m; mats.push(m); wmats.push(m); } }); });
    // facing marker: an art fact (+Z of this marker = where the face looks)
    var nose = new THREE.Object3D(); nose.name = 'nose'; nose.rotation.y = NOSE_LOCAL_YAW; nose.position.set(0, 1.5, 0); fig.add(nose); P.nose = nose;
    return { fig: fig, P: P, mats: mats, M: M, wmats: wmats };
  }

  // rest pose per class (angles in radians; rot.z swings forward (+X), rot.x swings sideways)
  function basePose(cls) {
    var p = { armL: [0, 0, 0.12], armR: [0, 0, 0.12], elbowL: [0, 0, 0.35], elbowR: [0, 0, 0.9], handR: [0, 0, 0], weapon: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], legL: [0, 0, 0], legR: [0, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], footL: [0, 0, 0], footR: [0, 0, 0] };
    if (cls === 'knight') { p.armR = [0.1, 0, 0.25]; p.elbowR = [0, 0, 1.1]; p.weapon = [0, 0, -1.8]; p.armL = [-0.12, 0, 0.35]; p.elbowL = [0, 0, 1.25]; }
    if (cls === 'lancer') { p.armR = [0.05, 0, 0.35]; p.elbowR = [0, 0, 1.3]; p.weapon = [0, 0, -2.0]; p.armL = [0.32, 0, 0.75]; p.elbowL = [0, 0, 0.8]; }
    if (cls === 'archer') { p.armL = [-0.15, 0, 0.45]; p.elbowL = [0, 0, 0.5]; p.armR = [0.15, 0, 0.2]; p.elbowR = [0, 0, 0.6]; }
    if (cls === 'brute') { p.armR = [0.05, 0, 0.3]; p.elbowR = [0, 0, 0.9]; p.weapon = [0, 0, -1.5]; p.armL = [-0.08, 0, 0.12]; p.elbowL = [0, 0, 0.3]; }
    if (cls === 'shaman') { p.armR = [0.08, 0, 0.3]; p.elbowR = [0, 0, 1.1]; p.weapon = [0, 0, -1.4]; p.armL = [-0.1, 0, 0.2]; p.elbowL = [0, 0, 0.7]; }
    return p;
  }

  // precise world-space AABB over the meshes of obj that pass filter
  var _v = null;
  function boxOf(THREE, obj, filter, out) {
    out = out || new THREE.Box3(); out.makeEmpty(); _v = _v || new THREE.Vector3();
    obj.updateWorldMatrix(true, true);
    obj.traverse(function (o) {
      if (!o.isMesh || !o.geometry || (filter && !filter(o))) return;
      var pos = o.geometry.attributes.position; if (!pos) return;
      for (var i = 0; i < pos.count; i++) { _v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); out.expandByPoint(_v); }
    });
    return out;
  }
  function sizeFilter(o) { var p = o; while (p) { if (p.userData && (p.userData.noSize || p.userData.noBox)) return false; if (p.name === 'figure') break; p = p.parent; } return true; }
  function footFilter(o) { return !!o.userData.foot; }

  // ================================================================== create
  function create(opts) {
    opts = opts || {};
    var THREE = opts.THREE || root.THREE;
    var self = { version: VERSION, FACING_OFFSET: FACING_OFFSET, LEVEL: LEVEL, error: null, gl: false };
    var P = Object.assign({}, DEFAULTS, opts.params || {});
    var map = parseMap(opts.map);
    var W = map.w, H = map.h, VW = (opts.view && opts.view.w) || 960, VH = (opts.view && opts.view.h) || 540;
    var seed = num(opts.seed, 1);
    var clock = 0;
    var actors = {}, order = [];
    var canvas = opts.canvas || null, overlay = opts.overlay || null, octx = overlay ? overlay.getContext('2d') : null;
    var cssW = VW, cssH = VH, dpr = 1;
    self.map = map; self.params = P; self.view = { w: VW, h: VH };
    function cb(name) { var f = opts[name]; if (typeof f !== 'function') return null; return function () { try { return f.apply(null, arguments); } catch (e) { warnOnce(self, name, name + ' threw: ' + e.message); } }; }
    var onStepCb = cb('onStep');

    // ---------------- rules (no three.js needed)
    function T(x, z) { return x >= 0 && z >= 0 && x < W && z < H ? map.tiles[z * W + x] : null; }
    function topY(x, z) { var c = T(x, z); if (!c) return 0; return c.t === 'w' ? c.h * LEVEL - 0.12 : c.h * LEVEL; }
    function passable(x, z) { var c = T(x, z); return !!c && c.t !== 'w' && !BLOCKING[c.prop]; }
    function jumpOf(u) { return u && u.jump != null ? +u.jump : +P.jump; }
    function stepCost(ax, az, bx, bz, u) {
      var a = T(ax, az), b = T(bx, bz); if (!a || !b || !passable(bx, bz)) return Infinity;
      var dh = b.h - a.h, j = jumpOf(u);
      if (dh > j || -dh > j + num(P.fall, 1)) return Infinity;
      return TER[b.t].cost + Math.max(0, dh) * num(P.climbCost, 1);
    }
    function unitsList(list) { return (list || (opts.units ? safeUnits() : [])).filter(function (u) { return u && !(u.hp <= 0) && !u.dead; }); }
    function safeUnits() { try { var l = opts.units(); return Array.isArray(l) ? l : []; } catch (e) { warnOnce(self, 'units', 'units() threw'); return []; } }
    function occ(units, x, z) { for (var i = 0; i < units.length; i++) if (units[i].x === x && units[i].z === z) return units[i]; return null; }
    var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    // Dijkstra within move points. Enemies block, allies can be passed but not stopped on.
    function reachOf(u, list, from) {
      var units = unitsList(list), mv = num(u.mv != null ? u.mv : u.move, 4);
      var sx = from ? from.x : u.x, sz = from ? from.z : u.z;
      var cost = {}, prev = {}, open = [keyOf(sx, sz, W)]; cost[open[0]] = 0;
      while (open.length) {
        var bi = 0; for (var i = 1; i < open.length; i++) if (cost[open[i]] < cost[open[bi]]) bi = i;
        var k = open.splice(bi, 1)[0], x = k % W, z = (k / W) | 0;
        for (var d = 0; d < 4; d++) {
          var nx = x + DIRS[d][0], nz = z + DIRS[d][1]; if (!T(nx, nz)) continue;
          var o = occ(units, nx, nz); if (o && o !== u && o.side !== u.side) continue;
          var c = cost[k] + stepCost(x, z, nx, nz, u); if (c > mv) continue;
          var nk = keyOf(nx, nz, W); if (cost[nk] == null || c < cost[nk]) { if (cost[nk] == null) open.push(nk); cost[nk] = c; prev[nk] = k; }
        }
      }
      var stops = [];
      for (var kk in cost) { var tx = kk % W, tz = (kk / W) | 0, oc = occ(units, tx, tz); if (!oc || oc === u) stops.push({ x: tx, z: tz, cost: cost[kk] }); }
      return { cost: cost, prev: prev, stops: stops, from: { x: sx, z: sz } };
    }
    function pathTo(reach, x, z) {
      var k = keyOf(x, z, W); if (!reach || reach.cost[k] == null) return null;
      var out = []; while (k != null) { out.unshift({ x: k % W, z: (k / W) | 0 }); k = reach.prev[k]; }
      return out;
    }
    function rangeOf(u) { var r = u.rng || u.range || [1, 1]; if (typeof r === 'number') r = [r, r]; return [num(r[0], 1), num(r[1], 1)]; }
    function canHit(u, fx, fz, tx, tz) {
      var r = rangeOf(u), d = Math.abs(tx - fx) + Math.abs(tz - fz); if (d < r[0] || d > r[1]) return false;
      var a = T(fx, fz), b = T(tx, tz); if (!a || !b) return false;
      if (r[1] <= 1 && Math.abs(a.h - b.h) > num(P.meleeH, 3)) return false;
      return true;
    }
    function attackTiles(u, fx, fz) {
      var out = [], r = rangeOf(u);
      for (var dz = -r[1]; dz <= r[1]; dz++) for (var dx = -r[1]; dx <= r[1]; dx++) { var x = fx + dx, z = fz + dz; if (T(x, z) && canHit(u, fx, fz, x, z)) out.push({ x: x, z: z }); }
      return out;
    }
    function threatOf(us, list) { // union of every tile `us` can strike after moving
      var set = {}, out = [];
      (Array.isArray(us) ? us : [us]).forEach(function (u) {
        if (!u || u.hp <= 0) return; var rc = reachOf(u, list);
        rc.stops.forEach(function (s) { attackTiles(u, s.x, s.z).forEach(function (t) { var k = keyOf(t.x, t.z, W); if (!set[k]) { set[k] = 1; out.push(t); } }); });
      });
      return out;
    }
    self.tile = function (x, z) { var c = T(x, z); return c ? { x: c.x, z: c.z, h: c.h, t: c.t, name: TER[c.t].name, cost: TER[c.t].cost, prop: c.prop ? BLOCKING[c.prop] || '' : '', top: topY(x, z), passable: passable(x, z) } : null; };
    self.passable = passable; self.stepCost = stepCost; self.reachOf = reachOf; self.pathTo = pathTo; self.canHit = canHit;
    self.attackTiles = attackTiles; self.threatOf = threatOf; self.rangeOf = rangeOf; self.topY = topY;
    self.size = { w: W, h: H };
    function wx(x) { return x - W / 2 + 0.5; } function wz(z) { return z - H / 2 + 0.5; }
    function tileAtWorld(x, z) { return { x: Math.floor(x + W / 2), z: Math.floor(z + H / 2) }; }
    self.worldOf = function (x, z) { return { x: wx(x), y: topY(x, z), z: wz(z) }; };

    // ---------------- three.js availability
    if (!THREE) { self.error = 'three.js is not loaded: load three.min.js (a script tag) before this module (or pass options.THREE).'; warnOnce(self, 'three', self.error); }
    var renderer = null;
    if (THREE && canvas) {
      try {
        var test = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!test) throw new Error('no WebGL context');
        renderer = new THREE.WebGLRenderer({ canvas: canvas, context: test, antialias: true, alpha: false, powerPreference: 'high-performance' });
        renderer.shadowMap.enabled = P.shadows !== 'off'; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        self.gl = true;
      } catch (e) { self.error = 'WebGL is not available on this device (' + e.message + ').'; renderer = null; }
    } else if (THREE && !canvas) { self.error = 'options.canvas (a <canvas> for WebGL) is missing.'; }
    self.renderer = renderer;
    var has3D = !!THREE; // camera math and scene graph work without WebGL; only drawing needs it

    // ---------------- scene
    var scene, camera, sun, hemi, terrainMesh, waterMesh, waterMat, foamMesh, gridLines, propsGroup, decorGroup, overlayGroup, unitGroup, fxGroup, clouds = [];
    var TX = null, mood = MOODS[P.light] || MOODS.day, propList = [], propMeshes = [];
    var camYaw = (45 + 90 * num(P.camStep, 0)) * DEG, camFrom = camYaw, camTo = camYaw, camT = 1, camStep = num(P.camStep, 0) | 0;
    var camTarget = null, camGoal = null, shakeAmp = 0, shakeT = 0, shakeDur = 1;
    var tmpV, tmpV2, raycaster;
    if (has3D) {
      tmpV = new THREE.Vector3(); tmpV2 = new THREE.Vector3(); raycaster = new THREE.Raycaster();
      scene = new THREE.Scene();
      camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
      camTarget = new THREE.Vector3(0, 1.0, 0); camGoal = camTarget.clone();
      self.scene = scene; self.camera = camera;
      buildWorld();
    }
    function disposeGroup(g) { if (!g) return; g.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); if (g.parent) g.parent.remove(g); }
    function buildWorld() {
      if (TX) { for (var k in TX) TX[k].dispose(); }
      mood = MOODS[P.light] || MOODS.day;
      TX = has3D && typeof document !== 'undefined' ? makeTextures(THREE, seed, mood) : null;
      [terrainMesh, waterMesh, foamMesh, gridLines, propsGroup, decorGroup].forEach(disposeGroup);
      if (sun) scene.remove(sun, sun.target); if (hemi) scene.remove(hemi);
      clouds.forEach(function (c) { scene.remove(c); }); clouds = [];
      scene.background = TX ? TX.sky : new THREE.Color(0x9fc3e3);
      scene.fog = new THREE.Fog(mood.fog, 36, 95);
      hemi = new THREE.HemisphereLight(mood.hemiSky, mood.hemiGround, mood.hemiI); scene.add(hemi);
      sun = new THREE.DirectionalLight(mood.sun, mood.sunI);
      var sd = mood.sunDir; sun.position.set(sd[0] * 20, sd[1] * 20, sd[2] * 20); sun.target.position.set(0, 0, 0);
      sun.castShadow = P.shadows !== 'off';
      var sz = P.quality === 'low' ? 1024 : 2048; sun.shadow.mapSize.set(sz, sz);
      var ext = Math.max(W, H) * 0.78; var sc = sun.shadow.camera; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 60;
      sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
      scene.add(sun); scene.add(sun.target);
      buildTerrain(); buildWater(); buildProps(); buildDecor(); buildClouds();
      if (!overlayGroup) { overlayGroup = new THREE.Group(); scene.add(overlayGroup); }
      if (!unitGroup) { unitGroup = new THREE.Group(); scene.add(unitGroup); }
      if (!fxGroup) { fxGroup = new THREE.Group(); scene.add(fxGroup); }
      if (renderer) renderer.shadowMap.enabled = P.shadows !== 'off';
      if (renderer) { scene.traverse(function (o) { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.needsUpdate = true; }); } }); }
    }
    function buildTerrain() {
      var groups = [[], [], [], [], [], []]; // grass, stone, sand, bed, cliff, rockCliff
      var r = mulberry(seed * 13 + 5);
      function quad(gi, a, b, c, d, n, uv, col) { groups[gi].push({ v: [a, b, c, d], n: n, uv: uv, col: col }); }
      function hAt(x, z) { var c = T(x, z); return c ? (c.t === 'w' ? c.h * LEVEL - 0.42 : c.h * LEVEL) : null; }
      for (var z = 0; z < H; z++) for (var x = 0; x < W; x++) {
        var c = T(x, z), y = hAt(x, z), x0 = wx(x) - 0.5, x1 = x0 + 1, z0 = wz(z) - 0.5, z1 = z0 + 1;
        var tint = 0.92 + r() * 0.14, gi = c.t === 'g' ? 0 : c.t === 's' ? 1 : c.t === 'd' ? 2 : 3;
        // corner AO: darken corners next to higher neighbours
        function ao(dx, dz) { var k = 1; [[dx, 0], [0, dz], [dx, dz]].forEach(function (o) { var hn = hAt(x + o[0], z + o[1]); if (hn != null && hn > y + 0.01) k -= 0.13; }); return k * tint; }
        var cols = [ao(-1, -1), ao(1, -1), ao(1, 1), ao(-1, 1)];
        quad(gi, [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 1, 0],
          [[x / 4, -z / 4], [(x + 1) / 4, -z / 4], [(x + 1) / 4, -(z + 1) / 4], [x / 4, -(z + 1) / 4]], cols);
        var sides = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (var s = 0; s < 4; s++) {
          var nx = x + sides[s][0], nz = z + sides[s][1], ny = hAt(nx, nz);
          if (ny == null) ny = BASE_Y; if (ny >= y - 0.001) continue;
          var sgi = (c.t === 's') ? 5 : (c.t === 'w' ? 5 : 4);
          var A, B; // edge endpoints, ordered so the face points outward
          if (s === 0) { A = [x1, z1]; B = [x1, z0]; } else if (s === 1) { A = [x0, z0]; B = [x0, z1]; } else if (s === 2) { A = [x0, z1]; B = [x1, z1]; } else { A = [x1, z0]; B = [x0, z0]; }
          var along0 = (s < 2 ? A[1] : A[0]), along1 = (s < 2 ? B[1] : B[0]);
          var vTop = 1, vBot = 1 - (y - ny) / 2.0;
          var edgeShade = ny <= BASE_Y + 0.01 ? 0.55 : 0.62;
          quad(sgi, [A[0], y, A[1]], [B[0], y, B[1]], [B[0], ny, B[1]], [A[0], ny, A[1]], [sides[s][0], 0, sides[s][1]],
            [[along0 / 2, vTop], [along1 / 2, vTop], [along1 / 2, vBot], [along0 / 2, vBot]], [tint, tint, edgeShade * tint, edgeShade * tint]);
        }
      }
      // bottom of the block
      quad(4, [wx(0) - 0.5, BASE_Y, wz(H - 1) + 0.5], [wx(W - 1) + 0.5, BASE_Y, wz(H - 1) + 0.5], [wx(W - 1) + 0.5, BASE_Y, wz(0) - 0.5], [wx(0) - 0.5, BASE_Y, wz(0) - 0.5], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], [0.4, 0.4, 0.4, 0.4]);
      var pos = [], nor = [], uvs = [], col = [], idx = [], geo = new THREE.BufferGeometry(), vi = 0, start = 0;
      groups.forEach(function (list, gi) {
        list.forEach(function (q) {
          for (var i = 0; i < 4; i++) { pos.push(q.v[i][0], q.v[i][1], q.v[i][2]); nor.push(q.n[0], q.n[1], q.n[2]); uvs.push(q.uv[i][0], q.uv[i][1]); col.push(q.col[i], q.col[i], q.col[i]); }
          idx.push(vi, vi + 2, vi + 1, vi, vi + 3, vi + 2); vi += 4;
        });
        geo.addGroup(start, list.length * 6, gi); start += list.length * 6;
      });
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx);
      fixWinding(geo);
      var mk = function (map) { return new THREE.MeshLambertMaterial({ map: map, vertexColors: true }); };
      var mats = TX ? [mk(TX.grass), mk(TX.stone), mk(TX.sand), mk(TX.bed), mk(TX.cliff), mk(TX.rockCliff)] : [0x6c9a3c, 0x9a938a, 0xd9c08a, 0x5f6b55, 0x7a5638, 0x77716a].map(function (c) { return new THREE.MeshLambertMaterial({ color: c, vertexColors: true }); });
      terrainMesh = new THREE.Mesh(geo, mats); terrainMesh.layers.enable(3); terrainMesh.receiveShadow = true; terrainMesh.castShadow = true; terrainMesh.name = 'terrain';
      scene.add(terrainMesh);
      // faint tile grid (helps reading distances); drawn as thin lines on walkable tops
      var lp = [];
      for (z = 0; z < H; z++) for (x = 0; x < W; x++) { var cc = T(x, z); if (cc.t === 'w') continue; var yy = cc.h * LEVEL + 0.006, a0 = wx(x) - 0.5, b0 = wz(z) - 0.5; lp.push(a0, yy, b0, a0 + 1, yy, b0, a0 + 1, yy, b0, a0 + 1, yy, b0 + 1, a0 + 1, yy, b0 + 1, a0, yy, b0 + 1, a0, yy, b0 + 1, a0, yy, b0); }
      var lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
      gridLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x1a2410, transparent: true, opacity: num(P.grid, 0.22), depthWrite: false }));
      gridLines.visible = num(P.grid, 0.22) > 0; scene.add(gridLines);
    }
    function fixWinding(geo) { // make every triangle's winding agree with its stored normal
      var p = geo.attributes.position, n = geo.attributes.normal, ix = geo.index.array, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nn = new THREE.Vector3();
      for (var i = 0; i < ix.length; i += 3) {
        a.fromBufferAttribute(p, ix[i]); b.fromBufferAttribute(p, ix[i + 1]); c.fromBufferAttribute(p, ix[i + 2]); nn.fromBufferAttribute(n, ix[i]);
        b.sub(a); c.sub(a); b.cross(c);
        if (b.dot(nn) < 0) { var t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
      }
    }
    function buildWater() {
      var pos = [], uv = [], fpos = [], fuv = [];
      for (var z = 0; z < H; z++) for (var x = 0; x < W; x++) {
        var c = T(x, z); if (c.t !== 'w') continue; var y = topY(x, z), x0 = wx(x) - 0.5, z0 = wz(z) - 0.5;
        pos.push(x0, y, z0, x0, y, z0 + 1, x0 + 1, y, z0 + 1, x0, y, z0, x0 + 1, y, z0 + 1, x0 + 1, y, z0);
        uv.push(x0 / 3, z0 / 3, x0 / 3, (z0 + 1) / 3, (x0 + 1) / 3, (z0 + 1) / 3, x0 / 3, z0 / 3, (x0 + 1) / 3, (z0 + 1) / 3, (x0 + 1) / 3, z0 / 3);
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { // foam strip along land edges
          var n = T(x + d[0], z + d[1]); if (n && n.t === 'w') return;
          var fy = y + 0.004, wdt = 0.2, A, B, Ai, Bi;
          if (d[0] === 1) { A = [x0 + 1, z0]; B = [x0 + 1, z0 + 1]; Ai = [x0 + 1 - wdt, z0]; Bi = [x0 + 1 - wdt, z0 + 1]; }
          else if (d[0] === -1) { A = [x0, z0 + 1]; B = [x0, z0]; Ai = [x0 + wdt, z0 + 1]; Bi = [x0 + wdt, z0]; }
          else if (d[1] === 1) { A = [x0 + 1, z0 + 1]; B = [x0, z0 + 1]; Ai = [x0 + 1, z0 + 1 - wdt]; Bi = [x0, z0 + 1 - wdt]; }
          else { A = [x0, z0]; B = [x0 + 1, z0]; Ai = [x0, z0 + wdt]; Bi = [x0 + 1, z0 + wdt]; }
          fpos.push(A[0], fy, A[1], B[0], fy, B[1], Bi[0], fy, Bi[1], A[0], fy, A[1], Bi[0], fy, Bi[1], Ai[0], fy, Ai[1]);
          var u0 = (x + z) * 0.37; fuv.push(u0, 0, u0 + 1, 0, u0 + 1, 1, u0, 0, u0 + 1, 1, u0, 1);
        });
      }
      if (!pos.length) return;
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
      waterMat = new THREE.MeshPhongMaterial({ color: mood.water, map: TX ? TX.water : null, transparent: true, opacity: 0.84, shininess: 90, specular: 0x9fd6e8, side: THREE.DoubleSide, depthWrite: false });
      waterMesh = new THREE.Mesh(g, waterMat); waterMesh.receiveShadow = true; waterMesh.renderOrder = 1; scene.add(waterMesh);
      if (fpos.length) {
        var fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2));
        foamMesh = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ map: TX ? TX.foam : null, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide })); foamMesh.renderOrder = 2; scene.add(foamMesh);
      }
    }
    function lambert(c, extra) { return new THREE.MeshLambertMaterial(Object.assign({ color: c, flatShading: true }, extra || {})); }
    function jitter(geo, r, amt) { var p = geo.attributes.position, seen = {}; for (var i = 0; i < p.count; i++) { var k = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3); if (!seen[k]) seen[k] = [(r() - 0.5) * amt, (r() - 0.5) * amt, (r() - 0.5) * amt]; var j = seen[k]; p.setXYZ(i, p.getX(i) + j[0], p.getY(i) + j[1], p.getZ(i) + j[2]); } geo.computeVertexNormals(); return geo; }
    function buildProps() {
      propsGroup = new THREE.Group(); scene.add(propsGroup); propList = []; propMeshes = [];
      var r = mulberry(seed * 31 + 7);
      var leafA = lambert(0x4f8a35), leafB = lambert(0x3c6e2b), leafC = lambert(0x6ea343), bark = lambert(0x6b4a2e), rockM = lambert(0x8b857c), rockD = lambert(0x6f6a62), mossM = lambert(0x6c8a3a), ruinM = lambert(0xb9ae9a), ruinD = lambert(0x958a76), pineM = lambert(0x2f5e3a), pineM2 = lambert(0x3d7347);
      for (var z = 0; z < H; z++) for (var x = 0; x < W; x++) {
        var c = T(x, z); if (!c.prop) continue;
        var g = new THREE.Group(), y = topY(x, z); g.position.set(wx(x) + (r() - 0.5) * 0.12, y, wz(z) + (r() - 0.5) * 0.12); g.rotation.y = r() * 6.28;
        if (c.prop === 'T') {
          var tr = new THREE.CylinderGeometry(0.07, 0.12, 0.7, 6); var tm = new THREE.Mesh(tr, bark); tm.position.y = 0.35; g.add(tm);
          [[0, 0.95, 0, 0.45, leafB], [0.12, 1.25, 0.05, 0.36, leafA], [-0.1, 1.45, -0.04, 0.27, leafC]].forEach(function (b) {
            var gg = jitter(new THREE.IcosahedronGeometry(b[3], 0), r, 0.08); var mm = new THREE.Mesh(gg, b[4]); mm.position.set(b[0], b[1], b[2]); g.add(mm);
          });
        } else if (c.prop === 'P') {
          var tr2 = new THREE.CylinderGeometry(0.06, 0.1, 0.5, 6); var tm2 = new THREE.Mesh(tr2, bark); tm2.position.y = 0.25; g.add(tm2);
          [[0.5, 0.55, 0.62, pineM], [0.4, 0.5, 0.95, pineM2], [0.28, 0.42, 1.25, pineM]].forEach(function (b) { var cg = new THREE.ConeGeometry(b[0], b[1], 7); var cm = new THREE.Mesh(cg, b[3]); cm.position.y = b[2]; g.add(cm); });
        } else if (c.prop === 'r') {
          var rg = jitter(new THREE.DodecahedronGeometry(0.36, 0), r, 0.12); rg.scale(1, 0.75, 1.1); var rm = new THREE.Mesh(rg, rockM); rm.position.y = 0.2; g.add(rm);
          var rg2 = jitter(new THREE.DodecahedronGeometry(0.2, 0), r, 0.08); var rm2 = new THREE.Mesh(rg2, rockD); rm2.position.set(0.28, 0.1, 0.18); g.add(rm2);
          var mg = jitter(new THREE.DodecahedronGeometry(0.22, 0), r, 0.06); mg.scale(1.1, 0.35, 1.0); var mm2 = new THREE.Mesh(mg, mossM); mm2.position.set(-0.02, 0.43, 0); g.add(mm2);
        } else if (c.prop === 'R') {
          var base = new THREE.BoxGeometry(0.62, 0.14, 0.62); var bm = new THREE.Mesh(base, ruinD); bm.position.y = 0.07; g.add(bm);
          var drums = 2 + ((r() * 2) | 0);
          for (var d = 0; d < drums; d++) { var cg2 = new THREE.CylinderGeometry(0.2, 0.21, 0.36, 8); var cm2 = new THREE.Mesh(cg2, ruinM); cm2.position.y = 0.32 + d * 0.37; cm2.rotation.y = r(); if (d === drums - 1) { cm2.rotation.z = (r() - 0.5) * 0.25; } g.add(cm2); }
          var fl = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.34, 8), ruinD); fl.rotation.z = Math.PI / 2; fl.position.set(0.18, 0.18, 0.32); fl.rotation.y = 0.6; g.add(fl);
          var mossy = new THREE.Mesh(jitter(new THREE.DodecahedronGeometry(0.16, 0), r, 0.05), mossM); mossy.scale.set(1.2, 0.4, 1.2); mossy.position.set(-0.22, 0.15, -0.2); g.add(mossy);
        }
        var rec = { g: g, mats: [], fade: 1, hit: false };
        g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.material = o.material.clone(); rec.mats.push(o.material); o.userData.prop = rec; o.layers.enable(3); propMeshes.push(o); } });
        propList.push(rec);
        propsGroup.add(g);
      }
      propsGroup.updateMatrixWorld(true);   // occluder raycasts can run before the first render (freeze replays)
    }
    function buildDecor() {
      decorGroup = new THREE.Group(); scene.add(decorGroup); if (P.decor === 'off') return;
      var r = mulberry(seed * 53 + 3), spots = [], peb = [];
      for (var z = 0; z < H; z++) for (var x = 0; x < W; x++) {
        var c = T(x, z); if (c.prop) continue;
        if (c.t === 'g') { var n = 2 + ((r() * 3) | 0); for (var i = 0; i < n; i++) spots.push([wx(x) + (r() - 0.5) * 0.86, topY(x, z), wz(z) + (r() - 0.5) * 0.86, 0.6 + r() * 0.7, r() * 6.28]); }
        if (c.t === 's' || c.t === 'd') { if (r() < 0.55) peb.push([wx(x) + (r() - 0.5) * 0.8, topY(x, z), wz(z) + (r() - 0.5) * 0.8, 0.5 + r() * 0.8, r() * 6.28]); }
      }
      // grass tuft: 3 crossed blades
      var tg = new THREE.BufferGeometry(), tp = [], tc = [];
      for (var b = 0; b < 3; b++) { var a = b * 2.1, ca = Math.cos(a) * 0.07, sa = Math.sin(a) * 0.07, lean = 0.03 * (b - 1);
        tp.push(-ca, 0, -sa, ca, 0, sa, lean, 0.16 + b * 0.03, 0); tc.push(0.25, 0.42, 0.14, 0.25, 0.42, 0.14, 0.62, 0.8, 0.36); }
      tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3)); tg.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3)); tg.computeVertexNormals();
      var tufts = new THREE.InstancedMesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), spots.length);
      var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      spots.forEach(function (s, i) { q.setFromAxisAngle(up, s[4]); sc.set(s[3], s[3], s[3]); ps.set(s[0], s[1], s[2]); m4.compose(ps, q, sc); tufts.setMatrixAt(i, m4); });
      tufts.receiveShadow = true; decorGroup.add(tufts);
      if (peb.length) {
        var pg = jitter(new THREE.DodecahedronGeometry(0.05, 0), r, 0.02); pg.scale(1, 0.6, 1);
        var pebs = new THREE.InstancedMesh(pg, lambert(0x8f887d), peb.length);
        peb.forEach(function (s, i) { q.setFromAxisAngle(up, s[4]); sc.set(s[3], s[3], s[3]); ps.set(s[0], s[1] + 0.015, s[2]); m4.compose(ps, q, sc); pebs.setMatrixAt(i, m4); });
        pebs.castShadow = true; pebs.receiveShadow = true; decorGroup.add(pebs);
      }
    }
    function buildClouds() {
      if (!TX) return; var r = mulberry(seed * 71 + 9);
      for (var i = 0; i < 9; i++) {
        var sm = new THREE.SpriteMaterial({ map: TX.cloud, transparent: true, opacity: 0.55 + r() * 0.3, depthWrite: false, fog: false });
        var s = new THREE.Sprite(sm); var ang = (i / 9) * 6.28 + r() * 0.4, rad = Math.max(W, H) * (0.62 + r() * 0.25);
        s.position.set(Math.cos(ang) * rad, BASE_Y - 1.2 - r() * 2.0, Math.sin(ang) * rad); var k = 5 + r() * 5; s.scale.set(k, k * 0.5, 1);
        s.userData.drift = 0.04 + r() * 0.05; s.userData.ang = ang; s.userData.rad = rad; scene.add(s); clouds.push(s);
      }
    }

    // ---------------- actors
    function teamOf(side) { return TEAM[side] || TEAM[side === 'player' || side === 0 ? 'a' : 'b']; }
    var looks = {}; // custom looks: name -> {build(THREE, team) -> {fig, P?, mats?}, facingOffset}
    self.registerLook = function (name, def) { looks[name] = def; };
    function makeActorObject(a) {
      var team = Object.assign({}, teamOf(a.side), a.colors || {});
      var built, fo = FACING_OFFSET, custom = looks[a.cls];
      if (custom) { try { built = custom.build(THREE, team); fo = num(custom.facingOffset, 0); } catch (e) { warnOnce(self, 'look' + a.cls, 'custom look ' + a.cls + ' failed: ' + e.message); } }
      if (!built) built = buildFigure(THREE, LOOKS[a.cls] ? a.cls : 'knight', team);
      if (!built.P) built.P = {};
      if (!built.P.nose) { var n = new THREE.Object3D(); n.name = 'nose'; n.rotation.y = num(built.noseYaw, 0); built.fig.add(n); built.P.nose = n; }
      built.mats = built.mats || [];
      var rootG = new THREE.Group(); rootG.name = 'actor:' + a.id;
      var pose = new THREE.Group(); rootG.add(pose);
      var holder = new THREE.Group(); pose.add(holder); holder.add(built.fig);
      // Box3 auto-scale in the rest pose: requested height, feet (min y) at 0
      applyPose(built, basePose(a.cls), null);
      var bb = boxOf(THREE, built.fig, sizeFilter); var hgt = Math.max(0.001, bb.max.y - bb.min.y);
      var want = num(a.height, num(P.unitHeight, 0.86) * ((LOOKS[a.cls] || {}).scale || 1));
      var s = want / hgt; holder.scale.setScalar(s);
      bb = boxOf(THREE, built.fig, sizeFilter); holder.position.y = -bb.min.y; // rootG is at the origin here
      bb = boxOf(THREE, built.fig, sizeFilter);
      a.restBox = { minY: bb.min.y, maxY: bb.max.y, h: bb.max.y - bb.min.y };
      // team ring under the feet
      var ring = new THREE.Mesh(new THREE.RingGeometry(0.33, 0.41, 40), new THREE.MeshBasicMaterial({ color: team.ring, transparent: true, opacity: 0.85, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.018; ring.renderOrder = 3; rootG.add(ring);
      var disc = new THREE.Mesh(new THREE.CircleGeometry(0.33, 32), new THREE.MeshBasicMaterial({ color: team.ring, transparent: true, opacity: 0.16, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2; disc.position.y = 0.016; disc.renderOrder = 3; rootG.add(disc);
      var sel = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40), new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.0, depthWrite: false }));
      sel.rotation.x = -Math.PI / 2; sel.position.y = 0.02; sel.renderOrder = 4; rootG.add(sel);
      // invisible pick box
      var pick = new THREE.Mesh(new THREE.BoxGeometry(0.6, want, 0.6), new THREE.MeshBasicMaterial({ visible: false })); pick.position.y = want / 2; pick.userData.actor = a.id; rootG.add(pick);
      built.fig.traverse(function (o) { if (o.isMesh) { o.castShadow = true; if (o.material && !(o.material.transparent && o.material.opacity < 0.5)) o.layers.enable(a.side === 'a' ? 1 : 2); } });
      unitGroup.add(rootG);
      a.obj = { root: rootG, pose: pose, holder: holder, built: built, ring: ring, disc: disc, sel: sel, pick: pick, facingOffset: fo, scale: s };
    }
    function applyPose(built, p, extra) {
      var R = built.P; if (!R) return;
      for (var k in p) { var o = R[k]; if (!o) continue; var v = p[k]; o.rotation.set(v[0], v[1], v[2]); }
      if (R.bow && R.armL && R.elbowL) R.bow.rotation.set(0, 0, -(R.armL.rotation.z + R.elbowL.rotation.z) + 0.1); // the bow stays upright
      if (extra) extra(R);
    }
    self.addActor = function (spec) {
      if (!spec || spec.id == null) { warnOnce(self, 'addActor', 'addActor needs {id, side, cls, x, z}'); return null; }
      var a = { id: String(spec.id), side: spec.side || 'a', cls: spec.cls || 'knight', x: num(spec.x, 0), z: num(spec.z, 0), colors: spec.colors, height: spec.height,
        yaw: 0, anim: null, queue: [], dim: false, dead: false, alpha: 1, flash: 0, look: null, moveDir: null, target: null, airborne: false, hp: spec.hp };
      if (actors[a.id]) self.removeActor(a.id);
      actors[a.id] = a; order.push(a.id);
      if (has3D) makeActorObject(a);
      a.wx = wx(a.x); a.wz = wz(a.z); a.wy = topY(a.x, a.z);
      self.face(a.id, spec.face || (a.side === 'a' ? [0, -1] : [0, 1]));
      poseActor(a, 0);
      return a.id;
    };
    self.removeActor = function (id) { var a = actors[id]; if (!a) return; if (a.obj) { disposeGroup(a.obj.root); } delete actors[id]; order.splice(order.indexOf(id), 1); };
    self.clearActors = function () { order.slice().forEach(self.removeActor); };
    self.actor = function (id) { return actors[id] || null; };
    self.actorIds = function () { return order.slice(); };
    self.setModel = function (id, object3d, o) { // replace an actor's look with any Object3D (e.g. a billboard rig)
      var a = actors[id]; if (!a || !a.obj || !object3d) return false; o = o || {};
      var h = a.obj.holder; while (h.children.length) h.remove(h.children[0]);
      var wrap = new THREE.Group(); wrap.name = 'figure'; wrap.add(object3d); h.add(wrap); h.scale.setScalar(1); h.position.y = 0;
      var nose = new THREE.Object3D(); nose.name = 'nose'; nose.rotation.y = num(o.noseYaw, 0); wrap.add(nose);
      a.obj.built = { fig: wrap, P: { nose: nose }, mats: [], custom: true };
      a.obj.facingOffset = num(o.facingOffset, 0);
      if (o.autoScale !== false) { var bb = boxOf(THREE, wrap, sizeFilter); var s = num(o.height, num(P.unitHeight, 0.86)) / Math.max(0.001, bb.max.y - bb.min.y); h.scale.setScalar(s); bb = boxOf(THREE, wrap, sizeFilter); h.position.y = -(bb.min.y - a.obj.root.position.y); }
      a.obj.customFeet = o.feet !== false; poseActor(a, 0); return true;
    };
    self.face = function (id, dirOrTarget, smooth) {
      var a = actors[id]; if (!a) return; var v = dirVec(a, dirOrTarget); if (!v) return;
      var y = Math.atan2(v[0], v[1]); if (smooth) { a.yawGoal = y; } else { a.yaw = y; a.yawGoal = null; }
    };
    function dirVec(a, t) {
      if (!t) return null; if (Array.isArray(t)) return (t[0] || t[1]) ? [t[0], t[1]] : null;
      if (typeof t === 'string' || typeof t === 'number') { var b = actors[String(t)]; if (!b) return null; return [b.wx - a.wx, b.wz - a.wz]; }
      if (t.x != null && t.z != null) return [wx(t.x) - a.wx, wz(t.z) - a.wz];
      return null;
    }
    self.setDim = function (id, on) { var a = actors[id]; if (a) a.dim = !!on; };
    self.setSelected = function (id) { order.forEach(function (k) { actors[k].selected = k === id; }); };
    self.setTile = function (id, x, z) { var a = actors[id]; if (!a) return; a.x = x; a.z = z; a.wx = wx(x); a.wz = wz(z); a.wy = topY(x, z); };
    self.busy = function () { for (var i = 0; i < order.length; i++) { var a = actors[order[i]]; if (a.anim && a.anim.blocking !== false) return true; } return projectiles.length > 0; };

    // ---------------- animations (all driven by update(dt))
    function startAnim(a, anim) { a.anim = anim; anim.t = 0; }
    self.walk = function (id, path, o) {
      var a = actors[id]; o = o || {}; if (!a || !path || path.length < 2) { if (o.onDone) safe(o.onDone); return; }
      var steps = [];
      for (var i = 1; i < path.length; i++) {
        var A = path[i - 1], B = path[i], ha = T(A.x, A.z), hb = T(B.x, B.z), dh = (hb ? hb.h : 0) - (ha ? ha.h : 0);
        steps.push({ a: A, b: B, dh: dh, hop: dh !== 0, dur: num(P.walkMs, 250) * (dh !== 0 ? 1.7 + Math.min(2, Math.abs(dh)) * 0.25 : 1) });
      }
      startAnim(a, { kind: 'walk', steps: steps, i: 0, st: 0, onStep: o.onStep, onDone: o.onDone, path: path });
      beginStep(a);
    };
    function beginStep(a) {
      var s = a.anim.steps[a.anim.i]; if (!s) return;
      a.moveDir = [s.b.x - s.a.x, s.b.z - s.a.z]; a.yaw = Math.atan2(a.moveDir[0], a.moveDir[1]); a.yawGoal = null;
      var ev = { id: a.id, from: { x: s.a.x, z: s.a.z }, to: { x: s.b.x, z: s.b.z }, step: a.anim.i, steps: a.anim.steps.length, hop: s.hop, dh: s.dh, dir: a.moveDir.slice() };
      if (a.anim.onStep) safe(a.anim.onStep, ev); if (onStepCb) onStepCb(ev);
    }
    self.attack = function (id, targetId, o) {
      var a = actors[id], b = actors[targetId]; o = o || {}; if (!a || !b) { if (o.onImpact) safe(o.onImpact); if (o.onDone) safe(o.onDone); return; }
      a.target = b.id; self.face(id, targetId);
      var kind = o.kind || (a.cls === 'shaman' ? 'bolt' : a.cls === 'archer' ? 'arrow' : 'melee');
      startAnim(a, { kind: kind === 'melee' ? 'melee' : 'cast', shot: kind, target: b.id, onImpact: o.onImpact, onDone: o.onDone, impacted: false, dur: kind === 'melee' ? 820 : 900 });
    };
    self.hurt = function (id, fromId) {
      var a = actors[id]; if (!a || a.dead) return; a.flash = 1;
      var f = actors[fromId]; var away = f ? [a.wx - f.wx, a.wz - f.wz] : [0, 0]; var l = Math.hypot(away[0], away[1]) || 1;
      if (!a.anim || a.anim.kind === 'idleTurn') startAnim(a, { kind: 'hurt', away: [away[0] / l, away[1] / l], dur: 420, blocking: false });
    };
    self.defeat = function (id, o) {
      var a = actors[id]; o = o || {}; if (!a) return; a.dead = true; a.target = null; a.moveDir = null;
      if (a.obj) a.obj.built.fig.traverse(function (m) { if (m.isMesh) { m.layers.disable(1); m.layers.disable(2); } });
      startAnim(a, { kind: 'defeat', dur: 1300, onDone: o.onDone });
    };
    self.revive = function (id) { var a = actors[id]; if (!a) return; a.dead = false; a.alpha = 1; a.anim = null; if (a.obj) { a.obj.root.visible = true; (a.obj.built.wmats || []).forEach(function (m) { m.visible = true; }); } setAlpha(a, 1); };
    function safe(f, x) { try { f(x); } catch (e) { warnOnce(self, 'cb' + String(f).slice(0, 20), 'callback threw: ' + e.message); } }

    // projectiles + sparks
    var projectiles = [], sparks = [];
    function spawnShot(a, b, kind, onHit) {
      var from = handWorld(a), to = new THREE.Vector3(b.wx, b.wy + (b.restBox ? b.restBox.h * 0.55 : 0.45), b.wz);
      var obj = new THREE.Group();
      if (kind === 'arrow') {
        var sh = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 4), lambert(0x8a5a32)); sh.rotation.x = Math.PI / 2; obj.add(sh);
        var hd = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 4), lambert(0xd0d6de)); hd.rotation.x = Math.PI / 2; hd.position.z = 0.28; obj.add(hd);
        var fl = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.005, 0.1), lambert(0xf2efe6)); fl.position.z = -0.22; obj.add(fl);
      } else {
        var core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 1), new THREE.MeshBasicMaterial({ color: 0xffd0ff })); obj.add(core);
        var halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX ? TX.glow : null, color: 0xff6ae8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); halo.scale.set(0.6, 0.6, 1); obj.add(halo);
      }
      obj.position.copy(from); fxGroup.add(obj);
      projectiles.push({ obj: obj, from: from, to: to, t: 0, dur: kind === 'arrow' ? 380 : 460, arc: kind === 'arrow' ? 0.55 : 0.25, kind: kind, onHit: onHit, trail: [] });
    }
    function handWorld(a) { var o = a.obj; if (!o) return new THREE.Vector3(a.wx, a.wy + 0.6, a.wz); var t = (o.built.P.orb || o.built.P.handL || o.built.P.handR || o.root); t.updateWorldMatrix(true, false); var v = new THREE.Vector3(); t.getWorldPosition(v); if (o.built.P.orb) { var w = new THREE.Vector3(0, 1.18, 0); o.built.P.orb.localToWorld(w); return w; } return v; }
    function burst(pos, color, n) {
      if (!has3D || !TX) return;
      for (var i = 0; i < n; i++) {
        var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.glow, color: color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        var ang = i / n * 6.283 + (i % 3) * 0.4, up = 0.6 + (i % 4) * 0.35;
        sp.position.copy(pos); sp.scale.set(0.22, 0.22, 1); fxGroup.add(sp);
        sparks.push({ s: sp, v: [Math.cos(ang) * 1.6, up * 1.8, Math.sin(ang) * 1.6], t: 0, dur: 380 + (i % 5) * 40 });
      }
    }
    self.burst = function (x, z, color, n) { if (!has3D) return; burst(new THREE.Vector3(wx(x), topY(x, z) + 0.5, wz(z)), color || 0xffe6a0, n || 10); };

    function stepAnim(a, dt) {
      var an = a.anim; if (!an) { if (a.yawGoal != null) { var d = angDiff(a.yawGoal, a.yaw), mx = dt * 0.012; if (Math.abs(d) <= mx) { a.yaw = a.yawGoal; a.yawGoal = null; } else a.yaw += Math.sign(d) * mx; } return; }
      an.t += dt;
      if (an.kind === 'walk') {
        var s = an.steps[an.i]; an.st += dt;
        if (an.st >= s.dur) {
          a.x = s.b.x; a.z = s.b.z; an.st -= s.dur; an.i++;
          if (an.i >= an.steps.length) { a.anim = null; a.moveDir = null; a.airborne = false; a.wx = wx(a.x); a.wz = wz(a.z); a.wy = topY(a.x, a.z); if (an.onDone) safe(an.onDone); return; }
          beginStep(a);
        }
      } else if (an.kind === 'melee') {
        if (!an.impacted && an.t >= 470) { an.impacted = true; var tb = actors[an.target]; if (tb) burst(new THREE.Vector3(lerp(a.wx, tb.wx, 0.7), tb.wy + 0.42, lerp(a.wz, tb.wz, 0.7)), 0xfff0b0, 9); if (an.onImpact) safe(an.onImpact); }
        if (an.t >= an.dur) { a.anim = null; a.target = null; if (an.onDone) safe(an.onDone); }
      } else if (an.kind === 'cast') {
        if (!an.fired && an.t >= 380) { an.fired = true; var tb2 = actors[an.target]; if (tb2 && has3D) spawnShot(a, tb2, an.shot, function () { if (an.onImpact) safe(an.onImpact); }); else if (an.onImpact) safe(an.onImpact); }
        if (an.t >= an.dur && an.fired) { a.anim = null; a.target = null; if (an.onDone) safe(an.onDone); }
      } else if (an.kind === 'hurt') {
        if (an.t >= an.dur) a.anim = null;
      } else if (an.kind === 'defeat') {
        if (an.t >= an.dur) { a.anim = null; a.alpha = 0; if (a.obj) a.obj.root.visible = false; if (an.onDone) safe(an.onDone); }
      }
    }
    // a walker passing through an ally's tile: both step aside (perpendicular, up to 0.3 tile each), so bodies never overlap
    function computePassing() {
      var i, a; for (i = 0; i < order.length; i++) actors[order[i]]._off = null;
      for (i = 0; i < order.length; i++) {
        a = actors[order[i]]; if (!a.anim || a.anim.kind !== 'walk' || a.dead) continue;
        var s = a.anim.steps[a.anim.i]; if (!s) continue;
        var u = clamp(a.anim.st / s.dur, 0, 1), wxp = lerp(wx(s.a.x), wx(s.b.x), u), wzp = lerp(wz(s.a.z), wz(s.b.z), u);
        var dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, perp = [-dz, dx];
        for (var j = 0; j < order.length; j++) {
          var o = actors[order[j]]; if (o === a || o.dead || (o.anim && o.anim.kind === 'walk')) continue;
          var onPath = false; for (var q = 0; q < a.anim.steps.length; q++) { var st = a.anim.steps[q]; if (st.b.x === o.x && st.b.z === o.z) onPath = true; }
          if (!onPath) continue;
          var d = Math.hypot(wxp - wx(o.x), wzp - wz(o.z)), k = ease(clamp((1.15 - d) / 0.75, 0, 1));
          if (k <= 0) continue;
          a._off = a._off || [0, 0]; o._off = o._off || [0, 0];
          a._off[0] += perp[0] * 0.3 * k; a._off[1] += perp[1] * 0.3 * k; o._off[0] -= perp[0] * 0.3 * k; o._off[1] -= perp[1] * 0.3 * k;
        }
      }
      for (i = 0; i < order.length; i++) { a = actors[order[i]]; if (!a._off) continue; var l = Math.hypot(a._off[0], a._off[1]); if (l > 0.32) { a._off[0] *= 0.32 / l; a._off[1] *= 0.32 / l; } }   // never leave the own tile
    }
    // props between the camera and a unit (or the cursor) fade to 30 %
    var occPoints = [], unitPoints = 0, xrayNeeded = true;
    self._occDebug = function () { return { props: propList.length, meshes: propMeshes.length, fades: propList.map(function (p) { return +p.fade.toFixed(2); }), hit: propList.filter(function (p) { return p.hit; }).length, pts: occPoints.length }; };
    function updateOccluders(dt) {
      if (!propList.length) return;
      var fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); occPoints.length = 0;
      order.forEach(function (id) { var a = actors[id]; if (a.dead) return; var h = a.restBox ? a.restBox.h : 0.9; occPoints.push(new THREE.Vector3(a.wxDraw, a.wyDraw + h * 0.25, a.wzDraw)); occPoints.push(new THREE.Vector3(a.wxDraw, a.wyDraw + h * 0.8, a.wzDraw)); });
      unitPoints = occPoints.length;
      if (cursorTile) occPoints.push(new THREE.Vector3(wx(cursorTile.x), topY(cursorTile.x, cursorTile.z) + 0.1, wz(cursorTile.z)));
      projectiles.forEach(function (p) { occPoints.push(p.obj.position.clone()); });
      propList.forEach(function (p) { p.hit = false; });
      var meshes = propMeshes; xrayNeeded = false;
      occPoints.forEach(function (pt, k) {
        raycaster.set(pt.clone().addScaledVector(fwd, -60), fwd); raycaster.far = 59.9;
        var hits = raycaster.intersectObjects(meshes, false);
        for (var i = 0; i < hits.length; i++) { var pr = hits[i].object.userData.prop; if (pr) pr.hit = true; }
        if (!xrayNeeded && k < unitPoints && terrainMesh && raycaster.intersectObject(terrainMesh, false).length) xrayNeeded = true;   // a unit behind a cliff
      });
      var rate = dt / 180;
      propList.forEach(function (p) {
        var goal = p.hit ? 0.16 : 1; p.fade = p.fade < goal ? Math.min(goal, p.fade + rate) : Math.max(goal, p.fade - rate);
        var tr = p.fade < 0.999;
        p.mats.forEach(function (m) { if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } m.opacity = p.fade; m.depthWrite = !tr; });
        p.g.traverse(function (o) { if (o.isMesh) { if (p.fade < 0.7) o.layers.disable(3); else o.layers.enable(3); o.castShadow = p.fade > 0.5; } });   // a faded prop no longer hides units in the x-ray pass
      });
    }
    function angDiff(a, b) { var d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }

    // pose + place one actor for the current animation state
    var feetBox = null, figBox = null;
    function poseActor(a, dtMs) {
      var an = a.anim, s, u, pose = basePose(a.cls), bob = 0, lean = 0, lunge = 0, side = 0, fall = 0;
      var t = clock / 1000, px = a.wx, pz = a.wz, py = a.wy;
      a.airborne = false;
      if (an && an.kind === 'walk') {
        s = an.steps[an.i]; u = clamp(an.st / s.dur, 0, 1);
        var ax = wx(s.a.x), az = wz(s.a.z), bx = wx(s.b.x), bz = wz(s.b.z), ay = topY(s.a.x, s.a.z), by = topY(s.b.x, s.b.z);
        if (!s.hop) {
          px = lerp(ax, bx, u); pz = lerp(az, bz, u); py = u < 0.5 ? ay : by;
          var ph = (an.i + u) * Math.PI; var sw = Math.sin(ph) * 0.62;
          pose.legL = [0, 0, sw]; pose.legR = [0, 0, -sw]; pose.kneeL = [0, 0, -Math.max(0, -Math.sin(ph)) * 0.9 - 0.1]; pose.kneeR = [0, 0, -Math.max(0, Math.sin(ph)) * 0.9 - 0.1];
          pose.armL[2] += -sw * 0.45; if (a.cls === 'archer') pose.armR[2] += sw * 0.4; lean = 0.12;
        } else {
          var c0 = 0.22, c1 = 0.8;
          if (u < c0) { px = ax; pz = az; py = ay; var k = u / c0; pose.legL = [0, 0, 0.5 * k]; pose.legR = [0, 0, 0.5 * k]; pose.kneeL = [0, 0, -1.0 * k]; pose.kneeR = [0, 0, -1.0 * k]; lean = 0.25 * k; }
          else if (u < c1) {
            var f = (u - c0) / (c1 - c0), hArc = Math.abs(s.dh) * LEVEL * 0.55 + 0.32;
            px = lerp(ax, bx, f); pz = lerp(az, bz, f); py = lerp(ay, by, f) + hArc * 4 * f * (1 - f);
            if (s.dh > 0) py = Math.max(py, ay + (by - ay) * Math.min(1, f * 1.6));
            a.airborne = true; pose.legL = [0, 0, 0.7]; pose.legR = [0, 0, -0.2]; pose.kneeL = [0, 0, -1.1]; pose.kneeR = [0, 0, -0.5]; pose.armL[2] += 0.9; pose.armR[2] += 0.2; lean = 0.18;
          } else { px = bx; pz = bz; py = by; var k2 = 1 - (u - c1) / (1 - c1); pose.legL = [0, 0, 0.45 * k2]; pose.legR = [0, 0, 0.45 * k2]; pose.kneeL = [0, 0, -0.9 * k2]; pose.kneeR = [0, 0, -0.9 * k2]; lean = 0.2 * k2; }
        }
      } else if (an && an.kind === 'melee') {
        var tt = an.t;
        var wind = clamp(tt / 300, 0, 1), strike = clamp((tt - 300) / 170, 0, 1), back = clamp((tt - 600) / 220, 0, 1);
        var e1 = ease(wind) * (1 - ease(strike)), e2 = ease(strike) * (1 - ease(back));
        lunge = 0.3 * e2 - 0.05 * e1; lean = -0.15 * e1 + 0.3 * e2;
        if (a.cls === 'lancer') {
          var aim = ease(clamp(tt / 280, 0, 1)) * (1 - ease(back)), tot = lerp(-0.35, -1.52, aim);   // spear lowers to level, then thrusts
          pose.armR[2] = 0.35 - 0.55 * e1 + 1.0 * e2; pose.elbowR[2] = 1.3 - 0.2 * e1 - 1.05 * e2; pose.weapon[2] = tot - pose.armR[2] - pose.elbowR[2];
          pose.armL[2] = 0.75 + 0.35 * aim + 0.3 * e2; lunge -= 0.14 * e2;   // the spear spans the gap: stop short
        }
        else if (a.cls === 'brute') { pose.armR[2] += 2.3 * e1 - 0.1 * e2; pose.armL[2] += 2.0 * e1; pose.elbowL[2] += 0.6 * e1; pose.weapon[2] += -0.4 * e1 + 1.2 * e2; }
        else { pose.armR[2] += 2.2 * e1 + 0.2 * e2; pose.elbowR[2] += -0.6 * e1 - 0.5 * e2; pose.weapon[2] += 0.2 * e1 + 1.2 * e2; pose.armL[2] += 0.4 * e2; }
        pose.legL = [0, 0, 0.35 * e2]; pose.legR = [0, 0, -0.3 * e2]; pose.kneeR = [0, 0, -0.4 * e2];
      } else if (an && an.kind === 'cast') {
        var w2 = clamp(an.t / 380, 0, 1), rel = clamp((an.t - 380) / 260, 0, 1), e3 = ease(w2) * (1 - ease(rel) * 0.8);
        if (an.shot === 'arrow') { pose.armL = [-0.05, 0, 1.45]; pose.elbowL = [0, 0, 0.05]; pose.armR = [0.1, 0, 1.4 - 0.2 * e3]; pose.elbowR = [0, 0, 1.7 * e3 + 0.4]; }
        else { pose.armR[2] += 1.5 * e3; pose.elbowR[2] += -0.9 * e3; pose.weapon[2] += 0.7 * e3; pose.armL[2] += 1.2 * e3; lean = 0.12 * e3; }
      } else if (an && an.kind === 'hurt') {
        var hk = Math.sin(clamp(an.t / an.dur, 0, 1) * Math.PI);
        px += an.away[0] * 0.09 * hk; pz += an.away[1] * 0.09 * hk; lean = -0.32 * hk; pose.armL[2] += 0.5 * hk; pose.head[2] = 0.25 * hk;
      } else if (an && an.kind === 'defeat') {
        var kn = ease(clamp(an.t / 260, 0, 1)), fk = ease(clamp((an.t - 160) / 520, 0, 1));
        pose.legL = [0, 0, 1.1 * kn]; pose.legR = [0, 0, 0.8 * kn]; pose.kneeL = [0, 0, -1.9 * kn]; pose.kneeR = [0, 0, -1.6 * kn];
        pose.armL[2] = 0.3 + 1.6 * fk; pose.armR[2] = 0.3 + 1.6 * fk; pose.head[2] = 0.35 * fk;
        fall = 0.95 * fk;                                    // backwards onto the heels, pivot at the feet
        px += Math.sin(a.yaw) * 0.26 * kn; pz += Math.cos(a.yaw) * 0.26 * kn;   // feet slide forward so the body stays on its own tile
        py -= 0.3 * ease(clamp((an.t - 760) / 500, 0, 1));    // sink while fading
        a.alpha = 1 - clamp((an.t - 700) / 560, 0, 1);
      } else {
        // idle: breathe, sway the weapon a little
        var br = Math.sin(t * 2.2 + a.wx * 1.7 + a.wz) * 0.03; pose.armR[2] += br; pose.armL[2] -= br * 0.6; pose.head[2] = br * 0.5; bob = br;
      }
      if (a.cls === 'knight' && a.obj && a.obj.built.P.cape) { var cp = a.obj.built.P.cape; cp.rotation.z = -0.08 - (an && an.kind === 'walk' ? 0.25 : 0) - Math.sin(t * 3 + a.wx) * 0.04; }
      if (a._off) { px += a._off[0]; pz += a._off[1]; }
      a.wxDraw = px; a.wzDraw = pz; a.wyDraw = py;
      if (!a.obj) return;
      var o = a.obj, R = o.root;
      applyPose(o.built, pose, null);
      R.position.set(px + Math.sin(a.yaw) * lunge, py, pz + Math.cos(a.yaw) * lunge);
      R.rotation.set(0, a.yaw + o.facingOffset, 0);
      // lean forward/back about the side axis (+X is the nose in figure space before the holder; pose is in root space)
      // pose group sits in root space, where the nose points along local +X rotated by facingOffset; lean around local axis perpendicular to nose
      o.pose.rotation.set(0, 0, 0);
      var leanAxisRot = lean, fallRot = fall;
      // the figure's forward in pose space is +X when facingOffset is the built-in one; for custom looks use their facingOffset
      var fwdAng = -o.facingOffset - Math.PI / 2; // angle of the nose in root space measured from +X toward... (0 for built-ins)
      o.pose.rotation.order = 'YZX';
      o.pose.rotation.y = 0; o.pose.rotation.z = -leanAxisRot + fallRot; // +z rotation lifts the nose (backwards); lean forward = negative
      if (o.built.custom) o.pose.rotation.z = 0;
      o.pose.position.set(0, 0, 0);
      // feet on the ground: snap the boots (or the whole body when lying) to the root's y
      R.updateMatrixWorld(true);
      if (!o.built.custom || o.customFeet) {
        var f = a.dead ? sizeFilter : footFilter;
        var bx2 = boxOf(THREE, o.holder, f, feetBox || (feetBox = new THREE.Box3()));
        if (isFinite(bx2.min.y)) { o.pose.position.y = py - bx2.min.y; R.updateMatrixWorld(true); }
        if (a.dead && CORPSE_CLAMP) { // a fallen body stays 0.1 inside its own tile (never across a neighbour)
          var bb = boxOf(THREE, o.holder, sizeFilter, feetBox), x0 = wx(a.x) - 0.4, x1 = wx(a.x) + 0.4, z0 = wz(a.z) - 0.4, z1 = wz(a.z) + 0.4, sx = 0, sz = 0;
          if (bb.max.x - bb.min.x < 0.8) sx = bb.min.x < x0 ? x0 - bb.min.x : bb.max.x > x1 ? x1 - bb.max.x : 0; else sx = (x0 + x1) / 2 - (bb.min.x + bb.max.x) / 2;
          if (bb.max.z - bb.min.z < 0.8) sz = bb.min.z < z0 ? z0 - bb.min.z : bb.max.z > z1 ? z1 - bb.max.z : 0; else sz = (z0 + z1) / 2 - (bb.min.z + bb.max.z) / 2;
          if (sx || sz) { R.position.x += sx; R.position.z += sz; R.updateMatrixWorld(true); a.wxDraw += sx; a.wzDraw += sz; }
        }
      }
      a.fwdAng = fwdAng;
      // materials: hurt flash, acted dim, defeat fade
      if (a.flash > 0) a.flash = Math.max(0, a.flash - dtMs / 300);
      var dimK = a.dim ? 0.9 : 1;
      o.built.mats.forEach(function (m) {
        if (m.userData.base) { m.color.copy(m.userData.base).multiplyScalar(dimK); if (a.dim) m.color.lerp(DIM_GREY, 0.45); }
        if (m.emissive && m.userData.name !== 'glow') m.emissive.setRGB(a.flash * 0.55, a.flash * 0.12, a.flash * 0.08);
      });
      setAlpha(a, a.alpha);
      if (a.dead && an && an.kind === 'defeat' && o.built.wmats) { var wa = a.alpha * (1 - clamp((an.t - 120) / 240, 0, 1)); o.built.wmats.forEach(function (m) { m.transparent = true; m.opacity = wa; m.visible = wa > 0.01; }); }
      o.sel.material.opacity = a.selected ? 0.6 + Math.sin(t * 6) * 0.3 : 0;
      o.ring.material.opacity = (a.dead ? 0 : 0.85) * (a.dim ? 0.45 : 1); o.disc.material.opacity = a.dead ? 0 : 0.16;
    }
    function setAlpha(a, al) {
      if (!a.obj) return; var tr = al < 0.999;
      a.obj.built.mats.forEach(function (m) { if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } m.opacity = al; });
    }

    // ---------------- overlays (move / attack / threat / target), path arrow, cursor
    var OVL = { move: { color: 0x2f86ff, edge: 0xd6ecff, a: 0.56 }, attack: { color: 0xff3b2e, edge: 0xffc8b8, a: 0.5 }, threat: { color: 0xff7a2a, edge: 0xffb070, a: 0.5, stripes: true }, target: { color: 0xffd040, edge: 0xfff2b0, a: 0.55 } };
    var overlays = {}, pathObj = null, cursorObj = null, cursorTile = null, pathTiles = null;
    self.setOverlay = function (kind, tiles) {
      if (!has3D) { overlays[kind] = { tiles: tiles || [] }; return; }
      var old = overlays[kind]; if (old && old.group) disposeGroup(old.group); delete overlays[kind];
      if (!tiles || !tiles.length || !OVL[kind]) return;
      var st = OVL[kind], set = {}, fp = [], fuv = [], ep = [];
      tiles.forEach(function (t) { set[keyOf(t.x, t.z, W)] = 1; });
      var lift = { move: 0.03, attack: 0.034, threat: 0.026, target: 0.038 }[kind];
      tiles.forEach(function (t) {
        if (!T(t.x, t.z)) return; var y = topY(t.x, t.z) + lift, x0 = wx(t.x) - 0.5 + 0.035, z0 = wz(t.z) - 0.5 + 0.035, s = 0.93;
        fp.push(x0, y, z0, x0, y, z0 + s, x0 + s, y, z0 + s, x0, y, z0, x0 + s, y, z0 + s, x0 + s, y, z0);
        fuv.push(x0, z0, x0, z0 + s, x0 + s, z0 + s, x0, z0, x0 + s, z0 + s, x0 + s, z0);
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
          if (set[keyOf(t.x + d[0], t.z + d[1], W)]) return; var e = 0.06, X0 = wx(t.x) - 0.5, Z0 = wz(t.z) - 0.5, yy = y + 0.004, q;
          if (d[0] === 1) q = [X0 + 1 - e, Z0, X0 + 1, Z0 + 1]; else if (d[0] === -1) q = [X0, Z0, X0 + e, Z0 + 1]; else if (d[1] === 1) q = [X0, Z0 + 1 - e, X0 + 1, Z0 + 1]; else q = [X0, Z0, X0 + 1, Z0 + e];
          ep.push(q[0], yy, q[1], q[0], yy, q[3], q[2], yy, q[3], q[0], yy, q[1], q[2], yy, q[3], q[2], yy, q[1]);
        });
      });
      var g = new THREE.Group();
      var fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(fuv.map(function (v) { return v * 1.6; }), 2));
      var fm = new THREE.MeshBasicMaterial({ color: st.color, transparent: true, opacity: st.a, depthWrite: false, side: THREE.DoubleSide, map: st.stripes && TX ? TX.stripes : null, polygonOffset: true, polygonOffsetFactor: -2, fog: false });
      var fmesh = new THREE.Mesh(fg, fm); fmesh.renderOrder = 5; g.add(fmesh);
      if (ep.length) { var eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(ep, 3)); var em = new THREE.Mesh(eg, new THREE.MeshBasicMaterial({ color: st.edge, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, fog: false })); em.renderOrder = 6; g.add(em); }
      overlayGroup.add(g); overlays[kind] = { group: g, fill: fm, base: st.a, tiles: tiles.slice() };
    };
    self.clearOverlays = function () { Object.keys(overlays).forEach(function (k) { self.setOverlay(k, null); }); self.setPath(null); };
    self.overlayTiles = function (kind) { return overlays[kind] ? overlays[kind].tiles.slice() : []; };
    self.setPath = function (path) {
      pathTiles = path && path.length > 1 ? path.slice() : null;
      if (!has3D) return; if (pathObj) { disposeGroup(pathObj); pathObj = null; } if (!pathTiles) return;
      var pts = [], i;
      for (i = 0; i < pathTiles.length; i++) {
        var p = pathTiles[i], y = topY(p.x, p.z) + 0.12; pts.push(new THREE.Vector3(wx(p.x), y, wz(p.z)));
        if (i < pathTiles.length - 1) { var q = pathTiles[i + 1], yq = topY(q.x, q.z) + 0.12; if (Math.abs(yq - y) > 0.01) { var mx = (wx(p.x) + wx(q.x)) / 2, mz = (wz(p.z) + wz(q.z)) / 2; var ux = (wx(q.x) - wx(p.x)) * 0.06, uz = (wz(q.z) - wz(p.z)) * 0.06; pts.push(new THREE.Vector3(mx - ux, Math.max(y, yq) + 0.0, mz - uz)); pts.push(new THREE.Vector3(mx + ux, Math.max(y, yq) + 0.0, mz + uz)); } }
      }
      var last = pts[pts.length - 1], prev = pts[pts.length - 2], dir = new THREE.Vector3().subVectors(last, prev); dir.y = 0; dir.normalize();
      var end = last.clone().addScaledVector(dir, -0.18); pts[pts.length - 1] = end;
      var cp = new THREE.CurvePath(); for (i = 1; i < pts.length; i++) cp.add(new THREE.LineCurve3(pts[i - 1], pts[i]));
      var g = new THREE.Group();
      var tube = new THREE.TubeGeometry(cp, Math.max(8, pts.length * 10), 0.06, 6, false);
      var mat = new THREE.MeshBasicMaterial({ color: 0xffe27a, fog: false }); var tm = new THREE.Mesh(tube, mat); tm.renderOrder = 7; g.add(tm);
      var outline = new THREE.Mesh(new THREE.TubeGeometry(cp, Math.max(8, pts.length * 10), 0.085, 6, false), new THREE.MeshBasicMaterial({ color: 0x5a3d10, side: THREE.BackSide, fog: false })); g.add(outline);
      var head = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.32, 3), mat); head.position.copy(last).addScaledVector(dir, -0.04); head.rotation.order = 'YXZ'; head.rotation.y = Math.atan2(dir.x, dir.z); head.rotation.x = Math.PI / 2; g.add(head);
      var headO = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 3), new THREE.MeshBasicMaterial({ color: 0x5a3d10, side: THREE.BackSide, fog: false })); headO.position.copy(head.position); headO.rotation.copy(head.rotation); g.add(headO);
      var start = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 16), mat); start.position.copy(pts[0]); start.position.y -= 0.08; g.add(start);
      overlayGroup.add(g); pathObj = g;
    };
    self.setCursor = function (x, z) {
      cursorTile = x == null ? null : { x: x, z: z };
      if (!has3D) return;
      if (!cursorObj) {
        cursorObj = new THREE.Group(); var m = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), dm = new THREE.MeshBasicMaterial({ color: 0x23180a, fog: false });
        for (var i = 0; i < 4; i++) { var c = new THREE.Group(); c.rotation.y = i * Math.PI / 2;
          var a1 = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.035, 0.05), m); a1.position.set(-0.36, 0, -0.475); c.add(a1);
          var a2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.26), m); a2.position.set(-0.475, 0, -0.36); c.add(a2);
          var b1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.09), dm); b1.position.set(-0.35, -0.004, -0.475); c.add(b1);
          var b2 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.3), dm); b2.position.set(-0.475, -0.004, -0.35); c.add(b2);
          cursorObj.add(c); }
        var gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), new THREE.MeshLambertMaterial({ color: 0xffd34a, emissive: 0x7a5200, flatShading: true })); gem.scale.y = 1.6; gem.name = 'gem'; cursorObj.add(gem);
        cursorObj.renderOrder = 8; overlayGroup.add(cursorObj);
      }
      cursorObj.visible = !!cursorTile;
    };
    self.cursor = function () { return cursorTile ? { x: cursorTile.x, z: cursorTile.z } : null; };
    function updateOverlays() {
      var t = clock / 1000, pul = P.overlay === 'pulse' ? 0.75 + 0.25 * Math.sin(t * 4) : 1;
      for (var k in overlays) { var o = overlays[k]; if (o.fill) o.fill.opacity = o.base * (P.overlay === 'outline' ? 0.25 : pul); }
      if (overlays.threat && overlays.threat.fill && overlays.threat.fill.map) { overlays.threat.fill.map.offset.x = (t * 0.25) % 1; }
      if (cursorObj && cursorTile) {
        var y = topY(cursorTile.x, cursorTile.z) + 0.04; cursorObj.position.set(wx(cursorTile.x), y, wz(cursorTile.z));
        var sc = 1 + Math.sin(t * 5) * 0.04; cursorObj.children.forEach(function (c) { if (c.name !== 'gem') c.scale.set(sc, 1, sc); });
        var gem = cursorObj.getObjectByName('gem'), occH = 0.0; for (var i = 0; i < order.length; i++) { var a = actors[order[i]]; if (!a.dead && a.x === cursorTile.x && a.z === cursorTile.z && !a.anim) occH = (a.restBox ? a.restBox.h : 0.86); }
        gem.position.y = (occH ? occH + 0.38 : 0.62) + Math.sin(t * 3) * 0.06; gem.rotation.y = t * 1.5;
      }
      if (waterMat && waterMat.map) { waterMat.map.offset.set((t * 0.03) % 1, (t * 0.017) % 1); }
      if (foamMesh) foamMesh.material.opacity = 0.55 + Math.sin(t * 1.6) * 0.15;
      clouds.forEach(function (c) { c.userData.ang += c.userData.drift * 0.0005; c.position.x = Math.cos(c.userData.ang) * c.userData.rad; c.position.z = Math.sin(c.userData.ang) * c.userData.rad; });
    }

    // ---------------- camera
    function camHalfH() { var base = num(opts.frame, Math.max(W, H) * 0.47 + 0.6); return base / clamp(num(P.zoom, 1), 0.5, 2.5) * num(P.frameScale, 1); }
    self.setView = function (w, h) { VW = Math.max(1, num(w, VW)); VH = Math.max(1, num(h, VH)); self.view = { w: VW, h: VH }; placeCamera(); };
    self.camForward = function () { if (!camera) return [0, -1]; var f = new THREE.Vector3(); camera.getWorldDirection(f); return [f.x, f.z]; };
    function placeCamera() {
      if (!camera) return;
      var asp = VW / VH, hh = camHalfH();
      camera.left = -hh * asp; camera.right = hh * asp; camera.top = hh; camera.bottom = -hh; camera.updateProjectionMatrix();
      var p = num(P.pitch, 33) * DEG, dist = 40, sx = 0, sy = 0;
      if (shakeAmp > 0) { var k = 1 - clamp(shakeT / shakeDur, 0, 1); sx = Math.sin(shakeT * 0.09) * shakeAmp * k; sy = Math.cos(shakeT * 0.11) * shakeAmp * k * 0.6; }
      camera.position.set(camTarget.x + Math.sin(camYaw) * Math.cos(p) * dist, camTarget.y + Math.sin(p) * dist, camTarget.z + Math.cos(camYaw) * Math.cos(p) * dist);
      camera.lookAt(camTarget);
      if (sx || sy) { camera.updateMatrixWorld(); var right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1); camera.position.addScaledVector(right, sx * 0.01 * hh).addScaledVector(up, sy * 0.01 * hh); }
      camera.updateMatrixWorld();
    }
    self.rotate = function (dir) { camStep = (camStep + (dir < 0 ? -1 : 1) + 4) % 4; camFrom = camYaw; camTo = camFrom + (dir < 0 ? -1 : 1) * Math.PI / 2; camT = 0; P.camStep = camStep; };
    self.setCamStep = function (k) { camStep = ((k | 0) % 4 + 4) % 4; camYaw = camTo = camFrom = (45 + 90 * camStep) * DEG; camT = 1; P.camStep = camStep; placeCamera(); };
    self.camStep = function () { return camStep; };
    self.zoomBy = function (f) { P.zoom = clamp(num(P.zoom, 1) * f, 0.6, 2.2); };
    self.setZoom = function (z) { P.zoom = clamp(num(z, 1), 0.6, 2.2); };
    self.focus = function (x, z, instant) { if (!camGoal) return; var k = clamp((num(P.zoom, 1) - 0.9) / 0.9, 0, 1) * 0.85 + 0.15; camGoal.set(x == null ? 0 : wx(x) * k, 1.0 + (x == null ? 0 : topY(x, z) * 0.5), x == null ? 0 : wz(z) * k); if (instant) camTarget.copy(camGoal); };
    self.shake = function (px, ms) { if (num(px, 0) >= shakeAmp * (1 - clamp(shakeT / shakeDur, 0, 1))) { shakeAmp = num(px, 4); shakeT = 0; shakeDur = Math.max(1, num(ms, 200)); } };
    function updateCamera(dt) {
      if (camT < 1) { camT = Math.min(1, camT + dt / num(P.turnMs, 380)); camYaw = lerp(camFrom, camTo, ease(camT)); if (camT >= 1) camYaw = camTo = camFrom = (45 + 90 * camStep) * DEG; }
      if (camTarget) camTarget.lerp(camGoal, 1 - Math.pow(0.0025, dt / 1000));
      if (shakeAmp > 0) { shakeT += dt; if (shakeT >= shakeDur) shakeAmp = 0; }
      placeCamera();
    }
    // screen direction (dx, dy with +y down) -> grid step [gx, gz] that best matches it on screen
    self.gridDirFromScreen = function (dx, dy) {
      if (!camera || !renderer) return Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
      var best = null, bd = -2, o = project(new THREE.Vector3(0, 0, 0));
      DIRS.forEach(function (d) { var p = project(new THREE.Vector3(d[0], 0, d[1])), vx = p.x - o.x, vy = p.y - o.y, l = Math.hypot(vx, vy) || 1, s = (vx * dx + vy * dy) / l; if (s > bd) { bd = s; best = d; } });
      return best.slice();
    };
    function project(v) { var p = v.clone().project(camera); return { x: (p.x + 1) / 2 * VW, y: (1 - p.y) / 2 * VH, z: p.z }; }
    self.project = function (x, y, z) { if (!camera) return { x: 0, y: 0 }; return project(new THREE.Vector3(x, y, z)); };
    self.tileToScreen = function (x, z) { if (!renderer) { var L = flatLayout(); return { x: L.ox + (x + 0.5) * L.cs, y: L.oy + (z + 0.5) * L.cs }; } if (!camera) return { x: (x + 0.5) * VW / W, y: (z + 0.5) * VH / H }; return project(new THREE.Vector3(wx(x), topY(x, z), wz(z))); };
    self.anchorOf = function (id) {
      var a = actors[id]; if (!a) return null;
      if (!renderer) { var L = flatLayout(), fx = L.ox + ((a.wxDraw != null ? a.wxDraw : a.wx) + W / 2) * L.cs, fy = L.oy + ((a.wzDraw != null ? a.wzDraw : a.wz) + H / 2) * L.cs, r = L.cs * 0.34; return { x: fx, top: fy - r, w: r * 2, h: r * 2, left: fx - r, footY: fy + r, cy: fy, dead: a.dead }; }
      var px = a.wxDraw != null ? a.wxDraw : a.wx, pz = a.wzDraw != null ? a.wzDraw : a.wz, py = a.wyDraw != null ? a.wyDraw : a.wy, h = a.restBox ? a.restBox.h : 0.86;
      var feet = project(new THREE.Vector3(px, py, pz)), head = project(new THREE.Vector3(px, py + h, pz)), side = project(new THREE.Vector3(px, py + h * 0.5, pz));
      var hh = Math.max(4, feet.y - head.y), ww = hh * 0.62;
      return { x: feet.x, top: head.y, w: ww, h: hh, left: feet.x - ww / 2, footY: feet.y, cy: side.y, dead: a.dead };
    };
    self.pickTile = function (sx, sy) {
      if (!renderer) { var L = flatLayout(), tx = Math.floor((sx - L.ox) / L.cs), tz = Math.floor((sy - L.oy) / L.cs); if (!T(tx, tz)) return null; for (var i = 0; i < order.length; i++) { var q = actors[order[i]]; if (!q.dead && q.x === tx && q.z === tz) return { x: tx, z: tz, unit: q.id }; } return { x: tx, z: tz }; }
      if (!camera || !terrainMesh) return null;
      var ndc = new THREE.Vector2(sx / VW * 2 - 1, -(sy / VH * 2 - 1)); raycaster.setFromCamera(ndc, camera);
      var picks = []; order.forEach(function (id) { var a = actors[id]; if (a.obj && !a.dead) picks.push(a.obj.pick); });
      var hu = raycaster.intersectObjects(picks, false); if (hu.length) { var a = actors[hu[0].object.userData.actor]; if (a) return { x: a.x, z: a.z, unit: a.id }; }
      var hits = raycaster.intersectObject(terrainMesh, false); if (!hits.length) return null;
      var h = hits[0], p = h.point.clone(); if (h.face) p.addScaledVector(h.face.normal, -0.02);
      var tl = tileAtWorld(p.x, p.z); return T(tl.x, tl.z) ? tl : null;
    };

    // ---------------- sizing + render
    self.resize = function (w, h, ratio) {
      cssW = Math.max(1, w | 0); cssH = Math.max(1, h | 0); dpr = num(ratio, 1);
      if (renderer) { renderer.setPixelRatio(dpr); renderer.setSize(cssW, cssH, false); }
      else if (canvas) { canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr); }
      if (overlay) { overlay.width = Math.round(cssW * dpr); overlay.height = Math.round(cssH * dpr); }
      placeCamera();
    };
    self.overlayContext = function () { // cleared 2D overlay context, transformed to logical view px
      if (!octx) return null; octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, overlay.width, overlay.height);
      octx.setTransform(overlay.width / VW, 0, 0, overlay.height / VH, 0, 0);
      if (!renderer && fallbackPending) { fallbackPending = false; try { drawFallback(); } catch (e) { warnOnce(self, 'fb', 'fallback draw: ' + e.message); } }
      return octx;
    };
    self.update = function (dtMs) {
      var dt = Math.max(0, num(dtMs, 0)); clock += dt;
      try {
        for (var i = 0; i < order.length; i++) stepAnim(actors[order[i]], dt);
        for (i = projectiles.length - 1; i >= 0; i--) {
          var pr = projectiles[i]; pr.t += dt; var u = clamp(pr.t / pr.dur, 0, 1);
          var pos = new THREE.Vector3().lerpVectors(pr.from, pr.to, u); pos.y += pr.arc * 4 * u * (1 - u);
          var dir = new THREE.Vector3().subVectors(pos, pr.obj.position); if (dir.lengthSq() > 1e-8) pr.obj.lookAt(pos.clone().add(dir));
          pr.obj.position.copy(pos);
          if (u >= 1) { burst(pr.to, pr.kind === 'arrow' ? 0xfff0b0 : 0xff8cf0, 10); disposeGroup(pr.obj); projectiles.splice(i, 1); safe(pr.onHit); }
        }
        for (i = sparks.length - 1; i >= 0; i--) {
          var sp = sparks[i]; sp.t += dt; var k = sp.t / sp.dur, d = dt / 1000;
          sp.s.position.x += sp.v[0] * d; sp.s.position.y += sp.v[1] * d; sp.s.position.z += sp.v[2] * d; sp.v[1] -= 6 * d;
          sp.s.material.opacity = 1 - k; sp.s.scale.setScalar(0.24 * (1 - k * 0.6));
          if (k >= 1) { fxGroup.remove(sp.s); sp.s.material.dispose(); sparks.splice(i, 1); }
        }
        if (has3D) { updateCamera(dt); updateOverlays(); }
        computePassing();
        for (i = 0; i < order.length; i++) poseActor(actors[order[i]], dt);
        if (has3D && camera) updateOccluders(dt);
      } catch (e) { warnOnce(self, 'update', 'update error: ' + (e && e.stack || e)); }
    };
    self.time = function () { return clock; };
    self.render = function () {
      try {
        if (renderer) {
          renderer.render(scene, camera);
          if (P.xray !== 'off' && xrayNeeded) {   // only when a living unit is behind terrain (props in front fade instead)
            var bg = scene.background, fog = scene.fog, ac = renderer.autoClear, su = renderer.shadowMap.autoUpdate;
            scene.background = null; scene.fog = null; renderer.autoClear = false; renderer.shadowMap.autoUpdate = false;
            xray = xray || { depth: new THREE.MeshBasicMaterial({ colorWrite: false }), a: new THREE.MeshBasicMaterial({ color: TEAM.a.ring, transparent: true, opacity: 0.5, depthFunc: THREE.GreaterDepth, depthWrite: false }), b: new THREE.MeshBasicMaterial({ color: TEAM.b.ring, transparent: true, opacity: 0.5, depthFunc: THREE.GreaterDepth, depthWrite: false }) };
            renderer.clearDepth(); scene.overrideMaterial = xray.depth; camera.layers.set(3); renderer.render(scene, camera);
            scene.overrideMaterial = xray.a; camera.layers.set(1); renderer.render(scene, camera);
            scene.overrideMaterial = xray.b; camera.layers.set(2); renderer.render(scene, camera);
            scene.overrideMaterial = null; camera.layers.set(0); scene.background = bg; scene.fog = fog; renderer.autoClear = ac; renderer.shadowMap.autoUpdate = su;
          }
          return;
        }
        fallbackPending = true; // drawn by overlayContext(), right after it clears the overlay
      } catch (e) { warnOnce(self, 'render', 'render error: ' + e.message); }
    };
    var fallbackPending = false;
    function flatLayout() { var cs = Math.min((VW - 80) / W, (VH - 200) / H); return { cs: cs, ox: (VW - cs * W) / 2, oy: 80 }; }
    var xray = null;
    function drawFallback() { // readable 2D top-down view when WebGL is missing
      if (!octx) return; var L = flatLayout(), g = octx, cs = L.cs, ox = L.ox, oy = L.oy;
      g.fillStyle = '#1c2230'; g.fillRect(0, 0, VW, VH);
      for (var z = 0; z < H; z++) for (var x = 0; x < W; x++) {
        var c = T(x, z), base = { g: [108, 154, 60], s: [150, 144, 134], d: [217, 192, 138], w: [63, 159, 184] }[c.t], l = 0.7 + c.h * 0.07;
        g.fillStyle = 'rgb(' + (base[0] * l | 0) + ',' + (base[1] * l | 0) + ',' + (base[2] * l | 0) + ')'; g.fillRect(ox + x * cs, oy + z * cs, cs - 1, cs - 1);
        if (c.prop) { g.fillStyle = 'rgba(30,40,20,0.7)'; g.beginPath(); g.arc(ox + (x + 0.5) * cs, oy + (z + 0.5) * cs, cs * 0.28, 0, 7); g.fill(); }
        if (c.t !== 'w') { g.fillStyle = 'rgba(0,0,0,0.45)'; g.font = '10px sans-serif'; g.fillText(String(c.h), ox + x * cs + 3, oy + z * cs + 11); }
      }
      ['move', 'attack', 'threat', 'target'].forEach(function (k) { var o = overlays[k]; if (!o) return; g.fillStyle = { move: 'rgba(71,168,255,0.45)', attack: 'rgba(255,80,64,0.4)', threat: 'rgba(255,122,42,0.35)', target: 'rgba(255,208,64,0.5)' }[k]; (o.tiles || []).forEach(function (t) { g.fillRect(ox + t.x * cs, oy + t.z * cs, cs - 1, cs - 1); }); });
      if (pathTiles) { g.strokeStyle = '#ffe27a'; g.lineWidth = 3; g.beginPath(); pathTiles.forEach(function (p, i) { var X = ox + (p.x + 0.5) * cs, Y = oy + (p.z + 0.5) * cs; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }); g.stroke(); }
      order.forEach(function (id) { var a = actors[id]; if (a.dead && a.alpha <= 0) return; var X = ox + (a.wxDraw + W / 2) * cs, Y = oy + (a.wzDraw + H / 2) * cs; g.globalAlpha = a.dead ? 0.35 : 1;
        g.fillStyle = a.side === 'a' ? '#3a7be0' : '#d0453a'; g.beginPath(); g.arc(X, Y, cs * 0.34, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
        g.beginPath(); g.moveTo(X, Y); g.lineTo(X + Math.sin(a.yaw) * cs * 0.45, Y + Math.cos(a.yaw) * cs * 0.45); g.stroke(); g.fillStyle = '#fff'; g.font = 'bold 11px sans-serif'; g.textAlign = 'center'; g.fillText(a.cls[0].toUpperCase(), X, Y + 4); g.textAlign = 'left'; g.globalAlpha = 1; });
      if (cursorTile) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(ox + cursorTile.x * cs, oy + cursorTile.z * cs, cs - 1, cs - 1); }
      g.fillStyle = '#ffd98a'; g.font = 'bold 14px sans-serif'; g.textAlign = 'center'; g.fillText('3D view unavailable (' + String(self.error || 'WebGL missing').replace(/\.$/, '') + '). Showing a 2D map.', VW / 2, VH - 112); g.textAlign = 'left';
    }
    self.setParams = function (o) {
      var rebuild = false; o = o || {};
      ['light', 'decor', 'quality'].forEach(function (k) { if (o[k] != null && o[k] !== P[k]) rebuild = true; });
      Object.assign(P, o);
      if (o.camStep != null) self.setCamStep(o.camStep);
      if (o.grid != null && gridLines) { gridLines.material.opacity = num(o.grid, 0.22); gridLines.visible = num(o.grid, 0) > 0; }
      if (o.shadows != null && renderer) { renderer.shadowMap.enabled = P.shadows !== 'off'; if (sun) sun.castShadow = P.shadows !== 'off'; scene.traverse(function (x) { if (x.material) (Array.isArray(x.material) ? x.material : [x.material]).forEach(function (m) { m.needsUpdate = true; }); }); }
      if (o.unitHeight != null) { order.forEach(function (id) { var a = actors[id]; if (!a.obj || a.obj.built.custom) return; var spec = { id: a.id, side: a.side, cls: a.cls, x: a.x, z: a.z, colors: a.colors }; var y = a.yaw, d = a.dim, dead = a.dead; disposeGroup(a.obj.root); makeActorObject(a); a.yaw = y; a.dim = d; a.dead = dead; if (dead) { a.obj.root.visible = false; } }); }
      if (rebuild && has3D) buildWorld();
      placeCamera();
    };
    self.rebuildMap = function (m) { map = parseMap(m); self.map = map; W = map.w; H = map.h; self.size = { w: W, h: H }; if (has3D) buildWorld(); };

    // ---------------- text state (facing measured on the model's actual world forward)
    var _nose = null, _fb = null;
    self.state = function () {
      var out = [];
      order.forEach(function (id) {
        var a = actors[id], rec = { id: a.id, side: a.side, cls: a.cls, tile: [a.x, a.z], x: +(a.wxDraw != null ? a.wxDraw : a.wx).toFixed(3), z: +(a.wzDraw != null ? a.wzDraw : a.wz).toFixed(3),
          yaw: +a.yaw.toFixed(4), anim: a.anim ? a.anim.kind : 'idle', moveDir: a.moveDir ? a.moveDir.slice() : null, target: a.target || null, facesMove: null, facesTarget: null, airborne: !!a.airborne };
        if (a.obj) {
          _nose = _nose || new THREE.Vector3(); a.obj.built.P.nose.getWorldDirection(_nose);
          rec.forward = [+_nose.x.toFixed(3), +_nose.z.toFixed(3)];
          if (a.moveDir) { rec.moveAngle = +angleDeg(_nose, a.moveDir).toFixed(1); rec.facesMove = rec.moveAngle <= 15; }
          if (a.target && actors[a.target]) { var b = actors[a.target], tv = [b.wx - (a.wxDraw != null ? a.wxDraw : a.wx), b.wz - (a.wzDraw != null ? a.wzDraw : a.wz)]; rec.targetAngle = +angleDeg(_nose, tv).toFixed(1); rec.facesTarget = rec.targetAngle <= 15; }
          var fb = boxOf(THREE, a.obj.holder, a.dead ? sizeFilter : footFilter, _fb || (_fb = new THREE.Box3()));
          rec.feetY = +fb.min.y.toFixed(4);
          var tl = tileAtWorld(rec.x, rec.z); rec.tileTop = +topY(tl.x, tl.z).toFixed(4);
          rec.feetOk = a.dead || rec.airborne ? null : Math.abs(rec.feetY - rec.tileTop) < 0.01;
        }
        if (a.dead) { rec.noFace = 'defeated'; rec.alpha = +a.alpha.toFixed(2);
          if (a.obj && a.alpha > 0.02) { var cb = boxOf(THREE, a.obj.holder, sizeFilter); rec.bodyBox = [+cb.min.x.toFixed(3), +cb.max.x.toFixed(3), +cb.min.z.toFixed(3), +cb.max.z.toFixed(3)]; rec.tileBox = [wx(a.x) - 0.5, wx(a.x) + 0.5, wz(a.z) - 0.5, wz(a.z) + 0.5]; } }
        out.push(rec);
      });
      return { t: Math.round(clock), camStep: camStep, actors: out };
    };
    function angleDeg(nose, v) { var l1 = Math.hypot(nose.x, nose.z), l2 = Math.hypot(v[0], v[1]); if (!l1 || !l2) return 180; var c = (nose.x * v[0] + nose.z * v[1]) / (l1 * l2); return Math.acos(clamp(c, -1, 1)) / DEG; }

    if (has3D) { self.resize(cssW, cssH, 1); self.focus(null, null, true); placeCamera(); }
    return self;
  }

  root.GameDNA_TacticsGrid3D = { create: create, version: VERSION, FACING_OFFSET: FACING_OFFSET, TERRAIN: TER, LOOKS: Object.keys(LOOKS), MOODS: Object.keys(MOODS), LEVEL: LEVEL };
})(typeof window !== 'undefined' ? window : this);

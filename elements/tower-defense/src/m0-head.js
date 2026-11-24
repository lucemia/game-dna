/* GameDNA_TowerDefense v1.1.1 - A-16 Tower placement & wave spawner (Game DNA library, system element).
 * One plain script, no dependencies, no import / export. One global: GameDNA_TowerDefense. Source is ASCII only.
 *
 * Enemies walk a fixed road (one or more paths through a grid, given as waypoint cells); towers go on the grass cells
 * beside it, never on the road, so the road can never be blocked. Waves are data (groups of enemies with a count, a gap
 * and a path) and the next wave is previewed. Four built-in tower types (single shot, splash, slow, chain), three levels
 * each, a targeting priority per tower (first, strong, near), gold, lives, speed x1 / x2, win / lose.
 * Seeded and frame-stepped: the same seed and the same inputs give the same game, frame for frame.
 *
 *   var td = GameDNA_TowerDefense.create({view, map, waves, towers, enemies, seed, params, onHit, onEvent, onEnd});
 *   td.update(stepMs)        every fixed step (0 while frozen); speed x2 runs two simulation steps per call
 *   td.drawScene(ctx)        ground, road, towers, enemies, projectiles, effects (the host's effects go after it)
 *   td.drawUI(ctx)           range ring, placement ghost, top bar, side panel, wave preview, banners
 *   td.key(k) / td.pointer(type, x, y)   input in the host's logical px
 *   API in module/README.md.
 */
(function (root) {
  'use strict';
  var VERSION = '1.1.1';
  var SW = 640, SH = 360;                     // the module's stage (scaled into options.view)
  var CELL = 32, MAPX = 8, MAPY = 36;         // map cell size and top-left of the map on the stage
  var STEP = 1000 / 60;
  var TAU = Math.PI * 2;

  /* ---------- small helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  function ease(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function easeOut(u) { u = clamp(u, 0, 1); return 1 - (1 - u) * (1 - u) * (1 - u); }
  function backOut(u) { u = clamp(u, 0, 1); var c = 1.9; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); }
  function dist(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); }
  function copy(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function hash(x, y, s) { var n = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul((s | 0) + 1, 83492791); n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); n ^= n >>> 15; return (n >>> 0) / 4294967296; }
  function rng(seed) {   // mulberry32
    var a = seed >>> 0 || 1;
    var f = function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    f.state = function () { return a; }; f.set = function (s) { a = s >>> 0; };
    return f;
  }
  var RGBC = {};
  function rgb(h) {
    var v = RGBC[h]; if (v) return v;
    if (h.charAt(0) === '#') { var s = h.slice(1); if (s.length === 3) s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2); var n = parseInt(s, 16); v = [n >> 16, (n >> 8) & 255, n & 255]; }
    else { var m = h.match(/[\d.]+/g) || [0, 0, 0]; v = [+m[0], +m[1], +m[2]]; }
    return (RGBC[h] = v);
  }
  function mix(a, b, t) { var x = rgb(a), y = rgb(b); return 'rgb(' + Math.round(lerp(x[0], y[0], t)) + ',' + Math.round(lerp(x[1], y[1], t)) + ',' + Math.round(lerp(x[2], y[2], t)) + ')'; }
  function rgba(h, a) { var x = rgb(h); return 'rgba(' + x[0] + ',' + x[1] + ',' + x[2] + ',' + a + ')'; }
  function safe(fn, args, label) { if (typeof fn !== 'function') return undefined; try { return fn.apply(null, args); } catch (e) { warn(label || 'callback', e); return undefined; } }
  var warned = {};
  function warn(label, e) { var k = label + ':' + (e && e.message); if (warned[k]) return; warned[k] = 1; if (typeof console !== 'undefined') console.warn('GameDNA_TowerDefense ' + label + ': ' + (e && e.message)); }

  var FONT = '"Trebuchet MS", "Segoe UI", system-ui, -apple-system, sans-serif';
  // text with an optional dark outline; o = {size, weight, align, base, color, ow (outline width), oc, ls (letter spacing), alpha, maxW}
  function text(g, s, x, y, o) {
    o = o || {}; s = String(s);
    g.save();
    g.font = (o.weight || 700) + ' ' + (o.size || 11) + 'px ' + FONT;
    g.textAlign = o.align || 'left'; g.textBaseline = o.base || 'middle';
    if (o.alpha != null) g.globalAlpha *= o.alpha;
    if (o.ls && 'letterSpacing' in g) g.letterSpacing = o.ls + 'px';
    var w = g.measureText(s).width;
    if (o.maxW && w > o.maxW) { var sc = o.maxW / w; g.translate(x, y); g.scale(sc, 1); x = 0; y = 0; }
    if (o.ow) { g.lineJoin = 'round'; g.lineWidth = o.ow; g.strokeStyle = o.oc || 'rgba(12,10,20,0.92)'; g.strokeText(s, x, y); }
    g.fillStyle = o.color || '#fff'; g.fillText(s, x, y);
    g.restore();
    return w;
  }
  function measure(g, s, size, weight) { g.save(); g.font = (weight || 700) + ' ' + size + 'px ' + FONT; var w = g.measureText(String(s)).width; g.restore(); return w; }
  function rr(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else { g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); } }

  /* =================================================================================================
     Built-in content (plain data). A host adds its own entries with the same fields; see module/README.md.

     Tower: {name, kind: 'single' | 'splash' | 'slow' | 'chain', look, color, cost, priority (default targeting),
             air: true (can hit flyers), ground: true, levels: [{cost (upgrade price; level 0 = build price), damage,
             range (cells), rate (shots / s), splash (cells), slow (0..1), slowMs, chain (extra jumps), falloff,
             jump (cells), type ('physical' | 'fire' | 'frost' | 'shock'), pierce (ignores armour), speed (projectile
             px / s)}], text}
     Enemy: {name, look, palette, hp, speed (cells / s), armor, reward (gold), leak (lives lost), size (px radius),
             flying, boss, onDeath: {spawn: id, n}, text}
     ================================================================================================= */
  var TOWERS = {
    bolt: { name: 'Bolt Tower', kind: 'single', look: 'bolt', color: '#e8c070', priority: 'first', air: true, ground: true,
      text: 'Fast single shots. Hits flyers.',
      levels: [
        { cost: 50, damage: 14, range: 2.6, rate: 1.6, type: 'physical', speed: 520 },
        { cost: 45, damage: 22, range: 2.85, rate: 1.8, type: 'physical', speed: 560 },
        { cost: 80, damage: 34, range: 3.1, rate: 2.1, type: 'physical', speed: 600 }] },
    mortar: { name: 'Ember Mortar', kind: 'splash', look: 'mortar', color: '#ff8a4a', priority: 'first', air: false, ground: true,
      text: 'Lobbed shells burst on the road. Ground only.',
      levels: [
        { cost: 80, damage: 24, range: 3.0, rate: 0.55, splash: 0.95, type: 'fire', speed: 230 },
        { cost: 70, damage: 38, range: 3.2, rate: 0.62, splash: 1.05, type: 'fire', speed: 240 },
        { cost: 110, damage: 58, range: 3.5, rate: 0.7, splash: 1.15, type: 'fire', speed: 250 }] },
    frost: { name: 'Frost Spire', kind: 'slow', look: 'frost', color: '#8fd8ff', priority: 'first', air: true, ground: true,
      text: 'Chills a foe: it walks slower for a while.',
      levels: [
        { cost: 60, damage: 5, range: 2.4, rate: 1.0, slow: 0.4, slowMs: 1600, type: 'frost', pierce: true, speed: 380 },
        { cost: 50, damage: 8, range: 2.6, rate: 1.1, slow: 0.5, slowMs: 1800, type: 'frost', pierce: true, speed: 400 },
        { cost: 80, damage: 12, range: 2.85, rate: 1.2, slow: 0.6, slowMs: 2000, type: 'frost', pierce: true, speed: 420 }] },
    storm: { name: 'Storm Coil', kind: 'chain', look: 'storm', color: '#b8a4ff', priority: 'first', air: true, ground: true,
      text: 'Lightning that leaps to nearby foes.',
      levels: [
        { cost: 110, damage: 18, range: 2.5, rate: 0.8, chain: 2, jump: 1.4, falloff: 0.75, type: 'shock', pierce: true },
        { cost: 80, damage: 27, range: 2.7, rate: 0.9, chain: 3, jump: 1.5, falloff: 0.75, type: 'shock', pierce: true },
        { cost: 130, damage: 40, range: 3.0, rate: 1.0, chain: 4, jump: 1.6, falloff: 0.78, type: 'shock', pierce: true }] }
  };
  var ENEMIES = {
    mite: { name: 'Bramble Mite', look: 'beetle', hp: 55, speed: 1.2, armor: 0, reward: 4, leak: 1, size: 7,
      palette: { shell: '#5f9a3a', dark: '#2c4a1e', light: '#b6e070', belly: '#2a2a1c', eye: '#ffe27a' }, text: 'Small and quick.' },
    crawler: { name: 'Rust Crawler', look: 'beetle', hp: 132, speed: 0.9, armor: 2, reward: 6, leak: 1, size: 9.5,
      palette: { shell: '#b0582e', dark: '#4e2214', light: '#f0a060', belly: '#2e1e18', eye: '#ffd060', spots: '#6e2a14' }, text: 'Armoured shell (-2 per hit).' },
    skitter: { name: 'Skitterling', look: 'spider', hp: 40, speed: 2.0, armor: 0, reward: 3, leak: 1, size: 7,
      palette: { shell: '#55447a', dark: '#211a33', light: '#a490d8', belly: '#1a1426', eye: '#ff6a8a' }, text: 'Very fast, fragile.' },
    moth: { name: 'Dusk Moth', look: 'moth', hp: 77, speed: 1.35, armor: 0, reward: 5, leak: 1, size: 8, flying: true,
      palette: { shell: '#c9a06a', dark: '#5a3e24', light: '#f4dcae', belly: '#7a5a3a', eye: '#2a1a12', wing: '#8a6aa8' }, text: 'Flies: the mortar cannot hit it.' },
    shell: { name: 'Moss Shellback', look: 'shellback', hp: 484, speed: 0.55, armor: 6, reward: 16, leak: 2, size: 13,
      palette: { shell: '#5e7a52', dark: '#26341f', light: '#a8c48a', belly: '#4a3c2a', eye: '#ffe27a', moss: '#7fbf4a' }, text: 'Heavy armour (-6 per hit). Costs 2 lives.' },
    matron: { name: 'Brood Matron', look: 'matron', hp: 3300, speed: 0.38, armor: 4, reward: 120, leak: 10, size: 20, boss: true,
      palette: { shell: '#7a2e5e', dark: '#2e0f24', light: '#e078b0', belly: '#24101c', eye: '#ffe066', horn: '#f0d8a0' },
      onDeath: { spawn: 'mite', n: 4 }, text: 'Boss. Releases four mites when she falls.' }
  };
  var PRIORITIES = ['first', 'strong', 'near'];
  var PRIORITY_LABEL = { first: 'First', strong: 'Strong', near: 'Near' };

  /* Built-in map (16 x 10 cells). Map rows: '.' grass (buildable), ',' grass (buildable, flowers), 'T' tree, 'r' rock,
     'w' water, 'b' bush, 'x' not buildable (open ground). The road is NOT in the rows: it comes from paths (waypoint
     cells, each step a straight horizontal or vertical run; a waypoint may lie one cell outside the map = entry / exit). */
  var MAPS = {
    millbrook: {
      name: 'Millbrook Road', gold: 200, lives: 20, theme: 'meadow',
      rows: [
        'TT..,....T..r..T',
        'T..,...b.....,.T',
        '..,..........b..',
        '.....r..,.......',
        'b.......,ww.....',
        '...,.....ww.....',
        '.,.....,.....,..',
        '.r.............T',
        'T.....b..,..,..T',
        'TT..,.....r...TT'],
      paths: [[[-1, 2], [3, 2], [3, 7], [7, 7], [7, 3], [11, 3], [11, 7], [14, 7], [14, 4], [16, 4]]]
    },
    switchback: {
      name: 'Switchback Hollow', gold: 200, lives: 20, theme: 'meadow',
      rows: [
        'TT...,....T...TT',
        '..............b.',
        'T..r.....,.....T',
        '.....,....b.....',
        'b...............',
        '....,.....ww...T',
        'r.......r.ww....',
        '................',
        'T...,....r....,T',
        'TTT....T...b..TT'],
      paths: [[[-1, 1], [13, 1], [13, 4], [2, 4], [2, 7], [16, 7]]]
    },
    twinford: {
      name: 'Twin Fords', gold: 220, lives: 20, theme: 'meadow',
      rows: [
        'TTT..,...T...TTT',
        '......b.....r..T',
        'T.,......,..,...',
        '..r.......,..b..',
        '.,,.........w...',
        'b..........ww...',
        '..T........w...T',
        '.....,.r........',
        '.....,.,..,..b..',
        'TT...b...T....TT'],
      paths: [[[-1, 1], [5, 1], [5, 4], [10, 4], [10, 7], [16, 7]],
              [[-1, 8], [3, 8], [3, 6], [7, 6], [7, 4], [10, 4], [10, 7], [16, 7]]]
    }
  };
  // a wave: {groups: [{enemy, count, gap (s between spawns), delay (s after the wave starts), path (index, or 'alt' = take turns)}],
  //          reward (gold when every foe of it is gone), hp (multiplier on its foes' HP), name (optional banner line)}
  var WAVES = [
    { groups: [{ enemy: 'mite', count: 8, gap: 0.9 }], reward: 20 },
    { groups: [{ enemy: 'mite', count: 10, gap: 0.7 }, { enemy: 'skitter', count: 4, gap: 0.8, delay: 4 }], reward: 25 },
    { groups: [{ enemy: 'crawler', count: 6, gap: 1.2 }, { enemy: 'mite', count: 8, gap: 0.6, delay: 3 }], reward: 30, hp: 1.1 },
    { groups: [{ enemy: 'moth', count: 9, gap: 0.8 }, { enemy: 'skitter', count: 8, gap: 0.45, delay: 2 }], reward: 30, hp: 1.15 },
    { groups: [{ enemy: 'shell', count: 2, gap: 4 }, { enemy: 'crawler', count: 9, gap: 0.85, delay: 1.5 }], reward: 40, hp: 1.2 },
    { groups: [{ enemy: 'skitter', count: 18, gap: 0.33 }, { enemy: 'moth', count: 8, gap: 0.7, delay: 3 }], reward: 40, hp: 1.3 },
    { groups: [{ enemy: 'crawler', count: 12, gap: 0.7 }, { enemy: 'shell', count: 3, gap: 3, delay: 2 }, { enemy: 'mite', count: 14, gap: 0.35, delay: 6 }], reward: 50, hp: 1.4 },
    { groups: [{ enemy: 'moth', count: 14, gap: 0.6 }, { enemy: 'crawler', count: 10, gap: 0.7, delay: 2 }], reward: 50, hp: 1.55 },
    { groups: [{ enemy: 'shell', count: 5, gap: 2.2 }, { enemy: 'skitter', count: 20, gap: 0.3, delay: 1 }, { enemy: 'crawler', count: 8, gap: 0.8, delay: 5 }], reward: 60, hp: 1.7 },
    { groups: [{ enemy: 'matron', count: 1, gap: 1 }, { enemy: 'crawler', count: 10, gap: 0.9, delay: 3 }, { enemy: 'moth', count: 10, gap: 0.8, delay: 7 }, { enemy: 'shell', count: 3, gap: 3, delay: 10 }], reward: 0, hp: 1.8, name: 'The Brood Matron' }
  ];


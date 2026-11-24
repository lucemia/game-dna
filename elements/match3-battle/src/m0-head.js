/* GameDNA_Match3Battle v1.3.0 - A-17 Match-3 battle board (Game DNA library, system element).
 * One plain script, no dependencies, no import / export. One global: GameDNA_Match3Battle. Source is ASCII only.
 *
 * A party of heroes fights waves of foes by swapping gems on an 8 x 8 board. Three or more in a row clear and the gems
 * above fall (cascades, each one worth more); 4 in a row leaves a Row / Column shard, an L or T a Blast gem, 5 in a row a
 * Prism (swap it with a colour to clear that colour). Every colour feeds the hero of that colour: the hero attacks with
 * it and charges a skill; hearts heal the party. Foes count down and attack when they reach 0. Boards never start with a
 * match, there is always a move (or the board reshuffles), and everything is seeded and frame-stepped: the same seed and
 * the same inputs give the same battle, frame for frame, at any view size.
 *
 *   var m3 = GameDNA_Match3Battle.create({view, seed, heroes, gems, skills, enemies, params, drawActor, drawIcon,
 *                                          onHit, onEvent, onEnd});
 *   m3.start({waves: [['slime', 'slime'], ['wolf']], seed, name})
 *   m3.update(stepMs)        every fixed step (0 while frozen)
 *   m3.drawScene(ctx)        stage (backdrop hook, heroes, foes, attacks), board, gems, board effects
 *   m3.drawUI(ctx)           top bar, hero cards, party bar, foe plates and countdowns, banners, numbers
 *   m3.key(k) / m3.pointer(type, x, y)   input in the host's logical px
 *   API in module/README.md.
 */
(function (root) {
  'use strict';
  var VERSION = '1.3.0';
  var STEP = 1000 / 60, TAU = Math.PI * 2;

  /* ---------- small helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  function ease(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function easeOut(u) { u = clamp(u, 0, 1); return 1 - (1 - u) * (1 - u) * (1 - u); }
  function easeIn(u) { u = clamp(u, 0, 1); return u * u; }
  function backOut(u) { u = clamp(u, 0, 1); var c = 1.7; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); }
  function copy(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function hash(x, y, s) { var n = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul((s | 0) + 1, 83492791); n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); n ^= n >>> 15; return (n >>> 0) / 4294967296; }
  function rng(seed) {   // mulberry32; f.state() / f.set(s) save and restore it
    var a = seed >>> 0 || 1;
    var f = function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    f.state = function () { return a; }; f.set = function (s) { a = s >>> 0; };
    return f;
  }
  function hex2rgb(h) { var n = parseInt(String(h).replace('#', ''), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function rgba(h, a) { var c = hex2rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mix(h1, h2, t) { var a = hex2rgb(h1), b = hex2rgb(h2); return 'rgb(' + Math.round(lerp(a[0], b[0], t)) + ',' + Math.round(lerp(a[1], b[1], t)) + ',' + Math.round(lerp(a[2], b[2], t)) + ')'; }
  function rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function inRect(p, r) { return r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
  function overlap(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }

  var FONT = '"Trebuchet MS", "Segoe UI", system-ui, -apple-system, sans-serif';
  /* text with an outline; o = {size, weight, align, base, color, ow (outline px), oc, ls, max (shrink to fit width)}.
     Every call is recorded in TEXT_LOG (when a check turns it on) with its box and size in the caller's units. */
  var TEXT_LOG = null, MIN_FONT = 0;   // MIN_FONT: the tall layout never draws HUD text under 16 logical px (11 CSS px on a 390 px phone)
  function txt(g, s, x, y, o) {
    o = o || {}; s = String(s);
    var size = Math.max(o.size || 12, MIN_FONT), weight = o.weight || 800;
    g.save(); g.font = weight + ' ' + size + 'px ' + FONT; g.textAlign = o.align || 'left'; g.textBaseline = o.base || 'middle';
    var w = g.measureText(s).width;
    // fit to o.max: shrink to the floor, then condense horizontally (to 78%), then cut with an ellipsis
    var cx = 1;
    if (o.max && w > o.max) { size = Math.max(MIN_FONT || 6, size * o.max / w); g.font = weight + ' ' + size + 'px ' + FONT; w = g.measureText(s).width; }
    if (o.max && w > o.max) { cx = Math.max(0.78, o.max / w); }
    if (o.max && w * cx > o.max) { while (s.length > 2 && g.measureText(s + '\u2026').width * cx > o.max) s = s.slice(0, -1); s = s.replace(/\s+$/, '') + '\u2026'; w = g.measureText(s).width; }
    if (cx !== 1) { g.translate(x, 0); g.scale(cx, 1); g.translate(-x, 0); }
    if (o.ow) { g.lineJoin = 'round'; g.lineWidth = o.ow; g.strokeStyle = o.oc || 'rgba(12,8,6,0.92)'; g.strokeText(s, x, y); }
    g.fillStyle = o.color || '#fff'; g.fillText(s, x, y);
    if (TEXT_LOG) {
      var T = g.getTransform(), al = g.textAlign, bx = al === 'center' ? x - w / 2 : al === 'right' ? x - w : x;
      var by = g.textBaseline === 'middle' ? y - size * 0.5 : g.textBaseline === 'top' ? y : y - size * 0.8, sy = Math.abs(T.d) || 1;
      TEXT_LOG.push({ s: s, x: T.a * bx + T.c * by + T.e, y: T.b * bx + T.d * by + T.f, w: w * T.a, h: size * sy, px: size * sy, cx: cx, alpha: g.globalAlpha, tag: o.tag || '' });
    }
    g.restore();
    return w;
  }

  /* ---------- content (plain data; hosts add their own) ---------- */
  /* gem: {name, shape, colors: [dark, base, light, glint], role, weight, text}
       shape: 'cushion' | 'drop' | 'hex' | 'star' | 'heart' | 'tri' | 'oval' | 'kite' | 'round' | 'moon' (a distinct
       silhouette per colour, so the board reads without colour); or draw(ctx, x, y, r, t) for custom art.
       role: 'hero' (powers and charges the hero whose gem it is), 'heal' (heals the party, `power` = share of max HP per
       gem), 'strike' (`power` damage per gem straight to the target), 'ward' (`power` ward per gem); or
       onClear(api, info) -> called once per turn with {count, weight} for custom effects.
       weight: spawn weight (0 = never spawns, only made by skills). */
  var GEMS = {
    ember: { name: 'Ember', shape: 'cushion', colors: ['#4a0a10', '#d6283a', '#ff8f7a', '#fff2ea'], role: 'hero', weight: 1, text: 'Fuels the Knight' },
    tide: { name: 'Tide', shape: 'drop', colors: ['#0a2662', '#2878e6', '#8fd2ff', '#f0fbff'], role: 'hero', weight: 1, text: 'Fuels the Herbalist' },
    grove: { name: 'Grove', shape: 'hex', colors: ['#0a3618', '#22a446', '#a2f28a', '#f2ffe8'], role: 'hero', weight: 1, text: 'Fuels the Archer' },
    spark: { name: 'Spark', shape: 'star', colors: ['#5e3a00', '#eeb012', '#fff09a', '#fffdf0'], role: 'hero', weight: 1, text: 'Fuels the Keeper' },
    heart: { name: 'Heart', shape: 'heart', colors: ['#560a34', '#e8448e', '#ffb2d6', '#fff2f8'], role: 'heal', power: 0.018, weight: 1, text: 'Heals the party' }
  };
  /* hero: {name, gem, atk, hp, skill, look, attack: 'leap' | 'arrow' | 'orb' | 'bolt', h (height multiple)} */
  var HEROES = {
    knight: { name: 'Knight', gem: 'ember', atk: 15, hp: 190, skill: 'valor', look: 'knight', attack: 'leap', icon: 'sword' },
    archer: { name: 'Archer', gem: 'grove', atk: 13, hp: 140, skill: 'volley', look: 'archer', attack: 'arrow', icon: 'bow' },
    herbalist: { name: 'Herbalist', gem: 'tide', atk: 11, hp: 130, skill: 'bloom', look: 'herbalist', attack: 'orb', icon: 'regen' },
    keeper: { name: 'Keeper', gem: 'spark', atk: 12, hp: 160, skill: 'ward', look: 'keeper', attack: 'bolt', icon: 'guard' }
  };
  /* skill: {name, cost (gems of its hero's colour), text, icon, fx: 'slash' | 'arrows' | 'bloom' | 'light' | 'burst',
       effects: [{damage: x attack, target: 'one' | 'all'}, {heal: share of max HP}, {convert: {to: gemId, count, from?}},
                 {delay: turns (all foes)}, {ward: points}, {make: {sp: 'h' | 'v' | 'bomb' | 'prism', count}}]
       or run(api) for custom code (api in module/README.md). */
  var SKILLS = {
    valor: { name: 'Valor Strike', cost: 18, text: 'Hits the target for 4.5x attack', icon: 'sword', fx: 'slash', effects: [{ damage: 4.5, target: 'one' }] },
    volley: { name: 'Arrow Rain', cost: 18, text: '2.2x attack to every foe', icon: 'bow', fx: 'arrows', effects: [{ damage: 2.2, target: 'all' }] },
    bloom: { name: 'Mending Bloom', cost: 16, text: 'Heals 30% and makes 4 Hearts', icon: 'regen', fx: 'bloom', effects: [{ heal: 0.3 }, { convert: { to: 'heart', count: 4 } }] },
    ward: { name: 'Lantern Ward', cost: 20, text: 'Foes wait a turn; ward 40', icon: 'guard', fx: 'light', effects: [{ delay: 1 }, { ward: 40 }] }
  };
  /* enemy: {name, look, hp, atk, every (turns between attacks), first (first countdown), weak (gem id: x1.5 damage),
       attack: 'leap' | 'bolt' | 'swoop' | 'slam', boltColor, h (height multiple of a hero), boss, special: {every, name, mult},
       tint: CSS filter for a recoloured look (e.g. 'hue-rotate(40deg)')} */
  var ENEMIES = {
    slime: { name: 'Moss Slime', look: 'slime', hp: 145, atk: 41, every: 2, weak: 'ember', attack: 'leap' },
    wolf: { name: 'Ash Wolf', look: 'wolf', hp: 195, atk: 58, every: 3, weak: 'spark', attack: 'leap' },
    imp: { name: 'Cinder Imp', look: 'imp', hp: 160, atk: 48, every: 2, weak: 'tide', attack: 'bolt', boltColor: '#ff8a2a' },
    wisp: { name: 'Grave Wisp', look: 'wisp', hp: 120, atk: 34, every: 2, first: 1, weak: 'spark', attack: 'bolt', boltColor: '#7af0d8' },
    harpy: { name: 'Gale Harpy', look: 'harpy', hp: 220, atk: 68, every: 3, weak: 'grove', attack: 'swoop' },
    skeleton: { name: 'Barrow Guard', look: 'skeleton', hp: 280, atk: 75, every: 3, weak: 'spark', attack: 'leap' },
    cultist: { name: 'Ash Cultist', look: 'cultist', hp: 240, atk: 58, every: 2, weak: 'grove', attack: 'bolt', boltColor: '#c86aff', special: { every: 2, name: 'Hex', mult: 1.6 } },
    golem: { name: 'Barrow Colossus', look: 'golem', hp: 1060, atk: 109, every: 3, weak: 'tide', attack: 'slam', boss: true, special: { every: 2, name: 'Quake', mult: 1.7 } }
  };
  var DEFAULTS = {
    cols: 8, rows: 8, party: ['knight', 'archer', 'herbalist', 'keeper'],
    combo: 0.25,           // each cascade step adds this to the gem weight (chain 1 = 1, chain 2 = 1.25, ...)
    weakMult: 1.5,         // damage against a foe weak to that colour
    specials: 'on',        // 'off': no Row / Column / Blast / Prism gems
    hints: 'on',           // a valid move wobbles after 6 s without input (never under autoplay)
    numbers: 'on',         // built-in damage and heal numbers ('off' when a number addon draws them)
    speed: 1,              // animation speed (1 = default; the rules never change)
    layout: 'auto'         // 'wide' (stage left, board right), 'tall' (stage on top, board below) or 'auto' (from the view)
  };

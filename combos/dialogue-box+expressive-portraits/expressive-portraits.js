/* GameDNA D-04 · Expressive portraits · module v1 (plain script, no dependencies, one global: GameDNA_Portraits)
 *
 *   // 1. Art: a portrait from a small seeded spec (missing parts come from the seed)
 *   const mira = GameDNA_Portraits.make({ seed: 7, name: 'Mira', hair: 'long', hairColor: 'auburn', headgear: 'circlet' });
 *   GameDNA_Portraits.draw(ctx, mira, x, y, { expr: 'happy', talking: true, t: ms, flip: false });   // 48x48 (or size) at native px
 *   GameDNA_Portraits.drawPanel(ctx, mira, { x, y }, { expr: 'angry', skin: 'pixel16', name: true });  // framed, with backdrop
 *
 *   // 2. Beside an H-01 dialogue box (only its public hooks: onLine, rect(), state()):
 *   const por = GameDNA_Portraits.create({ cast: { Mira: mira, Elder: { seed: 3, age: 'elder' } }, uiRects: () => [hud] });
 *   const dlg = GameDNA_DialogueBox.create({ bounds: () => por.reserve(FIELD), onLine: (l, i, c) => por.onLine(l, i, c), ... });
 *   por.attach(dlg);
 *   // every fixed step (also while the box is busy): por.update(1000 / 60);   draw pass: dlg.draw(ctx); por.draw(ctx);
 *   // lines: { speaker: 'Mira', expr: 'angry', text: '...' }   (expr: neutral happy angry sad surprised determined hurt)
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var EXPRESSIONS = ['neutral', 'happy', 'angry', 'sad', 'surprised', 'determined', 'hurt'];
  var DEFAULTS = { size: 48, frame: 'window', layout: 'left', enter: 'slide', enterMs: 160, listener: 'dim', blinkMs: 3600, mouthMs: 90,
    gap: 4, outline: 'ink', backdrop: 'tint', margin: 6 };
  var STEP = 1000 / 60;

  /* ---------------- colour helpers ---------------- */
  function hexRgb(h) {
    h = String(h || '#000').replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h.slice(0, 6), 16); if (!isFinite(n)) n = 0; return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function rgbHex(c) { return '#' + c.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function mix(a, b, k) { a = typeof a === 'string' ? hexRgb(a) : a; b = typeof b === 'string' ? hexRgb(b) : b; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
  function toHsl(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
    if (d) { s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
    return [h, s, l];
  }
  function fromHsl(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
    if (!s) return [l * 255, l * 255, l * 255];
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    var f = function (t) { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }
  function lum(c) { return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; }
  function toward(h, target, amt) { var d = ((target - h + 540) % 360) - 180; return h + (d < 0 ? -1 : 1) * Math.min(Math.abs(d), amt); }
  // 5-step hue-shifted ramp from a mid colour: shadows lean cool, highlights lean warm (dark -> light)
  function ramp(base) {
    var c = toHsl(hexRgb(base)), out = [], dl = [-0.27, -0.14, 0, 0.12, 0.24], dh = [16, 8, 0, 6, 12], ds = [0.08, 0.05, 0, -0.03, -0.1];
    for (var k = 0; k < 5; k++) out.push(fromHsl(k < 2 ? toward(c[0], 250, dh[k]) : k > 2 ? toward(c[0], 55, dh[k]) : c[0], c[1] + ds[k], c[2] + dl[k]));
    return out;
  }
  function R(list) { return list.map(hexRgb); }

  /* ---------------- palettes (original; dark -> light) ---------------- */
  var SKIN = {
    pale: R(['#5e2f3a', '#a85c5a', '#e2a184', '#f6c8a8', '#fde6d2']),
    fair: R(['#5a2c30', '#9e5446', '#d88e68', '#efb68c', '#fbd8b4']),
    tan: R(['#4e2a28', '#86503a', '#c2865c', '#dca874', '#f0c896']),
    bronze: R(['#40221f', '#70402c', '#a46842', '#c88c5a', '#e2b07c']),
    brown: R(['#2e1a1e', '#5a3228', '#875034', '#ab744a', '#cc9a6c']),
    deep: R(['#22121a', '#43251f', '#68402a', '#8c5e3e', '#b2845c'])
  };
  var HAIR = {
    black: R(['#0e0c16', '#1e1a2a', '#322e44', '#4c4a68', '#76769a']),
    darkbrown: R(['#1c100e', '#3a2018', '#5a3424', '#7e4e32', '#a8744a']),
    brown: R(['#28140e', '#50301a', '#7a4a26', '#a26a36', '#cc9650']),
    auburn: R(['#2a0c10', '#5a1a18', '#8e3022', '#bc4c2c', '#e8804a']),
    ginger: R(['#481808', '#8a3412', '#c65a1c', '#ea8a32', '#ffc06c']),
    blonde: R(['#5a3a18', '#9a6a28', '#d0a042', '#eec866', '#fff2ac']),
    platinum: R(['#4e4e62', '#8a8aa2', '#c4c4d6', '#e6e6f0', '#ffffff']),
    grey: R(['#2a2a36', '#525268', '#80809c', '#acacc2', '#dcdce8']),
    teal: R(['#0c262c', '#18464e', '#287474', '#46a49a', '#86d4c0']),
    violet: R(['#1c0e2e', '#3c205c', '#5e3c96', '#8662c6', '#bc9cf0']),
    rose: R(['#360e20', '#6a2042', '#a43e68', '#d46e98', '#f6a8c8']),
    blue: R(['#0c1436', '#1a2c68', '#2c4ea6', '#4a78d6', '#86aef6'])
  };
  var EYE = {
    brown: R(['#24100a', '#4e2a14', '#7e4e22', '#aa7838', '#d8aa66']),
    hazel: R(['#22180a', '#4a3a14', '#786024', '#a08a3a', '#cab866']),
    green: R(['#0a2412', '#165028', '#28823c', '#52ae56', '#98dc86']),
    blue: R(['#0a1636', '#183676', '#2a5ebc', '#5490e6', '#a2ccff']),
    grey: R(['#1c2028', '#383f4e', '#5e6878', '#8e98a6', '#c4cad4']),
    amber: R(['#361804', '#743606', '#b2660e', '#e49c28', '#ffd46c']),
    violet: R(['#1c0c2e', '#3e1e76', '#6a3eb4', '#986ade', '#ccaeff'])
  };
  var CLOTH = { crimson: '#a43040', navy: '#2e4a8a', forest: '#3a7044', plum: '#6c3a7c', ochre: '#b27c2c', teal: '#2a7a82', slate: '#5a6478',
    umber: '#7a4c2c', cream: '#d6c69e', charcoal: '#3a3846', ivory: '#e2dccc', rust: '#a8522a', moss: '#6e7a34', sky: '#4a86c0' };
  var METAL = { steel: R(['#1c2030', '#3e465c', '#76829a', '#b2bccc', '#eef2ff']), gold: R(['#3a2008', '#7a4a10', '#bc8a22', '#eac244', '#fff2a6']),
    bronze: R(['#2e1408', '#62301a', '#9c5a2c', '#cc8a4a', '#f2c088']) };
  var GEM = { ruby: R(['#2e0610', '#6a0e22', '#b81e3a', '#ee4a5e', '#ffb0b8']), sapphire: R(['#060c34', '#102478', '#2048c4', '#4c86f2', '#b4d4ff']),
    emerald: R(['#04200e', '#0a4a22', '#14843c', '#3cc068', '#b0f4c0']) };
  var BG = { dusk: '#3c3a6a', moss: '#3e5a46', ember: '#6a3a32', sea: '#2c5068', plum: '#563a62', sand: '#7a6646', slate: '#45506a', rose: '#6a4256' };
  var SCLERA = R(['#5a5468', '#9894b0', '#d4d2e2', '#f2f0f8', '#ffffff']);
  var LINE = R(['#0e0812', '#1e1220', '#3a2430', '#5a3a44', '#7a5a60']);
  var TEETH = R(['#5a5050', '#a49c98', '#d8d2c8', '#f4f0e6', '#ffffff']);
  var TONGUE = R(['#541822', '#882836', '#c04a58', '#e07080', '#f8a0aa']);
  var PATCH = R(['#0e0a0c', '#1e1418', '#34242c', '#4c3840', '#685058']);
  var SWEAT = R(['#1c3a6a', '#3a6ab0', '#7ab0e8', '#b8e0ff', '#ffffff']);

  var PARTS = {
    age: ['child', 'young', 'adult', 'elder'],
    gender: ['female', 'male', 'any'],
    skin: Object.keys(SKIN),
    head: ['oval', 'round', 'square', 'heart', 'long'],
    hair: ['crop', 'swept', 'bangs', 'long', 'spiky', 'curly', 'ponytail', 'braid', 'wavy', 'bald'],
    hairColor: Object.keys(HAIR),
    eyes: ['round', 'almond', 'large', 'narrow', 'heavy'],
    eyeColor: Object.keys(EYE),
    brows: ['thin', 'thick', 'arched'],
    nose: ['button', 'straight', 'broad'],
    mouth: ['small', 'wide', 'full'],
    ears: ['round', 'pointed'],
    facial: ['none', 'stubble', 'moustache', 'beard', 'goatee'],
    headgear: ['none', 'hood', 'helmet', 'circlet', 'headband'],
    mark: ['none', 'scar', 'freckles', 'earring', 'eyepatch', 'blush'],
    collar: ['tunic', 'robe', 'armor', 'cloak', 'scarf', 'vest'],
    cloth: Object.keys(CLOTH),
    trim: Object.keys(CLOTH),
    bg: Object.keys(BG)
  };

  /* ---------------- seeded random ---------------- */
  function hashStr(s) { s = String(s); var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) {
    var s = (typeof seed === 'number' ? seed : hashStr(seed)) >>> 0 || 1;
    return function () { s = s + 0x6D2B79F5 | 0; var t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function pickW(r, opts) { var tot = 0, k; for (k in opts) tot += opts[k]; var v = r() * tot; for (k in opts) { v -= opts[k]; if (v < 0) return k; } return k; }
  function has(list, v) { return list.indexOf(v) >= 0; }

  // resolve a spec: every part the designer left out comes from the seed, weighted so faces stay plausible
  function resolveSpec(spec) {
    spec = spec || {};
    var seed = spec.seed != null ? spec.seed : spec.name != null ? hashStr(spec.name) : 1, r = rng(seed), o = {};
    for (var k in spec) o[k] = spec[k];
    o.seed = seed;
    var take = function (key, weights) { var v = r(); void v; var pick = pickW(r, weights); if (o[key] == null || (PARTS[key] && !has(PARTS[key], o[key]) && !/^#/.test(String(o[key])))) o[key] = pick; };
    take('age', { child: 1, young: 3, adult: 4, elder: 2 });
    take('gender', { female: 4, male: 4, any: 1 });
    var A = o.age, F = o.gender === 'female', M = o.gender === 'male';
    take('skin', { pale: 2, fair: 3, tan: 3, bronze: 3, brown: 3, deep: 2 });
    take('head', A === 'child' ? { round: 3, oval: 2, heart: 1 } : F ? { oval: 4, heart: 3, round: 2, long: 1 } : M ? { square: 4, oval: 3, long: 2, round: 1 } : { oval: 3, round: 2, long: 1, heart: 1, square: 1 });
    take('hair', A === 'elder' ? (M ? { crop: 3, bald: 3, swept: 2, long: 1, curly: 1 } : { bangs: 1, long: 2, ponytail: 2, braid: 2, curly: 2, crop: 1 })
      : F ? { long: 3, bangs: 2, ponytail: 2, braid: 2, wavy: 3, curly: 2, swept: 1, crop: 1 } : M ? { crop: 3, swept: 3, spiky: 2, curly: 2, long: 1, ponytail: 1, bald: 1 }
        : { swept: 2, crop: 2, bangs: 2, curly: 2, long: 1, spiky: 1, wavy: 1 });
    take('hairColor', A === 'elder' ? { grey: 5, platinum: 3, darkbrown: 1 } : { black: 4, darkbrown: 4, brown: 4, auburn: 2, ginger: 2, blonde: 3, platinum: 1, teal: 1, violet: 1, rose: 1, blue: 1 });
    take('eyes', A === 'child' ? { large: 4, round: 2 } : F ? { almond: 3, round: 3, large: 2, heavy: 1, narrow: 1 } : { round: 3, almond: 2, narrow: 2, heavy: 2, large: 1 });
    take('eyeColor', { brown: 5, hazel: 2, green: 2, blue: 3, grey: 2, amber: 1, violet: 1 });
    take('brows', F ? { thin: 3, arched: 3, thick: 1 } : M ? { thick: 4, thin: 1, arched: 1 } : { thin: 2, thick: 2, arched: 1 });
    take('nose', A === 'child' ? { button: 1 } : F ? { button: 3, straight: 2, broad: 1 } : { straight: 3, broad: 2, button: 1 });
    take('mouth', F ? { full: 3, small: 2, wide: 1 } : { small: 2, wide: 3, full: 1 });
    take('ears', { round: 6, pointed: 2 });
    take('facial', M && A !== 'child' && A !== 'young' ? { none: 3, stubble: 2, moustache: 1, beard: 3, goatee: 1 } : M && A === 'young' ? { none: 6, stubble: 2, goatee: 1 } : { none: 1 });
    take('headgear', A === 'child' ? { none: 6, headband: 1, hood: 1 } : { none: 6, hood: 2, helmet: 1, circlet: 1, headband: 1 });
    take('mark', A === 'child' ? { none: 4, freckles: 3, blush: 3 } : { none: 9, scar: 2, freckles: 2, earring: 2, eyepatch: 1, blush: 2 });
    take('collar', { tunic: 3, robe: 2, armor: 2, cloak: 3, scarf: 2, vest: 2 });
    take('cloth', { crimson: 2, navy: 2, forest: 2, plum: 2, ochre: 1, teal: 2, slate: 1, umber: 2, charcoal: 1, rust: 1, moss: 1, sky: 1 });
    take('trim', { cream: 3, ivory: 2, ochre: 2, crimson: 1, teal: 1, slate: 1, umber: 1, charcoal: 1 });
    take('bg', { dusk: 2, moss: 1, ember: 1, sea: 2, plum: 1, sand: 1, slate: 2, rose: 1 });
    if (o.hair === 'bald' && o.headgear === 'none' && A !== 'elder' && !M) o.hair = 'crop';
    if (o.headgear === 'helmet' && (o.hair === 'curly' || o.hair === 'spiky')) o.hair = 'crop';
    if (o.hood == null) o.hood = r() < 0.5 ? 'cloth' : 'trim';
    if (o.look == null) o.look = 0;
    if (o.metal == null) o.metal = o.headgear === 'circlet' ? 'gold' : r() < 0.7 ? 'steel' : 'bronze';
    if (o.gem == null) o.gem = pickW(r, { ruby: 2, sapphire: 2, emerald: 1 });
    if (o.trim === o.cloth) o.trim = o.cloth === 'cream' ? 'umber' : 'cream';
    if (o.name == null) o.name = '';
    return o;
  }
  function colorRamp(table, key, fallback) { if (table[key]) return table[key]; if (/^#/.test(String(key))) return ramp(key); return table[fallback]; }

  /* ---------------- materials ---------------- */
  var E = 0, SK = 1, HA = 2, BR = 3, CL = 4, TR = 5, MT = 6, GD = 7, SC = 8, IR = 9, LN = 10, MO = 11, TE = 12, TO = 13, GM = 14, HO = 15, PA = 16, BL = 17, ST = 18, SW = 19;

  /* ---------------- geometry ---------------- */
  function geometry(o, S) {
    var u = S / 48, A = o.age, F = o.gender === 'female', M = o.gender === 'male';
    var G = { S: S, u: u, cx: S / 2 };
    G.W = (A === 'child' ? 12 : 11.2) * u + (F ? -0.4 : M ? 0.4 : 0) * u + (o.head === 'round' ? 0.5 * u : 0) - (o.head === 'long' ? 0.3 * u : 0);
    G.yTop = (A === 'child' ? 8.5 : 6.5) * u - (o.head === 'long' ? 1.5 * u : 0);
    G.yChin = (A === 'child' ? 34 : A === 'elder' ? 33.6 : 33) * u;
    var chin = { oval: [0.42, 1.6], round: [0.5, 2.4], square: [0.64, 3.4], heart: [0.28, 1.15], long: [0.44, 1.8] }[o.head] || [0.42, 1.6];
    G.chinK = chin[0] * (F ? 0.9 : M ? 1.1 : 1) * (A === 'child' ? 1.1 : 1); G.chinP = chin[1];
    var eyeT = A === 'child' ? 0.555 : 0.5;
    G.yE = Math.round(G.yTop + (G.yChin - G.yTop) * eyeT);
    var ew = Math.round(4 * u), eh = Math.round(4 * u);
    if (o.eyes === 'large') { ew += 1; eh += 1; } else if (o.eyes === 'almond') ew += 1; else if (o.eyes === 'narrow') { ew += 1; eh -= 1; }
    if (A === 'child' && o.eyes !== 'large') eh += 1;
    G.ew = ew; G.eh = eh; G.hg = Math.round(2 * u);
    if (ew >= 6 && G.hg < 3) G.hg = 3;
    G.eyeL = Math.floor(G.cx) - G.hg - ew;         // left eye first column (screen left)
    G.eyeR = Math.ceil(G.cx) + G.hg;                // right eye first column
    G.yB = G.yE - Math.round(2 * u);                // brow row
    G.yN = G.yE + eh + Math.round(1 * u);           // nose tip row
    G.yM = G.yN + Math.max(2, Math.round((G.yChin - G.yN) * 0.38));
    G.mw = 2 * Math.round(({ small: 2, wide: 3, full: 2.4 }[o.mouth] || 2) * u);
    G.nw = (A === 'child' ? 3 : F ? 3.4 : M ? 4.4 : 3.9) * u;
    G.shW = (A === 'child' ? 15 : F ? 17.5 : M ? 20.5 : 19) * u;
    G.y0 = G.yChin + (A === 'child' ? 2 : 2.6) * u;   // shoulder line at the neck
    G.yNB = G.y0 + 1 * u;                               // neck base
    return G;
  }
  function hwHead(G, y) {   // half width of the head at pixel-centre y
    var t = (y - G.yTop) / (G.yChin - G.yTop);
    if (t < 0 || t > 1) return 0;
    if (t < 0.5) { var a = 1 - 2 * t; return G.W * Math.sqrt(Math.max(0, 1 - a * a)); }
    var s = (t - 0.5) / 0.5, w = G.W * (1 - (1 - G.chinK) * Math.pow(s, G.chinP));
    if (s > 0.7) { var q = (s - 0.7) / 0.3; w *= Math.sqrt(Math.max(0, 1 - q * q * 0.62)); }
    return w;
  }

  var LD = (function () { var v = [-0.45, -0.58, 0.68], l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })();
  function light(nx, ny, nz) { var l = Math.hypot(nx, ny, nz) || 1; return (nx * LD[0] + ny * LD[1] + nz * LD[2]) / l; }
  function q5(L) { return L > 0.9 ? 4 : L > 0.66 ? 3 : L > 0.4 ? 2 : L > 0.12 ? 1 : 0; }

  /* ---------------- hair styles ---------------- */
  var HAIRS = {
    crop: { vol: 1.4, side: 'ear', back: 'none', top: 'round' },
    swept: { vol: 2.4, side: 'ear', back: 'nape', top: 'round' },
    bangs: { vol: 2, side: 'cover', back: 'bob', top: 'round' },
    long: { vol: 2, side: 'cheek', back: 'long', top: 'round', locks: true },
    spiky: { vol: 3.2, side: 'ear', back: 'nape', top: 'spiky' },
    curly: { vol: 3.6, side: 'cover', back: 'bob', top: 'curly' },
    ponytail: { vol: 1.6, side: 'ear', back: 'tail', top: 'round' },
    braid: { vol: 1.8, side: 'ear', back: 'braid', top: 'round' },
    wavy: { vol: 2.6, side: 'cheek', back: 'long', top: 'curly', locks: true, wave: true },
    bald: { vol: 0, side: 'none', back: 'none', top: 'none' }
  };
  function tri(v) { v = v - Math.floor(v); return 1 - 2 * Math.abs(v - 0.5); }
  function fringeY(o, G, px, x) {
    var u = G.u, xr = px / G.W, ax = Math.min(1, Math.abs(xr)), yE = G.yE, top = G.yTop;
    switch (o.hair) {
      case 'crop': return top + 3.2 * u + (ax > 0.7 ? 2 * u * (ax - 0.7) / 0.3 : 0) + (x % 3 === 0 ? 0.7 : 0);
      case 'swept': { var k = Math.max(0, Math.min(1, (xr + 0.9) / 1.7)); return top + 3 * u + (yE - 4.2 * u - top - 3 * u) * Math.pow(k, 1.2) + (x % 3 === 1 ? -0.8 : 0); }
      case 'bangs': return yE - 4.6 * u + (x % 3 === 1 ? -0.9 : 0) + (ax > 0.82 ? 2 * u : 0);
      case 'long': case 'braid': return top + 2.6 * u + (yE - 2.4 * u - top - 2.6 * u) * Math.pow(ax, 0.75);
      case 'wavy': return top + 2.8 * u + (yE - 2.4 * u - top - 2.8 * u) * Math.pow(ax, 0.8);
      case 'spiky': return yE - 6.4 * u + 2.6 * u * tri(px / (3.2 * u) + 0.5);
      case 'curly': return yE - 6.2 * u + 1.2 * u * Math.abs(Math.sin(px * 0.9 / u));
      case 'ponytail': return top + 3.4 * u + 1.6 * u * ax * ax + (x % 4 === 0 ? 0.6 : 0);
      default: return -99;
    }
  }

  /* ---------------- the base layer (everything that never changes with the expression) ---------------- */
  function buildBase(o, S) {
    var G = geometry(o, S), u = G.u, cx = G.cx, N = S * S;
    var mat = new Uint8Array(N), sh = new Int8Array(N), x, y, i;
    function put(x, y, m, s) { if (x < 0 || y < 0 || x >= S || y >= S) return; i = y * S + x; mat[i] = m; sh[i] = s < 0 ? 0 : s > 4 ? 4 : s; }
    function at(x, y) { return x < 0 || y < 0 || x >= S || y >= S ? E : mat[y * S + x]; }
    var hs0 = HAIRS[o.hair] || HAIRS.crop, hs = {}; for (var hk in hs0) hs[hk] = hs0[hk];
    if (o.headgear === 'hood') { hs.locks = false; if (hs.back !== 'braid') hs.back = 'none'; }
    var vol = hs.vol * u, volS = Math.max(0.6 * u, vol * 0.55);
    var yc = G.yE - 1, ry = yc - (G.yTop - vol), rx = G.W + volS;
    var F = o.gender === 'female', M = o.gender === 'male';
    var sideY = { ear: G.yE + 1 * u, cover: G.yE + 5.5 * u, cheek: G.yChin - 2 * u, none: -99 }[hs.side];
    var inset = hs.side === 'cheek' ? 1.4 * u : 1.2 * u;

    // cap: ellipse over the head, with spikes / curls on the outline
    function inCap(px, py) {
      if (hs.top === 'none') return false;
      if (py < yc) {
        var e = (px / rx) * (px / rx) + ((py - yc) / ry) * ((py - yc) / ry), b = 0;
        if (hs.top === 'spiky' && py < yc - ry * 0.25) { var th = Math.atan2(py - yc, px); b = 0.34 * Math.pow(tri(th * 7 / Math.PI + 0.5), 2.2); }
        if (hs.top === 'curly') { var th2 = Math.atan2(py - yc, px); b = 0.1 * Math.abs(Math.sin(th2 * 6)); }
        return e < 1 + b;
      }
      var hw = hwHead(G, py);
      return Math.abs(px) < (hw > 0 ? hw : G.W * 0.5) + volS + (hs.top === 'curly' ? 0.6 * u * Math.abs(Math.sin(py * 0.9 / u)) : 0) && py < sideY;
    }
    function hairShade(px, py, x, y) {
      var L = light(px / rx, (py - yc) / (ry * 1.05), 0.75 + Math.max(0, 0.4 - Math.abs(px / rx)));
      var s = L > 0.78 ? 3 : L > 0.5 ? 2 : L > 0.18 ? 1 : 0;
      // strands: curved lines falling from the crown
      if (hs.top === 'curly') {   // curls: 4x3 clumps, each with a lit top and a dark underside
        var row = Math.floor(y / 3), fx = (x + (row % 2) * 2) % 4, fy = y % 3;
        if ((fy === 2 && (fx === 1 || fx === 2)) || (fy === 1 && fx === 3)) s = Math.max(0, s - 1);
        else if (fy === 0 && fx === 1 && s > 0) s = Math.min(3, s + 1);
        return s;
      }
      var sl = (px + (py - G.yTop) * (px / rx) * 0.9) / (2.6 * u);
      if (py > G.yTop - vol + 2 && Math.abs(sl - Math.round(sl)) < 0.18 / u && s > 0) s -= 1;
      // shine band
      var band = G.yTop - vol + ry * 0.42;
      if (Math.abs(py - band - px * 0.12) < 1.0 * u && px < rx * 0.35 && px > -rx * 0.85 && s >= 2 && (x + y) % 3 !== 0) s = 4;
      else if (Math.abs(py - band - px * 0.12) < 1.6 * u && px < rx * 0.35 && px > -rx * 0.9 && s === 2) s = 3;
      return s;
    }

    // 1. back hair (behind everything)
    var backEnd = { bob: G.yChin + 0.5 * u, long: S + 2, tail: G.yChin + 6 * u }[hs.back];
    if (backEnd) for (y = Math.floor(yc); y < S; y++) for (x = 0; x < S; x++) {
      var px = x + 0.5 - cx, py = y + 0.5, hw = Math.max(hwHead(G, Math.min(py, G.yChin - 1)), G.W * 0.8);
      var wB = hs.back === 'bob' ? G.W + volS + 1.2 * u : hs.back === 'long' ? G.W + volS + 0.6 * u - Math.max(0, py - G.yChin) * 0.15 : 0;
      var endY = backEnd + (hs.back === 'long' ? 0 : 2 * u * tri(px / (3 * u)));
      if (hs.back === 'tail') {   // ponytail peeking out on the right of the neck
        var tx = G.W * 0.85 + Math.max(0, py - G.yE) * 0.18, tw = 2.4 * u * (1 - Math.max(0, py - G.yChin) / (8 * u));
        if (py > G.yE && py < endY && Math.abs(px - tx) < tw) put(x, y, HA, Math.abs(px - tx) < tw * 0.4 ? 2 : 1);
        continue;
      }
      if (py < endY && Math.abs(px) < wB && Math.abs(px) < hw + volS + 2 * u) put(x, y, HA, (Math.abs(px) > wB - 1.2 * u ? 1 : 0) + (px < 0 ? 1 : 0));
    }

    // 2. neck
    for (y = Math.floor(G.yE + 3 * u); y < Math.ceil(G.yNB + 3 * u) && y < S; y++) for (x = 0; x < S; x++) {
      var npx = x + 0.5 - cx, npy = y + 0.5;
      if (Math.abs(npx) < G.nw) {
        var nl = npx < G.nw * 0.35 ? 2 : 1, under = npy - G.yChin;
        if (under < 1.6 * u || npx > G.nw - 1.2 * u) nl -= 1;
        put(x, y, SK, Math.max(0, nl));
      }
    }

    // 3. torso and collar
    var dyS = 4.6 * u, shW = G.shW, nw = G.nw;
    function hwT(py) { if (py < G.y0) return 0; return nw + 1 * u + (shW - nw - 1 * u) * Math.sqrt(Math.min(1, (py - G.y0) / dyS)); }
    function topAt(px) { var a = Math.abs(px) - nw - 1 * u; if (a <= 0) return G.y0; return G.y0 + dyS * Math.pow(Math.min(1, a / (shW - nw - 1 * u)), 2); }
    var vDepth = (o.collar === 'tunic' ? 6.5 : o.collar === 'cloak' ? 5 : o.collar === 'vest' ? 9 : 0) * u;
    for (y = Math.floor(G.y0); y < S; y++) for (x = 0; x < S; x++) {
      var tpx = x + 0.5 - cx, tpy = y + 0.5, hwt = hwT(tpy);
      if (Math.abs(tpx) >= hwt) continue;
      var depth = tpy - topAt(tpx), nx = tpx / (shW + 2 * u);
      var L = light(nx * 0.9, depth < 2.2 * u ? -0.75 : -0.05, 0.8) - Math.max(0, tpy - (S - 4 * u)) * 0.05;
      var s = q5(L + 0.05), m = CL;
      // fold lines
      if (depth > 3 * u && Math.abs(Math.abs(tpx) - shW * 0.55) < 0.5 && (y % 4) !== 0) s = Math.max(0, s - 1);
      if (o.collar === 'vest') { var panel = Math.abs(tpx) > 2.2 * u + Math.max(0, tpy - G.yNB) * 0.12; m = panel ? CL : TR; if (!panel && Math.abs(tpx) < 0.6 && y % 3 === 0 && tpy > G.yNB + 2 * u) { m = LN; s = 2; } }
      if (vDepth && o.collar !== 'vest') {
        var vy = tpy - G.yNB, vw = (vDepth - vy) * 0.55;
        if (vy > -1 * u && vy < vDepth && Math.abs(tpx) < vw) { m = o.collar === 'cloak' ? TR : SK; s = o.collar === 'cloak' ? 2 : (vy < 1.5 * u ? 1 : 2) - (tpx > 0 ? 1 : 0) + (tpx < -1 ? 0 : 0); }
        else if (vy > -1 * u && vy < vDepth + 1 && Math.abs(tpx) < vw + 1.2 * u && o.collar === 'tunic') { m = TR; s = tpx < 0 ? 3 : 2; }
      }
      if (o.collar === 'cloak') {   // cloak edge lines and the clasp
        if (Math.abs(Math.abs(tpx) - (vDepth - (tpy - G.yNB)) * 0.55 - 0.6 * u) < 0.6 && tpy > G.yNB && tpy < G.yNB + vDepth) s = 4;
      }
      if (o.collar === 'robe') {
        if (Math.abs(tpx) < 0.8 * u && tpy > G.yNB + 1 * u) { m = TR; s = tpx < 0 ? 3 : 2; }
      }
      if (o.collar === 'armor') {   // pauldrons
        var pcx = (shW - 4.2 * u) * (tpx < 0 ? -1 : 1), pcy = G.y0 + 4.8 * u, ex = (tpx - pcx) / (5.4 * u), ey = (tpy - pcy) / (4.2 * u);
        if (ex * ex + ey * ey < 1) { m = o.metal === 'gold' ? GD : MT; var pl = light(ex, ey * 1.2, 0.6); s = pl > 0.86 ? 4 : pl > 0.55 ? 3 : pl > 0.2 ? 2 : pl > -0.2 ? 1 : 0; if (ex * ex + ey * ey > 0.72 && ey > 0) s = Math.min(s, 1); }
        else if (Math.abs(tpx) < 4 * u && tpy > G.yNB + 1.5 * u) m = CL;
      }
      put(x, y, m, s);
    }
    // collar pieces over the neck base
    if (o.collar === 'robe' || o.collar === 'armor') {
      for (y = Math.floor(G.yNB - 3 * u); y < G.yNB + 2 * u; y++) for (x = 0; x < S; x++) {
        var cpx = x + 0.5 - cx, cw = nw + 1.6 * u + (y + 0.5 - (G.yNB - 3 * u)) * 0.25;
        if (Math.abs(cpx) < cw && !(o.collar === 'robe' && Math.abs(cpx) < 0.8 * u && y + 0.5 > G.yNB - 2 * u)) {
          var ml = o.collar === 'armor' ? (o.metal === 'gold' ? GD : MT) : TR;
          var cl = q5(light(cpx / cw, -0.3, 0.8)); if (y + 0.5 > G.yNB + 1 * u) cl -= 1;
          put(x, y, ml, cl);
        }
      }
    }
    if (o.collar === 'scarf') {   // two wraps around the neck and a tail hanging on the right
      var sTop = G.yNB - 3.2 * u, bandH = 2.2 * u;
      for (y = Math.floor(sTop); y < G.yNB + 10 * u && y < S; y++) for (x = 0; x < S; x++) {
        var spx = x + 0.5 - cx, spy = y + 0.5 - sTop, bi = Math.floor(spy / bandH), bf = spy / bandH - bi;
        var wrapW = nw + 2.6 * u + bi * 1.4 * u - Math.pow(Math.abs(bf - 0.5) * 2, 2) * 0.6 * u;
        if (bi >= 0 && bi < 2 && Math.abs(spx) < wrapW) { var ss = bf < 0.3 ? 3 : bf < 0.72 ? 2 : 1; if (spx > wrapW - 1.5 * u) ss = Math.max(0, ss - 1); if (spx < -wrapW + 1.2 * u && ss < 3) ss += 1; put(x, y, TR, ss); continue; }
        var tx0 = 1.2 * u + (spy - 2 * bandH) * 0.15;
        if (spy >= 2 * bandH - 1 && spy < 2 * bandH + 6 * u && spx > tx0 && spx < tx0 + 3.6 * u) {
          var ts = spx < tx0 + 1.2 * u ? 3 : spx > tx0 + 2.6 * u ? 1 : 2; if (spy > 2 * bandH + 5 * u) ts = (x % 2) ? 1 : 0; put(x, y, TR, ts);
        }
      }
    }
    if (o.collar === 'cloak') {   // clasp
      var cy0 = Math.round(G.yNB + 1 * u), cxl = Math.floor(cx) - 1;
      put(cxl, cy0, GD, 3); put(cxl + 1, cy0, GD, 2); put(cxl, cy0 + 1, GD, 2); put(cxl + 1, cy0 + 1, GD, 1);
      if (u > 1.1) { put(cxl - 1, cy0, GD, 2); put(cxl + 2, cy0 + 1, GD, 1); }
    }

    // 4. ears (behind the head edge)
    var earY = G.yE + 2.4 * u, earVisible = hs.side !== 'cover' && hs.side !== 'cheek' && o.headgear !== 'hood' && o.headgear !== 'helmet';
    if (earVisible || o.ears === 'pointed' && o.headgear !== 'hood' && o.headgear !== 'helmet') {
      for (var side = -1; side <= 1; side += 2) {
        var hwE = hwHead(G, earY), ecx = cx + side * (hwE - 0.5 * u);
        for (y = Math.floor(earY - 4 * u); y < earY + 4 * u; y++) for (x = 0; x < S; x++) {
          var epx = (x + 0.5 - ecx) * side, epy = y + 0.5 - earY, inE = (epx / (1.9 * u)) * (epx / (1.9 * u)) + (epy / (2.8 * u)) * (epy / (2.8 * u)) < 1;
          var tip = o.ears === 'pointed' && epy < 0 && epy > -5.5 * u && epx > -0.5 && epx < 1.2 * u + (-epy) * 0.55 && epx > (-epy) * 0.5 - 0.5 * u;
          if ((inE || tip) && at(x, y) === E) put(x, y, SK, epx > 0.4 * u && epy > -1.5 * u && epy < 1.5 * u ? 0 : side < 0 ? 2 : 1);
        }
      }
    }

    // 5. head
    var cyH = (G.yTop + G.yChin) / 2, ryH = (G.yChin - G.yTop) / 2;
    for (y = Math.floor(G.yTop); y < Math.ceil(G.yChin); y++) for (x = 0; x < S; x++) {
      var hpx = x + 0.5 - cx, hpy = y + 0.5, hwh = hwHead(G, hpy);
      if (Math.abs(hpx) >= hwh) continue;
      var dy = (hpy - cyH) / ryH, ex0 = hpx / Math.max(1, hwh), Lh = light(ex0 * 0.8, dy * 0.28, 1.0), sh2 = Lh > 0.92 ? 4 : Lh > 0.6 ? 3 : Lh > 0.3 ? 2 : 1;
      if (Math.abs(hpx) > hwh - 1 && ex0 > 0.5) sh2 = Math.min(sh2, 1);
      if (G.yChin - hpy < 1.2 * u && sh2 > 1) sh2 -= 1;                    // under the jaw
      if (sh2 === 4 && !(hpx < -G.W * 0.35 && hpy < G.yN)) sh2 = 3;        // keep the brightest tone for the lit cheek / brow
      put(x, y, SK, sh2);
    }
    // nose
    var c0 = Math.floor(cx) - 1, c1 = c0 + 1, yN = G.yN;
    if (o.nose === 'broad') { put(c0 - 1, yN, SK, 1); put(c0, yN, SK, 1); put(c1, yN, SK, 0); put(c1 + 1, yN, SK, 1); put(c0, yN - 1, SK, 4); put(c1, yN - 1, SK, 2); }
    else if (o.nose === 'straight') { put(c1, yN - 2, SK, 2); put(c1, yN - 1, SK, 1); put(c0, yN - 1, SK, 4); put(c0, yN, SK, 2); put(c1, yN, SK, 0); if (u > 1.1) { put(c1, yN - 3, SK, 2); put(c1 + 1, yN, SK, 1); } }
    else { put(c0, yN - 1, SK, 4); put(c0, yN, SK, 2); put(c1, yN, SK, 0); if (u > 1.1) put(c1 + 1, yN, SK, 1); }
    // elder lines, freckles, blush
    var mwH = G.mw / 2;
    if (o.age === 'elder') {
      [-1, 1].forEach(function (sd) {
        var xo = sd < 0 ? G.eyeL - 1 : G.eyeR + G.ew;
        put(xo, G.yE + G.eh - 1, SK, 1); put(xo + sd, G.yE + G.eh - 2, SK, 1);
        var nx2 = sd < 0 ? Math.floor(cx - mwH - 1.6 * u) : Math.ceil(cx + mwH + 1.6 * u) - 1;
        put(nx2, yN + 1, SK, 1); put(nx2, yN + 2, SK, 1); if (u > 1.1) put(nx2, yN + 3, SK, 1);
      });
    }
    var darkSkin = o.skin === 'brown' || o.skin === 'deep' || o.skin === 'bronze';
    if (o.mark === 'freckles' || o.mark === 'blush') {
      [-1, 1].forEach(function (sd) {
        var fx = sd < 0 ? G.eyeL + Math.floor(G.ew / 2) - 1 : G.eyeR + Math.ceil(G.ew / 2) - 1, fy = G.yE + G.eh + Math.round(0.6 * u);
        if (o.mark === 'freckles' && !darkSkin) [[0, 0], [2, 1], [-1, 1]].forEach(function (d) { var fi = (fy + d[1]) * S + fx + d[0]; if (at(fx + d[0], fy + d[1]) === SK) put(fx + d[0], fy + d[1], SK, Math.max(1, sh[fi] - 1)); });
        else if (o.mark === 'blush') for (var bx = -1; bx < 2; bx++) if (at(fx + bx, fy) === SK) put(fx + bx, fy, BL, bx === -1 ? 3 : 2);
      });
    }

    // 6. facial hair
    var fy0 = yN + 1, yM = G.yM;
    if (o.facial === 'stubble' || o.facial === 'beard' || o.facial === 'goatee') {
      for (y = Math.floor(G.yE + G.eh); y < Math.ceil(G.yChin + 4 * u) && y < S; y++) for (x = 0; x < S; x++) {
        var bpx = x + 0.5 - cx, bpy = y + 0.5, hwb = hwHead(G, bpy), mouthZone = Math.abs(bpx) < mwH + 0.6 * u && bpy > yM - 0.5 && bpy < yM + 2;
        if (o.facial === 'stubble') { if (at(x, y) === SK && bpy > fy0 + 1 && !mouthZone && (Math.abs(bpx) > hwb - 3.5 * u || bpy > yM + 1) && (x + y) % 2 === 0) put(x, y, ST, sh[y * S + x]); continue; }
        if (o.facial === 'goatee') { if (Math.abs(bpx) < 2.2 * u && bpy > yM + 1.6 && bpy < G.yChin + 1.6 * u - Math.abs(bpx) * 0.5) put(x, y, HA, bpx < 0 ? 2 : 1); continue; }
        var inBeard = (bpy < G.yChin && Math.abs(bpx) < hwb && bpy > yM - 3 * u + (G.W - Math.abs(bpx)) * 0.18 * 0 && (Math.abs(bpx) > hwb - 2.6 * u || bpy > yM - 0.5)) ||
          (bpy >= G.yChin - 0.5 && bpy < G.yChin + 3.4 * u && Math.abs(bpx) < G.W * 0.55 * (1 - (bpy - G.yChin) / (3.6 * u)));
        if (inBeard && !mouthZone && bpy > fy0 - (Math.abs(bpx) > hwb - 2.6 * u ? 1 : 0)) {
          var bl = light(bpx / G.W, (bpy - G.yChin) / (4 * u), 0.8), bs = bl > 0.6 ? 3 : bl > 0.3 ? 2 : 1;
          if ((x + Math.floor(y / 2)) % 3 === 0) bs = Math.max(0, bs - 1);
          put(x, y, HA, bs);
        }
      }
    }
    if (o.facial === 'moustache' || o.facial === 'beard' || o.facial === 'goatee') {
      var mwm = Math.ceil(mwH + 1.2 * u);
      for (x = Math.floor(cx - mwm); x < Math.ceil(cx + mwm); x++) {
        var mpx = x + 0.5 - cx, droop = Math.abs(mpx) > mwH ? 1 : 0;
        put(x, yM - 1 + droop, HA, mpx < 0 ? 2 : 1);
        if (u > 1.1 || o.facial === 'moustache') put(x, yM - 2 + droop, HA, mpx < 0 ? 3 : 2);
      }
    }

    // 7. hair (cap, fringe, side hair)
    var capTop = Math.floor(G.yTop - vol - 3 * u);
    for (y = Math.max(0, capTop); y < Math.min(S, Math.ceil(sideY) + 1); y++) for (x = 0; x < S; x++) {
      var cpx2 = x + 0.5 - cx, cpy = y + 0.5;
      if (!inCap(cpx2, cpy)) continue;
      var hwc = hwHead(G, cpy), onFace = Math.abs(cpx2) < hwc - inset;
      if (onFace && cpy >= fringeY(o, G, cpx2, x)) continue;
      if (!onFace && cpy >= sideY) continue;
      put(x, y, HA, hairShade(cpx2, cpy, x, y));
    }
    if (o.hair === 'bald' && o.age === 'elder') {   // a ring of hair above the ears
      for (y = Math.floor(G.yE - 4 * u); y < G.yE + 2 * u; y++) for (x = 0; x < S; x++) {
        var rpx = x + 0.5 - cx, rhw = hwHead(G, y + 0.5);
        if (Math.abs(rpx) > rhw - 1.2 * u && Math.abs(rpx) < rhw + 1 * u) put(x, y, HA, rpx < 0 ? 3 : 1);
      }
    }
    // locks over the shoulders (long, wavy)
    if (hs.locks) {
      for (y = Math.floor(G.yE); y < S; y++) for (x = 0; x < S; x++) {
        var lpx = x + 0.5 - cx, lpy = y + 0.5, ax2 = Math.abs(lpx), hwl = Math.max(hwHead(G, Math.min(lpy, G.yChin - 2)), G.W * 0.55);
        var outer = hwl + volS + (hs.wave ? 0.8 * u * Math.sin(lpy * 0.8 / u) : 0) - Math.max(0, lpy - G.yChin) * 0.05;
        var inner = lpy < G.yChin - 2 * u ? hwHead(G, lpy) - inset : G.nw + 1.2 * u + Math.max(0, lpy - G.y0) * 0.5;
        var end = G.yChin + 9 * u + 2.4 * u * tri(lpx / (2.4 * u));
        if (ax2 < outer && ax2 > inner && lpy < end && lpy >= sideY - 1) {
          var ls = (lpx < 0 ? 2 : 1) + (ax2 - inner < 1.2 ? -1 : 0) + ((x + (hs.wave ? Math.round(Math.sin(lpy * 0.8 / u) * 1.5) : 0)) % 3 === 0 ? -1 : 0);
          put(x, y, HA, Math.max(0, ls) + (lpy < G.yE + 3 * u && lpx < 0 ? 1 : 0));
        }
      }
    }
    if (hs.back === 'braid') {   // one braid over the left shoulder
      var segs = Math.round(5 + 1 * u), bx0 = cx - G.W + 0.6 * u, by0 = G.yChin - 2 * u;
      for (var k2 = 0; k2 < segs; k2++) {
        var scx = bx0 - k2 * 0.35 * u, scy = by0 + k2 * 2.6 * u, srx = 2.2 * u - k2 * 0.08 * u, sry = 1.7 * u;
        for (y = Math.floor(scy - sry); y <= scy + sry; y++) for (x = Math.floor(scx - srx); x <= scx + srx; x++) {
          var bdx = (x + 0.5 - scx) / srx, bdy = (y + 0.5 - scy) / sry;
          if (bdx * bdx + bdy * bdy < 1) put(x, y, HA, bdy < -0.2 && bdx < 0.3 ? 3 : bdy > 0.45 || bdx > 0.6 ? 1 : 2);
        }
      }
      var tieY = Math.round(by0 + segs * 2.6 * u - 1.2 * u), tieX = Math.round(bx0 - segs * 0.35 * u);
      put(tieX - 1, tieY, TR, 3); put(tieX, tieY, TR, 2); put(tieX - 1, tieY + 1, TR, 1); put(tieX, tieY + 1, TR, 1);
      for (x = tieX - 2; x <= tieX + 1; x++) put(x, tieY + 2, HA, 1);
      put(tieX - 1, tieY + 3, HA, 0);
    }

    // hair edges: darker where hair meets skin; a soft cast shadow on the forehead under the fringe
    for (y = 1; y < S; y++) for (x = 0; x < S; x++) {
      i = y * S + x;
      if (mat[i] === SK && mat[i - S] === HA && sh[i] > 1) sh[i] -= 1;
    }
    for (y = 0; y < S - 1; y++) for (x = 0; x < S; x++) {
      i = y * S + x;
      if (mat[i] === HA && mat[i + S] === SK && sh[i] > 0) sh[i] = Math.min(sh[i], 1);
      if (mat[i] === HA && x > 0 && x < S - 1 && (mat[i - 1] === SK || mat[i + 1] === SK) && y > G.yE - 2 * u && y < G.yChin) sh[i] = Math.min(sh[i], 1);
      if (mat[i] === SK && x > 0 && x < S - 1 && (mat[i - 1] === HA || mat[i + 1] === HA) && y > G.yE - 2 * u && sh[i] > 2) sh[i] = 2;
    }

    // 8. headgear
    if (o.headgear === 'hood') {
      var hm = o.hood === 'trim' ? TR : HO, hRx = G.W + volS + 2.2 * u, hYc = G.yE - 1, hRy = hYc - (G.yTop - vol - 2.2 * u);
      var oCy = (G.yTop + 1.6 * u + G.yChin + 0.6 * u) / 2, oRy = (G.yChin + 0.6 * u - G.yTop - 1.6 * u) / 2, oRx = G.W + 0.2 * u;
      for (y = 0; y < S; y++) for (x = 0; x < S; x++) {
        var opx = x + 0.5 - cx, opy = y + 0.5, inside;
        if (opy < hYc) inside = (opx / hRx) * (opx / hRx) + ((opy - hYc) / hRy) * ((opy - hYc) / hRy) < 1;
        else inside = Math.abs(opx) < Math.min(hRx + (opy - hYc) * 0.3, G.W + 5 * u) && opy < G.y0 + 2.5 * u - Math.max(0, Math.abs(opx) - G.W) * 0.4;
        if (!inside) continue;
        var oe = (opx / oRx) * (opx / oRx) + ((opy - oCy) / oRy) * ((opy - oCy) / oRy);
        if (oe < 1 && opy < G.yChin + 0.6 * u) continue;     // the face opening
        var hl = light(opx / hRx, (opy - hYc) / (hRy * 1.2), 0.7), hsd = q5(hl + 0.06);
        if (oe < 1.35 && opy < G.yChin + 1.2 * u) hsd = oe < 1.16 ? 0 : Math.min(hsd, 1);       // inner rim in shadow
        if (opy > G.yChin && opy < G.y0 + 2.5 * u && Math.abs(Math.sin(opx / (1.4 * u) + opy * 0.2)) < 0.22) hsd = Math.max(0, hsd - 1);   // cowl folds
        put(x, y, hm, hsd);
      }
      for (y = 1; y < S; y++) for (x = 0; x < S; x++) { i = y * S + x; if ((mat[i] === SK || mat[i] === HA) && (mat[i - S] === hm || (x > 0 && mat[i - 1] === hm) || (x < S - 1 && mat[i + 1] === hm)) && sh[i] > 0 && y < G.yN) sh[i] -= 1; }
    }
    if (o.headgear === 'helmet') {
      var mtl = o.metal === 'gold' ? GD : MT, yRim = Math.round(G.yB - 2.2 * u), hrx = G.W + volS + 0.8 * u, hry = yc - (G.yTop - vol - 0.6 * u);
      for (y = 0; y < yRim + 1; y++) for (x = 0; x < S; x++) {
        var mpx2 = x + 0.5 - cx, mpy = y + 0.5, me = (mpx2 / hrx) * (mpx2 / hrx) + ((mpy - yc) / hry) * ((mpy - yc) / hry);
        if (me >= 1) continue;
        var ml2 = light(mpx2 / hrx, (mpy - yc) / hry, 0.55), ms = ml2 > 0.94 ? 4 : ml2 > 0.74 ? 3 : ml2 > 0.42 ? 2 : ml2 > 0.05 ? 1 : 0;
        if (y >= yRim - Math.round(1 * u)) ms = y === yRim ? 1 : Math.min(4, ms + 1);          // rim band
        if (Math.abs(mpx2) < 0.6 && y < yRim - 1 && y > G.yTop - vol) ms = Math.max(0, ms - 1);    // centre ridge
        put(x, y, mtl, ms);
      }
      for (x = Math.floor(cx - G.W); x < cx + G.W; x += Math.max(3, Math.round(3.5 * u))) if (mat[(yRim - 1) * S + x] === mtl) { put(x, yRim - 1, mtl, 4); }
      // cheek guards over the ears
      for (y = yRim; y < G.yN; y++) for (x = 0; x < S; x++) {
        var gpx = x + 0.5 - cx, ghw = hwHead(G, y + 0.5);
        if (Math.abs(gpx) > ghw - 0.5 * u && Math.abs(gpx) < ghw + 1.4 * u + volS * 0.5) put(x, y, mtl, (gpx < 0 ? 3 : 1) - (y > G.yN - 2 ? 1 : 0));
      }
      if (o.seed % 2 === 0) for (y = yRim; y < G.yE + 1; y++) { put(Math.floor(cx) - 1, y, mtl, 3); put(Math.floor(cx), y, mtl, 1); }   // nose guard
    }
    if (o.headgear === 'circlet' || o.headgear === 'headband') {
      var band = o.headgear === 'circlet' ? GD : TR, th3 = o.headgear === 'circlet' ? Math.max(1, Math.round(u)) : Math.round(2 * u), yb0 = G.yB - Math.round(4.6 * u) - th3 + 1;
      for (x = 0; x < S; x++) {
        var cpx3 = x + 0.5 - cx, xr3 = cpx3 / (G.W + volS), yy = Math.round(yb0 + (1 - xr3 * xr3) * 1.2 * u);
        if (Math.abs(xr3) >= 1) continue;
        for (var t3 = 0; t3 < th3; t3++) { var cm = at(x, yy + t3); if (cm === SK || cm === HA) put(x, yy + t3, band, t3 === 0 ? (cpx3 < 0 ? 4 : 3) : (cpx3 < 0 ? 2 : 1)); }
      }
      if (o.headgear === 'circlet') {
        var gx = Math.floor(cx) - 1, gy = Math.round(yb0 + 1.2 * u) - 1;
        put(gx, gy, GM, 4); put(gx + 1, gy, GM, 2); put(gx, gy + 1, GM, 2); put(gx + 1, gy + 1, GM, 1); put(gx, gy + 2, GD, 1); put(gx + 1, gy + 2, GD, 1);
      } else {
        var kx = Math.round(cx + G.W + volS - 1); put(kx, Math.round(yb0 + 1.4 * u) + th3, TR, 2); put(kx + 1, Math.round(yb0 + 1.4 * u) + th3 + 1, TR, 1); put(kx, Math.round(yb0 + 1.4 * u) + th3 + 2, TR, 1);
      }
    }

    // 9. marks
    var scar = null;
    if (o.mark === 'scar') {
      scar = {}; var sd = o.seed % 3 === 0 ? -1 : 1, sx0 = sd < 0 ? G.eyeL + G.ew - 2 : G.eyeR + 1;
      for (y = G.yB - 2; y < G.yE + G.eh + Math.round(2.6 * u); y++) {
        var sxx = sx0 + sd * Math.round((y - G.yB + 2) * 0.35);
        if (at(sxx, y) === SK) { put(sxx, y, SK, 4); scar[y * S + sxx] = 1; if (at(sxx + 1, y) === SK && (y < G.yE - 1 || y >= G.yE + G.eh)) put(sxx + 1, y, SK, 1); }
      }
    }
    var patch = null;
    if (o.mark === 'eyepatch') {
      var px0 = G.eyeR - 1, py0 = G.yE - 1, pw = G.ew + 2, ph = G.eh + 1;
      patch = { x: px0, y: py0, w: pw, h: ph };
      for (y = py0; y < py0 + ph; y++) for (x = px0; x < px0 + pw; x++) {
        var corner = (x === px0 || x === px0 + pw - 1) && (y === py0 || y === py0 + ph - 1);
        if (!corner) put(x, y, PA, y === py0 ? 3 : x === px0 ? 2 : (y === py0 + ph - 1 || x === px0 + pw - 1) ? 0 : 1);
      }
      for (var k3 = 1; k3 < 12 * u; k3++) { var stx = px0 + pw - 1 + k3, sty = py0 - Math.round(k3 * 0.55); if (at(stx, sty) !== E && at(stx, sty) !== PA) put(stx, sty, PA, 2); var st2 = px0 - k3, st2y = py0 - Math.round(k3 * 0.7); if (at(st2, st2y) !== E && at(st2, st2y) !== PA && st2y > G.yTop - vol) put(st2, st2y, PA, 2); }
    }
    if (o.mark === 'earring' && earVisible) {
      [-1, 1].forEach(function (sd2) { var ex3 = Math.round(cx + sd2 * (hwHead(G, earY) + 1 * u)) - (sd2 > 0 ? 1 : 0), ey3 = Math.round(earY + 2.6 * u); if (at(ex3, ey3 - 1) === SK) { put(ex3, ey3, GD, 4); put(ex3, ey3 + 1, GD, 2); } });
    }

    // silhouette outline pixels (outside, 4-neighbour), and a soft inner contour where the jaw meets the neck
    var outl = [];
    for (y = 0; y < S; y++) for (x = 0; x < S; x++) {
      if (mat[y * S + x] !== E) continue;
      var n4 = at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1);
      if (n4) outl.push(y * S + x);
    }
    for (y = Math.floor(G.yChin - 2 * u); y < Math.ceil(G.yChin + 2 * u) && y < S - 1; y++) for (x = 0; x < S; x++) {
      i = y * S + x;
      if (mat[i] === SK && mat[i + S] === SK && hwHead(G, y + 0.5) > 0 && hwHead(G, y + 1.5) === 0 && sh[i + S] > 0) sh[i + S] = 0;
    }
    var skR = colorRamp(SKIN, o.skin, 'fair');
    return { G: G, mat: mat, sh: sh, outline: outl, scar: scar, patch: patch, darkSkin: lum(skR[2]) < 0.37 };
  }

  /* ---------------- expressions: brows, eyes and mouth only ---------------- */
  var EXPR = {
    neutral: { brow: [0, 0, 0, 0.6], eye: 'open', mouth: 'neutral', talk: 'oval' },
    happy: { brow: [1, 0, 0, 1.2], eye: 'smile', mouth: 'smile', talk: 'grin' },
    angry: { brow: [0, 2, -1, 0], eye: 'open', lidIn: 1, thickIn: 1, mouth: 'frown', talk: 'teeth' },
    sad: { brow: [0, -2, 1, 0], eye: 'open', lidOut: 1, lookDown: 1, thickIn: 1, mouth: 'sad', talk: 'oval' },
    surprised: { brow: [2, 0, 0, 1], eye: 'wide', pupil: 'small', mouth: 'o', talk: 'o' },
    determined: { brow: [0, 1, 0, 0], eye: 'narrow', lidIn: 1, thickIn: 1, mouth: 'firm', talk: 'teeth' },
    hurt: { brow: [0, -2, 1, 0], eye: 'squeeze', thickIn: 1, sweat: 1, mouth: 'grit', talk: 'gritTalk' }
  };
  function applyFeatures(base, o, expr, eyes, mouth) {
    var G = base.G, S = G.S, u = G.u, cx = G.cx, mat = new Uint8Array(base.mat), sh = new Int8Array(base.sh);
    var X = EXPR[expr] || EXPR.neutral, F = o.gender === 'female';
    function put(x, y, m, s) { if (x < 0 || y < 0 || x >= S || y >= S) return; var i = y * S + x; mat[i] = m; sh[i] = s < 0 ? 0 : s > 4 ? 4 : s; }
    function at(x, y) { return x < 0 || y < 0 || x >= S || y >= S ? E : mat[y * S + x]; }
    function onFace(x, y) { var m = at(x, y); return m === SK || m === ST || m === BL; }
    function inPatch(x, y) { var p = base.patch; return p && x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h; }

    // brows
    var bt = o.brows === 'thick' ? 2 : 1, bw = G.ew + 1, b = X.brow, lift = b[0], inner = b[1], outer = b[2], arch = Math.min(1.2, b[3] + (o.brows === 'arched' ? 0.6 : 0));
    if (eyes === 'closed' && expr === 'neutral') { /* blink keeps the brows */ }
    var darkSkin = base.darkSkin, hiAbove = [];
    [-1, 1].forEach(function (sd) {
      var prevY = null;
      for (var c = 0; c < bw; c++) {
        var t = c / (bw - 1), dy = outer * (1 - t) + inner * t - arch * 4 * t * (1 - t);
        var y = Math.round(G.yB - lift + dy), x = sd < 0 ? G.eyeL - 1 + c : G.eyeR + G.ew - c;
        y = Math.min(y, G.yE - 1);
        var ys = [y]; if (prevY != null && Math.abs(y - prevY) > 1) ys.push(y + (prevY > y ? 1 : -1));
        ys.forEach(function (yy) {
          if (base.scar && base.scar[yy * S + x]) return;
          if (onFace(x, yy)) put(x, yy, BR, bt === 2 ? 1 : 0);
          if (bt === 2 && c >= 1 && c < bw - 1 && onFace(x, yy + 1) && yy + 1 < G.yE - 0) put(x, yy + 1, BR, 0);
          if (bt === 1 && X.thickIn && c >= bw - 3 && onFace(x, yy + 1) && yy + 1 < G.yE - 1) put(x, yy + 1, BR, 0);
          if (darkSkin && c > 0 && onFace(x, yy - 1) && at(x, yy - 1) !== BR) hiAbove.push([x, yy - 1]);
        });
        if (o.brows === 'thin' && (c === 0) && onFace(x, y)) put(x, y, BR, 1);
        prevY = y;
      }
    });
    hiAbove.forEach(function (q) { if (onFace(q[0], q[1])) put(q[0], q[1], SK, 4); });   // a lit ridge above the brow, so its angle reads on dark skin

    // eyes
    var mode = X.eye;
    if (eyes === 'closed' && mode !== 'smile' && mode !== 'squeeze') mode = 'closed';
    else if (eyes === 'half' && (mode === 'open' || mode === 'wide' || mode === 'narrow')) mode = 'half';
    var ew = G.ew, eh = G.eh, look = Math.max(-1, Math.min(1, Math.round(+o.look || 0)));
    [-1, 1].forEach(function (sd) {
      var x0 = sd < 0 ? G.eyeL : G.eyeR, y0 = G.yE;
      if (base.patch && sd > 0) return;
      // col c: 0 = outer corner, ew - 1 = inner corner
      var X0 = function (c) { return sd < 0 ? x0 + c : x0 + ew - 1 - c; };
      var P = function (c, r, m, s) { var xx = X0(c), yy = y0 + r; if (!inPatch(xx, yy)) put(xx, yy, m, s); };
      var lash = function (c, r) { P(c, r, LN, 0); };
      if (mode === 'smile') {
        for (var c = 1; c < ew - 1; c++) lash(c, Math.round(eh / 2) - 1);
        lash(0, Math.round(eh / 2)); lash(ew - 1, Math.round(eh / 2));
        for (c = 1; c < ew - 1; c++) P(c, eh - 1, SK, 3);
        if (F) lash(-1, Math.round(eh / 2) - 1);
        return;
      }
      if (mode === 'squeeze') {
        var mid = Math.round((eh - 1) / 2) + 1;
        lash(0, mid - 1); for (c = 1; c < ew; c++) lash(c, mid); lash(0, mid + 1);
        if (ew >= 5) { P(1, mid - 1, LN, 1); P(1, mid + 1, LN, 1); }
        return;
      }
      if (mode === 'closed') {
        var rr = eh - 2;
        for (c = 0; c < ew; c++) lash(c, rr);
        for (c = 1; c < ew - 1; c++) P(c, rr - 1, SK, 2);
        if (F) lash(-1, rr - 1);
        return;
      }
      var top = mode === 'wide' ? -1 : mode === 'half' || mode === 'narrow' ? 1 : 0, bottom = eh - 2;
      if (top > bottom) { for (c = 0; c < ew; c++) lash(c, bottom); return; }
      if (mode === 'wide') for (c = 1; c < ew - 1; c++) P(c, -1, LN, 0); else for (c = 0; c < ew; c++) lash(c, top);
      if (mode === 'wide') { P(0, 0, LN, 0); P(ew - 1, 0, LN, 0); }
      if (mode === 'half' || mode === 'narrow') for (c = 1; c < ew - 1; c++) P(c, 0, SK, 2);
      if (o.eyes === 'heavy' && mode !== 'wide') for (c = 1; c < ew - 1; c++) if (onFace(X0(c), y0 + top - 1)) P(c, top - 1, SK, 1);
      if (F) lash(-1, top);
      var r0 = mode === 'wide' ? 0 : top + 1;
      for (var r = r0; r <= bottom; r++) for (c = 0; c < ew; c++) {
        var almond = ew >= 5 && r === bottom && r > r0 && (c === 0 || c === ew - 1);
        P(c, r, almond ? SK : SC, almond ? 2 : r === r0 && bottom > r0 ? 2 : 3);
      }
      // iris (screen-space, so the catchlight sits top-left on both eyes)
      var iw = ew >= 6 ? 4 : ew >= 5 ? 3 : 2, xs = Math.min(X0(0), X0(ew - 1)), ix = xs + Math.round((ew - iw) / 2) + look;
      ix = Math.max(xs, Math.min(xs + ew - iw, ix));
      var ir0 = mode === 'wide' ? 1 : r0, ir1 = bottom, irows = ir1 - ir0 + 1;
      if (X.lookDown && irows >= 2) ir0 += 0;
      for (r = ir0; r <= ir1; r++) for (var k = 0; k < iw; k++) {
        var xx = ix + k, yy = y0 + r; if (inPatch(xx, yy)) continue;
        var s = r === ir0 ? 1 : r === ir1 ? 3 : 2, m = IR;
        var pc = iw === 2 ? 1 : Math.floor(iw / 2) - (iw === 4 ? 0 : 0);
        var pupil = X.pupil === 'small' ? (k === pc && r === ir0 + (irows > 2 ? 1 : 0)) : (iw === 4 ? (k === 1 || k === 2) : k === pc) && r < ir1 + (irows <= 2 ? 0 : 0) && (r === ir0 || irows > 2 && r === ir0 + 1);
        if (pupil) { m = LN; s = 0; }
        if (k === 0 && r === ir0) { m = SC; s = 4; }
        if (irows === 1 && k === iw - 1 && !pupil) s = 1;
        put(xx, yy, m, s);
      }
      if (X.lidIn) P(ew - 1, r0, LN, 0);
      if (X.lidOut) P(0, r0, LN, 0);
      // lower lid
      if (mode !== 'wide') for (c = 1; c < ew - 1; c++) if (onFace(X0(c), y0 + bottom + 1)) P(c, bottom + 1, SK, Math.max(1, sh[(y0 + bottom + 1) * S + X0(c)] - 1));
    });

    if (X.sweat) {   // a sweat drop at the temple on the lit side
      var sx = Math.max(1, G.eyeL - 2), sy = G.yB - 1;
      [[0, 0, 4], [0, 1, 3], [-1, 2, 2], [0, 2, 3], [-1, 3, 1], [0, 3, 2]].forEach(function (d) { if (at(sx + d[0], sy + d[1]) !== E) put(sx + d[0], sy + d[1], SW, d[2]); });
    }
    // mouth (centred between the two middle columns)
    var mode2 = mouth > 0 ? X.talk : X.mouth, w = G.mw, rows = MOUTHS[mode2] ? MOUTHS[mode2](w, mouth, F || o.mouth === 'full') : [];
    var yM = G.yM;
    rows.forEach(function (row) {
      var str = row[1], off = Math.round(cx - str.length / 2);
      for (var k = 0; k < str.length; k++) {
        var ch = str[k], x = off + k, y = yM + row[0], cur = at(x, y);
        if (ch === '.' || ch === ' ') continue;
        if (cur === E) continue;
        var spec = MCH[ch]; if (!spec) continue;
        if (spec[0] === SK) { if (cur === SK || cur === ST) put(x, y, SK, spec[1] === 'd' ? Math.max(0, sh[y * S + x] - 1) : spec[1] === 'l' ? Math.min(4, sh[y * S + x] + 1) : spec[1]); }
        else put(x, y, spec[0], spec[1]);
      }
    });
    return { mat: mat, sh: sh };
  }
  var MCH = { D: [MO, 1], '0': [MO, 0], T: [TE, 3], t: [TE, 2], X: [TO, 2], L: [MO, 3], l: [MO, 2], s: [SK, 'd'], h: [SK, 'l'] };
  function rep(c, n) { var s = ''; for (var i = 0; i < n; i++) s += c; return s; }
  // each returns [[rowOffset, string], ...]; level 0 = closed, 1 = half open, 2 = open
  var MOUTHS = {
    neutral: function (w, lv, full) { return [[0, 's' + rep('D', w - 2) + 's'], [1, ' ' + (full ? 'L' + rep('l', w - 4) + 'L' : rep('h', w - 2)) + ' ']]; },
    smile: function (w, lv, full) { return [[-1, 'D' + rep(' ', w - 2) + 'D'], [0, 's' + rep('D', w - 2) + 's'], [1, ' ' + rep(full ? 'L' : 'h', w - 2) + ' ']]; },
    frown: function (w) { return [[-1, ' ' + rep('s', w - 2) + ' '], [0, ' ' + rep('D', w - 2) + ' '], [1, 'D' + rep(' ', w - 2) + 'D']]; },
    sad: function (w) { var n = Math.max(2, w - 2); return [[0, ' ' + rep('D', n - 2) + ' '], [1, 'D' + rep(' ', n - 2) + 'D'], [2, ' ' + rep('h', n - 2) + ' ']]; },
    o: function (w, lv) { if (lv >= 2 || w >= 6) return [[-1, ' DD '], [0, 'D00D'], [1, 'D0XD'], [2, ' DD ']]; return [[0, ' DD '], [1, 'D00D'], [2, ' DD ']]; },
    firm: function (w) { return [[0, rep('D', w)], [1, ' ' + rep('s', w - 2) + ' ']]; },
    grit: function (w) { var n = Math.max(6, w + 2), t = ''; for (var i = 0; i < n - 2; i++) t += i % 2 ? 't' : 'T'; return [[-1, ' ' + rep('D', n - 2) + ' '], [0, 'D' + t + 'D'], [1, ' ' + rep('D', n - 2) + ' '], [2, 'D' + rep(' ', n - 2) + 'D']]; },
    gritTalk: function (w, lv) { var n = Math.max(4, w); return lv === 1 ? [[-1, rep('D', n)], [0, 'D' + rep('T', n - 2) + 'D'], [1, 'D' + rep('0', n - 2) + 'D'], [2, ' ' + rep('D', n - 2) + ' ']] : [[-1, rep('D', n)], [0, 'D' + rep('T', n - 2) + 'D'], [1, 'D' + rep('0', n - 2) + 'D'], [2, 'D' + rep('t', n - 2) + 'D'], [3, ' ' + rep('D', n - 2) + ' ']]; },
    oval: function (w, lv, full) {
      if (lv === 1) return [[0, rep('D', w)], [1, ' ' + rep('0', w - 2) + ' '], [2, ' ' + rep(full ? 'L' : 'h', w - 2) + ' ']];
      return [[0, ' ' + rep('D', w - 2) + ' '], [1, 'D' + rep('T', w - 2) + 'D'], [2, 'D' + rep('0', w - 2) + 'D'], [3, ' ' + rep('X', w - 2) + ' '], [4, ' ' + rep(full ? 'L' : 'h', w - 2) + ' ']];
    },
    grin: function (w, lv) {
      if (lv === 1) return [[-1, 'D' + rep(' ', w - 2) + 'D'], [0, 'D' + rep('T', w - 2) + 'D'], [1, ' ' + rep('D', w - 2) + ' ']];
      return [[-1, 'D' + rep(' ', w) + 'D'], [0, 'D' + rep('T', w) + 'D'], [1, ' D' + rep('0', w - 2) + 'D '], [2, '  ' + rep('X', w - 2) + '  ']];
    },
    teeth: function (w, lv) {
      if (lv === 1) return [[0, rep('D', w)], [1, 'D' + rep('T', w - 2) + 'D'], [2, ' ' + rep('D', w - 2) + ' ']];
      return [[-1, ' ' + rep('D', w) + ' '], [0, 'D' + rep('T', w) + 'D'], [1, 'D' + rep('0', w) + 'D'], [2, ' ' + rep('t', w) + ' ']];
    }
  };

  /* ---------------- raster: materials -> RGBA ---------------- */
  function ramps(o) {
    var skin = colorRamp(SKIN, o.skin, 'fair'), hair = colorRamp(HAIR, o.hairColor, 'brown');
    var cloth = colorRamp({}, CLOTH[o.cloth] || o.cloth, 'x') || ramp('#2e4a8a'), trim = colorRamp({}, CLOTH[o.trim] || o.trim, 'x') || ramp('#d6c69e');
    var line = LINE, mouthR = [mix(skin[0], '#1c0610', 0.55), mix(skin[0], '#40121c', 0.45), mix(skin[1], '#8a3040', 0.3), mix(skin[2], '#cc5a6a', 0.38), mix(skin[3], '#f09a9a', 0.3)];
    var T = []; T[SK] = skin; T[HA] = hair; T[BR] = [mix(hair[0], LINE[0], 0.72), mix(hair[1], LINE[1], 0.45), hair[1], hair[2], hair[3]];
    if (lum(T[BR][0]) > lum(skin[3]) * 0.4) T[BR][0] = LINE[0];          // brows always at least ~60 % darker than the lit skin
    if (lum(T[BR][1]) > lum(skin[3]) * 0.55) T[BR][1] = mix(LINE[0], hair[0], 0.3);
    T[CL] = cloth; T[TR] = trim; T[MT] = METAL[o.metal] || METAL.steel; T[GD] = o.metal === 'bronze' ? METAL.bronze : METAL.gold; T[SC] = SCLERA;
    T[IR] = colorRamp(EYE, o.eyeColor, 'brown'); T[LN] = line; T[MO] = mouthR; T[TE] = TEETH; T[TO] = TONGUE; T[GM] = GEM[o.gem] || GEM.ruby;
    T[HO] = o.hood === 'trim' ? trim : cloth; T[PA] = PATCH; T[SW] = SWEAT;
    T[BL] = skin.map(function (c, k) { return mix(c, '#ff6a86', k >= 2 ? 0.2 : 0.12); });
    T[ST] = skin.map(function (c) { return mix(c, hair[0], 0.32); });
    return T;
  }
  function raster(p, expr, eyes, mouth, outlineCol) {
    var S = p.size, f = applyFeatures(p.base, p.spec, expr, eyes, mouth), T = p.ramps, data = new Uint8ClampedArray(S * S * 4);
    for (var i = 0; i < S * S; i++) {
      var m = f.mat[i]; if (!m) continue; var c = T[m] && T[m][f.sh[i]]; if (!c) c = [255, 0, 255];
      data[i * 4] = c[0]; data[i * 4 + 1] = c[1]; data[i * 4 + 2] = c[2]; data[i * 4 + 3] = 255;
    }
    var oc = hexRgb(outlineCol || '#06061a'), soft = p.outlineMode === 'soft';
    p.base.outline.forEach(function (j) {
      var c = oc;
      if (soft) { var x = j % S, y = (j - x) / S, best = null; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var xx = x + d[0], yy = y + d[1]; if (xx < 0 || yy < 0 || xx >= S || yy >= S) return; var mm = f.mat[yy * S + xx]; if (mm && !best) best = T[mm][0]; }); if (best) c = mix(best, oc, 0.55); }
      data[j * 4] = c[0]; data[j * 4 + 1] = c[1]; data[j * 4 + 2] = c[2]; data[j * 4 + 3] = 255;
    });
    return { w: S, h: S, data: data };
  }

  /* ---------------- portraits ---------------- */
  function make(spec, opts) {
    opts = opts || {};
    if (spec && spec.__portrait) return spec;
    var o = resolveSpec(spec), S = +(opts.size || o.size || DEFAULTS.size);
    S = S >= 56 ? 64 : S <= 40 ? 32 : 48;
    if (S === 32) S = 48;
    var p = { __portrait: true, spec: o, name: o.name, size: S, base: null, ramps: null, cache: {}, outlineMode: opts.outline || o.outline || 'ink' };
    try { p.base = buildBase(o, S); p.ramps = ramps(o); } catch (e) { warn('make', 'portrait build failed: ' + e); p.base = null; }
    return p;
  }

  var warned = {};
  function warn(key, msg) { if (warned[key]) return; warned[key] = 1; try { if (root.console) console.warn('GameDNA_Portraits: ' + msg); } catch (e) { } }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hit(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  function okRect(r) { return r && isFinite(r.x) && isFinite(r.y) && r.w > 0 && r.h > 0; }
  function mkCanvas(w, h) { try { var c = root.document.createElement('canvas'); c.width = w; c.height = h; return c; } catch (e) { return null; } }
  function skinOf(x) { if (x === false || !root.GameDNA_Skin) return null; try { return root.GameDNA_Skin.resolve(x); } catch (e) { return null; } }
  function tok(SKN, path, fb) { if (SKN) { try { var v = SKN.token(path); if (typeof v === 'string' && v !== path && (v.charAt(0) === '#' || /^rgb/.test(v))) return v; } catch (e) { } } return fb; }
  function outlineColor(SKN, override) {
    if (override && /^#|^rgb/.test(override)) return override;
    if (SKN) { var c = SKN.outline && SKN.outline.sprite && SKN.outline.sprite.color; var v = c ? tok(SKN, c, null) || (/^#/.test(c) ? c : null) : null; if (v && /^#/.test(v)) return v; var ink = tok(SKN, 'ink', null); if (ink && /^#/.test(ink)) return ink; }
    return '#06061a';
  }

  /* ---------------- frames of one portrait (cached tiny canvases) ---------------- */
  var EYES = { open: 'open', half: 'half', closed: 'closed' };
  function variant(p, expr, eyes, mouth, olc, dim) {
    if (!p || !p.base) return null;
    var key = expr + '|' + eyes + '|' + mouth + '|' + olc + '|' + (dim ? 1 : 0), c = p.cache[key];
    if (c !== undefined) return c;
    var keys = Object.keys(p.cache); if (keys.length > 160) p.cache = {};
    var R2 = raster(p, expr, eyes, mouth, olc);
    if (dim) for (var i = 0; i < R2.data.length; i += 4) { R2.data[i] = R2.data[i] * 0.5 + 10; R2.data[i + 1] = R2.data[i + 1] * 0.5 + 10; R2.data[i + 2] = R2.data[i + 2] * 0.56 + 22; }
    c = mkCanvas(R2.w, R2.h);
    if (c) { var g = c.getContext('2d'), im = g.createImageData(R2.w, R2.h); im.data.set(R2.data); g.putImageData(im, 0, 0); }
    p.cache[key] = c;
    return c;
  }
  // blink: a fixed, seed-varied period; the last 150 ms of each period is half / closed / half
  function blinkAt(p, t, every) {
    var seed = p && p.spec ? p.spec.seed : 1, per = num(every, DEFAULTS.blinkMs) * (0.8 + (hashStr('b' + seed) % 1000) / 2500), ph = hashStr('p' + seed) % 2000;
    if (!(per > 400)) return 'open';
    var k = (num(t, 0) + ph) % per, e = per - k;
    return e > 150 ? 'open' : e > 110 || e <= 40 ? 'half' : 'closed';
  }
  function mouthAt(t, every) { var seq = [1, 2, 1, 0]; return seq[Math.floor(Math.max(0, num(t, 0)) / Math.max(30, num(every, DEFAULTS.mouthMs))) % 4]; }
  // enter / exit: k = 0..1 progress (1 = fully on screen); dir = -1 enters from the left, 1 from the right
  function transition(kind, k, dir, dist, pixel) {
    k = clamp(num(k, 1), 0, 1); var e = 1 - Math.pow(1 - k, 3), a = 1, dx = 0;
    if (kind === 'slide') { dx = Math.round((1 - e) * (dist || 24) * (dir || -1)); a = k; }
    else if (kind === 'fade') a = k;
    else a = k > 0 ? 1 : 0;
    if (pixel !== false) a = Math.ceil(a * 4 - 1e-6) / 4;
    return { dx: dx, alpha: a };
  }
  function draw(ctx, p, x, y, opts) {
    try {
      if (!ctx || !p) return false;
      if (!p.__portrait) p = make(p);
      opts = opts || {};
      var expr = EXPR[opts.expr] ? opts.expr : 'neutral', SKN = opts.skin === undefined ? skinOf(undefined) : skinOf(opts.skin);
      var eyes = opts.blink === true ? 'closed' : EYES[opts.blink] || (opts.t != null && opts.blink !== false ? blinkAt(p, opts.t, opts.blinkMs) : 'open');
      var mouth = opts.mouth != null ? clamp(Math.round(opts.mouth), 0, 2) : opts.talking ? (opts.t != null ? mouthAt(opts.t, opts.mouthMs) : 1) : 0;
      var img = variant(p, expr, eyes, mouth, outlineColor(SKN, opts.outline), !!opts.dim);
      if (!img) return false;
      var a = opts.alpha == null ? 1 : clamp(num(opts.alpha, 1), 0, 1); if (a <= 0) return true;
      ctx.save();
      try {
        ctx.imageSmoothingEnabled = false; if (a < 1) ctx.globalAlpha *= a;
        x = Math.round(num(x, 0)); y = Math.round(num(y, 0));
        if (opts.flip) { ctx.translate(x + p.size, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0); }
        else ctx.drawImage(img, x, y);
      } finally { ctx.restore(); }
      return true;
    } catch (e) { warn('draw', 'draw failed: ' + e); return false; }
  }
  // the framed panel: window frame (through the skin), a banded backdrop from spec.bg, the portrait bottom-aligned
  function panelSize(size, frame) { var pad = frame === 'none' ? 0 : 4; return { w: size + 2 * pad, h: size + 2 * pad, pad: pad }; }
  function frame16(g, r) {
    g.fillStyle = '#06061a'; g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = '#d8deff'; g.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    g.fillStyle = '#5a64a8'; g.fillRect(r.x + 2, r.y + 2, r.w - 3, r.h - 3);
    g.fillStyle = '#0e1238'; g.fillRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
    return { x: r.x + 4, y: r.y + 4, w: r.w - 8, h: r.h - 8 };
  }
  function backdrop(g, p, r, mode, SKN) {
    if (mode === 'none') return;
    var base = mode === 'skin' ? tok(SKN, 'ui.fill', '#1a2a6a') : (BG[p.spec.bg] || (/^#/.test(String(p.spec.bg)) ? p.spec.bg : BG.slate));
    var bands = [mix(base, '#ffffff', 0.12), hexRgb(base), mix(base, '#000010', 0.22), mix(base, '#000010', 0.4)], n = bands.length;
    for (var yy = 0; yy < r.h; yy++) {
      var f = yy / r.h * n, b = Math.floor(f), fr = f - b;
      for (var xx = 0; xx < r.w; xx++) {
        var k = b; if (b < n - 1 && fr > 0.75 && ((xx + yy) % 2 === 0)) k = b + 1;
        var c = bands[Math.min(n - 1, k)]; g.fillStyle = rgbHex(c); g.fillRect(r.x + xx, r.y + yy, 1, 1);
      }
    }
    var halo = mix(bands[0], '#ffffff', 0.08), cx = r.x + r.w / 2 - r.w * 0.12, cy = r.y + r.h * 0.38, rad = r.w * 0.36;
    g.fillStyle = rgbHex(halo);
    for (yy = Math.floor(cy - rad); yy < cy + rad; yy++) for (xx = Math.floor(cx - rad); xx < cx + rad; xx++) {
      var d = Math.hypot(xx + 0.5 - cx, yy + 0.5 - cy) / rad; if (d < 0.8 || d < 1 && (xx + yy) % 2 === 0) g.fillRect(xx, yy, 1, 1);
    }
  }
  var BGCACHE = {};
  function backdropCanvas(p, w, h, mode, SKN) {
    var key = p.spec.bg + '|' + w + '|' + h + '|' + mode + '|' + (mode === 'skin' ? tok(SKN, 'ui.fill', '') : ''), c = BGCACHE[key];
    if (c !== undefined) return c;
    c = mkCanvas(w, h); if (c) backdrop(c.getContext('2d'), p, { x: 0, y: 0, w: w, h: h }, mode, SKN);
    BGCACHE[key] = c; return c;
  }
  function drawPanel(ctx, p, rect, opts) {
    try {
      if (!ctx || !p) return null;
      if (!p.__portrait) p = make(p);
      opts = opts || {};
      var SKN = opts.skin === undefined ? skinOf(undefined) : skinOf(opts.skin), fr = opts.frame || 'window', ps = panelSize(p.size, fr);
      var r = { x: Math.round(num(rect && rect.x, 0)), y: Math.round(num(rect && rect.y, 0)), w: ps.w, h: ps.h };
      var a = opts.alpha == null ? 1 : clamp(num(opts.alpha, 1), 0, 1); if (a <= 0) return r;
      ctx.save();
      try {
        if (a < 1) ctx.globalAlpha *= a;
        ctx.imageSmoothingEnabled = false;
        var inner = { x: r.x + ps.pad, y: r.y + ps.pad, w: p.size, h: p.size };
        if (fr !== 'none') {
          var got = null;
          if (SKN) { try { got = SKN.frame(ctx, r, { role: fr === 'plate' ? 'plate' : 'window', team: opts.team || 'n', focus: !!opts.focus, alpha: 1 }); } catch (e) { got = null; } }
          if (!got) frame16(ctx, r);
        }
        var bgc = backdropCanvas(p, p.size, p.size, opts.backdrop || 'tint', SKN);
        if (bgc && opts.backdrop !== 'none') ctx.drawImage(bgc, inner.x, inner.y);
        if (opts.dim && bgc) { ctx.fillStyle = 'rgba(4,6,24,0.45)'; ctx.fillRect(inner.x, inner.y, p.size, p.size); }
        var o2 = {}; for (var k in opts) o2[k] = opts[k]; o2.alpha = 1;
        draw(ctx, p, inner.x, inner.y, o2);
      } finally { ctx.restore(); }
      return r;
    } catch (e) { warn('panel', 'drawPanel failed: ' + e); return null; }
  }
  function randomSpec(seed, keep, locks) {   // a new spec from a seed; parts named in locks (array) are copied from keep
    var o = {}; keep = keep || {}; (locks || []).forEach(function (k) { if (keep[k] != null) o[k] = keep[k]; });
    o.seed = seed; return resolveSpec(o);
  }

  /* ---------------- presenter: portraits beside an H-01 dialogue box, or on their own ---------------- */
  function create(o) {
    o = o || {};
    var SKN = skinOf(o.skin), P = {}, clock = 0, slots = { left: null, right: null }, leaving = [], plan = null, lastSig = null, convKey = null, drawn = [], lastShown = -1, lastChange = -1e9, anchors = {};
    var cast = {}, castRaw = o.cast || {};
    function setParams(p) {
      p = p || {};
      for (var k in DEFAULTS) if (P[k] == null) P[k] = DEFAULTS[k];
      for (k in p) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k) && p[k] != null && p[k] !== '') P[k] = typeof DEFAULTS[k] === 'number' ? num(p[k], DEFAULTS[k]) : String(p[k]);
      P.size = P.size >= 56 ? 64 : 48; P.enterMs = clamp(P.enterMs, 0, 1000); P.gap = clamp(Math.round(P.gap), 0, 32); P.margin = clamp(Math.round(P.margin), 0, 64);
      P.blinkMs = clamp(P.blinkMs, 0, 20000); P.mouthMs = clamp(P.mouthMs, 30, 400);
      cast = {};
    }
    setParams(o.params);
    function call(fn, a, b, c) { if (typeof fn === 'function') { try { return fn(a, b, c); } catch (x) { warn('cb', 'a host callback threw: ' + x); } } return undefined; }
    function portraitFor(key, line) {
      if (key == null || key === '') return null;
      var k = String(key).toLowerCase();
      if (cast[k] !== undefined) return cast[k];
      var spec = null;
      for (var n in castRaw) if (String(n).toLowerCase() === k) { spec = castRaw[n]; break; }
      if (!spec && o.getPortrait) spec = call(o.getPortrait, key, line);
      var pr = null;
      if (spec) { try { pr = spec.__portrait ? spec : make(spec.name == null ? Object.assign({ name: String(key) }, spec) : spec, { size: P.size, outline: P.outline }); } catch (e) { pr = null; } }
      cast[k] = pr; return pr;
    }
    function lineKey(line) { if (!line) return null; return line.portrait != null ? line.portrait : line.who != null && portraitFor(line.who, line) ? line.who : line.speaker; }
    function castSide(key) { var k = String(key).toLowerCase(); for (var n in castRaw) if (String(n).toLowerCase() === k && castRaw[n] && (castRaw[n].side === 'left' || castRaw[n].side === 'right')) return castRaw[n].side; return null; }
    function makePlan(lines) {
      var pl = { sides: {}, map: {} }, order = [];
      (lines || []).forEach(function (l) {
        if (!l || typeof l !== 'object') return;
        var key = lineKey(l); if (key == null || !portraitFor(key, l)) return;
        var k = String(key).toLowerCase(), sd = l.side === 'left' || l.side === 'right' ? l.side : pl.map[k] || castSide(key);
        if (!sd) { if (P.layout === 'right') sd = 'right'; else if (P.layout === 'two') { order.indexOf(k) < 0 && order.push(k); sd = order.indexOf(k) % 2 ? 'right' : 'left'; } else sd = 'left'; }
        if (!pl.map[k]) pl.map[k] = sd;
        pl.sides[sd] = true;
      });
      return pl;
    }
    function field() {
      var b = o.bounds; if (typeof b === 'function') b = call(b); if (!b && o.view) b = typeof o.view === 'function' ? call(o.view) : o.view;
      if (b && !(b.w > 0) && b.width > 0) b = { x: 0, y: 0, w: b.width, h: b.height };
      if (!b || !(b.w > 0) || !(b.h > 0)) return null;
      return { x: num(b.x, 0), y: num(b.y, 0), w: b.w, h: b.h };
    }
    function uiRects() { var L = call(o.uiRects), out = []; if (L && L.length) for (var i = 0; i < L.length; i++) if (okRect(L[i])) out.push(L[i]); return out; }
    function startExit(sl) { if (!sl || sl.exitT != null) return; sl.exitT = 0; leaving.push(sl); }
    function exitAll() { ['left', 'right'].forEach(function (s) { if (slots[s]) { startExit(slots[s]); slots[s] = null; } }); plan = null; }
    function present(key, side, expr, line) {
      var pr = portraitFor(key, line); if (!pr) return null;
      side = side === 'right' ? 'right' : 'left';
      var cur = slots[side], k = String(key).toLowerCase();
      var other = slots[side === 'left' ? 'right' : 'left'];
      if (other && other.k === k) { startExit(other); slots[side === 'left' ? 'right' : 'left'] = null; }
      if (cur && cur.k === k) { cur.expr = EXPR[expr] ? expr : cur.expr; return cur; }
      var wait = 0; if (cur) { startExit(cur); wait = P.enterMs * 0.75; }
      var sl = { k: k, key: key, p: pr, side: side, expr: EXPR[expr] ? expr : 'neutral', enterT: -wait, exitT: null, talkT: 0, talking: false, mouth: 0, rect: null, phase: hashStr('ph' + k) % 1700 };
      slots[side] = sl; return sl;
    }
    // H-01 onLine hook: set the speaker, side and expression before the box is laid out
    function onLine(line, index, ctl) {
      try {
        line = line && typeof line === 'object' ? line : { text: String(line == null ? '' : line) };
        var lines = ctl && ctl.lines ? call(ctl.lines) : null, st = o.dialog && o.dialog.state ? call(o.dialog.state) : null;
        var ck = st ? 'id' + st.id : lines;
        if (ck !== convKey || !plan) { convKey = ck; plan = makePlan(lines || [line]); if (!(st && st.index > 0)) { ['left', 'right'].forEach(function (s) { if (slots[s] && !plan.map[slots[s].k]) { startExit(slots[s]); slots[s] = null; } }); } }
        lastSig = st ? st.id + ':' + index : null;
        var key = lineKey(line), pr = key != null ? portraitFor(key, line) : null;
        if (!pr) { if (P.listener === 'hide') exitAll(); ['left', 'right'].forEach(function (s) { if (slots[s]) slots[s].active = false; }); return; }
        var k = String(key).toLowerCase(), side = line.side === 'left' || line.side === 'right' ? line.side : plan.map[k] || 'left';
        if (!plan.map[k]) { plan.map[k] = side; plan.sides[side] = true; }
        var sl = present(key, side, line.expr || line.face, line);
        if (line.expr == null && line.face == null && sl) sl.expr = 'neutral';
        ['left', 'right'].forEach(function (s) { if (slots[s]) slots[s].active = slots[s] === sl; });
        if (P.listener === 'hide') ['left', 'right'].forEach(function (s) { if (slots[s] && slots[s] !== sl) { startExit(slots[s]); slots[s] = null; } });
        lastShown = -1;
      } catch (e) { warn('onLine', 'onLine failed: ' + e); }
    }
    function reserve(f) {
      if (typeof f === 'function') f = call(f);
      if (!f) f = field();
      if (!f) return f;
      var out = { x: num(f.x, 0), y: num(f.y, 0), w: f.w, h: f.h }, ps = panelSize(P.size, P.frame), col = ps.w + P.gap;
      if (!plan || out.w - col * 2 < 96) return out;
      if (plan.sides.left) { out.x += col; out.w -= col; }
      if (plan.sides.right) out.w -= col;
      return out;
    }
    function update(dt) {
      try {
        dt = num(dt, 0); if (dt < 0) dt = 0; if (dt > 250) dt = 250;
        clock += dt;
        var D = o.dialog, st = D && D.state ? call(D.state) : null;
        if (D) {
          if (!st || st.stage === 'close') { if (slots.left || slots.right) exitAll(); plan = null; convKey = null; }
          else {
            var sig = st.id + ':' + st.index;
            if (sig !== lastSig && st.index >= 0) {
              warn('wire', 'onLine is not passed to the dialogue box; expressions and the reserved column need create({onLine: (l, i, c) => portraits.onLine(l, i, c)})');
              onLine({ speaker: st.speaker, who: st.who }, st.index, null); lastSig = sig;
            }
            var typing = st.stage === 'type' && st.shown < st.total;
            if (typing && st.shown !== lastShown) { lastShown = st.shown; lastChange = clock; }
            var talking = typing && clock - lastChange < 130;
            ['left', 'right'].forEach(function (s) { var sl = slots[s]; if (sl) sl.talking = !!(sl.active && talking); });
          }
        }
        ['left', 'right'].forEach(function (s) {
          var sl = slots[s]; if (!sl) return;
          sl.enterT += dt;
          if (sl.talking) { sl.talkT += dt; sl.mouth = mouthAt(sl.talkT, P.mouthMs); } else { sl.talkT = 0; sl.mouth = 0; }
        });
        var exitMs = P.enterMs * 0.75;
        leaving = leaving.filter(function (sl) { sl.exitT += dt; sl.talking = false; sl.mouth = 0; return sl.exitT < exitMs; });
      } catch (e) { warn('update', 'update failed: ' + e); }
    }
    function place(sl, ps) {
      var F = field(), ui = uiRects(), D = o.dialog, st = D && D.state ? call(D.state) : null, B = st && st.box, R2 = D && D.rect ? call(D.rect) : null;
      var w = ps.w, h = ps.h, cands = [], left = sl.side === 'left';
      if (!F && B) F = { x: 0, y: 0, w: 1e4, h: 1e4 };
      if (okRect(B)) {
        var top = R2 && okRect(R2) ? R2.y : B.y, lowHalf = F ? B.y + B.h / 2 > F.y + F.h / 2 : true;
        var yy = lowHalf ? B.y + B.h - h : top;
        cands.push({ x: left ? B.x - P.gap - w : B.x + B.w + P.gap, y: yy });
        cands.push({ x: left ? B.x + 4 : B.x + B.w - 4 - w, y: lowHalf ? top - h - 1 : B.y + B.h + 1 });
      } else if (F) {
        cands.push({ x: left ? F.x + P.margin : F.x + F.w - P.margin - w, y: F.y + F.h - P.margin - h });
      } else if (sl.rect) return sl.rect;
      else return null;
      var inF = function (r) { return !F || r.x >= F.x && r.y >= F.y && r.x + r.w <= F.x + F.w && r.y + r.h <= F.y + F.h; };
      for (var i = 0; i < cands.length; i++) {
        var r = { x: Math.round(cands[i].x), y: Math.round(cands[i].y), w: w, h: h };
        if (!inF(r)) continue;
        if (ui.some(function (u) { return hit(r, u); })) continue;
        if (B && hit(r, { x: B.x, y: B.y, w: B.w, h: B.h })) continue;
        return r;
      }
      warn('room', 'no room for the portrait beside the box clear of your UI rects; drawn at its preferred spot. Use reserve() for the dialogue box bounds.');
      var r0 = { x: Math.round(cands[0].x), y: Math.round(cands[0].y), w: w, h: h };
      if (F) { r0.x = clamp(r0.x, F.x, F.x + F.w - w); r0.y = clamp(r0.y, F.y, F.y + F.h - h); }
      return r0;
    }
    function drawSlot(ctx, sl, leavingNow) {
      var ps = panelSize(sl.p.size, P.frame), r = leavingNow && sl.rect ? sl.rect : place(sl, ps);
      if (!r) return;
      sl.rect = r;
      var k = leavingNow ? 1 - sl.exitT / Math.max(1, P.enterMs * 0.75) : P.enterMs > 0 ? sl.enterT / P.enterMs : 1;
      if (k <= 0) return;
      var tr = transition(P.enter, k, sl.side === 'left' ? -1 : 1, Math.round(ps.w / 2), !SKN || SKN.pixel !== false);
      var dim = !leavingNow && !sl.active && P.listener === 'dim' && (!o.dialog || !!(o.dialog.state && call(o.dialog.state)) || slots.left && slots.left.active || slots.right && slots.right.active);
      drawPanel(ctx, sl.p, { x: r.x + tr.dx, y: r.y }, { skin: SKN || false, frame: P.frame, backdrop: P.backdrop, expr: sl.expr, mouth: sl.mouth,
        blink: P.blinkMs > 0 ? blinkAt(sl.p, clock + sl.phase, P.blinkMs) : 'open', flip: sl.side === 'right' && P.layout !== 'right' ? !sl.p.spec.noFlip : false,
        alpha: tr.alpha, dim: dim, outline: o.outlineColor });
      drawn.push({ x: r.x + tr.dx, y: r.y, w: r.w, h: r.h, side: sl.side, key: sl.key, expr: sl.expr, mouth: sl.mouth, alpha: tr.alpha, dim: !!dim, active: !!sl.active, leaving: !!leavingNow, settled: !leavingNow && k >= 1 });
    }
    function drawAll(ctx) {
      drawn = [];
      if (!ctx) return;
      try {
        ctx.save();
        try { leaving.forEach(function (sl) { drawSlot(ctx, sl, true); }); ['left', 'right'].forEach(function (s) { if (slots[s]) drawSlot(ctx, slots[s], false); }); }
        finally { ctx.restore(); }
      } catch (e) { warn('pdraw', 'draw failed: ' + e); }
    }
    return {
      onLine: onLine,
      reserve: reserve,
      attach: function (dlg) { o.dialog = dlg || null; return this; },
      update: update,
      draw: drawAll,
      show: function (key, opt) { opt = opt || {}; var sl = present(key, opt.side, opt.expr, null); if (sl) { ['left', 'right'].forEach(function (s) { if (slots[s]) slots[s].active = slots[s] === sl; }); if (opt.instant) sl.enterT = P.enterMs; } return !!sl; },
      hide: function (side) { if (side === 'left' || side === 'right') { startExit(slots[side]); slots[side] = null; } else exitAll(); },
      expr: function (side, e) { var sl = slots[side] || slots.left || slots.right; if (sl && EXPR[e]) sl.expr = e; return !!sl; },
      talk: function (side, on) { var sl = slots[side]; if (sl) sl.talking = on !== false; return !!sl; },
      clear: function () { slots = { left: null, right: null }; leaving = []; plan = null; convKey = null; lastSig = null; drawn = []; },
      rects: function () { return drawn.map(function (d) { return { x: d.x, y: d.y, w: d.w, h: d.h }; }); },
      lastDrawn: function () { return drawn.slice(); },
      portrait: function (key) { return portraitFor(key, null); },
      state: function () {
        var f = function (sl) { return sl ? { key: sl.key, side: sl.side, expr: sl.expr, active: !!sl.active, talking: !!sl.talking, mouth: sl.mouth, entering: sl.enterT < P.enterMs, rect: sl.rect } : null; };
        return { clock: clock, left: f(slots.left), right: f(slots.right), leaving: leaving.length, plan: plan ? { left: !!plan.sides.left, right: !!plan.sides.right } : null };
      },
      setParams: function (p) { setParams(p); },
      params: function () { var c = {}; for (var k in DEFAULTS) c[k] = P[k]; return c; },
      panelSize: function () { return panelSize(P.size, P.frame); }
    };
  }

  root.GameDNA_Portraits = { version: VERSION, DEFAULTS: DEFAULTS, EXPRESSIONS: EXPRESSIONS, PARTS: PARTS, make: make, draw: draw, drawPanel: drawPanel,
    create: create, randomSpec: randomSpec, resolveSpec: resolveSpec, blinkAt: blinkAt, mouthAt: mouthAt, transition: transition, panelSize: panelSize,
    pixels: function (p, expr, eyes, mouth, outline) { if (!p.__portrait) p = make(p); return p.base ? raster(p, EXPR[expr] ? expr : 'neutral', EYES[eyes] || 'open', clamp(Math.round(num(mouth, 0)), 0, 2), outline || '#06061a') : null; },
    _raster: raster };
})(typeof window !== 'undefined' ? window : this);

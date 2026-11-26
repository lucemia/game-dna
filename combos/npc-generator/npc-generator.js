/* GameDNA_NpcGen v2.0.1 - D-03 NPC generator: seeded townsfolk built from parts (body type, age, skin, hair style and colour,
 * clothes, headwear, face extras, accessories), hand-pixelled in code in one art style, with a 4-frame walk in 4 directions,
 * a name and a one-line role. Same seed = same person (look, name, role) on every machine and at every screen size.
 * Optional helpers: a crowd picker that keeps look-alikes apart, a wandering "town" (4-direction walking that avoids the
 * game's walls, each other and the player, turns to face whoever talks to it) and a screen-space talk panel with the
 * talker's own pixel portrait (plus a small speech marker over the talker's head).
 *
 * One classic script, no dependencies, ASCII only, one global: GameDNA_NpcGen. Never calls Math.random or reads the clock.
 *
 *   var NG = GameDNA_NpcGen;
 *   var npc = NG.create(1234);                                   // or NG.create(NG.make('baker-7'))
 *   npc.draw(ctx, feetX, feetY, { dir: 'left', moving: true, walk: distancePx });
 *   var town = NG.town({ seed: 7, count: 8, area: {x, y, w, h}, blocked: function (x, y) { return solidAt(x, y); } });
 *   town.update(dtMs, player); town.drawables(camX, camY) -> [{y, draw(ctx)}]; town.talk(town.nearest(px, py, 20), player);
 *   town.panel(ctx, camX, camY, { view: {x: 0, y: 0, w: VIEW_W, h: VIEW_H}, avoid: hudRects });   // after the world
 *
 * Frame: 32 x 44, feet centre between columns 15 and 16 (CX = 16), the 1 px ink outline under the shoes on row 41 (FOOT).
 * draw() puts that outline row ON feetY, so the person stands on the line feetY. Side art faces right natively; the left
 * view is the right view painted with the person's other side toward the viewer (a satchel moves to the near hip), then
 * mirrored: the body is symmetric and lit from the top, so nothing one-sided flips.
 */
(function (root) {
  'use strict';
  var VERSION = '2.0.1';
  var W = 32, H = 44, CX = 16, FOOT = 41, INK = '#1a1024', EYE = '#21182b', POCKET = 4;
  var DIRS = ['down', 'right', 'up', 'left'];

  /* ---------- palettes: one base colour each; ramp() derives 5 shades (cool shadows, warm lights) ---------- */
  var SKIN = { porcelain: '#f7d6b8', fair: '#f0c29c', rose: '#e3a582', olive: '#c99868', tan: '#b77c4c', brown: '#8e5a34', deep: '#64402a' };
  var HAIR = { black: '#2b2430', umber: '#553522', chestnut: '#86462a', copper: '#b9592b', honey: '#d4a443', flax: '#e8d08c',
    ash: '#8e8678', grey: '#b9b6b2', white: '#ece9e2', plum: '#6e3a78', teal: '#2c7876' };
  var CLOTH = { brick: '#a8443a', rust: '#c26a34', mustard: '#c9a03b', olive: '#788a38', moss: '#477a44', teal: '#2c7c79', sky: '#4a7db8',
    navy: '#36477e', plum: '#74417f', rose: '#c46a86', cream: '#e3d7b6', oat: '#b9a683', charcoal: '#47414f', brown: '#7b5334', wine: '#7e3046', sage: '#8ca27a' };
  var LEATHER = { tan: '#a8784a', brown: '#77492b', dark: '#4b3122', black: '#302630' };
  var STRAW = '#d9b45c', CHEEK = '#ea8f86', SCLERA = '#efe6dc', DARK = { tan: 1, brown: 1, deep: 1 };

  function hex2rgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function rgb2hex(r, g, b) { function c(v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); } return '#' + c(r) + c(g) + c(b); }
  function rgb2hsl(r, g, b) { r /= 255; g /= 255; b /= 255; var mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, l = (mx + mn) / 2, d = mx - mn;
    if (d > 1e-6) { s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; }
  function hsl2hex(h, s, l) { h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return rgb2hex((r + m) * 255, (g + m) * 255, (b + m) * 255); }
  function towards(h, target, k) { var d = ((target - h + 540) % 360) - 180; return h + d * k; }
  var RAMPS = {};
  /* ramp(hex) -> [deep, dark, base, light, highlight] */
  function ramp(hex, kind) {
    var key = hex + (kind || '');
    if (RAMPS[key]) return RAMPS[key];
    var c = hex2rgb(hex), hsl = rgb2hsl(c[0], c[1], c[2]), h = hsl[0], s = hsl[1], l = hsl[2], out;
    if (kind === 'skin') {   // warm shadows (toward orange), never purple
      out = [hsl2hex(towards(h, 12, 0.4), s * 0.78, l * 0.56), hsl2hex(towards(h, 16, 0.3), s * 0.88, l * 0.8), hex,
        hsl2hex(towards(h, 40, 0.1), s * 0.95, l + (1 - l) * 0.28), hsl2hex(h, s * 0.8, l + (1 - l) * 0.52)];
    } else {
      var grey = s < 0.12;
      out = [hsl2hex(grey ? h : towards(h, 250, 0.22), s * 1.05 + (grey ? 0.06 : 0), l * 0.5), hsl2hex(grey ? h : towards(h, 250, 0.12), s * 1.04 + (grey ? 0.04 : 0), l * 0.72),
        hex, hsl2hex(grey ? h : towards(h, 55, 0.08), s * 0.96, l + (1 - l) * 0.3), hsl2hex(grey ? h : towards(h, 55, 0.14), s * 0.85, l + (1 - l) * 0.56)];
      if (grey && l > 0.55) { out[0] = hsl2hex(225, 0.16, l * 0.46); out[1] = hsl2hex(222, 0.14, l * 0.68); }
    }
    return (RAMPS[key] = out);
  }

  /* ---------- the part catalogue ---------- */
  var BUILDS = {   // tw/th torso (front), sw side torso width, ll leg rows, lw leg width, arm rows, hh head rows
    slim: { tw: 6, th: 6, sw: 5, ll: 5, lw: 2, arm: 5, hh: 9 },
    average: { tw: 8, th: 6, sw: 6, ll: 4, lw: 3, arm: 5, hh: 9 },
    stout: { tw: 10, th: 6, sw: 7, ll: 3, lw: 4, arm: 5, hh: 9, belly: 1 },
    tall: { tw: 8, th: 7, sw: 6, ll: 6, lw: 3, arm: 6, hh: 9 },
    child: { tw: 6, th: 5, sw: 5, ll: 2, lw: 2, arm: 4, hh: 8 }
  };
  var PARTS = {
    age: ['child', 'adult', 'elder'],
    build: ['slim', 'average', 'stout', 'tall', 'child'],
    skin: Object.keys(SKIN),
    hair: ['short', 'bob', 'long', 'bun', 'ponytail', 'curly', 'braids', 'spiky', 'bald'],
    hairColor: Object.keys(HAIR),
    top: ['shirt', 'tunic', 'vest', 'apron', 'dress', 'coat', 'robe'],
    bottom: ['trousers', 'shorts', 'skirt'],
    shoes: ['shoes', 'boots'],
    head: ['none', 'straw', 'cap', 'kerchief', 'hood', 'beanie'],
    face: ['none', 'beard', 'moustache', 'glasses'],
    extra: ['none', 'satchel', 'scarf'],
    cloth: Object.keys(CLOTH),
    leather: Object.keys(LEATHER)
  };

  /* roles: outfit leanings and one-line roles. Weights are relative; '*' = any. */
  var ROLES = {
    baker: { ages: 'ae', top: { apron: 5, shirt: 1 }, head: { kerchief: 3, cap: 1, none: 2 }, apron: 'cream', lines: ['Up before dawn to bake rye loaves.', 'Saves the burnt crusts for the ducks.', 'Knows everyone by their bread order.'] },
    smith: { ages: 'a', top: { apron: 4, vest: 2 }, head: { none: 3, kerchief: 1 }, apron: 'leather', sleeves: 'short', build: { stout: 3, tall: 2, average: 1 }, lines: ['Mends ploughs and shoes the mail ponies.', 'Hums in time with the hammer.', 'Never lets the forge go cold.'] },
    guard: { ages: 'a', top: { tunic: 5, coat: 1 }, head: { cap: 3, none: 2 }, cols: ['navy', 'brick', 'wine', 'charcoal'], lines: ['Walks the wall at every bell.', 'Lets the children ring the gate bell.', 'Writes down every cart that comes in.'] },
    farmer: { ages: 'ae', top: { shirt: 3, vest: 2, tunic: 1 }, head: { straw: 5, none: 1 }, lines: ['Brings turnips to the square each morning.', 'Talks to the goats more than to people.', 'Can smell rain a day ahead.'] },
    fisher: { ages: 'ae', top: { vest: 2, shirt: 2, coat: 1 }, head: { beanie: 4, kerchief: 1, none: 1 }, shoes: 'boots', cols: ['navy', 'teal', 'sky', 'oat'], lines: ['Sells the morning catch by the steps.', 'Mends nets on the harbour wall.', 'Claims the river owes them a boot.'] },
    scholar: { ages: 'ae', top: { robe: 4, coat: 2 }, head: { none: 3, hood: 1 }, face: { glasses: 4, none: 2 }, lines: ['Copies old maps by candlelight.', 'Is writing a history of the well.', 'Lends books and forgets to whom.'] },
    merchant: { ages: 'ae', top: { coat: 4, vest: 2 }, head: { cap: 2, none: 2 }, extra: { satchel: 4, none: 1 }, cols: ['wine', 'plum', 'teal', 'mustard'], lines: ['Trades spices for wool and gossip.', 'Counts coins twice, smiles once.', 'Has a cousin in every market town.'] },
    herbalist: { ages: 'ae', top: { dress: 3, robe: 2, apron: 1 }, head: { kerchief: 2, hood: 2, none: 2 }, extra: { satchel: 2, none: 2 }, cols: ['moss', 'sage', 'olive', 'oat'], lines: ['Dries mint and sage above the door.', 'Has a tea for every complaint.', 'Picks moss only on misty days.'] },
    courier: { ages: 'ca', top: { tunic: 3, shirt: 2 }, head: { cap: 4, none: 1 }, extra: { satchel: 6 }, lines: ['Carries letters up to the hill farms.', 'Knows every shortcut in town.', 'Has never once been on time early.'] },
    weaver: { ages: 'ae', top: { dress: 3, vest: 2, shirt: 1 }, head: { kerchief: 2, none: 3 }, extra: { scarf: 3, none: 2 }, cols: ['rose', 'plum', 'teal', 'mustard', 'sky'], lines: ['Dyes wool in seven colours.', 'Weaves the banners for the fair.', 'Counts threads in their sleep.'] },
    miller: { ages: 'ae', top: { apron: 3, shirt: 2 }, head: { cap: 2, none: 2 }, apron: 'cream', cols: ['oat', 'cream', 'brown', 'sage'], lines: ['Always has flour on one sleeve.', 'Listens to the wheel for trouble.', 'Grinds oats for half the valley.'] },
    lamplighter: { ages: 'ae', top: { coat: 4, tunic: 1 }, head: { cap: 3, beanie: 1 }, cols: ['charcoal', 'navy', 'wine'], lines: ['Lights the square lamps at dusk.', 'Knows which wick will smoke.', 'Whistles the same tune every night.'] },
    tailor: { ages: 'ae', top: { vest: 4, coat: 2 }, head: { none: 4 }, face: { glasses: 3, none: 3 }, extra: { scarf: 2, none: 3 }, lines: ['Keeps pins in their collar.', 'Can tell your size from across the road.', 'Patches cloaks for half price.'] },
    potter: { ages: 'ae', top: { apron: 4, shirt: 1 }, head: { kerchief: 2, none: 3 }, apron: 'oat', sleeves: 'short', lines: ['Glazes jugs the colour of the sea.', 'Has clay under every nail.', 'Sells cracked cups to the inn cheap.'] },
    innkeeper: { ages: 'ae', top: { apron: 3, vest: 3 }, head: { none: 4, kerchief: 1 }, build: { stout: 3, average: 2 }, apron: 'cream', lines: ['Keeps the fire going for travellers.', 'Remembers every guest and their stew.', 'Sweeps the steps twice a day.'] },
    shepherd: { ages: 'cae', top: { tunic: 3, coat: 2 }, head: { hood: 3, straw: 1, none: 1 }, shoes: 'boots', cols: ['oat', 'brown', 'moss', 'sage'], lines: ['Brings the flock down at first frost.', 'Names every single lamb.', 'Can whistle louder than the bell.'] },
    carpenter: { ages: 'a', top: { vest: 3, apron: 2 }, head: { cap: 2, none: 3 }, apron: 'leather', build: { tall: 2, average: 2, stout: 1 }, lines: ['Fixed the bridge rail last spring.', 'Smells of pine shavings.', 'Builds toy carts for the little ones.'] },
    beekeeper: { ages: 'ae', top: { shirt: 3, dress: 1 }, head: { straw: 4, hood: 1 }, cols: ['cream', 'mustard', 'oat'], lines: ['Sells honey in wax-sealed jars.', 'Has been stung exactly once this year.', 'Talks to the hives about the news.'] },
    mapmaker: { ages: 'ae', top: { coat: 3, robe: 1, vest: 1 }, head: { none: 3, cap: 1 }, face: { glasses: 2, none: 3 }, extra: { satchel: 3, none: 1 }, lines: ['Walks the roads to measure them.', 'Draws every new fence on the town map.', 'Argues with the river about its bends.'] },
    minstrel: { ages: 'a', top: { tunic: 3, vest: 2 }, head: { cap: 2, none: 2 }, extra: { scarf: 3, none: 2 }, cols: ['rose', 'plum', 'teal', 'mustard', 'sky'], lines: ['Plays the fiddle by the fountain.', 'Knows a song about every street.', 'Trades tunes for supper.'] },
    apprentice: { ages: 'c', top: { apron: 2, tunic: 2, shirt: 2 }, head: { cap: 2, none: 3 }, apron: 'oat', lines: ['Sweeps the workshop floor.', 'Is learning to sharpen chisels.', 'Wants to run a shop of their own.'] },
    errand: { title: 'errand kid', ages: 'c', top: { shirt: 2, tunic: 2, dress: 1 }, head: { none: 3, cap: 1, straw: 1 }, extra: { satchel: 2, none: 2 }, lines: ['Delivers eggs for a copper each.', 'Races the pigeons across the square.', 'Knows where every cat sleeps.'] },
    stable: { title: 'stable hand', ages: 'c', top: { shirt: 3, vest: 1 }, head: { straw: 2, none: 2 }, shoes: 'boots', lines: ['Brushes the mail ponies at dawn.', 'Keeps apples in both pockets.', 'Is not afraid of the grey mare.'] },
    storyteller: { ages: 'e', top: { robe: 3, coat: 2 }, head: { hood: 2, none: 2, beanie: 1 }, extra: { scarf: 3, none: 1 }, lines: ['Tells tales on the well steps at dusk.', 'Remembers the great flood.', 'Never tells a story the same way twice.'] },
    sailor: { title: 'old sailor', ages: 'e', top: { coat: 3, vest: 2 }, head: { beanie: 4, cap: 1 }, face: { beard: 3, moustache: 1, none: 1 }, cols: ['navy', 'teal', 'charcoal'], lines: ['Sailed three seas, came home for the bread.', 'Ties knots for anyone who asks.', 'Says the wind smells of trouble.'] },
    gardener: { ages: 'e', top: { apron: 2, shirt: 2, vest: 1 }, head: { straw: 4, none: 1 }, apron: 'moss', lines: ['Grows the best onions in the valley.', 'Waters the square planters at noon.', 'Swaps seeds for stories.'] },
    clockmender: { ages: 'e', top: { vest: 3, coat: 2 }, head: { none: 3, cap: 1 }, face: { glasses: 5, none: 1 }, lines: ['Keeps the tower clock honest.', 'Hears a loose gear from a street away.', 'Fixes music boxes for free.'] }
  };
  var ROLE_IDS = Object.keys(ROLES);

  /* names: invented syllables and nature compounds (checked against the name blocklist by the element's checks) */
  var GIV_A = ['Al', 'Bel', 'Cor', 'Dav', 'El', 'Fen', 'Gil', 'Hal', 'Jor', 'Kel', 'Lin', 'Mer', 'Nel', 'Or', 'Per', 'Quen', 'Ros', 'Sel', 'Tam', 'Ul', 'Ves', 'Wil', 'Yor', 'Bri', 'Cal', 'Dar', 'Em', 'Fin', 'Hes', 'Ivo', 'Mib', 'Pim', 'Tib', 'Wen'];
  var GIV_B = ['a', 'en', 'in', 'ett', 'ic', 'wyn', 'el', 'o', 'y', 'ard', 'an', 'ie', 'ok', 'ine', 'os', 'ith', 'ley', 'ber', 'rin', 'su'];
  var FAM_A = ['Ash', 'Bram', 'Brook', 'Clay', 'Dun', 'Fern', 'Flint', 'Gorse', 'Hay', 'Holl', 'Kettle', 'Lark', 'Moss', 'Oak', 'Quill', 'Reed', 'Rush', 'Sorrel', 'Thistle', 'Wren', 'Yew', 'Birch', 'Copper', 'Marl', 'Nettle', 'Tansy', 'Pebble', 'Heather'];
  var FAM_B = ['wick', 'by', 'low', 'ley', 'field', 'ford', 'wood', 'gate', 'more', 'combe', 'stead', 'well', 'dale', 'worth', 'ridge', 'mere'];
  var NAME_SKIP = { Alley: 1, Ely: 1, Ory: 1, Ula: 1, Linen: 1, Rosin: 1, Wily: 1, Rosy: 1 };   // combinations that read as ordinary words

  /* ---------- seeded randomness (never Math.random) ---------- */
  function hash(s) { var h = 2166136261 >>> 0; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15; return h >>> 0; }
  function rng(seed) {
    var s = (hash('npc:' + seed) || 1) >>> 0;
    function next() { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }
    var R = {
      next: next,
      int: function (n) { return Math.floor(next() * n); },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
      weighted: function (w) { var k, tot = 0; for (k in w) tot += w[k]; var r = next() * tot; for (k in w) { r -= w[k]; if (r < 0) return k; } for (k in w) return k; },
      chance: function (p) { return next() < p; }
    };
    return R;
  }
  function seedOf(x) { return typeof x === 'number' && isFinite(x) ? (x >>> 0) : String(x == null ? 0 : x); }

  /* ---------- make(seed, over) -> spec (plain data, safe to save) ---------- */
  var HUE_GROUP = { brick: 0, rust: 0, wine: 0, rose: 1, plum: 1, mustard: 2, oat: 2, cream: 3, olive: 4, moss: 4, sage: 4, teal: 5, sky: 5, navy: 5, charcoal: 6, brown: 7 };
  function make(seed, over) {
    seed = seedOf(seed); over = over || {};
    var R = rng(seed), sp = { seed: seed, v: 1 };
    var ageRoll = R.next();
    sp.age = ageRoll < 0.15 ? 'child' : ageRoll < 0.32 ? 'elder' : 'adult';
    if (over.age && PARTS.age.indexOf(over.age) >= 0) sp.age = over.age;
    var A = sp.age.charAt(0);
    var roles = ROLE_IDS.filter(function (r) { return ROLES[r].ages.indexOf(A) >= 0; });
    sp.role = over.role && ROLES[over.role] ? over.role : roles[R.int(roles.length)];
    var RO = ROLES[sp.role];
    sp.build = sp.age === 'child' ? 'child' : RO.build ? R.weighted(RO.build) : R.weighted(sp.age === 'elder' ? { slim: 3, average: 4, stout: 2 } : { slim: 3, average: 4, stout: 2, tall: 2 });
    sp.skin = R.pick(PARTS.skin);
    sp.hair = R.weighted(sp.age === 'elder' ? { short: 4, bun: 3, bald: 4, long: 1, bob: 1, curly: 1 } : sp.age === 'child' ? { short: 3, bob: 2, ponytail: 2, curly: 2, braids: 2, spiky: 2, bun: 1 } :
      { short: 4, bob: 2, long: 3, bun: 2, ponytail: 3, curly: 2, braids: 2, spiky: 1, bald: 1 });
    sp.hairColor = sp.age === 'elder' ? R.weighted({ grey: 4, white: 3, ash: 2 }) : R.weighted({ black: 4, umber: 4, chestnut: 3, copper: 2, honey: 2, flax: 2, ash: 1, plum: sp.age === 'adult' ? 0.6 : 0, teal: sp.age === 'adult' ? 0.5 : 0 });
    if (colDist(HAIR[sp.hairColor], SKIN[sp.skin]) < 0.16) sp.hairColor = sp.age === 'elder' ? 'white' : colDist(HAIR.black, SKIN[sp.skin]) < 0.2 ? 'flax' : 'black';   // hair must read against the face
    sp.top = R.weighted(RO.top);
    sp.sleeves = RO.sleeves || (sp.top === 'robe' || sp.top === 'coat' ? 'long' : R.chance(0.7) ? 'long' : 'short');
    sp.bottom = sp.top === 'dress' || sp.top === 'robe' ? 'none' : R.weighted({ trousers: 6, shorts: sp.age === 'child' ? 3 : 1, skirt: 2 });
    sp.shoes = RO.shoes || R.weighted({ shoes: 3, boots: 2 });
    sp.head = R.weighted(RO.head);
    if (sp.head === 'hood' && sp.hair === 'bun') sp.hair = 'short';
    sp.face = sp.age === 'child' ? 'none' : RO.face ? R.weighted(RO.face) : R.weighted({ none: 9, beard: sp.age === 'elder' ? 3 : 1.5, moustache: 1.4, glasses: sp.age === 'elder' ? 1.6 : 0.8 });
    sp.extra = RO.extra ? R.weighted(RO.extra) : R.weighted({ none: 6, satchel: 1, scarf: 1.4 });
    /* colours: the top from the role's list (or any), the rest picked away from the top's hue group */
    var cols = RO.cols || PARTS.cloth;
    var skinHex = SKIN[sp.skin], nearSkin = function (c) { return colDist(CLOTH[c], skinHex) < 0.24 || Math.abs(lum(CLOTH[c]) - lum(skinHex)) < 22 && colDist(CLOTH[c], skinHex) < 0.34; };   // clothes and hats must read against the skin
    sp.topColor = R.pick(cols);
    for (var tt = 0; tt < 6 && nearSkin(sp.topColor); tt++) sp.topColor = R.pick(cols);
    function apart(avoid) { var tries = 0, c; do { c = R.pick(PARTS.cloth); tries++; } while (tries < 16 && (avoid.some(function (a) { return HUE_GROUP[a] === HUE_GROUP[c]; }) || nearSkin(c))); return c; }
    sp.bottomColor = apart([sp.topColor]);
    sp.accColor = apart([sp.topColor, sp.bottomColor]);
    sp.shirtColor = R.pick(['cream', 'oat', 'cream', 'sky', 'sage']);
    if (sp.shirtColor === sp.topColor) sp.shirtColor = sp.topColor === 'cream' ? 'oat' : 'cream';
    sp.apron = RO.apron === 'leather' ? 'leather' : RO.apron ? (RO.apron === sp.topColor ? 'cream' : RO.apron) : 'cream';
    if (sp.apron === sp.topColor) sp.apron = 'oat';
    sp.leather = R.pick(PARTS.leather);
    if (sp.apron === 'leather' && colDist(LEATHER[sp.leather === 'tan' ? 'brown' : 'tan'], skinHex) < 0.24) sp.leather = 'tan';   // a leather apron darker than the skin (tan leather -> brown apron)
    if (sp.apron === 'leather' && colDist(LEATHER.brown, skinHex) < 0.24) sp.apron = 'charcoal';
    sp.blush = R.chance(0.45);
    sp.name = makeName(R);
    sp.title = RO.title || sp.role;
    sp.line = R.pick(RO.lines);
    for (var k in over) if (k !== 'seed' && over[k] != null && PARTS[k === 'hairColor' ? 'hairColor' : k] && PARTS[k].indexOf(over[k]) >= 0) sp[k] = over[k];
    if (over.name) sp.name = String(over.name);
    if (over.line) sp.line = String(over.line);
    return normSpec(sp);
  }
  function makeName(R) {
    var given, n = 0;
    do { given = R.pick(GIV_A) + R.pick(GIV_B); n++; } while (NAME_SKIP[given] && n < 8);
    var fa = R.pick(FAM_A), fb = R.pick(FAM_B);
    if (fa.charAt(fa.length - 1) === fb.charAt(0)) fb = fb.slice(1);
    var fam = fa + fb;
    return given + ' ' + fam;
  }
  /* repair / fill a spec (from a save or a hand-written object) so every field is a known part */
  function normSpec(sp) {
    sp = sp || {};
    var o = {};
    for (var k in sp) o[k] = sp[k];
    function one(key, list, def) { if (list.indexOf(o[key]) < 0) o[key] = def; }
    one('age', PARTS.age, 'adult'); one('build', PARTS.build, o.age === 'child' ? 'child' : 'average');
    if (o.age === 'child') o.build = 'child'; else if (o.build === 'child') o.build = 'average';
    one('skin', PARTS.skin, 'fair'); one('hair', PARTS.hair, 'short'); one('hairColor', PARTS.hairColor, 'umber');
    one('top', PARTS.top, 'shirt'); one('shoes', PARTS.shoes, 'shoes'); one('head', PARTS.head, 'none'); one('face', PARTS.face, 'none'); one('extra', PARTS.extra, 'none');
    if (o.top === 'dress' || o.top === 'robe') o.bottom = 'none'; else one('bottom', PARTS.bottom, 'trousers');
    if (o.sleeves !== 'short') o.sleeves = 'long';
    one('topColor', PARTS.cloth, 'moss'); one('bottomColor', PARTS.cloth, 'brown'); one('accColor', PARTS.cloth, 'rust'); one('shirtColor', PARTS.cloth, 'cream');
    if (o.apron !== 'leather') one('apron', PARTS.cloth, 'cream');
    one('leather', PARTS.leather, 'brown');
    if (o.age === 'child' && o.face !== 'none') o.face = 'none';
    o.blush = !!o.blush;
    if (!ROLES[o.role]) o.role = 'farmer';
    if (typeof o.name !== 'string' || !o.name) o.name = 'Fen Ashby';
    if (typeof o.title !== 'string') o.title = ROLES[o.role].title || o.role;
    if (typeof o.line !== 'string') o.line = ROLES[o.role].lines[0];
    if (o.seed == null) o.seed = 0;
    return o;
  }
  var LOOK_KEYS = ['age', 'build', 'skin', 'hair', 'hairColor', 'top', 'sleeves', 'bottom', 'shoes', 'head', 'face', 'extra', 'topColor', 'bottomColor', 'accColor', 'shirtColor', 'apron', 'leather', 'blush'];
  function lookKey(sp) { return LOOK_KEYS.map(function (k) { return String(sp[k]); }).join('|'); }

  /* ---------- look distance (feature based, cheap): two people closer than ~3 read as look-alikes in a crowd ---------- */
  var SKIN_ORDER = PARTS.skin;
  function colDist(a, b) { var A = hex2rgb(a), B = hex2rgb(b); return Math.sqrt((A[0] - B[0]) * (A[0] - B[0]) + (A[1] - B[1]) * (A[1] - B[1]) + (A[2] - B[2]) * (A[2] - B[2])) / 441; }
  function distance(a, b) {
    a = normSpec(a); b = normSpec(b);
    var d = 0;
    d += a.age !== b.age ? 1.6 : 0;
    d += a.build !== b.build ? 1 : 0;
    d += Math.min(1, Math.abs(SKIN_ORDER.indexOf(a.skin) - SKIN_ORDER.indexOf(b.skin)) * 0.4);
    var hidHair = function (s) { return s.head === 'hood' || s.head === 'kerchief'; };
    d += a.hair !== b.hair ? (hidHair(a) && hidHair(b) ? 0.3 : 1.1) : 0;
    d += Math.min(1, colDist(HAIR[a.hairColor], HAIR[b.hairColor]) * 2.4);
    d += a.top !== b.top ? 1.1 : 0;
    d += Math.min(1.4, colDist(CLOTH[a.topColor], CLOTH[b.topColor]) * 3);
    d += a.bottom !== b.bottom ? 0.5 : 0;
    d += Math.min(0.6, colDist(CLOTH[a.bottomColor], CLOTH[b.bottomColor]) * 1.5) * (a.bottom === 'none' && b.bottom === 'none' ? 0 : 1);
    d += a.head !== b.head ? 1.1 : (a.head !== 'none' && a.head !== 'straw' ? Math.min(0.5, colDist(CLOTH[a.accColor], CLOTH[b.accColor])) : 0);
    d += a.face !== b.face ? 0.6 : 0;
    d += a.extra !== b.extra ? 0.5 : 0;
    return Math.round(d * 100) / 100;
  }

  /* pixel look distance of two front-stand frames: mean colour difference over the union of both silhouettes (ink ignored);
     under LOOKALIKE two people read as the same person at a glance */
  var LOOKALIKE = 0.18;
  function pixelDistance(A, B) {
    var sum = 0, n = 0;
    for (var k = 0; k < A.length; k++) {
      var a = A[k] && A[k] !== INK ? A[k] : null, b = B[k] && B[k] !== INK ? B[k] : null;
      if (!a && !b) continue; n++;
      if (!a || !b) { sum += 1; continue; }
      if (a === b) continue;
      var p = hex2rgb(a), q = hex2rgb(b); sum += Math.min(1, Math.sqrt((p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1]) + (p[2] - q[2]) * (p[2] - q[2])) / 255);
    }
    return n ? sum / n : 0;
  }
  function lookalike(a, b) { return pixelDistance(raster(a, 'down', 0).c, raster(b, 'down', 0).c); }

  /* ---------- crowd(n, seed) -> n specs, no two closer than minDist, names unique, no role more than twice ---------- */
  function crowd(n, seed, opt) {
    opt = opt || {};
    var out = [], pix = [], minD = opt.minDist != null ? +opt.minDist : 3, R = rng('crowd:' + seedOf(seed)), names = {}, roles = {}, tries = 0;
    n = Math.max(0, Math.min(64, n | 0));
    var mix = opt.ages || null, avoid = (opt.avoid || []).map(function (a) { var sp = normSpec(a); return { spec: sp, ras: raster(sp, 'down', 0).c }; });   // people the crowd must not look like (the player)
    while (out.length < n && tries < n * 60) {
      tries++;
      var s = make((R.next() * 4294967296) >>> 0, mix ? { age: mix[out.length % mix.length] } : null);
      var dmin = 99, pmin = 9, ras = raster(s, 'down', 0).c;
      for (var i = 0; i < out.length; i++) { dmin = Math.min(dmin, distance(s, out[i])); pmin = Math.min(pmin, pixelDistance(ras, pix[i])); }
      var relax = tries > n * 40 ? 0.6 : 1;
      if (avoid.some(function (a3) { return a3.spec.role === s.role; })) continue;   // nobody shares the player's trade
      for (var a2 = 0; a2 < avoid.length; a2++) { dmin = Math.min(dmin, distance(s, avoid[a2].spec) + 0.0001); pmin = Math.min(pmin, pixelDistance(ras, avoid[a2].ras) * 0.6); }
      if (dmin < minD * relax || pmin < LOOKALIKE || names[s.name] || (roles[s.role] || 0) >= (n <= 14 ? 1 : 2)) continue;
      names[s.name] = 1; roles[s.role] = (roles[s.role] || 0) + 1; out.push(s); pix.push(ras);
    }
    return out;
  }

  /* ---------- layout of one frame (the rig). Local coordinates face RIGHT for side views. ---------- */
  function layout(sp, view, frame) {
    var B = BUILDS[sp.build], walk = frame >= 1 && frame <= 4, i = walk ? frame - 1 : -1;
    var L = { view: view, i: i, B: B, bob: walk && (i === 1 || i === 3) ? -1 : 0 };
    L.ankle = FOOT - 3;                                   // last leg row; feet rows FOOT-2, FOOT-1
    L.tyB = L.ankle - B.ll + L.bob;                       // last torso row (the waist)
    L.ty0 = L.tyB - B.th + 1;                             // shoulder row
    L.hy0 = L.ty0 - B.hh;                                 // head top row
    L.hh = B.hh; L.hw = view === 'side' ? 9 : 10;
    L.hx0 = view === 'side' ? CX - 4 + (sp.age === 'elder' ? 1 : 0) : CX - 5;
    L.eyeRow = L.hy0 + B.hh - 5; L.mouthRow = L.hy0 + B.hh - 2;
    var fw = !walk ? 0 : i === 0 ? 1 : i === 2 ? -1 : 0;
    L.fw = fw;
    if (view === 'side') {
      L.tx0 = CX - Math.ceil(B.sw / 2); L.tw = B.sw;
      var nearX = L.tx0 + B.sw - B.lw - 1, farX = L.tx0;
      if (nearX - farX < 1) nearX = farX + 1;
      L.legs = [{ key: 'far', x: farX, dx: -fw * 2, lift: walk && i === 1 ? 2 : 0, far: true }, { key: 'near', x: nearX, dx: fw * 2, lift: walk && i === 3 ? 2 : 0, far: false }];
      var sx = L.tx0 + Math.floor(B.sw / 2) - 1;
      L.arms = [{ key: 'far', sx: sx, sy: L.ty0, swing: fw * 2, far: true }, { key: 'near', sx: sx, sy: L.ty0, swing: -fw * 2, far: false }];
    } else {
      L.tx0 = CX - B.tw / 2; L.tw = B.tw;
      var liftA = fw === 1 ? 2 : walk && i === 3 ? 1 : 0, liftB = fw === -1 ? 2 : walk && i === 1 ? 1 : 0;
      L.legs = [{ key: 'A', x: L.tx0, lift: liftA, out: -1 }, { key: 'B', x: L.tx0 + B.tw - B.lw, lift: liftB, out: 0 }];
      var sA = fw === 1 ? -1 : fw === -1 ? 1 : 0;
      L.arms = [{ key: 'A', x: L.tx0 - 2, swing: sA }, { key: 'B', x: L.tx0 + B.tw, swing: -sA }];
    }
    return L;
  }

  /* ---------- the painter ---------- */
  function raster(spIn, dir, frame) {
    var sp = spIn && spIn.__norm ? spIn : normSpec(spIn);
    dir = DIRS.indexOf(dir) >= 0 ? dir : 'down';
    frame = Math.max(0, Math.min(4, frame | 0));
    var view = dir === 'down' ? 'front' : dir === 'up' ? 'back' : 'side', mirrorSide = dir === 'left';
    var L = layout(sp, view, frame), B = L.B;
    var C = new Array(W * H), O = new Array(W * H), log = [], marks = { eyes: [] };
    var owner = 'body';
    var skin = ramp(SKIN[sp.skin], 'skin'), hair = ramp(HAIR[sp.hairColor]), top = ramp(CLOTH[sp.topColor]), bot = ramp(CLOTH[sp.bottomColor]),
      acc = ramp(CLOTH[sp.accColor]), shirt = ramp(CLOTH[sp.shirtColor]), lea = ramp(LEATHER[sp.leather]), straw = ramp(STRAW),
      apr = sp.apron === 'leather' ? ramp(LEATHER[sp.leather === 'tan' ? 'brown' : 'tan']) : ramp(CLOTH[sp.apron]);
    function put(x, y, col, own) { if (x < 0 || y < 0 || x >= W || y >= H || !col) return; var k = y * W + x; C[k] = col; O[k] = own || owner; }
    function rect(x, y, w, h, col, own) { for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) put(x + xx, y + yy, col, own); }
    function at(x, y) { return x < 0 || y < 0 || x >= W || y >= H ? null : O[y * W + x]; }
    function begin(name) { owner = name; log.push(name); }
    var long = sp.top === 'dress' || sp.top === 'robe';           // covers the legs to the ankle
    var hemRow = FOOT - 4;                                         // last row of a long skirt (the ankles show below)

    /* -- legs and feet -- */
    function shoeRows() { return sp.shoes === 'boots' ? 2 : 0; }   // extra boot rows above the foot
    function leg(l) {
      begin('leg' + l.key);
      var top = L.tyB + 1, footY = FOOT - 2 - l.lift, ank = footY - 1, side = view === 'side', d = l.far ? 1 : 0;
      var bootTop = footY - shoeRows(), dx = side ? l.dx : 0;
      var cover = sp.bottom === 'trousers' ? ank : sp.bottom === 'shorts' ? top + 1 : sp.bottom === 'skirt' ? top + Math.max(1, B.ll - 2) : -1;
      var coat = sp.top === 'coat' ? top + Math.max(1, B.ll - 2) : sp.top === 'tunic' ? top : -1;
      for (var y = top; y <= ank; y++) {
        var k = ank === top ? 1 : (y - top) / (ank - top), x = l.x + Math.round(dx * k);
        var cols, own;
        if (long && y <= hemRow) continue;
        if (y >= bootTop) { cols = lea; own = 'shoes'; }
        else if (y <= cover) { cols = bot; own = 'bottom'; }
        else { cols = skin; own = 'body'; }
        if (y <= coat && !long) continue;
        for (var xx = 0; xx < B.lw; xx++) {
          var shade = side ? (xx === 0 ? 3 : xx === B.lw - 1 ? 1 : 2) : (xx === 0 ? 3 : xx === B.lw - 1 ? 1 : 2);
          if (B.lw === 2) shade = xx === 0 ? 2 : 1;
          put(x + xx, y, cols[Math.max(0, shade - d)], own);
        }
        if (own === 'shoes' && y === bootTop) for (xx = 0; xx < B.lw; xx++) put(x + xx, y, lea[Math.max(0, 3 - d)], 'shoes');
      }
      /* the foot: 2 rows; side views point the toe forward (+x), front views splay outward */
      begin('foot' + l.key);
      var fw = B.lw + 1, fx = side ? l.x + dx : l.x + (l.out || 0);
      for (var yy = 0; yy < 2; yy++) for (var q = 0; q < fw; q++) {
        var c = yy === 1 ? lea[Math.max(0, 1 - d)] : (q === 0 ? lea[Math.max(0, 3 - d)] : lea[Math.max(0, 2 - d)]);
        put(fx + q, footY + yy, c, 'shoes');
      }
      if (side && !l.far) put(fx + fw - 1, footY, lea[3], 'shoes');
      marks['foot' + l.key] = { x: fx, y: footY + 1, lift: l.lift };
    }

    /* -- torso and clothes -- */
    function shadeBox(x, y, w, h, R, opt) {
      opt = opt || {};
      for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) {
        var c = R[2];
        if (yy === 0) c = R[3];
        if (yy === h - 1 && !opt.noFloor) c = R[1];
        if (view !== 'side') { if (xx === 0) c = R[3]; if (xx === w - 1) c = R[1]; if (yy === 0 && xx > 0 && xx < w - 1) c = R[3]; }
        else { if (xx === 0) c = R[1]; else if (xx === w - 1 && yy > 0) c = R[2]; }
        put(x + xx, y + yy, c);
      }
    }
    function skirtShape(R, y0, y1, flare, own) {      // an A-line from the waist down: front / back symmetric, side swings with the step
      begin(own || 'skirt');
      for (var y = y0; y <= y1; y++) {
        var k = (y - y0) / Math.max(1, y1 - y0), grow = Math.round(k * flare), x0, w;
        if (view === 'side') { var sway = Math.round(-L.fw * k * 0.8); x0 = L.tx0 - grow + sway; w = L.tw + grow * 2 + (B.belly ? 1 : 0); }
        else { x0 = L.tx0 - grow; w = L.tw + grow * 2; }
        for (var xx = 0; xx < w; xx++) {
          var c = R[2];
          if (view === 'front') c = xx === 0 ? R[3] : xx === w - 1 ? R[1] : xx === Math.floor(w / 2) - 1 && k > 0.2 ? R[1] : R[2];
          else if (view === 'back') c = xx === 0 ? R[3] : xx === w - 1 ? R[1] : R[2];
          else c = xx === 0 ? R[1] : xx === w - 1 ? R[3] : R[2];
          if (y === y1) c = R[1];
          put(x0 + xx, y, c);
        }
      }
    }
    function torso() {
      var x0 = L.tx0, y0 = L.ty0, w = L.tw, h = B.th, R = top, ty = sp.top;
      /* under the clothes: the waistband of the bottom, skirts that start at the waist */
      if (!long && sp.bottom === 'skirt') skirtShape(bot, L.tyB, L.tyB + Math.max(2, B.ll - 1), 1.4, 'bottom');
      if (ty === 'dress' || ty === 'robe') skirtShape(R, L.tyB, hemRow, ty === 'robe' ? 1.6 : 2.2, 'top');
      if (ty === 'coat') skirtShape(R, L.tyB, L.tyB + Math.max(2, B.ll - 1), 1.2, 'top');
      begin('top');
      var body = ty === 'vest' ? shirt : R;
      shadeBox(x0, y0, w, h, body);
      if (B.belly) {   // the round of the belly
        if (view === 'side') { for (var yb = y0 + 2; yb < y0 + h - 1; yb++) put(x0 + w, yb, body[yb === y0 + 2 ? 3 : 2]); }
        else if (view === 'front') { put(CX - 1, y0 + 3, body[3]); put(CX, y0 + 3, body[3]); put(CX - 2, y0 + 4, body[3]); }
      }
      /* the waist: trousers / shorts show their band, a tunic a belt, a robe a sash */
      var bandRow = L.tyB;
      if (ty === 'tunic') {
        for (var xt = 0; xt < w + (view === 'side' && B.belly ? 1 : 0); xt++) { put(x0 + xt, bandRow - 1, lea[xt === 0 ? 1 : 2], 'belt'); put(x0 + xt, bandRow + 1, R[xt === 0 ? 2 : 1]); put(x0 + xt, bandRow, R[2]); }
        if (view === 'front') { put(CX - 1, bandRow - 1, '#d8b04a', 'belt'); put(CX, bandRow - 1, '#b88c34', 'belt'); }
      } else if (ty === 'robe') {
        for (var xs = 0; xs < w + (view === 'side' && B.belly ? 1 : 0); xs++) put(x0 + xs, bandRow - 1, acc[xs === 0 ? 1 : 2], 'belt');
        if (view === 'front') { put(CX + 1, bandRow, acc[1], 'belt'); put(CX + 1, bandRow + 1, acc[2], 'belt'); }
        if (view === 'side') { put(x0 - 1, bandRow, acc[1], 'belt'); put(x0 - 1, bandRow + 1, acc[2], 'belt'); }
      } else if (!long && ty !== 'coat') {
        for (var xw = 0; xw < w + (view === 'side' && B.belly ? 1 : 0); xw++) put(x0 + xw, bandRow, bot[xw === 0 ? 1 : 2], 'bottom');
      }
      if (ty === 'vest') {
        // vest panels over the shirt: front shows the shirt down the middle, back and side are all vest
        for (var yv = y0; yv < L.tyB; yv++) for (var xv = 0; xv < w; xv++) {
          var mid = view === 'front' && (xv === w / 2 - 1 || xv === w / 2);
          if (view === 'side' && xv === w - 1 && yv > y0) continue;
          if (mid && yv < L.tyB - 1) continue;
          var c = xv === 0 ? (view === 'front' ? R[3] : R[1]) : xv === w - 1 ? (view === 'front' ? R[1] : R[2]) : R[2];
          if (yv === y0) c = R[3];
          put(x0 + xv, yv, c, 'vest');
        }
        if (view === 'front') { put(CX - 1, y0 + 2, '#d8b04a', 'vest'); put(CX, y0 + 4, '#d8b04a', 'vest'); }
      }
      if (ty === 'coat') {
        if (view === 'front') { for (var yc = y0; yc < y0 + 3; yc++) { put(CX - 1, yc, shirt[3], 'coat'); put(CX, yc, shirt[2], 'coat'); } put(CX - 1, y0 + 3, '#d8b04a', 'coat'); put(CX - 1, y0 + 5, '#d8b04a', 'coat');
          for (var yc2 = L.tyB; yc2 <= L.tyB + Math.max(2, B.ll - 1); yc2++) put(CX - 1, yc2, R[0], 'coat'); }
        if (view === 'side') put(x0 + w - 1, y0, shirt[3], 'coat');
        for (var xc = 0; xc < w + (view === 'side' && B.belly ? 1 : 0); xc++) put(x0 + xc, bandRow - 1, R[1], 'coat');
      }
      if (ty === 'shirt' || ty === 'tunic' || ty === 'dress') {
        if (view === 'front') { put(CX - 1, y0, skin[2], 'neck'); put(CX, y0, skin[1], 'neck'); }
        if (view === 'side') put(x0 + w - 2, y0, skin[1], 'neck');
      }
      if (ty === 'apron') {
        begin('apron');
        var ay1 = L.tyB + Math.max(2, B.ll - 1);
        if (view === 'front') {
          for (var ya = y0 + 2; ya <= ay1; ya++) for (var xa = 1; xa < w - 1; xa++) put(x0 + xa, ya, ya === ay1 ? apr[1] : xa === 1 ? apr[3] : xa === w - 2 ? apr[1] : apr[2]);
          put(x0 + 1, y0, apr[3]); put(x0 + 1, y0 + 1, apr[2]); put(x0 + w - 2, y0, apr[2]); put(x0 + w - 2, y0 + 1, apr[1]);
          put(CX - 1, y0 + 4, apr[1]); put(CX, y0 + 4, apr[1]);                  // the pocket
        } else if (view === 'side') {
          for (var ys = y0 + 1; ys <= ay1; ys++) { var fx = x0 + w - 1 + (B.belly ? 1 : 0) + (ys > L.tyB ? Math.round(-L.fw * 0.6) : 0); put(fx, ys, apr[2]); put(fx + 1, ys, ys === ay1 ? apr[1] : apr[3]); }
          put(x0, L.tyB - 1, apr[1]); put(x0 - 1, L.tyB - 1, apr[2]); put(x0 - 1, L.tyB, apr[1]);   // the tie at the back
        } else {
          for (var xb = 0; xb < w; xb++) put(x0 + xb, L.tyB - 1, apr[xb === 0 ? 1 : 2]);
          put(CX - 2, L.tyB, apr[2]); put(CX + 1, L.tyB, apr[2]); put(CX - 1, L.tyB - 1, apr[3]); put(CX, L.tyB - 1, apr[3]);   // the bow
        }
      }
    }
    function scarf() {
      if (sp.extra !== 'scarf') return;
      begin('scarf');
      var y = L.ty0, R = acc;
      if (view === 'side') {
        for (var x = L.tx0; x < L.tx0 + L.tw; x++) put(x, y, x === L.tx0 ? R[1] : R[3]);
        for (var x2 = L.tx0; x2 < L.tx0 + L.tw; x2++) put(x2, y + 1, R[2]);
        var flap = L.fw === 0 ? 0 : 1; put(L.tx0 - 1, y + 1, R[2]); put(L.tx0 - 1 - flap, y + 2, R[1]); put(L.tx0 - 1, y + 2, R[2]);
      } else {
        for (var x3 = L.tx0; x3 < L.tx0 + L.tw; x3++) { put(x3, y, R[3]); put(x3, y + 1, x3 === L.tx0 ? R[3] : R[2]); }
        if (view === 'front') { put(CX - 2, y + 2, R[2]); put(CX - 2, y + 3, R[1]); put(CX - 1, y + 2, R[1]); put(CX - 2, y + 4, R[3]); }
      }
    }
    function satchel(layer) {
      if (sp.extra !== 'satchel') return;
      /* the strap goes over the person's RIGHT shoulder, the bag hangs on the LEFT hip */
      var bagX, bagY = L.tyB - 1, near;
      if (view === 'side') {
        near = mirrorSide;          // facing left the left hip is the near one
        if (layer === 'back' && near) return; if (layer === 'front' && !near) {
          begin('strap'); for (var y = L.ty0; y < L.tyB - 1; y++) { put(L.tx0 + 2, y, lea[0]); put(L.tx0 + 3, y, lea[3]); } return; }
        if (layer === 'back') { begin('bag'); rect(L.tx0 - 2, bagY, 3, 3, lea[2]); put(L.tx0 - 2, bagY, lea[3]); put(L.tx0 - 1, bagY, lea[3]); return; }
        begin('strap'); for (var y2 = L.ty0; y2 < bagY; y2++) { put(L.tx0 + 2, y2, lea[0]); put(L.tx0 + 3, y2, lea[3]); }
        begin('bag'); bagX = L.tx0 + 1;
        rect(bagX, bagY, 4, 3, lea[2]); for (var q = 0; q < 4; q++) put(bagX + q, bagY, lea[3]); put(bagX, bagY + 2, lea[1]); put(bagX + 3, bagY + 1, lea[1]); put(bagX + 3, bagY + 2, lea[1]);
        put(bagX + 1, bagY + 1, '#d8b04a');
        return;
      }
      if (layer !== 'front') return;
      begin('strap');
      var front = view === 'front';
      // front: from the screen-left shoulder (the person's right) to the screen-right hip; back: mirrored
      var x0s = front ? L.tx0 : L.tx0 + L.tw - 1, x1s = front ? L.tx0 + L.tw - 1 : L.tx0, n = L.tyB - 1 - L.ty0;
      for (var k = 0; k <= n; k++) { var sx2 = Math.round(x0s + (x1s - x0s) * k / n); put(sx2, L.ty0 + k, lea[0]); put(sx2 + (front ? -1 : 1), L.ty0 + k, lea[3]); }
      begin('bag');
      bagX = front ? L.tx0 + L.tw - 1 : L.tx0 - 2;
      rect(bagX, bagY, 3, 3, lea[2]); put(bagX, bagY, lea[3]); put(bagX + 1, bagY, lea[3]); put(bagX + 2, bagY, lea[3]); put(bagX + (front ? 2 : 0), bagY + 2, lea[1]);
      put(bagX + 1, bagY + 1, '#d8b04a');
    }

    /* -- arms -- */
    function sleeveCols(R, n) { return sp.sleeves === 'short' ? 2 : n; }
    function armFront(a) {
      begin('arm' + a.key);
      var x = a.x, y0 = L.ty0, n = B.arm + a.swing, sR = sp.top === 'vest' ? shirt : top, sl = sleeveCols(sR, n);
      for (var k = 0; k < n; k++) {
        var bare = k >= sl, R = bare ? skin : sR, inner = a.key === 'A' ? 1 : 0;
        var cL = k === 0 ? R[3] : (inner ? R[2] : R[1]), cR = k === 0 ? R[2] : (inner ? R[1] : R[2]);
        if (view === 'front') { put(x, y0 + k, a.key === 'A' ? (k === 0 ? R[3] : R[3]) : R[2], bare ? 'body' : 'top'); put(x + 1, y0 + k, a.key === 'A' ? R[2] : R[1], bare ? 'body' : 'top'); }
        else { put(x, y0 + k, a.key === 'A' ? R[3] : R[2], bare ? 'body' : 'top'); put(x + 1, y0 + k, a.key === 'A' ? R[2] : R[1], bare ? 'body' : 'top'); }
        if (k === 0) { put(x, y0, R[3]); put(x + 1, y0, R[3]); }
        void cL; void cR;
      }
      begin('hand' + a.key);
      var hy = y0 + n;
      put(x, hy, skin[3]); put(x + 1, hy, skin[2]); put(x, hy + 1, skin[2]); put(x + 1, hy + 1, skin[1]);
      marks['hand' + a.key] = { x: x, y: hy };
    }
    function armSide(a) {
      begin('arm' + a.key);
      var x0 = a.sx, y0 = a.sy + 1, x1 = a.sx + a.swing, y1 = a.sy + B.arm - 1, n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      var sR = sp.top === 'vest' ? shirt : top, d = a.far ? 1 : 0, sl = sp.sleeves === 'short' && !a.far ? 2 : 99;
      for (var k = 0; k <= n; k++) {
        var x = Math.round(x0 + (x1 - x0) * k / n), y = Math.round(y0 + (y1 - y0) * k / n), bare = k >= sl, R = bare ? skin : sR;
        put(x, y, R[Math.max(0, 1 - d)], bare ? 'body' : 'top'); put(x + 1, y, R[Math.max(0, (k === 0 ? 3 : 2) - d)], bare ? 'body' : 'top');
      }
      if (!a.far) { put(x0, a.sy, sR[3], 'top'); put(x0 + 1, a.sy, sR[3], 'top'); }
      begin('hand' + a.key);
      var hx = x1, hy = y1 + 1;
      put(hx, hy, skin[Math.max(0, 2 - d)]); put(hx + 1, hy, skin[Math.max(0, 3 - d)]); put(hx, hy + 1, skin[Math.max(0, 1 - d)]); put(hx + 1, hy + 1, skin[Math.max(0, 2 - d)]);
      marks['hand' + a.key] = { x: hx, y: hy };
    }

    /* -- head, face, hair, headwear -- */
    var hidden = sp.head === 'hood';
    function head() {
      begin('head');
      var x0 = L.hx0, y0 = L.hy0, w = L.hw, h = L.hh;
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        if ((y === 0 || y === h - 1) && (x === 0 || x === w - 1)) continue;
        var c = skin[2];
        if (view === 'front') { if (x === 0 || (x === 1 && y > 0 && y < 3)) c = skin[3]; if (x === w - 1) c = skin[1]; if (y === h - 1) c = skin[1]; }
        else if (view === 'side') { if (x <= 1) c = skin[1]; if (y === h - 1) c = skin[1]; if (x === w - 1 && y < h - 1) c = skin[2]; }
        else { if (x === 0) c = skin[3]; if (x === w - 1) c = skin[1]; if (y === h - 1) c = skin[1]; }
        put(x0 + x, y0 + y, c);
      }
      if (view === 'side') { for (var cy = 2; cy < h - 1; cy++) put(x0 + w, y0 + cy - 0, null); }
      var er = L.eyeRow;
      if (view === 'front') {
        if (!hidden) { put(x0 - 1, er, skin[2], 'ear'); put(x0 - 1, er + 1, skin[1], 'ear'); put(x0 + w, er, skin[1], 'ear'); put(x0 + w, er + 1, skin[0], 'ear'); }
        begin('eyes');
        put(CX - 3, er, EYE); put(CX - 3, er + 1, EYE); put(CX + 2, er, EYE); put(CX + 2, er + 1, EYE);
        if (DARK[sp.skin]) { put(CX - 4, er, SCLERA, 'eyewhite'); put(CX + 3, er, SCLERA, 'eyewhite'); put(CX - 1, er + 2, skin[4], 'nose'); if (!sp.blush) { put(CX - 4, er + 2, skin[3], 'cheek'); put(CX + 3, er + 2, skin[3], 'cheek'); } }
        marks.eyes = [{ x: CX - 3, y: er }, { x: CX + 2, y: er }];
        if (sp.blush) { put(CX - 4, er + 2, CHEEK, 'cheek'); put(CX + 3, er + 2, CHEEK, 'cheek'); }
        if (sp.face !== 'beard') { put(CX - 1, L.mouthRow, skin[0], 'mouth'); put(CX, L.mouthRow, skin[1], 'mouth'); }
      } else if (view === 'side') {
        put(x0 + w, er + 2, skin[2], 'nose');                                   // the nose
        put(x0 + w - 1, L.mouthRow, skin[0], 'mouth');
        if (!hidden) { put(x0 + 3, er, skin[1], 'ear'); put(x0 + 3, er + 1, skin[0], 'ear'); put(x0 + 4, er + 1, skin[1], 'ear'); }
        begin('eyes');
        put(x0 + 6, er, EYE); put(x0 + 6, er + 1, EYE);
        if (DARK[sp.skin]) { put(x0 + 7, er, SCLERA, 'eyewhite'); put(x0 + w, er + 2, skin[4], 'nose'); }
        marks.eyes = [{ x: x0 + 6, y: er }];
        if (sp.blush) put(x0 + 6, er + 2, CHEEK, 'cheek');
      } else {
        if (!hidden) { put(x0 - 1, er, skin[1], 'ear'); put(x0 - 1, er + 1, skin[0], 'ear'); put(x0 + w, er, skin[2], 'ear'); put(x0 + w, er + 1, skin[1], 'ear'); }
      }
    }
    function face() {
      var er = L.eyeRow, x0 = L.hx0, w = L.hw, y1 = L.hy0 + L.hh - 1, R = hair;
      if (sp.face === 'beard') {
        begin('beard');
        if (view === 'front') {
          for (var y = er + 2; y <= y1 + 1; y++) for (var x = x0; x < x0 + w; x++) {
            if (y === y1 + 1 && (x < x0 + 2 || x > x0 + w - 3)) continue;
            if (y === er + 2 && x > x0 && x < x0 + w - 1) continue;
            var bc = x === x0 ? R[3] : x === x0 + w - 1 ? R[1] : y === y1 + 1 ? R[1] : R[2];
            if (y === L.mouthRow - 1 && x >= CX - 2 && x <= CX + 1) bc = R[3];       // the moustache over the mouth
            if (y === L.mouthRow && (x === CX - 1 || x === CX)) bc = R[0];         // the mouth in the beard
            put(x, y, bc);
          }
        } else if (view === 'side') {
          for (var ys = er + 2; ys <= y1 + 1; ys++) for (var xs = x0 + 3; xs <= x0 + w - 1; xs++) {
            if (ys === er + 2 && xs > x0 + 4) continue;
            if (ys === y1 + 1 && xs > x0 + w - 2) continue;
            put(xs, ys, xs === x0 + w - 1 ? R[3] : R[2]);
          }
        }
      } else if (sp.face === 'moustache') {
        begin('moustache');
        if (view === 'front') { put(CX - 2, L.mouthRow - 1, R[1]); put(CX - 1, L.mouthRow - 1, R[2]); put(CX, L.mouthRow - 1, R[2]); put(CX + 1, L.mouthRow - 1, R[1]); }
        else if (view === 'side') { put(x0 + w - 2, L.mouthRow - 1, R[2]); put(x0 + w - 1, L.mouthRow - 1, R[1]); put(x0 + w - 2, L.mouthRow, R[1]); }
      } else if (sp.face === 'glasses') {
        begin('glasses');
        var F = '#4a3a52', G = '#d8eef4';
        if (view === 'front') {
          [CX - 3, CX + 2].forEach(function (ex) { put(ex - 1, er - 1, F); put(ex, er - 1, F); put(ex + 1, er - 1, F); put(ex + 1, er, G); });
          put(CX - 1, er, F); put(CX, er, F);
        } else if (view === 'side') { put(x0 + 5, er - 1, F); put(x0 + 6, er - 1, F); put(x0 + 7, er - 1, F); put(x0 + 7, er, G); put(x0 + 4, er - 1, F); put(x0 + 3, er - 1, F); }
      }
    }
    function hairPaint() {
      if (hidden) return;
      var st = sp.hair, R = hair, x0 = L.hx0, y0 = L.hy0, w = L.hw, er = L.eyeRow, side = view === 'side', back = view === 'back';
      begin('hair');
      function cap(extraTop) {   // the hair over the skull: rows y0-1 .. y0+1, plus a fringe
        for (var x = x0 + 1; x < x0 + w - 1; x++) put(x, y0 - 1, x < x0 + 4 ? R[4] : R[3]);
        for (var y = y0; y <= y0 + 1; y++) for (var x2 = x0; x2 < x0 + w; x2++) put(x2, y, x2 === x0 + w - 1 ? R[1] : x2 < x0 + 3 && y === y0 ? R[3] : R[2]);
        if (extraTop) for (var x3 = x0 + 2; x3 < x0 + w - 2; x3++) put(x3, y0 - 2, R[3]);
      }
      if (st === 'bald') {
        if (side) { put(x0 + 1, er - 1, R[1]); put(x0 + 1, er, R[2]); put(x0 + 2, er, R[1]); }
        else if (!back) { put(x0, er - 1, R[2]); put(x0, er, R[1]); put(x0 + w - 1, er - 1, R[2]); put(x0 + w - 1, er, R[1]); }
        if (back) {   // the back of a bald head: hair round the nape and over the ears, a lit crown
          for (var yb = er; yb < y0 + L.hh; yb++) { put(x0, yb, R[3]); put(x0 + w - 1, yb, R[1]); }
          for (var xb2 = x0 + 1; xb2 < x0 + w - 1; xb2++) { put(xb2, y0 + L.hh - 2, xb2 === x0 + 1 ? R[3] : R[2]); put(xb2, y0 + L.hh - 1, R[1]); }
        }
        begin('scalp'); put(x0 + 2, y0, ramp(SKIN[sp.skin], 'skin')[4]); put(x0 + 3, y0, ramp(SKIN[sp.skin], 'skin')[3]);
        return;
      }
      if (back) {
        // the back of the head: hair down to the nape (one row of neck skin shows under short hair), lit from the top left,
        // hair running down in two long strands; never a dot or a short dash on the eye / mouth rows (they read as a face)
        var full = st === 'long' || st === 'bob' || st === 'braids';
        var low = full ? L.hy0 + L.hh - 1 : er + 3;
        for (var y = y0 - 1; y <= low; y++) for (var x = x0; x < x0 + w; x++) {
          if ((y === y0 - 1 || (y === low && !full)) && (x === x0 || x === x0 + w - 1)) continue;
          var hc = x === x0 ? R[3] : x === x0 + w - 1 ? R[1] : y === y0 - 1 ? R[3] : y === low ? R[1] : R[2];
          if ((x === x0 + 1 || x === x0 + 2) && y <= y0) hc = R[4];
          if (x === x0 + 1 && y > y0 && y < low) hc = R[3];
          if ((x === x0 + 3 || x === x0 + 6) && y >= y0 + 1 && y < low && sp.head !== 'kerchief') hc = R[1];   // two long strands, never shorter than the eye rows (none under a kerchief)
          put(x, y, hc);
        }
        if (!full) for (var xn = x0 + 1; xn < x0 + w - 1; xn++) put(xn, low + 1, skin[1], 'body');   // the nape
        if (st === 'curly' || st === 'spiky') for (var xs = x0 + 1; xs < x0 + w - 1; xs += 2) put(xs, y0 - 2, st === 'curly' ? R[3] : R[2]);
        if (st === 'curly') for (var yc = y0; yc <= low; yc++) { put(x0 - 1, yc, R[3]); put(x0 + w, yc, R[1]); }
        if (st === 'long') for (var yl = low; yl <= L.ty0 + 3; yl++) for (var xl = x0; xl < x0 + w; xl++) put(xl, yl, xl === x0 ? R[3] : xl === x0 + w - 1 ? R[1] : yl === L.ty0 + 3 ? R[1] : (xl === x0 + 3 || xl === x0 + 6) ? R[1] : R[2]);
        if (st === 'bob') for (var xo = x0 - 1; xo <= x0 + w; xo++) put(xo, low, xo < x0 + 1 ? R[3] : xo > x0 + w - 2 ? R[1] : R[2]);
        if (st === 'ponytail') { put(CX - 1, low, acc[3], 'tie'); put(CX, low, acc[2], 'tie'); for (var yp = low + 1; yp <= L.ty0 + 3; yp++) { put(CX - 1, yp, R[3]); put(CX, yp, R[1]); } }
        if (st === 'braids') [x0 + 1, x0 + w - 2].forEach(function (bx, j) { for (var yb2 = low; yb2 <= L.ty0 + 3; yb2++) put(bx, yb2, j ? R[1] : R[3]); put(bx, L.ty0 + 4, acc[2], 'tie'); });
        if (st === 'bun') { rect(CX - 2, y0 - 3, 4, 3, R[2]); put(CX - 2, y0 - 3, R[4]); put(CX - 1, y0 - 3, R[3]); put(CX + 1, y0 - 2, R[1]); }
        return;
      }
      if (side) {
        // right-facing profile: hair on top and down the back of the head, a fringe at the front
        cap(st === 'curly');
        var bk = st === 'short' || st === 'spiky' ? er + 1 : st === 'bun' || st === 'ponytail' ? er + 2 : L.hy0 + L.hh - 1;
        for (var ys = y0 + 2; ys <= bk; ys++) for (var xs2 = x0; xs2 <= x0 + 2; xs2++) put(xs2, ys, xs2 === x0 ? R[1] : R[2]);
        put(x0 + w - 1, y0 + 2, R[2]); put(x0 + w - 2, y0 + 2, R[1]);
        if (st === 'long' || st === 'bob' || st === 'curly') for (var yl2 = y0 + 1; yl2 <= (st === 'long' ? L.ty0 + 3 : st === 'curly' ? er + 2 : L.hy0 + L.hh - 1); yl2++) { put(x0 - 1, yl2, R[1]); if (st === 'long' && yl2 >= L.hy0 + L.hh) { put(x0, yl2, R[2]); put(x0 + 1, yl2, R[2]); } }
        if (st === 'curly') { for (var xc = x0; xc < x0 + w - 1; xc += 2) put(xc, y0 - 2, R[3]); put(x0 - 1, y0, R[2]); put(x0 + 1, y0 + 3, R[3]); put(x0 + 2, y0 + 5, R[3]); }
        if (st === 'spiky') { for (var xk = x0 + 1; xk < x0 + w - 1; xk += 2) put(xk, y0 - 2, R[2]); put(x0 + w - 1, y0 - 1, R[3]); }
        if (st === 'bun') { rect(x0 - 2, y0 - 1, 3, 3, R[2]); put(x0 - 2, y0 - 1, R[3]); put(x0 - 1, y0 - 1, R[4]); }
        if (st === 'ponytail') { var sw = L.fw === 0 ? 0 : 1; put(x0 - 1, y0 + 3, acc[2], 'tie'); for (var yt = y0 + 3; yt <= er + 5; yt++) { var tx = x0 - 2 - (yt > er + 2 ? sw : 0); put(tx, yt, R[2]); put(tx + 1, yt, yt === y0 + 3 ? acc[2] : R[3]); } }
        if (st === 'braids') { for (var yb3 = er + 2; yb3 <= L.ty0 + 3; yb3++) put(x0 + 1, yb3, yb3 % 2 ? R[1] : R[3]); put(x0 + 1, L.ty0 + 4, acc[2], 'tie'); }
        return;
      }
      // front
      cap(st === 'curly');
      var sideLow = st === 'short' || st === 'spiky' ? er - 1 : st === 'bun' || st === 'ponytail' ? er : st === 'curly' ? er + 1 : L.hy0 + L.hh - 2;
      for (var yf = y0 + 2; yf <= sideLow; yf++) { put(x0, yf, R[3]); put(x0 + w - 1, yf, R[1]); }
      // fringe row y0+2
      var fr = { short: [1, 2, 3, w - 3], bob: [1, 2, 3, 4, 6, 7, 8], long: [1, 2, 3, 6, 7, 8], bun: [1, 2, w - 2], ponytail: [1, 2, 3, w - 2], curly: [1, 2, 3, 4, 5, 6, 7, 8], braids: [1, 2, 3, 6, 7, 8], spiky: [1, 3, 5, 7] }[st] || [];
      fr.forEach(function (q) { put(x0 + q, y0 + 2, q < 4 ? R[2] : R[1]); });
      if (st === 'bob' || st === 'long') for (var yo = y0 + 1; yo <= sideLow; yo++) { put(x0 - 1, yo, R[2]); put(x0 + w, yo, R[1]); }
      if (st === 'long') for (var yl3 = sideLow; yl3 <= L.ty0 + 2; yl3++) { put(x0 - 1, yl3, R[2]); put(x0, yl3, R[3]); put(x0 + w - 1, yl3, R[1]); put(x0 + w, yl3, R[1]); }
      if (st === 'curly') { for (var yc2 = y0; yc2 <= sideLow; yc2++) { put(x0 - 1, yc2, R[2]); put(x0 + w, yc2, R[1]); } for (var xc2 = x0 + 1; xc2 < x0 + w - 1; xc2 += 2) put(xc2, y0 - 2, R[3]); put(x0 + 2, y0, R[4]); put(x0 + 5, y0 - 1, R[2]); put(x0 + 7, y0, R[3]); }
      if (st === 'spiky') { for (var xk2 = x0 + 1; xk2 < x0 + w - 1; xk2 += 2) put(xk2, y0 - 2, xk2 < CX ? R[3] : R[2]); }
      if (st === 'bun') { rect(CX - 2, y0 - 4, 4, 3, R[2]); put(CX - 2, y0 - 4, R[3]); put(CX - 1, y0 - 4, R[4]); put(CX + 1, y0 - 2, R[1]); put(CX - 2, y0 - 2, R[1]); }
      if (st === 'ponytail') { put(x0 + w, er - 1, R[1]); put(x0 + w, er, R[1]); }
      if (st === 'braids') [x0 - 1, x0 + w].forEach(function (bx, j) { for (var yb4 = er; yb4 <= L.ty0 + 3; yb4++) put(bx, yb4, yb4 % 2 ? R[j ? 1 : 2] : R[j ? 2 : 3]); put(bx, L.ty0 + 4, acc[2], 'tie'); });
    }
    function headwear() {
      var hw = sp.head; if (hw === 'none') return;
      var x0 = L.hx0, y0 = L.hy0, w = L.hw, side = view === 'side', back = view === 'back', R;
      begin('hat');
      if (hw === 'straw') {
        R = straw;
        var bx0 = side ? x0 - 2 : x0 - 2, bw = side ? w + 4 : w + 4;
        for (var x = 0; x < bw; x++) { put(bx0 + x, y0, x === 0 || x === bw - 1 ? R[1] : R[3]); put(bx0 + x, y0 + 1, x === 0 || x === bw - 1 ? R[0] : R[1]); }
        var cx0 = x0 + 1, cw = w - 2;
        for (var y = y0 - 3; y < y0; y++) for (var x2 = 0; x2 < cw; x2++) {
          if (y === y0 - 3 && (x2 === 0 || x2 === cw - 1)) continue;
          put(cx0 + x2, y, x2 === 0 ? R[3] : x2 === cw - 1 ? R[1] : y === y0 - 3 ? R[4] : R[2]);
        }
        for (var x3 = 0; x3 < cw; x3++) put(cx0 + x3, y0 - 1, acc[x3 === 0 ? 3 : 2]);
        return;
      }
      if (hw === 'cap') {
        R = acc;
        for (var yc = y0 - 2; yc <= y0 + 1; yc++) for (var xc = x0; xc < x0 + w; xc++) {
          if (yc === y0 - 2 && (xc < x0 + 2 || xc > x0 + w - 3)) continue;
          put(xc, yc, xc === x0 ? R[3] : xc === x0 + w - 1 ? R[1] : yc === y0 - 2 ? R[4] : R[2]);
        }
        put(CX - 1, y0 - 3, R[3]); put(CX, y0 - 3, R[2]);
        if (view === 'front') for (var xp = x0; xp < x0 + w; xp++) put(xp, y0 + 2, xp === x0 || xp === x0 + w - 1 ? R[0] : R[1]);
        else if (side) { for (var xs = x0 + w - 3; xs <= x0 + w + 1; xs++) put(xs, y0 + 1, R[1]); put(x0 + w + 1, y0 + 1, R[0]); }
        else for (var xb = x0 + 1; xb < x0 + w - 1; xb++) put(xb, y0 + 1, R[1]);
        return;
      }
      if (hw === 'beanie') {
        R = acc;
        for (var yk = y0 - 3; yk <= y0 + 1; yk++) for (var xk = x0; xk < x0 + w; xk++) {
          if (yk === y0 - 3 && (xk < x0 + 2 || xk > x0 + w - 3)) continue;
          if (yk === y0 - 2 && (xk === x0 || xk === x0 + w - 1)) continue;
          var c = xk === x0 ? R[3] : xk === x0 + w - 1 ? R[1] : yk === y0 - 3 ? R[3] : R[2];
          if (yk >= y0) c = (xk + yk) % 2 ? R[3] : R[1];        // the knit cuff
          put(xk, yk, c);
        }
        put(CX - 1, y0 - 4, '#ece6d8'); put(CX, y0 - 4, '#c8bfae');
        return;
      }
      if (hw === 'kerchief') {
        R = acc;
        for (var yh = y0 - 1; yh <= y0 + 2; yh++) for (var xh = x0; xh < x0 + w; xh++) {
          if (yh === y0 - 1 && (xh === x0 || xh === x0 + w - 1)) continue;
          if (view === 'front' && yh === y0 + 2 && xh > x0 + 1 && xh < x0 + w - 2) continue;
          if (side && yh >= y0 + 2 && xh > x0 + 5) continue;
          put(xh, yh, xh === x0 ? (back ? R[1] : R[3]) : xh === x0 + w - 1 ? (back ? R[3] : R[1]) : yh === y0 - 1 ? R[3] : R[2]);
        }
        if (view === 'front') { put(x0 + 3, y0, R[4]); put(x0 + 6, y0 + 1, R[3]); }
        if (side) { put(x0 - 1, y0 + 2, R[2]); put(x0 - 2, y0 + 3, R[1]); put(x0 - 1, y0 + 3, R[2]); }
        if (back) { put(CX - 2, y0 + 3, R[3]); put(CX - 1, y0 + 3, R[2]); put(CX, y0 + 3, R[2]); put(CX + 1, y0 + 3, R[3]); }
        return;
      }
      if (hw === 'hood') {
        R = acc;
        var yb = L.hy0 + L.hh - 1;
        for (var yd = y0 - 1; yd <= yb; yd++) for (var xd = x0 - 1; xd <= x0 + w; xd++) {
          if (yd === y0 - 1 && (xd < x0 + 1 || xd > x0 + w - 2)) continue;
          var open = view === 'front' ? (yd >= y0 + 2 && xd >= x0 + 1 && xd <= x0 + w - 2) : side ? (yd >= y0 + 2 && xd >= x0 + 4) : false;
          if (open) continue;
          if (side && xd > x0 + w - 1) continue;
          put(xd, yd, xd === x0 - 1 ? (back ? R[1] : R[3]) : xd === x0 + w ? R[1] : yd === y0 - 1 ? R[3] : R[2]);
        }
        if (view === 'front') for (var xf = x0 + 1; xf <= x0 + w - 2; xf++) put(xf, y0 + 2, R[1]);   // shadow under the brow
        // the cowl over the shoulders
        for (var xw = L.tx0 - 1; xw <= L.tx0 + L.tw; xw++) put(xw, L.ty0, R[xw === L.tx0 - 1 ? 3 : 2]);
        for (var xw2 = L.tx0; xw2 < L.tx0 + L.tw; xw2++) put(xw2, L.ty0 + 1, R[1]);
        if (back) {   // folds: lit left side, a long centre seam, a highlight on the crown, the point over the back
          for (var yh = y0 - 1; yh <= yb; yh++) { put(x0 - 1, yh, R[3]); put(x0, yh, yh < y0 + 2 ? R[4] : R[3]); put(CX, yh, R[1]); put(x0 + w, yh, R[1]); }
          put(x0 + 1, y0 - 1, R[4]); put(x0 + 2, y0 - 1, R[4]);
          for (var yp = L.ty0 + 2; yp <= L.ty0 + 3; yp++) { put(CX - 1, yp, R[2]); put(CX, yp, R[1]); }
        }
        if (side) { put(x0 - 2, yb - 1, R[1]); put(x0 - 2, yb, R[1]); }
      }
    }

    /* -- paint order per view -- */
    if (view === 'side') {
      armSide(L.arms[0]); satchel('back'); leg(L.legs[0]); leg(L.legs[1]); torso(); satchel('front'); scarf(); armSide(L.arms[1]);
      head(); hairPaint(); face(); headwear();
    } else {
      leg(L.legs[0]); leg(L.legs[1]); torso(); scarf();
      if (view === 'back') satchel('front');
      armFront(L.arms[0]); armFront(L.arms[1]);
      if (view === 'front') satchel('front');
      head(); if (view === 'front') face(); hairPaint(); if (view !== 'front') face(); headwear();
    }
    var res = finish(C, O);
    res.log = log; res.marks = marks; res.layout = L; res.dir = dir; res.frame = frame; res.view = view;
    if (mirrorSide) mirror(res);
    return res;
  }
  /* outline (1 px ink round the silhouette) and ink for tiny enclosed pockets (<= 4 px), like a hand-cleaned sprite */
  function finish(C, O) {
    var out = C.slice(), own = O.slice(), k, x, y;
    var seen = new Uint8Array(W * H);
    for (k = 0; k < W * H; k++) {
      if (out[k] || seen[k]) continue;
      var reg = [], st = [k], edge = false; seen[k] = 1;
      while (st.length) { var q = st.pop(); reg.push(q); var qx = q % W, qy = (q / W) | 0; if (qx === 0 || qy === 0 || qx === W - 1 || qy === H - 1) edge = true;
        var nb = [qx > 0 ? q - 1 : -1, qx < W - 1 ? q + 1 : -1, qy > 0 ? q - W : -1, qy < H - 1 ? q + W : -1];
        for (var j = 0; j < 4; j++) { var n = nb[j]; if (n >= 0 && !out[n] && !seen[n]) { seen[n] = 1; st.push(n); } } }
      if (!edge && reg.length <= POCKET) reg.forEach(function (n) { out[n] = INK; own[n] = 'outline'; });
    }
    var add = [];
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      k = y * W + x; if (out[k]) continue;
      if ((x > 0 && C[k - 1]) || (x < W - 1 && C[k + 1]) || (y > 0 && C[k - W]) || (y < H - 1 && C[k + W])) add.push(k);
    }
    add.forEach(function (n) { out[n] = INK; own[n] = 'outline'; });
    return { c: out, o: own };
  }
  function mirror(R) {
    var c = new Array(W * H), o = new Array(W * H);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) { c[y * W + (W - 1 - x)] = R.c[y * W + x]; o[y * W + (W - 1 - x)] = R.o[y * W + x]; }
    R.c = c; R.o = o;
    R.marks.eyes = R.marks.eyes.map(function (e) { return { x: W - 1 - e.x, y: e.y }; });
    Object.keys(R.marks).forEach(function (k) { var m = R.marks[k]; if (m && !Array.isArray(m) && m.x != null) R.marks[k] = { x: W - 1 - m.x - (k.indexOf('hand') === 0 ? 1 : 0), y: m.y, lift: m.lift }; });
  }

  /* ---------- checks on frames ---------- */
  function inspect(R) {
    var x, y, k, low = -1, topRow = H, n = 0, comps = 0, seen = new Uint8Array(W * H), minX = W, maxX = -1;
    for (k = 0; k < W * H; k++) if (R.c[k]) { n++; y = (k / W) | 0; x = k % W; if (y > low) low = y; if (y < topRow) topRow = y; if (x < minX) minX = x; if (x > maxX) maxX = x; }
    for (k = 0; k < W * H; k++) {
      if (!R.c[k] || seen[k]) continue; comps++;
      var st = [k]; seen[k] = 1;
      while (st.length) { var p = st.pop(), px = p % W, py = (p / W) | 0;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var nx = px + d[0], ny = py + d[1]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) return; var q = ny * W + nx; if (R.c[q] && !seen[q]) { seen[q] = 1; st.push(q); } }); }
    }
    return { pixels: n, low: low, top: topRow, comps: comps, minX: minX, maxX: maxX };
  }
  /* the back of the head must not read as a face: no face parts, no small dark dot or dash on the eye / mouth rows (a dark
     cluster of <= 3 px, at most 2 rows tall, well below the row's own median brightness), no bare skin across it (bald heads
     excepted) */
  var FACE_PARTS = { eyes: 1, eyewhite: 1, mouth: 1, glasses: 1, beard: 1, moustache: 1, cheek: 1, nose: 1 };
  function lum(h) { var c = hex2rgb(h); return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]; }
  function backOfHead(sp, R) {
    var out = [], Lh = R.layout, x0 = Lh.hx0 + 1, x1 = Lh.hx0 + Lh.hw - 2, er = Lh.eyeRow, x, y, k;
    for (y = Lh.hy0; y < Lh.hy0 + Lh.hh; y++) for (x = Lh.hx0 - 1; x <= Lh.hx0 + Lh.hw; x++) if (FACE_PARTS[R.o[y * W + x]]) { out.push('a face part (' + R.o[y * W + x] + ') on the back of the head'); y = 99; break; }
    var mark = {}, list = [];
    for (y = er - 1; y <= er + 3; y++) {
      var ls = []; for (x = x0; x <= x1; x++) { k = y * W + x; if (R.c[k] && R.c[k] !== INK) ls.push(lum(R.c[k])); }
      if (ls.length < 3) continue; ls.sort(function (a, b) { return a - b; }); var med = ls[ls.length >> 1];
      for (x = x0; x <= x1; x++) { k = y * W + x; if (R.c[k] && (R.c[k] === INK || lum(R.c[k]) < med - 45)) { mark[k] = 1; list.push(k); } }
    }
    var seen = {};
    list.forEach(function (k0) {
      if (seen[k0]) return; var st = [k0], comp = [], ymin = 99, ymax = -1, touchesEdge = false; seen[k0] = 1;
      while (st.length) { var q = st.pop(); comp.push(q); var qx = q % W, qy = (q / W) | 0; ymin = Math.min(ymin, qy); ymax = Math.max(ymax, qy); if (qx === x0 || qx === x1 || qy === er - 1 || qy === er + 3) touchesEdge = true;
        [q - 1, q + 1, q - W, q + W].forEach(function (n) { if (mark[n] && !seen[n]) { seen[n] = 1; st.push(n); } }); }
      if (comp.length <= 3 && ymax - ymin <= 1 && !touchesEdge) out.push('a dark dot or dash on the back of the head reads as an eye or a mouth');
    });
    if (sp.hair !== 'bald' && sp.head !== 'straw' && sp.head !== 'cap') {
      var sk = ramp(SKIN[sp.skin], 'skin'), n = 0;
      for (y = Lh.hy0; y <= er + 2; y++) for (x = x0 + 1; x <= x1 - 1; x++) if (sk.indexOf(R.c[y * W + x]) >= 0) n++;
      if (n > 2) out.push('bare skin across the back of the head');
    }
    return out;
  }

  /* verify(spec): every frame (4 directions x stand + 4 walk frames) is a single connected shape, stands on the foot line, has its eyes on
     the side it faces, the walk frames all differ and the feet alternate. -> {ok, problems:[{dir, frame, what}]} */
  function verify(spIn) {
    var sp = normSpec(spIn), problems = [];
    DIRS.forEach(function (dir) {
      var keys = [];
      for (var f = 0; f <= 4; f++) {
        var R = raster(sp, dir, f), I = inspect(R), p = function (what) { problems.push({ dir: dir, frame: f, what: what }); };
        if (I.comps !== 1) p(I.comps + ' pieces');
        if (I.low !== FOOT) p('feet off the line (lowest row ' + I.low + ', foot line ' + FOOT + ')');
        if (I.top < 1) p('cut off at the top');
        if (I.minX < 1 || I.maxX > W - 2) p('cut off at the side');
        var e = R.marks.eyes;
        if (dir === 'up' && e.length) p('eyes on the back of the head');
        if (dir === 'down' && (e.length !== 2 || e[0].x + e[1].x !== 2 * CX - 1)) p('front eyes not symmetric');
        if (dir === 'right' && (e.length !== 1 || e[0].x <= CX)) p('facing right but the eye is not on the right');
        if (dir === 'left' && (e.length !== 1 || e[0].x >= CX - 1)) p('facing left but the eye is not on the left');
        if (dir !== 'up') e.forEach(function (q) { if (R.c[q.y * W + q.x] !== EYE) p('an eye is covered'); });
        if (dir === 'up') backOfHead(sp, R).forEach(p);
        keys.push(R.c.join(','));
      }
      for (var a = 1; a <= 4; a++) for (var b = a + 1; b <= 4; b++) if (keys[a] === keys[b]) problems.push({ dir: dir, frame: a, what: 'walk frames ' + (a - 1) + ' and ' + (b - 1) + ' are the same' });
      if (keys[0] === keys[1] && keys[0] === keys[3]) problems.push({ dir: dir, frame: 0, what: 'the walk does not move' });
    });
    return { ok: problems.length === 0, problems: problems };
  }

  /* ---------- canvases, pose, draw ---------- */
  var hasDOM = typeof document !== 'undefined' && document.createElement;
  function toCanvas(R) {
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d'), id = g.createImageData(W, H), d = id.data;
    for (var k = 0; k < W * H; k++) { var col = R.c[k]; if (!col) continue; var v = hex2rgb(col); d[k * 4] = v[0]; d[k * 4 + 1] = v[1]; d[k * 4 + 2] = v[2]; d[k * 4 + 3] = 255; }
    g.putImageData(id, 0, 0);
    return c;
  }
  function normDir(d, prev) {
    if (d === 'down' || d === 'up' || d === 'left' || d === 'right') return d;
    if (d === 'D' || d === 's' || d === 'S') return 'down';
    if (d === 1 || d === '1') return 'right';
    if (d === -1 || d === '-1') return 'left';
    if (d && typeof d === 'object' && isFinite(d.x) && isFinite(d.y) && (d.x || d.y)) return Math.abs(d.x) >= Math.abs(d.y) ? (d.x > 0 ? 'right' : 'left') : (d.y > 0 ? 'down' : 'up');
    if (typeof d === 'number' && isFinite(d)) { var c = Math.cos(d), s = Math.sin(d); return Math.abs(c) >= Math.abs(s) - 1e-9 ? (c > 0 ? 'right' : 'left') : (s > 0 ? 'down' : 'up'); }
    return prev || 'down';
  }
  function poseOf(o, stride) {
    o = o || {};
    var dir = normDir(o.dir, 'down'), f = 0;
    if (o.frame != null && isFinite(o.frame)) f = 1 + ((Math.floor(+o.frame) % 4) + 4) % 4;
    else if (o.moving) { var w = +o.walk || 0; f = 1 + ((Math.floor(w / stride) % 4) + 4) % 4; }
    if (o.frame === -1) f = 0;
    return { dir: dir, frame: f, pose: f ? 'walk' : 'stand', i: f ? f - 1 : 0 };
  }
  function safe(fn, a, b, c) { try { return typeof fn === 'function' ? fn(a, b, c) : undefined; } catch (e) { return undefined; } }
  /* the device-pixel snap: pixel art is drawn at a WHOLE number of device pixels per art pixel whatever the game's transform
     (a 640-wide game on a 1920 canvas, a dpr-3 phone); returns the device scale k and the top-left in device px */
  function snapDraw(g, cvs, x, y, ax, ay, scale, alpha) {
    var t = null; try { t = g.getTransform(); } catch (e) { }
    scale = Math.max(1, Math.round(+scale || 1));
    if (!t || Math.abs(t.b) > 1e-6 || Math.abs(t.c) > 1e-6) {   // rotated or no getTransform: plain draw
      g.save(); g.imageSmoothingEnabled = false; if (alpha != null) g.globalAlpha *= alpha;
      g.drawImage(cvs, Math.round(x - ax * scale), Math.round(y - ay * scale), cvs.width * scale, cvs.height * scale); g.restore();
      return { k: scale, dx: x - ax * scale, dy: y - ay * scale, sx: 1, plain: true };
    }
    var sx = Math.abs(t.a), sy = Math.abs(t.d), k = Math.max(1, Math.round(sx * scale)), kY = Math.max(1, Math.round(sy * scale));
    var devX = t.a * x + t.e, devY = t.d * y + t.f;
    var left = Math.round(devX - ax * k), topY = Math.round(devY) - ay * kY;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false; if (alpha != null) g.globalAlpha *= alpha;
    g.drawImage(cvs, left, topY, cvs.width * k, cvs.height * kY);
    g.restore();
    return { k: k, kY: kY, dx: left, dy: topY, sx: sx, sy: sy, t: t };
  }

  var registry = [];   // live people (for the judge probe and stats)
  function create(seedOrSpec, opt) {
    opt = opt || {};
    var spec = seedOrSpec && typeof seedOrSpec === 'object' ? normSpec(seedOrSpec) : make(seedOrSpec, opt.over);
    spec.__norm = true;
    var params = { stride: Math.max(2, +(opt.params && opt.params.stride) || 4), shadow: !(opt.params && opt.params.shadow === false) };
    var cache = {}, stats = { draws: 0, builds: 0, errors: 0 }, last = null, nCache = 0;
    function entry(dir, f) {
      var key = dir + f;
      if (!cache[key]) { var R = raster(spec, dir, f); cache[key] = { R: R, canvas: hasDOM ? toCanvas(R) : null }; stats.builds++; nCache++; }
      return cache[key];
    }
    var P = {
      seed: spec.seed, spec: spec, params: params, W: W, H: H, CX: CX, FOOT: FOOT,
      get name() { return spec.name; }, get title() { return spec.title; }, get line() { return spec.line; },
      info: function () { return { name: spec.name, title: spec.title, role: spec.role, line: spec.line, seed: spec.seed }; },
      pose: function (o) { return poseOf(o, params.stride); },
      frame: function (dir, f) { return entry(normDir(dir), Math.max(0, Math.min(4, f | 0))).canvas; },
      raster: function (dir, f) { return entry(normDir(dir), Math.max(0, Math.min(4, f | 0))).R; },
      draw: function (g, x, y, o) {
        o = o || {};
        try {
          stats.draws++;
          var ps = poseOf(o, params.stride), e = entry(ps.dir, ps.frame), sc = Math.max(1, Math.round(+o.scale || 1));
          if (!g || !e.canvas || !isFinite(x) || !isFinite(y)) return null;
          if (params.shadow && o.shadow !== false) shadow(g, x, y, sc, o.alpha);
          var s = snapDraw(g, e.canvas, x, y, CX, FOOT, sc, o.alpha);
          var u = s.sx ? s.k / s.sx : sc;   // game px per art px
          last = { x: x, y: y, dir: ps.dir, pose: ps.pose, i: ps.i, frame: ps.frame, scale: sc, devScale: s.k, transform: s.sx || 1,
            rect: { x: x - CX * u, y: y - FOOT * u, w: W * u, h: H * u },
            screen: s.sx ? { x: s.dx / s.sx, y: s.dy / s.sx, w: W * s.k / s.sx, h: H * s.kY / s.sx } : { x: s.dx, y: s.dy, w: W * sc, h: H * sc },   // un-cameraed canvas px (device px / the transform's scale)
            mirrored: !!(s.t && s.t.a < 0), head: { x: x, y: y - (FOOT - e.R.layout.hy0 + 3) * u }, seed: spec.seed };
          return last;
        } catch (err) { stats.errors++; return null; }
      },
      rect: function (x, y, o) { o = o || {}; var sc = Math.max(1, Math.round(+o.scale || 1)), R = entry(poseOf(o, params.stride).dir, 0).R, I = inspect(R);
        return { x: x + (I.minX - CX) * sc, y: y + (I.top - FOOT) * sc, w: (I.maxX - I.minX + 1) * sc, h: (I.low - I.top + 1) * sc }; },
      headTop: function (x, y, o) { o = o || {}; var sc = Math.max(1, Math.round(+o.scale || 1)), R = entry(poseOf(o, params.stride).dir, 0).R, I = inspect(R); return { x: x, y: y + (I.top - FOOT) * sc }; },
      lastDrawn: function () { return last; },
      check: function () { return verify(spec); },
      state: function () { return { seed: spec.seed, name: spec.name, role: spec.role, last: last }; },
      stats: function () { return { draws: stats.draws, builds: stats.builds, errors: stats.errors, cached: nCache }; }
    };
    registry.push(P); if (registry.length > 512) registry.shift();
    return P;
  }
  function shadow(g, x, y, sc, alpha) {
    var t = null; try { t = g.getTransform(); } catch (e) { }
    var k = t ? Math.max(1, Math.round(Math.abs(t.a) * sc)) : sc, devX = t ? t.a * x + t.e : x, devY = t ? t.d * y + t.f : y;
    g.save(); if (t) g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha *= (alpha == null ? 1 : alpha) * 0.3; g.fillStyle = '#100a1e';
    var X = Math.round(devX), Y = Math.round(devY);
    g.fillRect(X - 5 * k, Y - 1 * k, 10 * k, k); g.fillRect(X - 6 * k, Y, 12 * k, k); g.fillRect(X - 5 * k, Y + k, 10 * k, k);
    g.restore();
  }

  /* ---------- bitmap font (the shared 5 x 7 pixel UI font) ---------- */
  var REG = {
    '!': '# # # # # . #', "'": '# #', '(': '..# .#. #.. #.. #.. .#. ..#', ')': '#.. .#. ..# ..# ..# .#. #..', ',': '.. .. .. .. .. ## .# #.', '-': '.... .... .... ####',
    '.': '.. .. .. .. .. ## ##', '/': '....# ...#. ...#. ..#.. .#... .#... #....', ':': '.. ## ## .. .. ## ##', '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
    '0': '.###. #...# #..## #.#.# ##..# #...# .###.', '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.', '2': '.###. #...# ....# ...#. ..#.. .#... #####',
    '3': '####. ....# ....# .###. ....# ....# ####.', '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.', '5': '##### #.... ####. ....# ....# #...# .###.',
    '6': '..##. .#... #.... ####. #...# #...# .###.', '7': '##### ....# ...#. ..#.. .#... .#... .#...', '8': '.###. #...# #...# .###. #...# #...# .###.',
    '9': '.###. #...# #...# .#### ....# ...#. .##..',
    'A': '.###. #...# #...# ##### #...# #...# #...#', 'B': '####. #...# #...# ####. #...# #...# ####.', 'C': '.###. #...# #.... #.... #.... #...# .###.',
    'D': '###.. #..#. #...# #...# #...# #..#. ###..', 'E': '##### #.... #.... ####. #.... #.... #####', 'F': '##### #.... #.... ####. #.... #.... #....',
    'G': '.###. #...# #.... #.### #...# #...# .####', 'H': '#...# #...# #...# ##### #...# #...# #...#', 'I': '### .#. .#. .#. .#. .#. ###',
    'J': '..### ...#. ...#. ...#. #..#. #..#. .##..', 'K': '#...# #..#. #.#.. ##... #.#.. #..#. #...#', 'L': '#... #... #... #... #... #... ####',
    'M': '#...# ##.## #.#.# #.#.# #...# #...# #...#', 'N': '#...# ##..# #.#.# #..## #...# #...# #...#', 'O': '.###. #...# #...# #...# #...# #...# .###.',
    'P': '####. #...# #...# ####. #.... #.... #....', 'Q': '.###. #...# #...# #...# #.#.# #..#. .##.#', 'R': '####. #...# #...# ####. #.#.. #..#. #...#',
    'S': '.#### #.... #.... .###. ....# ....# ####.', 'T': '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..', 'U': '#...# #...# #...# #...# #...# #...# .###.',
    'V': '#...# #...# #...# #...# #...# .#.#. ..#..', 'W': '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.', 'X': '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
    'Y': '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..', 'Z': '##### ....# ...#. ..#.. .#... #.... #####',
    'a': '.... .... .##. ...# .### #..# .###', 'b': '#... #... ###. #..# #..# #..# ###.', 'c': '.... .... .### #... #... #... .###', 'd': '...# ...# .### #..# #..# #..# .###',
    'e': '.... .... .##. #..# #### #... .###', 'f': '..## .#.. #### .#.. .#.. .#.. .#..', 'g': '.... .... .### #..# #..# .### ...# ###.', 'h': '#... #... ###. #..# #..# #..# #..#',
    'i': '# . # # # # #', 'j': '..# ... .## ..# ..# ..# ..# ##.', 'k': '#... #... #..# #.#. ##.. #.#. #..#', 'l': '#. #. #. #. #. #. .#',
    'm': '..... ..... ##.#. #.#.# #.#.# #.#.# #.#.#', 'n': '.... .... ###. #..# #..# #..# #..#', 'o': '.... .... .##. #..# #..# #..# .##.',
    'p': '.... .... ###. #..# #..# ###. #... #...', 'q': '.... .... .### #..# #..# .### ...# ...#', 'r': '.... .... #.## ##.. #... #... #...',
    's': '.... .... .### #... .##. ...# ###.', 't': '.#. .#. ### .#. .#. .#. ..#', 'u': '.... .... #..# #..# #..# #..# .###', 'v': '..... ..... #...# #...# .#.#. .#.#. ..#..',
    'w': '..... ..... #...# #...# #.#.# #.#.# .#.#.', 'x': '..... ..... #...# .#.#. ..#.. .#.#. #...#', 'y': '.... .... #..# #..# #..# .### ...# ###.',
    'z': '.... .... #### ...# .##. #... ####'
  };
  var FONT = null;
  function pfont() { if (FONT) return FONT; var g = {}; for (var ch in REG) { var rows = REG[ch].split(' '), w = 0; for (var i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length); g[ch] = { rows: rows, w: w }; } return (FONT = g); }
  function textW(s) { var F = pfont(), w = 0; s = String(s); for (var i = 0; i < s.length; i++) { var c = s.charAt(i), G = F[c]; w += (c === ' ' ? 3 : G ? G.w : 3) + 1; } return Math.max(0, w - 1); }
  function text(g, s, x, y, col, shadowCol) {
    var F = pfont(); s = String(s); x = Math.round(x); y = Math.round(y);
    for (var pass = shadowCol ? 0 : 1; pass < 2; pass++) {
      var cx = x + (pass ? 0 : 1), cy = y + (pass ? 0 : 1); g.fillStyle = pass ? col : shadowCol;
      for (var i = 0; i < s.length; i++) {
        var c = s.charAt(i), G = F[c]; if (c === ' ' || !G) { cx += 4; continue; }
        for (var r = 0; r < G.rows.length; r++) for (var q = 0; q < G.rows[r].length; q++) if (G.rows[r].charAt(q) === '#') g.fillRect(cx + q, cy + r, 1, 1);
        cx += G.w + 1;
      }
    }
  }
  function wrapText(s, maxW) {
    var words = String(s).split(' '), lines = [], cur = '';
    words.forEach(function (w) { var t = cur ? cur + ' ' + w : w; if (textW(t) > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur);
    return lines;
  }
  function cap1(s) { s = String(s); return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ---------- the talk panel: a screen-space dialogue box with the talker's own pixel portrait ----------
     Anchored to the bottom of the view (or the top when the speakers would be under it), inside the view, clear of the
     game's HUD rects, never over the two speakers. Layout in art px (1 art px = scale game px), drawn once per frame as an
     offscreen canvas snapped to whole device pixels. Everything that moves (slide-in, typewriter, the waiting arrow) is a
     function of the talk's own clock, which only update() advances. */
  var PANEL = { ink: '#0c0814', bg: '#1d1631', bg2: '#251c3e', edge: '#f1e2c0', edgeD: '#8a7a9c', rule: '#3d3060', name: '#ffe7a0', role: '#a8e0c8', text: '#e4dcf0',
    well: ['#2b2248', '#332958', '#3c3166'], glow: '#4a3e78', wellHi: '#5a4b86', stud: '#d9b45c' };
  var PH = 56, PORT = 22, PMAX = 300, PIN = 160, CPS = 0.07;   // panel height, portrait crop (art px, drawn 2x), max width, slide-in ms, typewriter chars per ms
  function portrait(spIn) {
    var sp = spIn && spIn.__norm ? spIn : normSpec(spIn), R = raster(sp, 'down', 0), I = inspect(R), L = R.layout;
    var bot = Math.min(H, L.ty0 + 7), top = bot - PORT, x0 = CX - PORT / 2, c = new Array(PORT * PORT);
    for (var y = 0; y < PORT; y++) for (var x = 0; x < PORT; x++) { var sy = top + y, sx = x0 + x; c[y * PORT + x] = sy >= 0 && sy < H && sx >= 0 && sx < W ? (R.c[sy * W + sx] || null) : null; }
    return { w: PORT, h: PORT, c: c, x0: x0, y0: top, clipped: I.top < top, seed: sp.seed, key: hash(c.join()) };
  }
  function rectList(L, sc) {
    if (typeof L === 'function') L = safe(L);
    var out = []; if (!L || typeof L.length !== 'number') return out;
    for (var i = 0; i < L.length; i++) { var a = L[i]; if (a && isFinite(a.x) && isFinite(a.y) && a.w > 0 && a.h > 0) out.push({ x: a.x / sc, y: a.y / sc, w: a.w / sc, h: a.h / sc }); }
    return out;
  }
  function ovArea(r, list, pad) { var s = 0; pad = pad || 0; for (var i = 0; i < list.length; i++) { var q = list[i], w = Math.min(r.x + r.w, q.x + q.w + pad) - Math.max(r.x, q.x - pad), h = Math.min(r.y + r.h, q.y + q.h + pad) - Math.max(r.y, q.y - pad); if (w > 0 && h > 0) s += w * h; } return s; }
  /* panelLayout(info, {view, avoid, speakers, scale}) -> {x, y, w, h (game px), side, art: {...} (art px), name, role, lines} */
  function panelLayout(info, o) {
    o = o || {}; info = info || {};
    var sc = o.unit > 0 ? +o.unit : Math.max(1, Math.round(+o.scale || 1)), view = o.view && o.view.w > 0 && o.view.h > 0 ? o.view : { x: 0, y: 0, w: 320, h: 180 };   // unit = game px per art px as really drawn
    var vs = { x: (+view.x || 0) / sc, y: (+view.y || 0) / sc, w: view.w / sc, h: view.h / sc };
    var need = Math.max(textW(String(info.name || '')), textW(cap1(info.title || info.role || '')), textW(String(info.line || ''))) + 72;   // as wide as its text needs (one row), 200 at least
    var w = Math.max(96, Math.min(PMAX, Math.floor(vs.w) - 8, Math.max(200, need))), h = PH, x = Math.round(vs.x + (vs.w - w) / 2), tw = w - 64;
    var avoid = rectList(o.avoid, sc), spk = rectList(o.speakers, sc);
    function band(side) {
      var y = side === 'bottom' ? Math.floor(vs.y + vs.h - 4 - h) : Math.ceil(vs.y + 4);
      for (var k = 0; k < 8; k++) {   // step past the HUD rects in the band (above them at the bottom, below them at the top)
        var hit = null; for (var i = 0; i < avoid.length; i++) { var a = avoid[i]; if (a.x < x + w && a.x + a.w > x && a.y < y + h && a.y + a.h > y) { hit = a; break; } }
        if (!hit) break; y = side === 'bottom' ? Math.floor(hit.y - 2 - h) : Math.ceil(hit.y + hit.h + 2);
      }
      var r = { x: x, y: y, w: w, h: h, side: side };
      r.out = y < vs.y || y + h > vs.y + vs.h; r.hud = ovArea(r, avoid, 0); r.spk = ovArea(r, spk, 3);
      r.score = (r.out ? 1e9 : 0) + r.hud * 1e5 + r.spk * 100 + (side === 'top' ? 1 : 0);
      return r;
    }
    var b = band('bottom'), t = band('top'), best = t.score < b.score ? t : b;
    var name = String(info.name || ''), role = cap1(info.title || info.role || ''), lines = info.line ? wrapText(String(info.line), tw).slice(0, 2) : [];
    return { x: best.x * sc, y: best.y * sc, w: w * sc, h: h * sc, side: best.side, scale: sc, art: best, name: name, role: role, lines: lines,
      clearHud: !best.hud && !best.out, clearSpeakers: !best.spk, options: { bottom: Math.round(b.score), top: Math.round(t.score) } };
  }
  function pixCircle(c, cx, cy, r, col, y0, y1) { c.fillStyle = col; for (var y = Math.max(y0, cy - r); y <= Math.min(y1, cy + r); y++) { var dx = Math.floor(Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy)))); c.fillRect(cx - dx, y, dx * 2 + 1, 1); } }
  var panelCache = { key: null, cv: null };
  function panelCanvas(Lp, port, n, total, t) {
    var A = Lp.art, w = A.w, h = A.h, complete = n >= total, blink = complete ? Math.floor(t / 420) % 2 : 0;
    var key = [w, port ? port.seed : '-', Lp.name, Lp.role, Lp.lines.join('/'), n, complete ? 1 : 0, blink].join('|');
    if (panelCache.key === key && panelCache.cv) return panelCache.cv;
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h; var c = cv.getContext('2d'), P = PANEL;
    c.fillStyle = P.ink; c.fillRect(1, 0, w - 2, h); c.fillRect(0, 1, w, h - 2);
    c.fillStyle = P.bg; c.fillRect(2, 2, w - 4, h - 4); c.fillStyle = P.bg2; c.fillRect(2, 2, w - 4, 11); c.fillRect(2, 13, w - 4, 1);
    c.fillStyle = P.edge; c.fillRect(2, 1, w - 4, 1); c.fillRect(1, 2, 1, h - 4);
    c.fillStyle = P.edgeD; c.fillRect(2, h - 2, w - 4, 1); c.fillRect(w - 2, 2, 1, h - 4);
    c.fillStyle = P.stud; c.fillRect(1, 1, 1, 1); c.fillRect(w - 2, 1, 1, 1); c.fillRect(1, h - 2, 1, 1); c.fillRect(w - 2, h - 2, 1, 1);
    /* the portrait well: an inset frame, a dusk backdrop in three dithered bands, a soft light behind the head */
    var wx = 4, wy = 4, ww = 48;
    c.fillStyle = P.ink; c.fillRect(wx, wy, ww, ww);
    c.fillStyle = P.well[0]; c.fillRect(wx + 1, wy + 1, ww - 2, 15); c.fillStyle = P.well[1]; c.fillRect(wx + 1, wy + 16, ww - 2, 15); c.fillStyle = P.well[2]; c.fillRect(wx + 1, wy + 31, ww - 2, ww - 32);
    for (var dx = wx + 1; dx < wx + ww - 1; dx += 2) { c.fillStyle = P.well[1]; c.fillRect(dx, wy + 15, 1, 1); c.fillStyle = P.well[2]; c.fillRect(dx + 1, wy + 30, 1, 1); }
    pixCircle(c, wx + 24, wy + 20, 13, P.glow, wy + 1, wy + ww - 2);
    c.fillStyle = '#120c1f'; c.fillRect(wx + 1, wy + 1, ww - 2, 1); c.fillRect(wx + 1, wy + 1, 1, ww - 2);
    c.fillStyle = P.wellHi; c.fillRect(wx + 1, wy + ww - 2, ww - 2, 1); c.fillRect(wx + ww - 2, wy + 1, 1, ww - 2);
    if (port) for (var py = 0; py < port.h; py++) for (var px = 0; px < port.w; px++) { var col = port.c[py * port.w + px]; if (col) { c.fillStyle = col; c.fillRect(wx + 2 + px * 2, wy + 2 + py * 2, 2, 2); } }
    /* name, trade, a rule, the line (typewriter) */
    var tx = 58;
    text(c, Lp.name, tx, 5, P.name, P.ink);
    if (Lp.role) text(c, Lp.role, tx, 15, P.role, P.ink);
    c.fillStyle = P.rule; c.fillRect(tx, 25, w - tx - 6, 1);
    var left = n;
    Lp.lines.forEach(function (l, i) { if (left <= 0) return; var s = l.slice(0, left); left -= l.length + 1; text(c, s, tx, 29 + i * 10, P.text, P.ink); });
    if (complete) {   // the waiting arrow, bobbing
      var ax = w - 11, ay = h - 9 + blink; c.fillStyle = P.ink; c.fillRect(ax - 1, ay - 1, 7, 1); c.fillRect(ax - 1, ay, 7, 1); c.fillRect(ax, ay + 1, 5, 1); c.fillRect(ax + 1, ay + 2, 3, 1); c.fillRect(ax + 2, ay + 3, 1, 1);
      c.fillStyle = P.name; c.fillRect(ax, ay, 5, 1); c.fillRect(ax + 1, ay + 1, 3, 1); c.fillRect(ax + 2, ay + 2, 1, 1);
    }
    panelCache.key = key; panelCache.cv = cv;
    return cv;
  }
  /* panel(ctx, info, {view, avoid, speakers, scale, t, alpha, portrait}) -> rect in game px (+ side, portrait device rect) */
  function panel(g, info, o) {
    o = o || {};
    try {
      info = info || {};
      var art = Math.max(1, Math.round(+o.scale || 1)), unit = art, tr = null;
      try { tr = g && g.getTransform ? g.getTransform() : null; } catch (e) { tr = null; }
      if (tr && Math.abs(tr.a) > 1e-6 && Math.abs(tr.b) < 1e-6 && Math.abs(tr.c) < 1e-6) unit = Math.max(1, Math.round(Math.abs(tr.a) * art)) / Math.abs(tr.a);   // the snap rounds to whole device px per art px (a 1.5x canvas draws 2x): lay out in that size so the panel fits the view
      var Lp = panelLayout(info, { view: o.view, avoid: o.avoid, speakers: o.speakers, scale: art, unit: unit }), t = isFinite(+o.t) ? +o.t : 1e9, total = Lp.lines.reduce(function (s, l) { return s + l.length; }, 0) + Math.max(0, Lp.lines.length - 1);
      var k = Math.max(0, Math.min(1, t / PIN)), e = k * k * (3 - 2 * k), n = Math.max(0, Math.floor((t - PIN) * CPS));
      var alpha = (o.alpha == null ? 1 : Math.max(0, Math.min(1, +o.alpha))) * e, sc = Lp.scale, dy = Math.round((1 - e) * 6) * (Lp.side === 'top' ? -1 : 1);
      var out = { x: Lp.x, y: Lp.y, w: Lp.w, h: Lp.h, side: Lp.side, name: Lp.name, alpha: alpha, chars: Math.min(n, total), total: total, complete: n >= total, clearHud: Lp.clearHud, clearSpeakers: Lp.clearSpeakers,
        portraitRect: { x: Lp.x + 6 * sc, y: Lp.y + 6 * sc, w: 44 * sc, h: 44 * sc } };
      var port = o.portrait || (info.spec ? portrait(info.spec) : info.skin ? portrait(info) : null);
      out.portraitKey = port ? port.key : null;
      if (!g || alpha <= 0 || !hasDOM) return out;
      var s = snapDraw(g, panelCanvas(Lp, port, n, total, t), Lp.x, Lp.y + dy * sc, 0, 0, art, alpha);
      out.device = { x: s.dx, y: s.dy, k: s.k, kY: s.kY || s.k, portrait: { x: s.dx + 6 * s.k, y: s.dy + 6 * (s.kY || s.k), px: 2 * s.k } };
      return out;
    } catch (err) { return null; }
  }
  /* the marker over a talker's head: a small speech pip ("..."), dots filling while the line types, a slow bob once it is all shown */
  var PIP = ['.#######.', '#wwwwwww#', '#w1w2w3w#', '#wwwwwww#', '.###w###.', '...#w#...', '....#....'];
  var pipCache = {};
  function pipCanvas(lit) {
    if (pipCache[lit]) return pipCache[lit];
    var cv = document.createElement('canvas'); cv.width = 9; cv.height = 7; var c = cv.getContext('2d');
    for (var y = 0; y < 7; y++) for (var x = 0; x < 9; x++) { var ch = PIP[y].charAt(x); if (ch === '.') continue;
      c.fillStyle = ch === '#' ? INK : ch === 'w' ? '#fff4dc' : (+ch <= lit ? '#4a3a78' : '#fff4dc'); c.fillRect(x, y, 1, 1); }
    c.fillStyle = '#d8c8b0'; c.fillRect(1, 3, 7, 1);   // a little shade under the dots
    return (pipCache[lit] = cv);
  }
  function pipState(t, complete) { return { lit: complete ? 3 : 1 + Math.floor(Math.max(0, t) / 160) % 3, bob: complete ? Math.floor(t / 420) % 2 : 0 }; }

  /* ---------- town: wandering townsfolk for a game's map ----------
     town({seed, count, specs, area, blocked(x, y), speed, scale, stride, spawn:[{x, y}], talkMs, leave, avoid}) */
  function town(o) {
    o = o || {};
    var R = rng('town:' + seedOf(o.seed == null ? 1 : o.seed)), sc = Math.max(1, Math.round(+o.scale || 1));
    var speed = (+o.speed || 22) * sc, foot = { w: 8 * sc, h: 4 * sc }, gapX = (+o.gapX || 14) * sc, gapY = (+o.gapY || 22) * sc;   // two people's feet never closer than this box (a front person would hide the one behind)
    var leave = o.leave === 0 ? 0 : (+o.leave || 48) * sc;   // a talk ends when the player walks this far from the talker
    var specs = o.specs || crowd(o.count == null ? 8 : o.count, o.seed == null ? 1 : o.seed, { minDist: o.minDist, avoid: o.avoid });
    var stats = { steps: 0, blockedTurns: 0, yields: 0, talks: 0, ended: 0, panels: 0, errors: 0 };
    function area() { var a = typeof o.area === 'function' ? safe(o.area) : o.area; return a && a.w > 0 ? a : { x: 0, y: 0, w: 320, h: 180 }; }
    function solid(x, y) {
      var A = area();
      if (x - foot.w / 2 < A.x || x + foot.w / 2 > A.x + A.w || y - foot.h < A.y || y > A.y + A.h) return true;
      if (typeof o.blocked !== 'function') return false;
      var pts = [[x - foot.w / 2, y - foot.h], [x + foot.w / 2, y - foot.h], [x - foot.w / 2, y], [x + foot.w / 2, y], [x, y - foot.h / 2]];
      for (var i = 0; i < pts.length; i++) { var b; try { b = o.blocked(pts[i][0], pts[i][1]); } catch (e) { stats.errors++; b = true; } if (b) return true; }
      return false;
    }
    var folk = [];
    specs.forEach(function (s, i) {
      var p = null, A = area();
      if (o.spawn && o.spawn[i]) p = { x: o.spawn[i].x, y: o.spawn[i].y };
      for (var tries = 0; !p && tries < 200; tries++) {
        var x = Math.round(A.x + 8 * sc + R.next() * (A.w - 16 * sc)), y = Math.round(A.y + 6 * sc + R.next() * (A.h - 8 * sc));
        if (solid(x, y)) continue;
        if (folk.some(function (f) { return Math.abs(f.x - x) < gapX * 1.4 && Math.abs(f.y - y) < gapY * 1.2; })) continue;
        p = { x: x, y: y };
      }
      if (!p) return;
      folk.push({ id: 'npc' + i, npc: create(s, { params: { stride: o.stride || 4, shadow: o.shadow } }), x: p.x, y: p.y, dir: DIRS[R.int(4)], moving: false, walk: 0,
        mode: 'pause', timer: 300 + R.int(1600), left: 0, talk: null, wantDir: null, spec: s, portrait: null });
    });
    var player = null, current = null, bye = null;
    /* someone in the way at (x, y): only when the move brings f closer to them, so two people that ended up close (the player
       walked into one) can always step apart. The spot a speaker is walking to (talk(..., {at})) counts as a person. */
    function near(q, x, y) { return Math.abs(q.x - x) < gapX && Math.abs(q.y - y) < gapY; }
    function closer(q, f, x, y) { return Math.abs(q.x - x) + Math.abs(q.y - y) * 1.5 < Math.abs(q.x - f.x) + Math.abs(q.y - f.y) * 1.5 - 1e-6; }
    function others(f, x, y) {
      for (var i = 0; i < folk.length; i++) { var g = folk[i]; if (g === f) continue; if (near(g, x, y) && (!near(g, f.x, f.y) || closer(g, f, x, y))) return g;
        var rs = g.talk && g.talk.res; if (rs && near(rs, x, y) && (!near(rs, f.x, f.y) || closer(rs, f, x, y))) return rs; }
      if (player && near(player, x, y) && (!near(player, f.x, f.y) || closer(player, f, x, y))) return player;
      return null;
    }
    /* make way: a person who stands too close to the player (who is not solid and walks into people), to a reserved spot,
       or to someone else (only the later one of the two moves) steps out along the axis that clears the box soonest */
    function crowded(f) {
      if (player && near(player, f.x, f.y)) return player;
      for (var i = 0; i < folk.length; i++) { var g = folk[i]; if (g === f) continue; var rs = g.talk && g.talk.res; if (rs && near(rs, f.x, f.y)) return rs; }
      for (var j = 0; j < folk.length; j++) { var q = folk[j]; if (q === f) break; if (near(q, f.x, f.y)) return q; }
      return null;
    }
    function makeWay(f, q) {
      var dx = f.x - q.x, dy = f.y - q.y, needX = gapX - Math.abs(dx), needY = gapY - Math.abs(dy);
      var C = [[needX <= needY ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up'), Math.min(needX, needY)], [needX <= needY ? (dy >= 0 ? 'down' : 'up') : (dx >= 0 ? 'right' : 'left'), Math.max(needX, needY)],
        [dx >= 0 ? 'left' : 'right', 0], [dy >= 0 ? 'up' : 'down', 0]];
      for (var i = 0; i < C.length; i++) { var v = VEC[C[i][0]], len = Math.max(4 * sc, C[i][1] + 2 * sc), nx = f.x + v[0] * Math.min(len, 6 * sc), ny = f.y + v[1] * Math.min(len, 6 * sc);
        if (!solid(nx, ny) && !others(f, nx, ny)) { f.dir = C[i][0]; f.left = len; f.mode = 'walk'; f.yielding = true; return true; } }
      return false;
    }
    /* turn to face who (keeps facing a moving speaker); a small dead zone stops flicker on the diagonal */
    function faceTo(f, who) {
      if (!who) return;
      var dx = who.x - f.x, dy = who.y - f.y; if (!isFinite(dx) || !isFinite(dy) || (!dx && !dy)) return;
      var side = f.dir === 'left' || f.dir === 'right', ax = Math.abs(dx), ay = Math.abs(dy);
      var horiz = side ? ax >= ay * 0.8 : ax > ay * 1.25;
      f.dir = horiz ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    }
    var VEC = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };
    function choose(f) {
      var opts = DIRS.slice(), best = null;
      for (var k = 0; k < 4; k++) {
        var d = opts[(R.int(4) + k) % 4], v = VEC[d], len = (14 + R.int(36)) * sc;
        var probe = Math.min(len, 10 * sc);
        if (!solid(f.x + v[0] * probe, f.y + v[1] * probe) && !others(f, f.x + v[0] * probe, f.y + v[1] * probe)) { best = { d: d, len: len }; break; }
      }
      if (!best) { f.mode = 'pause'; f.timer = 400 + R.int(800); f.moving = false; return; }
      f.dir = best.d; f.left = best.len; f.mode = 'walk'; f.yielding = false;
    }
    function endTalk(f, why) {
      if (!f || !f.talk) return;
      f.talk = null; f.mode = 'pause'; f.timer = 400 + R.int(600); stats.ended++;
      if (current === f) { bye = { f: f, t: 0, why: why || 'release' }; current = null; }
    }
    /* a free spot beside the speaker (same row, 16 px aside; else 24 px above / below), reachable in a straight line */
    function stepOut(f, w) {
      var side = f.x >= w.x ? 1 : -1, C = [[w.x + side * 16 * sc, w.y], [w.x - side * 16 * sc, w.y], [w.x, w.y + 24 * sc], [w.x, w.y - 24 * sc],
        [w.x + side * 16 * sc, w.y + 6 * sc], [w.x + side * 16 * sc, w.y - 6 * sc], [w.x - side * 16 * sc, w.y + 6 * sc], [w.x - side * 16 * sc, w.y - 6 * sc],
        [w.x + side * 24 * sc, w.y], [w.x - side * 24 * sc, w.y], [w.x, w.y + 30 * sc], [w.x, w.y - 30 * sc]];
      var busy = function (x, y) { return solid(x, y) || folk.some(function (g) { return g !== f && Math.abs(g.x - x) < gapX && Math.abs(g.y - y) < gapY; }); };
      for (var i = 0; i < C.length; i++) { var x = C[i][0], y = C[i][1], axis = Math.abs(x - f.x) >= Math.abs(y - f.y) ? 'x' : 'y', ok = !busy(x, y);
        var cx = axis === 'x' ? x : f.x, cy = axis === 'x' ? f.y : y;   // the corner of the L-shaped step (one axis, then the other)
        if (Math.abs(x - cx) + Math.abs(y - cy) < 7 * sc && !busy(cx, cy) && (Math.abs(cx - w.x) >= gapX || Math.abs(cy - w.y) >= gapY)) { x = cx; y = cy; ok = !busy(x, y); }   // a stub second leg would flash a turn: stop at the corner
        for (var k = 1; k <= 4 && ok; k++) { if (busy(f.x + (cx - f.x) * k / 4, f.y + (cy - f.y) * k / 4) || busy(cx + (x - cx) * k / 4, cy + (y - cy) * k / 4)) ok = false; }
        if (ok) return { x: x, y: y, axis: axis };
      }
      return null;
    }
    function talkWith(f) { var t = f.talk; return t && t.withPlayer && player ? player : t && t.with; }
    function speakersAt(f, camX, camY) {
      var fr = f.npc.rect(f.x - camX, f.y - camY, { dir: f.dir, scale: sc }), L = [{ x: fr.x, y: fr.y - 10 * sc, w: fr.w, h: fr.h + 10 * sc }], w = talkWith(f);   // the talker with its marker
      if (w && isFinite(w.x) && isFinite(w.y)) L.push({ x: w.x - camX - 9 * sc, y: w.y - camY - 31 * sc, w: 18 * sc, h: 32 * sc });
      return L;
    }
    function shownTalk() { return current && current.talk && !current.talk.res ? current : null; }
    var T = {
      folk: folk,
      update: function (dt, who) {
        dt = +dt; if (!(dt > 0) || dt > 1000) return;
        player = who && isFinite(who.x) && isFinite(who.y) ? { x: who.x, y: who.y } : null;
        if (bye) { bye.t += dt; if (bye.t > 140) bye = null; }
        folk.forEach(function (f) {
          try {
            if (f.talk) {
              f.moving = false;
              var st = f.talk.step;
              if (!st) f.talk.t += dt;   // the talk clock (panel slide-in, typewriter) starts once the person stands and faces the speaker
              if (st) {   // stepping aside (5x walk speed, an L: the axis chosen once is finished first, so the drawn direction changes at most once; real walk frames), then face the speaker
                var dx = st.x - f.x, dy = st.y - f.y, sp = speed * 5 * dt / 1000;
                if (Math.abs(dx) > 1e-6 && (st.axis === 'x' || Math.abs(dy) <= 1e-6)) { var mx = Math.sign(dx) * Math.min(sp, Math.abs(dx)); f.x += mx; f.walk += Math.abs(mx); f.dir = dx > 0 ? 'right' : 'left'; }
                else { var my = Math.sign(dy) * Math.min(sp, Math.abs(dy)); f.y += my; f.walk += Math.abs(my); f.dir = dy > 0 ? 'down' : 'up'; }
                f.moving = true;
                if (Math.abs(st.x - f.x) < 1e-6 && Math.abs(st.y - f.y) < 1e-6) { f.talk.step = null; f.moving = false; faceTo(f, talkWith(f)); }
                return;
              }
              faceTo(f, talkWith(f));
              if (!f.talk.res && f.talk.withPlayer && player && leave > 0 && Math.abs(player.x - f.x) + Math.abs(player.y - f.y) > leave) { endTalk(f, 'left'); return; }   // the player walked off
              if (f.talk.ms > 0 && f.talk.t >= f.talk.ms) endTalk(f, 'timeout');
              return;
            }
            var q = crowded(f), moved = false;
            if (q && !(f.mode === 'walk' && f.yielding)) { moved = makeWay(f, q); if (moved) stats.yields++; }
            if (f.mode === 'pause') {
              f.moving = false; f.timer -= dt;
              if (f.timer > 0 && f.timer < 260 && !f.looked) { f.looked = true; if (R.chance(0.5)) f.dir = DIRS[R.int(4)]; }   // a look round while waiting
              if (f.timer <= 0) { f.looked = false; choose(f); }
              return;
            }
            var v = VEC[f.dir], stepPx = Math.min(f.left, speed * dt / 1000), nx = f.x + v[0] * stepPx, ny = f.y + v[1] * stepPx;
            var ox = f.x + v[0] * (stepPx + 3 * sc), oy = f.y + v[1] * (stepPx + 3 * sc), hitO = others(f, ox, oy);
            if (solid(nx, ny) || hitO) {
              f.moving = false; f.mode = 'pause'; f.timer = 250 + R.int(600); f.yielding = false;
              if (hitO === player) stats.yields++; else stats.blockedTurns++;
              return;
            }
            f.x = nx; f.y = ny; f.walk += stepPx; f.left -= stepPx; f.moving = true; stats.steps++;
            if (f.left <= 0.01) { f.mode = 'pause'; f.timer = 500 + R.int(1800); f.moving = false; f.yielding = false; }
          } catch (e) { stats.errors++; }
        });
      },
      /* the person nearest to (x, y) within r game px, or null */
      nearest: function (x, y, r, skip) {
        var best = null, bd = (r == null ? 20 * sc : r);
        folk.forEach(function (f) { if (skip && skip.indexOf(f.id) >= 0) return; var d = Math.hypot(f.x - x, (f.y - y) * 1.3); if (d <= bd) { bd = d; best = f; } });
        return best;
      },
      /* stop and turn to face who ({x, y}, kept live; the player passed to update() when who stands where the player is).
         ms = how long (0 = until release, or until the player walks `leave` px away). opt.at = the spot who is walking to:
         the person waits (turned to who), nobody steps into that spot, and the panel shows when talk() is called again there */
      talk: function (f, who, ms, opt) {
        if (!f) return null;
        var at = opt && opt.at && isFinite(opt.at.x) && isFinite(opt.at.y) ? { x: opt.at.x, y: opt.at.y } : null;
        if (current && current !== f && current.talk) endTalk(current, 'switch');
        var wp = !!(who && player && Math.abs(who.x - player.x) <= 12 * sc && Math.abs(who.y - player.y) <= 12 * sc) || !!(who && !player);
        f.talk = { t: 0, ms: ms == null ? (o.talkMs == null ? 0 : o.talkMs) : ms, with: who || null, withPlayer: wp, res: at };
        f.moving = false; stats.talks++; current = f; bye = null;
        var w0 = talkWith(f); if (!at && w0 && near(w0, f.x, f.y)) f.talk.step = stepOut(f, w0);   // the speaker walked into the person: it steps aside first
        if (!f.talk.step) faceTo(f, w0);
        if (!f.portrait) f.portrait = portrait(f.spec);
        return f.npc.info();
      },
      release: function (f) { endTalk(f || current, 'release'); },
      /* the person talking now (whose panel shows), or null */
      talking: function () { return shownTalk(); },
      drawOpts: function (f) { return { dir: f.dir, moving: f.moving, walk: f.walk, scale: sc }; },
      /* one entry per person for the game's own depth sort: [{y, draw(ctx)}] (y = feet in world px); the talker's draw
         also puts the small speech marker over its head */
      drawables: function (camX, camY) {
        camX = +camX || 0; camY = +camY || 0;
        return folk.map(function (f) { return { y: f.y, id: f.id, npc: f, draw: function (g) { f.npc.draw(g, f.x - camX, f.y - camY, T.drawOpts(f)); if (f === shownTalk()) T.drawMarker(g, f, camX, camY); } }; });
      },
      draw: function (g, camX, camY) { T.drawables(camX, camY).sort(function (a, b) { return a.y - b.y; }).forEach(function (d) { d.draw(g); }); },
      /* the marker's rect in screen px (9 x 7 art px, its tip 2 px over the head), or null */
      marker: function (f, camX, camY) {
        f = f || shownTalk(); if (!f || !f.talk || f.talk.res) return null;
        var x = f.x - (+camX || 0), y = f.y - (+camY || 0), ht = f.npc.headTop(x, y, { dir: f.dir, scale: sc }).y, ps = pipState(f.talk.t, T.panelState().complete);
        return { x: Math.round(x) - 4 * sc, y: Math.round(ht) - 9 * sc - ps.bob * sc, w: 9 * sc, h: 7 * sc, lit: ps.lit, id: f.id };
      },
      drawMarker: function (g, f, camX, camY) {
        try { var m = T.marker(f, camX, camY); if (!m || !hasDOM) return m; snapDraw(g, pipCanvas(m.lit), m.x, m.y, 0, 0, sc); return m; } catch (e) { stats.errors++; return null; }
      },
      /* the talk panel (screen space; after the world, before the game's own windows): camX, camY = the world point at the
         screen's top-left (screen = world - cam); view = the visible game rect; avoid = the HUD rects (array or function) */
      panel: function (g, camX, camY, po) {
        po = po || {};
        var f = shownTalk(), alpha = 1, t;
        if (!f && bye && bye.f) { f = bye.f; alpha = 1 - bye.t / 140; t = 1e9; }
        if (!f) return null;
        if (t == null) t = f.talk.t;
        var info = f.npc.info(), cx = +camX || 0, cy = +camY || 0;
        var r = panel(g, info, { view: po.view, avoid: po.avoid, speakers: speakersAt(f, cx, cy), scale: po.scale || sc, t: t, alpha: alpha, portrait: f.portrait || (f.portrait = portrait(f.spec)) });
        if (r) { r.id = f.id; r.seed = f.spec.seed; if (alpha === 1) stats.panels++; }
        T.lastPanel = r;
        return r;
      },
      /* the panel's state from the talk clock (no view needed): who, how far the slide-in and typewriter are */
      panelState: function () {
        var f = shownTalk(); if (!f) return { id: null, alpha: bye ? Math.max(0, 1 - bye.t / 140) : 0, closing: !!bye };
        var Lp = panelLayout(f.npc.info(), { scale: 1, view: { x: 0, y: 0, w: 1e4, h: 1e4 } }), t = f.talk.t, k = Math.max(0, Math.min(1, t / PIN));
        var total = (f.spec.line || '').length, n = Math.max(0, Math.floor((t - PIN) * CPS));
        return { id: f.id, seed: f.spec.seed, name: f.spec.name, t: t, alpha: k * k * (3 - 2 * k), chars: Math.min(n, total), total: total, complete: n >= total };
      },
      rects: function (camX, camY) { return folk.map(function (f) { var r = f.npc.rect(f.x - (+camX || 0), f.y - (+camY || 0), { dir: f.dir, scale: sc }); r.id = f.id; return r; }); },
      state: function () { return folk.map(function (f) { return { id: f.id, name: f.spec.name, role: f.spec.role, seed: f.spec.seed, x: Math.round(f.x * 10) / 10, y: Math.round(f.y * 10) / 10, dir: f.dir, moving: f.moving, mode: f.talk ? (f.talk.res ? 'wait' : 'talk') : f.mode }; }); },
      stats: function () { return { folk: folk.length, steps: stats.steps, blockedTurns: stats.blockedTurns, yields: stats.yields, talks: stats.talks, ended: stats.ended, panels: stats.panels, errors: stats.errors }; }
    };
    return T;
  }

  root.GameDNA_NpcGen = {
    version: VERSION, W: W, H: H, CX: CX, FOOT: FOOT, INK: INK, EYE: EYE, DIRS: DIRS, PARTS: PARTS, BUILDS: BUILDS, ROLES: ROLE_IDS,
    make: make, normalize: normSpec, lookKey: lookKey, distance: distance, lookalike: lookalike, LOOKALIKE: LOOKALIKE, crowd: crowd, create: create, raster: raster, verify: verify, inspect: inspect,
    toCanvas: toCanvas, pose: function (o, stride) { return poseOf(o, stride || 4); }, panel: panel, panelLayout: panelLayout, portrait: portrait, PANEL_H: PH,
    town: town, text: text, textWidth: textW, palette: { skin: SKIN, hair: HAIR, cloth: CLOTH, leather: LEATHER }, ramp: ramp, live: function () { return registry.slice(); }
  };
})(typeof window !== 'undefined' ? window : this);

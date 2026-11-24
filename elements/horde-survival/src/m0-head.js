/* GameDNA horde-survival (A-11) v1.2.0 - horde survival auto-attacker.
 * One plain script, no dependencies, no import/export. One global: GameDNA_HordeSurvival.
 * The hero walks (keys / touch stick); weapons fire by themselves on timers (orbiting blades, nearest-target bolt,
 * area pulse, piercing lance); enemies spawn in rising waves from off-screen and swarm; kills drop XP gems that
 * magnet to the hero; each level opens a pick-1-of-3 upgrade; timer and kill count; a boss at the end; win / lose.
 * Fixed step, seeded, no Math.random: ?t=&freeze=1 stills and ?auto=1 runs are deterministic.
 * Fast with 300-900 enemies: pooled typed arrays, a spatial hash rebuilt each step, cached actor bitmaps.
 * API: module/README.md. ASCII only.
 */
(function (root) {
  'use strict';
  var VERSION = '1.2.0';
  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function ease(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function backOut(u) { u = clamp(u, 0, 1); var c = 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); }
  function mulberry(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hashSeed(s) { s = String(s); var h = 2166136261 >>> 0; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function safe(fn, a, b, c, d, e) { if (typeof fn !== "function") return undefined; try { return fn(a, b, c, d, e); } catch (e) { if (root.console) console.warn('[horde-survival] callback threw:', e && e.message); return undefined; } }
  function copy(o) { var r = {}, k; for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = o[k]; return r; }

  /* ------------------------------------------------------------------ content (plain data) ------------------------------------------------------------------ */
  /* Weapon: {name, icon, kind: 'orbit' | 'nearest' | 'pulse' | 'lance' | 'custom', color, text, levels: [stats per level]} (max level = levels.length).
     custom: fire(api, w, lv) is called every lv.cd ms; api = {hero, rng, nearest(n), enemiesIn(x, y, r, fn), damage(enemyIndex, n, kx, ky), shoot({...}), fx(...)} */
  var WEAPONS = {
    bolt: { name: 'Seeker Bolt', icon: 'bolt', kind: 'nearest', color: '#7fe8ff', text: 'Fires at the nearest foe.',
      levels: [{ cd: 820, n: 1, dmg: 11, speed: 330, pierce: 0, size: 1 }, { cd: 760, n: 2, dmg: 12, speed: 340, pierce: 0, size: 1 }, { cd: 700, n: 2, dmg: 15, speed: 350, pierce: 1, size: 1.1 },
        { cd: 640, n: 3, dmg: 17, speed: 360, pierce: 1, size: 1.15 }, { cd: 560, n: 4, dmg: 20, speed: 380, pierce: 2, size: 1.25 }] },
    blades: { name: 'Orbit Blades', icon: 'blades', kind: 'orbit', color: '#d8e6ff', text: 'Blades circle you and cut foes.',
      levels: [{ n: 2, dmg: 9, r: 46, spin: 3.4, hitCd: 420, size: 1 }, { n: 3, dmg: 10, r: 48, spin: 3.6, hitCd: 400, size: 1 }, { n: 3, dmg: 13, r: 54, spin: 3.8, hitCd: 380, size: 1.1 },
        { n: 4, dmg: 15, r: 58, spin: 4.0, hitCd: 360, size: 1.15 }, { n: 5, dmg: 18, r: 64, spin: 4.3, hitCd: 330, size: 1.25 }] },
    pulse: { name: 'Sun Pulse', icon: 'pulse', kind: 'pulse', color: '#ffd36a', text: 'A burning ring that throws foes back.',
      levels: [{ cd: 2600, r: 80, dmg: 10, knock: 90 }, { cd: 2400, r: 92, dmg: 13, knock: 95 }, { cd: 2200, r: 104, dmg: 16, knock: 100 },
        { cd: 2000, r: 118, dmg: 20, knock: 115 }, { cd: 1700, r: 136, dmg: 26, knock: 130 }] },
    lance: { name: 'Dawn Bow', icon: 'lance', kind: 'lance', color: '#fff0b8', text: 'A shaft of light pierces a line of foes.',
      levels: [{ cd: 1500, n: 1, dmg: 24, speed: 440, pierce: 5, len: 54 }, { cd: 1400, n: 2, dmg: 26, speed: 450, pierce: 6, len: 58 }, { cd: 1300, n: 2, dmg: 32, speed: 460, pierce: 8, len: 62 },
        { cd: 1200, n: 3, dmg: 36, speed: 470, pierce: 9, len: 66 }, { cd: 1050, n: 4, dmg: 44, speed: 480, pierce: 12, len: 72 }] }
  };
  /* Passive upgrade: {name, icon, text, max, stat: 'speed' | 'maxHp' | 'magnet' | 'haste' | 'might' | 'reach' | 'regen', per, weight} or apply(hero, level, api) */
  var UPGRADES = {
    swift: { name: 'Windstep Boots', icon: 'boots', text: '+10% move speed.', max: 5, stat: 'speed', per: 0.10 },
    vigor: { name: 'Hearth Tonic', icon: 'heart', text: '+20 max HP, heals 20.', max: 5, stat: 'maxHp', per: 20 },
    magnet: { name: 'Lodestone', icon: 'magnet', text: '+40% pickup reach.', max: 3, stat: 'magnet', per: 0.40 },
    haste: { name: 'Storm Charm', icon: 'hourglass', text: 'Weapons recharge 8% faster.', max: 5, stat: 'haste', per: 0.08 },
    might: { name: 'Ember Sigil', icon: 'might', text: '+12% damage.', max: 5, stat: 'might', per: 0.12 },
    reach: { name: 'Wide Ring', icon: 'ring', text: '+12% weapon area.', max: 4, stat: 'reach', per: 0.12 },
    renew: { name: 'Mossheart', icon: 'leaf', text: 'Regain 0.5 HP each second.', max: 3, stat: 'regen', per: 0.5 }
  };
  /* Enemy: {name, look, h (drawn height, px), r (body radius), hp, speed (px/s), dmg (contact), xp (gem value), mass,
     move: 'chase' | 'drift' | 'swoop' | 'keep' (keeps range and shoots), hover (lift in own heights), shoot: {range, cd, speed, dmg},
     elite, boss, drop: 'potion', palette (built-in painter colours)} */
  var ENEMIES = {
    slime: { name: 'Bog Slime', look: 'slime', gait: 'hop', h: 22, r: 9, hp: 8, speed: 36, dmg: 6, xp: 1, mass: 1, move: 'chase', palette: { body: '#7cc24a', eye: '#f4ffd0' } },
    imp: { name: 'Ember Imp', look: 'imp', gait: 'fly', h: 26, r: 8, hp: 6, speed: 64, dmg: 5, xp: 1, mass: 0.7, move: 'chase', hover: 0.3, palette: { body: '#c8643a', eye: '#ffd760' } },
    wisp: { name: 'Marsh Wisp', look: 'wisp', gait: 'float', h: 26, r: 8, hp: 10, speed: 46, dmg: 5, xp: 1, mass: 0.5, move: 'drift', hover: 0.5, palette: { body: '#6fe0d8', eye: '#ffffff' } },
    harpy: { name: 'Storm Harpy', look: 'harpy', gait: 'fly', h: 38, r: 11, hp: 16, speed: 70, dmg: 7, xp: 2, mass: 0.9, move: 'swoop', hover: 0.35, palette: { body: '#8f86b8', eye: '#ffe6a0' } },
    cultist: { name: 'Ash Cultist', look: 'cultist', gait: 'glide', h: 38, r: 10, hp: 22, speed: 34, dmg: 7, xp: 3, mass: 1.1, move: 'keep', shoot: { range: 210, cd: 2600, speed: 150, dmg: 6 }, palette: { body: '#8a3a2e', eye: '#ffcf6a' } },
    hierophant: { name: 'Ash Hierophant', look: 'cultist', gait: 'glide', h: 50, r: 13, hp: 150, speed: 40, dmg: 12, xp: 12, mass: 3, move: 'chase', elite: true, drop: 'potion', palette: { body: '#6a2a3e', eye: '#ffcf6a' } },
    golem: { name: 'The Moss Colossus', look: 'golem', gait: 'stomp', h: 98, r: 30, hp: 1300, speed: 34, dmg: 20, xp: 0, mass: 40, move: 'chase', boss: true, slam: { every: 3600, windup: 1100, r: 100, dmg: 24 }, summon: { every: 12000, id: 'slime', n: 8 }, palette: { body: '#8c8a7a', eye: '#6ff5d8' } }
  };
  /* Waves (times in seconds of a run whose boss arrives at params.duration; the built-in table is written for 200 s and scaled).
     segments: {from, to, rate (spawns per second), mix: {enemyId: weight}}; events: {at, kind: 'ring' | 'burst' | 'elite' | 'boss', enemy, n} */
  var WAVES = {
    length: 200,
    segments: [
      { from: 0, to: 25, rate: 1.4, mix: { slime: 1 } },
      { from: 25, to: 55, rate: 2.4, mix: { slime: 3, imp: 2 } },
      { from: 55, to: 85, rate: 3.2, mix: { slime: 2, imp: 2, wisp: 1, harpy: 1 } },
      { from: 85, to: 125, rate: 4.4, mix: { slime: 2, imp: 2, harpy: 2, cultist: 1, wisp: 1 } },
      { from: 125, to: 165, rate: 6.0, mix: { slime: 3, imp: 2, harpy: 2, cultist: 1, wisp: 1 } },
      { from: 165, to: 200, rate: 7.5, mix: { slime: 2, imp: 2, harpy: 3, cultist: 2, wisp: 1 } },
      { from: 200, to: 99999, rate: 1.8, mix: { slime: 2, imp: 1, wisp: 1 } }
    ],
    events: [
      { at: 42, kind: 'ring', enemy: 'slime', n: 26 },
      { at: 70, kind: 'elite', enemy: 'hierophant', n: 1 },
      { at: 98, kind: 'burst', enemy: 'harpy', n: 14 },
      { at: 118, kind: 'elite', enemy: 'hierophant', n: 2 },
      { at: 145, kind: 'ring', enemy: 'imp', n: 40 },
      { at: 158, kind: 'burst', enemy: 'harpy', n: 12 },
      { at: 182, kind: 'ring', enemy: 'cultist', n: 14 },
      { at: 200, kind: 'boss', enemy: 'golem', n: 1 }
    ]
  };
  var DEFAULTS = { dawn: 90, enemyCap: 400, spawnRate: 1, duration: 200, heroSpeed: 100, magnet: 70, startWeapon: 'bolt', choices: 3, numbers: 'on', hpScale: 1, heroHp: 120, shake: 'on', reduced: 'off' };
  function needXp(level) { return Math.round(5 + level * 4.2 + level * level * 0.42); }

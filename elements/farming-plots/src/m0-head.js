/* GameDNA_FarmingPlots (G-04 farming plots, system) - one plain script, no dependencies, one global.
 *
 * A farm loop on a tile grid: till, plant, water, crops grow one step per watered night (in season), harvest, ship in a bin
 * (paid overnight), buy seeds at a stall, seasons wither out-of-season crops, a day clock from 6:00 to midnight with dusk and
 * night, seeded rain. A farmer who walks tile by tile with a 4-frame walk (arm swing), turns before stepping, faces the tile
 * he works and plays a raise / strike tool animation. A bot that plays through the same key path. Crops and tools are data.
 *
 *   var F = GameDNA_FarmingPlots.create({ seed, cols, rows, tile: 16, walkable(cx, cy), field: [[cx, cy], ...],
 *       spots: { bin: [cx, cy], shop: [cx, cy], bed: [cx, cy] }, start: [cx, cy, 'down'], params, onEvent, onEnd });
 *   F.update(16.67); F.key('left' | 'ok' | ...); F.drawSoil(ctx); F.sprites() -> [{y, draw(ctx)}]; F.drawFx(ctx);
 *   F.drawSky(ctx, viewRect); F.drawUI(ctx, {w, h});  (API in module/README.md)
 *
 * Deterministic: every rule and the bot read only the seed and the update() clock (no Math.random, no Date).
 * ASCII only. Works headless (node) for rule checks: drawing needs a document.
 */
(function (root) {
  'use strict';
  var VERSION = '1.2.0';

  /* ---------- small helpers ---------- */
  function num(v, d) { if (v == null || v === '') return d; v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rngOf(seed) {
    var s = (seed >>> 0) || 1;
    var f = function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    f.state = function () { return s; };
    return f;
  }
  function hsh(x, y, s) { var n = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul((s | 0) + 1, 83492791); n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); n ^= n >>> 15; return (n >>> 0) / 4294967296; }
  function warn(where, e) { try { if (typeof console !== 'undefined') console.warn('[farming-plots] ' + where + ': ' + (e && e.message || e)); } catch (x) { } }
  function safe(fn, args, where) { if (typeof fn !== 'function') return undefined; try { return fn.apply(null, args || []); } catch (e) { warn(where, e); return undefined; } }
  function copy(o) { var r = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = o[k]; return r; }
  var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  var DIR_ORDER = ['up', 'right', 'down', 'left'];

  /* ---------- content: seasons, crops, tools (the game may add its own as plain data) ---------- */
  // A season: id, name, colours for the HUD. Days per season come from params.seasonDays.
  var SEASONS = [
    { id: 'spring', name: 'Spring', color: '#e86a9a', icon: 'blossom' },
    { id: 'summer', name: 'Summer', color: '#f0a020', icon: 'sun' },
    { id: 'fall', name: 'Fall', color: '#d8642a', icon: 'leaf' },
    { id: 'winter', name: 'Winter', color: '#6aa8e0', icon: 'flake' }
  ];
  // A crop: name, seasons it grows in, days from seed to ripe (watered nights), stages drawn (>= 3: seed ... ripe),
  // seed price, sell price, regrow (days back to ripe after a harvest; 0 = the plant is used up), yield, look.kind
  // (root | leafy | vine | stalk | gourd | flower) and look colours (leaf ramp dark..light, fruit ramp dark..light).
  var CROPS = {
    turnip: { name: 'Turnip', seasons: ['spring'], days: 2, stages: 4, seed: 10, sell: 32, regrow: 0, yield: 1,
      look: { kind: 'root', leaf: ['#1c4a2e', '#2f7a3a', '#58a444', '#8ccc5c'], fruit: ['#7a3a6a', '#c46aa0', '#f0e6f0', '#ffffff'] } },
    cabbage: { name: 'Cabbage', seasons: ['spring'], days: 3, stages: 4, seed: 24, sell: 72, regrow: 0, yield: 1,
      look: { kind: 'leafy', leaf: ['#1e5030', '#3a8a4a', '#78c070', '#c4ec9c'], fruit: ['#3a8a4a', '#9ad488', '#d8f4b8', '#f4fff0'] } },
    tomato: { name: 'Tomato', seasons: ['summer'], days: 3, stages: 5, seed: 30, sell: 46, regrow: 1, yield: 2,
      look: { kind: 'vine', leaf: ['#1a4428', '#2c6e34', '#4c9a3e', '#7cc256'], fruit: ['#7a1420', '#d03a32', '#ff7a5a', '#ffd0b8'] } },
    corn: { name: 'Corn', seasons: ['summer', 'fall'], days: 3, stages: 5, seed: 36, sell: 104, regrow: 0, yield: 1,
      look: { kind: 'stalk', leaf: ['#2a5226', '#4a8a34', '#7ab84a', '#b4dc78'], fruit: ['#a86a10', '#e8b830', '#ffe070', '#fff6c0'] } },
    pumpkin: { name: 'Pumpkin', seasons: ['fall'], days: 3, stages: 5, seed: 50, sell: 150, regrow: 0, yield: 1,
      look: { kind: 'gourd', leaf: ['#1c4426', '#30703a', '#58a048', '#8ccc64'], fruit: ['#8a3a10', '#e07020', '#ffa040', '#ffd890'] } }
  };
  // A tool: name, action (till | water | plant | harvest), area = cells it works as [forward, side] from the farmer
  // ([1, 0] = the tile he faces; [1, -1] / [1, 1] = left / right of it), ms (raise + strike), icon (hoe | can | seeds |
  // sickle | a function (ctx, x, y, size)), colors (metal, wood, accent), name shown on the hotbar.
  var TOOLS = {
    hoe: { name: 'Hoe', action: 'till', area: [[1, 0]], ms: 300, icon: 'hoe', colors: ['#8a94b4', '#a87240', '#d0d8ec'] },
    can: { name: 'Watering Can', action: 'water', area: [[1, 0]], ms: 300, icon: 'can', colors: ['#3a8a7a', '#5cb8a0', '#a8ecd8'] },
    seeds: { name: 'Seeds', action: 'plant', area: [[1, 0]], ms: 240, icon: 'seeds', colors: ['#c8a060', '#8a6030', '#f0d8a0'] },
    sickle: { name: 'Sickle', action: 'harvest', area: [[1, 0]], ms: 260, icon: 'sickle', colors: ['#c8d0e0', '#7a4a2a', '#ffffff'] }
  };
  var WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  function cropDef(crops, id) {
    var d = crops && crops[id]; if (!d) return null;
    if (!d.__norm) {
      d.name = d.name || id; d.seasons = Array.isArray(d.seasons) && d.seasons.length ? d.seasons : ['spring', 'summer', 'fall'];
      d.days = Math.max(1, Math.round(num(d.days, 3))); d.stages = Math.max(3, Math.round(num(d.stages, 4)));
      d.seed = Math.max(0, Math.round(num(d.seed, 20))); d.sell = Math.max(0, Math.round(num(d.sell, 40)));
      d.regrow = Math.max(0, Math.round(num(d.regrow, 0))); d.yield = Math.max(1, Math.round(num(d.yield, 1)));
      d.look = d.look || {}; d.look.kind = d.look.kind || 'leafy';
      d.look.leaf = d.look.leaf || ['#1e5030', '#3a8a4a', '#78c070', '#c4ec9c']; d.look.fruit = d.look.fruit || ['#7a1420', '#d03a32', '#ff7a5a', '#ffd0b8'];
      try { Object.defineProperty(d, '__norm', { value: true, enumerable: false }); } catch (e) { d.__norm = true; }
    }
    return d;
  }
  function toolDef(tools, id) {
    var d = tools && tools[id]; if (!d) return null;
    if (!d.__norm) {
      d.name = d.name || id; d.action = d.action || 'till'; d.area = Array.isArray(d.area) && d.area.length ? d.area : [[1, 0]];
      d.ms = Math.max(120, num(d.ms, 300)); d.icon = d.icon || ({ till: 'hoe', water: 'can', plant: 'seeds', harvest: 'sickle' }[d.action] || 'hoe');
      d.colors = d.colors || TOOLS[{ till: 'hoe', water: 'can', plant: 'seeds', harvest: 'sickle' }[d.action] || 'hoe'].colors;
      try { Object.defineProperty(d, '__norm', { value: true, enumerable: false }); } catch (e) { d.__norm = true; }
    }
    return d;
  }

  /* ---------- the rules, pure (the module and the checks use the same functions) ---------- */
  var rules = {
    // drawn stage of a crop: 0 = seed ... stages - 1 = ripe; a stage per day share, ripe only when growth >= days
    stageOf: function (crop, def) {
      if (!crop || !def) return 0;
      if (crop.growth >= def.days) return def.stages - 1;
      return Math.min(def.stages - 2, Math.floor(crop.growth * (def.stages - 1) / def.days));
    },
    ripe: function (crop, def) { return !!(crop && def && !crop.dead && crop.growth >= def.days); },
    inSeason: function (def, seasonId) { return !!def && def.seasons.indexOf(seasonId) >= 0; },
    // can a seed planted today ripen before its season (or the year) ends? daysLeft counts today (1 = the last day)
    viable: function (def, seasonId, daysLeft) { return !!def && def.seasons.indexOf(seasonId) >= 0 && def.days <= daysLeft - 1; },
    // dawn: the night's growth. A crop grows one day when its plot was watered yesterday and it is in season today;
    // a crop out of season withers; every plot dries; rain waters every tilled plot for the new day.
    dawn: function (plots, o) {
      var ev = [], crops = o.crops, season = o.season;
      for (var i = 0; i < plots.length; i++) {
        var p = plots[i]; if (!p) continue;
        var c = p.crop, d = c && cropDef(crops, c.id);
        if (c && !c.dead) {
          if (!d || d.seasons.indexOf(season) < 0) { c.dead = true; ev.push({ kind: 'wither', cell: [p.cx, p.cy], crop: c.id }); }
          else if (p.watered && c.growth < d.days) {
            var s0 = rules.stageOf(c, d); c.growth += 1; var s1 = rules.stageOf(c, d);
            ev.push({ kind: 'grow', cell: [p.cx, p.cy], crop: c.id, growth: c.growth, stage: s1, from: s0 });
            if (c.growth >= d.days) ev.push({ kind: 'ripe', cell: [p.cx, p.cy], crop: c.id });
          }
        }
        p.watered = !!(o.rain && p.tilled);
      }
      return ev;
    },
    // would this action change the plot? (the bot and the "thunk" feedback use it)
    useful: function (p, action, o) {
      if (!p) return false;
      var c = p.crop, d = c && cropDef(o.crops, c.id);
      if (action === 'till') return !p.tilled || !!(c && c.dead);
      if (action === 'water') return p.tilled && !p.watered && !!c && !c.dead && !rules.ripe(c, d);
      if (action === 'plant') { var sd = cropDef(o.crops, o.seed); return p.tilled && !c && !!sd && (o.bag.seeds[o.seed] || 0) > 0 && sd.seasons.indexOf(o.season) >= 0; }
      if (action === 'harvest') return !!c && (c.dead || rules.ripe(c, d));
      return false;
    },
    // apply one action to one plot (mutates the plot and the bag); returns an event or null
    apply: function (p, action, o) {
      if (!rules.useful(p, action, o)) return null;
      var c = p.crop, cell = [p.cx, p.cy];
      if (action === 'till') { if (c && c.dead) { p.crop = null; return { kind: 'clear', cell: cell, crop: c.id }; } p.tilled = true; return { kind: 'till', cell: cell }; }
      if (action === 'water') { p.watered = true; return { kind: 'water', cell: cell, crop: c ? c.id : null }; }
      if (action === 'plant') { o.bag.seeds[o.seed] -= 1; p.crop = { id: o.seed, growth: 0, dead: false, day: o.day, harvests: 0 }; return { kind: 'plant', cell: cell, crop: o.seed }; }
      if (action === 'harvest') {
        if (c.dead) { p.crop = null; return { kind: 'clear', cell: cell, crop: c.id }; }
        var d = cropDef(o.crops, c.id), n = d.yield;
        o.bag.crops[c.id] = (o.bag.crops[c.id] || 0) + n;
        if (d.regrow > 0) { c.growth = Math.max(0, d.days - d.regrow); c.harvests += 1; } else p.crop = null;
        return { kind: 'harvest', cell: cell, crop: c.id, n: n };
      }
      return null;
    },
    // cells a tool works when the farmer stands at (cx, cy) facing dir: area [forward, side]; side +1 = the farmer's right
    cellsFor: function (tool, cx, cy, dir) {
      var f = DIRS[dir] || DIRS.down, r = [-f[1], f[0]], out = [];
      (tool.area || [[1, 0]]).forEach(function (a) { var fw = num(a[0], 1), sd = num(a[1], 0); out.push([cx + f[0] * fw + r[0] * sd, cy + f[1] * fw + r[1] * sd]); });
      return out;
    },
    // buying never takes gold below 0
    buy: function (state, cropId, n, crops) {
      var d = cropDef(crops, cropId); n = Math.max(0, n | 0); if (!d || !n) return 0;
      var can = d.seed > 0 ? Math.min(n, Math.floor(state.gold / d.seed)) : n; if (can <= 0) return 0;
      state.gold -= can * d.seed; state.bag.seeds[cropId] = (state.bag.seeds[cropId] || 0) + can; return can;
    },
    // the night's sale of what was put in the bin
    sell: function (state, crops) {
      var total = 0, lines = [];
      for (var id in state.bin) { var n = state.bin[id] | 0, d = cropDef(crops, id); if (n <= 0 || !d) continue; var v = n * d.sell; total += v; lines.push({ crop: id, n: n, gold: v }); }
      state.bin = {}; state.gold += total; state.earned += total; return { total: total, lines: lines };
    }
  };

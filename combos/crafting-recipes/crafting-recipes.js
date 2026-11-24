/* GameDNA G-06 - Crafting recipes (crafting-recipes) - module v1.3.0 (plain script, no dependencies, one global)
 *
 *   const craft = GameDNA_CraftingRecipes.create({
 *     items:   { herb: { name: 'Meadow Herb' }, gel: { name: 'Slime Gel' }, salve: { name: 'Healing Salve', icon: 'potion' } },
 *     recipes: [{ id: 'salve', out: 'salve', inputs: { herb: 2, gel: 1 }, discover: 'known' }, ...],
 *     inventory: { count: id => bag[id] || 0, take: (id, n) => { bag[id] -= n; }, give: (id, n) => { bag[id] = (bag[id] || 0) + n; } },
 *     view: { x: 0, y: 0, w: 640, h: 360 },        // screen rect in the coordinates draw() gets
 *     avoid: () => [playerRect, benchRect],        // screen rects the window and toasts keep visible when they can
 *     uiRects: () => [hudRect],                    // screen rects never covered (HUD)
 *     onCraft: info => {...}, onUnlock: info => {...}, onFail: info => {...}
 *   });
 *   craft.update(stepMs);  craft.draw(ctx);  craft.open('Workbench');  craft.key(e.code, true) / craft.input('up')
 *
 * A recipe book (a grid of recipe cards: learned ones in colour, unknown ones as dark silhouettes with a hint) and a slot
 * bench (3 slots, an arrow and the result slot with a preview). Pick a learned recipe and craft it, or put ingredients from
 * the pouch onto the bench and try a mix: a mix that matches a recipe nobody taught you discovers it. Crafting takes the
 * ingredients from the game's inventory exactly once, at the end of a short work bar, and gives the result exactly once;
 * a count never goes below 0 (it re-checks every ingredient first). A failed try shakes the bench, says why and costs
 * nothing. New recipes (by holding their ingredients, by crafting another recipe, by experiment or by the game's own
 * unlock) show a toast that slides in at a free spot, stays put and leaves once. The window opens beside the player, never
 * over the HUD; it covers the player only when no placement can avoid it. Crisp bitmap text and shaded pixel icons on native
 * pixel canvases (<= 512 px wide), smooth text and shaded icons on HD canvases; text never under 10 CSS px when the
 * canvas's CSS size is known. Deterministic: no Math.random, no wall clock; draw() never changes game state. ASCII only.
 */
(function (root) {
  'use strict';
  var VERSION = '1.3.0';
  var DEFAULTS = { slots: 3, craftMs: 650, render: 'auto', theme: 'forge', size: 0, minCss: 10, cols: 0, toasts: 'on', toastMs: 2600,
    unknown: 'mystery', hints: 'on', keyHints: 'on', place: 'auto', dim: 0, margin: 0, title: 'Workbench' };
  var FAMILY = '"Inter", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
  var OPEN_MS = 200, CLOSE_MS = 150, SHAKE_MS = 360, MSG_MS = 2300, POP_MS = 520, T_IN = 260, T_OUT = 320, T_GAP = 140, XFADE = 160;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(u) { u = clamp(u, 0, 1); return 1 - (1 - u) * (1 - u) * (1 - u); }
  function sm(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function sqr(v) { return v * v; }
  function hit(a, b, pad) { pad = pad || 0; return !!a && !!b && a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad; }
  function area(a, b) { if (!a || !b) return 0; var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? w * h : 0; }
  function inside(p, r) { return !!r && p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h; }
  function rectOf(r) {
    if (!r) return null;
    var x = +(r.x != null ? r.x : r[0]), y = +(r.y != null ? r.y : r[1]), w = +(r.w != null ? r.w : r.width != null ? r.width : r[2]), h = +(r.h != null ? r.h : r.height != null ? r.height : r[3]);
    return isFinite(x) && isFinite(y) && w > 0 && h > 0 ? { x: x, y: y, w: w, h: h } : null;
  }
  function hex(c) { c = String(c || '#ffffff'); if (c.charAt(0) === '#' && c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]; var n = parseInt(c.slice(1, 7), 16); return isNaN(n) ? [255, 255, 255] : [n >> 16, (n >> 8) & 255, n & 255]; }
  function mixA(a, b, t) { return [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t))]; }
  function rgba(h, a) { var c = hex(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mixS(a, b, t) { var c = mixA(hex(a), hex(b), t); return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
  function hstr(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function h01(a, b) { var n = Math.imul((a | 0) + 1, 73856093) ^ Math.imul((b | 0) + 7, 19349663); n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); n ^= n >>> 15; return (n >>> 0) / 4294967296; }
  function mk(w, h) { try { if (typeof document === 'undefined') return null; var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; } catch (e) { return null; } }

  /* ---------- icons: shapes in a unit square (y down), shaded per pixel: 4 hard tones + 1 px outline on pixel canvases,
     smooth dome light + soft outline on HD. Layer {c: colour, f(x, y) -> inside?, flat: no dome, tint: takes item.color} ---------- */
  function inEll(x, y, cx, cy, rx, ry) { return sqr((x - cx) / rx) + sqr((y - cy) / ry) <= 1; }
  function inRot(x, y, cx, cy, rx, ry, a) { var c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy; return sqr((dx * c + dy * s) / rx) + sqr((-dx * s + dy * c) / ry) <= 1; }
  function segD(x, y, ax, ay, bx, by) { var dx = bx - ax, dy = by - ay, t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1); return Math.hypot(x - ax - dx * t, y - ay - dy * t); }
  function inPoly(x, y, p) { var c = false; for (var i = 0, j = p.length - 1; i < p.length; j = i++) { if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; } return c; }
  function box(x, y, x0, y0, x1, y1) { return x >= x0 && x <= x1 && y >= y0 && y <= y1; }
  var GOLD = '#f2c23a', STEEL = '#b9c4d2', IRON = '#8e98a8', WOOD = '#9a6334', DARKW = '#6d3f22', PAPER = '#ead9ae', GLASS = '#d9e6f0', LEAF = '#5fb04a';
  function bottle(liquid) {
    return [{ c: GLASS, f: function (x, y) { return inEll(x, y, 0.5, 0.64, 0.33, 0.31) || box(x, y, 0.39, 0.18, 0.61, 0.42); } },
      { c: liquid, tint: 1, f: function (x, y) { return inEll(x, y, 0.5, 0.66, 0.27, 0.25) && y > 0.52; } },
      { c: WOOD, f: function (x, y) { return box(x, y, 0.35, 0.06, 0.65, 0.21); } },
      { c: '#ffffff', flat: 1, f: function (x, y) { return inEll(x, y, 0.37, 0.58, 0.05, 0.09); } }];
  }
  var ICONS = {
    herb: [{ c: '#3f7f34', f: function (x, y) { return segD(x, y, 0.5, 0.94, 0.5, 0.42) < 0.04 || segD(x, y, 0.5, 0.7, 0.3, 0.52) < 0.03 || segD(x, y, 0.5, 0.62, 0.72, 0.44) < 0.03; } },
      { c: LEAF, tint: 1, f: function (x, y) { return inRot(x, y, 0.5, 0.27, 0.13, 0.25, 0) || inRot(x, y, 0.25, 0.44, 0.1, 0.2, 0.9) || inRot(x, y, 0.76, 0.37, 0.1, 0.2, -0.9); } },
      { c: '#9fe07a', flat: 1, f: function (x, y) { return segD(x, y, 0.5, 0.1, 0.5, 0.42) < 0.018; } }],
    flower: [{ c: '#3f7f34', f: function (x, y) { return segD(x, y, 0.5, 0.95, 0.5, 0.5) < 0.04 || inRot(x, y, 0.64, 0.78, 0.13, 0.06, -0.5); } },
      { c: '#e86aa8', tint: 1, f: function (x, y) { for (var i = 0; i < 5; i++) { var a = i * 1.2566 - 1.57; if (inRot(x, y, 0.5 + Math.cos(a) * 0.17, 0.36 + Math.sin(a) * 0.17, 0.15, 0.1, a)) return true; } return false; } },
      { c: '#ffd75a', f: function (x, y) { return inEll(x, y, 0.5, 0.36, 0.09, 0.09); } }],
    mushroom: [{ c: '#eadcc4', f: function (x, y) { return box(x, y, 0.4, 0.45, 0.6, 0.9) || inEll(x, y, 0.5, 0.9, 0.16, 0.05); } },
      { c: '#d0483a', tint: 1, f: function (x, y) { return inEll(x, y, 0.5, 0.48, 0.42, 0.34) && y < 0.5; } },
      { c: '#fff4e0', flat: 1, f: function (x, y) { return inEll(x, y, 0.36, 0.32, 0.06, 0.05) || inEll(x, y, 0.6, 0.24, 0.07, 0.05) || inEll(x, y, 0.7, 0.4, 0.05, 0.04); } }],
    wood: [{ c: WOOD, tint: 1, f: function (x, y) { return inPoly(x, y, [[0.14, 0.42], [0.66, 0.2], [0.86, 0.5], [0.34, 0.78]]) || inRot(x, y, 0.24, 0.6, 0.13, 0.19, -0.4); } },
      { c: '#d9a868', flat: 1, f: function (x, y) { return inRot(x, y, 0.76, 0.35, 0.11, 0.16, -0.4); } },
      { c: '#a87240', flat: 1, f: function (x, y) { return inRot(x, y, 0.76, 0.35, 0.05, 0.08, -0.4); } }],
    stone: [{ c: '#9a96a2', tint: 1, f: function (x, y) { return inPoly(x, y, [[0.2, 0.42], [0.42, 0.2], [0.7, 0.24], [0.88, 0.5], [0.8, 0.8], [0.44, 0.88], [0.14, 0.72]]); } }],
    ore: [{ c: '#8a6a56', f: function (x, y) { return inPoly(x, y, [[0.16, 0.46], [0.4, 0.2], [0.72, 0.22], [0.9, 0.52], [0.78, 0.84], [0.4, 0.88], [0.12, 0.72]]); } },
      { c: '#d8e2ee', tint: 1, flat: 1, f: function (x, y) { return inPoly(x, y, [[0.36, 0.4], [0.46, 0.34], [0.5, 0.46], [0.4, 0.5]]) || inPoly(x, y, [[0.6, 0.58], [0.72, 0.52], [0.74, 0.66], [0.62, 0.68]]) || inEll(x, y, 0.36, 0.7, 0.05, 0.04); } }],
    coal: [{ c: '#55505e', f: function (x, y) { return inPoly(x, y, [[0.1, 0.62], [0.3, 0.42], [0.52, 0.5], [0.58, 0.86], [0.2, 0.86]]) || inPoly(x, y, [[0.46, 0.38], [0.68, 0.18], [0.9, 0.4], [0.86, 0.74], [0.6, 0.7]]); } },
      { c: '#8a8698', flat: 1, f: function (x, y) { return segD(x, y, 0.66, 0.26, 0.8, 0.38) < 0.02 || segD(x, y, 0.26, 0.52, 0.36, 0.48) < 0.02; } }],
    ingot: [{ c: IRON, tint: 1, f: function (x, y) { return inPoly(x, y, [[0.08, 0.66], [0.3, 0.42], [0.92, 0.42], [0.92, 0.6], [0.7, 0.84], [0.08, 0.84]]); } },
      { c: '#d6dde8', flat: 1, f: function (x, y) { return inPoly(x, y, [[0.1, 0.64], [0.31, 0.44], [0.9, 0.44], [0.69, 0.64]]); } }],
    gem: [{ c: '#e0384a', tint: 1, f: function (x, y) { return inPoly(x, y, [[0.3, 0.14], [0.7, 0.14], [0.92, 0.38], [0.5, 0.9], [0.08, 0.38]]); } },
      { c: '#ff9a9a', flat: 1, f: function (x, y) { return inPoly(x, y, [[0.34, 0.2], [0.66, 0.2], [0.8, 0.38], [0.2, 0.38]]); } }],
    crystal: [{ c: '#5fe3f2', tint: 1, f: function (x, y) { return inPoly(x, y, [[0.5, 0.04], [0.68, 0.36], [0.62, 0.92], [0.38, 0.92], [0.32, 0.36]]) || inPoly(x, y, [[0.2, 0.42], [0.36, 0.6], [0.34, 0.92], [0.14, 0.86]]) || inPoly(x, y, [[0.82, 0.38], [0.88, 0.86], [0.66, 0.92], [0.66, 0.58]]); } },
      { c: '#d8fdff', flat: 1, f: function (x, y) { return inPoly(x, y, [[0.5, 0.1], [0.56, 0.36], [0.5, 0.7], [0.44, 0.36]]); } }],
    gel: [{ c: '#6fd06a', tint: 1, f: function (x, y) { return inEll(x, y, 0.5, 0.66, 0.36, 0.26) || inPoly(x, y, [[0.5, 0.12], [0.76, 0.5], [0.24, 0.5]]) && !(y > 0.88); } },
      { c: '#ffffff', flat: 1, f: function (x, y) { return inEll(x, y, 0.38, 0.52, 0.06, 0.08) || inEll(x, y, 0.47, 0.42, 0.03, 0.04); } }],
    bone: [{ c: '#ece2c8', tint: 1, f: function (x, y) { return segD(x, y, 0.26, 0.74, 0.74, 0.26) < 0.08 || inEll(x, y, 0.2, 0.72, 0.09, 0.09) || inEll(x, y, 0.28, 0.82, 0.09, 0.09) || inEll(x, y, 0.72, 0.18, 0.09, 0.09) || inEll(x, y, 0.82, 0.28, 0.09, 0.09); } }],
    feather: [{ c: '#f2f0ea', tint: 1, f: function (x, y) { return inRot(x, y, 0.56, 0.42, 0.14, 0.38, 0.62) && !(inEll(x, y, 0.36, 0.42, 0.06, 0.04)); } },
      { c: '#8a6a4a', flat: 1, f: function (x, y) { return segD(x, y, 0.2, 0.92, 0.76, 0.12) < 0.022; } }],
    hide: [{ c: '#b07a4a', tint: 1, f: function (x, y) { return inPoly(x, y, [[0.2, 0.18], [0.36, 0.26], [0.5, 0.16], [0.64, 0.26], [0.8, 0.18], [0.76, 0.46], [0.86, 0.78], [0.62, 0.72], [0.5, 0.88], [0.38, 0.72], [0.14, 0.78], [0.24, 0.46]]); } },
      { c: '#d8a878', flat: 1, f: function (x, y) { return inEll(x, y, 0.5, 0.48, 0.12, 0.16); } }],
    thread: [{ c: WOOD, f: function (x, y) { return inEll(x, y, 0.5, 0.18, 0.3, 0.08) || inEll(x, y, 0.5, 0.86, 0.3, 0.08); } },
      { c: '#5a7ad8', tint: 1, f: function (x, y) { return box(x, y, 0.27, 0.22, 0.73, 0.82); } },
      { c: '#a8c0ff', flat: 1, f: function (x, y) { return box(x, y, 0.27, 0.22, 0.73, 0.82) && (Math.floor(y * 22) % 3 === 0); } }],
    potion: bottle('#e0384a'), tonic: bottle('#3f7ae8'), antidote: bottle('#4cc45a'),
    salve: [{ c: GLASS, f: function (x, y) { return inEll(x, y, 0.5, 0.62, 0.38, 0.3) || box(x, y, 0.16, 0.42, 0.84, 0.66); } },
      { c: '#6cc45a', tint: 1, f: function (x, y) { return (inEll(x, y, 0.5, 0.62, 0.32, 0.25) || box(x, y, 0.22, 0.5, 0.78, 0.64)) && y > 0.5; } },
      { c: WOOD, f: function (x, y) { return inEll(x, y, 0.5, 0.3, 0.38, 0.1) || box(x, y, 0.13, 0.28, 0.87, 0.42); } },
      { c: '#c89a5a', flat: 1, f: function (x, y) { return inEll(x, y, 0.5, 0.29, 0.3, 0.06); } },
      { c: '#ffffff', flat: 1, f: function (x, y) { return inEll(x, y, 0.27, 0.6, 0.04, 0.08); } }],
    bread: [{ c: '#c88a44', tint: 1, f: function (x, y) { return inEll(x, y, 0.5, 0.6, 0.42, 0.3) && y < 0.82; } },
      { c: '#f0c888', flat: 1, f: function (x, y) { return segD(x, y, 0.3, 0.6, 0.38, 0.46) < 0.025 || segD(x, y, 0.48, 0.62, 0.56, 0.44) < 0.025 || segD(x, y, 0.66, 0.6, 0.72, 0.48) < 0.025; } }],
    bomb: [{ c: '#3c3a4c', tint: 1, f: function (x, y) { return inEll(x, y, 0.46, 0.6, 0.32, 0.32); } },
      { c: '#7a7488', f: function (x, y) { return box(x, y, 0.56, 0.22, 0.72, 0.34); } },
      { c: '#c89a5a', flat: 1, f: function (x, y) { return segD(x, y, 0.66, 0.22, 0.78, 0.1) < 0.025; } },
      { c: '#ffd04a', flat: 1, f: function (x, y) { return inPoly(x, y, [[0.82, 0.02], [0.86, 0.1], [0.94, 0.1], [0.88, 0.15], [0.9, 0.22], [0.82, 0.18], [0.75, 0.22], [0.77, 0.14], [0.71, 0.1], [0.79, 0.1]]); } }],
    lantern: [{ c: '#4a4050', f: function (x, y) { var d = Math.hypot(x - 0.5, y - 0.18); return (d < 0.12 && d > 0.07 && y < 0.2) || box(x, y, 0.28, 0.24, 0.72, 0.32) || box(x, y, 0.26, 0.82, 0.74, 0.9) || box(x, y, 0.28, 0.32, 0.34, 0.82) || box(x, y, 0.66, 0.32, 0.72, 0.82); } },
      { c: '#ffc84a', tint: 1, f: function (x, y) { return box(x, y, 0.35, 0.33, 0.65, 0.81); } },
      { c: '#fff6c8', flat: 1, f: function (x, y) { return inEll(x, y, 0.5, 0.6, 0.06, 0.12); } }],
    torch: [{ c: DARKW, f: function (x, y) { return segD(x, y, 0.38, 0.92, 0.56, 0.42) < 0.06; } },
      { c: '#7a5a3a', f: function (x, y) { return inRot(x, y, 0.56, 0.42, 0.11, 0.07, -1.2); } },
      { c: '#ff8a2a', tint: 1, flat: 1, f: function (x, y) { return inEll(x, y, 0.58, 0.28, 0.14, 0.18) || inPoly(x, y, [[0.5, 0.2], [0.62, 0.02], [0.7, 0.24]]); } },
      { c: '#ffe27a', flat: 1, f: function (x, y) { return inEll(x, y, 0.58, 0.32, 0.07, 0.1); } }],
    rope: [{ c: '#c49a5a', tint: 1, f: function (x, y) { var d = Math.hypot((x - 0.5) / 1.1, y - 0.54); return (d < 0.36 && d > 0.24) || (d < 0.17 && d > 0.08); } },
      { c: '#8a6434', flat: 1, f: function (x, y) { var d = Math.hypot((x - 0.5) / 1.1, y - 0.54); return d < 0.36 && d > 0.24 && Math.floor((Math.atan2(y - 0.54, x - 0.5) + 4) * 4) % 2 === 0; } }],
    arrow: [{ c: WOOD, f: function (x, y) { return segD(x, y, 0.16, 0.84, 0.74, 0.26) < 0.035; } },
      { c: STEEL, tint: 1, f: function (x, y) { return inPoly(x, y, [[0.9, 0.1], [0.82, 0.36], [0.64, 0.18]]); } },
      { c: '#e04848', flat: 1, f: function (x, y) { return inPoly(x, y, [[0.1, 0.78], [0.22, 0.66], [0.3, 0.74], [0.18, 0.86]]) || inPoly(x, y, [[0.22, 0.9], [0.34, 0.78], [0.26, 0.7], [0.14, 0.82]]); } }],
    sword: [{ c: STEEL, tint: 1, f: function (x, y) { return segD(x, y, 0.36, 0.64, 0.86, 0.14) < 0.075 || inPoly(x, y, [[0.8, 0.1], [0.94, 0.06], [0.9, 0.2]]); } },
      { c: GOLD, f: function (x, y) { return segD(x, y, 0.2, 0.52, 0.48, 0.8) < 0.065; } },
      { c: DARKW, f: function (x, y) { return segD(x, y, 0.13, 0.87, 0.32, 0.68) < 0.055; } },
      { c: GOLD, f: function (x, y) { return inEll(x, y, 0.11, 0.89, 0.075, 0.075); } }],
    axe: [{ c: WOOD, f: function (x, y) { return segD(x, y, 0.22, 0.9, 0.62, 0.18) < 0.05; } },
      { c: STEEL, tint: 1, f: function (x, y) { return inPoly(x, y, [[0.5, 0.2], [0.72, 0.08], [0.92, 0.24], [0.88, 0.52], [0.66, 0.44]]); } }],
    pick: [{ c: WOOD, f: function (x, y) { return segD(x, y, 0.24, 0.9, 0.62, 0.28) < 0.05; } },
      { c: STEEL, tint: 1, f: function (x, y) { var d = Math.hypot(x - 0.6, y - 0.5); return d < 0.42 && d > 0.32 && y < 0.36; } }],
    hammer: [{ c: WOOD, f: function (x, y) { return segD(x, y, 0.22, 0.9, 0.58, 0.36) < 0.05; } },
      { c: IRON, tint: 1, f: function (x, y) { return inPoly(x, y, [[0.36, 0.3], [0.62, 0.08], [0.86, 0.36], [0.62, 0.56]]); } }],
    shield: [{ c: STEEL, f: function (x, y) { if (y < 0.08 || y > 0.95) return false; var hw = y < 0.5 ? 0.4 : 0.4 * Math.sqrt(Math.max(0, 1 - sqr((y - 0.5) / 0.46))); return Math.abs(x - 0.5) <= hw; } },
      { c: '#3d63b8', tint: 1, f: function (x, y) { if (y < 0.16 || y > 0.86) return false; var hw = y < 0.5 ? 0.31 : 0.31 * Math.sqrt(Math.max(0, 1 - sqr((y - 0.5) / 0.37))); return Math.abs(x - 0.5) <= hw; } },
      { c: GOLD, f: function (x, y) { return inEll(x, y, 0.5, 0.46, 0.1, 0.1); } }],
    helmet: [{ c: STEEL, tint: 1, f: function (x, y) { return (inEll(x, y, 0.5, 0.56, 0.36, 0.42) && y < 0.86) && !box(x, y, 0.3, 0.5, 0.7, 0.62); } },
      { c: '#d04848', f: function (x, y) { return inEll(x, y, 0.5, 0.12, 0.08, 0.1); } }],
    boots: [{ c: '#8a5a32', tint: 1, f: function (x, y) { return box(x, y, 0.22, 0.12, 0.5, 0.74) || inPoly(x, y, [[0.22, 0.6], [0.78, 0.66], [0.84, 0.9], [0.22, 0.9]]); } },
      { c: '#e8dcc0', flat: 1, f: function (x, y) { return box(x, y, 0.2, 0.1, 0.52, 0.2); } }],
    ring: [{ c: GOLD, f: function (x, y) { return inEll(x, y, 0.5, 0.64, 0.36, 0.27) && !inEll(x, y, 0.5, 0.66, 0.22, 0.14); } },
      { c: GOLD, f: function (x, y) { return inEll(x, y, 0.5, 0.36, 0.2, 0.15); } },
      { c: '#39c46a', tint: 1, f: function (x, y) { return inEll(x, y, 0.5, 0.33, 0.13, 0.11); } }],
    amulet: [{ c: STEEL, f: function (x, y) { var d = Math.hypot(x - 0.5, y - 0.4); return y < 0.56 && d < 0.36 && d > 0.29; } },
      { c: '#d6dbe4', f: function (x, y) { return inEll(x, y, 0.5, 0.7, 0.22, 0.22); } },
      { c: '#4fa8ff', tint: 1, f: function (x, y) { return inEll(x, y, 0.5, 0.7, 0.11, 0.11); } }],
    key: [{ c: GOLD, tint: 1, f: function (x, y) { var d = Math.hypot(x - 0.3, y - 0.3); return (d < 0.22 && d > 0.1) || segD(x, y, 0.42, 0.42, 0.84, 0.84) < 0.065 || segD(x, y, 0.7, 0.7, 0.58, 0.82) < 0.06 || segD(x, y, 0.82, 0.82, 0.7, 0.94) < 0.06; } }],
    scroll: [{ c: PAPER, tint: 1, f: function (x, y) { return box(x, y, 0.22, 0.22, 0.78, 0.8); } },
      { c: '#d4bd85', f: function (x, y) { return inEll(x, y, 0.5, 0.21, 0.36, 0.09) || inEll(x, y, 0.5, 0.81, 0.36, 0.09); } },
      { c: '#c8323c', flat: 1, f: function (x, y) { return box(x, y, 0.2, 0.47, 0.8, 0.57); } }],
    coins: [{ c: GOLD, f: function (x, y) { return inEll(x, y, 0.36, 0.78, 0.3, 0.13) || inEll(x, y, 0.38, 0.66, 0.3, 0.13) || inEll(x, y, 0.36, 0.54, 0.3, 0.13); } },
      { c: '#ffd75a', tint: 1, f: function (x, y) { return inEll(x, y, 0.68, 0.5, 0.25, 0.3); } },
      { c: '#d79a22', flat: 1, f: function (x, y) { return inEll(x, y, 0.68, 0.5, 0.12, 0.15); } }],
    staff: [{ c: WOOD, f: function (x, y) { return segD(x, y, 0.24, 0.94, 0.66, 0.3) < 0.045; } },
      { c: '#9a6aff', tint: 1, f: function (x, y) { return inEll(x, y, 0.72, 0.2, 0.14, 0.14); } },
      { c: '#f0e8ff', flat: 1, f: function (x, y) { return inEll(x, y, 0.68, 0.16, 0.04, 0.04); } }],
    bow: [{ c: WOOD, tint: 1, f: function (x, y) { var d = Math.hypot(x - 0.18, y - 0.5); return d < 0.62 && d > 0.53 && x > 0.3; } },
      { c: '#ece4cc', flat: 1, f: function (x, y) { return Math.abs(x - 0.46) < 0.02 && y > 0.04 && y < 0.96; } }],
    charm: [{ c: '#c49a5a', f: function (x, y) { return segD(x, y, 0.5, 0.06, 0.5, 0.3) < 0.025; } },
      { c: '#e86aa8', tint: 1, f: function (x, y) { return inPoly(x, y, [[0.5, 0.3], [0.8, 0.56], [0.5, 0.94], [0.2, 0.56]]); } },
      { c: '#ffd0e8', flat: 1, f: function (x, y) { return inPoly(x, y, [[0.5, 0.38], [0.64, 0.56], [0.5, 0.64], [0.36, 0.56]]); } }]
  };
  // the icon an item gets when it names none: first keyword match on its id and name
  var GUESS = [[/herb|leaf|moss|weed|sprig|clover|mint|sage/, 'herb'], [/flower|bloom|petal|blossom|rose|lily/, 'flower'], [/mushroom|shroom|cap|fung/, 'mushroom'],
    [/coal|charcoal|soot/, 'coal'], [/ore|nugget/, 'ore'], [/ingot|bar\b|plate|nail/, 'ingot'], [/stone|rock|pebble|flint|brick/, 'stone'], [/wood|log|branch|stick|plank|twig|timber/, 'wood'],
    [/crystal|shard|quartz|prism/, 'crystal'], [/gem|ruby|sapphire|emerald|jewel|diamond/, 'gem'], [/gel|slime|goo|jelly|ooze|sap|resin/, 'gel'], [/bone|skull|fang|tooth|claw/, 'bone'],
    [/feather|plume|quill|wing/, 'feather'], [/hide|leather|pelt|fur|skin/, 'hide'], [/thread|string|cloth|silk|yarn|fabric|wool/, 'thread'], [/antidote|cure/, 'antidote'],
    [/mana|tonic|ether|elixir/, 'tonic'], [/potion|draught|brew|philter/, 'potion'], [/salve|balm|ointment|poultice/, 'salve'], [/bread|loaf|ration|cake|pie|stew|meal|food/, 'bread'],
    [/bomb|powder|blast/, 'bomb'], [/lantern|lamp/, 'lantern'], [/torch|candle/, 'torch'], [/rope|cord/, 'rope'], [/arrow|bolt|dart/, 'arrow'], [/sword|blade|edge|dagger|sabre|knife/, 'sword'],
    [/axe|hatchet/, 'axe'], [/pick/, 'pick'], [/hammer|mallet|maul/, 'hammer'], [/shield|buckler|ward/, 'shield'], [/helm|hat|hood|crown/, 'helmet'], [/boot|shoe|greave/, 'boots'],
    [/ring|band/, 'ring'], [/amulet|pendant|necklace|talisman/, 'amulet'], [/key/, 'key'], [/scroll|map|letter|page|book|note/, 'scroll'], [/coin|gold|money|silver/, 'coins'],
    [/staff|wand|rod/, 'staff'], [/bow/, 'bow'], [/charm|token|trinket|totem/, 'charm']];
  function guessIcon(id, name) { var s = (String(id) + ' ' + String(name || '')).toLowerCase(); for (var i = 0; i < GUESS.length; i++) if (GUESS[i][0].test(s)) return GUESS[i][1]; return 'charm'; }
  var OUTLINE = [30, 20, 38];
  function renderIcon(key, n, pixel, tint) {
    if (typeof document === 'undefined') return null;
    var L = ICONS[key] || ICONS.charm, ss = pixel ? 1 : 2, N = Math.max(4, n * ss), x, y, i, k, TC = tint ? hex(tint) : null;
    var lay = new Int8Array(N * N).fill(-1);
    for (i = 0; i < L.length; i++) for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
      var u = (x + 0.5) / N, v = (y + 0.5) / N; if (pixel) { u = 0.04 + u * 0.92; v = 0.04 + v * 0.92; } else { u = 0.02 + u * 0.96; v = 0.02 + v * 0.96; }
      if (L[i].f(u, v)) lay[y * N + x] = i;
    }
    var D = new Float32Array(N * N), BIG = 1e6, m;
    for (k = 0; k < N * N; k++) D[k] = lay[k] < 0 ? 0 : BIG;
    var same = function (a, b) { return lay[a] === lay[b]; };
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) { k = y * N + x; if (!D[k]) continue;
      m = BIG; if (x > 0) m = Math.min(m, same(k, k - 1) ? D[k - 1] + 1 : 1); else m = 1; if (y > 0) m = Math.min(m, same(k, k - N) ? D[k - N] + 1 : 1); else m = Math.min(m, 1);
      if (x > 0 && y > 0) m = Math.min(m, same(k, k - N - 1) ? D[k - N - 1] + 1.414 : 1.414); D[k] = Math.min(D[k], m); }
    for (y = N - 1; y >= 0; y--) for (x = N - 1; x >= 0; x--) { k = y * N + x; if (!D[k]) continue;
      m = D[k]; if (x < N - 1) m = Math.min(m, same(k, k + 1) ? D[k + 1] + 1 : 1); else m = Math.min(m, 1); if (y < N - 1) m = Math.min(m, same(k, k + N) ? D[k + N] + 1 : 1); else m = Math.min(m, 1);
      if (x < N - 1 && y < N - 1) m = Math.min(m, same(k, k + N + 1) ? D[k + N + 1] + 1.414 : 1.414); D[k] = m; }
    var R = Math.max(1.5, N * (pixel ? 0.2 : 0.16)), H = new Float32Array(N * N);
    for (k = 0; k < N * N; k++) { if (lay[k] < 0) continue; var dd = Math.min(D[k], R) / R; H[k] = L[lay[k]].flat ? 0.6 : Math.sqrt(1 - sqr(1 - dd)); }
    var cv = mk(N, N); if (!cv) return null;
    var g = cv.getContext('2d'), img = g.createImageData(N, N), P = img.data;
    var lx = -0.55, ly = -0.62, lz = 0.56, ln = Math.hypot(lx, ly, lz); lx /= ln; ly /= ln; lz /= ln;
    var DARK = [40, 22, 52], LIGHT = [255, 248, 222];
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
      k = y * N + x; var li = lay[k]; if (li < 0) continue;
      var base = L[li].tint && TC ? TC : hex(L[li].c), h = H[k];
      var hx = (x < N - 1 && lay[k + 1] === li ? H[k + 1] : 0) - (x > 0 && lay[k - 1] === li ? H[k - 1] : 0);
      var hy = (y < N - 1 && lay[k + N] === li ? H[k + N] : 0) - (y > 0 && lay[k - N] === li ? H[k - N] : 0);
      var sc = pixel ? 1.6 : 2.4, nx = -hx * sc, ny = -hy * sc, nz = 1, nn = Math.hypot(nx, ny, nz); nx /= nn; ny /= nn; nz /= nn;
      var lam = clamp(nx * lx + ny * ly + nz * lz, 0, 1), col;
      if (L[li].flat) lam = 0.78;
      if (pixel) {
        var tone = lam > 0.93 ? 3 : lam > 0.74 ? 2 : lam > 0.5 ? 1 : 0;
        if (D[k] <= 1 && (y < N - 1 && lay[k + N] !== li) && tone > 0) tone = 0;
        col = tone === 3 ? mixA(base, [255, 255, 255], 0.62) : tone === 2 ? mixA(base, LIGHT, 0.3) : tone === 1 ? base : mixA(base, DARK, 0.42);
      } else {
        col = lam < 0.62 ? mixA(mixA(base, DARK, 0.5), base, lam / 0.62) : mixA(base, LIGHT, (lam - 0.62) / 0.38 * 0.55);
        var spec = Math.pow(Math.max(0, lam), 28); if (!L[li].flat) col = mixA(col, [255, 255, 255], spec * 0.7);
        if (D[k] < 1.2 && li > 0) col = mixA(col, DARK, 0.18);
      }
      P[k * 4] = col[0]; P[k * 4 + 1] = col[1]; P[k * 4 + 2] = col[2]; P[k * 4 + 3] = 255;
    }
    var ow = pixel ? 1 : 2, add = [];
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
      k = y * N + x; if (lay[k] >= 0) continue; var near = false;
      for (var dy = -ow; dy <= ow && !near; dy++) for (var dx = -ow; dx <= ow && !near; dx++) {
        if (pixel && Math.abs(dx) + Math.abs(dy) !== 1) continue; if (!pixel && dx * dx + dy * dy > ow * ow + 0.5) continue;
        var xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < N && yy < N && lay[yy * N + xx] >= 0) near = true; }
      if (near) add.push(k);
    }
    for (i = 0; i < add.length; i++) { k = add[i]; P[k * 4] = OUTLINE[0]; P[k * 4 + 1] = OUTLINE[1]; P[k * 4 + 2] = OUTLINE[2]; P[k * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
    if (ss === 1) return cv;
    var out = mk(n, n), og = out.getContext('2d'); og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high'; og.drawImage(cv, 0, 0, n, n);
    return out;
  }
  function silhouette(src, col) {
    var c = mk(src.width, src.height); if (!c) return null;
    var g = c.getContext('2d'); g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  /* ---------- bitmap fonts for crisp mode ('#' = ink; rows top -> bottom; the C-03 designs shared with H-03) ---------- */
  var REG = {
    '!': '# # # # # . #', '"': '#.# #.#', '#': '.#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.', '%': '##... ##..# ...#. ..#.. .#... #..## ...##',
    '&': '.##.. #..#. #.#.. .#... #.#.# #..#. .##.#', "'": '# #', '(': '..# .#. #.. #.. #.. .#. ..#', ')': '#.. .#. ..# ..# ..# .#. #..',
    '*': '..... ..#.. #.#.# .###. #.#.# ..#..', '+': '..... ..#.. ..#.. ##### ..#.. ..#..', ',': '.. .. .. .. .. ## .# #.', '-': '.... .... .... ####',
    '.': '.. .. .. .. .. ## ##', '/': '....# ...#. ...#. ..#.. .#... .#... #....',
    '0': '.###. #...# #..## #.#.# ##..# #...# .###.', '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.', '2': '.###. #...# ....# ...#. ..#.. .#... #####',
    '3': '####. ....# ....# .###. ....# ....# ####.', '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.', '5': '##### #.... ####. ....# ....# #...# .###.',
    '6': '..##. .#... #.... ####. #...# #...# .###.', '7': '##### ....# ...#. ..#.. .#... .#... .#...', '8': '.###. #...# #...# .###. #...# #...# .###.',
    '9': '.###. #...# #...# .#### ....# ...#. .##..', ':': '.. ## ## .. .. ## ##', ';': '.. ## ## .. .. ## .# #.', '<': '...# ..#. .#.. #... .#.. ..#. ...#',
    '=': '.... .... #### .... ####', '>': '#... .#.. ..#. ...# ..#. .#.. #...', '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
    'A': '.###. #...# #...# ##### #...# #...# #...#', 'B': '####. #...# #...# ####. #...# #...# ####.', 'C': '.###. #...# #.... #.... #.... #...# .###.',
    'D': '###.. #..#. #...# #...# #...# #..#. ###..', 'E': '##### #.... #.... ####. #.... #.... #####', 'F': '##### #.... #.... ####. #.... #.... #....',
    'G': '.###. #...# #.... #.### #...# #...# .####', 'H': '#...# #...# #...# ##### #...# #...# #...#', 'I': '### .#. .#. .#. .#. .#. ###',
    'J': '..### ...#. ...#. ...#. #..#. #..#. .##..', 'K': '#...# #..#. #.#.. ##... #.#.. #..#. #...#', 'L': '#... #... #... #... #... #... ####',
    'M': '#...# ##.## #.#.# #.#.# #...# #...# #...#', 'N': '#...# ##..# #.#.# #..## #...# #...# #...#', 'O': '.###. #...# #...# #...# #...# #...# .###.',
    'P': '####. #...# #...# ####. #.... #.... #....', 'Q': '.###. #...# #...# #...# #.#.# #..#. .##.#', 'R': '####. #...# #...# ####. #.#.. #..#. #...#',
    'S': '.#### #.... #.... .###. ....# ....# ####.', 'T': '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..', 'U': '#...# #...# #...# #...# #...# #...# .###.',
    'V': '#...# #...# #...# #...# #...# .#.#. ..#..', 'W': '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.', 'X': '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
    'Y': '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..', 'Z': '##### ....# ...#. ..#.. .#... #.... #####', '[': '### #.. #.. #.. #.. #.. ###', ']': '### ..# ..# ..# ..# ..# ###',
    'a': '.... .... .##. ...# .### #..# .###', 'b': '#... #... ###. #..# #..# #..# ###.', 'c': '.... .... .### #... #... #... .###', 'd': '...# ...# .### #..# #..# #..# .###',
    'e': '.... .... .##. #..# #### #... .###', 'f': '..## .#.. #### .#.. .#.. .#.. .#..', 'g': '.... .... .### #..# #..# .### ...# ###.', 'h': '#... #... ###. #..# #..# #..# #..#',
    'i': '# . # # # # #', 'j': '..# ... .## ..# ..# ..# ..# ##.', 'k': '#... #... #..# #.#. ##.. #.#. #..#', 'l': '#. #. #. #. #. #. .#',
    'm': '..... ..... ##.#. #.#.# #.#.# #.#.# #.#.#', 'n': '.... .... ###. #..# #..# #..# #..#', 'o': '.... .... .##. #..# #..# #..# .##.',
    'p': '.... .... ###. #..# #..# ###. #... #...', 'q': '.... .... .### #..# #..# .### ...# ...#', 'r': '.... .... #.## ##.. #... #... #...',
    's': '.... .... .### #... .##. ...# ###.', 't': '.#. .#. ### .#. .#. .#. ..#', 'u': '.... .... #..# #..# #..# #..# .###', 'v': '..... ..... #...# #...# .#.#. .#.#. ..#..',
    'w': '..... ..... #...# #...# #.#.# #.#.# .#.#.', 'x': '..... ..... #...# .#.#. ..#.. .#.#. #...#', 'y': '.... .... #..# #..# #..# .### ...# ###.',
    'z': '.... .... #### ...# .##. #... ####', '~': '..... ..... .#... #.#.# ...#.', '|': '# # # # # # # #'
  };
  var SMALL = {
    '!': '# # # . #', '#': '.#.#. ##### .#.#. ##### .#.#.', '%': '#.# ..# .#. #.. #.#', "'": '# #', '(': '.# #. #. #. .#', ')': '#. .# .# .# #.',
    '+': '... .#. ### .#.', ',': '.. .. .. .. .# #.', '-': '... ... ###', '.': '. . . . #', '/': '..# ..# .#. #.. #..', ':': '. # . # .',
    '0': '### #.# #.# #.# ###', '1': '.#. ##. .#. .#. ###', '2': '##. ..# .#. #.. ###', '3': '##. ..# .#. ..# ##.', '4': '#.# #.# ### ..# ..#',
    '5': '### #.. ##. ..# ##.', '6': '.## #.. ### #.# ###', '7': '### ..# .#. .#. .#.', '8': '### #.# ### #.# ###', '9': '### #.# ### ..# ##.',
    '?': '##. ..# .#. ... .#.', '<': '..# .#. #.. .#. ..#', '>': '#.. .#. ..# .#. #..', '=': '... ### ... ###',
    'A': '.##. #..# #### #..# #..#', 'B': '###. #..# ###. #..# ###.', 'C': '.### #... #... #... .###', 'D': '###. #..# #..# #..# ###.',
    'E': '### #.. ##. #.. ###', 'F': '### #.. ##. #.. #..', 'G': '.### #... #.## #..# .###', 'H': '#..# #..# #### #..# #..#', 'I': '### .#. .#. .#. ###',
    'J': '..## ...# ...# #..# .##.', 'K': '#..# #.#. ##.. #.#. #..#', 'L': '#.. #.. #.. #.. ###', 'M': '#...# ##.## #.#.# #...# #...#', 'N': '#..# ##.# #.## #..# #..#',
    'O': '.##. #..# #..# #..# .##.', 'P': '###. #..# ###. #... #...', 'Q': '.##. #..# #..# #.#. .#.#', 'R': '###. #..# ###. #.#. #..#', 'S': '.### #... .##. ...# ###.',
    'T': '### .#. .#. .#. .#.', 'U': '#..# #..# #..# #..# .##.', 'V': '#.# #.# #.# .#. .#.', 'W': '#...# #...# #.#.# #.#.# .#.#.', 'X': '#.# #.# .#. #.# #.#',
    'Y': '#.# #.# .#. .#. .#.', 'Z': '#### ..#. .#.. #... ####',
    'a': '... ##. .## #.# .##', 'b': '#.. ##. #.# #.# ##.', 'c': '... .## #.. #.. .##', 'd': '..# .## #.# #.# .##', 'e': '... .#. ### #.. .##', 'f': '..# .#. ### .#. .#.',
    'g': '... .## #.# .## ..# ##.', 'h': '#.. ##. #.# #.# #.#', 'i': '# . # # #', 'j': '.# .. .# .# .# #.', 'k': '#.. #.# ##. #.# #.#', 'l': '#. #. #. #. .#',
    'm': '..... ##.#. #.#.# #.#.# #.#.#', 'n': '... ##. #.# #.# #.#', 'o': '... .#. #.# #.# .#.', 'p': '... ##. #.# #.# ##. #..', 'q': '... .## #.# #.# .## ..#',
    'r': '... #.# ##. #.. #..', 's': '... .## #.. ..# ##.', 't': '.#. ### .#. .#. ..#', 'u': '... #.# #.# #.# .##', 'v': '... #.# #.# #.# .#.',
    'w': '..... #...# #.#.# #.#.# .#.#.', 'x': '... #.# .#. .#. #.#', 'y': '... #.# #.# .## ..# ##.', 'z': '... ### ..# #.. ###'
  };
  var FSPEC = { reg: { t: REG, h: 8, cap: 7, space: 3, lineH: 10 }, small: { t: SMALL, h: 6, cap: 5, space: 2, lineH: 7 } };
  var FONTS = {};
  function pfont(name) {
    if (FONTS[name]) return FONTS[name];
    var S = FSPEC[name], g = {};
    for (var ch in S.t) { var rows = S.t[ch].split(' '), w = 0; for (var i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length); g[ch] = { rows: rows, w: w }; }
    return (FONTS[name] = { g: g, h: S.h, cap: S.cap, space: S.space, lineH: S.lineH });
  }
  function pw(fn, s) { var F = pfont(fn), w = 0; for (var i = 0; i < s.length; i++) { var c = s.charAt(i); if (c === ' ') { w += F.space + 1; continue; } var g = F.g[c] || F.g['?']; w += g.w + 1; } return Math.max(0, w - 1); }

  var THEMES = {
    forge: { top: '#2c2230', bot: '#1a1320', head: '#3b2c2a', rim: '#0c0810', line: '#c8995a', hi: 'rgba(255,236,200,0.16)', shadow: 'rgba(6,2,10,0.55)',
      text: '#f4ead8', dim: '#ab9c8e', title: '#ffe2a8', accent: '#ffc65a', ok: '#86e58e', bad: '#ff7562', well: '#120d16', wellHi: '#4f3d33', wellLo: '#07050a',
      cell: '#221a26', lock: '#3a2e42', btn: '#c8863a', btnHi: '#ffcf7a', btnLo: '#7a4a1e', btnText: '#2a1608', off: '#5a4c48', dimBg: '#07040c',
      px: { o: '#0c0a14', fill: '#2a1e2e', fill2: '#24192a', lite: '#5a4458', dark: '#140e1a', head: '#3e2c30', well: '#120c18', wellHi: '#46344a', gold: '#ffd070', gold2: '#c8903c' } },
    parchment: { top: '#f3e4c4', bot: '#e0c99a', head: '#c9a46a', rim: '#4a2c14', line: '#8a5a2a', hi: 'rgba(255,255,255,0.5)', shadow: 'rgba(40,22,6,0.4)',
      text: '#3a2412', dim: '#7c5e40', title: '#3a1e08', accent: '#a8540e', ok: '#2f8a3a', bad: '#b8321e', well: '#cdb184', wellHi: '#fff3d4', wellLo: '#8a6a40',
      cell: '#e6d0a4', lock: '#9c8058', btn: '#8a4a1a', btnHi: '#c8803a', btnLo: '#4a2408', btnText: '#fff2d8', off: '#b09a7a', dimBg: '#1a1008',
      px: { o: '#3a2210', fill: '#e8d4a8', fill2: '#dcc494', lite: '#fff4d4', dark: '#a88458', head: '#c8a066', well: '#c4a474', wellHi: '#f4e2b8', gold: '#8a3e0e', gold2: '#c86a20' } }
  };
  var FAIL_TEXT = { missing: 'Need {n} {item}', unknown: 'Not learned yet', nothing: 'Nothing happens', empty: 'Put ingredients first', full: 'No free slot', none: 'None left', busy: 'Still working' };

  function create(options) {
    var o = options || {}, P = {}, warned = {};
    var ST = { updates: 0, draws: 0, opens: 0, closes: 0, starts: 0, crafts: 0, fails: 0, cancels: 0, unlocks: 0, taken: 0, given: 0, refused: 0,
      toasts: 0, toastsDropped: 0, covers: 0, onUI: 0, crossfades: 0, errors: 0, cbErrors: 0, drawErrors: 0, badInput: 0 };
    var ITEMS = {}, ORDER = [], RECIPES = [], RID = {};
    var clock = 0, isOpen = false, openT = -1e9, closeT = -1e9, station = '', known = {}, isNew = {}, crafted = {}, log = [], events = [];
    var sel = 0, focus = 'book', pouchSel = 0, mode = 'recipe', slots = [], work = null, msg = null, shakeT = -1e9, pop = null, hover = null, lastPtr = false;
    var toastQ = [], toast = null, toastSeen = {}, lastToastEnd = -1e9;
    var L = null, prevL = null, placeKey = '', drawnKey = '', drawnList = [], cssCache = 0, mctx = null, iconCache = {}, iconN = 0, TC = {}, TCn = 0, lastCols = 4;
    function warn(k, m) { if (warned[k]) return; warned[k] = 1; if (root.console) console.warn('[GameDNA_CraftingRecipes] ' + m); }
    function call(fn, args, d) { if (typeof fn !== 'function') return d; try { var v = fn.apply(null, args || []); return v === undefined ? d : v; } catch (e) { ST.cbErrors++; warn('cb', 'a game callback threw: ' + (e && e.message)); return d; } }
    function val(v, d) { return typeof v === 'function' ? call(v, [], d) : v == null ? d : v; }
    function ev(type, extra) { var e = { type: type, t: Math.round(clock) }; for (var k in extra) e[k] = extra[k]; events.push(e); if (events.length > 400) events.splice(0, events.length - 300); if (o.debug) call(o.debug, [e]); return e; }
    try { var sc = mk(4, 4); mctx = sc ? sc.getContext('2d') : null; } catch (e) { mctx = null; }

    function setParams(p) {
      p = p || {};
      for (var k in DEFAULTS) {
        var v = p[k] != null && p[k] !== '' ? p[k] : P[k] != null ? P[k] : DEFAULTS[k];
        P[k] = typeof DEFAULTS[k] === 'number' ? num(v, DEFAULTS[k]) : String(v);
      }
      P.slots = clamp(Math.round(P.slots), 1, 6); P.craftMs = clamp(P.craftMs, 0, 10000); P.minCss = clamp(P.minCss, 0, 40);
      if (!THEMES[P.theme]) P.theme = 'forge';
      placeKey = ''; resetSlots();
    }
    function setItems(src) {
      ITEMS = {}; ORDER = [];
      var add = function (id, it) { id = String(id); it = it || {}; if (ITEMS[id]) return; ITEMS[id] = { id: id, name: String(it.name || id), icon: it.icon, color: it.color, draw: it.draw, image: it.image, crop: it.crop, desc: it.desc }; ORDER.push(id); };
      if (Array.isArray(src)) src.forEach(function (it) { if (it && it.id != null) add(it.id, it); });
      else if (src) for (var k in src) add(k, src[k]);
    }
    function item(id) { id = String(id); if (!ITEMS[id]) { ITEMS[id] = { id: id, name: id }; ORDER.push(id); } return ITEMS[id]; }
    function normIO(v, n) {
      if (v == null) return null;
      if (typeof v === 'string') return { id: v, n: Math.max(1, Math.floor(num(n, 1))) };
      if (Array.isArray(v)) return { id: String(v[0]), n: Math.max(1, Math.floor(num(v[1], 1))) };
      return v.id != null ? { id: String(v.id), n: Math.max(1, Math.floor(num(v.n != null ? v.n : v.count, 1))) } : null;
    }
    function normDiscover(d) {
      if (d == null || d === 'known' || d === true || d === 'start') return { type: 'known' };
      if (d === 'experiment' || d === 'mix') return { type: 'experiment' };
      if (d === 'manual' || d === 'unlock' || d === 'scroll') return { type: 'manual' };
      if (typeof d === 'string' && d.indexOf('crafted:') === 0) return { type: 'crafted', recipe: d.slice(8) };
      if (typeof d === 'string' && d.indexOf('have:') === 0) return { type: 'have', ids: d.slice(5).split(/[ ,+]+/).filter(Boolean) };
      if (d.have) return { type: 'have', ids: [].concat(d.have).map(String) };
      if (d.crafted) return { type: 'crafted', recipe: String(d.crafted) };
      return { type: 'experiment' };
    }
    function setRecipes(list) {
      RECIPES = []; RID = {};
      (list || []).forEach(function (r) {
        if (!r) return;
        var out = normIO(r.out != null ? r.out : r.result, r.n); if (!out) { ST.badInput++; return; }
        var ins = [], inp = r.inputs || r.ingredients || {};
        if (Array.isArray(inp)) inp.forEach(function (x) { var q = normIO(x); if (q) ins.push(q); });
        else for (var k in inp) ins.push({ id: String(k), n: Math.max(1, Math.floor(num(inp[k], 1))) });
        var merged = {}; ins.forEach(function (q) { merged[q.id] = (merged[q.id] || 0) + q.n; });
        ins = Object.keys(merged).sort().map(function (k) { return { id: k, n: merged[k] }; });
        if (!ins.length) { ST.badInput++; return; }
        var id = String(r.id != null ? r.id : out.id); if (RID[id]) { ST.badInput++; return; }
        item(out.id); ins.forEach(function (q) { item(q.id); });
        var R = { id: id, name: String(r.name || ITEMS[out.id].name), out: out, inputs: ins, discover: normDiscover(r.discover), hint: r.hint ? String(r.hint) : '', ms: r.ms != null ? num(r.ms, P.craftMs) : null, i: RECIPES.length };
        RECIPES.push(R); RID[id] = R;
      });
    }
    function learnStart() { RECIPES.forEach(function (r) { if (r.discover.type === 'known') known[r.id] = { t: 0, why: 'known' }; }); }

    /* ---------- the game's inventory (the only record of counts) ---------- */
    var INV = o.inventory || null, BAG = o.bag || (INV && typeof INV.count !== 'function' && typeof INV === 'object' ? INV : null);
    if (BAG === INV) INV = null;
    function cnt(id) { var v = INV && typeof INV.count === 'function' ? call(INV.count, [id], 0) : BAG ? BAG[id] : 0; v = Math.floor(+v || 0); return v > 0 ? v : 0; }
    function takeN(id, n) { if (INV && typeof INV.take === 'function') call(INV.take, [id, n]); else if (BAG) BAG[id] = Math.max(0, (Math.floor(+BAG[id] || 0)) - n); ST.taken += n; }
    function giveN(id, n) { if (INV && typeof INV.give === 'function') call(INV.give, [id, n]); else if (BAG) BAG[id] = (Math.floor(+BAG[id] || 0)) + n; ST.given += n; }

    /* ---------- discovery ---------- */
    function learn(r, why, quiet) {
      if (!r || known[r.id]) return false;
      known[r.id] = { t: Math.round(clock), why: why }; isNew[r.id] = 1; log.push({ id: r.id, t: Math.round(clock), why: why }); ST.unlocks++;
      ev('unlock', { recipe: r.id, why: why });
      call(o.onUnlock, [{ recipe: r.id, name: r.name, out: r.out.id, why: why }]);
      if (!quiet && P.toasts !== 'off') queueToast({ kind: why === 'experiment' ? 'discovered' : 'unlock', rid: r.id, id: r.out.id, text: r.name });
      return true;
    }
    function checkDiscovery() {
      for (var i = 0; i < RECIPES.length; i++) {
        var r = RECIPES[i]; if (known[r.id] || r.discover.type !== 'have') continue;
        var ok = r.discover.ids.length > 0; for (var j = 0; j < r.discover.ids.length && ok; j++) if (cnt(r.discover.ids[j]) <= 0) ok = false;
        if (ok) learn(r, 'have');
      }
    }

    /* ---------- the bench ---------- */
    function resetSlots() { slots = []; for (var i = 0; i < Math.max(P.slots || 3, 1); i++) slots.push(null); }
    function slotCount() { var n = P.slots; if (mode === 'recipe') { var r = RECIPES[sel]; if (r) n = Math.max(n, r.inputs.length); } return n; }
    function benchRecipe() { var r = RECIPES[sel]; resetSlots(); if (!r) return; for (var i = 0; i < r.inputs.length; i++) slots[i] = { id: r.inputs[i].id, n: r.inputs[i].n }; }
    function reserved(id) { if (mode !== 'hand') return 0; var s = 0; for (var i = 0; i < slots.length; i++) if (slots[i] && slots[i].id === id) s += slots[i].n; return s; }
    function benchEmpty() { for (var i = 0; i < slots.length; i++) if (slots[i]) return false; return true; }
    function benchMatch() {
      var m = {}, keys = [], i;
      for (i = 0; i < slots.length; i++) if (slots[i]) m[slots[i].id] = (m[slots[i].id] || 0) + slots[i].n;
      keys = Object.keys(m).sort();
      for (i = 0; i < RECIPES.length; i++) {
        var r = RECIPES[i]; if (r.inputs.length !== keys.length) continue;
        var same = true; for (var j = 0; j < keys.length && same; j++) if (r.inputs[j].id !== keys[j] || r.inputs[j].n !== m[keys[j]]) same = false;
        if (same) return r;
      }
      return null;
    }
    function pouchList() { var used = {}; RECIPES.forEach(function (r) { r.inputs.forEach(function (q) { used[q.id] = 1; }); }); return ORDER.filter(function (id) { return used[id] && (cnt(id) > 0 || reserved(id) > 0); }); }
    function put(id) {
      if (work) return fail('busy');
      id = String(id);
      if (mode !== 'hand') { mode = 'hand'; resetSlots(); }
      if (cnt(id) - reserved(id) <= 0) return fail('none', { id: id });
      var i, empty = -1;
      for (i = 0; i < slots.length; i++) { if (slots[i] && slots[i].id === id) { slots[i].n++; ev('put', { id: id }); return true; } if (!slots[i] && empty < 0) empty = i; }
      if (empty < 0) return fail('full');
      slots[empty] = { id: id, n: 1 }; ev('put', { id: id }); return true;
    }
    function takeBack() {
      if (work || mode !== 'hand') return false;
      for (var i = slots.length - 1; i >= 0; i--) if (slots[i]) { var id = slots[i].id; if (--slots[i].n <= 0) slots[i] = null; ev('remove', { id: id }); return true; }
      return false;
    }
    function clearBench() { if (work) return false; mode = 'hand'; resetSlots(); ev('clear'); return true; }
    function select(i) {
      if (typeof i === 'string') i = RID[i] ? RID[i].i : -1;
      if (!(i >= 0 && i < RECIPES.length) || work) return false;
      var was = sel; sel = i; mode = 'recipe'; benchRecipe(); delete isNew[RECIPES[i].id];
      if (was !== i) ev('select', { recipe: RECIPES[i].id });
      return true;
    }
    function fail(reason, info) {
      info = info || {};
      var text = FAIL_TEXT[reason] || 'Cannot craft', it = info.id ? item(info.id) : null;
      text = text.replace('{n}', info.n || 1).replace('{item}', it ? it.name : '');
      msg = { kind: 'bad', text: text, t: clock }; shakeT = clock; ST.fails++;
      ev('fail', { reason: reason, id: info.id || null, recipe: info.recipe || null });
      call(o.onFail, [{ reason: reason, text: text, id: info.id || null, recipe: info.recipe || null }]);
      return false;
    }
    function startCraft() {
      if (work) return fail('busy');
      var r, disc = false;
      if (mode === 'recipe') { r = RECIPES[sel]; if (!r) return fail('nothing'); if (!known[r.id]) return fail('unknown', { recipe: r.id }); }
      else {
        if (benchEmpty()) return fail('empty');
        r = benchMatch();
        if (!r || (!known[r.id] && r.discover.type === 'manual')) return fail('nothing');
        disc = !known[r.id];
      }
      for (var i = 0; i < r.inputs.length; i++) { var q = r.inputs[i], h = cnt(q.id); if (h < q.n) return fail('missing', { id: q.id, n: q.n - h, recipe: r.id }); }
      work = { rid: r.id, t: 0, dur: r.ms != null ? r.ms : P.craftMs, disc: disc, from: mode, slots: slots.map(function (s) { return s ? { id: s.id, n: s.n } : null; }) };
      ST.starts++; ev('start', { recipe: r.id });
      if (work.dur <= 0) finish();
      return true;
    }
    function finish() {
      var w = work; work = null; if (!w) return false;
      var r = RID[w.rid], i;
      for (i = 0; i < r.inputs.length; i++) { var h = cnt(r.inputs[i].id); if (h < r.inputs[i].n) { ST.refused++; return fail('missing', { id: r.inputs[i].id, n: r.inputs[i].n - h, recipe: r.id }); } }
      var before = {}; for (i = 0; i < r.inputs.length; i++) before[r.inputs[i].id] = cnt(r.inputs[i].id);
      for (i = 0; i < r.inputs.length; i++) takeN(r.inputs[i].id, r.inputs[i].n);
      giveN(r.out.id, r.out.n);
      crafted[r.id] = (crafted[r.id] || 0) + 1; ST.crafts++;
      var took = r.inputs.map(function (q) { return { id: q.id, n: q.n, before: before[q.id] }; });
      ev('craft', { recipe: r.id, out: r.out.id, n: r.out.n, took: took });
      msg = { kind: 'ok', text: '+' + r.out.n + ' ' + item(r.out.id).name, t: clock }; pop = { t: clock, rid: r.id, id: r.out.id };
      if (w.disc) learn(r, 'experiment');
      call(o.onCraft, [{ recipe: r.id, name: r.name, out: r.out.id, n: r.out.n, inputs: r.inputs.map(function (q) { return { id: q.id, n: q.n }; }), discovered: !!w.disc }]);
      RECIPES.forEach(function (x) { if (!known[x.id] && x.discover.type === 'crafted' && x.discover.recipe === r.id) learn(x, 'crafted'); });
      if (w.from === 'hand') { var stay = true; for (i = 0; i < slots.length; i++) if (slots[i] && cnt(slots[i].id) < slots[i].n) stay = false; if (!stay || w.disc) { sel = r.i; mode = 'recipe'; benchRecipe(); focus = 'book'; } }
      if (!isOpen && P.toasts !== 'off') queueToast({ kind: 'crafted', rid: r.id, id: r.out.id, text: '+' + r.out.n + ' ' + item(r.out.id).name });
      return true;
    }
    function cancelWork() { if (!work) return false; work = null; ST.cancels++; msg = { kind: 'info', text: 'Stopped', t: clock }; ev('cancel'); return true; }

    /* ---------- open / close ---------- */
    function open(name) {
      if (isOpen) return false;
      isOpen = true; openT = clock; station = name != null ? String(name) : P.title; focus = 'book'; hover = null; placeKey = ''; prevL = null; L = null;
      if (!(sel >= 0 && sel < RECIPES.length)) sel = 0;
      if (mode !== 'hand' || benchEmpty()) { mode = 'recipe'; benchRecipe(); }
      ST.opens++; ev('open', { station: station }); call(o.onOpen, [{ station: station }]);
      return true;
    }
    function close() {
      if (!isOpen) return false;
      if (work) cancelWork();
      isOpen = false; closeT = clock; if (toast && toast.spot && toast.spot.over && toast.yieldT == null) toast.yieldT = clock;
      if (mode === 'hand') { mode = 'recipe'; benchRecipe(); }
      ST.closes++; ev('close'); call(o.onClose, [{ station: station }]);
      return true;
    }

    /* ---------- toasts: one at a time, a fixed spot chosen when it starts, shown once ---------- */
    function queueToast(t) { var key = t.kind === 'crafted' ? 'crafted:' + t.rid + ':' + ST.crafts : 'learn:' + t.rid; if (toastSeen[key]) return; toastSeen[key] = 1; t.key = key; toastQ.push(t); if (toastQ.length > 12) { toastQ.shift(); ST.toastsDropped++; } }
    function toastDur() { return T_IN + Math.max(900, P.toastMs) + T_OUT; }
    function stepToasts() {
      if (toast && toast.yieldT == null && !toast.spot.over && isOpen && L && hit(toastRect(L.M), L.rect)) { toast.yieldT = clock; ev('toastYield', { recipe: toast.rid }); }
      if (toast && (clock - toast.t0 >= toastDur() || (toast.yieldT != null && clock - toast.yieldT >= 180))) { lastToastEnd = clock; toast = null; }
      if (!toast && toastQ.length && clock - lastToastEnd >= T_GAP) {
        toast = toastQ.shift(); toast.t0 = clock; toast.spot = pickToastSpot(toast); ST.toasts++; ev('toast', { kind: toast.kind, recipe: toast.rid, spot: toast.spot.name });
      }
    }

    /* ---------- sizes ---------- */
    function V() { var v = rectOf(val(o.view, null)); return v || { x: 0, y: 0, w: 640, h: 360 }; }
    function cssScale() {
      var s = num(val(o.cssScale, null), 0); if (s > 0) return s;
      var cv = o.canvas; try { if (cv && cv.getBoundingClientRect) { var b = cv.getBoundingClientRect(), v = V(), lw = num(o.logicalWidth, v.x === 0 ? v.x + v.w : cv.width); if (b.width > 0 && lw > 0) return b.width / lw; } } catch (e) { }
      return cssCache || 1;
    }
    function crisp() { return P.render === 'crisp' || (P.render !== 'smooth' && V().w <= 512); }
    function metrics() {
      var css = cssScale(), minPx = P.minCss > 0 ? P.minCss / css : 0, M;
      if (crisp()) {
        var k = Math.max(1, Math.round(P.size ? P.size / 8 : 1)); while (8 * k < minPx - 0.01 && k < 4) k++;
        var small = 6 * k >= minPx - 0.01 ? 'small' : 'reg';
        M = { cr: true, k: k, css: css, f: { px: 'reg', k: k }, fs: { px: small, k: k }, ft: { px: 'reg', k: k }, fb: { px: 'reg', k: k },
          pad: 5 * k, gap: 3 * k, head: 13 * k, cell: 18 * k, cg: 2 * k, slot: 18 * k, plus: 6 * k, arrow: 9 * k, res: 20 * k, badge: 9 * k, name: 11 * k, btn: 13 * k, msg: 10 * k, pcell: 18 * k, hint: 10 * k, icon: 14 * k, ricon: 16 * k };
      } else {
        var v = V(), F = P.size || clamp(Math.round(v.w / 66), 11, 22);
        F = Math.max(F, Math.ceil(minPx));
        var Fs = Math.max(Math.round(F * 0.82), Math.ceil(minPx));
        M = { cr: false, F: F, css: css, f: { size: F, weight: 560 }, fs: { size: Fs, weight: 650 }, ft: { size: Math.round(F * 1.12), weight: 760 }, fb: { size: F, weight: 760 },
          pad: Math.round(F * 0.85), gap: Math.round(F * 0.5), head: Math.round(F * 2.0), cell: Math.round(F * 2.7), cg: Math.max(2, Math.round(F * 0.28)), slot: Math.round(F * 2.6),
          plus: Math.round(F * 0.95), arrow: Math.round(F * 1.5), res: Math.round(F * 3.0), badge: Math.round(Fs * 1.4), name: Math.round(F * 1.55), btn: Math.round(F * 2.15),
          msg: Math.round(Fs * 1.45), pcell: Math.round(F * 2.5), hint: Math.round(Fs * 1.5) };
        M.icon = Math.round(M.cell * 0.7); M.ricon = Math.round(M.res * 0.72);
      }
      return M;
    }
    function fontStr(f) { return (f.weight || 600) + ' ' + f.size + 'px ' + FAMILY; }
    var SC = {};
    function measure(f, s) {
      s = String(s); if (f.px) return pw(f.px, s) * f.k;
      var key = f.size + '|' + f.weight + '|' + s; if (SC[key] != null) return SC[key];
      var w = s.length * f.size * 0.56; if (mctx) { mctx.font = fontStr(f); w = mctx.measureText(s).width; }
      return (SC[key] = w);
    }
    function textH(f) { return f.px ? pfont(f.px).h * f.k : Math.round(f.size * 1.0); }
    function capH(f) { return f.px ? pfont(f.px).cap * f.k : Math.round(f.size * 0.72); }
    function textPx(f) { return f.px ? pfont(f.px).h * f.k : f.size; }
    function ellip(f, s, maxW) { s = String(s); if (measure(f, s) <= maxW) return s; var d = f.px ? '..' : '...'; while (s.length > 1 && measure(f, s + d) > maxW) s = s.slice(0, -1); return s.replace(/\s+$/, '') + d; }

    /* ---------- layout: two arrangements, the window placed where it covers nothing it should not ---------- */
    function arrange(M, modeName, maxH) {
      var n = RECIPES.length, ns = Math.max(P.slots, RECIPES.reduce(function (m, r) { return Math.max(m, r.inputs.length); }, 0));
      var BW = ns * M.slot + (ns - 1) * M.plus + M.arrow + M.res;
      var benchH = M.name + Math.round(M.gap / 2) + Math.max(M.res, M.slot + M.badge) + M.gap + M.btn + Math.round(M.gap / 2) + M.msg;
      var pouchH = M.pcell, hintH = P.keyHints === 'off' ? 0 : M.hint;
      var C, rows, rowsVis, gridW, innerW, W, H, fixed;
      if (modeName === 'wide') {
        C = P.cols > 0 ? Math.round(P.cols) : n > 12 ? 5 : 4; rows = Math.max(1, Math.ceil(n / C)); gridW = C * M.cell + (C - 1) * M.cg;
        innerW = gridW + M.gap * 2 + BW; W = innerW + M.pad * 2;
        fixed = M.pad + M.head + M.gap + pouchH + hintH + M.pad;
        var bodyMax = Math.max(benchH, (maxH || 1e9) - fixed);
        rowsVis = clamp(Math.floor((bodyMax + M.cg) / (M.cell + M.cg)), 1, rows);
        var body = Math.max(benchH, rowsVis * M.cell + (rowsVis - 1) * M.cg);
        H = fixed + body;
      } else {
        C = Math.max(3, Math.floor((BW + M.cg) / (M.cell + M.cg))); rows = Math.max(1, Math.ceil(n / C)); gridW = C * M.cell + (C - 1) * M.cg;
        innerW = Math.max(gridW, BW); W = innerW + M.pad * 2;
        fixed = M.pad + M.head + M.gap + benchH + M.gap + pouchH + hintH + M.pad;
        rowsVis = clamp(Math.floor(((maxH || 1e9) - fixed + M.cg) / (M.cell + M.cg)), 1, rows);
        H = fixed + rowsVis * M.cell + (rowsVis - 1) * M.cg;
      }
      return { mode: modeName, W: Math.ceil(W), H: Math.ceil(H), C: C, rows: rows, rowsVis: rowsVis, gridW: gridW, BW: BW, benchH: benchH, innerW: innerW, ns: ns };
    }
    function uiList() { var a = val(o.uiRects, []) || []; var out = []; for (var i = 0; i < a.length; i++) { var r = rectOf(a[i]); if (r) out.push(r); } return out; }
    function avoidList() { var a = val(o.avoid, []) || []; var out = []; for (var i = 0; i < a.length; i++) { var r = rectOf(a[i]); if (r) out.push(r); } return out; }
    function lexLess(a, b) { for (var i = 0; i < a.length; i++) { if (a[i] < b[i] - 1e-9) return true; if (a[i] > b[i] + 1e-9) return false; } return false; }
    function place(M) {
      // the first avoid() rect is the player: a hard obstacle. Ranked: never cut the player by an edge (it is either fully clear or,
      // when nothing else fits, fully covered), then never cover the HUD, then keep the player clear, then the other avoid rects.
      var v = V(), m = P.margin > 0 ? P.margin : Math.max(2, Math.round(M.pad * 0.8)), ui = uiList(), av = avoidList(), best = null, tr = toastRect(M), pl = av[0] || null;
      var free = { x: v.x + m, y: v.y + m, w: v.w - 2 * m, h: v.h - 2 * m };
      ['wide', 'tall'].forEach(function (mn, mi) {
        var A = arrange(M, mn, free.h), fits = A.W <= free.w && A.H <= free.h, W = Math.min(A.W, free.w), H = Math.min(A.H, free.h);
        var xs = [free.x, free.x + free.w - W, free.x + (free.w - W) / 2], ys = [free.y, free.y + free.h - H, free.y + (free.h - H) / 2], i, j;
        av.concat(ui).forEach(function (r) { xs.push(r.x - m - W, r.x + r.w + m, r.x + r.w + 1 - W, r.x - 1); ys.push(r.y - m - H, r.y + r.h + m, r.y + r.h + 1 - H, r.y - 1); });
        for (i = 0; i < xs.length; i++) for (j = 0; j < ys.length; j++) {
          var R = { x: Math.round(clamp(xs[i], free.x, free.x + free.w - W)), y: Math.round(clamp(ys[j], free.y, free.y + free.h - H)), w: W, h: H };
          var uiA = 0, avA = 0, toA = tr ? area(R, tr) : 0; ui.forEach(function (u) { uiA += area(R, u); }); av.forEach(function (u, k) { if (k > 0) avA += area(R, u); });
          var pA = pl ? area(R, pl) : 0, cut = pA > 0.5 && pA < pl.w * pl.h - 0.5;
          var cx = R.x + R.w / 2 - (v.x + v.w / 2), cy = R.y + R.h / 2 - (v.y + v.h / 2);
          // ranked, in order: the layout fits, the player is not cut, HUD area covered, the player covered, then soft costs
          var key = [fits ? 0 : 1, cut ? 1 : 0, Math.round(uiA), pA > 0.5 ? 1 : 0, avA * 1e3 + mi * 5e4 + toA * 20 + Math.hypot(cx * 0.6, cy)];
          if (!best || lexLess(key, best.key)) best = { key: key, R: R, A: A, uiA: uiA, avA: avA + pA, sheet: !fits, cut: cut };
        }
      });
      var covers = best.avA > 0, onUI = best.uiA > 0;
      return { rect: best.R, A: best.A, M: M, covers: covers, onUI: onUI, sheet: !!best.sheet || onUI, cut: !!best.cut, view: v, avoid: av, ui: ui, margin: m };
    }
    function layoutNow() {
      var M = metrics(), v = V(), key = [v.x, v.y, v.w, v.h, M.cr ? 'k' + M.k : 'F' + M.F, RECIPES.length, P.slots, P.cols, P.keyHints, uiList().map(function (r) { return [Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)].join(','); }).join(';')].join('|');
      if (L && key === placeKey) return L;
      var nl = place(M);
      if (L && drawnKey === placeKey && isOpen && clock - openT > OPEN_MS) { prevL = L; prevL.until = clock + XFADE; nl.from = clock; ST.crossfades++; } else { prevL = null; nl.from = -1e9; }
      L = nl; placeKey = key;
      if (L.covers) { ST.covers++; ev('covers', { avoidable: false }); }
      if (L.onUI) ST.onUI++;
      return L;
    }

    /* ---------- toast spot ---------- */
    function toastSize(t, M) {
      var lab = toastLabel(t), iconS = M.cr ? 16 * M.k : Math.round(M.F * 2.1);
      var tw = Math.max(measure(M.fs, lab), measure(M.fb, t.text));
      var w = Math.ceil(M.pad * 2 + iconS + M.gap * 1.5 + tw), h = Math.ceil(M.cr ? Math.max(iconS + 8 * M.k, textH(M.fs) + textH(M.fb) + 9 * M.k) : Math.max(iconS + M.pad * 1.4, textH(M.fs) + textH(M.fb) + M.pad * 1.8));
      return { w: w, h: h, icon: iconS };
    }
    function toastLabel(t) { return t.kind === 'discovered' ? 'DISCOVERED' : t.kind === 'crafted' ? 'CRAFTED' : 'NEW RECIPE'; }
    var SPOTS = ['top', 'bottom', 'tl', 'tr', 'bl', 'br'];
    function spotRect(name, S, M) {
      var v = V(), m = Math.max(3, Math.round(M.pad * 0.8)), ui = uiList(), top = v.y + m, bot = v.y + v.h - m - S.h;
      // below / above HUD rects that touch the edge
      ui.forEach(function (u) { if (u.y <= v.y + 2 && u.y + u.h < v.y + v.h * 0.4) top = Math.max(top, u.y + u.h + m); if (u.y + u.h >= v.y + v.h - 2 && u.y > v.y + v.h * 0.6) bot = Math.min(bot, u.y - m - S.h); });
      var cx = Math.round(v.x + (v.w - S.w) / 2), lx = v.x + m, rx = v.x + v.w - m - S.w;
      var p = name === 'top' ? [cx, top] : name === 'bottom' ? [cx, bot] : name === 'tl' ? [lx, top] : name === 'tr' ? [rx, top] : name === 'bl' ? [lx, bot] : [rx, bot];
      return { x: Math.round(p[0]), y: Math.round(p[1]), w: S.w, h: S.h };
    }
    // a toast's box: anchored where it was placed when it started (HUD bands or scenes that change later never move it)
    function toastBox(t, M) {
      M = M || metrics(); var S = toastSize(t, M), A = t.spot.at, v = V(), n = t.spot.name;
      if (!A) A = t.spot.at = spotRect(n, S, M);
      var x = n === 'top' || n === 'bottom' ? A.x + A.w / 2 - S.w / 2 : n === 'tr' || n === 'br' ? A.x + A.w - S.w : A.x, y = n === 'bottom' || n === 'bl' || n === 'br' ? A.y + A.h - S.h : A.y;
      return { x: Math.round(clamp(x, v.x, v.x + v.w - S.w)), y: Math.round(clamp(y, v.y, v.y + v.h - S.h)), w: S.w, h: S.h };
    }
    function toastRect(M) { if (!toast || !toast.spot || toast.yieldT != null) return null; return toastBox(toast, M); }
    function pickToastSpot(t) {
      var M = metrics(), S = toastSize(t, M), ui = uiList(), av = avoidList(), best = null, pr = isOpen ? (L ? L.rect : null) : null;
      if (isOpen && !pr) pr = layoutNow().rect;
      for (var i = 0; i < SPOTS.length; i++) {
        var R = spotRect(SPOTS[i], S, M), bad = 0;
        ui.forEach(function (u) { bad += area(R, u) * 1e6; }); av.forEach(function (u) { bad += area(R, u) * 1e3; }); if (pr) bad += area(R, pr) * 10;
        var sc = bad + i;
        if (!best || sc < best.sc) best = { sc: sc, name: SPOTS[i], over: pr ? area(R, pr) > 0 : false, at: R };
      }
      return { name: best.name, clear: best.sc < SPOTS.length, over: best.over, at: best.at };   // over: no spot clear of the open window (a phone sheet): shown on top of it
    }

    /* ---------- input ---------- */
    function gridMove(dx, dy) {
      var C = lastCols, n = RECIPES.length; if (!n) return;
      var c = sel % C, r = Math.floor(sel / C);
      if (dy > 0 && (r + 1) * C >= n) { if (pouchList().length) { focus = 'pouch'; pouchSel = clamp(pouchSel, 0, pouchList().length - 1); ev('focus', { to: 'pouch' }); } return; }
      var ni = dx ? clamp(sel + dx, 0, n - 1) : clamp(sel + dy * C, 0, n - 1);
      if (dy < 0 && r === 0) return;
      if (dy > 0 && ni >= n) ni = n - 1;
      select(ni);
    }
    function input(a) {
      if (!isOpen) return false;
      lastPtr = false;
      try {
        if (a === 'back') { if (work) cancelWork(); else if (focus === 'pouch' && mode === 'hand' && !benchEmpty()) takeBack(); else if (focus === 'pouch') { focus = 'book'; ev('focus', { to: 'book' }); } else close(); return true; }
        if (work) return true;
        if (a === 'craft') { startCraft(); return true; }
        if (a === 'tab') { focus = focus === 'book' && pouchList().length ? 'pouch' : 'book'; ev('focus', { to: focus }); return true; }
        if (focus === 'book') {
          if (a === 'left') gridMove(-1, 0); else if (a === 'right') gridMove(1, 0); else if (a === 'up') gridMove(0, -1); else if (a === 'down') gridMove(0, 1);
          else if (a === 'ok') { if (mode !== 'recipe') select(sel); startCraft(); }
          return true;
        }
        var pl = pouchList(); pouchSel = clamp(pouchSel, 0, Math.max(0, pl.length - 1));
        if (a === 'left') pouchSel = Math.max(0, pouchSel - 1); else if (a === 'right') pouchSel = Math.min(pl.length - 1, pouchSel + 1);
        else if (a === 'up') { focus = 'book'; ev('focus', { to: 'book' }); }
        else if (a === 'ok') { if (pl[pouchSel]) put(pl[pouchSel]); }
        return true;
      } catch (e) { ST.errors++; warn('input', 'input failed: ' + (e && e.message)); return true; }
    }
    var KEYS = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', KeyZ: 'ok', Space: 'ok', Enter: 'ok', NumpadEnter: 'ok',
      KeyX: 'back', Escape: 'back', Backspace: 'back', KeyC: 'craft', Tab: 'tab',
      Up: 'up', Down: 'down', Left: 'left', Right: 'right', ' ': 'ok', z: 'ok', Z: 'ok', x: 'back', X: 'back', c: 'craft', C: 'craft', Esc: 'back', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };
    function key(code, down, repeat) { if (!isOpen) return false; var a = KEYS[code]; if (!a) return true; if (down === false) return true; if (repeat && (a === 'ok' || a === 'craft' || a === 'back')) return true; input(a); return true; }
    function hot(x, y) { if (!L || !L.hot) return null; for (var i = L.hot.length - 1; i >= 0; i--) if (inside({ x: x, y: y }, L.hot[i])) return L.hot[i]; return null; }
    function pointer(type, x, y) {
      if (!isOpen || !L) return false;
      x = +x; y = +y; if (!isFinite(x) || !isFinite(y)) return false;
      var inPanel = inside({ x: x, y: y }, L.rect), h = hot(x, y);
      hover = h ? h.key : null;
      if (type !== 'up' && type !== 'tap') return inPanel;
      lastPtr = true;
      if (!h) return inPanel;
      try {
        if (h.kind === 'close') close();
        else if (work) { if (h.kind === 'craft') cancelWork(); }
        else if (h.kind === 'cell') { focus = 'book'; if (sel === h.i && mode === 'recipe') startCraft(); else select(h.i); }
        else if (h.kind === 'pouch') { focus = 'pouch'; pouchSel = h.i; var pl = pouchList(); if (pl[h.i]) put(pl[h.i]); }
        else if (h.kind === 'slot') { if (mode === 'hand') { var s = slots[h.i]; if (s) { if (--s.n <= 0) slots[h.i] = null; ev('remove', { id: s.id }); } } }
        else if (h.kind === 'craft') startCraft();
        else if (h.kind === 'clear') clearBench();
      } catch (e) { ST.errors++; }
      return true;
    }

    /* ---------- update ---------- */
    function update(dt) {
      dt = num(dt, 0); if (!(dt >= 0)) dt = 0; dt = Math.min(dt, 250);
      try {
        clock += dt; ST.updates++;
        checkDiscovery();
        if (isOpen) layoutNow();
        if (work) { work.t += dt; if (work.t >= work.dur) finish(); }
        if (msg && clock - msg.t > MSG_MS) msg = null;
        if (pop && clock - pop.t > POP_MS + 400) pop = null;
        stepToasts();
      } catch (e) { ST.errors++; warn('update', 'update failed: ' + (e && e.message)); }
    }

    /* ---------- drawing helpers ---------- */
    function ptext(ctx, fname, k, s, x, y, col) {
      var key2 = fname + k + col + '|' + s, c = TC[key2];
      if (!c) {
        var F = pfont(fname), w = Math.max(1, pw(fname, s)); c = mk(w, F.h); if (!c) return;
        var g = c.getContext('2d'); g.fillStyle = col; var xx = 0;
        for (var i = 0; i < s.length; i++) { var ch = s.charAt(i); if (ch === ' ') { xx += F.space + 1; continue; } var gl = F.g[ch] || F.g['?']; for (var r = 0; r < gl.rows.length; r++) for (var q = 0; q < gl.rows[r].length; q++) if (gl.rows[r].charAt(q) === '#') g.fillRect(xx + q, r, 1, 1); xx += gl.w + 1; }
        if (TCn > 600) { TC = {}; TCn = 0; } TC[key2] = c; TCn++;
      }
      var smo = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
      ctx.drawImage(c, Math.round(x), Math.round(y), c.width * k, c.height * k);
      ctx.imageSmoothingEnabled = smo;
    }
    var TEXTS = null;
    function text(ctx, f, s, x, y, col, opt) {
      s = String(s); opt = opt || {};
      var w = measure(f, s), ax = opt.align === 'right' ? x - w : opt.align === 'center' ? x - w / 2 : x;
      if (f.px) { ax = Math.round(ax); if (opt.shadow) ptext(ctx, f.px, f.k, s, ax + f.k, y + f.k, opt.shadow); ptext(ctx, f.px, f.k, s, ax, y, col); }
      else {
        ctx.font = fontStr(f); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        var base = y + capH(f);
        if (opt.stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, f.size / 5); ctx.strokeStyle = opt.stroke; ctx.strokeText(s, ax, base); }
        if (opt.shadow) { ctx.fillStyle = opt.shadow; ctx.fillText(s, ax, base + Math.max(1, Math.round(f.size / 12))); }
        ctx.fillStyle = col; ctx.fillText(s, ax, base);
      }
      var b = { kind: 'text', x: ax, y: y, w: w, h: textH(f), px: textPx(f), role: opt.role || '', s: s, owner: opt.owner || 'panel' };
      if (TEXTS && opt.record !== false) TEXTS.push(b);
      return b;
    }
    function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
    function devScale(ctx) { try { var T = ctx.getTransform(); return Math.max(0.25, Math.sqrt(Math.abs(T.a * T.d - T.b * T.c))); } catch (e) { return 1; } }
    function iconCanvas(it, n, pixel) {
      var key2 = it.id + '|' + n + '|' + (pixel ? 1 : 0); if (iconCache[key2]) return iconCache[key2];
      var k = it.icon && ICONS[it.icon] ? it.icon : guessIcon(it.id, it.name), c = renderIcon(k, n, pixel, it.color);
      if (iconN > 300) { iconCache = {}; iconN = 0; } iconN++;
      return (iconCache[key2] = c);
    }
    function silCanvas(it, n, pixel, col) { var key2 = 'sil|' + it.id + '|' + n + '|' + (pixel ? 1 : 0) + col; if (iconCache[key2]) return iconCache[key2]; var src = atlasCanvas(it, n) || iconCanvas(it, n, pixel); var c = src ? silhouette(src, col) : null; iconN++; return (iconCache[key2] = c); }
    function atlasCanvas(it, n) {
      var A = o.icons, img = it.image || (A && A.image), crop = it.crop, key2 = 'atl|' + it.id + '|' + n;
      if (!img) return null;
      if (!crop && A && A.keys) { var kk = it.icon || it.id, ix = A.keys.indexOf(kk); if (ix < 0) return null; var cell = A.cell || 128, cols = A.cols || Math.max(1, Math.round((img.naturalWidth || img.width) / cell)); crop = [(ix % cols) * cell, Math.floor(ix / cols) * cell, cell, cell]; }
      if (!crop) crop = [0, 0, img.naturalWidth || img.width, img.naturalHeight || img.height];
      if (!(img.naturalWidth || img.width)) return null;
      if (iconCache[key2]) return iconCache[key2];
      var c = mk(n, n); if (!c) return null; var g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      var cw = crop[2], ch = crop[3], s = Math.min(n / cw, n / ch); g.drawImage(img, crop[0], crop[1], cw, ch, (n - cw * s) / 2, (n - ch * s) / 2, cw * s, ch * s);
      iconN++; return (iconCache[key2] = c);
    }
    // icon centred at (cx, cy), `size` canvas units; alpha, scale, silhouette
    function drawIcon(ctx, id, cx, cy, size, M, opt) {
      opt = opt || {}; var it = item(id), sc = opt.scale == null ? 1 : opt.scale; if (size * sc < 1) return;
      ctx.save(); if (opt.alpha != null) ctx.globalAlpha *= opt.alpha;
      if (typeof it.draw === 'function' && !opt.sil) { var ok = call(it.draw, [ctx, cx - size * sc / 2, cy - size * sc / 2, size * sc, size * sc], false); if (ok !== false) { ctx.restore(); return; } }
      var dev = M.cr ? 1 : devScale(ctx), n = M.cr ? Math.round(size / M.k) : Math.max(8, Math.round(size * dev));
      var c = opt.sil ? silCanvas(it, n, M.cr, opt.sil) : (atlasCanvas(it, n) || iconCanvas(it, n, M.cr));
      if (c) {
        ctx.imageSmoothingEnabled = !M.cr; if (!M.cr) ctx.imageSmoothingQuality = 'high';
        var w = M.cr ? c.width * M.k * sc : size * sc, x = M.cr ? Math.round(cx - w / 2) : cx - w / 2, y = M.cr ? Math.round(cy - w / 2) : cy - w / 2;
        ctx.drawImage(c, x, y, w, w);
      }
      ctx.restore();
    }
    function bevel(ctx, x, y, w, h, M, T, kind, lit) {
      x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
      if (M.cr) {
        var p = T.px, k = M.k;
        ctx.fillStyle = p.o; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = kind === 'well' ? p.well : kind === 'btn' ? (lit ? p.gold : '#6e5c56') : p.fill; ctx.fillRect(x + k, y + k, w - 2 * k, h - 2 * k);
        ctx.fillStyle = kind === 'well' ? p.dark : kind === 'btn' ? (lit ? '#fff0b8' : '#8e7c74') : p.lite; ctx.fillRect(x + k, y + k, w - 2 * k, k); ctx.fillRect(x + k, y + k, k, h - 2 * k);
        ctx.fillStyle = kind === 'well' ? p.wellHi : kind === 'btn' ? (lit ? '#8a5418' : '#3e322e') : p.dark; ctx.fillRect(x + k, y + h - 2 * k, w - 2 * k, k); ctx.fillRect(x + w - 2 * k, y + k, k, h - 2 * k);
        return;
      }
      if (typeof o.frame === 'function' && call(o.frame, [ctx, { x: x, y: y, w: w, h: h }, kind === 'btn' ? (lit ? 'button' : 'button-off') : kind], false)) return;
      var r = Math.max(3, Math.round(M.F * (kind === 'btn' ? 0.45 : 0.4)));
      if (kind === 'well') {
        rr(ctx, x, y, w, h, r); var g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, T.wellLo); g.addColorStop(1, T.well); ctx.fillStyle = g; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = rgba(T.wellHi, 0.9); rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'; rr(ctx, x + 1.5, y + 1.5, w - 3, h - 3, r - 1); ctx.stroke();
      } else if (kind === 'btn') {
        rr(ctx, x, y, w, h, r); var gb = ctx.createLinearGradient(0, y, 0, y + h); gb.addColorStop(0, lit ? T.btnHi : mixS(T.btnHi, T.off, 0.6)); gb.addColorStop(1, lit ? T.btn : mixS(T.btn, T.off, 0.6)); ctx.fillStyle = gb; ctx.fill();
        ctx.lineWidth = Math.max(1, M.F / 12); ctx.strokeStyle = T.btnLo; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(x + r, y + 1.5); ctx.lineTo(x + w - r, y + 1.5); ctx.stroke();
      }
    }
    function panelBg(ctx, R, M, T, title) {
      var custom = typeof o.frame === 'function' ? call(o.frame, [ctx, { x: R.x, y: R.y, w: R.w, h: R.h }, 'panel'], false) : false;
      if (M.cr) {
        if (!custom) {
          var p = T.px, k = M.k, x = R.x, y = R.y, w = R.w, h = R.h;
          ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 2 * k, y + 2 * k, w, h);
          ctx.fillStyle = p.o; ctx.fillRect(x, y, w, h);
          ctx.fillStyle = p.fill; ctx.fillRect(x + k, y + k, w - 2 * k, h - 2 * k);
          for (var yy = y + 2 * k + M.head; yy < y + h - 2 * k; yy += 4 * k) { ctx.fillStyle = p.fill2; ctx.fillRect(x + 2 * k, yy, w - 4 * k, k); }
          ctx.fillStyle = p.head; ctx.fillRect(x + k, y + k, w - 2 * k, M.head - k);
          ctx.fillStyle = p.lite; ctx.fillRect(x + k, y + k, w - 2 * k, k); ctx.fillRect(x + k, y + k, k, h - 2 * k);
          ctx.fillStyle = p.dark; ctx.fillRect(x + k, y + h - 2 * k, w - 2 * k, k); ctx.fillRect(x + w - 2 * k, y + k, k, h - 2 * k);
          ctx.fillStyle = p.gold2; ctx.fillRect(x + 2 * k, y + M.head, w - 4 * k, k);
          [[x, y], [x + w - 3 * k, y], [x, y + h - 3 * k], [x + w - 3 * k, y + h - 3 * k]].forEach(function (c) { ctx.fillStyle = p.gold; ctx.fillRect(c[0] + k, c[1] + k, k, k); });
        }
        return custom;
      }
      if (!custom) {
        var r = Math.round(M.F * 0.7);
        ctx.save(); ctx.shadowColor = T.shadow; ctx.shadowBlur = M.F * 1.4; ctx.shadowOffsetY = M.F * 0.35;
        rr(ctx, R.x, R.y, R.w, R.h, r); var g = ctx.createLinearGradient(0, R.y, 0, R.y + R.h); g.addColorStop(0, T.top); g.addColorStop(1, T.bot); ctx.fillStyle = g; ctx.fill(); ctx.restore();
        ctx.save(); rr(ctx, R.x, R.y, R.w, R.h, r); ctx.clip();
        var hg = ctx.createLinearGradient(0, R.y, 0, R.y + M.head); hg.addColorStop(0, mixS(T.head, '#ffffff', 0.08)); hg.addColorStop(1, T.head); ctx.fillStyle = hg; ctx.fillRect(R.x, R.y, R.w, M.head);
        // a faint grain so the panel is not a flat fill
        ctx.globalAlpha = 0.05; ctx.fillStyle = '#ffffff';
        for (var i = 0; i < 70; i++) { var gx = R.x + h01(i, 3) * R.w, gy = R.y + M.head + h01(i, 5) * (R.h - M.head); ctx.fillRect(gx, gy, M.F * (0.6 + h01(i, 7) * 2.2), 1); }
        ctx.restore();
        ctx.lineWidth = 2; ctx.strokeStyle = T.rim; rr(ctx, R.x, R.y, R.w, R.h, r); ctx.stroke();
        ctx.lineWidth = 1; ctx.strokeStyle = rgba(T.line, 0.85); rr(ctx, R.x + 2.5, R.y + 2.5, R.w - 5, R.h - 5, r - 2); ctx.stroke();
        ctx.strokeStyle = T.hi; ctx.beginPath(); ctx.moveTo(R.x + r, R.y + 4.5); ctx.lineTo(R.x + R.w - r, R.y + 4.5); ctx.stroke();
        ctx.strokeStyle = rgba(T.line, 0.7); ctx.beginPath(); ctx.moveTo(R.x + M.pad * 0.6, R.y + M.head + 0.5); ctx.lineTo(R.x + R.w - M.pad * 0.6, R.y + M.head + 0.5); ctx.stroke();
      }
      return custom;
    }
    function spark(ctx, x, y, r, col, M) {
      if (M.cr) { var k = M.k; ctx.fillStyle = col; ctx.fillRect(Math.round(x) - k, Math.round(y), 3 * k, k); ctx.fillRect(Math.round(x), Math.round(y) - k, k, 3 * k); return; }
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill();
    }
    function craftable(r) { if (!r || !known[r.id]) return false; for (var i = 0; i < r.inputs.length; i++) if (cnt(r.inputs[i].id) < r.inputs[i].n) return false; return true; }

    /* ---------- the window ---------- */
    function drawPanel(ctx, LL, alpha, slide) {
      var M = LL.M, A = LL.A, T = THEMES[P.theme], R = { x: LL.rect.x, y: LL.rect.y + slide, w: LL.rect.w, h: LL.rect.h }, hotL = [], k = M.cr ? M.k : 1;
      ctx.save(); ctx.globalAlpha *= alpha;
      panelBg(ctx, R, M, T);
      var x0 = R.x + M.pad, y0 = R.y, inW = R.w - 2 * M.pad;
      // header: station title and the close button
      var cbS = M.cr ? 9 * k : Math.round(M.F * 1.35), cbX = R.x + R.w - M.pad - cbS + (M.cr ? 0 : 0), cbY = R.y + Math.round((M.head - cbS) / 2);
      var titleMax = inW - cbS - M.gap;
      var hbA = inHeader() ? toastAlpha(toast) : 0;
      if (hbA < 1) { ctx.save(); ctx.globalAlpha *= 1 - hbA; text(ctx, M.ft, ellip(M.ft, station, titleMax), x0, y0 + Math.round((M.head - capH(M.ft)) / 2) - (M.cr ? 0 : 1), T.title, { role: 'title', shadow: M.cr ? T.px.o : 'rgba(0,0,0,0.45)', record: hbA < 0.5 }); ctx.restore(); }
      if (hbA > 0) {   // the toast in the title row: icon, label, name (never over the window's text)
        ctx.save(); ctx.globalAlpha *= hbA;
        var col0 = toast.kind === 'crafted' ? T.ok : T.accent, isz = Math.round(M.head * 0.72), icx0 = x0 + isz / 2, icy0 = R.y + M.head / 2;
        if (!M.cr) { var hg0 = ctx.createRadialGradient(icx0, icy0, 0, icx0, icy0, isz * 0.8); hg0.addColorStop(0, rgba(col0, 0.45)); hg0.addColorStop(1, rgba(col0, 0)); ctx.fillStyle = hg0; ctx.fillRect(icx0 - isz, icy0 - isz, isz * 2, isz * 2); }
        drawIcon(ctx, toast.id, icx0, icy0, isz, M);
        var lab0 = toastLabel(toast), lx0 = x0 + isz + M.gap, lw0 = measure(M.fs, lab0), ty0 = R.y + Math.round((M.head - capH(M.fb)) / 2) - (M.cr ? 0 : 1);
        text(ctx, M.fs, lab0, lx0, R.y + Math.round((M.head - capH(M.fs)) / 2), col0, { role: 'banner', shadow: M.cr ? T.px.o : null, record: hbA >= 0.5 });
        text(ctx, M.fb, ellip(M.fb, toast.text, Math.max(10, titleMax - isz - M.gap * 2 - lw0)), lx0 + lw0 + M.gap, ty0, T.text, { role: 'banner', shadow: M.cr ? T.px.o : 'rgba(0,0,0,0.45)', record: hbA >= 0.5 });
        ctx.restore();
      }
      if (M.cr) { bevel(ctx, cbX, cbY, cbS, cbS, M, T, 'well'); ctx.fillStyle = T.px.gold; for (var q = 0; q < 5; q++) { ctx.fillRect(cbX + (2 + q) * k, cbY + (2 + q) * k, k, k); ctx.fillRect(cbX + (6 - q) * k, cbY + (2 + q) * k, k, k); } }
      else { ctx.fillStyle = hover === 'close' ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.28)'; rr(ctx, cbX, cbY, cbS, cbS, Math.round(cbS * 0.3)); ctx.fill(); ctx.strokeStyle = T.dim; ctx.lineWidth = Math.max(1.5, M.F / 9); ctx.lineCap = 'round'; var cp = cbS * 0.32; ctx.beginPath(); ctx.moveTo(cbX + cp, cbY + cp); ctx.lineTo(cbX + cbS - cp, cbY + cbS - cp); ctx.moveTo(cbX + cbS - cp, cbY + cp); ctx.lineTo(cbX + cp, cbY + cbS - cp); ctx.stroke(); }
      hotL.push({ kind: 'close', key: 'close', x: cbX, y: cbY, w: cbS, h: cbS });
      TEXTS && TEXTS.push({ kind: 'button', id: 'close', x: cbX, y: cbY, w: cbS, h: cbS });
      // regions
      var top = R.y + M.head + M.gap, gridX, gridY, benchX, benchY;
      if (A.mode === 'wide') { gridX = x0; gridY = top; benchX = x0 + A.gridW + M.gap * 2; benchY = top; }
      else { gridX = x0 + Math.round((inW - A.gridW) / 2); gridY = top; benchX = x0 + Math.round((inW - A.BW) / 2); benchY = top + A.rowsVis * M.cell + (A.rowsVis - 1) * M.cg + M.gap; }
      lastCols = A.C;
      // recipe grid (scrolls by whole rows to keep the selection visible: derived from sel, nothing stored)
      var selRow = Math.floor(sel / A.C), first = clamp(selRow - A.rowsVis + 1, 0, Math.max(0, A.rows - A.rowsVis));
      for (var i = first * A.C; i < Math.min(RECIPES.length, (first + A.rowsVis) * A.C); i++) {
        var rcp = RECIPES[i], cc = i % A.C, rw = Math.floor(i / A.C) - first, cx = gridX + cc * (M.cell + M.cg), cy = gridY + rw * (M.cell + M.cg), isSel = i === sel, kn = !!known[rcp.id];
        bevel(ctx, cx, cy, M.cell, M.cell, M, T, 'well');
        if (isSel) {
          if (M.cr) { ctx.fillStyle = T.px.gold; var kk = k; ctx.fillRect(cx, cy, M.cell, kk); ctx.fillRect(cx, cy + M.cell - kk, M.cell, kk); ctx.fillRect(cx, cy, kk, M.cell); ctx.fillRect(cx + M.cell - kk, cy, kk, M.cell); }
          else { ctx.save(); ctx.shadowColor = rgba(T.accent, 0.8); ctx.shadowBlur = M.F * 0.6; ctx.lineWidth = Math.max(2, M.F / 7); ctx.strokeStyle = focus === 'book' ? T.accent : rgba(T.accent, 0.55); rr(ctx, cx + 1, cy + 1, M.cell - 2, M.cell - 2, Math.round(M.F * 0.4)); ctx.stroke(); ctx.restore(); }
        } else if (hover === 'cell' + i && !M.cr) { ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; rr(ctx, cx + 1, cy + 1, M.cell - 2, M.cell - 2, Math.round(M.F * 0.4)); ctx.stroke(); }
        var icx = cx + M.cell / 2, icy = cy + M.cell / 2;
        if (kn) {
          var can = craftable(rcp);
          drawIcon(ctx, rcp.out.id, icx, icy, M.icon, M, { alpha: can ? 1 : 0.62 });
          if (can) { if (M.cr) { ctx.fillStyle = T.px.o; ctx.fillRect(cx + M.cell - 6 * k, cy + M.cell - 6 * k, 4 * k, 4 * k); ctx.fillStyle = T.ok; ctx.fillRect(cx + M.cell - 5 * k, cy + M.cell - 5 * k, 2 * k, 2 * k); } else { ctx.fillStyle = T.ok; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx + M.cell - M.F * 0.42, cy + M.cell - M.F * 0.42, M.F * 0.2, 0, 6.283); ctx.fill(); ctx.stroke(); } }
          if (isNew[rcp.id]) { var tw0 = clock * 0.006 + i; if (M.cr) { ctx.fillStyle = (Math.floor(clock / 300) % 2) ? T.px.gold : '#ffffff'; ctx.fillRect(cx + 2 * k, cy + 2 * k, 2 * k, 2 * k); } else spark(ctx, cx + M.F * 0.45, cy + M.F * 0.45, M.F * (0.26 + 0.06 * Math.sin(tw0)), T.accent, M); }
        } else {
          drawIcon(ctx, rcp.out.id, icx, icy, M.icon, M, { sil: T.lock, alpha: 0.95 });
          text(ctx, M.fb, '?', icx, icy - capH(M.fb) / 2, T.dim, { align: 'center', role: 'lock', record: false });
        }
        hotL.push({ kind: 'cell', key: 'cell' + i, i: i, x: cx, y: cy, w: M.cell, h: M.cell });
      }
      if (A.rows > A.rowsVis) {   // scroll cue
        var sx = gridX + A.gridW + Math.round(M.cg), sh = A.rowsVis * M.cell + (A.rowsVis - 1) * M.cg, th = Math.max(4 * k, sh * A.rowsVis / A.rows), ty = gridY + (sh - th) * (first / Math.max(1, A.rows - A.rowsVis));
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(Math.round(sx), gridY, Math.max(1, Math.round(2 * k * (M.cr ? 1 : M.F / 10))), sh); ctx.fillStyle = M.cr ? T.px.gold : T.accent; ctx.fillRect(Math.round(sx), Math.round(ty), Math.max(1, Math.round(2 * k * (M.cr ? 1 : M.F / 10))), Math.round(th));
      }
      // learned count under the grid when the wide layout leaves room there
      var gridH = A.rowsVis * M.cell + (A.rowsVis - 1) * M.cg, bodyH = Math.max(A.benchH, gridH);
      if (A.mode === 'wide' && bodyH - gridH >= textH(M.fs) + M.gap) {
        var nk = RECIPES.filter(function (q) { return known[q.id]; }).length;
        text(ctx, M.fs, ellip(M.fs, 'Learned ' + nk + ' / ' + RECIPES.length, A.gridW), gridX + A.gridW / 2, gridY + gridH + M.gap, T.dim, { align: 'center', role: 'learned', shadow: M.cr ? T.px.o : null });
      }
      // bench: name, slots, arrow, result, badges
      var shake = clock - shakeT < SHAKE_MS ? Math.sin((clock - shakeT) * 0.09) * (1 - (clock - shakeT) / SHAKE_MS) * (M.cr ? 3 * k : M.F * 0.4) : 0;
      if (M.cr) shake = Math.round(shake / k) * k;
      var rcpS = RECIPES[sel], match = mode === 'hand' ? benchMatch() : rcpS, mKnown = match && known[match.id], nameStr, nameCol = T.text;
      if (work) { var wr = RID[work.rid]; nameStr = (work.disc ? 'Trying: ' : 'Crafting: ') + (work.disc ? '???' : wr.name); nameCol = T.accent; }
      else if (mode === 'recipe') { nameStr = rcpS ? (known[rcpS.id] ? rcpS.name : '???') : ''; nameCol = rcpS && known[rcpS.id] ? T.text : T.dim; }
      else if (benchEmpty()) { nameStr = 'Your mix'; nameCol = T.dim; }
      else if (mKnown) nameStr = match.name; else { nameStr = 'Unknown mix'; nameCol = T.dim; }
      text(ctx, M.fb, ellip(M.fb, nameStr, A.BW), benchX, benchY + Math.round((M.name - textH(M.fb)) / 2), nameCol, { role: 'name' });
      var sy = benchY + M.name + Math.round(M.gap / 2), rowH = Math.max(M.res, M.slot + M.badge), slotY = sy + Math.round((M.res - M.slot) / 2), sx0 = benchX + shake, ns = A.ns;
      var workK = work ? clamp(work.t / Math.max(1, work.dur), 0, 1) : 0, failing = clock - shakeT < SHAKE_MS && msg && msg.kind === 'bad';
      for (var si = 0; si < ns; si++) {
        var sxx = Math.round(sx0 + si * (M.slot + M.plus)), s = (work ? work.slots : slots)[si] || null;
        bevel(ctx, sxx, slotY, M.slot, M.slot, M, T, 'well');
        if (s && mode === 'recipe' && rcpS && known[rcpS.id] && cnt(s.id) < s.n && !work && !(pop && clock - pop.t < POP_MS + 900)) { ctx.strokeStyle = rgba(T.bad, 0.85); ctx.lineWidth = M.cr ? k : Math.max(1.5, M.F / 9); if (M.cr) { ctx.fillStyle = T.bad; ctx.fillRect(sxx, slotY, M.slot, k); ctx.fillRect(sxx, slotY + M.slot - k, M.slot, k); ctx.fillRect(sxx, slotY, k, M.slot); ctx.fillRect(sxx + M.slot - k, slotY, k, M.slot); } else { rr(ctx, sxx + 1, slotY + 1, M.slot - 2, M.slot - 2, Math.round(M.F * 0.4)); ctx.stroke(); } }
        if (failing && s) { ctx.fillStyle = rgba(T.bad, 0.28 * (1 - (clock - shakeT) / SHAKE_MS)); if (M.cr) ctx.fillRect(sxx + k, slotY + k, M.slot - 2 * k, M.slot - 2 * k); else { rr(ctx, sxx + 2, slotY + 2, M.slot - 4, M.slot - 4, Math.round(M.F * 0.4)); ctx.fill(); } }
        if (s) {
          var have = cnt(s.id), lockedR = mode === 'recipe' && rcpS && !known[rcpS.id];
          var flyK = work ? sm(clamp(workK / 0.75, 0, 1)) : 0, fx = lerp(sxx + M.slot / 2, benchX + A.BW - M.res / 2 + shake, flyK), fy = lerp(slotY + M.slot / 2, sy + M.res / 2, flyK);
          if (work) drawIcon(ctx, s.id, sxx + M.slot / 2, slotY + M.slot / 2, M.icon * 0.9, M, { alpha: 0.28 });
          if (lockedR) drawIcon(ctx, s.id, fx, fy, M.icon * 0.9, M, { sil: T.lock, alpha: 0.9 });
          else drawIcon(ctx, s.id, fx, fy, M.icon * 0.9, M, { scale: 1 - flyK * 0.55, alpha: work ? 1 - flyK * 0.6 : (mode === 'recipe' && have < s.n ? 0.5 : 1) });
          var bad = mode === 'recipe' && have < s.n, bt = mode === 'recipe' ? (lockedR ? '?' : Math.min(have, 999) + '/' + s.n) : 'x' + s.n;
          text(ctx, M.fs, bt, sxx + M.slot / 2, slotY + M.slot + Math.round((M.badge - textH(M.fs)) / 2) + (M.cr ? k : 0), bad ? T.bad : mode === 'recipe' ? T.ok : T.text, { align: 'center', role: 'badge', shadow: M.cr ? T.px.o : null });
          hotL.push({ kind: 'slot', key: 'slot' + si, i: si, x: sxx, y: slotY, w: M.slot, h: M.slot });
        } else if (!M.cr) { ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.setLineDash([3, 3]); rr(ctx, sxx + 4, slotY + 4, M.slot - 8, M.slot - 8, 3); ctx.stroke(); ctx.setLineDash([]); }
        if (si < ns - 1) {   // plus between slots
          var px = Math.round(sxx + M.slot + M.plus / 2), py = Math.round(slotY + M.slot / 2), pl2 = M.cr ? 2 * k : Math.round(M.F * 0.28);
          if (M.cr) { ctx.fillStyle = T.px.gold2; ctx.fillRect(px - 2 * k, py, 5 * k, k); ctx.fillRect(px, py - 2 * k, k, 5 * k); }
          else { ctx.strokeStyle = T.dim; ctx.lineWidth = Math.max(1.5, M.F / 8); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px - pl2, py); ctx.lineTo(px + pl2, py); ctx.moveTo(px, py - pl2); ctx.lineTo(px, py + pl2); ctx.stroke(); }
        }
      }
      // arrow
      var ax = Math.round(sx0 + ns * M.slot + (ns - 1) * M.plus + M.arrow / 2), ay = Math.round(sy + M.res / 2), canNow = !work && mKnown && match && (function () { for (var j = 0; j < match.inputs.length; j++) if (cnt(match.inputs[j].id) < match.inputs[j].n) return false; return true; })();
      if (M.cr) { ctx.fillStyle = canNow || work ? T.px.gold : T.px.lite; for (var aj = 0; aj < 4; aj++) ctx.fillRect(ax - 2 * k + aj * k, ay - (3 - aj) * k, k, (7 - 2 * aj) * k); ctx.fillRect(ax - 4 * k, ay - k, 3 * k, 3 * k); }
      else { var aw = M.arrow * 0.32; ctx.fillStyle = canNow || work ? T.accent : T.off; ctx.beginPath(); ctx.moveTo(ax - aw, ay - aw * 0.45); ctx.lineTo(ax, ay - aw * 0.45); ctx.lineTo(ax, ay - aw); ctx.lineTo(ax + aw * 1.1, ay); ctx.lineTo(ax, ay + aw); ctx.lineTo(ax, ay + aw * 0.45); ctx.lineTo(ax - aw, ay + aw * 0.45); ctx.closePath(); ctx.fill(); }
      // result slot with the preview
      var rx = Math.round(benchX + A.BW - M.res + shake), ry = sy;
      bevel(ctx, rx, ry, M.res, M.res, M, T, 'well');
      if (canNow || work) { if (M.cr) { ctx.fillStyle = T.px.gold; ctx.fillRect(rx, ry, M.res, k); ctx.fillRect(rx, ry + M.res - k, M.res, k); ctx.fillRect(rx, ry, k, M.res); ctx.fillRect(rx + M.res - k, ry, k, M.res); } else { ctx.save(); ctx.shadowColor = rgba(T.accent, 0.7); ctx.shadowBlur = M.F * 0.8; ctx.strokeStyle = T.accent; ctx.lineWidth = Math.max(1.5, M.F / 9); rr(ctx, rx + 1, ry + 1, M.res - 2, M.res - 2, Math.round(M.F * 0.4)); ctx.stroke(); ctx.restore(); } }
      var rcx = rx + M.res / 2, rcy = ry + M.res / 2, popK = pop ? clamp((clock - pop.t) / POP_MS, 0, 1) : 1;
      if (work) {
        // the work bar fills the result slot from the bottom; the result shows at full size only when granted
        var fh = Math.round((M.res - 4 * k) * workK);
        if (M.cr) { ctx.fillStyle = T.px.gold2; ctx.fillRect(rx + 2 * k, ry + M.res - 2 * k - fh, M.res - 4 * k, fh); }
        else { ctx.save(); rr(ctx, rx + 2, ry + 2, M.res - 4, M.res - 4, Math.round(M.F * 0.35)); ctx.clip(); var wg = ctx.createLinearGradient(0, ry + M.res, 0, ry); wg.addColorStop(0, rgba(T.accent, 0.55)); wg.addColorStop(1, rgba(T.accent, 0.15)); ctx.fillStyle = wg; ctx.fillRect(rx, ry + M.res - 2 - fh, M.res, fh + 2); ctx.restore(); }
        if (work.disc) text(ctx, M.fb, '?', rcx, rcy - capH(M.fb) / 2, T.accent, { align: 'center', role: 'preview', record: false });
        else drawIcon(ctx, RID[work.rid].out.id, rcx, rcy, M.ricon, M, { alpha: 0.35 + 0.4 * workK });
        for (var wsp = 0; wsp < 3; wsp++) { var a0 = clock * 0.012 + wsp * 2.09; spark(ctx, rcx + Math.cos(a0) * M.res * 0.36, rcy + Math.sin(a0) * M.res * 0.36, M.cr ? k : M.F * 0.22, T.accent, M); }
      } else if (pop && clock - pop.t < POP_MS + 400 && (!match || match.id === pop.rid)) {
        var sc2 = popK < 1 ? 1 + 0.35 * Math.sin(popK * Math.PI) * (1 - popK * 0.5) : 1;
        drawIcon(ctx, pop.id, rcx, rcy, M.ricon, M, { scale: sc2 });
        if (popK < 1) { ctx.save(); ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip(); } if (popK < 1) for (var b = 0; b < 8; b++) { var an = b * 0.785 + 0.3, rad = M.res * (0.35 + 0.5 * ease(popK)); spark(ctx, rcx + Math.cos(an) * rad, rcy + Math.sin(an) * rad, (M.cr ? k : M.F * 0.3) * (1 - popK), b % 2 ? '#ffffff' : T.accent, M); } if (popK < 1) ctx.restore();
      } else if (match && mKnown) {
        drawIcon(ctx, match.out.id, rcx, rcy, M.ricon, M, { alpha: canNow ? 1 : 0.5 });
      } else if (match && !mKnown && mode === 'recipe') {
        drawIcon(ctx, match.out.id, rcx, rcy, M.ricon, M, { sil: T.lock });
        text(ctx, M.fb, '?', rcx, rcy - capH(M.fb) / 2, T.dim, { align: 'center', role: 'preview', record: false });
      } else if (mode === 'hand' && !benchEmpty()) {
        var tw1 = 0.5 + 0.5 * Math.sin(clock * 0.005);
        if (!M.cr) { var qg = ctx.createRadialGradient(rcx, rcy, 0, rcx, rcy, M.res * 0.45); qg.addColorStop(0, rgba(T.accent, 0.22 + 0.18 * tw1)); qg.addColorStop(1, rgba(T.accent, 0)); ctx.fillStyle = qg; ctx.fillRect(rcx - M.res / 2, rcy - M.res / 2, M.res, M.res); }
        text(ctx, M.fb, '?', rcx, rcy - capH(M.fb) / 2, mixS(T.accent, '#ffffff', 0.25 * tw1), { align: 'center', role: 'preview', record: false, shadow: M.cr ? T.px.o : 'rgba(0,0,0,0.5)' });
      }
      if (!work && match && mKnown && match.out.n > 1) text(ctx, M.fs, 'x' + match.out.n, rx + M.res - (M.cr ? 2 * k : 3), ry + M.res - textH(M.fs) - (M.cr ? 2 * k : 2), T.text, { align: 'right', role: 'count', shadow: M.cr ? T.px.o : null, stroke: M.cr ? null : 'rgba(0,0,0,0.8)' });
      // craft button with the key hint; disabled look when it cannot craft now (a press still says why)
      var by = sy + rowH + M.gap, bw = A.BW, bx = benchX, lit = !!(canNow || (mode === 'hand' && !benchEmpty() && !mKnown));
      bevel(ctx, bx, by, bw, M.btn, M, T, 'btn', lit || !!work);
      if (work) { var pw2 = Math.round((bw - 4 * k) * workK); ctx.fillStyle = M.cr ? '#fff0b8' : 'rgba(255,255,255,0.35)'; var ph = M.cr ? k : Math.max(3, Math.round(M.F * 0.28)); ctx.fillRect(bx + 2 * k, by + M.btn - (M.cr ? 3 * k : ph + 3), pw2, ph); }
      var hintK = focus === 'pouch' ? 'C' : 'Z', blabel = work ? 'Working...' : mode === 'hand' && !benchEmpty() && !mKnown ? 'Try mix' : 'Craft';
      var btnTxt = lastPtr || work || P.keyHints === 'off' ? blabel : blabel + ' [' + hintK + ']';
      text(ctx, M.fb, ellip(M.fb, btnTxt, bw - 2 * M.gap), bx + bw / 2, by + Math.round((M.btn - capH(M.fb)) / 2) - (M.cr ? k : 0), M.cr ? (lit || work ? T.px.o : '#2a2024') : (lit || work ? T.btnText : '#3a3030'), { align: 'center', role: 'button', record: false });
      hotL.push({ kind: 'craft', key: 'craft', x: bx, y: by, w: bw, h: M.btn });
      TEXTS && TEXTS.push({ kind: 'button', id: 'craft', x: bx, y: by, w: bw, h: M.btn });
      // message line (fades)
      var my = by + M.btn + Math.round(M.gap / 2), mtxt = null, mcol = T.dim, ma = 1;
      if (msg) { mtxt = msg.text; mcol = msg.kind === 'bad' ? T.bad : msg.kind === 'ok' ? T.ok : T.dim; ma = clamp((MSG_MS - (clock - msg.t)) / 300, 0, 1); }
      else if (mode === 'recipe' && rcpS && !known[rcpS.id] && P.hints !== 'off') mtxt = rcpS.hint || hintFor(rcpS);
      else if (mode === 'recipe' && rcpS && known[rcpS.id] && P.hints !== 'off') { var it0 = item(rcpS.out.id); mtxt = it0.desc || ''; }
      if (mtxt) { ctx.save(); ctx.globalAlpha *= ma; text(ctx, M.fs, ellip(M.fs, mtxt, A.BW), benchX, my + Math.round((M.msg - textH(M.fs)) / 2), mcol, { role: 'msg', shadow: M.cr ? T.px.o : null }); ctx.restore(); }
      // pouch
      var pyy = R.y + R.h - M.pad - (P.keyHints === 'off' ? 0 : M.hint) - M.pcell, pl = pouchList(), maxN = Math.max(1, Math.floor((inW + M.cg) / (M.pcell + M.cg))), pfirst = 0;
      if (focus === 'pouch') pouchSel = clamp(pouchSel, 0, Math.max(0, pl.length - 1));
      var over = pl.length > maxN; if (over) { maxN = Math.max(1, maxN - 1); pfirst = clamp(pouchSel - maxN + 1, 0, pl.length - maxN); }
      if (!M.cr) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; rr(ctx, x0 - M.pad * 0.35, pyy - M.gap * 0.6, inW + M.pad * 0.7, M.pcell + M.gap * 1.2, Math.round(M.F * 0.45)); ctx.fill(); }
      if (!pl.length) text(ctx, M.fs, 'Pouch is empty', x0, pyy + Math.round((M.pcell - textH(M.fs)) / 2), T.dim, { role: 'pouch' });
      for (var pi = pfirst; pi < Math.min(pl.length, pfirst + maxN); pi++) {
        var pid = pl[pi], pxx = x0 + (pi - pfirst) * (M.pcell + M.cg), left = cnt(pid) - reserved(pid);
        bevel(ctx, pxx, pyy, M.pcell, M.pcell, M, T, 'well');
        drawIcon(ctx, pid, pxx + M.pcell / 2, pyy + M.pcell / 2 - (M.cr ? k : M.F * 0.12), M.cr ? M.icon : Math.round(M.pcell * 0.68), M, { alpha: left > 0 ? 1 : 0.35 });
        text(ctx, M.fs, String(left), pxx + M.pcell - (M.cr ? k : 3), pyy + M.pcell - textH(M.fs) - (M.cr ? 0 : 1), left > 0 ? '#ffffff' : T.dim, { align: 'right', role: 'count', shadow: M.cr ? T.px.o : null, stroke: M.cr ? null : 'rgba(0,0,0,0.85)' });
        if (focus === 'pouch' && pi === pouchSel) { if (M.cr) { ctx.fillStyle = T.px.gold; ctx.fillRect(pxx, pyy, M.pcell, k); ctx.fillRect(pxx, pyy + M.pcell - k, M.pcell, k); ctx.fillRect(pxx, pyy, k, M.pcell); ctx.fillRect(pxx + M.pcell - k, pyy, k, M.pcell); } else { ctx.save(); ctx.shadowColor = rgba(T.accent, 0.8); ctx.shadowBlur = M.F * 0.6; ctx.lineWidth = Math.max(2, M.F / 7); ctx.strokeStyle = T.accent; rr(ctx, pxx + 1, pyy + 1, M.pcell - 2, M.pcell - 2, Math.round(M.F * 0.4)); ctx.stroke(); ctx.restore(); } }
        hotL.push({ kind: 'pouch', key: 'pouch' + pi, i: pi, x: pxx, y: pyy, w: M.pcell, h: M.pcell });
      }
      if (over) { var more = pl.length - maxN, mx = x0 + maxN * (M.pcell + M.cg); text(ctx, M.fs, (pfirst > 0 ? '<' : '') + '+' + more + (pfirst + maxN < pl.length ? '>' : ''), mx + (x0 + inW - mx) / 2, pyy + Math.round((M.pcell - textH(M.fs)) / 2), T.dim, { align: 'center', role: 'more' }); }
      // key hints
      if (P.keyHints !== 'off') {
        var narrow = inW < measure(M.fs, 'Arrows pick  Z craft  Down pouch  X close');
        var hs = lastPtr ? (narrow ? 'Tap twice to craft' : 'Tap a recipe, tap again to craft') : work ? 'X stop' : focus === 'book' ? (narrow ? 'Z craft  X close' : 'Arrows pick  Z craft  Down pouch  X close') : (narrow ? 'Z add  C try  X back' : 'Z add  X take back  C try  Up book');
        text(ctx, M.fs, ellip(M.fs, hs, inW), x0 + inW / 2, R.y + R.h - M.pad - M.hint + Math.round((M.hint - textH(M.fs)) / 2), T.dim, { align: 'center', role: 'hint' });
      }
      ctx.restore();
      return hotL;
    }
    function hintFor(r) {
      var d = r.discover;
      if (d.type === 'have') return 'Learn it by holding ' + d.ids.map(function (id) { return item(id).name; }).join(' and ');
      if (d.type === 'crafted') return 'Learn it by crafting ' + (RID[d.recipe] ? RID[d.recipe].name : 'something else');
      if (d.type === 'manual') return 'Someone must teach you this';
      return 'Discover it by trying a mix';
    }
    function drawDim(ctx, LL, a) {
      if (!(P.dim > 0) || a <= 0) return;
      var v = LL.view, av = LL.avoid, T = THEMES[P.theme];
      ctx.save(); ctx.globalAlpha *= a * P.dim; ctx.fillStyle = T.dimBg; ctx.beginPath(); ctx.rect(v.x, v.y, v.w, v.h);
      ctx.fill(); ctx.restore();
    }
    function toastAlpha(t) { var age = clock - t.t0, dur = toastDur(); return Math.min(ease(age / T_IN), clamp((dur - age) / T_OUT, 0, 1), t.yieldT != null ? clamp(1 - (clock - t.yieldT) / 180, 0, 1) : 1); }
    function inHeader() { return !!(toast && toast.spot && toast.spot.over && L && (isOpen || clock - closeT < CLOSE_MS)); }   // a phone sheet: the toast takes the window's title row
    function drawToast(ctx, M) {
      if (!toast) return null;
      if (toast.spot.over && toast.yieldT != null && !inHeader()) return null;   // a header toast leaves with its window, never moves out
      if (inHeader()) return { kind: 'toast', x: L.rect.x, y: L.rect.y, w: L.rect.w, h: L.M.head, alpha: toastAlpha(toast), spot: 'header', recipe: toast.rid, dimmed: false };
      var t = toast, T = THEMES[P.theme], S = toastSize(t, M), R = toastBox(t, M), age = clock - t.t0, dur = toastDur();
      var ain = ease(age / T_IN), aout = clamp((dur - age) / T_OUT, 0, 1), a = Math.min(ain, aout, t.yieldT != null ? clamp(1 - (clock - t.yieldT) / 180, 0, 1) : 1), dy = Math.round((1 - ain) * (M.cr ? -6 * M.k : -M.F * 0.6));
      // something the toast must not hide came under it after it was placed: it dims (it never jumps)
      var av = avoidList().concat(uiList()), dimmed = false; for (var i = 0; i < av.length; i++) if (hit(R, av[i])) dimmed = true;
      if (dimmed) a *= 0.4;
      if (a <= 0.004) return { kind: 'toast', x: R.x, y: R.y, w: R.w, h: R.h, alpha: 0 };
      ctx.save(); ctx.globalAlpha *= a;
      var y = R.y + dy, lab = toastLabel(t), col = t.kind === 'crafted' ? T.ok : T.accent;
      if (M.cr) {
        var k = M.k, p = T.px; ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(R.x + 2 * k, y + 2 * k, R.w, R.h); ctx.fillStyle = p.o; ctx.fillRect(R.x, y, R.w, R.h); ctx.fillStyle = p.fill; ctx.fillRect(R.x + k, y + k, R.w - 2 * k, R.h - 2 * k);
        ctx.fillStyle = p.lite; ctx.fillRect(R.x + k, y + k, R.w - 2 * k, k); ctx.fillStyle = col; ctx.fillRect(R.x + k, y + k, 2 * k, R.h - 2 * k);
      } else if (!(typeof o.frame === 'function' && call(o.frame, [ctx, { x: R.x, y: y, w: R.w, h: R.h }, 'toast'], false))) {
        ctx.save(); ctx.shadowColor = T.shadow; ctx.shadowBlur = M.F; ctx.shadowOffsetY = M.F * 0.25; rr(ctx, R.x, y, R.w, R.h, Math.round(M.F * 0.6)); var g = ctx.createLinearGradient(0, y, 0, y + R.h); g.addColorStop(0, T.top); g.addColorStop(1, T.bot); ctx.fillStyle = g; ctx.fill(); ctx.restore();
        ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(col, 0.9); rr(ctx, R.x + 0.75, y + 0.75, R.w - 1.5, R.h - 1.5, Math.round(M.F * 0.6)); ctx.stroke();
        var sh = clamp((age - T_IN) / 700, 0, 1); if (sh > 0 && sh < 1) { ctx.save(); rr(ctx, R.x, y, R.w, R.h, Math.round(M.F * 0.6)); ctx.clip(); var gx = R.x - R.h + (R.w + R.h * 2) * sh, sg = ctx.createLinearGradient(gx - R.h, 0, gx + R.h, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,240,200,0.22)'); sg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = sg; ctx.fillRect(R.x, y, R.w, R.h); ctx.restore(); }
      }
      var icx = R.x + M.pad + S.icon / 2 + (M.cr ? 2 * M.k : 0), icy = y + R.h / 2;
      if (!M.cr) { var rg = ctx.createRadialGradient(icx, icy, 0, icx, icy, S.icon * 0.75); rg.addColorStop(0, rgba(col, 0.45)); rg.addColorStop(1, rgba(col, 0)); ctx.fillStyle = rg; ctx.fillRect(icx - S.icon, icy - S.icon, S.icon * 2, S.icon * 2); }
      drawIcon(ctx, t.id, icx, icy, S.icon, M);
      var tx = R.x + M.pad + S.icon + Math.round(M.gap * 1.5) + (M.cr ? 2 * M.k : 0), th1 = textH(M.fs), th2 = textH(M.fb), gapT = M.cr ? 2 * M.k : Math.round(M.F * 0.25), ty = y + Math.round((R.h - th1 - th2 - gapT) / 2);
      text(ctx, M.fs, lab, tx, ty, col, { role: 'toast', owner: 'toast', shadow: M.cr ? T.px.o : null });
      text(ctx, M.fb, t.text, tx, ty + th1 + gapT, T.text, { role: 'toast', owner: 'toast', shadow: M.cr ? T.px.o : 'rgba(0,0,0,0.4)' });
      ctx.restore();
      return { kind: 'toast', x: R.x, y: R.y + dy, w: R.w, h: R.h, alpha: a, spot: t.spot.name, recipe: t.rid, dimmed: dimmed };
    }
    function draw(ctx) {
      if (!ctx) return [];
      TEXTS = [];
      try {
        ST.draws++;
        try { var cv = ctx.canvas, v0 = V(); if (cv && cv.getBoundingClientRect && !(num(val(o.cssScale, null), 0) > 0)) { var b = cv.getBoundingClientRect(), T0 = ctx.getTransform(), lw = cv.width / Math.max(0.01, T0.a); if (b.width > 0 && lw > 0) cssCache = b.width / lw; } } catch (e) { }
        var M = metrics(), shownPanel = false;
        var openK = isOpen ? ease((clock - openT) / OPEN_MS) : clamp(1 - (clock - closeT) / CLOSE_MS, 0, 1);
        var out = [];
        if (isOpen || openK > 0) {
          var LL = layoutNow();
          var fadeIn = LL.from > -1e8 ? clamp((clock - LL.from) / XFADE, 0, 1) : 1;
          drawDim(ctx, LL, openK);
          if (prevL && clock < prevL.until) { var aOld = 1 - fadeIn; if (aOld > 0) drawPanel(ctx, prevL, openK * aOld, 0); }
          var slide = Math.round((1 - openK) * (LL.M.cr ? 4 * LL.M.k : LL.M.F * 0.6));
          var hotL = drawPanel(ctx, LL, openK * fadeIn, isOpen ? slide : 0);
          LL.hot = hotL; drawnKey = placeKey; shownPanel = true;
          out.push({ kind: 'window', x: LL.rect.x, y: LL.rect.y + (isOpen ? slide : 0), w: LL.rect.w, h: LL.rect.h, alpha: openK * fadeIn, mode: LL.A.mode, covers: LL.covers, sheet: LL.sheet });
        }
        var td = drawToast(ctx, M); if (td) out.push(td);
        drawnList = out.concat(TEXTS);
      } catch (e) { ST.drawErrors++; warn('draw', 'draw failed: ' + (e && e.message)); drawnList = []; }
      TEXTS = null;
      return drawnList;
    }

    /* ---------- state, save, checks ---------- */
    function state() {
      return { version: VERSION, t: Math.round(clock), open: isOpen, station: station, mode: mode, focus: focus, selected: RECIPES[sel] ? RECIPES[sel].id : null, pouchSel: pouchSel,
        bench: slots.map(function (s) { return s ? { id: s.id, n: s.n } : null; }), match: (function () { var r = mode === 'hand' ? benchMatch() : RECIPES[sel]; return r ? r.id : null; })(),
        work: work ? { recipe: work.rid, k: Math.round(work.t / Math.max(1, work.dur) * 100) / 100, discover: work.disc } : null,
        known: RECIPES.filter(function (r) { return known[r.id]; }).map(function (r) { return r.id; }), learned: log.slice(), crafted: JSON.parse(JSON.stringify(crafted)),
        msg: msg ? { kind: msg.kind, text: msg.text } : null, toast: toast ? { kind: toast.kind, recipe: toast.rid, spot: toast.spot.name, age: Math.round(clock - toast.t0) } : null, queued: toastQ.length,
        window: L && (isOpen || clock - closeT < CLOSE_MS) ? { x: L.rect.x, y: L.rect.y, w: L.rect.w, h: L.rect.h, mode: L.A.mode, covers: L.covers, sheet: L.sheet } : null,
        pouch: pouchList().map(function (id) { return { id: id, n: cnt(id), free: cnt(id) - reserved(id) }; }), errors: ST.errors + ST.cbErrors + ST.drawErrors };
    }
    function hash() { var s = Math.round(clock) + '|' + log.map(function (l) { return l.id + '@' + l.t + ':' + l.why; }).join(',') + '|' + Object.keys(crafted).sort().map(function (k) { return k + crafted[k]; }).join(','); return hstr(s).toString(16); }
    function save() { return { v: 1, known: Object.keys(known).filter(function (k) { return known[k].why !== 'known'; }), crafted: JSON.parse(JSON.stringify(crafted)) }; }
    function load(s) { if (!s) return false; (s.known || []).forEach(function (id) { if (RID[id] && !known[id]) known[id] = { t: Math.round(clock), why: 'loaded' }; }); crafted = {}; for (var k in (s.crafted || {})) crafted[k] = Math.max(0, Math.floor(num(s.crafted[k], 0))); return true; }
    function reset(opt) { if (opt && opt.forgetAnnounced) toastSeen = {}; clock = 0; isOpen = false; openT = closeT = -1e9; known = {}; isNew = {}; crafted = {}; log = []; events = []; sel = 0; focus = 'book'; pouchSel = 0; mode = 'recipe'; work = null; msg = null; pop = null; shakeT = -1e9; toastQ = []; toast = null; lastToastEnd = -1e9; L = null; prevL = null; placeKey = ''; learnStart(); benchRecipe(); }
    function rects() { var out = []; if (L && (isOpen || clock - closeT < CLOSE_MS)) out.push({ x: L.rect.x, y: L.rect.y, w: L.rect.w, h: L.rect.h, kind: 'window' }); if (toast && toast.spot) { var R = toastBox(toast); R.kind = 'toast'; out.push(R); } return out; }

    setParams(o.params); setItems(o.items); setRecipes(o.recipes); learnStart(); benchRecipe();
    if (!RECIPES.length) warn('recipes', 'no recipes given');
    if (!INV && !BAG) warn('inv', 'no inventory given: pass inventory {count, take, give} or a bag object');
    return {
      update: update, draw: draw, open: open, close: close, toggle: function (n) { return isOpen ? close() : open(n); }, isOpen: function () { return isOpen; }, busy: function () { return isOpen; },
      input: input, key: key, pointer: pointer, tap: function (x, y) { pointer('down', x, y); return pointer('up', x, y); },
      select: select, put: put, takeBack: takeBack, clearBench: clearBench,
      craft: function (rid) { if (rid != null) { if (!select(rid)) return false; } return startCraft(); }, tryMix: function (ids) { if (work) return false; mode = 'hand'; resetSlots(); for (var i = 0; i < (ids || []).length; i++) if (!put(ids[i])) return false; return startCraft(); },
      cancel: cancelWork, unlock: function (rid, why) { return learn(RID[rid], why || 'unlock'); }, knows: function (rid) { return !!known[rid]; }, canCraft: function (rid) { return craftable(RID[rid]); },
      recipes: function () { return RECIPES.map(function (r) { return { id: r.id, name: r.name, out: r.out.id, n: r.out.n, inputs: r.inputs.map(function (q) { return { id: q.id, n: q.n }; }), known: !!known[r.id], discover: r.discover.type }; }); },
      count: cnt, state: state, events: function () { return events.slice(); }, stats: function () { return JSON.parse(JSON.stringify(ST)); }, hash: hash,
      lastDrawn: function () { return drawnList.slice(); }, layout: function () { return L ? { view: L.view, rect: L.rect, mode: L.A.mode, covers: L.covers, sheet: L.sheet, onUI: L.onUI, css: L.M.css, k: L.M.k || 0, F: L.M.F || 0, avoid: L.avoid, ui: L.ui, margin: L.margin, minW: Math.min(arrange(L.M, 'wide', 1e9).W, arrange(L.M, 'tall', 1e9).W), sizes: { wide: arrange(L.M, 'wide', L.view.h - 2 * L.margin), tall: arrange(L.M, 'tall', L.view.h - 2 * L.margin) } } : null; },
      rect: function () { return L && isOpen ? { x: L.rect.x, y: L.rect.y, w: L.rect.w, h: L.rect.h } : null; }, rects: rects,
      save: save, load: load, reset: reset, setParams: setParams, params: function () { return JSON.parse(JSON.stringify(P)); }
    };
  }

  var API = { version: VERSION, create: create, defaults: DEFAULTS, icons: Object.keys(ICONS), renderIcon: renderIcon, guessIcon: guessIcon };
  root.GameDNA_CraftingRecipes = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : this);

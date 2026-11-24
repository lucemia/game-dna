# iso-height-map.js (B-04, module v1.0)

A plain script with no dependencies and no `export`. It defines one global, `window.GameDNA_IsoHeight`, and works pasted into a `<script>` tag or loaded with `<script src>`. It owns:

- the 2:1 isometric projection (32×16 diamonds, `step` px per height level), a camera that follows the cursor or a walking unit, 90° camera turns;
- **picking**: canvas px → tile, front-most first (unit sprites, then tile tops, then cliff faces);
- the block art: lit top, two shaded side faces with one band per height level, cliffs, stairs, animated water (procedural, cached per tile);
- **reach under the jump rule**: a step may climb at most `jump` levels and drop at most `jump + fall`; enemies block, allies pass;
- attack reach: Manhattan range, **+1 range per `hgRange` levels of height advantage** for ranged weapons (max range ≥ 2), melee only within `meleeH` levels;
- the **damage modifier** `damageMod`: height (± `hgDamage` % per `hgRange` levels, capped at 3 steps) × facing (front 1, side `side`, back `back`);
- **draw order**: tiles back to front, each unit drawn right after the deepest tile it touches, so taller blocks in front cover it; a covered unit gets an **x-ray outline**;
- the cursor sitting on the tile top, the facing picker, a hop-arc walk animator, and a **WT turn scheduler** with its order bar.

The game keeps its own map, units and rules. The module never changes a unit except through `setUnitPos` / `setFacing`.

## Options for `GameDNA_IsoHeight.create(options)`

| option | required | meaning |
|---|---|---|
| `cols`, `rows` | yes | grid size (grid x = column, y = row: the same coordinates the game already uses) |
| `height(x, y)` | yes | integer height level of the tile; `null` = no tile (hole) |
| `terrain(x, y)` | yes | `{kind, name?, stairs?, water?}` or just the kind. `kind`: `grass moss dirt road sand snow stone stairs rock wood water` (art only). `stairs`: facing 0–3 the steps go DOWN toward |
| `units()` | yes | every unit to draw (include dying units you still fade out) |
| `drawUnit(ctx, unit, fx, fy, info)` | yes | draw the unit with its **feet at (fx, fy)**. `info = {flip, back, facing, z, t, walking, water, xray}`: `flip` = mirror the sprite, `back` = show the back view, `xray` = drawing into the outline mask, an offscreen canvas (skip shadows and bars; a game whose draw code always paints on one global context draws just the sprite image into `ctx` here) |
| `posOf(unit)` | no | `{x, y}` tile; default `unit.x, unit.y` |
| `setUnitPos(unit, x, y)` | no | called on every tile of a `walk()` |
| `occupant(x, y)`, `alive(u)`, `idOf(u)` | no | defaults: search `units()`, `hp > 0`, `u.id` |
| `isEnemy(a, b)`, `team(u)` | no | default: different `side`/`team`; `team` returns `'a'` (player) or `'b'` |
| `moveOf(u)`, `jumpOf(u)`, `rangeOf(u)`, `waitOf(u)` | no | the unit's own stats; defaults `params.move`, `params.jump`, `params.range`, `params.wtBase` |
| `cost(x, y, unit)` | no | move cost per tile (≥ 99 impassable); default 1 |
| `facingOf(u)`, `setFacing(u, f)` | no | facing 0 = +x, 1 = +y, 2 = −x, 3 = −y; default `u.facing` |
| `drawPos(u)` | no | `{x, y[, z]}` fractional tile while the GAME animates the unit (lunge, its own walk); without `z` the module interpolates the height with a hop |
| `unitBox(u)` | no | sprite size `{w, h}` for picking and the outline (default 16×24) |
| `drawTile(ctx, x, y, sx, sy, tile)` | no | draw marks on a tile top, in painter's order (`sx, sy` = top vertex) |
| `drawPortrait(ctx, u, x, y, size)` | no | face in the WT bar |
| `getCursor()`, `onCursor(x, y)`, `cursorKeys` | no | two-way cursor sync; `getCursor()` returning `null` or `{hidden: true}` hides it. `cursorKeys: true` lets `key()` move the cursor in screen directions |
| `focus()` | no | `{x, y}` tile the camera should look at instead of the cursor |
| `isVisible(u)` | no | drawing only (fog of war) |
| `view` | no | `{x, y, w, h}` map viewport in the canvas (default: whole canvas) |
| `params` | no | see element.json: `jump fall hgRange hgDamage side back meleeH step tileW overlay xray rotate move range wtBase follow` |
| `skin` | no | GameDNA skin id/object for the UI plates (pixel16 built in) |

## Methods

| member | meaning |
|---|---|
| `update()` | once per 60 Hz step (also in `?t=&freeze=1` replays): animation clock, walks, camera |
| `draw(ctx)` | the whole map: tiles, range overlays, units (through `drawUnit`), x-ray outlines, cursor, facing arrows. Replaces the game's flat ground + unit loop |
| `drawUI(ctx, avoidRects)` | tile info plate (terrain, height) away from `avoidRects` and units; returns its rects |
| `drawOrder(ctx, x, y, n)` | WT order bar (n faces, current first); returns its rect |
| `getUIRects()` | rects drawn by the last `drawUI` / `drawOrder` (and the cursor) |
| `pick(px, py)` | canvas px → `{x, y[, unit]}` or `null` |
| `project(x, y[, z])` | tile → canvas px of its top centre (where feet stand) |
| `anchorOf(u)`, `feetOf(u)` | the drawn sprite box `{x, top, left, w, h, footY}` / feet point, canvas px |
| `heightAt(x, y)` | the height callback, cached nowhere |
| `canStep(u, ax, ay, bx, by)` | the jump rule for one step (use it inside the game's own path code) |
| `canHit(u, ax, ay, tx, ty)`, `rangeBonus(...)`, `attackFrom(u, x, y)` | attack rules from a tile; `attackFrom` returns a `Set` of tile keys |
| `damageMod(att, def[, ax, ay])` | `{mult, height, facing, side: 'front' \| 'side' \| 'back', dh, levels}`; multiply the game's damage by `mult` |
| `reachOf(u[, from])`, `pathTo(u, x, y[, from])` | **non-interactive**: `{move, stop, attack: Set<key>, cost: Map<key, {cost, prev}>}`, key = `y * cols + x`; path `[{x, y}]` or `null` |
| `showRange(u)`, `show({move, attack, target, path})`, `clear()` | overlays (blue reach, red attack, target diamond, path dots) |
| `walk(u, path, done, {frames})` | animate a move tile by tile with hops; sets facing per step; calls `setUnitPos` and `done()` |
| `chooseFacing(u, done)`, `cancelFacing()`, `choosingFacing` | the 4-arrow picker; arrows aim, A confirms (through `key` / `press`) |
| `setFacing`, `facingOf`, `facingToward(ax, ay, tx, ty)`, `bestFacing(u)` | facing helpers (AI / autoplay: `setFacing(u, bestFacing(u))`, no picker) |
| `key(code, down, isRepeat)` | returns **true only for keys it used**: arrows while picking a facing (or moving the cursor with `cursorKeys`), Z/X while picking, Q/E rotate |
| `press(name)` | the same by name: `up down left right a b rotl rotr` |
| `rotate(±1)`, `rot`, `cam`, `cursor`, `setCursor(x, y)`, `buzz()`, `setActive(u)` | camera and cursor control; the active unit always gets the outline |
| `wt.reset(units)`, `wt.next()`, `wt.end(u, {moved, acted})`, `wt.order(n)`, `wt.get(u)` | WT turns: lowest wait acts; ending costs `waitOf(u)` × 1 (moved and acted), ¾ (one), ½ (neither) |
| `invalidate()`, `setParams(p)`, `snapCamera()`, `stats()`, `lastDrawn()`, `isOccluded(u)` | after a height change; params; tests and probes |

**Autoplay / AI** keeps its own code: it may read `reachOf` / `pathTo` / `canHit` / `damageMod` and call `setFacing(u, bestFacing(u))`. It never opens the facing picker.

## Integration example (generic names)

```js
const iso = GameDNA_IsoHeight.create({
  cols: MAP_W, rows: MAP_H, params: { jump: 3, fall: 2, step: 4 }, view: { x: 0, y: 0, w: 256, h: 192 },
  height: (x, y) => heights[y][x], terrain: (x, y) => ({ kind: artKind(x, y) }),
  units: () => game.units, occupant: (x, y) => unitOnTile(x, y), jumpOf: u => u.jump || 3,
  drawUnit: (ctx, u, fx, fy, info) => { ctx.save(); ctx.translate(fx - u.px - 8, fy - u.py - 15); drawUnitSprite(u); ctx.restore(); },
  drawPos: u => u.animating ? { x: u.px / TILE, y: u.py / TILE } : null,
  getCursor: () => game.cursor, facingOf: u => u.facing, setFacing: (u, f) => { u.facing = f; }
});
// movement: in the game's own neighbour loop add   if (!iso.canStep(u, cx, cy, nx, ny)) continue;
// melee check: replace "adjacent" with iso.canHit(att, att.x, att.y, def.x, def.y); damage *= iso.damageMod(att, def).mult
function tick() { iso.update(); gameUpdate(); }
function render() { drawSky(); iso.draw(ctx); drawHud(); iso.drawUI(ctx, hudRects()); }
canvas.onpointerdown = e => { const t = iso.pick(toCanvasX(e), toCanvasY(e)); if (t) onTileTap(t.x, t.y); };
```

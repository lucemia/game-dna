# water-surface.js (E-18 module, v1.0.2)

One plain script, no dependencies, no `import`/`export`, ASCII only. It defines one global, `GameDNA_WaterSurface`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it.

It turns rectangles of a side-view level into **water with a springy surface**. Each pool's surface is a row of springs (a column every few px) joined by a wave term: whatever falls in throws a **crown of droplets** and a curved **splash sheet**, pushes the surface down under it and up to both sides, and the **waves run out to the banks, reflect and die down** (damped, clamped, fixed 1/120 s sub-steps: it never blows up). Bodies the game lists **splash when they enter** (tested along their path, so a fast arrow that crosses the surface between two frames still splashes), **drip when they leave**, and make a **bow wave and spray while wading**. **Floaters** (crates, barrels, a swimming creature) bob and tilt on the waves and stay on the surface. Under the line the module draws the water **over** what is already on the canvas: a translucent tint that deepens with depth (what is under water reads as under water), a wobbling **reflection** of the bank above, light shafts, foam, rising bubbles. An optional **waterfall** keeps feeding a pool with a churning foot, mist and spray. A gentle breeze (`ambient`) keeps calm water moving.

Two looks: **pixel** (for pixel-art games; `render: 'auto'` picks it when the context has `imageSmoothingEnabled === false`): banded colours with dithered steps, a 1 px highlight line, 1-2 px droplets, pixel foam flecks; **smooth** (HD): curved surface, gradient body, soft crown sheets, teardrop droplets with a highlight. Everything depends only on the seed, the call order and `update()` time (no `Math.random`, no wall clock), so `?t=<ms>&freeze=1` shows the same frame every run.

The module never moves your characters and never changes your rules: falling into a pit still does what it did. If you want swimming, slower movement or drowning, read `inWater(box)` / `depthAt(x, y)` and decide in your own code.

## API

`GameDNA_WaterSurface.create(options)` returns an instance.

| option | meaning |
|---|---|
| `pools` | `[{x, y, w, h, id?, floor?, palette?}]` in **world px**: `y` is the rest line of the surface, `h` the depth to the bottom. One pool per pit / pond / lake. `floor(x)` (optional) = the bed's y under x for a sloped lake bed, so the water is not drawn over the ground below it. |
| `bodies` | `() => [{id, x, y, w, h, kind?}]`: top-left boxes in world px of everything that can enter the water (hero, enemies, projectiles, thrown items). Called once per `update`. Give each a **stable `id`** (velocity and entry state are tracked per id). `kind: 'projectile'` makes a thin jet (also chosen for small fast bodies). |
| `falls` | `[{x, w, top, strength?}]`: waterfalls pouring from `y = top` into the pool under `x .. x + w`. Optional, and **only where a solid wall or ledge of the level sits above the pool**: `top` = that ledge's top edge, and the game draws a spout or lip there with its own tiles. A pit with nothing above it gets no waterfall (a fall that starts in mid-air reads as a blue pole). |
| `scale` | Effect size per world px, about `viewHeight / 360` (0.5 for a 180 px tall game, 1 for 360). Number or function. |
| `seed` | Integer. |
| `solid` | `(x, y) => boolean`: droplets that land on ground outside a pool vanish there (optional). |
| `params` | `spacing` 4 (px between springs x scale), `tension` 26, `spread` 150 (wave speed), `damping` 1.5, `viscosity` 0.25, `splash` 1, `droplets` 1, `maxAmp` 22 (px x scale; also <= 0.6 x depth), `clarity` 0.42 (alpha under the line), `depthAlpha` 0.86 (alpha at the bottom), `reflect` 0.3, `shafts` 1, `foam` 1, `bubbles` 1, `wake` 1, `gravity` 1, `ambient` 0.3 (breeze; 0 = still), `palette` `lake` \| `sea` \| `swamp` \| `cave`, `render` `auto` \| `pixel` \| `smooth`. |
| `onSplash(info)` | `{id, x, y, speed, w, kind, energy, pool}` after an entry splash. Optional (sound, damage numbers, a fish scare). |
| `onSound(name, info)` | `'splash'` \| `'exit'`. Optional. |

| method | |
|---|---|
| `update(dtMs)` | **Once per fixed step**, also under `?t=` fast-forward and autoplay. `update(0)` while the world is stopped (pause, hit-stop, menus): nothing moves. |
| `draw(ctx, camX, camY)` | **After your sprites, before the HUD.** World px minus `camX, camY` (pass `0, 0` inside your own camera transform; a fixed draw offset `OY` as `camY = -OY`). Draws the water over everything under the surface, then the surface, foam, splashes, droplets, waterfalls. Never throws. |
| `splash(x, speed, {w, id, kind})` | A splash at world x on the nearest pool's surface (an explosion at the water, a scripted dive). `speed` px/s. |
| `addFloater({id, x, w, h, y?, density?, vx?, vy?, tilt?, drift?})` → floater | A floating box (centre x, top y). Without `y` it starts at rest on the surface. `density` 0.08-0.95 = the share under water at rest (default 0.45). `tilt: 0` keeps it upright (pixel art, painted characters). Draw your sprite at `floater.x` (centre) / `floater.y` (top), rotated by `floater.angle` if you want. Floaters splash when they fall in, and run aground on a pool's `floor` in the shallows. |
| `removeFloater(id)`, `floaters()` | |
| `surfaceY(x)` → y \| null, `restY(x)`, `floorY(x)`, `depthAt(x, y)`, `inWater(box)` → 0..1, `poolAt(x, y)`, `pools()` | Queries for your own rules (slow down in water, drown, shadows only over ground). |
| `bubble(x, y, r)` | One rising bubble (a diver's breath). |
| `clear()` | Calm water, no particles, forget tracked bodies (new game / restart). Floaters stay. |
| `setParams(o)`, `params()`, `stats()`, `hash()`, `events()`, `energy()`, `maxAmp()` | Live params; counters `{splashes, entries, exits, projectiles, drops, bubbles, floaters, peakAmp, clamps, cbErrors, drawErrors, updErrors, badInput, ...}`; determinism hash; the last 64 events `{ev: 'splash' \| 'exit', id, x, y, t, speed, kind}`. |

## Integration example (generic)

```js
const water = GameDNA_WaterSurface.create({ seed: 1, scale: VIEW_H / 360,
  pools: PITS.map((p, i) => ({ id: 'pit' + i, x: p.x, y: p.waterY, w: p.w, h: LEVEL_BOTTOM - p.waterY })),   // world px
  bodies: () => [hero, ...enemies.filter(e => e.alive), ...projectiles]
    .map(b => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h })),          // top-left boxes, stable ids
  onSplash: info => playSound('splash', info.energy) });
const log = water.addFloater({ id: 'log1', x: PITS[0].x + 20, w: 24, h: 8, density: 0.5, tilt: 1 });

function fixedStep(dt) { /* ...your game update... */ water.update(paused ? 0 : dt); }
function render() {
  drawBackground(); drawTiles(); drawItems();
  drawSprite(LOG_ART, log.x, log.y, log.angle);    // floaters: your art at the module's pose
  drawEnemies(); drawHero();
  water.draw(ctx, camX, camY);                     // after the sprites: tints what is under the surface
  drawHud();
}
function newGame() { /* ...reset... */ water.clear(); }
```

## Wiring rules (the common mistakes)

- **Draw after the sprites** (and after anything that can be under water), before the HUD. Drawn before the sprites, nothing is ever under water and the reflection copies a frame without them.
- **Same space as your sprites.** Pools, bodies and `draw` share one world space. With a camera translate pass `0, 0`; with a fixed vertical draw offset (a HUD band) pass `camY = -offset`; never apply the camera twice.
- **Stable ids**, top-left boxes, every step. A new id each frame = no entry is ever seen (it is "first sight" every time: no splash).
- **`update` in the fixed step**, not in `render`, so `?t=` fast-forward and autoplay splash exactly like live play; `update(0)` while stopped.
- **Every caller still works**: autoplay, `?t=&freeze=1`, restart (`clear()`), title screens (no bodies, still drawn or skipped), keyboard shortcuts. The module never reads input.
- Pools are only water, not collision. Your game's pit / death / respawn rules stay as they are.

## Self-check without a browser

1. The script is included verbatim, before your game code, and `GameDNA_WaterSurface` is defined before `create`.
2. `create` runs after the level exists; pools sit inside pits or ponds (their `x, w` match the gap, `y` a few px below the banks).
3. `bodies()` returns boxes in the same world px as the pools, with ids that do not change between frames; no exceptions with an empty enemy list.
4. `update` is called once per fixed step (search for every caller of the step: live loop, `?t=` fast-forward, autoplay), `update(0)` while paused.
5. `draw` comes after the last sprite draw and before the HUD, with the camera passed once.
6. Restart / new game calls `clear()`.

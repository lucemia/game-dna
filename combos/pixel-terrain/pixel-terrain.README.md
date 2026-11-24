# pixel-terrain.js (E-17 module, v1.2.0)

One plain script, no dependencies, no `import`/`export`, ASCII only. It defines one global, `GameDNA_PixelTerrain`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it.

It turns a level's ground into a **bitmap mask** (one cell per world px by default) that explosions can carve. `blast(x, y, r)` removes a **jagged crater** of ground (a flat-floored bowl below the blast, so bodies and crates rest on its floor; above it the walls lean outward, so nobody is trapped under a lip), scorches a **dark rim** around the hole, throws **dirt** coloured like the ground it came from (some of it settles as **loose sand** where it lands, sliding down slopes), makes **thin overhangs, 1 px spikes, lone crumbs and any small piece the blast cut free fall**, and leaves **cooling embers** on the rim, with a billowing fireball and smoke. Protected cells (bedrock, a must-pass floor) only get soot.

Characters and items walk on the **new surface** and need **real support**: on ground a blast has changed, a body stands only when at least 60 % of its foot row has ground right under it and its centre is over that ground (or it is wedged between walls on both sides); otherwise it shuffles onto the ground (centre over it) or slips off the edge (centre past it) and falls. Give each body a box as wide as its drawn feet. Untouched level geometry keeps the game's own edge rules. They move through the module's collision helpers: `solid(x, y)`, `moveX` / `moveY` (pixel-exact, same contract as a typical platformer's move functions, with an optional step-up for crater slopes), `groundY`, `fall` (an item drops when the ground under it is carved), `resolve` (lift a body out of the ground) and `audit` (count bodies inside the ground: must stay 0).

The ground is drawn from **cached chunks**; a blast recomposes only the cells it changed (its dirty rect), so a blast costs about 1 ms and a frame only draws a few images. Two renders:
- **pixel** (for pixel-art games; `render: 'auto'` picks it when the context has `imageSmoothingEnabled === false`): one RGBA per cell, crater edges are pixel stairs with a 1 px darker outline, the scorch is dithered in 3 steps.
- **smooth** (for HD games): chunks at device resolution (up to `maxScale` device px per world px), crater edges are crisp vector outlines (marching squares; the original ground's outline follows your `solid` test exactly, so slopes are smooth), the scorch is a soft gradient, and carved soil below the original surface shows a dark **dug back wall** (`backWall`) instead of the sky, so holes read as dug earth.

The art is **your game's own ground** (`paint`), or a built-in painted ground (`art: 'meadow' | 'desert' | 'cave' | 'snow'`: grass lip, strata, pebbles, roots, stone for protected cells); in smooth render the built-in ground is generated at device resolution and can be filled from a painted texture you pass (`texture`), with a grass edge that follows the exact surface. Everything depends only on the seed, the call order and `update()` time (no `Math.random`, no wall clock), so `?t=<ms>&freeze=1` shows the same frame every run.

## API

`GameDNA_PixelTerrain.create(options)` returns an instance.

| option | meaning |
|---|---|
| `w`, `h` | Level size in **world px** (the whole level, not the screen). |
| `cell` | World px per mask cell (default 1). 2 halves the memory for very large HD levels. |
| `solid` | `(x, y) => boolean` in world px: the **initial** ground (your old tile test), sampled once per cell centre. Without it the ground is wherever `paint` draws opaque pixels. |
| `hard` | `(x, y) => boolean`: cells that never carve (bedrock, the floor under spawn, the goal). Also `protect(x, y, w, h)` later. |
| `paint` | `(g, x, y, w, h) => draw your level's ground into g in WORLD px` (g is already scaled and translated; draw every ground tile, or only those overlapping the rect `x, y, w, h`). Called once at create (1 px per cell, for the colours of the dirt and the pixel render) and once per chunk built in smooth render. Draw only ground, no characters or sky. |
| `art` | Built-in ground when there is no `paint`: `meadow` (default), `desert`, `cave`, `snow`. |
| `texture` | Optional image or canvas of painted soil for the built-in ground in smooth render (mirrored when it repeats; `params.textureScale` texture px per cell, default 1). |
| `outside` | `{left, right, top, bottom}`: what `solid()` returns outside the map (default left / right solid, top / bottom open). Match your game's old rule. |
| `keepOut` | `() => [{x, y, w, h}]` world boxes of characters and items: sand never settles inside them. Called when grains land. |
| `scale` | Effect size per world px, about `viewHeight / 360` (0.5 for a 180 px tall game, 1 for 360). Number or function. Grain speeds, gravity, smoke and embers scale with it. |
| `seed` | Integer. |
| `params` | `radius` 24 (default `r` of `blast`), `rim` 0.55 (scorched rim width / r), `scorch` 1 (0-1.5), `jag` 0.08 (edge irregularity / r), `debris` 1 (thrown dirt multiplier), `settle` 0.3 (chance a thrown grain settles as sand; 0 = blasts never add ground), `crumble` 1 (0 = overhangs never shed crumbs), `smoke` 1, `flash` 1, `embers` 1, `shake` 3 (px asked through `onShake`), `gravity` 1, `render` `auto` \| `pixel` \| `smooth`, `maxScale` 3, `chunk` 128 (cells), `maxChunks` 72, `minSupport` 0.6 (share of the foot row that must be on changed ground; 0 = off), `loose` 3000 (cells: free pieces up to this size fall), `backWall` 1 (smooth: dug back wall), `textureScale` 1. |
| `onBlast(info)` | After a blast: `{id, x, y, r, carved, hard, color}`. Optional. |
| `onShake(px, ms)` | A blast asks for a shake. Optional (or read `shake()`). |
| `onSound(name, info)` | `'blast'`. Optional. |

| method | |
|---|---|
| `blast(x, y, r, {rim, scorch, jag, dx, dy, hard, fx, shape, flare})` → info | Carve a jagged crater at world `(x, y)`, radius `r` px (default `params.radius x scale`): below the centre a bowl 0.8 r deep, above it walls flaring out (half width x (1 + `flare` 0.6 x height / r), up to 1.6 r); `shape: 'circle'` = a plain jagged circle (tunnels). Cells inside the shape at `r * (1 - jag)` always go, cells beyond it at `r * (1 + jag)` never; protected cells stay (soot only) unless `hard: true`. `dx, dy` (-1..1) push the thrown dirt. `fx: 0` = no fireball, smoke, dirt or embers (a silent dig). Returns `{carved: cells removed, ...}`. |
| `carve(x, y, r, opts)` | `blast` without effects and without crumbs (digging, tunnelling). |
| `solid(x, y)` → bool | Is there ground at world `(x, y)`. Use it as your game's wall / floor test. |
| `moveX(body, dx, {step, ground})` → `true` when blocked | Move a `{x, y, w, h}` box (top-left, world px) by `dx`, pixel-exact; when blocked it stands flush against the ground. `step` px (e.g. 3) lets a body that is `ground`ed walk up crater slopes and stay on the ground walking down them. Changes `body.x` (and `body.y` on a step). |
| `moveY(body, dy)` → `'floor'` \| `'ceiling'` \| `null` | Move vertically; on a hit the box stands exactly on the surface / under the ceiling. On ground a blast changed, without enough support (see above) it moves 1 px (onto the ground, or off the edge), still returns `'floor'` (the game keeps walking / jumping) and sets `body.slipping = true` for that step. A body whose centre is over ground and that is leaning on a wall (braced), or that no 1 px move would support better (wider than a crater floor), stands. |
| `groundY(x, y, maxDown)` → y or `null` | First ground surface at column `x` from `y` down. Use it to draw a ground shadow only when there is ground within 2-3 px under a body's centre. |
| `fall(item, dtMs, {gravity, maxFall})` → onGround | An item (`{x, y, w, h}`, keeps `vy` and `onGround` on it) that falls when the ground under it is carved and lands on the new surface. Call every step for crates, pickups that rest on the ground, corpses. |
| `overlaps(body)` → cells, `resolve(body, maxUp)` → px lifted (-1 = could not), `audit(bodies)` → count | Ground cells inside a box; lift a box out of the ground; how many boxes are inside the ground (must stay 0). |
| `protect(x, y, w, h)` | Make the ground in a world rect uncarvable (spawn, checkpoints, the goal's floor). Call after `create` and after every `clear()`. |
| `update(dtMs)` | **Once per fixed step** (also under `?t=` fast-forward and autoplay). `update(0)` while the world is stopped. Moves grains, smoke, embers; settles sand. |
| `draw(ctx, camX, camY)` | The ground (chunks) and the rim embers. Call where your game drew its ground tiles. World px minus `camX, camY`; pass `0, 0` inside your own camera transform. Reads the context's transform to pick the chunk resolution and to skip chunks off screen. Never throws. |
| `drawFx(ctx, camX, camY)` | Fireballs, smoke and flying dirt. After your sprites, before the HUD. |
| `shake()` → `{x, y}` | Current shake offset; add it to the camera translate, or ignore it. |
| `clear()` | Back to the original ground, no effects (new game / restart). Call `protect` again after it. |
| `setParams(o)`, `params()`, `stats()`, `hash()`, `maskHash()`, `events()`, `shapes()`, `cellAt(x, y)`, `size()` | Live params; counters `{blasts, carved, settled, crumbled, grains, puffs, embers, chunks, chunkBuilds, chunkPatches, lastBlastMs, lastPatchMs, cbErrors, drawErrors, badInput, ...}`; determinism hashes; the last blasts; the cell value (0 air, 1 ground, 2 protected, 3 sand). |

## Integration example (generic)

```js
const terrain = GameDNA_PixelTerrain.create({ w: COLS * TILE, h: ROWS * TILE, seed: 1, scale: VIEW_H / 360,
  solid: (x, y) => isGroundTile(Math.floor(x / TILE), Math.floor(y / TILE)),     // the game's OLD tile test, world px
  hard: (x, y) => y >= (ROWS - 1) * TILE,                                         // bottom row never carves
  paint: (g) => { for (const t of groundTiles) g.drawImage(tileImg(t), t.c * TILE, t.r * TILE); },
  outside: { left: true, right: true, top: false, bottom: false },
  keepOut: () => [hero, ...enemies, ...crates].map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h })) });
function newGame() { /* ... */ terrain.clear(); terrain.protect(spawn.x - 24, spawn.y - 8, 48, 24); }
function solidAt(x, y) { return terrain.solid(x, y); }                            // every old caller now sees the carved ground
function moveX(b, dx) { return terrain.moveX(b, dx, { step: 3, ground: b.onGround }); }
function moveY(b, dy) { return terrain.moveY(b, dy); }                            // 'floor' | 'ceiling' | null
function onFoeDefeated(e) { terrain.blast(e.x + e.w / 2, e.y + e.h, TILE * 0.8, { dy: -0.3 }); }
// end of the fixed step: crates.forEach(c => terrain.fall(c, STEP_MS)); terrain.update(running ? STEP_MS : 0);
// draw, inside the camera translate: terrain.draw(ctx, 0, 0) where the ground tiles were drawn; sprites; terrain.drawFx(ctx, 0, 0); HUD
```

## Common mistakes

| symptom | fix |
|---|---|
| Craters appear but characters walk over them on air | the game's movement still uses its old tile test or snaps to tile edges: route the wall test through `terrain.solid` and the snap through `terrain.moveX / moveY`. |
| Characters stop at every crater rim or sink into slopes | old tile snapping (`Math.floor(edge / TILE) * TILE`) left in a move function; use `moveX(b, dx, {step: 3, ground})`. |
| The old tiles still show over the holes | the ground tiles are still drawn: draw `terrain.draw` instead of them (keep platforms the terrain does not own). |
| Ground drawn shifted or doubled | camera passed twice (inside a translate and as `camX`); or a draw offset (`OY`) forgotten: pass it as `camY = -OY`. |
| Sand buries a character | `keepOut` missing; or call `resolve(body)` for a body after a step. |
| A walker treadmills against a crater wall | play walk frames only when `body.x` changed this step; let an AI that has not moved for 0.5 s jump toward its goal. |
| A shadow ellipse floats over a hole | draw it only when `groundY(centreX, footY, 2)` finds ground. |
| Holes stay after restart | `clear()` on new game, then `protect` again. |
| `?t=` still differs from play | `update` not called in the fast-forward loop, or called from the draw pass. |
| The level cannot be finished | blasts at spawn, under checkpoints or the goal: `protect` them, keep `r` under one tile for foes, keep the floor of pits `hard`. |

## Self-check without a browser

- The module file is byte-identical and loads before `create`; `create` runs after the level exists (its `solid` / `paint` read the level).
- Every old caller of the wall test (movement, AI edge checks, autoplay pit checks) now reads `terrain.solid`; no tile snapping left in move functions.
- `update` is called exactly once per fixed step everywhere the step runs; `update(0)` while stopped; never from the draw pass.
- `draw` replaces the ground tile drawing (camera applied once); `drawFx` after sprites, before the HUD.
- `clear()` + `protect()` on every new game; blasts only at events that happen once (a defeat, an impact), not every frame.

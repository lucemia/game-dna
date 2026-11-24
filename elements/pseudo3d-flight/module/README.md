# pseudo3d-flight.js (B-06, module v1.0)

A plain script with no dependencies and no `export`. It defines one global, `window.GameDNA_Flight`, and works pasted into a `<script>` tag or loaded with `<script src>`. It owns the whole flight mode of a top-down game:

- the **ground**: the game's own tile map, baked once into a mip-mapped texture and drawn per pixel into an offscreen `ImageData` as a perspective, scanline-scaled plane (one scale per screen row), with distance fog and a bright horizon line;
- the **sky band** above the horizon (gradient, distant ridges, sun, drifting cumulus), turning with the heading;
- **billboards** (mountains, trees, towns, towers, rocks, clouds built in, or the game's own sprites) scaled by distance and depth-sorted, the mount drawn between the far and the near ones;
- the **mount** (a bird or a glider seen from behind, 4 wing frames x 5 bank poses) and its **shadow** on the ground;
- the **flight controller**: turn, bank (the horizon tilts by `bank` degrees), accelerate, slow down, world wrap or soft edges, one fixed 60 Hz step, no randomness;
- **take-off and landing transitions** (`transition` ms, default 600): the first frame of take-off and the last frame of landing are exactly the game's top-down walking view (same camera, north up); in between the ground zooms, rotates to the heading and tilts up to the horizon;
- **landing only where `canLand(tx, ty)` is true** (green corner marks on the tile under the shadow; a refused landing shakes the prompt);
- a **mini-map**, the landing prompt and a speed gauge, drawn through `GameDNA_Skin` when `skin-api.js` is loaded (pixel16 look built in otherwise).

The game keeps its own hero, walking code, camera, HUD and autopilot. While the module is busy (take-off, flight, landing) it draws the whole map view and the game skips its walking update.

Performance: about 3 ms per frame at 256x224 in headless Chrome (one division per pixel, no allocation per frame); the first frame also bakes the texture (about 20 ms for a 64x64-tile map).

## Options for `GameDNA_Flight.create(options)`

| option | required | meaning |
|---|---|---|
| `cols`, `rows`, `tile` | yes (tile defaults to 16) | the tile map size; world px = `cols * tile` by `rows * tile` |
| `tileAt(tx, ty)` | yes | the tile id (any value) at a tile |
| `tileImage(id, tx, ty)` | one of these two | a canvas or image (`tile` x `tile`) of that tile, usually the very art the game draws: the flight ground then looks like the walking map |
| `tileColor(id, tx, ty)` | | `'#rrggbb'`, `[r, g, b]` or `0xRRGGBB`; flat colour with a little texture noise |
| `canLand(tx, ty)` | yes | true only for flat, walkable, free tiles (grass, sand, road); never water, walls, trees, buildings or tiles with people or objects. Tiles outside the map are always refused |
| `topdown()` | yes | the walking camera: `{x, y}` = world px shown at the top-left of `view`. Read on every transition frame, so it must already follow the hero placed in `onLand` |
| `view` | no | `{x, y, w, h}` (or a function): the map viewport inside the canvas, e.g. below a HUD band. Default: the whole canvas |
| `wrap` | no | `true` (default): the world wraps on both axes. `false`: outside the map the ground shows `outsideTile` (a tile id drawn with `tileImage`) or the colour `outside`, and the mount turns back two tiles past the edge |
| `billboards` | no | array or function (called every drawn frame: cache a static list): `[{x, y, kind, size, alt, img, id}]`. One per object, not per tile (a 4-tile house is one `town`). `x, y` = world px of the foot; `kind` = `mountain`, `peak`, `tree`, `pine`, `town`, `tower`, `rock`, `cloud` (built-in art) unless `img` (a canvas) is given; `size` = height in world px (defaults 34, 42, 22, 24, 30, 40, 10, 18); `alt` = height above the ground (flying things) |
| `markers()` | no | mini-map points `[{x, y, color, blink}]` in world px (goals, towns) |
| `params` | no | `{speed, turn, bank, height, horizon, transition, fog, sky, mount, minimap}` (table below) |
| `skin` | no | a `GameDNA_Skin` id or object for the UI windows |
| `keys` | no | `{KeyboardEvent.code: 'left' \| 'right' \| 'up' \| 'down' \| 'land'}`; default arrows / WASD, Z / Space / Enter = land |
| `ui` | no | `false`, or a function returning `false`, hides the mini-map, landing prompt and speed gauge (title screens, cutscenes); default shown |
| `inset` | no | `{top, right, bottom, left}` px to keep the mini-map, prompt and gauge clear of the game's HUD |
| `landLabel` | no | the key name shown in the prompt (default `Z`) |
| `drawMount(ctx, x, y, info)` | no | draw your own mount instead (x, y = its centre; `info = {frame, bank, scale, phase, t}`) |
| `drawWorld(ctx, project)` | no | extra drawing inside the flight view, after billboards; `project(wx, wy, wz)` -> `{x, y, s, z}` canvas px or `null` |
| `onTakeOff(at)`, `onPhase(phase)` | no | notifications (`phase`: `rising`, `flying`, `landing`, `walk`) |
| `onLand({tx, ty, x, y})` | yes in practice | landing **starts** at that tile (x, y = its centre). Put the hero there now and update your camera the way your walking code does; walking resumes when `busy()` turns false |
| `onLanded(L)`, `onLandDenied({tx, ty})` | no | the transition finished / a landing was refused |

**Geometry:** in a view `h` px tall the horizon row is `round(h * horizon)` and the mount's ground row is `max(horizon row + 24, round(h * 0.74))`; a screen pixel there covers `height / (ground row - horizon row)` world px.

**Parameters** (`params`, also `setParams`): `speed` cruise world px/s (72; 30-200), `turn` deg/s (100), `bank` deg of horizon tilt (5; 0-12), `height` camera height in world px (56), `horizon` fraction of the view height (0.3), `transition` ms (600), `fog` 0-1 (0.6), `sky` `day` | `dusk`, `mount` `bird` | `glider`, `minimap` `on` | `off`. Up = x1.6 speed, down = x0.55.

## Methods and state

| member | meaning |
|---|---|
| `update()` | one fixed 1/60 s step. Call it every step (also while walking: it is cheap and keeps state consistent). Skip it only during a hit-stop |
| `draw(ctx)` | draws the whole view while busy and returns `true`; returns `false` while walking, so: `if (!fl.draw(ctx)) drawWalkingMap();` then the HUD |
| `takeOff({x, y, facing, instant})` | hero's world px (centre of the feet) and facing (`up/down/left/right` or radians, 0 = north). Returns false if already busy. `instant: true` starts in the air (title screens) |
| `land()` | the land button: lands if the tile under the mount passes `canLand`, else refuses (prompt shakes, `onLandDenied`) |
| `key(code, down)` | feed `keydown` / `keyup`; returns **true only while busy and only for its keys**, so walking keys and shortcuts still reach the game while walking |
| `press(name)`, `release(name)`, `setInput({left, right, up, down, land})` | the same with names (touch buttons), or a whole input object polled by the game each step (`land` is consumed once). `setInput(null)` clears it |
| `autopilot({x, y, land, radius})` / `autopilot(null)` | fly to a world point and land on flat ground within `radius` (20) px; `land: false` just tours. `steer(x, y)` returns the input it would use, without changing anything |
| `reset()` | back to walking at once (new game, restart) |
| `busy()` | `true` from take-off to the last landing frame: skip walking updates, enemy touches and interactions meanwhile |
| `canLandHere()` | flying over a tile `canLand` accepts |
| `anchor()`, `mountRect()` | the mount sprite as drawn last frame, canvas px: `{x (centre), top, w, h, footY (its shadow)}` / `{x, y, w, h}`; `null` while walking |
| `project(wx, wy, wz)` | world -> canvas px in the current view, or `null` |
| `getUIRects()` | `[{x, y, w, h, kind}]` of the mini-map, prompt and gauge from the last draw (canvas px) |
| `billboardRects()` | billboards drawn last frame `[{id, kind, x, y, w, h}]` |
| `rebake()` | call after the tile map changes (the texture is baked on the first take-off) |
| `setParams(p)` | change parameters live |
| `phase`, `progress` (0 walking .. 1 flying), `x`, `y`, `heading`, `speed`, `roll`, `altitude`, `tile`, `params`, `stats` (`{draws, lastMs, avgMs, maxMs}`), `autopiloting`, `world` | read-only state |

## Integration example (generic names)

```js
const fl = GameDNA_Flight.create({
  cols: MAP_W, rows: MAP_H, tile: TILE, wrap: false, outsideTile: BORDER_TILE, view: { x: 0, y: HUD_H, w: SCREEN_W, h: SCREEN_H - HUD_H },
  tileAt: (x, y) => map[y][x], tileImage: (id, x, y) => tileSprite(id, x, y), canLand: (x, y) => isFlatWalkable(x, y) && !thingAt(x, y),
  topdown: () => ({ x: camera.x, y: camera.y }),
  billboards: treeAndHouseTiles.map(t => ({ x: t.x * TILE + 8, y: t.y * TILE + 14, kind: t.kind })),
  markers: () => [{ x: goal.x, y: goal.y, color: '#ffe070', blink: true }],
  onLand: L => { hero.x = L.x - hero.w / 2; hero.y = L.y - hero.h / 2; updateCameraLikeWalking(); }
});
addEventListener('keydown', e => { if (fl.key(e.code, true)) { e.preventDefault(); return; } if (e.code === 'KeyF' && !fl.busy()) fl.takeOff({ x: hero.cx, y: hero.cy, facing: hero.face }); /* game keys */ });
addEventListener('keyup', e => fl.key(e.code, false));
function step() { fl.update(); if (fl.busy()) return; walkingUpdate(); }          // a fixed 60 Hz step
function render() { if (!fl.draw(ctx)) drawWalkingMap(); drawHud(); }
```

Autoplay: keep the game's own autopilot walking as before (never fly from it unless asked); `?t=<ms>&freeze=1` stays deterministic because the module only moves inside `update()`.

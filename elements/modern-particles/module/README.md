# modern-particles.js (E-11 module, v1.0)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_Particles`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It is a general particle engine: a preallocated pool of thousands of particles, emitter shapes, size / alpha / colour curves over each particle's life, additive glow, gravity, drag, wind, ground bounce, orbiting motion, and nine presets. Your game keeps its own state; it only tells the module **where** and **when** something happens. The module never reads input and never changes game state.

Determinism: a particle's motion depends only on the `seed`, the order of `emit` / `start` calls and the time passed to `update()`. No `Math.random`, no wall clock, no frame rate. Call `emit` / `start` from your fixed update step (where the event happens), never from the draw pass, and `?t=&freeze=1` stills match live play.

## API

`GameDNA_Particles.create(options)` returns an instance.

| option | meaning |
|---|---|
| `view` | Screen rect `{x, y, w, h}` in **logical canvas px** (your game's coordinates before any devicePixelRatio scaling) that particles may cover; usually the whole canvas `{x: 0, y: 0, w: W, h: H}`. Also sets the size unit: `scale` auto = `view.h / 180` (1 on a 320×180 field, 2 on 640×360). |
| `seed` | Integer. Same seed + same calls = same pixels. |
| `params` | See the table below. |
| `ground(x, y)` | Optional, **world** px (the same coordinates you pass to `emit`): the top y of the first solid surface at or below `(x, y)`, or `null` (a pit). Bouncing particles (sparks, fountain drops) land on it. Called at most once per 2×8 px cell per update; must not throw (it is guarded). |
| `uiRects()` | Optional, **screen** px: HUD panels, message boxes, banners. Particles are clipped out of them (one `evenodd` clip per draw), so they never cover text. |
| `skin` | Optional `GameDNA_Skin` id or object: a pixel skin selects the crisp renderer. Without it the module draws its own look. |

| param | default | range | meaning |
|---|---|---|---|
| `budget` | 2000 | 64–16000 | Pool size. When full, new particles recycle old ones in a fixed rotation (never grows, never allocates). |
| `density` | 1 | 0–4 | Multiplies every count and rate (a quality setting). |
| `scale` | 0 (auto) | 0–8 | Size unit for every preset's px and px/s. 0 = `view.h / 180`. Fixed at the first emit. |
| `render` | auto | auto, smooth, crisp | smooth = tinted soft sprites (HD); crisp = whole-pixel squares, 4 alpha steps, pixel trails (native pixel canvases). auto = crisp when drawing 1:1 on a canvas ≤ 512 px wide. |
| `glow` | auto | auto, on, off | Additive blending for light-like layers. `auto` samples the frame under the particles (first draw, then every 30th; a 16×9 read) and draws them with normal blending plus a darker, wider underlay when the picture is bright (mean luma > 0.55), where additive light would wash out to white. It only picks the blend mode, never motion. |
| `gravity` | 1 | 0–4 | Multiplies every layer's gravity. |
| `wind` | 0 | ±400 px/s | Sideways push on layers that take wind (smoke, embers, flame). |
| `bounce` | 1 | 0–2 | Multiplies restitution; 0 = nothing bounces. |

| method | |
|---|---|
| `emit(preset, x, y, opts?)` | One-shot, world px. Returns how many particles were spawned. |
| `start(preset, x, y, opts?)` | Continuous emitter; returns a handle: `move(x, y)`, `set(opts)`, `stop()` (stops emitting; live particles finish), `kill()`, `alive()`. Max 64 running; more replaces the oldest and warns once (a `start` inside a per-frame loop). |
| `update(dtMs)` | Advance by game time. Call from the fixed step; skip it or pass 0 while paused / in hit-stop. |
| `draw(ctx, offsetX = 0, offsetY = 0, layer?)` | Screen space, after sprites, before the HUD. `offset` = `-camera` for scrolling worlds (plus any constant field offset). Any canvas transform (devicePixelRatio) is kept. `layer` `'back'` / `'front'` draws only that layer (smoke is `back`); omit to draw all. |
| `clear()` | Removes every particle and emitter (level start, restart). |
| `stopAll()`, `define(name, layers)`, `setParams(p)`, `params()`, `presets()`, `stats()`, `signature()`, `view()`, `count()`, `time()` | `stats()` = `{live, budget, peak, emitters, emits, starts, stolen, emitterSteals, badPos, errors, drawn, crisp, scale, updateMs, drawMs, ...}`. `signature()` = a short hash of all live particles (determinism tests). |

**`opts`** (all optional): `amount` (count / rate multiplier), `color` (a palette name: `fire gold ice arcane poison heal shock water smoke soot dust blood leaf`, one hex colour, or an array of stops birth → death), `angle` (degrees, -90 = up), `spread` (degrees), `speed`, `size`, `life` (multipliers), `facing` (`-1` mirrors sideways motion: sparks fly away from the attacker), `dir: 'out'` (launch along the shape's outward normal), `vx`, `vy` (add the source's velocity, px/s), `floor` (a flat ground y for this emission, instead of `ground`), `shape` (below). `start` also takes `follow: () => ({x, y})` (called every update; return `null` to stop) and `duration` (ms).

**Emitter shapes** (`opts.shape`; rect and outline are centred on `(x, y)` when `x`/`y` are left out): `{type: 'point'}` · `{type: 'line', dx, dy}` (or `x2, y2`) · `{type: 'circle', r, edge: false}` (filled disc; edge is the default) · `{type: 'rect', w, h, edge: true}` · `{type: 'outline', image, w, h, flipX}`: points on the visible edge of a sprite image or canvas (its alpha), drawn at `w × h`; falls back to an ellipse when the image is missing or not readable.

**Presets**

| preset | looks like | use for |
|---|---|---|
| `burst` | flash, shock ring, streak sparks, glowing embers, a little smoke | defeats, explosions, spell impacts, breaking objects |
| `sparks` | fast streaks that fall, bounce and skid on the ground | sword/metal hits, grinding, a forge |
| `fountain` | upward cone of glowing drops that fall back and bounce | fountains, geysers, healing springs, loot showers |
| `smoke` | soft growing puffs, rising, wind-blown (`back` layer) | chimneys, torches, burning wrecks, after a blast |
| `swirl` | motes and twinkles orbiting upward around a point | magic, portals, buffs, respawn, charging |
| `dust` | soft puffs kicked sideways along the ground | landings, jumps, dashes, footsteps, heavy steps |
| `pickup` | star twinkles thrown out in a ring plus rising motes | coins, items, keys, checkpoints |
| `embers` | slow rising flickering motes | fires, lava, after a blast |
| `aura` | wisps rising off a shape's outline | power-ups, healing, invincibility, a selected unit |

Custom presets: `define('flame', [{count, rate, shape, blend, life, speed, angle, spread, drag, gravity, wind, bounce, friction, size, sizeCurve, alphaCurve, color, spin, twinkle, stretch, orbit, out, layer}])`. Shapes: `glow dot streak puff star ring square`; `blend: 'add' | 'normal'`; ranges are `[min, max]`; curves are `[v0, v1, …]` evenly over life.

## Integration (15 lines)

```js
// <script src="modern-particles.js"></script> before your game script
const fx = GameDNA_Particles.create({
  seed: 1, view: { x: 0, y: 0, w: VIEW_W, h: VIEW_H },                      // logical canvas px
  ground: (x, y) => firstSolidTopAtOrBelow(x, y),                           // world px, null over pits (optional)
  uiRects: () => [hudRect, messageBoxRect]                                  // screen px (optional)
});
let torch = null;
function startLevel() { fx.clear(); torch = fx.start('smoke', torchX, torchY); } // ambient sources: once, keep the handle
function onHitAccepted(target, from) { fx.emit('sparks', hitX, hitY, { facing: from.x < target.x ? 1 : -1 }); }
function onDefeat(e) { fx.emit('burst', e.cx, e.cy); }
function onPickup(item) { fx.emit('pickup', item.x, item.y); }
function onLand(p) { fx.emit('dust', p.cx, p.feetY, { floor: p.feetY }); }
function step(dtMs) { /* game logic, which calls the emits above */ fx.update(paused ? 0 : dtMs); }
function render() { drawWorld(); fx.draw(ctx, -camX, -camY); drawHud(); }
```

## Keep the game working

- Emit only where the game event is decided (in the fixed step), once per event; never inside the draw pass, never per frame for a one-shot.
- `start` ambient emitters once (level start), keep the handle; never call `start` every frame.
- `update` runs in every scene with the same step the game uses, including the `?t=` fast-forward loop; particles then finish fading on result screens.
- Do not change game logic, input, RNG or timing: autoplay (`?auto=1`) must end the same way as before.

## Performance

Headless Chromium 1.65 (software raster, no GPU), 2000 live particles (demo `?stress=1`), median of 3 runs, draw timed with a forced raster flush (2026-11-16):

| viewport | backing store | update | draw |
|---|---|---|---|
| 390 px phone, dpr 3, smooth | 1056×594 | 0.07 ms | 6.4 ms |
| 390 px phone, dpr 3, crisp | 1056×594 | 0.06 ms | 3.0 ms |
| 390 px phone, dpr 2, smooth | 704×396 | 0.05 ms | 4.2 ms |
| 1280 px desktop, dpr 1 | 870×489 | 0.07 ms | 5.0 ms |
| 1280 px desktop, dpr 2 | 1740×979 | 0.05 ms | 12.6 ms |

Draw cost is fill rate (big soft sprites), so it scales with the backing store; on a large HiDPI canvas lower `density` or `budget`. A GPU-backed browser canvas is usually faster than these software numbers.

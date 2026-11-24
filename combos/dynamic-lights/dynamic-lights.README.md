# dynamic-lights.js (J-01 module, v1.1)

One plain script with no dependencies and no `import`/`export`. It defines one global, `GameDNA_Lights`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. **It needs I-08 `webgl-post.js` (global `GameDNA_Post`) loaded before it.**

It adds **real-time 2D lighting** to a game that draws on an ordinary 2D canvas: point lights and spotlights with soft falloff, colour and flicker; lights that ride on actors (a torch on the hero, glowing projectiles); short flashes (explosions, spells); and **soft shadows** cast by the game's walls and obstacles. The game keeps drawing exactly as before. Every post frame the module paints a small **light map** on a 2D canvas (lights, cones, shadow polygons from the occluders the game supplies, several samples per light for a soft penumbra) and composites it in an I-08 pass at order 200 (`lights-blur-h`, `lights-blur-v`, `lights`):

`out = picture × (ambient × tint + light)` (above 1 only a soft `over` headroom, so bright art never blows out) `+ glow × (1 − ambient) × light²`, then I-08's own grade and pulse.

**HUD pixels stay unlit.** Pass `uiRects` (canvas px) and the module rasterises them into the shared `uiMask` input; there the pass outputs the incoming pixel unchanged. Any J element (or the game) can also provide `post.setInput('uiMask', canvas)` itself (white = UI).

**Without WebGL nothing changes.** If WebGL is missing, the URL has `?webgl=0` or `?lights=0`, or `webgl-post.js` is not loaded, the instance is inactive: `add`, `flash`, `render`... still work (lights are tracked, nothing is drawn) and the 2D canvas shows exactly as before. **No method ever throws.** Lighting reads only the game clock and game state, never game logic: `?auto=1` ends the same with lights on and off.

## API

`GameDNA_Lights.create(options) → lights`

| option | meaning |
|---|---|
| `canvas` | The game's canvas (or a selector or its 2D context). Required unless `post` is given. |
| `post` | Optional: the game's `GameDNA_Post` instance. Without it the module shares the live instance on the same canvas, or creates its own (built-in passes off). Create I-08 first and pass it here, so there is one overlay. |
| `clock` | `() => gameMs`, step-counted (flicker, flashes, fades). Never `Date.now()`. |
| `camera` | `() => ({x, y})`: the **world** point drawn at canvas pixel (0, 0). If the play field is drawn with an extra offset (`translate(ox, oy)` for a HUD strip), return `{x: camX - ox, y: camY - oy}`. Default `{0, 0}`. |
| `solidAt`, `tile` | Occluders from a tile map: `solidAt(tx, ty) → true` for tiles that block light (walls, trees, houses, platforms; not water or floor), in **world tiles** of `tile` px (or `{w, h}`). Called for the tiles on screen plus the light reach, every frame. |
| `rects` | Occluders as rectangles: `() => [{x, y, w, h}]` in world px (`screen: true` on a rect = canvas px). Pillars, crates, doors, big actors. Both may be given. |
| `uiRects` | `() => [{x, y, w, h, r?, soft?}]` in **canvas** px: HUD plates, text boxes, menus, banners. Those pixels are left unlit. `r` = corner radius; `soft` = px over which the mask fades out *outside* the rect (default 0 = hard edge), for panels that have a soft shadow or glow edge. See "What to put in uiRects". |
| `when` | `() => bool`: lighting applies only while true (e.g. play / map screens, not title or a separate battle screen). Turning true fades in over `fade` ms; turning false is immediate (no old lights over the next screen). Keep a win / lose box drawn over the world inside `when()`, or the scene jumps to the plain picture behind it. |
| `params` | See below. |
| `lights` | Optional initial list of light definitions. |

**params:** `ambient` 0.55 (0 black … 1 unlit picture where no light reaches); `tint` 'dusk' \| 'night' \| 'cave' \| 'warm' \| 'neutral' \| '#rrggbb'; `intensity` 1 (all lights); `radius` 0 (default light radius, 0 = 35 % of the shorter canvas side); `color` '#ffc58a' (default light colour); `shadows` 'on' \| 'off'; `softness` 5 (area-light radius in canvas px: penumbra width); `samples` 3 (1 hard … 5 smooth); `wallLight` 4 (px the light enters an occluder: lit wall faces and platform tops; set it to your wall-face height); `blur` 1.5 (canvas px); `glow` 0.35 (× (1 − ambient), so it fades on day scenes); `over` 0.25 (headroom above the art's own colour where lights add up: 0 = a lit pixel is never brighter than drawn; 0.5–0.7 for dark scenes drawn in mid-tones); `bands` 0 (3–8 = banded light per game pixel, retro); `bandPx` 1 (banded light: cell size in canvas px; 2–4 gives chunky steps instead of contour rings on an HD canvas); `emissive` 0 (luma threshold above which pixels keep their own brightness, e.g. 0.85 for lava); `fade` 300; `maxLights` 32; `mapScale` 0 (auto: longest side ≤ 400 px); `farLight` 0.2 (share of light that reaches pixels marked far by `markFar()`).

**Ambient guide:** dungeon / cave 0.12–0.2, night 0.25–0.35, dusk 0.5–0.6 (default), bright day level 0.85–0.95 (lights become accents).

**A light** (`add(def)`, all optional except a position):

| key | |
|---|---|
| `id` | Your id (string or number). `add` with an existing id updates it. Default `L1`, `L2`… |
| `x`, `y` | World px (or canvas px with `screen: true`). |
| `follow` | `() => actor` or the actor object itself: read every frame; `{x, y}` or `{x, y, w, h}` (the centre is used). Return `null` (or an object with `dead: true` / `alive: false`) when the actor is gone: the light is removed (kept but hidden with `keep: true`). A bad value (NaN, a throw) keeps the last position for 30 frames, then hides; it never jumps to the screen centre. |
| `offset` | `{x, y}` or `() => ({x, y})`: added to the position (torch in the hand, above the head). |
| `radius` | px. Default `params.radius`. |
| `color` | '#rrggbb'. Default `params.color`. |
| `intensity` | 0–2, default 1. |
| `flicker` | 0–1 (0.15 lantern, 0.3 torch, 0.4 brazier); `speed` 1. Deterministic from the game clock and the light's id. |
| `cone` | Spotlight: `{dir, width, soft}`: `dir` radians (0 = right, π/2 = down), `'left'` \| `'right'` \| `'up'` \| `'down'`, `{x, y}` or a function; `width` full angle (rad, default 0.9); `soft` edge (rad, 0.25). |
| `shadows` | false = this light ignores occluders (cheap fill lights). |
| `on` | false = hidden. |

| method | |
|---|---|
| `add(def) → id` | Add (or update, same id) a light. |
| `set(id, patch)` | Change any key (e.g. `{x, y}`, `{intensity}`, `{cone: {...}}`, `{on: false}`). |
| `remove(id)`, `clear()`, `clear('flashes')` | |
| `flash(def) → id` | A short light that fades out: `def` as a light plus `ms` (default 260; game time) and optional `start` (game ms it began). Intensity × (1 − age)². Explosions, spell casts, impacts, muzzle flashes. `x, y` are **world** px like every light, and a flash only shows while `when()` is true: hits on a separate battle screen that `when()` excludes stay unlit (use `screen: true` and canvas px, and include that screen in `when()`, if you want them lit). |
| `get(id)`, `list()` | `{id, x, y (canvas px, last frame), radius, drawnRadius, on, follow, color, intensity, flicker, cone, flash, level}`. |
| `render(arg?)` | Calls `post.render(arg)`. Once per drawn frame on every draw path (if the game already calls `post.render()` everywhere, that is enough, except with `markFar()`, which needs `lights.render()`). |
| `markFar()` | Optional, for side-scrollers and parallax: call it in the draw right after the sky and parallax layers, before tiles and actors. Pixels still unchanged at `render()` are "far": they keep the ambient darkening but get only `farLight` × the light, so a torch or coin does not paint a pool on the sky. Valid for that frame only; a draw path that does not call it (title) is all near. Costs one canvas copy and upload per frame. |
| `renderNow()` | Synchronous, for tests. |
| `setParams(o)`, `params()`, `setEnabled(on)` | Live parameters; `setEnabled(false)` = plain picture (fades). |
| `stats()` | `{mode, active, reason, lights, drawn, culled, flashes, followers, edges, builds, buildMs, avgBuildMs, fade, on, map, meanLight, ambient, errors}`. `meanLight` = ambient + mean light, on a coarse grid. |
| `lightMap()` | The light map canvas (half range: 128 = light 1.0). |
| `destroy()` | Remove the passes (and its own post instance). |
| `active`, `mode`, `reason`, `post` | `active` false = nothing drawn (`reason`: 'no-webgl', 'url', 'option', 'no-post-module', 'no-canvas'). |

## Integration (15 lines)

```js
// <script src="webgl-post.js"></script><script src="dynamic-lights.js"></script> before your game script
const post = GameDNA_Post.create({ canvas: gameCanvas, clock: () => frameCount * 1000 / 60 });   // skip if the game has one
const lights = GameDNA_Lights.create({
  canvas: gameCanvas, post, clock: () => frameCount * 1000 / 60,
  camera: () => ({ x: camX - fieldX, y: camY - fieldY }),          // world point at canvas (0, 0)
  solidAt: (tx, ty) => blocksLight(tileAt(tx, ty)), tile: TILE,     // walls, trees, platforms
  uiRects: () => hudRects,                                          // canvas px, stay unlit
  when: () => scene === 'play',
  params: { ambient: 0.55, tint: 'dusk', shadows: 'on', softness: 5, glow: 0.35 }
});
lights.add({ id: 'hero-torch', follow: () => player, offset: { x: 0, y: -6 }, radius: 90, color: '#ffb066', flicker: 0.25 });
// level start: lights.clear(); then add the level's lamps: lights.add({ x, y, radius: 70, color: '#ff9a4a', flicker: 0.35 })
// projectile spawned: lights.add({ follow: () => shot.alive ? shot : null, radius: 50, color: '#ff7a2a' })
// explosion / hit: lights.flash({ x, y, radius: 80, color: '#ffae5a', ms: 300 })
function draw() { /* ...existing drawing, unchanged... */ lights.render(); }      // every draw path
```

## What to put in uiRects

- **HUD on its own plate** (a bar, panel, text box, menu, result box): mask the whole plate. It stays exactly as drawn.
- **Text drawn straight on the world with no plate** (a score or `LIVES 3` over the sky, a `Checkpoint.` message on the ground, title lines, battle labels): **leave it unmasked**. It is darkened and lit like the world and stays readable. A rect around it passes the unlit world through, which shows as a bright box behind the text in the dark scene (and `soft` only turns that into a bright blurry patch). If the text must stay full brightness, give it a small backing box in the game and mask the box.
- **Never** mask a full-width strip or a whole-screen rect with nothing drawn behind it: it shows as an unlit band.

## Side-scrollers: sky and parallax

Lights brighten whatever pixel lies within their radius, so on a side-scroller a torch or a coin light paints a pool on the sky and the far mountains, as if they were a wall right behind the hero. Call `lights.markFar()` right after drawing the sky / parallax layers (before tiles and actors): those pixels then get the ambient but only `farLight` (0.2) of the light. Keep `lights.render()` at the end of the draw.

## Keep the rest of the game working

- Change nothing in how the game draws: not the canvas size, its CSS, its transform or smoothing. Never read lights or the overlay in game logic: `?auto=1` ends the same with `?webgl=0` / `?lights=0`.
- **Coordinates:** lights and occluders are in world px; the module subtracts `camera()`. Check one: the hero's torch must sit on the hero on screen. A HUD strip drawn above the field (the field translated down by `ox, oy`) means `camera = {camX - ox, camY - oy}`.
- `solidAt` must be cheap and must never change game state; return false outside the map (or true if the map edge is a wall).
- Add lights where things are created (level / scene start, spawn), not in the draw loop: `add` with a fixed `id` is safe to repeat, but anonymous `add` every frame grows the list (capped at 400 with a warning).
- Restart / new level: `lights.clear()` and add that level's lights again; the hero torch too.
- Find every caller of what you touched: the `?t=` fast-forward (its single draw must reach `render()`), `?auto=1`, title / result screens, restart, keyboard shortcuts.

## Self-check without a browser

- Both module files are byte-identical to the ones given; `webgl-post.js` loads before `dynamic-lights.js`, both before the game script.
- One `GameDNA_Post` instance, passed as `post`; `create` runs once after the canvas exists; `clock` is step-counted.
- `camera()` returns the world point at canvas (0, 0), including any HUD offset; walk it: hero at world (200, 120), camera (72, 40) → torch drawn at canvas (128, 80), on the hero.
- `solidAt(tx, ty)` takes tile indices, not pixels; water and floor return false.
- Every draw path ends with `lights.render()` (or `post.render()`).
- Lights are added at level start / spawn; projectile lights return `null` when the projectile is gone.
- Walk one light at the defaults: ambient 0.55 → an unlit pixel shows at 55 % of its colour (tinted); a light of intensity 1 adds 1.0 × its colour at its centre, 0.38 × at half its radius, 0 at the rim (bright results are compressed by a soft shoulder above 0.8).
- `?webgl=0` and `?lights=0` give exactly the plain game.

## Cost (measured 2026-11-16, headless Chromium 1.65, SwiftShader)

The light map is built on the CPU (2D canvas, `willReadFrequently`) at ≤ 400 px on its longest side; the GPU work is two quarter-resolution blur passes (about the light map's own size) and one full-resolution composite.

Each frame below = `renderNow()` + a 1-pixel `readPixels` (forces the GPU to finish), 40 frames averaged; "without" = the same I-08 instance with lighting switched off (its grade still runs).

| case | overlay px | light map | lights / shadow edges | light map CPU | frame with lights | without |
|---|---|---|---|---|---|---|
| top-down host 256×224, 1280×900 window, dpr 1 | 1029×900 | 256×224 | 18 / 86 | 1.4 ms | 10.6 ms | 4.6 ms |
| side-scroller host 320×180, 1280 px | 1280×720 | 320×180 | ~20 / 20 | 1.3 ms | 10.1 ms | 4.6 ms |
| demo 640×360 (8 lights, 3 samples, cones) | 932×524 | 400×225 | 8 / 38 | 3.5 ms | 8.7 ms | 2.7 ms |

So lighting adds about 6 ms per frame on SwiftShader (a CPU renderer); a real GPU is many times faster on the pass part, while the light-map CPU time stays.

Lower `samples` to 1 (hard shadows) or `shadows: 'off'` for many lights on weak devices; `maxLights` caps the lights drawn per frame (nearest to the view centre first).

## Guarantees

- Depends only on the game clock, `camera()`, the occluder callbacks and the light list: never wall-clock time or `Math.random`. `?t=&freeze=1` frames are the same every run.
- Flicker is seeded by the light's id; a flash's age is game ms since `start` (or since its first frame).
- The HUD (uiRects / `uiMask`) is passed through unchanged, so text stays crisp and unlit.
- Shares the game's I-08 instance (one overlay); the I-08 grade and pulse still run after the lights.
- Bad callbacks (throwing `follow`, `camera`, `solidAt`, `rects`, `uiRects`, `when`) are caught, warned once, and skipped.

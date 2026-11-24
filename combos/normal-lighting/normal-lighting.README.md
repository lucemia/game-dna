# normal-lighting.js (J-02 module, v1.1.0)

One plain script with no dependencies and no `import`/`export`. It defines one global, `GameDNA_NormalLight`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. **It needs I-08 `webgl-post.js` (`GameDNA_Post`) loaded first.**

It makes a game's sprites **catch the light**. Each sprite the game draws through the module also writes its **normals** (which way each pixel faces) into a normal buffer and its colour into an albedo buffer, two canvases the size of the game canvas. One fragment-shader pass on the shared I-08 chain (`normal-light`, order 250, after J-01's lights at 200) relights only those pixels:

- a **key light** (sun, moon, the room's main light) from a direction and height you choose;
- up to 8 **point lights**: its own (`add`, `flash`), plus the **J-01 `GameDNA_Lights` lights** on the same post when present (read from `lights.list()` every frame; J-01 is not changed);
- **specular** glints on curved edges turned toward a light, and a **rim light** on silhouette edges (from a direction, and from each point light on the edges facing it).

The relief is energy-neutral and multiplicative: `colour × (1 + 0.7 × e) × tint`, with `e = strength × key × (n.xy · L.xy)` (plus the same per point light). Only the sideways part of the normal counts, so a face turned to the viewer keeps exactly its drawn colour and a round sprite keeps about its mean brightness: the side toward the light brightens as much as the far side darkens. The tint is a hue shift that keeps brightness: faces toward the key take `keyColor` (warm sun), faces away take `shadowColor` (cool sky), × `warmth`. Nothing is lifted toward grey or white (a soft shoulder keeps bright colours from clipping). Point lights also add `fill` × their light to faces turned toward them (never to faces toward the viewer); the rim light multiplies edge colours. Pixels drawn **over** a sprite later without the module (a tree in front, a HUD box, a damage number) no longer match the albedo buffer and are left alone (`overdraw`).

Where normals come from:

| how the game draws the sprite | call | normals |
|---|---|---|
| a bitmap with a normal map (L-05 `nh2` map, or any `gl` / `dx` map) | `nl.drawSprite(img, map, ...drawImage args)` | the map (`nh2`: also its gloss mask) |
| a bitmap without a map | `nl.drawSprite(img, 'derive', ...)` | derived once per image from its alpha and shading |
| canvas calls (paths, rects, arcs, text) | `nl.shape(key, box, () => drawIt())` | derived from the drawn shape (every frame, or once per `key`) |
| `nl.drawSprite(img, null, ...)` or no call at all | | none: drawn exactly as before |

**Without WebGL nothing changes.** If WebGL is missing or blocked, the URL has `?webgl=0` or `?normals=0`, or `webgl-post.js` is not loaded, `create()` returns an instance whose `drawSprite` is a plain `ctx.drawImage` and whose `shape` just calls your function: the game draws exactly as before. A missing, unloaded or cross-origin normal map also gives the plain draw. **No method ever throws** (an exception thrown by your own draw function inside `shape` still reaches you, as it would without the module). Game logic never reads anything back, so `?auto=1` ends the same with WebGL on and off.

## API

`GameDNA_NormalLight.create(options) → nl`

| option | meaning |
|---|---|
| `post` | The game's existing `GameDNA_Post` instance, if it has one. Otherwise give `canvas`: the module finds an instance already made for that canvas (`GameDNA_Post.instances()`) or creates one with `passes: 'none'`. Never make two for one canvas. |
| `canvas` | The game's canvas element (or a selector, or its 2D context). The module draws on that canvas's own 2D context (`canvas.getContext('2d')`); pass `ctx` if the game draws through another context object. |
| `clock` | `() => gameMs`: the game's step-counted time (flicker, flashes; a new frame starts when it moves). Never `Date.now()`. |
| `camera` | `() => ({x, y})`: the world point drawn at view (0, 0). Lights and flashes are then in world units (`screen: true` on a light = view units). Default `{0, 0}`. |
| `view` | `{w, h}`: the units the game draws in when the backing store is scaled (e.g. `{w: 640, h: 360}` for a devicePixelRatio-sized canvas drawn with `setTransform(scale…)`). Lights, `bevel`, `lightHeight` and `drawnBoxes()` use them. Shape boxes are always in the game's **current drawing coordinates** (whatever transform is active when you call `shape`). |
| `lights` | Optional J-01 instance to read lights from. Default (`params.lights: 'auto'`): the live `GameDNA_Lights` instance on the same post. |
| `params` | See below. |

| param | default (`daylight`) | meaning |
|---|---|---|
| `preset` | 'daylight' | starting set: `daylight` (a lamp-less game: the defaults below), `dusk` (lamps / J-01 at dusk: key 0.35, fill 0.4, pointRim 0.9), `night` (bluish key 0.2, fill 0.5), `soft` (strength 0.8, gentle). Keys given beside it override it. `GameDNA_NormalLight.presets` lists them. |
| `strength` | 1.4 | 0..2, relief |
| `key` | 0.6 | 0..1.5, directional key light |
| `keyAngle` | 225 | degrees, screen direction the key light comes FROM (0 right, 90 down, 225 up-left) |
| `keyHeight` | 0.35 | 0.1 raking (strong relief) .. 0.95 from the viewer (flat) |
| `keyColor`, `shadowColor`, `warmth` | #ffd9a0, #7f9cff, 0.6 | hue of faces toward / away from the key (brightness kept), and how strongly (0 = brightness only) |
| `backside` | 1 | 0..1, share of the darkening faces turned away get |
| `points` | 1 | 0..2, all point lights (own, flashes, J-01) |
| `fill` | 0.35 | 0..1.5, extra light on faces turned toward a point light |
| `lightHeight` | 30 | view px a point light hangs above the sprites (low = long relief) |
| `specular`, `gloss` | 0.25, 18 | glints on curved edges toward a light (an `nh2` map's gloss mask scales them per pixel) |
| `rim`, `rimColor`, `rimAngle`, `rimWidth` | 0.7, #bfe0ff, 315, 2.5 | rim light on silhouette edges, coming FROM `rimAngle` (default up-right: behind the sprite, never on the feet) |
| `pointRim` | 0.6 | rim a point light puts on the edges that face it |
| `bevel` | 8 | view px: how far in from the edge a derived shape rounds off (about half a small sprite's width) |
| `detail` | 0.2 | 0..1, how much a derived shape's own shading bumps its normals |
| `overdraw` | true | leave pixels drawn over a sprite later (not through the module) unlit |
| `normalFormat` | 'auto' | bitmap maps: `nh2` when the map is twice as wide as the sprite (L-05), else `gl` (green up); `'dx'` = green down |
| `lights` | 'auto' | 'auto' also reads J-01; 'own' only lights added here |
| `compare` | 0 | 0..1: pixels left of this share of the width stay flat (a before / after split) |
| `debug` | 'off' | 'normals' shows the normal buffer, 'coverage' the lit area |
| `maxPixels` | 1 600 000 | the buffers are scaled down above this |
| `enabled` | true | |

| method | |
|---|---|
| `drawSprite(img, map, ...args)` | Draws `img` with `ctx.drawImage(img, ...args)` (all three argument forms; the current transform, flips and `globalAlpha` apply) and writes its normals. `map`: a normal-map image, `'derive'`, or `null` (plain draw). A mirrored transform (`scale(-1, 1)`) negates the map's x normals, so a sprite facing left is lit from the correct side. |
| `shape(key, box, fn)` | Calls `fn()` (your existing drawing, unchanged). While it runs, every call it makes on the game's 2D context is also made on a scratch canvas; the normals are derived from what was drawn. `box` = `{x, y, w, h}` around the sprite in the current drawing coordinates (padding is added; parts outside the box get no normals). `key` (string): shapes with the same key look the same, so the maps are derived once and reused (trees, rocks, coins); `null` = derive every frame (animated actors, ~0.1–0.4 ms each). |
| `begin(key, box)` / `end()` | The same as `shape` in two calls, when the drawing is not one function. Always pair them. |
| `add(def) → id` | A point light: `{id, x, y, follow, offset, radius, color, intensity, height, flicker, screen, on}`. `follow` = an actor or `() => actor` (`{x, y}` or `{x, y, w, h}`; `null` / `dead: true` removes the light). `add` with an existing id updates it. |
| `flash(def) → id` | A short light that fades over `ms` (default 260) of game time: hits, spells, explosions. The same spot within 3 frames merges. |
| `set(id, patch)`, `remove(id)`, `clear()`, `clear('flashes')`, `list()` | Light list. `clear()` at level / run start. |
| `render(arg?)` | Once per drawn frame on every draw path; it is `post.render(arg)` (either is enough). |
| `renderNow()` | Synchronous, for tests. |
| `setParams(o)`, `params()`, `setEnabled(on)`, `forget(key?)` | Live parameters; `forget` drops cached shape maps. |
| `drawnBoxes()` | The sprite boxes of the last shown frame, view units: `[{x, y, w, h, kind}]`. |
| `lightsNow()` | The lights used in the last frame (view units). |
| `stats()` | `{active, reason, mode, shared, enabled, frames, lit, shapes, sprites, frameShapes, frameSprites, derived, cacheHits, cached, avgDeriveMs, lights, ownLights, j01, unbalanced, tainted, noNormal, offscreen, errors, broken, buffer, passes, postPasses, avgMs}` |
| `destroy()` | Removes the pass and inputs (and the post instance, if the module made it). |
| `active`, `reason`, `post`, `shared` | `active` false = plain drawing (`reason`: 'no-post', 'no-canvas', 'no-webgl', 'url', 'no-context'). |

`GameDNA_NormalLight.derive(imgOrCanvas, {bevel, detail}) → canvas` (a `dx`-format normal map from any same-origin image), `.defaults`, `.passName` ('normal-light').

## Integration (15 lines)

```js
// <script src="webgl-post.js"></script><script src="normal-lighting.js"></script> before your game script
const post = GameDNA_Post.create({ canvas: gameCanvas, clock: () => frame * 1000 / 60, params: { passes: 'none' } });  // or the game's own
const nl = GameDNA_NormalLight.create({ post, canvas: gameCanvas, clock: () => frame * 1000 / 60,
  camera: () => ({ x: camX, y: camY }),                 // world point at view (0, 0): lights and flashes are in world units
  params: { preset: 'daylight' } });                    // no lamps: sun from up-left; with lamps or J-01 at dusk: 'dusk'
// bitmaps: replace ctx.drawImage(heroImg, x, y, w, h) with
nl.drawSprite(heroImg, heroNormalMap, x, y, w, h);      // same arguments after the two images; null map = plain draw
// canvas-drawn actors: wrap the existing call, box around the sprite in the current drawing coordinates
nl.shape(null, { x: e.x - 24, y: e.y - 48, w: 48, h: 52 }, () => drawEnemy(e));
nl.shape('tree' + c + ',' + r, { x: tx, y: ty, w: 40, h: 56 }, () => drawTree(c, r));   // static: derived once
// level start: nl.clear(); nl.add({ id: 'torch1', x: 300, y: 180, radius: 160, color: '#ffb066', flicker: 0.3 });
// hit accepted: nl.flash({ x: target.x, y: target.y - 16, radius: 110, color: '#ffd28a', ms: 260 });
function draw() { /* ...existing drawing... */ nl.render(); }   // every draw path, incl. title and the ?t= single draw
```

## Keep the rest of the game working

- Change nothing in how the game draws: not the canvas size, its CSS, its transform or smoothing. `shape` runs your function unchanged and `drawSprite` makes the same `drawImage` call.
- Only sprites: characters, enemies, props, pickups, trees, rocks. Never wrap the ground, the sky, a background layer or the HUD (they would get pillow edges or be lit like a sprite). Never wrap a function that draws the whole world.
- One `shape` per sprite with a box that fits it (a box over half the screen is a mistake). Put it around the existing call where the sprite is drawn, inside the game's own camera transform, and keep the game's y-sorting.
- `key` only for things that always look the same at the same box size; animated actors get `null`.
- `flash` once where a hit / spell is accepted, never in a per-frame loop. Lights are added at level start or spawn, not in the draw loop.
- Find every caller of what you touched: the `?t=` fast-forward (its single draw must reach `nl.render()`), `?auto=1`, restart, title and result screens, keyboard shortcuts.
- Never read the overlay or `nl.active` in game logic.

## Self-check without a browser

- Both module files byte-identical to the ones given; `webgl-post.js` loads first; one `GameDNA_Post` per canvas.
- `clock` is step-counted; `camera` returns the same offset the draw subtracts.
- Every draw path ends with `nl.render()` (or `post.render()`), including early returns (title screens).
- Every `begin` has its `end` (prefer `shape`); boxes are in the coordinates active at that call.
- Walk one pixel at the defaults: key from 225° at height 0.35 → L.xy = (−0.66, −0.66). A flat pixel n = (0, 0, 1): e = 0, factor 1, unchanged. An edge facing up-left n = (−0.7, −0.7, 0.14): n.xy·L.xy = 0.92, e = 1.4 × 0.6 × 0.92 = 0.78, brightness × (1 + 0.7 × 0.78) = 1.54, tinted warm. The edge facing down-right: e = −0.78, × 0.46, tinted cool. Mean over the two: 1.0.
- `?webgl=0` and `?normals=0` draw exactly the plain game.

## Cost (measured 2026-11-17, headless Chromium 1.65, SwiftShader CPU renderer, machine load 7–18 from parallel cold tests)

Measured with a forced GPU finish (a 1-pixel read of the overlay) after each frame, median of 30–40 frames, a 1280×720 canvas at 1× (5 bitmaps with maps, 2 derived shapes, the oak 'derive' cached):

| | draw + submit (CPU) | GPU finish | total |
|---|---|---|---|
| I-08 alone, no passes | 4.0 ms | 4–5 ms | ~9 ms |
| I-08 grade pass only (for scale) | 4.1 ms | 11.7 ms | ~16 ms |
| with J-02 | 8.7–10.7 ms | 20–27 ms | ~30–35 ms |

So J-02 costs about 20–25 ms per frame on SwiftShader under that load: ~5 ms of CPU (writing the buffers, deriving the animated shapes at 0.1–0.45 ms each) and the rest GPU-side. The GPU part did not change with the buffer size (422×237 and 1280×720 measured the same) or with a trivial shader, so it is the fixed cost of the extra pass and its two input textures in SwiftShader, not the lighting maths. The demo's status line shows only the CPU submit time (9.5–12.4 ms there with J-01 and grade as well). A real GPU is many times faster on the GPU part (not measured here); the CPU part stays. The pass is skipped (zero cost) on frames that drew no sprite through the module. Key static shapes so they are derived once.

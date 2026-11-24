# screen-distortion.js (J-08 module, v1.1.0)

One plain script with no dependencies and no `import`/`export`. It defines one global, `GameDNA_Distort`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. **It needs I-08 `webgl-post.js` (`GameDNA_Post`) loaded first.**

It bends the finished picture of a game drawn on an ordinary 2D canvas, the way hot air, water and lenses bend light:
- **heat** regions: a fine shimmer that rises, strongest at the bottom of the region (the fire, lava or vent);
- **water** regions: a slow, wide wobble with faint caustic glints;
- **portal** regions: inside a circle the scene swirls and is pulled toward the centre, with a rippling rim;
- **shockwaves**: `shockwave(x, y)` sends a ring of refraction out from a point (explosion, slam, big hit, boss stomp), fading in game time.

It is one fragment-shader pass (`distort`, order 350) on the shared I-08 chain. It only changes **where each pixel is read from** (a UV offset); colours are not repainted, apart from an optional faint light (`shine`) on wave fronts, portal rims and water glints and a colour fringe (`chroma`) on fronts and rims. While no region is on screen and no wave is alive the pass is skipped and costs nothing.

**Without WebGL nothing changes.** If WebGL is missing or blocked, the page URL has `?webgl=0`, or `webgl-post.js` is not loaded, `create()` returns an instance whose methods are safe no-ops and the 2D canvas shows exactly as before. **No method ever throws.** The game never reads anything back from the module, so game logic and `?auto=1` are the same with WebGL on and off.

## API

`GameDNA_Distort.create(options) → fx`

| option | meaning |
|---|---|
| `post` | The game's existing `GameDNA_Post` instance, if it has one. Otherwise give `canvas`: the module finds an instance already made for that canvas (`GameDNA_Post.instances()`) or creates one with `passes: 'none'` (no grade, no pulse). Never make two for one canvas. |
| `canvas` | The game's canvas element (or a selector, or its 2D context). |
| `clock` | `() => gameMs`: the game's own step-counted time in ms, e.g. `() => frameCounter * 1000 / 60`. Waves expand and ripples move on it only, so `?t=&freeze=1` frames are the same every run. Never `Date.now()`. |
| `view` | Optional `{w, h}`: the units the game draws in when the canvas backing store is scaled (e.g. `{w: 640, h: 360}` for a 1280×720 or devicePixelRatio-sized canvas drawn with `setTransform(scale…)`). `regions`, `uiRects`, `shockwave` points and sizes are then in those units. Default: canvas pixels. |
| `regions` | A function returning an array, read **once per post frame** (or a fixed array): what is on screen now, in on-screen units (camera already subtracted). Each item: `{kind: 'heat' \| 'water' \| 'portal', x, y, w, h}` (a rect; top-left corner) or `{kind, x, y, r}` (a circle; centre). Optional `amount` 0..3 (default 1), `soft` (edge fade in view px; default 20 % of the short side for heat, 30 % for portals, 8 % for water, at most 24 px at a 360 px view), `shape: 'rect' \| 'ellipse'` (portals and `r` items are ellipses). Up to 8 regions; items off screen are ignored; extras are dropped (`stats().dropped`). |
| `uiRects` | `[{x, y, w, h, r?}]` or a function returning them (read every frame; re-rasterised only when they change), in view units: HUD pixels are never displaced, the world never samples HUD pixels, and the distortion fades out over `uiFeather` px before each rect. Because the pass only moves pixels, a rect around **plate-less HUD text** (a score over the sky) leaves no visible box: give tight rects around every HUD element, panel or not. The shared I-08 `uiMask` (from `post`'s own `uiRects`, or another J element) is honoured too; this module never writes it. |
| `params` | See below. |
| `skin` | Optional: with `skin-api.js` loaded, `tint` may be a skin token (`fx.hot`). The module draws nothing on the game canvas. |

**Sizes scale with the view height.** The pixel numbers below are for a 360 px tall view; a 180 px tall pixel game gets half of each (a strength-1 wave there reaches 75 px with a 4.5 px swell), a 720 px view twice.

| param | default | meaning |
|---|---|---|
| `strength` | 1 | 0..2, multiplies every effect |
| `heat` | 2.2 | heat-haze swing, px (at amount 1); ripples about 11 px apart |
| `water` | 2.2 | water wobble swing, px |
| `portal` | 1 | 0..2, portal swirl (about 1.7 rad at the centre) and lens pull |
| `wave` | 9 | shockwave swell at strength 1, px |
| `waveRadius` | 150 | how far a strength-1 wave travels, px (× (0.55 + 0.45 × strength)) |
| `waveWidth` | 22 | width of the refracting band, px (× (0.7 + 0.3 × strength); it widens to 1.45× as the wave ages) |
| `waveMs` | 650 | life of a strength-1 wave in game ms (× (0.8 + 0.2 × strength)) |
| `chroma` | 0.35 | 0..1 colour fringe on wave fronts and portal rims (0 = none) |
| `shine` | 0.35 | 0..1 faint light on wave fronts, portal rims and soft pale-cyan water glints (0 = a pure UV offset) |
| `tint` | #fff2dc | colour of that light |
| `underwater` | 0 | 0..1: the whole view wobbles like a water region (a level under water) |
| `snap` | false | offsets snap to whole canvas pixels: a chunkier wobble for pixel art |
| `uiFeather` | 6 | view px over which distortion fades before a HUD rect |
| `debug` | false | tints regions (heat orange, water blue, portal violet) to check placement |
| `enabled` | true | |

| method | |
|---|---|
| `shockwave(x, y, {strength, radius, width, duration, amplitude, chroma})` | A ring from `(x, y)` in view units (camera subtracted). `strength` 0..1.5: 0.5 light hit, 0.8 heavy, 1–1.4 kill, explosion, boss stomp. The other keys override the derived sizes (view px, ms). At most 8 alive (the oldest is dropped); a second call at the same spot (8 px) within 50 ms merges into the first, so a call inside a per-frame overlap loop cannot stack. Non-finite points are ignored, never moved to the centre. |
| `render(arg?)` | Once per drawn frame, on every draw path; it is `post.render(arg)` (calling either is enough). |
| `clear()` | Drops all waves. Call when a level, run or battle starts. |
| `setRegions(fnOrArray)`, `setUiRects(fnOrArray)` | Replace those options (`null` removes). |
| `setParams(o)`, `params()`, `setEnabled(on)` | Live parameters; off = the plain frame. |
| `liveWaves()` | Number of waves alive now. |
| `stats()` | `{active, reason, mode, shared, enabled, frames, drawn (frames the pass ran), waves (fired), merged, live, regions (this frame), dropped, uiRects, regionErrors, uiErrors, errors, broken, passes, postPasses, w, h, avgMs}` |
| `destroy()` | Removes the pass (and the post instance, if the module made it). |
| `active`, `reason`, `post`, `shared` | `active` false = no-op instance (`reason`: 'no-post', 'no-canvas', 'no-webgl', 'url', 'option', …). `shared` = it uses the game's post. |

`GameDNA_Distort.defaults`, `.passName` ('distort'), `.kinds`.

## Integration (15 lines)

```js
// <script src="webgl-post.js"></script><script src="screen-distortion.js"></script> before your game script
const fx = GameDNA_Distort.create({
  canvas: gameCanvas,                                       // the canvas your game draws on, as it is
  clock: () => frameCount * 1000 / 60,                      // your fixed-step counter; never Date.now()
  regions: () => scene !== 'play' ? [] : [                  // what is on screen NOW, camera subtracted
    ...torches.map(t => ({ kind: 'heat', x: t.x - camX - 14, y: t.y - camY - 48, w: 28, h: 48 })),
    { kind: 'water', x: 0, y: waterLineY - camY, w: viewW, h: viewH },
  ],
  uiRects: () => [hudRect, ...openWindowRects()],           // every HUD element, plate or not
});
function draw() { /* ...existing drawing, unchanged... */ fx.render(); }   // every draw path
function onExplode(x, y) { /* existing code */ fx.shockwave(x - camX, y - camY, { strength: 1 }); }
function onHeavyHit(t, killed) { /* existing code */ fx.shockwave(t.x - camX, t.y - camY, { strength: killed ? 1 : 0.5 }); }
// level / run start: fx.clear();
```

## Where distortion belongs

- **Heat**: it shows only where there is detail behind it (bricks, foliage, a ridge line, the flame itself), never over a smooth sky. Above fires, braziers, torches, forges, lava, hot vents, a burning wreck, a desert horizon. The rect starts at the source and goes up 1.5–3× its width; amount 1 (a torch 0.6).
- **Water**: lakes, rivers, flooded floors, a water layer in front of the scene; the rect covers the water as drawn. A whole level under water: `params.underwater` 0.4–0.7 instead.
- **Portal**: warp gates, magic doors, a summoning circle, a black hole, a goal gate; a circle a bit smaller than the drawn ring.
- **Shockwaves**: explosions, ground slams, heavy hits, kills, boss stomps, a big landing; once per event, where it is **accepted**, never every frame while it lasts.
- Only on things the game draws. Never invent a region over empty ground, never cover the whole screen with a region (use `underwater`), and keep regions off characters the player must read precisely (a heat rect over the boss's head is fine; a water rect over the hero's whole sprite is not).

## Keep the rest of the game working

- Change nothing in how the game draws: not the canvas size, its CSS, transform or smoothing. The I-08 overlay copies the canvas's on-screen box.
- `regions` and `uiRects` are read during the post frame: they must only read state, never change it, and must not throw (they are wrapped anyway; errors count in `stats()`).
- Never read the overlay or `fx.active` for game logic; `?auto=1` must end exactly the same with WebGL on and off.
- Find every caller of what you touched: the `?t=` fast-forward (its single draw before freezing must reach `fx.render()`), `?auto=1`, restart, title and result screens, keyboard shortcuts.
- Convert world points to on-screen units (subtract the camera, apply the same scale as the game's draw).

## Self-check without a browser

- Load order: `webgl-post.js`, `screen-distortion.js`, then the game; both byte-identical; one `GameDNA_Post` for the canvas.
- `create` runs once, after the canvas exists; `clock` is step-counted.
- Every draw path ends with `fx.render()` (title, play, pause, result, the draw after the `?t=` fast-forward).
- `regions()` returns only things drawn this frame, in the same units and camera offset as the game's own draw; `[]` on screens without them.
- Every `shockwave` call sits at an event that happens once (hit accepted, explosion spawned), with an on-screen point.
- `uiRects` covers every HUD element and open window, in the same units.
- Walk one wave (360 px view, defaults): `shockwave(x, y, {strength: 1})` → reach 150 px, band 22 px, life 650 ms. At 325 ms its radius is 150 × (1 − 0.5³) = 131 px and its swell 9 × 0.5² = 2.25 px. A 180 px tall game: half the distances.
- With `?webgl=0`: the no-op instance; the game looks and plays as before.

## What it guarantees

- Effects depend only on the game clock, the canvas pixels, the regions and the parameters: never wall-clock time or `Math.random`.
- HUD pixels inside `uiRects` (and the shared `uiMask`) are output exactly as drawn; pixels outside never sample from inside a HUD rect.
- Offsets are clamped to the frame (edges repeat their last pixel, no black seams).
- One pass; skipped when idle. If its shader fails to compile it is disabled with one `console.warn` (`stats().broken`), and the frame shows unbent.

## Cost (measured 2026-11-16, v1.1.0, headless Chromium 1.65 / SwiftShader CPU renderer, machine load about 7: other builders were running)

Each frame is `renderNow()` plus a 1-pixel `readPixels` (forces the GPU to finish), 60 frames averaged. *Idle* = no region on screen and no wave alive: the pass is skipped and only I-08's copy runs. *3 regions* = heat + water + portal on screen. *+ waves* = the same with 8 shockwaves alive all the time (a stress case).

| case | overlay px | idle | 3 regions | 3 regions + 8 waves |
|---|---|---|---|---|
| 320×180 side-scroller, 1280 px window, dpr 1 | 1280×720 | 1.7 ms | 18.7 ms | 29.0 ms |
| 256×224 top-down, 1280×900 window, dpr 1 | 1029×900 | 1.8 ms | 20.0 ms | 29.6 ms |
| 640×360 HD, dpr 1 | 922×519 | 1.6 ms | 12.1 ms | 16.6 ms |
| 1280×720 HD (demo), dpr 1 | 922×519 | 2.1 ms | 11.9 ms | 18.9 ms |
| 1280×720 HD, dpr 2 | 1844×1037 | 4.4 ms | 44.4 ms | 64.7 ms |
| phone 390 px, dpr 3 (capped to 2) | 780×439 | 1.8 ms | 14.0 ms | 15.7 ms |

At load 3.5 the v1.0 numbers were about 20 % lower (e.g. 640×360: 11.9 / 12.8 ms); v1.1's heat and glint changes did not add measurable cost. On SwiftShader the pass costs about 10 ms per megapixel with three regions, because a CPU renderer evaluates every region's maths for every pixel; one or two regions and a passing wave cost less. A real GPU is many times faster (not measured here). If a large window on a weak GPU is too slow, give I-08 a lower `dpr` (1) or `maxPixels`. The loops in the shader stop at the live region and wave counts (measured about 2× faster on SwiftShader than the same calls unrolled behind uniform `if`s). Re-measure: `uv run --with playwright==1.65.0 python elements/screen-distortion/checks/cost.py` (writes `checks/cost.json`).

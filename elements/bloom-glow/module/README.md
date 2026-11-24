# bloom-glow.js (J-03 module, v1.1)

One plain script with no dependencies and no `import`/`export`. It defines one global, `GameDNA_Bloom`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. **It needs I-08 `webgl-post.js` (`GameDNA_Post`) loaded first.**

It makes bright areas bleed soft light, the way a lens or an eye does. Two things glow:
- **bright pixels**: every pixel whose brightest RGB channel is above `threshold` (0..1, with a soft knee), and
- **the emissive layer**: a transparent canvas the size of the game canvas. Each frame the game draws into it ONLY what should glow (fireballs, lanterns, crystals, sparks, a UI highlight), at the same coordinates as on the game canvas. Things drawn there glow whatever their brightness. This is what keeps a pixel game's white HUD text and white clouds from blooming: use `source: 'emissive'` and only the things you mark glow.

The glow is blurred with a 13-tap chain at 1/2, 1/4, 1/8 and 1/16 resolution and laid back onto the frame, tinted: `add` is a soft add (about c + glow on dark pixels, easing toward white instead of clipping, so a bright moon keeps its craters), `screen` is the classic screen. The tight level is kept off pixels that are already near white. Six passes on the I-08 pipeline (`bloom-bright`, `bloom-down1..3`, `bloom-up`, `bloom`, order 600-605); only the last one is full resolution.

**The HUD stays crisp.** Pass the HUD rectangles as `uiRects`: those pixels never act as a glow source and never receive glow, and glow fades out over `uiFeather` px before it reaches them. A rect with `glow: true` is a hole: UI inside it (a selected skill, a "ready" button) emits when drawn into the emissive layer, stays crisp itself, and its glow spills softly onto the HUD around it.

**Which HUD to mask.** Mask a HUD element by its whole backing plate (panel, bar, window, banner band): the plate hides the edge of the rect. Text drawn straight onto the world with no plate (a title, a floating "Slime" label, a one-line message) should stay out of `uiRects`, or get a small backing box drawn by the game: a tight rect around plate-less text leaves a visible box of un-bloomed, un-graded world behind it, and a whole-canvas rect on a title screen just switches bloom off there. `soft` is for panels that themselves have a soft shadow or glow edge; around plate-less text it still reads as a lighter patch.

**Without WebGL nothing changes.** With no WebGL, `?webgl=0`, no `GameDNA_Post`, or a lost context, `create()` returns an instance whose methods are safe no-ops (`emissive()` returns a 1x1 scratch context). **No method ever throws.**

## API

`GameDNA_Bloom.create(options) → bloom`

| option | meaning |
|---|---|
| `canvas` | The game's canvas (element, selector or its 2D context). Required unless `post` is given. |
| `post` | Optional: the game's existing `GameDNA_Post` instance. Without it the module uses the instance already made for this canvas (`GameDNA_Post.instances()`), or creates its own (`postParams`, default `{passes: 'none'}`). **If the game also uses I-08, create the post first and pass it.** |
| `clock` | `() => gameMs`: the game's step-counted time. Flares fade on it, so `?t=&freeze=1` frames are the same every run. Never `Date.now()`. |
| `view` | Optional `{w, h}`: the coordinate space of `uiRects`, `flare({at})`, `glow()` and the emissive context, when the game draws with a scale (e.g. `{w: 640, h: 360}` on a 1280x720 canvas). Default: canvas pixels. |
| `params` | `threshold` 0.78 (0..1) · `knee` 0.5 (0..1) · `intensity` 1.6 (0..3) · `radius` 0.75 (0..1, tight → wide) · `tint` '#fff1dc' · `blend` 'add' \| 'screen' · `source` 'both' \| 'luma' \| 'emissive' · `emissiveGain` 1.2 (0..3) · `flareDecay` 420 (ms) · `uiFeather` 6 (px, 0..32) · `adapt` 1 (0..1, scene-brightness guard, below) · `enabled` true |
| `uiRects` | `() => [{x, y, w, h, r?, soft?, glow?}]` (or an array): HUD panels, text bars, menus, in `view` units. Called once per post frame. `r` = the panel's corner radius (the mask, the glow hole and the fade around it follow the rounded shape); `soft` = px over which the HUD mask fades out beyond the rect, for a panel with a soft shadow or glow edge (0..32, default 0 = hard edge; I-08's grade and pulse read the same mask). |
| `uiMask` | Optional canvas instead of `uiRects`: white = HUD, black = world, `#ff00ff` = glow hole that stays crisp, `#0000ff` = glow hole that also receives glow. Same aspect as the game canvas. |
| `emissive` | Optional: your own emissive canvas (then you clear it yourself). Default: the module makes one. |
| `skin` | Optional: `tint` and `glow()` colours may be skin tokens (`'fx.hot'`) when `skin-api.js` is loaded. |

| method | |
|---|---|
| `emissive()` | Returns the emissive 2D context, transform set to `view` units. The first call after each post frame clears it, so call it in every draw (as often as you like) and draw only glowing things, at their on-screen positions (subtract the camera like your own draw does). A frame where it is not called has no emissive glow. |
| `glow(x, y, r, color = '#fff', alpha = 1)` | A soft round glow into the emissive layer: lantern, orb, projectile, spark. `r` in `view` units. |
| `flare(strength = 1, {at, decay})` | Flash bloom on a big hit: for `decay` ms (default `flareDecay`) the wide glow gets up to 2.2× stronger (the tight core and the threshold stay as they are, so the peak stays a soft round bloom), and with `at` (`view` units) a soft light bursts there. `strength` 0..1.5 (heavy hit 0.6, finisher 1.2). A new flare takes the larger of the old (faded) and new strength. |
| `clear()` | Drops a running flare and the emissive layer (scene / level / battle start). |
| `render(arg?)` | Same as `post.render(arg)`: once per drawn frame, on every draw path. Calling both is fine. |
| `setParams(o)`, `params()` | Live parameters, as `params` above. |
| `setEnabled(on)` | Bloom passes on or off (the rest of the post chain stays). |
| `setUiRects(fn)` | Replace (or with `null` remove) the HUD rects. |
| `stats()` | `{active, reason, mode, shared, enabled, frames, emissiveFrames, emissiveOn, flares, flare, uiRects, errors, broken, passes, postPasses, w, h, avgMs}` |
| `destroy()` | Removes the passes (and the post instance if the module made it). |
| `active`, `reason`, `post`, `shared` | `active` false = 2D only; `post` = the `GameDNA_Post` instance used; `shared` = it was the game's. |

`GameDNA_Bloom.defaults`, `GameDNA_Bloom.passNames`.

## Integration (15 lines)

```js
// <script src="webgl-post.js"></script><script src="bloom-glow.js"></script> before the game script
const post = GameDNA_Post.create({ canvas: gameCanvas, clock: () => frameCount * 1000 / 60 });   // skip if the game already has one
const bloom = GameDNA_Bloom.create({ post, clock: () => frameCount * 1000 / 60,
  params: { threshold: 0.78, intensity: 1.6, radius: 0.75, source: 'emissive' },   // 'both' only for dark scenes
  uiRects: () => [hudBarRect, menuRect] });                    // canvas px, whole backing plates ({r} = corner radius); {.., glow: true} for UI that should glow
function draw() {
  /* ...your existing drawing, unchanged: world, effects, HUD... */
  const e = bloom.emissive();                                  // cleared once per frame
  for (const p of projectiles) bloom.glow(p.x - cameraX, p.y - cameraY, 10, '#ffb050');
  e.drawImage(crystalSprite, crystal.x - cameraX, crystal.y - cameraY);   // the glowing part only
  bloom.render();                                              // last line of every draw path
}
function onBigHit(target) {                                    // your existing hit site: add one line
  bloom.flare(target.dead ? 1.2 : 0.6, { at: { x: target.x - cameraX, y: target.y - cameraY } });
}
// level / battle / life start: bloom.clear();
```

## Choosing the source

- **Dark scenes only (night, dungeon, space, neon):** `source: 'both'` (the module's own default). Bright pixels bloom on their own; the emissive layer adds glow to coloured lights that are not the brightest pixels (an orange fireball has a bright channel, a deep-blue crystal does not).
- **Any scene with large bright areas (sky, sand, snow, white clouds, white UI text, a pixel game with lots of pure white): `source: 'emissive'`** (the recommended default for an unknown game). Only what you draw into `emissive()` glows.
- **Bright daytime scene:** `source: 'emissive'`, `blend: 'screen'`, `intensity` 1.0-1.1 (`screen` never clips), `radius` 0.6, and `glow()` halos at alpha 0.5-0.6 with `r` a little larger than the sprite: on a light sky a fainter halo is not seen at all. Also mark the sun disc, a flag or beacon tip, lit windows.
- **No emissive drawing at all:** `source: 'luma'`.

## Scene-brightness guard (`adapt`)

Every 4th game frame the module shrinks the game canvas to 16 px wide on the CPU and measures `cover` (share of the screen whose brightest channel is above the start of the knee) and `mean` (mean brightness). With `adapt` 1 (default):
- bright-pixel bloom × (1 − 0.97 × smoothstep(0.06, 0.3, cover)): a sunlit desert or a blue sky barely blooms by luminance even with `source: 'both'`; a night scene with a moon is untouched;
- flares × (1 − 0.65 × smoothstep(0.3, 0.65, mean)), capped at 1.2: a kill flare on a daylight frame is a small warm burst (about a third of its night strength, never a whiteout); on a dark scene it stays punchy;
- overall intensity × (1 − 0.4 × smoothstep(0.45, 0.8, mean)).
`stats()` shows `sceneCover`, `sceneMean` and `guard`. The measure reads only the canvas pixels (deterministic for `?t=&freeze=1`). Set `adapt: 0` to turn it off.

## What to draw into the emissive layer

- **Pickups, characters, healed or buffed units:** only a `glow(x, y, r, color, 0.3-0.5)` halo centred on them (r about the sprite's size). Do NOT redraw the whole sprite into the layer: the sprite then glows from inside and turns into a pale disc or a coloured blob.
- **Self-lit parts:** redraw only the part that is the light itself: a flame, a projectile's core, a crystal, an eye, a lamp, a spell particle (a few pixels), the sun or moon disc, a flag or beacon tip, plus a `glow()` if it should spread further.
- **UI that should glow** (a selected skill, a ready button): draw its rim or icon into the layer and add its rect with `glow: true`; the rect stays crisp and its glow spills softly onto the HUD around it.
- Thresholds are 0..1 because I-08's buffers are 8-bit: there is no "brighter than white". Pure white passes at full strength whatever the threshold; `knee` softens the start.

## Keep the rest of the game working

- Change nothing in how the game draws: not the canvas size, its CSS, the context transform or `imageSmoothingEnabled`. The emissive layer is a separate canvas; the game canvas is never touched.
- Draw into `emissive()` from the draw path, never from the update step. Never read it for game logic, never make game logic depend on `bloom.active`: `?auto=1` must end the same with WebGL on and off.
- Find every caller of what you touched: the `?t=` fast-forward (its single draw before freezing must also call `emissive()` and `render()`), `?auto=1`, restart, title and result screens, keyboard shortcuts.
- `uiRects`, `glow()` and `flare({at})` take on-screen (canvas or `view`) units: subtract the camera from world positions, as your draw does.
- `flare` once per big hit, where the hit is accepted (after any cooldown), never inside a per-frame overlap loop.
- Keep any shake, flash or hit-stop the game already has.

## Self-check without a browser

- Both module files are byte-identical to the ones given; `webgl-post.js` loads before `bloom-glow.js`, both before `create`.
- Exactly one `GameDNA_Post` instance per canvas: create it first and pass it as `post` (or let bloom make it, then never call `GameDNA_Post.create` again).
- `clock` returns step-counted game time; no `Date.now()`, `performance.now()` or `Math.random()` in the integration.
- Every draw path (title, play, pause, result, and the single draw after `?t=`) calls `bloom.render()` (or `post.render()`).
- Every rect in `uiRects` is in the same units as your HUD drawing (canvas px, or `view`); a HUD drawn at `x 0..W, y 0..14` gives `{x: 0, y: 0, w: W, h: 14}`.
- Walk one value with the defaults (threshold 0.78, knee 0.5, so the knee starts at 0.78 − 0.39 = 0.39): a pixel whose brightest channel is 0.9 passes 0.70 of its colour, 0.6 passes 0.12, 0.39 or less passes nothing, pure white passes fully. `flare(1.2)` at 0 ms makes the wide glow ×2.44 stronger, at 210 ms a quarter of that boost, nothing at 420 ms.
- With `?webgl=0`, `emissive()` returns a 1x1 scratch context: drawing into it is harmless and nothing appears.

## What it guarantees

- Effects depend only on the game clock, the canvas pixels, the emissive layer and the parameters: never on wall-clock time or `Math.random`. `?t=&freeze=1` frames are the same every run (±1 per channel between GPUs).
- When the post stage repaints by itself (I-08's watchdog on a frozen or unwired screen), the last emissive frame is kept, so a `?t=&freeze=1` screenshot still shows the glow.
- HUD pixels (`uiRects`, red channel of `uiMask`) are output unchanged, bit for bit (glow holes included, except `#0000ff` holes in a game-made `uiMask`), apart from the I-08 passes after bloom (grade, pulse).
- A shader that fails to compile disables the bloom passes with one `console.warn` (`stats().broken`); the game still shows.

## Cost (measured 2026-11-16, headless Chromium 1.65 / SwiftShader CPU renderer)

See `checks/cost.json` (the numbers below are copied from it). Each frame is `renderNow()` plus a 1-pixel `readPixels`, 60 frames averaged; "post only" is I-08 with no passes. Median of 3 runs, each started when the 1-minute load average was below 5 (3.8–5.0 at the start, 5.7–7.4 at the end: other agents shared the machine, so a fully idle machine would read a little lower).

| case | overlay px | post only | + bloom | bloom cost |
|---|---|---|---|---|
| 320x180 side-scroller, 1280 px window, dpr 1 | 1280×720 | 1.59 ms | 8.78 ms | 7.27 ms |
| 256x224 battle, 1280x900 window, dpr 1 | 1029×900 | 1.7 ms | 10.24 ms | 8.54 ms |
| 640x360 HD, dpr 1 | 922×519 | 1.09 ms | 6.2 ms | 5.03 ms |
| 1280x720 HD (demo), dpr 1 | 922×519 | 2.09 ms | 7.07 ms | 4.97 ms |
| 1280x720 HD, dpr 2 | 1844×1037 | 4.71 ms | 20.66 ms | 15.95 ms |
| 256x224 battle, dpr 2 | 1656×1449 | 4.58 ms | 25.77 ms | 21.05 ms |
| phone 390 px, dpr 3 (capped to 2) | 780×439 | 0.79 ms | 3.92 ms | 3.13 ms |

The earlier table (load ~13) read about twice these numbers. The v1.1 changes are CPU-side only (the mask raster, which runs when the rects change), so the GPU passes are the same as v1.0.

Only the composite runs at full resolution (5 texture reads per pixel); the bright pass is 1/2, the blur 1/4 to 1/16. On a quiet SwiftShader run bloom cost about as much as I-08's grade + pulse together. Lower I-08's `dpr` to 1 on weak devices. A real GPU is many times faster than SwiftShader.

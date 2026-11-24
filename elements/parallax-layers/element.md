# I-02 Multi-layer parallax backdrop

## 1. What it is

The game's single flat background picture is replaced by a stack of 3–6 pixel-art layers that are generated once from a seed and scroll at different fractions of the camera, so the world gains depth the moment the camera moves. From back to front: a fixed sky (vertical gradient in dithered bands, with a sun, a low dusk sun and cloud streaks, or a crescent moon and stars), a cloud layer that also drifts on its own (in the cave theme a ceiling with stalactites instead), a pale far range, a back range, a mid line of trees, sea stacks or buildings, and a dark near layer of bushes, rocks or rooftops. Each layer tiles seamlessly and moves by whole pixels. A few small things move by themselves: clouds drift, stars twinkle, grass tufts sway, fireflies blink at dusk, sun glints flash on the sea, water drips and crystals pulse in caves, windows go dark and antenna lights blink in the city. Four original, generic themes (forest, cliffs / sea coast, cave, city) and three palettes (day, dusk, night) are selectable. For static screens such as a side-view battle there is a slow sway or idle pan and an optional static floor plane. The game keeps its own camera and clock; the module only draws first in the frame.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `theme` | forest | forest, cliffs, cave, city | Setting; pick the closest to the game |
| `time` | day | day, dusk, night | Palette grade (sky ramp, colour multiply, shadow tint, haze) |
| `layers` | 5 | 3–6 | 3 = sky, far, mid · 4 = + near · 5 = + clouds · 6 = + back range |
| `depth` | 1 | 0–1.3 | Multiplies the scroll factors: clouds 0.08, far 0.16, back 0.30, mid 0.48, near 0.72 (sky and floor 0) |
| `vertical` | 0 | 0–1 | Share of `camY` the layers follow (× their factor), clamped to ±32 px |
| `ambient` | 1 | 0–2 | Amount and speed of ambient motion; 0 = still. Never changes the picture itself |
| `drift` | 1 | 0–4 | Cloud drift, 3 px/s at 1 |
| `horizon` | 0.5 | 0.15–0.8 | Base of the far range, fraction of the view height |
| `ground` | 0.82 | 0.3–1 | Where the game's ground starts (top of the ground tiles), fraction of the view height |
| `idle` | 0 | −40–40 px/s | Automatic pan for static screens |
| `sway` | 0 | 0–8 px | Slow sideways sway (8 s period) for static screens |
| `detail` | 1 | 0.5–1.5 | Density of trees, crystals, buildings |
| `floor` | none | none, plain | Static perspective ground plane from `ground` down, with prop groups at its edges and darker front corners |

## 3. Variants

- **Side-scroller forest** (defaults): blue sky, snow-tipped far range, round and pointed trees, dark bushes with swaying grass.
- **Dusk coast**: `cliffs`, `dusk`, 6 layers: orange horizon, sea mirroring the sky with wave dashes and glints, distant headlands, sea stacks with grass caps and foam.
- **Night city**: `city`, `night`, 6 layers, `vertical 0.5`: stars and moon, three depths of buildings with lit windows (some go dark), blinking antenna lights, rooftop lamps.
- **Crystal cave**: `cave`, `night`: ceiling with stalactites, rock columns, stalagmites, pulsing teal and violet crystals, glowing mushrooms, drips; by day, shafts of light with dust.
- **Battle backdrop**: `floor plain`, `ground 0.56`, `horizon 0.4`, `sway 2`, camera fixed at 0.
- **Minimal**: 3 layers, `ambient 0.5`.

## 4. Interface

**Needs**
- The camera position in world px used to draw the tiles (`camX`, optionally `camY`), passed to `draw` each frame.
- A fixed 60 Hz step (the one `?t=` fast-forward runs) in which `update(stepMs)` advances the ambient clock; or the world time passed as `tMs`.
- The draw slot where the old background was painted: first in the frame, before tiles and sprites, outside any shake translate.
- Optional: sprite and UI rects (`getObstacles`, `uiRects`) in screen px.

**Provides**
- The whole background of `view`.
- `layers()` (names and factors), `layerImages()` (the generated canvases, for tools) and `lastDrawn()` (view, clock, camera and per-layer offsets of the last draw, for tests).

**Delivery (v1).** All of this is `module/parallax-layers.js` (one global `GameDNA_Parallax`; API, a 15-line integration and a self-check in `module/README.md`). The host calls `create({view, seed, theme, time, skin, params, getObstacles, uiRects})` once, `prebuild()` at load, `update(stepMs)` in the fixed step, `draw(ctx, camX, camY)` first in every frame, and `setTheme` / `setTime` / `setParams` when it wants a different look. The module draws through `GameDNA_Skin.resolve(options.skin)` when the skin API is loaded: `skin.pixel === false` switches dithered bands to smooth gradients, `skin.motion.stepMs` steps the ambient clock, and `skin.palette.backdrop.<theme>` may replace any ramp (`sky.{day,dusk,night}`, `far`, `back`, `mid`, `near`, …); without the skin API it uses a built-in pixel16 look.

## 5. Screen rules (exact numbers)

Native canvas (any size via `view`), integer-scaled by the host, nearest-neighbour. One layer pixel = one native pixel.

- **Tiling**: every scrolling layer is generated at tile width `TW = max(256, 128 × ceil(1.5 × view.w / 128))` (512 for a 320 or 256 wide view) from periodic value noise whose cells (128, 64, 32, 16, 8 px) divide `TW`, and props are drawn with wrap-around, so the tile edge is no larger a change than any neighbouring column pair (measured on all layers of all themes).
- **Offsets**: layer x offset = `floor(camX' × factor × depth + drift)`, where `camX' = camX + idle × t + sway × sin(2πt / 8 s)`; drawn at `view.x − (offset mod TW)` and repeated to the right edge. Vertical: `−round(camY × factor × depth × vertical)`, clamped to ±32 px; every layer extends 32 px below the view so a shift never opens a gap. Floor is used, not round, so a camera that moves one way never makes a layer step back.
- **Layout** (view height `H`, `hz = horizon × H`, `gy = ground × H`, `span = gy − hz`): far range base `hz`, height ≤ 0.22 H (0.16 H with a floor); back range base `hz + 0.32 span`; mid base `hz + 0.66 span`, trees 0.6–1.15 × 0.17 H tall; near base `gy + 0.3 (H − gy)` (on the ground line with a floor), bumps ≤ 0.14 H. Below each base the layer is filled down to the bottom, so pits and gaps in the game's ground show dark undergrowth, never the sky.
- **Colour**: each material has a 5-step ramp (deep shadow, shadow, base, light, highlight) lit from the upper left; light faces and rims one or two steps up. Time grade: dusk multiplies by (1.0, 0.80, 0.76) and tints shadows violet (#5a2e5a, 22 %); night multiplies by (0.34, 0.40, 0.62) and tints #121836 (28 %). Haze: each layer is mixed toward the horizon colour by `(1 − depth) × atm` (atm 0.5 day, 0.42 dusk, 0.3 night; depth far 0.12, back 0.38, mid 0.68, near 0.95), so far layers are pale and low in contrast and the near layer is the darkest.
- **Dithering**: 4×4 Bayer only in the transition band between two ramp steps (the middle ~40 % of each step), never as a whole-area checkerboard; non-pixel skins mix smoothly instead.
- **Ambient limits** (fixed camera, 4 s, 0.25 s samples, at `ambient 1`): footprint 0.010–0.048 of the field, ≤ 1.2 % of pixels change between consecutive frames, ≤ 2.9 % bright pixels; screen-bar limits are 0.01–0.20, 1.5 %, 4 %. Every ambient item is 1–3 px; stars cycle at 0.2–0.6 Hz, tufts sway ±1 px at the tip, clouds drift 3 px/s, fireflies wander ±6 px.
- **Avoidance**: bright ambient pixels are skipped within 3 px of any `getObstacles()` / `uiRects` rect.
- **Floor** (`plain`): rows from `gy` to the bottom get a perspective texture per theme (grass marks, sand ripples, stone slabs, cobbles), contrast halved in the standing area with a dithered edge, 10 prop groups (rocks, clumps, crates or crystal shards) along the back edge and in the front corners, and darker corners (the darkest foreground layer).
- **Determinism**: art uses one seeded generator, ambient items another, the sky a third; the amount of ambient motion and the time of day never move the trees, rocks or buildings.

## 6. Common mistakes (symptom -> fix)

- Backdrop drawn over the tiles or sprites -> `draw` is called after them; call it first, where the old background was drawn.
- The far mountains move as fast as the ground -> `camX` passed already multiplied or negated; pass the same camera number the tiles subtract.
- Layers step back and forth by a pixel while walking -> the game passes a float camera that jitters; the module floors it, but round the game's own camera once per frame.
- Stars and grass frozen, or different in every `?t=&freeze=1` shot -> `update` is in the render loop or reads real time; call `update(stepMs)` in the fixed step.
- A one-frame hitch when a level starts -> layers are generated on first draw; call `prebuild()` at load (and after `setTheme`, between levels).
- Trees too high or buried under the tiles -> `ground` is wrong; it is the top of the ground tiles divided by the view height.
- The edges of the screen flash during a screen shake -> the backdrop is drawn inside the shake translate; draw it before the translate.
- Pits show bright sky -> the view ends above the pit bottom; `view` must cover the whole play field.
- A static battle screen looks dead -> give it `sway: 2` or `idle: 4`, and keep the camera at 0.
- Title or result screens went black -> the old background was removed from those screens too; draw the backdrop there or keep the old one.
- A sparkle sits next to a character and reads like an effect -> pass the sprites in `getObstacles`.

## 7. Acceptance moments

1. **Freeze at a scrolled moment** (`?t=6000&freeze=1` on a side-scroller): sky bands, far range, a tree / cliff / building line and dark near foliage behind the tiles; no flat colour left; the hero and tiles on top.
2. **Two freezes 1 s apart**: clouds shifted 3 px, some stars or lights changed, grass tips leaned; everything else identical.
3. **Same freeze twice**: identical pixels.
4. **Camera moved by 200 px**: far layer 32 px, mid 96 px, near 144 px; no seam or gap anywhere along the strip.
5. **Each theme × time** (12 frames): readable silhouettes, far layers paler than near ones, the near layer darkest.
6. **Static battle** (`floor plain` or the game's own ground kept): units stand out from the backdrop; the backdrop sways slowly; HUD untouched.
7. **500 px wide window**: the game still fits; the backdrop at 1× still reads as layers.

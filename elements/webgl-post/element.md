# I-08 WebGL post-process pipeline

## 1. What it is

A post-processing stage for games that draw on a plain 2D canvas. The game keeps drawing exactly as before. The module lays a WebGL canvas over the game canvas, in exactly the same CSS box, with `pointer-events: none`, at device resolution. Each frame it uploads the game canvas as a texture and runs a chain of fragment-shader passes. Two passes are built in:
- **grade**: a filmic tone curve, an S-contrast, a matte lift, saturation, warm-highlight / cool-shadow split toning and a soft vignette;
- **pulse**: a chromatic hit-pulse. On a hit, the colour channels split outward from the contact point with a small zoom punch, then fade on the game clock.

The point of the element is the **pass registry**. Bloom (J-03), colour LUT (J-06), 2D lights (J-01), depth of field (J-04) and lens effects (J-07) are each one `addPass` call, about 20 lines, on top of this module. Extra host canvases (a depth map, a light mask) plug into named input slots.

WebGL is optional. It can be missing, the URL can say `?webgl=0`, the context can be lost, or the shaders can keep failing. In every one of these cases the overlay is absent or hidden, every method is a no-op, and the 2D game shows exactly as before. The module never touches game state, so `?auto=1` ends identically with WebGL on and off.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `passes` | grade+pulse | grade+pulse, grade, pulse, none | Built-in passes enabled at start |
| `look` | filmic | filmic, warm, cold, punchy, neutral | Grade preset (sets the six numbers below) |
| `vignette` | 0.35 | 0–1 | Corner darkening toward the ink colour |
| `chroma` | 5 px | 0–16 | Colour split at full pulse, CSS px on an 800 px wide canvas (×0.4–×1.25 with canvas width) |
| `decay` | 260 ms | 80–900 | Pulse fade, game time |
| `sample` | auto | auto, sharp, nearest, linear | How the game canvas is magnified: `auto` = `sharp` when the canvas CSS is `image-rendering: pixelated`, else `linear` (the browser's own look) |
| module-only | | | `exposure`, `contrast`, `saturation`, `warmth`, `lift`, `filmic`, `punch` 0.012, `dpr` 2 (max device px per CSS px), `maxPixels` 2.4 M, `webgl` auto/off |

| look | exposure | contrast | saturation | warmth | lift | filmic |
|---|---|---|---|---|---|---|
| filmic | 1.00 | 0.20 | 1.08 | 0.25 | 0.03 | 0.70 |
| warm | 1.04 | 0.18 | 1.14 | 0.60 | 0.02 | 0.60 |
| cold | 0.96 | 0.22 | 0.86 | −0.55 | 0.04 | 0.60 |
| punchy | 1.04 | 0.36 | 1.28 | 0.12 | 0.00 | 0.80 |
| neutral | 1 | 0 | 1 | 0 | 0 | 0 |

## 3. Variants

- **Filmic** (default): subtle depth and a warm/cool tone, vignette 0.35.
- **Golden hour**: `look: warm`, vignette 0.45.
- **Moonlit**: `look: cold`, vignette 0.5.
- **Arcade punch**: `look: punchy`, chroma 9, fade 340 ms.
- **Crisp pixels, grade only**: `passes: grade`, `sample: sharp`. A pixel game whose CSS stretches it blurrily gets crisp squares, with anti-aliased edges at non-integer scales.

## 4. Interface

**Needs**
- The canvas element the game draws on.
- `render()` once per drawn frame, on every draw path. It may be called before or after the game draws: the post frame is taken at the end of the task.
- Optional: `uiRects` (HUD rects in canvas px; the grade and pulse leave them untouched; shared `uiMask` input), `clock: () => gameMs`, step-counted; hit sites calling `pulse(strength, {at})` with `at` in canvas px; extra input canvases through `setInput(name, canvas)`.

**Provides**
- The overlay and the chain; `active`, `mode` ('webgl2' | 'webgl' | 'off'), `reason`.
- The registry: `addPass({name, frag, uniforms(s, p), params, scale, inputs, order, branch, keep, skip, enabled, defaults}) → name`, `removePass`, `enable`, `set`, `get`, `passes`, `setInput` / `removeInput`.
- `pulse`, `clear`, `setParams`, `setEnabled`, `stats`, `resize`, `destroy`; `GameDNA_Post.supported()` and `GameDNA_Post.instances()`.

**Delivery (v1).** `module/webgl-post.js`, one global `GameDNA_Post`. The API, a 15-line integration, the self-check and the guide for pass writers (prelude, order bands, bloom example) are in `module/README.md`. The module draws no 2D UI. A skin, if one is given, only sets the vignette's ink colour (`palette.ink`).

## 5. Screen rules (exact numbers)

- **Overlay box**: the game canvas's content box (border and padding excluded), from `getBoundingClientRect`, positioned `absolute` as the canvas's next sibling. It is re-measured on every render, on window resize and through a ResizeObserver. The z-index is copied when the canvas is positioned. The backing store is round(css × min(devicePixelRatio, `dpr`)), scaled down uniformly to at most `maxPixels`.
- **Chain**: input pass (magnify the game canvas to the overlay size, `sharp` = sharp-bilinear) → enabled passes by `order` (built-ins: grade 800, pulse 900) → screen. The last chain pass draws straight to the screen. Unnamed outputs ping-pong between two RGBA8 buffers per size. Named outputs (read by a later pass) get their own buffer. `pulse` is skipped while its value is below 0.002.
- **Grade**, per pixel:
  1. rgb^2.2 × exposure.
  2. Mix with ACES-fit(x × 0.6) / 0.6732 by `filmic` (white stays 1, mid-grey 0.18 → 0.21).
  3. Back to ^1/2.2.
  4. Mix with smoothstep(c) by `contrast`; lift toward (0.80, 0.90, 1.15) × `lift`; saturation around Rec.709 luma.
  5. Multiply by a tone that runs from cool (0.90, 0.99, 1.10) in the shadows to warm (1.08, 1.00, 0.88) in the highlights, by |`warmth`|; the inverse when `warmth` is negative.
  6. Vignette: mix toward the ink colour by `vignette` × smoothstep(0.38, 1.08, d), where d is the aspect-correct distance from the centre (1 at a corner).
  7. ±0.5/255 dither.
- **Pulse**: value = amp × (1 − Δt / decay)², where Δt is game ms since the pulse. A new pulse takes max(current, new). The colour split is `chroma` × width factor × value device px (× dpr) along the direction from `at`, ramping in over the first 45 % of the larger screen side. The zoom is `punch` × value toward `at`. There is a warm additive glow of 0.07 × value that falls off over 22 % of the height. If the clock goes back (restart), the pulse is dropped.
- **Timing**: the `clock` is the only time source; without one, it is post frames × 16.7 ms. No wall clock, no `Math.random`. `preserveDrawingBuffer` is on.
- **HUD mask**: grade and pulse output `mix(effect, incoming, uiMask.r × uiMaskOn)`. Without a mask the output is bit-identical to v1.0 (same determinism hash). `uiRects` (canvas px) are rasterised by I-08 into the shared `uiMask` slot only while no other element holds that slot. A J element's own mask wins, and I-08 then just reads it.
- **Watchdog**: if `render()` was not called for 2 animation frames, the module repaints from the canvas: every frame for 120 frames, then every 15th.

## 6. Common mistakes (symptom → fix)

- Title or result screen frozen on an old picture, or `stats().watchdog` climbing → that draw path has no `render()`. Add it to every path (or the top of the draw function).
- A `?t=&freeze=1` screenshot shows the plain 2D look → the single draw after the fast-forward does not reach `render()`.
- The pulse spreads from the wrong place on scrolling levels → `at` was given in world coordinates; subtract the camera.
- Dozens of pulses per swing, the colours never settle → `pulse` sits in a per-frame overlap test; call it where the hit is accepted.
- Pulses fade at wall-clock speed, or freeze frames differ → `clock` reads `Date.now()` / `performance.now()`; use the step counter.
- The game ends differently with `?webgl=0` → game logic reads `post.active` or the overlay; it must not.
- HUD text fringed by the pulse or tinted by the grade → no `uiRects` given (or rects in world / CSS px); pass the HUD rects in canvas px.
- An ungraded box around HUD text → a hard rect around text with no panel behind it; mask the panel; leave plate-less text unmasked or give it a backing box.
- The overlay sits offset from the game → the agent re-styled or wrapped the canvas after `create`, inside a CSS-transformed parent. Call `post.resize()` after layout changes; do not transform parents.
- Black overlay → the game draws into a different canvas than the one passed; pass the visible canvas.
- A J-element's pass never shows → its shader failed to compile (one `console.warn`; `post.get(name).error`).

## 7. Acceptance moments

| Shot | Must be visible |
|---|---|
| `demo/?t=600&freeze=1` | Dusk glade (knight, slime, ruins, brazier, crystal shrine) with deeper shadows, warm highlights, cool shadows and soft dark corners; HUD crisp. |
| same, `--disable-webgl` or `&webgl=0` | The plain 2D canvas, the status reads "2D only", no errors. |
| `demo/?t=600&freeze=1&split=0.5` | Left half 2D only, right half post: the difference is obvious but not garish. |
| Demo "Hold to see 2D only" (or hold C) | The whole frame flips to the plain 2D canvas while held, so any one object can be compared before / after. |
| `demo/?t=6480&freeze=1` vs `&ui=0` | HUD panels untouched by the finisher's split with the mask; fringed without it. |
| `demo/?t=1300&freeze=1` | Heavy strike: colour fringes spreading from the impact, strongest at the edges and HUD; small zoom toward the slime. |
| `demo/?t=6480&freeze=1` | Finisher (148): stronger split and glow. |
| `demo/?t=600&freeze=1&res=px&split=0.5` | A 320×180 canvas: pixel squares stay crisp on the post side (sharp bilinear). |
| `demo/?t=600&freeze=1&haze=0.7` | The README example pass: lilac haze on the far mountains only, read from the depth input; it also reads `uiMask`, so the HUD plates stay unhazed. |
| Phone width 500 px | Canvas fits, no horizontal scroll, the split scaled down with the canvas. |
| Hosts (`checks/hosts/`) | Sidescroll and topdown: overlay exactly on the canvas (max misalignment 0 px), the grade visible, a pulse on a killing blow; `?auto=1` ends like the original with WebGL on and off. |

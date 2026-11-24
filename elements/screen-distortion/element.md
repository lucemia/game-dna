# J-08 Screen-space distortion

## 1. What it is

The finished picture bends the way hot air, water and glass bend light. **Heat** regions shimmer: fine horizontal ripples that rise, strongest at the bottom of the region where the fire, lava or vent is. **Water** regions wobble slowly and widely, with faint caustic glints. **Portal** regions swirl the scene behind them and pull it toward the centre like a lens, with a rippling, colour-fringed rim. **Shockwaves** are rings of refraction that expand from an explosion, a ground slam or a killing blow: the picture swells outward just ahead of the front and is pulled in just behind it, then the ring fades.

It is a J-family element on I-08: one fragment-shader pass (`distort`, order 350, the distortion band) on the shared `GameDNA_Post` chain. It changes only **where each pixel is read from** (a UV offset); apart from an optional faint light on wave fronts, portal rims and water glints (`shine`) and a colour fringe on fronts and rims (`chroma`), no colour is repainted. HUD rects are never displaced, and the world never samples HUD pixels. Without WebGL, or with `?webgl=0`, nothing changes.

## 2. Default parameters

All pixel sizes are for a 360 px tall view and scale with the view height (a 180 px pixel game gets half).

| Key | Default | Range | Meaning |
|---|---|---|---|
| `strength` | 1 | 0–2 | Multiplies every effect |
| `heat` | 2.2 px | 0–4 (module clamps at 8) | Heat-haze swing at region amount 1 |
| `water` | 2.2 px | 0–6 (module clamps at 10) | Water wobble swing |
| `portal` | 1 | 0–2 | Portal swirl (≈1.7 rad at the centre) and lens pull |
| `wave` | 9 px | 0–24 (module clamps at 40) | Shockwave swell at strength 1 |
| `waveRadius` | 150 px | 40–400 (module 10–2000) | Shockwave reach at strength 1 (× (0.55 + 0.45 s)) |
| `waveWidth` | 22 px | 2–200 | Module-only: refracting band (× (0.7 + 0.3 s), widening to 1.45× with age) |
| `waveMs` | 650 ms | 60– | Module-only: wave life at strength 1 (× (0.8 + 0.2 s)) |
| `chroma` | 0.35 | 0–1 | Colour fringe on wave fronts and portal rims |
| `shine` | 0.35 | 0–1 | Faint light on fronts, rims and water glints |
| `underwater` | 0 | 0–1 | Module-only: the whole view wobbles |
| `snap` | false | | Module-only: offsets snap to whole canvas pixels |
| `uiFeather` | 6 px | 0–32 | Module-only: distortion fades out before a HUD rect (view px) |

## 3. Variants

- **Default**: as above.
- **Subtle**: strength 0.6, wave 6, chroma 0.15, shine 0.15.
- **Dramatic**: strength 1.3, wave 14, reach 220, chroma 0.7, shine 0.6, heat 3.2, water 3.2, portal 1.4.
- **Pure UV**: chroma 0, shine 0 (only pixels move).
- **Pixel**: snap on, chroma 0, shine 0.25 (chunky whole-pixel wobble for pixel art).

## 4. Interface

**Needs**
- I-08 `webgl-post.js` loaded first; the game's instance passed as `post`, or the module finds or makes one for the canvas.
- `render()` (or `post.render()`) once per drawn frame on every draw path, including the single draw after the `?t=` fast-forward.
- The game's step clock in ms. Optional: `regions()` (on-screen heat / water / portal shapes, camera subtracted), shockwave events with an on-screen point, `uiRects` (with `view` when the backing store is scaled).

**Provides**
- The `distort` pass; `shockwave(x, y, {strength, radius, width, duration, amplitude, chroma})`; `clear()`; `setRegions`, `setUiRects`, `setParams`, `setEnabled`; `liveWaves()`, `stats()`.

**Delivery (v1).** `module/screen-distortion.js` (one global `GameDNA_Distort`; API, a 15-line integration and a self-check in `module/README.md`), shipped with `webgl-post.js`. The module draws nothing on the game canvas and never writes the shared `uiMask` (other J elements own it); it reads it and keeps its own feathered `distortMask` input.

## 5. Screen rules (exact numbers)

- **Units**: u = canvas height / 360; region and wave numbers are converted to canvas px; region patterns use region-local coordinates in u, so they move with the region (the camera), not with the screen.
- **Edge fade**: rect regions w = smoothstep of (distance to the nearest edge / soft); ellipses use (1 − r) × short half-axis / soft. Default soft: 20 % of the short side (heat), 30 % (portal) or 8 % (water), at most 24u.
- **Heat**: offset = (0.6 sin(0.55y + 9t + 1.6 sin(0.08x + 1.7t)) + 0.4 sin(1.1y + 13t + 0.05x), 0.5 sin(0.42y + 0.13x + 7.5t)) × heat × amount × u × w × (0.45 + 0.55 × depth), depth 0 at the top, 1 at the bottom; t in game seconds (ripples ≈ 11 px apart). It needs detail behind it (bricks, foliage, a ridge line): over a smooth sky gradient there is nothing to bend.
- **Water**: offset = (sin(0.11y + 2.1t + sin(0.03x + 0.7t)) + 0.45 sin(0.29y − 3.3t + 0.04x), 0.55 sin(0.085x + 1.6t + 0.02y)) × water × amount × u × w; glints: pale cyan (0.62, 0.9, 1.0) × 0.16 × w × smoothstep(0.3, 0.95, product of two warped low-frequency sines) × shine / 0.35, screened onto the pixel (soft round patches, not lines).
- **Portal** (ellipse, q = position / half-axes, r = |q|): swirl angle k (1.7 + 0.45 sin 1.3t)(1 − r)²; the rotated q is scaled by mix(1, 0.45 + 0.55r, k/1.5) (pulled toward the centre); a rim ripple 0.05k sin(7θ + 4t) × exp(−90 (r − 0.86)²); fringe weight rim × 0.7k + 0.25k (1 − r).
- **Shockwave**: x = (distance − R(τ)) / band; profile = 2.33 x e^(−x²) (±1 at x = ±0.71); offset = −direction × profile × swell, faded to 0 within one band of the centre. τ = age / life; R = reach × (1 − (1 − τ)³); swell = wave × s × (1 − τ)² × min(1, τ/0.06 + 0.25); band = width × (0.55 + 0.9τ). Light = shine × 0.5 × fade × s × e^(−3 (x − 0.35)²). Max 8 alive (oldest dropped); same spot (8u) within 50 ms merges (max strength).
- **Fringe**: red is read at offset × (1 + c), blue at × (1 − c), c = chroma × clamp(weight, 0, 1).
- **HUD**: offsets × (1 − feather map); feather map = 1 inside a HUD rect, ramping to 0 at `uiFeather` out (8 stacked steps, ≤ 320 px wide, linear); 0 where the shared `uiMask` red ≥ 0.5; if the displaced read lands in a HUD rect the pixel is read unbent.
- **Idle**: no region on screen and no live wave → the pass is skipped.
- **Cost**: one full-resolution pass; measured numbers in `checks/cost.json` and `checks/build-report.md`.

## 6. Common mistakes (symptom → fix)

- A shimmer or wobble that slides when the camera moves, or sits beside the fire → regions in world coordinates; subtract the camera (and use `view` units for a scaled backing store).
- The whole screen wobbles on every frame → a full-screen water region; use `params.underwater` only for a level that is under water, otherwise a rect over the water as drawn.
- Rings stack into a blur, or every hit makes a huge ring → `shockwave` inside a per-frame overlap loop or on every light hit; call it once where the event is accepted, with strength 0.5 / 0.8 / 1–1.4.
- A ring starts in the middle of the screen → the point was not converted to on-screen units (or was NaN; the module ignores NaN).
- HUD text bends when a ring crosses it → that element is missing from `uiRects` (include plate-less text too; for distortion it leaves no box).
- Heat haze invisible → the region sits over a smooth gradient (sky); place it over the source and detailed scenery, or raise `heat`.
- Frozen `?t=&freeze=1` frames show no wave or a different one → `clock` is wall time, or the draw after the fast-forward does not call `render()`.
- Two overlays / double grade → `GameDNA_Post.create` called twice for the canvas; create once and pass `post`.

## 7. Acceptance moments

- A heat region over a fire: the area above it ripples upward, strongest near the flame, edges fade out; the HUD and other areas are still.
- A water region: slow wide wobble plus glints, confined to the water.
- A portal: swirled, lens-pulled interior and a rippling, fringed rim.
- An explosion, slam or kill: one ring expands from the contact point and fades within about a second (strength 1: 650 ms); text and windows it crosses stay sharp and still.
- `?webgl=0` and a browser without WebGL: pixel-identical to the game without the element; `?auto=1` ends the same with WebGL on and off.

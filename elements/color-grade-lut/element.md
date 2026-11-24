# J-06 Colour grading LUT

## 1. What it is

A colour grade for games that draw on a plain 2D canvas, built on the I-08 WebGL post pipeline. Every colour on screen is replaced by the colour a **3D lookup table** holds for it. One table is one mood, so a zone, a time of day or a story beat each get their own look without touching any art.

- **The table** is 32×32×32 colours, stored as a 1024×32 strip texture (32 tiles of 32×32: blue picks the tile, red is x, green is y) and read with trilinear filtering (two texture fetches per table).
- **Five original moods are generated in code** from short recipes, so no image files are needed: `dusk`, `night` (cold night), `memory` (faded memory), `combat` (high-contrast combat) and `toxic` (toxic swamp), plus `neutral` (identity). A designer can add their own from a recipe, a `.cube` file (any size, resampled), a PNG strip or grid, a float array, or a function.
- **Two table slots blend over game time.** `grade.to('night', 1200)` fades from the look on screen now to the night table in 1.2 s of game time. It is idempotent, so the game can call it every step from "which zone / phase am I in". A new target mid-blend starts from the colours on screen (the current mix is baked into a new strip), so nothing jumps.
- **Strength** mixes the graded colour with the original.
- **Lens finish** (folded in from J-07): a soft vignette toward the ink colour, with slight edge desaturation, and luminance film grain that is strongest in the midtones and changes 24 times per game second. The grain is deterministic: it depends only on game time and pixel position.
- **The HUD stays exactly as drawn**: both passes read the shared `uiMask` input, white = UI. The module builds it from `uiRects`, with optional rounded corners.
- **Before/after**: `compare(x)` splits the same frame at x, with the original on the left and the graded frame on the right.

**Without WebGL nothing changes.** Without WebGL, with `?webgl=0`, or without I-08, every call is a no-op and the 2D canvas shows exactly as before. The module never touches game state.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `preset` | neutral | neutral, dusk, night, memory, combat, toxic | Look at start |
| `strength` | 1 | 0–1 | Mix of the LUT over the original |
| `blend` | 900 ms | 0–3000 | Duration of `to(name)` when no duration is given |
| `vignette` | 0.3 | 0–1 | Corner darkening (this module's own vignette) |
| `grain` | 0.035 | 0–0.3 | Film grain amplitude |
| `builtin` | replace | replace, keep | What happens to the I-08 built-in grade |
| module-only | | | `grainSize` 1.5 CSS px, `grainFps` 24, `compare` −1 (off), `webgl` auto/off |

| preset | recipe (summary) |
|---|---|
| dusk | −0.12 EV, warm +0.42, magenta +0.18, contrast +0.18; blues toward lilac (+28°), greens toward olive (−16°); violet shadows #55306f, amber highlights #ffad66; black #0c0712 |
| night | −1.05 EV, cool −0.6, saturation 0.42; blue shadows #1d3a78 (0.85), pale highlights #bcd6ff; warm saturated oranges (hue 32° ± 30°, saturation ≥ 0.55: fire, embers) are exempt from desaturation and toning and brightened ×1.7; pale warm light drawn at full brightness (hue 44° ± 34°, value ≥ 0.95: lit windows, lamp glass, a lamp halo's core) is held at 80 % of its drawn colour (v1.1); bright blue sky (value ≥ 0.8) ×0.78 (v1.1); black #03060f, white #e2eeff |
| memory | +0.06 EV, warm +0.32, contrast −0.26, saturation 0.42; cream highlights, mauve shadows; black #231d27, white #f6ecda |
| combat | (v1.1) −0.45 EV, contrast +0.55, saturation 0.95, midtone gamma 0.82–0.86; reds kept and ×1.45 saturation; greens −40 % saturation and +14° toward teal; deep teal shadows #06505e (1.05, wider range); warm highlights; black #010607, white #e9e6df |
| toxic | −0.1 EV, green tint −0.55, contrast +0.28; purples → teal-grey (−70°), blues → green (−40°); green shadows #123d2b, acid highlights #d8ff73 |

## 3. Variants

- **Moods per zone** (default): full-strength LUT, 900 ms blends, vignette 0.3, grain 0.035.
- **Gentle**: strength 0.5, vignette 0.2, grain 0.02. For games whose art is already strongly coloured. Flat, saturated pixel art: strength 0.6–0.75.
- **Filmic stack**: `builtin: keep`. The I-08 filmic grade runs after the LUT, with its vignette set to 0.
- **Clean pixels**: no vignette, no grain; only the LUT.
- **Hard cuts**: `blend: 0`. Flashback cuts and lightning-style switches.

## 4. Interface

**Needs**
- I-08 `webgl-post.js` loaded first. If the game creates its own `GameDNA_Post` instance, create it **before** this module, which finds it through `GameDNA_Post.instances()` and adds its passes to it. Otherwise the module makes its own instance with no built-in passes. A host instance that appears later is adopted on the next `render()`.
- `canvas`, a step-counted `clock`, `render()` on every draw path.
- From the game step: the current zone, phase or scene, mapped to a look name and passed to `to()`.
- Optional: `uiRects` (array or function, canvas px, `{x, y, w, h, r?, soft?}`), or the game's own `uiMask` canvas. Mask HUD that has its own backing plate; leave plate-less text (titles, labels on the field) unmasked.

**Provides**
- Passes `color-grade-lut` (order 750) and `lens-grain` (order 860) on the I-08 chain.
- `to(name, ms?)`, `set(name)`, `define(name, source)`, `setParams`, `compare(x)`, `setUiRects`, `state()`, `strip(name)`, `stats()`, `setEnabled`, `destroy`.
- Static helpers: `parseCube`, `fromStrip`, `fromArray`, `fromFunction`, `fromRecipe`, `identity`, `toCanvas`, `sample` (a CPU lookup with the same maths as the shader), `apply`.
- The `uiMask` input that other J passes (bloom, lights) read as well.

**Delivery (v1).** `module/color-grade-lut.js`, one global `GameDNA_ColorGrade`, shipped together with `webgl-post.js`. The module draws nothing in 2D. A skin only sets the vignette ink (`palette.ink`).

**Coexisting with I-08's built-in grade** (decision): by default the LUT **replaces** it. The built-in `grade` pass is switched off while this module runs, and this is re-asserted every frame. This module's lens pass is the only vignette. `builtin: 'keep'` lets the built-in grade run after the LUT, at order 800, with its vignette forced to 0 while ours is above 0. There is never a double vignette. `destroy()` restores both.

## 5. Screen rules (exact numbers)

- **LUT lookup** for colour c in 0..1:
  - `bz = c.b × 31`, b0 = floor(bz), b1 = min(b0 + 1, 31);
  - `u = (b × 32 + c.r × 31 + 0.5) / 1024` for b = b0 and b1;
  - `v = 1 − (c.g × 31 + 0.5) / 32`, since the strip is uploaded flipped;
  - the result mixes the two tile samples by `bz − b0`.
  - Slots A (from) and B (to): `out = mix(c, mix(A(c), B(c), m), strength)`, plus ±0.5/255 dither.
- **Blend**: m = smoothstep(0, 1, (now − t0) / ms). At 50 % of the time m = 0.5. If the game clock goes back (restart), m = 1. A new `to()` with m strictly between 0 and 1 bakes lerp(A, B, m) into a new strip, which becomes the new A.
- **Vignette**:
  - d = aspect-correct distance from the centre, 1 at a corner;
  - v = vignette × smoothstep(0.32, 1.12, d);
  - the colour is desaturated by 0.35 v, then mixed toward the ink by v.
- **Grain**:
  - cell = floor(fragCoord / (grainSize × dpr)), so cells are measured in CSS px;
  - the frame number is floor(ms × grainFps / 1000);
  - n = hash + hash − 1, a triangular distribution in −1..1;
  - the added value is n × grain × (1 − 0.7 × |2l − 1|²), a luminance offset only.
- **UI mask**: the mask canvas has the size of `view` (or of the canvas backing store). It is white inside the rects, with rounded rects when `r` is set, and is sampled nearest. Inside the mask, both passes output their input pixel unchanged. The mask is redrawn and uploaded only when the rect list changes.
- **Compare**: left of x the passes output their input, so the left side shows the original. A white line 1–1.6 device px wide marks x.
- **Skips**: the LUT pass is skipped while both slots are the identity (or strength is 0) and compare is off. The lens pass is skipped when vignette and grain are both 0.
- **Timing**: game clock only. No wall clock, no `Math.random`. Preset LUTs are generated once per page (about 20–25 ms each on a laptop CPU) and cached.

## 6. Common mistakes (symptom → fix)

- Two overlays, or the grade missing in a game that already had I-08 → `GameDNA_ColorGrade.create` ran before the game's `GameDNA_Post.create`. Create I-08 first. The module also adopts a late host instance on its next `render()`.
- Colours "pump" or restart their fade every frame → `to()` is called with a different name each frame (e.g. two zones fighting at a border), or the blend is restarted with `set()` per frame. Decide the look from state once per step; `to()` with the same name is a no-op.
- A `?t=&freeze=1` screenshot is ungraded or mid-blend at random → `to()` is driven from the draw function with wall-clock time, or the `?t=` draw does not reach `render()`.
- HUD text tinted blue at night → `uiRects` is missing, in the wrong space (world px, or forgetting a HUD offset), or the game ships I-08 older than v1.1 with `builtin: 'keep'` (from v1.1 the built-in grade and pulse also skip the mask).
- Ungraded boxes behind title text or labels → those rects mask text with no plate behind it; leave that text unmasked (or keep the title screen `neutral`).
- The look flickers in battle → the look is picked per turn or attacker; pick it per screen or phase.
- Square ungraded halos around rounded HUD panels, or a bright patch of daylight grass around a floating HP label → rects padded too much; give exact panel rects with `r` = the panel corner radius, and separate tight rects for a label and its bar.
- Double dark corners → the game's own 2D vignette, or the I-08 vignette in `keep` mode with an older module; turn one off (`vignette: 0` here or in the game).
- After a restart the first zone fades in from the game-over look → call `set(look)` where the new game starts.
- Grain crawling at wall-clock speed or differing between runs → `clock` missing (falls back to post frames) or reading `Date.now()`.
- The game ends differently with `?webgl=0` → game logic reads `grade.active` or `grade.state()`; it must not.

## 7. Acceptance moments

- **Each preset on the same scene** (demo `?t=2000/5000/8600/12200/15800/19400&freeze=1`). Each reads as its mood: dusk is warm with violet shadows; night is dark and blue while the fire, lantern and windows stay orange; memory is faded and creamy; combat is punchy with deep shadows; toxic is green-acid. The HUD portrait, bars and item icons are pixel-identical in all six.
- **Mid-blend** (`?t=7800&freeze=1`, dusk → night at about 48 %): a smooth in-between, with no banding steps.
- **Before/after on the same object** (`?preset=night&split=0.5`): the split line runs through the hero and the campfire; left is the plain frame, right is night.
- **HUD unprotected** (`?preset=night&hud=0`): the HUD turns dull and blue. This shows why `uiRects` matters.
- **Built-in keep** (`?builtin=keep&preset=dusk`): the filmic grade stacked after the LUT, with a single vignette.
- **WebGL off** (`--disable-webgl` or `?webgl=0`): the plain daylight scene, `grade.active` false, no errors.
- **Hosts**:
  - topdown: village `neutral`, `dusk` after the lantern is found, the slime meadow east of the river `toxic`, the battle screen `combat`, game over `memory`; the top HUD bar, dialog box and battle menus are untouched.
  - tactics: the player phase is `dusk` and the enemy phase blends to a colder `night`; the HUD strip and phase banners are untouched.

# color-grade-lut.js (J-06 module, v1.1)

One plain script with no dependencies and no `import`/`export`. It defines one global, `GameDNA_ColorGrade`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It is built on **I-08 `webgl-post.js` (global `GameDNA_Post`), which must load first** and is shipped next to it.

It colour-grades the game through a **3D lookup table** (LUT): every colour the game draws is replaced by the colour the table holds for it, so a whole mood (dusk, cold night, a faded flashback) is one texture. The table is 32×32×32, stored as a 1024×32 strip texture and read with trilinear filtering. Five original looks are generated in code (no image files); a designer can also load a `.cube` file, a PNG strip, a float array or a function. Two LUT slots **blend over game time**, `grade.to('night', 1200)`, for zones and story beats. A second pass adds the lens finish folded in from J-07: a **vignette** and deterministic **film grain**. Both passes leave HUD pixels untouched (the `uiMask` convention below).

**Without WebGL nothing changes.** Without WebGL, with `?webgl=0`, or without `webgl-post.js`, `create()` returns an instance whose methods are safe no-ops: the game looks and plays exactly as before. **No method ever throws.** The module never touches game state.

## Presets

| name | look |
|---|---|
| `neutral` | identity (no change) |
| `dusk` | warm amber highlights, violet shadows, blues pushed toward lilac, greens toward olive |
| `night` | cold night: about one stop darker, blue shadows, desaturated, bright blue sky a little darker still, but warm light sources keep their colour and glow (saturated oranges, and warm colours drawn at full brightness such as lit windows, lamp glass and the bright core of a lamp halo stay as drawn) |
| `memory` | faded memory: lifted, tinted blacks, low contrast, low saturation, cream highlights |
| `combat` | high-contrast combat: darker midtones, deep teal-to-black shadows, reds kept hot, greens muted toward teal (green-heavy games do not go neon) |
| `toxic` | toxic swamp: green-yellow cast, purples turned teal-grey, acid highlights, deep green blacks |

## API

`GameDNA_ColorGrade.create(options) → grade`

| option | meaning |
|---|---|
| `canvas` | The game's canvas element (or selector, or its 2D context). Required. |
| `clock` | `() => gameMs`, the game's step-counted time. Blends and grain follow it, so `?t=&freeze=1` frames are the same every run. Use the same clock as I-08. Without it, the post instance's time is used. |
| `post` | Optional: the game's I-08 instance. When left out, the module finds the I-08 instance already made for this canvas (`GameDNA_Post.instances()`), or creates its own with no built-in passes. |
| `params` | `preset` 'neutral'; `strength` 1 (0..1 mix of the LUT); `blend` 900 (ms used by `to(name)` without a duration); `vignette` 0.3 (0..1); `grain` 0.035 (0..0.3); `grainSize` 1.5 (CSS px); `grainFps` 24; `builtin` 'replace' \| 'keep' (the I-08 built-in grade, see below); `compare` −1 (before/after split x 0..1, < 0 off); `webgl` 'auto' \| 'off'. |
| `presets` | `{name: recipe \| LUT source}` added to the five built-ins (see "Your own LUTs"). |
| `uiRects` | HUD rects `[{x, y, w, h, r?, soft?}]` in canvas px (`r`: corner radius, for rounded panels; `soft`: px over which the mask fades out outside the rect, 0–32, for panels with a soft shadow or glow edge), or a function returning them (read every frame; return the rects of what is on screen now). Left untouched by both passes. |
| `view` | `{w, h}`: the coordinate space of `uiRects` when it is not the canvas backing size (e.g. a 640×360 game drawn on a 1280×720 canvas with `ctx.scale(2, 2)`). |
| `uiMask` | Alternative to `uiRects`: a canvas the same aspect as the game canvas, white where UI is. |
| `skin` / `ink` | The vignette fades to the skin's `palette.ink` (with `skin-api.js` loaded), or to `ink` ('#rrggbb'). |

| method | |
|---|---|
| `to(name, ms?)` | Blend to LUT `name` over `ms` of game time (default `params.blend`; 0 = cut). **Idempotent**: calling it again with the current target does nothing, so it is safe to call every step from "which zone / phase am I in". A new target mid-blend starts from the colours on screen now (no jump). Unknown names are ignored with one warning. |
| `set(name)` | Cut to `name` at once (scene start, restart). |
| `render(arg?)` | Call once per drawn frame on every draw path. Updates the UI mask and forwards to `post.render(arg)`. Calling `post.render()` as well is harmless. |
| `setParams(o)`, `params()` | Live parameters (as `params` above); `preset` cuts to that LUT. |
| `compare(x)` | Before/after split at x (0..1 of the canvas): left of the line shows the frame without this module's passes, right shows it graded, with a thin white line. `compare(false)` turns it off. |
| `setUiRects(rects \| fn \| null)` | Replace the UI rects. |
| `define(name, source)` | Add or replace a LUT (recipe object, `.cube` text, LUT object, image, or `(r, g, b) => [r, g, b]`). |
| `state()` | `{from, to, mix 0..1, blending, preset, ms, strength}`. |
| `has(name)`, `names()`, `lut(name?)`, `strip(name?) → 1024×32 canvas` | Lookups (the strip is the LUT image; save it as PNG to edit in a paint program). |
| `setEnabled(on)` | Turn both passes off / on (the rest of the I-08 chain keeps running). |
| `stats()` | `{mode, reason, active, owned, attached, passes, builtinGrade, blends, ignored, unknown, bakes, uploads, uiUpdates, uiRects, renders, reattached, errors, state}`. |
| `destroy()` | Remove both passes and inputs, restore the built-in grade; destroys the post instance only if this module made it. |
| `active`, `mode`, `reason`, `post` | `active` false = no-op (`reason`: 'url', 'option', 'no-canvas', 'no-webgl-post', or the post instance's reason such as 'no-webgl'). |

Static: `GameDNA_ColorGrade.presets` (the recipes), `defaults`, `parseCube(text)`, `fromStrip(image)`, `fromArray(size, values)`, `fromFunction(fn)`, `fromRecipe(recipe)`, `identity()`, `toCanvas(lut)`, `sample(lut, r, g, b)` (CPU lookup, same maths as the shader), `apply(recipe, [r, g, b])`, `shaders`, `orders`.

## Integration (15 lines)

```js
// <script src="webgl-post.js"></script> <script src="color-grade-lut.js"></script> before the game script
// if the game already has I-08: create it first (no change needed); this module shares that instance
const grade = GameDNA_ColorGrade.create({
  canvas: gameCanvas,
  clock: () => frameCount * 1000 / 60,                  // step-counted game time; never Date.now()
  params: { preset: 'neutral', strength: 1, vignette: 0.3, grain: 0.035, builtin: 'replace' },
  uiRects: () => hudRectsOnScreenNow()                    // canvas px: HUD bar, open windows, menus
});
function update() {                                       // inside the fixed step, after the game state changed
  /* ...existing step... */
  grade.to(scene === 'battle' ? 'combat' : zoneAt(player) === 'swamp' ? 'toxic' : 'neutral', 1200);
}
function draw() {
  /* ...existing drawing, unchanged... */
  grade.render();                                         // last line of EVERY draw path
}
// new game / restart / level load: grade.set(<that place's LUT>);
```

**Strength and when to switch.** The presets are tuned on painted, HD-style art. On flat, saturated pixel art (bright grass, sand, rivers) use `strength` 0.6–0.75, or `dusk` turns paths orange and `toxic` goes neon. Pick the look per screen, zone or phase (battle screen, enemy phase), not per turn or per attacker: a look that flips every few hundred ms never settles and reads as flicker.

## The built-in I-08 grade (decided: replace by default)

I-08 has a built-in `grade` pass (order 800) with its own vignette. Two grades and two vignettes stacked look muddy, so:
- `builtin: 'replace'` (default): while this module runs, the built-in `grade` pass is switched off (it is checked every frame, so a later `post.setParams({passes: 'grade+pulse'})` cannot bring it back). The LUT is the grade; this module's lens pass is the only vignette. `destroy()` restores it.
- `builtin: 'keep'`: the built-in grade keeps running **after** the LUT (order 750 → 800), but its vignette is set to 0 while this module's `vignette` > 0. With I-08 v1.1 or later the built-in grade and hit pulse also read `uiMask`, so the HUD stays clean; with I-08 1.0 the HUD gets that grade.

Pass order on the shared I-08 chain: `color-grade-lut` 750 → (built-in `grade` 800) → `lens-grain` 860 → built-in `pulse` 900. The hit pulse keeps working on top.

## UI mask convention (J family)

Post effects must not wash the HUD. Every J pass samples the I-08 input named **`uiMask`** (white = UI) and outputs the incoming pixel unchanged there. Give it either:
- `uiRects` here (the module rasterises them into `uiMask` itself, only when they change), or
- your own canvas: `post.setInput('uiMask', maskCanvas)` / `uiMask: maskCanvas`.
Other J elements (J-03 bloom, J-01 lights) read the same input, so one set of rects protects the HUD from all of them; if you give `uiRects` to several J modules, give them the same rects (the last one to change the mask wins). List only real UI: HUD bars, open windows, menus, banners' text plates. Not sprites. Keep rects tight: everything inside a rect stays ungraded, so a rect padded around a label that floats on the scene shows as an ungraded patch of background (give the label and the bar their own rects, and panels their corner radius `r`).

**Text without a backing plate** (title text, a name label drawn straight on the battlefield): do not mask it. Any rect around it, hard or `soft`, shows as an ungraded patch of world behind the letters, most visibly under `night`, `combat` or a strong vignette. Leave such text unmasked (it is graded like the world and stays readable), or give it a small backing box in the game and mask the box. On a title screen either leave the text unmasked or keep that screen `neutral`. Never pass a full-width strip or a whole-canvas rect with nothing drawn behind it.

## Your own LUTs

```js
grade.define('ember', { exposure: -0.2, temp: 0.6, contrast: 0.25, shadows: '#3a1020', shadowAmt: 0.5, highlights: '#ffb060', highAmt: 0.6 });
grade.define('graded-in-editor', cubeFileText);                 // Adobe / Resolve .cube, any LUT_3D_SIZE, resampled to 32
grade.define('painted', imgElement);                            // PNG strip (1024x32, 256x16 ...) or square grid (512x512 = 64^3), same-origin
grade.define('invert', (r, g, b) => [1 - r, 1 - g, 1 - b]);
```
Recipe fields (all optional): `exposure` (stops), `temp` (−1 cool … 1 warm), `tint` (−1 green … 1 magenta), `contrast` (−1 … 1), `lift`/`gamma`/`gain` `[r, g, b]`, `saturation`, `vibrance`, `hues: [{h, w, shift, sat, lum, minSat, minVal, keep, hold}]` (one hue band: centre and half-width in degrees, weighed on the colour the game drew; `minSat` / `minVal` limit it to saturated or full-brightness colours; `keep: 1` exempts it from global saturation and split toning, which is how `night` keeps fire, lamps and lit windows warm; `hold` 0..1 pulls the final colour back toward the colour the game drew, which `night` uses for full-brightness warm light). A LUT sees colours, not objects: a pale halo that the game drew as near-white over a pale sky cannot be told from sky, so draw light halos in a clearly warm colour, or add J-01 lights / J-03 bloom for glow at night, `shadows`/`highlights` tint colours with `shadowAmt`/`highAmt`, `balance`, `black`/`white` output points. To make a LUT by hand: save `grade.strip('neutral')` as PNG, grade that image in any paint program with the same adjustments you would apply to a screenshot, and load it back with `define`.

## Keep the rest of the game working

- Change nothing in how the game draws: not the canvas size, its CSS, its transform or smoothing. Game logic never reads `grade` or `post` (`?auto=1` must end the same with WebGL on and off).
- Call `to()` from the fixed step (game state), not from the draw function, and never with `Date.now()`; `?t=&freeze=1` fast-forwards only the step.
- Find every caller of what you touched: the `?t=` fast-forward (its single draw must reach `grade.render()`), `?auto=1`, restart, title and result screens.
- The first `to()` after a restart blends from whatever was on screen; call `set()` where a new game / level starts to cut cleanly.
- `uiRects` are canvas pixels (or `view` px). If the HUD is drawn in a translated context, add that offset.

## Self-check without a browser

- Load order: `webgl-post.js`, then `color-grade-lut.js`, then the game; both byte-identical to the files given.
- `create` runs once, after the canvas exists and after the game's own `GameDNA_Post.create` if there is one (the module shares it; check there is only one `GameDNA_Post.create` for this canvas).
- Every `to()` is in the step, driven by state (zone, phase, scene), with a LUT name from the list; walk one transition: at `to('night', 1200)` the mix is 0, at 600 ms 0.5 (smoothstep), at 1200 ms 1.
- Every draw path ends with `grade.render()`.
- `uiRects` cover the HUD in canvas px; nothing in the world is listed.
- Walk one colour with the default strength: a lantern orange (255, 166, 51) under `night` stays orange (≈ 244, 157, 37); a mid-grey (128, 128, 128) turns slate blue (≈ 69, 86, 121).
- `?webgl=0`: `grade.active` is false and every call is a no-op.

## Cost (measured 2026-11-16, headless Chromium 1.65 / SwiftShader CPU renderer)

Each frame is `renderNow()` plus a 1-pixel `readPixels` (forces the GPU to finish), 60 frames averaged, on the 640×360 demo canvas. Rough: SwiftShader timings vary about ±30 % between runs.

| overlay px | I-08 input only | + LUT (settled) | + LUT + vignette + grain | while blending |
|---|---|---|---|---|
| 892×502 (dpr 1) | 1.9 ms | 5.5 ms | 7.3 ms | 6.9 ms |
| 1784×1004 (dpr 2) | 5.0 ms | 11.1 ms | 15.0 ms | 17.9 ms |

A settled look samples one table (2 texture fetches per pixel); a blend samples both (4). The LUT pass is skipped while both slots are the identity and no compare split is on; the lens pass is skipped when vignette and grain are both 0. A real GPU is many times faster than SwiftShader. LUT generation is CPU-side, once per preset (about 20–25 ms each on a laptop CPU, cached per page); a blend that is interrupted mid-way bakes the current mix into a new strip (32 768 texels, under 1 ms).

# webgl-post.js (I-08 module, v1.1.1: HUD mask, soft rects)

One plain script with no dependencies and no `import`/`export`. It defines one global, `GameDNA_Post`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it.

It adds a **post-processing stage** to a game that draws on an ordinary 2D canvas. The game keeps drawing exactly as before. The module lays a WebGL canvas exactly over the game canvas: same CSS box, `pointer-events: none`, rendered at device resolution. Each frame it uploads the game canvas as a texture and runs a chain of fragment-shader passes. Two passes are built in:
- **grade**: a filmic tone curve, contrast, saturation, warm/cool split toning and a vignette, with five looks;
- **pulse**: a chromatic hit-pulse. `post.pulse(strength, {at})` splits the colour channels outward from a point and gives a small zoom punch, then fades over game time.

Later elements (bloom, colour LUT, 2D lights, depth of field) add their own passes through `addPass`.

**Without WebGL nothing changes.** WebGL can be missing or blocked, or the page URL can carry `?webgl=0`. Then `create()` returns an instance whose methods are safe no-ops, and no overlay is added: the 2D canvas shows exactly as before. After a lost context or repeated render errors, the overlay hides itself and the 2D canvas shows through. **No method ever throws.**

## API

`GameDNA_Post.create(options) → post`

| option | meaning |
|---|---|
| `canvas` | The game's canvas element (or a selector, or its 2D context). Any backing size and any CSS scaling; the overlay follows its box. Required. |
| `clock` | Optional `() => gameMs`: the game's own time in milliseconds, e.g. `() => frameCounter * 1000 / 60`. Pulses fade and passes animate on this clock only, so `?t=&freeze=1` frames are the same every run. Without it, time is the number of post frames × 16.7 ms. |
| `params` | `passes` 'grade+pulse' \| 'grade' \| 'pulse' \| 'none` (built-ins enabled); `look` 'filmic' \| 'warm' \| 'cold' \| 'punchy' \| 'neutral' (sets the six grade numbers); `exposure` 1, `contrast` 0.2, `saturation` 1.08, `warmth` 0.25 (−1 cool … 1 warm), `lift` 0.03, `filmic` 0.7; `vignette` 0.35 (0..1); `chroma` 5 (CSS px of colour split at full pulse on an 800 px wide canvas; scales with the canvas width, ×0.4 … ×1.25), `punch` 0.012, `decay` 260 (ms of game time); `sample` 'auto' \| 'sharp' \| 'nearest' \| 'linear' (see below); `dpr` 2 (most device px per CSS px); `maxPixels` 2 400 000; `webgl` 'auto' \| 'off'. |
| `uiRects` | Optional `[{x, y, w, h, r?, soft?}]` in **game canvas px**, or a function returning them (read every frame; re-rasterised only when they change). HUD pixels: the built-in grade and pulse output the incoming pixel unchanged there. `r` = corner radius; `soft` = px (0–32, default 0) over which the mask fades out **outside** the rect, for a panel with a soft (shadowed or glowing) edge. Also `setParams({uiRects})`; `null` removes it. See "HUD mask" below. |
| `skin` / `ink` | Optional: the vignette fades to the skin's `palette.ink` (with `skin-api.js` loaded), or to `ink` ('#rrggbb'). Default: a near-black violet. |

`sample` sets how the game canvas is magnified to device pixels. `auto` follows the canvas CSS: `image-rendering: pixelated` gives `sharp` (crisp squares with anti-aliased edges, even at non-integer scales); anything else gives `linear`, the browser's own look. Pick `sharp` yourself to sharpen a pixel game whose CSS forgot `pixelated`.

| method | |
|---|---|
| `render(ms?)` | Call once per drawn frame. The post frame is made at the end of the current task, from whatever the canvas holds then, so calling it before or after your own draw is the same. `ms` (game time) is only used when there is no `clock`. You can also pass an object `{ms, ...}`, which passes see as `s.host`. Cheap to call more than once. |
| `renderNow(ms?)` | The same, synchronously, for a test that reads pixels right away. |
| `pulse(strength = 1, {at, decay})` | Hit pulse. `strength` 0..1.5 (light 0.4, heavy 0.7, killing blow 1.2). `at` = `{x, y}` in **game canvas pixels** (the point the split spreads from; default centre). `decay` overrides `params.decay`. A new pulse takes the larger of the old (faded) and new strength. |
| `clear()` | Drops a running pulse. Call it when a level, battle or run starts, not on death or a life restart: a killing-blow pulse fired in the same step would be wiped before it shows. |
| `setParams(o)`, `params()` | Live parameters (as `params` above). `look` resets the six grade numbers; keys given beside it override. |
| `setEnabled(on)` | Hide or show the overlay (off = the plain 2D canvas, the same as no WebGL). |
| `stats()` | `{mode: 'webgl2' \| 'webgl' \| 'off', reason, active, frames, requests, watchdog, errors, lastError, lost, restored, avgMs, maxMs, lastMs, passes: [enabled names], broken: [names], w, h (overlay px), cssW, cssH, dpr, srcW, srcH, pulse, pulses}`. `avgMs` is CPU time to submit a frame, not GPU time. |
| `resize()` | Re-measure now; it also happens on every render, on window resize and through a ResizeObserver. |
| `destroy()` | Remove the overlay and listeners; the 2D canvas is untouched. |
| `active`, `mode`, `reason`, `canvas` | `active` false = 2D only (`reason`: 'no-webgl', 'url', 'option', 'no-canvas', 'lost', 'tainted canvas…', 'render error…'). `canvas` = the overlay element (null when off). |

`GameDNA_Post.supported() → 'webgl2' | 'webgl' | 'none'`, `GameDNA_Post.instances()` (live WebGL instances, for tests), `GameDNA_Post.looks`, `GameDNA_Post.defaults`, `GameDNA_Post.glslPrelude` (the declarations every pass gets).

## Integration (15 lines)

```js
// <script src="webgl-post.js"></script> before your game script
const post = GameDNA_Post.create({
  canvas: gameCanvas,                                 // the canvas your game draws on, as it is
  clock: () => frameCount * 1000 / 60,                // your fixed-step counter; never Date.now()
  uiRects: () => [hudRect],                           // HUD in canvas px: never graded or colour-split
  params: { passes: 'grade+pulse', look: 'filmic', vignette: 0.35, chroma: 5, decay: 260 }
});
function draw() {
  /* ...your existing drawing, unchanged: world, effects, HUD... */
  post.render();                                      // last line of every draw path (title, play, result screens)
}
function onHit(target, damage, killed) {              // your existing hit site: keep its body, add one line
  /* ...existing HP code... */
  post.pulse(killed ? 1.2 : 0.7, { at: { x: target.x - cameraX, y: target.y - cameraY } });  // canvas px
}
// level / scene / life start: post.clear();
```

## HUD mask (shared `uiMask` input)

Every pass in this family leaves HUD pixels untouched through one shared input, `uiMask`: a canvas the size and orientation of the game canvas, black = scene, white (red channel ≥ 0.5) = HUD. The built-in `grade` and `pulse` read it (`out = mix(effect, incoming, mask.r)`); J-family passes read the same slot. Two ways to fill it:
- **`uiRects`** (create / `setParams`): I-08 rasterises the rects into its own mask canvas and puts it in the slot.
- **Another element writes it** (`post.setInput('uiMask', canvas)`, e.g. J-01, J-03 and J-06 do this from their own `uiRects`): **that writer wins**. I-08 sees a canvas in the slot that is not its own and only reads it, so two writers never fight. If that element later removes the slot, I-08 writes its own again on the next frame.

Give every element the same rects, in canvas pixels. Inside a rect the scene behind a transparent HUD is not graded (or lit, or bloomed) either, so the rule is: **mask the plate, not the text.**
- **HUD on its own panel or strip** (a bar, a dialogue box, a menu window): one rect over the whole panel. The panel hides the seam.
- **Text or icons drawn straight on the world, with no panel** (a title, `LIVES 3` over the sky, a floating name label, a one-line message): a rect around them shows as an ungraded box (in a dark J-01 scene, a bright one). Leave them **unmasked**: they get the grade like the world and stay readable, and the pulse fringes them for about 100 ms. If that fringe matters, give the text a small **backing box** in the game and mask the box. A `soft` rect does not fix this: tried on both host checks, it still shows as a lighter patch, only with a blurred edge.
- **`soft`** is for panels whose edge is itself soft (a drop shadow, an outer glow, a gradient fade): the mask fades out over that edge instead of cutting it. `r` matches a panel's rounded corners, so its corners are not left as ungraded squares.
- Never mask a full-width strip or the whole canvas when nothing is drawn behind the text there.

## Keep the rest of the game working

- Change nothing in how the game draws: not the canvas size, its CSS, its context transform or `imageSmoothingEnabled`. The overlay copies the canvas's on-screen box by itself.
- Never read the WebGL canvas for game logic, and never make game logic depend on `post.active`: `?auto=1` must end exactly the same with WebGL on and off.
- Pointer and touch handlers stay on the game canvas. The overlay has `pointer-events: none`, and `getBoundingClientRect()` of the game canvas is unchanged.
- Find every caller of what you touched: the `?t=` fast-forward (its single draw before freezing must also reach `post.render()`), `?auto=1`, restart, title and result screens, keyboard shortcuts.
- `pulse` takes **canvas** pixels: subtract the camera when your hit point is in world coordinates.
- Keep using any shake, flash or hit-stop the game already has; the pulse adds to them.

## Self-check without a browser

- The module file is byte-identical to the one you were given and loads before `create`.
- `create` runs once, after the canvas exists; `clock` returns the game's step-counted time, never wall-clock time.
- Every path that draws a frame (title, play, pause, result, and the single draw after the `?t=` fast-forward) ends with `post.render()`.
- `uiRects` returns the HUD rects in canvas pixels (the same ones any other light / post element gets).
- Every hit site calls `post.pulse` once, with the point converted to canvas pixels; nothing inside a per-frame loop.
- Walk one heavy hit with the defaults: `pulse(0.7)` → at 0 ms a 3.5 px colour split at the far edges (800 px wide canvas) and a 0.8 % zoom toward the hit; at 130 ms it is at 25 % (0.7 × 0.5²); at 260 ms it is gone.
- With `?webgl=0` the module returns the no-op instance: the game looks and plays exactly as it did before the module.

## What it guarantees

- The overlay always matches the canvas's content box (border and padding excluded), follows CSS scaling, resizes, `devicePixelRatio` changes and the page scroll, and caps its backing store at `maxPixels`.
- Post effects depend only on the game clock, the canvas pixels and the parameters: never on wall-clock time or `Math.random`. Pixel values may differ by ±1 between GPUs; game logic never sees them.
- `preserveDrawingBuffer` is on, so screenshots (Playwright, `?t=&freeze=1`) capture the post frame.
- Watchdog: if `render()` is not called for two animation frames (an unwired title screen), the module repaints from the canvas by itself (`stats().watchdog`), so the overlay never shows a stale screen. That costs one extra frame of lag on those screens.
- A pass whose shader fails to compile is disabled and logged once with `console.warn`; the rest of the chain runs. Three render errors in a row, or a cross-origin (tainted) canvas, turn the overlay off for good (`reason`). After a lost context the overlay hides, and it comes back on `webglcontextrestored`.

## Cost (measured 2026-11-16, headless Chromium 1.65 / SwiftShader CPU renderer)

Each frame below is `renderNow()` followed by a 1-pixel `readPixels`, which forces the GPU to finish; 60 frames averaged.

| case | overlay px | input only | + grade | + grade + pulse (pulsing) |
|---|---|---|---|---|
| 320×180 side-scroller, 1280 px window, dpr 1 | 1280×720 | 1.5 ms | 4.5 ms | 7.4 ms |
| 256×224 top-down, 1280×900 window, dpr 1 | 1029×900 | 1.5 ms | 4.6 ms | 7.4 ms |
| 640×360 demo, dpr 1 | 922×519 | 1.0 ms | 2.6 ms | 4.2 ms |
| 640×360 demo, dpr 2 | 1844×1037 | 3.0 ms | 9.2 ms | 14.9 ms |
| 256×224 top-down, dpr 2 | 1656×1449 | 3.5 ms | 11.5 ms | 19.6 ms |
| phone 390 px, dpr 3 (capped to 2) | 780×439 | 0.7 ms | 1.8 ms | 2.9 ms |

The pulse pass costs nothing between hits (it is skipped while its value is 0). Lower `dpr` to 1, or `maxPixels`, if a large window on a weak GPU is too slow.

A real GPU is many times faster than SwiftShader (not measured here). Each pass is one full-screen triangle; `scale: 0.5` passes cost a quarter of that.

---

# Writing a pass (for J-family elements)

A pass is a fragment shader plus a uniforms function. GLSL ES 1.00 (`texture2D`, `gl_FragColor`), which runs on both WebGL1 and WebGL2. The module adds the prelude below and declares your uniforms and inputs for you, unless you declare them yourself.

```js
post.addPass({
  name: 'my-glow',                 // unique; adding the same name again replaces the pass
  order: 600,                      // chain position (lower runs first); see the bands below
  scale: 1,                        // output size vs the overlay: 1, 0.5, 0.25 (blur buffers at 0.5)
  inputs: { uMask: 'lights' },     // extra samplers: a pass name (its output) or a setInput() name
  params: { amount: 0.6 },         // your live parameters: post.set('my-glow', {amount: 0.8})
  uniforms: (s, p) => ({ uAmount: p.amount, uTint: [1, 0.8, 0.6] }),   // numbers -> float, [a,b] -> vec2 ... 16 -> mat4
  skip: (s, p) => p.amount <= 0,   // optional: bypass this frame (costs nothing)
  branch: false,                   // true = output kept by name only; the chain continues from the previous pass
  frag: `
    void main() {
      vec3 c = texture2D(uPrev, vUv).rgb;                     // the chain so far
      float m = texture2D(uMask, vUv).r * uMaskOn;            // 0 when the game gave no 'lights' input
      gl_FragColor = vec4(c + uTint * m * uAmount, 1.0);
    }`
});
```

`addPass(def) → name` (null if `name` or `frag` is missing). Other calls: `removePass(name)`, `enable(name, on)`, `set(name, params)` (merged into the pass's `params`; for `grade` / `pulse` it is `setParams`), `get(name) → {name, enabled, order, scale, branch, inputs, params, error}`, `passes() → [names in run order]`. `def.enabled: false` adds the pass switched off; `def.keep: true` keeps its output by name even if nothing reads it; `def.defaults: {uMask: 'white'}` binds white instead of black when an input is missing.

**Prelude (every pass):** `vUv` (0..1, origin bottom-left), `uPrev` (the chain so far, sampled linearly), `uFrame` (the untouched game frame, magnified to device resolution), `uRes` (this pass's output px), `uPrevRes`, `uSrcRes` (game canvas px), `uTime` (game seconds), `uPulse` (0..1.5), `uPulseAt` (uv), `uDpr`, `uScale` (output px per game px). Helpers: `uvOfGame(vec2 px)` (game canvas px, y down → uv), `gameOfUv(uv)`, `luma(rgb)`, `hash12(vec2)` (stable per-pixel noise for dithering). For each input `uX` you also get `uXOn` (1 when the input exists) and `uXRes`.

**The `s` passed to `uniforms(s, p)` and `skip(s, p)`:** `{ms, time, frame, pulse, pulseAt, res: [w, h] of this pass, src: [w, h] of the game canvas, scale, dpr, host, mode}`. `host` is the last object given to `render({...})`, so a game can hand over per-frame data such as light positions. Uniforms come only from `s` and `p`: never `Date.now()`, `performance.now()` or `Math.random()`.

**Extra input textures:** `post.setInput(name, canvasOrImage, {filter: 'linear' | 'nearest', live: true})` registers a host canvas: a depth map, a light mask, a normal map. It is uploaded every frame while `live`, or once with `live: false` (call `setInput` again to refresh it). Draw it in the same orientation and aspect as the game canvas; any size works (a quarter-size depth map is fine). Missing inputs bind black (or white with `defaults`) and set `uXOn = 0`, so a pass works in games that never provide them. At most 5 inputs per pass. `removeInput(name)`.

**Multi-pass effects** (bloom): mark the intermediate passes `branch: true` and read them by name.

```js
post.addPass({ name: 'bloom-bright', order: 600, scale: 0.5, branch: true, frag: `...threshold uPrev...` });
post.addPass({ name: 'bloom-h', order: 601, scale: 0.5, branch: true, inputs: { uIn: 'bloom-bright' }, frag: `...blur uIn along x...` });
post.addPass({ name: 'bloom-v', order: 602, scale: 0.5, branch: true, inputs: { uIn: 'bloom-h' }, frag: `...blur uIn along y...` });
post.addPass({ name: 'bloom', order: 603, inputs: { uBloom: 'bloom-v' }, frag: `...uPrev + uBloom...` });
```

Unnamed chain passes ping-pong between two buffers per size. Outputs that another pass reads by name get a buffer of their own. The last chain pass draws straight to the screen. Buffers are RGBA8: keep values in 0..1 and dither gradients with `hash12`.

**Order bands** (so independent elements stack in a sensible order): 100–299 scene light (J-01 lights 200, J-02 normal lighting 250) · 300–399 distortion and water (J-08, J-09) · 400–499 depth of field (J-04) · 500–599 volumetric light (J-05) · 600–699 bloom (J-03) · 700–799 colour LUT (J-06) · 800 built-in `grade` · 850–899 lens and grain (J-07) · 900 built-in `pulse`. A LUT element should set the built-in grade to `look: 'neutral'` or disable it (`post.enable('grade', false)`) rather than stack two grades.

**Errors:** a shader that fails to compile disables only that pass, with one `console.warn` naming the line (`#line 1` = the first line of your `frag`), and `get(name).error` holds the log. A `uniforms()` that throws counts in `stats().errors`, and that frame draws with the previous values.

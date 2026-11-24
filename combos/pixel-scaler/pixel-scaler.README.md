# pixel-scaler.js (I-01 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_PixelScaler`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it.

It takes a game that draws on a small canvas (e.g. 256×224) and stretches it with CSS (blurry, uneven pixels) and shows it pixel-perfect: the canvas keeps its native size, and the module sizes the canvas **element** to the largest whole number of **device** pixels per game pixel that fits, centres it, and fills the rest (letterbox / pillarbox) with a border on the same pixel grid. It only changes CSS and the DOM around the canvas. It never touches `canvas.width`/`height`, the 2D context, the game loop, timers or input.

Optional `skin-api.js` + a skin script before it: the border and button colours come from the skin (`palette.ink`, `ui.*`, `frame()`); without them it uses a built-in copy of `pixel16`.

## API

`GameDNA_PixelScaler.create(options)` returns an instance. Call `apply()` once to put it on screen.

| option | meaning |
|---|---|
| `canvas` | The canvas the game draws on (element or CSS selector). Default: the first `<canvas>`. |
| `native` | `{w, h}` the game's drawing size. Default: `canvas.width` × `canvas.height` (read once, never changed). |
| `params` | See the table below. |
| `skin` | Skin id or object (with `skin-api.js` loaded). Default `pixel16`. |
| `container` | Optional element that defines the available area (it must have its own size). Default: the module wraps the canvas in a new `div.gdna-pixel-scaler` that is 100 % wide and as tall as the viewport allows. |
| `onLayout(info)` | Optional; called after every re-layout with `scale()`. |

| param | default | |
|---|---|---|
| `mode` | `'integer'` | `'integer'`: whole device pixels only. `'fit'`: on phone-sized windows only, when the whole-number scale would be < 2, fill the width with a non-integer scale (pixels then differ by one device pixel). |
| `border` | `'frame'` | Letterbox look: `'frame'` (dithered field + a bevelled window frame around the game, or a 1-cell lip when there is no room), `'dither'`, `'solid'`, `'none'` (page background shows). |
| `color` | `'ink'` | Border base colour: a skin token (`ink`, `ui.shadow`, `ui.edge`, `ui.fill`, `team.a`) or a `#hex`. |
| `crt` | `'off'` | `'scanlines'` or `'crt'` (scanlines + vignette + faint aperture columns). A separate canvas over the game with `pointer-events: none`; needs a scale ≥ 2 for scanlines. |
| `scanlines` | `0.3` | Scanline darkness 0–0.8. |
| `fill` | `'auto'` | `'page'`: the game area is the viewport height minus the rest of the page (help text stays visible, no scrolling; at most 40 % is left for it). `'window'`: the full viewport height (the rest of the page scrolls below). `'auto'`: `'page'`, unless that costs a whole scale step at scales below 4; then `'window'`. |
| `align` | `'center'` | `'top'` puts the game at the top of the area. |
| `maxScale` | `0` | Cap in CSS px per game pixel (0 = none). |
| `button` | `'corner'` | A small fullscreen button **in the border only** (hidden when the border is too thin or fullscreen is unavailable). `'off'` hides it. |
| `key` | `'off'` | Fullscreen key: `'KeyF'`, `'Backquote'`, `'F2'`. Off by default so it never takes a key the game uses. |
| `pad` | `4` | Frame width in game pixels. |

| method | |
|---|---|
| `apply()` | Wraps the canvas, does the first layout synchronously (so `?t=&freeze=1` screenshots are right) and re-lays out on resize, orientation change, zoom (devicePixelRatio), fullscreen and page-height changes. Idempotent. |
| `toGame(clientX, clientY)` or `toGame(event)` | → `{x, y, inside}` in native game pixels (floats; `Math.floor` for a tile or pixel). Works with mouse, pointer and touch events. `inside` is false in the border. |
| `fromGame(x, y)` | → client CSS px of a game point (tests, DOM overlays). |
| `scale()` | → `{n, css, dpr, integer, fit, mode, native, rect, area, letterbox: {l, r, t, b} (device px), layouts, fought, device, fullscreen}`. `n` = device pixels per game pixel. `fought` counts how often something else rewrote the canvas style and the module put it back. |
| `layout()` | Force a re-layout (normally automatic). |
| `setParams(obj)`, `setSkin(s)`, `params()` | Live changes. |
| `toggleFullscreen()`, `isFullscreen()` | Fullscreen on the wrapper (call from a click or key handler; browsers refuse it otherwise). |
| `destroy()` | Removes everything and restores the canvas's original style and place. |

## Integration (15 lines)

```js
// <script src="pixel-scaler.js"></script> anywhere before the code below
const scaler = GameDNA_PixelScaler.create({
  canvas: document.querySelector('canvas'),          // the canvas your game draws on
  native: { w: 256, h: 224 },                         // its width/height attributes; do NOT change them
  params: { mode: 'integer', border: 'frame', crt: 'off' }
});
scaler.apply();                                       // once, after the canvas is in the page
// Pointer input: if your handler already does (e.clientX - rect.left) * W / rect.width with rect = canvas.getBoundingClientRect(),
// keep it, it stays exact. Replace any other mapping (offsetX / fixed scale, window size, a stored scale) with:
canvas.addEventListener('pointerdown', e => {
  const p = scaler.toGame(e);                         // { x, y, inside } in native pixels
  if (!p.inside) return;
  onTap(Math.floor(p.x / TILE), Math.floor(p.y / TILE));   // your existing tap logic
});
// Optional: a key of your own -> scaler.toggleFullscreen(); scanlines -> scaler.setParams({ crt: 'scanlines' })
```

## Integration rules

- **Keep every caller working.** Autoplay, `?t=&freeze=1`, restart and keyboard shortcuts do not change: the module adds no loop and no timer, and needs no `update`/`draw`. Do not move the game's script, rename its canvas or change its id or class (CSS and code may select by them).
- **Remove nothing the game draws.** Never change `canvas.width`/`height`, `ctx.scale`/`setTransform`, or `imageSmoothingEnabled`.
- **The game's own stretching:** CSS rules (`width: 100%`, `max-width: calc(...)`, `height: auto`) can stay; the module's inline `!important` styles win. A JS resize handler that writes `canvas.style.width/height` should be deleted (just that write); if left, the module puts its own size back (`scale().fought` grows). A game that sets `canvas.width = innerWidth` is not a native-resolution game: this module does not fit it.
- **Input:** listeners on the canvas get no events from the border (good). Listeners on `window`/`document` must check `toGame(e).inside`.
- **Page layout:** the module inserts one `div` where the canvas was. Body margins and text above or below are kept; with `fill: 'page'` they stay on screen (with `'auto'`, when that does not cost a scale step).

## Self-check without a browser

1. The module file is byte-identical to the one you were given; `GameDNA_PixelScaler.create` and `apply()` run once, after the canvas exists (after `DOMContentLoaded` or below the `<canvas>` tag).
2. `grep` for `canvas.width =`, `.height =`, `setTransform`, `ctx.scale`: your change added none.
3. `grep` for `clientX`, `offsetX`, `pageX`, `getBoundingClientRect`: each mapping either divides by `rect.width`/`rect.height` of the canvas's own `getBoundingClientRect()` or now calls `scaler.toGame`.
4. The game's loop, `?t=`, `freeze`, `auto` and key handlers are untouched (diff shows only additions plus at most one deleted style write).

## What it guarantees

- 1 game pixel = exactly `n` device pixels (`n` whole) in `integer` mode, on any devicePixelRatio (1, 1.25, 2, 3): the canvas is placed on the device-pixel grid, so no row or column is doubled and nothing is blurred (`image-rendering: pixelated`).
- The game is centred: left and right borders differ by at most 1 device pixel, top and bottom too (unless `align: 'top'`).
- No horizontal scroll: if even 1:1 does not fit, it shrinks (the only non-integer case in `integer` mode; `scale().integer` is then false).
- `toGame` maps to native pixels with no error at any scale; border taps report `inside: false`.
- The border pattern and frame are on the game's own pixel grid (each border cell is `n` device pixels).

# I-01 Native resolution + integer scaling

## 1. What it is

Many browser pixel games draw on a small canvas (256×224, 320×180) and then stretch the canvas element with CSS (`width: 100%`, `max-width: calc(100vh * 8 / 7)`). The browser scales by a fraction (4.023×, 5.338×), so some game pixels become 4 device pixels wide and others 5, and the default smoothing blurs every edge. This element keeps the canvas drawing at its native size and shows it at the **largest whole number of device pixels per game pixel** that fits, centred, with the rest of the area filled by a border on the same pixel grid (letterbox or pillarbox). It works in device pixels, so a phone at devicePixelRatio 3 gets 4 device px per game pixel (1.33 CSS px) rather than 1 CSS px. Pointer and touch input map back to native game pixels (`toGame`). Optional: a fit step for small phones, a CRT/scanline overlay (off by default) and a fullscreen toggle. Game logic, timing, the loop and the backing store are untouched.

## 2. Default parameters

| key | default | meaning |
|---|---|---|
| `mode` | `integer` | `fit`: only on phone-sized windows (≤ 820 CSS px wide or coarse pointer) and only when the whole-number scale would be < 2, fill the area with a non-integer scale |
| `border` | `frame` | `frame` (dithered field + bevelled window frame `pad` game px wide around the game, a 1-cell lip when there is no room), `dither`, `solid`, `none` |
| `color` | `ink` | border base colour, a skin token (`ink`, `ui.shadow`, `ui.edge`, `ui.fill`, `team.a`) or `#hex` |
| `pad` | 4 | frame width in game pixels |
| `crt` | `off` | `scanlines` / `crt` (scanlines + vignette + aperture columns at scale ≥ 3) |
| `scanlines` | 0.3 | scanline alpha |
| `fill` | `auto` | area height: `page` (viewport minus the rest of the page, max 40 % for it), `window` (full viewport), `auto` (`page` unless that costs a whole scale step below 4) |
| `align` | `center` | `top` |
| `maxScale` | 0 | cap in CSS px per game px (0 = none) |
| `button` | `corner` | fullscreen button in the border (hidden if the border is thinner than the button + 12 px) |
| `key` | `off` | fullscreen key (`KeyF`, `Backquote`, `F2`) |

## 3. Variants

- **Console frame** (default): integer, frame border, no CRT.
- **Arcade CRT**: solid ink border, `crt: 'crt'`, scanlines 0.35.
- **Phone friendly**: `mode: 'fit'`, dither border, `align: 'top'`, `fill: 'page'`.
- **Plain black bars**: `border: 'none'`, no button.

## 4. Interface

Needs: the canvas element and its native size; the game's pointer mappings (kept when they divide by the canvas's own `getBoundingClientRect()` width/height, otherwise replaced by `toGame`).
Provides: `toGame(clientX, clientY | event) → {x, y, inside}`, `fromGame(x, y)`, `scale() → {n, css, dpr, integer, fit, rect, area, letterbox, layouts, fought, device, fullscreen}`, `toggleFullscreen()`, `setParams`, `setSkin`, `layout`, `destroy`. The border colours go through `GameDNA_Skin.resolve(options.skin)` (`palette.ink`, `ui.*`, `frame(role 'window', team 'n')`), with a built-in pixel16 copy when no skin script is loaded.

## 5. Screen rules (exact numbers)

- Scale `n = floor(min(floor(areaW × dpr) / w, floor(areaH × dpr) / h))` device px per game px, `n ≥ 1`; `maxScale` caps it at `floor(maxScale × dpr)`. If even `n = 1` does not fit, shrink (non-integer) rather than overflow.
- Canvas origin snapped to the device-pixel grid: `round(areaDevLeft + floor((availW − n·w) / 2))`; left/right borders differ by ≤ 1 device px, top/bottom too (`align: center`).
- Placement and size are one CSS `transform: translate(x, y) scale(n / dpr)` on a `w × h` CSS box (`transform-origin: 0 0`). Plain CSS lengths are rounded to 1/64 px by the layout engine, which blurs at dpr 1.25, 1.5, 2.625 and 3 (measured: 112–3469 blurred game pixels before the change, 0 after).
- `image-rendering: pixelated` on the canvas and the border canvas.
- Border canvas: one cell = `round(n)` device px, aligned to the game's origin, so dither dots and the frame sit on the game's pixel grid. The game rect itself is cleared (a transparent game edge never shows border colour).
- Frame: `pad` cells; drawn only when there is ≥ `pad` cells of border on all four sides, else a 1-cell highlight/shadow lip.
- Fullscreen button: 11×11 art cells × `round(2·dpr)` device px, 6 CSS px from the area corner, in the right, top or bottom border only; `tabIndex -1`; its pointer events never reach the game.
- CRT canvas: device-resolution, `pointer-events: none`, exactly over the game (never over the border); scanline = the bottom `max(1, round(n/3))` device rows of every game row; none when `n < 2`.

## 6. Common mistakes (symptom → fix)

- Pixels still uneven → a resize handler keeps writing `canvas.style.width`; delete that write (the module restores its size anyway; `scale().fought` counts it).
- Blur only on some laptops/phones → sizes set as CSS px instead of the transform (fractional dpr); use the module unchanged.
- Taps off by a few tiles → the handler used `offsetX` or a stored scale; use `toGame(e)`.
- Help text pushed below the fold → `fill: 'page'`.
- Fullscreen key steals a game key → `key: 'off'` (default).
- Game area 0 px high inside a custom `container` → the container needs its own height.
- `canvas.width` written by the integration → never; the canvas is cleared and logic that reads it changes.

## 7. Acceptance moments

1. 1280×900 at dpr 1: topdown 256×224 at 4× (1024×896, borders 128/128 · 2/2); sidescroll 320×180 at 4× (1280×720, borders 0/0 · 77/77 with the help line kept). Square-pixel check passes on the canvas crop; blur check 0.
2. 500×900 at dpr 1: 1× with a full frame; `mode: 'fit'` fills the width (non-integer, flagged).
3. 390×844 at dpr 3: 4× device (topdown, 1024 of 1170 device px) / 3× (sidescroll).
4. dpr 1.25, 1.5, 2.625: 0 blurred game pixels.
5. Tap a tile 3 to the right of the hero: the hero walks onto that tile; tap at x = 100 of 320 (left third) walks left, at x = 114 swings; taps in the border do nothing.
6. `?auto=1` ends exactly as the original (same end state and game time); `?t=&freeze=1` shows the same frame.
7. Demo: before/after compare, CRT, ember skin border, phone at dpr 3.

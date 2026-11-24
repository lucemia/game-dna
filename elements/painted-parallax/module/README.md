# painted-parallax.js (L-01 module, v1.0)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_PaintedParallax`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It draws a side-view backdrop from 3–5 **pre-generated painted bitmaps** (far sky + ridges, optional clouds, mid band, near silhouettes, and an optional opaque **under** strip: the painted ground below the near layer's ground line): each layer is scaled once to the view height (with an atmospheric depth tint baked in), repeated sideways at whole device pixels, and scrolled at its own fraction of your camera. Clouds drift slowly on the clock you advance. The game never calls an image generator: the files were made at build time and are loaded with `GameDNA_Assets` (the L-00 loader, `art-direction-lock.js`), which must be loaded first.

When a layer's image is missing (not shipped, failed to load) the module calls **your old drawing for that layer** (`fallback`), so the screen never has a hole; `draw` returns `false` when no bitmap at all was drawn.

Relationship to I-02 `parallax-layers` (code-drawn pixel layers, `GameDNA_Parallax`): same role names and default scroll factors (clouds 0.08, far 0.16, back 0.3, mid 0.48, near 0.72), same call shape (`update(dt)`, `draw(ctx, camX, camY)` first in the draw pass). Use L-01 for HD painted games, I-02 for pixel games; with both loaded, `fallback: { far: (c, x, y) => i02.draw(c, x, y) }` keeps I-02 behind a missing far layer.

## API

`GameDNA_PaintedParallax.create(options)` returns an instance. Call it once, after `GameDNA_Assets` finished loading (in the boot / `onReady` callback).

| option | meaning |
|---|---|
| `view` | Screen rect `{x, y, w, h}` in your game's own canvas units (the units your draw code uses, e.g. 640×360 even when the canvas is sized to devicePixelRatio). Usually the whole play field. |
| `set` | Which painted set: layers are found as `<set>-far`, `<set>-clouds`, `<set>-mid`, `<set>-near` (and optional `<set>-back`, `<set>-under`). Default: the first set in the loaded manifest. |
| `keys` | Optional explicit map `{far: 'my-sky', mid: 'hills', ...}` instead of `<set>-<role>`. |
| `assets` | A `GameDNA_Assets` instance; default the global one. Without it, add images with `add(set, role, img, meta)`. |
| `fallback` | Optional `{far: fn, clouds: fn, mid: fn, under: fn, near: fn}`: your old drawing for that layer, called as `fn(ctx, camX, camY, view)` inside `save()`/`restore()` when the layer has no image. Exceptions are caught. |
| `params` | See below. |

| param | default | meaning |
|---|---|---|
| `depth` | 1 | Multiplies every scroll factor (0 = static backdrop). |
| `factors` | – | Override per role, e.g. `{ mid: 0.4 }` (before `depth`). The manifest's `parallax` field is used otherwise. |
| `tint` | 1 | Atmospheric depth tint, 0..2: share of the haze colour mixed into each layer (far 0.34, clouds 0.2, mid 0.14, near 0 at 1). |
| `haze` | `'auto'` | `'#rrggbb'`, or `'auto'` = the far layer's `haze` from the manifest. |
| `drift` | 1 | Cloud drift speed multiplier (6 px/s at 1, from the manifest's `drift`). |
| `vertical` | 0 | 0..1. Layers also follow the camera's y: offset = −(camY − `restY`) × factor × vertical, clamped to ±`maxShift` × view.h (default 0.15). Use when your old background moved with the camera's y. |
| `restY` | 0 | The camera y at which the art should sit as painted (usually the camera y when the hero stands on the starting ground). |
| `ground` | 1 | 0.4..1: where your ground starts, as a fraction of view.h. Below 1 (the usual platformer case) the mid/near layers are lifted so their ground line meets yours (near fully, mid ¾, far ¼), and the **under** layer (if the pack has one) is drawn right below the near layer's ground strip, so pits and gaps in your level look down into painted undergrowth. The near layer's bottom ~12 px then fade into the under strip (no straight line where they meet), and when one under strip does not reach the bottom of the view (ground below ~0.55) it continues downwards as a darker, feathered copy. Without an under layer, the band below a lifted layer is filled with that layer's bottom colour (flat): ship an under layer, or give `fallback.under` your own fill. |
| `brightness` | 1 | 0.3..1.5 overall darken / lighten (e.g. for a dim cave entrance). |
| `layers` | 4 | 3 = no clouds. |
| `backing` | 0 | 0 = automatic: read the context's transform (hosts that size the canvas to devicePixelRatio and `setTransform(scale)`) and draw at device resolution. A number forces that backing scale. |

| method | |
|---|---|
| `update(dtMs)` | Advance the drift clock. Call it once per fixed step with the step length (never from real time). |
| `draw(ctx, camX = 0, camY = 0, tMs?)` | Draw every layer into `view`, back to front. `camX` / `camY` = your camera position in world px (how far the view has scrolled right / down), not negated. Call it FIRST in the draw pass, outside any screen-shake translate. Returns `true` when at least one bitmap was drawn. Never throws. |
| `drawLayer(ctx, role, camX, camY, tMs?)` | One layer (e.g. to put your own sprites between mid and near). Returns `false` (after calling the fallback) when it has no image. |
| `setSet(name)`, `sets()`, `set()` | Switch painted set (e.g. `'night'`), list them, read the current one. |
| `setParams(obj)`, `setView(rect)`, `setFallback(map)` | Live changes (tinted layers are rebuilt on the next draw). |
| `add(set, role, img, meta)` | Use a plain `Image`/canvas without `GameDNA_Assets`. |
| `prebuild(scale?)` | Build the scaled, tinted layer canvases now for that device scale (else on the first draw). |
| `ready()`, `layers()`, `lastDrawn()` | Every non-optional layer has an image; layer list `{role, key, loaded, factor, w, h, tint, fallback}`; the last draw `[{x, y, w, h, kind: 'backdrop', t, camX, camY, bitmaps, layers: [{role, bitmap, factor, x, w, joins}]}]` (for tests). |
| `reset(t = 0)`, `clock()`, `clear()` | Drift clock; `clear` is a no-op for generic reset code. |

`GameDNA_PaintedParallax.instances` lists created instances (for tests); `.factors()` gives the default factors.

## Integration (15 lines)

```js
// <script src="art-direction-lock.js"></script> then <script src="painted-parallax.js"></script> before the game
const PACK = { assets: [ /* the bg-layer entries of assets.json: {key, file, w, h, role, set, layer, parallax, haze, drift, joins, alpha} */ ] };
let bg = null;
GameDNA_Assets.load(PACK, { base: 'art/', onReady: () => {
  bg = GameDNA_PaintedParallax.create({
    view: { x: 0, y: 0, w: VIEW_W, h: VIEW_H }, set: 'dusk',
    params: { ground: GROUND_TOP_Y / VIEW_H },                       // where your ground tiles start
    fallback: { far: (c, x, y) => drawOldSky(c, x, y), mid: (c, x, y) => drawOldHills(c, x, y) },
  });
  boot();                                                          // the game's old start code, unchanged
} });
function step() { /* existing world update, also run by ?t= fast-forward */ if (bg) bg.update(STEP_MS); }
function render() {
  if (!bg || !bg.draw(ctx, camX, camY)) drawOldBackground();       // first; the old code stays as the fallback
  /* existing tiles, sprites, effects, HUD */
}
```

## Keep the rest of the game working

Replace only the call that draws the old flat background (keep its code: it is the fallback). Every caller must keep working: `?auto=1`, `?t=<ms>&freeze=1` (the images are loaded before the first step, and the drift clock advances in the same fixed step the fast-forward runs, so a frozen shot is the same every time), keyboard shortcuts, pause, restart, title and result screens (if the title screen drew the old background, it draws `bg.draw` now too). The module reads no input, adds no listeners and never changes game state; no rule may read image sizes.

## Self-check without a browser

- Both module files are byte-identical to the ones you were given; `art-direction-lock.js` loads first.
- The boot runs exactly once, from `onReady`; `create` runs once (not per frame).
- `bg.update(stepMs)` is in the fixed step that `?t=` fast-forward also runs; nothing uses `performance.now()` / `Date.now()` for the backdrop.
- `bg.draw` is the first draw call on every screen that used the old background, with the same camera numbers the tiles use (tiles at `worldX - camX` → pass `camX`). If the old background was drawn inside `ctx.translate(-camX, ...)`, call `bg.draw` before that translate.
- `ground` worked example: 640×360 view, ground tiles start at y 312 → `ground: 0.87`. Leave 1 when the ground is at the bottom.
- The pack's file paths resolve from the page (`base` + `file`); the manifest is inlined (no `fetch` on `file://`).

## What it guarantees

- Each layer is scaled once to the view height × device scale (capped at 2× the stored height) and drawn at whole device pixels, each repeat ending exactly where the next begins: no 1-px gaps, no shimmer; `floor(camX × factor)`, so a camera that moves forward never makes a layer step back.
- Same images + set + params + camera + clock → the same pixels (`?t=&freeze=1` is stable).
- Nothing is drawn outside `view`; `draw` never throws; a missing image falls back per layer.
- Measured (headless Chromium, CPU raster, dusk set): four layers ≈ 0.2 ms a frame at 640×360 device px, 0.8 ms at 1280×720, 1.8 ms at 1920×1080 (one 1:1 `drawImage` per visible repeat). The scaled, tinted copies are built once (all four: 18 / 80 / 180 ms at those sizes; again after `setParams`, `setSet` or a canvas resize), at device resolution but never above 2× the stored height (above that, scaled blits).

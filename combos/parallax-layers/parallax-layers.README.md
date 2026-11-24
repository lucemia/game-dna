# parallax-layers.js (I-02 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_Parallax`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns the whole backdrop: it generates 3–6 original pixel-art layers once (sky with dithered bands, clouds or a cave ceiling, far range, back range, mid tree / cliff / building line, near foliage, optionally a static floor plane), tiles them seamlessly, scrolls each at its own factor of your camera, and animates a few small things (drifting clouds, twinkling stars, swaying grass, fireflies, sea glints, drips, window lights, antenna blinkers). Your game keeps its own camera and clock and draws its tiles and sprites on top.

Optional look: load `skin-api.js` and a skin (e.g. `pixel16.js`) before it and pass `skin`. Without them it uses a built-in copy of the `pixel16` look (dithered bands, hard pixel edges). A non-pixel skin (`pixel: false`) gets smooth gradients; a skin may also carry its own colours in `palette.backdrop.<theme>`.

## API

`GameDNA_Parallax.create(options)` returns an instance.

| option | meaning |
|---|---|
| `view` (or `bounds`) | Screen rect `{x, y, w, h}` in native canvas pixels that the backdrop fills (clipped to it). Usually the play field: the whole canvas above the HUD. Any native resolution works. Without it: 256×224 at 0,0 and one warning. |
| `theme` | `'forest'` (default), `'cliffs'` (sea coast), `'cave'`, `'city'`. Unknown names fall back to `forest` with one warning. |
| `time` | `'day'` (default), `'dusk'`, `'night'`. |
| `seed` | Integer, default 1. Same seed = same picture. The amount of ambient motion never changes the picture. |
| `skin` | Skin id or object (needs `GameDNA_Skin`). Omit for `pixel16`. |
| `params` | See below. |
| `getObstacles()` | Optional. Your sprites' screen rects `{x, y, w, h}`. Bright ambient pixels (stars, fireflies, glints, lamps) are skipped within 3 px of them, so nothing twinkles right next to a character and reads as part of it. |
| `uiRects` | Optional array or function → screen rects (HUD, banners). Same rule. |

Callbacks may be missing; an exception inside one is caught and logged once.

| param | default | meaning |
|---|---|---|
| `layers` | 5 | 3 = sky, far, mid · 4 = + near · 5 = + clouds · 6 = + back range |
| `depth` | 1 | Multiplies every layer's scroll factor (clouds 0.08, far 0.16, back 0.3, mid 0.48, near 0.72). 0 = no parallax. |
| `vertical` | 0 | 0..1. With > 0, layers also follow `camY` (factor × vertical), clamped to ±32 px. |
| `ambient` | 1 | 0..2. Amount and speed of ambient motion. 0 = still. |
| `drift` | 1 | Cloud drift speed (3 px/s at 1). |
| `horizon` | 0.5 | Where the far range sits, as a fraction of `view.h`. |
| `ground` | 0.82 | Where YOUR ground starts (top of the ground tiles, or where the floor begins), as a fraction of `view.h`. Mid trees and near bushes are placed to rise just above it. |
| `floor` | `'none'` | `'plain'` paints a static ground plane from `ground` down (perspective texture, prop groups at its edges, dark front corners), for battle screens whose old background had the ground painted in. |
| `idle` | 0 | px/s of automatic pan (static screens). |
| `sway` | 0 | px of slow sideways sway (8 s period), for static screens. |
| `detail` | 1 | 0.5..1.5: density of trees, crystals, buildings. |

| method | |
|---|---|
| `update(dtMs)` | Advance the ambient clock. Call it once per fixed step with the step length (it is never read from real time). |
| `draw(ctx, camX = 0, camY = 0, tMs?)` | Draw everything into `view`. `camX` / `camY` = your camera position in world px (how far the view has scrolled right / down), not negated. Positions are floored to whole pixels. `tMs` overrides the clock (pass your world time if you have no `update`). Call it FIRST in the draw pass, outside any shake translate. Never throws. |
| `setTheme(theme, time?)`, `setTime(time)` | Switch look; layers are regenerated on the next draw (5–40 ms). |
| `setParams(obj)`, `setView(rect)` | Live changes. |
| `prebuild()` | Generate the layers now (call at load so the first frame does not pay for it). |
| `reset(t = 0)`, `clock()` | Set / read the ambient clock (ms). |
| `layers()`, `layerImages()`, `lastDrawn()` | Layer list `{name, factor, width, fixed}`; layer canvases (for tools); the last draw `[{x, y, w, h, kind: 'backdrop', t, camX, camY, layers}]` (for tests). |
| `clear()` | No-op (accepted so generic reset code does not break). |

## Integration (15 lines)

```js
// <script src="parallax-layers.js"></script> before your game script (optional: skin-api.js + pixel16.js first)
const bg = GameDNA_Parallax.create({
  view: { x: 0, y: 0, w: FIELD_W, h: FIELD_H },          // the area the old background covered
  seed: 1, theme: 'forest', time: 'day',
  params: { layers: 5, ground: GROUND_TOP_Y / FIELD_H },   // where your ground tiles start
  getObstacles: () => sprites.map(s => ({ x: s.x - camX, y: s.y, w: s.w, h: s.h }))
});
bg.prebuild();
function step() { /* existing world update, also run by ?t= fast-forward */ bg.update(1000 / 60); }
function render() {
  // ctx.drawImage(oldBackground, 0, 0);                  // old flat background: no longer drawn (keep the code)
  bg.draw(ctx, camX, camY);                                // first, before tiles and sprites
  /* existing tiles, sprites, effects, HUD */
}
```

Static screen (side-view battle): `bg.draw(ctx, 0, 0)` every frame, `params: { sway: 2 }` for a slow drift. If the old background painted the ground the units stand on, either keep that band (draw the old image from the horizon down after `bg.draw`, and give the module `view.h` = the horizon line, `ground: 1`) or replace it with `floor: 'plain'` and `ground` = where the floor starts.

## Keep the rest of the game working

Replace only the one call that draws the old flat background (and leave its code in place). Every caller must keep working: `?auto=1`, `?t=<ms>&freeze=1` (the backdrop's clock advances in the same fixed step the fast-forward runs, so a frozen shot shows the same frame every time), keyboard shortcuts, pause, restart, title and result screens (draw the backdrop there too, or keep the old background there; never leave a screen black). The module reads no input, adds no listeners and never changes game state.

## Self-check without a browser

- The module file is byte-identical to the one you were given; it loads before the first `create`.
- `create` runs once (not per frame, not per level unless you call `setTheme`); `prebuild()` at load.
- `bg.update(stepMs)` is in the fixed step that `?t=` fast-forward also runs; nothing uses `performance.now()` / `Date.now()` for the backdrop.
- `bg.draw` is the first draw call of every frame on every screen that used the old background, with the same camera numbers the tiles use (tiles at `worldX - camX` → pass `camX`).
- `ground` = (y of the top of the ground tiles − `view.y`) / `view.h`; worked example: 320×180 view, ground tiles start at y 148 → `ground: 0.82`.
- Nothing else was removed or renamed; the HUD is still drawn after everything.

## What it guarantees

- Every layer tiles seamlessly (tile width = 1.5× the view rounded up to 128 px) and moves by whole pixels: `floor(camX × factor)`, so a camera that moves forward never makes a layer step backwards.
- Same seed + theme + time + view + params → the same pixels at the same `camX`, `camY` and clock (`?t=&freeze=1` is stable).
- Ambient motion stays within the screen-bar limits at `ambient: 1` (measured at a fixed camera over 4 s for all 12 theme × time pairs, at 320×180 and at 256×152 with a floor: footprint 0.010–0.048 of the field, at most 1.2 % of pixels change between two frames, bright pixels ≤ 2.9 %), with at least two kinds of motion per theme.
- Nothing is drawn outside `view`; no bright ambient pixel within 3 px of `getObstacles()` / `uiRects`.
- `draw` never throws; a missing context or bad argument logs one warning.

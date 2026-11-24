# GameDNA_Assets (L-00 Art-direction lock, module v1.0)

`art-direction-lock.js` is one plain script (no imports, no dependencies) that defines one global, `GameDNA_Assets`. It loads a set of **pre-generated** bitmaps once at boot and then hands them out synchronously. The game never calls an image generator: the art was generated at build time (Codex `image_gen`, see `tools/assets/README.md`) and shipped as files with their prompts and sha256.

Paste it verbatim into a `<script>` tag, or load it with `<script src>` before your game script. Do not rewrite it.

## API

| call | returns | notes |
|---|---|---|
| `load(listOrManifest, {base, onReady, timeoutMs, bitmap})` | Promise of the instance (never rejects) | Loads every image. `listOrManifest` is an `assets.json` object (`{assets: [{key, file, ...}]}`) or an array of `{key, src, ...}`; `src` is a URL (relative to `base`) or a `data:` URI. A string is fetched as JSON (needs `http://`; on `file://` inline the manifest). `bitmap: false` keeps `HTMLImageElement`s instead of `ImageBitmap`s. Missing or broken files are recorded in `status().failed`; loading still finishes. |
| `onReady(fn)` | the instance | `fn(assets)` now if loading is finished, otherwise once it is. For hosts that don't use promises. Errors thrown by `fn` are caught and logged. |
| `isReady()` | bool | |
| `get(key)` | `{key, img, w, h, meta}` or `null` | Synchronous. `null` when missing, failed or not loaded yet. Never throws. |
| `img(key)` / `meta(key)` / `has(key)` / `keys()` | | |
| `draw(ctx, key, x, y, o)` | bool | Draws with the asset's anchor at `(x, y)` (default anchor: bottom centre = the feet). `o = {h, w, scale, flip, alpha, anchor, smooth}`; size from `o.h`/`o.w`/`o.scale`, else `meta.drawH`, else the file's size. **Returns `false` and draws nothing when the asset is missing**, so you keep your old drawing as the fallback. |
| `drawFrame(ctx, key, i, x, y, o)` | bool | One cell of a grid asset (`meta.grid = {cols, rows, baselines}`); each frame is placed on its own measured baseline. |
| `fillTiled(ctx, key, rect, {tileW, tileH, ox, oy})` | bool | Fills `rect` with a seamless tile, aligned to the world origin `(ox, oy)` so it does not swim when the camera moves. |
| `add(key, img, meta)` / `clear()` / `status()` | | `status() = {state, loaded, failed: [{key, src, why}], total}` |
| `create()` | a new, separate instance | For several packs. The global itself is the default instance. |

Asset `meta` is every field of the manifest entry except `src` (role, kind, w, h, anchor `[ax, ay]`, baseline, drawH, grid, cells, skinRole, prompt, sha256...).

## Determinism (`?t=&freeze=1`, `?auto=1`)

The images must be ready **before the game's first step**, so a frozen screenshot and an autoplay run see the same pictures every time. Move the game's boot (first step, `?t=` fast-forward, first `requestAnimationFrame`) into the ready callback. The 3-line pattern:

```js
// was: boot();
GameDNA_Assets.load(GAME_ASSETS, { onReady: boot });          // boot() = the old start code, unchanged
// in draw code, wherever a bitmap replaces old art:
if (!GameDNA_Assets.draw(ctx, 'hero', x, y, { h: 48 })) drawOldHero(x, y);
```

Loading never fails the boot: missing files only make `draw` return `false`. Keep game logic independent of whether an image loaded (hit boxes, collision and timing stay where they were).

## Skin hook (SPEC v0.5)

With `skins/skin-api.js` loaded, register the loaded bitmaps for skin roles; `skin.tile()`, `skin.prop()` and `skin.frame()` then draw them, and `skin.bitmap(ctx, rect, role, kind)` draws any role (portrait, prop, tile, icon, frame9, bg-layer), returning `false` when nothing is registered:

```js
GameDNA_Skin.bitmaps.useAssets(GameDNA_Assets, { 'tile:grass': 'ground', 'prop:well': 'well', 'icon:key': 'icon-key' });
```

## Integration example (generic)

```js
<script src="art-direction-lock.js"></script>
<script>
const GAME_ASSETS = { assets: [                                   // or the contents of assets.json
  { key: 'hero',   src: 'art/hero.webp',   anchor: [0.5, 0.97], drawH: 48 },
  { key: 'well',   src: 'art/well.webp',   anchor: [0.5, 0.95], drawH: 64 },
  { key: 'ground', src: 'art/ground.webp', tileW: 64, tileH: 64 },
  { key: 'key',    src: 'data:image/webp;base64,...' } ] };
function boot() { /* the game's old start code: newGame(); ?t= fast-forward; requestAnimationFrame(frame) */ }
GameDNA_Assets.load(GAME_ASSETS, { onReady: boot });
function drawWorld(ctx, cam) {
  if (!GameDNA_Assets.fillTiled(ctx, 'ground', { x: 0, y: 0, w: VIEW_W, h: VIEW_H }, { ox: -cam.x, oy: -cam.y })) drawOldGround();
  for (const s of sortedByFeet(sprites)) if (!GameDNA_Assets.draw(ctx, s.art, s.x - cam.x, s.y - cam.y)) s.drawOld();
}
</script>
```

## Self-check without a browser

1. The boot runs exactly once, from `onReady` (search for every place that used to call the boot, `requestAnimationFrame` or the `?t=` loop; none may run before ready).
2. Every `draw` / `drawFrame` / `fillTiled` call is inside an `if (!…)` that keeps the old drawing.
3. Sprite positions: the anchor is the feet; the foot point you pass is the same point the old sprite stood on (old sprite top + its height).
4. `?t=<ms>&freeze=1` still renders one frame after the fast-forward; `?auto=1` still finishes; restart (new game) does not reload images.
5. No game rule reads image sizes.

# GameDNA_PaintedUI (L-06 UI frames & icon sheet, module v1.0)

`painted-ui.js` is one plain script (no imports, no dependencies) that defines one global, `GameDNA_PaintedUI`. It draws a **pre-generated** UI kit: nine-slice window frames, a selection frame, an item slot, a pointer and an icon atlas. The images were generated once at build time (Codex `image_gen`, see `tools/assets/README.md`) and are loaded with `GameDNA_Assets` (L-00, `art-direction-lock.js`). The game never calls a generator.

Paste both scripts verbatim (loader first), or load them with `<script src>` before your game script. Do not rewrite them.

## API

`GameDNA_PaintedUI.create({assets, scale, panel, alias})` returns `ui`.

| option | meaning |
|---|---|
| `assets` | A `GameDNA_Assets` instance (default: the global one) holding the kit keys below. |
| `scale` | UI scale: the kit's `corner` / `drawH` values are native px for a 640×360 canvas at scale 1. Use `canvasHeight / 360` for other sizes (0.62 for 256×224). Default 1. |
| `panel` | Fill drawn under frames whose centre is empty (`fill: false`). Default `'rgba(28,22,18,0.96)'`. `null` = no fill. |
| `alias` | Extra `{yourName: kitKey}` icon names. Built in: dagger/spear/blade → sword, herb → antidote, gold → coins, fire → burn, ice → frost, stun → shock, and more (`GameDNA_PaintedUI.ALIAS`). |

| call | returns | notes |
|---|---|---|
| `ui.frame(ctx, rect, {variant, panel, alpha, corner, maxCorner, band})` | text-safe rect `{x, y, w, h}` or `null` | `variant`: `window` (default), `small` (also `tooltip`, `button`, `plate`), `select`, `slot`. Nine-slice: corners keep their size, plain edges stretch; a corner is at most `maxCorner` (default 1/3) of the box's shorter side, so short boxes get smaller ornaments. **The returned rect is inset past the border AND the corner ornaments' real extent (`safe` in assets.json): every text line must sit inside it.** `band: 'border'` gives the border-only inset. Small variants always get an opaque (≥ 0.97) panel. `null` = missing image: draw your old panel. |
| `ui.inner(rect, {variant, band})` | text-safe rect or `null` | The same rect `ui.frame` returns, without drawing. If your text does not fit, grow the frame rect outward. |
| `ui.icon(ctx, key, x, y, size, {alpha, dim, pad, accent})` | bool | Icon contained and centred in the `size`×`size` box at top-left `(x, y)`. `dim` greys and lightens it (62 % alpha; still readable on a dark cell). `key` may be an alias; `'potion'` + `accent: 'blue'` gives the mana potion. `false` = missing: draw your old shape. |
| `ui.select(ctx, rect, t)` | bool | Selection frame with a gentle pulse; `t` = seconds on YOUR game clock (same `t`, same pixels). |
| `ui.cursor(ctx, x, y, h, {alpha, bob})` | bool | Right-pointing pointer with its tip at `(x, y)`, `h` px tall. |
| `ui.has(key)`, `ui.ready()`, `ui.iconKeys()`, `ui.resolve(kind, {accent})`, `ui.setScale(s)`, `ui.setPanel(c)` | | |
| `ui.attach(GameDNA_Skin, {skins, skin, corner, panel, roles, icons, pixel, padding, cellSlots})` | count | **Call it before creating the modules that use the skin.** For each skin in `skins`, the kit draws that skin's framed roles itself (corner capped at 1/3 of short boxes, text-safe rect returned), raises `skin.shape.padding` to the window frame's safe inset (a padding hint, so modules such as C-01 that size boxes from the padding keep text and arrows off the trim; `padding: false` turns it off), and draws the kit slot under square `backing` cells up to 48 px (G-01 bag grids; SPEC v0.5 has no slot role; `cellSlots: false`). Default corners on skins with a native height under 300 (256×224): window 8, tooltip 6, plate 5. Also SPEC v0.5 bitmap roles: registers `frame-window` for frame roles `window` / `banner`, `frame-small` for `tooltip` / `plate` (panel baked under it), every icon (and alias) for the `icon` role, and gives each skin in `skins` an `icon(ctx, rect, kind, t, o)` method that draws the kit icon and otherwise falls back to `GameDNA_ShopInventory.drawIcon`. `skin: id` registers for that skin only; without it, registrations are global and reach non-pixel skins only. `corner` = a number or `{window, tooltip, plate, banner}` in native px. |

Icon keys in the sample kit (6×4 atlas, 128 px cells): `potion mana-potion antidote bread scroll gem sword axe bow staff shield helmet armor boots ring amulet coins key poison burn frost shock regen guard`.

## Kit manifest fields (assets.json)

| key | role | fields used |
|---|---|---|
| `frame-window`, `frame-small`, `select` | `frame9` | `slice [l, t, r, b]` (source px), `inset` (border, source px), `safe` (past border and ornaments, source px), `corner` (drawn corner size, native px at scale 1), `fill: false` (empty centre), `panelInset` |
| `slot` | `frame9` | same, `fill: true` |
| `cursor` | `sprite` | `anchor [0.97, 0.5]` (the tip), `drawH` |
| `icons` | `icon` | `atlas {cols, rows, cell, keys}` |

## Integration example (generic)

```js
<script src="art-direction-lock.js"></script><script src="painted-ui.js"></script>
<script>
const UI_ASSETS = [ /* the entries of assets.json, with src = 'kit/frame-window.webp' etc. */ ];
const ui = GameDNA_PaintedUI.create({ assets: GameDNA_Assets, scale: VIEW_H / 360 });
const ICON = { herb: 'antidote', tonic: 'potion', blade: 'sword', coin: 'coins' };   // your item ids -> kit keys
function boot() { /* the game's old start code: newGame(); ?t= fast-forward; requestAnimationFrame(frame) */ }
GameDNA_Assets.load(UI_ASSETS, { onReady: boot });
function drawPanel(x, y, w, h) {   // returns where the panel's text may go
  return ui.frame(ctx, { x, y, w, h }, { variant: 'window' }) || (oldPanel(x, y, w, h), { x: x + 8, y: y + 8, w: w - 16, h: h - 16 });
}
function drawItem(id, x, y, size) { if (!ui.icon(ctx, ICON[id] || id, x, y, size)) oldShape(id, x, y, size); }
function drawSelected(rect) { if (!ui.select(ctx, rect, frameCount / 60)) oldHighlight(rect); }
</script>
```

## Keep the game working

- **Boot once, from `onReady`.** Every former caller of the boot, `requestAnimationFrame` and the `?t=` loop runs once, after the images are ready, so `?t=&freeze=1` shows the same frame every time and `?auto=1` still finishes. Restart does not reload images.
- **Text inside the safe rect.** The frame draws its own panel. Every text line (and any arrow or icon) must sit inside the rect `ui.frame` / `ui.inner` returns; where it does not, grow the frame rect outward (keep text where it was) or nudge only that text. Frame the HUD panels too; hide a HUD panel while a window covers it.
- **Your clock.** `ui.select` takes `t` from the game's frame counter, never `Date.now()`.
- **Fallbacks.** Every call returns `false` / `null` when its image is missing; keep the old drawing in the `if (!...)`.

## Self-check without a browser

1. Both scripts are byte-identical to the ones given and load before the game script.
2. The boot runs exactly once, from `onReady`.
3. Every `ui.frame` / `ui.icon` / `ui.select` / `ui.cursor` call sits in `if (!...)` with the old drawing.
4. Every item id the game can show maps to a kit key or keeps its old shape.
5. No game rule, hit box or layout value reads image sizes.

## Measured

`ui.frame` is 9 `drawImage` calls (+1 fill); `ui.icon` 1. Never throws (try/catch around every draw); restores `globalAlpha`, filter and smoothing.

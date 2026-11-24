# GameDNA skins: spec v0.5 (2026-11-16)

A **skin** owns how an addon module looks. The module keeps its logic, layout and timing; every colour, glyph, window frame, numeral, grid overlay, bar, cursor and arrow goes through the skin. Changing the skin changes the picture and never the result: the same seed and the same `?t=` give the same events in every style.

| File | What |
|---|---|
| `skin-api.js` | One global, `GameDNA_Skin`: registry, validation, token lookup, and colour, font, motion, shadow, fade-layer and fonts-ready helpers. It also holds **generic token-driven implementations** of every drawing method. A new style can start from tokens only and override methods one at a time. |
| `pixel16.js` | The `pixel16` skin, 16-bit console pixel. It reproduces the built-in v1 module drawing **pixel for pixel** and is the default. |
| `<style>/` | Style skins (`cel`, `flat`, `gothic`, `hd-diorama`, `pixel8`, `watercolor`…), each with its own `STYLE.md`, prompt fragment and preview. |
| `test.html` | Parity, API checks and demos; details in §6. Open it with `file://`; no server is needed. |

Load order: `skin-api.js`, then the skin files, then the modules. All are plain scripts with no `import` or `export`, so they also work pasted into one HTML file.

**v0.5** adds **bitmap roles** (§2.7): a generated or hand-made bitmap registered for a role (`portrait`, `prop`, `tile`, `icon`, `frame9`, `bg-layer`) replaces the procedural drawing of `tile()`, `prop()` and framed `frame()` roles, and `skin.bitmap()` draws any role, returning `false` when nothing is registered so the caller keeps its own drawing. It is backward compatible: with nothing registered every call takes the v0.4 path, pixel for pixel (checked for all 13 registered skin variants, `test.html` parity and `compare.html` frozen frames; `elements/art-direction-lock/checks/skin-parity.json`).

**v0.4** adds the `prop` scene hook (§2.4); the shared scene now draws stones, bushes, trees and light sources as props. It is backward compatible: a skin without `prop()` looks exactly as before.

**v0.3** adds the standard `lights` format, the atmosphere phase `post-props` with `atmospherePhases`, `native.supersample`, pixel16 scene hooks and full plate-font coverage (§2.4, §3, §5). It is backward compatible.

**v0.2 is backward compatible with v0.1.** Every v0.1 call draws the same pixels; v0.2 only adds fields, hooks and helpers. The changes:
- `glyphOffset` gets canonical items plus `sx`/`sy` (§2.1).
- New helpers: `fadeLayer` (§2.2), `scaleOf` / `setShadow` (§2.3) and `ready()` (§1.2).
- New frame roles `row` and `backing`; the `path` hook is now formal (§2).
- New fields `layout` and `motion.squash` (§3).
- New scene hooks `tile`, `token` and `atmosphere` (§2.4).
- `number` accepts `age` and `life` (§2).

## 1. The skin object

```js
{
  id: 'pixel16', name: '16-bit console pixel', pixel: true,
  native:   { w: 256, h: 224, scale: 'integer' | 'fit', smoothing: false, snap: 1, minScale: 2, supersample: false | true | s },
  palette:  { ink, paper, ui: {...}, team: {...}, overlay: {..., path}, fx: {...}, text: {...}, terrain?, /* skin extras */ },
  fonts:    { ui, num, /* more named fonts */, rules: {...} },
  shape:    { radius, edgeWidth, padding, rowRadius, backingRadius, ... },   // used by the generic frame/bar
  frameRoles: null | ['row', 'backing'],                                   // roles the skin's own frame() draws (§2)
  atmospherePhases: ['world', 'final'],                                    // phases atmosphere() draws (§2.4); hosts skip the rest
  layout:   { handW: 7, handH: 5, pointerGap: 5, rowFrame: false },        // (§3)
  overlayStyle: { mode: 'tint' | 'dither' | 'wash', pattern, alpha, ... },
  particles: { shape, size, count, snap, blend, glow, gravity, drag, life, colors, trail },
  outline:  { text: {width}, number: {width, max, drop, color}, sprite: {width, color} },
  shadow:   { text: {dx, dy, blur} | null, window: {dx, dy, blur} | null, sprite: {kind, alpha} },
  motion:   { stepMs, snap, ease: {move, pop, fade}, fadeSteps, shakeInt, flashMax, squash: null | {x, y, ms} },
  // drawing methods (filled from GameDNA_Skin.base when missing)
  frame(ctx, rect, state), text(ctx, str, x, y, opts), measure(str, opts), number(ctx, str, x, y, opts),
  overlay(ctx, rect, kind, t, opts), bar(ctx, rect, frac, kind, opts), cursor(ctx, rect, kind, t, opts),
  tile(ctx, rect, kind, t), prop(ctx, rect, kind, t, opts), token(ctx, rect, unit, t) /* or unitToken */, atmosphere(ctx, view, t, opts),
  // optional, never filled in
  path(ctx, points, t, opts),
  onFontsReady()
}
```

`GameDNA_Skin.define(spec, parent?)` fills in everything missing:
- rules come from `GameDNA_Skin.defaults`;
- methods come from `GameDNA_Skin.base`;
- palette and rules come from the parent skin when one is named.

It then binds the methods to the skin and validates the result, throwing an error that lists what is missing. `register()` does the same and stores the skin by `id`.

### 1.1 Palette tokens (required)

| token | meaning |
|---|---|
| `ink` | darkest line colour (sprite and window outlines) |
| `paper` | lightest neutral (page, parchment) |
| `ui.fill`, `ui.fillTo` (optional) | window body, top → bottom |
| `ui.edge` | window outline |
| `ui.highlight` | bevel light / inner line |
| `ui.shadow` | bevel dark / drop shadow |
| `team.a`, `team.b`, `team.n` | player, enemy, neutral |
| `overlay.move`, `.attack`, `.threat`, `.heal` | each `{fill, edge, alpha?}` |
| `fx.hot`, `fx.cold`, `fx.heal`, `fx.crit` | fire and impact, ice and magic, recovery, critical |
| `text.main`, `text.shadow`, `text.outline` | body text, its drop shadow, its outline |

The generic methods also use these optional tokens: `ui.select` (the `row` band), `ui.well` (the `backing` band), `fx.status`, `fx.white` (flash), `text.dim`, `text.accent`, `text.select`, `text.label`, `text.title`, `bars.<kind>`, `overlay.path.{core, light, mid, dark, outline, spark}`, `terrain.<kind>` and `skin` (unit face).

Look tokens up with `skin.token('overlay.move.fill')` or `skin.lookup(path)`. A string that is not a path passes through unchanged.

### 1.2 Fonts, rendering rules and fonts-ready

Each named font is one of:
- **bitmap**: `{type: 'bitmap', height, glyphs, sep, spacing, space, advance, uppercase, split}`, drawn with integer `fillRect`s.
- **canvas**: `{type: 'canvas', family, size, weight, style, letterSpacing, uppercase, threshold}`. In a `pixel: true` skin, canvas fonts are thresholded to 1-bit; elsewhere they use `fillText` / `strokeText`.

`fonts.ui` and `fonts.num` are required. Games never load fonts from the network; a canvas font names a system stack, or a web font that the documentation page has already loaded.

**Fonts-ready.** A canvas font can change width once it finishes loading. A skin with canvas fonts must be measured **after** its fonts are ready.
- `GameDNA_Skin.ready(skin) → Promise<skin>` loads every canvas font in `skin.fonts` (`document.fonts.load`, then `document.fonts.ready`, capped at 3 s), drops the 1-bit mask cache and calls `skin.onFontsReady()` if the skin defines it. Bitmap-only skins resolve at once.
- **Hosts** `await GameDNA_Skin.ready(skin)` before the first layout, or lay out again when it resolves.
- **Modules** that cache `measure()` results (window widths, damage-number glyph boxes) must re-measure after it. Either never cache across frames before `ready`, or clear the cache in a `ready().then(...)`.

## 2. Methods

All coordinates are native canvas pixels. `t` is **seconds** (float) on the module's own clock. Every method restores `globalAlpha`, `globalCompositeOperation`, shadow state and smoothing as it found them.

| method | contract |
|---|---|
| `frame(ctx, rect, state) → innerRect` | `state = {role, team: 'a' \| 'b' \| 'n', focus, alert, disabled, alpha}`. Framed roles are `window` (default), `plate`, `banner` and `tooltip`. There are two **unframed** roles: `row` is the selected-row band inside a menu, and `backing` is a plain backdrop behind text that floats on the scene, or a title well inside a window. **`row` replaces plain `ui.select` fills, and `backing` replaces `ui.well` fills**; modules call the role instead of filling a rect themselves. A skin that does not list a role in `frameRoles` gets the generic band: a flat fill of `ui.select` or `ui.well`, rounded only in non-pixel skins. In pixel16 that is exactly the modules' old `fillRect`. |
| `measure(str, opts) → px` | Width as `text()` would draw it. |
| `text(ctx, str, x, y, opts) → width` | `(x, y)` = top-left. `opts = {font, color, color2, shadow, outline, outlineWidth, align, scale, alpha}`. |
| `number(ctx, str, x, y, opts) → rects` | `opts = {kind, scheme, scale, big, suffix, label, labelGap, outline, align, baseline, alpha, age, life, glyphOffset}`. `age` (ms since the pop spawned) and `life` (its total ms) let a skin animate per-number effects over the pop's life, such as a smoke puff, a glow or an ink bleed. Modules pass them when they know them; skins must not change timing with them. `glyphOffset` is in §2.1. Returns the fill rects drawn, one per drawn glyph, **in canonical order**. A skin that draws a part as one block returns one rect for that part. HUD numbers inside windows use `text()`. |
| `overlay(ctx, rect, kind, t, opts)` | One grid cell: `kind = move \| attack \| threat \| heal`, `opts = {grow, pattern, tile, edges, seams}`. |
| `bar(ctx, rect, frac, kind, opts)` | `kind = charge \| haste \| slow \| ready \| queued \| enemy \| enemyFull \| hp \| hpLow \| null`. `opts = {style: gauge \| meter, tag, px}`. |
| `cursor(ctx, rect, kind, t, opts)` | `kind = bracket` (rect = the tile) or `hand` (rect = the pointer box, `layout.handW × handH`). `opts = {alpha, invalid}`. |
| `path(ctx, points, t, {tile, alpha, invalid})` | **Optional.** The move arrow. `points = [{x, y}]` are tile centres in native px, start first. `tile` is the tile size (default 16), `alpha` the whole-arrow opacity (draw through `fadeLayer`), and `invalid` means the end is not stoppable. `define()` never fills it in: a module calls `skin.path` only when it exists, and otherwise draws its own arrow coloured from `palette.overlay.path`. A skin can opt into the generic arrow with `path: GameDNA_Skin.base.path`. pixel16 has no `path`, so B-01 keeps its built-in raster. |

### 2.1 `glyphOffset(i, item) → {dx, dy, alpha, flash, skip, sx, sy}`

The module animates; the skin draws. `glyphOffset` is called once per glyph, every draw.

- **Items are canonical, index-based and layout-independent.** The order is the characters of `str` (role `main`), then of `opts.suffix` (`suffix`), then of `opts.label` (`label`). Each item is `{i, ch, role, k, n, u}`:
  - `k` is the index within its role and `n` the count in its role;
  - `u` (0..1) is the glyph's centre position within its role by character count; use it, for example, to stagger the label left to right.

  `GameDNA_Skin.glyphItems(str, opts)` returns the same list, so a module can precompute per-glyph state. `define()` wraps every skin's `number()`, so the item a module receives always carries these fields, whatever the skin. A skin may add layout fields (pixel16 adds `x, y, w, h, font, s, lab, lx0`), but **modules must not read them**.
- **Return fields:**
  - `dx`, `dy`: offset in native px.
  - `alpha`: 0..1 opacity. Smooth skins fade outlined glyphs through `fadeLayer` (§2.2).
  - `flash`: draw the white flash ramp.
  - `skip`: do not draw this glyph.
  - `sx`, `sy`: scale about the glyph's bottom centre, for landing squash. Use the skin's `motion.squash`.
- **Skins that draw a part as one block** (a label plate, a capsule) call `glyphOffset` for every item. They apply the offset of the part's first item (`k = 0`) to the whole block, and take the largest `alpha` and any `flash` of the part.
- **Pixel skins may ignore `sx` / `sy`.** Scaling would make non-square pixels. pixel16 ignores them, and modules must look correct without them.

### 2.2 Fading outlined glyphs: `GameDNA_Skin.fadeLayer(ctx, alpha, rect, draw)`

Drawing a stroke outline and then a fill straight onto the canvas at `alpha < 1` lets the outline show through the fill as a dark ring. In smooth skins, wrap any multi-pass drawing (outline + fill, drop + body, glow + core) that fades:

```js
GameDNA_Skin.fadeLayer(ctx, d.alpha, { x: gx - 4, y: gy - 4, w: gw + 8, h: gh + 8 }, function (g) {
  g.lineWidth = 3; g.strokeStyle = ink; g.strokeText(ch, gx, gy); g.fillStyle = col; g.fillText(ch, gx, gy);   // full opacity here
});
```

`draw(g)` paints at full opacity into a pooled offscreen layer that has **the same transform as `ctx`**, so you keep drawing in native units. The layer is composited once at `globalAlpha × alpha`. `rect` (native units) bounds the layer and should cover the outline and any glow; without it the layer is the whole canvas. `alpha ≥ 1` draws directly, and `alpha ≤ 0` draws nothing. Pixel skins with stepped, fully opaque passes usually do not need it.

### 2.3 Shadows and the canvas transform

`shadowBlur`, `shadowOffsetX` and `shadowOffsetY` **ignore the canvas transform**: they are always device pixels. A non-pixel skin drawn on a `native × s` backing store (`ctx.setTransform(s, 0, 0, s, 0, 0)`) gets shadows `s` times too small unless it scales them. Use the helpers:
- `GameDNA_Skin.scaleOf(ctx)` returns the current transform's scale, √|det|.
- `GameDNA_Skin.setShadow(ctx, colour, blurNative, dxNative, dyNative)` sets the shadow, already scaled.
- `GameDNA_Skin.clearShadow(ctx)` resets it.

The generic `frame()` and `text()` do this. Hairline widths in device pixels (`lineWidth = 1 / scaleOf(ctx)`) work the same way.

### 2.4 Scene hooks (previews and demos; optional for modules)

| hook | contract | generic fallback |
|---|---|---|
| `tile(ctx, rect, kind, t)` | One map cell. `kind = grass \| forest \| water \| hill \| mountain \| road \| bridge \| fort \| sand \| wall \| floor`. Unknown kinds draw as grass. | Flat fill from `palette.terrain.<kind>` (or built-in defaults) with a small motif. |
| `prop(ctx, rect, kind, t, {lights, light, seed})` | One standing object on a map cell. `kind = stone \| rock \| tree \| bush \| brazier \| lamp \| crystal` (free text allowed; unknown kinds draw as a stone). `rect` is the cell: the prop's foot sits on its bottom edge, and it may rise up to one cell above. `light` is the standard light (§2.5) this prop carries (brazier, lamp, crystal), or `null`; `lights` are all scene lights; `seed` varies the art per cell. **Hosts draw props depth-sorted with the units**, back to front by row, a prop before a unit on the same row. That is after the ground and the range overlays, so an overlay never swallows a prop, and before numbers and windows. Under a prop the host draws `tile('grass')`, or the cell's ground kind. | The skin's own `tile()` for the matching terrain (`stone`, `rock`, `brazier`, `lamp`, `crystal` → `mountain`; `tree`, `bush` → `forest`). A host that sees no own `prop()` (`skin.prop.raw === GameDNA_Skin.base.prop`) may instead keep those tiles in the ground and skip the prop pass. The shared scene does that, so such skins look exactly as before. |
| `token(ctx, rect, unit, t)` | One unit piece. `unit = {team: a \| b \| n, kind: knight \| mage \| fighter \| archer \| monster, selected, dead, facing: 1 \| -1}`. `selected` bobs; `dead` is faded. | Team-coloured body and head with an ink outline (`outline.sprite`), a weapon by kind, and a contact shadow. |
| `atmosphere(ctx, view, t, {phase, lights, ambient, focus})` | Full-screen mood: light, fog, depth blur, vignette, darkness, grain. It must not hide gameplay information. Phases are in the table below; `lights` are standard lights (§2.5). | No-op. |

**Atmosphere phases, in draw order.** A host calls a phase only if it is in `skin.atmospherePhases` (default `['world', 'final']`). A skin that branches on `phase` therefore never receives a phase it doesn't know.

| phase | when the host calls it | typical use |
|---|---|---|
| `world` | after the ground (tiles, water), **before props and units** | lighting of the floor (light map, light pools, shafts) |
| `post-props` | after props and units, before world-space overlays, cursor and numbers | tilt-shift / depth blur, fog in front of units, colour grade of the world |
| `final` | after world-space overlays and effects, before HUD windows and text | dust motes, bloom, vignette |

hd-diorama needs light before the props and tilt-shift after them: it should move its tilt-shift into `post-props` and list `['world', 'post-props', 'final']`.

### 2.5 Standard lights

Hosts pass point lights as an array of plain objects. Skins read them in `atmosphere()` (and may read `unit.lights` in `unitToken`):

```js
{ x, y,          // native px: the light's foot on the ground
  r,             // radius of influence, native px
  col,           // '#rrggbb'
  intensity,     // 0..1 nominal (a skin may scale it internally, e.g. x1.35 for over-exposure)
  kind,          // 'fire' | 'lamp' | 'magic' | 'crystal' | 'sun' | 'moon' | ... (free text; a skin may style by kind)
  h,             // optional: height above the ground, native px (default 16)
  flicker }      // optional 0..1: how much the host's intensity already flickers (informational)
```

The host owns animation: it passes the current intensity every frame. Skins never mutate the list. `GameDNA_Skin.normLight(l)` / `normLights(list)` return standard objects and also accept the pre-standard fields (`i` for intensity, `col` as `[r, g, b]` 0..1, `hex`, `rgb`). A skin that still keeps its own internal format normalises its input once, then converts. The shared scene (`scene/shared-scene.js`) passes standard lights to every skin except hd-diorama and lowpoly. Those two still read pre-standard fields, so the scene's `ADAPT` table converts for them until they switch.

### 2.6 Units

`token` keeps its v0.1 meaning too. **`skin.token(path)` with a string still looks up a palette token**, and with a context as the first argument it draws a unit. A skin defines its drawing as `token(ctx, rect, unit, t)` (detected by arity ≥ 3) or as `unitToken(...)`; `skin.unitToken(...)` always draws. Sites and previews use these hooks so the comparison page shows each style's own map and units. Modules never call `tile` or `token`: their host owns the map and the sprites.

### 2.7 Bitmap roles (v0.5)

Bitmaps are registered in one registry on `GameDNA_Skin.bitmaps`, by **role** and **kind**; kind `'*'` is the role's default. They usually come from an asset pack loaded with `GameDNA_Assets` (L-00, `elements/art-direction-lock/module/`).

| call | what |
|---|---|
| `bitmaps.set(role, kind, img, meta?, {skin}?)` | Register `img` (`ImageBitmap`, `HTMLImageElement`, canvas, or a `GameDNA_Assets` record `{img, meta}`). Without `{skin: id}` it is global. `img = null` removes it. |
| `bitmaps.useAssets(assets, map?, {skin}?)` | Register records from a `GameDNA_Assets` instance: `map = {'tile:grass': 'ground', 'prop:well': 'well'}` (role:kind → asset key). Without a map, every asset whose meta has `skinRole: {role, kind}` (or a bitmap `role` + `kind`) is registered. Returns the count. |
| `bitmaps.get / has / remove / clear(skinId?) / list()` | Lookup and housekeeping. `bitmaps.roles` lists the six standard roles. |
| `bitmaps.draw(ctx, rect, role, rec, opts)` | Draw a record with a role's placement, without registering it. |
| `skin.bitmap(ctx, rect, role, kind, opts) → false \| true \| innerRect` | Draw the bitmap registered for this skin and role; `false` when none is registered or the image is not loaded yet. `frame9` returns the inner rect. |
| `skin.hasBitmap(role, kind)` | Bool. |

**Which skins use it.** Global registrations apply to **non-pixel skins only**: pixel skins (`pixel8`, `pixel16`, `handheld4`) need snapped, palette-quantised art, so they draw a bitmap only when its `meta.pixel === true` or it was registered for that skin (`{skin: 'pixel16'}`). Per-skin registrations always apply.

**Automatic use in the scene hooks.** When a bitmap is registered:
- `skin.tile(ctx, rect, kind, t)` draws the `tile` bitmap for `kind` instead of the skin's tile;
- `skin.prop(ctx, rect, kind, t, opts)` draws the `prop` bitmap for `kind` (foot on the rect's bottom centre; `opts.flip`, `opts.h`);
- `skin.frame(ctx, rect, {role})` draws the `frame9` bitmap registered for that frame role (`window`, `plate`, `banner`, `tooltip`; never `row` / `backing`) and returns its inner rect.

`skin.tile.raw` / `skin.prop.raw` / `skin.frame.raw` stay the skin's own functions, so `skin.prop.raw === GameDNA_Skin.base.prop` still means "this skin has no own prop art". A host that skips the prop pass for such skins should also check `skin.hasBitmap('prop', kind)`. `portrait`, `icon` and `bg-layer` have no procedural hook: the caller writes `if (!skin.bitmap(ctx, r, 'portrait', 'elder')) drawOwnPortrait()`.

**Placement by role** (`rect` in native px; `meta` from the registration):

| role | placement |
|---|---|
| `tile` | Fills the rect. `meta.cells = n`: the texture spans n×n map cells and each cell draws its sub-square, picked by `round(rect.x / rect.w)`, `round(rect.y / rect.h)` mod n (or `opts.col`, `opts.row`). |
| `prop` (and `sprite`, or any other role) | Foot point = the rect's bottom centre. Height `opts.h` \|\| `meta.cellsTall × rect.h` \|\| `2 × rect.h` (a prop may rise one cell above its cell; a tall tree may say `cellsTall: 3`); aspect kept. Anchor `meta.anchor` (default `[0.5, 1]`) or `meta.baseline` px. `opts.flip` or `opts.facing === -1` mirrors. |
| `icon` | Contained and centred in the rect (`opts.pad`). |
| `portrait` | Contained, bottom-aligned and centred; `opts.flip`. |
| `frame9` | Nine-slice: `meta.slice = [l, t, r, b]` source px, `meta.scale` (dest px per source px), `meta.fill` (centre, default true), `meta.inset` (inner padding). |
| `bg-layer` | Fills the rect's height and repeats horizontally; `opts.scroll` (native px) × `meta.parallax` (default 1). |

Every draw restores `globalAlpha`, smoothing and the transform, and never throws (a broken image returns `false`). Smoothing is on with high quality unless `meta.pixel`. Bitmaps change pictures only, never rules or timing (§3, rule 5 of §7).

## 3. Rules (data, not drawing)

| rule | fields | how a module uses it |
|---|---|---|
| `native` | `w, h`, `scale: 'integer'` (pixel) or `'fit'` (non-pixel: backing store = native × devicePixelRatio, `ctx.setTransform(s, …)`), `smoothing`, `snap`, `minScale`, `supersample` | The host sizes the canvas. Modules draw in native coordinates either way. `GameDNA_Skin.setup(skin, ctx)` sets smoothing. |
| `native.supersample` | `false` (default), `true`, or an integer `s` | For pixel skins with smooth light or blur (hd-diorama). The backing store is native × integer `s`: `s` = the given integer, or for `true` `max(minScale, round(displayWidth / native.w))`. The host calls `ctx.setTransform(s, 0, 0, s, 0, 0)`. The skin keeps pixel parts (sprites, glyphs, frames) on whole native px with smoothing off, and draws light, blur and fog smooth at the full resolution. Without it, a pixel skin is drawn at native 1× and scaled up nearest-neighbour. Shadows still need `scaleOf()` (§2.3). |
| `layout` | `handW`, `handH` (the `cursor(…, 'hand')` box; default 7×5, the pixel16 hand), `pointerGap` (px from the hand's right edge to the row text; default 5), `rowFrame` (true = the module draws the selected row with `frame(…, {role: 'row'})` even where it used to fill `ui.select` itself; v2 modules always use the role) | Menus reserve `handW + pointerGap` before the label and centre the hand on the row. |
| `particles` | `shape`, `size`, `count`, `snap`, `blend`, `glow`, `gravity`, `drag`, `life`, `colors` (token paths), `trail`, `rays` | Spark, burst and dust effects. `skin.particleColors()` resolves the colours. |
| `outline` | `text.width`; `number.{width, max, drop, mode, color}`; `sprite.{width, color, mode}` | `0` = none. |
| `shadow` | `text`, `window`, `sprite` | `null` = none. Blur and offsets are native units: scale them (§2.3). |
| `motion` | `stepMs`, `snap`, `ease {move, pop, fade}`, `fadeSteps`, `shakeInt`, `flashMax`, `squash` | `squash = {x, y, ms}` (e.g. `{x: 1.22, y: 0.8, ms: 70}`) is the landing squash a module applies through `glyphOffset` `sx/sy` or sprite scaling, for `ms` after a landing or hit; `null` = none (pixel skins). Helpers: `GameDNA_Skin.motion.stepTime`, `.snap`, `.fade` and `.ease`. **Timing (durations, hit-stop, event order) is never a skin choice.** |

## 4. Registry and helpers (`GameDNA_Skin`)

- **Registry:** `define(spec, parent?)`, `register(spec, parent?)`, `get(id)`, `resolve(x)` (object, id, or `undefined` → `pixel16`; an unknown id logs a warning and falls back), `list()`, `validate(skin)`.
- **Lookup and base:** `token(skin, path)`, `base` (the generic methods, including `path`, `frameBand` and `unitToken`), `defaults`, `ease`.
- **Colour and font:** `color.{rgb, hex, rgba, mix, ramp}`, `font.{bitmapWidth, drawBitmap, mask, drawMask, css}`.
- **Motion and canvas:** `motion.{stepTime, snap, fade, ease}`, `setup(skin, ctx)`, `canvas(w, h)`.
- **New in v0.5:** `bitmaps.{set, get, has, remove, clear, list, draw, useAssets, roles}`; on each skin `skin.bitmap(...)` and `skin.hasBitmap(role, kind)` (§2.7).
- **New in v0.4:** `base.prop`, `base.propTile(kind)`.
- **New in v0.3:** `normLight(l)`, `normLights(list)`.
- **New in v0.2:** `scaleOf(ctx)`, `setShadow(...)`, `clearShadow(ctx)`, `fadeLayer(ctx, alpha, rect, draw)`, `glyphItems(str, opts)`, `ready(skin)`.
- **Bound on each skin:** `skin.lookup(path)`, `skin.unitToken(...)` and `skin.particleColors()`.

## 5. pixel16: what it reproduces

| skin call | module code it replaces (built-in v1 look) |
|---|---|
| `frame(…, {role: 'window', team})` | B-01 `frame()`: gradient bands, clipped corners, bevel, rivets, 0.95 alpha |
| `frame(…, {role: 'plate', alert})` | A-01 mode plate box |
| `frame(…, {role: 'row'})` / `{role: 'backing'}` | B-01 selected-row `rgba(255,255,255,0.2)` fill / terrain title well `rgba(6,8,30,0.4)` (generic band, flat fill) |
| `text(…, {font: 'ui'})` / `{font: 'plate'}` | B-01 5×7 mono font / A-01 proportional 5×7 |
| `number(…)`, `glyph()`, `numberLayout()` | E-01 glyph sprites, layout, CRITICAL label, the three schemes, flash ramp |
| `overlay(…)` | B-01 tile overlay |
| `bar(…, {style: 'gauge'})` / `{style: 'meter'}` | A-01 gauge bar / B-01 HP bar |
| `cursor(…, 'bracket' \| 'hand')` | B-01 bracket and menu pointer |
| `text(…, {font: 'plate'})` outside the A-01 set | **v0.3:** full coverage. Characters other than `ACEITVW 0125 7 . x` fall back to the ui font's 5×7 glyphs, upper-cased, in the plate's single colour (`fonts.plate.coverage = 'full'`). A-01 strings draw exactly as before. |
| `tile(ctx, rect, kind, t)` | **v0.3:** 16-bit shaded tiles for all 11 kinds: 5-step ramps, top-left light, 1 px dark outlines on props, 4 variants per kind picked by tile position, water and bridge ripples at 3 fps. Art ported from an earlier prototype's own map-fe gallery game (original). |
| `unitToken(ctx, rect, unit, t)` | **v0.3:** 18×22 palette sprites built from head + torso + legs + weapon parts with an automatic 1 px outline. Team ramps a / b / n; kinds `knight`, `fighter`, `mage`, `archer`, `lord`, `monster`; 2-frame idle every 26 frames; 1 px bob when selected; grey and faded when dead; 3-row contact shadow unless `noShadow`. Never scaled: feet sit on the rect's bottom edge, centred. |
| `atmosphere`, `path`, `prop` | generic no-op; none (B-01 keeps its raster); generic tile-based prop (pixel16's own mountain / forest tiles) |

## 6. test.html

| part | what it checks |
|---|---|
| Parity | Each case runs a real module **with its built-in drawing (`skin: false`)**, so it still catches a module/skin difference now that the modules route through skins by default. It compares that against pixel16: the B-01, A-01 and E-01 cases redraw the same frame through `pixel16` calls in the harness (the reference adoption: `gridCase`, `atbCase`, `dnCase`), and the C-01 window-cursor cases run the module a second time with `skin: 'pixel16'`. 11 cases (B-01 select and menu, A-01 ×3, E-01 ×4, C-01 ×2), all **0 differing pixels**. `<html data-parity="pass">`. |
| API checks | Canonical glyph items through pixel16, `scaleOf`, `fadeLayer` (no outline through the fill), the `row` role equal to the old fill, the defaults (`layout`, `squash`, `atmosphere`, optional `path`), and `token` lookup versus drawing. `<html data-api="pass">`. |
| Demos | The pixel16 showcase; a token-only non-pixel skin drawn after `GameDNA_Skin.ready()` (`data-ready="1"`); the scene hooks (`tile`, `token`, generic `path`, a number with `sx/sy` and faded glyphs) for both. |

When a module gains a skin port, give its module side `skin: false` in its parity case.

## 7. Adoption guide for module authors

1. **Option.** Resolve once in `create()`: `var SK = o.skin === false || !root.GameDNA_Skin ? null : root.GameDNA_Skin.resolve(o.skin);` (`undefined` → pixel16). `skin: false`, or no `skin-api.js` loaded, keeps the built-in drawing. That keeps v1 single-file hosts working and is what the parity cases compare against.
2. **Route every visual through the skin.** Literal colours become palette tokens. Glyph tables and `textW` become `SK.text` / `SK.measure`. Windows become `SK.frame`, row highlights `frame({role: 'row'})`, wells and backdrops `frame({role: 'backing'})`. Gauges use `SK.bar`, pointers `SK.cursor`, the move arrow `SK.path` (if present), and pop numbers `SK.number`.
3. **Keep layout yours, measured by the skin, and re-measure after `GameDNA_Skin.ready(SK)`.** Pointer space is `SK.layout.handW + pointerGap`.
4. **Animate through hooks.**
   - Per-glyph motion goes through `glyphOffset`. Read only `i, ch, role, k, n, u`; the landing squash is `sx/sy` from `SK.motion.squash`.
   - Pass `age` and `life` to `number()`.
   - Fades go through `GameDNA_Skin.motion.fade`, positions through `.snap`, and sprite clocks through `.stepTime`.
   - Particles take their look from `SK.particles`.
5. **Never let the skin change rules or timing.** Same-seed runs must give identical state logs across skins.
6. **Test.** Add a parity case to `skins/test.html` with the module side at `skin: false` (0 pixels against pixel16). Then screenshot the demo under at least one smooth skin (`cel`, `flat`) to catch layout that assumed the bitmap font.

```js
// before (B-01 terrain window)                          // after
frame(g, x, y, 52, 42, 'n');                             SK.frame(g, { x: x, y: y, w: 52, h: 42 }, { team: 'n' });
g.fillStyle = 'rgba(6,8,30,0.4)'; g.fillRect(x + 4, y + 4, 44, 11);   SK.frame(g, { x: x + 4, y: y + 4, w: 44, h: 11 }, { role: 'backing' });
text(g, def, x + 46 - textW(def), y + 18);               SK.text(g, def, x + 46, y + 18, { align: 'right' });
```

## 8. The 8 styles: starting values (M6)

**(推測)** These are starting points from plan §2a, the HD-2D and low-poly STYLE.md files and the three mocks; each style's own `STYLE.md` overrides them. A skin passes when the critic gives it ≥ 7.5 with no major issue.

| # | id | pixel | palette / fonts direction | overrides likely needed |
|---|---|---|---|---|
| 1 | `pixel8` | true, 256×240 | ~25-colour console palette, `ink` `#000`; chunky 8 px bitmap | `frame` (double-line box), flat numerals, `overlayStyle.mode: 'dither'`, `stepMs` 1000/30 |
| 2 | `pixel16` | true, 256×224 | done | done |
| 3 | `hd-diorama` | sprites pixel, UI smooth, `native.supersample: true` | cold ambient + warm points; serif UI, metal-framed plates | `frame` (thin metal double line), `cursor` (gold triangle), `bar` (4 px rounded), `atmosphere` with phases `world` (light), `post-props` (tilt-shift), `final` (motes, bloom, vignette) |
| 4 | `flat` | false | pastel + one accent; geometric sans | `path` (smooth arrow), `cursor` (ring), rounded `row` |
| 5 | `watercolor` | false | washes + ink `#3a2a1e`, paper `#f1e6cf`; classical serif | `overlay` (wash), `frame` (parchment), `tile` / `token` (painted pawns), `number` with `age` (ink bleed) |
| 6 | `cel` | false | saturated + hard shadow; heavy rounded sans | `number` (thick outline, `sx/sy` squash), slanted `frame`, `path` (chevrons) |
| 7 | `lowpoly` | false | pastel, low contrast; rounded sans | `frame` (cream panel), `number` as **extruded digits** (a flat-shaded front face plus a darker side face stepped 2–3 native px down-right, like the island's blocks; no outline, no capsule), `tile` (faceted) |
| 8 | `gothic` | false | near-black, blood red, old gold; engraved serif | `frame` (rusted metal), `number` with `age` / `life` (smoke puff), `atmosphere` (darkness, candle vignette) |

## 9. The shared scene (`scene/shared-scene.js`, `compare.html`)

One canonical tactics moment for every style.
- **Map:** 16×14 tiles, seed 7, default t = 1400 ms.
- **Units:** Rowan (4,8), Ilsa (1,10), Ghoul (8,6), Wraith (11,11).
- **Props:** a stone (6,4); a brazier (6,10), a lamp (9,2) and a crystal (2,5), each carrying a light; bushes at (7,9), (8,9), (5,6); trees on the far bank.
- **Damage numbers:** `getAnchor` = the sprite's centre x and top, `{x: col·16 + 8, top: row·16 − 6, w: 16, h: 22}`. `getObstacles` = the unit sprites (with `id`), the HUD card, the turn plate and the menu (no `id`), and the lit props as `soft`.
- **Layout checks:** at t = 1400 every number sits on its own anchor (placement offset 0,0) in all eight styles. No prop sits under the menu.
- **Pixel skins on `compare.html`** are sized to the largest whole multiple of their native width that fits the cell (at least 1×) and letterboxed; they are never stretched by a non-integer factor. Smooth skins fill the cell.

## 10. Known limits (v0.5)

- Text is single-line; wrapping is the module's job (C-01 wraps by `measure`). CJK is out of scope (English UI).
- pixel16 ignores `sx` / `sy` by design and has no `path` or `atmosphere` of its own.
- The CRITICAL label of E-01 starts later than the digits (at (n − 1) × stagger + 25 % of the life) and so ends about 0.3–0.5 s after them; at t = 2600 only the label is left. That is the module's timing (`damage-numbers.js` `life()` and the label age). It is the same in every skin and needs a module change, not a skin or scene change.
- hd-diorama and lowpoly still read pre-standard light fields (`ADAPT` in `scene/shared-scene.js`), and hd-diorama does not yet use `post-props`.
- The generic `bar()` ignores `tag`, and the generic `cursor()` is plain: style skins should override them.
- Bitmap roles (v0.5) do not hook `unitToken`; hosts draw character bitmaps themselves (`GameDNA_Assets.draw`) or through `skin.bitmap(ctx, rect, 'sprite', kind)`. Generated art is for non-pixel skins in this batch.

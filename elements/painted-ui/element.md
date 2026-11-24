# L-06 UI frames & icon sheet

## 1. What it is

Most prototypes draw windows as a dark rectangle with a 2 px light border and items as coloured circles, squares and diamonds. This element replaces those pictures with one generated, style-locked UI kit, without touching layout, text, input or rules:

1. **Generate once** (build time, Codex `image_gen` through `tools/assets/gen.sh`, a fixed model / high, verified from `the generator logs`), with the L-00 STYLE LOCK paragraph and reference sheet on every call (the small and selection frames were regenerated with the window frame itself as reference, so all metal is the same antique brass): an ornate **window frame** (corners mirrored, plain stretchable edges, empty transparent centre), a **small frame** for buttons and tooltips, a **selection frame**, an **item slot**, a right-pointing **pointer**, and an **icon sheet** of 24 icons in a 6×4 grid (potions, food, scroll, gem, weapons, armour, ring, amulet, coins, key, and six status emblems).
2. **Post-process** with `tools/uikit.py` (crop, scale, alpha cleanup, export only; nothing is redrawn): frames are trimmed, the corner ornaments are found along each edge, left/right and top/bottom slices are made equal, and the image is compacted to corners + a short plain edge piece; the icon sheet is split by shape (each shape goes to the cell its centre falls in, so a neighbour's tip is never cropped in), each icon is trimmed, scaled so its longer side is 84 % of the cell and centred by its bounds, and rebuilt as an even 6×4 atlas.
3. **Check**: `assetcheck.py` (with the new optional `frame9` check: slice valid, corner silhouettes symmetric, stretched edges uniform, centre empty), `checks/kitcheck.py` (icons centred within 2 px and at one size, no text by OCR, corners pixel-stable across 8 rect sizes).
4. **Draw**: `GameDNA_PaintedUI` draws frames as nine-slices (corners at one size, edges stretched, corners shrink evenly in rects smaller than two corners), a panel fill under empty-centre frames, icons from the atlas, a pulsing selection frame on the game's clock and the pointer. Every call returns `false`/`null` when its image is missing, so the game keeps its old drawing. `ui.attach(GameDNA_Skin)` registers the frames and icons in the SPEC v0.5 `frame9` and `icon` bitmap roles, so modules that draw through a non-pixel skin (G-01 shop, C-01 window-cursor, H-01 dialogue box…) pick the kit up.

## 2. Default parameters

| parameter | default | meaning |
|---|---|---|
| `scale` (create) | 1 | kit sizes are native px on a 640×360 canvas; use `canvasHeight / 360` |
| window corner | 24 px (8 on 256×224 skins via `attach`) | drawn size of a window corner at scale 1 (`corner` in assets.json) |
| small / select / slot corner | 9 / 14 / 14 px | |
| `panel` | `rgba(28,22,18,0.96)` | fill under empty-centre frames (walnut dark) |
| selection pulse | alpha 0.82 ± 0.18, 4.2 rad/s | on the caller's clock |
| icon fill | 84 % of the cell (108 of 128 px) | equal for all 24 icons |
| pack | 6 files, 113 KB WebP (budget 600 KB) | frames 384/256/128 px sources compacted, icons 768×512 atlas |
| `{{materials}}` / `{{icons}}` / `{{corner}}` / `{{panel}}` (prompt) | from the game's world / 24 (6×4) / ~1/12 canvas height / dark 94 % | regenerate prompt |
| `kit` / `scale` / `panel` / `guides` (demo) | on / 1 / walnut / 1 | demo controls; `?key=value` overrides; `?t=&freeze=1` |

## 3. Variants

- **Painted kit** (`?kit=on`): the full screen (menu, status strip, shop grid, tooltip, dialogue) with the kit.
- **Plain vs painted** (`?kit=split`): left half the same screen drawn as plain panels and shape icons, right half the kit; same layout and text.
- **Large UI on slate** (`?scale=1.25&panel=slate`) and **Compact glass** (`?scale=0.8&panel=glass`): the same files at other UI scales and panel fills.

## 4. Interface

**Needs:** the game's boot moved into `GameDNA_Assets.load(list, {onReady: boot})` (L-00 loader, shipped); each panel's rect; each item/status draw box and a map from item ids to kit keys; the selection rect and the pointer's tip; the game's own clock for the pulse. Optional: `skins/skin-api.js` v0.5.

**Provides:** `ui.frame(ctx, rect, {variant: window|small|select|slot, panel, alpha, corner, maxCorner, band}) → text-safe rect | null`, `ui.inner(rect, {variant, band})`, `ui.icon(ctx, key, x, y, size, {dim, accent}) → bool`, `ui.select(ctx, rect, t)`, `ui.cursor(ctx, tipX, tipY, h)`, `ui.attach(GameDNA_Skin, {skins, skin, corner, padding, cellSlots})` (draws the named skins' framed roles with capped corners, returns the safe rect, raises `shape.padding` as a padding hint, slots under square bag cells); icon keys `potion mana-potion antidote bread scroll gem sword axe bow staff shield helmet armor boots ring amulet coins key poison burn frost shock regen guard` plus aliases (dagger → sword, herb → antidote, gold → coins, fire → burn…).

## 5. Screen rules (exact numbers)

- Corners are drawn at `corner × scale` px (window 24, small 9, select 14, slot 14 at scale 1), on whole px; only the plain edges and the centre stretch. A rect smaller than `2 × corner + 2` shrinks all four corners by the same factor (never squashed, never overlapping).
- The text-safe rect is what `ui.frame` / `ui.inner(rect)` return: inset past the border AND the corner ornaments (`safe`: window 46 source px ≈ 15.5 px at scale 1, small 16 ≈ 8.5 px, select 19). Every text line, arrow and icon of the panel sits inside it (`checks/textsafe.py`: 0 text pixels on frame pixels at scale 0.8 / 1 / 1.25 and in the C-01 box). A corner is at most 1/3 of the box's shorter side.
- Small frames (tooltips, buttons, plates) always get a panel at least 97 % opaque.
- The panel fill is a rounded rect inset by half the frame's inset, under the frame; the selection frame never gets a panel.
- Icons: contained and centred in the given box, longer side 84 % of it (a 40 px slot box shows a 34 px icon). `dim` = 62 % alpha + `grayscale(0.9) brightness(1.25)` (still readable on a dark cell).
- Pointer: tip at `(x, y)`, height `h` (default 16 × scale), a 2 px bob if the caller passes `bob`.
- Pictures only: no rect, row height, text position, menu rule, input path or timer changes. The game never calls a generator; `?t=&freeze=1` is byte-identical between loads.
- Skin route: frames register for `window`, `banner` (window frame) and `tooltip`, `plate` (small frame, panel baked in, plates without it); never `row` / `backing`. Global registrations reach non-pixel skins only.

## 6. Common mistakes (symptom → fix)

- Frozen screenshot shows plain panels, or differs between loads → the boot still runs before `onReady`; move every caller.
- Corners look smeared or edges show a repeated ornament → the frame was drawn with one `drawImage` into the rect, or a regenerated frame has ornaments mid-edge; use `ui.frame`, regenerate frames until `frame9` edge deviation ≤ 28.
- Window has no background (world shows through) → `panel: null` passed, or the frame registered in a skin without `ui.attach` (raw `bitmaps.set` of an empty-centre frame); use `ui.attach` or pass a panel.
- Text sits on the border or an ornament → text placed with the old padding; lay it out inside the rect `ui.frame` returns, or grow the frame rect outward. Skin route: call `ui.attach` before creating the modules so the padding hint reaches them.
- Icons of different sizes in one grid → icons drawn at their image size; always pass the slot box size.
- Selection pulse differs between two frozen loads → `t` came from `Date.now()`/`performance.now()`; pass the game's frame count / 60.
- A cell shows two half icons (regenerate layer) → the sheet was sliced with a blind grid; use `uikit.py icons` (shape-based) and regenerate when it reports a problem.
- Pixel game looks smeared → generated art is for HD styles; keep the pixel game's own panels (pixel skins ignore the kit by design).
- Halo around thin frames → export without `--hard`; thin lines and glows need the hard alpha step.

## 7. Acceptance moments

| moment | what must be visible |
|---|---|
| `?t=4300&freeze=1` | menu with the pointer and selection frame on one row, status strip with three status emblems, shop window with 18 icons in slots (two dimmed), the selection frame on one cell and a tooltip beside it, the dialogue box; no corner stretched, no text in any image |
| `?kit=split` | left half plain, right half painted, identical text positions on both sides of the line |
| `?scale=1.25&panel=slate` / `?scale=0.8&panel=glass` | same layout, corners scaled, panel fill changed |
| sizes section | the window frame at 6 sizes and the small frame at 3, with slice guides; the single-image stretch beside them for contrast |
| icons section | 24 icons in slots: the sheet at 36 px, rows at 28, 44 and 64 px, all centred and of one size |
| skin section | the unchanged G-01 shop and C-01 message box on a non-pixel skin, left procedural, right with the kit attached (frames, tab plates and shop icons) |
| `checks/kitcheck.py` | `"ok": true` (assetcheck incl. frame9, icons, no text, nine-slice) |

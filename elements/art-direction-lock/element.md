# L-00 Art-direction lock

## 1. What it is

Generated images have no seed: the same prompt gives a new picture every time, and a style described only in words drifts in proportions, rendering and palette from asset to asset. This element fixes the art direction before any game asset is made:

1. **Lock.** Write one STYLE LOCK paragraph for the game (medium, camera, light direction, outline, palette words, shadow rule, proportions, originality guard) and generate one **style-reference sheet** with it: one character, one prop, one ground patch and one item icon in a row on a transparent background. Save the sheet unchanged; its sha256 goes into the manifest.
2. **Derive.** Every later asset is generated with the same paragraph **and** the sheet passed as `referenced_image_paths`, with a fixed opening sentence ("match the attached sheet in rendering… do not copy its items or layout").
3. **Process and check.** `postproc.py` trims, resizes to the drawn size, cleans alpha (subjects come out at alpha ~254 with soft edges), fixes tile seams and exports WebP; `assetcheck.py` checks every file against `assets.json`.
4. **Ship and load.** The game loads the saved files once at boot with `GameDNA_Assets` and draws them synchronously. It never calls a generator, so `?t=&freeze=1` and `?auto=1` stay deterministic.

It is the foundation of the L family (L-01 parallax layers, L-02 portraits, L-06 UI frames and icons): the shared tools live in `tools/assets/`, and skins can draw the bitmaps through the SPEC v0.5 bitmap roles.

## 2. Default parameters

| parameter | default | meaning |
|---|---|---|
| `{{assets}}` (prompt) | character, prop, ground tile, icon | what to derive from the sheet |
| `{{style}}` (prompt) | modern hand-painted 2D game art | medium words in the STYLE LOCK paragraph |
| `{{light}}` (prompt) | TOP-LEFT | key light direction, identical in every prompt |
| `{{scale}}` (prompt) | 2 (HD canvas), 1 (fixed low-res canvas) | stored size = drawn size × scale |
| generator | Codex `image_gen`, a fixed model, `--sandbox workspace-write` | fixed; verified from `the generator logs` |
| pack budget | ≤ 600 KB | the sample pack is 271 KB for 18 files |
| `set` / `hour` / `light` / `anchors` / `bg` (demo) | with / dusk / 1 / 0 / check | demo controls; `?key=value` overrides |

## 3. Variants

- **Locked set at dusk** (`?set=with`): the scene built from the derived set.
- **Same prompts, no reference** (`?set=without`): the same scene from the assets generated with the identical prompts but without the sheet.
- **Night, anchors shown** (`?hour=night&anchors=1&light=1.2`): foot anchors and drawn boxes, for checking placement.
- Other genres change only the STYLE LOCK paragraph (camera: strict side view for a side-scroller) and the sheet's four items.

## 4. Interface

**Needs**
- The game's boot function (first step, `?t=` fast-forward, first animation frame), moved into `GameDNA_Assets.load(list, {onReady: boot})`.
- Each draw site to replace (hero, props, floor, item icons) with its drawn size and foot point in canvas pixels.
- Optional: `skins/skin-api.js` v0.5 to route tile / prop / frame / icon / portrait / bg-layer roles to bitmaps.

**Provides**
- `GameDNA_Assets`: `load`, `onReady`, `get(key) → {img, w, h, meta} | null`, `draw(ctx, key, x, y, {h, flip, alpha})` (false when missing), `drawFrame`, `fillTiled`, `status`, `create` (module README has the full table).
- `GameDNA_Skin.bitmaps.useAssets(GameDNA_Assets, {'tile:grass': 'ground', …})`: skins draw the bitmaps for those roles (SPEC §2.7).
- `assets.json`: per file role, size, anchor, baseline, grid, seam, sha256, source run (PROMPT.md, GEN.md, meta.json with verified model).
- `tools/assets/`: `gen.sh`, `genmeta.py`, `namecheck.py` + `blocklist.txt`, `postproc.py`, `assetcheck.py`, `stylestats.py`.

## 5. Screen rules (exact numbers)

- **Sheet:** one landscape image, 4 items in one row separated by ≥ 6 px of fully transparent columns (so `postproc.py pick` can split it), same game scale, no text. Sample: 1774×887 source, shipped at 960×428.
- **Stored size:** drawn size × backing scale. Sample (HD 960×540 canvas, dpr ≤ 2): characters 240 px tall (drawn 112–116), well 260 (drawn 150), lamp post 300 (drawn 175), oak 360 (drawn 190–250), icons ≤ 128 (drawn in 44 px slots), ground 256×256 (drawn 224×224).
- **Alpha:** after `alpha`: no pixel with alpha 250–254 above 2 % of the subject; all four corners alpha 0; halo share ≤ 0.08 (edge pixels whose luma differs > 48 from the opaque pixels within 2 px). Sample: 0.000–0.041.
- **Tiles:** wrap-edge difference / mean neighbour difference ≤ 1.5 in x and y after export (sample 1.29); WebP quality ≥ 95 or PNG.
- **Grids (sprite sheets):** w divisible by cols; baseline spread ≤ 2 px.
- **Anchors:** sprites and props draw from the foot (bottom centre, `anchor [0.5, 1]`); depth-sort by foot y.
- **Loader:** images ready before the first step; a missing file returns `null` / `false`, never throws; restart never reloads.
- **Skins:** global bitmaps only on non-pixel skins; with none registered every skin draws v0.4 pixels exactly.

## 6. Common mistakes (symptom → fix)

| symptom | fix |
|---|---|
| Assets look like five different games | Every prompt must carry the identical STYLE LOCK paragraph **and** the sheet in `referenced_image_paths`; never edit the paragraph between assets. |
| A frozen screenshot sometimes lacks the art | The boot ran before loading finished. Call the old boot only from `onReady`; remove the direct call. |
| White or dark fringe around a sprite on the other ground | Run `postproc.py alpha --defringe 3` after resizing (generated edges are soft and carry the generator's backdrop colour). |
| Sprite looks slightly translucent | Generated subjects are alpha 254: `alpha` maps ≥ 200 to 255. |
| Visible grid lines in the floor | Run `seam --mode tile`, resize with `--wrap xy`, export WebP ≥ 95 (lossy WebP at 82 re-opened the seam: 1.94). |
| Character floats or sinks | Pass the old sprite's foot point (its top + height), not its top-left; check with the demo's anchors view. |
| Prop drawn huge through a skin | `skin.prop()` sizes by cells (`meta.cellsTall`, default 2), not by the game-scale `drawH`. |
| Sheet has captions, swatches or touching items | Regenerate the sheet; never paint over it with code. `pick` needs transparent gaps. |
| `namecheck.py` refuses the prompt | Describe the look in plain words; remove names and "in the style of"; keep the guard sentence. |
| Hoping to regenerate the same image later | There is no seed: keep the files, prompts and sha256; regenerate only by making a new asset and checking it again. |

## 7. Acceptance moments

| shot | must be visible |
|---|---|
| `shots/01-scene-with-dusk.png` (`?t=4200&freeze=1`) | ground tiled without seams, oaks, lamp post and well with warm light pools, the keeper walking on the cobble patches with lantern light, the herbalist, the HUD key and vial icons; no fringe on any sprite |
| `shots/02-scene-without-dusk.png` (`&set=without`) | paragraph only: the same scene with the no-sheet herbalist, well, ground and key (4 of 8 swapped) |
| `shots/02b-scene-words-dusk.png` (`&set=words`) | words only: all 8 images from plain one-line prompts; the set visibly breaks (top-down tree, red-roofed well, heavier lamp post, more saturated) |
| `shots/03b-scene-night-words.png` | words-only set at night; the herbalist stays readable |
| `shots/03-scene-night-anchors.png` (`?t=2600&freeze=1&hour=night&anchors=1`) | foot crosses on the ground line of every sprite, boxes matching the art |
| `shots/05-sheet.png` | the locked sheet on a checker with its style paragraph and sha256 |
| `shots/06-derive-checker.png`, `07-derive-light.png` | the three-condition bars (words 0.329, paragraph 0.240, locked 0.215) and sheet item / locked / paragraph only / words only for character, prop, tile, icon; clean edges on checker and light |
| `shots/08-repeats.png` | a new character type (guard, 3 vs 3) and the herbalist (6 vs 6), locked vs paragraph only, with means that match the text |
| `shots/09-skin-hook.png` | the flat skin's map, procedural vs bitmap roles |
| `shots/10-phone-390.png`, `12-phone-derive-390.png` | the page at 390 px with no horizontal overflow; section 2 cards not clipped |

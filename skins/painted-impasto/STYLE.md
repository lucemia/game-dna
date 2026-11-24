# Painted impasto HD (`painted-impasto`)

> Hand-painted HD 2D in thick oil paint: broad impasto strokes that catch a warm golden key light from the upper left, deep cool plum-brown shadows, a bold dark umber outline around every figure and object, and ornate framed UI in oxblood lacquer and hammered gold. Units, props, the HUD portrait, the ground and the window frames can come from a small generated pack locked to one style sheet (L-00); everything else, and everything when the pack is missing, is painted in code with the same brush.
> Skin file: `painted-impasto.js` (registers `painted-impasto` with `GameDNA_Skin`). Preview: `preview.html` (`?t=ms&freeze=1`, `?art=0` for the code-drawn fallback). Pack: `assets/` (`assets.json`, `pack/*.webp`, `gen/<run>/` prompts and model check). Original art; no real game, studio, character, map or artist is referenced or imitated.

## 1. Essence and what it is not

- **Paint you can feel.** Every surface is made of strokes with thickness: a ragged bristle edge, a lighter ridge on the side facing the light and a darker lip on the other. Ground, range washes, gauge fills, the move arrow, the window panels and the numerals all carry it.
- **Warm key, cool shade.** One golden key light from the upper left; shadows fall away to the lower right in plum-brown, never black. Values are strong: the picture reads in silhouette.
- **Drawn figures.** A bold umber outline holds every character and object, so small units read against busy paint.
- **Ornate but readable UI.** Lacquer panels with visible strokes, hammered-gold rims, leaf corners with a team gem; serif small caps for names; text sits on calm areas only.
- **Not:** `lit-hd` (smooth dusk light, glass panels, glow, made for real-time lights); `gothic` (near-black candle-lit crypt, blood red, iron and leather); `watercolor` (transparent washes on paper, pen line); a pixel style; a photo-real render; any recognisable existing game's look.

## 2. Material and drawing

- **Canvas:** native 256×224, `scale: 'fit'` (backing store = display px × dpr, `ctx.setTransform(s,…)`), smoothing on.
- **The brush (`skin.impasto.stroke`)**: a 6-segment spine with a slight bend, widths jittered ±7 % per segment (bristle edge), a taper at both ends, a ridge line (`mix(colour, #fff4d6, 0.42)`, width 0.16 w) on the lit side, a lip line (`mix(colour, #1a0c10, 0.5)`, 0.13 w) on the shaded side, and 1–3 bristle streaks. Seeded, so the same call paints the same stroke every frame.
- **`painted(path)`**: fill a shape, paint 2–5 clipped strokes over it (light ones upper-left, shade ones lower-right), shade gradient to the lower right, 0.75 px umber outline. Used for every code-drawn figure and prop.
- **Banks:** `tile('water')` records its cell; `atmosphere('world')` paints, on every water edge that meets land, 3 short jittered mud strokes (sienna, lit ridge), a wet dark lip and a cream ripple, then clears the record. Hosts that skip the world phase get no banks.
- **Ground:** a continuous colour field (two octaves of value noise at world position, a padded 7×7 texel grid drawn bilinear, so cells meet on identical samples), then either the generated grass / water texture (`cells: 4`, one 64-px block per 4×4 cells) with the field laid over in soft-light plus two loose dabs per cell to break the repeat, or 5–6 code strokes per cell. Strokes belong to world cells and each cell draws its neighbours' strokes clipped to itself: no tile seams. Water drifts (3 px/s) with moving cream glints.
- **Figures and props:** generated sprites (painted contact shadow baked in) get an extra umber outline (their ink-tinted silhouette stamped at 8 offsets, 0.42 native px) so they hold against busy washes, plus a soft cast shadow down-right (plum, 0.46); or code-drawn painted figures (legs, body by kind, tabard in team colour, helm / hood / horns, sword + shield, staff + orb, axe, bow).
- **Light carriers** (brazier, lamp, crystal): additive warm or cool glow at the measured flame / glass point of the sprite; the brazier adds two painted flame tongues and rising paint-fleck sparks on the game clock.

## 3. Colour

- **Ink** `#1f130c` (umber), never black. **Cream** `#f6e7c4`. **Gold** `#e0b052` (light `#fbe3a0`, dark `#8a5a22`).
- **Ground ramps** `[shadow, mid, light, accent]`: grass `#3e4a1e #6e7c32 #a8a848 #c8a24a`; water `#163a48 #2a5e6e #4a8a8a #cfe0c8`; mountain, road, sand, floor, wall, fort, bridge in the skin file.
- **Mood:** `world` phase multiplies a warm-cream → plum gradient (`#fff2dc` → `#76587c`) (upper-left → lower-right) and adds a soft-light gold bloom at the upper left; light pools are additive (0.75 × 0.9 × intensity at the centre, radius ≈ 1.1 × the light's r, at least 24 px). `final` phase: canvas-weave varnish (overlay, 0.5) and a plum vignette (`#1a0c10`, 0.55).
- **Teams:** a slate blue `#4d6e9e`, b crimson `#a8343a`, n `#8a8270`; gems on window corners `#6f9ad8` / `#d8434a` / `#d79a3a`.
- **Overlays** (wash alpha, rim): move `#2f6ad8` .40 / `#d4e6ff`; attack `#c83a30` .34 / `#ffc4a8`; threat `#8a4aa8` .27; heal `#4aa45a` .32.
- **Numbers** (top → bottom, swash): damage `#fffaf0` → `#f2cf9a`, none; crit `#fff6c8` → `#f29a2a` on crimson `#a8261e`; heal → `#6cc85a` on `#1e4a24`; MP → `#5a9ae0` on `#1c3460`; status → `#a86ad8` on `#3a1a4c`; miss grey.

## 4. Type and UI

- **Fonts:** Alegreya SC 700/800 (titles, plates, labels, CRITICAL), Alegreya Sans 700 (items) and 900 (numerals). Doc pages load them from Google Fonts; games fall back to Palatino / Gill Sans / system-ui.
- **Window:** lacquer body (a: `#33282e`, b: `#4e1c1c`, n: `#3c261d`, darker at the bottom) with one row of broad horizontal strokes per ~7 px, a warm pool at the upper left, a drop shadow (6 blur, 1.2/2.4 offset). Rim: the generated frame (oxblood wood, hammered-gold bead, acanthus-leaf corners with a garnet) nine-sliced at a 3.1 px band; code fallback keeps the same identity: an umber line, an oxblood band, a gold gradient bead with hammered dents and gold leaf corners with a garnet.
- **Plate / banner / tooltip:** the slim generated gold frame at ≤ 1.9 px; banners add crimson ribbon tails.
- **Row:** a gold-ochre paint swash with ragged ends behind the selected item. **Backing:** a recessed dark well with a top inner shadow and a gold hairline.
- **Pointer:** a gilded spearhead with an umber outline and a lit ridge, nudging 0.7 px. **Map cursor:** four hammered-gold corner brackets breathing outward 0.4–1.2 px.
- **Gauges:** a dark groove with a gold rim; the fill is one thick stroke with a ragged leading end and a lit ridge; haste / slow are outlined double chevrons.

## 5. Motion

- Eases: move `outCubic`, pop `outBack`, fade `outQuad`. Landing squash `{x: 1.14, y: 0.88, ms: 90}`. Selected unit bobs (0.8 Hz, 1.2 px). Trees sway by a 0.4 % shear. Wraith hovers ±0.8 px. Range wash breathes ±10 % on a 2.2 rad/s wave across the set. A single glint travels the move arrow on a 1.6 s loop.
- Everything is a function of the module clock: `?t=&freeze=1` is deterministic; the skin never changes timing.

## 6. Camera and composition

- Three-quarter top-down (about 35°) for all generated art; side views are out of the lock. Light from the top-left everywhere, so cast shadows and lips fall to the lower right.
- Keep the UI on the map's calm corners; the ornate rim needs ~4 px of clear map around it.

## 7. Sound (guidance for hosts)

- Wooden and leather clicks for the menu, a soft brush swish on cursor moves, a low drum and cloth thump on hits, a bright bell on crits. No synth.

## 8. Signature moves (defaults)

| move | default |
|---|---|
| Impasto stroke | ridge 0.55, lip 0.45, taper 0.35, 2 streaks, bend ±0.25 w |
| Range wash | flat wash (alpha .27–.34) + 2 horizontal 6.5-px strokes per row, laid in world space every 64 px; 1.6 px light rim + 0.6 px deep edge |
| Number swash | one stroke behind the digits, 0.78 × font size, bend −0.12, for crit / heal / MP / status |
| Numeral | 2.6 px umber outline (× √1.4 on crits) + drop (0.5, 1.1, blur 1.6), cream→colour fill, 2 clipped streaks (light upper, dark lower) |
| Selected row | gold-ochre swash, h × 1.05 wide, ragged ends |
| Move arrow | umber casing 0.30 T, dark gold 0.22 T, gold 0.17 T, ridge 0.07 T offset up-left, gilt boss at the origin, painted arrowhead |
| Shadows | contact ellipse 0.38 aspect + cast shadow sheared down-right, plum `#1a0a14` |
| Varnish | 520 crossing grey strokes, overlay at 0.5 |

## 9. Common mistakes

| symptom | fix |
|---|---|
| Ground shows a cell grid | draw the field from the padded texel grid with smoothing; let each cell draw its neighbours' strokes clipped to itself |
| Range looks like pasted squares | lay the wash strokes in world space per row (same endpoints in every cell), not per cell |
| Grass texture repeats every 4 cells | soft-light the continuous field over it and add loose dabs per cell; do not mirror blocks (the symmetry is more visible than the repeat) |
| Generated sprites float or have a double shadow | foot = image bottom × 0.985 (their own painted shadow); add only the cast shadow, keep the contact one faint |
| Frame corners overlap on small windows | `drawFrame9` shrinks the band when w < l + r; keep plates ≥ 12 px tall |
| A prompt drifts in palette | always pass the sheet as a reference and paste the style lock unchanged (L-00) |
| Number streaks spill outside the glyph | clip them with `destination-in` on a scratch layer, never `source-atop` on the shared layer |
| Pack images arrive after the host cached its ground | draw after `skin.impasto.ready` (the preview does); the code-drawn ground is used until then |

## 10. Engine and skin API notes

- Registers with `GameDNA_Skin.register`; methods `frame text number overlay bar cursor path tile prop unitToken atmosphere`; `frameRoles: ['row', 'backing']`; `atmospherePhases: ['world', 'final']`.
- **Bridge `skin.impasto`** (attached after registration, because `define()` deep-merges the spec and the pack holds DOM images): `ready` (Promise, settles when the pack loaded or failed), `useArt(bool)`, `load(baseUrl)`, `art` (`{on, loaded, failed, imgs}`), `ART` (drawn sizes, flame points, nine-slice data), `stroke`, `painted` (the brush, for hosts that want to paint their own HUD bits).
- **Pack location:** `assets/pack/` next to the script (`document.currentScript`), or `window.GameDNA_ImpastoBase = '<url>/'` set before the script loads. A host that inlines the script gets no base and stays code-drawn unless it calls `load()`.
- **Bitmap roles:** the skin draws its own pack inside its own methods (units by team + kind: a knight / lord → captain, a mage → field mage, b fighter / monster → ghoul, b mage → wraith; `id: 'card'` → portrait). A host registration through `GameDNA_Skin.bitmaps.set(..., {skin: 'painted-impasto'})` still wins (SPEC §2.7) and replaces the skin's tile / prop / frame for that kind. The manifest lists `skinRole` for props, tiles and frames so `bitmaps.useAssets` can register them on another non-pixel skin.
- **Gaps hit:** (1) `GameDNA_Skin.ready()` waits for fonts only; a skin with a bitmap pack has no way to delay the host's first frame, and `shared-scene.js` caches the ground per skin and scale, so a pack that loads after the first frame keeps the code-drawn ground until reload. On `compare.html` the local pack loads before the web fonts, so the race does not show. A `skin.whenReady` promise awaited by `ready()` would close it. (2) `unitToken` has no bitmap role, so sprite choice by kind is skin code.
- No WebGL; works under I-08 (draw as usual; no emissive records).

## 11. Variation space

- **Hour:** swap the world multiply for a dusk plum and raise light pools to 0.8 for an evening map; keep the key light direction.
- **Palette:** a winter set (slate, bone, rust) changes only the ramps and the style-lock palette words; regenerate the pack from a new sheet.
- **Frames:** iron-and-leather or carved-stone frames from the same frame prompt with other materials (keep the plain-edge rule for nine-slicing).
- **Brush weight:** ridge 0.3 / lip 0.25 for a softer gouache feel; 0.7 / 0.6 for heavier paint.

## Fits which elements

- Tactics and squad battles (grid-range-path, window-cursor, damage-numbers, squad formation, tactic rules, clash forecast): the target use.
- Turn-based battle menus and unit cards (portraits through `id: 'card'`), dialogue windows (C-01 frames), toasts (gold-rim plates).
- Top-down exploration with props and lights.
- Poor fits: neon / sci-fi UI, pixel hosts (generated art is HD only), very small canvases under ~2× native (the strokes turn to mush below 512 px wide).

## Review history

- Critic r1 (`checks/critic-r1.json`): 7.8, pass, no resemblance, no major. Fixed after it: deeper plum fall-off and stronger light pools, art-mode ground drawn as whole 4-cell blocks (no sub-rect seams), saturated move wash with lit ridges, umber outline on generated sprites, stronger backing well, fallback frame and grass palette matched to the pack, 390 px title tag. Then, at the coordinator's request, the pack was regenerated under STYLE LOCK v2 (`assets/prompts/style-lock-v2.txt`: palette knife, a few big strokes, flat value planes, no fine detail, 1/30 outline) in 3 more runs (`gen/v2-sheet`, `gen/v2-units-tiles`, `gen/v2-props`; frames kept from v1); code-drawn figures moved to fewer, wider strokes to match; range-wash strokes now span 32 cells (no joins every 64 px). Before / after: `shots/before-v1/` vs `shots/`. Tried and dropped: mirroring the grass blocks by parity to double the repeat period (the reflection symmetry read worse than the plain 4-cell repeat); instead a thin flat layer of the grass mid tone calms the texture.

- Critic r2 (coordinator's, `checks/critic-r2.json`): 8.0, pass, no resemblance. Minor pass after it, no new image runs: the grass tile's landmarks (3 flowers, 3 stones) painted out in post with shifted grass from the same tile (`tools/pack_post.py grass-clean`), flowers and pebbles scattered per cell in code (seeded, about 13 % / 8 % of cells); the ground drawn as one world-space repeating pattern (no image-border resampling at 64-px block edges); painted mud banks where water meets land (from the water cells tile() drew this frame, in `atmosphere('world')`); code fallback ground as flat-ended knife planes in the pack's ochre, faceted ochre-olive tree crowns, an outlined lamp post; portraits median-filtered (`pack_post.py soften`) to remove the small checker facets. Before / after: `shots/before-r2/` vs `shots/`.

## Reviewer checklist

- [ ] Every surface reads as thick paint (ridges and lips visible), including code-drawn ones (`?art=0`).
- [ ] Key light from the upper left everywhere; shadows plum-brown to the lower right; no pure black.
- [ ] Every unit and prop has a dark outline and reads at 100 % zoom.
- [ ] Windows: lacquer with strokes, gold rim, leaf corners; text never sits on an ornament.
- [ ] Ranges: four kinds distinguishable; the set boundary is clear; no cell grid in the wash or the ground.
- [ ] Numbers: legible at a glance; crit clearly bigger with a crimson swash.
- [ ] Nothing looks like an existing game, studio, character or artist (critic question; yes = major).
- [ ] Pack: assetcheck passes, every prompt name-checked, model verified in `gen/*/meta.json`, ≤ 600 KB.
- [ ] `?t=&freeze=1` identical between runs; no page errors; no horizontal overflow at 1280 / 500 / 390.

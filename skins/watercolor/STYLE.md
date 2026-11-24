# Hand-painted watercolor storybook (`watercolor`)

Skin file: `watercolor.js` (needs `skins/skin-api.js` first). Preview: `preview.html` (`?t=1400&freeze=1`). Prompt fragment: `prompt.md`.

The game looks like a page from an illustrated storybook: warm paper you can see the tooth of, transparent pigment that pools at its edges, a sepia pen that wobbles a little, and parchment cards laid on top of the page for the interface.

## 1. Essence, and what it is not

- **Is**: one physical page. Every visual is either pigment soaked into that paper (terrain, range washes, number splashes) or a separate scrap of parchment laid on it (windows, plates). Ink is the only hard line, and even ink wavers.
- **Is**: calm and legible. Washes are pale enough that pawns and numbers always read on top; a classical serif carries the voice.
- **Is not** a filter over pixel art or a flat vector UI with a paper texture. No hard rectangles, no perfectly straight borders, no drop-shadowed sans serif.
- **Is not** ink-wash (sumi-e) or any East Asian brush style: no calligraphy strokes, no seals with characters, no red stamp signatures. Motifs are neutral European-flavoured fantasy: meadows, standing stones, banners, pennants.
- **Is not** murky. Watercolor goes muddy when layers multiply over dark terrain; here overlays are pale body colour laid over a thin paper veil, so a blue range over a blue river stays clear.

## 2. Material

- **Paper**: `#f1e6cf`, tooth from seeded value noise (`grainTex`, 192 px, cached), a few fibres, 8–10 soft tea stains, warm vignette at 0.16–0.22. The tooth texture is drawn at device resolution (`pattern.setTransform(1/scale)`), so it never blurs when the native canvas is scaled.
- **Wash**: 4–6 layers of the same polygon, each deformed again (`deform`, midpoint displacement), each at alpha 0.06–0.2; granulation specks (`granTex`, per colour) where pigment settles; a pooled rim (darker 0.4–0.7 px stroke at the edge, plus a 1.8–4 px band just inside it).
- **Ink**: sepia `#3a2a1e`, 0.4–0.7 px at native scale, offset along smooth 1D noise (amplitude 0.2–0.7 px), drawn twice (second pass 30 % alpha, wider wobble) for a dry-pen look.
- **Parchment**: cards with a deckled edge (noise displacement up to 1.1 px, nibbled corners), a gradient from `#f6ecd4` to `#e9d7b0`, the same paper tooth, an aged rim (umber `#9a7444` strokes at 0.2 and 0.3 inside the edge) and a soft lifted shadow (blur 3, dy 1.2).
- Everything is procedural and seeded from positions or sizes: the same frame always paints the same picture, and a window does not shimmer as it moves.

## 3. Colour

| token | value | use |
|---|---|---|
| `ink` | `#3a2a1e` | every line, body text |
| `paper` | `#f1e6cf` | the page, halo behind numerals |
| `ui.fill` → `ui.fillTo` | `#f6ecd4` → `#e9d7b0` | parchment cards |
| `ui.rule` / `ui.rim` | `#6b4a2e` / `#9a7444` | inner ink rule, aged edge |
| `team.a` / `team.b` / `team.n` | `#4a72a8` cerulean / `#b04a3a` madder / `#8f8060` umber | pawns, card rules |
| `overlay.move` | fill `#7aa2cc`, edge `#2d5a8c`, α 0.42 | reach |
| `overlay.attack` | fill `#d98a68`, edge `#9a3a26`, α 0.42 | strike fringe |
| `overlay.threat` | fill `#a488c0`, edge `#5e3c80`, α 0.36 | enemy danger |
| `overlay.heal` | fill `#94bf78`, edge `#3f6e2c`, α 0.40 | support range |
| `overlay.path.core` | `#2c4a78` indigo | the brush-stroke arrow |
| `fx.hot / cold / heal / crit` | `#c8603a` / `#4a7fb5` / `#5d9a48` / `#a8281e` | effects |
| `text.accent` | `#a8281e` | alerts, invalid cursor |
| `fx.gold` | `#c49a3a` | selected-row band, cursor glow, banner |

Muted, low-saturation pigments plus one ink. Highest chroma is reserved for the critical (`#8a1c14` numerals over a `#c84a32` splash). Never pure black, never pure white (the brightest is the paper halo `#f6eedb`).

## 4. Type and UI

- **Body**: Cormorant Garamond 600 at 8.5 native px (docs load it from Google Fonts; games fall back to Georgia / Times, no web fonts in a game). Sepia ink, title case, a faint wet-ink bleed (second fill at 28 %, offset 0.25 px).
- **Titles**: IM Fell English 10 px. **Labels**: Cormorant italic 6.5 px, uppercase with 0.35 px tracking (small-caps feel). **Plate**: Cormorant italic 7.5 px.
- **Numerals**: Playfair Display 700, 13 px, lining figures (old-style figures made `128` read as `I28`). MISS and status words: Cormorant italic 700, 10 px.
- Text is placed by alphabetic baseline at `y + size × ascent`, so the glyph box top stays at `y` whichever serif the system resolves.
- **Windows**: parchment cards (§2) with a wobbly inner ink rule 2.6 px in and tiny coloured corner diamonds. Team = rule colour + 6–8 % fill tint + diamond colour, never a coloured title bar.
- **Selected row**: frame role `row`, a loose ochre wash stroke with ragged ends (`layout.rowFrame: true`).
- **Pointer**: an ink pen nib (8×5 box) with a slit and a faint madder blot behind it; it sways 0.9 px on a 1.1 s eased cycle.
- **Bars**: a pencil-ruled well (umber track at 0.14) holding a ragged wash stroke that deepens toward its leading edge; haste / slow tags are small ink seals with an italic H or S.

## 5. Motion

- Smooth, no frame stepping (`stepMs 0`, no snap). Eases: move `inOutQuad`, pop and window open `outCubic`, fades linear and continuous (`fadeSteps: null`).
- Range washes bloom in: alpha follows `outCubic(grow)` and the edge wobble grows from 60 % to 100 % as the wash spreads.
- Overlays breathe (±10 % alpha, 1.7 rad/s, phase across the set) instead of blinking or pulsing in steps.
- Cursor brackets breathe outward by up to 1.2 px (`sin(2.4 t)`); the pen nib sways; nothing blinks.
- Numbers keep the module's bounce, with a gentle landing squash (`motion.squash {x 1.05, y 0.93, 90 ms}`), and the splash follows at half the bounce.
- Flash ceiling 0.22: a critical warms its numerals toward gold for the module's flash frames; there is no white flash.

## 6. Camera and composition

- Top-down storybook map, a straight overhead page; no tilt, no parallax inside the page. The page border vignette frames the scene.
- Native 256×224 (any size works); host sets backing = native × CSS scale × devicePixelRatio and draws in native units through `ctx.setTransform`. Minimum useful scale 2.
- Props that stand up (stones, trees) are drawn after the range washes, so pigment never sits on top of a standing object; flat things (thickets, paths, water) sit under the washes.
- Keep a quiet margin: the faint pencil grid at 10 % shows tiles without ruling the page.

## 7. Sound (direction)

Paper and quill: a soft page-turn for windows opening, a nib scratch for the cursor step, a wet brush dab for each number landing, a low wooden knock for pawn moves, plucked lute or harp for menus. No synth bleeps.

## 8. Signature moves (with defaults)

1. **Warped wash range**: one world-anchored warp field (frequency 0.095/px, amplitude 1.7 px) bends every cell outline, so neighbouring cells share points exactly and a boundary run becomes one continuous wavering edge; convex corners rounded with a 2.6 px quadratic arc. Layers 3, veil 0.16, mottle 0.55, pool band 0.11, edge 0.65, bleed 0.10, granulation 0.5.
2. **Brush-stroke path**: corners rounded at 5.5 px, a tapered ribbon (3.4 px, thinner where the brush lands), a 6.8 px pale bleed halo, granulation, pooled edges, two dry-brush streaks, a landing blot at the start and a two-flick arrowhead (7 px) that owns the last tile.
3. **Inked numerals over a splash**: paper halo (2.6 px), sepia or kind-coloured ink, a 4-layer wash splash in the kind colour (0.16; crit 0.2) with 3 droplets (crit 7 spatter drops).
4. **Deckled parchment card**: deckle 1.1 px, aged rim, lifted shadow, wobbly ink rule, corner diamonds.
5. **Pen-nib pointer and brush-tick cursor**: tapered L ticks in ink with a gold glow in the tile (0.12–0.18).
6. **Painted pawns** (`unitToken`): bell-shaped body washed in the team colour, a paper-white highlight, an ink outline, a little wooden base and a pennant, pointed hat, axe or bow by kind.

## 9. Common mistakes

- **Murky overlays**: multiplying a dark wash over water or forest. Use pale fill + paper veil, source-over; keep alpha ≤ 0.45.
- **Straight borders**: overlay cells drawn as rectangles with a 1 px edge. Warp the outline; pool pigment inside the boundary.
- **Notches between tiles**: displacing each side by its own normal noise gives gaps and spikes at shared corners. Warp all points with the same field.
- **Per-tile wobble** that looks like torn stamps: keep the warp low-frequency (period ~10 px), add only a small second octave.
- **Blurry paper**: a texture drawn in native units and scaled 4×. Patterns must be set to device resolution.
- **Halos showing through fading ink**: fade the whole number once (`fadeLayer` when skin-api has it).
- **Old-style figures for damage**: `1` reads as `I`. Use the lining `num` font.
- **Arrow eaten by props**: draw standing props before the arrow or keep the destination tile clear; the head ends 2 px past the tile centre.
- **Coloured title bars on windows**: reads as a web UI. Tint the rule, not a band.
- **Blinking**: any on/off toggle breaks the calm. Breathe or sway.

## 10. Engine and skin API notes

- `pixel: false`, `native {256×224, scale 'fit', smoothing true}`. Every method sets `imageSmoothingEnabled = true` for its own drawing and restores the caller's value (window-cursor turns smoothing off around `draw`).
- `frame(ctx, rect, {role, team, focus, alert, disabled, alpha})`: roles `window`, `banner` (double rule), `plate`, `tooltip`, plus `row` and `backing` (listed in `frameRoles`). Returns the inner rect (padding 5; plates and tooltips 3). Shape is seeded from width and height, so a moving window keeps its edge.
- `text` / `measure`: canvas fonts by name (`ui`, `title`, `label`, `plate`, `num`, `word`); `outline` becomes a paper halo.
- `number`: glyphs in canonical order (main, suffix, label), each item has `i`, `ch`, `role`, `x`, `y`, `w`, `h`. Honours `glyphOffset → {dx, dy, alpha, flash, skip, sx, sy}`. Returns one rect per drawn glyph `{i, x, y, w, h, role}`. Uses `GameDNA_Skin.fadeLayer` when present.
- `overlay(ctx, tile, kind, t, {grow, pattern, tile, edges, seams})`: `seams` not needed (interior sides meet exactly); `pattern 'pulsing'` and `'breathing'` breathe, `'checker'` lightens alternate cells to 72 %.
- `path(ctx, points, t, {color, draw 0..1, width})`: tile centres in native px. `draw` lets a host brush the stroke in.
- `bar`, `cursor` as in SPEC; `cursor('hand')` box is 8×5 (`layout.handW/handH`).
- Extras: `tile(ctx, rect, kind, t)` (paper + pigment per cell, washes clipped to the cell), `unitToken(ctx, rect, unit, t)`, `atmosphere(ctx, view, t, {phase: 'world'})` (paper tooth + vignette; `'final'` draws nothing), `brush` (`wash`, `ink`, `paper`, `blob`, `deform`, `rng`, `noise`, `fbm`, `texFill`, `grain`, `gran`) for hosts that paint their own terrain, and `numberLayout(text, opts)`.
- `motion.squash`, `motion.ease.open`, `layout {handW 8, handH 5, pointerGap 5, rowFrame true, backing 'none'}` are hints read by damage-numbers and window-cursor.
- Cost: a wash cell is ~4 polygon fills and 2 pattern fills; 60 cells plus a path and 4 numbers redraw comfortably at 60 fps at 4× scale. Cache terrain painted with `brush` once per backing size.

## 11. Variation space

- **Season**: spring (default sap greens), autumn (`overlay.move` to ochre `#d0a050`, meadow wash `#d8c07a`), winter (paper `#eef0ee`, cool ink `#2e3440`, washes desaturated by 30 %).
- **Ink weight**: 0.4 px (delicate, default) to 0.9 px (bold picture-book); wobble 0.2–1.0 px.
- **Wash strength**: overlay alpha 0.3 (airy) to 0.5 (saturated); never above 0.5.
- **Paper**: cream (default), white cold-press (`#f7f4ec`, stronger tooth), toned tan (`#e8d6b0`, lower contrast; raise ink to `#2a1c12`).
- **Numerals**: Playfair (default, crisp) or IM Fell (rougher, more antique; lining figures lost).
- **Frame**: deckle 0.6 (clean card) to 1.6 (torn scrap); rule single, double (banner), or none (plate).

## Fits which elements

Best: grid movement range + path arrow, enemy threat range, fog of war (wash as mist), level-select path reveal (brush path drawn in with `draw`), bevelled window + pointer (as parchment card + pen nib), bouncing damage numbers, turn-order bar, combat forecast window, big banner text (banner role), dialogue windows.
Good with care: active-time gauge battle (bars are washes; keep gauges ≥ 4 px tall), dissolve-out defeat (dissolve into a fading wash rather than pixels).
Poor fit: pixel bitmap font, native resolution + integer scaling, Mode 7 flight ground (speed and pixel crispness fight the paper), shatter transition (glass shards; use a page-turn or wash-bleed instead).

## Reviewer checklist

1. Is there visible paper tooth everywhere, including inside windows, at full size and at 500 px?
2. Do range overlays have wavering, rounded boundaries with darker pooled edges, and no straight 1 px borders or tile-sized notches?
3. Is a range wash over water still clearly blue / red, not grey-brown?
4. Is the path one continuous brush stroke with a tapered body and a head inside the destination tile, not hidden by a prop?
5. Do numbers read at a glance (lining figures, paper halo), each over a splash in its kind colour; does the critical have spatter and an italic CRITICAL label?
6. Are windows parchment cards with deckled edges, an aged rim, a soft shadow and a wobbly ink rule, with no straight-edged coloured bars?
7. Is the pointer a pen nib, the selected row an ochre wash, the cursor four brush ticks, and nothing blinking?
8. Is the type a classical serif in sepia ink throughout (no sans, no pixel font)?
9. Is the palette muted with one ink, never pure black or white, and no East Asian or real-game motifs?
10. Does `?t=1400&freeze=1` give the same picture on every load, and does the 500 px page have no horizontal scroll?

# Low-poly 3D (`lowpoly`)

> A toy world floating in soft colour: every surface is a few triangles, each painted one flat colour by the light of the hour. Range tiles are little bevelled glass slabs, the path is an extruded ribbon, numbers are chunky extruded blocks, and the UI is rounded type on frosted cream panels.
> Skin file: `lowpoly.js` (registers `lowpoly`). Preview: `preview.html` (`?t=ms&freeze=1&tod=day|dusk|night`). Palette and feel adapted from our earlier in-house low-poly style (which used a 3D engine); this skin fakes the 3D entirely in the 2D canvas API. Original art; neutral fantasy; no real game, film or interface referenced.

## 1. Essence and what it is not

- **A tabletop model seen from above at a slight tilt.** Every object is a few geometric pieces (hexagon discs, frustums, cones, faceted gems, seven-sided tree crowns), **one colour per facet** (flat shading), no textures, no outlines.
- **Light tells the time.** A sun direction and a time-of-day preset (day, dusk, night) recolour every facet through one `shade()` function; at night only warm emissive things stay bright.
- **Pop, not frames.** The charm is in the entrance curves (overshoot and settle), not frame-by-frame animation.
- **Not:** voxels; smooth-shaded 3D cartoon (no gradients across a face, no rim outlines); pixel art with a 3D filter (no bitmap fonts, no integer-scale rules); a real 3D engine (everything here goes through 2D canvas).

## 2. Material and drawing

- **Canvas:** non-pixel. Native 256×224 coordinates, backing store = native × devicePixelRatio × any factor, `setTransform(s,…)`, smoothing on.
- **Facets:** each polygon gets `skin.shade(colour, normal)`. A flat-up face keeps its base colour under the light's tint; tilted faces brighten toward the sun and darken away. Adjacent facets are filled and stroked 0.35 px in their own colour so no hairline cracks show.
- **Ground tiles:** each 16 px tile is two triangles (diagonal chosen per tile) with a small random tilt (±0.11) so the floor is not a spreadsheet; a lit 0.7 px north lip and a shaded south and east lip give every tile a slight isometric bevel. Grass `#9fcb7a` / `#a9d383` with faceted tufts, sand road `#ecd9ae` with pebbles, stone `#c9c2b6` with a three-facet cliff face on open south sides.
- **Water:** four triangles per tile whose tilts move with time (each facet glints in turn), `#64a6cf` → `#4f86bd`, soil walls at the banks and a foam line.
- **Props and units:** trees = trunk (2 facets) + 7-sided crown (7 facets + top highlight); pines = 3 stacked cones (2 facets each); rocks = 4 facets; units = toy pawns: hexagonal base in team colour, 3-facet frustum body, belt, 6-facet head, hat/helmet/hood as 2–4 facets, simple props (sword, staff with gem, axe).
- **Contact shadows:** soft ellipses `rgba(40,46,90,.22–.30)`, offset away from the sun. No cast silhouettes; no pure black anywhere.

## 3. Colour

- **Pastel, low contrast, few hues.** Ink `#33395a`, soft ink `#7c84a8`, accent coral `#ff8a5c`, panel cream `rgba(255,252,244,.80–.86)`.
- **Teams:** a `#5b8de0` (blue), b `#e8705a` (coral red), neutral `#9aa3c0`.
- **Time of day (`palette.light`):**

| preset | sun (to the sun) | key | ambient | sky | emissive |
|---|---|---|---|---|---|
| day | (−0.42, −0.62, 0.66) | `#fff3dc` 0.62 | `#dfe5f6` 0.52 | `#7fb8ea` → `#dcefff` | off |
| dusk | (0.62, −0.42, 0.40) | `#ffcf9e` 0.62 | `#c4c4f0` 0.50 | `#6c6fb8` → `#ffbf96` | 0.35 |
| night | (−0.30, −0.55, 0.78) | `#9fb2ff` 0.30 | `#46508f` 0.50 | `#161b46` → `#34366e` | 1 |

- Overlays: move `#6fa8ff`, attack `#ff6a55`, threat `#a98cff`, heal `#6fdc9a`, each with a darker rim colour; slab alpha 0.52–0.58.
- Number faces / sides: damage white / `#e2694a`, crit `#fff6cf`→`#ffc94a` / `#de5a2c`, heal / `#3c9a5a`, MP / `#3f74d6`, status / `#7a5cc4`, miss / `#9aa0bd`.
- At night lamps keep `#ffd27e`, never `#ffffff`.

## 4. Type and UI

- **Font:** rounded sans, weights 800 (UI) and 900 (numbers). Stack `"Nunito", ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Varela Round", system-ui`. In a shipped game use the system part of the stack (no font files); the demo page may load Nunito from Google Fonts. Mixed case; labels small caps-like upper case with 0.45 px tracking.
- **Sizes (native px):** body 7, numbers 12 (crit 1.35×), words 8, labels 5. Numbers are never smaller than body text.
- **Text:** ink on cream, with a white letterpress line 0.5 px below. No outlines, no drop shadows.
- **Panels (`frame`):** soft shadow (8 px blur, 3 px down, `rgba(40,46,90,.30)`) → frosted backdrop (scene blurred 3 px) → cream gradient → two big glass facets (upper-left triangle +26 % white, lower-right +3.5 % ink) → 0.6 px white inner line → 0.4 px ink hairline. Radius 5. Team a/b adds a faceted 1.8 px colour stripe on the left. `focus` / `alert` = 1 px coral ring. Padding 5 (plates 6×3, banners 12×4).
- **Plate / banner:** capsules (radius = h/2); banner has a coral gem at each end.
- **Bars:** capsule track `rgba(51,57,90,.13)`; fill split into a lighter top facet and a base lower facet, a light wedge at the leading edge; status tag = round chip with white rim; `ready` coral with a white pulse.
- **Cursors:** tile = white rounded ring with coral corner Ls and a floating faceted coral gem above the tile, casting a small shadow onto it; menu pointer = 2-facet coral arrow.
- **Numbers:** chunky extruded digits: soft contact shadow, extrusion stepped every 0.25 px along (0.42, 1) × 2.2 px in the side colour (darker toward the back), a white rim catch-light at the upper left, a face split at 55 % into a lighter top and a coloured bottom. CRITICAL = coral capsule with white type above the number.

## 5. Motion

- Smooth, 60 fps; no stepping, no snapping.
- Entrances: `pop(s) = 1 − e^(−6s)·cos(9s)` (≈ 25 % overshoot, settled by 0.5 s). Range slabs grow from 55 % size with it as their `grow` rises.
- Landing squash (y −18 %, xz +9 %, 0.3 s) for drops; idle breathing ±0.25 px on pawns; tree sway ±0.35 px; water facets glint; the cursor gem bobs ±1.2 px.
- Hit flash ≤ 0.25; shake only on big hits, small. Timing (durations, hit-stop, order) is never a skin choice.
- Reduced motion: no pop, sway or bob; information unchanged.

## 6. Camera and composition

- Fixed orthographic top-down view with a slight tilt implied by south lips, cliff faces and object heights; parallel grid lines stay parallel.
- A soft haze in the sky colour fades out the top 34 px, so the far edge dissolves instead of ending.
- UI panels sit in corners and edges; the play area stays readable through the frosted glass.

## 7. Sound

Not part of the skin. Direction for hosts: pitched percussion (marimba, kalimba, wood block, soft bells), pentatonic so any order is harmonious; each placement or step plays one note.

## 8. Signature moves (defaults)

- **Faceted light:** `skin.shade(col, [nx, ny, nz])` for every polygon; `skin.tod('day'|'dusk'|'night')` switches the preset.
- **Bevelled slabs:** range cells inset 0.7 px, 2.2 px bevel faces (N +50 % white, W +28 %, E −12 % ink, S −26 %), split top face, rim on the set boundary, a 1.4 px side wall under the bottom edge.
- **Extruded path:** soft shadow, dark coral side wall 1.5 px below, coral top, a light spine, a 2-facet arrowhead, a hexagonal start pad and white beads travelling at 14 px/s (`path()`).
- **Extruded numbers** (above) and the **floating gem cursor**.
- **Frosted cream panels** with two glass facets.
- **Night emissives:** lamps, fires and crystals keep their colour and add soft additive pools on the ground.

## 9. Common mistakes

- **Smooth gradients across a face** → flat colour per polygon; gradients only in UI and glows.
- **Hairline cracks between facets** → stroke each facet 0.35 px in its own colour.
- **Floor reads as a checkerboard or spreadsheet** → tilt range ≤ ±0.11, varied diagonals, tufts; not alternating colours by parity.
- **Dusk turns the grass olive** → keep the dusk ambient bluish-lilac and the key peach, not deep orange on lavender.
- **Night is just a dark filter** → shade() handles night; lamps keep `#ffd27e` and add ground pools.
- **Pixel fonts or integer scaling** → this style is smooth; rounded sans only.
- **Outlined numbers** → numbers are extruded blocks, never stroked outlines.
- **Panels covering the action** → corners and edges only; keep frosted glass so the world shows through.
- **three.js / WebGL** → not allowed here; everything goes through the 2D skin.

## 10. Engine / skin API notes

- `GameDNA_Skin.resolve('lowpoly')` after `skin-api.js` and `lowpoly.js` (spec v0.2). `pixel: false`, `native.scale: 'fit'`. Canvas fonts: `await GameDNA_Skin.ready(SK)` before the first layout (the demo page loads Nunito; games use the system part of the stack).
- **Methods:** `frame` (roles `window`, `plate`, `banner`, `tooltip`, plus its own `row` = coral-tinted pill with a light top facet and `backing` = soft inset well; `frameRoles: ['row', 'backing']`), `text` (fonts `ui`, `title`, `plate`, `small`, `label`, `word`, `num`), `measure`, `number`, `overlay` (`grow` pops the slab in from 55 % size), `bar` (`opts.t` for the ready pulse), `cursor` (hand box 7×5).
- **`number()`**: digits are one glyph each; a word (MISS), the suffix (MP) and the label (CRITICAL capsule) are each drawn as one block. `glyphOffset` is called for every canonical item; a block takes its first live item's offset, the largest alpha and any flash, and returns one rect. Every glyph or block is drawn through `GameDNA_Skin.fadeLayer` (the extrusion never shows through a fading face) and honours `sx/sy` (`motion.squash = {x: 1.12, y: 0.86, ms: 90}`) about its bottom centre.
- **`path(ctx, points, t, {tile, alpha, invalid, width})`**: the extruded coral ribbon (width = 0.25 × tile); `alpha < 1` through `fadeLayer`; `invalid` = grey ribbon (`palette.overlay.pathBad`). B-01 v1.2 calls it automatically.
- **Scene hooks:** `tile(ctx, rect, kind, t)` = two tilted triangles + bevel lips per cell, tufts, pebbles, planks, hill / mountain / fort facets, glinting water (all 11 kinds); `token(ctx, rect, unit, t)` / `unitToken` = toy pawn on the bottom of `rect` (knight, mage, fighter, archer, monster; team colours; `selected` bobs; `facing: -1` mirrors; `dead` fades); `atmosphere(ctx, view, t, {phase, lights})`: `'world'` = ground light pools from emissive props (scaled by the time of day), `'final'` = far-edge haze and the dusk wash.
- **Extras:** `skin.shade(col, normal, tod?)`, `skin.facet(col, [tx, ty], tod?)`, `skin.tod(name)`, `skin.gem(ctx, x, y, rx, ry, col)`, `skin.frost(ctx, x, y, w, h, r, blur)`, `skin.tri`, `skin.glowAt`, `skin.layout(str, opts)`, `palette.light` (presets), `palette.ground`, `palette.terrain`, `palette.numbers`, `palette.bars`.
- `frame()` reads back `ctx.canvas` for the frosted glass, so draw panels after the world. Shadows are scaled by the current transform.
- **Frame order used by `preview.html`:** `tile` per cell → river banks → `atmosphere('world')` → threat overlays + B-01 `drawUnder` → props and `unitToken`s sorted by y → `atmosphere('final')` → cursor → E-01 `draw` → unit card / plate → C-01 `draw`.

- **v0.4 (critic r1 fixes):** `prop(ctx, rect, kind, t, {lights, light, seed})` draws faceted trees, pines, bushes and menhirs; brazier, lamp and crystal sit on top and glow by time of day. The floor is one continuous jittered triangle mesh: corners are shared between cells, there are no per-tile seams, and a smooth swell tilts the facets. Range slabs are tinted glass: `color` compositing at 0.62 plus a 0.18 body, one sheen facet per cell, and the bevel, side wall and rim only on the set's outer boundary. Attack is `#ff4a4a` and threat is `#9a6bff`. MISS has a slate side (`#7c84a8`) and a darker face bottom. Pawn contact shadows are stronger. Lights are read in the standard format (or pre-standard `i`), so the scene's `ADAPT` entry can be deleted.

## 11. Variation space

- **Palette:** sand, grass and coral roofs under a pale blue day; snow, pine green and red wood under a lilac sky; ochre mesas, grey-green scrub and turquoise pools at apricot dusk.
- **Structure:** a map that assembles tile by tile with pop at the start; edge tiles that drop away (reverse drop, 0.6 s) as a timer.
- **Light:** a day that passes during one battle (day → dusk → night across turns); lamps that light up one by one.
- **Accent:** coral (default), mint or sunflower; one accent per game.

## Fits which elements

| Element | Fit | Why |
|---|---|---|
| Grid movement range + path arrow, Enemy threat range | very good | bevelled slabs and an extruded ribbon read cleanly on a faceted board |
| Isometric height & jump, Level-select path reveal | very good | heights and pop-in entrances are native to the look |
| Bouncing damage numbers, Big banner text | very good | extruded block digits; per-letter pop |
| Bevelled window + pointer cursor, Turn-order bar, Combat forecast window | good | frosted cream panels, capsule bars |
| Active-time gauge battle, Four-move menu battle | good | capsule gauges; toy pawns |
| Fog of war | good | night preset + emissive pools |
| Pseudo-3D flight ground, Multi-layer parallax | fair | needs real perspective; keep the palette and facet shading |
| Fast action, horror themes | poor | precise silhouettes and dark themes clash with pastel toys |

## Reviewer checklist

1. Every surface is visibly faceted with one flat colour per facet; no textures, no outlines, no pure black.
2. The floor varies (tilted halves, tufts, pebbles) without reading as a checkerboard; tiles show a slight bevel.
3. Objects have contact shadows offset away from the sun; nothing floats.
4. Range cells are bevelled translucent slabs with a rim on the set boundary; the path is an extruded ribbon with a faceted arrowhead.
5. Numbers are chunky extruded digits with a side colour per kind; CRITICAL sits in a coral capsule.
6. UI: rounded sans, frosted cream panels with soft shadows and glass facets; numbers no smaller than body text; corners only.
7. `?tod=day|dusk|night` changes every facet's colour; at night only lamps, fire, crystal and staff gems glow, in warm or saturated colours.
8. Pastel palette, few hues, one accent (coral).
9. Same seed and `?t=` give the same events as every other skin; only the look changes. No WebGL anywhere.
10. Original art, English UI, no real game names or motifs.

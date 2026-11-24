# pixel8 · 8-bit console pixel

Skin id `pixel8` (`skins/pixel8/pixel8.js`, needs `skins/skin-api.js` first). Preview: `preview.html` (`?t=1220&freeze=1` is the reference moment).

## 1. Essence, and what it is not

A screen that could have come out of an 8-bit home console: a 256×240 picture built from 8×8 cells and 16×16 tiles, a fixed master palette, at most three colours plus transparent in any sprite or UI element, flat colour everywhere, and an 8×8 capital-letter font. It reads at a glance because of its limits: hard black outlines, checker dither where a later console would blend, and windows that are just a flat colour inside a black/white/black border.

It is **not**:
- 16-bit pixel art (`pixel16`): no 4–5 step shading ramps, no gradient windows, no rivets, no translucent overlays, no 2-tone text.
- "Retro-flavoured" HD art: no smooth scaling, no sub-pixel motion, no blur, glow or soft shadows.
- A colour filter: lowering the colour count of a 16-bit frame does not make it 8-bit. The font, the borders, the dither and the stepped motion all have to change.

## 2. Material

- Everything is a hard pixel at native resolution. Nothing is ever semi-transparent: the skin turns every alpha a module asks for into a screen-aligned dither pattern (1/4, 2/4, 3/4 or full).
- Sprites: 16×16 (or 8×8), black outline, one team colour, one skin/steel colour. Tiles: up to three colours plus the black backdrop.
- Dither is the only "material" effect: checker for overlays and half fades, quarter dots for faint states.
- No gradients anywhere. A light edge is one row of a lighter palette colour, not a ramp.

## 3. Colour

Fixed master palette of 26 colours (`palette.master`), all from the console-style table below. Every pixel on screen must come from it; the preview counts off-palette pixels (`data-off-palette`, must be 0).

| group | colours |
|---|---|
| neutrals | `#000000` ink, `#fcfcfc` paper, `#bcbcbc`, `#7c7c7c` |
| blues | `#a4e4fc`, `#3cbcfc`, `#0078f8`, `#0000bc` (window fill), `#6888fc` |
| reds / oranges | `#f83800`, `#a81000`, `#f87858`, `#fca044`, `#e45c10`, `#881400` |
| yellows | `#f8d878`, `#f8b800` |
| greens | `#b8f818`, `#58d854`, `#00a800`, `#005800`, `#58f898` |
| purples | `#d8b8f8`, `#6844fc` |
| earth / skin | `#ac7c00`, `#503000`, `#fcd8a8` |

Roles: player team `#0078f8`, enemy `#f83800`, neutral `#7c7c7c`. Window fills: team a `#0000bc`, team b `#a81000`, neutral `#000000`. Titles and gold values `#f8b800`, labels `#3cbcfc`, disabled `#7c7c7c`. Range: move `#0078f8` (lighter band `#3cbcfc`), attack `#f83800`, threat `#6844fc`, heal `#58f898`.

## 4. Type and UI

- **Font**: one 8×8 bitmap font, capitals only (lower case is upper-cased), 7×7 glyph in an 8×8 cell, 2 px vertical strokes, fixed 8 px advance. One colour per glyph; `color2` is ignored. Optional 1 px black drop shadow.
- **Numbers**: the same 8×8 digits, advancing 9 px (not 8) so the outlined glyphs never overlap while they bounce at different heights. Pop-up numbers get a 1 px square black outline (8-neighbour dilation) plus a 1 px drop; a critical hit is the same glyph at 2×. No ramps, no shine.
- **Windows**: outer black line with the corner pixel left open, a white line with its corners cut, an inner black line, then one flat fill. Padding 5 px; 12 px menu rows.
- **Plates / tooltips**: one black edge, flat fill; alert = red fill with a yellow top line.
- **Pointer**: a solid white right-pointing triangle (5×7) with a black outline.
- **Tile cursor**: four 2 px white corner brackets with black outlines, blinking 1 px in and out at 4 Hz.
- **Bars**: black slot, flat fill. HP meters get one lighter top row; gauges grow in 2 px steps with a black tick every 4 px.

## 5. Motion

- Animation clock stepped at 15 fps (`motion.stepMs = 1000/15`): cursors, palette cycles, idle hops and the path spark advance in whole steps. Game timing (durations, hit-stop, event order) is never changed by the skin.
- Positions snap to whole pixels. Pops are instant (`ease.pop = 'snap'`), moves linear.
- Fades are dither steps: full → 3/4 → checker → 1/4 → gone (`fadeSteps [1, .5]` is the minimum). A window "opening" is its rect growing in whole pixels, never a fade.
- Flashes are palette swaps for one step (crit digits alternate yellow and red-orange), never a white alpha overlay.
- Flicker-free: no sprite multiplexing flicker, no alternate-frame transparency.

## 6. Camera and composition

- Native 256×240, integer scale only (`native.scale = 'integer'`), `image-rendering: pixelated`.
- 16×16 tile grid; the map fills the top 160 px (10 rows), the HUD band the bottom 80 px.
- HUD windows sit on a black backdrop below the map, not floating over it. Command menus may open over the map, beside the destination tile.
- No camera smoothing: the map scrolls one tile or whole pixels per step.

## 7. Sound (guidance for hosts)

Square and triangle waves plus noise, short envelopes, no reverb. Cursor tick: one 30 ms square blip; confirm: two rising notes; damage: a noise burst; critical: noise + a falling square sweep. The skin has no sound hook; this is for the host's own synth.

## 8. Signature moves (with default values)

| move | default |
|---|---|
| Checker range overlay | 2/4 checker of the overlay colour, aligned to screen pixels. Attack and threat add a same-hue dark colour on half the holes (attack `#f83800` + `#a81000`, threat `#6844fc` + `#0000bc`), so only 1/4 of the ground shows and the set reads red / purple at 1×; move stays 2/4 blue over the ground. 1 px solid boundary (move white, attack red, threat lilac); growing cells use 1/4 dots first |
| Palette-cycle pulse | a lighter band (`fill2`) steps diagonally across the move set at 4 Hz; no alpha pulse |
| Black/white/black window | 1 + 1 + 1 px border, flat fill, open outer corners |
| Chunky path arrow | `skin.path()`: 7 px outline `#881400`, 5 px body `#fca044`, 1 px highlight `#f8d878`, arrowhead 13 px wide; a 2×2 white spark hops 4 px per 1/15 s |
| 2× critical digits | crit number at scale 2, `CRITICAL` label in 8×8 yellow above it |
| Dither fade | numbers and windows fade 3/4 → 2/4 → 1/4, screen-aligned so they do not crawl |
| Corner-bracket cursor | 5 px arms, 2 px thick, blink in/out 1 px at 4 Hz |

## 9. Common mistakes (symptom → fix)

- Range looks washed out or milky → you used alpha. Use the checker of one palette colour; keep the ground visible through the holes.
- Attack range reads olive or dirt-brown (red checker over green grass averages to brown) → fill half the holes with a dark red so 3/4 of the cell is red; same for threat with deep blue. Give the attack set a red boundary and the move set a white one.
- Text looks soft or 16-bit → you used a 5×7 two-tone font or anti-aliased text. Use the 8×8 caps font, one colour.
- Window looks modern → rounded rect, gradient or drop shadow. Use the 3-line border and a flat fill.
- Numbers glow or shine → remove ramps; flat colour, black outline, 1 px drop.
- Smooth bob or slide → step the animation clock at 15 fps and snap positions.
- Colours drift off the palette (mixing, `mix()`, tints) → only use `palette.master`; check with an audit of the canvas pixels.
- Sprites with 5+ colours → three colours plus transparent; move detail into the outline shape.
- Dither "swims" when things move → align the pattern to screen coordinates, not to the sprite.

## 10. Engine and skin API notes

- `pixel: true`, `native {w: 256, h: 240, scale: 'integer'}`. Load order: `skin-api.js`, `pixel8.js`, modules. `GameDNA_Skin.resolve('pixel8')`.
- Methods overridden (none use the generic ones): `measure`, `text`, `frame`, `number`, `overlay`, `bar`, `cursor`.
- Every method reads `ctx.globalAlpha × opts.alpha`, sets the context alpha to 1 and draws a dither level instead; it restores the context alpha afterwards.
- Scene hooks (SPEC v0.2): `tile(ctx, rect, kind, t)` draws all 11 terrain kinds (grass, forest, water, hill, mountain, road, bridge, fort, sand, wall, floor) as 16×16 art in 3 master colours each (water animates 2 frames at 2 Hz); `unitToken(ctx, rect, unit, t)` draws knight, mage, fighter, archer and monster sprites (black outline, team colour, skin or white), standing on the bottom of the rect, with a 1 px black shadow row, a stepped 1 px hop when selected and a 2/4 dither when dead. The shared scene (`compare.html?only=pixel8&t=1400&freeze=1`) has 0 off-palette and 0 non-opaque pixels.
- Extras (feature-test them): `skin.path(ctx, points, t, opts)` (the reserved arrow hook; points are tile centres in px), `skin.dither(ctx, rect, colour, alpha)`, `skin.masterPalette()`, `skin.letterWidth(str)`.
- `palette.windows[team] = [outer, line, inner, fill]` (index 3 is the opaque fill that window-cursor uses as backing).
- `palette.numbers` holds flat colours per kind (`damage`, `crit`, `heal`, `mp`, `miss`, `status`, `flash`, `critFlash`); `palette.bars` holds flat bar colours.
- `number()` glyph order for `glyphOffset`: characters of the number, then the suffix, then the label. Crit with `big: true` is drawn at 2×.
- Text height is 8 (`fonts.ui.height`), advance 8, so `measure(s) = 8 × length − 1`.

## 11. Variation space

- Window fill: deep blue (default), black (neutral, used for info panels), red (enemy).
- Overlay density: checker (default) or 1/4 dots for a lighter map read; boundary colours per kind.
- Font shadow on or off (`shadow.text = null` for a cleaner, flatter menu).
- Resolution: 256×240 (default) or 256×224 with the top and bottom 8 px rows cropped.
- Palette swaps per area (a cave set, a night set) as long as each comes from the master table.

## Fits which elements

Strong fit: Grid movement range + path arrow, Enemy threat range, Fog of war (dither is native to it), Bevelled window + pointer cursor (as a black/white/black window), Turn-order bar, Pixel bitmap font, Bouncing damage numbers, Active-time gauge battle, Four-move menu battle, Level-select path reveal, Timing-bar minigame, Native resolution + integer scaling.
Workable: Combat forecast window, Big banner text, Hit sparks (2×2 squares, ≤8 on screen), Dissolve-out defeat (as a dither dissolve), Shatter battle transition (as tile blocks).
Poor fit: Pseudo-3D flight ground and Multi-layer parallax beyond two layers (the era could not do them convincingly); isometric height reads but loses the tile grid's clarity.

## Reviewer checklist

- [ ] Every pixel comes from the 26-colour master palette (preview `data-off-palette = 0`) and is opaque (`data-semi = 0`).
- [ ] No gradient, glow, blur or translucent tint anywhere; fades and overlays are dither patterns.
- [ ] Each sprite and UI element uses at most 3 colours + transparent (tiles: 3 + black backdrop).
- [ ] All text is the 8×8 capital font in a single colour; numbers are the same digits with a square black outline.
- [ ] Windows are black/white/black bordered with one flat fill.
- [ ] Range overlays are checker dither with a 1 px boundary; move and attack sets are told apart at a glance.
- [ ] The path arrow is chunky (3 colours) and ends with a clear head on the destination tile.
- [ ] Animation steps at a 15 fps feel; nothing slides sub-pixel; nothing flickers.
- [ ] Integer scaling with pixelated rendering at every width (500 px layout included).
- [ ] Original art, neutral fantasy content, English UI.

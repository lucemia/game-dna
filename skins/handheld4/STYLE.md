# handheld4 · 4-shade handheld pixel

Skin id `handheld4` (`skins/handheld4/handheld4.js`, needs `skins/skin-api.js` first). Variants registered by the same file: `handheld4-sepia` and `handheld4-grey`. Preview: `preview.html` (`?t=1400&freeze=1` is the reference moment; `&pal=sepia|grey`, `&lcd=1`, `&ghost=1`, `&focus=grid|numbers|window`).

## 1. Essence, and what it is not

An early monochrome handheld: the whole picture uses **exactly four shades** of one ramp (S0 lightest, S1, S2, S3 darkest), built from 8×8 cells, with 1 px outlines in S3, dither where you would want a fifth shade, a chunky 8×8 capital font and plain double-line windows. With no hue to spend, everything is told apart by **pattern, inversion and outline**: ranges are different hatch patterns, numbers are light digits in a dark ring, important things are inverted.

It is **not**:
- `pixel8` with fewer colours: no master palette, no team hues, no black/white/black borders around a coloured fill. A team, a range kind or a number kind is never a colour here.
- `pixel16`: no ramps beyond the 4 shades, no gradient windows, no translucent overlays, no 2-tone text.
- A sepia or green photo filter over another style: the 4-shade limit changes the font, the borders, the overlay patterns and the effects, not just the colours.
- Any real device's look: the ramps, font and frames are original; no device names, logos or bezels.

## 2. Material

- Every pixel is one of the four shades, fully opaque. The preview audits this at native 1×: `data-colours` must be 4 and `data-off-palette` 0.
- Tiles are 16×16 cells composed of four 8×8 sub-tiles (tuft, tree, wave, plank, brick, floor…); a real game at 160×144 would use the 8×8 sub-tiles directly.
- Sprites: 16×16, S3 outline, body in S0/S1 (party) or S2/S3 (foes), face S0/S1, eyes S3.
- The only "materials" are patterns: checker, diagonal stripes (`\` and `/`), a plus lattice, dotted shadow rows.

## 3. Colour

| ramp | S0 | S1 | S2 | S3 |
|---|---|---|---|---|
| moss green-grey (default, `handheld4`) | `#dfe9b4` | `#9db36c` | `#4c6844` | `#1a2a20` |
| warm sepia (`handheld4-sepia`) | `#f3e3c2` | `#c69c6a` | `#77502f` | `#2a1810` |
| cool grey (`handheld4-grey`) | `#e6e9ee` | `#a4aab6` | `#575d6b` | `#1c1e26` |

Roles: ground S0; text and outlines S3; titles, labels and notes S2; window body S0 (foe windows S1); selected row S1; turn plate S3 with S0 text; party sprites light (S0/S1), foes dark (S2/S3). Value structure: most of the screen is S0/S1, S3 is reserved for lines, text and the attack pattern, so dark marks always mean "look here".

## 4. Type and UI

- **Font**: one 8×8 bitmap font, capitals only, 6×7 glyphs (7 for M and W) with 2 px verticals, fixed 8 px advance, one shade per glyph, no shadow.
- **Disabled text**: every glyph pixel kept, alternating S1/S2 in a checker, so it reads greyed out and never matches the solid S2 titles.
- **Windows**: S3 outer line (corner pixels open), 1 px S0 gap, S3 inner line, S0 body; padding 5 px. Foe windows have an S1 body and a dotted S2 rule under the top line. Banners add S2 rules; focus adds an S1 top line.
- **Selected row**: a flat S1 band; the pointer is a solid S3 arrowhead (6×7) with an S0 rim (hollow when invalid).
- **Plates**: inverted, S3 body, S2 inner top line, S0 text. Tooltips: one S3 line around an S0 body.
- **Tile cursor**: four 2 px S3 corner brackets with an S0 rim that **invert** (S0 arms, S3 rim) and step 1 px in and out at 4 Hz.
- **Bars**: S3 slot, S0 track. HP = S2 fill with an S3 end cap; low HP = S3/S2 stripes; gauges grow in 2 px steps with an S0 gap every 4 px; slow = S1/S2 checker.

## 5. Motion

- Animation clock stepped at 30 fps (`motion.stepMs = 1000/30`); palette cycles at 4 Hz, water and idle hops at 2 Hz, path dashes at 8 Hz. Game timing is never the skin's.
- Positions snap to whole pixels; pops are instant; no squash.
- **Fades are palette fades**, never alpha: the darker member of a number's [fill, outline] pair steps toward the lighter one (S3 → S2 → S1), and on the last step the glyph flickers (shown every other 1/30 s of its age). UI that fades (inactive pointer, opening windows) uses a 2×2 ordered dither.
- **Flashes are inversions**: crit digits swap fill and outline for the flash frames.
- **Transparency is flicker**: a dead unit is drawn every other 1/30 s.

## 6. Camera and composition

- Integer scale only, `image-rendering: pixelated`. A real game uses 160×144 native (20×18 cells); the shared scene is 256×224, so the skin draws on that and keeps the 8×8 cell grid.
- Plenty of S0 space: dark marks need light ground around them to read.
- Optional post effects for the display canvas (`S.post`): **LCD ghosting** (the previous frame laid over at 0.35, moving things leave a trail) and a **pixel grid** (1 device-px lightened S0 lines between native pixels, scale ≥ 3). These are off by default and are the only place the style blends.

## 7. Sound (direction)

Two square-wave pulse channels, one wave channel and noise. Cursor: a short high blip; confirm: two rising blips; hit: a noise burst; critical: noise plus a descending pulse sweep; heal: an arpeggio up. Music in short loops, no reverb.

## 8. Signature moves (with defaults)

1. **Pattern-coded ranges** (`overlay`): move = 50 % S1 checker plus a double boundary (S3 outside, S0 inside); `pulsing` makes an S2 band walk across the set (cells where `(x + y − step) mod 8 < 2`, 4 Hz). Attack = S3 `\` stripes (2 on, 2 off) with a dashed S3 edge (2/2). Threat = S2 `/` stripes every 4 px with a dotted S2 edge. Heal = S1 plus lattice every 4 px. Below `grow` 0.5 only every other row is drawn.
2. **Light road path** (`path`): 4 px S0 core in a 1 px S3 outline (6 px total), 12 px arrowhead 6 px long, S3 start pad with an S0 ring, 2×2 S2 dashes every 6 px marching toward the head at 8 Hz; invalid = S2 checker over the core.
3. **Ringed numbers** (`number`): [fill, outline] shade pairs: damage [S0, S3], crit [S0, S3] at 2×, heal [S3, S0] (inverted), MP and MISS [S1, S3], status [S2, S0], CRITICAL label [S3, S0]. 1 px 8-neighbour outline plus 1 px drop. Advance 8 px.
4. **Inversion for emphasis**: the turn plate, the CRITICAL label, heal numbers, crit flash frames and the blinking cursor all invert rather than brighten.
5. **Light party, dark foes**: party sprites have S0/S1 bodies, foes S2/S3, all with S3 outlines and a dotted S2 contact row.

## 9. Common mistakes

- Telling move from attack by shade alone: S1 and S2 fills look alike at small size. Use a different pattern and a different edge per kind.
- Dark numbers without a ring: they vanish on the attack stripes. Always the S3 ring around light digits (or the S0 ring around inverted ones).
- Fading by alpha or by lightening both shades: fill and outline merge into a blob. Fade only the darker member, stop one step short of the lighter, then flicker.
- Using S3 for big areas (water, forest): the dark marks (text, attack, outlines) lose their meaning.
- Adding a fifth colour for a "special" effect (a red crit, a gold cursor). Use inversion.
- Dithered disabled text that drops pixels: chunky 2 px strokes fall apart. Keep every pixel, alternate shades.

## 10. Engine and skin API notes

- `pixel: true`, `native 256×224`, `scale: 'integer'`, `minScale 2`, `stepMs 1000/30`, `fadeSteps [1, .75, .5, .25]`, `squash: null`.
- `frameRoles: ['row', 'backing']`; `layout {handW 6, handH 7, pointerGap 4, rowFrame true, rowBand true}` (`rowBand` turns on the window-cursor selected-row band for this pixel skin).
- `atmospherePhases: []`: there is no lighting; lit props show light with blinking pixels and 2-frame flames instead.
- `prop()` draws stone/rock, bush, tree (rises one cell), brazier (2-frame flame), lamp (glass flickers), crystal (stepping sparkle), all in 4 shades.
- `text.dim` is S2 written in upper case: canvas draws it identically, and `text()` recognises it to draw the disabled checker (the API passes no "disabled" role, see the report).
- Extras: `S.shades`, `S.variants`, `S.rampName`, `S.masterPalette()`, `S.dither(ctx, rect, shadeIndexOrToken, alpha)`, `S.post(ctx, {scale, grid, ghost, ghostAmount, gridAlpha})`, `S.letterWidth(str)`.
- `number()` honours `glyphOffset` (dx, dy, alpha, flash, skip; sx/sy ignored like every pixel skin) and uses `age` only for the last-step flicker.

## 11. Variation space

- **Ramp**: moss green-grey (default) ↔ warm sepia ↔ cool grey; any 4-step ramp with roughly even value steps (luma ≈ 0.9 / 0.65 / 0.38 / 0.15) works.
- **Post effects**: none (default) ↔ pixel grid ↔ grid + ghosting (0.2–0.5).
- **Overlay density**: attack stripes 2/4 (default) ↔ 1/4 for busy maps; move checker ↔ 1/4 dots.
- **Window**: double line (default) ↔ single S3 line for dense HUDs.
- **Native size**: 160×144 for a true handheld game (8×8 tiles), 256×224 for the shared scene.

## Fits which elements

Best: grid tactics and range display (B-01), damage numbers (E-01), window and pointer menus (C-01), dialogue boxes, shops and inventories, level-select maps, turn-based battles, monster-collecting games, top-down adventures, puzzle games. Weaker: anything that relies on colour coding of many teams or elements (more than two sides, elemental weaknesses by colour), lighting and atmosphere elements (no light, no fog), dense particle effects (flicker gets messy past ~6 sprites).

## Reviewer checklist

- [ ] The native frame contains exactly 4 colours (`data-colours="4"`, `data-off-palette="0"`, `data-semi="0"`).
- [ ] Move, attack and threat are told apart by pattern and edge style, not only by shade, at 500 px wide.
- [ ] The path arrow reads over every overlay pattern.
- [ ] Every number is readable over light ground, the checker and the stripes; heal and CRITICAL are inverted; fades never become a blob.
- [ ] Windows: S3/S0/S3 double border, S0 body, 8×8 capitals, S1 selected band, solid arrowhead pointer; disabled text greyed but whole.
- [ ] No alpha anywhere except the opt-in post effects; flashes are inversions; dead units flicker.
- [ ] No device names, logos, bezels or recognisable game layouts; neutral fantasy; English UI.
- [ ] Mobile (500 px wide): no horizontal scroll, text still readable.

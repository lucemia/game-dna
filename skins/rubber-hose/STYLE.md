# STYLE: rubber-hose (1930s rubber-hose cartoon)

Skin id `rubber-hose` · file `rubber-hose.js` (load after `skin-api.js`) · preview `preview.html?t=1400&freeze=1` (`&film=0` without the film pass).
All sizes are **native px** (the module's 256×224 grid). At the usual 3× display, 1 native px ≈ 3 CSS px. Original art only: no existing cartoon characters, studios, names or silhouettes; neutral fantasy subject matter.

## 1. Essence, and what it is not

An early sound-cartoon reel printed in sepia. Characters have bendy **rubber-hose limbs** with no elbows or knees, **white four-finger gloves**, **pie-cut eyes** (a black pupil with a wedge cut out), big round black shoes, and bodies that squash and stretch like balloons. Every line is the **same thick, even ink** and it **boils**: each outline is re-drawn with a slightly different wobble 12 times a second. The whole world **breathes on a 120 BPM beat**: trees, the lamp, bushes, flames and the units all stretch on the beat, in phase. Windows are **title cards**. The picture sits behind a film-print pass: grain, flicker, dust, the odd hair, a faint scratch, vignette, rounded gate corners and gate weave.

It is **not** pixel art (no integer snapping, no bitmap type), not a modern flat vector look with a "vintage filter", not 1950s limited animation (no geometric backgrounds, no big flat colour fields), not a silent-film parody (the beat drives everything), and not a recolour of the 16-bit look.

## 2. Material

Pen and ink on paper, photographed onto print stock. Outlines are even-width round-capped strokes (0.7–1.15 px for shapes, 2.6 px for the bracket, 5 px for the path hose), never tapered. Fills are flat; shading is **one hard crescent** (the shape filled in the shade colour, then again in the base colour offset up-left, so a sliver of shade stays on the lower right). No gradients except the vignette. Highlights are white hard-edged bands (shine band on numerals, highlight line on bars). Background ground is a low-contrast watercolour grey-sepia with soft value pockets; characters, gloves and danger take the extremes (white and ink).

The boil is a smooth displacement field per drawing (3 drawings), applied to densely resampled points, so points shared by two shapes stay shared and range boundaries stay continuous across cells.

## 3. Colour

| token | value | use |
|---|---|---|
| `ink` | `#16110c` | every outline, card body, drops, shoes, limbs |
| `paper` / `sepia.light` / `mid` / `dmid` / `dark` | `#efe3c8` `#d6c6a4` `#a8936f` `#7a6648` `#4a3b2b` | ground, props, wells, bar track |
| character white | `#fffbf0` | gloves, faces, title-card rules and text, damage numerals |
| `hot` (+ `hotL` `#e58a5e`, dark `#7e3220`) | `#c4532f` | the red-orange of two-strip film: foes, attack range, criticals, flame, CRITICAL ribbon |
| `teal` (+ `tealL` `#86c2b2`, dark `#24564e`) | `#3f8a7e` | the blue-green of two-strip film: player team, move range, heal, MP, selected menu row, crystal |
| overlays | move teal .36, attack hot .38, threat dark sepia .26, heal tealL .40 | plus hatching (below) |
| terrain | grass `#cdbb94`, water `#6f6553` (darker pool, lighter wash bands, three rows of white wavy ripples over ink troughs that drift and boil, a blinking glint), forest `#9b8763`, … | low-contrast midtones |

Rules: the only saturated colours are the two accents, and they carry **gameplay meaning only** (team, range, crit, heal). Everything else is the sepia ramp. Characters own the two ends of the value range; the ground lives in the middle. State never relies on colour alone: ranges also differ by hatch direction, criticals by the POW burst and ribbon, MISS by the puff cloud.

## 4. Type and UI

- **Fonts**: one hand-lettered display face for everything: `'Luckiest Guy'` (Google Fonts, docs pages only) with the system fallback `'Cooper Black', 'Arial Rounded MT Bold', 'Arial Black', Impact, sans-serif`. All caps. `ui` 8 px (tracking 0.35), `title` 9.5, `label` 6.5, `plate` 7.5, `num` 15 (crit ×1.28), `word` 10.5.
- **Hand-lettering**: each letter sits up to ±0.45 px off the line and tilts up to ±2.6°; offsets are fixed per string and letter index (they never jitter). `measure()` sums the same per-letter widths `text()` draws.
- **Windows** (`frame` role `window` / `banner`): a printed title card: near-black body 3 px radius with faint light film speckle, a hard ink drop (1.6, 1.6, no blur), a white double rule (0.7 px at 1.4 inset, 0.35 px at 2.6), and dot-in-ring corner ornaments whose centres take the team colour (teal / red-orange / white). `banner` adds two inner hairlines. `alert` turns the rule red-orange; `focus` adds a paper outline. Cards are printed, so they do **not** boil. Padding 5.
- **Plate / tooltip**: a small card with a single rule.
- **Row** (selected menu row): a dark-teal pill with a white hairline (white text stays readable on it).
- **Backing**: a dark sepia well (`#3a2d20`) with a paper hairline: portrait cameo in the HUD card, title well in the terrain window.
- **Bars**: a rubber hose: ink tube (0.6 px outside the track), dark track, flat fill with a hard lower shade, white highlight line, an ink cap where the fill ends; `ready` / `enemyFull` get a white outer ring; status tag = an ink-ringed badge with H / S.

## 5. Motion

- **Clocks**: film rate 24 fps (`motion.stepMs` = 1000/24; windows open in film steps), drawings "on twos" at 12 fps (boil, flame frames, ripples), the beat at 120 BPM (one beat = 0.5 s).
- **Idle**: units and props stretch 5 % on the beat and squash off it, about their feet, whole world in phase (Ilsa is half a beat off so the two heroes don't move as one block). Faces blink every 5–7 beats.
- **Selected unit**: hops once a beat (3.2 px): stretch 14 % on the way up, squash 0.8 on landing.
- **Numbers**: airborne glyphs stretch (up to +16 % in y, read from the module's `dy`), landing squash from `motion.squash = {x: 1.2, y: 0.78, ms: 90}`, plus a small tilt that boils. Smooth fades, composited once (`fadeLayer`).
- **Cursor**: bracket corners bounce out 1.5 px once a beat with a short squash at the bottom; the glove pointer pokes forward 1.4 px on the beat.
- `ease`: move / open `outBack` (overshoot), pop `pop`. Timing (durations, order, hit-stop) is never the skin's.

## 6. Camera and composition

A fixed, flat stage, seen straight on: the tactics map is the stage floor. Units are drawn larger than the tile (they rise ~1.4 tiles) with big heads, because faces and gloves carry the style. Title cards sit in the corners like intertitles over the picture; the film gate rounds the four screen corners (7 px). Overlays stay tints plus hatching, so the floor art always shows through.

## 7. Sound (guidance for hosts)

Early-cartoon foley: a slide-whistle up on cursor move, a wood-block on confirm, a cymbal crash plus a descending slide whistle on a crit, a soft "poof" on MISS, a xylophone run on heal, a bicycle-horn honk on an invalid move. An original syncopated hot-dance loop at 120 BPM if music is wanted, aligned to the visual beat. Never imitate an existing cartoon's music or sound effects.

## 8. Signature moves (defaults)

| move | default |
|---|---|
| Even ink line | 0.7–1.15 px shapes, round caps, never tapered, colour `ink` |
| Boil | 3 drawings looping at 12 fps, ±0.2–0.32 px displacement from one smooth field (`disp`), shared points stay shared |
| Beat breathing | 120 BPM, ±5 % stretch about the foot, all in phase, held on twos |
| Pie-cut eye | white ellipse, pupil 66 % × 76 % with a wedge cut toward the upper right, blink = a line |
| White glove | pointer: pointing finger + heavy palm + thumb on top + two curled knuckles + a rounded cuff band, outlined as a union (each part stroked at double width, then all filled white), one cuff seam and two knuckle creases; fills the 9×7 hand box. Unit glove: palm + three finger bumps + thumb + cuff band at the end of a 1.5 px ink hose arm |
| Rubber-hose path | 5 px ink tube, 3.1 px white core, an ink drop (0.9, 1.1), hose bands every 9 px, ring nozzle at the unit, a pointing glove (scale 1.25) at the end |
| Range hatching | world-anchored 3.2 px spacing, 0.55 px: move `/`, attack `\`, threat cross-hatch, heal dot screen; boundary 1.15 px boiling ink, inset 0.7 px |
| Title-card numerals | ink drop (1.1 × scale), ink outline 2 × 1.25 px, white face with a cream lower half (damage) or a white shine band (others) |
| Crit | red-orange numerals on a 22-point paper POW burst with an ink drop, five ink impact ticks, CRITICAL on a red-orange notched ribbon |
| MISS / heal | MISS on a paper puff cloud that hugs the word; narrow letters (I, 1) keep at least 0.42 × the font size of room; heal and MP on teal with two twinkling 4-point stars |
| Emanata | lit props (brazier, lamp, crystal) throw a fan of six short ink dashes that pulse on the beat, instead of glow |
| Film pass | grain 0.8, flicker ±3.5 %, 2–6 dust specks a frame, a hair 12 % of frames, a faint scratch, vignette .52, gate corners 7 px, weave ±0.35 px (whole device px) |

## 9. Common mistakes

- **A sepia filter over a modern picture**: without noodle limbs, gloves, pie eyes and big shoes it is just brown. All four must be visible on every unit.
- **Tapered or variable lines**: that is brush ink (watercolor / ink-wash). Keep the pen even.
- **Boiling per frame at 60 fps** or with random noise per point: it fizzes. Hold drawings for two film frames and use one smooth field.
- **Water that reads as a road** (critic r1): a flat grey band with small scallops. Water needs its own cue in sepia: darker value, full-width wavy ripple lines continuous across cells, glints.
- **Arms hidden behind the body** (critic r1): an arm from the body edge to a glove a few px away reads as a floating white ball. Start the hose at the shoulder, end it ≥ 4 px outside the body, 1.5 px thick, and give the glove fingers and a cuff.
- **Blocky ground**: value pockets drawn as small squares read as pixel art, and per-cell clips leave hairline seams at fractional scales. Sample a 5×5 noise grid and stretch it bilinearly over each cell; overlap base fills by half a pixel.
- **Accent colours as decoration**: teal and red-orange only mean player / foe / range / crit / heal.
- **White text on a light row band**: window-cursor draws the selected row in the `main` role, not `select`, so the row band must stay dark (dark teal).
- **Over-squashed numerals**: x > 1.25 makes narrow letters (the I in MISS) vanish under their neighbours.
- **Glow, bloom, additive light**: this is print. Show light with emanata and paper-white flame cores.
- **Weave or flicker strong enough to move gameplay information**: keep weave under half a native pixel and flicker under 4 %.

## 10. Engine and skin API notes

- `pixel: false`, `native.scale: 'fit'`; draw in native coordinates; shadows are hard offsets, so no `setShadow` is needed.
- Overridden: `text`, `measure`, `frame` (with `frameRoles: ['row', 'backing']`), `number`, `overlay`, `bar`, `cursor`, the optional `path`, and the scene hooks `tile`, `prop`, `unitToken`, `atmosphere` (`atmospherePhases: ['final']`).
- `layout = {handW: 9, handH: 7, pointerGap: 4, rowFrame: true, backing: 'none'}`: the glove is wider than the default 7×5 hand; window-cursor caps `handH` at 7.
- `number()` reads `age` for its boil frame and heal twinkle, and the glyph's `dy` for the airborne stretch; it returns one rect per drawn glyph; the CRITICAL label is drawn as one ribbon block (first letter's offset, largest alpha).
- `onFontsReady()` drops the cap-height cache; hosts must `await GameDNA_Skin.ready('rubber-hose')` before laying out (canvas font).
- Extras on the registered skin: `SK.film` (post-pass switches; set any to 0 / false), `SK.toon` (ink, lit, noodle, pieEye, glove, mitt, star, puff, flame, boil, beat, breathe, hop) so hosts can draw matching sprites and effects, and `SK.numberLayout(text, opts)`.
- `tile()` gets no neighbour information, so the river has no ink bank line where water meets grass.
- Gate weave copies the frame onto itself shifted by whole device pixels inside `atmosphere('final')`; it assumes the host draws the world into the canvas it passes (true for the shared scene and direct hosts).

## 11. Variation space

- **Print stock**: warm sepia (default), cold silver-gelatin grey (paper `#e9eae6` → ink `#0e0f10`), or full two-strip (only the red-orange and blue-green families, no blue or yellow).
- **Beat**: 100–140 BPM; breathing amplitude 3–6 %.
- **Film damage**: from clean (`film=0`, for small screens or accessibility) to heavy (more scratches, a splice flash at scene changes).
- **Cards**: white-on-black intertitle (default) or black-on-paper poster cards with the same double rule.
- **Units**: any object can be a character (a lantern, a kettle, a mushroom) as long as it gets a face, gloves and shoes, and one attached feature that shows state (a flame that goes out, steam that stops).

## Fits which elements

Best: damage numbers (E-01: bouncy title-card numerals, POW crits), window + cursor (C-01: title cards and the glove pointer), grid range + path (B-01: hatched ranges and the hose arrow), dialogue boxes and expressive portraits (faces carry the style), big banners and battle transitions (iris in / out, title cards), platformer feel (squash and stretch). Good: ATB gauges (hose bars), shops (cards). Weaker: fog of war and dense data UIs (lots of small numbers fight the big hand-lettered type); 3D or Mode-7 views (the style is flat).

## Reviewer checklist

- [ ] At a glance a 1930s rubber-hose cartoon: every unit shows noodle limbs, white gloves, pie-cut eyes and big black shoes.
- [ ] Lines are even-width ink, never tapered; outlines visibly boil when playing (12 fps, 3 drawings) but a frozen `?t=` frame is identical on every load.
- [ ] Palette is the sepia ramp plus only red-orange and teal, and those two always mean team / range / crit / heal.
- [ ] Shading is one hard crescent; no gradients except the vignette; no glow.
- [ ] Windows are white-on-black title cards with a double rule and dot-ring corners; the selected row is readable.
- [ ] Damage numerals are fat hand-lettered caps with a thick outline and drop; crit has the POW burst and CRITICAL ribbon; MISS sits on a puff cloud.
- [ ] Move, attack and threat ranges differ by hatch as well as colour, with one continuous boundary line.
- [ ] The path is a white hose ending in a pointing glove; the menu pointer is a glove.
- [ ] Props and units breathe on the beat in phase; lit props show emanata.
- [ ] Film grain, vignette and gate corners are visible but never hide numbers, ranges or text.
- [ ] No existing cartoon characters, studios, names, silhouettes or music; neutral fantasy subjects only.
- [ ] Same seed and `?t=` give the same events as pixel16; 500 px wide layout has no horizontal scroll.

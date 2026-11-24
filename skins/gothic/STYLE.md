# Dark gothic painterly (`gothic`)

Skin file: `skins/gothic/gothic.js` (needs `skins/skin-api.js`). Preview: `skins/gothic/preview.html` (`?t=1400&freeze=1`).

## 1. Essence, and what it is not

A candle-lit crypt painted in oils. Near-black grounds where light is rare and precious: every lit thing is warm, everything else sinks into shadow. Desaturated stone and leather, with two accents only: **blood red** (danger, enemies, criticals) and **old gold** (UI, the player's intent: cursor, path, numerals). Windows feel like engraved iron and leather plates; numbers are struck metal. Motion is slow and heavy.

It is **not**: a horror splatter style (no gore), a neon "dark mode" UI (no saturated cyan, no flat black panels), a pixel style (no hard pixel grid, no integer scaling), or pastiche of any existing dark-fantasy series (no recognisable crests, logos or UI layouts). Purple is allowed only as the threat smoke, never as a UI colour.

## 2. Material

- **Painterly texture**: a tileable brush-noise texture (≈500 short curved low-alpha strokes + grain, seeded) blended with `overlay` over window bodies, bar fills and numerals. Grounds and host art get the same texture through `skin.brush()`.
- **Iron**: chamfered plates with a diagonal gradient (`ui.ironLight` → `ui.iron` → `ui.ironDark`), a light top-left bevel and a dark bottom-right edge.
- **Leather / painted body** inside the iron rim, darker toward the bottom, with a warm candle bloom in the top-left and deep shade bottom-right.
- **Gold**: always a 3-stop gradient (`goldLight`, `gold`, `goldDark`) with a dark groove under it, so it reads engraved rather than printed.
- **Smoke and fog**: soft tileable blob texture, tinted per use, drifting a few px per second.

## 3. Colour

| token | value | use |
|---|---|---|
| `ink` | `#0b0709` | outlines, deepest shade (never pure black) |
| `ui.fill` → `ui.fillTo` | `#211719` → `#0c090a` | window body |
| `ui.gold` / `goldLight` / `goldDark` | `#c9a04a` / `#f2d78e` / `#6e4c1a` | filigree, rims, cursor, path |
| `ui.blood` / `bloodLight` | `#7a1218` / `#c0282a` | alerts, selected row, crit |
| `text.main` | `#e6dcc4` | bone-white body text |
| `text.dim` | `#6c6256` | disabled |
| `team.a` / `team.b` | `#7d8ea8` steel blue / `#8e1c1f` blood | party / foes (glaze in windows, rim light on sprites) |
| `overlay.move` | `#5d7ea8`, edge `#bcd8f4` | pale-blue smoke |
| `overlay.attack` | `#8a1a1c`, edge `#ff7a3c`, alpha 0.22 | blood smoke, soft ember edge |
| `overlay.threat` | `#5a2c6a`, edge `#b88ae0` | violet smoke |
| `overlay.heal` | `#4a7a58`, edge `#c8ecb4` | grave-moss green |

Value structure: 80 % of the frame below 20 % lightness; highlights only where a light source is. Saturation stays low except for blood red, ember orange and gold.

## 4. Type and UI

- **Font**: engraved serif capitals. `fonts.ui` = `Cinzel` (Google Fonts, docs pages only) falling back to `Georgia`, `Times New Roman`, serif in games; 7.5 native px, weight 700, letter-spacing 0.35, uppercase. `fonts.plate` 7 px; `fonts.label` 6 px with wide tracking (CRITICAL).
- **Gilded text**: when a module passes `color2`, the skin fills a vertical gradient `color → color2` (gold titles, HP labels), with a soft black halo (`shadow.text` blur 2) instead of a hard drop.
- **Windows** (`frame`): chamfered iron rim (3 px corners), painted body, an engraved gold inner line, **gold filigree scrolls at all four corners** (4.5–6.5 px, always inside the 6 px padding), gold rivets top and bottom centre on wide windows. Team = a faint glaze under the top gold line, never a full recolour. `focus` = gold candle glow around the rim; `alert` = blood glow.
- **Plates** (`role: 'plate'`): thinner rim, single gold line, small gold diamonds on the left and right ends.
- **Bars**: dark iron trough with a hairline gold rim, liquid fill (3-stop gradient) with a glowing meniscus, engraved quarter ticks; status tag = a small shield at the right end.
- **Cursor**: `bracket` = four gold spear-tip corners with a breathing candle bloom (period ≈ 2.9 s); `hand` = a small gold spearhead with crossguard.

## 5. Motion

Slow and heavy. `motion.ease`: move `inOutQuad`, pop `outCubic` (no overshoot of its own), fade `inOutQuad`. `flashMax` 0.3 (flashes are candle flares, not strobes). Ambient loops: overlay breathing ±14 % alpha at 1.6 rad/s with a wave across the set; fog drift 2.5 px/s; path glint one pass per 2.4 s; cursor glow 2.2 rad/s. Timing of game events stays the module's.

## 6. Camera and composition

Chiaroscuro first: put 2–3 warm point lights (braziers, candles, a lantern) in the scene, darken everything else with a 0.7-alpha near-black layer cut by soft radial holes, then add an edge vignette. UI floats above the darkness and is never darkened. Keep the playfield readable: overlays and the path are drawn **after** the darkness pass.

## 7. Sound (direction)

Low strings and choir pads, distant bells; UI ticks are metal on stone (a soft "clink" for cursor moves, a heavier latch for confirm); criticals add a short low boom with a reverse-swell; healing is a breath of air and a chime. No chiptune.

## 8. Signature moves (with defaults)

1. **Gold filigree corners** on every window: `fs = clamp(min(w,h)·0.24, 4.5, padding + 0.5)` (padding 6), line width `fs·0.08`, dark under-stroke ×2.2, bead at the corner. The filigree stays inside the padding band so titles and rows never touch it.
2. **Engraved numerals**: serif 14 px weight 900, 3-stop metal gradient + inner shadow (0.55, 0.7 px offset, 60 %) + top bevel light (85 %) + brush texture (overlay 55 %), 2.4 px dark stroke, soft drop. Damage = gold, crit = blood red ×1.3 with an ember glow, heal = pale green-silver, MP = pale steel blue, MISS = ash.
3. **Smoke puff** behind each number at its landing spot: 7 soft blobs, width = number width + 0.9 × cap height, alpha follows the glyphs' mean alpha.
4. **Smoky range wash**: per kind `{alpha, glaze, smoke, edgeAlpha}`: move 0.24 / 0.55 / ×3.2 / 0.9; attack and threat 0.22 / 0.22 / ×2.2–2.4 / 0.5–0.55 (the smoke carries the colour, so red never becomes a solid carpet); a dark counter-drifting smoke layer at 40 %, colour pooled at the set boundary over 55 % of a tile, and a wobbly glowing edge line (blur 4 device px).
5. **Spearhead path**: gold line `max(1.4 px, 2.5 device px)` with a dark under-stroke 1.6 px wider, corners rounded with radius 0.42 tile, start ring r 2.6, leaf-blade spearhead 0.5 tile long, glint travelling the path.
6. **Candlelight chiaroscuro** in the host scene (see §6).

## 9. Common mistakes

- Flat black panels with a gold 1 px border: reads as a web "dark mode", not iron. Always rim + texture + filigree.
- Saturated red overlays at 40 %+ alpha: the map turns into a red carpet. Keep `alpha` ≈ 0.22 with a thin glaze (0.22) and let the smoke carry the colour; foes on red cells keep a bone-coloured rim light.
- Pure white text or `#000` shadows: use bone `#e6dcc4` and a blurred halo.
- Drawing the range under the darkness pass: the move range vanishes in the shadows.
- Fast bouncy UI (outBack, quick blinks): breaks the mood. Use `outCubic` and slow loops.
- Gold everywhere: gold marks the player's intent and the UI frame only; enemies, danger and crits are blood.
- Pixel-snapping: this skin is smooth; don't round positions, don't turn smoothing off inside the skin.

## 10. Engine and skin API notes

- `pixel: false`, `native.scale: 'fit'`: the host sizes the backing store to CSS width × devicePixelRatio and calls `ctx.setTransform(s, 0, 0, s, 0, 0)`; all methods draw in native px. The skin reads the transform scale (`devScale`) to render textures and numeral sprites sharp at device resolution, and caches them per scale.
- Every method wraps its drawing in `save/restore` and turns `imageSmoothingEnabled` on locally, so it works inside modules that turn smoothing off (window-cursor does).
- **Extras** (feature-tested): `path(ctx, points, t, {tile, alpha})` implements the reserved SPEC hook (points = tile centres, start first). `fog(ctx, rect, t, {alpha, color})` and `brush(ctx, rect, strength, seed)` give hosts the style's fog and brush texture for their own art.
- **Scene hooks** (SPEC v0.2 §2.4, used by `scene/shared-scene.js` and `compare.html`): `tile(ctx, rect, kind, t)` paints all 11 kinds dark and painterly (dead grass, worn flagstones and cobbles, black water with a cold sheen, slow ripples and candle glints, crags with a lit edge, dead trees, ruined arch, plank bridge, ash sand, stone wall); `unitToken(ctx, rect, unit, t)` draws hooded / helmed figures with the team as cloak colour (steel blue party, blood foes), glowing eyes, a rim light on the side facing the nearest light, and kind props (knight sword + kite shield + crest, mage staff + orb, ghoul claws, archer bow); `atmosphere(ctx, view, t, {phase, lights})`: `'world'` lays a 0.58 near-black layer with soft holes at the lights, warm or cold pools and thin fog under the overlays and units; `'final'` draws the light sources (iron braziers with rising embers, cold witch-light candles), low fog and a corner vignette, never over the HUD.
- `prop(ctx, rect, kind, t, {lights, light, seed})` (SPEC v0.4): leaning tombstone with an engraved cross (stone, rock, unknown), thorn bush with blood berries, gnarled tree rising one cell, iron tripod brazier, caged lantern on a post, witch-crystal on a plinth. Props are drawn after the darkness with a bone rim from the upper left and a coloured rim toward the nearest light (unit-carried magic lights ignored), so blocking terrain always reads; light carriers draw their own flame, halo and embers, and `atmosphere('final')` no longer draws light objects (only fog and vignette).
- Range washes breathe as one set (no per-cell phase, which read as squares); the ground grid line is faint (0.16) so smoke reads across cell borders. CRITICAL is blood red with a dark edge and an ember glow.
- `frameRoles: ['row', 'backing']`: the selected row is a blood-red glaze fading at both ends with gold hairlines; the backing is a dark inset well with a gold bottom line. `number()` grows and thins its smoke puff with `age / life` when a module passes them.
- `number()` honours `glyphOffset` (dx, dy, alpha, flash, skip) with glyphs numbered number → suffix → label, like pixel16. Its returned rects are cap-height boxes.
- `particles`: `shape 'blob'`, `blend 'lighter'`, `glow 0.7`, `gravity -0.015` (embers rise), `colors ['fx.ember', 'fx.hot', 'ui.gold']`, plus `smoke: 'fx.smoke'` for a host that wants a dark puff layer.
- `outline.number.mode 'stroke'`, `shadow.window {dy 2, blur 10}`, `shadow.sprite.kind 'cast'`.
- Fonts: the skin names a serif stack; inside a game nothing loads from the network (Cinzel only if the page itself provides it).

## 11. Variation space

- **Light colour**: candle amber (default) ↔ cold moonlight (swap the light pools to `#9cc0e6`, keep gold UI).
- **Metal**: dark iron (default) ↔ blackened bronze (shift `ui.iron*` warmer) ↔ bone (pale `ui.fill`, for a reliquary look; then raise text contrast with dark ink).
- **Accent balance**: blood-forward (crits, foes, selected row) ↔ gold-forward (more gold in the frame, blood only for danger).
- **Fog density**: 0.1 – 0.3 alpha; heavier fog for swamp or graveyard maps.
- **Filigree size**: 5 – 10 px; smaller for dense HUDs.

## Fits which elements

Best: turn-based and active-time battle screens (A-01, A-02), damage numbers (E-01), window and pointer menus (C-01), dialogue and story beats, roguelike dungeon maps and grid tactics (B-01) in castles, crypts and forests at night, big banners (`role: 'banner'`), dissolve-on-defeat and battle transitions (smoke, embers). Weaker: bright daytime overworlds, pastel puzzle games, anything that needs high-key cheerfulness, very dense spreadsheets of numbers (filigree costs room).

## Reviewer checklist

- [ ] At least 70 % of the screen is near-black; light comes from visible sources.
- [ ] Windows have an iron rim, a textured body, an engraved gold line and filigree in all four corners.
- [ ] Text is a serif in capitals, bone-white or gilded, with a soft halo; no pixel font.
- [ ] Damage numerals look struck in metal (gradient, inner shadow, dark outline) with a smoke puff; crits are blood red with an ember glow.
- [ ] The move range is a pale-blue smoke, the strike fringe blood with an ember edge; neither is a flat block; edges glow.
- [ ] The path is a thin gold line ending in a spearhead.
- [ ] Cursor and pointer are gold spear shapes, not a white glove or arrow.
- [ ] Motion is slow (no bounce overshoot added by the skin, no strobing).
- [ ] No real series motifs, no Taiwanese / Chinese motifs, English UI.
- [ ] Mobile (500 px wide): text still readable, no horizontal scroll.

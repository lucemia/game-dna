# STYLE: neon-vector (Neon vector arcade)

Skin id `neon-vector` · file `neon-vector.js` (load after `skin-api.js`) · preview `preview.html?t=1400&freeze=1` (`&crt=0` switches the CRT post off).
All sizes below are **native px** (the module's 256×224 grid). The style needs at least a 2× display: its lines are under 1 native px.

## 1. Essence, and what it is not

A vector-display arcade cabinet: everything is a thin line of light on a black tube. Terrain, units, windows and arrows are wireframes; colour comes only from a handful of saturated neon hues whose centres burn white. Motion leaves short phosphor afterimages. It should feel electric, precise and a little cold.

It is **not** pixel art (no stair steps, no integer snapping, no bitmap font), not "synthwave poster" (no gradients across the sky, no chrome, no sunsets), not flat vector (no filled colour areas: fills are black or a faint additive tint), and not a recolour of the 16-bit look.

## 2. Material

Light on glass. Every visible mark is a **stroked path** drawn as glow: three wide translucent halo strokes (additive, `lighter`), the colour line, and a thinner white-hot core. No `shadowBlur`: the glow is built from strokes so hundreds of shapes stay cheap. Closed shapes are **filled black first** (hidden-line removal), so a unit in front of the grid hides the grid lines behind it. Areas are never painted solid; at most a faint additive tint (alpha 0.05–0.09).

## 3. Colour

| token | value | use |
|---|---|---|
| `ink` | `#000000` | background, window bodies, black underlay behind text and numerals |
| `neon.cyan` | `#29f3ff` | player team, move range, body text halo, water, grid floor (at 0.13) |
| `neon.magenta` | `#ff2fd8` | enemy team, attack range, crit echo, alerts, flame tongues |
| `neon.yellow` | `#ffe93b` | cursor, pointer ship, path arrow, crit numerals, every title (window titles, unit names) and field label (HP, DEF), plates, threat range (dashed) |
| `neon.green` | `#3dff86` | neutral, heal, HP bar, trees and bushes (life only; never text labels) |
| core | colour mixed 62 % to white | the centre line of every stroke ("white-hot") |
| `text.main` | `#aefbff` | body text; `text.dim` `#2f6a74` (no core) for disabled rows |
| stone / metal | `#9fdcff` | rocks, mountains, prop stands (the one off-palette pale) |

Rules: four hues plus white, nothing else. A colour always means the same thing (cyan = mine, magenta = theirs, yellow = attention, green = life). Terrain lines sit at 0.45–0.65 opacity so units, ranges and UI stay brightest.

## 4. Type and UI

- **Stroke font** (`fonts.ui`, own glyph table in the skin): straight segments on a 4×6 grid with chamfered corners, uppercase only, 7 px cap height, 0.72 px line, 1.5-unit tracking (same advance as the 16-bit 5×7 font, so layouts match). Zero has a slash; `I`, `1`, `.`, `:` are narrow. A 1.1 px black underlay keeps text legible over the map. `title` 0.85 px line, `label` / `plate` 6 px.
- **Numerals** (`fonts.num`): **seven-segment** digits with visible gaps between segments (the `1` is a full-height pair with a top-left flag in a narrow cell), 11 px tall, 1.3 px line, butt ends, slanted 0.09; letters (MISS) fall back to the stroke font at 0.72 size.
- **Windows**: opaque black body, top-left and bottom-right corners chamfered 3 px, a glowing 0.75 px edge in the team colour, a dim inner rule 2.2 px inside, faint 2 px terminal scanlines, white corner ticks on the two square corners. Padding 4.
- **Selected row** (`frame` role `row`): additive band fading left to right, a glowing bar on the left edge, a thin underline. **Backing**: black well with a dotted dim outline.
- **Plate**: a yellow hexagonal capsule. **Tooltip**: dashed edge. **Banner**: double rule with side dashes.
- **Bars**: LED segment meters (2 px segments, 1 px gaps) in a thin dim outline; `gauge` style adds bracket ends.

## 5. Motion

Smooth and quick (`ease.pop = outBack`, `move = outCubic`), no stepped time. **Persistence** is the signature: anything that moves leaves 2 afterimages 45 ms apart, each 0.45× as bright, drawn halo-only (cursor bracket pulse, pointer ship nudge, the selected unit's hop, the path's comet spark). Damage numerals flash white-hot in the line only (halos keep their hue, so no grey rings), smear vertically (halo copies ±1.9 px) during the first 20 % of their life, and squash slightly on landing (`squash {x: 1.12, y: 0.88, ms: 60}`). The bracket breathes 0.4–1.3 px at 7 rad/s; the path's centre dashes march at 14 px/s; flames and crystals pulse from `t`. Every effect is computed from `t` / `age` (no history), so `?t=&freeze=1` is exact. Timing is never the skin's.

## 6. Camera and composition

Flat top-down 2D on a black field with a faint cyan wire grid (one line per cell edge, a brighter dot at each crossing). No perspective, no curvature. UI floats in the corners as wire panels; the playfield keeps most of the light budget in the ranges and units. Lit props cast soft additive light pools on the floor (`atmosphere` phase `world`).

## 7. Sound (guidance for hosts)

Synthesised, square and noise channels: a short rising blip on pointer move, a two-tone zap on confirm, a falling noise burst on hit, a high arpeggio on crit, a low hum under menus. No reverb.

## 8. Signature moves (defaults)

| move | default |
|---|---|
| Glow stroke | halo passes at widths lw + {6, 3.2, 1.4} × spread, alpha {0.05, 0.10, 0.20} × k, additive; colour line at lw; core at 0.42 lw in colour→white 62 % |
| Hidden-line fill | every closed shape (unit parts, props, arrowhead, pointer) filled `#000` before its stroke |
| Black underlay | text 1.1 px per side, numerals 1.4 px per side, bracket 0.6 px |
| Seven-segment numerals | 4×6 cell, segment gap 0.55 unit, 1.3 px line, skew 0.09; crit ×1.3 in yellow with a magenta echo offset (−1, 0.8) and 12 radiating line sparks for 420 ms; CRITICAL flanked by two magenta dashes |
| Range cells | additive tint 0.075 (threat 0.05), inset wire square 2 px in at 0.3, a centre mark (move dot, attack ×, heal +, threat hatch), glowing 0.8 px boundary (threat dashed 2.2/1.4); `pulsing` = a cubed sine scan wave brightening tint and squares |
| Hollow path tube | 4.8 px colour stroke with a 3.1 px black core (two glowing edges), marching 0.7 px centre dashes, hollow arrowhead 9 px wide with an inner chevron, start ring r 2.6, comet spark with a 5-dot tail |
| Pointer ship | an arrowhead hull 8×6 with a notch, tip 1.3 px short of the box edge (never touches the target), magenta exhaust flicker, a backward-only nudge of up to 0.8 px |
| CRT post (`skin.crt`) | scanlines 0.2 black every 2 px, vignette 0.42 at the corners, no curvature; drawn in `atmosphere('final')`, so over the world but under HUD windows |
| Units | wireframe figures 0.8 px, team colour, accents (orb, weapon, eyes) in yellow (player) / magenta (enemy), a glowing ellipse ring at the feet; selected = brighter ring plus a marching dashed yellow ring and a hop with afterimages |

## 9. Common mistakes

- Using `shadowBlur` for glow: slow with many shapes and scales wrongly with the canvas transform. Stack strokes.
- Butt caps on halo passes: short segments turn into blocks. Halos are always round-capped; only the colour line of segment numerals is butt.
- Filling areas with colour (a solid blue range, a coloured window body): breaks the line-art rule. Tint at ≤ 0.09, additive.
- Forgetting the black underlay: thin glowing text vanishes over the grid and range tints.
- Too many hues: orange, purple or blue drift the look toward synthwave posters. Four hues plus white.
- Drawing a fading glyph's underlay and glow straight onto the canvas at alpha < 1: the underlay darkens the scene in a box. Fade through `fadeLayer`.
- Stateful trails (remembering last frame): breaks `?t=&freeze=1`. Recompute the motion at `t − k·dt`.
- Showing it at 1× native: 0.7 px lines blur into mush. Use the fit scale at ≥ 2×.

## 10. Engine and skin API notes

- `pixel: false`, `native.scale: 'fit'`: backing store = 256×224 × display scale, `ctx.setTransform(s, 0, 0, s, 0, 0)`; draw in native coordinates.
- Fonts are `type: 'vector'` (the skin's own stroke and segment tables); `measure` and `text` are overridden, so no web font and nothing to wait for (`GameDNA_Skin.ready` resolves at once).
- Methods overridden: `measure`, `text`, `frame` (with `frameRoles: ['row', 'backing']`), `number`, `overlay`, `bar`, `cursor`, the optional `path`, and the scene hooks `tile` (11 kinds), `prop` (stone, tree, bush, brazier, lamp, crystal), `unitToken` (knight, mage, fighter, archer, monster) and `atmosphere` (`world` light pools, `final` CRT).
- `number()` returns one rect per drawn glyph in canonical order (main, suffix, label); it honours `glyphOffset` `dx/dy/alpha/flash/skip/sx/sy` and reads `age` / `life` for the smear and crit sparks. Glyphs with alpha < 1 go through `fadeLayer`.
- `layout = {handW: 8, handH: 6, pointerGap: 4, rowFrame: true}`; the ship's tip stops 1.3 px short of the box's right edge, so it never touches the target sprite.
- `motion.persistence = {ghosts: 2, dtMs: 45, decay: 0.45}` is a skin extra read only by this skin's own methods; `skin.crt = {scanlines, vignette, pitch}` can be zeroed by a host.
- Rules: `particles {shape: 'line', blend: 'lighter', glow: 1, trail: 3, colours crit / echo / cold / white}`, `outline.number.mode 'underlay'`, `shadow.sprite {kind: 'ring'}` (no dark blob shadows on a black floor).

## 11. Variation space

- Palette swaps that keep four hues: ice (cyan, white, violet-blue, green), ember (yellow, orange-red, magenta, green). Keep one hue per meaning.
- Glow strength 0.6–1.3 (`k`); line width 0.6–1.0 px for UI.
- CRT post off (`crt.scanlines = 0`, `vignette = 0`) for a clean vector monitor; pitch 3 for a coarser tube.
- Seven-segment numerals can become stroke-font numerals (set `fonts.num.style` to anything but `segment`) for a softer arcade look.
- Floor grid can fade out entirely for a "deep space" board, or bend into a horizon (a host-side change; the skin has no camera).

## Fits which elements

Best: grid range + path (B-01), damage numbers (E-01), window + pointer (C-01), turn-order and active-time gauges (LED meters), big banner text, timing-bar minigames, shatter and dissolve effects (line shards), level-select maps (glowing routes). Good: fog of war (as a darker grid), isometric maps (wire boxes). Weaker: expressive portraits and dialogue with faces (wireframe faces read cold), painterly or cosy farming themes.

## Reviewer checklist

- [ ] Background is black; nothing but lines and faint additive tints, no solid colour areas.
- [ ] Every line glows (halo + white-hot core); closed shapes hide what is behind them.
- [ ] Only cyan, magenta, yellow, green and white; each keeps one meaning.
- [ ] Text is the stroke font, uppercase, legible at 2× (menu labels, HP 34/40, Turn 3).
- [ ] Damage numerals are seven-segment with visible segment gaps; the crit is yellow with a magenta echo, line sparks and a CRITICAL label between dashes.
- [ ] Range edges glow on the boundary only; cells show an inset wire square; threat is dashed yellow.
- [ ] The path is a hollow glowing tube with a hollow arrowhead and a moving spark.
- [ ] Moving things leave short afterimages; `?t=&freeze=1` is deterministic.
- [ ] Scanlines and vignette are subtle and can be switched off; no curvature.
- [ ] Same seed and `?t=` give the same events as pixel16 (only the picture differs).
- [ ] 500 px wide layout: no horizontal scroll, all text legible.

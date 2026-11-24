# STYLE: cel (Cel-shaded anime)

Skin id `cel` · file `cel.js` (load after `skin-api.js`) · preview `preview.html?t=230&freeze=1`.
All sizes below are **native px** (the module's 256×224 grid). At the usual 3× display, 1 native px ≈ 3 CSS px.

## 1. Essence, and what it is not

A TV-anime battle screen: flat saturated colour, every shape closed by a bold dark-violet ink line, exactly one hard shadow tone per colour, and UI that leans forward (slanted panels, italic numerals, speed lines). It should feel fast and loud, like a key frame.

It is **not** pixel art (no stair-stepped edges, no integer snapping), not soft vector "flat design" (no gradients, no blur, no rounded cards), not painterly (no texture, no wobble), and not a recolour of the 16-bit look.

## 2. Material

Ink and flat paint on cels. Shapes are vector polygons and stroked text. Shading is a **hard-edged second tone** cut by a straight line (diagonal on panels, slanted on numerals), never a gradient. Highlights are single short white strokes (rim line, glint slash). Drop shadows are solid ink offset shapes with no blur.

## 3. Colour

| token | value | use |
|---|---|---|
| `ink` | `#1c1433` | every outline, drop shadow, text outline (dark violet, never pure black) |
| `panels.a` | `#2a6bff` / shade `#1a43c4` / rim `#8cc0ff` / stripe `#ffd23a` | player windows |
| `panels.b` | `#ff3b56` / `#c01a3c` / `#ffb0bc` / `#ffd23a` | enemy windows |
| `panels.n` | `#4a3fb8` / `#2f2680` / `#a49dff` / stripe `#ff4f8b` | neutral windows |
| overlays | move `#1f8bff`, attack `#ff2d4b`, threat `#a234ff`, heal `#16d483` | tint 0.34 after a 0.75 `color`-composite hue strip |
| `fx` | hot `#ff6a1a`, cold `#30d0ff`, heal `#2ff08a`, crit `#ffd21a`, burst `#ff3b56` | effects and numerals |
| `text` | main `#ffffff`/`#d8e2ff`, title `#ffe14d`/`#ffb21a`, accent `#ffd23a`, dim `#a9a2d6` | text pairs are (top, bottom) hard split |

Rules: primaries at full saturation; one shade tone per colour (about 30–35 % darker, hue kept); the yellow accent appears on every screen (stripe, pointer, crit).

## 4. Type and UI

- **UI font** (`fonts.ui`): heavy rounded sans, 800 weight, 8 px, uppercase, 0.2 px tracking. Stack: `"M PLUS Rounded 1c", "Baloo 2", "Arial Rounded MT Bold", "Nunito", ui-rounded, "Trebuchet MS", system-ui`. The Google Fonts (Latin only) load on documentation pages; a game uses the system fallback.
- **Text**: hard ink drop (0.8, 1) + 1 px ink outline + fill; `color2` fills the lower 45 % with a hard cut (cel two-tone).
- **Numerals** (`fonts.num`): "Baloo 2" 800 italic, 17 px (crit ×1.35, words ×0.62).
- **Windows**: parallelogram panels, slant 4 px, 1.2 px ink outline, solid ink drop (2, 2), hard shade band over the lower ~32 % cut on a slight diagonal, 1 px rim light at the top, two diagonal accent stripes across the top-right corner. Padding 5.
- **Bars**: 2 px slant, ink outline + 1 px offset ink drop, fill light over shade (hard split at 55 %), white top glint, ink cap at the fill end.

## 5. Motion

Snappy. `motion.ease.pop = outBack` (overshoot), `move = outBack`; no stepped time, no snapping. Damage numerals **squash on landing** (`motion.squash = {x: 1.22, y: 0.8, ms: 70}`, passed per glyph as `glyphOffset → {sx, sy}`). New numerals flash white for the first 50 ms. The bracket cursor pops out 1.5 px with overshoot and settles, period 0.6 s. The path arrow's white dashes march toward the tip at 18 px/s. Fades are smooth but composited as one layer (outlines never show through). Timing (durations, hit-stop, order) is never the skin's.

## 6. Camera and composition

Flat top-down 2D, no perspective. UI panels hug the screen corners and lean right (slant goes up-right). Leave the playfield readable: overlays are tints, not opaque fills. Key moments (crit) may break the frame with a starburst that overlaps sprites.

## 7. Sound (guidance for hosts)

Short, bright, synthetic "anime SFX": whoosh on pointer move, a crisp "ka-chin" on confirm, a heavy hit + rising sting on crit, a quick pop on window open. No reverb tails.

## 8. Signature moves (defaults)

| move | default |
|---|---|
| Ink outline on everything | 1–1.2 px panels / bars / cursor, 1.6 px per side on numerals (max 2.4), colour `ink` |
| Hard drop | panels (2, 2), numerals (1.4, 1.4) ×scale, text (0.8, 1), cursor (0.9, 1.1), no blur |
| Two-tone hard split | panels: lower 32 % band on a ~6 px diagonal; numerals: lower ~45 % cut on a slanted line; text: lower 45 % in `color2` |
| Diagonal accent stripe | two slanted bars, 6.6 px and 2.1 px wide, 9 px shear, top-right corner, team stripe colour (alert = burst red) |
| Speed lines | 3 streaks left of damage/heal/MP numerals, ink 2.4 px under a 1 px colour core, length ≈ 0.55–0.85 × cap height ×1.3 |
| Crit starburst | 14-spike star (outer R = max(0.62 w, 1.05 cap), ellipse 1.2 × 0.72), ink drop + ink outline, red outer, yellow inner, 10 radial ink lines; label on a red slanted ribbon |
| Glint | one white slash on the first digit; 1 px white line on top of bars |
| Chunky path arrow | 7 px ink, 4.4 px yellow core, 1.6 px orange shade offset (1.1, 1.1), triangle head 11 px wide, ink drop (1.2, 1.5), marching white dashes |
| Overlay tile | hue strip (`color` 0.75) + flat tint 0.34, darker lower-right triangle, 0.6 px ink rim + 1 px bright edge on the set's boundary, white diagonal sweep when pulsing |

## 9. Common mistakes

- Gradients or blurred shadows (breaks the cel look; use a second flat tone).
- Pure black outlines (use `ink`, dark violet).
- Thin 0.5 px outlines: at 3× they vanish; keep ≥ 1 px native.
- Drawing a fading number glyph by glyph with alpha: outline shows through the fill (the skin composites a layer; keep that).
- Overlays painted straight over green ground turn teal / brown; strip the hue first.
- Italic numerals plus extra shear: digits collide. Use the italic font only.
- Using pixel rules (integer snap, `pixel: true`) with this skin.

## 10. Engine and skin API notes

- `pixel: false`, `native.scale: 'fit'`: backing store = 256×224 × devicePixelRatio × display scale, `ctx.setTransform(s, 0, 0, s, 0, 0)`; draw in native coordinates.
- Methods overridden: `text`, `frame`, `number`, `overlay`, `bar`, `cursor`, plus the reserved `path(ctx, points, t, opts)` hook. `measure` is the generic canvas measure (same font string as `text`).
- `number()` extensions: `glyphOffset` may return `sx`, `sy` (squash around the baseline); the MP suffix appears with the last digit; fades are drawn through one offscreen layer.
- `cursor(..., 'hand')` draws an ~11×10 arrow whose tip is at the rect's right-middle; it is wider than the 7×5 box modules reserve.
- `frame()` returns an inner rect inset by `max(padding, slant + 1)` so text clears the slanted sides.
- Scene hooks (SPEC v0.2 §2.4): `tile` draws all 11 kinds as flat saturated fills with one hard shade tone and ink outlines on features only (trees, hills, peaks, forts, bridge rails, bricks), never on cell borders; water waves move with `t`. `unitToken` draws chunky chibi figures (big head, two-dot anime eyes with glints, two-tone body split, 1 px ink outline, weapon by kind, hard blob shadow; `selected` hops with stretch and landing squash; `dead` at 0.4 alpha). `atmosphere` (`phase: 'final'` only) adds faint ink speed lines in the outer 9 px frame band.
- Overlay hue strip (`overlayStyle.hueAlpha` 0.68) also tints features under the range (trees, peaks); 0.5 kept features truer but turned the tints muddy.
- Rules: `particles.shape 'stroke'` (speed-line sparks, 2–6 px, life 160–360 ms, colours white / crit / hot, ink outline), `outline.number.mode 'stroke'`, `shadow.sprite {kind: 'blob', alpha: 0.4, hard: true}`.

## 11. Variation space

- Panel slant 3–6 px; stripe colour per team or per chapter.
- Team hues may shift (teal/orange, green/purple) as long as each keeps one shade tone and the ink stays dark violet.
- Paper-white panels (`team: 'paper'`, used for tooltips) for a lighter, shoujo-like UI.
- Number size 15–20 px; speed lines may be dropped for heal in calm games.
- Crit starburst colours may follow the element (ice: cyan/white; fire: red/yellow).

## Fits which elements

Best: damage numbers (E-01), window + cursor (C-01), grid range + path (B-01), big banners, combat forecasts, battle transitions, portrait dialogue (expressive faces and speed lines carry the style). Good: active-time gauges (slanted bars). Weaker: fog of war and dissolve effects (need a cel version: hard-edged steps, not soft noise).

## Reviewer checklist

- [ ] Every window, bar, cursor, arrow and numeral has a visible dark-violet outline (≥ 1 px native).
- [ ] No gradient and no blur anywhere; shading is one hard second tone.
- [ ] Windows are slanted panels with a diagonal accent stripe and a solid ink drop.
- [ ] Damage numerals are big italic rounded digits with speed lines; a crit has a starburst and a ribbon label.
- [ ] Overlay tiles read as saturated blue / red / purple / green, not teal or brown, with a bright edge on the boundary.
- [ ] The path arrow is chunky, outlined, with a triangular head.
- [ ] Fading numbers stay clean (no outline showing through).
- [ ] Same seed and `?t=` give the same events as pixel16 (only the picture differs).
- [ ] 500 px wide layout: no horizontal scroll, all text legible.

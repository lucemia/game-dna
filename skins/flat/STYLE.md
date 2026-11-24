# Flat vector / minimal geometric (`flat`)

Skin file: `flat.js` (needs `../skin-api.js` first). Preview: `preview.html?t=1400&freeze=1` (the canonical `../scene/shared-scene.js`); side by side: `../compare.html?only=flat&t=1400&freeze=1`. Screenshots: `shots/`.

## 1. Essence, and what it is not

A modern mobile-strategy board: pastel geometric tiles that sit a little proud of the ground, round two-tone tokens, white rounded cards floating on soft shadows, and **one** strong indigo accent that marks everything the player can act on (selection, path, pointer, phase banner, critical hits). It reads as calm, clean and expensive. Information comes from shape and colour, not from outlines or texture.

It is **not**: pixel art scaled up (no snapping, no dithering, no 1-bit text); skeuomorphic (no bevels, gradients that imitate metal, rivets, parchment); outlined cartoon or cel (no ink lines, no hard black shadows); a dark UI (the ground is light); neon or glow-heavy.

## 2. Material

Matte paper-like vector shapes. Elevation comes from a **two-tone face**: each raised shape is drawn twice, a darker copy offset 0.9–1.2 native px down (the side) and the lighter top face. Hills are lifted 1.4 px. Water sits lower (no side face) and runs as one continuous channel. Cards are pure white with a soft ambient shadow (blur 6, dy 1.5, `rgba(41,48,77,.18)`) plus a tight contact shadow (blur 1.2, alpha .08). No textures; only small geometric details (three-stroke grass blades, dot flowers, two-curve waves).

## 3. Colour

| role | value |
|---|---|
| ink (text, darkest) | `#29304d` (never pure black) |
| muted label | `#7b8199` |
| page / paper | `#eef0f6` / `#f4f6fb`, ground `#e4e8f1` |
| **accent (only strong colour)** | `#5b4bff` → `#7d6bff` gradient |
| player / enemy / neutral | `#6f8cff` / `#ff8574` / `#aeb5c6`; sides `#4d68d6` / `#d9624f` |
| move / attack / threat / heal overlay | `#5f8bff` .36 / `#ff6f6f` .30 / `#9a8cff` .28 / `#3fcf8e` .32, each over a white lift of .38 |
| terrain | grass `#cfe8c3`/`#aed29f`, forest trees `#8cc79a`/`#6fae7e`, hill `#efe2bd`/`#d2c193`, water `#bfe1f4`/`#9ccbe6`, bridge `#ecd3ab`/`#c9a173`, rock `#cdd2de`/`#aeb5c6` |

Rules: pastel everything except the accent; one accent per screen region; team colours are mid-saturation pastels, never the accent. Overlays lift the ground toward white before tinting so blue over green stays a clean pastel blue (a plain tint goes muddy teal; red over green goes brown).

## 4. Type and UI

- Typeface: geometric sans. Games use the system stack `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` (Inter listed first, so it is used where installed); Inter from Google Fonts is allowed only on documentation pages.
- Native sizes (256×224 design space): `ui` 7.5 / 600, `title` 9 / 800, `num` 10 / 800, `small` 6 / 600, `label` 5.2 / 700 uppercase +0.55 tracking, `plate` 6.2 / 700 uppercase. Rendered at device resolution, so 7.5 native = 15 CSS px at 2× layout scale.
- Windows: white rounded-rect cards, radius 5, padding 5, hairline edge (1 device px, ink at 10 %). Team windows get a 1.4 px rounded team-colour bar inside the left edge and a 6 % team tint.
- Plates and banners are full pills; the phase banner is the accent gradient with white uppercase text; tooltips are ink pills.
- Bars are full-round pills: track `#e9ecf4`, two-stop gradient fill, a thin white highlight line; haste / slow tags are small white discs with a chevron.

## 5. Motion

Smooth and eased, never stepped: `stepMs 0`, `snap false`, ease `move: outCubic`, `pop: outBack`, `fade: outQuad`, `flashMax .3`. Overlay cells scale in from their centre with `outBack` while fading in. The cursor ring's corner ticks breathe on a 0.9 s sine. The path glint glides along the arrow with `inOutQuad` on a 1.4 s loop. Pop-up numbers bounce as one pill; fades are composited as one layer, so the pill, its shadow and the numerals fade together. Timing (durations, hit-stop, order) always stays the module's.

## 6. Camera and composition

Top-down orthographic, no tilt. Tiles 16 native px with a 0.9 px gap and radius 2.6, so the board reads as a grid of soft tiles on a cool grey ground. Cards float over the board at the corners with 4 px margins. Keep one card per corner and leave the centre for the map. Phase pills sit top-right.

## 7. Sound

Soft and synthetic: short rounded "tock" clicks for cursor moves, a two-note rising chime on confirm, a muted pop for numbers (pitch up on crits), a gentle low thud on cancel. No chiptune square waves, no orchestral hits.

## 8. Signature moves (with defaults)

1. **Two-tone tile**: side face offset 1.2 px, top face lighter. Hill lift 1.4 px.
2. **Accent path arrow** (`path()`): white casing 0.30 tile wide under a 0.17-tile accent gradient core, corners rounded with a quadratic of radius 0.45 tile, rounded triangular head (length 0.38 tile, half-width 0.28 tile), soft shadow (blur 2.4, dy 0.9), white node dots, a gliding glint.
3. **Merged range region**: cells join into one translucent region with rounded convex corners (radius 2.5), a 0.75 px inset edge on the boundary only, and faint white seams (35 %) as a quiet grid.
4. **Number pill**: bold sans numerals centred on a pill (height = 1.3 × font size, side padding 3.6). Kinds: damage = white pill + ink, crit = accent gradient pill + white, ×1.3, with a white `CRITICAL` tag in accent letters; heal = mint `#e3f8ee` + `#1f9a5e`; MP = `#e2f0ff` + `#2f7fd9`; miss = `#f1f2f6` + `#8a90a3`; status = `#efe8ff` + `#7a4fe0`.
5. **Cursor ring**: accent rounded-rect ring 0.9 px with a 10 % accent fill, four rounded corner ticks 1.1 px that breathe 0.6–1.2 px out.
6. **Chevron pointer**: an accent arrowhead with a white rim and a small accent-tinted shadow.
7. **Accent phase banner**: gradient pill, white uppercase label, next to a white "Turn N" pill.

## 9. Common mistakes

- Using the accent for team colours or terrain: it stops meaning "you can act here".
- Plain translucent tint over green: muddy teal and brown. Lift with white first.
- Drawing outlines on tokens, cards or numerals. The only outlines allowed are hairlines and the overlay boundary.
- Forgetting that `shadowBlur` ignores the canvas transform: at 4× the shadow looks 4× too tight. `flat.js` scales blur and offset by the current transform.
- Fading a number pill by setting `globalAlpha` on each part: the shadow shows through the pill. Fade one composited layer.
- Snapping positions or stepping fades (that is the pixel look).
- Text too small at 500 px width: keep `ui` ≥ 7 native.

## 10. Engine and skin API notes

- `pixel: false`, `native {w: 256, h: 224, scale: 'fit', smoothing: true}`. The host sizes the backing store to CSS width × devicePixelRatio and calls `ctx.setTransform(s, 0, 0, s, 0, 0)`; modules keep native coordinates.
- Overridden methods: `frame` (also the unframed roles `row` = accent-tinted pill and `backing` = soft rounded well; `frameRoles: ['row', 'backing']`, `layout.rowFrame: true`), `number`, `overlay`, `bar`, `cursor`, the optional `path(ctx, points, t, {tile, alpha, invalid})`, and the scene hooks `tile(ctx, rect, kind, t)` (all 11 kinds: grass, forest, water, hill, mountain, road, bridge, fort, sand, wall, floor) and `unitToken(ctx, rect, unit, t)` (knight, mage, fighter, archer, monster; `selected`, `dead`, `facing`, `noShadow`). `text` and `measure` are the generic canvas-font versions; `atmosphere` is the generic no-op (the style has no mood layer).
- `number()` follows the SPEC 2.1 block rule: the pill moves with the first item of the number (k = 0), takes the largest alpha and any flash; the CRITICAL tag does the same with the label items. `sx`/`sy` squash the pill about its bottom centre (`motion.squash {x: 1.12, y: 0.88, ms: 80}`). Pill and tag fade through `GameDNA_Skin.fadeLayer`, as does `path()` when `alpha < 1`.
- `tile()`: water and bridge cells are full-bleed so a river is one continuous lower channel; every other cell is a two-tone rounded tile on the ground colour with a 0.9 px gap. Features are flat geometry: round two-tone trees, a faceted peak with a white cap, a two-face hill, a white fort with an accent flag.
- Palette tokens: `palette.terrain.<kind>` is ONE colour per kind (the top face, so the generic `tile()` also reads it); `palette.terrainSide.<kind>` is the side face; `palette.terrainArt` holds feature colours and the ground `#e4e8f1`. Also `palette.unit`, `palette.numbers`, `palette.bars` (with `<kind>To` gradient ends), `ui.accent`, `ui.accent2`, `ui.tooltip`, `text.onAccent`.
- Fonts: canvas fonts only; no font files ship with a game.

## 11. Variation space

- Accent hue: any single saturated hue (indigo default; teal `#12b5a6`, coral `#ff6a4d`, amber `#ffb020`), keeping teams pastel.
- Ground: light (default) or a "night" variant (ground `#2b2f45`, cards `#353a55`, pastel terrain darkened 35 %), keeping the accent.
- Corner radius 3–8 native; tile gap 0.5–1.5.
- Isometric tilt is out of scope for this skin (that is a different composition, not a variation).

## Fits which elements

Best: grid range + path arrow (B-01), window and cursor (C-01), damage numbers (E-01), turn and phase banners, unit info cards, economy and puzzle boards, world maps. Fine: active-time gauges (pill bars). Weak: gritty real-time action, horror, anything that needs texture or heavy particle effects.

## Reviewer checklist

- [ ] Rendering is smooth at device resolution: no stair-stepped edges, no 1-bit text, no pixel snapping.
- [ ] Exactly one strong accent, used for selection, path, pointer, banner and crits only.
- [ ] Raised shapes show two-tone faces; water sits lower.
- [ ] Cards are white rounded rects with soft shadows and at most a hairline edge.
- [ ] Range overlays read as clean pastel regions (no muddy teal or brown), with rounded convex corners and a thin boundary.
- [ ] The path arrow is a smooth curve with rounded corners, white casing and a clear head.
- [ ] Numbers are bold sans on pills; crit uses the accent pill and a `CRITICAL` tag; fades are clean (no shadow showing through).
- [ ] Motion is eased (no stepped fades or bobs drawn by the skin).
- [ ] Layout holds at 500 px width with no horizontal scroll; text stays legible.
- [ ] English UI, neutral fantasy content, no real game names.

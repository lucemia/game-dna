# HD pixel diorama (`hd-diorama`)

> Pixel characters stand like paper cards inside a lit miniature: a cool ambient night against a few warm point lights that throw soft shadows, focus only on one band of the table, dust hanging in the air, and dark glass windows with thin gold edges and crisp pixel text.
> Skin file: `hd-diorama.js` (registers `hd-diorama` with `GameDNA_Skin`). Preview: `preview.html` (`?t=ms&freeze=1`). Adapted from our earlier in-house pixel-diorama style kit (grammar only: cards in a lit 3D scene, point lights with shadows, tilt-shift, bloom, metal-edged glass UI). Original art; no real game, character or interface is referenced.

## 1. Essence and what it is not

- **A small lit stage.** The floor and props are a world that gets lit, shadowed and blurred; the characters on it are flat **pixel cards** that stay sharp.
- **Light is the subject.** One large cool ambient (moonlight) against 2–4 small warm or saturated point lights (a lantern, a campfire, a spell, a crystal). Every point light shows a visible pool on the floor and throws shadows.
- **Two clocks.** Cards and text move on whole pixels and step frames (idle: 2 frames, ~433 ms); the world changes smoothly every frame (light breathes, dust drifts, blur, glow).
- **Not:** plain 16-bit pixel art (no depth of field, no live light); voxels; a photographic miniature; a blur filter over the whole screen (cards, numbers and UI are never blurred); smooth vector UI text (text is pixel).

## 2. Material and drawing

- **Canvas:** native 256×224, backing store = native × integer `s` (3–5), `ctx.setTransform(s,0,0,s,0,0)`. Pixel things (sprites, text, numerals) are drawn at integer native coordinates with `imageSmoothingEnabled = false`, so each art pixel is an `s×s` square. Light, glass, glow and blur are smooth at device resolution.
- **Floor:** pixel texture per material with 5–7 tone ramps and Bayer dithering only in thin transition bands (dz ≈ 0.22); faint 1-tone-darker tile seams; cliff faces on raised tiles (4 px of darker stone on the open south side) and a soft shadow on the tile below.
- **Lighting:** a half-resolution light map, `floor × min(light,1)` (multiply) plus `(light − 1) × 0.27` (lighter) for overexposure; falloff `(1 − d²/r²)²`, scaled by `h/d·0.6 + 0.4` for light height.
- **Cards:** 16×24 (units) and 18×26 (trees) native, 1 px outline `#120e18`, lit from the upper left. On screen: `card × ambient` (floor 0.6 per channel) + a side gradient from each nearby light, **total added light ≤ 0.3** per card.
- **Shadows:** for each card, the up-to-3 strongest lights (contribution > 0.06, not the card's own lamp) lay its silhouette on the floor away from the light: length `h·d / (lightH·1.1)` clamped 7–34 px, alpha `min(0.72, contribution × 1.25)`, width axis perpendicular to the light; plus a contact blob (0.42 × card width, alpha 0.62).
- **Post order:** floor × light → light shafts → prop shadows + prop cards → **tilt-shift** (focus band y 70–176, feather 30, 1.8 px) → range overlays + path → standing props and units (shadows, then lit cards) → dust motes → **bloom** (emissive layer, 3 and 5 halvings, 0.9 / 0.7) → **vignette** 0.62 → cursor → numbers → windows. Blur is always repeated halving, never `ctx.filter`.

## 3. Colour

- **Two temperatures:** ambient `[0.27, 0.31, 0.52]` (dark variant `[0.16, 0.17, 0.30]`); key light `[1, 0.70, 0.38]`, spell `[1, 0.82, 0.48]`, magic `[0.40, 0.86, 1]`, heal `[0.45, 1, 0.62]`, danger `[1, 0.34, 0.40]`. Story goes in the point lights, mood in the ambient.
- Darkest is warm ink `#05040a` / `#0b0a10`, never `#000`. Brightest is the light itself, pushed by bloom.
- UI: one metal + one paper. Glass `rgba(26,26,42,.72)`→`rgba(10,10,20,.82)` (team a tinted blue, b tinted red), outer hairline `#6e5426`, inner hairline `#c9a45c`, corner diamonds `#f0d898`, text `#f2ead8`, selected `#fff0c0`, dim `#8d8a9c`, labels `#d8b46a`.
- Overlays glow rather than paint: move `#4a86ff`, attack `#ff3a3a`, threat `#b04ae0`, heal `#3ad07a`, each with a pale edge and a glow colour.
- Numbers (top → bottom, glow): damage white → `#c4d0f0`; crit `#fffbe0` → `#ffa830`, gold glow; heal → `#4ad880`; MP → `#4a9cff`; status → `#a872f0`; miss grey, no glow.

## 4. Type and UI

- **UI font:** 5×7 proportional pixel capitals (fixed 1 px spacing, 3 px space), drawn row-shaded from `color` to `color2` (top row lifted 35 % toward white), a 1 px hard drop in `#05040a` and a soft dark halo (2.2 px blur) so it reads on bright floor. Upper case only.
- **Numerals:** 6×9 high-contrast pixel digits (2 px stems, 1 px hairlines, footed 1 and 4); `big` = 2× (crit). Words (MISS, POISON) use the UI font. 1 px dilated ink outline drawn for every glyph before any fill, then a coloured additive glow behind.
- **Windows:** soft drop shadow (6 px blur, 2 px down) → frosted backdrop (scene behind blurred 2.5 px) → tinted glass gradient → diagonal sheen → 0.45 px catch-light at the top → gold hairlines → diamonds. Radius 2. Padding 4 (plates 5×3, banners 10×4).
- **Plate:** smaller, no diamonds, a gold line fading at both ends under the text; `alert` = brighter gold edge with a glow. **Banner:** a window plus two side diamonds.
- **Gauges:** rounded track `rgba(4,4,10,.62)`, 0.4 px dark-gold edge, 3-stop vertical fill, 0.5 px specular, a small light at the leading edge; `ready` / `enemyFull` pulse at 9 rad/s; status tag = a jewel diamond at the left end. Empty = faint gold dots.
- **Cursors:** tile bracket = gold corner Ls with a soft glow, tiny diamonds at the corners, a warm light pool on the tile and a floating gold marker above it; menu pointer = gold triangle with a soft halo.

## 5. Motion

- Cards: integer positions, frame-stepped (idle breath 1 px every 433 ms, staggered per unit); hits swap frames instantly.
- World: smooth. Fire flicker `1 + 0.11 sin(7.3t) + 0.06 sin(13.1t) + 0.04 sin(23.7t)` drives floor light, card light and glow together; dust drifts; overlay pulse is a smooth wave, not a threshold.
- A hit adds a short white-warm point light (233 ms) so nearby shadows jump. Hit flash on a card is an overlay ≤ 0.42 on the lit card, never a white silhouette. Shake moves only the world, never the UI.
- Timing (durations, hit-stop, event order) is never the skin's choice; the skin only decides how in-between frames look.

## 6. Camera and composition

- Fixed high 3/4 or top-down view; one focus band through the rows where the action is. Far (top) and near (bottom) rows are soft; units, overlays, numbers and UI are always sharp.
- Put one warm light near the player side, one on the enemy side and one cool accent elsewhere, so every group has a pool and a shadow direction.
- Windows float over the scene in the blurred bands (top-left, bottom-left) when possible; the glass shows the blurred world through it.

## 7. Sound

Not part of the skin. Direction for hosts: soft crackle beds for lamps, a low bell when a big light changes, short hiss on dust bursts; UI blips with a little room reverb.

## 8. Signature moves (defaults)

- **Lights cast shadows:** every point light within range lays card silhouettes on the floor (≤ 3 per card, alpha ≤ 0.72).
- **Tilt-shift band:** `post.tiltShift(ctx, 70, 176, 30, 1.8)` on the world layer before cards.
- **Dust motes:** `post.motes(ctx, rect, t, {count: 56, focusY: 120, colorAt})`: small sharp specks near the focus depth, larger soft bokeh away from it, coloured by the local light.
- **Bloom:** everything emissive (flames, lamp glass, staff orbs, crystal) also goes into an emissive layer → `post.bloom(ctx, em, 0.9, 0.7)`.
- **Glowing range:** soft tinted wash + inward glow strip (4 px) + bright hairline on the set boundary, additive.
- **Golden path:** shadowed, haloed gold ribbon with a bright core, a socket at the start, an arrowhead and three sparks travelling along it (`path()`).
- **Glass windows:** frosted dark glass, gold hairlines, corner diamonds, crisp pixel text.

## 9. Common mistakes

- **Text or sprites blurred** → they were drawn before the tilt-shift or bloom, or with smoothing on. Draw cards and UI after post, smoothing off, integer coordinates.
- **Long rectangular pixels** → non-integer canvas scale. Backing store must be an integer multiple of native; CSS-scale only for small screens.
- **Characters burnt to white near a light** → card light cap 0.3 and ambient floor 0.6; don't add raw warm light on cool cards.
- **Shadows invisible** → lights too far or too high; check the pool on the floor first, then alpha (`× 1.25`, cap 0.72).
- **Flat even lighting** → at least one cool ambient plus two point lights, each with a visible pool.
- **Overlays painted opaque** → keep fill alpha ≈ 0.22–0.24; the edge glow carries the shape.
- **Gold lines fat and blurry** → the host CSS-scaled a native-size canvas. Use the supersampled backing store.
- **Glow blobs on gauges** → the leading-edge light must stay ≤ 0.9 × bar height, alpha ≤ 0.35.

## 10. Engine / skin API notes

- `GameDNA_Skin.resolve('hd-diorama')` after `skin-api.js` and `hd-diorama.js` (spec v0.2). `pixel: true`, `native.supersample: true` (backing store = native × integer s; see Gaps in the build report). Bitmap fonts only, so `GameDNA_Skin.ready()` resolves at once.
- **Methods:** `frame` (roles `window`, `plate`, `banner`, `tooltip`, plus its own `row` = warm light band between fading gold hairlines with a small diamond, and `backing` = dark glass well; `frameRoles: ['row', 'backing']`), `text`, `measure`, `number`, `overlay`, `bar` (`opts.t` drives the ready pulse), `cursor` (`layout.handW × handH` = 7×5).
- **`number()`** draws in canonical item order (digits, suffix, label, spaces included) and returns one rect per drawn glyph with its index `i`. Glyphs that share an alpha are drawn together through `GameDNA_Skin.fadeLayer`, so the ink outline never shows through a fading fill. `sx/sy` are ignored (pixel skin); `motion.squash` is `null`.
- **`path(ctx, points, t, {tile, alpha, invalid, width})`**: the gold ribbon; `alpha < 1` goes through `fadeLayer`; `invalid` turns it into a dull red-grey ribbon (`palette.overlay.pathBad`). B-01 v1.2 calls it automatically.
- **Scene hooks:** `tile(ctx, rect, kind, t)` = pixel texture locked to world pixels (all 11 kinds; water frame-stepped at 433 ms); `token(ctx, rect, unit, t)` / `unitToken` = a 16×24 lit pixel card on the bottom of `rect` (`unit.lights` adds cast shadows and side light, `unit.noShadow` for portraits, `facing: -1` mirrors, `selected` bobs 1 px); `atmosphere(ctx, view, t, {phase, lights, ambient, focus, emissive, tiltShift, shafts, vignette})`: `'world'` = floor × light map, shafts, tilt-shift; `'final'` = dust motes, bloom of `emissive`, vignette.
- **Extras:** `skin.post.{frost, tiltShift, bloom, vignette, motes, shaft, halve, litCard, castShadows, lightAt}`, `skin.layout(str, opts)`, `skin.figure(kind, team)`, `palette.light` (light recipe), `palette.numbers`, `palette.bars`, `palette.terrain`.
- `frame()` reads back `ctx.canvas` for the frosted glass, so draw windows after the world. Every shadow blur is scaled by the current transform.
- **Frame order used by `preview.html`:** `tile` per cell → `atmosphere('world', {tiltShift: false})` → far props (lit cards + shadows) → `post.tiltShift` → threat overlays + B-01 `drawUnder` → near props → `unitToken` per unit → `atmosphere('final')` → cursor → E-01 `draw` → unit card / plate → C-01 `draw`.

- **v0.4 (critic r1 fixes):** `prop(ctx, rect, kind, t, {lights, light, seed})` draws stone, rock, tree, pine, bush, brazier, lamp and crystal as lit standing pixel cards with cast shadows. Emissive pixels (flame, lamp glass, crystal) are drawn unlit on top with a bloom halo and drifting sparks; trees get a cool moonlight rim. `atmospherePhases = ['world', 'post-props', 'final']`: tilt-shift now runs in `post-props`. Lights arrive in the standard format (SPEC §2.5) and are converted once (`skin.inLights`: intensity × 2.7, radius × 2.27). Pre-standard lights still pass through, so the scene's `ADAPT` entry can be deleted. The tile cursor is a single gold bracket with a light pool; the floating marker is gone. Ambient is raised a little so the far bank reads.

- **Critic r2 fixes:** the ambient is darker and bluer (`[0.18, 0.22, 0.46]`). Standard lights scale ×3.0 in intensity and ×2.4 in radius, and warm kinds (fire, lamp) lean 35 % toward `#ff8a40`. `atmosphere('world')` adds a saturated pool of about 2–3 tiles around each light, so every light shows a warm or cyan pool. Props are lit by their own light too. Emissive sources (flame, lamp glass, crystal) are queued by `prop()` and redrawn after the tilt-shift in `post-props`, so lamps stay sharp in the far band; the blurred band starts at y 44 at the latest. Cast shadows are soft: a half-resolution silhouette that fades toward the head, with length capped at 1.25 × the card height. The tile cursor has 1.8 px arms with a stronger glow and pool. Pop words use a 2 px letter advance.

## 11. Variation space

- **Scene:** a mine (grey shaft light from above, green ore glow), a dusk market (violet sky, paper lanterns lighting one by one), a snow camp (one fire, very long shadows).
- **Light story:** lamps lit one per turn; lightning (flash, dark, flash, decay) that makes every shadow jump at once; a key light taken away at a phase change (blink twice, ambient falls over 1.2 s, enemy light turns red).
- **View:** fully top-down (focus band becomes a horizontal strip around the cursor), or low and close for duels (narrow band).
- **Metal:** gold (default), silver for cold scenes, copper for desert or workshop. One metal per game.

## Fits which elements

| Element | Fit | Why |
|---|---|---|
| Grid movement range + path arrow, Enemy threat range | very good | glowing slabs and a gold path read clearly on a lit floor |
| Active-time gauge battle, Combat forecast window | very good | fixed camera, units on one band, spells are point lights |
| Bouncing damage numbers | very good | pixel digits with glow stay sharp over the blurred world |
| Bevelled window + pointer cursor, Big banner text, Turn-order bar | good | glass + gold hairlines; banner = window with side diamonds |
| Fog of war, Isometric height & jump | good | darkness and light pools are native to the style |
| Pseudo-3D flight ground, Multi-layer parallax | fair | keep depth blur and bloom; the floor is no longer a lit plane |
| Fast action, bullet patterns | poor | blur and bloom eat readability |

## Reviewer checklist

1. Sprites, numbers and UI text are crisp square pixels (zoom in: no soft edges); the far and near rows of the world are visibly out of focus.
2. One cool ambient and at least two warm or saturated point lights, each with a visible pool on the floor.
3. Units and props cast soft shadows whose direction matches the nearest lights; contact shadows under every unit.
4. Bloom around lamps, fire and magic; a vignette; the darkest areas are warm ink, not pure black.
5. Dust or bokeh in the air; two screenshots a second apart differ in light flicker and motes.
6. Windows are dark frosted glass with gold hairlines and corner diamonds; the scene shows through blurred.
7. Range overlays glow at their boundary and leave the floor texture visible inside; the path is a gold ribbon with an arrowhead.
8. No card burnt to white; every number readable over light and dark floor.
9. Same seed and `?t=` give the same events as every other skin; only the look changes.
10. Original art, English UI, no real game names or motifs.

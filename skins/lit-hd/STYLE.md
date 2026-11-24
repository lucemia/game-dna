# Lit HD 2D (`lit-hd`)

> Smooth, hand-painted-looking HD 2D at dusk, lit by real-time light: a continuous painted ground, soft-shaded small figures rim-lit by the nearest lamp or fire, ranges whose rims glow, and soft rounded dusk-glass windows with an inner glow and clean Marcellus / Figtree type. The skin is designed to sit under the M9 light stack (I-08 post, J-01 lights with soft shadows, J-03 bloom, optionally J-06 grade); without WebGL it paints its own unlit stand-in and still looks finished.
> Skin file: `lit-hd.js` (registers `lit-hd` with `GameDNA_Skin`). Preview: `preview.html` (`?t=ms&freeze=1`, `?webgl=0`, `?lut=0`, `?bloom=0`, `?shadows=0`). Original art; no real game, character or interface is referenced.

## 1. Essence and what it is not

- **A painted world that light falls on.** Everything is smooth vector or smoothly interpolated paint at device resolution. There is no pixel grid anywhere: not in the ground, not in the figures, not in the type.
- **Light is a separate layer, not baked in.** The art is painted in mid-tones so a real-time light map (J-01) can darken it to dusk and lift it in warm pools; things that *are* lights (flames, lamp glass, crystals, staff orbs, undead eyes, the move arrow, the map cursor, range rims) are recorded as **emissive** so bloom (J-03) makes them glow.
- **UI is crisp and unlit.** Windows and numbers are excluded from light, bloom and grade through the shared `uiMask`; they read like a modern indie HUD floating over a lit world.
- **Not:** pixel art or an HD pixel diorama (`hd-diorama`: pixel cards, pixel fonts, gold-hairline metal glass, tilt-shift); flat vector (`flat`: no light, pastel, white cards); a photo-real 3D render; a blur over everything; a dark, unreadable "moody" screen.

## 2. Material and drawing

- **Canvas:** native 256×224, `scale: 'fit'`: the backing store is display px (× dpr), `ctx.setTransform(s,0,0,s,0,0)`. All shapes are anti-aliased paths; hairlines use `1/scaleOf(ctx)`.
- **Ground:** each tile samples a low-frequency colour field (two octaves of value noise at world position, plus warm dry-grass patches) on a padded 10×10 texel grid and draws it with bilinear smoothing, so neighbouring tiles join without a seam: one continuous painted field. On top: 7 elongated low-alpha brush dabs per tile and up to 3 grass tufts (three curved blades, dark root → light tip, light from the upper left), rare tiny flowers. Water is the same field with a moving offset, soft curved glints and a blinking sparkle.
- **Figures (units, props):** drawn into an offscreen layer at device resolution, then **(a)** a soft dusk tint (2D fallback only), **(b)** a rim of the nearest light's colour on the side facing it (linear gradient, `source-atop`, strength by distance, ≤ 0.7), **(c)** ground occlusion at the feet; then composited. Units are ~11×21 native: legs, a body by kind (plate, leather, robe, ragged wraith robe), a tabard in team colour, head with helmet / hood / hair / horns, weapon (sword + round shield, staff with glowing orb, axe, bow). Living eyes dark; undead eyes glow.
- **Props:** mossy boulder, clustered leaf-blob bush with berries, layered-canopy tree (sways gently), iron brazier with three nested teardrop flames and rising sparks, post lantern with lit glass, faceted cyan crystal cluster.
- **Shadows:** a soft radial contact shadow under every figure; in the 2D fallback also a short soft cast shadow away from the nearest light. Under J-01 the cast shadows come from the light map (footprints handed over as occluders).

## 3. Colour

- **Dusk, two temperatures.** Painted ground in mid greens (`#56844a`–`#7ca658`, dry `#96a05c`); water pre-shifted green-teal (`#166854`–`#3a9a78`) so it stays teal under the cool ambient. Lights under J-01: brazier `#ffa24a`, lamp `#ff8a3a` (small), crystal `#3fd0ff` (cool pool reaching past the range onto bare grass; deep cyan body), magic `#c890ff`. J-01 ambient 0.34 with a cool blue-teal tint `#9cbcd6` (not the violet `dusk` preset: it turns teal water navy); J-06 `dusk` at 0.3.
- **Pools read as coloured light.** Warm light on green grass goes lime; the skin pulls the floor under warm lights toward amber (a multiply in the `world` phase) before J-01 lights it, and in the 2D fallback each pool is an additive skirt plus a multiply toward the light's hue.
- **Ink** `#130f1d` (plum black), never `#000`. **Accent** amber `#ffc46b` with ember `#ff8a4c`; **cool accent** `#8fdcff` (notes, MP).
- **Teams:** a azure `#4f8cff` (light `#a9c8ff`, dark `#1f3a78`), b rose-crimson `#e0566a` (light `#ffb3bd`, dark `#5e1a2e`), n `#9a96a8`.
- **Overlays** (wash alpha, glowing rim): move `#4f9bff` .30, attack `#ff3d64` .30, threat `#a86cff` .24, heal `#3fd894` .28. Attack is pushed toward rose so it stays red under warm light.
- **Numbers** (top → bottom, glow): damage `#fff` → `#ffe0c0`; crit `#fff8d0` → `#ffa63a`, glow `#ffb347`; heal → `#48dc8a`; MP → `#5aa8ff`; status → `#a872f0`; miss grey, no glow; CRITICAL label `#fff3cc` → `#ffad42`.

## 4. Type and UI

- **Fonts (Google Fonts on documentation pages; games fall back to Georgia / system-ui):** **Marcellus** (serif) for window titles, plates and banners; **Figtree** for UI (600, 7.2 native px), small notes (700) and numerals (800, 11.5 px). Labels: Figtree 800, upper case, +0.7 tracking.
- **Text:** soft drop shadow (blur 1.6, dy 0.6, `rgba(6,4,16,.8)`), optional top-to-bottom gradient (`color` → `color2`). No outline on UI text.
- **Windows:** wide soft shadow (blur 9, dy 3) + tight contact shadow → dusk-glass gradient (team-tinted: a navy, b wine, n slate) → **inner glow**: a warm radial pool under the top edge and a cooler team glow from the lower left → faint painted grain → dark outer rim, a bright inner bevel line at the top fading down, and a **team-coloured light leak** running along the top-left corner. Radius 5, padding 5.
- **Plate / banner:** pill-shaped; banners carry two small ember lights at the ends. `alert` / `focus` = a glowing outer ring.
- **Selected row:** an amber light band fading to the right, a lit hairline, and a soft warm bloom at its left end (no bar: a bar next to the label reads as a text caret).
- **Gauges:** inset rounded track, horizontal gradient fill, glossy top highlight, a **glowing tip** at the fill end (pulses when `ready` / `enemyFull`); haste / slow = two lit chevrons.
- **Numerals:** each glyph has a soft dark outline (2.3 px, ×√1.42 on crits) with a drop shadow, a top-lit vertical gradient, and a coloured glow behind (crit, heal, MP, status). Crits ×1.42; MISS / status ×0.74.
- **Cursors:** map bracket = four soft amber corner arcs that breathe outward (0.9 Hz) over a faint light pool; menu pointer = a glowing amber leaf with a white-hot core that nudges right (1.2 Hz).

## 5. Motion

- Smooth, eased, never stepped (`stepMs: 0`): `outCubic` moves, `outBack` pops and window opens, `outQuad` fades. Landing squash `{x: 1.16, y: 0.86, ms: 80}` per glyph.
- Living world: figures breathe (2.5 % at 0.55 Hz), the selected unit bobs (0.9 Hz) on a lit ring, flames sway and sparks rise, trees sway, water glints drift, motes rise around each light, range rims get a slow diagonal sheen, two light comets travel the path every 1.6 s.
- All motion reads the module / scene clock `t`; nothing uses wall time or `Math.random`. Timing is never a skin choice.

## 6. Camera and composition

- Fixed top-down three-quarter view; figures stand on their cell's bottom edge, props rise up to one cell. Depth comes from light and shadow, not from blur.
- Keep 2–4 lights on screen, one dominant warm light near the action and one cool accent; leave dark space between pools so the light reads.
- HUD in the corners, never over the lit focal point; numbers float above heads, crisp.

## 7. Sound (guidance for hosts)

- Soft, warm and close: crackling fire loops near braziers, a glassy chime on cursor moves, a low felt thump on window open, bright bell layers on crits. Nothing chiptune.

## 8. Signature moves (defaults)

| move | default |
|---|---|
| Continuous painted ground | value-noise field at world position, 34 px + 11 px octaves, 10×10 padded texels per tile, bilinear |
| Rim light | nearest light within 2.4 r, strength `s = intensity × (1 − d / 2.4r)`: a 1-native-px silhouette edge band on the side facing it (light colour lifted 35 % to white, alpha 0.45 + 0.9 s, ≤ 0.9) over a faint facing-side wash (≤ 0.3) |
| Form shadow | a 1.1-native-px dark edge band (`#140a26`, 0.42) on the side away from the upper-left key, on every figure and prop |
| Lit stack | I-08 `filmic` (vignette 0), J-01 ambient 0.34, tint `#9cbcd6`, softness 3 native px, samples 4, blur 1.2 native px, glow 0.45, over 0.3, emissive 0.86, wallLight 2 native px; light radius = scene r × (fire 2.7, lamp 1.15, crystal 3.3, magic 2.0), intensity base (1.25, 0.6, 1.15, 0.85) + 0.6 × scene intensity, colours (`#ffa24a`, `#ff8a3a`, `#3fd0ff`, scene) |
| Warm floor pull | `world` phase under J-01: multiply `#ffb070` at 0.6 → 0 over 1.8 r (lamp 1.3 r) around warm lights |
| Bloom | J-03 `source: 'emissive'` (lit grass and ranges never bloom by brightness), threshold 0.8, knee 0.5, intensity 1.5, radius 0.72, tint `#ffe6c8`, emissive gain 1.9 |
| Grade | J-06 `dusk`, strength 0.3 (higher turns the river slate blue), vignette 0.36, grain 0.018, `builtin: 'replace'` |
| UI mask | windows as rounded rects, numerals as glyph silhouettes eroded inside their outline (stroke 0.55 × outline width, 0.5 px blur: no unlit fringe), one shared `uiMask` canvas |
| Glowing range rim | 0.7 px edge line + 3.5 px inward glow strip, emissive line at alpha 0.42; the wash is flat, glow strips sit only on true set edges, no inner seams, and each cell is snapped to whole device px, so a set has no inner brightness steps |
| Path | dark casing → amber body → light core → white-hot 0.04-tile core; halos 0.62 / 0.36 tile; two comets per 1.6 s |
| 2D fallback | multiply wash `#7f8cc0` at 0.55; pools 2.0 r (lamp 1.5 r), additive at 0.62 (warm colours pushed 45 % to ember) plus a multiply toward the light's hue; figure tint `rgba(40,40,92,.22)`; vignette 0.55 |

## 9. Common mistakes

- **Uploading UI into the light.** Without the `uiMask`, J-01 darkens the menu to 44 % and bloom smears white text. Give every J module the same mask.
- **Rect masks around numbers.** A padded rect leaves a visible ungraded box around each numeral; mask the glyph silhouettes (`lit.drawUiMask`).
- **Redrawing whole sprites into the emissive layer.** Only the light-emitting part glows (flame, orb, eyes, glass); a whole unit there becomes a pale blob.
- **Overwriting the emissive context's transform.** J-03's `emissive()` context maps canvas px to its own layer size; replay with `ctx.scale(s, s)` on top, never `setTransform` (glows land in the wrong place, as faint ghost lines).
- **Light counted twice.** When J-01 / J-03 run, set `skin.lit.post` / `skin.lit.bloom` so the skin drops its 2D wash and pools and tones its halos down.
- **Painting the art dark.** The ground and figures are mid-tone on purpose; the light map makes the dusk. Pre-darkened art turns to mud under ambient 0.44.
- **Saturated blue water.** J-01's violet `dusk` tint and the `dusk` LUT both push blue toward navy / lilac; use a cool blue-teal ambient tint and paint water green-teal.
- **Lime pools, daylight centre.** Warm light multiplied onto green grass goes chartreuse, and a high ambient with large radii reads as daylight in a vignette. Keep the ambient low and cool, the lamp small, and pull the floor under warm lights toward amber.
- **Luma bloom on a lit floor.** With `source: 'both'` the lit grass and range washes bloom into milk; bloom only what the skin records as emissive.
- **Pixel snapping** or nearest-neighbour scaling anywhere: this is an HD style.

## 10. Engine and skin API notes

- **Methods overridden:** `text`, `frame` (all roles, `row` and `backing` in `frameRoles`), `number`, `overlay`, `bar`, `cursor`, `path`, `tile`, `prop`, `unitToken`, `atmosphere` (`world`, `final`). `measure` is the generic canvas one.
- **The `lit` bridge** (on the registered skin, `GameDNA_Skin.get('lit-hd').lit`), which SPEC v0.5 has no slot for:
  - `begin()` before each frame; `post`, `bloom` booleans set by the host from `lights.active` / `bloom.active`; `recording` (false for off-scene drawing such as a skin sheet).
  - `lights`: the standard lights the scene handed to `atmosphere` / `prop` / `unitToken` this frame (native px).
  - `occluders`: footprints (native px) of units, stones, bushes and trees, for J-01 `rects` (light carriers are not occluders).
  - `emissive` + `drawEmissive(ctx, s)`: glow / dot / line / ring / flame records in native px, replayed into J-03's `emissive()` context.
  - `ui` + `drawUiMask(ctx, s, canvas)`: framed windows and numeral glyphs drawn on `canvas` (records from off-screen measuring canvases are skipped), painted as a white-on-black mask.
- **Reference wiring** (copied from `preview.html`; `cv` = the game canvas, `S` = canvas px per native px, `clock` = game ms). Two things a host must keep: **draw the first frame again after `makeStack()`** (the first one was drawn before `lit.post` / `lit.bloom` were known, so it carries the 2D wash), and keep **stable light ids** so `lights.add()` updates instead of adding a new light every frame. The preview uses `renderNow()` so `?t=&freeze=1` screenshots get the post frame at once; a game loop can call `post.render()`.
  ```js
  var Q = new URLSearchParams(location.search), FREEZE = Q.get('freeze') === '1', T0 = Q.has('t') ? +Q.get('t') : 1400, LOOP = 4000;
  var SK = GameDNA_Skin.resolve('lit-hd'), LIT = SK.lit, P = SK.palette;
  var cv = document.getElementById('scene'), curT = T0, S = 3, info = null, post = null, lights = null, bloom = null, grade = null;
  var clock = function () { return curT; };
  /* ---------- the HUD mask (shared 'uiMask' input): windows, plate and numbers stay crisp, unlit and ungraded.
     The skin records what it drew as UI (framed windows as rounded rects, numerals as soft glyph silhouettes), so the
     mask hugs the glyphs and no ungraded box shows around a number. One canvas, read by every pass. ---------- */
  var mask = document.createElement('canvas');
  function paintMask() { if (mask.width !== cv.width || mask.height !== cv.height) { mask.width = cv.width; mask.height = cv.height; } return LIT.drawUiMask(mask.getContext('2d'), S, cv); }

  /* ---------- the light stack: one I-08 instance shared by J-01, J-03 and J-06 ---------- */
  function makeStack() {
    if (!window.GameDNA_Post) return;
    paintMask();
    post = GameDNA_Post.create({ canvas: cv, clock: clock, skin: SK, params: { passes: 'grade+pulse', look: 'filmic', vignette: 0 } });
    post.setInput('uiMask', mask, { filter: 'linear', live: true });
    lights = GameDNA_Lights.create({ canvas: cv, post: post, clock: clock,
      rects: function () { return LIT.occluders.map(function (r) { return { x: r.x * S, y: r.y * S, w: r.w * S, h: r.h * S }; }); },
      params: { ambient: 0.34, tint: '#9cbcd6', shadows: 'on', softness: 3 * S, samples: 4, blur: 1.2 * S, glow: 0.45, over: 0.3, emissive: 0.86, wallLight: 2 * S } });
    bloom = GameDNA_Bloom.create({ post: post, clock: clock, uiMask: mask, params: { source: 'emissive', threshold: 0.8, knee: 0.5, intensity: 1.5, radius: 0.72, tint: '#ffe6c8', emissiveGain: 1.9 } });
    if (Q.get('lut') !== '0') grade = GameDNA_ColorGrade.create({ canvas: cv, post: post, clock: clock, uiMask: mask, skin: SK,
      params: { preset: 'dusk', strength: 0.3, vignette: 0.36, grain: 0.018, builtin: 'replace' } });
    if (Q.get('bloom') === '0' && bloom) bloom.setEnabled(false);
    if (Q.get('shadows') === '0' && lights) lights.setParams({ shadows: 'off' });
    LIT.post = !!(lights && lights.active); LIT.bloom = !!(bloom && bloom.active && Q.get('bloom') !== '0');
  }
  // scene lights (recorded by the skin from the scene's standard lights) -> J-01 lights in canvas px
  function syncLights() {
    if (!lights || !lights.active) return;
    LIT.lights.forEach(function (l, i) {
      // per kind [radius x native r, base intensity, colour override]: a small amber lamp, a big warm brazier, a clearly cool
      // crystal. Stable ids ('scene-' + i) make add() update the same light every frame; the scene already animates flicker.
      var K = { fire: [2.7, 1.25, '#ffa24a'], lamp: [1.15, 0.6, '#ff8a3a'], crystal: [3.3, 1.15, '#3fd0ff'], magic: [2.0, 0.85, null] }[l.kind] || [2.4, 1, null];
      lights.add({ id: 'scene-' + i, x: l.x * S, y: (l.y - (l.h || 16) * 0.3) * S, radius: (l.r || 40) * K[0] * S, color: K[2] || l.col,
        intensity: K[1] + 0.6 * (l.intensity == null ? 0.5 : l.intensity), flicker: 0, shadows: true });
    });
  }

  /* ---------- one frame ---------- */
  function frame(T) {
    curT = T; var dpr = window.devicePixelRatio || 1, width = Math.max(256, Math.round(cv.clientWidth * dpr));
    LIT.begin();
    info = GameDNA_Scene.draw(cv, 'lit-hd', T, { width: width });
    S = cv.width / 256;
    if (!post) { makeStack(); if (LIT.post) { LIT.begin(); info = GameDNA_Scene.draw(cv, 'lit-hd', T, { width: width }); } }
    if (post && post.active) {
      syncLights(); paintMask();
      if (bloom && bloom.active) LIT.drawEmissive(bloom.emissive(), S);
      post.renderNow();
    }
  }
  ```
  All four modules are loaded unchanged from `elements/<id>/module/`. With `?webgl=0`, `--disable-webgl` or no `GameDNA_Post`, every module is a no-op, `lit.post` stays false and the skin's own 2D mood shows.
- **Cost (headless Chromium 1.65 / SwiftShader, 818×716 canvas, 2026-11-16, rough):** the 2D scene plus skin sheet ≈ 14 ms per frame; with the full stack ≈ 29 ms (I-08 `avgMs`, light map + 12 passes). A real GPU is many times faster on the pass part; drop J-06 and J-01 `samples` to 2 on weak devices.
- **Determinism:** every record and every animation reads `t`; the light map, emissive layer and mask are rebuilt from the frame's drawing, so `?t=&freeze=1` is the same every run (±1 per channel between GPUs).

## 11. Variation space

- **Time of day:** ambient 0.3 + `night` LUT (lamps dominate), 0.6 + `neutral` (golden afternoon), 0.85 + bloom `source: 'emissive'` (day: lights become accents).
- **Biome:** swap the ground ramps (snow, sand, cave floor) and light colours; keep mid-tone values.
- **Warmth of the UI:** amber accent → cool silver-blue (`#bcd8ff`) for a colder setting; keep the inner glow and light leak.
- **Figure scale:** 1.25× figures on 20 px cells for a closer camera; the rim and AO logic is scale-free.
- **Combat beat:** J-06 `combat` blend on battle start, `bloom.flare(0.6)` on crits, I-08 `pulse` on heavy hits.

## Fits which elements

| Element | Fit | Why |
|---|---|---|
| Grid movement range + path, threat range | very good | glowing rims and a light-ribbon path read on any lit floor |
| Dynamic lights, bloom, colour LUT, WebGL post (J-01, J-03, J-06, I-08) | very good | the style is built to show them: emissive records, occluders and a UI mask come for free |
| Damage numbers, modern damage numbers | very good | crisp masked numerals with soft shadows and glow |
| Window + pointer, springy UI, combat forecast, upgrade draft | very good | dusk-glass panels with inner glow are the reference modern-indie HUD |
| Weather particles, camera director, verlet cloth | good | smooth motion and soft light match |
| Fog of war, iso height map | good | darkness and light pools are native |
| Pixel scaler, pixel font, palette swap, 4-shade handheld | poor | the style has no pixel grid |

## Reviewer checklist

1. No pixel grid anywhere: zoom in on ground, figures, type and numbers; all edges are smooth.
2. The ground reads as one painted surface: no visible tile seams, colour drifts across cells, tufts and dabs vary.
3. WebGL on: a dusk ambient with at least two visible warm light pools (amber, not lime) and one cool one, dark space between them, teal (not navy) water; at least one soft shadow wedge from a unit or prop; flames, crystal, lamp glass, orbs and undead eyes bloom.
4. WebGL on: windows, plate and numbers are exactly as crisp and bright as with WebGL off (no light, no bloom, no grade on them) and there is no ungraded box around any number.
5. WebGL off (`?webgl=0` and `--disable-webgl`): the page shows the 2D fallback (dusk wash, pools, halos, vignette), no errors, nothing missing.
6. Figures are rim-lit on the side facing the nearest light and grounded by a soft contact shadow.
7. Range overlays keep the floor texture visible inside and glow at the set's rim; attack still reads red under warm light; the path is a light ribbon with travelling comets.
8. Windows: soft rounded dusk glass, inner warm glow, team light leak top-left, Marcellus titles, Figtree items; selected row is a warm light band.
9. 500 px and 390 px layouts: no horizontal overflow, numbers and menu still readable.
10. Same seed and `?t=` give the same events as every other skin; two runs of the same `?t=&freeze=1` match. Original art, English UI, no real names.

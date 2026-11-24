# L-05 Material & normal maps

## 1. What it is

Generated painted sprites (L-00 and the other L elements) are flat pictures: a lantern passing a well lights it exactly as much on the side facing away as on the side facing the light, so the sprite reads as a paper card stood in the scene. This element gives every such picture a **derived normal and material map** and draws it **lit by the game's own lights**, without generating anything new:

1. **Derive** (build time, `tools/assets/normalmap.py`, Python + Pillow, pure-Python maths so the bytes are the same on every machine):
   - **dome**: the alpha distance field (distance from each opaque pixel to the nearest transparent one, image border = transparent unless `cut: "bottom"`), its ridges softened by a masked blur, bent into a quarter circle of radius R (auto: 0.7 × the 98th-percentile distance): every silhouette edge rounds over like a rounded volume;
   - **relief**: the painting's luma minus a wide masked blur of it (local light and dark only, so dark cloth is not "lower" than a bright face), `detail` px deep;
   - **normal** = Sobel of the height in px; **occlusion** = height below its 6 px blur (× 18, strength 0.8: creases, folds and the parts behind an overhang darken); **gloss** = per-sprite `gloss` × the brighter painted areas.
   - **Pack** into one opaque, lossless RGB file twice as wide as the picture ("nh2": left half normal xyz with +y up, right half height / occlusion / gloss). Opaque on purpose: browsers premultiply alpha on decode, which would erase channels stored next to alpha 0.
2. **Record**: `normalmap.py build assets.json` writes the map, its `sha256`, `w`, `h`, the `albedoSha256` it came from, `layout` and the exact `params`; `assetcheck.py` checks it (new `normalmap` rule): opaque, 2w × h, albedo sha unchanged, unit-length normals with z ≥ 0, flat outside the mask, and **re-derives** the map from the albedo and compares pixels (max difference ≤ 2 on ≤ 1 % of pixels; 0 / 0 in the pack).
3. **Light** (`GameDNA_NormalMaps`, 2D canvas, no WebGL): per sprite, drawn device size and light colour it caches five small canvases (albedo × max(0, ±nx), ±ny, +nz with a gloss sheen) and a flat-colour layer; each frame it draws the ambient base (× occlusion) and, for the key light and the 3 strongest point lights in reach, 2–4 layers with `'lighter'` and alpha = the light direction's components × smooth attenuation (+ 15 % wrap); edges turned toward a light also catch its colour (rim 0.4). `flash` whitens the sprite's own silhouette (hurt frames) without the old drawing. The total added light is capped (`maxLight` 1.3 × the painted colour) so many lights never wash a sprite out; caches are built at the device size and drawn on whole device pixels, so a lit sprite is as sharp as the plain picture. **J-02** lights the same maps per pixel in WebGL.

The sample pack is 8 existing pictures (L-00 herbalist, keeper, lamppost, well, vial, key; L-02 portrait maren; L-06 item slot), byte-identical copies with their original provenance, plus `lamppost-off` (one Codex edit of the L-00 lamppost with the lantern out, so a game can keep showing an unlit state), and 9 maps: 488 KB. The **regenerate** layer makes one new sprite for the designer's game with the L-00 rules (style lock with even, neutral light) and runs the same script.

## 2. Default parameters

| parameter | default | meaning |
|---|---|---|
| `strength` (derive) | 0.8 | silhouette rounding: height = 0.8 × R at the centre (0.4 flat … 1.2 very round) |
| `dome` (derive) | auto = 0.7 × p98 of the distance field | rounding radius R in px |
| `detail` / `grain` (derive) | 2.5 px / 1 px | relief depth from the painting's local light and dark / its softening blur |
| `ao` / `aoRadius` / `aoScale` / `gloss` / `cut` / `floor` (derive) | 0.8 / 6 px / 18 / 0.25 / "" / 0.08 (the lowest 8 % of a standing subject, its painted contact shadow, eased to flat ground; 0 for icons and busts). `v: 3`; maps recorded as v2 use floor 0, v1 (no `v`) also the old occlusion 0.6 / 4 / 10 | occlusion strength / gloss amount (0 cloth … 0.6 metal, glass) / `"bottom"` for busts cut by the frame |
| `ambient` (module) | 0.7 | light where no light reaches (day 0.8 with a 0.25 key light = as bright as the host world; dusk 0.45–0.55; night 0.2–0.35) |
| `key` (module) | `{x: -0.55, y: 0.6, z: 0.6, intensity: 0.35, color: '#fff3e0'}` | directional sun / moon (vector to the light, y up); `false` = none |
| `lightZ` / `wrap` / `rim` / `maxLights` / `maxLight` | 48 px / 0.15 / 0.4 / 3 / 1.3 | default light height / share that reaches the whole sprite / rim strength / point lights per sprite / exposure cap |
| demo | lit view; the keeper walks and carries the warm lantern (the painted lanterns of keeper, lamppost and well are the lights, plus a spirit wisp); ambient 0.18, radius 260, height 34, strength 1.8, wrap 0.12, rim 0.6, maxLight 2; the carried lantern stays warm (the colour buttons set the pointer light); cold moon key (0.95, `#5f7dff`, from the right) | `?view=lit|flat|split&light=walk|pointer&color=warm|moon|spirit&ambient=&radius=&height=&strength=&key=on|off&extra=on|off&asset=<key>`; `?t=&freeze=1`; `?normals=0` |
| `{{subject}}` / `{{ambient}}` / `{{lights}}` (regenerate prompt), `{{targets}}` (pack prompt) | see `element.json` `promptParams` | |

## 3. Variants

- **Night village, keeper carries the lantern** (default): the keeper walks along the lane past the lamppost and the well, always to the right (he leaves at the right edge and comes back in at the left; the herbalist watches from the left end: neither is ever mirrored); light comes from the painted lanterns (keeper, lamppost, well) and a spirit wisp under the far oak, under a cold moon from the right.
- **Same lights without maps** (`?view=flat`): every sprite lit as a card facing the viewer (Lambert with n = (0, 0, 1), same wrap): no side darker than the other. **Split sprites** (`?view=split`): every sprite cut down its middle, left half flat card, right half normal-mapped.
- **Low lantern, no moon** (`?key=off&extra=off&height=20&ambient=0.25`): grazing light that only catches the rims turned toward it.
- **Spirit light** (`?color=spirit`): the carried light in cyan-green; the cached basis is per colour.

## 4. Interface

**Needs:** `GameDNA_Assets` (L-00) loaded first and the boot moved into its `onReady`; the albedo and its `<key>-nh` map in the same list (the albedo's `normal` field or the `-nh` convention links them); every draw site of the replaced things (feet point, drawn height, facing); the game's light sources in the same coordinates as the draw calls, from game state and the game clock. The page must be served over http(s): a `file://` page cannot read image pixels (sprites then draw unlit, `stats().reason` says so, nothing throws).

**Provides:** `GameDNA_NormalMaps.create({assets, lights, ambient, ambientColor, key, lightZ, strength, wrap, maxLights, maxLight, sizeStep, smoothing})` → `nm`; `nm.draw(ctx, key, x, y, {h, w, scale, flip, alpha, anchor, lights, ambient, key, normals: false, lit: false}) → bool` (false only when the albedo is missing); `nm.has(key)`, `nm.why(key)`, `nm.maps(key)` (normal / height / ao / gloss canvases), `nm.sample(key, x, y)`, `nm.setLights`, `nm.set`, `nm.params`, `nm.stats()`; `GameDNA_NormalMaps.instances()`. Tools: `normalmap.py derive | build | check | preview`, the `assetcheck.py` `normalmap` rule, `checks/litcheck.py` (is the lighting wired in a game?), judge probe `judge/probes/normal-maps.js`.

## 5. Screen rules (exact numbers)

- A lit sprite occupies exactly the rect the plain `GameDNA_Assets.draw` would (same anchor, `h`, `flip`), snapped to whole device pixels with the feet line kept; it is never blurrier than the plain picture (caches at device size, `imageSmoothingQuality` 'low' like a plain `drawImage`).
- Ambient base = albedo × `ambient` × (0.35 + 0.65 × occlusion). Each point light: attenuation `a = s(1 − d / radius)` (smoothstep), d = distance from the light to the nearest point of the sprite box; direction from the sprite centre to `(x, y, z)`, y up. Added light per light = `a × intensity × strength × (0.15 wrap + Σ |direction component| × basis)`, basis = albedo × max(0, n·axis) + gloss sheen + rim (`rim × n_axis² × (1 − nz)` of the light colour). A flat card (`normals: false`) gets the same light energy spread evenly: `a × intensity × strength × (wrap + Σ |v_axis| × mean(basis_axis) / mean(albedo))`, base × mean occlusion, so lit and flat have equal average brightness and differ only in where the light lands.
- Ambient + added light ≤ `maxLight` (1.3) × the painted colour, estimated per sprite; above it every light of that sprite is scaled down by the same factor (direction contrast kept).
- At most `maxLights` (3) point lights per sprite (strongest first) + the key light.
- Pictures and light only: no hit box, rule, input or timer changes; output depends only on the inputs (`?t=&freeze=1` byte-identical between loads, `?normals=0` = the plain pictures).
- Maps: opaque nh2 file, 2w × h, lossless WebP; normals unit length within 0.03 (8-bit), z ≥ 0; outside the mask (128, 128, 255) / (0, 255, 0).

## 6. Common mistakes (symptom → fix)

- Sprite draws unlit in the browser but lit in tests → the page is opened as `file://`; serve it over http.
- Lit sprite blurrier than the plain one → an old module (< 1.0.0) or a context transform that is not axis-aligned; keep `smoothing: 'low'` and an axis-aligned transform.
- Sprite washed out to cream / white near a lantern → several strong lights at a day ambient; lower `ambient` or intensities (the cap keeps it at 1.3 ×).
- The lantern lights the wrong side → lights in screen px while the sprite is drawn in world px (or the reverse), or the light's y is the feet instead of the lantern height; use the same coordinates as the draw call.
- Light pops when the light crosses the sprite → `z` too small (a light at sprite level flips the whole direction); use 20–60 px.
- A raised, rim-lit pad under the feet → a painted contact shadow; `floor` 0.08 (default) eases it flat; new art: "no ground, no cast shadow".
- Bust or prop cut by the frame gets a bright rounded rim along the cut → derive with `cut: "bottom"`.
- Unlit checkpoint shows a lit lantern / a ghost post → the picture has only one state; use `lamppost-off` for the unlit state (or keep the old drawing), never `alpha` to fake it.
- Two characters look identical → one picture used for both; one picture per character.
- The old sprite shows through during hurt frames → the old drawing was used as the flash; pass `flash` instead.
- Painted NPCs darker than the bright host world → daylight ambient too low; use 0.8 with a 0.25 key light.
- Map rejected by assetcheck (`albedoSha` false) → the albedo was re-exported after the map was derived; run `normalmap.py build` again.
- Map looks blank or shifted in WebGL → sampled the whole packed texture; normal at `u × 0.5`, material at `0.5 + u × 0.5`, y up.

## 7. Acceptance moments (what to screenshot, what must be visible)

- `?t=5200&freeze=1&view=split` (`shots/01-split-sprites.png`): each sprite's left half flat, right half with lit bevels and rims.
- `?t=5200&freeze=1` (`02`): the keeper's lantern side warm, edges toward the moon blue, the well's stones and roof bevelled; vs `?view=flat` (`03`): per sprite box 35–50 / 765 mean difference, 40–48 % of sprite pixels change by > 30 (`checks/measure.py`).
- `?t=9000&freeze=1&view=lit&extra=off&key=off&height=20&ambient=0.25` (`04`): grazing light, rims only.
- `#sec-maps` with `asset=keeper|maren|well` (`08`–`10`): albedo, normal, height, occlusion, gloss of the shipped file, and a flat-card vs normal-mapped pair under one circling light.
- `shots/20`, `21`, `23`, `24`: pack layer in hd-topdown (keeper / herbalist NPCs lit by the hero's lantern and wisps) and hd-sidescroll (herbalist scout and checkpoint lampposts lit by the hero's lantern and lit checkpoints), plain vs lit crops; `shots/22`: regenerate trial (a generated courier hero with its derived map); `shots/25`: an inactive checkpoint drawn with `lamppost-off`.
- Phone 390 and 500 px (`12`, `13`): no horizontal scroll; the map grid wraps to 3 columns, the pair to 1.

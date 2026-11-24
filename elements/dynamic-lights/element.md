# J-01 Dynamic 2D lights & soft shadows

## 1. What it is

Real-time 2D lighting for games that draw on a plain 2D canvas, built on the I-08 post pipeline (`webgl-post`). The game keeps drawing exactly as before. The module keeps a list of lights:
- **point lights** with a soft, roughly inverse-square falloff and a colour;
- **spotlights** (cones with a soft edge, aimed by an angle, a direction word or a function);
- **follow lights** that ride on an actor every frame: the hero's torch, a glowing projectile, a firefly. They disappear when the actor's callback returns `null`;
- **flashes**: short lights that fade out in game time (explosions, spell casts, impacts, kills);
- deterministic **flicker** from the game clock and the light's id.

Walls and obstacles **cast soft shadows**. The game supplies occluders as a solid-tile callback (`solidAt(tx, ty)` + tile size) and / or rectangles. The module turns them into boundary edges (merged runs), and for each light draws the shadow polygons of the edges that face it. It does this from several points of a small area light, so shadows have a penumbra that widens with distance. Light enters each occluder by `wallLight` px, so wall faces and platform tops toward a light are lit.

Every post frame the light map (≤ 400 px on its longest side) is painted on CPU 2D canvases and uploaded as an input of three I-08 passes at order 200: two half-resolution blur passes and the composite. The composite is `picture × min-ish(ambient × tint + light)` with a soft headroom of `over` above the art's own colour, plus a glow haze that fades on bright scenes. **HUD pixels stay unlit**: `uiRects` are rasterised into the shared `uiMask` input, and the pass outputs the incoming pixel there. Without WebGL, with `?webgl=0`, with `?lights=0`, or without `webgl-post.js`, nothing is drawn and the game looks exactly as before. Game logic never depends on it.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `ambient` | 0.55 | 0–1 | Brightness where no light reaches (dusk). Guide: day 0.85–0.95, dusk 0.5–0.6, night 0.25–0.35, dungeon 0.12–0.2 |
| `tint` | dusk | dusk, night, cave, warm, neutral, #rrggbb | Ambient colour, normalised to luma 1 |
| `shadows` | on | on, off | Occluders cast shadows |
| `softness` | 5 px | 0–16 | Area-light radius: penumbra width |
| `glow` | 0.35 | 0–1.2 | Additive haze ∝ light², × (1 − ambient) |
| `flicker` | 0.25 | 0–1 | Prompt default for the hero torch (per light: 0.15 lantern, 0.3 torch, 0.35–0.4 brazier) |
| `bands` | 0 | 0, 3–8 | Banded light per game pixel (retro) |
| module-only | | | `intensity` 1, `radius` 0 (= 35 % of the shorter side), `color` #ffc58a, `samples` 3, `wallLight` 4 px, `blur` 1.5 px, `over` 0.25, `emissive` 0, `fade` 300 ms, `maxLights` 32, `mapScale` 0 (auto), `bandPx` 1, `farLight` 0.2 (with `markFar()`), `lights` on/off |

## 3. Variants

- **Dusk** (default): ambient 0.55, violet-grey tint; lights read as warm pools without hiding the level.
- **Torch-lit dungeon**: ambient 0.15, night tint, glow 0.45, flicker 0.3; the torch and braziers carry the scene.
- **Moonlit night**: ambient 0.3, night tint.
- **Day accents**: ambient 0.9, warm tint, glow 0.15; lights only accent fires and magic.
- **Retro banded light**: ambient 0.2, cave tint, `bands: 4`: light quantised per game pixel into 4 steps.

## 4. Interface

**Needs**
- I-08 `webgl-post.js` loaded first and its instance (`post`); the module shares a live instance on the same canvas or creates its own (built-in passes off) when none is given.
- `render()` (or the game's `post.render()`) once per drawn frame on every draw path.
- `clock: () => gameMs` (step-counted); `camera: () => ({x, y})` = the world point drawn at canvas (0, 0), including a HUD offset.
- Optional: `solidAt(tx, ty)` + `tile`, `rects()` (world px); `uiRects()` (canvas px); `when()` (world screens only); actors to follow; event points for flashes.

**Provides**
- `add(def) → id`, `set(id, patch)`, `remove(id)`, `clear()` / `clear('flashes')`, `flash(def)`, `get(id)`, `list()`.
- Passes `lights-blur-h` (200, branch, ¼ res), `lights-blur-v` (201), `lights` (202) on the I-08 instance; the `uiMask` input.
- `setParams`, `params`, `setEnabled`, `stats()` (`lights, drawn, culled, flashes, followers, edges, builds, avgBuildMs, fade, on, map, meanLight, errors`), `lightMap()`, `destroy()`; `active`, `mode`, `reason`.

**Delivery (v1.1).** `module/dynamic-lights.js`, one global `GameDNA_Lights`, requires `webgl-post.js` (`element.json` `requires`, shipped in every combo). API, the light definition table, a 15-line integration and the self-check are in `module/README.md`. The module draws no 2D UI, so there is no skin hook.

## 5. Screen rules (exact numbers)

- **Light map**: scale q = min(1, 400 / longest canvas side) (`mapScale` overrides); cleared to black each frame; lights composited additively, stored at half range (value 0.5 = light 1.0, so two overlapping full lights still fit in 8 bits).
- **Falloff**: radial gradient with alpha stops (fraction of radius → level) 0 → 1, 0.12 → 0.88, 0.3 → 0.64, 0.5 → 0.38, 0.7 → 0.16, 0.87 → 0.04, 1 → 0; × intensity × flicker; capped so the stored value ≤ 1.
- **Flicker**: level × (1 − f × 0.75 × n), radius × (1 − f × 0.1 × n₂), where n = 0.55 v(7t) + 0.3 v(15.3t) + 0.15 v(31.7t), v = smooth value noise seeded by the light id, t = game s × `speed`.
- **Flash**: level × (1 − age / ms)², radius × (0.8 + 0.2 √(1 − age)); removed when age ≥ ms.
- **Shadows**: boundary edges between solid and empty tiles, merged into runs; rect occluders give 4 edges. An edge casts only when the light is on its outward side and within the radius. It is moved `wallLight` px into the solid, then projected to 2 × radius, with arc points every ≤ 45°. `samples` points (default 3) on a circle of radius `softness` around the light, each a full disc minus its shadows, averaged; then × the gradient.
- **Cone**: destination-in a conic gradient: alpha 1 within ±width / 2 of `dir`, 0 beyond ±(width / 2 + soft).
- **Composite** (GLSL, per pixel): L = 2 × blurred map (9-tap separable Gaussian, step `blur` canvas px, ¼ res); m = ambient × tint / luma(tint) + L; above 1: 1 + over × (1 − e^(−(m − 1) / over)); out = picture × m + glow × (1 − ambient) × min(L, 1.5)² × 0.3; emissive pixels keep max(lit, picture); soft shoulder above 0.8; ±0.5/255 dither; mixed with the picture by the fade; `uiMask` pixels output the picture unchanged.
- **Bands**: L sampled at game-pixel centres, its largest channel rounded to steps of 1 / `bands`.
- **Fade**: `when()` turning true fades in over `fade` ms of game time; turning false switches off at once (no old lights over the next screen).
- **Culling**: lights fully off canvas are skipped; at most `maxLights` per frame, nearest the canvas centre first.

## 6. Common mistakes (symptom → fix)

- The torch pool sits beside or above the hero, or slides when the camera scrolls → `camera()` is wrong: it must be the world point at canvas (0, 0); subtract the field offset (a HUD strip above the field means `camY − hudHeight`).
- Shadows fall in the wrong places or whole rows are dark → `solidAt` was given pixels, not tile indices, or water / floor tiles were counted as walls.
- The whole screen goes dark on the title or a separate battle screen → `when()` missing; lighting applies only to world screens.
- HUD text is dimmed or tinted → its rect is missing from `uiRects` (canvas px), or a text box opened without adding its rect.
- A bright box or band behind text in the dark scene → the text has no plate and its rect passes the unlit world through: leave plate-less text unmasked (it is lit like the world and stays readable) or give it a small backing box and mask that; never mask a full-width strip with nothing behind it.
- Light pools on the sky / parallax of a side-scroller → call `lights.markFar()` right after drawing the sky and parallax layers (they then get only `farLight` of the light).
- Hit flashes never show on a separate battle screen → flashes are world px and only show while `when()` is true.
- Lights pile up, frame time climbs → `add()` in the draw loop or per-frame update; add at spawn / level start, or give a fixed `id`.
- A projectile's light stays where the projectile died → its `follow` never returns `null`; return null when the shot is gone.
- Lights remain from the previous level → no `lights.clear()` at level / run start.
- Freeze frames differ between runs → `clock` reads `Date.now()`; use the step counter.
- A bright day level turns muddy → ambient left at a night value; use 0.85–0.95 there.
- Nothing lights up and `stats().reason` is `no-post-module` → `webgl-post.js` not loaded before `dynamic-lights.js`.
- Two overlays (the probe's `extraOverlays`) → lights created before the game's I-08 instance; create post first and pass it.

## 7. Acceptance moments

| Shot | Must be visible |
|---|---|
| `demo/?t=4200&freeze=1` (01, 02) | The Ember Vault in dungeon light: warm braziers, the hero's torch, a cool crystal, a sweeping white sentinel cone, a fireball carrying orange light; pillars, crates and walls throw soft shadows; HUD crisp and unlit. |
| `&preset=dusk` (03) | The default ambient: the room readable everywhere, lights as warm and cool pools. |
| `&preset=day` (04) | Day accents: nothing muddy, lights only accent. |
| `&preset=retro` (05) | Banded light in steps per game pixel. |
| `&split=0.5` (06) | Left half unlit (through the uiMask), right half lit. |
| `&shadows=off` (07) | Same lights, no shadows: shows what the occluders add. |
| `&select=brazier-1` (08) | The light editor: the selected light's ring and its colour, radius, intensity, flicker and cone controls. |
| WebGL disabled / `&webgl=0` (09) | The plain 2D canvas, "2D only", no errors. |
| Phone width 500 (10) | Canvas and panel fit, no horizontal scroll. |
| Hosts (11–14, `checks/hosts/`) | Topdown village at dusk: torch on the hero, door lamps, glowing slimes, trees casting shadows, HUD unlit; sidescroll with torch, coins and checkpoint fires; `?webgl=0` / `?lights=0` give the plain game; `?auto=1` ends like the original. |

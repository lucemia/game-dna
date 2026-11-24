# E-06 Weather & ambient particles

## 1. What it is

Weather that the game draws in two calls: one behind its sprites (right after the background) and one in front of them (before the HUD). Five kinds: **rain** (slanted streaks in three depths that splash on the game's own ground line), **snow** (flakes from 1 px far to a 3 px cross near, swaying, melting on the ground), **dust motes** (slow floating specks that twinkle), **fireflies** (wandering lights that pulse on and off and grow a halo at night) and **falling leaves** (four-frame flutter, a moment of rest on the ground). Particles live in three depth layers with parallax against the camera (far 0.55, mid 0.85, near 1.25), are pushed by a wind that gusts, cross-fade from one weather to the next, take their colours from the skin, never exceed a particle budget and never cover the game's UI rects. Every position is a pure function of seed, clock, camera and weather history, so the same `?t=` always gives the same frame. It changes the look only: no rules, no input.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `weather` | rain | rain, snow, leaves, dust, fireflies, none | Starting weather; `setWeather(kind, ms)` cross-fades later |
| `density` | 1 | 0–2 | Count multiplier. At 1 on a 256×224 view: rain 150, snow 130, dust 160, fireflies 44, leaves 60 (scaled by view area; rain and snow × (0.55 + 0.9 × intensity)) |
| `intensity` | 0.5 | 0–1 | Rain 150–380 px/s, streaks 4–13 px; snow 16–50 px/s; leaves 18–40 px/s; dust and firefly brightness |
| `wind` | 0.4 | −2–2 | Base wind, 1 = 30 px/s; rain drifts ×3, leaves ×1.15, snow ×0.8 |
| `gust` | 0.35 | 0–1 | Swells and flutters on top of the base wind, in its direction |
| `parallax` | 1 | 0–1.5 | Scales the layer factors' distance from 1 |
| `front` | 0.25 | 0–0.6 | Share of particles in the near layer, drawn over the sprites |
| `night` | 0 | 0–1 | Firefly glow: < 0.25 a faint cross over a dark body pixel (day), ≥ 0.25 a 1 px cross, ≥ 0.6 a 5×5 halo (solid inner ring, dithered outer) |
| `shade` | 0 | 0–0.5 | Rain / snow darken the view with a cool tint (drawn behind the sprites) |
| `fade` | 1500 | 0–6000 ms | Default cross-fade length |
| `cap` | 180 | 20–400 | Hard budget across all layers, both passes and a cross-fade |
| `splash` | on | on, off | Rain splashes |
| `uiMode` | hide | hide, dim | Over UI rects: skip, or draw at 50 % (visible only where weather is drawn after the UI or the UI is translucent) |

## 3. Variants

- **Drizzle**: rain, intensity 0.2, density 0.7, wind 0.2: few short, near-vertical streaks.
- **Storm**: rain, intensity 1, density 1.6, wind 1.2, gust 0.8, shade 0.25, front 0.35: long slanted streaks, many splashes, a darker sky.
- **Blizzard**: snow, intensity 0.9, density 1.6, wind 1.3, gust 0.7, shade 0.1.
- **Quiet snowfall**: snow, intensity 0.25, wind 0.1, gust 0.1 (night).
- **Autumn gusts**: leaves, wind 1.1, gust 0.7, density 1.2.
- **Dusty hall**: dust, wind 0.1, density 1.3, front 0.3 (dusk or interiors).
- **Firefly night**: fireflies, night 1, density 1.4.

## 4. Interface

**Needs**
- A fixed 60 Hz step (the one `?t=` fast-forward runs) in which `update(stepMs)` advances the weather clock.
- The camera position in world px (`camX`, `camY`) the tiles use, passed to the draw calls.
- Two draw slots: after the background and before tiles / sprites (`drawBack`); after sprites / effects and before HUD / windows (`drawFront`). One slot is allowed (`draw`).
- Optional, side view: `ground(screenX) → screen y | null`, the top of the ground under a column (null over a pit). Without it, particles land on seeded spots across the field (top-down).
- Optional: `uiRects` (array or getter), every HUD bar and open window in screen px.

**Provides**
- Weather behind and in front of the sprites; `wind()` in px/s; `weather()` (target and current mix); `stats()` per-layer counts, splashes, UI-hidden counts; `lastDrawn()` / `layout()` drawn rects (tests).

**Delivery (v1).** `module/weather-particles.js` (global `GameDNA_Weather`; API, a 15-line integration and a self-check in `module/README.md`). Colours come through `GameDNA_Skin.resolve(options.skin)`: `palette.weather.{rain, snow, dust, fireflies, leaves}` (4 colours each) if the skin has them, else derived from `fx.cold`, `fx.heal`, `fx.crit`, `fx.hot`, `ink`, `paper`; `skin.pixel === false` switches to smooth drawing; `skin.motion.fadeSteps` steps the alphas. Without the skin API a built-in pixel16 palette is used.

## 5. Screen rules (exact numbers)

Native canvas, any size via `view`; every particle sits on whole native pixels; nothing drawn outside `view` (clipped).

- **Layers**: far (pass back, factor 0.55, speed ×0.62, darkest tone), mid (back, 0.85, ×0.85), near (front, 1.25, ×1.2, brightest). Factor = `1 + (f − 1) × parallax`. Counts: near = `front` × n, the rest 45 % far, 55 % mid.
- **Falling kinds** cycle through a band from 16 px above the view to 8 px below it; each cycle gets a new seeded x. Horizontal wrap width = view width + 48 px, so particles enter from off-screen.
- **Rain**: streak 1 px wide, `len = max(3, round((4 + 9 × intensity) × speed factor))` (+20 % near), drawn as vertical runs along the wind slope (|slope| ≤ 1.2); mid and near heads one step brighter. Splash: 3 frames of 50 ms (crown 1 px up, two droplets 2–3 px out, two dots 3–4 px out), mid and near only; far drops end 3–14 px above the ground line, mid 0–2 px above, near on it.
- **Snow**: far 1 px, mid 2×2 with a shaded corner, near a 3×3 cross; above 30 px/s of wind mid and near flakes trail one half-strength pixel upwind; sway ±2–6 px at 0.9–2.3 rad/s; on landing a 1–2 px dot melts over 450 ms.
- **Leaves**: pointed leaf sprites with a darker outline, a stem and a light vein: far and mid 4–5 px, near 7–8 px; four flutter frames (diagonal, face-on, other diagonal, edge-on), randomly mirrored; four colours (yellow, orange, red-brown, yellow-green); sway ±5–12 px; resting on the face-on frame for 1.2 s, the last 30 % fading.
- **Dust**: warm light specks (far 1 px; mid 1 px, 2×2 above half twinkle, a 3×3 sparkle at peaks; near 2×2, sparkle above 0.65); brightness 0.55–1; spread over 18–82 % of the view height, denser low (in front of tree lines and walls); drift ±1.5–4.5 px/s with 5 px / 6 px bobs; only above the ground line.
- **Fireflies**: core 1 px (2 px near), warm yellow-green halo; pulse period 2.4–4.4 s, lit 55 % of it; wander ±22 px; clamped 6–32 px above the ground under them in side view (far layer up to 48 px, into a tree line).
- **Wind**: `30 × (wind + sign(wind) × gust × g(t))`, g = three sines (0.37, 0.91, 2.3 rad/s) plus a slow swell `1.6 sin²(0.23 t) − 0.8`; integrated analytically, so drift is exact at any clock.
- **Cross-fade**: counts move linearly from old to new over `fade` ms; their sum never exceeds the budget.
- **Budget**: total particles over all layers ≤ `cap`; ≤ 3 `fillRect`s per particle on average (halos up to 20).
- **UI**: a particle whose box grown by 1 px touches a UI rect is skipped (`dim`: 50 %).
- **Pixel skins** use stepped alpha (1, 0.75, 0.5, 0.25) only.

## 6. Common mistakes (symptom -> fix)

- Weather covers the HUD or a dialog -> the window is missing from `uiRects`, or `drawFront` runs after the HUD; add the rect and draw before the HUD.
- Rain splashes float in the air or inside the ground -> `ground` returns world y or takes world x; it maps screen x to screen y (`groundTop(sx + camX) - camY`).
- Splashes appear over pits -> `ground` returns a number for pit columns; return `null` there.
- Everything is in front of the hero -> only `draw` (both passes) is called after the sprites; split it into `drawBack` before the sprites and `drawFront` after.
- Particles stand still, or differ between two `?t=&freeze=1` loads -> `update` is in the render loop or uses real time; call `update(stepMs)` in the fixed step.
- Rain slides with the hero instead of the world -> the camera was not passed (or was negated); pass the tiles' `camX`.
- Weather jumps when the area changes -> the instance was re-created; keep one and call `setWeather(kind, ms)`.
- Top-down: drops all land on one line -> a `ground` was given; omit it for top-down.
- The weather shakes with the screen -> it was drawn inside the shake translate; draw it outside (or accept it on purpose).
- Too busy on a small screen -> lower `density` or `cap`; counts already scale with the view area.

## 7. Acceptance moments

1. **Rain, side view** (`?t=3000&freeze=1`): pale far streaks behind the tree line, mid streaks behind the hero, longer near streaks over him, all slanting with the wind; 1–3 px splashes on the grass top; none over the pit; none within 1 px of the HUD plate or the dialog window.
2. **Storm**: long diagonal streaks, many splashes, the sky darker but the HUD untouched.
3. **Snow / leaves / dust / fireflies** each at one frozen moment: flakes in three sizes; leaves in different flutter frames, a few resting on the ground; specks with a sparkle; fireflies with halos at night.
4. **Cross-fade** (demo `?tour=1&t=7700&freeze=1`): rain and snow together, the HUD label reading "RAIN TO SNOW".
5. **Determinism**: two loads of the same `?t=&freeze=1` URL give byte-identical PNGs.
6. **Hosts**: in a platformer and a top-down game, `?auto=1` ends as before with no errors.

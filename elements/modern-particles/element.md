# E-11 Modern particle system

## 1. What it is

The particle layer of a 2020s indie action game: thousands of small, smooth, light-like particles that make every event feel physical. A defeated enemy flashes, throws a shock ring, a spray of streak sparks and slow glowing embers, then a little smoke; a sword hit throws bright sparks that fall, bounce on the floor and skid to a stop; a fountain of glowing drops lands in its basin; smoke puffs grow, rise and drift with the wind; magic motes orbit upward around a portal; landings kick soft dust; pickups twinkle; a power-up aura rises off the exact outline of the hero's sprite.

It is one general engine, not one effect: a preallocated pool (typed arrays, swap-remove, no per-particle garbage), emitter shapes (point, line, circle, rect, sprite outline read from the image's alpha), curves over each particle's life (size, alpha, a colour gradient), additive or normal blending, gravity, drag, wind, ground bounce with friction, orbiting motion, and nine presets built from layers (sub-emitters). Designers add their own presets with `define()`. Motion depends only on the seed, the order of calls and game time, so `?t=&freeze=1` stills match play.

On HD canvases it draws tinted soft sprites (stretched along velocity for sparks, rotated for stars and puffs); on a 1:1 native pixel canvas it switches to whole-pixel particles with four alpha steps and pixel trails behind sparks, so the motion is modern while the pixels match the host. Additive glow backs off by itself over bright frames, where it would wash out to white.

It does not replace E-06 weather (ambient screen-wide rain, snow, leaves) or E-02 hit sparks (a one-call impact flash with hit-stop): those are finished effects; this is the general layer for everything else, and the place to build new effects.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `budget` | 2000 | 200–8000 (module 64–16000) | Pool size; when full, new particles recycle old ones in a fixed rotation |
| `density` | 1 | 0.25–2 | Multiplies every count and rate (quality setting) |
| `scale` | 0 = auto | 0–4 | Size unit of every preset's px and px/s; auto = view height / 180 (1 at 320×180, 2 at 640×360); fixed at the first emit |
| `render` | auto | auto, smooth, crisp | auto = crisp when drawing 1:1 on a canvas ≤ 512 px wide |
| `glow` | auto | auto, on, off | Additive blending for light-like layers; auto = normal blending when the frame under the particles is bright (mean luma > 0.55) |
| `gravity` | 1 | 0–2 | Multiplies every layer's gravity |
| `wind` | 0 | −120–120 px/s | Sideways push on smoke, embers and flame |
| `bounce` | 1 | 0–1.5 | Multiplies restitution; 0 = nothing bounces |

Preset numbers (scale 1): `burst` = 1 flash (r 10, 150 ms) + 1 ring (260 ms) + 28 streak sparks (110–280 px/s, drag 3.4, gravity 160, 260–620 ms) + 22 embers (rise, 0.5–1.15 s) + 7 smoke puffs (back layer). `sparks` = 30 streaks (110–300 px/s up in a 150° cone, gravity 520, restitution 0.5, friction 0.62, 0.6–1.25 s) + 6 hot glows. `fountain` = 110 drops/s (190–270 px/s, 20° cone, gravity 430, restitution 0.32). `smoke` = 16 puffs/s (1.5–2.6 s, size ×1.9 over life). `swirl` = 80 motes/s orbiting 9–20 px at 3–5.2 rad/s, climbing 26 px/s, + 9 stars/s.

## 3. Variants

| Variant | Params | Use |
|---|---|---|
| Modern indie (default) | budget 2000, density 1, render auto, glow auto | Most games |
| Phone saver | budget 800, density 0.6 | Large HiDPI canvases on weak phones |
| Spectacle | budget 6000, density 1.6, glow on | Dark boss arenas, bullet heavens |
| Pixel host | render crisp, glow off | Native pixel games that want flat palette sparks |
| Windy, floaty | gravity 0.5, wind 40, bounce 0.6 | Cliffs, sky islands, dream levels |

## 4. Interface

Needs: the fixed update step (`update(stepMs)`, also in the `?t=` fast-forward, 0 or skipped while paused); event sites in the step (hit accepted with contact point and facing, defeat with centre and optionally the sprite image, pickup, landing and jump with the feet y, hurt, checkpoint / heal / respawn) and the level's ambient sources (`start` once); the camera offset in the draw pass; optionally `ground(x, y)` in world px from the game's own collision test and `uiRects()` in screen px.

Provides: `emit(preset, x, y, opts)` and `start(preset, x, y, opts)` (handle: `move`, `set`, `stop`, `kill`, `alive`), `define(name, layers)`, `draw(ctx, offX, offY, layer?)` (`back` / `front` layers), `stats()` (live, peak, recycled, emitters, update and draw ms) and `signature()` (a hash of the live state for determinism tests). Options per call: `amount`, `color` (13 palette names, one hex, or stops), `angle`, `spread`, `speed`, `size`, `life`, `facing`, `dir: 'out'`, `vx`/`vy`, `floor`, `shape`, and for `start` also `follow` and `duration`.

## 5. Screen rules

- Particles draw in screen space after world sprites and before the HUD, with offset = −camera; never inside the world translate twice.
- UI rects are clipped out with one evenodd clip per draw; nothing covers HUD text, message boxes or end panels.
- Size unit: 1 px at a 180 px tall field, 2 px at 360. Sparks: 0.9–1.9 px wide, streak length = speed × 0.05 s plus 1.6 × size; flash radius 10 units for 150 ms; ring grows to 3.4 × 6 units in 260 ms.
- Colour runs along the gradient over life (16 buckets); alpha and size follow 32-step curves; twinkling layers dip to 50 % at ~3 Hz.
- Crisp mode: positions rounded to whole native px, alpha in 4 steps (1, 0.75, 0.5, 0.25), sparks leave a 1 px trail up to 8 px, puffs are rounded blocks, stars are plus signs.
- Glow auto: additive (`lighter`) only while the sampled frame is dark (mean luma ≤ 0.55; sample: 16×9 downscale at the first draw and every 30th draw); on bright frames light layers draw normally over a darker underlay (0.6 × alpha, 1.25 × size).
- Bounce: a particle crossing `ground` or `floor` going down reflects with restitution × `bounce` (max 0.95) and keeps `friction` of its sideways speed; below 26 units/s it rests and skids.
- Pool full: the oldest slot in a fixed rotation is reused (no allocation, deterministic). At most 64 running emitters.
- Cost (headless, software raster, 2000 live): update 0.06 ms; draw 6.4 ms on a 390 px phone at dpr 3 (1056×594 backing), 3.0 ms crisp, 4.2 ms at dpr 2. Past 700 live particles, additive layers fade per particle (to 0.55× at 2500) so overlaps do not saturate to flat white.

## 6. Common mistakes

| Symptom | Fix |
|---|---|
| Effects differ between `?t=&freeze=1` and play, or are missing in stills | Emit in the update step, not in the draw code; `update` must run in the `?t=` fast-forward loop too |
| Dozens of bursts per hit | The emit sits in a per-frame overlap test; emit where the hit is accepted (after the cooldown check) |
| Emitter count stuck at 64, warning in the console | `start` is called every frame; call it once and keep the handle (`move` it if the source moves) |
| Particles slide with the camera | Emit in world px and pass `-camera` to `draw`, outside the camera translate |
| Particles tiny or huge | `view` was given in backing-store px (devicePixelRatio) instead of the game's logical px, or `scale` set by hand |
| Sparks fall through the floor | No `ground` and no `floor`; build `ground(x, y)` from the game's tile test (world px) |
| Sparks vanish into white over a bright sky | `glow: 'on'` forced; use `auto` (or `off`) |
| Particles over the HUD | Pass the HUD rects from `uiRects()` in screen px |
| A hurt burst tints everything red | Expected only for light layers; neutral layers (smoke) keep their own colour |
| Autoplay ends differently | Something added changed game state or used `Math.random`; the module never does |

## 7. Acceptance moments

1. A sword hit: streak sparks fly away from the attacker, fall, bounce once or twice on the floor and skid (visible frame ~200 ms after the hit).
2. A defeat: flash, ring, sparks and embers at the enemy's centre, smoke behind; with an image sprite the first frame traces its outline.
3. A pickup: star twinkles thrown out in a ring and gold motes rising; a landing: dust puffs left and right of the feet.
4. An ambient source (portal, torch, opened door): motes orbit and climb, smoke rises and drifts.
5. Scrolling: particles stay where they were emitted in the world; none covers the HUD.
6. Native pixel host: whole-pixel particles, no soft blur; HD host: soft glowing sprites. Demo `?stress=1`: 2000 live particles at a steady frame rate.

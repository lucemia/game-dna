# E-15 Ribbon trails

## 1. What it is

The motion trails of 2020s action games: a sword swing leaves a bright swept crescent that hugs the blade's arc and thins away within a fifth of a second; a dash leaves a soft ribbon as wide as the body; a magic bolt draws a thin curved line with a white-hot core; a wisp leaves a faint wake. Each fixed step the module samples every source once (the weapon tip and hilt, the body centre, the projectile), keeps the recent points with their age, and draws a centripetal Catmull-Rom curve through them whose width and alpha taper with age. It is a ribbon, not a row of sprite copies: the older "afterimage" look (ghost sprites every few frames) shows beads and gaps at speed, the ribbon stays continuous at any speed.

Teleports, respawns, scene switches, long gaps and a source that goes quiet start a new strip; `update(0)` (pause, hit-stop, a window over the world) holds every ribbon still. Nothing is ever drawn across the screen. It only reads the sources and only draws: positions, hit boxes and rules never change.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `life` | 220 ms | 60–800 | How long a sampled point lives; kinds scale it: blade × 0.8 (176 ms), dash × 1.6 (352), projectile × 1 (220), wake × 2.2 (484). Reduced motion × 0.6 |
| `width` | 1 | 0.25–3 | Multiplier on each kind's width: blade 9, dash 22, projectile 7, wake 12 px at scale 1 (× `scale` = view height / 360) |
| `taper` | 1.3 | 0–3 | Width × (1 − age/life)^taper; on a swept band the hilt edge slides to the tip by the same factor |
| `fade` | 1.2 | 0–3 | Alpha × (1 − age/life)^fade; body alpha per kind: blade 0.85, dash 0.58, projectile 0.9, wake 0.36 |
| `glow` | 0.5 | 0–1.5 | Soft additive halo 2.4 × the width at 0.16 × glow × alpha (dash × 0.6, wake none); off in reduced motion |
| `smooth` | 4 | 1–10 | Max curve subdivisions per sampled step (one per 3 × scale px of travel); 1 = straight segments |
| `core` | on | on, off | Thin additive line: 32 % of the width on blades (16 % of the band along the tip edge), 40 % on projectiles |
| `palette` | steel | steel, ember, arcane, frost, venom, gold, shadow, skin | Head colour → tail colour + core colour; a ribbon's own `color`/`color2`/`coreColor` wins |
| `render` | auto | auto, smooth, pixel | auto = pixel when the context has `imageSmoothingEnabled === false` or the skin is a pixel skin |
| `reduced` | system | system, on, off | Shorter ribbons, no glow, dimmer core |
| `contrast` | auto | auto, on, off | auto: every 12 draws per ribbon, read a 16×16 device-px patch of the backdrop under the ribbon's centre; mean luminance > 140 → bright: a dark under-shadow (tail colour 62 % toward ink, alpha 0.7, 1.6 s + 0.5 px down; 1 game px in pixel mode) under the body, no additive glow |

## 3. Variants

- **Clean steel**: the defaults; white-blue blade crescents.
- **Ember blade**: warm orange to red, more glow, `life 260`.
- **Arcane caster**: violet, `life 320`, glow 1.1, width 1.2: long spell trails.
- **Snappy action**: `life 140`, `taper 2`, width 0.8: short, sharp slashes for fast combat.
- **Long silk**: `life 520`, `taper 0.8`, `fade 1.6`, `smooth 6`, frost: long flowing ribbons.
- **Shadow**: dark violet `#4e3f74` → `#120e20`, normal-blended core, never additive glow: a dark smear for stealth or dark-magic dashes.
- **Calm (reduced)**: reduced motion on, no glow.
- **Pixel host**: `render pixel`, no glow: whole pixels with three hard alpha steps (110 / 185 / 255).

## 4. Interface

**Needs**
- A fixed step that calls `update(stepMs)` once after movement (also run by `?t=` fast-forward and `?auto=1`), `update(0)` while frozen or paused.
- Per ribbon a `source()` returning world px `{x, y}` (plus `bx, by` = hilt for a swept band, `alpha`, `space`, `cut`) or `null` while there is nothing to trail.
- Two draw calls in each scene: `draw(ctx, camX, camY, 'under')` before the sprites and `'over'` after them, before HUD and windows.
- `clear()` on restart, level start and every scene switch (scenes with their own coordinates).

**Provides**
- The ribbons, drawn under (dash, projectile, wake) or over (blade) the sprites.
- Automatic breaks: a step longer than max(72 × scale, 3.5 × the recent step) is a teleport; a `space` change, a gap longer than the life, or a `null` source end the strip.
- `stats()`, `list()`, `points(id)`, `lastDrawn()` for tests and judges (strips, points, breaks, largest drawn step `maxGap`, boxes).

**Skins.** `palette: 'skin'` takes head and tail colours from the skin's `fx.white` / `text.accent` and `fx.cold` / `fx.hot`; a pixel skin selects the pixel raster. Without `skin` nothing is used.

**Delivery.** `module/ribbon-trails.js` (one global `GameDNA_Ribbons`; API and a 15-line integration in `module/README.md`), `prompt.md`, the basket hint `tools/basket/ribbon-trails.mjs` and the judge probe `judge/probes/ribbon-trails.js`.

## 5. Screen rules (exact numbers)

`scale` s = view height / 360 (0.62 at 224, 1 at 360, 1.5 at 540).

- **Sampling**: one point per `update` with dt > 0. A head that moved < 0.35 s px replaces the newest point (a still sword leaves no ribbon; the tail drains into the head). At most 120 points per strip.
- **Speed gate**: speed v = step / dt / s. Ribbon strength k eases to smoothstep(0.6 m, 1.2 m, v) (70 % per step up, 35 % down) with m = minSpeed: blade 60, dash 220, projectile 0, wake 30 px/s. A walk under 130 px/s never shows a dash ribbon.
- **Arc samples** (swept bands): when the tip moves more than 12 s px in one step, up to 8 extra samples are inserted along the arc around the hilt (hilt lerped, blade angle and length interpolated), so fast swings stay round.
- **Curve**: centripetal Catmull-Rom (α = 0.5) through the points, mirrored end points, ceil(step / 3 s) subdivisions capped by `smooth`.
- **Width** at age u = age/life: W × max(0.3, k) × (1 − u)^taper; alpha: A × k × (1 − u)^fade; colour head → tail by u^0.8.
- **Swept band** (hilt given): quads between the tip path and hilt' = tip + (hilt − tip) × (1 − u)^taper × max(0.25, k).
- **Head cap**: a half disc of the head width on blade and projectile ribbons (none on bands).
- **Body compositing**: each segment's quad is added ('lighter') into an empty buffer clipped to the ribbon's device box, then composited once with normal blending: shared edges sum to one coverage, so no seams or beads. Glow and core are additive straight onto the game.
- **Breaks**: teleport distance max(72 s, 3.5 × EMA of recent steps) (or `teleport` px); any drawn step longer than 1.5 × that + 2 is split at draw time (`cuts`, must stay 0).
- **Pixel raster**: drawn at game-pixel size, alpha < 0.14 → 0, < 0.42 → 110, < 0.72 → 185, else 255, scaled up without smoothing.
- **Cost**: 0.18–0.40 ms per frame for 4-6 ribbons (41–78 points) at 960×540 (headless Chromium, both layers).

## 6. Common mistakes (symptom → fix)

- A line across the screen after a scene switch → the old scene's fading strips are drawn in the new scene's coordinates: call `clear()` on every scene switch.
- The crescent floats beside the blade → the source uses a different angle, pivot or length than the draw code; compute tip and hilt from the same numbers.
- A crescent between swings or from the idle pose to the swing start → the blade source must return `null` outside the swing.
- Ribbons slide with the camera → screen px passed as the source in a scrolling game; pass world px and the camera to `draw`.
- Ribbons fade under a dialogue or pause menu, or keep fading in hit-stop → `update(0)` while the world is stopped.
- `?t=&freeze=1` frames differ between runs, or ribbons missing in them → `update` called from render instead of the fixed step.
- A dash ribbon on a walking hero → `kind: 'dash'` is fine (it is gated at dash speed); a `wake` or `projectile` kind on the hero is not.
- Ribbons blurry on a pixel game → the context has `imageSmoothingEnabled` true; set it false or pass `render: 'pixel'`.
- The blade crescent drawn over an enemy standing in front of the hero → expected with one `'over'` call; give the blade `layer: 'own'` and draw the hero's group right after the hero sprite (`draw(ctx, cx, cy, 'hero')`).
- One ribbon jumps between actors, or draws strips on two of them → the source follows a slot ("nearest wisp"); tie each id to one actor, `remove(id)` when it dies or is replaced.
- A pale wash on a light floor → keep `contrast: 'auto'` (or `'on'`); it adds the dark under-shadow.

## 7. Acceptance moments

1. **Mid-swing** (demo t = 2300): a swept crescent from hilt to tip following the blade's arc, brightest at the blade, thinning to nothing at the start of the arc; no beads, no seams.
2. **Dash** (t = 3700): a soft ribbon as wide as the body from the old position to the hero, under the sprite.
3. **Homing bolts** (t = 6700): thin curved trails with a bright core that bend smoothly with the bolt; no corners.
4. **Blink** (t = 7320, debug on): two separate strips (before / after), no segment between them; debug boxes show the strips.
5. **Pause** (t = 8400): a swing frozen mid-arc with its crescent intact while "PAUSED" shows.
6. **Pixel look**: whole pixels, three alpha steps, no smoothing.
7. **Hosts**: topdown battle screen stick swing (pixel crescent), hd-topdown sword swing over grass; `?auto=1` ends as the original.

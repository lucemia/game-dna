# E-18 Spring water surface and splashes

## 1. What it is

Water for a side-view level whose surface behaves like a row of springs. A barrel rolls off a cliff: it hits the lake, a crown of droplets flies up out of both sides of the hole, a curved splash sheet rises and collapses, a ring of foam spreads, bubbles rise from where it went under, and a wave runs out to both banks, bounces off the cliff and comes back smaller until the lake is calm again. The barrel pops back up and floats, rocking on the waves it made. A wading hero pushes a little bow wave and kicks up spray; a fish that leaps out sheds drips; an arrow makes a thin, tall jet; a waterfall keeps the water at its foot churning white with mist. Everything under the line is tinted by the water, darker with depth, and the bank above is mirrored in a wobbling reflection. The game's rules stay as they were: the module never moves its characters.

Each pool is a row of spring columns (one every `spacing` px) with a restoring force (`tension`), a wave term between neighbours (`spread`, the wave speed), velocity damping and a little viscosity, integrated with semi-implicit Euler in fixed 1/120 s sub-steps and clamped to `maxAmp` (and 0.6 of the depth). Bodies the game lists are tracked per id: an entry is the bottom edge crossing the surface between two steps, tested along the path (fast projectiles too), with a hysteresis so bobbing and the body's own trough never splash twice. Floaters are buoyant boxes (density = share under water at rest) with linear and quadratic water drag, wave-slope drift, a springy tilt and pairwise separation.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `spacing` | 4 | 2-8 px | Distance between spring columns (x `scale`) |
| `tension` | 26 | 5-80 /s^2 | Each column's pull back to the rest line |
| `spread` | 150 | 40-300 px/s | Wave speed along the surface (x `scale`) |
| `damping` | 1.5 | 0.3-4 /s | Velocity damping: energy falls >= 98 % in 6 s after one big splash |
| `viscosity` | 0.25 | 0-1 | Neighbour velocity smoothing (no single-column spikes) |
| `maxAmp` | 22 | 4-40 px | Max displacement (x `scale`, and <= 0.6 x depth) |
| `splash`, `droplets` | 1 | 0.2-2, 0-2 | Entry impulse and droplet count multipliers |
| `clarity`, `depthAlpha` | 0.42, 0.86 | | Water alpha just under the line and at the bottom |
| `reflect` | 0.3 | 0-0.6 | Reflection alpha at the line (fades with depth over 54 px x scale) |
| `shafts`, `foam`, `bubbles`, `wake` | 1 | 0-2 | Light shafts (smooth), foam, bubbles, wading wake |
| `ambient` | 0.3 | 0-1 | Breeze: two slow travelling pressure waves, about 0.8 px (pixel, scale 0.6) to 2 px (HD) of swell |
| `gravity` | 1 | | Droplets and floaters fall at 900 px/s^2 x scale |
| `palette` | lake | lake, sea, swamp, cave | Colour set |
| `render` | auto | auto, pixel, smooth | auto = pixel when `imageSmoothingEnabled === false` |

Entry splash for a body of width w at speed v (HD px/s): energy e = clamp(v / 420, 0.06, 1.7) x `splash`, size z = clamp(w / 30, 0.12, 2.6); the columns under the body get +420 e sqrt(z) px/s (down), 0.9-2.6 half-widths to each side -170 e (up, the crown wave); droplets (7 + 20 e) sqrt(z) x `droplets` (max 52) thrown 7-42 degrees out of vertical from both edges at (110 + 230 e) sqrt(z) px/s; a splash sheet of height (14 + 34 e) sqrt(z) for 0.36-0.62 s when e z > 0.25; up to 18 bubbles. Projectiles (`kind: 'projectile'`, or w < 9 px and v > 260): a narrow jet, 7-13 droplets, a thin sheet.

## 3. Variants

- **Lake** (default).
- **Stormy sea**: palette sea, splash 1.6, droplets 1.6, ambient 0.8, damping 1.
- **Swamp**: palette swamp, clarity 0.6, depthAlpha 0.95, reflect 0.15, spread 90, damping 2.4 (thick, murky, waves die fast).
- **Cave pool**: palette cave, ambient 0 (still), reflect 0.45.
- **Pixel render**: render pixel.

## 4. Interface

Needs: pool rects in world px (`x, w` = the gap, `y` = the water line, `h` = the depth; optional `floor(x)` for a sloped bed); `bodies()` returning top-left boxes with stable ids for everything that can enter (hero, enemies, projectiles); `update(stepMs)` once per fixed step (`update(0)` while stopped), also under `?t=` and autoplay; `draw(ctx, camX, camY)` after the sprites and before the HUD, in the sprites' space; `clear()` on restart; the game's own art for floating props.

Provides: entry splashes, exit drips, wading wake; `onSplash(info)`, `onSound('splash' | 'exit', info)`; floaters (`addFloater`, `removeFloater`, `floaters`); waterfalls (`falls`); `splash(x, speed, {w, kind})`, `bubble(x, y, r)`; queries `surfaceY`, `restY`, `floorY`, `depthAt`, `inWater`, `poolAt`, `pools`; `clear`, `setParams`, `params`, `stats`, `hash`, `events`, `energy`, `maxAmp`.

## 5. Screen rules

- The surface never leaves `[-maxAmp, +maxAmp]` and never becomes NaN: 10 minutes of a waterfall, 3-24 heavy splashes per second and a body thrashing through the surface (`checks/run-checks.js` stability; also the particle pools stay at their caps: 700 droplets, 220 bubbles).
- Energy damps: after one big splash, energy at 6 s <= 2 % of the first second (default), <= 1 % at 12 s, and never grows by > 5 % from one second to the next; with no input the water is flat (< 0.3 px) 15 s after the last splash (damping).
- One splash per entry: 160 bodies of 4-76 px dropped, thrown diagonally and shot (up to 60 px per step) into the pool, every crossing splashes exactly once; a body bobbing 1 px about the line, or wading sideways, splashes once; in, out, in = 2 (entries). The demo timeline, frame by frame over 12.7 s in both views: every crossing has its splash and every splash its crossing (`checks/timeline.py`).
- Floaters run aground on a shelving bed (`floor`) instead of hanging through it (v1.0.2; floaters check, mutant).
- After leaving the water a body trails drips from its underside for 0.55 s (v1.0.2).
- Demo timeline: no body (walker, swimmer, fish, floater, arrow) ever ends a step inside the ground or below the lake bed (`checks/timeline.py`, mutant `?mut=noBedClamp`).
- Floaters: never fully under water for more than 0.5 s, even dropped from height into a storm; at rest the share under water is the density +- 0.2; never outside the pool; never overlapping each other; settled (< 3 px/s) 9 s after the storm; tilt < 0.6 rad (floaters).
- Same seed and calls = same hash; another seed differs; `update(0)` and `draw` change nothing (determinism). The demo gives the same water hash at 1100 px dpr 2 and 390 px dpr 3.
- The water is drawn over what is under the line only (clipped to the surface curve and the pool floor); nothing above the surface is tinted. Highlight line 1 px (pixel) / 1.35 px x scale (smooth); the lit band 2 px under it.
- Pixel splash sheets are thin, lean outward and curl over as they fall, breaking into flecks; the depth bands have no dithered seam rows (v1.0.1).
- Droplets are teardrops stretched along their velocity (smooth) or 1-2 px with a white core (pixel); they vanish when they fall back in (a tiny push and foam) or land on ground (`solid`).

## 6. Common mistakes

| Symptom | Fix |
|---|---|
| Nothing looks wet: characters in a pit are drawn over the water | `draw` is called before the sprites: call it after the last world sprite, before the HUD. |
| Splashes appear in the wrong place, or only at the left of the level | Pools or bodies in screen px, or the camera applied twice: pools, bodies and `draw` share world px; pass `0, 0` inside the camera transform. |
| No splash ever | `bodies()` returns new ids every frame (e.g. array index after filtering, or `Math.random()` ids), or the hero is missing from it. |
| Splashes during ?t= screenshots differ from play | `update` called from rendering instead of the fixed step, or not called in the fast-forward loop. |
| The water keeps moving while paused | Pass `update(0)` while the world is stopped. |
| A splash on every frame while standing at the edge | The game's own code calls `splash()` each frame; let the module detect entries instead. |
| Water drawn over the ground under a sloped lake bed | Give the pool `floor(x)`. |
| Floaters drift into each other or off screen | Use `addFloater` (they separate and stay in their pool); do not move floater x / y yourself. |
| Ripples left after restart | `clear()` in new game. |

## 7. Acceptance moments

Demo `demo/index.html`: pixel view 384x216 (pixel render; a stone cliff with a waterfall, a lake shelving to a grass bank; pixel-kit hero and guard with 2-frame walks; a pixel fish; pixel-kit barrel and crate as floaters) and `?view=hd` 640x360 (smooth render over the painted lakeside: the near lake continues the painted lake toward the viewer, its line on the painted lake's near edge, a dense water body over a fill of the lake's own colour so no painted path shows through and a trough opens onto water; a lake bed about two thirds down built from the scene's own painted art (the backdrop's painted path sampled once and tinted to the water, the painted shore rocks tinted and half sunk into it, soft caustic light bands, a depth fade, a feathered edge) that sunk stones and arrows come to rest on; arrows with a dark iron head, wooden shaft, red fletching and a short motion trail, pointing along their flight and keeping that angle when they stick in the bed; varied shore rocks (one painted stone prop and its loose rocks, oval-masked, different sizes and turns, some half under) where it meets the quay and the archer's rock; demo-kit slime, archer (planted on the rock), harpy (dives head first along its path with wings tucked, slowed under water, beats its wings on the way out), wisp; barrel and crate cut from the demo kit's painted crate stack). Click or tap drops a stone (pixel 5 px stone / painted pebble) that sinks slowly, rests on the bed and fades. One clock: the script runs from the step count; `?t=` runs the same steps. `checks/state.json` lists the event each moment must already hold (`checks/shoot.py` verifies it).

1. **Fish leaps** `?t=2050&freeze=1` (exit fish 1950): the fish arcs out of the lake, drips under it, the waterfall churning at the cliff.
2. **Fish splashes back** `?t=2530&freeze=1` (splash fish 2483): pixel crown and droplets beside the floating crate, the wave starting out.
3. **Hero wades in** `?t=3700&freeze=1` (splash hero 2567): the hero waist-deep in the shallows, legs tinted, bow-wave foam in front.
4. **Barrel splash** `?t=4440&freeze=1` (splash barrel 4383): the barrel the guard pushed off the cliff has hit the water at the waterfall's foot.
5. **Guard dives** `?t=5300&freeze=1` (splash guard 5217): he went in head first (his side frame turned a quarter, pixel-exact); the crown and curling sheets, the wave running toward the shallows.
6. **Swimming** `?t=7000&freeze=1` (swim guard): the guard swims level just under the line, slowly, kicking (2 frames by distance), bubbles rising; barrel and crate bobbing.
7. **Settled** `?t=12000&freeze=1`: the guard stood up in the shallows and waded out, the two face each other at the shallows, floaters on the surface, gentle swell.
8. **HD slime splash** `?view=hd&t=1680&freeze=1` (splash slime-f 1600): the slime hopped off the dock; crown sheets, teardrop droplets, foam ring.
9. **HD barrel splash** `?view=hd&t=3320&freeze=1` (splash barrel 3300): the thrown barrel's splash; the slime floating behind it.
10. **HD arrow jet** `?view=hd&t=4170&freeze=1` (splash arrow1 4117): the archer's arrow makes a thin, tall jet; the arrow sinks with bubbles.
11. **HD harpy dives** `?view=hd&t=6220&freeze=1` (splash harpy 6200): the harpy plunges in, crown and wave.
12. **HD harpy bursts out** `?view=hd&t=7000&freeze=1` (exit harpy 6900): drips falling from her, the water pulled up behind.
13. **HD settled** `?view=hd&t=12000&freeze=1`: barrel, slime and crate floating apart, reflections of the dock and the rock, gentle swell.
14. **Hosts**: sidescroll and hd-sidescroll trial integrations (`checks/hosts/README.md`, shots `h1`-`h4`).

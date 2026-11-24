# K-01 Camera director

## 1. What it is

A modern 2D camera that replaces a hard-follow camera (one that centres the hero every frame). It **directs** the view instead of locking onto the hero:

- **Spring follow with a dead zone.** The camera chases a goal with an exact critically damped spring (no wobble, no overshoot from rest). Inside a small dead zone the hero moves without moving the view.
- **Look-ahead.** The view leads in the facing (side view) or moving (top view) direction, more at full speed. The lead covers the dead zone and the spring's lag, so the hero really sits ~15 % of the width behind centre. It has its own slow, speed-capped spring, so turning round eases the view across instead of snapping.
- **Platform snapping (side view).** Jumping does not bob the view. The camera re-frames vertically only when the hero lands at a new height, or when the hero leaves a vertical band (falls far, climbs high). A long fast drop leads the camera downward, so the landing is on screen before touchdown.
- **Multi-target framing.** Extra targets (a boss, a second player) are kept in frame with the hero: the view zooms out to fit them (down to `minZoom`, never shrinking the hero below `minSize`), or leans toward them when the game cannot zoom. An extra fades in by distance, and framing and rooms are blended through their own speed-capped spring, so a boss appearing or dying never whips the view. The hero stays in the middle of the frame and never under the HUD (`uiRects`); extras are framed clear of wide HUD bands such as a boss bar. When the hero stops, the camera stops with it (base pan ≤ 2× the hero's current speed).
- **Impact.** `hit()` gives trauma and, for heavy blows, a short zoom punch toward the contact point. Trauma shake is smooth noise of game time, scaled by trauma², with a small roll; it decays and is capped.
- **Edges.** The base view never leaves the level; at an edge the spring stops with zero speed (no bounce, no jitter). Rooms and arenas limit only the goal, blended in and out, and yield when the hero walks toward their wall, so entering, leaving or opening them glides.
- **Cuts.** Teleports, respawns and level starts jump without a glide (`cut`), and a target that moves more than 0.6 of a view in one step is cut automatically.
- **Sub-pixel or whole pixels.** HD games get smooth sub-pixel positions, zoom and roll; pixel games get whole-pixel positions with zoom 1 and no roll.

It is **view only**. The game keeps computing its own camera for everything that is not drawing (spawn or wake "on screen", despawn, AI visibility, autoplay, test hooks). Only drawing (and pointer → world) uses the director. So rules, timing and `?auto=1` endings never change, and `?t=&freeze=1` is exact because everything advances in `update(dt)` from game time.

Why it counts as modern (M9 bar): 2020s action games read as "filmed": the camera leads, holds still on small hops, frames the fight and lands hits with a punch. A 1990s camera is locked to the hero, bobs with every jump and twitches at walls.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `view` | side | side, top | Side: facing look-ahead, platform snapping. Top: 2D look-ahead from velocity, dead zone on both axes |
| `follow` / `followY` | 1.8 / 1.4 Hz | 0.2–10 | Spring frequency; steady lag behind a constant speed v is 2v / (2π·f) |
| `deadW` / `deadH` | 0.08 / 0.12 | 0–0.5 | Dead zone, fraction of the view (deadH is used in top view or without platform snapping) |
| `look` | 0.15 | 0–0.45 | Look-ahead at full speed, fraction of the view width (96 px on a 640 px view) |
| `lookHz` | 0.7 Hz | 0.1–5 | Look-ahead spring (lower = slower, softer turn-around) |
| `idleLook` | 0.4 | 0–1 | Share of the look-ahead kept while standing (side view) |
| `platform` | auto | auto, on, off | Side view vertical re-framing on landing; auto = on when `onGround` is passed |
| `farY` | 0.28 | 0.05–0.45 | Vertical band in the air: up 0.28 × view height, down 70 % of that, before the camera follows |
| `biasY` | 0.06 | -0.3–0.3 | Camera sits this much of the view height above the target |
| `safe` | 0.8 | 0.3–0.98 | The target is kept in this central fraction of the view (springs overruled), except at a level edge |
| `frame` | zoom | zoom, bias, off | Multi-target framing mode |
| `minZoom` | 0.72 | 0.4–1 | Furthest zoom-out when framing |
| `pad` | 0.1 | 0–0.3 | Framing margin, fraction of the view; an extra counts fully within 0.75 view of the target, fading out by 1.25 |
| `minSize` | 0.1 | 0–0.4 | Framing never draws the target (its `h`) smaller than this fraction of the view height |
| `blend` | 0.9 Hz | 0.2–5 | Spring of the framing / room offset (speed-capped at max(0.2 view/s, 1.1× target speed)); zoom changes ≤ 30 %/s |
| `punch` | 0.06 | 0–0.25 | Zoom punch on a finisher (heavy 60 %); attack 60 ms, ease-out back over 280 ms |
| `shake` | 3 | 0–10 | Max shake offset, % of view height (10.8 px at 360) |
| `roll` | 1.2° | 0–6 | Max roll; the view zooms in just enough that rolled corners stay covered |
| `decay` | 1.6 /s | 0.2–8 | Trauma lost per second |
| `freq` | 14 Hz | 1–40 | Noise frequency |
| `snap` | auto | auto, pixel, smooth | auto = pixel when the view is ≤ 270 px tall or the skin is pixel |
| `reduced` | system | system, on, off | Shake × 0.3, no roll, no punch |
| `mode` | director | director, off | off = the game's own camera (`legacy`) passed through, for A/B and an options switch |

Measured with the defaults (640 × 360 view, 60 Hz):

| Moment | Result |
|---|---|
| Landing 110 px higher | `cy` holds while airborne; after landing reaches 95 % in 33 frames (0.55 s), no overshoot |
| Running at 240 px/s | camera centre 98 px ahead of the hero (look 96 + dead zone and lag covered) |
| Turn-around at full speed | the view drifts on for 0.23 s, crosses the hero at 1.55 s, settles 93+ px ahead on the other side by 2.5 s; peak pan 453 px/s (1.9× the hero) |
| Demo run, whole loop | peak pan 440 px/s outside the fall (1.8× the hero at the turn-around and the golem reveal); zoom-out 0.905 at most (hero ≥ 36 px tall); 0 safe-frame catch-ups with every preset, `frame: 'bias'` and `snap: 'pixel'` (`checks/trace.py`) |
| Drop into the arena (to 840 px/s) | the camera leads the fall: hero at screen y 190–234 of 360 (hard follow ~200), floor on screen 0.18 s before touchdown, peak pan 1130 px/s (1.3× the fall), settles ~20 px after landing |
| Hero stops after the room release | camera 420 → 64 px/s within 0.25 s, then drifts ≤ 64 px/s; hero slides ~30 px on screen in 0.5 s (v1.1: ~95 px) |
| Finisher (`hit('finisher')`) | trauma 0.78: shake ≤ 6.6 px (measured peak 3.7 px), roll ≤ 0.73°, zoom 1.062 at 60 ms; all settled by frame 29 |
| Light hit | trauma 0.22: shake ≤ 0.5 px, no punch (a tremor, not a jolt) |

## 3. Variants

- **Director**: the defaults.
- **Snappy action**: `follow 3`, `followY 2.4`, `deadW 0.04`, `look 0.12`, `lookHz 1.2`, `punch 0.05`, `shake 2.5`, `roll 0.8`, `decay 2.2`.
- **Cinematic**: `follow 1.1`, `followY 0.9`, `deadW 0.12`, `look 0.2`, `lookHz 0.45`, `minZoom 0.62`, `punch 0.08`, `shake 3.5`, `roll 1.8`, `decay 1.2`.
- **Heavy impacts**: `punch 0.11`, `shake 5.5`, `roll 2.4`, `decay 1.1`.
- **Top-down**: `view top`, `deadW 0.1`, `deadH 0.12`, `look 0.12`.
- **Pixel-snapped**: `snap pixel` (whole pixels, zoom 1, no roll, no punch).
- **Reduced motion**: `reduced on`.

## 4. Interface

Needs: one `update(dtMs, {target, extra, legacy, room})` per fixed step (also under `?t=` and `?auto=1`), with the target in world px (`x`, `y`, optional `vx`, `vy`, `onGround`, `facing`); the level as `bounds`; the world drawing wrapped by `apply` / `restore` (or reading `cam.x` / `cam.y`, optionally inside `applyScreen`), culled with `visible()`; optional `extra` targets, `hit` / `trauma` / `punch` at impacts, `cut` at teleports, `legacy` = the game's own camera.

Provides: `x`, `y`, `cx`, `cy`, `zoom`, `angle`; `apply`, `applyScreen`, `restore`; `visible`, `inView`, `toScreen`, `toWorld`; `hit`, `trauma`, `punch`, `shake(px, ms)` (compatible with other elements' `onShake`); `cut`, `clear`, `setBounds`, `setRoom`, `setView`, `setParams`; `debug(ctx)`, `stats()`, `state()`.

With E-05 hit-stop-shake: the camera owns the shake. Create E-05 with `shake: 0` (keep its freeze and flashes) and call `cam.hit` beside `juice.hit`; route `onShake` callbacks to `cam.shake`. Or keep E-05's integer shake and set this camera's `shake: 0`, `roll: 0`. Never both.

## 5. Screen rules (exact numbers)

- The target is inside the central `safe` (0.8) of the view on every frame unless the view is against the level edge on that side, and outside every `uiRects` rect near the edges.
- Pans from framing, rooms and look-ahead ≤ ~2× the target's speed; zoom changes ≤ 30 % per second; framing zoom keeps the target ≥ `minSize` of the view height.
- Base view (without shake) inside `bounds` on every frame; a level smaller than the view is centred. Shake may overhang an edge by its own amplitude (≤ `shake` % of the view height).
- Shake offset per axis ≤ `shake` % × view height × trauma²; roll ≤ `roll` × trauma²; trauma ≤ 1 and falls by `decay` per second.
- Zoom from framing ≥ `minZoom` and ≥ the zoom at which the view fits the bounds; zoom punch ≤ +25 % in total.
- Pixel output: `x`, `y` whole numbers, zoom exactly 1, angle 0.
- No more than 3 sign flips of the camera speed per axis in any game second without trauma (the judge's `jitterSecs`).
- HUD drawn after `restore`: it never moves, shakes or zooms.

## 6. Common mistakes (symptom → fix)

- Enemies spawn or wake at different times, autoplay ends differently → the director's values were written into the game's camera, or a gameplay reader was switched; keep the old camera for gameplay, switch only drawing.
- Tiles or sprites pop in at the screen edges when zoomed out or leading → drawing is culled with the old camera or the view size; cull with `cam.visible(pad)`.
- The view drifts away and the hero leaves the screen → `target` passed in screen px (world minus camera); pass world px.
- The view glides across the level after a respawn or a door → no `cut` at the teleport (an auto cut catches only jumps > 0.6 of a view).
- `?t=&freeze=1` frames differ between runs, the view moves faster at high refresh rates → `update` is in render or uses wall-clock time; call it once per fixed step.
- Parallax slides against the world → the backdrop still reads the old camera; read `cam.cx` / `cam.cy` (or `cam.x` / `cam.y`).
- HUD shakes or zooms → the HUD is drawn before `restore`.
- Double shake (jerky, too strong) → the game's own shake still runs; route it to `cam.shake(px, ms)` or set one of them to 0.
- Half-pixel shimmer in a pixel game → `snap: smooth`; leave `auto` or set `pixel`.
- The camera bobs on every jump in a platformer → `onGround` not passed (platform snapping is off); pass the real flag after collisions.
- Pointer clicks hit the wrong tile when zoomed → the pointer uses the old camera; use `cam.toWorld(sx, sy)`.

## 7. Acceptance moments

- Demo `?t=6300&freeze=1`: mid-jump between ledges: left (hard follow) centred on the hero; right (director) still framed on the last ledge, the ground line in the debug overlay.
- Demo `?t=10000` to `11600`: a full-speed turn-around on the open walkway: the hero crosses the frame from the left third to the right third as the lead eases over (`shots/05`).
- Demo `?t=12400` to `13900`: the golem comes into range: the orange framing box fades in, the view leans and zooms out gently (0.93); the hero drops into the arena with the camera leading the fall, the floor and golem on screen before touchdown; no whip-pan, hero in the middle, never under the scene label.
- Demo `?t=18200&freeze=1`: the hero backs off from a slam: zoomed out to ~0.92 to hold hero and golem; the hard follow crops the golem.
- Demo `?t=23100` to `23700`: the finisher: zoom punch toward the contact point, shake with a slight roll, settled within half a second.
- Demo `?t=23800` to `25000`: the gate opens and the arena room is released: the view glides on with the hero, who stays in the left half; when the hero pauses at the gate (24.2 s) the view slows to a drift within a quarter second.
- Demo `?t=27600&freeze=1`: the far end: the view stopped against the level edge while the hero walks on to the portal; red edge bar in the overlay.
- Demo chart (`?t=5200`): camera height moves in flat steps, one per landing (director), against an arc for every jump (hard follow); the speed lane is scaled in px/s with the hero's speed as a faint line; on phones the chart is redrawn taller (720×320) so both lanes stay readable.
- Host integrations (`checks/hosts/`): pixel side-scroller (whole-pixel camera, look-ahead, hit trauma), HD top-down (2D look-ahead, Thornback framed clear of the boss bar), HD side-scroller (no bob on jumps, vertical re-frame on landing, boss framing); `?auto=1` same end as the original.

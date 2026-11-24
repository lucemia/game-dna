# A-11 Horde survival auto-attacker

## What it is

A top-down survival run. The player only walks (arrows / WASD, or a drag anywhere on the field that becomes a touch stick); every weapon fires by itself on its own timer. Four built-in weapons: **Orbit Blades** circle the hero and cut what they touch (per-foe hit cooldown), **Seeker Bolt** fires at the nearest foes, **Sun Pulse** bursts a burning ring that damages and throws back everything inside, **Dawn Bow** looses a shaft of light that pierces a line of foes in the direction the hero last walked. Foes spawn just outside the view on a ring around the camera, in waves whose rate and mix rise over the run, plus scripted events (a ring that closes in from every side, a pack charging from one side, elites); they swarm the hero with soft separation: slimes hop, imps and harpies fly (harpies swoop), wisps drift, cultists glide in robes, keep range and throw ember orbs; the boss stomps. Each kill drops an XP gem; gems inside the pickup reach fly to the hero. Each level pauses the world and offers 1 of 3 seeded choices: a new weapon, the next level of an owned weapon (5 levels each), or a passive (speed, max HP, pickup reach, recharge, damage, area, regeneration). A timer and a kill count run at the top; at the end of the wave table a boss arrives (the far horde scatters), with a telegraphed slam and summons; killing it, or holding out until dawn (`dawn` s after it arrives; the boss crumbles), wins (DAWN BREAKS), falling loses (FALLEN). Everything runs on a fixed 60 Hz step from a seed: `?t=&freeze=1` stills and `?auto=1` runs are deterministic, and a bot plays through the same input path. It stays fast with 300-900 foes: pooled typed arrays, a spatial hash rebuilt each step (counting sort, no garbage), y-sort by insertion, and each character painted once into a cached bitmap per look, side and size.

## Default parameters

| key | default | meaning |
|---|---|---|
| `enemyCap` | 400 | live foes at most (scripted rings may exceed it by 60) |
| `spawnRate` | 1 | multiplier on the wave table's spawns per second |
| `duration` | 200 | seconds until the boss; the wave table (written for 200 s) is scaled to it |
| `dawn` | 90 | seconds after the boss arrives until dawn (a win: the boss crumbles); the timer's second line counts it down |
| `heroSpeed` | 100 | px / s before upgrades |
| `magnet` | 70 | gem pickup reach in px before upgrades |
| `startWeapon` | bolt | first weapon |
| `choices` | 3 | cards per level-up (2-4) |
| `hpScale` | 1 | foe HP growth: HP x (1 + minutes x 0.55 x hpScale); boss HP x hpScale |
| `numbers` | on | built-in hit numbers (off when C-11 or E-01 draws them) |

Rules constants: hero 120 HP, 600 ms of invulnerability after a hit (contact uses the strongest touching foe's damage), XP to next level = round(5 + 4.2 L + 0.42 L^2); gems fold into an existing gem when 520 lie on the field (no XP is lost); foes left 1.9 view radii behind re-enter ahead of the hero (not a kill); boss: 1300 HP, slam every 3.6 s within 280 px (1.1 s telegraph, radius 100, 24 damage), 8 slimes every 12 s.

## Variants

- **Standard vigil**: 200 s of waves, then the boss.
- **Quick night**: 90 s, spawns x1.5.
- **Swarm**: cap 700, spawns x2, softer foes: the screen fills.
- **Blade dancer**: start with Orbit Blades, faster hero.
- **Gentle**: wide gem pull, half foe toughness.

## Interface

Needs: a fixed step and a seed, a move vector (keys) or pointer events (stick), a 2D context and a logical view rect, optionally `paintActor` (paints one still pose of a look; the module caches and animates it) and `drawGround`, optional content tables, an end handler.

Provides: `create(options)` -> `start({seed, weapons})`, `update(stepMs)`, `drawWorld(ctx)`, `drawUI(ctx)`, `setInput(x, y)`, `key(k)`, `pointer(type, x, y)`, `setAuto(on)`, `pause(on)`, `hitStop(ms)`; `onHit(ev)` per HP change (`{kind, target, enemy, source, amount, hpBefore, hpAfter, killed, x, y, boss, elite}`), `onKill`, `onPick`, `onEvent`, `onEnd(result, info)` once; `anchor(id)`, `unitRects()`, `uiRects()`, `cardRects()`, `enemies(fn, all)`, `worldToScreen`, `stats()`; `addWeapon / addEnemy / addUpgrade` (data). The starter adds `GAME.addons` hooks, `GAME.addWeapon / addEnemy / addUpgrade / addToWaves`, `GAME.held`, `GAME.shipped`.

## Screen rules (640x360 logical)

- Logical view 640x360 landscape; portrait screens use 360 x (360 x screen aspect, up to 780) (`setView`). Camera centred 8 px above the hero's feet, follow factor 0.14 per step. Hero 46 px tall (`heroH`), drawn AFTER every foe with a 1-device-px dark outline, on a gold ring (r 18, flattened 0.42, dark under-stroke) drawn after the foes; walk sheet frames (idle + 4) advance by distance walked (one stride = 0.62 h = two frames); invulnerability blinks a white tint (never see-through); HP bar 32 x 3 px, 6 px under the feet.
- Foes need no leg frames (no legged walkers in the built-in set): slime 22 (gait hop: 640 ms jumps, 0.32 h high, squash 0.8 on landing, it only moves while airborne), imp 26 and harpy 38 (gait fly: hover 0.3 / 0.35 h, wing-beat stretch 7 % at 85 ms, tilt into the flight), wisp 26 (float), cultist 38 and hierophant elite 50 (glide: robe sway 0.03 rad, 1 px bob; elite gold marker 6 px above the head), golem boss 98 px (stomp: rises 5 px and leans 0.05 rad per footfall, each footfall shakes the screen 2.2 px and kicks dust; it always faces the hero). Contact shadow 0.7 h wide (1.1 h for hoppers, 0.95 h for the boss).
- Hit flash: white silhouette at 80 % for 110 ms (30 % within 46 px of the hero, the boss 30 % fading). Death: 520 ms (boss 1.6 s) tip over, flatten to 65 %, fade.
- The simulation never reads the canvas size: spawn ring radius = 430 px (half the diagonal of a 360x780 portrait view, which also covers 640x360) + 50 px (+0-40) around the camera; the boss's scatter box is 640x780; foes 1.9 x 430 px behind re-enter ahead. A spawn whose sprite box would touch the drawn view is counted (`stats().spawnOnScreen`, must stay 0).
- HUD: XP bar y 6, 10 px, from x 34 to the right edge minus 10; level medallion r 12 at (20, 13); timer 18 px bold at the top centre (y 31), a warning line 8.5 px below it in the last minute; kills right-aligned at y 29 with a skull; weapon slots 21 px at (8, 32), passives 17 px below; boss bar max 360 px wide, 26 px above the bottom; wave alert 12 px serif at y 70 for 2.2 s.
- Level-up: world dimmed to 55 %, LEVEL UP ribbon, N cards up to 150 x 142 px, 12 px apart, centred; name 10.5 px serif at 88 (shrinks to fit), effect text from 99 px, 8.5 px shrinking to 7 px until it ends 4 px above the level pips anchored 14 px from the bottom (cut with an ellipsis only if 7 px still does not fit; `checks/cards.py` proves no card does); selected card lifts 6 px with a gold rim and glow; cards pop in 70 ms apart with a back ease; a card can be taken after 350 ms (no accidental skips).
- Numbers: at most 24 live, small ones (< 14) dropped above 16 live, none over the hero's body, none in the HUD band (y < 58); a hit within 26 x 18 px of a number younger than 360 ms adds to it (a rolling total); big (>= 30 or boss) numbers gold 13 px, others white 10 px.
- Boss slam: a red danger zone that fills over the 1.1 s telegraph, a pulsing 3-4.5 px rim on a dark under-stroke, cracks growing from the centre.
- Icons: the host's `icons` (the starter and demo use the painted-ui icon atlas); the built-in code icons are the fallback.

## Common mistakes

- Foes pop in at the screen edge -> spawning at a fixed distance from the hero instead of outside the view diagonal from the camera, or a host spawn placed by hand; use the wave table or `spawn()` with a point outside the view.
- The game slows down past 200 foes -> drawing every sprite with its own gradient shadow and image decode; give `paintActor` (painted once, cached) and keep `drawActor` work per foe to one `drawImage`.
- Foes moonwalk -> facing taken from the direction to the hero or flipped every frame; the module faces each foe by its steer velocity with a 3 px/s threshold.
- Level-up skipped by a held key -> taking a card on key repeat; the window ignores picks for its first 350 ms and the starter queues only fresh key presses.
- XP disappears with many gems -> deleting gems at a cap; fold the value into an existing gem instead.
- The boss never dies -> weapons only aim at the nearest foe and the swarm soaks every shot; the bolt reserves one shot for the boss in range, and the far horde scatters when it arrives.
- `?t=&freeze=1` still differs from play -> state changed in draw; everything drawn is derived from `update()`.

## Acceptance moments

Demo (`demo/index.html`):

1. `?t=3000&freeze=1`: swarm at 2:32, about 240 foes of six kinds, all four weapons (blades circling, bolts, a pulse ring, lances), gems on the ground, XP bar, timer with the "Colossus wakes" line, kill count, slots.
2. `?scene=stress&t=2500&freeze=1`: about 570 foes around the hero; the hero still visible on its gold ring; hit numbers fold into totals.
3. `?scene=boss&t=2500&freeze=1`: the Moss Colossus inside the view below the HUD, facing the hero, its slam danger zone filling, boss bar at the bottom.
4. `?scene=levelup&t=600&freeze=1`: the level-up window: three cards (icon, NEW or LV n, name, effect text, level pips), the middle one selected.
5. `?scene=early&t=3000&freeze=1`: the first seconds: a ring of slimes hopping in, the first bolts.
11. Portrait (390 x 844): the starter and the demo switch to a 360-wide logical view as tall as the screen; HUD at CSS size; the same seed plays the same game as in landscape (moments 6-10 show the same scenes).

Starter (`starter/index.html`, seed 7):

6. `?t=500&freeze=1`: title THE LONG VIGIL with the lantern keeper large, lantern light.
7. `?t=172000&freeze=1`: a mid-run swarm (harpies, imps, cultists, slimes), Dawn Bow shafts, blades, ember orbs.
8. `?t=160900&freeze=1`: a level-up window during a run (painted icons).
9. `?t=217000&freeze=1`: boss fight (the Moss Colossus on screen facing the hero, boss bar, "Dawn in" countdown).
10. `?t=266000&freeze=1`: DAWN BREAKS with the results panel (time, foes felled, level, weapons).

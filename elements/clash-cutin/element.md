# A-04 Side-view clash cut-in

## What it is

When a turn-based or tactics battle confirms an attack, the game cuts away from the map to a short staged scene seen from the side. A band opens from the ground line over the map (bright edges), revealing a letterbox caption bar on top, a backdrop drawn in code for the defender's terrain (plains, forest, marsh, desert or ruins: dithered sky, clouds, a far ridge, a tree line / pines / reeds / dunes / broken columns, a ground plane with a trodden strip), the two units standing on the strip facing each other, and two team-coloured HP panels at the bottom (name, weapon, big HP number, bar, optional HIT / DMG / CRT).

Each strike is acted out on one clock, with the unit's own pose frames when the game has them (wind-up, swing, follow-through, bow drawn and loosed, staff raised, hurt, collapse; the demo's pixel-kit fighters have all of them): a melee attacker anticipates, leaps in with a hop arc, winds up and swings a thick crescent of light; a ranged attacker draws and looses an arrow; a caster charges a ring at its feet and throws a tinted orb. A hit freezes for a few frames (hit-stop), bursts a star, ring and sparks, shakes the stage, flashes the target as an opaque white silhouette for 5 frames, then shows it in its hurt pose knocked back, pops the damage number and drains the HP bar while a pale loss segment fades. A miss is dodged with a side-step back and one faint after-image and pops MISS. A critical gets a gleam star on the striker, a darker stage, CRITICAL! in the caption, a white flash, a bigger shake and a bigger gold number. A unit that reaches 0 collapses (kneel pose), darkens, then fades with rising motes. The counter-attack and follow-up strikes play the same way, then both return home, the scene holds and the band closes back onto the map.

The game passes the whole outcome (who strikes, hit / miss / crit, damage, HP before and after); the module only stages it, so the picture always equals the game's numbers. Z skips to the end tableau, X toggles x2 (a lit badge in the caption bar), taps work too. Units are the game's own sprites, scaled by whole steps on pixel canvases; the art's native facing is recorded once and the module decides the mirror (or picks a painted variant for art that must not be mirrored).

## Default parameters

| key | default | meaning |
|---|---|---|
| `speed` | 1 | 2 = everything twice as fast (toggled live with X) |
| `sides` | `map` | who stands left: `map` keeps the map's left / right (same column -> `team`), `team` player on the right, `attacker` attacker on the right |
| `intro` | `band` | `cut` = no open / close animation |
| `introMs` | 300 | band open and close time |
| `drain` | 450 | ms for an HP bar to drain one strike's damage |
| `stop` | 4 | hit-stop frames on a hit (x2 on a critical) |
| `shake` | 2 | stage shake in px (x2 on a critical) |
| `hold` | 450 | ms the final tableau holds before closing (a skip lands 220 ms before the end of it) |
| `backdrop` | `auto` | from the terrain the game passes; or force one of the five |
| `keys` | `on` | `off`: keys and taps are swallowed while busy but do nothing |

Timing per melee strike at x1: anticipation 110 ms, leap 230, wind-up 110, swing 80, hit-stop 67 (133 crit), reaction >= 420, return 260, gap 120; a critical adds a 340 ms gleam; a KO adds a 700 ms fade. Ranged / magic: draw or charge 300, flight 230 / 300.

## Variants

- **Classic**: defaults.
- **Brisk x2**: speed 2, drain 300, hold 250.
- **Heavy hits**: stop 8, shake 4, drain 800.
- **Player on the right**: sides `team`.
- **Hard cut, no shake**: intro `cut`, shake 0, stop 0.

## Interface

Needs: the moment an attack is confirmed and resolved by the game's own rules (strikes in order with result and damage, HP before and after); each unit's sprite with the side its art looks at (or `{left, right}` painted variants, or a draw callback), name, team, max HP, optional map x, kind (melee / ranged / magic), weapon, forecast numbers, spell tint; a fixed update step; the screen rect to cover; a place to pause the game while `busy()`.

Provides: `onDone({att, def, skipped})` when the scene has closed (resume there), `onImpact({i, by, result, dmg, after})` once per strike (sound, rumble), `busy()`, `state()` (fighters with x, facing, target, pose, shown HP; final HP; staged strikes), `rect()`, `stats()`.

## Screen rules (exact numbers)

- u = floor(min(view.w / 256, view.h / 224)), at least 1. Caption bar 16u on top, panels 44u at the bottom, the stage in between. Horizon at 40 % of the stage, ground (feet) line at 84 %.
- Fighters' homes at 30 % and 70 % of the width; left faces right, right faces left, always (one function decides it). Melee contact: the striker stops half its width + 10u from the target's half width (the bodies keep a gap; the swing lunges 4 art px), so the two never swap sides.
- Hit flash: opaque white silhouette for the first 84 ms after impact (and 34 ms more on a critical); dodge: starts before the swing lands, 16 art px back, one after-image of the sprite itself at 42 % opacity 8 art px toward the attacker; KO: white for 2 frames, collapse frame darkened up to 50 %, fade over 440 ms.
- Sprite scale (pixel): round(0.40 x stage height / art height), at most 0.46 x stage height and 0.36 x view width; whole numbers only, smoothing off.
- Numbers pop 10u above the target's head and fall back 4u; dmg 2u-scale digits (skin) or 3u font, crit 3u / 4u with a CRITICAL label, MISS 2u; they never touch the caption bar or the panels (checked). Built-in digits keep their counters at every size (open 0, no slash; checked for 0-9 at scales 1-4).
- Skip lands on the end tableau with the new HP and keeps it up for up to 600 ms (the hold) before the band closes.
- Caption text left in the bar at 6u; key caps right: X badge 24u from the right edge, Z SKIP left of it.
- HP panel: name at (6u, 5u), weapon right-aligned only if it fits, HP number 2u font, bar from 50u to the right edge - 6u, stats row at 30u. The two panels never overlap (checked).
- Nothing covers a fighter except the strike's own effects (slash, spark, orb, pops).

## Common mistakes (symptom -> fix)

- The map already shows the new HP behind the opening band, or the bars drain twice -> restore the HP before `play` and apply `after` in `onDone`.
- `?auto=1` ends differently -> the exchange is resolved with extra or reordered random calls; resolve it exactly as before, in the same order.
- The enemy turn or autoplay keeps acting under the scene -> return early from the step while `busy()`.
- The scene never ends in fast-forward stills -> `update` is not called in the replayed step.
- Fighters look away from each other -> `facing` given as where the unit looks on the map, not the side the art looks at.
- Sword and shield swap hands -> the art has gear on one side; pass `art: {left, right}` and `mirror: 'never'`.
- A wrong number on screen -> `dmg` taken after clamping at 0 HP, or from a different roll; pass the number your damage function returned.
- Area spells open the scene with one target -> stage only single-target attacks.

## Acceptance moments

All from the demo's scripted tour (one clock), `?t=<ms>&freeze=1`. `checks/state.json` lists each with the event it must show; `checks/run-checks.py layout` confirms the state at every one.

| `?t=` | what must be visible |
|---|---|
| 1500 | the map: Aldric selected, Brigand in the red attack tile, units face their foes; each unit is the same figure the cut-in shows |
| 2450 | the band opening over the map (bright edges), the scene inside |
| 3050 | Aldric leaping in (hop, shadow under him), plains backdrop, panels with HIT / DMG / CRT |
| 3300 | Aldric's swing frame: sword forward, crescent sweeping |
| 3420 | hit-stop: spark star, Brigand in his hurt pose (axe lowered) |
| 3700 | the number 9 over Brigand, his bar draining with the pale loss segment |
| 4720 | Counter: Brigand swings, Aldric dodges back with after-images |
| 10700 | forest: CRITICAL! caption, gleam star on Wren before the shot, stage darkened |
| 11300 | the arrow in flight from Wren's loosed bow toward Brute |
| 19300 | ruins: the critical counter lands, white flash, big gold number |
| 19950 | Brute falls: kneeling, darkened, fading with rising motes; HP 0 in a clean red 0; caption BRUTE FALLS; ruins flagstone strip |
| 24300 | desert: Hexer raises the rod, cast ring at his feet |
| 24650 | the green orb flies, Ilse side-steps |
| 25950 | the orange counter orb hits: pillar of light and burst |
| 7550 | the band closing back onto the map |
| 3600 with `&speed=2` | the X badge lit as x2 |

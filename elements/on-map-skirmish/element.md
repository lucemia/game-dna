# A-18 On-map skirmish exchange

## What it is

The attack exchange of a turn-based or tactics game plays on the map itself: the small map units fight in place instead
of cutting to a side-view close-up. It is the alternative to **A-04 clash-cutin** (side-view cut-in); both are in family
`battle-cutin`, so a basket takes one or the other. The game confirms an attack and resolves it with its own rules (who
strikes in what order, hit / miss / critical, damage, HP after); the module only stages it:

- every exchange spaces the pair: the module steps both fighters apart along the attack axis (eased in and out, the game's
  positions untouched) so their drawn boxes never overlap and are at least lunge + 1 px (>= 2 px) apart at rest; a boss stays put
  and its opponent takes the whole step;
- the attacker lunges 2-3 px toward the target and comes back, stopping short of the target's box; it never enters its tile;
- the hit spark is drawn on the target's side that faces the attacker, with embers flying back toward the attacker;
- only the target flashes: a solid white silhouette for 2-3 frames, then an opaque hurt pose while it is knocked back 2 px;
- the damage number pops above the target's head (gold for a critical) where it covers no other unit, plate or HUD,
  and stays nearer its owner than any other unit; it rises 4 px, holds, fades and is never shown again;
- a miss sweeps a white swish arc past the target's near side and shows MISS while the target sidesteps across the swing
  (no flash, no spark, no hurt pose, no HP change);
- the target counter-attacks; a side whose speed is at least 4 higher gets a follow-up (`order()` helper; `x2` badge on its plate);
- both sides' HP plates sit at the bottom of the screen (the top when units stand under them) and drain slowly; the HP
  number ticks down with the bar;
- a boss braces in place: when it attacks it rises 2 px and slams down instead of lunging; when hit it is not knocked
  back; a unit next to a boss that is wider than its tile stands back 4-6 px for the whole exchange; the boss plate is dark iron
  with a red inner edge and a horned-helm emblem;
- a knocked-out unit dissolves from the top down while team-coloured shards fall; `gone(id)` tells the game to skip its own fade.

## Default parameters

speed 1 (x2 with X), lunge 3 px, knock-back 2 px, flash 3 frames, HP drain 520 ms, hold 420 ms, follow-up gap 4, boss
stand-off 4 px, plates prefer the bottom, text scale auto (10 CSS px minimum), keys on.

## Variants

Classic; Brisk x2 (speed 2, drain 320, hold 220); Slow drain (drain 1100, hold 700); Light touch (lunge 2, knock 1, flash 2);
Plates on top.

## Interface

Needs: the confirmed, resolved exchange (attacker, defender, strikes in order, HP after); each fighter's id, name, team,
HP before, max HP, sprite box as drawn, `boss`; every unit draw routed through `drawActor`; the other units' rects and the
HUD rects; a fixed step that pauses the world while `busy()`. Provides: `onDone({att, def, skipped, ko})`, `onImpact`,
`order()`, `busy / fighting / facing / dir / offset / gone / state`. Module API: `module/README.md`.

## Screen rules (exact numbers)

| rule | number |
|---|---|
| timeline (speed 1) | plates in 260 ms; per strike: wind-up 90 ms (lean back 1 px), dash 80 ms, impact, hold 110 ms, return 140 ms; next strike 820 ms later |
| lunge | 2-3 px along the attacker -> target line (diagonals round per axis); boss: 0 toward, rises 2 px |
| flash | `flash` frames (2-3) solid white silhouette, then opaque hurt pose for 380 ms; never on the attacker |
| knock-back | `knock` px (2) away from the attacker over 60 ms, back over 160 ms; boss 0 |
| miss | sidestep 2 px across the swing + 1 px up, swish arc radius 10 px for 230 ms, MISS label |
| spark | 190 ms (crit 250 ms), 7 rays (crit 10), on the target's near edge 3 px inside its box |
| number | 5x8 pixel font, bold digits, 1 px outline; rises 4 px in 170 ms, fades 600-720 ms after impact |
| plates | 2 px from the view edge, height 28 px at text scale 1, each up to 150 px wide; slide in / out from their edge, clipped to the view |
| drain | starts 110 ms after impact, lasts `drain` ms, ease-out; a later drain starts where the previous ended; the exchange closes only after every drain + `hold` |
| text | cap height x scale x CSS px per native px >= 10 (scale 2 below 1.25 CSS px per native px) |
| KO | dissolve 440 ms from the top down, 9 shards in 3 team tones |

## Common mistakes (symptom -> fix)

- Units do not move or flash -> the game draws its units itself; route every unit draw through `drawActor`.
- Bars drain while the map already shows the new HP -> restore HP before `play`, apply `after` in `onDone`.
- `?auto=1` ends differently -> the exchange was resolved with extra or reordered random calls; resolve exactly as before.
- Every exchange is skipped at once -> autoplay inputs reach `key()`; forward only a person's keys.
- The enemy keeps moving during the exchange -> the step does not return early while `busy()`.
- The fighters overlap or jump apart twice -> the game re-spaced them itself or passed a shifted `box`; pass the box as drawn and let the module space them.
- A number sits on a neighbour or the plates cover units -> `getObstacles()` is empty or in another coordinate space.
- A unit knocked out by the exchange fades a second time -> skip the game's fade when `gone(id)`.
- Plates cover the HUD -> `view` includes the HUD; pass the play area only and the HUD in `uiRects()`.

## Acceptance moments

Listed with what must be visible in `checks/state.json` (`events`): plates opening at 2300, Arden's lunge at 2540, the hit
with spark, hurt pose, knock-back and a number clear of the Pikeman above at 2650, drain at 3000, the counter's MISS and
swish at 3450, the critical follow-up at 4300, the KO dissolve at 4950, plates moved to the top at 8500, a counter hit at
9320, the boss bracing when hit at 13320 and before its counter at 13960, its axe landing at 14150, the close at 15350,
x2 at `?t=2650&freeze=1&speed=2`. None of them is a flash frame (`checks/layout.py`).

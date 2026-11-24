# C-12 World-space HUD

## What it is

HUD pieces that live in the game world and follow the camera, for games seen from above (top-down, three-quarter, tactics maps):

- **Rings** under every unit's feet, squashed to the ground plane, in team colours (hero cyan, ally green, enemy red, npc lilac, boss orange). An **HP arc** runs round the ring, centred on the front: full HP = a closed ring; after a hit the arc shrinks at once and a pale **loss segment** holds for 450 ms, then drains. Below 30 % the arc pulses red. The focused unit (`setFocus`) gets a thicker ring and a selection reticle (four L brackets at its corners, breathing 1u every 400 ms). Rings are drawn in a ground pass so the sprites stand on them.
- **Name plates** above heads: level badge, name, a thin HP bar with the same loss segment. A layout solver places them in priority order (focus, boss, hero, ally, enemy, npc; then id) and tries ten slots (above the head, stacked higher, left, right, below the feet); a plate never overlaps another plate, a HUD rect the game names, an edge arrow or marker, or the view edge. A displaced plate gets a leader line to its unit; one that cannot fit is hidden (reported as `crowded`), never squeezed.
- **Objective marker**: a bobbing diamond above the current goal with its distance ("12m") and a ground ping ring under it.
- **Edge arrows** for off-screen targets (the goal, any unit with `track`): a badge with an icon (goal diamond, skull, gem, "!", heart, flag) and a pointer whose angle is the exact bearing from the badge to the target, plus the distance. The badge sits where the bearing from the view centre meets the screen edge; a HUD box there pushes it inward along the same bearing (or, past a third of the view, along the edge), and the angle is recomputed from where it ends up.

It is an addon: it reads units, targets, the camera and the HUD rects, and draws; it never changes game state or reads input. Crisp whole pixels with a built-in bitmap font on native pixel canvases; smooth vector drawing with outlined system text on HD canvases.

## Default parameters

| key | default | meaning |
|---|---|---|
| `plates` | `auto` | party always; enemies when focused, a boss or hit in the last 3 s; named npcs; at UI scale >= 2 only the party and the focused unit. `all`, `enemies`, `damaged` (hp below max), `named`, `off` |
| `arc` | `hp` | `off` = plain team ring |
| `squash` | 0.5 | ring height / width (1 = straight overhead) |
| `ringSize` | 1 | ring radius = r x zoom x 1.2 x ringSize (min 4u) |
| `arrows` | `on` | edge arrows for off-screen goals and tracked units |
| `markers` | `on` | diamond + distance above an on-screen goal |
| `distance` | `on` | distance labels (from `player()` or the first hero) |
| `unit` | 16 | world px per metre (the tile size is a good choice) |
| `plateHp` / `level` / `leader` | `on` | plate HP bar, level badge, leader line to a displaced plate |
| `lowHp` | 0.3 | the arc and bar pulse red at or below this share |
| `holdMs`, `drainPerSec` | 450, 0.55 | loss segment hold, then drain speed (share of max HP per second) |
| `scale` | 0 | UI unit u: auto = 1 on native pixel canvases (<= 512 px view), view height / 340 on HD; 2 for phones |
| `render` | `auto` | `crisp` when the view is <= 512 px wide or smoothing is off, else `smooth` |
| `maxPlates` | 16 | plates per frame |

## Variants

- **Action adventure**: `plates: auto` (party, targets and just-hit enemies), arcs, goal arrow and marker.
- **Tactics selection**: all plates, bigger rings, no arrows; `setFocus` on the selected unit.
- **Quest compass only**: no plates or arcs, just the goal marker and edge arrows.
- **Overhead**: `squash: 1` for straight-down cameras.

## Interface

Needs (world px): `units()` -> `{id, x, y (feet), r, h, team, name, level, hp, maxHp, boss, focus, track}`; `targets()` -> `{id, kind, x, y, h, label, track, marker}` with exactly one `goal`; `camera()` (world rect shown) and `view` (its screen rect), or `toScreen(x, y)`; `safeRects()` (screen); `update(dt)` each fixed step; `drawGround(ctx)` between floor and sprites; `draw(ctx)` after the world.

Provides: the drawn rings, plates, marker and arrows; `rects()` (screen boxes for other overlays to avoid); `lastDrawn()` (`rings[{id, cx, cy, rx, ry, hp, lag}]`, `plates[{id, x, y, w, h, slot, leader, anchor}]`, `arrows[{id, kind, x, y, angle, tip, target, box, dist, label}]`, `markers[...]`, `hidden[{id, what, why}]`); `setFocus(id)`; `reset()`; `state()`, `stats()`.

## Screen rules (exact numbers)

- u = UI unit (crisp: integer, 1 on 256-512 px views; smooth: view height / 340, min 1).
- Ring: rx = max(4u, r x zoom x 1.2 x ringSize), ry = max(2u, rx x squash); band 1.5u (focus / boss 2u, smooth 2.2u / 3u) with a 1u ink outline inside and out, a soft dark disc under it; arc centred on the front (bottom), angle span = 2 pi x HP share; loss segment `#fff1c0`; missing part dark at 72 %.
- Plate (crisp): height 9u (+3u with a bar), width = text + badge + 6u (min 22u with a bar), 1u ink border with cut corners, 1u team stripe on the left, 1u highlight on top, a 2u pointer notch under it in the first slot; text 5-row bitmap font with a 1u ink outline. Smooth: 15u (+5u), radius 4u, stroke inside the box, 9.5u bold system text with a 2.6u ink stroke.
- Visibility and stability (v1.2.0, solved in `update()` so stills equal play): which units get a plate is set by `plates` (default `auto`, above). Party plates pick first and are always shown; on a column or tight formation a party plate may overlap a teammate rather than vanish. Every plate is a state machine: fade in 200 ms, stay at least 1.5 s, leave only by a 200 ms fade-out (keeping its box while it fades); a hidden optional plate stays hidden at least 1.5 s; an optional plate appears only where it has 3u of room. A shown plate keeps its slot unless another costs 2.5 less and it has stayed 450 ms (a slot left in the last 1.5 s costs 4 more); it reacts when another plate comes within 3u and glides (150 ms smoothstep) to the nearest legal slot it can reach without crossing a plate, the HUD or (non-party) a hero sprite; with no path yet it waits; a move no glide can make (it would otherwise touch another plate, or a place clearly better than any reachable one, e.g. back above its head) is a 150 ms crossfade, the old place fading out under the plates while the new one fades in; an optional plate pushed again within 0.6 s fades away. Never a one-frame jump (`checks/temporal.py`: jumps 0 on desktop and phone). A plate is removed at once only when a hard rule leaves no legal place (`forced`). `update()` keeps 1u more spacing than `draw()` requires, as slack for games that move units between the two. Checked by `checks/temporal.py`: no visible stint under 1 s, <= 2 hide/show cycles per plate per 10 s, party labeled >= 95 % of frames, plus limits on slot changes, flips, blinks, swaps, jumps, cuts and forced removals.
- Plate slots (in order): above the head with a 3u gap (smooth 5u), then up by one and two plate heights + 2u, shifted half a plate + 2u right and left, and below the feet (ring bottom + 2u). Hard rules: 1u clear of every safe rect and placed box, inside the view, never on the sprite box of a hero or the focused unit (`avoid: 'auto'`; every unit's sprite at u >= 2, so on phones low-priority enemy plates are hidden first); soft costs: covering another unit's body (+4), a ring (+2), its own body (+6), slot index (0.6 each).
- Edge arrow: badge radius 6u (smooth 8u), pointer 8u (smooth 10u) long, 10u wide with a 1.5u notch, 1u ink outline; box = radius + pointer + 1u (smooth 2.5u) on each side; first inset = margin (4u) + box half; inward steps of 3u up to a third of the view; arrows keep 2u from each other; pointer pulses 1u every 260 ms.
- Distance: metres = distance / `unit`, rounded; "1.2km" past 999 m; labels on the badge's inward side (else below, above, right, left), dropped when no side fits.
- Marker: diamond 5u half-size, 4u above the target's top (`h`), bob +-1.5u every 300 ms; else below the target; ground ping grows 6u -> 20u over 1.6 s.

## Common mistakes (symptom -> fix)

- Rings float above units or sit at their top-left -> `y` is the sprite's top, not the feet; pass the ground point (where the shadow is) and the sprite height as `h`.
- Rings and plates slide away from units as the camera scrolls -> units passed in screen px (camera already subtracted); pass world px.
- Each enemy shows its HP two or three times (plate bar, ring arc and the game's old over-head bar) -> hide the game's own floating HP bars and name tags while the world HUD is on (keep the HUD bars).
- Rings drawn over the sprites -> `drawGround` not called (the module then paints rings in `draw`); call it between the floor and the sprites, undoing any camera translate around it.
- Everything is offset by the HUD bar's height -> `view` is the whole canvas while the camera view starts below the bar; give the real view rect.
- A plate covers the quest text or a dialogue -> that box is missing from `safeRects()`; list every HUD box, windows while open.
- Two arrows to the same thing -> the goal is a unit and the unit also has `track`; use one of them.
- The marker points at a finished objective -> swap the `goal` target where the quest advances.
- No loss drain in a frozen `?t=` still -> `update` not in the replayed fixed step.

## Acceptance moments

Demo `demo/index.html` (Thornmeadow, 384 x 216 native pixel canvas, pixel-kit scenery), one clock for the script and `?t=`; `checks/state.json` lists the event of each moment and `checks/moments.py` confirms it:

1. `?t=1800&freeze=1`: village start: cyan rings under Aren, Mira and Bram (walking north), lilac plates on Elder Wynn and Tolla, a gold edge arrow north-east toward the shrine with its distance.
2. `?t=9500&freeze=1`: crowded fight: five slimes close in; the party's three plates, the focused slime's and the just-hit ones (enemies without a recent hit show only their HP ring), none overlapping, some shifted with leader lines; the focused slime's ring with its bracket reticle; hit sparks on slime-1 and ember-1 with pale loss segments on their bars.
3. `?t=11500&freeze=1`: loss segments draining on rings and bars, Bram under 30 % (his arc pulses red), slime-2 falls in a puff.
4. `?t=14000&freeze=1`: the quest panel (a HUD rect) open top-right: the goal arrow moved inward along its bearing below it; the Bramble King (boss) tracked by a red skull arrow on the right edge with "15m".
5. `?t=22000&freeze=1`: the shrine on screen: the gold marker above it with "3m" and a ground ping; the king's arrow at the bottom edge.
6. `?t=9500&freeze=1&phone=1`: phone layout (u = 2, HUD bar at 2x, canvas at a whole 3 device px per pixel at 390 px / dpr 3): only the party's plates and the focused slime's; the other enemies show their HP rings.

# E-13 Physics debris & breakables

## 1. What it is

The crunch of breaking things in a 2020s action game: a sword clips a crate and it bursts into planks that spin, clatter off the wall and lie flat on the floor; a clay pot pops into curved shards; a barrel splits into staves and iron hoops; a stone statue cracks twice, then crumbles; a crystal shatters into glassy splinters. A foe knocked back into a wall slams into it with a puff of dust and a few chips of stone, and its sprite bounces off. A defeated plant creature bursts into leaves, a rock beast into rubble.

Props are drawn in code (no image files) and cached at device resolution. When one breaks, it splits along a fracture pattern computed from its silhouette, and each piece is cut from the prop's own drawing, with a light rim on the fresh break, so the first frame of a break shows the same prop in pieces. Every piece is a small rigid body: position, velocity, angle and spin. It flies, tumbles, bounces off floors and walls with friction, turns to lie on its long side, rests, then fades. Every move is swept along its path (exact per tile when the game's walls are tiles, sampled every 2 px otherwise), so no piece ever passes through a wall at any speed. Pieces and dust come from fixed pools made once; when full, the oldest resting piece is reused.

It works side-on (gravity pulls down; pieces land on whatever the game says is solid) and top-down (pieces jump up in a fake height, cast soft shadows, land on the ground plane and bounce off walls). The module never reads input and never changes game state: breaks are reported through `onBreak`, a reflected velocity for wall bumps is offered but not applied, shake and hit-stop are requests.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `amount` | 1 | 0.5-2 | Multiplier on loose pieces and chips |
| `gravity` | 1 | 0.3-2 | 1500 px/s^2 x scale at 1 |
| `bounce` | 0.35 | 0-0.9 | Restitution (per material: wood 0.32, clay 0.24, stone 0.18, crystal 0.45) |
| `friction` | 0.6 | 0.1-1.5 | Sliding friction on floors |
| `rest` | 2600 | 400-8000 ms | How long a piece lies still before fading (-1 = never) |
| `fade` | 700 | 100-2000 ms | Fade length |
| `cap` | 320 | 64-800 | Piece pool; dust pool is 128 |
| `dust` | 1 | 0-2 | Dust puffs multiplier |
| `shake` | 3 | 0-6 | Shake strength (a break asks 2-4 px x scale for 180-260 ms) |
| `hitstop` | 40 | 0-120 ms | Freeze asked through `onHitstop` on a break (half on a crack) |
| `spin` | 1 | 0-2 | Angular velocity multiplier |
| `chips` | 1 | 0-2 | Extra small chips per break |
| `depth` | 0 | 0-24 px | Side view: floor depth pieces spread over (a floor seen at an angle) |
| `breakSpeed` | 240 | px/s | Speed a body needs in `touch()` to break props |
| `render` | auto | auto, smooth, pixel | Pixel: integer positions, rotation in 22.5 degree steps, no smoothing |

Fracture follows the material: wood and bark split into planks along the grain (five strips, most snapped once with a splintered zigzag end); stone, rock, clay, crystal and the rest into chunky Voronoi lumps (5-8 sides, aspect <= 3, small jitter on the edges, no crumbs under 1.2 % of the silhouette; check `chunky`); pieces are opaque inside (soft art pixels stacked solid), with a darker inner edge on cut sides only, no pale rim. Intact props are obstacles for pieces (`propsBlock`), pieces lying on a prop fall when it breaks, and `keepOut` foot rects are checked every step: pieces lying where feet are get kicked aside with a small hop (check `feet`), and pieces never stay on an intact prop's top (they slide off); `fixed` props (an anvil) are obstacles that never break: a blow on one gives a small spark of dust, never pieces. Foot rects cover standing feet too (pieces already asleep are pushed out on the next step). In top-down every material breaks into chunky lumps (no front-face strips) scattered radially around the prop, tumbling with a fake-height shadow; `keepBase` keeps a prop's base as one piece (the crystal's rock base stays, only crystal splinters fly), cut along a jagged line that follows the art's colour boundary (`baseLine`) with short stumps, never a straight edge (check `chunky`). Props can be **the game's own art**: `addProp({art: (g, h) => draw, hull, material})` cuts the pieces from that drawing (fracture grid by material: wood in long planks, stone and clay in chunks, iron in plates); `params.art = 'color'` fills pieces with the material's colours instead. Built-in prop kinds (height at scale 1 / hits to break / material): crate 36 / 1 / wood (3x3 fracture), barrel 40 / 2 / wood + iron hoops (staves), pot 32 / 1 / clay, statue (stone owl on a plinth) 54 / 3 / stone, crystal cluster 44 / 2 / crystal. Tints: crate 2, barrel 2, pot 3 (terracotta, blue glaze, green glaze), statue 2, crystal 2 (ice, amethyst).

## 3. Variants

- **Crunchy** (default).
- **Arcade chaos**: amount 1.6, bounce 0.55, friction 0.35, rest 5 s, dust 1.4, shake 5, spin 1.5, chips 1.75.
- **Calm and tidy**: amount 0.7, bounce 0.2, friction 0.9, rest 1.2 s, no shake, no hit-stop.
- **Heavy stone**: gravity 1.4, bounce 0.15, friction 1, spin 0.6, shake 4.
- **Pixel render**: render pixel, amount 0.8.

## 4. Interface

Needs: a fixed step calling `update(stepMs)` after movement (`update(0)` while stopped); `solid(x, y)` in world px and the tile size; the impact frame of each attack (`hit` / `hitRect` once); knocked-back bodies (`touch` per step, `wallHit` on the frame a wall stops one); defeats (`shatter`, optional); draw calls: props with the sprites (top-down: in the y-sorted list via `drawProp`), `drawGround` (top-down, optional) before the sprites, `draw` after them, before the HUD; `clear()` on new game / level change.

Provides: `addProp / removeProp / props / prop`, `hit / hitRect / touch / breakProp`, `shatter`, `dust`, `wallHit` -> reflected `{vx, vy}` and `offset(key)` -> `{x, y, sx, sy}` visual bounce, `shake()` -> `{x, y}`, hooks `onBreak`, `onShake`, `onHitstop`, `onSound`; `stats()`, `audit()` (pieces inside a wall: must be 0), `list()`, `hash()`.

## 5. Screen rules

- First frame of a break: the pieces sit exactly where the prop was drawn (no pop, no gap); a cut rim 0.016 x prop height wide (light) with a dark edge only on cut sides.
- Pieces start at 0.35-0.8 of `force` outward from the blow plus 0.55-1.15 along it (horizontal x 0.34 side view, x 0.32 top-down; side view 0.45-0.95 x force upward), so a heap stays within about one prop width or two; top-down pieces jump 0.3-0.75 x force in height and spread at 0.45 x force.
- A piece never ends a step with its centre inside a solid spot (`audit()` = 0); resting side-view pieces lie flat on a long, low edge (two corners on the floor line, never a corner; `checks` flat) (+ `depth` spread), with a soft contact shadow.
- Resting -> fade after `rest` ms over `fade` ms; all pieces of a break are asleep within 5 s at defaults (leaves: slowest).
- Dust: 10 puffs per break at 0.34 x prop height, in the material's colour (mixed with `dustTint`, the ground), soft blob clusters at most ~0.4 alpha, 0.3-0.6 s; never a bright disc.
- Wall bump: 4-12 puffs spreading out of the wall and along it, 1-7 chips, visual bounce up to 12 px x scale (`amp`) over ~0.5 s with a 32 % squash at contact; shake only above 0.6 x 300 px/s.
- Props draw a soft contact shadow; a crack adds 4-8 crack lines baked into the sprite; a hit flashes white for 90 ms and wobbles.
- Top-down: airborne pieces cast a shadow shrinking with height; resting pieces may be drawn under the sprites (`drawGround`).

## 6. Common mistakes

| Symptom | Fix |
|---|---|
| Pieces sink into the floor or sit inside walls | `solid` in screen px (camera subtracted) or missing floors; world px. `audit()` stays 0. |
| Pieces drift with the camera / appear far away | camera passed twice (translate + `camX`) or never. |
| Props break while the sword is held out | `hit` every frame of the swing; once on the impact frame. |
| `?auto=1` ends differently | props made solid on the bot's route, the bounce velocity applied, loot added, `onHitstop` honoured: keep the module cosmetic or prove the bot still wins. |
| Pieces move behind the pause menu | `update(0)` while stopped. |
| Knocked foe never bumps | `wallHit` needs the frame a wall stops the knock-back (the move returned blocked); not every frame. |
| Frozen still differs from play | everything is advanced in `update`; never call `update` from the draw pass. |

## 7. Acceptance moments

Demo `demo/index.html`, 640x360 field, canvas at any width (shots at 980 css px, dpr 2). The demo script and `?t=` share one clock (hit-stop only freezes the world) and every moment's `__state().events` already holds its event (`checks/state.json` `expect`, verified by `checks/shoot.py`). The demo breaks existing **painted** art from its own images: the demo kit's crate stacks, the painted-impasto pack's boulder and crystal; the painted anvil on its stump is the side-view wall; the top-down view is a painted meadow ringed by painted boulders.

1. **Crates break** `?t=860&freeze=1` (break at 683): the knight's blow; crate, barrel and sack pieces in the air, warm dust at the base.
2. **Crates behind** `?t=1560&freeze=1` (break at 1383): the knight turned left; the second stack's pieces fly; the first stack's pieces lie flat in a small heap.
3. **Knock-back through crates** `?t=2900&freeze=1` (break at 2767): the imp, sliding on its foot line, bursts through the third stack.
4. **Wall bump** `?t=3150&freeze=1` (bump at 3133): the imp's back touches the anvil, squashed against it (scaled about the contact point), iron dust at the contact; it rebounds (3260, 3360).
5. **Boulder crumbles** `?t=4720&freeze=1` (break at 4583): the golem's second blow; rock chunks fly left and stop at the anvil.
6. **Sword wave** `?t=6640&freeze=1` (break at 6433): the crystal shatters into glassy splinters.
7. **Top-down slash** `?view=top&t=860&freeze=1` (break at 683): crate pieces in the air with shadows under them.
8. **Top-down wall bump** `?view=top&t=3817&freeze=1` (bump at 3800): the slime, knocked through a crate stack, squashed against the boulder ring.
9. **Top-down settled** `?view=top&t=8000&freeze=1`: wood, rock and crystal pieces lying flat in small heaps, fading.
10. **Hosts**: hd-topdown and hd-sidescroll trial integrations; `?auto=1` ends as the original (`checks/hosts/README.md`).

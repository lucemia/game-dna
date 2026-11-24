# K-04 Belt depth

## 1. What it is

The depth model of side-view street brawlers. The floor is a band seen from slightly above: every character has a depth **z** from 0 (the back edge, which is the game's existing floor line) to `depth` (the front edge). Up / down walk along the band; a character nearer the front is drawn lower on the screen and in front of the ones behind it. A jump is height above the floor, drawn separately from depth: the body rises while a **contact shadow stays on the floor under the feet** (at floor + z), narrower and lighter the higher it goes, and none over a pit. Characters are drawn **sorted by their floor contact line** (floor + z), so a jumping character keeps its place in the order. A blow or a touch connects only between characters whose depths differ by at most the **tolerance**: stepping out of a lane dodges, and you must line up to hit. Foes line up with `chase`, an autopilot with `steer`, spawns get seeded lanes.

The module also draws the **floor band** itself (the walkable top face, `depth` px deep: a lit front lip and a dark line where the front face starts, textured per palette) on the floor runs it reads from the game's tile grid, so feet at any depth stand on visible floor, and keeps the player's band in view for vertical cameras. The game keeps its own x / y physics: z changes nothing until characters move in it.

## 2. Default parameters

| key | default | notes |
|---|---|---|
| depth | 24 px | world px; keep it below the thinnest platform a character stands on (16 px tiles: 8-10) |
| tolerance | 6 px | inclusive; about a third of the narrowest enemy |
| laneSpeed / chaseSpeed | 1.2 / 0.6 px per step | player / foe lane speed; foes chase only within `chaseRange` 160 px |
| shadowScale / shadowAlpha / shadowFade | 0.9 / 0.45 / 64 px | width x character width; at `shadowFade` lift the shadow is 58 % wide and 55 % as dark |
| floor | meadow | meadow, earth, stone, cobble, planks, or custom colours; `floorKinds` per tile kind |
| cue | off | on: the striker's lane (z +- tolerance) drawn on the floor while a blow is live |
| render | auto | pixel when view.h <= 270 (whole pixels, 1 px texture), else smooth (radial shadows, soft texture) |
| headroom / bandMargin | 72 / 6 px | `frameY` keeps these above the floor / below the front edge in view |

## 3. Variants

Street brawler (default) · Deep street (depth 48, tolerance 8, cobble) · Platformer band (depth 10, tolerance 4) · Teaching (lane cue on).

## 4. Interface

Needs: `belt.update()` once per fixed step; `walk(hero, dir)` from up / down; `chase(foe, hero)`; `steer` for an autopilot; `inReach(attacker, target)` in every damage test; `place` / `lane` on every new character; floors (`setFloors(gridFloors({...}))` or `floorAt`); `drawFloor(ctx)` after the tiles; the character draw loop as `render(ctx, items)`; `frameY` if the camera scrolls vertically; `toScreen` only when the game subtracts the camera by hand.

Provides: z with clamping, the reach test, lane helpers, floor band, shadows, depth-sorted drawing, the camera helper, `stats()` (`renders, shadows, noFloor, sinking, orderBad, reachChecks, reachTrue, reachFalse, maxDzTrue, chases, walks, bandOut, drawErrors, cbErrors`), `lastDrawn()`, `reachLog()`.

## 5. Screen rules (exact numbers)

- Sprite offset: every character drawn `round(z)` px lower (pixel) or `z` (smooth) than its unchanged position; nothing else moves.
- Shadow centre: (feet x, floor + z). Width `w x (1 - 0.42 k)`, alpha `a x (1 - 0.45 k)`, k = min(1, lift / shadowFade). Pixel: an ellipse 0.26 w tall in whole-pixel rows with a darker core (60 % wide); smooth: a radial gradient 0.28 w tall. All shadows are drawn before any sprite.
- Order: ascending floor + z, ties in the order given (stable).
- Floor band: `depth` rows from the run's top: back row shaded toward the edge colour, rows lighten toward the front (power 0.8), a 1 px lip highlight on the last row, then a 1 px edge line and a 1 px 25 % shade where the front face begins; run ends get a 1 px darker cheek. Textures are 128 px seamless strips anchored to world x (they scroll with the level).
- Reach: `abs(za - zb) <= tolerance`.
- Demo (256 x 144 pixel stage): street band 40 px deep at y 92-132, tolerance 7, fighters 32 px tall, HUD text >= 10 CSS px (scale x2 on phones), MISS over the target of the hero's whiff or over the foe that whiffed, damage numbers over the one hit, placed every frame above the highest body in their column (nudged up at most 14 px) or, with no room under the HUD, beside the head, always inside the canvas and covering no fighter, HUD plate or other label (checked frame by frame), one 5x7 size with a 1 px rim on every screen; a repeated MISS nearby refreshes the old one, a newer text on the same fighter replaces the older one, a fighter's texts clear when it falls; shadow core <= 0.72 x the median floor luminance (measured 0.41).

## 6. Common mistakes (symptom -> fix)

- Shadows float in the air under a jumping character -> the game's floor is not given (`setFloors` / `floorAt`), or feet are passed with the camera already applied.
- A character hovers above or stands below the drawn floor -> `depth` larger than the platform, or `drawFloor` not called / called before the tiles.
- A jumping character pops in front of / behind others -> it is drawn outside `render`, or sorted by its own y.
- Hits still land across lanes -> one damage path (contact, projectile, special) lacks `inReach`.
- `?auto=1` ends differently -> the autopilot does not `steer` into its target's lane, or enemies spawn on lanes and never `chase`.
- Up both jumps and walks into depth -> move jumping to the other jump key and update the help.
- Shadows or band drawn at the wrong place in a game that subtracts the camera by hand -> pass `toScreen`.
- Respawned hero always at the back edge -> `place` / `z` not set on the new object.

## 7. Acceptance moments

Demo (`demo/index.html`, "Lantern Row", a dusk market street at 256 x 144; pixel-kit fighters with real walk, strike (torso leaning in, weapon level), follow-through (weapon swept down), air strike (knees tucked, blade driven down-forward), recoil, jump and per-fighter lying knock-down frames (arms, boots, headgear, weapon dropped beside), each side painted, never mirrored, every frame on an 80 x 48 canvas with no pixel on its edge; hits flash a white silhouette with a 1 px dark rim for 3 steps (acceptance stills are taken 4 steps after the hit, in full colour), then the recoil pose with a small knock-back; a knock-down is recoil, a short fall, lying, dust; a recorded brawl that loops every 16 s, keys take over). Each moment's event is checked by `checks/demo-check.py` from `checks/state.json`.

1. `?t=1000&freeze=1` — **walk**: the hero walks in on the front half of the street with real walk frames; all three foes are in view on three lanes: raider (middle), lancer (back), brute (front).
2. `?t=1990&freeze=1` — **whiff**: the hero swings at the raider from 20 px nearer the front: MISS over the raider, the blade passes in front of it.
3. `?t=2920&freeze=1` — **hit**: lined up in the raider's lane, the blow has landed: the raider recoils in full colour, spark and damage number.
4. `?t=4200&freeze=1` — **cross-front**: the brute walks past the hero on the front lane and is drawn in front of him (its feet are lower on the street).
5. `?t=4700&freeze=1` — **cross-behind**: the lancer walks past the hero on the back lane and is drawn behind him.
6. `?t=6100&freeze=1` — **dodge-jump**: the hero jumps over the brute's swing: the body is high, his shadow stays on the cobbles under his feet, smaller; MISS over the brute.
7. `?t=6400&freeze=1` — **hit**: the jump attack lands on the way down: the hero, knees tucked, drives the blade down onto the brute's shoulders from in front of him (feet beside the brute, not on its head).
8. `?t=7850&freeze=1` — **dodge-lane**: the hero sidesteps toward the front during the brute's swing, about 24 px apart in x and 14 px in depth: MISS over the swinging brute.
9. `?t=9560&freeze=1` — **hit**: the brute followed into the hero's lane; the hero's blow lands.
10. `?t=12400&freeze=1` — **hit**: the lancer lined up on the hero's lane and its thrust landed: the hero recoils in full colour.
11. `?t=13800&freeze=1` — **ko**: the lancer was knocked down: it lies on its back with arms out, hood on, spear dropped beside it.

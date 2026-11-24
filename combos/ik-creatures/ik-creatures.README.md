# ik-creatures.js (E-14 module, v1.2.2)

One plain script, no dependencies, no `import`/`export`, ASCII only. It defines one global, `GameDNA_IKCreatures`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it.

It turns the game's ground-walking foes into **many-legged creatures**: a spider (8 legs), a crab (8 legs + 2 claws, walks sideways) or a centipede (a chain of segments, a leg pair each). The game keeps everything it already has (position, AI, hit boxes, HP); each fixed step it hands the module a list of `{id, kind, x, y, size, target}` and the module:

- **plants every foot on the game's ground** (side view: the ground surface under the foot from your `ground(x, y)`; top view: the floor, skipping spots your `walkable(x, y)` rejects) and **never moves a planted foot**;
- solves each leg with **2-bone IK** (hip, knee, ankle) plus a short tarsus to the foot tip; knees bend up and out, a leg never folds under its own hip, a knee that would end inside the ground bends straight up;
- **steps when a foot is stretched**: the legs form two alternating groups with no neighbours inside a group, so **two neighbouring legs are never off the ground together**; a swinging foot lifts over any rise on its path (lift, carry, drop), re-aims at a moving target, lands exactly on the ground, kicks a little dust;
- rides the **body above its feet** (height and pitch follow the planted feet, a soft spring, never a jump), **turns the body to face its path** at a bounded rate (a crab its side; in a side view the turn swings through the camera so you see its face), and **turns the head to the target** within limits (spider: head and chelicerae; crab: eye stalks and claws; centipede: head and antennae);
- in a side view, a foe that leaves the ground (knock-up, falling off a ledge) lets its legs **hang**; on landing every foot reaches for the ground again;
- a foe that is gone or `dead` **curls up**, sinks to the ground and fades in 0.9 s;
- draws each creature **per pixel**: lit (key light, wrap), rim light, gloss, a dark outline, markings (chevrons, bands, speckles), a soft contact shadow, at the canvas' **device resolution** (HD, read from the context transform) or at **native resolution with a fixed colour ramp and 1 px outlines** (pixel canvases).

Deterministic from `seed` and the game's steps; `update(0)` changes nothing; `draw` never changes state.

## API

`GameDNA_IKCreatures.create(options)` returns an instance.

| option | meaning |
|---|---|
| `view` | `'side'` (platformers: x right, y down, legs on the ground line) or `'top'` (top-down / 3/4 games: x, y on the floor, heights drawn up the screen). |
| `ground(x, y)` | **Side view**: the y of the ground surface at column `x`, the first one at or below `y`; if `(x, y)` is inside solid ground, the top of that solid run. World px. `null` = no ground (a pit). Wrap your tile test; see the example. |
| `walkable(x, y)` | Optional. `false` where a foot must not stand (water, walls, trees, a pit). Top view: the floor point; side view: the surface point. |
| `height(x, y)` | Optional, top view: floor height at a point (default 0, flat). |
| `actors()` | Called once per update: `[{id, kind, x, y, size, target, flash, dead, depth, facing, palette}]`. **`id` must be stable.** `kind` `'spider'` \| `'crab'` \| `'centipede'`. `x, y` world px: side view the **feet centre on the ground** (bottom centre of the foe's box), top view the foe's position on the floor; for a centipede this is its **head**. `size` = body length in px (spider ~ 0.9 x box width; centipede = whole length). `crouch` 0..1 lowers the body (wind-up before a leap). `target` `{x, y}` world px (or another actor's id) the head turns to, or `null`. `flash` 0..1 (hit flash), `dead` true when defeated (or just leave it out of the list). Side view `depth`: px toward the camera (to pass in front of / behind another). `facing` -1 / 1: start facing (side view). `palette`: per creature. |
| `scale` | Effect size per world px (~ view height / 360). Number or function. |
| `seed` | Integer. |
| `light` | Optional `{key: [x, y, z], rim: [x, y, z]}` world directions (z up). Default: key from the upper left front, warm rim from the back right. |
| `params` | See below. |
| `onStep(info)` | A foot planted: `{id, leg, x, y}` (footstep sounds, small particles). Optional. |
| `onEvent(e)` | `spawn`, `snap`, `land`, `forced`, `die`, `gone` with `{ev, id, t}`. Optional. |

| params | default | |
|---|---|---|
| `stride` | 0.30 | a foot steps when it is this far (x body length) from where it wants to be (shorter at speed) |
| `lift` | 0.16 | swing arc height (x body length) |
| `stepMs` | 150 | longest swing (slow walk); faster bodies swing faster |
| `turnRate` | 300 | body turn, degrees / s |
| `headRate`, `headYaw`, `headPitch` | 360, 40, 28 | head turn speed and limits (degrees) |
| `ride` | 1 | body height multiplier |
| `depth` | 0.05 | side view: near legs drawn this much lower per px of depth (they stand on the near edge of the ground; 0 = flat) |
| `outline`, `rim`, `gloss`, `dust` | 1 | look |
| `palette` | `auto` | `forest`, `ember`, `cave`, `frost` |
| `render` | `auto` | `pixel` when the context has `imageSmoothingEnabled === false`, else `hd`; or force one |

| method | |
|---|---|
| `update(dtMs)` | **Once per fixed step**, also under `?t=` fast-forward and autoplay; `update(0)` while the world is stopped (menus, dialogue, hit-stop). |
| `drawOne(ctx, id, camX, camY, {shadow})` | Draw one creature where your sprite of that foe was drawn (inside y-sorted lists). World px minus `camX, camY`; pass `0, 0` inside your own camera translate. |
| `draw(ctx, camX, camY)` | All creatures (sorted) and the footfall dust. |
| `creature(id)` | `{x, y, heading, headYaw, headPitch, facing, mode, air, legs: [{planted, swing, foot, knee, hip, ankle, nb}], ...}` (internal 3D: x, y = floor / depth, z up). |
| `list()`, `ids()`, `boxes()` | All creatures; drawn bounds in world px (`boxes`). |
| `clear()` | New game / restart. |
| `setParams(o)`, `params()`, `stats()`, `events()`, `hash()` | `stats`: `creatures, steps, plants, forced, snaps, lands, drawn, drawErrors, updErrors, cbErrors, badInput, nonFinite`. |

## Integration example (generic)

```js
const bugs = GameDNA_IKCreatures.create({ view: 'side', seed: 1, scale: VIEW_H / 360,
  ground: (x, y) => {                               // the game's own tile test, world px
    const c = Math.floor(x / TILE); let r = Math.max(0, Math.floor(y / TILE));
    if (isSolid(c, r)) { while (r > 0 && isSolid(c, r - 1)) r--; return r * TILE; }   // inside ground: top of that run
    for (; r < ROWS; r++) if (isSolid(c, r)) return r * TILE;
    return null;                                    // a pit
  },
  actors: () => foes.filter(f => f.walks).map(f => ({ id: f.id, kind: 'spider', x: f.x + f.w / 2, y: f.y + f.h,
    size: f.w * 0.9, target: { x: hero.x, y: hero.y }, flash: f.hitFlash ? 1 : 0, dead: !f.alive })) });
// end of the fixed step:  bugs.update(worldRunning ? STEP_MS : 0);
// where the foe sprite was drawn (inside the camera translate):  bugs.drawOne(ctx, f.id, 0, 0);  then its HP bar
// new game / restart:  bugs.clear();
```

Top view: `view: 'top'`, `walkable: (x, y) => !isSolid(Math.floor(x / TILE), Math.floor(y / TILE))`, `x, y` = the foe's floor position; call `drawOne` inside the game's y-sorted sprite list at the foe's y.

## Which kind where

- **spider**: any ground foe; the most forgiving (long legs, a lot of reach).
- **crab**: side view faces the camera and scuttles left / right; top view walks sideways to its path. Short, wide legs: best for slow to medium foes.
- **centipede**: long patrols and chases. `x, y` is its head; the body follows the head's trail exactly. Top view: the head steers toward the game's position with a turn radius, so an instant reversal becomes a U-turn. **Side view: no U-turn is possible in a line**, so give a side-view centipede paths without instant reversals (a long patrol, a chase), or use a spider.

## Speeds (measured, `checks/run-checks.js`)

Up to ~1.6 body lengths / s (centipede: ~5 leg spans / s) with reversals and turns: no neighbours lifted together, no forced steps outside the 0.5 s after an instant reversal. Faster (charges, dashes to 4 body lengths / s): planted feet still never slide or leave the ground, but a stretched leg may step out of turn (`stats().forced`) and a lifted foot may clip a ledge corner. Teleports (respawn, > 0.9 body length in one step) re-plant every foot (`snap`).

## Common mistakes

| symptom | fix |
|---|---|
| Feet float above or sink into the ground | `ground` in screen px, or returns the tile row not its top y; or `y` passed as the box top instead of the feet. |
| Creatures re-spawn every frame, legs never settle | `id` not stable (made per frame); give each foe a fixed id. |
| Legs streak, creatures jitter | `update` called per render frame, not per fixed step, or twice per step. |
| Creature drawn far from its hit box / slides with the camera | camera applied twice (inside a translate and as `camX`), or `x, y` in screen px. |
| Legs keep moving in the pause menu | `update(0)` while stopped. |
| Creatures pop in front of trees (top view) | `draw` called after the sprite list; use `drawOne` inside the y-sorted list. |
| A dead foe vanishes at once | keep calling `drawOne` for its id after death (it curls up for 0.9 s), or pass `dead: true`. |

## Self-check without a browser

- The module is unchanged and loaded before the game script; `update` runs once per fixed step on every path (`?t=`, autoplay, live), 0 while stopped; `clear()` on new game.
- `ground` / `walkable` use the game's own collision in world px; for a pit `ground` returns `null`.
- Worked example: a 32 x 24 foe box at x = 100, y = 276 on a tile top at y = 300 → `x: 116, y: 300, size: 29`; its feet plant at y = 300.
- The old foe sprite is no longer drawn for those foes; the HP bar, hit flash and AI stay the game's.

## Changes

- 1.1.0 (2026-11-19, strict critic r1): legs drawn as curved, tapered two-part segments with lit joints; parts away from the camera darker (leg pairs separate); spider cephalothorax / abdomen split with a folium and flank bands, radial grooves; crab legs fanned in depth, big and small two-finger pincers kept on their own sides, ridged shell; centipede flatter overlapping plates with lit lips; pixel render: light-cored legs and a 1 px dark outline round each creature; air pose splayed fore and aft with knees up, landing squash, `crouch`; centipede swings capped (no forced steps on its climb). API unchanged.
- 1.2.0 (2026-11-19, strict critic r2): feet off the ground ride with their hip (an offset easing to the hanging pose, never above the body), a step in progress ends when the body leaves the ground, landing steps go straight down to the ground; swing feet never lift above the hip; crab arms come out at the front corners with pincers held beside the face (palm, fixed finger, movable finger, gap), eye glints; centipede: a wide flat tergite over a narrower body plate per segment, legs hung from under the plate edge, foot tip in the leg colour, forcipules instead of a pale beak. API unchanged.
- 1.2.1 (2026-11-19, strict critic r3, centipede drawing only): legs drawn under the plates (only the lower leg shows past the plate rim, tapering to its tip, no knee ball), a lower swing, curved forcipules hooking down and inward, shorter antennae, two short tapered cerci; taller armour tergites. Other creatures and the IK unchanged.
- 1.2.2 (2026-11-19, strict critic r4, centipede drawing only): in a side view the centipede's legs are clipped per column to below the top edge of its armour plates, so a lifted knee never shows on its back (`checks/legclip.py`: no leg pixel above the plates over the whole climb in both views and in the sheet, with a mutant); two small cerci in the plate colour.

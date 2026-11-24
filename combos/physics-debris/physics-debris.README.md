# physics-debris.js (E-13 module, v1.4.2)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_Debris`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it.

It adds **breakable props** (crate, barrel, pot, statue, crystal, drawn in code) that crack when hit and **shatter into pieces cut from their own drawing**. Each piece is a small rigid body (position, velocity, angle, spin) that tumbles, bounces off walls and floors, slides, turns to lie flat on a long low edge (never on a corner), rests, then fades. Pieces born inside a wall (a foe dying against a cliff, a prop sunk into the ground) start from the nearest open spot (up first in side view). Every move is **swept along its path**, so a piece never passes through a wall however fast it flies. It also makes loose pieces of a material (`shatter`: rock, wood, clay, stone, crystal, leaf, bark, bone, shell, iron, spirit) for a creature or object that breaks apart, **dust puffs**, a small **screen shake** you may apply, and a **wall bump** for knocked-back bodies: dust and chips at the contact point, a reflected velocity you may use, and a visual bounce offset for the body's sprite.

Two views: `view: 'side'` (gravity pulls +y; pieces land on whatever `solid()` says is floor) and `view: 'top'` (top-down: pieces fly up in a fake height, cast shadows, land on the ground plane and bounce off walls).

The module never reads input and never changes your game's state: breaking a prop only calls your `onBreak`. Pieces and dust come from fixed pools made once (no garbage per frame); when the pool is full the oldest resting piece is reused. Everything depends only on the seed, the order of calls and `update()` time (no `Math.random`, no wall clock), so `?t=<ms>&freeze=1` shows the same frame every run.

## API

`GameDNA_Debris.create(options)` returns an instance.

| option | meaning |
|---|---|
| `view` | `'side'` (default) or `'top'`. |
| `scale` | World px per unit, about `viewHeight / 360` (1 for a 640x360 game, 0.62 for 224 px tall, 1.5 for 540). Number or function. Prop sizes, speeds and gravity are given at scale 1. |
| `seed` | Integer. Same seed + same calls = same pieces. |
| `solid` | `(x, y) => boolean` in **world px**: walls (and, in side view, floors and platforms). Pieces stop and bounce at solid spots. Optional (no walls). |
| `tile` | Size of your wall tiles, when `solid` is a tile test. Gives an exact swept test per tile. Without it the path is sampled every `sweep` px (default 2 x scale). |
| `bounds` | `{x, y, w, h}` world rect (or a function returning it). Pieces that leave it (fall into a pit) are freed. |
| `params` | `amount` 1 (multiplier on pieces), `gravity` 1, `bounce` 0.35, `friction` 0.6, `rest` 2600 (ms a piece lies still before it fades; -1 = never fade), `fade` 700 (ms), `cap` 320 (pool size), `dust` 1 (0 = none), `shake` 3 (0 = no shake), `hitstop` 40 (ms asked through `onHitstop` on a break), `spin` 1, `chips` 1 (small extra chips per break), `depth` 0 (side view only: px of floor depth pieces spread over, for a floor seen at an angle; keep 0 for a platform edge), `breakSpeed` 240 (px/s a body needs in `touch` to break props), `art` `'image'` (pieces cut from the prop's drawing) \| `'color'` (material colours), `dustTint` `''` (a `#rrggbb` ground colour mixed into all dust), `propsBlock` 1 (intact props are obstacles for pieces; 0 = pieces pass through), `render` `'auto'` \| `'smooth'` \| `'pixel'` (auto = pixel when the context has `imageSmoothingEnabled === false`: integer positions, rotation in 22.5 degree steps). |
| `keepOut` | `() => [{x, y, w, h}]` world rects (the feet of your characters): pieces lying inside one are kicked aside with a small hop. Optional; called every step (moving characters too). |
| `onBreak(info)` | A prop broke: `{id, kind, x, y, h, data}`. Drop loot, count, play a sound. Optional. |
| `onShake(px, ms)` | A break or a hard bump asks for a shake. Optional: or read `shake()` each frame. |
| `onHitstop(ms)` | A break asks for a short freeze. Optional; ignore it to keep your timing. |
| `onSound(name, info)` | `'crack'`, `'break'`, `'shatter'`, `'thud'` with `{kind, mat, x, y}`. Optional. |

| method | |
|---|---|
| `addProp({id, kind, x, y, h, hp, tint, variant, data})` → prop, or with your own art `addProp({id, art, hull, material, artKey, x, y, h, hp, data})` | A breakable at world `x` (centre) standing on `y` (its base line: the floor surface in side view, the feet line in top-down). `kind`: `crate`, `barrel`, `pot`, `statue`, `crystal`. `h` px tall (defaults 36 / 40 / 32 / 54 / 44 x scale); `hp` hits to break (1 / 2 / 1 / 3 / 2; earlier hits crack it); `tint` colour set (0-1, pot 0-2); `data` comes back in `onBreak`. Props do **not** block movement: add your own collision if they should. **Your own art** (use it when your game has painted or pixel props, so the pieces match): `art(g, h)` draws the prop `h` px tall with its base centre at (0, 0) (called once per size and cached; e.g. `(g, h) => g.drawImage(img, -w * h / ih / 2, -h, w * h / ih, h)`), `hull` its outline as a convex polygon in prop heights (`[[-0.4, 0], [0.4, 0], [0.4, -1], [-0.4, -1]]`, y up is negative; default a box `w` wide, `w` 0.8), `material` (`wood`, `stone`, `clay`, `iron`, `crystal`, `bone`, ...; sets the fracture, chips and dust), `artKey` shares one cache between props with the same art. `fixed: true` = never damaged (an anvil, a pillar: an obstacle pieces bounce off and slide off; a blow on it makes a spark of dust, never pieces), `keepBase` 0..0.8 = the bottom fraction of the prop stays as one piece (a crystal's rock base), cut along a jagged line with a few short stumps; `baseLine` `[[x, y], ...]` (prop heights, y up negative) makes that cut follow your art (e.g. where crystal colour meets rock), `chips` extra small chips per break (0 for painted props whose pieces already carry the texture), `hidden: true` = the module does not draw it (you draw it). |
| `removeProp(id)`, `prop(id)`, `props()`, `clearProps()` | `props()` is the live array (read only): `{id, kind, x, y, h, w, hp, alive, ...}`. |
| `hit(x, y, r, {dx, dy, force, damage, arc, spread})` → n | A blow: every prop whose body overlaps the circle loses `damage` (default 1) hp; at 0 it breaks, pieces flying along `(dx, dy)` at about `force` px/s (default 300). `arc` + `spread` (radians) limit it to a swing's cone. Returns how many props it touched. Call it **once on the impact frame** of an attack, not while the hitbox stays out. |
| `hitRect(x, y, w, h, {dx, dy, force, damage})` → n | The same with a rectangle (a sword box). |
| `touch(x, y, r, speed, {dx, dy, damage})` → n | A body moving at `speed` px/s through props: at `breakSpeed` or faster it hits them (a foe knocked into a pot). Call it every step while the body is knocked back; slow bodies do nothing. |
| `breakProp(id, {dx, dy, force})` | Break it now. |
| `shatter(material, x, y, {count, size, dx, dy, force, z, dust, shake})` → n | Loose pieces of a material at a point (a creature turning to stone, a defeated slime, ice blocks). `count` 10, `size` 5 px, `z` (top view) start height. |
| `wallHit(key, x, y, nx, ny, speed, {vx, vy, bounce, material, z})` → `{vx, vy}` | A knocked-back body hit a wall at contact point `(x, y)`; `(nx, ny)` is the wall's normal (pointing back toward the body); `speed` px/s. Makes dust and chips (`material`, default `rock`), a shake on hard hits, a visual bounce for `key` (`amp` px, default 4-12 by speed, with a squash), and returns the velocity reflected off the wall (from `vx, vy`, `bounce` 0.55). Apply that velocity only if your rules allow; the visual bounce works either way. The returned object is reused: copy the numbers. |
| `offset(key)` → `{x, y, sx, sy}` | The visual bounce of a body after `wallHit`: add `x, y` to its **draw** position (and scale by `sx, sy` if you like). `{0, 0, 1, 1}` when there is none. Never feed it back into positions. |
| `dust(x, y, {count, size, spread, color, z})` | Dust puffs (landing, a foe popping). `color`: `dust`, `stone`, `soil`, `snow`, `soot`, `spark`. |
| `update(dtMs)` | **Once per fixed step**, after your world moved. `update(0)` while the world is stopped (pause, menus, hit-stop). Internally steps at 60 Hz from accumulated time. |
| `drawProps(ctx, camX, camY)` / `drawProp(ctx, idOrProp, camX, camY)` | Draw intact props (with shadow, crack marks, hit flash and wobble). Side view: before your sprites. Top-down with depth sorting: push each prop into your y-sorted list with `p.y` as its key and draw it there. |
| `drawGround(ctx, camX, camY)` | Optional, both views: shadows and pieces lying on the ground, under your sprites (feet stand on the debris, not under it). Call before the sprites; `draw` then skips them. |
| `draw(ctx, camX, camY)` | Flying pieces and dust (and everything else when `drawGround` was not called). After your sprites, before the HUD. World px minus `camX, camY`; pass `0, 0` inside your own camera transform. Never throws. |
| `shake()` → `{x, y}` | Current shake offset (decaying). Translate your world drawing by it, or ignore it. |
| `clear({props})` | Drop every piece, puff and bounce (new game, restart, scene change); `{props: true}` also removes the props. |
| `setParams(o)`, `params()`, `stats()`, `audit()`, `list()`, `hash()` | Live params; counters `{pieces, sleeping, dust, props, peak, spawned, recycled, breaks, hits, cracks, shatters, wallHits, blocked, updates, frozen, draws, cbErrors, drawErrors, ...}`; `audit()` = live pieces whose centre is inside a solid spot (must stay 0); live pieces; a hash (determinism tests). |

`GameDNA_Debris.kinds`, `.materials`, `.dusts`, `.defaults`.

## Integration example (generic)

```js
const debris = GameDNA_Debris.create({ view: 'top', seed: 1, scale: VIEW_H / 360, tile: TILE,
  solid: (x, y) => isWallTile(Math.floor(x / TILE), Math.floor(y / TILE)), bounds: { x: 0, y: 0, w: WORLD_W, h: WORLD_H } });
function startLevel() { debris.clear({ props: true }); for (const p of LEVEL_PROPS) debris.addProp(p); }  // {id, kind, x, y}
// attack impact frame (once):
debris.hit(player.x + dirX * 26, player.y + dirY * 26, 30, { dx: dirX, dy: dirY, force: 320 });
// enemy knocked back into a wall (the frame it stops):
if (knockedBack && blockedByWall) debris.wallHit(enemy.id, contactX, contactY, normalX, normalY, knockSpeed, { material: 'stone' });
while (knockedBack) debris.touch(enemy.x, enemy.y, enemy.r, knockSpeed, { dx: kbX, dy: kbY });
// enemy defeated:
debris.shatter('leaf', enemy.x, enemy.y, { count: 8, dx: kbX, dy: kbY });
// fixed step, after movement:
debris.update(worldRunning ? STEP_MS : 0);
// draw, inside the camera transform: debris.drawGround(ctx, 0, 0); props in the y-sorted list
// via debris.drawProp(ctx, p, 0, 0); sprites drawn at x + debris.offset(id).x; then debris.draw(ctx, 0, 0);
```

## Common mistakes

| symptom | fix |
|---|---|
| Pieces fall through the floor or sit inside walls | `solid` gets screen px (camera subtracted) or is missing the floor; give world px. `audit()` must stay 0. |
| Pieces appear far from the prop, or move with the camera | `draw` got the camera twice (inside a translate and as `camX`), or not at all. |
| `?auto=1` ends differently after the change | Something now changes game state: props made solid on the bot's route, `wallHit`'s velocity applied, loot from `onBreak`, `hitstop` honoured. Keep those off (or prove the bot still wins). |
| Pieces freeze on screen | `update` not called every fixed step, or called with 0 while playing. |
| Props break while the sword is just held out | `hit` called every frame of the swing; once on the impact frame. |
| Pieces fly on during the pause menu | `update(0)` while the world is stopped. |

## Self-check without a browser

- The module file is byte-identical and loads before `create`.
- `update` is called exactly once per fixed step (also under `?t=` fast-forward and autoplay); `update(0)` while stopped.
- Every attack calls `hit`/`hitRect` once on its impact frame; knocked-back bodies call `touch` per step; `wallHit` only on the frame a body is first stopped by a wall.
- `solid` and every position are world px; `draw` gets the camera once.
- `clear()` runs on new game / restart / level change, before props are added again.
- `offset(id)` only changes where a sprite is drawn, never its position.

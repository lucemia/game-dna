# Add beat-'em-up depth to my side-view game

Defaults (change before pasting): `{{depth}}` = 16 · `{{tolerance}}` = 6 · `{{laneSpeed}}` = 1.2

---

You are given `belt-depth.js` and its `README.md` (read it first). **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged); never rewrite it.

It gives every character a depth `z` on the walkable floor (0 = my floor line, `{{depth}}` = front edge): characters walk up / down the floor, jumps keep a shadow on the ground, nearer characters draw in front, hits land only on the same lane.

Add code only; never delete existing functions.

**First, map my game**: the fixed step and its callers (loop, `?t=` fast-forward, autopilot); input keys; where hero and enemies are created and respawn; every place damage is dealt; the tile grid; the camera; the draw order.

**Integration points**

1. **Create one instance** after the level data exists:
```js
const belt = GameDNA_BeltDepth.create({
  depth: {{depth}}, tolerance: {{tolerance}}, laneSpeed: {{laneSpeed}},
  view: { w: VIEW_W, h: VIEW_H }, player: () => hero, camera: () => ({ x: camX, y: camY }),
  floorKinds: { /* tile kind -> 'meadow' | 'stone' | 'earth' | 'cobble' | 'planks' */ },
  // toScreen: (x, y) => ({ x: x - camX, y: y + offsetY })  only if my draw code subtracts the camera by hand
});
belt.setFloors(belt.gridFloors({ cols, rows, tile, solid: (c, r) => /* kind or false */ }));
```
`depth` below the thinnest platform; `tolerance` about a third of the narrowest enemy.
2. **Spawn**: hero `z` = half the depth; each enemy `belt.place(e, belt.lane(i))`; again on respawn and restart.
3. **Step** (once per fixed step, also in fast-forward): `belt.update()`; the hero `belt.walk(hero, (down ? 1 : 0) - (up ? 1 : 0))`; each enemy `belt.chase(e, hero)`. Add up / down to the input if missing; if up already jumps and another jump key exists, move jumping off up and update the help text.
4. **Autopilot**: steer into the lane of the foe it is about to meet: `const s = belt.steer(hero, foe); inp.up = s < 0; inp.down = s > 0;`.
5. **Hits**: add `&& belt.inReach(attacker, target)` to every damage test (sword, contact, projectiles, specials). Pickups and doors ignore depth.
6. **Draw**: `belt.drawFloor(ctx)` right after the level tiles; replace the loop that draws enemies and the hero by `belt.render(ctx, [{ a: e, draw: () => drawEnemy(e) }, ..., { a: hero, draw: drawHero }])` (same transform as before; the module shifts each by `z` and draws shadows). Draw them nowhere else.
7. **Camera**: if it moves vertically, `camY = belt.frameY(camY, VIEW_H, LEVEL_H)` after computing it.

**Keep every caller working**: `?auto=1` same ending as before; `?t=<ms>&freeze=1` same frame twice; title, restart, help text current.

**Self-check without a browser**
- Module byte-identical; `belt` exists before the first step and draw.
- Every damage path calls `inReach`; every floor character goes through `render` exactly once.
- `z` set on every new hero / enemy object.
- Example: tolerance 6, hero z 4, foe z 12 -> dz 8, the swing misses; three steps of down at 1.2 -> z 7.6, dz 4.4, it lands.

**Acceptance checks**
1. Up / down move the hero along the band; nearer foes draw over him.
2. A swing at a foe on another lane misses; lined up it lands. Off-lane touches do no damage.
3. Jumping: the shadow stays on the ground under the feet, smaller.
4. The band is drawn on every walkable surface; feet stay inside it.
5. `?auto=1` to the end: no console errors, same outcome as before.

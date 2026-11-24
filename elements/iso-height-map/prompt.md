Defaults: {{jump}}=3 (levels a unit climbs), {{fall}}=2 (extra levels it may drop), {{hgRange}}=2 (levels per +1 range), {{hgDamage}}=10 (% per step), {{side}}=1.25, {{back}}=1.5, {{step}}=4 (px per level), {{xray}}=active, {{facing}}=choose.

Turn my flat tile tactics game into an **isometric height map** with the module `iso-height-map.js` and its README (given with this prompt).

**Rules**
- Include the module **verbatim** in its own `<script>` before the game script.
- Never delete or rename a game function; add lines.
- Keep every control: keys, pointer/touch, end turn, restart, `?auto=1`, `?t=<ms>&freeze=1`, title and result screens.
- Keep my rules (damage, costs, turns, win conditions); height only adds the jump limit, high-ground range and a damage multiplier.

**1. Heights from the existing map**: add a `HEIGHT` grid the size of the layout. Open ground and roads 1, rough/cover tiles 2–3, walls and impassable tiles a tall block (5–6; still impassable by cost), water 0; add a rise or two. On the route between start areas no step may climb more than {{jump}}. `terrain(x, y)` maps tile types to art kinds (`grass dirt road stone rock water`…).

**2. Create** `iso = GameDNA_IsoHeight.create({...})` once the map and units exist: `cols, rows, height, terrain, units, occupant, cost` (the game's), `jumpOf` (unit's jump or {{jump}}), `facingOf/setFacing`, `getCursor` (`null` when hidden or off the map), `view` = map area above the HUD, `params: {jump: {{jump}}, fall: {{fall}}, hgRange: {{hgRange}}, hgDamage: {{hgDamage}}, side: {{side}}, back: {{back}}, step: {{step}}, xray: '{{xray}}'}`.
- `drawUnit(ctx, u, fx, fy, info)`: call the game's own unit-draw code with the context translated so the sprite's feet land on (fx, fy). If that code paints on a fixed context, draw just the sprite image when `ctx` is another canvas (the outline mask).
- `drawPos(u)`: while the game animates a unit in pixels (walk, lunge), its fractional tile `{x: px / TILE, y: py / TILE}`, else `null`.

**3. Rules**: in the game's reachability and any AI distance field, skip a neighbour when `!iso.canStep(u, x, y, nx, ny)` (a field built outward from targets tests the move from neighbour to current). Where it checks "can attack", use `iso.canHit(att, ax, ay, tx, ty)`. Multiply damage by `iso.damageMod(att, def).mult`. AI and autoplay use the same functions.

**4. Facing**: when a human unit's action ends, `iso.chooseFacing(u, () => <the existing end-of-action code>)` (skip if {{facing}} is `auto`). AI and autoplay: `iso.setFacing(u, iso.bestFacing(u))`; continue.

**5. Loop and draw**: `iso.update()` first in the fixed step (the freeze replay too). Draw background, `iso.draw(ctx)` in place of the flat ground and unit loop, effects, HUD, then `iso.drawUI(ctx, hudRects)`. Disable the game's own cursor and ground drawing with `if (false)`.

**6. Input**: keydown first `if (iso.key(e.code, true, e.repeat)) return;` (only facing-picker keys and Q/E), then the game's handler; keyup `iso.key(e.code, false)`. Pointer: `iso.pick(canvasX, canvasY)` instead of dividing by the tile size; HUD taps unchanged. While picking a facing, a tap on a neighbour tile faces it.

**7. Turns**: keep side phases if the game has them. If units act one at a time, use `iso.wt.next()` / `iso.wt.end(u, {moved, acted})` and `iso.drawOrder(ctx, x, y, 7)`.

**Self-check without a browser**
- Original functions exist; `iso` exists before the first frame and the freeze loop.
- Trace one autoplay turn: reach (`canStep`) → walk → attack (`canHit`, `damageMod`) → `setFacing` → turn ends.
- Example: attacker 2 levels up, hitting the back: mult = 1.1 × {{back}} = 1.65; base 6 → 10.

**Acceptance**: `?auto=1` still reaches the end screen; the cursor sits on tile tops; a unit behind a tall block is outlined; a cliff above its jump is not reachable; Q/E rotate; restart works.

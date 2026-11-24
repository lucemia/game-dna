# K-02 sprite-stacking module (`GameDNA_SpriteStack`, v1.0.0)

One dependency-free classic script (`sprite-stacking.js`, ASCII only, no `import` / `export`). Include it verbatim
(`<script src>` or pasted into a `<script>` tag before the game's script). It turns props into pseudo-3D objects made of
stacked pixel slices and draws them in the right depth order together with the game's own flat sprites.

How it works: every object is a small voxel model (built in code: crate, barrel, tree, pine, bush, rock, house, well,
stall, cart, buggy, lamp, fence, chest, sign; or your own slice data). For one view angle the module bakes the model into a
picture: its horizontal slices drawn bottom to top, one screen row of height after the other (so no gap ever opens between
slices, whatever the slice height), each pixel shaded by the face it shows (top, left, front...) with one light from the
upper left, a 1 px outline and a cast shadow. Pictures are cached per angle step (128 steps by default). Sorting compares
ground footprints (each model's convex hull, turned to the object's angle) in camera space, so a character is drawn behind a
house exactly when its feet are behind the house's footprint, from every side and at every camera angle.

## API

| call | what |
|---|---|
| `ss = GameDNA_SpriteStack.create(opts)` | `voxel` world px per voxel (1), `lift` px of height per slice (= voxel), `pitch` ground squash 0.3..1 (1 = the game draws its ground top-down), `steps` cached angle steps (128; 0 = exact), `outline` true / false / colour, `shadows` alpha 0..1 (0.3), `shadowLength` (0.55), `light` (radians, -0.62 = upper left), `res` bake resolution (`'auto'` = the context's scale, so HD canvases stay sharp), `flatW` default sprite width (12) |
| `ss.item(name, x, y, {angle, seed, size, model, scale, id})` | a stacked object; `x, y` = its ground centre in world px; `angle` in radians (a cart: its heading); `seed` picks a variant (tree, pine, bush, rock, stall); `size` in voxels; `model` = builder options, e.g. `{w: 64, d: 48, roof: 'blue'}` for a house |
| flat items | the game's own sprites in the same list: `{x, y, w, h, draw(ctx)}` with `x, y` = the feet in world px, `w` the sprite width. Without `x` the item is sorted by `y` only (old behaviour) and counted in `stats().flatNoX` |
| `ss.drawShadows(ctx, list)` | cast shadows of the stacks in `list`; call after the ground, before any sprite |
| `ss.draw(ctx, list)` | sorts `list` by footprints and draws it (stacks as pictures, flats through their `draw`); returns what it drew, in order |
| `ss.sort(list)` / `ss.order(list)` | sort only (in place) / the order with geometry, if the game draws itself |
| `ss.setCamera({x, y, yaw, sx, sy})` | optional turning camera: world point `x, y` shown at screen `sx, sy`, world turned by `yaw`. Use only when the ground turns too: draw the ground inside `ctx.save(); ss.groundTransform(ctx); ...; ctx.restore()` and place sprites with `ss.project(x, y)`; `ss.screenDir(vx, vy)` tells which 4-direction frame a walking character needs |
| `ss.model(name, opts)`, `GameDNA_SpriteStack.define(name, spec)` | get a model; add your own as slice data `{palette: {a: '#hex', g: ['#hex', 'glow']}, layers: [[rows], ...] bottom first, repeat: [n, ...]}` (rows run back to front, `.` = empty) or as a builder `function (opts) { var m = GameDNA_SpriteStack.newModel(w, d, h); m.set(x, y, z, m.c('#hex')); return m.finish(); }` |
| `ss.drawModel(ctx, name, x, y, angle, {scale, shadow})` | one model alone (menus, previews); `ss.slices(name)` its layers as small images |
| `ss.prewarm(names, n, ctx)` | bake `n` angles ahead (a camera that will turn) |
| `ss.set(key, value)` | change `pitch`, `lift`, `voxel`, `steps`, `outline`, `shadows`, `light`, `shadowLength` live |
| `ss.stats()`, `ss.lastDrawn()` | counters for checks and judges (`frames`, `maxStacks`, `maxFlats`, `mixedFrames`, `flatNoX`, `bakes`, `bakeMsAvg`, `errors`...); the last drawn list with footprints |

Never throws from `draw` / `drawShadows` (errors are counted). Deterministic: a picture depends only on the model, the angle
step and the options. No input, no audio, no timers.

## Integration (15 lines)

```js
var ss = GameDNA_SpriteStack.create({voxel: 1, outline: true, shadows: 0.3});
function solidProps() {                    // the props that become stacks, from the game's own map data (world px)
  var out = [];
  forEachVisibleTile(MARGIN_ROWS, function (kind, col, row) {      // include ~3 rows below the view: tall objects reach up
    var x = col * TILE + TILE / 2, y = row * TILE + TILE / 2;
    if (kind === TREE) out.push(ss.item('tree', x, y, {seed: (col * 7 + row) % 4, size: TILE - 2}));
    if (kind === ROCK) out.push(ss.item('rock', x, y, {seed: col + row, size: TILE - 4}));
  });
  return out;
}
// render, inside the game's camera transform, after the ground (draw plain ground where a stack replaced a tile):
var list = solidProps();
for (var e of enemies) list.push({x: e.x, y: e.feetY, w: e.w, draw: function () { drawEnemy(e); }});
list.push({x: hero.x, y: hero.feetY, w: 12, draw: drawHero});
ss.drawShadows(ctx, list);
ss.draw(ctx, list);
```

Sizes: a stack's footprint should match the solid area the game already uses (one tile, a house block), so characters
never stand inside it; collisions stay the game's own. A house block of 4 x 3 tiles: `ss.item('house', cx, cy, {model: {w: 64, d: 48}})`
with `cx, cy` the block centre (door on the +y / south side, `angle: Math.PI` turns it).

## Keep the game's other callers working

- `?t=&freeze=1` fast-forward, autoplay (`?auto=1`), title and battle screens, restart: drawing only changes; never move
  state into `draw`.
- Every sprite the old sort handled (hero, foes, NPCs, chests, pickups) goes into the same list with feet `x, y` and `w`:
  a sprite drawn outside the list is never hidden behind a stack.
- Remove the old flat art for the replaced props (tile picture or prop sprite), or the prop is drawn twice.
- A fixed top-down game keeps `yaw` 0; turn single objects with `angle` instead (crates at random angles, carts by heading).

## Self-check without a browser

1. Every replaced tile still draws ground under the stack (grass / floor), not its old art.
2. The prop loop covers rows below the view as well (a 3-tile-tall house standing below the screen still reaches into it).
3. Every flat item has `x` (feet centre), `y` (feet) and `w`; none is drawn a second time outside `ss.draw`.
4. `drawShadows` runs before `draw`, both inside the same camera transform as the ground.
5. `stats().flatNoX` stays 0 and `stats().mixedFrames` grows while the hero walks between props.

# Add sprite stacking (pseudo-3D props from pixel slices)

Defaults: `{{voxel}}` = 1, `{{lift}}` = 1, `{{pitch}}` = 1, `{{steps}}` = 128, `{{outline}}` = on, `{{shadows}}` = 0.3, `{{light}}` = -0.62

Add sprite stacking: the game's props become small voxel models drawn as stacked pixel slices (shaded, outlined, with a shadow), in correct depth order with the game's characters. You get `sprite-stacking.js` (global `GameDNA_SpriteStack`) and its README. Include the file verbatim (a `<script src>` before the game's script, or pasted unchanged into a `<script>` tag). Do not rewrite it.

## Steps

1. Read the game: where props come from (tile kinds, object lists), where the ground is drawn, where characters are sorted and drawn, and every caller of the draw code (title, battle, menus, `?t=` fast-forward, autoplay, restart).
2. Create one instance after the canvas exists: `var ss = GameDNA_SpriteStack.create({voxel: {{voxel}}, lift: {{lift}}, pitch: {{pitch}}, steps: {{steps}}, outline: {{outline}} === 'on', shadows: {{shadows}}, light: {{light}}})`. On games with large tiles (32 px or more) use `voxel: 2` and models at half their pixel size.
3. Map props to models with `ss.item(name, x, y, opts)`, `x, y` = the prop's ground centre in world px. Built-ins: crate, barrel, tree, pine, bush, rock, house, well, stall, cart, buggy, lamp, fence, chest, sign. Size them to the solid area the game already blocks (`size` in voxels; a house block: `model: {w, d, roof}`), so characters never stand inside a footprint. Vary trees and rocks with `seed` (keep 3-4 variants), turn crates or vehicles with `angle` (radians; a moving vehicle: its heading). New props: `GameDNA_SpriteStack.define(name, {palette, layers, repeat})` (README).
4. Where a stack replaces a tile or a prop sprite, draw plain ground there instead of the old art.
5. Rendering, inside the same camera transform as the ground: build one list per frame with the stacks of the visible area plus about 3 rows below it, and every flat sprite the old sort handled as `{x, y, w, h, draw}` with `x, y` = its feet in world px and `w` its width. Call `ss.drawShadows(ctx, list)` after the ground, then `ss.draw(ctx, list)` instead of the old sort-and-draw. If sprite draws subtract the camera themselves, translate the context for the stacks and wrap those draws to undo it.
6. Keep `yaw` 0 when the game's ground cannot turn. Only if the ground can turn: `ss.setCamera({x, y, yaw, sx, sy})`, draw the ground inside `ctx.save(); ss.groundTransform(ctx); ...; ctx.restore()`, place sprites at `ss.project(x, y)` and pick a walking character's frame from `ss.screenDir(vx, vy)`.
7. Do not change collisions, game state, input or random calls: this is drawing only. `?t=&freeze=1` stills and `?auto=1` must end exactly as before.

## Self-check without a browser

- Every replaced prop draws ground under it and no longer draws its old art.
- Every character, NPC, enemy, chest and pickup goes through `ss.draw` exactly once and has `x`, `y` (feet) and `w`.
- `drawShadows` runs before `draw`, in the same transform.
- The prop loop covers rows below the screen; title, battle and menu screens still draw as before.
- Example: a tree tile at column 5, row 3 with 16 px tiles is `ss.item('tree', 88, 56, {seed: 1})`.

## Acceptance checks

- Props look solid, lit from the upper left, with shadows and no gaps.
- The hero walking around a house or tree is hidden behind it when north of it and drawn over it when south of it, on every side.
- `ss.stats().flatNoX` is 0, `ss.stats().mixedFrames` grows while you play, `ss.stats().errors` is 0.
- No console errors; `?auto=1` ends as before.

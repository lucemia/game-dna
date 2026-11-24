// Basket hint for K-02 sprite-stacking: how to wire the module into an UNKNOWN top-down / 3/4-view game, by role.
// (The coordinator copies this file to tools/basket/sprite-stacking.mjs.)
// Drawing only: props become stacked-slice objects and the module draws them in one footprint-sorted list with the game's
// flat sprites. It never touches collisions, input, state or random calls.
export default {
  stage: 'actor',
  does: 'Sprite stacking: props (trees, rocks, crates, barrels, wells, fences, houses, carts, a buggy, lamps) become small voxel models drawn as stacked pixel slices with face shading from one light, a 1 px outline and a cast shadow; objects can turn (own angle, or a turning camera when the ground turns too). Stacks and the game\'s flat sprites are drawn in one list sorted by ground footprints in camera space, so characters pass behind and in front of props correctly from every side.',
  params: {
    voxel: 'create `voxel` (world px per voxel; 2 on 32-40 px tiles)', lift: 'create `lift`', pitch: 'create `pitch` (1 unless the ground is squashed)',
    steps: 'create `steps`', outline: 'create `outline` (true / false)', shadows: 'create `shadows`', light: 'create `light`'
  },
  steps: [
    ['Once, after the canvas exists', '`ss = GameDNA_SpriteStack.create({voxel: {{voxel}}, lift: {{lift}}, pitch: {{pitch}}, steps: {{steps}}, outline: {{outline}} === \'on\', shadows: {{shadows}}, light: {{light}}})`.'],
    ['Props (each frame, visible area + ~3 rows below)', '`ss.item(\'tree\' | \'rock\' | \'well\' | \'fence\' | \'house\' ..., groundCentreX, groundCentreY, {seed, size, angle, model: {w, d, roof}})` sized to the area the game already blocks; the replaced tile draws plain ground instead of its art.'],
    ['Render (inside the camera transform of the ground)', 'the old y-sorted sprite list becomes `list = props.concat(sprites.map(s => ({x: feetX, y: feetY, w, h, draw})))`; `ss.drawShadows(ctx, list); ss.draw(ctx, list)`.'],
    ['Turning camera (only when the ground can turn)', '`ss.setCamera({x, y, yaw, sx, sy})`; ground inside `ss.groundTransform(ctx)`; sprites at `ss.project(x, y)`; walk frames from `ss.screenDir(vx, vy)`.']
  ],
  gotchas: [
    'A character drawn over a house it stands behind -> it is drawn outside `ss.draw` (or before it).',
    'Wrong order beside long or turned props -> the flat item has no feet `x` / `w` (`stats().flatNoX` > 0).',
    'The old flat tree still shows under the stack -> the replaced tile still draws its art.',
    'Tall houses pop in at the screen bottom -> the prop loop stops at the last visible row.',
    'Stacks turn but the ground does not -> yaw on a game whose ground cannot turn; keep yaw 0, turn objects with `angle`.'
  ],
  checks: [
    'Props look solid, lit from the upper left, with shadows and no gaps between slices.',
    'The hero is hidden behind a house or tree when north of it and drawn over it when south of it; `?auto=1` ends as before.'
  ],
  selfcheck: [
    'Every sprite of the old sort goes through `ss.draw` once with feet `x`, `y` and `w`.',
    '`drawShadows` before `draw`, both in the ground\'s transform; replaced tiles draw ground only.'
  ],
  offers: {
    'anchor': { title: 'stacked props in the draw order', text: 'Props are drawn by `ss.draw(ctx, list)`: anything world-space the other element draws among the characters (shadows, rings, bubbles tied to a unit) goes into the same list as a flat item `{x, y, w, h, draw}` so it sorts with the props.' }
  },
  wants: {
    'ui-rects': { title: 'HUD rects', text: 'Stacks never draw outside the world pass; keep the other element\'s HUD drawn after `ss.draw`.', check: 'No stacked prop covers the other element\'s HUD.' }
  }
};

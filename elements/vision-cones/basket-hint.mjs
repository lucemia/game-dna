// Basket hint for B-15 vision-cones: how to wire the module into an UNKNOWN game, by role.
// The module decides who sees the player (cones clipped by walls, suspicion meters, '?' / '!' marks, patrols, calls for help);
// the game keeps its rules: it gives walls, the player point, hiding spots and guard positions, and decides what an alert does.
export default {
  stage: 'rules',
  does: 'Guards see through view cones clipped by walls (the same rays decide what is drawn and who is seen); each has a suspicion meter that fills faster close and centred and drains out of sight, a \'?\' badge whose glyph fills with the meter, then a red \'!\' on alert; an alerted guard calls nearby guards, loses the player and searches. Tall grass hides completely, shade halves sight. Patrols with look-around turns; guards face their cone. Alerts come back as hooks for the game\'s own chase rules.',
  params: {
    range: 'create `params.range` (px at scale 1)', fov: 'create `params.fov` (degrees)', react: 'create `params.react`', decay: 'create `params.decay`',
    sweep: 'create `params.sweep`', callRadius: 'create `params.callRadius`', shadow: 'create `params.shadow`', opacity: 'create `params.opacity`',
    palette: 'create `params.palette`', render: 'create `params.render` (keep `auto`: pixel when the context has `imageSmoothingEnabled === false`)'
  },
  steps: [
    ['Once, after the map exists (before the first new game)',
      '`vision = GameDNA_VisionCones.create({scale: VIEW_H / 360, params: {range: {{range}}, fov: {{fov}}, react: {{react}}, decay: {{decay}}, sweep: {{sweep}}, callRadius: {{callRadius}}, shadow: {{shadow}}, opacity: {{opacity}}, palette: \'{{palette}}\', render: \'{{render}}\'}, walls: {tile: TILE, cols: MAP_W, rows: MAP_H, solidTile: (c, r) => blocksSight(c, r)}, player: () => inScene && alive ? {x, y} : null, canSee: () => !windowOpen, hidden: (x, y) => tallGrassAt(x, y) ? 1 : shadeAt(x, y) ? \'shadow\' : 0})`. `player()` is the body middle in world px.'],
    ['Where each enemy is created (once per enemy, also in new game)',
      '`vision.add(enemy.id, {eye: spriteHeight, source: () => enemy.alive ? {x: enemy.x, y: enemy.y} : null})`; where it dies `vision.remove(enemy.id)`; new game / restart `vision.clear()`.'],
    ['Where an enemy decides to chase or attack', 'use `vision.isAlert(enemy.id)` as the trigger (or an extra one); keep the game\'s short close-range rule so contact still counts.'],
    ['Where an enemy sprite picks its direction', '`vision.dir4(id)` / `vision.side(id)` / `vision.facing(id)`: every guard faces its cone (frontal art can shift its eyes toward `facing`).'],
    ['Your fixed update step, after enemies move', '`vision.update(stepMs)`; `vision.update(0)` while paused or a window is open.'],
    ['Your draw pass', '`vision.drawCones(ctx, camX, camY)` after the ground, before the sprites; `vision.drawMarks(ctx, camX, camY)` after the sprites, before the HUD (`0, 0` inside a camera translate).'],
    ['Optional, in create()', '`avoid: () => [playerBox]` keeps badges off the player; `shade: [{x, y, w, h}]` shows the shortened reach where a cone crosses shade; `overCones: (ctx, camX, camY) => redrawWallTops()` in a 3/4 view whose wall caps rise above their tile.']
  ],
  gotchas: [
    'Cones in the wrong place or seeing across the map -> `player()` / `source()` in screen px; use world px and pass the camera to the draw calls.',
    'Cones pass through walls -> `walls` missing or in the wrong grid; give the tiles that block sight with the game\'s tile size.',
    'Seen in tall grass -> `hidden()` not wired or tested at the wrong point.',
    'Sprite looks one way, cone points another -> draw the sprite from `dir4` / `side` / `facing`.',
    'Cones over the characters -> `drawCones` belongs before the sprites.',
    'Autoplay stops fighting -> the alert replaced every contact rule; keep the close-range rule.'
  ],
  checks: [
    'Cones lie under the sprites and stop at walls; each guard faces its cone; stepping into a cone fills \'?\', leaving drains it; a full meter shows \'!\' and the game reacts; tall grass is never seen.',
    '`?auto=1` still reaches its ending with no errors; `?t=&freeze=1` is deterministic; restart leaves every guard calm.'
  ],
  selfcheck: [
    '`vision.update` once per fixed step after enemies move, `0` while stopped; `clear()` on new game.',
    '`player()` and every `source()` in world px or `null`; `add` once per enemy, `remove` on death.'
  ],
  wants: {
    'freeze': { title: 'hit-stop', text: '`vision.update(0)` while frozen.', check: 'During a hit-stop the cones hold still and no meter moves.' },
    'battle-start': { title: 'reset', text: 'Call `vision.clear()` there.' }
  }
};

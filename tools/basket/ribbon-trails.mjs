// Basket hint for E-15 ribbon-trails: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'effects',
  does: 'Smooth tapered ribbons behind fast things: a sword swing leaves a swept crescent from hilt to tip, a dash or lunge a soft body-wide ribbon, each projectile a thin curved trail with a bright core, a floating wisp a faint wake. A curve through the recent positions, thinning and fading with age. Teleports, scene switches and gaps start a new strip, `update(0)` holds still, so nothing is drawn across the screen. Drawing only: positions, hit boxes and rules never change.',
  params: {
    life: 'create `params.life` (ms)', width: 'create `params.width` (multiplier)', taper: 'create `params.taper`', fade: 'create `params.fade`',
    glow: 'create `params.glow`', smooth: 'create `params.smooth`', core: 'create `params.core`', palette: 'create `params.palette`',
    render: 'create `params.render` (keep `auto`: pixel when the context has `imageSmoothingEnabled === false`)', reduced: 'create `params.reduced`',
    contrast: 'create `params.contrast` (keep `auto`: a dark under-shadow on bright backdrops)'
  },
  steps: [
    ['Once, after the game state exists (before the first draw)',
      '`trails = GameDNA_Ribbons.create({scale: VIEW_H / 360, params: {life: {{life}}, width: {{width}}, taper: {{taper}}, fade: {{fade}}, core: \'{{core}}\', glow: {{glow}}, smooth: {{smooth}}, palette: \'{{palette}}\', render: \'{{render}}\', reduced: \'{{reduced}}\', contrast: \'{{contrast}}\'}})`.'],
    ['Weapon swings, dashes, lunges, knockback, projectiles: find where each moves and where its drawing computes the position',
      '`trails.follow(id, {kind, group, source})` for 2-5 sources. Blade: `kind: \'blade\'`, source returns tip `x, y` and hilt `bx, by` from the same angle and length the draw code uses, `null` outside the swing. Dash / lunge / charging enemy: `kind: \'dash\'` on the body centre (shows only at dash speed). Each projectile: `kind: \'projectile\', once: true` with a unique id, created where the projectile is spawned. Floaters: `kind: \'wake\'`. Sources return world px, or `null` while dead, gone, on the title or in another scene. Tie each id to ONE actor (look it up by its id inside the source, never "the nearest X"); `trails.remove(id)` when it dies for good or is replaced. A game whose attacks are only a sprite lunge or a menu "Attack" trails the weapon or body during that animation.'],
    ['Your fixed update step, after movement (every scene)',
      '`trails.update(stepMs)` once; `trails.update(0)` while the world is frozen (hit-stop), paused or stopped by a dialogue or menu. Also: `if (scene !== lastScene) { lastScene = scene; trails.clear(); }`.'],
    ['Your draw pass, in each scene that has ribbons',
      '`trails.draw(ctx, camX, camY, \'under\')` right before the sprites, `trails.draw(ctx, camX, camY, \'over\')` right after them, inside the shake translate; HUD and windows after. Inside a camera translate pass `0, 0`. Depth-sorted games: give the hero\'s blade `layer: \'own\'` and call `trails.draw(ctx, camX, camY, heroGroup)` right after the hero sprite.'],
    ['Where a new game, level or restart begins', '`trails.clear()`.']
  ],
  gotchas: [
    'One ribbon hops between actors or draws strips on two of them -> its source follows a slot ("nearest wisp"); one id per actor, `remove(id)` when it dies.',
    'A line across the screen right after a scene switch -> the old scene\'s strips drawn in the new scene\'s coordinates; `clear()` on every scene switch.',
    'The crescent floats beside the blade -> tip and hilt computed with a different pivot, angle or length than the drawn blade.',
    'A crescent from the idle pose to the swing start, or between swings -> the blade source must return `null` outside the swing.',
    'Ribbons slide with the camera -> screen px passed as the source in a scrolling game; pass world px and the camera to `draw`.',
    'Ribbons fade away under a pause menu or dialogue -> `update(0)` while the world is stopped.',
    'Ribbons missing or different in `?t=&freeze=1` shots -> `update` called from render; call it in the fixed step.',
    'Blurry ribbons on a pixel game -> `imageSmoothingEnabled` is true on the context; set it false or `render: \'pixel\'`.'
  ],
  checks: [
    'A swing leaves a smooth crescent along the blade\'s path that fades within `life`; no beads or seams.',
    'Dashes leave a soft body-wide ribbon, projectiles thin cored curves; teleports, respawns, scene switches and restarts never draw a line across the screen; pause holds ribbons still.'
  ],
  selfcheck: [
    '`trails.update` runs once per fixed step after movement, `0` while frozen or paused; `clear()` on restart and every scene switch.',
    'Every source returns world px of something that exists, or `null`; the blade source is `null` outside swings and matches the drawn blade.'
  ],
  wants: {
    'freeze': { title: 'hit-stop', text: '`trails.update(0)` while frozen.', check: 'During a hit-stop the ribbons hold still and continue after.' },
    'battle-start': { title: 'reset', text: 'Call `trails.clear()` there.' }
  }
};

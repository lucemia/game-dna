// Basket hint for A-08 bullet-patterns: how to wire the module into an UNKNOWN game, by role.
// The module owns bullets (patterns, movement, hit tests, drawing); the game keeps its rules: it gives the player's hit
// circle and applies damage in onHit through its own damage function.
export default {
  stage: 'rules',
  does: 'Enemies cast bullet patterns described as data (fans, aimed bursts, rings, spirals, flowers, waves, curtains with a moving gap, orbs that split into rings), pooled, drawn in code with bright cores, coloured rims, dark outlines and soft halos, hitting with a circle much smaller than they look; grazes, walls, bullet cancel when the caster dies. Damage goes through the game\'s own damage function.',
  params: {
    speed: 'create `params.speed`', density: 'create `params.density`', size: 'create `params.size`', hitbox: 'create `params.hitbox`',
    halo: 'create `params.halo`', graze: 'create `params.graze`', palette: 'create `params.palette`',
    render: 'create `params.render` (keep `auto`: pixel when the context has `imageSmoothingEnabled === false`)', damage: 'create `params.damage` (about 2-4 % of max HP)'
  },
  steps: [
    ['Once, after the game state exists (before the first draw)',
      '`bullets = GameDNA_Bullets.create({seed: 1, scale: VIEW_H / 360, params: {speed: {{speed}}, density: {{density}}, size: {{size}}, hitbox: {{hitbox}}, halo: {{halo}}, graze: \'{{graze}}\', palette: \'{{palette}}\', render: \'{{render}}\', damage: {{damage}}}, bounds: {x: 0, y: 0, w: WORLD_W, h: WORLD_H}, player: () => inScene && alive ? {x, y, r: 3} : null, canHit: () => !invulnerable && !windowOpen, onHit: (hit) => gameDamage(player, hit.damage), solid: (x, y) => wallAt(x, y)})`. `player()` is the small hit circle on the body in world px.'],
    ['Where each enemy spawns (once, not every frame)',
      '`bullets.emit(enemy.id, {pattern, every, range, source: () => enemy alive and in this scene ? {x, y} : null})`: weak enemies a small `fan` or `aimed`, a boss `cycle: [\'spiral\', \'flower\', \'ring\']`; `range` about half the view. Where it dies or is removed: `bullets.cancel(id); bullets.stop(id)`.'],
    ['Your fixed update step, after movement',
      '`bullets.update(stepMs)`; `bullets.update(0)` while paused, in hit-stop or while a dialogue or menu stops the world. Also: `if (scene !== lastScene) { lastScene = scene; bullets.clear(); }`.'],
    ['Your draw pass, after the sprites, before the HUD', '`bullets.draw(ctx, camX, camY)` (`0, 0` inside a camera translate).'],
    ['Where a new game, level or restart begins', '`bullets.clear()`.']
  ],
  gotchas: [
    'Bullets hit beside the player -> `player()` in screen px or the sprite corner; world px of the body centre.',
    'The screen floods -> `emit`/`fire` called every frame; once per caster.',
    'HP drops twice or the death screen is skipped -> damage written directly; call the game\'s damage function in `onHit`.',
    'A dead enemy keeps shooting -> its source must return `null`; `cancel` + `stop` on death.',
    'Bullets move under a pause menu -> `update(0)` while the world is stopped.',
    'Autoplay now dies -> damage too high or range too long; never change the bot\'s route.'
  ],
  checks: [
    'Enemies cast readable patterns; grazing is safe, a direct hit costs `{{damage}}` through the game\'s damage rule; walls stop bullets; a dead caster\'s bullets fade.',
    '`?auto=1` still reaches its ending with no errors; `?t=&freeze=1` is deterministic; restart and scene switches leave no bullets.'
  ],
  selfcheck: [
    '`bullets.update` once per fixed step after movement, `0` while stopped; `clear()` on restart and scene switches.',
    '`player()` world px of a few-px circle or `null`; `onHit` calls the damage function; one `emit` per caster.'
  ],
  wants: {
    'freeze': { title: 'hit-stop', text: '`bullets.update(0)` while frozen.', check: 'During a hit-stop the bullets hold still.' },
    'battle-start': { title: 'reset', text: 'Call `bullets.clear()` there.' }
  }
};

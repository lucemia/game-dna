// Basket hint for E-17 pixel-terrain: how to wire the module into an UNKNOWN game, by role.
// (The coordinator copies this file to tools/basket/pixel-terrain.mjs.)
// The module owns the level's ground: collision and drawing both read the carvable mask. The game keeps its own rules otherwise.
export default {
  stage: 'world',
  does: 'The ground becomes a bitmap that blasts carve: jagged craters with a scorched rim, dirt that flies and settles as sand, collapsing lips and crumbs, embers, fireball and smoke. Characters and items walk on the new surface through pixel-exact collision helpers; protected ground only takes soot. Pixel render for pixel-art games, smooth render for HD games.',
  params: {
    radius: 'blast radius: about 0.8 of a tile for a defeated foe (`TILE * 0.8`)', rim: 'create `params.rim`', scorch: 'create `params.scorch`',
    settle: 'create `params.settle` (0 = blasts never add ground)', debris: 'create `params.debris`',
    render: 'create `params.render` (keep `auto`: pixel when the context has `imageSmoothingEnabled === false`)'
  },
  steps: [
    ['Once, after the level exists (before the first draw)',
      '`terrain = GameDNA_PixelTerrain.create({w: LEVEL_W, h: LEVEL_H, seed: 1, scale: VIEW_H / 360, solid: (x, y) => the ORIGINAL tile test in world px, hard: (x, y) => bottom row / stone, paint: (g) => draw the ground tiles into g in world px, outside: {left: true, right: true, top: false, bottom: false} (the old off-map rule), keepOut: () => world boxes of characters and resting items, params: {rim: {{rim}}, scorch: {{scorch}}, settle: {{settle}}, debris: {{debris}}, render: \'{{render}}\'}})`.'],
    ['The wall / floor test', 'return `terrain.solid(x, y)` (every caller: movement, enemy edge checks, autoplay pit checks).'],
    ['The move functions', 'replace the tile snapping with `terrain.moveX(body, dx, {step: 3, ground: body.onGround})` (true when blocked) and `terrain.moveY(body, dy)` (`\'floor\'` | `\'ceiling\'` | null); bodies are top-left boxes in world px. Resting items: `terrain.fall(item, stepMs)` each step.'],
    ['Where a foe is defeated (once)', '`terrain.blast(foe.x + foe.w / 2, foe.y + foe.h, {{radius}})` at its feet.'],
    ['New game / restart', '`terrain.clear()`, then `terrain.protect(x, y, w, h)` the spawn, checkpoints, goal and 2-3 tiles around every gap or step the route jumps.'],
    ['The end of the fixed step', '`terrain.update(worldRunning ? stepMs : 0)`.'],
    ['The draw pass', '`terrain.draw(ctx, camX, camY)` instead of the ground tiles (`0, 0` inside a camera translate; a fixed draw offset as `-offset`); after the sprites, before the HUD: `terrain.drawFx(ctx, camX, camY)`.']
  ],
  gotchas: [
    'Characters walk on air over craters -> the wall test or the tile snapping still reads the old tiles; route both through the terrain.',
    'Old tiles drawn over the holes -> the ground tile loop is still drawn; draw `terrain.draw` instead.',
    'Autoplay falls into a gap it used to clear -> a crater at the take-off: protect the gap edges.',
    'Holes remain after restart -> `clear()` + `protect` in new game.',
    'A character balances on a spike or hangs over a fresh edge -> the game snaps bodies itself; land them with `terrain.moveY` / `terrain.fall` (they slip off ground the blasts left too thin), boxes as wide as the drawn feet.',
    'A walker treadmills in a crater -> walk frames only when its x changed this step; an AI stuck 0.5 s jumps toward its goal.',
    'Ground shifted by the HUD band -> pass the draw offset as `camY = -offset`.'
  ],
  checks: [
    'A defeated foe leaves a jagged, scorched crater; dirt flies and some settles as sand; walkers go down into it and out again.',
    'Nobody stands on air or inside the ground (`terrain.audit([...])` stays 0); `?auto=1` still finishes; restart restores the ground; `?t=&freeze=1` is deterministic.'
  ],
  selfcheck: [
    'No tile snapping left in move functions; every wall-test caller reads `terrain.solid`.',
    '`update` once per fixed step (0 while stopped); `draw` replaces the ground tiles; `clear()` + `protect` on new game.'
  ],
  offers: {
    'hit-site': 'A blast can also be a hit site: `onBlast(info)` gives `{x, y, r}` for damage numbers, sparks or a sound.',
    'freeze': 'Blasts ask for a shake through `onShake(px, ms)` / `shake()`: route it to the game\'s camera shake if it has one.'
  },
  wants: {
    'battle-start': { title: 'reset', text: 'Call `terrain.clear()` there, then `protect` again.' },
    'freeze': { title: 'hit-stop', text: '`terrain.update(0)` while frozen.', check: 'During a hit-stop the dirt and smoke hold still.' }
  }
};

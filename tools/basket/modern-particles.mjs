// Basket hint for E-11 modern-particles: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'effects',
  does: 'A pooled, seeded particle engine: hits throw streak sparks that fall, bounce on the floor and skid; defeats flash with a ring, sparks, embers and smoke; pickups twinkle; landings kick dust; ambient sources (torches, portals, opened doors) get embers, smoke or orbiting magic motes. Soft glowing sprites on HD canvases, whole-pixel particles on native pixel canvases; additive glow backs off on bright frames. Motion depends only on the seed, call order and game time.',
  params: {
    budget: 'create `params.budget` (pool size)', density: 'create `params.density`', scale: 'create `params.scale` (0 = auto from the view height)',
    render: 'create `params.render`', glow: 'create `params.glow`', gravity: 'create `params.gravity`', wind: 'create `params.wind`', bounce: 'create `params.bounce`'
  },
  steps: [
    ['Once at load, after the canvas exists',
      '`fx = GameDNA_Particles.create({seed: 1, view: {x: 0, y: 0, w: <logical width>, h: <logical height>}, params: {budget: {{budget}}, density: {{density}}, scale: {{scale}}, render: \'{{render}}\', glow: \'{{glow}}\', gravity: {{gravity}}, wind: {{wind}}, bounce: {{bounce}}}, ground, uiRects})`. `view` in the game\'s logical px (not the devicePixelRatio backing size). `ground(x, y)` -> world px: top y of the first solid surface at or below (x, y), or `null` over a pit, built from the game\'s own collision test without changing it (leave it out if there is no floor). `uiRects()` -> HUD, message box and end-panel rects in screen px (clipped out).'],
    ['Event sites in the update step, once per event, world px',
      'hit accepted (after cooldown / invulnerability): `fx.emit(\'sparks\', contactX, contactY, {facing: attacker left of target ? 1 : -1, amount: 0.6})`; defeat: `fx.emit(\'burst\', cx, cy)` (+ `shape: {type: \'outline\', image, w, h}` when the sprite is an image or canvas); pickup: `fx.emit(\'pickup\', x, y)`; landing and jump: `fx.emit(\'dust\', feetX, feetY, {floor: feetY})`; player hurt: `fx.emit(\'burst\', x, y, {color: \'blood\', amount: 0.4})`; checkpoint, heal, respawn: `fx.start(\'swirl\', x, y, {duration: 1200})`. Use at least four that fit the game.'],
    ['Ambient sources the level already draws (torches, lava, portals, chimneys, an opened door)', '`fx.start(\'embers\' | \'smoke\' | \'fountain\' | \'swirl\', x, y)` once when the source starts or appears; keep the handle (`move` it if the source moves).'],
    ['Your fixed update step, every scene, including the `?t=` fast-forward', '`fx.update(stepMs)`; skip it or pass 0 while paused.'],
    ['Your draw pass, after world sprites, before the HUD, outside the camera translate', '`fx.draw(ctx, -cameraX, -cameraY)` (plus any constant offset the world drawing adds); keep the devicePixelRatio transform.'],
    ['Where a run or level restarts, before its ambient emitters start again', '`fx.clear()`.']
  ],
  gotchas: [
    'Effects missing or different in `?t=&freeze=1` stills -> emits in the draw code, or `update` not in the fast-forward loop; emit in the step.',
    'Dozens of effects per hit -> the emit sits in a per-frame overlap test; emit where the hit is accepted.',
    'Console warns about 64 emitters -> `start` is called every frame; start once, keep the handle.',
    'Particles slide with the camera -> emit in world px, pass `-camera` to `draw` outside the camera translate.',
    'Particles tiny or huge -> `view` given in devicePixelRatio backing px instead of logical px.',
    'Sparks fall through the floor -> no `ground` (world px) and no `floor` option.',
    'Particles over the HUD -> pass HUD rects (screen px) from `uiRects()`.',
    'Autoplay ends differently -> added code changed game state or used `Math.random`; particles never need either.'
  ],
  checks: [
    'A hit throws streak sparks that fall, bounce and skid; a defeat flashes with a ring, sparks and embers; pickups twinkle; landings kick dust.',
    'No particle covers the HUD; particles stay with the world when the camera scrolls; `?t=4000&freeze=1` gives the same picture twice.'
  ],
  selfcheck: [
    'List every event site and its one emit (none before the hit is accepted, none in draw code); ambient `start` calls run once.',
    '`fx`, `ground` and `uiRects` exist before the first step; `ground` uses world px, `uiRects` screen px; trace one hit: event -> `fx.emit` -> `fx.update` -> `fx.draw` with the camera offset.'
  ],
  wants: {
    'hit-site': { title: 'hit sites', text: 'Emit `sparks` there (after the hit is accepted) and `burst` where a unit is defeated, once each.', check: 'Every accepted hit throws sparks at the contact point on the hit frame; every defeat bursts.' },
    'freeze': { title: 'hit-stop', text: '`fx.update(0)` (or skip it) while the world is frozen.', check: 'During a hit-stop the particles hold still.' },
    'ui-rects': { title: 'UI rects', text: 'Return them from `uiRects()` (screen px).', check: 'No particle covers the other element\'s windows, plates or HUD.' },
    'battle-start': { title: 'reset', text: 'Call `fx.clear()` there.' }
  }
};

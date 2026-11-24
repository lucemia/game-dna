// Basket hint for E-13 physics-debris: how to wire the module into an UNKNOWN game, by role.
// (The coordinator copies this file to tools/basket/physics-debris.mjs.)
// The module is cosmetic: breakable props, rigid-body pieces, dust, wall bumps. The game keeps its rules: props never block,
// the bounce velocity it offers is not applied, loot and hit-stop stay the game's choice.
export default {
  stage: 'effects',
  does: 'Breakable crates, barrels, pots, statues and crystals drawn in code; blows crack them, then they shatter into pieces cut from their own drawing that tumble, bounce off walls (swept: never through them), rest flat and fade. Defeated foes can burst into a material (leaves, rubble, shell, bone, crystal). A foe knocked into a wall makes dust and chips and its sprite bounces. Side view and top-down.',
  params: {
    amount: 'create `params.amount`', bounce: 'create `params.bounce`', friction: 'create `params.friction`', rest: 'create `params.rest`',
    fade: 'create `params.fade`', cap: 'create `params.cap`', dust: 'create `params.dust`', shake: 'create `params.shake` (apply `debris.shake()` to the camera, or ignore it)',
    hitstop: 'create `params.hitstop` (keep 0 unless the game already has a hit-stop counter)', spin: 'create `params.spin`', chips: 'create `params.chips`',
    depth: 'create `params.depth` (side view with a floor seen at an angle; 0 for a platform edge)', breakSpeed: 'create `params.breakSpeed`',
    render: 'create `params.render` (keep `auto`: pixel when the context has `imageSmoothingEnabled === false`)', gravity: 'create `params.gravity`',
    art: 'create `params.art` (`image`: pieces cut from the prop art; `color`: material colours)'
  },
  steps: [
    ['Once, after the map exists (before the first draw)',
      '`debris = GameDNA_Debris.create({view: \'side\' | \'top\', seed: 1, scale: VIEW_H / 360, tile: TILE, solid: (x, y) => the game\'s own wall test in WORLD px, bounds: {x: 0, y: 0, w: WORLD_W, h: WORLD_H}, keepOut: () => small world rects under each living character\'s feet (optional: resting pieces slide out from under them), params: {amount: {{amount}}, bounce: {{bounce}}, friction: {{friction}}, rest: {{rest}}, dust: {{dust}}, shake: {{shake}}, hitstop: {{hitstop}}, render: \'{{render}}\'}})`.'],
    ['Where a new game or level starts',
      '`debris.clear({props: true})`, then about 8-15 (fewer in a small level) `debris.addProp({id, kind: \'crate\' | \'barrel\' | \'pot\' | \'statue\' | \'crystal\', x, y})` (`y` = the floor line under it) in corners, beside walls and near fights, off narrow corridors. Props never block movement. When the game has its own prop sprites, pass them instead of a built-in `kind`: `addProp({id, x, y, h, art: (g, h) => draw the sprite h px tall with its base centre at (0, 0), hull: its convex outline in prop heights, material: \'wood\' | \'stone\' | \'iron\' | ...})`, so the pieces are cut from the game\'s own art.'],
    ['The impact frame of every attack (once)',
      '`debris.hit(x, y, r, {dx, dy, force: 320})` in front of the attacker, or `debris.hitRect(box.x, box.y, box.w, box.h, {dx})` with the hit box.'],
    ['Knock-back',
      'Every step a body is knocked back: `debris.touch(x, y, r, speedPxPerSec, {dx, dy})`; the step a wall first stops it: `debris.wallHit(id, contactX, contactY, normalX, normalY, speed, {material: \'rock\'})` (do not apply the returned velocity). Draw that body at its position plus `debris.offset(id)` (draw only).'],
    ['Where a foe is defeated', '`debris.shatter(material, x, y, {count: 8, dx, dy})` (`leaf`, `rock`, `bark`, `shell`, `bone`, `crystal`, `spirit`, ...).'],
    ['The end of the fixed step', '`debris.update(worldRunning ? stepMs : 0)` (0 in menus, dialogue, pause, title and end screens).'],
    ['The draw pass, inside the camera transform',
      'Side view: `debris.drawProps(ctx, 0, 0)` before the actors. Top-down: `debris.drawGround(ctx, 0, 0)` before the sprites and each prop in the y-sorted list as `{y: p.y, draw: () => debris.drawProp(ctx, p, 0, 0)}`. After the sprites, before the HUD: `debris.draw(ctx, 0, 0)`.']
  ],
  gotchas: [
    'Pieces sink into floors or sit inside walls -> `solid` got screen px (camera subtracted); world px. `debris.audit()` must stay 0.',
    'Pieces drift with the camera -> the camera was applied twice (translate and `camX`); pass `0, 0` inside the translate.',
    'Props break while the hit box stays out -> `hit` called every frame of the swing; once on the impact frame.',
    'Autoplay ends differently -> props made solid, the bounce velocity applied, loot or hit-stop added; keep the module cosmetic.',
    'Pieces fly on under the pause menu -> `update(0)` while the world is stopped.'
  ],
  checks: [
    'A blow breaks a crate into planks that tumble, rest flat and fade; a barrel needs two blows; a foe knocked into a wall makes dust and chips and bounces.',
    'No piece ends inside a wall (`debris.audit()` stays 0); `?auto=1` reaches the same ending; `?t=&freeze=1` is deterministic; restart leaves no pieces.'
  ],
  selfcheck: [
    '`debris.update` once per fixed step, `0` while stopped; `clear({props: true})` then `addProp` on every new game / level.',
    '`hit` once per attack; `wallHit` once per bump; world px everywhere; the camera applied once.'
  ],
  offers: {
    'freeze': 'Breaks ask for a hit-stop through `onHitstop(ms)` and a shake through `onShake(px, ms)`: route them to the game\'s one freeze / shake counter if it has one.'
  },
  wants: {
    'hit-site': { title: 'hit sites', text: 'Call `debris.hit(x, y, r, {dx, dy})` there too, once per landed or swung blow, so props in reach crack or break.', check: 'A blow next to a prop cracks or breaks it on the same frame.' },
    'freeze': { title: 'hit-stop', text: '`debris.update(0)` while frozen.', check: 'During a hit-stop the pieces hold still.' },
    'battle-start': { title: 'reset', text: 'Call `debris.clear({props: true})` there, then add the props again.' }
  }
};

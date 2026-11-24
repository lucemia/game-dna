// Basket hint for K-04 belt-depth: how to wire the module into an UNKNOWN side-view game, by role.
// (The coordinator copies this file to tools/basket/belt-depth.mjs.)
// The module never moves characters in x / y: it owns depth z, the reach test, shadows, the draw order and the floor band.
export default {
  stage: 'actor',
  does: 'Beat-\'em-up depth on a side-view stage: every character gets a depth z on a walkable floor band (up / down walk along it), jumps stay height above the floor with a contact shadow on the ground under the feet, characters are drawn sorted by floor + z and shifted by z, and hits connect only within a depth tolerance. Draws the floor band from the tile grid and keeps the band in view for vertical cameras.',
  params: {
    depth: 'create `depth` (world px; below the thinnest platform)', tolerance: 'create `tolerance`', laneSpeed: 'create `laneSpeed`', chaseSpeed: 'create `chaseSpeed`',
    floor: 'create `floor` (or `floorKinds` per tile kind)', shadowAlpha: 'create `shadowAlpha`', cue: 'create `cue`', render: 'create `render` (keep `auto`)'
  },
  steps: [
    ['Once, after the level data exists',
      '`belt = GameDNA_BeltDepth.create({depth: {{depth}}, tolerance: {{tolerance}}, view: {w: VIEW_W, h: VIEW_H}, player: () => hero, camera: () => ({x: camX, y: camY})}); belt.setFloors(belt.gridFloors({cols, rows, tile, solid: (c, r) => kind or false}))` (add `toScreen` only when the draw code subtracts the camera by hand).'],
    ['Spawn / respawn / restart', 'hero `z` = half the depth; `belt.place(e, belt.lane(i))` for each enemy.'],
    ['The fixed step (also in ?t= fast-forward)', '`belt.update()`; `belt.walk(hero, (down ? 1 : 0) - (up ? 1 : 0))`; `belt.chase(e, hero)` per enemy; the autopilot sets up / down from `belt.steer(hero, foe)`.'],
    ['Every damage test', 'append `&& belt.inReach(attacker, target)` (sword, contact, projectiles, specials); pickups ignore depth.'],
    ['Render', '`belt.drawFloor(ctx)` after the tiles; the enemy + hero draw loop becomes `belt.render(ctx, [{a: e, draw: () => drawEnemy(e)}, ..., {a: hero, draw: drawHero}])`.'],
    ['Vertical camera', '`camY = belt.frameY(camY, VIEW_H, LEVEL_H)` after it is computed.']
  ],
  gotchas: [
    'Up is also a jump key -> move jumping to the other jump key and update the help text, or depth cannot be walked.',
    'Shadows float under a jumping character -> floors not set (or feet passed with the camera applied).',
    'Hits still land across lanes -> a damage path without `inReach` (contact damage is the usual one).',
    '`?auto=1` ends differently -> the autopilot does not `steer` into its target\'s lane.',
    'Characters drawn twice (once by the old loop, once by `render`) -> remove them from the old loop.'
  ],
  checks: [
    'Up / down move the hero along the band; nearer foes are drawn over him; a jump keeps the shadow on the ground under his feet.',
    'A swing at a foe on another lane misses, lined up it lands; `?auto=1` ends as before.'
  ],
  selfcheck: [
    '`inReach` in every damage test; every floor character goes through `render` exactly once.',
    '`z` set on every new hero / enemy object; `belt.update()` once per fixed step.'
  ],
  offers: {
    'hit-site': { title: 'depth-checked hits', text: 'Hits land only after `inReach`, so damage numbers, sparks and shake on the hit site appear only for blows that really connected.' },
    'anchor': { title: 'drawn positions', text: 'Characters are drawn `belt.z(unit)` px lower than their x / y: add it to every anchor and sprite rect (screen y + z), and put world-space effects into the `render` items with `shadow: false` so they sort by depth.' }
  },
  wants: {
    'freeze': { title: 'hit-stop / pause', text: 'Skip `walk` / `chase` while the world is frozen.', check: 'Depth does not drift during a hit-stop.' }
  }
};

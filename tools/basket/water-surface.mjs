// Basket hint for E-18 water-surface: how to wire the module into an UNKNOWN game, by role.
// (The coordinator copies this file to tools/basket/water-surface.mjs.)
// The module draws water over pits / ponds, splashes when the game's bodies enter and floats props. It never moves the game's
// characters or changes its rules.
export default {
  stage: 'fx',
  does: 'Pits and ponds become water with a springy surface: anything that falls in throws a crown of droplets and a splash sheet, waves run to both banks and calm down; bodies drip when they leave and push a bow wave while wading; floating props bob on the waves; what is under the line is tinted and the bank is mirrored; an optional waterfall feeds a pool. Pixel render for pixel-art games, smooth render for HD games.',
  params: {
    palette: 'create `params.palette` (lake | sea | swamp | cave)', splash: 'create `params.splash`', droplets: 'create `params.droplets`',
    reflect: 'create `params.reflect`', ambient: 'create `params.ambient` (0 = still water)', waterfall: 'add a `falls` entry where a wall rises over a pool'
  },
  steps: [
    ['Once, after the level exists',
      '`water = GameDNA_WaterSurface.create({seed: 1, scale: VIEW_H / 360, pools: GAPS.map(g => ({x: g.x, y: g.bankY + TILE / 4, w: g.w, h: LEVEL_BOTTOM - (g.bankY + TILE / 4)})), bodies: () => [hero, ...enemies, ...shots].map(b => ({id: b.id, x: b.x, y: b.y, w: b.w, h: b.h})), params: {palette: \'{{palette}}\', splash: {{splash}}, droplets: {{droplets}}, reflect: {{reflect}}, ambient: {{ambient}}}})` (world px, top-left boxes, ids that never change).'],
    ['Floating props', '`log = water.addFloater({id: \'log1\', x, w, h, density: 0.5})`; draw the game\'s own art at `log.x` (centre), `log.y` (top) before the characters.'],
    ['The end of the fixed step', '`water.update(worldRunning ? stepMs : 0)` (live loop, `?t=` fast-forward and autoplay).'],
    ['The draw pass', 'after the last world sprite, before the HUD: `water.draw(ctx, camX, camY)` (`0, 0` inside a camera transform; a fixed draw offset as `-offset`).'],
    ['New game / restart', '`water.clear()`.']
  ],
  gotchas: [
    'Characters in a pit are not tinted -> `draw` runs before the sprites; move it after them.',
    'No splash ever -> `bodies()` makes new ids per frame or misses the hero; give objects a stable `id`.',
    'Splashes off to one side -> pools or bodies in screen px, or the camera applied twice.',
    'Waves keep moving in the pause menu -> `update(0)` while stopped.'
  ],
  checks: [
    'The hero falling into a pit makes one splash (crown, droplets, waves to both sides) and is tinted below the line; enemies and projectiles splash too.',
    'Floaters bob and stay on the surface; the water calms down; `?auto=1` still finishes the same way; `?t=&freeze=1` is deterministic.'
  ],
  selfcheck: [
    'The module is unchanged and loaded first; `update` once per fixed step on every path (0 while stopped); `draw` after the sprites; `clear()` on new game.'
  ],
  offers: {
    'hit-site': 'A splash is a hit site: `onSplash(info)` gives `{id, x, y, speed, kind, energy}` for sound, particles or damage numbers.'
  },
  wants: {
    'freeze': { title: 'hit-stop', text: '`water.update(0)` while frozen.', check: 'During a hit-stop the droplets and waves hold still.' }
  }
};

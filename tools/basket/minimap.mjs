// Basket hint for C-06 minimap: how to wire the module into an UNKNOWN game, by role.
// A UI layer that only reads the level, the player and what to mark: it never changes game state and never reads input, so it
// combines with any system. With B-03 fog-of-war in the basket it shows that fog's explored cells instead of its own.
export default {
  stage: 'ui',
  does: 'A corner map of the level that the player fills in by exploring: the tile grid baked once into a cached image per zoom, unexplored cells under a dark dither, an arrow on the player pointing where they face, markers for the goal, enemies, items, people and exits, a rim arrow toward an off-map goal, view brackets, three zoom levels and a full map with a legend and the explored share. It stays clear of the HUD rects the game names and fades while the player walks under it. Warm parchment look top-down, dark rooms with bright walls side-on; crisp on pixel canvases, smooth on HD.',
  params: {
    mode: 'create `params.mode` (`side` for side-on levels)', corner: 'create `params.corner`', size: 'create `params.size`', zooms: 'create `params.zooms`',
    fog: 'create `params.fog`', reveal: 'create `params.reveal`', enemies: 'create `params.enemies`', shape: 'create `params.shape`', theme: 'create `params.theme`',
    fadeUnder: 'create `params.fadeUnder`', render: 'create `params.render`'
  },
  steps: [
    ['Once the level exists, before anything can call it (also before a ?t= fast-forward loop)',
      '`minimap = GameDNA_Minimap.create({cols, rows, tile, cellAt, view, safeRects, player, camera, markers, params: {mode: \'{{mode}}\', corner: \'{{corner}}\', size: {{size}}, zooms: \'{{zooms}}\', fog: \'{{fog}}\', reveal: {{reveal}}, enemies: \'{{enemies}}\', shape: \'{{shape}}\', theme: \'{{theme}}\'}})`. `cellAt(c, r)` -> `wall`, `floor`, `water`, `tree`, `building`, `path`, `bridge`, `door`, `hazard` or `empty` in the level array\'s own row / column order; `view` = the screen rect where the camera view is drawn (not the HUD bar); `safeRects()` = every HUD box on screen now; `player()` = `{x, y, facing}` and `markers()` = `{id, kind, x, y}` in WORLD px; `camera()` = the world rect on screen. If the game already has a fog-of-war instance (B-03), pass it as `fog` so both show the same explored ground, and use `enemies: \'near\'`.'],
    ['Your fixed update step, every scene (also the ?t= replay)', '`minimap.update(stepMs)`.'],
    ['Your render, in play scenes only, after the HUD, outside any camera transform', '`minimap.draw(ctx)`. Not on title, battle or end screens.'],
    ['Where a new game or level starts', '`minimap.reset()`; `minimap.refresh()` when the level array was rebuilt or changed (a door opened).'],
    ['Your key handler, on keys the game does not use (consume them)', 'one key -> `minimap.toggleFull()`, one -> `minimap.cycleZoom()`; a pointer press where `minimap.hit(x, y)` is not null -> `toggleFull()` and nothing else.']
  ],
  gotchas: [
    'Arrow pinned to a map corner, markers bunched in the top-left -> `player` / `markers` return screen px; return world px (no camera subtraction, no HUD offset).',
    'The map is stretched or half missing -> `cols` / `rows` swapped or `cellAt` reads `level[c][r]`.',
    'The `?t=&freeze=1` still shows an unexplored map -> `update` is not in the replayed step.',
    'The minimap covers the score or timer -> that box is missing from `safeRects()`, or `view` includes the HUD bar.',
    'It sits on the player at a level edge and never fades -> no `camera()` (or `view` is not the play view).',
    'Arrow points backwards / up and down swapped -> a y-up angle; give words, +1 / -1, a y-down vector or `angle` with y down.',
    'The full-map key also moves or jumps -> the key reaches the game\'s input; consume it.',
    'The goal marker still points at a finished objective -> `markers()` must return exactly one `goal`, the current objective; swap it where the quest advances (the old one can become a `poi` landmark).',
    '`?auto=1` ends differently -> the minimap was given game logic (it must only read).'
  ],
  checks: [
    'The minimap sits in the chosen corner and never over a HUD box, also while a dialogue or banner is open.',
    'The arrow follows the player and points where they face; new ground becomes explored; markers sit where those things are, an off-map goal shows a rim arrow.',
    'Zoom changes the scale; the full map shows the whole level and a legend; walking under the minimap dims its map image (frame and arrows stay readable); `?auto=1` ends exactly like before.'
  ],
  selfcheck: [
    '`cols * tile` and `rows * tile` equal the level size; every callback returns world px; `view` and `safeRects()` use the same screen coordinates.',
    '`update` runs once per fixed step in every scene, also on the replay; `draw` runs after the HUD in play scenes only.'
  ],
  offers: {
    'ui-rects': { title: 'minimap rect', text: '`minimap.rect()` is the minimap frame (or the full map\'s panel) on screen, or null; add it to the other element\'s UI rects / obstacles so toasts, numbers and bubbles never land on it.' }
  },
  wants: {
    'ui-rects': { title: 'HUD rects', text: 'Add the other element\'s on-screen boxes (banners, toasts, boss bars, windows while open) to the minimap\'s `safeRects()` so it slides out of their way.', check: 'The minimap never covers the other element\'s boxes.' }
  }
};

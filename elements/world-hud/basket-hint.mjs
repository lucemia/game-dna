// Basket hint for C-12 world-hud: how to wire the module into an UNKNOWN game, by role.
// A UI layer that only reads units, the goal, the camera and the HUD rects: it never changes game state and never reads input, so
// it combines with any top-down / three-quarter / tactics system. Its plates and arrows avoid every rect the game (or another
// element) names, and it hands its own boxes out through rects().
export default {
  stage: 'ui',
  does: 'HUD pieces that live in the world and follow the camera: a ring under every unit\'s feet with an HP arc whose pale loss segment drains after a hit, name plates with level and HP above heads that never overlap each other, the HUD or the view edge (stacked or shifted with a leader line, hidden when nothing fits), a marker with the distance above the current goal, and edge arrows that point exactly at off-screen targets, sliding inward along the same bearing past HUD boxes. Crisp bitmap text on pixel canvases, smooth on HD.',
  params: {
    plates: 'create `params.plates` (`auto` = party always, enemies when targeted or just hit)', arc: 'create `params.arc`', squash: 'create `params.squash`', ringSize: 'create `params.ringSize`', arrows: 'create `params.arrows`',
    markers: 'create `params.markers`', distance: 'create `params.distance`', unit: 'create `params.unit`', plateHp: 'create `params.plateHp`', level: 'create `params.level`',
    lowHp: 'create `params.lowHp`', scale: 'create `params.scale`', render: 'create `params.render`'
  },
  steps: [
    ['Once the level exists, before anything can call it (also before a ?t= fast-forward loop)',
      '`hud = GameDNA_WorldHud.create({view, camera, units, targets, safeRects, params: {plates: \'{{plates}}\', arc: \'{{arc}}\', squash: {{squash}}, arrows: \'{{arrows}}\', distance: \'{{distance}}\', unit: {{unit}}}})`. `view` = the screen rect of the camera view (below a HUD bar); `camera()` = the world rect it shows; `units()` = every living unit `{id, x, y, r, h, team, name, level, hp, maxHp, boss, track}` in WORLD px with `y` at the FEET; `targets()` = exactly one `{id, kind: \'goal\', x, y, label}` for the current objective; `safeRects()` = every HUD box on screen now (windows while open).'],
    ['Your fixed update step, every scene (also the ?t= replay)', '`hud.update(stepMs)`.'],
    ['Your world render, after the ground and before the standing sprites, with the HUD\'s transform (undo a camera translate around the call)', '`hud.drawGround(ctx)` (rings and the goal ping).'],
    ['Your render, in play scenes only, after the world and the HUD, outside any camera transform', '`hud.draw(ctx)` (plates, marker, edge arrows). Not on title, battle or end screens.'],
    ['Where a new game starts / where the game picks a target', '`hud.reset()` / `hud.setFocus(id)`.']
  ],
  gotchas: [
    'Rings float at the sprite\'s top-left or above the unit -> `y` is the sprite top; pass the feet (ground point) and the sprite height as `h`.',
    'Rings and plates drift as the camera scrolls -> units in screen px (camera subtracted); pass world px.',
    'Rings drawn over the sprites -> `drawGround` not called between floor and sprites (the module then paints them in `draw`).',
    'Everything offset by the HUD bar -> `view` is the whole canvas while the camera view starts below the bar.',
    'A plate on the quest text or a dialogue -> that box is missing from `safeRects()`.',
    'Each enemy shows its HP two or three times (plate bar, ring arc, the game\'s old over-head bar) -> guard the game\'s own floating HP bars / name tags off while the world HUD is on; keep the HUD bars.',
    'Two arrows to the same thing -> the goal is a unit and that unit also has `track: true`; use one.',
    'The marker sits on a finished objective -> swap the `goal` target where the quest advances.',
    '`?auto=1` ends differently -> the HUD was given game logic (it must only read).'
  ],
  checks: [
    'Rings sit under the units\' feet and move with them as the camera scrolls; a hit leaves a pale segment that drains.',
    'Plates never overlap each other or a HUD box, also in a crowd and with a dialogue open; an off-screen goal shows an edge arrow pointing straight at it with the distance, an on-screen goal a marker.',
    '`?auto=1` ends exactly like before with no console errors.'
  ],
  selfcheck: [
    'Units and the goal are world px with `y` at the feet; `view`, `safeRects()` and both draw calls use the same screen coordinates.',
    '`update` runs once per fixed step in every scene, also on the replay; `drawGround` between floor and sprites, `draw` after the world in play scenes.'
  ],
  offers: {
    'ui-rects': { title: 'world HUD rects', text: '`hud.rects()` lists every plate, arrow, distance label and goal marker on screen now; add them to the other element\'s obstacles / UI rects so toasts, numbers and bubbles never land on them.' }
  },
  wants: {
    'ui-rects': { title: 'HUD rects', text: 'Add the other element\'s on-screen boxes (minimap, toasts, banners, boss bars, windows while open) to the world HUD\'s `safeRects()` so plates and arrows keep clear of them.', check: 'No plate, arrow or marker covers the other element\'s boxes.' }
  }
};

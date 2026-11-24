// Basket hint for E-19 loot-beams: how to wire the module into an UNKNOWN game, by role.
// An effect layer over the world: it throws, shows and pulls loot and only reports pickups (onPickup); what a pickup gives is
// the game's decision. It reads the wall test, the player, the camera and the HUD rects, never input.
export default {
  stage: 'fx',
  does: 'Loot drops: defeated foes and opened chests throw items that arc with a shadow, bounce and settle on free ground (never in a wall, water or off the map), then show a rarity-coloured beam, outline and name tag; items in reach fly to the player on a clear line and are picked up exactly once (onPickup). Rarities, items and drop tables are data; tags never overlap each other or the HUD.',
  params: {
    magnet: 'create `params.magnet` (0 = manual pickup)', beams: 'create `params.beams` (lowest rarity with a beam)', tags: 'create `params.tags`',
    distance: 'create `params.distance`', bounce: 'create `params.bounce`', beamHeight: 'create `params.beamHeight`', render: 'create `params.render`'
  },
  steps: [
    ['Once the map exists (before a ?t= fast-forward loop)',
      '`loot = GameDNA_LootBeams.create({seed, scale: VIEW_H / 360, tile, solid, bounds, player, camera, view, uiRects, avoid, onPickup, params: {magnet: {{magnet}}, beams: \'{{beams}}\', tags: \'{{tags}}\', distance: {{distance}}, bounce: {{bounce}}}})`. `solid(x, y)` = the game\'s wall / water test in WORLD px; `player()` = the player\'s feet `{x, y, h}`; `view` / `uiRects()` = the screen space the tag pass draws in (every HUD box and open window); `avoid()` = sprite boxes in world px.'],
    ['Where a foe dies / a chest opens (once)', '`loot.drop(feetX, feetY, \'foe\' | \'elite\' | \'boss\', {z: 12})` / `loot.drop(x, y, \'chest\', {dx: 0, dy: 1, spread: 3})`. Drops the game already makes (coins, XP) become specs `[{item: \'gold\', rarity: \'common\', count}]` credited in `onPickup` (old pickup code removed, the game\'s random calls kept in order).'],
    ['The fixed step, every scene (also the ?t= replay)', '`loot.update(worldRunning ? stepMs : 0)`.'],
    ['Render', '`loot.drawGround(ctx, camX, camY)` after the floor, before sprites; `loot.draw(ctx, camX, camY)` after sprites (0, 0 inside a camera translate); `loot.drawTags(ctx)` outside the camera translate, before the HUD.'],
    ['New game / restart; an autopilot that walked to drops', '`loot.clear()`; walk to `loot.list()` items with state `rest`.']
  ],
  gotchas: [
    'Loot in walls or water / at the map corner -> `solid` or drop points in screen px; world px, water included. `loot.audit()` must stay 0.',
    'Loot slides with the camera -> camera applied twice (inside a translate and as camX); pass 0, 0 inside the translate.',
    'Gold or XP counted twice -> the old pickup code still runs for the same drop.',
    'Never pulled in -> `player()` is the sprite top-left or screen px, or `update()` is not called in that scene.',
    'Tags on the HUD / a dialogue -> that box missing from `uiRects()`, or `uiRects` / `view` in another space than `drawTags`.',
    'Loot hangs in the air during a dialogue -> intended (update(0) while the world is stopped).',
    '`?auto=1` ends differently -> rewards now arrive on pickup (a little earlier with the magnet); keep them identical or report it.'
  ],
  checks: [
    'A defeated foe throws items that arc, bounce and settle on open ground; none in a wall, water or off the map (`loot.audit()` 0).',
    'Uncommon and better items show a beam in their colour; tags never overlap each other, the HUD or open windows.',
    'Walking close pulls items in; each is credited once; `?auto=1` finishes with no console errors.'
  ],
  selfcheck: [
    '`solid`, `bounds`, drop points, `player`, `avoid` in world px; `view`, `uiRects`, `drawTags` in one screen space.',
    '`drop` once per event; `update` once per fixed step in every scene; `clear()` on restart.'
  ],
  offers: {
    'ui-rects': { title: 'loot name tags', text: '`loot.rects()` lists the name tags on screen now; add them to the other element\'s obstacles / UI rects so numbers, toasts and bubbles never land on them.' }
  },
  wants: {
    'ui-rects': { title: 'HUD rects', text: 'Add the other element\'s on-screen boxes (minimap, toasts, banners, windows while open) to the loot\'s `uiRects()` so tags keep clear of them.', check: 'No loot tag covers the other element\'s boxes.' }
  }
};

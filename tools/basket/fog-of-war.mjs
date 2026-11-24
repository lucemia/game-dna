// Basket hint for B-03 fog-of-war: how to wire the module into an UNKNOWN tile-map game, by role.
export default {
  stage: 'effects',
  does: 'Everything outside the player units\' sight sinks under a slowly drifting, dithered fog with a soft one-tile edge; terrain stays faintly readable. Hidden enemies are not drawn (they still act; rules and AI are untouched), the tile where one was last seen keeps a faint silhouette, and a "!" pops when one comes into view. Forests and walls block sight, hills extend it, and tiles clear or fog over smoothly as units move.',
  params: {
    radius: 'create `params.radius` (fallback; pass `visionOf` from your unit stats)', shape: 'create `params.shape`', density: 'create `params.density`',
    edge: 'create `params.edge`', drift: 'create `params.drift`', fade: 'create `params.fade`', ghosts: 'create `params.ghosts`',
    pop: 'create `params.pop`', shroud: 'create `params.shroud`', scheme: 'create `params.scheme`'
  },
  steps: [
    ['Once, after your map and units exist, before the first frame',
      '`fog = GameDNA_FogOfWar.create({cols, rows, tile, view, params: {radius: {{radius}}, shape: \'{{shape}}\', density: {{density}}, edge: {{edge}}, drift: {{drift}}, fade: {{fade}}, ghosts: \'{{ghosts}}\', pop: \'{{pop}}\', shroud: \'{{shroud}}\', scheme: \'{{scheme}}\'}, posOf, isPlayer, visionOf, blocks, ghostSprite, uiRects})`, then `fog.recompute(units)`. `view` = the map\'s screen rect above the HUD (tile 0,0 at view.x/y when the camera is at 0). `posOf(u)` -> the tile where the unit is DRAWN (round its walking pixel position / tile), not pixels. `isPlayer(u)` = your side. `visionOf(u, x, y)` -> sight in tiles (+2 on hills if you have them). `blocks(x, y)` -> true for forest, walls, cliffs. `ghostSprite(u)` -> its sprite canvas, or `{img, flip}` if that side is drawn mirrored. `uiRects()` -> HUD, banners, open windows (screen px).'],
    ['Your fixed update step (also on the `?t=&freeze=1` replay)', 'After units move: `fog.update(stepMs)`.'],
    ['Your map draw pass',
      'ground and terrain (and range overlays) -> `fog.draw(ctx, cam)` -> units -> `fog.drawGhosts(ctx, cam)` -> cursor, HUD, banners; inside any shake translate; `cam = {x, y}` map scroll (omit without a camera).'],
    ['Every place that draws a unit or unit information (sprite, shadow, HP bar, hit flash, name plate, info or forecast window, target cursor, damage numbers)',
      'Draw an enemy only when `fog.isUnitVisible(u)`. Skip drawing only: never filter the list your rules, AI or autopilot read. Hidden means the player can\'t learn anything about the unit: no sprite, HP bar, shadow, selection/hover highlight, cursor change, info window, sound, camera move, or blocked cursor movement on its tile. Draw the cursor and every hover effect on fogged tiles exactly as on an empty tile.'],
    ['Where a game or map STARTS or restarts with new unit objects', '`fog.reset(); fog.recompute(newUnits);`. On title and result screens: `fog.setEnabled(false)`, `true` when play starts.']
  ],
  gotchas: [
    'Everything is fogged, even around the player -> `isPlayer` matches nobody or `posOf` returns pixels; it must return tiles.',
    'An enemy appears only after its walk ends -> `posOf` returns the logical tile; return the tile where it is drawn.',
    'A hidden enemy still shows its HP bar, shadow or info window -> guard every unit draw path with `isUnitVisible`, not only the sprite.',
    'Sweeping the cursor finds hidden enemies (it vanishes, changes colour, stops or opens a window on their tile) -> treat hidden units as empty tiles everywhere the game reacts to a unit under the cursor.',
    'Autoplay ends differently -> the unit list the rules or AI read was filtered; only drawing may ask the fog.',
    'Fog is missing in `?t=&freeze=1` shots -> `fog.update` is not in the replayed step.',
    'Fog slides when the camera scrolls -> pass the same `cam` to `draw` and `drawGhosts` as to the ground.',
    'Old ghosts after a restart -> `fog.reset()` where new units are built.'
  ],
  checks: [
    'Around the player units the map is clear; elsewhere darker, desaturated, with drifting dithered mist and a soft one-tile edge; terrain readable.',
    'Hidden enemies are not drawn at all and the cursor and hover effects look as on empty tiles over them; approaching one reveals it with a "!" above it; leaving one leaves a faint silhouette at its last-seen tile.',
    'Forest/walls block sight beyond them; hills extend it (where the map has them).',
    '`?auto=1` reaches the same ending as before.'
  ],
  selfcheck: [
    'List every unit draw path and its `isUnitVisible` guard; confirm no rule, AI or autopilot line reads the fog.',
    'List every place the game reacts to a unit under the cursor (cursor colour or visibility, hover highlight, info/forecast window, select or attack prompt, sound, camera, cursor blocking) and confirm each treats a hidden unit as an empty tile.',
    'Walk one move: unit steps -> `fog.update` -> new enemy in sight fires the "!", one left behind becomes a ghost; `draw`/`drawGhosts` run every frame including the single `?freeze=1` frame.'
  ],
  // Starter basket (FORMAT v1.2): how this addon plugs into a system starter's extension points ({{sys.*}}).
  addon: {
    steps: [
      ['Create', 'In the ADDONS slot, before the addon object: `const fog = GameDNA_FogOfWar.create({params: {radius: {{radius}}, shape: \'{{shape}}\', density: {{density}}, edge: {{edge}}, drift: {{drift}}, fade: {{fade}}, ghosts: \'{{ghosts}}\', pop: \'{{pop}}\', shroud: \'{{shroud}}\', scheme: \'{{scheme}}\'}, ...})` with {{with.create}}'],
      ['Clock', '{{sys.clock}}. {{with.clock}}'],
      ['Draw', '{{sys.draw}}: {{with.draw}}'],
      ['Hide', '{{with.hide}}'],
      ['Reset', '{{sys.reset}}: {{with.reset}}']
    ],
    gotchas: [
      'Hidden enemies drawn in the fog -> `game.isUnitVisible` was not replaced (Hide).',
      'Fog over units, range overlay or arrow -> `fog.draw` belongs in the addon `drawGround` hook, not in `draw`.',
      'Everything fogged around the heroes -> `posOf` must return tiles, not screen px.'
    ],
    checks: [
      'Around the heroes the map is clear; elsewhere fogged (dithered drifting mist, soft edge, terrain readable); enemies in fog are not drawn; approaching one shows a "!"; leaving one leaves a silhouette.'
    ],
    selfcheck: [
      'Cursor and hover over a hidden enemy look as on an empty tile (the grid module\'s hover window is a known leak: report it).',
      'Trace one autoplay move: walk -> `update` -> `fog.update` reads the drawn tile -> reveal "!" -> `drawGround` (fog) and `draw` (ghosts); nothing is edited outside the ADDONS slot.'
    ],
    with: {
      'grid-range-path': {
        create: '`cols: MW, rows: MH, tile: TS, view: {x: 0, y: 0, w: W, h: H}, units: () => game.units, isPlayer: u => u.side === \'a\', posOf: u => { const a = game.anchorOf(u.id); return a && { x: Math.round((a.x - TS / 2 + game.cam.x) / TS), y: Math.round((a.footY - TS + game.cam.y) / TS) }; }` (the tile where the unit is drawn, mid-walk too), `visionOf: (u, x, y) => {{radius}} + (MAP[y][x] === \'H\' ? 2 : 0)`, `blocks: (x, y) => \'FWM\'.includes(MAP[y][x])` (forest, wall, peak), `ghostSprite: u => ({ img: spriteFrames(u.name, u.side).idle0, flip: u.side === \'b\' })` (the art script\'s sprite, mirrored like `drawUnit` does), `uiRects: () => game.uiRects()`. Then push `{update, drawGround, draw, onTurnStart}` onto `game.addons`.',
        clock: 'In `update(game, {dt, frozen})`: `fog.update(frozen ? 0 : dt * 1000)` (dt is in seconds).',
        draw: '`fog.drawGhosts(ctx, cam);`. The fog layer itself goes in the addon `drawGround(ctx, cam)` hook: `fog.draw(ctx, cam);` (the starter calls it after the ground, before the grid overlays, arrow and units).',
        hide: 'In the ADDONS slot: `game.isUnitVisible = u => fog.isUnitVisible(u);`. The starter uses it for drawing only: a hidden enemy loses its sprite, HP bar, damage number, the grid unit window and the camera follow, while rules, the grid movement, `plan()` and `aiStep()` keep the full list. Do not edit the starter outside the ADDONS slot.',
        reset: '`fog.reset(); fog.recompute(game.units);`'
      }
    }
  },
  wants: {
    'ui-rects': { title: 'UI rects', text: 'Return them from `uiRects()`: the "!" pop never covers them.', check: 'No "!" pop covers the other element\'s windows, plates or HUD.' },
    'battle-start': { title: 'reset', text: 'Call `fog.reset(); fog.recompute(units)` there, where new unit objects are built.' }
  }
};

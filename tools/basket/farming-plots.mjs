// Basket hint for G-04 farming-plots: how to wire the module into an UNKNOWN game, by role, and the starter's extension points.
// Never name a host's functions here. {{key}} = parameter value chosen for this combo.
export default {
  stage: 'systems',
  does: 'Adds a farm loop on the tile grid: till, plant (season-checked seeds from a stall), water, crops grow one step per watered night through drawn stages, harvest once, a shipping bin that pays at night, seasons that wither out-of-season crops and repaint the farm, seeded rain, a 6:00-to-midnight clock with dusk, night and lamp light, sleep and a night summary. The farmer walks tile by tile (tap turns, second tap or hold walks) with a 4-frame walk and arm swing that follow distance, faces the tile he works and swings each tool. Crops and tools are data; a bot farms through the same key path.',
  params: {
    dayMs: 'create `params.dayMs`', seasonDays: 'create `params.seasonDays`', seasons: 'create `params.seasons`', rain: 'create `params.rain`',
    startGold: 'create `params.startGold`', walkMs: 'create `params.walkMs`', toolSpeed: 'create `params.toolSpeed`', night: 'create `params.night`', cursor: 'create `params.cursor`'
  },
  steps: [
    ['How your game maps onto it (decide before coding)',
      'A block of field tiles (2-row beds with a walkable row between them), three blocked tiles the farmer faces to use (shipping bin, seed stall, house door = bed) and his morning tile in front of the door, about 3 tiles of scenery around the walkable area (the HUD never covers him). Your lamps become `lights`.'],
    ['Once, where the farm starts',
      '`farm = GameDNA_FarmingPlots.create({cols, rows, tile: 16, seed, walkable: (cx, cy) => <your solid test, false for props>, field: [[cx, cy], ...], spots: {bin, shop, bed}, start: [cx, cy, \'down\'], lights: [[x, y, r]], params: {dayMs: {{dayMs}}, seasonDays: {{seasonDays}}, seasons: {{seasons}}, rain: {{rain}}, startGold: {{startGold}}, walkMs: {{walkMs}}, toolSpeed: {{toolSpeed}}, night: \'{{night}}\', cursor: \'{{cursor}}\'}, onEvent: ev => <your sounds / effects>, onEnd: r => <your results code, once>})`.'],
    ['Your fixed step (every loop that steps the game, fast-forwards included)',
      '`farm.update(stepMs)` once per step (night card included), then your camera follows `farm.farmer()`.'],
    ['Where the world is drawn (world px under the camera)',
      'your ground, `farm.drawSoil(ctx)`, your props merged with `farm.sprites()` sorted by `y`, `farm.drawFx(ctx)`, `farm.drawSky(ctx, visibleWorldRect)`; then in CSS px `farm.drawUI(ctx, {w, h, cam: {x, y, scale}})`.'],
    ['Your input',
      'keydown -> `farm.key(\'up\' | \'down\' | \'left\' | \'right\' | \'ok\' | \'back\' | \'tool\' | \'seed\' | \'1\'..\'9\')`, directions also `farm.setHeld(dir, true)`, keyup `setHeld(dir, false)`; a tap -> `farm.tapCell(cx, cy)`; your autoplay -> `farm.setAuto(on)`.']
  ],
  gotchas: [
    'The farmer walks into props -> `walkable` must be false for them (the module blocks crops and the spots itself).',
    'Legs move on the spot or slide -> do not animate him yourself; the module draws frames from distance walked.',
    'Crops never grow -> `update()` stops during the night card; call it every step in every scene.',
    'A different farm at another window size -> only the camera may depend on the viewport; pass a fixed seed.',
    'The HUD covers him at the map edge -> leave 3 tiles of scenery around the walkable area.',
    'Blurry pixels -> draw the world at native size and scale it by a whole number with smoothing off.'
  ],
  checks: [
    '`?auto=1` farms the whole year to `onEnd`; `?t=` stills repeat exactly.',
    'He turns, then walks with moving legs and arms; the tool hits the faced tile; a watered crop gains one stage per night.',
    'Gold never below 0; harvests count once; nothing covers him or the module HUD at 390 px.'
  ],
  selfcheck: [
    'Trace one day: key(\'ok\') with the hoe -> use -> till; seeds -> plant; can -> water; sleep -> sell -> day -> grow.',
    'Walk one growth: a turnip (2 days, 4 stages) watered two days: growth 0 -> 1 -> 2, stages 0 -> 1 -> 3.'
  ],
  // Starter basket (FORMAT v1.2): the documented extension points of starter/index.html (see starter/README.md).
  starter: {
    name: 'Thistledown Acre',
    modules: 'in the ADDONS SLOT `<script>` (pasted unchanged) or as `<script src>` tags right above it',
    register: 'push it onto `GAME.addons` in the ADDONS SLOT `<script>` of `index.html` (it runs before the game boots, so addons see the first day and every `?t=` frame) (hooks: `onEvent(ev, game)`, `onHarvest`, `onPlant`, `onWater`, `onTill`, `onUse`, `onShip`, `onBuy`, `onSell`, `onDay`, `onSeason`, `onWither`, `onGrow`, `onRipe`, `onKey(key, game)`, `update(game, info)`, `draw(g, layer, game)` with layers `world | hud | overlay`, `drawUI(g, game)`, `onScene`, `onNewGame`, `onEnd`). New crops and tools go in the same slot: `GAME.addCrop(id, {name, seasons, days, stages, seed, sell, regrow, yield, look: {kind, leaf, fruit}})`, `GAME.addTool(id, {name, action, area, ms, icon, colors})`. **Positions:** anything placed on or near the farmer uses the live `GAME.anchor(\'farmer\')` (CSS px) and stays outside `GAME.uiRects()` and `GAME.unitRects()`',
    hit: 'every rules event passes the event site (read-only) and reaches `onEvent(ev, game)` plus the named hook: `harvest {cell, crop, n}`, `ship {n}`, `buy {crop, n, gold}`, `sell {gold, lines}`, `day {season, rain}`, `season {season, withered}`, `use {tool, dir, target, cells}`, `till`, `plant`, `water`, `wither`, `end {earned}`',
    draw: '`draw(g, layer, game)`: `\'world\'` in world px (after crops, the farmer and particles, before dusk and rain; `GAME.view().cam` is the camera), `\'hud\'` in CSS px after the module HUD, `\'overlay\'` in CSS px last',
    rects: '`GAME.uiRects()` (`clock`, `hotbar`, `label`, `shop`, `banner`, `card`, `notice`, `title`; CSS px, valid under `?t=` without drawing), `GAME.unitRects()` (the farmer while awake, the merchant)',
    anchor: '`GAME.anchor(\'farmer\' | \'merchant\' | [cx, cy])` -> `{x, footY, top, left, w, h, world}` (CSS px); `GAME.cellRect(cx, cy)`, `GAME.worldToScreen(x, y)`, `GAME.view()` = `{w, h, cam: {x, y, scale}}`',
    clock: '`update(game, info)` runs every frame of every scene; `info.dt` is 16.67 ms, or 0 while paused. A farm day is 28 s; the night card 2.6 s. `GAME.pause(true)` stops the farm',
    reset: '`onNewGame(game)` (each new farm year)',
    builtins: { toasts: '`GAME.flags.builtinToasts = false` (the starter\'s one-line notices above the hotbar: harvests, shipping, not enough gold, no seeds)' },
    keep: '`?auto=1`, `?t=<ms>&freeze=1`, `?seed=`, `?dayMs=`, `?seasonDays=`, `?seasons=`, `?rain=`, arrows / WASD (tap turns, hold walks), Z, Space, Enter, X, Q, Tab, C, 1-9, P, taps on tiles, the hotbar, the shop and the night card, `GAME.held`',
    traceFrom: 'the event site (`onEvent` of an autoplay run: the first till, a turnip harvest on Spring 3, shipping at the bin, the Summer `season` event, the withered tomato `clear` in Fall)',
    autoCheck: '`?auto=1` still reaches the Harvest Fair card (the module phase `end`)'
  },
  offers: {
    'events': 'Every farm event goes through `onEvent(ev)`: harvest, ship, buy, sell, day, season, wither, use, end.',
    'ui-rects': '`farm.uiRects(view)` lists the clock panel, hotbar, prompt, shop, season banner and night card (CSS px, without drawing).',
    'anchor': '`farm.farmer()` (world px) and `farm.actors()`; the starter adds `GAME.anchor(id)` in CSS px.',
    'battle-start': 'A new year starts at `create` / `reset(seed)`; each morning fires `onEvent({kind: \'day\'})`.'
  }
};

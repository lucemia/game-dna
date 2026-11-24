// Basket hint for N-06 wfc-town-3d: how to wire the module into an UNKNOWN game, by role, and the starter's extension points.
// Never name a host's functions here. {{key}} = parameter value chosen for this combo.
// (Coordinator: copy to tools/basket/wfc-town-3d.mjs.)
export default {
  stage: 'systems',
  does: 'Adds a cosy 3D town builder (three.js 0.149.0): the player raises or lowers grid cells (sea -> land -> a house -> more storeys) and a wave-function-collapse solver picks every wall, door, window, balcony, lane, gable / hip / terrace / turret roof, stair and gate arch from socket rules, re-solving only the cells around the edit. Orbit camera, hover ghost, pop and dust on each edit, exact undo / redo, four palettes, soft shadows, gulls, a 2D map without WebGL. Deterministic from the seed and the edit history; verify() checks every side of every slot.',
  params: {
    palette: 'create `params.palette` (harbour | highland | dusk | blossom)', seed: 'create `params.seed`', arch: 'create `params.arch` (arch weight)', turret: 'create `params.turret`',
    flat: 'create `params.flat` (flat terrace weight)', door: 'create `params.door`', balcony: 'create `params.balcony`', radius: 'create `params.radius` (re-solve radius)',
    pitch: 'create `params.pitch`', zoom: 'create `params.zoom`', shadows: 'create `params.shadows`', gulls: 'create `params.gulls`'
  },
  steps: [
    ['Files and the place it lives (decide before coding)',
      'Load `three.min.js` then `wfc-town-3d.js` with plain `<script src>` tags before your game script. Pick the part of your game that becomes the builder (a town screen, a base, the whole game) and give it a WebGL `<canvas>` with your HUD canvas stacked on top.'],
    ['Once, where the builder starts (and before it: new tiles and weights)',
      '`GameDNA_WfcTown3D.setWeight(\'arch\', {{arch}}); setWeight(\'turret\', {{turret}}); setWeight(\'flat\', {{flat}}); setWeight(\'D\', {{door}}); setWeight(\'K\', {{balcony}})`; then `town = GameDNA_WfcTown3D.create({canvas, overlay: hudCanvas, w, d, maxH, seed: {{seed}}, radius: {{radius}}, heights: rows of digits (0 sea, 1 land, 2+ houses), params: {palette: \'{{palette}}\', pitch: {{pitch}}, zoom: {{zoom}}, shadows: \'{{shadows}}\', gulls: {{gulls}}}, onEdit: info => <your reaction>})`; `town.resize(cssW, cssH, devicePixelRatio)` now and on resize.'],
    ['Your fixed step (every loop that steps the game, fast-forwards included)',
      '`town.update(stepMs)` once per step, `0` while your world is frozen.'],
    ['Where the builder is drawn',
      '`town.render()`, then your HUD on `town.overlayContext()` (CSS px) or your own canvas.'],
    ['Your input while the builder runs',
      'Pointer (CSS px of the canvas): `c = town.pick(x, y)`, hover `town.setHover(c, mode)`, click `town.grow(c.x, c.z)` / `town.shrink(c.x, c.z)`; a drag over ~8 px orbits (`town.orbit(-dx * 0.35)`, `town.setPitch`), wheel `town.zoomBy`. Keys: arrows through `town.gridDirFromScreen(dx, dy)` move a cursor cell; confirm grows, another key lowers; `town.undo()` / `town.redo()`; camera turns. Touch buttons for each.'],
    ['Your goals, unlocks, score',
      'In `onEdit(info)` read `town.town.counts()` (`land, houses, storeys, tallest, doors, arches, stairs, turrets, extra`) and drive your own goals or rewards; your autoplay (if any) builds through the same calls.']
  ],
  gotchas: [
    'The whole town reshuffles on each click -> you re-created the town or called `resolveAll()`; only `grow` / `shrink` / `set`.',
    'Undo gives a slightly different town -> call `town.undo()`, never re-solve or rebuild from heights.',
    'Different town on every reload -> a fixed `seed`; no `Math.random` in anything that edits the town.',
    'Clicks hit the wrong cell -> pass CSS px of the canvas to `pick`, call `resize` on load and resize.',
    'A still at `?t=` shows no pop or gulls in the wrong place -> `update(dt)` belongs in the fixed step, not the render loop.',
    'A new tile never appears -> its socket letters need `registerPair` with the sockets they may touch (and `allowAir` for sides open to the sky), before `create`.',
    'Black page on a device without WebGL -> keep the overlay canvas; the module draws a 2D map there.'
  ],
  checks: [
    'Clicking sea makes land, land a house, a house a storey; doors open onto lanes, ridges join, an arch appears between two houses with a lane through, stairs climb onto flat terraces.',
    '`town.town.verify().ok` is true after every edit; undo then redo gives the same `serialize()`.',
    'Your HUD never covers the island centre; a 390 px phone can build with touch.'
  ],
  selfcheck: [
    'Trace one click: pointer -> pick -> grow -> onEdit -> counts -> your goal or reward.',
    'Trace one undo: undo -> onEdit (kind undo) -> serialize() equals the snapshot before the edit.'
  ],
  // Starter basket (FORMAT v1.2): the documented extension points of starter/index.html (see starter/README.md).
  starter: {
    name: 'Harbour Charter',
    modules: 'in the ADDONS SLOT `<script>` (pasted unchanged) or as `<script src>` tags right above it; three.js is already loaded',
    register: 'push it onto `GAME.addons` in the ADDONS SLOT `<script>` of `index.html` (it runs before the game boots, so addons see the first frame and every `?t=` replay) (hooks: `onEdit(ev, game)`, `onGoal(goal, game)`, `update(game, info)`, `draw(ctx, game)`, `drawUI(ctx, game)`, `scene3d(THREE, scene, game)`, `onKey(e, down, game)`, `onScene`, `onEnd`, `onNewTown`). New tiles, socket pairs and goals go in the same slot: `GAME.addTile({id, slot, sides, rotate, weight, build(api, info)})`, `GAME.addPair(a, b)`, `GAME.allowAir(s)`, `GAME.addGoal({id, label, need, count: counts => n})`',
    hit: 'there is no combat: the event site is `act(kind, x, z)` -> `onEdit(ev)` after every grow / shrink / undo / redo (`ev = {kind, x, z, from, to, changed: [{x, z}], counts}`), `onGoal(goal)` once per completed goal (`{id, label, need, index}`), `onEnd(\'charter\')` once when all goals are met. Edit from addons with `GAME.act(kind, x, z)`',
    draw: '`draw(ctx, game)`: the 2D overlay in CSS px, right after the 3D render, before the HUD; `drawUI(ctx, game)` after the HUD and banners, before the charter card',
    rects: '`GAME.uiRects()` (goal card, palette chips, stats pill, toolbar, cursor tag, banner, charter card; `{name, x, y, w, h}` CSS px, last frame) and `GAME.setUIRect(name, rect)` for your own',
    field: 'the whole window (`GAME.view = {w, h}` CSS px; `GAME.field`); 3D scene in `GAME.v.three()` -> `{THREE, scene, camera, renderer}`',
    anchor: '`GAME.anchorOf(x, z)` / `GAME.anchor(\'x,z\')` -> `{x, y (top of the column), footX, footY, visible}` CSS px, following the camera; no units (`GAME.unitRects()` is empty)',
    clock: 'fixed 60 Hz; `update(game, info)` every step (`info.dt` 16.67 ms, `info.t` game ms); no pause or hit-stop',
    reset: '`onNewTown(game)` (R: a new island); `onScene(\'play\' | \'complete\', game)`',
    builtins: { notices: '`GAME.builtinNotices = false` (goal banners; `onGoal` still fires)', numbers: 'nothing to turn off (no combat numbers)' },
    keep: '`?auto=1`, `?t=<ms>&freeze=1`, `?seed=`, `?palette=`, `?yaw=`, `?pitch=`, `?zoom=`, `?shadows=`, keys arrows / WASD, Z, X, Tab, U, Y, Ctrl+Z / Ctrl+Y, Q / E, + / -, C, 1-4, P (autoplay), R, toolbar buttons, drag-orbit and wheel',
    traceFrom: 'the bot\'s `act()` call in `botStep()` -> `GAME.v.grow` -> `afterEdit` -> `onEdit` -> `checkGoals` -> `onGoal`',
    autoCheck: '`?auto=1` still meets every goal and reaches Charter Granted (`GAME.result === \'charter\'`)'
  },
  offers: {
    'anchor': '`town.anchorOf(x, z)` -> `{x, y, footX, footY, visible}` CSS px of the column top (after `render()`).',
    'ui-rects': 'The 3D module draws no HUD; the game\'s own HUD rects apply.',
    'events': '`onEdit(info)` after every edit (`{kind, x, z, from, to, changed}`); counts() for houses, doors, arches, stairs, turrets.'
  }
};

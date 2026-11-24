// Basket hint for B-04 iso-height-map (module v1): how to wire the module into an UNKNOWN game, by role, and the starter's
// extension points (starter/README.md).
export default {
  stage: 'foundations',
  does: 'Turns a flat tile tactics map into a 2:1 isometric height map. Every tile gets a height level; a unit may climb at most its jump and drop at most jump + fall; ranged attacks gain range from high ground; damage is multiplied for attacking from above and from the side or back (units have a facing, chosen at the end of a human action). The module owns projection, picking (screen px -> tile, with height), reach, painter\'s draw order with the game\'s units interleaved, an outline for units hidden behind taller blocks, the cursor on tile tops, 90-degree camera turns and an optional wait-time turn order.',
  params: {
    jump: 'module `params.jump` (default jump for units without their own)', fall: 'module `params.fall`', hgRange: 'module `params.hgRange`',
    hgDamage: 'module `params.hgDamage`', side: 'module `params.side`', back: 'module `params.back`', step: 'module `params.step` (px per level)',
    xray: 'module `params.xray`', overlay: 'module `params.overlay`',
    facing: '`choose` = open `iso.chooseFacing` after a human action; `auto` = `iso.setFacing(u, iso.bestFacing(u))` for everyone'
  },
  steps: [
    ['Your map data',
      'Add a height grid the size of the tile layout: open ground and roads 1, rough or cover tiles 2-3, walls and impassable tiles 5-6 (still impassable by cost), water 0, plus a rise or two. On the route between the start areas no step may climb more than {{jump}}. Map each tile type to an art kind (`grass moss dirt road sand snow stone stairs rock wood water`).'],
    ['After your map and units exist, before the first frame and before any `?t=` replay',
      '`iso = GameDNA_IsoHeight.create({cols, rows, view, params: {jump: {{jump}}, fall: {{fall}}, hgRange: {{hgRange}}, hgDamage: {{hgDamage}}, side: {{side}}, back: {{back}}, step: {{step}}, xray: \'{{xray}}\', overlay: \'{{overlay}}\'}, height, terrain, cost, units, occupant, alive, idOf, isEnemy, team, moveOf, jumpOf, rangeOf, facingOf, setFacing, drawUnit, drawPos, getCursor})`. `view` = the map area above your HUD. `units()` = every unit to draw (dying ones too). `drawUnit(ctx, u, fx, fy, info)` calls your own unit drawing with the context translated so the feet land on (fx, fy); when your drawing always paints on one global context and `ctx` is a different canvas (the outline mask), draw just the sprite image into `ctx`. `drawPos(u)` = fractional tile `{x: px / TILE, y: py / TILE}` while you animate a unit in pixels, else null. `getCursor()` = your cursor tile, null when hidden or off the map.'],
    ['Your reachability, AI distance fields and attack checks',
      'In each neighbour loop add `if (!iso.canStep(u, x, y, nx, ny)) continue;` (a field built outward from the targets tests the move from the neighbour to the current tile, so pass the moving unit in). Where you test "can attack", use `iso.canHit(att, ax, ay, tx, ty)`. Multiply your damage by `iso.damageMod(att, def).mult` and round.'],
    ['The end of a unit\'s action',
      'Human: `iso.chooseFacing(u, () => <your existing end-of-action code>)` (facing `{{facing}}`; with `auto` skip it). AI and autoplay: `iso.setFacing(u, iso.bestFacing(u))` and continue at once; they never open the picker.'],
    ['Your fixed 60 Hz step', '`iso.update()` first, also inside the `?t=&freeze=1` replay loop.'],
    ['Your draw pass',
      'Background, then `iso.draw(ctx)` in place of the flat ground and the unit loop, then effects, HUD, then `iso.drawUI(ctx, hudRects)`. Disable your own ground, cursor and unit loop with `if (false)` (do not delete). Optional: `iso.showRange(unit)` while a destination is being chosen, `iso.clear()` after.'],
    ['Your input handlers',
      'keydown: `if (iso.key(e.code, true, e.repeat)) { e.preventDefault(); return; }` then your existing handling (it takes only the facing picker\'s keys and Q/E rotate); keyup: `iso.key(e.code, false)`. Pointer -> tile: `iso.pick(canvasX, canvasY)` instead of dividing by the tile size; HUD taps unchanged. During the facing picker a tap on a neighbour tile faces it (`iso.setFacing(u, iso.facingToward(...))`, then `iso.press(\'a\')`).'],
    ['Your turn order',
      'Keep side phases if the game has them. If units act one at a time: `iso.wt.reset(units)` at start, `iso.wt.next()` picks the next unit, `iso.wt.end(u, {moved, acted})` ends its turn, `iso.drawOrder(ctx, x, y, 7)` draws the bar.']
  ],
  gotchas: [
    'Units float above blocks or are never covered -> the game still draws its units itself; draw them only through `drawUnit` inside `iso.draw`.',
    'Autoplay stalls next to a cliff -> the AI\'s distance field ignores `canStep`; give it the moving unit and test the step.',
    'Taps select the wrong tile on high ground -> the pointer still divides by the tile size; use `iso.pick`.',
    'A second copy of every unit appears on screen -> `drawUnit` ignored `ctx` and painted the outline mask on the main canvas.',
    '`?t=&freeze=1` shots show the camera mid-pan or no walks -> `iso.update()` is not in the replay loop.',
    'The manual game hangs after a move -> the facing picker is open but your key handler never calls `iso.key` first.'
  ],
  checks: [
    '`?auto=1` still reaches the end screen with no errors.',
    'The map is isometric with raised blocks and shaded cliff faces; the cursor sits on the tile top at its height.',
    'A cliff taller than a unit\'s jump is not reachable; stairs or ramps are.',
    'A unit behind a tall block is covered by it and shows an outline when active or under the cursor.',
    'Attacking from above or from behind shows a higher damage; a human unit chooses a facing after acting; Q/E rotate the map.',
    'Restart, end turn and every existing control still work.'
  ],
  selfcheck: [
    'Every original function exists; every `iso.` call sits in the steps above; `iso` exists before the first frame and the freeze loop.',
    'Trace one autoplay turn: reach (with `canStep`) -> walk -> attack (`canHit`, `damageMod`) -> `setFacing` -> the turn ends.',
    'Trace one human turn: tap (via `iso.pick`) -> move -> attack -> `chooseFacing` -> Z through `iso.key` -> end of action.'
  ],
  starter: {
    name: 'Highcliff Crossing',
    modules: 'with its own `<script src>` (or pasted unchanged into its own `<script>`) before the game script, so it exists in the ADDONS slot',
    register: 'push it onto `game.addons` in the ADDONS slot of section 8 of `index.html`, before `newGame()` (hooks: `onHit(ev)`, `update(game, {dt, frozen})`, `drawTile(ctx, x, y, sx, sy, tile)` (on each tile top, painter\'s order), `draw(ctx, cam, game)`, `drawUI(ctx, game)` (top UI layer), `onKey(e, down)`, `onTurnStart(turn, side, unitId)`, `onPhase(phase)`)',
    hit: '`onHit(ev)` runs on the blow frame, right after the hit site `applyHit` (also `game.hit(attackerId, targetId, amount, kind)`) changed HP. `ev.kind` is `attack | counter | heal` (map `attack` and `counter` to damage, `heal` to heal), `ev.amount` is always >= 0, `ev.side` is `front | side | back`, `ev.dh` the height difference, `ev.anchor` the target\'s home anchor. Feedback helpers: `game.hitStop(ms)`, `game.shake(px, ms)`, `game.flash(color, ms)` (an addon\'s `onHitStop` / `onShake` / `onFlash` callbacks call these with ms)',
    draw: '`draw(ctx, cam, game)`: native 256x224 context already translated by any shake, after the iso map, units, outlines and cursor, before the HUD',
    rects: '`game.uiRects()` (WT bar, active unit window, turn plate, stage hint, forecast window, the module\'s info plate and cursor, plus addon rects from `game.setUIRect(name, rect)`; native px)',
    field: 'the whole screen `{x: 0, y: 0, w: 256, h: 224}`',
    anchor: '`game.anchorOf(id, {home: true})` -> `{x, top, w, h, footY}`: the 16x24 sprite box standing on its tile on the iso map, screen px (without `home` it follows walks, hops and lunges); units are `game.units`, alive while `hp > 0`. Never compute positions from tile x 16',
    clock: '`update(game, {dt, frozen})` runs every 60 Hz step, also during hit-stop; `dt` is in seconds (1/60) and `frozen` is true while the world is stopped. `game.hitStop(ms)` freezes the world. An addon that ages in ms calls its update with `frozen ? 0 : dt * 1000`',
    reset: '`onTurnStart(turn, side, unitId)` with `turn === 0` (new game and restart)',
    builtins: { numbers: '`game.builtinNumbers = false` (in the same ADDONS slot)', forecast: '`game.builtinForecast = false` (in the same ADDONS slot; the red target diamond stays)', visibility: '`game.isUnitVisible = u => ...` (drawing only)' },
    keep: '`?auto=1`, `?t=<ms>&freeze=1` (also with `&script=`), keys Q/E (rotate) and R (restart), the facing picker, mouse and touch',
    traceFrom: '`applyHit` (an autoplay attack and its counter)',
    autoCheck: '`?auto=1` still reaches VICTORY'
  },
  offers: {
    'hit-site': 'Height never applies damage by itself: the hit sites are your own attack code; multiply by `iso.damageMod(att, def).mult` there.',
    'anchor': 'Unit screen box: `iso.anchorOf(unit)` -> `{x, top, left, w, h, footY}` (drawn position, hops included); a tile\'s top centre: `iso.project(x, y)`. Never tile x size.',
    'ui-rects': 'The module\'s info plate, WT bar and cursor are `iso.getUIRects()`; pass your HUD rects to `iso.drawUI`.',
    'freeze': 'The freeze also skips `iso.update()` (walks and camera stop).',
    'battle-start': 'Map restarts are where you reset units; call `iso.wt.reset(units)` there if you use WT.'
  }
};

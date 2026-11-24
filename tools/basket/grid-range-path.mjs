// Basket hint for B-01 grid-range-path (module v1.1): how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'systems',
  does: 'Selecting a unit on a tile map shows the tiles it can reach (blue, terrain costs; enemies block, allies pass) and the tiles it could strike after moving (red). An arrow follows the cursor along the path; confirm walks the unit tile by tile, then a command window (your commands plus BACK) acts or undoes the move. The module draws the cursor and the terrain, unit and command windows too.',
  params: {
    move: 'fallback only: pass `moveOf(unit)` from your unit stats',
    range: 'fallback only: pass `rangeOf(unit)` from your unit stats',
    costs: 'create `params.costs`', overlay: 'create `params.overlay`', repeat: 'create `params.repeat`',
    res: 'IGNORE'
  },
  steps: [
    ['After your map and units exist, before the first frame',
      '`gr = GameDNA_GridRange.create({cols, rows, tile, params: {move: {{move}}, range: \'{{range}}\', costs: \'{{costs}}\', overlay: \'{{overlay}}\', repeat: \'{{repeat}}\'}, cost, occupant, terrain, posOf, setUnitPos, moveOf, rangeOf, commands, onCommand, canSelect, enabled, view, getCursor, onCursor, drawPortrait})`. `tile` = tile size in px. `cost(x, y, unit)` = move cost (99+ impassable). `occupant(x, y)` = unit or `null`. `terrain(x, y)` = `{name, def, avo}` (0 for stats you lack). `posOf(unit)` -> `{x, y}` tile; `setUnitPos(unit, x, y)` moves it. **`moveOf(unit)` / `rangeOf(unit)` return the unit\'s own move and weapon range** from your stats, exactly what your rules and AI use. `canSelect(unit)` = player side, not yet acted. `enabled()` = true only while a human gives orders. `view` = `{w, h, ox, oy}` map viewport in the canvas. `getCursor`/`onCursor` sync your cursor; `drawPortrait(ctx, unit, x, y, t)` draws the unit in its window. Units without `side`/`name`/`hp`/`maxHp`: add `isEnemy`, `team`, `unitInfo`.'],
    ['Your after-move command step (attack, item, wait...)',
      '`commands(unit)` -> your existing commands as `[{id, label, enabled}]` plus `{id: \'back\', label: \'Back\'}`; `onCommand(id, unit, from, path)` runs your existing handler for that command with everything it expects set (selected unit, origin, targets), exactly as your own flow would. Return `\'keep\'` to leave the menu open. Never drop a command your game had.'],
    ['Your fixed 60 Hz step', '`gr.update()` first, before your own logic.'],
    ['Your map draw pass',
      'ground -> `gr.drawUnder(ctx, cam)` -> units -> effects -> HUD -> `gr.drawOver(ctx, cam, hudRects)` last (`hudRects` = HUD rects its windows avoid). A unit\'s draw position is `gr.drawPos(unit)` (world px) when not `null`. Turn off your own map cursor.'],
    ['Your input handlers',
      'keydown: `if (gr.key(e.code, true, e.repeat)) e.preventDefault(); else <your existing key handling>`; keyup: `gr.key(e.code, false)`. It returns true only for keys it used, so your shortcuts (end turn, menus) keep running. Pointer -> tile (with camera): `gr.hover`, `gr.click`, `gr.cancel`. Keep your end-turn button and key.'],
    ['Your autopilot / AI and anything that moves units without the player',
      'Keep its own movement code; `enabled()` is false while it runs. It may read `gr.reachOf(unit)` / `gr.pathTo(unit, x, y)`; it never calls `confirm`/`click`. It must still finish a whole game.']
  ],
  gotchas: [
    'Autoplay stalls or units only wait -> the AI was routed through the interactive module, or `moveOf` is smaller than the move the AI plans with; use the unit\'s own stat and keep the AI\'s code path.',
    'The attack after moving crashes or is missing -> `onCommand` must set up everything your attack handler reads; never replace your commands with WAIT only.',
    'End turn dead -> your key handler must still run when `gr.key` returns false; buttons keep their handlers.',
    'Old overlay at the next turn -> `enabled()` turns false at phase and battle end.'
  ],
  checks: [
    'Selecting a unit: blue matches the unit\'s own move stat (same tiles your rules allow), stops early in costly terrain, never crosses impassable tiles or enemies; red fringe as deep as its weapon range.',
    'Cursor right, right, up, up draws a two-corner arrow; stepping back shortens it; mouse hover moves it.',
    'Confirm walks tile by tile; the command window lists your commands; attacking after a move works; BACK restores.',
    'End turn works by key and by button; enemies act; the player phase returns; the windows never cover your HUD.'
  ],
  selfcheck: [
    'Every `gr.` call sits in the steps above, and `gr` exists before the first frame.',
    'Trace a human turn: select -> `gr.path` changes -> confirm -> `walk` -> command menu -> your attack via `onCommand` -> phase end, `enabled()` false.',
    'Trace autoplay for one full turn and one enemy phase: no `gr` interactive call, moves within `moveOf`, the turn ends.'
  ],
  // Starter basket (FORMAT v1.2): the documented extension points of starter/index.html (see starter/README.md).
  starter: {
    name: 'Ford Skirmish',
    modules: 'with its own `<script src>` (or pasted unchanged into its own `<script>`) before the game script, so it exists in the ADDONS slot',
    register: 'push it onto `game.addons` in the ADDONS slot of section 8 of `index.html`, before `newGame()` (hooks: `onHit(ev)`, `update(game, {dt, frozen})`, `drawGround(ctx, cam, game)` (under overlays and units), `draw(ctx, cam, game)`, `drawUI(ctx, game)` (top UI layer), `onKey(e, down)`, `onTurnStart(turn, side)`, `onPhase(phase)`)',
    hit: '`onHit(ev)` runs on the blow frame, right after the hit site `applyHit` (also `game.hit(attackerId, targetId, amount, kind)`) changed HP (attacks, counters, heals). `ev.kind` is `attack | counter | heal`, `ev.amount` is always >= 0 (heals clamped to max HP), `ev.anchor` is the target\'s home anchor. Feedback helpers: `game.hitStop(ms)`, `game.shake(px, ms)`, `game.flash(color, ms)`',
    draw: '`draw(ctx, cam, game)`: native 240x160 context already translated by any shake, after units, before flash, vignette, HUD and the grid windows',
    rects: '`game.uiRects()` (turn plate, built-in forecast window, the grid windows and cursor, plus addon rects registered with `game.setUIRect(name, rect)`; native px)',
    field: 'the whole screen `{x: 0, y: 0, w: 240, h: 160}`',
    anchor: '`game.anchorOf(id, {home: true})` -> `{x, top, w, h}`: the sprite box at the unit\'s tile (no walk or lunge offset), screen px; units are `game.units`, alive while `hp > 0`',
    clock: '`update(game, {dt, frozen})` runs every 60 Hz step, also during hit-stop; `dt` is in seconds (1/60) and `frozen` is true while the world is stopped. `game.hitStop(ms)` freezes the world',
    reset: '`onTurnStart(turn, side)` with `turn === 1 && side === \'a\'` (new game and restart)',
    builtins: { numbers: '`game.builtinNumbers = false` (in the same ADDONS slot)', forecast: '`game.builtinForecast = false` (in the same ADDONS slot; the red target brackets stay)', visibility: '`game.isUnitVisible = u => ...` (drawing only: sprite, HP bar, numbers, unit window, camera follow)' },
    keep: '`?auto=1`, `?t=<ms>&freeze=1` (also with `&script=`), keys E (end turn) and R (restart), the End turn button, mouse and touch',
    traceFrom: '`applyHit` (an autoplay attack and its counter)',
    autoCheck: '`?auto=1` still reaches VICTORY'
  },
  offers: {
    'hit-site': 'The grid only moves units, it never applies damage: the hit sites are your own attack code (reached from `onCommand`, autoplay and the enemy phase).',
    'anchor': 'Tile to screen: x = `tile.x * T - cam.x + T / 2`, top = `tile.y * T - cam.y - rise` (sprite height above its tile); while walking, `gr.drawPos(unit)` minus camera.',
    'ui-rects': 'The grid\'s windows are `gr.getUIRects()` (last `drawOver`); draw effects before `drawOver`; give your HUD rects to both.',
    'freeze': 'The freeze also skips `gr.update()` and your attack animation.',
    'battle-start': 'Map restarts are where you reset units.'
  }
};

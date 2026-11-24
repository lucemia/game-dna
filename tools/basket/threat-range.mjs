// Basket hint for B-02 threat-range: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'ui',
  does: 'One key (default T) or a small THREAT button paints every tile any enemy could move to or strike this turn as a red tinted zone with a crisp marching outline. Pointing at one enemy shows only its reach; confirming on an enemy pins it (pins add up). The zone is recomputed by itself whenever a unit changes tile, uses the game\'s own move costs and blocking, and is drawn outline-only while the player\'s own range is on screen, so the blue range is never tinted.',
  params: {
    tint: 'create `params.tint`', fill: 'create `params.fill`', pattern: 'create `params.pattern`', outline: 'create `params.outline`',
    march: 'create `params.march` (px/s)', dash: 'create `params.dash` (px)', fade: 'create `params.fade` (ms)', both: 'create `params.both`',
    walls: 'create `params.walls`', costs: 'create `params.costs`', start: 'create `params.start`', key: 'create `params.key` (KeyboardEvent.code; pick a key the game does not use)',
    label: 'create `params.label`', layer: 'create `params.layer` (`under` when drawn before units, `over` when the only slot is after units)', button: 'create `params.button`'
  },
  steps: [
    ['Once, after the map, units and canvas exist, before the first frame and before any `?t=` fast-forward',
      '`threat = GameDNA_ThreatRange.create({cols, rows, tile, view, params: {tint: \'{{tint}}\', fill: {{fill}}, pattern: \'{{pattern}}\', outline: \'{{outline}}\', march: {{march}}, dash: {{dash}}, fade: {{fade}}, both: \'{{both}}\', walls: \'{{walls}}\', costs: \'{{costs}}\', start: \'{{start}}\', key: \'{{key}}\', label: \'{{label}}\', layer: \'{{layer}}\', button: \'{{button}}\'}, cost, occupant, enemies, posOf, moveOf, rangeOf, playerRange, getObstacles, uiRects})`. `view` = the map viewport in canvas px `{x, y, w, h}` (above the HUD). `cost(x, y, unit)` and `occupant(x, y)` are the functions the movement rules use (impassable = Infinity or 99). `enemies()` = the enemy side\'s units. `posOf(u)` = its TILE, `moveOf(u)` its move stat, `rangeOf(u)` = `[min, max]` attack distance. `playerRange()` = the tiles the game\'s own blue move overlay shows right now, or `null`. `getObstacles()` = sprite rects, `uiRects()` = HUD and window rects (not the map cursor, or the button flees the pointer), both in canvas px. The module computes nothing until the first `update`, so these may use state the game creates later.'],
    ['Your fixed update step, every step on every scene (also enemy phase and animations)',
      '`threat.showUnit(<living enemy under the cursor while no player unit is selected, else null>)`, then `threat.update(<step ms>)` (`0` while the world is frozen).'],
    ['Your map draw pass',
      'ground -> your blue/red range overlay -> `threat.draw(ctx, cam)` -> units -> cursor -> HUD -> `threat.drawButton(ctx)`. `cam` = the map scroll `{x, y}` in px (or `{x: 0, y: 0}`). If the only slot is after units, use `layer: \'over\'` and pass the sprite rects: the zone is then cut around them.'],
    ['Your keydown / keyup handlers and pointer handler',
      'keydown, first line: `if (threat.key(e.code, true, e.repeat)) { e.preventDefault(); return; }`; keyup: `threat.key(e.code, false)`. Pointer, in native px, before your own tap logic: `if (threat.click(x, y)) return;`. Where confirming on an enemy does nothing today: `threat.toggleUnit(enemy)` (pin).'],
    ['Where a battle starts or restarts', '`threat.clear()`.']
  ],
  gotchas: [
    'The zone ignores forest or hills -> `cost` is not the function the movement rules use.',
    'The zone passes through the player\'s units -> `occupant` does not return units, or both sides look like friends (give `isEnemy`).',
    'The zone stays where an enemy was -> `update` is not called on that scene; call it every step.',
    'Units are tinted red -> `draw` runs after units with `layer: under`; move it before units or use `layer: over` with sprite rects.',
    'The blue move range turns red -> `playerRange()` is missing; return the tiles the overlay shows and draw the zone after it.',
    'T does something else too, or an old shortcut died -> `threat.key` goes first and only returns true for its own key; keep your handler in the else path.',
    'The zone is offset -> pass the map scroll as `cam`, keep `view` in canvas px, do not translate the context as well.',
    'No zone in `?t=&freeze=1` shots -> the instance is created after the fast-forward, or `update` is outside that loop.'
  ],
  checks: [
    'The toggle key or the THREAT button paints every tile enemies can reach or strike, with a marching dashed outline; again hides it; the button lamp follows.',
    'Cursor on one enemy shows only its reach; confirming on enemies pins them and the zones add up.',
    'When an enemy (or a player unit that blocks a path) moves, the zone follows at once; holes and walls match the rules.',
    'With a player unit selected its blue range stays fully blue and the zone is outline only.'
  ],
  selfcheck: [
    'List the six call sites (create, update, draw, drawButton, key/click, clear) and the functions behind `cost`, `occupant`, `moveOf`, `rangeOf`.',
    'Walk one enemy move: its tile changes -> next `threat.update` recomputes -> `threat.draw` shows the new zone.',
    'Worked example: move 4, range 1; east of it grass (cost 1), forest (2), grass: it stops on the forest (1 + 2 = 3) and the grass beyond (4) and strikes one more: the zone reaches 4 tiles east.'
  ],
  // Starter basket (FORMAT v1.2): how this addon plugs into a system starter's extension points ({{sys.*}}).
  addon: {
    builtin: null,
    steps: [
      ['Create', 'Create `threat` once in the ADDONS slot: `GameDNA_ThreatRange.create({cols, rows, tile, view, params: {tint: \'{{tint}}\', fill: {{fill}}, pattern: \'{{pattern}}\', outline: \'{{outline}}\', march: {{march}}, dash: {{dash}}, fade: {{fade}}, both: \'{{both}}\', walls: \'{{walls}}\', costs: \'{{costs}}\', start: \'{{start}}\', key: \'{{key}}\', label: \'{{label}}\', layer: \'{{layer}}\', button: \'{{button}}\'}, cost, occupant, enemies, moveOf, rangeOf, idOf, playerRange, getObstacles, uiRects})`. {{with.create}}'],
      ['Sprites and UI', '{{sys.anchor}}. `getObstacles()` returns each living unit\'s box `{x: left, y: top, w, h: h + 3, id}` (the 3 px cover its HP bar), so the button never sits on a unit; `uiRects()` returns {{sys.rects}}, without the map cursor (`r.kind !== \'cursor\'`) and without the button\'s own rect; `view` is {{sys.field}}.'],
      ['Clock', '{{sys.clock}}. {{with.clock}}'],
      ['Draw', '{{with.draw}}'],
      ['Input', '{{with.input}}'],
      ['Reset', '{{sys.reset}}: `threat.clear()`']
    ],
    gotchas: [
      'The button hides under a window -> it was drawn in the world `draw` slot (before the windows) or placed with last frame\'s rects; draw it with `drawButton` in the top UI layer, after the windows.',
      'The blue range is tinted -> `playerRange()` must return the grid module\'s reach while it shows it.',
      'The zone outline is lost among the game\'s own red strike squares -> use `tint: \'threat\'` (violet) in a game that already marks its strikes in red.',
      'The zone lags or freezes in `?t=&freeze=1` -> advance only in the `update` hook, with `0` while frozen.'
    ],
    checks: [
      'T and the THREAT button toggle a zone with a marching outline over every tile enemies reach or strike, under the units; cursor on an enemy shows only its zone; Z on an enemy pins it; the zone follows moving units; a selected hero\'s blue range stays blue (zone outline only); the button is never under a window or a unit.'
    ],
    selfcheck: [
      'Trace: T -> `onKey` -> `threat.key` (true) -> next `update` -> `drawGround` shows the zone -> `drawUI` draws the button after the windows; trace an enemy walk tile by tile -> the zone follows.'
    ],
    with: {
      'grid-range-path': {
        params: { layer: 'under', tint: 'threat' },
        create: '`cols: MW, rows: MH, tile: TS, view: {x: 0, y: 0, w: 240, h: 160}`, `cost: (x, y) => TER[at(x, y)].cost`, `occupant: unitAt`, `enemies: () => game.units.filter(u => u.side === \'b\')`, `moveOf: u => u.mv`, `rangeOf: u => u.rng`, `idOf: u => u.id`, `playerRange: () => GR.mode === \'select\' ? GR.reach : null` (the grid module draws its blue range only in `select`). `tint: \'threat\'` (violet) because the starter already marks the hero\'s strike tiles in red.',
        clock: 'In `update(game, {dt, frozen})`: `const c = GR.cursor, e = game.phase === \'player\' && GR.mode === \'idle\' ? game.units.find(u => u.hp > 0 && u.side === \'b\' && u.x === c.x && u.y === c.y) : null; threat.showUnit(e || null); threat.update(frozen ? 0 : dt * 1000);` (dt is in seconds).',
        draw: 'The zone in the ground layer, under the grid overlays and units: `drawGround(ctx, cam) { threat.draw(ctx, cam); }`. The button in the top UI layer, after the HUD plate, the grid windows and the forecast, so it is placed against this frame\'s windows: `drawUI(ctx) { const b = threat.drawButton(ctx); if (b) game.setUIRect(\'threat\', b); }` (other addons then avoid it; leave it out of `threat`\'s own `uiRects()`).',
        input: '`onKey(e, down)`: `if (threat.key(e.code, down, e.repeat)) return true;` then, on keydown of Z / Enter / Space while `game.phase === \'player\' && GR.mode === \'idle\'` with an enemy under `GR.cursor`: `threat.toggleUnit(thatEnemy); return true;`; return false otherwise (E, R and every other key keep working). The button: in the ADDONS slot add `cv.addEventListener(\'pointerdown\', e => { const r = cv.getBoundingClientRect(); if (threat.click((e.clientX - r.left) * 240 / r.width, (e.clientY - r.top) * 160 / r.height)) { e.preventDefault(); e.stopImmediatePropagation(); } });` (registered before the starter\'s own listener, so a button tap never reaches the map).'
      }
    }
  },
  offers: {
    'ui-rects': { title: 'THREAT button', text: '`threat.buttonRect()` is the button rect `{x, y, w, h}` in canvas px; add it to the other element\'s obstacles / UI rects.' }
  },
  wants: {
    'ui-rects': { title: 'UI rects', text: 'Return them from `uiRects()` so the zone is cut around windows and the button picks a free corner.', check: 'The zone never covers the other element\'s windows; the THREAT button never sits under one.' },
    'anchor': { title: 'sprite rects', text: 'Return the same sprite rects from `getObstacles()` (needed with `layer: \'over\'`).' },
    'battle-start': { title: 'reset', text: 'Call `threat.clear()` there.' }
  }
};

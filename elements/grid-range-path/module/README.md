# grid-range-path.js (B-01, module v1.2.1)

A plain script with no dependencies and no `export`. It defines one global, `window.GameDNA_GridRange`, and works pasted into a `<script>` tag or loaded with `<script src>`. It owns the whole element:
- reach, stoppable and attack-fringe computation;
- the path arrow (keep-path / cut-back rules);
- the cursor with key repeat;
- drawing of the overlays, arrow, bracket cursor and the terrain / unit / command windows at native resolution;
- the tile-by-tile walk;
- the select → walk → command-menu flow.

The game keeps its own units and map and answers callbacks. The module never reads unit fields except through the adapters below.

## Options for `GameDNA_GridRange.create(options)`

| option | required | meaning |
|---|---|---|
| `cols`, `rows`, `tile` | yes (tile defaults to 16) | grid size |
| `cost(x, y, unit)` | yes | terrain move cost; ≥ 99 = impassable |
| `occupant(x, y)` | yes | the unit on that tile, or `null` |
| `terrain(x, y)` | yes | `{name (or n), def, avo}` for the terrain window |
| `setUnitPos(unit, x, y)` | yes | move the game's unit (called on every walked tile and on BACK) |
| `onWait(unit, from, path)` | yes* | the WAIT command: run the game's after-move logic. *Optional if `onCommand` handles `'wait'` |
| `posOf(unit)` (alias `tileOf`) | no | `→ {x, y}` tile of a unit; default `{x: unit.x, y: unit.y}`. Use it when units store `col/row`, `pos`, or pixels |
| `idOf(unit)` | no | stable id, used when `occupant()` returns wrapper objects rather than the same object each time |
| `moveOf(unit)` (alias `move`) | no | move points; default `unit.move` when it is a number, else `params.move` |
| `rangeOf(unit)` (alias `range`) | no | `[min, max]`, a number, or `'1'/'1-2'/'2'`; default `unit.range`, else `params.range` |
| `commands(unit)` | no | `→ [{id, label, enabled}]` (enabled may be a boolean or a function of the unit) for the menu after a move; default WAIT / BACK. Disabled entries are grey and skipped |
| `onCommand(id, unit, from, path)` | no | called for every command except `'back'` (and `'wait'` when `onWait` exists). The module then clears its state; return `'keep'` to leave the menu open |
| `canSelect(unit)` | no | default: any unit |
| `enabled()` | no | false outside the player's input time; the module then clears itself, hides the cursor and stops taking keys |
| `isEnemy(a, b)` | no | default `a.side !== b.side` (enemies block, allies can be passed) |
| `team(unit)` | no | `'a'` (blue window) or `'b'` (red); default: side/team in a, player, ally, hero, blue, p1, friend → `'a'` |
| `unitInfo(unit)` | no | `{name, hp, max}`; default `unit.name, unit.hp, unit.max \|\| unit.maxHp` |
| `view` | no | `{w, h, ox, oy}` (or a function returning it): the map viewport inside the canvas, in canvas px. Default: the whole canvas |
| `params` | no | `{move, range, costs:'on'\|'off', overlay:'solid'\|'pulsing'\|'checker', repeat:'slow'\|'normal'\|'fast'}` |
| `keys` | no | your own `{KeyboardEvent.code: 'left'\|'right'\|'up'\|'down'\|'a'\|'b'}` map; default arrows, WASD, Z/Enter/Space = a, X/Esc/Backspace = b |
| `cursor`, `getCursor()`, `onCursor(x, y)` | no | initial cursor; two-way sync with the game's own cursor variable |
| `drawPortrait(ctx, unit, x, y, t)` | no | draws the unit's sprite inside the unit window |
| `skin` | no | v1.2: a skin id or object for `GameDNA_Skin.resolve()` (default `'pixel16'`). Used only when `skins/skin-api.js` (plus the skin files) is loaded **before** this module. Then overlays (`skin.overlay` move/attack), the arrow (`skin.path` if the skin has it, else the built-in arrow coloured from `palette.overlay.path`), the cursor and menu pointer (`skin.cursor`), windows (`skin.frame`, `skin.text`, `skin.measure`, `skin.bar`) all draw through the skin. The terrain title band and the portrait well use `frame({role: 'backing'})` (the portrait well only when the skin lists `backing` in `frameRoles`; otherwise the classic inked two-band well from palette tokens), and the selected menu row uses `frame({role: 'row'})`. With `pixel16` the output is pixel-identical to the built-in look. `skin: false` forces the built-in drawing |
| `isVisible(unit)` | no | display only (v1.1.1): a hidden unit (fog of war) gets no unit window and is ignored by window placement; movement rules still see it through `occupant` |
| `onCancel(unit)`, `onBack(unit)`, `onStep(unit, x, y)` | no | notifications |

## Methods and state

| member | meaning |
|---|---|
| `update()` | call once per 1/60 s, before the game's own logic |
| `drawUnder(ctx, cam)` | overlays and arrow; call after the ground, before units. `cam = {x, y}` is the map scroll in px |
| `drawOver(ctx, cam, avoidRects)` | cursor and windows; call last. `avoidRects = [{x, y, w, h}]` in canvas px is HUD the windows must never cover. Returns the rects it drew |
| `getUIRects()` | `[{x, y, w, h, kind}]` (`kind` = unit / menu / terrain / cursor) from the last `drawOver`, in canvas px. Use them so other overlays (damage numbers) avoid the windows |
| `key(code, down, isRepeat)` | feed `keydown` / `keyup`. Returns **true only if the module used the key**: a direction while active, A on a selectable unit or while selecting / in the menu, B while selecting / in the menu. Anything else returns false, so the game's own shortcuts (End Turn…) still run |
| `press(name)` / `release(name)` | the same with names (touch buttons, scripts) |
| `hover(x, y)`, `click(x, y)` | mouse: aim / aim + confirm (select, walk to a blue tile, the menu on the unit's own tile) |
| `confirm()`, `cancel()` | A and B; cancel in the menu = BACK |
| `drawPos(unit)` | `[px, py]` while that unit walks, else `null` |
| `focus()` | `{x, y}` px the camera should follow |
| `reachOf(unit)` | **non-interactive**: `{move: Set<key>, stop: Set<key>, fringe: Set<key>, cost: Map<key,{cost,prev}>}`, with `key = y*cols + x`. No state change |
| `pathTo(unit, x, y)` | non-interactive cheapest path `[{x, y}]`, or `null` |
| `tileKey(x, y)` | the key function |
| `skin` | the resolved skin object, or `null` when drawing built-in |
| `setParams(p)`, `setCursor(x, y)`, `clear()`, `select(unit)` | control |
| `mode` (`idle`/`select`/`walk`/`menu`), `unit`, `path`, `cursor`, `reach`, `stop`, `fringe`, `commands()`, `menuIndex`, `pathCost()`, `walkTiles()` | read-only state |

**Autoplay / AI**: a game's autopilot or enemy AI must keep using its own movement code. It may read `reachOf` / `pathTo` but must not drive the interactive state, and `enabled()` should be false while the AI acts.

## Integration example (generic names)

```js
const grid = GameDNA_GridRange.create({
  cols: MAP_W, rows: MAP_H, tile: 16, params: { overlay: 'pulsing', repeat: 'normal' },
  cost: (x, y, u) => moveCostAt(x, y, u), occupant: (x, y) => unitOnTile(x, y), terrain: (x, y) => terrainInfo(x, y),
  posOf: u => ({ x: u.col, y: u.row }), setUnitPos: (u, x, y) => { u.col = x; u.row = y; },
  moveOf: u => u.stats.move, rangeOf: u => [u.weapon.min, u.weapon.max],
  canSelect: u => u.team === 'player' && !u.done, enabled: () => game.phase === 'playerInput',
  commands: u => [{ id: 'attack', label: 'Attack', enabled: hasTargets(u) }, { id: 'wait', label: 'Wait' }, { id: 'back', label: 'Back' }],
  onCommand: (id, u) => game.runCommand(id, u),   // the game's existing Attack / Wait handlers
  view: { w: 240, h: 160, ox: 0, oy: 0 }, getCursor: () => game.cursor, onCursor: (x, y) => { game.cursor.x = x; game.cursor.y = y; }
});
addEventListener('keydown', e => { if (grid.key(e.code, true, e.repeat)) e.preventDefault(); else gameKeys(e); });
addEventListener('keyup', e => grid.key(e.code, false));
function tick() { grid.update(); gameUpdate(); }
function render() { drawMap(); grid.drawUnder(ctx, cam); drawUnits(u => grid.drawPos(u)); drawHud(); grid.drawOver(ctx, cam, hudRects()); }
```

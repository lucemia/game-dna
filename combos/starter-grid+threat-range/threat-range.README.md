# threat-range.js (B-02 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `window.GameDNA_ThreatRange`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns the whole element:

- each enemy's reach: the tiles it can move to (cheapest-path over your terrain costs; enemies of that unit block, its friends can be passed) plus every tile it can strike from a tile it can stop on;
- the union of all enemies ("danger zone"), one enemy alone, and enemies pinned one by one;
- recomputing whenever a unit's tile, move, range or any occupant changes (it checks every `update`);
- drawing: a red tinted fill, a 2 px outline (outer line of marching light/dark dashes, inner solid line), fade in/out, and a small THREAT button with a lamp;
- outline-only drawing while the player's own range is on screen, so the blue range is never tinted;
- the toggle key (default `T`) and the button click.

It draws through `GameDNA_Skin` (`overlay`, `frame`, `text`, palette tokens) when `skin-api.js` and a skin are loaded before it, and through a built-in copy of the pixel16 look otherwise. It never throws from `update`, `draw`, `key` or `click`; a host callback that throws is ignored with one console warning.

## Options for `GameDNA_ThreatRange.create(options)`

| option | required | meaning |
|---|---|---|
| `cols`, `rows`, `tile` | yes (tile defaults to 16) | grid size in tiles, tile size in native px |
| `cost(x, y, unit)` | yes | move cost of that tile for that unit; `>= 99` or `Infinity` = impassable. Use the SAME function your movement rules use |
| `occupant(x, y)` | yes | the living unit on that tile, or `null` |
| `enemies()` | yes* | the units whose zone "show all" paints (living or not; dead ones are skipped). *Or pass the list to `showAll(units)` |
| `posOf(unit)` | no | `{x, y}` tile; default `unit.x/y`, else `col/row`, `tx/ty`. Return the unit's TILE, not pixels |
| `moveOf(unit)` | no | move points; default `unit.move`, `mv`, `mov`, else `params.move` (5) |
| `rangeOf(unit)` | no | `[min, max]`, a number `n` (= `[n, n]`), `{min, max}` or `'1'`, `'1-2'`, `'2'`; default `unit.range` / `unit.rng`, else `params.range` |
| `isEnemy(a, b)` | no | do `a` and `b` block each other; default `a.side !== b.side` (also `team`, `faction`) |
| `alive(unit)` | no | default: not `hp <= 0`, not `dead`, not `alive === false` |
| `idOf(unit)` | no | stable id; default `unit.id`. Needed when `occupant()` returns wrapper objects |
| `view` | no | `{x, y, w, h}` (or `{ox, oy, w, h}`, or a function) the map viewport inside the canvas, in canvas px. Default: the whole canvas. Nothing is drawn outside it |
| `playerRange()` | no | the tiles your game is showing for the player's selected unit right now (a `Set` of `y * cols + x`, a `Map` with those keys, or `[{x, y}]`), or `null`. While it is non-empty the zone is drawn outline-only (`both: 'outline'`) or dimmed and never on those tiles (`'dim'`) |
| `getObstacles()` | no | `[{x, y, w, h}]` canvas px: unit sprites (+ HP bars), ideally their opaque bounds. The button avoids them; with `layer: 'over'` the zone is also cut around them (inset 1 px) |
| `uiRects()` | no | `[{x, y, w, h}]` canvas px: HUD, windows, banners. The zone is cut around them, the button avoids them. Leave the map cursor out, or the button moves away from the pointer that wants to click it |
| `button` | no | `{x, y, w?, h?}` fixed button rect in canvas px, `false` for none, default auto: a free corner of `view` |
| `enabled()` | no | false = the key and button do nothing (title screen, menus) |
| `skin` | no | skin id or object (`GameDNA_Skin.resolve`); default `pixel16` when skins are loaded |
| `params` | no | see below |
| `debug(event)` | no | `{event: 'recompute' \| 'toggle' \| 'pin' \| 'warn', ...}` |

**params**: `tint` 'red' \| 'threat' (skin's violet threat token), `fill` 0..1 (0.8), `pattern` 'solid' \| 'pulsing' \| 'checker', `outline` 'march' \| 'solid' \| 'off', `march` px/s (8), `dash` px (4), `fade` ms (120), `both` 'outline' \| 'dim', `walls` 'hide' \| 'show' (strike tiles on impassable terrain), `costs` 'on' \| 'off', `start` 'off' \| 'on', `key` (a `KeyboardEvent.code`, 'KeyT'), `label` ('THREAT'), `layer` 'under' \| 'over', `button` 'auto' \| 'off', `move`, `range` (fallbacks).

## Methods

| member | meaning |
|---|---|
| `showAll(units?)`, `hideAll()`, `toggle(units?)` | the all-enemies zone. `units` = an array or a function returning one; default `enemies()`. `toggle` returns the new state |
| `showUnit(unit \| null)` | the zone of that one enemy instead of all (call it every step with the enemy under the cursor, or `null`). Pinned enemies stay shown |
| `toggleUnit(unit)`, `clearPins()` | pin / unpin one enemy; pins add up and stay until unpinned (dead units drop out) |
| `invalidate()` | force a recompute (terrain changed, a bridge opened). Unit moves are noticed by themselves |
| `update(dtMs)` | once per fixed step, also on turns where nothing moves. Pass `0` while the world is frozen. A value below 0.5 is read as seconds |
| `draw(ctx, cam)` | the zone (and, with `layer: 'over'`, the button unless `drawButton` is used; with the default `layer: 'under'` only `drawButton` draws the button). `cam = {x, y}` map scroll in px (default 0). Call it after the ground and after your own blue/red range overlay, before units (`layer: 'under'`); or after units with `layer: 'over'` and `getObstacles()` |
| `drawButton(ctx, avoid?)` | the button only; call it last, after units, HUD and windows, so it is placed against this frame's windows (`avoid` = extra rects to keep clear). Required with `layer: 'under'` |
| `key(code \| event, down, isRepeat)` | feed keydown and keyup. Returns **true only for its own toggle key** (then call `preventDefault`), false for everything else, so your keys keep working. Matches `e.code` (`'KeyT'`) and `e.key` (`'t'`, `'T'`) |
| `click(x, y)` | canvas native px; true when it hit the button (and toggled) |
| `zoneOf(unit)` | non-interactive `{move: Set, threat: Set}` of keys `y * cols + x`, no state change |
| `tiles()`, `has(x, y)`, `threatAt(x, y)` | shown tiles `[{x, y}]`; is a tile shown; ids of the shown enemies that threaten it |
| `state()`, `on`, `all`, `buttonRect()`, `lastDrawn()`, `setParams(p)`, `clear()`, `verify()` | `clear()` = new battle (all off unless `start: 'on'`, pins and focus dropped). `lastDrawn()` = `{tiles, filled, outlineOnly, edges, button, view}` of the last draw. `verify()` recomputes and says whether the shown zone was current |

## Integration (15 lines)

```js
// <script src="threat-range.js"></script> before your game script (skin-api.js + pixel16.js first, if you use skins)
const threat = GameDNA_ThreatRange.create({
  cols: MAP_W, rows: MAP_H, tile: 16, view: { x: 0, y: 0, w: 256, h: 192 },
  cost: (x, y, u) => moveCost(x, y, u), occupant: (x, y) => unitAt(x, y),       // the same rules your movement uses
  enemies: () => units.filter(u => u.team === 'enemy'), posOf: u => ({ x: u.col, y: u.row }),
  moveOf: u => u.stats.move, rangeOf: u => [u.weapon.min, u.weapon.max],
  playerRange: () => selected ? selectedMoveTiles : null,                    // what your blue overlay shows now
  getObstacles: () => units.map(u => spriteRect(u)), uiRects: () => [hudRect]
});
addEventListener('keydown', e => { if (threat.key(e.code, true, e.repeat)) e.preventDefault(); else gameKeys(e); });
addEventListener('keyup', e => threat.key(e.code, false));
canvas.addEventListener('pointerdown', e => { const [x, y] = toNative(e); if (!threat.click(x, y)) gameClick(x, y); });
function tick() { /* game logic */ threat.showUnit(cursorEnemy()); threat.update(1000 / 60); }
function render() { drawMap(); drawPlayerRange(); threat.draw(ctx, cam); drawUnits(); drawHud(); threat.drawButton(ctx); }
// new battle / restart: threat.clear();
```

## Keep every caller working

- **Autoplay, enemy AI, replays** keep their own code. They may read `zoneOf` / `threatAt`; nothing in the module moves units or takes turns.
- **`?t=<ms>&freeze=1`** (fast-forward then draw once): call `update` inside the fast-forward loop like every other step, and `draw` in the single draw. Without any `update` the zone still appears (without fade or march).
- **Keyboard shortcuts**: the module consumes only its toggle key. If your game already uses `T`, pass another `params.key`.
- **Restart / new battle**: `clear()`.

## Self-check without a browser

1. The module file is byte-identical to the one you were given; it is loaded before the game script.
2. `cost` and `occupant` are the functions your movement rules use (a unit standing on a tile is returned by `occupant`).
3. `update` runs once per step on every scene; `draw` sits after the ground (and your range overlay), before units; `drawButton` after HUD.
4. Keydown: `threat.key` first, your handler in the `else`. Every old shortcut still reaches your handler.
5. Worked example: an enemy with move 4 and range 1; east of it grass (cost 1), forest (cost 2), grass: it can stop on the forest (1 + 2 = 3) and on the grass beyond it (4), and strikes one tile past that: the zone reaches 4 tiles east.

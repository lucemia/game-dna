# level-select-map.js (B-05, module v1.0.1)

A plain script with no dependencies and no `export`. It defines one global, `window.GameDNA_LevelMap`, and works pasted into a `<script>` tag or loaded with `<script src>`. It owns the whole overworld scene between levels:

- the graph: which paths are open, cleared and secret exits, which nodes are shown, faint or hidden;
- walking node to node along a path (4-frame hero, steps, direction from the path), held-direction walking, click-to-walk;
- the reveal: after a clear, each newly opened path is drawn stone by stone (`onSound('dot')` per stone), the camera follows the stones, the new node pops in;
- node looks: level (yellow), level with a secret exit (red until both exits are found), cleared (blue with a flag), bonus (star), castle, save hut, shop, start sign; faint padlocked nodes and faint paths one step ahead;
- the info panel (name, NEW / CLEAR, exit pips, the game's items, the key hint), toasts (PATH OPEN, SECRET PATH, SAVED);
- the camera (scrolls when the map is bigger than the view, with scroll arrows), the iris into and out of levels;
- a built-in coastal terrain (sea, cliffs, beaches, trees) made from the node positions, and an autopilot.

The game keeps its levels, its save storage, its sounds and its scene switch. It draws through `GameDNA_Skin` (windows and text) when `skins/skin-api.js` is loaded and falls back to a built-in copy of the pixel16 look. Callbacks are wrapped in `try/catch` (one console warning each); `update` and `draw` never throw.

## Options for `GameDNA_LevelMap.create(options)`

| option | required | meaning |
|---|---|---|
| `nodes` | yes | `[{id, x, y, kind, name}]` (or an object `{id: {...}}`). `x, y` = map px (the node's centre on the ground). `kind`: `start`, `level` (default), `secret` (a level with a secret exit), `bonus`, `castle`, `hut`, `shop`. Aliases: `stage`, `boss`, `tower`, `save`, `house`, `store`, `star`, `home`... |
| `edges` | yes | `[{a, b, via, exit}]`: a path from `a` to `b`, bending through `via: [[x, y], ...]`. It opens when `a` is cleared through `exit` (`'normal'` default, or `'secret'`). An edge out of a `start`, `hut` or `shop` opens as soon as that node is reached. `open: true` = open from the start |
| `enterLevel(id, info)` | yes | the player confirmed a level / bonus / castle node; after the iris closes. Switch to that level here. The map then waits (`mode === 'away'`) until `complete(id, exit)` or `fail(id)` |
| `cleared` or `state` | no | where to start: `['l1', 'l2']`, `{l1: 'normal', l2: 'both'}`, a function `id => exit or null`, or a whole saved `state` from `getState()` / `onSave`. Omitted = new game at the start node |
| `onSave(state, id)` | no | confirm on a hut: store `state` (pass it back as `state` later). Once per visit; the module shows SAVED |
| `onShop(id, state)` | no | confirm on a shop: open the game's shop (disable the map input meanwhile with `enabled`) |
| `onSound(name, info)` | no | `step`, `arrive`, `dot` (one per stone, `info = {edge, i, of}`), `open` (path finished), `enter`, `save`, `shop`, `deny` |
| `onEvent(ev)` | no | `{type: 'leave' / 'arrive' / 'enter' / 'reveal' / 'revealDone' / 'clear' / 'fail' / 'save' / 'shop' / 'deny' / 'allClear', id, edge, ...}` |
| `nodeInfo(id, st)` | no | extra panel text: `{name, items: [{icon: 'coin' / 'gem' / 'key' / 'star' / 'heart' / 'flag', have, total}], lines: ['...'], status}` |
| `auto` | no | `true` or a function returning the game's autoplay flag: the module walks to the nearest uncleared level (stopping once at each unused hut to save) and enters it |
| `enabled()` | no | false while the map must ignore input (shop window, pause, other scenes). Animations still run |
| `view` | no | `{x, y, w, h}` (or a function) in canvas px; default the whole canvas |
| `world` | no | `{w, h}` minimum map size; default the nodes' bounding box + margins |
| `avoid` | no | `() => [{x, y, w, h}]` canvas rects the panel must not cover (the game's own HUD, a shop window) |
| `params` | no | `{walk, reveal, spacing, terrain, locked, panel, iris, camera, seed}`, see below |
| `drawGround(ctx, cam, view)` | no | draw your own map ground instead of the built-in terrain (`cam` = top-left in map px) |
| `drawPlayer(ctx, x, y, dir, frame, t)` | no | draw your own map hero; `(x, y)` = feet in canvas px, `dir` = up / down / left / right, `frame` 0 stand, 1-2 walk |
| `drawOver(ctx, cam, view)` | no | your own map decorations, after the hero, under the panel |
| `labels` | no | panel words: `{key: 'Z', enter, save, shop, saved, pathOpen, secretPath, clear, ...}` |
| `keys` | no | `{KeyboardEvent.code: 'left' / 'right' / 'up' / 'down' / 'confirm' / 'back'}`; default arrows, WASD, Z / Enter / Space, X / Esc |
| `skin` | no | a `GameDNA_Skin` id or object (needs `skin-api.js`); default pixel16 |

Params (`element.json`): `walk` 1.25 px per frame (0.5-3), `reveal` 4 frames per stone (1-12), `spacing` 6 px between stones (4-10), `terrain` `coast` / `dusk` / `none`, `locked` `faint` / `hidden`, `panel` `auto` / `top` / `bottom` / `off`, `iris` `on` / `off`, `camera` `smooth` / `instant`.

## Methods

| member | meaning |
|---|---|
| `update(input?)` | one 60 Hz step, only while the map scene is shown. `input` (optional) = `{left, right, up, down}` held now and `confirm` (true on the step it is pressed; held is fine, only the press counts). Without it, use `key` / `press` |
| `draw(ctx)` | the whole map: `drawWorld(ctx)` (ground, paths, nodes, hero, particles) then `drawUI(ctx)` (scroll arrows, panel, toasts, iris). Call them separately to put effects in between |
| `complete(id, exit)` | the level ended in a clear: `'normal'`, `'secret'` or `'both'`. Marks it cleared, queues the new paths, shows the map (iris opens), then reveals them. Returns the opened edge ids |
| `fail(id)` | the level ended without a clear (death, quit): shows the map again, nothing opens |
| `show()` | back to the map without a result |
| `key(code, down, isRepeat)` | feed `keydown` / `keyup`. Returns true when the map used the key. Feed it only while the map scene is shown |
| `press(name)` / `release(name)` | the same by name (touch buttons) |
| `click(x, y)` / `hover(x, y)` | canvas px: walk along open paths to the node there (on the hero's node = confirm) / show that node in the panel |
| `confirm()` | confirm on the current node (enter, save, shop) |
| `setAuto(on)`, `setParams(p)`, `setState(s)`, `reset()` | control |
| `getState()` | `{at, cleared: {id: 'normal' / 'secret' / 'both'}, open: [edge ids], saves}`: save this |
| `isCleared(id)`, `isOpen(edgeId)`, `nodeInfo(id)`, `nodes()`, `edges()` | queries |
| `at`, `mode` (`idle` / `walk` / `pause` / `iris-out` / `away` / `iris-in`), `busy()`, `revealing()`, `autoplaying()`, `waitingForPlayer()` | read-only state (`waitingForPlayer`: idle, nothing to reveal, input enabled, autopilot off) |
| `player()` | the map hero on screen: `{x, y (feet), top, w, h, left, dir, walking}` (anchor for effects) |
| `getUIRects()` | `[{x, y, w, h, kind: 'panel' / 'toast'}]` from the last `drawUI`, canvas px |
| `camera()`, `toScreen(mx, my)` | the scroll offset; map px -> canvas px |

## Integration example (generic names)

```js
const worldMap = GameDNA_LevelMap.create({   // pick a name the game does not use (many games already have a `map`)
  nodes: [{ id: 'start', x: 24, y: 150, kind: 'start', name: 'Gate' }, { id: 'l1', x: 70, y: 130, name: 'Level 1' },
          { id: 'l2', x: 120, y: 150, kind: 'secret', name: 'Level 2' }, { id: 'hut', x: 150, y: 110, kind: 'hut', name: 'Hut' },
          { id: 'boss', x: 210, y: 90, kind: 'castle', name: 'Tower' }, { id: 'b1', x: 160, y: 180, kind: 'bonus', name: 'Grotto' }],
  edges: [{ a: 'start', b: 'l1' }, { a: 'l1', b: 'l2', via: [[96, 140]] }, { a: 'l2', b: 'hut' }, { a: 'hut', b: 'boss' },
          { a: 'l2', b: 'b1', exit: 'secret' }],
  state: loadSave(), view: { x: 0, y: 0, w: SCREEN_W, h: SCREEN_H },
  enterLevel: id => { scene = 'level'; startLevel(LEVEL_OF[id]); },
  onSave: st => saveToStorage(st), onSound: name => playSfx(name), auto: () => autoplayOn,
  enabled: () => scene === 'map' && !paused, nodeInfo: id => ({ items: [{ icon: 'coin', have: best[id] || 0, total: COINS[id] }] })
});
// level end, in the game's own win / death code:  scene = 'map'; worldMap.complete(id, gotSecret ? 'secret' : 'normal');  or  worldMap.fail(id);
function step() { if (scene === 'map') worldMap.update({ left: held.left, right: held.right, up: held.up, down: held.down, confirm: pressed.jump }); else levelStep(); }
function render() { if (scene === 'map') worldMap.draw(ctx); else drawLevel(); }
```

## Rules the module keeps

- Same inputs and the same `update` calls give the same frames (`?t=&freeze=1` safe): no real time, no `Math.random`.
- The camera moves only in `update` (one ease step per call), never in `draw`, so a `?t=&freeze=1` fast-forward shows the same scroll as live play at that step (v1.0.1; v1.0.0 eased the camera in `draw` and a frozen frame showed the target instead, so stepping through times made the map jump). `draw` before any `update` starts on the target. `checks/camera-determinism.py` checks it.
- The reveal blocks walking until every queued path is drawn; the camera returns to the hero afterwards.
- Paths beyond an uncleared level stay closed; a secret exit opens only `exit: 'secret'` edges; `both` opens both.
- A hut saves once per visit; the panel never covers the hero or an `avoid` rect when the other edge is free.
- `draw` for 30 frames while a level is open (`complete` / `fail` forgotten) shows the map again with one warning.

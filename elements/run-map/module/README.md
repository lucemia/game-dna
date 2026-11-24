# run-map.js (G-08 module, v1.1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_RunMap`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns the roguelite **branching run map**: a seeded map of floors whose nodes (battle, elite, event, shop, rest, boss) are joined by paths that never cross; the player picks one of the nodes connected to where they stand, a token travels there, and the game plays that node. The map comes back one floor higher with the route drawn in gold, until the boss.

**It wraps your game; it never plays a fight itself.** Fight nodes (`battle`, `elite`, `boss`) call your `onEnter(node)`; you start your own fight or room and call `run.finish({won})` when it is over. Rest, shop and event nodes are small panels the module shows, whose choices are your own `apply` functions. Everything reaches your game synchronously inside `update()`.

Two looks from the same code: **HD** (a framed map sheet with soft shadows, glowing route, pulsing choices, tooltips, legend; scales with the play field) and **pixel** (crisp: whole-pixel positions, 1 px dashed paths, a built-in bitmap font, 1-bit icons; readable at 256x224). `look: 'auto'` picks pixel when the field is under 300 px tall. With `skins/skin-api.js` loaded, the dim colour comes from the skin's `ink` and a smooth skin's UI font family is used in HD.

## The map

`GameDNA_RunMap.generate(seed, params)` is a pure function (the instance uses it in `start()`): `floors` rows (3-14) below the boss, `width` columns (3-7), `paths` walks (2-6) from the bottom row up, each step to the column left, ahead or right, never crossing an edge already drawn. Node types: the bottom row is `battle`, the row under the boss is `rest` when `restBefore` is on, the rest are rolled by `wBattle / wElite / wEvent / wShop / wRest` with rules: no elite below floor `eliteFrom`, no elite, shop or rest right after the same type, a fork never offers two of the same type when it can be avoided, and runs of 5+ floors have at least one shop. `GameDNA_RunMap.audit(map)` returns `{crossings, grazes, orphans, deadEnds, edges, nodes, types}` (the first four are always 0; checked for 6000 maps). `grazes` counts edges that pass within half a column / row of a node they do not end at: the generator straightens the jitter of the nodes involved until there are none. There is no single start pad: every bottom node has its own short start stub down to a trailhead line, and the token waits on that line under the selected node. Floors on screen are numbered 1 (bottom row) to `floors + 1` (the boss).

## Node content (data the designer edits)

```js
nodes: {
  rest: { choices: [
    { label: 'Sleep', text: 'Recover 40% of max HP', apply: node => { hero.hp = Math.min(hero.maxHp, hero.hp + 12); return 'Recovered 12 HP.'; } },
    { label: 'Sharpen', text: 'Attack +2', apply: () => { hero.atk += 2; } } ] },
  shop: { choices: [ { label: 'Healing Draught', text: 'Recover 25 HP', cost: 8, apply: () => { /* heal */ } } ], leave: 'Leave' },
  event: { pool: [ { title: 'Wishing Well', text: 'Old coins glitter in the water.', choices: [
    { label: 'Toss 5 coins', text: 'Max HP +8', cost: 5, apply: () => { /* ... */ } }, { label: 'Walk on', apply: () => 'You leave the well.' } ] } ] },
  battle: { label: 'Battle', desc: 'A fight on the road' }      // optional label / desc / short (pixel footer) per type
}
```

| field | meaning |
|---|---|
| `label` | Row text (keep it short: ~16 letters). |
| `text` | Optional hint after the label (cut to fit). |
| `cost` | Optional coins. Disabled with "need N" when `getGold()` is lower; on pick the module calls `spendGold(cost)` **if you passed it** (pass `getGold` only and charge inside `apply` when your own buy function already takes the coins). |
| `apply(node, choice)` | Your effect, run once on pick inside `update()`. Return a string to show as the result line (default: the label). |
| `when(node)` | Optional: false disables the row (`whyNot` text). |
| `priority` | Optional number or `node => number` for autoplay: it takes the enabled row with the highest priority; rows below 0 are skipped (e.g. a heal only when HP is under half). Default 0, first row wins. |
| `result` | Optional fixed result line. |

**A game without coins**: give no `cost`, `getGold` or `spendGold`, and do not invent a currency (or a HUD bar for it); the shop is then one free pick ("Take one free supply") and events trade HP for max HP or attack. `choices` may also be a function `node => [...]`. Shops get a **Leave** row by default (`leave: false` removes it, a string renames it); rest and event rows do not. With `getGold`, a shop stays open after a purchase (`multi`): the bought row shows *sold*, the others re-check the coins left (*need N*), until Leave; without coins it is one free pick (`multi: true / false` per type or panel overrides). The pixel look draws the selected row's `text` and price under the rows. An event node draws one entry of `pool` (or `options.events`), seeded by the node, without repeats until the pool is used up. **No choices for a type** = a single Continue row and one console warning.

`onEnter(node)` may also return `'host'` for a rest / shop / event node: the module closes the map and waits for `finish()` (use it to open your own shop window), or an object `{title, text, choices}` to replace that panel's content.

## API

`GameDNA_RunMap.create(options)` returns an instance.

| option | meaning |
|---|---|
| `onEnter(node)` | **Required.** Called once when the token arrives, inside `update()`. `node = {id, type, label, floor, floors, tier (0 bottom .. 1 top), elite, boss, seed (an integer for your own variation), route, run}`. For `battle` / `elite` / `boss` start your fight; the map fades out (0.26 s, world still paused) and then `busy()` is false while your fight plays. |
| `nodes`, `events` | Panel content (above). |
| `getGold()`, `spendGold(n)` | Optional coins for costs (shown, disabled when short). |
| `hpFrac()` | Optional 0..1, used by autoplay routing (rest when hurt). |
| `onChoice(choice, node)`, `onRunEnd(result)` | After each panel pick; after the boss is finished (`{won: true}`) or a fight is lost (`{won: false}`): `{won, node, type, floor, route}`. |
| `autoplay` | `true`/`false` or a function, read every step. When true the map and panels pick by themselves after `autoMs` and ignore presses, so `?auto=1` never waits. |
| `view` / `bounds` | Play field `{w, h}` / `{x, y, w, h}` in native px (or functions). Pass it on HD canvases that scale for devicePixelRatio (otherwise the canvas size is used). |
| `uiRects()` / `getObstacles()` | Rects (without `id`) the map sheet and the floor badge stay off: the sheet shrinks between HUD bars above and below it; the badge takes the first free corner. |
| `skin` | Skin id or object (needs `skin-api.js`); `false` = built-in look. |
| `params` | `seed` 1, `floors` 6, `width` 5, `paths` 4, `wBattle` 46, `wElite` 14, `wEvent` 22, `wShop` 8, `wRest` 10, `eliteFrom` 3, `restBefore` `'on'`, `look` `'auto'` / `'hd'` / `'pixel'`, `dim` 0.62, `openMs` 320, `travelMs` 620, `closeMs` 260, `resultMs` 900, `autoMs` 900, `autoRoute` `'balanced'` / `'safe'` / `'bold'` / `'first'`, `reopen` `'auto'` (`'manual'`: after `finish()` wait for `open()`), `badge` `'on'` (floor chip while a node is away), `title` `'Choose your path'`, `legend` `'on'`, `pixelBelow` 300. |
| `onSfx(name)`, `debug(e)` | Optional: `open`, `move`, `go`, `arrive`, `pick`, `leave`, `deny`. Debug events: `start` (with the map), `open`, `choose`, `enter`, `panel`, `choice`, `deny`, `cleared`, `away`, `finish`, `finishIgnored`, `end`. |

| method | |
|---|---|
| `start({seed, params, open})` | New run: generate from the seed and open the map (`open: false` waits for `open()`). Call at every new game / restart. |
| `finish({won})` | The current fight node is over (`won` defaults to true). Lost: the run ends (`onRunEnd`). Boss won: the run ends. Otherwise the map reopens one floor up. Safe to call during `onEnter` or the fade (it waits); ignored with a warning when no node is away. |
| `busy()` | True while the map, the travel, a panel or the closing fade is on screen. While busy, pause the world and send input here. |
| `away()` | The id of the fight node your game is playing, or null. |
| `key(code, down)` | Raw keys (`e.code` or `e.key`); returns `true` only while busy and for keys it uses: arrows / WASD move, Z / Space / Enter go or take, X / Escape / Backspace jump to Leave. |
| `press(action)` | For games with their own input layer: `'left' 'right' 'up' 'down' 'confirm' 'back'`. Key-down edges only. Ignored in autoplay. |
| `pointer(x, y, down)` / `hitTest(x, y)` | Native px: hover selects the nearest connected node (within its ring + 6u, at least 22 css px on small canvases, measured from the canvas's on-screen size) or a panel row; a press on it goes / takes. `hitTest` returns `'node'`, `'row'` or null (for a pointer cursor). On canvases shown small (under ~9 css px text) the HD tooltip, legend and panel text grow up to 1.35x. |
| `update(dtMs)` | Every fixed step, also while busy. The only clock. |
| `draw(ctx, ox = 0, oy = 0)` | Last in the draw pass, under the HUD's transform, outside shake. The map while busy; the floor badge while away. Never throws. |
| `state()` | `{phase: 'idle' | 'map' | 'travel' | 'panel' | 'closing' | 'away' | 'wait' | 'done', at, floor, floors, route, choices, selected, away, panel, result, ...}`. |
| `map()`, `node(id)`, `current()`, `choices()`, `route()`, `recommend()`, `layout()`, `lastDrawn()`, `rect()`, `result()` | The generated map, node info, what autoplay would pick, node positions on screen, drawn rects (`sheet`, `panel`, `tip`, `badge`). |
| `serialize()` → `{v: 1, seed, at, route, cleared, usedEvents, away, result}`, `restore(obj or JSON)` | For saves (the map is regenerated from the seed). |
| `reset()`, `end()`, `setParams(p)`, `params()`, `auto(on)` | Forget the run / close it now / change params (take effect at the next `start()`). |

## Integration (15 lines)

```js
const run = GameDNA_RunMap.create({ view: { w: W, h: H }, params: { seed: 1, floors: 6 },
  uiRects: () => [hudRect], autoplay: () => AUTOPLAY, hpFrac: () => hero.hp / hero.maxHp,
  getGold: () => coins, spendGold: n => { coins -= n; },
  onEnter: node => { if (node.type !== 'rest' && node.type !== 'shop' && node.type !== 'event') startFight(node); },
  nodes: { rest: { choices: REST }, shop: { choices: SHOP }, event: { pool: EVENTS } },
  onRunEnd: r => { /* the game's own ending follows */ } });
function newGame() { /* ... */ run.start(); }
function onFightOver(won) { /* the game's own result code */ run.finish({ won }); }
function step() {
  if (run.busy()) { run.update(1000 / 60); return; }   // world and autopilot paused
  /* ... the world ... */ run.update(1000 / 60);
}
addEventListener('keydown', e => { if (run.key(e.code, true)) { e.preventDefault(); return; } /* game keys */ });
addEventListener('keyup', e => run.key(e.code, false));
function render() { /* world, HUD */ run.draw(ctx); }
```

Find and keep every caller working: the `?t=&freeze=1` fast-forward and autoplay call the same step; the autopilot must play every fight `onEnter` starts; restart calls `start()` again; a fight that can end by fleeing, timeout or game over still calls `finish()`.

**Self-check without a browser**: module byte-identical; `create(` once; `start(` at each new game; every path out of a started fight reaches `finish(`; `update(` every step including while busy; each `apply` writes a stat the game reads.

## Notes

- Headless cost (Chromium, 2026-11-17, machine load ~9.6, median of 3 x 60 frames of update + draw in the demo): HD map 1.8 ms at 640x360 (12-floor map 2.4 ms, panel open 2.1 ms), pixel map 0.11 ms at 256x224; nothing is drawn while a fight node is away except the badge.
- `?t=&freeze=1`: all motion (fades, travel, pulses, scroll) comes from `update()` time; `draw()` only reads state.

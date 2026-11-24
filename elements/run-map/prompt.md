# Add a branching run map to my game

**Required:** `{{wrap}}` = what fight nodes play (e.g. "battle = one of my fights, elite = a tougher one, boss = my final fight").
Defaults:
`{{seed}}` = 1 · `{{floors}}` = 6 · `{{width}}` = 5 · `{{paths}}` = 4 · `{{wElite}}` = 14 · `{{wEvent}}` = 22 · `{{wShop}}` = 8 · `{{wRest}}` = 10 · `{{eliteFrom}}` = 3 · `{{look}}` = auto · `{{autoRoute}}` = balanced

---

You get `run-map.js` and its `README.md`. **Include the module verbatim** (`<script src>` or pasted unchanged). `GameDNA_RunMap` is a seeded roguelite route map.

**The map wraps your existing play: {{wrap}}.** Add code; never remove or rename anything.

**First, read my game**: fixed step and loops, input, draw pass, HUD, restart, **where a fight starts and is won or lost**.

**Integration points**

1. **Load** the module first.
2. **Create one instance** once the screen size is known:
```js
const run = GameDNA_RunMap.create({
  view: { w: <native width>, h: <native height> },
  params: { seed: {{seed}}, floors: {{floors}}, width: {{width}}, paths: {{paths}}, wElite: {{wElite}}, wEvent: {{wEvent}}, wShop: {{wShop}}, wRest: {{wRest}}, eliteFrom: {{eliteFrom}}, look: '{{look}}', autoRoute: '{{autoRoute}}' },
  uiRects: () => [ /* HUD rects */ ], autoplay: () => <autoplay flag>,
  hpFrac: () => <hp / maxHp>,
  getGold: () => <coins>, spendGold: n => { <coins -= n> },   // ONLY if the game already has coins
  onEnter: node => { /* 'battle' | 'elite' | 'boss': start that fight */ },
  nodes: { rest: { choices: [...] }, shop: { choices: [...] }, event: { pool: [...] } }
});
```
3. **Start**: `run.start()` at every new game (title, restart).
4. **Fight nodes** (`onEnter`): start the game's own fight or room for `battle`, a tougher one for `elite` (scale by `node.tier` 0..1), the final fight or goal for `boss`. Where the game decides that fight is over (also fleeing, game over) call `run.finish({ won })` once. After the boss the game's own ending runs. What the old game reached by walking (a gate, the final area) opens at the boss node; pre-run objective text in the HUD changes to the current node (or hides) until then.
5. **Rest / shop / event** are module panels; choices `{label, text, cost, priority, apply: node => '<result line>'}` change stats the game already has: rest 2, shop 3 items, 3 original events `{title, text, choices: [2]}`. **No coins in the game? Add none**: leave out `cost`, `getGold`, `spendGold`; the shop becomes "take one free supply" and events trade HP for max HP or attack. Never add HUD bars for new or duplicate stats. `priority` steers autoplay.
6. **Pause and input**: top of the fixed step: `if (run.busy()) { run.update(<step ms>); return; }`; else `run.update(<step ms>)` at the end. First in keydown: `if (run.key(e.code, true)) { e.preventDefault(); return; }`; keyup: `run.key(e.code, false)`. Polled input: `run.press('left'|'right'|'confirm')`; pointer: `run.pointer(x, y, down)`.
7. **Draw**: `run.draw(ctx)` last, outside shake.

**Autoplay must still end**: the map picks by itself; the autopilot must play every fight `onEnter` starts. The ending may differ (note it).

**Self-check without a browser**
- Module byte-identical; one `create(`.
- `start(` at every new game; every way out of a started fight reaches `finish(`.
- `update(` every step, also while busy (freeze loop too).
- Walk one floor: `start()` -> Z -> `onEnter(battle)` -> fight -> `finish()` -> map reopens.

**Acceptance checks**
1. A new game opens the map; arrows / mouse / touch pick nodes; Z travels.
2. {{wrap}}; panels change real stats; the boss ends the run.
3. `?t=<ms>&freeze=1` is deterministic; `?auto=1` ends without errors.

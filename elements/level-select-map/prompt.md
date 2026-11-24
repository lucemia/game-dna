# Add a level-select map between the levels of my game

Defaults: `{{walk}}` = 1.25 · `{{reveal}}` = 4 · `{{spacing}}` = 6 · `{{terrain}}` = coast · `{{locked}}` = faint · `{{panel}}` = auto · `{{iris}}` = on · `{{camera}}` = smooth

---

You are given `level-select-map.js`, a finished module, and its `README.md`. **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged into its own `<script>`). It defines `GameDNA_LevelMap`: an overworld of nodes joined by paths; the hero walks node to node; a clear reveals the next path stone by stone; it draws terrain, hero, panel and iris. Add code; never remove or rename functions.

**First, read my game** and note: where the title starts play; what one level is (layout, spawn, goal); where a level ends (goal, life lost, game over); the win and game-over screens and the state names other code checks; the fixed step and every caller (`?t=&freeze=1`, autoplay); how directions and confirm arrive; the draw pass.

**1. Levels.** One node per level. If my game has only one level, make 3–4 without new art: split it at its checkpoints (level k spawns at checkpoint k and ends at checkpoint k+1; the last ends at the real goal), or replay it with variants (more enemies). The last is the `castle`. Give one level a secret exit from something the game already has (a hidden spot, all coins) leading to a `bonus` node. Add one `hut`.

**2. Scene flow:** title → map → level → map … → castle cleared → my game's own win screen (same state names).

**3. Create the map** when a run starts (and on restart), in a new variable whose name is free in my game:
```js
worldMap = GameDNA_LevelMap.create({
  nodes: [{id, x, y, kind, name}, ...], edges: [{a, b, via: [[x, y]], exit: 'normal' | 'secret'}, ...],   // map px; larger than the screen scrolls
  view: {x: 0, y: 0, w: <screen w>, h: <screen h>}, state: <saved state or null>,
  params: {walk: {{walk}}, reveal: {{reveal}}, spacing: {{spacing}}, terrain: '{{terrain}}', locked: '{{locked}}', panel: '{{panel}}', iris: '{{iris}}', camera: '{{camera}}'},
  enterLevel: id => { /* set that level up the way the game started its level, then scene = level */ },
  onSave: st => { /* store st, or nothing */ }, onSound: name => { /* optional */ },
  auto: () => <the game's autoplay flag>, enabled: () => scene === 'map'
});
```

**4. Level end.** At the goal: `worldMap.complete(id, gotSecret ? 'both' : 'normal')` and scene = map, except the castle (go to the win screen). Life lost: keep the game's rule (respawn at its checkpoint, or `worldMap.fail(id)` back to the map). Game over unchanged.

**5. Step:** while on the map, call `worldMap.update({left, right, up, down, confirm})` once per fixed step instead of the level update (held directions including up/down; confirm = the jump/OK press this step). Taps between steps must count.

**6. Draw:** while on the map, `worldMap.draw(ctx)` instead of the level.

**7. Autoplay:** `auto` makes the map walk and enter levels itself; the game's autopilot keeps playing levels and the title. The freeze loop calls the same step.

**Self-check without a browser**
- Module byte-identical, loaded first; `worldMap` exists before the first map step.
- Every old caller of level start and end still works.
- Trace autoplay: title → map → `enterLevel` → goal → `complete` → map → reveal → next level … → castle → win screen.
- Every edge names existing node ids.

**Acceptance checks**
1. Locked paths show faint; arrows walk; confirm enters; a clear reveals the next path stone by stone; the node turns blue.
2. The secret exit opens the bonus path; the hut saves; a big map scrolls.
3. `?auto=1` reaches the win screen with no console errors; `?t=<ms>&freeze=1` is deterministic; level controls unchanged.

# Add crafting with recipes to my game

Defaults (change before pasting):
`{{slots}}` = 3 · `{{craftMs}}` = 650 · `{{theme}}` = forge · `{{toasts}}` = on · `{{title}}` = Workbench

---

You are given `crafting-recipes.js`, a finished module, and its `README.md`. **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged into its own `<script>`). It defines `GameDNA_CraftingRecipes`. Read the README API table first.

Only add code; never delete functions.

**First, map my game**: the fixed step and how `?t=`, `?freeze=1`, `?auto=1` drive it; camera and draw order; HUD boxes; input handlers; where items are given, counted and spent (no inventory? add `bag = {id: count}` filled where foes fall or chests open); restart.

**Integration points**

1. **Data**: 5-8 recipes from the game's items plus new ingredients it drops, using each discovery kind: `'known'`, `'have:a,b'`, `'crafted:<recipe>'`, `'experiment'`. Give every item an `icon` from the README list (or the game's art) so none look alike.
2. **Create one instance** after the game state exists:
```js
const craft = GameDNA_CraftingRecipes.create({
  items, recipes,
  inventory: { count: id => bag[id] || 0, take: (id, n) => { bag[id] -= n; }, give: (id, n) => { bag[id] = (bag[id] || 0) + n; } },
  view: { x: 0, y: 0, w: SCREEN_W, h: SCREEN_H }, canvas: canvasElement,
  avoid: () => [/* player sprite box FIRST, then the bench, an NPC: SCREEN px */],
  uiRects: () => [/* every HUD box, SCREEN px */],
  onCraft: info => { /* the game reacts: heal, equip, light, open a door */ },
  params: { slots: {{slots}}, craftMs: {{craftMs}}, theme: '{{theme}}', toasts: '{{toasts}}', title: '{{title}}' }
});
```
3. **Open** in update logic: the interact key at a bench (or a free key, C). Clear that key so it does not also act in the world.
4. **Step**: every fixed step, also the `?t=` fast-forward: `craft.update(stepMs)`; if `craft.busy()`, return before the world moves.
5. **Input**: while `craft.busy()`, keys go only to `craft.key(e.code, true, e.repeat)`; pointer/touch in canvas units to `craft.pointer('down' | 'move' | 'up', x, y)`.
6. **Draw**: `craft.draw(ctx)` last, after the HUD, outside any camera transform.
7. **React**: `onCraft` makes the result matter (HUD, stat, light). Restart: `craft.reset()` (safe before the first update).

**Rules**
- The game's inventory is the only record: no second counter. Ingredients leave only through `take`, results arrive only through `give`.
- `?auto=1` must end exactly as before: the autopilot never opens the bench; new drops never consume the game's random numbers (use counters).
- No `Math.random` or wall clock in new code.

**Self-check without a browser**
- Every recipe id exists in `items` or the game's item table; every place that gives an ingredient writes the same `bag`.
- `avoid` and `uiRects` use screen px after the camera (world minus camera).
- `update` runs once per fixed step everywhere; `draw` runs last.
- Walk one example: bag `{herb: 3, gel: 1}`, recipe herb 2 + gel 1: craft -> bag `{herb: 1, gel: 0, salve: 1}`; craft again -> "Need 1 Herb", bag unchanged.

**Acceptance checks**
1. The bench opens beside the player, never over the HUD; unknown recipes show as silhouettes with a hint.
2. Crafting takes the ingredients once and gives the result once; the HUD and bag agree; no count goes below 0.
3. Missing ingredients or a wrong mix shake the bench with a red reason and cost nothing.
4. Holding a recipe's ingredients, crafting its parent and trying a new mix each show one toast.
5. `?auto=1` finishes without console errors as before; the same `?t=` frame twice is identical.

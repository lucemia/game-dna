# Add a shop and inventory grid to my game

**Required:** `{{where}}` = where the shop opens (e.g. "a merchant in the village").
Defaults:
`{{capacity}}` = 20 · `{{cols}}` = 5 · `{{stack}}` = 9 · `{{sellRatio}}` = 0.5 · `{{qty}}` = on · `{{compare}}` = on · `{{equipAfterBuy}}` = on · `{{tooltip}}` = on · `{{autoBuy}}` = best · `{{tint}}` = a · `{{dim}}` = 0.35

---

You get `shop-inventory.js` (a finished module) and its `README.md`. **Include the module verbatim**; never rewrite it. It defines `GameDNA_ShopInventory`: a modal shop with buy / sell lists, a bag grid and gear comparison.

**The shop opens exactly at: {{where}}.** Add code; never remove or rename functions.

**First, read my game**: the fixed step and every loop calling it (animation, `?t=&freeze=1`, autoplay); input; draw pass and HUD; gold; party stats; existing item counts and their readers; restart.

**Data** (plain objects, original English names): an item table `{id: {name, kind, price, stats, icon, desc}}` and a stock list. No gold in the game? Add it (start amount, rewards). No equipment? Add `equip: {weapon: <id>}` per member; attack = base + equipped stats.

**Integration points**

1. **Load** the module before the game script.
2. **Create one instance**:
```js
const shop = GameDNA_ShopInventory.create({
  bounds: { x: 0, y: <field top>, w: <screen width>, h: <field height> }, items: ITEMS, startItems: { /* the game's starting items */ },
  params: { capacity: {{capacity}}, cols: {{cols}}, stack: {{stack}}, sellRatio: {{sellRatio}}, qty: '{{qty}}', compare: '{{compare}}', equipAfterBuy: '{{equipAfterBuy}}', tooltip: '{{tooltip}}', autoBuy: '{{autoBuy}}', tint: '{{tint}}', dim: {{dim}} },
  autoplay: () => <the game's autoplay flag>, uiRects: () => [ /* HUD rects to keep visible */ ],
  getGold: () => <gold>, setGold: n => { <gold> = n; },
  getParty: () => <members as [{id, name}]>, getEquipped: (id, slot) => <that member's item id in slot, or null>,
  onEquip: (id, itemId, slot, oldId) => { <set the slot; recompute stats> }, onUse: (itemId, id) => <apply; false if no effect>
});
```
3. **Open** at {{where}}, in update logic: `shop.open({ name: '<shop name>', id: '<shop id>', stock: STOCK, onClose: r => { ... } })`.
4. **Input and pause**: keydown `if (shop.busy()) { if (shop.key(e.code, true)) e.preventDefault(); return; }`, keyup `shop.key(e.code, false)`, pointer `shop.tap(x, y)` (native px). Top of the fixed step: `if (shop.busy()) { shop.update(<step ms>); return; }` (drop buffered presses there); else `shop.update(<step ms>)` at the end.
5. **Draw**: `shop.draw(ctx)` last, after the HUD.
6. **One bag**: old item counts read/write through `shop.count(id)` / `shop.setCount(id, n)` (a getter/setter object keeps old code working). Saves store `shop.serialize()`, loads call `shop.restore()`.
7. **Reset**: `shop.clear(); shop.reset(<starting items>)` at new game / restart.

**Autoplay**: the shop buys one item (`{{autoBuy}}`) and closes by itself.

**Self-check without a browser**
- Module byte-identical, loaded first.
- `open(` only in update logic at {{where}}; never in draw or key handlers.
- `update(` every fixed step, also while busy; the world waits while busy.
- Every old item-count reader goes through the module.
- Walk one purchase: gold 50, sword 30 → `setGold(20)`, "Equip now?" → `onEquip` → attack = base + sword; old weapon back in the bag.

**Acceptance checks**
1. At {{where}} the shop opens: buy with an amount, sell at the sell-back price, the grid shows stacks and `n/{{capacity}}`, gear shows green ▲ / red ▼ per member.
2. Too expensive → "Not enough gold." (never negative); full → "Your bag is full."; equipping changes the stat the game uses.
3. `?t=<ms>&freeze=1` is deterministic; `?auto=1` reaches the game's end with no console errors.

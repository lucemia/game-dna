// Basket hint for G-01 shop-inventory: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'ui',
  lead: 'The shop opens exactly at: {{where}}. Do not open it anywhere else.',
  does: 'A modal shop window: BUY / SELL / BAG tabs, goods with 16x16 icons and prices, an amount picker, a bag grid with stacks and a capacity, a tooltip, and green up / red down arrows comparing gear against what each party member wears. "Not enough gold." and "Your bag is full." are refused with a message (gold never goes negative); items sell back at a ratio; Use and Equip call the game\'s callbacks. The bag lives in the module (`count` / `setCount`, `serialize` / `restore`); gold, equipment and stats stay in the game and change only through `setGold`, `onEquip`, `onUse`. While it is open (`busy()`) input goes to the shop and the world waits; under autoplay it buys one deterministic thing and leaves.',
  params: {
    where: 'where the shop opens (shown at the top)',
    capacity: 'create `params.capacity`', cols: 'create `params.cols`', stack: 'create `params.stack`', sellRatio: 'create `params.sellRatio`',
    qty: 'create `params.qty`', compare: 'create `params.compare`', equipAfterBuy: 'create `params.equipAfterBuy`', tooltip: 'create `params.tooltip`',
    autoBuy: 'create `params.autoBuy` (what autoplay buys; `none` keeps autoplay outcomes identical)', tint: 'create `params.tint`', dim: 'create `params.dim`'
  },
  steps: [
    ['Data, next to the game\'s other tables',
      'An item table `ITEMS = {id: {name, kind, price, stats, stack, icon, desc}}` (kinds `consumable`, `weapon`, `armor`, `shield`, `head`, `accessory`, `key`; icons `sword dagger axe spear bow staff shield helmet armor boots ring amulet potion herb bread key gem scroll bomb`) and a stock list `[\'herb\', {id: \'sword\', qty: 1}]`, original English names. No gold in the game: add it (start amount, rewards). No equipment: add `equip: {weapon: <id>}` per member and compute each stat as base + equipped items.'],
    ['Once, after the screen size and HUD layout exist',
      '`shop = GameDNA_ShopInventory.create({bounds, items: ITEMS, startItems: {<the game\'s starting items>}, params: {capacity: {{capacity}}, cols: {{cols}}, stack: {{stack}}, sellRatio: {{sellRatio}}, qty: \'{{qty}}\', compare: \'{{compare}}\', equipAfterBuy: \'{{equipAfterBuy}}\', tooltip: \'{{tooltip}}\', autoBuy: \'{{autoBuy}}\', tint: \'{{tint}}\', dim: {{dim}}}, autoplay: () => <autoplay flag>, uiRects: () => [HUD, party panel], getGold, setGold: n => { gold = n; }, getParty: () => [{id, name}], getEquipped: (id, slot) => <item id or null>, onEquip: (id, item, slot, old) => { <set slot; recompute stats> }, onUse: (item, id) => <apply; false or a reason if no effect>})`. `bounds` = play field `{x, y, w, h}` in native px.'],
    ['The moment named above, in update logic (the function every caller reaches: talking, a tile, a menu key, the tap path)',
      '`shop.open({name, id, stock: STOCK, onClose: r => { <what followed the old moment> } })`; `shop.openBag()` for an inventory-only screen.'],
    ['Wherever the game already counts items (item command, HUD, autopilot, save code)',
      'One bag: make the old counter read and write through the module (`get potion() { return shop.count(\'potion\'); }, set potion(v) { shop.setCount(\'potion\', v); }`) or replace its reads with `shop.count(id)` and its decrements with `shop.remove(id, 1)`. Save data gets `shop.serialize()`; load calls `shop.restore(data)`.'],
    ['Input handlers and the top of your fixed update step (the one the animation loop, `?t=&freeze=1` and autoplay call)',
      'keydown `if (shop.busy()) { if (shop.key(e.code, true)) e.preventDefault(); return; }`, keyup `shop.key(e.code, false)`, pointer `if (shop.busy()) shop.tap(x, y)` (native px). Step: `if (shop.busy()) { <drop buffered presses>; shop.update(1000 / 60); return; }`; otherwise `shop.update(1000 / 60)` once at the end.'],
    ['Your draw pass', '`shop.draw(ctx)` last, after the HUD, outside any shake translate.'],
    ['New game / restart', '`shop.clear(); shop.reset(<starting items>)`.']
  ],
  gotchas: [
    'Two item counts disagree (the item command shows 4, the bag 6) -> keep one bag: bind the old counter to `count` / `setCount`.',
    'A stat grows every time gear is equipped -> `onEquip` must recompute base + equipped items, never add.',
    'The shop buys twice or reopens after closing -> the opening confirm, or buffered presses, reach it; open in update logic and drop buffered presses while `busy()`.',
    'The world keeps moving under the window -> gate the whole step on `busy()`.',
    '`?auto=1` hangs in the shop -> pass the autoplay flag as `autoplay`; call `update` inside the fixed step.',
    '`?auto=1` ends differently -> only if the autopilot visits the shop and later fights use the new gear; `autoBuy: none` keeps the end identical.',
    'The window covers the HUD or party panel -> return those rects from `uiRects()`.',
    'Gold goes negative or items appear -> only `setGold` and the bag methods change them; never apply prices again in `onBuy`.'
  ],
  checks: [
    '{{where}} opens the shop: buy with an amount, sell at the sell-back price, the bag grid shows stacks and `n/{{capacity}}`, the tooltip shows names, gear shows green up / red down arrows per member.',
    'Too expensive -> "Not enough gold." and gold unchanged (never negative); full bag -> "Your bag is full."; equipping changes the stat the game uses; using an item applies it; X leaves.',
    '`?t=<ms>&freeze=1` gives the same frame every time; `?auto=1` reaches the game\'s end with no console errors.'
  ],
  selfcheck: [
    'Grep `open(`: only at {{where}}, in update logic, never in draw or key handlers; every caller of that moment reaches it.',
    'Grep `update(`: every fixed step including while busy; the world (and the autopilot\'s counters) wait while busy. Grep the old item counter: every reader goes through the module.',
    'Walk one purchase: gold 50, sword 30 -> `setGold(20)`, "Equip now?" -> `onEquip(id, \'sword\', \'weapon\', <old>)` -> stat = base + sword; the old weapon is back in the bag.'
  ],
  offers: {
    'ui-rects': { title: 'shop window', text: '`shop.rect()` is the open window, or null; it is modal (the world is paused), so other overlays should not draw over it.' },
    'save-data': { title: 'bag for saves', text: '`shop.serialize()` is plain JSON for the save file; `shop.restore(data)` on load (gold and equipment come from the game\'s own state).' }
  },
  wants: {
    'ui-rects': { title: 'UI rects', text: 'Return them from the shop\'s `uiRects()`, so the window stays clear of them.', check: 'The shop window never covers the other element\'s HUD, panels or plates.' },
    'battle-start': { title: 'reset', text: 'Do NOT reset the bag at every battle start (items carry over); only at a new game: `shop.clear(); shop.reset(...)`.' }
  }
};

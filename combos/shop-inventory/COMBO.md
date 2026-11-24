# Add shop & inventory grid to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `shop-inventory.js` (one global, `GameDNA_ShopInventory`), API reference `shop-inventory.README.md`

README example names are placeholders.

## Where it goes in my game (my choice; follow it exactly)

- **Shop & inventory grid:** The shop opens exactly at: a merchant the hero talks to. Do not open it anywhere else.

## Shared premises

1. **Include each module file verbatim; never edit it.** Load it with its own `<script src>` before the game's script, or paste it unchanged into its own `<script>` tag. If a module seems to need a change, adapt my game around it and tell me.
2. **Resolution:** keep my game's native resolution and integer scaling as they are. Call module draw functions on my 2D context inside the same transform as my sprites (one module pixel = one game pixel), and keep my game's own image-smoothing setting (off for pixel art, on for smooth or HD games; never switch it).
3. **Time:** drive every module from one fixed 60 Hz step (1000 / 60 ms). If my loop uses variable delta time, accumulate it and run whole steps (at most 250 ms per frame).
4. **Coordinates:** native screen pixels (world minus camera) unless a section says tiles.
5. **Art and names:** anything new you draw or name is original (no real game, character, place or brand names); English UI text; do not restyle my game.
6. **Hook, don't replace:** add calls or change bodies; never delete or rename a function.
7. **Keep every other caller working.** Find every caller and reader of what you change (turn order, input, moves, menus, HUD): autopilot/AI, test hooks, URL parameters such as `?auto=1`, `?t=` and `?freeze=1`, keyboard shortcuts, end-turn buttons. Update each one. My game's own autoplay must still finish a whole game. Keep existing HUD info (HP bars, max HP) and existing commands.

## Order of work

1. **Read the game first.** Write down (file, function) where these live: loop/update step; draw pass and its order (background, actors, effects, HUD); input; where damage/HP changes are applied; where turns, actions or selections are chosen and played; HUD windows and their rects; camera; battle/scene start and end; and every caller from premise 7.
2. **Check the prerequisites** below against those notes. If one is missing, add the smallest working version and tell me.
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Shop & inventory grid [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Shop & inventory grid:** the moment the shop opens (talking to a merchant, a shop tile, a menu key), in update logic: open({stock, onClose}); the game's gold: getGold() and setGold(n), the only way the shop changes it; party members and what they wear: getParty() -> [{id, name}], getEquipped(id, slot) -> item id; apply callbacks: onEquip(id, item, slot, old) recomputes stats; onUse(item, id) applies an effect (false = no effect); input (directions, confirm, cancel, pointer); a fixed 60 Hz update step; rectangles of UI to keep clear; optional: the game's autoplay flag.

## Element 1: Shop & inventory grid (`shop-inventory.js`, `GameDNA_ShopInventory`)

A modal shop window: BUY / SELL / BAG tabs, goods with 16x16 icons and prices, an amount picker, a bag grid with stacks and a capacity, a tooltip, and green up / red down arrows comparing gear against what each party member wears. "Not enough gold." and "Your bag is full." are refused with a message (gold never goes negative); items sell back at a ratio; Use and Equip call the game's callbacks. The bag lives in the module (`count` / `setCount`, `serialize` / `restore`); gold, equipment and stats stay in the game and change only through `setGold`, `onEquip`, `onUse`. While it is open (`busy()`) input goes to the shop and the world waits; under autoplay it buys one deterministic thing and leaves.

**The shop opens exactly at: a merchant the hero talks to. Do not open it anywhere else.**

**Parameters chosen:** `capacity` = 20, `cols` = 5, `stack` = 9, `sellRatio` = 0.5, `qty` = on, `compare` = on, `equipAfterBuy` = on, `tooltip` = on, `autoBuy` = best, `tint` = a, `dim` = 0.35.

**Where it goes** (by role; find these places in my game):

1. *Data, next to the game's other tables:* An item table `ITEMS = {id: {name, kind, price, stats, stack, icon, desc}}` (kinds `consumable`, `weapon`, `armor`, `shield`, `head`, `accessory`, `key`; icons `sword dagger axe spear bow staff shield helmet armor boots ring amulet potion herb bread key gem scroll bomb`) and a stock list `['herb', {id: 'sword', qty: 1}]`, original English names. No gold in the game: add it (start amount, rewards). No equipment: add `equip: {weapon: <id>}` per member and compute each stat as base + equipped items.
2. *Once, after the screen size and HUD layout exist:* `shop = GameDNA_ShopInventory.create({bounds, items: ITEMS, startItems: {<the game's starting items>}, params: {capacity: 20, cols: 5, stack: 9, sellRatio: 0.5, qty: 'on', compare: 'on', equipAfterBuy: 'on', tooltip: 'on', autoBuy: 'best', tint: 'a', dim: 0.35}, autoplay: () => <autoplay flag>, uiRects: () => [HUD, party panel], getGold, setGold: n => { gold = n; }, getParty: () => [{id, name}], getEquipped: (id, slot) => <item id or null>, onEquip: (id, item, slot, old) => { <set slot; recompute stats> }, onUse: (item, id) => <apply; false or a reason if no effect>})`. `bounds` = play field `{x, y, w, h}` in native px.
3. *The moment named above, in update logic (the function every caller reaches: talking, a tile, a menu key, the tap path):* `shop.open({name, id, stock: STOCK, onClose: r => { <what followed the old moment> } })`; `shop.openBag()` for an inventory-only screen.
4. *Wherever the game already counts items (item command, HUD, autopilot, save code):* One bag: make the old counter read and write through the module (`get potion() { return shop.count('potion'); }, set potion(v) { shop.setCount('potion', v); }`) or replace its reads with `shop.count(id)` and its decrements with `shop.remove(id, 1)`. Save data gets `shop.serialize()`; load calls `shop.restore(data)`.
5. *Input handlers and the top of your fixed update step (the one the animation loop, `?t=&freeze=1` and autoplay call):* keydown `if (shop.busy()) { if (shop.key(e.code, true)) e.preventDefault(); return; }`, keyup `shop.key(e.code, false)`, pointer `if (shop.busy()) shop.tap(x, y)` (native px). Step: `if (shop.busy()) { <drop buffered presses>; shop.update(1000 / 60); return; }`; otherwise `shop.update(1000 / 60)` once at the end.
6. *Your draw pass:* `shop.draw(ctx)` last, after the HUD, outside any shake translate.
7. *New game / restart:* `shop.clear(); shop.reset(<starting items>)`.

**Common mistakes** (symptom -> fix):

- Two item counts disagree (the item command shows 4, the bag 6) -> keep one bag: bind the old counter to `count` / `setCount`.
- A stat grows every time gear is equipped -> `onEquip` must recompute base + equipped items, never add.
- The shop buys twice or reopens after closing -> the opening confirm, or buffered presses, reach it; open in update logic and drop buffered presses while `busy()`.
- The world keeps moving under the window -> gate the whole step on `busy()`.
- `?auto=1` hangs in the shop -> pass the autoplay flag as `autoplay`; call `update` inside the fixed step.
- `?auto=1` ends differently -> only if the autopilot visits the shop and later fights use the new gear; `autoBuy: none` keeps the end identical.
- The window covers the HUD or party panel -> return those rects from `uiRects()`.
- Gold goes negative or items appear -> only `setGold` and the bag methods change them; never apply prices again in `onBuy`.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Shop & inventory grid] a merchant the hero talks to opens the shop: buy with an amount, sell at the sell-back price, the bag grid shows stacks and `n/20`, the tooltip shows names, gear shows green up / red down arrows per member.
- [Shop & inventory grid] Too expensive -> "Not enough gold." and gold unchanged (never negative); full bag -> "Your bag is full."; equipping changes the stat the game uses; using an item applies it; X leaves.
- [Shop & inventory grid] `?t=<ms>&freeze=1` gives the same frame every time; `?auto=1` reaches the game's end with no console errors.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `shop-inventory.js` sha256 `69f87835aaaf570f...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Shop & inventory grid] Grep `open(`: only at a merchant the hero talks to, in update logic, never in draw or key handlers; every caller of that moment reaches it.
- [Shop & inventory grid] Grep `update(`: every fixed step including while busy; the world (and the autopilot's counters) wait while busy. Grep the old item counter: every reader goes through the module.
- [Shop & inventory grid] Walk one purchase: gold 50, sword 30 -> `setGold(20)`, "Equip now?" -> `onEquip(id, 'sword', 'weapon', <old>)` -> stat = base + sword; the old weapon is back in the bag.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

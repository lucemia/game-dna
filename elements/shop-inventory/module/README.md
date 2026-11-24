# shop-inventory.js (G-01 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_ShopInventory`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns the shop window and the bag: buy and sell lists with prices and an amount picker, the inventory grid (stacks, max stack, capacity), tooltips, the equipment comparison (green up / red down arrows per stat, per party member), "Not enough gold." / "Your bag is full." feedback, the sell-back price, use / equip actions, original 16×16 item icons, and an autopilot for `?auto=1`.

**Who owns what.** The **bag** (which items, how many) lives in the module: read it with `count(id)`, change it with `add` / `remove` / `setCount`, save it with `serialize()` / `restore()`. **Gold, equipment and every stat stay in your game.** The module reads them through `getGold` / `getParty` / `getEquipped` and changes them only by calling `setGold`, `onEquip` and `onUse`. It never touches anything else.

If `skins/skin-api.js` (and a skin such as `pixel16.js`) is loaded before it, it draws through `GameDNA_Skin.resolve(options.skin)` (`frame` for the window, tabs, cells, rows and tooltip; `text` / `measure`; `cursor` for the hand and the cell bracket; an optional `skin.icon(ctx, rect, kind, t, opts)` for icons). Without it, it uses its built-in 16-bit look (the same as `pixel16`). Text uses the built-in 6×8 proportional font on pixel skins.

## Data format (what the designer edits)

```js
const ITEMS = {                         // id -> item (or an array of items with an id field)
  'herb':         { name: 'Healing Herb', kind: 'consumable', price: 8, stats: { hp: 20 }, icon: 'herb', desc: 'Restores 20 HP.' },
  'bronze-sword': { name: 'Bronze Sword', kind: 'weapon', price: 60, stats: { atk: 6 }, icon: 'sword', color: 'bronze', who: ['arden', 'tobin'] },
  'buckler':      { name: 'Buckler', kind: 'shield', price: 45, stats: { def: 3, spd: -1 }, icon: 'shield' },
  'old-key':      { name: 'Old Key', kind: 'key', price: 0, icon: 'key' }
};
const STOCK = ['herb', 'bronze-sword', { id: 'buckler', qty: 2 }, { id: 'herb', price: 6 }];   // ids, or {id, qty (limited), price (override)}
```

| field | meaning |
|---|---|
| `name` | Shown in lists, tooltips and messages. |
| `kind` | `consumable`, `weapon`, `armor` (or `body`), `shield`, `head` (or `helmet`), `accessory` (or `ring`), `key`, `material`, or your own word. The equipment kinds give the slot (`weapon`, `armor`, `shield`, `head`, `accessory`); `slot: '...'` overrides it. |
| `price` | Buy price in gold (integer ≥ 0). Sell price = `floor(price × sellRatio)`; `sell: 30` sets it, `sell: false` (and every `key` item) cannot be sold. |
| `stats` | Plain numbers, e.g. `{atk: 6, def: -1}`. Equipment is compared stat by stat against what each member wears in that slot. The module only displays them; your `onEquip` / `onUse` applies them. |
| `stack` | Max per stack. Default: 1 for equipment and `key` items, `params.stack` (9) otherwise. |
| `icon` | One of `sword dagger axe spear bow staff shield helmet armor boots ring amulet potion herb bread key gem scroll bomb` (default from `kind`). `color` (main material) and `accent` (gem, liquid, trim): `iron bronze silver gold mythril wood leather red blue green purple cloth dark bread glass`. |
| `who` | Optional list of member ids (or names) who can equip it. Default: everybody. |
| `use` | Consumables are usable by default; `use: false` turns that off (e.g. battle-only items, if your `onUse` cannot apply them here). |
| `desc` | One short sentence shown under the stats. |

Party: `getParty()` returns `[{id, name}]` (members with `alive: false` are skipped). With no `getParty`, there is one member `{id: 'hero', name: 'Hero'}`.

## API

`GameDNA_ShopInventory.create(options)` returns an instance.

| option | meaning |
|---|---|
| `items` | **Required.** The item table above. |
| `startItems` | The bag at creation: `{herb: 3}` or `[['herb', 3]]`. |
| `getGold()` / `setGold(n)` | **Required for buying and selling.** `setGold` is the only way the module changes gold; it is called with an integer ≥ 0, after the module checked the price against `getGold()`. |
| `getParty()` | Optional, see above. |
| `getEquipped(memberId, slot)` | Optional: the item id that member wears in that slot now, or null. Used for the comparison and for what goes back into the bag. |
| `canEquip(memberId, item)` | Optional, overrides `who`. |
| `onEquip(memberId, itemId, slot, oldId)` | Optional (without it, nothing can be equipped). Apply the change in your game: set the slot and recompute the stats. Return `false` to refuse. The module has already taken `itemId` out of the bag and puts `oldId` back in. |
| `onUse(itemId, memberId, item)` | Optional (without it, nothing can be used). Apply the effect. Return `false` or a short reason (`'HP is full.'`) when it does nothing: the item is then kept. Any other return uses it up. |
| `onItems({id, delta, count, reason})` | Optional: every bag change (`buy`, `sell`, `use`, `equip`, `unequip`, `add`, `remove`, `set`, `start`). |
| `onBuy(r)`, `onSell(r)`, `onClose(result)`, `onSfx(name)` | Optional. Sounds: `open close move back buy sell equip use error`. |
| `bounds` / `view` | The area the window stays inside, `{x, y, w, h}` or `{w, h}`, native px (or a function). Default: the canvas size at the first `draw()`. |
| `uiRects()` / `getObstacles()` | Optional: rects (`{x, y, w, h}`, no `id`) the window must not cover (HUD bar, a party panel you want to stay visible). The window then shrinks (down to 120 px tall) and moves to fit beside them. |
| `autoplay` | Optional `true`/`false` or a function, read at each `open()`. When true, the window ignores the player and the **autopilot** runs: it walks the cursor to one item (`params.autoBuy`), buys one, equips it on the member who gains most, and leaves, one step every `autoplayMs`. |
| `skin` | Skin id or object (needs `skin-api.js`); default `pixel16`; `false` = built-in look. |
| `params` | `capacity` 20 (stacks in the bag), `cols` 5 (grid columns), `stack` 9, `sellRatio` 0.5, `qty` 'on' (amount picker), `compare` 'on', `tooltip` 'on', `equipAfterBuy` 'on' ("Equip now?" after buying gear), `autoBuy` 'best' (best upgrade, else the cheapest usable item) / 'cheapest' / 'none' / an item id, `tint` 'a' / 'n' / 'b', `dim` 0.35, `width` / `height` 0 (= fit), `margin` 4, `openMs` 120, `autoplayMs` 260, `currency` 'G'. |
| `debug(e)` | Optional: `open buy sell equip use error items close end ignored noroom`. |

All callbacks are wrapped in try/catch; a missing optional callback is fine.

| method | |
|---|---|
| `open(opts)` → bool | Opens the window. `opts`: `stock` (array, see above), `name` (title), `id` (remembers limited stock per shop), `tabs` (default `['buy', 'sell', 'bag']` with stock, `['bag']` without), `tab`, `tint`, `auto`, **`onClose(result)`**. Ignored (false) while one is open. Call it in update logic. |
| `openBag(opts)` | `open` with only the bag tab (an inventory screen; use / equip). |
| `busy()` | True from `open()` until the window has closed. While busy: send keys here, pause the world, skip your own input. |
| `key(code, down)` | `e.code` or `e.key` on keydown (`true`) and keyup (`false`). Arrows move; Z / Space / Enter confirm; X / Escape / Backspace back (X on the list leaves the shop); Q / E / Tab / PageUp / PageDown switch tabs. Returns true for these keys while busy (call `preventDefault`), false otherwise. Held arrows repeat on the module clock. |
| `press(name)` | Your own input instead: `'up' 'down' 'left' 'right' 'ok' 'back' 'tab' 'tabPrev'`. |
| `tap(x, y)` | Pointer in native px: tabs, rows, cells (tap twice = confirm), popup rows; outside the window = leave. |
| `update(dtMs)` | Every fixed step, also while busy. Input is acted on here, so purchases, `setGold`, `onEquip`, `onUse` and `onClose` all run inside `update()`. The only clock. |
| `draw(ctx, ox = 0, oy = 0)` | Native resolution, last in the draw pass, outside any shake translate. Never throws. |
| `close()` / `clear()` | Leave as the player would (`onClose` runs) / drop silently (restart; no `onClose`). |
| `count(id)`, `add(id, n)`, `remove(id, n)`, `setCount(id, n)`, `room(id)`, `canAdd(id, n)`, `slots()`, `free()` | The bag. `add` / `remove` return how many were really added / removed (never over capacity or max stack). |
| `reset(startItems)` | Empties the bag (and the limited stock) and adds these: new game. |
| `serialize()` / `restore(data)` | Plain JSON `{v: 1, bag: [[id, n], ...], stock: {shopId: {itemId: left}}}` for your save file (e.g. inside a save-slots `serialize()`); `restore` checks ids, stacks and capacity. |
| `item(id)`, `items()`, `setItems(t)`, `maxStack(id)`, `sellPrice(id)` | Table lookups. |
| `state()`, `rect()`, `lastResult()`, `lastDrawn()`, `setParams(p)`, `params()`, `measure(s)` | Screen state `{stage, tab, cursor, selected, popup, msg, gold, bag, capacity, bought, sold, used, equipped, window}`; window rect; last result; drawn rects; live params. |

`GameDNA_ShopInventory.drawIcon(ctx, kind, x, y, {color, accent, ink})` draws one 16×16 icon anywhere (your own item menu, a pickup).

**Result** (`onClose`) `{bought: [{id, n, cost}], sold: [{id, n, earned}], used: [{member, id}], equipped: [{member, id, slot, old}], spent, earned, gold, auto}`.

## Integration (15 lines)

```js
// <script src="shop-inventory.js"></script> before your game script (skin-api.js + pixel16.js before it if you have them)
const shop = GameDNA_ShopInventory.create({ bounds: { x: 0, y: HUD_H, w: SCREEN_W, h: SCREEN_H - HUD_H }, items: ITEMS,
  startItems: { herb: 2 }, autoplay: () => AUTOPLAY, uiRects: () => [hudRect],
  getGold: () => player.gold, setGold: n => { player.gold = n; },
  getParty: () => party.map(m => ({ id: m.id, name: m.name })), getEquipped: (id, slot) => byId(id).equip[slot] || null,
  onEquip: (id, item, slot) => { const m = byId(id); m.equip[slot] = item; recomputeStats(m); },
  onUse: (item, id) => applyItem(item, byId(id)) });      // return false / 'reason' if nothing happened
function talkToMerchant() { shop.open({ name: 'Village Shop', id: 'village', stock: STOCK, onClose: r => { /* what follows the talk */ } }); }
addEventListener('keydown', e => { if (shop.busy()) { if (shop.key(e.code, true)) e.preventDefault(); return; } /* existing keys */ });
addEventListener('keyup', e => shop.key(e.code, false));
function step() { if (shop.busy()) { shop.update(STEP_MS); return; } /* existing update */ shop.update(STEP_MS); }
function render() { /* world, effects, HUD */ shop.draw(ctx); }
function newGame() { shop.clear(); shop.reset({ herb: 2 }); /* existing code */ }
```

## Keep the game's other callers working

- **One bag.** If your game already counts items (`bag.potion`, `inventory[]`), don't keep two counts. Either make the old counter read and write through the module (`get potion() { return shop.count('potion'); }, set potion(v) { shop.setCount('potion', v); }`), or replace its reads with `count(id)` and its decrements with `remove(id, 1)`. The battle item command, the HUD, the autopilot and the save code then all see the same number.
- **Stats.** Equipment changes stats only through your `onEquip`. Recompute the stat from base + equipped items (don't add on every call), so equipping twice or loading a save gives the same number.
- **Gold.** Only `setGold` changes it while the shop is open; your rewards (enemies, chests) keep changing it as before.
- **Keys.** While busy, every arrow / Z / X / Q / E / Tab goes to the shop and the game's own input waits; the key that opened the shop must not also act in the game the same step. Pause and restart keys stay yours. If your game reads input in its step (a set of "pressed this step" flags), clear those flags while busy so a buffered press does not fire after the shop closes.
- **Autoplay** (`?auto=1`): pass the flag as `autoplay`; the autopilot then buys one deterministic thing and leaves by itself. If your autopilot never goes to the shop, nothing changes. If it does, its later fights use the new gear: the run must still reach the game's end.
- **Fast-forward** (`?t=&freeze=1`): `update()` inside the fixed step those loops call.
- **Save / load**: put `shop.serialize()` in your save data and call `shop.restore(data.bag)` on load (with gold and equipment from your own state).
- **Restart / new game**: `clear()` and `reset(startItems)`.

## Self-check without a browser

1. The module file is byte-identical to the one you were given and is loaded before the game script.
2. `open(` only in update logic (the merchant talk, a shop tile, a menu key), never in a draw function or a key handler; every path that reaches the merchant reaches it.
3. `update(` runs every fixed step, also while busy; while busy the world (timers, enemies, the frame counter your autopilot reads) does not advance.
4. Every place that read or wrote the old item counts now goes through the module (grep for the old counter's name).
5. Walk one purchase by hand: gold 50, a sword at 30 → `setGold(20)`, the bag gains the sword, "Equip now?" → `onEquip('hero', 'bronze-sword', 'weapon', 'stick')` → your attack goes from base + stick to base + sword; the stick is in the bag.
6. `draw(` is the last call of the draw pass; restart calls `clear()` and `reset(...)`.

## What it guarantees

- Gold is never set below 0 and never set without enough gold; the bag never holds more stacks than `capacity` or more than `stack` per stack; failed actions change nothing and show a message ("Not enough gold.", "Your bag is full.", "Sold out.", "Can't sell that.").
- Same calls, same frames: input is latched and acted on in `update()`; the autopilot runs on `update()` time; no timers, no wall time, no randomness.
- With UI rects, the window never covers them when there is room for a 120 px tall window; otherwise it is drawn over them with one console warning.
- `update` and `draw` catch their own errors and errors from your callbacks; bad `dt` is clamped; unknown item ids are skipped with one warning each.

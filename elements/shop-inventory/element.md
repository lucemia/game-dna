# G-01 Shop & inventory grid

## 1. What it is

The console RPG shop. The hero talks to a merchant (or steps on a shop tile, or the party rests between waves) and a framed window opens over the paused world: the shop's name and the party's gold at the top, three tabs (BUY, SELL, BAG), a list of goods with 16×16 icons and prices on the left, and the selected item's details on the right. For gear, every party member gets a row: green `ATK+3 ▲` where it is an upgrade over what that member wears, red `AGI-1 ▼` where it is worse, `Equipped` or `--` (cannot use it). Buying asks for an amount (with the total price), then, for gear, "Equip now?" with the member who gains most already selected. The bag is a grid of slots with stacks and a stack count, `n/20` in the corner, and a tooltip with the item's name under the selected cell. Too little gold flashes the gold red and says "Not enough gold."; a full bag flashes the grid and says "Your bag is full."; nothing changes. Items sell back at half price; key items cannot be sold. In the BAG tab, Use and Equip call the game's own callbacks.

The data is what the designer edits: an item table `{id: {name, kind, price, stats, stack, icon, desc}}` and a stock list per shop (ids, or `{id, qty, price}` for limited or discounted goods). The **bag** lives in the module (with `serialize()` / `restore()` for saves); **gold, equipment and stats stay in the game**, and the module changes them only through `setGold`, `onEquip` and `onUse`.

It is a UI addon: it never reads the keyboard by itself, never touches the game's RNG, and under autoplay it buys one deterministic thing and leaves.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `where` | a merchant the hero talks to | text, **required** | Where the shop opens, in the designer's words |
| `capacity` | 20 | 8–48 stacks | Bag size; shown as `n/20`, full = no new stack |
| `cols` | 5 | 4–6 | Grid columns (rows = capacity / cols, scrolls when taller than the window) |
| `stack` | 9 | 1–99 | Max per stack for consumables; equipment is 1, `item.stack` overrides |
| `sellRatio` | 0.5 | 0–1 | Sell price = floor(price × ratio); 0 = cannot sell anything |
| `qty` | on | on, off | Amount picker when more than one fits / is affordable |
| `compare` | on | on, off | Per-member rows with ▲ / ▼ for gear |
| `equipAfterBuy` | on | on, off | "Equip now?" after buying gear |
| `tooltip` | on | on, off | Name tooltip under the selected bag cell |
| `autoBuy` | best | best, cheapest, none, an item id | What the autopilot buys under `?auto=1` |
| `tint` | a | a (blue), n (slate), b (red) | Window colour |
| `dim` | 0.35 | 0–0.7 | Darkening of the field behind the window |

Module-only settings (README): `width`, `height` (0 = fit), `margin` 4, `openMs` 120, `autoplayMs` 260, `currency` 'G'. Per item: `stack`, `sell` (price or false), `slot`, `who`, `use`, `color`, `accent`. Per stock entry: `qty`, `price`.

## 3. Variants

- **Classic 16-bit RPG shop** (defaults): blue window, 20 slots in 5 columns, stacks of 9, half price back.
- **Small bag, survival**: 8 slots, stacks of 3, quarter price back, slate window.
- **Roguelite shop**: nothing sells back, one at a time, red window, darker dim; use `{id, qty: 1}` stock.
- **Big hoard**: 40 slots in 6 columns, stacks of 99.
- **Quick shop**: no amount picker, no "Equip now?" (equip from the BAG tab).

## 4. Interface

**Needs**
- The moment the shop opens, in update logic: `open({name, id, stock, onClose})` (or `openBag()` for an inventory screen).
- Gold: `getGold()` / `setGold(n)` (`n` is always an integer ≥ 0, already checked against the price).
- Party: `getParty()` → `[{id, name}]` (default one member `hero`), `getEquipped(id, slot)` → item id or null, optional `canEquip(id, item)`.
- Apply callbacks: `onEquip(id, itemId, slot, oldId)` sets the slot and recomputes stats from base + gear (return false to refuse); `onUse(itemId, id, item)` applies an effect (return false or a short reason when it does nothing; the item is kept).
- Input while `busy()`: `key(e.code, down)` (arrows, Z / Space / Enter, X / Escape, Q / E / Tab), or `press('up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'tab' | 'tabPrev')`, and `tap(x, y)` in native px.
- A fixed update step: `update(stepMs)` every step, also while the world is paused.
- The play field `{x, y, w, h}` and UI rects (no `id`) the window keeps clear (`uiRects()`).
- Optional: `autoplay` flag (function), `onSfx(name)`.

**Provides**
- `busy()`: true from `open()` until the window has closed.
- The bag: `count(id)`, `add`, `remove`, `setCount`, `room`, `canAdd`, `slots()`, `free()`, `reset(startItems)`; existing item counters can be bound to it with a getter/setter object.
- `serialize()` → `{v: 1, bag: [[id, n]], stock: {shopId: {itemId: left}}}` and `restore(data)` (ids, stacks and capacity checked).
- `onClose({bought, sold, used, equipped, spent, earned, gold, auto})`, synchronous inside `update()`; `onBuy`, `onSell`, `onItems({id, delta, count, reason})`.
- `GameDNA_ShopInventory.drawIcon(ctx, kind, x, y, {color, accent})`; `rect()` for other overlays.

**Delivery (v1).** `module/shop-inventory.js` (one global, `GameDNA_ShopInventory`; data format, API, 15-line integration, caller checklist and self-check in `module/README.md`). Draws through `GameDNA_Skin.resolve(options.skin)` when `skins/skin-api.js` is loaded: `frame` roles `window` (main window and popups), `plate` (active tab), `backing` (inactive tabs, list well, grid cells), `row` (selected list row), `tooltip`; `cursor` `hand` and `bracket`; `text` / `measure` on smooth skins; an optional `skin.icon(ctx, rect, kind, t, opts)` hook for icons (no skin defines it yet, so the procedural pixel icons are used everywhere). Without skin-api it falls back to its own copy of the pixel16 look. Verified on two unseen hosts (scratch copies, `checks/hosts/`): the top-down quest (a trader you talk to; the bronze sword raises the attack the battle uses) and the side-view battle (a trader between waves; tonics and ethers bought there are the ones the battle's own Item command uses); `?auto=1` ends the same as the original on both, 0 errors. The demo runs on the same module.

## 5. Screen rules (exact numbers)

Native canvas (256×224 in the demo), integer-scaled with nearest-neighbour on pixel skins.

- **Window**: width = min(field width − 2 × 4, 248); height = min(field height − 8, 200); centred horizontally, placed at the y nearest the field's centre where it touches no UI rect; if none fits, the height shrinks in 4-px steps down to 120 (below that: drawn over the UI with one warning). pixel16 frame: 4-band team gradient at 96 % opacity, ink edge with cut corners, bevel, gold rivets. Opens and closes over 120 ms from its centre line (quarter steps on pixel skins).
- **Header** (y + 6): shop name in `text.gold`, left; gold right-aligned with an 7×7 coin before it; the gold blinks `fx.hot` at 100 ms for 600 ms after "Not enough gold.".
- **Tabs** (y + 18, 11 px high, label width + 12, 2 px apart): active = `plate` with gold text, inactive = `backing` with dim text; with focus on the tab row the hand sits left of the active tab. Bag fill `n/cap` right-aligned on the same row on every tab, BUY included (`fx.crit` when full, blinking `fx.hot` after "Your bag is full.").
- **Left pane** (from y + 32 to y + h − 17; width max(cols × 18 + 4, min(118, 46 % of the window))): BUY = rows of 18 px (16×16 icon at +9, name at +27 truncated with ".", price right-aligned: gold if affordable, otherwise `fx.hot` (`#ffd0f0` on the red tint) with a 1-px strike-through; unaffordable or full rows dim with a grey icon; hand pointer on the selected row, `row` band); SELL / BAG = grid of 18-px cells (17 × 17 `backing` wells), icon at the cell's top-left, icon first, then the stack count bottom-right on a 9-px `ink` plate in every skin (88 % on smooth skins, light text; gold when the stack is full; no count for single non-stacking items such as keys); unavailable items use a light grey ramp that keeps the silhouette, selected cell in the `bracket` cursor. ▲ / ▼ scroll marks when the list or grid is longer than the pane.
- **Tooltip**: the selected cell's name (and `xN`), `tooltip` frame 13 px high on an opaque backing, in the free space under the grid (covers no cell); when the grid fills the pane, above the cell (below it for the top row), kept inside the window.
- **Right pane**: name (gold), info line (`text.label`: kind and how many you own, or `N left  own M` for limited stock / sell price / `xN/max`), stat line (`ATK+6 DEF-1`, labels in `text.label`), then for gear one row per member (10-px pitch): name (dim if they cannot equip), then per stat `ATK+3` with a 5×3 arrow: up `#5aec6a`, down `#ff5a4a`, `=` dim for no change, `Equipped` in gold, `--` when the member cannot equip it; then the description, word-wrapped, while it fits.
- **Footer** (y + h − 14): the last message for 2.6 s (`fx.heal` for done, `fx.hot` for refused), otherwise the key hints in dim text.
- **Popups** (opaque on pixel skins: a solid backing under the frame): amount picker 120 × 46 over the right pane, so the selected row stays visible (`Buy <name>`, `x N` with ▲ / ▼ centred on N, `N max`, `Total N G` in red if over the gold); action / member menus over the right pane, 11-px rows with the hand and a `row` band, gain `+3 ▲` per member in "Equip now?", whose cursor skips members who cannot equip the item.
- **Icons**: 19 procedural 16×16 kinds (sword, dagger, axe, spear, bow, staff, shield, helmet, armor, boots, ring, amulet, potion, herb, bread, key, gem, scroll, bomb), 4-step material ramps lit from the top left, automatic 1-px ink outline (`ink`), greyed when unavailable.
- **Draw order**: world → effects → HUD → shop (last, outside any shake translate).

## 6. Common mistakes (symptom → fix)

- **Two item counts disagree** (the battle's Item menu shows 4 tonics, the shop's bag 6) → keep one bag: bind the old counter to `count` / `setCount` with a getter/setter, or replace its reads with `count(id)`.
- **Attack keeps growing every time the sword is equipped** → `onEquip` adds the bonus instead of recomputing; compute stats as base + equipped items.
- **Buying happens twice / the shop reopens after closing** → the confirm key that opened the shop was also routed to it, or the game's buffered "pressed" flags fire after it closes; open in update logic and drop buffered presses while `busy()`.
- **The world keeps moving under the window** (enemies walk, timers run, the autopilot's frame counter advances) → gate the whole fixed step on `busy()` and return after `update()`.
- **`?auto=1` hangs on the shop** → pass the autoplay flag as `autoplay`, and call `update()` in the fixed step the freeze loop calls.
- **`?auto=1` ends differently** → expected only if the autopilot's later fights use the new gear; set `autoBuy: 'none'` when the end must stay identical, or keep the autopilot away from the shop.
- **The window covers the HUD / party panel** → return those rects from `uiRects()` (or exclude them from `bounds`).
- **Gold goes negative / items appear from nowhere** → only `setGold` and the bag methods may change them while the shop is open; don't apply prices yourself in `onBuy`.
- **Load restores gold and gear but not the bag** → add `shop.serialize()` to the save data and `shop.restore()` on load.

## 7. Acceptance moments (what to screenshot, what must be visible)

1. **Compare** (demo `?t=4600&freeze=1`): BUY tab, Bronze Sword selected; Arden `ATK+3 ▲`, Mira `--`, Tobin `ATK+3 ▲`; "Bought 3 Red Tonic." in green; gold 108.
2. **Equip now?** (`?t=6000`): the popup with Arden selected and `+3 ▲` gains; gold 48.
3. **Not enough gold** (`?t=8300`): Iron Sword (140, red price), message in red, gold unchanged.
4. **Sell** (`?t=11700`): SELL grid, "Sold Short Sword for 15G.", the old key greyed (cannot be sold).
5. **Bag** (`?t=12800`): BAG grid with stack counts, `4/20`, tooltip "Healing Herb x3", details on the right.
6. **Bag full** (`?t=18800`): "Your bag is full." with the herb row dim.
7. **Non-pixel skin** (`?skin=flat-demo&t=4600`): rounded white window, smooth text, the same layout.
8. **Unseen hosts**: the top-down trader's window under the HUD strip (Bronze Sword `ATK+2 ▲`); the battle trader above the party panel between waves (`ATK+3 ▲ AGI-1 ▼` for Rusk); `?auto=1` end state equal to the original.

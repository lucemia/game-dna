# GameDNA_ShapedInventory (G-11 shaped inventory packing, module v1.4.1)

`shaped-inventory.js` is one plain script (no imports, no dependencies, ASCII only) that defines one global,
`GameDNA_ShapedInventory`. Items take a polyomino shape in a grid bag. The player drags them (mouse, touch) or carries them with
keys, turns items a quarter turn (a real rotation), and sees where they would land: **green** free, **blue** stacks onto the same item, **amber**
swaps with the one item underneath, **red** blocked or off the grid (the blocking items glow red). It also has auto-sort, which
never loses an item, stack counts, a tooltip, a ground tray for loot and drops, and Use / Drop through your callbacks. It draws
its own window: a 16-bit pixel look on small canvases and an HD look on large ones. Items are drawn in code, or from your own
images.

Include it verbatim (`<script src>` before your game script, or pasted unchanged into its own `<script>`). Do not rewrite it.

## What lives where

- **The module owns the bag**: which items, how many, where, which way they face. `serialize()` / `restore()` save it.
- **Your game owns everything else**: what an item does when used (`onUse`), whether it may be dropped (`onDrop`), what
  happens to things left on the ground when the window closes (`onClose`), gold, stats, the world.
- If your game already counts items (`potions = 3`), either replace those counts with `inv.count(id)` / `inv.add` /
  `inv.remove`, or keep them and call `inv.sync({potion: potions, ...})` after every change. Never keep two counts that drift
  apart. `onChange` reports every bag change.

## API

`GameDNA_ShapedInventory.create(options)` returns `inv`.

| option | meaning |
|---|---|
| `items` | `{id: {name, shape, stack, kind, desc, rarity, use, useText, consume, drop, art, color, accent, image, crop, icon, material}}`. `shape`: a name (`'1x1' '1x2' '2x1' '1x3' '3x1' '1x4' '2x2' '2x3' '3x2' 'L' 'J' 'T' 'S' 'Z' 'plus' 'boot' 'axe' 'pick' 'corner'`), `'WxH'`, or rows such as `['XX', 'X.']`. `stack`: max per stack (default 1). `kind`: weapon, shield, armor, head, feet, tool, ammo, trinket, consumable, food, material, treasure, key, quest, misc (`consumable` and `food` are usable by default, `use: true / false` overrides). `rarity`: common, uncommon, rare, epic, quest (tints the item's cells and the tooltip name). **`key: true`** (or `essential: true`, or kind `quest` / `key`): an item the game cannot be finished without; it is never dropped, never left on the ground: `add()` / loot repack the bag, then move the least valuable other items (`value` or `price`) to the ground tray and open the bag; `close()` with a key item still on the ground makes room the same way or refuses (`close(true)` forces, as autoplay does). `art`: one of `GameDNA_ShapedInventory.ARTS` (sword, dagger, axe, bow, staff, shield, helmet, armor, boots, potion, herb, bread, key, gem, coins, scroll, ring, amulet, bomb, lantern, gel, relic, pick, root, arrows, box); default from the id or the kind. `image` + `crop [sx, sy, sw, sh]`: your own picture, contained in the shape's box. |
| `params` | `cols` 8, `rows` 5, `ground` `'on'` / `'off'`, `groundCols` 4, `groundRows` 5, `stack` 1 (default cap), `swap` `'on'` / `'off'`, `sortBy` `'size'` / `'type'`, `theme` `'auto'` / `'pixel'` / `'hd'` (auto = pixel when the view is at most 400 x 260), `cell` 0 (= fit), `maxCell` 42, `dim` 0.45, `minTextPx` 10, `ghost` `'on'`, `autoCloseMs` 900, `tabs` `'auto'` / `'on'` / `'off'`, `hoverMs` 350. |
| `mask` | Optional bag outline: rows of `#` (usable) and `.` (locked), e.g. `['.######.', '########', '.######.']`. It replaces `cols` / `rows`. |
| `view` | `{x, y, w, h}` (or a function) in your canvas's native px: the area the window centres in, usually the whole canvas. |
| `uiRects()` | Your HUD boxes; the window slides vertically to stay clear of them when it can. |
| `onUse(id, {n, g, item})` | Apply the effect. Return `true` (one is consumed unless `consume: false`), `false` or a short reason string to refuse. |
| `onDrop(id, n)` | Return `false` or a reason string to refuse (quest items); otherwise the item moves to the ground tray. |
| `onChange({id, delta, count, reason})` | After every bag count change (`take`, `drop`, `use`, `merge`, `sort`, `add`, `sync` ...). |
| `onClose({ground: [{id, n}], counts, auto})` | The window closed. `ground` is what is left on the ground (loot not taken plus drops): put it back in your world or discard it. |
| `onSfx(name)` | `pick place invalid rotate merge swap sort use drop open close move` (optional). |
| `autoplay` | `true` or a function: under your autopilot an open window takes the loot after 35 % of `autoCloseMs` and then closes (so `?auto=1` never hangs here). |
| `title`, `bagLabel`, `closeKeys` | Window title (default `'Bag'`), the bag grid's label (`'Carried'`), keys that close it (`['KeyI', 'i', 'I', 'Tab']`). |

| call | |
|---|---|
| `inv.open({loot, title, select})` / `inv.close()` / `inv.busy()` | Open in your update logic (never every frame). `loot = [{id, n}]` lies on the ground tray (or goes into the bag when the tray is off). `busy()` is true while open: pause your world. |
| `inv.update(stepMs)` | Every fixed step while open (also in a `?t=` fast-forward loop). |
| `inv.draw(ctx)` | Last in your render, outside any camera transform, in native px (keeps your `ctx` transform for HiDPI). |
| `inv.key(code, down, repeat)` | Route `keydown` / `keyup` while `busy()`; returns true when it used the key. `e.code` or `e.key`. Arrows / WASD move, Z / Enter / Space pick up or place, X / Esc put back or close, R turn, T sort, U use, G drop, F take all. |
| `inv.pointer(type, x, y, {id, button, pointerType})` | `type` = `down`, `move`, `up`, `cancel`, `wheel`; `x, y` in native px. Drag to move; a tap selects; right button, the wheel or a second finger turns the carried item; a click while carrying places. |
| `inv.add(id, n)` -> added, `inv.remove(id, n)` -> removed, `inv.count(id)`, `inv.canAdd(id, n)` | Pickups: `add` first tops up stacks, then places new stacks where they first fit (either orientation). |
| `inv.sync({id: n})` | Make the bag hold exactly these counts. |
| `inv.use(id)`, `inv.sort()`, `inv.takeAll()`, `inv.rotate()`, `inv.press(action)`, `inv.button(id)` | The same actions as the keys and buttons. |
| `inv.serialize()` / `inv.restore(data)` | `{v: 1, cols, rows, bag: [[id, n, x, y, o]]}`; restore re-places anything that no longer fits. |
| `inv.showGrid('bag' / 'ground')` | Phone layout: which grid is shown (scripts, tutorials). |
| `inv.state()`, `inv.entries()`, `inv.held()`, `inv.events()`, `inv.lastDrawn()`, `inv.layout()`, `inv.cellRect(g, x, y)`, `inv.rect()` | Read-only views for tests, judges and other overlays. |
| `GameDNA_ShapedInventory.renderArt(def, o, w, h, pixel)` | The item art as a canvas (for a HUD slot, a pickup sprite, a shop row). |

Turning is a real clockwise rotation of footprint and art (`orientCells`, `orientMatrix`, never a mirror). `orientsOf(shape)`
lists the orientations whose footprints differ; R cycles through those only (squares and plus shapes never turn, bars toggle).
**How an item is drawn (v1.2)**: (a) a panel that follows the footprint exactly, in a material by kind (wood for weapons and tools,
leather for armour, cloth for consumables and food, velvet for materials and treasure, gold for keys and quest items; `item.material`
overrides), with a bevel, stitching or grain and a small rarity gem; (b) the item's icon, upright and never stretched, contained in
the footprint's largest block of cells. Turning turns the panel only. Icon sources, in order: `item.image` + `crop` (your painted
icons), `item.icon(ctx, x, y, w, h)` (draw your game's own sprite into that box), else, on the pixel look, the art's own **footprint glyph**: one per art (31, all different), hand-placed in code at 16 px per cell and sized to the art's footprint (a 1x3 staff is 16x48, the L boot 32x32 with its corner empty), 1-px outline (`pixelOutline`, default `#1c1622`), 3-step ramps plus highlight from `item.color` / `item.accent`, drawn at integer scale and turned with the item; when the item's shape differs it uses a sized variant (vest, staff3, dagger, shortbow) or sits on the largest block (half size if needed); `item.pixelArt` picks a glyph by name (`GameDNA_ShapedInventory.PIXEL_ARTS`); on the HD look a bold silhouette glyph of `item.art`. A long icon in a long slot follows the slot.

**Phone layout** (automatic below 28 CSS px per cell, or `params.tabs: 'on'`): one grid at a time with tabs, the tooltip as a strip
under the grid. Pass the HUD boxes as `uiRects()`: a band of them along the top is kept clear when the cells still fit.
Pixel hosts: give the canvas `image-rendering: pixelated` (the bag inherits the host's upscaling).

## Integration example (generic)

```js
<script src="shaped-inventory.js"></script>
<script>
const inv = GameDNA_ShapedInventory.create({
  items: { herb: { name: 'Herb', shape: '1x1', stack: 5, kind: 'consumable', desc: 'Heals 10.' },
           spear: { name: 'Spear', shape: '1x4', kind: 'weapon', desc: 'Reach 2.' }, relic: { name: 'Relic', shape: 'plus', kind: 'quest', drop: false } },
  params: { cols: 8, rows: 5 }, view: { x: 0, y: 0, w: W, h: H }, uiRects: () => hudBoxes(),
  onUse: id => { if (id === 'herb') { player.hp = Math.min(player.maxHp, player.hp + 10); return true; } return false; },
  onDrop: id => id === 'relic' ? 'You need that' : true,
  onClose: s => s.ground.forEach(g => spawnPickup(g.id, g.n, player.x, player.y)),
  autoplay: () => AUTO
});
// pickups: if (inv.add(p.id, p.n) < p.n) inv.open({ loot: [{ id: p.id, n: p.n - left }] });
// input:   if (inv.busy()) { inv.key(e.code, e.type === 'keydown', e.repeat); e.preventDefault(); return; }  // before the game sees it
// step:    if (inv.busy()) { inv.update(STEP); return; }  ... if (pressed('I')) inv.open();
// render:  drawWorld(); drawHud(); inv.draw(ctx);
</script>
```

## Keep the game working

- **Window lists**: if the game keeps a list or stack of open windows (`windows`, `menus`, a modal flag), push a `bag` entry
  (e.g. `windows.push({ kind: 'bag' })`) when it opens and remove it in `onClose`, so the game's own checks, its autopilot and
  test tools see the bag as open; the game's own window drawing should skip that entry (the module draws the bag).

- **Pause while open**: gate the whole fixed step on `inv.busy()` (enemies, timers, the autopilot's own counters) and
  `return` after `inv.update(step)`. Open from update logic once, never from draw.
- **Input goes to the window first** while `busy()`; drop the game's buffered "pressed" flags so the key that opened the bag
  does not also act in the world. The key that opens the bag (`I`) also closes it.
- **Pointer coordinates** are native canvas px: `(clientX - rect.left) * nativeW / rect.width`.
- **`?auto=1` and `?t=`**: pass `autoplay`, call `update` inside the fast-forward loop, never open the bag from a timer.
  An autopilot that never opens the bag ends exactly as before.
- **One count**: after the bag exists, the game reads `inv.count(id)` (or keeps its own count and calls `sync` after every change).

## Self-check without a browser

1. The module file is byte-identical and loads before the game script; `inv` exists before the first `update` or `draw`.
2. Every item id the game can give has an entry in `items` with a shape; quest items have `drop: false`.
3. Every place that used to change an item count now goes through `add` / `remove` (or `sync`), and every reader uses `count`.
4. `update` runs in the fixed step (also the `?t=` loop); the step returns early while `busy()`; `draw` runs last.
5. Worked example: an 8 x 5 bag holds a 2x2 shield at (0, 0). `add('spear')` (1x4) tries (0, 0) upright (blocked), (0, 0)
   turned (blocked) ... and lands at (2, 0) upright (cells (2, 0) to (2, 3)).

## Measured

`draw()` with a full 8 x 5 bag and a tooltip, forced raster (`getImageData` after each draw), median of 3 x 30 draws:
12.7 ms at 1280 px dpr 2 and 11.8 ms at 390 px dpr 3 in headless Chromium (software raster) **under machine load 60-70**,
so these are upper bounds, not numbers to compare with a bar. The world is paused while the bag is open, so this is the
whole frame. Item art is rendered once per size and cached.

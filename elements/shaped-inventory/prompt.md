# Add a shaped inventory (grid bag with item shapes) to my game

Defaults (change any before pasting):
`{{cols}}` = 8 · `{{rows}}` = 5 · `{{ground}}` = on · `{{swap}}` = on · `{{sortBy}}` = size · `{{theme}}` = auto

---

You are given `shaped-inventory.js` (finished module, global `GameDNA_ShapedInventory`) and its `README.md` (read its API table). **Include the module verbatim** (`<script src>` before my game script, or pasted unchanged).

Player sees: a bag window over the paused game; items take their real shapes; drag or carry with keys, R turns; green / blue / amber / red show free / stack / swap / blocked; Sort, Use, Drop, a ground tray.

Add code; never delete or rename my functions, state, URL parameters, keys.

**Integration points** (find these places in my game):

1. **Items**: build `items` from my game's items (consumables, gear, keys, quest items, pickups): a `shape` (1x1 small, '1x3' long, '2x2' bulky, 'L' / 'T' / 'plus' odd), `stack` if countable, `kind`, short `desc`, its icon (`image` + `crop`, or `icon()` drawing my sprite), `key: true` for anything needed to finish the game (never dropped or left behind).
2. **Create one instance** before anything can call it (also before a `?t=` fast-forward loop):
`inv = GameDNA_ShapedInventory.create({ items, view, uiRects, onUse, onDrop, onClose, autoplay, params: { cols: {{cols}}, rows: {{rows}}, ground: '{{ground}}', swap: '{{swap}}', sortBy: '{{sortBy}}', theme: '{{theme}}' } })`
   - `view`: my canvas's native rect (coordinates are native canvas px); `uiRects()`: my HUD boxes; `autoplay`: my autopilot flag.
   - `onUse(id)`: apply my game's existing effect; return `true`, or `false` / a reason to refuse.
   - `onClose({ground})`: put what is left on the ground back into my world.
3. **One count**: everywhere my game gives, spends or reads items, use `inv.add` / `inv.remove` / `inv.count`, or keep my counters and call `inv.sync(counters)` after each change. If `inv.add` returns less than asked, open the bag with the rest as loot.
4. **Open**: on a key my game does not use (I), in update logic: `inv.open()`. While `inv.busy()`, run `inv.update(step)` and skip the rest of my step. If my game has a bag screen or a list of open windows, open this one there (register it in that list) and keep old callers working.
5. **Input** while `busy()`: keys go to `inv.key(e.code, down, e.repeat)` only; pointer down / move / up / cancel / wheel to `inv.pointer(type, x, y, { id: e.pointerId, button: e.button })`.
6. **Draw**: `inv.draw(ctx)` last, after the HUD, outside any camera transform.

**Keep every caller working**: `?auto=1` ends exactly as before; `?t=&freeze=1`, restart, pause, keys unchanged.

**Self-check without a browser**
- Module byte-identical, loaded first; `inv` exists before the first `update` / `draw`.
- Every item id my game gives has an `items` entry; no count kept in two places.
- `update` runs in the fixed step, also in the `?t=` loop. The step returns early while `busy()`.
- Worked example: 8 x 5 bag, 2x2 shield at (0, 0): `inv.add('spear')` (shape '1x4') lands at (2, 0) upright.

**Acceptance checks** (screenshots if you can)
1. I opens the bag over the paused game; shapes and stack counts show.
2. Dragging shows green over free cells, red over blocked; release on red sends it back.
3. R turns a long item; same item stacks; one other swaps.
4. Sort keeps every item; Use applies my effect; a key item refuses to drop, and with a full bag still goes in.
5. Loot that does not fit waits on the ground tray; closing hands it to my world.
6. `?auto=1` plays to the end, no console errors, same result.

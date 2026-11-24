# Add Shaped inventory packing to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `shaped-inventory.js` (one global, `GameDNA_ShapedInventory`), API reference `shaped-inventory.README.md`

README example names are placeholders.

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Shaped inventory packing [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Shaped inventory packing:** an item table: id -> name, shape, stack size, kind, description (optional own image); the moment the bag opens (a key, a loot chest, a full pickup) in update logic, and loot to show on the ground; keys while open (arrows / WASD, Z, X, R, T, U, G, F) and pointer events in native canvas px; a fixed update step while open; the game pauses its world while busy(); callbacks: onUse (apply the effect or refuse), onDrop (refuse quest items), onClose (what stays on the ground).

## Element 1: Shaped inventory packing (`shaped-inventory.js`, `GameDNA_ShapedInventory`)

A grid bag where every item takes its real shape (1x1 potions, 1x3 staves, 2x2 shields, L / T / plus pieces): drag with mouse or touch or carry with keys, R turns items a quarter turn (real rotation), a green / blue / amber / red footprint says fits / stacks / swaps / blocked, auto-sort that never loses an item, stack counts, a tooltip, a ground tray for loot and drops, Use and Drop through the game's callbacks. 16-bit pixel look on small canvases, HD look on large ones.

**Parameters chosen:** `cols` = 8, `rows` = 5, `ground` = on, `swap` = on, `sortBy` = size, `stack` = 1, `theme` = auto, `dim` = 0.45, `tabs` = auto.

**Where it goes** (by role; find these places in my game):

1. *The game's item table and every place that gives, spends or reads an item:* Build `items` from what the game has: `{id: {name, shape, stack, kind, desc, drop}}` (shape names: 1x1 1x2 2x1 1x3 1x4 2x2 2x3 L J T S Z plus boot axe pick corner, or rows like ['XX', 'X.']); quest items `drop: false`. Then route gives / spends / reads through `inv.add` / `inv.remove` / `inv.count`, or keep the game's counters and call `inv.sync(counters)` after each change and mirror `onChange` back into them.
2. *Once, before anything can call it (also before a ?t= fast-forward loop):* `inv = GameDNA_ShapedInventory.create({items, view, uiRects, onUse, onDrop, onClose, onChange, autoplay, params: {cols: 8, rows: 5, ground: 'on', swap: 'on', sortBy: 'size', theme: 'auto'}})`. `view` = native canvas rect the window centres in (set it below the HUD to keep the HUD visible); `onUse(id)` applies the game's effect and returns true / false / a reason; `onClose({ground})` puts what is left on the ground back into the world.
3. *Where the bag opens (a key the game does not use, I; or where the game already opened its own bag screen), in update logic:* `inv.open()` (with `{loot: [{id, n}]}` for a chest or a pickup that did not fit). If the game's autopilot drives an old bag screen, keep that screen for the autopilot and open this one for players.
4. *The fixed update step:* `if (inv.busy()) { inv.update(step); return; }` before the world moves (timers, enemies, autopilot counters stay paused).
5. *The key and pointer handlers:* While `inv.busy()`: `inv.key(e.code, down, e.repeat)` and nothing else sees the key; `inv.pointer(type, x, y, {id: e.pointerId, button: e.button})` for down / move / up / cancel / wheel in native px.
6. *The end of the render:* `inv.draw(ctx)` last, outside any camera transform.

**Common mistakes** (symptom -> fix):

- Two counts drift (HUD says 3 potions, bag 2) -> one record: inv.count, or sync after every game change and mirror onChange.
- The world moves under the bag / the boss keeps hitting -> the step is not gated on busy().
- The key that opened the bag also acts in the world, or the bag reopens -> open in update logic, clear the game's buffered presses on open; I / Esc close it.
- A judge or old code expects "Z uses the first item" -> in this bag Z picks up; Use is U (or inv.use(id)); X puts back, then closes.
- A drag lands one cell off -> pointer coordinates must be native canvas px, not CSS px.
- Loot vanishes -> handle onClose({ground}).
- Items look generic -> give each item its icon: `image` + `crop` from the game's icon sheet, or `icon(ctx, x, y, w, h)` that draws the game's own sprite for it; only items with neither get a glyph. Squares and plus shapes never turn by design.
- The window covers the HP bar -> pass the HUD boxes as uiRects(): a HUD band along the top is kept clear whenever the cells still fit (phones may use the whole view while paused).
- A quest item left on the ground (the game can never finish) -> mark it `key: true` in items; the bag then makes room for it and never drops or leaves it.
- The game checks its own window list (e.g. a windows array) -> push an entry for the bag when it opens and remove it in onClose.
- `?auto=1` ends differently -> the autopilot opened the new bag (or a pickup now refuses): keep the autopilot on its old path; pass autoplay so a bag opened under autoplay takes the loot and closes.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Shaped inventory packing] I opens the bag over the paused game; shapes and stack counts show; the HUD stays readable.
- [Shaped inventory packing] Dragging shows green over free cells, red over blocked ones (blockers glow), amber over one other item (swap: that item stays visible with a You get label), blue on the same item (stack); R turns.
- [Shaped inventory packing] Sort keeps every item; Use applies the game's effect and the game's own counter drops by one; a quest item refuses to drop; ?auto=1 ends exactly like before.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `shaped-inventory.js` sha256 `9bf1a30f38a83356...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Shaped inventory packing] Every item id the game can give has an items entry; no count is kept in two places that are not synced.
- [Shaped inventory packing] update runs in the fixed step (also the ?t= loop) and the step returns early while busy(); draw runs last.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

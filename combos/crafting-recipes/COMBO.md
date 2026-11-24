# Add crafting recipes to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `crafting-recipes.js` (one global, `GameDNA_CraftingRecipes`), API reference `crafting-recipes.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Crafting recipes [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Crafting recipes:** the game's item record: count(id), take(id, n), give(id, n) (or a plain {id: count} object); where ingredients are given; recipe data: output, inputs with counts, how each is learned (known, have:a,b, crafted:recipe, experiment, manual); the screen rect, the canvas (CSS size, so text stays >= 10 CSS px), avoid() = player / bench / NPC screen rects, uiRects() = HUD boxes; a fixed update step (also the ?t= fast-forward), a key or bench that opens it (update logic), keys and pointer while it is open.

## Element 1: Crafting recipes (`crafting-recipes.js`, `GameDNA_CraftingRecipes`)

A recipe book (learned recipes in colour, unknown ones as silhouettes with a hint) and a slot bench with have / need and a result preview; crafting takes the ingredients from the game's own inventory exactly once and gives the result exactly once after a short work bar; a mix put together from the pouch can discover a recipe; failed tries shake the bench with a reason and cost nothing; new recipes (held ingredients, a crafted parent, an experiment, the game's own unlock) get one toast. Crisp pixel look on small canvases, smooth HD look on large ones.

**Parameters chosen:** `slots` = 3, `craftMs` = 650, `theme` = forge, `toasts` = on, `keyHints` = on, `render` = auto.

**Where it goes** (by role; find these places in my game):

1. *The game's item record and every place that gives, spends or reads an item:* Point `inventory: {count, take, give}` at it (no inventory yet: add one object `bag = {id: count}`, filled where foes fall, chests open or things are picked up). New ingredients come from counters (every slime leaves gel), never from the game's random numbers. Materials the game's own menus or autopilot would misread (a heal check that looks at any bag entry) can live in a separate materials object behind the same three functions.
2. *Once, after the game state exists (also before a ?t= fast-forward loop):* `craft = GameDNA_CraftingRecipes.create({items, recipes, inventory, view, canvas, avoid, uiRects, onCraft, params: {slots: 3, craftMs: 650, theme: 'forge', toasts: 'on', title: 'Workbench'}})`. Recipes use each discovery kind: `known`, `have:a,b`, `crafted:<recipe>`, `experiment` (and `manual` + `craft.unlock(id)` for scrolls / teachers). `avoid()` = screen rects of the player FIRST (never cut by the window), then the bench and nearby NPCs (after the camera); `uiRects()` = HUD boxes and open dialogue boxes.
3. *Where the bench opens (interact at a bench / anvil / campfire, or a free key such as C), in update logic:* `craft.open('Workbench')`; clear the opening key. Never under the autopilot.
4. *The fixed update step:* `craft.update(stepMs)` every step (every scene); then `if (craft.busy()) return;` before the world, enemies and timers move.
5. *The key and pointer handlers:* While `craft.busy()`: `craft.key(e.code, true, e.repeat)` and nothing else sees the key (a capture-phase listener with stopImmediatePropagation works when the game's own listener is fixed); pointer in canvas units to `craft.pointer('down' | 'move' | 'up', x, y)`; an `up` outside the window (returns false) may close it.
6. *The end of the render:* `craft.draw(ctx)` last, after the HUD, outside any camera transform.
7. *New game / restart:* `craft.reset()` (also fine in newGame() before the first update: a recipe already announced is not toasted twice).
8. *onCraft:* Make the result matter: the game's own item lands in its bag (usable from its menus), gear sets the game's gear flags and stats, a stat or light changes. Never give or take crafting items here.

**Common mistakes** (symptom -> fix):

- Two counts (HUD vs bench) -> one record behind count / take / give.
- A result twice or ingredients twice -> nothing else gives or takes for a craft; onCraft only reacts.
- The world moves under the window -> the step is not gated on busy().
- The key that opened it also swings or talks -> open in update logic and clear the key; keys go only to craft.key while open.
- Text tiny on phones -> pass `canvas` (or `cssScale`); the window becomes a sheet only when nothing fits.
- The window hides the bench or an NPC -> add their screen rects to avoid().
- A judge or old code expects "Z closes menus" -> in this window Z crafts; X / Escape take back, then close.
- `?auto=1` ends differently -> the autopilot opened the bench or new drops used the game's random numbers.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Crafting recipes] C (or the bench) opens the window beside the player, never over the HUD; unknown recipes show as silhouettes with a hint.
- [Crafting recipes] Crafting takes each ingredient once and gives the result once; the game's HUD / bag agree; no count below 0.
- [Crafting recipes] Missing ingredients or a wrong mix shake the bench with a red reason and cost nothing; a new mix can discover a recipe (one toast).
- [Crafting recipes] ?auto=1 ends exactly as before; the same ?t= still twice is identical.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `crafting-recipes.js` sha256 `4950cea1a284f453...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Crafting recipes] Every recipe input / output id exists in items or the game's item table; every place that gives an ingredient writes the record count reads.
- [Crafting recipes] update runs in the fixed step (also the ?t= loop) and the step returns early while busy(); draw runs last; avoid / uiRects are screen px.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

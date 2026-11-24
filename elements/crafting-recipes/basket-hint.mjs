// Basket hint for G-06 crafting-recipes: how to wire the module into an UNKNOWN game, by role.
// A modal UI addon over the game's own inventory: it reads, takes and gives only through count / take / give, pauses the world
// while open (busy()), and tells the game what was made through onCraft. Different from G-01 shop-inventory (buying) and G-11
// shaped-inventory (packing): here items are combined by recipes that are learned and discovered.
export default {
  stage: 'ui',
  does: 'A recipe book (learned recipes in colour, unknown ones as silhouettes with a hint) and a slot bench with have / need and a result preview; crafting takes the ingredients from the game\'s own inventory exactly once and gives the result exactly once after a short work bar; a mix put together from the pouch can discover a recipe; failed tries shake the bench with a reason and cost nothing; new recipes (held ingredients, a crafted parent, an experiment, the game\'s own unlock) get one toast. Crisp pixel look on small canvases, smooth HD look on large ones.',
  params: {
    slots: 'create `params.slots`', craftMs: 'create `params.craftMs`', theme: 'create `params.theme`', toasts: 'create `params.toasts`', title: 'create `params.title`'
  },
  steps: [
    ['The game\'s item record and every place that gives, spends or reads an item',
      'Point `inventory: {count, take, give}` at it (no inventory yet: add one object `bag = {id: count}`, filled where foes fall, chests open or things are picked up). New ingredients come from counters (every slime leaves gel), never from the game\'s random numbers. Materials the game\'s own menus or autopilot would misread (a heal check that looks at any bag entry) can live in a separate materials object behind the same three functions.'],
    ['Once, after the game state exists (also before a ?t= fast-forward loop)',
      '`craft = GameDNA_CraftingRecipes.create({items, recipes, inventory, view, canvas, avoid, uiRects, onCraft, params: {slots: {{slots}}, craftMs: {{craftMs}}, theme: \'{{theme}}\', toasts: \'{{toasts}}\', title: \'{{title}}\'}})`. Recipes use each discovery kind: `known`, `have:a,b`, `crafted:<recipe>`, `experiment` (and `manual` + `craft.unlock(id)` for scrolls / teachers). `avoid()` = screen rects of the player FIRST (never cut by the window), then the bench and nearby NPCs (after the camera); `uiRects()` = HUD boxes and open dialogue boxes.'],
    ['Where the bench opens (interact at a bench / anvil / campfire, or a free key such as C), in update logic', '`craft.open(\'Workbench\')`; clear the opening key. Never under the autopilot.'],
    ['The fixed update step', '`craft.update(stepMs)` every step (every scene); then `if (craft.busy()) return;` before the world, enemies and timers move.'],
    ['The key and pointer handlers', 'While `craft.busy()`: `craft.key(e.code, true, e.repeat)` and nothing else sees the key (a capture-phase listener with stopImmediatePropagation works when the game\'s own listener is fixed); pointer in canvas units to `craft.pointer(\'down\' | \'move\' | \'up\', x, y)`; an `up` outside the window (returns false) may close it.'],
    ['The end of the render', '`craft.draw(ctx)` last, after the HUD, outside any camera transform.'],
    ['New game / restart', '`craft.reset()` (also fine in newGame() before the first update: a recipe already announced is not toasted twice).'],
    ['onCraft', 'Make the result matter: the game\'s own item lands in its bag (usable from its menus), gear sets the game\'s gear flags and stats, a stat or light changes. Never give or take crafting items here.']
  ],
  gotchas: [
    'Two counts (HUD vs bench) -> one record behind count / take / give.',
    'A result twice or ingredients twice -> nothing else gives or takes for a craft; onCraft only reacts.',
    'The world moves under the window -> the step is not gated on busy().',
    'The key that opened it also swings or talks -> open in update logic and clear the key; keys go only to craft.key while open.',
    'Text tiny on phones -> pass `canvas` (or `cssScale`); the window becomes a sheet only when nothing fits.',
    'The window hides the bench or an NPC -> add their screen rects to avoid().',
    'A judge or old code expects "Z closes menus" -> in this window Z crafts; X / Escape take back, then close.',
    '`?auto=1` ends differently -> the autopilot opened the bench or new drops used the game\'s random numbers.'
  ],
  checks: [
    'C (or the bench) opens the window beside the player, never over the HUD; unknown recipes show as silhouettes with a hint.',
    'Crafting takes each ingredient once and gives the result once; the game\'s HUD / bag agree; no count below 0.',
    'Missing ingredients or a wrong mix shake the bench with a red reason and cost nothing; a new mix can discover a recipe (one toast).',
    '?auto=1 ends exactly as before; the same ?t= still twice is identical.'
  ],
  selfcheck: [
    'Every recipe input / output id exists in items or the game\'s item table; every place that gives an ingredient writes the record count reads.',
    'update runs in the fixed step (also the ?t= loop) and the step returns early while busy(); draw runs last; avoid / uiRects are screen px.'
  ],
  offers: {
    'ui-rects': { title: 'crafting window and toast rects', text: '`craft.rects()` = the open window and the current toast; add them to other overlays\' UI rects so numbers and toasts do not land on them.' }
  },
  wants: {
    'ui-rects': { title: 'HUD rects', text: 'Pass every HUD box (and open dialogue boxes) as `uiRects()`, screen px; the window and its toasts keep clear of them.', check: 'The crafting window never covers the HUD.' }
  }
};

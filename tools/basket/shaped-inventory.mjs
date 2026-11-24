// Basket hint for G-11 shaped inventory: how to wire the module into an UNKNOWN game, by role.
// A modal UI addon: it owns the bag contents (count / add / remove / sync), pauses the world while open, and changes game state only
// through the game's own onUse / onDrop / onClose callbacks. Different from G-01 shop-inventory (a list / slot bag with a shop): here
// shape, turning and packing are the point. With G-01 in the basket, the shop's buys go through inv.add (or sync) so there is one count.
export default {
  stage: 'ui',
  does: 'A grid bag where every item takes its real shape (1x1 potions, 1x3 staves, 2x2 shields, L / T / plus pieces): drag with mouse or touch or carry with keys, R turns items a quarter turn (real rotation), a green / blue / amber / red footprint says fits / stacks / swaps / blocked, auto-sort that never loses an item, stack counts, a tooltip, a ground tray for loot and drops, Use and Drop through the game\'s callbacks. 16-bit pixel look on small canvases, HD look on large ones.',
  params: {
    cols: 'create `params.cols`', rows: 'create `params.rows`', ground: 'create `params.ground`', swap: 'create `params.swap`',
    sortBy: 'create `params.sortBy`', stack: 'create `params.stack`', theme: 'create `params.theme`', dim: 'create `params.dim`'
  },
  steps: [
    ['The game\'s item table and every place that gives, spends or reads an item',
      'Build `items` from what the game has: `{id: {name, shape, stack, kind, desc, drop}}` (shape names: 1x1 1x2 2x1 1x3 1x4 2x2 2x3 L J T S Z plus boot axe pick corner, or rows like [\'XX\', \'X.\']); quest items `drop: false`. Then route gives / spends / reads through `inv.add` / `inv.remove` / `inv.count`, or keep the game\'s counters and call `inv.sync(counters)` after each change and mirror `onChange` back into them.'],
    ['Once, before anything can call it (also before a ?t= fast-forward loop)',
      '`inv = GameDNA_ShapedInventory.create({items, view, uiRects, onUse, onDrop, onClose, onChange, autoplay, params: {cols: {{cols}}, rows: {{rows}}, ground: \'{{ground}}\', swap: \'{{swap}}\', sortBy: \'{{sortBy}}\', theme: \'{{theme}}\'}})`. `view` = native canvas rect the window centres in (set it below the HUD to keep the HUD visible); `onUse(id)` applies the game\'s effect and returns true / false / a reason; `onClose({ground})` puts what is left on the ground back into the world.'],
    ['Where the bag opens (a key the game does not use, I; or where the game already opened its own bag screen), in update logic',
      '`inv.open()` (with `{loot: [{id, n}]}` for a chest or a pickup that did not fit). If the game\'s autopilot drives an old bag screen, keep that screen for the autopilot and open this one for players.'],
    ['The fixed update step', '`if (inv.busy()) { inv.update(step); return; }` before the world moves (timers, enemies, autopilot counters stay paused).'],
    ['The key and pointer handlers', 'While `inv.busy()`: `inv.key(e.code, down, e.repeat)` and nothing else sees the key; `inv.pointer(type, x, y, {id: e.pointerId, button: e.button})` for down / move / up / cancel / wheel in native px.'],
    ['The end of the render', '`inv.draw(ctx)` last, outside any camera transform.']
  ],
  gotchas: [
    'Two counts drift (HUD says 3 potions, bag 2) -> one record: inv.count, or sync after every game change and mirror onChange.',
    'The world moves under the bag / the boss keeps hitting -> the step is not gated on busy().',
    'The key that opened the bag also acts in the world, or the bag reopens -> open in update logic, clear the game\'s buffered presses on open; I / Esc close it.',
    'A judge or old code expects "Z uses the first item" -> in this bag Z picks up; Use is U (or inv.use(id)); X puts back, then closes.',
    'A drag lands one cell off -> pointer coordinates must be native canvas px, not CSS px.',
    'Loot vanishes -> handle onClose({ground}).',
    'Items look generic -> give each item its icon: `image` + `crop` from the game\'s icon sheet, or `icon(ctx, x, y, w, h)` that draws the game\'s own sprite for it; only items with neither get a glyph. Squares and plus shapes never turn by design.',
    'The window covers the HP bar -> pass the HUD boxes as uiRects(): a HUD band along the top is kept clear whenever the cells still fit (phones may use the whole view while paused).',
    'A quest item left on the ground (the game can never finish) -> mark it `key: true` in items; the bag then makes room for it and never drops or leaves it.',
    'The game checks its own window list (e.g. a windows array) -> push an entry for the bag when it opens and remove it in onClose.',
    '`?auto=1` ends differently -> the autopilot opened the new bag (or a pickup now refuses): keep the autopilot on its old path; pass autoplay so a bag opened under autoplay takes the loot and closes.'
  ],
  checks: [
    'I opens the bag over the paused game; shapes and stack counts show; the HUD stays readable.',
    'Dragging shows green over free cells, red over blocked ones (blockers glow), amber over one other item (swap: that item stays visible with a You get label), blue on the same item (stack); R turns.',
    'Sort keeps every item; Use applies the game\'s effect and the game\'s own counter drops by one; a quest item refuses to drop; ?auto=1 ends exactly like before.'
  ],
  selfcheck: [
    'Every item id the game can give has an items entry; no count is kept in two places that are not synced.',
    'update runs in the fixed step (also the ?t= loop) and the step returns early while busy(); draw runs last.'
  ],
  offers: {
    'ui-rects': { title: 'bag window rect', text: '`inv.rect()` is the open window (or null); add it to other overlays\' UI rects so toasts and numbers do not land on it.' }
  },
  wants: {
    'ui-rects': { title: 'HUD rects', text: 'Pass the HUD boxes as `uiRects()` and set `view` below a top HUD bar so the window keeps clear of it.', check: 'The bag window never covers the HUD.' }
  }
};

// Basket hint for C-02 turn-order-bar: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'ui',
  does: 'A strip of small portraits along one screen edge shows who acts next: the unit acting now first in a bigger gold frame, hopping; the next units in blue (player) or red (enemy) frames, `+N` for the rest. When a turn ends the strip slides forward; units that join pop in, units that die crumble out, units that change place hop over the others; the unit under the cursor or being targeted blinks; optional wait numbers. Portraits are cropped from the game\'s own sprites. The game supplies the order it already has; the strip never computes turn rules and never covers the HUD.',
  params: {
    layout: 'create `layout` (top / bottom = strip, left / right = column)', align: 'create `params.align`', slots: 'create `params.slots`',
    size: 'create `params.size` (px)', gap: 'create `params.gap` (px)', slide: 'create `params.slide` (ms)', pop: 'create `params.pop` (ms)',
    bounce: 'create `params.bounce` (px)', waits: 'create `params.waits` (numbers show only when the game passes `waits`)', label: 'create `params.label`',
    fade: 'create `params.fade`', portrait: 'create `params.portrait`'
  },
  steps: [
    ['Once, at boot, after the canvas exists (before the first update and before any fast-forward for screenshots)',
      '`tob = GameDNA_TurnOrder.create({view: {x: 0, y: 0, w: <native width>, h: <native height>}, layout: \'{{layout}}\', teamOf, drawPortrait, getObstacles, params: {align: \'{{align}}\', slots: {{slots}}, size: {{size}}, gap: {{gap}}, slide: {{slide}}, pop: {{pop}}, bounce: {{bounce}}, waits: \'{{waits}}\', label: \'{{label}}\', fade: \'{{fade}}\', portrait: \'{{portrait}}\'}})`. `teamOf(id)` returns the unit\'s side (`\'player\'`, `\'enemy\'`, `\'blue\'`, `\'red\'`... work as is). `drawPortrait = GameDNA_TurnOrder.spritePortrait(id => <that unit\'s sprite image or canvas>)`, returning `{img, flip: true}` for units the game draws mirrored. `getObstacles()` returns, in SCREEN pixels, each HUD panel / menu / caption `{x, y, w, h}` (no id: never covered) and each living sprite `{x, y, w, h, id}` (the strip fades over them); it may use state that exists only later and always returns an array.'],
    ['Where the game keeps its turn order (speed queue, initiative list, charge-time forecast, or, in a phase game, the units of the side in play that have not acted)',
      'Once per fixed step, after the turn logic: `tob.setOrder(ids, {current, dead, waits})`. `ids` = a COPY (`.filter`/`.map`) of that order as unit ids, next to act first, living units only. `current` = the unit acting now (`null` between turns; it is put first if the game already removed it from its queue). `dead` = ids that died this step (compare living ids with the previous step). If the game only knows the rest of this round, append the next round from the game\'s own order function after `GameDNA_TurnOrder.BREAK`. Pass the game\'s wait or charge numbers as `waits` if it has them. Never shift, sort or refill the game\'s arrays for this.'],
    ['Where the game knows the unit under its cursor or being targeted', '`tob.highlight(id)` every step (`null` when none; an array for "all").'],
    ['Your fixed update step (every scene: title, battle, pauses)', '`tob.update(1000 / 60)` once per step. On the title or outside battle: `tob.setOrder([])`.'],
    ['Your draw pass for the battle / map scene', '`tob.draw(ctx)` after the scene and the HUD, outside any screen-shake translate. Skip it on the title.'],
    ['Where a battle, wave or game (re)starts', '`tob.clear()`.'],
    ['Optional: pointer move / tap handlers', '`tob.slotAt(x, y)` (native px) gives the unit id under a portrait.']
  ],
  gotchas: [
    'The strip shows a different order from the one played -> build `ids` from the queue the turn code really uses, not a fresh sort of all units.',
    'Turns get skipped after the integration -> the game\'s own queue was shifted or sorted to feed the strip; pass a copy.',
    'The acting unit is missing from the strip -> the game removed it from its queue when its turn began; pass it as `current`.',
    'Everything pops in again every frame -> ids change identity (new objects, numbers vs strings); pass stable ids.',
    'Dead units shrink like units that acted -> pass them in `dead` on the step they die.',
    'The strip covers the HUD or menus -> return those rects without `id` from `getObstacles()`.',
    'Empty or half-open strip in `?t=&freeze=1` shots -> `setOrder` / `update` are called from the render instead of the fixed step.'
  ],
  checks: [
    'The strip sits on the {{layout}} edge, covers no HUD panel, and shows portraits made from the game\'s sprites (blue frames for the player\'s side, red for enemies), `+N` for the rest.',
    'The acting unit is first in a gold frame and hops; when its turn ends the strip slides forward; a unit that dies crumbles out; the next unit shown is the one that acts next.',
    'Autoplay (`?auto=1` or the game\'s own) reaches the same end as before; `?t=...&freeze=1` shots show a settled strip.'
  ],
  selfcheck: [
    'The ids are a copy of the game\'s order; no game array is mutated. Trace one turn (actor first and `current` -> turn ends -> next `setOrder` drops it -> new actor) and one death (id leaves, appears in `dead`).',
    '`tob.update` once per step on every scene; `tob.draw` once per frame on the battle render path, after the HUD.'
  ],
  offers: {
    'ui-rects': { title: 'turn-order strip', text: '`tob.rects()` returns the strip\'s rect `{x, y, w, h}` (empty when hidden); add it to the other element\'s obstacles / UI rects so pop-ups and windows never land on it.' }
  },
  wants: {
    'ui-rects': { title: 'UI rects', text: 'Add them (no `id`) to `getObstacles()` so the strip steps past them.' },
    'anchor': { title: 'unit positions', text: 'Use the same sprite rects (with ids) in `getObstacles()`, so the strip fades where a unit stands under it.' },
    'battle-start': { title: 'reset', text: 'Call `tob.clear()` there, so no portrait of the old battle slides over the new one.' }
  }
};

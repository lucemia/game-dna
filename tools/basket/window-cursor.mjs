// Basket hint for C-01 window-cursor: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'ui',
  does: 'Every plain menu and text box of the game is drawn by the module instead: bevelled gradient windows that grow from their centre when they open and shrink when they close, a pointing glove beside the selected row that bobs and slides between rows, grey disabled rows, gold right-aligned notes, a target pointer beside the unit being picked, word-wrapped messages with a "more" arrow, and auto-placed boxes that stay on screen and off sprites and HUD. The game keeps all its menu logic and only reports what is open and selected.',
  params: {
    open: 'create `params.open` (frames, 0 = instant)', slide: 'create `params.slide` (ms)', bob: 'create `params.bob` (ms per bob step)',
    rowH: 'create `params.rowH` (px; a menu whose taps use old row maths can pass its own `rowH`)', type: 'create `params.type` (typewriter chars/s, 0 = off)',
    margin: 'create `params.margin` (px)', tint: 'create `params.tint`', pointer: 'create `params.pointer`', band: 'create `params.band` (selected-row highlight; auto follows the skin)'
  },
  steps: [
    ['Once, at boot, after the canvas exists (before the first update and before any fast-forward for screenshots)',
      '`wc = GameDNA_WindowCursor.create({view: {x: 0, y: 0, w: <native width>, h: <native height>}, getObstacles, params: {open: {{open}}, slide: {{slide}}, bob: {{bob}}, rowH: {{rowH}}, type: {{type}}, margin: {{margin}}, tint: \'{{tint}}\', pointer: \'{{pointer}}\'}})`. `getObstacles()` returns, in SCREEN pixels after the camera offset, each visible sprite `{x, y, w, h, id}` and each HUD panel or banner `{x, y, w, h}` that a text box must not cover; it may use state that exists only later (it is first called by `update`), and always returns an array.'],
    ['Every place the game draws a menu (commands, spells, items, shop, yes/no, title options)',
      'Replace the box, text and arrow drawing with `wc.menu(<id>, {x, y, w, h, items, selected, active, title})`: the OLD box\'s numeric `x, y, w, h` (numeric `x` and `y` keep it exactly there), `items` = labels or `{label, note, disabled}` built from the game\'s own list (`disabled` where the game refuses that choice; `note` = cost or count), `selected` = the game\'s cursor index. A parent menu stays visible with `active: false` while a sub-menu or target is chosen. Keep the game\'s menu state and input code unchanged.'],
    ['Every place the game draws a text box (dialogue, battle log, captions, end-of-game panels)',
      '`wc.message(text, {id, more})`. Without `x`/`y` it sits at the bottom and moves to the top when an obstacle is there; or keep the old box with numeric `x, y, w, h`. Captions: `{id, fit: true, x: \'center\', y: <old y>}`. Several lines: `\\n`. `more: true` when the game has another page.'],
    ['Where the game picks a unit (target choice)', '`wc.setCursor({id})` (an id from `getObstacles()`) or the unit\'s drawn rect, an array for "all"; `wc.setCursor(null)` when not picking. Remove the old target arrow.'],
    ['Closing', 'Either call `menu`/`message` every frame while the window is visible (it closes by itself 3 steps after the calls stop), or call `wc.close(id)` where it goes away. Where the scene changes (battle -> map, game over, restart): `wc.clear()`.'],
    ['Your fixed update step (every scene: title, map, battle, pauses)', '`wc.update(1000 / 60)` once per step.'],
    ['Your draw pass, on EVERY render path (including early returns for title or battle scenes)', '`wc.draw(ctx)` last, after the HUD it replaces, outside any screen-shake translate.'],
    ['Tap / click handlers that hit-test menu rows', 'Use `wc.itemAt(<id>, x, y)` (native px) instead of the old row maths, or pass that menu the old row pitch as `rowH`.']
  ],
  gotchas: [
    'A menu opens somewhere else than the old box -> it got only `x` or only `y` and was auto-placed off the HUD; pass both numbers.',
    'Menus or boxes never go away -> opened once, never closed; call `close(id)` or call `menu()` every visible frame.',
    'A battle message shrinks over the map after the fight -> `wc.clear()` where the scene changes.',
    'Windows stay as small boxes -> `update` is not called on that scene; call it every step everywhere.',
    'A screen with no windows at all -> `draw` is missing on a render path that returns early.',
    'Taps choose the wrong row -> the tap code still computes rows from the old layout; use `itemAt`.',
    'Dialogue covers the hero -> sprites missing from `getObstacles()`, or given in world instead of screen pixels.',
    'Two cursors on one row -> the old arrow drawing is still there.'
  ],
  checks: [
    'Menus grow from their centre as bevelled windows in the old menu boxes; the glove bobs beside the selected row and slides when it moves; disabled rows are grey.',
    'Target choice shows the glove beside the chosen unit, sliding between units; it disappears when the choice ends.',
    'Messages wrap, never cover a sprite or the HUD, and close when the game moves on (and on scene changes).',
    'Autoplay (`?auto=1` or the game\'s own) reaches the same end as before; `?t=...&freeze=1` shots show settled windows; taps on rows still work.'
  ],
  selfcheck: [
    'List every old box / menu / arrow draw call and what replaced it; none still draws.',
    'Every window id has a `close` / `clear`, or is called every visible frame. Trace one menu (open -> move -> confirm -> closes) and one dialogue (line -> next -> end).',
    '`wc.update` once per step on every scene; `wc.draw` on every render path, last.'
  ],
  offers: {
    'ui-rects': { title: 'windows', text: '`wc.rects()` lists every open window `{x, y, w, h, id}`; add them to the other element\'s obstacles / UI rects so pop-ups never land on a menu.' }
  },
  wants: {
    'ui-rects': { title: 'UI rects', text: 'Add them (no `id`) to `getObstacles()` so auto-placed text boxes avoid them.' },
    'anchor': { title: 'unit positions', text: 'Use the same sprite rects (with ids) in `getObstacles()`, so `wc.setCursor({id})` and auto-placed boxes follow the units.' },
    'battle-start': { title: 'reset', text: 'Call `wc.clear()` there, so no old menu or message survives into the new battle or game.' }
  }
};

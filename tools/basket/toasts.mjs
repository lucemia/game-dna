// Basket hint for C-14 toasts (toasts & unlock pop-ups): how to wire the module into an UNKNOWN game, by role.
// Non-blocking UI layer: it never pauses the game or reads input, so it combines with any system and any other UI element;
// give it the other elements' windows, banners and plates through uiRects().
export default {
  stage: 'ui',
  does: 'Achievement, quest-update and item-get notices slide in from a screen edge, stack and glide, leave on a timer line, merge duplicates into one card with a punching ×N badge (quest progress updates one card in place), and queue behind a "+N more" chip. They keep a safe-area margin, step around every HUD rect the game reports, hide while a window covers their slot and come back after, and never pause the game. Glass cards on HD canvases, crisp pixel cards with built-in bitmap fonts on native pixel canvases.',
  params: {
    edge: 'create `params.edge`', max: 'create `params.max`', hold: 'create `params.hold` (ms)', merge: 'create `params.merge`', enter: 'create `params.enter`',
    theme: 'create `params.theme`', progress: 'create `params.progress`', render: 'create `params.render`'
  },
  steps: [
    ['Once at startup, after the canvas size is known (before anything can push)',
      '`toasts = GameDNA_Toasts.create({bounds: {x: 0, y: 0, w: SCREEN_W, h: SCREEN_H}, uiRects, params: {edge: \'{{edge}}\', max: {{max}}, hold: {{hold}}, merge: \'{{merge}}\', enter: \'{{enter}}\', theme: \'{{theme}}\', progress: \'{{progress}}\', render: \'{{render}}\'}})`. `bounds` = the screen in logical canvas px (not the backing store). `uiRects()` returns `{x, y, w, h}` for every HUD panel, minimap, objective or message line, caption, banner and open window drawn right now, using the draw code\'s numbers. If units stand under the stack\'s corner (a battle party, a tactics grid), also return their formation box so cards never hide them.'],
    ['The code that DECIDES each event a player cares about (pickup, purchase, loot, quest step, unlock, level-up, first kill, boss beaten, low HP). Pick 4-8; never a per-frame condition',
      '`toasts.push(kind, title, {text, key, count, rarity, icon})`: kinds `achievement | quest | item | unlock | level | info | warning`. Item icons `leaf | potion | pouch | sword | coin | gem | heart | star`; items merge to ×N by title; amounts with `\'+{n} Coins\'` and `{key: \'coins\', count: n}`; quest progress only when the objective count changes, one fixed `key` per quest, `text: \'done / need\'`, `count: 0`. If the game draws a one-line notice for that event ("Bought X"), stop drawing only that line (keep its variables); phase banners, titles, captions and result screens ("WAVE CLEARED", "VICTORY") stay.'],
    ['Your fixed update step, at the top, for every scene (title, play, menus open, end screens)', '`toasts.update(stepMs)`.'],
    ['Your draw pass, last: after world, effects, HUD and windows, in screen coordinates outside any camera translate', '`toasts.draw(ctx)` once per frame, every scene.'],
    ['New game / restart', '`toasts.clear(true)`.']
  ],
  gotchas: [
    'Cards over the HUD or a window -> that rect is missing from `uiRects()` (or given in backing-store px).',
    'Cards never show, or only after a menu closes -> `update()` is only called in the play scene; call it every step.',
    'A badge counting up every frame, or a wall of identical cards -> `push` sits in a per-frame check.',
    'Two messages per event -> the game\'s own one-line notice is still drawn (only that line goes; banners and result titles stay).',
    'Cards hide the party on a small battle screen -> return the party formation box from `uiRects()`, or pick an edge over empty background.',
    'The quest card reappears on every kill -> push quest progress only when its count changes.',
    'Quest progress shows ×2, ×3 -> push it with `count: 0` and a fixed `key`.',
    'Blurry text on a native pixel game drawn into a larger backing store -> `render: \'crisp\'`.',
    '`?auto=1` ends differently -> a push changed game state or consumed the game\'s random numbers.'
  ],
  checks: [
    'An event shows one card sliding in from the chosen edge (label, title, icon); it leaves by itself.',
    'The same item three times shows one card with ×3; quest progress updates one card.',
    'A burst of five events shows `max` cards plus "+N more"; the rest follow. No card covers HUD, windows or another card; the game never pauses for a toast.'
  ],
  selfcheck: [
    'List each `push` with the event behind it; none runs every frame while a condition holds.',
    '`uiRects()` covers every HUD element and window for every scene, in logical px; `update` runs every step, `draw` last.'
  ],
  wants: {
    'ui-rects': { title: 'UI rects', text: 'Return the other elements\' windows, banners, plates and HUD from `uiRects()`; toasts step around them and hide while a window covers their slot.', check: 'No toast covers the other element\'s windows, banners or HUD.' },
    'events': { title: 'events', text: 'Push a toast where the other element awards something (level-up results, shop purchase, upgrade picked, save done).', check: 'Each award shows one toast; repeats merge.' },
    'battle-start': { title: 'reset', text: 'Call `toasts.clear(true)` only on a new game, not per battle or wave.' }
  }
};

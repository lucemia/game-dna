// Basket hint for C-15 keyword-tooltips: how to wire the module into an UNKNOWN game, by role.
// A UI layer that never changes game state or pauses: rich text with keywords that open tooltips on hover, touch and Tab focus,
// nested tooltips, pinning, placement inside the view and off the word. It combines with any system and any other addon.
export default {
  stage: 'ui',
  does: 'Rules text (descriptions, info lines, log lines) becomes rich text whose keywords (statuses, stats, terrain, rules) are coloured and underlined; a tooltip with icon, title, kind and text opens on mouse hover, touch long-press or tap and keyboard focus (Tab). Keywords inside a tooltip open nested tooltips; click, tap or the pin key pins one. Tooltips stay inside the screen, never cover their word, avoid the HUD and the units when they can, and fade, glide or crossfade (never jump). Words or icons the game draws itself (HP labels, status badges) become keywords too. The game\'s own font can draw the words.',
  params: {
    theme: 'create `params.theme`', delay: 'create `params.delay`', depth: 'create `params.depth`',
    pinKey: 'create `params.pinKey` (a key the game does not use)', hints: 'create `params.hints`'
  },
  steps: [
    ['Once, after the canvas exists (before the first step)',
      '`tips = GameDNA_KeywordTooltips.create({canvas, view: {w: <native width>, h: <native height>}, keywords: {<id>: {title, kind, icon, color, text: \'... [other-id] ...\'}}, uiRects: () => [<HUD boxes>], avoid: () => [<living unit boxes>], params: {theme: \'{{theme}}\', delay: {{delay}}, depth: {{depth}}, pinKey: \'{{pinKey}}\', hints: \'{{hints}}\'}})`. Write 6-12 keywords from the game\'s real rules.'],
    ['The fixed step (the live loop AND the ?t= fast-forward)', '`tips.update(STEP_MS)` first.'],
    ['Where the player reads rules: a description line for the highlighted command / card / item, an info line for the tile or unit under the cursor',
      '`tips.text(ctx, \'<id>\', \'Deals 6. Applies 2 [burn].\', x, y, {w, font: {pixel: true, h, lineH, space, measure: s => <width>, draw: (c, s, x, y, col) => <the game\'s text call>}})` in the render; make a strip for it, never inside clickable menu labels.'],
    ['Where the game draws a stat label or a status icon', '`tips.mark(\'<id>\', \'<keyword>\', {x, y, w, h})` every frame it is visible.'],
    ['Every render path, last (title, play, results, early returns)', '`tips.draw(ctx)`.']
  ],
  gotchas: [
    'Nothing opens on hover -> update() is not in the step (stats().noUpdate) or the text is drawn by the game instead of text() / mark().',
    'Menu rows stop answering taps -> a [keyword] sits inside a clickable label: the module takes presses on keywords.',
    'Escape / T / Tab do something odd in the game -> those keys are used: set focusKey / pinKey to free keys.',
    'Plain text where a keyword was meant -> the [id] is not defined (stats().unknown).',
    'Tooltips land on characters -> avoid() is missing or returns stale boxes.'
  ],
  checks: [
    'Hover a keyword: tooltip after the delay, on screen, not over the word; hover a keyword inside it: nested tooltip.',
    'Click a keyword: pinned, stays when the pointer leaves; click outside closes. Tab / T / Escape walk the keywords.',
    '`?auto=1` ends exactly as before; `?t=&freeze=1` stills render; no page errors.'
  ],
  selfcheck: [
    'update() in the shared step; draw() last in every render path including early returns.',
    'Every [id] defined; texts use the game\'s real numbers; no host function removed or renamed.'
  ],
  offers: {
    'ui-rects': { title: 'tooltip rects', text: '`tips.lastDrawn()` lists the open tooltip panels (kind \'panel\'); add them to the other element\'s UI rects so toasts or numbers never land on an open tooltip.' }
  },
  wants: {
    'ui-rects': { title: 'HUD rects', text: 'Add the other element\'s on-screen boxes (minimap, toasts, banners, trackers) to `uiRects()` so tooltips prefer to stay off them.', check: 'An open tooltip does not cover the other element when there is room elsewhere.' }
  }
};

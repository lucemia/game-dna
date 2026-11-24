// Basket hint for C-07 title-menu: how to wire the module into an UNKNOWN game, by role.
// A UI layer around play: it reuses the game's own title scene and start code, consumes input only while a menu is open, and turns
// itself off under ?auto=1 / ?t= / freeze=1, so it combines with any system and any other addon.
export default {
  stage: 'ui',
  does: 'A title screen on the game\'s own backdrop (its name as a bold pixel logo with a glint, a tagline, PRESS START), a title menu (CONTINUE, NEW GAME, OPTIONS, QUIT), persistent options (three volumes, text speed, screen shake, flashing, reduce motion, large text, high contrast, a controls page), a wipe into play and a pause menu (RESUME, OPTIONS, RESTART, QUIT TO TITLE) with yes / no confirms. Keys, mouse and touch; drawn on its own overlay canvas at a readable size on phones; off under the game\'s test flags.',
  params: {
    transition: 'create `params.transition`', transMs: 'create `params.transMs`', panel: 'create `colors.panel`', quit: 'create `params.quit`',
    pauseButton: 'create `params.pauseButton`', hints: 'create `params.hints`', pauseKeys: 'create `pauseKeys` (an array of e.key values the game does not use in play)'
  },
  steps: [
    ['Once, after the canvas and the game state exist',
      '`menu = GameDNA_TitleMenu.create({canvas, title: \'<game name>\', tagline, colors: {logo: [<light>, <warm>], panel: \'{{panel}}\', accent}, isTitle: () => <title scene>, canPause: () => <in play, not results>, onStart: kind => { <exactly the old title confirm> }, onRestart, onQuitToTitle: () => { <back to the title scene> }, pauseKeys: [<{{pauseKeys}} minus keys used in play>], uiRects: () => <HUD boxes in play, native px>, obstacles: () => <characters and key props on the title backdrop>, titleCover: () => <HUD panels that would sit empty on the title>, controls: [[action, keys], ...], onOption: (k, v) => { <apply> }, params: {transition: \'{{transition}}\', transMs: {{transMs}}, quit: \'{{quit}}\', pauseButton: \'{{pauseButton}}\', hints: \'{{hints}}\'}})`.'],
    ['First line of the fixed step (every scene; the loop, the ?t= replay and autoplay all call it)',
      '`menu.update(STEP_MS); if (menu.busy()) { <drop queued presses>; return; }` so the world, timers and frame counter wait.'],
    ['Every render path, last (title, play, results, early returns)', '`menu.draw()`. On the title, while `menu.titleShown()`, draw only the backdrop art and frames, not the old name / press-start text.'],
    ['Where the game draws world text (speech bubbles, floating labels)', 'skip it while `menu.paused()`.'],
    ['Where the game reads settings', 'volumes 0-10 (`master`, `music`, `sfx`), `textSpeed`, `shake`, `flashes` through `menu.get(key)` or `onOption`.']
  ],
  gotchas: [
    '`?auto=1` hangs on the title or `?t=` stills changed -> the old title confirm / autopilot path was removed or `skip: false` was passed; keep the old title code, the module is off under the flags.',
    'A press on the menu also jumps or attacks in the game -> the step is not gated on `busy()`, or presses queued while busy are replayed afterwards.',
    'Two logos / two PRESS START lines -> the old title text is drawn while `titleShown()`.',
    'Black band under the title -> the early return skipped the frames the old title drew; skip only text.',
    'Escape stopped working as "back" -> it is in `pauseKeys`.',
    'The pause button covers the score -> that HUD box is missing from `uiRects()`.',
    'PRESS START over the hero on the title -> pass the hero box in `obstacles()`.',
    'An empty HUD panel fills the bottom of the title -> pass it in `titleCover()`; the module paints it and puts the menu there.',
    'Menu pixels bigger than the game\'s -> do not pass `unit: \'readable\'`; the default shares the game\'s pixel grid.'
  ],
  checks: [
    'Title: backdrop art, logo, PRESS START; Z opens the menu with NEW GAME (or CONTINUE) selected; NEW GAME wipes into play; arrows + Z, mouse clicks and taps reach every row; options persist after a reload.',
    'In play the pause key / button freezes the world; QUIT TO TITLE asks first and returns to the title; results / game over still return to the title with the game\'s own confirm, where one more Z starts a new game.',
    '`?auto=1` ends exactly as before, `?t=&freeze=1` stills identical (the module is off), no console errors; at 390 px wide no text overlaps.'
  ],
  selfcheck: [
    '`menu.update` once, first in the step; `menu.draw` at the end of every render path (also the title early return).',
    '`onStart` runs the same code as the old title confirm; the old confirm and the autopilot\'s title press still exist.',
    '`pauseKeys` unused in play; `canPause()` false on the title, results and game over.'
  ],
  offers: {
    'ui-rects': { title: 'menu window', text: '`menu.rect()` is the open title / pause window (native px), or null; while `menu.busy()` the game is paused, so other overlays should hide or wait.' }
  },
  wants: {
    'ui-rects': { title: 'HUD rects', text: 'Add the other element\'s on-screen boxes in play (minimap, toasts, boss bars) to `uiRects()` so the pause button and the hints line stay off them.', check: 'The pause button never covers the other element\'s boxes.' }
  }
};

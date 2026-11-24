// Basket hint for I-03 touch-controls: how to wire the module into an UNKNOWN game, by role. Never name a host's functions here.
export default {
  stage: 'foundations',
  does: 'Phones get a pixel-art D-pad (or stick), A/B buttons and a START pill below the game, in its side gutters or over its bottom corners, never on the HUD. Every finger is tracked (hold a direction while pressing A, slide from B to A), presses sink and light up, and the deck hides after a key press. Every input (keyboard, touch, gamepad) is edge-latched, so a tap shorter than one game step still counts exactly once. Touches become the game\'s own key events: its input code, autoplay and test hooks stay as they are.',
  params: {
    pad: 'create `params.pad`', side: 'create `params.side`', placement: 'create `params.placement`', size: 'create `params.size`',
    opacity: 'create `params.opacity` (only when drawn over the canvas)', start: 'create `params.start` (only if the game has a pause or menu key)',
    dirs: 'create `params.dirs` (4 for menu or grid games)', buttons: 'create `params.buttons` (how many action keys the game has, max 3)',
    show: 'create `params.show`', latch: 'create `params.latch`: `touch` if the game\'s keydown handler already records "just pressed" keys, else `all`'
  },
  steps: [
    ['The game\'s keydown / keyup handlers (read them first, change nothing)',
      'Note the `KeyboardEvent.code` the game binds for up, down, left, right, the main action or confirm (`a`), the second action or cancel (`b`), an optional third (`c`) and pause or menu (`start`). Note whether keydown records "just pressed" keys itself (a set filled on keydown and cleared after the step reads it): that decides `latch`.'],
    ['Once, after the canvas exists and BEFORE the first game step (including a `?t=` fast-forward that runs at load)',
      '`tc = GameDNA_TouchControls.create({canvas, mode: \'events\', map: {up, down, left, right, a, b, start}, avoid, params: {pad: \'{{pad}}\', side: \'{{side}}\', placement: \'{{placement}}\', size: \'{{size}}\', opacity: {{opacity}}, start: \'{{start}}\', dirs: {{dirs}}, buttons: {{buttons}}, show: \'{{show}}\', latch: \'{{latch}}\'}})`. `map` values are the game\'s own codes (an array when several keys do the same thing; the first is sent). `avoid()` returns the HUD bar, dialogue, menu and end-screen boxes on screen now, in canvas pixels.'],
    ['The fixed update step (the one function that advances the game once; the same one `?t=` fast-forward and autoplay run)',
      '`tc.step()` as its FIRST line, before the game reads input, on every screen (title, pause, game over too). Never in render or per animation frame.'],
    ['Only if the game has no key handlers at all', '`mode: \'poll\'` and read `tc.pressed(name)`, `tc.held(name)`, `tc.repeat(name)` (menus), `tc.axis()` in the step.'],
    ['The page head', '`<meta name="viewport" content="width=device-width, initial-scale=1">` if it is missing.']
  ],
  gotchas: [
    'A quick tap or a 0 ms key press is lost, or the title needs two presses -> `tc.step()` is not the first line of the fixed step, or `latch` is `touch` on a game that only checks held keys.',
    'Every touch counts twice -> poll mode used while the game\'s own key handler also reads the sent keys; use one mode.',
    'Controls cover the score bar or a dialogue box -> `avoid()` misses that box; return every HUD, dialogue and menu rect that is on screen now.',
    'The game\'s own canvas taps stopped working -> its pointer handlers were removed or rewired; leave them, touches off the controls reach them unchanged.',
    'Autoplay or `?t=&freeze=1` ends differently -> something calls `tc.press` / `tc.tap` from game code; only people and tests press.',
    'Controls on a desktop -> `show: \'always\'`; keep `auto`.'
  ],
  checks: [
    'On a 390x844 touch phone: the deck shows below the game (portrait), beside or over it (landscape), never on the HUD; nothing on a desktop until a touch.',
    'Tap A on the title starts; holding a direction moves; a second finger on A while holding a direction acts; sliding from B to A releases B and presses A.',
    'A 0 ms key tap (keydown and keyup in the same task) triggers its action exactly once; a key press hides the deck, a touch shows it again.',
    'The game\'s own canvas taps still work.'
  ],
  selfcheck: [
    'Every `map` code appears in the game\'s key table; `tc` exists before the first step; `tc.step()` is called once per step and nowhere else; no handler, tap zone or autopilot removed.',
    'Trace one touch on A: pointerdown -> `keydown` with the action code -> the game\'s handler records it -> `tc.step()` -> the step reads it -> finger up -> `keyup` after the next step.'
  ],
  wants: {
    'ui-rects': { title: 'UI rects', text: 'Return them from `avoid()` (canvas px) too, so controls drawn over the canvas move off them.', check: 'In landscape, no touch control covers the other element\'s windows or bars.' }
  }
};

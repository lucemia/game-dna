// Basket hint for H-02 dialogue-choices: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'ui',
  lead: 'Branch exactly: {{scope}}.',
  does: 'Branching talks from a plain script: after a question line a 2-4 option window opens beside the text box, arrows move a hand cursor, Z / tap picks; options the player cannot take yet are grey and say why; an optional countdown picks the default. Picks set flags (`set`, `inc`) that later lines check (`if: \'gold>=10 && !metElder\'`), jump to labels and rejoin; `once` lines and options are remembered; `{$flag}` prints a value. `validate()` lists unreachable labels and unknown flags; `getFlags()` / `setFlags()` save them as plain JSON. It drives the H-01 dialogue box (`box:`) or the game\'s own text box (`adapter:`). Autoplay picks each menu\'s `default`, so `?auto=1` ends the same.',
  params: {
    scope: 'which talks branch and what the choices change (shown at the top)',
    menuPlace: 'create `params.menuPlace`', timeout: 'create `params.timeout` (0 = wait for the player)', wrap: 'create `params.wrap`',
    disabled: 'create `params.disabled`', tint: 'create `params.tint`'
  },
  steps: [
    ['A script object next to the game\'s other data',
      '`{name: [entries]}` in neutral English: lines `{speaker, text}`, a question line with `choices: [{id, text, goto, set, inc, if, reason}]` (2-4), `label`s the options jump to, branches that rejoin. Every menu\'s `default` = the answer that keeps today\'s story. Every flag the game reads goes in `flags` with its start value.'],
    ['Once, after the screen size and HUD layout exist (and after the text box exists)',
      '`talk = GameDNA_DialogueChoices.create({script, flags, bounds, params: {menuPlace: \'{{menuPlace}}\', timeout: {{timeout}}, wrap: \'{{wrap}}\', disabled: \'{{disabled}}\', tint: \'{{tint}}\'}, autoplay: () => <autoplay flag>, uiRects: () => [HUD, menus], onFlag: (name, value) => <game effects>})` plus EITHER `box: <the GameDNA_DialogueBox instance>` OR `adapter: {show(line, done), close(), rect()}` on the game\'s own text box (README "Adapter mode"). Run `talk.validate()` once and fix every error, unreachable label and unknown flag.'],
    ['The game\'s existing talk function, in update logic: keep its name, arguments and the old dialog flag. Grep all its callers',
      '`talk.start(\'<name>\', {onEnd: r => { <clear the old flag>; <what ran after the old talk> }})`; the game reads flags with `talk.get(name)` and changes them with `talk.set` / `talk.inc`.'],
    ['Top of your fixed update step (the one the animation loop, the `?t=&freeze=1` fast-forward and autoplay all call)',
      'Box mode: `if (talk.busy()) { up -> talk.move(-1); down -> talk.move(1); confirm (key-down edge) -> talk.press(); back -> talk.back(); talk.hold(<confirm held>); talk.update(1000 / 60); return; }`, `talk.update(1000 / 60)` once per other step, and remove the box\'s own `update` / `draw` / `press` calls (talk calls them). Adapter mode: the same block only while `talk.choosing()`, before the game\'s own box input.'],
    ['Your draw pass', '`talk.draw(ctx)` last, after the HUD, outside any shake translate (box mode: it draws the box, then the menu).'],
    ['Save / load and new game', 'Save `talk.getFlags()` with the game state, `talk.setFlags(data)` on load; new game / restart: `talk.clear(); talk.resetFlags();`.']
  ],
  gotchas: [
    'The menu picks an answer the moment it opens -> the confirm is sent while held; route key-down edges only.',
    'The text box runs twice as fast -> box mode: `talk.update` already updates the box; remove the box\'s own `update` / `draw` / `press` calls.',
    'Adapter mode: the game\'s box advances under the menu -> while `talk.choosing()` its input must not reach the box.',
    'Adapter mode: the question vanishes while choosing -> `show(line, null)` means keep that line on screen.',
    '`?auto=1` ends differently -> a menu\'s `default` changes the story; set `default` to the answer that keeps the original path.',
    'A later line never shows -> a flag typo or a flag missing from `flags`; `validate()` lists unknown flags.',
    'Old answers survive a new game -> call `talk.resetFlags()` there; saves must include `talk.getFlags()` (once-marks are flags).'
  ],
  checks: [
    '{{scope}}: the menu opens beside the text box after the question; arrows move the hand, Z / tap picks; a locked option is grey and shows its reason; the branches rejoin.',
    'A flag set by a choice changes a later line and something in the game; the menu never covers the HUD or the text box; the world waits while the talk is open.',
    '`talk.validate()` is ok; `?t=<ms>&freeze=1` gives the same frame every time; `?auto=1` ends with the same result as before, no console errors.'
  ],
  selfcheck: [
    'Both modules byte-identical and loaded before the game (dialogue-box.js first); `validate()` reports ok.',
    'Grep `start(`: only in the talk function (update logic); every caller reaches it. Grep `update(`: every fixed step including while busy; no leftover box `update` / `draw` in box mode.',
    'Walk one autoplay menu: question typed -> menu opens (80 ms) -> hand on `default` (300 ms) -> picked (600 ms) -> its `goto` -> the same story as before.'
  ],
  offers: {
    'ui-rects': { title: 'choice menu', text: '`talk.menuRect()` is the open choice menu, or null; add it to the other element\'s obstacles / UI rects.' }
  },
  wants: {
    'ui-rects': { title: 'text box', text: 'For the choice menu, pass that dialogue box instance itself as `box:` (talk then avoids it and updates, draws and routes input for it; remove the box\'s own `update` / `draw` / `press` calls) and return the other UI rects from `uiRects()`.', check: 'The choice menu never covers the dialogue box, its name plate or the HUD.' },
    'battle-start': { title: 'reset', text: 'Call `talk.clear()` there (and `talk.resetFlags()` when a whole new game starts).' }
  }
};

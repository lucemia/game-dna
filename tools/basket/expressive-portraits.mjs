// Basket hint for D-04 expressive-portraits: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'ui',
  does: 'Needs the H-01 dialogue box (`GameDNA_DialogueBox`) for conversations; it hooks only the box\'s `create({bounds, onLine})` options and its public `rect()` / `state()`. Hand-made-looking 16-bit bust portraits generated from small seeded specs (one per speaking character), with 7 expressions (neutral, happy, angry, sad, surprised, determined, hurt) that change only brows, eyes and mouth, blinking, and a mouth that moves while the dialogue box types. The speaker\'s framed portrait slides in beside the H-01 dialogue box, takes its expression from the line\'s `expr` field and dims while someone else talks; the box is narrowed so it sits beside the portrait. Menus (character select, status) can draw the same portraits as framed panels.',
  params: {
    size: 'create `params.size` (48 or 64 native px)', layout: 'create `params.layout`', frame: 'create `params.frame`', enter: 'create `params.enter`',
    enterMs: 'create `params.enterMs`', listener: 'create `params.listener`', blinkMs: 'create `params.blinkMs` (0 = never)', mouthMs: 'create `params.mouthMs`',
    outline: 'create `params.outline`', backdrop: 'create `params.backdrop`'
  },
  steps: [
    ['Read first: the dialogue box\'s `create(...)` call; every `update(`, `draw(` and `clear(` of that box; where lines are built and who speaks them',
      'Write a cast: one spec per speaking character, keyed by the lines\' `speaker` (or `who`): `{seed: <fixed number>, name, age: child|young|adult|elder, gender: female|male|any, skin, hair, hairColor, headgear, collar, cloth, bg}` (only `seed` is required; options in the README), fitted to each character\'s role, with varied ages and skin tones.'],
    ['Just before the dialogue box is created',
      '`const TALK_FIELD = <the box\'s old bounds>;` (a NEW name: grep it) and `por = GameDNA_Portraits.create({bounds: TALK_FIELD, uiRects: () => [HUD, menus], cast, params: {size: {{size}}, layout: \'{{layout}}\', frame: \'{{frame}}\', enter: \'{{enter}}\', enterMs: {{enterMs}}, listener: \'{{listener}}\', blinkMs: {{blinkMs}}, mouthMs: {{mouthMs}}, outline: \'{{outline}}\', backdrop: \'{{backdrop}}\'}})`.'],
    ['The dialogue box\'s create options (keep every other option)',
      '`bounds: () => por.reserve(TALK_FIELD)` and `onLine: (line, i, ctl) => por.onLine(line, i, ctl)` (if a create-level `onLine` exists, call both; a per-`open()` `onLine` stays). Right after the box exists: `por.attach(dlg)`.'],
    ['Where lines are built', 'Add `expr` to each spoken line (`neutral`, `happy`, `angry`, `sad`, `surprised`, `determined`, `hurt`) to fit its words; for lines built from strings, a small lookup. Never change the text.'],
    ['Next to EVERY `update(` of the box (the busy branch too), inside the fixed step the animation loop, `?t=&freeze=1` and autoplay all call', '`por.update(1000 / 60)`.'],
    ['Right after every `draw(` of the box', '`por.draw(ctx)` (outside any shake translate).'],
    ['Next to every `clear()` of the box (new game, restart, scene change)', '`por.clear()`.'],
    ['Only if the game has a status / party / select screen', '`GameDNA_Portraits.drawPanel(ctx, por.portrait(\'<key>\'), {x, y}, {expr, t: <frame count> * 1000 / 60})` where the character is shown.']
  ],
  gotchas: [
    'The portrait overlaps the start of the text -> the box still has its static `bounds`; use `bounds: () => por.reserve(TALK_FIELD)`.',
    'Every line shows the neutral face -> `onLine` went into `open(..., {onLine})` instead of the box\'s `create({onLine})`.',
    'The mouth never moves or portraits never leave -> `por.attach(dlg)` missing, or `por.update` runs only when the box is not busy.',
    '`Identifier ... has already been declared` at load -> the game already has a constant with that name (`FIELD`); pick a new one.',
    'Frozen shots differ -> a menu passed wall time as `t`; pass the step clock.',
    'Faces blurry when scaled -> keep smoothing off and integer canvas scale; never flip with CSS (use `flip`).'
  ],
  checks: [
    'When a character talks, their framed portrait sits beside the box (never over the text, the HUD or menus); the box starts beside the panel.',
    'The expression changes with the line; the mouth moves while letters type and stops when the page is complete; the face blinks; narration shows no portrait.',
    '`?t=<ms>&freeze=1` is identical twice; `?auto=1` ends as before with no console errors.'
  ],
  selfcheck: [
    'Module byte-identical, loaded before the game script; every new top-level identifier is unused elsewhere.',
    'Grep the box\'s `update(`, `draw(`, `clear(`: each has `por.update(`, `por.draw(`, `por.clear(` beside it.',
    'Each speaker that should have a face has a cast key; every `expr` is one of the seven names. Walk one line: open -> onLine (face, reserved column) -> typing (mouth) -> close (panel slides out).'
  ],
  wants: {
    'ui-rects': { title: 'UI rects', text: 'Return them from the portraits\' `uiRects()` as well, so a panel never covers them.', check: 'No portrait panel covers the other element\'s windows, plates or HUD.' },
    'battle-start': { title: 'reset', text: 'Call `por.clear()` there, next to the dialogue box\'s `clear()`.' }
  }
};

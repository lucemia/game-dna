// Basket hint for L-02 painted-portraits: how to wire painted dialogue portraits into an UNKNOWN game, by role.
// The basket ships the module; the images come either from the element's sample cast (assets/assets.json + assets/cast/*.webp,
// the "pack" layer; combine.mjs does not copy images, add them as extra files) or from the designer's own set made with
// prompt.md + assets/prompts/templates.md + tools/portraitset.py (the "regenerate" layer).
// Relation to other elements: H-01 dialogue-box drives it through the same hooks as D-04 expressive-portraits
// (create({onLine}), bounds: () => por.reserve(FIELD), attach(dlg)); D-04 is the procedural pixel alternative (talking mouth,
// no files) and the one to use on pixel canvases. Use one of the two per game, not both.
export default {
  stage: 'ui',
  does: 'Painted bust portraits (pre-generated image files: a neutral base per character and each expression made as an edit of it, aligned on one canvas) shown beside the dialogue box: the speaker slides in and stands on the box\'s top edge, cross-fades to each line\'s `expr` (neutral, happy, angry, sad, surprised, determined), breathes, blinks on the neutral face, bobs while text types, and dims while someone else talks. Works with the H-01 dialogue box (same hooks as D-04 expressive-portraits) or with the game\'s own text box through `attach({rect})` + `onLine({speaker, expr})`. The game never calls an image generator.',
  params: {
    layout: 'create `params.layout` (`two`: first speaker left, next right; a cast entry\'s `side` wins)',
    place: 'create `params.place` (`stand` on the box, or `beside` it)',
    height: 'create `params.height` (0 = 46 % of the dialogue field)',
    enter: 'create `params.enter`', enterMs: 'create `params.enterMs`', fadeMs: 'create `params.fadeMs` (expression cross-fade)',
    listener: 'create `params.listener`', dim: 'create `params.dim`', breathe: 'create `params.breathe` (0 = off)', blinkMs: 'create `params.blinkMs` (0 = off)'
  },
  steps: [
    ['Read first: the boot (first step, the `?t=` fast-forward, the first animation frame); the function that opens dialogue and EVERY caller; where the line index advances and where the box closes; where the text box is drawn (its rect and the transform it is drawn in); the fixed update step incl. the branch that runs while the box is open; restart / new game; HUD rects',
      'Write a cast keyed by the exact speaker names: `{\'<speaker>\': {src: \'<folder>/<id>-{expr}.webp\', side: \'left\' | \'right\'}}` (shipped cast: `maren` a woman warden in her forties, `tobin` a young man scholar, `hesper` an elderly woman merchant, `oswin` a male shopkeeper in his fifties; map by role, gender and age as the game shows them, one speaker per set; a speaker no set fits keeps no portrait).'],
    ['Next to the dialogue code (a NEW top-level name: grep it first)',
      '`const por = GameDNA_PaintedPortraits.create({bounds: <the field the box is laid out in, in the units it is drawn in>, cast, uiRects: () => [HUD], params: {layout: \'{{layout}}\', place: \'{{place}}\', height: {{height}}, enter: \'{{enter}}\', enterMs: {{enterMs}}, fadeMs: {{fadeMs}}, listener: \'{{listener}}\', dim: {{dim}}, breathe: {{breathe}}, blinkMs: {{blinkMs}}}})`.'],
    ['H-01 dialogue box in the game: its create options (keep every other option)',
      '`bounds: () => por.reserve(<field>)` and `onLine: (line, i, ctl) => por.onLine(line, i, ctl)` (call any old create-level onLine too), then `por.attach(dlg)`.'],
    ['The game\'s own text box instead',
      '`por.attach({rect: () => <box rect while it is open, else null>})`; wherever a line is shown (the box opens, the line index advances and is still in range) call `por.onLine({speaker, expr})`.'],
    ['Where lines are written', 'Give each spoken line an `expr` that fits its words (objects: an `expr` field; plain strings: a parallel list). Never change the text.'],
    ['The fixed step (both the box-open branch and the normal one), the step that `?t=&freeze=1` and autoplay also call', '`por.update(1000 / 60)` once per step.'],
    ['Right after the text box is drawn, in the same transform, outside any shake', '`por.draw(ctx)`.'],
    ['Restart / new game / scene change', '`por.clear()` (never reload images there).'],
    ['The boot', 'Replace the old boot call with `por.onReady(boot)` (boot = the old start code, unchanged). If L-00 art-direction-lock already gates the boot: `GameDNA_Assets.load(list, {onReady: () => por.onReady(boot)})`.']
  ],
  gotchas: [
    'Frozen shots (`?t=&freeze=1`) without portraits, or different on each load -> the old boot still runs directly; boot only from `por.onReady(boot)`.',
    'Every line shows the neutral face -> `onLine` not called where the line advances (own box), or passed to `open(..., {onLine})` instead of the H-01 box\'s `create({onLine})`; or the lines have no `expr`.',
    'Portraits never leave -> `attach` missing, or the attached `rect()` never returns null when the box closes; or `por.update` runs only when the box is closed.',
    'The bust is tiny or covers the whole screen -> `bounds` is in other units than the box (e.g. 640x360 while the box is drawn in a scaled 320x180 layer).',
    'A visible flat edge under the bust -> `por.draw` was called before the box or in another transform; draw right after the box.',
    'A shopkeeper\'s window that opens after the talk keeps the bust on screen -> `rect()` must return null as soon as the TOP window is no longer the text box.',
    '`Identifier ... has already been declared` -> the game already has that name (`FIELD`, `CAST`); pick a new one.'
  ],
  checks: [
    'While a character talks, their painted bust stands on the box\'s top edge (or beside it) on its side, never over the text, the HUD or menus; narration shows no new portrait.',
    'Each tagged line shows its expression (cross-fade, the bust does not jump); with two speakers the listener is dimmed; the busts slide out when the box closes.',
    '`?t=<ms>&freeze=1` is identical twice with the portraits in it; `?auto=1` ends as before with no console errors.'
  ],
  selfcheck: [
    'Module byte-identical, loaded before the game script; every new top-level identifier is unused elsewhere; every cast `src` file exists (`neutral` at least).',
    'Grep the box\'s open / advance / close sites: each line shown calls `por.onLine` (H-01: through create({onLine})); the close makes `rect()` null (H-01: `attach(dlg)`).',
    'Grep `por.update(` (every step, box-open branch too), `por.draw(` (after the box), `por.clear(` (restart); the old boot runs only from `onReady`.'
  ],
  wants: {
    'ui-rects': { title: 'UI rects', text: 'Return them from the portraits\' `uiRects()` as well, so a bust never covers them.', check: 'No portrait covers the other element\'s windows, plates or HUD.' },
    'battle-start': { title: 'reset', text: 'Call `por.clear()` there, next to the dialogue box\'s `clear()`.' }
  }
};

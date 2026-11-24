// Basket hint for H-01 dialogue-box: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'ui',
  lead: 'Use the dialogue box for exactly: {{scope}}. Only text the player reads and dismisses (talk, signs, item/chest messages, story beats); leave self-clearing captions, combat logs, banners and the game\'s own result overlays as they are.',
  does: 'A typewriter text box: lines from a plain `[{speaker, who, text}]` array type out letter by letter (pauses at punctuation), a name plate sits on the speaker\'s side, a blinking arrow waits; Z / Enter / tap finishes the page, then advances; holding fast-forwards. It opens at the bottom, or at the top when the speaker stands there, and never covers the HUD. While it is open (`busy()`) the confirm input goes to the box and the world waits; `onEnd` runs when it closes. Autoplay advances it by itself, so `?auto=1` ends the same.',
  params: {
    scope: 'which text goes in the box (shown at the top)',
    speed: 'create `params.speed` (letters per second; 0 = whole page at once)', pause: 'create `params.pause`', rows: 'create `params.rows`',
    place: 'create `params.place`', nameTag: 'create `params.nameTag`', autoAdvance: 'create `params.autoAdvance` (0 = wait for the player)',
    hold: 'create `params.hold`', tint: 'create `params.tint`', dim: 'create `params.dim`'
  },
  steps: [
    ['Once, after the screen size and HUD layout exist',
      '`dlg = GameDNA_DialogueBox.create({bounds, params: {speed: {{speed}}, pause: {{pause}}, rows: {{rows}}, place: \'{{place}}\', nameTag: \'{{nameTag}}\', autoAdvance: {{autoAdvance}}, hold: \'{{hold}}\', tint: \'{{tint}}\', dim: {{dim}}}, autoplay: () => <autoplay flag>, getAnchor: (who, line) => <that character\'s sprite rect {x, y, w, h} on SCREEN now, or null>, uiRects: () => [HUD, menus], onTick: ch => <text blip, optional>})`. `bounds` = the play field `{x, y, w, h}` in native px.'],
    ['The game\'s existing text function (or the moments in the lead), in update logic: keep its name and arguments. Grep all its callers and any code that sets the dialog state directly',
      '`dlg.open(lines, {onEnd: r => { ... }})` with `lines = [{speaker: \'Elder\', who: \'<sprite id>\', text: \'...\'}, {text: \'narration\'}]`. Keep the old dialog flag set while open; move what ran after the old text closed (quest flags, callbacks, scene changes) into `onEnd`, and clear the flag there. Delete only the old box drawing.'],
    ['Top of your fixed update step (the one the animation loop, the `?t=&freeze=1` fast-forward and autoplay all call)',
      '`if (dlg.busy()) { if (<confirm pressed this step, from the player>) dlg.press(); dlg.hold(<confirm held>); dlg.update(1000 / 60); return; }` so the world and the action wait; if the old box closed on Back, call `dlg.end()` there; pause/restart keys stay outside the gate. When not busy: `dlg.update(1000 / 60)` once per step. The step that calls `open()` still runs the rest of its world update (other units, timers, encounter checks); the gate takes effect from the next step.'],
    ['Your draw pass', '`dlg.draw(ctx)` last, after the HUD, outside any shake translate.'],
    ['New game / restart / scene change', '`dlg.clear()` first.']
  ],
  gotchas: [
    'Every battle caption now waits for Z and autoplay takes far longer -> self-clearing captions, combat logs and wave banners were routed through the box; leave them as they were.',
    'The VICTORY / GAME OVER screen is gone -> keep the game\'s own result overlays; if lines play there, draw the overlay after the talk (`!dlg.busy()`).',
    'Narration shows a made-up name plate ("You", a monster name) -> narration and system text have no `speaker`.',
    'The first page is skipped the moment the box opens -> the opening confirm is also routed to the box, or "key is down" is sent every frame; route the key-down edge only.',
    'The quest / battle never continues after the talk -> the after-text code stayed in the old advance branch; move it into `onEnd` (synchronous; never `await`).',
    'Autoplay or a test hook stops working -> it read the old dialog flag; keep the flag set while the box is open and clear it in `onEnd`.',
    '`?auto=1` hangs on the box -> pass the autoplay flag as `autoplay`, and call `update` inside the fixed step the freeze loop calls.',
    'The world keeps moving under the box -> gate the whole step on `busy()`.',
    'Later encounters shift or autoplay ends differently -> the step that opened the talk returned early; let it finish its world update and gate from the next step.',
    'The box covers the speaker -> `getAnchor` must return the sprite rect on screen (after camera and HUD offsets), not in world coordinates.',
    'A banner or result overlay leaves no room for the box -> draw the overlay after the talk (`!dlg.busy()`) or pass it as a UI rect.'
  ],
  checks: [
    '{{scope}} shows in the box: letters type out, the name plate sits on the speaker\'s side, the arrow blinks; Z / Enter / tap finishes the page, then advances; holding Z fast-forwards.',
    'The box never covers the speaker or the HUD; the world waits while it is open; what happened after the old text closed still happens; captions, banners and result overlays look and time as before; narration has no name plate.',
    '`?t=<ms>&freeze=1` gives the same frame every time; `?auto=1` ends with the same result as before, no console errors.'
  ],
  selfcheck: [
    'Grep `open(`: only in the text function (update logic); list every caller of that function and confirm each reaches it.',
    'Grep `update(`: every fixed step including while busy; the freeze loop calls that step. The old dialog flag is true while the box is open.',
    'Walk one autoplay line of 40 letters: open 0.1 s -> ~1 s typing -> 0.6 s -> close -> `onEnd` -> the same quest / battle step as before.'
  ],
  offers: {
    'ui-rects': { title: 'dialogue box', text: '`dlg.rect()` is the open box with its name plate, or null; add it to the other element\'s obstacles / UI rects.' }
  },
  wants: {
    'ui-rects': { title: 'UI rects', text: 'Return them from the box\'s `uiRects()`, so the box never covers them.', check: 'The dialogue box never covers the other element\'s windows, plates or HUD.' },
    'battle-start': { title: 'reset', text: 'Call `dlg.clear()` there (before any battle intro lines are opened).' }
  }
};

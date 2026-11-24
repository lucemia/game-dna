// Basket hint for I-07 seeded-replay: how to wire the module into an UNKNOWN game, by role.
// It records the device input per fixed step and replays it through the game's own step, so it must sit at the input read
// (before any autopilot) and the game must be deterministic from its seed. It changes nothing while nobody watches a replay.
export default {
  stage: 'ui',
  does: 'Records every run as its seed plus the raw input of each fixed step and replays it through the game\'s own step function to the identical end state, checked by a state hash every second and at the end (END STATE MATCH or DESYNC). The best run returns as a translucent ghost drawn with the hero\'s own frames that races the player, with a time-trial panel (time, best, split) and a NEW BEST banner. Replays have a HUD: pause, speed x.25-x4, scrubber with checkpoint ticks. Runs save and load as one line of text.',
  params: {
    ghost: 'create `params.ghost`', tint: 'create `params.tint`', speed: 'create `params.speed`', watchKey: 'create `params.watchKey` (a key the game does not use)',
    pauseKey: 'create `params.pauseKey`', checkEvery: 'create `params.checkEvery`', store: 'create `params.store`'
  },
  steps: [
    ['Before the game\'s first step and boot (the module must exist when a run starts)',
      '`rep = GameDNA_SeededReplay.create({restart: (seed, meta) => { <set the run seed; apply meta.auto to the autopilot flag; the same reset + scene change a live start does> }, step: () => <the fixed step function>, state: () => ({ <every gameplay field the update writes + the RNG state; NOT the frame counter, NOT the camera> }), pose: () => <hero on the field ? {x, y, facing, animation fields} in world px : null>, drawGhost: (ctx, p) => { <the hero\'s own sprite draw for p, minus the camera> }, progress: () => <number growing toward the goal>, exit: () => { <restore the autopilot flag; title scene> }, view: {w, h}, canvas, uiRects: () => [<HUD / window rects of the current scene>], params: {ghost: \'{{ghost}}\', speed: {{speed}}, tint: \'{{tint}}\', watchKey: \'{{watchKey}}\', pauseKey: \'{{pauseKey}}\'}})`.'],
    ['Where play of a run starts (title -> play), after the reset and the scene change; NOT at page load', '`rep.begin(runSeed, {auto: <autopilot flag>})`. Reset autopilot memory there too.'],
    ['The fixed step, where device input is read, BEFORE the autopilot choice', '`const raw = rep.input(readInput());` and use the returned value.'],
    ['Every win and every loss', '`rep.end({won: true})` / `rep.end({won: false})`.'],
    ['The live loop (not the ?t= fast-forward)', 'per fixed tick `for (let n = rep.steps(); n > 0; n--) step();`.'],
    ['World draw, just before the hero, inside the same transform; end of render in every scene', '`rep.drawGhost(ctx)`; `rep.draw(ctx)` last.']
  ],
  gotchas: [
    'DESYNC at 0:00 -> restart() differs from a live start (seed not applied, camera or frame counter in state()).',
    'DESYNC later and stats().randomCalls > 0 -> Math.random in the update; use the seeded RNG.',
    'A replay of an ?auto=1 run stands still -> the autopilot flag is not passed as meta and applied in restart().',
    'The time panel shows on the title -> begin() is called at page load.',
    'Speed and pause do nothing -> the loop still calls step() directly.',
    'The ghost faces the wrong way or slides -> pose() must carry facing and the animation fields; drawGhost uses the hero\'s frame selection.',
    '`?auto=1` ends differently -> the module only reads input; check that the returned input object is used unchanged and the autopilot still runs after it.'
  ],
  checks: [
    'Finish a run, press the watch key: the replay ends with END STATE MATCH; rep.verify(\'last\').ok is true.',
    'The next run shows the ghost of the best run with BEST and a split; NEW BEST appears once when beaten.',
    'Pause, speed and scrub work in a replay; Esc returns to the title; `?auto=1` ends exactly like before.'
  ],
  selfcheck: [
    'Each field the update writes is in state() or recomputed every step; every random number comes from the seeded RNG.',
    'begin at play start only, end at every win and loss, exit undoes restart.'
  ],
  offers: {
    'ui-rects': { title: 'replay HUD rects', text: '`rep.lastDrawn()` lists the time-trial panel, banner, replay bar and verdict card; add them to the other element\'s UI rects so toasts or numbers never land on them.' }
  },
  wants: {
    'ui-rects': { title: 'HUD rects', text: 'Add the other element\'s on-screen boxes (minimap, toasts, boss bars) to `uiRects()` so the panels slide out of their way.', check: 'The replay bar and panels never cover the other element.' }
  }
};

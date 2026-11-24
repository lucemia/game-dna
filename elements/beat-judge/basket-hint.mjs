// Basket hint for F-04 beat-judge (beat judge): how to wire the module into an UNKNOWN game, by role.
// It never changes game state by itself: the game scales its own result by the rating, and autopilot actions are never
// judged, so ?auto=1 ends as before. With F-03 chip-music in the basket, pass the music instance: beats follow its tracks.
export default {
  stage: 'input',
  does: 'A beat clock and an input judge: the player action the designer names is rated Perfect, Good or Miss against the nearest beat, timed at the key or tap EVENT (not the frame) minus audio latency and the player\'s calibration offset; the game scales its own result (Perfect x1.5, Good x1, Miss x0.5). A beat track shows markers sliding to a judge ring, EARLY / LATE and the combo; a calibration window sets the offset from 8 taps. Beats follow F-03 chip-music when present, else its own clock with a click track that starts on the first click or key.',
  params: {
    bpm: 'create `params.bpm` (own clock only)', perfect: 'create `params.perfect` (ms)', good: 'create `params.good` (ms)', expect: 'create `params.expect`',
    perfectMult: 'game side: multiplier for a Perfect', missMult: 'game side: multiplier for a Miss', calibrateKey: 'game side: the key that calls `calibrate()`'
  },
  steps: [
    ['Once at startup', '`beat = GameDNA_BeatJudge.create({params: {bpm: {{bpm}}, perfect: {{perfect}}, good: {{good}}, expect: {{expect}}}, getObstacles: () => [/* sprite rects with id */], hints: {tap: \'<confirm key> OR TAP\', cancel: \'<back key>: CANCEL\'}})`; never create an AudioContext.'],
    ['The fixed update step of EVERY scene, also ?t= and autoplay loops', '`beat.update(stepMs)`; while `beat.busy()` skip the world but keep this call and route confirm / back / arrows to `beat.key(name, e)`, canvas taps to `beat.pointer(x, y, e)`.'],
    ['The key / pointer handler that starts the judged action', 'also store the event: `lastActionEvent = e` (do not judge here); clear it at the end of each step.'],
    ['The ONE function every judged player action goes through', '`const r = lastActionEvent ? beat.press(lastActionEvent) : null;` then multiply what the game already computes: perfect x{{perfectMult}}, good x1, miss x{{missMult}}; autopilot actions never call press().'],
    ['HUD draw; an unused key', '`beat.draw(ctx, {x, y, w, h: 22})` in a free strip clear of the HUD and the feet; key {{calibrateKey}} calls `beat.calibrate()`; `beat.reset()` on a new game.']
  ],
  gotchas: [
    'Perfects are rare and everything reads ~10 ms late -> `press()` got no event (judged at the frame); pass the stored keydown / pointerdown event.',
    '`?auto=1` ends differently -> the autopilot\'s actions were judged; only a stored real input event may reach `press()`.',
    'Markers frozen in ?t= stills -> `update()` missing from the fast-forward loop or a scene.',
    'The calibration window never closes -> confirm / back are not routed to `key()` while `busy()`, or `update()` stops with the world.',
    'A sound button mutes on the first click -> wire it to `toggle()`, never straight to `mute()`.'
  ],
  checks: [
    'Pressing the action on the beat shows PERFECT and applies the bonus; slightly off shows GOOD with EARLY / LATE; far off or mashing shows MISS.',
    'The calibration key opens the window; 8 taps give an offset; KEEP shifts later ratings.',
    '`?auto=1` ends exactly as before with no console errors; no sound before the first click or key.'
  ],
  selfcheck: [
    '`press(` appears once, inside the action\'s function, guarded by a stored real input event.',
    '`update(` is reached in every scene, also while `busy()`; `create` runs once; the module file is unchanged.'
  ],
  offers: {
    'ui-rects': { title: 'beat track rect', text: '`beat.lastDrawn()` lists the track and calibration window rects; add them to the other element\'s UI rects so toasts or numbers never land on them.' },
    'events': { title: 'ratings and beats for other elements', text: '`onRate(r)`: a Perfect can trigger a hit-stop, sparks or a damage-number style; `onBeat(b)`: pulse lights or bob sprites on the beat (`b.down` = bar start).' }
  },
  wants: {
    'music': { title: 'chip music', text: 'Pass the F-03 instance: `GameDNA_BeatJudge.create({music, ...})` so the beats are the music\'s beats (tempo, switches, jingle pauses) and no click track plays.', check: '`beat.state().source === \'music\'` and the markers land on the drum hits.' }
  }
};

// Basket hint for E-16 time-rewind: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'effects',
  does: 'Hold a key (default R) or the touch button and the world runs backwards: the module deep-copies the game state every fixed step into a ring buffer and, while the key is held, restores older copies at 1x-3x under a rewind filter with a REWIND indicator, a history scrubber and an energy meter. On release play continues from the restored moment. The module is a gate at the top of the step, so without the key the game runs exactly as before.',
  params: {
    speed: 'create `params.speed`', seconds: 'create `params.seconds` (history kept)', energy: 'create `params.energy` (meter | charges | free)',
    meter: 'create `params.meter` (seconds of rewind per full meter)', tint: 'create `params.tint`', key: 'create `params.key` (a key the game does not use)'
  },
  steps: [
    ['Once, after the game state and the canvas exist',
      '`rewind = GameDNA_TimeRewind.create({snapshot: () => ({ <every variable the update writes: state objects, loose lets, RNG state, camera, autopilot memory> }), restore: s => { <assign each back from s> }, canRecord: () => <play scene and no pause / menu / dialogue / end screen>, view: {w: <logical width>, h: <logical height>}, canvas, uiRects: () => [<HUD rects, logical px>], params: {speed: {{speed}}, seconds: {{seconds}}, energy: \'{{energy}}\', meter: {{meter}}, tint: \'{{tint}}\', key: \'{{key}}\'}})`. State in `const` objects: `targets: () => [stateObj]` instead (restored in place).'],
    ['Your fixed update step (the one `?t=` fast-forward and `?auto=1` also run), right after input is read and BEFORE the autopilot and the world update',
      '`if (rewind.step(<step ms>)) return;`. A rewound step runs nothing else: no update, autopilot, sounds, score or timers.'],
    ['The end of render, after the HUD', '`rewind.draw(ctx)`.'],
    ['Where a new game, level or restart begins', '`rewind.clear()`.'],
    ['Wherever facing or an animation phase is computed from movement', 'Store it in the state in the update and draw from it, so rewound characters keep facing their way.']
  ],
  gotchas: [
    'The hero turns around while rewinding -> facing is derived from the change in x; keep facing in the state.',
    'Some value keeps its new value after a rewind (timer, score, cooldown) -> it is missing from snapshot(); walk the update line by line.',
    'Stale objects after a rewind (an enemy that cannot be hit) -> code cached a reference; look it up again after restore, or use targets().',
    'Rewinding on the title or pause screen, or into the previous run -> canRecord() must be false there and clear() must run on new game.',
    'Autoplay ends differently -> the gate sits after the autopilot or restore runs outside a rewind; keep the gate before the autopilot.',
    'The HUD turns grey while rewinding -> pass its rects in uiRects().'
  ],
  checks: [
    'Hold the rewind key mid-play: the picture desaturates with scanlines, a REWIND indicator counts seconds, a scrubber shows the history; characters move backwards still facing their way. Release: play continues from that moment and the meter refills.',
    'Holding the key on the title or pause screen does nothing; `?auto=1` ends exactly as before.'
  ],
  selfcheck: [
    'Every variable the update writes is in snapshot() and assigned back in restore().',
    '`rewind.step` returns early before the autopilot and the update; `?t=` fast-forward calls the same step.',
    'Walk one rewind with the defaults: holding 30 steps at speed 2 restores the state from 60 steps before the press and uses 17% of a 3 s meter.'
  ],
  wants: {
    'ui-rects': { title: 'UI rects', text: 'Add the other element\'s HUD and windows to `uiRects()`, so the rewind filter leaves them readable and the meter avoids them.', check: 'During a rewind the other element\'s HUD keeps its colours.' },
    'battle-start': { title: 'reset', text: 'Call `rewind.clear()` there too.' }
  }
};

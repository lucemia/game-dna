// Basket hint for F-01 timing-bar: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'ui',
  lead: 'Put the skill check exactly at: {{moment}}. Do not add it anywhere else (no other action gets a bar).',
  does: 'A skill-check overlay for the moments you name (pick a lock, a timed attack bonus, forging, reeling in): a window with a bar opens, a needle sweeps miss / good / great / perfect zones, one press stops it, a grade word pops, and the game gets `{grade, offset}` in `onDone`. While it is open (`busy()`) the confirm input goes to the bar and the world waits. Autoplay resolves it at a fixed grade, so `?auto=1` ends the same.',
  params: {
    moment: 'where the skill check goes (shown at the top)',
    difficulty: 'create `params.difficulty` (sets speed and zone widths)', speed: 'set by `difficulty`; add `params.speed` only to override', good: 'set by `difficulty`; add `params.good` only to override', great: 'set by `difficulty`; add `params.great` only to override', perfect: 'set by `difficulty`; add `params.perfect` only to override',
    motion: 'create `params.motion`', ease: 'create `params.ease`', hits: 'create `params.hits` (or per check: `start({hits})`)', zones: 'create `params.zones`',
    assist: 'create `params.assist`', width: 'create `params.width`', position: 'create `params.position`', dim: 'create `params.dim`',
    shake: 'create `params.shake`', autoGrade: 'create `params.autoGrade` (what autoplay resolves at; `good` keeps outcomes and numbers)'
  },
  steps: [
    ['Once, after the screen size and HUD layout exist',
      '`check = GameDNA_TimingBar.create({bounds, seed: 7, params: {difficulty: \'{{difficulty}}\', hits: {{hits}}, motion: \'{{motion}}\', ease: \'{{ease}}\', zones: \'{{zones}}\', assist: \'{{assist}}\', width: {{width}}, position: \'{{position}}\', dim: {{dim}}, shake: \'{{shake}}\', autoGrade: \'{{autoGrade}}\'}, autoplay: () => <autoplay flag>, getObstacles, onShake})`. `bounds` = play field `{x, y, w, h}` with the HUD excluded; `getObstacles()` returns HUD, menus and dialog boxes WITHOUT `id` (never covered) and sprites with `id` (avoided when cheap). The seed is the module\'s own: never pass or call the game\'s RNG.'],
    ['The moment named above, in update logic: the ONE function every caller of it reaches (player input, autopilot, tap handler, debug key). Grep all its callers',
      '`if (!check.busy()) check.start({label, hint, anchor: {x: <centre>, y: <top>, w, h}, onDone: r => { ... }})`. Move the action\'s original effect into `onDone` (synchronous; never `await` the returned promise for game logic). A miss must leave the object usable for a retry. A grade that changes a number multiplies the existing roll (perfect 1.5, great 1.25, good 1.0, miss 0.75); never add or skip a roll.'],
    ['Top of your fixed update step (the one the animation loop, the `?t=&freeze=1` fast-forward and autoplay all call)',
      '`if (check.busy()) { if (<confirm pressed this step, from the player>) check.press(); check.update(1000 / 60); return; }` so the world, timers and the action wait; pause/restart keys stay outside the gate. When not busy: `check.update(1000 / 60)` once per step.'],
    ['Your draw pass', '`check.draw(ctx)` last, after the HUD, outside any shake translate.'],
    ['New game / restart', '`check.clear()` first.']
  ],
  gotchas: [
    'The bar stops the moment it opens -> the game re-sends a held confirm every frame; route the key-down edge only (presses in the first 240 ms are ignored).',
    'Quick taps are ignored -> `press()` on the key-down edge (it is latched until the next `update`), not "is the key down now".',
    'The world keeps moving under the bar (enemies reach the hero, gauges fill) -> gate the whole step on `busy()`.',
    '`?t=&freeze=1` frames differ or autoplay hangs on the bar -> game logic after `await`; use `onDone`, and `update` inside the fixed step.',
    'Autoplay ends differently -> autoplay must resolve at a fixed grade (`autoplay` option + `autoGrade: good`); a bonus multiplies the existing roll, never re-rolls.',
    'The check opens twice / its result is lost -> `start()` runs every frame while the action condition holds; guard with `busy()` and start once.',
    'Some callers skip the check (autopilot or tap path calls the old effect directly) -> start in the function they all share.',
    'Title shows `?` -> pixel16 UI font: letters, digits, `- . / ?` only.'
  ],
  checks: [
    '{{moment}} opens the bar, and nothing else does; Z / Space / tap stops the needle; the grade word pops; the game acts on the grade; a miss allows a retry.',
    'A one-frame tap counts; a held key does not re-trigger; other keys still work while the bar is up; the world is paused under it.',
    '`?t=<ms>&freeze=1` gives the same bar frame every time; `?auto=1` ends with the same result (and numbers) as before, no console errors.'
  ],
  selfcheck: [
    'Grep `start(`: only at the action, guarded by `busy()`, in update logic; list every caller of that action and confirm each reaches it.',
    'Grep `update(`: every fixed step including while busy; the freeze loop calls that step. Same number of RNG calls with and without the check.',
    'Walk one autoplay check: `start` -> 0.24 s still -> needle reaches the `{{autoGrade}}` zone -> 0.65 s hold -> `onDone({grade: \'{{autoGrade}}\'})` -> the old effect, same numbers.'
  ],
  offers: {
    'ui-rects': { title: 'skill-check window', text: '`check.rect()` is the open window (with the grade-word headroom), or null; add it to the other element\'s obstacles / UI rects.' }
  },
  wants: {
    'ui-rects': { title: 'UI rects', text: 'Return them (no `id`) from the bar\'s `getObstacles()`, so the window never covers them.', check: 'The skill-check window never covers the other element\'s plates, windows or HUD.' },
    'battle-start': { title: 'reset', text: 'Call `check.clear()` there.' }
  }
};

// Basket hint for C-04 big-banner: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'ui',
  does: 'Phase, wave and result moments get a big chunky banner ("PLAYER PHASE", "WAVE 2", "STAGE CLEAR", "VICTORY") over a translucent full-width band: in, hold, out in about 1.4 s, coloured per kind (phase, enemy, clear, defeat, warn, info). Banners queue so two never overlap; result banners can stay until the player continues; `busy()` tells the game whether input should wait.',
  params: {
    enter: 'create `params.enter`', exit: 'create `params.exit`', enterMs: 'create `params.enterMs`', holdMs: 'create `params.holdMs`',
    exitMs: 'create `params.exitMs`', stagger: 'create `params.stagger` (drop only)', size: 'create `params.size`', band: 'create `params.band`',
    position: 'create `params.position`', block: 'create `params.block`', queue: 'create `params.queue`', glint: 'create `params.glint`'
  },
  steps: [
    ['Once, after the screen size and HUD layout exist',
      '`banner = GameDNA_BigBanner.create({bounds, getObstacles, params: {enter: \'{{enter}}\', exit: \'{{exit}}\', enterMs: {{enterMs}}, holdMs: {{holdMs}}, exitMs: {{exitMs}}, size: {{size}}, band: {{band}}, position: \'{{position}}\', block: \'{{block}}\', queue: \'{{queue}}\'}})`. `bounds` = play field `{x, y, w, h}` with the HUD excluded; `getObstacles()` returns HUD windows, menus and captions as rects WITHOUT `id` (never covered).'],
    ['Every place in update logic where a phase, turn, wave, round, stage, victory or defeat starts (grep the state assignments)',
      'Once per moment: `banner.show(text, {kind, sub})`, kind `phase` (player), `enemy`, `info` (wave/round), `warn`, `clear` (stage clear, victory), `defeat`. Results that wait for a key: `hold: 0` (sticky) with the game\'s own "press" hint as `sub`. Prefer the game\'s own words ("YOUR PHASE", its result lines). Never call it from the draw pass.'],
    ['Your fixed update step (the one the animation loop, the `?t=&freeze=1` fast-forward and autoplay all call)', '`banner.update(1000 / 60)` (or your step length in ms).'],
    ['Your draw pass', '`banner.draw(ctx)` last, after the HUD, outside any shake translate. Remove the call that drew the game\'s old text for these moments; keep the helper.'],
    ['New game / restart', '`banner.clear()` first, before the new game\'s first `show()`. On continue from a sticky result on the same screen: `banner.dismiss()`.']
  ],
  gotchas: [
    'The banner restarts or flickers -> `show()` runs every frame or from the draw pass; call it once at the state change.',
    'No banner in `?t=&freeze=1` shots -> `update()` runs only in the animation loop; put it in the shared fixed step.',
    'Old text and the banner both visible -> remove the old draw call for these moments.',
    'Banner over the HUD or a menu -> `bounds` ends above the HUD; menus and captions come from `getObstacles()` without `id`.',
    'Game stuck on the result screen -> never gate the continue/restart key on `busy()`; results use `hold: 0` (busy is false while a sticky banner holds).',
    'Autoplay ends differently from before -> phase lengths or autoplay timing changed; keep them, and gate on `busy()` (optional) only where player input and autoplay both pass.',
    'After restart the old result banner is still up -> `clear()` at the start of the new game.',
    'The game already has a `banner` function or variable -> name the instance differently (e.g. `bigBanner`); never rename the host\'s.'
  ],
  checks: [
    'Each phase/wave start shows one big banner across the field, clear of the HUD: in, hold, out; two moments at once play one after the other.',
    'Victory/defeat banners stay until the player continues; continue and restart work with the same keys as before.',
    '`?t=<ms>&freeze=1` gives the same banner frame every time; `?auto=1` ends with the same result as before and no console errors.'
  ],
  selfcheck: [
    'Grep `show(`: all in update logic at state changes, none in draw code. Grep `update(`: inside the fixed step the freeze loop also calls.',
    'Walk one phase change and one restart: `show` -> `update` steps -> gone after enter + hold + exit; restart -> `clear()` -> first banner.'
  ],
  // Starter basket (FORMAT v1.2): plugs into a system starter's extension points ({{sys.*}}).
  addon: {
    builtin: 'banner',
    steps: [
      ['Create', 'In the addon object, create `banner` once: `GameDNA_BigBanner.create({bounds, getObstacles, params: {enter: \'{{enter}}\', exit: \'{{exit}}\', enterMs: {{enterMs}}, holdMs: {{holdMs}}, exitMs: {{exitMs}}, size: {{size}}, band: {{band}}, position: \'{{position}}\', block: \'{{block}}\', queue: \'{{queue}}\'}})`; `bounds` is {{sys.field}}; `getObstacles()` returns every UI rect (no `id`) from {{sys.rects}}.'],
      ['Moments', '{{with.moments}}'],
      ['Clock', '{{sys.clock}}. {{with.clock}}'],
      ['Draw', '{{sys.draw}}: `banner.draw(<that context>)`, after the HUD. {{with.builtin}}'],
      ['Reset', '{{sys.reset}}: `banner.clear()` first']
    ],
    gotchas: [
      'Two banners per phase -> the starter\'s own banner is still drawn; turn it off.',
      'Banners missing in `?t=&freeze=1` shots -> advance only in `update`.'
    ],
    checks: ['Each phase/turn start and the result show one big banner; they never overlap and never cover the HUD.'],
    selfcheck: ['Trace one phase change: starter event -> `banner.show` -> `update` -> `draw`; the built-in banner is off.'],
    with: {
      'grid-range-path': {
        moments: 'In `onPhase(phase)`: `player` -> `show(\'PLAYER PHASE\', {kind: \'phase\', sub: \'TURN \' + game.turn})`, `enemy` -> `show(\'ENEMY PHASE\', {kind: \'enemy\'})`, `over` -> `show(<the starter\'s result text>, {kind: <VICTORY ? \'clear\' : \'defeat\'>, hold: 0})`.',
        clock: 'In `update(game, {dt, frozen})`: `banner.update(dt * 1000)` (dt is in seconds; keep it running while frozen by hit-stop so phase banners are not held up).',
        builtin: 'The starter draws its own phase banner from `S.banner` and the result banner when the phase is over; stop drawing them (keep `S.banner` itself: input and autoplay wait on it).'
      },
      'active-time-battle': {
        moments: 'At battle start `show(\'BATTLE START\', {kind: \'info\'})`; on the battle result `show(<WIN ? \'VICTORY\' : \'DEFEAT\'>, {kind: <\'clear\' | \'defeat\'>, hold: 0})`; `clear()` when the next battle begins.',
        clock: 'In `update(game, info)`: `banner.update(info.dt)`.',
        builtin: 'The starter\'s small spell-name banner is a different element (action caption); keep it.'
      }
    }
  },
  offers: {
    'ui-rects': { title: 'banner band', text: '`banner.rect()` is the band on screen (or null); add it to the other element\'s obstacles / UI rects.' }
  },
  wants: {
    'battle-start': { title: 'reset', text: 'Call `banner.clear()` there, before the first banner of the new battle or game.' }
  }
};

// Basket hint for A-03 combat-forecast: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'ui',
  does: 'While the player is choosing whom to attack (before confirming), a two-sided window shows the GAME\'S OWN forecast: both units\' HP now -> after, damage, hit and critical chances (rows only when the game has them), the counter (or `--` when the target cannot strike back), an x2 badge for double strikes and up/down arrows for weapon or type advantage, in team colours. It updates live when the target or weapon changes and is placed so it never covers the two units, the cursor or the HUD. The module never computes rules: the game supplies every number.',
  params: {
    open: 'create `params.open` (frames, 0 = instant)', slide: 'create `params.slide` (ms)', place: 'create `params.place`', rows: 'create `params.rows`',
    bars: 'create `params.bars`', blink: 'create `params.blink` (ms, 0 = steady)', sides: 'create `params.sides`', margin: 'create `params.margin` (px)'
  },
  steps: [
    ['Once, at boot, after the canvas and your units exist (before the first update and before any fast-forward for screenshots)',
      '`fc = GameDNA_CombatForecast.create({view: {x: 0, y: 0, w: <native width>, h: <height above the HUD>}, getObstacles, getCursor, params: {open: {{open}}, slide: {{slide}}, place: \'{{place}}\', rows: \'{{rows}}\', bars: \'{{bars}}\', blink: {{blink}}, sides: \'{{sides}}\', margin: {{margin}}}})`. `getObstacles()` returns, in SCREEN pixels after the camera offset, each living unit\'s drawn box `{x, y, w, h, id}` plus HUD panels and other windows `{x, y, w, h}` (no id); it always returns an array. `getCursor()` returns the map cursor\'s rect, or `null` when it is hidden.'],
    ['Your existing attack preview / target choice: find where your game knows "this unit would attack that unit" before the confirm (target picker, cursor over an enemy in attack range, the attack menu)',
      'In your fixed step, every step: when that state is on, `fc.show(att, def, data)`, else `fc.hide()`. `att` / `def` = `{id, name, team: \'a\' (player) | \'b\' (enemy) | \'n\', hp, max, rect: <drawn box, screen px>, weapon?}`. `data` is computed by YOUR rules, the same functions your attack uses: `{dmg (number or [min, max]), hit, crit (omit what your game lacks), hits (2 = strikes twice), adv (1 / 0 / -1), counter: {dmg, hit, crit, hits} or null when the target cannot strike back}`. Never invent a formula your game does not have.'],
    ['Your fixed update step (every scene)', '`fc.update(1000 / 60)` once per step, after the `show`/`hide` above.'],
    ['Your draw pass', '`fc.draw(ctx)` after the map, units and HUD, before full-screen banners, outside any screen-shake translate. If your game already draws a forecast / preview box, delete only its drawing (keep the numbers it computed: they become `data`).'],
    ['Anything else that places windows or pop-ups', 'Give them `fc.rect()` (the open window, or `null`) as a rect to avoid.']
  ],
  gotchas: [
    'The window shows `--` everywhere -> `data` is missing; pass your numbers (or a `forecast` callback in `create`).',
    'The window flickers open/closed -> `show` is called from one place and `hide` from another in the same step; decide once per step.',
    'The window covers the target or the cursor -> the unit `rect`s or `getCursor()` are in world instead of screen pixels, or missing.',
    'Numbers disagree with the result -> `data` was computed by a new formula; call the game\'s own damage / hit code.',
    'The window opens at full size only in screenshots, or is a thin bar -> `show` is called only from the render; call it in the fixed step.',
    'Autoplay or `?t=&freeze=1` broke -> the integration changed the target-choice code path; only add calls next to it.'
  ],
  checks: [
    'Aiming at an enemy shows the window before the confirm: both names in team colours, HP now -> after, damage (x2 when it strikes twice), hit and crit when the game has them, the counter or `--`.',
    'Moving to another target or switching weapons updates the numbers at once (changed values flash); confirming or cancelling closes it.',
    'It never covers the attacker, the target, the cursor or the HUD; with the two units at a screen edge it moves to the other side.',
    'Autoplay (`?auto=1` or the game\'s own) reaches the same end as before; `?t=...&freeze=1` shots show a settled window.'
  ],
  selfcheck: [
    'Name the state that means "aiming before confirm" and show the one place that calls `show` / `hide` each step.',
    'Walk one preview by hand: the numbers in `data` equal what your attack code will apply for that pair (or its min/max range).',
    '`fc.update` once per step, `fc.draw` once per frame after the HUD; the old preview drawing is gone, its numbers kept.'
  ],
  // Starter basket (FORMAT v1.2): how this addon plugs into a system starter's extension points ({{sys.*}}).
  addon: {
    builtin: 'forecast',
    steps: [
      ['Create', 'In the ADDONS slot, create `fc` once: `GameDNA_CombatForecast.create({view: {{with.view}}, getObstacles, params: {open: {{open}}, slide: {{slide}}, place: \'{{place}}\', rows: \'{{rows}}\', bars: \'{{bars}}\', blink: {{blink}}, sides: \'{{sides}}\', margin: {{margin}}}})`. {{sys.anchor}}; `getObstacles()` returns each living unit\'s box `{x, y, w, h, id}` plus {{with.hud}}.'],
      ['Forecast state', '{{with.state}}'],
      ['Clock', '{{sys.clock}}. {{with.clock}}'],
      ['Draw (instead of the built-in forecast window)', '{{with.draw}}']
    ],
    gotchas: [
      'Two forecast windows -> the built-in one still draws; turn it off with the starter\'s flag.',
      'The window is missing in `?t=&freeze=1&script=attack` shots -> `show` runs only in the draw; call it from the addon `update` too.',
      'The window shows numbers the attack does not apply -> `data` must call the starter\'s own damage and range rules.'
    ],
    checks: ['The attack target picker shows the forecast window (both sides, HP now -> after, DMG, counter or `--`), it updates when the target changes, and it never covers the two units, the turn plate or the cursor.'],
    selfcheck: ['Trace one attack: Attack command -> target picker opens -> addon `update` calls `fc.show(...)` -> addon `drawUI` calls `fc.draw` -> confirm closes it (`fc.hide`).'],
    with: {
      'grid-range-path': {
        view: '{x: 0, y: 0, w: 240, h: 160}',
        hud: 'the turn plate `HUD_TURN`',
        state: 'While the Attack target picker is open, `game.targeting()` returns `{attacker, target, list, index}` (unit ids), else `null`. Describe a unit with `const u = game.units.find(v => v.id === id), a = game.anchorOf(id, {home: true})` -> `{id, name: u.name, team: u.side, hp: u.hp, max: u.max, rect: {x: a.left, y: a.top, w: a.w, h: a.h + 3}}` (the +3 keeps its HP bar clear). Numbers come from the starter\'s own rules through `const f = game.forecastData(T.attacker, T.target)` -> `{dmg, hit, crit, hits, counter: {dmg, ...} | null}`; pass `data = {dmg: f.dmg, counter: f.counter ? {dmg: f.counter.dmg} : null}` (the starter has no hit or crit; leave them out).',
        clock: 'In `update(game, {dt})`: `const T = game.targeting()`; if `T` call `fc.show(attacker, target, data)`, else `fc.hide()`; then `fc.update(dt * 1000)` (dt is in seconds; the picker is never open during hit-stop). Report the window with `game.setUIRect(\'forecast\', fc.rect())` so `game.uiRects()` and the grid windows avoid it.',
        draw: 'Set `game.builtinForecast = false` in the ADDONS slot and draw in the addon `drawUI(ctx, game)` hook (the top UI layer, after the HUD plate and the grid windows, before banners): `fc.draw(ctx)`. The starter keeps drawing its red target brackets. Do not edit the starter outside the slot.'
      }
    }
  },
  offers: {
    'ui-rects': { title: 'forecast window', text: '`fc.rect()` is the open forecast window `{x, y, w, h}` or `null`; add it to the other element\'s UI rects so pop-ups never land on it.' }
  },
  wants: {
    'ui-rects': { title: 'UI rects', text: 'Add them (no `id`) to `getObstacles()` so the forecast window avoids them.' },
    'anchor': { title: 'unit positions', text: 'Use the same drawn sprite boxes for the `rect` of `att` / `def` and the ids in `getObstacles()`.' }
  }
};

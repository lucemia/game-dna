// Basket hint for E-01 damage-numbers: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'effects',
  does: 'On the frame a hit lands, the amount pops above the target; digits bounce one after another, hold, fade. Damage, critical, heal (`+182`), miss, MP (`12 MP`) and status words each have their own look; numbers never overlap each other or sprites. Optional hit-stop freezes the world briefly; criticals also shake and flash.',
  params: {
    bounce: 'create `params.bounce`', duration: 'create `params.duration`', stagger: 'create `params.stagger`',
    hitstop: 'create `params.hitstop` (0 = off)', scale: 'create `params.scale`', scheme: 'create `params.scheme`',
    crit: 'create `params.crit`', stack: 'create `params.stack`', outline: 'create `params.outline`'
  },
  steps: [
    ['Once, after your actors and the play-field size exist',
      '`dn = GameDNA_DamageNumbers.create({bounds, params: {bounce: {{bounce}}, duration: {{duration}}, stagger: {{stagger}}, hitstop: {{hitstop}}, scale: {{scale}}, scheme: \'{{scheme}}\', crit: \'{{crit}}\', stack: \'{{stack}}\', outline: {{outline}}}, getAnchor, getObstacles, onHitStop, onShake, onFlash})`. `bounds` = play field above the HUD, `{x, y, w, h}`. `getAnchor(id)` -> `{x, top, w, h}`: sprite centre x, sprite top (with hover), size; keep returning it while the unit is dying or dead (never `null` for HP 0: the module caches it, so killing-blow numbers stay above the unit); a lunging attacker returns its home spot. `getObstacles()` -> each living actor\'s sprite rect with `id` (also at its home spot if it moves) plus UI rects without `id`. `onHitStop(ms)` freezes your world; `onShake` / `onFlash` call your shake/flash or do nothing.'],
    ['Every place your game changes HP, MP or status (attacks, spells, items, drains, counters, poison ticks); ideally one shared function. Grep every write to HP and MP',
      'Right after each change: `dn.spawn(target.id, amount, kind)` with `amount` = the HP/MP actually lost or gained after clamping (an overkill shows the real drop), kind `damage | crit | heal | miss | mp | status` (status: `amount` is the word). Exactly once per change.'],
    ['Your fixed update step',
      'During the freeze: count it down, `dn.update(0)`, skip the world. Otherwise `dn.update(1000 / 60)`.'],
    ['Your draw pass',
      '`dn.draw(ctx)` after actors and hit effects, before banner and HUD, inside any shake translate.'],
    ['Where a battle, wave or scene STARTS, before anything spawns there (refills, heals)', '`dn.clear()` (numbers spawned since the last `update` survive it).']
  ],
  gotchas: [
    'The number appears a few frames after the strike -> spawn at the impact, not when the attack starts or ends.',
    'Numbers freeze, then jump after a hit-stop -> pass `0` to `update` during the freeze and the real step otherwise.',
    'Numbers under the HUD or banner -> `bounds` ends above the HUD; banners are obstacles.',
    'Every hit shows two numbers -> `spawn` is called in the hit function and its caller.',
    'MP drains or item heals show nothing -> that change bypasses the hit function; spawn there too.',
    'Heals read "155+" -> pass kind `heal` and the plain amount; the module formats.',
    'Killing-blow numbers missing or at the field centre -> `getAnchor` returned `null` for a dead unit; keep returning its spot.',
    'Wave-clear refill numbers vanish at once -> `dn.clear()` ran after the refill spawns; call it at the start of the wave.'
  ],
  checks: [
    'A hit shows a white number above the target on the hit frame; digits pop in turn, bounce, hold, fade.',
    'Criticals (if any) gold with `CRITICAL`, flash, shake; heals green `+n`; `MISS`; `12 MP`; status words.',
    'Numbers never touch each other, sprites, banner or HUD; crowded multi-hits fold into one total.'
  ],
  selfcheck: [
    'List every HP/MP write and its `spawn`. Walk one hit: `dn.spawn` -> `onHitStop` sets the freeze -> `dn.update(0)` steps -> normal steps; `dn.draw` every frame.',
    'Identifiers inside `getAnchor`/`getObstacles` exist at the first spawn.'
  ],
  // Starter basket (FORMAT v1.2): how this addon plugs into a system starter's extension points ({{sys.*}}).
  addon: {
    builtin: 'numbers',
    steps: [
      ['Create', 'In the addon object, create `dn` once: `GameDNA_DamageNumbers.create({bounds, params: {bounce: {{bounce}}, duration: {{duration}}, stagger: {{stagger}}, hitstop: {{hitstop}}, scale: {{scale}}, scheme: \'{{scheme}}\', crit: \'{{crit}}\', stack: \'{{stack}}\', outline: {{outline}}}, getAnchor, getObstacles, onHitStop, onShake, onFlash})`. {{with.feedback}}'],
      ['Anchors and obstacles', '{{sys.anchor}}. `getAnchor(id)` returns that home anchor `{x, top, w, h}`, so a lunging attacker\'s numbers stay put; `getObstacles()` returns each living actor\'s box `{x: x - w / 2, y: top, w, h, id}` plus every UI rect (without `id`) from {{sys.rects}}; `bounds` is {{sys.field}}'],
      ['Hit', '{{sys.hit}}. Call `dn.spawn(ev.target, amount, kind)` once per event: {{with.hitMap}}'],
      ['Clock', '{{sys.clock}}. {{with.clock}}'],
      ['Draw', '{{sys.draw}}: `dn.draw(<that context>)`'],
      ['Reset', '{{sys.reset}}: `dn.clear()` first, before anything spawns there']
    ],
    gotchas: [
      'Two numbers per hit -> the built-in numbers are still on.',
      'Numbers missing in `?t=&freeze=1` shots -> they advanced on real time; advance only in `update`.',
      'Numbers drift during a freeze -> `dn.update(0)` while the world is frozen.'
    ],
    checks: [
      'Every hit shows one bouncing number above its target on the hit frame (heals green `+n`, statuses as words, criticals gold with `CRITICAL`, where the game has them); numbers never touch each other, sprites or UI rects.'
    ],
    selfcheck: [
      'Trace one hit: hit site -> `onHit` -> `dn.spawn` -> `update` -> `draw`; the built-in numbers flag is off.'
    ],
    with: {
      'active-time-battle': {
        hitMap: '`damage` -> `\'crit\'` if `ev.crit`, else `\'damage\'`; `heal` -> `\'heal\'`; `status` -> `\'status\'` with the word `ev.status.toUpperCase()`; skip every `ev.quiet` event (spell costs) and `guard`.',
        feedback: '`onHitStop: ms => GAME.hitStopMs(ms)`, `onShake: (px, ms) => GAME.shake(px, Math.ceil(ms * 60 / 1000))`, `onFlash: (a, ms) => GAME.flash(\'#ffffff\', Math.ceil(ms * 60 / 1000), a)`.',
        clock: 'In `update(game, info)`: `dn.update(info.dt)`.'
      },
      'four-move-battle': {
        hitMap: '`damage` -> `\'crit\'` if `ev.crit`, else `\'damage\'`; `heal` -> `\'heal\'`; `status` -> `\'status\'` with the word `ev.status.toUpperCase()`; skip `cure`.',
        feedback: '`onHitStop: ms => GAME.hitStopMs(ms)`, `onShake: (px, ms) => GAME.shake(px, Math.ceil(ms * 60 / 1000))`, `onFlash: (a, ms) => GAME.flash(\'#ffffff\', Math.ceil(ms * 60 / 1000), a)`.',
        clock: 'In `update(game, info)`: `dn.update(info.dt)`.'
      },
      'sword-combat': {
        hitMap: 'every event with `ev.amount > 0`: `\'crit\'` if `ev.strength === \'finisher\'`, else `\'damage\'` (the hero\'s id is `\'hero\'`). Pass `{anchor: ev.anchor}` as the 4th argument when the target just died.',
        feedback: '`onHitStop: ms => GAME.hitStopMs(ms)`, `onShake: (px, ms) => GAME.shake(px, Math.ceil(ms * 60 / 1000))`, `onFlash: (a, ms) => GAME.flash(\'#ffffff\', Math.ceil(ms * 60 / 1000), a)`.',
        clock: 'In `update(game, info)`: `dn.update(info.dt)`.'
      },
      'platformer-feel': {
        hitMap: '`kind: \'damage\'` -> `\'damage\'` (thorns, pits, beetles on the hero; a stomp on a beetle), `kind: \'heal\'` -> `\'heal\'` (heart pickups); skip events with `amount === 0`. Pass `{anchor: ev.anchor}` as the 4th argument when `ev.killed` (the beetle is gone from the anchor list).',
        feedback: '`onHitStop: ms => GAME.hitStop(ms)`, `onShake: (px, ms) => GAME.shake(px, ms)`, `onFlash: (a, ms) => GAME.flash(\'#ffffff\', ms)`.',
        clock: 'In `update(game, {dt, frozen})`: `dn.update(frozen ? 0 : dt)` (dt is in ms).'
      },
      'grid-range-path': {
        hitMap: '`attack` and `counter` -> `\'damage\'`; `heal` -> `\'heal\'`.',
        feedback: '`onHitStop: ms => game.hitStop(ms)`, `onShake: (px, ms) => game.shake(px, ms)`, `onFlash: (a, ms) => game.flash(\'#ffffff\', ms)`.',
        clock: 'In `update(game, {dt, frozen})`: `dn.update(frozen ? 0 : dt * 1000)` (dt is in seconds).'
      }
    }
  },
  wants: {
    'hit-site': { title: 'hit sites', text: 'Call `dn.spawn` there, after the HP/MP change, once per change.', check: 'In one full exchange, every hit from both sides shows one number on its hit frame.' },
    'freeze': { title: 'hit-stop', text: '`onHitStop(ms)` starts it; `dn.update(0)` meanwhile.', check: 'Hit-stop freezes everything briefly; the number shows on the first frozen frame.' },
    'ui-rects': { title: 'UI rects', text: 'Return them (no `id`) from `getObstacles()`; `bounds` ends above the HUD.', check: 'No number covers the other element\'s plates, windows or HUD.' },
    'anchor': { title: 'anchors', text: 'Use this for `getAnchor` and the sprite rects in `getObstacles`.' },
    'battle-start': { title: 'reset', text: 'Call `dn.clear()` there, at the start, before refill or heal numbers spawn.' }
  }
};

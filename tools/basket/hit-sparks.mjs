// Basket hint for E-02 hit-sparks: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'effects',
  does: 'On the frame a blow lands, a few frames of impact at the contact point (slash streak, star burst, cross spark or ring shockwave) with pixel sparks that fall under gravity; spells land as palette-cycled fire, ice, thunder or heal bursts; criticals are bigger, flash white for 3 frames and request hit-stop and shake. Seeded and pooled, so frozen screenshots are stable.',
  params: {
    size: 'create `params.size`', life: 'create `params.life` (frames)', sparks: 'create `params.sparks`', gravity: 'create `params.gravity`',
    hitstop: 'create `params.hitstop` (ms, 0 = off)', shake: 'create `params.shake` (px, criticals)', critFlash: 'create `params.critFlash`',
    style: 'create `params.style`', cycle: 'create `params.cycle`', cap: 'create `params.cap`'
  },
  steps: [
    ['Once, after your units and the canvas size exist (before any reset code that calls `clear()` runs)',
      '`fx = GameDNA_HitSparks.create({view: {x: 0, y: 0, w: <field width>, h: <field height above the HUD>}, seed: 1, params: {size: {{size}}, life: {{life}}, sparks: {{sparks}}, gravity: {{gravity}}, hitstop: {{hitstop}}, shake: {{shake}}, critFlash: \'{{critFlash}}\', style: \'{{style}}\', cycle: {{cycle}}, cap: {{cap}}}, getObstacles, uiRects, onHitStop, onShake})`. `getObstacles()` -> each living unit\'s sprite rect `{x, y, w, h, id}` in the same (world) coordinates as hit points; `uiRects()` -> HUD, banner and menu rects in screen px; `onHitStop(ms)` freezes your world; `onShake(px, ms)` shakes the field or does nothing.'],
    ['Every place a strike lands (melee overlap, projectile contact, enemy attacks, contact damage): where the hit is ACCEPTED, after cooldown / invulnerability checks, on the frame HP changes',
      '`fx.hit(x, y, {dir: <attacker facing 1 | -1>, crit: <real critical?>, target: <unit id>, from: <attacker id>})` once, with `(x, y)` on the target\'s body on the side the blow came from (overlap centre of hitbox and target).'],
    ['Every spell, item or heal that lands',
      '`fx.burst(cx, cy, \'fire\' | \'ice\' | \'thunder\' | \'heal\', {target, from})` at the target\'s body centre (closest element); if it also damages, add `fx.hit(cx, cy, {kind: \'spark\', element, target})`.'],
    ['Your fixed update step (the one `?t=` fast-forward also runs)',
      'While the hit-stop freeze counts down: `fx.update(0)` and skip the world step only (not input already latched, not title or result screens). Otherwise `fx.update(1000 / 60)`.'],
    ['Your draw pass', '`fx.draw(ctx, -cameraX, -cameraY)` after sprites and existing effects, before banners and HUD, inside any shake translate (`0, 0` without a camera).'],
    ['Where a battle, level, life or run STARTS', '`fx.clear()`.']
  ],
  gotchas: [
    'Dozens of effects per swing -> the call sits in a per-frame overlap test; call it where the hit is accepted (after the cooldown check).',
    'Effects missing in `?t=&freeze=1` shots -> `update` runs only in the rAF loop; call it from the fixed step.',
    'Sparks freeze then jump, or keep flying through the hit-stop -> `update(0)` while frozen, the real step otherwise.',
    'Effects slide with the camera -> hit points and obstacles in world space, camera offset passed to `draw`.',
    'Melee sparks shrink to a dot -> the attacker counts as a neighbour; pass `from: attacker.id`.',
    'Effects over the HUD -> pass HUD/banner rects in `uiRects` and end `view` above the HUD.',
    'Autoplay ends differently -> the freeze must not run on title/result screens or drop latched input.'
  ],
  checks: [
    'A melee hit shows a slash or star with sparks at the contact point on the hit frame, gone within a quarter second; spells show their burst (flames, ice shatter, bolt from above, green motes).',
    'Criticals (if the game has them) are bigger, flash white for a few frames, freeze briefly and shake; effects never cover the HUD or a neighbouring unit.'
  ],
  selfcheck: [
    'List every damage/heal site and its one `fx.hit` / `fx.burst`; trace one critical: `hit` -> `onHitStop` -> `update(0)` frames -> normal frames; `draw` every frame including the single `?freeze=1` frame.',
    'Identifiers in `getObstacles`, `uiRects` and the callbacks exist when first called; `fx.clear()` runs at scene start.'
  ],
  // Starter basket (FORMAT v1.2): how this addon plugs into a system starter's extension points ({{sys.*}}).
  addon: {
    builtin: 'sparks',
    steps: [
      ['Create', 'In the addon object, create `fx` once: `GameDNA_HitSparks.create({view: <{{sys.field}}>, seed: 1, params: {size: {{size}}, life: {{life}}, sparks: {{sparks}}, gravity: {{gravity}}, hitstop: {{hitstop}}, shake: {{shake}}, critFlash: \'{{critFlash}}\', style: \'{{style}}\', cycle: {{cycle}}, cap: {{cap}}}, getObstacles, uiRects, onHitStop, onShake})`. {{with.feedback}}'],
      ['Anchors and obstacles', '{{sys.anchor}}. `getObstacles()` returns each living unit\'s box `{x, y, w, h, id}` in the same coordinates as the hit points; `uiRects()` returns {{sys.rects}}.'],
      ['Hit', '{{sys.hit}}. {{with.hitMap}}'],
      ['Clock', '{{sys.clock}}. {{with.clock}}'],
      ['Draw', '{{sys.draw}}: {{with.draw}}'],
      ['Reset', '{{sys.reset}}: `fx.clear()`']
    ],
    gotchas: [
      'Effects missing in `?t=&freeze=1` shots -> they advanced on real time; advance only in `update`.',
      'Double shake on criticals -> the starter already shakes on hits; keep one of the two (`shake: 0` here, or the starter flag off).'
    ],
    checks: ['Every hit shows one impact at its target on the hit frame (spells their burst, criticals bigger with a white flash); nothing covers UI rects.'],
    selfcheck: ['Trace one hit: hit site -> `fx.hit` / `fx.burst` -> `update` -> `draw`.'],
    with: {
      'active-time-battle': {
        hitMap: 'For each `damage` event: `const a = GAME.anchor(ev.target)`; `fx.hit(a.x, a.top + a.h / 2, {crit: !!ev.crit, target: ev.target})`; `heal` -> `fx.burst(a.x, a.top + a.h / 2, \'heal\', {target: ev.target})`; skip `ev.quiet` events, `status` and `guard`.',
        feedback: '`onHitStop: ms => GAME.hitStopMs(ms)`, `onShake: (px, ms) => GAME.shake(px, Math.ceil(ms * 60 / 1000))`; set `hitstop: 0` if the starter already freezes on hits.',
        clock: 'In `update(game, info)`: `fx.update(info.dt)`.',
        draw: 'when `layer === \'fx\'`, `fx.draw(g)`'
      },
      'grid-range-path': {
        hitMap: '`attack` and `counter` -> `fx.hit(<target tile centre in world px>, {dir: <attacker left/right of target ? 1 : -1>, target, from: attacker})`; `heal` -> `fx.burst(<centre>, \'heal\', {target})`.',
        feedback: '`onHitStop: ms => game.hitStop(ms)`, `onShake: (px, ms) => game.shake(px, ms)`.',
        clock: 'In `update(game, {dt, frozen})`: `fx.update(frozen ? 0 : dt * 1000)` (dt is in seconds).',
        draw: '`fx.draw(g, -cam.x, -cam.y)` in the effects slot'
      }
    }
  },
  offers: {
    'freeze': 'Every hit calls `onHitStop(ms)` (doubled on criticals): one freeze counter in your game serves all elements.'
  },
  wants: {
    'hit-site': { title: 'hit sites', text: 'Call `fx.hit` (strikes) or `fx.burst` (spells, heals) there, once per landed hit, on the same frame.', check: 'Every landed hit from both sides shows one impact effect at its target on the hit frame.' },
    'freeze': { title: 'hit-stop', text: '`fx.update(0)` while frozen.', check: 'During a hit-stop the impact holds on its first frame.' },
    'ui-rects': { title: 'UI rects', text: 'Return them from `uiRects()` (screen px).', check: 'No spark or burst covers the other element\'s windows, plates or HUD.' },
    'anchor': { title: 'anchors', text: 'Use these positions for burst centres and the unit rects in `getObstacles`.' },
    'battle-start': { title: 'reset', text: 'Call `fx.clear()` there.' }
  }
};

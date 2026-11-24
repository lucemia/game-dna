// Basket hint for E-05 hit-stop-shake: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'effects',
  does: 'On a hit the world holds still for a few frames (hit-stop), the play field shakes by whole pixels in the blow\'s direction and decays, and the struck sprite turns white for a frame or two; a finisher freezes longer, shakes harder and washes the field white under the HUD. Three strengths (light, heavy, finisher) and a reduced-motion mode. The module is a gate at the top of the fixed step, so a frozen step changes nothing and autoplay ends the same way, only later.',
  params: {
    strength: 'create `params.strength` (used when a hit names none)', stop: 'create `params.stop` (frames for a heavy hit; light half, finisher double)',
    shake: 'create `params.shake` (max px, reached by a finisher)', flash: 'create `params.flash`', reduced: 'create `params.reduced`'
  },
  steps: [
    ['Once, after the canvas size exists and before any reset code that calls `clear()` runs',
      '`juice = GameDNA_HitStop.create({view: {x: 0, y: 0, w: <field width>, h: <field height above the HUD>}, seed: 1, params: {strength: \'{{strength}}\', stop: {{stop}}, shake: {{shake}}, flash: \'{{flash}}\', reduced: \'{{reduced}}\'}, uiRects})`. `uiRects()` -> HUD, banner and open menu rects in screen px.'],
    ['The FIRST line of your fixed update step (the one `?t=` fast-forward and `?auto=1` also run), before input is read and before the autopilot picks a move',
      '`if (!juice.step(<step ms>)) return;`. A frozen step must change nothing: no counters, no RNG, no input consumed (presses stay queued for the next real step).'],
    ['Every place a hit is ACCEPTED (after cooldown / invulnerability checks, on the step HP changes): melee, projectiles, spells, enemy and contact damage',
      '`juice.hit({strength: <\'finisher\' for killing blows / criticals, \'heavy\' for strong attacks, \'light\' for chip or rapid hits>, at: {x, y} <contact point, world px>, target: <unit id>, dir: <blow direction 1 | -1>})` once.'],
    ['Your draw pass',
      '`juice.begin(ctx)` before the play field\'s background; wrap each unit\'s sprite draw (only the sprite, not its shadow or bars) as `juice.sprite(ctx, id, spriteRect, () => <existing draw>)`, or pick an existing white sprite with `juice.flashing(id)`; `juice.end(ctx)` after sprites and effects; then `juice.draw(ctx, -cameraX, -cameraY)`; banners and HUD after it. Pair begin/end on every render path.'],
    ['Where a battle, level or run STARTS', '`juice.clear()`.']
  ],
  gotchas: [
    'Autoplay ends differently or misses a jump after a hit -> the gate sits below input reading or the autopilot; it must be the first line of the step.',
    'A key pressed during the freeze is lost -> input was read and cleared before the gate.',
    'Sprites flash but nothing freezes -> `step()` runs only in the rAF loop or not at all; call it in the fixed step.',
    'The world never unfreezes -> the game checks `frozen()` but never calls `step()`.',
    'The HUD shakes too -> draw it after `end()` and `draw()`.',
    'A shadow or HP bar turns white -> `sprite()` wraps more than the sprite image.',
    'The game crawls during a fight -> `hit()` sits in a per-frame overlap loop; call it once where the hit is accepted.'
  ],
  checks: [
    'A heavy hit: the struck sprite is white for 2 frames, the field (not the HUD) is offset by whole pixels, the world holds still for about 6 frames.',
    'A killing blow: a longer freeze, a stronger shake and a brief white wash of the field under the HUD; with `reduced: \'on\'` no shake and one short flash.'
  ],
  selfcheck: [
    '`juice.step` is the first statement of the play step: trace one frozen step and confirm nothing changes game state.',
    'Every damage site calls `juice.hit` exactly once; begin/end are paired on every render path and the HUD is drawn after `end`; `juice.clear()` runs at scene start.',
    'Walk one finisher with the defaults: 12 frozen steps, shake ±4 px decaying over 18 frames, a 2-frame white sprite and a 2-frame screen flash.'
  ],
  // starter baskets (FORMAT v1.2): wiring through a system starter's extension points
  addon: {
    builtin: 'shake',
    steps: [
      ['Create', 'In the addon object, create `juice` once: `GameDNA_HitStop.create({view: <{{sys.field}}>, seed: 1, params: {strength: \'{{strength}}\', stop: {{stop}}, shake: {{shake}}, flash: \'{{flash}}\', reduced: \'{{reduced}}\'}, uiRects: () => <{{sys.rects}}>})`'],
      ['Gate', '{{sys.clock}}. The addon\'s `gate(game)` is `return juice.step(1000 / 60);`: the first thing every play step runs, so a frozen step changes nothing and presses stay latched'],
      ['Hit', '{{sys.hit}}. In `onHit(ev, game)`: `juice.hit({{with.hitArgs}})` once per landed hit{{with.hitSkip}}'],
      ['Draw', '{{with.wrap}}. Banners and the HUD stay after `end`'],
      ['Reset', '{{sys.reset}}: `juice.clear()`']
    ],
    gotchas: [
      'Two freezes or a double shake per hit -> the starter\'s built-in hit-stop / shake is still on.',
      'Nothing freezes -> `gate` does not return `juice.step(...)`, or the addon was pushed after boot.',
      'The HUD shakes or turns white -> it is drawn before `end`, or `uiRects` misses it.'
    ],
    checks: [
      'A landed hit holds the world for a few frames, shakes the field by whole pixels and flashes the struck sprite white; a killing blow freezes longer and washes the field under the HUD.'
    ],
    selfcheck: [
      'Trace one hit: hit site -> `onHit` -> `juice.hit` -> `gate` returns false for the frozen steps -> `begin` / `sprite` / `end` / `draw`; the built-in shake flag is off.'
    ],
    with: {
      'sword-combat': {
        hitArgs: '{strength: ev.strength, at: ev.at, target: ev.target, dir: ev.dir.x < 0 ? -1 : 1}',
        hitSkip: '',
        wrap: '`draw(g, \'begin\')` -> `juice.begin(g)`; `wrapSprite(g, id, rect, drawFn)` -> `juice.sprite(g, id, rect, drawFn)`; `draw(g, \'end\')` -> `juice.end(g); juice.draw(g, 0, 0)`'
      },
      'platformer-feel': {
        hitArgs: '{strength: ev.killed ? \'finisher\' : \'heavy\', at: {x: ev.anchor.x + GAME.cam.x, y: ev.anchor.top + GAME.cam.y}, target: ev.target, dir: ev.dir || 1}',
        hitSkip: '; skip `kind: \'heal\'` (heart pickups)',
        wrap: '`drawBegin(ctx)` -> `juice.begin(ctx)`; `sprite(ctx, id, rect, next)` -> `juice.sprite(ctx, id, rect, next)`; `drawEnd(ctx)` -> `juice.end(ctx); juice.draw(ctx, -GAME.cam.x, -GAME.cam.y)`'
      }
    }
  },
  offers: {
    'freeze': 'Route every other hit-stop request here: `onHitStop: ms => juice.freeze(ms)` and `onShake: (px, ms) => juice.shake(px, ms)`. Then ONE gate (`juice.step`) freezes the world for every element; do not add a second freeze counter.'
  },
  wants: {
    'hit-site': { title: 'hit sites', text: 'Call `juice.hit({strength, at, target, dir})` there too, once per landed hit, on the same step.', check: 'Every landed hit freezes the world briefly and flashes its target; killing blows also shake harder and wash the field.' },
    'ui-rects': { title: 'UI rects', text: 'Return them from `uiRects()` (screen px) and draw those windows after `juice.end()` / `juice.draw()`.', check: 'The other element\'s windows, plates and HUD never shake or flash.' },
    'battle-start': { title: 'reset', text: 'Call `juice.clear()` there.' }
  }
};

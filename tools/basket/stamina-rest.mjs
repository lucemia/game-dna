// Basket hint for G-10 stamina-rest (stamina & outpost rest): how to wire the module into an UNKNOWN game, by role.
// Rules layer over the game's own turn or time loop: it never moves units, deals damage or pauses; it answers engage(id)
// before each attack and draws pips, rest effects and site markers. Works on a turn clock and on a real-time clock.
export default {
  stage: 'rules',
  does: 'Squads (or a hero) spend stamina on every march and attack; at zero they are exhausted (attacks refused, or slower) until they recover to recoverAt. Resting inside a camp, outpost or shrine their side holds refills the pips per phase (turn) or per second (real-time) with a glow, embers and REST +N; holding an empty or enemy site claims it. Pips above each unit avoid HUD rects and other units; TIRED / TOO TIRED tags, a sweat drop and campfire / banner / shrine markers with a capture ring.',
  params: {
    clock: 'create `clock`', sites: 'the `sites()` list (where and what)', pace: 'create `params.pace` (sets the costs for the clock)', max: 'create `params.max`',
    recoverAt: 'create `params.recoverAt`', capture: 'create `params.capture`'
  },
  steps: [
    ['Once at startup, after the screen size is known',
      '`stamina = GameDNA_StaminaRest.create({clock: \'{{clock}}\', bounds: {x: 0, y: 0, w: SCREEN_W, h: SCREEN_H}, units, sites, camera, tile, uiRects, params: {pace: \'{{pace}}\', max: {{max}}, recoverAt: {{recoverAt}}, capture: \'{{capture}}\'}})` (pace standard for turn games: attack 2, move 1, +1 per phase, +3 resting, no attacks at 0; real-time games: pace camp: 1 per swing, +0.6/s, fires refill, slower swings at 0). Include at least one neutral site (owner null) so captures happen; the module draws REST +N and site labels, add none of your own. `units()` returns every living unit with stamina as `{id, side, x, y, w, h}` = its drawn sprite box (world px, same space as `sites()`); `sites()` returns {{sites}} as `{id, kind: camp|outpost|shrine|fire, x, y, r}` or `{id, kind, x, y, w, h}` with `owner` = the side holding it at the start (or null), placed on reachable ground near the fighting; `camera()` = the scroll offset (omit when nothing scrolls).'],
    ['Every place an attack STARTS: player input, enemy AI, the game\'s autoplay, counter-attacks',
      '`if (!stamina.engage(id)) { <end this unit\'s action as a wait / skip the swing>; }` before any damage; counters: `stamina.engage(id, \'counter\')` and no counter on false. Real-time: `cooldown = base / stamina.speedScale(id)` (1 unless winded).'],
    ['Turn clock only: where a move is committed (not a preview, not an undoable step) and where each side\'s phase begins',
      '`stamina.march(id)` once per committed move; `stamina.turnStart(side)` once where control returns to each side, after its phase banner (rest, regen and captures happen there and are seen). Move range: `stamina.moveRange(id, base)` (smaller only with pace harsh).'],
    ['The AI / autoplay target choice',
      'When `!stamina.canAttack(id)`, move toward `stamina.nearestSite(id)` (`{x, y}` world px) instead of picking a target.'],
    ['Your fixed update step, every scene (also the ?t= fast-forward loop)', '`stamina.update(stepMs)`.'],
    ['Your draw pass', 'Ground -> `stamina.drawSites(ctx)` -> units -> `stamina.draw(ctx)` -> HUD, outside the camera transform (inside it: pass `true` as the second argument).'],
    ['New game / restart', '`stamina.reset()`.']
  ],
  gotchas: [
    '`?auto=1` never ends, TOO TIRED repeating -> a refused attack does nothing and the AI picks it again: end the unit\'s action on false and send it to `nearestSite()`.',
    'Enemies attack while exhausted -> an attack path (AI, counter, autoplay) skips `engage`.',
    'Pips never refill (turn) -> `turnStart(side)` missing for that side.',
    'Stamina lost on an undone move -> `march` sits on the preview path.',
    'Pips drift when the camera scrolls -> `units()` and `sites()` must be world px with `camera()`, or both screen px without it.',
    'Pips over the HUD -> the HUD rect is missing from `uiRects()` (screen px).',
    'Stamina never empties in a real-time game -> use pace camp.',
    'A button-masher can no longer win (real-time) -> use pace camp or standard, not harsh, and slow only the attack cooldown.'
  ],
  checks: [
    'Pips drain on march and attack; at 0 the unit shows TIRED, its next attack is refused (TOO TIRED) or slowed, and the game moves on.',
    'At its phase start (or standing still) inside an owned site the unit refills with glow, embers and REST +N; holding an unowned site claims it (banner and outline change colour).',
    '`?t=&freeze=1` is deterministic and `?auto=1` still ends (the result may change).'
  ],
  selfcheck: [
    'List every attack start (player, AI, autoplay, counter) and its `engage` call with the false path that ends the action.',
    '`update` runs every step in every scene; `turnStart` once per phase per side; `march` only on commit; `units()` boxes are the drawn sprites.'
  ],
  wants: {
    'ui-rects': { title: 'UI rects', text: 'Return the other elements\' windows, banners and HUD from stamina\'s `uiRects()`; stamina strips hide or move off them.', check: 'No stamina strip covers another element\'s window or banner.' },
    'events': { title: 'events', text: 'Use `onExhausted`, `onRest`, `onCapture` to trigger the other element (a toast "Outpost taken", a bark "I need a rest").', check: 'Each capture or rest shows one message, not one per frame.' },
    'battle-start': { title: 'reset', text: 'Call `stamina.reset()` only on a new game, not per wave or map phase.' }
  }
};

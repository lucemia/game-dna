// Basket hint for A-18 on-map-skirmish: how to wire the module into an UNKNOWN game, by role.
// An actor addon: the attack exchange the GAME has already resolved plays on the map, with the game's own unit sprites.
// It never rolls dice or computes damage, so it combines with any turn / tactics system that has a single-target attack step.
// Alternative to A-04 clash-cutin (same family `battle-cutin`): a basket takes one or the other.
export default {
  stage: 'systems',
  does: 'When an attack is confirmed, the two map units fight where they stand: the attacker lunges 2-3 px toward the target (never into its tile), the hit spark lands on the target\'s near side, only the target flashes a solid white silhouette for 2-3 frames, then shows an opaque hurt pose and is knocked back 2 px, the damage number pops above its head clear of other units, a miss swishes past with MISS, the counter and a follow-up for the side 4+ speed faster play, both HP plates sit at the bottom (or top) of the screen and drain slowly, a boss braces in place, a knocked-out unit dissolves. Z skips, X toggles x2. The game passes the outcome; the module only stages it.',
  params: {
    speed: 'create `params.speed` (1 or 2)', lunge: 'create `params.lunge` (px, 2-3)', knock: 'create `params.knock` (px)', flash: 'create `params.flash` (frames, 2-3)',
    drain: 'create `params.drain` (ms)', hold: 'create `params.hold` (ms)', gap: 'create `params.gap` (follow-up speed gap; also `order({gap})`)', standoff: 'create `params.standoff` (px)',
    plates: 'create `params.plates`', text: 'create `params.text`', keys: 'create `params.keys`'
  },
  steps: [
    ['Once, at boot (before any fast-forward for screenshots)',
      '`sk = GameDNA_OnMapSkirmish.create({view: <play area without the HUD>, params: {speed: {{speed}}, lunge: {{lunge}}, knock: {{knock}}, flash: {{flash}}, drain: {{drain}}, hold: {{hold}}, gap: {{gap}}, standoff: {{standoff}}, plates: \'{{plates}}\', text: \'{{text}}\', keys: \'{{keys}}\'}, getObstacles: () => <other units\' sprite boxes {id, x, y, w, h}>, uiRects: () => <HUD rects>})`.'],
    ['Where a single-target attack is confirmed (the code that resolves it and starts its animation)',
      'Resolve the exchange with the game\'s own code, unchanged in order and random calls, recording each strike `{by: \'att\' | \'def\', result: \'hit\' | \'miss\' | \'crit\', dmg}` (`GameDNA_OnMapSkirmish.order({attSpd, defSpd, gap})` if the game has no counter / follow-up order). Put the HP back to the values before, then `sk.play({attacker, defender, strikes, after: {att, def}, onDone})` with each unit `{id, name, team: \'a\' | \'b\', hp (before), max, box (sprite box as drawn), boss?}`. In `onDone`, apply the HP and run what used to run when the attack animation ended. A game with a separate battle screen keeps its menu and turns but draws the map behind it and stages each round there.'],
    ['Where the game draws each unit', '`sk.drawActor(ctx, id, image, x, y, {native: <side the art looks at>, facing: <side outside fights>})` instead of drawImage; skip the unit\'s own fade when `sk.gone(id)`; hide the cursor and the unit\'s small HP bar while `sk.fighting(id)`.'],
    ['Your fixed step, first thing (also in the ?t= replay)', '`if (sk.busy()) { a person\'s keys -> sk.key(k) (never autoplay\'s); sk.update(stepMs); return; }`.'],
    ['Your render, last', '`sk.draw(ctx)` after the HUD, outside any camera transform.'],
    ['Where a new game or battle starts', '`sk.clear()`.']
  ],
  gotchas: [
    'Units stand still and never flash -> the unit draw does not go through `drawActor`.',
    '`?auto=1` ends differently -> the exchange was resolved with extra or reordered random calls; resolve it exactly as the old code did.',
    'Every exchange is skipped at once -> autoplay\'s confirm key reaches `sk.key()`; forward only a person\'s keys.',
    'The bars drain while the map already shows the new HP -> restore HP before `play`, apply `after` in `onDone`.',
    'Numbers land on neighbours or plates cover units -> `getObstacles()` is empty or in another pixel space than `box`.',
    'A knocked-out unit fades twice -> skip the game\'s own fade when `sk.gone(id)`.',
    'Plates slide over the HUD -> `view` includes the HUD; pass the play area and the HUD in `uiRects()`.'
  ],
  checks: [
    'Confirming an attack: the attacker lunges a few px toward its target, the spark sits on the near side, only the target flashes and steps back, the number equals the game\'s and covers no unit.',
    'A miss shows MISS and a swish; the counter and a follow-up play; the plates drain to what the map shows after the exchange; Z skips, X lights x2.',
    '`?auto=1` ends exactly as before; `?t=&freeze=1` stills inside an exchange show it mid-strike.'
  ],
  selfcheck: [
    'For one exchange: HP before minus the strikes\' dmg per target (clamped at 0) equals `after`, which equals what `onDone` applies.',
    'Every unit draw passes through `drawActor`; while `busy()` the step returns early; autoplay inputs are not forwarded.'
  ],
  offers: {},
  wants: {}
};

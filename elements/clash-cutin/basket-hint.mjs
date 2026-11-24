// Basket hint for A-04 clash-cutin: how to wire the module into an UNKNOWN game, by role.
// A scene addon: it takes over the screen for one attack exchange that the GAME has already resolved, then hands control back.
// It never rolls dice or computes damage, so it combines with any turn / tactics system that has a single-target attack step.
export default {
  stage: 'systems',
  does: 'When an attack is confirmed, the game cuts to a staged side-view scene: a band opens over the map onto a code-drawn backdrop for the defender\'s terrain (plains, forest, marsh, desert, ruins), both units stand on a ground strip facing each other, the attacker leaps in and swings (or shoots an arrow, or casts an orb), hits freeze with sparks, a shake, a damage number and a draining HP bar, misses are dodged, criticals gleam and flash, the counter and follow-ups play, a fallen unit fades, then the band closes. Z skips, X toggles x2. The game passes the outcome; the module only stages it, so the scene always equals the game\'s numbers.',
  params: {
    speed: 'create `params.speed` (1 or 2)', sides: 'create `params.sides`', intro: 'create `params.intro`', introMs: 'create `params.introMs` (ms)', drain: 'create `params.drain` (ms)',
    stop: 'create `params.stop` (frames)', shake: 'create `params.shake` (px)', hold: 'create `params.hold` (ms)', backdrop: 'create `params.backdrop`', keys: 'create `params.keys`'
  },
  steps: [
    ['Once, at boot (before any fast-forward for screenshots)',
      '`clash = GameDNA_ClashCutin.create({view: {x: 0, y: 0, w: <native width>, h: <native height>}, params: {speed: {{speed}}, sides: \'{{sides}}\', intro: \'{{intro}}\', introMs: {{introMs}}, drain: {{drain}}, stop: {{stop}}, shake: {{shake}}, hold: {{hold}}, backdrop: \'{{backdrop}}\', keys: \'{{keys}}\'}})`.'],
    ['Where a single-target attack is confirmed (the code that resolves it and starts its animation)',
      'Resolve the exchange with the game\'s own code, unchanged in order and random calls, recording each strike `{by: \'att\' | \'def\', result: \'hit\' | \'miss\' | \'crit\', dmg}` (let the damage function return its number). Put the HP back to the values before, then `clash.play({attacker, defender, strikes, after: {att, def}, terrain, onDone})` with each unit `{id, name, team: \'a\' | \'b\', hp (before), max, x (map column), art (its sprite), facing (the side the ART looks at), kind: \'melee\' | \'ranged\' | \'magic\', weapon?}`; art with gear on one side and no mirror: `art: {left, right}`. In `onDone`, apply `after` and run what used to run when the attack animation ended.'],
    ['Your fixed step, first thing (also in the ?t= replay)', '`if (clash.busy()) { keys -> clash.key(k), taps -> clash.tap(x, y) (native px); clash.update(stepMs); return; }`. Nothing else runs while busy. Also `clash.update(stepMs)` in normal steps.'],
    ['Your render, last', '`clash.draw(ctx)` after the HUD, outside any camera or shake transform.'],
    ['Where a new game or battle starts', '`clash.clear()`.']
  ],
  gotchas: [
    '`?auto=1` ends differently -> the exchange was resolved with extra or reordered random calls; resolve it exactly as the old code did.',
    'The enemy phase or autoplay keeps acting under the scene -> the step does not return early while `busy()`.',
    'The bars drain twice or the map shows the new HP while the band opens -> restore HP before `play`, apply `after` in `onDone`.',
    'Fighters look away from each other -> `facing` must be the side the sprite ART looks at, not where the unit looks on the map.',
    'Sword and shield swap hands -> pass painted `art: {left, right}` and `mirror: \'never\'` instead of letting it mirror.',
    'A different number on screen than the game applied -> `dmg` taken after clamping or from a second roll; pass the number the damage code returned.',
    'Area spells, heals and items open a one-target scene -> stage single-target attacks only.'
  ],
  checks: [
    'Confirming an attack opens the scene: both units face each other, the strike plays, the number and the HP the bars drain to equal what the map shows after it closes.',
    'Misses dodge, criticals flash, a unit at 0 fades; Z skips to the end, X lights the x2 badge.',
    '`?auto=1` ends exactly as before; `?t=&freeze=1` stills inside an exchange show the scene mid-strike.'
  ],
  selfcheck: [
    'For one exchange: HP before minus the strikes\' dmg per target (clamped at 0) equals `after`, which equals what `onDone` applies.',
    '`update` runs in the replayed step; `draw` runs after the HUD; while `busy()` the step returns early.'
  ],
  // No offers: other elements' hit sites stay on the map (the scene covers it while busy); use onImpact by hand for sounds.
  offers: {},
  wants: {}
};

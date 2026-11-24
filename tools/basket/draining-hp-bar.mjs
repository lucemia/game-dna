// Basket hint for C-08 draining-hp-bar (draining HP bar): how to wire the module into an UNKNOWN game, by role.
// A UI layer that only watches HP: it never changes game state, never reads input, so it combines with any system and any
// other element. Other elements that change HP (damage numbers, squad clash, stamina) need nothing from it.
export default {
  stage: 'ui',
  does: 'A hit drops the fill at once while a pale loss segment holds where the health was, then drains; quick hits merge into one segment (hold restarts, capped), a heal shows a mint gain segment before the fill rises, low HP pulses. Draws a framed boss bar, party HUD bars and small over-head bars in world space, smooth on HD and crisp on native pixel canvases. It watches the HP the game already keeps.',
  params: {
    hold: 'create `params.hold` (ms)', holdCap: 'create `params.holdCap` (ms)', drain: 'create `params.drain` (bars / s)', ease: 'create `params.ease`',
    gainHold: 'create `params.gainHold` (ms)', fill: 'create `params.fill` (bars / s)', low: 'create `params.low` (fraction)', pulse: 'create `params.pulse`',
    flash: 'create `params.flash`', shake: 'create `params.shake` (px)', theme: 'create `params.theme`', ticks: 'create `params.ticks`', render: 'create `params.render`'
  },
  steps: [
    ['Once at startup, before anything can call it (also before a ?t= fast-forward loop)',
      '`hpBars = GameDNA_DrainingHpBar.create({params: {hold: {{hold}}, holdCap: {{holdCap}}, drain: {{drain}}, ease: \'{{ease}}\', gainHold: {{gainHold}}, low: {{low}}, theme: \'{{theme}}\', render: \'{{render}}\'}})`.'],
    ['Your fixed update step, every scene (title, play, menus, end screens), after the game logic of that step',
      'For every unit that shows an HP bar: `hpBars.set(id, hp, maxHp)` with a stable per-unit id; then `hpBars.update(stepMs)`. Do not hook the damage code: the module sees drops and rises itself.'],
    ['Where units are created or refilled: new game, new battle or wave, respawn, restart, load',
      '`hpBars.reset(id, hp, maxHp)` (no animation). A new unit that reuses an old id must be reset.'],
    ['Where the game draws each HP bar now (keep its HP text, names, frames, MP bars; replace only the bar\'s background and fill rects)',
      '`hpBars.draw(ctx, id, x, y, w, h, opts)` at the same inner rect: boss `{style: \'boss\', label: name}`, player / party HUD `{style: \'party\', team: \'ally\'}`, over-head bars inside the camera transform `{style: \'unit\', team: \'foe\'}` (they hide when full).']
  ],
  gotchas: [
    'The pale segment never drains -> `update()` is not called every step (or only in one scene).',
    'Every hit drains from full, or bars swap between units -> ids are array indexes that shift when a unit dies; use a stable id.',
    'A new wave fills up with a heal animation -> `reset` missing where the wave starts.',
    'No loss segment at all -> `reset` is called every step instead of `set`.',
    'A killing blow shows no loss segment -> the unit (and its bar) stops being drawn when it dies; keep `set` + `draw` for its id while `hpBars.busy(id)` is true.',
    'Over-head bars stay put while the camera scrolls -> they are drawn after the camera transform is undone.',
    'Two bars drawn on top of each other -> the game\'s own fill rect is still drawn.',
    '`?auto=1` ends differently -> game logic reads the module (e.g. `shown(id)`); bars must only read.'
  ],
  checks: [
    'A hit: the fill drops at once, a pale segment holds and drains; three quick hits show one merged segment.',
    'A heal: a mint segment appears before the fill rises; low HP pulses, 0 HP does not.',
    'Over-head bars follow their unit while the camera moves; `?auto=1` ends exactly like before.'
  ],
  selfcheck: [
    'Every drawn id gets `set` every step with a stable id; `reset` at new game / wave / respawn.',
    '`update` runs every fixed step in every scene; `draw` replaces only the old fill and background rects, in the same coordinate space.'
  ],
  wants: {
    'events': { title: 'HP changes', text: 'Nothing to wire: HP changed by another element (damage numbers, squad clash, stamina, level-up growth raising max HP) shows up because `set` reads the HP every step.', check: 'Hits and heals from the other element show loss and gain segments.' },
    'battle-start': { title: 'reset', text: 'Call `hpBars.reset(id, hp, max)` where the other element starts a battle, a clash or a wave, for every unit it creates.', check: 'A new battle starts with full bars, no heal animation.' },
    'ui-rects': { title: 'UI rects', text: 'Other overlays (toasts, banners, damage numbers) should treat the boss bar and party bars as HUD rects: give them the same rects you pass to `draw` (plus ~h + 12 px above a boss bar for its name).', check: 'No toast or number covers the boss or party bars.' }
  }
};

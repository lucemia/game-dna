// Basket hint for G-07 upgrade-draft: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'systems',
  lead: 'Open the upgrade draft exactly: {{when}}.',
  does: 'The roguelite "pick 1 of 3": `open()` at the chosen moment pauses the world and deals upgrade cards (fan-in, flip, rarity glow); the player moves between them and takes one (synergy hints for shared tags, optional reroll and skip), and the pick flies into an owned-upgrades strip. Upgrades are a plain table in the game (`{id, name, rarity, tags, text with {value}, max, delta: {stat: amount}}` or a small `apply(target)`); hands are seeded by the module, rarity-weighted, without duplicates or maxed entries. The module never changes the game itself: picks arrive through the game\'s `applyDelta(stat, amount)`, the table\'s `apply` and `onPick`, synchronously inside `update()`. While `busy()` the world waits and input goes to the draft; autoplay picks by itself (`autoPick`).',
  params: {
    when: 'when the draft opens (shown at the top)',
    seed: 'create `params.seed` (the module\'s own seed; never the game\'s RNG)', choices: 'create `params.choices`', rerolls: 'create `params.rerolls`',
    skip: 'create `params.skip`', wCommon: 'create `params.wCommon`', wRare: 'create `params.wRare`', wEpic: 'create `params.wEpic`',
    maxStacks: 'create `params.maxStacks`', look: 'create `params.look` (auto = pixel cards below 300 px tall)',
    autoPick: 'create `params.autoPick` (`skip` = `?auto=1` ends exactly as before; otherwise autoplay takes a card)',
    strip: 'create `params.strip`', dim: 'create `params.dim`'
  },
  steps: [
    ['Game data, next to the player\'s stats',
      'An upgrade table of 10-16 entries with original neutral-fantasy names: `{id, name, rarity: \'common\'|\'rare\'|\'epic\', tags, text: \'... {value} ...\', max, delta: {<stat field>: amount}}` (about 6 common, 6 rare, 3 epic; tags from `blade fire frost storm guard heart speed gold magic luck poison light crit arrow regen`, shared tags = synergy) and a `fallback` entry (e.g. a heal) for a maxed build. Deltas use only stat fields the game reads; a new stat needs code that reads it.'],
    ['Once, after the screen size and HUD layout exist (one instance for the whole run)',
      '`draft = GameDNA_UpgradeDraft.create({view: {w, h}, upgrades: UPGRADES, fallback: FALLBACK, params: {seed: {{seed}}, choices: {{choices}}, rerolls: {{rerolls}}, skip: \'{{skip}}\', wCommon: {{wCommon}}, wRare: {{wRare}}, wEpic: {{wEpic}}, maxStacks: {{maxStacks}}, look: \'{{look}}\', autoPick: \'{{autoPick}}\', strip: \'{{strip}}\', dim: {{dim}}}, applyDelta: (stat, amount) => <add amount to the field combat reads; for max HP also current HP>, getStat: stat => <that field>, target: () => <player>, statLabels: {<stat>: \'ATK\'}, autoplay: () => <autoplay flag>, uiRects: () => [HUD bars]})`.'],
    ['The ONE place in update logic where the moment happens ({{when}}). Grep every path that reaches it',
      '`draft.open({title: \'LEVEL UP\'})` once per event (two level-ups in one step: call it twice; the module queues). A fixed bonus that used to be given there, and the message announcing it, go; level, XP and heals stay. Code that must wait for the choice moves into `open({onDone: r => ...})`. **With G-02 level-up growth in the same basket**, chain them: keep its results window, and in its `award(..., {onDone: r => ...})` call `draft.open()` once per level gained (`r.units` toLevel - fromLevel), so the tally shows first and the cards follow; or let the draft replace the stat growth (G-02 `minGain: 0` with `{rates: {}}` per class) when every gain should be a choice.'],
    ['Top of your fixed update step (the one the animation loop, the `?t=&freeze=1` fast-forward and autoplay all call), before the world and the autopilot',
      '`if (draft.busy()) { draft.update(1000 / 60); return; }` (keep reading / clearing the game\'s own input first if it buffers taps). When the draft opens or closes, clear only buffered taps; never clear held movement keys; when not busy: `draft.update(1000 / 60)` once per step. Pause / restart keys stay outside the gate.'],
    ['Key handler; pointer handler if the game has one',
      'First line of keydown: `if (draft.key(e.code, true)) { e.preventDefault(); return; }`; keyup: `draft.key(e.code, false)` (it returns false for keys it does not use and for every key when no draft is open). Games that poll an input object instead: `draft.press(\'left\' | \'right\' | \'confirm\' | \'reroll\' | \'skip\')` on key-down edges inside the step. Pointer: while `busy()`, `draft.pointer(x, y, down)` in native px.'],
    ['Your draw pass', 'Hide the game\'s own one-line notice (level-up message, toast) while `draft.busy()`. `draft.draw(ctx)` last, after the HUD and the game\'s own windows, under the same canvas transform as the HUD (HD games that scale for devicePixelRatio: after `setTransform`), outside any shake translate.'],
    ['New game / restart; save and load if the game has them', '`draft.reset()` next to the game\'s reset (the game restores its own base stats); `draft.serialize()` / `draft.restore()` next to the stats in the save.']
  ],
  gotchas: [
    'The card says +2 but combat is unchanged -> `applyDelta` writes a copy or a field nothing reads; write where the formulas read (the console warns when `getStat` disagrees).',
    'A new stat (crit, thorns, magnet, speed) does nothing -> add the code that reads it, or leave that entry out of the table.',
    'A restart keeps the upgrades -> `reset()` at restart, and base stats come from the game\'s start data, not a template `applyDelta` changed.',
    'The world, enemies or the autopilot move under the cards -> gate the whole fixed step on `busy()` before the autopilot.',
    '`?auto=1` hangs on the cards -> pass the autoplay flag as `autoplay` and keep `update` in the fixed step the freeze loop calls.',
    '`?auto=1` ends differently -> the player got stronger; that is allowed if it still ends. `autoPick: skip` keeps the original ending; say which in your notes.',
    'The same hand every time, or maxed upgrades return -> the draft was re-created per event; create it once.',
    'The old fixed-bonus message still shows under the title -> remove it; the draft replaces the bonus.',
    'Cards cover the HUD -> return the HUD bars from `uiRects()`; the cards lay out between them.'
  ],
  checks: [
    '{{when}}: the world pauses, the cards deal in and flip, arrows move the lift, Z takes, R rerolls, X skips; the pick flies into the strip and the game resumes.',
    'The card\'s numbers equal the change in the game\'s own stats and the next fight uses them; a maxed upgrade is never offered again; a restart starts with no upgrades; the cards never cover the HUD.',
    '`?t=<ms>&freeze=1` gives the same frame every time; `?auto=1` still ends (same ending with `autoPick: skip`), no console errors.'
  ],
  selfcheck: [
    'Grep `open(`: once per event, in update logic; list every path to {{when}} and confirm each reaches it. Grep `create(`: once.',
    'Grep `update(`: every fixed step including while busy; the freeze loop calls that step; the busy gate sits before the autopilot. Every delta stat in the table is read somewhere else in the game.',
    'Walk one draft with the defaults: `open()` -> fade 0.24 s -> 3 cards deal 0.09 s apart and flip -> about 1.1 s after `open()` Z takes the lifted card -> `applyDelta` per delta, then `onPick` -> fly 0.8 s -> fade 0.23 s -> `busy()` false -> the game continues as before.'
  ],
  offers: {
    'ui-rects': { title: 'draft overlay', text: '`draft.rect()` is the open draft (the whole field while busy), or null; while it is open other overlays should wait or stay hidden.' }
  },
  wants: {
    'ui-rects': { title: 'UI rects', text: 'Return them from the draft\'s `uiRects()`, so the cards and the strip never cover them.', check: 'The cards and the owned strip never cover the other element\'s windows, plates or HUD.' },
    'battle-start': { title: 'reset', text: 'Do NOT call `draft.reset()` at every battle or level start (the build must carry over); only at a new run.' }
  }
};

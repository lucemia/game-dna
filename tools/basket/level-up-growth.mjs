// Basket hint for G-02 level-up-growth: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'systems',
  lead: 'Award EXP and show the results window exactly: {{when}}.',
  does: 'Experience and levels for the party: `award(exp, gold)` where a fight is won opens a results window (EXP and gold count up, each unit\'s gauge fills and wraps with LV UP!), then a panel per levelled unit lists its stat gains row by row. Growth is a percent chance per stat per level from plain per-class tables, seeded by the module itself, with a guaranteed minimum. Stats change only through the game\'s setter, inside `award()`. While a window is open (`busy()`) the confirm input goes to it and the world waits; `onDone` runs when it closes. Autoplay advances it by itself; growth may change how `?auto=1` ends (it must still end), `autoGrowth: hold` keeps the original ending.',
  params: {
    when: 'when EXP is awarded (shown at the top)',
    base: 'create `params.base` (EXP to reach level 2)', power: 'create `params.power`', maxLevel: 'create `params.maxLevel`',
    minGain: 'create `params.minGain`', seed: 'create `params.seed` (the module\'s own seed; never the game\'s RNG)',
    countMs: 'create `params.countMs`', autoMs: 'create `params.autoMs`', panel: 'create `params.panel`', share: 'create `params.share`',
    autoGrowth: 'create `params.autoGrowth` (`hold` = `?auto=1` ends exactly as before; `apply` = growth also under autoplay)',
    tint: 'create `params.tint`', dim: 'create `params.dim`'
  },
  steps: [
    ['Game data, next to the unit definitions',
      'Growth tables, one plain object per class / role: `{<class>: {rates: {<stat field>: percent 0-100, <big stat>: {rate, amount}}, caps: {...}}}` using the game\'s OWN stat field names (HP amount about 5 % of its start value). EXP and gold per enemy so the first fight or two give a level with `base` {{base}}.'],
    ['Once, after the screen size and HUD layout exist',
      '`lv = GameDNA_LevelUpGrowth.create({bounds, classes, stats: [{key, label}, ...], params: {base: {{base}}, power: {{power}}, maxLevel: {{maxLevel}}, minGain: {{minGain}}, seed: {{seed}}, countMs: {{countMs}}, autoMs: {{autoMs}}, panel: \'{{panel}}\', share: \'{{share}}\', autoGrowth: \'{{autoGrowth}}\', tint: \'{{tint}}\', dim: {{dim}}}, units: () => party.map(u => ({id, name, cls, alive, get: k => <field k>, set: (k, v, gain) => <write v to that field; for max HP also add gain to HP>})), autoplay: () => <autoplay flag>, uiRects: () => [HUD, command panel]})`. The setter writes the object the combat formulas read, never a shared template every new unit copies.'],
    ['The ONE place in update logic where a fight / wave / map is won (where the victory or cleared phase is set). Grep every way to win',
      '`lv.award(exp, gold, {title: \'VICTORY\', onDone: r => { ... }})` once per win. Add the gold to the game\'s purse yourself **inside `onDone`** (`r.gold`), never at the call, or the gold HUD jumps ahead of the count-up. Move what ran next into `onDone` unless it already waits for a key. Per-hit / per-kill EXP: `lv.addExp(id, n)` where damage lands; `lv.award(0, 0, {units: [id]})` shows one unit\'s banked EXP (e.g. after its attack).'],
    ['Top of your fixed update step (the one the animation loop, the `?t=&freeze=1` fast-forward and autoplay all call), before the autopilot runs',
      '`if (lv.busy()) { if (<confirm pressed this step, from the player>) lv.press(); lv.update(1000 / 60); return; }` so the world, the autopilot and the next wave wait; pause/restart keys stay outside the gate. When not busy: `lv.update(1000 / 60)` once per step.'],
    ['Your draw pass and every HUD / status display of unit stats or levels', '`lv.draw(ctx)` last, after the HUD, outside any shake translate; draw the game\'s own victory / cleared banner only when `!lv.busy()`. The HUD prints `lv.shown(id, key)` and `lv.shownLevel(id)` instead of the raw fields (the setter already ran inside `award()`; the shown values change only as the panel reveals each row). Current HP raised with max HP: `hp - (maxHp - lv.shown(id, \'maxHp\'))`.'],
    ['New game / restart; save and load if the game has them', '`lv.reset()` (the game restores its own base stats); `lv.serialize()` / `lv.restore()` next to the stats in the save.']
  ],
  gotchas: [
    'The panel shows +1 but combat is unchanged -> the setter writes a copy or another field; write where the formulas read (the console warns when the getter does not return the value set).',
    'A restart starts with grown stats -> the setter wrote into a shared template (a roster or class table that new units copy); give each unit its own copy of its stats.',
    'EXP is awarded every frame or twice per win -> `award()` sits in a per-frame branch; call it once where the win is decided.',
    'The world, the autopilot or the next wave runs under the window -> gate the whole fixed step on `busy()` before the autopilot.',
    '`?auto=1` hangs on the window -> pass the autoplay flag as `autoplay` and keep `update` in the fixed step the freeze loop calls.',
    '`?auto=1` ends differently -> the party grew; that is allowed if it still ends. Use `autoGrowth: hold` to keep the original ending, and say which in your notes.',
    'The gold HUD jumps ahead of the count-up -> add `r.gold` to the purse in `onDone`, not where `award()` is called.',
    'The HUD shows the grown stats before the panel reveals them -> print `lv.shown(id, key)` / `lv.shownLevel(id)` in the HUD, not the raw stats.',
    'Max HP grows but the bar looks emptier -> in the setter also add `gain` to current HP for living units.',
    'Per-hit EXP never shows -> `addExp` only banks it; an `award` that includes the unit shows it.'
  ],
  checks: [
    '{{when}}: EXP and gold count up, gauges fill and wrap with LV UP!, then a panel per levelled unit with its +N rows; Z / Enter / tap finishes the count, then advances.',
    'The panel\'s gains equal the change in the game\'s own stats, and the next fight uses them; the HUD changes only as the panel reveals each gain; a restart starts at base stats; the windows never cover the HUD.',
    '`?t=<ms>&freeze=1` gives the same frame every time; `?auto=1` still ends (same ending with `autoGrowth: hold`), no console errors.'
  ],
  selfcheck: [
    'Grep `award(`: once per win, in update logic; list every way to win and confirm each reaches it. Grep `addExp(` (if used): where damage lands only.',
    'Grep `update(`: every fixed step including while busy; the freeze loop calls that step. The setter writes the field the combat formulas read; no shared template changes.',
    'Walk `award(45, 12)` to a level-1 unit with the defaults: level 2 at 20 EXP -> the setter is called at once for 1-3 stats -> open 0.1 s -> count {{countMs}} ms -> wait {{autoMs}} ms (autoplay) -> panel rows 0.16 s each -> close -> `onDone` -> the game continues as before.'
  ],
  offers: {
    'ui-rects': { title: 'results window', text: '`lv.rect()` is the open results window (and level-up panel), or null; add it to the other element\'s obstacles / UI rects.' }
  },
  wants: {
    'ui-rects': { title: 'UI rects', text: 'Return them from the window\'s `uiRects()`, so the results window never covers them.', check: 'The results window never covers the other element\'s windows, plates or HUD.' },
    'battle-start': { title: 'reset', text: 'Do NOT call `lv.reset()` at every battle start (levels must carry over); only at a new game.' }
  }
};

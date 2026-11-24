// Basket hint for A-13 tactic-rules (conditional tactic rules): how to wire the module into an UNKNOWN game, by role.
// It decides, the game acts: every chooser (enemy AI, autoplay, auto commands) calls decide() and runs the result with the game's
// own action code. The editor is modal (busy()); plates are a UI overlay that avoids uiRects() and sprites.
export default {
  stage: 'systems',
  does: 'Every unit decides with an ordered list of rules "condition -> action (target)": ally HP under n%, a flying / armoured / back-row foe, self HP or MP, foe count, first turn. The first rule that holds and whose action is usable with a valid target wins, else the unit\'s Otherwise action, else the first usable attack or move. The evaluator is pure and explains itself; a plate beside the acting unit names the rule and target (ticks on the target); a modal editor (tabs, rows, presets, live "Now:" line) lets the player change the rules.',
  params: {
    why: 'create `params.why`', whyMs: 'create `params.whyMs` (ms)', theme: 'create `params.theme`', maxRules: 'create `params.maxRules`',
    editKey: 'the key that opens the editor', size: 'create `params.size` (0 = auto)', render: 'create `params.render`', minCssPx: 'create `params.minCssPx` (CSS px; the editor and plates grow on phones)'
  },
  steps: [
    ['Once at startup, after units and skills exist',
      '`tactics = GameDNA_TacticRules.create({actions, actionsOf, allies, enemies, canUse, targets, fields, turn, tags, bounds: {x: 0, y: 0, w: SCREEN_W, h: SCREEN_H}, getAnchor, uiRects, getObstacles, params: {why: \'{{why}}\', whyMs: {{whyMs}}, theme: \'{{theme}}\', maxRules: {{maxRules}}, size: {{size}}, render: \'{{render}}\', minCssPx: {{minCssPx}}}})`. `actions` = the game\'s own skills (attack, spells, guard, items; grid games also "advance" with `aim: \'none\'`), each with `aim` (enemy, ally, self, allEnemies, allAllies, none) and `role` (attack, magic, aoe, heal, guard, restore, buff, move). `canUse(u, id)` mirrors the real costs and limits (reason string when not usable); `targets(u, id)` only what that action reaches now. `fields` reads name, hp, maxHp, mp, tags (flying, armoured, back row) and `cls` (mapped to guardian, healer, caster, striker, brute); `key` = name or species so rules survive restarts.'],
    ['Every place that chooses a unit\'s action: enemy AI, autoplay, auto-battle commands (once per unit turn)',
      '`const d = tactics.decide(unit)`, then run `d.action` on `d.targetUnits` with the game\'s existing functions (movement, attack, damage, animation). `d.action === null` -> the old chooser (keep it).'],
    ['The key handler and pointer handlers',
      'Key {{editKey}} (and a small touch button) opens `tactics.openEditor(playerUnits)` outside autoplay. While `tactics.busy()`: keys go to `tactics.key(e.key)`, pointer down/move/up in logical px to `tactics.pointer(type, x, y)`, before the game\'s handlers. If the player steers units by hand, add an Auto toggle so they act by their rules.'],
    ['The fixed update step', '`tactics.update(stepMs)` every step in every scene, also while the editor is open; skip only the world step while `busy()`.'],
    ['The draw pass, last (after world, HUD and menus), in screen coordinates', '`tactics.draw(ctx)` once per frame.'],
    ['Restart / new battle', 'Keep the rules (the player\'s); `tactics.clearWhy()`.']
  ],
  gotchas: [
    'Units stand still -> the only usable fallback is hold/guard: give an attack or move action, or a usable Otherwise.',
    'The plate names a skill but nothing happens -> the runner ignores `d.targetUnits`, or `canUse` allows what the game refuses.',
    'A rule never fires -> its action has no target in reach (`targets()`), see the editor\'s Now line.',
    '`?auto=1` differs every run -> `Math.random` in an adapter or `decide()` called every frame.',
    'The game hangs with the editor open -> `update()` skipped while `busy()`.',
    'Plates over HUD or banners -> those rects are missing from `uiRects()`.',
    'Rules reset each wave -> key the book by name or species (`fields.key`), not object identity.'
  ],
  checks: [
    'Enemies and autoplayed allies act with a plate naming the unit, the rule and the target; ticks mark the target.',
    'The editor key opens the editor; reordering, toggling or changing a rule changes the Now line and the next decision.',
    'Repeated Z walks down to Done and closes; X closes. `?auto=1` plays to the end with no console errors.'
  ],
  selfcheck: [
    'List every chooser and show it calls `decide()` once per unit turn and runs the result through existing action code.',
    'While `busy()` the world step is skipped but `update` and `draw` run; `canUse` matches the game\'s own costs.'
  ],
  offers: {
    'ui-rects': { title: 'tactic plates and editor', text: '`tactics.rects()` returns the plates on screen and the open editor; give them to other overlays as UI rects.' }
  },
  wants: {
    'ui-rects': { title: 'UI rects', text: 'Return the other elements\' windows, banners and HUD from `uiRects()` so plates step around them.', check: 'No tactic plate covers the other element\'s windows or banners.' },
    'anchor': { title: 'anchors', text: 'Use the same sprite boxes for `getAnchor()` as the other elements use for their anchors.', check: 'Plates and ticks sit on the same sprites as the other element\'s effects.' },
    'battle-start': { title: 'reset', text: 'Call `tactics.clearWhy()` on a new battle; keep the rule book.' }
  }
};

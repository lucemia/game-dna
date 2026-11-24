// Basket hint for A-01 active-time-battle: how to wire the module into an UNKNOWN game, by role.
// Never name a host's functions here. {{key}} = parameter value chosen for this combo.
export default {
  stage: 'systems',
  does: 'Replaces fixed turn order: each combatant\'s gauge fills in real time by speed (haste x1.5, slow x0.5). A full hero gauge opens that hero\'s command menu; a full enemy gauge picks an action at once; actions play one at a time from one shared queue. Active mode: enemies keep acting while a menu is open. Wait mode: the battle clock stops while a menu is open (menu input still works). The module draws the gauges, enemy gauges and a mode plate.',
  params: {
    mode: 'default for create option `mode`; the player can switch it (step 7)',
    speed: 'create option `speed`',
    status: 'create option `partyStatus` (party-wide test toggle; in play, call `setStatus` from your haste/slow effects)',
    party: 'IGNORE',
    spd1: 'fallback hero speeds by slot, only if your game has no speed stat',
    spd2: 'same', spd3: 'same', spd4: 'same',
    res: 'IGNORE',
    enemyGauge: 'whether you call `drawEnemyGauges`'
  },
  steps: [
    ['Where a battle (or wave) starts, after its combatants exist',
      '`atb = GameDNA_ATB.create({mode: \'{{mode}}\', speed: {{speed}}, partyStatus: \'{{status}}\', combatants, isAlive, onHeroReady, onMenuCancel, chooseEnemyAction, performAction, onBattleEnd})`, one per battle. `combatants`: `{id, side: \'party\' | \'enemy\', speed}` with your speed stat scaled to 10-60 (no stat: heroes {{spd1}}, {{spd2}}, {{spd3}}, {{spd4}} by slot, enemies 18-46). `isAlive(id)` reads your HP/death state. `onHeroReady(id)` opens your command menu for that hero; `onMenuCancel` and `onBattleEnd` close it (your victory code still runs). `chooseEnemyAction(id)` returns your enemy AI\'s action (any shape, optional `target` id) or `null`. `performAction(action, done)` runs your code that plays one action, with the action object unchanged (keep its full target list), and calls `done()` once at its end.'],
    ['Where your game decides whose turn is next (round loop, turn counter, initiative list)',
      'Stop calling it. Call `atb.update()` once per step as its own statement, after menu input and the animation step, never in an `else` branch. Then fix every reader of the old turn signal: an autopilot or test hook now acts when `onHeroReady` opens a menu and confirms through the same path as the player; variables such as "current actor" or "phase" are set in `onHeroReady` / `performAction` and cleared when the action ends, so nothing reads a stale one.'],
    ['Where your command menu confirms a choice',
      'Close the menu, then `atb.submit(heroId, action)` instead of playing it. Defend: keep your flag, then `atb.submit(heroId, {defend: true})`. Menu closed without a choice: `atb.menuClosed()`.'],
    ['Where your HUD draws each party member\'s row',
      'Keep everything the row already shows (HP bar, max HP, MP). If there is room, `L = atb.layoutRow({x, y, nameW, hpW, right})` gives a gauge rect that overlaps nothing; otherwise pick free space inside the panel (at least 40 px wide, 6 px tall, clear of every text). Draw with `atb.drawGauge(ctx, id, x, y, w, h)`. Never remove HUD info to make room.'],
    ['Your battle-field draw pass, after the sprites',
      'Enemy gauges {{enemyGauge}}: `atb.drawEnemyGauges(ctx, enemies.map(e => ({id, x: centreX, footY})), fieldHeight)`. `atb.drawModePlate(ctx, 4, 4)` replaces any round/turn plate (returns `{w, h}`). An acting enemy gets a white sprite overlay at alpha `atb.flashAlpha(id)`.'],
    ['Your haste/slow effects and anything that ran "once per round" (poison, regen)',
      '`atb.setStatus(id, \'haste\' | \'slow\' | null, seconds)`. Per-round effects run on the battle clock instead (e.g. every 300 steps where `atb.clockRuns()`).'],
    ['Mode switch (Active / Wait); keep both',
      'Hold the mode in a variable that survives restarts, start it from a `?mode=active|wait` URL parameter (default {{mode}}), add a key not already used to toggle it, and call `atb.set({mode})` on change.']
  ],
  gotchas: [
    'Enemies freeze while a menu is open in Active mode -> the animation or `update()` sits behind `if (menu) ... else`; all three run every step.',
    'Wait mode softlocks -> menu input must not depend on `atb.clockRuns()`.',
    'A hero acts twice or the queue stalls -> call `done()` exactly once per action, misses included.',
    'Crash when the last enemy dies during a menu -> open menus only from `onHeroReady`; never pick from an empty target list.',
    'Autoplay loses or crashes after the change -> it still waits for the old turn signal or reads a "current actor" you no longer update; drive it from `onHeroReady`.',
    'A group attack hits one target twice -> you rewrote the action\'s targets; pass it through unchanged.',
    'No revive in v1: a dead combatant stays out until the next `create`. If your game revives, report it.'
  ],
  checks: [
    'Active: a command menu is open while an enemy acts; gauges show three states (gold charging, flashing white ready, cyan queued).',
    'Menu open 10 s: enemies act in Active; in Wait nothing fills, the plate turns violet with pause bars, confirming plays the command.',
    'Victory/defeat closes the menu; the next battle starts with fresh gauges; the HUD still shows everything it showed before.',
    '`?mode=wait` and the toggle key both reach Wait mode, also after a restart.'
  ],
  selfcheck: [
    'Trace one step with a menu open: menu input, the animation step and `atb.update()` all run.',
    'Trace the last enemy dying during a menu: it closes and your victory code runs once.',
    'One HUD row: the x ranges of name, HP, gauge and other text do not overlap, and nothing that was there before is gone.',
    'Trace the game\'s autoplay through one hero turn (`onHeroReady` -> its choice -> `submit`) and one enemy action (`chooseEnemyAction` -> `performAction` -> `done`).'
  ],
  // Starter basket (FORMAT v1.2): the documented extension points of starter/index.html (see starter/README.md).
  starter: {
    name: 'Ruin Skirmish',
    modules: 'with a `<script src>` (or pasted unchanged) in the ADDONS SLOT, before the code that uses it',
    register: 'push it onto `GAME.addons` in the ADDONS SLOT `<script>` of `index.html` (it runs before the battle boots, so addons see the first battle and every `?t=` frame; module `<script src>` tags go there too) (hooks: `beforeHit`, `onHit(ev, game)`, `onKey(key, game)`, `update(game, info)`, `draw(g, layer, game)`, `onBattleStart(game)`, `onBattleEnd(result, game)`)',
    hit: '`onHit(ev, game)` runs on the hit frame, right after the hit site `GAME.applyHit(ev)` changed HP, MP or status. `ev.kind` is `damage | heal | mp | status | guard`: `amount` is the applied amount (after Defend; heals clamped), `ev.crit` marks critical attacks, `status` events carry `ev.status`, `mp` events are spell costs with `ev.quiet: true`, `guard` is Defend. Feedback helpers: `GAME.shake(px, frames)`, `GAME.flash(color, frames, alpha)`',
    draw: '`draw(g, layer, game)` with `layer === \'fx\'`: the native 256x224 buffer, after actors, banner and mode plate, before the HUD; it shakes with the field',
    rects: '`GAME.uiRects()` (mode plate, HUD windows, banner and result window while shown; native px)',
    field: 'the play field `{x: 0, y: 0, w: GAME.W, h: GAME.FH}`',
    anchor: '`GAME.anchor(id)` -> `{x, top, w, h, left, dead}` (home position, native px); living actors are `GAME.B.party` and `GAME.B.mons` (`dead` false)',
    clock: '`update(game, info)` runs every frame; `info.dt` is the world time advanced this frame in ms (16.67, or 0 while frozen). `GAME.hitStopMs(ms)` freezes the battle',
    reset: '`onBattleStart(game)`',
    builtins: { numbers: '`GAME.flags.builtinPopups = false` (keep `builtinShake`: it is hit feedback, not numbers)' },
    keep: '`?auto=1`, `?t=<ms>&freeze=1`, `?mode=`, `?speed=`, `?status=`, `?seed=`, keys M (mode) and P (autoplay)',
    traceFrom: '`GAME.applyHit` (an autoplay Attack and an enemy hit)',
    autoCheck: '`?auto=1` still wins all waves'
  },
  offers: {
    'hit-site': 'Both sides\' actions play through `performAction(action, done)`; the frame in that playback where HP drops is the one hit site (not at queueing, not at `done()`).',
    'freeze': 'The freeze also skips your animation step and `atb.update()` (no gauge fill while frozen); menu input keeps running.',
    'ui-rects': 'The mode plate is a UI rect `{x: 4, y: 4, w, h}` (store what `drawModePlate` returns); gauge rows sit in the HUD.',
    'battle-start': 'Battles start where you create the ATB instance.'
  }
};

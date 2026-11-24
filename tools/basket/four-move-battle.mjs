// Basket hint for A-02 four-move-battle: how to wire the module into an UNKNOWN game, by role, and the starter's extension points.
// Never name a host's functions here. {{key}} = parameter value chosen for this combo.
export default {
  stage: 'systems',
  does: 'Replaces what happens inside one battle with a turn-based creature duel (one on one, or two on two): each creature has up to four moves with uses left and a type; a type chart doubles, halves or cancels damage and says so in the message box; priority, then speed, decides who moves first; accuracy, critical hits, burn / sleep / numb, guard, heal and drain moves; switching to a bench creature costs the turn; fainted creatures sink and the next one is sent out. The module owns turn resolution, the message queue, the menus and the classic battle screen (foe top-right on a platform with its info box, own creature bottom-left from behind, message box, 2x2 move menu with type and uses, draining HP bars). The game supplies creatures, moves, types, sprites and its backdrop.',
  params: {
    format: 'create option `params.format` (`double` = two out per side)',
    textSpeed: 'create option `params.textSpeed`',
    advance: 'create option `params.advance` (`key` waits for OK on every message; autoplay always advances)',
    drain: 'create option `params.drain`',
    hints: 'create option `params.hints`',
    critRate: 'create option `params.critRate`',
    res: 'IGNORE'
  },
  steps: [
    ['How your battle maps onto it (decide before coding)',
      'Each combatant of yours becomes a creature `{id, name, level, types, hp, maxHp, atk, def, spd, moves}` from your own stats; if your party fights together, one is out at a time and the others are the bench (two out with format {{format}} = double). One enemy group, wave or encounter = one battle; its enemies are the foe team and come out one after another. Commands become moves (at most four): the basic attack, each spell (MP cost -> uses: `max(1, floor(maxMp / cost))`), defend (`{kind: \'status\', target: \'self\', effect: {guard: true}, priority: 3}`), heals (`effect: {heal: 0.4}`), group spells (`target: \'allFoes\'`). Elements become types with `strong` / `weak` / `none` lists (invent 3-6 if you have none) and every foe gets one. Items stay items (`items()` / `useItem()`). To keep your damage balance, pass `damage(ctx)` returning your own formula times `ctx.eff` (and 1.5 on `ctx.crit`).'],
    ['Where a battle (or wave) starts, after its combatants exist',
      '`battle = GameDNA_FourMove.create({view: {x: 0, y: 0, w, h} (the full native canvas), seed, foeName, teams: {own, foe}, moves, types, sprite: (src, view) => <your sprite image of that combatant>, drawBackground: (ctx, rect, t) => <your battle backdrop>, onEnd: (result, snapshot) => ..., params: {format: \'{{format}}\', textSpeed: \'{{textSpeed}}\', advance: \'{{advance}}\', drain: \'{{drain}}\', hints: \'{{hints}}\', critRate: {{critRate}}, auto: <your autoplay flag>}})`. Keep a reference to your own object in each creature (any extra field comes back as `src`). The same image for the `back` view is fine; mirror it if it faces away from the foe.'],
    ['Your fixed step (every loop that steps the game, fast-forwards included)',
      '`battle.update()` once per step while a battle exists, as its own statement; never behind a menu or animation check. Also keep it running behind your end-of-battle overlay so the last HP bar finishes draining.'],
    ['Where your battle screen is drawn',
      'Replace the drawing of combatants, menus and the HP panel with `battle.draw(ctx)` (or `drawScene` + your effects + `drawUI`). Keep your own title, banners and result overlays, drawn after it.'],
    ['Your input handling while a battle runs',
      'Keys go to `battle.key(\'up\' | \'down\' | \'left\' | \'right\' | \'ok\' | \'back\')`, taps to `battle.tap(x, y)` in native pixels. Keep every other key and shortcut working.'],
    ['Where your battle ends (victory, next wave, defeat)',
      'From `onEnd(result, snapshot)`: copy HP (and spent uses back into MP, if you mapped them) from `snapshot.own[i]` (`src` is your object), then run your existing victory / next-wave / defeat code exactly once. Set any phase or state that your other code (and tests) read.'],
    ['Your autoplay / demo player',
      'Pass `params.auto` (or call `battle.setAuto(true)`): the module plays your side by pressing its own menu keys and advances messages. Remove only the battle-command branch of your autoplay; keep its title and between-battle presses.']
  ],
  gotchas: [
    'Enemies never act or the battle freezes on a message -> `update()` is skipped while something else is busy; call it every step.',
    'Your old turn loop still runs and both systems act -> stop calling your round/turn function inside a battle (keep the function itself).',
    'HP resets between waves or your wave counter never moves -> copy HP back in `onEnd` and call your own end-of-battle code there, once.',
    'Autoplay hangs on the first menu -> it waits for your old command phase; pass `params.auto` instead.',
    'One side always wins in a few hits -> your type lists double damage against most of one side; give each side some strong and some weak matchups, or pass `damage(ctx)` with your own formula.',
    'Tiny sprites -> they are scaled up by whole numbers automatically; pass a sprite per creature, not a sheet.',
    'Blank text box on the first frame of a `?t=` still -> pass `view`; it is needed before the first draw.'
  ],
  checks: [
    'Foe top-right on a platform with name / level / HP box, own creature bottom-left, message box; FIGHT opens a 2x2 move menu with type and uses.',
    'A strong-type hit shows its matchup message, HP drains smoothly, a fainted creature sinks and the next one is sent out; uses count down; switching costs the turn.',
    'Your autoplay still finishes the whole game and ends the same way as before; restart and title still work.'
  ],
  selfcheck: [
    'Trace one turn: OK -> FIGHT -> a move -> both sides act in speed order -> the menu returns.',
    'Trace the last foe fainting: `onEnd(\'win\')` -> your next battle or victory runs once; your last creature fainting -> defeat once.',
    'Every function that existed still exists; every move id in a creature\'s `moves` exists in `moves`.'
  ],
  // Starter basket (FORMAT v1.2): the documented extension points of starter/index.html (see starter/README.md).
  starter: {
    name: 'Crossroads Cup',
    modules: 'in the ADDONS SLOT `<script>` (pasted unchanged) or as `<script src>` tags right above it',
    register: 'push it onto `GAME.addons` in the ADDONS SLOT `<script>` of `index.html` (it runs before the cup boots, so addons see the first battle and every `?t=` frame) (hooks: `beforeHit(ev, game)`, `onHit(ev, game)`, `onKey(key, game)`, `update(game, info)`, `draw(g, layer, game)`, `drawUI(g, game)`, `onTurn`, `onPhase`, `onEvent`, `onBattleStart(game)`, `onBattleEnd(result, game)`)',
    hit: '`onHit(ev, game)` runs on the hit frame, right after the module changed HP or status. `ev.kind` is `damage | heal | status | cure`; `amount` is the applied amount (heals clamped), `ev.crit` marks critical hits, `ev.eff` the type multiplier (2, 1, 0.5), `ev.cause` is `move | burn | drain | item`, `ev.target` the creature id. Feedback helpers: `GAME.shake(px, frames)`, `GAME.flash(color, frames, alpha)`',
    draw: '`draw(g, layer, game)` with `layer === \'fx\'`: the native 240x160 context, after the creatures and the module\'s own move effects, before the info boxes and message box; it shakes with the field',
    rects: '`GAME.uiRects()` (info boxes, message box or menu, team / item list, between-round windows; native px)',
    field: 'the field above the message box `GAME.B.fieldRect()` (`{x: 0, y: 0, w: 240, h: GAME.FH}`)',
    anchor: '`GAME.anchor(id)` -> `{x, top, w, h, left, cy, footY, dead}` (home position, not the attack lunge; native px); creatures on the field are `GAME.B.active(\'own\')` and `GAME.B.active(\'foe\')`',
    clock: '`update(game, info)` runs every frame; `info.dt` is the world time advanced this frame in ms (16.67, or 0 while frozen). `GAME.hitStopMs(ms)` freezes the battle',
    reset: '`onBattleStart(game)`',
    builtins: { numbers: 'nothing to turn off: the starter draws no damage numbers (HP bars drain instead); keep `GAME.flags.builtinShake` (it is hit feedback, not numbers)' },
    keep: '`?auto=1`, `?t=<ms>&freeze=1`, `?format=double`, `?seed=`, `?text=`, key P (autoplay), taps',
    traceFrom: 'the module\'s hit site (`onHit` of an autoplay move and of a foe move)',
    autoCheck: '`?auto=1` still plays the whole cup to the CUP CHAMPION screen'
  },
  offers: {
    'hit-site': 'Every HP change goes through the module\'s `beforeHit(ev)` / `onHit(ev)` callbacks (on the impact frame of the attack animation; also burn, drain, heals and items).',
    'freeze': '`battle.hitStop(ms)` freezes the battle (animations, timers, autoplay); `battle.pause(on)` stops it.',
    'ui-rects': '`battle.uiRects()` lists the info boxes, message box and open menu of the last frame; `battle.fieldRect()` is the area above the message box.',
    'anchor': '`battle.anchor(id)` -> `{x, top, w, h, left, cy, footY}` of a creature on the field, at its home position.',
    'battle-start': 'Battles start where you create the module instance.'
  }
};

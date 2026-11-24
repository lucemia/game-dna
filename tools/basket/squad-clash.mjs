// Basket hint for A-14 squad-clash: how to wire the module into an UNKNOWN game, by role, and the starter's extension points.
// Never name a host's functions here. {{key}} = parameter value chosen for this combo.
export default {
  stage: 'systems',
  does: 'Replaces how a fight between two groups is resolved with an auto-resolved squad clash: each side is a 2x3 grid (front row takes melee, back row is safe from melee while the front stands but takes x1.25 from ranged and magic); every unit acts once per round in speed order by its own ordered "condition -> action" tactic rules; guards step in for weak or back-row allies; allies follow up attacks; crits come from a seeded stream. Before the fight a forecast shows each unit\'s HP after, who falls and win / lose / draw, from the same simulation; on commit the clash plays out by itself in a staged side view (dash, swing, arrows, spells, guard shield, follow-up tag, hit numbers, turn-order strip, a "why" readout, result banner) and ends exactly as forecast.',
  params: {
    rounds: 'create `params.rounds`', speed: 'create `params.speed` (timing only)', crit: 'create `params.crit`', guard: 'create `params.guard`',
    followUps: 'create `params.followUps`', margin: 'create `params.margin`', forecast: 'create `params.forecast`', numbers: 'create `params.numbers` (off when another element draws damage numbers)'
  },
  steps: [
    ['How your fight maps onto it (decide before coding)',
      'Each side of an encounter becomes a squad of at most 6 units `{id, name, cls, row: \'front\'|\'back\', col: 0-2, hp, maxHp, atk, def, mag, res, spd, skills, rules, tags, guard, followUp, src}` built from your own stats (keep a reference to your object in `src`). Melee fighters front, archers / casters / healers back. Attacks become skills (`melee`, `ranged`, `magic` with `area: \'row\'` for group spells, `heal`); your AI or class becomes a rule list (`[{if: \'allyHpBelow\', value: 50, use: \'mend\'}, {if: \'always\', use: \'strike\'}]`; `GameDNA_SquadClash.PRESETS` has ready lists per class). `cls` picks a built-in look (knight, lancer, archer, mage, cleric, rogue, brigand, slinger, ironclad, hexer, mender, warlord, hound, raptor), or draw your own sprites with `drawUnit`.'],
    ['Once, where your battle screen starts',
      '`clash = GameDNA_SquadClash.create({view: {x: 0, y: 0, w, h} (your logical canvas), seed, params: {rounds: {{rounds}}, speed: {{speed}}, crit: {{crit}}, guard: \'{{guard}}\', followUps: \'{{followUps}}\', margin: {{margin}}, forecast: \'{{forecast}}\', numbers: \'{{numbers}}\'}, drawBackground: (ctx, view, t) => <your backdrop>, onHit: ev => <your hit feedback>, onEnd: (result, outcome) => <your victory / defeat / retreat code, once>})`, then `clash.setSquads(yourSquad, foeSquad)`.'],
    ['Before the fight (your command or preparation phase)',
      'Show `clash.forecast()`: `clash.drawForecast(ctx, rect)` and the striped HP bars. Let the player move units between slots and change rules if your game allows it; call `clash.forecast()` again after each change. A confirm key calls `clash.commit()`. Under autoplay, commit after a short pause (or try swaps and keep the best forecast).'],
    ['Your fixed step (every loop that steps the game, fast-forwards included)',
      '`clash.update(stepMs)` once per step, `0` while your world is frozen; never behind a menu or animation check.'],
    ['Where your battle screen is drawn',
      'Replace drawing the combatants with `clash.drawScene(ctx)`, then your effects, then `clash.drawUI(ctx)`; keep your HUD, title and result screens after it.'],
    ['Where the fight ends',
      'In `onEnd(result, outcome)`: HP is already written on the units; copy it back to your objects (`src`), run your existing win / lose code exactly once, set any phase your other code and tests read. `outcome.match` says the clash equalled its forecast.']
  ],
  gotchas: [
    'The clash differs from the forecast (banner: "differs") -> something changed HP, stats or rules between `forecast()` and the end (your own damage code still running, an `onHit` that edits HP, units rebuilt mid-clash). Let the module own HP during the clash.',
    'Forecast stuck on an old result -> you edited units but did not call `forecast()` again; it is cached by the units\' values, so call it after every change.',
    'Nothing happens after commit -> `update()` is skipped while a menu or animation runs; call it every step.',
    'Your old turn loop still runs and both act -> stop calling your round function during a clash (keep the function).',
    'Back-row units never get hit by melee and fights stall into draws -> give each side some ranged or magic, or raise `rounds`.',
    'Different result every reload -> pass a fixed `seed` per encounter; never use `Math.random` in rules, conditions or hooks.'
  ],
  checks: [
    'Before the fight a forecast shows win / lose / draw, each unit\'s predicted HP loss (striped) and a skull on units that will fall; moving a unit or changing its rules changes it at once.',
    'After commit the clash plays by itself: a turn-order strip, a why readout per action ("Rule 1: Ally HP < 60% -> Mend"), a guard stepping in with GUARD!, a FOLLOW-UP, numbers on hit frames; the banner says "Played exactly as forecast".',
    'Your autoplay still finishes the whole game and ends the same way as before; restart and title still work.'
  ],
  selfcheck: [
    'Trace one fight: setSquads -> forecast (shown) -> commit -> update each step -> onHit per hit -> onEnd once -> your next screen.',
    'Grep every place your game changes HP during a fight: none may run between commit and onEnd.',
    'Walk one hit: atk 14, power 100, def 6 -> 14 x 1.5 - 6 x 0.75 = 16.5 -> 17; the same def-6 target in the back row hit by a 90-power ranged attack at atk 13: 13 x 0.9 x 1.5 - 4.5 = 13.05, x1.25 -> 16.'
  ],
  // Starter basket (FORMAT v1.2): the documented extension points of starter/index.html (see starter/README.md).
  starter: {
    name: 'Banners of the Vale',
    modules: 'in the ADDONS SLOT `<script>` (pasted unchanged) or as `<script src>` tags right above it',
    register: 'push it onto `GAME.addons` in the ADDONS SLOT `<script>` of `index.html` (it runs before the game boots, so addons see the first clash and every `?t=` frame) (hooks: `onHit(ev, game)`, `onKey(key, game)`, `update(game, info)`, `draw(g, layer, game)`, `drawUI(g, game)`, `onClashStart(game)`, `onClashEnd(result, outcome, game)`, `onBattleStart`, `onBattleEnd`, `onEvent`, `onTurn`, `onPhase`, `onForecast`, `onScene`). **Unit positions in this starter:** an addon that places anything on or above a unit (numbers, sparks, labels) must use the live `GAME.anchor(id)` and `GAME.unitRects()`, which follow a dashing attacker and a guard stepping in; never `GAME.C.anchor(id, {home: true})`. This overrides any addon README that says to return a unit\'s home spot when it dashes away (here a guarded hit lands on the guard where it stands, not on its empty home spot)',
    hit: '`onHit(ev, game)` runs on the impact frame, after the module wrote the new HP: `ev = {kind: \'damage\' | \'heal\', source, target, aimed, guardBy, side, amount (HP actually lost or gained), crit, type (\'physical\' | \'fire\' | \'shock\' | \'arcane\' | \'heal\'), tag (\'guard\' | \'followUp\' | null), hpBefore, hpAfter, killed}`. It is read-only: the amounts come from the forecast. Feedback helpers: `GAME.shake(px, frames)`, `GAME.flash(color, frames, alpha)`',
    draw: '`draw(g, layer, game)` with `layer === \'fx\'`: the 640x360 logical context (already scaled to the HD backing store), inside the shake, after the units, the module\'s effects and HP bars, before the UI panels',
    rects: '`GAME.uiRects()` (turn-order strip, why readout, banner, forecast panel, the game\'s panels; logical px) and `GAME.unitRects()` (each unit\'s sprite box and HP bar with its `id`)',
    field: 'the stage above the bottom panels `{x: 0, y: 0, w: 640, h: 300}`',
    anchor: '`GAME.anchor(id)` -> `{x, top, w, h, left, cy, footY, dead}` where the unit is drawn now (it follows a dash or a guard\'s step-in); `top` is the top of its HP bar; it answers for fallen units (their lying body); units are `GAME.squad` and `GAME.enemy`',
    clock: '`update(game, info)` runs every frame; `info.dt` is the world time advanced this frame in ms (16.67, or 0 while frozen). `GAME.hitStopMs(ms)` freezes the clash (it only delays it)',
    reset: '`onClashStart(game)`',
    builtins: { numbers: 'set `GAME.flags.builtinNumbers = false` (the module\'s own hit numbers); keep `builtinShake` and `builtinFlash` unless the addon shakes or flashes itself' },
    keep: '`?auto=1`, `?t=<ms>&freeze=1`, `?seed=`, `?speed=`, keys P (autoplay) and T (tactics), taps, and the `art/` folder beside `index.html` (the painted units and backdrops; without it the game falls back to vector units)',
    traceFrom: 'the hit site (`onHit` of an autoplay clash: one of your squad\'s hits and one guarded hit)',
    autoCheck: '`?auto=1` still plays the whole march to THE VALE IS HELD (or THE MARCH IS BROKEN) with the same clash results'
  },
  offers: {
    'hit-site': 'Every HP change of a clash goes through `onHit(ev)` on its impact frame (after the module wrote HP): `{kind, source, target, amount, crit, type, hpBefore, hpAfter, killed}`.',
    'freeze': '`clash.hitStop(ms)` (or `update(0)`) freezes the clash; it only delays it, the result stays the forecast.',
    'ui-rects': '`clash.uiRects()` lists the turn-order strip, why readout, banner and forecast panel of the last frame.',
    'anchor': '`clash.anchor(id)` -> `{x, top, w, h, left, cy, footY, dead}` where the unit is drawn now (`top` = HP-bar top; `anchor(id, {home: true})` = its formation spot); `clash.unitRects()` = drawn sprite boxes and HP bars with ids.',
    'battle-start': 'A clash starts at `clash.commit()`.'
  }
};

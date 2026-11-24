// Basket hint for A-10 card-battle: how to wire the module into an UNKNOWN game, by role, and the starter's extension points.
// Never name a host's functions here. {{key}} = parameter value chosen for this combo.
export default {
  stage: 'systems',
  does: 'Replaces how a fight is resolved with a turn-based card battle on its own front-view stage: each turn the hero draws a fanned hand and gets a small energy pool (Lumen); cards are dragged onto a foe (a target arrow and reticle follow) or played with keys / taps; they deal damage, give ward, apply statuses, draw; played cards go to the discard pile, which is shuffled back (seeded) when the draw pile runs out; every foe shows an intent tag with the real numbers of its next move and then does exactly that; ward absorbs hits until its owner\'s next turn. Content (cards, foes, statuses) is plain data; a bot plays through the same input path.',
  params: {
    energy: 'create `params.energy`', draw: 'create `params.draw`', handMax: 'create `params.handMax`', fan: 'create `params.fan`', speed: 'create `params.speed` (timing only)',
    intents: 'create `params.intents`', arrow: 'create `params.arrow`', numbers: 'create `params.numbers` (off when another element draws damage numbers)'
  },
  steps: [
    ['How your fight maps onto it (decide before coding)',
      'Your attacks, skills and items become cards `{name, cost, type: \'attack\'|\'skill\'|\'charm\', target: \'enemy\'|\'none\', text: \'Deal {damage} damage.\', effects: [{do: \'damage\', n: 6}]}` (effects: damage / ward / status / draw / energy / heal, or a function using `api`); your monsters become foes `{name, hp, look, palette, moves: {id: {name, effects}}, pattern}`; the hero\'s deck is 8-12 card ids from its skills and items.'],
    ['Once, where your battle screen starts',
      '`battle = GameDNA_CardBattle.create({view: {x: 0, y: 0, w, h} (your logical canvas), cards, enemies, params: {energy: {{energy}}, draw: {{draw}}, handMax: {{handMax}}, fan: {{fan}}, speed: {{speed}}, intents: \'{{intents}}\', arrow: \'{{arrow}}\', numbers: \'{{numbers}}\'}, drawBackground: (ctx, view, t) => <your backdrop>, onHit: ev => <your hit feedback>, onEnd: (result, info) => <your victory / defeat code, once>})`; at each encounter `battle.start({deck, foes, hero: {hp, maxHp, name}, seed})`.'],
    ['Your fixed step (every loop that steps the game, fast-forwards included)',
      '`battle.update(stepMs)` once per step, `0` while your world is frozen; never behind a menu or animation check.'],
    ['Where your battle screen is drawn',
      'Replace drawing the combatants with `battle.drawScene(ctx)`, then your effects, then `battle.drawUI(ctx)`; keep your HUD, title and result screens after it.'],
    ['Your input while the fight runs',
      'Keys -> `battle.key(\'left\'|\'right\'|\'up\'|\'down\'|\'ok\'|\'back\'|\'end\')`; pointer down / move / up -> `battle.pointer(type, x, y)` in logical px. Your autoplay -> `battle.setAuto(true)`.'],
    ['Where the fight ends',
      'In `onEnd(result, info)`: copy `info.hero.hp` to your hero, run your existing win / lose code exactly once, set any phase your other code and tests read.']
  ],
  gotchas: [
    'A foe deals more or less than its tag said -> something outside the rules changed HP or statuses during the fight; only cards, moves and statuses may.',
    'Card counts drift -> your code edits the hand or piles; add cards through `battle.addCard(id, where)`.',
    'Nothing happens after a click -> `update()` is skipped while a menu or animation runs; call it every step.',
    'Your old turn loop still runs -> stop calling your round function during a fight (keep the function).',
    'Different fight every reload -> pass a fixed `seed` per encounter; never use `Math.random` in card code or patterns (use `api.rng()`).',
    'Pointer play misses -> pass logical px (canvas css px scaled to your logical size), not page px.'
  ],
  checks: [
    'A fanned hand; dragging an aimed card shows the arrow and a reticle on the foe; unpayable cards are dimmed.',
    'Every foe shows an intent tag with numbers; after End Turn it does exactly that; a sapped foe\'s tag drops at once.',
    'The discard pile reshuffles into the draw pile; ward absorbs ("blocked n"); your autoplay still finishes the game.'
  ],
  selfcheck: [
    'Trace one fight: start -> update each step -> play -> onHit per hit -> end turn -> foes act -> onEnd once -> your next screen.',
    'Grep every place your game changes HP during a fight: none may run between start and onEnd.',
    'Walk one hit: 6 + Might 2 = 8; target Exposed: 8 x 1.3 = 10.4 -> 10; ward 4 absorbs 4, HP -6.'
  ],
  // Starter basket (FORMAT v1.2): the documented extension points of starter/index.html (see starter/README.md).
  starter: {
    name: 'Lantern Road',
    modules: 'in the ADDONS SLOT `<script>` (pasted unchanged) or as `<script src>` tags right above it',
    register: 'push it onto `GAME.addons` in the ADDONS SLOT `<script>` of `index.html` (it runs before the game boots, so addons see the first fight and every `?t=` frame) (hooks: `onHit(ev, game)`, `onKey(key, game)`, `update(game, info)`, `draw(g, layer, game)`, `drawUI(g, game)`, `onBattleStart(game)`, `onBattleEnd(result, info, game)`, `onEvent`, `onPlay`, `onTurn`, `onScene`, `onReward`, `onNewGame`). New cards, foes and statuses go in the same slot through `GAME.addCard(id, def, {deck, pool})`, `GAME.addEnemy(id, def, {fight})`, `GAME.addStatus(id, def)`. **Unit positions:** an addon that places anything on or above a unit must use the live `GAME.anchor(id)` (the hero is `\'hero\'`, its portrait) and avoid `GAME.unitRects()`, `GAME.uiRects()` (cards in hand, panels, banner) and each living foe\'s intent tag taken live: `uiRects()` is the last drawn frame, so it has no tags before a fight\'s first frame (a `?t=` fast-forward); for each `f` of `GAME.C.foes()` with `f.hp > 0 && GAME.C.intentOf(f.id)`, `a = GAME.anchor(f.id)`, `tip = Math.max(a.top - 4, 64)`, reserve `{x: a.x - 50, y: tip - 34, w: 100, h: 36}` (`intentRects()` in index.README.md "Adding damage numbers")',
    hit: '`onHit(ev, game)` runs on the impact frame, after the module wrote the new HP: `ev = {kind: \'damage\' | \'heal\', source, target, side (\'hero\' | \'foe\'), raw, blocked (absorbed by ward), amount (HP actually lost or gained; 0 when ward took it all), hpBefore, hpAfter, killed, type (\'physical\' | \'fire\' | \'frost\' | \'shock\' | \'light\' | \'burn\' | \'thorns\' | \'heal\'), tag (null | \'tick\' | \'barbs\')}`. Read-only. Feedback helpers: `GAME.shake(px, frames)`, `GAME.flash(color, frames, alpha)`, `GAME.hitStopMs(ms)`',
    draw: '`draw(g, layer, game)` with `layer === \'fx\'`: the 640x360 logical context (already scaled to the HD backing store), during a battle, inside the shake, after the foes, plates, intent tags and the module\'s effects, before the hero panel, the hand and the banners',
    rects: '`GAME.uiRects()` (hero panel, piles, end-turn button, readout, banner, each card in hand, each foe\'s intent tag, the starter\'s top tags and scene panels; logical px, from the last drawn frame: add the live intent rects, see `register`) and `GAME.unitRects()` (each living foe\'s sprite box and plate, and the hero portrait, with `id`)',
    field: 'the whole canvas `{x: 0, y: 0, w: 640, h: 360}` (the hand and panels are in `GAME.uiRects()`)',
    anchor: '`GAME.anchor(id)` -> `{x, top, left, w, h, cy, footY, dead}` where the unit is drawn now (a foe\'s lunge included; `top` = sprite top, the intent tag sits above it); the hero is `\'hero\'` (its portrait); foes are `GAME.C.foes()` (ids like `mire-toad-1`)',
    clock: '`update(game, info)` runs every frame of every scene; `info.dt` is the world time advanced this frame in ms (16.67, or 0 while frozen). `GAME.hitStopMs(ms)` freezes the battle (it only delays it)',
    reset: '`onBattleStart(game)`',
    builtins: { numbers: 'set `GAME.flags.builtinNumbers = false` (the module\'s own hit numbers); keep `builtinShake` and `builtinFlash` unless the addon shakes or flashes itself' },
    keep: '`?auto=1`, `?t=<ms>&freeze=1`, `?seed=`, `?speed=`, keys E (end turn) and P (autoplay), drag and tap play, `GAME.held`',
    traceFrom: 'the hit site (`onHit` of an autoplay fight: one hit on a foe, one foe hit on the hero partly absorbed by ward)',
    autoCheck: '`?auto=1` still walks the whole road to THE ROAD IS LIT (or THE LANTERN GOES OUT)'
  },
  offers: {
    'hit-site': 'Every HP change of a fight goes through `onHit(ev)` on its impact frame (after the module wrote HP): `{kind, source, target, side, raw, blocked, amount, hpBefore, hpAfter, killed, type, tag}`.',
    'freeze': '`battle.hitStop(ms)` (or `update(0)`) freezes the fight; it only delays it.',
    'ui-rects': '`battle.uiRects()` lists the hero panel, piles, end-turn button, readout, banner, hand cards and intent tags of the last drawn frame (no tags before a fight\'s first frame, e.g. in a `?t=` fast-forward), so also reserve each intent tag live: for each `f` of `battle.foes()` with `f.hp > 0 && battle.intentOf(f.id)`, `a = battle.anchor(f.id)`, `tip = max(a.top - 4k, view.y + 64k)`, rect `{x: a.x - 50k, y: tip - 34k, w: 100k, h: 36k}` with `k = view.h / 360` (`intentRects()` in the module README).',
    'anchor': '`battle.anchor(id)` -> `{x, top, w, h, left, cy, footY, dead}` where the unit is drawn now; the hero is `\'hero\'` (its portrait); `battle.unitRects()` = sprite boxes and plates with ids.',
    'battle-start': 'A fight starts at `battle.start({...})`.'
  }
};

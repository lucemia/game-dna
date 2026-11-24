// Basket hint for A-16 tower-defense: how to wire the module into an UNKNOWN game, by role, and the starter's extension points.
// Never name a host's functions here. {{key}} = parameter value chosen for this combo.
// (Coordinator: copy to tools/basket/tower-defense.mjs.)
export default {
  stage: 'systems',
  does: 'Adds a tower-defense stage: foes walk a fixed road through a 16x10 grid (one or more paths from waypoint cells) to a gate; the player builds towers on the grass beside the road, never on it (the road can never be blocked), with a range ring and a red warning on refused cells; towers have three levels, sell for part of their price and each has a target priority (first, strong, near); four built-in towers (single shot, splash, slow, chain); waves are plain data with the next wave previewed and an early-call gold bonus; gold, lives, speed x1 / x2, pause, win and lose. Seeded and fixed-step; a bot builds and sends waves through the same input path.',
  params: {
    speed: 'create `params.speed` (1 or 2)', gold: 'create `params.gold` (starting gold)', lives: 'create `params.lives`', waveGap: 'create `params.waveGap` (seconds)',
    earlyBonus: 'create `params.earlyBonus` (gold per second left)', refund: 'create `params.refund`', hpScale: 'create `params.hpScale`',
    priority: 'create `params.priority` (default target priority of new towers)', ring: 'create `params.ring`', preview: 'create `params.preview`', layout: 'create `params.layout` (`compact` under ~560 px, with a DOM panel)'
  },
  steps: [
    ['How your level maps onto it (decide before coding)',
      'Your stage becomes a map `{name, gold, lives, rows: 10 strings of 16 chars (\'.\' grass, \'T\' tree, \'r\' rock, \'b\' bush, \'w\' water), paths: [[[col, row], ...]]}` (waypoint cells, straight runs, the first and last one cell off the edge); your enemies become waves `{groups: [{enemy, count, gap, delay, path}], reward, hp}`; your monsters may become enemy entries `{name, look, hp, speed, armor, reward, leak, size, flying, palette}` and your turrets tower entries (format in the module README). Built-in towers and foes ship.'],
    ['Once, where your defense stage starts',
      '`td = GameDNA_TowerDefense.create({view: {x: 0, y: 0, w, h} (your logical canvas), params: {speed: {{speed}}, gold: {{gold}}, lives: {{lives}}, waveGap: {{waveGap}}, earlyBonus: {{earlyBonus}}, refund: {{refund}}, hpScale: {{hpScale}}, priority: \'{{priority}}\', ring: \'{{ring}}\', preview: \'{{preview}}\'}, onHit: ev => <your hit feedback>, onEvent: ev => <your sounds / banners>, onEnd: (result, info) => <your win / lose code, once>})`; per stage `td.start({map, waves, seed})`.'],
    ['Your fixed step (every loop that steps the game, fast-forwards included)',
      '`td.update(stepMs)` once per step, `0` while your world is frozen; never behind a menu or animation check.'],
    ['Where your stage is drawn',
      '`td.drawScene(ctx)`, then your effects, then `td.drawUI(ctx)`; keep your HUD, title and result screens after it.'],
    ['Your input while the stage runs',
      'Keys -> `td.key(\'1\'..\'9\' | \'left\' | \'right\' | \'up\' | \'down\' | \'ok\' | \'back\' | \'upgrade\' | \'sell\' | \'target\' | \'wave\' | \'speed\' | \'pause\')`; pointer down / move / up -> `td.pointer(type, x, y)` in logical px. Your autoplay -> `td.setAuto(true)`.'],
    ['Where the stage ends',
      'In `onEnd(result, info)` (`\'win\'` | `\'lose\'`): run your existing win / lose code exactly once, set any phase your other code and tests read.']
  ],
  gotchas: [
    'A tower appears on the road -> your code built it directly; build through `td.key` / `td.pointer` or `td.build()` (they refuse road cells).',
    'Foes freeze while a menu is open -> `update()` is skipped; call it every step.',
    'Gold or lives drift from the events -> your code wrote them; use `td.addGold(n)`, lives only change through leaks.',
    'Different game every reload -> pass a fixed `seed` per stage; no `Math.random` in custom drawing (use `td.rng()`).',
    'Taps miss cells -> pass logical px (canvas css px scaled to your logical size), not page px.',
    'Unreadable on a phone -> under ~560 px pass `params.layout: \'compact\'` with a 520:328 view and show the panel in DOM with `GameDNA_TowerDefense.mountPanel(el, td, send)`.',
    'A road waypoint list turns diagonally or crosses a tree / rock / water cell -> keep each step on one row or one column and keep those cells grass.'
  ],
  checks: [
    'Picking a tower shows its range ring; a road cell turns red with "Keep the road clear" and nothing is built.',
    'A tower set to Strong shoots the foe with the most HP in range; on First, the one with the least road left.',
    'The panel previews the next wave and that wave spawns exactly those foes; foes face the way they walk; your autoplay still finishes the game.'
  ],
  selfcheck: [
    'Trace one stage: start -> update each step -> build -> send wave -> onHit per hit -> onEnd once -> your next screen.',
    'Walk one hit: Bolt 14 on an armour-2 crawler = 12; Frost 5 (pierces armour) = 5.',
    'Walk one sale: Bolt 50 + upgrade 45 = 95 invested x 0.7 = 66 back.'
  ],
  // Starter basket (FORMAT v1.2): the documented extension points of starter/index.html (see starter/README.md).
  starter: {
    name: 'Thornwall Watch',
    modules: 'in the ADDONS SLOT `<script>` (pasted unchanged) or as `<script src>` tags right above it',
    register: 'push it onto `GAME.addons` in the ADDONS SLOT `<script>` of `index.html` (it runs before the game boots, so addons see the first field and every `?t=` frame) (hooks: `onHit(ev, game)`, `onKey(key, game)`, `update(game, info)`, `draw(g, layer, game)`, `drawUI(g, game)`, `onFieldStart(game)`, `onFieldEnd(result, info, game)`, `onEvent`, `onWave`, `onBuild`, `onScene`, `onNewGame`). New towers, enemies, waves and fields go in the same slot through `GAME.addTower(id, def)`, `GAME.addEnemy(id, def, {field, wave, count, gap, delay, path})`, `GAME.addWave(field, wave)`, `GAME.addField({name, map, waves})`. **Unit positions:** an addon that places anything on or above a foe must use the live `GAME.anchor(id)` (enemy ids `e12`, tower ids `t3`) and avoid `GAME.unitRects()` and `GAME.uiRects()`, staying inside `GAME.fieldRect()`',
    hit: '`onHit(ev, game)` runs on the impact frame, after the module wrote the new HP: `ev = {kind: \'damage\', source (tower id), tower (type), target (enemy id), enemy (kind), raw, armor, amount (HP actually lost), hpBefore, hpAfter, killed, type (\'physical\' | \'fire\' | \'frost\' | \'shock\'), splash, chain}`. Read-only. Many hits land each second (several towers, splash, chains): merge numbers per foe. Feedback helpers: `GAME.shake(px, frames)`, `GAME.flash(color, frames, alpha)`, `GAME.hitStopMs(ms)` (use sparingly: it pauses every wave)',
    draw: '`draw(g, layer, game)` with `layer === \'fx\'`: the 640x360 logical context (already scaled to the HD backing store), during a field, inside the shake, after the ground, towers, foes, shots, the module\'s effects and HP bars, before the HUD, the build panel and the banners',
    rects: '`GAME.uiRects()` (the HUD pills, speed and pause buttons, the build panel, a banner or toast while shown, the starter\'s scene panels; logical px) and `GAME.unitRects()` (each living foe\'s box incl. its HP bar, and each tower, with `id` and `kind`)',
    field: '`GAME.fieldRect()` (8, 36, 512 x 320 in the wide layout; under 560 px the phone layout makes the field fill the canvas and moves the HUD and panel into DOM: always read it, never hard-code it; the panel and HUD rects are in `GAME.uiRects()`)',
    anchor: '`GAME.anchor(id)` -> `{x, top, left, w, h, cy, footY, dead}` where the foe or tower is drawn now (an enemy\'s `top` is above its HP bar, `cy` its body centre, flyers included); foes are `GAME.C.enemies()` (ids like `e12`), towers `GAME.C.towers()`',
    clock: '`update(game, info)` runs every frame of every scene; `info.dt` is 16.67 ms, or 0 while frozen; `info.speed` is 1 or 2 (at x2 the field runs two simulation steps per frame: scale your own timers by it). `GAME.hitStopMs(ms)` freezes the field',
    reset: '`onFieldStart(game)`',
    builtins: { numbers: 'the module draws no damage numbers (only "+gold" on kills), nothing to turn off' },
    keep: '`?auto=1`, `?t=<ms>&freeze=1`, `?seed=`, `?field=`, `?compact=` (the phone layout with its DOM panel `#tdpanel`), keys 1-4, U, S, T, N, F, Q, P, card tap and drag, `GAME.held`',
    traceFrom: 'the hit site (`onHit` of an autoplay field: a bolt hit on a crawler (armour 2), a mortar splash on several foes, a chain lightning hit)',
    autoCheck: '`?auto=1` still holds both fields to THE WATCH HOLDS'
  },
  offers: {
    'hit-site': 'Every HP change of a foe goes through `onHit(ev)` on its impact frame (after the module wrote HP): `{source, tower, target, enemy, raw, armor, amount, hpBefore, hpAfter, killed, type, splash, chain}`.',
    'freeze': '`td.update(0)` or `td.pause(true)` freezes the field; it only delays it.',
    'ui-rects': '`td.uiRects()` lists the HUD pills, speed and pause buttons, the build panel, banners and toasts; `td.fieldRect()` is the play field.',
    'anchor': '`td.anchor(id)` -> `{x, top, w, h, left, cy, footY, dead}` where the foe or tower is drawn now; `td.unitRects()` = foes and towers with ids.',
    'battle-start': 'A stage starts at `td.start({...})`.'
  }
};

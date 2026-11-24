// Basket hint for A-17 match3-battle: how to wire the module into an UNKNOWN game, by role, and the starter's extension points.
// Never name a host's functions here. {{key}} = parameter value chosen for this combo.
export default {
  stage: 'systems',
  does: 'Adds a match-3 battle: an 8 x 8 board of faceted gems (one silhouette per colour), swaps of neighbours, runs of 3+ that clear and cascade (each step worth more), Row / Column shards for 4, Blast gems for L / T, Prisms for 5; every colour powers the hero of that colour (attack, skill charge), hearts heal, foes count down and strike at 0; waves, skills, ward, weaknesses. Boards never start with a match and always have a move (or reshuffle); refills and cascades are seeded; swaps and falls always animate; a bot plays through the same input path. Wide (stage left, board right) and tall (stage on top) layouts.',
  params: {
    specials: 'create `params.specials`', combo: 'create `params.combo` (cascade bonus per step)', weakMult: 'create `params.weakMult`', speed: 'create `params.speed` (animation only)',
    hints: 'create `params.hints`', numbers: 'create `params.numbers` (`off` when the basket has a damage-number addon)', layout: 'create `params.layout`'
  },
  steps: [
    ['How your game maps onto it (decide before coding)',
      'The battle becomes a mode of your game (entered where your game starts an encounter); your party members may become hero entries `{name, gem, atk, hp, skill, look, attack}`, your foes enemy entries `{name, look, hp, atk, every, weak, attack, special}`, your abilities skill entries `{name, cost, effects: [...]}` (formats in the module README). Built-in gems, heroes, skills and foes ship.'],
    ['Once, where the battle mode starts',
      '`m3 = GameDNA_Match3Battle.create({view: {x: 0, y: 0, w, h} (your logical canvas; 960 x 540 or 540 x 960 fit best), seed, params: {specials: \'{{specials}}\', combo: {{combo}}, weakMult: {{weakMult}}, speed: {{speed}}, hints: \'{{hints}}\', numbers: \'{{numbers}}\', layout: \'{{layout}}\'}, drawActor: (ctx, a) => <draw your sprite a.look at a.x, a.footY - a.lift, height a.h, facing a.facing, white flash a.flash, alpha a.alpha; return true>, drawBackdrop: (ctx, r) => <your scenery in r; return true>, onHit: hit => <your hit feedback>, onEvent: ev => <your sounds>, onEnd: (result, info) => <your win / lose code, once>})`; per encounter `m3.start({waves: [[foe ids], ...], seed})`.'],
    ['Your fixed step (every loop that steps the game, fast-forwards included)',
      '`m3.update(stepMs)` once per step, `0` while your world is frozen; never behind a menu or animation check.'],
    ['Where the battle is drawn',
      '`m3.drawScene(ctx)`, then your effects, then `m3.drawUI(ctx)`; keep your own title and result screens around it. Never draw over `m3.boardRect()`.'],
    ['Your input while the battle runs',
      'Keys -> `m3.key(\'up\' | \'down\' | \'left\' | \'right\' | \'ok\' | \'back\' | \'target\' | \'1\'..\'4\')`; pointer -> `m3.pointer(\'down\' | \'move\' | \'up\', x, y)` in logical px. Your autoplay -> `m3.setAuto(true)`.'],
    ['Where the battle ends',
      'In `onEnd(result, info)` (`\'win\'` | `\'lose\'`): run your existing win / lose code exactly once, set any phase your other code and tests read.']
  ],
  gotchas: [
    'The board starts with matches, or the bot stalls -> you filled cells yourself; let `start` fill the board.',
    'Gems snap or jump -> `update()` skipped or called with 0 during play; call it every step.',
    'A different battle every reload -> pass a fixed seed; content code never uses `Math.random` (use `m3.api.rng()`).',
    'Foes face away from the heroes -> you mirrored sprites yourself; draw with `a.facing` (heroes right, foes left).',
    'Taps miss gems -> pass logical px (canvas css px scaled to your logical size), not page px.',
    'Tiny text on phones -> use the tall layout with 540 logical px across.',
    'Two sets of damage numbers -> your own number system draws from `onHit`: pass `params.numbers: \'off\'`.'
  ],
  checks: [
    'Same seed, two loads, two window sizes: the same boards and, under autoplay, the same battle.',
    'A swap that matches nothing animates there and back and costs no turn; four in a row leaves a shard.',
    'Your autoplay still finishes; no HUD covers the board at 390 px.'
  ],
  selfcheck: [
    'Trace one turn: key / pointer -> swap -> match -> clear -> fall -> cascade -> settle -> heroAttack -> onHit -> foeTurn -> foeAttack -> idle.',
    'Walk one hit: the Knight (atk 15) after a plain 3-Ember match deals 15 to a wolf, 23 to a slime (weak to Ember, x1.5).',
    'Walk one cascade: a second-step match of 3 weighs 3 x 1.25 = 3.75 gems.'
  ],
  // Starter basket (FORMAT v1.2): the documented extension points of starter/index.html (see starter/README.md).
  starter: {
    name: 'Shardbound',
    modules: 'in the ADDONS SLOT `<script>` (pasted unchanged) or as `<script src>` tags right above it',
    register: 'push it onto `GAME.addons` in the ADDONS SLOT `<script>` of `index.html` (it runs before the game boots, so addons see the first battle and every `?t=` frame) (hooks: `onHit(hit, game)`, `onKey(key, game)`, `update(game, info)`, `draw(g, layer, game)`, `drawUI(g, game)`, `onBattleStart`, `onBattleEnd(result, info, game)`, `onEvent`, `onWave`, `onTurn`, `onScene`, `onNewGame`). New gems, skills, heroes, enemies and stages go in the same slot through `GAME.addGem(id, def)`, `GAME.addSkill(id, def, {hero})`, `GAME.addHero(id, def, {slot})`, `GAME.addEnemy(id, def, {stage, wave})`, `GAME.addStage(stage)`. **Unit positions:** an addon that places anything on or above a unit must use the live `GAME.anchor(id)` (heroes `knight` / `archer` / `herbalist` / `keeper`, foes `f3`, `party`), stay inside `GAME.fieldRect()` and outside `GAME.uiRects()`, and never cover `GAME.boardRect()`',
    hit: '`onHit(hit, game)` runs on the impact frame, after the module wrote the new HP: `hit = {kind: \'damage\' | \'heal\', source, target (foe id, hero id, or \'party\' for heals), enemy, attacker, defender (\'party\' when heroes are hit), amount, raw, hpBefore, hpAfter, killed, crit, weak, skill, ward, x, y}`. Read-only. Feedback helpers: `GAME.shake(px, frames)`, `GAME.flash(color, frames, alpha)`, `GAME.hitStopMs(ms)` (it only delays the battle)',
    draw: '`draw(g, layer, game)` with `layer === \'fx\'`: the logical context (`GAME.W` x `GAME.H`, 960 x 540 or 540 x 960), during a battle, inside the shake, after the stage, characters, board and the module\'s effects, before the HUD',
    rects: '`GAME.uiRects()` (`top`, `card:<hero>`, `party`, `info`, `plate:<foe>`, `banner`, `combo`, the starter\'s `mapPanel` / `endBox`; logical px), `GAME.boardRect()` (the board: never draw over it), `GAME.unitRects()` (heroes and living foes, with `id` and `kind`)',
    field: '`GAME.fieldRect()` (the stage where the characters stand: 12, 48, 456 x 282 wide; 12, 52, 516 x 246 tall; read it, never hard-code it)',
    anchor: '`GAME.anchor(id)` -> `{x, top, left, w, h, cy, footY, dead}` where the hero or foe is drawn now (lunges and hovering included); `\'party\'` = the party bar',
    clock: '`update(game, info)` runs every frame of every scene; `info.dt` is 16.67 ms, or 0 while frozen. A turn takes about 2-6 s of animation. `GAME.hitStopMs(ms)` freezes the battle',
    reset: '`onBattleStart(game)` (each stage) and `onNewGame(game)` (each journey)',
    builtins: { numbers: 'the module draws its own damage and heal numbers: with a number addon (C-11 damage-pop) put `GAME.params.numbers = \'off\';` first in the ADDONS SLOT' },
    keep: '`?auto=1`, `?t=<ms>&freeze=1`, `?seed=`, `?stage=`, `?layout=`, arrows / WASD, Z, Space, Enter, X, T, Tab, 1-4, P, drag and tap swaps, taps on foes and hero cards, `GAME.held`',
    traceFrom: 'the hit site (`onHit` of an autoplay run: the Knight hitting a slime, a weakness hit, Valor Strike, the Colossus\' Quake on the Knight, a heart heal)',
    autoCheck: '`?auto=1` still reaches THE ROAD IS CLEAR'
  },
  offers: {
    'numbers': 'Built-in damage and heal numbers; `params.numbers: \'off\'` hands them to a number addon.',
    'hit-site': 'Every HP change goes through `onHit(hit)` on its impact frame (after the module wrote HP): `{kind, source, target, attacker, defender, amount, hpBefore, hpAfter, killed, crit, x, y}`.',
    'freeze': '`m3.update(0)` freezes the battle; it only delays it.',
    'ui-rects': '`m3.uiRects()` lists the top bar, hero cards, party bar, foe plates, banner and combo badge; `m3.boardRect()` is the board, `m3.fieldRect()` the stage.',
    'anchor': '`m3.anchor(id)` -> `{x, top, w, h, left, cy, footY, dead}` where a hero or foe is drawn now; `m3.unitRects()` = heroes and living foes with ids.',
    'battle-start': 'A battle starts at `m3.start({...})`; each wave fires `onEvent({kind: \'waveStart\'})`.'
  }
};

// Basket hint for A-11 horde-survival: how to wire the module into an UNKNOWN game, by role, and the starter's extension points.
// Never name a host's functions here. {{key}} = parameter value chosen for this combo. (Coordinator: copy to tools/basket/horde-survival.mjs.)
export default {
  stage: 'systems',
  does: 'Adds a top-down horde survival mode: the hero only walks (keys or a touch stick) while its weapons fire by themselves on timers (orbiting blades, a bolt at the nearest foe, a burning area pulse with knockback, a lance that pierces a line where the hero faces); foes spawn just outside the view in rising waves (rings, packs, elites) and swarm in with separation; kills drop XP gems that fly to the hero inside a pickup reach; each level pauses the world and offers 1 of N upgrades; a timer and kill count run; a boss arrives at the end; win and lose banners. Seeded, frame-stepped, fast with hundreds of foes; weapons, foes, upgrades and waves are plain data; a bot plays through the same input.',
  params: {
    enemyCap: 'create `params.enemyCap`', spawnRate: 'create `params.spawnRate`', duration: 'create `params.duration` (seconds until the boss)', heroSpeed: 'create `params.heroSpeed`',
    magnet: 'create `params.magnet`', startWeapon: 'create `params.startWeapon`', choices: 'create `params.choices`', hpScale: 'create `params.hpScale`',
    dawn: 'create `params.dawn` (s after the boss until dawn)', numbers: 'create `params.numbers` (off when another element draws damage numbers)'
  },
  steps: [
    ['How your game maps onto it (decide before coding)',
      'Your hero becomes the walker (`look: \'hero\'`); your monsters become foes `{look, gait: \'hop\'|\'fly\'|\'float\'|\'glide\'|\'stomp\', h, r, hp, speed, dmg, xp, move: \'chase\'|\'drift\'|\'swoop\'|\'keep\'}` (single-pose art never walks on legs: give it a gait); a hero walk sheet goes in `heroFrames: {n, stride}` (`paintActor` then gets `frame`); your attacks become weapons `{kind: \'orbit\'|\'nearest\'|\'pulse\'|\'lance\'|\'custom\', levels: [...]}`; this is a mode of your game: keep your title, menus and other modes.'],
    ['Once, where the mode starts',
      '`run = GameDNA_HordeSurvival.create({view: {x: 0, y: 0, w, h} (your logical canvas), seed, params: {enemyCap: {{enemyCap}}, spawnRate: {{spawnRate}}, duration: {{duration}}, heroSpeed: {{heroSpeed}}, magnet: {{magnet}}, startWeapon: \'{{startWeapon}}\', choices: {{choices}}, hpScale: {{hpScale}}, numbers: \'{{numbers}}\'}, paintActor: (ctx, look, x, footY, {h, facing}) => <paint one still pose of that look, feet at x, footY; true>, onHit: ev => <your hit feedback>, onEnd: (result, info) => <your results code, once>})`; then `run.start({seed})`.'],
    ['Your fixed step (every loop that steps the game, fast-forwards included)',
      '`run.setInput(x, y)` from your held movement keys, then `run.update(stepMs)` once per step, never behind a menu check (it pauses itself under its level-up window). Your autoplay -> `run.setAuto(true)`.'],
    ['Where the mode is drawn',
      'Replace the world drawing with `run.drawWorld(ctx)`, then your effects, then `run.drawUI(ctx)`; keep your HUD overlays and result screens after it.'],
    ['Your input during the mode',
      'Left / Right / confirm -> `run.key(\'left\'|\'right\'|\'ok\')` (the level-up cards); pointer down / move / up -> `run.pointer(type, x, y)` in logical px (drag = touch stick, tap = take a card). Fresh presses only, not key repeat.'],
    ['Where the run ends',
      'In `onEnd(result, info)` (\'win\' | \'lose\', `info.time`, `info.kills`, `info.level`): run your existing results / game-over code exactly once and set any phase your other code and tests read.']
  ],
  gotchas: [
    'Foes pop in at the screen edge -> you placed spawns yourself; let the wave table spawn them, or `run.spawn(kind, x, y)` outside the view.',
    'Slow with 200+ foes -> your `paintActor` must paint a single still pose (it is cached); never draw per foe yourself.',
    'Foes slide -> single-pose art with legs set to walk; use `gait` hop / fly / float / glide / stomp, or a walk sheet for the hero (`heroFrames`).',
    'A character with a sword or baked light looks wrong walking left -> paint or pick the left-facing art in `paintActor` from `facing`; do not mirror it.',
    'The level-up window never closes -> your confirm key is not forwarded with `run.key(\'ok\')`, or only on key repeat.',
    'Different run every reload -> pass a fixed `seed`; never `Math.random` in a custom weapon (use `api.rng()`).',
    'The run never ends -> `update()` is skipped while your pause / menu flag is set; call it every step of the mode.'
  ],
  checks: [
    'Foes walk in from beyond every screen edge; at 2-3 minutes 200+ are on screen and the frame stays smooth.',
    'Weapons fire alone; gems fly to the hero; a level-up dims the world with 3 cards; Left / Right / confirm or a tap takes one.',
    'The boss arrives at {{duration}} s; its death shows DAWN BREAKS, the hero\'s FALLEN; your results code runs once; your autoplay still finishes.'
  ],
  selfcheck: [
    'Trace one hit: weapon timer -> `onHit` -> kill -> gem -> level -> card -> `update` again.',
    'Grep every place your game changes HP during the mode: none may run while the run is active.',
    'Worked example: a slime at minute 2 has round(8 x (1 + 2 x 0.55 x {{hpScale}})) HP; Seeker Bolt level 3 deals 15 per hit before Might.'
  ],
  // Starter basket (FORMAT v1.2): the documented extension points of starter/index.html (see starter/README.md).
  starter: {
    name: 'The Long Vigil',
    modules: 'in the ADDONS SLOT `<script>` (pasted unchanged) or as `<script src>` tags right above it',
    register: 'push it onto `GAME.addons` in the ADDONS SLOT `<script>` of `index.html` (it runs before the game boots, so addons see the first run and every `?t=` frame) (hooks: `onHit(ev, game)`, `onKey(key, game)`, `update(game, info)`, `draw(g, layer, game)`, `drawUI(g, game)`, `onRunStart(game)`, `onRunEnd(result, info, game)`, `onScene`, `onEvent`, `onKill`, `onLevel`, `onPick`). New weapons, foes and upgrades go in the same slot through `GAME.addWeapon(id, def)`, `GAME.addEnemy(id, def, {mix: {from, to, weight}, event: {at, kind, n}})`, `GAME.addUpgrade(id, def)`. **Unit positions:** use the live `GAME.anchor(id)` (`\'hero\'` or a foe id `\'e<n>\'`, screen px where it is drawn this frame) and avoid `GAME.uiRects()` (XP bar, timer, kills, slots, boss bar, level-up cards, banner)',
    hit: '`onHit(ev, game)` runs on the frame of every HP change, after the module wrote the new HP: `ev = {kind: \'damage\' | \'heal\', target (\'hero\' or \'e<n>\'), enemy, source (weapon id, \'arrow\', \'slam\', a foe kind, \'potion\'), amount, hpBefore, hpAfter, killed, x, y (WORLD px; use GAME.anchor(ev.target) for the screen), boss, elite}`. Read-only; hundreds per second in a swarm. Helpers: `GAME.shake(px)`, `GAME.flash(color, frames, alpha)`, `GAME.hitStopMs(ms)`',
    draw: '`draw(g, layer, game)` with `layer === \'fx\'`: the 640x360 logical context (already scaled to the HD backing store), during a run, after the world (ground, gems, cast, shots, the module\'s numbers), before the HUD and the level-up window',
    rects: '`GAME.uiRects()` (the module\'s xpBar, level, timer, kills, slots, bossBar, alert, stick, levelTitle, card, banner and the starter\'s title / results panels; logical px, last drawn frame) and `GAME.unitRects()` (the hero and every on-screen foe\'s sprite box with `id`)',
    field: 'the whole canvas `{x: 0, y: 0, w: 640, h: 360}` (the HUD is in `GAME.uiRects()`)',
    anchor: '`GAME.anchor(id)` -> `{x, footY, top, left, w, h, cy, dead}` where the unit is drawn this frame (camera and shake included); `\'hero\'` or a foe id `\'e<n>\'` (from `ev.target` or `GAME.H.enemies()`); a killed foe keeps answering with `dead: true` if it was asked before',
    clock: '`update(game, info)` runs every tick of every scene; `info.dt` is 16.67 ms, 0 while paused. The world also stands still under the level-up window (the module pauses itself): spawn nothing time-based then',
    reset: '`onRunStart(game)`',
    builtins: { numbers: 'set `GAME.flags.builtinNumbers = false` in the slot (the module\'s own hit numbers); keep `builtinShake` and `builtinFlash` unless the addon shakes or flashes itself' },
    keep: '`?auto=1`, `?t=<ms>&freeze=1`, `?seed=`, `?speed=`, keys P (autoplay) and Z, arrows / WASD walking through `GAME.held`, drag stick and card taps',
    traceFrom: 'the hit site (`onHit` during an autoplay run: one bolt hit on a foe, one contact hit on the hero)',
    autoCheck: '`?auto=1` still plays seed 7 to DAWN BREAKS (or FALLEN)'
  },
  offers: {
    'hit-site': 'Every HP change of a run goes through `onHit(ev)` on its frame (after the module wrote HP): `{kind, target, enemy, source, amount, hpBefore, hpAfter, killed, x, y (world), boss, elite}`.',
    'freeze': '`run.hitStop(ms)` (or `update(0)`) freezes the run; it only delays it. `run.pause(true)` stops it.',
    'ui-rects': '`run.uiRects()` lists the HUD pieces (xpBar, level, timer, kills, slots, bossBar, alert, stick, levelTitle, card, banner) of the last drawn frame, in view px.',
    'anchor': '`run.anchor(id)` -> `{x, footY, top, left, w, h, cy, dead}` where the unit is drawn this frame; `run.unitRects()` = the hero and on-screen foes with ids.',
    'battle-start': 'A run starts at `run.start({...})`.'
  }
};

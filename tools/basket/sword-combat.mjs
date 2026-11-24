// Basket hint for A-05 sword-combat: how to wire the module into an UNKNOWN game, by role.
// Never name a host's functions here. {{key}} = parameter value chosen for this combo.
export default {
  stage: 'systems',
  does: 'Real-time sword fights on the map. The hero swings a sword (anticipation, active and recovery frames, a sweeping arc hitbox, 4- or 8-way) in a 2-3 hit combo with a buffered press; struck enemies flash, slide back with friction and puff when defeated, sometimes dropping hearts or gems. After being hit the hero flickers half-transparent and cannot be hurt. Enemies are small state machines: wander, chase, telegraphed charge (lane marked on the floor), keep-distance shooter (aim line, projectiles), and a boss that mixes them. The module owns all of that and draws enemies, sword, projectiles, drops and hearts; the game keeps its map, walls, hero, walking, scenes, quests and dialogue.',
  params: {
    dirs: 'create `params.dirs`', antic: 'create `params.antic`', active: 'create `params.active`', recover: 'create `params.recover`',
    combo: 'create `params.combo`', buffer: 'create `params.buffer`', reach: 'create `params.reach`', arc: 'create `params.arc`',
    knockback: 'create `params.knockback`', friction: 'create `params.friction`', iframes: 'create `params.iframes`', hitstop: 'create `params.hitstop`',
    telegraph: 'create `params.telegraph`', enemySpeed: 'create `params.enemySpeed`', hearts: 'create `params.hearts` (only if the game has no HP of its own; else pass `hp`)',
    overlay: 'create `params.overlay` (debug hitboxes)'
  },
  steps: [
    ['Where a new game starts (after the hero object and the map exist)',
      '`sc = GameDNA_SwordCombat.create({player: <the hero object; its feet box {x, y, w, h} in world px>, playerId: <the hero\'s id>, solid: (x, y, w, h) => <the game\'s wall test, NPCs and chests included>, bounds: <world rect enemies may roam>, seed, hp: {get, set, max} <the game\'s own HP variables>, onHit, onDefeat, onPlayerDown, params: {dirs: {{dirs}}, antic: {{antic}}, active: {{active}}, recover: {{recover}}, combo: {{combo}}, buffer: {{buffer}}, reach: {{reach}}, arc: {{arc}}, knockback: {{knockback}}, friction: {{friction}}, iframes: {{iframes}}, hitstop: {{hitstop}}, telegraph: {{telegraph}}, enemySpeed: {{enemySpeed}}, hearts: {{hearts}}, overlay: \'{{overlay}}\'}})`.'],
    ['Where the game creates its enemies (map load, room entry)',
      '`sc.spawn({id, brain, look, x, y, hp})` with the same ids and positions; brain by role: roamer `wander`, pursuer `chase`, rusher `charge`, ranged `shooter`, boss `warden`. On a room or level change `sc.clear()` first. Keep the game\'s enemy list readable (refresh it from `sc.enemies()` each step) if other code reads it.'],
    ['The old combat (separate battle screen, touch-to-fight trigger, old enemy AI, old invulnerability blink)',
      'Stop entering it but keep its functions. What it counted moves into callbacks: `onDefeat` -> the defeated counter and quest progress; `onPlayerDown` -> the game-over code. The HUD keeps showing the same HP variables.'],
    ['The fixed 60 Hz step, map scene only (also run by `?t=` fast-forward)',
      '`if (sc.update({x, y, attack, aim}) === false) return;` then the hero\'s walking only when `sc.canMove()`. `x`, `y` are the held directions; `attack` is latched on keydown and cleared after this step reads it. While a dialogue or menu is open: no `update()`. The confirm key talks or opens when something is in front, else it swings. During a swing the hero faces `sc.pose().face`.'],
    ['The map draw pass',
      'After the tiles: `sc.draw(ctx, -camX, hudH - camY, {layer: \'below\'})`; then the y-sorted sprites with `sc.sprites(-camX, hudH - camY)` added (or keep the game\'s own enemy art and use `sc.enemyAlpha(e)`); the hero drawn with `globalAlpha = sc.playerAlpha()`; then `sc.draw(..., {layer: \'above\'})`; HUD last.'],
    ['The game\'s autoplay', 'Keep its route to NPCs, chests and exits; give its next waypoint (world px) to `sc.autopilot({next, speed: <walk speed>})` and use the result as the input whenever it has a `target` or `danger` (it scores moves by the danger along the path and fights).']
  ],
  gotchas: [
    'The hero never swings when tapping fast -> the attack is read from the held state; latch it on keydown.',
    'Swinging while a dialogue is open, or talking swings -> skip `update()` while a box is open; try talk/open first, swing otherwise.',
    'The hero vanishes after a hit -> the old blink sets alpha 0; use `sc.playerAlpha()` (0.4 at least).',
    'Enemies walk through walls or never leave a corner -> `solid` misses tiles or uses screen px; it takes world px, the same as the hero box.',
    'Autoplay stands still next to an enemy or walks into shots -> it still uses the old route only; feed the waypoint to `sc.autopilot()`.',
    'Defeated counter stays 0 / the quest never advances -> move the old battle\'s counters into `onDefeat`.',
    'Effects missing in `?t=&freeze=1` shots -> `update()` runs only in the requestAnimationFrame loop; call it from the shared step.'
  ],
  checks: [
    'A swing shows the blade and an arc trail; struck enemies flash, slide back and stop; three timed taps play the combo (the third is the bigger finisher).',
    'After a hit the hero flickers half-transparent (never invisible) and takes no damage for about 1 s.',
    'A rusher shakes and marks its lane before charging and is stunned when it hits a wall; a ranged enemy shows a dotted aim line, then fires.',
    'Autoplay still finishes the game; dialogue, title and restart work.'
  ],
  selfcheck: [
    'Trace one swing: keydown -> latch -> `update({attack: true})` -> 4 antic + 4 active + 10 recovery frames -> `onHit` -> knockback about 15 px.',
    'Trace a contact hit, then a second body touching the hero during the next 60 frames: no damage.',
    'Trace autoplay from the title to the end: every quest step is reached, `update()` runs in the fast-forward loop.'
  ],
  // Starter basket (FORMAT v1.2): the documented extension points of starter/index.html (see starter/README.md).
  starter: {
    name: 'Thornvale',
    modules: 'in the ADDONS SLOT `<script>` (pasted unchanged) or as `<script src>` tags right above it',
    register: 'push it onto `GAME.addons` in the ADDONS SLOT `<script>` of `index.html` (it runs before the game boots, so addons see the first room and every `?t=` frame) (hooks: `gate(game)`, `beforeHit(ev, game)`, `onHit(ev, game)`, `onDefeat(enemy, ev, game)`, `onKey(key, game)`, `update(game, info)`, `draw(g, layer, game)` with layers `begin | ground | fx | end | overlay`, `wrapSprite(g, id, rect, drawFn, game)`, `onRoomStart(roomId, game)`, `onPhase`, `onEvent`, `onEnd`)',
    hit: '`onHit(ev, game)` runs on the hit frame, after the module applied HP, knockback and i-frames. `ev.kind` is `melee | contact | charge | projectile | host`; `ev.target` is `\'hero\'` or an enemy id; `amount` is the HP removed; `ev.strength` is `light | heavy | finisher` (finisher = the combo\'s third hit or a killing blow); `ev.killed`; `ev.screen` is the contact point in native screen px; `ev.dir` the blow\'s unit direction. Feedback helpers: `GAME.shake(px, frames)`, `GAME.flash(color, frames, alpha)`',
    draw: '`draw(g, layer, game)` with `layer === \'fx\'`: the native 256x224 context, after the sprites, sword, projectiles and sparks, inside the field clip and shake, before the HUD',
    rects: '`GAME.uiRects()` (HUD bar, intro box, room banner and result window while shown; native px)',
    field: 'the play field `GAME.field` (`{x: 0, y: 16, w: 256, h: 208}`)',
    anchor: '`GAME.anchor(id)` -> `{x, top, w, h, left, cy, footY, dead}` (sprite box, native screen px); `GAME.units()` lists the hero and the living enemies',
    clock: '`update(game, info)` runs every frame; `info.dt` is the world time advanced this frame in ms (16.67, or 0 while held). An addon\'s `gate(game)` runs first in every play step: return false to hold the whole world for that step (presses stay latched). `GAME.hitStopMs(ms)` holds it too; set `GAME.flags.builtinHitStop = false` when your addon owns the hit-stop',
    reset: '`onRoomStart(roomId, game)`',
    builtins: { numbers: 'nothing to turn off: the starter draws no damage numbers (keep `GAME.flags.builtinShake`: it is hit feedback, not numbers)', sparks: '`GAME.flags.builtinSparks = false`', shake: '`GAME.flags.builtinShake = false` and `GAME.flags.builtinHitStop = false`' },
    keep: '`?auto=1`, `?t=<ms>&freeze=1`, `?seed=`, `?dirs=`, `?hearts=`, `?overlay=`, keys P (autoplay), H (hitboxes), Esc (pause)',
    traceFrom: 'the hit site (`onHit` of an autoplay sword hit and of a contact or projectile hit on the hero)',
    autoCheck: '`?auto=1` still clears all four rooms and reaches THE VALE IS SAFE'
  },
  offers: {
    'hit-site': 'Every HP change arrives in the module\'s `onHit(ev)` (sword, contact, charge, projectile, host damage), on the step it lands, after i-frame checks: `ev.target`, `ev.amount`, `ev.at` (world px), `ev.dir`, `ev.strength`, `ev.killed`.',
    'freeze': 'Pass `onHitStop: ms => <your single freeze>` to `create` so the module never freezes on its own; while frozen, skip `sc.update()` and the hero\'s walking.',
    'ui-rects': 'The hearts rect comes from `sc.uiRects()` (after `drawHearts`).',
    'anchor': '`sc.anchor(id, -camX, hudH - camY)` -> `{x, top, left, w, h, cy, footY, dead}` of the hero or an enemy sprite in screen px (valid during the death puff).',
    'battle-start': 'Rooms or levels start where you call `sc.clear()` and spawn.'
  }
};

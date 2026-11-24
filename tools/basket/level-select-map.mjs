// Basket hint for B-05 level-select-map: how to wire the module into an UNKNOWN game, by role.
// Never name a host's functions here. {{key}} = parameter value chosen for this combo.
export default {
  stage: 'systems',
  does: 'Adds an overworld map scene between levels: level, secret, bonus, castle, hut and shop nodes joined by paths. The hero walks node to node; confirm enters a level; when the game reports a clear, the next path is drawn stone by stone (camera follows, one sound per stone) and the node turns blue with a flag; a secret exit opens a different path; locked paths show faint; huts save through the game; the map scrolls when bigger than the screen. The module draws its own terrain, hero, panel, toasts and iris, and has its own autopilot.',
  params: {
    walk: 'create `params.walk`', reveal: 'create `params.reveal`', spacing: 'create `params.spacing`', terrain: 'create `params.terrain`',
    locked: 'create `params.locked`', panel: 'create `params.panel`', iris: 'create `params.iris`', camera: 'create `params.camera`'
  },
  steps: [
    ['Your levels (read the game first: what one level is, where it starts and ends)',
      'One map node per level. A game with ONE level gets 3-4 without new art: split it at its checkpoints (level k spawns at checkpoint k and ends on reaching checkpoint k+1, the last at the real goal) or replay it with variants. The last level is the `castle`; one level gets a secret exit from something the game already has (a hidden spot, all coins) leading to a `bonus` node; add one `hut`.'],
    ['Your scene switch',
      'Add a map scene: title -> map -> level -> map ... -> castle cleared -> the game\'s own win screen (keep its state names, other code checks them). Game over stays as it was.'],
    ['Where a run starts (and restarts)',
      '`worldMap = GameDNA_LevelMap.create({nodes, edges, view: {x: 0, y: 0, w, h}, state, params: {walk: {{walk}}, reveal: {{reveal}}, spacing: {{spacing}}, terrain: \'{{terrain}}\', locked: \'{{locked}}\', panel: \'{{panel}}\', iris: \'{{iris}}\', camera: \'{{camera}}\'}, enterLevel, onSave, onSound, auto, enabled})` in a NEW variable name (many games already have a `map`). `nodes` = `{id, x, y, kind, name}` in map px, `edges` = `{a, b, via: [[x, y]], exit: \'normal\' | \'secret\'}`. `enterLevel(id)` sets that level up exactly the way the game started its level (keep the run\'s lives and score), then switches to the level scene. `auto: () => <the game\'s autoplay flag>`, `enabled: () => <the map scene is shown>`.'],
    ['Where a level ends',
      'Goal reached: `worldMap.complete(id, gotSecret ? \'both\' : \'normal\')` and back to the map scene, except the castle (go to the win screen). Life lost: keep the game\'s rule (respawn at its checkpoint, or `worldMap.fail(id)` back to the map).'],
    ['Your fixed 60 Hz step',
      'While the map scene is shown, `worldMap.update({left, right, up, down, confirm})` once per step instead of the level update: held directions including up/down, `confirm` = the jump/OK press of this step. A tap between two steps must still reach it.'],
    ['Your draw pass', 'While the map scene is shown, `worldMap.draw(ctx)` instead of the level (HUD after it, its rects in `avoid`).']
  ],
  gotchas: [
    'Page error "already declared" -> the game has its own `map`; use another name.',
    'The hero never moves on the map -> up/down are not passed, or `update` is not called in the map scene; the map takes input only from `update` / `key`.',
    'A level is entered again the moment the map shows -> a confirm still held from the result screen: pass the press of this step, not the held key (the module also waits for a release).',
    'Autoplay stops on the map -> pass `auto: () => <autoplay flag>`; the game\'s own autopilot never drives the map.',
    'Lives, score or coins reset between levels -> `enterLevel` called the full new-game reset; keep the run state across levels.',
    'The win screen never shows -> the castle\'s clear must still go to the game\'s own win scene.'
  ],
  checks: [
    'The map shows faint locked paths one step ahead; arrows walk node to node; confirm enters a level.',
    'A clear reveals the next path stone by stone (camera follows), then the node turns blue with a flag; the secret exit opens the bonus path.',
    'The hut saves; a map bigger than the screen scrolls; `?auto=1` reaches the win screen with no console errors.'
  ],
  selfcheck: [
    'Trace autoplay: title -> map -> `enterLevel` -> level -> goal -> `complete` -> map -> reveal -> next level ... -> castle -> win screen.',
    'Every edge names existing node ids; every level node is reachable from the start.',
    'Trace a life lost and a game over: the same screens as before.'
  ],
  // Starter basket (FORMAT v1.2): the documented extension points of starter/index.html (see starter/README.md).
  starter: {
    name: 'Gullwing Trail',
    modules: 'with a `<script src>` (or pasted unchanged) in the ADDONS SLOT, before the code that uses it',
    register: 'push it onto `GAME.addons` in the ADDONS SLOT `<script>` at the end of `index.html` (it runs before the game boots, so addons see the first scene and every `?t=` frame) (hooks: `beforeHit(ev, game)`, `onHit(ev, game)`, `onKey(key, game)`, `update(game, info)`, `draw(g, layer, game)`, `onLevelStart(id, game)`, `onLevelEnd(result, game)`, `onPhase(scene, game)`, `onMapEvent(ev, game)`)',
    hit: '`onHit(ev, game)` runs on the hit frame, right after the hit site `GAME.applyHit(ev)` changed HP (inside levels only; the map has no hits). `ev.kind` is `damage` (`ev.crit` on critical sword hits) or `heal` (heart pickups, `amount` clamped); `ev.cause === \'fall\'` is a pit death (skip it); `ev.target` is `hero` or an enemy id. Kinds for an effect: `damage` -> `\'crit\'` if `ev.crit`, else `\'damage\'`; `heal` -> `\'heal\'`. Feedback helpers: `GAME.hitStopMs(ms)`, `GAME.shake(px, frames)`, `GAME.flash(color, frames, alpha)`',
    draw: '`draw(g, layer, game)` with `layer === \'fx\'`: the native 256x224 buffer; in a level after the actors and built-in sparks, before the HUD band and banner; on the map after the map world, before its panel',
    rects: '`GAME.uiRects()` (level: HUD band `{0, 0, 256, 16}` and the banner while shown; map: the panel, toasts, run plate and shop window; native px)',
    field: 'the level view `{x: 0, y: 16, w: 256, h: 208}` (below the HUD band)',
    anchor: '`GAME.anchor(id)` -> `{x, top, w, h, footY, cy, left, dead}` (screen px, camera applied); ids are `hero` and the enemy ids in `GAME.L.enemies` (`crab-n`, `gull-n`, `warden`); `GAME.units()` lists the living ones',
    clock: '`update(game, info)` runs every 60 Hz frame in every scene; `info.dt` is the world time advanced this frame in ms (16.67, or 0 while frozen by hit-stop or pause), `info.scene` the scene. Call `dn.update(info.dt)` there. `GAME.hitStopMs(ms)` freezes the level',
    reset: '`onLevelStart(id, game)` (every level entry, including retries)',
    builtins: { numbers: '`GAME.flags.builtinPopups = false` (keep `builtinShake`: it is hit feedback, not numbers)' },
    keep: '`?auto=1`, `?t=<ms>&freeze=1`, `?seed=`, `?level=<id>`, `?mute=1`, keys P (autoplay), arrows, Z, X, map clicks',
    traceFrom: '`GAME.applyHit` (an autoplay sword hit on a crab and a crab touching the hero)',
    autoCheck: '`?auto=1` still reaches the ending (THE TRAIL IS YOURS)'
  },
  offers: {
    'ui-rects': 'The map panel and toasts are `worldMap.getUIRects()` (canvas px, from the last draw); the map hero is `worldMap.player()`.',
    'battle-start': 'Levels start in `enterLevel(id)`; that is where per-level effects reset.'
  }
};

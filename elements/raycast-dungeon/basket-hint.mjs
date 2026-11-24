// Basket hint for K-03 raycast-dungeon: how to wire the module into an UNKNOWN game, by role, and the starter's extension points.
// Never name a host's functions here. {{key}} = parameter value chosen for this combo.
// (Coordinator: copy to tools/basket/raycast-dungeon.mjs.)
export default {
  stage: 'systems',
  does: 'Adds a first-person grid dungeon crawl drawn by raycasting: seeded floors (rooms, maze corridors, loops, doors, torches, a stair arch, a boss on the last floor) or floors from data; the hero steps one cell and turns 90 degrees with tweens, strikes what stands in front with a first-person sword, opens doors, drinks tonics and takes the stairs, then every awake monster moves or attacks. One DDA ray per screen column with the perpendicular distance (no fisheye, no gaps), code-drawn 64 x 64 textures, cast floors and ceilings, torch light, lantern and fog, billboard monsters and items hidden by walls column by column, with idle, wind-up, strike and hurt frames and a solid white hit flash. HUD, minimap, full map, message log, floor banner, combat labels that never cover a character or the HUD. Seeded and fixed-step (same seed = same run at any view size); a bot plays through the same rules.',
  params: {
    floors: 'create `params.floors`', size: 'create `params.size` (cells)', rooms: 'create `params.rooms`', doors: 'create `params.doors`', density: 'create `params.density` (monster budget)',
    fov: 'create `params.fov` (degrees)', fog: 'create `params.fog`', lantern: 'create `params.lantern` (cells)', minimap: 'create `params.minimap`', numbers: 'create `params.numbers` (`off` when the basket has a damage-number addon)'
  },
  steps: [
    ['How your game maps onto it (decide before coding)',
      'The crawl becomes a mode of your game (entered where your game starts a level); your monsters may become monster entries `{name, look (slime, bat, knight, king), palette, hp, atk, def, xp, speed, sight, evade, weight, minFloor, maxFloor}`, your pick-ups item entries `{name, look (flask, coins, amulet), color, effect: {heal, gold, atk, def, maxHp}, carry}`, your levels hand-made floors `{floor, rows: [...]}` (formats in the module README). Built-in monsters, items and floors ship.'],
    ['Once, where the dungeon mode starts',
      '`rd = GameDNA_RaycastDungeon.create({view: {x: 0, y: 0, w, h} (your logical canvas), seed, params: {floors: {{floors}}, size: {{size}}, rooms: {{rooms}}, doors: {{doors}}, density: {{density}}, fov: {{fov}}, fog: {{fog}}, lantern: {{lantern}}, minimap: \'{{minimap}}\', numbers: \'{{numbers}}\'}, onHit: hit => <your hit feedback>, onEvent: ev => <your sounds / banners>, onEnd: (result, info) => <your win / lose code, once>})`; per run `rd.start({seed})`.'],
    ['Your fixed step (every loop that steps the game, fast-forwards included)',
      '`rd.setHeld({up, down, left, right})` from your held keys, then `rd.update(stepMs)` once per step, `0` while your world is frozen; never behind a menu or animation check.'],
    ['Where the dungeon is drawn',
      'Smoothing off, an integer number of device px per logical px (logical width about 200 on phones, 420 on desktops); `rd.drawScene(ctx)`, then your effects, then `rd.drawUI(ctx)`; keep your own title and result screens after it.'],
    ['Your input while the dungeon runs',
      'Keys -> `rd.key(\'up\' | \'down\' | \'left\' | \'right\' (turn) | \'strafeleft\' | \'straferight\' | \'attack\' | \'wait\' | \'potion\' | \'map\')`; taps -> `rd.pointer(\'down\', x, y)` in logical px; on phones touch buttons for those keys. Your autoplay -> `rd.setAuto(true)`.'],
    ['Where the run ends',
      'In `onEnd(result, info)` (`\'win\'` | `\'lose\'`): run your existing win / lose code exactly once, set any phase your other code and tests read.']
  ],
  gotchas: [
    'Walls bow when turning or show thin gaps -> you drew walls yourself or scaled the view by a fraction; let `drawScene` draw at the view size.',
    'A monster shows through a wall corner -> you drew monsters over the view; let the module draw them (per-column depth).',
    'Monsters freeze while a menu is open -> `update()` is skipped; call it every step.',
    'Different floors every reload -> pass a fixed seed to `start`; no `Math.random` in content code (use `rd.rng()`).',
    'Tiny HUD text on phones -> fractional canvas scale or a desktop-sized view; pick about 200 logical px across.',
    'Taps miss -> pass logical px (canvas css px scaled to your logical size), not page px.',
    'Two sets of damage numbers -> your own number system draws from `onHit`: pass `params.numbers: \'off\'` and place yours with `rd.anchor(id)` outside `rd.unitRects()` and `rd.uiRects()`.'
  ],
  checks: [
    'Same seed, two loads, two window sizes: the same floors and, under autoplay, the same run.',
    'Turning in place: walls stay straight, no gaps between wall columns; a monster behind a corner is cut off by it.',
    'A hit monster flashes solid white, then shows its hurt pose; a miss shows MISS; your autoplay still finishes a run.'
  ],
  selfcheck: [
    'Trace one run: start -> update each step -> key -> step -> strike -> onHit -> monsters act -> stair arch -> floorStart -> onEnd once -> your next screen.',
    'Walk one hit: hero attack 5 vs a monster with defence 1 deals 4-6 (x1.5 rounded up on a crit).',
    'Walk one level: 10 XP takes the hero from level 1 to 2 (+6 max HP, +1 attack).'
  ],
  // Starter basket (FORMAT v1.2): the documented extension points of starter/index.html (see starter/README.md).
  starter: {
    name: 'Hollowstair',
    modules: 'in the ADDONS SLOT `<script>` (pasted unchanged) or as `<script src>` tags right above it',
    register: 'push it onto `GAME.addons` in the ADDONS SLOT `<script>` of `index.html` (it runs before the game boots, so addons see the first floor and every `?t=` frame) (hooks: `onHit(hit, game)`, `onKey(key, game)`, `update(game, info)`, `draw(g, layer, game)`, `drawUI(g, game)`, `onFloorStart(ev, game)`, `onTurn`, `onPickup`, `onDeath`, `onEvent`, `onEnd(result, info, game)`, `onScene`, `onNewGame`). New monsters, items and hand-made floors go in the same slot through `GAME.addEnemy(id, def)`, `GAME.addItem(id, def)`, `GAME.addMap(id, def)` (`GAME.shipped` is a read-only record of the built-in ids: never write to it). **Unit positions:** an addon that places anything on or beside a unit must use the live `GAME.anchor(id)` (monster ids `e12`; `\'hero\'` is the first-person sword at the lower right), skip anchors with `hidden: true`, and avoid `GAME.unitRects()` and `GAME.uiRects()`, staying inside `GAME.fieldRect()`',
    hit: '`onHit(hit, game)` runs on the impact frame, after the module wrote the new HP, for the hero\'s and the monsters\' attacks: `hit = {kind: \'damage\', source, target (\'hero\' or a monster id), attacker, defender (monster kind or \'hero\'), raw, amount (HP actually lost, 0 on a miss), hpBefore, hpAfter, killed, crit, miss, x, y}`. Read-only. Feedback helpers: `GAME.shake(px, frames)`, `GAME.flash(color, frames, alpha)`, `GAME.hitStopMs(ms)` (it only delays the turn)',
    draw: '`draw(g, layer, game)` with `layer === \'fx\'`: the logical context (`GAME.view()` = `{w, h, scale}`, already scaled to whole device px), during play, inside the shake, after the 3D view (walls, billboards, light, fog) and the sword, before the HUD; positions are screen px (`GAME.anchor`)',
    rects: '`GAME.uiRects()` (the module\'s `hud`, `minimap`, `log`, `banner`, `map`, the starter\'s `endBox`; logical px) and `GAME.unitRects({pad: 6})` (the hero\'s sword and EVERY visible monster\'s billboard box with `id` and `kind`, grown by `pad`: pass all of them, not only the target, to anything that places text near characters)',
    field: '`GAME.fieldRect()` (the 3D view: the canvas minus the HUD strip; about 420 x 220 on desktops, 200 x 160 on phones; always read it, never hard-code it)',
    anchor: '`GAME.anchor(id)` -> `{x, top, left, w, h, cy, footY, dead, hidden, depth}` where a monster\'s billboard is drawn now (it grows as the monster comes closer, clipped to the view; it keeps answering while a monster dissolves); `GAME.C.enemies()` lists them (ids like `e12`)',
    clock: '`update(game, info)` runs every frame of every scene; `info.dt` is 16.67 ms, or 0 while frozen. Turns are input-driven; a step tweens in 170 ms, a monster attack takes 470 ms. `GAME.hitStopMs(ms)` freezes the dungeon',
    reset: '`onFloorStart(ev, game)` (each floor) and `onNewGame(game)` (each run)',
    builtins: { numbers: 'the module draws its own combat labels beside the defender: with a number addon (C-11 damage-pop) put `GAME.params.numbers = \'off\';` first in the ADDONS SLOT' },
    keep: '`?auto=1`, `?t=<ms>&freeze=1`, `?seed=`, `?floors=`, `?fov=`, `?fog=`, `?minimap=`, arrows / WASD, Q / E turns, A / D steps aside, Z, Space, C, M, P, taps on the view, the minimap and the tonic icon, the touch pad, `GAME.held`',
    traceFrom: 'the hit site (`onHit` of an autoplay run: the hero hitting a slime, a slime hitting the hero, a miss on a bat, a crit on the Mire King)',
    autoCheck: '`?auto=1` still reaches THE MIRE KING IS BROKEN'
  },
  offers: {
    'numbers': 'Built-in combat labels; `params.numbers: \'off\'` hands them to a number addon.',
    'hit-site': 'Every attack resolution goes through `onHit(hit)` on its impact frame (after the module wrote HP): `{source, target, attacker, defender, raw, amount, hpBefore, hpAfter, killed, crit, miss, x, y}`.',
    'freeze': '`rd.update(0)` freezes the dungeon; it only delays it.',
    'ui-rects': '`rd.uiRects()` lists the HUD, minimap, log, banner and map; `rd.fieldRect()` is the 3D view.',
    'anchor': '`rd.anchor(id)` -> `{x, top, w, h, left, cy, footY, dead, hidden}` where a monster\'s billboard is drawn now (the hero: the sword); `rd.unitRects()` = sword and visible monsters with ids.',
    'battle-start': 'A run starts at `rd.start({...})`; each floor fires `onEvent({kind: \'floorStart\'})`.'
  }
};

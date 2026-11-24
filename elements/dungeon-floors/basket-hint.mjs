// Basket hint for B-12 dungeon-floors: how to wire the module into an UNKNOWN game, by role, and the starter's extension points.
// Never name a host's functions here. {{key}} = parameter value chosen for this combo.
// (Coordinator: copy to tools/basket/dungeon-floors.mjs.)
export default {
  stage: 'systems',
  does: 'Adds a turn-based dungeon run on seeded floors: random rooms joined by a minimum spanning tree of corridors plus a few loops, doors and arches, autotiled walls (faces, caps, rims, corners), room types with their own floors, decor and torch light, chests, loose items, monsters placed by a per-room budget, stairs in the room farthest from the start and a boss throne on the last floor. The hero steps in 8 directions without cutting corners, bumps to attack, open doors and chests; then every awake monster acts. Shadowcast field of view with lantern and torch light, explored cells remembered, a minimap and a full map, HUD and message log. Seeded and fixed-step (same seed = same run at any view size); a bot plays through the same rules.',
  params: {
    floors: 'create `params.floors`', rooms: 'create `params.rooms`', loops: 'create `params.loops`', doors: 'create `params.doors`', density: 'create `params.density` (monster budget)',
    chests: 'create `params.chests`', light: 'create `params.light` (lantern radius, cells)', width: 'create `params.width` (cells)', height: 'create `params.height` (cells)',
    fog: 'create `params.fog`', minimap: 'create `params.minimap`', numbers: 'create `params.numbers` (`off` when the basket has a damage-number addon)'
  },
  steps: [
    ['How your game maps onto it (decide before coding)',
      'The run becomes a mode of your game (entered where your game starts a level); your monsters may become monster entries `{name, look, palette, hp, atk, def, xp, speed, sight, cost, minFloor, maxFloor}`, your pick-ups item entries `{name, look, color, effect: {heal, gold, atk, maxHp}, carry, weight}`, your level themes room types `{name, weight, floor, decor, budget, chest, light}` (formats in the module README). Built-in rooms, monsters and items ship.'],
    ['Once, where the dungeon mode starts',
      '`df = GameDNA_DungeonFloors.create({view: {x: 0, y: 0, w, h} (your logical canvas), seed, params: {floors: {{floors}}, rooms: {{rooms}}, loops: {{loops}}, doors: {{doors}}, density: {{density}}, chests: {{chests}}, light: {{light}}, width: {{width}}, height: {{height}}, fog: \'{{fog}}\', minimap: \'{{minimap}}\', numbers: \'{{numbers}}\'}, onHit: hit => <your hit feedback>, onEvent: ev => <your sounds / banners>, onEnd: (result, info) => <your win / lose code, once>})`; per run `df.start({seed})`.'],
    ['Your fixed step (every loop that steps the game, fast-forwards included)',
      '`df.setHeld({up, down, left, right})` from your held keys, then `df.update(stepMs)` once per step, `0` while your world is frozen; never behind a menu or animation check.'],
    ['Where the dungeon is drawn',
      'Smoothing off, an integer number of device px per logical px (logical width ~220 on phones, ~460 on desktops); `df.drawScene(ctx)`, then your effects, then `df.drawUI(ctx)`; keep your own title and result screens after it.'],
    ['Your input while the dungeon runs',
      'Keys -> `df.key(\'up\' | \'down\' | \'left\' | \'right\' | \'upleft\' | \'upright\' | \'downleft\' | \'downright\' | \'wait\' | \'potion\' | \'map\')`; taps -> `df.pointer(\'down\', x, y)` in logical px. Your autoplay -> `df.setAuto(true)`.'],
    ['Where the run ends',
      'In `onEnd(result, info)` (`\'win\'` | `\'lose\'`): run your existing win / lose code exactly once, set any phase your other code and tests read.']
  ],
  gotchas: [
    'The hero cuts a wall corner or walks through a closed door -> your code moved it; move only through `df.key` / `df.pointer` / `df.act`.',
    'Monsters freeze while a menu is open -> `update()` is skipped; call it every step.',
    'Different floor every reload -> pass a fixed seed to `start`; no `Math.random` in custom drawing (use `df.rng()`).',
    'Blurry or uneven pixels / tiny HUD on phones -> fractional canvas scale; pick the logical size so device px per art px is whole.',
    'Taps miss cells -> pass logical px (canvas css px scaled to your logical size), not page px.',
    'Numbers or markers over unseen monsters -> skip anchors with `hidden: true`.',
    'Two sets of damage numbers -> your own number system draws from `onHit`: pass `params.numbers: \'off\'`.'
  ],
  checks: [
    'Same seed, two loads, two window sizes: the same floors and, under autoplay, the same run.',
    'The hero cannot step diagonally past a wall corner or through a doorway; bumping a closed door opens it and costs a turn.',
    'Unknown cells black, explored cells dim, monsters only in sight; your autoplay still finishes a run.'
  ],
  selfcheck: [
    'Trace one run: start -> update each step -> key -> step -> bump -> onHit -> stairs -> floorStart -> onEnd once -> your next screen.',
    'Walk one hit: hero attack 5 vs a Bog Slime (defence 0) deals 4-7 (x1.6 on a crit).',
    'Walk one level: 13 XP takes the hero from level 1 to 2 (+5 max HP, +1 attack).'
  ],
  // Starter basket (FORMAT v1.2): the documented extension points of starter/index.html (see starter/README.md).
  starter: {
    name: 'Lanternfall',
    modules: 'in the ADDONS SLOT `<script>` (pasted unchanged) or as `<script src>` tags right above it',
    register: 'push it onto `GAME.addons` in the ADDONS SLOT `<script>` of `index.html` (it runs before the game boots, so addons see the first floor and every `?t=` frame) (hooks: `onHit(hit, game)`, `onKey(key, game)`, `update(game, info)`, `draw(g, layer, game)`, `drawUI(g, game)`, `onFloorStart(ev, game)`, `onPickup`, `onDeath`, `onEvent`, `onEnd(result, info, game)`, `onScene`, `onNewGame`). New room types, monsters and items go in the same slot through `GAME.addRoom(id, def)`, `GAME.addMonster(id, def)`, `GAME.addItem(id, def)`. **Unit positions:** an addon that places anything on or above a unit must use the live `GAME.anchor(id)` (`\'hero\'`, monster ids `m12`), skip anchors with `hidden: true`, and avoid `GAME.unitRects()` and `GAME.uiRects()`, staying inside `GAME.fieldRect()`',
    hit: '`onHit(hit, game)` runs on the impact frame, after the module wrote the new HP, for the hero\'s and the monsters\' attacks: `hit = {kind: \'damage\', source, target (\'hero\' or a monster id), attacker, defender (monster kind or \'hero\'), raw, amount (HP actually lost, 0 on a miss), hpBefore, hpAfter, killed, crit, miss, x, y}`. Read-only. Feedback helpers: `GAME.shake(px, frames)`, `GAME.flash(color, frames, alpha)`, `GAME.hitStopMs(ms)` (it only delays the turn)',
    draw: '`draw(g, layer, game)` with `layer === \'fx\'`: the logical context (`GAME.view()` = `{w, h, scale}`, already scaled to whole device px), during play, inside the shake, after the dungeon, its light and fog, before the HUD; positions are screen px (`GAME.anchor`)',
    rects: '`GAME.uiRects()` (the HUD plates `stats`, `bag`, `floor`, the `minimap`, `boss` bar, message `log`, floor `banner`, `map`, the starter\'s `endBox`; logical px) and `GAME.unitRects()` (the hero and each visible monster, with `id` and `kind`)',
    field: '`GAME.fieldRect()` (the whole view; its size follows the window: about 460 x 260 on desktops, 220 x 230 on phones; always read it, never hard-code it)',
    anchor: '`GAME.anchor(id)` -> `{x, top, left, w, h, cy, footY, dead, hidden, tile}` where the hero or monster is drawn now (hops, flight and a hurt monster\'s HP bar included); `GAME.C.monsters()` lists them (ids like `m12`)',
    clock: '`update(game, info)` runs every frame of every scene; `info.dt` is 16.67 ms, or 0 while frozen. Turns are input-driven; one step animates in 120 ms. `GAME.hitStopMs(ms)` freezes the dungeon',
    reset: '`onFloorStart(ev, game)` (each floor) and `onNewGame(game)` (each run)',
    builtins: { numbers: 'the module draws its own combat numbers over the defender\'s cell: with a number addon (C-11 damage-pop) put `GAME.params.numbers = \'off\';` first in the ADDONS SLOT' },
    keep: '`?auto=1`, `?t=<ms>&freeze=1`, `?seed=`, `?floors=`, `?fog=`, `?minimap=`, arrows / WASD, numpad and Home / PgUp / End / PgDn diagonals, Space, Z, Q, M, P, taps, the touch pad, `GAME.held`',
    traceFrom: 'the hit site (`onHit` of an autoplay run: the hero hitting a bat, a monster hitting the hero, a miss, a crit on the Hollow Crown)',
    autoCheck: '`?auto=1` still reaches THE CROWN IS BROKEN'
  },
  offers: {
    'numbers': 'Built-in combat numbers; `params.numbers: \'off\'` hands them to a number addon.',
    'hit-site': 'Every attack resolution goes through `onHit(hit)` on its impact frame (after the module wrote HP): `{source, target, attacker, defender, raw, amount, hpBefore, hpAfter, killed, crit, miss, x, y}`.',
    'freeze': '`df.update(0)` freezes the dungeon; it only delays it.',
    'ui-rects': '`df.uiRects()` lists the HUD plates, minimap, boss bar, log, banner and map; `df.fieldRect()` is the view.',
    'anchor': '`df.anchor(id)` -> `{x, top, w, h, left, cy, footY, dead, hidden}` where the hero or a monster is drawn now; `df.unitRects()` = hero and visible monsters with ids.',
    'battle-start': 'A run starts at `df.start({...})`; each floor fires `onEvent({kind: \'floorStart\'})`.'
  }
};

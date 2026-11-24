# Add raycast dungeon to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `raycast-dungeon.js` (one global, `GameDNA_RaycastDungeon`), API reference `raycast-dungeon.README.md`

README example names are placeholders.

## Shared premises

1. **Include each module file verbatim; never edit it.** Load it with its own `<script src>` before the game's script, or paste it unchanged into its own `<script>` tag. If a module seems to need a change, adapt my game around it and tell me.
2. **Resolution:** keep my game's native resolution and integer scaling as they are. Call module draw functions on my 2D context inside the same transform as my sprites (one module pixel = one game pixel), and keep my game's own image-smoothing setting (off for pixel art, on for smooth or HD games; never switch it).
3. **Time:** drive every module from one fixed 60 Hz step (1000 / 60 ms). If my loop uses variable delta time, accumulate it and run whole steps (at most 250 ms per frame). Turn/phase logic stays mine; modules still update every step to animate.
4. **Coordinates:** native screen pixels (world minus camera) unless a section says tiles.
5. **Art and names:** anything new you draw or name is original (no real game, character, place or brand names); English UI text; do not restyle my game.
6. **Hook, don't replace:** add calls or change bodies; never delete or rename a function.
7. **Keep every other caller working.** Find every caller and reader of what you change (turn order, input, moves, menus, HUD): autopilot/AI, test hooks, URL parameters such as `?auto=1`, `?t=` and `?freeze=1`, keyboard shortcuts, end-turn buttons. Update each one. My game's own autoplay must still finish a whole game. Keep existing HUD info (HP bars, max HP) and existing commands.

## Order of work

1. **Read the game first.** Write down (file, function) where these live: loop/update step; draw pass and its order (background, actors, effects, HUD); input; where damage/HP changes are applied; where turns, actions or selections are chosen and played; HUD windows and their rects; camera; battle/scene start and end; and every caller from premise 7.
2. **Check the prerequisites** below against those notes. If one is missing, add the smallest working version and tell me.
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Raycast dungeon [systems].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Raycast dungeon:** a fixed 60 Hz update step; key or tap input routed to the dungeon while it runs (forward, back, turn, step aside, strike, wait, tonic, map) and held keys; a canvas 2D context and a logical view rect, ideally an integer number of device px per art px; optional: monsters, items and hand-made floors as data; a place to go when the run is won or lost.

## Element 1: Raycast dungeon (`raycast-dungeon.js`, `GameDNA_RaycastDungeon`)

Adds a first-person grid dungeon crawl drawn by raycasting: seeded floors (rooms, maze corridors, loops, doors, torches, a stair arch, a boss on the last floor) or floors from data; the hero steps one cell and turns 90 degrees with tweens, strikes what stands in front with a first-person sword, opens doors, drinks tonics and takes the stairs, then every awake monster moves or attacks. One DDA ray per screen column with the perpendicular distance (no fisheye, no gaps), code-drawn 64 x 64 textures, cast floors and ceilings, torch light, lantern and fog, billboard monsters and items hidden by walls column by column, with idle, wind-up, strike and hurt frames and a solid white hit flash. HUD, minimap, full map, message log, floor banner, combat labels that never cover a character or the HUD. Seeded and fixed-step (same seed = same run at any view size); a bot plays through the same rules.

**Parameters chosen:** `floors` = 3, `size` = 15, `rooms` = 4, `doors` = 0.5, `density` = 1, `fov` = 76, `fog` = 0.24, `lantern` = 4.5, `minimap` = on, `numbers` = on.

**Where it goes** (by role; find these places in my game):

1. *How your game maps onto it (decide before coding):* The crawl becomes a mode of your game (entered where your game starts a level); your monsters may become monster entries `{name, look (slime, bat, knight, king), palette, hp, atk, def, xp, speed, sight, evade, weight, minFloor, maxFloor}`, your pick-ups item entries `{name, look (flask, coins, amulet), color, effect: {heal, gold, atk, def, maxHp}, carry}`, your levels hand-made floors `{floor, rows: [...]}` (formats in the module README). Built-in monsters, items and floors ship.
2. *Once, where the dungeon mode starts:* `rd = GameDNA_RaycastDungeon.create({view: {x: 0, y: 0, w, h} (your logical canvas), seed, params: {floors: 3, size: 15, rooms: 4, doors: 0.5, density: 1, fov: 76, fog: 0.24, lantern: 4.5, minimap: 'on', numbers: 'on'}, onHit: hit => <your hit feedback>, onEvent: ev => <your sounds / banners>, onEnd: (result, info) => <your win / lose code, once>})`; per run `rd.start({seed})`.
3. *Your fixed step (every loop that steps the game, fast-forwards included):* `rd.setHeld({up, down, left, right})` from your held keys, then `rd.update(stepMs)` once per step, `0` while your world is frozen; never behind a menu or animation check.
4. *Where the dungeon is drawn:* Smoothing off, an integer number of device px per logical px (logical width about 200 on phones, 420 on desktops); `rd.drawScene(ctx)`, then your effects, then `rd.drawUI(ctx)`; keep your own title and result screens after it.
5. *Your input while the dungeon runs:* Keys -> `rd.key('up' | 'down' | 'left' | 'right' (turn) | 'strafeleft' | 'straferight' | 'attack' | 'wait' | 'potion' | 'map')`; taps -> `rd.pointer('down', x, y)` in logical px; on phones touch buttons for those keys. Your autoplay -> `rd.setAuto(true)`.
6. *Where the run ends:* In `onEnd(result, info)` (`'win'` | `'lose'`): run your existing win / lose code exactly once, set any phase your other code and tests read.

**Common mistakes** (symptom -> fix):

- Walls bow when turning or show thin gaps -> you drew walls yourself or scaled the view by a fraction; let `drawScene` draw at the view size.
- A monster shows through a wall corner -> you drew monsters over the view; let the module draw them (per-column depth).
- Monsters freeze while a menu is open -> `update()` is skipped; call it every step.
- Different floors every reload -> pass a fixed seed to `start`; no `Math.random` in content code (use `rd.rng()`).
- Tiny HUD text on phones -> fractional canvas scale or a desktop-sized view; pick about 200 logical px across.
- Taps miss -> pass logical px (canvas css px scaled to your logical size), not page px.
- Two sets of damage numbers -> your own number system draws from `onHit`: pass `params.numbers: 'off'` and place yours with `rd.anchor(id)` outside `rd.unitRects()` and `rd.uiRects()`.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Raycast dungeon] Same seed, two loads, two window sizes: the same floors and, under autoplay, the same run.
- [Raycast dungeon] Turning in place: walls stay straight, no gaps between wall columns; a monster behind a corner is cut off by it.
- [Raycast dungeon] A hit monster flashes solid white, then shows its hurt pose; a miss shows MISS; your autoplay still finishes a run.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `raycast-dungeon.js` sha256 `77849ae4bf29d002...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Raycast dungeon] Trace one run: start -> update each step -> key -> step -> strike -> onHit -> monsters act -> stair arch -> floorStart -> onEnd once -> your next screen.
- [Raycast dungeon] Walk one hit: hero attack 5 vs a monster with defence 1 deals 4-6 (x1.5 rounded up on a crit).
- [Raycast dungeon] Walk one level: 10 XP takes the hero from level 1 to 2 (+6 max HP, +1 attack).
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

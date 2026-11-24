# Add procedural dungeon floors to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `dungeon-floors.js` (one global, `GameDNA_DungeonFloors`), API reference `dungeon-floors.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Procedural dungeon floors [systems].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Procedural dungeon floors:** a fixed 60 Hz update step; key or tap input routed to the dungeon while it runs (8 directions, wait, tonic, map), and held direction keys; a canvas 2D context and a logical view rect, ideally an integer number of device px per art px; optional: room types, monsters and items as data; a place to go when the run is won or lost.

## Element 1: Procedural dungeon floors (`dungeon-floors.js`, `GameDNA_DungeonFloors`)

Adds a turn-based dungeon run on seeded floors: random rooms joined by a minimum spanning tree of corridors plus a few loops, doors and arches, autotiled walls (faces, caps, rims, corners), room types with their own floors, decor and torch light, chests, loose items, monsters placed by a per-room budget, stairs in the room farthest from the start and a boss throne on the last floor. The hero steps in 8 directions without cutting corners, bumps to attack, open doors and chests; then every awake monster acts. Shadowcast field of view with lantern and torch light, explored cells remembered, a minimap and a full map, HUD and message log. Seeded and fixed-step (same seed = same run at any view size); a bot plays through the same rules.

**Parameters chosen:** `floors` = 5, `rooms` = 10, `loops` = 0.25, `doors` = 0.6, `density` = 1, `chests` = 1, `light` = 6.5, `width` = 46, `height` = 34, `fog` = on, `numbers` = on, `minimap` = on.

**Where it goes** (by role; find these places in my game):

1. *How your game maps onto it (decide before coding):* The run becomes a mode of your game (entered where your game starts a level); your monsters may become monster entries `{name, look, palette, hp, atk, def, xp, speed, sight, cost, minFloor, maxFloor}`, your pick-ups item entries `{name, look, color, effect: {heal, gold, atk, maxHp}, carry, weight}`, your level themes room types `{name, weight, floor, decor, budget, chest, light}` (formats in the module README). Built-in rooms, monsters and items ship.
2. *Once, where the dungeon mode starts:* `df = GameDNA_DungeonFloors.create({view: {x: 0, y: 0, w, h} (your logical canvas), seed, params: {floors: 5, rooms: 10, loops: 0.25, doors: 0.6, density: 1, chests: 1, light: 6.5, width: 46, height: 34, fog: 'on', minimap: 'on', numbers: 'on'}, onHit: hit => <your hit feedback>, onEvent: ev => <your sounds / banners>, onEnd: (result, info) => <your win / lose code, once>})`; per run `df.start({seed})`.
3. *Your fixed step (every loop that steps the game, fast-forwards included):* `df.setHeld({up, down, left, right})` from your held keys, then `df.update(stepMs)` once per step, `0` while your world is frozen; never behind a menu or animation check.
4. *Where the dungeon is drawn:* Smoothing off, an integer number of device px per logical px (logical width ~220 on phones, ~460 on desktops); `df.drawScene(ctx)`, then your effects, then `df.drawUI(ctx)`; keep your own title and result screens after it.
5. *Your input while the dungeon runs:* Keys -> `df.key('up' | 'down' | 'left' | 'right' | 'upleft' | 'upright' | 'downleft' | 'downright' | 'wait' | 'potion' | 'map')`; taps -> `df.pointer('down', x, y)` in logical px. Your autoplay -> `df.setAuto(true)`.
6. *Where the run ends:* In `onEnd(result, info)` (`'win'` | `'lose'`): run your existing win / lose code exactly once, set any phase your other code and tests read.

**Common mistakes** (symptom -> fix):

- The hero cuts a wall corner or walks through a closed door -> your code moved it; move only through `df.key` / `df.pointer` / `df.act`.
- Monsters freeze while a menu is open -> `update()` is skipped; call it every step.
- Different floor every reload -> pass a fixed seed to `start`; no `Math.random` in custom drawing (use `df.rng()`).
- Blurry or uneven pixels / tiny HUD on phones -> fractional canvas scale; pick the logical size so device px per art px is whole.
- Taps miss cells -> pass logical px (canvas css px scaled to your logical size), not page px.
- Numbers or markers over unseen monsters -> skip anchors with `hidden: true`.
- Two sets of damage numbers -> your own number system draws from `onHit`: pass `params.numbers: 'off'`.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Procedural dungeon floors] Same seed, two loads, two window sizes: the same floors and, under autoplay, the same run.
- [Procedural dungeon floors] The hero cannot step diagonally past a wall corner or through a doorway; bumping a closed door opens it and costs a turn.
- [Procedural dungeon floors] Unknown cells black, explored cells dim, monsters only in sight; your autoplay still finishes a run.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `dungeon-floors.js` sha256 `d5c995ca0f41a0d1...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Procedural dungeon floors] Trace one run: start -> update each step -> key -> step -> bump -> onHit -> stairs -> floorStart -> onEnd once -> your next screen.
- [Procedural dungeon floors] Walk one hit: hero attack 5 vs a Bog Slime (defence 0) deals 4-7 (x1.6 on a crit).
- [Procedural dungeon floors] Walk one level: 13 XP takes the hero from level 1 to 2 (+5 max HP, +1 attack).
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

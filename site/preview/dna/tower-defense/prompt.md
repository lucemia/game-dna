# Add Tower placement & wave spawner to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `tower-defense.js` (one global, `GameDNA_TowerDefense`), API reference `tower-defense.README.md`

README example names are placeholders.

## Shared premises

1. **Include each module file verbatim; never edit it.** Load it with its own `<script src>` before the game's script, or paste it unchanged into its own `<script>` tag. If a module seems to need a change, adapt my game around it and tell me.
2. **Resolution:** keep my game's native resolution and integer scaling as they are. Call module draw functions on my 2D context inside the same transform as my sprites (one module pixel = one game pixel), and keep my game's own image-smoothing setting (off for pixel art, on for smooth or HD games; never switch it).
3. **Time:** drive every module from one fixed 60 Hz step (1000 / 60 ms). If my loop uses variable delta time, accumulate it and run whole steps (at most 250 ms per frame).
4. **Coordinates:** native screen pixels (world minus camera) unless a section says tiles.
5. **Art and names:** anything new you draw or name is original (no real game, character, place or brand names); English UI text; do not restyle my game.
6. **Hook, don't replace:** add calls or change bodies; never delete or rename a function.
7. **Keep every other caller working.** Find every caller and reader of what you change (turn order, input, moves, menus, HUD): autopilot/AI, test hooks, URL parameters such as `?auto=1`, `?t=` and `?freeze=1`, keyboard shortcuts, end-turn buttons. Update each one. My game's own autoplay must still finish a whole game. Keep existing HUD info (HP bars, max HP) and existing commands.

## Order of work

1. **Read the game first.** Write down (file, function) where these live: loop/update step; draw pass and its order (background, actors, effects, HUD); input; where damage/HP changes are applied; where turns, actions or selections are chosen and played; HUD windows and their rects; camera; battle/scene start and end; and every caller from premise 7.
2. **Check the prerequisites** below against those notes. If one is missing, add the smallest working version and tell me.
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Tower placement & wave spawner [systems].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Tower placement & wave spawner:** a map: grid rows (grass, trees, rocks, water) and the road as waypoint cells per path; waves as data (groups of enemy ids with count, gap, delay, path), tower and enemy tables (built-ins ship); a fixed 60 Hz update step; key or pointer input routed to the field while it runs; a place to go when the field is won or lost.

## Element 1: Tower placement & wave spawner (`tower-defense.js`, `GameDNA_TowerDefense`)

Adds a tower-defense stage: foes walk a fixed road through a 16x10 grid (one or more paths from waypoint cells) to a gate; the player builds towers on the grass beside the road, never on it (the road can never be blocked), with a range ring and a red warning on refused cells; towers have three levels, sell for part of their price and each has a target priority (first, strong, near); four built-in towers (single shot, splash, slow, chain); waves are plain data with the next wave previewed and an early-call gold bonus; gold, lives, speed x1 / x2, pause, win and lose. Seeded and fixed-step; a bot builds and sends waves through the same input path.

**Parameters chosen:** `speed` = 1, `gold` = 200, `lives` = 20, `waveGap` = 12, `earlyBonus` = 1, `refund` = 0.7, `hpScale` = 1, `priority` = first, `ring` = on, `preview` = on, `layout` = wide.

**Where it goes** (by role; find these places in my game):

1. *How your level maps onto it (decide before coding):* Your stage becomes a map `{name, gold, lives, rows: 10 strings of 16 chars ('.' grass, 'T' tree, 'r' rock, 'b' bush, 'w' water), paths: [[[col, row], ...]]}` (waypoint cells, straight runs, the first and last one cell off the edge); your enemies become waves `{groups: [{enemy, count, gap, delay, path}], reward, hp}`; your monsters may become enemy entries `{name, look, hp, speed, armor, reward, leak, size, flying, palette}` and your turrets tower entries (format in the module README). Built-in towers and foes ship.
2. *Once, where your defense stage starts:* `td = GameDNA_TowerDefense.create({view: {x: 0, y: 0, w, h} (your logical canvas), params: {speed: 1, gold: 200, lives: 20, waveGap: 12, earlyBonus: 1, refund: 0.7, hpScale: 1, priority: 'first', ring: 'on', preview: 'on'}, onHit: ev => <your hit feedback>, onEvent: ev => <your sounds / banners>, onEnd: (result, info) => <your win / lose code, once>})`; per stage `td.start({map, waves, seed})`.
3. *Your fixed step (every loop that steps the game, fast-forwards included):* `td.update(stepMs)` once per step, `0` while your world is frozen; never behind a menu or animation check.
4. *Where your stage is drawn:* `td.drawScene(ctx)`, then your effects, then `td.drawUI(ctx)`; keep your HUD, title and result screens after it.
5. *Your input while the stage runs:* Keys -> `td.key('1'..'9' | 'left' | 'right' | 'up' | 'down' | 'ok' | 'back' | 'upgrade' | 'sell' | 'target' | 'wave' | 'speed' | 'pause')`; pointer down / move / up -> `td.pointer(type, x, y)` in logical px. Your autoplay -> `td.setAuto(true)`.
6. *Where the stage ends:* In `onEnd(result, info)` (`'win'` | `'lose'`): run your existing win / lose code exactly once, set any phase your other code and tests read.

**Common mistakes** (symptom -> fix):

- A tower appears on the road -> your code built it directly; build through `td.key` / `td.pointer` or `td.build()` (they refuse road cells).
- Foes freeze while a menu is open -> `update()` is skipped; call it every step.
- Gold or lives drift from the events -> your code wrote them; use `td.addGold(n)`, lives only change through leaks.
- Different game every reload -> pass a fixed `seed` per stage; no `Math.random` in custom drawing (use `td.rng()`).
- Taps miss cells -> pass logical px (canvas css px scaled to your logical size), not page px.
- Unreadable on a phone -> under ~560 px pass `params.layout: 'compact'` with a 520:328 view and show the panel in DOM with `GameDNA_TowerDefense.mountPanel(el, td, send)`.
- A road waypoint list turns diagonally or crosses a tree / rock / water cell -> keep each step on one row or one column and keep those cells grass.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Tower placement & wave spawner] Picking a tower shows its range ring; a road cell turns red with "Keep the road clear" and nothing is built.
- [Tower placement & wave spawner] A tower set to Strong shoots the foe with the most HP in range; on First, the one with the least road left.
- [Tower placement & wave spawner] The panel previews the next wave and that wave spawns exactly those foes; foes face the way they walk; your autoplay still finishes the game.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `tower-defense.js` sha256 `520768bc316153b1...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Tower placement & wave spawner] Trace one stage: start -> update each step -> build -> send wave -> onHit per hit -> onEnd once -> your next screen.
- [Tower placement & wave spawner] Walk one hit: Bolt 14 on an armour-2 crawler = 12; Frost 5 (pierces armour) = 5.
- [Tower placement & wave spawner] Walk one sale: Bolt 50 + upgrade 45 = 95 invested x 0.7 = 66 back.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

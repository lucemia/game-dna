# Add destructible pixel terrain to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `pixel-terrain.js` (one global, `GameDNA_PixelTerrain`), API reference `pixel-terrain.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Destructible pixel terrain [world].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Destructible pixel terrain:** the level size in world px and the game's original ground test (or ground art with alpha); a way to draw the ground art into a context in world px (paint), optional; the move functions (their tile snapping is replaced by moveX / moveY) and every caller of the wall test; a fixed update step (also run by ?t= fast-forward and ?auto=1), update(0) while stopped; events that blast (a foe defeated, an impact), the spawn / checkpoints / goal to protect; terrain per tile.

## Element 1: Destructible pixel terrain (`pixel-terrain.js`, `GameDNA_PixelTerrain`)

The ground becomes a bitmap that blasts carve: jagged craters with a scorched rim, dirt that flies and settles as sand, collapsing lips and crumbs, embers, fireball and smoke. Characters and items walk on the new surface through pixel-exact collision helpers; protected ground only takes soot. Pixel render for pixel-art games, smooth render for HD games.

**Parameters chosen:** `radius` = 24, `rim` = 0.55, `scorch` = 1, `jag` = 0.08, `debris` = 1, `settle` = 0.3, `crumble` = 1, `smoke` = 1, `flash` = 1, `embers` = 1, `shake` = 3, `gravity` = 1, `render` = auto, `maxScale` = 3, `chunk` = 128, `minSupport` = 0.6, `loose` = 3000, `backWall` = 1.

**Where it goes** (by role; find these places in my game):

1. *Once, after the level exists (before the first draw):* `terrain = GameDNA_PixelTerrain.create({w: LEVEL_W, h: LEVEL_H, seed: 1, scale: VIEW_H / 360, solid: (x, y) => the ORIGINAL tile test in world px, hard: (x, y) => bottom row / stone, paint: (g) => draw the ground tiles into g in world px, outside: {left: true, right: true, top: false, bottom: false} (the old off-map rule), keepOut: () => world boxes of characters and resting items, params: {rim: 0.55, scorch: 1, settle: 0.3, debris: 1, render: 'auto'}})`.
2. *The wall / floor test:* return `terrain.solid(x, y)` (every caller: movement, enemy edge checks, autoplay pit checks).
3. *The move functions:* replace the tile snapping with `terrain.moveX(body, dx, {step: 3, ground: body.onGround})` (true when blocked) and `terrain.moveY(body, dy)` (`'floor'` | `'ceiling'` | null); bodies are top-left boxes in world px. Resting items: `terrain.fall(item, stepMs)` each step.
4. *Where a foe is defeated (once):* `terrain.blast(foe.x + foe.w / 2, foe.y + foe.h, 24)` at its feet.
5. *New game / restart:* `terrain.clear()`, then `terrain.protect(x, y, w, h)` the spawn, checkpoints, goal and 2-3 tiles around every gap or step the route jumps.
6. *The end of the fixed step:* `terrain.update(worldRunning ? stepMs : 0)`.
7. *The draw pass:* `terrain.draw(ctx, camX, camY)` instead of the ground tiles (`0, 0` inside a camera translate; a fixed draw offset as `-offset`); after the sprites, before the HUD: `terrain.drawFx(ctx, camX, camY)`.

**Common mistakes** (symptom -> fix):

- Characters walk on air over craters -> the wall test or the tile snapping still reads the old tiles; route both through the terrain.
- Old tiles drawn over the holes -> the ground tile loop is still drawn; draw `terrain.draw` instead.
- Autoplay falls into a gap it used to clear -> a crater at the take-off: protect the gap edges.
- Holes remain after restart -> `clear()` + `protect` in new game.
- A character balances on a spike or hangs over a fresh edge -> the game snaps bodies itself; land them with `terrain.moveY` / `terrain.fall` (they slip off ground the blasts left too thin), boxes as wide as the drawn feet.
- A walker treadmills in a crater -> walk frames only when its x changed this step; an AI stuck 0.5 s jumps toward its goal.
- Ground shifted by the HUD band -> pass the draw offset as `camY = -offset`.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Destructible pixel terrain] A defeated foe leaves a jagged, scorched crater; dirt flies and some settles as sand; walkers go down into it and out again.
- [Destructible pixel terrain] Nobody stands on air or inside the ground (`terrain.audit([...])` stays 0); `?auto=1` still finishes; restart restores the ground; `?t=&freeze=1` is deterministic.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `pixel-terrain.js` sha256 `7f31610aa1ecd589...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Destructible pixel terrain] No tile snapping left in move functions; every wall-test caller reads `terrain.solid`.
- [Destructible pixel terrain] `update` once per fixed step (0 while stopped); `draw` replaces the ground tiles; `clear()` + `protect` on new game.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

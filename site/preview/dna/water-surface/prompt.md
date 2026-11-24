# Add Spring water surface and splashes to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `water-surface.js` (one global, `GameDNA_WaterSurface`), API reference `water-surface.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Spring water surface and splashes [fx].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Spring water surface and splashes:** pool rects in world px (the pits / ponds: x, w, the water line y, the depth); bodies(): top-left boxes {id, x, y, w, h} of the hero, enemies and projectiles with stable ids; a fixed update step (also run by ?t= fast-forward and ?auto=1), update(0) while stopped; a draw slot between ground and units; the game's own art for floating props (optional).

## Element 1: Spring water surface and splashes (`water-surface.js`, `GameDNA_WaterSurface`)

Pits and ponds become water with a springy surface: anything that falls in throws a crown of droplets and a splash sheet, waves run to both banks and calm down; bodies drip when they leave and push a bow wave while wading; floating props bob on the waves; what is under the line is tinted and the bank is mirrored; an optional waterfall feeds a pool. Pixel render for pixel-art games, smooth render for HD games.

**Parameters chosen:** `splash` = 1, `droplets` = 1, `spread` = 150, `damping` = 1.5, `tension` = 26, `maxAmp` = 22, `clarity` = 0.42, `depthAlpha` = 0.86, `reflect` = 0.3, `ambient` = 0.3, `wake` = 1, `palette` = lake, `render` = auto, `waterfall` = yes.

**Where it goes** (by role; find these places in my game):

1. *Once, after the level exists:* `water = GameDNA_WaterSurface.create({seed: 1, scale: VIEW_H / 360, pools: GAPS.map(g => ({x: g.x, y: g.bankY + TILE / 4, w: g.w, h: LEVEL_BOTTOM - (g.bankY + TILE / 4)})), bodies: () => [hero, ...enemies, ...shots].map(b => ({id: b.id, x: b.x, y: b.y, w: b.w, h: b.h})), params: {palette: 'lake', splash: 1, droplets: 1, reflect: 0.3, ambient: 0.3}})` (world px, top-left boxes, ids that never change).
2. *Floating props:* `log = water.addFloater({id: 'log1', x, w, h, density: 0.5})`; draw the game's own art at `log.x` (centre), `log.y` (top) before the characters.
3. *The end of the fixed step:* `water.update(worldRunning ? stepMs : 0)` (live loop, `?t=` fast-forward and autoplay).
4. *The draw pass:* after the last world sprite, before the HUD: `water.draw(ctx, camX, camY)` (`0, 0` inside a camera transform; a fixed draw offset as `-offset`).
5. *New game / restart:* `water.clear()`.

**Common mistakes** (symptom -> fix):

- Characters in a pit are not tinted -> `draw` runs before the sprites; move it after them.
- No splash ever -> `bodies()` makes new ids per frame or misses the hero; give objects a stable `id`.
- Splashes off to one side -> pools or bodies in screen px, or the camera applied twice.
- Waves keep moving in the pause menu -> `update(0)` while stopped.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Spring water surface and splashes] The hero falling into a pit makes one splash (crown, droplets, waves to both sides) and is tinted below the line; enemies and projectiles splash too.
- [Spring water surface and splashes] Floaters bob and stay on the surface; the water calms down; `?auto=1` still finishes the same way; `?t=&freeze=1` is deterministic.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `water-surface.js` sha256 `a56fc5361fa0b080...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Spring water surface and splashes] The module is unchanged and loaded first; `update` once per fixed step on every path (0 while stopped); `draw` after the sprites; `clear()` on new game.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

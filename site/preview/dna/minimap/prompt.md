# Add Minimap to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `Minimap.js` (one global, `GameDNA_Minimap`), API reference `Minimap.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Minimap [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Minimap:** the level as a cell grid (cols, rows, tile size, what each cell is) or solid collision rects; a camera offset; world positions of what to mark: the current goal, living enemies, untaken items, people, exits; the screen rect of the play view and the HUD rects to keep clear; a fixed update step (also on the ?t= replay) and keys / taps for zoom and the full map.

## Element 1: Minimap (`minimap.js`, `GameDNA_Minimap`)

A corner map of the level that the player fills in by exploring: the tile grid baked once into a cached image per zoom, unexplored cells under a dark dither, an arrow on the player pointing where they face, markers for the goal, enemies, items, people and exits, a rim arrow toward an off-map goal, view brackets, three zoom levels and a full map with a legend and the explored share. It stays clear of the HUD rects the game names and fades while the player walks under it. Warm parchment look top-down, dark rooms with bright walls side-on; crisp on pixel canvases, smooth on HD.

**Parameters chosen:** `mode` = topdown, `corner` = tr, `size` = 0.28, `zooms` = auto, `fog` = explore, `reveal` = 5, `enemies` = on, `shape` = square, `theme` = auto, `fadeUnder` = 0.4, `markSize` = 1, `render` = auto.

**Where it goes** (by role; find these places in my game):

1. *Once the level exists, before anything can call it (also before a ?t= fast-forward loop):* `minimap = GameDNA_Minimap.create({cols, rows, tile, cellAt, view, safeRects, player, camera, markers, params: {mode: 'topdown', corner: 'tr', size: 0.28, zooms: 'auto', fog: 'explore', reveal: 5, enemies: 'on', shape: 'square', theme: 'auto'}})`. `cellAt(c, r)` -> `wall`, `floor`, `water`, `tree`, `building`, `path`, `bridge`, `door`, `hazard` or `empty` in the level array's own row / column order; `view` = the screen rect where the camera view is drawn (not the HUD bar); `safeRects()` = every HUD box on screen now; `player()` = `{x, y, facing}` and `markers()` = `{id, kind, x, y}` in WORLD px; `camera()` = the world rect on screen. If the game already has a fog-of-war instance (Fog of war), pass it as `fog` so both show the same explored ground, and use `enemies: 'near'`.
2. *Your fixed update step, every scene (also the ?t= replay):* `minimap.update(stepMs)`.
3. *Your render, in play scenes only, after the HUD, outside any camera transform:* `minimap.draw(ctx)`. Not on title, battle or end screens.
4. *Where a new game or level starts:* `minimap.reset()`; `minimap.refresh()` when the level array was rebuilt or changed (a door opened).
5. *Your key handler, on keys the game does not use (consume them):* one key -> `minimap.toggleFull()`, one -> `minimap.cycleZoom()`; a pointer press where `minimap.hit(x, y)` is not null -> `toggleFull()` and nothing else.

**Common mistakes** (symptom -> fix):

- Arrow pinned to a map corner, markers bunched in the top-left -> `player` / `markers` return screen px; return world px (no camera subtraction, no HUD offset).
- The map is stretched or half missing -> `cols` / `rows` swapped or `cellAt` reads `level[c][r]`.
- The `?t=&freeze=1` still shows an unexplored map -> `update` is not in the replayed step.
- The minimap covers the score or timer -> that box is missing from `safeRects()`, or `view` includes the HUD bar.
- It sits on the player at a level edge and never fades -> no `camera()` (or `view` is not the play view).
- Arrow points backwards / up and down swapped -> a y-up angle; give words, +1 / -1, a y-down vector or `angle` with y down.
- The full-map key also moves or jumps -> the key reaches the game's input; consume it.
- The goal marker still points at a finished objective -> `markers()` must return exactly one `goal`, the current objective; swap it where the quest advances (the old one can become a `poi` landmark).
- `?auto=1` ends differently -> the minimap was given game logic (it must only read).

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Minimap] The minimap sits in the chosen corner and never over a HUD box, also while a dialogue or banner is open.
- [Minimap] The arrow follows the player and points where they face; new ground becomes explored; markers sit where those things are, an off-map goal shows a rim arrow.
- [Minimap] Zoom changes the scale; the full map shows the whole level and a legend; walking under the minimap dims its map image (frame and arrows stay readable); `?auto=1` ends exactly like before.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `minimap.js` sha256 `5d1c32ebcf3e85e5...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Minimap] `cols * tile` and `rows * tile` equal the level size; every callback returns world px; `view` and `safeRects()` use the same screen coordinates.
- [Minimap] `update` runs once per fixed step in every scene, also on the replay; `draw` runs after the HUD in play scenes only.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

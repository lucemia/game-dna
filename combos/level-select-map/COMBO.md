# Add level-select path reveal to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `level-select-map.js` (one global, `GameDNA_LevelMap`), API reference `level-select-map.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Level-select path reveal [systems].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Level-select path reveal:** a scene switch: title -> map -> level -> map (the game shows the map scene between levels); the graph: nodes {id, x, y, kind, name} in map pixels and edges {a, b, via, exit}; the cleared state to start from (or none for a new game); enterLevel(id): start that level; and a call back to complete(id, exit) or fail(id) when the level ends; input (directions, confirm, cancel, pointer); a fixed 60 Hz update step; optional: onSave(state) for huts, onShop(id), onSound(name), nodeInfo(id) items for the panel.

## Element 1: Level-select path reveal (`level-select-map.js`, `GameDNA_LevelMap`)

Adds an overworld map scene between levels: level, secret, bonus, castle, hut and shop nodes joined by paths. The hero walks node to node; confirm enters a level; when the game reports a clear, the next path is drawn stone by stone (camera follows, one sound per stone) and the node turns blue with a flag; a secret exit opens a different path; locked paths show faint; huts save through the game; the map scrolls when bigger than the screen. The module draws its own terrain, hero, panel, toasts and iris, and has its own autopilot.

**Parameters chosen:** `walk` = 1.25, `reveal` = 4, `spacing` = 6, `terrain` = coast, `locked` = faint, `panel` = auto, `iris` = on, `camera` = smooth.

**Where it goes** (by role; find these places in my game):

1. *Your levels (read the game first: what one level is, where it starts and ends):* One map node per level. A game with ONE level gets 3-4 without new art: split it at its checkpoints (level k spawns at checkpoint k and ends on reaching checkpoint k+1, the last at the real goal) or replay it with variants. The last level is the `castle`; one level gets a secret exit from something the game already has (a hidden spot, all coins) leading to a `bonus` node; add one `hut`.
2. *Your scene switch:* Add a map scene: title -> map -> level -> map ... -> castle cleared -> the game's own win screen (keep its state names, other code checks them). Game over stays as it was.
3. *Where a run starts (and restarts):* `worldMap = GameDNA_LevelMap.create({nodes, edges, view: {x: 0, y: 0, w, h}, state, params: {walk: 1.25, reveal: 4, spacing: 6, terrain: 'coast', locked: 'faint', panel: 'auto', iris: 'on', camera: 'smooth'}, enterLevel, onSave, onSound, auto, enabled})` in a NEW variable name (many games already have a `map`). `nodes` = `{id, x, y, kind, name}` in map px, `edges` = `{a, b, via: [[x, y]], exit: 'normal' | 'secret'}`. `enterLevel(id)` sets that level up exactly the way the game started its level (keep the run's lives and score), then switches to the level scene. `auto: () => <the game's autoplay flag>`, `enabled: () => <the map scene is shown>`.
4. *Where a level ends:* Goal reached: `worldMap.complete(id, gotSecret ? 'both' : 'normal')` and back to the map scene, except the castle (go to the win screen). Life lost: keep the game's rule (respawn at its checkpoint, or `worldMap.fail(id)` back to the map).
5. *Your fixed 60 Hz step:* While the map scene is shown, `worldMap.update({left, right, up, down, confirm})` once per step instead of the level update: held directions including up/down, `confirm` = the jump/OK press of this step. A tap between two steps must still reach it.
6. *Your draw pass:* While the map scene is shown, `worldMap.draw(ctx)` instead of the level (HUD after it, its rects in `avoid`).

**Common mistakes** (symptom -> fix):

- Page error "already declared" -> the game has its own `map`; use another name.
- The hero never moves on the map -> up/down are not passed, or `update` is not called in the map scene; the map takes input only from `update` / `key`.
- A level is entered again the moment the map shows -> a confirm still held from the result screen: pass the press of this step, not the held key (the module also waits for a release).
- Autoplay stops on the map -> pass `auto: () => <autoplay flag>`; the game's own autopilot never drives the map.
- Lives, score or coins reset between levels -> `enterLevel` called the full new-game reset; keep the run state across levels.
- The win screen never shows -> the castle's clear must still go to the game's own win scene.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Level-select path reveal] The map shows faint locked paths one step ahead; arrows walk node to node; confirm enters a level.
- [Level-select path reveal] A clear reveals the next path stone by stone (camera follows), then the node turns blue with a flag; the secret exit opens the bonus path.
- [Level-select path reveal] The hut saves; a map bigger than the screen scrolls; `?auto=1` reaches the win screen with no console errors.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `level-select-map.js` sha256 `71747b1c32c7dfa6...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Level-select path reveal] Trace autoplay: title -> map -> `enterLevel` -> level -> goal -> `complete` -> map -> reveal -> next level ... -> castle -> win screen.
- [Level-select path reveal] Every edge names existing node ids; every level node is reachable from the start.
- [Level-select path reveal] Trace a life lost and a game over: the same screens as before.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

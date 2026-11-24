# Add World-space HUD to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `world-hud.js` (one global, `GameDNA_WorldHud`), API reference `world-hud.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) World-space HUD [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **World-space HUD:** units in world px with the feet point, footprint radius, sprite height, team, name, HP; the current goal (and any tracked target) in world px; a camera offset; the HUD rects to keep clear (bars, quest text, windows while open); a fixed update step (also on the ?t= replay); a ground pass between floor and sprites.

## Element 1: World-space HUD (`world-hud.js`, `GameDNA_WorldHud`)

HUD pieces that live in the world and follow the camera: a ring under every unit's feet with an HP arc whose pale loss segment drains after a hit, name plates with level and HP above heads that never overlap each other, the HUD or the view edge (stacked or shifted with a leader line, hidden when nothing fits), a marker with the distance above the current goal, and edge arrows that point exactly at off-screen targets, sliding inward along the same bearing past HUD boxes. Crisp bitmap text on pixel canvases, smooth on HD.

**Parameters chosen:** `plates` = auto, `arc` = hp, `squash` = 0.5, `ringSize` = 1, `arrows` = on, `markers` = on, `distance` = on, `unit` = 16, `plateHp` = on, `level` = on, `lowHp` = 0.3, `scale` = 0, `render` = auto, `avoid` = auto.

**Where it goes** (by role; find these places in my game):

1. *Once the level exists, before anything can call it (also before a ?t= fast-forward loop):* `hud = GameDNA_WorldHud.create({view, camera, units, targets, safeRects, params: {plates: 'auto', arc: 'hp', squash: 0.5, arrows: 'on', distance: 'on', unit: 16}})`. `view` = the screen rect of the camera view (below a HUD bar); `camera()` = the world rect it shows; `units()` = every living unit `{id, x, y, r, h, team, name, level, hp, maxHp, boss, track}` in WORLD px with `y` at the FEET; `targets()` = exactly one `{id, kind: 'goal', x, y, label}` for the current objective; `safeRects()` = every HUD box on screen now (windows while open).
2. *Your fixed update step, every scene (also the ?t= replay):* `hud.update(stepMs)`.
3. *Your world render, after the ground and before the standing sprites, with the HUD's transform (undo a camera translate around the call):* `hud.drawGround(ctx)` (rings and the goal ping).
4. *Your render, in play scenes only, after the world and the HUD, outside any camera transform:* `hud.draw(ctx)` (plates, marker, edge arrows). Not on title, battle or end screens.
5. *Where a new game starts / where the game picks a target:* `hud.reset()` / `hud.setFocus(id)`.

**Common mistakes** (symptom -> fix):

- Rings float at the sprite's top-left or above the unit -> `y` is the sprite top; pass the feet (ground point) and the sprite height as `h`.
- Rings and plates drift as the camera scrolls -> units in screen px (camera subtracted); pass world px.
- Rings drawn over the sprites -> `drawGround` not called between floor and sprites (the module then paints them in `draw`).
- Everything offset by the HUD bar -> `view` is the whole canvas while the camera view starts below the bar.
- A plate on the quest text or a dialogue -> that box is missing from `safeRects()`.
- Each enemy shows its HP two or three times (plate bar, ring arc, the game's old over-head bar) -> guard the game's own floating HP bars / name tags off while the world HUD is on; keep the HUD bars.
- Two arrows to the same thing -> the goal is a unit and that unit also has `track: true`; use one.
- The marker sits on a finished objective -> swap the `goal` target where the quest advances.
- `?auto=1` ends differently -> the HUD was given game logic (it must only read).

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [World-space HUD] Rings sit under the units' feet and move with them as the camera scrolls; a hit leaves a pale segment that drains.
- [World-space HUD] Plates never overlap each other or a HUD box, also in a crowd and with a dialogue open; an off-screen goal shows an edge arrow pointing straight at it with the distance, an on-screen goal a marker.
- [World-space HUD] `?auto=1` ends exactly like before with no console errors.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `world-hud.js` sha256 `26d726cd3a1b6a21...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [World-space HUD] Units and the goal are world px with `y` at the feet; `view`, `safeRects()` and both draw calls use the same screen coordinates.
- [World-space HUD] `update` runs once per fixed step in every scene, also on the replay; `drawGround` between floor and sprites, `draw` after the world in play scenes.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

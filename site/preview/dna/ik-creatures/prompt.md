# Add Procedural IK creatures to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `ik-creatures.js` (one global, `GameDNA_IKCreatures`), API reference `ik-creatures.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Procedural IK creatures [actor].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Procedural IK creatures:** the game's ground: side view ground(x, y) = surface y at or below y (null for a pit); top view walkable(x, y); actors(): stable ids, kind, feet position in world px, size, target (the hero), flash, dead; a fixed update step (also run by ?t= fast-forward and ?auto=1), update(0) while stopped; a draw slot between ground and units.

## Element 1: Procedural IK creatures (`ik-creatures.js`, `GameDNA_IKCreatures`)

Walking foes become spiders, crabs or centipedes drawn in code: feet plant on the ground and never slide, legs step in alternation with 2-bone IK, the body faces its path and the head turns to the hero; legs hang in the air and replant on landing; defeated foes curl up. HD shading at device resolution, or native pixels with a fixed ramp.

**Parameters chosen:** `kind` = spider, `stride` = 0.3, `lift` = 0.16, `turnRate` = 300, `headYaw` = 40, `rim` = 1, `palette` = auto, `render` = auto.

**Where it goes** (by role; find these places in my game):

1. *Once, after the level exists:* `bugs = GameDNA_IKCreatures.create({view: 'side' /* or 'top' */, seed: 1, scale: VIEW_H / 360, ground: (x, y) => /* side: surface y at column x at or below y; inside solid: top of that run; null for a pit */, walkable: (x, y) => /* false on water / walls / trees */, actors: () => walkingFoes.map(f => ({id: f.id, kind: 'spider', x: feetX, y: feetY, size: f.w * 0.9, target: {x: heroX, y: heroY}, flash: f.flash ? 1 : 0, dead: !f.alive})), params: {stride: 0.3, lift: 0.16, palette: 'auto', render: 'auto'}})` (world px, stable ids; feet = box bottom centre in a side view, the floor position top-down).
2. *The end of the fixed step:* `bugs.update(worldRunning ? stepMs : 0)` (live loop, `?t=` fast-forward and autoplay).
3. *The draw pass:* where each walking foe's body was drawn (inside the y-sorted list): `bugs.drawOne(ctx, f.id, camX, camY)` (`0, 0` inside a camera translate), then the game's HP bar; keep calling it about 1 s after death.
4. *New game / restart:* `bugs.clear()`.

**Common mistakes** (symptom -> fix):

- Feet float or sink -> `ground` returns the tile row or screen px, or `y` is the box top; pass the feet and world px.
- Creatures re-spawn every frame -> ids made per frame; use the foe's own id.
- Creature drawn off its hit box or sliding with the camera -> camera applied twice.
- Old body still drawn under the legs -> stop drawing it for those foes (keep the HP bar).
- Legs walk on in the pause menu -> `update(0)` while stopped.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Procedural IK creatures] Feet stand on the ground and stay put while the body walks over slopes and steps; never two neighbouring legs up together at a walk; the body faces its path and the head looks at the hero.
- [Procedural IK creatures] `?auto=1` ends the same way; `?t=&freeze=1` is deterministic; no console errors.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `ik-creatures.js` sha256 `b2d55ca003b315e6...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Procedural IK creatures] The module is unchanged and loaded first; `update` once per fixed step on every path (0 while stopped); `drawOne` in the sprites' space; `clear()` on new game.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

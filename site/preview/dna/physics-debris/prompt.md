# Add Physics debris & breakables to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `physics-debris.js` (one global, `GameDNA_Debris`), API reference `physics-debris.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Physics debris & breakables [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Physics debris & breakables:** a fixed update step that calls update(dt) once per step after movement (also run by ?t= fast-forward and ?auto=1), update(0) while paused or behind a window; the game's wall test in world px (solid(x, y)), and its tile size when walls are tiles; the places where HP/MP change (hit frame); knock-back: the step a knocked-back body moves (touch) and the frame a wall stops it (contact point, wall normal, speed); where foes are defeated (optional: shatter them into a material); a camera offset.

## Element 1: Physics debris & breakables (`physics-debris.js`, `GameDNA_Debris`)

Breakable crates, barrels, pots, statues and crystals drawn in code; blows crack them, then they shatter into pieces cut from their own drawing that tumble, bounce off walls (swept: never through them), rest flat and fade. Defeated foes can burst into a material (leaves, rubble, shell, bone, crystal). A foe knocked into a wall makes dust and chips and its sprite bounces. Side view and top-down.

**Parameters chosen:** `amount` = 1, `gravity` = 1, `bounce` = 0.35, `friction` = 0.6, `rest` = 2600, `fade` = 700, `cap` = 320, `dust` = 1, `shake` = 3, `hitstop` = 40, `spin` = 1, `chips` = 1, `depth` = 0, `breakSpeed` = 240, `render` = auto, `art` = image.

**Where it goes** (by role; find these places in my game):

1. *Once, after the map exists (before the first draw):* `debris = GameDNA_Debris.create({view: 'side' | 'top', seed: 1, scale: VIEW_H / 360, tile: TILE, solid: (x, y) => the game's own wall test in WORLD px, bounds: {x: 0, y: 0, w: WORLD_W, h: WORLD_H}, keepOut: () => small world rects under each living character's feet (optional: resting pieces slide out from under them), params: {amount: 1, bounce: 0.35, friction: 0.6, rest: 2600, dust: 1, shake: 3, hitstop: 40, render: 'auto'}})`.
2. *Where a new game or level starts:* `debris.clear({props: true})`, then about 8-15 (fewer in a small level) `debris.addProp({id, kind: 'crate' | 'barrel' | 'pot' | 'statue' | 'crystal', x, y})` (`y` = the floor line under it) in corners, beside walls and near fights, off narrow corridors. Props never block movement. When the game has its own prop sprites, pass them instead of a built-in `kind`: `addProp({id, x, y, h, art: (g, h) => draw the sprite h px tall with its base centre at (0, 0), hull: its convex outline in prop heights, material: 'wood' | 'stone' | 'iron' | ...})`, so the pieces are cut from the game's own art.
3. *The impact frame of every attack (once):* `debris.hit(x, y, r, {dx, dy, force: 320})` in front of the attacker, or `debris.hitRect(box.x, box.y, box.w, box.h, {dx})` with the hit box.
4. *Knock-back:* Every step a body is knocked back: `debris.touch(x, y, r, speedPxPerSec, {dx, dy})`; the step a wall first stops it: `debris.wallHit(id, contactX, contactY, normalX, normalY, speed, {material: 'rock'})` (do not apply the returned velocity). Draw that body at its position plus `debris.offset(id)` (draw only).
5. *Where a foe is defeated:* `debris.shatter(material, x, y, {count: 8, dx, dy})` (`leaf`, `rock`, `bark`, `shell`, `bone`, `crystal`, `spirit`, ...).
6. *The end of the fixed step:* `debris.update(worldRunning ? stepMs : 0)` (0 in menus, dialogue, pause, title and end screens).
7. *The draw pass, inside the camera transform:* Side view: `debris.drawProps(ctx, 0, 0)` before the actors. Top-down: `debris.drawGround(ctx, 0, 0)` before the sprites and each prop in the y-sorted list as `{y: p.y, draw: () => debris.drawProp(ctx, p, 0, 0)}`. After the sprites, before the HUD: `debris.draw(ctx, 0, 0)`.

**Common mistakes** (symptom -> fix):

- Pieces sink into floors or sit inside walls -> `solid` got screen px (camera subtracted); world px. `debris.audit()` must stay 0.
- Pieces drift with the camera -> the camera was applied twice (translate and `camX`); pass `0, 0` inside the translate.
- Props break while the hit box stays out -> `hit` called every frame of the swing; once on the impact frame.
- Autoplay ends differently -> props made solid, the bounce velocity applied, loot or hit-stop added; keep the module cosmetic.
- Pieces fly on under the pause menu -> `update(0)` while the world is stopped.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Physics debris & breakables] A blow breaks a crate into planks that tumble, rest flat and fade; a barrel needs two blows; a foe knocked into a wall makes dust and chips and bounces.
- [Physics debris & breakables] No piece ends inside a wall (`debris.audit()` stays 0); `?auto=1` reaches the same ending; `?t=&freeze=1` is deterministic; restart leaves no pieces.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `physics-debris.js` sha256 `43ea43e6db4ce071...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Physics debris & breakables] `debris.update` once per fixed step, `0` while stopped; `clear({props: true})` then `addProp` on every new game / level.
- [Physics debris & breakables] `hit` once per attack; `wallHit` once per bump; world px everywhere; the camera applied once.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

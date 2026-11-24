# Add Belt depth (beat-'em-up lanes) to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `belt-depth.js` (one global, `GameDNA_BeltDepth`), API reference `belt-depth.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Belt depth (beat-'em-up lanes) [actor].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Belt depth (beat-'em-up lanes):** a fixed 60 Hz update step; every damage test (sword, contact, projectiles) extended with belt.inReach(attacker, target); a tile grid; render: belt.drawFloor(ctx) after the tiles; the character draw loop replaced by belt.render(ctx, items); spawn / respawn: z on every new character (place, lane).

## Element 1: Belt depth (beat-'em-up lanes) (`belt-depth.js`, `GameDNA_BeltDepth`)

Beat-'em-up depth on a side-view stage: every character gets a depth z on a walkable floor band (up / down walk along it), jumps stay height above the floor with a contact shadow on the ground under the feet, characters are drawn sorted by floor + z and shifted by z, and hits connect only within a depth tolerance. Draws the floor band from the tile grid and keeps the band in view for vertical cameras.

**Parameters chosen:** `depth` = 24, `tolerance` = 6, `laneSpeed` = 1.2, `chaseSpeed` = 0.6, `floor` = meadow, `shadowAlpha` = 0.45, `cue` = off, `render` = auto.

**Where it goes** (by role; find these places in my game):

1. *Once, after the level data exists:* `belt = GameDNA_BeltDepth.create({depth: 24, tolerance: 6, view: {w: VIEW_W, h: VIEW_H}, player: () => hero, camera: () => ({x: camX, y: camY})}); belt.setFloors(belt.gridFloors({cols, rows, tile, solid: (c, r) => kind or false}))` (add `toScreen` only when the draw code subtracts the camera by hand).
2. *Spawn / respawn / restart:* hero `z` = half the depth; `belt.place(e, belt.lane(i))` for each enemy.
3. *The fixed step (also in ?t= fast-forward):* `belt.update()`; `belt.walk(hero, (down ? 1 : 0) - (up ? 1 : 0))`; `belt.chase(e, hero)` per enemy; the autopilot sets up / down from `belt.steer(hero, foe)`.
4. *Every damage test:* append `&& belt.inReach(attacker, target)` (sword, contact, projectiles, specials); pickups ignore depth.
5. *Render:* `belt.drawFloor(ctx)` after the tiles; the enemy + hero draw loop becomes `belt.render(ctx, [{a: e, draw: () => drawEnemy(e)}, ..., {a: hero, draw: drawHero}])`.
6. *Vertical camera:* `camY = belt.frameY(camY, VIEW_H, LEVEL_H)` after it is computed.

**Common mistakes** (symptom -> fix):

- Up is also a jump key -> move jumping to the other jump key and update the help text, or depth cannot be walked.
- Shadows float under a jumping character -> floors not set (or feet passed with the camera applied).
- Hits still land across lanes -> a damage path without `inReach` (contact damage is the usual one).
- `?auto=1` ends differently -> the autopilot does not `steer` into its target's lane.
- Characters drawn twice (once by the old loop, once by `render`) -> remove them from the old loop.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Belt depth (beat-'em-up lanes)] Up / down move the hero along the band; nearer foes are drawn over him; a jump keeps the shadow on the ground under his feet.
- [Belt depth (beat-'em-up lanes)] A swing at a foe on another lane misses, lined up it lands; `?auto=1` ends as before.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `belt-depth.js` sha256 `2dec139d5565273c...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Belt depth (beat-'em-up lanes)] `inReach` in every damage test; every floor character goes through `render` exactly once.
- [Belt depth (beat-'em-up lanes)] `z` set on every new hero / enemy object; `belt.update()` once per fixed step.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

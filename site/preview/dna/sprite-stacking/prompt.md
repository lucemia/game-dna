# Add Sprite stacking (pseudo-3D props from pixel slices) to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `sprite-stacking.js` (one global, `GameDNA_SpriteStack`), API reference `sprite-stacking.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Sprite stacking (pseudo-3D props from pixel slices) [actor].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Sprite stacking (pseudo-3D props from pixel slices):** the props as data (tile kinds or object lists) with their ground centre in world px; each frame: one draw list of the stacks plus every flat sprite with feet x, y and width; a camera offset.

## Element 1: Sprite stacking (pseudo-3D props from pixel slices) (`sprite-stacking.js`, `GameDNA_SpriteStack`)

Sprite stacking: props (trees, rocks, crates, barrels, wells, fences, houses, carts, a buggy, lamps) become small voxel models drawn as stacked pixel slices with face shading from one light, a 1 px outline and a cast shadow; objects can turn (own angle, or a turning camera when the ground turns too). Stacks and the game's flat sprites are drawn in one list sorted by ground footprints in camera space, so characters pass behind and in front of props correctly from every side.

**Parameters chosen:** `voxel` = 1, `lift` = 1, `pitch` = 1, `steps` = 128, `outline` = on, `shadows` = 0.3, `light` = -0.62.

**Where it goes** (by role; find these places in my game):

1. *Once, after the canvas exists:* `ss = GameDNA_SpriteStack.create({voxel: 1, lift: 1, pitch: 1, steps: 128, outline: on === 'on', shadows: 0.3, light: -0.62})`.
2. *Props (each frame, visible area + ~3 rows below):* `ss.item('tree' | 'rock' | 'well' | 'fence' | 'house' ..., groundCentreX, groundCentreY, {seed, size, angle, model: {w, d, roof}})` sized to the area the game already blocks; the replaced tile draws plain ground instead of its art.
3. *Render (inside the camera transform of the ground):* the old y-sorted sprite list becomes `list = props.concat(sprites.map(s => ({x: feetX, y: feetY, w, h, draw})))`; `ss.drawShadows(ctx, list); ss.draw(ctx, list)`.
4. *Turning camera (only when the ground can turn):* `ss.setCamera({x, y, yaw, sx, sy})`; ground inside `ss.groundTransform(ctx)`; sprites at `ss.project(x, y)`; walk frames from `ss.screenDir(vx, vy)`.

**Common mistakes** (symptom -> fix):

- A character drawn over a house it stands behind -> it is drawn outside `ss.draw` (or before it).
- Wrong order beside long or turned props -> the flat item has no feet `x` / `w` (`stats().flatNoX` > 0).
- The old flat tree still shows under the stack -> the replaced tile still draws its art.
- Tall houses pop in at the screen bottom -> the prop loop stops at the last visible row.
- Stacks turn but the ground does not -> yaw on a game whose ground cannot turn; keep yaw 0, turn objects with `angle`.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Sprite stacking (pseudo-3D props from pixel slices)] Props look solid, lit from the upper left, with shadows and no gaps between slices.
- [Sprite stacking (pseudo-3D props from pixel slices)] The hero is hidden behind a house or tree when north of it and drawn over it when south of it; `?auto=1` ends as before.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `sprite-stacking.js` sha256 `2c98b4dace256136...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Sprite stacking (pseudo-3D props from pixel slices)] Every sprite of the old sort goes through `ss.draw` once with feet `x`, `y` and `w`.
- [Sprite stacking (pseudo-3D props from pixel slices)] `drawShadows` before `draw`, both in the ground's transform; replaced tiles draw ground only.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

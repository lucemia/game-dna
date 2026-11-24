# Add Shatter battle transition to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `battle-transition.js` (one global, `GameDNA_BattleTransition`), API reference `battle-transition.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Shatter battle transition [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Shatter battle transition:** scene switch: the place where the game enters (and optionally leaves) a battle or starts a wave; a way to draw the current frame on demand (or the screen canvas) for the capture; a fixed 60 Hz update step; the last draw of every frame (after scene, HUD and dialogs), live loop and freeze path; optional: focus point (player or touched enemy) in screen pixels.

## Element 1: Shatter battle transition (`battle-transition.js`, `GameDNA_BattleTransition`)

When a battle starts, the current frame is captured, cracks from the point of contact and breaks into bevelled shards that spin and fall over a dark backdrop (or swirls, pixelates, irises closed); the game switches scenes under full cover; the new scene is revealed. While it runs (`busy()`), input is dropped and the world waits. Optionally plays again when leaving a battle or starting the next wave.

**Parameters chosen:** `variant` = shatter, `reveal` = match, `duration` = 900, `pieces` = 6, `spin` = 240, `flash` = on, `leave` = iris.

**Where it goes** (by role; find these places in my game):

1. *Once, after the screen canvas exists and before the first step (including any `?t=` fast-forward loop that runs at load):* `tr = GameDNA_BattleTransition.create({view: {x: 0, y: 0, w: <native width>, h: <native height>}, canvas: <screen canvas>, seed: 1, params: {variant: 'shatter', reveal: 'match', duration: 900, pieces: 6, spin: 240, flash: 'on'}})`. `view` is the whole screen, HUD included.
2. *Every place a battle starts (encounter, touch, title to first battle); grep every write of the scene/mode variable:* First line, before anything changes what is drawn: `tr.start({capture: () => { <render the current frame now>; return <screen canvas>; }, focus: {x, y}})` with `focus` = the player (or the touched enemy) in screen px. Keep the existing scene switch where it is: the module covers the screen until 55 %. Or move the switch into `onMid` (never both).
3. *Every place a battle ends back to the map, or the next wave/stage starts (optional):* Same call with `variant: 'iris'` (skip when `none`).
4. *Your fixed update step, right after input is read and cleared, before autoplay input and any world logic:* `if (tr.busy()) { tr.update(1000 / 60); return; }` (milliseconds; use your step length).
5. *After every call of your render function: live loop, `?t=` / freeze path, first frame at load:* `tr.draw(ctx)` as the last draw of the frame (after scene, HUD, dialogs, other overlays), never inside a scene branch that returns early.
6. *New game / restart / back to title:* `tr.reset()`.

**Common mistakes** (symptom -> fix):

- The battle flashes on screen for a frame before the shatter -> `start()` must come before the scene changes.
- Freeze shots of the transition show an empty or stale frame -> fast-forward loops do not draw; capture with a function that renders now.
- The transition shows on the map but not in battle -> `draw()` sits inside a render branch that returns early.
- Enemies act, messages advance or autoplay walks under the shards -> the busy gate must come before autoplay and world logic.
- Input locked forever -> `update()` not called inside the busy branch, or called with seconds.
- Keys pressed during the transition fire afterwards -> read and clear input before the busy check, and drop it.
- A restart during a transition leaves a cover -> `tr.reset()` at new game / title.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Shatter battle transition] At an encounter: white flash, cracks from the player, shards spinning and falling over a dark backdrop, then the battle revealed; never a black screen after it ends.
- [Shatter battle transition] Keys pressed during the transition do nothing; the first command afterwards works.
- [Shatter battle transition] `?auto=1` reaches the same end as before (later by the transition time), with no console errors; `?t=<encounter+200>&freeze=1` shows the shards.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `battle-transition.js` sha256 `34278f3fb707c7a0...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Shatter battle transition] List every scene switch and its `start()`, every render call and its `draw()`. Walk one encounter: `start` (capture renders the old scene) -> steps return early with `update` -> `onMid` at 55 % -> reveal -> `onDone`; the battle continues from where it was.
- [Shatter battle transition] `tr` exists before the first step; the module file is byte-identical.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

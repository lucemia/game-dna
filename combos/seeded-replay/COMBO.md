# Add seeded replay & ghost to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `seeded-replay.js` (one global, `GameDNA_SeededReplay`), API reference `seeded-replay.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Seeded replay & ghost [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Seeded replay & ghost:** a fixed update step that reads device input once per step (also run by ?t= fast-forward and ?auto=1): rep.input(readInput()) before any autopilot; a deterministic update: all randomness from a seeded RNG whose seed can be set per run; restart(seed, meta) that equals a live run start; state(): the gameplay fields and RNG state to hash; pose() and drawGhost(ctx, pose) with the hero's own frames; begin(seed, meta) where play of a run starts, end({won}) at every win and loss; a fixed 60 Hz update step.

## Element 1: Seeded replay & ghost (`seeded-replay.js`, `GameDNA_SeededReplay`)

Records every run as its seed plus the raw input of each fixed step and replays it through the game's own step function to the identical end state, checked by a state hash every second and at the end (END STATE MATCH or DESYNC). The best run returns as a translucent ghost drawn with the hero's own frames that races the player, with a time-trial panel (time, best, split) and a NEW BEST banner. Replays have a HUD: pause, speed x.25-x4, scrubber with checkpoint ticks. Runs save and load as one line of text.

**Parameters chosen:** `ghost` = best, `ghostAlpha` = 0.8, `tint` = cyan, `tag` = start, `split` = on, `speed` = 2, `checkEvery` = 60, `watchKey` = v, `pauseKey` = p, `autoExit` = 4, `store` = off, `render` = auto.

**Where it goes** (by role; find these places in my game):

1. *Before the game's first step and boot (the module must exist when a run starts):* `rep = GameDNA_SeededReplay.create({restart: (seed, meta) => { <set the run seed; apply meta.auto to the autopilot flag; the same reset + scene change a live start does> }, step: () => <the fixed step function>, state: () => ({ <every gameplay field the update writes + the RNG state; NOT the frame counter, NOT the camera> }), pose: () => <hero on the field ? {x, y, facing, animation fields} in world px : null>, drawGhost: (ctx, p) => { <the hero's own sprite draw for p, minus the camera> }, progress: () => <number growing toward the goal>, exit: () => { <restore the autopilot flag; title scene> }, view: {w, h}, canvas, uiRects: () => [<HUD / window rects of the current scene>], params: {ghost: 'best', speed: 2, tint: 'cyan', watchKey: 'v', pauseKey: 'p'}})`.
2. *Where play of a run starts (title -> play), after the reset and the scene change; NOT at page load:* `rep.begin(runSeed, {auto: <autopilot flag>})`. Reset autopilot memory there too.
3. *The fixed step, where device input is read, BEFORE the autopilot choice:* `const raw = rep.input(readInput());` and use the returned value.
4. *Every win and every loss:* `rep.end({won: true})` / `rep.end({won: false})`.
5. *The live loop (not the ?t= fast-forward):* per fixed tick `for (let n = rep.steps(); n > 0; n--) step();`.
6. *World draw, just before the hero, inside the same transform; end of render in every scene:* `rep.drawGhost(ctx)`; `rep.draw(ctx)` last.

**Common mistakes** (symptom -> fix):

- DESYNC at 0:00 -> restart() differs from a live start (seed not applied, camera or frame counter in state()).
- DESYNC later and stats().randomCalls > 0 -> Math.random in the update; use the seeded RNG.
- A replay of an ?auto=1 run stands still -> the autopilot flag is not passed as meta and applied in restart().
- The time panel shows on the title -> begin() is called at page load.
- Speed and pause do nothing -> the loop still calls step() directly.
- The ghost faces the wrong way or slides -> pose() must carry facing and the animation fields; drawGhost uses the hero's frame selection.
- `?auto=1` ends differently -> the module only reads input; check that the returned input object is used unchanged and the autopilot still runs after it.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Seeded replay & ghost] Finish a run, press the watch key: the replay ends with END STATE MATCH; rep.verify('last').ok is true.
- [Seeded replay & ghost] The next run shows the ghost of the best run with BEST and a split; NEW BEST appears once when beaten.
- [Seeded replay & ghost] Pause, speed and scrub work in a replay; Esc returns to the title; `?auto=1` ends exactly like before.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `seeded-replay.js` sha256 `0c082a72a1d0ab0a...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Seeded replay & ghost] Each field the update writes is in state() or recomputed every step; every random number comes from the seeded RNG.
- [Seeded replay & ghost] begin at play start only, end at every win and loss, exit undoes restart.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

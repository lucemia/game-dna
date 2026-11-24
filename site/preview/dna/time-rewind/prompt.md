# Add Time rewind to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `time-rewind.js` (one global, `GameDNA_TimeRewind`), API reference `time-rewind.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Time rewind [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Time rewind:** a fixed update step (also run by ?t= fast-forward and ?auto=1) whose world update can be skipped: if (rewind.step(STEP_MS)) return; after input is read; the game state: snapshot() returning every variable the update writes and restore(s) assigning them back, or targets() listing the live state objects; canRecord(): true only while the world runs (not on title, pause, menus, dialogue, end screens); the end of render: rewind.draw(ctx) after the HUD; HUD rects through uiRects(); rewind.clear() where a new game, level or restart begins; facing and animation phase stored in the state (drawn from state, never from on-screen motion).

## Element 1: Time rewind (`time-rewind.js`, `GameDNA_TimeRewind`)

Hold a key (default R) or the touch button and the world runs backwards: the module deep-copies the game state every fixed step into a ring buffer and, while the key is held, restores older copies at 1x-3x under a rewind filter with a REWIND indicator, a history scrubber and an energy meter. On release play continues from the restored moment. The module is a gate at the top of the step, so without the key the game runs exactly as before.

**Parameters chosen:** `speed` = 2, `seconds` = 6, `energy` = meter, `meter` = 3, `charges` = 3, `recharge` = 6, `filter` = full, `ripple` = 0.5, `scanlines` = 0.5, `tint` = cool, `render` = auto, `touch` = auto, `reduced` = system, `key` = r.

**Where it goes** (by role; find these places in my game):

1. *Once, after the game state and the canvas exist:* `rewind = GameDNA_TimeRewind.create({snapshot: () => ({ <every variable the update writes: state objects, loose lets, RNG state, camera, autopilot memory> }), restore: s => { <assign each back from s> }, canRecord: () => <play scene and no pause / menu / dialogue / end screen>, view: {w: <logical width>, h: <logical height>}, canvas, uiRects: () => [<HUD rects, logical px>], params: {speed: 2, seconds: 6, energy: 'meter', meter: 3, tint: 'cool', key: 'r'}})`. State in `const` objects: `targets: () => [stateObj]` instead (restored in place).
2. *Your fixed update step (the one `?t=` fast-forward and `?auto=1` also run), right after input is read and BEFORE the autopilot and the world update:* `if (rewind.step(<step ms>)) return;`. A rewound step runs nothing else: no update, autopilot, sounds, score or timers.
3. *The end of render, after the HUD:* `rewind.draw(ctx)`.
4. *Where a new game, level or restart begins:* `rewind.clear()`.
5. *Wherever facing or an animation phase is computed from movement:* Store it in the state in the update and draw from it, so rewound characters keep facing their way.

**Common mistakes** (symptom -> fix):

- The hero turns around while rewinding -> facing is derived from the change in x; keep facing in the state.
- Some value keeps its new value after a rewind (timer, score, cooldown) -> it is missing from snapshot(); walk the update line by line.
- Stale objects after a rewind (an enemy that cannot be hit) -> code cached a reference; look it up again after restore, or use targets().
- Rewinding on the title or pause screen, or into the previous run -> canRecord() must be false there and clear() must run on new game.
- Autoplay ends differently -> the gate sits after the autopilot or restore runs outside a rewind; keep the gate before the autopilot.
- The HUD turns grey while rewinding -> pass its rects in uiRects().

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Time rewind] Hold the rewind key mid-play: the picture desaturates with scanlines, a REWIND indicator counts seconds, a scrubber shows the history; characters move backwards still facing their way. Release: play continues from that moment and the meter refills.
- [Time rewind] Holding the key on the title or pause screen does nothing; `?auto=1` ends exactly as before.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `time-rewind.js` sha256 `d7226aca8d3d732d...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Time rewind] Every variable the update writes is in snapshot() and assigned back in restore().
- [Time rewind] `rewind.step` returns early before the autopilot and the update; `?t=` fast-forward calls the same step.
- [Time rewind] Walk one rewind with the defaults: holding 30 steps at speed 2 restores the state from 60 steps before the press and uses 17% of a 3 s meter.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

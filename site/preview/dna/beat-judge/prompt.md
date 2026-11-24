# Add Beat judge to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `beat-judge.js` (one global, `GameDNA_BeatJudge`), API reference `beat-judge.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Beat judge [input].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Beat judge:** the game's fixed update step in every scene (the beat clock while sound is off); the input event (keydown / pointerdown) of the judged action, kept until the game accepts the action; the one function every judged player action goes through (where the rating scales the game's own result); a free strip 22 canvas px tall for the beat track; a key or menu entry for calibration (optional).

## Element 1: Beat judge (`beat-judge.js`, `GameDNA_BeatJudge`)

A beat clock and an input judge: the player action the designer names is rated Perfect, Good or Miss against the nearest beat, timed at the key or tap EVENT (not the frame) minus audio latency and the player's calibration offset; the game scales its own result (Perfect x1.5, Good x1, Miss x0.5). A beat track shows markers sliding to a judge ring, EARLY / LATE and the combo; a calibration window sets the offset from 8 taps. Beats follow Chip music chip-music when present, else its own clock with a click track that starts on the first click or key.

**Parameters chosen:** `bpm` = 120, `perfect` = 45, `good` = 100, `perfectMult` = 1.5, `missMult` = 0.5, `expect` = false, `calibrateKey` = C.

**Where it goes** (by role; find these places in my game):

1. *Once at startup:* `beat = GameDNA_BeatJudge.create({params: {bpm: 120, perfect: 45, good: 100, expect: false}, getObstacles: () => [/* sprite rects with id */], hints: {tap: '<confirm key> OR TAP', cancel: '<back key>: CANCEL'}})`; never create an AudioContext.
2. *The fixed update step of EVERY scene, also ?t= and autoplay loops:* `beat.update(stepMs)`; while `beat.busy()` skip the world but keep this call and route confirm / back / arrows to `beat.key(name, e)`, canvas taps to `beat.pointer(x, y, e)`.
3. *The key / pointer handler that starts the judged action:* also store the event: `lastActionEvent = e` (do not judge here); clear it at the end of each step.
4. *The ONE function every judged player action goes through:* `const r = lastActionEvent ? beat.press(lastActionEvent) : null;` then multiply what the game already computes: perfect x1.5, good x1, miss x0.5; autopilot actions never call press().
5. *HUD draw; an unused key:* `beat.draw(ctx, {x, y, w, h: 22})` in a free strip clear of the HUD and the feet; key C calls `beat.calibrate()`; `beat.reset()` on a new game.

**Common mistakes** (symptom -> fix):

- Perfects are rare and everything reads ~10 ms late -> `press()` got no event (judged at the frame); pass the stored keydown / pointerdown event.
- `?auto=1` ends differently -> the autopilot's actions were judged; only a stored real input event may reach `press()`.
- Markers frozen in ?t= stills -> `update()` missing from the fast-forward loop or a scene.
- The calibration window never closes -> confirm / back are not routed to `key()` while `busy()`, or `update()` stops with the world.
- A sound button mutes on the first click -> wire it to `toggle()`, never straight to `mute()`.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Beat judge] Pressing the action on the beat shows PERFECT and applies the bonus; slightly off shows GOOD with EARLY / LATE; far off or mashing shows MISS.
- [Beat judge] The calibration key opens the window; 8 taps give an offset; KEEP shifts later ratings.
- [Beat judge] `?auto=1` ends exactly as before with no console errors; no sound before the first click or key.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `beat-judge.js` sha256 `dfa3ca915e0070df...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Beat judge] `press(` appears once, inside the action's function, guarded by a stored real input event.
- [Beat judge] `update(` is reached in every scene, also while `busy()`; `create` runs once; the module file is unchanged.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

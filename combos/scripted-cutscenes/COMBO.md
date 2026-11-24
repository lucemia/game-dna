# Add scripted cutscenes to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `scripted-cutscenes.js` (one global, `GameDNA_Cutscenes`), API reference `scripted-cutscenes.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Scripted cutscenes [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Scripted cutscenes:** actors: get() of each scripted character's feet in world px and facing, set(pose) to write position / facing / walking / walk frame back; a camera offset; a fixed update step, called first in the step (also on the ?t= replay); the world and player input paused while locked(); optional: the game's dialogue box (open / isOpen / close), its wall test and tile size for routing, onCall / onCue handlers.

## Element 1: Scripted cutscenes (`scripted-cutscenes.js`, `GameDNA_Cutscenes`)

Scripted cutscenes: a small script (move, face, say, wait, cam pan / cut / zoom, fade, emote, cue, call, all) plays a scene in the game's world: characters walk with walk frames that advance with distance and face their path, the camera stays inside the map, letterbox bars slide in, lines use the game's dialogue box. Hold to skip lands on the play-through end state; control returns once.

**Parameters chosen:** `bars` = 0.09, `skip` = hold, `holdMs` = 700, `textSpeed` = 42, `speed` = 60, `stride` = 6, `runStride` = 0, `theme` = night, `box` = auto, `render` = auto, `compact` = auto, `emotes` = auto.

**Where it goes** (by role; find these places in my game):

1. *Once the characters exist (before a ?t= fast-forward loop):* `cs = GameDNA_Cutscenes.create({view, stage, world, camera, actors, dialogue, onCall, cssScale, auto, params: {bars: 0.09, skip: 'hold', textSpeed: 42}})`. `actors[id].get()` = feet in WORLD px + facing; `set(p)` writes x, y, face / angle, moving, run and the walk animation (`p.frame` from the distance walked; give actors `frames: 4` or more and a `stride`) back. `camera()` = the game's follow rule for the CURRENT positions. `dialogue` = the game's own box (open(name, text, done), isOpen, close).
2. *The story moment (once):* `cs.play(SCENE, {id, once: true})` from the code that decides it (a quest accepted, a gate reached); game-state changes as `{call: name}` handled in `onCall`; the script ends with everyone where the game expects them.
3. *The fixed step, every scene (also the ?t= replay):* `cs.update(stepMs)` FIRST (0 while a pause menu is open); then while `cs.locked()`: no world / enemy / player movement update, no autopilot movement input or snapping, no advance of frame counters the autopilot uses; the game's dialogue keeps its keys.
4. *Input:* confirm: `if (!cs.input('ok'))` the game's box; skip key down / up: `cs.input('skip', true / false)` while locked.
5. *Render:* the world with `cs.camera() || gameCamera` (translate -x, -y; scale zoom); the HUD at alpha `1 - cs.bars()`; `cs.draw(ctx)` in screen space; then the game's dialogue box. Restart: `cs.reset()`.

**Common mistakes** (symptom -> fix):

- `?auto=1` ends differently -> the world ran a frame while locked (update() called after the input / world step), the autopilot snapped the hero onto its path while locked, or a frame counter the autopilot times itself by kept running.
- Camera jumps when the scene ends -> `camera()` returns a stored value instead of the follow rule for current positions.
- Hero slides without stepping -> the game animates walking from its own counter: set it from `pose.walk`.
- Scene hangs on a line -> the game's box never calls `done`, or Z is consumed by `cs.input` while the game's box is open (input returns false then: pass it on).
- Bars cover the game's dialogue box -> draw `cs.draw` before the box.
- Text tiny on phones -> pass `cssScale()`.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Scripted cutscenes] The scene plays once: bars in, actors walk with walk frames facing their path, the camera stays inside the map, lines in the game's box, bars out.
- [Scripted cutscenes] Holding skip fades and lands on the same positions / flags as playing through; onEnd once.
- [Scripted cutscenes] `?auto=1` reaches the same end state as before with no console errors.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `scripted-cutscenes.js` sha256 `d3d2ea0be1056315...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Scripted cutscenes] `get` / `set` agree (feet in world px, the sprite offset applied both ways); `camera()` and the world draw use the same top-left.
- [Scripted cutscenes] Every script `call` has an `onCall` case; every actor id is in `actors`; nothing but the module moves the player while locked.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

# Add world-space bark bubbles to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `bark-bubbles.js` (one global, `GameDNA_BarkBubbles`), API reference `bark-bubbles.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) World-space bark bubbles [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **World-space bark bubbles:** screen positions of targets; events on the frame they happen: spotted, lost, hurt, lowhp, kill, greet, idle (or exact lines); a world clock in ms that can pause; rectangles of UI to keep clear (optional); optional: list of NPCs allowed to chat when idle.

## Element 1: World-space bark bubbles (`bark-bubbles.js`, `GameDNA_BarkBubbles`)

Short lines in speech bubbles above characters while the game keeps running: an enemy that notices the player shows a yellow "!" alarm bubble, a hit character a red-edged hurt bubble, the player shouts after a kill, NPCs chat when idle. Bubbles pop in, type their line, follow the speaker, never overlap each other, the HUD or windows, stay on screen with a pointer tail when the speaker is at or past the edge, and fade after a reading time. Smooth on HD canvases, crisp pixel bubbles with a bitmap font on native pixel canvases. Never pauses, never reads input.

**Parameters chosen:** `size` = 0, `width` = 20, `cps` = 45, `read` = 55, `hold` = 1500, `max` = 0, `cooldown` = 4000, `stagger` = 600, `idle` = 7000, `pop` = 0.5, `palette` = light, `render` = auto, `edge` = pointer.

**Where it goes** (by role; find these places in my game):

1. *Once, after the canvas and the characters exist, before the first event:* `barks = GameDNA_BarkBubbles.create({bounds, getAnchor, getObstacles, speakers, params: {size: 0, width: 20, cps: 45, read: 55, hold: 1500, max: 0, cooldown: 4000, idle: 7000, stagger: 600, pop: 0.5, palette: 'light', render: 'auto', edge: 'pointer'}})`. Everything in screen px (world minus camera, plus any HUD offset). `bounds` = the visible field. `getAnchor(id)` -> `{x, top, w, h}`: sprite centre x and head top (hat, hover, HP bar included), `null` when gone. `getObstacles()` -> each living character's sprite rect with its `id`, plus every HUD panel and open window without `id`. `speakers()` -> `[{id, voice}]` of NPCs allowed to chat while the map is shown, `[]` elsewhere (voices `villager`, `guard`, `merchant`, `hero`, `monster`, `critter`).
2. *Where the game changes a character's state: the line that switches an enemy to chasing / alert, every HP loss, the kill, talking to an NPC:* On the change, once: `barks.bark(id, 'spotted' | 'lost' | 'hurt' | 'lowhp' | 'kill' | 'greet', {voice})`; exact lines `barks.say(id, text, {tone})` (talk, shout, alarm, hurt, whisper, think). Before opening a real dialogue with an NPC: `barks.silence(npcId)`. Never use the game's RNG for barks.
3. *Your fixed update step (every scene, so bubbles finish fading):* `barks.update(stepMs)`; `barks.update(0)` while the world is frozen or paused by a window.
4. *Your draw pass, after characters and effects, before HUD and windows:* `barks.draw(ctx)` once per frame in screen coordinates (inside a camera translate: `barks.draw(ctx, camX, camY)`). Never clip or filter it.
5. *New game, restart, and every switch to another screen (battle screen, title):* `barks.clear()`; return `null` anchors for characters that screen does not show.

**Common mistakes** (symptom -> fix):

- The same bark every few seconds while an enemy chases -> `bark` sits in a per-frame condition; call it on the transition (not chasing -> chasing).
- Bubbles drift when the camera moves -> world coordinates; anchors and obstacles in screen px.
- Bubbles over the HUD or the dialogue box -> those rects are missing from `getObstacles()` (no `id`), or the bubbles are drawn after the windows.
- A tail points at the wrong character -> the ids passed to `bark` differ from the ids in `getAnchor` / `getObstacles`.
- Bubbles linger on the battle screen or the title -> `clear()` on screen switches.
- `?auto=1` ends differently -> barks consumed the game's RNG or changed state.
- Blurry bubbles on a native pixel game drawn into a larger backing store -> `render: 'crisp'`.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [World-space bark bubbles] An enemy that notices the player shows a yellow "!" bubble above it on that frame; a hit shows a red-edged hurt bubble above the victim.
- [World-space bark bubbles] Bubbles follow walking speakers, never overlap each other, a HUD panel or a window, and fade after a few seconds.
- [World-space bark bubbles] A speaker at or past the screen edge keeps its bubble inside the screen with the tail pointing at it.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `bark-bubbles.js` sha256 `afb82110121b88c3...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [World-space bark bubbles] List every `bark` call and the state change it is guarded by (fires once per change).
- [World-space bark bubbles] Walk one hit: HP change -> `barks.bark(id, 'hurt', ...)` -> `barks.update` each step -> `barks.draw` each frame, with screen coordinates that match where the sprite is drawn.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

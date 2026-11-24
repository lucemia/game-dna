# Add Chip music to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `chip-music.js` (one global, `GameDNA_ChipMusic`), API reference `chip-music.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Chip music [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Chip music:** the game's fixed update step in every scene (the music clock while audio is off); a state-to-track mapping (title / field / battle / none) read each step; the code that decides each event worth a jingle (item, battle won, final win, game over); an empty HUD corner (23x11 native px) and the pointer handler for the sound badge (optional).

## Element 1: Chip music (`chip-music.js`, `GameDNA_ChipMusic`)

A four-channel chip band (two pulse leads with duty cycle, stepped triangle bass, noise drums) synthesized in Web Audio from pattern data, no audio files: loops title, field and battle that wrap without a seam, and jingles victory, defeat and item that pause the loop and bring it back on the next beat. Track switches land on the beat; play(track) for the current track is a no-op, so the game can name the track for its state every step. A small sound badge shows four channel meters and toggles mute. Silent until the first click or key; deterministic under ?t= fast-forward.

**Parameters chosen:** `volume` = 0.7, `jingleMode` = pause, `resume` = beat, `tempo` = 1, `transpose` = 0, `duck` = 0.25, `mute` = off.

**Where it goes** (by role; find these places in my game):

1. *Once at startup (never per level or per frame):* `music = GameDNA_ChipMusic.create({params: {volume: 0.7, jingleMode: 'pause', resume: 'beat', tempo: 1}})`. Sound starts on the player's first click, tap or key; never create an AudioContext.
2. *The fixed update step of EVERY scene (title, play, menus, results), also in ?t= / autoplay loops:* `music.update(stepMs)` with the game's own step.
3. *Right after it, each step:* `const t = musicFor(); if (t) music.play(t);` where `musicFor()` reads state only and returns `'title'`, `'field'` (exploring), `'battle'` (a fight) or `null` (results screens). If Adaptive music adaptive-music is in the basket, return null here during gameplay (title and results only) and skip `after: 'field'`: adaptive music picks the gameplay track.
4. *The code that DECIDES each event, once per event:* chest, key item, level-up, wave cleared `music.jingle('item')`; a battle won that returns to exploring `music.jingle('victory', {after: 'field'})`; the final win `music.jingle('victory', {after: 'stop'})`; game over `music.jingle('defeat', {after: 'stop'})`. Each jingle pauses the music: victory only when a whole fight or encounter ends (never per enemy killed), item only for rare finds (chest, key item, level-up; never coins or small pickups, use Procedural sound effects sfx for those).
5. *HUD draw of every scene; the pointer handler; an unused key:* `music.draw(ctx, x, y)` in an empty corner (23x11 px, `{scale: 2}` above 400 px wide); `if (music.hit(canvasX, canvasY)) return;` before the game's own pointer code; key M (if unused) `music.mute()`.

**Common mistakes** (symptom -> fix):

- The title row never moves in ?t= stills -> `update` is not called in the fast-forward loop or the title scene.
- Battle music comes back after a defeat jingle -> `musicFor()` names a DIFFERENT track on the results screen; return null there (repeating the interrupted track is ignored).
- A jingle fires every frame (jingle spam) -> it sits in a per-frame condition; call it on the frame the event is decided.
- Music restarts at every step -> `play(t, {restart: true})` or `create` per frame; call plain `play(t)` and create once.
- `?auto=1` ends differently -> a call moved game code into a new branch or used the game's random numbers.
- The badge covers the HUD -> pick another corner; it is 23x11 native px.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Chip music] After one click the title loop plays; starting the game switches loops on a beat, never mid-note.
- [Chip music] A chest or item plays the item jingle and the loop continues from a beat, not from its start; wins and losses play their jingles once.
- [Chip music] Before any click the game runs silently with no console errors; `?auto=1` ends exactly as before; the badge toggles mute.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `chip-music.js` sha256 `8c2c5c97f89fb193...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Chip music] List each `jingle` call with the line where its event is decided; `musicFor()` only reads state.
- [Chip music] `create` runs once; `update` is reached in every scene; no game line was removed or moved into a new branch.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

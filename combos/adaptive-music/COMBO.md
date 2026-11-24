# Add chip music and adaptive music to my game

Add the 2 game elements below to MY existing game, which you have not seen. Each is a finished module file given with this prompt:

- `chip-music.js` (one global, `GameDNA_ChipMusic`), API reference `chip-music.README.md`
- `adaptive-music.js` (one global, `GameDNA_AdaptiveMusic`), API reference `adaptive-music.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Chip music [effects], (2) Adaptive music [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Chip music:** the game's fixed update step in every scene (the music clock while audio is off); a state-to-track mapping (title / field / battle / none) read each step; the code that decides each event worth a jingle (item, battle won, final win, game over); an empty HUD corner (23x11 native px) and the pointer handler for the sound badge (optional).
- **Adaptive music:** one F-03 chip-music instance (shipped in the same basket; the game creates it once and steps it); a per-step report read from game state: active (gameplay), combat (foes engaged or close), boss (a boss fight), hp (0-1); the track picker that calls chip music's play() each step, returning null during gameplay.

## Element 1: Chip music (`chip-music.js`, `GameDNA_ChipMusic`)

A four-channel chip band (two pulse leads with duty cycle, stepped triangle bass, noise drums) synthesized in Web Audio from pattern data, no audio files: loops title, field and battle that wrap without a seam, and jingles victory, defeat and item that pause the loop and bring it back on the next beat. Track switches land on the beat; play(track) for the current track is a no-op, so the game can name the track for its state every step. A small sound badge shows four channel meters and toggles mute. Silent until the first click or key; deterministic under ?t= fast-forward.

**Parameters chosen:** `volume` = 0.7, `jingleMode` = pause, `resume` = beat, `tempo` = 1, `transpose` = 0, `duck` = 0.25, `mute` = off.

**Where it goes** (by role; find these places in my game):

1. *Once at startup (never per level or per frame):* `music = GameDNA_ChipMusic.create({params: {volume: 0.7, jingleMode: 'pause', resume: 'beat', tempo: 1}})`. Sound starts on the player's first click, tap or key; never create an AudioContext.
2. *The fixed update step of EVERY scene (title, play, menus, results), also in ?t= / autoplay loops:* `music.update(stepMs)` with the game's own step.
3. *Right after it, each step:* `const t = musicFor(); if (t) music.play(t);` where `musicFor()` reads state only and returns `'title'`, `'field'` (exploring), `'battle'` (a fight) or `null` (results screens). If F-05 adaptive-music is in the basket, return null here during gameplay (title and results only) and skip `after: 'field'`: adaptive music picks the gameplay track.
4. *The code that DECIDES each event, once per event:* chest, key item, level-up, wave cleared `music.jingle('item')`; a battle won that returns to exploring `music.jingle('victory', {after: 'field'})`; the final win `music.jingle('victory', {after: 'stop'})`; game over `music.jingle('defeat', {after: 'stop'})`. Each jingle pauses the music: victory only when a whole fight or encounter ends (never per enemy killed), item only for rare finds (chest, key item, level-up; never coins or small pickups, use F-02 sfx for those).
5. *HUD draw of every scene; the pointer handler; an unused key:* `music.draw(ctx, x, y)` in an empty corner (23x11 px, `{scale: 2}` above 400 px wide); `if (music.hit(canvasX, canvasY)) return;` before the game's own pointer code; key M (if unused) `music.mute()`.

**Common mistakes** (symptom -> fix):

- The title row never moves in ?t= stills -> `update` is not called in the fast-forward loop or the title scene.
- Battle music comes back after a defeat jingle -> `musicFor()` names a DIFFERENT track on the results screen; return null there (repeating the interrupted track is ignored).
- A jingle fires every frame (jingle spam) -> it sits in a per-frame condition; call it on the frame the event is decided.
- Music restarts at every step -> `play(t, {restart: true})` or `create` per frame; call plain `play(t)` and create once.
- `?auto=1` ends differently -> a call moved game code into a new branch or used the game's random numbers.
- The badge covers the HUD -> pick another corner; it is 23x11 native px.

## Element 2: Adaptive music (`adaptive-music.js`, `GameDNA_AdaptiveMusic`)

Layered music that follows the game state over chip music: each chip channel is a stem (bass always, drums for fights and the boss, the melody, a tense danger line at low health); the boss has its own track. The game reports active / combat / boss / hp every step; changes are debounced (0.5 s to start, 3 s to calm down, HP hysteresis), land on the next bar line with a one-bar stinger when the mood changes, and never overlap. The game's own jingles and title / results loops keep every channel open.

**Parameters chosen:** `quantize` = bar, `enterMs` = 500, `exitMs` = 3000, `lowHp` = 0.3, `stingers` = on.

**Where it goes** (by role; find these places in my game):

1. *Before anything: chip music's own steps:* Wire chip music's create, update, title loop and jingles, but NOT its `'field'` / `'battle'` picker or `after: 'field'`: the next steps replace them, so nothing has to be undone.
2. *Once at startup, right after the chip-music instance:* `adaptive = GameDNA_AdaptiveMusic.create({music, params: {quantize: 'bar', enterMs: 500, exitMs: 3000, lowHp: 0.3, stingers: 'on'}})`.
3. *The fixed update step of EVERY scene, right after `music.update(stepMs)` (also in ?t= / autoplay loops):* `adaptive.update({active, combat, boss, hp})`: active = in gameplay; combat = foes engaged or within a short distance of the hero; boss = a boss fight on (awake / seen and alive); hp = hero.hp / hero.maxHp. Read state only.
4. *The chip-music track picker (`musicFor()`); THIS OVERRIDES chip music's `'field'` / `'battle'` step:* Return `'title'` on the title and `null` during gameplay and results: adaptive music picks the gameplay track. Never `'field'` / `'battle'` while active.
5. *The code that DECIDES each event, once per event; THIS OVERRIDES chip music's `after: 'field'`:* Few jingles, each pauses the music: `music.jingle('victory')` only when a whole fight or encounter ends or the boss falls (never per kill: a kill only lets `combat` go false); `music.jingle('item')` only for rare finds (chest, key item, level-up), never coins or small pickups (F-02 sfx if present); no `after` while play continues; the final win / game over: `after: 'stop'` and `active: false` on that screen. If the boss is the last fight, the boss falling IS the final win: `music.jingle('victory', {after: 'stop'})` (the boss stinger only plays when the fight starts; adaptive music adds nothing at the end).

**Common mistakes** (symptom -> fix):

- Field and battle loops fight the layers (`adaptive.stats().conflicts` > 0) -> the chip-music picker still names a loop during gameplay; return null there.
- The music never changes in ?t= stills -> `music.update` / `adaptive.update` missing from the fast-forward loop.
- The music keeps pausing (jingles on every kill or coin) -> victory only when the fight ends, no jingle for coins; the module drops repeats (`state().jingleLimit.dropped`).
- Low HP blinks at the threshold -> pass hp as a fraction 0-1 (or hp with maxHp).
- Drums never come in -> `combat` is true only for a frame (e.g. on the hit); report it while foes are engaged or close.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Chip music] After one click the title loop plays; starting the game switches loops on a beat, never mid-note.
- [Chip music] A chest or item plays the item jingle and the loop continues from a beat, not from its start; wins and losses play their jingles once.
- [Chip music] Before any click the game runs silently with no console errors; `?auto=1` ends exactly as before; the badge toggles mute.
- [Adaptive music] After one click: explore plays bass and melody; meeting foes brings the drums in on a bar line with a short stinger, about 0.5 s plus up to a bar later; a foe brushing past changes nothing.
- [Adaptive music] Low health brings the danger line in on a bar; a boss switches to the boss track on a bar; its victory jingle plays with full music.
- [Adaptive music] The loop is paused by jingles less than 15 % of a normal run.
- [Adaptive music] `?auto=1` ends exactly as before; `adaptive.stats()` errors and conflicts are 0; every `adaptive.plan()` change has `at` on a bar line.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `chip-music.js` sha256 `8c2c5c97f89fb193...`, `adaptive-music.js` sha256 `b127c28ed978abec...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Chip music] List each `jingle` call with the line where its event is decided; `musicFor()` only reads state.
- [Chip music] `create` runs once; `update` is reached in every scene; no game line was removed or moved into a new branch.
- [Adaptive music] `adaptive` is created once after `music`; `adaptive.update` follows `music.update` in every scene.
- [Adaptive music] List the lines `combat`, `boss` and `hp` read; nothing in the game was changed for them.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

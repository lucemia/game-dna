# Add procedural sound effects to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `procedural-sfx.js` (one global, `GameDNA_Sfx`), API reference `procedural-sfx.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Procedural sound effects [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Procedural sound effects:** the code that decides each event (jump, land, hit, crit, shot, explosion, pickup, heal, hurt, menu move / confirm / cancel); a fixed update step in every scene (optional: merge gaps follow game time, ?t= fast-forward stays deterministic); distance walked per step and on-ground for footsteps (optional); the event's screen x and the screen width for stereo pan (optional).

## Element 1: Procedural sound effects (`procedural-sfx.js`, `GameDNA_Sfx`)

Fourteen game sounds (hit, crit, coin, jump, land, footstep, menu move / confirm / cancel, explosion, laser, power-up, heal, hurt) synthesized live with Web Audio, no audio files. Every call is a seeded variation; a small mixer caps voices, merges same-frame duplicates, ducks the rest under big sounds and keeps peaks under a soft ceiling. Silent until the player's first click or key, a no-op without Web Audio, never touches game state or input.

**Parameters chosen:** `master` = 0.8, `sfx` = 1, `variation` = 0.5, `style` = modern, `pitch` = 0, `brightness` = 1, `length` = 1, `maxVoices` = 12, `duck` = 6, `stride` = 22, `mute` = off.

**Where it goes** (by role; find these places in my game):

1. *Once at startup (never per level or per frame):* `sfx = GameDNA_Sfx.create({seed: 1, params: {master: 0.8, sfx: 1, variation: 0.5, style: 'modern', pitch: 0, brightness: 1, length: 1, maxVoices: 12, duck: 6, stride: 22, mute: 'off'}})`. Audio starts on the player's first click, tap or key; do not create an AudioContext yourself.
2. *Your fixed update step, at the top, in every scene (title, play, menus, end screens):* `sfx.update(stepMs)`.
3. *Where the player character moves on the ground (once per step):* `sfx.walk('player', <distance actually moved this step, px>, <on ground>)`: a footstep every 22 px.
4. *The code that DECIDES each event, once per event (the frame it happens), never in a per-frame condition:* jump starts `sfx.play('jump')`; landing after a fall `'land'`; an attack connects `'hit'`, a critical or killing blow `'crit'`; a shot or bolt fired `'laser'`; an explosion or big area attack `'explosion'`; the PLAYER takes damage `'hurt'`; coin or small pickup `'coin'`; power-up, level-up, key item, victory `'powerup'`; heal, rest, potion `'heal'`. World events pass `{x: <screen x>, width: <screen width>}` for stereo pan.
5. *Menus and windows:* cursor moved `'menu-move'`; confirm or open `'menu-confirm'`; cancel, back or close `'menu-cancel'`. Optional: a "Sound" entry in the game's own options calling `sfx.mute()`.

**Common mistakes** (symptom -> fix):

- A buzz while touching something -> `play` sits in a per-frame overlap or "while attacking" condition; call it on the frame the event happens.
- Silence after clicking -> `create` runs per frame or per level (each new instance starts locked); create once.
- Every coin sounds the same -> `variation` is 0 or a fixed `seed` is passed on every call.
- `?auto=1` ends differently -> a call moved game code into a new branch or used the game's random numbers; sound calls are fire-and-forget.
- Footsteps in the air or against a wall -> pass the distance really moved and the real on-ground flag to `walk`.
- `hurt` on enemy hits -> `hurt` is for the player; enemies use `hit` / `crit`.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Procedural sound effects] After one click: jumping, landing, hits, pickups, damage and menus each make their sound once per event; walking makes soft steps in rhythm.
- [Procedural sound effects] Repeating an action sounds slightly different each time; nothing clicks, crackles or clips when an explosion and several hits overlap.
- [Procedural sound effects] Before the first click the game runs silently with no console errors; `?auto=1` ends exactly as before.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `procedural-sfx.js` sha256 `3c1dc6a4c4424269...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Procedural sound effects] List each `play` / `walk` call with the event behind it and where the event is decided; none runs every frame while a condition holds.
- [Procedural sound effects] `create` runs once; `update` is reached in every scene; no game line was removed or moved into a new branch.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

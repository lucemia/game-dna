# Add chip music to my game

Parameters (defaults): volume {{volume}} = 0.7, jingleMode {{jingleMode}} = pause, resume {{resume}} = beat, tempo {{tempo}} = 1.

Add looping chip-style music to my existing browser game with the attached module `chip-music.js` (global `GameDNA_ChipMusic`) and its `README.md`. It synthesizes a 4-channel chip band in Web Audio (no audio files), ships loops `title`, `field`, `battle` and jingles `victory`, `defeat`, `item`, and owns the click-to-start rule, seamless loops and beat-quantized switching. Include the module verbatim (`<script src>` or pasted unchanged before the game's script); do not edit it. Only ADD calls; never remove, rename or replace my functions.

## Steps

1. **Create once at startup**: `const music = GameDNA_ChipMusic.create({ params: { volume: {{volume}}, jingleMode: '{{jingleMode}}', resume: '{{resume}}', tempo: {{tempo}} } });`. Sound starts on the player's first click, tap or key; never create an AudioContext yourself.
2. **Fixed update, every scene** (title, play, menus, results): `music.update(stepMs)` with the game's own step, also in any fast-forward or autoplay loop.
3. **Pick the loop from game state**: write `musicFor()` returning `'title'`, `'field'` (exploring, map, platforming), `'battle'` (a fight or boss), or `null` (results screens), and call `const t = musicFor(); if (t) music.play(t);` each step. Playing the current track again does nothing; switches land on the next beat.
4. **Jingles at the code that DECIDES the event** (once per event, never in a per-frame condition):
   - chest, key item, level-up, wave cleared: `music.jingle('item')` (the loop pauses and comes back on a beat)
   - a battle won that returns to exploring: `music.jingle('victory', { after: 'field' })`
   - the final win: `music.jingle('victory', { after: 'stop' })`; game over: `music.jingle('defeat', { after: 'stop' })`
   Make `musicFor()` return `null` on the screen that follows a jingle with `after: 'stop'`.
5. **Sound badge**: in the HUD draw of every scene, `music.draw(ctx, x, y)` in an empty corner (23x11 canvas px; `{ scale: 2 }` above 400 px wide) where it covers no text, bar or character. In the pointer handler, before the game's own code: `if (music.hit(canvasX, canvasY)) return;`. If the key M is unused, make it call `music.mute()`.

## Keep every caller working

Find every place that reads input, runs autoplay (`?auto=1`), fast-forwards (`?t=` / freeze), restarts or changes scenes; each must behave exactly as before. Without a click the module stays silent, so automated runs must end exactly as before. Do not use the game's random-number generator for music.

## Self-check without a browser

- `create` runs once; `music` is defined before the first `update`/`play`.
- `update` is reached in every scene with the same step value the game uses.
- List each `jingle` call with the line where its event is decided; each runs once per event.
- `musicFor()` reads state only; the per-step `play` never sits inside a branch that skips scenes.
- Every function you touched: no line removed, no condition changed, no new early `return` except the badge hit test.
- The module file is byte-identical to the one given.

## Acceptance checks (run them)

1. Before any click: no console errors, the badge shows grey with a blinking dot; `?auto=1` ends exactly as before.
2. Click once: the title loop plays; starting the game switches to the field or battle loop on a beat, never mid-note.
3. Opening a chest (or the equivalent) plays the item jingle, then the loop continues from a beat, not from its start.
4. Winning and losing play their jingles once; the results screen is silent; returning to the title restarts the title loop.
5. Clicking the badge (or M) mutes and unmutes; pausing and restarting still work.

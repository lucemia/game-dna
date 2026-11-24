# Add procedural sound effects to my game

Parameters (defaults): master {{master}} = 0.8, variation {{variation}} = 0.5, style {{style}} = modern, maxVoices {{maxVoices}} = 12, duck {{duck}} = 6, stride {{stride}} = 22.

Add sound effects to my existing browser game with the attached module `procedural-sfx.js` (global `GameDNA_Sfx`) and its `README.md`. It synthesizes every sound with Web Audio (no audio files) and owns the mixer, voice limit, ducking, variation and the click-to-unlock rule. Include the module verbatim (`<script src>` or pasted unchanged before the game's script); do not edit it. Only ADD calls to my game; never remove, rename or replace my functions.

## Steps

1. **Create once at startup**: `const sfx = GameDNA_Sfx.create({ seed: 1, params: { master: {{master}}, variation: {{variation}}, style: '{{style}}', maxVoices: {{maxVoices}}, duck: {{duck}}, stride: {{stride}} } });`. Audio starts on the player's first click, tap or key; do not create an AudioContext yourself.
2. **Fixed update step, every scene** (title, play, menus, end screens): `sfx.update(stepMs)` at the top.
3. **Find the code that DECIDES each event** and add one `play` there. Pick what the game has:
   - jump starts: `'jump'`; landing after a fall (only when airborne a few frames): `'land'`
   - walking: `sfx.walk('player', distanceMovedThisStep, isOnGround)` every step (plays `'footstep'` every {{stride}} px)
   - an attack connects: `'hit'`; a critical or finishing blow: `'crit'`; a shot, bolt or spell is fired: `'laser'`
   - an explosion or big area attack lands: `'explosion'`; the player takes damage: `'hurt'`
   - coin or small pickup: `'coin'`; power-up, level-up, key item, victory sting: `'powerup'`; heal, rest, potion: `'heal'`
   - menu cursor moves: `'menu-move'`; confirm or open a window: `'menu-confirm'`; cancel, back or close: `'menu-cancel'`
   For world events pass a pan: `sfx.play('hit', { x: screenX, width: screenWidth })`.
4. **Leave game logic alone**: do not move existing code into new branches, do not use the game's random-number generator for sounds, and never put `play` inside per-frame conditions (overlap tests, "while attacking", "while hp is low").
5. Optional: if the game has an options menu, add a "Sound" toggle calling `sfx.mute()`. Do not add a new key binding unless the key is unused.

## Keep every caller working

Find every place that reads input, runs autoplay (`?auto=1`), fast-forwards (`?t=` / freeze), restarts or changes scenes; each must behave exactly as before. `play` is fire-and-forget; without a click the module stays silent, so automated runs must end exactly as before.

## Self-check without a browser

- List each `play`/`walk` call with the event behind it and the line where the event is decided. Each runs once per event.
- Every function you touched: no line removed, no condition changed, no new early `return`.
- `GameDNA_Sfx.create` runs once (not per level or frame); `sfx` is defined before the first `update`/`play` can run.
- `update` is reached in every scene, including title and end screens.
- The module file is byte-identical to the one given.

## Acceptance checks (run them)

1. Open the game, click once: jumping, landing, hitting, pickups, damage and menus each make their sound once per event; walking makes soft steps in rhythm.
2. Repeating an action sounds slightly different each time, never machine-gun identical; nothing clicks, crackles or clips, even when an explosion and several hits overlap.
3. Before the first click the game runs silently with no console errors; `?auto=1` (if present) ends exactly as before.
4. Pausing, restarting and the title screen still work; menu sounds play in menus.

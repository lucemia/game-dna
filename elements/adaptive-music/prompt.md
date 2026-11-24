# Add adaptive music to my game

Parameters (defaults): quantize {{quantize}} = bar, enterMs {{enterMs}} = 500, exitMs {{exitMs}} = 3000, lowHp {{lowHp}} = 0.3, stingers {{stingers}} = on.

Make my game's music follow its state with the attached `adaptive-music.js` (global `GameDNA_AdaptiveMusic`, see its `README.md`). It needs the attached `chip-music.js` (`GameDNA_ChipMusic`): wire chip music first (one instance, `update` every step) but skip its `'field'` / `'battle'` picker and `after: 'field'`; steps 3 and 4 replace them. Include both modules verbatim (`<script src>` or pasted unchanged, chip music first); do not edit them. Only ADD calls; never remove, rename or replace my functions.

## Steps

1. **Create once, after chip music**: `const adaptive = GameDNA_AdaptiveMusic.create({ music, params: { quantize: '{{quantize}}', enterMs: {{enterMs}}, exitMs: {{exitMs}}, lowHp: {{lowHp}}, stingers: '{{stingers}}' } });` (`music` is the chip-music instance).
2. **Report every fixed step, in every scene, right after `music.update(stepMs)`** (also in fast-forward and autoplay loops):
   `adaptive.update({ active, combat, boss, hp });`
   - `active`: true in gameplay; false on title, menus, results, game over.
   - `combat`: foes engaged or close (a battle scene, an enemy near or chasing), not "an enemy exists somewhere".
   - `boss`: a boss fight is on (the boss is awake or seen and alive).
   - `hp`: hero health 0-1 (`hero.hp / hero.maxHp`).
   Read state only.
3. **Hand the track choice to adaptive music during gameplay**: wherever the game picks chip-music loops (`music.play(...)` every step), return `null` / skip it while `active` is true. Keep `music.play('title')` and other non-gameplay loops.
4. **Few jingles** (each pauses the music), once where the event is decided, no `after` while play continues:
   - `music.jingle('victory')`: a whole fight or encounter ends, or the boss falls. Never per enemy killed: a normal kill only makes `combat` false once the fight is over.
   - `music.jingle('item')`: rare finds (chest, key item, level-up). Coins and small pickups get none (a sound effect if the game has one).
   - The final win or game over: `after: 'stop'`, then `active: false`; if the boss fight ends the game, its fall is that final win.
   The module also drops jingles that come too often (`state().jingleLimit`).

## Keep every caller working

Input, autoplay (`?auto=1`), fast-forward (`?t=` / freeze), restarts and scene changes must behave exactly as before. Music never uses game randomness, writes game state or consumes input.

## Self-check without a browser

- `adaptive` is created once, after `music`; `adaptive.update` follows `music.update` in every scene with the game's own step.
- During gameplay nothing calls `music.play`; outside it `active` is false.
- `combat`, `boss`, `hp` read existing state; list those lines.
- List every `jingle` call and its event: none per kill or per coin; in a normal run the loop is paused less than 15 % of play.
- No line of mine removed or moved into a new branch; both module files byte-identical.

## Acceptance checks (run them)

1. Before any click: no console errors; `?auto=1` ends exactly as before.
2. Click once and explore: bass and melody. Meet foes: within about a bar after 0.5 s the drums come in with a short stinger. Brushing past a foe for a moment changes nothing.
3. Drop below 30 % health: the danger line fades in on a bar line; heal above 40 %: it fades out.
4. A boss fight switches to the boss track on a bar line; its victory jingle plays, then exploring music returns.
5. `adaptive.stats().conflicts` is 0.

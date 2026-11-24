# Add Side-view clash cut-in to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `clash-cutin.js` (one global, `GameDNA_ClashCutin`), API reference `clash-cutin.README.md`

README example names are placeholders.

## Shared premises

1. **Include each module file verbatim; never edit it.** Load it with its own `<script src>` before the game's script, or paste it unchanged into its own `<script>` tag. If a module seems to need a change, adapt my game around it and tell me.
2. **Resolution:** keep my game's native resolution and integer scaling as they are. Call module draw functions on my 2D context inside the same transform as my sprites (one module pixel = one game pixel), and keep my game's own image-smoothing setting (off for pixel art, on for smooth or HD games; never switch it).
3. **Time:** drive every module from one fixed 60 Hz step (1000 / 60 ms). If my loop uses variable delta time, accumulate it and run whole steps (at most 250 ms per frame). Turn/phase logic stays mine; modules still update every step to animate.
4. **Coordinates:** native screen pixels (world minus camera) unless a section says tiles.
5. **Art and names:** anything new you draw or name is original (no real game, character, place or brand names); English UI text; do not restyle my game.
6. **Hook, don't replace:** add calls or change bodies; never delete or rename a function.
7. **Keep every other caller working.** Find every caller and reader of what you change (turn order, input, moves, menus, HUD): autopilot/AI, test hooks, URL parameters such as `?auto=1`, `?t=` and `?freeze=1`, keyboard shortcuts, end-turn buttons. Update each one. My game's own autoplay must still finish a whole game. Keep existing HUD info (HP bars, max HP) and existing commands.

## Order of work

1. **Read the game first.** Write down (file, function) where these live: loop/update step; draw pass and its order (background, actors, effects, HUD); input; where damage/HP changes are applied; where turns, actions or selections are chosen and played; HUD windows and their rects; camera; battle/scene start and end; and every caller from premise 7.
2. **Check the prerequisites** below against those notes. If one is missing, add the smallest working version and tell me.
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Side-view clash cut-in [systems].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Side-view clash cut-in:** the moment the game has confirmed an attack and resolved it with its own rules: attacker and defender, each strike in order (who strikes, hit / miss / crit, damage) and both HP values before and after; each unit's sprite (image or canvas plus the side its art looks at; a painted variant for the other side when the art must not be mirrored) or a draw callback, name, team, max HP, and optionally its map x, weapon name and forecast numbers; a fixed update step (ms), the screen rect to cover (native px), and a place to pause the game's own world, autoplay and input while busy() is true.

## Element 1: Side-view clash cut-in (`clash-cutin.js`, `GameDNA_ClashCutin`)

When an attack is confirmed, the game cuts to a staged side-view scene: a band opens over the map onto a code-drawn backdrop for the defender's terrain (plains, forest, marsh, desert, ruins), both units stand on a ground strip facing each other, the attacker leaps in and swings (or shoots an arrow, or casts an orb), hits freeze with sparks, a shake, a damage number and a draining HP bar, misses are dodged, criticals gleam and flash, the counter and follow-ups play, a fallen unit fades, then the band closes. Z skips, X toggles x2. The game passes the outcome; the module only stages it, so the scene always equals the game's numbers.

**Parameters chosen:** `speed` = 1, `sides` = map, `intro` = band, `introMs` = 300, `drain` = 450, `stop` = 4, `shake` = 2, `hold` = 450, `backdrop` = auto, `keys` = on.

**Where it goes** (by role; find these places in my game):

1. *Once, at boot (before any fast-forward for screenshots):* `clash = GameDNA_ClashCutin.create({view: {x: 0, y: 0, w: <native width>, h: <native height>}, params: {speed: 1, sides: 'map', intro: 'band', introMs: 300, drain: 450, stop: 4, shake: 2, hold: 450, backdrop: 'auto', keys: 'on'}})`.
2. *Where a single-target attack is confirmed (the code that resolves it and starts its animation):* Resolve the exchange with the game's own code, unchanged in order and random calls, recording each strike `{by: 'att' | 'def', result: 'hit' | 'miss' | 'crit', dmg}` (let the damage function return its number). Put the HP back to the values before, then `clash.play({attacker, defender, strikes, after: {att, def}, terrain, onDone})` with each unit `{id, name, team: 'a' | 'b', hp (before), max, x (map column), art (its sprite), facing (the side the ART looks at), kind: 'melee' | 'ranged' | 'magic', weapon?}`; art with gear on one side and no mirror: `art: {left, right}`. In `onDone`, apply `after` and run what used to run when the attack animation ended.
3. *Your fixed step, first thing (also in the ?t= replay):* `if (clash.busy()) { keys -> clash.key(k), taps -> clash.tap(x, y) (native px); clash.update(stepMs); return; }`. Nothing else runs while busy. Also `clash.update(stepMs)` in normal steps.
4. *Your render, last:* `clash.draw(ctx)` after the HUD, outside any camera or shake transform.
5. *Where a new game or battle starts:* `clash.clear()`.

**Common mistakes** (symptom -> fix):

- `?auto=1` ends differently -> the exchange was resolved with extra or reordered random calls; resolve it exactly as the old code did.
- The enemy phase or autoplay keeps acting under the scene -> the step does not return early while `busy()`.
- The bars drain twice or the map shows the new HP while the band opens -> restore HP before `play`, apply `after` in `onDone`.
- Fighters look away from each other -> `facing` must be the side the sprite ART looks at, not where the unit looks on the map.
- Sword and shield swap hands -> pass painted `art: {left, right}` and `mirror: 'never'` instead of letting it mirror.
- A different number on screen than the game applied -> `dmg` taken after clamping or from a second roll; pass the number the damage code returned.
- Area spells, heals and items open a one-target scene -> stage single-target attacks only.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Side-view clash cut-in] Confirming an attack opens the scene: both units face each other, the strike plays, the number and the HP the bars drain to equal what the map shows after it closes.
- [Side-view clash cut-in] Misses dodge, criticals flash, a unit at 0 fades; Z skips to the end, X lights the x2 badge.
- [Side-view clash cut-in] `?auto=1` ends exactly as before; `?t=&freeze=1` stills inside an exchange show the scene mid-strike.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `clash-cutin.js` sha256 `a8c0fc6d075bd5f8...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Side-view clash cut-in] For one exchange: HP before minus the strikes' dmg per target (clamped at 0) equals `after`, which equals what `onDone` applies.
- [Side-view clash cut-in] `update` runs in the replayed step; `draw` runs after the HUD; while `busy()` the step returns early.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

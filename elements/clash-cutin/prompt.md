# Add a side-view clash cut-in to my game

Defaults: speed {{speed}} (1 or 2), sides {{sides}}, intro {{intro}} ({{introMs}} ms), HP drain {{drain}} ms, hit-stop {{stop}} frames, shake {{shake}} px, hold {{hold}} ms, backdrop {{backdrop}}, skip/x2 keys {{keys}}.

Include `clash-cutin.js` (global `GameDNA_ClashCutin`) **verbatim**, before the game script; its README documents the API.

## What it does

When my game confirms an attack, the screen cuts to a staged side-view scene: the attacker leaps in and strikes, hits show a number and a draining HP bar, misses are dodged, the counter follows, a fallen unit fades. Z skips, X toggles x2. **The module never computes or rolls anything: my game decides the whole exchange and the module only stages it.**

## Integration points

1. **Create once** at load: `const clash = GameDNA_ClashCutin.create({ view: {x: 0, y: 0, w: <canvas native width>, h: <native height>}, params: {speed: {{speed}}, sides: '{{sides}}', intro: '{{intro}}', introMs: {{introMs}}, drain: {{drain}}, stop: {{stop}}, shake: {{shake}}, hold: {{hold}}, backdrop: '{{backdrop}}', keys: '{{keys}}'} })`.
2. **Where an attack is confirmed** (a single attacker against a single target), find the code that resolves it and the animation that follows. Keep the resolution exactly as it is (same random calls and order) but record each strike as `{by: 'att' | 'def', result: 'hit' | 'miss' | 'crit', dmg}` (make the damage function return its number if needed). Then call `clash.play({attacker, defender, strikes, after, terrain, onDone})`: each unit as `{id, name, team: 'a' (player) | 'b', hp: <HP before>, max, x: <map column or screen x>, art: <its sprite image or canvas>, facing: <side the ART looks at>, kind: 'melee' | 'ranged' | 'magic', weapon?}`; `after = {att, def}` = HP after the exchange. Show the old HP on the map until the scene ends (restore it after resolving and re-apply it in `onDone`). If a unit must not be mirrored (asymmetric gear), pass `art: {left, right}` painted for each side.
3. **`onDone`** runs where the old attack animation ended: apply `after`, then continue exactly what came next (end of the unit's action, next turn, victory check).
4. **Your fixed step:** first line `if (clash.busy()) { send this step's keys to clash.key(k) and taps to clash.tap(x, y) in native pixels; clash.update(stepMs); return; }`. Nothing else runs while busy: no world update, AI, autoplay or input. Also call `clash.update(stepMs)` in normal steps.
5. **Render:** `clash.draw(ctx)` last, after the HUD, outside any camera or shake transform.
6. **New game / restart:** `clash.clear()`.

Area attacks, heals and items keep their old animation. `terrain`: plains, forest, marsh, desert or ruins (or grass, wood, water, sand, stone) for the defender's tile.

## Keep everything else working

Autoplay, `?t=&freeze=1` style replays, keyboard and touch input, title, restart and end screens must work as before. Never delete or rename a host function. Same seed must end the game exactly as before.

## Self-check without a browser

1. The module is included byte-identical and loaded before the game script uses it.
2. For one exchange, add the strikes' `dmg` per target: HP before minus that (clamped at 0) equals `after`, which equals what `onDone` applies.
3. Every identifier inside the unit descriptions exists; `facing` is what the art looks at (if your game mirrors enemies, their art probably looks right).
4. `update` runs in the replayed step; `draw` runs after the HUD; while `busy()` the step returns early.

## Acceptance

Confirm an attack: the fighters face each other, numbers equal my game's, the bars drain to what the map shows afterwards, Z skips, X shows x2, `?auto=1` ends as before.

# sword-combat.js (A-05 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_SwordCombat`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it.

**It owns real-time melee on a top-down map:** the swing (anticipation, active and recovery frames; 4- or 8-way), the sweeping arc hitbox, a 2-3 hit combo with a buffered press, knockback with friction, invulnerability frames after a hit (shown as a translucent flicker, never invisible), the enemies (spawn, behaviour state machines, knockback, death puff), contact and projectile damage, hearts, drops and pickups, sparks, telegraph lanes and an optional hitbox overlay. **Your game keeps** its map, its walls, its hero object and walking, its scenes, quests, dialogue and HUD. The module moves your hero only for knockback.

Look: with `skin-api.js` and a skin loaded first it takes colours from `GameDNA_Skin.resolve(options.skin)`; without them it uses a built-in pixel16 palette. Enemy sprites are built in (five looks) unless you pass `art`.

## API

`GameDNA_SwordCombat.create(options)` returns an instance. Make one per game (or per scene); call `clear()` when a room or level changes.

| option | meaning |
|---|---|
| `player` | Your hero object `{x, y, w, h, face?}` (or a function returning it): the **feet box** in world px, top-left corner. The module reads it every step and writes `x`/`y` only for knockback. `face` may be `'up' \| 'down' \| 'left' \| 'right'` or an angle. |
| `solid(x, y, w, h, who)` | Your wall test in the same world px: `true` when the box overlaps a wall, water, an NPC, a chest… Used for knockback, enemy movement, projectiles and the autopilot's look-ahead. Default: nothing is solid. |
| `bounds` | World rect `{x, y, w, h}` (or function) that enemies and projectiles never leave (the player may: room exits). |
| `seed` | Integer; all enemy decisions, drops and sparks are seeded. Same seed + same inputs = same fight. |
| `params` | `dirs` 4 \| 8, `antic` 4, `active` 4, `recover` 10, `combo` 3 (1-3), `buffer` 12 (frames before a swing ends in which a press is kept for the next combo hit), `link` 3 (recovery frames left when the next hit is buffered), `grace` 12 (frames after a swing in which a press still continues the combo), `reach` 22, `arc` 150 (degrees), `damage` 1 (the finisher deals double, +4 reach, +60° arc), `knockback` 3 (px/frame), `friction` 0.8, `iframes` 60, `enemyIframes` 6, `hitstop` 4 (frames; kills and finishers double), `hearts` 3, `heartHp` 2 (HP per heart), `telegraph` 24, `enemySpeed` 1, `overlay` 'off' \| 'on', `sparks` 'on' \| 'off', `drops` 'on' \| 'off', `flash` 'on' \| 'off' (the white flash on struck enemies; turn it off when another effect flashes sprites). |
| `playerId` | Id used for the player in events and `anchor()` (default `'player'`). |
| `playerSprite` | `{w, h}` of your hero sprite (for `anchor`); default feet box + 4 × 10. |
| `hp` | Optional `{get(), set(v), max()}` to keep HP in your own variables (e.g. 30 HP). Without it the module keeps `hearts × heartHp` HP itself. |
| `beforeHit(ev)`, `onHit(ev)` | **The hit site.** Every HP change: sword hits, contact, charges, projectiles, `damage()`. `ev = {kind: 'melee' \| 'contact' \| 'charge' \| 'projectile' \| 'host', source, target (ids), amount, at {x, y} (contact point, world px), dir {x, y} (unit, the blow's direction), combo (1-3), finisher, strength ('light' \| 'heavy' \| 'finisher'), frame}`. `beforeHit` may change `amount` or set `cancel`; `onHit` adds `hpBefore, hpAfter, killed, max, anchor`. |
| `onDefeat(enemy, ev)`, `onPlayerDown()`, `onPickup(drop)` | An enemy's killing blow (its puff plays 22 frames); the player's HP reached 0; a drop touched (`return false` to leave it). Hearts heal `heartHp`, gems count in `stats().gems`. |
| `onHitStop(ms, ev)` | If given, the module asks YOUR gate to freeze (one freeze counter for the whole game) and never freezes itself. Without it, `update()` returns `false` for the frozen steps: skip your world step too. |
| `onEvent(ev)` | `{type: 'swing' \| 'spot' \| 'telegraph' \| 'charge' \| 'wall' \| 'aim' \| 'shoot' \| 'parry' \| 'drop' \| 'pickup' \| 'defeat' \| 'down', id, frame, …}`. |
| `art(ctx, enemy, sx, sy, info)` | Optional: draw an enemy with your own sprite (`info = {frame, flip, alpha, white, state}`); return `false` to fall back to the built-in look. |
| `brains` | Optional `{name: {init(e, B), step(e, B)}}`: your own behaviours (see below). |
| `skin` | Skin id or object (needs `GameDNA_Skin`). |

| method | |
|---|---|
| `spawn(def)` | `def = {id, look: 'slime' \| 'hound' \| 'boar' \| 'archer' \| 'warden', brain: 'wander' \| 'chase' \| 'charge' \| 'shooter' \| 'warden' \| your name or object, x, y (feet box top-left), hp, touch (contact damage), speed, sight, drops: [{kind, chance}] \| null, home: {x, y, r} (leash), boss}`. Missing fields come from the look (`GameDNA_SwordCombat.looks`). Returns the enemy (read-only for you). |
| `update(input)` | **Once per fixed 60 Hz step**, in every loop that steps the game (fast-forward too). `input = {x, y (-1..1, held), attack (pressed THIS step: edge-latched), aim? {x, y}, face?}`. Returns `false` on a built-in hit-stop step. |
| `canMove()` | `false` while swinging, hurt or knocked back: skip your hero's walking then. |
| `pose()`, `swing()`, `facing()` | `{state: 'free' \| 'antic' \| 'active' \| 'recover' \| 'hurt' \| 'down', face, angle, alpha}`; the current swing `{step, f, phase, total, buffered, finisher, frames}`; the facing as a word. |
| `playerAlpha()` | 1, or 0.4 on alternate 4-frame blocks during i-frames. Multiply your hero sprite's alpha by it. Never 0. |
| `draw(ctx, ox, oy, {layer})` | World layer at screen offset `(ox, oy)` (= `-cameraX`, `hudHeight - cameraY`). No `layer`: lanes, drops, enemies (y-sorted), projectiles, sword, sparks, overlay. `layer: 'below'` = lanes and drops (before your sprites); `'above'` = projectiles, sword, sparks, overlay (after them). |
| `sprites(ox, oy)` / `drawEnemy(ctx, e, ox, oy)` | For y-sorted games: `[{id, y, draw(ctx)}]`, one per enemy; push them into your sort with your hero. |
| `drawHearts(ctx, x, y, {per, cols})` | Hearts HUD (8×7 each, half hearts). Returns its rect (also in `uiRects()`). |
| `autopilot({next, speed, engage, horizon, target})` | Suggested input for this step `{x, y, attack, aim, target, danger}`. It scores 9 moves by the danger met **along the path** over `horizon` (18) frames (projectiles' predicted positions, telegraphed and running charge lanes, aim lines, enemy bodies) plus the distance to the fight spot (the target's axis at ~55 % reach) or to your waypoint `next` (world px). It strikes when the target is in reach and standing still is safe, and buffers combo hits. Feed the result straight into `update()` and your walking. |
| `anchor(id, ox, oy)` | `{id, x (centre), top, left, w, h, cy, footY, dead}` of the player's or an enemy's sprite box, plus the offset. Works while an enemy's death puff plays. |
| `uiRects()` | The hearts rect of the last `drawHearts`. |
| `damage(id, amount, opts)`, `heal(n)`, `knock(id, dx, dy)` | Host damage (traps, poison) through the same hit site; heal the player; push a body. |
| `enemies()`, `enemy(id)`, `count()`, `drops()`, `shots()`, `hp()`, `maxHp()`, `down()`, `invulnerable()` | Read state. The enemy objects are the module's own: never write to them (use `damage`, `knock`, `remove`, and `setParams({flash: 'off'})` to suppress the hit flash). |
| `clear()`, `reset()`, `revive(hp)` | Remove enemies, shots, drops, effects (room change); also refill HP; stand the player up. |
| `freeze(frames)`, `frozen()`, `setParams(p)`, `params()`, `frameData()`, `stats()`, `state()` | Built-in freeze; live params; per-combo-hit frame data; counters (`swings, combos, hits, playerHits, kills, parries, iframeBlocks, iframeViolations, unstuck, inWall, …`); a JSON snapshot. |

**Behaviours** are small state machines `{init(e, B), step(e, B)}` that use only the brain API `B`: `player()`, `to(e)` → `{dx, dy, d}`, `move(e, dx, dy)` → `{moved, bx, by}` (walls handled), `clear(e)` (line of sight), `set(e, state, frames)`, `shoot(e, angle, speed, {dmg, r})`, `laneLength(e, dx, dy, max)`, `rng()`, `int(a, b)`, `wanderStep(e, speed)`, `event(type, e)`, `params()`. Built in: `wander` (idle/walk, turns at walls, optional leash), `chase` (sight 72 px → homes in, detours, backs off after a bite), `charge` (lined up on an axis → telegraph `telegraph` frames with a lane on the floor → charge 2.6 px/frame → stunned 54 frames on a wall), `shooter` (keeps 44-84 px, strafes, aims 18 frames with a dotted line ending in a reticle on the hero, fires), `warden` (boss, 38 HP: walks in, alternates a telegraphed charge at any angle with an aimed 3-shot volley fired only from 48 px or more; a wall stun of 45 frames, then it backs off toward the centre of `bounds`; a hero closer than 24 px is shoved and it backs off; below half HP it rages: red pulse, faster, 36-frame stuns, 5-shot volleys, a second charge right after the first; all shots vanish when it falls). A watchdog sends any enemy that asks to move but stays put for 45 steps off in a free direction.

## Integration (15 lines)

```js
// <script src="sword-combat.js"></script> before your game script
const sc = GameDNA_SwordCombat.create({ player: hero, playerId: 'hero', solid: (x, y, w, h) => isWall(x, y, w, h), seed: 1,
  bounds: { x: 0, y: 0, w: MAP_W * TILE, h: MAP_H * TILE }, hp: { get: () => hero.hp, set: v => { hero.hp = v; }, max: () => hero.maxHp },
  onHit: ev => { /* sounds, numbers, quest counters */ }, onPlayerDown: () => gameOver() });
for (const s of mapSpawns) sc.spawn({ id: s.id, brain: 'chase', look: 'slime', x: s.x, y: s.y });   // where enemies used to be created
function step() {                                       // your fixed 60 Hz step (also run by ?t= fast-forward)
  const inp = autoplay ? sc.autopilot({ next: nextWaypoint() }) : { x: dx, y: dy, attack: attackPressed };   // attackPressed: latched on keydown
  if (sc.update(inp) === false) return;                  // built-in hit-stop (or pass onHitStop to your own gate)
  if (sc.canMove()) walkHero(inp.x, inp.y);              // your walking, unchanged
}
function render() { drawMap(); sc.draw(ctx, -cam.x, HUD_H - cam.y, { layer: 'below' });
  /* y-sort sc.sprites(-cam.x, HUD_H - cam.y) with your hero (alpha *= sc.playerAlpha()) */
  sc.draw(ctx, -cam.x, HUD_H - cam.y, { layer: 'above' }); drawHud(); sc.drawHearts(ctx, 4, 4); }
// room / level change: sc.clear() then spawn that room's enemies
```

## Keep your game working

- **Hook, don't replace.** Keep every function, scene, quest flag, dialogue, NPC and chest; keep title, game-over and restart paths. Replace only the old combat: a separate battle screen, touch-to-fight triggers, old enemy AI. Their counters (enemies defeated, quest steps) move into `onDefeat` / `onHit`.
- **Keep every caller.** `?auto=1`-style autoplay must call `autopilot()` (its old path-following becomes the `next` waypoint) and still walk to NPCs, chests and exits; `?t=&freeze=1` fast-forward must run the same step (so `update()` runs there too); dialogue and menus keep their keys (do not swing while a dialogue box is open: pass `attack: false` and skip `update()` while paused).
- **Attack key:** the key that confirmed or talked may also swing. Talk/open first when an NPC or chest is in front, swing otherwise.
- **Edge-latch the attack:** set a flag on keydown and clear it in the step that reads it, so a 0 ms tap always swings.
- **Draw order:** `layer: 'below'`, then your y-sorted sprites (hero + `sprites()`), then `layer: 'above'`, then the HUD.

## Self-check without a browser

1. The module is byte-identical and loads before `create`; `node --check` your script.
2. `update()` runs once per step in the play scene, in the real loop and the fast-forward loop; never inside a dialogue or title branch.
3. Trace one swing: keydown → latch → `update({attack: true})` → 4 antic → 4 active frames (hit on the first frame the arc touches a hurtbox) → `onHit` → knockback 3 px/frame × 0.8 per frame (≈ 15 px in total) → 10 recovery frames.
4. Trace a contact: an enemy overlaps the hero → `onHit` (kind contact, target = playerId) → 60 i-frames; another body during them deals nothing.
5. Trace autoplay from the title to the end: it still reaches every quest step.

## Changes

- v1.0.1 (2026-11-17): the `shooter` and `warden` brains turn to the player when they aim (`e.face`); before, an archer kept the side of its last strafe step and could aim over its shoulder. `e.face` only feeds the sprite flip: the starter autoplay ends the same (judge: same end, 68900 ms before and after).

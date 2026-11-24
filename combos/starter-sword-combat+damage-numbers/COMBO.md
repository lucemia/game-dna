# Add bouncing damage numbers to the Thornvale starter

`index.html` is a complete game built on the real-time sword combat element; build on it. `index.README.md` documents its extension points. Add:

- `damage-numbers.js` (one global, `GameDNA_DamageNumbers`), API in `damage-numbers.README.md`

## Rules

1. **Modules verbatim:** load each addon module in the ADDONS SLOT `<script>` (pasted unchanged) or as `<script src>` tags right above it. Never edit a module or the starter's own systems; add code only through the extension points.
2. **Register each addon** as one object: push it onto `GAME.addons` in the ADDONS SLOT `<script>` of `index.html` (it runs before the game boots, so addons see the first room and every `?t=` frame) (hooks: `gate(game)`, `beforeHit(ev, game)`, `onHit(ev, game)`, `onDefeat(enemy, ev, game)`, `onKey(key, game)`, `update(game, info)`, `draw(g, layer, game)` with layers `begin | ground | fx | end | overlay`, `wrapSprite(g, id, rect, drawFn, game)`, `onRoomStart(roomId, game)`, `onPhase`, `onEvent`, `onEnd`).
3. **Turn off the starter's built-in equivalent** of each addon: nothing to turn off: the starter draws no damage numbers (keep `GAME.flags.builtinShake`: it is hit feedback, not numbers); otherwise both draw.
4. **Keep everything working:** `?auto=1`, `?t=<ms>&freeze=1`, `?seed=`, `?dirs=`, `?hearts=`, `?overlay=`, keys P (autoplay), H (hitboxes), Esc (pause). Addons advance only in the `update` hook (never on real time), so `?t=` fast-forward shows them; consume no game key.
5. Keep the native resolution and integer scaling; anything new you draw or name is original (no real game, character, place or brand names).

## Bouncing damage numbers

On the frame a hit lands, the amount pops above the target, each digit bouncing in turn with a small overshoot, holds, then fades; heals, criticals, misses, MP and status words each get their own look, and simultaneous pops never overlap.

**Parameters:** `bounce` = 10, `duration` = 1000, `stagger` = 40, `hitstop` = 60, `scale` = 1, `scheme` = classic, `crit` = burst, `stack` = on, `outline` = 1, `dense` = auto.

**Wiring** (one addon object):

1. *Create:* In the addon object, create `dn` once: `GameDNA_DamageNumbers.create({bounds, params: {bounce: 10, duration: 1000, stagger: 40, hitstop: 60, scale: 1, scheme: 'classic', crit: 'burst', stack: 'on', outline: 1}, getAnchor, getObstacles, onHitStop, onShake, onFlash})`. `onHitStop: ms => GAME.hitStopMs(ms)`, `onShake: (px, ms) => GAME.shake(px, Math.ceil(ms * 60 / 1000))`, `onFlash: (a, ms) => GAME.flash('#ffffff', Math.ceil(ms * 60 / 1000), a)`.
2. *Anchors and obstacles:* `GAME.anchor(id)` -> `{x, top, w, h, left, cy, footY, dead}` (sprite box, native screen px); `GAME.units()` lists the hero and the living enemies. `getAnchor(id)` returns that home anchor `{x, top, w, h}`, so a lunging attacker's numbers stay put; `getObstacles()` returns each living actor's box `{x: x - w / 2, y: top, w, h, id}` plus every UI rect (without `id`) from `GAME.uiRects()` (HUD bar, intro box, room banner and result window while shown; native px); `bounds` is the play field `GAME.field` (`{x: 0, y: 16, w: 256, h: 208}`)
3. *Hit:* `onHit(ev, game)` runs on the hit frame, after the module applied HP, knockback and i-frames. `ev.kind` is `melee | contact | charge | projectile | host`; `ev.target` is `'hero'` or an enemy id; `amount` is the HP removed; `ev.strength` is `light | heavy | finisher` (finisher = the combo's third hit or a killing blow); `ev.killed`; `ev.screen` is the contact point in native screen px; `ev.dir` the blow's unit direction. Feedback helpers: `GAME.shake(px, frames)`, `GAME.flash(color, frames, alpha)`. Call `dn.spawn(ev.target, amount, kind)` once per event: every event with `ev.amount > 0`: `'crit'` if `ev.strength === 'finisher'`, else `'damage'` (the hero's id is `'hero'`). Pass `{anchor: ev.anchor}` as the 4th argument when the target just died.
4. *Clock:* `update(game, info)` runs every frame; `info.dt` is the world time advanced this frame in ms (16.67, or 0 while held). An addon's `gate(game)` runs first in every play step: return false to hold the whole world for that step (presses stay latched). `GAME.hitStopMs(ms)` holds it too; set `GAME.flags.builtinHitStop = false` when your addon owns the hit-stop. In `update(game, info)`: `dn.update(info.dt)`.
5. *Draw:* `draw(g, layer, game)` with `layer === 'fx'`: the native 256x224 context, after the sprites, sword, projectiles and sparks, inside the field clip and shake, before the HUD: `dn.draw(<that context>)`
6. *Reset:* `onRoomStart(roomId, game)`: `dn.clear()` first, before anything spawns there

**Common mistakes:**

- Two numbers per hit -> the built-in numbers are still on.
- Numbers missing in `?t=&freeze=1` shots -> they advanced on real time; advance only in `update`.
- Numbers drift during a freeze -> `dn.update(0)` while the world is frozen.

## Checks

- [Bouncing damage numbers] Every hit shows one bouncing number above its target on the hit frame (heals green `+n`, statuses as words, criticals gold with `CRITICAL`, where the game has them); numbers never touch each other, sprites or UI rects.
- `?auto=1` still clears all four rooms and reaches THE VALE IS SAFE, with the addons working on every relevant event; `?t=<ms>&freeze=1` shows them mid-game; no built-in duplicates; no console errors.

## Self-check without a browser

- Each module file is byte-identical to the one given: `damage-numbers.js` sha256 `1c7b689771a5877b...`.
- `node --check` your addon script (copy an inline script to a temp .js). Outside the registration slot, the starter is unchanged (diff it).
- [Bouncing damage numbers] Trace one hit: hit site -> `onHit` -> `dn.spawn` -> `update` -> `draw`; the built-in numbers flag is off.
- Trace one autoplay event from the hit site (`onHit` of an autoplay sword hit and of a contact or projectile hit on the hero) through your addon hooks to the draw, and say which hooks you added.

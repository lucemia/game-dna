# Add bouncing damage numbers to the Highcliff Crossing starter

`index.html` is a complete game built on the isometric height & jump element; build on it. `index.README.md` documents its extension points. Add:

- `damage-numbers.js` (one global, `GameDNA_DamageNumbers`), API in `damage-numbers.README.md`

## Rules

1. **Modules verbatim:** load each addon module with its own `<script src>` (or pasted unchanged into its own `<script>`) before the game script, so it exists in the ADDONS slot. Never edit a module or the starter's own systems; add code only through the extension points.
2. **Register each addon** as one object: push it onto `game.addons` in the ADDONS slot of section 8 of `index.html`, before `newGame()` (hooks: `onHit(ev)`, `update(game, {dt, frozen})`, `drawTile(ctx, x, y, sx, sy, tile)` (on each tile top, painter's order), `draw(ctx, cam, game)`, `drawUI(ctx, game)` (top UI layer), `onKey(e, down)`, `onTurnStart(turn, side, unitId)`, `onPhase(phase)`).
3. **Turn off the starter's built-in equivalent** of each addon: `game.builtinNumbers = false` (in the same ADDONS slot); otherwise both draw.
4. **Keep everything working:** `?auto=1`, `?t=<ms>&freeze=1` (also with `&script=`), keys Q/E (rotate) and R (restart), the facing picker, mouse and touch. Addons advance only in the `update` hook (never on real time), so `?t=` fast-forward shows them; consume no game key.
5. Keep the native resolution and integer scaling; anything new you draw or name is original (no real game, character, place or brand names).

## Bouncing damage numbers

On the frame a hit lands, the amount pops above the target, each digit bouncing in turn with a small overshoot, holds, then fades; heals, criticals, misses, MP and status words each get their own look, and simultaneous pops never overlap.

**Parameters:** `bounce` = 10, `duration` = 1000, `stagger` = 40, `hitstop` = 60, `scale` = 1, `scheme` = classic, `crit` = burst, `stack` = on, `outline` = 1, `dense` = auto.

**Wiring** (one addon object):

1. *Create:* In the addon object, create `dn` once: `GameDNA_DamageNumbers.create({bounds, params: {bounce: 10, duration: 1000, stagger: 40, hitstop: 60, scale: 1, scheme: 'classic', crit: 'burst', stack: 'on', outline: 1}, getAnchor, getObstacles, onHitStop, onShake, onFlash})`. 
2. *Anchors and obstacles:* `game.anchorOf(id, {home: true})` -> `{x, top, w, h, footY}`: the 16x24 sprite box standing on its tile on the iso map, screen px (without `home` it follows walks, hops and lunges); units are `game.units`, alive while `hp > 0`. Never compute positions from tile x 16. `getAnchor(id)` returns that home anchor `{x, top, w, h}`, so a lunging attacker's numbers stay put; `getObstacles()` returns each living actor's box `{x: x - w / 2, y: top, w, h, id}` plus every UI rect (without `id`) from `game.uiRects()` (WT bar, active unit window, turn plate, stage hint, forecast window, the module's info plate and cursor, plus addon rects from `game.setUIRect(name, rect)`; native px); `bounds` is the whole screen `{x: 0, y: 0, w: 256, h: 224}`
3. *Hit:* `onHit(ev)` runs on the blow frame, right after the hit site `applyHit` (also `game.hit(attackerId, targetId, amount, kind)`) changed HP. `ev.kind` is `attack | counter | heal` (map `attack` and `counter` to damage, `heal` to heal), `ev.amount` is always >= 0, `ev.side` is `front | side | back`, `ev.dh` the height difference, `ev.anchor` the target's home anchor. Feedback helpers: `game.hitStop(ms)`, `game.shake(px, ms)`, `game.flash(color, ms)` (an addon's `onHitStop` / `onShake` / `onFlash` callbacks call these with ms). Call `dn.spawn(ev.target, amount, kind)` once per event: 
4. *Clock:* `update(game, {dt, frozen})` runs every 60 Hz step, also during hit-stop; `dt` is in seconds (1/60) and `frozen` is true while the world is stopped. `game.hitStop(ms)` freezes the world. An addon that ages in ms calls its update with `frozen ? 0 : dt * 1000`. 
5. *Draw:* `draw(ctx, cam, game)`: native 256x224 context already translated by any shake, after the iso map, units, outlines and cursor, before the HUD: `dn.draw(<that context>)`
6. *Reset:* `onTurnStart(turn, side, unitId)` with `turn === 0` (new game and restart): `dn.clear()` first, before anything spawns there

**Common mistakes:**

- Two numbers per hit -> the built-in numbers are still on.
- Numbers missing in `?t=&freeze=1` shots -> they advanced on real time; advance only in `update`.
- Numbers drift during a freeze -> `dn.update(0)` while the world is frozen.

## Checks

- [Bouncing damage numbers] Every hit shows one bouncing number above its target on the hit frame (heals green `+n`, statuses as words, criticals gold with `CRITICAL`, where the game has them); numbers never touch each other, sprites or UI rects.
- `?auto=1` still reaches VICTORY, with the addons working on every relevant event; `?t=<ms>&freeze=1` shows them mid-game; no built-in duplicates; no console errors.

## Self-check without a browser

- Each module file is byte-identical to the one given: `damage-numbers.js` sha256 `1c7b689771a5877b...`.
- `node --check` your addon script (copy an inline script to a temp .js). Outside the registration slot, the starter is unchanged (diff it).
- [Bouncing damage numbers] Trace one hit: hit site -> `onHit` -> `dn.spawn` -> `update` -> `draw`; the built-in numbers flag is off.
- Trace one autoplay event from `applyHit` (an autoplay attack and its counter) through your addon hooks to the draw, and say which hooks you added.

# Add bouncing damage numbers to the Lantern Ascent starter

`index.html` is a complete game built on the platformer movement feel element; build on it. `index.README.md` documents its extension points. Add:

- `damage-numbers.js` (one global, `GameDNA_DamageNumbers`), API in `damage-numbers.README.md`

## Rules

1. **Modules verbatim:** load each addon module with its own `<script src>` (or pasted unchanged into its own `<script>`) in the ADDONS slot (the empty `<script>` block marked ADDONS SLOT, before the boot script). Never edit a module or the starter's own systems; add code only through the extension points.
2. **Register each addon** as one object: push it onto `GAME.addons` in the ADDONS slot, before boot. Hooks: `gate(game)` (called FIRST in every 60 Hz step, before input, autoplay and the world; return `false` to hold the whole world for this step: a hit-stop; latched input waits), `update(game, {dt, frozen})`, `onHit(ev, game)`, `onMove(name, info, game)` (the module's movement events), `drawBegin(ctx, game)` / `drawEnd(ctx, game)` (wrap the play field: backdrop, tiles, sprites, effects; the HUD comes after), `draw(ctx, layer, game)` with layer `'world'` (inside the field, after sprites and dust), `'post'` (after `drawEnd`, before the HUD) or `'ui'` (last), `sprite(ctx, id, rect, next, game)` (wraps each sprite draw: call `next()` to draw it), `onKey(e, down, game)`, `onPhase(phase, game)`, `onStart(game)`, `onRoom(index, game)`, `onPickup(kind, game)`.
3. **Turn off the starter's built-in equivalent** of each addon: `GAME.builtinNumbers = false` (in the same ADDONS slot); otherwise both draw.
4. **Keep everything working:** `?auto=1`, `?t=<ms>&freeze=1`, `?preset=`, `?overlay=1`, keys Z (jump), X (dash), V (feel overlay), P (autoplay), R (restart), the touch pad. Addons advance only in the `update` hook (never on real time), so `?t=` fast-forward shows them; consume no game key.
5. Keep the native resolution and integer scaling; anything new you draw or name is original (no real game, character, place or brand names).

## Bouncing damage numbers

On the frame a hit lands, the amount pops above the target, each digit bouncing in turn with a small overshoot, holds, then fades; heals, criticals, misses, MP and status words each get their own look, and simultaneous pops never overlap.

**Parameters:** `bounce` = 10, `duration` = 1000, `stagger` = 40, `hitstop` = 60, `scale` = 1, `scheme` = classic, `crit` = burst, `stack` = on, `outline` = 1, `dense` = auto.

**Wiring** (one addon object):

1. *Create:* In the addon object, create `dn` once: `GameDNA_DamageNumbers.create({bounds, params: {bounce: 10, duration: 1000, stagger: 40, hitstop: 60, scale: 1, scheme: 'classic', crit: 'burst', stack: 'on', outline: 1}, getAnchor, getObstacles, onHitStop, onShake, onFlash})`. `onHitStop: ms => GAME.hitStop(ms)`, `onShake: (px, ms) => GAME.shake(px, ms)`, `onFlash: (a, ms) => GAME.flash('#ffffff', ms)`.
2. *Anchors and obstacles:* `GAME.anchorOf(id)` -> `{x (centre), top, w, h, footY}` in screen px for `'hero'` (the drawn 16x22 sprite) and `'beetle-N'`; world -> screen = `(x - GAME.cam.x, y - GAME.cam.y)`. `getAnchor(id)` returns that home anchor `{x, top, w, h}`, so a lunging attacker's numbers stay put; `getObstacles()` returns each living actor's box `{x: x - w / 2, y: top, w, h, id}` plus every UI rect (without `id`) from `GAME.uiRects()` (the HUD band 0,0,256,16, the room banner, the end window, the feel overlay panels while shown, plus addon rects from `GAME.setUIRect(name, rect)`; native px); `bounds` is `GAME.field` = `{x: 0, y: 16, w: 256, h: 208}` (below the HUD band)
3. *Hit:* `onHit(ev, game)` runs right after the hit site `applyHit` (also `GAME.hit(target, amount, kind, source)`): a thorn, pit or beetle hurting the hero (`target: 'hero'`, `kind: 'damage'`), a stomp defeating a beetle (`target: 'beetle-N'`, `cause: 'stomp'`, `killed: true`) or a heart pickup (`kind: 'heal'`). `ev = {source, target, amount, kind, cause, dir, killed, hpBefore, hpAfter, max, anchor, frame}`. Feedback helpers: `GAME.hitStop(ms)`, `GAME.shake(px, ms)`, `GAME.flash(color, ms)`. Call `dn.spawn(ev.target, amount, kind)` once per event: `kind: 'damage'` -> `'damage'` (thorns, pits, beetles on the hero; a stomp on a beetle), `kind: 'heal'` -> `'heal'` (heart pickups); skip events with `amount === 0`. Pass `{anchor: ev.anchor}` as the 4th argument when `ev.killed` (the beetle is gone from the anchor list).
4. *Clock:* `update(game, {dt, frozen})` runs every 60 Hz step, also on held steps; `dt` is in **ms** (16.67, or 0 while frozen); `gate(game)` returning false holds the step (the hero, beetles, autoplay and timers all wait). `GAME.hitStop(ms)` is the built-in freeze. In `update(game, {dt, frozen})`: `dn.update(frozen ? 0 : dt)` (dt is in ms).
5. *Draw:* `draw(ctx, 'world', game)`: native 256x224 context inside the play field (after `drawBegin`, inside the built-in shake), after the sprites and the module's dust; `drawBegin` / `drawEnd` wrap the whole field; the HUD (top 16 px band) is drawn after `drawEnd`: `dn.draw(<that context>)`
6. *Reset:* `onStart(game)` (a new game or restart) and `onRoom(index, game)` (each room entry): `dn.clear()` first, before anything spawns there

**Common mistakes:**

- Two numbers per hit -> the built-in numbers are still on.
- Numbers missing in `?t=&freeze=1` shots -> they advanced on real time; advance only in `update`.
- Numbers drift during a freeze -> `dn.update(0)` while the world is frozen.

## Checks

- [Bouncing damage numbers] Every hit shows one bouncing number above its target on the hit frame (heals green `+n`, statuses as words, criticals gold with `CRITICAL`, where the game has them); numbers never touch each other, sprites or UI rects.
- `?auto=1` still lights the beacon (THE BEACON IS LIT) with every preset, with the addons working on every relevant event; `?t=<ms>&freeze=1` shows them mid-game; no built-in duplicates; no console errors.

## Self-check without a browser

- Each module file is byte-identical to the one given: `damage-numbers.js` sha256 `1c7b689771a5877b...`.
- `node --check` your addon script (copy an inline script to a temp .js). Outside the registration slot, the starter is unchanged (diff it).
- [Bouncing damage numbers] Trace one hit: hit site -> `onHit` -> `dn.spawn` -> `update` -> `draw`; the built-in numbers flag is off.
- Trace one autoplay event from `applyHit` (an autoplay stomp on the beetle in Mossy Gate) through your addon hooks to the draw, and say which hooks you added.

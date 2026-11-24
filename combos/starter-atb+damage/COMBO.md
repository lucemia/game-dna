# Add bouncing damage numbers to the Ruin Skirmish starter

`index.html` is a complete game built on the active-time gauge battle element; build on it. `index.README.md` documents its extension points. Add:

- `damage-numbers.js` (one global, `GameDNA_DamageNumbers`), API in `damage-numbers.README.md`

## Rules

1. **Modules verbatim:** load each addon module with a `<script src>` (or pasted unchanged) in the ADDONS SLOT, before the code that uses it. Never edit a module or the starter's own systems; add code only through the extension points.
2. **Register each addon** as one object: push it onto `GAME.addons` in the ADDONS SLOT `<script>` of `index.html` (it runs before the battle boots, so addons see the first battle and every `?t=` frame; module `<script src>` tags go there too) (hooks: `beforeHit`, `onHit(ev, game)`, `onKey(key, game)`, `update(game, info)`, `draw(g, layer, game)`, `onBattleStart(game)`, `onBattleEnd(result, game)`).
3. **Turn off the starter's built-in equivalent** of each addon: `GAME.flags.builtinPopups = false` (keep `builtinShake`: it is hit feedback, not numbers); otherwise both draw.
4. **Keep everything working:** `?auto=1`, `?t=<ms>&freeze=1`, `?mode=`, `?speed=`, `?status=`, `?seed=`, keys M (mode) and P (autoplay). Addons advance only in the `update` hook (never on real time), so `?t=` fast-forward shows them; consume no game key.
5. Keep the native resolution and integer scaling; anything new you draw or name is original (no real game, character, place or brand names).

## Bouncing damage numbers

On the frame a hit lands, the amount pops above the target, each digit bouncing in turn with a small overshoot, holds, then fades; heals, criticals, misses, MP and status words each get their own look, and simultaneous pops never overlap.

**Parameters:** `bounce` = 10, `duration` = 1000, `stagger` = 40, `hitstop` = 60, `scale` = 1, `scheme` = classic, `crit` = burst, `stack` = on, `outline` = 1, `dense` = auto.

**Wiring** (one addon object):

1. *Create:* In the addon object, create `dn` once: `GameDNA_DamageNumbers.create({bounds, params: {bounce: 10, duration: 1000, stagger: 40, hitstop: 60, scale: 1, scheme: 'classic', crit: 'burst', stack: 'on', outline: 1}, getAnchor, getObstacles, onHitStop, onShake, onFlash})`. `onHitStop: ms => GAME.hitStopMs(ms)`, `onShake: (px, ms) => GAME.shake(px, Math.ceil(ms * 60 / 1000))`, `onFlash: (a, ms) => GAME.flash('#ffffff', Math.ceil(ms * 60 / 1000), a)`.
2. *Anchors and obstacles:* `GAME.anchor(id)` -> `{x, top, w, h, left, dead}` (home position, native px); living actors are `GAME.B.party` and `GAME.B.mons` (`dead` false). `getAnchor(id)` returns that home anchor `{x, top, w, h}`, so a lunging attacker's numbers stay put; `getObstacles()` returns each living actor's box `{x: x - w / 2, y: top, w, h, id}` plus every UI rect (without `id`) from `GAME.uiRects()` (mode plate, HUD windows, banner and result window while shown; native px); `bounds` is the play field `{x: 0, y: 0, w: GAME.W, h: GAME.FH}`
3. *Hit:* `onHit(ev, game)` runs on the hit frame, right after the hit site `GAME.applyHit(ev)` changed HP, MP or status. `ev.kind` is `damage | heal | mp | status | guard`: `amount` is the applied amount (after Defend; heals clamped), `ev.crit` marks critical attacks, `status` events carry `ev.status`, `mp` events are spell costs with `ev.quiet: true`, `guard` is Defend. Feedback helpers: `GAME.shake(px, frames)`, `GAME.flash(color, frames, alpha)`. Call `dn.spawn(ev.target, amount, kind)` once per event: `damage` -> `'crit'` if `ev.crit`, else `'damage'`; `heal` -> `'heal'`; `status` -> `'status'` with the word `ev.status.toUpperCase()`; skip every `ev.quiet` event (spell costs) and `guard`.
4. *Clock:* `update(game, info)` runs every frame; `info.dt` is the world time advanced this frame in ms (16.67, or 0 while frozen). `GAME.hitStopMs(ms)` freezes the battle. In `update(game, info)`: `dn.update(info.dt)`.
5. *Draw:* `draw(g, layer, game)` with `layer === 'fx'`: the native 256x224 buffer, after actors, banner and mode plate, before the HUD; it shakes with the field: `dn.draw(<that context>)`
6. *Reset:* `onBattleStart(game)`: `dn.clear()` first, before anything spawns there

**Common mistakes:**

- Two numbers per hit -> the built-in numbers are still on.
- Numbers missing in `?t=&freeze=1` shots -> they advanced on real time; advance only in `update`.
- Numbers drift during a freeze -> `dn.update(0)` while the world is frozen.

## Checks

- [Bouncing damage numbers] Every hit shows one bouncing number above its target on the hit frame (heals green `+n`, statuses as words, criticals gold with `CRITICAL`, where the game has them); numbers never touch each other, sprites or UI rects.
- `?auto=1` still wins all waves, with the addons working on every relevant event; `?t=<ms>&freeze=1` shows them mid-game; no built-in duplicates; no console errors.

## Self-check without a browser

- Each module file is byte-identical to the one given: `damage-numbers.js` sha256 `1c7b689771a5877b...`.
- `node --check` your addon script (copy an inline script to a temp .js). Outside the registration slot, the starter is unchanged (diff it).
- [Bouncing damage numbers] Trace one hit: hit site -> `onHit` -> `dn.spawn` -> `update` -> `draw`; the built-in numbers flag is off.
- Trace one autoplay event from `GAME.applyHit` (an autoplay Attack and an enemy hit) through your addon hooks to the draw, and say which hooks you added.

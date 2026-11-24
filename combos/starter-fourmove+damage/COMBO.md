# Add bouncing damage numbers to the Crossroads Cup starter

`index.html` is a complete game built on the four-move menu battle with type matchups element; build on it. `index.README.md` documents its extension points. Add:

- `damage-numbers.js` (one global, `GameDNA_DamageNumbers`), API in `damage-numbers.README.md`

## Rules

1. **Modules verbatim:** load each addon module in the ADDONS SLOT `<script>` (pasted unchanged) or as `<script src>` tags right above it. Never edit a module or the starter's own systems; add code only through the extension points.
2. **Register each addon** as one object: push it onto `GAME.addons` in the ADDONS SLOT `<script>` of `index.html` (it runs before the cup boots, so addons see the first battle and every `?t=` frame) (hooks: `beforeHit(ev, game)`, `onHit(ev, game)`, `onKey(key, game)`, `update(game, info)`, `draw(g, layer, game)`, `drawUI(g, game)`, `onTurn`, `onPhase`, `onEvent`, `onBattleStart(game)`, `onBattleEnd(result, game)`).
3. **Turn off the starter's built-in equivalent** of each addon: nothing to turn off: the starter draws no damage numbers (HP bars drain instead); keep `GAME.flags.builtinShake` (it is hit feedback, not numbers); otherwise both draw.
4. **Keep everything working:** `?auto=1`, `?t=<ms>&freeze=1`, `?format=double`, `?seed=`, `?text=`, key P (autoplay), taps. Addons advance only in the `update` hook (never on real time), so `?t=` fast-forward shows them; consume no game key.
5. Keep the native resolution and integer scaling; anything new you draw or name is original (no real game, character, place or brand names).

## Bouncing damage numbers

On the frame a hit lands, the amount pops above the target, each digit bouncing in turn with a small overshoot, holds, then fades; heals, criticals, misses, MP and status words each get their own look, and simultaneous pops never overlap.

**Parameters:** `bounce` = 10, `duration` = 1000, `stagger` = 40, `hitstop` = 60, `scale` = 1, `scheme` = classic, `crit` = burst, `stack` = on, `outline` = 1, `dense` = auto.

**Wiring** (one addon object):

1. *Create:* In the addon object, create `dn` once: `GameDNA_DamageNumbers.create({bounds, params: {bounce: 10, duration: 1000, stagger: 40, hitstop: 60, scale: 1, scheme: 'classic', crit: 'burst', stack: 'on', outline: 1}, getAnchor, getObstacles, onHitStop, onShake, onFlash})`. `onHitStop: ms => GAME.hitStopMs(ms)`, `onShake: (px, ms) => GAME.shake(px, Math.ceil(ms * 60 / 1000))`, `onFlash: (a, ms) => GAME.flash('#ffffff', Math.ceil(ms * 60 / 1000), a)`.
2. *Anchors and obstacles:* `GAME.anchor(id)` -> `{x, top, w, h, left, cy, footY, dead}` (home position, not the attack lunge; native px); creatures on the field are `GAME.B.active('own')` and `GAME.B.active('foe')`. `getAnchor(id)` returns that home anchor `{x, top, w, h}`, so a lunging attacker's numbers stay put; `getObstacles()` returns each living actor's box `{x: x - w / 2, y: top, w, h, id}` plus every UI rect (without `id`) from `GAME.uiRects()` (info boxes, message box or menu, team / item list, between-round windows; native px); `bounds` is the field above the message box `GAME.B.fieldRect()` (`{x: 0, y: 0, w: 240, h: GAME.FH}`)
3. *Hit:* `onHit(ev, game)` runs on the hit frame, right after the module changed HP or status. `ev.kind` is `damage | heal | status | cure`; `amount` is the applied amount (heals clamped), `ev.crit` marks critical hits, `ev.eff` the type multiplier (2, 1, 0.5), `ev.cause` is `move | burn | drain | item`, `ev.target` the creature id. Feedback helpers: `GAME.shake(px, frames)`, `GAME.flash(color, frames, alpha)`. Call `dn.spawn(ev.target, amount, kind)` once per event: `damage` -> `'crit'` if `ev.crit`, else `'damage'`; `heal` -> `'heal'`; `status` -> `'status'` with the word `ev.status.toUpperCase()`; skip `cure`.
4. *Clock:* `update(game, info)` runs every frame; `info.dt` is the world time advanced this frame in ms (16.67, or 0 while frozen). `GAME.hitStopMs(ms)` freezes the battle. In `update(game, info)`: `dn.update(info.dt)`.
5. *Draw:* `draw(g, layer, game)` with `layer === 'fx'`: the native 240x160 context, after the creatures and the module's own move effects, before the info boxes and message box; it shakes with the field: `dn.draw(<that context>)`
6. *Reset:* `onBattleStart(game)`: `dn.clear()` first, before anything spawns there

**Common mistakes:**

- Two numbers per hit -> the built-in numbers are still on.
- Numbers missing in `?t=&freeze=1` shots -> they advanced on real time; advance only in `update`.
- Numbers drift during a freeze -> `dn.update(0)` while the world is frozen.

## Checks

- [Bouncing damage numbers] Every hit shows one bouncing number above its target on the hit frame (heals green `+n`, statuses as words, criticals gold with `CRITICAL`, where the game has them); numbers never touch each other, sprites or UI rects.
- `?auto=1` still plays the whole cup to the CUP CHAMPION screen, with the addons working on every relevant event; `?t=<ms>&freeze=1` shows them mid-game; no built-in duplicates; no console errors.

## Self-check without a browser

- Each module file is byte-identical to the one given: `damage-numbers.js` sha256 `1c7b689771a5877b...`.
- `node --check` your addon script (copy an inline script to a temp .js). Outside the registration slot, the starter is unchanged (diff it).
- [Bouncing damage numbers] Trace one hit: hit site -> `onHit` -> `dn.spawn` -> `update` -> `draw`; the built-in numbers flag is off.
- Trace one autoplay event from the module's hit site (`onHit` of an autoplay move and of a foe move) through your addon hooks to the draw, and say which hooks you added.

# Add bouncing damage numbers to the Gullwing Trail starter

`index.html` is a complete game built on the level-select path reveal element; build on it. `index.README.md` documents its extension points. Add:

- `damage-numbers.js` (one global, `GameDNA_DamageNumbers`), API in `damage-numbers.README.md`

## Rules

1. **Modules verbatim:** load each addon module with a `<script src>` (or pasted unchanged) in the ADDONS SLOT, before the code that uses it. Never edit a module or the starter's own systems; add code only through the extension points.
2. **Register each addon** as one object: push it onto `GAME.addons` in the ADDONS SLOT `<script>` at the end of `index.html` (it runs before the game boots, so addons see the first scene and every `?t=` frame) (hooks: `beforeHit(ev, game)`, `onHit(ev, game)`, `onKey(key, game)`, `update(game, info)`, `draw(g, layer, game)`, `onLevelStart(id, game)`, `onLevelEnd(result, game)`, `onPhase(scene, game)`, `onMapEvent(ev, game)`).
3. **Turn off the starter's built-in equivalent** of each addon: `GAME.flags.builtinPopups = false` (keep `builtinShake`: it is hit feedback, not numbers); otherwise both draw.
4. **Keep everything working:** `?auto=1`, `?t=<ms>&freeze=1`, `?seed=`, `?level=<id>`, `?mute=1`, keys P (autoplay), arrows, Z, X, map clicks. Addons advance only in the `update` hook (never on real time), so `?t=` fast-forward shows them; consume no game key.
5. Keep the native resolution and integer scaling; anything new you draw or name is original (no real game, character, place or brand names).

## Bouncing damage numbers

On the frame a hit lands, the amount pops above the target, each digit bouncing in turn with a small overshoot, holds, then fades; heals, criticals, misses, MP and status words each get their own look, and simultaneous pops never overlap.

**Parameters:** `bounce` = 10, `duration` = 1000, `stagger` = 40, `hitstop` = 60, `scale` = 1, `scheme` = classic, `crit` = burst, `stack` = on, `outline` = 1, `dense` = auto.

**Wiring** (one addon object):

1. *Create:* In the addon object, create `dn` once: `GameDNA_DamageNumbers.create({bounds, params: {bounce: 10, duration: 1000, stagger: 40, hitstop: 60, scale: 1, scheme: 'classic', crit: 'burst', stack: 'on', outline: 1}, getAnchor, getObstacles, onHitStop, onShake, onFlash})`. 
2. *Anchors and obstacles:* `GAME.anchor(id)` -> `{x, top, w, h, footY, cy, left, dead}` (screen px, camera applied); ids are `hero` and the enemy ids in `GAME.L.enemies` (`crab-n`, `gull-n`, `warden`); `GAME.units()` lists the living ones. `getAnchor(id)` returns that home anchor `{x, top, w, h}`, so a lunging attacker's numbers stay put; `getObstacles()` returns each living actor's box `{x: x - w / 2, y: top, w, h, id}` plus every UI rect (without `id`) from `GAME.uiRects()` (level: HUD band `{0, 0, 256, 16}` and the banner while shown; map: the panel, toasts, run plate and shop window; native px); `bounds` is the level view `{x: 0, y: 16, w: 256, h: 208}` (below the HUD band)
3. *Hit:* `onHit(ev, game)` runs on the hit frame, right after the hit site `GAME.applyHit(ev)` changed HP (inside levels only; the map has no hits). `ev.kind` is `damage` (`ev.crit` on critical sword hits) or `heal` (heart pickups, `amount` clamped); `ev.cause === 'fall'` is a pit death (skip it); `ev.target` is `hero` or an enemy id. Kinds for an effect: `damage` -> `'crit'` if `ev.crit`, else `'damage'`; `heal` -> `'heal'`. Feedback helpers: `GAME.hitStopMs(ms)`, `GAME.shake(px, frames)`, `GAME.flash(color, frames, alpha)`. Call `dn.spawn(ev.target, amount, kind)` once per event: 
4. *Clock:* `update(game, info)` runs every 60 Hz frame in every scene; `info.dt` is the world time advanced this frame in ms (16.67, or 0 while frozen by hit-stop or pause), `info.scene` the scene. Call `dn.update(info.dt)` there. `GAME.hitStopMs(ms)` freezes the level. 
5. *Draw:* `draw(g, layer, game)` with `layer === 'fx'`: the native 256x224 buffer; in a level after the actors and built-in sparks, before the HUD band and banner; on the map after the map world, before its panel: `dn.draw(<that context>)`
6. *Reset:* `onLevelStart(id, game)` (every level entry, including retries): `dn.clear()` first, before anything spawns there

**Common mistakes:**

- Two numbers per hit -> the built-in numbers are still on.
- Numbers missing in `?t=&freeze=1` shots -> they advanced on real time; advance only in `update`.
- Numbers drift during a freeze -> `dn.update(0)` while the world is frozen.

## Checks

- [Bouncing damage numbers] Every hit shows one bouncing number above its target on the hit frame (heals green `+n`, statuses as words, criticals gold with `CRITICAL`, where the game has them); numbers never touch each other, sprites or UI rects.
- `?auto=1` still reaches the ending (THE TRAIL IS YOURS), with the addons working on every relevant event; `?t=<ms>&freeze=1` shows them mid-game; no built-in duplicates; no console errors.

## Self-check without a browser

- Each module file is byte-identical to the one given: `damage-numbers.js` sha256 `1c7b689771a5877b...`.
- `node --check` your addon script (copy an inline script to a temp .js). Outside the registration slot, the starter is unchanged (diff it).
- [Bouncing damage numbers] Trace one hit: hit site -> `onHit` -> `dn.spawn` -> `update` -> `draw`; the built-in numbers flag is off.
- Trace one autoplay event from `GAME.applyHit` (an autoplay sword hit on a crab and a crab touching the hero) through your addon hooks to the draw, and say which hooks you added.

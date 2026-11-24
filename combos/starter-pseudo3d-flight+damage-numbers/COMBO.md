# Add bouncing damage numbers to the Windrider Post starter

`index.html` is a complete game built on the pseudo-3d flight ground element; build on it. `index.README.md` documents its extension points. Add:

- `damage-numbers.js` (one global, `GameDNA_DamageNumbers`), API in `damage-numbers.README.md`

## Rules

1. **Modules verbatim:** load each addon module with its own `<script src>` (or pasted unchanged into its own `<script>`) in the ADDONS slot (the empty `<script>` block marked ADDONS SLOT, before the boot script). Never edit a module or the starter's own systems; add code only through the extension points.
2. **Register each addon** as one object: push it onto `GAME.addons` in the ADDONS slot, before boot (hooks: `onHit(ev, game)`, `update(game, {dt, frozen})`, `draw(ctx, layer, game)` with layer `'world'` (after the map or flight view, inside the shake) or `'ui'` (after the HUD), `onKey(e, down, game)`, `onPhase(phase, game)`, `onStart(game)`, `onDeliver(town, game)`).
3. **Turn off the starter's built-in equivalent** of each addon: `GAME.builtinNumbers = false` (in the same ADDONS slot); otherwise both draw.
4. **Keep everything working:** `?auto=1`, `?t=<ms>&freeze=1`, keys X (take off), Z (land), P (autoplay), R (restart), the touch pad. Addons advance only in the `update` hook (never on real time), so `?t=` fast-forward shows them; consume no game key.
5. Keep the native resolution and integer scaling; anything new you draw or name is original (no real game, character, place or brand names).

## Bouncing damage numbers

On the frame a hit lands, the amount pops above the target, each digit bouncing in turn with a small overshoot, holds, then fades; heals, criticals, misses, MP and status words each get their own look, and simultaneous pops never overlap.

**Parameters:** `bounce` = 10, `duration` = 1000, `stagger` = 40, `hitstop` = 60, `scale` = 1, `scheme` = classic, `crit` = burst, `stack` = on, `outline` = 1, `dense` = auto.

**Wiring** (one addon object):

1. *Create:* In the addon object, create `dn` once: `GameDNA_DamageNumbers.create({bounds, params: {bounce: 10, duration: 1000, stagger: 40, hitstop: 60, scale: 1, scheme: 'classic', crit: 'burst', stack: 'on', outline: 1}, getAnchor, getObstacles, onHitStop, onShake, onFlash})`. 
2. *Anchors and obstacles:* `GAME.anchorOf(id)` -> `{x, top, w, h, footY}` in screen px: `'mount'` is the mount sprite as drawn this frame (`'hero'` too while flying), also `'wisp-N'` and `'town-N'` while in the air. `getAnchor(id)` returns that home anchor `{x, top, w, h}`, so a lunging attacker's numbers stay put; `getObstacles()` returns each living actor's box `{x: x - w / 2, y: top, w, h, id}` plus every UI rect (without `id`) from `GAME.uiRects()` (HUD, the flight mini-map / prompt / speed gauge or the walking prompt, the banner, plus addon rects from `GAME.setUIRect(name, rect)`; native px); `bounds` is the whole screen `{x: 0, y: 0, w: 256, h: 224}`
3. *Hit:* `onHit(ev, game)` runs right after the hit site `applyHit` (also `GAME.hit(target, amount, kind, source)`) changed the mount's stamina: a storm wisp strike (`kind: 'damage'`, 2) or a feather / rest (`kind: 'heal'`). `ev = {source, target ('mount' or 'hero'), amount (>= 0, after clamping), kind, killed, hpBefore, hpAfter, max, anchor}`. The kinds are already `damage` / `heal`. Feedback helpers: `GAME.hitStop(ms)`, `GAME.shake(px, ms)`, `GAME.flash(color, ms)`. Call `dn.spawn(ev.target, amount, kind)` once per event: 
4. *Clock:* `update(game, {dt, frozen})` runs every 60 Hz step, also during hit-stop; `dt` is in **ms** (16.67, or 0 while frozen), so pass it straight to an ms-based update. `GAME.hitStop(ms)` freezes the world. 
5. *Draw:* `draw(ctx, 'world', game)`: native 256x224 context inside the shake, after the walking map or the flight view and the built-in numbers, before the HUD: `dn.draw(<that context>)`
6. *Reset:* `onStart(game)` (a new game or restart, before the first delivery): `dn.clear()` first, before anything spawns there

**Common mistakes:**

- Two numbers per hit -> the built-in numbers are still on.
- Numbers missing in `?t=&freeze=1` shots -> they advanced on real time; advance only in `update`.
- Numbers drift during a freeze -> `dn.update(0)` while the world is frozen.

## Checks

- [Bouncing damage numbers] Every hit shows one bouncing number above its target on the hit frame (heals green `+n`, statuses as words, criticals gold with `CRITICAL`, where the game has them); numbers never touch each other, sprites or UI rects.
- `?auto=1` still delivers all three letters (ALL LETTERS DELIVERED), with the addons working on every relevant event; `?t=<ms>&freeze=1` shows them mid-game; no built-in duplicates; no console errors.

## Self-check without a browser

- Each module file is byte-identical to the one given: `damage-numbers.js` sha256 `1c7b689771a5877b...`.
- `node --check` your addon script (copy an inline script to a temp .js). Outside the registration slot, the starter is unchanged (diff it).
- [Bouncing damage numbers] Trace one hit: hit site -> `onHit` -> `dn.spawn` -> `update` -> `draw`; the built-in numbers flag is off.
- Trace one autoplay event from `applyHit` (an autoplay wisp strike while flying) through your addon hooks to the draw, and say which hooks you added.

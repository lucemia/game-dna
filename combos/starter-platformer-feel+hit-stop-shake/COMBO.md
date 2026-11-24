# Add hit-stop, shake & flash to the Lantern Ascent starter

`index.html` is a complete game built on the platformer movement feel element; build on it. `index.README.md` documents its extension points. Add:

- `hit-stop-shake.js` (one global, `GameDNA_HitStop`), API in `hit-stop-shake.README.md`

## Rules

1. **Modules verbatim:** load each addon module with its own `<script src>` (or pasted unchanged into its own `<script>`) in the ADDONS slot (the empty `<script>` block marked ADDONS SLOT, before the boot script). Never edit a module or the starter's own systems; add code only through the extension points.
2. **Register each addon** as one object: push it onto `GAME.addons` in the ADDONS slot, before boot. Hooks: `gate(game)` (called FIRST in every 60 Hz step, before input, autoplay and the world; return `false` to hold the whole world for this step: a hit-stop; latched input waits), `update(game, {dt, frozen})`, `onHit(ev, game)`, `onMove(name, info, game)` (the module's movement events), `drawBegin(ctx, game)` / `drawEnd(ctx, game)` (wrap the play field: backdrop, tiles, sprites, effects; the HUD comes after), `draw(ctx, layer, game)` with layer `'world'` (inside the field, after sprites and dust), `'post'` (after `drawEnd`, before the HUD) or `'ui'` (last), `sprite(ctx, id, rect, next, game)` (wraps each sprite draw: call `next()` to draw it), `onKey(e, down, game)`, `onPhase(phase, game)`, `onStart(game)`, `onRoom(index, game)`, `onPickup(kind, game)`.
3. **Turn off the starter's built-in equivalent** of each addon: `GAME.builtinShake = false` (the built-in hit-stop, shake and red flash); otherwise both draw.
4. **Keep everything working:** `?auto=1`, `?t=<ms>&freeze=1`, `?preset=`, `?overlay=1`, keys Z (jump), X (dash), V (feel overlay), P (autoplay), R (restart), the touch pad. Addons advance only in the `update` hook (never on real time), so `?t=` fast-forward shows them; consume no game key.
5. Keep the native resolution and integer scaling; anything new you draw or name is original (no real game, character, place or brand names).

## Hit-stop, shake & flash

On a hit the world freezes for a few frames (hit-stop), the play field shakes by whole pixels and decays, and the struck sprite turns white for a frame or two; a finisher freezes longer, shakes harder and flashes the field. Three strengths (light, heavy, finisher), a reduced-motion mode, and a step gate so autoplay and frozen screenshots stay deterministic.

**Parameters:** `strength` = heavy, `stop` = 6, `shake` = 4, `flash` = on, `reduced` = system.

**Wiring** (one addon object):

1. *Create:* In the addon object, create `juice` once: `GameDNA_HitStop.create({view: <`GAME.field` = `{x: 0, y: 16, w: 256, h: 208}` (below the HUD band)>, seed: 1, params: {strength: 'heavy', stop: 6, shake: 4, flash: 'on', reduced: 'system'}, uiRects: () => <`GAME.uiRects()` (the HUD band 0,0,256,16, the room banner, the end window, the feel overlay panels while shown, plus addon rects from `GAME.setUIRect(name, rect)`; native px)>})`
2. *Gate:* `update(game, {dt, frozen})` runs every 60 Hz step, also on held steps; `dt` is in **ms** (16.67, or 0 while frozen); `gate(game)` returning false holds the step (the hero, beetles, autoplay and timers all wait). `GAME.hitStop(ms)` is the built-in freeze. The addon's `gate(game)` is `return juice.step(1000 / 60);`: the first thing every play step runs, so a frozen step changes nothing and presses stay latched
3. *Hit:* `onHit(ev, game)` runs right after the hit site `applyHit` (also `GAME.hit(target, amount, kind, source)`): a thorn, pit or beetle hurting the hero (`target: 'hero'`, `kind: 'damage'`), a stomp defeating a beetle (`target: 'beetle-N'`, `cause: 'stomp'`, `killed: true`) or a heart pickup (`kind: 'heal'`). `ev = {source, target, amount, kind, cause, dir, killed, hpBefore, hpAfter, max, anchor, frame}`. Feedback helpers: `GAME.hitStop(ms)`, `GAME.shake(px, ms)`, `GAME.flash(color, ms)`. In `onHit(ev, game)`: `juice.hit({strength: ev.killed ? 'finisher' : 'heavy', at: {x: ev.anchor.x + GAME.cam.x, y: ev.anchor.top + GAME.cam.y}, target: ev.target, dir: ev.dir || 1})` once per landed hit; skip `kind: 'heal'` (heart pickups)
4. *Draw:* `drawBegin(ctx)` -> `juice.begin(ctx)`; `sprite(ctx, id, rect, next)` -> `juice.sprite(ctx, id, rect, next)`; `drawEnd(ctx)` -> `juice.end(ctx); juice.draw(ctx, -GAME.cam.x, -GAME.cam.y)`. Banners and the HUD stay after `end`
5. *Reset:* `onStart(game)` (a new game or restart) and `onRoom(index, game)` (each room entry): `juice.clear()`

**Common mistakes:**

- Two freezes or a double shake per hit -> the starter's built-in hit-stop / shake is still on.
- Nothing freezes -> `gate` does not return `juice.step(...)`, or the addon was pushed after boot.
- The HUD shakes or turns white -> it is drawn before `end`, or `uiRects` misses it.

## Checks

- [Hit-stop, shake & flash] A landed hit holds the world for a few frames, shakes the field by whole pixels and flashes the struck sprite white; a killing blow freezes longer and washes the field under the HUD.
- `?auto=1` still lights the beacon (THE BEACON IS LIT) with every preset, with the addons working on every relevant event; `?t=<ms>&freeze=1` shows them mid-game; no built-in duplicates; no console errors.

## Self-check without a browser

- Each module file is byte-identical to the one given: `hit-stop-shake.js` sha256 `61f0763b8017e229...`.
- `node --check` your addon script (copy an inline script to a temp .js). Outside the registration slot, the starter is unchanged (diff it).
- [Hit-stop, shake & flash] Trace one hit: hit site -> `onHit` -> `juice.hit` -> `gate` returns false for the frozen steps -> `begin` / `sprite` / `end` / `draw`; the built-in shake flag is off.
- Trace one autoplay event from `applyHit` (an autoplay stomp on the beetle in Mossy Gate) through your addon hooks to the draw, and say which hooks you added.

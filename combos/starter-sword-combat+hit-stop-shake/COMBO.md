# Add hit-stop, shake & flash to the Thornvale starter

`index.html` is a complete game built on the real-time sword combat element; build on it. `index.README.md` documents its extension points. Add:

- `hit-stop-shake.js` (one global, `GameDNA_HitStop`), API in `hit-stop-shake.README.md`

## Rules

1. **Modules verbatim:** load each addon module in the ADDONS SLOT `<script>` (pasted unchanged) or as `<script src>` tags right above it. Never edit a module or the starter's own systems; add code only through the extension points.
2. **Register each addon** as one object: push it onto `GAME.addons` in the ADDONS SLOT `<script>` of `index.html` (it runs before the game boots, so addons see the first room and every `?t=` frame) (hooks: `gate(game)`, `beforeHit(ev, game)`, `onHit(ev, game)`, `onDefeat(enemy, ev, game)`, `onKey(key, game)`, `update(game, info)`, `draw(g, layer, game)` with layers `begin | ground | fx | end | overlay`, `wrapSprite(g, id, rect, drawFn, game)`, `onRoomStart(roomId, game)`, `onPhase`, `onEvent`, `onEnd`).
3. **Turn off the starter's built-in equivalent** of each addon: `GAME.flags.builtinShake = false` and `GAME.flags.builtinHitStop = false`; otherwise both draw.
4. **Keep everything working:** `?auto=1`, `?t=<ms>&freeze=1`, `?seed=`, `?dirs=`, `?hearts=`, `?overlay=`, keys P (autoplay), H (hitboxes), Esc (pause). Addons advance only in the `update` hook (never on real time), so `?t=` fast-forward shows them; consume no game key.
5. Keep the native resolution and integer scaling; anything new you draw or name is original (no real game, character, place or brand names).

## Hit-stop, shake & flash

On a hit the world freezes for a few frames (hit-stop), the play field shakes by whole pixels and decays, and the struck sprite turns white for a frame or two; a finisher freezes longer, shakes harder and flashes the field. Three strengths (light, heavy, finisher), a reduced-motion mode, and a step gate so autoplay and frozen screenshots stay deterministic.

**Parameters:** `strength` = heavy, `stop` = 6, `shake` = 4, `flash` = on, `reduced` = system.

**Wiring** (one addon object):

1. *Create:* In the addon object, create `juice` once: `GameDNA_HitStop.create({view: <the play field `GAME.field` (`{x: 0, y: 16, w: 256, h: 208}`)>, seed: 1, params: {strength: 'heavy', stop: 6, shake: 4, flash: 'on', reduced: 'system'}, uiRects: () => <`GAME.uiRects()` (HUD bar, intro box, room banner and result window while shown; native px)>})`
2. *Gate:* `update(game, info)` runs every frame; `info.dt` is the world time advanced this frame in ms (16.67, or 0 while held). An addon's `gate(game)` runs first in every play step: return false to hold the whole world for that step (presses stay latched). `GAME.hitStopMs(ms)` holds it too; set `GAME.flags.builtinHitStop = false` when your addon owns the hit-stop. The addon's `gate(game)` is `return juice.step(1000 / 60);`: the first thing every play step runs, so a frozen step changes nothing and presses stay latched
3. *Hit:* `onHit(ev, game)` runs on the hit frame, after the module applied HP, knockback and i-frames. `ev.kind` is `melee | contact | charge | projectile | host`; `ev.target` is `'hero'` or an enemy id; `amount` is the HP removed; `ev.strength` is `light | heavy | finisher` (finisher = the combo's third hit or a killing blow); `ev.killed`; `ev.screen` is the contact point in native screen px; `ev.dir` the blow's unit direction. Feedback helpers: `GAME.shake(px, frames)`, `GAME.flash(color, frames, alpha)`. In `onHit(ev, game)`: `juice.hit({strength: ev.strength, at: ev.at, target: ev.target, dir: ev.dir.x < 0 ? -1 : 1})` once per landed hit
4. *Draw:* `draw(g, 'begin')` -> `juice.begin(g)`; `wrapSprite(g, id, rect, drawFn)` -> `juice.sprite(g, id, rect, drawFn)`; `draw(g, 'end')` -> `juice.end(g); juice.draw(g, 0, 0)`. Banners and the HUD stay after `end`
5. *Reset:* `onRoomStart(roomId, game)`: `juice.clear()`

**Common mistakes:**

- Two freezes or a double shake per hit -> the starter's built-in hit-stop / shake is still on.
- Nothing freezes -> `gate` does not return `juice.step(...)`, or the addon was pushed after boot.
- The HUD shakes or turns white -> it is drawn before `end`, or `uiRects` misses it.

## Checks

- [Hit-stop, shake & flash] A landed hit holds the world for a few frames, shakes the field by whole pixels and flashes the struck sprite white; a killing blow freezes longer and washes the field under the HUD.
- `?auto=1` still clears all four rooms and reaches THE VALE IS SAFE, with the addons working on every relevant event; `?t=<ms>&freeze=1` shows them mid-game; no built-in duplicates; no console errors.

## Self-check without a browser

- Each module file is byte-identical to the one given: `hit-stop-shake.js` sha256 `61f0763b8017e229...`.
- `node --check` your addon script (copy an inline script to a temp .js). Outside the registration slot, the starter is unchanged (diff it).
- [Hit-stop, shake & flash] Trace one hit: hit site -> `onHit` -> `juice.hit` -> `gate` returns false for the frozen steps -> `begin` / `sprite` / `end` / `draw`; the built-in shake flag is off.
- Trace one autoplay event from the hit site (`onHit` of an autoplay sword hit and of a contact or projectile hit on the hero) through your addon hooks to the draw, and say which hooks you added.

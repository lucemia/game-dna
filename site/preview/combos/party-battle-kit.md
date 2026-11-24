# Add Bevelled window + pointer cursor, Hit sparks & spell bursts, Bouncing damage numbers and Dissolve-out defeat to the Ruin Skirmish starter

`index.html` is a complete game built on the Active-time gauge battle element; build on it. `index.README.md` documents its extension points. Add:

- `window-cursor.js` (one global, `GameDNA_WindowCursor`), API in `window-cursor.README.md`
- `hit-sparks.js` (one global, `GameDNA_HitSparks`), API in `hit-sparks.README.md`
- `damage-numbers.js` (one global, `GameDNA_DamageNumbers`), API in `damage-numbers.README.md`
- `dissolve-defeat.js` (one global, `GameDNA_DissolveDefeat`), API in `dissolve-defeat.README.md`

## Rules

1. **Modules verbatim:** load each addon module with a `<script src>` (or pasted unchanged) in the ADDONS SLOT, before the code that uses it. Never edit a module or the starter's own systems; add code only through the extension points.
2. **Register each addon** as one object: push it onto `GAME.addons` in the ADDONS SLOT `<script>` of `index.html` (it runs before the battle boots, so addons see the first battle and every `?t=` frame; module `<script src>` tags go there too) (hooks: `beforeHit`, `onHit(ev, game)`, `onKey(key, game)`, `update(game, info)`, `draw(g, layer, game)`, `onBattleStart(game)`, `onBattleEnd(result, game)`).
3. **Turn off the starter's built-in equivalent** of each addon: `GAME.flags.builtinPopups = false` (keep `builtinShake`: it is hit feedback, not numbers); otherwise both draw.
4. **Keep everything working:** `?auto=1`, `?t=<ms>&freeze=1`, `?mode=`, `?speed=`, `?status=`, `?seed=`, keys M (mode) and P (autoplay). Addons advance only in the `update` hook (never on real time), so `?t=` fast-forward shows them; consume no game key.
5. Keep the native resolution and integer scaling; anything new you draw or name is original (no real game, character, place or brand names).

## Bevelled window + pointer cursor

A drop-in replacement for plain text boxes and menus: bevelled gradient windows that grow from their centre when they open, a pointing glove that bobs beside the selected item and slides between items, greyed-out disabled items, a target pointer for picking units, and a placement helper that keeps every window on screen and off the sprites and HUD it must not cover.

**Parameters:** `open` = 6, `slide` = 50, `bob` = 200, `rowH` = 12, `type` = 0, `margin` = 2, `tint` = a, `pointer` = glove, `band` = auto.

Wire it through the extension points above; the API is in `window-cursor.README.md`.

## Hit sparks & spell bursts

On the frame a blow lands, a few frames of impact at the contact point (slash streak, star burst, cross spark or ring shockwave) with pooled pixel sparks that fall under gravity; spells get palette-cycled fire, ice, thunder and heal bursts; criticals are bigger, flash white for 3 frames and ask for hit-stop and shake. Deterministic with a seed.

**Parameters:** `size` = 1, `life` = 14, `sparks` = 8, `gravity` = 0.15, `hitstop` = 50, `shake` = 2, `critFlash` = screen, `style` = auto, `cycle` = 2, `cap` = 192.

**Wiring** (one addon object):

1. *Create:* In the addon object, create `fx` once: `GameDNA_HitSparks.create({view: <the play field `{x: 0, y: 0, w: GAME.W, h: GAME.FH}`>, seed: 1, params: {size: 1, life: 14, sparks: 8, gravity: 0.15, hitstop: 50, shake: 2, critFlash: 'screen', style: 'auto', cycle: 2, cap: 192}, getObstacles, uiRects, onHitStop, onShake})`. `onHitStop: ms => GAME.hitStopMs(ms)`, `onShake: (px, ms) => GAME.shake(px, Math.ceil(ms * 60 / 1000))`; set `hitstop: 0` if the starter already freezes on hits.
2. *Anchors and obstacles:* `GAME.anchor(id)` -> `{x, top, w, h, left, dead}` (home position, native px); living actors are `GAME.B.party` and `GAME.B.mons` (`dead` false). `getObstacles()` returns each living unit's box `{x, y, w, h, id}` in the same coordinates as the hit points; `uiRects()` returns `GAME.uiRects()` (mode plate, HUD windows, banner and result window while shown; native px).
3. *Hit:* `onHit(ev, game)` runs on the hit frame, right after the hit site `GAME.applyHit(ev)` changed HP, MP or status. `ev.kind` is `damage | heal | mp | status | guard`: `amount` is the applied amount (after Defend; heals clamped), `ev.crit` marks critical attacks, `status` events carry `ev.status`, `mp` events are spell costs with `ev.quiet: true`, `guard` is Defend. Feedback helpers: `GAME.shake(px, frames)`, `GAME.flash(color, frames, alpha)`. For each `damage` event: `const a = GAME.anchor(ev.target)`; `fx.hit(a.x, a.top + a.h / 2, {crit: !!ev.crit, target: ev.target})`; `heal` -> `fx.burst(a.x, a.top + a.h / 2, 'heal', {target: ev.target})`; skip `ev.quiet` events, `status` and `guard`.
4. *Clock:* `update(game, info)` runs every frame; `info.dt` is the world time advanced this frame in ms (16.67, or 0 while frozen). `GAME.hitStopMs(ms)` freezes the battle. In `update(game, info)`: `fx.update(info.dt)`.
5. *Draw:* `draw(g, layer, game)` with `layer === 'fx'`: the native 256x224 buffer, after actors, banner and mode plate, before the HUD; it shakes with the field: when `layer === 'fx'`, `fx.draw(g)`
6. *Reset:* `onBattleStart(game)`: `fx.clear()`

**Common mistakes:**

- Effects missing in `?t=&freeze=1` shots -> they advanced on real time; advance only in `update`.
- Double shake on criticals -> the starter already shakes on hits; keep one of the two (`shake: 0` here, or the starter flag off).

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

## Dissolve-out defeat

A defeated unit blinks white and dissolves from a snapshot of its sprite (dither-noise fade, horizontal slice wipe, pixel crumble with gravity, or flash-then-fade) in about 0.5-1 s, so the game can remove the unit at once and nothing waits for the effect.

**Parameters:** `variant` = dither, `duration` = 700, `flash` = 100, `edge` = white, `chunk` = 1, `spill` = 3.

**Wiring** (one addon object):

1. *Create:* In the addon object, create `dd` once: `GameDNA_DissolveDefeat.create({view, params: {variant: 'dither', duration: 700, flash: 100, edge: 'white', chunk: 1, spill: 3}, uiRects})`; `view` is the play field `{x: 0, y: 0, w: GAME.W, h: GAME.FH}`, `uiRects` returns the rects from `GAME.uiRects()` (mode plate, HUD windows, banner and result window while shown; native px).
2. *Hit:* `onHit(ev, game)` runs on the hit frame, right after the hit site `GAME.applyHit(ev)` changed HP, MP or status. `ev.kind` is `damage | heal | mp | status | guard`: `amount` is the applied amount (after Defend; heals clamped), `ev.crit` marks critical attacks, `status` events carry `ev.status`, `mp` events are spell costs with `ev.quiet: true`, `guard` is Defend. Feedback helpers: `GAME.shake(px, frames)`, `GAME.flash(color, frames, alpha)`. When an event leaves its target at HP 0 and the target leaves the field, call `dd.defeat(id, {rect, image | drawSprite})` with the sprite rect drawn now (`GAME.anchor(id)` -> `{x, top, w, h, left, dead}` (home position, native px); living actors are `GAME.B.party` and `GAME.B.mons` (`dead` false)), then stop drawing that unit.
3. *Clock:* `update(game, info)` runs every frame; `info.dt` is the world time advanced this frame in ms (16.67, or 0 while frozen). `GAME.hitStopMs(ms)` freezes the battle: `dd.update(<step ms>)`, `0` while frozen.
4. *Draw:* `draw(g, layer, game)` with `layer === 'fx'`: the native 256x224 buffer, after actors, banner and mode plate, before the HUD; it shakes with the field: `dd.draw(<that context>)` after the units.
5. *Reset:* `onBattleStart(game)`: `dd.clear()`.

**Common mistakes:**

- The unit fades twice -> the starter's built-in death fade is still on.

## Checks

- [Bevelled window + pointer cursor] Menus grow from their centre as bevelled windows in the old menu boxes; the glove bobs beside the selected row and slides when it moves; disabled rows are grey.
- [Bevelled window + pointer cursor] Target choice shows the glove beside the chosen unit, sliding between units; it disappears when the choice ends.
- [Bevelled window + pointer cursor] Messages wrap, never cover a sprite or the HUD, and close when the game moves on (and on scene changes).
- [Bevelled window + pointer cursor] Autoplay (`?auto=1` or the game's own) reaches the same end as before; `?t=...&freeze=1` shots show settled windows; taps on rows still work.
- [Hit sparks & spell bursts] Every hit shows one impact at its target on the hit frame (spells their burst, criticals bigger with a white flash); nothing covers UI rects.
- [Bouncing damage numbers] Every hit shows one bouncing number above its target on the hit frame (heals green `+n`, statuses as words, criticals gold with `CRITICAL`, where the game has them); numbers never touch each other, sprites or UI rects.
- [Dissolve-out defeat] Every defeated enemy dissolves at its spot; the battle ends on the same frame as before.
- `?auto=1` still wins all waves, with the addons working on every relevant event; `?t=<ms>&freeze=1` shows them mid-game; no built-in duplicates; no console errors.

## Self-check without a browser

- Each module file is byte-identical to the one given: `window-cursor.js` sha256 `d30ceb94db004be8...`, `hit-sparks.js` sha256 `4ffa37bc1a39cbcb...`, `damage-numbers.js` sha256 `1c7b689771a5877b...`, `dissolve-defeat.js` sha256 `dcd746410957e345...`.
- `node --check` your addon script (copy an inline script to a temp .js). Outside the registration slot, the starter is unchanged (diff it).
- [Hit sparks & spell bursts] Trace one hit: hit site -> `fx.hit` / `fx.burst` -> `update` -> `draw`.
- [Bouncing damage numbers] Trace one hit: hit site -> `onHit` -> `dn.spawn` -> `update` -> `draw`; the built-in numbers flag is off.
- [Dissolve-out defeat] Trace one kill: hit site -> HP 0 -> `dd.defeat` -> unit hidden -> `update` -> `draw`.
- Trace one autoplay event from `GAME.applyHit` (an autoplay Attack and an enemy hit) through your addon hooks to the draw, and say which hooks you added.

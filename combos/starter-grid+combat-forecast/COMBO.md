# Add combat forecast window to the Ford Skirmish starter

`index.html` is a complete game built on the grid movement range + path arrow element; build on it. `index.README.md` documents its extension points. Add:

- `combat-forecast.js` (one global, `GameDNA_CombatForecast`), API in `combat-forecast.README.md`

## Rules

1. **Modules verbatim:** load each addon module with its own `<script src>` (or pasted unchanged into its own `<script>`) before the game script, so it exists in the ADDONS slot. Never edit a module or the starter's own systems; add code only through the extension points.
2. **Register each addon** as one object: push it onto `game.addons` in the ADDONS slot of section 8 of `index.html`, before `newGame()` (hooks: `onHit(ev)`, `update(game, {dt, frozen})`, `drawGround(ctx, cam, game)` (under overlays and units), `draw(ctx, cam, game)`, `drawUI(ctx, game)` (top UI layer), `onKey(e, down)`, `onTurnStart(turn, side)`, `onPhase(phase)`).
3. **Turn off the starter's built-in equivalent** of each addon: `game.builtinForecast = false` (in the same ADDONS slot; the red target brackets stay); otherwise both draw.
4. **Keep everything working:** `?auto=1`, `?t=<ms>&freeze=1` (also with `&script=`), keys E (end turn) and R (restart), the End turn button, mouse and touch. Addons advance only in the `update` hook (never on real time), so `?t=` fast-forward shows them; consume no game key.
5. Keep the native resolution and integer scaling; anything new you draw or name is original (no real game, character, place or brand names).

## Combat forecast window

Before an attack is confirmed, a two-sided window shows what will happen: both units' HP now and after, damage, hit and critical chances, whether the target strikes back and for how much, an x2 badge for double attacks and arrows for weapon or type advantage, in team colours, updating live as the target or weapon changes and placed so it never covers the two units or the cursor. The game supplies every number; the module only shows them.

**Parameters:** `open` = 6, `slide` = 80, `place` = corner, `rows` = auto, `bars` = on, `blink` = 320, `sides` = attacker, `margin` = 3.

**Wiring** (one addon object):

1. *Create:* In the ADDONS slot, create `fc` once: `GameDNA_CombatForecast.create({view: {x: 0, y: 0, w: 240, h: 160}, getObstacles, params: {open: 6, slide: 80, place: 'corner', rows: 'auto', bars: 'on', blink: 320, sides: 'attacker', margin: 3}})`. `game.anchorOf(id, {home: true})` -> `{x, top, w, h}`: the sprite box at the unit's tile (no walk or lunge offset), screen px; units are `game.units`, alive while `hp > 0`; `getObstacles()` returns each living unit's box `{x, y, w, h, id}` plus the turn plate `HUD_TURN`.
2. *Forecast state:* While the Attack target picker is open, `game.targeting()` returns `{attacker, target, list, index}` (unit ids), else `null`. Describe a unit with `const u = game.units.find(v => v.id === id), a = game.anchorOf(id, {home: true})` -> `{id, name: u.name, team: u.side, hp: u.hp, max: u.max, rect: {x: a.left, y: a.top, w: a.w, h: a.h + 3}}` (the +3 keeps its HP bar clear). Numbers come from the starter's own rules through `const f = game.forecastData(T.attacker, T.target)` -> `{dmg, hit, crit, hits, counter: {dmg, ...} | null}`; pass `data = {dmg: f.dmg, counter: f.counter ? {dmg: f.counter.dmg} : null}` (the starter has no hit or crit; leave them out).
3. *Clock:* `update(game, {dt, frozen})` runs every 60 Hz step, also during hit-stop; `dt` is in seconds (1/60) and `frozen` is true while the world is stopped. `game.hitStop(ms)` freezes the world. In `update(game, {dt})`: `const T = game.targeting()`; if `T` call `fc.show(attacker, target, data)`, else `fc.hide()`; then `fc.update(dt * 1000)` (dt is in seconds; the picker is never open during hit-stop). Report the window with `game.setUIRect('forecast', fc.rect())` so `game.uiRects()` and the grid windows avoid it.
4. *Draw (instead of the built-in forecast window):* Set `game.builtinForecast = false` in the ADDONS slot and draw in the addon `drawUI(ctx, game)` hook (the top UI layer, after the HUD plate and the grid windows, before banners): `fc.draw(ctx)`. The starter keeps drawing its red target brackets. Do not edit the starter outside the slot.

**Common mistakes:**

- Two forecast windows -> the built-in one still draws; turn it off with the starter's flag.
- The window is missing in `?t=&freeze=1&script=attack` shots -> `show` runs only in the draw; call it from the addon `update` too.
- The window shows numbers the attack does not apply -> `data` must call the starter's own damage and range rules.

## Checks

- [Combat forecast window] The attack target picker shows the forecast window (both sides, HP now -> after, DMG, counter or `--`), it updates when the target changes, and it never covers the two units, the turn plate or the cursor.
- `?auto=1` still reaches VICTORY, with the addons working on every relevant event; `?t=<ms>&freeze=1` shows them mid-game; no built-in duplicates; no console errors.

## Self-check without a browser

- Each module file is byte-identical to the one given: `combat-forecast.js` sha256 `bdabae99da8eeaee...`.
- `node --check` your addon script (copy an inline script to a temp .js). Outside the registration slot, the starter is unchanged (diff it).
- [Combat forecast window] Trace one attack: Attack command -> target picker opens -> addon `update` calls `fc.show(...)` -> addon `drawUI` calls `fc.draw` -> confirm closes it (`fc.hide`).
- Trace one autoplay event from `applyHit` (an autoplay attack and its counter) through your addon hooks to the draw, and say which hooks you added.

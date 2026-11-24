# Add enemy threat range to the Ford Skirmish starter

`index.html` is a complete game built on the grid movement range + path arrow element; build on it. `index.README.md` documents its extension points. Add:

- `threat-range.js` (one global, `GameDNA_ThreatRange`), API in `threat-range.README.md`

## Rules

1. **Modules verbatim:** load each addon module with its own `<script src>` (or pasted unchanged into its own `<script>`) before the game script, so it exists in the ADDONS slot. Never edit a module or the starter's own systems; add code only through the extension points.
2. **Register each addon** as one object: push it onto `game.addons` in the ADDONS slot of section 8 of `index.html`, before `newGame()` (hooks: `onHit(ev)`, `update(game, {dt, frozen})`, `drawGround(ctx, cam, game)` (under overlays and units), `draw(ctx, cam, game)`, `drawUI(ctx, game)` (top UI layer), `onKey(e, down)`, `onTurnStart(turn, side)`, `onPhase(phase)`).
3. **Turn off the starter's built-in equivalent** of each addon (check its README flags); otherwise both draw.
4. **Keep everything working:** `?auto=1`, `?t=<ms>&freeze=1` (also with `&script=`), keys E (end turn) and R (restart), the End turn button, mouse and touch. Addons advance only in the `update` hook (never on real time), so `?t=` fast-forward shows them; consume no game key.
5. Keep the native resolution and integer scaling; anything new you draw or name is original (no real game, character, place or brand names).

## Enemy threat range

One key or button paints every tile any enemy could move to or strike this turn as a red tinted zone with a crisp marching outline; pointing at one enemy shows just its reach, enemies can be pinned one by one, the zone follows units as they move, and it never covers the player's own blue range.

**Parameters:** `tint` = threat, `fill` = 0.8, `pattern` = solid, `outline` = march, `march` = 8, `dash` = 4, `fade` = 120, `both` = outline, `walls` = hide, `costs` = on, `start` = off, `key` = KeyT, `label` = THREAT, `layer` = under, `button` = auto.

**Wiring** (one addon object):

1. *Create:* Create `threat` once in the ADDONS slot: `GameDNA_ThreatRange.create({cols, rows, tile, view, params: {tint: 'threat', fill: 0.8, pattern: 'solid', outline: 'march', march: 8, dash: 4, fade: 120, both: 'outline', walls: 'hide', costs: 'on', start: 'off', key: 'KeyT', label: 'THREAT', layer: 'under', button: 'auto'}, cost, occupant, enemies, moveOf, rangeOf, idOf, playerRange, getObstacles, uiRects})`. `cols: MW, rows: MH, tile: TS, view: {x: 0, y: 0, w: 240, h: 160}`, `cost: (x, y) => TER[at(x, y)].cost`, `occupant: unitAt`, `enemies: () => game.units.filter(u => u.side === 'b')`, `moveOf: u => u.mv`, `rangeOf: u => u.rng`, `idOf: u => u.id`, `playerRange: () => GR.mode === 'select' ? GR.reach : null` (the grid module draws its blue range only in `select`). `tint: 'threat'` (violet) because the starter already marks the hero's strike tiles in red.
2. *Sprites and UI:* `game.anchorOf(id, {home: true})` -> `{x, top, w, h}`: the sprite box at the unit's tile (no walk or lunge offset), screen px; units are `game.units`, alive while `hp > 0`. `getObstacles()` returns each living unit's box `{x: left, y: top, w, h: h + 3, id}` (the 3 px cover its HP bar), so the button never sits on a unit; `uiRects()` returns `game.uiRects()` (turn plate, built-in forecast window, the grid windows and cursor, plus addon rects registered with `game.setUIRect(name, rect)`; native px), without the map cursor (`r.kind !== 'cursor'`) and without the button's own rect; `view` is the whole screen `{x: 0, y: 0, w: 240, h: 160}`.
3. *Clock:* `update(game, {dt, frozen})` runs every 60 Hz step, also during hit-stop; `dt` is in seconds (1/60) and `frozen` is true while the world is stopped. `game.hitStop(ms)` freezes the world. In `update(game, {dt, frozen})`: `const c = GR.cursor, e = game.phase === 'player' && GR.mode === 'idle' ? game.units.find(u => u.hp > 0 && u.side === 'b' && u.x === c.x && u.y === c.y) : null; threat.showUnit(e || null); threat.update(frozen ? 0 : dt * 1000);` (dt is in seconds).
4. *Draw:* The zone in the ground layer, under the grid overlays and units: `drawGround(ctx, cam) { threat.draw(ctx, cam); }`. The button in the top UI layer, after the HUD plate, the grid windows and the forecast, so it is placed against this frame's windows: `drawUI(ctx) { const b = threat.drawButton(ctx); if (b) game.setUIRect('threat', b); }` (other addons then avoid it; leave it out of `threat`'s own `uiRects()`).
5. *Input:* `onKey(e, down)`: `if (threat.key(e.code, down, e.repeat)) return true;` then, on keydown of Z / Enter / Space while `game.phase === 'player' && GR.mode === 'idle'` with an enemy under `GR.cursor`: `threat.toggleUnit(thatEnemy); return true;`; return false otherwise (E, R and every other key keep working). The button: in the ADDONS slot add `cv.addEventListener('pointerdown', e => { const r = cv.getBoundingClientRect(); if (threat.click((e.clientX - r.left) * 240 / r.width, (e.clientY - r.top) * 160 / r.height)) { e.preventDefault(); e.stopImmediatePropagation(); } });` (registered before the starter's own listener, so a button tap never reaches the map).
6. *Reset:* `onTurnStart(turn, side)` with `turn === 1 && side === 'a'` (new game and restart): `threat.clear()`

**Common mistakes:**

- The button hides under a window -> it was drawn in the world `draw` slot (before the windows) or placed with last frame's rects; draw it with `drawButton` in the top UI layer, after the windows.
- The blue range is tinted -> `playerRange()` must return the grid module's reach while it shows it.
- The zone outline is lost among the game's own red strike squares -> use `tint: 'threat'` (violet) in a game that already marks its strikes in red.
- The zone lags or freezes in `?t=&freeze=1` -> advance only in the `update` hook, with `0` while frozen.

## Checks

- [Enemy threat range] T and the THREAT button toggle a zone with a marching outline over every tile enemies reach or strike, under the units; cursor on an enemy shows only its zone; Z on an enemy pins it; the zone follows moving units; a selected hero's blue range stays blue (zone outline only); the button is never under a window or a unit.
- `?auto=1` still reaches VICTORY, with the addons working on every relevant event; `?t=<ms>&freeze=1` shows them mid-game; no built-in duplicates; no console errors.

## Self-check without a browser

- Each module file is byte-identical to the one given: `threat-range.js` sha256 `10fbc8e61b65042c...`.
- `node --check` your addon script (copy an inline script to a temp .js). Outside the registration slot, the starter is unchanged (diff it).
- [Enemy threat range] Trace: T -> `onKey` -> `threat.key` (true) -> next `update` -> `drawGround` shows the zone -> `drawUI` draws the button after the windows; trace an enemy walk tile by tile -> the zone follows.
- Trace one autoplay event from `applyHit` (an autoplay attack and its counter) through your addon hooks to the draw, and say which hooks you added.

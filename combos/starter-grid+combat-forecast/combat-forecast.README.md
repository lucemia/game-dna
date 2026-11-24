# combat-forecast.js (A-03 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_CombatForecast`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns the forecast window: layout (attacker on one side, target on the other, labels in a centre spine), team-coloured halves, HP now → after with a bar whose predicted loss blinks, damage with an x2 badge, hit and crit rows, the counter (or `--`), advantage arrows, the weapon row, live updates (changed values flash), opening, sliding to a new spot, and placement that never covers the two units, the cursor or the HUD. **It never computes rules**: every number comes from your game. It reads no input and changes no game state.

Looks: with `skin-api.js` and a skin loaded first, it draws through `GameDNA_Skin.resolve(options.skin)`; without them it uses its own copy of the `pixel16` look (5×7 bitmap font, blue / red bevelled windows). Text is drawn upper-case.

## API

`GameDNA_CombatForecast.create(options)` returns an instance.

| option | meaning |
|---|---|
| `view` | Screen area `{x, y, w, h}` in native pixels the window stays inside: usually the play field above the HUD. Default: the canvas size at the first `draw` (pass it when the canvas backing store is not the native size). |
| `getObstacles()` | Rects `{x, y, w, h, id?}` in screen pixels: every living unit's drawn box **with its `id`** (the two fighters are never covered; other units are avoided whenever any spot allows it) and HUD panels or other windows **without** an id (never covered). `soft: true` marks decor that may be covered. Called once per `update`. May return `[]`. |
| `getCursor()` | Optional: the map cursor's rect, or `null` when hidden. Never covered. |
| `getAnchor(id, unit)` | Optional: returns a unit's rect (`{x, y, w, h}` or `{x: centreX, top, w, h}`) when `show()` got only ids. |
| `forecast(att, def)` | Optional: YOUR forecast function, called by `show()` when it gets no `data`. Receives the two objects you passed to `show` (carry your own unit objects on them, e.g. `att.unit`). Returns `data` (below). Wrapped in try/catch. |
| `skin` | Skin id or object (only used when `skin-api.js` is loaded). |
| `params` | Any of `open` 6 (frames to grow / shrink, 0 = instant), `slide` 80 (ms to slide to a new spot, 0 = jump), `place` `'corner'` (screen corners and edges, stays put) or `'near'` (beside the two units), `rows` `'auto'` (hit / crit rows only when your data has them) / `'all'` / `'compact'` (HP and DMG only), `bars` `'on'`, `blink` 320 (ms per blink of the predicted HP loss, 0 = steady), `sides` `'attacker'` (attacker left) or `'team'` (player's unit always left), `margin` 3 (px kept from the two units). |
| `debug(e)` | Optional: receives `open`, `opened`, `close` (`auto: true` when it closed by itself), `closed`, `pair`, `place` and `warn` events. |

| method | |
|---|---|
| `show(att, def, data?, opts?)` | Opens the window, or updates it if it is already open (changed values flash, a new pair re-places it; no new opening). `att` / `def`: `{id, name, team: 'a' \| 'b' \| 'n', hp, max, rect: {x, y, w, h}, weapon?}` (`team` also accepts `player`/`enemy`/`blue`/`red`; `max` also `maxHp`; `rect` may be `{x: centreX, top, w, h}`). `data` (from YOUR rules): `{dmg, hit, crit, hits, adv, counter, after, note}`, see below. `opts.avoid`: extra rects never to cover. |
| `hide()` | Shrinks and removes it. |
| `update(dtMs)` | Once per fixed step (16.67). All animation runs on it. It also re-places the window when units or the camera move. |
| `draw(ctx, ox = 0, oy = 0)` | Draws at native resolution. Call it after the map, units and HUD, outside any screen-shake translate. Never throws. |
| `rect()` / `rects()` | The open window `{x, y, w, h}` (or `null` / `[]`): give it to your other UI so pop-ups avoid it. |
| `isOpen()`, `isSettled()`, `shown()`, `clear()`, `setParams(obj)`, `setView(rect)`, `params()`, `lastDrawn()` | `clear()` removes it at once (restart). `lastDrawn()` returns what the last `draw` put on screen (tests). |

**`data`** (every field optional): `dmg` a number, `[min, max]` or a string such as `'5-7'`; `hit`, `crit` 0–100 (leave out what your game does not have: with `rows: 'auto'` the row disappears); `hits` 2 for "strikes twice" (x2 badge); `adv` 1 / 0 / -1 (up or down arrow; the counter side gets the opposite unless it has its own); `counter`: `{dmg, hit, crit, hits, adv}` when the target can strike back, `null` or missing when it cannot (its side shows `--`); `after`: `{att, def}` your own HP-after numbers. Without `after` the module shows the worst case: every listed strike lands (top of a damage range), in the order attacker, counter, extra strikes, and a unit at 0 stops striking (its numbers dim).

**Two ways to call it, both fine.** (a) Every step while the player is aiming, `show(...)` with the current pair; it closes by itself 3 steps after the calls stop (and `hide()` closes it at once). (b) `show(...)` when the target or weapon changes, `hide()` when aiming ends; with (b), `hide` is required.

## Integration (15 lines)

```js
// <script src="combat-forecast.js"></script> before your game script
const fc = GameDNA_CombatForecast.create({
  view: { x: 0, y: 0, w: SCREEN_W, h: SCREEN_H - HUD_H },
  getObstacles: () => units.filter(u => u.hp > 0).map(u => ({ x: u.px - camX, y: u.py - camY, w: 16, h: 16, id: u.id })).concat([hudRect]),
  getCursor: () => cursorVisible ? { x: cursor.px - camX - 2, y: cursor.py - camY - 2, w: 20, h: 20 } : null
});
const side = u => ({ id: u.id, name: u.name, team: u.isPlayer ? 'a' : 'b', hp: u.hp, max: u.maxHp, rect: { x: u.px - camX, y: u.py - camY, w: 16, h: 16 }, weapon: u.weapon.name });
function step() {                                   // your fixed 60 Hz step: your targeting code stays as it is
  /* ... existing input + targeting ... */
  if (aiming) { const p = previewAttack(attacker, target);   // YOUR rules: the same numbers the attack will use
    fc.show(side(attacker), side(target), { dmg: p.damage, hit: p.hit, crit: p.crit, hits: p.doubles ? 2 : 1, adv: p.advantage,
      counter: p.canCounter ? { dmg: p.counterDamage, hit: p.counterHit, crit: p.counterCrit } : null }); }
  else fc.hide();
  fc.update(1000 / 60);
}
function render() { /* map, units, effects, HUD */ fc.draw(ctx); /* full-screen banners */ }
```

## Keep your game working

- **Keep every caller.** Your autoplay / AI, `?t=&freeze=1` style test hooks, keyboard shortcuts, tap handlers, restart and title screens must work exactly as before. Only add calls next to your targeting code; do not route the AI through it.
- **Same numbers as the attack.** Build `data` with the functions your attack applies (damage, hit, crit, double-strike, counter range). If your game rolls a random bonus, pass the range (`[min, max]`). Never add a formula your game lacks; leave the field out.
- **Replace drawing only.** If your game already draws a forecast or preview box, delete only its drawing; keep the numbers it computed (they become `data`). Keep target highlights and cursors your game draws on the map.
- **Fast-forward start.** `?t=&freeze=1` runs many steps and then draws once: call `show` from the step (not only from the render) so the window is settled in that frame.

## Self-check without a browser

1. The module file is byte-identical to the one given; it is loaded before the first use of `GameDNA_CombatForecast`.
2. Name the state that means "aiming before confirm"; one place calls `show` while it is on and `hide` otherwise, each step.
3. Walk one preview by hand: `dmg`, `hit`, `crit`, `hits` and `counter` equal what your attack code will do for that pair (or its range); fields your game lacks are left out.
4. Every identifier inside `getObstacles`, `getCursor` and your `side()` helper exists when `update` first runs; rects are in screen pixels (after the camera).
5. `fc.update(...)` once per fixed step; `fc.draw(ctx)` once per frame after the HUD. No host function was removed or renamed; autoplay still reaches the end.

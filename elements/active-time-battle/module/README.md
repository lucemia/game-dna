# GameDNA_ATB: active-time gauge battle module (A-01, v1)

`active-time-battle.js` is one plain script with no dependencies and no `export`. It defines one global, `GameDNA_ATB`. Paste it into a `<script>` tag or load it with `<script src>`, before your game script, and do not edit it.

**What it owns:** the battle clock and every combatant's gauge (fill rate, haste and slow). It also owns the ready line of heroes waiting for a menu and the shared action queue. The queue keeps playing in Active mode while a menu is open. Wait mode stops the clock while a menu is open, but your menu still takes input. At battle end the module empties the queues and closes the menu, and it never indexes an empty list. It also draws the gauges, enemy gauges and mode plate at native resolution.

**What your game owns:** combatant data, HP and death, menus, damage, animations and text.

## API

`var atb = GameDNA_ATB.create(options)`

| option | meaning |
|---|---|
| `combatants` | `[{id, side: 'party'|'enemy', speed}]`, speed 10–60 |
| `mode` | `'active'` (default) or `'wait'` |
| `speed` | gauge multiplier 0.5–2 (default 1) |
| `partyStatus` | `'none'` / `'haste'` / `'slow'` for the whole party |
| `seed`, `startSpread` | starting gauges = seeded random 0..startSpread (default 0.55) |
| `isAlive(id)` → bool | your truth; the module checks it every update |
| `onHeroReady(id)` | open your command menu for this hero, one at a time |
| `onMenuCancel(id, why)` | close that menu: the hero died (`'dead'`) or the battle ended (`'end'`) |
| `chooseEnemyAction(id)` → action or null | your enemy AI; `action.target` is optional |
| `performAction(action, done)` | play the action (damage at your hit frame), then call `done()` once |
| `onBattleEnd(result)` | `'win'` or `'lose'`; queues are already empty and the menu is closed |

| method | meaning |
|---|---|
| `update()` | exactly one 60 Hz tick. Call it once per fixed step, every step, whether or not a menu is open. `update(dtMs)` runs as many ticks as fit in `dtMs`. |
| `submit(heroId, action)` | the menu's hero confirms. `{defend: true}` applies at once without queueing. The module sets `action.actor`. |
| `menuClosed()` | only if your menu closes without a submit |
| `set({mode, speed, partyStatus})` | change parameters live |
| `setSpeed(id, s)` | change one combatant's speed |
| `setStatus(id, 'haste'|'slow'|null, seconds = 20)` | timed status, counted on the battle clock |
| `get(id)` | `{gauge 0..1, state: 'charge'|'ready'|'queued'|'acting'|'dead', status, defending}` |
| `clockRuns()`, `isOver()`, `menuHero()`, `acting()`, `queue()`, `ready()` | state queries |
| `ticksToFull(speed, status)` | 180 / 120 / 360 for speed 30 at ×1 (none / haste / slow) |
| `flashAlpha(id)` | 0.4 or 0 during an enemy's first 18 action frames: draw a white sprite overlay at that alpha |
| `layoutRow({x, y, nameW, hpW, right, h = 6, gap = 6, minGauge = 40})` | returns `{nameX, hpRight, gauge: {x, y, w, h}}`, or `null` if the gauge would be under 40 px. The parts never overlap. |
| `drawGauge(ctx, id, x, y, w, h)` | one hero gauge |
| `drawEnemyGauges(ctx, [{id, x, footY}], fieldH)` | 22×4 bars under the enemy sprites |
| `drawModePlate(ctx, x, y)` | an `ACTIVE x1.0` / `WAIT x1.0` plate, with pause bars after the text while the wait clock is stopped; returns `{w, h}` |

**Rules:** each tick adds `gauge += (speed + 20) * speed× * (1.5 haste | 0.5 slow | 1) / 9000`. When a hero fills, it joins the ready line. When an enemy fills, it chooses an action, which is queued. One action plays at a time. After it plays, the actor's gauge returns to 0. A dead target is retargeted to the first living combatant on that side. An action whose actor died is dropped.

## Integration (15 lines)

```js
// in your tick (fixed 60 Hz): menu input and the current animation ALWAYS run; then the module
function tick() { if (menuOpen) handleMenuInput(); if (anim) stepAnim(); atb.update(); }
var atb = GameDNA_ATB.create({
  mode: 'active', speed: 1, partyStatus: 'none',
  combatants: units.map(function (u) { return { id: u.id, side: u.side, speed: u.speed }; }),
  isAlive: function (id) { return byId(id).hp > 0; },
  onHeroReady: function (id) { openMenu(id); },
  onMenuCancel: function () { closeMenu(); },
  chooseEnemyAction: function (id) { var t = randomLivingHero(); return t ? { cmd: 'attack', target: t.id } : null; },
  performAction: function (a, done) { startAnim(a, done); },   // call done() when the animation ends
  onBattleEnd: function () { closeMenu(); }
});
// menu confirm:  closeMenu(); atb.submit(heroId, { cmd: 'attack', target: id });   defend: atb.submit(heroId, { defend: true })
// HUD row:       var L = atb.layoutRow({ x: nameX, y: rowY, nameW: maxNameW, hpW: textW('9999'), right: rightLimit });
//                drawText(hp, L.hpRight - textW(hp), rowY); atb.drawGauge(ctx, id, L.gauge.x, L.gauge.y, L.gauge.w, L.gauge.h);
// field:         atb.drawEnemyGauges(ctx, enemies.map(e => ({ id: e.id, x: e.x, footY: e.y })), FIELD_H); atb.drawModePlate(ctx, 4, 4);
```

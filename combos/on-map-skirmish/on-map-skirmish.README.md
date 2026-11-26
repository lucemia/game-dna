# on-map-skirmish (A-18) module

`on-map-skirmish.js`, one classic script, global `GameDNA_OnMapSkirmish`, ASCII only, no dependencies. The attack exchange
plays on the map: the game's own small units fight in place. The game resolves the exchange; the module stages it.
Alternative to A-04 clash-cutin (side-view cut-in): same family `battle-cutin`, use one or the other.

## API

| call | what |
|---|---|
| `GameDNA_OnMapSkirmish.create(opts)` | `opts.view` `{x, y, w, h}`: the play area in native px (plates live inside it). `params` (below). `getObstacles()` -> rects `{id, x, y, w, h}` of the OTHER units (and props whose top must stay visible), screen px as drawn. `uiRects()` -> HUD rects to keep clear. Optional `camera()` -> `{x, y}`: then unit boxes are world px and screen = world - camera. Optional `cssPerPx` (number or function): CSS px per native px, for the 10 CSS px text rule (default: canvas `clientWidth / width`). `onImpact(e)` |
| `GameDNA_OnMapSkirmish.order({attSpd, defSpd, gap, counter})` | strike order the module expects: `['att', 'def']` plus a follow-up for the side at least `gap` (default 4) faster; `counter: false` when the defender cannot answer |
| `play({attacker, defender, strikes, after, onDone, onImpact})` | each unit `{id, name, team: 'a' \| 'b' \| 'n', hp (before), max, box: {x, y, w, h} (sprite box as drawn now), boss?}`; `strikes` `[{by: 'att' \| 'def', result: 'hit' \| 'miss' \| 'crit', dmg}]` in order; `after` `{att, def}` = the game's HP after. Returns false when busy or invalid |
| (spacing) | for every exchange the module steps the two fighters apart along the attack axis so their drawn boxes never overlap (>= lunge + 1 px at rest), and eases them back at the close; the game's positions are never changed, so do not re-space units yourself |
| `update(dtMs)` | advances the scene clock; everything on screen is a function of this clock (`?t=&freeze=1` safe) |
| `drawActor(ctx, id, art, x, y, o)` | draw a unit where the game draws it. During an exchange it adds the lunge / knock-back / sidestep / brace offset, faces the opponent, flashes a solid white silhouette (offscreen layer + source-atop, opaque) for `flash` frames, then an opaque red-tinted hurt pose (or `art.hurt`), and dissolves a knocked-out unit. `art` = image \| `{idle, attack, hurt, ...}` \| `{left: {...}, right: {...}}` (painted per side) \| `fn(pose, side, dir4)`. `o.native`: side a single image looks at (the module mirrors it to face the target); `o.facing`: side outside an exchange; `o.flip`: the game's own mirror. Returns true when drawn |
| `draw(ctx)` | sparks, swish arcs, KO shards, numbers / MISS, both HP plates. Screen space, after the HUD |
| `busy()`, `fighting(id)`, `facing(id)`, `dir(id)`, `offset(id)`, `gone(id)` | `gone(id)`: knocked out by the last exchange (skip the game's own fade) |
| `key(k)`, `tap()`, `skip()`, `speed()` | Z / Enter / tap skip to the end tableau, X toggles x2 (`keys: 'off'` disables) |
| `state()`, `stats()`, `clear()`, `setParams(p)` | `state()`: phase, strike, actors (offset, pose, flash, hurt, facing, shown HP), plates, labels, sparks, swish, final |

Params (element.json): `speed` 1/2, `lunge` 2-3 px, `knock` 0-3 px, `flash` 2-3 frames, `drain` ms, `hold` ms, `gap` (follow-up
speed gap), `standoff` (px a unit stands back from a wide boss), `plates` bottom/top (preferred edge), `text` auto/1/2, `keys`.

## Integration (generic)

```js
const sk = GameDNA_OnMapSkirmish.create({ view: { x: 0, y: 0, w: W, h: MAP_H },
  getObstacles: () => units.filter(u => u.alive).map(u => ({ id: u.id, x: u.sx, y: u.sy, w: u.w, h: u.h })),
  uiRects: () => [hudRect] });
function attack(att, def, then) {                       // the game's existing attack step
  const r = resolveExchange(att, def);                  // the game's own rules, same random calls as before
  restoreHp(att, def, r.before);                        // the map keeps the old HP until the plates have drained
  sk.play({ attacker: unitInfo(att), defender: unitInfo(def), strikes: r.strikes, after: r.after,
    onDone: res => { att.hp = res.att; def.hp = res.def; then(); } });
}
function step(dt) {
  if (sk.busy()) { for (const k of humanKeys()) sk.key(k); sk.update(dt); return; }   // world, AI and autoplay paused
  /* ... the game's step ... */
}
// in the unit loop: sk.drawActor(ctx, u.id, u.image, x, y, { native: 'right', facing: u.lookSide });
// after the HUD:    sk.draw(ctx);
```

## Self-check without a browser

1. The module is byte-identical and loads before the game script uses it.
2. For one exchange: HP before minus the strikes' `dmg` per target (clamped at 0) equals `after`, which `onDone` applies.
3. Every unit draw goes through `drawActor` (otherwise the lunge, flash and knock-back never show).
4. While `busy()` the step returns early; autoplay inputs are not forwarded (they would skip every exchange).
5. `getObstacles()` excludes nobody but returns the other units' sprite boxes in the same space as `box`.

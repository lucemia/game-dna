# damage-numbers.js (E-01 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_DamageNumbers`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns everything about the numbers: glyph tables (digits, `+`, letters), bounce, stagger and fade, the six kinds, placement (stacking, folding, the wait queue) and drawing. Your game keeps its own state and tells the module where things are.

## API

`GameDNA_DamageNumbers.create(options)` returns an instance.

| option | meaning |
|---|---|
| `bounds` | Play field `{x, y, w, h}` in native pixels. Numbers stay inside it, so keep it above the HUD. |
| `getAnchor(id)` | Returns `{x, top, w, h}` for a target: centre x, top y of its sprite, and the sprite box size. **Keep returning the unit's position while it is dying or dead** (do not return `null` for HP 0): the module caches it per id, so killing-blow numbers stay above the unit. The module also remembers every sprite rect with an `id` from `getObstacles()` each frame as a fallback. If a target dashes away to attack, return its home spot. |
| `getObstacles()` | Returns an array of rects `{x, y, w, h}`. Give sprites an `id`: they are never covered, and the column above another sprite's head stays clear. A rect without an `id` (banner, windows) is never covered. A rect with `soft: true` (a torch or lamp) is avoided when there is room. |
| `params` | Any of `bounce` 10, `duration` 1000, `stagger` 40, `hitstop` 60, `scale` 1, `scheme` 'classic', `crit` 'burst', `stack` 'on', `outline` 1, `gap` 4, `dense` 'auto'. `dense` ('auto', 'on' or 'off') controls the tight search used when tile-sized units (≤ 20×24) stand next to each other; 'auto' detects it per hit. |
| `onHitStop(ms)` | Called on damage and critical hits. Freeze your world that long (60 ms, or 120 ms for a critical). |
| `onShake(px, ms)`, `onFlash(alpha, ms)` | Called for critical hits. Shake the field; flash it white. |
| `skin` | Optional. A skin id or object for `GameDNA_Skin.resolve()` (`skins/skin-api.js`). When skin-api is loaded, every glyph, colour, outline and the CRITICAL label are drawn by `skin.number()`, and glyph sizes are measured through it, so placement fits each style's metrics. The default is `pixel16`, which is pixel-identical to the built-in drawing. Without skin-api the module draws its built-in 16-bit glyphs. `skin: false` forces the built-in drawing. |

| method | |
|---|---|
| `spawn(targetId, amount, kind, opts?)` | `kind` is `'damage'`, `'crit'`, `'heal'`, `'miss'`, `'mp'` or `'status'`. Pass the HP **actually lost or gained after clamping** (an overkill of 9 on a unit with 8 HP left shows 8), not the raw attack value. For `'status'`, `amount` is the word, e.g. `'POISON'`. Call it on the frame the hit lands. `opts.anchor` (`{x, top, w, h}`) can give the spot directly. With no anchor at all the number is skipped with one console warning; it never appears at the field centre. |
| `update(dtMs)` | Pass world time. Pass `0` while hit-stop freezes the game. |
| `draw(ctx, offsetX = 0, offsetY = 0)` | Draws at native resolution. Call it after sprites and effects, before banner and HUD, inside your screen-shake translate. |
| `setParams(obj)`, `clear()`, `count()`, `lastDrawn()`; option `debug(info)` | `setParams` changes params live. `clear()` removes all numbers; call it at the **start** of a battle or wave (before spawning refill or heal numbers). Numbers spawned since the last `update()` survive it anyway. `count()` counts numbers on screen (including waiting ones); `lastDrawn()` returns the glyph rects of the last draw (for tests). The optional `debug` callback receives each placement decision (target, text, path, offset) and events: `fold`, `requeue`, `retire` (ended early after 60 % of its life), `drop` (should never happen) and `skip` (no anchor). |

## Integration (15 lines)

```js
// <script src="damage-numbers.js"></script> before your game script
const DN = GameDNA_DamageNumbers.create({
  bounds: { x: 0, y: 0, w: 256, h: 156 },
  getAnchor: id => { const a = actorById(id); return a && { x: a.x, top: a.y - a.height, w: a.width, h: a.height }; },   // dead units too
  getObstacles: () => actors.filter(a => !a.dead).map(a => ({ x: a.x - a.width / 2, y: a.y - a.height, w: a.width, h: a.height, id: a.id })),
  onHitStop: ms => { hitStop = Math.max(hitStop, ms); },
  onShake: () => startShake(), onFlash: () => {}
});
function applyHit(target, amount, kind) {            // your existing hit function: keep its body, add one line
  const hpBefore = target.hp; /* ... existing HP code ... */
  DN.spawn(target.id, kind === 'status' ? 'POISON' : Math.abs(hpBefore - target.hp) || amount, kind);   // real drop after clamping
}
function step(dt) { if (hitStop > 0) { hitStop -= dt; DN.update(0); return; } /* world */ DN.update(dt); }
function render() { /* background, sprites, effects */ DN.draw(ctx); /* banner, HUD */ }
// battle or wave START (before any refill/heal spawns): DN.clear();
```

## What it guarantees

- A killing-blow number appears above the dying unit (its anchor is cached), never at the field centre.
- A number appears on the frame `spawn` is called. The only exception: while a number of the **same** target is still young, a new one may wait up to 900 ms. Neighbouring sprites never delay a number.
- If there is no free spot, the number is drawn at 1× at its target's own spot: inside or right beside its own box. It may cover its own sprite or tile, but never a neighbour's. Combo hits fold only into the same target's number, and the total stays with that target.
- A number is never closer to another unit than to its own target (2 px margin). Every other unit's rect counts as its footprint, plus an HP-bar band below it: 8 px, or 2 px for units up to 20×24, whose bars usually sit inside the tile. If your HP bars or name plates sit elsewhere, add them to `getObstacles()` as extra rects with the unit's `id`.
- Numbers are checked again every frame. If a unit walks or dashes onto one, it moves.
- No number is deleted before it has been readable. A number that loses its spot is moved first, then shrunk to 1×, then folded into the same target's total, then hidden and shown again with its full life as soon as there is room. Only a number already past 60 % of its life may end early. `clear()` still removes everything.
- Guarded by the cross-host audit in `checks/hosts/` (four real integrations plus the demo, all 0).
- Two numbers never touch. A number never covers a sprite, a rect without an `id`, or the column above another target's head.
- Combo hits fold into one total when there is no room.
- `+` comes first on heals. Words use the letter font, never the digit table. `MP` sits on the digits' baseline.

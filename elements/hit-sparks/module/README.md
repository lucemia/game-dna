# hit-sparks.js (E-02 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_HitSparks`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns all of the effect: hit shapes (slash, star, cross spark, ring shockwave), pooled spark particles with gravity, the four palette-cycled spell bursts (fire, ice, thunder, heal), the critical variant (bigger, 3-frame white flash, hit-stop and shake requests), and drawing. Your game keeps its own state and only tells the module where hits land.

Optional look: load `skin-api.js` and a skin (e.g. `pixel16.js`) before it and pass `skin`. Without them it draws with a built-in copy of the `pixel16` look, so a lone module still works.

## API

`GameDNA_HitSparks.create(options)` returns an instance.

| option | meaning |
|---|---|
| `view` (or `bounds`) | Screen rect `{x, y, w, h}` in native canvas pixels that effects may cover. End it above your HUD. Default: the whole canvas. Any native resolution works. |
| `seed` | Integer. Same seed + same calls on the same frames = the same pixels, so `?t=…&freeze=1` shots are stable. Default 1. |
| `skin` | Skin id or object (needs `GameDNA_Skin`). Omit for `pixel16`. |
| `params` | Any of `size` 1, `life` 14 (hit length in 60 Hz frames), `sparks` 8, `gravity` 0.15 (px/frame²), `hitstop` 50 (ms, ×2 on criticals, 0 = off), `shake` 2 (px, criticals), `critFlash` 'screen' \| 'host' \| 'local' \| 'off', `style` 'auto', `cycle` 2 (frames per palette step), `cap` 192 (hard particle cap), `reach` 32 (px). |
| `getObstacles()` | Optional. Unit rects `{x, y, w, h, id}` in the **same coordinates you pass to `hit`**. Effects shrink and sparks die before they touch any unit other than the hit's `target` and `from`. |
| `uiRects` | Optional array or function → screen rects `{x, y, w, h}` (HUD, banner, menus). Never drawn over. |
| `getAnchor(id)` | Optional. `{x, y}` (or `{x, top, w, h}`) for a target id. Used when `hit`/`burst` get no valid x, y, and to make bursts follow their target as it bobs or moves (jumps over 64 px are ignored). |
| `onHitStop(ms)` | Called on every hit (if `hitstop` > 0). Freeze your world that long; call `update(0)` meanwhile. |
| `onShake(px, ms)` | Called on criticals (if `shake` > 0). |
| `onFlash(alpha, ms)` | Called on criticals only when `critFlash` is `'host'` (you flash the screen yourself). |

All callbacks may be missing; an exception inside one is caught and logged once.

| method | |
|---|---|
| `hit(x, y, opts)` | A strike landed at the contact point `(x, y)`. `opts = {kind, dir, crit, element, target}`: `kind` `'auto'` (slash when `dir` is given, else star) \| `'slash'` \| `'star'` \| `'spark'` \| `'ring'`; `dir` `1` (strike travels right), `-1` (left) or `{x, y}`; `crit` true for the critical variant; `element` `'fire'` \| `'ice'` \| `'thunder'` \| `'heal'` tints the hit; `target` = the hit unit's id (lets the effect cover its own target); `from` = the attacker's id (the effect may also cover the attacker, so close melee is not shrunk to the minimum). `x` may also be a rect, whose centre is used. Returns an effect id, or `null` when skipped. |
| `burst(x, y, element, opts)` | A spell landed: `'fire'`, `'ice'`, `'thunder'` (bolt from the top of `view`, at least 48 px above the target) or `'heal'` (rising motes, ground ring). `(x, y)` = the target's body centre. `opts = {target, from, big}`. Aliases like `'bolt'`, `'frost'`, `'cure'` are accepted. Bursts do not request hit-stop; add a `hit(…, {kind: 'spark', element})` if the spell also damages. |
| `update(dtMs)` | World time in ms. Pass `0` while hit-stop freezes the game. Internally steps at fixed 60 Hz, so any dt split gives the same result. |
| `draw(ctx, offsetX = 0, offsetY = 0)` | Draws at native resolution. Call after sprites, before HUD and banners, inside your shake translate. Scrolling world: pass `-cameraX, -cameraY` (or whatever turns hit coordinates into screen pixels). Never throws. |
| `clear()` | Removes everything (call at scene / battle / level start). |
| `setParams(obj)`, `count()`, `particles()`, `busy()`, `lastDrawn()` | Live params; effects alive; sparks alive; anything still animating; the effect rects drawn last frame `{x, y, w, h, owner, kind}` (screen px, for tests). |

## Integration (15 lines)

```js
// <script src="hit-sparks.js"></script> before your game script (optional: skin-api.js + pixel16.js first)
const fx = GameDNA_HitSparks.create({
  view: { x: 0, y: 0, w: 256, h: 152 }, seed: 1,                           // play field above the HUD
  getObstacles: () => units.filter(u => u.alive).map(u => ({ x: u.x - u.w / 2, y: u.y - u.h, w: u.w, h: u.h, id: u.id })),
  uiRects: () => [hudRect],
  onHitStop: ms => { freezeMs = Math.max(freezeMs, ms); },
  onShake: (px, ms) => startShake(px, ms)
});
function applyDamage(target, amount, info) {             // your existing hit function: keep its body, add a line
  /* ... existing HP code ... */
  fx.hit(info.x, info.y, { dir: info.facing, crit: info.crit, target: target.id, from: info.attacker.id });
}
function castSpell(target, element) { /* ... */ fx.burst(target.x, target.y - target.h / 2, element, { target: target.id }); }
function step(dt) { if (freezeMs > 0) { freezeMs -= dt; fx.update(0); return; } /* world */ fx.update(dt); }
function render() { /* background, sprites */ fx.draw(ctx, -camX, -camY); /* banner, HUD */ }   // 0, 0 without a camera
// level / battle START: fx.clear();
```

## Keep the rest of the game working

Hook, don't replace: add one call at each place a hit or spell **lands**, keep every existing function, name and caller. Before you finish, find every caller of what you touched: autoplay / demo mode (`?auto=1`), `?t=<ms>&freeze=1` fast-forward (it must step the same fixed update, so effects show in frozen shots), keyboard shortcuts, pause, restart / new game. Hit-stop must pause only the world step, never input handling or the title / result screens, and must not change who wins under autoplay. The module reads no input and adds no listeners.

## Self-check without a browser

- The module file is byte-identical to the one you were given; it is loaded before the first `create`.
- List every place damage or healing is applied (melee, projectiles, spells, items, enemy attacks, contact damage): each calls `fx.hit` or `fx.burst` exactly once, on the impact frame, with a point on the target's body in the same coordinates as `getObstacles`.
- `fx.update` is called once per fixed step (0 while frozen), `fx.draw` once per rendered frame, including the single frame drawn by `?freeze=1`.
- Walk one critical: `fx.hit(…, {crit: true})` → `onHitStop(100)` sets your freeze → `update(0)` while frozen, world skipped → normal steps resume; `onShake` shakes only the field.
- `fx.clear()` runs at scene / battle / level start; nothing else was removed or renamed.

## What it guarantees

- Effects appear on the frame `hit`/`burst` is called (also on the first frozen hit-stop frame) and never at the screen centre: a call without a valid point uses `getAnchor`/the last known spot of that `target`, else it is skipped with one warning.
- No effect reaches another unit from `getObstacles()` (2 px margin); it shrinks (min 6 px) instead. Sparks that would enter another unit's rect vanish.
- Nothing is drawn over `uiRects` or outside `view`.
- At most `cap` particles and 32 effects exist; when full, the oldest sparks are recycled.
- Deterministic: all randomness comes from `seed` and the call order.

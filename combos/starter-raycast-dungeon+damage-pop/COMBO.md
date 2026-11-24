# Add modern damage numbers to the Hollowstair starter

`index.html` is a complete game built on the raycast dungeon element; build on it. `index.README.md` documents its extension points. Add:

- `damage-pop.js` (one global, `GameDNA_DamagePop`), API in `damage-pop.README.md`

## Rules

1. **Modules verbatim:** load each addon module in the ADDONS SLOT `<script>` (pasted unchanged) or as `<script src>` tags right above it. Never edit a module or the starter's own systems; add code only through the extension points.
2. **Register each addon** as one object: push it onto `GAME.addons` in the ADDONS SLOT `<script>` of `index.html` (it runs before the game boots, so addons see the first floor and every `?t=` frame) (hooks: `onHit(hit, game)`, `onKey(key, game)`, `update(game, info)`, `draw(g, layer, game)`, `drawUI(g, game)`, `onFloorStart(ev, game)`, `onTurn`, `onPickup`, `onDeath`, `onEvent`, `onEnd(result, info, game)`, `onScene`, `onNewGame`). New monsters, items and hand-made floors go in the same slot through `GAME.addEnemy(id, def)`, `GAME.addItem(id, def)`, `GAME.addMap(id, def)` (`GAME.shipped` is a read-only record of the built-in ids: never write to it). **Unit positions:** an addon that places anything on or beside a unit must use the live `GAME.anchor(id)` (monster ids `e12`; `'hero'` is the first-person sword at the lower right), skip anchors with `hidden: true`, and avoid `GAME.unitRects()` and `GAME.uiRects()`, staying inside `GAME.fieldRect()`.
3. **Turn off the starter's built-in equivalent** of each addon (check its README flags); otherwise both draw. Here: the module draws its own combat labels beside the defender, so put `GAME.params.numbers = 'off';` first in the ADDONS SLOT `<script>` (this overrides the damage-pop README's integration advice).
4. **Keep everything working:** `?auto=1`, `?t=<ms>&freeze=1`, `?seed=`, `?floors=`, `?fov=`, `?fog=`, `?minimap=`, arrows / WASD, Q / E turns, A / D steps aside, Z, Space, C, M, P, taps on the view, the minimap and the tonic icon, the touch pad, `GAME.held`. Addons advance only in the `update` hook (never on real time), so `?t=` fast-forward shows them; consume no game key.
5. Keep the native resolution and integer scaling; anything new you draw or name is original (no real game, character, place or brand names).

## Modern damage numbers

2020s damage numbers: each hit arcs out of the target and lands, crits pop with a big overshoot, a burst and a short shake, rapid hits on one target roll into one punching total (12 → 47 → 83), every damage type has its own colour and a small procedural icon, misses and blocks are small words, big numbers stay on top, and nothing lands on another unit or the UI. Smooth bold sans on HD canvases, a crisp 1-bit raster on native pixel canvases. Replaces E-01 bouncing numbers (use one or the other).

**Parameters:** `size` = 0, `duration` = 1100, `arc` = 1, `punch` = 0.6, `merge` = 600, `hitstop` = 50, `palette` = vivid, `icons` = on, `crit` = burst, `render` = auto, `stack` = on.

Wire it through the extension points above; the API is in `damage-pop.README.md`.

## Checks

- [Modern damage numbers] A hit shows its number on the hit frame, arcing up and landing above the target, then fading.
- [Modern damage numbers] Three quick hits of one type on one target show one rolling total that punches on each add; a crit is bigger with a burst; heals green `+n`; `MISS` / `BLOCK` as small words; type colours and icons.
- [Modern damage numbers] No number touches another unit, its HP bar, a window, a banner or another number; big numbers are never covered by small ones.
- `?auto=1` still reaches THE MIRE KING IS BROKEN, with the addons working on every relevant event; `?t=<ms>&freeze=1` shows them mid-game; no built-in duplicates; no console errors.

## Self-check without a browser

- Each module file is byte-identical to the one given: `damage-pop.js` sha256 `a605a213fceb55b2...`.
- `node --check` your addon script (copy an inline script to a temp .js). Outside the registration slot, the starter is unchanged (diff it).
- Trace one autoplay event from the hit site (`onHit` of an autoplay run: the hero hitting a slime, a slime hitting the hero, a miss on a bat, a crit on the Mire King) through your addon hooks to the draw, and say which hooks you added.

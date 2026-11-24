# Add modern damage numbers to the Lantern Road starter

`index.html` is a complete game built on the card battle with intents element; build on it. `index.README.md` documents its extension points. Add:

- `damage-pop.js` (one global, `GameDNA_DamagePop`), API in `damage-pop.README.md`

## Rules

1. **Modules verbatim:** load each addon module in the ADDONS SLOT `<script>` (pasted unchanged) or as `<script src>` tags right above it. Never edit a module or the starter's own systems; add code only through the extension points.
2. **Register each addon** as one object: push it onto `GAME.addons` in the ADDONS SLOT `<script>` of `index.html` (it runs before the game boots, so addons see the first fight and every `?t=` frame) (hooks: `onHit(ev, game)`, `onKey(key, game)`, `update(game, info)`, `draw(g, layer, game)`, `drawUI(g, game)`, `onBattleStart(game)`, `onBattleEnd(result, info, game)`, `onEvent`, `onPlay`, `onTurn`, `onScene`, `onReward`, `onNewGame`). New cards, foes and statuses go in the same slot through `GAME.addCard(id, def, {deck, pool})`, `GAME.addEnemy(id, def, {fight})`, `GAME.addStatus(id, def)`. **Unit positions:** an addon that places anything on or above a unit must use the live `GAME.anchor(id)` (the hero is `'hero'`, its portrait) and avoid `GAME.unitRects()`, `GAME.uiRects()` (cards in hand, panels, banner) and each living foe's intent tag taken live: `uiRects()` is the last drawn frame, so it has no tags before a fight's first frame (a `?t=` fast-forward); for each `f` of `GAME.C.foes()` with `f.hp > 0 && GAME.C.intentOf(f.id)`, `a = GAME.anchor(f.id)`, `tip = Math.max(a.top - 4, 64)`, reserve `{x: a.x - 50, y: tip - 34, w: 100, h: 36}` (`intentRects()` in index.README.md "Adding damage numbers").
3. **Turn off the starter's built-in equivalent** of each addon (check its README flags); otherwise both draw.
4. **Keep everything working:** `?auto=1`, `?t=<ms>&freeze=1`, `?seed=`, `?speed=`, keys E (end turn) and P (autoplay), drag and tap play, `GAME.held`. Addons advance only in the `update` hook (never on real time), so `?t=` fast-forward shows them; consume no game key.
5. Keep the native resolution and integer scaling; anything new you draw or name is original (no real game, character, place or brand names).

## Modern damage numbers

2020s damage numbers: each hit arcs out of the target and lands, crits pop with a big overshoot, a burst and a short shake, rapid hits on one target roll into one punching total (12 → 47 → 83), every damage type has its own colour and a small procedural icon, misses and blocks are small words, big numbers stay on top, and nothing lands on another unit or the UI. Smooth bold sans on HD canvases, a crisp 1-bit raster on native pixel canvases. Replaces E-01 bouncing numbers (use one or the other).

**Parameters:** `size` = 0, `duration` = 1100, `arc` = 1, `punch` = 0.6, `merge` = 600, `hitstop` = 50, `palette` = vivid, `icons` = on, `crit` = burst, `render` = auto, `stack` = on.

Wire it through the extension points above; the API is in `damage-pop.README.md`.

## Checks

- [Modern damage numbers] A hit shows its number on the hit frame, arcing up and landing above the target, then fading.
- [Modern damage numbers] Three quick hits of one type on one target show one rolling total that punches on each add; a crit is bigger with a burst; heals green `+n`; `MISS` / `BLOCK` as small words; type colours and icons.
- [Modern damage numbers] No number touches another unit, its HP bar, a window, a banner or another number; big numbers are never covered by small ones.
- `?auto=1` still walks the whole road to THE ROAD IS LIT (or THE LANTERN GOES OUT), with the addons working on every relevant event; `?t=<ms>&freeze=1` shows them mid-game; no built-in duplicates; no console errors.

## Self-check without a browser

- Each module file is byte-identical to the one given: `damage-pop.js` sha256 `a605a213fceb55b2...`.
- `node --check` your addon script (copy an inline script to a temp .js). Outside the registration slot, the starter is unchanged (diff it).
- Trace one autoplay event from the hit site (`onHit` of an autoplay fight: one hit on a foe, one foe hit on the hero partly absorbed by ward) through your addon hooks to the draw, and say which hooks you added.

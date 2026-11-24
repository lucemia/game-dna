# Add toasts & unlock pop-ups to the Harbour Charter starter

`index.html` is a complete game built on the wave-collapse town builder (3d) element; build on it. `index.README.md` documents its extension points. Add:

- `toasts.js` (one global, `GameDNA_Toasts`), API in `toasts.README.md`

## Rules

1. **Modules verbatim:** load each addon module in the ADDONS SLOT `<script>` (pasted unchanged) or as `<script src>` tags right above it; three.js is already loaded. Never edit a module or the starter's own systems; add code only through the extension points.
2. **Register each addon** as one object: push it onto `GAME.addons` in the ADDONS SLOT `<script>` of `index.html` (it runs before the game boots, so addons see the first frame and every `?t=` replay) (hooks: `onEdit(ev, game)`, `onGoal(goal, game)`, `update(game, info)`, `draw(ctx, game)`, `drawUI(ctx, game)`, `scene3d(THREE, scene, game)`, `onKey(e, down, game)`, `onScene`, `onEnd`, `onNewTown`). New tiles, socket pairs and goals go in the same slot: `GAME.addTile({id, slot, sides, rotate, weight, build(api, info)})`, `GAME.addPair(a, b)`, `GAME.allowAir(s)`, `GAME.addGoal({id, label, need, count: counts => n})`.
3. **Turn off the starter's built-in equivalent** of each addon (check its README flags); otherwise both draw.
4. **Keep everything working:** `?auto=1`, `?t=<ms>&freeze=1`, `?seed=`, `?palette=`, `?yaw=`, `?pitch=`, `?zoom=`, `?shadows=`, keys arrows / WASD, Z, X, Tab, U, Y, Ctrl+Z / Ctrl+Y, Q / E, + / -, C, 1-4, P (autoplay), R, toolbar buttons, drag-orbit and wheel. Addons advance only in the `update` hook (never on real time), so `?t=` fast-forward shows them; consume no game key.
5. Keep the native resolution and integer scaling; anything new you draw or name is original (no real game, character, place or brand names).

## Toasts & unlock pop-ups

Achievement, quest-update and item-get notices slide in from a screen edge, stack and glide, leave on a visible timer line, merge duplicates into one card with a punching ×N badge (quest progress updates one card in place), and queue behind a "+N more" chip when more arrive than fit. They keep to a safe area, step around every HUD rect the game reports, hide while a window covers their place and come back after, and never pause the game or take input. Glassy cards on HD canvases, a crisp pixel card with its own bitmap fonts on native pixel canvases.

**Parameters:** `edge` = top-right, `max` = 3, `hold` = 2800, `merge` = on, `enter` = slide, `size` = 0, `margin` = 0, `theme` = dusk, `progress` = on, `more` = on, `render` = auto.

Wire it through the extension points above; the API is in `toasts.README.md`.

## Checks

- [Toasts & unlock pop-ups] An event shows one card sliding in from the chosen edge (label, title, icon); it leaves by itself.
- [Toasts & unlock pop-ups] The same item three times shows one card with ×3; quest progress updates one card.
- [Toasts & unlock pop-ups] A burst of five events shows `max` cards plus "+N more"; the rest follow. No card covers HUD, windows or another card; the game never pauses for a toast.
- `?auto=1` still meets every goal and reaches Charter Granted (`GAME.result === 'charter'`), with the addons working on every relevant event; `?t=<ms>&freeze=1` shows them mid-game; no built-in duplicates; no console errors.

## Self-check without a browser

- Each module file is byte-identical to the one given: `toasts.js` sha256 `25c4b74cf2a237cb...`.
- `node --check` your addon script (copy an inline script to a temp .js). Outside the registration slot, the starter is unchanged (diff it).
- Trace one autoplay event from the bot's `act()` call in `botStep()` -> `GAME.v.grow` -> `afterEdit` -> `onEdit` -> `checkGoals` -> `onGoal` through your addon hooks to the draw, and say which hooks you added.

# Add  to the Thornvale starter

`index.html` is a complete game built on the real-time sword combat element; build on it. `index.README.md` documents its extension points. Add:


## Rules

1. **Modules verbatim:** load each addon module in the ADDONS SLOT `<script>` (pasted unchanged) or as `<script src>` tags right above it. Never edit a module or the starter's own systems; add code only through the extension points.
2. **Register each addon** as one object: push it onto `GAME.addons` in the ADDONS SLOT `<script>` of `index.html` (it runs before the game boots, so addons see the first room and every `?t=` frame) (hooks: `gate(game)`, `beforeHit(ev, game)`, `onHit(ev, game)`, `onDefeat(enemy, ev, game)`, `onKey(key, game)`, `update(game, info)`, `draw(g, layer, game)` with layers `begin | ground | fx | end | overlay`, `wrapSprite(g, id, rect, drawFn, game)`, `onRoomStart(roomId, game)`, `onPhase`, `onEvent`, `onEnd`).
3. **Turn off the starter's built-in equivalent** of each addon (check its README flags); otherwise both draw.
4. **Keep everything working:** `?auto=1`, `?t=<ms>&freeze=1`, `?seed=`, `?dirs=`, `?hearts=`, `?overlay=`, keys P (autoplay), H (hitboxes), Esc (pause). Addons advance only in the `update` hook (never on real time), so `?t=` fast-forward shows them; consume no game key.
5. Keep the native resolution and integer scaling; anything new you draw or name is original (no real game, character, place or brand names).

## Checks

- `?auto=1` still clears all four rooms and reaches THE VALE IS SAFE, with the addons working on every relevant event; `?t=<ms>&freeze=1` shows them mid-game; no built-in duplicates; no console errors.

## Self-check without a browser

- Each module file is byte-identical to the one given: .
- `node --check` your addon script (copy an inline script to a temp .js). Outside the registration slot, the starter is unchanged (diff it).
- Trace one autoplay event from the hit site (`onHit` of an autoplay sword hit and of a contact or projectile hit on the hero) through your addon hooks to the draw, and say which hooks you added.

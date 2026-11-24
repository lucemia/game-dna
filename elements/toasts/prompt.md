# Add toasts and unlock pop-ups to my game

Defaults (change any before pasting):
`{{edge}}` = top-right · `{{max}}` = 3 · `{{hold}}` = 2800 · `{{merge}}` = on · `{{enter}}` = slide · `{{theme}}` = dusk · `{{progress}}` = on · `{{render}}` = auto

---

You are given `toasts.js` (finished module, global `GameDNA_Toasts`) and its `README.md`. **Include the module verbatim** (`<script src>` before my game script, or pasted unchanged into its own `<script>`); never edit it. It never pauses the game or reads input.

Add code; never delete or rename my functions, state fields, URL parameters or keys.

**Integration points** (find these places in my game):

1. **Create one instance** at startup, after the canvas size is known:
`toasts = GameDNA_Toasts.create({ bounds: { x: 0, y: 0, w: SCREEN_W, h: SCREEN_H }, uiRects, params: { edge: '{{edge}}', max: {{max}}, hold: {{hold}}, merge: '{{merge}}', enter: '{{enter}}', theme: '{{theme}}', progress: '{{progress}}', render: '{{render}}' } })`
   - `bounds`: the whole screen in my logical canvas pixels (not the backing store).
   - `uiRects()` returns `{x, y, w, h}` for everything of mine that must stay readable **right now**: HUD panels, minimap, objective line, captions, menus, windows, banners, the command panel. Use my draw code's numbers; only what is drawn now. If units stand under the stack's corner (a battle party, a tactics grid), also return their formation box so cards never hide them.
2. **Push** at the code that decides an event (not a per-frame check), once per event. Pick 4–8 events a player cares about:
   - `toasts.push('item', name, { rarity, icon })` for pickups, purchases, loot (icons: `leaf`, `potion`, `pouch`, `sword`, `coin`, `gem`, `heart`, `star`; same item again merges to `×N`; `'+{n} Coins'` with `{ key: 'coins', count: n }` sums);
   - `toasts.push('quest', title, { key: 'q-' + id, text: done + ' / ' + need, count: 0 })` only when that objective's count changes (one fixed key per quest; the card updates in place);
   - `'achievement'` for firsts and milestones, `'unlock'` for gates, areas, skills, `'level'` for level-ups, `'warning'` for low HP, `'info'` for area names. `text` = optional second line.
   If my game draws a one-line notice for the same event ("Bought X", "Level 2!"), stop drawing only that line (keep its variables). Phase banners, titles, captions and result screens ("WAVE CLEARED", "VICTORY") stay untouched.
3. **Update** in my fixed step, in every scene and while my menus are open: `toasts.update(stepMs)`.
4. **Draw** once per frame, last (after world, effects, HUD and windows), in screen coordinates outside any camera translate: `toasts.draw(ctx)`.
5. **New game / restart**: `toasts.clear(true)`.

**Keep every other caller working**: autoplay (`?auto=1` must finish with the same result), `?t=&freeze=1`, restart, pause, all keys and taps. Toasts must not change game state, timing or random numbers.

**Self-check without a browser**
- The module file is byte-identical to the one given.
- `toasts` exists before the first push.
- List each `push` and its event; none runs every frame while a condition holds.
- `uiRects()` covers every HUD element and window, in logical px, for every scene.
- Walk one event: `push` → `update` → `draw` last.

**Acceptance checks** (screenshots if you can)
1. An event shows a card sliding in from the {{edge}} edge with label, title and icon; it leaves by itself.
2. The same item three times quickly shows one card with `×3`; quest progress updates one card.
3. Five events at once: {{max}} cards plus "+N more".
4. No card covers HUD, windows, my headings or another card; the game never pauses.
5. `?auto=1` plays to the end with no console errors.

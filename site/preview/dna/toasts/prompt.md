# Add Toasts & unlock pop-ups to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `toasts.js` (one global, `GameDNA_Toasts`), API reference `toasts.README.md`

README example names are placeholders.

## Shared premises

1. **Include each module file verbatim; never edit it.** Load it with its own `<script src>` before the game's script, or paste it unchanged into its own `<script>` tag. If a module seems to need a change, adapt my game around it and tell me.
2. **Resolution:** keep my game's native resolution and integer scaling as they are. Call module draw functions on my 2D context inside the same transform as my sprites (one module pixel = one game pixel), and keep my game's own image-smoothing setting (off for pixel art, on for smooth or HD games; never switch it).
3. **Time:** drive every module from one fixed 60 Hz step (1000 / 60 ms). If my loop uses variable delta time, accumulate it and run whole steps (at most 250 ms per frame).
4. **Coordinates:** native screen pixels (world minus camera) unless a section says tiles.
5. **Art and names:** anything new you draw or name is original (no real game, character, place or brand names); English UI text; do not restyle my game.
6. **Hook, don't replace:** add calls or change bodies; never delete or rename a function.
7. **Keep every other caller working.** Find every caller and reader of what you change (turn order, input, moves, menus, HUD): autopilot/AI, test hooks, URL parameters such as `?auto=1`, `?t=` and `?freeze=1`, keyboard shortcuts, end-turn buttons. Update each one. My game's own autoplay must still finish a whole game. Keep existing HUD info (HP bars, max HP) and existing commands.

## Order of work

1. **Read the game first.** Write down (file, function) where these live: loop/update step; draw pass and its order (background, actors, effects, HUD); input; where damage/HP changes are applied; where turns, actions or selections are chosen and played; HUD windows and their rects; camera; battle/scene start and end; and every caller from premise 7.
2. **Check the prerequisites** below against those notes. If one is missing, add the smallest working version and tell me.
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Toasts & unlock pop-ups [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Toasts & unlock pop-ups:** game events worth announcing (pickups, purchases, loot, quest steps, unlocks, level-ups, firsts), at the code that decides them; a fixed update step that runs in every scene, menus open included (also run by ?t= fast-forward); the screen size in logical px (bounds); the rects of the HUD panels, minimap, message lines, captions, banners and open windows on screen now.

## Element 1: Toasts & unlock pop-ups (`toasts.js`, `GameDNA_Toasts`)

Achievement, quest-update and item-get notices slide in from a screen edge, stack and glide, leave on a timer line, merge duplicates into one card with a punching ×N badge (quest progress updates one card in place), and queue behind a "+N more" chip. They keep a safe-area margin, step around every HUD rect the game reports, hide while a window covers their slot and come back after, and never pause the game. Glass cards on HD canvases, crisp pixel cards with built-in bitmap fonts on native pixel canvases.

**Parameters chosen:** `edge` = top-right, `max` = 3, `hold` = 2800, `merge` = on, `enter` = slide, `size` = 0, `margin` = 0, `theme` = dusk, `progress` = on, `more` = on, `render` = auto.

**Where it goes** (by role; find these places in my game):

1. *Once at startup, after the canvas size is known (before anything can push):* `toasts = GameDNA_Toasts.create({bounds: {x: 0, y: 0, w: SCREEN_W, h: SCREEN_H}, uiRects, params: {edge: 'top-right', max: 3, hold: 2800, merge: 'on', enter: 'slide', theme: 'dusk', progress: 'on', render: 'auto'}})`. `bounds` = the screen in logical canvas px (not the backing store). `uiRects()` returns `{x, y, w, h}` for every HUD panel, minimap, objective or message line, caption, banner and open window drawn right now, using the draw code's numbers. If units stand under the stack's corner (a battle party, a tactics grid), also return their formation box so cards never hide them.
2. *The code that DECIDES each event a player cares about (pickup, purchase, loot, quest step, unlock, level-up, first kill, boss beaten, low HP). Pick 4-8; never a per-frame condition:* `toasts.push(kind, title, {text, key, count, rarity, icon})`: kinds `achievement | quest | item | unlock | level | info | warning`. Item icons `leaf | potion | pouch | sword | coin | gem | heart | star`; items merge to ×N by title; amounts with `'+{n} Coins'` and `{key: 'coins', count: n}`; quest progress only when the objective count changes, one fixed `key` per quest, `text: 'done / need'`, `count: 0`. If the game draws a one-line notice for that event ("Bought X"), stop drawing only that line (keep its variables); phase banners, titles, captions and result screens ("WAVE CLEARED", "VICTORY") stay.
3. *Your fixed update step, at the top, for every scene (title, play, menus open, end screens):* `toasts.update(stepMs)`.
4. *Your draw pass, last: after world, effects, HUD and windows, in screen coordinates outside any camera translate:* `toasts.draw(ctx)` once per frame, every scene.
5. *New game / restart:* `toasts.clear(true)`.

**Common mistakes** (symptom -> fix):

- Cards over the HUD or a window -> that rect is missing from `uiRects()` (or given in backing-store px).
- Cards never show, or only after a menu closes -> `update()` is only called in the play scene; call it every step.
- A badge counting up every frame, or a wall of identical cards -> `push` sits in a per-frame check.
- Two messages per event -> the game's own one-line notice is still drawn (only that line goes; banners and result titles stay).
- Cards hide the party on a small battle screen -> return the party formation box from `uiRects()`, or pick an edge over empty background.
- The quest card reappears on every kill -> push quest progress only when its count changes.
- Quest progress shows ×2, ×3 -> push it with `count: 0` and a fixed `key`.
- Blurry text on a native pixel game drawn into a larger backing store -> `render: 'crisp'`.
- `?auto=1` ends differently -> a push changed game state or consumed the game's random numbers.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Toasts & unlock pop-ups] An event shows one card sliding in from the chosen edge (label, title, icon); it leaves by itself.
- [Toasts & unlock pop-ups] The same item three times shows one card with ×3; quest progress updates one card.
- [Toasts & unlock pop-ups] A burst of five events shows `max` cards plus "+N more"; the rest follow. No card covers HUD, windows or another card; the game never pauses for a toast.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `toasts.js` sha256 `25c4b74cf2a237cb...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Toasts & unlock pop-ups] List each `push` with the event behind it; none runs every frame while a condition holds.
- [Toasts & unlock pop-ups] `uiRects()` covers every HUD element and window for every scene, in logical px; `update` runs every step, `draw` last.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

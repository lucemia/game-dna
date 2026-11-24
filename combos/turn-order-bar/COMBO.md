# Add turn-order bar to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `turn-order-bar.js` (one global, `GameDNA_TurnOrder`), API reference `turn-order-bar.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Turn-order bar [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Turn-order bar:** the turn order as an array of unit ids, given whenever it changes (or every step), plus the id acting now; a fixed 60 Hz update step; the screen area the strip stays inside (native px); optional: drawPortrait(ctx, id, rect) or the unit sprites (spritePortrait helper), teamOf(id), wait numbers, ids that just died; rectangles of UI to keep clear (optional).

## Element 1: Turn-order bar (`turn-order-bar.js`, `GameDNA_TurnOrder`)

A strip of small portraits along one screen edge shows who acts next: the unit acting now first in a bigger gold frame, hopping; the next units in blue (player) or red (enemy) frames, `+N` for the rest. When a turn ends the strip slides forward; units that join pop in, units that die crumble out, units that change place hop over the others; the unit under the cursor or being targeted blinks; optional wait numbers. Portraits are cropped from the game's own sprites. The game supplies the order it already has; the strip never computes turn rules and never covers the HUD.

**Parameters chosen:** `layout` = top, `align` = start, `slots` = 8, `size` = 16, `gap` = 2, `slide` = 240, `pop` = 220, `bounce` = 2, `waits` = auto, `label` = TURN, `fade` = on, `portrait` = auto.

**Where it goes** (by role; find these places in my game):

1. *Once, at boot, after the canvas exists (before the first update and before any fast-forward for screenshots):* `tob = GameDNA_TurnOrder.create({view: {x: 0, y: 0, w: <native width>, h: <native height>}, layout: 'top', teamOf, drawPortrait, getObstacles, params: {align: 'start', slots: 8, size: 16, gap: 2, slide: 240, pop: 220, bounce: 2, waits: 'auto', label: 'TURN', fade: 'on', portrait: 'auto'}})`. `teamOf(id)` returns the unit's side (`'player'`, `'enemy'`, `'blue'`, `'red'`... work as is). `drawPortrait = GameDNA_TurnOrder.spritePortrait(id => <that unit's sprite image or canvas>)`, returning `{img, flip: true}` for units the game draws mirrored. `getObstacles()` returns, in SCREEN pixels, each HUD panel / menu / caption `{x, y, w, h}` (no id: never covered) and each living sprite `{x, y, w, h, id}` (the strip fades over them); it may use state that exists only later and always returns an array.
2. *Where the game keeps its turn order (speed queue, initiative list, charge-time forecast, or, in a phase game, the units of the side in play that have not acted):* Once per fixed step, after the turn logic: `tob.setOrder(ids, {current, dead, waits})`. `ids` = a COPY (`.filter`/`.map`) of that order as unit ids, next to act first, living units only. `current` = the unit acting now (`null` between turns; it is put first if the game already removed it from its queue). `dead` = ids that died this step (compare living ids with the previous step). If the game only knows the rest of this round, append the next round from the game's own order function after `GameDNA_TurnOrder.BREAK`. Pass the game's wait or charge numbers as `waits` if it has them. Never shift, sort or refill the game's arrays for this.
3. *Where the game knows the unit under its cursor or being targeted:* `tob.highlight(id)` every step (`null` when none; an array for "all").
4. *Your fixed update step (every scene: title, battle, pauses):* `tob.update(1000 / 60)` once per step. On the title or outside battle: `tob.setOrder([])`.
5. *Your draw pass for the battle / map scene:* `tob.draw(ctx)` after the scene and the HUD, outside any screen-shake translate. Skip it on the title.
6. *Where a battle, wave or game (re)starts:* `tob.clear()`.
7. *Optional: pointer move / tap handlers:* `tob.slotAt(x, y)` (native px) gives the unit id under a portrait.

**Common mistakes** (symptom -> fix):

- The strip shows a different order from the one played -> build `ids` from the queue the turn code really uses, not a fresh sort of all units.
- Turns get skipped after the integration -> the game's own queue was shifted or sorted to feed the strip; pass a copy.
- The acting unit is missing from the strip -> the game removed it from its queue when its turn began; pass it as `current`.
- Everything pops in again every frame -> ids change identity (new objects, numbers vs strings); pass stable ids.
- Dead units shrink like units that acted -> pass them in `dead` on the step they die.
- The strip covers the HUD or menus -> return those rects without `id` from `getObstacles()`.
- Empty or half-open strip in `?t=&freeze=1` shots -> `setOrder` / `update` are called from the render instead of the fixed step.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Turn-order bar] The strip sits on the top edge, covers no HUD panel, and shows portraits made from the game's sprites (blue frames for the player's side, red for enemies), `+N` for the rest.
- [Turn-order bar] The acting unit is first in a gold frame and hops; when its turn ends the strip slides forward; a unit that dies crumbles out; the next unit shown is the one that acts next.
- [Turn-order bar] Autoplay (`?auto=1` or the game's own) reaches the same end as before; `?t=...&freeze=1` shots show a settled strip.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `turn-order-bar.js` sha256 `f44a96caf43cc25d...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Turn-order bar] The ids are a copy of the game's order; no game array is mutated. Trace one turn (actor first and `current` -> turn ends -> next `setOrder` drops it -> new actor) and one death (id leaves, appears in `dead`).
- [Turn-order bar] `tob.update` once per step on every scene; `tob.draw` once per frame on the battle render path, after the HUD.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

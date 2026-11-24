# A turn-order bar for my game

Defaults (change before pasting):
`{{layout}}` = top · `{{align}}` = start · `{{slots}}` = 8 · `{{size}}` = 16 · `{{gap}}` = 2 · `{{slide}}` = 240 · `{{pop}}` = 220 · `{{bounce}}` = 2 · `{{waits}}` = auto · `{{label}}` = TURN · `{{fade}}` = on · `{{portrait}}` = auto

---

You are given `turn-order-bar.js`, a finished module, and its `README.md` (API). **Include it verbatim** (`<script src>` before the game script, or pasted unchanged in its own `<script>`). Never rewrite or "fix" it. One global, `GameDNA_TurnOrder`; it reads no input and changes no game state.

Goal: a strip of portraits showing who acts next. My game keeps ALL its turn rules and only reports the order it already has.

**Integration points** (find where my game plays each role):

1. **Create once** the screen size exists:
   `tob = GameDNA_TurnOrder.create({ view: {x: 0, y: 0, w, h}, layout: '{{layout}}', teamOf, drawPortrait, getObstacles, params: { align: '{{align}}', slots: {{slots}}, size: {{size}}, gap: {{gap}}, slide: {{slide}}, pop: {{pop}}, bounce: {{bounce}}, waits: '{{waits}}', label: '{{label}}', fade: '{{fade}}', portrait: '{{portrait}}' } })`.
   `view` = native screen size. `teamOf(id)` → my unit's side. `drawPortrait`: `GameDNA_TurnOrder.spritePortrait(id => <that unit's sprite image or canvas>)` (return `{img, flip: true}` for units my game draws mirrored). `getObstacles()` → screen rects of my HUD panels and menus (no `id`) plus unit sprites (with their `id`).
2. **The order**: in my fixed step, after my turn logic, call `tob.setOrder(ids, {current, dead})`. `ids` = a COPY of the order my game already keeps (speed queue, initiative list, or, for phase games, the units that have not acted this phase), next to act first, living units only; `current` = the unit acting now (`null` between turns); `dead` = ids that died this step. If my game only knows the rest of this round, append the next round from my game's own order function, with `GameDNA_TurnOrder.BREAK` between. Wait or charge-time numbers my game has go in `waits`. Never shift, sort or refill my game's own arrays for this.
3. **Highlight**: `tob.highlight(id)` for the unit under my cursor or being targeted (`null` otherwise), every step.
4. **Clock and draw**: `tob.update(1000 / 60)` once per fixed step; `tob.draw(ctx)` after the scene and HUD, outside any screen-shake.
5. **Restart / new battle**: `tob.clear()`. On the title screen skip `draw`.
6. Optional: `tob.slotAt(x, y)` gives the unit under a portrait (hover, taps).

**Find and keep every caller**: autoplay (`?auto=1` or similar) still reaches the same end; `?t=...&freeze=1` screenshots, shortcuts, restart, title and tap handlers still work. Use the same ids my game uses elsewhere (numbers stay numbers).

**Self-check without a browser**
- The module file is byte-identical to the one given and loaded before first use.
- Every identifier inside `teamOf`, `drawPortrait`, `getObstacles` exists before the first `update`; `getObstacles` returns an array.
- The ids are a copy; no game array was mutated. Trace one turn (actor first and `current` → its action ends → next `setOrder` drops it → new actor) and one death (id leaves the list, appears in `dead`).
- `update` once per step, `draw` once per frame. No host function removed or renamed.

**Acceptance checks**
1. The strip sits on the {{layout}} edge, covers no HUD panel, and shows up to {{slots}} portraits made from my sprites, blue frames for my side, red for enemies, `+N` for the rest.
2. The acting unit is first, in a gold frame, bouncing; when its turn ends the strip slides forward; a unit that dies crumbles out; a new unit pops in.
3. The order shown is the order my game then plays.
4. `?auto=1` (or my autoplay) reaches the same end as before, no console errors.

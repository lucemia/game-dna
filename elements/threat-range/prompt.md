# Add an enemy threat range to my tactics game

Defaults (change before pasting):
`{{tint}}` = red · `{{fill}}` = 0.8 · `{{pattern}}` = solid · `{{outline}}` = march · `{{march}}` = 8 · `{{dash}}` = 4 · `{{fade}}` = 120 · `{{both}}` = outline · `{{walls}}` = hide · `{{key}}` = KeyT · `{{label}}` = THREAT

---

You are given `threat-range.js`, a finished module (API in its `README.md`). **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged into its own `<script>`); never rewrite it. It paints every tile enemies can reach or strike as a red zone with a marching outline, plus a toggle button.

Only wire it in. Add code; never replace, rename or delete existing functions.

**Integration points** (find them in my game first):

1. **Load the module** before the game script.
2. **Create one instance** after map, units and canvas exist, before the first frame and any `?t=` fast-forward:
```js
const threat = GameDNA_ThreatRange.create({
  cols, rows, tile, view: { x: 0, y: 0, w: <map width px>, h: <map height px above the HUD> },
  params: { tint: '{{tint}}', fill: {{fill}}, pattern: '{{pattern}}', outline: '{{outline}}', march: {{march}}, dash: {{dash}}, fade: {{fade}}, both: '{{both}}', walls: '{{walls}}', key: '{{key}}', label: '{{label}}' },
  cost: (x, y, u) => /* my move cost; impassable = Infinity or 99 */,
  occupant: (x, y) => /* living unit on that tile or null */,
  enemies: () => /* the enemy side's units */,
  posOf: u => ({ x: /* tile */, y: /* tile */ }), moveOf: u => /* move stat */, rangeOf: u => /* [min, max] */,
  playerRange: () => /* tiles my blue overlay shows now, or null */,
  getObstacles: () => /* sprite rects in canvas px */, uiRects: () => /* HUD / window rects in canvas px */
});
```
`cost`, `occupant`, `moveOf`, `rangeOf` must be what my own movement and attack rules use.
3. **Advance** in the fixed update step, every step: `threat.showUnit(<living enemy under the cursor while none of my units is selected, else null>)`, then `threat.update(<step ms>)` (`0` while frozen).
4. **Draw**: after the ground and after my own range overlay, before units: `threat.draw(ctx, cam)` (`cam` = map scroll `{x, y}` px, or `{x: 0, y: 0}`). Last, after units, HUD and windows: `threat.drawButton(ctx)`.
5. **Input**: keydown, first line: `if (threat.key(e.code, true, e.repeat)) { e.preventDefault(); return; }`; keyup: `threat.key(e.code, false)`. Pointer (native px): `if (threat.click(x, y)) return;` before my tap logic. Where confirming on an enemy does nothing, add `threat.toggleUnit(enemy)`.
6. **Reset**: new battle or restart: `threat.clear()`.

**Keep every caller working**: autoplay/AI, `?t=<ms>&freeze=1`, restart, shortcuts and taps. The module takes only its toggle key and button and never moves units. If `{{key}}` is taken, pick another.

**Self-check without a browser**
- The module is byte-identical and loads first. Every identifier in the snippets exists when they first run; no host function removed or renamed; old keys still reach my handler.
- Walk one turn: an enemy changes tile → next `update` recomputes → `draw` shows the new zone.
- Worked example: move 4, range 1; east of it grass (cost 1), forest (2), grass: it stops on the forest (1 + 2 = 3) and the grass beyond (4), strikes one more: the zone reaches 4 tiles east.

**Acceptance checks**
1. `{{key}}` or the button: red zone with a marching outline over every tile enemies can reach or hit; again: gone.
2. Cursor on one enemy: only its zone; pins add up.
3. After an enemy moves, the zone follows.
4. My unit selected: its blue range stays blue; the zone is outline only.
5. `?auto=1` ends as before, no console errors.

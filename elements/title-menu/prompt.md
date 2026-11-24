# Add a title screen and menu flow to my game

Defaults (change before pasting):
`{{transition}}` = diamond · `{{transMs}}` = 320 · `{{panel}}` = royal · `{{quit}}` = on · `{{pauseButton}}` = auto · `{{hints}}` = on · `{{pauseKeys}}` = Escape, P

---

You are given `title-menu.js` (finished module, global `GameDNA_TitleMenu`) and its `README.md`. **Include the module verbatim** (`<script src>` before my game script, or pasted unchanged). Read the README's API table first.

Player sees: my title art with a logo, PRESS START, a menu (CONTINUE, NEW GAME, OPTIONS, QUIT), persistent options, a wipe into play, a pause menu. Keys, mouse, touch.

Add code only; never delete or rename anything of mine.

**First, map my game**: the fixed step and its callers (loop, `?t=` fast-forward, `?auto=1` autopilot); the title scene, what its confirm does, how results return to it; every render path; HUD boxes; keys used in play; characters on the title backdrop.

**Integration points**

1. **Create one instance** after the canvas and game state exist:
```js
const menu = GameDNA_TitleMenu.create({
  canvas, title: '<my game name>', tagline: '<short line>',
  colors: { logo: ['<light>', '<warm>'], panel: '{{panel}}', accent: '<highlight>' },   // from my palette
  isTitle: () => <in my title scene>,
  canPause: () => <in play, not results or game over>,
  onStart: kind => { <exactly what my title confirm did> },
  onRestart: () => { <same> },
  onQuitToTitle: () => { <back to my title scene> },
  pauseKeys: [<{{pauseKeys}} minus keys my game uses in play>],
  uiRects: () => <HUD boxes in native px while playing, else []>,
  obstacles: () => <characters and key props on the title backdrop, native px>,
  titleCover: () => <HUD panels that would sit empty on the title, native px>,
  controls: [['<action>', '<keys>'], ...],
  onOption: (key, value) => { <apply>; },
  params: { transition: '{{transition}}', transMs: {{transMs}}, quit: '{{quit}}', pauseButton: '{{pauseButton}}', hints: '{{hints}}' }
});
```
2. **Step**: first line of the fixed step, every scene: `menu.update(STEP_MS); if (menu.busy()) { <drop queued presses>; return; }`.
3. **Render**: `menu.draw()` last on **every** render path, including the title and early returns. On the title, while `menu.titleShown()`, draw only the backdrop art and frames, not the old name or "press start" text.
4. **Paused**: hide my world text (speech bubbles, floating labels) while `menu.paused()`.
5. **Options**: apply `master`/`music`/`sfx` (0-10) to my audio, `textSpeed` to text reveal, `shake` and `flashes` to effects, if those exist; read with `menu.get(key)`.

**Keep every caller working.** Under `?auto=1`, `?t=<ms>` and `freeze=1` the module turns itself off: my old title, its confirm and the autopilot must still work unchanged, so never delete them; `onStart` reuses that confirm code. `?auto=1` must end exactly as before; `?t=&freeze=1` stills identical. Results still return to the title with my confirm key; there NEW GAME is preselected.

**Self-check without a browser**
- Module byte-identical, loaded first; `create` after the state it reads.
- `update` once, first in the step; `draw` at the end of every render path.
- Pause keys unused in play; `canPause` false outside play.
- Walk it: PRESS START (busy) -> confirm -> NEW GAME -> wipe ({{transMs}} ms) -> `onStart('new')` -> play -> pause -> back -> resume.

**Acceptance checks**
1. Title: my art behind, logo, PRESS START; no empty HUD panel; nothing covers a character.
2. Menu by arrows + Z, mouse click and tap; OPTIONS changes persist after reload.
3. NEW GAME wipes into play; pause stops the world; QUIT TO TITLE asks first.
4. The pause button and hints never cover the HUD; text never overlaps at 390 px wide.
5. `?auto=1` and `?t=&freeze=1` behave as before; no console errors.

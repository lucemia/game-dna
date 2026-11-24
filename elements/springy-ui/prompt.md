# Add springy motion to my game's windows and menus

Defaults (change before pasting):
`{{open}}` = 260 · `{{close}}` = 140 · `{{bounce}}` = 0.12 · `{{style}}` = auto · `{{stagger}}` = 30 · `{{glide}}` = 140 · `{{lift}}` = 2 · `{{dim}}` = 0.35 · `{{count}}` = 450 · `{{reduced}}` = system

---

You are given `springy-ui.js`, a finished module, and its `README.md`. **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged). Never rewrite it. Read the README's API table first.

It animates windows my game ALREADY draws, at their final rects; you only wrap those draw calls. Add code only; never replace, rename or delete functions.

**First, map my game**: the fixed step and its callers (rAF loop, `?t=` fast-forward, `?auto=1`); every window, menu and popup, its rect and cursor; where windows open and close in logic; every render path (title, play, results, early returns); numbers worth rolling (gold, HP).

**Integration points**

1. **Load** the module before the game script.
2. **Create one instance** before the first render:
```js
const ui = GameDNA_SpringyUI.create({
  view: { x: 0, y: 0, w: SCREEN_W, h: SCREEN_H },   // units my draw code uses
  params: { open: {{open}}, close: {{close}}, bounce: {{bounce}}, style: '{{style}}', stagger: {{stagger}}, glide: {{glide}}, lift: {{lift}}, dim: {{dim}}, count: {{count}}, reduced: '{{reduced}}' }   // HD canvas with smooth art but smoothing off: add pixel: 'off'
});
```
3. **Clock**: `ui.update(STEP_MS)` once per fixed step, every scene.
4. **Windows**: wrap each window's existing draw code: `ui.window(ctx, id, rect, () => { <existing draw> }, { selected: cursor, dim: <true for modal menus only> })`. Stable `id` per window; `rect` = the box really drawn, never a fixed always-on-screen panel (unfolding exposes stale pixels). A full-screen dim drawn in that function stays outside the wrapper.
5. **Rows and highlight**, inside the window: draw the highlight once, before the rows, at `ui.glide(id, <selected row rect>)`; wrap each row: `ui.row(ctx, id, k, () => { <existing row draw> }, rowRect)`. Pointers and target cursors: `ui.glide` too.
6. **Numbers**: print `ui.count(key, value)` instead of `value`.
7. **Open / close**: `ui.open(id)` where logic opens a window, `ui.close(id)` where it closes one (exact mid-animation `?t=` frames).
8. **Every render path** ends with `ui.draw(ctx)` (it plays closing windows).

**Input never waits for the animation.** Never ignore, queue or delay presses while a window animates; never keep a window open in game state until its animation ends; never read `ui.state()` / `ui.debug()` in game logic. A confirm pressed one frame after a window appears must do exactly what it did before, on the same step.

**Keep every caller working**: `?auto=1` (same ending, same time), `?t=<ms>&freeze=1` (same frame every run), shortcuts, pause, restart, title, tap hit tests.

**Self-check without a browser**
- Module byte-identical, loaded before `create`.
- `ui.update` in the fixed step on every scene; `ui.draw(ctx)` last on every render path.
- Each window wrapped once per render with its real rect; simultaneous windows have different ids.
- No logic, state change or input handling moved into a wrapped draw function.
- Walk one open with the defaults: opaque by ~90 ms, overshoot to ~1.02 scale, settled at {{open}} ms; row k starts at k × {{stagger}} ms; close {{close}} ms.

**Acceptance checks**
1. A menu opens with a small overshoot, rows sliding in one after another; it closes faster.
2. Moving the cursor: the highlight glides and the row lifts.
3. Gold or HP changes: the number rolls.
4. Confirm the instant a window appears still works; `?auto=1` ends as before, no console errors.
5. `reduced: 'on'`: fades only.

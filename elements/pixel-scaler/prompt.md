# Make my pixel game pixel-perfect (native resolution + integer scaling)

Defaults (change any of these before pasting):
`{{mode}}` = integer · `{{border}}` = frame · `{{color}}` = ink · `{{crt}}` = off · `{{scanlines}}` = 0.3 · `{{fill}}` = auto · `{{button}}` = corner · `{{key}}` = off

---

My game's canvas is stretched by CSS, so pixels are blurry or uneven. You are given `pixel-scaler.js`, a finished module (global `GameDNA_PixelScaler`), and its `README.md`. **Include the module verbatim** (`<script src>` or pasted unchanged); never rewrite it. It shows the native canvas at the largest whole number of device pixels per game pixel, centred in a themed border, and gives you `toGame()` for pointer input. It adds no loop and never touches game logic or timing.

Only wire it in. Add code; never replace or rename existing functions.

**Integration points** (find them first and write them down):

1. **The canvas** the game draws on and its `width`/`height` attributes (e.g. 256×224). Never change them, the context transform or `imageSmoothingEnabled`.
2. **Create once**, after the canvas exists (below the game script):
```js
const scaler = GameDNA_PixelScaler.create({
  canvas: <the game canvas>, native: { w: <width>, h: <height> },
  params: { mode: '{{mode}}', border: '{{border}}', color: '{{color}}', crt: '{{crt}}', scanlines: {{scanlines}}, fill: '{{fill}}', button: '{{button}}', key: '{{key}}' }
});
scaler.apply();
```
3. **The game's own stretching.** CSS rules on the canvas may stay (the module overrides them). Delete only a JS write to `canvas.style.width/height` in a resize handler. If the game sets `canvas.width = innerWidth`, stop and tell me: it is not a native-resolution game.
4. **Every pointer/touch → game coordinate mapping** (grep `clientX`, `offsetX`, `pageX`, `touches`, `getBoundingClientRect`). A mapping that computes `(e.clientX - rect.left) * W / rect.width` from the canvas's own `getBoundingClientRect()` is already exact: keep it. Replace anything else (offsetX, a fixed or stored scale, window size) with `const p = scaler.toGame(e)` and use `p.x`, `p.y` (native pixels; `Math.floor` for tiles). Listeners on `window` or `document` must ignore `!p.inside`.
5. **Keep every other caller working:** autoplay (`?auto=1`), `?t=<ms>&freeze=1` screenshots, restart and keyboard shortcuts must behave exactly as before. If `{{key}}` is a key the game already uses, set it to `off`.

**Self-check without a browser**
- The module is byte-identical; `create`/`apply` run once, after the canvas exists.
- Your diff adds no write to `canvas.width`, `canvas.height`, `setTransform` or `ctx.scale`, and changes no loop, timer, URL parameter or key handler.
- List every pointer mapping you found and say for each one: "kept (rect ratio)" or "now toGame".
- Worked example: native 256×224 in a 1280×900 window at devicePixelRatio 1, nothing else on the page → n = floor(min(1280/256, 900/224)) = 4 → 1024×896 on screen, borders 128 px left and right, 2 px top and bottom; a click 10 px right of the canvas's left edge maps to x = 10 × 256 / 1024 = 2.5.

**Acceptance checks** (screenshots if you can)
1. At 1280×900 and at 500 px wide, the game is centred with an even border, and every game pixel is an exact square of n×n device pixels (no 2-px/3-px mix, no blur on edges).
2. The page never scrolls sideways; with `fill: 'page'` text under the game stays visible.
3. Clicking or tapping a tile, button or menu item still selects that exact one; taps in the border do nothing.
4. `?auto=1` plays to the same end as before with no console errors; `?t=<ms>&freeze=1` shows the same frame as before, now crisp.
5. Resizing or rotating re-centres the game at the new whole-number scale.

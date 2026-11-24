# touch-controls.js (I-03 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_TouchControls`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It adds on-screen touch controls for phones (a D-pad or a virtual stick, A/B buttons, an optional START pill) drawn in pixel style on its own overlay, and it edge-latches every input (keyboard, touch, gamepad) so a press shorter than one game step still counts once. Your game keeps its own input code.

It draws through `GameDNA_Skin` when `skin-api.js` (and a skin such as `pixel16.js`) is loaded before it, and otherwise with its built-in copy of the pixel16 look.

## Two ways to plug it in

| mode | the game | what the module does |
|---|---|---|
| `'events'` (default) | keeps its own `keydown` / `keyup` handlers | a touch on a control sends a `KeyboardEvent` (`code`, `key`, `keyCode`) with the key your game already binds; the key stays down until one game step has seen it |
| `'poll'` | reads `tc.pressed(name)` / `tc.held(name)` in its step | listens to the keyboard itself (`preventDefault` on mapped keys only) and keeps one state for keyboard, touch and gamepad |

In both modes `pressed()` / `held()` work, so a game can switch to polling later.

## API

`GameDNA_TouchControls.create(options)` returns an instance (already attached).

| option | meaning |
|---|---|
| `canvas` | The game canvas (element or selector). Controls go in the free space below it, else in the gutters left and right of it, else over its bottom corners. Without it they sit at the bottom of the screen. |
| `map` | `{up, down, left, right, a, b, c?, start?}` → the game's own `KeyboardEvent.code` for each role (`'ArrowUp'`, `'KeyZ'`, `'Space'`, `'Enter'`…), or an array of codes (the first is the one sent). Roles left out are not drawn. |
| `mode` | `'events'` or `'poll'` (above). |
| `params` | `pad` `'dpad'`/`'stick'`, `side` `'left'`/`'right'` (pad side), `placement` `'auto'`/`'below'`/`'sides'`/`'over'`, `size` `'small'`/`'medium'`/`'large'`, `opacity` 0.6 (over the canvas), `start` `'on'`/`'off'`, `dirs` 8/4, `show` `'auto'`/`'always'`/`'never'`, `buttons` 1–3, `latch` `'all'`/`'touch'`. `layout: {...}` is accepted as an alias. |
| `avoid()` | Optional. Your HUD rects `{x, y, w, h}` in **canvas** pixels. Controls drawn over the canvas move up off them. (Below the canvas they never touch it.) |
| `skin`, `labels` | Skin id or object; button labels, e.g. `{a: 'J', start: 'MENU'}`. |
| `container` | Optional element whose box limits where controls go (default: the window). |
| `keyTarget` | Optional element the key events are sent to (default: the focused element, else `body`; they bubble to `document` and `window`). |
| `stepMs`, `gamepad`, `onFirstInput(fn)`, `onShow(visible)`, `zIndex`, `attach: false` | Step length for `repeat` (1000/60); `false` turns gamepad polling off; called once on the first press (unlock audio here); called when controls show or hide. |

| method | |
|---|---|
| `step()` | **Once per fixed game step, as its first line**, also in fast-forward loops (`?t=`), on title and pause screens and in autoplay. It is the edge latch. |
| `pressed(n)`, `held(n)`, `released(n)` | This step: just pressed (exactly once per press, even a 0 ms tap), held (true on the step of a 0 ms tap too), just released. `n` is a role name from `map`. Unknown names return `false`. |
| `repeat(n, delayMs = 300, rateMs = 80)` | True on the press, then every `rateMs` after `delayMs` while held (menus). |
| `axis()` | `{x, y}` in −1..1: the stick's analog value, else the held directions (diagonals normalised). |
| `count(n)`, `state()`, `layout()` | Total presses seen by `step`; a snapshot for tests; `{placement, px, size, rects}` of the visible controls in CSS px (or `null`). |
| `press(n)`, `release(n)`, `tap(n)` | Programmatic presses (demos, tests). In `'events'` mode they send keys like a touch. |
| `show(true / false / null)`, `visible()`, `setParams(obj)`, `releaseAll()`, `attach()`, `destroy()` | Force or un-force visibility; change params live; release every key the module holds; `destroy` removes the overlay and every listener and sends the key-ups it owes. |

## Integration (15 lines)

```js
// <script src="touch-controls.js"></script> before your game script
const tc = GameDNA_TouchControls.create({
  canvas: gameCanvas,
  mode: 'events',                                   // your keydown/keyup handlers stay as they are
  map: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
         a: 'KeyZ', b: 'KeyX', start: 'Enter' },    // the codes YOUR handler already binds
  params: { pad: 'dpad', side: 'left', placement: 'auto', size: 'medium', latch: 'touch' },
  avoid: () => hudRects()                           // optional, canvas px
});
function fixedStep() {
  tc.step();                                        // FIRST line, before your game reads input
  // ... your existing step: input, update ...
}
// poll mode instead: mode: 'poll', then in fixedStep: if (tc.pressed('a')) jump(); if (tc.held('left')) walkLeft();
```

`latch`: use `'touch'` when your `keydown` handler already records presses (a "just pressed" set filled on keydown and cleared after the step reads it); use `'all'` (default) when your step only checks which keys are held: then a real key-up is held back until one step has seen the key (never longer than two steps), so a 0 ms key tap still works.

## What it guarantees

- Only touches that **start on a visible control** are stopped (`preventDefault` + `stopImmediatePropagation`, no scrolling, no emulated mouse). Every other touch, click and key reaches your game unchanged; your own canvas tap zones keep working.
- Nothing is sent to the game unless a person touches a control or a gamepad: autoplay, `?t=&freeze=1` and scripted key presses run exactly as before.
- Multi-touch: one finger holds a direction while another presses A or B. A finger that slides from B to A releases B and presses A; a finger on the pad changes direction as it slides (8-way, 40° diagonals; 4-way with `dirs: 4`).
- A press that starts and ends between two steps is `pressed()` once and `held()` on that one step; in events mode its key stays down until a step saw it.
- Visible press states: arms and buttons sink 1 px, darken and light their glyph; quick taps flash for 90 ms.
- `show: 'auto'`: visible on touch screens (`pointer: coarse`), shown on the first touch, hidden after a real key press or gamepad use. Hidden controls take no touches.
- Placement (`auto`): below the canvas when the free space under it fits the deck; else pad and buttons in the side gutters when both fit (landscape phones with a pillarboxed canvas); else over the canvas's bottom corners at `opacity`, moved up off `avoid()` rects (`avoid()` is re-read every frame, so dialog and menu boxes count when they open). `below` and `sides` never overlap the canvas; a forced `below` or `sides` without room falls back to `auto`. Whole-number pixel scale (2–4 CSS px per art pixel; a larger `size` is never drawn at a smaller scale than a smaller `size` on the same screen, except that it is capped at the largest size that fits below or beside the canvas rather than covering the game; `layout().size` says which size is drawn). Touch margins never overlap: where two meet, the nearer control wins, safe-area insets respected, never wider than the screen (no horizontal scroll).
- Window blur or tab hide releases everything. `step`, `pressed`, `held` and drawing never throw.

## Self-check without a browser

- The module file is byte-identical to the one given and loads before the game script uses `tc`.
- `tc` is created before the first `step()` runs (including a `?t=` fast-forward at load).
- `tc.step()` is the first line of the ONE fixed step function; it is not called from `render` or `requestAnimationFrame`.
- Every `map` code is one your handler already binds (grep the handler's key table); no handler, tap zone or autopilot was removed or renamed.
- Trace one touch on A: `pointerdown` → `keydown KeyZ` → your handler records it → `tc.step()` → your step reads it → finger up → `keyup` after the next step.

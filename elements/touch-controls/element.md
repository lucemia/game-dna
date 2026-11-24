# I-03 Touch controls with edge-latched input

## 1. What it is

On a phone the game gets a control deck: a pixel-art D-pad (or a virtual stick) on one side, round A and B buttons on the other, and a small START pill. Every finger is tracked on its own, so the player can hold right with the left thumb and tap A with the right; a thumb that slides from B onto A releases B and presses A; a thumb on the pad changes direction as it rolls, including diagonals. Pressed arms and buttons sink one pixel, darken and light their glyph. The deck sits below the game in portrait, in the side gutters or over the bottom corners in landscape, and never covers the HUD. It appears on touch screens, hides after a key press or gamepad use and comes back on the next touch.

Underneath, every input is edge-latched: a press that starts and ends between two game steps (a 0 ms key tap, a quick touch, a test harness pressing a key) is reported exactly once as "just pressed" on the next step and as held on that step. Touches become the game's own key events, so its input code, autopilot and test hooks stay as they are; a game without key handlers can poll `pressed()` / `held()` instead.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `pad` | dpad | dpad, stick | Direction control: 3×3-cell cross, or a ring with a knob that follows the thumb (analog `axis()`) |
| `side` | left | left, right | Which side the pad is on; the buttons mirror (A always on the outer, higher side) |
| `placement` | auto | auto, below, sides, over | auto = below if it fits, else side gutters, else over the corners |
| `size` | medium | small, medium, large | D-pad cell 10 / 12 / 14 art px, button radius 8 / 9 / 11 |
| `opacity` | 0.6 | 0.3–1 | Alpha when drawn over the game (pressed parts +0.3) |
| `start` | on | on, off | START pill (only if the game has a pause key) |
| `dirs` | 8 | 8, 4 | 8-way with 40° diagonals, or 4-way |
| `buttons` | 2 | 1–3 | A; A+B (diagonal pair); A+B+C (triangle) |
| `show` | auto | auto, always, never | auto: on touch screens, hide after keys, show on touch |
| `latch` | all | all, touch | `all` also holds a real key-up back until a step saw the key (for games that only read held keys) |

## 3. Variants

- **Classic pad**: the defaults.
- **Stick, left-handed**: `pad stick`, `side right` (buttons on the left, A outermost).
- **Big buttons**: `size large`, `buttons 3` (A, B, C triangle; START above when the row is too wide).
- **Overlay, menu game**: `placement over`, `opacity 0.45`, `dirs 4`, `start off`, `size small`.

## 4. Interface

**Needs**
- A fixed game step that calls `step()` as its first line, before the game reads input (also in `?t=` fast-forward loops, on title and pause screens and in autoplay).
- The game canvas and the key codes the game's `keydown` handler binds (directions, confirm → `a`, cancel → `b`, pause → `start`).
- Optional: HUD rects in canvas px (`avoid()`), read every frame, for controls drawn over the canvas.

**Provides**
- `'events'` mode: `keydown` / `keyup` with `code`, `key`, `keyCode` for each touch and gamepad press, sent to the focused element (bubbling to `document` and `window`); a key stays down until a step has seen it (one to two steps).
- `pressed()`, `held()`, `released()`, `repeat()`, `axis()` per role, the same for keyboard, touch and gamepad (works in both modes).
- `onFirstInput` (unlock audio), `layout()` (control rects in CSS px), `state()` (for tests).

**Delivery (v1).** All of this is `module/touch-controls.js` (one global, `GameDNA_TouchControls`; API and a 15-line integration in `module/README.md`). It draws on its own fixed overlay canvas (`pointer-events: none`) and hit-tests pointers itself in a window capture listener, so only touches that start on a visible control are stopped; the game's own tap zones and clicks still work. It draws through `GameDNA_Skin` when `skin-api.js` is loaded and with a built-in pixel16 copy otherwise.

## 5. Screen rules (exact numbers)

- **Pixel grid**: art pixels at a whole CSS scale `px` = the largest of 4, 3, 2 at which the deck fits the width and stays under 40 % of the height (inline row first, then START stacked above). A larger `size` never draws smaller than a smaller one: its scale is at least the scale `small` and `medium` get on the same screen (the height cap gives way). The one exception: when the larger deck would then have to go over the canvas (e.g. `large` on a landscape phone whose gutters hold only `medium`), it is capped at the largest smaller size that still fits below or beside the canvas, so a deck never covers the game because of its size; `layout().size` reports the size drawn. On a 390 px phone that is 3: the D-pad is 114 CSS px, a button 57 px. The overlay canvas is drawn at art resolution and scaled with `image-rendering: pixelated`; non-pixel skins draw smooth at device resolution with the same geometry.
- **D-pad** (cell c): cross 3c × 3c, 1 px ink outline, 2 px drop shadow at 45 %, body `ui.fillTo`, top/left outer edges `ui.fill`, bottom/right outer edges dark; arrows ⌊c/3⌋ rows tall with a 1 px ink shadow; centre dimple. Pressed arm: body mixed 40 % to ink, inner top edge dark, arrow `text.accent`, 1 px lower. Diagonal = two arms pressed.
- **Stick**: ring radius R = 1.5c + 1, inner well, four direction ticks (lit `text.accent` when active), knob radius 0.52R travelling up to R − knob − 1 toward the thumb.
- **Buttons** (radius r): per-pixel shaded disc (letters turn ink on pale discs such as C), light upper-left rim (base mixed 45 % to white), dark lower-right rim, 2 px white specular, 1 px ink outline, 2 px shadow. A = `team.b`, B = `team.a`, C = `fx.heal`. Letter: skin `ui` font, `text.main`/`text.main2`, no shadow. Pressed: 1 px lower with the shadow hidden under it, body 28 % to ink, top rim dark (an inner ink arc in smooth skins), letter `text.accent` (main text or white when the accent has too little contrast on the disc). Two buttons sit on a diagonal (centres 2r + 5 apart, A 6 px higher); three form a triangle as wide as two.
- **START**: 25 × 9 pill, 3×5 label, pressed 1 px lower in `text.accent`.
- **Deck below the canvas**: full-width band `ui.shadow`, 1 px ink and 1 px light line on top, dotted foot line; 5 art px margins; band bottom at the screen bottom minus the safe-area inset. Used only when the space under the canvas is at least the band height + 1 art px.
- **Side gutters** (each needs the group + 6 art px): pad centred in one gutter, buttons in the other with START 3 px above them, vertical centre at 62 % of the screen height (clamped to the bottom margin).
- **Over the canvas**: whole scale lowered (min 2) until each group is under 25 % of the visible canvas height and the whole row fits its width (pad and buttons never meet); bottom corners of the visible part of the canvas, `opacity`; each group moves up 2 art px at a time off every `avoid()` rect (1 px margin), never above 30 % of the canvas height (then it stays put and `layout()` marks it blocked).
- **Hit areas** (CSS px): touch margins reach out from each control's edge: pad 14, buttons 12, START 8 (+14 while held); where two margins meet, the nearer edge wins, so hit areas never overlap. Pad dead zone 22 % (stick 30 %); a finger sliding between buttons switches to the nearest one.
- **Timing**: visible press flash 90 ms; synthesised key-up after the press was seen by one step (released at the start of the second step after the press); without `step()` wired, 34 ms.

## 6. Common mistakes (symptom → fix)

- A quick tap does nothing or the title needs two taps → the game only checks held keys once per frame; call `step()` first in the fixed step and keep `latch: 'all'` (or poll `pressed()`).
- Every touch press counts twice → the module was given the game's canvas tap handler as well, or poll mode was used with the game's own key handler still reading the synthesised keys; pick one mode.
- Controls cover the score bar or the dialogue box → pass the HUD, dialogue and menu rects in `avoid()` (canvas px), and let `auto` placement put the deck below or beside the canvas.
- Page scrolls or zooms while playing → a control was drawn where the module does not hit-test (custom DOM buttons); use the module's controls, which stop their own touches.
- The game's own tap-to-walk stops working → do not stop or rewire the canvas pointer handlers; touches off the controls reach the game unchanged.
- Holding a direction then lifting the thumb leaves the hero walking → keys were released only on `touchend`; the module also releases on `pointercancel`, window blur and tab hide; never add your own release logic.
- `?t=&freeze=1` shots or autoplay change → `step()` must not send anything by itself; it only latches. Check nothing calls `tc.press` from the game.
- Controls on a desktop page → `show: 'always'` was used; `auto` keeps them for touch screens.
- Blurry deck → a fractional scale; the module picks whole scales, do not CSS-scale its overlay.

## 7. Acceptance moments

| Shot | Must be visible |
|---|---|
| `demo/?t=1150&freeze=1` | Portrait phone (also a real 390 px viewport): game at 2× on top, deck below; right arm and A pressed together (hop while walking). |
| `demo/?t=1950&freeze=1` | The knight stands left of the dummy facing it, B pressed (sunk, dark, gold letter), the crescent slash on the dummy, HITS 1. |
| `demo/?t=3000&freeze=1` | Up and left arms both pressed (diagonal). |
| `demo/?t=4100&freeze=1` | START pressed, PAUSED box. |
| `demo/?t=1950&freeze=1&orient=land&size=large&buttons=3` | Big buttons on a landscape phone: capped at medium, still in the gutters, A/B/C triangle with START above, nothing on the canvas. |
| `demo/?t=1950&freeze=1&orient=land` (or any viewport wider than tall and under 560 px high) | Landscape phone: pad in the left gutter, buttons + START in the right gutter, nothing on the canvas. |
| `demo/?t=3000&freeze=1&pad=stick&side=right` | Stick on the right with the knob pushed up-left (the diagonal), A outermost on the left. |
| `demo/?t=5000&freeze=1&placement=over&…` | Over the canvas at 45 %, off the HUD bar and the PAUSED box. |
| `demo/?…&skin=flat` | The same deck through a token-only smooth skin. |
| Phone width 500 px | No horizontal scroll. |
| Host checks (`checks/hosts/`) | Side-scroller and top-down integrations: tap A starts, hold right walks, A while holding jumps, B→A slide, diagonal, key hides, landscape gutters or over off the HUD; `?auto=1` ends like the original. |

# Add touch controls to my game (and make every quick press count)

Defaults (change before pasting):
`{{pad}}` = dpad · `{{side}}` = left · `{{placement}}` = auto · `{{size}}` = medium · `{{opacity}}` = 0.6 · `{{start}}` = on · `{{dirs}}` = 8 · `{{show}}` = auto · `{{buttons}}` = 2 · `{{latch}}` = all

---

You are given `touch-controls.js`, a finished module, and its `README.md` (API). **Include it verbatim** (`<script src>` before the game script, or pasted unchanged in its own `<script>`). Never rewrite or "fix" it. One global, `GameDNA_TouchControls`. It draws a pixel-style D-pad (or stick), A/B buttons and a START pill on its own overlay, below my canvas or over its bottom corners, and edge-latches input so a press shorter than one game step still counts once.

Goal: my game becomes playable on a phone, with no change to its rules or its keyboard play.

**Integration points** (find where my game plays each role):

1. **Read my input code first.** Note the key codes my `keydown` handler binds for: the four directions, the main action / confirm (→ `a`), the second action / cancel (→ `b`), pause or menu (→ `start`, leave it out if there is none). Note whether keydown records "just pressed" keys itself (a set filled on keydown, cleared after the step reads it): then `latch: 'touch'`, otherwise keep `'{{latch}}'`.
2. **Create once**, after the canvas exists and before the first game step (also before a `?t=` fast-forward that runs at load):
   `tc = GameDNA_TouchControls.create({ canvas, mode: 'events', map: {up, down, left, right, a, b, start}, avoid, params: { pad: '{{pad}}', side: '{{side}}', placement: '{{placement}}', size: '{{size}}', opacity: {{opacity}}, start: '{{start}}', dirs: {{dirs}}, show: '{{show}}', buttons: {{buttons}}, latch: '<from step 1>' } })`.
   `map` values are my handler's own `KeyboardEvent.code` strings. `avoid()` returns my HUD rects (score bar, dialog and menu boxes on screen now) in canvas pixels.
3. **Step**: `tc.step()` as the FIRST line of my fixed game step (the one function that advances the game once), before my game reads input. Not in render, not per animation frame.
4. In `'events'` mode a touch sends key events to my existing handlers, so nothing else changes. Only if my game has no key handlers (or I ask for it) use `mode: 'poll'` and read `tc.pressed(name)` / `tc.held(name)` / `tc.repeat(name)` in the step.
5. Make sure the page has `<meta name="viewport" content="width=device-width, initial-scale=1">`.

**Find and keep every caller**: my keyboard handlers, my own canvas tap or click handlers, the autopilot (`?auto=1` or similar), `?t=...&freeze=1` screenshots, restart and title screens all keep working. Add code only; remove or rename nothing.

**Self-check without a browser**
- The module file is byte-identical to the one given and loads before the game script uses `tc`.
- `tc` exists before the first `step()` call; `tc.step()` is called once per step and nowhere else.
- Every `map` code appears in my handler's key table. No handler, tap zone or autopilot removed.
- Trace one touch on A: pointerdown → `keydown` with my action code → my handler records it → `tc.step()` → my step reads it → finger up → `keyup` after the next step.

**Acceptance checks** (with touch emulation, e.g. a 390×844 phone)
1. Controls appear below the game on a phone in portrait, beside it (side gutters) or over its bottom corners in landscape, never on my HUD; none on a desktop until the screen is touched.
2. Tapping A on the title starts the game; holding right walks; holding right while tapping A jumps (two fingers); sliding a finger from B to A works.
3. A 0 ms key tap (keydown and keyup in the same task) triggers its action exactly once.
4. After a key press the controls hide; touching shows them again.
5. `?auto=1` reaches the same end as before, no console errors; no horizontal scroll at 500 px.

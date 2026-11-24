# Add Touch controls with edge-latched input to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `touch-controls.js` (one global, `GameDNA_TouchControls`), API reference `touch-controls.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Touch controls with edge-latched input [foundations].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Touch controls with edge-latched input:** a fixed 60 Hz update step; input (directions, confirm, cancel, pointer); rectangles of UI to keep clear (optional).

## Element 1: Touch controls with edge-latched input (`touch-controls.js`, `GameDNA_TouchControls`)

Phones get a pixel-art D-pad (or stick), A/B buttons and a START pill below the game, in its side gutters or over its bottom corners, never on the HUD. Every finger is tracked (hold a direction while pressing A, slide from B to A), presses sink and light up, and the deck hides after a key press. Every input (keyboard, touch, gamepad) is edge-latched, so a tap shorter than one game step still counts exactly once. Touches become the game's own key events: its input code, autoplay and test hooks stay as they are.

**Parameters chosen:** `pad` = dpad, `side` = left, `placement` = auto, `size` = medium, `opacity` = 0.6, `start` = on, `dirs` = 8, `buttons` = 2, `show` = auto, `latch` = all.

**Where it goes** (by role; find these places in my game):

1. *The game's keydown / keyup handlers (read them first, change nothing):* Note the `KeyboardEvent.code` the game binds for up, down, left, right, the main action or confirm (`a`), the second action or cancel (`b`), an optional third (`c`) and pause or menu (`start`). Note whether keydown records "just pressed" keys itself (a set filled on keydown and cleared after the step reads it): that decides `latch`.
2. *Once, after the canvas exists and BEFORE the first game step (including a `?t=` fast-forward that runs at load):* `tc = GameDNA_TouchControls.create({canvas, mode: 'events', map: {up, down, left, right, a, b, start}, avoid, params: {pad: 'dpad', side: 'left', placement: 'auto', size: 'medium', opacity: 0.6, start: 'on', dirs: 8, buttons: 2, show: 'auto', latch: 'all'}})`. `map` values are the game's own codes (an array when several keys do the same thing; the first is sent). `avoid()` returns the HUD bar, dialogue, menu and end-screen boxes on screen now, in canvas pixels.
3. *The fixed update step (the one function that advances the game once; the same one `?t=` fast-forward and autoplay run):* `tc.step()` as its FIRST line, before the game reads input, on every screen (title, pause, game over too). Never in render or per animation frame.
4. *Only if the game has no key handlers at all:* `mode: 'poll'` and read `tc.pressed(name)`, `tc.held(name)`, `tc.repeat(name)` (menus), `tc.axis()` in the step.
5. *The page head:* `<meta name="viewport" content="width=device-width, initial-scale=1">` if it is missing.

**Common mistakes** (symptom -> fix):

- A quick tap or a 0 ms key press is lost, or the title needs two presses -> `tc.step()` is not the first line of the fixed step, or `latch` is `touch` on a game that only checks held keys.
- Every touch counts twice -> poll mode used while the game's own key handler also reads the sent keys; use one mode.
- Controls cover the score bar or a dialogue box -> `avoid()` misses that box; return every HUD, dialogue and menu rect that is on screen now.
- The game's own canvas taps stopped working -> its pointer handlers were removed or rewired; leave them, touches off the controls reach them unchanged.
- Autoplay or `?t=&freeze=1` ends differently -> something calls `tc.press` / `tc.tap` from game code; only people and tests press.
- Controls on a desktop -> `show: 'always'`; keep `auto`.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Touch controls with edge-latched input] On a 390x844 touch phone: the deck shows below the game (portrait), beside or over it (landscape), never on the HUD; nothing on a desktop until a touch.
- [Touch controls with edge-latched input] Tap A on the title starts; holding a direction moves; a second finger on A while holding a direction acts; sliding from B to A releases B and presses A.
- [Touch controls with edge-latched input] A 0 ms key tap (keydown and keyup in the same task) triggers its action exactly once; a key press hides the deck, a touch shows it again.
- [Touch controls with edge-latched input] The game's own canvas taps still work.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `touch-controls.js` sha256 `1be18de52d42ea5c...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Touch controls with edge-latched input] Every `map` code appears in the game's key table; `tc` exists before the first step; `tc.step()` is called once per step and nowhere else; no handler, tap zone or autopilot removed.
- [Touch controls with edge-latched input] Trace one touch on A: pointerdown -> `keydown` with the action code -> the game's handler records it -> `tc.step()` -> the step reads it -> finger up -> `keyup` after the next step.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

# Add typewriter dialogue box and expressive portraits to my game

Add the 2 game elements below to MY existing game, which you have not seen. Each is a finished module file given with this prompt:

- `dialogue-box.js` (one global, `GameDNA_DialogueBox`), API reference `dialogue-box.README.md`
- `expressive-portraits.js` (one global, `GameDNA_Portraits`), API reference `expressive-portraits.README.md`

README example names are placeholders.

## Where it goes in my game (my choice; follow it exactly)

- **Typewriter dialogue box:** Use the dialogue box for exactly: everything the game already shows as text in a message box: talking to characters, reading signs, item and chest messages. Only text the player reads and dismisses (talk, signs, item/chest messages, story beats); leave self-clearing captions, combat logs, banners and the game's own result overlays as they are.

## Shared premises

1. **Include each module file verbatim; never edit it.** Load it with its own `<script src>` before the game's script, or paste it unchanged into its own `<script>` tag. If a module seems to need a change, adapt my game around it and tell me.
2. **Resolution:** keep my game's native resolution and integer scaling as they are. Call module draw functions on my 2D context inside the same transform as my sprites (one module pixel = one game pixel), smoothing off.
3. **Time:** drive every module from one fixed 60 Hz step (1000 / 60 ms). If my loop uses variable delta time, accumulate it and run whole steps (at most 250 ms per frame).
4. **Coordinates:** native screen pixels (world minus camera) unless a section says tiles.
5. **Art and names:** anything new you draw or name is original (no real game, character, place or brand names); English UI text; do not restyle my game.
6. **Hook, don't replace:** add calls or change bodies; never delete or rename a function.
7. **Keep every other caller working.** Find every caller and reader of what you change (turn order, input, moves, menus, HUD): autopilot/AI, test hooks, URL parameters such as `?auto=1`, `?t=` and `?freeze=1`, keyboard shortcuts, end-turn buttons. Update each one. My game's own autoplay must still finish a whole game. Keep existing HUD info (HP bars, max HP) and existing commands.

## Order of work

1. **Read the game first.** Write down (file, function) where these live: loop/update step; draw pass and its order (background, actors, effects, HUD); input; where damage/HP changes are applied; where turns, actions or selections are chosen and played; HUD windows and their rects; camera; battle/scene start and end; and every caller from premise 7.
2. **Check the prerequisites** below against those notes. If one is missing, add the smallest working version and tell me.
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Typewriter dialogue box [ui], (2) Expressive portraits [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Typewriter dialogue box:** the game's existing function that shows text (talking, signs, item messages), in update logic: open(lines, {onEnd}) there; what ran after the old text closed moves into onEnd; the confirm input routed to the box while busy() (press() on the key-down edge, optional hold(down), or key(code, down)); a fixed 60 Hz update step; the play field size in native px; rectangles of UI to keep clear (optional); optional: the game's autoplay flag.
- **Expressive portraits:** a fixed 60 Hz update step; the play field size in native px (the same field the dialogue box uses); a cast: one small spec per speaking character, keyed by the line's speaker / who; optional: rectangles of UI to keep clear (HUD, menus).

## Element 1: Typewriter dialogue box (`dialogue-box.js`, `GameDNA_DialogueBox`)

A typewriter text box: lines from a plain `[{speaker, who, text}]` array type out letter by letter (pauses at punctuation), a name plate sits on the speaker's side, a blinking arrow waits; Z / Enter / tap finishes the page, then advances; holding fast-forwards. It opens at the bottom, or at the top when the speaker stands there, and never covers the HUD. While it is open (`busy()`) the confirm input goes to the box and the world waits; `onEnd` runs when it closes. Autoplay advances it by itself, so `?auto=1` ends the same.

**Use the dialogue box for exactly: everything the game already shows as text in a message box: talking to characters, reading signs, item and chest messages. Only text the player reads and dismisses (talk, signs, item/chest messages, story beats); leave self-clearing captions, combat logs, banners and the game's own result overlays as they are.**

**Parameters chosen:** `speed` = 40, `pause` = 160, `rows` = 3, `place` = auto, `nameTag` = on, `autoAdvance` = 0, `hold` = on, `tint` = a, `dim` = 0.

**Where it goes** (by role; find these places in my game):

1. *Once, after the screen size and HUD layout exist:* `dlg = GameDNA_DialogueBox.create({bounds, params: {speed: 40, pause: 160, rows: 3, place: 'auto', nameTag: 'on', autoAdvance: 0, hold: 'on', tint: 'a', dim: 0}, autoplay: () => <autoplay flag>, getAnchor: (who, line) => <that character's sprite rect {x, y, w, h} on SCREEN now, or null>, uiRects: () => [HUD, menus], onTick: ch => <text blip, optional>})`. `bounds` = the play field `{x, y, w, h}` in native px.
2. *The game's existing text function (or the moments in the lead), in update logic: keep its name and arguments. Grep all its callers and any code that sets the dialog state directly:* `dlg.open(lines, {onEnd: r => { ... }})` with `lines = [{speaker: 'Elder', who: '<sprite id>', text: '...'}, {text: 'narration'}]`. Keep the old dialog flag set while open; move what ran after the old text closed (quest flags, callbacks, scene changes) into `onEnd`, and clear the flag there. Delete only the old box drawing.
3. *Top of your fixed update step (the one the animation loop, the `?t=&freeze=1` fast-forward and autoplay all call):* `if (dlg.busy()) { if (<confirm pressed this step, from the player>) dlg.press(); dlg.hold(<confirm held>); dlg.update(1000 / 60); return; }` so the world and the action wait; if the old box closed on Back, call `dlg.end()` there; pause/restart keys stay outside the gate. When not busy: `dlg.update(1000 / 60)` once per step. The step that calls `open()` still runs the rest of its world update (other units, timers, encounter checks); the gate takes effect from the next step.
4. *Your draw pass:* `dlg.draw(ctx)` last, after the HUD, outside any shake translate.
5. *New game / restart / scene change:* `dlg.clear()` first.

**Common mistakes** (symptom -> fix):

- Every battle caption now waits for Z and autoplay takes far longer -> self-clearing captions, combat logs and wave banners were routed through the box; leave them as they were.
- The VICTORY / GAME OVER screen is gone -> keep the game's own result overlays; if lines play there, draw the overlay after the talk (`!dlg.busy()`).
- Narration shows a made-up name plate ("You", a monster name) -> narration and system text have no `speaker`.
- The first page is skipped the moment the box opens -> the opening confirm is also routed to the box, or "key is down" is sent every frame; route the key-down edge only.
- The quest / battle never continues after the talk -> the after-text code stayed in the old advance branch; move it into `onEnd` (synchronous; never `await`).
- Autoplay or a test hook stops working -> it read the old dialog flag; keep the flag set while the box is open and clear it in `onEnd`.
- `?auto=1` hangs on the box -> pass the autoplay flag as `autoplay`, and call `update` inside the fixed step the freeze loop calls.
- The world keeps moving under the box -> gate the whole step on `busy()`.
- Later encounters shift or autoplay ends differently -> the step that opened the talk returned early; let it finish its world update and gate from the next step.
- The box covers the speaker -> `getAnchor` must return the sprite rect on screen (after camera and HUD offsets), not in world coordinates.
- A banner or result overlay leaves no room for the box -> draw the overlay after the talk (`!dlg.busy()`) or pass it as a UI rect.

## Element 2: Expressive portraits (`expressive-portraits.js`, `GameDNA_Portraits`)

Needs the H-01 dialogue box (`GameDNA_DialogueBox`) for conversations; it hooks only the box's `create({bounds, onLine})` options and its public `rect()` / `state()`. Hand-made-looking 16-bit bust portraits generated from small seeded specs (one per speaking character), with 7 expressions (neutral, happy, angry, sad, surprised, determined, hurt) that change only brows, eyes and mouth, blinking, and a mouth that moves while the dialogue box types. The speaker's framed portrait slides in beside the H-01 dialogue box, takes its expression from the line's `expr` field and dims while someone else talks; the box is narrowed so it sits beside the portrait. Menus (character select, status) can draw the same portraits as framed panels.

**Parameters chosen:** `size` = 48, `layout` = left, `frame` = window, `enter` = slide, `enterMs` = 160, `listener` = dim, `blinkMs` = 3600, `mouthMs` = 90, `outline` = ink, `backdrop` = tint.

**Where it goes** (by role; find these places in my game):

1. *Read first: the dialogue box's `create(...)` call; every `update(`, `draw(` and `clear(` of that box; where lines are built and who speaks them:* Write a cast: one spec per speaking character, keyed by the lines' `speaker` (or `who`): `{seed: <fixed number>, name, age: child|young|adult|elder, gender: female|male|any, skin, hair, hairColor, headgear, collar, cloth, bg}` (only `seed` is required; options in the README), fitted to each character's role, with varied ages and skin tones.
2. *Just before the dialogue box is created:* `const TALK_FIELD = <the box's old bounds>;` (a NEW name: grep it) and `por = GameDNA_Portraits.create({bounds: TALK_FIELD, uiRects: () => [HUD, menus], cast, params: {size: 48, layout: 'left', frame: 'window', enter: 'slide', enterMs: 160, listener: 'dim', blinkMs: 3600, mouthMs: 90, outline: 'ink', backdrop: 'tint'}})`.
3. *The dialogue box's create options (keep every other option):* `bounds: () => por.reserve(TALK_FIELD)` and `onLine: (line, i, ctl) => por.onLine(line, i, ctl)` (if a create-level `onLine` exists, call both; a per-`open()` `onLine` stays). Right after the box exists: `por.attach(dlg)`.
4. *Where lines are built:* Add `expr` to each spoken line (`neutral`, `happy`, `angry`, `sad`, `surprised`, `determined`, `hurt`) to fit its words; for lines built from strings, a small lookup. Never change the text.
5. *Next to EVERY `update(` of the box (the busy branch too), inside the fixed step the animation loop, `?t=&freeze=1` and autoplay all call:* `por.update(1000 / 60)`.
6. *Right after every `draw(` of the box:* `por.draw(ctx)` (outside any shake translate).
7. *Next to every `clear()` of the box (new game, restart, scene change):* `por.clear()`.
8. *Only if the game has a status / party / select screen:* `GameDNA_Portraits.drawPanel(ctx, por.portrait('<key>'), {x, y}, {expr, t: <frame count> * 1000 / 60})` where the character is shown.

**Common mistakes** (symptom -> fix):

- The portrait overlaps the start of the text -> the box still has its static `bounds`; use `bounds: () => por.reserve(TALK_FIELD)`.
- Every line shows the neutral face -> `onLine` went into `open(..., {onLine})` instead of the box's `create({onLine})`.
- The mouth never moves or portraits never leave -> `por.attach(dlg)` missing, or `por.update` runs only when the box is not busy.
- `Identifier ... has already been declared` at load -> the game already has a constant with that name (`FIELD`); pick a new one.
- Frozen shots differ -> a menu passed wall time as `t`; pass the step clock.
- Faces blurry when scaled -> keep smoothing off and integer canvas scale; never flip with CSS (use `flip`).

## Cross-element wiring

**Expressive portraits with Typewriter dialogue box:**

- **UI rects:** `dlg.rect()` is the open box with its name plate, or null; add it to the other element's obstacles / UI rects. Return them from the portraits' `uiRects()` as well, so a panel never covers them.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Typewriter dialogue box] everything the game already shows as text in a message box: talking to characters, reading signs, item and chest messages shows in the box: letters type out, the name plate sits on the speaker's side, the arrow blinks; Z / Enter / tap finishes the page, then advances; holding Z fast-forwards.
- [Typewriter dialogue box] The box never covers the speaker or the HUD; the world waits while it is open; what happened after the old text closed still happens; captions, banners and result overlays look and time as before; narration has no name plate.
- [Typewriter dialogue box] `?t=<ms>&freeze=1` gives the same frame every time; `?auto=1` ends with the same result as before, no console errors.
- [Expressive portraits] When a character talks, their framed portrait sits beside the box (never over the text, the HUD or menus); the box starts beside the panel.
- [Expressive portraits] The expression changes with the line; the mouth moves while letters type and stops when the page is complete; the face blinks; narration shows no portrait.
- [Expressive portraits] `?t=<ms>&freeze=1` is identical twice; `?auto=1` ends as before with no console errors.
- [combined] No portrait panel covers the other element's windows, plates or HUD.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `dialogue-box.js` sha256 `7282f3babbe59204...`, `expressive-portraits.js` sha256 `79a374b022cfe242...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Typewriter dialogue box] Grep `open(`: only in the text function (update logic); list every caller of that function and confirm each reaches it.
- [Typewriter dialogue box] Grep `update(`: every fixed step including while busy; the freeze loop calls that step. The old dialog flag is true while the box is open.
- [Typewriter dialogue box] Walk one autoplay line of 40 letters: open 0.1 s -> ~1 s typing -> 0.6 s -> close -> `onEnd` -> the same quest / battle step as before.
- [Expressive portraits] Module byte-identical, loaded before the game script; every new top-level identifier is unused elsewhere.
- [Expressive portraits] Grep the box's `update(`, `draw(`, `clear(`: each has `por.update(`, `por.draw(`, `por.clear(` beside it.
- [Expressive portraits] Each speaker that should have a face has a cast key; every `expr` is one of the seven names. Walk one line: open -> onLine (face, reserved column) -> typing (mouth) -> close (panel slides out).
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

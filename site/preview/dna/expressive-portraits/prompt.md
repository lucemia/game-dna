# Add Expressive portraits to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `expressive-portraits.js` (one global, `GameDNA_Portraits`), API reference `expressive-portraits.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Expressive portraits [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Expressive portraits:** a text box: the Typewriter dialogue box dialogue box element (or the game's own box behind an adapter); a fixed 60 Hz update step; the play field size in native px (the same field the dialogue box uses); a cast: one small spec per speaking character, keyed by the line's speaker / who; optional: rectangles of UI to keep clear (HUD, menus).

## Element 1: Expressive portraits (`expressive-portraits.js`, `GameDNA_Portraits`)

Needs the Typewriter dialogue box dialogue box (`GameDNA_DialogueBox`) for conversations; it hooks only the box's `create({bounds, onLine})` options and its public `rect()` / `state()`. Hand-made-looking 16-bit bust portraits generated from small seeded specs (one per speaking character), with 7 expressions (neutral, happy, angry, sad, surprised, determined, hurt) that change only brows, eyes and mouth, blinking, and a mouth that moves while the dialogue box types. The speaker's framed portrait slides in beside the Typewriter dialogue box dialogue box, takes its expression from the line's `expr` field and dims while someone else talks; the box is narrowed so it sits beside the portrait. Menus (character select, status) can draw the same portraits as framed panels.

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

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Expressive portraits] When a character talks, their framed portrait sits beside the box (never over the text, the HUD or menus); the box starts beside the panel.
- [Expressive portraits] The expression changes with the line; the mouth moves while letters type and stops when the page is complete; the face blinks; narration shows no portrait.
- [Expressive portraits] `?t=<ms>&freeze=1` is identical twice; `?auto=1` ends as before with no console errors.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `expressive-portraits.js` sha256 `79a374b022cfe242...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Expressive portraits] Module byte-identical, loaded before the game script; every new top-level identifier is unused elsewhere.
- [Expressive portraits] Grep the box's `update(`, `draw(`, `clear(`: each has `por.update(`, `por.draw(`, `por.clear(` beside it.
- [Expressive portraits] Each speaker that should have a face has a cast key; every `expr` is one of the seven names. Walk one line: open -> onLine (face, reserved column) -> typing (mouth) -> close (panel slides out).
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

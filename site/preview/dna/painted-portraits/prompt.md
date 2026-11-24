# Add Portrait set with expressions to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `painted-portraits.js` (one global, `GameDNA_PaintedPortraits`), API reference `painted-portraits.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Portrait set with expressions [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Portrait set with expressions:** a text box: the Typewriter dialogue box dialogue box element (or the game's own box behind an adapter); a fixed 60 Hz update step; the play field the dialogue box uses, in the units it is drawn in; the game's boot moved into onReady (images loaded before the first step); the portrait image files: the shipped sample cast, or the designer's own set made with prompt.md; optional: rectangles of UI to keep clear (HUD, menus).

## Element 1: Portrait set with expressions (`painted-portraits.js`, `GameDNA_PaintedPortraits`)

Painted bust portraits (pre-generated image files: a neutral base per character and each expression made as an edit of it, aligned on one canvas) shown beside the dialogue box: the speaker slides in and stands on the box's top edge, cross-fades to each line's `expr` (neutral, happy, angry, sad, surprised, determined), breathes, blinks on the neutral face, bobs while text types, and dims while someone else talks. Works with the Typewriter dialogue box dialogue box (same hooks as Expressive portraits expressive-portraits) or with the game's own text box through `attach({rect})` + `onLine({speaker, expr})`. The game never calls an image generator.

**Parameters chosen:** `layout` = two, `place` = stand, `height` = 0, `enter` = slide, `enterMs` = 260, `fadeMs` = 180, `listener` = dim, `dim` = 0.45, `breathe` = 1, `blinkMs` = 4200.

**Where it goes** (by role; find these places in my game):

1. *Read first: the boot (first step, the `?t=` fast-forward, the first animation frame); the function that opens dialogue and EVERY caller; where the line index advances and where the box closes; where the text box is drawn (its rect and the transform it is drawn in); the fixed update step incl. the branch that runs while the box is open; restart / new game; HUD rects:* Write a cast keyed by the exact speaker names: `{'<speaker>': {src: '<folder>/<id>-{expr}.webp', side: 'left' | 'right'}}` (shipped cast: `maren` a woman warden in her forties, `tobin` a young man scholar, `hesper` an elderly woman merchant, `oswin` a male shopkeeper in his fifties; map by role, gender and age as the game shows them, one speaker per set; a speaker no set fits keeps no portrait).
2. *Next to the dialogue code (a NEW top-level name: grep it first):* `const por = GameDNA_PaintedPortraits.create({bounds: <the field the box is laid out in, in the units it is drawn in>, cast, uiRects: () => [HUD], params: {layout: 'two', place: 'stand', height: 0, enter: 'slide', enterMs: 260, fadeMs: 180, listener: 'dim', dim: 0.45, breathe: 1, blinkMs: 4200}})`.
3. *Typewriter dialogue box dialogue box in the game: its create options (keep every other option):* `bounds: () => por.reserve(<field>)` and `onLine: (line, i, ctl) => por.onLine(line, i, ctl)` (call any old create-level onLine too), then `por.attach(dlg)`.
4. *The game's own text box instead:* `por.attach({rect: () => <box rect while it is open, else null>})`; wherever a line is shown (the box opens, the line index advances and is still in range) call `por.onLine({speaker, expr})`.
5. *Where lines are written:* Give each spoken line an `expr` that fits its words (objects: an `expr` field; plain strings: a parallel list). Never change the text.
6. *The fixed step (both the box-open branch and the normal one), the step that `?t=&freeze=1` and autoplay also call:* `por.update(1000 / 60)` once per step.
7. *Right after the text box is drawn, in the same transform, outside any shake:* `por.draw(ctx)`.
8. *Restart / new game / scene change:* `por.clear()` (never reload images there).
9. *The boot:* Replace the old boot call with `por.onReady(boot)` (boot = the old start code, unchanged). If Art-direction lock art-direction-lock already gates the boot: `GameDNA_Assets.load(list, {onReady: () => por.onReady(boot)})`.

**Common mistakes** (symptom -> fix):

- Frozen shots (`?t=&freeze=1`) without portraits, or different on each load -> the old boot still runs directly; boot only from `por.onReady(boot)`.
- Every line shows the neutral face -> `onLine` not called where the line advances (own box), or passed to `open(..., {onLine})` instead of the Typewriter dialogue box box's `create({onLine})`; or the lines have no `expr`.
- Portraits never leave -> `attach` missing, or the attached `rect()` never returns null when the box closes; or `por.update` runs only when the box is closed.
- The bust is tiny or covers the whole screen -> `bounds` is in other units than the box (e.g. 640x360 while the box is drawn in a scaled 320x180 layer).
- A visible flat edge under the bust -> `por.draw` was called before the box or in another transform; draw right after the box.
- A shopkeeper's window that opens after the talk keeps the bust on screen -> `rect()` must return null as soon as the TOP window is no longer the text box.
- `Identifier ... has already been declared` -> the game already has that name (`FIELD`, `CAST`); pick a new one.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Portrait set with expressions] While a character talks, their painted bust stands on the box's top edge (or beside it) on its side, never over the text, the HUD or menus; narration shows no new portrait.
- [Portrait set with expressions] Each tagged line shows its expression (cross-fade, the bust does not jump); with two speakers the listener is dimmed; the busts slide out when the box closes.
- [Portrait set with expressions] `?t=<ms>&freeze=1` is identical twice with the portraits in it; `?auto=1` ends as before with no console errors.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `painted-portraits.js` sha256 `28184daf13e4b1f9...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Portrait set with expressions] Module byte-identical, loaded before the game script; every new top-level identifier is unused elsewhere; every cast `src` file exists (`neutral` at least).
- [Portrait set with expressions] Grep the box's open / advance / close sites: each line shown calls `por.onLine` (Typewriter dialogue box: through create({onLine})); the close makes `rect()` null (Typewriter dialogue box: `attach(dlg)`).
- [Portrait set with expressions] Grep `por.update(` (every step, box-open branch too), `por.draw(` (after the box), `por.clear(` (restart); the old boot runs only from `onReady`.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

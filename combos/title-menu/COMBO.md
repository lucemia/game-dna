# Add title screen & menu flow to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `title-menu.js` (one global, `GameDNA_TitleMenu`), API reference `title-menu.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Title screen & menu flow [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Title screen & menu flow:** the game's canvas (the menu lays its own overlay canvas over it); isTitle(): the game's own title scene; onStart(kind) = what the old title confirm did; onQuitToTitle() = back to that scene; canPause(): where play can be paused; optional onRestart(), canContinue(), onOption(key, value), uiRects() / obstacles() in native px; a fixed 60 Hz update step; while titleShown(): draw only the title background (not the old logo or PRESS START text).

## Element 1: Title screen & menu flow (`title-menu.js`, `GameDNA_TitleMenu`)

A title screen on the game's own backdrop (its name as a bold pixel logo with a glint, a tagline, PRESS START), a title menu (CONTINUE, NEW GAME, OPTIONS, QUIT), persistent options (three volumes, text speed, screen shake, flashing, reduce motion, large text, high contrast, a controls page), a wipe into play and a pause menu (RESUME, OPTIONS, RESTART, QUIT TO TITLE) with yes / no confirms. Keys, mouse and touch; drawn on its own overlay canvas at a readable size on phones; off under the game's test flags.

**Parameters chosen:** `transition` = diamond, `transMs` = 320, `panel` = royal, `quit` = on, `pauseButton` = auto, `hints` = on.

**Where it goes** (by role; find these places in my game):

1. *Once, after the canvas and the game state exist:* `menu = GameDNA_TitleMenu.create({canvas, title: '<game name>', tagline, colors: {logo: [<light>, <warm>], panel: 'royal', accent}, isTitle: () => <title scene>, canPause: () => <in play, not results>, onStart: kind => { <exactly the old title confirm> }, onRestart, onQuitToTitle: () => { <back to the title scene> }, pauseKeys: [<Escape, P minus keys used in play>], uiRects: () => <HUD boxes in play, native px>, obstacles: () => <characters and key props on the title backdrop>, titleCover: () => <HUD panels that would sit empty on the title>, controls: [[action, keys], ...], onOption: (k, v) => { <apply> }, params: {transition: 'diamond', transMs: 320, quit: 'on', pauseButton: 'auto', hints: 'on'}})`.
2. *First line of the fixed step (every scene; the loop, the ?t= replay and autoplay all call it):* `menu.update(STEP_MS); if (menu.busy()) { <drop queued presses>; return; }` so the world, timers and frame counter wait.
3. *Every render path, last (title, play, results, early returns):* `menu.draw()`. On the title, while `menu.titleShown()`, draw only the backdrop art and frames, not the old name / press-start text.
4. *Where the game draws world text (speech bubbles, floating labels):* skip it while `menu.paused()`.
5. *Where the game reads settings:* volumes 0-10 (`master`, `music`, `sfx`), `textSpeed`, `shake`, `flashes` through `menu.get(key)` or `onOption`.

**Common mistakes** (symptom -> fix):

- `?auto=1` hangs on the title or `?t=` stills changed -> the old title confirm / autopilot path was removed or `skip: false` was passed; keep the old title code, the module is off under the flags.
- A press on the menu also jumps or attacks in the game -> the step is not gated on `busy()`, or presses queued while busy are replayed afterwards.
- Two logos / two PRESS START lines -> the old title text is drawn while `titleShown()`.
- Black band under the title -> the early return skipped the frames the old title drew; skip only text.
- Escape stopped working as "back" -> it is in `pauseKeys`.
- The pause button covers the score -> that HUD box is missing from `uiRects()`.
- PRESS START over the hero on the title -> pass the hero box in `obstacles()`.
- An empty HUD panel fills the bottom of the title -> pass it in `titleCover()`; the module paints it and puts the menu there.
- Menu pixels bigger than the game's -> do not pass `unit: 'readable'`; the default shares the game's pixel grid.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Title screen & menu flow] Title: backdrop art, logo, PRESS START; Z opens the menu with NEW GAME (or CONTINUE) selected; NEW GAME wipes into play; arrows + Z, mouse clicks and taps reach every row; options persist after a reload.
- [Title screen & menu flow] In play the pause key / button freezes the world; QUIT TO TITLE asks first and returns to the title; results / game over still return to the title with the game's own confirm, where one more Z starts a new game.
- [Title screen & menu flow] `?auto=1` ends exactly as before, `?t=&freeze=1` stills identical (the module is off), no console errors; at 390 px wide no text overlaps.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `title-menu.js` sha256 `383fa872c0952025...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Title screen & menu flow] `menu.update` once, first in the step; `menu.draw` at the end of every render path (also the title early return).
- [Title screen & menu flow] `onStart` runs the same code as the old title confirm; the old confirm and the autopilot's title press still exist.
- [Title screen & menu flow] `pauseKeys` unused in play; `canPause()` false on the title, results and game over.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

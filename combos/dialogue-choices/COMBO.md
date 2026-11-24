# Add branching choices with flags to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `dialogue-choices.js` (one global, `GameDNA_DialogueChoices`), API reference `dialogue-choices.README.md`

README example names are placeholders.

## Where it goes in my game (my choice; follow it exactly)

- **Branching choices with flags:** Branch exactly: the main quest giver: accept the quest, ask about the reward, or ask for advice (once each); the advice gives a small bonus, and the reward question changes what they say when you return.

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Branching choices with flags [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Branching choices with flags:** a text box: the H-01 dialogue box element (or the game's own box behind an adapter); the game's existing talk function, in update logic: start(name, {onEnd}) there; what ran after the old talk moves into onEnd; input (directions, confirm, cancel, pointer); a fixed 60 Hz update step; rectangles of UI to keep clear; optional: the game's autoplay flag, its save / load (getFlags / setFlags), game effects for flags (onFlag).

## Element 1: Branching choices with flags (`dialogue-choices.js`, `GameDNA_DialogueChoices`)

Branching talks from a plain script: after a question line a 2-4 option window opens beside the text box, arrows move a hand cursor, Z / tap picks; options the player cannot take yet are grey and say why; an optional countdown picks the default. Picks set flags (`set`, `inc`) that later lines check (`if: 'gold>=10 && !metElder'`), jump to labels and rejoin; `once` lines and options are remembered; `{$flag}` prints a value. `validate()` lists unreachable labels and unknown flags; `getFlags()` / `setFlags()` save them as plain JSON. It drives the H-01 dialogue box (`box:`) or the game's own text box (`adapter:`). Autoplay picks each menu's `default`, so `?auto=1` ends the same.

**Branch exactly: the main quest giver: accept the quest, ask about the reward, or ask for advice (once each); the advice gives a small bonus, and the reward question changes what they say when you return.**

**Parameters chosen:** `menuPlace` = auto, `timeout` = 0, `wrap` = on, `disabled` = show, `tint` = a.

**Where it goes** (by role; find these places in my game):

1. *A script object next to the game's other data:* `{name: [entries]}` in neutral English: lines `{speaker, text}`, a question line with `choices: [{id, text, goto, set, inc, if, reason}]` (2-4), `label`s the options jump to, branches that rejoin. Every menu's `default` = the answer that keeps today's story. Every flag the game reads goes in `flags` with its start value.
2. *Once, after the screen size and HUD layout exist (and after the text box exists):* `talk = GameDNA_DialogueChoices.create({script, flags, bounds, params: {menuPlace: 'auto', timeout: 0, wrap: 'on', disabled: 'show', tint: 'a'}, autoplay: () => <autoplay flag>, uiRects: () => [HUD, menus], onFlag: (name, value) => <game effects>})` plus EITHER `box: <the GameDNA_DialogueBox instance>` OR `adapter: {show(line, done), close(), rect()}` on the game's own text box (README "Adapter mode"). Run `talk.validate()` once and fix every error, unreachable label and unknown flag.
3. *The game's existing talk function, in update logic: keep its name, arguments and the old dialog flag. Grep all its callers:* `talk.start('<name>', {onEnd: r => { <clear the old flag>; <what ran after the old talk> }})`; the game reads flags with `talk.get(name)` and changes them with `talk.set` / `talk.inc`.
4. *Top of your fixed update step (the one the animation loop, the `?t=&freeze=1` fast-forward and autoplay all call):* Box mode: `if (talk.busy()) { up -> talk.move(-1); down -> talk.move(1); confirm (key-down edge) -> talk.press(); back -> talk.back(); talk.hold(<confirm held>); talk.update(1000 / 60); return; }`, `talk.update(1000 / 60)` once per other step, and remove the box's own `update` / `draw` / `press` calls (talk calls them). Adapter mode: the same block only while `talk.choosing()`, before the game's own box input.
5. *Your draw pass:* `talk.draw(ctx)` last, after the HUD, outside any shake translate (box mode: it draws the box, then the menu).
6. *Save / load and new game:* Save `talk.getFlags()` with the game state, `talk.setFlags(data)` on load; new game / restart: `talk.clear(); talk.resetFlags();`.

**Common mistakes** (symptom -> fix):

- The menu picks an answer the moment it opens -> the confirm is sent while held; route key-down edges only.
- The text box runs twice as fast -> box mode: `talk.update` already updates the box; remove the box's own `update` / `draw` / `press` calls.
- Adapter mode: the game's box advances under the menu -> while `talk.choosing()` its input must not reach the box.
- Adapter mode: the question vanishes while choosing -> `show(line, null)` means keep that line on screen.
- `?auto=1` ends differently -> a menu's `default` changes the story; set `default` to the answer that keeps the original path.
- A later line never shows -> a flag typo or a flag missing from `flags`; `validate()` lists unknown flags.
- Old answers survive a new game -> call `talk.resetFlags()` there; saves must include `talk.getFlags()` (once-marks are flags).

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Branching choices with flags] the main quest giver: accept the quest, ask about the reward, or ask for advice (once each); the advice gives a small bonus, and the reward question changes what they say when you return: the menu opens beside the text box after the question; arrows move the hand, Z / tap picks; a locked option is grey and shows its reason; the branches rejoin.
- [Branching choices with flags] A flag set by a choice changes a later line and something in the game; the menu never covers the HUD or the text box; the world waits while the talk is open.
- [Branching choices with flags] `talk.validate()` is ok; `?t=<ms>&freeze=1` gives the same frame every time; `?auto=1` ends with the same result as before, no console errors.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `dialogue-choices.js` sha256 `658c4cbad9696dd1...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Branching choices with flags] Both modules byte-identical and loaded before the game (dialogue-box.js first); `validate()` reports ok.
- [Branching choices with flags] Grep `start(`: only in the talk function (update logic); every caller reaches it. Grep `update(`: every fixed step including while busy; no leftover box `update` / `draw` in box mode.
- [Branching choices with flags] Walk one autoplay menu: question typed -> menu opens (80 ms) -> hand on `default` (300 ms) -> picked (600 ms) -> its `goto` -> the same story as before.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

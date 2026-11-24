# Add Talking portraits to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `talking-portraits.js` (one global, `GameDNA_TalkingPortraits`), API reference `talking-portraits.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Talking portraits [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Talking portraits:** every place the game sets a dialogue or message line (open and each advance) and where it closes; the confirm key / tap handler (a press first finishes a typing line); a fixed update step, also while the dialogue pauses the game (also the ?t= fast-forward); the dialogue box rect in native px, drawn by the game; the game's own text drawing; a cast: a Expressive portraits portrait spec or a draw callback per speaking character; expressive-portraits.js loaded first for specs.

## Element 1: Talking portraits (`talking-portraits.js`, `GameDNA_TalkingPortraits`)

Talking portraits: the speaker's pixel face in the dialogue box; the mouth moves only while letters type and shuts on spaces, punctuation, pauses and at the line end; random blinks, breathing; [emotion] tags change the face through a short blink, never a jump; faces in a HUD react to hits.

**Parameters chosen:** `cps` = 40, `mouthMs` = 80, `transMs` = 200, `blinkMin` = 2200, `blinkMax` = 5600, `breathMs` = 3600, `size` = 48, `frame` = window, `nameTag` = on.

**Where it goes** (by role; find these places in my game):

1. *Load:* `<script src="expressive-portraits.js">` (the Expressive portraits face generator, given as a plain file: never call its own `create`) then `<script src="talking-portraits.js">`, both before the game script, both unchanged.
2. *Once, when the game starts:* `TALK = GameDNA_TalkingPortraits.create({ cast, params: {cps: 40, mouthMs: 80, transMs: 200, blinkMin: 2200, blinkMax: 5600, breathMs: 3600, size: 48, frame: 'window', nameTag: 'on'} })`. One cast entry per speaking character: a spec (`age`, `gender`, `skin`, `hair`, `hairColor`, `facial`, `headgear`, `collar`, `cloth`, `bg`, `side`) matching the sprite's colours, or the game's own portrait `{w, h, draw(ctx, x, y, f)}`.
3. *Every place a line is set (dialogue open AND each advance):* `TALK.say(line, {who, emotion})`, or the raw string when it starts with `Name: `; add `[happy]`-style tags to lines with an obvious mood without changing the words. Where the dialogue closes: `TALK.close()`. A game with no dialogue but battle messages: let the acting character `say` a short line and `close()` when the action ends.
4. *Confirm key / tap (only where the game already waits for one, e.g. dialogue):* `if (TALK.press()) return;` before the existing advance code (the first press finishes a typing line). Barks and battle messages keep the game's own pacing: they advance on its existing timer; never add a confirm gate or wait for the typing.
5. *The fixed step (also the ?t= replay):* `TALK.update(stepMs)` every step, including the branch that returns early while a dialogue is open.
6. *Dialogue drawing:* Draw the box as before, then `lay = TALK.drawSpeaker(ctx, box)`, then the game's text: `TALK.rows(measure, lay.text.w)` at `lay.text.x, lay.text.y + i * lineH`. A box shorter than the panel + 8 px (56 + 8 at size 48): make the box taller rather than letting the panel rise over characters or the HUD. A box you add (battle barks): width = panel + 6 + the line's text width + 12, placed where it covers no unit and no key scenery.
7. *Optional:* `TALK.drawFace(ctx, name, x, y)` for party / status faces; `TALK.react(name, 'hurt', 700)` where that character takes damage. Restart / new game: `TALK.clear()`.

**Common mistakes** (symptom -> fix):

- Faces never blink or talk -> `update` is not in the step that runs while the dialogue is open.
- The battle stops after every action until Z is pressed -> a confirm gate was added to barks / messages; they must follow the game's own timer.
- Autoplay stalls or the game advances twice -> confirm calls `press()` but ignores its result; `true` means "finished the typing", do not advance.
- Words jump to the next row while typing -> the text was wrapped from `text()`; use `rows(measure, width)`.
- Text under the portrait or the name plate -> text drawn at the old box origin instead of `lay.text`.
- Every face blank, a warning in the console -> `expressive-portraits.js` not loaded before `talking-portraits.js`.
- A line keeps "Elder:" in the text -> the name is not a cast key (keys match case-insensitively).

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Talking portraits] A dialogue shows the speaker's face in the box; its mouth moves on letters and is shut on every space, comma, full stop and after the last character.
- [Talking portraits] An emotion tag changes the face with a blink (eyes half, shut, half), never a jump; idle faces blink every few seconds.
- [Talking portraits] The first confirm finishes the typing line, the next advances; `?auto=1` reaches the same end as before with no console errors.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `talking-portraits.js` sha256 `29e90e87573ef15f...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Talking portraits] Both module files unchanged and loaded in order; `say(` beside every line assignment; `press()` first in confirm; `update(` in the step incl. the dialogue branch; `close(` / `clear(` in place.
- [Talking portraits] Walk one real line: which characters type, where the mouth is shut, which emotion shows; count the autoplay presses for one whole dialogue.
- [Talking portraits] With no input at all the game still reaches its end (or its next idle screen) exactly as before.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

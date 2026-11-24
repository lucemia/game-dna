# Add talking portraits to my game

Defaults: cps 40, mouthMs 80, transMs 200, blinkMin 2200, blinkMax 5600, breathMs 3600, size 48.

You get `talking-portraits.js` (global `GameDNA_TalkingPortraits`) with its README, and `expressive-portraits.js` (the face generator it uses). Load both verbatim, `expressive-portraits.js` first, before my game script; never edit them, never call `expressive-portraits.js` yourself.

Goal: the speaker's portrait sits in the dialogue box, talks only while letters type, blinks, breathes, and changes emotion through a short transition.

Steps:

1. Find where my game sets each dialogue or message line (open AND each advance), its confirm handler, its fixed update step (used by the loop, `?t=` fast-forward and autoplay), the dialogue drawing, and restart.
2. Create one instance at start: `GameDNA_TalkingPortraits.create({ cast, params: { cps: {{cps}}, mouthMs: {{mouthMs}}, transMs: {{transMs}}, blinkMin: {{blinkMin}}, blinkMax: {{blinkMax}}, breathMs: {{breathMs}}, size: {{size}} } })`. Each speaking character gets a cast entry: a spec (fields and values in the README) matching their sprite (hair, beard, headgear, clothes), or the game's own portrait `{w, h, draw(ctx, x, y, f)}`.
3. Where a line is set, call `say(line, {who, emotion})`, or pass the raw string when it starts with `Name: `. Tag lines with an obvious mood (`[happy]`, `[sad]`, `[angry]`, `[surprised]`, `[determined]`, `[hurt]`, `[neutral]`) without changing the words. Only battle messages? The acting character `say`s a short line; `close()` when the action ends. Where the dialogue closes, call `close()`.
4. Only where my game already waits for a confirm (dialogue): `if (TALK.press()) return;` before the existing advance code. Barks and battle messages keep my game's own pacing: they advance on its existing timer; never add a confirm gate or wait for the typing.
5. Call `TALK.update(stepMs)` in the fixed step, also in the branch that runs while a dialogue is open.
6. Drawing: draw the box as before, then `const lay = TALK.drawSpeaker(ctx, box)`, then draw `TALK.rows(measure, lay.text.w)` inside `lay.text` with the game's own text function and line height. A box shorter than the panel plus 8 px: make it taller rather than letting the panel cover characters or the HUD. A new box (battle barks): size it to its line and place it where it covers no unit or key scenery. Text, name plate and portrait never overlap.
7. Optional: `drawFace` for party faces; `react(name, 'hurt', 700)` where a character with a face is hit.
8. Restart / new game: `clear()`.

Keep every other caller working (autoplay, `?t=&freeze=1`, keys, touch, restart); timed autoplay needs two presses per dialogue line and reaches the same ending. No wall time or `Math.random`.

Self-check without a browser (report the answers):
- Both module files unchanged, loaded first.
- `say(` beside every line assignment; `press()` first in confirm; `update(` in the step incl. the dialogue branch; `close(`, `clear(` in place.
- Every speaker name is a cast key; no new global collides with the game's.
- Walk one real line: which characters type, where the mouth is shut, which emotion shows.
- Count the autoplay presses for one whole dialogue.
- With no input at all, the game still reaches its end (or its next idle screen) exactly as before.

Acceptance checks (if you have a browser):
- A dialogue shows the speaker's portrait in the box; the mouth moves on letters and is shut on every space, comma, full stop and after the last character.
- An emotion tag changes the face through a blink, never a jump; idle faces blink.
- In dialogue, the first confirm finishes the line, the next advances.
- `?auto=1` reaches the same ending as before with no console errors; `?t=<ms>&freeze=1` stills are identical on reload.

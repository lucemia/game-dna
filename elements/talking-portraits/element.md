# D-05 Talking portraits

## What it is

Portraits that talk with the text. A typewriter reveals the line (or the module follows the game's own typewriter); the
speaker's mouth moves only while the last typed character is a letter or digit and is shut on spaces, punctuation, during
the holds after `. ! ?` and `, ; :`, while the panel slides in, when the line ends (also when it ends on a letter) and for
every face that is not speaking. Faces blink at seeded random gaps (now and then a double blink) and breathe (the bust rises
1 px for half a period). Each line carries an emotion (`emotion` field or `[happy]` tags at the start or inside the text);
a change goes through a blink-through transition with a 1 px posture beat (the new face appears with the eyes shut), never a
one-frame jump. The speaker's framed portrait sits at one end of the game's own dialogue box with a name plate on the box's
top edge, and the module hands back the text rect beside it, plus the typed rows wrapped on the full line (no word jumps).
Faces can also sit anywhere (party HUD, status screen) and `react` to hits. Faces are code-drawn 16-bit busts from the D-04
generator (`expressive-portraits.js`, used through `make` / `draw` only, unchanged) or the game's own portrait through a
draw callback that receives `{emotion, mouth, eyes}`.

## Default parameters

| key | default | meaning |
|---|---|---|
| cps | 40 | typed characters per second (reveal driven by `update(dt)` only) |
| pauseMs / commaMs | 300 / 140 | hold after `. ! ?` (and an ellipsis x1.3; `..` inside an ellipsis x0.5) / after `, ; :` and a spaced dash |
| mouthMs | 80 | one mouth frame while voiced: open, half, open, half, ... restarting at each word (a short word opens at once) |
| blinkMin / blinkMax | 2200 / 5600 | gap between blinks (seeded per face); 20 % of blinks are doubled 150 ms later; a transition counts as a blink |
| breathMs | 3600 | breathing period; the bust is 1 px up for half of it; 0 = off |
| transMs | 200 | expression change (100-600): eyes half to 30 %, the new face with eyes shut to 70 %, half to 100 % |
| size | 48 | D-04 portrait size (48 or 64); the framed panel is size + 8 |
| frame | window | panel frame: `window`, `plate` (through the skin) or `none` |
| nameTag | on | name plate over the box's top edge (inside the box when the box touches the canvas top) |
| enterMs | 140 | panel fade-in in 4 alpha steps and 3 px rise; a new speaker on the same side waits for the old panel to leave (60 %) |

## Variants

- **Classic 16-bit RPG** (default): 40 cps, 48 px framed portraits.
- **Chatty**: 60 cps, 60 ms mouth frames.
- **Solemn**: 25 cps, 110 ms mouth frames, 320 ms transitions, quicker breathing.
- **Battle barks**: no frame, 64 px faces, 45 cps: the acting character says a short line during its action.

## Interface

Needs: every place the game sets a line (dialogue open and each advance) and where it closes; the confirm handler (calls
`press()` first and advances only when it returns `false`); `update(dtMs)` in the fixed step, also while a dialogue pauses
the game and in the `?t=` fast-forward; the box rect in native px (the game draws its own box and text); a cast entry per
speaking character; `expressive-portraits.js` loaded first when the cast uses specs.

Provides: `create({cast, params, skin, font, getPortrait, onBlip, onDone})` -> `say`, `follow`, `press`, `close`, `clear`,
`update`, `drawSpeaker(ctx, box)` -> `{portrait, name, text}`, `rows(measure, width)`, `text`, `fullText`, `shown`, `done`,
`typing`, `speaker`, `drawFace`, `react`, `setEmotion`, `emotion`, `face`, `state`, `rects`, `lastDrawn`, `layout`,
`blinkLog`, `setParams`, `params`; statics `parse(text)` (tags), `charClass(ch)`, `emotionOf(name)`, `EMOTIONS`.

## Screen rules

- Whole native pixels, smoothing off; the panel is drawn into its frame with a clip, so a posture offset never shows a gap
  (rows that leave the bottom are refilled from the last row).
- The drawn vertical offset (posture + breath) moves at most 1 px per frame; posture: sad / hurt sit 1 px lower; the beat in
  the middle of a change: surprised / happy / determined 1 px up, angry / hurt / sad 1 px down.
- Layout inside the game's box: margin 4 px; the panel at the speaker's side, vertically centred when the box is at least
  panel + 8 px tall, otherwise bottom-aligned (rising over the box top: the game should make the box taller); the text
  rect starts 6 px past the panel and 15 px below the name plate's top; the plate is the name's width + 12 px, 13 px high.
- Text, name plate and portrait never overlap each other when the game draws its text inside `layout.text`; the module
  draws no dimming layer, never covers the game's text, and puts nothing outside the box except the plate's top half.
- Mouth frames: shut, half, open differ in pixels for every emotion; D-04's surprised face shows one "o" at all levels, so D-05 draws it as shut = closed mouth, half = "o", open = a larger "O" (`facePixels`).
- Mouth: shut (frame 0) unless the speaker's last typed character is a letter / digit / apostrophe, the line is open,
  typing and not holding, and the panel is in. Narration (no cast speaker) shows no face and shuts every mouth.
- Determinism: everything from `update(dt)`; blinks from a per-face seed; `?t=&freeze=1` stills are identical on reload.

## Common mistakes

| symptom | fix |
|---|---|
| Faces never blink or talk | `update` is missing from the step branch that runs while the dialogue is open |
| Every press skips a whole line, or two lines | `press()` result ignored: `true` means it finished the typing, do not advance |
| Words jump to the next row while typing | wrap with `rows(measure, width)`, not the typed text |
| Text under the portrait or plate | draw text at `layout.text`, not the old box origin |
| Panel rises over characters | the box is shorter than panel + 8 px: make it taller |
| A bark box hides the field | size an added box to its line and place it where it covers no unit or key scenery |
| Faces blank, one console warning | `expressive-portraits.js` not loaded before `talking-portraits.js` |
| "Elder:" stays in the text | the name is not a cast key |
| Mouth flaps on a game's own typewriter after it stops | use `follow(text, shown, {paused})` every step, not `say` |

## Acceptance moments

`checks/state.json` lists each still with its event, and `checks/shoot.py` confirms the event from `window.__state()`.

1. `?t=1650&freeze=1`: the elder's first line; on the 'i' of 'will' his mouth is open; pointer over his head; the others face him.
2. `?t=1100&freeze=1`: 'Sit, sit.' - the hold after the full stop, mouth shut.
2b. `?t=5183&freeze=1`: Mira surprised and talking: the open 'O' (D-05's frame; shut at spaces and holds).
3. `?t=5750&freeze=1`: Mira surprised (portrait on the right, text on the left), the hold after '!', mouth shut.
4. `?t=6133&freeze=1`: the `[sad]` tag inside Mira's line: the new face with eyes shut, the bust 1 px lower.
5. `?t=8600&freeze=1`: Brann answers from the counter; Mira has turned to face him.
6. `?t=12600&freeze=1`: the elder angry, mouth moving.
7. `?t=22183&freeze=1`: 'Hmm... [determined] Fine.' - the change inside the line, eyes half shut.
8. `?t=25300&freeze=1`: 'Aye, Elder' ended on a letter: done, mouth shut, the advance arrow.
9. `?view=lab&t=3250&freeze=1`: face lab: the lip track (each typed letter underlined with its mouth shape; spaces and punctuation shut) and tracks of mouth, eyes and mood.
10. `?view=lab&t=2717&freeze=1`: face lab during a change: the mood bar fills over the transition.

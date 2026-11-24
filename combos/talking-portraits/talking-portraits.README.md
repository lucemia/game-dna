# talking-portraits.js (D-05 module, v1.2)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_TalkingPortraits`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It animates portraits from the dialogue:

- **Typewriter** that owns the line (or follows the game's own typewriter): characters per second, a hold after `. ! ?` and a shorter one after `, ; :`, a "finish the line" press.
- **Mouth** synced to the typed text: it moves only while the last typed character is a letter or digit; it is shut on spaces, punctuation, during the holds, while the panel slides in, when the line ends (also on a line that ends with a letter) and for every face that is not speaking.
- **Blinks** at seeded random gaps between `blinkMin` and `blinkMax` (now and then a double blink), **breathing** (the bust rises 1 px for half of `breathMs`).
- **Surprised can talk**: D-04 draws its surprised "o" at every mouth level, so D-05 draws that face itself (`facePixels`): shut = a closed mouth, half = the "o", open = a larger "O". Every emotion therefore shows three different mouths (checked in pixels).
- **Emotion per line** (`[happy]` tags at the start or inside a line, or an `emotion` field): the face changes through a short blink-through (`transMs`, at least 100 ms: eyes half, the new face with eyes shut, eyes half, open) with a 1 px posture beat (sad and hurt sit 1 px lower). Never a one-frame jump; the drawn offset moves 1 px per frame at most.

**Faces.** A cast entry is either a portrait spec for `expressive-portraits.js` (`GameDNA_Portraits`, D-04: code-drawn 16-bit busts, 48 or 64 px, 7 expressions; load that file first, unchanged), or your own portrait: `{ w, h, draw(ctx, x, y, f) }` where `f = {emotion, mouth: 0|1|2, eyes: 'open'|'half'|'closed', talking, t}`. The module draws your face into a small canvas and applies the bob and breath itself.

Expressions: `neutral`, `happy`, `angry`, `sad`, `surprised`, `determined`, `hurt` (aliases such as `joy`, `mad`, `shock`, `pain` map to them; unknown tags stay in the text).

If `skins/skin-api.js` (with a skin such as `pixel16`) is loaded first, frames and the name plate use `GameDNA_Skin`; without it a built-in 16-bit frame and a 7 px canvas font are used. Pixels are drawn at whole native pixels with smoothing off.

## API

`GameDNA_TalkingPortraits.create(options)` returns an instance.

| option | meaning |
|---|---|
| `cast` | `{ Name: spec \| {w, h, draw} }`. Keys match the speaker case-insensitively. A spec may carry `side: 'left' \| 'right'` (where its panel sits) and `bg` (backdrop: dusk, moss, ember, sea, plum, sand, slate, rose or `#hex`). |
| `getPortrait(key)` | Optional: return a spec / face for keys not in `cast` (or null = narration, no face). |
| `params` | `cps` 40, `pauseMs` 300, `commaMs` 140, `mouthMs` 80, `blinkMin` 2200, `blinkMax` 5600, `doubleBlink` 0.2, `breathMs` 3600 (0 = off), `transMs` 200 (100-600), `size` 48 (or 64), `frame` `'window'` (`'plate'`, `'none'`), `side` `'left'`, `enterMs` 140, `nameTag` `'on'` (`'off'`), `margin` 4. |
| `skin` | Skin id; default `pixel16` when the skin API is loaded; `false` = built-in look. |
| `font` | Optional `{draw(ctx, str, x, y), measure(str)}` for the name plate (use your game's font). |
| `onBlip(ch, index, lineId)`, `onDone(lineId)` | Optional hooks: a typing sound every second letter; the line finished typing. |

| method | |
|---|---|
| `say(line, {who, emotion, side})` → id | Starts a line. `line` is a string or `{who \| speaker, text, emotion \| expr}`. A string starting with `Name: ` whose name is in the cast takes the speaker from it (and drops it from the text). Tags `[sad]` at the start or inside the text switch the face when the typewriter reaches them. No speaker in the cast = narration: no face, every mouth shut. |
| `update(dtMs)` | Every fixed step of the game (also in `?t=` fast-forward), **also while the game is paused for dialogue**. The only clock. |
| `press()` → bool | Your confirm key / tap: `true` = it finished a line that was still typing (do NOT advance); `false` = the line was already complete (advance as before). |
| `close()` | The conversation (or this line) ends: the panel leaves, mouths shut. `clear()` on restart / new game. |
| `drawSpeaker(ctx, box)` → layout | Draws the speaker's framed portrait inside your dialogue box `{x, y, w, h}` (native px) on the speaker's side and a name plate on the box's top edge; returns `{portrait, name, text}` rects: draw your text inside `layout.text`. Call it after you draw the box, before the text. Returns `null` for a bad box. |
| `rows(measure, width)` → `[string]` | The typed part of the line as rows, wrapped on the FULL line so words never jump rows while they type. `measure(str)` = your font's width. |
| `text()`, `fullText()`, `shown()`, `done()`, `typing()`, `speaker()` | The typed text so far (tags removed), the whole line, characters shown, finished, still typing, current speaker. |
| `drawFace(ctx, key, x, y, {frame, alpha})` → rect | Any face anywhere (party HUD, status screen): it blinks and breathes on the same clock. |
| `react(key, emotion, ms)`, `setEmotion(key, emotion)` | A face shows an emotion for `ms` and goes back (hits, heals, wins), or keeps it. Both use the transition. |
| `follow(fullText, shownChars, {who, emotion, paused})` | Instead of `say` + the module's typewriter: call every step with your own typewriter's count. The mouth shuts when the count stops for 3 steps or `paused` is set. |
| `GameDNA_TalkingPortraits.facePixels(portrait, emotion, eyes, mouth, outline)` | Static: the RGBA frame D-05 draws for a D-04 portrait (D-04 pixels, surprised mouth redrawn). |
| `layout(box)`, `state()`, `rects()`, `lastDrawn()`, `face(key)`, `blinkLog(key)`, `setParams(p)`, `params()` | For layout without drawing, tests and probes. `state()` = `{t, line: {who, key, text, shown, n, done, open, waiting, voiced, last, lastClass}, panel, faces: {key: {emotion, shown, eyes, mouth, dy, trans, blinks}}}`. |

**Layout.** The panel (portrait + 4 px frame: 56 px for 48) sits at the box's left or right end, `margin` px in, vertically centred when the box is at least panel + 8 px tall, otherwise bottom-aligned and rising above the box top. The text rect starts 6 px past the panel and below the name plate (which overlaps the box's top border by 6 px). Text never goes under the portrait or the plate if you draw it inside `layout.text`. A box you add only for this (battle barks): make it `panel + 6 + textWidth(fullText()) + 12` wide and put it where it covers no unit or key scenery.

## Integration (15 lines)

```js
// <script src="expressive-portraits.js"></script><script src="talking-portraits.js"></script> before your game script
const TALK = GameDNA_TalkingPortraits.create({ params: { cps: 40 },
  cast: { Elder: { seed: 3, age: 'elder', facial: 'beard', side: 'left' }, Hero: { seed: 9, age: 'young', side: 'right' } } });
function showLine(str) { message = str; TALK.say(str); }            // where your game SETS a line: 'Elder: [sad] It is gone.'
function confirm() { if (TALK.press()) return; /* your existing advance code */ }
function closeDialogue() { TALK.close(); /* existing close */ }
function step(dt) { /* existing step, including its dialogue pause */ TALK.update(dt); }   // the SAME step ?t= replays call
function drawDialogue() {
  drawBox(box);                                                         // your window
  const lay = TALK.drawSpeaker(ctx, box) || { text: box };
  TALK.rows(s => ctx.measureText(s).width, lay.text.w).forEach((row, i) => drawText(row, lay.text.x, lay.text.y + i * LINE_H));
}
function newGame() { TALK.clear(); /* existing */ }
// a party HUD: TALK.drawFace(ctx, 'Hero', 4, 150); on a hit: TALK.react('Hero', 'hurt', 700)
```

## Keep the game's other callers working

- **One clock**: `TALK.update` runs inside the fixed step that the animation loop, `?t=&freeze=1` fast-forward and autoplay all call, including the branch that returns early while a dialogue is open. Never drive it from `requestAnimationFrame` time or `Date.now()`.
- **Every place that sets a line** calls `say` (the first line when a dialogue opens AND each advance). Keep the game's own line index and its `done` callbacks.
- **Confirm** (only where the game already waits for one, such as dialogue): the first press finishes a typing line; only a press on a finished line advances. Barks and battle messages keep the game's own timer: never add a confirm gate; `close()` when the game moves on, typed or not. Autoplay that presses on a timer still reaches the same end (it needs about twice as many presses); give it no special path.
- **Text**: draw `rows(...)` inside `layout.text` with your existing text function; keep your window. If your box is shorter than the panel + 8, the panel rises above it: make sure nothing important sits there, or make the box taller.
- **Faces in menus / HUD**: `drawFace` with the same instance, so blinks and breath stay on the game clock.

## Self-check without a browser

1. The module file (and `expressive-portraits.js`, if you use specs) is byte-identical to the one you were given and loaded before the game script.
2. `TALK.update(` is inside the fixed step and runs while a dialogue is open; `TALK.say(` is next to every assignment of the current line; `TALK.close(` where the dialogue closes; `TALK.clear(` in restart.
3. Your confirm handler calls `TALK.press()` first and returns when it is `true`.
4. Every speaker name in your lines that should have a face is a `cast` key; tags are one of the seven names.
5. Walk one line: `say('Elder: [happy] Hi, you.')` → speaker Elder, face happy (through a blink); `update(16.7)` × 9 → 'H' shown... mouth half/open on 'H', 'i'; ',' → shut for 140 ms; ' ' → shut; 'y','o','u' → moving; '.' (last) → done, shut.

## What it guarantees

- Same calls, same frames: everything depends on `update(dt)` and the cast keys; no wall time, no `Math.random`.
- `update`, `drawSpeaker`, `drawFace`, `say`, `follow` never throw (errors and throwing callbacks are caught, warned once). Bad `dt` is clamped to 0..250 ms. An unknown speaker is narration (no placeholder face). A spec without `expressive-portraits.js` loaded warns once and draws no face (the text uses the whole box).
- It never reads input, never pauses the game, never draws over your text when you draw inside `layout.text`, and draws no dimming layer.

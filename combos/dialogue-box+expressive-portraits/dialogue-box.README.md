# dialogue-box.js (H-01 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_DialogueBox`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns the whole dialogue box: the window, the name tag, word wrap and paging at native resolution, the typewriter reveal with punctuation pauses, the blinking "more" arrow, confirm / hold / auto-advance handling, and placement off the speaker and your UI. Your game keeps its own state; it opens a conversation, routes its confirm input to the box while the box is busy, and acts in `onEnd`.

If `skins/skin-api.js` (and a skin such as `pixel16.js`) is loaded before it, it draws the window and name tag with `GameDNA_Skin.resolve(options.skin).frame()` and takes text colours from the skin; non-pixel skins also draw the text with `skin.text()`. Without it, it uses its built-in 16-bit look (the same as `pixel16`). Text uses the C-03 6×8 proportional font (upper and lower case, full ASCII), built in.

## Script format

A conversation is a plain array the designer edits. Each entry is one line:

```js
[
  { speaker: 'Elder', text: 'Ah, a traveller. Welcome to {gold}Meadowhold{/}.' },   // a name tag shows "Elder"
  { speaker: 'Hero', who: 'hero', text: 'Thanks. Is the inn open?' },             // who = the id used to find the speaker's sprite
  { text: 'The wind picks up.' },                                                  // no speaker: narration, no tag
  'A plain string is narration too.'
]
```

| field | meaning |
|---|---|
| `text` | Required. Wrapped to the box width and split into pages of `rows` rows. Codes: `{gold}` … `{/}` colour (white, dim, gold, yellow, red, green, blue, cyan, purple, orange, `{#f80}`, skin tokens like `{text.accent}`); `{p300}` waits 300 ms; `{page}` starts a new page; `\n` starts a new row; `{{` prints `{`. |
| `speaker` | Name shown in the tag (omit or `null` for narration). |
| `who` | Optional id of the speaker's sprite when it differs from `speaker` (passed to `getAnchor`, matched against `getObstacles()` ids). |
| `anchor` | Optional `{x, y, w, h}` (or a function returning it): the speaker's sprite rect on screen, for this line only. |
| `place` | Optional `'top'` / `'bottom'` for this line. `speed`, `pause`, `auto` (ms: this line advances by itself), `tint` (`'a'` blue, `'n'` slate, `'b'` red), `nameColor`, `label` (a name for `goto`). |

Any other field is kept untouched and handed back to your hooks: a later element (H-02 branching choices) adds `choices`, `set`, `if` to these same objects.

## API

`GameDNA_DialogueBox.create(options)` returns an instance.

| option | meaning |
|---|---|
| `bounds` | Play field `{x, y, w, h}` in native pixels (or a function returning it). The box stays inside it, `margin` px from the edges. Alternative: `view: {w, h}`. With neither, the canvas size at the first `draw()` is used. |
| `skin` | Skin id or object (needs `skin-api.js`); default `pixel16`. `false` forces the built-in look. |
| `params` | Any of `speed` 40 (letters per second; 0 = whole page at once), `pause` 160 (extra ms after `. ! ? …`; half after `, ; :`), `rows` 3 (rows per page), `width` 0 (box width; 0 = field width − 2 × margin), `margin` 6, `place` `'auto'` (bottom unless that covers the speaker, then top) / `'bottom'` / `'top'`, `nameTag` `'on'`, `arrow` `'on'`, `autoAdvance` 0 (ms a complete page waits before advancing by itself; 0 = wait for the player), `hold` `'on'` (holding confirm fast-forwards), `ffSpeed` 4, `tickEvery` 2 (letters per `onTick`), `tint` `'a'`, `openMs` 100, `dim` 0, `autoplayMs` 600 (autoplay: how long a complete page stays). |
| `getAnchor(speaker, line)` | Optional. The speaker's sprite rect `{x, y, w, h}` (top-left, screen px) right now, or null. Asked when a line starts. The last good rect per speaker is cached; with no rect at all the box just uses `place`. |
| `getObstacles()` | Optional. Rects `{x, y, w, h}`. A rect **without** `id` (HUD, menu, minimap) is never covered. A rect **with** `id` (a sprite) is the speaker when its id matches the line's `who`/`speaker` (case-insensitive) and is otherwise avoided only to choose between top and bottom. |
| `uiRects()` | Optional, same as rects without `id`. |
| `autoplay` | Optional `true`/`false` or a function returning it, read at each `open()`. When true, pages advance by themselves after `autoplayMs` and player presses are ignored, so `?auto=1` runs never wait. |
| `onTick(ch, index, line)` | Optional sound hook: at most once per `update`, every `tickEvery` revealed letters (not spaces). The module plays no sound. |
| `onLine(line, index, ctl)` | Optional: a line starts (the first one inside `open()`). |
| `onLineEnd(line, index, ctl)` | Optional: the player advanced past the line's last page. **Return `false`** to keep the box on this line (arrow hidden) until you call `next()`, `goto()` or `end()`: this is where choices, item pop-ups or a camera pan go. |
| `onEnd(result)` | Optional, for every conversation (in addition to the per-open one). |
| `onSfx(name)` | Optional: `'open'`, `'page'`, `'next'`, `'close'`. |
| `debug(e)` | Optional: `open`, `line`, `page`, `finish`, `advance`, `held`, `close`, `end`, `ignored` (open while busy), `noroom`. |

`ctl` (in hooks) = `{next(), goto(indexOrLabel), end(), insert(lines), index(), line(), lines()}`. All callbacks are wrapped in try/catch; a missing callback is fine.

| method | |
|---|---|
| `open(lines, opts)` → bool | Opens a conversation. `opts`: **`onEnd(result)`**, `onLine`, `onLineEnd`, `anchor` (rect or `(speaker, line) => rect` for this conversation), `place`, `tint`, `auto` (true/false overrides the `autoplay` option). An `open()` while one is running is ignored and returns `false`. `say(speaker, text, opts)` = `open([{speaker, text}], opts)`. |
| `busy()` | `true` from `open()` until the box has closed (`onEnd` runs in the same `update()` that makes it false). While busy, send confirm here and pause the world. |
| `press()`, `tap()` | Confirm, on the key-down edge (Z, Space, Enter, a click or tap). While the page types: show the whole page. When the page is complete: next page, next line, or close. Latched until the next `update()`; ignored while the box opens and in autoplay. Returns true while busy (input used). |
| `hold(down)` | Optional: whether confirm is held. Held for 240 ms after a `press()` = fast-forward (`ffSpeed` × speed, no punctuation pauses, complete pages advance after 160 ms). |
| `key(code, down)` | Raw keys instead of `press()` + `hold()`: pass `e.code` or `e.key` on keydown (`true`) and keyup (`false`). Returns `true` only for Z, Space, Enter while busy; every other key returns `false` (your game handles it). Key repeat is ignored. |
| `update(dtMs)` | Every fixed step, with the step length, also while the world is paused. The only clock (no timers, no wall time), so `?t=…&freeze=1` gives the same frame every time. |
| `draw(ctx, ox = 0, oy = 0)` | Draws at native resolution. Call it last in the draw pass (after world and HUD), outside any shake translate. Never throws. |
| `next()`, `goto(i \| label)`, `insert(lines)`, `end()` | Move on, jump, add lines after the current one, or close now (`onEnd` gets `skipped: true`). |
| `auto(on)`, `clear()` | Switch the running conversation to autoplay; drop it silently (restart / new game; its `onEnd` never runs). |
| `state()`, `rect()`, `lastResult()`, `lastDrawn()`, `setParams(obj)`, `params()`, `measure(str)` | `{stage, index, lines, page, pages, shown, total, speaker, who, text, visible, auto, fastForward, box, anchor}` or null; the box rect incl. the name tag (for other overlays to avoid) or null; last result; drawn rects for tests; live params; text width in the built-in font. |

**Result** `{lines, index, skipped, auto, line}`: how many lines were shown, the last line's index and object, whether `end()` closed it early, whether autoplay ran it.

**Use `onEnd`, not polling, for what happens after the talk** (quest flags, a door opening, the battle starting). It runs synchronously inside `update()`, so `?t=&freeze=1` fast-forwards and autoplay see it on the right frame.

## Integration (15 lines)

```js
// <script src="dialogue-box.js"></script> before your game script (skin-api.js + pixel16.js before it if you have them)
const dlg = GameDNA_DialogueBox.create({ bounds: { x: 0, y: FIELD_TOP, w: SCREEN_W, h: FIELD_H }, params: { speed: 40 },
  autoplay: () => AUTOPLAY, onTick: () => playBlip && playBlip(),                        // your ?auto=1 flag; sound optional
  getAnchor: (who) => spriteRectOnScreen(who),                                           // {x, y, w, h} of the talker, or null
  uiRects: () => [hudRect, minimapRect] });
function showDialog(lines, then) {                         // the game's existing "open a text box" function: keep its name
  gameDialogState = { lines };                             // keep the old flag true while the box is open (others read it)
  dlg.open(lines.map(t => typeof t === 'string' ? { text: t } : t), { onEnd: () => { gameDialogState = null; if (then) then(); } });
}
function step(dt) {
  if (dlg.busy()) { if (input.confirmPressed) dlg.press(); dlg.hold(input.confirmHeld); dlg.update(dt); return; }   // world paused
  /* existing update */ dlg.update(dt);
}
function render() { /* world, effects, HUD */ dlg.draw(ctx); }                          // last, outside the shake translate
function newGame() { dlg.clear(); /* existing code */ }
```

## Keep the game's other callers working

- **Only text the player reads and dismisses goes in the box**: talk, signs, item / chest messages, story beats. Leave self-clearing action captions, combat logs, wave banners and the game's own result overlays (VICTORY, GAME OVER, stage clear) exactly as they are: routed through the box they each wait for a confirm, the battle slows down (autoplay took 1.8× as long in cold tests) and the big result screen disappears. If a result screen and the box would share the screen, show the box first and draw the overlay after it (`!dlg.busy()`).
- **Narration has no name plate**: system and narrator text ("You swing your stick.", "The slime is gone.") is `{text}` without `speaker`; never invent speakers such as "You" or a monster's name for it.
- **Every place that opens text** (talking to someone, reading a sign, opening a chest) goes through the game's existing dialog function, so change that ONE function's body and keep its name and arguments. Grep all its callers; also look for code that sets the dialog state directly.
- **The old dialog state**: other code (the autopilot, a test hook such as `window.__state()`, the "is a menu open" check, the save code) may read it. Keep it set while the box is open and clear it in `onEnd`, as before. Delete only the old box's drawing and its old advance code.
- **What happened after the last line** (a quest flag, a callback, a scene change) moves into `onEnd`, unchanged.
- **Autoplay** (`?auto=1`): pass the flag as `autoplay`; the box then advances by itself and ignores presses, so the autopilot's own confirm presses must not matter. It must reach the same end as before.
- **Fast-forward** (`?t=&freeze=1`, tests): `update()` must run inside the fixed step those loops call, not only in `requestAnimationFrame`.
- **Keys**: while busy only confirm (and hold) belongs to the box. If your old box also closed on Back / Escape, call `dlg.end()` there. Pause / restart keys keep working.
- **Restart / new game / scene change**: `clear()`.

## Self-check without a browser

1. The module file is byte-identical to the one you were given and is loaded before the game script.
2. `open(` appears only in the game's dialog function (update logic), never in a draw function; every caller still reaches it.
3. `update(` runs every fixed step, also while the world is paused for the box; the freeze / fast-forward loop calls that same step.
4. While `busy()`: the player's confirm goes to `press()` (key-down edge only), the world and the action that opened the box wait.
   The step that calls `open()` still runs the rest of its world update (other units, timers, encounter checks); the gate takes effect from the next step. Returning early in that step shifts later encounters and changes the autoplay result (seen in 2 of 3 cold runs with portraits).
5. The code that ran after the old dialog closed now runs in `onEnd`; the old dialog flag is set while open and cleared there.
6. Autoplay: walk one 40-letter line: open (0.1 s) → about 1 s of typing at 40 letters/s plus pauses → `autoplayMs` 0.6 s → next line … → close (0.1 s) → `onEnd` → the same quest step as before.
7. `draw(` is the last call of the draw pass, outside any shake translate; restart calls `clear()`.

## What it guarantees

- Same calls, same frames: reveal, pauses, auto-advance and autoplay are driven only by `update(dt)`.
- A one-frame tap counts (latched); a held key does not repeat; the press that opened the box cannot skip it (presses while it opens are ignored), and fast-forward needs a fresh press after the box opened.
- The box never covers a rect without `id`, stays inside `bounds`, does not move during a line, and moves between lines only when the next speaker or your UI would be covered. With no free spot it is drawn at the preferred edge with one warning (never at the screen centre).
- `update` and `draw` catch their own errors and errors from your callbacks; bad `dt` (NaN, negative, > 250 ms) is clamped. An unknown character draws as a box glyph, never as nothing.

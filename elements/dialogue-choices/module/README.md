# dialogue-choices.js (H-02 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_DialogueChoices`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It runs branching conversations: a choice menu after a line (2 to 4 options, a cursor, disabled options that say why, an optional countdown that picks a default), a flag store (set, inc, check, conditions such as `gold>=10 && !metElder`), jumps to labels, once-only lines and options, `{$flag}` in text, and a validator that reports unreachable labels and unknown flags. Your game keeps its own state; it starts a talk, routes input while `busy()`, and reads flags (`get`, `onFlag`, `onEnd`).

It shows the lines in one of two ways:
- **Box mode** (`box:`): it drives a `GameDNA_DialogueBox` (H-01) instance through that module's public API (`open` with per-talk `onLine` / `onLineEnd` hooks, `insert`, `next`, `end`). Talk calls the box's `update`, `draw` and input for you.
- **Adapter mode** (`adapter:`): your game's own text box shows each line; three small functions connect it (below).

If `skins/skin-api.js` is loaded before it, the menu draws through `GameDNA_Skin.resolve(options.skin)`: `frame()` (role `window`, then role `row` for the selected row), `cursor(..., 'hand')`, `bar()` for the countdown, text tokens (`text.main`, `text.select`, `text.dim`, `text.red`), and `text()` on smooth skins. Without it, it uses its built-in 16-bit look (the same as `pixel16`, with the C-03 6×8 font).

## Script format

A script is a plain object of conversations; each conversation is a plain array the designer edits. Entries are H-01 lines (`speaker`, `who`, `text` with its colour codes) plus these fields:

```js
const SCRIPT = {
  elder: [
    { speaker: 'Elder', id: 'hello', once: true, text: 'Ah, a traveller.' },          // once: shown the first time only
    { speaker: 'Elder', if: 'metElder', text: 'Back again, {$name}?' },                // if: skipped when false; {$flag} = its value
    { set: { metElder: true } },                                                       // no text = a command (set / inc / goto / end)
    { label: 'ask', speaker: 'Elder', text: 'Will you help?', default: 'yes', timeout: 0, cancel: 'no', choices: [
      { id: 'yes', text: 'Of course', set: { quest: 1 }, goto: 'thanks' },
      { id: 'pay', text: 'For 10 gold', if: 'gold >= 10', reason: 'Need 10 gold', inc: { gold: -10 }, goto: 'thanks' },
      { id: 'why', text: 'Why me?', once: true, goto: 'why' },
      { id: 'no',  text: 'Not now', end: true } ] },
    { label: 'why', speaker: 'Elder', text: 'You look rested enough.', goto: 'ask' },   // back to the menu ("why" is gone now)
    { label: 'thanks', speaker: 'Elder', text: 'Thank you.' }
  ]
};
```

| field (line or command) | meaning |
|---|---|
| `text`, `speaker`, `who`, … | As in H-01. `{$gold}` is replaced by the flag's value when the line starts. |
| `label` | A name for `goto` (unique within the conversation). |
| `if` | Condition; the entry is skipped when false. |
| `once` | Shown (or run) only the first time. Give it an `id` (or `label`) so saves survive script edits. |
| `set`, `inc` | `{flag: value}` (numbers, strings, booleans, null) / `{flag: n}`; run when the line starts (commands: when reached). |
| `goto`, `end` | After this line: jump to a label / end the talk. Otherwise the next entry follows. |
| `choices` | 2 to 4 options; the menu opens as soon as the text is complete. |
| `default` | Option index or `id` picked by autoplay and by the countdown; the cursor starts on it. Default: the first enabled option. |
| `timeout` | ms before `default` is picked by itself (0 = wait; overrides `params.timeout`). A bar shows the time left. |
| `cancel` | Option index or `id` picked by Back (`back()`, X / Escape). |

| option field | meaning |
|---|---|
| `text` | Required. `{$flag}` allowed; truncated with `...` if wider than the field. |
| `if`, `reason` | Disabled (grey) while the condition is false; `reason` shows under the options when the cursor is on it. `hide: true` hides it instead. |
| `hint` | Shown under the options when the cursor is on this enabled option. |
| `set`, `inc`, `goto`, `end`, `once`, `id` | Run when picked; without `goto`/`end` the talk continues after the question line (its own `goto` applies). |

**Conditions**: flags, numbers, `"strings"`, `true` / `false`, `!`, `&&` / `and`, `||` / `or`, `not`, `== != >= <= > <` (`=` means `==`), `+ -`, parentheses. Unset flags read as 0 / false. No `eval`.

## API

`GameDNA_DialogueChoices.create(options)` returns an instance.

| option | meaning |
|---|---|
| `box` | A `GameDNA_DialogueBox` instance (box mode). |
| `adapter` | `{show(line, done), close(), rect()}` for your own text box (adapter mode; see below). |
| `script` | `{name: [entries]}` (or one array, named `main`). |
| `flags` | Every flag the game uses, with its start value: `{gold: 0, metElder: false}`. `resetFlags()` goes back to these. |
| `hostFlags` | Optional names of flags only your code sets (for `validate()`). |
| `bounds` / `view` | Play field `{x, y, w, h}` / `{w, h}` in native px (the menu stays inside). Default: the canvas at the first `draw()`. |
| `skin` | Skin id or object (needs skin-api.js); default `pixel16`. `false` = built-in look. |
| `params` | `menuPlace` `'auto'` (right of the box) / `'right'` / `'left'`, `timeout` 0, `wrap` `'on'` (cursor wraps), `disabled` `'show'` / `'hide'`, `tint` `'a'` / `'n'` / `'b'`, `autoplayMs` 600, `openMs` 80, `armMs` 60 (presses ignored this long after the menu opened), `margin` 6, `minWidth` 64, `maxWidth` 0. |
| `autoplay` | `true` / function. Menus pick `default` after `autoplayMs` (cursor moves to it at half time); player input is ignored. Box mode without this option follows the box's autoplay. |
| `getObstacles()` / `uiRects()` | Rects `{x, y, w, h}`; without `id` = never covered by the menu (HUD, minimap); with `id` = sprites, avoided when possible. The text box and the speaker are always avoided. |
| `onChoice(c)` | `{conv, at, index, id, text, how: 'player' \| 'auto' \| 'timeout' \| 'cancel'}`. |
| `onFlag(name, value, old)` | Every change (script, picks, your `set` / `inc`). |
| `onLine(line, info)`, `onEnd(result)`, `onSfx(name)` | Line started; talk over (`{conv, lines, choices, path, skipped, auto, flags}`); `'menu' 'move' 'pick' 'buzz' 'timeout'`. |
| `debug(e)` | `start line menu move pick buzz flag end ignored noroom warn`. |

All callbacks are wrapped in try/catch; a missing callback is fine.

| method | |
|---|---|
| `start(name \| entries, opts)` → bool | Starts a talk. `opts`: `onEnd`, `onChoice`, `onLine`, `at` (label to start at), `auto`. `false` while a talk or the box runs. A talk with no line to show ends at once (its `onEnd` runs inside `start`). |
| `busy()`, `choosing()` | A talk or the box is open (pause the world) / the menu is up. |
| `press()` / `tap()`, `move(-1 \| 1)`, `back()`, `hold(down)` | Confirm on the key-down edge (menu: pick; box: finish / advance), cursor, cancel, fast-forward (box). Return true when used. |
| `key(code, down)` | Raw keys: arrows / W S move, Z Space Enter confirm, X Escape cancel; other keys return false (and go to the box in box mode). Repeats ignored. |
| `tapAt(x, y)` | Native px: a tap on an option moves the cursor there and picks it. |
| `update(dtMs)`, `draw(ctx, ox, oy)` | Every fixed step (also while busy) / last in the draw pass. Box mode: they also update and draw the box: remove your own `dlg.update` / `dlg.draw` calls. |
| `end()`, `clear()` | Close now (`skipped: true`) / drop silently (restart; also clears the box). Flags stay. |
| `get(n)`, `set(n, v)`, `inc(n, by)`, `check(cond)` | The flag store. |
| `getFlags()`, `setFlags(obj, {merge})`, `resetFlags()` | Plain JSON copy of every flag (incl. `seen:…` once-marks) for saves / load it back / new game. |
| `validate(script?)`, `state()`, `menuRect()`, `rect()`, `lastDrawn()`, `lastResult()`, `setParams()`, `params()` | Report (below); `{conv, line, menu: {options, cursor, default, auto, timeout, left, rect}}`; menu rect (or the box's) for other overlays. |

`GameDNA_DialogueChoices.validate(script, {flags, hostFlags})` → `{ok, errors, warnings, unreachableLabels, unknownTargets, unknownFlags, unusedFlags, conversations}`. Errors: a `goto` with no label, a duplicate label, a bad condition, an option without text. `unreachableLabels`: labels no path from the start reaches. `unknownFlags`: read but never set, inc'ed or declared (typos). Run it once at load and print the result.

## Box mode (with H-01)

```js
// <script src="dialogue-box.js"></script><script src="dialogue-choices.js"></script> before your game script
const dlg = GameDNA_DialogueBox.create({ bounds: FIELD, autoplay: () => AUTOPLAY, getAnchor: who => spriteRectOnScreen(who), uiRects: () => [hudRect] });
const talk = GameDNA_DialogueChoices.create({ box: dlg, script: SCRIPT, flags: { gold: 0, metElder: false }, bounds: FIELD,
  autoplay: () => AUTOPLAY, uiRects: () => [hudRect], onFlag: (n, v) => { if (n === 'gateOpen') openGate(); } });
console.log(talk.validate());                                   // once: unreachable labels, unknown flags
function talkTo(npc) { gameDialogState = { npc }; talk.start(npc.talk, { onEnd: r => { gameDialogState = null; afterTalk(r); } }); }
function step(dt) {
  if (talk.busy()) { if (input.up) talk.move(-1); if (input.down) talk.move(1); if (input.confirmPressed) talk.press();
    if (input.backPressed) talk.back(); talk.hold(input.confirmHeld); talk.update(dt); return; }          // world paused
  /* existing update */ talk.update(dt);
}
function render() { /* world, effects, HUD */ talk.draw(ctx); }  // draws the box, then the menu
function newGame() { talk.clear(); talk.resetFlags(); /* existing code */ }
save: () => ({ ...state, story: talk.getFlags() }),  load: d => talk.setFlags(d.story)
```

## Adapter mode (your own text box)

```js
const talk = GameDNA_DialogueChoices.create({ script: SCRIPT, flags: FLAGS, view: { w: SCREEN_W, h: SCREEN_H }, autoplay: () => AUTOPLAY, uiRects: () => [hudRect],
  adapter: {
    show: (line, done) => showText((line.speaker ? line.speaker + ': ' : '') + line.plain, done),  // your box shows one line; call done() when the player advances past it
    close: () => hideText(),                      // the talk is over
    rect: () => ({ x: 8, y: 166, w: 240, h: 50 })  // your box on screen, so the menu sits beside it
  } });
// step: if (talk.choosing()) { up/down -> talk.move(), confirm -> talk.press(), back -> talk.back(); talk.update(dt); return; }   before your box's own input
//       ... your box advances as before and calls done() ...;  talk.update(dt) every step;  render: talk.draw(ctx) after your box
```

- `line` = `{speaker, who, text, plain, hasChoices, label, …}`: `text` keeps H-01 colour codes, `plain` has them removed.
- `done` is called once per line (later calls are ignored). For a question line the menu opens when `done()` is called, and `show(line, null)` follows: keep that line on screen while the menu is up (null = no advance expected).
- While `choosing()`, your box must not take the confirm key, or it would advance under the menu.

## Keep the game's other callers working

- **Every place that starts a talk** goes through `start()`; keep the game's own function names and the old dialog flag set while `busy()` (clear it in `onEnd`). What ran after the old talk closed moves into `onEnd` (or reads flags there).
- **Autoplay** (`?auto=1`): pass the flag as `autoplay`; menus then pick `default`, so choose defaults that keep the old story (the autoplay end must stay the same).
- **Fast-forward** (`?t=&freeze=1`): `update()` runs inside the fixed step those loops call.
- **Keys**: while `busy()` only arrows, confirm and back belong to talk; pause and restart keys keep working. Box mode: talk calls `dlg.update / draw / press / key` for you; do not call them as well (the box would run twice as fast).
- **Saves**: add `talk.getFlags()` to the save data and `talk.setFlags(data)` to the load; flags are plain JSON. Restart / new game: `clear()` and `resetFlags()`.

## Self-check without a browser

1. Both module files are byte-identical to the ones you were given and load before the game script (dialogue-box.js first).
2. `start(` appears only in update logic; every caller of the old talk function still reaches it.
3. `update(` runs every fixed step, also while busy; the freeze / fast-forward loop calls that step. Box mode: no `dlg.update(` or `dlg.draw(` left.
4. While `busy()`: up / down → `move()`, confirm (key-down edge) → `press()`, back → `back()`; the world waits.
5. `talk.validate()` on your script: `ok` true (no unreachable labels, no unknown flags). Every flag your game reads is in `flags`.
6. Walk one autoplay menu: question types out → menu opens (80 ms) → cursor on `default` at 300 ms → picked at 600 ms → its `set` / `goto` → the same story as before.
7. `draw(` is last in the draw pass, outside any shake translate; restart calls `clear()` and `resetFlags()`.

## What it guarantees

- Same calls, same frames: the menu's open, autopilot, countdown and picks are driven only by `update(dt)`; picks happen inside `update()` (synchronously, no promises).
- The menu never covers the text box, a rect without `id` or the field edge; it prefers the side away from the speaker and never moves while open. With no clear spot it is drawn beside the box with one warning (never at the screen centre).
- The cursor starts on the default option (enabled), so pressing confirm through a menu always moves the story on; a press on a disabled option only buzzes and flashes the reason.
- A choice line with every option off (all hidden, used or disabled) does not block: the talk goes on after it, with one warning. A `goto` to a missing label ends the talk with one warning; a loop of gotos without a line is cut after 1000 steps.
- `update` and `draw` catch their own errors and your callbacks' errors; bad `dt` is clamped.

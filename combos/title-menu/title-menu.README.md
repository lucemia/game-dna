# title-menu.js (C-07 module, v1.1.0)

One plain script, no dependencies, no `import`/`export`, ASCII only. It defines one global, `GameDNA_TitleMenu`. Load it with `<script src>` before the game script, or paste it unchanged into its own `<script>` tag.

It gives a game the screens around play: a **title** built on the game's own art (its name as a bold pixel logo with a glint, a tagline, a blinking PRESS START, drifting sparkles), a **title menu** (CONTINUE, NEW GAME, OPTIONS, QUIT), an **options** screen that persists (MASTER VOLUME, MUSIC, SOUND EFFECTS 0-10, TEXT SPEED, SCREEN SHAKE, FLASHING, REDUCE MOTION, LARGE TEXT, HIGH CONTRAST, a CONTROLS page, RESET DEFAULTS), **transitions** (diamond wipe, iris or fade) into the game and back, and a **pause menu** in play (RESUME, OPTIONS, RESTART, QUIT TO TITLE) with yes / no confirms. Keyboard, mouse (hover, click, drag sliders, wheel) and touch (tap rows, tap the scroll arrows, a pause button that appears after the first touch).

**How it draws.** On its own overlay `<canvas>` laid exactly over the game's canvas (absolute position, `pointer-events: none`, `image-rendering: pixelated`, re-placed on every `draw()`). By default (`unit: 'host'`, v1.1) one UI pixel is one of the game's own pixels (k of them on canvases wider than 640: k = floor(width / 320)), so the menu shares the game's pixel grid and is scaled by the browser exactly like the game; `unit: 'readable'` keeps the v1.0 behaviour (UI pixels of at least 2 CSS px whatever the game's scale). Your canvas and your drawing are never touched.

**How it reads input.** Capture-phase listeners on `window` (keydown, pointer, wheel). While a menu is open it consumes every key-down and every pointer press on the canvas, so the game never sees them; when no menu is open it consumes only the pause keys / the pause button, and only when `canPause()` is true. Key-ups always pass (held keys are released normally). Input is queued and applied in `update()`, on your fixed step.

**Skip flags.** With `?auto=1`, `?t=<ms>` (with or without `freeze=1`) or `?title=0` in the URL the instance does nothing at all: `busy()` false, no overlay, no listeners, no storage reads, options at their defaults. Your autoplay, your `?t=` stills and the judge's runs see exactly the old game. `?title=1` forces the menu on (for title stills). `skip: true/false` in the options overrides the URL.

## API

`GameDNA_TitleMenu.create(options)` returns an instance.

| option | meaning |
|---|---|
| `canvas` | **Required.** The game's canvas element. |
| `title`, `tagline` | The game's name (drawn as the logo, split over two lines when that is bigger) and an optional short line under it. |
| `isTitle()` | True while the game is in its own title scene. The menu opens on it (PRESS START the first time, the menu at once when the game comes back to its title). The game keeps the scene; the menu covers it. Without `isTitle` the title opens at create and after `onQuitToTitle`. |
| `onStart(kind)` | `'new'` or `'continue'`: do exactly what the old title confirm did (reset and start play). Called from `update()` while the screen is covered. |
| `onQuitToTitle()` | Back to the game's title scene (the menu then shows its title menu). |
| `canPause()` | True where play may pause (default: whenever `isTitle()` is false). |
| `onRestart()` | Optional; adds RESTART to the pause menu. |
| `canContinue()` | Optional; CONTINUE is greyed out and skipped while it returns false (no save). |
| `onOption(key, value, all)` | Called when an option changes (also at RESET DEFAULTS). Read options any time with `get(key)`. |
| `onQuit()` | Optional; QUIT -> YES calls it. Without it the menu shows a THANKS FOR PLAYING card and returns to PRESS START (a web page cannot close itself). |
| `onSound(name, options)` | Optional menu sounds: `move`, `tick` (slider), `confirm`, `back`, `start`, `open`, `close`, `denied`. Scale by `options.master` and `options.sfx`. |
| `uiRects()` | Native-px boxes of the game's HUD in play (score bar, command panel, message line). The pause button and the hint line stay off them; the pause window sits between top and bottom HUD bars when it fits. |
| `obstacles()` | Native-px boxes of characters and key props on the title backdrop: the logo block, PRESS START and the title menu move off them (when no clear spot exists the menu is drawn at 84 % so they stay visible). |
| `titleCover()` | Native-px boxes of the game's HUD that would sit empty on the title (a command panel): the module paints them as part of the title (night gradient, gold rule, faint stars) and puts PRESS START and the menu in that band, the logo above it. |
| `controls` | `[[action, keys], ...]` for the CONTROLS page (read-only; there is no key remapping). |
| `pauseKeys` | `e.key` / `e.code` values that open and close the pause menu. Default `['Escape', 'p', 'P']`; **drop any key your game already uses in play** (e.g. Escape as "back"). |
| `colors` | `{logo: [top, bottom], accent, accent2, text, text2, dim, ink, edge, cover, panel}`: hex colours; `panel` = `'royal'` `'night'` `'ember'` `'moss'` `'slate'` or 6 hex colours (4 fill bands top to bottom, highlight, shade). Pick them from the game's own palette. |
| `labels` | Rename rows: `{new: 'BEGIN', title: 'GIVE UP', paused: 'RESTING', ...}`. |
| `optionRows` | Keep only these option keys (e.g. `['master', 'sfx', 'shake', 'contrast']`). `extraOptions`: `[{key, label, type: 'toggle'|'slider'|'choice', min, max, choices, def}]`. |
| `storageKey` | Namespace for the stored options (default from `title`). |
| `skin` | Optional skin id or object (needs `skins/skin-api.js`): window ramp and text colours come from its palette tokens; the drawing stays the built-in pixel look. |
| `params` | `unit` `'host'` (default) or `'readable'`; `transition` `'diamond'`, `'iris'`, `'fade'` (reduce motion forces fade); `transMs` 320 (each half of the cover); `quit` `'on'`/`'off'`; `pauseButton` `'auto'` (after the first touch), `'on'`, `'off'`; `hints` `'on'`/`'off'`; `minUnit` 2 (smallest UI pixel in CSS px); `confirmKey` `'Z'` and `backKey` `'X'` (shown in the hints); `startLabel` `'auto'` or your text; `version` (bottom-right on the title); `storage` `'local'`, `'memory'`, `'off'`; `seed`. |
| `skip` | `true` / `false` to override the URL skip flags. |

| method | |
|---|---|
| `update(stepMs)` | **Top of the fixed step, every scene**, before your input and world: applies queued input, advances the menu clock, runs callbacks. |
| `busy()` | True while the title, the pause menu, a confirm or the covering half of a transition is up: **return from the step** (the world waits). |
| `titleShown()` | True while the menu draws the title: draw only your title backdrop. |
| `draw()` | **End of every render path** (title, play, results, early returns). Draws the overlay; never changes state. |
| `paused()`, `skipped()` | State flags. Hide the game's own world text (speech bubbles, floating labels) while `paused()`; the module also lays a near-opaque band behind the PAUSED caption and window. |
| `get(key)`, `options()`, `set(key, value)` | Read / change options (`set` persists and calls `onOption`). |
| `press(action)` | Script input: `up` `down` `left` `right` `confirm` `back` `pause` (demos, tests). |
| `openPause()`, `resume()`, `showTitle()` | Open / close from game logic (e.g. pause when the tab loses focus). |
| `rect()`, `lastDrawn()`, `layout()` | The open window in native px; every rect drawn last frame (`kind` panel / text / logo / control / button, native px); the layout in UI px (tests). |
| `state()`, `debug()` | For tests and the judge: mode, screen, selected row, options, transition, counters, events `{t, ev, id, via}`. Never use them to gate game logic. |
| `destroy()` | Remove listeners and the overlay. |

## Integration (15 lines)

```js
// <script src="title-menu.js"></script> before the game script
const menu = GameDNA_TitleMenu.create({
  canvas, title: 'My Game', tagline: 'One line about it', colors: { logo: ['#ffe890', '#ff8a3a'], panel: 'night' },
  isTitle: () => scene === 'title', canPause: () => scene === 'play',
  onStart: () => { startNewGame(); },              // the SAME code the old title confirm ran
  onRestart: () => { startNewGame(); }, onQuitToTitle: () => { scene = 'title'; },
  pauseKeys: ['p', 'P'],                           // keys the game does not use in play
  uiRects: () => scene === 'play' ? [{ x: 0, y: 0, w: 120, h: 12 }] : [],
  controls: [['Move', 'Arrows'], ['Jump', 'Z'], ['Pause', 'P']],
  onOption: (k, v) => { if (k === 'shake') shakeOn = v; },
});
function step() { menu.update(STEP_MS); if (menu.busy()) { clearPressedKeys(); return; } /* ...unchanged... */ }
function render() { if (scene === 'title') { drawTitleBackdrop(); if (!menu.titleShown()) drawOldTitleText(); menu.draw(); return; }
  drawWorld(); drawHud(); menu.draw(); }
```

## Keep the rest of the game working

- **Do not delete the old title code.** Under the skip flags (`?auto=1`, `?t=`, `freeze=1`) the module is off and the game must still show its own title and start from its own confirm / autopilot exactly as before. Only hide the old title *text* while `titleShown()`; keep the backdrop art and frames.
- `onStart` must run the same reset the old confirm ran (RNG reseed, new state, scene change). Do not start the game from anywhere else.
- `update()` first in the step, on every scene; while `busy()`, return before the frame counter, timers and the game's input; drop key presses queued while busy (the menu already consumed the ones it saw).
- `draw()` on **every** render path, after everything else, including early returns and the title.
- Choose `pauseKeys` the game does not use in play. Give `uiRects()` for the HUD so the pause button and hints stay off it.
- Never call `press()`, `openPause()` or `showTitle()` from the autopilot; never read `state()` in game logic.
- Options are the game's to apply: volume to its mixer, `textSpeed` to its typewriter, `shake` and `flashes` to its effects, `reduceMotion` to its own tweens. The module applies LARGE TEXT, HIGH CONTRAST and REDUCE MOTION to its own screens.

## Self-check without a browser

- The module file is byte-identical and loads before the game script; `create` runs after the canvas and the game state exist (callbacks may run at create).
- Grep `menu.update(`: once, first line of the fixed step. Grep `menu.draw(`: at the end of every render path, also the title's early return.
- The old title confirm and the autopilot's title press are still there (skip flags), and `onStart` runs that same code.
- `pauseKeys` are not in the game's key map for play; `canPause()` is false on the title, results and game-over screens.
- Walk one session: load (no flags) -> title shows PRESS START (busy) -> Z: the menu, NEW GAME selected (CONTINUE greyed without `canContinue`) -> Z: the wipe covers the screen in `transMs`, `onStart('new')` runs, play continues under the opening wipe -> P: pause, the world stops -> X: resume. With `?auto=1`: no menu at all.

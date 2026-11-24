# save-slots.js (I-04 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_SaveSlots`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns the save files and the slot screen: storage (a namespaced `localStorage` key, every call in `try/catch`, in-memory fallback), the envelope (version, checksum, summary, thumbnail), migration, the screen with 3 slots plus an autosave slot, confirm dialogs, "Damaged data", save codes, and an autoplay path. **Your game owns its state**: you give it `serialize()` and `deserialize(data)`; the module never reads or guesses your variables.

If `skins/skin-api.js` (and a skin such as `pixel16.js`) is loaded before it, it draws through `GameDNA_Skin.resolve(options.skin)`; without it, it uses its built-in 16-bit look (the same as `pixel16`).

## API

`GameDNA_SaveSlots.create(options)` returns an instance.

| option | meaning |
|---|---|
| `key` | **Required.** Storage namespace, unique to your game, e.g. `'meadow-errand'`. Slots are stored at `<key>/slot-1` … `<key>/slot-6` and `<key>/auto`. |
| `version` | Integer, default 1. Raise it when the shape of your save data changes. |
| `serialize()` | **Required.** Returns your game's state as plain JSON data (numbers, strings, booleans, arrays, plain objects). No functions, DOM nodes, images, `Map`/`Set`, or object references: store ids and rebuild references in `deserialize`. |
| `deserialize(data, info)` | **Required.** Puts that state back so the game keeps playing exactly as if it had never stopped. `info = {slot, version, summary, migratedFrom}`. If it throws, the module puts back the state from before the load. |
| `summary()` | Optional. `{place, level, time, note}` shown in the slot: `place` text, `level` (number shown as `LV 3`, or your own text), `time` = play time in **seconds** (shown `12M 05S`, `1H 05M`), `note` short text (`'HP 22/30'`). |
| `canSave()` | Optional. `true`, or `false` / a short reason (`'NOT IN BATTLE'`) where the state cannot be saved (a cutscene, a fight that holds callbacks). Checked by `save()`, `autosave()` and the screen's SAVE. |
| `migrate(data, fromVersion, toVersion)` | Optional. Returns data in the current shape. Without it, older saves show "OLD VERSION" and cannot be loaded. Newer saves always show "SAVED BY A NEWER VERSION". |
| `canvas`, `thumbRect` | Optional. The thumbnail is point-sampled from `canvas` (an element, or a function returning one; default: the canvas `draw()` last drew on) over `thumbRect` `{x, y, w, h}` in native px (default: the whole screen; leave out the HUD). Taken when the screen opens (before it covers the game) and on `save()` / `autosave()`. A function `canvas: () => { render(); return cv; }` makes it fresh during fast-forward. |
| `view` / `bounds` | Native screen `{w, h}`, or the area `{x, y, w, h}` the screen centres in. Default: the canvas size. |
| `skin` | Skin id or object (needs `skin-api.js`); default `pixel16`. |
| `params` | `slots` 3 (1-6), `autosave` 'on' (show the AUTOSAVE slot, allow `autosave()`), `autosaveGap` 10 (s between autosaves), `thumb` 'on', `thumbW` 40 (px), `confirm` 'on' (overwrite / delete / load-over-progress dialogs), `codes` 'on' (COPY CODE / PASTE CODE), `closeAfterSave` 'on', `dim` 0.45, `verify` 'on' (round-trip check after every load), `badge` 'on' (a small "SAVED" after an autosave), `autoAction` 'cancel' (what autoplay does when the screen opens: 'cancel', 'save', 'load'), `autoSlot` 1, `title` (default 'SAVE GAME' / 'LOAD GAME' / 'SAVE / LOAD'). |
| `autoplay` | Optional `true`/`false` or a function, read at each `open()`. When true, the screen never waits for keys: it does `autoAction` after 0.3 s and closes. |
| `storage` | Optional Storage-like object (`getItem`/`setItem`/`removeItem`) instead of `localStorage`. |
| `onAction(r)`, `onDone(r)`, `onOpen(mode)`, `onClose(r)` | Optional. `onAction` after every save / load / delete / export / import (synchronous, inside the call). `onDone` once when the screen has closed. |
| `exportText(code, slot)`, `importText(slot)` | Optional. Show a code / return a pasted code (string, synchronously). Default: clipboard (or `prompt()`), and `prompt()`. |
| `debug(e)` | Optional: `open`, `close`, `write`, `read`, `load` (`equal`, `diff`), `delete`, `autosave`, `storage` (a caught storage error), `saveAt`. |

All callbacks are wrapped in try/catch; a missing optional callback is fine.

| method | |
|---|---|
| `open(mode, opts)` | Opens the slot screen: `'save'`, `'load'` (from a title screen), or `'both'` (default). `opts`: `title`, `onDone(r)`, `auto`. Returns false if already open. Call it in update logic. |
| `busy()` | True from `open()` until the screen has closed. While busy: route keys to `key()`, pause the world, skip your own input. |
| `key(code, down)` | Pass `e.code` or `e.key` on keydown (`true`) and keyup (`false`). Uses arrows, Z / Space / Enter (confirm), X / Escape / Backspace (back). Returns true for keys it used. Latched: acted on at the next `update()`. OS key repeat is ignored; held arrows repeat on the module clock. |
| `press(name)` | Your own input instead: `'up'`, `'down'`, `'left'`, `'right'`, `'ok'`, `'back'`. |
| `tap(x, y)` | Pointer in native px: row = select / open its actions; outside the panel = back. |
| `update(dtMs)` | Every fixed step, also while busy. The only clock (no timers, no wall time). |
| `draw(ctx, ox = 0, oy = 0)` | Native resolution, last in the draw pass. Draws the screen while open, and the autosave badge. Never throws. |
| `save(slot, opts)` / `load(slot)` / `remove(slot)` | Direct calls (slot = 1-6 or `'auto'`). Synchronous; return `{action, slot, ok, error, stored: 'local' \| 'memory', roundTrip}`. Call them **between** fixed steps or at the end of one, never halfway through your update. `save(slot, {force: true})` skips `canSave`. |
| `autosave()` | Writes the AUTOSAVE slot if `autosave` is on and `autosaveGap` has passed (else null). If `canSave()` is false or the screen is open right now, it is queued (`{queued: true}`) and written by `update()` at the first step where `canSave()` is true, so a checkpoint during a dialog is not lost. Never writes on a `freeze=1` page. Call it at checkpoints (room entered, fight won, quest step), not every frame. |
| `exportCode(slot)` / `importCode(code, slot)` | A text code `GDNA1-…` (base64 of the checked envelope). Import checks the checksum and the game key. |
| `boot()` | Call once after your game is set up, before the first step and before any `?t=` fast-forward. Handles URL parameters (below). |
| `selfTest()` | For tests and judges, between two steps: serialize → write → read → verify; then load the previous `selfTest()` snapshot and check `serialize()` returns it (catches fields `deserialize` ignores); then load the current state back and check again. `{ok, equal, equalPrev, diff}`. Skipped while the screen is open or `canSave()` is false. |
| `list()`, `storageMode()`, `canSave()`, `state()`, `rect()`, `lastResult()`, `lastAction()`, `lastDrawn()`, `setParams()`, `params()` | Slot infos `{slot, status: 'empty' \| 'ok' \| 'old' \| 'stale' \| 'newer' \| 'damaged', summary, version}`; `'local'` / `'memory'`; screen state; panel rect; results; drawn rects; params. |
| `close()`, `clear()` | `close()` = the player backing out. `clear()` drops the screen silently (restart). |

**URL parameters** (read by `create()` / `boot()` only; nothing else reads storage on load, so `?t=&freeze=1` frames never depend on what is stored): `?loadSlot=1` (or `auto`) loads that slot in `boot()`; `?saveAt=<ms>&saveSlot=<n>` saves once when the module clock reaches `ms` (first step boundary where `canSave()` is true; for scripted save/reload tests); `?openSlots=save|load|both` opens the screen in `boot()`; `?saveStore=memory` ignores `localStorage`.

**What a slot looks like on screen**: thumbnail (or static noise for damaged data), `SLOT 1` and play time, place, level and note. Damaged = invalid JSON or a checksum mismatch: "DAMAGED DATA"; it can be deleted or overwritten, never loaded. The pixel16 font draws letters, digits and `- . / ?`; other characters in your summary are dropped.

## Integration (15 lines)

```js
// <script src="save-slots.js"></script> before your game script (skin-api.js + pixel16.js before it if you have them)
const saves = GameDNA_SaveSlots.create({ key: 'my-game', version: 1, view: { w: SCREEN_W, h: SCREEN_H }, canvas: canvasEl,
  thumbRect: { x: 0, y: HUD_H, w: SCREEN_W, h: SCREEN_H - HUD_H }, autoplay: () => AUTOPLAY,
  serialize: () => ({ player: { ...player }, enemies: enemies.map(e => ({ ...e })), rng: rng.state(), frame, scene }),
  deserialize: d => { Object.assign(player, d.player); enemies = d.enemies; rng.setState(d.rng); frame = d.frame; scene = d.scene; },
  summary: () => ({ place: areaName(), level: player.level, time: frame / 60 }), canSave: () => scene === 'explore' && !dialog });
addEventListener('keydown', e => { if (saves.busy()) { if (saves.key(e.code, true)) e.preventDefault(); return; } /* existing keys */ });
addEventListener('keyup', e => saves.key(e.code, false));
function step() {
  if (saves.busy()) { saves.update(STEP_MS); return; }                 // world paused while the screen is open
  if (savePressed && scene === 'explore') { saves.open('both'); return; }   // your menu key; 'load' from the title
  /* existing update */ if (justEnteredRoom) saves.autosave(); saves.update(STEP_MS);
}
function render() { /* world, effects, HUD */ saves.draw(ctx); }
newGame(); saves.boot();                                                // boot once, before the first step / fast-forward
```

## Keep the game's other callers working

- **Save everything that the next step reads**: positions, timers, counters, the scene/phase, the RNG state, the frame counter, AI/autopilot memory, camera. A load must leave the game exactly where the save left it, so `?auto=1` runs from a save reach the same end as an uninterrupted run. If your RNG hides its state in a closure, add a getter/setter (or count draws and replay them). Store references as ids. Cached or derived values (paths, sprites) may be rebuilt in `deserialize`.
- **Game state only, never session flags.** Do not save the autoplay flag, `freeze`, debug switches or `?t`: they belong to the page, not the game. A load keeps the current session's flags, so a slot saved under `?auto=1` and loaded by a person gives the person control. If the save was taken while the autopilot had moves queued, drop that queue on load when autoplay is off.
- **Where state holds functions** (a dialog's "then" callback, an animation's continuation): either encode them as names you can map back, or return false from `canSave()` there.
- **After a load, `verify` checks** that `serialize()` gives back exactly the loaded data, and warns with the first differing path (`.hero.walk`) when not: that part of the state is not restored.
- **Autoplay** (`?auto=1`): never open the screen from the autopilot unless you mean it; pass `autoplay` so an opened screen closes itself. Autosaves during autoplay are fine (they do not change the game).
- **Fast-forward** (`?t=&freeze=1`): `update()` inside the fixed step, `boot()` before the fast-forward loop, no other storage reads at load.
- **Keys**: while busy, keys go to the screen and the game's own input waits; the key that opens the screen must not also act in the game. Pause/restart keys stay yours. Don't rename or remove host functions.
- **Restart / new game**: `clear()`.

## Self-check without a browser

1. The module file is byte-identical to the one you were given and is loaded before the game script.
2. `serialize()` returns plain data that covers every variable the fixed step reads or writes (list them), and no session/URL flag (autoplay, freeze, debug); `deserialize()` writes each one back and rebuilds references from ids.
3. Walk one save/load by hand: save at frame N, change a few values, load: is every listed variable back to its frame-N value? Is the RNG state among them? Save under `?auto=1`, load without it: the player has control (no autopilot, no queued autopilot moves).
4. `update(` runs every fixed step, also while busy; while busy the world does not advance (frame counter included).
5. `open(` only in update logic, from your menu/save key or save point, never from the autopilot; `boot()` once after setup and before the fast-forward loop.
6. `draw(` is the last call of the draw pass; restart calls `clear()`.
7. `canSave()` is false wherever the state holds functions or half-finished actions you did not encode.

## What it guarantees

- Every storage call is in `try/catch`: private mode, blocked storage or a full quota never throws; saves then live in memory for the session (the screen says "THIS SESSION ONLY").
- A corrupted or hand-edited slot (bad JSON, checksum mismatch) shows "DAMAGED DATA" and is never passed to `deserialize`.
- `deserialize` only ever receives data that went through JSON, already migrated to the current `version`.
- Same calls = same frames: the screen runs on `update()` time only; thumbnails are drawn synchronously from stored pixels.

# I-04 Save & load slots

## 1. What it is

The save/load screen of a 16-bit console game, as an addon. The player presses the game's save key (or touches a save point) and a window slides open over the dimmed game: a title bar (`SAVE / LOAD`, `SAVE GAME` or `LOAD GAME`), then one row per slot. Each row shows a tiny picture of the moment it was saved, point-sampled from the game's own canvas at native resolution (no blur: the same pixels, every 6th or so), the slot name and play time (`SLOT 1 … 12M 34S`), the place (`DUNE PATH`), and a line for level and a short note (`LV 4  310 G`). An **AUTOSAVE** row sits on top when autosave is on. The hand pointer picks a row; Z opens a small action menu (`SAVE`, `LOAD`, `COPY CODE`, `PASTE CODE`, `DELETE`, only the ones that apply); overwriting, deleting and loading over progress ask `OVERWRITE SLOT 2?  NO / YES` with NO preselected. A save flashes the row and "develops" the new picture from white; a load swaps the world behind the window, then the window closes and play continues from exactly that moment.

Under the screen sits the part players never see: a namespaced `localStorage` key per slot holding an envelope `{version, game key, summary, thumbnail, data, checksum}`. A slot whose JSON is broken or whose checksum does not match reads **DAMAGED DATA** (static noise instead of a picture) and can only be deleted or overwritten. Saves from an older data version go through the game's `migrate()` hook; newer ones are refused politely. A save can be exported as a text code (`GDNA1-…`) and pasted into another browser. If storage is blocked or full, nothing throws: saves live in memory and the header says `THIS SESSION ONLY`.

The game supplies `serialize()` / `deserialize(data)`; the module never reads or guesses the game's variables. It is a UI addon: it decides nothing about the game, consumes keys only while open, and runs on the game's fixed step.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `opens` | the S key while exploring opens save / load; the L key on the title screen opens load | text, **required** | Where the screen opens, in the designer's words |
| `slots` | 3 | 1–6 | Manual slots |
| `autosave` | on | on, off | The AUTOSAVE row and `autosave()` (at checkpoints the game picks; at most one per `autosaveGap` = 10 s) |
| `thumb` | on | on, off | Thumbnails |
| `thumbW` | 40 px | 24–64 | Stored thumbnail width; height from the play field's aspect (256×208 → 40×33) |
| `confirm` | on | on, off | Ask before overwrite, delete, paste over a save, and load in `both` mode |
| `codes` | on | on, off | COPY CODE / PASTE CODE |
| `closeAfterSave` | on | on, off | Close 0.7 s after a save |
| `dim` | 0.45 | 0–0.8 | Darkening behind the window |

Module-only parameters: `autosaveGap` 10 s, `verify` on (round-trip check after each load), `badge` on (a small `SAVED` with a turning gem for 1.4 s after an autosave), `autoAction` cancel (what an autoplay-opened screen does: cancel, save, load), `autoSlot` 1, `title`.

Fixed timings: open 120 ms (4 pixel steps), input ignored during the open, close 100 ms, toast 900 ms, row flash 200 ms, thumbnail develop 480 ms, load closes 320 ms after the toast, held arrows repeat after 320 ms every 90 ms (module clock).

## 3. Variants

- **Classic three slots** (defaults): autosave row, thumbnails, confirm, codes.
- **Single suspend slot**: 1 slot + autosave, no codes; opened from the pause key.
- **Save points only**: opened by touching a save crystal; no autosave.
- **Many slots, no pictures**: 6 slots, compact 1–2 line rows without thumbnails.
- **Quick**: no confirm dialogs, lighter dim.

## 4. Interface

**Needs**
- `serialize()` → plain JSON data covering every variable the fixed step reads or writes: scene/phase, positions, timers, counters, frame counter, RNG state, AI/autopilot memory, camera. References become ids. `deserialize(data, info)` writes them back.
- Where it opens (`opens`), in update logic, on the key's press edge: `open('both')` in play, `open('load')` on a title.
- While `busy()`: keys to `key(e.code, down)` (or `press(name)`, `tap(x, y)`), the world paused, `update(stepMs)` every step.
- `boot()` once after setup and before the first step and before any `?t=` fast-forward loop; `clear()` at restart; `draw(ctx)` last.
- Optional: `summary()` `{place, level, time (s), note}`, `canSave()` (false where state holds callbacks), `migrate(data, from, to)`, `canvas` + `thumbRect` (native px), `autoplay`, `autosave()` at checkpoints.

**Provides**
- `busy()`; results `{action, slot, ok, error, stored, roundTrip}` through `onAction` (each action) and `onDone` (screen closed), both synchronous.
- Direct `save(n)`, `load(n)`, `remove(n)`, `autosave()`, `exportCode(n)`, `importCode(code, n)`, `list()`, `selfTest()`.
- URL hooks: `?loadSlot=n|auto` (in `boot()`), `?saveAt=ms&saveSlot=n` (a scripted save at a step boundary), `?openSlots=save|load|both`, `?saveStore=memory`.
- `rect()` of the panel.

**Delivery (v1).** `module/save-slots.js` (one global, `GameDNA_SaveSlots`; API, 15-line integration, caller checklist and self-check in `module/README.md`). It draws through `GameDNA_Skin.resolve(options.skin)` when `skins/skin-api.js` is loaded (windows `skin.frame` role `window`, selected rows role `row`, empty thumbnails role `backing`, text `skin.text` 'ui' font with token colours, the pointer `skin.cursor('hand')`) and falls back to a built-in copy of the pixel16 look (window ramp, rivets, 5×7 font, hand) without it. Verified on two unseen hosts (scratch copies, `checks/hosts/`).

## 5. Screen rules (exact numbers)

- Panel: `min(field w − 8, 248)` wide, centred in the field; header 20 px (title at +9, +7; `V<version>` or `THIS SESSION ONLY` right-aligned), a 1 px rule at +18, rows from +22 with 2 px gaps, footer 15 px (hint or toast centred at bottom − 12).
- Row height: `clamp(floor((min(field h − 8, 216) − 39 − 2(n − 1)) / n), 11, 42)` → 42 px for 4 rows at 256×224. Rows ≥ 30 px: 3 text lines; 20–29: 2 lines; below: 1 line. Thumbnails only when the row is ≥ 22 px.
- Row content: hand pointer (skin `handW` 7 + `pointerGap` 5), thumbnail box 1:1 at the stored size when it fits (`rowH − 4`), else scaled down nearest-neighbour; 1 px ink border; text 7 px right of the box; play time right-aligned on line 1; text cut with `.` at the row's edge.
- Action menu: right side of the panel, 8 px in, next to the selected row, 11 px per item. While a confirm box is up (v1.0.1) the action menu is not drawn (the question names the action), the other rows are dimmed 40%, and the box covers whole neighbouring rows: as wide as a row, as tall as the fewest rows that hold 34 px, just below the row it asks about (above it when there are no rows below), never over it, so no row is left half hidden with its text cut. With a single row it falls back to a centred 34 px box, ≥ 112 px wide. NO and YES side by side, NO preselected.
- Windows on pixel skins get an opaque under-fill (`ui.fillTo`), so the game never shows through; the level/note line uses the `text.label` colours.
- Damaged thumbnail: 2×2 static from a hash of the module clock (new pattern every 120 ms) and two hot lines; text `DAMAGED DATA` in `fx.hot`.
- Toasts: `SAVED TO SLOT 2` (`fx.heal`), `SAVED - THIS SESSION ONLY`, `LOADED SLOT 1`, `DELETED`, `CODE COPIED`, errors in `fx.hot` (`DAMAGED DATA`, `SAVED BY A NEWER VERSION`, `CODE FROM ANOTHER GAME`, the game's `canSave()` reason).
- Autosave badge: field bottom-right, 4 px in, `backing` band 13 px high, 1.4 s with stepped fade.
- Pixel skins: stepped open/close (4 steps) and stepped fades; text in the pixel16 ui set (letters, digits, `- . / ?`); other characters of the game's summary are dropped (`:` `,` → space).

## 6. Common mistakes (symptom → fix)

| Symptom | Fix |
|---|---|
| After a load the game plays differently from where it was saved (enemies move elsewhere, a different roll) | Part of the state is not saved: the RNG state (closure RNGs need a getter/setter), the frame counter, AI/autopilot memory, timers. The module warns `serialize() differs … at <path>` when `deserialize` ignores a saved field; an `?auto=1&saveAt=…` → `?auto=1&loadSlot=…` run that ends differently finds what is not saved at all. |
| Saving throws "cycles" / `JSON` errors, or loads restore half an object | `serialize()` returned live objects with references (a unit's target, a callback). Store ids, rebuild references in `deserialize`. |
| Saving during a fight or a dialog breaks the game after a load | That state holds functions (a "then" callback). `canSave()` false there, or encode the callback as a name. |
| The world keeps moving behind the screen, or the play time counts up | Gate the whole fixed step on `busy()` (call `update` and return), frame counter included. |
| The key that opened the screen also moves the cursor or acts in the game | Open on the key's press edge in update logic; while busy, return from the key handler after `key()`; ignore OS key repeat. |
| `?t=&freeze=1` frames differ from before | Something reads storage at load: only `boot()` may, and only with `?loadSlot`. Do not auto-load the last save. |
| `?auto=1` hangs on the screen | The autopilot opened it without `autoplay`; pass `autoplay` (the screen closes itself) or never open it from the autopilot. |
| Thumbnails are black or stale | The canvas was not drawn yet (fast-forward) or is the wrong one: pass `canvas: () => { render(); return cv; }`; `thumbRect` in native px, HUD excluded. |
| Two games on one site share slots | Give each its own `key`. |
| A slot saved under `?auto=1` turns the AI on when a person loads it | The autoplay flag was serialized. Save game state only, never session/URL flags (autoplay, freeze, debug, `?t`); a load keeps the session's flags and drops queued autopilot moves when autoplay is off. |
| A checkpoint autosave is missing | It was requested while `canSave()` was false (a dialog open). `autosave()` queues and writes at the next step where `canSave()` is true; do not drop the call. |

## 7. Acceptance moments

1. The screen just opened in play: dimmed game behind, header, AUTOSAVE + 3 rows (pictures, names, play time, place, level), the hand on SLOT 1.
2. The action menu on a used slot (SAVE / LOAD / COPY CODE / PASTE CODE / DELETE) and the `OVERWRITE SLOT 2?` confirm with NO preselected.
3. Right after a save: the row flashes, the new picture develops from white, `SAVED TO SLOT 2` in green; the window closes 0.7 s later.
4. A load from the title (`LOAD GAME`): after YES the game is exactly where it was saved (same frame), and play continues.
5. A hand-edited slot: `DAMAGED DATA` with static; its menu offers SAVE / PASTE CODE / DELETE only; no console error.
6. Storage blocked: header `THIS SESSION ONLY`, `SAVED - THIS SESSION ONLY`, and a load in the same session still works.
7. `?auto=1&saveAt=6000&saveSlot=1`, then `?auto=1&loadSlot=1`: the same end as `?auto=1`, same frame; `?t=&freeze=1` frames identical to the game without the module.

# C-01 Bevelled window + pointer cursor

## 1. What it is

A drop-in replacement for a game's plain rectangles of text. Every menu and text box becomes a bevelled gradient window (four bands from light to dark, a 1 px light bevel top-left, a dark bevel bottom-right, clipped corners and gold rivets). A window opening grows from its own centre to full size in 6 frames; closing shrinks it back. Text appears only once the window is fully open. In a menu, a pointing glove sits left of the selected row and bobs 1 px toward it every 200 ms; when the selection changes the glove slides to the new row in 50 ms. Disabled rows are drawn in a grey-blue instead of white, notes (MP cost, `x3`) in gold, right-aligned. While a sub-menu or a target is chosen, the parent menu stays on screen with a still, dimmed glove. Picking a unit shows the same glove beside the unit, pointing at it, sliding from unit to unit. Messages are word-wrapped, can show a bobbing ▼ for "more", and are placed where they cover no sprite and no HUD.

The host keeps all menu logic (state, input, what a choice does). It only reports, each frame or on change, which windows are open, their items and which row is selected.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `open` | 6 frames | 0–12 | Grow / shrink length at 60 Hz; 0 = instant |
| `slide` | 50 ms | 0–160 | Glove travel between rows (target pointer: ×1.6) |
| `bob` | 200 ms | 100–500 | Length of each of the glove's two bob positions |
| `rowH` | 12 px | 10–16 | Row pitch in menus and messages (per window override) |
| `type` | 0 | 0–120 chars/s | Typewriter for messages; 0 = whole page at once |
| `margin` | 2 px | 0–8 | Gap kept from avoided rectangles |
| `tint` | a | a, n, b | Window ramp: blue, slate, red (skin team colours) |
| `pointer` | glove | glove, skin | 10×7 glove coloured from skin tokens, or the skin's own hand (size from `skin.layout.handW/handH`, default 7×5) |
| `band` | auto | auto, on, off | Highlight band behind the selected row (`ui.select` token, or frame role `row` when `skin.layout.rowFrame`); auto = off for pixel skins unless `layout.rowBand` |

## 3. Variants

- **Classic 16-bit**: the defaults.
- **Snappy**: `open 3`, `slide 30`, `bob 160`, `rowH 11`.
- **Storybook dialogue**: `open 8`, `slide 80`, `bob 260`, `rowH 13`, typewriter 40 chars/s, slate windows.
- **No motion**: `open 0`, `slide 0`, `bob 500` (accessibility, or games that dislike animated UI).

## 4. Interface

**Needs**
- A fixed 60 Hz step: `update(dtMs)` once per step, `draw(ctx)` once per frame, last.
- The screen area windows must stay in (`view`, native px).
- Optional rectangles to avoid: `getObstacles()` → sprites with `id`, HUD panels, banners (screen px after camera).
- The host's menu state: `menu(id, {items, selected, active})`, `message(text)`, `setCursor(target)`, `close(id)`.

**Provides**
- Window and pointer rects (`rects()`, `lastDrawn()`) for other overlays to avoid.
- `itemAt(id, x, y)` for taps on rows.
- `place(w, h, want)`: a rect on screen and off the obstacles.

**Delivery (v1).** All of this is `module/window-cursor.js` (one global, `GameDNA_WindowCursor`; API and a 15-line integration in `module/README.md`). It draws through `GameDNA_Skin` when `skin-api.js` and a skin are loaded (frame `role: 'window'`, text `font: 'ui'`, palette tokens for every colour, `cursor(…, 'hand')` when `pointer: 'skin'`), otherwise through a built-in copy of the `pixel16` look. Characters a bitmap skin font lacks (`: , ! ' ( ) + = …`) are drawn from the module's own 5×7 punctuation in the skin's text colours. With a skin loaded, opening follows its `motion` rules (an easing such as `outBack` overshoots, a long `stepMs` steps the growth; pixel16's `snap` keeps the plain linear growth), smooth skins animate their own hand from `t`, the inactive hand's alpha goes to `cursor()` once, and canvas-font skins re-measure after `document.fonts.ready`. Titles use `fonts.title` and notes `fonts.small` when the skin has them; the selected-row band is frame role `row` (SPEC v2); `skin: false` forces the built-in look (used by the `skins/test.html` C-01 parity cases, 0 differing pixels). Smooth skins (`pixel: false`) default to their own hand, draw the ▼ as skin text and keep the host's image smoothing. The demo runs on the same module with skin-api and pixel16 inlined. Windows can be driven two ways: called every frame (a window not called for 3 steps closes itself), or opened once and closed with `close(id)`. A window opened or changed after the last `update` (from render code) is shown settled on the first draw after a fast-forward (`?t=&freeze=1`), never as frame 0 of its animation.

## 5. Screen rules (exact numbers)

Native canvas (256×224 in the demo), integer-scaled, nearest-neighbour.

- **Frame** (pixel16): fill in 4 equal horizontal bands of the tint ramp at 95 % alpha (a: `#3a64d8 #2c50b8 #223e96 #1a2e74`), outline `#06061a` with the 4 corners cut by 1 px, bevel light `#a8c8ff` on the top row and left column inside, bevel dark `#0a1238` on the bottom row and right column inside, 2×2 rivets (`#ffe070` on `#7a5410`) 2 px in from each corner. Content inset 4 px. A window over another window gets an opaque under-fill of its darkest band first, so the window below never shows through.
- **Open / close**: at progress *p* (0→1 over `open` frames on the module clock) the frame is drawn at `max(8, round(w·p)) × max(8, round(h·p))`, centred on the final rect. No text, glove or note before *p* = 1. Closing runs the same backwards, then the window is removed.
- **Text**: 5×7 bitmap, 6 px advance, upper case, rows 0–3 main colour, rows 4–6 second colour, 1 px drop shadow down-right. Narrow punctuation advances glyph width + 1. Roles: main `#ffffff/#c8d4ff`, disabled `#8088a8/#626a88`, title `#b8d0ff/#8ca8e8`, note `#ffe890/#e8c048`.
- **Menu layout**: rows every `rowH` px from the inner top; text baseline offset `floor((rowH − 7) / 2)`; label at inner x + 13 (glove width 10 + 3); notes right-aligned to the inner right edge; an optional title takes the first row. Auto size = widest label + widest note + 8 + gutter, at least the `w`, `h` passed.
- **Glove**: 10×7 (`.oooo.....` / `oWWWWboooo` / `oWWWWWWWWo` / `oWWWWboooo` / `oWWWWo....` / `osWWso....` / `.oooo.....`), `o` = pointer edge `#1a0e08`, `W` = `#fff8e8`, `s`/`b` = `#c8d4ff`. Menu glove at inner x − 1, its 7 rows aligned to the row's text; bob = `floor(clock / bob) mod 2` px to the right, none while sliding or inactive; inactive = 55 % alpha. Slide: ease-out quad over `slide` ms from where the glove is drawn now.
- **Target pointer**: left of the target, pointing right, tip 2 px from the target box, vertically on its middle (`y + h/2 − 3`); right of it (mirrored) when the left spot is off screen or touches another sprite or window. Bob toward the target. Slide 1.6 × `slide` from the previous target. Several targets: one glove each, bobbing together, no slide.
- **Placement**: a window with numeric `x` and `y` stays there (clamped into `view`). Others: wanted spot first (message: bottom, 8 px margins), then the alternatives (message: top), then the free spot nearest to the wanted one on a 2 px grid (horizontal moves cost 1.2× vertical), avoiding obstacles grown by `margin` and the module's other windows. Placement runs when a window opens or its size or wanted spot changes, never every frame.
- **Draw order**: windows in the order they opened, then pointers; called after the HUD it replaces, outside screen shake.

## 6. Common mistakes (symptom → fix)

- The menu jumps somewhere else when it opens → it was given only `x` or only `y` (auto-placed and avoiding the HUD); give both numbers to pin it.
- Menus never close → the game opened them once and never calls `close(id)`; call it when the menu goes away, or call `menu()` every frame.
- A battle box shrinks over the map after the battle → call `clear()` (or `close`) where the scene changes.
- Windows never finish opening → `update()` is not called (or called with 0); call it once per step, on every scene.
- Taps pick the wrong row → the tap handler still uses the old row maths; use `itemAt(id, x, y)` or set that menu's `rowH` to the old pitch.
- The pointer sits off to one side of a moving unit → pass the rect where the unit is drawn this frame, or its id from `getObstacles()`.
- Message boxes drawn over the hero → the hero is missing from `getObstacles()`, or the rects are in world, not screen, pixels.
- `?t=&freeze=1` shots show an empty 8×8 box → the module was created after the fast-forward or `draw` is not called on that path; create it at boot and draw on every render path.
- Two arrows on one row → the old cursor drawing is still there; remove it.
- Wrong window size on HiDPI canvases → pass `view` in native pixels; do not rely on `canvas.width`.

## 7. Acceptance moments

| Shot | Must be visible |
|---|---|
| `demo/?t=1000&freeze=1` | The intro message at the TOP (the bottom is the HUD, an obstacle), two wrapped lines, ▼ at its bottom-right; the party window below. |
| `demo/?t=1700&freeze=1` | The intro message shrinking (flat bar) while the command window grows from its centre (8×8 box). |
| `demo/?t=6400&freeze=1` | Command menu with a still, dimmed glove on MAGIC; the slate MAGIC window over the party window (opaque, nothing shows through), glove on the greyed QUAKE 12. |
| `demo/?t=8600&freeze=1` | Target pointer left of the upper golem pointing at it; both menus inactive. Same with `&skin=flat`: every element in the smooth token skin, same layout. |
| `demo/?t=10500&freeze=1` | `FROST` caption centred at the top, sized to its text. |
| `demo/?t=16200&freeze=1` | `SKREEE!` bubble above the bat, inside the screen. |
| `demo/?t=5300&freeze=1&obs=1` | Avoided rects (red) and window rects (green): no auto-placed window over a red rect. |
| Phone width 500 px | Demo canvas at 1×, no horizontal scroll. |
| Integrated hosts (`shots/11-18`) | Battle: root, spell, item menus in the old panel box, target pointer on heroes and foes, caption. Top-down: dialogue at the bottom, battle menu + prompt, quest-complete box. `?auto=1` ends as before in both. |

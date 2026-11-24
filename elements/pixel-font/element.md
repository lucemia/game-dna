# C-03 Pixel bitmap font

## 1. What it is

All text on a low-resolution canvas is drawn from a small original bitmap font, one font pixel to one native pixel, so letters have the same hard edges as the sprites around them at every integer zoom. Browser fonts at 8 px are anti-aliased, blurry and uneven; a bitmap font is what console-era games used. The element ships two faces: `regular`, a 6×8 proportional font (5 px caps, tabular digits, real lowercase with 1 px descenders), with a `mono` variant on a fixed 6 px advance; and `small`, a 5×7 font for dense HUD rows. Both cover printable ASCII plus `…` `▼` `▶` `♥` `·`.

On top of the glyphs: inline colour codes (`HP {gold}120{/}/150`), a 1 px drop shadow, a 1 px outline or both, alignment, word wrap to a width, fit-to-slot (shrink to `small`, then cut with `…`), and a typewriter that reveals a line letter by letter at a set speed, pauses after full stops and commas, calls a blip hook for sound, and shows a blinking ▼ when the line is complete.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `font` | regular | regular, mono, small | Face for body text and dialogue |
| `hudFont` | small | small, regular, mono | Face for dense HUD rows (prompt only; passed per call) |
| `scale` | 1 | 1, 2 | Whole-number glyph scale (the module accepts up to 8; 3+ only for titles, not dialogue in a 256×224 screen) |
| `shadow` | drop | drop, outline, both, none | 1 px (× scale) drop shadow down-right, 8-way outline, or outline plus drop |
| `color` | white | name, `#hex`, skin token | Default text colour |
| `cps` | 40 | 10–120 | Typewriter characters per second (spaces take half) |
| `blipEvery` | 2 | 1–6 | Blip callback every n visible letters, at most one per update |
| `pause` | 160 ms | 0–400 | Extra wait after `. ! ? …` at the end of a word; half after `, ; :` |

## 3. Variants

- **Console dialogue**: the defaults.
- **Arcade outline**: `scale 2`, outline, gold, fast typing (60 cps, 80 ms pause).
- **Tiny HUD**: everything in `small` with a drop shadow.
- **Slow storyteller**: outline plus drop, 22 cps, 300 ms pauses, a blip on every letter.

## 4. Interface

**Needs**
- The game's text calls: `ctx.fillText` / `strokeText`, or a bitmap-text helper and its width helper. In `host/`-style games that is one or two functions (`text()`, `say()`, `textW()`); their bodies change, their names, parameters and return values do not.
- For the typewriter: the fixed update step (to call `update(stepMs)`), the place where a message, caption or dialogue line is set, and the confirm key if the game already advances messages.

**Provides**
- `measure` / `size` / `wrap` for layout; `draw(...)` returns the drawn box.
- Typewriter `status(id)` (`shown`, `total`, `done`), `skip(id)`, `onBlip(ch, index, id)`, `onDone(id)`.
- `lastDrawn()`: text boxes drawn since the last `update` (tests, overlays that must avoid text).

**Delivery (v1).** All of this is `module/pixel-font.js` (one global, `GameDNA_PixelFont`; API and a 15-line integration in `module/README.md`). Colours resolve through `GameDNA_Skin.resolve(options.skin)` when the skin API is loaded (default `pixel16`; names map to tokens such as `text.gold`, `fx.heal`), else through a built-in copy of the pixel16 colours. `face: 'skin'` hands drawing to a non-pixel skin's `text()` (layout and typewriter stay the module's). The demo runs on the same module.

## 5. Screen rules (exact numbers)

- **Glyph grid.** `regular`: cell 8 rows; caps and digits rows 0–6 (7 px), x-height rows 2–6 (5 px), ascenders from row 0, descenders reach row 7. Advance = ink width + 1 (most caps 6, most lowercase 5, `I` 4, `i` 2, space 4); digits all 5 + 1 so changing numbers never shift. `mono`: every glyph centred in a 6 px advance. `small`: cell 6 rows; caps and digits rows 0–4 (5 px), x-height rows 1–4, descenders row 5; most caps 4 + 1, digits 3 + 1, space 3.
- **Line height.** `regular` / `mono` 10 px, `small` 7 px (× scale); `lineHeight` overrides.
- **Pixels.** Each glyph pixel is a `scale × scale` square. The text origin is snapped so `transform.a × x + e` is a whole multiple of the transform scale; smoothing is off while drawing and restored after. Canvas CSS scaling should be a whole number or use `image-rendering: pixelated`.
- **Shadow.** Drop: the glyph in `text.shadow` (`#0a0c24` in pixel16) at (+scale, +scale). Outline: 1 px dilation in 8 directions (× scale) in `text.outline` (`#120a1e`). Both: outline drawn at (+scale, +scale) in the shadow colour, then the outline, then the fill. All shadow and outline passes of a string are drawn before any fill.
- **Alignment.** `(x, y)` = top-left of the text box; `align` center/right use the widest line; each line is aligned inside the box. `baseline: 'alphabetic'` puts the caps' bottom on `y`.
- **Wrap.** Greedy by words; `\n` forces a break; a word longer than the width breaks by letters; spaces at a wrap are dropped. The typewriter lays out the whole text first, so a word never jumps to the next line while typing.
- **Typewriter timing.** Letter *i* appears at Σ (1000 / cps per letter, 500 / cps per space, + `pause` after `. ! ? …` and `pause / 2` after `, ; :` when followed by a space or the end, + any `{pN}`). Time only advances in `update(dt)` (dt capped at 1000 ms). The ▼ cursor sits 2 px after the last letter and bobs 1 px every 260 ms.
- **Clamp.** A text box that would leave the canvas (or `view`) is shifted back inside; it is never cut off.

## 6. Common mistakes (symptom → fix)

- Text blurry or letters of uneven thickness → canvas CSS-scaled by a fraction without `image-rendering: pixelated`, or text drawn under a non-integer `ctx.scale` → integer scale or pixelated CSS; the module snaps positions, it cannot fix a fractional zoom.
- HUD values run into the next column or past the window → widths were hard-coded for the old font → every width through `measure`; dense rows in `small` or with `fit`.
- Right-aligned numbers wobble while they count → proportional digits → the fonts' digits are tabular; align right with `align: 'right'` instead of padding with spaces.
- A message is empty in `?t=&freeze=1` screenshots → `typewriter` was only called from the draw pass, which replays do not run → call it where the message is set (inside the step).
- The second identical message ("Checkpoint.") shows instantly with no typing → `typewriter` treats the same text as the same line → pass `restart: true` at the set site (the module also restarts a line not drawn or touched for 300 ms).
- Text never appears → `update` is never called → call `update(stepMs)` in the fixed step (after ~45 draws without an update the module shows the whole text and warns).
- Confirm skips the whole conversation → the advance code runs on the first press → `if (!PF.skip(id)) return;` before it.
- Colour leaks into the rest of the line → missing `{/}` → close each code; a new line in `wrap()` keeps the colour on purpose.
- `{` in a string disappears or a word turns into a colour → write `{{`; unknown `{words}` print as is.
- A system font is still used somewhere (title screen, game-over box) → grep every `fillText`/`strokeText`; the judge probe counts them (`fillTextLeft`).

## 7. Acceptance moments

| Shot | Must be visible |
|---|---|
| `demo/?t=3500&freeze=1` | Night river scene (pixel-disc moon clear of the HUD and title): `Lantern Road` title (2×, outline + drop), small-font subtitle and HUD (`WREN`, `HP 97/150`, `GOLD 02587` in mono), first dialogue line complete with `lantern road` in gold and the ▼ cursor; every edge hard. |
| `demo/?t=1500&freeze=1` | The same line half typed (50 of 90 characters), text left-anchored in the window. |
| `demo/?t=6500&freeze=1&scale=2&shadow=outline` and `&t=9200` | 2× outlined dialogue in the same fixed-size window, split into pages with `wrap()` (`1/2`, `2/2`); boat, HUD and sign stay visible. |
| `demo/?t=9500&freeze=1&font=small&cps=20` | Small font mid-reveal, `3 river pearls` cyan, `Do not` red. |
| `demo/?view=glyphs&t=3000&freeze=1` | Both glyph sheets (full ASCII), the pangram in both faces, colour codes, outline / both / none at 2×, `fit` with `…`, wrap with colour carried over. |
| Phone width 500 px | Canvas 1× (no horizontal scroll), controls stack below. |
| Battle host integrated (`checks/hosts/battle`) | Menu, party HUD, title and wave banners in the new fonts; `Strike` caption typing; nothing overlapping. |
| Sidescroll host integrated (`checks/hosts/sidescroll`) | HUD `LIVES 3`, `x4`, `TIME 4` crisp at the page's fractional CSS scale; `Checkpoin` mid-reveal at `?t=5000&freeze=1`. |

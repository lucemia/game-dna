# C-04 Big banner text

## 1. What it is

When the game moves into a new phase (player phase, enemy phase, a new wave or round, a warning, stage clear, victory, defeat), a big announcement crosses the play field: large chunky letters, shaded like 16-bit title text, over a translucent band that spans the field. The band opens, the text slides in, holds long enough to read, then the whole banner wipes off. The kind of moment sets the colours (blue for the player's phase, red for the enemy's, gold for a clear, dusk grey-violet for defeat, amber with hazard edges for a warning, neutral for waves). Banners never overlap: a second one waits until the first has gone. The host can read one flag to hold player input while a banner plays. Result banners can be sticky: they stay until the player continues.

It is a UI addon: it decides nothing about the game's flow and reads no input.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `enter` | slide | slide, scale, drop, wipe | How the banner arrives |
| `exit` | wipe | wipe, slide, fade | How it leaves |
| `enterMs` | 260 | 120–500 | Enter time (drop: per letter, plus the stagger) |
| `holdMs` | 900 | 300–1500 | Fully shown |
| `exitMs` | 260 | 120–500 | Exit time |
| `stagger` | 35 ms | 0–80 | Drop only: delay between letters |
| `size` | 2 | 1, 2, 3 | Letter scale of the 5×7 bold font (shrinks if the text does not fit) |
| `band` | 0.72 | 0–1 | Band opacity |
| `position` | center | upper, center, lower | Preferred band centre: 33 %, 50 %, 67 % of the field |
| `block` | on | on, off | Whether `busy()` reports it |
| `queue` | queue | queue, replace | A new banner waits, or cuts the current one short |
| `glint` | on | on, off | A light streak across the letters when the hold starts |

Default total: 260 + 900 + 260 = 1420 ms.

## 3. Variants

- **Tactics phase** (defaults): slide in, wipe out, 2× letters, centre.
- **Arcade drop-in**: letters drop one by one (40 ms apart), 3× letters, upper third, slide out, 700 ms hold.
- **Quick, out of the way**: wipe in, fade out, 160/500/160 ms, 1× letters, lighter band, does not block input.
- **Punchy pop**: scale in with overshoot, 3× letters, a new banner replaces the current one.

## 4. Interface

**Needs**
- The moments, in update logic: call `show(text, {kind, sub, hold})` once where the phase, wave, stage or result changes. Never from the draw pass.
- A fixed update step: `update(stepMs)` is the banner's only clock, so `?t=&freeze=1` fast-forwards are deterministic.
- The play field `{x, y, w, h}` in native pixels with the HUD excluded.
- Optional: UI rectangles (HUD windows, menus, captions) from `getObstacles()` (rects without `id`); sprites with `id` are avoided only when it is cheap.

**Provides**
- `busy()`: true while a blocking banner enters, holds, leaves, or is queued; a sticky banner only while it enters.
- `rect()`: the band on screen, for other overlays (damage numbers, tooltips) to avoid.
- `onStart` / `onEnd` events per banner; `current()`, `count()`.

**Delivery (v1).** `module/big-banner.js` (one global, `GameDNA_BigBanner`; API and a 15-line integration in `module/README.md`). It draws through `GameDNA_Skin.resolve(options.skin)` when `skins/skin-api.js` is loaded (pixel skins: built-in bitmap font coloured from skin tokens; `pixel16` uses the hand-picked ramps below; non-pixel skins: the skin's `display`, `title` or `ui` canvas font with an outline) and falls back to the built-in pixel16 look without it. The demo runs on the same module.

## 5. Screen rules (exact numbers)

Native canvas, integer-scaled with nearest-neighbour (pixel skins).

- **Font**: 5×7 capitals, digits and `! ? . , ' - : / + & # %`, each stroke widened 1 px to the right (bold, 6×7 cell), then scaled by `size`. Letter gap max(2, size) px, space 3 × size px. Cap height 14 px at size 2. If the text is wider than the field minus 12 px, the size steps down (3 → 2 → 1).
- **Shading** (per output pixel): top edge of a stroke = highlight; bottom edge = shade; else rows 0–3 of the 7 = top colour, rows 4–6 = bottom colour. 1 px ink outline (8-way) plus a drop of 1 px (2 px at size 3) below. Outline and fill are pre-rendered per banner.
- **Band**: full field width; height = text box (7·size + 2 + drop) + 8, plus sub-line height + 4 with a sub line. Dark fill at `band` opacity, middle stripe (from 28 % to 72 % of the height) one step lighter, 1 px light edge line inside top and bottom, 1 px ink line outside. `warn`: 3-px diagonal hazard ticks every 8 px along both edges. Other kinds: three `>` chevrons at each end when the text leaves ≥ 26 px on each side.
- **Placement**: band centre at 33/50/67 % of the field, clamped inside it; never intersecting a rect without `id` (searched in 2 px steps up and down, cost = distance + 0.015 × sprite overlap area); kept for the banner's life unless a UI rect opens over it (checked every 10 updates).
- **Text**: centred; top at band top + 4. Sub line: the skin's `ui` font (pixel16 5×7, 2-tone), centred 2 px under the big text, shown from 50 % of the enter.
- **Motion** (`p` = progress of the stage): band opens from 2 px to full height over the first max(120 ms, 45 % of `enterMs`), ease-out cubic.
  - slide in: text from +75 % field width to 0, ease-out cubic. scale in: text scale back-eased 0 → 1 (overshoot ~10 %). drop: letter *i* starts at *i*·stagger, falls 30 px with ease-in over 70 % of `enterMs`, then one 3 px bounce. wipe in: band and text revealed left → right with a 2 px light leading edge.
  - hold: glint, a 6 px slanted white streak at 70 % alpha, crosses the letters in 340 ms. `warn` blinks white (60 %) every other 160 ms for the first 640 ms.
  - wipe out: cut from the left, ease-in, 2 px light edge. slide out: text leaves to the left (90 % width, ease-in), band closes over the last 60 %. fade out: stepped alpha 1, .75, .5, .25 (or the skin's `fadeSteps`).
- **Queue**: one banner on screen; next starts `gap` (80 ms) after the previous one has gone; max 6 waiting (the oldest is dropped with one warning). A `show()` identical (text + kind + sub) to the current, a queued one, or one that ended < 1 s ago is ignored. A new `show()` ends a sticky banner (it exits, then the new one plays). `replace`: the current banner exits at half `exitMs`, the queue is emptied.
- **Draw order**: last, over world and HUD, not inside the shake translate.

| kind | highlight | top | bottom | shade | band dark | band mid | edge |
|---|---|---|---|---|---|---|---|
| phase | `#ffffff` | `#cfe0ff` | `#6a9cff` | `#2a48b0` | `#0c1a5a` | `#1a3a9a` | `#9cc4ff` |
| enemy | `#ffffff` | `#ffd4c8` | `#ff7a5a` | `#b02a20` | `#4a0812` | `#8a1a22` | `#ffb0a0` |
| clear | `#ffffff` | `#fff2a0` | `#ffc030` | `#b06a10` | `#3a2406` | `#7a4e10` | `#ffe070` |
| defeat | `#f4f0ff` | `#c8c0e0` | `#8a7cb0` | `#3e3060` | `#0e0a1c` | `#241c3a` | `#a898c8` |
| warn | `#ffffff` | `#fff0b0` | `#ffa030` | `#c04010` | `#2a1004` | `#6a2a08` | `#ffc860` |
| info | `#ffffff` | `#f4f6ff` | `#b8c4f0` | `#5a66a0` | `#0a0c24` | `#262e4e` | `#c8d4f4` |

Ink `#06061a`. Other skins: ramps derived from `team.a`, `team.b`, `fx.crit`, `team.n`, `fx.hot`, `text.main`, or `palette.banner.<kind>` (7 colours) if the skin has it.

## 6. Common mistakes (symptom → fix)

- The banner restarts or flickers every frame → `show()` was called from the draw pass or every step of the phase; call it once at the state change (the module also ignores repeats, but only for 1 s after it ends).
- `?t=&freeze=1` shots show no banner, or a different frame each time → `update()` runs only in the animation loop; put it in the fixed step the fast-forward also calls.
- Two banners on top of each other (old text plus new banner) → the game's old phase text is still drawn; remove its call in the draw pass.
- The banner hides the HUD or a menu → `bounds` must end above the HUD; return menus and captions from `getObstacles()` without `id`.
- The game freezes on the victory screen → gating input on `busy()` with a non-sticky result banner that keeps getting re-shown, or gating the continue key; result banners use `hold: 0`, and the continue key is never gated.
- Autoplay or tests stop matching the original → the integration changed phase lengths or gated only autoplay; keep timings, and gate (if at all) where player input and autoplay both pass.
- After restart the old VICTORY banner is still up → call `clear()` at the start of the new game, before its first `show()`.
- Wave banner and phase banner overlap or the second is lost → call both `show()`s; the queue plays them in order.
- Letters blurry → draw at native resolution and scale the canvas with `image-rendering: pixelated`; never draw the banner after a CSS-scaled transform in a pixel game.
- The banner shakes with the screen → draw it outside the shake translate.

## 7. Acceptance moments

| Shot | Must be visible |
|---|---|
| `demo/?t=1000&freeze=1` | "PLAYER PHASE" in 2× blue shaded letters with "TURN 1" below, band across the field above the HUD, chevrons at the ends. |
| `demo/?t=330&freeze=1` | Slide-in: band open, text arriving from the right. |
| `demo/?t=1520&freeze=1` | Wipe-out: left part cut, light leading edge. |
| `demo/?t=500&freeze=1&enter=drop` | Letters dropping one after another. |
| `demo/?t=4300&freeze=1` | "WAVE 2" (neutral) on screen, "PLAYER PHASE" queued (state `count` 2), never both drawn. |
| `demo/?t=7500&freeze=1` | Amber WARNING band with hazard edges and sub line. |
| `demo/?t=11500&freeze=1` | Sticky gold VICTORY with "PRESS Z TO CONTINUE"; state `busy` false. |
| `demo/?t=1000&freeze=1&skin=flat-demo` | The same banner drawn with a system font through a non-pixel skin. |
| `demo/?t=1000&freeze=1&size=3&position=upper` | 3× letters in the upper third. |
| Phone width 500 px | No horizontal scroll; canvas at a whole-number scale. |

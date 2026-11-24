# E-01 Bouncing damage numbers

## 1. What it is

When a hit lands, the amount appears above the target on that same frame. Each digit pops up on its own, slightly after the one to its left, bounces twice with a small overshoot below its rest line, holds so it can be read, then drifts up and fades. The kind of hit decides the look: plain damage is white, heals are green with a `+`, criticals are bigger, flash white, shake and carry a `CRITICAL` label, misses show the word `MISS` in grey, MP loss is blue with a small `MP` suffix, and status effects show a purple word such as `POISON`. Several pops on screen at once never cover each other: a new pop moves to the nearest free slot. A 1px dark outline with a 1px drop keeps the numbers readable on any background. An optional hit-stop freezes the world for a few frames on impact, and the number is already visible on the first frozen frame.

Works for turn-based and real-time games alike; it only needs a frame clock and a hit event.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `bounce` | 10 px | 2–24 | Height of the first bounce in native pixels |
| `duration` | 1000 ms | 500–2000 | Life of one glyph, from pop to gone |
| `stagger` | 40 ms | 0–120 | Delay between one digit and the next |
| `hitstop` | 60 ms | 0–150 | World freeze on impact (criticals ×2); 0 = off |
| `scale` | 1 | 1, 2 | Glyph mask scale; outline and shading stay 1px |
| `scheme` | classic | classic, warm, contrast | Colour set (table below) |
| `crit` | burst | burst, flash, plain | How criticals differ |
| `stack` | on | on, off | Collision offset between pops |
| `outline` | 1 px | 1, 2 | Outline width (contrast scheme forces 2) |

## 3. Variants

- **Classic 16-bit**: the defaults.
- **Big and punchy**: `scale 2`, `bounce 14`, `duration 900`, `stagger 30`, `hitstop 90`, warm colours, 2px outline.
- **Calm, readable**: `bounce 6`, `duration 1400`, `stagger 60`, no hit-stop, criticals only flash.
- **High contrast**: contrast scheme, `scale 2`, 2px black outline.

Kinds inside every variant: damage, crit, heal (`+` prefix), miss (word), MP (digits + `MP`), status (word).

## 4. Interface

**Needs**
- A hit event on the impact frame: `{target, amount, kind}`, where kind is `damage | crit | heal | miss | mp | status`. In the host (`host/index.html`) that is `applyHit(target, amount, kind)`: call the pop from inside it after the HP change; never replace or rename host helpers.
- The target's screen anchor: centre x and the top of its head (top of the sprite box, including hover).
- A world clock in ms that stops during hit-stop (pop ages are measured on it).
- Optional rectangles to keep clear: action-name banner, HUD windows.

**Provides**
- A hit-stop request (`hitstop` ms, ×2 for criticals) on the impact frame.
- For criticals: a screen flash (35 % white, 100 ms) and, in `burst`, a ±2px screen shake for 200 ms.
- The list of live pop rectangles, so other pop-ups can avoid them.

**Skins.** With `skins/skin-api.js` loaded, the module draws through `GameDNA_Skin.resolve(options.skin).number()`: glyphs, colours, outlines and the label come from the skin, and the module only passes per-glyph `glyphOffset` values (`{dx, dy, alpha, flash, skip, sx, sy}`, by index; `sx`/`sy` give a landing squash when the skin has `motion.squash`). Glyph boxes are measured through the skin (each part — number, suffix, label, and each label letter for the stagger — drawn off-screen on its own by skipping the other canonical items, roles from `GameDNA_Skin.glyphItems`), so placement uses each style's own metrics. Smooth skins (no `motion.fadeSteps`) get a continuous fade. `pixel16` output is pixel-identical to the built-in path. Each `number()` call also gets `{age, life}` in ms so a skin can animate per-number effects. **Delivery (v1).** `getAnchor` keeps answering for dying/dead units; the module also caches the last anchor per id (and each sprite rect with an `id` from `getObstacles()`), so a killing blow shows above the unit; with no anchor at all a number is skipped with one warning, never drawn at the field centre. `clear()` belongs at battle/wave start; numbers spawned since the last `update()` survive it. Hosts pass the HP actually lost after clamping. A number always appears on its hit frame (only a young number of the same target may delay it); with no free spot it is drawn at 1× at its target's own spot (covering its own sprite/tile, never a neighbour). Dense grids (tile-sized units side by side, auto-detected or `dense: 'on'`) search a tight radius first and treat the bounce as part of the glyph when checking sprites. Other units count with their footprint (rect + HP-bar band below: 8 px, 2 px for ≤20×24 tile units); a spot nearer to another unit than to the target (2 px margin) is illegal; a critical keeps the column above its target only if that column is clear; numbers are re-checked every frame and move when a unit walks onto them; a number is never deleted before 60 % of its life (it moves, shrinks, folds into its target's total, or hides and comes back with a full life). Verified by `checks/hosts/run.py` (four real cold-test integrations + the demo). All of this is implemented in `module/damage-numbers.js` (one global, `GameDNA_DamageNumbers`; API and a 15-line integration in `module/README.md`). The host supplies `getAnchor(id)` → `{x, top, w, h}`, `getObstacles()` → rects (sprites with `id`, UI rects, `soft` props) and `bounds`, calls `spawn(id, amount, kind)` from its hit function, `update(worldDt)` (0 during hit-stop) and `draw(ctx)`; the module calls back `onHitStop`, `onShake`, `onFlash`. The demo runs on the same module. The rules below describe what the module does.

## 5. Screen rules (exact numbers)

Native canvas 256×224, integer-scaled with nearest-neighbour. One glyph pixel = one native pixel at `scale 1`.

- **Glyphs**: digits are 7×10 bitmaps with 2px-thick strokes, 1px gap between digits. Words in pops (`MISS`, `MP`, status) use a bold 6×7 font (the 5×7 font with every stroke widened 1px to the right) so they match the 2px digit strokes; the `CRITICAL` label uses the plain 5×7 font at 1×. `scale 2` doubles the mask; outline, highlight and shade stay 1 native pixel.
- **Shading**: top half uses the "top" colour, with the top edge of each stroke in the "highlight" colour; bottom half uses the "bottom" colour, with the bottom edge in the "shade" colour.
- **Outline**: every pixel within 1px (8 directions, or 2px when `outline 2`) of the glyph, plus the same shifted 1px down (drop). Draw all outlines of a pop first, then all fills, so a neighbour's outline never cuts a digit.
- **Anchor**: centred on the target's x; bottom of the digits 4px above the head top (plus the target's bob amplitude for floating sprites: the wisp bobs 2px, so 7px). A pop stores its offset from this anchor and follows the target; while the target lunges at someone (melee dash), its anchor stays at the target's home spot so its numbers never ride into the other side's sprites. If the bounce would not fit between the anchor and the top of the field, the bounce of that pop is reduced (min 4px) instead of pushing the number down onto its target.
- **Motion per glyph** (`a` = ms since that glyph started, D = duration; glyph *i* starts at *i*·stagger′, where stagger′ = stagger × min(1, 12 / bounce), so at high bounce neighbouring digits never sit more than about half a bounce apart; a folded combo total uses stagger′ = 0):
  - 0–20 % D: arc up and back, height `bounce`, peak at 10 % (parabola).
  - 20–23 %: 1px below rest (overshoot on landing).
  - 23–33 %: second arc, 30 % of `bounce`. 33–35 %: 1px below rest if `bounce` ≥ 8.
  - 35–41 %: third arc, 12 % of `bounce`.
  - 41–78 %: hold at rest.
  - 78–100 %: drift up 4px; alpha steps 0.75 at 78 %, 0.5 at 85 %, 0.25 at 92 %, gone at 100 %.
  - Round every offset to whole pixels.
- **Criticals** (`burst`): glyph scale +1 but never above 2× (at `scale 2` a critical keeps 2× and is told apart by colour, flash, label and jitter), duration ×1.15, bounce ×1.3; digits drawn all white for the first 120 ms, alternating every 40 ms; jitter of ±1 px × scale every 33 ms for the first 320 ms; `CRITICAL` label in the 1× 5×7 font, 3 + ⌈0.16 × crit bounce⌉ px above the digits (clears their second arc), its letters typing in 3 ms per pixel of offset from 25 % of D after the last digit starts, bounce 45 % capped at 6px; the label ends and fades together with the last digit, never after it. `flash`: same size, white flash + label + screen flash, no jitter or shake. `plain`: critical colours only.
- **Miss and status**: bounce ×0.6, letters stagger like digits.
- **Stacking**: each pop stores an offset from its target's anchor. Every pop still on screen is an obstacle, fading ones included. Rectangles: glyph box + label + a 4px margin left and right (2px top and bottom) + headroom ((bounce + 5px) while its digits bounce, 5px once settled, which covers the 4px fade drift).
  - Candidates: columns 0, ±1, ±2 half-widths × rows 0..6 steps of half the rectangle height upward, plus two spots beside the target's body on each side (15 % and 40 % of its height; not for criticals). Each is clamped 2px inside the field, then must stay within 26px × scale sideways (plus half the target's width) and 36px × scale upward of the anchor.
  - Score after clamping: `1000 × overlap with pops and the banner + 2000 × overlap of the glyph box with any sprite (each actor where it stands now and at its home spot) or with another actor's claim zone (the column 40px above its head, its width + 4px) + torch overlap + 2.5·|Δx| + 0.8·|Δy|`. Lowest wins; a spot is legal only with zero pop and zero sprite/zone overlap.
  - A critical always takes the legal spot straight above its target; older pops it covers are displaced (see below).
  - No legal spot, in this order: (1) a damage hit is folded into the same target's damage number closest to its head; the total keeps that slot and re-bounces with all digits together; if the wider total now touches a neighbour it moves, or the neighbour is displaced. (2) At `scale 2` the new pop tries 1× size. (3) The new pop takes the best spot clear of other targets' numbers; same-target numbers in its way are displaced, but a same-target number younger than half its life is never displaced: the new pop waits in a queue instead (retried every frame, at most 900ms) and appears as soon as there is room.
  - Displacing an older pop: move it to another legal spot, else shrink it to 1×, else remove it on that same frame. Two numbers are never drawn in the same rectangle, not even while one is fading.
- **Draw order**: background → actors → hit effects → pops → banner → HUD. Pops move with screen shake; the HUD does not.

| Scheme | damage | crit | heal | miss | MP | status | outline |
|---|---|---|---|---|---|---|---|
| classic | `#ffffff #f4f6ff #b8c4f0 #7a86c0` | `#ffffff #fff2a0 #ffb43a #c0601a` | `#f0fff0 #b8ffc0 #4ad870 #22904a` | `#ffffff #e4e4ec #a8a8bc #6e6e84` | `#ffffff #c8eeff #4aa8ff #2060c0` | `#ffffff #f0d4ff #b878f8 #7038b0` | `#120a1e` |
| warm | `#ffffff #fff0d0 #ffa860 #c0582a` | `#ffffff #ffd0d0 #ff4a4a #a01830` | `#ffffff #e8ffb0 #9ce040 #4c8a18` | `#ffffff #ece4dc #b0a49a #706460` | `#ffffff #c8fff4 #38d0c8 #1a7a88` | `#ffffff #ffd8f0 #f070c0 #982870` | `#1e0a0a` |
| contrast | `#ffffff #ffffff #ffffff #c8c8d0` | `#ffffff #ffff60 #ffff00 #d0b000` | `#ffffff #90ff90 #30ff70 #10b040` | `#ffffff #d8d8d8 #c0c0c0 #909090` | `#ffffff #90e8ff #40c8ff #2080d0` | `#ffffff #ff98ff #ff60ff #b030b0` | `#000000` |

(Each cell: highlight, top, bottom, shade.)

## 6. Common mistakes (symptom → fix)

- Number appears a few frames after the slash or bolt → spawn it in the impact handler, not when the attack starts or ends; with hit-stop the first frozen frame must already show it.
- Multi-hit numbers pile into an unreadable blob → keep a list of live pop rectangles and offset new pops (stacking); include the bounce headroom in the rectangle, not only the resting glyph box.
- Digits look blurry or have uneven pixels → draw on the native canvas at whole-pixel positions and scale the canvas with nearest-neighbour; never use a CSS/vector font for the numbers.
- White numbers vanish on a light flash or sky → 1px dark outline on all sides plus a 1px drop below.
- One digit's outline cuts through the next digit → two passes: all outlines first, then all fills.
- Whole number moves as one block, feels stiff → stagger each digit and give the landing a 1px overshoot.
- Critical looks the same as a normal hit → change at least two of size, colour, flash and label.
- Pops freeze mid-air during hit-stop and then jump → measure their age on the world clock that pauses, not on wall time.
- Numbers cover the action-name banner or slide under the HUD → include those rectangles as occupied and clamp pops inside the field.
- Two pops clamped against the top edge touch and read as one number ("38"+"57" = "3857") → score each candidate after clamping, not before.
- A heal floats over empty floor after the hero steps forward → store the pop's offset from its target and draw it relative to the target every frame.
- Crowded 2× screens push a critical onto another sprite → let the critical keep the spot above its target and move the older pops; fold rapid combo hits into one number when nothing is free.
- A folded combo total lands on another enemy's face and reads as their damage → sprites and the column above every other actor's head are hard blocks; the total stays in the slot of the number it was folded into.
- High bounce makes one number look like two (digits at very different heights) → cap the per-digit offset (stagger × min(1, 12 / bounce)).
- `MISS` at 2× looks thin next to the bold digits → use a bold word font (strokes widened 1px).
- "Newest wins" leaves the old number visible underneath for a few frames ("MI82") → move the old number, else shrink it, else remove it on the same frame; never evict a number younger than half its life (queue the new one).
- A new pop lands on a fading one → fading pops are still obstacles until they are gone.
- Words come out as "0000" or heals as "155+" → draw words with a letter font, never through the digit table; the `+` goes before the digits.
- Fade looks smooth and modern on a pixel screen → use 3–4 alpha steps, not a continuous fade.

## 7. Acceptance moments

| Shot | Must be visible |
|---|---|
| `demo/?t=2500&freeze=1` | Mid-FLURRY: the critical `728` (bigger, gold, the `CRITICAL` label typing in as `CR`) above the wisp, a `200` above the golem, `MISS` bouncing in over the mage with its letters at different heights (stagger); no two numbers overlap. (The folded combo total `57` / `143` appears at 2× scale, row 3.) |
| `demo/?t=2500&freeze=1&stack=off` | The same moment with numbers piled on top of each other (shows why stacking matters). |
| `demo/?t=2500&freeze=1&scale=2` | 2× glyphs with 1px outline and shading, no two numbers touching, no number on any sprite; the critical straight above the wisp; late combo hits folded into one total above the golem; bold `MISS` beside Mira. |
| `demo/?t=2500&freeze=1&bounce=24` and `&scale=2&bounce=24` | High bounce: critical above the wisp, golem totals above the golem, nothing on a sprite or overlapping. |
| `demo/?t=1400…1800&freeze=1`, 1× and 2×, every 50ms | Mira's 46, +182 and MISS never overlap; the +182 heal stays readable (at 2× the MISS waits or goes 1×); a full-loop sweep (0–6800ms, 50ms steps, 8 parameter sets) finds no two numbers closer than 4px sideways / 2px vertically and no number on a sprite. |
| `demo/?t=4900&freeze=1&scheme=warm` | Blue-teal `18 MP` over the mage and a magenta `POISON` over the swordsman. |
| Phone width 500px | Canvas fits without horizontal scroll at a whole-number scale (1× at 500px); numbers readable. |
| `host/?t=500&freeze=1` | The host battle with no numbers anywhere (the cold-test baseline). |

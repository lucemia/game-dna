# C-11 Modern damage numbers

## 1. What it is

The way damage numbers look and move in 2020s action RPGs, roguelites and auto-battlers. On the frame a hit lands, the amount pops out of the target: it starts small just beside the head, arcs up on a short parabola and lands on its slot with a little settle, holds so it can be read, then floats up, shrinks slightly and fades. A critical hit pops straight up much bigger, overshoots and springs back, shakes for a quarter second and flashes a soft burst of rays behind it. Hits of the same type landing on the same target in quick succession do not stack up as separate numbers: they join one **rolling total** that counts up from what it showed ("12 → 47 → 83") and punches (a quick scale bump) on every add. Every damage type has its own colour and a small icon drawn in code (flame, crystal, bolt, droplet, crescent, heart, shield); physical hits stay plain white. Misses, blocks and dodges are small words; status effects are small purple words. Bigger numbers are always drawn on top, and no number lands on another unit, the column above its head, a UI rect or another number.

The text is a bold system sans with an outline and a soft drop shadow, drawn smooth and sub-pixel on HD canvases (devicePixelRatio-aware), and as a crisp 1-bit raster with a lit top edge and a 1 px outline on native pixel canvases (256×224 and the like), so the motion is modern while the pixels still match the host.

It replaces E-01 Bouncing damage numbers (same `create` options and `spawn` kinds): a game uses one or the other.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `size` | 0 = auto | 0–24 px | Cap height of a normal number. Auto = field width / 34, at least 9 (9 px at 256 wide, 19 px at 640). Crits ×1.45, words ×0.64 |
| `duration` | 1100 ms | 600–2400 | Life after the last add (crits ×1.15) |
| `arc` | 1 | 0–2 | Launch arc height (0.9 × size × arc) and sideways reach (0.55 × size × arc); 0 = pop in place |
| `punch` | 0.6 | 0–1.2 | Overshoot: crit peak 1 + punch, normal 1 + 0.4 × punch, merge bump 1 + 0.45 × punch |
| `merge` | 600 ms | 0–1500 | Same target + same type (+ both crit or both not, both loss or both gain) within this time of the last add → one rolling total; 0 = off |
| `hitstop` | 50 ms | 0–120 | Requested on damage hits (×2 for crits); never on heals, shields or mana |
| `palette` | vivid | vivid, soft, mono, skin | Colour set (table in §5) |
| `icons` | on | on, off | Type icon left of the number; off shows mana as `12 MP` |
| `crit` | burst | burst, flash, plain | burst = overshoot + rays + shake + screen flash request; flash = no shake; plain = size and colour only |
| `render` | auto | auto, smooth, crisp | auto = crisp when drawing 1:1 on a canvas ≤ 512 px wide, smooth otherwise; a pixel skin forces crisp |
| `stack` | on | on, off | Avoidance and stacking |

## 3. Variants

- **Modern ARPG**: the defaults.
- **Big crit energy**: `punch 1.0`, `arc 1.4`, `hitstop 80`, `merge 900`.
- **Calm and clean**: `punch 0.25`, `arc 0.4`, no hit-stop, `crit flash`, soft palette, `duration 1500`.
- **Readable mono**: all numbers white/grey, the type shown only by the icon.
- **Pixel host, modern motion**: `render crisp`, `size 9`: 1-bit glyphs on a 256-wide native canvas, same motion.

Kinds in every variant: damage (by type), crit, heal (`+n`, heart), shield absorb (shield icon), mana loss (droplet) and gain (`+n`), miss / block / dodge / immune / resist / parry (words), status (word).

## 4. Interface

**Needs**
- A hit event on the impact frame: `spawn(targetId, amount, kind, {type, crit})` with the HP actually lost or gained after clamping.
- The target's screen anchor `{x, top, w, h}`: centre x, the top of what is drawn above the head (hover, an HP bar), sprite size; kept for dead units (the module also caches it).
- A world clock in ms that stops during hit-stop and pauses (`update(dt)`, `update(0)` while frozen).
- Optional: rects to avoid from `getObstacles()`: unit sprites with `id` (and their HP bars with the same `id`), UI rects without `id`, `soft` props.

**Provides**
- `onHitStop(ms)` on damage hits; `onShake(px, ms)` (2 px × size/9, 180 ms) and `onFlash(0.25, 80)` on crits.
- `rects()`: the occupied rects of live numbers, for other overlays; `lastDrawn()`: one rect per drawn number (tests and judges).

**Skins.** `skin` (a `GameDNA_Skin` id or object) is used only where it helps a modern number: a pixel skin selects the crisp raster, a smooth skin's canvas number font lends its family, and `palette: 'skin'` takes colours from the skin tokens (`fx.hot` fire, `fx.cold` ice, `fx.heal`, `fx.crit`, `fx.status`, `text.main`, `text.outline`). Without a skin the module draws its own look; with `skins/skin-api.js` loaded but no `skin` option it also draws its own look (it does not default to pixel16, because that would turn every HD game crisp). Glyphs are not routed through `skin.number()`: the element's look is the point.

**Delivery.** `module/damage-pop.js` (one global `GameDNA_DamagePop`; API and a 15-line integration in `module/README.md`), `prompt.md`, the basket hint `tools/basket/damage-pop.mjs` and the judge probe `judge/probes/damage-pop.js`. The demo runs on the same module and shows E-01 side by side on two 256×144 native canvases.

## 5. Screen rules (exact numbers)

`size` = S (cap height, native px), u = S / 9 (1 on a 256-wide field).

- **Glyph box**: font `800 (S / 0.72)px` system sans stack; outline `max(1, round(0.12 S))` px; icon `1.05 S` wide, `0.18 S` gap. Box = icon + gap + text + outline both sides; height S + 2 × outline.
- **Smooth raster** (HD): outline stroke (round joins) with a drop shadow `rgba(0,0,0,0.55)`, blur 0.32 S, offset y 0.12 S; fill = vertical gradient top colour (0–36 %) → bottom colour (64–100 %); a white sheen fading over the upper 55 %; rendered once per text/size/colour at the device scale × 1.25 (× 1.6 for crits) and cached.
- **Crisp raster** (native pixel): the same text at a whole-pixel cap height, alpha ≥ 120 → solid; two-tone fill (top / bottom half), the top edge of each stroke half-way to white, the bottom edge 72 %; outline 1 px (2 px from cap 14) in 8 directions plus a 1 px drop; drawn at whole pixels; the pop-in scale re-rasterises at each whole cap height instead of scaling the bitmap; alpha in 4 steps (1, 0.75, 0.5, 0.25).
- **Motion** (a = ms since spawn, D = duration):
  - 0–300 ms: arc. Centre-column numbers start 0.55 S × arc to one side (alternating left / right per target) and 0.25 S low, rise 0.9 S × arc above the slot on a parabola and land; side-slot numbers and crits rise straight. The rise is capped by the free room above the number (to the nearest other unit, UI rect, number or the field top).
  - 300–410 ms: settle, a 0.12 × arc-height bounce.
  - Scale: 0.35 → peak at 70 ms (crit 90 ms), then a damped spring (exp(−3.2u)·cos(1.5πu)) to 1 by 220 ms (crit 340 ms).
  - Crit shake (`burst`): ±0.13 S, decaying to 0 over 260 ms, a new offset every 32 ms from a hash of the number id (no `Math.random`).
  - Crit burst: a radial glow (1.3 → 2.5 S) and 8 rays, fading over 240 ms; crisp: 1 px rays in 2 alpha steps.
  - Merge: the shown value rolls from the shown value to the new total over 150 ms (ease-out); the number bumps to 1 + 0.45 × punch and back over 260 ms and nudges up 0.12 S; its hold restarts (life = time since first hit + D).
  - Hold until life − 0.3 D, then float up `min(0.65 S, free room)`, shrink to 0.88 and fade out.
- **Colours** (top, bottom, outline):

| type | vivid | soft |
|---|---|---|
| physical | `#ffffff #dfe5f3 #17131f` | `#fffdf8 #e9e2d6 #2a2430` |
| crit (physical) | `#fff7cc #ffab1c #3a1203` | `#fff6dc #f7b955 #43220c` |
| fire | `#ffe9a6 #ff6a2b #3a0c04` | `#ffe2c4 #f08a5d #3d1a12` |
| ice | `#f2fdff #5fcdff #08213a` | `#eefaff #8fd3ee #13304a` |
| shock | `#fffbd2 #ffd52a #2c2105` | `#fff9dc #f2d36b #3a2f12` |
| poison | `#eaffbc #6fcf3f #0f2609` | `#f0ffd8 #9cd27a #1d3317` |
| arcane | `#f6e6ff #ad68ff #1f0b3a` | `#f5eaff #c39af0 #2c1a45` |
| heal | `#e4ffea #2fd96c #06281a` | `#eafff0 #7fdc9e #12382a` |
| shield | `#f5f8ff #a3b6dc #141c33` | `#f7f9ff #bac6e0 #232a40` |
| mana | `#e2f1ff #4799ff #08173a` | `#eaf4ff #82b6f2 #142648` |
| words / block / status | `#ffffff #c6cbdc` / `#eef4ff #8badea` / `#f4e4ff #bd86ff` | similar, lighter |

  A crit of a non-physical type keeps its type colour. `mono`: all white/grey (crit pale gold, heal pale green), icons keep their colours.
- **Placement** (E-01's rules, pixel constants × u, margins × √u): each number keeps an offset from its target's anchor (gap 4u above the anchor top) and follows it. Candidates: columns 0, ±½, ±1 box widths × rows 0..6 half-box steps up, plus two spots beside the body (15 % and 40 % of its height); within 26u (+ half the target width) sideways and 36u up. Score = 1000 × overlap with numbers and UI rects + 2000 × overlap of the glyphs with another unit's footprint (sprite + 1 px + an HP-bar band below: 9u, or 2u for units up to 20u × 24u) or its claim column (`max(40, 3S)` px above its head) + 50 per px nearer to another unit than to the target (2 px margin) + 2.5·|dx| + 0.8·|dy| + 4 per px climbed above 1.2 S + 40 per px above 2.2 S. A spot more than 2.5 S above the anchor (over a message box) loses to a clean spot beside the unit or on its own sprite. The target's own HP bar (any rect with its `id` up to max(10, 0.6 S) px tall) is never covered, not even at its own spot. The occupied box while young (first 420 ms, or 260 ms after a merge) also covers the arc, the launch side and the pop-in overshoot; settled it covers the fade float.
- **Priority**: numbers are drawn smallest first (words < numbers by value < crits), so big numbers are never covered. A crit takes the clear column above its target and moves smaller numbers out of it. When nothing is free: fold into the same target's number of the same type, then shrink to 0.78, then newest-wins over same-target numbers of lower priority (a same-target number younger than half its life makes it wait, max 900 ms), then its target's own spot (its own sprite may be covered, never a neighbour's). A number that loses its spot moves, shrinks, or hides and comes back with a full life; one past 60 % of its life may end early.
- **Overlap resolver** (every `update` and every `draw`, with the anchors of that moment, on the drawn rects including arc, pop-in and float): numbers are taken biggest first; one that touches an already accepted number (1 px margin) folds into it when both belong to the same target (and are both losses or both gains), else moves to the best legal spot clear of the accepted ones, else hides and comes back when its whole flight would not touch anything (a hidden number past 60 % of its life, or hidden over 900 ms, ends; one never shown takes its target's own spot instead). A number coming back stays hidden for 3 updates on its new spot before it is drawn, so nothing flashes for one frame. So no two numbers are ever drawn over each other, even when units are knocked into each other. Regression: `checks/regress.py` (hd-topdown `?auto=1` seeds 1–8, battle, a key-mash in the demo) fails on any frame with an overlap ≥ 15 % of the smaller number; it also reports one-frame jumps, blinks, HP-bar and UI coverage and high climbs (`checks/motion.js`).
- **Moves** (wave 4): a number already on screen never jumps. It glides to its new slot (smoothstep, 120 + 0.6 × distance ms, max 220 ms) when the way is clear of other numbers and windows, else re-pops there (alpha 0.35 → 1 and scale 0.86 → 1 over 120 ms). A window, banner or HUD rect that appears over a placed number (or that the camera carries it under) moves it to a clean spot within 2.5 S above its unit; else it hides (or ends, past 40 % of its life). A number whose only spot is ≥ 50 % under a banner waits up to 900 ms of world time; while a modal window pauses the world (`update(0)`) it waits until the window closes. The arc and the fade float never rise through the target's own HP bar.
- **Draw order**: background → actors → hit effects → numbers → banner → HUD. Numbers move with screen shake; the HUD does not.

## 6. Common mistakes (symptom → fix)

- Two numbers per hit (E-01's bouncing digits and these) → the two elements replace each other; route every hit through one module.
- Rapid hits still show as separate numbers → they are of different types, crit vs not, or the gap is longer than `merge`; pass the same `type` for the same attack.
- A rolling total jumps instead of counting up → the game spawns the total, not each hit's amount; spawn each hit's real drop.
- Numbers blurry on an HD canvas → draw through the scaled context (`setTransform(dpr…)`) and keep `render: auto`; the module rasterises at the device scale.
- Numbers soft and smeary on a 256×224 pixel game → `render: auto` picks crisp only when the canvas is ≤ 512 px wide and unscaled; a game that draws at native size into a bigger backing store should pass `render: 'crisp'`.
- A number lands in another unit's column or on its HP bar → give `getObstacles()` every living unit with its `id` and their HP bars with the same `id`.
- Numbers drift over the HUD in a scrolling game → anchors and obstacles in screen pixels (world minus camera), `bounds` = the visible field.
- The kill number is missing or at the field centre → `getAnchor` returned `null` for the dead unit; keep answering (the module caches the last anchor too).
- Numbers freeze, then jump after hit-stop → `update(0)` while frozen and the real step otherwise; never advance on wall-clock time (`?t=&freeze=1` must show them).
- Mana restores read as damage → `spawn(id, gain, 'heal', {type: 'mana'})` shows `+15` in mana blue; `'mp'` is mana lost.
- Heals pile under a big damage number → expected only when there is no room; the bigger number stays on top and the heal waits (same target) or sits beneath it.
- Numbers cut off or missing on screen although `lastDrawn()` lists them → the game clips, proxies or filters the module's drawing (an evenodd clip around obstacles, a recorder context that replays only some glyphs); draw it once per frame, unclipped: placement already avoids every rect in `getObstacles()`.
- Wave-refill heals pile into one strip above the party → they were spawned while the WAVE banner squeezed the field; spawn them when the banner ends.
- `MISS` over the player in town → spawn `miss` only for an attack aimed at a unit, not a swing that hits nothing; skip heals of 0 (`+0`).
- A crit's burst looks pixelated on an HD game → the canvas is 1:1 at ≤ 512 px; set `render: 'smooth'`.

## 7. Acceptance moments

| Shot | Must be visible |
|---|---|
| `demo/?t=1500&freeze=1` | The Arcane Barrage total on the imp mid-roll (purple crescent icon), punching; `34` above the golem; `BLOCK` near Rowan. |
| `demo/?t=1960&freeze=1` | The final total `127` above the imp; the spear in flight. |
| `demo/?t=2300&freeze=1` | `412` crit above the wisp: gold, ~1.45× size, ray burst (clipped out of the digits), no overlap with its HP bar; `127` still above the imp. |
| `demo/?t=5400&freeze=1` | Type colours and icons together: `+62` heart (fading), poison total `24` (droplet), shock `25` / `19` / `22` (bolts). |
| `demo/?t=2300&freeze=1&render=crisp` | The same frame as 1-bit glyphs with a 1 px outline. |
| `demo/?t=4500&freeze=1&stack=off` | Avoidance off: `+62`, `30` and the shield `18` piled on Rowan (why avoidance matters). |
| Side-by-side strip, `?t=2300` | E-01 and C-11 on two 256×144 native canvases, the same fight. |
| Phone width 500 px | No horizontal scroll; the arena and both strip canvases fit. |
| Unseen hosts (`checks/build-report.md`) | battle (256×224 pixel): crisp numbers, every judge counter 0 except one wave-start `clear()`; hd-topdown (640×360): rolling totals on the player's sword combos, crit pops, heals on level-up and items. |

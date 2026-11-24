# H-05 World-space bark bubbles

## 1. What it is

The short lines characters say out loud in 2020s action RPGs, stealth games and town scenes, without stopping the game: a guard that notices you shouts "Halt!" in a yellow alarm bubble with a red "!" badge, a slime hit by your sword squeaks "Splut!" in a red-edged bubble that shakes, the merchant calls "Fresh stock today!" when nothing is happening, the hero grunts "Oof!" when hit and "One down." after a kill. Each bubble pops out of its speaker with a small spring, types its text in, follows the speaker as it walks, holds long enough to read and fades.

Bubbles live in the world but are laid out like UI: they never overlap each other, keep off the HUD and open windows, try not to cover other characters, and stay on screen. A speaker near or past the screen edge keeps its bubble pinned inside the border with the tail turned into a pointer toward it. Many characters can talk at once (a crowd) and the screen still reads.

Six tones: talk (rounded bubble), shout (spiky starburst, bold capitals), alarm (yellow, "!" badge), hurt (pink, three red impact ticks at a top corner, shakes), whisper (translucent, dashed edge, italic) and think (cloud with three trailing puffs). On HD canvases the bubbles are smooth cel-shaded shapes: an ink edge, a lit face with a shade crescent along the bottom, a rim light on the top-left, a drop shadow and a curved comic tail; on native pixel canvases (256×224 and the like) they are crisp pixel bubbles: a 1 px ink outline with stair-step corners around body and tail, a lit top row, a shaded bottom row, a 1 px drop shadow, a stair-step tail and the module's built-in 6×8 bitmap font.

It is a different thing from H-01 (dialogue box): barks are optional flavour the player can ignore, never take input and never pause.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `size` | 0 = auto | 0–28 px | Text size. Auto: smooth = field width / 46, clamped 9–28 (14 px at 640); crisp = 8 px bitmap font × round(width / 400) (×1 at 256) |
| `width` | 20 | 8–40 | Wrap width in characters (smooth: × 0.52 × size px; crisp: × 5 px); at most 4 lines, the 4th ending in `…` (words dropped until it fits) when the text is longer; shout × 0.9 |
| `cps` | 45 | 0–120 | Typewriter characters per second (starts 80 ms after the pop); 0 = whole line at once |
| `read` | 55 ms | 20–120 | Reading time per character |
| `hold` | 1500 ms | 600–4000 | Minimum hold; life = 260 + typing + max(hold, chars × read) |
| `max` | 0 = auto | 0–8 | Bubbles at once (auto: 3 on fields ≤ 400 px wide, 4 wider) |
| `cooldown` | 4000 ms | 0–15000 | Same speaker + same event within this time: ignored (idle: max(cooldown, 1.5 × idle)) |
| `idle` | 7000 ms | 0–12000 | Mean gap between idle lines from `speakers()` (first at 0.45 ×, then 0.8–1.2 ×) |
| `stagger` | 600 ms | 0–2000 | Same event from another speaker within this time: dropped (one voice for a pack) |
| `pop` | 0.5 | 0–1.5 | Pop-in overshoot |
| `palette` | light | light, dark, parchment, skin | Bubble colours |
| `render` | auto | auto, smooth, crisp | auto = crisp when drawing 1:1 on a canvas ≤ 512 px wide |
| `edge` | pointer | pointer, hide | Speaker far off screen: pointer bubble at the border, or hide |

## 3. Variants

- **Modern action RPG**: the defaults.
- **Night / dark UI**: `palette dark`: smoky glass bubbles with light text.
- **Storybook**: `palette parchment`, `cps 30`, `read 70`.
- **Busy town**: `idle 3500`, `max 5`, `width 16`.
- **Pixel host**: `render crisp`, `size 8`.
- **Instant, terse**: `cps 0`, `hold 1000`, `read 40`.

## 4. Interface

**Needs**
- `getAnchor(id)` → `{x, top, w, h}` in screen px (world minus camera, plus HUD offset): the speaker's centre x and head top (hat, hover and HP bar included), or `null` when it is gone (the bubble then fades at the last known spot).
- Events on the frame they happen: `bark(id, event, {voice})` (`spotted`, `lost`, `hurt`, `lowhp`, `kill`, `greet`, `heal`, `taunt`, `flee`, `win`, `wonder`, `secret`, `idle`) or exact lines `say(id, text, {tone})`. Bark on transitions, not on per-frame conditions.
- `update(dtMs)` in the fixed step (0 while the world is frozen); `draw(ctx)` after sprites, before HUD and windows.
- Optional: `getObstacles()` (unit sprites with `id`, UI rects without), `speakers()` (who may chat when idle), `lines` (your own line table), `bounds` (the visible field).

**Provides**
- `rects()` / `lastDrawn()`: the drawn bubbles (for other overlays and judges), `onBark(info)` per shown line (voice blips), `active()`.

**Lines.** Built-in neutral voices: `villager`, `guard`, `merchant`, `hero`, `monster`, `critter`, each with lines per event; `lines: {voice: {event: [...]}}` adds or replaces them. The line for an event rotates deterministically per speaker (start offset from a hash of the id), never `Math.random`.

**Priorities.** alarm and hurt 3, shout 2, talk / think / whisper 1, idle chatter 0. A speaker has one bubble; a new line replaces its text in place (a small bump instead of a new pop) unless the old line has higher priority and is under 60 % of its life. A full screen drops new idle and talk lines; alarm and hurt replace the weakest bubble.

**Skins.** `skin` (a `GameDNA_Skin` id or object): a pixel skin selects crisp bubbles, a smooth skin's canvas `ui` font family is used, `palette: 'skin'` takes `paper` (fill), `ink` (edge, text), `fx.crit` (alarm) and `fx.hot` (hurt). Without the option the module draws its own look.

**Delivery.** `module/bark-bubbles.js` (global `GameDNA_BarkBubbles`; API and a 15-line integration in `module/README.md`), `prompt.md`, basket hint `tools/basket/bark-bubbles.mjs`, judge probe `judge/probes/bark-bubbles.js`. The demo runs on the same module: an HD scene (painted Lanternwood art: vendored copies of the L-00 / L-06 files it uses plus seven sprites and two 5-pose walk sheets generated for this demo, all in `demo/assets/`, listed in `demo/assets/assets.json`) and a 384×216 pixel strip (props and ground derived from the same art by `tools/pixelize.py`; the cast authored cell by cell in `src/pixelcast.js`). The demo needs no file outside its own folder and names missing files on the canvas. The module itself draws no bitmaps.

## 5. Screen rules (exact numbers)

F = text size (px). Smooth: line height 1.3 F, padding 0.8 F × 0.5 F, corner radius 0.95 F (a one-line bubble is a pill), tail 0.85 F long and 0.8 F wide at the base, gap above the head 0.22 F (≥ 2), screen margin 0.35 F (≥ 3), edge width max(1.5, 0.135 F). Text weight 700 (alarm 800, shout 900 at 1.12 F in capitals, whisper italic 600 at 0.94 F). Crisp (sc = bitmap scale): line height 10 sc, padding 4 sc × 3 sc, tail 4 sc stair steps, gap 1 sc, margin 2 sc. Alarm bubbles are 1.05 F (crisp 8 sc) wider for the badge. Shout: the text box plus padding is the core; the starburst adds a spike depth D = 0.62 F (crisp 4 sc) on every side: a back burst in the accent colour reaches the full D, the front burst 0.74 D with its points half a step off, so the accent points show between the front ones; inner points 0.1 D inside the core edge, so no notch reaches the text. Crisp shout: 3-row teeth every 6 sc on all four sides, every other tooth in the accent colour. Crisp think: the box is 2 sc wider and 6 sc taller with 2-row scallops every 6 sc along the top and bottom.

- **Placement** (every `update`, highest priority first, then oldest): 15 candidate body spots around the head point: above centred (pref 0), above shifted left / right (0.82 / 0.18 of the width, pref 5), one half-height higher (9), beside the head left / right at head height (14), higher and shifted (16), below the feet centred / shifted (26 / 30, tail up to the feet), up and out to the left / right of the head (19: the way out of a melee cluster), further out beside the head (21). Each is clamped inside `bounds` minus the margin. Cost = pref + 0.08 × clamp shift + 1200 × overlap with already placed bubbles (padded 2 gaps) / area + 900 × overlap with UI rects / area + 420 × max(overlap / bubble area, overlap / unit area) for other units (900 for `hard` rects, e.g. the player), so a small unit under a big bubble counts by how much of the unit is hidden, + 160 when the tail or the off-screen pointer (the body rect grown to the tail end) would reach a UI rect + 300 × overlap with its own speaker / area (+30 for soft rects); the current spot gets −35 (no flip-flopping). A speaker past the field edge clamps its bubble with an extra 2.5 × tail (crisp 2.2) margin so the arrow tail and its chevron fit.
- **Offsets** are stored relative to the head point, so a bubble follows its speaker and the camera exactly. A new target within max(h, 1.5 F) glides there (exponential, τ = 100 ms); further away the bubble re-pops at the new spot (scale 0.86 → 1, alpha 0.35 → 1 over 160 ms) instead of sweeping across the screen.
- **Hidden**: a bubble whose best spot still has > 4 % of its area under a UI rect hides at once and fades back in (τ 60 ms) when the rect goes; a speaker more than 0.6 field widths outside the field hides its bubble (`edge: 'hide'` drops the pointer too). A low-priority bubble still overlapping another by > 20 % after 600 ms ends early.
- **Tail**: one path with the body (same winding, so the fill unions them and no seam crosses the base), from the edge facing the head point (bottom, top or a side), base clamped away from the corners, length ≤ 1.6 × tail. Smooth: the base sits up to 1.1 × its half-width to one side of the head point (toward the bubble centre) and both edges are quadratic curves that leave the body at right angles and bend to the tip, so the tail sweeps toward the speaker. Speaker off screen: a straight arrow tail 1.3 × wider and 1.7 × tail long (crisp 2 × tail) toward it, plus a chevron 0.42–0.62 F ahead of the tip that pulses (period ~0.9 s). No tail when the speaker is behind the bubble, or when its tip would lie under a UI rect. Think: three puffs (0.3, 0.2, 0.12 F) instead of a tail.
- **Motion**: pop-in scale 0.55 → 1 + 0.16 × pop at 120 ms (ease-out) → damped spring to 1 at 300 ms, from the tail tip, with a squash and stretch (±16 % × pop, decaying over ~500 ms) and a rock of ±5° × pop; alpha 0 → 1 in 70 ms. Typewriter from 80 ms; the newest letter fades in while rising 0.3 F. Hurt and shout shake ±0.16 F / ±0.1 F for 420 ms (new offset every 34 ms from a hash, crisp ±1 sc every 50 ms for 300 ms). The alarm badge pops 60 ms after the body with a wiggle and one expanding ring; the hurt ticks grow over 170 ms, at the top corner away from the tail unless another unit stands there (then the other corner, or none). Fade out: 240 ms, alpha 1 → 0 (quadratic), scale 1 → 0.7, rising 0.2 F. Crisp never blends: a small blank seed until 50 ms, full size one cell high until 110 ms, then rest; it ends one cell lower from 96 ms to 180 ms, then gone; hidden bubbles are simply not drawn.
- **Colours** (lit fill, shade, edge, text, accent), light palette: talk `#fffdf6 #e6dcc8 #2a2233 #2a2233`; shout `#fffaf0 #ffdfae #2d1408`, back burst `#ff8a2a`; alarm `#ffec94 #ffc12e #3a2604`, badge `#e8402e`; hurt `#ffece8 #ffb9ad #7a1420`, ticks `#e8402e`; whisper 80 % alpha talk colours, edge at 62 %, text `#544c60`; think `#f6f8ff #cfd9f4 #2a2f52`. Parchment: serif text (Georgia stack), grain flecks and a burnt radial rim instead of the rim light. Dark in the module's `PAL`.
- **Layer** (smooth): every bubble is painted on one shared offscreen layer at the device scale: outline stroked at 2× width, interior cut with `destination-out`, shade fill, the lit face (the same shape moved up 0.17 F, clipped), a white wash and the face again moved 0.95 × edge down-right (leaves the rim light), then stamped once with the shadow. No lobe circle, spike or tail outline shows through, also with see-through palettes. Crisp: body and tail are one mask; cells next to the mask are ink, the top fill cell of a column is white (light palettes), the bottom one the shade colour, the cell under the outline is the shadow. Crisp always flattens palette colours to opaque.
- **Shadow** (smooth): `rgba(14,8,26,0.42)` (whisper 0.22, dark palette `rgba(0,0,0,0.6)`), blur 0.3 F, offset y 0.26 F, scaled by the device transform. Crisp: 1 cell under the outline, `rgba(8,6,20,0.41)`.
- **Draw order**: world and sprites → effects → bubbles → HUD → windows. Important tones are drawn last (on top).

## 6. Common mistakes (symptom → fix)

- Bubbles float away from the characters or slide when the camera moves → anchors in world px; return screen px (world minus camera, plus the HUD offset), or draw inside the camera translate with `draw(ctx, camX, camY)` and keep anchors and obstacles consistent with it.
- A guard says "Halt!" every 4 seconds while chasing → `bark` is called every frame while the condition holds; call it where the state changes (not chasing → chasing). The cooldown is only a safety net.
- Bubbles cover the HUD or the dialogue box → those rects are missing from `getObstacles()` (without `id`), or the game draws the bubbles after its windows.
- A bubble sits over another character, or its tail points at the wrong one → `getObstacles()` lacks that unit, or the ids passed to `bark` differ from the ids in `getObstacles()` / `getAnchor`.
- Bubbles stay on the battle screen or the title → `clear()` on scene switches and return `null` anchors for characters not shown.
- Blurry bubbles on a 256×224 game that renders into a bigger backing store → `render: 'crisp'`.
- Bubbles frozen or missing in `?t=&freeze=1` shots → advance them only through `update` in the fixed step, never on wall-clock time.
- `?auto=1` ends differently after adding barks → a line was picked with the game's RNG, or a bark changed state; the module never touches the game's RNG, so don't either.
- The same line twice (bubble plus the dialogue box) → `silence(id)` when that character opens a real dialogue.
- Bubble stuck at the field centre → never: a speaker that never had an anchor gets no bubble (one console warning). Check `getAnchor` for that id.

## 7. Acceptance moments

| Shot | Must be visible |
|---|---|
| `demo/?t=1500&freeze=1` | The merchant's "Fresh stock today!" and Tamsin's line typing above her as she walks. |
| `demo/?t=3700&freeze=1` | The guard (off the right edge) shouting "Halt! Who goes there?" in a yellow alarm bubble pinned to the border, tail pointing right; Old Bram's talk bubble above him. |
| `demo/?t=7000&freeze=1` | Two "Blorp!" alarms above the jellies, the hero's pink "Oof!" with red impact ticks, the guard's "Move along, then." moved below him because the slots above are taken; no overlaps. |
| `demo/?t=10000&freeze=1` | Two speakers off the left edge (the merchant's whisper, Tamsin's "Kitty, come back!") with pointer tails; "Splut!" above the jelly. |
| `demo/?t=12400&freeze=1` | Four characters talking at once, none overlapping, none on the HUD. |
| `demo/?t=12400&freeze=1&palette=dark` | The dark palette. |
| `demo/?t=6400&freeze=1&window=1` | A dialogue window at the bottom: every bubble stays above it. |
| Pixel strip, `?t=7000` | Crisp pixel bubbles with the bitmap font on the 384×216 canvas. |
| Phone widths 500 / 390 px | No horizontal scroll; the game canvas and the pixel strip fit. |
| Unseen hosts (`checks/build-report.md`) | topdown (256×224 pixel): crisp alarm and hurt bubbles, a battle-screen "Splut!"; hd-topdown (640×360): spotted alarms in the forest, hurt and kill shouts in melee, the boss's grunts. |

# E-02 Hit sparks & spell bursts

## 1. What it is

On the frame a blow lands, the contact point lights up for a few frames: a curved slash streak that sweeps along the attack direction, an eight-ray star with a white core, a cross-shaped spark, or a ring shockwave, plus a spray of pixel sparks that fly out, fall under gravity and cool from white through yellow and orange to dark red. Spells land as short sprite sequences generated in palette ramps whose bright bands rotate every couple of frames (palette cycling): fire tongues rise and burn out, ice crystals converge, flash and shatter into falling shards, a thunder bolt drops from the top of the view onto a cross spark, and a heal sends green plus-shaped motes up a dithered column from a ground ring. A critical hit is about 1.4× bigger, opens with a three-frame white star flash, adds a ring, and asks the game for a double hit-stop and a short screen shake. Everything is pooled with a hard particle cap and driven by a seed, so frozen screenshots (`?t=&freeze=1`) are identical every time.

Works for turn-based and real-time games: it needs a hit event, a world clock and a draw call.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `size` | 1 | 0.5–2 | Scale of every shape, burst and spark speed |
| `life` | 14 frames | 6–30 | Length of one hit effect (×1.35 for criticals) |
| `sparks` | 8 | 0–24 | Sparks per hit (×1.75 for criticals) |
| `gravity` | 0.15 px/frame² | 0–0.4 | Pull on hit sparks and ice shards |
| `hitstop` | 50 ms | 0–120 | Freeze requested on every hit, ×2 on criticals; 0 = off |
| `shake` | 2 px | 0–4 | Screen shake requested on criticals (200 ms) |
| `critFlash` | screen | screen, local, host, off | Critical white flash: drawn over the field by the module, only at the contact point, requested from the game (`onFlash`), or none |
| `style` | auto | auto, slash, star, spark, ring | Shape when a hit names none; `auto` = slash when a direction is known, else star |
| `cycle` | 2 frames | 1–6 | Frames per palette-cycling step in bursts |
| `cap` | 192 | 32–512 | Hard particle cap; when full the oldest sparks are recycled |
| `reach` | 32 px | 8–96 | Largest radius before the neighbour limit (module-only param) |

## 3. Variants

- **Classic 16-bit**: the defaults.
- **Heavy impact**: `size 1.5`, `life 18`, `sparks 14`, `gravity 0.2`, `hitstop 80`, `shake 3`.
- **Quick and light**: `size 0.75`, `life 10`, `sparks 4`, `gravity 0.1`, no hit-stop or shake, criticals flash only at the contact point.
- **Arcade sparkle**: `sparks 16`, `gravity 0.3`, `cycle 1`, cross sparks by default, `cap 320`.

Elements inside every variant: plain impact (warm white-yellow-orange), fire, ice, thunder, heal. Elements also tint plain hits (`hit(…, {element})`).

## 4. Interface

**Needs**
- A hit event on the impact frame: the contact point on the target's body (in the game's world coordinates), the attacker's facing, crit flag, element, target id and attacker id.
- A spell event: the target's body centre and the element.
- A world clock in ms that stops during hit-stop.
- Optional: unit rects with ids (`getObstacles`), screen UI rects (`uiRects`), the camera offset at draw time.

**Provides**
- `onHitStop(ms)` on every hit (`hitstop`, ×2 for criticals).
- `onShake(px, 200)` on criticals; `onFlash(alpha, 50)` on criticals when `critFlash` is `host`.
- `lastDrawn()`: the effect rects drawn last frame `{x, y, w, h, owner, kind}`.

**Delivery (v1).** All of this is `module/hit-sparks.js` (one global `GameDNA_HitSparks`; API, a 15-line integration and a self-check in `module/README.md`). The host calls `create({view, seed, skin, params, getObstacles, uiRects, getAnchor, onHitStop, onShake, onFlash})`, then `hit(x, y, {kind, dir, crit, element, target, from})` and `burst(x, y, element, {target, from})` at impact, `update(worldDt)` (0 during hit-stop) once per fixed step, `draw(ctx, -camX, -camY)` once per frame, `clear()` at scene start. The module draws through `GameDNA_Skin.resolve(options.skin)` when the skin API is loaded (colours from `palette.fx.*`, particle shape, blend, glow and snap from `skin.particles`, fades from `skin.motion`, flash strength from `motion.flashMax`); without it, it uses a built-in copy of the pixel16 look. The demo runs on the same module and shows both pixel16 and a non-pixel token skin.

## 5. Screen rules (exact numbers)

Native canvas (256×224 in the demo; any size via `view`), integer-scaled, nearest-neighbour. One effect pixel = one native pixel.

- **Clock**: the module steps at a fixed 60 Hz on the world time it is given; hit shapes are pure functions of their frame age, bursts show sequence frame `age >> 1` (each sprite frame held 2 frames). The seed and the call order fix every random choice.
- **Radius**: hit radius R = min(0.7 × `reach` × `size` (×1.4 crit), neighbour limit); the neighbour limit is the distance from the contact point to the nearest unit rect that is neither `target` nor `from`, minus 2 px, never below 6 px. Burst radius = min(20 × `size`, limit / 1.2), at least 8 px.
- **Slash**: a 29-point arc along the attack direction, length 2.2 R, bowed by 0.28 R; the head reaches the end at 28 % of `life`; the 12 % nearest the head is white, then light, base and dark ramp steps; head section 2 px thick with a dark under-edge one pixel off the arc; the tail erases from 30 % of `life`. Four short white ticks cross the contact point for the first 4 frames.
- **Star**: 8 rays rotated by a seeded 0–0.6 rad, alternating length 0.85 R and 0.47 R, growing over the first 31 % of `life`, shrinking after 55 %; ray tips in base colour, middles light, cores white (one step darker after 50 %); a 5×3 + 3×5 white core for the first 40 %.
- **Cross spark**: arms of length 0.6 R × sin(π · min(1, 1.6 q)), light colour; diagonals 0.6 of that; 3×3 white core.
- **Ring**: radius 2 → R with ease-out; white < 30 %, light < 60 %, then dark and dithered (every other pixel). Criticals draw a ring flattened to 0.8 vertically with a second inner line while < 40 %.
- **Critical flash**: frames 0, 1, 2 at the contact point: a white plus of arm 0.6 R / 0.45 R / 0.3 R (3 px thick on frame 0), diagonals 0.45 of that and a 7×7 white core. `critFlash: screen` also fills the view with white at `flashMax` × 1, 0.6, 0.3 for three frames (pixel16 `flashMax` 0.35), under the HUD.
- **Sparks**: speed 1.0–2.4 px/frame (1.4–3.0 crit) × √`size`, 85 % vertical squash, slight upward bias, drag 0.93/frame, gravity `gravity`; life 10–18 frames (12–24 crit); colour walks the ramp from white (index 5) to dark red (index 1) over the life; a one-pixel trail one ramp step darker while young and fast. A spark dies when it leaves the effect radius + 2 px or enters another unit's rect.
- **Bursts**: fire 40 frames (16 flame tongues with pointed tips start rising in the first frames, a small core only for 8 %; 6 hot sparks at frame 2, 2 × 5 embers rising at −0.04 px/frame²), ice 44 (seven crystals converge, flash at 48–66 %, ring, 12 shards at 50 %), thunder 34 (bolt from the top of the view, at least 48 px above the target whatever the neighbours, for the first 55 %: zigzag re-rolled every 3 frames with ±min(10, max(4, 0.4 R)) px swing, 2 px white core that alternates white / light every frame, 1 px light and base side lines, dithered dark glow pixels 3 px out, a 9 px fork for the first 8 frames; cross spark and ground ring at the target; spark sprays at frames 1 and 30 %), heal 48 (column, ground ring, 10 rising plus motes, 2 motes every 6 frames). Random mirror per burst. With `getAnchor`, a burst follows its target's anchor (bob, drift, a lunge up to 64 px); a bigger jump (death, respawn) leaves it in place.
- **Palette cycling**: levels 3–5 of the 6-step ramp rotate one step every `cycle` frames; level 1–2 (dark edge) and 6 (white core) stay.
- **Ramps (pixel16, dark → white)**: impact `#5a1a22 #c8481e #ffa040 #ffe080 #fff6c8 #ffffff`; fire `#5a2038 #b02a2a #e8562a #ff9a30 #ffd860 #fff8d0`; ice `#1a3a78 #2a68b0 #46a6e6 #90e2ff #d8f8ff #ffffff`; thunder `#3a2a8a #7a6aff #a8c8ff #fff6a0 #fffbe0 #ffffff`; heal `#145a34 #2a9a5a #3ac070 #9cffb8 #e0ffe8 #ffffff`. Other skins derive each ramp from `fx.crit / hot / cold / heal` mixed toward `ink` and `fx.white`, or provide `palette.ramps.fx.<element>`.
- **Clipping**: the module draws into an offscreen layer the size of `view`, clears every `uiRects` rect from it, then composites it; nothing lands on the HUD or banners.
- **Draw order**: background → sprites → existing effects → hit sparks → (damage numbers) → banner → HUD. Effects move with screen shake; the HUD does not.

## 6. Common mistakes (symptom → fix)

- The burst shows a frame after the number or the HP bar change → call `hit`/`burst` in the same function that changes HP, not when the attack animation ends.
- Effects missing in `?t=&freeze=1` shots → `update` is only called from the rAF loop; call it from the fixed step that fast-forward also runs.
- Sparks hang in the air during hit-stop, then jump → pass `update(0)` while frozen, the real step otherwise; never wall-clock time.
- One hit draws dozens of effects → the call sits in a per-frame overlap check; call it once where the hit is accepted (after the hit cooldown / invulnerability check).
- Effects stuck in place while the camera scrolls, or drifting with it → hit coordinates and `getObstacles` in world space, `draw(ctx, -camX, -camY)`.
- Effects cover the HUD or the menu → pass those rects in `uiRects` (screen space) and end `view` above the HUD.
- Melee sparks shrink to a dot → the attacker's rect counts as a neighbour; pass `from: attacker.id`.
- A spark reads as hitting the unit behind the target → give every unit an `id` in `getObstacles`; sparks die at other units' rects.
- Blurry sparks → draw at native resolution on the pixel canvas; never on a CSS-scaled overlay.
- Hit-stop makes the autoplay end differently → freeze only the world step (and not on title or result screens), never skip input that was already latched.
- A bolt or ice ring is left hanging where the target was → pass `getAnchor` so bursts follow their target.
- Spells look the same as sword hits → use `burst` for spells; `hit(…, {element})` only tints.

## 7. Acceptance moments

The demo's hit-stops make page time run ahead of world time; the moments below are page time (`?t=`). `?log=1` lists each impact's time.

| Shot | Must be visible |
|---|---|
| `demo/?t=380&freeze=1` | Rowan's sword slash on the golem: a curved warm streak with a white head and sparks, the golem flashing. |
| `demo/?t=1250&freeze=1` | Ring shockwave around Rowan from the rock slam, not touching Mira's rect. |
| `demo/?t=2200&freeze=1` | Fire burst on the golem: pointed flame tongues in rotating orange/yellow bands, embers (`t=2120`: the first frames, small core and hot sparks). |
| `demo/?t=3380&freeze=1` | Critical on the wisp: white plus flash at the contact point, star and ring, screen slightly white. |
| `demo/?t=4520&freeze=1` | Ice: crystals converging on the wisp. `t=4720`: the white flash as the crystals meet, shards falling after. |
| `demo/?t=5230&freeze=1` | Thunder: a 2 px white bolt with light edges and glow pixels from the top of the field straight down onto Rowan, cross spark at his chest. |
| `demo/?t=6400&freeze=1` | Heal: green column, ground ring and rising motes on Rowan. |
| `demo/?t=3380&freeze=1&skin=flat` | Same critical through a non-pixel token skin: round glowing sparks, additive blend, colours from that skin. |
| Phone width 500 px | Canvas fits without horizontal scroll at a whole-number scale. |
| Hosts (`checks/hosts/`) | Battle: slash on a scorpion, fire burst on a foe; side-scroller: slash between hero and crawler, effects scrolling with the world; `?auto=1` ends as the original. |

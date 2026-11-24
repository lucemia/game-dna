# C-08 Draining HP bar

## 1. What it is

The health bar of 2020s action and RPG games that tells the player how much a hit took. On damage the coloured **fill drops at once** to the new value while a pale **loss segment** stays where the health was. The segment **holds** for a moment (so the eye catches the size of the hit), then **drains** down to the fill. Hits that land while it holds or drains **merge**: the segment keeps the chain's highest value and the hold restarts, up to a **cap**, so a combo reads as one big chunk that drains once. On heal the order flips: a mint **gain segment** grows in first, waits, then the fill rises to meet it. At or below a quarter of the health the fill turns hot and **pulses**; at 0 it stops. Each hit flashes the new segment white and gives boss bars a short shake.

One module draws every bar in the game, in three styles: a **boss** bar (dark plate, gold rim, diamond end caps, name above in spaced capitals, quarter ticks, low-HP frame glow), a **party** HUD bar (outlined pill, gloss band, optional name and rolling number above), and a small **unit** bar over a character, drawn inside the camera transform so it follows the unit in world space and hides itself once full again. On HD canvases bars are smooth (gradients, gloss, soft shadow, shimmer stripes on the gain); on native pixel canvases (<= 512 px wide or smoothing off) they are crisp: whole pixels, flat colour steps, a 1 px ink outline, stepped flash and pulse, and a built-in 3 x 5 font.

The game keeps its own HP. The module only needs `set(id, hp, max)` every step: it sees drops and rises itself, so no damage or heal code is touched.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `hold` | 450 ms | 0-1500 | Loss segment waits this long before draining; a new hit restarts it |
| `holdCap` | 1600 ms | 0-4000 | A merged chain (hold + drain time since its first hit) never waits longer; after that, hits keep draining |
| `drain` | 0.7 bars/s | 0.1-3 | Drain speed; one drain lasts 140 ms to max(1100 ms, 0.35 / drain s) |
| `ease` | smooth | smooth, out, linear | Drain curve: in-out cubic, out cubic, linear |
| `gainHold` | 240 ms | 0-1000 | After the 120 ms gain grow-in, the fill waits this long |
| `fill` | 0.9 bars/s | 0.1-3 | Fill rise speed on heal (out cubic) |
| `low` | 0.25 | 0-0.5 | Low-HP threshold (fraction of max, HP > 0) |
| `pulse` | on | on, off | Low-HP pulse, 900 ms cycle |
| `flash` | on | on, off | 160 ms white on the new loss segment (crisp: blinks at 40 ms steps) |
| `shake` | 2 px | 0-4 | Hit shake: boss x1, party x0.5, unit never; decays over 260 ms |
| `theme` | auto | auto, crimson, verdant, azure, amber, skin | auto: boss / foes crimson with pale-gold loss, party / allies verdant with red loss |
| `ticks` | 0 (auto) | 0-10 | Divider ticks (auto: boss 4, others 0) |
| `render` | auto | auto, smooth, crisp | auto = crisp on <= 512 px canvases or with `imageSmoothingEnabled` false |

## 3. Variants

- **Modern action RPG**: the defaults.
- **Fighting game**: `hold` 900, `holdCap` 2600, `drain` 1.6, `ease` out, `shake` 3, amber: the whole combo shows, then snaps down.
- **Calm JRPG**: `hold` 250, `drain` 0.4, linear, no shake, azure.
- **Pixel host**: `render: crisp` on a 256-wide game.

Theme colours (fill light / mid / dark, loss, gain, low): crimson `#ff7a74 #e0303f #8c1428`, loss `#ffd98a`, gain `#9dffc6`, low `#ff5a24` (v1.0.1; pulse lightens the fill up to 50 % and adds an inner glow); verdant `#b4f57a #4cc25c #1f7a3c`, loss `#ff5a4e`, gain `#c4fff4`, low `#ffb03a`; azure `#9fdcff #3f92f2 #1c4aa6`, loss `#ff8a96`; amber `#ffe08a #f39a2c #a8501a`, loss `#fff4e0`.

## 4. Interface

**Needs**
- `set(id, hp, max)` for every unit with a bar, every fixed step (the first call per id snaps).
- `reset(id, hp, max)` where units are created or refilled (new game, battle, wave, respawn, load).
- `update(dtMs)` every fixed step in every scene (`0` holds the timers).
- `draw(ctx, id, x, y, w, h, {style, label, text, team})` where the game drew its bar: HUD bars outside the camera, over-head bars inside it.

**Provides**
- The drawn bars; `state(id)` `{hp, max, main, gainTop, ghost, phase, gain, loss, gainSeg, holdLeft, chain, low, number}` with `main <= gainTop <= hp <= ghost`; `curve(id)` (last 900 steps); `shown(id)` (rolling number); `lastDrawn()`, `stats()`, debug events.

**Skins.** Optional `skin` with `theme: 'skin'`: `bars.hp`, `fx.hot` (loss), `fx.heal` (gain), `bars.hpLow`, `ui.well`, `ui.fill`, `ink`, `ui.highlight`; a pixel skin forces crisp.

**Delivery.** `module/draining-hp-bar.js` (global `GameDNA_DrainingHpBar`, API and 15-line integration in `module/README.md`), `prompt.md`, `tools/basket/draining-hp-bar.mjs`, judge probe `judge/probes/draining-hp-bar.js`. The demo runs on the module (an HD instance for the battle and a crisp instance for the 256 x 144 strip).

## 5. Screen rules (exact numbers)

Smooth (s = device px per logical px):
- Boss: plate padding max(2, round(0.22 h)), corner radius min(0.32 h, 6 s) + pad, plate gradient `#2a2230 -> #100b12`, 1 px rim at 55 % in `rim`, drop shadow 8 s blur (low HP: the low colour, 10-18 s blur, pulsing). Diamond end caps half-height 0.42 x plate height, gold gradient, ink outline, a low-coloured jewel at low HP. Name: bold, upper case, letter spacing 0.08 em, size clamp(0.95 h, 9 s, 16 s), 3 s above the plate. Track hatch: 6 s diagonal stripes at 3.5 % white.
- Party: pill radius h / 2, 1 s ink outline, 4 s soft shadow; label 600 weight, size clamp(1.25 h, 8 s, 12 s), 2 s above; number right-aligned at 0.85 x label size.
- Unit: pill, 1 s ink outline, 2 s shadow; no text; hidden when full and idle for 1.4 s (320 ms fade), and 0.5 s after it drained to 0.
- Fill: vertical gradient light / mid / dark at 0 / 45 / 100 %, gloss band 22 % white from 12 % to 34 % of the height, 1 s bright cap at the fill end. Loss: its colour lightened 35 % at the top, darkened 25 % at the bottom, 1 s white leading edge while draining. Gain: shimmer stripes 45 % white, width 1.4 h, moving 45 px/s x s.
- Hit: loss colour mixed 75 % to white at the hit, fading over 160 ms; 30 % white over the fill; a radial spark at the HP edge (boss 1.6 h radius 80 %, party 1.1 h 50 %) for 200 ms.

Crisp (u = round(device scale), 1 at 1:1):
- 1 u ink outline; boss: 2 u plate, 1 u border (low: blinks to the low colour), rim colour top line, 5-row pixel diamonds at both ends.
- Track: mid colour, 1 u darker top row. Loss: flat, 1 u lighter top row when h >= 3 u, 1 u darker bottom; never narrower than 1 u while a loss exists. Gain: flat with a 1 u checker row that shifts every 125 ms. Fill: flat, 1 u highlight row (h >= 2 u), 1 u shadow row (h >= 4 u).
- Flash: the loss segment white on alternate 40 ms steps for 160 ms. Low pulse: two colours alternating every 225 ms.
- Labels and numbers: built-in 3 x 5 font at u, 1 u drop shadow.

Model:
- Drop: `main = min(main, hp)` on the same call. Loss top `ghost = max(ghost, old hp)`; hold = min(`hold`, `holdCap` - chain); drain tween from ghost to hp, duration |ghost - hp| / max / `drain`, clamped 140 ms to max(1100, 350 / `drain`) ms.
- A hit during the drain pauses it (hold) unless the cap is spent: then the drain re-tweens with out-cubic from where it is (never a slow restart).
- Heal: gain top tweens to hp in 120 ms (out cubic), the fill waits `gainHold` + 120 ms, then tweens to hp. A heal above the loss top clears the loss.

## 6. Common mistakes (symptom -> fix)

| Symptom | Fix |
|---|---|
| The bar never drains, or the pale part stays forever | `update()` is not called (or only in one scene); call it every fixed step |
| Every hit shows a big drain from full | `set` is called with the wrong id (e.g. the array index after a unit died) so another unit's value is compared; use a stable per-unit id |
| A new wave's enemies fill up with a heal animation | `reset(id, hp, max)` where the wave or battle starts |
| The killing blow shows no loss segment | the unit's bar stops being drawn when it dies; keep `set` and `draw` for its id (at its last position) while `busy(id)` is true |
| No loss segment ever, bar just jumps | `reset` is called every step instead of `set` |
| Over-head bars stick to the screen while the camera moves | they are drawn after the camera transform was undone; draw them inside the world pass |
| HUD bar blurry or with soft edges in a pixel game | the canvas is larger than 512 px with smoothing on: pass `render: 'crisp'` |
| Two bars on top of each other | the game's own fill rect is still drawn; replace only that rect, keep the text |
| `?auto=1` ends differently | the integration read the module's rolling number into game logic, or used the game's random numbers; bars must only read |

## 7. Acceptance moments

1. **Merged combo** (`?t=1400&freeze=1`): Rowan at the colossus after three quick hits; the boss bar shows one pale-gold loss segment spanning all three hits, holding.
2. **Drain** (`?t=1850&freeze=1`): the merged segment part-way down, white leading edge, Rowan hopping back still facing the colossus.
3. **Party loss** (`?t=2800&freeze=1`): the colossus's slam lands on Rowan: her HUD bar dropped, a red loss segment over the green.
4. **Heal preview** (`?t=4060&freeze=1`): Mira's heal on Rowan: a mint gain segment with shimmer beyond the fill, the fill not yet risen.
5. **Over-head bar** (`?t=5400&freeze=1`): the imp felled by Kael's thrusts: its small bar empty of fill, the loss segment still there, drawn in world space under the camera drift.
6. **Boss low HP** (`?t=7100&freeze=1`): the fire hit took half the bar; the fill is under 25 % and pulses hot red, the frame glows, the loss segment drains.
7. **Party low HP** (`?t=8450&freeze=1`): Kael under 25 %: amber pulse, red loss segment, the HUD card's portrait ring tinted.
8. **Crisp** (the strip, any moment): the same bars on a 256 x 144 canvas: whole pixels, flat steps, 3 x 5 digits.
9. **Host**: `?auto=1` ends exactly like the original; bars show the loss segment on hits and the gain segment on heals.

# G-10 Stamina & outpost rest

## 1. What it is

Every squad (or a lone hero) carries a small stamina pool shown as pips above it. Marching and attacking spend it; at zero the unit is **exhausted**: its attacks are refused (or it moves and swings slower) until it has recovered to `recoverAt`. Units recover a little on their own each phase (or each second after a short pause), and much faster while **resting inside a site their side holds**: a camp, an outpost, a shrine or a campfire. Sites change hands when one side holds them alone (at the start of its phase, or for `captureMs` in real time), so a forward camp becomes a goal worth taking.

The result is a rhythm: push, tire, fall back, rest, push again. A tactics map gains a supply-line feel without any new units; an action game gains a reason to pause between fights and to look for the next fire.

The module owns the stamina numbers, recovery, ownership, captures and all drawing (pips, tags, sweat drop, rest glow and embers, site markers, capture ring). The game keeps its units and rules and asks one question before each attack: `engage(id)`.

## 2. Default parameters

Element parameters: `clock` (turn / realtime), `sites` (where), `pace` (standard), `max` 6, `recoverAt` 2, `capture` on. `pace` fills the costs for the clock; the module also takes each cost directly (README).

| key (pace standard) | turn clock | real-time clock |
|---|---|---|
| `max` | 6 pips | 6 pips |
| `engage` | 2 per attack | 0.75 per swing |
| `counter` | 1 per counter-attack | 0 |
| `march` | 1 per committed move | 0.03 per tile walked |
| `regen` | +1 at the side's phase start | +2.5 / s after 300 ms without attacking |
| `rest` | +3 more at phase start inside an owned site | 3 / s instead of regen while standing still 250 ms inside an owned site |
| `recoverAt` | 2 | 2 |
| `rule` | `noAttack` | `slow` (attack cooldown ÷ 0.75) |
| `capture` | `on`: a site with only that side's units at its phase start | `on`: alone in the site for 900 ms |
| `show` | `always` | `used` (strip fades 1.4 s after it is full and untouched) |

Worked example (turn, defaults): move + attack = 1 + 2 → 3 left; next phase +1 = 4; attack and get countered = 2 + 1 → 1; next phase +1 = 2, attack → 0: TIRED. Its next attack is refused (TOO TIRED) and the action ends as a wait. Back in the owned camp at its phase start: +1 + 3 = 4 ≥ 2, READY.

## 3. Variants

| variant | params | feel |
|---|---|---|
| Squad tactics (turn) | pace standard | two attacking turns, then a breather or a retreat |
| Supply lines (turn) | pace camp (regen 0.5, rest 4) | units mostly recover at camps: holding a forward site matters |
| Forced march (turn, harsh) | pace harsh (march 1.5, rule both), max 5 | moving is expensive and exhausted squads also move half as far |
| Action hero (real-time) | pace standard (0.75 per swing, regen 2.5/s, rule slow) | a masher gets winded only in long fights; a short pause refills |
| Campfires matter (real-time, **recommended**) | pace camp (1 per swing, regen 0.6/s, winded swings ÷ 0.85) | a normal fight ends in TIRED; you walk to a fire to rest (the demo's real-time mode; on the unseen top-down host autoplay wins, the scripted masher 7/8) |
| Winded means no swings (real-time, harsh) | pace harsh (1 per swing, regen 1.2/s, rule noAttack), max 5 | classic stamina bar: empty = no attacks until 2 pips are back |

Autoplay check on the two unseen hosts (my integrations, `?auto=1`): tactics standard 63 s, camp 77 s, harsh 112 s (original 45 s), all won; top-down action standard / camp / harsh all won (36 / 48 / 42 s; original 36 s).

## 4. Interface

**Needs**: `units()` (id, side, drawn sprite box, alive); `sites()` (circle or rect, kind, starting owner); `engage(id)` at every attack start with a path for `false` that ends the action; turn clock: `march(id)` once per committed move and `turnStart(side)` once per phase start; real-time: divide the attack cooldown by `speedScale(id)`; `update(stepMs)` every fixed step; `drawSites(ctx)` under units and `draw(ctx)` over them; `camera()` for scrolling games; `uiRects()`.

**Provides**: stamina per unit id; `engage` / `canAttack` / `speedScale` / `moveRange`; site ownership, capture and `nearestSite(id)` for AI; `stamina(id)` for HUDs; callbacks `onExhausted`, `onRecovered`, `onRest`, `onCapture`, `onRefused`; `serialize()` / `restore()`.

## 5. Screen rules (exact numbers)

Scale `k` = screen width / 256 (crisp: rounded to a whole pixel, ≥ 1).

- **Crisp strip** (native pixel canvases ≤ 400 px wide): 1 px ink border, segments 2 px wide when `max` ≤ 4 else 1 px, 2 px tall, 1 px gaps; 6 pips = 13 × 4 px. Full `#ffd23f` with a `#fff3a6` top row; ≤ 1/3 left: orange `#ff9a3c`; empty `#3a3026`. Exhausted: border blinks `#ff4a3a` / `#7a1a14` every 260 ms, empty segments `#3a1410`.
- **Smooth strip** (HD): capsule plate `rgba(14,11,20,0.78)` with a 0.35k light rim and soft shadow; pips 2.5k × 2.0k, gap 0.7k, padding 1.5k (6 pips at 640 px: 54 × 12.5 px). Gold gradient `#fff4b8 → #ffd23f → #e09a14`; low: `#ffd6a0 → #ff9a3c → #d0581c`; a partial pip fills left to right. Resting pips pulse with an additive glow.
- **Placement**: above the sprite box (gap 1 crisp px / 1.2k); if that touches a UI rect, another unit, an `obstacles()` box or another strip: below; then a compact upright badge (the strip turned 90°, filling bottom to top) right, then left of the box; then the first of those that only avoids UI; inside the top of the box only when nothing else is free; hidden while UI covers every slot. Units entirely off screen, or with `show: false`, get no strip. The sweat drop sits on the side away from an upright badge. The choice sticks while it stays valid (no flicker). Clamped inside `bounds`.
- **Refill**: turn clock ticks up one pip per `fillMs` (140 ms), units staggered 160 ms (resting) / 60 ms; each new pip pops (crisp: white for 220 ms, lifted 1 px for 110 ms; smooth: scale 1 → 1.45 → 1 over 260 ms with a white flash). A spent pip flashes red (200–320 ms).
- **Tags** (1.1 s, rise 4k, fade in 120 ms / out 260 ms): `REST +N` / `READY +N` gold `#ffe9a0`; `TIRED`, `TOO TIRED` red `#ff8a7a`. Crisp: built-in 3 × 5 font with a 1 px ink outline; smooth: 800-weight 4.2k px sans with a dark stroke. Not drawn where they would touch a UI rect.
- **Refused attack**: strip shakes ±1.5k px for 360 ms; TOO TIRED at most every 450 ms.
- **Sweat drop** beside the head while exhausted, bobbing 0.6–0.8k px.
- **Rest effect**: glow ellipse under the feet (smooth: additive radial, 0.35 alpha), a ring rising up the body every 1.1 s, 6 rising sparkles (crisp: 4 one-pixel embers).
- **Sites**: dashed outline (circle 1 : 0.72, or rect; crisp: corner brackets and a 12 % tint) in the owner's team colour (`#5aa8ff` / `#ff5a4a` / neutral `#c9c2b0`); lit sites get an additive warm pool. Campfire: 7 stones, 2 logs, 3 flickering flame layers, 4–11 embers; unowned: ash and smoke. Banner on a camp; outpost = banner only near the rect's back-left; shrine = standing stone with a glowing rune. HD markers are drawn 1.45× the pixel size. Capture: a progress arc (real-time), then for 1.6 s, drawn over the units: a team-colour light pillar and glow on the site, an expanding ring, and `CAMP CLAIMED` / `OUTPOST TAKEN` / `SHRINE LIT` in the new owner's colour just above the marker. Real-time rests end with `REST +N` (when the unit leaves the site or is full).

## 6. Common mistakes (symptom → fix)

| symptom | fix |
|---|---|
| `?auto=1` never ends; one unit keeps "attacking" with TOO TIRED | the refused attack does nothing and the AI picks it again: when `engage` returns false, end that unit's action as a wait (turn) or just skip the swing (real-time); send exhausted units to `nearestSite()` |
| Enemies hit while exhausted, or counters never cost anything | an attack path (enemy AI, counter, autoplay) skips `engage`; grep every place damage starts |
| Pips never refill in a turn game | `turnStart(side)` is not called (probe `noTurnStart`), or it is called before the units are placed |
| Stamina drops when a move is undone | `march` called on the preview path; call it where the move is committed |
| Pips float away from the units when the camera moves | `units()` mixes world and screen px; give world px plus `camera()`, or screen px without it |
| Pips frozen, no rest glow | `update()` only runs in one scene or not in the `?t=` fast-forward loop |
| Pips over the HUD | the HUD is missing from `uiRects()` (screen px) |
| Units never rest at the camp | the unit's foot point is outside the site (default: centre x, 80 % down the box): enlarge the site or pass `foot` |
| A masher can no longer finish fights (real-time) | costs too high for the game's attack rate: keep `rule: 'slow'`, lower `engage`, or raise `regen` |

## 7. Acceptance moments

1. **Drain**: a squad marches and attacks; its strip loses 1 then 2 pips, each flashing red.
2. **Exhausted**: at 0 the strip blinks red, a sweat drop bobs and TIRED rises. Its next attack is refused: TOO TIRED, the strip shakes, the game continues with the next unit.
3. **Rest**: at its phase start inside an owned camp the fire flares, a warm glow and embers rise around the squad, pips pop back one by one, `READY +4`.
4. **Capture**: a squad alone in an empty shrine or the enemy outpost: ring and `SHRINE LIT` / `OUTPOST TAKEN`, banner and outline switch to its colour.
5. **Real-time**: a hero swinging at targets drains its capsules, gets winded (slower swings), walks to the fire, stands still and refills with embers.
6. **Pixel**: on a 256 px canvas the same moments read as crisp segment strips, a pixel fire and banner, and 3 × 5 text.

# C-02 Turn-order bar

## 1. What it is

A strip of small portraits along one edge of the screen that shows who acts next. The unit acting now sits first in a bigger gold frame and hops gently; behind it come the next 6-10 units in frames coloured by team (blue for the player's side, red for enemies, slate for neutrals), with `+N` when more are queued. When a turn ends the front portrait slides out under the label and everyone slides one place forward; a unit that joins pops in with a white flash (or slides in at the tail); a unit that dies flashes, turns red with a cross and crumbles down; a unit that changes place (haste, delay) hops over the others to its new slot. The unit under the player's cursor or being targeted blinks in the strip, so the strip and the field point at the same thing. Optional wait numbers (ticks until each turn) hang off each portrait. The strip fits horizontally on the top or bottom edge, or as a column on the left or right, and never covers the HUD panels the game names.

Portraits come from the game's own sprites: the `spritePortrait` helper crops the head of a humanoid sprite or shrinks a big monster, pixel for pixel. Without sprites the slot shows a token: a disc in the team colour with the unit's initial.

It is a UI addon: the game supplies the order (an array of unit ids) each time it changes; the module never computes turn rules and reads no input.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `layout` | top | top, bottom, left, right | Edge of the screen: top / bottom = horizontal strip, left / right = vertical column |
| `align` | start | start, center, end | Preferred place along that edge |
| `slots` | 8 | 4–12 | Most units shown; the rest become `+N` (fewer when the free edge is shorter) |
| `size` | 16 px | 12–24 | Slot size; the current unit's slot is size + 4 |
| `gap` | 2 px | 0–4 | Space between slots |
| `slide` | 240 ms | 0–500 | Slots sliding forward, hops, the current frame growing, the strip moving |
| `pop` | 220 ms | 0–400 | Join and leave animations (a death takes 1.8x) |
| `bounce` | 2 px | 0–4 | Hop height of the current unit |
| `waits` | auto | auto, off | Show wait numbers when the game passes them |
| `label` | TURN | TURN, NEXT, none | Word at the start of the strip |
| `fade` | on | on, off | Fade to half while a sprite is under the strip |
| `portrait` | auto | auto, token | `token` ignores `drawPortrait` |

## 3. Variants

- **Classic top strip** (defaults): top-left, 8 slots of 16 px, label TURN.
- **Side column**: left edge, 7 slots, label NEXT; stops above a bottom HUD panel.
- **Big portraits**: centred on top, 6 slots of 22 px, 3 px gap, 3 px hop, 300 ms slide.
- **Compact tokens**: 10 slots of 12 px, 1 px gap, tokens with initials, no label, no wait numbers, quicker motion.

Turn systems shown in the demo with the same module: charge time (a unit can appear several times, wait numbers on) and phases (the units of the side in play that have not acted yet). The unseen-host checks add a strict speed order with a round divider (`BREAK`) before the next round.

## 4. Interface

**Needs**
- The order, as unit ids, next to act first: `setOrder(ids, {current, waits, dead})`, called whenever it changes or every step. `ids` is a copy of the game's own queue (speed order, initiative list, charge-time forecast, or the units that have not acted this phase). `current` = the id acting now (`null` between turns). `waits` = wait numbers, by id or parallel to `ids`. `dead` = ids that died, so they crumble instead of shrinking. `GameDNA_TurnOrder.BREAK` marks a round boundary.
- A fixed 60 Hz `update(1000 / 60)`; `draw(ctx)` after the scene and HUD.
- The screen area (`view`) in native pixels.
- Optional: `drawPortrait(ctx, id, rect)` (or `spritePortrait(id => sprite)`), `teamOf(id)`, `labelOf(id)`, `getObstacles()` (HUD rects without `id`, sprites with `id`), `highlight(id)` every step.

**Provides**
- `rect()` / `rects()`: the strip's rectangle, for other overlays to avoid.
- `slotAt(x, y)`: the unit under a portrait, for hover and taps.
- `spritePortrait(getImage, opts)`: a `drawPortrait` made from the game's own sprites.

**Delivery (v1).** All of this is `module/turn-order-bar.js` (one global, `GameDNA_TurnOrder`; API and a 15-line integration in `module/README.md`). It draws through `GameDNA_Skin` when `skin-api.js` is loaded and falls back to a built-in copy of the pixel16 look. It is robust to sloppy calls: ids may be numbers, strings or unit objects; `null`s are skipped; a `current` missing from the list is put first; identical `setOrder` calls are free; throwing callbacks fall back (token, neutral team, no obstacles) with one warning each; `draw` never throws; without `update` it animates on draw calls and warns once. Verified on two unseen hosts (`checks/hosts/`, judged with `judge/probes/turn-order-bar.js`).

## 5. Screen rules (exact numbers)

Native canvas (256×224 in the demo), integer-scaled with nearest-neighbour; every position is a whole native pixel.

- **Plate**: skin `frame(role: 'plate')` (pixel16: 1 px `#0a0c24` edge, `#1c2458` fill, 1 px `#5a6ac0` top light). Padding 2 px. Horizontal thickness = 2 + bounce + 1 + (size + 4) + 1 + 3 (if waits) + 2 = 28 px at defaults (31 with waits). Vertical width = the same across, or the label width + 6 if wider. Margin 2 px from the view edge.
- **Label**: skin `text(font 'ui')` in `text.label` / `text.label2` (pixel16 5×7, `#b8d0ff` over `#8ca8e8`), vertically centred, 4 px before the first slot; in a column it sits on top.
- **Slots**: square, `size` px (current `size + 4`), `gap` px apart, bottoms aligned (horizontal) or centred (vertical). Frame 1 px: top and left edge in the team's light tone, the rest in the team's mid tone; inside, a well in the team's dark tone mixed 50 % with ink, then the portrait clipped to the inner rect (size − 2). pixel16 team tones = `windows.{a,b,n}`: blue `#a8c8ff` / `#2c50b8` / `#1a2e74`, red `#ffc8b8` / `#b8402e` / `#6a1c1e`.
- **Current**: gold frame (`cursor.light` `#fff6c0` / `cursor.base` darkened 42 %) with a 1 px `cursor.edge` ring outside and a 2-pixel light corner tick; hop of `bounce` px on a 40-frame cycle (frames 0–3: half, 4–9: full, 10–13: half, rest: 0), only once its slot has settled.
- **Highlight**: frame light edge white, mid tone blinking white / team light every 133 ms.
- **Wait tab**: `ui.plateEdge` box 7 px tall hanging 3 px off the slot's lower right corner, 3×5 digits in `paper` (current in gold), at most 3 digits. With slots under 14 px or `portrait: token` the tab sits fully outside the slot (below it in a strip, to its right in a column; the plate grows by 8 / 13 px) so it never hides a token's initial or the next frame.
- **`+N`**: 3×5 digits on a `plateEdge` box after the last slot, in `text.label`.
- **Round divider** (`BREAK`): 5 px wide, dotted 1 px line in `text.label2` with a 3×3 plus in `text.label`.
- **Motion** (all on the module clock; ease-out cubic): slide `slide` ms; current frame grows over 0.6 × `slide`; front exit slides one slot back under the label with alpha steps 1 / .75 / .5 / .25 over `pop`; middle exit shrinks to its centre over `pop`; death: white flash every 66 ms for the first 45 % of 1.8 × `pop`, red tint and an ink cross, then collapses downward; join: grows from its centre with a white flash (first 45 % of `pop`), or slides in from one slot further at the tail with stepped alpha; first appearance staggers slots 45 ms apart; a moved unit hops 3 px across the strip while sliding. The plate opens in 120 ms and closes in 160 ms (stepped alpha), keeping its length while it closes.
- **Placement**: candidates every 4 px along the chosen edge (plus beside each HUD rect), at the edge or just past a HUD rect lying on it. Score = 4000 + 50/px² for a HUD rect (no id) + 1/px² for sprites + 0.6/px from the preferred place + 4/px away from the edge. Re-checked every 30 steps; the strip stays unless a spot is better by 300; a HUD rect under it makes it step off at once (no slide). The free run along the edge limits how many slots fit (a column stops above a bottom panel).
- **Fade**: a sprite overlapping the plate by ≥ 8 px² sets the plate to 0.5 alpha (stepped), held 500 ms after the sprite leaves.
- **Draw order**: scene → sprites → effects → HUD → strip (last, outside screen shake).

## 6. Common mistakes (symptom → fix)

- The strip shows a different order from the one the game then plays → build `ids` from the game's own queue (the same array the turn code shifts from), not a re-sort of all units.
- Units skip turns or the game desyncs after adding the strip → the integration sorted, shifted or refilled the game's own array; always pass a copy (`.slice()`, `.filter()`, `.map()`).
- The acting unit vanishes from the strip the moment its turn starts → many games shift the actor out of the queue; pass it as `current` (it is put first).
- Everything flashes and re-pops every frame → ids change type or identity each frame (new objects, `String(i)` one frame and `i` the next); pass stable ids.
- A killed unit shrinks like one that just acted → pass its id in `dead` on the step it dies.
- The strip covers the HUD or the command menu → return those rects (without `id`) from `getObstacles()`; the strip steps past them or shows fewer slots.
- A side column runs over the busiest part of the field and turns see-through → put it on the edge with fewer units (the side the enemies stand on in a side-view battle is often freer than the party's), or lower `slots`.
- The strip sits on top of units and hides them → use `fade: 'on'` and give sprites (with `id`) to `getObstacles()`, or move it to another edge.
- Portraits are blurry or a giant monster shows as a brown square → use `spritePortrait` (1:1 crops, never smoothed) or draw with `imageSmoothingEnabled = false` inside the rect.
- Mirrored enemies face the wrong way in the strip → return `{img, flip: true}` from the `spritePortrait` callback for units the game draws mirrored.
- `?t=&freeze=1` screenshots show an empty or half-open strip → call `setOrder` and `update` from the fixed step, not only from the render.
- After a restart the old battle's portraits slide out over the title → call `clear()` at restart and skip `draw` on the title.

## 7. Acceptance moments

| Shot | Must be visible |
|---|---|
| `demo/?t=3000&freeze=1` (`shots/01-demo-top-ct.png`) | Top strip: Arden first in the gold frame, eight slots (slime, three heroes, bat, golem…) with blue and red frames, wait numbers 4–12, `+3`; the bat targeted on the field and its slot blinking. |
| `demo/?t=3850&freeze=1` (`02`) | Mid-advance: the front portrait sliding out under the label, the rest one place forward, a new bat sliding in at the tail. |
| `demo/?t=5600&freeze=1&hover=bat` (`03`) | Wren healing Corin: Wren current, Corin's and both bats' slots highlighted, arrows over Corin and the bat on the field. |
| `demo/?t=3000&freeze=1&layout=left&label=NEXT&slots=7` (`04`) | Left column, label on top, ends above the HUD window with `+5`. |
| `demo/?t=7600&freeze=1&layout=bottom&align=center` (`05`) | Bottom strip sitting above the HUD window (not on it), faded to half where the imp stands under it. |
| `demo/?t=3000&freeze=1&mode=phase` (`06`) | Phase mode: only the heroes that have not acted, the actor first. |
| `demo/?t=3000&freeze=1&skin=flat` (`09`) | The same strip through a token-only smooth skin (proves every visual goes through the skin). |
| `checks/hosts/battle` `?t=4000&freeze=1` (`12`) | Unseen side-view battle: strip below the action caption, scorpion current, next round after the divider. |
| `checks/hosts/tactics` `?t=6000&freeze=1` (`13`) | Unseen grid tactics, enemy phase: the moving raider current (mirrored portrait), the reds that have not acted after it. |
| Phase width 500 px (`11`) | The demo canvas fits at 1× with no horizontal scroll. |

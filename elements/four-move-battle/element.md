# A-02 Four-move menu battle with type matchups

## 1. What it is

A battle-flow element. Two sides each send out one creature (two in the 2v2 variant); the rest wait on the bench. Every turn the player picks one command per creature on the field: **FIGHT** (one of up to four moves, each with uses left), **ITEM**, **TEAM** (switch to a bench creature: the switch is the turn) or **RUN**. The foe picks too, then everything resolves in order: switches and items first, then moves by priority, then by speed. Each move has a type; a type chart makes it count double, half or not at all against the target's types, and the message box says so. Accuracy, critical hits, burn / sleep / numb, guard, heal and drain moves, fainting, the next creature being sent out, and win / lose all belong to the element, as does the classic screen: foe top-right on a platform with its name / level / HP box, own creature bottom-left seen from behind, a message box with typewriter text, a 2×2 move menu with type and uses, HP bars that drain, and send-out / withdraw / faint animations.

It replaces "everyone attacks in a round" party battles with readable one-on-one duels where the choice of creature and move type matters more than raw stats.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `format` | `single` | `single` / `double` | One or two creatures out per side |
| `textSpeed` | `normal` | `slow` 22 / `normal` 45 / `fast` 90 chars/s / `instant` | Typewriter speed |
| `advance` | `auto` | `auto` / `key` | `auto`: a fully shown message also moves on after `hold` (900 ms); `key`: waits for OK (classic). Autoplay always advances. |
| `drain` | `normal` | `slow` 1.9 s / `normal` 1.15 s / `fast` 0.6 s | Time for a full HP bar to drain; minimum 0.2 HP per frame |
| `hints` | `on` | `on` / `off` | Move panel shows STRONG / WEAK / NO EFFECT against the foe (single, or the picked target in doubles) |
| `critRate` | 0.0625 | 0–0.25 | Critical-hit chance (×3 for `highCrit` moves); damage ×1.5 |
| `res` | `240x160` | `240x160` / `256x224` | Native resolution (layout scales; message box 48 px, 56 px from 200 px tall) |

**Rules (exact):**

- **Order:** run (9) > switch (8) > item (7) > moves by `priority` (Brace +3, Quick Peck +1, others 0), then effective speed (numb ×0.5), then a seeded coin flip.
- **Damage:** `base = floor(floor(floor(2·L/5 + 2) · power · A / D) / 50) + 2`, then `× STAB 1.5 (move type = one of the user's types) × type multiplier × crit 1.5 × roll 0.85–1.00 × spread 0.75 (all-foes move with more than one target) × guard 0.5`, floored, at least 1. `A` is halved while burned. A host may replace it (`damage(ctx)`).
- **Type multiplier:** product over the defender's types of `chart[move type][defender type]` (2, 0.5, 0, default 1). 0 → no damage, message "IT DIDN'T TOUCH X...". Untyped moves are neutral.
- **Messages after a hit, in order:** crit "A PERFECT HIT!", then >1 "A CRUSHING MATCHUP!" or <1 "IT BARELY LANDED...", then secondary status, then "X IS OUT OF THE FIGHT!" if HP is 0. All wording is original and overridable (`text`).
- **Accuracy:** `random·100 ≥ accuracy` misses ("X MISSED!"). Support moves roll too.
- **Statuses** (one at a time; a type may be immune): **burn** — 1/16 max HP at the end of each turn, attack halved; **sleep** — 1-3 turns, the creature skips its move, then wakes and acts; **numb** — 25 % chance to skip the move, speed halved.
- **Uses:** a move with 0 uses cannot be picked; with every move at 0 the creature uses FLAIL (power 30, untyped).
- **Switching:** withdraw (white silhouette, shrinks in 4 steps, a light streak leaves) then send-out (an orb arcs in, opens in a burst, the creature grows ¼ → ½ → ¾ → full in 4-frame steps). The switch-in can be hit the same turn.
- **Fainting:** 2 flashes, then the sprite sinks below the platform line over 24 frames; the info box slides out. At the end of the turn the foe sends out its next creature; the player picks theirs (forced TEAM list). A side with nobody left loses.

## 3. Variants

| Variant | Params | What changes |
|---|---|---|
| One on one (default) | — | Classic duel |
| Two on two | `format: double` | Two creatures per side, compact 23 px info boxes stacked, a target pointer for single-target moves, all-foes moves at ×0.75 |
| Classic: wait for OK | `advance: key` | Every message waits for OK with a blinking arrow |
| Fast text and drain | `textSpeed: fast, drain: fast` | About half the battle length |
| No hints | `hints: off` | The move panel stops showing STRONG / WEAK |
| Console 256×224 | `res: 256x224` | Taller field, 56 px message box |

## 4. Interface

**Kind: system.** `starter/index.html` is a complete game built on the module ("Crossroads Cup", three rival battles). `starter/README.md` lists its extension points for addons: the hit site, the draw-effects slot, UI rects, creature anchors, the input chain, autoplay, the clock (pause, hit-stop), turn and phase events, and a top UI draw hook.

**Delivery (v1):** `module/four-move-battle.js` (global `GameDNA_FourMove`; API in `module/README.md`). The host creates one battle per encounter with `create({view, teams, moves, types, sprite, drawBackground, onEnd, params, …})`, calls `update()` every 60 Hz step, `draw(ctx)` (or `drawScene` + its effects + `drawUI`) and `key()` / `tap()`. It draws through `GameDNA_Skin.resolve(options.skin)` when `skin-api.js` is loaded, else a built-in copy of `pixel16`.

**Needs from the host:** creatures (id, name, level, types, hp, atk, def, spd, up to 4 moves), a move table, a type table (strong / weak / none per type), a fixed 60 Hz step, the keys up / down / left / right / ok / back. Optional: sprites (front and back; small ones are scaled by whole numbers), a backdrop and platform art, a foe AI, items.

**Provides:** turn resolution and the message queue; the menus; the battle screen; the hit site (`beforeHit(ev)` may change `amount` or cancel, `onHit(ev)` with `hpBefore / hpAfter / killed / anchor`); events (`turn`, `phase`, `message`, `order`, `choice`, `moveUsed`, `miss`, `immune`, `guard`, `sendOut`, `withdraw`, `faint`, `end`); anchors and UI rects in native pixels; `snapshot()` to copy HP and uses back; autoplay that presses the menu keys a player would.

## 5. Screen rules (exact numbers, 240×160)

- **Message box:** full width, y = 112, 48 px tall (56 px when the view is ≥ 200 px tall). Two lines, line height 12 px, 4 px inner padding + 4 px text inset. More lines → pages. A blinking 5×3 down-arrow at the bottom right while a message waits.
- **Foe:** platform ellipse centre (72 % of width, 50 % of field height), rx 18 % of width, ry 4.5 % of width. Sprite feet 30 % of ry below the platform centre. Info box top-left at (4, 4), width 45 % of the view (100-132 px), 36 px tall: name and `LV n` on row 1, `HP` + bar (5 px) on row 2, status badge left and type tags (3 letters) right on row 3. Red window.
- **Own:** platform centre (27 % of width, field bottom − 2 %), rx 23 %, ry 5.5 %. Sprite drawn 1.25× bigger (back view), feet 12 % of the message box height below its top edge: the lower body is hidden by the message box. Info box right-aligned 4 px from the edge, its bottom 4 px above the message box; row 3 = status badge left, `hp/max` right (the number counts down with the bar). Blue window.
- **Team / item list:** an opaque panel over the whole field; the active creature's name in gold with a blue OUT pill; the message box says SWITCH TO WHICH CREATURE? (or WHO GOES OUT NEXT? when forced). During a doubles target choice the move panel's first row reads WHICH FOE?.
- **Command menu:** the message box splits: prompt "WHAT SHOULD X DO?" on the left, a 2×2 window on the right (42 % of width, ≥ 96 px): FIGHT, ITEM / TEAM, RUN. Greyed: ITEM with no items, RUN when running is not allowed.
- **Move menu:** left 70 %: 2×2 move names, each with a 3×7 type pip in the type colour (grey for untyped moves); a name wider than its cell (62 px at 240 wide = 10 characters) is condensed, then set in a 3×5 font, then cut with an ellipsis, never drawn into the next cell; right 30 % (≥ 70 px): `USES n/max` (orange at ≤ ¼, red-orange at 0), a type badge, and the hint line.
- **HP bar:** green above 50 %, amber 20-50 %, red below 20 %; the part being lost is drawn orange-red with a 1 px white leading edge while it drains.
- **Sprite scale (auto):** an integer `≤ round(field height × 0.34 / sprite height)` (back: × 0.42) and `≤ floor(width × 0.32 / sprite width)` (back: × 0.4), at least 1.
- **Timings (frames at 60 Hz):** attack: lunge 18 frames (peak 6 px), projectile frames 10-20, impact on frame 20 (hit applied, burst, 8-frame shake of 2 px, target blinks 18 frames); send-out 40; withdraw 30; faint 34; info box slide 10.

## 6. Common mistakes (symptom → fix)

| Symptom | Fix |
|---|---|
| Battle freezes on a message or the foe never acts | `update()` is skipped while a menu or animation runs. Call it once every step, as its own statement. |
| Both the old turn loop and the module act | Stop calling the game's round / turn function inside a battle; keep the function. |
| HP resets between waves, or the wave counter never moves | Copy HP back from `snapshot()` in `onEnd` and run the game's own end-of-battle code there, once. |
| Autoplay sits in the first menu | It waited for the old command phase. Pass `params.auto` / `setAuto(true)`. |
| One side wins in two hits | The type lists make one side strong against nearly everything. Balance the chart, or pass `damage(ctx)` with the game's formula × `eff`. |
| `?t=&freeze=1` still shows an empty message box | `view` was not passed, or `update()` is not called in the fast-forward loop. |
| Text shows `?` | With a bitmap skin the module draws `! ' , : % + ( ) > * # &` itself when the skin lacks them; any other character shows `?`. Keep messages to letters, digits and those. |
| Huge or tiny sprites | Pass one sprite per creature (not a sheet); auto scale only enlarges by whole numbers. |

## 7. Acceptance moments

| Moment | Must be visible |
|---|---|
| Command menu (`?t=6500&freeze=1&auto=0` in the demo) | Foe top-right on a platform with name / LV / HP box and type tag; own creature bottom-left from behind, cut by the message box, with name / LV / HP / numbers; prompt left, FIGHT / ITEM / TEAM / RUN right with the hand cursor |
| Move menu (`&press=ok`) | 2×2 moves with type pips; USES n/max, the type badge and STRONG / WEAK hint |
| Hit landing (starter `?t=7600&freeze=1`) | Orange-red draining segment on the foe's HP bar, message "X USES MOVE!" |
| Matchup message | "A CRUSHING MATCHUP!" after a ×2 hit; never shown for a neutral hit (judge probe: `strongHits = strongMsgs`) |
| Faint and send-out | The fainted sprite sinks and its box slides out; the next foe arrives in an orb and grows in |
| Two on two (`?format=double`) | Two compact boxes per side, no box over a foe sprite, target pointer over the chosen foe |
| `?auto=1` | Plays to the end (starter: CUP CHAMPION with seed 7) with no console errors; no horizontal scroll at 500 px |

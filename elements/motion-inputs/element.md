# A-07 Motion-input special moves

## 1. What it is

Fighting-game special moves on a few buttons. Once per fixed step the game hands the module the player's directions, buttons and the hero's facing. The module keeps a short input buffer (45 steps) and recognises motions written in numpad notation **relative to the facing** (6 = forward, 4 = back, 2 = down): quarter circles (`236A`, `214B`), the forward-down-diagonal (`623A`, also from the shortcut 3-2-3), any direction string (`41236A`), charge moves (`[4]6A`: hold back, then forward; `[2]8B`), a full turn (`360A`, optional) and double taps (`66`). Leniency windows accept what real hands do: a stick passing through neutral between two directions, the button a few steps after the last direction was let go, a quarter circle ending on the up-forward diagonal. A move recognised while the hero is busy waits in a **busy buffer** and fires as soon as the game says it can act. The game starts its own attack from `onSpecial(move, info)`; the press is consumed so the normal attack does not also come out. When the hero turns, the same physical motion reads mirrored (facing left, down, down-left, left + B is `236B`).

The **input display** is a column of the last inputs in the game's style: an arrow (or a neutral dot), the buttons pressed, and how many steps it was held; when a special fires, its motion rows light gold and a **callout** names it with its arrows (BUFFERED when it came from the busy buffer; a red TOO SLOW when the shape was right but slower than the windows, so players learn the timing). An optional **move list** shows every move with its arrows drawn for the current facing. Pixel views use a 5x7 pixel font, pixel arrows and button coins at whole-pixel scale; HD views use smooth chips. On phones the glyph scale rises until text is >= 10 CSS px.

## 2. Default parameters

| key | default | notes |
|---|---|---|
| stepWindow | 12 steps | a middle direction is entered at most this long before the next |
| gap | 4 steps | other input allowed between two directions (neutral blips) |
| pressWindow | 8 steps | the button may come this long after the last direction ended |
| motionWindow | 30 steps | from the end of the first direction to the entry of the last |
| shortcuts | on | 623 from 3-2-3; last direction may be a neighbouring diagonal |
| chargeFrames / chargeKeep | 40 / 10 steps | hold time; how long a full charge survives letting go |
| buffer | 12 steps | busy buffer |
| history | 60 steps | the input buffer |
| jumpHold / rollGap / rollNeutral | 45 / 7 / 4 steps | cap of `jumpHold()` from the up press; max steps between two directions of a roll (~115 ms); neutral steps inside a roll that keep it alive (~65 ms) |
| facingAt | press | motion read with the facing at the button press |
| turnWithInput | off | on: a held left / right is the facing (hero turns with input, platformers) |
| display / callout / moveList | on / on / off | |
| rows | 7 | max history rows (fewer when there is no room) |
| side | left | preferred column side |
| render | auto | pixel when the view is <= 270 px tall |

Priority when several moves match: 360 > 623 > longer motions > 236 / 214 > charge > taps; a move whose last direction is held at the press beats one whose last direction is not (walk forward + 236 + A = the 236 move).

## 3. Variants

Classic fighter (default) · Training mode (move list on, 9 rows) · Platformer specials (`turnWithInput: on`, 5 rows) · Tight (leniency off: gap 0, pressWindow 0, no shortcuts) · Clean screen (no history column, callout only).

## 4. Interface

Needs: a fixed step where the device input is read (`left, right, up, down`, the attack button fields, `facing`), `mi.step(input)` before the game uses it and the returned input used (`{fire: false}` under an autopilot); `onSpecial(move, info)` that starts the game's own attack (return `false` if it cannot now); `canAct()`; `avoid()` = the player's sprite box in view units; `uiRects()`; `draw(ctx)` last in render; `reset()` at a new run; `view` and `canvas`.

Provides: specials through `onSpecial` (`info.facing`, `info.buffered`), the consumed input, the input display, callout and move list, `drive(notation)` / `frames()` for scripted motions, `pad()` / `merge()` for gamepads, `fired()`, `stats()`, `lastDrawn()`.

## 5. Screen rules (exact numbers)

- Pixel views (<= 270 px tall): 5x7 font, 9x9 pixel arrows (two hand-made bodies turned by exact quarter turns, outlined, top-left highlight) and 9x9 button coins; row height 11 art px x scale k; k is the smallest whole number >= `view.h / 180` that makes 7 x k x (CSS px per view px) >= 10.
- HD views: font `max(10.5 / cssScale, 3.2 % of the view height)` view px; rows 1.75 x font; rounded panels; vector arrows with a dark outline and a light gradient.
- Column: at the preferred side, below every `uiRects()` box it would touch, at most 62 % of the view height; the callout slot on top has a fixed size (the widest move name), so rows never shift when a callout comes or goes.
- Clear of the player: per side the rows that fit between the HUD and the player (plus a margin of 0.3 rows, the player's box stretched over where it will be in 6 steps) are shown; the visible row count glides by a quarter row per step; the column fades out (5 steps), changes side and fades in (6 steps), stays at least 45 steps, and hides when neither side has room for the callout.
- New row: fades in on top while the others glide down one row over 5 steps; the row pushed past the last slot fades out.
- Callout: slides in 0.8 rows from its screen edge over 6 steps, stays >= 80 steps (TOO SLOW 50), fades over 12; a newer callout crossfades it after >= 20 steps.
- Move list: the side opposite the column, below the HUD; moves only while faded out; the fired move's line glows gold for 75 steps.

## 6. Common mistakes (symptom -> fix)

- A rolled 360 jumps instead (up starts the jump before the roll ends) -> keep the jump start open while `mi.jumpHold()` > 0 (non-zero only while the stick rolls; plain jumps unchanged).

- Nothing ever fires -> the step's input has no `up` / `down` (the game never read them) or the button field name in `buttons` differs from the input object -> map the keys, check the field.
- Back motions (214, [4]6) fire the wrong way in a platformer -> the hero turns with every left / right but the module reads the old facing -> `turnWithInput: 'on'` (and prefer moves that end forward).
- A special also swings the normal attack -> the game uses its raw input instead of the value `step()` returned.
- `?auto=1` ends differently -> the autopilot's input went through `step()` with specials on -> `{fire: false}` while the autopilot plays.
- Specials during attacks are lost -> no `canAct()` / `onSpecial` returns true while busy -> return `false` (or `canAct()` false) so the busy buffer retries.
- The display covers the hero -> `avoid()` returns world coordinates without the camera, or nothing.
- Display text is tiny on phones -> `canvas` not passed (the module cannot measure CSS size).
- Walking forward then 236 + A gives the 623 move -> custom priorities that drop the "last direction held" rule; keep the defaults.

## 7. Acceptance moments

Demo (`demo/index.html`, 320x180 pixel look; `?look=hd` shows the same pixel world at a whole number of device pixels per art pixel with the smooth HD input display, callout, move list and HUD in a 640x360 view; a recorded input tape played through the same fixed step as live input). Both looks use the pixel-kit fighters with real poses; the fighters keep a 26 px pushbox, fireballs spawn in front of the caster and travel, the cross-up jump passes over the partner's head, shadows stay on the floor line. Each moment's `__state().event` (and the special, callout or facing listed) is checked by `checks/demo-check.py` from `checks/state.json`.

1. `?t=1300&freeze=1` — event **walk**: the hero walks with real walk frames; top row = the held right arrow with its count.
2. `?t=2200&freeze=1` — event **ember-wave**: `236B` -> EMBER WAVE callout (down, down-forward, forward + B), gold motion rows, the fireball in flight.
3. `?t=3500&freeze=1` — event **buffered**: `236B` typed during a slash's recovery fired from the busy buffer: callout tagged BUFFERED, the slash's A row below the motion, the fireball travelling.
4. `?t=5750&freeze=1` — event **rising-fang**: `623A` -> RISING FANG, the hero rises with the blade overhead and a crescent of light.
5. `?t=7820&freeze=1` — event **too-slow**: the same quarter circle with 14 steps per direction: red TOO SLOW callout, the normal spell comes out.
6. `?t=9400&freeze=1` — event **charge**: the back arrow row counting up (the charge).
7. `?t=9750&freeze=1` — event **gale-rush**: `[4]6A` -> GALE RUSH (held back arrow, forward + A), the dash with afterimages.
8. `?t=11600&freeze=1` — event **cross-up**: the jump arcs over the partner, feet above his head near the apex; the hero's shadow stays on the floor, narrower; the move list fades out of his way.
9. `?t=12300&freeze=1` — event **cross-up**: landed on the other side, the hero faces left; the move list's arrows are mirrored.
10. `?t=13100&freeze=1` — event **ember-left**: facing left, down, down-left, left + B = `236B`: mirrored arrows in the callout and move list, the fireball flies left.
11. `?t=14550&freeze=1` — event **ward-sigil**: facing left, the first fireball's physical motion (down, down-right, right + B) reads as `214B`: WARD SIGIL.
12. `?t=16700&freeze=1` — event **earthbreaker**: `360A` -> EARTHBREAKER (circle arrow + A); the slam's pixel shock wave (outlined rock slabs in 3 shades, chips, dust); the jump that up would start never starts.
13. `?t=18500&freeze=1` — event **no-false**: walking, a straight jump and plain attacks: rows for each, no special callout.

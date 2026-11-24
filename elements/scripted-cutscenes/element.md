# H-04 Scripted cutscenes

## What it is

A short scene played in the game's own world from a small script: the guard runs in from the gate, the traveller turns to him, lines type out under a speaker plate, a "?" pops over a head, the elder walks slowly out of her door, the camera glides north to the broken bridge and stops at the map edge, a quick fade cuts to a close-up. Letterbox bars slide in while the scene holds control, the HUD fades out. Every walking character uses its real walk frames, which advance with the distance it covers, and faces where it walks. Holding X fills a ring; at full the screen fades to black, every remaining step's end state is applied (positions, facings, game flags), and the picture fades back on exactly the state playing through would have reached. Control comes back exactly once, the camera glides back to the game's own camera first. Lines go through the game's own dialogue box when it has one.

## Default parameters

| key | default | meaning |
|---|---|---|
| bars | 0.09 | letterbox bar height as a share of the view (slides in / out over `barMs` 450 ms) |
| skip | hold | `hold` (hold the skip key `holdMs`), `press` (press twice within 2.2 s), `off` |
| holdMs | 700 | hold time to skip |
| textSpeed | 42 | typewriter chars per second (+160 ms after `. ! ?`, +70 ms after `, ; :`) |
| lineHold | 900 | under autoplay, a full line stays `lineHold + 18 ms x chars` (<= 1.6 s extra) |
| speed | 60 | default walk speed, world px / s (per actor `speed`, per move `speed`) |
| stride / frames / runStride | 6 / 2 / stride x 1.6 | world px per walk frame, frames per cycle: `frame = floor(walk / stride) % frames`; `run: true` moves use `runStride` and set `pose.run` (the demo: 4-frame walk at 5 px, 4-frame run at 8 px) |
| camMs / returnMs / fadeMs / emoteMs | 900 / 650 / 400 / 1100 | default glide, glide back at the end, fade, emote times |
| theme | night | box colours (`parchment`) |
| box | auto | `auto` = bottom unless the box would cover a character, then top |
| compact | auto | views under 300 CSS px tall (phones): bars <= 5.5 %, a 2-line box, a smaller plate: the scene keeps >= 65 % of the height |
| emotes | auto | `pixel` draws pixel-art bubbles on the world's pixel grid even under a smooth UI (pixel-art worlds) |
| pxFont | 1 | crisp text scale (the game's own pixel scale; the canvas scale keeps it readable) |
| render | auto | `pixel` when the view is <= 512 px wide (crisp bitmap font, integer positions), else `smooth` |

## Variants

- **Story RPG** (default): bars 9 %, hold X to skip, 42 chars/s.
- **Quick beats**: thin bars (8 %), press X twice to skip, 70 chars/s: short reveals in action games.
- **Storybook**: parchment box, wide bars, 30 chars/s.
- **Unskippable intro**: `skip: off` (keep it short).

## Interface

Needs: per scripted character `get()` (feet in world px, facing) and `set(pose)` (writes `x, y, face, angle, moving, walk, frame, target`); the map bounds; `camera()` = where the game's camera would be for the current positions; the view / stage rects in logical canvas px and `cssScale()`; `update(stepMs)` called first in the fixed step, every scene, also in the `?t=` replay; the world, the autopilot's movement and player input paused while `locked()`; `draw(ctx)` after the world and HUD, before the game's own dialogue box. Optional: the game's dialogue (`open(name, text, done)`, `isOpen()`, `close()`), `solid(x, y)` + `tile` for routing, `onCall(name)` for game-state changes, `onCue(name)` for sounds.

Provides: `play(script, {id, once})`, `locked()`, `onStart` / `onEnd` (once per scene, with `skipped`, final positions and calls), `camera()` while it drives the camera, `pose(id)`, `bars()` for the HUD fade, `skip()`, `seen()` / `load()`, `state()`, `lastDrawn()`, `stats()`, `rects()`.

Script commands: `move` (to / path / by, speed, final face), `face`, `say` (to = listener), `wait`, `cam` (actor, point, between two actors, `'game'`; zoom; ms 0 = cut; follow), `fade`, `emote` (`! ? ... heart note anger idea sweat`), `cue`, `call`, `bars`, `all` (branches run together).

## Screen rules

- Bars: `round(view.h x bars)` each, black, ease in-out over 450 ms; the skip hint sits inside the top bar (keycap + "Hold X to skip"; smooth: a ring fills around the key; pixel: a bar under the label fills).
- Walking: one heading per frame (a waypoint ends that frame's step), so the drawn facing always matches the frame's motion; the move ends exactly on its last point. Frames flip every `stride` px of distance (6 px +- one frame's step), 0 while standing.
- Camera: glides centre-to-centre with ease in-out; the actors a camera command frames (actor target, `between`, `frame: [ids]`) stay fully inside the view between the bars at every view size (the target moves the least needed); `ms: 0` cuts (pixel art: integer zoom only, cut under a fade). Clamped to the map at every zoom (when the map is smaller than the view, centred). Snapped to whole world px on pixel views. At the end it glides back to the game's camera (`returnMs`) before control returns, so the game's camera takes over without a jump.
- Line box (built-in): text >= 10 CSS px (smooth: `max(15 x view.h / 360, 10.6 / cssScale)` px, the box shrinks to its widest line; crisp: bitmap font at the game's own pixel scale, the game's canvas scale makes 8 px >= 10 CSS px). At most 2 lines shown (3 on crisp views that are not compact); longer pages scroll the typed text up over 140 ms. Pages are split from the text alone (<= 96 chars), never from the viewport, so timing is the same at any size. Name plate on the frame, a tail toward the speaker when on screen. Bottom unless the box (its height estimated when the line starts) would cover a character, then top (or the side that hides less); a box still on screen keeps its side: it never jumps between lines. Fades in 140 ms, out 160 ms.
- Emotes: a white bubble with a tail over the head, pop (scale 1.18 then 1 on HD; a 3 px rise on pixel views and with `emotes: 'pixel'`, where the bubble is pixel art at the world's pixel scale), 200 ms fade-out; follows the actor.
- Scene room: while a line box is shown, the bars + box + plate leave >= 65 % of the view height to the scene (compact mode on phones).
- Skip: 160 ms to black, end state applied, 260 ms back; the bars then slide out.

## Common mistakes

| symptom | fix |
|---|---|
| The hero slides or jitters during a scene; it ends somewhere else | the autopilot (or the player's input) still moves or snaps the hero while `locked()`: give it no movement input while locked (it may still close the game's dialogue) |
| `?auto=1` ends differently from before | the world ran a frame while locked: call `update()` first in the step and decide "paused" from `locked()` after it; stop counters the autopilot times itself by (frame counters) while locked; put actors back where the game expects them |
| Camera jumps when control returns | `camera()` returns a stale stored value; run the follow rule for the current positions |
| Lines never advance / the scene hangs on a line | the game's dialogue box was given but `open` never calls `done` (or `isOpen` stays true); with the built-in box, Z goes to `input('ok')` and autoplay sets `auto()` |
| Actors walk on the spot or the wrong frame shows | the game draws its own walk counter: set it from `pose.walk` (distance), not from time |
| Text tiny on phones | `cssScale()` missing (defaults to 1): pass CSS px per canvas px |
| Scene plays again on every visit / after load | `play(.., {id, once: true})`; save `seen()` and `load()` it |
| Pause menu runs the scene behind it | `update(0)` while a pause menu or inventory is open over a scene |

## Acceptance moments

| # | still | event it must show (`checks/state.json`, verified by `checks/shoot.py`) |
|---|---|---|
| 1 | HD `?t=3300&freeze=1` | `start bridge`: bars sliding in (0.5-1), HUD fading, a pixel "!" bubble over the traveller |
| 2 | HD `?t=5200&freeze=1` | after `emote hero !`: the captain (helmet, plume, spear) running in on his 4-frame run cycle, leaning, facing left (his path), the camera gliding once to frame both |
| 3 | HD `?t=8500&freeze=1` | `line guard`: typewriter line, speaker plate, tail at the captain; the two face each other |
| 4 | HD `?t=11300&freeze=1` | `emote hero ?` while the traveller's reply types |
| 5 | HD `?t=13500&freeze=1` | the elder walking out of her door, slower, facing down her path |
| 6 | HD `?t=22600&freeze=1` | the camera tilting north while the three turn, one after another, to face the river |
| 7 | HD `?t=25500&freeze=1` | `line guard: See the gap?` with the camera at the bridge, clamped at the map's top edge (camera y = 0) |
| 8 | HD `?t=29300&freeze=1` | `emote hero idea` in a 2x close-up after a fade cut (zoom 2) |
| 9 | HD `?t=39580&freeze=1` | `skip-hold ford`: captain and traveller walking along the bank; the skip ring filling |
| 10 | HD `?t=40330&freeze=1` | `end ford skipped`: final state (captain at the ford, `ford-open` flag once, objective "Cross the ford"), control back, bars sliding away |
| 11 | pixel `?look=pixel&t=8500&freeze=1` | `line guard` in the crisp bitmap box |
| 12 | pixel `?look=pixel&t=16500&freeze=1` | `line elder`: she faces the traveller, he and the captain face her |
| 13 | pixel `?look=pixel&t=39580&freeze=1` | `skip-hold ford`: keycap and fill bar in the top bar |

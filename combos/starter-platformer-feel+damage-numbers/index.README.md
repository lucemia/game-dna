# B-08 starter: Lantern Ascent (platformer movement feel)

`index.html` is a complete single-file side-view platformer built on `module/platformer-feel.js` v1.0, pasted in unchanged (the backdrops come from the I-02 module `parallax-layers.js`, also pasted unchanged). A lamplighter climbs four single-screen rooms of an old ridge, picks up moon gems, avoids thorns and shell beetles and relights the beacon at the top. All art is original procedural pixel art at 256x224, integer-scaled; the UI is English.

- **Rooms:** Mossy Gate (planks, a thorn pit, a beetle: teaches jump, coyote, stomp), Thorn Hollow (a wide thorn pit: jump, dash at the top, a dash crystal refills it, dash again), Echo Shaft (a 3-tile shaft: wall jumps to the top, a heart inside), Beacon Steps (planks up, a dash crystal, a diagonal dash to the beacon ledge). Each room is left through its right edge; a short fade separates them.
- **Movement** is entirely the module's (preset `tight` by default): hold jump for height, tap for a hop, coyote time, jump buffer, apex hang, dash with arrows (refills on landing, on a crystal or on a stomp), wall slide and wall jump, one-way planks (down + Z drops through), corner and ledge correction. The hero sprite squashes and stretches with `pf.squash()`; dash after-images use the hero's own shape.
- **Hazards:** thorns and falling out cost a heart and restart the room; a beetle touched from the side costs a heart with knockback (`pf.knock`) and 1.5 s of blinking; landing on a beetle defeats it and bounces (`pf.bounce`). Three hearts; 0 = THE LANTERN GOES OUT. Lighting the beacon wins (the preset, time, gems and the module's move counters are shown). The page scales the 256x224 canvas by a whole number of device pixels (x4 device = 341 CSS px on a 390 px, dpr 3 phone).
- **URL flags:**
  - `?auto=1` plays the whole game by itself: a closed-loop route per room that reads the body's state every frame, so it finishes with **every preset** (tight 14.3 s, floaty 21.1 s, heavy 18.8 s, raw 14.8 s of play), including one coyote jump, one buffered jump, a stomp in each of the first two rooms, dashes and wall jumps.
  - `?t=<ms>&freeze=1` replays that many 60 Hz frames deterministically (autoplay unless `&auto=0`) and draws once; `<html data-state>` then holds `{scene, room, hearts, gems, hits, hero, beetles, moves}` (`window.__lantern()` gives the same at any time).
  - `?preset=tight|floaty|heavy|raw`, `?dash=eight|four|off`, `?wall=on|off`, `?room=1..4`, `?overlay=1` (the module's feel overlay), `?mute=1`, `?trace=1` (autoplay route log in the state).
- **Input:** arrows / WASD, Z / Space / C jump, X / Shift dash, V overlay, P autoplay, R restart; a touch pad on touch screens. Every press is latched until the next step, so a 0 ms tap still jumps or dashes. Any movement key takes over from autoplay.

## Structure

`<script>` blocks in order: an error catcher, the module (verbatim), the parallax module (verbatim), the game, the **ADDONS SLOT** (empty, marked) and the boot script. The game script has numbered sections (search for `=== n.`):

| # | section | what is in it |
|---|---|---|
| 1 | CONFIG & ROOMS | URL flags, `ROOMS` (16x13 strings: `#` rock, `-` plank, `^` thorns, `o` gem, `c` crystal, `b` beetle, `h` heart, `S` entry, `G` beacon) |
| 2 | ART | hero poses, beetle, gem, crystal, beacon, the per-room tile layer `buildRoomLayer`, 5x7 font `text`, windows `frame` / `plate` |
| 3 | GAME OBJECT | `GAME` (= `window.GAME`): the extension points below |
| 4 | PLATFORMER WIRING | `GameDNA_Platformer.create(...)`: `tileAtRoom` (rock solid, planks one-way, the right edge open), body 10x18, preset, `drawGhost`, `onEvent` |
| 5 | HIT SITE | `applyHit(ev)` |
| 6 | RULES | `newGame`, `enterRoom`, `updatePlay` (pickups, crystals, beetles, thorns, falling, exits, the beacon), `hurtHero` |
| 7 | AUTOPLAY | `ROUTES` (per room: `go`, `jump`, `ledge`, `climb`, `stomp`) and the controller `auto.input()` |
| 8 | INPUT | key chain, held + latched actions, touch pad |
| 9 | UPDATE & DRAW | `step()` (gate -> input -> module -> rules -> addons) and `draw()` |
| 10 | BOOT | after the ADDONS slot: art, `?t=` fast-forward, main loop |

## Extension points

**Where addons go: the ADDONS SLOT.** Paste each addon's module and its registration into the marked `<script>` block (or put `<script src>` tags there). It runs after `window.GAME` exists and before boot, so addons see the title, `onStart` and every `?t=&freeze=1` frame. An addon is a plain object; every hook is optional:

```js
GAME.addons.push({
  gate(game) { return true; },          // (7) FIRST in every step; false = hold the whole world this step (hit-stop)
  update(game, { dt, frozen }) {},      // every 60 Hz step, also held ones; dt in ms (16.67 or 0)
  onHit(ev, game) {},                   // (1)
  onMove(name, info, game) {},          // (8) jump / land / dash / wallJump / corner / ledge / drop ... from the module
  drawBegin(ctx, game) {}, drawEnd(ctx, game) {},   // (2) wrap the play field (backdrop, tiles, sprites, effects)
  draw(ctx, layer, game) {},            // (2) 'world' | 'post' | 'ui'
  sprite(ctx, id, rect, next, game) {}, // (2) wraps each sprite draw; call next() to draw it
  onKey(e, down, game) {},              // (5) first in the input chain; return true to consume
  onPhase(phase, game) {}, onStart(game) {}, onRoom(index, game) {}, onPickup(kind, game) {}   // (7)
});
GAME.builtinNumbers = false;   // when your addon draws its own numbers
GAME.builtinShake = false;     // when your addon owns hit-stop, shake and flash
```

1. **Hit site: `applyHit(ev)`, also `GAME.applyHit(ev)` and `GAME.hit(target, amount, kind, source)`.** Every heart change and every beetle defeat goes through it.
   - `ev = {source, target ('hero' | 'beetle-N'), amount (>= 0, the real change), kind ('damage' | 'heal'), cause ('thorns' | 'fall' | 'beetle' | 'stomp' | 'heart'), dir (1 / -1), killed, hpBefore, hpAfter, max, anchor, frame}`; `anchor = GAME.anchorOf(target)`.
   - Order: apply, built-in feedback when `GAME.builtinShake` (hit-stop 80 ms on the hero or a kill, 50 ms otherwise; shake 3 / 2 px; red flash on the hero), the built-in `-1` / `+1` pop when `GAME.builtinNumbers`, then each addon's `onHit` in push order.
   - Helpers: `GAME.hitStop(ms)`, `GAME.shake(px, ms)` (field only), `GAME.flash(color, ms, alpha)` (field only).
2. **Drawing.** `draw()` runs: `drawBegin(ctx)` hooks -> (built-in shake translate) backdrop, room tiles, items, beetles, the module's dust, the hero, the feel overlay (when on), `draw(ctx, 'world')` -> `drawEnd(ctx)` hooks (reverse of a begin's save) -> `draw(ctx, 'post')` -> built-in flash and room fade -> HUD and banner -> end window -> `draw(ctx, 'ui')`. Every beetle and the hero are drawn through `sprite(ctx, id, rect, next, game)` hooks (`rect` = the drawn sprite box in screen px; ids `hero`, `beetle-N`). The context is the native 256x224 buffer; world -> screen = `(x - GAME.cam.x, y - GAME.cam.y)` with `GAME.cam = {x: 0, y: -16}` (the rooms are single-screen, the map starts below the 16 px HUD band).
3. **UI rects: `GAME.uiRects()`.** `[{name, x, y, w, h}]` in native px: `hud` (0, 0, 256, 16), `banner` (the room name while shown), `end`, `feel` (the overlay panels while shown), plus every rect an addon registered with `GAME.setUIRect(name, rect)` (`null` removes it). `GAME.field` = the play field below the HUD.
4. **Anchors: `GAME.anchorOf(id)`.** `{x (centre), top, w, h, footY}` in screen px of the drawn sprite: `'hero'` (16x22, follows squash only by its foot) and `'beetle-N'`. `GAME.units()` lists the living ones.
5. **Input chain.** keydown: addons' `onKey(e, true, game)` (true stops it), then the game keys (arrows / WASD, Z / Space / C / Enter, X / Shift, V, P, R). keyup: addons, then the game. The touch pad feeds the same held + latched actions.
6. **Autoplay (`?auto=1`, P).** `autoInput()` returns the same input object a person produces (held keys plus `jumpPressed` / `dashPressed`), so it goes through the module like a person. Deterministic: same frames, same run.
7. **Clock, gate and phases.** `step()`: first every addon's `gate(game)`; if one returns false (or the built-in hit-stop runs) the step is held: nothing moves, no input is read (latched presses wait), `update(game, {dt: 0, frozen: true})` still runs. `GAME.frame`, `GAME.frozen`, `GAME.phase` (title, play, win, lose); `onPhase` on every change, `onStart` on a new game or restart, `onRoom(index)` on each room entry, `onPickup('gem' | 'heart')`.
8. **The module instance: `GAME.pf`.** Read `x`, `y`, `vx`, `vy`, `onGround`, `pose`, `windows()`, `stats()`, `predict()`; `setParams({...})` retunes live (`{preset: 'floaty'}`); `onMove` receives its events. Do not move the hero from an addon except through `pf.knock` / `pf.bounce` / `pf.teleport`.

## Changing the game

- **Rooms:** edit `ROOMS` (16x13; the entry `S` on the left, an opening in the right wall rows 8-9 as the exit) and add a route to `ROUTES` (`['go', x]`, `['jump', x, {hold, dash, dashAt, dash2, until, buffer}]`, `['ledge', x]`, `['climb', x, {top}]`, `['stomp', 'beetle-N']`).
- **Feel:** `preset` and `params` in section 4, or `?preset=`.
- **Hazards:** thorn box and beetle speed in `updatePlay`, damage and knockback in `hurtHero`.

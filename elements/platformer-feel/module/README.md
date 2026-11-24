# platformer-feel.js (B-08, module v1.0)

One plain script, no dependencies, no `import`/`export`. It defines one global, `window.GameDNA_Platformer`, and works pasted into a `<script>` tag or loaded with `<script src>`. Include it verbatim.

It owns **one side-view body's movement and its collision against the game's tile map**:

- run with separate ground acceleration, deceleration and turn-around rates, and separate air control;
- jump with a designer height and time-to-apex (gravity and take-off speed are derived), **variable height** (release to cut, after a minimum time), **coyote time** (jump a few frames after leaving a ledge), **jump buffering** (a press shortly before landing still jumps), **apex hang** (less gravity near the top while the button is held), heavier fall gravity and a **terminal fall speed**;
- a **dash** (8 or 4 directions, fixed speed and time, cooldown, refilled on landing or by `refillDash()`), cancelled by a jump;
- **wall slide** (capped fall speed while pushing into a wall) and **wall jump** (away from the wall, with a short input lock);
- **one-way platforms** (land from above, pass from below, drop through with down + jump);
- **corner correction**: a head that clips a ceiling corner by up to `corner` px slides around it; feet that clip a ledge lip by up to `ledge` px are lifted onto it;
- **sub-pixel positions**: the body moves one whole pixel at a time (it can never tunnel through a tile at any speed) and keeps the fractional remainder, so `x` and `y` are always integers to draw at.

It also draws, only if you call it: dust and dash after-images (`drawFx`), a stand-in hero (`drawBody`) and the **feel overlay** (`drawOverlay`: jump trail and markers, predicted arcs, hitbox, coyote / buffer / dash windows, velocity graph), through `GameDNA_Skin` when `skin-api.js` is loaded, else a built-in pixel16 look. Movement never depends on drawing or on the skin.

The game keeps its own hero sprite, enemies, hazards, camera, HUD and rules. Each fixed step it feeds input, calls `update()`, then reads `x`, `y`, `vx`, `vy`, `onGround`, `facing`, `pose`.

## Create

`GameDNA_Platformer.create(options)` returns an instance.

| option | meaning |
|---|---|
| `tile` | tile size in px (default 16) |
| `tileAt(tx, ty)` | **required**. What is at a tile: `'solid'` (or `true`, `1`, `'#'`), `'oneway'` (or `2`, `'-'`), anything else = empty. Called for any integer tile, also outside the map: return `'solid'` for walls you want there. Hazards (spikes, water) are empty to the module; the game checks them |
| `solidAt(tx, ty)` | alternative to `tileAt` returning true / false (no one-way tiles) |
| `cols`, `rows`, `edges` | optional bounds: outside `cols` the sides are solid, above / below `rows` empty (falls out), unless `edges: {left, right, top, bottom: 'solid' \| 'empty'}` says otherwise |
| `body` | `{w, h}` hitbox in px (default 10 x 14). Keep it a little narrower than the sprite |
| `x`, `y` | start position: the hitbox's top-left in world px |
| `preset` | `'tight'` (default), `'floaty'`, `'heavy'`, `'raw'` (no assists: no coyote, buffer, apex hang, cut or corner correction) |
| `params` | overrides on top of the preset (table below) |
| `keys` | `{KeyboardEvent.code: 'left' \| 'right' \| 'up' \| 'down' \| 'jump' \| 'dash'}` for `key()`; default arrows / WASD, Z / Space / C jump, X / Shift dash |
| `onEvent(name, info)` | movement events (below); `info` always has `x, y` (feet centre, world px) and `frame` |
| `skin`, `seed` | skin id for the overlay; seed for the dust particles (visual only) |
| `uiRects`, `view` | screen rects the overlay panels avoid; the screen area they sit in |
| `drawGhost(ctx, x, y, alpha, g)` | draw your own dash after-image (x, y = hitbox top-left, screen px; `g.f` facing) |
| `fx: false` | no particles |

## Parameters (`params`, `setParams`, presets)

| key | tight | meaning |
|---|---|---|
| `runSpeed` | 96 | top run speed, px/s |
| `groundAccel` / `groundDecel` / `turnAccel` | 1100 / 1500 / 2200 | px/s² speeding up, stopping, reversing on the ground |
| `airAccel` / `airDecel` | 760 / 260 | the same in the air (decel = no input) |
| `jumpHeight`, `jumpApexMs` | 44, 330 | full-hold jump height (px, about 2 px less in practice) and time to reach it; gravity = 2h/t², take-off = 2h/t |
| `jumpCut`, `minJumpMs` | 0.45, 50 | releasing jump while rising multiplies the speed by `jumpCut` once, not before `minJumpMs` (a 0 ms tap = a short hop, about 18 px) |
| `apexBand`, `apexGravity` | 36, 0.5 | while \|vy\| < band and jump is held, gravity × apexGravity |
| `fallMult`, `maxFall` | 1.7, 300 | gravity × fallMult when falling; terminal speed px/s |
| `coyoteMs`, `bufferMs` | 100, 120 | the two forgiveness windows |
| `dash` | `'eight'` | `'eight'`, `'four'`, `'off'` |
| `dashSpeed`, `dashMs`, `dashCooldownMs`, `dashCount` | 270, 150, 250, 1 | dash speed, length, cooldown after it ends, dashes per landing |
| `wall` | `'on'` | `'on'` / `'off'` (wall slide and wall jump) |
| `wallSlide`, `wallJumpX`, `wallJumpLockMs` | 60, 120, 140 | slide speed cap, push away, time the push ignores input toward the wall |
| `corner`, `ledge` | 4, 4 | corner correction px for ceilings and for ledge lips |
| `drop` | `'downjump'` | drop through one-way tiles with down + jump, or `'down'` alone |

floaty: higher, slower (52 px over 470 ms), soft acceleration, long windows. heavy: low, fast fall (×2.3), sharp stops, short windows. raw: like tight but with every assist off, for comparison.

## Every step

| member | |
|---|---|
| `setInput({left, right, up, down, jump, dash, jumpPressed, dashPressed})` | the input for the next `update()`, held booleans plus the game's own latched presses. A rising edge of `jump` / `dash` also counts as a press. Kept until replaced; `setInput(null)` clears |
| `key(code, down)`, `press(name)`, `release(name)` | the same from key events: a press is **latched until the next `update()`**, so a key pressed and released between two steps (a 0 ms tap) still jumps once. Returns true if the code is one of its keys (it never calls `preventDefault`) |
| `update(dtMs)` | one fixed 1/60 s step (`dtMs` is ignored except `0` = a frozen step: nothing moves, presses stay latched). Call it from the step that `?t=` fast-forward and autoplay also run |
| `x`, `y` | hitbox top-left, **whole px** (draw here); `fx`, `fy` with the sub-pixel remainder |
| `vx`, `vy`, `onGround`, `facing` (1 / -1), `dashing`, `dashesLeft`, `wall` (-1 / 0 / 1 while sliding), `sliding`, `pose` | read-only after `update`; `pose` = `idle run jump apex fall land dash wallslide hurt` |
| `events()` | the events of the last update `[{name, info}]` |

## Events (`onEvent`)

`jump` {kind: `ground` \| `coyote` \| `buffered` \| `wall`, ms}, `cut`, `apex` {height}, `land` {vy, air}, `dash` {dx, dy}, `dashEnd`, `dashDenied`, `refill`, `wallSlide` {side}, `wallJump` {side}, `corner` {dx}, `ledge` {dy}, `drop`, `bonk` (head hit a ceiling), `skid`.

## Game actions

| member | |
|---|---|
| `teleport(x, y, keepVel)` | move the body (respawn, room change, door); clears the trail |
| `reset(x, y, {facing})` | teleport and clear velocity, timers, held keys and effects |
| `knock(vx, vy, ms)` | knockback: set velocity and ignore input for `ms` (pose `hurt`) |
| `bounce(h)` | jump off an enemy's head (h px, default 60 % of jumpHeight); refills the dash |
| `setVelocity(vx, vy)`, `setFacing(f)`, `refillDash()` (true if it refilled), `setSize(w, h)` (false if it would not fit) | |
| `releaseAll()` | forget held keys and latches (pause menus, scene changes) |
| `setParams(p)`, `params()` | live tuning (`{preset: 'heavy'}` loads a preset first); `params()` adds the derived `gravity` and `jumpSpeed` |

## Reading and drawing

| member | |
|---|---|
| `rect()`, `anchor(camX, camY)` | hitbox in world px; `{x (centre), top, w, h, footY}` in screen px |
| `collides(x, y, w, h)`, `tileKind(tx, ty)` | the module's own collision test (world px), tile kind 0 / 1 / 2 |
| `windows()`, `squash()` | `{coyoteMs, coyoteMax, bufferMs, bufferMax, dashes, dashCooldownMs}`; `{sx, sy}` for squash and stretch of your sprite (about 0.8-1.3) |
| `predict({dir, hold, frames, jump})` | the arc a jump would take from here (pure: nothing moves): `[{x, y, ground}]` feet points; `.events` lists the movement events the arc would fire (`ledge`, `corner`, `bonk`, `land`...) |
| `stats()` | counters: `jumps, groundJumps, coyoteJumps, bufferedJumps, wallJumps, cuts, landings, dashes, refills, corners, ledges, drops, bonks, embedded (steps that began inside a solid tile: should stay 0), maxStepPx, teleports` |
| `drawFx(ctx, camX, camY)` | dust on jump / land / skid, dash after-images and sparks. After your sprites, inside any shake |
| `drawBody(ctx, camX, camY, {colors})` | a 12 x 16 stand-in hero with poses and squash (prototypes) |
| `drawOverlay(ctx, camX, camY, {trail, predict, hitbox, panels, at, view, uiRects})` | the feel overlay; `getUIRects()` returns its panel rect from the last draw |

`camX`, `camY` = the world px at the screen's top-left (screen = world − cam). A game with a HUD band of `OY` px above the map passes `camY = -OY`.

## Integration (15 lines, generic names)

```js
const pf = GameDNA_Platformer.create({ tile: TILE, body: { w: 10, h: 14 }, x: hero.x, y: hero.y, preset: 'tight',
  tileAt: (tx, ty) => tx < 0 || tx >= MAP_W ? 'solid' : isWall(tx, ty) ? 'solid' : isPlank(tx, ty) ? 'oneway' : null,
  params: { runSpeed: 96, jumpHeight: 40 },                      // from the game's old numbers: px/frame x 60 = px/s
  onEvent: (name, info) => { if (name === 'jump') playSound('jump'); } });
function step() {                                                 // the fixed 60 Hz step (also ?t= fast-forward and autoplay)
  const inp = autoplay ? autoInput() : readInput();               // the game's own input object, unchanged
  pf.setInput({ left: inp.left, right: inp.right, jump: inp.jumpHeld, jumpPressed: inp.jump, dash: inp.dash });
  pf.update();
  hero.x = pf.x; hero.y = pf.y; hero.vx = pf.vx / 60; hero.vy = pf.vy / 60; hero.onGround = pf.onGround; hero.facing = pf.facing;
  /* ...the rest of the old hero update (attacks, timers, hazards) stays... */
}
function hurt(fromX) { pf.knock(hero.x < fromX ? -130 : 130, -150, 200); }      // knockback goes through the module
function respawn(x, y) { pf.reset(x, y); }
function render() { drawHeroSprite(pf.x - camX, pf.y - camY); pf.drawFx(ctx, camX, camY); }
```

Keep the game's own fields (`hero.x`, `onGround`…) updated from the module every step, because enemies, pickups, the camera and the autopilot read them; convert velocities back to the game's units if they read those too.

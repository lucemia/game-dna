# N-05 starter: Meadowlark Cup (arcade kart racer, 3D)

`index.html` is a complete single-file kart racing game built on `module/kart-racer-3d.js` (pasted in unchanged) and
three.js 0.149.0 (`three.min.js`, keep it next to `index.html`). Six racers, a cup of two three-lap races (Meadow Ring,
Sunstone Canyon), points 10-8-6-5-4-3, a results screen after each race and the final standings. Everything is
procedural (primitives, code-drawn textures). English UI, no external assets besides three.js.

Build your game from this file and plug addons and new content into the extension points below rather than editing the
module or the game script.

## Run

| URL / key | Effect |
|---|---|
| `?auto=1` | autoplay: the player's kart is driven by the module's AI through the whole cup (about 81 s of game time) |
| `?t=<ms>&freeze=1` | fast-forward the deterministic 60 Hz simulation (autoplay on unless `&auto=0`), render one frame, set `window.__frozen = true`; `<html data-state>` holds `{phase, race, t}` |
| `?seed=n`, `?laps=n`, `?race=n` (start at cup race n, 0-based; out of range clamps to the last race, so `?race=2` is the third race only once a third track was added), `?shadows=soft\|hard\|off`, `?dpr=1..3`, `?touch=1` | |
| Up / W | gas (touch: always on) |
| Down / S | brake, reverse |
| Left / Right, A / D | steer |
| Space / Shift / K | drift: hold while steering through a turn, release for a boost (blue, orange, pink sparks = level 1-3) |
| Enter / Z | start, continue |
| P | toggle autoplay (any drive key takes over) |
| Esc | pause |
| touch | `<` `>` bottom-left, BRAKE and DRIFT bottom-right; `GAME.virtualKey(key, down)` for your own buttons (`gas brake left right drift ok`) |

Holding gas in the last 0.6 s of the countdown (not earlier) gives a rocket start. Without WebGL the page draws a
readable message instead of the game and never throws.

## Structure

Scripts in order: `three.min.js`, **`GameDNA_KartRacer3D`** (the module, verbatim), the game (defines `window.GAME`),
the **ADDONS SLOT**, then `GAME.boot()`.

| # | Section | What is there |
|---|---|---|
| 1 | Config and content | `OPT` (URL flags), `POINTS`, `TEXT`, `TRACKS` (the cup, in order), `ROSTER` (the grid; entry 0 is the player) |
| 2 | Game object | `game` = `window.GAME`, `each(hook)` (calls addons), `toast`, `addTrack`, `addKart` |
| 3 | World | the module instance `GAME.KR`, `GAME.three`, `karts()`, `anchor`, `worldToScreen`, `track()` |
| 4 | Events and the cup | module events -> addon hooks; `startRace(i)`, `scoreRace()`, `table()`, `nextRace()` |
| 5 | Autoplay | `GAME.autoplay.decide` or the module's AI driver |
| 6 | Input | key map, touch buttons, the input chain (`onKey`) |
| 7 | Main step | `step()` (60 Hz: keys, gates, phase timers, `KR.step`, addons' `onStep`) |
| 8 | Drawing | `KR.render()` (3D), then the 2D overlay: addon layer `world`, the race HUD (`KR.drawHud`), intro card, results, touch buttons, toasts, addon layers `hud`, `overlay` |
| 9 | Boot | `window.__state`, `window.__advance(ms)`, `GAME.boot()` (fast-forward, main loop), `GAME.shipped` |

Phases: `title -> intro (track card, grid camera) -> race (module: countdown -> race -> finished) -> results -> intro
(next race) ... -> cup (final standings) -> title`.

## Extension points

**Where addons go: the ADDONS SLOT.** Put each addon module there (`<script src>` or pasted unchanged) and register it
with `GAME.addons.push({...})`. The slot runs after `window.GAME` and the 3D world exist and **before the game boots**,
so addons see every `?t=&freeze=1` frame. Every hook is optional:

```js
GAME.addons.push({
  name: 'my-addon',
  init(game) {},                        // once at boot: add 3D objects to game.three.scene (rebuilt per race: use onRaceSetup)
  gate(game) { return true; },          // first in every step; return false = hold the world this step
  onKey(key, game) { return false; },   // gas brake left right drift ok pause auto; true = consumed
  onStep(info, game) {},                // after each 60 Hz world step: {dt (s), t (ms), frame}
  update(info, game) {},                // every frame incl. title / results: {dt (ms, 0 while held), frozen, paused, t}
  draw(g, layer, game) {},              // 2D overlay context in CSS px; layer 'world' | 'hud' | 'overlay'
  onEvent(ev, game) {},                 // every module event (see module README "Events")
  onRaceSetup(trackDef, game) {}, onRaceStart(ev, game) {}, onCheckpoint(ev, game) {}, onLap(ev, game) {},
  onBoost(ev, game) {}, onDrift(ev, game) {}, onJump(ev, game) {}, onHit(ev, game) {},   // onHit: bump {a, b} or wall {kart}
  onFinish(ev, game) {}, onRaceEnd(ev, game) {}, onResults(rows, game) {}, onPhase(phase, game) {}, onEnd(result, game) {}
});
```

1. **New tracks: `GAME.addTrack(def)`** appends a track to the cup (raced after the built-in ones, also under `?auto=1`).
   Format in the module README "Tracks" (`{id, name, palette, width, points, ramps, pads, scenery, laps}`). Check it first:
   `GameDNA_KartRacer3D.checkTrack(def)` must return `[]` (addTrack logs any problem as a warning).
2. **New racers: `GAME.addKart(def)`** adds a kart to the grid of every race (8 at most): `{id, name, body, accent, suit,
   helmet, stripe, number, speed, accel, grip}`; colours as numbers (`0x4a8a3a`) or `'#4a8a3a'`; stats 0.9 - 1.1.
   AI karts are driven by the module.
3. **3D scene: `GAME.three = {THREE, scene, camera, renderer}`** (null without WebGL). Units are metres, +Y up, the
   ground is y = 0; `GAME.KR.groundY(x, z)` gives ramp heights. The track is rebuilt per race (`onRaceSetup`).
4. **Karts: `GAME.karts()`** -> module karts `{id, name, x, y, z, h, vx, vz, speed, lap, next, place, lapTimes, bestLap,
   finished, drift, driftCharge, boostT, air, player, mdl: {root, body, ...}}`; the player is `'player'`. Read only;
   steer only through input. Facing rule for anything you add: `yaw = Math.atan2(v.x, v.z) + GameDNA_KartRacer3D.FACING_OFFSET`.
5. **Anchors (world -> screen): `GAME.anchor(id)`** -> `{x, y (top), footX, footY, cx, cy, w, h, depth, visible}` in CSS
   px of the canvas; `GAME.worldToScreen(x, y, z)` -> `{x, y, depth, visible}`. Valid after the 3D render (inside `draw`).
6. **2D overlay: `draw(g, layer, game)`**: `'world'` right after the 3D render, before the HUD; `'hud'` after the HUD,
   panels and toasts; `'overlay'` last. **`GAME.uiRects()`** -> `[{name, x, y, w, h}]` (place, lap, clock, splits,
   minimap, speed, drift meter, banners, intro card, results panel, toasts, touch buttons) as drawn this frame: keep clear.
   `GAME.flags.builtinHud = false` hides the race HUD and panels; `GAME.flags.builtinToasts = false` stops the starter's
   own toasts (rocket start, best lap).
7. **Toasts: `GAME.toast(text, ms, color)`** (top centre; under the HUD on phones).
8. **Input chain.** Keys are queued as `gas brake left right drift ok pause auto`; each goes to the addons' `onKey` in
   order, first `true` consumes it. `GAME.held` is the held state; `GAME.virtualKey(key, down)` presses one.
9. **Autoplay.** `GAME.autoplay.on`, `GAME.setAuto(on)`. Replace the driver with `GAME.autoplay.decide = game =>
   ({steer, throttle, brake, drift}) | null` (null = the module's AI); `GAME.KR.autoInput('player')` is what the AI would press.
10. **Clock and phases.** Fixed 60 Hz; `GAME.time` (ms), `GAME.frame`, `GAME.worldFrame`, `GAME.clock.paused`;
    `GAME.phase` (`title intro race results cup`), `GAME.KR.race.phase` (`grid countdown race finished`), `GAME.raceIndex`.
11. **Cup data.** `GAME.tracks`, `GAME.roster`, `GAME.POINTS`, `GAME.standings`, `GAME.table()`, `GAME.lastResults`,
    `GAME.cupResults`. `GAME.shipped = {tracks, karts}` = the ids the starter ships with (recorded before the ADDONS SLOT).
12. **State for checks: `window.__state()`** -> the module state (`{t, phase, raceMs, actors: [{id, x, z, yaw, moveDir,
    forward, facesMove, feetY, lap, next, place, drifting, boost, airborne, ...}]}`) plus `phase` (game), `racePhase`,
    `race`, `races`, `standings`. `window.__advance(ms)` steps a frozen page and redraws (tests).

### Adding a track and a kart (reference)

```html
<script>
/* ADDONS SLOT */
GAME.addKart({ id: 'mossback', name: 'Mossback', body: '#4a8a3a', accent: '#e8d8a0', suit: '#3a2a20', helmet: '#e8d8a0', number: 7, speed: 1.02, accel: 0.98, grip: 1.0 });
GAME.addTrack({ id: 'frost', name: 'Frostbite Pass', palette: 'twilight', width: 13, laps: 3,
  points: [[0, -36], [0, 24], [14, 44], [38, 46], [52, 28], [40, 8], [42, -14], [56, -34], [40, -56], [16, -58]],
  ramps: [{ at: 0.1, len: 8, h: 1.2 }], pads: [{ at: 0.55, lat: 0 }], scenery: { seed: 5, trees: 110, rocks: 30, flowers: 20, clouds: 8 } });
</script>
```

`GameDNA_KartRacer3D.checkTrack(...)` returns `[]` for that track; with `?auto=1` the cup now has three races and the
seventh racer is on every grid.

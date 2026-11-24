# Add an arcade kart race (3D) to this game

Add a 3D kart racing mode to this browser game with the module `kart-racer-3d.js` (global `GameDNA_KartRacer3D`, API
in its README) and three.js 0.149.0 (`three.min.js`). Edit neither file.

## What the player gets

A 3-2-1-GO countdown, then a three-lap race against AI karts on a low-poly track: grip steering, a hop-drift that
charges a blue / orange / pink boost released on letting go, ramps, boost pads. A HUD shows place, lap, clock, lap splits, a minimap and a drift meter; laps
count only when every checkpoint was passed in order; at the finish your game shows the results.

## Steps

1. **Load** `three.min.js` (0.149.0) and then the module with plain `<script src>` tags, before your game script. Keep
   both files next to the page.
2. **Where the race lives.** Find the place where your game enters a mode or level, and add a race mode there (a menu
   entry, a level, a mini-game trigger). Give it its own WebGL canvas behind a 2D canvas, both filling the game area.
   Hide your 2D world while racing.
3. **Create once** after the canvas is sized: `race = GameDNA_KartRacer3D.create({canvas, params, onEvent})`. If
   `race.ok` is false, call `race.drawFallback()` and return to your game; never throw.
   Call `race.resize(cssWidth, cssHeight)` at start and on every resize.
4. **Start** with `race.startRace({track: 'meadow' | 'canyon' | yourTrackObject, karts: [{id: 'player', kart: 'rook',
   player: true}, {kart: 'wren'}, ...], laps: 3, seed})` and `race.countdown()`. Use a fixed seed per race. Map your characters to karts by giving each a kart object (`{name, body, accent, suit,
   helmet, number}`) if you want them racing.
5. **Your fixed update** (every step that advances the game, including any fast-forward or test path): build
   `{steer: right - left, throttle, brake, drift}` from your input (keys, pad, touch buttons; touch: throttle always on)
   and call `race.step(input, 1 / 60)` once per 60 Hz step. Your autoplay / demo mode: `race.setAI('player', true)`.
   Never move karts yourself.
6. **Your draw**: `race.render()`, then on the 2D canvas (scaled to CSS px) `race.drawHud(ctx, w, h, {touch})`, then
   your own UI. Keep your panels clear of `race.hudRects()`.
7. **Events** (`onEvent(ev)`): play your sounds or effects on `countdown`, `go`, `lap`, `boost`, `jump`, `bump`;
   on `raceEnd` (the player crossed the line) call `race.setCamera('orbit', {target: 'player'})`, wait about 3 s, then show
   `race.results()` (place, name, time; `est` = still racing, estimated) and award your game's prize or points once.
8. **Keep** your existing controls, saves, menus and autoplay working; the race must also finish under autoplay.

## Rules that matter

- Fixed 60 Hz steps; no `Math.random()` or wall-clock time in anything that feeds the race.
- The module draws the karts facing their velocity and with every wheel on the ground: do not rotate or lift karts.
- Custom tracks: a closed list of `[x, z]` points in metres, driven in order; `GameDNA_KartRacer3D.checkTrack(def)` must
  return `[]` before you use it.
- HUD text and your panels must not overlap; under 560 px wide the HUD switches to a phone layout by itself.

## Check before you finish

- A race starts with 3-2-1-GO, karts race three laps, the finish shows results, and your game continues afterwards.
- Driving backwards over the line or cutting across the grass never adds a lap.
- Holding drift through a corner shows sparks changing colour; releasing gives a flame boost.
- Autoplay finishes the race; no console errors; the page still works at 390 px wide.

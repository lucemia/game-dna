// Basket hint for N-05 kart-racer-3d: how to wire the module into an UNKNOWN game, by role, and the starter's extension points.
// Never name a host's functions here. {{key}} = parameter value chosen for this combo.
// (Coordinator: copy to tools/basket/kart-racer-3d.mjs.)
export default {
  stage: 'systems',
  does: 'Adds a 3D arcade kart race (three.js 0.149.0): a low-poly track from a closed list of points (road, kerbs, barriers, ramps, boost pads, start gantry with countdown lamps), karts with drivers whose wheels sit on the ground and that face their velocity, grip steering, a hop-drift that charges a three-level boost, jumps, boost pads, rocket starts, checkpoint gates that only count in order, AI racers on a racing line with rubber-banding, a 3-2-1-GO countdown, race clock, lap splits, places, minimap, drift meter and results. Seeded and fixed-step; an AI driver doubles as autoplay.',
  params: {
    track: 'the `track` of `startRace` (`\'{{track}}\'`)', laps: 'create `params.laps`', maxSpeed: 'create `params.maxSpeed`', grip: 'create `params.grip`', driftGrip: 'create `params.driftGrip`',
    turnRate: 'create `params.turnRate`', boostPower: 'create `params.boostPower`', rubberBand: 'create `params.rubberBand`', aiSkill: 'create `params.aiSkill`',
    camDist: 'create `params.camDist`', camHeight: 'create `params.camHeight`', fov: 'create `params.fov`', shadows: 'create `params.shadows`',
    palette: 'create `params.palette` (`track` = leave it out)', mode: 'demo only, ignore'
  },
  steps: [
    ['Load (once, in the page)',
      '`<script src="three.min.js">` (the pinned 0.149.0 copy shipped in the basket) and then the module `<script src>`, before your game script.'],
    ['Where your game enters a mode or level (a menu entry, a level, a mini-game trigger)',
      'Add a race mode with its own WebGL canvas behind a 2D canvas, both filling your game area; hide your 2D world while racing. Once: `race = GameDNA_KartRacer3D.create({canvas, params: {laps: {{laps}}, maxSpeed: {{maxSpeed}}, grip: {{grip}}, driftGrip: {{driftGrip}}, turnRate: {{turnRate}}, boostPower: {{boostPower}}, rubberBand: {{rubberBand}}, aiSkill: {{aiSkill}}, camDist: {{camDist}}, camHeight: {{camHeight}}, fov: {{fov}}, shadows: \'{{shadows}}\'}, onEvent})`; if `!race.ok` call `race.drawFallback()` and stay in your game. `race.resize(cssW, cssH)` now and on resize.'],
    ['When a race starts',
      '`race.startRace({track: \'{{track}}\' (or your track object), karts: [{id: \'player\', kart: \'rook\', player: true}, {kart: \'wren\'}, ...] (your characters as kart objects `{name, body, accent, suit, helmet, number}`), laps, seed})` then `race.countdown()`; your autoplay: `race.setAI(\'player\', true)`.'],
    ['Your fixed step (every loop that steps the game, fast-forwards included)',
      '`race.step({steer: right - left, throttle, brake, drift}, 1 / 60)` once per 60 Hz step while the race mode is on (touch: throttle always on). Never move karts yourself.'],
    ['Where you draw',
      '`race.render()`, then on the 2D canvas scaled to CSS px `race.drawHud(ctx, w, h, {touch})`, then your own UI clear of `race.hudRects()`.'],
    ['Where the race ends',
      'In `onEvent(ev)`: `ev.type === \'raceEnd\'` (the player crossed the line): `race.setCamera(\'orbit\', {target: \'player\'})`, about 3 s later show `race.results()` and award your prize once, then leave the mode as your game leaves any other. Sounds / effects on `countdown`, `go`, `lap`, `boost`, `jump`, `bump`.']
  ],
  gotchas: [
    'Karts freeze or race at a different speed after a menu -> `step()` is skipped or called per animation frame; call it once per fixed 60 Hz step.',
    'A different race every reload, or `?t=` stills that differ -> pass a seed; no `Math.random()` / clock time in anything feeding the race.',
    'Karts drive backwards or float -> your code rotated or lifted the models; the module owns every kart transform.',
    'Laps never count on a custom track -> its points run the wrong way or two parts overlap; run `GameDNA_KartRacer3D.checkTrack(def)` (must return []).',
    'Black screen -> WebGL missing: check `race.ok` and call `race.drawFallback()`.',
    'HUD over your panels on a phone -> keep your panels outside `race.hudRects()`; the module switches to a phone layout under 560 px.'
  ],
  checks: [
    'A race shows 3-2-1-GO, three laps with place / lap / clock / minimap, FINISH and results; your game continues afterwards.',
    'Driving backwards over the line or cutting across the grass adds no lap.',
    'Holding drift through a corner turns the sparks blue, orange, pink; release gives a flame boost; autoplay finishes the race.'
  ],
  selfcheck: [
    'Trace one race: enter mode -> startRace -> countdown -> step each fixed step -> raceEnd -> results -> back to your game.',
    'List every place your game advances time and confirm each calls `race.step` exactly once per 60 Hz step while racing.'
  ],
  // Starter basket (FORMAT v1.2): the documented extension points of starter/index.html (see starter/README.md).
  starter: {
    name: 'Meadowlark Cup',
    modules: 'in the ADDONS SLOT `<script>` (pasted unchanged) or as `<script src>` tags right above it; three.js is already loaded',
    register: 'push it onto `GAME.addons` in the ADDONS SLOT `<script>` of `index.html` (it runs before the game boots, so addons see every `?t=` frame) (hooks: `init`, `gate`, `onKey(key, game)`, `onStep(info, game)`, `update(info, game)`, `draw(g, layer, game)` with layers `world | hud | overlay`, `onEvent`, `onRaceSetup`, `onRaceStart`, `onCheckpoint`, `onLap`, `onBoost`, `onDrift`, `onJump`, `onHit`, `onFinish`, `onRaceEnd`, `onResults`, `onPhase`, `onEnd`). New tracks and karts go in the same slot: `GAME.addTrack({id, name, palette, width, points, ramps, pads, scenery, laps})` (appended to the cup; check it with `GameDNA_KartRacer3D.checkTrack(def)`) and `GAME.addKart({id, name, body, accent, suit, helmet, number, speed, accel, grip})` (joins every grid)',
    hit: 'there is no combat: the event sites are `onLap(ev)` / `onFinish(ev)` / `onBoost(ev)` / `onHit(ev)` (`bump {a, b, speed}` or `wall {kart, speed}`); a kart\'s screen position is `GAME.anchor(ev.kart)`',
    draw: '`draw(g, layer, game)` with `layer === \'world\'`: the 2D overlay context in CSS px, right after the 3D render, before the race HUD and panels',
    rects: '`GAME.uiRects()` (place, lap, clock, splits, minimap, speed, drift meter, banners, intro card, results panel, toasts, touch buttons, as drawn this frame; CSS px)',
    field: 'the whole canvas; 3D scene in `GAME.three = {THREE, scene, camera, renderer}` (rebuilt per race: add 3D objects in `onRaceSetup`)',
    anchor: '`GAME.anchor(id)` -> `{x, y (top), footX, footY, cx, cy, w, h, depth, visible}` for every kart (CSS px); `GAME.karts()` lists them (`player` is yours)',
    clock: 'fixed 60 Hz; `onStep(info)` after each world step (`info.dt` s, `info.t` ms); `update(info)` every frame (`info.dt` ms, 0 while held); `gate(game)` returning false holds the world',
    reset: '`onRaceSetup(trackDef, game)` (each race) and `onPhase(\'title\', game)` (a new cup)',
    builtins: { toasts: '`GAME.flags.builtinToasts = false` (the starter\'s own rocket-start / best-lap toasts)', hud: '`GAME.flags.builtinHud = false` hides the race HUD and panels (keep it on unless you replace them)' },
    keep: '`?auto=1`, `?t=<ms>&freeze=1`, `?seed=`, `?laps=`, `?race=`, `?shadows=`, `?dpr=`, `?touch=1`, keys arrows / WASD, Space / Shift drift, Enter, P (autoplay), Esc (pause), the touch buttons',
    traceFrom: 'the `onLap` event of an autoplay lap and the `onRaceEnd` of race 1',
    autoCheck: '`?auto=1` still drives the whole cup to the final standings (phase `cup`)'
  },
  offers: {
    'anchor': '`race.anchor(id)` -> `{x, y, footX, footY, cx, cy, w, h, depth, visible}` in CSS px for every kart (after `race.render()`).',
    'ui-rects': '`race.hudRects()` lists the race HUD blocks drawn this frame (place, lap, clock, splits, minimap, speed, drift meter, banners).',
    'events': 'Every race event goes through `onEvent(ev)`: lap, finish, raceEnd, boost (level 1-3), driftStart, jump, bump, wall, wrongWay.',
    'battle-start': 'A race starts at `race.startRace({...})` + `race.countdown()`; the `go` event marks the start.'
  }
};

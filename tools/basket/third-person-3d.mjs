// Basket hint for N-01 third-person-3d: how to wire the module into an UNKNOWN game, by role.
// Never name a host's functions here. {{key}} = parameter value chosen for this combo.
export default {
  stage: 'systems',
  does: 'A third-person 3D exploration area: a procedural low-poly adventurer on a small island (sky, fog, soft shadows, code-drawn ground, props with colliders) seen by a smooth follow camera. Movement is camera-relative; the body turns toward the stick and then speeds up along its facing; walk and run poses follow the distance travelled so feet never slide; models are scaled by bounding box with feet on the ground in every pose. The camera lags, auto-aligns behind a running hero, pulls in in front of tall props and fades tree canopies. Pickups float and burst; NPCs face the hero, greet and wave. The module needs three.js 0.149.0 (three.min.js next to the page) and owns rendering; the game keeps its rules, quests, dialogue and HUD.',
  params: {
    walkSpeed: 'create `params.walkSpeed`', runSpeed: 'create `params.runSpeed`', turnRate: 'create `params.turnRate`', heroHeight: 'create `params.heroHeight`',
    camDist: 'create `params.camDist`', camPitch: 'create `params.camPitch`', camLag: 'create `params.camLag`', autoAlign: 'create `params.autoAlign`', fov: 'create `params.fov`',
    gear: 'create `params.gear`', palette: 'create `params.palette`', shadows: 'create `params.shadows`', mode: 'demo only (not a game parameter)'
  },
  steps: [
    ['The page', 'Load `three.min.js` (0.149.0, shipped next to the page) with `<script src>` before the module; add a WebGL canvas and a 2D canvas on top (same size, absolutely positioned).'],
    ['Where the game builds its scenes', '`tp = GameDNA_ThirdPerson3D.create({canvas, overlay, seed, onEvent, params: {walkSpeed: {{walkSpeed}}, runSpeed: {{runSpeed}}, turnRate: {{turnRate}}, heroHeight: {{heroHeight}}, camDist: {{camDist}}, camPitch: {{camPitch}}, camLag: {{camLag}}, autoAlign: {{autoAlign}}, fov: {{fov}}, gear: \'{{gear}}\', palette: \'{{palette}}\', shadows: \'{{shadows}}\'}})`; when `tp.ok` is false keep the old scenes only. Then `buildIsland`, `paint.*` + `paint.done()`, `buildLayout(props)`, `scatter()`, the hero (`addActor` + `setHero` + `snapCamera`), NPCs and pickups from the game\'s own content.'],
    ['The fixed step (also run by any fast-forward)', '`tp.step({x, y, run, camYaw}, 1 / 60)` with the game\'s own movement keys (y = forward) and touch stick; the game\'s use / talk key opens its own dialogue when an NPC is within 2.2 m; set that NPC\'s `target = \'hero\'` while near.'],
    ['Pickups and score', '`onEvent({type: \'pickup\', id, kind, value})` feeds the game\'s existing counters and inventory.'],
    ['The draw pass', '`tp.render()`, then the HUD on the 2D canvas in CSS px; labels above characters from `tp.anchor(id)` of the same frame; `tp.resize(w, h)` on load and resize.'],
    ['The game\'s autoplay', '`tp.autopilot({x, z})` turns its next goal into stick input along an A* path around props.']
  ],
  gotchas: [
    'Hero walks backwards or sideways -> a yaw was typed by hand; use `atan2(v.x, v.z) + FACING_OFFSET`.',
    'Black canvas or "THREE is not defined" -> three.min.js missing or loaded after the module.',
    'Labels lag behind characters -> anchors read before `render()` or in canvas px instead of CSS px.',
    'Screenshots differ run to run -> `Math.random` or clock reads in the step.',
    'An NPC blocks the path -> actors are round colliders; place them off paths or set `ghost = true`.'
  ],
  checks: [
    'The hero faces each of 8 move directions; feet stay on the ground in idle, walk and run.',
    'The camera pulls in in front of pillars and walls and never shows the inside of a prop.',
    'Pickups count once; NPCs turn to the hero when near; the game\'s own scenes and keys still work.'
  ],
  selfcheck: [
    'Trace stick (1, 0) with camera yaw 0: world (1, 0), yaw = atan2(1, 0) = 1.571.',
    'Trace one pickup: hero within 0.95 m -> `onEvent` -> counter + 1, once.'
  ],
  starter: {
    name: 'Sunshard Isle',
    modules: 'in the ADDONS SLOT `<script>` (pasted unchanged) or as `<script src>` tags right above it; three.js is already loaded',
    register: 'push it onto `GAME.addons` in the ADDONS SLOT (runs after the world is built, before boot) (hooks: `init(game)`, `gate(game)`, `onKey(key, game)`, `onStep(info, game)`, `update(info, game)`, `draw(g, layer, game)` with layers `world | hud | overlay`, `onPickup(ev, game)`, `onTalk(npcId, npc, game)`, `onPhase`, `onEvent`, `onEnd`)',
    hit: 'there is no combat: the event site is `onPickup(ev)` / `onEvent(ev)` (`ev.type === \'pickup\'`, `ev.x`, `ev.z`; screen position via `GAME.worldToScreen(ev.x, 1, ev.z)`) and `onTalk(npcId)`',
    draw: '`draw(g, layer, game)` with `layer === \'world\'`: the 2D overlay context in CSS px, right after the 3D render, before speech bubbles and the HUD',
    rects: '`GAME.uiRects()` (shard HUD panel, dialog, touch stick and TALK button while shown; CSS px)',
    field: 'the whole canvas (`GAME.TP.size()` -> `{w, h}` CSS px); 3D scene in `GAME.three = {THREE, scene, camera, renderer}`',
    anchor: '`GAME.anchor(id)` -> `{x, y (top), footX, footY, cx, cy, h, depth, visible}` for actors and pickups (CSS px); `GAME.actors()` lists the module actors; `GAME.addActor` / `GAME.addNPC` add more',
    clock: 'fixed 60 Hz; `onStep(info)` after each world step (`info.dt` s, `info.t` ms); `update(info)` every frame (`info.dt` ms, 0 while held); `gate(game)` returning false holds the world',
    reset: '`onPhase(\'play\', game)` (a new game reloads the page)',
    builtins: { numbers: 'nothing to turn off (no combat numbers)', sparks: '`GAME.flags.builtinBurst = false` (beacon burst)', shake: 'nothing to turn off (no shake)' },
    keep: '`?auto=1`, `?t=<ms>&freeze=1`, `?palette=`, `?gear=`, `?shadows=`, `?dpr=`, `?touch=1`, keys WASD / arrows, Shift, Q / E, Space, P (autoplay), Esc (pause)',
    traceFrom: 'the pickup event (`onPickup`) of an autoplay shard and the Keeper talk (`onTalk`)',
    autoCheck: '`?auto=1` still collects three shards, talks to the Keeper and reaches THE BEACON BURNS'
  },
  offers: {
    'anchor': '`tp.anchor(id)` -> `{x, y, footX, footY, cx, cy, h, depth, visible}` in CSS px of the canvas, for actors and pickups (after `tp.render()`).',
    'ui-rects': 'The 3D module draws no HUD; the game\'s own HUD rects apply.'
  }
};

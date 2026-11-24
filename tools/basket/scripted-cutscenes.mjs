// Basket hint for H-04 scripted-cutscenes: how to wire the module into an UNKNOWN game, by role.
// A director over the game's own world: it moves the game's characters (the game draws them), drives the camera, shows lines
// (in the game's dialogue box when there is one), emotes, fades and letterbox bars, and hands control back exactly once.
// Game-state changes happen only through the script's `call` commands (they also run when skipped).
export default {
  stage: 'ui',
  does: 'Scripted cutscenes: a small script (move, face, say, wait, cam pan / cut / zoom, fade, emote, cue, call, all) plays a scene in the game\'s world: characters walk with walk frames that advance with distance and face their path, the camera stays inside the map, letterbox bars slide in, lines use the game\'s dialogue box. Hold to skip lands on the play-through end state; control returns once.',
  params: {
    bars: 'create `params.bars`', skip: 'create `params.skip` (hold | press | off)', holdMs: 'create `params.holdMs`', textSpeed: 'create `params.textSpeed`',
    speed: 'create `params.speed` (or per actor `speed`)', stride: 'create `params.stride`', theme: 'create `params.theme`', box: 'create `params.box`', render: 'create `params.render`'
  },
  steps: [
    ['Once the characters exist (before a ?t= fast-forward loop)',
      '`cs = GameDNA_Cutscenes.create({view, stage, world, camera, actors, dialogue, onCall, cssScale, auto, params: {bars: {{bars}}, skip: \'{{skip}}\', textSpeed: {{textSpeed}}}})`. `actors[id].get()` = feet in WORLD px + facing; `set(p)` writes x, y, face / angle, moving, run and the walk animation (`p.frame` from the distance walked; give actors `frames: 4` or more and a `stride`) back. `camera()` = the game\'s follow rule for the CURRENT positions. `dialogue` = the game\'s own box (open(name, text, done), isOpen, close).'],
    ['The story moment (once)', '`cs.play(SCENE, {id, once: true})` from the code that decides it (a quest accepted, a gate reached); game-state changes as `{call: name}` handled in `onCall`; the script ends with everyone where the game expects them.'],
    ['The fixed step, every scene (also the ?t= replay)', '`cs.update(stepMs)` FIRST (0 while a pause menu is open); then while `cs.locked()`: no world / enemy / player movement update, no autopilot movement input or snapping, no advance of frame counters the autopilot uses; the game\'s dialogue keeps its keys.'],
    ['Input', 'confirm: `if (!cs.input(\'ok\'))` the game\'s box; skip key down / up: `cs.input(\'skip\', true / false)` while locked.'],
    ['Render', 'the world with `cs.camera() || gameCamera` (translate -x, -y; scale zoom); the HUD at alpha `1 - cs.bars()`; `cs.draw(ctx)` in screen space; then the game\'s dialogue box. Restart: `cs.reset()`.']
  ],
  gotchas: [
    '`?auto=1` ends differently -> the world ran a frame while locked (update() called after the input / world step), the autopilot snapped the hero onto its path while locked, or a frame counter the autopilot times itself by kept running.',
    'Camera jumps when the scene ends -> `camera()` returns a stored value instead of the follow rule for current positions.',
    'Hero slides without stepping -> the game animates walking from its own counter: set it from `pose.walk`.',
    'Scene hangs on a line -> the game\'s box never calls `done`, or Z is consumed by `cs.input` while the game\'s box is open (input returns false then: pass it on).',
    'Bars cover the game\'s dialogue box -> draw `cs.draw` before the box.',
    'Text tiny on phones -> pass `cssScale()`.'
  ],
  checks: [
    'The scene plays once: bars in, actors walk with walk frames facing their path, the camera stays inside the map, lines in the game\'s box, bars out.',
    'Holding skip fades and lands on the same positions / flags as playing through; onEnd once.',
    '`?auto=1` reaches the same end state as before with no console errors.'
  ],
  selfcheck: [
    '`get` / `set` agree (feet in world px, the sprite offset applied both ways); `camera()` and the world draw use the same top-left.',
    'Every script `call` has an `onCall` case; every actor id is in `actors`; nothing but the module moves the player while locked.'
  ],
  offers: {
    'ui-rects': { title: 'cutscene line box', text: '`cs.rects()` lists the built-in line box and its plate; while `cs.locked()` other overlays (toasts, banners, trackers) should wait or keep clear of them.' }
  }
};

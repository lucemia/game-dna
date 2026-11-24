// Basket hint for E-04 battle-transition: how to wire the module into an UNKNOWN game, by role.
// Never name a host's functions here. {{key}} = parameter value chosen for this combo.
export default {
  stage: 'effects',
  does: 'When a battle starts, the current frame is captured, cracks from the point of contact and breaks into bevelled shards that spin and fall over a dark backdrop (or swirls, pixelates, irises closed); the game switches scenes under full cover; the new scene is revealed. While it runs (`busy()`), input is dropped and the world waits. Optionally plays again when leaving a battle or starting the next wave.',
  params: {
    variant: 'create `params.variant`', reveal: 'create `params.reveal`', duration: 'create `params.duration`',
    pieces: 'create `params.pieces`', spin: 'create `params.spin`', flash: 'create `params.flash`',
    leave: '`variant` of the `start()` call where a battle ends or the next wave starts (`none` = no call there)'
  },
  steps: [
    ['Once, after the screen canvas exists and before the first step (including any `?t=` fast-forward loop that runs at load)',
      '`tr = GameDNA_BattleTransition.create({view: {x: 0, y: 0, w: <native width>, h: <native height>}, canvas: <screen canvas>, seed: 1, params: {variant: \'{{variant}}\', reveal: \'{{reveal}}\', duration: {{duration}}, pieces: {{pieces}}, spin: {{spin}}, flash: \'{{flash}}\'}})`. `view` is the whole screen, HUD included.'],
    ['Every place a battle starts (encounter, touch, title to first battle); grep every write of the scene/mode variable',
      'First line, before anything changes what is drawn: `tr.start({capture: () => { <render the current frame now>; return <screen canvas>; }, focus: {x, y}})` with `focus` = the player (or the touched enemy) in screen px. Keep the existing scene switch where it is: the module covers the screen until 55 %. Or move the switch into `onMid` (never both).'],
    ['Every place a battle ends back to the map, or the next wave/stage starts (optional)',
      'Same call with `variant: \'{{leave}}\'` (skip when `none`).'],
    ['Your fixed update step, right after input is read and cleared, before autoplay input and any world logic',
      '`if (tr.busy()) { tr.update(1000 / 60); return; }` (milliseconds; use your step length).'],
    ['After every call of your render function: live loop, `?t=` / freeze path, first frame at load',
      '`tr.draw(ctx)` as the last draw of the frame (after scene, HUD, dialogs, other overlays), never inside a scene branch that returns early.'],
    ['New game / restart / back to title', '`tr.reset()`.']
  ],
  gotchas: [
    'The battle flashes on screen for a frame before the shatter -> `start()` must come before the scene changes.',
    'Freeze shots of the transition show an empty or stale frame -> fast-forward loops do not draw; capture with a function that renders now.',
    'The transition shows on the map but not in battle -> `draw()` sits inside a render branch that returns early.',
    'Enemies act, messages advance or autoplay walks under the shards -> the busy gate must come before autoplay and world logic.',
    'Input locked forever -> `update()` not called inside the busy branch, or called with seconds.',
    'Keys pressed during the transition fire afterwards -> read and clear input before the busy check, and drop it.',
    'A restart during a transition leaves a cover -> `tr.reset()` at new game / title.'
  ],
  checks: [
    'At an encounter: white flash, cracks from the player, shards spinning and falling over a dark backdrop, then the battle revealed; never a black screen after it ends.',
    'Keys pressed during the transition do nothing; the first command afterwards works.',
    '`?auto=1` reaches the same end as before (later by the transition time), with no console errors; `?t=<encounter+200>&freeze=1` shows the shards.'
  ],
  selfcheck: [
    'List every scene switch and its `start()`, every render call and its `draw()`. Walk one encounter: `start` (capture renders the old scene) -> steps return early with `update` -> `onMid` at 55 % -> reveal -> `onDone`; the battle continues from where it was.',
    '`tr` exists before the first step; the module file is byte-identical.'
  ],
  offers: {
    'battle-start': 'A battle or wave starts where `tr.start()` is called (the new scene is hidden until 55 %).',
    'freeze': 'While `tr.busy()` the step returns early, so every other element\'s `update` waits too; the transition draws over everything, last.'
  },
  wants: {
    'battle-start': { title: 'transition', text: 'Call `tr.start({capture, focus})` first there, before the scene changes.', check: 'Every battle start shows the shatter; the battle is revealed after it.' }
  }
};

// Basket hint for H-05 bark-bubbles (world-space bark bubbles): how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'ui',
  does: 'Short lines in speech bubbles above characters while the game keeps running: an enemy that notices the player shows a yellow "!" alarm bubble, a hit character a red-edged hurt bubble, the player shouts after a kill, NPCs chat when idle. Bubbles pop in, type their line, follow the speaker, never overlap each other, the HUD or windows, stay on screen with a pointer tail when the speaker is at or past the edge, and fade after a reading time. Smooth on HD canvases, crisp pixel bubbles with a bitmap font on native pixel canvases. Never pauses, never reads input.',
  params: {
    size: 'create `params.size` (0 = auto from the field width)', width: 'create `params.width`', cps: 'create `params.cps` (0 = instant)', read: 'create `params.read`',
    hold: 'create `params.hold`', max: 'create `params.max` (0 = auto)', cooldown: 'create `params.cooldown`', idle: 'create `params.idle` (0 = no idle chatter)',
    pop: 'create `params.pop`', stagger: 'create `params.stagger` (0 = every speaker may bark the same event at once)', palette: 'create `params.palette`', render: 'create `params.render`', edge: 'create `params.edge`'
  },
  steps: [
    ['Once, after the canvas and the characters exist, before the first event',
      '`barks = GameDNA_BarkBubbles.create({bounds, getAnchor, getObstacles, speakers, params: {size: {{size}}, width: {{width}}, cps: {{cps}}, read: {{read}}, hold: {{hold}}, max: {{max}}, cooldown: {{cooldown}}, idle: {{idle}}, stagger: {{stagger}}, pop: {{pop}}, palette: \'{{palette}}\', render: \'{{render}}\', edge: \'{{edge}}\'}})`. Everything in screen px (world minus camera, plus any HUD offset). `bounds` = the visible field. `getAnchor(id)` -> `{x, top, w, h}`: sprite centre x and head top (hat, hover, HP bar included), `null` when gone. `getObstacles()` -> each living character\'s sprite rect with its `id`, plus every HUD panel and open window without `id`. `speakers()` -> `[{id, voice}]` of NPCs allowed to chat while the map is shown, `[]` elsewhere (voices `villager`, `guard`, `merchant`, `hero`, `monster`, `critter`).'],
    ['Where the game changes a character\'s state: the line that switches an enemy to chasing / alert, every HP loss, the kill, talking to an NPC',
      'On the change, once: `barks.bark(id, \'spotted\' | \'lost\' | \'hurt\' | \'lowhp\' | \'kill\' | \'greet\', {voice})`; exact lines `barks.say(id, text, {tone})` (talk, shout, alarm, hurt, whisper, think). Before opening a real dialogue with an NPC: `barks.silence(npcId)`. Never use the game\'s RNG for barks.'],
    ['Your fixed update step (every scene, so bubbles finish fading)', '`barks.update(stepMs)`; `barks.update(0)` while the world is frozen or paused by a window.'],
    ['Your draw pass, after characters and effects, before HUD and windows',
      '`barks.draw(ctx)` once per frame in screen coordinates (inside a camera translate: `barks.draw(ctx, camX, camY)`). Never clip or filter it.'],
    ['New game, restart, and every switch to another screen (battle screen, title)', '`barks.clear()`; return `null` anchors for characters that screen does not show.']
  ],
  gotchas: [
    'The same bark every few seconds while an enemy chases -> `bark` sits in a per-frame condition; call it on the transition (not chasing -> chasing).',
    'Bubbles drift when the camera moves -> world coordinates; anchors and obstacles in screen px.',
    'Bubbles over the HUD or the dialogue box -> those rects are missing from `getObstacles()` (no `id`), or the bubbles are drawn after the windows.',
    'A tail points at the wrong character -> the ids passed to `bark` differ from the ids in `getAnchor` / `getObstacles`.',
    'Bubbles linger on the battle screen or the title -> `clear()` on screen switches.',
    '`?auto=1` ends differently -> barks consumed the game\'s RNG or changed state.',
    'Blurry bubbles on a native pixel game drawn into a larger backing store -> `render: \'crisp\'`.'
  ],
  checks: [
    'An enemy that notices the player shows a yellow "!" bubble above it on that frame; a hit shows a red-edged hurt bubble above the victim.',
    'Bubbles follow walking speakers, never overlap each other, a HUD panel or a window, and fade after a few seconds.',
    'A speaker at or past the screen edge keeps its bubble inside the screen with the tail pointing at it.'
  ],
  selfcheck: [
    'List every `bark` call and the state change it is guarded by (fires once per change).',
    'Walk one hit: HP change -> `barks.bark(id, \'hurt\', ...)` -> `barks.update` each step -> `barks.draw` each frame, with screen coordinates that match where the sprite is drawn.'
  ],
  wants: {
    'hit-site': { title: 'hit sites', text: 'Call `barks.bark(target.id, \'hurt\', {voice})` there, after the HP change (skip it on the killing blow; bark `kill` for the attacker instead).', check: 'A hit shows the victim\'s hurt bubble on the hit frame, once per hit at most every cooldown.' },
    'ui-rects': { title: 'UI rects', text: 'Return them (no `id`) from `getObstacles()`, including windows and banners while open.', check: 'No bubble covers the other element\'s windows, plates or HUD.' },
    'anchor': { title: 'anchors', text: 'Use this for `getAnchor` and the sprite rects in `getObstacles` (screen px).' },
    'battle-start': { title: 'reset', text: 'Call `barks.clear()` there.' }
  }
};

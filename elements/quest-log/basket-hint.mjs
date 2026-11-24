// Basket hint for H-03 quest-log (quest log & objectives): how to wire the module into an UNKNOWN game, by role.
// A UI layer that owns quest progress but never changes game state: the game reports what happened (kill, collect, talk, reach)
// and the module advances the quests. Combines with any system; with C-14 toasts in the basket, its notices go there.
export default {
  stage: 'ui',
  does: 'Quests as data with ordered steps and counters: the game reports events and the module advances the current step, clamps counters to their targets and ignores events for later steps and after completion. A tracker card per quest in a HUD corner (objective, punching 2/3 counter, bar, check-off that strikes through and collapses), NEW QUEST / QUEST COMPLETE banners, a quest log panel (active and done tabs, description, steps, reward, track / untrack) and world markers with edge arrows. Never covers the HUD rects the game names; text never overlaps. Glass cards on HD canvases, crisp pixel cards on native pixel canvases.',
  params: {
    corner: 'create `params.corner`', max: 'create `params.max`', theme: 'create `params.theme`', markers: 'create `params.markers`', banner: 'create `params.banner`',
    future: 'create `params.future`', logKey: 'create `params.keyHint` (and the key that opens the log)', hold: 'create `params.hold` (ms)', render: 'create `params.render`'
  },
  steps: [
    ['Quest data, once, near the game\'s other constants',
      '1-3 quests that mirror the game\'s own goal chain: `{id, title, giver, desc, reward, kind: \'main\' | \'side\', steps: [{text, on: \'type:target\', count}]}`, e.g. `{text: \'Defeat slimes\', on: \'kill:slime\', count: 3}`, `{text: \'Return to the elder\', on: \'talk:elder\'}`. Use the same words the event calls below use.'],
    ['Once at startup, before anything can call it (also before a ?t= fast-forward loop)',
      '`quests = GameDNA_QuestLog.create({view, safeRects, quests: DATA, camera, locate, player, obstacles, quiet, params: {corner: \'{{corner}}\', max: {{max}}, theme: \'{{theme}}\', markers: \'{{markers}}\', banner: \'{{banner}}\', future: \'{{future}}\', keyHint: \'{{logKey}}\', hold: {{hold}}, render: \'{{render}}\'}})`. With C-14 toasts in the game, also pass `toasts: <its instance>` so NEW QUEST / QUEST COMPLETE become toast cards. `view` = the play view in logical canvas px; `safeRects()` = every HUD box on screen now (bars, objective line, dialogue boxes, menus, other overlays); `camera()` world rect on screen, `locate(target)` world point(s) of a target, `player()` player world point; `obstacles()` screen rects of NPCs / bosses banners must not hide; `quiet()` true while a dialogue or cut-scene runs (banners wait).'],
    ['The code that DECIDES each event, once each (never a per-frame check)',
      '`quests.start(id)` where a quest is given (end of a dialogue); `quests.event(\'kill\', kind)` where a foe dies; `quests.event(\'collect\', kind)` on pickup; `quests.event(\'talk\', npcId)` when a conversation ends; `quests.event(\'reach\', placeId)` on arrival (or give the step `at` + `radius` and `player()`).'],
    ['Your fixed update step, every scene (also the ?t= replay)', '`quests.update(stepMs)`.'],
    ['Your render, last: after world and HUD, outside any camera transform, in play scenes', '`quests.draw(ctx)`.'],
    ['Your key handler (before the game reads the key)',
      '`{{logKey}}` -> `quests.input(\'log\')`; while `quests.isLogOpen()` arrows / confirm / cancel -> `quests.input(\'up\' | \'down\' | \'left\' | \'right\' | \'ok\' | \'back\')` and nothing else (human input only; never the autoplay). Pointer: `if (quests.tap(x, y))` consume it.'],
    ['Where a new game starts', '`quests.reset()`.']
  ],
  gotchas: [
    'Counter never moves -> the step\'s `on` words differ from the `event(type, target)` call; use the same words.',
    'Counter jumps or counts every frame -> `event` sits in a per-frame check; call it where the kill / pickup happens.',
    'Tracker over the HP bar, the objective line or the dialogue box -> that box is missing from `safeRects()` (or given in backing-store px).',
    'Banners and check-offs frozen in `?t=` stills -> `update` is not in the replayed step.',
    'Arrow keys move the hero while the log is open -> route keys to `input()` first and stop when it returns true.',
    'Markers in the wrong place -> `camera` / `locate` return screen px; return world px.',
    'A NEW QUEST banner over an NPC -> return that NPC\'s screen rect from `obstacles()`.',
    '`?auto=1` ends differently -> the integration changed game logic or random numbers; the module only reads.'
  ],
  checks: [
    'Taking a quest shows a banner and a tracker card in the {{corner}} corner, never over a HUD or dialogue box.',
    'Each kill / pickup bumps the counter; a finished step checks off and the next appears; events for later steps or after completion change nothing.',
    '{{logKey}} opens the log; the player does not move while it is open; `?auto=1` ends exactly like before.'
  ],
  selfcheck: [
    'Every step `on` matches a real `event(...)` call (grep both sides); `start` is called where each quest is given.',
    '`update` runs once per fixed step in every scene, also on the replay; `draw` runs last, once per frame.'
  ],
  offers: {
    'ui-rects': { title: 'quest tracker rect', text: '`quests.rects()` is the tracker, the banner and the open log on screen; add them to the other element\'s UI rects / obstacles so toasts, numbers and minimaps never land on them.' }
  },
  wants: {
    'ui-rects': { title: 'HUD rects', text: 'Add the other element\'s on-screen boxes (minimap, toasts, boss bars, windows while open) to the quest log\'s `safeRects()` so the tracker slides out of their way.', check: 'The tracker never covers the other element\'s boxes.' }
  }
};

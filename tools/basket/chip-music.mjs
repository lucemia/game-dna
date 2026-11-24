// Basket hint for F-03 chip-music (chip music): how to wire the module into an UNKNOWN game, by role.
// Fire-and-forget music: it never changes game state, input or randomness, so it combines with any system and any other
// element. With F-02 procedural-sfx in the basket, pass the sfx instance so big sounds duck the music.
export default {
  stage: 'effects',
  does: 'A four-channel chip band (two pulse leads with duty cycle, stepped triangle bass, noise drums) synthesized in Web Audio from pattern data, no audio files: loops title, field and battle that wrap without a seam, and jingles victory, defeat and item that pause the loop and bring it back on the next beat. Track switches land on the beat; play(track) for the current track is a no-op, so the game can name the track for its state every step. A small sound badge shows four channel meters and toggles mute. Silent until the first click or key; deterministic under ?t= fast-forward.',
  params: {
    volume: 'create `params.volume`', jingleMode: 'create `params.jingleMode` (pause | duck)', resume: 'create `params.resume` (beat | bar)', tempo: 'create `params.tempo`'
  },
  steps: [
    ['Once at startup (never per level or per frame)',
      '`music = GameDNA_ChipMusic.create({params: {volume: {{volume}}, jingleMode: \'{{jingleMode}}\', resume: \'{{resume}}\', tempo: {{tempo}}}})`. Sound starts on the player\'s first click, tap or key; never create an AudioContext.'],
    ['The fixed update step of EVERY scene (title, play, menus, results), also in ?t= / autoplay loops', '`music.update(stepMs)` with the game\'s own step.'],
    ['Right after it, each step', '`const t = musicFor(); if (t) music.play(t);` where `musicFor()` reads state only and returns `\'title\'`, `\'field\'` (exploring), `\'battle\'` (a fight) or `null` (results screens). If F-05 adaptive-music is in the basket, return null here during gameplay (title and results only) and skip `after: \'field\'`: adaptive music picks the gameplay track.'],
    ['The code that DECIDES each event, once per event',
      'chest, key item, level-up, wave cleared `music.jingle(\'item\')`; a battle won that returns to exploring `music.jingle(\'victory\', {after: \'field\'})`; the final win `music.jingle(\'victory\', {after: \'stop\'})`; game over `music.jingle(\'defeat\', {after: \'stop\'})`. Each jingle pauses the music: victory only when a whole fight or encounter ends (never per enemy killed), item only for rare finds (chest, key item, level-up; never coins or small pickups, use F-02 sfx for those).'],
    ['HUD draw of every scene; the pointer handler; an unused key', '`music.draw(ctx, x, y)` in an empty corner (23x11 px, `{scale: 2}` above 400 px wide); `if (music.hit(canvasX, canvasY)) return;` before the game\'s own pointer code; key M (if unused) `music.mute()`.']
  ],
  gotchas: [
    'The title row never moves in ?t= stills -> `update` is not called in the fast-forward loop or the title scene.',
    'Battle music comes back after a defeat jingle -> `musicFor()` names a DIFFERENT track on the results screen; return null there (repeating the interrupted track is ignored).',
    'A jingle fires every frame (jingle spam) -> it sits in a per-frame condition; call it on the frame the event is decided.',
    'Music restarts at every step -> `play(t, {restart: true})` or `create` per frame; call plain `play(t)` and create once.',
    '`?auto=1` ends differently -> a call moved game code into a new branch or used the game\'s random numbers.',
    'The badge covers the HUD -> pick another corner; it is 23x11 native px.'
  ],
  checks: [
    'After one click the title loop plays; starting the game switches loops on a beat, never mid-note.',
    'A chest or item plays the item jingle and the loop continues from a beat, not from its start; wins and losses play their jingles once.',
    'Before any click the game runs silently with no console errors; `?auto=1` ends exactly as before; the badge toggles mute.'
  ],
  selfcheck: [
    'List each `jingle` call with the line where its event is decided; `musicFor()` only reads state.',
    '`create` runs once; `update` is reached in every scene; no game line was removed or moved into a new branch.'
  ],
  offers: {
    'events': { title: 'jingles for other elements\' events', text: 'A level-up or reward screen, a quest completed, a purchase: `music.jingle(\'item\')` once at the event (the loop resumes on a beat). A boss intro or an alarm state: name `\'battle\'` in `musicFor()`.' },
    'ui-rects': { title: 'sound badge rect', text: '`music.lastDrawn()` is the badge rect; add it to the other element\'s UI rects so toasts or numbers never land on it.' }
  },
  wants: {
    'sfx': { title: 'procedural sound effects', text: 'Pass the F-02 instance: `GameDNA_ChipMusic.create({sfx, params: {...}})` so both share one AudioContext and explosions or crits duck the music.', check: 'One AudioContext after the first click (sfx.context() === music.context()).' }
  }
};

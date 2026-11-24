// Basket hint for F-02 procedural-sfx (procedural sound effects): how to wire the module into an UNKNOWN game, by role.
// Fire-and-forget audio: it never changes game state, input or randomness, so it combines with any system and any other
// element; other elements' events (level-up, purchase, toast, banner) can each get one sound.
export default {
  stage: 'effects',
  does: 'Fourteen game sounds (hit, crit, coin, jump, land, footstep, menu move / confirm / cancel, explosion, laser, power-up, heal, hurt) synthesized live with Web Audio, no audio files. Every call is a seeded variation; a small mixer caps voices, merges same-frame duplicates, ducks the rest under big sounds and keeps peaks under a soft ceiling. Silent until the player\'s first click or key, a no-op without Web Audio, never touches game state or input.',
  params: {
    master: 'create `params.master`', sfx: 'create `params.sfx`', variation: 'create `params.variation`', style: 'create `params.style`',
    pitch: 'create `params.pitch` (semitones)', brightness: 'create `params.brightness`', length: 'create `params.length`',
    maxVoices: 'create `params.maxVoices`', duck: 'create `params.duck` (dB)', stride: 'create `params.stride` (px per footstep)', mute: 'create `params.mute`'
  },
  steps: [
    ['Once at startup (never per level or per frame)',
      '`sfx = GameDNA_Sfx.create({seed: 1, params: {master: {{master}}, sfx: {{sfx}}, variation: {{variation}}, style: \'{{style}}\', pitch: {{pitch}}, brightness: {{brightness}}, length: {{length}}, maxVoices: {{maxVoices}}, duck: {{duck}}, stride: {{stride}}, mute: \'{{mute}}\'}})`. Audio starts on the player\'s first click, tap or key; do not create an AudioContext yourself.'],
    ['Your fixed update step, at the top, in every scene (title, play, menus, end screens)', '`sfx.update(stepMs)`.'],
    ['Where the player character moves on the ground (once per step)', '`sfx.walk(\'player\', <distance actually moved this step, px>, <on ground>)`: a footstep every {{stride}} px.'],
    ['The code that DECIDES each event, once per event (the frame it happens), never in a per-frame condition',
      'jump starts `sfx.play(\'jump\')`; landing after a fall `\'land\'`; an attack connects `\'hit\'`, a critical or killing blow `\'crit\'`; a shot or bolt fired `\'laser\'`; an explosion or big area attack `\'explosion\'`; the PLAYER takes damage `\'hurt\'`; coin or small pickup `\'coin\'`; power-up, level-up, key item, victory `\'powerup\'`; heal, rest, potion `\'heal\'`. World events pass `{x: <screen x>, width: <screen width>}` for stereo pan.'],
    ['Menus and windows', 'cursor moved `\'menu-move\'`; confirm or open `\'menu-confirm\'`; cancel, back or close `\'menu-cancel\'`. Optional: a "Sound" entry in the game\'s own options calling `sfx.mute()`.']
  ],
  gotchas: [
    'A buzz while touching something -> `play` sits in a per-frame overlap or "while attacking" condition; call it on the frame the event happens.',
    'Silence after clicking -> `create` runs per frame or per level (each new instance starts locked); create once.',
    'Every coin sounds the same -> `variation` is 0 or a fixed `seed` is passed on every call.',
    '`?auto=1` ends differently -> a call moved game code into a new branch or used the game\'s random numbers; sound calls are fire-and-forget.',
    'Footsteps in the air or against a wall -> pass the distance really moved and the real on-ground flag to `walk`.',
    '`hurt` on enemy hits -> `hurt` is for the player; enemies use `hit` / `crit`.'
  ],
  checks: [
    'After one click: jumping, landing, hits, pickups, damage and menus each make their sound once per event; walking makes soft steps in rhythm.',
    'Repeating an action sounds slightly different each time; nothing clicks, crackles or clips when an explosion and several hits overlap.',
    'Before the first click the game runs silently with no console errors; `?auto=1` ends exactly as before.'
  ],
  selfcheck: [
    'List each `play` / `walk` call with the event behind it and where the event is decided; none runs every frame while a condition holds.',
    '`create` runs once; `update` is reached in every scene; no game line was removed or moved into a new branch.'
  ],
  offers: {
    'events': { title: 'sounds for other elements\' events', text: 'Give each other element\'s event one sound: a level-up or reward screen `sfx.play(\'powerup\')`, a purchase or item get `\'coin\'`, a window or choice opening `\'menu-confirm\'`, its cursor `\'menu-move\'`, closing `\'menu-cancel\'`, a toast or banner `\'menu-confirm\'` at volume 0.6.' }
  },
  wants: {
    'hit-site': { title: 'hit site', text: 'At the same accepted-hit site the other element uses, call `sfx.play(crit ? \'crit\' : \'hit\', {x, width})` once.', check: 'Every landed hit makes one hit or crit sound, never two.' }
  }
};

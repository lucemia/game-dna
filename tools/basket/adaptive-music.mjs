// Basket hint for F-05 adaptive-music (layered music over F-03 chip music): how to wire it into an UNKNOWN game, by role.
// It needs chip-music (element.json `requires`; combine.mjs adds it). Fire-and-forget: it never changes game state,
// input or randomness and draws nothing, so it combines with any system and any other element.
export default {
  stage: 'effects',
  does: 'Layered music that follows the game state over chip music: each chip channel is a stem (bass always, drums for fights and the boss, the melody, a tense danger line at low health); the boss has its own track. The game reports active / combat / boss / hp every step; changes are debounced (0.5 s to start, 3 s to calm down, HP hysteresis), land on the next bar line with a one-bar stinger when the mood changes, and never overlap. The game\'s own jingles and title / results loops keep every channel open.',
  params: {
    quantize: 'create `params.quantize` (bar | beat)', enterMs: 'create `params.enterMs`', exitMs: 'create `params.exitMs`', lowHp: 'create `params.lowHp`', stingers: 'create `params.stingers` (\'on\' | \'off\')'
  },
  steps: [
    ['Before anything: chip music\'s own steps', 'Wire chip music\'s create, update, title loop and jingles, but NOT its `\'field\'` / `\'battle\'` picker or `after: \'field\'`: the next steps replace them, so nothing has to be undone.'],
    ['Once at startup, right after the chip-music instance',
      '`adaptive = GameDNA_AdaptiveMusic.create({music, params: {quantize: \'{{quantize}}\', enterMs: {{enterMs}}, exitMs: {{exitMs}}, lowHp: {{lowHp}}, stingers: \'{{stingers}}\'}})`.'],
    ['The fixed update step of EVERY scene, right after `music.update(stepMs)` (also in ?t= / autoplay loops)',
      '`adaptive.update({active, combat, boss, hp})`: active = in gameplay; combat = foes engaged or within a short distance of the hero; boss = a boss fight on (awake / seen and alive); hp = hero.hp / hero.maxHp. Read state only.'],
    ['The chip-music track picker (`musicFor()`); THIS OVERRIDES chip music\'s `\'field\'` / `\'battle\'` step', 'Return `\'title\'` on the title and `null` during gameplay and results: adaptive music picks the gameplay track. Never `\'field\'` / `\'battle\'` while active.'],
    ['The code that DECIDES each event, once per event; THIS OVERRIDES chip music\'s `after: \'field\'`', 'Few jingles, each pauses the music: `music.jingle(\'victory\')` only when a whole fight or encounter ends or the boss falls (never per kill: a kill only lets `combat` go false); `music.jingle(\'item\')` only for rare finds (chest, key item, level-up), never coins or small pickups (F-02 sfx if present); no `after` while play continues; the final win / game over: `after: \'stop\'` and `active: false` on that screen. If the boss is the last fight, the boss falling IS the final win: `music.jingle(\'victory\', {after: \'stop\'})` (the boss stinger only plays when the fight starts; adaptive music adds nothing at the end).']
  ],
  gotchas: [
    'Field and battle loops fight the layers (`adaptive.stats().conflicts` > 0) -> the chip-music picker still names a loop during gameplay; return null there.',
    'The music never changes in ?t= stills -> `music.update` / `adaptive.update` missing from the fast-forward loop.',
    'The music keeps pausing (jingles on every kill or coin) -> victory only when the fight ends, no jingle for coins; the module drops repeats (`state().jingleLimit.dropped`).',
    'Low HP blinks at the threshold -> pass hp as a fraction 0-1 (or hp with maxHp).',
    'Drums never come in -> `combat` is true only for a frame (e.g. on the hit); report it while foes are engaged or close.'
  ],
  checks: [
    'After one click: explore plays bass and melody; meeting foes brings the drums in on a bar line with a short stinger, about 0.5 s plus up to a bar later; a foe brushing past changes nothing.',
    'Low health brings the danger line in on a bar; a boss switches to the boss track on a bar; its victory jingle plays with full music.',
    'The loop is paused by jingles less than 15 % of a normal run.',
    '`?auto=1` ends exactly as before; `adaptive.stats()` errors and conflicts are 0; every `adaptive.plan()` change has `at` on a bar line.'
  ],
  selfcheck: [
    '`adaptive` is created once after `music`; `adaptive.update` follows `music.update` in every scene.',
    'List the lines `combat`, `boss` and `hp` read; nothing in the game was changed for them.'
  ],
  offers: {
    'events': { title: 'music state for other elements', text: '`adaptive.state()` gives mood, low HP and the pending change (`pending.inMs`): a HUD or a screen tint can pulse on the bar line the music changes on.' }
  },
  wants: {
    'sfx': { title: 'procedural sound effects', text: 'Pass the F-02 instance to chip music (`GameDNA_ChipMusic.create({sfx, ...})`); adaptive music needs nothing else.', check: 'One AudioContext after the first click.' }
  }
};

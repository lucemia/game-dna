// Basket hint for C-11 damage-pop (modern damage numbers): how to wire the module into an UNKNOWN game, by role.
// It REPLACES E-01 damage-numbers: both have element.json "family": "combat-feedback", so combine.mjs reports an ERROR
// ("they own the same system. Pick one") when both are in one basket. `conflicts` below says the same for readers and tools.
export default {
  stage: 'effects',
  conflicts: { 'damage-numbers': 'Both draw the damage numbers. Use C-11 (modern: arcs, rolling totals, type colours) or E-01 (retro bouncing digits), never both.' },
  does: 'On the frame a hit lands, its amount arcs out of the target and lands above it; crits pop big with a burst and a short shake; rapid hits of one type on one target roll into one total that punches on each add (12 -> 47 -> 83); each damage type has a colour and a small icon (fire, ice, shock, poison, arcane, heal, shield, mana; physical is plain white); misses and blocks are small words. Big numbers stay on top; nothing lands on another unit, its HP bar, UI rects or another number. Smooth on HD canvases, crisp 1-bit on native pixel canvases.',
  params: {
    size: 'create `params.size` (0 = auto from the field width)', duration: 'create `params.duration`', arc: 'create `params.arc`', punch: 'create `params.punch`',
    merge: 'create `params.merge` (0 = never merge)', hitstop: 'create `params.hitstop` (0 = off)', palette: 'create `params.palette`', icons: 'create `params.icons`',
    crit: 'create `params.crit`', render: 'create `params.render`', stack: 'create `params.stack`'
  },
  steps: [
    ['Once, after your units and the play-field size exist, before the first hit',
      '`dp = GameDNA_DamagePop.create({bounds, params: {size: {{size}}, duration: {{duration}}, arc: {{arc}}, punch: {{punch}}, merge: {{merge}}, hitstop: {{hitstop}}, palette: \'{{palette}}\', icons: \'{{icons}}\', crit: \'{{crit}}\', render: \'{{render}}\', stack: \'{{stack}}\'}, getAnchor, getObstacles, onHitStop, onShake, onFlash})`. `bounds` = play field above the HUD in logical canvas px. `getAnchor(id)` -> `{x, top, w, h}`: sprite centre x, top of what is drawn above the head (hover, HP bar), size; keep answering for dead units; a lunging attacker returns its home spot. `getObstacles()` -> each living unit\'s sprite rect with `id` (also at its home spot if it moves), HP bars with the unit\'s `id`, every HUD window, banner and message box without `id`. Scrolling games: screen px (world minus camera) everywhere. `onHitStop` / `onShake` / `onFlash`: your freeze / shake / flash, or nothing.'],
    ['Every place your game changes HP, MP or a status (attacks, spells, items, ticks, level-up heals, refills, hits on the player). Grep every write to HP and MP',
      'Right after each change, once: `dp.spawn(target.id, realChange, kind, {type, crit})`; `realChange` = the change after clamping. Kinds `damage | crit | heal | shield | mp | miss | block | dodge | status` (status: the word as amount); types `physical | fire | ice | shock | poison | arcane | heal | shield | mana` (map yours to the nearest). Mana restored: `spawn(id, gain, \'heal\', {type: \'mana\'})`.'],
    ['Your fixed update step (every scene, so numbers finish fading)',
      '`dp.update(stepMs)`; `dp.update(0)` while the world is frozen (hit-stop) or paused by a window.'],
    ['Your draw pass, after actors and hit effects, before banner and HUD',
      '`dp.draw(ctx)` once per frame in screen coordinates (inside a camera translate: `dp.draw(ctx, camX, camY)`), inside any shake translate. Never clip, proxy or filter its drawing: placement already avoids every rect in `getObstacles()`.'],
    ['Where a battle, wave, level or new game STARTS, before anything spawns there', '`dp.clear()` (numbers spawned since the last `update` survive it).']
  ],
  gotchas: [
    'Each hit shows two numbers -> the game\'s own (or E-01\'s) numbers are still drawn; this module replaces them.',
    'Rapid hits never merge -> they use different `type`s or kinds, or are further apart than `merge`; pass one type per attack.',
    'A total jumps instead of rolling -> spawn each hit\'s amount, not the running total.',
    'Numbers on a neighbour\'s HP bar or head -> `getObstacles()` lacks that unit, its `id`, or its HP bar rect.',
    'Numbers smeared on a native pixel game drawn into a larger backing store -> `render: \'crisp\'`.',
    'Kill numbers missing or at the field centre -> `getAnchor` returned `null` for the dead unit.',
    'Numbers missing in `?t=&freeze=1` shots, or jumping after hit-stop -> advance only through `update` (0 while frozen), never on wall-clock time.',
    'Numbers slide over the HUD in a scrolling game -> mixed world and screen coordinates.',
    'Numbers cut off or missing although `dp.lastDrawn()` lists them -> the game clips (evenodd around obstacles), proxies or filters `dp.draw`; draw it once, unclipped.',
    'Wave-refill heals pile into one strip above the party -> they were spawned under the WAVE banner; spawn them when the banner ends.',
    '`MISS` on the player with no enemy near, or `+0` heals -> spawn `miss` only for an attack aimed at a unit; skip changes of 0.'
  ],
  checks: [
    'A hit shows its number on the hit frame, arcing up and landing above the target, then fading.',
    'Three quick hits of one type on one target show one rolling total that punches on each add; a crit is bigger with a burst; heals green `+n`; `MISS` / `BLOCK` as small words; type colours and icons.',
    'No number touches another unit, its HP bar, a window, a banner or another number; big numbers are never covered by small ones.'
  ],
  selfcheck: [
    'List every HP/MP write and the `dp.spawn` after it (no hit spawns twice; refills, level-up heals and item uses included).',
    'Walk one hit: impact -> HP change -> `dp.spawn` -> `dp.update` each step (0 while frozen) -> `dp.draw` each frame; `getAnchor` answers for dead units.'
  ],
  wants: {
    'hit-site': { title: 'hit sites', text: 'Call `dp.spawn` there, after the HP/MP change, once per change, with the matching `type`.', check: 'In one full exchange every hit from both sides shows one number on its hit frame; quick same-type hits on one target roll into one total.' },
    'freeze': { title: 'hit-stop', text: '`onHitStop(ms)` starts it; `dp.update(0)` meanwhile.', check: 'Hit-stop freezes everything briefly; the number shows on the first frozen frame.' },
    'ui-rects': { title: 'UI rects', text: 'Return them (no `id`) from `getObstacles()`; `bounds` ends above the HUD.', check: 'No number covers the other element\'s plates, windows or HUD.' },
    'anchor': { title: 'anchors', text: 'Use this for `getAnchor` and the sprite rects in `getObstacles`.' },
    'battle-start': { title: 'reset', text: 'Call `dp.clear()` there, at the start, before refill or heal numbers spawn.' }
  }
};

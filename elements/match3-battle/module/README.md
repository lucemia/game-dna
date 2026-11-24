# match3-battle.js (A-17 module, v1.3.0)

One classic script, no dependencies, one global: `GameDNA_Match3Battle`. ASCII source. A party of heroes fights waves of foes
on an 8 x 8 gem board. Seeded and frame-stepped: the same seed and the same inputs give the same battle, frame for frame, at
any view size (the layout only changes where things are drawn).

## Rules

- **Swap** two neighbouring gems. A swap that makes no run of 3+ (and uses no special, see below) animates there and back
  and costs nothing. A swap that matches is a **turn**.
- **Match**: every straight run of 3+ of one colour clears. Runs that share a cell form one group. A group leaves a special
  on the cell the player moved (or the group's lowest row, middle cell, in a cascade):
  4 in a row -> **Row shard** (`'h'`, clears its row when it clears) or **Column shard** (`'v'`); a horizontal and a
  vertical run (L / T) -> **Blast** (`'bomb'`, clears 3 x 3); 5 in a row -> **Prism** (`'prism'`, no colour).
- **Prism**: swap it with any gem to clear every gem of that colour; with a shard or Blast, that colour turns into that
  special and they all fire; two Prisms clear the board. A Prism caught in a blast clears the most common colour.
- **Cascades**: after a clear, gems fall, new gems drop in from above (seeded), and new runs clear again. Each cascade step
  adds `combo` (0.25) to the weight of the gems it clears (step 1 = 1, step 2 = 1.25, ...).
- **Heroes**: each hero has a gem colour. After the board settles, every hero whose colour cleared attacks the target for
  `atk x weight / 3` (x `weakMult` 1.5 when the foe is weak to that colour) and its skill charges by the number of its gems
  cleared. **Hearts** heal the party (`power` x max HP per weighted heart). Other gem roles: `strike` (direct damage),
  `ward`, or `onClear(api, info)`.
- **Skills**: a hero whose charge reached the skill's `cost` can cast it (key `1`-`4`, a tap on its card). Casting costs no
  turn; matches it causes (conversions, specials) resolve as a cascade.
- **Foes**: each foe shows a countdown; every turn it drops by 1; at 0 the foe attacks (melee foes strike the front hero,
  bolt casters anyone) and the countdown resets to `every`. A foe `special` (every n-th attack) multiplies the damage. Ward
  absorbs damage first. The party shares one HP pool.
- **Foe attacks** read in four beats: wind-up (the foe leans back and crouches, glows red; a boss or a special also rings
  the target's feet in dashed red), strike (leap, swoop, a slam that rises high then drops forward onto its fists and holds there a moment, or a bolt; a melee
  foe's front lands on the hero's body at impact, with a short warm flash at the contact point and soft dust behind the feet), impact (damage on that frame, a
  hit-stop of 40 ms / 70 ms for a slam, a dust ring, a shake) and recovery. `actors()` reports each foe's drawn `pose`
  (`dx`, `lift`, `sq` as shares of its height, `k` = attack progress).
- **Numbers** (built-in): hits on one owner within 0.8 s roll into one total that re-pops in place; a later number fades in
  at the base while the owner's older numbers glide up one row, so two numbers never overlap (`numberRects()` for checks).
- **Waves** come one after another; the battle is won when the last wave falls, lost when the party's HP reaches 0.
- **Guarantees**: a new board (start, reshuffle) never holds a run and always has a move; whenever the board waits for the
  player there is a move (otherwise it reshuffles first, with a "NO MOVES" banner); refills come from one seeded generator
  in a fixed order (columns left to right, the lowest hole first), so cascades are reproducible.

## Content is data

```js
gems:    { ember: { name, shape: 'cushion', colors: [dark, base, light, glint], role: 'hero', weight: 1 }, ... }
         // shape: cushion | drop | hex | star | heart | tri | oval | kite | round | moon (pick one no other colour uses)
         // role: 'hero' | 'heal' (power) | 'strike' (power) | 'ward' (power); onClear(api, {gem, count, weight}); weight 0 = never spawns
heroes:  { knight: { name, gem: 'ember', atk: 15, hp: 190, skill: 'valor', look: 'knight', attack: 'leap' | 'arrow' | 'orb' | 'bolt', icon } }
skills:  { valor: { name, cost: 18, text, icon, fx: 'slash' | 'arrows' | 'bloom' | 'light' | 'burst',
                    effects: [{damage: 4.5, target: 'one' | 'all'}, {heal: 0.3}, {convert: {to: 'heart', count: 4, from}},
                              {delay: 1}, {ward: 40}, {make: {sp: 'h' | 'v' | 'bomb' | 'prism', count}}], run(api, hero) } }
enemies: { slime: { name, look: 'slime', hp: 145, atk: 41, every: 2, first, weak: 'ember', attack: 'leap' | 'bolt' | 'swoop' | 'slam',
                    boltColor, h (height x a hero), hover, boss, special: {every: 2, name: 'Quake', mult: 1.7}, tint: 'hue-rotate(40deg)' } }
```

Built-ins: `GameDNA_Match3Battle.GEMS` (ember, tide, grove, spark, heart), `HEROES` (knight, archer, herbalist, keeper),
`SKILLS` (valor, volley, bloom, ward), `ENEMIES` (slime, wolf, imp, wisp, harpy, skeleton, cultist, golem). Pass your own
tables to `create` (the instance uses those objects, so entries added later are seen by the next battle).
`api` (skills' `run`, gems' `onClear`): `damage(target | 'all', amount, src)`, `heal(n)`, `ward(n)`, `delay(turns)`,
`convert(to, count, from)`, `make(sp, count)`, `foes()`, `target()`, `party()`, `heroes()`, `board()`, `rng()`, `banner(text, sub, color)`.

## API

```js
var m3 = GameDNA_Match3Battle.create({
  view: {x, y, w, h},          // where to draw, in your logical px (wide 960 x 540 or tall 540 x 960 base, fitted, centred)
  seed, gems, heroes, skills, enemies, params: {specials, combo, weakMult, speed, hints, numbers, layout: 'auto' | 'wide' | 'tall'},
  drawActor(ctx, a) -> true,   // a = {id, kind: 'hero' | 'foe', look, x, footY, h, lift, squash, facing, target, flash, alpha, tint, portrait}
                               // flash 0..0.4 on a hit: keep the sprite opaque and in full colour; show the hit as a bright rim
                               // around its outline (alpha flash / 0.4), plus a light tint inside it for the first 2 frames
                               // (offscreen layer, source-atop). Never lower its alpha, never wash it white.
  actorBox(a) -> {x, y, w, h}, // the drawn box (anchors, unit rects); default 0.62 h wide
  drawBackdrop(ctx, rect, info) -> true,   // rect = the stage {x, y, w, h, groundY}
  drawIcon(ctx, key, x, y, size) -> true,  // skill / ward icons (keys from the tables)
  onHit(hit), onEvent(ev), onEnd(result, info)
});
m3.start({waves: [['slime', 'slime'], ['wolf']], seed, name, stage, party: ['knight', ...]});
m3.update(stepMs)                 // every fixed step; 0 (or skip) while your world is frozen
m3.drawScene(ctx); /* your effects */ m3.drawUI(ctx);
m3.key('up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'target' | '1'..'4'); m3.pointer('down' | 'move' | 'up', x, y);
m3.setAuto(on); m3.swap(i, j); m3.cast(heroIndex); m3.target(foeId)
m3.state(), m3.actors(), m3.anchor(id), m3.unitRects(), m3.uiRects(), m3.fieldRect(), m3.boardRect(), m3.cellRect(i),
m3.moves(), m3.board(), m3.foes(), m3.heroes(), m3.party(), m3.phase(), m3.busy(), m3.events() (with start({log: true})),
m3.setBoard(rows) (tests and demos), m3.lib, m3.api, m3.rng()
GameDNA_Match3Battle.rules     // pure board rules: runs, groups, valid, moves, fill, reshuffle, gravity, expand, prismSwap
GameDNA_Match3Battle.paintGem(ctx, def, x, y, r, sp, t), .text(ctx, s, x, y, o)
```

- `hit = {kind: 'damage' | 'heal', source, target (foe id, hero id or 'party'), enemy, attacker, defender ('party' for hits
  on the heroes), amount, raw, hpBefore, hpAfter, killed, crit (weakness or foe special), weak, skill, ward, x, y}`. Read-only:
  it runs on the impact frame, after the module wrote HP.
- Events carry `kind`, `turn`, `t` (battle ms). `idle` = the board waits for the player.
- Indices: cell `i = row * 8 + col`, row 0 at the top.

## Integration (15 lines)

```js
var m3 = GameDNA_Match3Battle.create({ view: {x: 0, y: 0, w: 960, h: 540}, seed: 7,
  drawActor: (g, a) => { mySprite(g, a.look, a.x, a.footY - a.lift, a.h, a.facing, a.flash, a.alpha); return true; },
  drawBackdrop: (g, r) => { myBackdrop(g, r); return true; },
  onHit: hit => myFeedback(hit), onEvent: ev => mySounds(ev), onEnd: (result, info) => myEndBattle(result) });
m3.start({ waves: [['slime', 'slime'], ['wolf']], seed: 7 });
// every fixed 60 Hz step:   m3.update(1000 / 60);
// drawing:                  m3.drawScene(ctx); myEffects(ctx); m3.drawUI(ctx);
// input:                    keys -> m3.key(k); pointer -> m3.pointer(type, x, y) in your logical px
// autoplay:                 m3.setAuto(true)
```

## Phones

`layout: 'tall'` (or `'auto'` with a view taller than wide) puts the stage on top, the hero cards and the party bar under
it and the board below (cells 61 logical px). HUD text in the tall layout is never under 16 logical px (11 CSS px when 540
logical px are shown 390 CSS px wide). Pick the layout when the page loads; the game itself does not change.

## Common mistakes

- The board starts with matches or the bot stalls -> you filled cells yourself; let `start` fill the board.
- A different battle on each reload -> pass a seed; never use `Math.random` in content code (use `api.rng()`).
- Gems jump or swaps snap -> `update()` is called with 0 or skipped during play; call it every step.
- Foes face away -> you mirrored sprites yourself; draw with `a.facing` (heroes right, foes left).
- Numbers twice -> your own number system draws from `onHit`; set `params.numbers: 'off'`.
- Text too small on phones -> the canvas is scaled below 540 logical px for the tall layout; keep the logical size.

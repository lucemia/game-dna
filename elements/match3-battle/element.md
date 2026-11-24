# A-17 Match-3 battle board

## What it is

A puzzle battle on an 8 x 8 board of faceted gems. The player swaps two neighbours to line up 3 or more of one colour;
matches pop, the gems above fall, new gems drop in from above and new runs clear again as cascades, each step worth 25%
more ("COMBO x3" badge). Four in a row leaves a Row or Column shard (it clears its line when it clears), an L or T a Blast
gem (3 x 3), five in a row a Prism (swap it with any gem: that colour clears; with a shard or Blast that colour turns into
it and fires). Each colour powers one hero: after the board settles, every hero whose colour cleared attacks the target
(weakness x1.5) and charges a skill; hearts heal the party. Foes show a countdown that drops each turn; at 0 they strike
(melee foes leap at the front hero, casters throw bolts, a boss slams), some with a named special every few attacks. Ward
absorbs hits. Skills (Valor Strike, Arrow Rain, Mending Bloom, Lantern Ward) cost no turn. Waves follow one another;
the battle ends in victory or when the party's shared HP runs out.

Every gem colour has its own silhouette (cushion-cut Ember, droplet Tide, hexagon Grove, star Spark, heart) so the board
reads without colour. A new board never holds a match and always has a move; when no move is left, the board reshuffles
(swirling, "NO MOVES" banner). Refills come from one seeded generator in a fixed order, so cascades are reproducible; the
whole battle is seeded and frame-stepped (`?t=&freeze=1` exact) and the same at any window size (wide: stage left, board
right; tall: stage on top, board below for phones). A bot targets, casts ready skills and swaps through the player's own
input path. The starter (Shardbound) strings three stages of two waves on the demo-kit painted cast and backdrops.

## Default parameters

| key | default | meaning |
|---|---|---|
| `specials` | on | Row / Column shards, Blast gems and Prisms ('off': plain matching) |
| `combo` | 0.25 | weight added per cascade step (step n weighs 1 + 0.25 (n - 1)) |
| `weakMult` | 1.5 | damage against a foe weak to that colour |
| `speed` | 1 | animation speed (the rules never change) |
| `hints` | on | a valid move wobbles after 6 s without input (never under autoplay) |
| `numbers` | on | built-in damage and heal numbers ('off' for a number addon) |
| `layout` | auto | wide (960 x 540 base) or tall (540 x 960 base), from the view's shape |

Rules constants: hero hit = atk x (weighted gems of its colour) / 3, rounded, at least 1; heart heal = 1.8% of max HP per
weighted heart; foe damage = atk (x special mult), ward first; swap 170 ms, pop 250 ms, falls accelerate at 70 cells/s^2 up
to 15 cells/s (at most 0.25 cell per frame); the cursor glides at most 0.34 cell per frame.

## Variants

- **Standard**: specials on, +25% per cascade.
- **Plain matching**: no specials; runs only.
- **Big cascades**: +50% per cascade step.
- **Quick playback**: animations at 2x.
- **Phone layout**: the tall layout at any size.

## Interface

Needs: a party (hero ids), waves of enemy ids and a seed per battle; gem, hero, skill and enemy tables (built-ins ship); a
fixed 60 Hz step; key or pointer input while the battle runs; `drawActor` / `drawBackdrop` hooks for the game's own art
(a code-drawn fallback figure ships); a place to go when it ends.

Provides: `create(options)` -> `start`, `update`, `drawScene`, `drawUI`, `key`, `pointer`, `setAuto`; commands `swap`,
`cast`, `target`, `setBoard` (tests); `onHit(hit)` per HP change on its impact frame, `onEvent` (battleStart, waveStart,
spawn, idle, select, swap, match, special, fire, clear, cascade, fall, settle, heroAttack, heal, skillReady, skill,
convert, ward, delay, foeTurn, foeAttack, partyHit, death, reshuffle, waveClear, end), `onEnd(result, info)`; `anchor(id)`,
`unitRects()`, `uiRects()`, `fieldRect()`, `boardRect()`, `cellRect(i)`, `moves()`, `board()`, `actors()`, `state()`, and
the pure board rules as `GameDNA_Match3Battle.rules`. The starter adds `GAME.addGem / addSkill / addHero / addEnemy /
addStage`, `GAME.addons` hooks, `GAME.held`.

## Screen rules

- Wide (960 x 540): top bar (12, 8, 456 x 34) with stage, wave pips and turn; stage (12, 48, 456 x 282) with the backdrop,
  heroes on the left in two staggered rows (front: Knight, Herbalist), foes on the right in up to three slots, each with a
  plate under its feet (countdown badge, HP bar with the number, the weakness gem; the target's name above it); four hero
  cards (12 + 116 i, 338, 108 x 104: portrait, name, ATK / HP, charge bar, skill name, READY [n] with a pulsing gold
  border); party bar (12, 450, 456 x 38) with HP and the ward pill; info strip (target, "attacks in n", weakness);
  board (484, 38, 464 x 464), cells 56 px. Tall (540 x 960): top bar, stage (12, 52, 516 x 246), cards (123 x 100), party
  bar, board (18, 456, 504 x 504), cells 61 px; HUD text never under 16 logical px (11 CSS px at 390 px wide).
- Gems: faceted rim lit from the upper left, a gradient table, inner glow, a dark outline, a rim light, a glint; one
  silhouette per colour; a twinkle now and then. Shards: two light bands and outward chevrons along their line; Blast: a
  gold setting with four studs and a pulsing halo; Prism: a round brilliant with a turning rainbow table.
- Motion: the swapped pair slides (170 ms, eased; a refused swap slides back); popped gems swell, flash white and shrink
  with sparks; new gems fall in from above the board and land with a small squash; reshuffles swirl every gem to its new
  cell; orbs fly from cleared gems to their hero's card (hearts to the party bar). Shards fire a beam along their line,
  Blasts and Prisms a ring.
- Characters (drawn by the host): heroes face right, foes face left. The Knight leaps at the foe in front and slashes;
  the Archer shoots an arrow, the Herbalist a water orb, the Keeper a spark. Every foe attack has a wind-up (it leans back
  and crouches, a red glow; a boss or a special also rings the target's feet in dashed red), a fast strike (a leap, a
  swoop, a lunge or a bolt) and a recovery; the damage lands on the impact frame with a hit-stop (40 ms, 70 ms for a
  slam), a dust ring and a shake; the boss slam rises, then drops forward. A hit keeps the target in full colour and
  opaque: a bright rim around its outline and, for 2 frames, a light red tint inside it (offscreen layer); foes appear in a summoning ring and fade out when they fall. A
  gold chevron and a red ring mark the target.
- Banners (one at a time, at least 0.9 s each, fading): WAVE n / n with the foes' names, skill names, foe specials,
  NO MOVES, VICTORY / DEFEAT, at the top of the stage. The combo badge sits at the top right of the stage. Numbers rise
  from their owner's head (slot kept, never re-shown). Nothing is ever drawn over the board except the board's own effects.

## Common mistakes (symptom -> fix)

- The board starts with a match or the bot stalls -> the host filled cells; let `start` fill the board.
- Gems snap, swaps teleport -> `update()` is skipped or called with 0 during play; call it every step.
- A different battle each reload, or a different one on a phone -> no seed, or `Math.random` in content code (use `api.rng()`).
- Foes face away from the heroes -> the host mirrored sprites itself; draw with `a.facing`.
- Taps miss gems -> pointer coordinates in page px; pass logical px.
- Unreadable HUD on phones -> the wide layout squeezed into 390 px; use the tall layout at 540 logical px across.
- Two sets of numbers -> the host's numbers draw from `onHit`; set `params.numbers: 'off'`.

## Acceptance moments

Starter (`starter/index.html`, autoplay on in stills, 1280 px wide unless noted; the event each still must show is in
`checks/state.json` -> `events`, checked by `checks/moments.py`):
- `?t=1000&freeze=1`: title (logo, gem row, party and foes on the meadow).
- `?t=2000&freeze=1`: the stage card "Stage 1 of 3: Meadow Road" with its foes.
- `?t=5150&freeze=1`: **swap** in progress (step `swap`: two gems halfway between their cells).
- `?t=8000&freeze=1`: **heroAttack** (a hero strikes a slime, its number rises, a combo badge fades).
- `?t=14700&freeze=1`: **cascade** (COMBO x6: gems popping and falling, sparks).
- `?t=20600&freeze=1`: **skill:valor** (VALOR STRIKE banner, the Knight casting at the targeted foe).
- `?t=50000&freeze=1`: **foeAttack** on the Mirrormere Shore (a bolt in flight from a foe to a hero, three foes with plates).
- `?t=165150&freeze=1`: **foeAttack** of the Barrow Colossus, wind-up: it rises high and leans back, glowing red; a dashed
  red ring at the Knight's feet.
- `?t=165470&freeze=1`: **partyHit**, just after the impact: the Colossus has dropped forward with its fist on the Knight
  (a warm flash at the contact point, the slammed pose holds), soft dust behind their feet; the Knight in full colour with a
  bright rim, the number fading in above him.
- `?t=172750&freeze=1`: **prism** (a Prism swapped: every gem of one colour popping).
- `?t=222000&freeze=1`: **victory** card with stars per stage.
- Phone: `?t=50000&freeze=1` and `?t=165150&freeze=1` at 390 x 844 and 500 x 900 (tall layout).
Demo (`demo/index.html`, preset boards; one scripted swap each): `?preset=line&t=3400&freeze=1` a Row shard formed;
`?preset=shard&t=3350&freeze=1` a shard's beam clearing its row; `?preset=blast&t=3400&freeze=1` a Blast gem formed;
`?preset=boom&t=3350&freeze=1` the 3 x 3 ring; `?preset=prism&t=3400&freeze=1` a Prism formed;
`?preset=rainbow&t=3560&freeze=1` a Prism clearing a colour; `?preset=reshuffle&t=2600&freeze=1` NO MOVES and the swirl;
`?t=9000&freeze=1` the bot's battle against imps and a wisp.
- `?auto=1` reaches THE ROAD IS CLEAR with no errors; a player who swaps at random loses (checks/rules.json `outcome`).

# Add a match-3 battle board to this game

You are adding a puzzle battle to an existing game: swap neighbouring gems on an 8 x 8 board to line up 3 or more;
cascades chain, each colour powers one party member, hearts heal, foes strike when their countdown hits 0. Use the module `match3-battle.js` (global `GameDNA_Match3Battle`) and its
`README.md`: it owns the rules, the board, the gem art, the battle HUD and a bot. Do not edit the module.

## First, read the game

Find: the fixed update step, where it draws, how input arrives, where an
encounter starts and ends, the autoplay or test mode, the party and enemies (names, sprites, stats), the logical screen size.

## Decide how the game maps onto the battle

- The battle is a mode of the game: it starts where the game starts an encounter and hands back a result.
- Party members become heroes `{name, gem, atk, hp, skill, look, attack}`, one gem colour each (four colours plus hearts
  ship); enemies become enemy entries `{name, look, hp, atk, every, weak, attack}`; abilities become skills with data
  effects.
- Characters are drawn by the game: pass `drawActor(ctx, a)` that draws the sprite named `a.look` with its feet at
  `(a.x, a.footY - a.lift)`, height `a.h`, facing `a.facing`, white flash `a.flash`, opacity `a.alpha`, and returns true.
  Use the game's own art; never mirror art with a one-sided weapon or light. Show `a.flash` as a bright rim around the
  sprite (offscreen layer); keep the sprite opaque and in full colour. `drawBackdrop(ctx, rect)` draws the scenery.

## Wire it

1. Create one instance where the battle mode starts: `GameDNA_Match3Battle.create({view, seed, gems, heroes, skills,
   enemies, params, drawActor, drawBackdrop, onHit, onEvent, onEnd})`, then `start({waves, seed})` per encounter. `view`
   is in logical pixels; 16:9 gets the wide layout, portrait the tall one (phones).
2. Call `update(stepMs)` once per fixed step where the game steps its world, fast-forwards included; 0 while paused.
3. Draw `drawScene(ctx)`, then the game's own effects, then `drawUI(ctx)`. Nothing may cover `boardRect()`; place extra UI
   outside `uiRects()`.
4. Route input while the battle runs: keys to `key('up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'target' |
   '1'..'4')`, pointer to `pointer('down' | 'move' | 'up', x, y)` in logical pixels. Hook the game's autoplay to
   `setAuto(true)`; keep every key working.
5. In `onEnd(result, info)` run the game's existing win / lose code exactly once.
6. Damage feedback the game already has (numbers, shakes, sounds) goes in `onHit(hit)` (read-only, on the impact frame);
   then set `params.numbers: 'off'` so numbers do not appear twice.

## Rules you must not break

- Seeded: the same seed and inputs give the same battle at any window size. No `Math.random` in your content code.
- Boards never start with a match and always offer a move: let `start` fill the board; never set cells yourself.
- Every swap and fall animates; the game must not move gems or characters itself.
- Heroes face right toward the foe they strike, foes face left toward the hero they strike.
- HUD text stays readable on a 390 px wide phone and never covers the board.

## Check before you finish

- The game's autoplay still reaches its end without console errors; a fast-forward shows the same frame on every load.
- A swap that matches nothing slides there and back and costs no turn; 4 in a row leaves a shard; a cascade shows
  "COMBO x2"; a foe at 0 attacks.
- At 390 px nothing overflows sideways and the HUD is readable.

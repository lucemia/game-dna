# card-battle.js (A-10 module, v1.1.0)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_CardBattle`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns a turn-based **card battle with intents**: a fanned hand you drag onto a foe (a target arrow follows), or pick with keys or taps; Lumen (energy) per turn; draw, discard and faded piles with a seeded reshuffle; foes that show what they will do next (an intent tag with the real numbers) and then do exactly that; ward (absorbs damage, drops at the start of its owner's turn), attacks and statuses; end turn; a bot that plays the same way a player does. Everything runs on a fixed step: `?t=&freeze=1` stills and `?auto=1` runs are deterministic.

It draws at 640x360 logical px (mapped into `view`), HD and devicePixelRatio-friendly when the host scales its context: front-view stage with built-in painted foes, the hero panel (portrait, HP, Lumen pips, ward, statuses), intent tags, foe plates, hand, piles, end-turn button, banners, effects and hit numbers. Original names and art only.

## Content is data

Three tables, merged over the built-ins (`GameDNA_CardBattle.CARDS / ENEMIES / STATUSES`) by `create({cards, enemies, statuses})`. Ids are strings; an entry with the same id replaces the built-in.

```js
// a card
'ember-toss': { name: 'Ember Toss', cost: 1, type: 'attack', target: 'enemy', rarity: 'common', art: 'fire',
  text: 'Deal {damage} damage. Apply 2 Burn.', effects: [{ do: 'damage', n: 4, type: 'fire' }, { do: 'status', id: 'burn', n: 2 }] }
// a foe
'mire-toad': { name: 'Mire Toad', hp: [24, 28], look: 'toad', palette: { body: '#5f8f3e' }, moves: {
  lash:  { name: 'Tongue Lash', effects: [{ do: 'damage', n: 7 }], weight: 2 },
  swell: { name: 'Swell', effects: [{ do: 'ward', n: 6, to: 'self' }, { do: 'status', id: 'might', n: 1, to: 'self' }] } } }
// a status
burn: { name: 'Burn', kind: 'debuff', stack: 'intensity', tick: true, color: '#ff9a3c', glyph: 'burn', text: 'Loses {n} HP at the end of its turn, then 1 less.' }
```

| card field | meaning |
|---|---|
| `name`, `cost` (Lumen), `type` | `attack` / `skill` / `charm` (charms leave the fight once played, like `fade`) |
| `target` | `'enemy'` = aimed at one foe (arrow), `'none'` = no aim (self, all foes or random) |
| `effects` | in order: `{do: 'damage', n, hits, to: 'target' \| 'all' \| 'random', type}`, `{do: 'ward', n}`, `{do: 'status', id, n, to: 'target' \| 'all' \| 'self' \| 'random'}`, `{do: 'draw', n}`, `{do: 'energy', n}`, `{do: 'heal', n}`, `{do: 'lose', n}`, or a function `api => {...}` (below). Each damage hit is its own impact. |
| `text` | `{damage}` / `{damage2}` = the first / second damage effect with Might, Sapped and the aimed foe's Exposed applied (green above, red below the printed value); `{ward}` = the first ward |
| `rarity` | `common` / `rare` / `epic` (frame colour); `art`: illustration key (built-in glyphs: blade, guard, fire, frost, storm, root, light, magic, heart, speed; anything else = a gem) |
| `fade` | removed for the rest of the fight once played; `keep`: stays in hand at end of turn; `unplayable`; `pool` (the starter's reward flag) |

| foe field | meaning |
|---|---|
| `hp` | number or `[min, max]` (rolled from the fight seed) |
| `moves` | `{id: {name, effects, weight, intent: 'hidden'}}`. Foe effects default to the hero; `to: 'self'` (itself), `'allies'` (every living foe). |
| `pattern` | `[move ids]` repeated, or `({enemy, turn, last, hist, rng, hero, foes}) => moveId`. Without it: a weighted pick that never repeats a move a third time. Picked when the intent is rolled (start of fight, and after each foe phase). |
| `look` / `palette` / `size` / `box` | built-in painter `toad wisp brute imp thief golem slime bat`, colours `{body, belly, accent, eye}`, scale, sprite box `[w, h]` for custom drawing. Or `draw(ctx, unit, {t, act, flash, seed})` with origin at the feet (up is -y). `boss: true` |

| status field | meaning |
|---|---|
| `kind` | `buff` / `debuff` (intent glyph); `stack`: `intensity` (stays) or `duration` (minus 1 at the end of its owner's turn) |
| rules | `dealtAdd` (adds its stacks to each hit the owner deals), `dealtMul` / `takenMul` (multiply while > 0), `tick` (loses that HP at its owner's turn end, ward does not stop it, then minus 1), `barbs` (an attacker takes that much back), or code `onTurnEnd(unit, n, api)` |
| look | `name`, `color`, `glyph` (`might barbs exposed sapped burn`, else a dot), `text` |

Built-in statuses: Might (+n per hit), Barbs, Exposed (takes x1.3), Sapped (deals x0.7), Burn. Damage of one hit = floor((n + Might) x 0.7 if Sapped x 1.3 if the target is Exposed); ward absorbs first.

**Code effects** get `api = {state, source, target, hero, card, foes(), rng(), damage(unit, n), rawDamage(unit, n), ward(unit, n), heal(unit, n), status(unit, id, n), draw(n), energy(n)}`. Use `api.rng()`, never `Math.random`; the bot's look-ahead runs the same code on a copy.

## API

`GameDNA_CardBattle.create(options)` returns an instance.

| option | meaning |
|---|---|
| `view` | `{x, y, w, h}` in your logical canvas px (default 640x360 at 0,0) |
| `seed` | default seed; `start({seed})` per fight |
| `params` | `energy` 3, `draw` 5, `handMax` 10, `speed` 1 (timing only), `numbers` `'on'`, `intents` `'on'`, `arrow` `'on'`, `fan` 6 (degrees per card), `shake` `'on'`, `hitstop` `'on'`, `light` `'on'` (rim, key and fill light on foes), `reduced` `'off'`, `botNodes` 1400 |
| `cards`, `enemies`, `statuses` | tables merged over the built-ins (live afterwards in `inst.lib`) |
| `onHit(ev)` | every HP change on its impact frame, after HP was written (below) |
| `onEvent(ev)` | every rules event: `intent`, `turn`, `ready`, `draw`, `reshuffle`, `play`, `damage`, `heal`, `ward`, `status`, `death`, `discard`, `fade`, `endTurn`, `act`, `actDone`, `gain`, `end` |
| `onTurn(turn, side)` | `side` `'player'` when your turn starts, `'enemy'` when you end it |
| `onEnd(result, info)` | once, about 1.2 s after the last blow: `result` `'win'` / `'lose'`, `info = {turns, hero: {hp, maxHp}, stats: {played, dealt, taken, reshuffles}, deck}` |
| `drawBackground(ctx, view, t)`, `drawEnemy(ctx, unit, o, def)` (true = drawn), `drawArt(ctx, key, rect, card)` (true = drawn: e.g. an L-07 illustration cover-fitted into `rect`) | your art |
| `autoplay` | `true`, or a function `inst => {uid, target} \| 'end' \| undefined` (undefined = the built-in bot) |
| `skin` | optional `GameDNA_Skin` id (a smooth skin's UI font) |

| method | |
|---|---|
| `start({deck: [ids], foes: [ids or {id, hp}], hero: {id, name, hp, maxHp}, seed, energy, draw})` | a new fight: intents rolled, the deck shuffled, the first hand dealt |
| `update(stepMs)` | every fixed step (0 = frozen: nothing moves) |
| `drawScene(ctx)`, `drawUI(ctx)` (or `draw(ctx)`) | stage, foes, plates, intents, effects, numbers / hero panel, piles, end turn, readout, hand, arrow, banner |
| `key(k)` | `'left' 'right' 'up' 'down' 'ok' 'back' 'end'`; returns true when used. Left / right move along the hand (past the last card = END TURN), Z lifts a card, Z again plays it (aimed cards: left / right pick the foe first), X drops it, E ends the turn. A press while a card resolves is kept and applied after. |
| `pointer(type, x, y)` | `'down' 'move' 'up' 'cancel'` in your logical px: drag a card (aimed cards: onto a foe; others: above the hand), or tap a card then tap a foe (tap an unaimed card twice); tap END TURN |
| `play(uid, targetId)`, `endTurn()` | the same as a player; false when not allowed |
| `phase()` | `idle` `player` `busy` `enemy` `ending` `won` `lost`; `busy()`, `over()` |
| `hero()`, `foes()`, `hand()`, `piles()` `{draw, hand, discard, faded, inPlay, deck, energy, energyMax}`, `intentOf(id)` `{move, name, icons, damage, hits}` | live state (read-only) |
| `anchor(id)` | `{x, top, left, w, h, cy, footY, dead, side}` where the unit is drawn now (a foe's lunge included); the hero (`'hero'`) is its portrait |
| `unitRects()`, `uiRects()`, `cardRects()`, `fieldRect()` | sprite boxes and plates with `id` / every panel, intent tag (`owner`), card, banner of the last drawn frame (see "Placing numbers and labels") / hand cards / the stage above the hand |
| `setAuto(on)`, `auto()`, `recommend()` | the bot; it lifts, aims and plays through the same path as a player |
| `hitStop(ms)`, `setParams(p)`, `params()`, `addCard(id, where)` | freeze; live params; add a card mid-fight (`'hand' 'draw' 'discard'`) |
| `drawCard(ctx, id or card, x, y, w, opts)`, `drawCardBack(ctx, x, y, w)`, `cardView(id)`, `text(...)` | the card frame for reward screens and menus (height 1.5 w) |
| `state()`, `log()`, `lib` | summary for tests, last 400 events, the live content tables |

Static: `GameDNA_CardBattle.CARDS / ENEMIES / STATUSES / LOOKS / PALETTES`, `drawCard(ctx, card, x, y, w, opts)`, `cardText(def)`, `drawIntent`, `drawStatus`, and `rules` (pure functions for tests: `newState`, `playSteps`, `endTurnSteps`, `runAll`, `cloneState`, `intentView`, `botPlan`, `mkRng`, `shuffle`).

**onHit `ev`** = `{kind: 'damage' | 'heal', source, target, side: 'hero' | 'foe', raw (before ward), blocked (taken by ward), amount (HP actually lost or gained), hpBefore, hpAfter, killed, type ('physical' 'fire' 'frost' 'shock' 'light' 'burn' 'thorns' 'heal'), tag (null, 'tick' = Burn, 'barbs'), card, move, anchor}`. Read-only: change outcomes through the tables.

## Integration (15 lines)

```js
// <script src="card-battle.js"></script> before your game script
const battle = GameDNA_CardBattle.create({ view: { x: 0, y: 0, w: 640, h: 360 }, seed: 7, cards: MY_CARDS, enemies: MY_FOES,
  drawBackground: (ctx, v, t) => drawMyBackdrop(ctx),
  onHit: ev => myFeedback(ev),                          // numbers, sounds; never change HP here
  onEnd: (result, info) => { hero.hp = info.hero.hp; result === 'win' ? myVictory() : myDefeat(); } });
function enterBattle() { battle.start({ deck: hero.deck, foes: ['mire-toad', 'ash-wisp'], hero: { hp: hero.hp, maxHp: hero.maxHp, name: hero.name }, seed: encounterSeed }); battle.setAuto(autoplayOn); }
function step() { battle.update(frozen ? 0 : 1000 / 60); }        // every fixed step, every loop that steps the game
function render(ctx) { battle.drawScene(ctx); drawMyEffects(ctx); battle.drawUI(ctx); drawMyHud(ctx); }
addEventListener('keydown', e => { const k = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', z: 'ok', Enter: 'ok', x: 'back', e: 'end' }[e.key]; if (k && inBattle) battle.key(k); });
canvas.addEventListener('pointerdown', e => battle.pointer('down', ...toLogical(e)));
canvas.addEventListener('pointermove', e => battle.pointer('move', ...toLogical(e)));
canvas.addEventListener('pointerup', e => battle.pointer('up', ...toLogical(e)));
```

## Placing numbers and labels

Another element's damage numbers, barks or toasts avoid `unitRects()`, `uiRects()` and the live intent tags. `uiRects()` is the last drawn frame, so a hit before a fight's first frame (a `?t=` fast-forward) sees no tags there; take them from the live state:

```js
const k = view.h / 360;   // module px -> your logical px
const intentRects = () => battle.foes().filter(f => f.hp > 0 && battle.intentOf(f.id) && battle.anchor(f.id)).map(f => {
  const a = battle.anchor(f.id), tip = Math.max(a.top - 4 * k, view.y + 64 * k);   // tag tail tip: above the sprite, below the top band
  return { name: 'intent', owner: f.id, x: a.x - 50 * k, y: tip - 34 * k, w: 100 * k, h: 36 * k }; });
const avoid = () => battle.unitRects().concat(battle.uiRects(), intentRects());   // e.g. damage-pop getObstacles
```

## Keep it honest

- An intent tag is the move the foe will make: it is rolled once and acted unchanged; its number is computed live with the same damage formula (statuses the move applies before its own hits count), so what the tag shows when the foe acts is what it deals before ward. `checks/sim.mjs` and the judge probe count both.
- `draw + hand + discard + faded + inPlay = deck` at every step; Lumen never goes below 0; HP stays in `[0, maxHp]`.
- Nothing else may change HP or piles during a fight; `onHit` and `onEvent` are for feedback.
- No `Math.random` or clock in your effects, patterns or hooks: use `api.rng()` / `o.rng()`.

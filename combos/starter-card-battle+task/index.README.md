# A-10 starter: The Lantern Road (card battle with intents)

`index.html` is a complete single-file card game. You carry a lantern down a road of four stops: a mire toad and an ash wisp on the sunken path, a moss brute on the old stone bridge, cinder imps and a lantern thief in the charred orchard, and the bramble golem at the heart of the briar. Each stop is a card battle: five cards a turn, three Lumen to spend, a deck that reshuffles its discard pile when it runs out. Every foe shows what it will do next (an intent tag with the real numbers) and then does exactly that. After a won fight you rest (+14 HP) and may add one of three cards to your deck. All art is original procedural HD at 640x360 logical px (devicePixelRatio-aware); the UI is in English.

It is the system element of a basket. Build your game from this file and plug addons and new content into the extension points below rather than editing the battle flow.

## Run

| URL / key | Effect |
|---|---|
| `?auto=1` | the computer plays the whole road (it lifts, aims and plays cards through the same input path, picks rewards) |
| `?t=<ms>&freeze=1` | fast-forward the deterministic 60 Hz simulation (autoplay on unless `&auto=0`), draw one frame; `<html data-state>` then holds `GAME.state()` |
| `?seed=n`, `?speed=0.25..4`, `?reduced=1` | fight seeds, playback speed, no shake / flash |
| drag a card | aimed cards onto a foe (a target arrow follows), others up out of the hand; or tap a card, then tap a foe (tap an unaimed card twice) |
| Left / Right, Z / Enter / Space, X / Esc, E | choose a card (right of the last card = END TURN), lift it, play it (aimed cards: Left / Right pick the foe, Z plays), drop it, end the turn. Reward: Left / Right, Z takes, X skips |
| P | toggle autoplay (any other game key takes over from autoplay) |

A run under `?auto=1` takes about 140 s of game time (seed 7: four wins, 23 turns, 32 HP left). Seeds 1-7: six of seven runs reach the end of the road; the bot can lose the boss fight (seed 2), which also ends the run (THE LANTERN GOES OUT). Under 760 px wide a 13 px HTML caption under the canvas (`#info`) mirrors HP, Lumen and every foe's intent.

## Structure

Five `<script>` blocks, in order:

1. `ART`: the backdrops (marsh, bridge, orchard, briar, title), cached at device resolution, plus fog, motes and lantern light per frame.
2. `GameDNA_CardBattle`: `module/card-battle.js`, verbatim. It owns the rules, the intents, the bot, the hand, the target arrow, the foes, the hero panel, the effects and numbers.
3. The game. It defines `window.GAME` and boots on `DOMContentLoaded`.
4. **ADDONS SLOT**: an empty, marked block where addons and new content go.

The game script has numbered sections (search for the `=== n.` banners):

| # | Section | What is there |
|---|---|---|
| 1 | Config and content | URL flags, `CARDS` / `ENEMIES` / `STATUSES` (added to the module's built-ins), `START_DECK`, `REWARD_POOL`, `FIGHTS` (name, theme, foes, boss), `HERO`, `REST_HP`, `ENERGY`, `DRAW` |
| 2 | Game object | `game` (= `window.GAME`): the public surface and extension points |
| 3 | Battle setup | `makeInstance()` (one `GameDNA_CardBattle.create(...)`), `newGame()`, `startBattle()`, `endBattle()` |
| 4 | Hit site | `hitSite(ev)`: big-hit flash, then the addons' `onHit` |
| 5 | Scenes | title, road (the map between stops), battle, reward (rest + pick 1 of 3), victory, defeat; `sceneAuto()` |
| 6 | Main tick | `tick()`: input chain → scene autoplay → `C.update()` → effects → addons' `update` |
| 7 | Drawing | `render()`: `C.drawScene` → `draw(g, 'fx')` → flash → `C.drawUI` → top bar / scene panels → `draw(g, 'overlay')` → `drawUI(g)` |
| 8 | Input | key queue (a 0 ms tap counts), pointer down / move / up queue, `GAME.held` |
| 9 | Boot | `boot()` after the ADDONS SLOT (waits for `GAME.holdBoot()` releases): `?t` fast-forward or the main loop; `GAME.step(n)`, `GAME.render()`, `GAME.press(key)` for tests |

`C.update()` runs on every tick of a battle. Never gate it on a menu or an animation.

## Extension points

**Where addons and content go: the ADDONS SLOT.** Paste each addon's module and its `GAME.addons.push(...)`, and every `GAME.addCard / addEnemy / addStatus`, into the marked `<script>` block (or put `<script src>` tags right above it). The slot runs after `window.GAME` exists and **before the game boots**, so addons and content are there for the first fight and every `?t=&freeze=1` fast-forwarded frame.

```js
GAME.addons.push({
  name: 'my-addon',
  onHit(ev, game) {},              // every HP change of a battle, on its impact frame (read-only, see 1)
  onKey(key, game) { return false; },   // key = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'end' | 'auto' | {tap, x, y}; true consumes it
  update(game, info) {},           // every 60 Hz frame, every scene, also while frozen; info = {dt, frozen, paused, hitStop}
  draw(g, layer, game) {},         // layer 'fx' (battle: after foes, plates, intents and the module's effects, before the hand and panels) or 'overlay' (after every panel, every scene)
  drawUI(g, game) {},              // top UI hook: after everything, every scene
  onBattleStart(game) {}, onBattleEnd(result, info, game) {},
  onEvent(ev, game) {}, onPlay(ev, game) {}, onTurn(turn, side, game) {},
  onScene(scene, game) {}, onReward(cardIdOrNull, game) {}, onNewGame(game) {}
});
```

1. **Hit site.** The module writes the new HP, then calls `onHit`; the starter adds its big-hit flash and forwards to the addons (`hitSite`, section 4).
   - `ev = {kind: 'damage' | 'heal', source, target, side ('hero' | 'foe'), raw (before ward), blocked (absorbed by ward), amount (HP actually lost or gained), hpBefore, hpAfter, killed, type ('physical' | 'fire' | 'frost' | 'shock' | 'light' | 'burn' | 'thorns' | 'heal'), tag (null | 'tick' (Burn) | 'barbs'), card, move, anchor}`. A hit fully absorbed by ward has `amount` 0 and `blocked` > 0.
   - **Read-only.** Change outcomes through content (section 1 or `GAME.addCard / addEnemy / addStatus`): it runs inside the rules, so intents and the bot see it.
   - Built-in feedback: the module's hit numbers (`GAME.flags.builtinNumbers`), its impact shake (`GAME.flags.builtinShake`), the starter's big-hit flash (`GAME.flags.builtinFlash`). **An addon that draws its own damage numbers sets `GAME.flags.builtinNumbers = false`** (and `builtinShake = false` if it shakes itself).
   - Helpers: `GAME.shake(px, frames)`, `GAME.flash(color, frames, alpha = 0.3)` (both skipped under reduced motion), `GAME.hitStop(frames)` / `GAME.hitStopMs(ms)` (freezes the battle; it only delays it).
2. **Draw-effects slot.** `draw(g, 'fx', game)` runs on the 640x360 logical context (already scaled to the backing store) during a battle, inside the shake translate, after `C.drawScene` (backdrop, foes, plates, intent tags, the module's effects and numbers), before the hero panel, hand and banners. `draw(g, 'overlay', game)` runs after every panel in every scene.
3. **UI rects: `GAME.uiRects()`.** `[{name, x, y, w, h}]` in logical px from the last frame: the module's `hero`, `endTurn`, `drawPile`, `discardPile`, `turn`, `readout`, `banner`, each `card` in hand and each foe's `intent` tag (with `owner`), plus the starter's `stopTag`, `deckTag` and its scene panels (`title`, `roadPanel`, `rewardTitle`, `rewardCard`, `skip`, `endBox`). Place things outside them. They come from the last drawn frame, so a hit before a fight's first frame (a `?t=` fast-forward) sees no intent tags: also reserve the live intent rects (`intentRects()` in "Adding damage numbers"), which always contain the drawn tag.
4. **Unit anchor: `GAME.anchor(id)`** (live: it follows a foe's lunge when it acts) → `{x, top, left, w, h, cy, footY, dead, side}` in logical px; `top` is the top of the sprite (its intent tag sits just above it, listed in `uiRects()`), `x` the centre. The hero (`'hero'`) is its portrait in the bottom-left panel. `GAME.unitRects()` lists each living foe's sprite box and plate (name, HP bar, statuses) with its `id`, and the hero portrait: the obstacles to avoid. Foe ids are `<enemy id>-<n>` (`mire-toad-1`, `cinder-imp-2`): `GAME.C.foes()`; anchors answer for fallen foes too.
5. **Input chain.** Keys and taps are queued; each tick every key (and every pointer-down as `{tap, x, y}`) goes to the addons' `onKey` in array order; the first that returns `true` consumes it. Otherwise `auto` toggles autoplay, any other key during autoplay hands control to the player, then the scene handles it (battle: `GAME.C.key` / `GAME.C.pointer`). **`GAME.held`** (`{ArrowLeft: true, ...}` by `KeyboardEvent.key`) is maintained by keydown / keyup only: scenes, the reward window and addons' modals never clear it.
6. **Autoplay.** `GAME.autoplay.on` (`?auto=1`, P). In a battle the module's bot searches this turn's plays and lifts, aims and plays them through the real input path (about 0.6 s a card); `GAME.autoplay.pick = (offerIds, game) => index` overrides the reward pick (`-1` skips). Addons must not consume `ok` / arrows during autoplay unless they mean to: the `?t=` stills rely on it.
7. **World clock.** `GAME.clock = {frame, battleFrame, paused, stop}`. `GAME.pause(true)` stops the battle and the scene timers; `GAME.hitStop` freezes the next frames. Addons' `update(game, info)` runs every frame: `info.dt` = 16.67 ms, or 0 while frozen.
8. **Battle events.** `onBattleStart` after the hand is dealt; `onTurn(turn, 'player' | 'enemy')`; `onPlay(ev)` (`{uid, id, cost, energyBefore, target, type}`); `onEvent(ev)` for every rules event (`intent {unit, move, view}`, `act {unit, move, shown, name}`, `death {unit}`, `draw`, `reshuffle`, `status`, `ward`, `end {result}`, ...); `onBattleEnd(result, info)`; `onReward(cardId | null)`.
9. **Content.** In the ADDONS SLOT (or section 1):
   - `GAME.addCard(id, def, {deck: n, pool: true})`: a card (format in `module/README.md`), `n` copies in the starting deck, offered as a reward when `pool`.
   - `GAME.addEnemy(id, def, {fight: i})`: a foe, added to stop `i` (0-based; `{fight: GAME.fights.length, name, theme}` adds a stop at the end; `replace: true` empties that stop first). Without `look` it is drawn as a tinted slime; give `look` + `palette` or `draw(ctx, unit, o)`.
   - `GAME.addStatus(id, def)`: a status a card or move can apply.
   - The tables are also readable and editable as `GAME.cards`, `GAME.enemies`, `GAME.statuses`, `GAME.startDeck`, `GAME.rewardPool`, `GAME.fights`. `GAME.shipped` lists the ids this file ships with.
   - Card art: `GAME.drawArt = (ctx, key, rect, card) => true` draws an illustration into a card's art window (for example an L-07 painted pack, cover-fitted); return false to keep the built-in glyph. If images load asynchronously, take `const release = GAME.holdBoot()` in the slot and call `release()` when they are ready, so frozen stills include them.

`GAME.C` (the module instance, API in `../module/README.md`), `GAME.scene`, `GAME.fight`, `GAME.deck`, `GAME.hero`, `GAME.results`, `GAME.reward` and `GAME.state()` are readable.

## Adding damage numbers (e.g. C-11 damage-pop)

```js
GAME.flags.builtinNumbers = false;
// Intent tags, live: GAME.uiRects() is the last drawn frame, so it has no tags before a fight's first frame
// (a ?t= fast-forward hits before anything is drawn). Reserve each living foe's tag from its live anchor.
const intentRects = () => GAME.scene !== 'battle' || !GAME.C ? [] : GAME.C.foes()
  .filter(f => f.hp > 0 && GAME.C.intentOf(f.id) && GAME.anchor(f.id)).map(f => {
    const a = GAME.anchor(f.id), tip = Math.max(a.top - 4, 64);       // tag tail tip: 4 px above the sprite, never above y 64
    return { name: 'intent', owner: f.id, x: a.x - 50, y: tip - 34, w: 100, h: 36 }; });
const dp = GameDNA_DamagePop.create({ bounds: { x: 0, y: 0, w: 640, h: 360 },
  getAnchor: id => GAME.anchor(id),                                 // live position, the hero is its portrait
  getObstacles: () => GAME.unitRects().concat(GAME.uiRects(), intentRects()), onHitStop: ms => GAME.hitStopMs(ms) });
GAME.addons.push({ name: 'damage-pop',
  onHit(ev) { if (ev.kind === 'heal') { if (ev.amount > 0) dp.spawn(ev.target, ev.amount, 'heal'); return; }
    if (ev.amount > 0) dp.spawn(ev.target, ev.amount, 'damage', { type: ev.type === 'burn' ? 'fire' : ev.type === 'frost' ? 'ice' : ev.type === 'thorns' ? 'poison' : ev.type === 'light' ? 'arcane' : ev.type });
    else if (ev.blocked > 0) dp.spawn(ev.target, 0, 'block'); },
  update(game, info) { dp.update(info.dt); }, draw(g, layer) { if (layer === 'fx') dp.draw(g); }, onBattleStart() { dp.clear(); } });
```

## Adding a card and a foe

```js
GAME.addCard('glimmer-dart', { name: 'Glimmer Dart', cost: 0, type: 'attack', target: 'enemy', rarity: 'common', art: 'light',
  text: 'Deal {damage} damage. Draw 1 card.', effects: [{ do: 'damage', n: 3, type: 'light' }, { do: 'draw', n: 1 }] }, { deck: 2, pool: true });
GAME.addEnemy('fen-bat', { name: 'Fen Bat', hp: [14, 16], look: 'bat', palette: { body: '#3e4a5e' }, moves: {
  dive:   { name: 'Dive',   effects: [{ do: 'damage', n: 4, hits: 2 }] },
  shriek: { name: 'Shriek', effects: [{ do: 'status', id: 'exposed', n: 1 }, { do: 'ward', n: 4, to: 'self' }] } }, pattern: ['shriek', 'dive', 'dive'] }, { fight: 0 });
```

# A-17 starter: Shardbound (match-3 battle board)

A complete three-stage journey on `GameDNA_Match3Battle` (`../module/README.md`). Four heroes walk the Ember Road: the
Meadow Road (slimes, an ash wolf), the Mirrormere Shore (imps, a grave wisp, a gale harpy) and the Barrow Ruins (a barrow
guard, an ash cultist, the Barrow Colossus last), two waves each. Swap gems; every colour powers the hero of that colour
(Ember: Knight, Grove: Archer, Tide: Herbalist, Spark: Keeper) and charges a skill; hearts heal; foes strike when their
countdown reaches 0. Characters and backdrops are the repo's demo-kit paintings (`art/`, data URIs; `art/kit.js` draws them). A hit is drawn
on an offscreen layer in `drawActor` (section 3): the sprite stays opaque and in full colour, with a bright rim around its
outline and a light red tint for the first 2 frames.

## Run

Open `index.html` (needs `art/` beside it; works from `file://` and http).

- `?auto=1` the bot plays the journey (about 3.7 minutes of game time; the victory card from about 219 s); P toggles it.
- `?t=<ms>&freeze=1` fast-forwards to that moment under autoplay and draws one frame (`window.__frozen` turns true).
- `?seed=` (default 7), `?stage=2` starts at the second stage, `?layout=wide|tall` (default: tall under 760 px wide or in a
  portrait window, wide otherwise; the game is the same in both).
- Keys: arrows / WASD move the cursor, Z / Space / Enter picks up a gem, then an arrow swaps it (or Z on a neighbour), X
  drops it, 1-4 cast a ready skill, T / Tab next target, P autoplay. Pointer: drag a gem onto its neighbour, or tap one then
  the other; tap a foe to target it; tap a glowing hero card to cast.
- `window.__state()` = `{t, scene, layout, m3: <module state>, actors: [{id, kind, asset, x, y, facing, target, ...}]}`.

## Structure

`index.html` = the page, the module (inlined verbatim), the game script (sections `=== 1.` to `=== 9.`: config and content,
the game object, battle setup, the hit site, scenes, the main tick, drawing, input, boot) and the **ADDONS SLOT** `<script>`
at the end. Scenes: `title` -> `map` (the stage card) -> `battle` -> `map` ... -> `victory` / `defeat` -> `title`.

## Extension points

**Where addons and content go: the ADDONS SLOT.** Paste each addon's module and its `GAME.addons.push(...)`, and every
`GAME.addGem / addSkill / addHero / addEnemy / addStage`, into the marked `<script>` block (or put `<script src>` tags right
above it). The slot runs after `window.GAME` exists and **before the game boots**, so addons and content are there for the
first battle and every `?t=&freeze=1` fast-forwarded frame.

```js
GAME.addons.push({
  name: 'my-addon',
  onHit(hit, game) {},             // every HP change (foes and the party), on its impact frame (read-only, see 1)
  onKey(key, game) { return false; },   // key = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'target' | 'auto' | '1'..'4' | {tap, x, y}; true consumes it
  update(game, info) {},           // every 60 Hz frame, every scene, also while frozen; info = {dt, frozen, paused, hitStop}
  draw(g, layer, game) {},         // layer 'fx' (battle: after the stage, actors, board and the module's effects, before the HUD) or 'overlay' (after everything, every scene)
  drawUI(g, game) {},              // top UI hook: after everything, every scene
  onBattleStart(game) {}, onBattleEnd(result, info, game) {},
  onEvent(ev, game) {}, onWave(wave, game) {}, onTurn(turn, game) {},
  onScene(scene, game) {}, onNewGame(game) {}
});
```

1. **Hit site.** The module writes the new HP, then calls `onHit`; the starter adds its shakes and forwards to the addons
   (`hitSite`, section 4). `hit = {kind: 'damage' | 'heal', source, target (foe id 'f3', hero id 'knight' for hits on the
   party, 'party' for heals), enemy, attacker, defender ('party' when the heroes are hit), amount (HP actually lost or
   gained), raw, hpBefore, hpAfter, killed, crit (weakness or a foe special), weak, skill, ward, x, y}`. **Read-only.** The
   module draws its own numbers unless `GAME.params.numbers = 'off'`. Feedback helpers: `GAME.shake(px, frames)`,
   `GAME.flash(color, frames, alpha)` (stage only; both skipped under reduced motion; `GAME.flags.builtinShake /
   builtinFlash` turn the starter's own off), `GAME.hitStop(frames)` / `GAME.hitStopMs(ms)` (freezes the battle; it only
   delays it).
2. **Draw-effects slot.** `draw(g, 'fx', game)` runs on the logical context (`GAME.W` x `GAME.H`: 960 x 540 wide, 540 x 960
   tall; already scaled to the backing store) during a battle, inside the shake, after `C.drawScene`, before `C.drawUI`.
3. **UI rects: `GAME.uiRects()`** `[{name, x, y, w, h}]` in logical px: `top`, `card:<hero>`, `party`, `info` (wide),
   `plate:<foe>`, `banner`, `combo`, plus the starter's `mapPanel` / `endBox`. **`GAME.boardRect()`** is the board (never
   draw over it), **`GAME.fieldRect()`** the stage where the characters stand. Read them; never hard-code.
4. **Unit anchor: `GAME.anchor(id)`** (live, follows lunges) -> `{x, top, left, w, h, cy, footY, dead}` for a hero
   (`'knight'`, `'archer'`, `'herbalist'`, `'keeper'`), a foe (`'f3'`; answers while it fades) or `'party'` (the party
   bar). `GAME.unitRects()` lists the heroes and living foes with `id` and `kind`.
5. **Input chain.** Keys and taps are queued; each tick every key (and every pointer-down as `{tap, x, y}`) goes to the
   addons' `onKey` in order; the first that returns `true` consumes it. Otherwise `auto` toggles autoplay, any other key
   during autoplay hands control to the player, then the scene handles it (battle: `GAME.C.key` / `GAME.C.pointer`).
   `GAME.held` is maintained by keydown / keyup only.
6. **Autoplay.** `GAME.autoplay.on` (`?auto=1`, P). The module's bot targets the foe that strikes soonest, casts ready
   skills and swaps through the player's own input path (cursor, Z, arrow). Addons must not consume `ok`, arrows or digits
   during autoplay: the `?t=` stills rely on it.
7. **World clock.** `GAME.clock = {frame, battleFrame, paused, stop}`; `GAME.pause(true)` stops the battle; addons'
   `update(game, info)` runs every frame (`info.dt` 16.67 ms, 0 while frozen).
8. **Battle events.** `onBattleStart`, `onWave(n)`, `onTurn(n)` (after the player's turn, before the foes act),
   `onEvent(ev)` for every rules event (`swap`, `match`, `special`, `fire`, `clear`, `cascade`, `settle`, `heroAttack`,
   `skill`, `foeAttack`, `partyHit`, `heal`, `reshuffle`, `spawn`, `death`, `end`, ...), `onBattleEnd(result, info)`.
9. **Content** (formats in `../module/README.md`), in the ADDONS SLOT:
   - `GAME.addGem(id, def)`: a gem type; it spawns by `weight` in every battle. Give it a `shape` no other gem uses.
   - `GAME.addSkill(id, def, {hero})`: a skill; with `hero` it becomes that hero's skill.
   - `GAME.addHero(id, def, {slot})`: a hero (`slot` 0-3 replaces a party member; `look` = a sprite id of `art/`:
     knight, archer, herbalist, keeper, or any foe look).
   - `GAME.addEnemy(id, def, {stage, wave, count})`: an enemy; with `stage` (0-based) and `wave` (1-based) it joins that wave
     (a wave holds at most 3 foes: the first one leaves). Looks: slime, wolf, imp, wisp, harpy, skeleton, cultist, golem;
     `tint` (a CSS filter) recolours a look. `hue-rotate` alone does not give a true hue turn (the teal wisp turned by 205deg comes
     out pink); to paint a look one colour use `'sepia(1) saturate(4) hue-rotate(Hdeg)'` with H = the target hue - 50
     (orange: -25, red: -50, green: 70, blue: 170, violet: 230) and check the result on screen.
   - `GAME.addStage({name, scene: 'meadow-dusk' | 'lakeside-day' | 'ruins-night', waves: [[ids], ...]}, at)`.
   - The tables are readable and editable as `GAME.gems`, `GAME.heroes`, `GAME.skills`, `GAME.enemies`, `GAME.party`,
     `GAME.stages`, `GAME.params`. `GAME.shipped` lists the ids this file ships with.

`GAME.C` (the module instance), `GAME.scene`, `GAME.stage`, `GAME.results`, `GAME.lastEnd` and `GAME.state()` are readable.

## Adding damage numbers (e.g. C-11 damage-pop)

```js
GAME.params.numbers = 'off';                                         // C-11 draws the numbers instead of the module
const dp = GameDNA_DamagePop.create({ bounds: () => GAME.fieldRect(),
  getAnchor: id => GAME.anchor(id === 'party' ? 'herbalist' : id),    // live position; heals show over the Herbalist
  getObstacles: () => GAME.unitRects().concat(GAME.uiRects()), onHitStop: ms => GAME.hitStopMs(ms) });
GAME.addons.push({ name: 'damage-pop',
  onHit(hit) { if (hit.amount > 0) dp.spawn(hit.target, hit.amount, hit.kind === 'heal' ? 'heal' : hit.crit ? 'crit' : 'damage'); },
  update(game, info) { dp.update(info.dt); }, draw(g, layer) { if (layer === 'fx') dp.draw(g); }, onBattleStart() { dp.clear(); } });
```

## Adding a gem type, a skill and an enemy

```js
GAME.addGem('shade', { name: 'Shade', shape: 'tri', colors: ['#2a0a4a', '#8a3ae0', '#d8a8ff', '#f8f0ff'], role: 'strike', power: 3, weight: 1, text: 'Strikes the target' });
GAME.addSkill('thorns', { name: 'Thorn Volley', cost: 14, text: '1.6x attack to every foe; 4 Grove gems', icon: 'bow', fx: 'arrows',
  effects: [{ damage: 1.6, target: 'all' }, { convert: { to: 'grove', count: 4 } }] }, { hero: 'archer' });
GAME.addEnemy('ember-wisp', { name: 'Ember Wisp', look: 'wisp', tint: 'sepia(1) saturate(4) hue-rotate(-25deg)', hp: 150, atk: 30, every: 2, weak: 'tide',
  attack: 'bolt', boltColor: '#ffa040', h: 0.62, hover: 0.55 }, { stage: 1, wave: 1 });
```

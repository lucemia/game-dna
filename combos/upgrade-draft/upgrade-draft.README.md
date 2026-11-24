# upgrade-draft.js (G-07 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_UpgradeDraft`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns the roguelite "pick 1 of 3" moment: at a point your game chooses (level-up, chest, wave clear) it pauses the world, deals 3 upgrade cards in with a fan-in, flips them, glows them by rarity (common / rare / epic), lets the player move between them and take one (synergy hints when a card shares a tag with the build; optional reroll and skip), and flies the picked card into an owned-upgrades strip. Draws are seeded by the module itself, weighted by rarity, never repeat a card in one hand and never offer an upgrade at its max stacks.

**It never changes your game by itself.** A pick reaches your game three ways, all inside `update()`, synchronously, at the step the player confirms: your `applyDelta(stat, amount, upgrade)` for each declarative `delta` entry, the upgrade's own `apply(target, info)` (code the designer wrote in the table), and your `onPick(upgrade, info)`.

Two looks from the same code: **HD** (smooth vector cards, soft shadows, light rays; any resolution, scales with the play field) and **pixel** (crisp: whole-pixel positions, a built-in 6x8 bitmap font, thresholded 1-bit icons, flips quantised to whole pixels; readable at 256x224). `look: 'auto'` picks pixel when the field is under 300 px tall. If `skins/skin-api.js` is loaded, the dim colour comes from the skin's `ink` and a smooth skin's UI font family is used in HD; without it the built-in look is used.

## The upgrade table (data the designer edits)

```js
const UPGRADES = [
  { id: 'ember-edge', name: 'Ember Edge', rarity: 'common', tags: ['fire', 'blade'], text: 'Your strikes burn for +{value} damage.', max: 5, delta: { atk: 2 } },
  { id: 'hearthroot', name: 'Hearthroot', rarity: 'common', tags: ['heart'], text: '+{value} max HP.', max: 5, delta: { maxHp: [10, 12, 14, 16, 20] } },
  { id: 'keen-eye', name: 'Keen Eye', rarity: 'rare', tags: ['crit'], text: '+{value}% critical chance. Total {total}%.', max: 4, delta: { crit: 8 } },
  { id: 'phoenix-feather', name: 'Phoenix Feather', rarity: 'epic', tags: ['fire', 'light'], text: 'Once per run, rise again with {value}% HP.', max: 1, value: 50,
    apply: (hero, info) => { hero.revive = 0.5; } },                                   // code instead of a delta
  { id: 'ember-crown', name: 'Ember Crown', rarity: 'epic', tags: ['fire'], text: 'Burning foes explode.', max: 1, requires: ['ember-edge'] }
];
```

| field | meaning |
|---|---|
| `id` | **Required**, unique string. Owned stacks, saves and `onPick` use it. |
| `name` | Card title (keep it under ~18 letters; two lines at most). |
| `rarity` | `'common'` / `'rare'` / `'epic'` (anything else = common, one warning). Sets the card colour, the glow and the draw weight. |
| `tags` | Up to 4 strings. Built-in icons and colours: `blade fire frost storm guard heart speed gold magic luck poison light crit arrow regen`; any other tag gets a gem icon and a colour from its name. The first tag is the card's big icon; `icon` overrides it with any tag name or one of the icon-only names `feather eye ring moon gem` (give two upgrades with the same first tag different icons so the strip tells them apart). Two upgrades that share a tag are a **synergy**: the card shows a SYNERGY ribbon and the shared tag in gold, and the matching owned slots glow. |
| `text` | One short sentence. `{value}` = the value of the stack the player would get, `{total}` = the sum after taking it, `{stacks}` = the stack number it would be, `{max}`. Only the `{value}` / `{total}` numbers are drawn in gold; literal digits stay plain. HD: the text steps its font down (11.5 to 9 units) to fit between the tags and the stat preview, then ellipsizes; about 60 letters fit at full size. Pixel: cards grow taller (up to the free height) so the whole sentence shows; ~9-12 letters a line (a word wider than the card is drawn with condensed spacing). The pixel stat preview shortens itself to fit: `ATK 5->7`, else `ATK +2`, else a 3-letter label, all in normal spacing; condensed spacing only when none fits, then `+2`. |
| `value` | Number, or an array per stack (`[10, 12, 14]`, the last repeats). Default: the first `delta` amount. |
| `max` | Max stacks (default `params.maxStacks`, 5). At max it is never offered again. `1` = unique. |
| `weight` | Relative weight inside its rarity (default 1; 0 = never drawn). |
| `delta` | `{stat: amount}` (or an array per stack). On pick each entry calls your `applyDelta(stat, amount, upgrade)`; the card shows `STAT now -> new` when you give `getStat`. |
| `apply(target, info)` | Optional designer code run on pick with `target` = your `options.target()` (e.g. the hero). Use it for effects a delta cannot say. |
| `requires` | Ids that must be owned before this one can be drawn (evolutions). |

`fallback` (option): one upgrade, unlimited stacks, offered alone when nothing else can be drawn (e.g. "Take 25 coins"). Without it, `open()` returns false when the pool is empty (one warning) and calls its `onDone` with `{empty: true}`.

**Draws.** A hand is drawn from `(seed, draft number, reroll number)` only: the same seed and the same picks give the same hands in every run, whatever the frame timing (`?t=&freeze=1` is deterministic). For each slot: roll a rarity by `wCommon / wRare / wEpic` among the rarities that still have something to offer, then an upgrade of that rarity by `weight`; no upgrade twice in a hand; nothing at its `max`; `requires` met. `GameDNA_UpgradeDraft.deal(table, owned, {seed, draw, reroll, n, wCommon, wRare, wEpic, maxStacks})` is the same draw as a pure function (tests, a "next hand" preview).

## API

`GameDNA_UpgradeDraft.create(options)` returns an instance.

| option | meaning |
|---|---|
| `upgrades` | **Required.** The table above. `fallback`: one extra upgrade (above). |
| `applyDelta(stat, amount, upgrade)` | Write `amount` into the stat your game actually reads (`hero.atk += amount`). The only way `delta` entries reach your game. |
| `getStat(stat)` | Optional: the stat now. Shows `ATK 6 -> 8` on the card and checks after each `applyDelta` that the value really changed (a console warning names a setter that writes to a copy). |
| `target()` | Optional: the object passed to an upgrade's `apply(target, info)`. |
| `onPick(upgrade, info)` | Optional: called once per pick, inside `update()`, after the deltas and `apply` ran. `upgrade` is your table entry (custom fields kept). |
| `onDone(result)` | Optional: when each draft has closed (also per `open()`, below). The world may resume. |
| `autoplay` | `true`/`false` or a function, read at each `open()`. When true the draft picks by itself after `autoMs` (rule `autoPick`) and ignores presses, so `?auto=1` never waits. |
| `bounds` / `view` | Play field `{x, y, w, h}` / `{w, h}` in native px (or functions). Without them, the canvas size at the first `draw()`. Cards, title and strip are laid out in it. |
| `uiRects()` / `getObstacles()` | Rects the cards and strip never cover (HUD bars, status panels): `uiRects()` and the rects without `id` from `getObstacles()`. The draft lays out between them, scaling down if needed. Sprites are dimmed under the overlay (it is modal). |
| `statLabels` | `{stat: 'ATK'}` labels for the card's stat preview (default: the key in capitals, 6 letters). |
| `skin` | Skin id or object (needs `skin-api.js`); `false` = built-in look. |
| `params` | `seed` 1, `choices` 3 (1-5), `rerolls` 1 per draft, `skip` `'on'`, `wCommon` 60, `wRare` 30, `wEpic` 10, `maxStacks` 5, `look` `'auto'` / `'hd'` / `'pixel'`, `dim` 0.55, `dealMs` 380, `stagger` 90, `flipMs` 260, `tilt` 5 (fan degrees), `autoMs` 1100, `autoPick` `'rarest'` / `'synergy'` / `'first'` / `'skip'`, `strip` `'draft'` / `'always'` / `'off'`, `synergy` `'on'`, `reduced` `'off'` (on = no rotation or overshoot, shorter), `armMs` 180, `openMs` 240, `title` `'LEVEL UP'`, `subtitle` (default `'Choose 1 of {n}'`; `{n}` = cards dealt), `skipLabel` `'Skip'`, `pixelBelow` 300. |
| `onSfx(name)`, `debug(e)` | Optional: `open`, `ready`, `move`, `pick`, `reroll`, `skip`, `land`. Debug events: `open`, `queued`, `fast`, `delta`, `mismatch`, `pick`, `reroll`, `skip`, `done`, `empty`. |

| method | |
|---|---|
| `open(opts)` → bool | **Call once where the moment happens** (in update logic). Pauses (see `busy()`) and deals a hand. `opts`: `title`, `subtitle`, `choices`, `rerolls`, `skip`, `onPick`, **`onDone(result)`**, `hand: [ids]` (a fixed hand, e.g. a scripted chest), `auto`. A second `open()` while one is open is **queued** (two level-ups in one fight give two drafts in a row, each drawn after the previous pick). |
| `busy()` | `true` from `open()` until the picked card has landed in the strip and the overlay has faded (`onDone` runs in the same `update()` that makes it false). While busy, send input here and pause the world. |
| `key(code, down)` | Raw keys (`e.code` or `e.key`): returns `true` only for keys it used while busy: arrows / A / D move, Z / Space / Enter take, R reroll, X / Escape / Backspace skip (only when skip is on). Other keys stay yours. |
| `press(action)` | For games with their own input layer: `'left'`, `'right'`, `'confirm'` (default), `'reroll'`, `'skip'`. Key-down edges only. A confirm while cards are still dealing finishes the deal (does not pick); a pick needs the cards face up for `armMs`. Ignored in autoplay. |
| `pointer(x, y, down)` | Native px: hover selects a card, a click on the selected card takes it, the R / X hints are buttons. |
| `hitTest(x, y)` → `'card'` / `'reroll'` / `'skip'` / `null` | Read-only: what `pointer` would hit. Show it: `canvas.style.cursor = draft.hitTest(x, y) ? 'pointer' : ''` in your pointermove. |
| `update(dtMs)` | Every fixed step, also while the world is paused. The only clock. |
| `draw(ctx, ox = 0, oy = 0)` | Last in the draw pass, outside any shake translate, under the game's own canvas transform. Never throws. |
| `owned()` → `[{id, name, stacks, max, rarity, tags, upgrade}]`, `stacks(id)`, `has(id)`, `tagCount(tag)` | The build, in pick order. |
| `drawStrip(ctx, x, y, {pixel, scale})` | Draw the owned strip in your HUD yourself (or `strip: 'always'`: drawn in a free corner while no draft is open). |
| `serialize()` → `{v: 1, owned, order, draws}`, `restore(obj or JSON)` | Owned stacks and the draft counter, for your save. |
| `reset()` | New run: forget the build and the counter. `clear()` closes silently (no `onDone`); `end()` closes now (`onDone` gets `skipped: true, ended: true`). |
| `layout()` | `{stage, px, rects}`: what the last `draw()` placed: `title`, `subtitle`, each `card` (rotated bounding box, with `boxes` = its text lines, stat preview and ribbon in card-local units) and the strip. Used by `checks/layout.py`. |
| `peek(n)`, `hand()`, `state()`, `rect()`, `lastResult()`, `lastDrawn()`, `table()`, `setTable(list)`, `setParams(p)`, `params()`, `recommend()`, `auto(on)` | The next hand (pure), the hand on screen, `{stage, cursor, hand, rarities, synergy, rerollsLeft, picked, draw, autoPick}`, the overlay rect, last result, drawn rects, live table and params. |

**info** (`onPick`) = `{id, stacks, value, text, rarity, tags, hand, draw, reroll, auto, synergy, deltas: {stat: amount}}`. **result** (`onDone`) = `{picked (your entry or null), id, stacks, skipped, ended, rerolls, hands, draw, auto, info}`.

## Integration (15 lines)

```js
// <script src="upgrade-draft.js"></script> before your game script
const draft = GameDNA_UpgradeDraft.create({ view: { w: SCREEN_W, h: SCREEN_H }, upgrades: UPGRADES,
  applyDelta: (stat, amount) => { player[stat] += amount; if (stat === 'maxHp') player.hp += amount; },
  getStat: stat => player[stat], target: () => player, statLabels: { atk: 'ATK', maxHp: 'HP' },
  onPick: (u, info) => { /* sounds, achievements; the stats already changed */ },
  autoplay: () => AUTOPLAY, uiRects: () => [hudRect], params: { seed: 1 } });
function onLevelUp() { draft.open({ title: 'LEVEL UP' }); }           // where the game already decides "level up"
function step(dt) {
  if (draft.busy()) { draft.update(dt); return; }                   // world, enemies and autopilot paused
  /* existing update */ draft.update(dt);
}
addEventListener('keydown', e => { if (draft.key(e.code, true)) { e.preventDefault(); return; } /* existing keys */ });
addEventListener('keyup', e => draft.key(e.code, false));
function render() { /* world, HUD */ draft.draw(ctx); }                // last, outside any shake translate
function newRun() { draft.reset(); /* existing reset */ }
```

## With G-02 level-up growth

The two meet at the level-up moment. **Chain** (both): G-02 keeps the EXP tally and its automatic stat growth; in its `award(exp, gold, {onDone: r => ...})` call `draft.open({title: 'LEVEL UP'})` once per level gained (`toLevel - fromLevel` summed over `r.units`), so the results window shows first and the cards follow (opens queue; the world stays paused while either is busy). **Replace**: when every gain should be a choice, give G-02 `{rates: {}}` per class and `minGain: 0` (EXP and levels only) and let the draft be the growth. Either way one pause gate covers both: `if (lv.busy() || draft.busy())`.

## Keep the game's other callers working

- **Where the moment happens**: find the ONE place the game already decides it (a level-up function, the chest-open line, a wave-cleared branch) and call `open()` there, once per event, in update logic, never per frame and never in draw. If a level-up used to give a fixed bonus, the draft **replaces** that bonus (keep the level number, the XP curve and any heal). Several level-ups at once queue; do not loop.
- **The stats live where the game reads them**: `applyDelta` writes the field the damage / speed / HP code actually reads, never a template every new unit copies (a restart would start with the upgrades). Give `getStat` so the module warns when they disagree. A stat the game does not have yet (crit, thorns) needs code that reads it, or leave it out of the table.
- **Pause gate**: at the top of the fixed step, before the world and the autopilot: `if (draft.busy()) { draft.update(dt); return; }`. Keep pause / restart / mute keys outside the gate if the game has them, and while the game's own pause menu is open do not call `draft.update()` (the draft's clock and autopick stop with the game). `key()` claims Escape as skip while a draft is open: if Esc is the game's pause key, test it before `draft.key()`. When the draft opens or closes, clear only buffered taps; never clear held movement keys (a player still holding Right keeps running, and scripted testers send one keydown per hold).
- **HUD**: hide the game's own one-line notice (level-up message, toast) while `draft.busy()`, or it shows under the draft's title. The dim covers the whole field; to keep the HUD bright pass `bounds` = the play area between the HUD bars (cards always avoid `uiRects()`). If the game had no level or XP display, put the new level / XP into the existing HUD row rather than adding a bar.
- **Input**: `draft.key()` first in the key handler (it returns false for keys it does not use, and for everything when no draft is open). If the game polls its own input object, call `draft.press('left' | 'right' | 'confirm' | 'reroll' | 'skip')` on the key-down edges instead, inside the step. The press that caused the level-up cannot pick a card (cards must be face up for `armMs`).
- **Autoplay** (`?auto=1`): pass the flag as `autoplay`; the draft picks by itself (`autoPick`, deterministic) and never waits for the autopilot. Upgrades make the player stronger, so the run may end differently (it must still end). To keep the original ending exactly, use `autoPick: 'skip'` (the cards still deal and close; nothing is applied).
- **Fast-forward** (`?t=&freeze=1`): `update()` must run inside the fixed step those loops call, not only in `requestAnimationFrame`. Act on picks in `onPick` / `onDone`, never after a promise.
- **Restart / new run**: `draft.reset()` next to the game's own reset (the game restores its own base stats). **Save / load**: `serialize()` / `restore()` next to your stats.
- **Canvas transform**: call `draw(ctx)` with the transform your HUD uses (HD games that scale the canvas for devicePixelRatio: after `setTransform`), so the cards stay sharp.

## Self-check without a browser

1. The module file is byte-identical to the one you were given and is loaded before the game script.
2. `open(` appears once per moment, in update logic; every path to that moment reaches it (grep each level-up / chest / wave-clear path).
3. `update(` runs every fixed step, also while busy; the freeze / fast-forward loop calls that same step; the busy gate sits before the autopilot.
4. Every stat a `delta` names is read by the game (grep the stat name outside the table); `applyDelta` writes that object; restart restores base stats and calls `reset()`.
5. Every `id` in the table is unique; every `text` with `{value}` has a `value` or a `delta`; `rarity` is common / rare / epic.
6. Walk one draft with the defaults: `open()` -> overlay fades in 0.24 s -> 3 cards deal 0.09 s apart (0.38 s each) and flip (0.26 s) -> about 1.1 s after `open()` the player can take one -> on Z: `applyDelta` and `apply` run, then `onPick` -> the card flies to the strip (0.8 s) -> fade 0.23 s -> `onDone` -> `busy()` false -> the game continues as before.
7. `draw(` is the last call of the draw pass; `key(` is first in the key handler.

## What it guarantees

- Same seed + same picks = same hands, same frames; nothing reads wall time, `Math.random` or your RNG.
- Your game changes only through `applyDelta`, the table's own `apply` and `onPick`, once per pick, inside `update()`.
- No duplicate cards in a hand; nothing past `max`; `requires` respected; queued drafts draw after the previous pick.
- The cards and strip never cover a UI rect you passed (if they cannot fit, they shrink to 62 %, then one warning); `update`, `draw` and every callback are wrapped in try/catch; bad `dt` is clamped; missing callbacks are fine.

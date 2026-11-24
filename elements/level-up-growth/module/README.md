# level-up-growth.js (G-02 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_LevelUpGrowth`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns experience and levels for your party: the EXP curve, per-class growth rates rolled with its own seeded RNG, a guaranteed minimum per level, the post-battle tally window (EXP and gold counting up, a gauge per unit that fills and wraps at each level) and the level-up panel (stat rows animate in with a highlight). Your game keeps its own stats; the module reads them with your getter and changes them **only** through your setter, once per stat that grew.

If `skins/skin-api.js` (and a skin such as `pixel16.js`) is loaded before it, it draws the windows with `GameDNA_Skin.resolve(options.skin).frame()`, the gauges with `skin.bar(…, {style: 'gauge'})` and takes text colours from the skin; non-pixel skins also draw the text with `skin.text()`. Without it, it uses its built-in 16-bit look (the same as `pixel16`) and the built-in 6×8 font.

## Growth tables (data the designer edits)

```js
const GROWTH = {
  knight: { rates: { hp: { rate: 85, amount: 3 }, str: 55, mag: 5, def: 50, spd: 20 } },
  mage:   { rates: { hp: { rate: 50, amount: 2 }, str: 10, mag: 75, def: 15, spd: 40 } },
  ranger: { rates: { hp: { rate: 65, amount: 2 }, str: 40, mag: 15, def: 25, spd: 65 }, caps: { spd: 30 } },
  default: { rates: { hp: 60, str: 40, def: 30 } }          // any unit whose class is not listed
};
```

| field | meaning |
|---|---|
| `rates.<stat>` | Percent chance per level that the stat grows (0–100). Above 100 = guaranteed `floor(rate / 100)` steps plus a `rate % 100` chance of one more. `{rate, amount}`: each step adds `amount` (use it for big stats such as HP: about 4–8 % of the starting value). Stat keys are yours (`hp`, `maxHp`, `atk`, `guard`…); the module passes them to your getter and setter unchanged. |
| `caps.<stat>` | Optional maximum; a gain that would pass it is cut to the cap. |

`stats` (option) lists which stats the panel shows, in order, with labels: `[{key: 'maxHp', label: 'HP'}, {key: 'atk', label: 'ATK'}, 'def']` (labels up to 6 letters; default the key in capitals). Without it, the keys found in the tables are used.

**Rolls**: one stream per unit id and level reached (`seed`, id, level), so the same seed gives the same gains in every run, whatever the order of fights, and `?t=&freeze=1` is deterministic. Every stat draws once per level. **Guaranteed minimum** (`minGain`, default 1): if fewer stats than that grew, the highest-rate stats that did not grow (and are below their cap) get `+amount` each, so a level is never empty.

**EXP curve**: EXP to go from level L to L + 1 = `round(base × L^power)` (defaults 20, 1.5: 20, 57, 104, 160, 224…), up to `maxLevel`. `table` (option) overrides it with the total EXP per level, starting at 0: `[0, 20, 60, 120, 200]` (then `maxLevel` = its length at most).

## API

`GameDNA_LevelUpGrowth.create(options)` returns an instance.

| option | meaning |
|---|---|
| `units()` | **Required.** Your party now: `[{id, name, cls, alive, level, get(key), set(key, value, gain)}]`. `id` (string or number) keys the EXP state; `cls` picks the growth table (or give `rates`/`caps` on the unit); `alive: false` units get no share of a plain award; `level` is read only the first time an id is seen (start level). `get(key)` returns the stat now (a number); **`set(key, value, gain)` is the only way the module changes your game**: write the new value where your game reads it (for max HP you may also raise current HP by `gain`). |
| `getStat(id, key, unit)`, `setStat(id, key, value, gain, unit)` | Alternative to per-unit `get`/`set`. |
| `classes`, `stats`, `table` | Growth tables, shown stats, EXP table (above). |
| `bounds` | Play field `{x, y, w, h}` in native px (or a function). The windows are centred in it. Alternative: `view: {w, h}`; with neither, the canvas size at the first `draw()`. |
| `uiRects()` / `getObstacles()` | Optional rects the windows never cover (HUD, command panel): `uiRects()` and the rects **without** `id` from `getObstacles()`. Rects **with** `id` from `getObstacles()` are sprites (the party): the windows avoid them when there is room, so the heroes stay visible. |
| `skin` | Skin id or object (needs `skin-api.js`); default `pixel16`. `false` = built-in look. |
| `params` | `base` 20, `power` 1.5, `maxLevel` 20, `minGain` 1, `seed` 1, `countMs` 1500 (count-up), `autoMs` 900 (autoplay: how long a finished window stays), `rowMs` 160 (per stat row), `panel` `'on'`, `share` `'each'` (every living unit gets the full EXP) / `'split'` (divided), `apply` `'now'` / `'later'` (keep gains in `pendingGains()` until `applyPending()`) / `'never'`, `autoGrowth` `'apply'` / `'hold'` (under autoplay, act as `apply: 'later'`), `tint` `'a'` blue / `'n'` slate / `'b'` red, `dim` 0.4, `title` `'RESULTS'`, `width` 0 (= min(208, field − 12)), `margin` 6, `openMs` 100. |
| `autoplay` | `true`/`false` or a function, read at each `award()`. When true the windows advance by themselves (`autoMs` after each finished window) and presses are ignored, so `?auto=1` runs never wait. |
| `onDone(result)` | Optional, after every tally (in addition to the per-award one). |
| `onLevel({id, name, from, to, gains, values})` | Optional, inside `award()`, once per unit that levelled. |
| `onSfx(name)` | Optional: `open`, `count` (every 66 ms while counting), `levelUp` (a gauge wraps), `level` (panel opens), `row`, `close`. |
| `debug(e)` | Optional: `award`, `apply`, `mismatch`, `open`, `queued`, `finish`, `panel`, `close`, `end`, `noroom`. |

| method | |
|---|---|
| `award(exp, gold, opts)` → summary | **Call once where the fight is won.** `exp`: a number (every living unit in `units()` gets it, or a share with `share: 'split'`) or a map `{id: exp}` (only those units). `gold` is only shown: add it to your purse yourself **in `onDone`** (`r.gold`), not at the call, or a gold HUD jumps ahead of the count-up. `opts`: **`onDone(result)`**, `title` (`'VICTORY'`), `units` (ids: only these units take part and are shown), `tint`, `auto`. Levels and gains are computed and **your setter is called right here**; the window only shows them. A second `award()` while a window is open is queued (never lost); its gains are applied at once too. Returns `{id, levelUps, units: [{id, fromLevel, toLevel, gained, gains}]}`. |
| `addExp(id, exp)` | Bank EXP for one unit without a window (per hit, per kill). The next `award()` that includes the unit adds it (shown in its gauge). `award(0, 0, {units: [id]})` shows just that unit's banked EXP. `banked(id)`. |
| `busy()` | `true` from `award()` until the last window has closed (`onDone` runs in the same `update()` that makes it false). While busy, send confirm here and pause the world. |
| `press()`, `tap()` | Confirm, key-down edge: finishes the count-up / shows all rows at once, then goes to the next window. Latched until the next `update()`; ignored for 160 ms after the window opens and in autoplay. |
| `key(code, down)` | Raw keys: returns `true` only for Z, Space, Enter while busy (other keys stay yours). |
| `update(dtMs)` | Every fixed step, also while the world is paused. The only clock. |
| `draw(ctx, ox = 0, oy = 0)` | Last in the draw pass, outside any shake translate. Never throws. |
| **`shown(id, key)`, `shownLevel(id)`** | **The HUD hook.** The stat value / level the results window has revealed so far: the old value until that row of the unit's panel slides in (or the count ends, when there is no panel), then the new one; with no window open, the getter's value / `level(id)`. Draw your HUD, status screen and HP bars from these during a tally, never from the raw stats, or the HUD gives the gains away before the panel shows them (the setter already ran inside `award()`). Current HP raised with max HP: show `hp - (maxHp - shown(id, 'maxHp'))`. |
| `level(id)`, `exp(id)`, `toNext(id)`, `track(unit)` | Level / total EXP / EXP to the next level (after the last award), or null for an unknown id; `track(unit)` registers a unit (start level) without an award, for a HUD. |
| `serialize()` → `{v: 1, units: {id: {level, exp}}, banked}`, `restore(obj or JSON)` | The EXP state as plain JSON for your save. Your stats are yours to save; restore both together. |
| `reset()` | Forget all EXP state (new game). `clear()` closes the window silently (its `onDone` never runs). `end()` closes now (`onDone` gets `skipped: true`). |
| `pendingGains()`, `applyPending()` | With `apply: 'later'` (or `autoGrowth: 'hold'` under autoplay): the gains not yet given to your setter; `applyPending()` applies them (current value + gain). |
| `expFor(level)`, `levelOf(exp)`, `maxLevel()`, `state()`, `rect()`, `lastResult()`, `lastDrawn()`, `setParams(p)`, `params()` | Curve helpers; `{stage, exp, gold, units: [{id, level, from, to, exp}], unit: {id, from, to, rows, shown}, box, pbox}` or null; the window rect(s) for other overlays; last result; drawn rects; live params. |

**Result** `{exp, gold, title, levelUps, skipped, auto, applied, units: [{id, name, fromLevel, toLevel, expBefore, expAfter, gained, gains: {stat: n}, values: {stat: [old, new]}}]}`.

After each `set()` the module reads the stat back with your getter. If it differs (the setter writes to an object the game does not read), it warns once in the console and reports a `mismatch` debug event.

## Integration (15 lines)

```js
// <script src="level-up-growth.js"></script> before your game script (skin-api.js + pixel16.js before it if you have them)
const GROWTH = { fighter: { rates: { maxHp: { rate: 80, amount: 5 }, atk: 50, def: 35, spd: 25 } } /* one per class */ };
const lv = GameDNA_LevelUpGrowth.create({ bounds: { x: 0, y: 0, w: SCREEN_W, h: FIELD_H }, classes: GROWTH,
  stats: [{ key: 'maxHp', label: 'HP' }, { key: 'atk', label: 'ATK' }, { key: 'def', label: 'DEF' }, { key: 'spd', label: 'SPD' }],
  units: () => party.map(p => ({ id: p.id, name: p.name, cls: p.job, alive: p.hp > 0,
    get: k => p[k], set: (k, v, gain) => { p[k] = v; if (k === 'maxHp') p.hp += gain; } })),
  autoplay: () => AUTOPLAY, uiRects: () => [hudRect] });
function onBattleWon(next) {                                   // where the game already decides "the fight is won"
  lv.award(enemyExp(), enemyGold(), { title: 'VICTORY', onDone: r => { gold += r.gold; next(); } });   // gold in onDone
}
function step(dt) {
  if (lv.busy()) { if (input.confirmPressed) lv.press(); lv.update(dt); return; }   // world paused
  /* existing update */ lv.update(dt);
}
function render() { /* world, effects, HUD from lv.shown(id, key) */ lv.draw(ctx); }   // last, outside the shake translate
function newGame() { lv.reset(); /* existing code */ }
```

## Keep the game's other callers working

- **THE HUD hook**: during a tally your HUD must print `lv.shown(id, key)` and `lv.shownLevel(id)`, not the raw stats (your setter already ran inside `award()`), and add the gold to the purse in `onDone`. Then the HUD changes in step with the window: each stat when its panel row slides in, the gold when the window closes.

- **Where the fight ends**: find the ONE place the game decides a battle / wave / map is won (often where it sets a "victory" or "cleared" phase) and call `award()` there once, never per frame (`award` is not idempotent: each call gives EXP again). What the game did next (banner, next wave, back to the map) moves into `onDone`, or stays where it is if the game already waits for a key there; the world is paused while `busy()` anyway.
- **Stats live where the game reads them**: the setter must write to the object the combat formulas read (`unit.atk`, not a copy, and not a shared template such as a class table that every new unit copies, or a restart starts with grown stats). Use the console `mismatch` warning to check.
- **Autoplay** (`?auto=1`): pass the flag as `autoplay`; windows advance by themselves and must not wait for the autopilot's presses. Growth makes the party stronger, so the autoplay run may end differently (fewer turns, other survivors). It must still end. **To keep the original outcome exactly**, set `autoGrowth: 'hold'`: under autoplay the tally and panels still show, but no stat changes until you call `applyPending()` (call it never, or after the run). Otherwise say in your notes that autoplay now ends differently.
- **Fast-forward** (`?t=&freeze=1`, tests): `update()` must run inside the fixed step those loops call, not only in `requestAnimationFrame`. Act on the result in `onDone`, not after a promise.
- **Keys**: while busy only confirm belongs to the window; pause / restart keys keep working. The press that won the fight cannot skip the tally (presses are ignored for the first 160 ms).
- **HUD and status screens**: anything that prints a unit's stats or level while a tally can be open reads `lv.shown(id, key)` / `lv.shownLevel(id)` instead of the raw field (the setter has already run). Alternative: `apply: 'later'` and `applyPending()` in `onDone` (the stats then change only after the window).
- **Restart / new game**: `reset()`; your own stats come back from your starting data. **Save / load**: put `lv.serialize()` next to your stats in the save and `lv.restore()` them together.

## Self-check without a browser

1. The module file is byte-identical to the one you were given and is loaded before the game script.
2. `award(` appears once per "fight won" event, in update logic (not in draw, not in a per-frame branch); every way to win reaches it.
3. `update(` runs every fixed step, also while the world is paused for the window; the freeze / fast-forward loop calls that same step.
4. While `busy()`: the player's confirm goes to `press()` (key-down edge), the world, the autopilot and the next wave wait.
5. The setter writes the field the combat formulas read; HP max and current HP stay consistent; no shared template is changed.
6. Walk one award with the defaults: `award(45, 12)` to a level-1 unit → it reaches level 2 (20 EXP) → `set()` is called for 1–3 stats at once → window opens 0.1 s → count 1.5 s → wait (autoplay 0.9 s) → panel rows 0.16 s each → wait 0.9 s → close 0.1 s → `onDone` → the game continues as before.
7. `draw(` is the last call of the draw pass; restart calls `reset()`; the HUD prints `shown(id, key)` / `shownLevel(id)`, not the raw stats.

## What it guarantees

- Same seed + same calls = same levels, same gains, same frames; nothing reads wall time, `Math.random` or your RNG.
- Your stats change only through your setter, only inside `award()` (or `applyPending()`), once per stat that grew; each change is read back.
- The windows never cover a UI rect you passed (if nothing fits, centred with one warning) and never sit at a spot that depends on frame timing.
- `update`, `draw` and every callback are wrapped in try/catch; bad `dt` is clamped; missing callbacks are fine; a unit without a growth table levels with no gains (one warning).

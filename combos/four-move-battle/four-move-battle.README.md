# four-move-battle.js (A-02 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_FourMove`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it.

**It owns the whole battle loop:** turn order (priority, then speed; numb halves speed), accuracy, critical hits, the type chart, burn / sleep / numb, Brace-style guard, heal and drain moves, switching to a bench creature (the switch uses the turn), fainting, replacements, win / lose, the message queue (typewriter, wait for OK or auto advance), the command, move, team and item menus, the doubles target picker, autoplay, and the classic battle screen: foe top-right on a platform with its name / level / HP box, own creature bottom-left seen from behind, message box, 2×2 move menu with type and uses, HP bars that drain, send-out / withdraw / faint animations.

**The host supplies:** creatures, moves, the type chart, optionally an AI chooser, sprites, a backdrop and items, and calls `update`, `draw` and `key` from its own loop. The module keeps its own copy of the battle state; read results back with `snapshot()` or the events.

Look: with `skin-api.js` and a skin loaded first it draws every window, glyph and bar through `GameDNA_Skin.resolve(options.skin)`; without them it uses its own copy of the `pixel16` look. Creature sprites, backdrop and platforms are the host's art.

## API

`GameDNA_FourMove.create(options)` returns a battle. Make a new one per battle.

| option | meaning |
|---|---|
| `view` | `{x, y, w, h}`: the native-pixel screen area the battle fills (message box at its bottom: 48 px tall, 56 px when `h` ≥ 200). Default: the canvas size at the first draw. **Pass it**: anchors and wrapping use it before the first draw. |
| `teams` | `{own: [creature], foe: [creature]}`. Creature: `{id, name, level, types: ['ember'] (or type), hp, maxHp, atk, def, spd, moves: [moveId or move], status?: 'burn' \| 'sleep' \| 'numb', …anything else}`. Missing stats default to 20. The first living ones go out first; the rest are the bench. The object you pass comes back as `src` in callbacks. |
| `moves` | `{id: move}`. Move: `{name, type, power (0 = support), accuracy 0-100 (100), uses (10), priority (0), target: 'foe' \| 'allFoes' \| 'self' \| 'ally', kind: 'hit' \| 'status', highCrit, effect}`. `effect`: `{status: 'burn' \| 'sleep' \| 'numb', chance: 0-100}` (on a hit move: secondary chance; on a support move: the move's whole point), `{heal: 0.5}` (fraction of max HP), `{guard: true}` (halves damage taken until the turn ends; give it `priority: 3`), `{drain: 0.5}` (heals the user by half the damage dealt), `{cure: true}`. A creature's `moves` entry may also be a whole move object, or `{id, usesLeft}` to carry uses across battles. |
| `types` | `{id: {label, color, strong: [ids], weak: [ids], none: [ids], immune: ['burn' …]}}` (attacker's view: strong ×2, weak ×0.5, none ×0). Multiplies over both of a dual-type defender. Untyped moves are neutral. |
| `chart` | Optional `{attacker: {defender: multiplier}}`, merged over `types`. |
| `params` | `format` `'single'` \| `'double'` (2v2), `textSpeed` `'slow'` \| `'normal'` \| `'fast'` \| `'instant'`, `advance` `'auto'` (default: a shown message also moves on after `hold` ms) \| `'key'` (waits for OK, classic), `hold` 900, `drain` `'slow'` \| `'normal'` \| `'fast'`, `critRate` 0.0625, `critMult` 1.5, `stab` 1.5 (same-type bonus), `randomMin` 0.85, `spread` 0.75 (all-foes moves), `burnAtk` 0.5, `numbChance` 0.25, `hints` `'on'` (STRONG / WEAK / NO EFFECT in the move panel), `aiRandom` 0.2, `canRun` false, `spriteScale` `'auto'` (integer upscale of small sprites) \| 1-3, `foeLabel` `'FOE'` (prefix in messages), `auto` false. |
| `foeName`, `intro` | `'Rival Pip'` → "RIVAL PIP WANTS TO BATTLE!" and "RIVAL PIP SENDS OUT …". `intro` replaces the first line. |
| `seed` | Random seed (accuracy, crits, damage roll, AI). Same seed + same inputs = same battle. |
| `sprite(src, view)` | Return an image or canvas of creature `src`; `view` is `'front'` (foe) or `'back'` (own, seen from behind). Called once per creature and view (cached). Small sprites are scaled up by whole numbers. No sprite → `drawCreature` → a shaded blob in the type colour. |
| `drawCreature(ctx, src, rect, info)` | Only if you have no images: draw into `rect`; `info = {view, white (0-1 flash), scale, t, id}`. |
| `drawBackground(ctx, rect, tSeconds)` | Your backdrop for the field (above the message box). Default: sky and meadow. |
| `platform(ctx, plat, side)` | Your platform art; `plat = {x, y, rx, ry}` (ellipse). Or `platform: ['#top', '#mid', '#low', '#edge']`. |
| `chooseFoe(view)`, `chooseOwn(view)` | AI. `view = {self, foes, allies, bench, turn, effectiveness(moveIndex, foeId), random}`. Return `{move: index or id, target: id}`, `{switchTo: id}`, `{item: id}`, or `null` for the built-in AI (best expected damage, `aiRandom` random picks; for the own side it also switches out of a bad matchup). `chooseOwn` is used only by autoplay. `chooseFoeReplacement({bench, foes, slot})` → id picks the foe's next creature. |
| `items()`, `useItem(u)` | `items()` → `[{id, label, note, ok}]` for the ITEM menu (none → ITEM is greyed). `useItem({item, target, user, turn})` runs on the item's turn; spend the item there and return `{heal: n, cure: true, restore: n (uses), text}`. |
| `beforeHit(ev)`, `onHit(ev)` | **The hit site.** Every HP or status change: `ev = {kind: 'damage' \| 'heal' \| 'status' \| 'cure', source, target (ids), side, amount, move, moveName, type, eff, crit, status, cause: 'move' \| 'burn' \| 'drain' \| 'item' \| 'host' …}`. In `beforeHit` you may change `ev.amount` or set `ev.cancel = true`. `onHit` adds `hpBefore, hpAfter, killed, anchor`. |
| `onEvent(ev)` | Everything else: `{type: 'message' \| 'turn' \| 'phase' \| 'order' \| 'choice' \| 'moveUsed' \| 'miss' \| 'immune' \| 'guard' \| 'sendOut' \| 'withdraw' \| 'faint' \| 'end' \| 'hit', …}`. Also `onTurn(n)`, `onPhase('command' \| 'resolve' \| 'replace' \| 'over')`, `onMessage(text)`, `onFaint(creature)`, `onEnd(result, snapshot)` with `result` `'win'` \| `'lose'` \| `'run'`. |
| `damage(ctx)` | Optional formula: `ctx = {user, target, move, eff, crit, stab, roll, spread, guard, standard}`; return the damage (the module's own is in `standard`). |
| `text` | Optional wording overrides, e.g. `{strong: () => 'IT HITS HARD!'}` (keys: see `GameDNA_FourMove.text`). |
| `skin` | Skin id or object (only with `skin-api.js` loaded). |

| method | |
|---|---|
| `update(dtMs?)` | No argument: exactly one 60 Hz step. With `dtMs`: as many steps as fit (max 15). Call it every step of your loop, also while a menu is open. Everything (timers, typewriter, animations, autoplay) runs on it, so `?t=&freeze=1` fast-forwards are exact. |
| `draw(ctx)` = `drawScene(ctx)` + `drawUI(ctx)` | `drawScene`: backdrop, platforms, creatures, effects (clipped to the field). `drawUI`: info boxes, message box, menus. Put your own effects between the two. Never throws. |
| `key(k)` | `'up' 'down' 'left' 'right' 'ok' 'back'` (also `ArrowUp`, `z`, `Enter`, `x`, `Escape`, a KeyboardEvent). Returns true when used. OK also skips the typewriter and advances messages. |
| `tap(x, y)` | Native-pixel tap: menu cells, targets, the message box. Returns true when used. |
| `setAuto(on)` | Autoplay for the own side: it picks (`chooseOwn` or the built-in AI) and presses the same menu keys a player would, and messages advance by themselves. |
| `isOver()` / `result()` | `null` until the end, then `'win'`, `'lose'` or `'run'`. `phase()`, `turn()`, `waiting()` (a menu waits for the player), `menu()`, `message()`, `log()`. |
| `anchor(id)` | `{id, side, slot, x (centre), left, top, w, h, footY, cy, dead}` of a creature on the field, in native px; `null` when it is not out. |
| `uiRects()` | `[{name, x, y, w, h}]`: info boxes, message box, menus, lists from the last draw. `fieldRect()`: the area above the message box. |
| `team(side)`, `active(side)`, `creature(id)`, `snapshot()` | Read state: HP, status, uses left (`snapshot().own[i].uses`), `src`. |
| `applyHit(id, kind, amount)` | Host-made change (poison tiles, a trap) through the same hit site. |
| `pause(on)`, `hitStop(ms)` | Freeze the battle (animations, timers, autoplay). |
| `labelReport()` | Move labels of the last drawn move menu: `[{creature, move, text, x, w, maxW, mode}]`. Labels never exceed their cell: normal font, then condensed spacing, then a 3×5 small font, then truncated with an ellipsis (`mode`). Keep move names to 11 characters to stay in the normal font at 240 px. |
| `setParams(p)`, `params()`, `setView(rect)`, `effectiveness(type, types)`, `stats()` | |

## Integration (15 lines)

```js
// <script src="four-move-battle.js"></script> before your game script
let battle = null;
function startBattle(myTeam, foeTeam) {                       // your creatures, moves and type table
  battle = GameDNA_FourMove.create({
    view: { x: 0, y: 0, w: SCREEN_W, h: SCREEN_H }, seed: 1, foeName: 'Rival',
    teams: { own: myTeam, foe: foeTeam }, moves: MOVES, types: TYPES,
    sprite: (c, view) => view === 'back' ? c.backImage : c.frontImage,
    drawBackground: (ctx, r) => drawMyArena(ctx, r),
    onEnd: (result, snap) => { saveHp(snap); showResult(result); },
    params: { auto: autoplayOn }
  });
}
function step() { if (battle) battle.update(); }             // your fixed 60 Hz step
function render(ctx) { if (battle) battle.draw(ctx); }        // after clearing, at native resolution
addEventListener('keydown', e => { if (battle && battle.key(e.key)) e.preventDefault(); });
```

## Keep your game working

- **Hook, don't replace.** Keep every function, title screen, wave or round counter, result screen and restart path. The module replaces only what happens *inside* one battle: the turn loop, its menus and its battle drawing.
- **Keep every caller.** Autoplay (`?auto=1` or similar) must call `setAuto(true)` (or pass `params.auto`) so the battle plays itself; `?t=&freeze=1` style fast-forwards must call `update()` in the loop that fast-forwards; keyboard shortcuts and taps go through `key()` / `tap()` first.
- **One update per step, always.** Never skip `update()` because a menu is open or an animation plays: the module runs both.
- **Read results back.** HP, status and uses changed inside the module. When `onEnd` fires, copy them from `snapshot()` into your own party if your game carries them to the next battle.
- **Small sprites:** 16-24 px sprites are scaled ×2 automatically; pass the same image for both views, or a mirrored copy for `back`.

## Self-check without a browser

1. Every option you pass is spelled as above; every move id in a creature's `moves` exists in `moves`.
2. `update()` runs once per step in every scene that shows a battle, and in the fast-forward loop.
3. Trace one turn on paper: OK (FIGHT) → OK (first move) → both creatures act in speed order → `onHit` → message → menu again.
4. Trace the last foe fainting: `onEnd('win')` → your victory or next-wave code runs once.

# crafting-recipes.js (G-06 module, v1.3.0)

One plain script, no dependencies, no `import`/`export`, ASCII only. It defines one global, `GameDNA_CraftingRecipes`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns the whole element: the recipe book (a grid of recipe cards: learned in colour with a green dot when you can craft it now, new ones with a sparkle, unknown ones as dark silhouettes with a hint), the slot bench (slots with have/need counts, an arrow and the result slot with a preview), the pouch (the game's ingredients and their counts), the work bar, success and failure feedback, discovery and unlock toasts, placement beside the player, and drawing (smooth text and shaded icons on HD canvases, crisp bitmap text and pixel icons on native pixel canvases <= 512 px wide). **Your game keeps its own inventory**: the module reads, takes and gives only through the three functions you pass.

## API

`GameDNA_CraftingRecipes.create(options)` returns an instance.

| option | meaning |
|---|---|
| `items` | `{id: {name, icon?, color?, desc?, image?, crop?, draw?}}`. `icon` = a built-in icon key (below; default: guessed from the id and name); `color` tints it; `image` + `crop: [sx, sy, sw, sh]` or `draw(ctx, x, y, w, h)` use your game's own art. Items only named in recipes get their id as a name. |
| `recipes` | `[{id, name?, out: 'id' \| {id, n}, inputs: {id: n, ...}, discover?, hint?, ms?}]`. `discover`: `'known'` (default), `'have:ore,coal'` (learned the moment the inventory holds all of them), `'crafted:ingot'` (learned when that recipe is crafted), `'experiment'` (only by trying the mix on the bench), `'manual'` (only by your `unlock(id)`, e.g. a scroll or a teacher; trying the mix does not reveal it). `ms` = this recipe's work time. |
| `inventory` | `{count(id), take(id, n), give(id, n)}` on your game's own item record. Or a plain object `{id: count}` that the module edits in place. |
| `view` | `{x, y, w, h}` (or a function): the screen rect, in the coordinates `draw` gets. Its width picks crisp (<= 512) or smooth drawing. |
| `canvas` or `cssScale()` | So text is never under 10 CSS px: the canvas element (the module reads its CSS width), or a function returning CSS px per canvas unit. |
| `avoid()` | Screen rects the window and toasts keep visible: **the player sprite first** (a hard obstacle: the window never cuts it with an edge; it is fully clear, or fully covered only when nothing else fits), then the bench / station and the NPC you talk to (kept clear when they can be). Pass the player's rect where it stands when the window opens. |
| `uiRects()` | Screen rects never covered: HUD bars, minimap, touch buttons. Only on a phone, where no placement is clear of them, does the window become a sheet over them. |
| `onCraft(info)` | `{recipe, name, out, n, inputs, discovered}` after the take/give: equip, light, heal, quest events. |
| `onUnlock(info)`, `onFail(info)`, `onOpen`, `onClose` | `onUnlock {recipe, name, out, why}` (`have` / `crafted` / `experiment` / `unlock`); `onFail {reason, text, id, recipe}` with reason `missing`, `unknown`, `nothing`, `empty`, `full`, `none`, `busy`. Callbacks are wrapped in try/catch. |
| `icons` | Optional icon sheet: `{image, cell, cols, keys: [...]}`; an item whose `icon` (or id) is in `keys` uses that cell. |
| `frame(ctx, rect, role)` | Optional: draw `panel`, `well`, `button` / `button-off`, `toast` backgrounds yourself (painted frames); return true to skip the built-in one. |
| `params` | Below. |

Params: `slots` 3 (1-6; a recipe with more inputs widens the bench), `craftMs` 650 (work bar), `title` `'Workbench'`, `render` `'auto'` (`'crisp'`, `'smooth'`), `theme` `'forge'` (`'parchment'`), `size` 0 (auto text px; crisp: bitmap scale x 8), `minCss` 10, `cols` 0 (book columns in the wide layout), `toasts` `'on'`, `toastMs` 2600, `hints` `'on'` (hint / description line), `keyHints` `'on'`, `dim` 0 (darken the world while open), `margin` 0 (auto).

| method | |
|---|---|
| `open(title?)`, `close()`, `toggle()`, `isOpen()`, `busy()` | `busy()` = the window is open: pause the world and send input to the module. |
| `update(dtMs)` | Every fixed step, every scene, also the `?t=` fast-forward. Discovery (`have` rules), the work bar, messages and toasts run here. |
| `draw(ctx)` | Last, after the world and the HUD, in screen coordinates. Never changes game state. Returns what it drew (also `lastDrawn()`). |
| `key(code, down, repeat)` | `KeyboardEvent.code` (or `key`): arrows / WASD, Z / Space / Enter, X / Escape / Backspace, C (try the mix / craft), Tab (book / pouch). Returns true while open: do not pass the key on. |
| `input(action)` | `'up' 'down' 'left' 'right' 'ok' 'back' 'craft' 'tab'`. Book: arrows pick, `ok` crafts the picked recipe, `down` past the last row goes to the pouch. Pouch: `left` / `right`, `ok` puts one on the bench, `back` takes the last one back (then returns to the book, then closes), `craft` tries the mix. While working, `back` stops (nothing is taken). |
| `pointer(type, x, y)`, `tap(x, y)` | `'move'` (hover), `'down'`, `'up'` in canvas units. Tap a recipe to pick it, tap it again (or Craft) to craft; tap a pouch item to add it; tap a slot to take it back; the X closes. Returns true when the point is on the window. |
| `select(id \| index)`, `put(itemId)`, `takeBack()`, `clearBench()`, `craft(recipeId?)`, `tryMix([ids])`, `cancel()` | The same actions from code (an autopilot, a tutorial). |
| `unlock(recipeId, why?)`, `knows(id)`, `canCraft(id)`, `recipes()`, `count(id)` | |
| `reset(opt?)` | New game: learned recipes, bench and toasts start over. Safe anywhere, also in `newGame()` before the first `update()` and right after a title-screen toast: a recipe already announced in this session is not announced again (`reset({forgetAnnounced: true})` forgets that too). |
| `state()`, `events()`, `stats()`, `hash()`, `layout()`, `rect()`, `rects()`, `save()`, `load(obj)`, `setParams(obj)` | `rect()` = the open window (or null), `rects()` adds the toast: give them to other overlays as UI rects. `save()` = learned recipes and craft counts. |

Built-in icons (shaded, outlined; pixel and HD): `herb flower mushroom wood stone ore coal ingot gem crystal gel bone feather hide thread potion tonic antidote salve bread bomb lantern torch rope arrow sword axe pick hammer shield helmet boots ring amulet key scroll coins staff bow charm`.

## Integration (15 lines)

```js
// <script src="crafting-recipes.js"></script> before your game script
const craft = GameDNA_CraftingRecipes.create({
  items: { herb: { name: 'Herb' }, gel: { name: 'Slime Gel' }, salve: { name: 'Salve', icon: 'potion' } },
  recipes: [{ id: 'salve', out: 'salve', inputs: { herb: 2, gel: 1 } }, { id: 'bomb', out: 'bomb', inputs: { gel: 2, coal: 1 }, discover: 'experiment' }],
  inventory: { count: id => bag[id] || 0, take: (id, n) => { bag[id] -= n; }, give: (id, n) => { bag[id] = (bag[id] || 0) + n; } },
  view: { x: 0, y: 0, w: SCREEN_W, h: SCREEN_H }, canvas: canvasElement,
  avoid: () => [playerScreenRect(), benchScreenRect()], uiRects: () => [hudRect],
  onCraft: info => { if (info.out === 'salve') hud.flash('salve'); } });
function interact() { /* existing code */ if (nearBench()) craft.open('Workbench'); }
function step(dt) { craft.update(dt); if (craft.busy()) return; /* world, enemies, timers */ }
function render() { drawWorld(); drawHud(); craft.draw(ctx); }
addEventListener('keydown', e => { if (craft.busy() && craft.key(e.code, true, e.repeat)) { e.preventDefault(); return; } /* game keys */ });
canvas.addEventListener('pointerup', e => { const p = toCanvas(e); if (craft.busy()) craft.pointer('up', p.x, p.y); });
```

## Keep every other caller working

- One record of counts: the game's own. Never copy the bag into the module or keep a second counter; HUD numbers keep reading the game's record, which changes only inside `take` / `give`.
- Open the window in update logic (an interact key, a bench tile, a menu row), never from a per-frame check that stays true; clear the opening key so it does not also act in the world.
- While `busy()`: the world, enemies and timers stop; the step still calls `craft.update`. Restart / new game: `craft.reset()` (fine before the first `update()`; it never announces a recipe twice in one session).
- `?auto=1` must end exactly as before: the module never opens by itself and never uses the game's random numbers; keep the autopilot off the new key (or let it skip the bench).
- `?t=&freeze=1`: call `update` in the same fixed step the fast-forward runs; pass `canvas` (or `cssScale`) so the layout is the same in a still and in play.

## Self-check without a browser

1. The module file is byte-identical and loads before `create`; `craft` exists before the first `update`, `key` or `draw`.
2. Every id in `recipes` exists in the game's item table (or in `items`), and every place that gives an ingredient changes the same record `count` reads.
3. `take` only lowers and `give` only raises that record; nothing else in the game spends the crafted result twice.
4. `avoid()` and `uiRects()` return screen rects in the same coordinates as `view` (canvas units, after the camera).
5. Walk one example: bag `{herb: 3, gel: 1}`, recipe salve = herb 2 + gel 1: craft -> after the work bar `take('herb', 2)`, `take('gel', 1)`, `give('salve', 1)`, bag `{herb: 1, gel: 0, salve: 1}`; craft again -> "Need 1 Herb", bag unchanged.

## What it guarantees

- Exactly once: a craft takes each input once with its exact count and gives the result once, all at the end of the work bar; it re-checks every count first, so a count never goes below 0 even if the game spent an ingredient meanwhile; a failed try or a stopped craft changes nothing (`checks/rules.js`: 30 seeds x 900 fuzzed operations, 8 mutants).
- Deterministic discovery: same calls, same learned recipes in the same order at the same times, whatever the frame rate; no `Math.random`, no wall clock (`checks/rules.js`).
- Placement: the window never cuts the player (the first `avoid()` rect) with an edge, then takes the free spot nearest the view centre that covers no `uiRects()` and no `avoid()` rect, choosing between a wide (book left, bench right) and a tall (book above bench) layout; it covers an avoid rect only when no placement of either layout can avoid it (phones: a sheet). It is chosen when the window opens and does not move while open (a changed HUD crossfades). Toasts take a fixed spot when they start (clear of the HUD, the window and the player), slide in, stay at least 900 ms, leave once; if the window opens over one it fades out in 180 ms; when no spot is clear of the open window (a phone sheet) the toast takes the window's title row instead (icon, label, name) and leaves with the window (`checks/screen.py`: 2 looks x 3 widths, every moment and recipe, 40 seeded player positions opened per look and width, the whole script frame by frame, 12 mutants). A toast is anchored where it started: a HUD band or scene that changes later never moves it (it dims instead); one toast per recipe per session, also across `reset()` (`checks/rules.js`, 2 mutants).
- Text >= 10 CSS px when the canvas CSS size is known; no text overlaps text or a button; all text stays inside its window or toast (ellipsis).
- Never throws from `update`, `draw`, `key` or `pointer`; a bad callback logs one warning.

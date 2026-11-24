# turn-order-bar.js (C-02 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_TurnOrder`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns the look and motion of a turn-order strip: a plate along one screen edge with small portraits in team-coloured frames, the unit acting now first in a bigger gold frame that bounces, the strip sliding forward when a turn ends, units popping in when they join, crumbling out when they die, hopping when they change place, blinking when hovered or targeted, and optional wait numbers. **Your game keeps its turn rules.** It hands the module the order it already knows; the module never decides who acts.

Looks: with `skin-api.js` and a skin loaded first, it draws through `GameDNA_Skin.resolve(options.skin)`; without them it uses its own copy of the `pixel16` look (navy plate, blue / red / slate frames, gold current frame, 5x7 label, 3x5 digits).

## API

`GameDNA_TurnOrder.create(options)` returns an instance.

| option | meaning |
|---|---|
| `view` | Screen area `{x, y, w, h}` in native pixels that the strip stays inside. Default: the canvas size at the first `draw`. Pass it when the canvas backing store is not the native size. |
| `layout` | `'top'` or `'bottom'` (horizontal strip), `'left'` or `'right'` (vertical column). Default `'top'`. Pick the edge with the fewest units: a column over the party fades to half most of the time. |
| `drawPortrait(ctx, id, rect, info)` | Optional. Draw unit `id` inside `rect` (the module clips to it and restores the context afterwards). Return `false` to get the token instead. If it is missing or throws, the slot shows a token: a disc in the team colour with the unit's initial. Easiest: `GameDNA_TurnOrder.spritePortrait(id => imageOrCanvasOfThatUnit)` (below). |
| `teamOf(id)` | Optional. `'a'` player, `'b'` enemy, `'n'` neutral. Common words work too (`'hero'`, `'ally'`, `'player'`, `'blue'` → a; `'foe'`, `'enemy'`, `'red'`, `'monster'` → b), as does `0`/`1` or a `'#rrggbb'` colour. Unknown → neutral. |
| `labelOf(id)` | Optional. One or two letters for the token fallback (default: the id's first letter). |
| `getObstacles()` | Optional. Rects `{x, y, w, h, id?}` in screen pixels. Rects **without** `id` (HUD panels, menus) are never covered: the strip slides along its edge, steps past them, or shows fewer slots. Rects **with** `id` (sprites) are avoided when there is room; when one is under the strip, the strip fades to half for as long as it stays (plus 0.5 s). Called once per `update`. |
| `skin` | Skin id or object (only used when `skin-api.js` is loaded). |
| `params` | Any of `layout`, `align` `'start'` (`'center'`, `'end'`: where along the edge), `slots` 8 (most units shown; the rest become `+N`), `size` 16 (px per slot; the current one is +4), `gap` 2, `slide` 240 (ms), `pop` 220 (ms to join / leave), `bounce` 2 (px), `waits` `'auto'` (`'off'` hides wait numbers; with `size` < 14 or tokens the number sits outside the slot), `label` `'TURN'` (`'NEXT'`, `'none'`), `fade` `'on'`, `margin` 2, `portrait` `'auto'` (`'token'` ignores `drawPortrait`). |
| `debug(e)` | Optional: receives `order`, `insert`, `remove` (with `kind`: `advance`, `dead`, `drop`), `move` (a unit hops to a new place), `place` and `warn` events. |

| method | |
|---|---|
| `setOrder(ids, {current, waits, dead})` | The order your game already has: unit ids, the next to act first. Call it whenever the order changes, or every step (identical calls cost nothing). `current`: the id acting now (gold, bigger, bouncing); `null` between turns. If it is missing from `ids` it is put first. A unit may appear more than once (next round). `GameDNA_TurnOrder.BREAK` (`'|'`) draws a round divider. `waits`: `{id: n}` (on that unit's first slot) or an array parallel to `ids` (`null` = no number). `dead`: ids that just died, so their slot crumbles instead of shrinking. `ids` may also be unit objects with an `id` field. `setOrder([])` hides the strip. |
| `highlight(idOrIds)` | Blinks those units' slots (hover, cursor or target). `null` clears. Call every step with what is highlighted now. |
| `update(dtMs)` | Once per fixed step (`1000 / 60`), also during pauses. All animation runs on it. |
| `draw(ctx, ox = 0, oy = 0)` | Draws the strip at native resolution. Call it after the scene and HUD, outside any screen-shake translate. Never throws. |
| `slotAt(x, y)` | The unit id under a native-pixel point (from the last `draw`), or `null`: for hover and taps on portraits. |
| `rect()`, `rects()` | The strip's rectangle (or `null` when hidden), for other overlays to avoid. |
| `order()`, `clear()`, `hide()`, `setParams(obj)`, `setView(rect)`, `params()`, `lastDrawn()`, `busy()` | `order()` = ids now shown. `clear()` empties everything at once (restart, new battle). `lastDrawn()` = plate and slot rects of the last draw (tests). `busy()` = something is still sliding. |

`GameDNA_TurnOrder.spritePortrait(getImage, {mode, focusY})` returns a ready `drawPortrait`. `getImage(id)` returns the unit's sprite (image or canvas), or `{img, flip, sx, sy, sw, sh}` for a sprite-sheet cell or a mirrored unit. It finds the opaque pixels once (cached) and draws them at 1:1, never smoothed: the whole sprite when it fits, the top-centre (the head) when it is up to 1.75x the slot, a centre crop for wide and short sprites, else the whole sprite at 1/2 or 1/3. `mode: 'crop' | 'fit'` forces one.

## Integration (15 lines)

```js
// <script src="turn-order-bar.js"></script> before your game script
const tob = GameDNA_TurnOrder.create({
  view: { x: 0, y: 0, w: SCREEN_W, h: SCREEN_H }, layout: 'top',
  teamOf: id => unitById(id).side,                                   // 'player' / 'enemy' etc.
  drawPortrait: GameDNA_TurnOrder.spritePortrait(id => unitById(id).sprite),
  getObstacles: () => [hudPanelRect]                                 // + sprite rects with their id
});
function step() {                                   // your fixed 60 Hz step: keep your own turn logic as it is
  /* ... existing turn code ... */
  const upcoming = turnQueue.filter(u => u.hp > 0).map(u => u.id);   // the order your game already computed
  tob.setOrder(upcoming, { current: actingUnit ? actingUnit.id : null, dead: justDiedIds });
  tob.highlight(targetUnderCursor ? targetUnderCursor.id : null);
  tob.update(1000 / 60);
}
function render() { /* world, sprites, effects, HUD */ tob.draw(ctx); }
// restart / new battle: tob.clear();   hover or tap on a portrait: const id = tob.slotAt(px, py);
```

## Keep your game working

- **Read the order, never change it.** Build the id list from the queue, round list or phase list your game already keeps (copy it: `.slice()`, `.filter()`); never shift, sort or refill the game's own array to feed the strip. If the game only knows the rest of this round, you may append its next-round order computed by the game's own function, with `GameDNA_TurnOrder.BREAK` between.
- **Keep every caller.** Autoplay (`?auto=1` or similar), `?t=&freeze=1` style test hooks, keyboard shortcuts, tap handlers, restart and title screens must work exactly as before. The module reads no input and changes no game state.
- **Fast-forward start.** If your game runs many steps and then draws once (screenshots), call `setOrder` and `update` from the step, not only from the render: the single drawn frame then shows the settled strip.
- **Scene changes.** On restart, title, or a new battle call `tob.clear()` (or `setOrder([])` to let it close); on the title screen simply skip `draw`.
- **Old turn indicator.** If the game already draws a small "who acts" marker, keep it unless asked to remove it; the strip does not replace the HUD.

## Self-check without a browser

1. The module file is byte-identical to the one given; it is loaded before the first use of `GameDNA_TurnOrder`.
2. Every identifier inside `teamOf`, `drawPortrait`, `getObstacles` exists when `update` first runs; `getObstacles` returns an array.
3. The id list is a copy of the game's own order; nothing in the game's queue was reordered, shifted or refilled for the strip. Ids are the same values the game uses everywhere else (numbers stay numbers).
4. Trace one turn: the actor is `current` and first → its action ends → the next `setOrder` no longer has it first (it slides out) → the new actor bounces. Trace one death: the dead id leaves the list and is passed in `dead`.
5. `tob.update(...)` exactly once per fixed step, `tob.draw(ctx)` once per rendered frame, after the HUD. No host function removed or renamed; autoplay still reaches the end.

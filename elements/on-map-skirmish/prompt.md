# Make attacks play out on the map

Defaults: speed {{speed}}, lunge {{lunge}} px, knock-back {{knock}} px, flash {{flash}} frames, HP drain {{drain}} ms, hold {{hold}} ms, follow-up speed gap {{gap}}, boss stand-off {{standoff}} px, plates prefer {{plates}}, text scale {{text}}, skip/x2 keys {{keys}}.

Include `on-map-skirmish.js` (global `GameDNA_OnMapSkirmish`) **verbatim**, before the game script; its README documents the API. It is the alternative to a side-view battle cut-in: use one.

## What it does

When my game confirms a single-target attack, the two map units fight where they stand: the attacker lunges, only the target flashes and is knocked back, the number pops above its head, misses show MISS, the counter and any follow-up play, and both HP plates drain at the screen edge. **The module never rolls or computes anything: my game decides the exchange; the module stages it.** It also spaces the pair: for the exchange it steps both fighters apart along the attack axis so their drawn boxes never overlap (at least 2 px plus the lunge), then eases them back. It never changes my units' positions. Do not move, nudge or re-space units yourself; pass each `box` exactly where the sprite is drawn now.

## Integration points

1. **Create once** at load: `GameDNA_OnMapSkirmish.create({view: <play area {x, y, w, h} in native px, without the HUD>, params: {speed: {{speed}}, lunge: {{lunge}}, knock: {{knock}}, flash: {{flash}}, drain: {{drain}}, hold: {{hold}}, gap: {{gap}}, standoff: {{standoff}}, plates: '{{plates}}', text: '{{text}}', keys: '{{keys}}'}, getObstacles: <other units' sprite boxes {id, x, y, w, h}>, uiRects: <HUD rects>})`. Boxes are screen pixels as drawn.
2. **Where an attack is confirmed and resolved**, keep the resolution unchanged (same random calls and order) but record each strike `{by: 'att' | 'def', result: 'hit' | 'miss' | 'crit', dmg}`. Without a counter or follow-up rule, `GameDNA_OnMapSkirmish.order({attSpd, defSpd, gap, counter})` gives the order. Put the HP back to the values before, then `play({attacker, defender, strikes, after: {att, def}, onDone})`, each unit `{id, name, team: 'a' | 'b', hp, max, box, boss?}`. A game with a separate battle screen keeps its menu and turns but draws the map behind it and stages each round there.
3. **`onDone(r)`** runs where the old attack animation ended: apply `r.att` / `r.def`, then continue.
4. **Every unit draw** goes through `drawActor(ctx, id, image, x, y, {native: <side the art looks at>, facing: <side it should look outside fights>})`; skip a unit's own fade when `gone(id)`; hide the selection cursor and the unit's own HP bar while `fighting(id)`.
5. **Your fixed step, first line:** `if (busy()) { forward only a person's keys to key(k) (Z skips, X is x2); update(stepMs); return; }`. Autoplay, AI and world wait, also in the `?t=` replay.
6. **Render:** `draw(ctx)` after the HUD, outside any camera transform. **New game:** `clear()`.

## Keep everything else working

Autoplay, `?t=&freeze=1` replays, input, title, restart and end screens work as before. Never delete or rename a host function. Same seed, same end.

## Self-check without a browser

1. The module is byte-identical.
2. For one exchange: HP before minus each target's `dmg` (clamped at 0) equals `after`, which `onDone` applies.
3. Every unit draw uses `drawActor`; `getObstacles` and `box` share one pixel space.
4. While `busy()` the step returns early and autoplay inputs are not forwarded.

## Acceptance

Confirm an attack: the fighters stand apart, the lunge stops short of the target, the spark sits on its near side, only the target flashes, numbers equal my game's and cover no unit, a miss shows MISS, the plates drain to the map's HP, `?auto=1` ends as before.

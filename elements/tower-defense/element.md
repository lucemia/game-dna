# A-16 Tower placement & wave spawner

## What it is

A tower-defense field seen from above at a slight angle. Foes come out of a burrow and walk a fixed road to the gate; every foe that reaches the gate costs lives. The player spends gold to build towers on the grass cells beside the road, never on it, so the road can never be blocked (this element picks the fixed road over open-grid mazing: the route stays readable, "first" means the same for every player, and the rule holds by construction). Picking a tower shows its range ring and a green ghost on the cell under the cursor; a cell where it cannot stand turns red with a cross and a short reason ("Keep the road clear", "Not enough gold"). Towers have three levels, sell for 70% of what went into them, and each has a target priority: First (least road left), Strong (most HP), Near (closest). Four built-in towers: Bolt Tower (fast single shots), Ember Mortar (lobbed splash, ground only), Frost Spire (slows), Storm Coil (chain lightning). Waves are data: groups of foes with a count, a gap, a delay and a road; the next wave is previewed in the panel with icons and counts, and calling it early pays a gold bonus. Gold, lives, speed x1 / x2, pause, a win banner after the last wave, a lose banner when lives run out. Seeded and frame-stepped (`?t=&freeze=1` deterministic), with a bot that picks cells by road coverage and plays through the player's own input path. The starter (The Thornwall Watch) strings two fields: one road, then two roads that meet before the gate with a boss at the end.

## Default parameters

| key | default | meaning |
|---|---|---|
| `speed` | 1 | 2 runs two simulation steps per frame (same results, half the wait) |
| `gold` | map (200) | starting gold |
| `lives` | map (20) | lives at the gate |
| `waveGap` | 12 | seconds from the last spawn of a wave to the next wave |
| `earlyBonus` | 1 | gold per second left when the next wave is sent early |
| `refund` | 0.7 | share of the price (build + upgrades) a sale returns |
| `hpScale` | 1 | multiplier on every foe's HP (waves also carry their own `hp`) |
| `priority` | per tower (first) | default target priority for new towers |
| `ring` | on | range ring while placing and on the selected tower |
| `preview` | on | next-wave preview in the panel |

Rules constants: one hit = max(1, round(damage) - armour), armour skipped by piercing towers (frost, storm); splash 100% at the centre to 50% at the edge, ground only; slow takes the strongest active slow, never stacks; chain: each jump x0.75 (x0.78 at level 3) to the nearest un-hit foe within 1.4-1.6 cells. Tower stats per level are in `module/tower-defense.js` `TOWERS`.

## Variants

- **Standard**: 200 gold, 20 lives, 12 s between waves.
- **Rich start, short breaks**: 400 gold, 6 s: build big, then no rest.
- **Hard**: foes x1.3 HP, no early bonus.
- **Strong-first towers**: every new tower aims at the toughest foe in range.
- **Blind waves**: no preview: the player learns each wave as it arrives.

## Interface

Needs: a map (grid rows + road waypoints per path), waves as data, tower and enemy tables (built-ins ship), a seed per field, a fixed 60 Hz step, key or pointer input while the field runs, a place to go when it ends.

Provides: `create(options)` -> `start`, `update`, `drawScene`, `drawUI`, `key`, `pointer`, `setAuto`; commands `build`, `upgrade`, `sell`, `setPriority`, `callWave`, `canBuild`; `onHit(ev)` per HP change on its impact frame (`{source, tower, target, enemy, raw, armor, amount, hpBefore, hpAfter, killed, type, splash, chain}`), `onEvent` (build, upgrade, sell, target, blocked, fire, spawn, death, leak, waveStart, countdown, waveCleared, gold, speed, end), `onEnd(result, info)`; `anchor(id)` (enemies, towers, gate; live), `unitRects()`, `uiRects()`, `fieldRect()`, `enemies()`, `towers()`, `nextWave()`, `pickTarget()`, `actors()`, `state()`. The starter adds `GAME.addTower / addEnemy / addWave / addField`, `GAME.addons` hooks, `GAME.held`.

## Screen rules (640x360 logical)

- Field: 16 x 10 cells of 32 px at (8, 36), clipped, a dark frame 4 px wide with a 1.5 px brass line. Build panel at (528, 36, 104 x 320); HUD pills at y 4-30: lives and gold (8, 168 wide), wave (184, 200 wide, with a spawn bar that turns blue during the countdown), speed and pause buttons (528 / 582, 50 wide).
- Road: 28 px wide (dark edge, dirt, lighter middle, two ruts, pebbles, grass tufts over the edge), corners rounded with a 13 px radius; foes walk it with a seeded sideways offset of up to 8 px (less for big foes) and drift apart sideways when crowded (at most a fifth of their forward step); flyers hover 20 px over their shadow. A burrow with glowing eyes at each entry, a two-tower stone gate with banners at the exit (the door flushes red on a leak).
- Foes are seen from above and rotate with the road's tangent (the light stays on the screen's upper left); legs advance with distance walked, moths flap and hover 12 px over their ground shadow. HP bar 18 x 3 px, 9 px above the body, only once hurt, moved up past any bar it would overlap, with a snowflake chip while slowed; a boss walks above the tower art with a pink ring at its feet and a 220 px named bar at the top of the field; a slowed foe is tinted blue with three drifting flakes; a hit flashes it white for 120 ms.
- Towers are drawn at 0.78 of their authored size around the plinth front so one tower fits its cell plus the lowest third of the cell above. They stand on a round stone plinth (28 px) whose front band shows the level (grey stone, bronze, gold with a glow) and 1-3 gold stars on a dark pill, drawn after every tower and foe so they always show; turrets turn to the target they will shoot (the crossbow, the mortar barrel); frost and storm towers glow. Things are drawn in y order (trees in front of towers behind them).
- Placing: faint rounded outlines on every buildable cell, the range ring (dashed, slowly turning, 13% fill), a green ghost (amber when gold is short); a blocked cell is red with a cross and a 20 px message bar at the bottom of the field for 1.4 s. The selected tower gets its ring and pulsing corner brackets; the keyboard cursor is the same brackets in white.
- Phones (`layout: 'compact'`, starter and demo below 560 px or `?compact=1`): the canvas shows only the field (520 x 328 stage px) and the HUD and panel become a DOM strip under it (13 px text, 36 px buttons, `mountPanel`).
- Panel: 4 tower cards (48 x 54, 2 x 2; more cards shrink to fit 3 rows) with the number key, a painted icon and the price (red when short); an info box (stats, or Upgrade / Sell buttons and a First / Strong / Near switch for the selected tower); the next wave: up to three groups as foe icons with counts, and a "Send wave" / "Send now +n" button.
- Banners: "WAVE n" with the wave's line (1.6 s) and "WAVE n CLEARED +gold" (1.4 s) at the top of the field (y 42-86), clear of the cells being built on; "VICTORY" / "THE GATE FALLS" with the field dimmed and the totals after 1.2 s.

## Common mistakes (symptom -> fix)

- A tower appears on the road -> the host built through its own code; use `build()` / `canBuild()` (they refuse road cells).
- Foes freeze while a menu is open -> `update()` is skipped; call it every step (0 only while the world is frozen).
- Gold or lives drift from what the events say -> the host wrote `gold` / `lives`; use `addGold()`, change lives through enemy `leak`.
- A different game each reload -> pass a seed per field; custom `draw` code never uses `Math.random`.
- A tower ignores flyers -> its table entry lacks `air: true`.
- Numbers or effects cover the panel -> place them inside `fieldRect()` and outside `uiRects()`.
- Damage numbers pile up into a wall -> many towers hit every second; merge hits per foe (C-11 does) or show only kills.
- The bot stands still -> its plan names a tower the map's shop does not list; keep the built-in ids in `shop` or give it a plan with yours.

## Acceptance moments

Demo (`demo/index.html`, autoplay on in stills):
- `?t=20000&freeze=1`: the first wave of mites on the road, three towers firing, a turret turned to its target.
- `?t=45000&freeze=1`: wave 2-3 with frost on a foe, a mortar blast, HP bars, the panel's next-wave preview.
- `?t=60000&freeze=1&map=twinford`: two roads, moths hovering, spiders, the pond, the selected tower's ring.
- `?t=70000&freeze=1&map=switchback`: foes walking left and right on the switchback (they face where they walk), chain lightning.
- `?t=150000&freeze=1&map=twinford`: a late wave, upgraded towers (stars), a crowd on the road.
Starter (`starter/index.html`):
- `?t=1000&freeze=1`: title. `?t=6000&freeze=1`: the first towers and wave 1 sent. `?t=145000&freeze=1`: the march to the Twin Fords. `?t=300000&freeze=1`: the Brood Matron above the towers with her bar. `?t=323000&freeze=1`: the victory card with stars per field. Phone: `?t=45000&freeze=1` at 390 px (compact field + DOM panel).
Placement (demo): `?t=34000&freeze=1&place=mortar&cell=9,1&gold=600` the build grid, range ring and green ghost; `?t=30000&freeze=1&place=mortar&cell=3,4` a red road cell with the cross and "Keep the road clear".
- `?auto=1` reaches THE WATCH HOLDS with no errors; a player who never builds loses.

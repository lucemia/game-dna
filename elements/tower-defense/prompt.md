# Add tower defense (tower placement and waves) to my game

Parameters (defaults): `{{speed}}` = 1, `{{gold}}` = 200, `{{lives}}` = 20, `{{waveGap}}` = 12, `{{earlyBonus}}` = 1, `{{refund}}` = 0.7, `{{hpScale}}` = 1, `{{priority}}` = first, `{{ring}}` = on, `{{preview}}` = on.

You get `tower-defense.js` (one global, `GameDNA_TowerDefense`) and its `README.md`. Include the file **verbatim** with `<script src>` (or paste it unchanged) before my game script. Never rewrite it.

**What it does:** a defense stage at 640x360 (mapped into `view`): foes walk a fixed road through a 16x10 grid; towers are built on grass beside the road, never on it (so the road is never blocked), with a range ring and a red warning on cells that refuse; upgrade (3 levels), sell, a target priority per tower (first, strong, near); waves from data with the next one previewed; gold, lives, speed x1/x2, win and lose. Seeded, fixed-step, with a bot.

## Integration points (by role; hook, don't replace)

1. **Content.** Map my level to a map `{name, gold, lives, rows: 10 strings of 16 chars ('.' grass, 'T' tree, 'r' rock, 'w' water), paths: [[[col, row], ...]]}` (waypoint cells; first and last one cell off the edge) and my enemies to waves `{groups: [{enemy, count, gap, delay, path}], reward, hp}`. My monsters may become enemies (README format).
2. **Where the stage starts:** `td = GameDNA_TowerDefense.create({view: {x: 0, y: 0, w, h}, params: {speed: {{speed}}, gold: {{gold}}, lives: {{lives}}, waveGap: {{waveGap}}, earlyBonus: {{earlyBonus}}, refund: {{refund}}, hpScale: {{hpScale}}, priority: '{{priority}}', ring: '{{ring}}', preview: '{{preview}}'}, onHit, onEvent, onEnd})` once; per stage `td.start({map, waves, seed})` with a fixed seed.
3. **Fixed step:** `td.update(stepMs)` every step of every loop (also my `?t=` fast-forward), `0` while frozen; never gated by menus.
4. **Draw:** `td.drawScene(ctx)`, my effects, `td.drawUI(ctx)`, then my HUD.
5. **Input while the stage runs:** keys -> `td.key('1'..'4' | 'left' | 'right' | 'up' | 'down' | 'ok' | 'back' | 'upgrade' | 'sell' | 'target' | 'wave' | 'speed' | 'pause')`; pointer down / move / up -> `td.pointer(type, x, y)` in my logical px.
6. **Autoplay:** if my game has one, `td.setAuto(true)`; the bot builds and sends waves through the same path.
7. **Stage ends:** `onEnd(result, info)` once (`'win'` | `'lose'`): run my existing win / lose code once, set the phase my other code reads.

## Rules

- Never write gold, lives or HP from outside: `onHit` is feedback only; extra gold goes through `td.addGold(n)`.
- No `Math.random` or clock in custom tower / enemy drawing (use `td.rng()`).
- Keep every key, restart, `?auto=1`, `?t=&freeze=1` and my resolution working.

## Self-check without a browser

- The module is byte-identical; every load-time identifier exists.
- Every path waypoint list runs straight (neighbours share a row or column) and no road cell has a tree, rock or water in my rows.
- Trace one stage: start -> update each step -> build -> wave -> `onHit` per hit -> `onEnd` once -> my next screen.
- Walk one hit: Bolt 14 on an armour-2 crawler = 12; Frost 5 (pierce) = 5.
- Walk one sale: Bolt 50 + upgrade 45 = 95 invested x 0.7 = 66 back.

## Acceptance checks

- Picking a tower shows a ring; a road cell turns red with "Keep the road clear" and nothing is built.
- A tower on Strong shoots the foe with the most HP in range; on First, the one nearest the gate.
- The panel previews the next wave; that wave then spawns exactly those foes.
- Foes face the way they walk; `?auto=1` still finishes my game, no console errors.

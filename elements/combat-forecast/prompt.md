# A combat forecast window for my game

Defaults (change before pasting):
`{{open}}` = 6 · `{{slide}}` = 80 · `{{place}}` = corner · `{{rows}}` = auto · `{{bars}}` = on · `{{blink}}` = 320 · `{{sides}}` = attacker · `{{margin}}` = 3

---

You are given `combat-forecast.js`, a finished module, and its `README.md` (API). **Include it verbatim** (`<script src>` before the game script, or pasted unchanged in its own `<script>`). Never rewrite or "fix" it. One global, `GameDNA_CombatForecast`; it reads no input, changes no game state and **never computes rules**.

Goal: while the player chooses whom to attack, before confirming, a window shows both sides' numbers from MY game's rules: HP now → after, damage, hit and crit (if my game has them), the counter or `--`, x2, advantage arrows. It updates live and never covers the two units, the cursor or the HUD.

**Integration points** (find where my game plays each role):

1. **Create once** when the canvas and units exist, before the first update:
   `fc = GameDNA_CombatForecast.create({ view: {x: 0, y: 0, w, h}, getObstacles, getCursor, params: { open: {{open}}, slide: {{slide}}, place: '{{place}}', rows: '{{rows}}', bars: '{{bars}}', blink: {{blink}}, sides: '{{sides}}', margin: {{margin}} } })`.
   `view` = play field above the HUD, native px. `getObstacles()` = every living unit's drawn box in SCREEN px (after camera) with its `id`, plus HUD panels and windows without an id. `getCursor()` = the map cursor rect or `null`.
2. **Aiming state**: find the exact state where my game knows "this unit would attack that unit" but the player has not confirmed (target picker, cursor over an enemy in range, attack menu). Every fixed step: if on, `fc.show(att, def, data)`; else `fc.hide()`. `att`/`def` = `{id, name, team: 'a' (player) | 'b' (enemy), hp, max, rect, weapon?}`.
3. **Numbers**: build `data` by calling the SAME functions my attack uses: `{dmg, hit, crit, hits, adv, counter: {dmg, hit, crit, hits} | null}`. Random damage → `dmg: [min, max]`. No hit or crit system → leave them out. `counter: null` when the target cannot strike back under my rules.
4. **Clock and draw**: `fc.update(1000 / 60)` once per fixed step, after the `show`/`hide`; `fc.draw(ctx)` after map, units and HUD, before full-screen banners, outside screen shake.
5. **Existing preview**: if my game already draws one, delete only its drawing; its numbers become `data`. Keep target highlights.
6. **Other UI**: anything that places pop-ups avoids `fc.rect()`.

**Find and keep every caller**: autoplay (`?auto=1` or similar) still reaches the same end; `?t=...&freeze=1` screenshots, shortcuts, restart, title and tap handlers still work. Never route the AI through the preview code. Add code; never remove or rename my functions.

**Self-check without a browser**
- The module file is byte-identical and loaded before first use.
- Name the aiming state; exactly one place per step calls `show` or `hide`.
- Walk one pair by hand: `data` equals what the attack will apply (or its range); no invented formula.
- Rects are screen px; every identifier in `getObstacles`/`getCursor` exists when `update` first runs.
- `update` once per step, `draw` once per frame after the HUD; no duplicate preview drawn.

**Acceptance checks** (screenshots if you can)
1. Aiming at an enemy shows the window before confirming: names in team colours, HP now → after, DMG (x2 when doubling), HIT/CRT if my game has them, the counter or `--`.
2. Changing target or weapon updates the numbers at once; confirming or cancelling closes it.
3. It never covers the attacker, the target, the cursor or the HUD.
4. `?auto=1` (or my autoplay) reaches the same end as before, no console errors.

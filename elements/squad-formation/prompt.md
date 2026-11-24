# Add squad formations (front row / back row) to my game

Defaults (change before pasting):
`{{backGuard}}` = on · `{{backWeak}}` = 1.25 · `{{backMelee}}` = 0.5 · `{{face}}` = auto · `{{autoMs}}` = 1800

---

You are given `squad-formation.js`, a finished module, and its `README.md`. **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged); never rewrite it. Read its README first.

Units become **2x3 squads**: front row faces the enemy. Melee reaches only the front row while a front-row unit stands; ranged and magic reach everyone, back row × `{{backWeak}}`; melee from the back × `{{backMelee}}`. A modal editor arranges squads before fighting.

Add code; never remove or rename functions.

**First, read my game** and note: the fixed step and every loop calling it (frame loop, `?t=&freeze=1` fast-forward, `?auto=1`); input; where battles start and restart; **every place a target is chosen** (menu, tap hit test, enemy AI, autopilot); every damage formula; unit positions.

**Integration points**

1. **Load** the module before the game script.
2. **Create one instance** before the first battle:
```js
const sf = GameDNA_SquadFormation.create({
  view: { x: 0, y: 0, w: SCREEN_W, h: SCREEN_H },
  params: { backGuard: '{{backGuard}}', backWeak: {{backWeak}}, backMelee: {{backMelee}}, face: <FACE>, autoMs: {{autoMs}} },
  unit: { id: u => <unique id>, reach: u => <'melee' | 'ranged' | 'magic'>, art: u => <sprite canvas or image> },
  autoplay: () => <the game's autoplay flag>
});
sf.attach(canvas, { w: SCREEN_W, h: SCREEN_H });
```
`FACE` = `'{{face}}'`; if auto: side view → `'left'`/`'right'` (where the enemy stands; pass `open(ids, {enemy})` for the VS panel), map or top-down → `'up'`.
3. **Squads** where a battle starts (again after rebuilding units): `sf.squad({ id, team: 'a' | 'b', name, units })`. Map/tactics games: **each map unit becomes a squad** of 2-4 members (plain objects with `id, name, hp, maxHp, atk, def, reach, art`); the map unit's HP becomes the sum of its members'.
4. **Editor**: `sf.open([<player squad ids>])` before the player fights (battle start, each wave, or a map muster). Top of the fixed step: `if (sf.busy()) { <send this step's keys to sf.key('up'|'down'|'left'|'right'|'ok'|'back')>; sf.update(STEP_MS); return; }`; otherwise `sf.update(STEP_MS)` every step.
5. **Targets**: every target list uses `sf.targetsFor(attacker, enemySquadId, reach)` or `sf.pickTarget(...)`. Tactics fights: each living member of the attacking squad strikes once with `pickTarget`, then counter-attacks the same way.
6. **Damage**: `const h = sf.hit(attacker, target, reach); if (h.ok) damage = Math.max(1, Math.round(damage * h.mul));`. `h.cause`: `'guard'` = target shielded; `'attacker'` = can't strike from its row.
7. **Positions and draw**: front row nearer the enemy (`sf.spot(unit, area)`); `sf.drawTag` beside sprites or `sf.drawPips` on map tokens; `sf.draw(ctx)` last.

**Keep every caller working**: `?auto=1` still ends (the editor deploys itself), `?t=<ms>&freeze=1` stays deterministic, restart, title, taps. While busy, drop the step's other input.

**Self-check without a browser**
- Module byte-identical, loaded first; `sf` defined before first use.
- `sf.update` runs in every loop, also while busy.
- Unit ids unique across squads; `squad()` called again after rebuilding units.
- Every target list and damage roll goes through `targetsFor`/`pickTarget`/`hit`; empty lists guarded.
- Walk the defaults: Knight front, Archer back. Enemy melee → `targetsFor` = [Knight], `hit(..., archer).ok` false; enemy arrow, 10 damage on the Archer → 13. Knight falls → melee reaches the Archer.

**Acceptance checks**
1. The editor opens before fighting; arrows + Z (or drag) swap units; DEPLOY starts.
2. Melee never hurts the back row while a front-row unit stands; ranged and magic do, harder.
3. Front rows stand nearer the enemy; tags or pips show rows.
4. `?auto=1` ends without console errors; frozen frames are deterministic.

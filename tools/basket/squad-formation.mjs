// Basket hint for A-12 squad-formation: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'systems',
  does: 'Each side fights as squads on a 2x3 grid: a front row of three that faces the enemy and a back row of three behind it. Melee reaches only the front row while any front-row unit stands; ranged and magic reach everyone and hit the back row harder; melee from the back row is weaker. A modal formation editor (keys, mouse drag, touch, autopilot) opens before fights; the game\'s own target lists and damage go through `targetsFor` / `pickTarget` / `hit`. On a tactics map every map unit becomes a squad of members whose HP sums to the token\'s.',
  params: {
    backGuard: 'create `params.backGuard`', backWeak: 'create `params.backWeak` (ranged / magic on the back row)', backMelee: 'create `params.backMelee` (melee from the back row; 0 = impossible)',
    face: 'create `params.face`; auto = choose from the game\'s view (side view: left or right, toward the enemy; map or top-down: up)', autoArrange: 'create `params.autoArrange`', autoMs: 'create `params.autoMs`', tags: 'create `params.tags`'
  },
  steps: [
    ['Once, before the first battle',
      '`sf = GameDNA_SquadFormation.create({view: {x: 0, y: 0, w: <screen width>, h: <screen height>}, params: {backGuard: \'{{backGuard}}\', backWeak: {{backWeak}}, backMelee: {{backMelee}}, face: <FACE>, autoArrange: \'{{autoArrange}}\', autoMs: {{autoMs}}, tags: \'{{tags}}\'}, unit: {id: u => <unique id>, reach: u => <\'melee\' | \'ranged\' | \'magic\'>, art: u => <sprite canvas>}, autoplay: () => <autoplay flag>})`; `sf.attach(canvas, {w: <native width>, h: <native height>})` for drag and drop. Define `sf` before any code that runs at load time uses it. FACE = \'{{face}}\' unless it is auto; auto: look at the game\'s view: a side view (parties facing each other across the screen) uses \'left\' when the enemy stands to the left of the player\'s squad and \'right\' when to the right (the editor then shows columns and can show the enemy squad with a VS mark: pass `{enemy: <enemy squad id>}` to `open()`); a map, grid or top-down game uses \'up\'.'],
    ['Where a battle, wave or map starts (and restarts)',
      '`sf.squad({id, team: \'a\' | \'b\', name, units})` per side (call again after unit objects are rebuilt; same id keeps the formation). Tactics map: give each map unit 2-4 member objects `{id, name, hp, maxHp, atk, def, reach, art}` in its own squad and set the token\'s HP / max HP to the members\' sums. Then `sf.open([<player squad ids>], {enemy: <enemy squad id>})`.'],
    ['Top of the fixed update step (the one the frame loop, the `?t=&freeze=1` fast-forward and autoplay all call), before the autopilot',
      '`if (sf.busy()) { for (<each key event this step>) sf.key(<\'up\'|\'down\'|\'left\'|\'right\'|\'ok\'|\'back\'>); sf.update(<step ms>); return; }`, dropping the step\'s other input; otherwise `sf.update(<step ms>)` once per step.'],
    ['Every place a target is chosen: player target menu, tap / click hit test, enemy AI, autopilot',
      'Use `sf.targetsFor(attacker, <enemy squad id>, <reach of this action>)` as the list, or `sf.pickTarget(...)` for one deterministic target. Guard an empty list (only when the whole squad has fallen). Tactics fights: each living member of the attacking squad strikes once (slot order) with `pickTarget`, then the defender\'s counter the same way; re-sum the token HP after each volley.'],
    ['Every damage formula', '`const h = sf.hit(attacker, target, <reach>); if (!h.ok) <skip>; damage = Math.max(1, Math.round(damage * h.mul));`'],
    ['Where units are positioned and drawn',
      'Front row nearer the enemy: `sf.spot(unit, {x, y, w, h, face})` gives each unit\'s cell centre in a squad area. Optional: `sf.drawTag(ctx, unit, x, y)` beside each sprite, `sf.drawPips(ctx, squadId, x, y)` on map tokens, `sf.drawGuards(ctx, attacker, squadId, reach, u => box)` while the player aims. `sf.draw(ctx)` last in the draw pass, outside camera shake.']
  ],
  gotchas: [
    '`?auto=1` hangs on the editor -> `update` is not called while busy, or `autoplay` was not passed; the fast-forward loop must run the same step.',
    'Melee still hits the back row -> one target chooser (enemy AI, autopilot, tap hit test) still uses the old list; grep every place targets are picked.',
    'No row effect on damage -> the formula does not multiply by `hit().mul`.',
    'SHIELDED appears over a front-row target, or a back-row melee unit swings at nothing -> check `sf.canStrike(attacker, reach)` first and read `hit().cause` (`attacker` = the attacker cannot strike from its row; `guard` = the target is shielded).',
    'The press that deployed also attacks or opens a menu -> the rest of that step\'s input was not dropped while busy.',
    'Formation resets each wave or restart -> a new squad id each time or unstable unit ids; keep both stable and call `squad()` again with the rebuilt objects.',
    'ReferenceError at load -> `sf` used (e.g. in `attach` or a resize handler) before `create` ran; create it first.',
    'Tactics token dies while members live (or the reverse) -> re-sum the token HP from its members after every volley and at setup.',
    'Sprites still stand at the old spots -> positions must come from the squad layout (`spot()`), and hit tests / other modules must read the same positions.'
  ],
  checks: [
    'Before fighting the formation editor opens; arrows + Z (or a drag) swap units between rows; DEPLOY starts the fight; under `?auto=1` it arranges and deploys by itself.',
    'Melee never damages a back-row unit while a front-row unit of its squad stands; ranged and magic do, harder; a melee unit in the back hits weaker.',
    'Front-row units stand nearer the enemy and row tags or squad pips show the rows; `?t=<ms>&freeze=1` is deterministic; `?auto=1` ends with no console errors.'
  ],
  selfcheck: [
    'Grep every target list and enemy / autopilot target choice: each goes through `targetsFor` or `pickTarget`; grep every damage formula: each applies `hit().mul`.',
    '`sf.update` runs once per fixed step in every loop, also while busy; `sf.draw(ctx)` is the last draw call where the editor can be open.',
    'Walk the defaults: Knight front, Archer back. Enemy melee -> `targetsFor` = [Knight], `hit(raider, archer).ok` false; enemy arrow, 10 damage on the Archer -> 13 (x{{backWeak}}). The Knight falls -> melee reaches the Archer.'
  ],
  offers: {
    'ui-rects': { title: 'formation editor', text: 'While `sf.busy()`, `sf.rects().window` is the editor window (it is modal and dims the field); other overlays should wait or stay outside it.' }
  },
  wants: {
    'battle-start': { title: 'squads and editor', text: 'Build the squads with `sf.squad(...)` and open the editor there, before the other element\'s battle-start reset runs its intro.' },
    'hit-site': { title: 'hit sites', text: 'The other element\'s hit site is where `sf.hit()` already scaled the damage; pass it the final number.', check: 'Back-row hits from arrows and spells show the larger number.' }
  }
};

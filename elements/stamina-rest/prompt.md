# Add stamina and outpost rest to my game

**Required:** `{{clock}}` = `turn` (phases) or `realtime` (fixed-step action). `{{sites}}` = where units rest.
Defaults: `{{pace}}` = standard (realtime: use camp) · `{{max}}` = 6 · `{{recoverAt}}` = 2 · `{{capture}}` = on. Pace sets costs per clock: turn standard: attack 2, move 1, +1 per phase, +3 resting, no attacks at 0; realtime camp: 1 per swing, +0.6/s, fires refill, slower swings at 0.

---

You get `stamina-rest.js` and its `README.md`. **Include the module verbatim** (`<script src>` first, or pasted unchanged); never rewrite it. It defines `GameDNA_StaminaRest`: units spend stamina per march and attack; at 0 they are exhausted (no attacks, or slower); resting in a site their side owns refills; holding a site claims it. It draws everything (pips, REST +N, markers): add no labels of your own. It never moves units, deals damage or pauses.

Add code; never remove or rename functions.

**First, read my game**: step loops (`?t=&freeze=1`, autoplay); **every attack start** (player, AI, autoplay, counters); move commit; phase starts; camera; restart.

**Integration points**

1. **Load** the module first; **create one instance** once the screen size is known:
```js
const stamina = GameDNA_StaminaRest.create({ clock: '{{clock}}', bounds: { x: 0, y: 0, w: <screen w>, h: <screen h> },
  units: () => <living units>.map(u => ({ id: <stable id>, side: <team>, x: <sprite left>, y: <sprite top>, w: <sprite w>, h: <sprite h> })),
  sites: () => [ /* {{sites}}: { id, kind: 'camp'|'outpost'|'shrine'|'fire', x, y, r } or { id, kind, x, y, w, h }, owner: <side or null> */ ],
  camera: () => ({ x: <cam x>, y: <cam y> }), tile: <tile px>,   // omit camera if nothing scrolls
  uiRects: () => [ /* HUD, banners, windows (screen px) */ ],
  params: { pace: '{{pace}}', max: {{max}}, recoverAt: {{recoverAt}}, capture: '{{capture}}' } });
```
Sites go on reachable ground near the fighting (`outpost` = banner only); add at least one neutral site (`owner: null`) so captures happen.
2. **Attacks**: before each attack: `if (!stamina.engage(id)) { <end this unit's action as a wait, or skip the swing> }`; counters: `stamina.engage(id, 'counter')`, no counter on false. Never let a refused attack retry forever.
3. **Turn clock**: `stamina.march(id)` once per committed move (not undone ones); `stamina.turnStart(side)` once where control returns to that side (after its phase banner); move range `= stamina.moveRange(id, base)`. **Realtime**: no march/turnStart (walking is measured); attack cooldown `= base / stamina.speedScale(id)`.
4. **AI and autoplay**: when `!stamina.canAttack(id)`, head for `stamina.nearestSite(id)` instead of a target.
5. **Step and draw**: `stamina.update(<step ms>)` every step and scene (freeze loop too). Draw: ground → `stamina.drawSites(ctx)` → units → `stamina.draw(ctx)` → HUD, outside the camera transform (inside it: pass `true` as 2nd argument).
6. **Restart**: `stamina.reset()`.

**Autoplay must still end** (the result may change; note it).

**Self-check without a browser**
- Module byte-identical, loaded first; one `create`.
- Every attack start calls `engage` first; its `false` path ends the action.
- `update` every step; `turnStart` once per phase per side; `march` only on commit; `units()` = drawn sprite boxes, same space as `sites()`.
- Walk turn defaults: move + attack = 3 → 3 left; +1 next phase; more attacks → 0 → TIRED, `engage` false, unit waits; in an owned camp +1+3 = 4 → attacks again. A normal fight must show one TIRED.

**Acceptance checks**
1. Pips drain; at 0: TIRED, attacks refused (TOO TIRED) or slowed; the game moves on.
2. Owned sites refill with glow (`REST +N`); holding an unowned site claims it.
3. `?t=<ms>&freeze=1` is deterministic; `?auto=1` still ends with no console errors.

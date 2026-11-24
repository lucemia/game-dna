# stamina-rest.js (G-10 module, v1.1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_StaminaRest`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns **stamina**: every unit (squad, hero, party member) spends it per march and per engagement; at 0 the unit is **exhausted** (cannot attack, or is slowed) until it recovers to `recoverAt`; **resting** inside a site its side owns (camp, outpost, shrine) restores it per turn or per second; sites can be **claimed** by standing in them. It draws the stamina pips above each unit, the refill pops, the rest animation (warm glow, rising embers, `REST +3`), the exhausted sweat drop and blinking strip, the refused-attack shake (`TOO TIRED`), and the site markers (campfire, banner, shrine stone, zone outline, capture ring and flare).

Your game keeps its own units and rules; the module never moves a unit, never deals damage, never reads input and never pauses. It only answers "may this unit attack?" (`engage`) and "how fast may it move?" (`speedScale` / `moveRange`).

Look: crisp pixel strips with a built-in 3×5 font on native pixel canvases (≤ 400 px wide), glassy capsules with gradients and glow on HD canvases. `render: 'crisp' | 'smooth'` forces one. With `skins/skin-api.js` loaded and `skin` given, team colours come from the skin's `team.a/b/n` tokens.

## Two clocks

| | `clock: 'turn'` (tactics, phase-based, board games) | `clock: 'realtime'` (action, fixed-step) |
|---|---|---|
| march | `march(id)` once per **committed** move (not on undoable previews); `march(id, n)` = n × `march` | measured from `units()` positions every `update()`: `march` per tile walked (`tile` option, px); jumps over 3 tiles (teleport, respawn) are free |
| engage | `engage(id)` where an attack starts; `engage(id, 'counter')` for a counter-attack | `engage(id)` where a swing / shot starts |
| recovery | `turnStart(side)` where that side's phase begins: `regen` for every unit of the side, plus `rest` for those inside a site the side owns | every `update()`: `regen`/s after `regenDelay` ms without engaging; `rest`/s instead while standing still (`restStill` ms) inside an owned site |
| capture (`capture: 'on'`) | at `turnStart(side)`: a site with units of that side and no other side in it becomes theirs | standing alone in a site for `captureMs` (a ring fills) |
| refill animation | pips tick up one by one (`fillMs` each), staggered per unit | continuous, pips pop as they fill |

## Parameters (`params`)

**Real-time games: start with `pace: 'camp'`.** With `standard` a short fight rarely empties the bar (stamina shows but seldom bites); `camp` makes a normal fight end in TIRED and a walk to a fire, and a button-mashing player still finishes in most runs (unseen top-down host: autoplay wins every time; the judge's scripted masher won 7 of 8 manual runs with HP 24–37, the original 10 of 10; rerun once before calling a loss a regression). `standard` stays the default for backward compatibility.

**`pace`** is the one clock-agnostic knob (what a prompt or basket sets): it fills `engage`, `march`, `regen`, `rest` and `rule` for the instance's clock; any of those keys given explicitly in the same `params` object still wins. Changing `pace` later with `setParams` resets those five to the new preset.

| pace | turn | realtime |
|---|---|---|
| `standard` (default) | the turn column below | the realtime column below |
| `camp` | regen 0.5, rest 4: units mostly recover at sites | engage 1, regen 0.6/s, slow 0.85: fights drain you, fires refill |
| `forgiving` | engage 1, march 0.5, regen 2 | engage 0.5, regen 3.5/s |
| `harsh` | march 1.5, rule `both` (exhausted units also move half as far) | engage 1, regen 1.2/s, rule `noAttack` |


| key | turn default | realtime default | meaning |
|---|---|---|---|
| `max` | 6 | 6 | pips (1–12) |
| `engage` | 2 | 0.75 | cost of one attack |
| `counter` | 1 | 0 | cost of a counter-attack (`engage(id, 'counter')`) |
| `march` | 1 | 0.03 | turn: per committed move; realtime: per tile walked |
| `regen` | 1 | 2.5 | turn: per own phase; realtime: per second after `regenDelay` |
| `regenDelay` | – | 300 | realtime: ms after the last engage before regen starts |
| `rest` | 3 | 3 | extra per own phase / per second while resting in an owned site |
| `restStill` | – | 250 | realtime: ms standing still before rest starts |
| `recoverAt` | 2 | 2 | exhausted (reached 0) until stamina is back to this |
| `rule` | `noAttack` | `slow` | what exhaustion does: `noAttack` (engage refused), `slow` (`speedScale` / `moveRange` reduced; realtime: slower steps **and** slower attacks), `both` |
| `slow` | 0.5 | 0.75 | speed / move-range factor while exhausted with `slow` / `both` |
| `capture` | `on` | `on` | sites change owner by standing in them |
| `captureMs` | – | 900 | realtime: hold time |
| `restAt` | `owned` | `owned` | `owned` = rest only at your side's sites; `any` = any site |
| `show` | `always` | `used` | pips: `always`, `used` (hidden when full and untouched for 1.4 s), `low` (only at ≤ 1/3 or exhausted), `off` |
| `sites` | `on` | `on` | draw site markers (`off` if your game draws its own) |
| `tags` | `on` | `on` | short labels: `REST +3`, `READY +2`, `TIRED`, `TOO TIRED`, `CAMP CLAIMED` |
| `render` | `auto` | `auto` | `crisp` / `smooth` |
| `size` | 0 | 0 | 0 = auto scale (1 per 256 px of screen width); else the scale |
| `fillMs` | 140 | 0 | turn: ms per pip as a refill ticks up |

A realtime `march` above 0.5 per tile is treated as a turn value by mistake: it is capped at 0.5 with a console warning.

## API

`GameDNA_StaminaRest.create(options)` returns an instance.

| option | meaning |
|---|---|
| `clock` | `'turn'` (default) or `'realtime'`. |
| `units()` | **Required.** `[{id, side, x, y, w, h, alive, foot}]`: every unit that has stamina, `x, y, w, h` = its **drawn sprite box** in world px (same space as `sites`). `alive: false` (or `hp <= 0`) units are skipped. `side` = the team (`'blue'`, `'player'`, `'red'`…); sides named like player/blue/ally/hero/party are drawn as team a, others as team b (or pass `team(side) → 'a' \| 'b' \| 'n'`). `foot` (optional `{x, y}`) is the point tested against sites; default = centre x, 80 % down the box. `show: false` (optional) keeps the unit's stamina running but draws no strip, tag or rest effect for it (hidden units, units in fog). A unit whose box is entirely off the screen gets no strip either (no strips floating at the screen edge). |
| `sites()` | Include at least one neutral site (`owner: null`) so captures happen. `[{id, x, y, r, kind, owner}]` circle (centre + radius) or `{id, x, y, w, h, …}` rect (top-left + size), world px. `kind` `camp` (fire + banner), `fire`, `shrine`, `outpost` (banner only: your game draws the building). `owner` = the side that owns it at the start, or null; read once, then the module keeps ownership (if your game later returns a different owner, that wins). |
| `camera()` | Optional `{x, y}` subtracted from world positions at draw and for avoidance (scrolling games). |
| `bounds` | The screen `{x, y, w, h}` in native/logical px (or a function). Sets the scale and keeps pips on screen. |
| `uiRects()` | Optional HUD / window rects in **screen** px; the strip goes above or below the unit, else as a compact upright badge right or left of it (filling bottom to top), whichever avoids these, other units and other strips; only when none is free of units does it sit inside the top of the box. While UI covers every slot (a banner or window over the unit), the strip hides. |
| `obstacles()` | Optional sprite boxes of things without stamina (enemies in a hero game, NPCs), world px like `units()`: strips avoid them when there is room. |
| `tile` | Realtime: px per tile for `march` (default 16 × scale). |
| `onExhausted(id, side)`, `onRecovered(id, side)`, `onRest(id, gain, siteId)` (turn: once per resting unit at `turnStart`; realtime: `gain` 0 when a rest starts, then the session total when it ends or is full, together with the module's own `REST +N` tag), `onCapture(siteId, side, kind)`, `onRefused(id, side)` | Optional callbacks (sound, toasts). Exceptions are caught. |
| `skin`, `team(side)`, `debug(event)` | Optional. |

| method | |
|---|---|
| **`engage(id, kind?)`** → `true` / `false` | Call where an attack **starts** (before damage). `true`: allowed and paid. `false`: the unit is exhausted (`noAttack` / `both`): **do not attack**, and finish that unit's action as a wait (or a move), so your turn loop and autoplay move on. `kind = 'counter'` costs `counter`; a number costs that much. |
| `canAttack(id)` | Ask without paying (AI planning, menus, greying out an Attack command). |
| `march(id, n = 1)` | Turn clock: once per committed move. Realtime: not needed. |
| `turnStart(side)` | Turn clock: once where control returns to that side (after its phase banner, so the refill and READY +N are seen). |
| `speedScale(id)` | Realtime: divide the attack cooldown by it (`slow` / `both`; 1 when not exhausted). Multiplying walking speed by it too feels heavier but changes paths, so re-check the game's autoplay. |
| `moveRange(id, base)` | Turn: the move points to use this turn (`slow` / `both`). |
| `nearestSite(id)` → `{id, x, y, owner, kind, dist}` or null | The closest site the unit's side may rest at (or claim). Use it in your AI / autoplay: an exhausted unit walks there. |
| `stamina(id)` → `{value, max, exhausted, resting, shown, site}` | For HUDs and AI. |
| `update(stepMs)` | Every fixed step, in every scene. The only clock (animations, realtime regen, captures, pip layout). |
| `drawSites(ctx, inWorld?)` | Under the units, after the ground. `drawSite(ctx, id, inWorld)` + `siteList()` (`[{id, x, y, footY}]`) to put sites in a y-sorted draw list. |
| `draw(ctx, inWorld?)` | After the units, before the HUD: pips, rest effects, sweat, tags. |
| `owner(siteId)`, `claim(siteId, side)`, `set(id, value)` | Read / force ownership; set stamina (cheats, items). |
| `serialize()` / `restore(obj)` | `{v: 1, units: {id: {v, ex}}, sites: {id: owner}}` for saves. |
| `reset()` | New game: every unit back to full, ownership back to what `sites()` says. |
| `setParams(p)`, `params()`, `stats()`, `lastDrawn()` | Live tuning; counters; the pip / tag rects drawn last frame. |

`inWorld`: pass `true` only when you call a draw method **inside** your camera transform; otherwise the module subtracts `camera()` itself.

## Integration (15 lines)

```js
// <script src="stamina-rest.js"></script> before your game script
const stamina = GameDNA_StaminaRest.create({ clock: 'turn', bounds: { x: 0, y: 0, w: SCREEN_W, h: FIELD_H },
  units: () => units.filter(u => u.hp > 0).map(u => ({ id: u.id, side: u.team, x: u.px, y: u.py, w: SPRITE_W, h: SPRITE_H })),
  sites: () => [{ id: 'camp', kind: 'camp', x: 2 * TILE, y: 9 * TILE, w: 3 * TILE, h: 2 * TILE, owner: 'player' },
                { id: 'fort', kind: 'outpost', x: 12 * TILE, y: 2 * TILE, w: 2 * TILE, h: 3 * TILE, owner: 'enemy' }],
  uiRects: () => [HUD_RECT] });
function startAttack(att, def) {                                  // where your game starts an attack
  if (!stamina.engage(att.id)) { endAction(att); return; }       // too tired: the action becomes a wait
  /* ...existing attack... */ if (canCounter && stamina.engage(def.id, 'counter')) { /* counter */ }
}
function commitMove(u) { if (u.moved) stamina.march(u.id); }      // once, when the move can no longer be undone
function beginPhase(side) { stamina.turnStart(side); /* ...existing... */ }
// fixed step: stamina.update(STEP_MS);  draw: ground -> stamina.drawSites(ctx) -> units -> stamina.draw(ctx) -> HUD
// AI / autoplay: if (!stamina.canAttack(u.id)) head for stamina.nearestSite(u.id) instead of a target
```

Realtime: `clock: 'realtime'`, `tile: TILE`, `camera: () => cam`; where the swing starts: `if (!stamina.engage('player')) return; cooldown = BASE_CD / stamina.speedScale('player');`; no `march` / `turnStart` calls. The realtime defaults (cost 0.75, regen 2.5/s after 0.3 s, `rule: 'slow'`) keep a button-masher able to finish fights: a long fight leaves the hero winded (slower swings), a short pause or a fire refills. `noAttack` and higher costs are the harsher choice; check the game's autoplay and a mashing player still finish.

## Keep the game's other callers working

- **Autoplay must still end.** Every place that attacks (player input, enemy AI, the game's autoplay) goes through `engage`; a refused attack must still end that unit's action (turn games) or simply not swing (realtime), never retry the same choice forever. Point exhausted units at `nearestSite()` in the AI. `?auto=1` may end differently (tired units fight less); it must end.
- **`?t=&freeze=1`**: call `update()` inside the fast-forward loop too; all animation comes from it.
- **Restart / new game**: `reset()`. Save: `serialize()`.
- Damage numbers, hit effects and other addons stay where they are; `engage` only decides whether the attack happens.

## Self-check without a browser

1. Module byte-identical, loaded before the game script; one `create`.
2. `grep` every attack start (player, AI, autoplay, counters): each calls `engage` first and has a path for `false` that ends or skips the action.
3. Turn: `turnStart(side)` once per phase start for each side; `march` once per committed move (an undo/cancel before commit costs nothing).
4. `update()` every fixed step (freeze loop too); `drawSites` before units, `draw` after units and before the HUD.
5. Walk one example: max 6, engage 2, march 1: move + attack = 3 → 3 left; next turn +1 = 4; two more attacking turns → 0 → `TIRED`, `engage` returns false; standing in the owned camp at its phase start: +1 + 3 = 4 → ready again (≥ 2).

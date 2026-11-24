# N-01 starter: Sunshard Isle (third-person 3D)

`index.html` is a complete single-file 3D exploration game built on `module/third-person-3d.js` (pasted in unchanged) and three.js 0.149.0 (`three.min.js`, keep it next to `index.html`). A low-poly adventurer with a cape and satchel lands on a small island, finds three sun shards (east grove, west ruins, north rocks) and brings them to the Keeper by the dark beacon; talking to the Keeper relights the beacon and ends the game. Everything is procedural (primitives, code-drawn ground texture). English UI, no external assets besides three.js.

Build your game from this file and plug addons into the extension points below rather than editing the module.

## Run

| URL / key | Effect |
|---|---|
| `?auto=1` | autoplay: collects the three shards, talks to the Keeper, wins (about 23 s of game time) |
| `?t=<ms>&freeze=1` | fast-forward the deterministic 60 Hz simulation (autoplay on unless `&auto=0`), render one frame, set `window.__frozen = true`; `<html data-state>` holds `{phase, shards, t}` |
| `?palette=meadow\|dusk\|autumn`, `?gear=both\|cape\|satchel\|none`, `?shadows=soft\|hard\|off`, `?dpr=1..3`, `?seed=n`, `?touch=1` | look, back gear, shadow quality, max pixel ratio, seed, force the touch controls |
| WASD / arrows | move (camera-relative); runs by default, hold Shift to walk |
| drag (mouse or finger, right side) or Q / E | turn the camera |
| Space / Enter / F | start, talk, next line |
| P | toggle autoplay (any move key takes over) |
| Esc | pause |
| touch | a stick appears bottom-left and a TALK button bottom-right (`GAME.virtualKey(key, down)` for custom buttons) |

Without WebGL the page draws a readable message instead of the game and never throws.

## Structure

Scripts in order: `three.min.js`, **`GameDNA_ThirdPerson3D`** (the module, verbatim), the game (defines `window.GAME`), the **ADDONS SLOT**, then `GAME.boot()`.

The game script has numbered sections (search `=== n.`):

| # | Section | What is there |
|---|---|---|
| 1 | Config and content | `LAYOUT` (props: `{kind, x, z, rot, s, ...}`; kinds `tree rock pillar arch wall fountain lantern crate barrel bush stall beacon`), `SHARDS`, `PATHS` (painted dirt paths), `KEEPER`, `TEXT` |
| 2 | Game object | `game` = `window.GAME`, `each(hook)` (calls addons), `toast`, `say` |
| 3 | World | island, paths, plazas, props, grass, the hero, the Keeper, shards; `GAME.addNPC`, `addActor`, `anchor`, `worldToScreen`, `addPickup` |
| 4 | Events | pickups (shard counter), talking (`startTalk`, `advanceTalk`), `lightBeacon` (victory) |
| 5 | Autoplay | nearest shard, then the Keeper; walks with `TP.autopilot(goal)` (A* around props) |
| 6 | Input | key map, pointer drag, touch stick, the input chain |
| 7 | Main step | `step()` (60 Hz: keys, gates, input -> `TP.step`, `npcLogic`, addons' `onStep`) |
| 8 | Drawing | `TP.render()` (3D), then the 2D overlay: addon layer `world`, bubbles, HUD / dialog / title / end, addon layers `hud`, `overlay` |
| 9 | Boot | `window.__state`, `window.__advance(ms)`, `GAME.boot()` (fast-forward, main loop) |

Add a prop: append to `LAYOUT`. Add a shard: append to `SHARDS` (and raise `NEED`). Add a talkable NPC: `GAME.addNPC({...})` (below).

## Extension points

**Where addons go: the ADDONS SLOT.** Put each addon module there (`<script src>` or pasted unchanged) and register it with `GAME.addons.push({...})`. The slot runs after `window.GAME` and the 3D world exist and **before the game boots**, so addons see every `?t=&freeze=1` frame. Every hook is optional:

```js
GAME.addons.push({
  name: 'my-addon',
  init(game) {},                        // once, at boot (world built): add 3D objects to game.three.scene here
  gate(game) { return true; },          // first in every step; return false = hold the world this step
  onKey(key, game) { return false; },   // keys: up down left right walk ok camL camR pause auto; true = consumed
  onStep(info, game) {},                // after each 60 Hz world step: info = {dt (s), t (ms), frame}
  update(info, game) {},                // every frame incl. title / end: info = {dt (ms, 0 while held), frozen, paused, t}
  draw(g, layer, game) {},              // 2D overlay context in CSS px; layer 'world' | 'hud' | 'overlay'
  onPickup(ev, game) {}, onTalk(npcId, npc, game) {}, onPhase(phase, game) {}, onEvent(ev, game) {}, onEnd(result, game) {}
});
```

1. **3D scene: `GAME.three = {THREE, scene, camera, renderer}`** (null without WebGL). Add meshes in `init`; animate them in `onStep`. Ground is the plane y = 0 inside `GAME.TP.islandR` (20 m); walkable inside `GAME.TP.walkR`. Units are metres; +Y is up.
2. **Actors: `GAME.actors()`** -> module actors `{id, kind, x, z, yaw, vx, vz, speed, height, target, root (Object3D), model, parts}`. The hero is `'hero'` (`GAME.hero`), the Keeper `'keeper'` (`GAME.keeper`).
   - `GAME.addActor({id, kind: 'npc', x, z, yaw, look: {base: 'hero' | 'keeper' | 'villager', ...colours}, height})` builds another procedural adventurer (auto-scaled, feet on the ground). For a non-adventurer model pass `obj` (any Object3D whose nose points along +Z).
   - `actor.play('wave' | 'cheer' | 'bow' | null)` plays a gesture; `actor.target = 'hero'` (or another id, or `{x, z}`) makes a standing actor turn to face it; `GAME.TP.walkTo(id, x, z, speed)` walks it there (it faces its move direction).
   - Set `actor.external = true` for an actor your addon moves itself (billboards); set `actor.ghost = true` if the hero should not bump into it. `stateExtra(actor)` (pass it in the `addActor` spec) merges extra fields into its `__state()` entry.
   - Facing rule for anything you add: `yaw = Math.atan2(v.x, v.z) + GameDNA_ThirdPerson3D.FACING_OFFSET` (0 for the built-in models).
3. **NPCs you can talk to: `GAME.addNPC({id, x, z, yaw, look, name, lines: [...], greet, near: 4, talkR: 2.2, waveNear: true, onTalk(npc, game) -> lines})`**: builds the actor if needed; it turns to face the hero within `near`, says `greet` in a speech bubble and waves once; Space within `talkR` opens the dialog. `GAME.npcs` lists them; `GAME.nearNPC()` is the one in talk range.
4. **Anchors (world -> screen): `GAME.anchor(id)`** -> `{x, y (= top), footX, footY, cx, cy, h, depth, visible, world: {x, z, h}}` in CSS px of the canvas, for actors and pickups; `GAME.worldToScreen(x, y, z)` -> `{x, y, depth, visible}`. Valid after the 3D render of the frame (inside `draw`).
5. **2D overlay: `draw(g, layer, game)`**: `g` is the overlay 2D context, already scaled to CSS px. `'world'` runs right after the 3D render, before speech bubbles and the HUD (damage numbers, bark bubbles, markers); `'hud'` after the HUD and dialog; `'overlay'` last. `GAME.uiRects()` -> `[{name, x, y, w, h}]` (hud, dialog, touch stick and button while shown) to keep clear of.
6. **Speech and toasts: `GAME.say(id, text, ms)`** (bubble above an actor), `GAME.toast(text, ms)` (centre-top). Built-ins an addon may turn off: `GAME.flags.builtinBubble` (greeting bubbles), `builtinBurst` (beacon light burst), `builtinHud`.
7. **Pickups: `GAME.addPickup({id, x, z, kind, value, color})`**: a floating crystal with a glow ring; walking within ~1 m collects it (burst) and fires `onPickup({id, kind, value, x, z})`. Shards count only when `kind` is `'shard'` (the default).
8. **Input chain.** Keys are queued as `up down left right walk ok camL camR pause auto`; each goes to the addons' `onKey` in order, first `true` consumes it. `GAME.virtualKey(key, down)` presses one from your own buttons.
9. **Autoplay.** `GAME.autoplay.on`; `GAME.autoplay.goal` (id it walks to). Replace the plan with `GAME.autoplay.decide = game => ({x, y, run, ok}) | null` (camera-relative stick; `GAME.TP.autopilot({x, z})` turns a world goal into one; null falls back).
10. **Clock and phases.** Fixed 60 Hz; `GAME.time` (ms), `GAME.frame`, `GAME.worldFrame`, `GAME.clock.paused`. Phases `title -> play <-> talk -> victory -> end` (`onPhase`). `onEnd('victory')`.
11. **State for checks: `window.__state()`** -> `{t, phase, shards, camera, actors: [{id, x, z, yaw, moveDir, travelDir, forward, target, moving, facesMove, facesTarget, feetY, pose}]}`; `forward` comes from `model.getWorldDirection()`. `window.__advance(ms)` steps a frozen page and redraws (tests).

`GAME.TP` is the module instance (API in `../module/README.md`): change movement through input, not by writing `hero.x`.

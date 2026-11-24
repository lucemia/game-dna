# Add a third-person 3D exploration area to my game

Parameters (defaults): walkSpeed {{walkSpeed}} = 1.8, runSpeed {{runSpeed}} = 5.2, turnRate {{turnRate}} = 12, heroHeight {{heroHeight}} = 1.7, camDist {{camDist}} = 6.5, camPitch {{camPitch}} = 20, camLag {{camLag}} = 0.12, autoAlign {{autoAlign}} = 1.2, fov {{fov}} = 50, gear {{gear}} = both, palette {{palette}} = meadow, shadows {{shadows}} = soft.

Two ready files are in this folder: `third-person-3d.js` (global `GameDNA_ThirdPerson3D`, API in its README) and `three.min.js` (three.js 0.149.0). Include both unchanged with `<script src>`: `three.min.js` first. Do not rewrite the module, do not load any other three.js.

What it does: a low-poly adventurer on a small island seen by a follow camera. Movement is camera-relative, the body turns toward the stick then speeds up along its facing, walk and run poses follow the distance travelled (no sliding feet), the camera pulls in in front of tall props and fades tree canopies. Pickups, NPCs that face the hero, wave and greet.

## Integration points

1. **Screen**: add a WebGL `<canvas>` and a 2D `<canvas>` on top (same size, absolute). Where my game switches scenes, add an "island" scene (or make it the main scene if my game is about exploring). Keep every existing scene and URL parameter.
2. **Create** once: `tp = GameDNA_ThirdPerson3D.create({canvas, overlay, seed, params: {walkSpeed: {{walkSpeed}}, runSpeed: {{runSpeed}}, turnRate: {{turnRate}}, heroHeight: {{heroHeight}}, camDist: {{camDist}}, camPitch: {{camPitch}}, camLag: {{camLag}}, autoAlign: {{autoAlign}}, fov: {{fov}}, gear: '{{gear}}', palette: '{{palette}}', shadows: '{{shadows}}'}, onEvent})`. If `tp.ok` is false, show my normal game and skip the island (the module already wrote a message on the canvas).
3. **World**: `tp.buildIsland({radius: 20})`, paint paths/plaza, `tp.paint.done()`, `tp.buildLayout([...props])`, `tp.scatter({count: 800, flowers: 150})`. Map my game's places, items and characters to props, `tp.addPickup({id, x, z})` and `tp.addActor({id, kind: 'npc', x, z, look: {base: 'keeper' | 'villager'}})`. Hero: `tp.addActor({id: 'hero', ...}); tp.setHero('hero'); tp.snapCamera(0)`.
4. **Step**: in my fixed update (60 Hz; also in any fast-forward loop) call `tp.step({x, y, run, camYaw}, 1/60)`: `x, y` from my existing movement keys (y = forward), touch stick if my game has touch. Hook my existing "use / talk" key: if an NPC is within 2.2 m, run my dialogue; set that NPC's `target = 'hero'` while near.
5. **Events**: `onEvent({type: 'pickup', id, kind, value})` feeds my existing score / inventory code; never duplicate counters.
6. **Draw**: `tp.render()`, then draw my HUD on the 2D canvas in CSS px; labels and bubbles above characters use `tp.anchor(id)` from the same frame. Call `tp.resize(w, h)` on load and resize.
7. **Autoplay** (if my game has one): `tp.autopilot({x, z})` returns the input that walks the hero to a goal around props.

## Rules

- Anything I add that faces a direction: `yaw = Math.atan2(v.x, v.z) + GameDNA_ThirdPerson3D.FACING_OFFSET`. Never add PI by hand.
- Never set actor `x`/`z` for the hero; move it only through `step()` input.
- No `Math.random` or clock reads inside the step.

## Self-check without a browser

- Re-read every call site of anything you renamed; keep my helpers.
- Check `three.min.js` loads before the module, and every load-time identifier exists.
- Trace one pickup: hero within 0.95 m -> `onEvent` -> my counter + 1, exactly once.
- Trace facing: stick (1, 0) with camera yaw 0 -> world (1, 0) -> yaw = atan2(1, 0) = 1.571.

## Acceptance (run it)

- No console errors; existing scenes, keys and URL parameters still work.
- The hero faces every one of 8 move directions (`tp.state().actors[i].facesMove` true while moving) and `feetY` stays within 0.01.
- The camera never shows the inside of a prop; NPCs face the hero when near; pickups count once.

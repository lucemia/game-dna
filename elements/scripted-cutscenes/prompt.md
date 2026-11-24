# Add scripted cutscenes to my game

Defaults (change before pasting):
`{{bars}}` = 0.11 · `{{skip}}` = hold · `{{textSpeed}}` = 42 · `{{speed}}` = 60

---

You are given `scripted-cutscenes.js`, a finished module, and its `README.md`. **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged). It defines `GameDNA_Cutscenes`. Read the README first.

Only add code; never delete game functions.

**First, map my game**: the fixed step and `?t=`, `?freeze=1`, `?auto=1`; whether the autopilot moves or snaps the player; the camera rule and HUD; how characters are stored and drawn (feet, facing, walk counter); the dialogue box; a story moment worth a short scene (a quest hand-off, a gate opening).

**Integration points**

1. **Create one instance** after the characters exist:
```js
const cs = GameDNA_Cutscenes.create({
  view: { x: 0, y: 0, w: VIEW_W, h: VIEW_H }, world: { x: 0, y: 0, w: MAP_W, h: MAP_H },
  camera: () => /* the game's follow rule for the CURRENT positions, top-left world px */,
  actors: { hero: { name: 'You', h: SPRITE_H,
    get: () => ({ x: /* feet x */, y: /* feet y */, face: /* 'left'|'right'|'up'|'down' or radians */ }),
    set: p => { /* write p.x, p.y, p.face (or p.angle), p.moving back; walk animation from p.walk (distance) */ } } },
  dialogue: { open: (name, text, done) => /* the game's box, done() when closed */, isOpen: () => /* */, close: () => /* */ },
  onCall: name => { /* game-state changes the script asks for */ },
  cssScale: () => canvas.getBoundingClientRect().width / VIEW_W, auto: () => /* autoplay on */,
  params: { bars: {{bars}}, skip: '{{skip}}', textSpeed: {{textSpeed}}, speed: {{speed}} }
});
```
2. **A script** (data) for the moment, started once from the code that decides it: `cs.play(SCENE, { id: 'gate', once: true })`. Commands: `move`, `face`, `say` (with `to`), `emote`, `cam`, `wait`, `fade`, `cue`, `call`, `all`. Game-state changes go in `call` (they also run when skipped). End with everyone where the game expects them.
3. **The step**: call `cs.update(stepMs)` **first** in the fixed step (every scene, also the `?t=` replay; `0` while a pause menu is open). Then, while `cs.locked()`: no world, enemy or player movement update, no advance of frame counters the autopilot times itself by, no autopilot movement input (it may still close the dialogue box); the dialogue box keeps its keys.
4. **Input**: confirm -> `if (!cs.input('ok'))` the game's box; skip key down / up -> `cs.input('skip', true / false)` while locked.
5. **Draw**: the world with `cs.camera() || gameCamera` (translate by `-x, -y`, scale by `zoom` when given); the HUD with alpha `1 - cs.bars()`; then `cs.draw(ctx)` in screen coordinates; then the game's dialogue box.
6. **Reset**: `cs.reset()` on new game.

**Keep every caller working**: `?auto=1` reaches the same end state as before; `?t=<ms>&freeze=1` runs the same steps; restart leaves no scene running.

**Self-check without a browser**
- `get` returns feet in world px and `set` writes them back the same way (work one example through the sprite offset).
- Every `call` name has a case in `onCall`; every actor id in the script is in `actors`.
- Nothing moves the player while locked except the module.

**Acceptance checks**
1. The scene plays once: bars slide in, characters walk with walk frames facing their path, the camera stays inside the map, lines appear in the game's box.
2. Holding skip lands on the same positions and flags as watching it through; control returns once.
3. `?auto=1` ends as before without console errors; the same `?t=` frame twice is identical.

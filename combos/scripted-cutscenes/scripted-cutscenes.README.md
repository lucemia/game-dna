# scripted-cutscenes.js (H-04 module, v1.2.0)

One plain script, no dependencies, no `import`/`export`, ASCII only. It defines one global, `GameDNA_Cutscenes`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It runs small scripted scenes **in your game's own world**: it moves your characters (you draw them), drives the camera, shows lines (in your game's dialogue box if you give it one, else its own), emotes, fades and letterbox bars, and gives control back exactly once. Skipping lands on exactly the state playing through would have reached. No random numbers: same steps, same frames.

## API

`GameDNA_Cutscenes.create(options)` returns an instance.

| option | meaning |
|---|---|
| `view` | `{x, y, w, h}` (or a function): the whole screen in the coordinates `draw` gets (logical canvas px). Bars span it; <= 512 wide draws crisp pixel UI. |
| `stage`, `worldView` | Where the world shows inside `view` (default `view`; e.g. below a 16 px HUD strip) and how many world px it shows at zoom 1 (default the stage size). |
| `world` | `{x, y, w, h}` map bounds in world px. The camera never shows outside them. |
| `camera()` | Where **your** camera is (top-left, world px) for the current positions: run your follow rule, do not return a stale value. Read when a scene starts and while the camera glides back at the end. |
| `actors` | `{id: {get, set, name, h, w, speed, frames, stride}}`. `get()` -> `{x, y, face, walk?}`: feet in world px, `face` `'left' \| 'right' \| 'up' \| 'down'` or an angle in radians. `set(pose)` writes back `{x, y, face, angle, moving, run, walk, frame, target}` every step the scene changes it, and once more at the end. `h`/`w` sprite size in world px (emote and box placement), `speed` px/s (default 60), `frames`/`stride` walk frames and px per frame (2, 6; give real walk cycles 4+ frames), `runStride` px per frame on moves with `run: true` (default stride x 1.6). Add later with `actor(id, spec)`. |
| `solid(x, y)`, `tile` | Optional: a move whose straight line is blocked is routed around solid tiles. |
| `dialogue` | Optional: your dialogue box. `open(name, text, done, actorId)` shows one line and calls `done()` when the player closes it; `isOpen()`; `close()` (used by skip). |
| `onStart(info)`, `onEnd(info)` | Lock and unlock your controls. `onEnd({id, skipped, calls, actors})` is called exactly once per scene. |
| `onCall(name, arg)` | Game-state changes the script asks for (open a gate, set a flag). Called once each, in play and in skip. |
| `onCue(name)` | Sound / rumble hooks. Not called when skipped. |
| `cssScale()` | CSS px per draw unit (`canvas.getBoundingClientRect().width / logicalWidth`): keeps the module's text >= 10 CSS px. |
| `auto()` | True under your autoplay: the module's own lines advance by themselves. |
| `params` | `bars` 0.09 (bar height / view height), `barMs` 450, `skip` `'hold'` (`'press'` twice, `'off'`), `holdMs` 700, `textSpeed` 42 chars/s, `lineHold` 900, `speed` 60, `stride` 6, `frames` 2, `returnMs` 650, `camMs` 900, `fadeMs` 400, `emoteMs` 1100, `render` `'auto'` (`'pixel'`, `'smooth'`), `snap` `'auto'` (round the camera to world px), `textSize` 15, `box` `'auto'` (`'bottom'`, `'top'`), `theme` `'night'` (`'parchment'`), `skipKey` `'X'`, `pageChars` 96, `compact` `'auto'` (views under 300 CSS px tall: bars <= 5.5 %, 2-line box, smaller plate, so the scene keeps >= 65 % of the height; `'on'`, `'off'`), `emotes` `'auto'` (`'pixel'`: pixel-art bubbles on the world's pixel grid even with a smooth UI, for pixel-art worlds), `pxFont` 1 (crisp text scale: stays on the game's pixel scale; a pixel game keeps it >= 10 CSS px through its canvas scale, >= 1.25 CSS px per canvas px). |

Script commands (an array; each runs to its end before the next; `{all: [a, b, [c, d]]}` runs branches together):

| command | |
|---|---|
| `{move: id, to: [x, y] \| {x, y} \| actorId, path: [[x, y], ...], by: [dx, dy], speed, run, face}` | Walk (or `run: true`: `pose.run`, frames by `runStride`) at a steady speed, facing the path, frames advancing with distance; ends exactly on the last point (then `face`, if given). |
| `{face: id, to: 'left' \| 'right' \| 'up' \| 'down' \| actorId \| [x, y]}` | Turn. |
| `{say: id, text, to: actorId, name}` | One line (long text pages itself). `to` turns the speaker toward the listener. Your `dialogue` if given, else the built-in box: typewriter, speaker plate, a tail toward the speaker, bottom unless that would cover a character. |
| `{wait: ms}` | |
| `{cam: actorId \| [x, y] \| {between: [a, b]} \| 'game', zoom, ms, follow, frame: [ids]}` | Glide (ease in-out) the camera centre; `ms: 0` cuts (pixel art: integer zoom, cut under a fade). The actors it frames (its actor target, both `between` actors, `frame` ids) are kept fully inside the view between the bars: the centre moves the least needed (on every view size). Always clamped to `world`. |
| `{fade: 'out' \| 'in' \| 0..1, ms, color}` | Full-screen fade under the bars. |
| `{emote: id, icon: '!' \| '?' \| '...' \| 'heart' \| 'note' \| 'anger' \| 'idea' \| 'sweat', ms, wait: false}` | A bubble over the actor's head. |
| `{call: name, arg}` / `{cue: name}` / `{bars: false}` | `onCall` / `onCue` / take the bars away early. |

| method | |
|---|---|
| `play(script, {id, once})` | Start a scene; false (refused) while another holds control, or when `once` and `id` already played. |
| `update(dtMs)` | Every fixed step, every scene, also in the `?t=` replay. |
| `locked()` | True while the scene holds control: pause your world and player input (not your dialogue box). |
| `camera()` | `{x, y, zoom, w, h}` while the scene drives the camera, else `null` (use yours). Translate by `-x, -y` (and scale by `zoom`) inside the stage. |
| `pose(id)` | The actor's pose while locked (or rely on `set`). |
| `input('ok')`, `input('skip', isDown)` | Next line / hold-to-skip. `ok` returns false while your own dialogue line is open: give it to your box. |
| `skip()`, `active()`, `cinematic()`, `bars()`, `waiting()`, `hostLine()` | `bars()` 0..1: fade your HUD with `1 - bars()`; `waiting()`: the built-in box waits for a confirm. |
| `draw(ctx)` | After the world and HUD, before your own dialogue box, in screen coordinates (outside camera transforms). Bars, built-in line box, emotes, skip hint, fades. Never changes state. Returns what it drew (`lastDrawn()`). |
| `state()`, `stats()`, `seen()`, `load(ids)`, `reset()`, `setParams(p)`, `rects()`, `lastEnd()` | `seen()` lists played ids (save it; `load` restores). `reset()` on new game. |

## Integration (15 lines)

```js
// <script src="scripted-cutscenes.js"></script> before your game script
const cs = GameDNA_Cutscenes.create({
  view: { x: 0, y: 0, w: VIEW_W, h: VIEW_H }, world: { x: 0, y: 0, w: MAP_W, h: MAP_H },
  camera: () => followCameraFor(player),              // your own follow rule, top-left in world px
  actors: { hero: { name: 'Ash', h: 32, get: () => ({ x: player.x, y: player.y, face: player.dir }),
                    set: p => { player.x = p.x; player.y = p.y; player.dir = p.face; player.walking = p.moving; player.animFrame = p.frame; } } },
  dialogue: { open: (name, text, done) => showDialog(name, [text], done), isOpen: () => dialogOpen, close: closeDialog },
  onCall: name => { if (name === 'openGate') gate.open = true; },
  cssScale: () => canvas.getBoundingClientRect().width / VIEW_W, auto: () => autoplay });
function onElderQuestAccepted() { /* existing code */ cs.play(GATE_SCENE, { id: 'gate', once: true }); }
function step(dt) { cs.update(dt); if (cs.locked()) { updateDialogOnly(); return; } /* existing update */ }
function render() { const c = cs.camera() || camera; drawWorld(c); drawHud(1 - cs.bars()); cs.draw(ctx); drawDialog(); }
// keys: Z -> if (!cs.input('ok')) your dialog; X down/up -> cs.input('skip', true/false) while cs.locked()
function newGame() { /* existing code */ cs.reset(); }
```

## Keep every other caller working

- `?auto=1`: call `update()` **first** in the step and decide from `locked()` after it, so no world frame runs while a scene holds control. While locked: the world waits, the autopilot gives no movement input (many autopilots also snap the player onto path tiles: that must not run either) and frame counters it times itself by (`frame % 20`) do not advance; it keeps closing your dialogue box (or the module's lines advance by `auto()`). The builder's trials needed all three for the same end state. Put actors back where the game expects them (a scene that walks the hero away should walk him back, or end where the game can continue): then the run ends exactly as before.
- `?t=<ms>&freeze=1`: `update()` in the same fixed step the fast-forward runs; the scene is a function of those steps.
- Restart / quit to title: `cs.reset()`. Save / load: `seen()` / `load()`.
- Never call `play` from a per-frame check that stays true without `once`; call it from the code that decides the event.

## Self-check without a browser

1. The module file is byte-identical and loads before `create`; `cs` exists before the first `update` / `draw`.
2. `get()` returns the feet in world px (not the sprite's top-left, not screen px); `set()` writes the same fields back the same way (worked example: a hero box at (100, 50) with feet at +5, +8 -> `get` gives (105, 58); `set({x: 145, y: 58})` -> box (140, 50)).
3. `camera()` and the world draw use the same top-left; `view` / `cssScale` are in logical canvas px.
4. Every script `call` name has a case in `onCall`; every `say` id is an actor (or `null` for a narrator).
5. `onEnd` unlocks exactly what `onStart` (or `locked()`) locked.

## What it guarantees (checks/core-check.js, checks/shoot.py)

- Moving actors face their path every frame (one heading per frame: a corner ends the frame's step); speakers with `to` face the listener.
- `frame = floor(walk / stride) % frames` while walking, 0 standing; `walk` grows by exactly the distance moved.
- Skip at any moment = play-through end state (positions, facings, calls); calls fire once; `onEnd` once per scene.
- The camera never shows outside `world`; text >= 10 CSS px; text never leaves its box or the view; the box never covers a character it knows (it moves to the top) and never jumps while shown.

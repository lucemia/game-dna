# Add camera director to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `camera-director.js` (one global, `GameDNA_Camera`), API reference `camera-director.README.md`

README example names are placeholders.

## Shared premises

1. **Include each module file verbatim; never edit it.** Load it with its own `<script src>` before the game's script, or paste it unchanged into its own `<script>` tag. If a module seems to need a change, adapt my game around it and tell me.
2. **Resolution:** keep my game's native resolution and integer scaling as they are. Call module draw functions on my 2D context inside the same transform as my sprites (one module pixel = one game pixel), and keep my game's own image-smoothing setting (off for pixel art, on for smooth or HD games; never switch it).
3. **Time:** drive every module from one fixed 60 Hz step (1000 / 60 ms). If my loop uses variable delta time, accumulate it and run whole steps (at most 250 ms per frame).
4. **Coordinates:** native screen pixels (world minus camera) unless a section says tiles.
5. **Art and names:** anything new you draw or name is original (no real game, character, place or brand names); English UI text; do not restyle my game.
6. **Hook, don't replace:** add calls or change bodies; never delete or rename a function.
7. **Keep every other caller working.** Find every caller and reader of what you change (turn order, input, moves, menus, HUD): autopilot/AI, test hooks, URL parameters such as `?auto=1`, `?t=` and `?freeze=1`, keyboard shortcuts, end-turn buttons. Update each one. My game's own autoplay must still finish a whole game. Keep existing HUD info (HP bars, max HP) and existing commands.

## Order of work

1. **Read the game first.** Write down (file, function) where these live: loop/update step; draw pass and its order (background, actors, effects, HUD); input; where damage/HP changes are applied; where turns, actions or selections are chosen and played; HUD windows and their rects; camera; battle/scene start and end; and every caller from premise 7.
2. **Check the prerequisites** below against those notes. If one is missing, add the smallest working version and tell me.
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Camera director [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Camera director:** a fixed update step that calls update(dt) once (also run by ?t= fast-forward and ?auto=1); the followed target per step in world px: position, optional velocity, on-ground flag (side view) and facing; the level size (bounds); optional rooms or arenas; the world drawing wrapped by apply/restore (translate-style) or reading cam.x / cam.y (subtract-style); drawing culled with visible(); optional: extra targets to frame (boss, second player); the places where HP/MP change (hit frame) (optional); a camera offset (optional); optional: HUD and label rects (uiRects, screen px) the target must never be framed under.

## Element 1: Camera director (`camera-director.js`, `GameDNA_Camera`)

Replaces the hard-follow camera with a directed one: a critically damped spring with a dead zone, eased look-ahead, vertical re-framing only on landing (side view), the hero and a boss kept in frame together (zoom out, or a lean when the game cannot zoom), zoom punches and trauma shake on big hits, clean level and room edges, and cuts on teleports. Sub-pixel on HD games, whole pixels on pixel games. View only: the game keeps its own camera for gameplay, so rules and autoplay endings never change.

**Parameters chosen:** `follow` = 1.8, `followY` = 1.4, `deadW` = 0.08, `deadH` = 0.12, `look` = 0.15, `lookHz` = 0.7, `idleLook` = 0.4, `platform` = auto, `farY` = 0.28, `biasY` = 0.06, `safe` = 0.8, `frame` = zoom, `minZoom` = 0.72, `minSize` = 0.1, `blend` = 0.9, `pad` = 0.1, `punch` = 0.06, `shake` = 3, `roll` = 1.2, `decay` = 1.6, `freq` = 14, `snap` = auto, `reduced` = system, `mode` = director. (`view`: not used; your game keeps its own.)

**Where it goes** (by role; find these places in my game):

1. *Before you change anything: every reader of the game's current camera variable (search its name):* List each one as DRAW (tile and sprite positions, draw culling, parallax, screen effects at world points, pointer -> world) or GAMEPLAY (spawn or wake "on screen", despawn, AI visibility, autoplay, test hooks, saves). Only DRAW readers change. The game keeps computing its own camera exactly as before; never assign the director's values to it.
2. *Once, when the level size is known:* `cam = GameDNA_Camera.create({view: {x: 0, y: 0, w: <world view width>, h: <height>}, bounds: {x: 0, y: 0, w: <level width>, h: <level height>}, seed: 1, uiRects: () => [<HUD panels and labels, screen px>], params: {view: <'side' for a side-view game (platformer, run and gun, gravity, jumping) or 'top' for a top-down game (moves in 4 or 8 directions, no gravity): decide from the game, not from this text>, follow: 1.8, followY: 1.4, deadW: 0.08, deadH: 0.12, look: 0.15, lookHz: 0.7, idleLook: 0.4, platform: 'auto', farY: 0.28, biasY: 0.06, safe: 0.8, frame: 'zoom', minZoom: 0.72, minSize: 0.1, blend: 0.9, pad: 0.1, punch: 0.06, shake: 3, roll: 1.2, decay: 1.6, freq: 14, snap: 'auto', reduced: 'system', mode: 'director'}})`. `view` is the screen rect the world is drawn into (logical px; below a HUD strip if the game has one). Add `zoom: false` if the world is drawn by subtracting the camera from each position and you will not wrap it. A level of another size: `cam.setBounds(...)`. Redrawing several times per step (pause screens, menus, high refresh rates) is fine: `apply` gives the same transform until the next `update`.
3. *Your fixed update step (the one `?t=` fast-forward and `?auto=1` also run), after movement and after the game's own camera update, on every scene that shows the world:* `cam.update(<step ms>, {target: {x, y, w, h, vx, vy, onGround, facing}, extra: <living boss (even off screen: it fades in by distance) or second player ? [{x, y, w, h}] : []>, legacy: {x: <old camera x>, y: <old camera y>}, room: <arena rect while it is shut, else null>})`: target = the hero's sprite centre and drawn size in WORLD px; `onGround` only for side-view games; `facing` 1 | -1.
4. *The world draw (DRAW readers):* Translate-style: replace the camera translate with `cam.apply(ctx)` and its restore with `cam.restore(ctx)`; draw in world coordinates. Subtract-style: read `cam.x` / `cam.y` where the old variable was read (optionally inside `cam.applyScreen(ctx)` ... `cam.restore(ctx)` for zoom and roll). Cull drawing with `cam.visible(<one tile>)`; parallax reads `cam.cx` / `cam.cy`; pointer -> world uses `cam.toWorld(sx, sy)`. HUD after `restore`.
5. *Big impacts:* Hits that matter: `cam.hit({strength: <'finisher' for killing blows, 'heavy' for strong hits and the player being hurt, 'light' for chip hits>, at: {x, y} <world px>})` once per accepted hit; slams and explosions: `cam.trauma(0.3-0.6)`.
6. *Teleports, respawns, doors, level starts, title -> play, restart:* `cam.cut(<target x>, <target y>)` (after a new run: `cam.clear()` first).

**Common mistakes** (symptom -> fix):

- Enemies wake or spawn at other times, autoplay ends differently -> the director was written into the game's camera or a gameplay reader was switched; switch only drawing.
- Tiles pop in at the edges when the view leads or zooms out -> drawing is still culled with the old camera or the view size; use `cam.visible(pad)`.
- The view drifts away from the hero -> `target` is in screen px; pass world px.
- The view slides across the level after a respawn or a door -> no `cut` there.
- `?t=` frames differ between runs, the view moves faster at high refresh rates -> `update` is in render or uses wall-clock time; call it once per fixed step.
- The backdrop slides against the world -> parallax still reads the old camera.
- Double, jerky shake -> the game's own shake still runs; route it to `cam.shake(px, ms)` or set one of the two to 0.
- Numbers, sparks or windows placed at a unit drift away from it -> another element was given screen positions from the old camera; use `cam.toScreen(x, y)`.
- The camera bobs on every jump -> `onGround` is not passed (platform snapping off).
- The hero walks to the screen edge after an arena opens -> the room is still passed; pass `room: null` once the exit opens.
- The hero is framed under a HUD panel -> `uiRects` not given; return the HUD and label rects in screen px.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Camera director] Running: more room ahead of the hero; turning round eases the view across instead of snapping.
- [Camera director] Jumping: no vertical bob; the view rises only after landing higher, and follows a long fall.
- [Camera director] A boss: hero and boss both in view; a finishing blow punches in toward the hit and shakes with a slight roll, settled within half a second; the HUD never moves.
- [Camera director] Level edges: the view stops cleanly with no jitter; `?auto=1` reaches the same ending at the same time as without the element.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `camera-director.js` sha256 `bacafd9cfa2b02fe...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Camera director] Every reader of the old camera is listed as DRAW (switched) or GAMEPLAY (unchanged); nothing assigns `cam` values into game state.
- [Camera director] `cam.update` runs once per fixed step with a WORLD-px target and `legacy`; `cut` runs at every teleport, respawn and level start.
- [Camera director] Walk one landing with the defaults: airborne, `cam.cy` holds; after landing 110 px higher it reaches 95 % in ~33 frames, with no overshoot.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

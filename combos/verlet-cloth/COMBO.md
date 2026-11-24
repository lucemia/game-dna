# Add verlet rope & cloth to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `verlet-cloth.js` (one global, `GameDNA_Cloth`), API reference `verlet-cloth.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Verlet rope & cloth [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Verlet rope & cloth:** a fixed update step that calls update(dt) once per step after movement (also run by ?t= fast-forward and ?auto=1); for each attached piece an anchor: world position (shoulders, neck, head, pole top, beam) and facing of the actor or post, or null while hidden; a draw slot between ground and units; the places where HP/MP change (hit frame) (optional).

## Element 1: Verlet rope & cloth (`verlet-cloth.js`, `GameDNA_Cloth`)

Capes, scarves, ribbons, hair tufts, banners, hanging ropes and chains that swing with movement and wind: a small Verlet solver pinned to an anchor on an actor or a post, with gravity, damping, gusts from game time and a ground line, drawn smooth and shaded on HD games and in whole pixels with a 1 px outline on pixel games. It only reads anchors and only draws: positions, hit boxes and rules never change, so autoplay ends exactly as before. A teleporting anchor (respawn, restart) re-poses its cloth hanging at rest instead of stretching it across the screen.

**Parameters chosen:** `wind` = 0.5, `gust` = 0.5, `stiffness` = 0.8, `segments` = 8, `damping` = 0.03, `gravity` = 1, `drape` = 0.5, `shade` = 1, `outline` = auto, `snap` = auto, `reduced` = system, `view` = auto.

**Where it goes** (by role; find these places in my game):

1. *Once, after the game state exists (before the first draw):* `cloth = GameDNA_Cloth.create({params: {wind: 0.5, gust: 0.5, stiffness: 0.8, segments: 8, damping: 0.03, gravity: 1, drape: 0.5, shade: 1, outline: 'auto', snap: 'auto', reduced: 'system', view: 'auto'}, scale: <view height> / 360, camera: () => ({x: <camera x>, y: <camera y>})})`. Leave `camera` out when the world is drawn inside a camera transform (then world coordinates = draw coordinates).
2. *Attach 2-5 pieces that suit the art (same place):* The player: `cloth.attach('player-cape', {kind: 'cape', group: 'player', length: <~0.6 of the sprite height>, width: <~0.8 of its width>, color, trim, anchor: () => <player exists and is shown> ? {x: <shoulder centre, world px>, y: <shoulder y>, facing: <1 | -1>} : null})` (or `kind: 'scarf'` at the neck, `'hair'` at the back of the head). Scenery: `kind: 'banner'` on a post (anchor = the post top, `facing` = the side it flies to; draw the post yourself), `'rope'` or `'chain'` from a beam. Top-down game: return `fx, fy` (the unit facing vector) from every actor anchor, which switches that piece to top-down physics; no `ground`. Side view: return only `facing`; a `ground` is the floor under the actor (its feet y), never the screen bottom. Small pixel sprites: 2-3 px wide pieces. If actors are rebuilt on restart, look them up by id inside the anchor function.
3. *The fixed update step (the one `?t=` fast-forward and `?auto=1` also run), after movement:* `cloth.update(<step ms>)` once per step, on every scene that draws cloth (title, play, menus over the world).
4. *Each actor's draw (inside the same `globalAlpha` its hurt blink uses):* `cloth.draw(ctx, 'back', <group>)` right before the sprite (capes, hair), `cloth.draw(ctx, 'front', <group>)` right after it (scarves). Always pass the group: no group draws every piece. Sprites without an id (title previews) draw no cloth.
5. *The scenery pass (where posts, beams and props are drawn):* `cloth.draw(ctx, 'back', 'props')` (or each post's own group in a depth-sorted draw). If the game already draws a fixed cape, banner or rope, skip that old drawing with a condition while the cloth runs; keep its code.
6. *Swing, dash or blow start (optional, one line):* `cloth.impulse(<group>, -<facing> * 200, -40)`; a big event (explosion, boss roar): `cloth.gust(2, 900, <dir>)`.

**Common mistakes** (symptom -> fix):

- A line or sheet stretched across the screen after a respawn -> the anchor is a stale copy instead of a function, or `teleport` was set huge; anchors are functions, leave `teleport` at 0 (auto).
- Cloth slides away from its actor while the camera scrolls -> the anchor is in screen coordinates while `camera` is also passed (or the reverse); anchors are world px, pass `camera` only when the game subtracts the camera by hand.
- Every cape in the level appears on one actor -> `draw(ctx, 'back')` without a group; pass the actor's group, skip id-less preview sprites.
- Enemy ribbons stay where the enemies stood at the start of a new game -> the anchor closure keeps the old actor object; look the actor up by id inside the function.
- Cloth freezes, moves faster at high refresh rates, or `?t=` frames differ between runs -> `update` sits in the render loop or is skipped on some scene; call it once per fixed step.
- Half-pixel blur on a pixel game -> `snap` is `smooth` or smoothing is on for that canvas; leave `auto` with `imageSmoothingEnabled = false`.
- A top-down cape covers the face when walking toward the camera -> return `layer: fy < -0.3 ? 'front' : 'back'` from the anchor (or attach with `layer: 'auto'`).
- The old fixed cape still shows under the new one -> skip the old drawing with a condition while the cloth runs.
- A top-down cape or scarf sticks out stiffly sideways or upward -> the anchor returns no `fx, fy`, so the piece uses side-view physics (lift, motion air); return the facing vector.
- The cape is held at the bottom of the screen while the hero falls into a pit -> `ground` was the screen bottom; pass the floor under the actor or leave `ground` out.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Verlet rope & cloth] Standing: the cape hangs and stirs in the wind; banners fly with folds; ropes and chains sway.
- [Verlet rope & cloth] Running: the cape trails behind the actor; after a turn it is on the new back (never flipped over the head); a swing whips it.
- [Verlet rope & cloth] Respawn or restart: the cloth is at the new position at once, with no line or sheet across the screen.
- [Verlet rope & cloth] Pixel game: whole pixels with a 1 px outline; HD game: smooth shaded cloth. HUD and windows are drawn over all cloth.
- [Verlet rope & cloth] `?auto=1` reaches the same ending at the same time as without the element.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `verlet-cloth.js` sha256 `5acf7537bac3a780...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Verlet rope & cloth] `cloth.update` runs once per fixed step, after movement, inside the step; no game logic reads `points()`, `list()` or `lastDrawn()`.
- [Verlet rope & cloth] Every anchor returns world px of something that exists, or `null`; none falls back to 0 or the screen centre.
- [Verlet rope & cloth] Every actor `draw` call passes a group; capes / hair before the sprite, scarves after it.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

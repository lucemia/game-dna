# Add a grappling hook and rope swing to my game

Defaults: `{{range}}` = 120, `{{hookSpeed}}` = 720, `{{reelSpeed}}` = 70, `{{swingForce}}` = 240, `{{releaseBoost}}` = 1.1, `{{carryMs}}` = 1100, `{{mode}}` = hold, `{{wrap}}` = 1, `{{surfaces}}` = 1.

Add a grappling hook to my side-view platformer: fire a hook at rings or any rock surface, hang on a rope, swing, pump with left / right, reel in and out, let go keeping the momentum; the rope bends around corners. Use the attached `grapple-swing.js` (global `GameDNA_Grapple`) **verbatim** (`<script src>` before the game script, or pasted unchanged). Read its README; do not rewrite it.

## How it fits

The module never moves the hero: while the hero hangs on the rope it returns the velocity the swing needs, and the game moves the hero **with its own collision code, unchanged** (each step stays under half a tile).

1. **Create once**, after the level exists: `GameDNA_Grapple.create({solid, tile, velUnit, gravity, anchors, scale, bounds, drawRings: false, params})`. `solid(x, y)` = the game's wall test in **world** px; `velUnit` `'step'` if velocity is px per fixed step (`'second'` if px/s); `gravity` = the game's own, same units; `scale` = view height / 180. Place 3-6 rings `{id, x, y}` (world px) over pits and gaps.
2. **Every fixed step, at the start of the hero's movement code**: `const r = grapple.update(stepMs, input, hero)` with `hero = {x, y, w, h, vx, vy, onGround, facing}` and `input = {fire, hold, jump, push, reel}`: fire = grapple key pressed this step, hold = held, jump = jump pressed this step, push = -1/0/1 from left/right, reel = -1 in / 1 out. Use a free key (e.g. C); if Up/Down are taken, reel with two other free keys.
3. **If `r.active`**: set vx, vy to `r.vx, r.vy` and skip the game's own run acceleration, jump, jump-cut and gravity this step. **Else** run them as before; if `r.flying`, set vx to `r.vx` after the air control and skip the variable-jump cut, so the released momentum survives. Then the game's own movement and collision run unchanged.
4. **Draw** in the hero's camera space: `grapple.drawRings(ctx, camX, camY)` before the hero, `grapple.draw(ctx, camX, camY, hero)` next to it (`0, 0` inside a camera `translate`).
5. **Reset**: `grapple.reset()` wherever a run starts, the hero respawns or loses a life.

## Keep everything else working

Find every caller of the hero update: autoplay (`?auto=1`), `?t=` fast-forward, title and end screens, restarts. The module is inert until the grapple key is pressed, so autoplay must end exactly as before. Do not delete or rename existing helpers, keys or touch zones.

## Self-check without a browser

- Every load-time identifier exists; every touched call site re-read.
- `update` runs once per fixed step (also during `?t=` fast-forward), never in draw.
- With `r.active` and `r.flying` false the hero code is the old path.
- Example: gravity 0.25 px/step, let go at the bottom of a swing with vx 2.4: the next steps keep vx ~2.6 for {{carryMs}} ms instead of decaying.
- `solid`, rings and hero are world px; only draw gets the camera.

## Acceptance checks

- A ring: the hook flies, bites; the hero swings, pumps, reels.
- Fire at rock: it bites; the rope bends around a corner and unbends.
- Let go: the hero flies on with the swing's speed; jump on the rope lets go with a hop.
- The hero never passes through walls; the rope never crosses rock; drawing follows the camera.
- `?auto=1` ends as before; `?t=5000&freeze=1` is identical every load; no console errors.

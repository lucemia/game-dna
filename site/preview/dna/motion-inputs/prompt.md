# Add Motion-input special moves to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `motion-inputs.js` (one global, `GameDNA_MotionInputs`), API reference `motion-inputs.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Motion-input special moves [input].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Motion-input special moves:** a fixed update step that reads the device input (left, right, up, down, the attack button fields) and the hero's facing, also run by ?t= fast-forward; mi.step(input) before the game uses it, {fire:false} under an autopilot; the game's own attack code for each special (projectile, rising hitbox, dash...) started from onSpecial(move, info); canAct() false while the hero cannot start one; the player's sprite box in view units every step (avoid) and the HUD / window rects (uiRects); render: draw(ctx) last, in view units; reset() where a new run starts.

## Element 1: Motion-input special moves (`motion-inputs.js`, `GameDNA_MotionInputs`)

Fighting-game special moves: reads the stick and buttons every fixed step into an input buffer and recognises motions relative to the hero's facing (236 quarter circle, 623, [4]6 charge, 360), with leniency windows and a busy buffer; a recognised special calls the game's own attack and consumes the button. An input display in the game's style (arrows, button coins, hold counts, a callout naming the special or TOO SLOW, an optional mirrored move list) stays readable on phones and clear of the hero and HUD.

**Parameters chosen:** `stepWindow` = 12, `pressWindow` = 8, `gap` = 4, `motionWindow` = 30, `chargeFrames` = 40, `buffer` = 12, `shortcuts` = on, `leniency` = on, `turnWithInput` = on, `display` = on, `callout` = on, `moveList` = off, `rows` = 7, `side` = left, `render` = auto, `theme` = ember.

**Where it goes** (by role; find these places in my game):

1. *Once, before the first fixed step:* `mi = GameDNA_MotionInputs.create({buttons: {A: '<the attack field of the input object>'}, moves: ['623A Rising Slash', '236A Ember Shot', '[4]6A Dash Strike'], params: {turnWithInput: 'on'}, view: {w: VIEW_W, h: VIEW_H}, canvas, onSpecial: m => startSpecial(m.id), canAct: () => <hero free to attack>, avoid: () => [<hero box, camera applied, view units>], uiRects: () => [<HUD and window boxes>]})`.
2. *Input read:* Add `up` / `down` to the input object if the game never read them (keep every existing key and touch zone).
3. *The fixed step, after reading the device and before the game uses it (also in ?t= fast-forward):* `raw.facing = hero.facing; const inp = playing ? mi.step(raw, {fire: !autopilot}) : raw;` and use `inp`; the autopilot keeps its own input.
4. *The hero's attack code:* `startSpecial(id)`: one branch per move id with the game's own damage rules (a projectile, a rising hitbox, a dash hitbox) and a visible effect; return `false` while the hero cannot start it.
5. *Render, last while playing:* `mi.draw(ctx)` in the HUD's units.
6. *New run / restart:* `mi.reset()`.

**Common mistakes** (symptom -> fix):

- Nothing fires -> the input object has no up / down, or `buttons` names a field the input does not have.
- Back motions fire the wrong way in a platformer -> `turnWithInput: 'on'` (the hero turns with the push before the game turns him).
- A special also swings the normal attack -> the game uses its raw input instead of the value `step()` returned.
- `?auto=1` ends differently -> the autopilot's input went through `step()` with specials on: `{fire: false}`.
- A rolled 360 jumps instead -> the game jumps on up: keep its jump start open while `mi.jumpHold() > 0`.
- The display covers the hero -> `avoid()` in world coordinates (camera not applied) or empty.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Motion-input special moves] Down, down-forward, forward + attack fires the 236 special with its effect and the callout names it; facing the other way, the mirrored motion fires it too.
- [Motion-input special moves] Walking, jumping and plain attacks never fire a special; `?auto=1` ends as before; the display is readable at 390 px and never over the hero or HUD.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `motion-inputs.js` sha256 `e7f724cfa4a8c6bf...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Motion-input special moves] `step` once per fixed step with `left right up down facing` and the button field; never in draw.
- [Motion-input special moves] `startSpecial` handles every move id; `reset()` on every restart path.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

# Add big banner text to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `big-banner.js` (one global, `GameDNA_BigBanner`), API reference `big-banner.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Big banner text [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Big banner text:** phase / wave / stage / result transitions in update logic (call show once per moment); a fixed 60 Hz update step; the play field size in native px, HUD excluded; rectangles of UI to keep clear (optional).

## Element 1: Big banner text (`big-banner.js`, `GameDNA_BigBanner`)

Phase, wave and result moments get a big chunky banner ("PLAYER PHASE", "WAVE 2", "STAGE CLEAR", "VICTORY") over a translucent full-width band: in, hold, out in about 1.4 s, coloured per kind (phase, enemy, clear, defeat, warn, info). Banners queue so two never overlap; result banners can stay until the player continues; `busy()` tells the game whether input should wait.

**Parameters chosen:** `enter` = slide, `exit` = wipe, `enterMs` = 260, `holdMs` = 900, `exitMs` = 260, `stagger` = 35, `size` = 2, `band` = 0.72, `position` = center, `block` = on, `queue` = queue, `glint` = on.

**Where it goes** (by role; find these places in my game):

1. *Once, after the screen size and HUD layout exist:* `banner = GameDNA_BigBanner.create({bounds, getObstacles, params: {enter: 'slide', exit: 'wipe', enterMs: 260, holdMs: 900, exitMs: 260, size: 2, band: 0.72, position: 'center', block: 'on', queue: 'queue'}})`. `bounds` = play field `{x, y, w, h}` with the HUD excluded; `getObstacles()` returns HUD windows, menus and captions as rects WITHOUT `id` (never covered).
2. *Every place in update logic where a phase, turn, wave, round, stage, victory or defeat starts (grep the state assignments):* Once per moment: `banner.show(text, {kind, sub})`, kind `phase` (player), `enemy`, `info` (wave/round), `warn`, `clear` (stage clear, victory), `defeat`. Results that wait for a key: `hold: 0` (sticky) with the game's own "press" hint as `sub`. Prefer the game's own words ("YOUR PHASE", its result lines). Never call it from the draw pass.
3. *Your fixed update step (the one the animation loop, the `?t=&freeze=1` fast-forward and autoplay all call):* `banner.update(1000 / 60)` (or your step length in ms).
4. *Your draw pass:* `banner.draw(ctx)` last, after the HUD, outside any shake translate. Remove the call that drew the game's old text for these moments; keep the helper.
5. *New game / restart:* `banner.clear()` first, before the new game's first `show()`. On continue from a sticky result on the same screen: `banner.dismiss()`.

**Common mistakes** (symptom -> fix):

- The banner restarts or flickers -> `show()` runs every frame or from the draw pass; call it once at the state change.
- No banner in `?t=&freeze=1` shots -> `update()` runs only in the animation loop; put it in the shared fixed step.
- Old text and the banner both visible -> remove the old draw call for these moments.
- Banner over the HUD or a menu -> `bounds` ends above the HUD; menus and captions come from `getObstacles()` without `id`.
- Game stuck on the result screen -> never gate the continue/restart key on `busy()`; results use `hold: 0` (busy is false while a sticky banner holds).
- Autoplay ends differently from before -> phase lengths or autoplay timing changed; keep them, and gate on `busy()` (optional) only where player input and autoplay both pass.
- After restart the old result banner is still up -> `clear()` at the start of the new game.
- The game already has a `banner` function or variable -> name the instance differently (e.g. `bigBanner`); never rename the host's.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Big banner text] Each phase/wave start shows one big banner across the field, clear of the HUD: in, hold, out; two moments at once play one after the other.
- [Big banner text] Victory/defeat banners stay until the player continues; continue and restart work with the same keys as before.
- [Big banner text] `?t=<ms>&freeze=1` gives the same banner frame every time; `?auto=1` ends with the same result as before and no console errors.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `big-banner.js` sha256 `e09b745ef46efab4...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Big banner text] Grep `show(`: all in update logic at state changes, none in draw code. Grep `update(`: inside the fixed step the freeze loop also calls.
- [Big banner text] Walk one phase change and one restart: `show` -> `update` steps -> gone after enter + hold + exit; restart -> `clear()` -> first banner.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

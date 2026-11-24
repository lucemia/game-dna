# Add draining hp bar to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `draining-hp-bar.js` (one global, `GameDNA_DrainingHpBar`), API reference `draining-hp-bar.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Draining HP bar [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Draining HP bar:** a fixed 60 Hz update step; a stable id per unit for its whole life; the places that create or refill units (new game, battle, wave, respawn) to snap without animation; a camera offset.

## Element 1: Draining HP bar (`draining-hp-bar.js`, `GameDNA_DrainingHpBar`)

A hit drops the fill at once while a pale loss segment holds where the health was, then drains; quick hits merge into one segment (hold restarts, capped), a heal shows a mint gain segment before the fill rises, low HP pulses. Draws a framed boss bar, party HUD bars and small over-head bars in world space, smooth on HD and crisp on native pixel canvases. It watches the HP the game already keeps.

**Parameters chosen:** `hold` = 450, `holdCap` = 1600, `drain` = 0.7, `ease` = smooth, `gainHold` = 240, `fill` = 0.9, `low` = 0.25, `pulse` = on, `flash` = on, `shake` = 2, `theme` = auto, `ticks` = 0, `render` = auto.

**Where it goes** (by role; find these places in my game):

1. *Once at startup, before anything can call it (also before a ?t= fast-forward loop):* `hpBars = GameDNA_DrainingHpBar.create({params: {hold: 450, holdCap: 1600, drain: 0.7, ease: 'smooth', gainHold: 240, low: 0.25, theme: 'auto', render: 'auto'}})`.
2. *Your fixed update step, every scene (title, play, menus, end screens), after the game logic of that step:* For every unit that shows an HP bar: `hpBars.set(id, hp, maxHp)` with a stable per-unit id; then `hpBars.update(stepMs)`. Do not hook the damage code: the module sees drops and rises itself.
3. *Where units are created or refilled: new game, new battle or wave, respawn, restart, load:* `hpBars.reset(id, hp, maxHp)` (no animation). A new unit that reuses an old id must be reset.
4. *Where the game draws each HP bar now (keep its HP text, names, frames, MP bars; replace only the bar's background and fill rects):* `hpBars.draw(ctx, id, x, y, w, h, opts)` at the same inner rect: boss `{style: 'boss', label: name}`, player / party HUD `{style: 'party', team: 'ally'}`, over-head bars inside the camera transform `{style: 'unit', team: 'foe'}` (they hide when full).

**Common mistakes** (symptom -> fix):

- The pale segment never drains -> `update()` is not called every step (or only in one scene).
- Every hit drains from full, or bars swap between units -> ids are array indexes that shift when a unit dies; use a stable id.
- A new wave fills up with a heal animation -> `reset` missing where the wave starts.
- No loss segment at all -> `reset` is called every step instead of `set`.
- A killing blow shows no loss segment -> the unit (and its bar) stops being drawn when it dies; keep `set` + `draw` for its id while `hpBars.busy(id)` is true.
- Over-head bars stay put while the camera scrolls -> they are drawn after the camera transform is undone.
- Two bars drawn on top of each other -> the game's own fill rect is still drawn.
- `?auto=1` ends differently -> game logic reads the module (e.g. `shown(id)`); bars must only read.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Draining HP bar] A hit: the fill drops at once, a pale segment holds and drains; three quick hits show one merged segment.
- [Draining HP bar] A heal: a mint segment appears before the fill rises; low HP pulses, 0 HP does not.
- [Draining HP bar] Over-head bars follow their unit while the camera moves; `?auto=1` ends exactly like before.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `draining-hp-bar.js` sha256 `1e54616bf3b62045...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Draining HP bar] Every drawn id gets `set` every step with a stable id; `reset` at new game / wave / respawn.
- [Draining HP bar] `update` runs every fixed step in every scene; `draw` replaces only the old fill and background rects, in the same coordinate space.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

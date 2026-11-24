# Add Save & load slots to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `save-slots.js` (one global, `GameDNA_SaveSlots`), API reference `save-slots.README.md`

README example names are placeholders.

## Where it goes in my game (my choice; follow it exactly)

- **Save & load slots:** Open the slot screen exactly at: the S key while exploring opens save / load; the L key on the title screen opens load. Nothing else opens it (never the autopilot).

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Save & load slots [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Save & load slots:** a fixed 60 Hz update step; deserialize(data): writes it back, rebuilding references from ids; where the screen opens (the `opens` parameter, named by the designer), in update logic; keys routed to the screen while busy() (key(code, down), press(), tap()); a fixed update step (update(stepMs)), also while busy, with the world paused; boot() once after setup, before the first step and any ?t= fast-forward; optional: summary() {place, level, time, note}, canSave(), migrate(), the canvas and thumbRect for thumbnails, the autoplay flag, autosave checkpoints.

## Element 1: Save & load slots (`save-slots.js`, `GameDNA_SaveSlots`)

A save/load screen: 3 slots plus an autosave slot, each with a thumbnail point-sampled from the game's own canvas, place, level and play time; save / load / delete with confirm, a data version with a `migrate` hook, a checksum (a corrupted slot reads "DAMAGED DATA"), and save codes to copy and paste. The game writes `serialize()` / `deserialize(data)`; the module never guesses its state. Storage is a namespaced `localStorage` key, every call guarded, in memory when blocked. While it is open (`busy()`) keys go to the screen and the world waits. A load must continue exactly as from the save.

**Open the slot screen exactly at: the S key while exploring opens save / load; the L key on the title screen opens load. Nothing else opens it (never the autopilot).**

**Parameters chosen:** `slots` = 3, `autosave` = on, `thumb` = on, `thumbW` = 40, `confirm` = on, `codes` = on, `closeAfterSave` = on, `dim` = 0.45.

**Where it goes** (by role; find these places in my game):

1. *First, a list of the state: every variable the fixed step reads or writes:* Scene/phase, positions, timers, counters, the frame counter, the RNG state (add a getter/setter if it hides in a closure), AI/autopilot memory, camera. Mark state that holds functions (dialog or animation callbacks) and object references (store those as ids). Game state only: never the autoplay flag, freeze, debug or `?t` (session flags); a load keeps the current session's flags and drops queued autopilot moves when autoplay is off.
2. *Once, after the canvas exists:* `saves = GameDNA_SaveSlots.create({key: '<short-unique-game-name>', version: 1, view: {w, h}, canvas: () => { <render>; return <canvas>; }, thumbRect: <play field without the HUD>, autoplay: () => <autoplay flag>, params: {slots: 3, autosave: 'on', thumb: 'on', thumbW: 40, confirm: 'on', codes: 'on', closeAfterSave: 'on', dim: 0.45}, serialize, deserialize, summary: () => ({place, level, time: <play seconds>, note}), canSave: () => <false where state holds callbacks or an action is half-done>})`.
3. *Key handlers (keydown, keyup, pointer):* First line of keydown: `if (saves.busy()) { if (saves.key(e.code, true)) e.preventDefault(); return; }`; keyup: `saves.key(e.code, false)`; pointer while busy: `saves.tap(x, y)` in native px, then return. Remember the open key's press edge for the next step (ignore `e.repeat`).
4. *Top of your fixed update step (the one the animation loop, the `?t=&freeze=1` fast-forward and autoplay all call):* `if (saves.busy()) { saves.update(1000 / 60); return; }` so the world and the frame counter wait. Then, at the S key while exploring opens save / load; the L key on the title screen opens load (human input only): `saves.open('both')` in play or `saves.open('load')` on a title, and return. Otherwise `saves.update(1000 / 60)` once per step; `saves.autosave()` at checkpoints (room entered, fight won, quest step), at the end of the step; if `canSave()` is false then (a dialog is open), it is queued and written at the next safe step.
5. *Your draw pass:* `saves.draw(ctx)` last, after the HUD and the other overlays.
6. *Boot and restart:* `saves.boot()` once after the game is set up, before the first step and before any `?t=` fast-forward loop (it handles `?loadSlot=`); `saves.clear()` at new game / restart.

**Common mistakes** (symptom -> fix):

- A load continues differently from the save (other rolls, enemies elsewhere) -> part of the state is not saved: RNG state, frame counter, autopilot memory, timers. Test `?auto=1&saveAt=6000&saveSlot=1`, then `?auto=1&loadSlot=1`: it must end like `?auto=1`, same frame.
- Console: "serialize() differs ... at <path>" after a load -> `deserialize` ignores that field; write it back.
- "cycles" / JSON errors on save -> `serialize` returned live objects; store ids and rebuild references.
- The game breaks after loading a save made mid-fight or mid-dialog -> that state holds callbacks: `canSave()` false there.
- A slot saved under `?auto=1` turns the AI on when a person loads it -> the autoplay flag was serialized; save game state only and keep the session's flags on load.
- The checkpoint autosave is missing -> it was asked for while `canSave()` was false and the game discarded the result; let it queue (call it anyway) or call it at a safe step.
- The world (or the play time) keeps running behind the screen -> gate the whole fixed step on `busy()`.
- The open key also acts in the game or moves the cursor -> open on the press edge in update logic; return from the key handler while busy.
- `?t=&freeze=1` frames changed -> nothing may read storage at load except `boot()` with `?loadSlot`; never auto-load the last save.
- Black or stale thumbnails -> pass `canvas` as a function that renders first; `thumbRect` in native px.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Save & load slots] the S key while exploring opens save / load; the L key on the title screen opens load opens the screen and nothing else does; arrows + Z save to a slot (thumbnail, place, play time), X backs out; a load puts the game back exactly and play continues; delete asks first.
- [Save & load slots] A slot edited by hand reads "DAMAGED DATA" and nothing breaks; with storage blocked the screen says "THIS SESSION ONLY" and saving still works for the session.
- [Save & load slots] `?t=<ms>&freeze=1` frames unchanged; `?auto=1` ends as before; `?auto=1&saveAt=6000&saveSlot=1` then `?auto=1&loadSlot=1` ends the same (same frame); no console errors.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `save-slots.js` sha256 `7ef3a30977ec14b7...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Save & load slots] Every variable on your state list appears in both `serialize` and `deserialize` (RNG state and frame counter included); references are ids.
- [Save & load slots] Walk one save -> change -> load by hand: every listed value is back to its saved value. Save under `?auto=1`, load without it: the player has control.
- [Save & load slots] Grep `open(`: only at the opening moment, from human input; `update(` every step including while busy; `boot()` before the fast-forward loop; `draw(` last.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.

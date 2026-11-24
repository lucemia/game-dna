# Add save & load slots to my game

**Required:** `{{opens}}` = where the slot screen opens (e.g. "the S key while exploring; L on the title loads").
Defaults:
`{{slots}}` = 3 · `{{autosave}}` = on · `{{thumb}}` = on · `{{thumbW}}` = 40 · `{{confirm}}` = on · `{{codes}}` = on · `{{closeAfterSave}}` = on · `{{dim}}` = 0.45

---

You are given `save-slots.js`, a finished module, and its `README.md`. **Include it verbatim** (`<script src>` before the game script, or pasted unchanged). It owns storage, checksums and the slot screen; **you** write `serialize()` / `deserialize()`. Add code; never remove or rename host functions.

**First, read my game** and list: every variable the fixed step reads or writes (scene, positions, timers, counters, frame counter, RNG state, autopilot memory, camera); state holding functions or references; the fixed step and its loops (animation, `?t=&freeze=1`, autoplay); keys; draw pass; restart.

**Integration points**

1. **Load** the module before the game script.
2. **Create one instance** after the canvas exists:
```js
const saves = GameDNA_SaveSlots.create({
  key: '<short-unique-game-name>', version: 1, view: { w: <screen w>, h: <screen h> }, canvas: <canvas>,
  thumbRect: { x, y, w, h } /* play field without the HUD */, autoplay: () => <autoplay flag>,
  params: { slots: {{slots}}, autosave: '{{autosave}}', thumb: '{{thumb}}', thumbW: {{thumbW}}, confirm: '{{confirm}}', codes: '{{codes}}', closeAfterSave: '{{closeAfterSave}}', dim: {{dim}} },
  serialize: () => ({ /* each listed variable as plain data; references as ids */ }),
  deserialize: data => { /* write each back; rebuild references */ },
  summary: () => ({ place: <area name>, level: <number or text>, time: <play seconds>, note: <short text> }),
  canSave: () => <false where state holds functions or an action is half-done>
});
```
3. **Keys**: keydown starts `if (saves.busy()) { if (saves.key(e.code, true)) e.preventDefault(); return; }`; keyup `saves.key(e.code, false)`; pointer `saves.tap(x, y)` (native px) while busy.
4. **Fixed step**: first line `if (saves.busy()) { saves.update(<step ms>); return; }` (world and frame counter wait). At {{opens}}: `saves.open('both')` in play, `saves.open('load')` on a title (update logic, key press edge). Otherwise `saves.update(<step ms>)` at the end of the step. Optionally `saves.autosave()` at checkpoints (if `canSave()` is false then, it waits for the next safe step).
5. **Draw**: `saves.draw(ctx)` last.
6. **Boot / reset**: `saves.boot()` once after setup, before the first step and any `?t=` fast-forward; `saves.clear()` at restart.

**The state must round-trip.** A load continues exactly as from the save: an `?auto=1` run saved midway, reloaded with `?loadSlot=1`, reaches the same end (same frame). If the RNG hides its state, add a getter/setter. The module warns "serialize() differs … at <path>" if something is missed.

**Game state only:** never save session/URL flags (autoplay, freeze, debug, `?t`); a load keeps this session's flags, and drops queued autopilot moves when autoplay is off.

**Self-check without a browser**
- Module verbatim, loaded first; `boot()` before the fast-forward loop.
- Each variable on your list appears in both `serialize` and `deserialize` (RNG and frame counter included).
- Walk one save → change → load: every value back. Save under `?auto=1`, load without it: the player has control.
- `update(` every step, also while busy, when nothing else advances.
- `open(` only at {{opens}}, never from the autopilot (pass `autoplay`); the opening key does nothing else.

**Acceptance checks**
1. {{opens}} opens the screen; arrows + Z save (thumbnail, place, time), X backs out; load restores and play continues; delete asks first.
2. A hand-edited slot reads "DAMAGED DATA"; blocked storage shows "THIS SESSION ONLY"; nothing breaks.
3. `?t=<ms>&freeze=1` frames unchanged; `?auto=1` ends as before; `?auto=1&saveAt=6000&saveSlot=1`, then `?auto=1&loadSlot=1`, ends the same; no console errors.

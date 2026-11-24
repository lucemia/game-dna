// Basket hint for I-04 save-slots: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'ui',
  lead: 'Open the slot screen exactly at: {{opens}}. Nothing else opens it (never the autopilot).',
  does: 'A save/load screen: {{slots}} slots plus an autosave slot, each with a thumbnail point-sampled from the game\'s own canvas, place, level and play time; save / load / delete with confirm, a data version with a `migrate` hook, a checksum (a corrupted slot reads "DAMAGED DATA"), and save codes to copy and paste. The game writes `serialize()` / `deserialize(data)`; the module never guesses its state. Storage is a namespaced `localStorage` key, every call guarded, in memory when blocked. While it is open (`busy()`) keys go to the screen and the world waits. A load must continue exactly as from the save.',
  params: {
    opens: 'where the slot screen opens (shown at the top)',
    slots: 'create `params.slots`', autosave: 'create `params.autosave` (the AUTOSAVE row and `autosave()`)', thumb: 'create `params.thumb`', thumbW: 'create `params.thumbW`',
    confirm: 'create `params.confirm`', codes: 'create `params.codes`', closeAfterSave: 'create `params.closeAfterSave`', dim: 'create `params.dim`'
  },
  steps: [
    ['First, a list of the state: every variable the fixed step reads or writes',
      'Scene/phase, positions, timers, counters, the frame counter, the RNG state (add a getter/setter if it hides in a closure), AI/autopilot memory, camera. Mark state that holds functions (dialog or animation callbacks) and object references (store those as ids). Game state only: never the autoplay flag, freeze, debug or `?t` (session flags); a load keeps the current session\'s flags and drops queued autopilot moves when autoplay is off.'],
    ['Once, after the canvas exists',
      '`saves = GameDNA_SaveSlots.create({key: \'<short-unique-game-name>\', version: 1, view: {w, h}, canvas: () => { <render>; return <canvas>; }, thumbRect: <play field without the HUD>, autoplay: () => <autoplay flag>, params: {slots: {{slots}}, autosave: \'{{autosave}}\', thumb: \'{{thumb}}\', thumbW: {{thumbW}}, confirm: \'{{confirm}}\', codes: \'{{codes}}\', closeAfterSave: \'{{closeAfterSave}}\', dim: {{dim}}}, serialize, deserialize, summary: () => ({place, level, time: <play seconds>, note}), canSave: () => <false where state holds callbacks or an action is half-done>})`.'],
    ['Key handlers (keydown, keyup, pointer)',
      'First line of keydown: `if (saves.busy()) { if (saves.key(e.code, true)) e.preventDefault(); return; }`; keyup: `saves.key(e.code, false)`; pointer while busy: `saves.tap(x, y)` in native px, then return. Remember the open key\'s press edge for the next step (ignore `e.repeat`).'],
    ['Top of your fixed update step (the one the animation loop, the `?t=&freeze=1` fast-forward and autoplay all call)',
      '`if (saves.busy()) { saves.update(1000 / 60); return; }` so the world and the frame counter wait. Then, at {{opens}} (human input only): `saves.open(\'both\')` in play or `saves.open(\'load\')` on a title, and return. Otherwise `saves.update(1000 / 60)` once per step; `saves.autosave()` at checkpoints (room entered, fight won, quest step), at the end of the step; if `canSave()` is false then (a dialog is open), it is queued and written at the next safe step.'],
    ['Your draw pass', '`saves.draw(ctx)` last, after the HUD and the other overlays.'],
    ['Boot and restart', '`saves.boot()` once after the game is set up, before the first step and before any `?t=` fast-forward loop (it handles `?loadSlot=`); `saves.clear()` at new game / restart.']
  ],
  gotchas: [
    'A load continues differently from the save (other rolls, enemies elsewhere) -> part of the state is not saved: RNG state, frame counter, autopilot memory, timers. Test `?auto=1&saveAt=6000&saveSlot=1`, then `?auto=1&loadSlot=1`: it must end like `?auto=1`, same frame.',
    'Console: "serialize() differs ... at <path>" after a load -> `deserialize` ignores that field; write it back.',
    '"cycles" / JSON errors on save -> `serialize` returned live objects; store ids and rebuild references.',
    'The game breaks after loading a save made mid-fight or mid-dialog -> that state holds callbacks: `canSave()` false there.',
    'A slot saved under `?auto=1` turns the AI on when a person loads it -> the autoplay flag was serialized; save game state only and keep the session\'s flags on load.',
    'The checkpoint autosave is missing -> it was asked for while `canSave()` was false and the game discarded the result; let it queue (call it anyway) or call it at a safe step.',
    'The world (or the play time) keeps running behind the screen -> gate the whole fixed step on `busy()`.',
    'The open key also acts in the game or moves the cursor -> open on the press edge in update logic; return from the key handler while busy.',
    '`?t=&freeze=1` frames changed -> nothing may read storage at load except `boot()` with `?loadSlot`; never auto-load the last save.',
    'Black or stale thumbnails -> pass `canvas` as a function that renders first; `thumbRect` in native px.'
  ],
  checks: [
    '{{opens}} opens the screen and nothing else does; arrows + Z save to a slot (thumbnail, place, play time), X backs out; a load puts the game back exactly and play continues; delete asks first.',
    'A slot edited by hand reads "DAMAGED DATA" and nothing breaks; with storage blocked the screen says "THIS SESSION ONLY" and saving still works for the session.',
    '`?t=<ms>&freeze=1` frames unchanged; `?auto=1` ends as before; `?auto=1&saveAt=6000&saveSlot=1` then `?auto=1&loadSlot=1` ends the same (same frame); no console errors.'
  ],
  selfcheck: [
    'Every variable on your state list appears in both `serialize` and `deserialize` (RNG state and frame counter included); references are ids.',
    'Walk one save -> change -> load by hand: every listed value is back to its saved value. Save under `?auto=1`, load without it: the player has control.',
    'Grep `open(`: only at the opening moment, from human input; `update(` every step including while busy; `boot()` before the fast-forward loop; `draw(` last.'
  ],
  offers: {
    'ui-rects': { title: 'slot screen', text: '`saves.rect()` is the open panel, or null; other overlays should not draw over it (it is modal: the world is paused).' }
  }
};

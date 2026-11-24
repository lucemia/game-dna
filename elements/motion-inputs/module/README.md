# motion-inputs.js (A-07 module, v1.0.4)

One plain script, no dependencies, no `import`/`export`, ASCII only. It defines one global, `GameDNA_MotionInputs`. Load it with `<script src>` before your game script, or paste it unchanged.

**Special moves from stick motions.** Once per fixed step you hand the module the player's directions, buttons and the hero's facing. It keeps a short input buffer and recognises motions written in numpad notation **relative to the way the hero faces** (6 = forward, 4 = back, 2 = down, 8 = up):

| notation | motion | |
|---|---|---|
| `236A` | down, down-forward, forward + A | quarter circle forward |
| `214A` | down, down-back, back + A | quarter circle back |
| `623A` | forward, down, down-forward + A | forward-down-diagonal (also accepts the shortcut 3-2-3) |
| `41236A` | half circle back to forward + A | any direction string works |
| `[4]6A` | hold back about 0.7 s, then forward + A | charge (`[2]8A`: hold down, then up) |
| `360A` | a full turn of the stick + A | |
| `66` | forward, release, forward | double tap, no button |

When a move is recognised the module calls `onSpecial(move, info)`: **your game starts its own attack** (the module never moves the hero). The button press that triggered it comes back consumed, so your normal attack does not also start. If the hero is busy (`canAct()` false or `onSpecial` returns `false`) the special waits in a busy buffer (`buffer` steps) and fires as soon as the game can act (`info.buffered`).

It also draws an **input display**: a column of the last inputs (arrow, buttons, how many steps each was held, the motion rows lit gold when a special fires), a **callout** naming the special with its arrows (or TOO SLOW when the shape was there but too slow), and an optional **move list** whose arrows mirror when the hero turns. Pixel views (<= 270 px tall) get a 5x7 pixel font and pixel arrows at whole-pixel scale; taller views get smooth vector chips. Text is scaled until it is at least 10 CSS px on the page (phones). The column stays out of `uiRects()` (your HUD) and away from `avoid()` (the player): it shrinks, fades to the other side or hides, and never jumps.

## Leniency (all in fixed steps, 60 per second)

| param | default | meaning |
|---|---|---|
| `stepWindow` | 12 | a middle direction must be entered at most this long before the next one |
| `gap` | 4 | steps of other input allowed between two directions (a stick passing through neutral) |
| `pressWindow` | 8 | the button may come this long after the last direction was let go |
| `motionWindow` | 30 | from the end of the first direction to the last direction |
| `shortcuts` | `'on'` | 623 from 3-2-3; a motion's last direction may be a neighbouring diagonal (236 ending on 9 or 3) |
| `chargeFrames` / `chargeKeep` | 40 / 10 | steps to hold a charge; steps it stays charged after letting go |
| `buffer` | 12 | busy buffer: steps a recognised special waits for `canAct()` |
| `history` | 45 | steps of input kept (the input buffer) |
| `leniency` | `'on'` | `'off'` = gap 0, pressWindow 0, no shortcuts (frame-tight input) |
| `facingAt` | `'press'` | read the motion with the facing at the button press (`'step'`: per step) |
| `turnWithInput` | `'off'` | `'on'` for games whose hero turns to whichever side the player pushes (platformers): a held left / right counts as the facing even before your game has turned the hero |

When two moves match, the one with the higher priority wins (360 > 623 > longer motions > 236 / 214 > charge > taps), except that a move whose last direction is the one held at the press beats one that is not: walking forward into 236 + A is the 236 move, not 623.

`jumpHold` (45): the cap for `jumpHold()`, counted from the up press. `rollGap` (7): steps between two directions of a roll. `rollNeutral` (4): steps of neutral inside a roll (keys handed over with a small gap) that keep it alive. `history` is 60 steps.

Display params: `display` (`'on'`/`'off'`), `callout`, `moveList` (`'off'`/`'on'`, also `showMoveList()`), `rows` (7), `side` (`'left'`/`'right'`), `frames` (hold counts), `render` (`'auto'`/`'pixel'`/`'smooth'`), `hudScale` (`'auto'` or 1-4), `theme` (`'ember'`, `'steel'`, `'jade'`), `fade` (5 steps; 0 = instant).

## API

`GameDNA_MotionInputs.create(options)` returns an instance.

| option | meaning |
|---|---|
| `buttons` | `{A: 'attack'}`: notation letter -> the field of your input object that is true while that button is held (or true on the step it is pressed). `{A: {key: 'attack', keys: ['pad0'], color: '#e8553a'}}` for more fields or a colour. |
| `moves` | `['236A Fire Bolt', '623A Rising Cut', '[4]6A Rush']` or `[{notation, name, id, priority}]`. The id defaults to the name in kebab case (`fire-bolt`). |
| `onSpecial(move, info)` | Start the attack in your game. `move = {id, name, notation, ...}`, `info = {facing, buffered, step}`. Return `false` if it cannot start now (it is retried while the busy buffer lasts). |
| `canAct()` | Optional: `false` while the hero cannot start a special (mid-attack, hurt, in a menu). |
| `view` | `{w, h}`: the logical size your draw code uses. |
| `canvas` | Your canvas element (to measure its CSS size for phone-readable text). |
| `avoid()` | Rects to keep clear, in view units, every step: at least the player's sprite box (with the camera applied). |
| `uiRects()` | Your HUD and window rects in view units. |
| `facing()` | Optional, if the input object has no `facing`. |
| `params` | See the tables above. |

| method | |
|---|---|
| `step(input, {fire})` -> input | **Once per fixed step, after reading the device and before your game uses it.** `input = {left, right, up, down, facing: 1 or -1 ('right' / 'left'), <button fields>}`. Returns a copy: the special's button set to false; during `drive()` the scripted directions and buttons. Use the returned value. `{fire: false}` = listen only (record and display, never call `onSpecial`): use it while an autopilot plays. |
| `draw(ctx)` | Last in your render, in view units (same transform as your HUD). |
| `reset()` | Where a new run or round starts. |
| `jumpHold()` -> n | **Games that jump on up and register a 360** (or a motion through up): while the jump start is pending, keep it open as long as `jumpHold()` > 0; it is non-zero only while the stick is rolling around the ring (each new direction one or two notches on, at most `rollGap` steps (7, ~115 ms) after the previous one), or a charge / motion string toward up is under way; at most `jumpHold` steps (45) from the up press; a special clears it; 0 for a plain jump, so normal jumps stay as quick as before. A special that fires cancels the jump. |
| `drive(notation)` | Script a motion on the next steps (relative to the current facing): tests, demos, judges. `frames(notation, facing)` returns the frames. |
| `moves()`, `setMoves(list)`, `glyphs(id, facing)` | The move list; glyphs = arrows / buttons drawn for a facing (mirrored for facing left). |
| `showMoveList(on)`, `setParams(p)`, `params()` | |
| `fired()`, `lastFired()`, `pending()`, `rows()`, `history(n)`, `charge()`, `layout()`, `lastDrawn()`, `stats()` | State for tests: `stats()` has `fired` per id, `buffered`, `dropped`, `near` (too-slow attempts), `noFacing`, `coverAvoid`, `coverUi`, `minTextCss`, errors. |
| `GameDNA_MotionInputs.pad(index, {A: [0], B: [1]})` | Read a gamepad (d-pad or left stick, 8-way, dead zone 0.5) as `{left, right, up, down, A, B, pad}`. |
| `GameDNA_MotionInputs.merge(a, b)` | OR two inputs (keyboard + pad). |
| `GameDNA_MotionInputs.run(options, frames)` | Feed a list of frames to a fresh instance (tests). |

## Integration (generic)

```js
const mi = GameDNA_MotionInputs.create({
  buttons: { A: 'attack' },
  moves: ['623A Rising Cut', '236A Fire Bolt', '[4]6A Rush'],
  params: { turnWithInput: 'on' },                 // hero turns with left / right (most platformers)
  view: { w: VIEW_W, h: VIEW_H }, canvas,
  onSpecial: move => startSpecial(move.id),        // your attack code: projectile, rising hitbox, dash
  canAct: () => hero.attackTimer === 0 && !hero.hurt,
  avoid: () => [{ x: hero.x - cam.x, y: hero.y - cam.y, w: hero.w, h: hero.h }],
  uiRects: () => HUD_RECTS
});
function fixedStep() {
  const raw = readInput();                         // must include up / down
  raw.facing = hero.facing;                        // 1 = right, -1 = left
  const inp = playing ? mi.step(raw, { fire: !autopilot }) : raw;
  update(autopilot ? autopilotInput() : inp);
}
// render: ... world ... HUD ...  then  mi.draw(ctx);   new run: mi.reset();
```

Keep every caller working: `?t=` fast-forward goes through the same fixed step; an autopilot run must end exactly as before (`fire: false`); title, menus and restart unchanged.

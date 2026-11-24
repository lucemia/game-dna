# GameDNA_Cutout (L-10 Layered cutout characters, module v1.2.5)

`cutout-characters.js` is one plain script (no imports) that defines one global, `GameDNA_Cutout`. It draws HD 2D
characters that were painted once as separate cut-out parts (head, torso, pelvis, upper / lower arms, thighs, shins,
feet, weapon, shield, cape, coat skirt) and moves them with a small bone rig in code: 2-bone IK keeps the feet
planted, keyframed poses give a breathing idle, a real walk cycle, an overhead attack and a forward slash (anticipation -> strike -> recover), a hurt recoil,
guard, cheer, cast, a jump pose and a fall; the cape and coat skirt follow on a spring. Paste it verbatim or load it
with `<script src>`; do not rewrite it.

## Intended use

Swap a game's code-drawn or placeholder characters for painted ones without drawing frames: side-view action
games, platformers, turn-based and tactics battles shown in side view, dialogue scenes with full-body sprites. The
character art is HD (painted, not pixel art); in a pixel-art game it will look out of place. Game logic, hit boxes
and timings never change: the character follows the game's state.

## Files

| file | what |
|---|---|
| `cutout-characters.js` | the module (global `GameDNA_Cutout`) |
| `pack.js` | the pack as a script (`window.GameDNA_CutoutPack`), works from `file://`; `pack.json` is the same data |
| `chars/<id>.webp` | one atlas per character (all its parts) |

Shipped characters (all original): `sword` (young swordswoman, teal cloak; the buckler is on the far arm, held out
front at chest height and tucked behind the hip during a strike), `spear` (young spear fighter, green half-cape,
bronze scales; two-handed spear: the near hand is the rear grip at the hip, the far hand the lead grip ahead on the
shaft, the point carried up in the ready stance), `mage` (silver-haired mage in a plum coat, driftwood staff held out
in the far hand, open near hand lower). Motion sets: `sword`, `spear`, `mage` (a new character picks one with `role`).

## API

| call | returns | notes |
|---|---|---|
| `GameDNA_Cutout.load(pack, {base, onReady})` | library | `pack` = `window.GameDNA_CutoutPack` (or the parsed `pack.json`); `base` = path prefix of `chars/`. Loads each atlas once; a failed atlas only makes that character's `draw` return `false`. |
| `lib.onReady(fn)` | lib | `fn(lib)` once every atlas has loaded or failed. Move the game's boot here. |
| `lib.has(id)` / `lib.ids()` / `lib.status()` | | `status() = {ready, loaded, failed}` |
| `lib.actor(id, {h})` | actor | One per on-screen character, created once (not per frame). |
| `actor.update(dt, {vx, h, facing})` | actor | In the fixed step, every step. `dt` ms; `vx` the character's speed in your units per second (cape trails behind it); `h` drawn height in the same units; `facing` 1 / -1. |
| `actor.loop('idle' \| 'walk' \| 'cheer', {speed})` | actor | The looping state the actor returns to after one-shots. |
| `actor.play(name, {dur, onHit})` | actor | One-shot `attack`, `slash`, `cast`, `hurt`, `guard`, `down` on the module's own clock; `dur` stretches it to your attack length; `onHit(actor)` fires at the strike frame (inside `update`). |
| `actor.pose(name, k)` | actor | Host-driven: the animation at progress `k` 0..1 from YOUR timer (e.g. `swingFrame / swingFrames`). Call in the fixed step. `pose(null)` returns to the loop. Changes blend over 140 ms. |
| `actor.draw(ctx, x, footY, o)` | bool | Feet centre at `(x, footY)` in the current transform. `o = {h, facing, flash: 0..1 \| 'auto', alpha, light: 'left' \| 'right' \| 'auto' \| null, rim, shade, shadow, shadowAlpha, swoosh: true \| 'r,g,b'}`. `flash: 'auto'` = a crisp flash for the first 130 ms of `hurt` (0.75 for 3 frames, then gone); `swoosh` draws a smooth tapered arc during the strike phase only (slash k 0.16-0.36, overhead attack 0.29-0.5): the blade's directions over the last 80 ms of drawn poses, pivoted on the hand where it is now, so it hugs the blade and never reaches past it; thrusts get none. Returns `false` (draws nothing) when the art is not loaded: keep your old drawing then. Never throws. |
| `actor.point('tip' \| 'hand' \| 'head' \| 'chest', x, footY, {h, facing})` | `{x, y}` | Where that point is drawn now (hit sparks, projectiles, speech bubbles). |
| `actor.reset()`, `actor.info()`, `actor.busy()`, `actor.hurtFlash()` | | `info() = {anim, loop, k, busy, clock, cape, dur}` |
| `lib.walkSpeed(id)` | heights / s | Ground speed of the walk cycle at speed 1: `loop('walk', {speed: \|vx\| / (lib.walkSpeed(id) * h)})` keeps planted feet still. |
| `lib.drawHead(ctx, id, cx, cy, r, {facing})` | bool | The character's painted head for portraits and turn-order chips (face at `(cx, cy)`, ~2.3 r tall). |
| `lib.flashCurve(ms)` | 0..1 | The crisp hit-flash curve, for hosts with their own hurt timer. |
| `lib.drawPose(ctx, id, x, footY, o)` | bool | Stateless: `o.anim` + `o.k`, or `o.pose` (`idle, ready, dash, strike, cast, guard, hurt, cheer, walk`) + `o.k`, `o.t` seconds for breathing, `o.fall` 0..1; plus the `draw` options. For hosts that already compute a pose per frame. |
| `lib.stats` | | `{draws, mipBuilds, layerAllocs}` |

Animations: `idle` (loop, breathing), `walk` (loop; each foot planted for half the cycle and moving back linearly), `attack` (overhead; strike at k 0.34-0.45), `slash` (sword: forward slash for side-view action; the tip is 0.63-0.70 h ahead of the feet at 0.34-0.51 h height from k 0.22 to 0.45; spear and mage: same as `attack`), `cast` (mage: staff raised, then swung forward crystal-up; `actor.point('tip')` = the crystal), `hurt`,
`guard`, `cheer` (loop), `jump` (k 0 rising .. 1 falling), `down` (fall to the ground; stays down).

## How the parts stay joined (v1.2.0 - v1.2.2)

- Every sleeve's joint stub is cut away in the pack and the upper arm is drawn above the forearm, so the forearm comes
  out of the sleeve hem; no rounded stump shows at an elbow. Knee knobs sit under the thigh.
- The far arm always shows where it goes: either the forearm is visible out in front of the body, or the whole arm is
  behind the body. The shield is drawn behind the legs and body (it is on the far side), in front of its forearm.
- A two-handed weapon: `grip` < 0 puts the other hand ahead of the weapon hand on the shaft (spear: 0.1-0.2 h ahead).
- The sword's overhead wind-up swings up over the back, so the arm does not cross the face.
- v1.2.1: the torso carries no second shoulder plate or sleeve (cut away in the pack); `down` ends in a real lying
  pose resting on the ground line; `jump` has a tucked rise (k 0) and a stretched fall (k 1); walks swing the arms;
  the rim light is thinner (1.4 % h, strength 0.42).
- v1.2.2: a cut may not leave a hole inside a piece's own silhouette (`joins` notch check); the spear fighter's torso
  keeps its painted arm opening; smoother cut contour on the swordswoman's cloak; wider arm swing for mage and spear.
- v1.2.3: the hurt flash over-exposes the body instead of washing it towards one flat colour (a colour-dodge pass on
  a copy of the character's layer, cut back to the silhouette): line work and deep shadows stay, the body is fully
  opaque at every flash value, and a still frame no longer reads as a see-through figure. API and timing unchanged.
- v1.2.5: `update(0)` (a paused host, or a first frame with dt 0) is a no-op. Before, a zero step divided by zero in
  the cape / skirt spring and the cloth was drawn as a slab beside the character until `reset()`. No other change;
  every pose and every pixel with dt > 0 is the same as v1.2.4.
- v1.2.4: optional `collar` part (a piece of the torso that the pack copies out with `"over"` and the rig draws again
  above the head, so the neck tucks INTO the collar / cloak instead of lying on it); it follows the torso. The sample
  pack's heads now sit on the collar line: the swordswoman's head pivot was below her neck (long neck standing on the
  painted neck stub) and the mage's head, which carries its own collar, sat 45 sheet px above the coat's collar. Packs
  without a `collar` part draw as before. `checks/run-checks.py` `neck` checks where the head sits on the body.
- `checks/run-checks.py` renders every animation sample at 2x with a per-part ID buffer and fails on a floating part,
  an item that is not held, or a visible joint stub (see `checks/rigcheck.html`, `joins`).

## How it draws (and what it costs)

Each actor composes its parts on its own offscreen layer at device resolution (from `ctx.getTransform()`), from an
atlas mip level halved to the drawn size (built once), then applies the hurt flash, a light ramp (faint warm wash on the lit side, deeper violet-brown shade on the far
side) and a warm rim, full at the lit edge and fading inward (half-resolution light layer, composited once with `source-atop`, never on your
canvas), and blits the layer on whole device pixels. A soft contact shadow is drawn under the feet. Only the box the
character covers is cleared and composited; no per-frame allocation besides one `getTransform()` matrix.

Measured in headless Chromium (software raster, median of 80 frames, 3 characters, `checks/checks.json`): 300 px
characters on a 390 px phone at dpr 3 (366 device px tall) 2.6 ms; 1280 px at dpr 2, 800 device px tall: 11.9 ms
with the key light, 4.6 ms with `light: null`; 320 device px tall: 2.1 ms. A swoosh re-solves the rig ~16 times,
during a strike only.

## Determinism

The pose is a pure function of what `update`, `play`, `loop` and `pose` set (or of `drawPose`'s arguments): `draw`
reads state and never changes it, so `?t=<ms>&freeze=1` stills equal play, and `?auto=1` runs are unchanged (the
module never touches game state). Load the art before the game's first step (`lib.onReady(boot)`), or a frozen
frame may show the old drawing. On `file://` everything works (no pixel reads at runtime).

## Integration example (generic)

```js
<script src="cutout-characters.js"></script><script src="pack.js"></script>
<script>
const CUT = GameDNA_Cutout.load(window.GameDNA_CutoutPack, { base: '' });
const HERO_H = 52;                                   // drawn height: the old sprite's height (a bit above its hit box)
const heroArt = CUT.actor('sword', { h: HERO_H });
function syncArt(p) {                                // in the fixed step, after the game updates the player
  if (p.hurtTimer > 0) heroArt.pose('hurt', 1 - p.hurtTimer / HURT_FRAMES);
  else if (p.attackTimer > 0) heroArt.pose('slash', p.attackTimer / ATTACK_FRAMES);
  else if (!p.onGround) heroArt.pose('jump', p.vy < 0 ? 0.2 : 0.8);
  else { heroArt.pose(null); heroArt.loop(Math.abs(p.vx) > 0.3 ? 'walk' : 'idle', { speed: Math.abs(p.vx * 60) / (CUT.walkSpeed('sword') * HERO_H) }); }
  heroArt.update(1000 / 60, { vx: p.vx * 60, h: HERO_H, facing: p.facing });
}
function drawPlayer(p) {                             // where the old sprite was drawn, same transform
  if (!heroArt.draw(ctx, p.x + p.w / 2, p.y + p.h, { h: HERO_H, facing: p.facing, flash: 'auto', swoosh: true })) drawOldPlayer(p);
}
CUT.onReady(boot);                                   // boot = the game's old start code, unchanged
```

## Self-check without a browser

- `GameDNA_Cutout.load` and every `actor(...)` run once at load time; `update` / `pose` / `play` only in the fixed step.
- Every former draw site of the replaced character calls `draw` inside `if (!...)` with the old drawing as fallback;
  the old weapon / body is not drawn on top.
- The boot (first step, `?t=` fast-forward, first animation frame) runs once, from `onReady`.
- Restart / new game calls `actor.reset()`.
- On the attack's hit frames the blade is inside the game's hit box (side view: `slash`; compare a `?t=` still with the original).

# damage-pop.js (C-11 module, v1.1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_DamagePop`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns everything about the numbers: the arc, the crit pop and shake, merging rapid hits into a rolling total, type colours and procedural icons, the font raster (smooth on HD canvases, crisp 1-bit on native pixel canvases), placement (avoiding units, UI rects and other numbers) and drawing. Your game keeps its own state and tells the module where things are.

It replaces E-01 `damage-numbers.js` (same `create` options, same `spawn(id, amount, kind)` kinds): use one or the other, never both.

## API

`GameDNA_DamagePop.create(options)` returns an instance.

| option | meaning |
|---|---|
| `bounds` | Play field `{x, y, w, h}` in your game's logical (native) pixels, or a function returning it. Keep it above the HUD. Without it the module uses the canvas size it last drew on. |
| `getAnchor(id)` | `{x, top, w, h}`: sprite centre x, top of the sprite (include hover, and an HP bar or name plate drawn above the head), sprite size. **Keep returning it while the unit is dying or dead**; the module also caches the last anchor per id. If a unit dashes away to attack, return its home spot. |
| `getObstacles()` | Array of rects `{x, y, w, h}`. Sprites carry an `id`: never covered, and the column above another unit's head stays clear. Rects without `id` (banner, windows, HUD) are never covered. `soft: true` (a torch) is avoided when there is room. HP bars drawn above or below a unit: add them as extra rects with that unit's `id`. |
| `params` | See the table below. |
| `onHitStop(ms)` | Called on damage hits (`hitstop`, ×2 for crits). Freeze your world that long, or ignore it. |
| `onShake(px, ms)`, `onFlash(alpha, ms)` | Called for criticals. Shake the field / flash it, or ignore them. |
| `skin` | Optional `GameDNA_Skin` id or object (`skins/skin-api.js`). A pixel skin selects the crisp raster, a smooth skin's canvas number font is used, `palette: 'skin'` takes colours from the skin's `fx.*` / `text.*` tokens. Without the option the module draws its own look, even when skin-api is loaded (it does not fall back to pixel16). |
| `debug(info)` | Optional: each placement (`path`: free, crit-column, small, newest-wins, own-spot, fold) and the events `fold`, `move`, `requeue`, `retire`, `skip`, `drop`. |

| param | default | range | meaning |
|---|---|---|---|
| `size` | 0 (auto) | 0–24 | Cap height of a normal number in native px. Auto = bounds width / 34, at least 9 (9 at 256 px wide, 19 at 640). Crits ×1.45, words ×0.64. |
| `duration` | 1100 | 600–2400 ms | Life after the last add (crits ×1.15). |
| `arc` | 1 | 0–2 | Height and sideways reach of the launch arc (×size). 0 = pop in place. |
| `punch` | 0.6 | 0–1.2 | Scale overshoot: crit peak 1 + punch, normal 1 + 0.4·punch, merge bump 1 + 0.45·punch. |
| `merge` | 600 | 0–1500 ms | Hits of the same type on the same target within this time of the last add join one rolling total. 0 = off. |
| `palette` | vivid | vivid, soft, mono, skin | Colours. |
| `icons` | on | on, off | Small type icon left of the number (not for physical). Off: mana shows `12 MP`. |
| `hitstop` | 50 | 0–120 ms | Requested on damage hits, ×2 for crits. |
| `crit` | burst | burst, flash, plain | burst = overshoot + rays + shake; flash = no shake; plain = size and colour only. |
| `render` | auto | auto, smooth, crisp | auto: crisp when drawing 1:1 on a canvas ≤ 512 px wide (native pixel games), smooth otherwise (HD or devicePixelRatio-scaled). |
| `stack` | on | on, off | Avoidance and stacking. |

| method | |
|---|---|
| `spawn(targetId, amount, kind, opts?)` | Call on the frame the hit lands, after the HP change, with the HP **actually lost or gained after clamping**. `kind`: `damage`, `crit`, `heal` (with `{type: 'mana'}` a mana restore, shown `+15` in blue), `shield` (absorbed), `mp` (mana lost), `miss`, `block`, `dodge`, `immune`, `resist`, `parry`, `status` (`amount` = the word, e.g. `'SLOW'`), or a type name (`'fire'`). `opts.type`: `physical`, `fire`, `ice`, `shock`, `poison`, `arcane`, `heal`, `shield`, `mana`; `opts.crit: true`; `opts.anchor` gives the spot directly. Returns the number's id. |
| `update(dtMs)` | World time. `0` while the world is frozen. All motion depends only on this clock. |
| `draw(ctx, offsetX = 0, offsetY = 0)` | After sprites and effects, before banner and HUD, inside your camera/shake transform. Any canvas transform is fine (HD backing stores are detected). |
| `setParams(obj)`, `clear()`, `count()`, `rects()`, `lastDrawn()`, `time()` | `clear()` at battle/wave start (numbers spawned since the last `update` survive). `rects()` = occupied rects of live numbers (for other overlays). `lastDrawn()` = one rect per drawn number `{pop, target, text, x, y, w, h, crit, type, adds}`. |

## Integration (15 lines)

```js
// <script src="damage-pop.js"></script> before your game script
const dp = GameDNA_DamagePop.create({
  bounds: { x: 0, y: 0, w: FIELD_W, h: FIELD_H },                       // field above the HUD, logical px
  getAnchor: id => { const u = unitById(id); return u && { x: u.x, top: u.y - u.height, w: u.width, h: u.height }; },   // dead units too
  getObstacles: () => units.filter(u => u.alive).map(u => ({ x: u.x - u.width / 2, y: u.y - u.height, w: u.width, h: u.height, id: u.id })).concat(hudRects),
  onHitStop: ms => { freeze = Math.max(freeze, ms); }
});
function applyDamage(target, amount, type, crit) {      // your existing hit function: keep its body, add one line
  const before = target.hp; /* ... existing HP code ... */
  dp.spawn(target.id, before - target.hp, crit ? 'crit' : 'damage', { type });   // the real drop after clamping
}
function step(dt) { if (freeze > 0) { freeze -= dt; dp.update(0); return; } /* world */ dp.update(dt); }
function render() { /* ground, sprites, effects */ dp.draw(ctx); /* banner, HUD */ }
// battle / wave / level START: dp.clear();
```

Call `dp.draw` once per frame and never clip, proxy or filter what it draws: placement already avoids every rect from `getObstacles`, and a number you cut away is an HP change the player never sees. Spawn `miss` only for an attack aimed at a unit (not a swing at nothing), and skip heals of 0. HP changes made while a banner or window covers the targets (a wave refill under the WAVE banner) read best when spawned as the banner ends; the module itself holds such a number up to 900 ms of world time, then shows it at its unit.

In a scrolling game return anchors and obstacles in **screen** pixels (world minus camera) and `bounds` as the visible field. Call `dp.draw(ctx)` where screen coordinates apply (after you undo the camera translate); inside a `translate(-camX, -camY)` call `dp.draw(ctx, camX, camY)` instead.

## What it guarantees

- A number appears on its hit frame, above its target (only a young number of the same target may delay it, max 900 ms). Killing-blow numbers stay above the dead unit (anchor cache).
- Rapid hits of one type on one target become one total that rolls up and punches on each add; different types and crits get their own numbers.
- Big numbers are drawn above small ones; a crit takes the clear column above its target and moves smaller numbers out of it.
- Numbers never touch each other, a rect without `id`, another unit's sprite or the column above its head, and are never nearer to another unit than to their own. With no free spot, a number shrinks, then sits at its target's own spot (it may cover its own sprite, never a neighbour's). Numbers are re-checked every frame and move when a unit walks onto them, or when a window, banner or HUD rect appears over them (or the camera carries them under one); with nowhere close to go they hide (or end, when already read).
- A number on screen never jumps: when it has to move it glides there (120–220 ms), or, when that way would cross another number or a window, it re-pops at the new slot (quick fade and scale-in). A hidden number comes back only after it has kept its new spot for 3 updates, so nothing flashes for a single frame. Numbers spawned while a modal window pauses the world wait until it closes.
- The arc and the fade float never rise through the target's own HP bar or another rect above; a number that would climb more than ~2.5 × size above its unit (over a message box) goes beside the unit or onto its own sprite instead.
- Deterministic: same `update` calls, same pixels. No `Math.random`, no wall clock, no network fonts (system sans stack).
- Never throws from `spawn`, `update` or `draw`; bad callbacks and missing anchors are tolerated (one console warning, no number at the field centre).
- Cost: about 0.08 ms per frame (`update` + `draw`) with 14 live numbers on the demo's 640×360 field at a 1740 px backing store (headless Chromium, 2026-11-16). Rasters are built once per text, size and colour and cached (500 entries).

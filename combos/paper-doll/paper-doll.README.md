# paper-doll.js (GameDNA_PaperDoll v1.1.0)

A layered pixel character with swappable parts and palette tints, plus a small dressing window. One classic script, no
dependencies, ASCII only, one global `GameDNA_PaperDoll`. Include it verbatim (`<script src="paper-doll.js">` before the game
script, or pasted unchanged into a `<script>` tag).

Slots: `body` (skin tone), `hair`, `hat`, `top`, `bottom`, `boots`, `weapon` (right hand), `shield` (left hand). Every part
is painted on ONE shared rig (the anchor table: head, torso, hip, legs, both hands, per direction and frame), so any
combination lines up in every frame: 4 directions x (stand, 4-frame walk, 3-frame attack, jump). The character is about
22 px tall (+ hats) in a 40 x 40 frame; it stands on the line you give (`feetY` = its lowest drawn row, the outline under
the boots). Side art faces right natively; the left view is painted, not mirrored: the weapon stays in the RIGHT hand,
which is the far hand when facing left (drawn behind the body), and the shield in the LEFT hand. Never flip the doll
with `scale(-1, 1)`: pass `dir: 'left'`.

**Size.** The doll is about 22 px from boots to crown (31 with the tall pointed hat), about 1.4x a 16 px sprite: it suits
16 px tile worlds as a hero who stands over one and a half tiles. Scale by whole numbers only (`scale: 2`, `3`), never by
fractions or a CSS-smoothed canvas. The game keeps its own hitbox and its own feet line: the doll is drawn at the feet you
pass (`feetX` = the box centre, `feetY` = the bottom of the old sprite's feet) and never changes collision.

## API

| call | what |
|---|---|
| `PD.create({look, params, onChange})` | a doll. `look` = `{slot: 'style/tint'}` (missing slots get defaults, unknown values are ignored); `params.stride` = px walked per walk frame (default 5); `params.sparkleMs` (520, 0 = off), `params.shadow` (true) |
| `doll.draw(ctx, feetX, feetY, o)` | draws at native canvas px. `o.dir`: `'down' 'up' 'left' 'right'` (or `1` / `-1`, or radians); `o.moving` + `o.walk` (distance walked, px) or `o.frame` (0-3); `o.attack` (progress 0..1, `null` when not attacking) or `o.attackFrame` (0-2); `o.air` (jump pose; `o.shadowY` = floor row for its shadow); `o.scale` (whole number); `o.alpha`; `o.shadow: false`. Returns `{x, y, dir, pose, i, rect, hand: {R, L}}` (canvas px) |
| `doll.equip(slot, style, tint)` | change one part (`tint` optional); `true` when it changed. Fires `onChange(look, slot)` and a short sparkle |
| `doll.setLook(look)` / `doll.look()` | whole outfit in / out (`{slot: 'style/tint'}`, save this) |
| `doll.update(dtMs)` | the sparkle clock: call in the fixed step (also in a `?t=` fast-forward) |
| `doll.rect(x, y, o)` / `doll.lastDrawn()` | drawn box for a pose / the last draw's record (hands for effects and hit boxes) |
| `doll.check()` | `{ok, problems}`: every frame of this outfit is one piece, feet on the line, items in the right hands |
| `doll.state()` / `doll.stats()` | text state / `{draws, builds, changes, errors, cached}` |
| `PD.wardrobe({doll, view, title, slots, owned, onChange, onClose})` | the dressing window. `view` = `{x, y, w, h}` (or a function) in native canvas px, at least 192 x 135; `owned` = `{slot: [styles]}` (or `fn(slot)`) limits what can be picked; `slots` = order of rows |
| `wr.open()` / `wr.close()` / `wr.isOpen()` | while open the game should not move the player (it is modal); `onClose(look)` when it closes |
| `wr.input(a)` | `'up' 'down' 'left' 'right' 'ok' 'back'`; returns `true` when used (false when closed: pass the key on) |
| `wr.pointer(x, y)` | a tap / click in native canvas px; `true` while open (it is modal) |
| `wr.update(dtMs)` / `wr.draw(ctx)` | every step / after the world and HUD (draws a dim layer and the panel, crisp bitmap text) |
| `wr.state()` / `wr.rects()` | `{open, row, col, slot, style, tint}` / the panel rect while visible |
| `PD.styles(slot)`, `PD.tints(slot, style)`, `PD.random(seed)`, `PD.verify(look)`, `PD.rig(dir, pose, i, carry)`, `PD.raster(...)` | catalog, seeded outfits, checks, the anchor table, one frame as pixels (no DOM) |

Window keys: up / down pick a row; left / right change the style (or the colour in the colour column); Z on a row goes to
its colour, Z again to the next row; Z on DONE or X closes. Mouse / touch: tap the arrows, the swatch or DONE.

## Integration (generic)

```js
const doll = GameDNA_PaperDoll.create({ look: SAVED_LOOK || { weapon: 'sword', top: 'tunic/forest' },
  onChange: look => { SAVE.look = look; } });
const wr = GameDNA_PaperDoll.wardrobe({ doll, view: { x: 0, y: 0, w: VIEW_W, h: VIEW_H } });
function step(dt) {                                   // the fixed step (also the ?t= fast-forward)
  doll.update(dt); wr.update(dt);
  if (wr.isOpen()) return;                            // modal: no player movement while dressing
  /* ...the game's own update... */
}
function onKey(action) { if (wr.input(action)) return; if (action === 'wardrobe') wr.open(); /* else the game's input */ }
function drawHero() {                                  // replaces the old hero sprite
  doll.draw(ctx, hero.x + hero.w / 2 - camX, hero.y + hero.h - camY,
    { dir: hero.face, moving: hero.moving, walk: hero.distance, attack: hero.swinging ? hero.swingProgress : null });
}
// after the world and HUD:  wr.draw(ctx);
```

## Self-check without a browser

- `feetX` is the centre of the hero's box and `feetY` its bottom, in canvas px after the camera (work one example through).
- `walk` grows only while the hero really moves (the game's own counter is fine: `stride` is px per frame of that counter).
- `attack` is `null` (not 0) when not attacking, and runs 0 -> 1 over the game's own swing; the hit box stays the game's.
- No `scale(-1, 1)` around `doll.draw`; the old weapon sprite is not drawn on top when the doll holds one.
- `?auto=1`, `?t=&freeze=1` and restart still work: the wardrobe never opens by itself, `update()` runs in the same step.

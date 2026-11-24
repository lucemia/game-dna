# D-02 Paper doll

## What it is

The hero is built from layers you can swap: body (skin tone), hair, hat, top, legs, boots, a weapon in the right hand and a
shield in the left. Each part comes in a few styles (a hood, an iron helm, a tall pointed hat; a tunic, plate armour, a long
robe, a leather vest; a sword, an axe, a staff, a spear; a round, kite or small metal shield) and a palette of tints; one base
colour per tint becomes a 5-tone ramp (cool shadows, warm lights). Every part is painted in code on ONE shared rig, the anchor
table (head, torso, hip, both legs and both hands per direction and frame), so any combination lines up in every frame:
4 directions x stand, a 4-frame walk, a 3-frame attack and a jump. Turning left does not mirror the hero as a whole: the body
mirrors, the weapon stays in the right hand, which is then the far hand behind the body, and the shield stays on the left arm
in front. A small wardrobe window (keys, mouse, touch) lists the slots with arrows and a colour swatch, shows a preview turning
through its four sides on a pedestal, and the change sparkles on the preview and on the walking hero.

## Default parameters

| key | default | meaning |
|---|---|---|
| stride | 5 | px of the game's walk counter per walk frame: `frame = floor(walk / stride) % 4` while moving |
| sparkleMs | 520 | equip sparkle (4 pixel stars at the changed part); 0 = off |
| shadow | on | a 2-row ground shadow under the feet (a jumping hero gets it at `shadowY`) |
| wardrobeKey | C | the key the game maps to `wr.open()` (plus a HUD button for touch) |
| size | fixed | frame 40 x 40, about 22 px from boots to crown (hats up to 31: about 1.4x a 16 px sprite), feet centre at column 20, outline row 37 drawn on `feetY`; `scale` whole numbers only; the game keeps its own hitbox and feet line |

## Variants

- **Adventurer** (default): stride 5, sparkle on.
- **Platformer hero**: stride 4 (shorter, faster steps for a running counter).
- **Calm dress-up**: no sparkle (shops and character creators where every click changes something).

## Interface

Needs: the hero's feet (centre of its box and its bottom, after the camera), its facing (`'left' 'right' 'up' 'down'`,
`1 / -1` or radians), a walk counter that grows only while it moves, the attack progress (0..1, `null` when idle), an
airborne flag; `doll.update(dt)` and `wr.update(dt)` in the fixed step (also the `?t=` fast-forward); the game paused while
`wr.isOpen()`; keys passed to `wr.input()` first while it is open, taps to `wr.pointer(x, y)` in canvas px.

Provides: `create({look, params, onChange})` -> doll (`draw`, `equip`, `look` / `setLook` for saves, `rect`, `lastDrawn` with
both hands' screen points for effects, `check`, `state`, `stats`); `wardrobe({doll, view, owned, slots, onClose})` (`open`,
`close`, `isOpen`, `input`, `pointer`, `update`, `draw`, `state`, `rects`); `styles`, `tints`, `random(seed)`, `verify(look)`,
`rig(dir, pose, i, carry)` (the anchor table) and `raster` (one frame as pixels, no DOM).

## Screen rules

- Pixel art at the game's native resolution: 1 art px = 1 canvas px, drawn with smoothing off, whole-number positions and
  scales; 1 px ink outline (#1a1024) round the silhouette; enclosed background pockets of <= 4 px (between a held item and
  the body) are inked like a hand-cleaned sprite.
- Rig: head 10 x 9 (front) / 9 x 9 (side), torso 8 x 6 / 6 x 6, legs 4 rows, feet 2 rows; eyes 1 x 2 px. Walk: frames 0 and 2
  are contacts (a foot lifted 2 px front / a 2 px stride side), 1 and 3 passing (body up 1 px, the trailing foot 1 px up);
  arms swing opposite the legs; the weapon hand holds steady at the ready (side: forward of the body; front / back: 1 px
  out from the body, the axe head turned outward, never over the face). Attack: windup, strike (body leans 1 px into it),
  follow-through; held items follow the hand. A spear thrusts: its windup draws it back along its own axis, tip forward.
  Facing up, the raised weapon is drawn over the head.
- Hands: the weapon's grip pixel is inside the right hand's 2 x 2 box in every frame; the shield's centre inside the left
  hand's box. Facing left the right arm and weapon are painted behind the body, the shield in front (full face); facing right the
  reverse, with the shield's rim peeking out behind the back; facing down the shield's face (5 px wide, emblem) is on the
  left arm, facing up its back (wood, rim, strap); facing down the right hand is on the screen's left, facing up on the screen's right.
- Every frame of every outfit is one alpha-connected piece, the lowest row is the foot line (the jump 3 px above), the hat's
  anchor is the head's, no skin or gap at the waist.
- Wardrobe: 192 px wide (needs a view of at least 192 x 135 native px), centred, modal: a dim layer over the game, a framed
  panel, rows HAT HAIR TOP LEGS BOOTS WEAPON SHIELD SKIN DONE with `< style >` and a 3-tone swatch; the cursor bar glides
  (45 ms ease) and never jumps; opens / closes over 160 ms; crisp 5 x 7 bitmap font (8 px line) with a 1 px shadow; the
  preview at 2x on a pedestal turns every 1.4 s and faces the viewer for 0.9 s after a change.

## Common mistakes

| symptom | fix |
|---|---|
| The sword jumps to the other hand when the hero turns left | the doll was drawn under `scale(-1, 1)`: pass `dir: 'left'` instead |
| The hero floats or sinks into the ground | `feetY` is not the bottom of the old sprite's feet: work it through the box, camera and sprite offset |
| The hero slides without stepping | `walk` is not passed or does not grow (pass the game's own counter; `moving: true` while it moves) |
| The hero freezes in the windup pose | `attack: 0` when idle: pass `null` |
| Two swords | the old weapon sprite is still drawn on top: skip it when the doll holds a weapon |
| The wardrobe never appears or stays half faded | `wr.update(dt)` not called in the step, or `wr.draw` before the world |
| The hero walks while dressing / keys do two things | the game still updates while `wr.isOpen()`, or keys are not sent to `wr.input()` first |
| `?auto=1` ends differently | the wardrobe opened under autoplay, or `update()` was put somewhere the `?t=` loop does not call |

## Acceptance moments

| # | still | event it must show (`checks/state.json`, verified at 1280 / 500 / 390 px by `checks/shoot.py`) |
|---|---|---|
| 1 | `?t=3700&freeze=1` | wardrobe open on HAT: a hood just put on, sparkles on the preview |
| 2 | `?t=5500&freeze=1` | the colour column: the helm recoloured bronze, the swatch framed, the row shows the colour name |
| 3 | `?t=7100&freeze=1` | TOP: plate armour with pauldrons on the preview |
| 4 | `?t=12000&freeze=1` | SHIELD: a kite shield on the preview's left arm |
| 5 | `?t=16900&freeze=1` | the new outfit on the walking hero heading right; four townsfolk in other outfits |
| 6 | `?t=18140&freeze=1` | facing right: the strike frame, the sword in the near (right) hand in front |
| 7 | `?t=20860&freeze=1` | facing left: the sword still in the RIGHT hand, the far arm reaching from behind the body; the shield in front |
| 8 | `?t=22000&freeze=1` | back view walking: sword on the screen-right side, the shield's back on the left arm |
| 9 | `?t=29500&freeze=1` | the closing line-up: all five outfits side by side facing the viewer, fully in view at 390 / 500 / 1280, clear of chips and props |

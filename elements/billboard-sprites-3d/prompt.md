# Billboard sprites in a 3D scene

Defaults: filter = {{filter}} (smooth), billboard = {{mode}} (camera), shadow = {{shadow}} (blob), hit flash = {{flashMs}} ms (200), height = {{height}} (1.6 world units for a human).

Replace the 3D characters (low-poly units, placeholder models) in my three.js game with painted 2D characters standing in the world as camera-facing billboards.

## Use the module, do not rewrite it

The folder has `billboard-sprites-3d.js` (global `GameDNA_Billboards3D`) and its README. Load it with `<script src>` right after `three.min.js`; do not write your own billboard code. If the folder has `kit-art.js` and `kit.js` (plus `cutout-characters.js` and `pack.js`), those are ready-made painted characters: load them in that order before the module, start the game inside `GameDNA_DemoKit.ready(boot)`, and make sources with `GameDNA_Billboards3D.kitSource(GameDNA_DemoKit, id)`. Rigged walkers: `sword`, `spear`, `mage`. Painted: `knight`, `archer`, `keeper`, `herbalist`, `skeleton`, `cultist`, `golem`, `wolf`, `imp`, `slime`, `harpy`, `wisp`. Pick ids that fit each unit's role; ids may repeat.

## Integration points

1. After the scene, camera and renderer exist: `const bb = GameDNA_Billboards3D.create({ scene, camera, renderer, groundY: (x, z) => floorHeight(x, z), filter, mode, shadow, flashMs })`. Use the game's floor / tile-top height; if none, the floor's y.
2. For every unit, once: `bb.add({ id, source, x, z, h })`, then hide its old mesh (`visible = false`); keep the object if code reads, picks or raycasts it.
3. Every frame, after the game step and AFTER the camera moved, before `renderer.render`: `bb.move(id, x, z)` with the unit's feet position, `bb.setTarget(id, foeId or null)` (only while it attacks, talks or stands facing someone; null while walking, so it faces where it walks), then `bb.update(dtMs)`. On every render path: play, pause, `?t=` stills (`bb.update(0)`), autoplay.
4. Events: attack `bb.play(id, 'attack', {ms})`, hit `bb.play(id, 'hurt')`, death `bb.play(id, 'down')` then `bb.set(id, {alpha})`, restart / respawn: `bb.move` there and `bb.play(id, 'idle')`.
5. 2D things attached to a unit (HP bars, names, numbers) use `bb.anchor(id, 'head')` (CSS px).
6. If the game exposes `window.__state()`, add per actor the fields of `bb.state()` (`facing`, `target`, `x`, `y`).

## Rules

- Never mirror by hand (`scale.x = -1`, "enemies face left"): the module picks the side from the camera and never mirrors art marked `mirror: 'never'`.
- Feet stand on the floor: pass the feet position, not a model centre; do not add the old model's half height.
- Keep every caller working: autoplay, restart, URL parameters, shortcuts, picking, camera controls. Find every place the old unit meshes are created, moved, rotated, animated, removed or recoloured and route it to the module.
- If WebGL is missing, keep the game's existing fallback.

## Self-check without a browser

- `create` runs once; `add` once per unit (also for units spawned later); `remove(id)` when a unit is gone for good.
- `bb.update` is called after every camera change and before every render, including frozen frames.
- Attackers call `setTarget` with the foe's id when the attack starts.
- Worked example: a unit at feet (2, 3) on a tile whose top is y = 0.5: `bb.move(id, 2, 3)` and `groundY(2, 3)` returns 0.5; the sprite's lowest row then sits at y = 0.5.

## Acceptance checks

- No console errors; the game still plays (and autoplays) to the same end as before.
- Every character is a painted sprite; walkers animate, single pictures hop.
- Turn the camera: each character still looks at its target or its walking direction on screen. Weapon hands never swap.
- Feet touch the floor; shadows sit under the feet.
- A hit flashes the character itself (no white rectangle).
- CHANGES.md lists which ids you used for which units.

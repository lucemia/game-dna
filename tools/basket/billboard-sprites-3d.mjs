// Basket hint for N-02 billboard-sprites-3d: replace a three.js game's 3D characters (low-poly units, placeholder
// models) with painted 2D characters standing in the world as camera-facing billboards. Needs three.js 0.149.0
// (window.THREE). The art is NOT copied by combine.mjs: add demo-kit/kit-art.js, demo-kit/kit.js and (for the rigged
// sword / spear / mage) elements/cutout-characters/module/cutout-characters.js + elements/cutout-characters/assets/pack.js
// as extra files, or let the designer give their own images through imageSource().
export default {
  stage: 'actors',
  does: 'Every character becomes a painted sprite on a yaw-only quad that faces the camera, feet on the floor or tile top, a soft blob shadow below. The side it looks at is read on screen from the camera (target first, then walk direction), painted left / right variants are used instead of mirrors and art marked mirror:never is never mirrored. Walk poses advance with distance; single pictures hop; attack, hurt, down and the hit flash live in the material. Game rules, positions and timings never change.',
  params: { filter: 'filter', mode: 'mode', shadow: 'shadow', flashMs: 'flashMs', height: 'height', push: 'IGNORE', lightProbe: 'IGNORE' },
  steps: [
    ['Where the scene, camera and renderer are made (and the boot: first step, `?t=` fast-forward, first frame)',
      'Load `three.min.js`, then the kit files if given, then `billboard-sprites-3d.js` verbatim. `const bb = GameDNA_Billboards3D.create({scene, camera, renderer, groundY: floorHeight, filter: \'{{filter}}\', mode: \'{{mode}}\', shadow: \'{{shadow}}\', flashMs: {{flashMs}}})`. With the kit: boot inside `GameDNA_DemoKit.ready(boot)`.'],
    ['Where each unit / character model is created (also later spawns)',
      '`bb.add({id, source: GameDNA_Billboards3D.kitSource(GameDNA_DemoKit, kitId), x, z, h: {{height}} * role})`; hide the old mesh (`visible = false`) but keep the object for picking / position reads.'],
    ['The render path(s): after the game step and AFTER every camera move, before renderer.render (play, pause, frozen stills)',
      '`bb.move(id, feetX, feetZ)`, `bb.setTarget(id, foeOrSpeakerId | null)`, then `bb.update(dtMs)` (0 when paused or frozen).'],
    ['Attack, hit, death, restart / respawn events',
      '`bb.play(id, \'attack\', {ms})`, `bb.play(id, \'hurt\')`, `bb.play(id, \'down\')` + `bb.set(id, {alpha})`, restart: `bb.move` + `bb.play(id, \'idle\')`.'],
    ['2D overlays attached to units (HP bars, names, damage numbers, bubbles, selection)',
      '`bb.anchor(id, \'head\')` -> `{x, top, w, h, visible}` in CSS px of the canvas.']
  ],
  gotchas: [
    'Characters float half a body above the tile -> the old model centre was passed; pass the feet position and let groundY give the floor height.',
    'Characters face the wrong way after the camera turns -> a facing was typed from world x or a team side; use setTarget / move only.',
    'Weapon hand swaps -> the sprite was mirrored by hand (scale.x = -1); never mirror, the module picks painted variants.',
    'Sprites edge-on or a frame late -> bb.update ran before the camera moved, or the frozen-still path skips bb.update(0).',
    'Old low-poly unit still visible next to the sprite, or picking broken -> hide the mesh, do not delete the object.',
    'Feet slide -> the mesh was moved directly; always bb.move so the walked distance drives the walk pose.'
  ],
  checks: [
    'Turn the camera to 3+ yaws: every character still looks at its target / walking direction on screen; held weapons never swap hands.',
    'Feet touch the floor / tile top; blob shadows under the feet.',
    '`?auto=1` ends exactly as before; `?t=<ms>&freeze=1` is stable; no console errors.'
  ],
  selfcheck: [
    'Grep `GameDNA_Billboards3D.create`: once. Grep `bb.add(`: once per unit, also in spawn code.',
    'Grep `bb.update(`: in every render path, after the camera code.',
    'Grep `scale.x = -1` / `rotation.y =` on unit meshes: none left that the player sees.'
  ],
  offers: { anchors: 'bb.anchor(id) screen anchors for bark-bubbles / damage-numbers' },
  wants: {}
};

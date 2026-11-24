// Basket hint for N-04 toon-outlines-3d: turn an existing three.js game cel-shaded (banded toon lighting, rim light,
// inverted-hull ink outlines) with one module call. Needs three.js 0.149.0 (window.THREE); the module is view only.
export default {
  stage: 'look',
  does: 'Every lit material (Lambert, Phong, Standard) becomes a toon copy with 2-4 light bands, a cool shadow side, rim light and hard glints; every solid mesh gets an ink outline that shares its buffers, keeps a steady screen width and thins on small or far objects. The game\'s scene graph, rules, timings, colour flashes and fades keep working; setEnabled(false) / remove() restore the original look exactly.',
  params: { preset: 'preset', width: 'width', color: 'color', rim: 'rim' },
  steps: [
    ['Where the scene, camera and renderer are made (before the first frame, the boot, the `?t=` fast-forward)',
      'Load `three.min.js`, then `toon-outlines-3d.js` verbatim. `const toon = GameDNA_Toon3D.create({ scene, camera, renderer, preset: \'{{preset}}\', width: {{width}}, color: \'{{color}}\', rim: {{rim}} })`. A restart that rebuilds in the same scene needs nothing; a new scene object: `toon.remove()` and create again.'],
    ['Every render path of the main scene (play, pause, title / end, frozen stills, autoplay), after the camera moved',
      '`toon.update(dtMs)` right before `renderer.render` (or right before the helper that renders).'],
    ['Props that the camera fades with a custom shader / uniform (screen-door dither)',
      'Pass `fade: mesh => 0..1` (1 = solid) to create, so outlines hide while the prop fades.'],
    ['Scene objects that must not change (HUD meshes, debug helpers)',
      '`obj.userData.toon = false` (subtree untouched) or `obj.userData.toonOutline = false` (shading, no outline).'],
    ['Settings menu (if any)',
      'A "Toon look" switch calls `toon.setEnabled(on)`.']
  ],
  gotchas: [
    '`?t=` stills look original -> the still path renders without toon.update or create ran after the first render.',
    'Dark ghost outline where a prop fades -> the game fades with its own shader; pass fade(mesh).',
    'Grass / crowds without outlines -> instanced meshes get toon shading only (stated fallback); skinned / morphed meshes too.',
    'Hand-made MeshToonMaterial swaps or extra outline meshes -> remove them; the module mirrors the game\'s material changes itself.',
    'A new toon instance every restart -> check `toon.group.parent === scene` first; same scene = keep the instance.'
  ],
  checks: [
    'Toon look on every frame incl. `?t=&freeze=1`; `toon.state()` shells > 0, errors 0.',
    'Turn the camera: outlines stay on their objects, characters still face their move direction, feet on the ground.',
    '`?auto=1` ends exactly as before; no console errors.'
  ],
  selfcheck: [
    'Grep `GameDNA_Toon3D.create`: once per scene. Grep `toon.update(`: before every `renderer.render` of that scene.',
    'Grep `MeshToonMaterial`: only inside the module.'
  ],
  offers: {},
  wants: {}
};

// Basket hint for E-14 ik-creatures: how to wire the module into an UNKNOWN game, by role.
// (The coordinator copies this file to tools/basket/ik-creatures.mjs.)
// The module draws the game's ground-walking foes as many-legged creatures whose feet plant on the game's ground. It never moves
// the foes or changes their rules (AI, hit boxes, HP stay the game's).
export default {
  stage: 'actor',
  does: 'Walking foes become spiders, crabs or centipedes drawn in code: feet plant on the ground and never slide, legs step in alternation with 2-bone IK, the body faces its path and the head turns to the hero; legs hang in the air and replant on landing; defeated foes curl up. HD shading at device resolution, or native pixels with a fixed ramp.',
  params: {
    kind: 'the `kind` of each walking foe (`spider` default; `crab` for a slow wide boss; `centipede` for long chases, not for side-view foes that reverse on the spot)',
    stride: 'create `params.stride`', lift: 'create `params.lift`', palette: 'create `params.palette` (auto | forest | ember | cave | frost)', render: 'create `params.render` (auto picks pixel when imageSmoothingEnabled is false)'
  },
  steps: [
    ['Once, after the level exists',
      '`bugs = GameDNA_IKCreatures.create({view: \'side\' /* or \'top\' */, seed: 1, scale: VIEW_H / 360, ground: (x, y) => /* side: surface y at column x at or below y; inside solid: top of that run; null for a pit */, walkable: (x, y) => /* false on water / walls / trees */, actors: () => walkingFoes.map(f => ({id: f.id, kind: \'{{kind}}\', x: feetX, y: feetY, size: f.w * 0.9, target: {x: heroX, y: heroY}, flash: f.flash ? 1 : 0, dead: !f.alive})), params: {stride: {{stride}}, lift: {{lift}}, palette: \'{{palette}}\', render: \'{{render}}\'}})` (world px, stable ids; feet = box bottom centre in a side view, the floor position top-down).'],
    ['The end of the fixed step', '`bugs.update(worldRunning ? stepMs : 0)` (live loop, `?t=` fast-forward and autoplay).'],
    ['The draw pass', 'where each walking foe\'s body was drawn (inside the y-sorted list): `bugs.drawOne(ctx, f.id, camX, camY)` (`0, 0` inside a camera translate), then the game\'s HP bar; keep calling it about 1 s after death.'],
    ['New game / restart', '`bugs.clear()`.']
  ],
  gotchas: [
    'Feet float or sink -> `ground` returns the tile row or screen px, or `y` is the box top; pass the feet and world px.',
    'Creatures re-spawn every frame -> ids made per frame; use the foe\'s own id.',
    'Creature drawn off its hit box or sliding with the camera -> camera applied twice.',
    'Old body still drawn under the legs -> stop drawing it for those foes (keep the HP bar).',
    'Legs walk on in the pause menu -> `update(0)` while stopped.'
  ],
  checks: [
    'Feet stand on the ground and stay put while the body walks over slopes and steps; never two neighbouring legs up together at a walk; the body faces its path and the head looks at the hero.',
    '`?auto=1` ends the same way; `?t=&freeze=1` is deterministic; no console errors.'
  ],
  selfcheck: [
    'The module is unchanged and loaded first; `update` once per fixed step on every path (0 while stopped); `drawOne` in the sprites\' space; `clear()` on new game.'
  ],
  offers: {
    'hit-site': 'A planted foot is a footstep: `onStep(info)` gives `{id, leg, x, y}` for sounds or small dust.'
  },
  wants: {
    'freeze': { title: 'hit-stop', text: '`bugs.update(0)` while frozen.', check: 'During a hit-stop the legs hold still.' }
  }
};

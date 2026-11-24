// Basket hint for D-02 paper-doll: how to wire the module into an UNKNOWN game, by role.
// The module replaces the hero's sprite with a layered pixel doll (body, hair, hat, top, legs, boots, weapon, shield) and adds a
// small modal wardrobe. The game keeps its own hero state, hit boxes and rules; it only passes feet, facing, walk and attack.
export default {
  stage: 'actor',
  does: 'Paper doll: the hero drawn from swappable pixel parts with tints on one shared rig (4 directions, 4-frame walk, 3-frame attack, jump); the weapon stays in the right hand when it turns; a wardrobe window (keys, mouse, touch) with a turning preview.',
  params: {
    stride: 'create `params.stride` (px of the walk counter per frame)', sparkleMs: 'create `params.sparkleMs`', shadow: 'create `params.shadow`',
    wardrobeKey: 'the key mapped to `wr.open()`'
  },
  steps: [
    ['Once, when the game starts', '`doll = GameDNA_PaperDoll.create({look, params: {stride: {{stride}}}})`; `wr = GameDNA_PaperDoll.wardrobe({doll, view: {x: 0, y: 0, w: VIEW_W, h: VIEW_H}})` (view >= 192 x 135 native px). Keep both across restarts.'],
    ['Every place the hero sprite was drawn (map, title, battle)', '`doll.draw(ctx, boxCentreX - camX, boxBottom - camY (+ the old sprite offset), {dir, moving, walk, attack: progress or null, air, scale, alpha})`; skip the old weapon sprite; never `scale(-1, 1)`.'],
    ['The fixed step (also the ?t= replay)', '`doll.update(dt); wr.update(dt);` then if `wr.isOpen()` skip the world / player / enemy update (modal).'],
    ['Input', 'while open every key first to `wr.input(up|down|left|right|ok|back)`, taps to `wr.pointer(x, y)`; `{{wardrobeKey}}` (and a HUD button) opens it when the hero is free; autoplay never opens it.'],
    ['Render', '`wr.draw(ctx)` last, over the world and HUD. Save `doll.look()` with the game.']
  ],
  gotchas: [
    'Sword switches hands when turning -> the doll is drawn mirrored: pass `dir: \'left\'`.',
    'Hero hovers / sinks -> feetY is not the old sprite\'s feet (box bottom + sprite offset, after the camera).',
    'Frozen windup pose -> `attack: 0` passed when idle; use `null`.',
    'Hero slides -> `walk` missing or not growing while moving.',
    'Wardrobe invisible -> `wr.update` not in the step (it fades in with update) or drawn before the world.'
  ],
  checks: [
    'Walking in four directions shows a 4-step walk; facing left the weapon is behind the body in the right hand.',
    'The attack shows windup, strike, follow-through with the weapon in hand; the game\'s hits are unchanged.',
    'The wardrobe opens with the key, changes show on the preview and the hero, the game is paused meanwhile, Z / X close it.',
    '`?auto=1` reaches the same end as before with no console errors.'
  ],
  selfcheck: [
    'One worked example of feetX / feetY through the hero box, the camera and the old sprite offset.',
    'Every old hero draw call replaced; every key reaches `wr.input` first while open.'
  ],
  offers: {
    'ui-rects': { title: 'wardrobe panel', text: '`wr.rects()` is the wardrobe panel while visible; other overlays should wait or keep clear of it.' }
  }
};

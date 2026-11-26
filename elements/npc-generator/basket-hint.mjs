// Basket hint for D-03 npc-generator: how to wire the module into an UNKNOWN game, by role.
// The module adds seeded townsfolk (hand-pixelled, 4-direction walk, names and trades) that wander a walkable area and talk
// through its own screen-space panel (portrait, name, trade, line) with a small marker over the talker's head.
// The game keeps its own hero, collision, paths and dialogue; townsfolk are not solid and read no input.
export default {
  stage: 'actor',
  does: 'NPC generator: seeded townsfolk from parts (age, build, skin, hair, clothes, hats, glasses, beards) in one pixel style with a 4-direction walk, a name and a trade; same seed = same people; a town helper makes them wander round walls and props, make way for the hero and face whoever talks to them; a talk opens a dialogue panel at the bottom (or top) of the view with their own pixel portrait, clear of the HUD.',
  params: {
    seed: 'town `seed`', count: 'town `count`', speed: 'town `speed` (px per second)', scale: 'town `scale` (2 for 32-48 px tiles)'
  },
  steps: [
    ['Every new game (also restart)', '`town = GameDNA_NpcGen.town({seed: {{seed}}, count: {{count}}, speed: {{speed}}, scale: {{scale}}, area: {x, y, w, h} /* world px of a village or square */, blocked: (x, y) => /* the game\'s solid test for ONE world point */})`.'],
    ['The fixed step (also the ?t= replay), only while the world runs', '`town.update(STEP_MS, {x: heroFeetX, y: heroFeetY})`.'],
    ['The world draw, inside its depth sort', '`for (const d of town.drawables(camX, camY)) list.push({y: d.y, draw: () => d.draw(ctx)})` (pass `0, 0` if the canvas is already translated by the camera).'],
    ['The talk key, after the game\'s own targets', '`if (town.talking()) town.release(); else { const f = town.nearest(heroFeetX, heroFeetY, ~1.5 tiles); if (f) town.talk(f, {x: heroFeetX, y: heroFeetY}); }` (do not open the game\'s own dialogue box for townsfolk; walking ~3 tiles away also ends the talk).'],
    ['Every frame after the world, in screen space, before menus and windows', '`town.panel(ctx, camX, camY, {view: {x: 0, y: 0, w: VIEW_W, h: VIEW_H}, avoid: hudRects})` with screen = world - cam (a map drawn 16 px lower: `camY = camera.y - 16`) and `hudRects` = the always-on HUD boxes in screen px (array or function).']
  ],
  gotchas: [
    'Townsfolk inside houses or props -> `blocked` tested tiles or screen px instead of world points.',
    '`?auto=1` ends differently -> townsfolk were made solid or the talk key now talks instead of the old action; keep them out of collision and check them last.',
    'Doubled camera offset -> the canvas is already translated: pass 0, 0.',
    'Frozen townsfolk -> `town.update` not in the fixed step.',
    'Created per frame -> make the town once per game, not in draw.',
    'Panel on the HUD or on the wrong side -> `avoid` misses HUD boxes, or the camera passed to `panel` lacks the HUD offset.',
    'Two dialogue boxes -> the game\'s own dialogue was also opened for a townsperson; the panel replaces it.'
  ],
  checks: [
    '{{count}} different-looking people walk in four directions with stepping feet, never inside walls or props, and step round each other and the hero.',
    'The talk key next to one stops it; it turns to the hero; a marker over its head and the panel with its portrait, name, trade and line, inside the view and clear of the HUD; the key again (or walking away) closes it and it walks again.',
    'The same seed gives the same people after a reload; `?auto=1` ends as before with no console errors.'
  ],
  selfcheck: [
    'One worked example: world (200, 150), camera (64, 40) -> drawn at (136, 110).',
    'Every old use of the talk key still reaches its target first.'
  ],
  offers: {}
};

// Basket hint for L-05 normal-maps: how to draw painted sprites in an UNKNOWN game lit by the game's own lights through
// derived normal maps. Needs L-00 art-direction-lock (GameDNA_Assets loader), pulled in by element.json `requires`. The
// images come from the element's sample pack (assets/assets.json + albedo/*.webp + maps/*.nh.webp, the "pack" layer; add
// them as extra files, combine.mjs does not copy images) or from the designer's own sprite made with prompt.md +
// assets/prompts/templates.md + tools/assets/normalmap.py (the "regenerate" layer). J-02 normal-lighting lights the same
// maps in WebGL; with J-02 in the basket, keep this module for the 2D fallback.
export default {
  stage: 'actor',
  does: 'Replaces some of the game\'s code-drawn characters and props with painted sprites and lights each one from wherever the game\'s lights are (a lantern on the hero, lamps, glowing pickups): the side facing a light brightens, the far side stays at the ambient level, rims catch grazing light. Plain 2D canvas, no WebGL; as sharp as the plain picture; capped so lights never wash a sprite out. A missing picture keeps the old drawing; a missing or unreadable map draws the plain picture.',
  params: { view: 'IGNORE', light: 'IGNORE', color: 'IGNORE', ambient: 'ambient', radius: 'IGNORE', height: 'IGNORE', strength: 'strength', key: 'IGNORE', extra: 'IGNORE', asset: 'IGNORE' },
  steps: [
    ['The game\'s boot (first step, `?t=` fast-forward, first animation frame). Grep every caller',
      'Include `art-direction-lock.js` then `normal-maps.js` verbatim. Inline the pack entries (each albedo AND its `-nh` map; keep `anchor`, `drawH`, `normal`; `src` relative to the page) and move the boot into `GameDNA_Assets.load(list, {onReady: boot})`. Create one instance at load time: `const nm = GameDNA_NormalMaps.create({assets: GameDNA_Assets, ambient, lights: () => gameLights()})`.'],
    ['Each draw site of a replaced character / prop (feet point, height, facing)',
      '`if (!nm.draw(ctx, key, feetX, feetY, {h: oldHeight, flip: facesLeft})) <old drawing>`; keep hurt flash / blink (pass `alpha` or draw the old flash over it). Pictures only: hit boxes and rules stay.'],
    ['The game\'s light sources (hero, lamps, fires, glowing pickups, projectiles)',
      '`gameLights()` returns `[{x, y, z, radius, color, intensity}]` in the same coordinates as the draw calls (world px inside the camera translate), from game state; flicker from the game clock. Ambient: day 0.85, dusk 0.6, night 0.4; 0.85-1 when the game already darkens its scene.']
  ],
  gotchas: [
    'Sprites draw unlit in the browser -> the page is opened as file:// (pixels unreadable); serve over http. `nm.stats().reason` says so.',
    'Lantern lights the wrong side -> lights and sprites in different coordinate spaces (screen vs world).',
    'Frozen screenshot differs between loads -> the boot still runs before `onReady`, or a light flickers on Date.now() / Math.random().',
    'Two instances in the judge probe per session -> `create` called per frame or per restart; create once at load time.',
    'Sprite washed out -> too many strong lights at a day ambient; lower intensities (the cap keeps it at 1.3x).',
    'Unlit lamp / inactive checkpoint drawn lit -> pick `lamppost-off` from the game state; replace state-showing things only when the pack has every state.',
    'Old sprite visible in hurt frames -> pass `flash` (0..1) to nm.draw; never draw the old sprite over or under the picture.',
    'Two characters share one picture -> one picture per character.',
    'Hero turns back into the old drawing when facing up -> never switch by facing: pictures for every facing, or keep the old drawing for that character throughout.',
    'Attacks invisible after the swap -> nm.draw replaces the body only; keep drawing the old weapon and swing arc after it.',
    'Painted NPCs darker than a bright world -> day ambient 0.8 with key intensity 0.25.'
  ],
  checks: [
    'Replaced sprites stand where the old drawings stood, at the same height and facing; the side toward the hero\'s lantern is brighter.',
    '`?normals=0` shows the plain pictures; `?t=<ms>&freeze=1` gives the same frame every time; `?auto=1` ends as before; no console errors.',
    'Removing a map file makes that sprite draw plain; removing its picture brings back the old drawing.'
  ],
  selfcheck: [
    'Grep `nm.draw(`: each sits in `if (!...)` with the old drawing.',
    'Grep `Date.now` / `Math.random` in gameLights: none.',
    'Grep `GameDNA_NormalMaps.create`: called once, at load time.'
  ],
  offers: {},
  wants: {}
};

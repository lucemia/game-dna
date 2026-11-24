// Basket hint for L-00 art-direction-lock: how to wire GameDNA_Assets (and a generated, locked art set) into an UNKNOWN game.
// The basket ships the loader; the images come either from the element's sample pack (assets/assets.json + files, the
// "pack" layer) or from the designer's own locked set made with prompt.md + tools/assets (the "regenerate" layer).
export default {
  stage: 'foundations',
  does: 'Loads a set of pre-generated bitmaps (one locked art direction: every image was made with the same style paragraph and the same reference sheet) once at boot, then draws them synchronously in place of the game\'s code-drawn hero, props, floor and item icons, falling back to the old drawing when a file is missing. The game never calls an image generator, so `?t=&freeze=1` and `?auto=1` stay deterministic.',
  params: { set: 'IGNORE', hour: 'IGNORE', light: 'IGNORE', anchors: 'IGNORE', bg: 'IGNORE' },
  steps: [
    ['The game\'s boot (the code that runs the first step, the `?t=` fast-forward and the first animation frame). Grep every caller',
      'Wrap it as `boot()` unchanged and call `GameDNA_Assets.load(ASSET_LIST, {onReady: boot})` instead. `ASSET_LIST` is inlined in the page (a `file://` page cannot fetch `assets.json`): `[{key, src, anchor, drawH, tileW, tileH}]`, `src` relative to the page.'],
    ['Each draw site you replace (hero / NPC sprite, world props, floor, item or HUD icon)',
      '`if (!GameDNA_Assets.draw(ctx, key, footX, footY, {h: <drawn height>, flip})) <old drawing>`. The anchor is the feet (bottom centre): pass the old sprite\'s top + height, not its top-left. Keep the old sprite\'s drawn height. Floor: ONE `GameDNA_Assets.fillTiled(ctx, key, viewRect, {tileW, tileH, ox: -camX, oy: -camY})` over the view, under every floor-like tile. Icons: `draw(..., {h: slot, anchor: [0.5, 0.5]})`.'],
    ['Depth sort', 'Keep the game\'s own back-to-front order by foot y; the bitmap uses the same foot point as the old sprite.'],
    ['Low-resolution canvases (pixel games)', 'Draw at the drawn size with `imageSmoothingEnabled = true` set only around these calls (the game\'s own pixel art keeps it off). Generated art targets HD styles; on pixel games it looks painted, not pixel.'],
    ['Skins (only if skins/skin-api.js v0.5 is in the game)', '`GameDNA_Skin.bitmaps.useAssets(GameDNA_Assets, {\'tile:grass\': \'ground\', \'prop:well\': \'well\'})` after ready; `skin.tile()` / `skin.prop()` / `skin.frame()` then draw them.']
  ],
  gotchas: [
    'A frozen screenshot has no art, or differs between runs -> the old boot still runs directly; it must run only from `onReady`.',
    'Sprites float or sink -> the foot point passed was the old top-left; pass bottom centre.',
    'Images blurry-then-sharp or reloaded on restart -> `load` called in new game / restart; call it once at page load.',
    'Collision or hit boxes changed -> a rule read the image size; keep every size and box from the old code.',
    'A grey fringe around sprites -> the files were resized without `postproc.py alpha` (pack files are already clean; regenerate runs must post-process).',
    'Grid lines in the floor -> one `fillTiled` per cell (use one call), no `fillTiled` at all, or lossy WebP below 95.'
  ],
  checks: [
    'The hero, at least one prop, the floor and one icon show the generated art; nothing else changed size, position, timing or rules.',
    '`?t=<ms>&freeze=1` gives the same frame every time, with the art; `?auto=1` ends as before; no console errors (a missing file only falls back).',
    'Removing one image file from the folder makes only that drawing fall back to the old art.'
  ],
  selfcheck: [
    'Grep the old boot, `requestAnimationFrame` and the `?t=` loop: each runs once, from `onReady`.',
    'Grep `GameDNA_Assets.draw(` / `fillTiled(`: every call sits in `if (!...)` with the old drawing as the fallback.',
    'Walk one sprite: old top-left (x, y), size (w, h) -> foot = (x + w/2, y + h) -> `draw(ctx, key, x + w/2, y + h, {h})`.'
  ],
  offers: {},
  wants: {}
};

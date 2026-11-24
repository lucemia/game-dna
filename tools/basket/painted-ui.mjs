// Basket hint for L-06 painted-ui: how to wire a generated, style-locked UI kit (nine-slice frames, selection frame, slot,
// pointer, icon atlas) into an UNKNOWN game's windows and item lists. Needs the L-00 loader (art-direction-lock.js,
// GameDNA_Assets): not a `requires` (combine.mjs rejects two elements of one family), so add it as an extra file like the
// images. The images come from the element's sample kit (assets/assets.json + assets/kit/*.webp, the "pack" layer;
// add them as extra files, combine.mjs does not copy images) or from the designer's own kit made with prompt.md (the
// "regenerate" layer).
export default {
  stage: 'ui',
  does: 'Draws the game\'s windows, tooltips, selected rows, pointer and item / status icons with one generated, style-locked UI kit: nine-slice frames whose corners never stretch, a dark panel under each frame, a pulsing selection frame on the game\'s own clock, and 24 icons centred at one scale. Every call returns false / null when its image is missing, so the old panel or shape stays as the fallback; layout, text, input and rules do not change.',
  params: { kit: 'IGNORE', scale: 'IGNORE', panel: 'IGNORE', guides: 'IGNORE' },
  steps: [
    ['The boot', 'Include `art-direction-lock.js` (the loader, global `GameDNA_Assets`; it comes with the kit files) verbatim before `painted-ui.js`. Load the kit once: inline the manifest entries (keep `slice`, `inset`, `corner`, `fill`, `panelInset`, `anchor`, `drawH`, `atlas`; `src` relative to the page) in the same `GameDNA_Assets.load(list, {onReady: boot})` call, then `const ui = GameDNA_PaintedUI.create({assets: GameDNA_Assets, scale: <canvas height in game px> / 360})`.'],
    ['Each panel / window draw (dialogue, shop, bag, pause, HUD panels, end screen)', '`if (!ui.frame(ctx, rect, {variant: \'window\'})) <old panel>`; tooltips, buttons and small HUD panels use `\'small\'`. Same rect; if text now touches the border, read `ui.inner(rect)` and nudge only that text.'],
    ['Each item / status picture (shop rows, bag rows or grid, HUD status, pickups shown in UI)', 'A map from item ids to kit keys (`potion mana-potion antidote bread scroll gem sword axe bow staff shield helmet armor boots ring amulet coins key poison burn frost shock regen guard`); `if (!ui.icon(ctx, key, x, y, size)) <old shape>` in the old shape\'s box. Grids may draw `ui.frame(ctx, cell, {variant: \'slot\'})` under each icon.'],
    ['Selected row / slot and the `>` pointer', '`if (!ui.select(ctx, rect, frameCount / 60)) <old highlight>`; `if (!ui.cursor(ctx, tipX, tipY, h)) <old pointer>`.'],
    ['Skins (only if skins/skin-api.js v0.5 and skin-drawn modules are in the game)', 'In `boot`: `ui.attach(GameDNA_Skin, {skins: [<the non-pixel skin id>]})`; their window, tooltip and plate frames and the shop icons then use the kit.']
  ],
  gotchas: [
    'Frozen screenshot has plain panels or differs between loads -> the boot still runs before `onReady`.',
    'Corners smeared / ornament repeated along an edge -> the frame was drawn with one `drawImage`; use `ui.frame`.',
    'Window background missing (world shows through) -> `panel: null`, or the frame image registered in a skin by hand; use `ui.attach`.',
    'Text on the border ornament -> the old padding was kept; read `ui.inner(rect)`.',
    'Icons of different sizes -> drawn at image size; pass the slot box size.',
    'Selection pulse differs between frozen loads -> `t` came from wall time; pass the game\'s frame count / 60.',
    'Pixel-art game looks smeared -> generated UI targets HD styles; leave pixel games\' panels as they are.'
  ],
  checks: [
    'Every window, tooltip and item list shows the painted frames and icons at the same rects and text positions as before; corners are the same size on big and small windows.',
    '`?t=<ms>&freeze=1` gives the same frame every time; `?auto=1` ends as before; no console errors.',
    'Removing one image file makes only that picture fall back to the old drawing.'
  ],
  selfcheck: [
    'Grep `ui.frame(`, `ui.icon(`, `ui.select(`, `ui.cursor(`: each sits in `if (!...)` with the old drawing.',
    'Grep every item id the game can show: it is in the icon map or keeps its old shape.',
    'Grep `Date.now` / `performance.now` near `ui.select`: none.'
  ],
  offers: {},
  wants: {}
};

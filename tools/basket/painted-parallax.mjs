// Basket hint for L-01 painted-parallax: how to replace an UNKNOWN side-view game's flat background with painted, generated
// parallax layers. Needs L-00 art-direction-lock (GameDNA_Assets loader), pulled in by element.json `requires`. The images
// come from the element's sample pack (assets/assets.json + dusk/ and night/ WebP files, the "pack" layer) or from the
// designer's own set made with prompt.md + assets/prompts/templates.md + tools/assets (the "regenerate" layer).
export default {
  stage: 'backdrop',
  does: 'Draws the background of a side-view game from 3-4 painted bitmaps (far sky and ridges, drifting clouds, mid hills, near silhouettes) generated once at build time in one locked style. Each layer is scaled once to the view height with an atmospheric tint baked in, repeated sideways at whole device pixels without a visible join, and scrolled at its own fraction of the camera (clouds 0.08, far 0.16, mid 0.48, near 0.72, the I-02 factors). A missing image falls back to the game\'s old layer.',
  params: { mode: 'IGNORE', set: 'set', speed: 'IGNORE', depth: 'depth', drift: 'drift', tint: 'tint', ground: 'ground', layers: 'IGNORE', seams: 'IGNORE' },
  steps: [
    ['The game\'s boot (first step, `?t=` fast-forward, first animation frame). Grep every caller',
      'Move it into `GameDNA_Assets.load(PACK, {base: \'art/\', onReady})` (L-00). In `onReady`: `bg = GameDNA_PaintedParallax.create({view, set, params, fallback})` once, then the old boot unchanged. `PACK` = the bg-layer entries of assets.json inlined in the page (no fetch on file://).'],
    ['The function that draws the old background (sky gradient, hills, trees) and each layer\'s scroll speed',
      'First line of that function: `if (bg && bg.draw(ctx, camX, camY)) return;` (camX/camY = the camera the tiles use, not negated). Keep the old body: it is the fallback. Map old layer functions in `fallback: {far, mid, near}`.'],
    ['The fixed step (the one `?t=` fast-forward runs)', '`if (bg) bg.update(STEP_MS);` (cloud drift; never wall-clock).'],
    ['Camera y (if the old background moved with it)', '`params: {vertical: 0.5, restY: <camera y at the start>}`; layers shift at most 15 % of the view.'],
    ['Where the ground starts on screen', '`params: {ground: groundTopY / viewH}` (e.g. 232/360 = 0.64): the near layer\'s ground line then meets the game\'s, and the pack\'s `under` strip (keep the `<set>-under` entries in PACK) fills pits and gaps with painted forest floor. Leave 1 only when the ground is at the bottom of the view.'],
    ['devicePixelRatio canvases (`setTransform(scale)`)', 'Nothing to do: the module reads the transform and draws at device resolution. Pass `view` in the game\'s own units (e.g. 640x360).']
  ],
  gotchas: [
    'Layers frozen in place while the hero runs -> camX passed as 0 or as the negated offset; pass the same camera x the tiles subtract.',
    'Backdrop missing on the title or end screen -> that screen called the old background directly; route it through the same function.',
    'Clouds never move -> `update` not in the fixed step (or only in rAF, which `?t=` fast-forward skips).',
    'A frozen shot has the old flat sky -> boot runs before `onReady`; images are not loaded yet on the first frame.',
    'Layers drawn over tiles -> `bg.draw` called after the world translate; call it first, before `ctx.translate(-camX, ...)`.',
    'A flat colour slab inside pits -> the `under` entries were left out of PACK (or a regenerated set has no under strip); add them, or pass `fallback.under`.',
    'Painted layers next to pixel-art tiles look mixed -> L-01 targets HD games; for pixel games use I-02 parallax-layers.'
  ],
  checks: [
    'Scrolling right: far, mid and near move at clearly different speeds, clouds drift on their own; no vertical line, gap or jump where a layer repeats (`checks/seamcheck.py PAGE` passes).',
    '`?t=<ms>&freeze=1` gives the same frame twice; `?auto=1` ends as before; the game state at every moment equals the original (pictures only).',
    'Renaming one layer file makes only that layer fall back to the old drawing; no console error.'
  ],
  selfcheck: [
    'Grep the old boot, `requestAnimationFrame` and the `?t=` loop: each runs once, from `onReady`.',
    'Grep `GameDNA_PaintedParallax.create`: once, not in a loop or restart path.',
    'Worked example: 640x360 view, ground tiles start at y 312 -> `ground: 0.87`; camera at x 1200 -> mid layer offset floor(1200 x 0.48) = 576 px.'
  ],
  offers: { backdrop: 'painted side-view background (roles far, clouds, mid, near)' },
  wants: {}
};

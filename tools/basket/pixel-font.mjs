// Basket hint for C-03 pixel-font: how to wire the module into an UNKNOWN game, by role. Never name a host's functions here.
export default {
  stage: 'ui',
  does: 'Every letter on the canvas is drawn from an original 1-bit bitmap font (6x8 proportional `regular`, fixed-advance `mono`, 5x7 `small`; full printable ASCII) at whole pixels, so text is as crisp as the sprites at any integer scale. Strings carry inline colour codes (`HP {gold}120{/}/150`); drop shadow, outline or both; word wrap; fit-to-slot. Messages, captions and dialogue type out letter by letter with pauses after full stops, a blip callback and a ▼ when done.',
  params: {
    font: 'create `params.font` (body text and dialogue)',
    hudFont: '`font` passed by the HUD row draw calls',
    scale: 'create `params.scale`; bigger old sizes map to whole-number `scale` per call',
    shadow: 'create `params.shadow`', color: 'create `params.color`',
    cps: 'create `params.cps`', blipEvery: 'create `params.blipEvery`', pause: 'create `params.pause`'
  },
  steps: [
    ['Once, after the canvas context exists',
      '`PF = GameDNA_PixelFont.create({params: {font: \'{{font}}\', scale: {{scale}}, shadow: \'{{shadow}}\', color: \'{{color}}\', cps: {{cps}}, blipEvery: {{blipEvery}}, pause: {{pause}}}, onBlip})`. `onBlip(ch)` plays the game\'s blip sound if it has one; leave it out otherwise.'],
    ['Every text draw call and text helper (grep `fillText`, `strokeText`, `measureText`, `ctx.font`, bitmap-text and width helpers)',
      'Keep each helper\'s name, parameters and return value; its body becomes `PF.draw(ctx, str, x, y, {color, align, scale, font})`, its width helper `PF.measure(str, {font, scale})`. A bare `ctx.fillText(s, x, y)` becomes `PF.fillText(ctx, s, x, y)` (reads fillStyle, textAlign, textBaseline, px size). Font roles: HUD values and short labels (HP, MP, lives, score, timers, names in status rows) use `font: \'{{hudFont}}\'`; messages, captions, dialogue, menus and titles use `{{font}}`.'],
    ['Every layout that depends on a text width (right-aligned numbers, centred titles, menu columns, boxes sized around text)',
      'Use `PF.measure`; then check each row still fits its window and the canvas (use `{{hudFont}}` or `fit: <px>` where tight). Never drop information to make room.'],
    ['Every place a message, caption, banner subtitle, action name or dialogue line is SET (inside the update step); every such text, even a short passing one, must type out; only static HUD values/labels, menus and titles draw at once',
      '`PF.typewriter(id, text, {width, restart: true})`; where it was drawn: `PF.drawTyped(ctx, id, x, y, {cursor: true})`. If a confirm key already advances messages: `if (!PF.skip(id)) return;` first. Add no new key handlers.'],
    ['Your fixed update step (the one `?t=` / autoplay replays run)', '`PF.update(stepMs)` once per step.'],
    ['Canvas CSS', 'If the canvas is CSS-scaled, add `image-rendering: pixelated` (CSS only).']
  ],
  gotchas: [
    'Text blurry or strokes uneven -> fractional CSS zoom without `image-rendering: pixelated`, or a non-integer `ctx.scale`.',
    'HUD values run into the next column -> widths were hard-coded for the old font; measure everything with `PF.measure`, use the small font or `fit`.',
    'Message empty in `?t=&freeze=1` shots -> `typewriter` was only called from the draw pass; call it where the text is set, inside the step.',
    'A repeated identical message shows instantly -> pass `restart: true` at the set site.',
    'Text never appears -> `PF.update` is never called in the step.',
    'First confirm press skips the whole message -> call `PF.skip(id)` before the advance code.',
    'A system font is still visible on the title or game-over screen -> a `fillText` call was missed; grep again.'
  ],
  checks: [
    'All text uses the bitmap font with hard edges and a 1 px shadow, at 1x and zoomed; no `fillText` text left.',
    'No text overlaps other text, runs past its window or the canvas; HUD numbers stay aligned while they change.',
    'Every message, caption and action name types out letter by letter, pauses after full stops, shows ▼ when complete; confirm completes it first.'
  ],
  selfcheck: [
    'List every former text call site and what draws it now; each helper keeps its name, parameters and return value.',
    'List every set site of message, caption, action-name and dialogue text with its `PF.typewriter(..., {restart: true})` call; none skipped. Walk one: set -> typewriter -> `PF.update` -> `PF.drawTyped`.',
    'Each draw call uses the right role: HUD/labels `{{hudFont}}`, messages/menus `{{font}}`.'
  ],
  offers: {
    'ui-rects': { title: 'text boxes', text: '`PF.draw(...)` returns the drawn box `{x, y, w, h}` and `PF.lastDrawn()` lists the boxes drawn since the last update; pass message and caption boxes on as UI rects.' }
  },
  wants: {
    'battle-start': { title: 'reset', text: 'Call `PF.clear()` there so no half-typed caption survives a restart.' }
  }
};

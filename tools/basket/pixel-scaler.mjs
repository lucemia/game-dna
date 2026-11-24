// Basket hint for I-01 pixel-scaler: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'foundations',
  does: 'The game keeps drawing on its small native canvas; the module shows that canvas at the largest whole number of device pixels per game pixel that fits (on any devicePixelRatio), centred in a themed border on the same pixel grid, so every game pixel is a crisp square. `toGame()` maps taps and clicks back to game pixels. Optional: a fit step for small phones, a CRT/scanline overlay, a fullscreen button in the border. No loop, no timer, no change to game logic or timing.',
  params: {
    mode: 'create `params.mode`', border: 'create `params.border`', color: 'create `params.color`', pad: 'create `params.pad`',
    crt: 'create `params.crt`', scanlines: 'create `params.scanlines`', fill: 'create `params.fill`', align: 'create `params.align`',
    maxScale: 'create `params.maxScale`', button: 'create `params.button`', key: 'create `params.key` (off unless the game leaves that key free)'
  },
  steps: [
    ['The canvas the game draws on (the one the CSS stretches)',
      'Note its element and its `width`/`height` attributes (the native size, e.g. 256x224). Never change them, the context transform or `imageSmoothingEnabled`.'],
    ['Once, after the canvas is in the page (below the game script)',
      '`scaler = GameDNA_PixelScaler.create({canvas, native: {w, h}, params: {mode: \'{{mode}}\', border: \'{{border}}\', color: \'{{color}}\', pad: {{pad}}, crt: \'{{crt}}\', scanlines: {{scanlines}}, fill: \'{{fill}}\', align: \'{{align}}\', maxScale: {{maxScale}}, button: \'{{button}}\', key: \'{{key}}\'}}); scaler.apply();`. The module wraps the canvas in one `div` and overrides the stretching CSS with inline `!important` styles; leave the CSS rules, delete only a JS resize handler\'s write to `canvas.style.width/height`.'],
    ['Every pointer, mouse and touch handler that turns a client position into game coordinates (grep clientX, offsetX, pageX, touches, getBoundingClientRect)',
      'Keep a mapping that computes `(clientX - rect.left) * W / rect.width` from the canvas\'s own `getBoundingClientRect()` (it stays exact). Replace any other (offsetX, a fixed or stored scale, window size) with `const p = scaler.toGame(e)`; use `p.x`, `p.y` in native pixels; handlers on window/document ignore `!p.inside`.'],
    ['Other elements that draw DOM over the canvas (if any)', 'Position them with `scaler.fromGame(x, y)` or inside the canvas; re-place them in `onLayout`.']
  ],
  gotchas: [
    'Unsure whether "keep native resolution and integer scaling as they are" forbids this -> it does not: this element IS the scaling; it replaces only the CSS stretch and keeps the native canvas size.',
    'Pixels still blurry or 1-2 px uneven -> another style keeps resizing the canvas (a JS resize handler or a transform on a parent); delete that write; `scale().fought` counts the fights.',
    'Taps land a few tiles off -> a handler maps with offsetX or a stored scale; use `scaler.toGame(e)`.',
    'Game tiny on a 500 px window -> the whole-number scale is 1 there; `mode: \'fit\'` allows a non-integer step on phone-sized windows only.',
    'Help text below the game disappears -> `fill: \'page\'` keeps it on screen (`auto` drops it only when it would cost a whole scale step).',
    'A key stopped working in the game -> `key` is set to a key the game uses; set it to `off`.',
    'Nothing changes on screen -> `apply()` never ran, or ran before the canvas existed.',
    'Canvas cleared or reset after integration -> something now writes `canvas.width`; remove it (the module never does).'
  ],
  checks: [
    'At 1280x900 and 500 px wide, every game pixel is an exact n x n device-pixel square (no blur, no 1/2 px mix) and the game is centred with an even border; no sideways scroll.',
    'A click or tap on a tile, button or menu item selects that exact one; a tap in the border does nothing.',
    '`?auto=1` reaches the same end as before; `?t=&freeze=1` shows the same frame, now crisp.'
  ],
  selfcheck: [
    'Diff: only additions (plus at most one deleted style write); no write to `canvas.width/height`, `setTransform`, `ctx.scale`, loops, timers or URL parameters.',
    'List every pointer mapping: "kept (rect ratio)" or "now toGame".'
  ],
  offers: {
    'pointer': 'Map every click and tap with `scaler.toGame(e)` (native pixels, `inside` flag).'
  }
};

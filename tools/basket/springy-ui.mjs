// Basket hint for C-10 springy-ui: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'ui',
  does: 'The windows, menus, toasts and numbers the game already draws get motion: panels pop (or slide, or unfold on pixel canvases) open with a small overshoot and close faster, rows slide in one after another, the highlight or pointer glides between rows on a spring and the selected row lifts, numbers roll, a backdrop dim fades under modal windows. The game keeps drawing every window at its final rect and keeps all its menu logic; the integration only wraps draw calls. The module never reads or delays input and runs on its own step clock, so autoplay and frozen screenshots stay exact.',
  params: {
    open: 'create `params.open` (ms)', close: 'create `params.close` (ms, shorter than open)', bounce: 'create `params.bounce` (overshoot 0..0.4)',
    style: 'create `params.style` (auto = pop on smooth canvases, unfold on pixel canvases)', stagger: 'create `params.stagger` (ms between rows)',
    glide: 'create `params.glide` (ms)', lift: 'create `params.lift` (px; 1 on low-resolution pixel games)', dim: 'create `params.dim`',
    count: 'create `params.count` (ms)', reduced: 'create `params.reduced`'
  },
  steps: [
    ['Once, before the first render',
      '`ui = GameDNA_SpringyUI.create({view: {x: 0, y: 0, w: <screen width>, h: <screen height>}, params: {open: {{open}}, close: {{close}}, bounce: {{bounce}}, style: \'{{style}}\', stagger: {{stagger}}, glide: {{glide}}, lift: {{lift}}, dim: {{dim}}, count: {{count}}, reduced: \'{{reduced}}\'}})`. `view` is in the units the draw code uses (the logical size when the game scales with `setTransform`).'],
    ['The fixed update step (every scene; the step `?t=` fast-forward and `?auto=1` run)', '`ui.update(<step ms>)` once per step. It returns nothing to wait for.'],
    ['Every place a window, menu, text box, popup or toast is drawn',
      'Wrap the existing draw code: `ui.window(ctx, <stable id>, <its real rect {x, y, w, h}>, () => { <existing draw> }, {selected: <cursor index>, dim: <true for modal menus only, not dialogue or HUD>})`. Windows open together need different ids; a full-screen dim drawn in the same function stays outside.'],
    ['Inside each list window', 'Draw the highlight or pointer once, before the rows, at `ui.glide(<id>, <rect of the selected row>)`; wrap each row: `ui.row(ctx, <id>, k, () => { <existing row draw> }, rowRect)`. Target cursors over units: `ui.glide(\'target\', <cursor rect>)`.'],
    ['Numbers on screen (gold, HP, MP, score)', 'Print `ui.count(<key>, value)` instead of `value`; the real value is never changed.'],
    ['Where game logic opens and closes windows', '`ui.open(<id>)` / `ui.close(<id>)` (optional: makes `?t=` frames exact mid-animation). Close the game state at once as before.'],
    ['The end of EVERY render path (title, play, results, early returns)', '`ui.draw(ctx)` last: it plays windows that stopped being drawn.']
  ],
  gotchas: [
    'A confirm pressed while a window opens does nothing -> something ignores or queues input while the module animates; input must never wait for motion.',
    'A closed window still takes key presses for a moment -> game state was kept open until the animation ended; close it at once, the module animates a copy.',
    'Windows never animate -> `update` is not called in the fixed step, or the window id changes every frame.',
    'Windows vanish instead of closing -> `draw(ctx)` is missing on that render path.',
    'The whole screen zooms with a window -> the scene or a full-screen dim is inside the wrapped function.',
    'The highlight jumps or paints over the row above -> one `glide` key per window, drawn once before the rows.',
    'Blurry pixel windows while opening -> `style` forced to pop on a pixel canvas; keep `auto` or `unfold`.',
    'An HD or vector game\'s windows unfold (a clip that slices text) instead of popping -> smoothing was turned off for the whole canvas, so `auto` sees a pixel canvas; add `pixel: \'off\'` to `params` when the art is not pixel art.',
    'A dark hole or stale pixels flash where a fixed panel unfolds -> the always-visible panel frame is inside `ui.window`; keep the fixed frame outside and wrap only the window that opens on it (or the panel\'s contents).',
    'Windows drawn by another module that animates its own (e.g. C-01 bevelled windows) -> leave them unwrapped; wrap only the game\'s own windows.'
  ],
  checks: [
    'A menu opens with a small overshoot, its rows sliding in one after another; it closes faster than it opened; modal windows fade a backdrop dim.',
    'Moving the cursor: the highlight or pointer glides to the new row, which lifts slightly; numbers roll when they change.',
    'Pressing confirm the instant a window appears does what it did before; `?auto=1` ends exactly as before; `?t=...&freeze=1` gives the same frame every run.'
  ],
  selfcheck: [
    '`ui.update` runs in the fixed step on every scene; `ui.draw(ctx)` is the last call of every render path.',
    'Every window is wrapped once per render with its real rect and a stable id; no game logic or state change moved into a wrapped function; nothing reads `ui.state()` / `ui.debug()` to gate input.',
    'Walk one open with the defaults: opaque by ~90 ms, overshoot to ~1.02 scale, settled at {{open}} ms; row k starts at k x {{stagger}} ms; a close takes {{close}} ms.'
  ],
  offers: {
    'ui-rects': { title: 'windows', text: 'Wrapped windows keep their final rects: pass the same rects to the other element\'s UI rects; nothing moves outside them except for a few pixels during the open overshoot.' }
  },
  wants: {
    'battle-start': { title: 'reset', text: 'Optionally call `ui.clear()` there, when no closing animation should carry across the scene change (otherwise windows close by themselves).' },
    'ui-rects': { title: 'other windows', text: 'Windows the other element draws itself (dialogue boxes, shops, level-up panels) can be wrapped with `ui.window` too when that element exposes their draw call; leave them alone when it animates them already.' }
  }
};

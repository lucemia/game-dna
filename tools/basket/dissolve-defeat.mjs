// Basket hint for E-03 dissolve-defeat: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'effects',
  does: 'A defeated unit that leaves the field blinks white, then dissolves from a snapshot of its sprite (dither fade, slice wipe, crumble with gravity, or flash-out) in about 0.5-1 s. The game removes the unit on the defeat frame; nothing waits for the effect.',
  params: {
    variant: 'create `params.variant`', duration: 'create `params.duration` (ms)', flash: 'create `params.flash` (ms, 0 = none)',
    edge: 'create `params.edge`', chunk: 'create `params.chunk` (crumble only)', spill: 'create `params.spill` (px outside the unit rect)'
  },
  steps: [
    ['Once, after the screen size exists and BEFORE any reset code that will call `clear()` first runs',
      '`dd = GameDNA_DissolveDefeat.create({view: {x: 0, y: 0, w: <field width>, h: <field height above the HUD>}, params: {variant: \'{{variant}}\', duration: {{duration}}, flash: {{flash}}, edge: \'{{edge}}\', chunk: {{chunk}}, spill: {{spill}}}, uiRects: () => <rects of banners/windows on screen now>})`.'],
    ['Every place HP can reach 0 (attacks, spells, counters, poison ticks); ideally the one shared HP function. Grep every write to HP',
      'Note `wasAlive = hp > 0` before the change; after it, if `wasAlive && hp === 0` and the unit leaves the field: `dd.defeat(unit.id, {rect: {x, y, w, h}, image: <sprite image drawn now>, flipX: <drawn mirrored?>})`. The rect is where that image is drawn this frame (same rounding, hover, bob; no hit shake or lunge). Sprites drawn by code: `drawSprite: ctx => <draw the unit on this ctx at its screen position>` instead of `image`. Units that stay down on the field (revivable heroes) are left alone.'],
    ['The unit draw code', 'Skip dissolved units from the defeat frame on; turn off their built-in death fade/blink (keep its counters if other code reads them).'],
    ['Your fixed update step, every step (also banners, menus, end screen)', '`dd.update(<step in ms>)`; `0` while the world is frozen.'],
    ['Your draw pass', '`dd.draw(ctx)` after the units, before hit effects, banners and HUD, inside any shake translate.'],
    ['Where a battle, wave or level STARTS or restarts', '`dd.clear()`.']
  ],
  gotchas: [
    'The old sprite still fades on top of the dissolve -> the built-in death fade is still drawing; skip the unit in its draw code.',
    'Dissolve a few px off or mirrored -> the rect/flip must match how the image is drawn this frame.',
    'Nothing shows and the console says the snapshot is empty -> `drawSprite` drew on the screen context, not on its `ctx` argument.',
    'The victory screen comes later, or autoplay ends differently -> the end-of-battle check must not wait for the effect.',
    'Dissolve freezes during banners or the end screen -> `update` runs every step, not only in battle phases.',
    '"Cannot access before initialization" on load -> a reset function calls `clear()` before the instance is created; create it earlier.'
  ],
  checks: [
    'A defeated enemy blinks white, then dissolves at its exact spot in about {{duration}} ms; its old sprite and old fade never show alongside.',
    'Nothing is drawn on neighbours, outside the field or over the HUD; `?auto=1` ends exactly as before, with no console errors.'
  ],
  selfcheck: [
    'List every HP write that can reach 0 and its `dd.defeat`; trace one kill: HP 0 -> `defeat` with the drawn rect -> unit not drawn -> `update` every step -> `draw` every frame.',
    '`dd` exists before the first `defeat` or `clear`; the end-of-battle condition and every caller (autoplay, freeze replay, keys, restart) are unchanged.'
  ],
  addon: {
    builtin: 'deathFade',
    steps: [
      ['Create', 'In the addon object, create `dd` once: `GameDNA_DissolveDefeat.create({view, params: {variant: \'{{variant}}\', duration: {{duration}}, flash: {{flash}}, edge: \'{{edge}}\', chunk: {{chunk}}, spill: {{spill}}}, uiRects})`; `view` is {{sys.field}}, `uiRects` returns the rects from {{sys.rects}}.'],
      ['Hit', '{{sys.hit}}. When an event leaves its target at HP 0 and the target leaves the field, call `dd.defeat(id, {rect, image | drawSprite})` with the sprite rect drawn now ({{sys.anchor}}), then stop drawing that unit.'],
      ['Clock', '{{sys.clock}}: `dd.update(<step ms>)`, `0` while frozen.'],
      ['Draw', '{{sys.draw}}: `dd.draw(<that context>)` after the units.'],
      ['Reset', '{{sys.reset}}: `dd.clear()`.']
    ],
    gotchas: ['The unit fades twice -> the starter\'s built-in death fade is still on.'],
    checks: ['Every defeated enemy dissolves at its spot; the battle ends on the same frame as before.'],
    selfcheck: ['Trace one kill: hit site -> HP 0 -> `dd.defeat` -> unit hidden -> `update` -> `draw`.'],
    with: {}
  },
  wants: {
    'hit-site': { title: 'hit sites', text: 'Where HP reaches 0 there, call `dd.defeat` with the sprite rect drawn now, then stop drawing the unit.', check: 'Every kill from either side that removes a unit shows one dissolve at its spot.' },
    'freeze': { title: 'hit-stop', text: 'Pass `0` to `dd.update` while the world is frozen, so the dissolve holds with the world.', check: 'During a hit-stop the dissolve holds still.' },
    'ui-rects': { title: 'UI rects', text: 'Return them from `uiRects()`; `view` ends above the HUD.', check: 'No dissolve pixel covers the other element\'s windows or HUD.' },
    'battle-start': { title: 'reset', text: 'Call `dd.clear()` there.' }
  }
};

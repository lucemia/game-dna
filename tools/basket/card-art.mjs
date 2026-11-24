// Basket hint for L-07 card-art: painted 2:3 card illustrations for the G-07 upgrade draft (and a code-drawn card frame).
// The basket ships the module; the images come either from the element's pack (assets/assets.json + assets/cards/*.webp,
// the "pack" layer; combine.mjs does not copy images, add them as extra files) or from the designer's own set made with
// prompt.md + assets/prompts/templates.md + tools/cardset.py (the "regenerate" layer).
// element.json requires upgrade-draft, so G-07's module and section come first in the combo.
export default {
  stage: 'ui',
  does: 'Painted card illustrations (pre-generated 2:3 image files, one per upgrade theme) inside the G-07 upgrade-draft cards: `cardArt.drawDraft(ctx, draft)` replaces `draft.draw(ctx)` and paints each card face full-bleed under G-07\'s own chip, name, tags and text; G-07 itself is unchanged. Also `drawCard(ctx, {title, cost, type, text, rarity, art}, {x, y, w})`, a code-drawn card frame with live text, for hands and reward screens. The game never calls an image generator.',
  params: {
    shade: 'create `params.shade` (darkness under G-07\'s text)', focusY: 'create `params.focusY` (subject centre in the art)',
    textMin: 'create `params.textMin` (drawCard only)', sheen: 'create `params.sheen`'
  },
  steps: [
    ['Read first: the upgrade table, every `draft.draw(` call and its transform, the boot (first step, the `?t=` fast-forward, the first animation frame), restart',
      'Each upgrade gets the picture that shows what it does: `art: \'<key>\'`, or a first tag that is a key. Pack keys: `blade` sword, `fire` brazier flame, `frost` ice crystals, `storm` lightning rod, `guard` round shield, `heart` glowing heart-shaped seed pod, `speed` winged boots, `gold` coin pouch, `magic` glowing book, `luck` clover charm, `poison` green flask, `light` golden feather, `crit` eye amulet, `arrow` bow and arrows, `regen` sprout in a pot. Never change names, texts, rarities or deltas.'],
    ['After the draft is created (a NEW top-level name: grep it first)',
      '`const cardArt = GameDNA_CardArt.create({src: \'cards/{key}.webp\', upgrades: <the same table>, params: {shade: {{shade}}, focusY: {{focusY}}}})`.'],
    ['Every `draft.draw(ctx…)` in the draw pass', 'Becomes `cardArt.drawDraft(ctx, draft…)`: same place, same arguments after `ctx`, same transform. No second `draft.draw` in the frame.'],
    ['The boot', 'Replace the old boot call with `cardArt.onReady(boot)` (boot = the old start code, unchanged). If another asset element already gates the boot, chain them: `por.onReady(() => cardArt.onReady(boot))`.']
  ],
  gotchas: [
    'Cards still show G-07\'s round icons -> a `draft.draw(` is left in the frame, or no upgrade resolves to a key (give `art`).',
    'Frozen shots (`?t=&freeze=1`) without art -> the boot still runs directly; boot only from `cardArt.onReady(boot)`.',
    'Ghost or doubled cards -> both `draft.draw` and `drawDraft` run; keep only `drawDraft`.',
    'Pixel cards (a field under 300 px tall) have no art: generated art is for HD looks; that is expected.',
    'The hero stops after a draft until the key is pressed again -> the game\'s held movement keys were cleared when the draft opened or closed; leave them alone.',
    '`Identifier ... has already been declared` -> the game already has that name; pick a new one.'
  ],
  checks: [
    'Every dealt upgrade card shows its painting under G-07\'s chip, name, tags and text; the text stays readable; flip, tilt, dim and pick look as before.',
    '`?t=<ms>&freeze=1` with a draft open is identical twice and already shows the art; `?auto=1` ends as before with no console errors.'
  ],
  selfcheck: [
    'Modules byte-identical (card-art.js after upgrade-draft.js), loaded before the game script; every `cards/<key>.webp` used exists.',
    'Grep `draft.draw(`: none left, `drawDraft(` in its place; the old boot runs only from `onReady`; list each upgrade with its art key.'
  ],
  wants: {
    'battle-start': { title: 'reset', text: 'Nothing to reset: the art instance lives for the whole game (never re-create it at a level start).' }
  }
};

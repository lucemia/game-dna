# card-art.js (L-07 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_CardArt`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It shows **painted 2:3 card illustrations** (image files generated once at build time; the game never calls an image generator) in two places:

- **inside a G-07 upgrade draft** (`GameDNA_UpgradeDraft`, unchanged): `art.drawDraft(ctx, draft)` replaces `draft.draw(ctx)` and paints each HD card's illustration full-bleed under G-07's own rarity chip, stack pips, name, tags, rules text, stat preview and synergy ribbon (the medallion icon is left out where art is shown). Back faces, the flip squeeze, the deal/pick motion, the dim on unselected cards, the owned strip and the pixel look stay exactly as G-07 draws them.
- **in a card frame drawn in code**: `art.drawCard(ctx, card, rect)` draws a brass frame, cost gem, title plate, type line and rules text (live text, never baked into the image) around the art. For card-battle hands (A-10), shops and reward screens.

## The art (safe area)

Every illustration is 2:3, opaque, light from the top-left, no text. The subject sits in the upper part (centre at about 28 % of the height, inside x 15-85 %, y 4-55 %); the lower ~45 % is calm, darker background because text panels lie over it. Shipped pack (`assets.json`, 15 WebP files, 360x540, 239 KB): one per G-07 tag, keyed by the tag name:

| key | subject | key | subject |
|---|---|---|---|
| `blade` | leaf-bladed short sword | `magic` | open glowing book with a violet star |
| `fire` | brazier with a curling flame | `luck` | clover charm under glass |
| `frost` | ice crystals on a frosted stone | `poison` | flask of bubbling green liquid |
| `storm` | brass rod struck by lightning | `light` | golden feather in a beam of light |
| `guard` | round oak shield with a brass boss | `crit` | eye-shaped amulet with a red gem |
| `heart` | glowing heart-shaped seed pod in roots | `arrow` | short bow and three arrows |
| `speed` | winged leather boots | `regen` | sprout in a cracked clay pot |
| `gold` | coin pouch spilling coins | | |

## Which art a card gets

`keyFor(cardOrUpgrade)` (first match wins): `options.map[id]` → the entry's own `art` field (`art: false` = none) → `options.artFor(entry)` → its `id` → its `tags` (in order) and `icon` → words of its id and name. Each word may be a pack key or a common synonym (`sword`, `atk` → `blade`; `shield`, `def`, `armor` → `guard`; `hp`, `vitality` → `heart`; `haste` → `speed`; `coin`, `magnet` → `gold`; `heal`, `lifesteal` → `regen`; `dodge` → `luck`; `ice` → `frost`; `lightning` → `storm`; `revive` → `light`; full list in `GameDNA_CardArt.ALIASES`). No match = no art (G-07 keeps its medallion icon for that card). Give an upgrade `art: '<key>'` when its tags do not say what it is.

## API

`GameDNA_CardArt.create(options)` returns an instance; every image starts loading at once.

| option | meaning |
|---|---|
| `src` + `keys` | URL pattern with `{key}` (e.g. `'cards/{key}.webp'`) and the keys that exist (default `GameDNA_CardArt.PACK_KEYS`, the 15 above). |
| `art` | `{key: url \| HTMLImageElement \| canvas}`: explicit files (your own set, extra keys). |
| `manifest`, `base` | A pack manifest object (`assets.json`, entries with `role: "card"`) instead of `src`; `base` = URL prefix for relative files. |
| `upgrades` (or `cards`) | The same table you give G-07 (read for `art` fields, tags and names). |
| `map`, `artFor(entry)` | `{id: key}` overrides; a function returning a key, or `null` for none. |
| `skin` | Optional skin id (needs `skin-api.js`): a smooth skin's UI font is used in the frame. |
| `params` | `focusY` 0.28 (subject centre in the art), `shade` 0.9 (how dark the lower card gets under G-07's text), `textMin` 5.2 (smallest rules-text size, card units), `sheen` `'on'` (one diagonal sweep every 4 s on rare and better: in a draft 2.0-3.8 s after it opens; in `drawCard` while `opts.t mod 4000` is 2000-3800). |

| method | |
|---|---|
| `onReady(fn)` / `ready()` / `status()` | `fn(art)` once every image has loaded or failed. **Boot the game from it** so `?t=&freeze=1` stills include the art. `status()` = `{ready, art: {key: 'ok' \| 'failed' \| 'loading'}}`. |
| `drawDraft(ctx, draft, ox, oy)` | Call **instead of** `draft.draw(ctx, ox, oy)`, in the same place and transform. While the draft is closed, or without art, it is exactly `draft.draw`. |
| `drawCard(ctx, card, {x, y, w}, opts)` → layout | `card = {id, title, cost, type, text, rarity, art}`; `rarity` `common` / `rare` / `epic` / `legendary`; `*6*` in `text` = a value in gold; `opts = {selected, dim (0-1), faceDown, t (game ms, for the sheen)}`. Height is `1.5 w`. Rules text is 7.2 u (u = w / 100) shrinking to `textMin`: a card at least 150 CSS px wide keeps it >= 10.8 CSS px, so on phones draw fewer, larger cards (the demo shows 4 around the lifted one). Draw under your own `translate/rotate/scale` for fans and lifts. Returns `{u, card, art, cost, title, type, text, boxes}` (rects of the drawn text). |
| `drawBack(ctx, rect)`, `drawArt(ctx, key, rect, {radius, focusY, alpha})` | A code-drawn card back; one illustration cover-fitted into any rect (shop slots, tooltips). |
| `layout(rect)`, `keyFor(entry)`, `has(key)`, `image(key)`, `keys()`, `add(key, src)` | Geometry of a card; the art lookup; loaded images. |
| `beginFrame()`, `lastDrawn()`, `stats()` | `lastDrawn()` = the draft cards painted by the last `drawDraft` (`kind: 'draft-card'`, id, key, rect) and the newest `drawCard` rect per card id (`beginFrame()` clears them). `stats()` counts faces, faces with art, `noArt`, `notLoaded`, `mismatch` (must be 0). |
| `setParams(p)`, `params()`, `useSkin(GameDNA_Skin)` | Live params; registers each image as a skin bitmap (role `card`). |

Static: `GameDNA_CardArt.PACK_KEYS`, `ALIASES`, `layout(rect)`, `fromManifest(json, {base})` → `{key: url}`, `drawFrame(ctx, img, card, rect, opts)`.

## Integration with G-07 (15 lines)

```js
// <script src="upgrade-draft.js"></script><script src="card-art.js"></script> before your game script
const UPGRADES = [ /* your G-07 table; tags name the art: */ { id: 'oak-skin', name: 'Oak Skin', rarity: 'common', tags: ['guard'], text: '+{value} DEF', delta: { def: 2 } },
  { id: 'hasty', name: 'Quickstep', rarity: 'rare', tags: ['speed'], art: 'speed', text: '+{value}% speed', delta: { spd: 8 } } ];
const draft = GameDNA_UpgradeDraft.create({ upgrades: UPGRADES, /* existing G-07 options */ });
const cardArt = GameDNA_CardArt.create({ src: 'cards/{key}.webp', upgrades: UPGRADES });
cardArt.onReady(boot);                       // was: boot();  (images loaded first, so frozen frames are complete)
function render() {
  /* world, HUD */
  cardArt.drawDraft(ctx, draft);              // was: draft.draw(ctx);  same place, same transform
}
// a card game's hand or a reward screen:
cardArt.drawCard(ctx, { title: 'Cleave', cost: 1, type: 'Attack', text: 'Deal *6* damage.', rarity: 'common', art: 'blade' }, { x: 40, y: 200, w: 120 });
```

## Keep the game's other callers working

- **Boot**: every former caller of the boot (the first step, the `?t=` fast-forward loop, the first `requestAnimationFrame`) now runs once, from `onReady`. A failed image does not block it (that card just has no art).
- **One draw call changes**: every `draft.draw(` in the game becomes `cardArt.drawDraft(ctx, draft, …)` with the same arguments. Nothing else of G-07's wiring changes (open, update, key, press, pointer, busy gate, reset).
- **Never draw the draft twice**: `drawDraft` already draws it; keep no second `draft.draw` in the frame.
- The game's own art, stats and rules are untouched: the module only draws.

## Self-check without a browser

1. `card-art.js` is byte-identical to the one given and loaded after `upgrade-draft.js`, before the game script.
2. `grep draft.draw` (or the draft's name) finds no call left; `drawDraft(` appears where it was.
3. Every upgrade in the table resolves to a pack key: its `art`, id or a tag is one of the 15 keys (or a synonym); list them in your notes.
4. Every `src` file exists (`cards/<key>.webp` for each key you use).
5. The boot runs only from `onReady`.

## What it guarantees

- G-07's files and behaviour are unchanged: same hands, picks, timings, input, layout rects; the art follows each card's deal, flip squeeze, tilt, lift, dim and fly-out because it is painted inside G-07's own card transform.
- Deterministic: drawing depends only on the draft's state and game time (no wall clock, no `Math.random`).
- Never throws from `drawDraft` / `drawCard`; if the bridge fails it falls back to plain `draft.draw` (counted in `stats().fallbacks`).
- Cost: G-07's draw runs twice per frame while a draft is open (a dry pass into a no-op context that only records which card each face is, then the real pass). Measured (`checks/cost.py`, headless software canvas 1280x720, machine load ~8): plain `draft.draw` 13.4 ms, `drawDraft` 9.7 ms; the dry pass costs less than the medallion shadows it skips. Nothing runs while no draft is open.
- Tied to G-07 v1.0.0's HD card drawing order (rarity chip measured with weight 800, medallion starting with a radial gradient, name drawn with a 0.45 black shadow). `stats().mismatch` > 0 or `withArt` 0 with art loaded means a G-07 version that draws differently.

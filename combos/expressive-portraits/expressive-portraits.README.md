# expressive-portraits.js (D-04 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_Portraits`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns the whole element: it builds bust portraits (head, skin, eyes, brows, mouth, hair, ears, headgear, marks, collar) from a small seeded spec at native pixel size (48×48 or 64×64), with 5-step shaded ramps and a 1 px outline; seven expressions that change only the brows, eyes and mouth; blink and talking-mouth frames; a framed panel with a backdrop; slide / fade enter and exit; and a presenter that shows the speaker's portrait beside an H-01 dialogue box (`GameDNA_DialogueBox`) through that box's public hooks only.

If `skins/skin-api.js` (and a skin such as `pixel16.js`) is loaded before it, the panel frame is drawn with `GameDNA_Skin.resolve(skin).frame()` and the outline colour comes from the skin (`outline.sprite.color`, else `ink`); without it, a built-in 16-bit frame and `#06061a` are used. Portrait pixels are always drawn at whole native pixels with smoothing off.

## Portrait spec (the designer edits this)

A plain object; every field is optional. Missing parts are picked from `seed` (or from `name` when there is no seed), weighted so faces stay plausible (elders grey, children without beards, ...). The same spec always gives the same face.

```js
{ name: 'Mira', seed: 77, age: 'young', gender: 'female', skin: 'fair', head: 'heart', hair: 'long', hairColor: 'auburn',
  eyes: 'almond', eyeColor: 'green', brows: 'arched', nose: 'button', mouth: 'full', ears: 'round', facial: 'none',
  headgear: 'circlet', mark: 'freckles', collar: 'cloak', cloth: 'forest', trim: 'cream', bg: 'moss', side: 'left' }
```

| field | values |
|---|---|
| `age` | child, young, adult, elder |
| `gender` | female, male, any (jaw, lashes, brows, facial hair defaults) |
| `skin` | pale, fair, tan, bronze, brown, deep, or `#rrggbb` |
| `head` | oval, round, square, heart, long |
| `hair` | crop, swept, bangs, long, spiky, curly, ponytail, braid, wavy, bald |
| `hairColor` | black, darkbrown, brown, auburn, ginger, blonde, platinum, grey, teal, violet, rose, blue, or `#rrggbb` |
| `eyes`, `eyeColor` | round, almond, large, narrow, heavy · brown, hazel, green, blue, grey, amber, violet |
| `brows`, `nose`, `mouth`, `ears` | thin, thick, arched · button, straight, broad · small, wide, full · round, pointed |
| `facial` | none, stubble, moustache, beard, goatee |
| `headgear` | none, hood, helmet, circlet, headband (`hood: 'cloth' \| 'trim'`, `metal: 'steel' \| 'gold' \| 'bronze'`, `gem: 'ruby' \| 'sapphire' \| 'emerald'`) |
| `mark` | none, scar, freckles, earring, eyepatch, blush |
| `collar`, `cloth`, `trim` | tunic, robe, armor, cloak, scarf, vest · crimson, navy, forest, plum, ochre, teal, slate, umber, cream, charcoal, ivory, rust, moss, sky, or `#rrggbb` |
| `bg` | panel backdrop: dusk, moss, ember, sea, plum, sand, slate, rose, or `#rrggbb` |
| `side` | presenter only: `left` / `right` for this character |

`GameDNA_Portraits.PARTS` lists every option; `randomSpec(seed, keep, locks)` makes a new spec that copies the `locks` parts from `keep` (a generator with locked parts).

## Dialogue lines

The H-01 line objects take three optional fields; any other field is ignored:

| field | meaning |
|---|---|
| `expr` | `neutral` (default), `happy`, `angry`, `sad`, `surprised`, `determined`, `hurt`. Set per line; the face changes when the line starts. |
| `portrait` | cast key when it differs from `who` / `speaker` (default: `who` if the cast has it, else `speaker`; case-insensitive). |
| `side` | `left` / `right` for this line (default: the cast entry's `side`, else the `layout` param). |

A line without a cast portrait (narration) shows no portrait; every portrait on screen dims with its mouth closed (`listener: 'dim'`) or leaves (`'hide'`).

## API

**Art (no state):**

| call | |
|---|---|
| `make(spec, {size, outline})` → portrait | Builds once (a few ms); keep it. `size` 48 (default) or 64. `outline` `'ink'` / `'soft'` (darker version of the neighbouring colour). `portrait.spec` is the resolved spec. |
| `draw(ctx, p, x, y, opts)` | Draws the bare portrait (transparent background) with its top-left at whole native px. `opts`: `expr`, `talking` (bool), `mouth` (0 closed / 1 half / 2 open, overrides `talking`), `blink` (`'open' \| 'half' \| 'closed'`, `true` = closed, `false` = never), `t` (ms on YOUR clock: drives blink and the talking mouth), `blinkMs`, `mouthMs`, `flip`, `alpha`, `dim`, `skin`, `outline` (colour). Never throws. |
| `drawPanel(ctx, p, {x, y}, opts)` → rect | Frame (through the skin) + backdrop + portrait, size `panelSize(size, frame)` = size + 8 (48 → 56 px). Extra `opts`: `frame` (`window` / `plate` / `none`), `backdrop` (`tint` / `skin` / `none`), `team`, `focus`. Use it for character select, status and shop screens. |
| `blinkAt(p, t, every)`, `mouthAt(t, every)`, `transition(kind, k, dir, dist)` | Pure helpers: the blink frame at time `t`, the talking mouth at `t`, and `{dx, alpha}` for an enter/exit at progress `k` (0..1). |

**Presenter (portraits beside the dialogue box):** `GameDNA_Portraits.create(options)` returns an instance.

| option | meaning |
|---|---|
| `cast` | `{ Name: spec \| portrait }`, keys matched to `portrait` / `who` / `speaker` case-insensitively. |
| `getPortrait(key, line)` | Optional: return a spec or portrait for keys not in `cast` (or null). |
| `bounds` | The same play field you give the dialogue box (`{x, y, w, h}` or a function). |
| `uiRects()` | Optional: HUD / menu rects the panel must not cover. |
| `skin` | Skin id or object; default `pixel16`; `false` = built-in look. |
| `params` | `size` 48, `frame` `'window'`, `layout` `'left'` (`'right'`, `'two'`: first speaker left, the next right), `enter` `'slide'` (`'fade'`, `'none'`), `enterMs` 160, `listener` `'dim'` (`'hide'`), `blinkMs` 3600 (0 = off), `mouthMs` 90, `gap` 4, `margin` 6, `outline` `'ink'`, `backdrop` `'tint'`. |

| method | |
|---|---|
| `onLine(line, index, ctl)` | Pass it as the dialogue box's `create({onLine})` (wrap it if you already use that hook). Sets speaker, side and expression before the box lays the line out. |
| `reserve(field)` → field | Use as the dialogue box's `bounds: () => por.reserve(FIELD)`: while a conversation with portraits runs, it returns the field minus a column (`size + 8 + gap` px) on the portrait side, so the box sits beside the portrait. Outside conversations it returns the field unchanged. |
| `attach(dlg)` | Reads `dlg.state()` (typing → the mouth moves; closing → portraits leave) and `dlg.rect()` (where the panel goes). |
| `update(dtMs)` | Every fixed step, **also while the box is busy**. The only clock (blink, mouth, enter/exit). |
| `draw(ctx)` | After `dlg.draw(ctx)`, outside any shake translate. Never throws. |
| `show(key, {side, expr})`, `expr(side, e)`, `talk(side, on)`, `hide(side?)`, `clear()` | Without a dialogue box (cutscenes, menus). `clear()` on restart. |
| `rects()`, `state()`, `lastDrawn()`, `portrait(key)`, `setParams(p)`, `params()` | Panel rects on screen (for other overlays), `{clock, left, right, leaving, plan}`, drawn rects with expr/mouth/alpha for tests, the cached portrait of a key. |

**Placement.** Beside the box on its side, bottom-aligned when the box is in the lower half (the panel rises 10 px above a 3-row box), top-aligned when the box is at the top. If that spot leaves the field, touches a UI rect or the box (e.g. `reserve` was not used), it sits on top of the box's edge instead (below it for a top box). It never moves to the screen centre.

## Integration (15 lines)

```js
// <script src="dialogue-box.js"></script><script src="expressive-portraits.js"></script> before your game script
const FIELD = { x: 0, y: FIELD_TOP, w: SCREEN_W, h: FIELD_H };
const por = GameDNA_Portraits.create({ bounds: FIELD, uiRects: () => [hudRect], params: { size: 48, layout: 'left' },
  cast: { Elder: { seed: 3, age: 'elder', hair: 'bald', facial: 'beard' }, Mira: { seed: 77, hair: 'long' } } });
const dlg = GameDNA_DialogueBox.create({ /* your existing options */ bounds: () => por.reserve(FIELD),
  onLine: (line, i, ctl) => por.onLine(line, i, ctl) });                    // keep any old onLine: call both
por.attach(dlg);
// lines gain an optional expr: { speaker: 'Mira', expr: 'angry', text: 'Who rang the bell?' }
function step(dt) {
  if (dlg.busy()) { /* existing: press / hold */ dlg.update(dt); por.update(dt); return; }
  /* existing update */ dlg.update(dt); por.update(dt);
}
function render() { /* world, HUD */ dlg.draw(ctx); por.draw(ctx); }
function newGame() { dlg.clear(); por.clear(); /* existing */ }
// a status screen: GameDNA_Portraits.drawPanel(ctx, por.portrait('Mira'), { x: 8, y: 8 }, { expr: 'happy', t: myClockMs });
```

## Keep the game's other callers working

- **One clock**: `por.update` goes next to every `dlg.update` (the busy branch and the normal one), inside the fixed step that the animation loop, `?t=&freeze=1` fast-forward and autoplay all call. Never drive it from `requestAnimationFrame` time.
- **Autoplay** needs nothing: the presenter follows the box; `?auto=1` ends exactly as before (portraits never take input).
- **The old `onLine`** (a per-open `opts.onLine`, a dialog index tracker) stays; `create({onLine})` is a separate hook. If you already pass `create({onLine})`, call both.
- **`bounds`**: replace the box's static `bounds` with `() => por.reserve(FIELD)`, nothing else. Keep the box's `getAnchor`, `uiRects`, `autoplay`.
- **Restart / new game / scene change**: `por.clear()` next to `dlg.clear()`.
- **Status / select screens**: call `drawPanel` with your own clock in `t` (frame count × 1000 / 60), so frozen shots stay identical.

## Self-check without a browser

1. The module file is byte-identical to the one you were given and is loaded before the game script (its order relative to `dialogue-box.js` does not matter).
2. `por.update(` appears next to every `dlg.update(`; `por.draw(` right after `dlg.draw(`; `por.clear(` next to every `dlg.clear(`.
3. The box's `bounds` is `() => por.reserve(<the old field>)` and its `onLine` calls `por.onLine(line, i, ctl)`.
4. Every `speaker` / `who` in your lines that should have a face has a `cast` key; `expr` values are one of the seven names.
5. Walk one line: `open()` → `onLine` (sets the face and reserves the column) → the box lays out beside it → typing: `state().stage === 'type'`, the mouth cycles every `mouthMs` → page complete: mouth closed, blinking continues → close: the panel slides out over `0.75 × enterMs`.

## What it guarantees

- Same calls, same frames: portraits, blink and mouth depend only on the spec and `update(dt)` (or the `t` you pass), never on wall time or `Math.random`.
- `make` is deterministic; frames are cached per (expression, eyes, mouth, outline colour), so drawing is one `drawImage`.
- `update`, `draw`, `drawPanel` catch their own errors and those of your callbacks; bad `dt` is clamped; an unknown expression draws `neutral`; an unknown key shows no portrait (never a placeholder face).
- It never reads or consumes input and never pauses the game.
- **Missing H-01 hooks (honest limits):** the dialogue box has no text inset, so the portrait sits beside the box (the box is narrowed through `bounds`), not inside it; the name tag's side follows the speaker's sprite (`getAnchor`), not the portrait's side; an expression can change per line, not in the middle of a line.

# painted-portraits.js (L-02 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_PaintedPortraits`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It shows **painted bust portraits** (image files generated once at build time, one per expression) beside a dialogue box: the speaker slides in, the face cross-fades to the line's expression, the bust breathes and blinks, and whoever is not speaking dims. The game never calls an image generator; it loads files.

It has the same presenter hooks as D-04 `expressive-portraits` (`GameDNA_Portraits.create`): `onLine`, `reserve`, `attach`, `update`, `draw`, `show`, `expr`, `hide`, `clear`. A game wired for D-04 switches by changing the global and the cast. It also works with the game's own text box (no H-01) through a tiny adapter.

## Cast (the designer edits this)

```js
const CAST = {
  Maren:  { src: 'portraits/maren-{expr}.webp',  side: 'left' },            // {expr} -> neutral, happy, angry, sad, surprised, determined, blink
  Tobin:  { src: 'portraits/tobin-{expr}.webp',  side: 'right' },
  Hesper: { images: { neutral: 'portraits/hesper-neutral.webp', happy: 'portraits/hesper-happy.webp' } }   // or an explicit map
};
```

| field | meaning |
|---|---|
| `src` | URL pattern with `{expr}`; `exprs` (optional) lists which files exist (default: the six expressions + `blink`). |
| `images` | `{expr: url \| HTMLImageElement \| ImageBitmap \| canvas}`. Wins over `src` for the names it has. |
| `assets` | A key prefix in a `GameDNA_Assets` (L-00) instance (`options.assets`, default the global): `'maren'` reads `maren-neutral`, `maren-happy`, … |
| `side` | `left` / `right` for this character (default from the `layout` param). |
| `facing` | The way the painted face looks: `right` (default, the shipped cast) or `left`. A portrait on the side it does not face is mirrored so it looks into the screen (`params.flip: 'never'` or `noFlip: true` turns that off). |

`neutral` is required (the fallback for every missing expression). `blink` is optional: the neutral face blinks with it; other expressions do not blink. `GameDNA_PaintedPortraits.castFromManifest(assetsJson, {base: 'portraits/', names: {Maren: 'maren'}})` builds the cast from a pack manifest (entries with `role: "portrait"`, `set`, `expr`).

Keys are matched to the line's `portrait`, then `who`, then `speaker`, case-insensitively.

## Dialogue lines

The H-01 line objects take three optional fields; any other field is ignored:

| field | meaning |
|---|---|
| `expr` | `neutral` (default), `happy`, `angry`, `sad`, `surprised`, `determined`. Aliases: `hurt`, `worried` → sad; `thinking`, `serious` → determined; `shocked` → surprised; `smile`, `joy` → happy; `mad`, `furious` → angry. An unknown name shows neutral (one console warning). |
| `portrait` | Cast key when it differs from `who` / `speaker`. |
| `side` | `left` / `right` for this line. |

A line without a cast portrait (narration) shows no portrait; the portraits on screen dim (`listener: 'dim'`) or leave (`'hide'`).

## API

`GameDNA_PaintedPortraits.create(options)` returns a presenter.

| option | meaning |
|---|---|
| `cast` | `{Name: entry}` as above. Every image starts loading at `create`. |
| `getPortrait(key, line)` | Optional: return an entry for keys not in `cast` (or null). |
| `bounds` | The play field the dialogue box uses, `{x, y, w, h}` in the units the box is drawn in (or a function). Also `view: {w, h}`. |
| `uiRects()` | Optional: HUD / menu rects the bust must not cover (it shrinks, keeping its foot line, down to 55 %; then draws anyway with one warning). |
| `assets` | Optional `GameDNA_Assets` instance for `assets:` cast entries. `base`: URL prefix for every relative `src`. |
| `params` | `layout` `'left'` (`'right'`, `'two'`: first speaker left, next right), `place` `'stand'` (the bust stands on the box's top edge, its flat cut hidden behind the box) or `'beside'` (D-04 style: next to the box, the box narrowed through `reserve`), `height` 0 (drawn bust height in field units; 0 = 46 % of the field height), `enter` `'slide'` (`'fade'`, `'none'`), `enterMs` 260 (exit = ¾), `fadeMs` 180 (expression cross-fade), `listener` `'dim'` (`'hide'`), `dim` 0.45, `breathe` 1 (0 = off), `breatheMs` 3800, `blinkMs` 4200 (0 = off), `talk` `'bob'` (`'none'`), `shadow` 0.35, `inset` 18, `gap` 6, `margin` 6, `flip` `'auto'` (`'never'`). |

| method | |
|---|---|
| `onReady(fn)` / `ready()` / `status()` | `fn(presenter)` once every cast image has loaded or failed (at once if already). **Boot the game from it** so `?t=&freeze=1` frames always include the portraits. `status()` = `{ready, cast: {Name: {loaded, failed, pending}}}`. |
| `onLine(line, index, ctl)` | Pass it as the H-01 box's `create({onLine})` (wrap it if you already use that hook). With your own box: call `onLine({speaker, expr})` when a line starts. |
| `reserve(field)` → field | Use as the H-01 box's `bounds: () => por.reserve(FIELD)`. In `place: 'stand'` it returns the field unchanged; in `'beside'` it narrows it by the bust's width while a conversation with portraits runs. |
| `anchor(key, line)` | Optional, for the H-01 box: `getAnchor: (who, line) => por.anchor(who, line)` puts the name tag on the portrait's side (a 2×2 rect at the top of the field above that side; the box never moves away from it). Only when the game does not already pass sprite rects there. |
| `attach(box)` | H-01: `attach(dlg)` (reads `dlg.state()`, `dlg.rect()`, `dlg.lastDrawn()`). Your own box: `attach({rect: () => boxRectOrNull, typing: () => bool})`; the portraits leave when `rect()` returns null. |
| `update(dtMs)` | Every fixed step, **also while the box is busy**. The only clock (enter, cross-fade, breathing, blink, dim). |
| `draw(ctx)` | After the box's draw, in the box's coordinate space, outside any shake translate. The bust is clipped at the box's top edge and around the H-01 name tag, so it never covers the box or the tag. Never throws. |
| `show(key, {side, expr, instant})`, `expr(side, e)`, `talk(side, on)`, `hide(side?)`, `clear()` | Without a dialogue box (cutscenes, menus); `clear()` on restart. |
| `rects()`, `lastDrawn()` (also `clipY` and the tag `hole` per bust), `state()`, `portrait(key)`, `setParams(p)`, `params()`, `panelSize()` | Drawn rects (for other overlays and tests; `lastDrawn` adds key, expr, `showing` (the image actually drawn, e.g. `blink`), `fading`, `dim`, `active`, `talking`, `settled`, `flip`), `{clock, left, right, leaving, plan, ready}`, a cast record, live params. |
| `useSkin(GameDNA_Skin?)` | Registers each neutral image as a skin bitmap (`portrait`, lower-case key) so `skin.bitmap(ctx, rect, 'portrait', 'maren')` draws it (skins/SPEC.md §2.7). |

Static: `GameDNA_PaintedPortraits.drawPanel(ctx, record, {x, y, w, h}, {expr, flip, dim, alpha, blink})` draws one portrait contained and bottom-aligned in a rect (status, party, shop screens), `load(cast, {base, onReady})` preloads without a presenter, `castFromManifest`, `normExpr`, `EXPRESSIONS`, `DEFAULTS`.

**Placement.** `stand`: on the box's top edge, `inset` px in from the box's left or right end, 6 % of the bust below the edge (so breathing never shows the cut); height = `height` or 46 % of the field, never taller than the space above the box and never wider than half the box minus `inset` + `gap` (two busts never meet). The H-01 name tag stays in front: the clip has a hole for the part of the tag above the box's top edge only. A box at the top of the field: the bust stands on the field's bottom edge instead. `beside`: next to the box on its side, standing on the field's bottom edge (the flat cut is below the screen edge). No box: the field's bottom corner. Never at the screen centre.

## Integration (15 lines)

```js
// <script src="dialogue-box.js"></script><script src="painted-portraits.js"></script> before your game script
const TALK_FIELD = { x: 0, y: 0, w: SCREEN_W, h: SCREEN_H };            // the field the dialogue box already uses
const por = GameDNA_PaintedPortraits.create({ bounds: TALK_FIELD, uiRects: () => [hudRect], params: { layout: 'two' },
  cast: { Maren: { src: 'portraits/maren-{expr}.webp', side: 'left' }, Tobin: { src: 'portraits/tobin-{expr}.webp', side: 'right' } } });
const dlg = GameDNA_DialogueBox.create({ /* existing options */ bounds: () => por.reserve(TALK_FIELD),
  onLine: (line, i, ctl) => por.onLine(line, i, ctl) });                   // keep any old onLine: call both
por.attach(dlg);
// lines gain an optional expr: { speaker: 'Maren', expr: 'angry', text: 'Who rang the bell?' }
function step(dt) {
  if (dlg.busy()) { /* existing: press / hold */ dlg.update(dt); por.update(dt); return; }
  /* existing update */ dlg.update(dt); por.update(dt);
}
function render() { /* world, HUD */ dlg.draw(ctx); por.draw(ctx); }
function newGame() { dlg.clear(); por.clear(); /* existing */ }
por.onReady(boot);                                                         // was: boot();  (start the game once the images are in)
```

**Your own text box instead of H-01:** `por.attach({ rect: () => box.open ? { x: bx, y: by, w: bw, h: bh } : null, typing: () => box.typing })`; where the box shows a new line: `por.onLine({ speaker: name, expr })`; keep `por.update(dt)` in the fixed step and `por.draw(ctx)` right after the box is drawn. `bounds` is then the screen.

## Keep the game's other callers working

- **Boot from `onReady`**: the old boot (first step, the `?t=` fast-forward loop, the first `requestAnimationFrame`) runs once, from `por.onReady(boot)` (or from L-00's `GameDNA_Assets.load(..., {onReady})` if the game already uses it: then start the presenter first and chain: `GameDNA_Assets.load(list, {onReady: () => por.onReady(boot)})`). A missing file never blocks: it only falls back to neutral or no portrait.
- **One clock**: `por.update` next to every `dlg.update` (the busy branch and the normal one), inside the fixed step that the animation loop, `?t=&freeze=1` fast-forward and autoplay all call. Never drive it from `requestAnimationFrame` time.
- **Autoplay** needs nothing: the presenter follows the box and never takes input; `?auto=1` ends exactly as before.
- **The old `onLine`** (a per-open `opts.onLine`) stays; `create({onLine})` is a separate hook. If one already exists, call both.
- **Restart / new game / scene change**: `por.clear()` next to `dlg.clear()`. Do not reload images there.
- **Draw order**: after the dialogue box, in the same coordinate space as the box (if the game draws its UI with a scale, draw the portraits inside that same scale), outside shake.
- **Size**: the files are stored at about 1.7–2× the default drawn size on a 640×360 canvas; drawing larger than the file blurs, smaller is fine. On a fixed low-resolution pixel canvas they will look painted, not pixel (use D-04 there).

## Self-check without a browser

1. The module file is byte-identical to the one you were given and loaded before the game script.
2. `por.update(` appears next to every `dlg.update(`; `por.draw(` right after `dlg.draw(`; `por.clear(` next to every `dlg.clear(`.
3. The box's `bounds` is `() => por.reserve(<the old field>)` and its create-level `onLine` calls `por.onLine(line, i, ctl)`.
4. Every `speaker` / `who` that should have a face has a cast key whose files exist (`neutral` at least); every `expr` is one of the six names or an alias.
5. The old boot runs only from `onReady`; grep `requestAnimationFrame(` and the `?t=` loop.
6. Walk one line: `open()` → `onLine` (side, expression) → the bust slides in over `enterMs` (260 ms) → a later line with another `expr` → cross-fade over `fadeMs` (180 ms) → another speaker: the first one dims to `dim` (0.45) over 160 ms → close: both slide out over 195 ms, keeping their place on the old box edge; once the box starts closing, the bottom of each leaving bust fades out softly instead of showing the flat cut.

## What it guarantees

- Same calls, same frames: enter, cross-fade, breathing, blink and dim depend only on `update(dt)`, never on wall time or `Math.random`.
- Whole images are swapped or cross-faded (an expression edit re-renders the whole picture); the set's files share one canvas and alignment (checked by `assetcheck.py` `portrait-set`), so only the face changes.
- `update` and `draw` catch their own errors and your callbacks'; bad `dt` is clamped; an unknown key shows no portrait (never a placeholder); a missing expression shows neutral; a missing neutral shows nothing.
- It never reads input and never pauses the game. Drawing costs 3–5 `drawImage` per portrait per frame (cached dim layer and blurred shadow per image): about 1.3 ms per frame for two busts in headless Chromium's software renderer (0.9 ms with `shadow: 0`), demo at a 1280×720 backing store, 2026-11-16; far less on a GPU canvas.
- **Honest limits:** no talking mouth (whole-image art has no mouth frames; the bust bobs gently while the box types instead); only the neutral face blinks; the expression changes per line, not mid-line; mirroring a portrait also mirrors asymmetric details (a scar) — set `noFlip` for such characters.

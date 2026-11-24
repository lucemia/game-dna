# L-07 Card illustrations (`card-art`)

## What it is

Painted card art for an HD game, generated once at build time with Codex's built-in image tool and shipped as files: tall 2:3 opaque paintings, one subject each, all locked to one style (the L-00 style sheet and a key card are the references of every generation; light from the top-left; the subject in the upper safe area; a calm, darker lower half; no text). The code side has two parts:

- **G-07 bridge**: `art.drawDraft(ctx, draft)` replaces `draft.draw(ctx)`. G-07 (unchanged) still draws everything; the bridge paints each HD card face's illustration full-bleed inside G-07's own card transform, under G-07's rarity chip, stack pips, name, tags, rules text, stat preview and synergy ribbon, and leaves out the medallion icon where art is shown. The art therefore follows the deal, the flip squeeze, the fan tilt, the lift, the dim on unselected cards, the pick flash and the fly-out.
- **Card frame renderer**: `art.drawCard(ctx, card, rect)` draws a 2:3 card in code: brass frame tinted by rarity, art window, cost gem, title plate, type line, rules text that shrinks to fit (`*6*` = a gold value), rarity jewel, selected glow, dim, face-down back. Text is always live, never part of the image. Ready for A-10 hands, shops and reward screens.

The shipped pack has 15 cards named after G-07's tags (`blade fire frost storm guard heart speed gold magic luck poison light crit arrow regen`), so a G-07 table whose tags are G-07's own gets art with no mapping.

## Default parameters

| key | default | meaning |
|---|---|---|
| `shade` | 0.9 | opacity of the rarity-coloured shade from 46 to 104 units, under G-07's name and text |
| `focusY` | 0.28 | the subject's centre in the art (fraction of the height), kept at the same relative height when a window crops |
| `textMin` | 5.2 | smallest rules-text size in `drawCard` (card units, u = w / 100) before ellipsis |
| `sheen` | `on` | one diagonal light sweep every 4 s on rare and epic art (game time; in a G-07 draft 2.0–3.8 s after it opens, i.e. while choosing) |

## Variants

- **Full-bleed draft cards** (default).
- **Lighter shade**: `shade: 0.75` (more of a bright painting shows under G-07's text; check readability).
- **Quiet frames**: `sheen: 'off'`.

## Interface

Needs: a G-07 draft whose draw call becomes `drawDraft` (or the game's own card drawing for `drawCard`); an art key per upgrade (`art` field, id, or a tag naming a key; synonyms such as `sword`, `shield`, `hp`, `haste`, `heal` are understood); the boot moved into `onReady`; the image files.

Provides: art in every HD G-07 face; `drawCard` / `drawBack` / `drawArt`; `lastDrawn()` rects; `stats()` (faces, withArt, noArt, notLoaded, mismatch, fallbacks); the pack manifest with provenance; `tools/cardset.py`.

## Screen rules

- Art: 2:3 exactly (`cardset.py check` ratio within 1 %), opaque, stored at 360x540 WebP (q84; 239 KB for 15).
- Safe area: subject centre at y ≈ 28 %, detail centroid at y ≤ 0.52 and x within 0.5 ± 0.16; lower 35 % detail ≤ 0.80 × the top 60 %; the busiest outer 4 % strip ≤ 1.1 × the safe area's detail.
- In G-07 (card w = 148 U, h = 1.36 w): art clip = card inset 5 U, radius 8.5 U; cover fit (2:3 into 138 × 191 U crops ~16 U, mostly from the bottom); rarity shade from 46 U (0) through 78 U (0.72 × shade) to 104 U (shade) and solid below; a 30 U top darkening for the chip; a 1 U rarity edge line. G-07's own chip (9–24 U), pips, name (≥ 91 U), tags, text, well and ribbon draw on top.
- `drawCard` (u = w / 100, h = 150 u): rim 0.6 u, body inset 3 u, art 5–92 u, title plate 85.5–98.5 u (7.4 u serif, shrinks to 4.4 u, then ellipsis), type line 99.5 u (4.4 u caps), text 106–144.5 u (7.2 u down to `textMin`), cost gem 19 u at the top-left corner.

## Common mistakes

| symptom | fix |
|---|---|
| cards show G-07's icons, no paintings | `draft.draw` still called (judge `bypass`), or no upgrade resolves to a key (`noArt`): add `art: '<key>'` |
| the first frozen frame has no art, later ones do | the boot is not gated: `cardArt.onReady(boot)` (`notLoaded` > 0) |
| a card is drawn twice / ghosting | both `draft.draw` and `drawDraft` in the frame: keep only `drawDraft` |
| text hard to read on a bright painting | raise `shade`, or regenerate that card with a darker lower half (`calmBottom` fails) |
| subject cut by the title or the edge | the art breaks the safe area: regenerate (`subjectHigh` / `edges` fail); never crop by code |
| `stats().mismatch` > 0 or `withArt` 0 with art loaded | a G-07 version that draws its face in another order: pin G-07 v1.0.0 or update the bridge |
| pixel cards without art | expected: generated art targets HD; G-07's pixel look keeps its 1-bit icons |

## Acceptance moments

1. A draft just dealt (`?t=` during deal / flip): the flipping card squeezes with its art; the back face is G-07's.
2. Choose: three cards with three different paintings, each under G-07's chip, name, tags, rules text and stat preview; the selected one bright, the others dimmed with their art.
3. Pick: the picked card flashes with its art and shrinks to the strip; the others fall away.
4. Epic / rare: the epic sheen and glow over the art; a synergy ribbon over the art's lower edge.
5. `drawCard` hand: cost gem, title plate, type line, fitted rules text with gold values; a lifted card glows; legendary and dim variants; card backs.
6. The pack grid with the safe area and text zone overlaid: every subject inside the dashed box, every lower part calm.

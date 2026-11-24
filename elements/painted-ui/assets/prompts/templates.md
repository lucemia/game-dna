# Prompt templates: UI frames & icon sheet (L-06)

Fill every `<...>`. Keep every sentence that says original / no text / no logo / no watermark: `namecheck.py --require-guard` refuses a prompt without them, and refuses names of real games, franchises, characters, brands, studios and living artists, and "in the style of <Name>". Describe the look in plain words.

Every image: `transparent_background: true`. Generate ONE image per call.

## 1. Style lock paragraph (write once; paste unchanged at the end of EVERY prompt)

```
STYLE LOCK (identical in every prompt of this set): <medium, e.g. modern hand-painted 2D game UI art> for an original <genre, theme> game; <rendering, e.g. soft painterly brushwork over clean readable shapes>; one key light from the <TOP-LEFT>; <outline, e.g. a thin dark warm-brown outline around every object>; <materials, e.g. dark polished walnut wood and brass | pale stone and verdigris copper | lacquered dark teal and silver>; <palette: 4-6 colour words>. Original, no resemblance to any existing game, film or franchise character, no text, no logo, no watermark.
```

Pick materials from the game's world (a sea game: driftwood and rope; a crypt: bone-white stone and iron). Avoid the genre's most famous menu look (plain blue gradient boxes with white borders read as a copy).

## 2. Lock image: the window frame (first call, no reference)

```
One ornate but readable UI window frame for game menus and dialogue boxes, seen straight on (flat, no perspective): a rectangular border of <material> with a thin <accent> inner trim line, and four matching decorated <accent> corner pieces (<motif from the game's world>). The four corner pieces have exactly the same shape, mirrored left-right and top-bottom. The four straight edges between the corners are PLAIN and UNIFORM along their whole length: no centre ornament, no gems, no studs, no pattern that changes along the edge, so the edges can be stretched. The border is about 1/14 of the frame's width thick; each corner piece is about 1/6 of the frame's width. The ENTIRE inside of the frame is EMPTY and fully transparent (no panel, no parchment, no fill), and everything outside the frame is fully transparent. Square canvas, the frame is a square that fills the canvas with a small transparent margin.

<STYLE LOCK paragraph>
```

Regenerate it until: corners match, edges are plain, the inside is empty, no text. It is the lock: pass its absolute path as `referenced_image_paths` on every later call.

## 3. Derived pieces (reference = the window frame)

Start each with: `Match the attached window frame exactly in rendering: same materials, brushwork, outline, light and palette, and the SAME metal tone as its trim (never a brighter, more saturated metal). Draw only the new UI piece described here.` Then one body, then the STYLE LOCK paragraph.

| file | body |
|---|---|
| `frame-small.png` | `One simple small UI frame for buttons and tooltips, the lighter sibling of the attached frame: a thin rounded-corner border of <material> with a thin <accent> edge line and a small round <accent> cap on each corner. The four corners have exactly the same shape, mirrored. The straight edges are PLAIN and UNIFORM along their whole length. The border is about 1/16 of the frame's width thick. The ENTIRE inside is EMPTY and fully transparent, and everything outside is fully transparent. Square canvas, the frame fills it with a small transparent margin.` |
| `select-frame.png` | `One selection highlight frame for a game menu (it marks the selected row or slot): a thin bright <accent> outline with a soft <warm colour> inner edge and a small L-shaped <accent> bracket on each of the four corners. Corners identical and mirrored; straight edges PLAIN and UNIFORM. The outline is thin, about 1/30 of the frame's width. Inside EMPTY and fully transparent, outside fully transparent. Square canvas, the frame fills it with a small transparent margin.` |
| `slot.png` | `One inventory slot tile for an item grid: a rounded square recessed <dark colour> cushion with a thin <material> rim, darker inside with a soft inner shadow at the top-left, completely empty (no item). The four corners have exactly the same shape. Square canvas, the slot centred and filling about 90% of the canvas, everything around it fully transparent.` |
| `cursor.png` | `One small menu pointer cursor: a <material> arrowhead pointer, pointing straight to the RIGHT, compact and bold so it reads at a small size. Square canvas, the pointer centred and filling about 70% of the canvas width, everything around it fully transparent.` |

## 4. Icon sheet (reference = the window frame)

```
Match the attached window frame exactly in rendering: same brushwork, outline, light and palette. A UI icon sheet for an original <theme> game: <N> icons in a grid of <C> COLUMNS and <R> ROWS of equal square cells with even spacing, on a <wide landscape canvas (3:2) for 6x4 | square canvas for 4x4 or 5x5>. Each icon is centred in its own cell with a clear transparent margin, no icon touches or crosses into a neighbouring cell, and all icons are drawn at the same scale (each fills about 75% of its cell). Front-facing icon views, consistent light from the top-left, thin dark outline.
Row 1, left to right: <item>; <item>; ...
Row 2: ...
Row <R>, status effect emblems, each a round dark badge with a thin <accent> rim and one bold symbol inside: <effect symbol>; ...
No shadow under any icon (no contact shadow, no ground ellipse): the icons float in empty space. No labels, no captions, no numbers, no letters, no cell borders, no grid lines, no background panel.

<STYLE LOCK paragraph>
```

List the game's own items (what the shop sells, what drops, what the bag holds) and its status effects. 16-24 icons; 6x4 = 24 is the most reliable layout. Never ask for a letter, number or word on an icon (a status called "Sleep" gets a moon, not "Zz").

## 5. Post-process (`uikit.py` uses `postproc.py`; Python + Pillow)

| piece | command | then in `assets.json` |
|---|---|---|
| window frame | `uikit.py frame9 gen/.../frame-window.png kit/frame-window.webp --size 384 --mid 32` | role `frame9`, `slice`, `inset` and `safe` from the printed JSON (`inset` = `insetSuggested` x4, `safe` = `safe` x4: the text-safe inset past the corner ornaments), `fill: false`, `corner` = drawn corner px on the game's canvas (about 1/12 of the screen height), `frame9: {"centre": "transparent"}` |
| small frame | `... frame9 ... --size 256 --mid 24 --hard` | same; `corner` about half the window's |
| selection | `... frame9 ... --size 256 --mid 24 --hard` | same, no panel is drawn under it |
| slot | `uikit.py slot gen/.../slot.png kit/slot.webp --size 128` | role `frame9`, `slice` = 30 % of the width x4, `inset` = 16 % x4, `fill: true`, `frame9: {"maxEdgeDev": 40}` |
| cursor | `uikit.py cursor gen/.../cursor.png kit/cursor.webp --size 64` | role `sprite`, `anchor: [0.97, 0.5]` (the tip), `drawH` = pointer height in canvas px |
| icon sheet | `uikit.py icons gen/.../icons.png kit/icons.webp --cols C --rows R --cell 128 --fill 0.84 --keys k1,k2,...` | role `icon`, `atlas` from the printed JSON |

Check the printed JSON: `frame9` symmetry values >= 0.85 (corners have the same silhouette), `icons` problems empty (no empty cell, no cell with two large shapes). If not, regenerate that image; never fix art with code. Then `assetcheck.py assets.json` until `"ok": true`.

# G-11 Shaped inventory packing

## 1. What it is

The bag is a grid, and every item takes its real shape in it: a potion is one cell, a staff three in a column, a round shield
2 x 2, an axe five cells with an empty corner under its blade, and L, T, S and plus pieces exist too. Space is the limit. The
player opens the bag (a key, or the game opens it when loot will not fit) and the world pauses under a dimmed window with two
grids: **Carried** (the bag, which can have locked corner cells) and **On the ground** (loot to take, or a place to drop
things).

Moving items: press on an item and drag it (mouse, touch), or put the keyboard cursor on it and press Z to lift it, move it
with the arrows and press Z again. While an item is carried, its footprint shows on the grid under it. **Green** means it fits
there. **Blue** means it stacks onto the same item. **Amber** means it swaps with the single item underneath (the other item
comes up into the hand). **Red** means blocked or off the grid: the blocking items glow red, and releasing sends the carried
item back with a shake and a reason in the footer ("Blocked by 2 items", "Doesn't fit there"). R, a right-click, the mouse
wheel or a second finger turns the carried item a quarter turn clockwise. Turning is a real rotation of the footprint and of
the art, never a mirror; R cycles only through footprints that differ, so a 2x2 shield or a plus-shaped relic does not turn and
a 1x3 staff only toggles between upright and sideways (never upside down). X puts an item back where and how it was picked up.
When the carried item would swap, the item you would receive stays fully drawn with an amber outline, a "You get: <name>" label
sits next to it, and the carried item, still fully opaque, shrinks and rides up-left of the cursor.

T sorts the bag: stacks merge, then items are placed largest first, each at the first spot that fits in either orientation.
When that packing cannot hold everything, the bag stays exactly as it was ("No tidier fit found"). Sorting never loses an
item. F takes everything that fits from the ground. U uses the selected item through the game's `onUse`, which applies the
effect or refuses with a reason. G drops it to the ground through `onDrop`. **Key items** (`key: true`, `essential: true`, or kind
`quest` / `key`) can never be dropped or left behind: picked up into a full bag, the bag first repacks itself, then moves the least
valuable other items (by `value` or `price`) to the ground tray and opens so the player sees what moved; closing with a key item still
on the ground makes room the same way, or refuses with "Make room for the <name> first". Stack counts sit on a dark
plate in the item's last cell, gold when the stack is full. A tooltip shows name (rarity colour), kind, footprint, stack and
description, and is placed clear of the buttons and labels.

The module owns the bag contents (count, add, remove, sync, serialize). The game owns what items do, its world and what
happens to things left on the ground when the window closes (`onClose`).

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `cols` x `rows` | 8 x 5 | 4-14 x 3-10 | Bag size in cells (or a `mask` of `#` / `.` rows for a shaped bag) |
| `ground` | on | on, off | Ground tray (4 x 5; 5 x 5 in the demo): loot and drops; off = loot goes straight into the bag |
| `swap` | on | on, off | Dropping onto exactly one other item swaps it into the hand; off = refused |
| `sortBy` | size | size, type | Sort largest first, or by kind (weapons, shields, armour, ... treasure, quest) then size |
| `stack` | 1 | 1-99 | Default stack cap (`item.stack` overrides) |
| `theme` | auto | auto, pixel, hd | auto = 16-bit pixel when the view is at most 400 x 260 px, else HD |
| `dim` | 0.45 | 0-0.8 | Darkening of the world behind |

Module-only: `maxCell` 42 (design px), `minTextPx` 10 (CSS px floor for HD text, read from the canvas's on-screen size),
`autoCloseMs` 900, `groundCols` / `groundRows`, `closeKeys`, `title`, `bagLabel`.

## 3. Variants

- **Action RPG backpack** (defaults): 8 x 5, ground tray, swap on, sort by size.
- **Survival pack**: 6 x 4, swap off (every move has to fit), sort by type.
- **Big chest**: 10 x 6, no ground tray (loot goes straight in).
- **Strapped pack**: a `mask` with locked corner cells (`.######.`).
- **16-bit bag**: pixel look on a 256-320 px canvas, bitmap font, code-drawn pixel items.

## 4. Interface

**Needs**: an item table `{id: {name, shape, stack, kind, desc, rarity, use, drop, art, image, crop}}`. Calls: `open({loot})`
from update logic; `update(stepMs)` every fixed step while open; `draw(ctx)` last; `key(code, down, repeat)` and
`pointer(type, x, y, {id, button})` while `busy()`. Callbacks: `onUse(id) -> true | false | reason`,
`onDrop(id, n) -> true | false | reason`, `onClose({ground})`, optional `onChange`, `onSfx`, `uiRects()`, `autoplay`.

**Provides**: `count / add / remove / canAdd / sync / serialize / restore`, `busy()`, `sort()`, `takeAll()`, `use(id)`,
`state()` (held item and where it would land, entries, cursor, message, last event), `events()`, `lastDrawn()` (every drawn
rect with its kind: window, text with role, button, item, count, tooltip, ghost, held, cursor), `rect()`,
`GameDNA_ShapedInventory.renderArt()`.

## 5. Screen rules (exact numbers)

- **Window**: centred in `view`, as small as the grids need. Cell = min(fit, `maxCell` x u); HD u = min(view.w / 640,
  view.h / 360), raised so the smallest text (9u) is at least `minTextPx` CSS px. Pixel look: u = 1, integer px everywhere.
  Padding 10u, header 22u, grid labels 14u, gap between grids 14u, buttons 22u high, footer line 14u. Portrait views (w < 0.95 h)
  and any view where side-by-side cells would be under 28 CSS px switch to the **phone layout**: one grid at a time with two tabs
  (Carried n / m, Ground k; labels and counts are measured and fall back to a short label, a compact count or the count alone), cells sized to the larger grid, and the tooltip as a fixed strip (36u) under the grid; a carried item
  hovering a tab switches to it. A HUD band along the top (uiRects in the top quarter) is left clear whenever the cells there stay
  at least 26 CSS px; otherwise the window uses the whole view (the game is paused while it is open). The window slides vertically off `uiRects()` when it can.
- **Cells**: rounded wells (3u) with a top inner shadow; locked cells hatched; ground cells olive with a dashed outline.
  An item's cells are joined into one region tinted by rarity at 13 % (common #cfc6b2, uncommon #86d672, rare #62aef4,
  epic #c788f4, quest #f2c45a); the selected item gets an extra 12 % gold.
- **Item drawing**: a panel that follows the footprint exactly (cells joined, gap 0.12 cell at the outer edge), material by kind
  (wood / leather / cloth / velvet / gold) with a vertical ramp, 0.05-cell bevel (light top-left, dark bottom-right), stitching
  0.13 cell inside the outer edge (leather, cloth, velvet, gold) or grain (wood), and a small rarity gem; then the icon upright,
  contained (never stretched) in the footprint's largest block of cells, padded 0.1 cell, with a soft shadow. Icons come from
  `image` + `crop`, the game's own `icon()` drawer, a footprint glyph on the pixel look (one per art, drawn in code at 16 px per cell to the
  art's own footprint, 1-px outline, 3-step ramps + highlight from the item's colours, integer scale, turned with the item;
  no two arts share pixels, checked), or a bold silhouette glyph on HD. A long icon in a long slot follows the slot. Turning turns the panel, never the icon.
- **Carried item**: full opacity with a drop shadow, always kept inside the grid area (never over the header, counter or buttons). While it would
  swap it shrinks to 0.72 and rides up-left of the cursor so the target stays readable.
- **Ghost**: per footprint cell, inset 1.5u, radius 3u; fill 30 %, border 95 %; green #6fe08a, blue #62c8ff, amber #ffb340,
  red #ff5a4e. When invalid, blocked cells get a 2.2u red border and free cells a faint 12 % fill; blocking items get a 34 %
  red tint, and the item that would swap gets a 30 % amber tint.
- **Stack count**: bottom-right of the item's last cell, font 0.3 x cell (min 8 px), dark plate at 82 %, gold when full.
- **Tooltip**: shown after the pointer rests 350 ms (`hoverMs`), max 210u wide, padding 8u, name in the rarity colour (10.5u bold), then kind, footprint and stack, the wrapped
  description, and a "U use" hint for usable items. Of the sides right, left, below, above it takes the one covering the fewest
  item cells, inside the content area, never over the item, a grid label, a button or the footer.
- **Keyboard cursor**: gold corner brackets around the cell, pulsing. Shown only after keyboard input.
- **Timing**: open 140 ms (scale 0.94 -> 1, HD), close instantly (games stop calling update once it is closed), placement settle 120 ms, return flight 170 ms, sort glide 260 ms,
  invalid shake 260 ms, footer message 2.4 s, arrow auto-repeat after 260 ms every 90 ms. All on the update clock.

## 6. Common mistakes (symptom -> fix)

- **Two item counts disagree** (the HUD shows 3 potions, the bag 2) -> keep one count: read `inv.count(id)`, or call
  `inv.sync(counts)` after every change the game makes itself.
- **The world keeps moving under the bag** -> gate the whole fixed step on `inv.busy()` and return after `inv.update()`.
- **The key that opened the bag also picks something up / the bag reopens at once** -> open from update logic, drop the
  game's buffered presses while `busy()`, and let the bag's own I / Esc close it.
- **Drag lands one cell off, or never starts** -> pointer coordinates are in CSS px; convert to native canvas px.
- **`?auto=1` hangs on the bag** -> pass `autoplay`; under it the window takes the loot and closes after `autoCloseMs`.
- **Long items look lit from the wrong side when turned** -> do not rotate your images yourself; pass `image` and let the
  module rotate them.
- **Loot vanishes** -> handle `onClose({ground})`: what is left there must go back into the world or be discarded on purpose.
- **Quest item dropped and lost** -> `drop: false` on the item, or refuse it in `onDrop`.

## 7. Acceptance moments

Demo stills (`demo/index.html`, 1280 px dpr 2 unless noted). `checks/state.json` lists the event each moment must show, and
`checks/demo-check.py` (moments) confirms it.

1. `?t=900&freeze=1`: The bag opens over a dimmed forge. Every item sits on a panel that follows its exact footprint (leather, wood, cloth, velvet or gold by kind) with its icon upright on the largest block: the T-shaped ration pack, the S-shaped map bundle, the L-shaped fur boots. On the ground: a 5-cell axe (J), a plus-shaped star amulet, a helm, a bow, a potion.
2. `?t=2050&freeze=1`: The ground potion was dropped onto the potion stack: the stack reads 3 and pulses (blue = would stack).
3. `?t=3600&freeze=1`: The helm is held over the shield and the jerkin: the two blocking items glow red, the footprint cells over them are red, the free ones faint.
4. `?t=6400&freeze=1`: R turned the held bow a quarter turn: its footprint is now 2x1 and green over a free gap (a real rotation, never a mirror).
5. `?t=8600&freeze=1`: The 5-cell axe is held over the jerkin alone: the jerkin stays fully drawn with an amber outline and a 'You get: Leather Jerkin' label; the axe, at full opacity and smaller, rides up-left of the cursor inside the window.
6. `?t=10400&freeze=1`: The swapped jerkin was put on the ground tray (a drop the game allowed); the axe sits where it was.
7. `?t=11800&freeze=1`: Hovering the S-shaped map bundle: the tooltip shows name, kind, 3x2 footprint and description, placed where it covers the fewest items and clear of the buttons and labels.
8. `?t=13700&freeze=1`: Sort packed the bag largest first (stacks merged, nothing lost); 'Bag sorted'.
9. `?t=16000&freeze=1`: The selected potion was used through the game's callback: its stack drops from 3 to 2, the footer says 'Drank Healing Draught'.
10. `?t=18000&freeze=1`: Keyboard: the cursor brackets the quest key; G (drop) is refused because it is a key item: 'The Old Key must stay with you'.
11. `?t=21000&freeze=1`: Keyboard carry: Z lifted the T-shaped ration pack, R turned it twice (the panel turns, the icon stays upright), arrows moved it into the free bottom rows; the green ghost shows where Z would put it.
12. `?t=23500&freeze=1`: F took everything that fits from the ground (amulet and jerkin). Footer: 'Took everything'.
13. `?theme=pixel&t=3600&freeze=1`: 16-bit look (320x180, integer scale, bitmap font, code-drawn pixel items): the same blocked helm.
14. `?theme=pixel&t=11800&freeze=1`: 16-bit tooltip on the map bundle, clear of the buttons.
15. `?theme=code&t=6400&freeze=1`: HD look without game icons: the panels carry bold silhouette glyphs, upright; the turned bow's panel is 2x1.
16. `?t=8600&freeze=1` at 390x844 dpr 3: Phone, 390 px portrait: one grid at a time with tabs (Carried / Ground), cells at least 28 CSS px, the swap preview.
17. `?t=11800&freeze=1` at 390x844 dpr 3: Phone: the tooltip is a strip under the grid, never over the items or the buttons.
18. `?bag=pack&t=900&freeze=1`: A bag shape with locked corner cells (hatched, with a padlock); items never go there.

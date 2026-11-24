# C-15 Keyword tooltips

## 1. What it is

Rules text in a game (card text, skill descriptions, a log line, the tile info line) is written as rich text. Keywords in it, and
words or icons the game draws itself (status badges, HP labels, relic icons), become hoverable: coloured, dotted underline. A
tooltip opens on mouse hover after a short delay, on a touch long-press (a ring fills) or tap, and on keyboard focus (Tab, with a
focus ring and key hints). It shows an icon, the title in the keyword's colour, the kind (STATUS, RULE, RELIC...) and a short text
that can contain more keywords: hovering, tapping or focusing one opens a nested tooltip next to its parent. Click, tap or the pin
key pins a tooltip (a pin icon shows) so the pointer can travel into it; a click or tap outside, Escape, or clicking the word again
closes it. The module never pauses the game and changes no game state.

## 2. Default parameters

theme `slate`; hover delay 180 ms (100 ms when moving between words of an open level); grace 260 ms for the pointer to cross from a
word into its tooltip; long-press 420 ms; nesting depth 3; pin key `t`; focus key `Tab`; close key `Escape`; key hints on; numbers
highlighted; notch on; minimum tooltip text 10 CSS px (cap height on pixel canvases).

## 3. Variants

Card table (slate, 180 ms, depth 3), Night strategy (night theme, 250 ms), Parchment codex (light parchment theme, depth 4),
Instant (no delay, no hints). Pixel canvases (view <= 512 wide) get crisp bitmap fonts at an integer scale; HD canvases get smooth
canvas text, rounded panels with a soft shadow and an accent bar in the keyword colour; keywords may bring their own icon image.

## 4. Interface

Needs: the canvas and the view units of the draw calls; keyword definitions `{title, kind, icon, color, text}`; `update(stepMs)` in
the fixed step and `draw(ctx)` last in every render path; rich text through `text()` (render) or `setText()` + `drawText()` (step);
`mark()` for words and icons the game draws; optional `uiRects()`, `avoid()` and the game's own font. Provides: the tooltips and
their input, `state()` / `lastDrawn()` / `stats()`, callbacks, scripted control. Consumes only presses on keywords and tooltips,
Tab while keywords are on screen, the pin key and Escape while something of its own is open or focused, and a touch tap outside a
pinned tooltip.

## 5. Screen rules (exact numbers)

- A tooltip is fully inside the view (margin max(2, UI px) on pixel, view.w / 160 on HD) and never overlaps its word, the word's
  underline or its own notch (gap 3 UI px pixel / 7 UI px HD; the notch fills the gap and points at the word's centre).
- Attached: every visible tooltip's notch touches the word it explains (within 2 UI px), the panel spans the word's centre on
  that side, and its gap to the word is the notch gap (3 UI px pixel, 7 HD). A stacked tooltip is attached to the visible word
  that opened the first ancestor it hides.
- A nested tooltip never overlaps a visible ancestor; tooltips stay off the `avoid` rects (characters with their HP and badges)
  whenever an attached spot exists; widths x1, x1.35, the view, x0.75, x0.58 are tried before giving up a pass. Order: off chain
  and characters (own word, then STACK for nested / smaller text down to 0.8 x minCssPx for top level), then allowing characters,
  then the band above or below the word with whole lines. HUD rects cost 0.6 per UI px^2.
- Key hints only in unpinned keyboard-opened tooltips; pinned tooltips never show them.
- Width cap 150 UI px pixel / 300 HD; wider (x1.35, then the view) before shrinking text.
- Text inside a tooltip never overlaps: title, kind tag (dropped if it would touch the title), divider, body lines, hint line.
- Motion: fade in 120 ms with a 2-4 UI px slide from the word, fade out 90 ms; a moving word drags its tooltip at most 6 UI px per
  frame; a word that jumps (> 6 UI px in a frame, or a new spot > 16 UI px away) crossfades to the new place. Nothing moves more
  than 8 UI px between two frames.
- Phones: tooltip text >= `minCssPx` (10) CSS px: the pixel font is scaled 2x on a 256-384 px canvas shown at 1x. The demo switches
  to a tall 192 x 344 layout below 768 CSS px (pixel look at 2x, HD at ~2x): card text >= 10 CSS px, card rows as tall as their text.

## 6. Common mistakes (symptom -> fix)

- Nothing opens -> `update()` is not called (stats().noUpdate > 0) or the text is drawn by the game, not through `text()` / `mark()`.
- Tooltips flicker or never open in stills -> blocks declared only in the render; for `?t=` stills declare them with `setText()` in
  the step.
- A menu row stops reacting to taps -> the `[keyword]` is inside a clickable label; move it to a description line.
- Escape or T stops working in the game -> the game uses them: change `closeKey` / `pinKey`.
- Words wrong size -> pass the game's own font to `text()`; tooltips use the module's fonts.
- Plain text where a keyword was meant -> unknown `[id]` (stats().unknown, console warning once).

## 7. Acceptance moments

Demo stills (`demo/index.html?t=<ms>&freeze=1`, pixel look by default, `&look=hd` for the HD look; one clock for the scripted pointer,
keys and finger; `checks/state.json` lists each event and `checks/tooltips.py` confirms it in both looks at 1280, 500 and 390 px):

1. `?t=2600` mouse hover on Burn in the first card: the tooltip opens above the word, notch pointing at it.
2. `?t=3300` click on Burn: pinned (pin icon).
3. `?t=5000` the pointer inside the pinned tooltip on Turn start: a nested tooltip opens, attached to its word (or stacked over its parent when there is no room).
4. `?t=6800` Poison inside the nested tooltip: a third level, stacked ('< TURN START') and attached to the card's Burn; no tooltip over a character.
5. `?t=8700` the pointer left the scene: the unpinned children faded out, the pinned Burn stays.
6. `?t=11000` a click outside closed everything; the foe's Weak badge (a mark on a drawn icon) shows its tooltip below the badges.
7. `?t=12800` Thorns in the combat log at the top-right corner: placed below and pulled left to stay on screen.
8. `?t=14600` keyboard: Tab twice focuses the second relic (focus ring), tooltip with key hints.
9. `?t=15700` T pins the relic tooltip and steps inside: Strength focused, its nested tooltip open.
10. `?t=18050` touch: a finger holds Block on the second card; the long-press ring fills, nothing open yet.
11. `?t=18900` the long-press opened Block pinned.
12. `?t=20400` a tap on Retain inside the Block tooltip opens it nested and pinned.
13. `?t=21600` a tap outside closed every tooltip.

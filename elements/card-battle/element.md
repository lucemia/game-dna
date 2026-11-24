# A-10 Card battle with intents

## What it is

A turn-based card battle seen from the front: the foes stand on the road ahead, the player's hand fans along the bottom. Each turn the player draws a hand (5), gets a small energy pool (3 Lumen) and plays cards by dragging them onto a foe (a glowing target arrow and a reticle follow) or out of the hand for cards with no target; keys and taps do the same. Cards cost Lumen, deal damage, give ward, apply statuses, draw cards. Played cards go to the discard pile (or fade for the rest of the fight); when the draw pile is empty the discard pile is shuffled back in (seeded). Every foe shows an **intent tag** above its head before it acts: glyphs for attack (with the per-hit number and hit count), ward, buff, debuff, heal; the numbers are live (they change as soon as the player saps the foe or gets exposed). The player ends the turn, the hand is discarded, and the foes act one by one, each exactly as its tag said. Ward absorbs damage and drops at the start of its owner's next turn. Seeded, frame-stepped (`?t=&freeze=1` deterministic), with a bot that searches the turn's plays and performs them through the player's own input path. A starter game (The Lantern Road) strings four fights with rests and card rewards (pick 1 of 3).

## Default parameters

| key | default | meaning |
|---|---|---|
| `energy` | 3 | Lumen refilled each turn |
| `draw` | 5 | cards drawn at the start of each turn |
| `handMax` | 10 | a draw beyond it is skipped |
| `fan` | 6 | degrees between cards at rest (capped by 40 / hand size) |
| `speed` | 1 | playback speed (timing only, never the result) |
| `intents` | on | intent tags shown |
| `arrow` | on | target arrow while aiming |
| `numbers` | on | built-in hit numbers (turn off when C-11 or E-01 draws them) |

Rules constants: damage = floor((n + Might) x 0.7 if Sapped x 1.3 if the target is Exposed); ward absorbs first; Burn deals its stacks at its owner's turn end through ward, then drops by 1; Exposed and Sapped lose 1 at their owner's turn end; Barbs returns its stacks to an attacker.

## Variants

- **Standard**: 3 Lumen, 5 cards.
- **Big hands**: 4 Lumen, 7 cards, tighter fan.
- **Lean deck**: 2 Lumen, 4 cards: every play matters.
- **Blind foes**: no intent tags (the readout and caption still name the move on hover), a harder, older style.
- **Quick playback**: speed 2.

## Interface

Needs: a deck (card ids), the encounter's foes (enemy ids), hero HP, the content tables (built-ins ship), a seed per encounter, a fixed 60 Hz step, key or pointer input while the fight runs, a place to go when it ends.

Provides: `create(options)` → `start`, `update`, `drawScene`, `drawUI`, `key`, `pointer`, `play`, `endTurn`; `onHit(ev)` per HP change on its impact frame (`{kind, source, target, side, raw, blocked, amount, hpBefore, hpAfter, killed, type, tag}`), `onEvent` (intent, act, play, draw, reshuffle, death, end...), `onTurn`, `onEnd(result, info)`; `anchor(id)` (live), `unitRects()`, `uiRects()`, `cardRects()`; `intentOf(id)`, `piles()`, `recommend()`; `drawCard()` for reward screens. The starter adds `GAME.addCard / addEnemy / addStatus`, `GAME.addons` hooks, `GAME.held`, `GAME.drawArt`.

## Screen rules (640x360 logical)

- Foes stand with their feet on y 214, centred at x 376 (1), 300 / 452 (2), 250 / 376 / 502 (3), spread over 222-542 (4+); boss scale 1.1.
- Intent tag: dark glass plate 24 px high + 6 px tail, coloured rim by the first part (attack red #ff5a4f, ward blue #62b6ff, buff gold, debuff violet, heal green), glyphs 18 px, numbers 12 px bold; sits 4 px above the sprite top; pops in with a back ease after each roll; brightens when hovered or aimed at. Its top never rises above y 34 (the top bar and readout band, y 6-26): a tall foe's tag overlaps its own crown instead.
- Foe plate under the feet: name 9.5 px, HP bar 70-110 x 8 px with a pale "ghost" that drains after a hit, ward hexagon at its left end, status chips (radius 7, count bottom-right) below.
- Hand: card 76 x 114 at rest, centre x 366, y 322 + offset² x 1.4, spread min(62, 320 / n), focus lifts to y 286 at x1.2, a selected card to y 280 at x1.24, neighbours part by min(18, 110 / n). Cards that cannot be paid are dimmed with a grey cost gem. While a card is aimed (or a foe hovered) that foe's plate is drawn again above the hand on a dark backing (focus plate), so HP, ward and statuses stay readable. A key press drops mouse-hover focus until the pointer moves again.
- Played card flies to (62, 112) at x0.86 (top-left, under the stop tag, clear of every foe) while it resolves, then to the discard pile (or rises and fades).
- Hero panel (8, 262, 166 x 90): portrait r 28, HP bar 86 x 9, LUMEN pips (flame drops 13 px, up to 6), ward hexagon on the portrait, status chips.
- Piles at the bottom right (draw 556, discard 598; 32 x 46) with count badges, a violet faded badge on the discard pile's top-left; END TURN (552, 252, 82 x 36) glows when nothing can be played.
- Banners "YOUR TURN" / "FOES ACT" for ~1 s as a 32 px strip at y 190 (below every intent tag); "VICTORY" / "DEFEAT" stays at y 120.
- Readout pill at the top (y 6, centred at x 394, max 300 px): what a hovered or aimed foe intends, the card being played, the move a foe uses.
- Built-in numbers: start near the top of the sprite (22 %, at most 30 px down), each further hit on the same unit 20 px further out to alternating sides, then arc 14 px up and 10 px out with a back-ease pop and a soft shadow; ward / status words sit to the right of the sprite, stacked 12 px. 1 s.
- Foes are painted into their own canvas and lit: a warm back rim from the lantern glow behind them, a warm key from the left, a cool fill from the right, darker feet, a slow breath (`params.light: 'off'` draws them flat).

## Common mistakes (symptom -> fix)

- The tag says 7 but the foe deals 9 -> a status was applied between the roll and the act by code outside the rules, or the move applies a status before its hit and the tag ignores it. Change outcomes only through the tables; the module counts statuses the move applies before its own hits.
- Cards vanish or the counts drift (draw + hand + discard + faded ≠ deck) -> the host edited `hand()` or the piles; add cards with `addCard(id, where)`.
- Nothing happens after a click -> `update()` is skipped while a menu shows; call it every step.
- A different fight every reload -> pass a seed per encounter; never use `Math.random` in code effects or patterns (use `api.rng()`).
- Damage numbers twice -> turn the built-in numbers off (`params.numbers: 'off'`, starter: `GAME.flags.builtinNumbers = false`) when another element draws them.
- Numbers float over the intent tags or the hand -> the addon ignored `uiRects()` (intent tags, cards) or used a stale home position instead of `anchor(id)`.
- The bot stalls -> `autoplay` returned an invalid move; return `undefined` to fall back to the built-in bot.

## Acceptance moments

- Player turn: a fanned hand, a lifted card with the target arrow and reticle on a foe, the foe's intent tag brightening, the readout naming its move.
- A foe with ward (hexagon on its plate) and statuses (chips), a hit on it with a slash and number, the HP ghost draining.
- Foes act: "FOES ACT" banner, a foe lunging, claw marks and a red vignette on the hero, ward absorbing ("blocked n").
- A reshuffle: card backs flying from discard to draw.
- Starter: title, road map, reward (pick 1 of 3 with rest), boss fight, end screen; `?auto=1` reaches the end with no errors.

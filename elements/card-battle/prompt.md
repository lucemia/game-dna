# Turn my game's fights into a card battle with foe intents

Parameters (defaults): `{{energy}}` = 3, `{{draw}}` = 5, `{{handMax}}` = 10, `{{fan}}` = 6, `{{speed}}` = 1, `{{intents}}` = on, `{{arrow}}` = on, `{{numbers}}` = on.

You get `card-battle.js` (one global, `GameDNA_CardBattle`) and its `README.md`. Include the file **verbatim** with `<script src>` (or paste it unchanged) before my game script. Never rewrite it.

**What it does:** a fight becomes a turn-based card battle on its own 640x360 stage (mapped into `view`): a drawn hand, Lumen (energy) per turn, cards dragged onto foes with a target arrow (keys and taps too), draw / discard piles that reshuffle, ward, statuses, and foes that show an intent tag with real numbers, then do exactly that. Seeded, fixed-step, with a bot.

## Integration points (by role; hook, don't replace)

1. **Content.** Map my attacks / skills / items to cards and my monsters to foes as plain data (format in the README): `{name, cost, type, target: 'enemy'|'none', text: 'Deal {damage} damage.', effects: [{do: 'damage', n: 6}]}`; foes `{name, hp, look, palette, moves: {bite: {name, effects}}, pattern}`. The hero's deck = my character's skills/items as card ids (8-12 cards).
2. **Where a fight starts:** `battle = GameDNA_CardBattle.create({view: {x: 0, y: 0, w, h}, cards, enemies, params: {energy: {{energy}}, draw: {{draw}}, handMax: {{handMax}}, fan: {{fan}}, speed: {{speed}}, intents: '{{intents}}', arrow: '{{arrow}}', numbers: '{{numbers}}'}, drawBackground, onHit, onEnd})` once; at each encounter `battle.start({deck, foes, hero: {hp, maxHp, name}, seed})` with a fixed seed per encounter.
3. **Fixed step:** `battle.update(stepMs)` every step of every loop (also my `?t=` fast-forward), `0` while frozen; never gated by menus.
4. **Draw:** `battle.drawScene(ctx)`, my effects, `battle.drawUI(ctx)`, then my HUD.
5. **Input while the fight runs:** keys → `battle.key('left'|'right'|'up'|'down'|'ok'|'back'|'end')`; pointer down/move/up → `battle.pointer(type, x, y)` in my logical px. My other key handlers stay for other scenes.
6. **Autoplay:** if my game has one, `battle.setAuto(true)`; the bot plays through the same path.
7. **Fight ends:** `onEnd(result, info)` once: copy `info.hero.hp` to my hero, run my existing win / lose code once, set the phase my other code reads.

## Rules

- During a fight nothing else changes HP or piles: my old turn loop stays uncalled (keep the function), `onHit` only gives feedback.
- No `Math.random` or clock in card code, patterns or hooks (`api.rng()` instead).
- Keep every key, restart, title, `?auto=1`, `?t=&freeze=1` and my resolution working.

## Self-check without a browser

- The module is byte-identical; every identifier used at load exists.
- Trace one fight: start → update each step → play → `onHit` per hit → end turn → foes act → `onEnd` once → my next screen.
- Grep every HP write: none runs between `start` and `onEnd`.
- Walk one hit: Thorn Jab 6 + Might 2 = 8, target Exposed: 8 x 1.3 = 10.4 → 10; ward 4 absorbs 4, HP −6.

## Acceptance checks

- A fanned hand; dragging an aimed card shows the arrow and reticle; an unpayable card is dimmed.
- Each foe's intent tag shows its move's numbers; after End Turn it does exactly that (a sapped foe's tag drops at once).
- The discard pile reshuffles into the draw pile when it runs out.
- `?auto=1` still finishes my game, no console errors.

# draining-hp-bar.js (C-08 module, v1.0.1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_DrainingHpBar`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns the whole life of a health bar on screen: the instant drop, the pale **loss segment** that holds where the health was and then drains, hits that merge into one segment, the **gain segment** a heal shows before the fill rises, the low-HP pulse, the hit flash and shake, and the drawing (a framed boss bar, a party HUD bar, a small over-head bar; smooth on HD canvases, crisp whole-pixel bars on native pixel canvases). Your game keeps its own HP; the module only watches the numbers you give it.

It never changes game state, never reads input and never uses random numbers.

## API

`GameDNA_DrainingHpBar.create(options)` returns an instance.

| option | meaning |
|---|---|
| `params` | See the table below. |
| `skin` | Optional `GameDNA_Skin` id or object: with `theme: 'skin'` the colours come from the skin's `bars.hp`, `fx.hot`, `fx.heal`, `bars.hpLow`, `ui.*` tokens; a pixel skin selects the crisp bars. Without it the module draws its own look. |
| `debug(event)` | Optional: `track`, `damage`, `merge`, `drain`, `drained`, `heal`, `fill`, `filled`, `reset` with `id` and values. |

| param | default | range | meaning |
|---|---|---|---|
| `hold` | 450 | 0-3000 ms | How long the loss segment waits before it drains. A new hit during the hold or the drain restarts it (merge). |
| `holdCap` | 1600 | 0-6000 ms | Longest a merged chain may keep the segment up (hold + drain time since the chain's first hit); after that new hits drain at once, so a stream of small hits still drains. |
| `drain` | 0.7 | 0.05-5 bar/s | Drain speed in whole bars per second (a 40 % loss drains in ~0.57 s). Any drain takes 140 ms to max(1100 ms, 0.35 / drain s). |
| `ease` | smooth | smooth, out, linear | Drain curve: ease-in-out cubic, fast-then-slow, or constant. |
| `gainHold` | 240 | 0-2000 ms | After a heal the gain segment grows in (120 ms), waits this long, then the fill rises. |
| `fill` | 0.9 | 0.05-5 bar/s | Speed of the fill rising into the gain segment (ease-out). |
| `low` | 0.25 | 0-0.9 | At or below this fraction (and above 0) the fill turns the low colour and pulses. |
| `pulse` | on | on, off | Low-HP pulse (0.9 s cycle; the boss frame glows; crisp bars blink in two steps). |
| `flash` | on | on, off | 160 ms white flash on a hit (the new loss segment starts white). |
| `shake` | 2 | 0-6 px | Shake on a hit: boss bars full, party bars half, over-head bars never. |
| `theme` | auto | auto, crimson, verdant, azure, amber, skin | auto: boss and foes crimson (loss pale gold), party and allies verdant (loss red). Gain is mint in every theme. |
| `ticks` | 0 | 0-20 | Divider ticks; 0 = auto (boss 4, others none). |
| `render` | auto | auto, smooth, crisp | auto = crisp when the canvas is <= 512 px wide or `imageSmoothingEnabled` is false (native pixel games), smooth otherwise. |
| `number` | roll | roll, jump | The `text` readout rolls to the new value over 380 ms, or jumps. |

| method | |
|---|---|
| `set(id, hp, max)` | Give the current HP. Call it every fixed step for every unit that shows a bar (or right after HP changes). The first call for an id starts without animation; after that a lower value is a hit, a higher one a heal. Any id: a string or number you already use for the unit. |
| `reset(id, hp, max)` | Jump to a value with no animation: new battle, new wave, respawn, restart, loading a save. |
| `update(dtMs)` | Every fixed step, in every scene. `update(0)` holds every timer (pause). |
| `draw(ctx, id, x, y, w, h, opts)` | Draw one bar; `x, y, w, h` = the bar's inner rect in the ctx's current coordinates. Inside a camera transform for over-head bars (world space), outside it for HUD bars. `opts.style`: `'boss'` (frame, ornaments, name above, ticks; leave ~h + 12 px above and ~h/4 around), `'party'` (outlined pill, optional label and number above), `'unit'` (small over-head bar; hides itself 1.4 s after it is full again, and after the unit's bar has drained to 0). `opts.label` (name), `opts.text` (`'hp/max'`, `'hp'`, `'percent'`), `opts.team` (`'ally'` / `'foe'`: colour under `theme: auto`), `opts.alpha`, `opts.hideFull`, `opts.ticks`, `opts.shake: false`. |
| `state(id?)` | `{hp, max, main, gainTop, ghost, phase (idle, hold, drain), gain (idle, hold, fill), loss, gainSeg, holdLeft, chain, low, number, flash}`; without an id, every bar. Invariant: `main <= gainTop <= hp <= ghost`. |
| `curve(id)` | The last 900 steps: `[ms, hp, main, gainTop, ghost, phaseLetters]`. |
| `shown(id)` | The rolling number (use it for your own HP text so text and bar agree). |
| `busy(id)`, `has(id)`, `remove(id)`, `clear()`, `setParams(p)`, `params()`, `lastDrawn()`, `stats()`, `time()` | `lastDrawn()` = bars drawn since the last update `{id, style, x, y, w, h (canvas px), alpha, crisp, hp, main, ghost, phase}`. |

## Integration (15 lines)

```js
// <script src="draining-hp-bar.js"></script> before your game script
const hpBars = GameDNA_DrainingHpBar.create({ params: { hold: 450, drain: 0.7 } });
function startBattle() { /* existing code */ for (const u of allUnits()) hpBars.reset(u.id, u.hp, u.maxHp); }
function fixedStep(dt) {
  /* existing update code */
  for (const u of allUnits()) hpBars.set(u.id, u.hp, u.maxHp);   // the module sees hits and heals itself
  hpBars.update(dt);
}
function render() {
  /* world, inside the camera: */  for (const e of visibleEnemies()) hpBars.draw(ctx, e.id, e.x - 14, e.y - e.h - 8, 28, 4, { style: 'unit', team: 'foe' });
  /* HUD, outside the camera: */   hpBars.draw(ctx, boss.id, 170, 30, 300, 12, { style: 'boss', label: boss.name });
  for (const [i, h] of party.entries()) hpBars.draw(ctx, h.id, 80, 300 + i * 18, 110, 6, { style: 'party', team: 'ally' });
}
```

Replace the game's own bar drawing (the fill rect and its background) with `draw`, at the same rect, and keep everything else: the HP text, names, MP bars, frames and any variable other code reads. If the game had its own "displayed HP" that eases toward the value, leave the variable in place (other code may read it), just stop drawing from it. Ids must stay the same for a unit for its whole life; a new unit reusing an old id needs `reset`.

**Dead or removed units: keep the bar until it settles.** A killing blow is a hit like any other: its loss segment holds and drains. If your game stops drawing a unit (and its HP bar) the moment it dies, that drain is never seen. Keep the unit's id in the list you `set` every step, and keep drawing its bar at its last position while `hpBars.busy(id)` is true (`busy` = the loss segment or a heal is still animating); then stop (`hpBars.remove(id)` is optional). Over-head bars at 0 HP fade out by themselves after the drain.

## What it guarantees

- A drop shows on the same frame (`main` = new value); the loss segment stays at the old value for `hold` ms, then drains without ever rising, ending exactly at the value.
- Hits during the hold or the drain merge: the segment keeps the chain's highest value and the hold restarts, but never past `holdCap` from the chain's start.
- A heal never shows a loss: the gain segment reaches the new value in 120 ms, the fill waits `gainHold` and then rises without ever going down.
- `main <= gainTop <= hp <= ghost` after every call. Low HP is off at 0 HP.
- Deterministic: same `set` and `update` calls, same pixels. No `Math.random`, no wall clock, no fonts loaded (system sans; crisp mode has its own 3x5 font).
- Never throws from `set`, `reset`, `update` or `draw`; bad numbers are clamped, an unknown id in `draw` logs one warning.
- Cost (headless Chromium, 2026-11-18, load ~2, median of 5 x 100 frames, rasterised with a 1 px read-back): the demo's 6 bars (boss + 3 party with text + 2 over-head) draw in about 0.37 ms per frame on an 870 px backing store; `update` is negligible.

## Self-check without a browser

- The module file is byte-identical to the one given.
- `set` is called for every bar's unit every step (or after every HP change), with the same id `draw` uses.
- `reset` at new game, new battle or wave, respawn: otherwise a fresh full-HP unit shows a heal animation.
- A unit that dies or is removed keeps its `set` and `draw` while `busy(id)` is true.
- `update` runs every fixed step in every scene; `draw` sits where the old bar was drawn, in the same coordinate space.
- Walk one hit: HP 100 -> 60, `set` sees it, the fill drops to 60 %, the pale segment covers 60-100 %, 450 ms later it drains.

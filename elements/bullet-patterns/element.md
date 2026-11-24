# A-08 Bullet-pattern emitter

## 1. What it is

The enemy fire of 2020s action games and shooters: a caster opens a fan aimed at the player, a ring that blooms outward, a turning spiral, a six-petal flower whose bullets slow between the petals, a weaving wave, a curtain with one moving gap, big orbs that burst into rings of rice bullets, curving and falling shots. Patterns are plain data (shape, count, spread, speed, acceleration, turn, curves, bursts, rotation, sub-patterns), so a designer authors them without code and an agent can check them. Every bullet comes from a fixed pool made once, so a screen of a thousand bullets allocates nothing per frame.

Bullets are drawn in code to be read at a glance: a white core, a coloured body and rim, a dark outline that keeps them visible on grass, stone and sky, and a soft halo; rice and shard bullets point along their flight. Each bullet hits with a circle much smaller than it looks (40 % of its radius by default), tested along its path since the last step so fast bullets never pass through the player. Passing close counts as a graze. Walls stop bullets; when a caster dies its bullets turn into fading sparks.

The game keeps its rules: it tells the module where the player's small hit circle is and whether the player can be hurt now, and it applies damage itself in `onHit`. A static `safeGap()` fires a pattern in isolation and sweeps the band the player can reach, reporting whether a gap at least the player's hit circle stays open, and reachable at the player's speed, at every step.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `speed` | 1 | 0.4–2 | Multiplier on every pattern's speed (and acceleration) |
| `density` | 1 | 0.4–2 | Multiplier on bullet counts (fan, ring, flower, wave, line; spirals keep their arms) |
| `size` | 1 | 0.6–1.8 | Multiplier on drawn radius |
| `hitbox` | 0.4 | 0.2–1 | Hit radius as a fraction of the drawn radius |
| `halo` | 0.6 | 0–1.2 | Halo alpha (drawn under every body so crowds never hide cores) |
| `graze` | on | on, off | Report grazes within `grazeRange` 9 px x scale beyond touching |
| `palette` | arcane | arcane, ember, frost, venom, royal, blood, mono, skin | Two alternating hues |
| `render` | auto | auto, pixel, smooth | auto = pixel when the context has `imageSmoothingEnabled === false` |
| `damage` | 2 | 1–10 | Default damage passed to `onHit` (a pattern's own `damage` wins) |

Presets (speeds px/s and sizes px at scale 1 = view height 360): `fan` 7 rice, 70 degrees, 120 px/s, 3 bursts, aimed; `ring` 20 orbs, 95 px/s, 3 bursts turning 9 degrees; `spiral` 4 arms coloured by arm, 40 bursts 90 ms apart, 12 degrees per burst; `aimed` 3 shards, 24 degrees, 170 px/s + 40 px/s^2, 4 bursts 170 ms apart; `flower` 60 orbs, 6 petals, depth 0.7; `wave` 9 rice, 100 degrees, 14 px sine at 1.4 Hz; `line` 14-orb wall, every 5th missing, gap moves 2 per burst; `bloom` 6 big orbs braking to a stop, each splitting into a ring of 8 rice at 1.3 s; `helix` two counter-turning spirals; `whirl` 16 shards turning 50 degrees/s easing to 0; `rain` a falling curtain with gravity 90 px/s^2 and 14 % speed jitter per drop.

## 3. Variants

- **Arcane caster** (default): violet and magenta, speed 1, density 1.
- **Gentle (story mode)**: speed 0.75, density 0.7, hitbox 0.3.
- **Dense curtain**: density 1.6, speed 0.9, size 0.85.
- **Fast and sparse**: speed 1.6, density 0.6, ember.
- **Frost turrets**: frost palette, halo 0.9.
- **Pixel host**: render pixel, halo 0.5: whole game pixels, a 1-pixel dark outline, a two-step halo.
- **Calm (no halo)**: halo 0, mono.

## 4. Interface

**Needs**
- A fixed step calling `update(stepMs)` once after movement (also in `?t=` fast-forward and `?auto=1`), `update(0)` while paused, in hit-stop or behind a window.
- `player()` → `{x, y, r}` world px (the small hit circle) or `null`; `canHit()` mirroring invulnerability.
- `onHit(hit)` calling the game's own damage function with `hit.damage`.
- Per caster: `emit(id, {pattern | cycle, source, every, range})` once at spawn; `cancel(id)` + `stop(id)` at death.
- `draw(ctx, camX, camY)` after the sprites, before the HUD; `clear()` on new game, restart and scene switches.
- Optional: `bounds` (world rect), `solid(x, y)` (walls), `onGraze`.

**Provides**
- `fire`, `emit`, `cancel`, `clear`, `danger(x, y, r, aheadMs)` (for autopilots), `stats()`, `list()`, `hash()`.
- `GameDNA_Bullets.safeGap(pattern, opts)` → `{ok, gapOK, reachOK, minGap, need, gapFailT, reachFailT, peak}`.

**Skins.** `palette: 'skin'` uses the skin's `fx.hot` and `fx.cold`; a pixel skin selects pixel render.

**Delivery.** `module/bullet-patterns.js` (global `GameDNA_Bullets`; API, pattern format and a 15-line integration in `module/README.md`), `prompt.md`, the basket hint `tools/basket/bullet-patterns.mjs` and the judge probe `judge/probes/bullet-patterns.js`.

## 5. Screen rules (exact numbers)

`scale` s = view height / 360 (0.62 at 224, 1 at 360).

- **Sizes**: drawn radius = pattern size x `size` x s (5 px at s 1 = 10 px across); hit radius = drawn x `hitbox` (2 px). Player hit circle 2-5 px.
- **Look (smooth)**: outline band max(0.9, 0.2 r) px in the hue's dark tone at 95 %, rim to r, body inside 0.24 r, white core inside 0.5 r; halo exp falloff to 1.1 r + 2 px outside. Pixel: radius floor(r) + 0.5, 1 px outline, body inside 1 px, core inside max(1.6, 0.48 r); halo 34 % to 0.75 r + 1 px, 14 % to 1.45 r + 1.5 px.
- **Sprites**: cached per kind, size, hue, device scale and angle (32 angles smooth, 16 pixel, 8 for halos), blitted 1:1 on whole device pixels (pixel sprites enlarged by whole device px).
- **Birth**: bullets start at the caster's `muzzle` radius (demo: 32 px x scale, outside the warden's body); alpha ramps 35 % -> 100 % over 110 ms; smooth render also grows them from 45 % over 90 ms (pixel render never scales sprites); the last 300 ms of life fade out. Muzzle flash 170 ms. Cancel: sparks grow to 160 % and fade over 260 ms. Wall: a 150 ms ring. Hit: 10 sparks, a 260 ms white ring on the player, and (with `clearRadius`) every live bullet within that radius cancelled into sparks.
- **Hits**: segment from the previous position to the current one vs the player circle; at most one hit per `update`; graze once per bullet within r_player + r_drawn + 9 s.
- **Culling**: outside `bounds` + 48 s px, after `life` (9 s), or in a `solid` spot after 60 ms of age.
- **safeGap**: band at `dist` 120 px, `width` 260 px, 0.5 px cells; gapOK = a free run of player-centre cells at every step (gap between hit circles >= 2 r); reachOK = the free set reachable by dilating `playerSpeed` x dt each step never empties. Every preset passes at the defaults; a 90-orb ring fails gapOK at 1300 ms, a jumping-gap curtain fails reachOK at 450 ms.
- **Cost** (v1.0 measurement; v1.1 changes only spawn, fade and presets; 1000 live bullets, halos on, headless Chromium, load < 3, median of 3): smooth on a 640x360 field, 1280 px dpr 2: 6.8 ms draw, 0.03 ms update; 390 px dpr 3: 2.2 ms. Pixel on 320x180 (bullets twice the screen size): 12.0 ms and 7.3 ms (`checks/perf.json`).

## 6. Common mistakes (symptom → fix)

- Bullets hit beside the player, or never → `player()` returns screen px in a scrolling game, or the sprite's top-left; return world px of the body centre.
- Bullets aim at the top-left of the map → `player()` returns `null` or (0, 0); keep it the live player.
- The screen floods within seconds → `emit` or `fire` called every frame; emit once per caster, fire from an attack with a cooldown.
- A dead enemy keeps shooting → its source does not return `null`; also `cancel(id)` and `stop(id)` where it dies.
- HP drops twice per hit, or the player dies without the death screen → damage written directly; call the game's damage function in `onHit`.
- Bullets keep flying under a pause menu or dialogue → `update(0)` while the world is stopped.
- `?t=&freeze=1` frames differ → `update` called from render; call it in the fixed step.
- Leftover bullets after a scene switch or restart → `clear()` there.
- Bullets slide with the camera → camera passed twice (inside a camera translate pass `0, 0`).
- Autoplay now dies → damage too high or range too long; 2-4 % of max HP, range about half the view, keep `canHit` tied to invulnerability.
- A pattern feels unfair → run `safeGap(pattern, {playerR, playerSpeed})`; `ok: false` means no way through.

## 7. Acceptance moments

All at 960x540 (320x180 native x 3), `demo/index.html`:

1. **Fan** `?t=1500&freeze=1`: two fans of rice bullets aimed at the hero, alternating violet and magenta, pointing along their flight.
2. **Ring** `?t=4300&freeze=1`: a fresh ring around the warden.
3. **Spiral** `?t=9000&freeze=1`: four arms in two alternating colours curling out over the plaza; the warden stays clear.
4. **Flower** `?t=12000&freeze=1`: one six-petal flower around the warden, petals in alternating colours.
5. **Bloom split** `?t=20300&freeze=1`: big orbs, braked away from the warden, bursting into rings of rice bullets; the warden is fully visible.
6. **Helix** `?t=25600&freeze=1`: two counter-turning spirals.
7. **Side-on rain** `?t=2600&view=side&freeze=1`: a falling curtain with gaps; the warden floats on the left, the knight stands on the right in its native left-facing art (never mirrored: sword and shield would swap hands).
8. **Hit** `?t=1250&auto=0&freeze=1`: the standing hero just hit: white flash, and bullets within the clear radius fading into sparks.
9. **Hit circles** `?t=9500&hits=1&freeze=1` (with the hero's focus marker): green hit discs far smaller than the drawn bullets.
10. **Smooth render** `?t=9500&render=smooth&freeze=1`; **line gap** `?t=3000&pattern=line&freeze=1`.
11. **Hosts**: topdown slimes spitting fans and rings (pixel render), hd-topdown boss spiral and flower; `?auto=1` ends as the original (`checks/hosts/README.md`).

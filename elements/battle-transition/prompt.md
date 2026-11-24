# Add a shatter battle transition to my game

Defaults (change any of these before pasting):
`{{variant}}` = shatter · `{{reveal}}` = match · `{{duration}}` = 900 · `{{pieces}}` = 6 · `{{spin}}` = 240 · `{{flash}}` = on · leave effect `{{leave}}` = iris

---

You are given `battle-transition.js`, a finished module, and its `README.md`. **Include it verbatim** (`<script src>` before the game script, or pasted unchanged into its own `<script>`); never rewrite it. It defines one global, `GameDNA_BattleTransition`.

On entering a battle the current frame cracks from the point of contact, breaks into shards that spin and fall, holds dark briefly, and the battle is revealed. Only add code; never remove or rename existing functions.

**First, read the game and list** (in a comment): the fixed-step function, every call of the render function (live loop **and** any `?t=` / freeze / fast-forward path), every place that enters or leaves a battle or changes wave, where input is read, and their other callers (autoplay `?auto=1`, shortcuts, restart, title).

**Integration points**

1. **Create one instance** once the canvas exists:
   `const tr = GameDNA_BattleTransition.create({ view: {x: 0, y: 0, w: <native width>, h: <native height>}, canvas: <screen canvas>, seed: 1, params: { variant: '{{variant}}', reveal: '{{reveal}}', duration: {{duration}}, pieces: {{pieces}}, spin: {{spin}}, flash: '{{flash}}' } });`
2. **Enter battle**: in the function that starts a battle, as its **first** line, before anything that changes what is drawn:
   `tr.start({ capture: () => { <render the current frame>; return <screen canvas>; }, focus: {x, y}, onMid: () => {}, onDone: () => {} });`
   `focus` = the player's (or touched enemy's) screen position. Leave the existing scene switch where it is: the module covers the whole screen until 55 % of the time, then reveals what the game draws.
3. **Leave battle / next wave**: the same call with `variant: '{{leave}}'` first in that function (skip if `none`).
4. **Step**: in the fixed-step function, after input is read and cleared, **before the autoplay input and any world logic**:
   `if (tr.busy()) { tr.update(<step in ms, e.g. 1000 / 60>); return; }` (milliseconds).
5. **Draw**: `tr.draw(ctx)` as the **last** draw of every frame, after the scene, HUD and dialogs, at every call site of the render function you listed (live loop and freeze path). Never inside a branch that returns early for one scene.
6. **Restart / new game / back to title**: `tr.reset()` there.

**Self-check without a browser**
- The module file is byte-identical to the one given.
- `tr` is defined before the first step runs (including the `?t=` fast-forward loop, which runs at load).
- Every render call site you listed is followed by `tr.draw(ctx)`; the freeze path too.
- Walk one encounter: collision → start (capture renders the old scene) → steps return early while busy, calling `update` → `onMid` at 55 % → reveal → `onDone`; the battle then continues from where it was.
- Autoplay reaches the same end as before (only later); restart and title still work.

**Acceptance checks** (screenshots if you can)
1. `?t=<encounter time + 200>&freeze=1`: the map breaking into shards over a dark backdrop; cracks start at the player.
2. A frame a little after 55 %: the battle being revealed (fade, iris or mosaic), never a black screen once the transition ends.
3. Pressing keys during the transition does nothing; the first command after it works.
4. `?auto=1` runs to its end with no console errors and the same result as before.

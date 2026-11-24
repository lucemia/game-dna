// Basket hint for G-08 run-map: how to wire the module into an UNKNOWN game, by role.
export default {
  stage: 'systems',
  lead: 'The run map wraps the game\'s existing play: {{wrap}}.',
  does: 'A seeded roguelite route: floors of battle, elite, event, shop and rest nodes joined by paths that never cross, rising to a boss. `start()` at a new game opens the map; the player picks a connected node (arrows, mouse, touch), a token travels there, and the module calls the game\'s `onEnter(node)`. Fight nodes (`battle`, `elite`, `boss`) start the game\'s own fight or room; the game calls `finish({won})` where that fight is decided and the map comes back one floor higher with the route in gold. Rest, shop and event nodes are module panels running the game\'s own `apply` choices. While `busy()` the world waits; autoplay picks by itself.',
  params: {
    wrap: 'what battle / elite / boss nodes play (shown at the top)',
    seed: 'create `params.seed` (the map\'s own seed; never the game\'s RNG)', floors: 'create `params.floors`', width: 'create `params.width`', paths: 'create `params.paths`',
    wElite: 'create `params.wElite`', wEvent: 'create `params.wEvent`', wShop: 'create `params.wShop`', wRest: 'create `params.wRest`', eliteFrom: 'create `params.eliteFrom`',
    look: 'create `params.look` (auto = pixel map below 300 px tall)', autoRoute: 'create `params.autoRoute`'
  },
  steps: [
    ['Game data, next to the player\'s stats',
      'Node content with original neutral-fantasy names: `nodes: {rest: {choices: [2 choices]}, shop: {choices: [3 items with cost]}, event: {pool: [3 events {title, text, choices: [2]}]}}`; each choice `{label, text, cost, priority, apply: node => \'<result line>\'}` changes a stat the game already has (HP, max HP, attack, coins). **A game without coins gets none**: no `cost`, no `getGold` / `spendGold`; the shop becomes one free pick and events trade HP for max HP or attack. Never add HUD bars for new or duplicate stats.'],
    ['Once, after the screen size and HUD layout exist (one instance for the whole game)',
      '`run = GameDNA_RunMap.create({view: {w, h}, params: {seed: {{seed}}, floors: {{floors}}, width: {{width}}, paths: {{paths}}, wElite: {{wElite}}, wEvent: {{wEvent}}, wShop: {{wShop}}, wRest: {{wRest}}, eliteFrom: {{eliteFrom}}, look: \'{{look}}\', autoRoute: \'{{autoRoute}}\'}, uiRects: () => [HUD rects], autoplay: () => <autoplay flag>, hpFrac: () => hp / maxHp, getGold: () => coins, spendGold: n => { coins -= n; }, onEnter: node => {...}, nodes: NODES})`.'],
    ['Every place a new game starts (after the title, restart from a pause menu, after game over)', '`run.start()`.'],
    ['Where a fight, room or wave starts ({{wrap}})',
      'From `onEnter(node)`: `battle` starts one of the game\'s fights, `elite` a tougher one (scale by `node.tier`, 0 bottom to 1 top), `boss` the final fight or goal. What the old game reached by walking (a gate, the final area) opens at the boss node, so the autopilot cannot finish the game before the run reaches it; until then the HUD\'s pre-run objective text shows the current node (or hides).'],
    ['Every place that fight is decided: won, lost, fled, timed out',
      '`run.finish({won: true | false})` once (only while `run.away()` is set). After the boss, the game\'s own ending runs.'],
    ['Top of your fixed update step (the one the animation loop, the `?t=&freeze=1` fast-forward and autoplay all call), before the world and the autopilot',
      '`if (run.busy()) { run.update(1000 / 60); return; }`; when not busy: `run.update(1000 / 60)` once per step.'],
    ['Key handler; pointer handler', 'First line of keydown: `if (run.key(e.code, true)) { e.preventDefault(); return; }`; keyup: `run.key(e.code, false)`. Polled input: `run.press(\'left\' | \'right\' | \'confirm\' | \'back\')` on edges. Pointer in native px: `run.pointer(x, y, down)`.'],
    ['Your draw pass', '`run.draw(ctx)` last, after the HUD and the game\'s own windows, under the HUD\'s canvas transform, outside any shake translate.']
  ],
  gotchas: [
    'The map never returns after a fight -> one ending of that fight (fleeing, a timeout, a second win path) does not call `finish()`.',
    '`?auto=1` hangs on the map -> pass the autoplay flag and keep `update()` in the fixed step the freeze loop calls.',
    '`?auto=1` ends before the boss node or never reaches it -> the old goal is still open from the start (or stays shut): open it at the boss node.',
    'A choice says +2 but nothing changes -> `apply` writes a copy or a field nothing reads.',
    'Coins are taken twice -> pass `spendGold` only when `apply` does not charge already.',
    'A restart keeps the old route -> `start()` at every new game.'
  ],
  checks: [
    'A new game opens the map; arrows / mouse / touch move between connected nodes only; Z travels; the route is drawn in gold and paths never cross.',
    '{{wrap}}: each fight node plays the game\'s fight and the map returns one floor higher; rest / shop / event choices change the game\'s real stats; the boss ends the run with the game\'s own ending.',
    '`?t=<ms>&freeze=1` gives the same frame every time; `?auto=1` still ends, no console errors.'
  ],
  selfcheck: [
    'Grep `start(`: at every new game. Grep `finish(`: on every path out of a fight that `onEnter` starts. Grep `create(`: once.',
    'Grep `update(`: every fixed step including while busy; the busy gate sits before the autopilot.',
    'Walk one floor: `start()` -> fade 0.32 s -> about 0.9 s later (autoplay) or Z -> travel 0.62 s -> `onEnter(battle)` -> fade 0.26 s -> the fight -> `finish({won: true})` -> the map reopens with that node checked.'
  ],
  offers: {
    'ui-rects': { title: 'run map sheet', text: '`run.rect()` is the open map sheet, or null; while it is open other overlays should wait or stay hidden.' },
    'battle-start': { title: 'fight nodes', text: 'Fights now start from the run map\'s `onEnter(node)` (`node.type` battle / elite / boss, `node.tier` 0..1).' }
  },
  wants: {
    'ui-rects': { title: 'UI rects', text: 'Return them from the run map\'s `uiRects()`, so the map sheet and its floor badge never cover them.', check: 'The map sheet and the floor badge never cover the other element\'s windows, plates or HUD.' }
  }
};

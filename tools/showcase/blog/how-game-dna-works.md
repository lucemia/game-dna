You ask your coding agent for "damage numbers that pop out of the enemy". It says done. Then the numbers float next to the wrong unit, the turn loop freezes, or the game's own autoplay can't finish a run anymore. The request was one sentence. The fix takes an afternoon.

I wanted that one sentence to be reliable. So I built Game DNA: 101 browser-game elements, from [hit-stop and screen shake](@/dna/hit-stop-shake/) to [card battles](@/dna/card-battle/), [tactics grids](@/dna/tactics-grid-3d/) and a [3D kart racer](@/dna/kart-racer-3d/), and tested every one of them the hard way: an agent with no hints adds it to a game it has never seen, and another agent plays the result. More than 700 judged runs later, the most useful finding is uncomfortable. When the agents failed, the cause was surprisingly often in my own docs.

Here is what's in the library, how the testing works, and the four stories that changed how I build it.

## What an element is

Each element is three things:

- a small JavaScript module with no dependencies,
- a prompt of at most 600 words that tells *your* agent how to wire the module into *your* game (it names the interfaces to look for, not a specific engine),
- a playable demo.

81 are drop-in add-ons: feel and effects, UI, audio. 20 are systems that would replace your core loop, like a card battle or a [squad tactics clash](@/dna/squad-clash/); those also come as starter games you can build on. There are 14 [art styles](@/styles/), and a [basket](@/basket/) that merges several elements into one prompt.

## How an element earns its place

1. **Cold test.** A separate coding agent gets a clean folder: a host game it has never seen, the prompt, the module. Nothing else. No hints, no browser of its own, one pinned model at one pinned reasoning effort. The six host games (turn-based battle, tactics map, side-scroller, top-down adventure, two HD games) were written by yet another agent that never saw the modules. Most elements run three times on each of two hosts and must work at least two times out of three on each.
2. **A judge that plays.** A different agent opens the result in Playwright and plays it. Does the element show up where and when it should? Does the original game still work? Does the game's own autoplay still finish? Was the module file left untouched? The coding agent's own summary of what it did counts for nothing.
3. **A strict visual critic.** Every demo is scored against commercial indie games, character by character at 2× zoom. Parts that don't connect, programmer art, debug leftovers or a style mismatch are each a major issue. Pass: 7.5 or higher, no majors.

## Story 1: my prompt fixes made things worse

The first version had no modules, just prompts. Three elements, three cold runs each: 3 of 9 worked. I studied every failure and rewrote the prompts to forbid exactly those mistakes. Next round: 1 of 9. Each fix closed one hole; the agent found another.

So I flipped it. Ship a module that does the work, and let the prompt only explain how to plug it in. 9 of 9.

## Story 2: half my conclusions were measurement errors

Then I looked at my own logs. I had never pinned the model. Early runs had silently used a much weaker default; later runs used a stronger one at low effort. My "results" were a mix of both.

I pinned one model and one effort level and re-ran the experiments that had decided things. Prompt alone: 7 of 9. Prompt plus module: still 9 of 9. And my rule that "systems can't be added to unfamiliar games", based on 0–1 out of 3, became 6 of 6 clean integrations. Starter games went from requirement to option. A cold test without a pinned model and effort is not a measurement.

## Story 3: five agents, five pink enemies

A [match-3 battle](@/dna/match3-battle/) starter has a small cold-test task: add a new enemy. The first five runs all failed identically. Every new enemy came out pink.

The agents had done exactly what our README said. Our sample tinted sprites with CSS `hue-rotate()` alone, and at the angle we gave, cyan turns pink. The fix was in our docs: `sepia(1) saturate(4)` before the rotation, and the sample colour checked by actually rendering it. Later versions: 16 of 16.

It happened again with a [raycast dungeon](@/dna/raycast-dungeon/) starter: 3 of 6, then 5 of 6, then 2 of 2. Every failure was a wrong sample in our README. Agents copy samples word for word. A wrong sample is not a hint; it is a guaranteed bug.

## Story 4: my critic was too nice

Three demos passed the first visual critic with 7.5 to 8.0. Then I actually looked. [Cut-out characters](@/dna/cutout-characters/) with shields floating in front of their legs and joints showing at the elbows. Geometric placeholder people.

I wrote a stricter standard and re-scored all 61 demos that existed at the time. 18 passed. Fixing it meant real work: new character rigs with automatic joint checks, a shared set of hand-drawn characters for HD demos, a shared pixel scene kit. 51 passed, then 60 of 61. Later I added a rule that every character is rendered alone on a transparent sheet so loose parts can't hide in a busy frame.

Two elements never passed and were cut: a pixel-terrain effect stuck at 6.3, and an NPC generator that climbed from 6.5 to 7.4 over six rounds because every name-tag fix created a new problem.

## Combos: elements that have to share a game

Real games don't get one feature. They get five. The [basket](@/basket/) checks compatibility (two elements that both want to own the turn loop can't go together), merges the prompts, and drops the module files in one zip. Combos are cold-tested too: [damage numbers](@/dna/damage-pop/) went into an unseen battle, an unseen tactics game and two starter games, 12 of 12 integrations clean. Under strict placement scoring (every number at the right unit, never mistaken for a neighbour's) it was 10 of 12, and that gap is listed on the element page as a known issue, not hidden.

## How to use it in 3 steps

1. **Pick.** Open [game-dna.pages.dev](https://game-dna.pages.dev), play a few demos, pick one element, or drop several into the [basket](@/basket/) for one combined prompt. No game yet? Start from a starter game.
2. **Hand it over.** Put the module file in your project and paste the prompt into your own coding agent.
3. **Check.** Each element lists its acceptance moments: what you should see, and when. Play, check those moments, and make sure what you had before still works. The [five-minute guide](@/start/) walks through it.

## Limits, plainly

- One agent, one pinned model. Yours may behave differently.
- Three runs per host is a small sample. A pass means "went in cleanly most of the time on games it hadn't seen", not "always works".
- Hosts are small single-file canvas games. Big projects and other engines are untested.
- 3D frame times were measured on a busy machine with software WebGL. Treat them as upper bounds.
- Some demo art was made with an AI image generator and is marked ✦ AI art. The modules never call a generator; most art is drawn in code.
- The mechanics are common genre patterns, the art is original, and the project isn't affiliated with any game company.

## Try to break it


#!/usr/bin/env node
// Build the local Game DNA website into site/ from the repo data (elements/*, skins/*, tools/basket/*).
//
//   node tools/build-site.mjs            build every page
//   node tools/build-site.mjs --preview  build ONLY the showcase prototype into site/preview/ (tools/site-preview.mjs); the
//                                        rest of site/ is left as it is
//   node tools/build-site.mjs --verify   build, then check the browser basket (site/assets/combine-core.js) against
//                                        `node tools/combine.mjs` byte for byte on sample baskets (exit 1 on a mismatch)
//
// Serve from the repo root: python3 -m http.server 8000, then open http://localhost:8000/site/
// Hand-written parts live in site/assets/ (site.css, site.js, combine-core.js, zip.js, basket.js, element.js);
// everything else in site/ is generated. Hover-preview frames: tools/site-frames.py (writes site/assets/frames/).
// A new element only needs its folder (element.json, element.md, module/, demo/) and, for the basket, tools/basket/<id>.mjs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const EL = path.join(ROOT, 'elements');
const SK = path.join(ROOT, 'skins');
const require = createRequire(import.meta.url);
const Core = require(path.join(SITE, 'assets', 'combine-core.js'));
const read = p => fs.readFileSync(p, 'utf8');
const exists = p => fs.existsSync(p);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const write = (rel, s) => { const p = path.join(SITE, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

// ---------------------------------------------------------------- families, labels
const FAMILIES = {
  A: { name: 'Battle systems', blurb: 'Whole fight loops and combat UI that decide who acts and what happens.' },
  B: { name: 'Maps & movement', blurb: 'Grids, ranges, fog, height and overworld travel.' },
  C: { name: 'UI & text', blurb: 'Windows, cursors, fonts, banners and turn order.' },
  D: { name: 'Characters & portraits', blurb: 'Sprite variants and expressive faces.' },
  E: { name: 'Effects & feel', blurb: 'The feedback that makes a hit land.' },
  F: { name: 'Audio & rhythm', blurb: 'Timing and rhythm checks, and sound effects made live.' },
  G: { name: 'Economy & growth', blurb: 'Shops, items, levels and stats.' },
  H: { name: 'Dialogue & story', blurb: 'Text boxes, choices and flags.' },
  I: { name: 'Foundations', blurb: 'Resolution, scaling, backdrops, input and the WebGL post pipeline.' },
  J: { name: 'Light & post-processing', blurb: 'Real-time lights, glow and colour grading on top of a 2D game.' },
  K: { name: '2.5D, 3D & camera', blurb: 'A camera that frames the action: lead, zoom, shake and arena locks.' },
  L: { name: 'Generated art', blurb: 'Bitmap art generated once at build time in one locked style, with a sample pack.' },
  N: { name: '3D', blurb: 'Real 3D scenes on three.js: a third-person character and camera, painted billboard characters, a 3D tactics grid, toon outlines and cel shading.' }
};
// Family colours, re-picked for M9 (12 families) as ONE categorical palette per theme (2026-11-16). Method: the dataviz
// colour formula; slots searched in OKLCH (L in the mode's band, C >= 0.105, in sRGB gamut), maximising the worst
// ALL-PAIRS OKLab distance (a family chip can sit next to any other), with each light slot within 12 deg of hue of its dark
// slot so a family keeps its colour across themes. Checked with the bundled dataviz/scripts/validate_palette.js:
//   node validate_palette.js "<A..L dark>"  --mode dark  --surface #18191c [--pairs all]
//   node validate_palette.js "<A..L light>" --mode light --surface #ffffff [--pairs all]
//            lightness  chroma  CVD adjacent (A..L)       CVD all pairs            normal-vision floor      contrast
//   dark     PASS       PASS    PASS 10.2 (protan K/J)    WARN 7.1 (protan J/H)    PASS 15.4 all pairs (L/K) PASS >= 3:1
//   light    PASS       PASS    PASS 9.0 (protan H/G)     WARN 7.9 (deutan I/F)    PASS 17.0 all pairs (F/D) PASS >= 3:1
// M9 r1 critic: E/J read as two shades of blue (CIEDE2000 12.1 dark, 14.2 light). E and J re-searched under the same
// validator gates (all-pairs normal floor >= 15, adjacent CVD >= 8, contrast >= 3): closest CIEDE2000 pair now
// 15.8 in both themes (H/K), E/J 16.0 light. A warm or teal J failed the normal-vision floor against A/F or D/G.
// All checks PASS in both themes; the two all-pairs CVD WARNs (6-8 floor band) are covered by the secondary encoding the
// site always shows: the family letter in every code tag and chip. M8 had CIEDE2000 12.4 (C/H light) and 15.3 (A/F dark).
const FAMILY_COLOURS = {
  dark: { A: '#d47a12', B: '#8f76ff', C: '#9c23d2', D: '#4ea965', E: '#1f51fd', F: '#697116', G: '#00a2d3', H: '#d9018d', I: '#e60000', J: '#09709a', K: '#9b4c5d', L: '#c177a9' },
  light: { A: '#823c01', B: '#a27ffa', C: '#8025ce', D: '#13764c', E: '#384f8c', F: '#829e55', G: '#059cc3', H: '#fe47b7', I: '#ff6014', J: '#2466fe', K: '#af6280', L: '#920369', N: '#5b6475' }
};
// N (3D, 2026-11-18): no 13th hue passes the all-pairs gates next to A..L (best OKLab search: normal floor 14.1 and CVD
// 2.7 at best), so N is a neutral slate (dark #8a94a6, light #5b6475; contrast >= 3:1 on both surfaces) and relies on the
// family letter that every chip and code tag shows.
FAMILY_COLOURS.dark.N = '#8a94a6';
// release of each element (badge "New" on M8 and M9 elements) and the dated changelog on the home page
const RELEASE = {
  M8: ['dialogue-box', 'dialogue-choices', 'expressive-portraits', 'hit-stop-shake', 'level-up-growth', 'palette-swap', 'platformer-feel', 'save-slots', 'shop-inventory', 'sword-combat', 'weather-particles'],
  M9: ['webgl-post', 'dynamic-lights', 'bloom-glow', 'color-grade-lut', 'squash-stretch', 'verlet-cloth', 'springy-ui', 'damage-pop', 'camera-director', 'upgrade-draft', 'art-direction-lock', 'painted-parallax', 'painted-portraits', 'painted-ui'],
  M11: ['third-person-3d', 'billboard-sprites-3d', 'tactics-grid-3d'],
  M12: ['bullet-patterns', 'draining-hp-bar', 'procedural-sfx', 'time-rewind', 'toon-outlines-3d'],
  M13: ['horde-survival', 'vision-cones', 'tower-defense', 'minimap', 'physics-debris'],
  M14: ['grapple-swing', 'clash-cutin', 'title-menu', 'quest-log', 'world-hud', 'wfc-town-3d'],
  M15: ['seeded-replay', 'water-surface', 'loot-beams', 'keyword-tooltips', 'kart-racer-3d', 'match3-battle', 'ik-creatures', 'dungeon-floors', 'motion-inputs', 'crafting-recipes', 'shaped-inventory', 'farming-plots', 'scripted-cutscenes'],
  M17: ['on-map-skirmish'],
  M16: ['chip-music', 'beat-judge', 'adaptive-music', 'paper-doll', 'talking-portraits', 'sprite-stacking', 'belt-depth', 'raycast-dungeon'],
  M10: ['modern-particles', 'ribbon-trails', 'toasts', 'bark-bubbles', 'screen-distortion', 'squad-formation', 'tactic-rules', 'stamina-rest', 'squad-clash', 'normal-maps', 'normal-lighting', 'run-map', 'card-art', 'card-battle', 'cutout-characters']   // L-10 joined M10 later the same day (own What's new entry)
};
const STYLE_RELEASE = { 'painted-impasto': 'M10', 'glass-ui': 'M10' };   // styles added after M7 that carry a "New" mark
const STYLE_GEN = { 'painted-impasto': true };   // styles whose look ships generated bitmaps (an L-00-locked pack)
const CHANGELOG = [   // short, dated entries for the top of the home page (newest first); [release, date, text, label shown instead of the release]
  ['M17', '2026-11-26', 'One element: on-map skirmish exchanges for tactics games. The small map units fight where they stand: the attacker lunges, the target flashes white and is knocked back, counters and follow-ups play in turn and both HP bars drain at the edge of the screen. It is the alternative to the side-view clash cut-in.'],
  ['M16', '2026-11-20', 'Eight elements: chip music synthesized in the browser with loops and jingles, a beat judge that rates each press Perfect, Good or Miss after a calibration, adaptive music whose layers follow the game state, a layered paper doll with a wardrobe, talking portraits whose mouths move with the text, sprite-stacked props that keep their depth as the camera turns, street depth for brawlers, and a first-person raycast dungeon crawler with a starter game.'],
  ['M15', '2026-11-19', 'Thirteen elements: four new systems with starter games (a 3D kart racer with drifts and a two-race cup, a match-3 board whose combos drive a party battle, dungeon floors generated room by room, and a farm through the seasons), plus seeded replays with a ghost, water that splashes, loot with rarity beams, keyword tooltips, creatures that walk on procedural legs, motion-input special moves, crafting with recipe discovery, a bag where items have shapes, and scripted cutscenes that walk the game\'s own characters through a scene.'],
  ['M14', '2026-11-19', 'Six elements: a grappling hook that swings and wraps around corners, side-view clash cut-ins for tactics fights, a title screen with menus and pause, a quest log with a tracker, name plates and arrows that float over the world, and a 3D town that builds itself from tiles with its own starter game.'],
  ['M13', '2026-11-18', 'Five elements: two new systems with starter games, a horde survival run where weapons fire by themselves and a tower defense field with waves, plus stealth vision cones, a minimap you fill in by exploring, and breakable props that shatter into pieces cut from their own art.'],
  ['M12', '2026-11-18', 'Five elements: bullet patterns described as data, HP bars whose loss drains after a hit, sound effects synthesized live with a sound board to listen to, hold-to-rewind time, and toon outlines with cel shading for a three.js scene.'],
  ['M11', '2026-11-18', 'Three 3D elements on a pinned three.js: a third-person character and camera with an island starter game, painted billboard characters that stand in a 3D scene and always face the right way, and a 3D tactics battlefield on a height grid with its own starter skirmish. New family N: 3D.'],
  ['M10', '2026-11-18', 'Facing pass: characters now face what they attack, talk to or walk toward, enemies use their own left-facing paintings instead of a mirror, and archers hold the bow in the front hand. Updated modules: layered cutout characters 1.2.5 (heads sit on their necks), sword combat 1.0.1 (archers face the player while aiming), squad clash 1.2.2.', 'Face'],
  ['M10', '2026-11-17', 'Visual quality pass: 45 demos reworked, HD ones with painted characters and backdrops, pixel ones with fuller hand-shaded scenes; the squad clash and sword combat starter games look new too, and the speech bubbles, save slots and cutout characters got small drawing fixes.', 'Look'],   // label fits the 34 px column
  ['M10', '2026-11-17', 'New element L-10 layered cutout characters: painted HD characters cut into parts and moved by a small bone rig (idle, walk, slash with a swoosh, thrust, cast, hurt), with a sample pack of three; it also joins the Squad tactics kit.', 'L-10'],
  ['M10', '2026-11-17', '14 elements: a particle engine, ribbon trails, toasts, bark bubbles, screen distortion and normal-mapped lighting; a squad set (formation grid, tactic rules, stamina, auto-resolved clash with forecast); a roguelite set (run map, card art, card battle with intents). New styles: Painted impasto HD, Glass & gradient UI.'],
  ['M9', '2026-11-16', '14 modern-look elements: WebGL post, real-time lights, bloom, colour grading, cloth, springy UI, a camera director and generated-art packs. New style: Lit HD 2D. New families J, K, L.'],
  ['M8', '2026-11-15', '11 elements for story, growth and action (dialogue, shop, level-up, save slots, sword combat, platformer feel…) and 3 styles.'],
  ['M7', '2026-11-14', 'First local build: 21 elements with live demos, the DNA basket, 8 styles and recommended kits.']
];
// display label of the coordinates where the code word misleads: 'side' means free 2D world px (side-on or top-down)
const COORD_LABEL = { 'loot-beams': 'Top-down world (2D px)', 'vision-cones': 'Top-down world (2D px)' };
const TIME = { tick: 'Gauge (tick)', turn: 'Turn-based', realtime: 'Real-time', any: 'Any clock (modal UI)' };
const COORDS = { side: 'Side view', grid: 'Top-down grid', iso: 'Isometric grid', pseudo3d: 'Pseudo-3D ground', '3d': '3D world (three.js)', screen: 'Screen rects (any view)' };
const NUMW = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen'];
const numw = n => NUMW[n] || String(n), Numw = n => { const w = numw(n); return w.charAt(0).toUpperCase() + w.slice(1); };
const RELEASE_OF = Object.fromEntries(Object.entries(RELEASE).flatMap(([r, ids]) => ids.map(id => [id, r])));
const LAYER = { scene: 'Scene', actor: 'Actors', ui: 'UI', fx: 'Effects', post: 'Post / overlay' };
const MODEL = {
  solH: 'a fixed model',
  solL: 'a fixed model, default (low) effort',
  sol: 'a fixed model',
  mixM2: 'an earlier model (default effort) and a fixed model (default low effort); not rerun with sol high'
};

// ---------------------------------------------------------------- honest status (cold tests + known issues)
// Critic scores are read from elements/<id>/checks/critic-r*.json. Cold-test results come from coldtests/ verdicts and
// the project log; a cold test = a fresh Codex agent with no browser gets only a game + the module + the prompt.
const STATUS = {
  'active-time-battle': { cold: [['Prompt + module, our test host', '3/3', 'solH'], ['Into an unseen battle game, with damage numbers', '3/3 integrated; 0/3 under strict scoring (the damage numbers sat beside a neighbouring unit: an E-01 placement issue)', 'solH'], ['Starter game + damage numbers', 'integrated (12/12 across the four starter/unseen combos)', 'solH']], issues: ['Strict number placement in crowded parties belongs to E-01 (bouncing damage numbers), not to the gauge system.'] },
  'grid-range-path': { cold: [['Prompt + module, our test host', '3/3', 'solH'], ['Prompt only, no module', '1/3 (very short key taps were missed; one run removed the turn plate)', 'solH'], ['Into an unseen tactics game, with damage numbers', '3/3 integrated, 3/3 strict', 'solH']], issues: [] },
  'damage-numbers': { cold: [['Prompt + module, our test host', '3/3', 'solH'], ['Four combos: unseen battle, unseen tactics, two starters', '12/12 integrated, 10/12 under strict placement scoring', 'solH']], issues: ['Placement in crowded scenes: in some games a number can land nearer a neighbour than its target (strict scoring 10/12). Recorded as a known issue.'] },
  'window-cursor': { cold: [['Unseen battle + unseen top-down games', '6/6', 'mixM2']], issues: [] },
  'pixel-font': { cold: [['Unseen battle + unseen side-scroller', '4/6', 'mixM2'], ['Unseen battle, rerun after the prompt named which text types out', '3/3', 'solL']], issues: [] },
  'big-banner': { cold: [['Unseen battle + unseen tactics games', '6/6', 'mixM2']], issues: [] },
  'hit-sparks': { cold: [['Unseen battle + unseen side-scroller', '6/6', 'mixM2']], issues: [] },
  'dissolve-defeat': { cold: [['Unseen battle + unseen tactics games', '5/6 (one run broke one line of the host game)', 'mixM2']], issues: [] },
  'battle-transition': { cold: [['Unseen top-down + unseen battle games', '6/6', 'mixM2']], issues: [] },
  'combat-forecast': { cold: [['Tactics starter + unseen tactics game', '6/6', 'solL']], issues: [] },
  'threat-range': { cold: [['Tactics starter + unseen tactics game', '6/6', 'solL']], issues: [] },
  'turn-order-bar': { cold: [['Unseen battle game + isometric starter', '6/6', 'solL']], issues: [] },
  'fog-of-war': { cold: [['Tactics starter', '3/3', 'solL'], ['Unseen tactics game (earlier runs)', '1/3, then 0/3 after a cursor rule was added (hidden units leaked through the cursor or move confirmation)', 'solL'], ['Unseen tactics game, rerun', '3/3, no leaks (hidden enemies handled as an ambush stop)', 'solH']], issues: ['Earlier, weaker runs leaked hidden units; the final rerun did not. Check the cursor, move confirmation and camera in your game.'] },
  'timing-bar': { cold: [['Unseen top-down + unseen battle games', '6/6', 'solL'], ['Unseen top-down, with the moment named (open a locked chest)', '3/3', 'sol']], issues: [] },
  'pixel-scaler': { cold: [['Unseen side-scroller + unseen top-down games', '6/6', 'solL']], issues: [] },
  'parallax-layers': { cold: [['Unseen side-scroller + unseen battle games', '6/6', 'solL']], issues: [] },
  'touch-controls': { cold: [['Unseen side-scroller + unseen top-down games', '6/6', 'solL']], issues: ['The demo did not pass its final review (4 rounds: 7.0, 7.6, 7.3, 7.4; bar 7.5). On 360 px-tall landscape Android phones (640-740 x 360) the "large" button size comes out smaller than the default or covers about 39% of the game. Portrait 390 x 844 and landscape 844 x 390 are fine.'], fail: true },
  'pseudo3d-flight': { cold: [['Into an unseen top-down game', '3/3', 'solH'], ['Starter + damage numbers', '3/3', 'solH']], issues: [] },
  'iso-height-map': { cold: [['Into an unseen tactics game', '3/3', 'solH'], ['Starter + damage numbers', '3/3', 'solH']], issues: [] },
  'level-select-map': { cold: [['Into an unseen side-scroller', '3/3', 'solH'], ['Starter + damage numbers', '3/3', 'solH']], issues: [] },
  // M11 (3D): hand-written from coldtests/sol/judge-m11-*.json (their formats differ from the M8-M10 judge files)
  'third-person-3d': { cold: [['Its starter game + a task (a villager who waves and talks, a berry counter)', '2/2 integrated', 'solH'], ['The same task on the final starter', '1/1 integrated', 'solH']], issues: [] },
  'tactics-grid-3d': { cold: [['Its starter game + a task (a new ranged class and one more enemy)', '2/2 integrated', 'solH'], ['Its starter game + C-11 damage pop', '2/2 integrated', 'solH'], ['The reviewed starter: the same task, and + C-11 damage pop', '2/2 integrated', 'solH']], issues: [] },
  'billboard-sprites-3d': { cold: [['Into the N-03 3D tactics starter (module v1.0.3, shipped)', '1/1 integrated', 'solH'], ['Into the N-01 third-person starter (module v1.0.3, shipped)', '1/1 integrated', 'solH'],
    ['History: v1.0.0 into the N-01 and N-03 starters', '2/3; one N-03 run failed: a defender turned its back to the attacker while sliding back from a hit (4 of 24 hits)', 'solH'],
    ['History: v1.0.1 (hurt recoil keeps the facing) into both starters', '2/2 integrated; the failed run passes with v1.0.1 swapped in (defenders face attackers in 210/210 hurt samples)', 'solH']], issues: [] },
  // M12 / M13: hand-written from coldtests/sol/judge-m12-*.json and judge-m13-*.json (per-run lists, one file per element)
  'bullet-patterns': { cold: [['Into an unseen top-down game (module v1.0.0)', '3/3 integrated', 'solH'], ['Into an unseen HD top-down game (module v1.0.0)', '3/3 integrated', 'solH'], ['Shipped module v1.1.0, one run per host', '2/2 integrated', 'solH']], issues: [] },
  'draining-hp-bar': { cold: [['Into an unseen battle game (module v1.0.0)', '3/3 integrated', 'solH'], ['Into an unseen HD top-down game (module v1.0.0)', '2/3; one run drew enemy bars only for living foes, so a killing blow removed the bar with no loss segment', 'solH'],
    ['Module v1.0.1 with the old prompt, both hosts', '1/2; the HD top-down run repeated the killing-blow defect', 'solH'], ['Module v1.0.1 with the shipped prompt (keep drawing a dead unit\'s bar while it is still draining)', '3/3 integrated (battle 1/1, HD top-down 2/2); every kill shows its loss segment', 'solH']], issues: [] },
  'procedural-sfx': { cold: [['Into an unseen side-scroller', '3/3 integrated', 'solH'], ['Into an unseen battle game', '3/3 integrated (the screen is pixel-identical to the original: the element only adds sound)', 'solH']], issues: [] },
  'time-rewind': { cold: [['Into an unseen side-scroller', '3/3 integrated', 'solH'], ['Into an unseen HD top-down game', '3/3 integrated', 'solH']], issues: ['Judge minors on the module (not the integrations): in pixel render the REWIND label leaves out the speed (x2); in the HD top-down game the label, moved down to clear the HP panel, can cover a centred message banner while rewinding.'] },
  'toon-outlines-3d': { cold: [['Into the N-01 third-person starter (module v1.0.0)', '3/3 integrated', 'solH'], ['Into the N-03 3D tactics starter (module v1.0.0)', '3/3 integrated', 'solH'], ['Shipped module v1.1.0, one run per starter', '2/2 integrated; with the look switched off, the N-01 frames equal the original pixel for pixel', 'solH']], issues: [] },
  'vision-cones': { cold: [['Into an unseen top-down game (module v1.0.0)', '3/3 integrated', 'solH'], ['Into an unseen HD top-down game (module v1.0.0)', '3/3 integrated', 'solH'], ['Shipped module v1.1.0, one run per host', '2/2 integrated', 'solH']], issues: [] },
  'minimap': { cold: [['Into an unseen top-down game (module v1.0.0)', '3/3 integrated', 'solH'], ['Into an unseen side-scroller (module v1.0.0)', '3/3 integrated', 'solH'], ['Module v1.1.0, one run per host', '2/2 integrated', 'solH'], ['Shipped module v1.1.1, one run per host', '2/2 integrated', 'solH']], issues: [] },
  'physics-debris': { cold: [['Module v1.0.0 into unseen HD top-down and HD side-scroller games', '0/6; pieces came to rest under the hero\'s feet (v1.0 had no keep-out area)', 'solH'], ['Module v1.4.0, both hosts', '3/4; in one side-scroller run a flyer shattered inside the cliff and its pieces stayed in the ground until they faded', 'solH'], ['Module v1.4.1, one run per host', '2/2 integrated', 'solH'],
    ['Shipped module v1.4.2 into an unseen HD top-down game', '3/3 integrated', 'solH'], ['Shipped module v1.4.2 into an unseen HD side-scroller', '3/3 integrated; no piece inside a wall', 'solH']],
    coldNote: 'Both earlier failures are fixed in v1.4.2: pieces keep out from under the hero (since v1.4), and debris born inside a wall starts from the nearest open spot.', issues: [] },
  // A-11 and A-16: coldtests/sol/judge-m13-horde-survival-r1.json and judge-m13-tower-defense-r1.json
  'horde-survival': { cold: [['Its starter game + a task (module and starter v1.2.0)', '2/2 integrated', 'solH'], ['Its starter game + C-11 damage pop (v1.2.0)', '2/2 integrated', 'solH']], coldNote: 'Earlier starter versions were not cold-tested.', issues: [] },
  'tower-defense': { cold: [['Its starter game + a task (add a tower and an enemy), v1.0.0 to v1.1.0', '5/5 integrated', 'solH'], ['Its starter game + C-11 damage pop, v1.0.0 to v1.1.0', '5/5 integrated', 'solH'], ['Shipped v1.1.1: + a task, and + C-11 damage pop', '2/2 integrated', 'solH']],
    coldNote: 'Judge note on the test task itself: from starter v1.1.0 on, the added tower and enemy make the first field lose in the judge\'s manual session (the game still runs and ends normally).', issues: [] },
  // M14 / M15: hand-written from coldtests/sol/judge-m14-*.json and judge-m15-*.json (per-version batches, one file per element)
  'grapple-swing': { cold: [['Into an unseen side-scroller (module v1.0.0)', '3/3 integrated', 'solH'], ['Into an unseen HD side-scroller (module v1.0.0)', '3/3 integrated', 'solH'], ['Shipped module v1.1.0, one run per host', '2/2 integrated', 'solH']], issues: [] },
  'clash-cutin': { cold: [['Into an unseen tactics game (module v1.0.0)', '3/3 integrated', 'solH'], ['Into an unseen battle game (module v1.0.0)', '3/3 integrated', 'solH'], ['Module v1.1.0, both hosts', '4/4 integrated', 'solH'], ['Shipped module v1.1.1, one run per host', '2/2 integrated', 'solH']], issues: [] },
  'title-menu': { cold: [['Into an unseen battle game (module v1.0.0)', '3/3 integrated', 'solH'], ['Into an unseen side-scroller (module v1.0.0)', '3/3 integrated', 'solH'], ['Shipped module v1.1.0, both hosts', '4/4 integrated', 'solH']], issues: [] },
  'quest-log': { cold: [['Into an unseen top-down game (module v1.1.3)', '3/3 integrated', 'solH'], ['Into an unseen HD top-down game (module v1.1.3)', '0/3; the NEW QUEST banner showed twice, first in the centre, then again as a corner toast', 'solH'], ['Shipped module v1.1.4, both hosts', '6/6 integrated; every banner shown once', 'solH']],
    coldNote: 'The double banner is fixed in v1.1.4.', issues: [] },
  'world-hud': { cold: [['Into an unseen top-down game (module v1.2.0)', '3/3 integrated', 'solH'], ['Into an unseen HD top-down game (module v1.2.0)', '0/3; in live play name plates jumped up to 122 px in one frame', 'solH'], ['Shipped module v1.2.1, both hosts', '4/4 integrated', 'solH']],
    coldNote: 'The plate jumps are fixed in v1.2.1.', issues: [] },
  'wfc-town-3d': { cold: [['Its starter game + a task (a new tile kind and goal), v1.0.0', '3/3 integrated', 'solH'], ['Its starter game + C-14 toasts, v1.0.0', '3/3 integrated', 'solH'], ['Shipped v1.1.0: + a task, and + C-14 toasts', '4/4 integrated', 'solH']], issues: [] },
  'seeded-replay': { cold: [['Into an unseen top-down game (module v1.0.0)', '3/3 integrated', 'solH'], ['Into an unseen side-scroller (module v1.0.0)', '3/3 integrated', 'solH'], ['Shipped module v1.1.0, both hosts', '4/4 integrated; every replay ended on the same state', 'solH']],
    issues: ['Judge note on v1.1.0: on a 256 px wide pixel view at phone size the automatic HUD scale picks 2x and the replay bar gets crowded; set hudScale: 1 there.'] },
  'water-surface': { cold: [['Into an unseen side-scroller (module v1.0.0)', '0/3; the prompt asked for a waterfall and the runs started it in empty air, with no cliff or spout', 'solH'], ['Into an unseen HD side-scroller (module v1.0.0)', '3/3 integrated', 'solH'], ['Module v1.0.1, one run per host', '0/2; the same sourceless waterfall', 'solH'], ['Shipped module v1.0.2, both hosts', '4/4 integrated; every waterfall has a source', 'solH']],
    coldNote: 'Everything else held in all 12 runs (one splash per entry, floaters stay in their pools). The waterfall issue was the prompt\'s, fixed with v1.0.2.', issues: [] },
  'loot-beams': { cold: [['Module v1.0.0 into unseen top-down and HD top-down games', '4/6; one top-down run drew name tags over characters, one HD run made victory wait until the boss loot was picked up', 'solH'], ['Module v1.0.1, both hosts', '4/4 integrated', 'solH'], ['Module v1.0.2, both hosts', '3/4; in one HD run a name tag sat across the hero in a crowded field', 'solH'], ['Shipped module v1.0.3, both hosts', '4/4 integrated', 'solH']], issues: [] },
  'kart-racer-3d': { cold: [['Its starter game + a task (a new racer and a new track), v1.0.0', '3/3 integrated', 'solH'], ['Its starter game + C-14 toasts, v1.0.0', '3/3 integrated', 'solH'], ['v1.1.0: + a task, and + C-14 toasts', '4/4 integrated', 'solH'], ['Shipped v1.2.0: + a task, and + C-14 toasts', '4/4 integrated', 'solH']], issues: [] },
  'match3-battle': { cold: [['Its starter game + C-11 damage pop, v1.0.0', '3/3 integrated', 'solH'], ['Its starter game + C-11 damage pop, shipped v1.1.0', '2/2 integrated', 'solH'], ['Its starter game + a task (a new gem, hero skill and enemy), v1.0.0 and v1.1.0', '0/5; the starter README\'s example tint drew the new orange enemy pink', 'solH'], ['v1.1.0 with the fixed README: + a task', '3/3 integrated', 'solH'], ['v1.2.0: + a task, and + C-11 damage pop', '4/4 integrated', 'solH'], ['Shipped v1.3.0: + a task, and + C-11 damage pop', '4/4 integrated', 'solH']],
    coldNote: 'The task failures came from the colour example in the starter README, fixed before the later rounds. In v1.2.0 the boss slam stopped short of the Knight in the starter itself (not the integrations); v1.3.0 fixes it and its four runs show the slam landing.', issues: [] },
  // M16: hand-written from coldtests/sol/judge-m16-*.json (r1, and r2 reruns after a fix)
  'chip-music': { cold: [['Module v1.0.3 into unseen battle and top-down games', '3/6; battle 3/3, top-down 0/3: a module bug, not the integrations (after a victory jingle that returned to the field loop, the module ignored the next play of the battle track, so the second fight kept the field music)', 'solH'], ['Shipped module v1.0.4 (the fix), 3 runs', '3/3 integrated (top-down 2/2, battle 1/1); the second fight plays its battle loop', 'solH']],
    coldNote: 'The top-down failures came from the module; v1.0.4 clears the stuck track request and was cold-tested again.', issues: [] },
  'beat-judge': { cold: [['Shipped module v1.1.0 into unseen battle and side-scroller games', '6/6 integrated', 'solH']], issues: [] },
  'adaptive-music': { cold: [['Module v1.0.1 (with F-03 chip-music v1.0.4) into unseen top-down and HD side-scroller games', '3/6; top-down 3/3, HD side-scroller 0/3: every enemy kill fired a victory jingle and every coin an item jingle (about 60 in a 37 s run), so the jingles paused the adaptive loop most of the time', 'solH'], ['Shipped module v1.0.2 (a jingle limit while the music is steered), 3 runs', '3/3 integrated (HD side-scroller 2/2, top-down 1/1)', 'solH']],
    coldNote: 'The side-scroller failures came from unclear prompt wording about which events get a jingle; v1.0.2 limits jingles during play and the prompt names the events.', issues: [] },
  'paper-doll': { cold: [['Shipped module v1.1.0 into unseen top-down and side-scroller games', '6/6 integrated', 'solH']],
    coldNote: 'The repo judge never opens the wardrobe (it does not press C), so the wardrobe in each run was checked by hand.', issues: [] },
  'talking-portraits': { cold: [['Module v1.1.0 into unseen top-down and battle games', '3/6; top-down 3/3, battle 0/3: the prompt told every host to wait for a confirm press, so all three battles stopped after each action until the player pressed Z', 'solH'], ['Shipped module v1.2.0 (prompt fixed: no new confirm step, captions close when the action ends), 3 runs', '3/3 integrated (battle 2/2, top-down 1/1)', 'solH']],
    coldNote: 'The battle failures came from the prompt, not the module.', issues: [] },
  'sprite-stacking': { cold: [['Shipped module v1.0.0 into unseen top-down and HD top-down games', '6/6 integrated', 'solH']], issues: [] },
  'raycast-dungeon': { cold: [['Its starter game + a task (a new monster and a new item), v1.2.0', '2/3; one run wrote into GAME.shipped, the record of the shipped content that must stay unchanged', 'solH'], ['Its starter game + C-11 damage pop, v1.2.0', '1/3; the starter README sample passed the monsters\' screen rects without a margin, so numbers sat on monsters', 'solH'], ['v1.3.0: + a task', '3/3 integrated', 'solH'], ['v1.3.0: + C-11 damage pop', '2/3; the README sample kept a dead target\'s number at a stale spot on screen when the view turned', 'solH'], ['Shipped v1.3.1 (README sample only): + C-11 damage pop', '2/2 integrated', 'solH']],
    coldNote: 'Every damage-pop failure followed the starter README sample, which v1.3.0 and v1.3.1 fixed; v1.3.1 changed only that sample, so the task was not run again.', issues: [] },
  // M17: hand-written from coldtests/sol/judge-m17-on-map-skirmish-r1.json (v1.0.2) and -r2.json (v1.0.3 reruns after the fix)
  'on-map-skirmish': { cold: [['Module v1.0.2 into unseen tactics and top-down games', '4/6; tactics 3/3, top-down 1/3: a module bug, not the integrations (the top-down game starts a fight when the two units already overlap, and the module spaced the fighters apart only for a boss, so the hero covered the slime on the hit)', 'solH'], ['Shipped module v1.0.3 (every exchange spaces the pair along the attack axis), 3 runs', '3/3 integrated (tactics 1/1, top-down 2/2)', 'solH']],
    coldNote: 'The top-down failures came from the module; v1.0.3 spaces every pair itself and was cold-tested again on both games.', issues: [] },
  'belt-depth': { cold: [['Shipped module v1.0.3 into unseen side-scroller and HD side-scroller games', '6/6 integrated', 'solH']], issues: [] },
  'scripted-cutscenes': { cold: [['Module v1.0.0 into unseen top-down and HD top-down games', '6/6 integrated', 'solH'], ['Module v1.1.0, both hosts', '4/4 integrated', 'solH'], ['Shipped module v1.2.0, both hosts', '4/4 integrated', 'solH']],
    coldNote: 'Every run sent the lines through the game\'s own dialogue box, and a held skip landed on the play-through positions, facings and calls. The repo judge read its manual check as failed on the HD top-down runs because its scripted walker opens menus while the scene still holds control; a walker that waits for the scene to end passed all of them.', issues: [] },
  'ik-creatures': { cold: [['Module v1.0.0 into unseen HD top-down and HD side-scroller games', '6/6 integrated', 'solH'], ['Module v1.1.0, both hosts', '4/4 integrated', 'solH'], ['Module v1.2.0, both hosts', '4/4 integrated', 'solH'], ['Module v1.2.1, one run per host', '2/2 integrated', 'solH'], ['Shipped module v1.2.2, both hosts', '4/4 integrated', 'solH']],
    coldNote: 'Judge minor across versions: most top-down runs drew walking spiders larger than the prompt asked, so their legs often overlap the hero.', issues: [] },
  'dungeon-floors': { cold: [['Its starter game + a task (a new room type, monster and item), shipped v1.1.3', '3/3 integrated', 'solH'], ['Its starter game + C-11 damage pop, shipped v1.1.3', '3/3 integrated', 'solH']],
    coldNote: 'Cold tests ran only on the shipped v1.1.3; the earlier versions (v1.1.0 to v1.1.2, strict-critic rounds) were not cold-tested.', issues: [] },
  'farming-plots': { cold: [['Its starter game + a task (a new crop and a new tool), v1.0.0', '3/3 integrated', 'solH'], ['Its starter game + C-14 toasts, v1.0.0', '3/3 integrated', 'solH'], ['v1.1.0: + a task, and + C-14 toasts', '4/4 integrated', 'solH'], ['Shipped v1.2.0: + a task, and + C-14 toasts', '4/4 integrated', 'solH']],
    coldNote: 'Judge notes: every task run copied the starter README\'s reference block, so the task tests copying more than design; with C-14 toasts sliding out top-right, two cards can overlap for about 4 frames (a toasts minor).', issues: [] },
  'motion-inputs': { cold: [['Module v1.0.0 into an unseen side-scroller and an unseen HD side-scroller', '6/6 integrated', 'solH'], ['Module v1.0.2, both hosts', '4/4 integrated', 'solH'], ['Module v1.0.3, both hosts', '3/4; in one HD run the move history was clipped to UI areas the game had reserved for hidden windows, so its rows were cut', 'solH'], ['Shipped module v1.0.4, both hosts', '4/4 integrated', 'solH']], issues: [] },
  'crafting-recipes': { cold: [['Modules v1.0.0 to v1.2.0 into unseen top-down and HD top-down games (round 1)', '8/14; in six runs the game reset the crafting state after a recipe toast had already shown, so the same NEW RECIPE toast appeared twice', 'solH'], ['Shipped module v1.3.0, both hosts (round 2)', '6/6 integrated; each toast shown once', 'solH']],
    coldNote: 'The double toast is handled by the module since v1.3.0.', issues: [] },
  'shaped-inventory': { cold: [['Module v1.2.0 into unseen top-down and HD top-down games (round 1)', '3/6; in top-down runs the quest lantern from the chest went to the ground tray instead of the bag, and one HD run lost its boss fight', 'solH'], ['Module v1.3.0, both hosts (round 1)', '5/6; one top-down run repeated the ground-tray lantern; with a full bag the lantern could be lost', 'solH'], ['Module v1.4.0, both hosts (round 2)', '6/6 integrated; the key item is kept even with a full bag', 'solH'], ['Shipped module v1.4.1, both hosts (round 3)', '4/4 integrated', 'solH']],
    coldNote: 'Round 2 found a module issue no integration could fix (tab labels overlapped on HD phones); v1.4.1 fixes it.', issues: [] },
  'keyword-tooltips': { cold: [['Module v1.1.0 into unseen battle and tactics games', '6/6 integrated', 'solH'], ['Module v1.2.0, both hosts', '4/4 integrated', 'solH'], ['Shipped module v1.2.1, both hosts', '4/4 integrated; nested tooltips stay attached to their words', 'solH']], issues: [] },
  'four-move-battle': { cold: [['Into an unseen battle game', '3/3', 'solH'], ['Starter + damage numbers', '3/3', 'solH']], issues: ['Took 4 review rounds: each round fixed one major and a new one appeared (target pointer, status labels, long move names).'] }
};

// ---------------------------------------------------------------- recommended combos (checked at build time)
const COMBOS = [
  { slug: 'tactics-map-kit', name: 'Tactics map kit', blurb: 'Move on a grid, see what can hit you, preview the fight, watch the numbers.', ids: ['grid-range-path', 'threat-range', 'combat-forecast', 'damage-numbers'], starter: true },
  { slug: 'party-battle-kit', name: 'Party battle kit', blurb: 'Gauges fill, windows open, sparks fly and the defeated dissolve.', ids: ['active-time-battle', 'window-cursor', 'hit-sparks', 'damage-numbers', 'dissolve-defeat'], starter: true },
  { slug: 'overworld-kit', name: 'Level-select kit', blurb: 'A path that draws itself between levels, banners on arrival, a layered sky.', ids: ['parallax-layers', 'level-select-map', 'big-banner'], starter: true },
  { slug: 'story-kit', name: 'Story kit', blurb: 'Typed lines with name plates, faces that react, and choices that set flags.', ids: ['dialogue-box', 'expressive-portraits', 'dialogue-choices'] },
  { slug: 'rpg-growth-kit', name: 'RPG growth kit', blurb: 'Spend gold in a shop, level up after the fight, keep it all in save slots.', ids: ['level-up-growth', 'shop-inventory', 'save-slots'] },
  { slug: 'action-kit', name: 'Action kit', blurb: 'A real-time sword fight with hit-stop, shake and bouncing numbers.', ids: ['sword-combat', 'hit-stop-shake', 'damage-numbers'], starter: true },
  { slug: 'modern-lighting-kit', name: 'Modern lighting kit', blurb: 'Your 2D game under real-time light: lamps and soft shadows, glow, a colour grade and a camera that frames the action.', ids: ['webgl-post', 'dynamic-lights', 'bloom-glow', 'color-grade-lut', 'camera-director'] },
  { slug: 'roguelite-run-kit', name: 'Roguelite run', blurb: 'Climb a branching map, fight card battles against foes that show their intents, draft painted upgrade cards, and announce it all in toasts. Goes into your own game: the card-battle starter already has its own road and reward screen, so this kit does not start from it.', ids: ['run-map', 'card-battle', 'upgrade-draft', 'card-art', 'toasts'] },
  { slug: 'modern-effects-kit', name: 'Modern effects', blurb: 'A particle engine, ribbon trails, screen distortion and normal-mapped sprite lighting on one WebGL post pipeline; without WebGL the game draws as before.', ids: ['webgl-post', 'modern-particles', 'ribbon-trails', 'screen-distortion', 'normal-lighting'] },
  { slug: 'squad-tactics-kit', name: 'Squad tactics', blurb: 'Stamina that sends squads to rest, front and back rows, orders as tactic rules, and clashes that resolve themselves exactly as forecast, fought by painted cut-out units that lunge, cast and recoil (sample art pack included; L-00 comes with it). Goes into your own game; the clash starter has its own formation and rules screens.', ids: ['stamina-rest', 'art-direction-lock', 'squad-formation', 'tactic-rules', 'squad-clash', 'cutout-characters'] },   // listed in the combined prompt's integration order; L-10 (+ its required L-00) added 2026-11-17
  { slug: 'painted-art-kit', name: 'Painted art kit', blurb: 'One locked painted style for backdrops, talking portraits and window frames. Sample art pack included; your own set needs image generation.', ids: ['painted-parallax', 'art-direction-lock', 'painted-portraits', 'painted-ui'] }
];
// home hero: captured loops of the M9 modern-look elements (tools/site-frames.py --hero -> site/assets/hero/), rotating
const HERO = ['grapple-swing', 'kart-racer-3d', 'wfc-town-3d', 'loot-beams', 'horde-survival', 'tower-defense', 'bullet-patterns', 'toon-outlines-3d', 'physics-debris', 'third-person-3d', 'tactics-grid-3d', 'billboard-sprites-3d', 'cutout-characters', 'modern-particles', 'normal-lighting', 'card-battle', 'squad-clash', 'screen-distortion', 'toasts', 'ribbon-trails', 'card-art'];   // M10 loops (L-10 first: the latest addition)
const MINI = ['damage-numbers', 'bloom-glow', 'weather-particles', 'painted-parallax', 'sword-combat', 'verlet-cloth'];   // live mini-loops under the hero
// demos that sit idle until a key is pressed: start them on a scripted moment
const DEMO_START = { 'grid-range-path': 'script=menu' };
// elements whose demo is mainly heard: a prominent Listen link to the playable sound board (opens in a new tab; audio starts on the first click there)
const LISTEN = { 'procedural-sfx': { href: 'demo/index.html', blurb: 'The demo is a sound board: one pad per preset (hit, crit, coin, jump, land, footstep, menu move / confirm / cancel, explosion, laser, power-up, heal, hurt), Play 5 variations, sliders for style, pitch, brightness, length and voices, and a small scene that plays the sounds from its own events. Nothing plays until you click; turn your volume down first.' } };
// where the action is in each recorded frame (native px): card thumbnails are cropped around it
const FOCAL = {   // [x, y] or [x, y, scale]: scale 1 keeps a whole game window visible instead of cutting it
  'dialogue-box': [128, 112, 1], 'dialogue-choices': [128, 112, 1], 'expressive-portraits': [128, 112, 1], 'level-up-growth': [128, 112, 1],
  'save-slots': [128, 112, 1], 'shop-inventory': [128, 112, 1], 'palette-swap': [160, 128, 1], 'hit-stop-shake': [110, 90],
  'platformer-feel': [100, 130], 'sword-combat': [70, 100, 2], 'weather-particles': [160, 100],
  'active-time-battle': [128,  112,  1],
  'battle-transition': [128,  112],
  'big-banner': [128,  90],
  'combat-forecast': [128,  112,  1],
  'damage-numbers': [140,  80],
  'dissolve-defeat': [128,  80],
  'fog-of-war': [128,  100],
  'four-move-battle': [120,  80,  1],
  'grid-range-path': [150,  110],
  'hit-sparks': [150,  90],
  'iso-height-map': [170,  90],
  'level-select-map': [128,  100],
  'parallax-layers': [160,  110],
  'pixel-font': [128,  76],
  'pixel-scaler': [128,  112],
  'pseudo3d-flight': [128,  112],
  'threat-range': [110,  110],
  'timing-bar': [160,  90],
  'touch-controls': [63,  52],   // yard view 126x105 since the strict-audit r2 redraw (was 168x140)
  'turn-order-bar': [128,  112,  1],
  'window-cursor': [128,  112,  1],
  // A-05: the loop is centred on t = 6000 (a swing mid-room, boar beside the hero); fx 70 / fy 100 at 2x keep the hero,
  // the boar and the arc in the middle of the crop, well below the HUD row and the wall band (M10 fix); L-00 (HD cover crop): fx 0 trims only the right
  // edge, so the inventory icons and the area label at the left stay whole
  'art-direction-lock': [0, 135],
  'squad-formation': [160, 100, 1],   // M10 pixel 320x200: the whole formation window, not a 2x patch of it
  // M12 / M13 (site critic r1): C-06 the whole frame, nudged right so the corner map stays; A-08 lower so the hero's body
  // shows under the warden; F-02 (HD cover crop) right-aligned so the barrel explosion is whole
  'minimap': [300, 70, 1], 'bullet-patterns': [160, 100], 'procedural-sfx': [330, 135],
  // M14 / M15 (site critic r1): C-15 and N-06 whole frame (tooltip text and the charter panel stay whole); E-18 on the lake by the waterfall
  'wfc-town-3d': [240, 135, 1], 'match3-battle': [240, 135, 1], 'ik-creatures': [280, 190], 'dungeon-floors': [240, 135],
  // site critic r2: cards whose UI text was cut at the edges show the whole frame, letterboxed ('contain', site.js)
  'keyword-tooltips': [192, 108, 'contain'], 'motion-inputs': [160, 90, 'contain'], 'shaped-inventory': [240, 135, 'contain'], 'crafting-recipes': [240, 135, 'contain'], 'farming-plots': [240, 158, 'contain'], 'scripted-cutscenes': [240, 135, 'contain'],
  // M16: the music panels whole; beat-judge low enough to keep the beat track, talking-portraits on the dialogue box
  'chip-music': [240, 143, 'contain'], 'adaptive-music': [240, 146, 'contain'], 'beat-judge': [128, 100, 'contain'], 'talking-portraits': [128, 112, 'contain'], 'paper-doll': [160, 90, 'contain'], 'raycast-dungeon': [240, 144, 'contain'],   // site critic m16 r1: posters whole (no cut UI text) 'water-surface': [160, 140]
};

// ---------------------------------------------------------------- load elements
const frames = exists(path.join(SITE, 'assets/frames/frames.json')) ? JSON.parse(read(path.join(SITE, 'assets/frames/frames.json'))) : {};
// A-D moments (tools/site-frames.py --moments): timed acceptance moments from element.md, else review screenshots without a time
const HERO_LOOPS = exists(path.join(SITE, 'assets/hero/hero.json')) ? JSON.parse(read(path.join(SITE, 'assets/hero/hero.json'))) : {};
const MOMENTS = exists(path.join(SITE, 'assets/moments/moments.json')) ? JSON.parse(read(path.join(SITE, 'assets/moments/moments.json'))) : {};
function moduleInfo(el, dir) {   // same resolution as tools/combine.mjs
  const m = el.module || {}, d = el.delivery || {};
  const file = m.file || d.module || (exists(path.join(dir, 'module')) ? 'module/' + (fs.readdirSync(path.join(dir, 'module')).find(f => f.endsWith('.js')) || '') : null);
  let global = m.global || d.global || null;
  if (!global && file && exists(path.join(dir, file))) global = (read(path.join(dir, file)).match(/root\.(GameDNA_\w+)\s*=/) || [])[1] || '(see README)';
  return { file, global, readme: m.docs || d.readme || 'module/README.md' };
}
function critic(dir) {
  const all = exists(path.join(dir, 'checks')) ? fs.readdirSync(path.join(dir, 'checks')) : [];
  const plain = all.filter(f => /^critic-r\d+\.json$/.test(f));   // N-02 has only strict-critic-r*.json: use those
  // M16: a narrow re-check after a round (strict-critic-r3-patch.json) counts as the next round, sorted right after rN
  // and a re-check of a later version (strict-critic-r3-v130.json, K-03)
  const key = f => +f.match(/\d+/)[0] + (/-(patch|v\d+)\.json$/.test(f) ? 0.5 : 0);
  const files = (plain.length ? plain : all.filter(f => /^strict-critic-r\d+(-patch|-v\d+)?\.json$/.test(f))).sort((a, b) => key(a) - key(b));
  const rounds = files.map(f => { const j = JSON.parse(read(path.join(dir, 'checks', f))); return { demo: j.demo ? j.demo.score : j.score, starter: j.starter ? j.starter.score : null, pass: j.demo ? !!(j.demo.pass && (!j.starter || j.starter.pass)) : !!j.pass }; });
  return rounds;
}
// M8 and later: cold-test rows straight from coldtests/sol/judge-m8|m9-<id>[-<suffix>].json. Suffixes: -rN (rerun after a
// fix), -v11 / -v111 (module v1.1 / v1.1.1), -w4 (wave-4 sanity check of the final module). Every verdict is listed in the
// order it was judged, so the last row of each kind is the latest. Runs carry `host` (M9) or are named <id>[-rN]-<host>-<n>.
const HOSTS = { topdown: 'top-down', sidescroll: 'side-scroller', battle: 'battle', tactics: 'tactics', 'hd-topdown': 'HD top-down (640×360)', 'hd-sidescroll': 'HD side-scroller (640×360)' };
const A14 = 'The A-14 squad-clash starter (its unit-drawing hook)';
const STARTER_HOSTS_BY_ID = { 'squad-clash': { starter: 'Its starter game alone, nothing to add (it must stay unchanged and still play)',
    'starter-squad (combos/starter-squad-clash+damage-pop)': 'Its starter game + C-11 damage pop', 'starter-squad': 'Its starter game + C-11 damage pop' },
  'cutout-characters': { 'starter-squad (A-14 squad-clash starter)': A14, 'starter-squad (A-14)': A14,
    'starter-squad (A-14 v1.2.x starter, art/ pack not supplied to this run)': A14 + ' (the starter\'s own painted units not supplied)' },
  'sword-combat': { 'starter-sword': 'Its starter game + E-05 hit-stop & shake', 'starter-sword (combos/starter-sword-combat+hit-stop-shake)': 'Its starter game + E-05 hit-stop & shake' } };
// reruns after the visual pass (2026-11-17): the module version the rerun tested, shown instead of "rerun rN after a fix"
const COLD_RERUN = { 'bark-bubbles': { r4: 'module v1.3.1, after the visual pass' }, 'squad-clash': { r5: 'v1.2.1 with the painted starter art' },
  'cutout-characters': { r3: 'module v1.2.2', r4: 'module v1.2.3, opaque hurt flash' }, 'save-slots': { r3: 'module v1.0.1, confirm box redrawn' },
  'sword-combat': { r2: 'the redrawn starter', r3: 'module v1.0.1, archers face the player' }, 'verlet-cloth': { r5: 'module v1.2.0, painted cloth' } };
COLD_RERUN['cutout-characters'].r5 = 'module v1.2.5'; COLD_RERUN['squad-clash'].r6 = 'v1.2.2, enemies from their own left-facing paintings';
// minor findings the judge recorded for one row: {id: {suffix: {layer: text}}} (layer '' = no asset layer)
const COLD_MINOR = { 'cutout-characters': { r5: { regenerate: 'minor: the regenerated pack misses two strict checks by a hair (head ratio 1/5.16 against a 1/5.2 limit, 1 unheld-shield sample)' } } };
// cold tests started but not judged yet when the site was built: {id: note}
const COLD_PENDING = {};
// frame times of the 3D elements: measured in headless Chromium with SwiftShader (software WebGL) on a loaded machine,
// so they are upper bounds, not what a player with a GPU sees (from each element's checks/perf.json or module README)
const PERF3D = {
  'third-person-3d': 'Measured in software WebGL (headless Chromium, SwiftShader) while the machine was heavily loaded (1-min load about 27): median 363 ms per frame at 1280 px (dpr 2), 236 ms at 390 px (dpr 3); 195 draw calls, about 36,500 triangles; the game step itself 0.1 ms. These are upper bounds; on a GPU the scene runs far faster.',
  'billboard-sprites-3d': 'Measured in software WebGL (headless Chromium, SwiftShader): the whole demo frame is 169 ms at 1280 px (dpr 2) with tilt-shift, 94 ms at 390 px (dpr 3); the 14 billboards are about 8-10 ms of that and update() 0.07 ms. Upper bounds; on a GPU the scene takes a few ms.',
  'tactics-grid-3d': 'Measured in software WebGL (headless Chromium, SwiftShader) while the machine was heavily loaded (1-min load about 42): median 193 ms per frame at 1280 x 720 (dpr 2), 146 ms at 390 x 844 (dpr 3), during an autoplay battle. Upper bounds; on a GPU it is much faster.'
};
// verdict files shown as ONE row (a sanity rerun over several hosts and layers): {id: {suffix: label}}; runs named '<run>+<x>'
// (the same run re-judged with another module swapped in) are not counted, only noted
const COLD_COLLAPSE = { 'cutout-characters': { r2: 'Module v1.1.1 sanity reruns: the side-scroller and the A-14 starter with the sample pack, the side-scroller regenerating its own art' } };
const STARTER_HOSTS = { 'starter+damage-pop': 'Its starter game + C-11 damage pop', 'starter+task': 'Its starter game + a task (add a new card and a new foe)' };
function suffixLabel(sfx, id) {
  if (!sfx) return '';
  if ((COLD_RERUN[id] || {})[sfx]) return ` (${COLD_RERUN[id][sfx]})`;
  if (/^r\d+$/.test(sfx)) return ` (rerun ${sfx} after a fix)`;
  const v = sfx.match(/^v(\d)(\d)(\d?)$/); if (v) return ` (module v${v[1]}.${v[2]}${v[3] ? '.' + v[3] : ''})`;
  if (sfx === 'w4') return ' (final module, wave-4 sanity check)';
  return ` (${sfx})`;
}
function judgeStatus(id) {
  const dir = path.join(ROOT, 'coldtests', 'sol');
  const re = new RegExp(`^judge-m(8|9|10)-${id}(?:-(pack|regen))?(?:-((?:r|v|w)\\d+))?\\.json$`);   // M10: -pack / -regen name the asset layer
  const files = exists(dir) ? fs.readdirSync(dir).filter(f => re.test(f)).map(f => { const mm = f.match(re), j = JSON.parse(read(path.join(dir, f)));
    if (mm[2] && !j.layer) j.layer = mm[2] === 'regen' ? 'regenerate' : 'pack';
    const t = Date.parse(String(j.judgedAt || '').replace(/ CST/, ' GMT+0800').replace(/^(\d{4}-\d\d-\d\d) (\d\d:\d\d)( GMT\+0800)?$/, '$1T$2:00+08:00'));
    if (!isNaN(t)) j.judgedAt = new Date(t).toISOString();   // judges wrote several date formats; sort on one
    return { f, j, sfx: mm[3] || '' }; }) : [];
  if (!files.length) return { cold: [], issues: [], coldNote: 'Cold tests are still running; no verdict yet.' };
  files.sort((a, b) => String(a.j.judgedAt || '').localeCompare(String(b.j.judgedAt || '')) || (a.sfx ? 1 : 0) - (b.sfx ? 1 : 0) || a.f.localeCompare(b.f));
  const cold = [];
  for (const { j, sfx } of files) {
    const one = (COLD_COLLAPSE[id] || {})[sfx];
    if (one) {
      const rs = Object.entries(j.runs || {}), main = rs.filter(([n]) => !n.includes('+')), swap = rs.filter(([n]) => n.includes('+'));
      cold.push([one, `${main.filter(([, r]) => r.integrationPass).length}/${main.length} integrated${swap.length ? `; the regenerated run (made with v1.1.0) also passes with v1.1.1 swapped in (${swap.filter(([, r]) => r.integrationPass).length}/${swap.length})` : ''}`, 'solH']);
      continue;
    }
    const per = {};
    for (const [name, r] of Object.entries(j.runs || {})) {
      const host = r.host || (name.replace(id + '-', '').replace(/^(r|v|w)\d+-/, '').match(/^([a-z-]+)-\d+$/) || [])[1] || 'game';
      const lay = r.layer || j.layer, layer = lay === 'regenerate' ? ', regenerating its own art' : lay === 'pack' ? ', with the sample art pack' : '';
      const k = host + '|' + layer;
      const x = (per[k] ||= { host, layer, p: 0, n: 0, gl: 0, gln: 0 });
      x.n++; if (r.integrationPass) x.p++;
      if (r.webgl) { x.gln++; if (r.webgl.on === 'pass' && r.webgl.off === 'pass') x.gl++; }
    }
    for (const x of Object.values(per)) { const hb = (STARTER_HOSTS_BY_ID[id] || {}), minor = ((COLD_MINOR[id] || {})[sfx] || {})[(x.layer.match(/regenerating/) ? 'regenerate' : x.layer ? 'pack' : '')]; cold.push([`${hb[x.host] || hb[x.host.replace(/ \(.*\)$/, '')] || (x.host === 'starter' ? 'Its starter game + an add-on' : STARTER_HOSTS[x.host]) || `Unseen ${HOSTS[x.host] || HOSTS[x.host.replace(/ \(.*\)$/, '')] || x.host} game`}${x.layer}${suffixLabel(sfx, id)}`,
      `${x.p}/${x.n} integrated${x.gln ? `; WebGL on and off both pass in ${x.gl}/${x.gln}` : ''}${minor ? '; ' + minor : ''}`, 'solH']); }
  }
  return { cold, issues: [], ...(COLD_PENDING[id] ? { coldNote: COLD_PENDING[id] } : {}) };
}
// element.json "starterFiles" (A-14: ["art"]): files the starter loads at run time, which combine.mjs copies beside it.
// Expanded here to a sorted file list relative to the starter's folder, since the browser core cannot list folders.
function starterFilesOf(json, dir, starterRel) {
  if (!starterRel || !json.starterFiles) return [];
  const base = path.join(dir, path.dirname(starterRel)), out = [];
  const walk = rel => { const abs = path.join(base, rel); if (!exists(abs)) return;
    if (fs.statSync(abs).isDirectory()) fs.readdirSync(abs).sort().forEach(f => walk(path.posix.join(rel, f))); else out.push(rel); };
  json.starterFiles.forEach(walk);
  return out;
}
// Published = the site builder has taken the element in: its card loop is in site/assets/frames/frames.json (written by
// tools/site-frames.py). Folders without one (a wave still being built) get no page and never appear in compatibility
// lists, kits, the basket or the catalog; run site-frames.py for them when they are released.
const UNPUBLISHED = fs.readdirSync(EL).filter(d => exists(path.join(EL, d, 'element.json')) && !frames[d]).sort();
if (UNPUBLISHED.length) console.warn('skip (not published, no card loop in frames.json): ' + UNPUBLISHED.join(', '));
const ids = fs.readdirSync(EL).filter(d => exists(path.join(EL, d, 'element.json')) && frames[d]).sort();
const E = [];
for (const id of ids) {
  const dir = path.join(EL, id), json = JSON.parse(read(path.join(dir, 'element.json')));
  const md = exists(path.join(dir, 'element.md')) ? read(path.join(dir, 'element.md')) : '';
  const mod = moduleInfo(json, dir);
  const hintPath = path.join(ROOT, 'tools', 'basket', id + '.mjs');
  const hint = exists(hintPath) ? (await import(pathToFileURL(hintPath).href)).default : null;
  const modSrc = mod.file && exists(path.join(dir, mod.file)) ? fs.readFileSync(path.join(dir, mod.file)) : null;
  const starterRel = json.kind === 'system' && json.starter ? json.starter : null;
  const starterReadme = starterRel ? path.posix.join(path.posix.dirname(starterRel), 'README.md') : null;
  const fam = json.code[0];
  const fr = frames[id] || null;
  // asset-pack elements (FORMAT v1.6, L family): manifest files shipped as the sample pack
  let pack = null;
  if (json.assetPack) {
    const mp = path.join(dir, json.assetPack.manifest || 'assets/assets.json');
    const man = exists(mp) ? JSON.parse(read(mp)) : { assets: [] };
    const base = path.posix.dirname(path.relative(dir, mp).split(path.sep).join('/'));
    const rt = man.runtime || {};   // L-10: the rig files the module loads (pack.js, pack.json) ship with the images;
    // with no prompt-pack.md, prompt.md is the pack prompt (L-10: one prompt covers the pack and regenerate layers)
    const files = [...(man.assets || []).map(a => path.posix.join(base, a.file)), ...[rt.script, rt.pack].filter(Boolean).map(f => path.posix.join(base, f))].filter((f, i, a) => a.indexOf(f) === i && exists(path.join(dir, f)));
    const bytes = files.reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0);
    pack = { manifest: path.posix.join(base, path.posix.basename(mp)), files, bytes, calls: man.imagegenCalls || json.assetPack.imagegenCalls || null, packPrompt: exists(path.join(dir, 'prompt-pack.md')) ? 'prompt-pack.md' : exists(path.join(dir, 'prompt.md')) ? 'prompt.md' : null, regen: exists(path.join(dir, 'prompt.md')) ? 'prompt.md' : null, ap: json.assetPack };
  }
  E.push({
    id, dir, json, md, hint, mod, fam, code: json.code, name: json.name, kind: json.kind === 'system' ? 'system' : 'addon',
    sha: modSrc ? crypto.createHash('sha256').update(modSrc).digest('hex') : '',
    skin: modSrc ? /GameDNA_Skin/.test(modSrc.toString()) : false,
    starterRel, starterExists: !!(starterRel && exists(path.join(dir, starterRel))), starterFiles: starterFilesOf(json, dir, starterRel), kitDemo: exists(path.join(dir, 'demo/index.html')) && read(path.join(dir, 'demo/index.html')).includes('demo-kit/kit.js'), starterReadme, starterReadmeExists: !!(starterReadme && exists(path.join(dir, starterReadme))),
    readmeExists: exists(path.join(dir, mod.readme)), critic: critic(dir), status: STATUS[id] || judgeStatus(id),
    frame: fr, w: fr ? fr.w : 256, h: fr ? fr.h : 224, hd: !!(fr && fr.hd), pack, requires: json.requires || [], release: RELEASE_OF[id] || null
  });
}
const BY = Object.fromEntries(E.map(e => [e.id, e]));
const sortCode = (a, b) => a.code.localeCompare(b.code);
E.sort(sortCode);
for (const e of E) e.requiredBy = E.filter(o => o.requires.includes(e.id)).map(o => o.id);
const VERIFIED_STYLES = ['grid-range-path', 'damage-numbers', 'window-cursor'];   // modules drawn in every style on skins/compare.html

// basket data for the browser core (same inputs combine.mjs reads)
const BASKET_DATA = { elements: {} };
for (const e of E) BASKET_DATA.elements[e.id] = {
  json: e.json, md: e.hint ? '' : e.md, hint: e.hint, file: e.mod.file, global: e.mod.global, readme: e.mod.readme, readmeExists: e.readmeExists,
  sha: e.sha, starter: e.starterRel, starterExists: e.starterExists, starterReadme: e.starterReadme, starterReadmeExists: e.starterReadmeExists, starterFiles: e.starterFiles,
  pack: e.pack ? { manifest: e.pack.manifest, files: e.pack.files, bytes: e.pack.bytes, prompt: e.pack.packPrompt } : null   // site-only: the zip's optional art/<id>/ folder
};

// ---------------------------------------------------------------- styles
const STYLE_ORDER = ['pixel8', 'pixel16', 'handheld4', 'hd-diorama', 'flat', 'watercolor', 'cel', 'lowpoly', 'gothic', 'neon-vector', 'rubber-hose', 'lit-hd', 'painted-impasto', 'glass-ui'];
const STYLE_NAMES = { handheld4: '4-shade handheld pixel', 'neon-vector': 'Neon vector arcade', 'rubber-hose': '1930s rubber-hose cartoon', pixel8: '8-bit console pixel', pixel16: '16-bit console pixel', 'hd-diorama': 'HD pixel diorama', flat: 'Flat vector', watercolor: 'Watercolor storybook', cel: 'Cel-shaded anime', lowpoly: 'Low-poly 3D', gothic: 'Dark gothic painterly', 'lit-hd': 'Lit HD 2D', 'painted-impasto': 'Painted impasto HD', 'glass-ui': 'Glass & gradient UI' };
const PIXEL16_PROMPT = `# Prompt fragment: pixel16 (16-bit console pixel)

Art style: 16-bit console pixel art, original look. Native 256×224 canvas, integer-scaled with square pixels and smoothing off. Sprites are hand-placed palette pixel art with 3–5 shade steps per colour and a dark outline; backgrounds use at least three parallax layers. Windows are bevelled gradient boxes (deep blue to navy) with a light top-left edge and a dark bottom-right edge; a small white pointing-hand cursor marks the selected row. Text is a 1-bit bitmap font with a 1 px drop shadow. Numbers bounce in on hits with a one-pixel outline; criticals flash. Range overlays are flat tints with a 1 px lighter rim. Skin id: \`pixel16\` (the default).
`;
const PIXEL16_STYLE = `# 16-bit console pixel (\`pixel16\`)

Skin file: \`../pixel16.js\` (needs \`../skin-api.js\` first). It is the **default** skin: it reproduces the built-in drawing of the v1 modules **pixel for pixel** (checked by the parity cases in \`skins/test.html\`, 0 differing pixels).

## 1. Essence

The look every element demo on this site uses: a native 256×224 canvas, integer-scaled, hand-authored palette sprites with 3–5 shade steps, three or more parallax layers, bevelled gradient windows with a pointing-hand cursor, and a 1-bit bitmap font with a drop shadow.

## 2. What it is not

Not smooth vector art, not anti-aliased text, not non-integer scaling, not filtered (blurry) upscaling.

## 3. Notes

- It ignores the squash/stretch hints (\`sx\` / \`sy\`) other skins use, by design: scaling would make non-square pixels.
- It has no move-arrow (\`path\`) or atmosphere of its own; B-01 keeps its built-in raster arrow.
- Full contract: \`SPEC.md\` §5 in the skins folder.

This page was written for the site from \`skins/SPEC.md\`; pixel16 has no STYLE.md of its own.
`;
const S = STYLE_ORDER.map(slug => {
  const dir = slug === 'pixel16' ? SK : path.join(SK, slug);
  const style = (slug === 'pixel16' ? PIXEL16_STYLE : read(path.join(dir, 'STYLE.md'))).replace(/Mode 7/g, 'pseudo-3D');
  const prompt = slug === 'pixel16' ? PIXEL16_PROMPT : read(path.join(dir, 'prompt.md'));
  const critics = slug === 'pixel16' ? ['compare-shots/critic-pixel16-r2.json'] : (exists(path.join(dir, 'checks')) ? fs.readdirSync(path.join(dir, 'checks')).filter(f => /critic.*\.json$/.test(f)).sort().map(f => slug + '/checks/' + f) : []);
  let score = null;
  for (const c of critics) { try { const j = JSON.parse(read(path.join(SK, c))); if (j.score != null) score = j.score; } catch { } }
  let essence = ((style.match(/## 1\.[^\n]*\n+([^\n]+)/) || [])[1] || '').replace(/^\s*[-*]\s+/, '').replace(/\*\*/g, '').replace(/^Is\s*:\s*/i, '');
  essence = essence.charAt(0).toUpperCase() + essence.slice(1);
  const fragment = prompt.replace(/^# [^\n]*\n+/, '').trim();
  return { slug, name: STYLE_NAMES[slug], style, prompt, fragment, score, essence: essence.replace(/\*\*/g, ''), pixel: ['pixel8', 'pixel16', 'hd-diorama', 'handheld4'].includes(slug),
    file: slug === 'pixel16' ? 'skins/pixel16.js' : `skins/${slug}/${slug}.js`, preview: slug === 'pixel16' ? 'skins/compare.html?only=pixel16' : `skins/${slug}/preview.html`, shot: `site/assets/styles/${slug}-b.webp`, shotA: `site/assets/styles/${slug}-a.webp`,
    hi: exists(path.join(SITE, `assets/styles/${slug}-a2x.webp`)) };   // smooth styles also have 1024-wide -a2x / -b2x images
});
const SBY = Object.fromEntries(S.map(s => [s.slug, s]));
// "New" (latest release only) and "✦ AI art" marks on style cards and pages (called after LATEST is set)
const styleBadges = (s, long) => (STYLE_RELEASE[s.slug] && STYLE_RELEASE[s.slug] === LATEST ? `<span class="badge-new" title="New in ${STYLE_RELEASE[s.slug]} (${RELEASE_DATE[STYLE_RELEASE[s.slug]]})">New</span>` : '') +
  (STYLE_GEN[s.slug] ? `<span class="badge-gen" title="AI-generated art: the look ships a small generated bitmap pack (Codex image_gen, locked to one style sheet); without it the skin paints everything in code">✦ ${long ? 'Uses generated art' : 'AI art'}</span>` : '');
const srcset = (s, pre, which, lazy) => { if (!s.hi) return ''; const f = which === 'a' ? s.shotA : s.shot;   // width descriptors: the 1024 image wherever it is shown wider than 512 device px
  return ` ${lazy ? 'data-srcset' : 'srcset'}="${pre}${f} 512w, ${pre}${f.replace(/\.webp$/, '2x.webp')} 1024w" sizes="(max-width: 900px) 100vw, 760px"`; };
// final critic scores from the project log (2026-11-14) where a style's JSON has none
const STYLE_SCORE_LOG = { flat: 8.0, cel: 8.2, lowpoly: 7.7, watercolor: 7.6, pixel16: 7.6, pixel8: 7.6, gothic: 7.6, 'hd-diorama': 7.6 };
for (const s of S) if (s.score == null) s.score = STYLE_SCORE_LOG[s.slug];

// ---------------------------------------------------------------- compatibility (pairwise, same rules as combine.mjs)
const pairRes = {};
const pair = (a, b) => (pairRes[a + '|' + b] ??= Core.run(BASKET_DATA, { ids: [a, b], checkOnly: true }));
const H = e => e.hint || {};
function wiringBetween(a, b) {
  const out = [];
  for (const [tag, w] of Object.entries(H(a).wants || {})) if ((H(b).offers || {})[tag]) out.push(w.title);
  for (const [tag, w] of Object.entries(H(b).wants || {})) if ((H(a).offers || {})[tag]) out.push(w.title);
  return [...new Set(out)];
}
function reasonOf(res) {
  const errs = res.report.filter(r => r.level === 'ERROR').map(r => r.msg);
  const out = [];
  for (const m of errs) {
    if (/both system elements/.test(m)) out.push('both are system elements (a basket holds one)');
    else if (/own the same system/.test(m)) out.push('same system family');
    else if (/^time:/.test(m)) out.push('turn-based vs running clock');
    else if (/^coords:/.test(m)) { const mm = m.match(/assumes a (\w+) view, .* a (\w+) view/); out.push(mm ? `${COORDS[mm[1]] || mm[1]} vs ${COORDS[mm[2]] || mm[2]}` : 'different views'); }
    else if (/starter-only/.test(m)) out.push('starter only');
    else out.push(m);
  }
  return [...new Set(out)].join('; ');
}
for (const e of E) {
  const good = [], bad = [];
  for (const o of E) {
    if (o === e) continue;
    const r = pair(e.id, o.id);
    if (r.errors) { bad.push({ id: o.id, why: reasonOf(r) }); continue; }
    const wires = wiringBetween(e, o), inCombo = COMBOS.some(c => c.ids.includes(e.id) && c.ids.includes(o.id));
    const score = wires.length * 3 + (inCombo ? 2 : 0) + (r.warnings ? 0 : 1);
    const why = wires.length ? 'Wired together: ' + wires.join('; ') : inCombo ? 'Used together in a recommended kit' : r.warnings ? 'Compatible; ' + r.warnings + ' warning' + (r.warnings > 1 ? 's' : '') : 'Compatible, no warnings';
    good.push({ id: o.id, why, score, warnings: r.warnings });
  }
  good.sort((a, b) => b.score - a.score || sortCode(BY[a.id], BY[b.id]));
  e.goodWith = good.slice(0, 6); e.conflicts = bad.sort((a, b) => sortCode(BY[a.id], BY[b.id]));
}
for (const c of COMBOS) {
  c.res = Core.run(BASKET_DATA, { ids: c.ids, checkOnly: true });
  if (c.res.errors) console.warn(`WARN combo ${c.slug} has ${c.res.errors} errors: ` + c.res.report.filter(r => r.level === 'ERROR').map(r => r.msg).join(' | '));
}

// ---------------------------------------------------------------- markdown -> HTML (small subset: what our .md files use)
function inline(s, base) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => {
    let href = u.replace(/&amp;/g, '&');
    if (base && !/^(https?:|#|mailto:|\/)/.test(href)) href = base + href;
    return `<a href="${esc(href)}">${t}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${esc(codes[+i])}</code>`);
  return s;
}
function md2html(src, base = '', opt = {}) {
  const lines = src.replace(/\r/g, '').split('\n'), out = [];
  let i = 0;
  const shift = opt.shift || 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) { const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`); continue; }
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) { const n = Math.min(6, h[1].length + shift); const id = h[2].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); out.push(`<h${n} id="${opt.idp || ''}${id}">${inline(h[2], base)}</h${n}>`); i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const row = r => r.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
      const head = row(l); i += 2; const body = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(row(lines[i++]));
      out.push('<table><thead><tr>' + head.map(c => `<th>${inline(c, base)}</th>`).join('') + '</tr></thead><tbody>' + body.map(r => '<tr>' + r.map(c => `<td>${inline(c, base)}</td>`).join('') + '</tr>').join('') + '</tbody></table>');
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordered = /^\s*\d+\./.test(l), items = [];
      while (i < lines.length && (/^\s*([-*]|\d+\.)\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        if (/^\s*([-*]|\d+\.)\s+/.test(lines[i]) && !/^\s{4,}/.test(lines[i])) items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
        else items[items.length - 1] += ' ' + lines[i].trim().replace(/^([-*]|\d+\.)\s+/, '· ');
        i++;
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>` + items.map(t => `<li>${inline(t, base)}</li>`).join('') + `</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    if (/^>\s?/.test(l)) { const buf = []; while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, '')); out.push(`<blockquote>${md2html(buf.join('\n'), base)}</blockquote>`); continue; }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (!l.trim()) { i++; continue; }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*([-*]|\d+\.)\s+|>|\s*\|.*\|\s*$)/.test(lines[i])) buf.push(lines[i++]);
    if (!buf.length) { buf.push(lines[i++]); }
    out.push(`<p>${inline(buf.join(' '), base)}</p>`);
  }
  return out.join('\n');
}
function mdSection(md, n, alt) {   // alt: an unnumbered heading some M10 specs use ("Acceptance moments")
  const m = md.match(new RegExp(`^## (?:${n}\\.${alt ? '|' + alt : ''})[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  return m ? m[1].trim() : '';
}

// ---------------------------------------------------------------- page shell
const ICON = {
  copy: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"/></svg>',
  plus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v10M3 8h10"/></svg>',
  play: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l9-5.5z"/></svg>',
  md: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="3.5" width="13" height="9" rx="1.5"/><path d="M4 10.5v-5l2 2.5 2-2.5v5M11.5 5.5v5m-2-2 2 2 2-2"/></svg>',
  dl: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M8 2v8m-3.5-3.5L8 10l3.5-3.5M3 13.5h10"/></svg>'
};
const LOGO = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 2c0 6 12 6 12 10S6 16 6 22" stroke="var(--fam-C)" stroke-width="2.2" stroke-linecap="round"/><path d="M18 2c0 6-12 6-12 10s12 4 12 10" stroke="var(--fam-A)" stroke-width="2.2" stroke-linecap="round"/><path d="M8 5h8M9 9h6M9 15h6M8 19h8" stroke="var(--fg)" stroke-width="1.6" stroke-linecap="round"/></svg>';
const NAV = [['', 'Home'], ['dna/', 'Elements'], ['basket/', 'Basket'], ['styles/', 'Styles'], ['use/', 'How to use', 'Use'], ['about/', 'About']];
function page({ rel, title, desc, body, active, scripts = [], head = '' }) {
  const depth = rel.split('/').filter(Boolean).length;   // rel = 'dna/x/' etc.
  const site = depth ? '../'.repeat(depth) : './';
  const root = site + '../';
  const nav = NAV.map(([href, label, short]) => `<a href="${site}${href}"${active === href ? ' aria-current="page"' : ''}>${short ? `<span class="long">${label}</span><span class="short">${short}</span>` : label}</a>`).join('');
  return `<!doctype html>
<html lang="en" data-site="${site}" data-root="${root}" data-page="${active || 'home'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${site}assets/site.css">
<link rel="stylesheet" href="${site}assets/families.css">
<link rel="alternate" type="text/markdown" href="index.md">
${head}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top"><div class="wrap">
<a class="brand" href="${site}">${LOGO}<span>Game DNA</span></a>
<nav class="nav" aria-label="Main">${nav}</nav>
<button class="theme-btn" type="button" aria-label="Switch light or dark theme" title="Light / dark">◐</button>
</div></header>
<main id="main">
${body}
</main>
<footer class="foot"><div class="wrap">
<span>Game DNA · private local build · original art only · not affiliated with any game company · <a href="${site}about/">About &amp; credits</a></span>
<span><a href="${site}llms.txt">llms.txt</a> · <a href="${site}catalog.json">catalog.json</a> · <button class="btn sm ghost" type="button" data-copy-md="index.md">${ICON.md}Copy page as markdown</button></span>
</div></footer>
<script src="${site}assets/catalog.js"></script>
<script src="${site}assets/site.js"></script>
${scripts.map(s => `<script src="${site}assets/${s}"></script>`).join('\n')}
</body>
</html>
`;
}

// ---------------------------------------------------------------- shared bits
const famStyle = e => `data-fam="${e.fam}"`;
const codeTag = e => `<span class="code" ${famStyle(e)}>${e.code}</span>`;
const lastCritic = e => e.critic[e.critic.length - 1] || null;
const PITCH = {   // the one-sentence template: 'Add <element> to <your game>: <pitch>.' (benefit in plain words, written for the site)
  'active-time-battle': "gauges fill in real time, so every turn feels urgent",
  'four-move-battle': "pick one of four moves; type matchups decide the damage",
  'combat-forecast': "see damage, hit chance and counters before you commit",
  'sword-combat': "three-hit combos, telegraphed enemies and real dodges",
  'grid-range-path': "show where a unit can walk and draw its path",
  'threat-range': "show every tile an enemy could strike next turn",
  'fog-of-war': "hide what your units cannot see",
  'iso-height-map': "height that blocks, lifts and changes every move",
  'level-select-map': "a world map whose path draws itself to the next level",
  'pseudo3d-flight': "fly low over a tilted, rotating ground",
  'platformer-feel': "jumps that forgive late presses and land where you meant",
  'window-cursor': "classic framed menus with a bobbing pointer",
  'turn-order-bar': "a strip of portraits showing who acts next",
  'pixel-font': "crisp bitmap text that types out",
  'big-banner': "bold phase and victory banners that sweep across",
  'springy-ui': "menus that open, pop and settle with a little bounce",
  'damage-pop': "hits arc out, crits pop, combos roll into one total",
  'palette-swap': "recoloured enemy variants from one sprite",
  'expressive-portraits': "faces that react while characters talk",
  'damage-numbers': "damage that pops above the target and bounces",
  'hit-sparks': "slashes, bursts and shockwaves where hits land",
  'dissolve-defeat': "defeated enemies crumble away instead of vanishing",
  'battle-transition': "the screen shatters as a battle begins",
  'hit-stop-shake': "a frozen beat, a shake and a flash on big hits",
  'weather-particles': "rain, snow, leaves and fireflies in layers",
  'squash-stretch': "characters that crouch, stretch and squash with every move",
  'verlet-cloth': "capes, banners and ropes that swing and flutter",
  'timing-bar': "a press-at-the-right-moment check for any action",
  'shop-inventory': "a shop with item grids, prices and stat comparisons",
  'level-up-growth': "post-battle experience, level-ups and stat gains",
  'upgrade-draft': "pick one of three upgrade cards at each level-up",
  'dialogue-box': "typed lines with name plates that never cover the speaker",
  'dialogue-choices': "answers that branch the story and remember your choices",
  'pixel-scaler': "sharp, square pixels at any screen size",
  'parallax-layers': "a layered backdrop that scrolls with depth",
  'touch-controls': "on-screen buttons that catch every quick tap",
  'save-slots': "save and load slots with pictures of where you were",
  'webgl-post': "a light post-processing pass over your 2D game",
  'dynamic-lights': "torches, lamps and soft real-time shadows",
  'bloom-glow': "magic, fire and lights that glow",
  'color-grade-lut': "a mood per scene: dusk, night, memory, combat",
  'camera-director': "a camera that leads, frames bosses and punches on big hits",
  'art-direction-lock': "generated art that all looks like one artist made it",
  'painted-parallax': "hand-painted backdrop layers in one locked style",
  'painted-portraits': "painted character busts with expressions for conversations",
  'painted-ui': "painted window frames and an icon sheet for your menus",
  'modern-particles': "sparks that bounce, smoke that drifts and thousands of glowing motes",
  'ribbon-trails': "smooth tapered trails behind swords, dashes and bolts",
  'toasts': "item, quest and achievement pop-ups that stack and merge without pausing",
  'bark-bubbles': "short spoken lines above characters while the game keeps running",
  'screen-distortion': "heat haze, shockwaves, underwater wobble and swirling portals",
  'squad-formation': "squads on a front and back row, arranged by drag or keys",
  'tactic-rules': "units that act by your rules, and say which rule fired",
  'stamina-rest': "squads tire as they march and fight, and rest at camps you hold",
  'squad-clash': "squad fights that play out exactly as the forecast said",
  'normal-maps': "generated sprites get depth maps so light can wrap around them",
  'normal-lighting': "sprites that catch light on their lit side and fall to shade on the other",
  'run-map': "a branching route of fights, shops and rests up to a boss",
  'card-art': "painted card illustrations in one locked style, with a card frame drawn in code",
  'card-battle': "play cards against foes that show what they will do next",
  'cutout-characters': "painted characters that breathe, walk, slash and recoil without sprite sheets",
  'bullet-patterns': "enemies cast fans, rings, spirals and flowers of bullets, always with a gap to slip through",
  'draining-hp-bar': "HP bars that drop at once, then drain a pale loss segment so every hit reads",
  'procedural-sfx': "fourteen game sounds made live by Web Audio, a little different every time, no audio files",
  'time-rewind': "hold a key and the world runs backwards, then play on from that moment",
  'toon-outlines-3d': "a three.js scene turned cel-shaded with ink outlines, in one call",
  'horde-survival': "a hero who only walks while weapons fire by themselves at swarms that grow every minute",
  'vision-cones': "guards with view cones that walls block, a suspicion meter and grass to hide in",
  'tower-defense': "towers beside a winding road, waves you can preview, upgrades and a boss",
  'minimap': "a corner map that fills in as you explore, with an arrow, markers and a full-map view",
  'physics-debris': "crates, barrels and rocks that shatter into pieces that tumble, bounce off walls and settle",
  'grapple-swing': "a hook you fire at rings and rock, swing from with real momentum, and wrap around corners",
  'on-map-skirmish': "attack exchanges that play on the map itself: lunge, white flash, knock-back, counters and draining HP plates",
  'clash-cutin': "a side-view cut-in where both fighters leap, strike, counter and land criticals",
  'title-menu': "a title screen, start menu, options and pause menu with screen wipes",
  'quest-log': "quest banners, a tracker that counts your steps and a log of what is left to do",
  'world-hud': "rings, name plates and arrows that float over the world and never overlap",
  'wfc-town-3d': "a 3D island town that builds itself from tiles as you place houses, towers and arches",
  'seeded-replay': "replays and a ghost to race that always end exactly the same way",
  'water-surface': "water that ripples, splashes and carries floating things when anything falls in",
  'loot-beams': "loot that bursts out with rarity beams and name tags, then flies to the hero",
  'kart-racer-3d': "a 3D kart race with drifts that charge boosts, jumps, rivals and a two-race cup",
  'match3-battle': "a match-3 board whose matches and combos make your party strike, heal and cast skills",
  'ik-creatures': "spiders, crabs and centipedes whose legs step on the real ground, up ledges and over rocks",
  'dungeon-floors': "dungeon floors generated room by room, with doors, chests, monsters and a boss at the bottom",
  'motion-inputs': "special moves from quarter circles, charges and full circles, with an input display",
  'crafting-recipes': "a crafting bench with a recipe book, discovery by experiment and toasts for new recipes",
  'shaped-inventory': "a bag where every item has a shape you rotate and fit, with stacking, swapping and sorting",
  'chip-music': "chip-tune music synthesized live: four-channel loops that switch on the beat, plus jingles",
  'beat-judge': "a beat judge that rates every press Perfect, Good or Miss, with a calibration for audio lag",
  'adaptive-music': "music that follows the game state, fading layers in and out on the bar line",
  'paper-doll': "a layered pixel character with a wardrobe: swap and recolour hat, armour, weapon and shield",
  'talking-portraits': "dialogue portraits whose mouths move with the typed text, with blinks and expressions",
  'sprite-stacking': "pseudo-3D props from stacked pixel slices that keep their depth as the camera turns",
  'raycast-dungeon': "a first-person dungeon crawl drawn by raycasting: turn-based steps, monsters, stairs and a boss",
  'belt-depth': "street depth for brawlers: lanes, shadows, jumps and blows that only land in the same lane",
  'scripted-cutscenes': "cutscenes where your own characters walk, turn and talk on cue, with letterbox bars, a moving camera and hold-to-skip",
  'farming-plots': "till, plant and water plots that grow overnight, then harvest and ship through the seasons",
  'keyword-tooltips': "keywords that open tooltips, nest inside each other and pin, by mouse, keys or touch"
};
const lowerFirst = t => /^[A-Z][A-Za-z0-9]*[A-Z0-9]/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1);   // "Dynamic 2D lights" -> "dynamic 2D lights"
// the one-sentence template: the one-liner's first clause (up to the first ';' or sentence end), so the line stays one sentence
const firstClause = t => { const m = t.match(/^(.{12,}?)(?:;\s|:\s|\.\s|\.$)/); let c = (m ? m[1] : t).replace(/[.;,:]$/, ''); if (c.length > 120) { const k = c.indexOf(' ('); if (k > 20) c = c.slice(0, k); } return c; };
const RELEASE_DATE = Object.fromEntries(CHANGELOG.map(([r, d]) => [r, d]));
const LATEST = CHANGELOG[0][0];   // "New" marks only the latest release; earlier ones are in the /dna/ "Added" filter
const NEW_RELEASES = new Set([LATEST, 'M12']);   // M12 and M13 were added together in one site build (2026-11-18)
const newBadge = e => NEW_RELEASES.has(e.release) ? `<span class="badge-new" title="New in ${e.release} (${RELEASE_DATE[e.release]})">New</span>` : '';
// generated bitmaps outside the L-family packs (demo scenes and a starter; the modules draw none of them), from each set's assets.json
const KIT_CALLS = (() => { try { return JSON.parse(read(path.join(ROOT, 'demo-kit/assets/assets.json'))).generated.calls; } catch (e) { return null; } })();
const A14_CALLS = (() => { try { return JSON.parse(read(path.join(ROOT, 'elements/squad-clash/assets/assets.json'))).imagegenCalls; } catch (e) { return null; } })();
const GEN_OTHER = {
  'squad-clash': `the starter game ships painted units and backdrops in <code>art/</code> (13 classes with left-facing paintings for the enemy side, one meadow at four times of day; ${A14_CALLS || 13} image_gen calls, Codex image generation; prompts and sha256 in <a href="../../../elements/squad-clash/assets/assets.json">assets.json</a>). Without <code>art/</code> it draws built-in vector units. The module itself ships no images.`,
  'bark-bubbles': 'the demo scene\'s villagers, jellies, stall, gate and two walk cycles were made for the demo in 8 image_gen calls (Codex image generation; <a href="../../../elements/bark-bubbles/demo/assets/assets.json">assets.json</a>). The module draws no bitmaps.'
};
const GEN_PROV = { 'cutout-characters': 'one line-up of the three original designs, then one parts sheet per character with its own line-up crop as the only reference; the pieces were cut and rigged by a script, no image edited by hand' };   // how a pack was generated (from its build notes)
const GEN_NOTE = 'needs an image generator (Codex image_gen) to make your own art set; a sample pack is included and works without one';
const genBadge = (e, long) => e.pack ? `<span class="badge-gen" title="AI-generated art: ${GEN_NOTE}">✦ ${long ? 'Needs image generation' : 'AI art'}</span>` : '';
const genLegend = `<p class="legend faint"><span class="badge-gen">✦ AI art</span> Making your own art set needs an image generator (Codex image_gen); each such element comes with a sample pack that works without one.</p>`;
function criticLine(e) {
  const c = e.critic; if (!c.length) return 'No critic verdict recorded.';
  const L = c[c.length - 1];
  const hist = c.map(r => r.starter != null ? `${r.demo}/${r.starter}` : `${r.demo}`).join(' → ');
  return `${L.starter != null ? 'Demo ' + L.demo + ' · starter ' + L.starter : L.demo} after ${c.length} round${c.length > 1 ? 's' : ''}${c.length > 1 ? ' (' + hist + ')' : ''}; ${L.pass ? 'passed (bar: ≥7.5, no major issue)' : 'did not pass (bar: ≥7.5, no major issue)'}`;
}
const hasIssue = e => !!(e.status.fail || e.status.issues.length || (lastCritic(e) && !lastCritic(e).pass));
function thumb(e, href) {
  const poster = `assets/frames/${e.id}-poster.webp`, strip = `assets/frames/${e.id}.webp`;
  return { poster, strip };
}
function stripAttrs(e, site) {
  const [fx, fy, k] = FOCAL[e.id] || [e.w / 2, e.h / 2];
  return `${e.hd ? 'data-hd ' : ''}${k ? `data-k="${k}" ` : ''}data-strip="${site}assets/frames/${e.id}.webp" data-poster="${site}assets/frames/${e.id}-poster.webp" data-n="${e.frame ? e.frame.n : 1}" data-w="${e.w}" data-h="${e.h}" data-fx="${fx}" data-fy="${fy}"`;
}
function card(e, site) {
  const fits = e.json.fits.slice(0, 3).map(f => `<span class="tag">${esc(f)}</span>`).join('');
  const n = e.frame ? e.frame.n : 1;
  return `<article class="card" ${famStyle(e)} data-id="${e.id}" data-family="${e.fam}" data-kind="${e.kind}" data-time="${e.json.interfaces.time}" data-coords="${e.json.interfaces.coords}" data-styles="${VERIFIED_STYLES.includes(e.id) ? 'verified' : e.skin ? 'skin' : 'pixel'}" data-status="${hasIssue(e) ? 'issue' : 'pass'}" data-release="${e.release || 'M7'}" data-search="${esc([e.code, e.name, e.json.oneLiner, ...e.json.fits, FAMILIES[e.fam].name, e.kind, e.release ? 'new ' + e.release : '', e.pack ? 'generated art pack' : ''].join(' ').toLowerCase())}">
<a class="thumb" href="${site}dna/${e.id}/" tabindex="-1" aria-hidden="true" ${stripAttrs(e, site)}><div class="frame" style="background-image:url('${site}assets/frames/${e.id}-poster.webp')"></div></a>
<div class="body">
<div class="head">${codeTag(e)}${newBadge(e)}${genBadge(e)}<span class="kind">${e.kind}</span></div>
<h3><a href="${site}dna/${e.id}/">${esc(e.name)}</a></h3>
<p>${esc(e.json.oneLiner)}</p>
<div class="fits">${fits}</div>
<div class="btn-row"><button class="btn primary sm" type="button" data-add="${e.id}">${ICON.plus}<span class="lab">Add</span></button><button class="btn sm" type="button" data-copy-prompt="${e.id}">${ICON.copy}Copy prompt</button></div>
</div>
</article>`;
}
function comboCard(c, site) {
  const els = c.ids.map(id => BY[id]);
  const sys = els.find(e => e.kind === 'system');
  const hash = 'e=' + c.ids.join(',') + (c.starter && sys ? '&starter=1' : '');
  return `<article class="combo">
<p class="eyebrow">Recommended kit</p>
<h3>${esc(c.name)}</h3>
<p class="muted" style="margin:0">${esc(c.blurb)}</p>
<div class="hx-static"></div>
<ul>${els.map(e => `<li ${famStyle(e)}>${codeTag(e)}<a href="${site}dna/${e.id}/">${esc(e.name)}</a></li>`).join('')}</ul>
<p class="faint" style="margin:0;font-size:13px">${c.res.errors ? c.res.errors + ' conflicts' : 'Fits together'} · your game must provide ${c.res.report.filter(r => r.level !== 'ERROR' && /no element here provides it/.test(r.msg)).length}${c.res.report.some(r => r.level === 'WARN' && !/no element here provides it/.test(r.msg)) ? ' · ' + c.res.report.filter(r => r.level === 'WARN' && !/no element here provides it/.test(r.msg)).length + ' layout note' + (c.res.report.filter(r => r.level === 'WARN' && !/no element here provides it/.test(r.msg)).length > 1 ? 's' : '') : ''}${sys && c.starter ? ' · starts from the ' + esc(sys.name.toLowerCase()) + ' starter' : ''}</p>
<div class="btn-row"><a class="btn primary sm" href="${site}basket/#${hash}">${ICON.plus}Open in basket</a></div>
</article>`;
}
function helixStatic(fams, w = 300, h = 70) {   // server-side helix (same drawing as site.js DNA.helix, no conflicts)
  const n = Math.max(fams.length, 4), pad = 14, amp = h / 2 - 10, mid = h / 2, step = (w - pad * 2) / (n - 1), k = Math.PI * 0.8 / step;
  const y = (x, ph) => mid + amp * Math.sin((x - pad) * k + ph + Math.PI / 2);
  const p = ph => { let d = ''; for (let x = pad; x <= w - pad + 0.1; x += 4) d += (d ? 'L' : 'M') + x.toFixed(1) + ' ' + y(x, ph).toFixed(1); return d; };
  let s = `<svg class="helix" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path class="strand" d="${p(0)}"/><path class="strand" d="${p(Math.PI)}"/>`;
  fams.forEach((f, i) => { const x = pad + i * step, a = y(x, 0), b = y(x, Math.PI); s += `<line class="bp" x1="${x}" y1="${a.toFixed(1)}" x2="${x}" y2="${b.toFixed(1)}" stroke="var(--fam-${f})"/><circle cx="${x}" cy="${a.toFixed(1)}" r="3.5" fill="var(--fam-${f})"/><circle cx="${x}" cy="${b.toFixed(1)}" r="3.5" fill="var(--fam-${f})"/>`; });
  return s + '</svg>';
}

// ---------------------------------------------------------------- default single-element prompts (generic COMBO.md)
const defaultPrompt = {};
for (const e of E) {
  const r = Core.run(BASKET_DATA, { ids: [e.id] });
  defaultPrompt[e.id] = r.written ? r.md : '';
}

// ---------------------------------------------------------------- --preview: the showcase prototype only (site/preview/), nothing else
if (process.argv.includes('--preview')) {
  const { buildPreview } = await import('./site-preview.mjs');
  buildPreview({ ROOT, SITE, E, BY, COMBOS, FAMILIES, PITCH, HERO_LOOPS, MOMENTS, defaultPrompt, Core, BASKET_DATA, esc, md2html, mdSection, criticLine, lastCritic, hasIssue,
    MODEL, PERF3D, TIME, COORDS, COORD_LABEL, LAYER, RELEASE_DATE, LOGO, ICON, helixStatic, stripAttrs, firstClause, S });
  process.exit(0);
}

// ---------------------------------------------------------------- pages
fs.rmSync(path.join(SITE, 'dna'), { recursive: true, force: true });
fs.rmSync(path.join(SITE, 'styles'), { recursive: true, force: true });

// families.css: one colour per family per theme (validated, see FAMILY_COLOURS) and the ink (black or white) that reads on it
{
  const lum = h => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ink = h => (1.05 / (lum(h) + 0.05)) >= ((lum(h) + 0.05) / 0.05) ? '#ffffff' : '#0d0e10';
  const vars = t => Object.entries(FAMILY_COLOURS[t]).map(([k, v]) => `--fam-${k}: ${v}; --fam-${k}-ink: ${ink(v)};`).join(' ');
  const sel = Object.keys(FAMILY_COLOURS.dark).map(k => `[data-fam="${k}"] { --fam: var(--fam-${k}); --fam-ink: var(--fam-${k}-ink); }`).join('\n');
  write('assets/families.css', `/* generated by tools/build-site.mjs: family colours (dataviz validator: all checks PASS in both themes, A..L, normal-vision floor on all pairs; see FAMILY_COLOURS) */
:root { ${vars('dark')} }
@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { ${vars('light')} } }
:root[data-theme="light"] { ${vars('light')} }
${sel}
.code { color: var(--fam-ink, #0d0e10); }
`);
}

// catalog.js (small, every page) and basket-data.js (lazy)
write('assets/catalog.js', '/* generated by tools/build-site.mjs */\nwindow.DNA_CATALOG = ' + JSON.stringify({
  elements: E.map(e => ({ id: e.id, code: e.code, fam: e.fam, name: e.name, kind: e.kind, w: e.w, h: e.h, hd: e.hd || undefined, requires: e.requires.length ? e.requires : undefined, pack: e.pack ? true : undefined, release: e.release || undefined })),
  styles: S.map(s => ({ slug: s.slug, name: s.name })), families: Object.fromEntries(Object.entries(FAMILIES).map(([k, v]) => [k, v.name]))
}) + ';\n');
write('assets/basket-data.js', '/* generated by tools/build-site.mjs from elements/ and tools/basket/ */\nwindow.DNA_BASKET_DATA = ' + JSON.stringify(BASKET_DATA) + ';\n' +
  'window.DNA_STYLES = ' + JSON.stringify(Object.fromEntries(S.map(s => [s.slug, { name: s.name, prompt: s.prompt, file: s.file }]))) + ';\n');

// ----- home
{
  const site = './';
  const famTabs = `<div class="tabs" role="tablist" aria-label="Families"><button class="chip" type="button" data-tab="all" aria-pressed="true">All <span class="faint">${E.length}</span></button>` +
    Object.entries(FAMILIES).filter(([k]) => E.some(e => e.fam === k)).map(([k, f]) => `<button class="chip" type="button" data-tab="${k}" data-fam="${k}" aria-pressed="false"><i></i>${k} · ${esc(f.name)} <span class="faint">${E.filter(e => e.fam === k).length}</span></button>`).join('') + '</div>';
  const cap1 = t => t.charAt(0).toUpperCase() + t.slice(1);
  const heroList = HERO.filter(id => BY[id] && HERO_LOOPS[id]).map(id => BY[id]).map(e => ({ id: e.id, code: e.code, fam: e.fam, name: e.name, line: cap1(PITCH[e.id] || firstClause(e.json.oneLiner)), n: HERO_LOOPS[e.id].n, step: HERO_LOOPS[e.id].step }));
  // hero tag from the releases of the newest loops (the first ones in HERO), e.g. 'New in M14 and M15'
  const heroRel = [...new Set(heroList.map(h => RELEASE_OF[h.id]).filter(Boolean))].sort((a, b) => +b.slice(1) - +a.slice(1)).slice(0, 2).reverse();
  const heroTag = 'New in ' + heroRel.join(' and ');
  if (heroList.length !== HERO.length) console.warn('WARN hero: run tools/site-frames.py --hero (missing loops for ' + HERO.filter(id => !HERO_LOOPS[id]).join(', ') + ')');
  const h0 = heroList[0];
  const changelog = `<section class="changelog" aria-label="What's new"><div class="wrap"><p class="eyebrow">What's new</p><ol>${CHANGELOG.slice(0, 3).map(([r, d, t, lab], i) => `<li${i ? '' : ' class="latest"'}><time datetime="${d}">${d}</time><b>${lab || r}</b><span>${esc(t)}</span></li>`).join('')}</ol><a class="more" href="about/#changes">All ${CHANGELOG.length} updates</a></div></section>`;
  const body = `${changelog}
<section class="hero"><div class="wrap hero-grid">
<div>
<p class="eyebrow">Game DNA · ${E.length} elements · ${S.length} styles</p>
<h1>One element, one card. <em>See it, play it, copy it.</em></h1>
<p class="lede">Playable building blocks for games you make with a coding agent, from pixel-era staples (an active-time gauge, a grid movement range) to a modern look: real-time lights, bloom, painted backdrops. Each comes with a module file and an English prompt your agent pastes into <i>your</i> game, plus checks it can run itself.</p>
<div class="btn-row" style="margin-top:22px"><a class="btn" href="dna/">Browse all elements</a><a class="btn ghost" href="use/">How it works</a></div>
<div class="hero-stats"><div><b>${E.filter(e => e.kind === 'addon').length}</b><span>add-on elements</span></div><div><b>${E.filter(e => e.kind === 'system').length}</b><span>system elements with starter games</span></div><div><b>${S.length}</b><span>art styles</span></div></div>
</div>
<div class="hero-m9" data-hero='${esc(JSON.stringify(heroList))}'>
<p class="hero-tag"><span>${heroTag}</span> the new elements, playing in turn</p>
<div class="hero-stage"><div class="bezel hero-screen" role="img" aria-label="${heroTag}: element demos, playing in turn"><div class="hero-loop on" style="background-image:url('${site}assets/hero/${h0.id}-poster.webp')"></div><div class="hero-loop"></div></div></div>
<div class="hero-caption" ${famStyle(BY[h0.id])}><span class="code" data-fam="${h0.fam}">${h0.code}</span><span class="grow"><a class="name" href="${site}dna/${h0.id}/">${esc(h0.name)}</a><span class="muted line">${esc(h0.line)}</span></span><button class="btn primary sm" type="button" data-add="${h0.id}" data-off="Add to basket" data-on="In basket"><span class="lab">Add to basket</span></button></div>
<div class="hero-dots">${heroList.map((it, i) => `<button type="button" data-fam="${it.fam}" aria-label="Show ${esc(it.name)}"${i ? '' : ' aria-current="true"'}></button>`).join('')}</div>
</div>
</div>
<div class="wrap"><div class="minis" aria-label="More elements, playing">${MINI.map(id => BY[id]).map(e => `<a class="mini" href="${site}dna/${e.id}/" ${famStyle(e)} ${stripAttrs(e, site)} data-auto><div class="frame" style="background-image:url('${site}assets/frames/${e.id}-poster.webp')"></div><span class="mini-cap">${codeTag(e)}<span>${esc(e.name)}</span></span></a>`).join('')}</div></div>
</section>
<section class="block"><div class="wrap">
<p class="eyebrow">The specimens</p>
<h2>Pick an element</h2>
<p class="muted" style="margin-top:-6px">Hover a card to play its preview loop. <b>Add</b> puts it in your DNA basket; <b>Copy prompt</b> copies the ready prompt for an unknown game.</p>
${famTabs}
${genLegend}
<div class="grid" id="home-grid">${E.map(e => card(e, site)).join('\n')}</div>
</div></section>
<section class="block"><div class="wrap">
<p class="eyebrow">Recommended combinations</p>
<h2>Start from a kit</h2>
<div class="combos">${COMBOS.map(c => comboCard(c, site).replace('<div class="hx-static"></div>', helixStatic(c.ids.map(id => BY[id].fam)))).join('')}</div>
</div></section>`;
  write('index.html', page({ rel: '', title: 'Game DNA', desc: 'Playable game elements with copy-ready prompts and modules for your coding agent.', body, active: '', scripts: ['home.js'] }));
  write('index.md', `# Game DNA\n\nPlayable game elements with copy-ready English prompts and module files for your coding agent. ${E.length} elements, ${S.length} art styles.\n\n## What's new\n\n` +
    CHANGELOG.map(([r, d, t, lab]) => `- ${d} ${lab || r}: ${t}`).join('\n') + `\n\n## Elements\n\n` +
    E.map(e => `- ${e.code} [${e.name}](dna/${e.id}/index.md) (${e.kind}${e.release ? ', new in ' + e.release : ''}${e.pack ? ', ✦ generated art' : ''}): ${e.json.oneLiner}`).join('\n') +
    `\n\n## Recommended kits\n\n` + COMBOS.map(c => `- ${c.name}: ${c.ids.map(id => BY[id].code + ' ' + BY[id].name).join(', ')}. ${c.blurb}`).join('\n') + '\n');
}

// ----- /dna/ index
{
  const site = '../';
  const row = (label, key, opts) => `<div class="row" role="group" aria-label="${label}"><span>${label}</span><button class="chip" type="button" data-f="${key}" data-v="" aria-pressed="true">Any</button>${opts.map(([v, l, fam]) => `<button class="chip" type="button" data-f="${key}" data-v="${v}" aria-pressed="false"${fam ? ` data-fam="${fam}"` : ''}>${fam ? '<i></i>' : ''}${esc(l)}</button>`).join('')}</div>`;
  const fams = Object.entries(FAMILIES).filter(([k]) => E.some(e => e.fam === k));
  const body = `<section class="block"><div class="wrap">
<p class="eyebrow">Element index</p>
<h1>All elements</h1>
<p class="lede">Search by what you want to add, then narrow by family, kind, clock, view, style and review status.</p>
<div class="filters">
<input class="search" type="search" placeholder="Search: damage, grid, banner, touch, JRPG..." aria-label="Search elements">
${row('Family', 'family', fams.map(([k, f]) => [k, k + ' · ' + f.name, k]))}
<details class="more-filters"><summary>More filters <span class="mf-n"></span></summary><div class="filters-more">
${row('Kind', 'kind', [['addon', 'Add-on (goes into any game)'], ['system', 'System (owns the game loop; has a starter)']])}
${row('Time model', 'time', Object.entries(TIME).filter(([k]) => E.some(e => e.json.interfaces.time === k)))}
${row('Coords', 'coords', Object.entries(COORDS).filter(([k]) => E.some(e => e.json.interfaces.coords === k)))}
${row('Style', 'styles', [['verified', `Shown in all ${S.length} styles`], ['skin', 'Draws through skins'], ['pixel', 'Built-in 16-bit only']])}
${row('Status', 'status', [['pass', 'Passed review'], ['issue', 'Known issues']])}
${row('Added', 'release', [['M16', 'New in M16 (2026-11-20)'], ['M15', 'New in M15 (2026-11-19)'], ['M14', 'New in M14 (2026-11-19)'], ['M13', 'New in M13 (2026-11-18)'], ['M12', 'New in M12 (2026-11-18)'], ['M11', 'New in M11 (2026-11-18)'], ['M10', 'New in M10 (2026-11-17)'], ['M9', 'New in M9 (2026-11-16)'], ['M8', 'New in M8 (2026-11-15)'], ['M7', 'Earlier (M7)']])}
</div></details>
</div>
${genLegend}
<p class="count" aria-live="polite"></p>
<div class="grid" id="dna-grid">${E.map(e => card(e, site)).join('\n')}</div>
<div class="empty" hidden>No element matches. <button class="btn sm" type="button" data-reset>Clear filters</button></div>
</div></section>`;
  write('dna/index.html', page({ rel: 'dna/', title: 'Elements · Game DNA', desc: 'Search and filter all Game DNA elements.', body, active: 'dna/', scripts: ['index.js'] }));
  write('dna/index.md', `# Game DNA elements\n\n| Code | Element | Family | Kind | Time | Coords | One-liner |\n|---|---|---|---|---|---|---|\n` +
    E.map(e => `| ${e.code} | [${e.name}](${e.id}/index.md) | ${FAMILIES[e.fam].name} | ${e.kind} | ${e.json.interfaces.time} | ${e.json.interfaces.coords} | ${e.json.oneLiner.replace(/\|/g, '/')} |`).join('\n') + '\n');
}

// ----- /dna/<id>/
for (const e of E) {
  const site = '../../', root = '../../../', J = e.json, I = J.interfaces;
  const elRoot = `${root}elements/${e.id}/`;
  const famName = FAMILIES[e.fam].name;
  const params = J.params || [];
  const ctl = p => {
    if (p.type === 'text') return `<input type="text" data-k="${p.key}" value="${esc(p.default)}" aria-label="${esc(p.label)}">`;
    if (p.options) return `<select data-k="${p.key}" aria-label="${esc(p.label)}">${p.options.map(o => `<option${String(o) === String(p.default) ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    if (p.min != null && p.max != null) return `<input type="range" data-k="${p.key}" min="${p.min}" max="${p.max}" step="${p.step || (p.type === 'int' ? 1 : 'any')}" value="${p.default}" aria-label="${esc(p.label)}"><output>${p.default}</output>`;
    return `<input type="number" data-k="${p.key}" value="${p.default}" aria-label="${esc(p.label)}">`;
  };
  const range = p => p.options ? p.options.join(' / ') : p.type === 'text' ? 'any text' : (p.min != null ? `${p.min}–${p.max}${p.step ? ' (step ' + p.step + ')' : ''}` : p.type);
  const paramsTable = `<div class="tbl-wrap"><table><thead><tr><th>Parameter</th><th>Range</th><th>Default</th><th>Your value</th></tr></thead><tbody>` +
    params.map(p => `<tr><td><code>${p.key}</code><br><span class="muted">${esc(p.label)}</span></td><td>${esc(range(p))}</td><td><code>${esc(p.default)}</code></td><td class="ctl">${ctl(p)}</td></tr>`).join('') + '</tbody></table></div>';
  const variants = (J.variants || []).map(v => `<button class="chip" type="button" data-variant='${esc(JSON.stringify(v.params || {}))}'>${esc(v.name)}</button>`).join('');
  const st = e.status, lc = lastCritic(e);
  const coldRows = st.cold.map(([what, res, m]) => `<tr><td>${esc(what)}</td><td class="res">${esc(res)}</td><td class="muted">${esc(MODEL[m] || m)}</td></tr>`).join('');
  const statusPanel = `<div class="panel status${hasIssue(e) ? ' issue' : ''}" id="status">
<h2>Status</h2>
<p style="margin:0 0 10px"><span class="status-dot${hasIssue(e) ? ' issue' : ''}"></span><b>${st.headline ? esc(st.headline) : !e.critic.length && !st.cold.length ? 'In review: the critic and cold tests are still running.' : !st.cold.length && lc && lc.pass ? 'Passed review; cold tests pending.' : st.fail ? 'Usable, with a known issue: the demo did not pass its final review.' : hasIssue(e) ? 'Passed, with known issues.' : 'Passed review and cold tests.'}</b></p>
<dl class="kv">
<dt>Critic</dt><dd>${esc(criticLine(e))}</dd>
<dt>Cold tests</dt><dd>${coldRows ? `<div class="tbl-wrap"><table class="cold"><thead><tr><th>Test</th><th>Result</th><th>Model</th></tr></thead><tbody>${coldRows}</tbody></table></div>${st.coldNote ? `<p class="faint" style="font-size:13px;margin:8px 0 0">${esc(st.coldNote)}</p>` : ''}` : esc(st.coldNote || 'No record.')}<p class="faint" style="font-size:13px;margin:8px 0 0">A cold test gives a fresh Codex agent (no browser, no access to this repo) only the game, the module and the prompt; an independent judge then plays the result. "Integrated" = the element works, the game is not broken and its autoplay still finishes.</p></dd>
${PERF3D[e.id] ? `<dt>Frame time</dt><dd>${esc(PERF3D[e.id])}</dd>` : ''}
${st.issues.length ? `<dt>Known issues</dt><dd><ul class="list">${st.issues.map(i => `<li>${esc(i)}</li>`).join('')}</ul></dd>` : ''}
</dl></div>`;
  const good = e.goodWith.map(g => { const o = BY[g.id]; return `<div class="compat-item" ${famStyle(o)}>${codeTag(o)}<a class="grow" href="${site}dna/${o.id}/">${esc(o.name)}</a><button class="btn primary sm" type="button" data-add="${o.id}">${ICON.plus}<span class="lab">Add</span></button><span class="why">${esc(g.why)}</span></div>`; }).join('');
  const bad = e.conflicts.map(g => { const o = BY[g.id]; return `<div class="compat-item" ${famStyle(o)}>${codeTag(o)}<a class="grow" href="${site}dna/${o.id}/">${esc(o.name)}</a><span class="why broken">${esc(g.why)}</span></div>`; }).join('');
  const accept = mdSection(e.md, 7, 'Acceptance moments');
  const mdBody = e.md.replace(/^# [^\n]*\n/, '');
  const readme = e.readmeExists ? read(path.join(e.dir, e.mod.readme)) : '';
  const modFile = e.mod.file;
  const sysBlock = e.kind === 'system' ? `<div class="callout"><h3 style="margin-top:0">Start from the starter</h3><p class="muted" style="margin:0 0 12px">This is a <b>system</b> element: it owns the turn or selection loop. The quickest path is a complete, commented single-file game already built on it; add add-on elements to it from the basket ("Start from the starter" option). It can also go into your own game with the prompt (cold-tested: see Status).</p><div class="btn-row"><a class="btn" href="${elRoot}${e.starterRel}" target="_blank" rel="noopener">${ICON.play}Play the starter game</a>${e.starterReadmeExists ? `<a class="btn ghost" href="${elRoot}${e.starterReadme}" target="_blank" rel="noopener">Starter README</a>` : ''}</div></div>` : '';
  const scopeNote = J.scopeNote ? `<p class="faint" style="font-size:13px">${esc(J.scopeNote)}</p>` : '';
  const elData = { [e.id]: BASKET_DATA.elements[e.id] };
  for (const r of e.requires) elData[r] = BASKET_DATA.elements[r];   // the prompt pulls required elements in, as combine.mjs does
  const reqChips = e.requires.map(r => `<a class="chip req" href="${site}dna/${r}/" title="The basket adds it automatically">Requires ${BY[r].code} ${esc(BY[r].name)}</a>`).join('');
  const moments = (MOMENTS[e.id] || []).map((m, k) => {
    const href = m.query ? `${elRoot}${m.page || 'demo'}/index.html?${m.query}` : null, L = 'ABCD'[k];   // N-01 / N-03 moments come from the starter game
    const when = m.t != null ? `t = ${m.t} ms${m.params.length ? ' · ' + m.params.join(' · ') : ''}` : 'review screenshot · time not recorded';
    const img = `<img src="${site}assets/moments/${m.img}" width="${m.w}" height="${m.h}" alt="Moment ${L}: ${esc(m.state)}" loading="lazy"${e.hd || e.pack ? '' : ' class="px"'}>`;
    return `<figure class="moment">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener" data-moment="${esc(href)}" title="Open the ${m.page === 'starter' ? 'starter game' : 'demo'} at this moment (?${esc(m.query)})">${img}<span class="go">${ICON.play}Open at ${m.t} ms</span></a>` : `<div class="noshot">${img}</div>`}<figcaption><b>${L}</b><span class="when">${esc(when)}</span><span class="state">${esc(m.state)}</span></figcaption></figure>`;
  }).join('');
  const momentsPanel = moments ? `<section class="panel" id="moments" ${famStyle(e)}><h2>Moments A–${'ABCD'[(MOMENTS[e.id] || []).length - 1]}</h2><p class="muted" style="margin-top:0">Frozen frames from the acceptance moments in the spec. Click one to load the demo at that instant (<code>?t=&lt;ms&gt;&amp;freeze=1</code>, plus the options shown).</p><div class="moments">${moments}</div></section>` : '';
  // lede: one plain sentence (the one-liner's first sentence when short, else the pitch); the full one-liner is in "What it fits"
  const first = (J.oneLiner.match(/^.*?[.!?](?=\s|$)/) || [J.oneLiner])[0].trim();
  const clause = firstClause(J.oneLiner), cap1 = t => t.charAt(0).toUpperCase() + t.slice(1);
  const LEDE = { 'horde-survival': 'The hero only walks; weapons fire by themselves at swarms that grow every minute, up to a boss.', 'webgl-post': 'Runs your finished 2D frame through a few WebGL passes (grade, glow, impact pulses); without WebGL the game looks exactly as before.' };
  const lede = LEDE[e.id] || (first.length <= 160 ? first : clause.length >= 40 && clause.length <= 160 ? cap1(clause) + '.' : PITCH[e.id] ? cap1(PITCH[e.id]) + '.' : first);
  const P = e.pack, AP = P ? P.ap : null;
  const kb = n => (n / 1024).toFixed(0) + ' KB';
  const genNote = P ? `<div class="callout gen" id="generated"><h3 style="margin-top:0">${genBadge(e, true)}</h3><p style="margin:0 0 8px">This element's art is <b>bitmap art generated once, at build time</b>. Making <b>your own</b> set (the regenerate prompt, <a href="${elRoot}${P.regen}">prompt.md</a>) needs an agent that can generate images: we used Codex with its built-in image generator (${esc(AP.model || 'a fixed model')}, effort ${esc(AP.effort || 'high')}). <b>Without an image generator, only the pack layer works:</b> wire in the shipped sample pack as it is (${P.files.length} files, ${kb(P.bytes)}; <a href="${elRoot}${P.packPrompt}">${esc(P.packPrompt)}</a>). Your game never calls a generator.</p><div class="btn-row"><button class="btn primary sm" type="button" id="pack-zip" data-pack="${e.id}">${ICON.dl}Sample art pack (.zip)</button>${P.packPrompt ? `<button class="btn sm" type="button" data-copy-url="${elRoot}${P.packPrompt}" data-label="Pack prompt">${ICON.copy}Copy pack prompt</button>` : ''}<a class="btn sm ghost" href="${elRoot}${P.manifest}" target="_blank" rel="noopener">assets.json</a></div></div>` : '';
  const yourGame = `<div class="your-game"><p class="yg-line" id="yg-line">Add <b>${esc(lowerFirst(e.name))}</b> to <input class="yg" id="yg" type="text" placeholder="Your game" aria-label="Your game's name (optional)" size="10">: ${esc(PITCH[e.id] || lowerFirst(firstClause(J.oneLiner)))}.</p><button class="btn accent sm" type="button" id="copy-yg" data-sentence="${esc(`Add ${lowerFirst(e.name)} to {game}: ${PITCH[e.id] || lowerFirst(firstClause(J.oneLiner))}.`)}">${ICON.copy}Copy sentence + prompt</button></div>`;
  const body = `<div class="wrap">
<div class="el-top">
<div class="el-head" ${famStyle(e)}>
<div class="crumbs"><a href="${site}dna/">Elements</a> / ${esc(famName)}</div>
<div class="codes">${codeTag(e)}${newBadge(e)}${genBadge(e, true)}<span class="chip"><i></i>${e.fam} · ${esc(famName)}</span><span class="chip">${e.kind}</span><span class="chip">${esc(TIME[I.time] || I.time)}</span><span class="chip">${esc(COORD_LABEL[e.id] || COORDS[I.coords] || I.coords)}</span>${reqChips}</div>
<h1>${esc(e.name)}</h1>
</div>
<div class="el-info" ${famStyle(e)}>
<p class="lede" style="margin:0">${esc(lede)}</p>
${yourGame}
${LISTEN[e.id] ? `<div class="btn-row"><a class="btn primary" href="${elRoot}${LISTEN[e.id].href}" target="_blank" rel="noopener">${ICON.play}Listen: open the sound board</a></div>` : ''}
<div class="btn-row"><button class="btn primary" type="button" data-add="${e.id}" data-params data-off="Add to basket" data-on="Update in basket">${ICON.plus}<span class="lab">Add to basket</span></button><button class="btn accent" type="button" id="copy-prompt">${ICON.copy}Copy prompt</button><button class="btn" type="button" data-copy-url="${elRoot}element.md" data-label="Spec (element.md)">${ICON.copy}Copy spec</button><a class="btn ghost" href="${elRoot}${modFile}" download>${ICON.dl}Module .js</a></div>
<nav class="anchor-nav" aria-label="On this page">${LISTEN[e.id] ? '<a href="#listen">Listen</a>' : ''}<a href="#demo">Demo</a>${moments ? '<a href="#moments">Moments</a>' : ''}${P ? '<a href="#generated">✦ Art</a>' : ''}<a href="#fit">Fits</a><a href="#prompt">Prompt &amp; spec</a><a href="#params">Parameters</a><a href="#compat">Compatibility</a><a href="#assets">Assets &amp; skill</a><a href="#status">Status</a><a href="#accept">Acceptance</a></nav>
</div>
<section id="demo" aria-label="Interactive demo">
<p class="demo-long faint" id="demo-long" hidden>This demo is long (<b></b>): scroll inside the frame, <button class="linkish" type="button" id="demo-full">show it at full height</button> or <a href="#demo-open" data-open-demo>open it in a new tab</a>.</p>
<div class="bezel demo-box"><button class="start" type="button" data-src="${elRoot}demo/index.html${DEMO_START[e.id] ? '?' + DEMO_START[e.id] : ''}"><div class="frame${e.hd ? ' hd' : ''}" style="width:min(${e.hd ? e.w * 1.5 : e.w * 2}px, 86%);aspect-ratio:${e.w} / ${e.h};background-image:url('${site}assets/frames/${e.id}-poster.webp');background-size:100% 100%;opacity:.55"></div><span class="play">${ICON.play} Load the interactive demo</span><span class="faint" style="font-size:13px">Only this element, with live parameter controls. Loads on click.</span></button></div>
<div class="btn-row" style="margin-top:10px"><button class="btn sm" type="button" id="demo-apply">Reload demo with your parameter values</button><a class="btn sm ghost" id="demo-open" href="${elRoot}demo/index.html${DEMO_START[e.id] ? '?' + DEMO_START[e.id] : ''}" target="_blank" rel="noopener">Open demo in a new tab</a></div>
</section>
</div>
<div class="stack">
${LISTEN[e.id] ? `<div class="callout" id="listen"><h3 style="margin-top:0">Listen</h3><p class="muted" style="margin:0 0 12px">${esc(LISTEN[e.id].blurb)}</p><div class="btn-row"><a class="btn primary" href="${elRoot}${LISTEN[e.id].href}" target="_blank" rel="noopener">${ICON.play}Open the sound board</a></div></div>` : ''}
${sysBlock}
${genNote}
${momentsPanel}
<div class="two">
<div class="panel" id="fit"><h2>What it fits</h2><p style="margin-top:0">${esc(J.oneLiner)}</p><h3>Good for</h3><ul class="list">${J.fits.map(f => `<li>${esc(f)}</li>`).join('')}</ul><h3 style="margin-top:14px">Not for</h3><ul class="list muted">${(J.notFor || []).map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>
<div class="panel" id="prompt"><h2>Prompt &amp; spec</h2>
<p class="muted" style="margin-top:0">The prompt is written for a game the agent has never seen; it names roles, never your functions. Give your agent the prompt, <code>${esc(path.basename(modFile))}</code> and its README${e.requires.length ? ` (plus ${e.requires.map(r => '<code>' + esc(path.basename(BY[r].mod.file)) + '</code>').join(', ')}, which it requires; the prompt covers both)` : ''}${P ? ', and the art (sample pack or your own set)' : ''}. It updates with your parameter values below.</p>
<pre class="prompt-pre" id="prompt-pre" tabindex="0">${esc(defaultPrompt[e.id])}</pre>
<div class="btn-row" style="margin-top:12px"><button class="btn primary sm" type="button" id="copy-prompt-2">${ICON.copy}Copy prompt</button><button class="btn sm" type="button" data-copy-url="${elRoot}element.md" data-label="Spec">${ICON.copy}Copy spec (element.md)</button><a class="btn sm ghost" href="${elRoot}${modFile}" download>${ICON.dl}${esc(path.basename(modFile))}</a>${e.readmeExists ? `<a class="btn sm ghost" href="${elRoot}${e.mod.readme}" download="${e.id}.README.md">${ICON.dl}README</a>` : ''}</div>
<p class="faint" style="font-size:12.5px;margin:10px 0 0">Same text as <code>node tools/combine.mjs ${e.id}</code> writes to COMBO.md. The original test-host prompt is <a href="${elRoot}prompt.md">prompt.md</a>.</p>
</div>
</div>
<section class="panel" id="params"><h2>Parameters &amp; variants</h2>
${variants ? `<div class="btn-row" style="margin-bottom:14px"><span class="faint" style="font:600 11px var(--mono);text-transform:uppercase;letter-spacing:.05em">Variants</span>${variants}<button class="chip" type="button" data-variant="{}" data-reset-params>Reset</button></div>` : ''}
${paramsTable}
<p class="faint" style="font-size:13px;margin:10px 0 0">Changed values go into the prompt, the demo (reload button above) and the basket (<b>Add to basket</b> keeps them).</p>
</section>
<section class="panel" id="compat"><h2>Compatibility</h2>
<dl class="kv"><dt>Kind</dt><dd>${e.kind === 'system' ? 'System: owns the turn/selection loop. One per basket.' : 'Add-on: hooks into any game.'}</dd>
<dt>Time model</dt><dd>${esc(TIME[I.time] || I.time)}</dd><dt>Coordinates</dt><dd>${esc(COORD_LABEL[e.id] || COORDS[I.coords] || I.coords)}</dd><dt>Draw layer</dt><dd>${esc(LAYER[I.layer] || I.layer)}</dd>
${e.requires.length ? `<dt>Requires</dt><dd>${e.requires.map(r => `${codeTag(BY[r])} <a href="${site}dna/${r}/">${esc(BY[r].name)}</a>`).join(', ')}: the basket adds it automatically (before this element) and its module ships in the zip.</dd>` : ''}${e.requiredBy.length ? `<dt>Required by</dt><dd>${e.requiredBy.map(r => `${codeTag(BY[r])} <a href="${site}dna/${r}/">${esc(BY[r].name)}</a>`).join(', ')}</dd>` : ''}
<dt>Needs</dt><dd><ul class="list">${(I.needs || []).map(n => `<li>${esc(n)}</li>`).join('')}</ul></dd><dt>Provides</dt><dd><ul class="list">${(I.provides || []).map(n => `<li>${esc(n)}</li>`).join('')}</ul></dd></dl>
${scopeNote}
<div class="two" style="margin-top:18px"><div><h3>Goes well with</h3><div class="compat-list">${good || '<p class="muted">Nothing specific.</p>'}</div></div>
<div><h3>Conflicts with</h3><div class="compat-list">${bad || '<p class="muted">No conflicts with any other element.</p>'}</div></div></div>
<p class="faint" style="font-size:13px;margin:14px 0 0">Computed from each element.json's interface tags with the same rules as the basket (<code>tools/combine.mjs</code>): same system family, a turn-based element with a running clock, or two different views on one screen conflict; effects and overlays follow any clock and view.</p>
</section>
<div class="stack">
<div class="panel" id="assets"><h2>Assets &amp; skill</h2>
${Array.isArray(J.assets) ? `<ul class="list files">${J.assets.map(a => { const m = String(a).match(/^([\w./-]+\.\w+):\s*(.*)$/s); return `<li>${m ? `<code>${esc(m[1])}</code>: ${esc(m[2])}` : esc(a)}</li>`; }).join('')}</ul>` : `<p style="margin-top:0">${esc(J.assets)}</p>`}
<ul class="list"><li><b>Module:</b> ${e.json.module && e.json.module.version ? 'v' + esc(e.json.module.version) + ', ' : ''}<code>${esc(e.mod.file || '')}</code>, sha256 <code>${e.sha.slice(0, 16)}…</code></li><li><b>Art:</b> ${P ? `generated bitmaps, ${P.files.length} files in the sample pack (${kb(P.bytes)}, ${esc(AP.tool || 'Codex image_gen')}, ${esc(AP.date || '')})${P.calls ? `, made in ${P.calls} image_gen calls${GEN_PROV[e.id] ? ': ' + esc(GEN_PROV[e.id]) : ''}` : ''}; every prompt sent and each image's sha256 are in <a href="${elRoot}${P.manifest}">assets.json</a>. Your own set: ✦ needs image generation (see above).` : GEN_OTHER[e.id] ? 'none to supply for the module; ' + GEN_OTHER[e.id] : 'none to supply; the module draws procedural, original art at native resolution.' + (e.kitDemo ? ` The demo's painted cast and backdrops come from a shared demo-only set (${KIT_CALLS || 9} image_gen calls, Codex image generation).` : '')}</li>
<li><b>Style:</b> ${VERIFIED_STYLES.includes(e.id) ? `draws through the skin API and is shown in all ${S.length} styles on the <a href="${site}styles/compare/">compare page</a>.` : e.skin ? `draws through the skin API (palette, fonts, frames from the chosen style); the full ${S.length}-style comparison covers three other elements.` : I.layer === 'post' ? 'works on top of any style: it processes the finished frame (lights, glow, grade or camera), whatever drew it.' : e.pack ? 'generated bitmaps in one locked painted HD style (the sample pack); your own set can follow your game\'s look.' : e.hd ? 'draws its own smooth HD look; it goes into pixel and HD games alike (see the demo\'s options).' : 'built-in 16-bit drawing.'}</li>
<li><b>Skill:</b> ${P ? 'pack layer: none. Your own art: an agent with an image generator (Codex image_gen).' : 'none required.'} Any coding agent that can edit your game can wire the module in with the prompt; cold tests used an agent with no browser. Prompt-only (no module) was weaker: 7/9 against 9/9 with the module on the first three elements.</li>
<li><b>Verify:</b> the prompt ends with acceptance checks; with a browser, screenshot the moments below (<code>?t=&lt;ms&gt;&amp;freeze=1</code> pattern, see <a href="${site}use/">Use</a>).</li></ul>
</div>
${statusPanel}
</div>
<section class="panel" id="accept"><h2>Acceptance moments</h2><div class="md">${md2html(accept, elRoot, { shift: 1 })}</div></section>
<details class="fold"><summary>Full spec (element.md)</summary><div class="inner md">${md2html(mdBody, elRoot, { shift: 0, idp: 'spec-' })}</div></details>
${readme ? `<details class="fold"><summary>Module API (README)</summary><div class="inner md">${md2html(readme, elRoot + path.posix.dirname(e.mod.readme) + '/', { idp: 'api-' })}</div></details>` : ''}
</div>
</div>
<script>window.DNA_EL = ${JSON.stringify({ id: e.id, code: e.code, params: params.map(p => ({ key: p.key, default: p.default, type: p.type })), data: elData }).replace(/</g, '\\u003c')};</script>`;
  write(`dna/${e.id}/index.html`, page({ rel: `dna/${e.id}/`, title: `${e.code} ${e.name} · Game DNA`, desc: J.oneLiner, body, active: 'dna/', scripts: ['combine-core.js', ...(e.pack ? ['zip.js'] : []), 'element.js'] }));
  write(`dna/${e.id}/prompt.md`, defaultPrompt[e.id]);
  write(`dna/${e.id}/index.md`, `# ${e.code} ${e.name}\n\n${J.oneLiner}\n\n${e.release ? `- New in ${e.release} (${RELEASE_DATE[e.release]})\n` : ''}${e.requires.length ? `- Requires: ${e.requires.map(r => BY[r].code + ' ' + BY[r].name).join(', ')} (added to a basket automatically)\n` : ''}${P ? `- ✦ Generated art: your own set needs image generation (Codex image_gen); without it only the sample pack works (${P.files.length} files, manifest ../../../elements/${e.id}/${P.manifest}, pack prompt ../../../elements/${e.id}/${P.packPrompt})\n` : ''}- Family: ${famName}\n- Kind: ${e.kind}\n- Time model: ${I.time}; coordinates: ${I.coords}; layer: ${I.layer}\n- Fits: ${J.fits.join('; ')}\n- Not for: ${(J.notFor || []).join('; ')}\n\n` +
    `## Files\n\n- Prompt (unknown game, defaults): [prompt.md](prompt.md)\n- Spec: ../../../elements/${e.id}/element.md\n- Module: ../../../elements/${e.id}/${modFile} (${e.json.module && e.json.module.version ? 'v' + e.json.module.version + ', ' : ''}global \`${e.mod.global}\`, sha256 ${e.sha})\n- Demo: ../../../elements/${e.id}/demo/index.html${e.kind === 'system' ? `\n- Starter game: ../../../elements/${e.id}/${e.starterRel}` : ''}\n\n` +
    `${(MOMENTS[e.id] || []).length ? `## Moments\n\n${MOMENTS[e.id].map((m, k) => `- ${'ABCD'[k]}: ${m.query ? `${m.page || 'demo'}/index.html?${m.query}` : 'review screenshot (' + (m.file || '') + ', time not recorded)'}: ${m.state}`).join('\n')}\n\n` : ''}## Parameters\n\n| key | range | default |\n|---|---|---|\n${params.map(p => `| ${p.key} | ${range(p)} | ${p.default} |`).join('\n')}\n\n` +
    `## Compatibility\n\n- Goes well with: ${e.goodWith.map(g => BY[g.id].code + ' ' + BY[g.id].name).join(', ') || 'none listed'}\n- Conflicts with: ${e.conflicts.map(g => BY[g.id].code + ' ' + BY[g.id].name + ' (' + g.why + ')').join(', ') || 'none'}\n\n` +
    `## Status\n\n- Critic: ${criticLine(e)}\n${st.cold.map(([w, r, m]) => `- Cold test, ${w}: ${r} (${MODEL[m] || m})`).join('\n')}${st.coldNote ? '\n- ' + st.coldNote : ''}${PERF3D[e.id] ? '\n- Frame time: ' + PERF3D[e.id] : ''}\n${st.issues.map(i => '- Known issue: ' + i).join('\n')}\n`);
}

// ----- /basket/
{
  const site = '../';
  const body = `<section class="block"><div class="wrap">
<p class="eyebrow">DNA basket</p>
<h1>Combine elements into one prompt</h1>
<p class="lede">Add elements, pick a style and resolution, and generate one English prompt (COMBO.md) for your agent, with the module files in a zip. The compatibility check and the text are the same as <code>node tools/combine.mjs</code>.</p>
<div class="bk-grid" style="margin-top:28px">
<div class="stack bk-left">
<div class="panel bk-el"><h2>Your elements</h2><div id="bk-helix"></div><ul class="bitems" id="bk-items"></ul>
<div class="btn-row" style="margin-top:12px"><a class="btn sm" href="${site}dna/">Add more elements</a><button class="btn sm ghost" type="button" id="bk-share">Copy share link</button><button class="btn sm ghost" type="button" id="bk-clear">Clear</button></div></div>
<div class="panel opts bk-opt"><h2>Options</h2>
<label class="row"><span>Native res.</span><select class="inp" id="bk-res"><option value="">Keep my game's resolution</option><option>256x224</option><option>240x160</option></select></label>
<div class="row starter-row" id="bk-starter-row"><span class="opt-k">Starter</span><label class="check"><input type="checkbox" id="bk-starter"> <span id="bk-starter-label">Start from the starter game</span></label></div>
<div><div class="faint" style="font:600 11px var(--mono);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Art style</div><div class="style-strip" id="bk-styles">
<button class="style-pick keep" type="button" data-style="" aria-pressed="true"><span class="keep-art" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 15l5-4 4 3 3-2 6 5"/><circle cx="16" cy="9" r="1.6"/></svg></span><span>Keep my game's look</span></button>
${S.map(s => `<button class="style-pick" type="button" data-style="${s.slug}" aria-pressed="false"><img src="${site}../${s.shot}" alt="" loading="lazy"${s.pixel ? ' class="px"' : ''}><span>${esc(s.name)}</span></button>`).join('')}
</div></div>
</div>
<div class="panel bk-chk"><h2>Compatibility check</h2><div class="check-sum" id="bk-sum"></div><ul class="report" id="bk-report" style="margin-top:12px"></ul><label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:13px" class="muted"><input type="checkbox" id="bk-ok"> Show passing (OK) lines</label></div>
</div>
<div class="stack bk-out">
<div class="panel"><h2>Combined prompt</h2>
<div class="btn-row"><button class="btn primary" type="button" id="bk-gen">Generate combined prompt</button><button class="btn accent" type="button" id="bk-copy" disabled>${ICON.copy}Copy prompt</button><button class="btn" type="button" id="bk-zip" disabled>${ICON.dl}Download zip</button></div>
<div class="errbox" id="bk-errors" hidden></div>
<div class="callout gen" id="bk-art" hidden><p style="margin:0 0 8px"><span class="badge-gen">✦ Generated art</span> <span id="bk-art-names"></span> draw bitmap art. The prompt and module files are the same as <code>combine.mjs</code> writes; the <b>images are separate</b>. Tick the box to put each element's sample pack in the zip under <code>art/&lt;id&gt;/</code> (its <code>assets.json</code>, the image files at the paths it lists, and <code>prompt-pack.md</code>), plus <code>art/README.md</code>, which tells your agent to load each pack with <code>base: 'art/&lt;id&gt;/'</code>. Making your own set instead needs an image generator (Codex image_gen) and each element's regenerate prompt.</p><label class="check"><input type="checkbox" id="bk-art-zip" checked> <span>Include the sample art packs in the zip (<span id="bk-art-size"></span>)</span></label></div>
<p class="cli" id="bk-cli" style="margin:14px 0 0"></p>
<div id="bk-style-out" hidden style="margin-top:14px"><h3>Style prompt (paste first)</h3><pre class="prompt-pre" id="bk-style-pre" style="max-height:180px"></pre></div>
<div id="bk-out" hidden style="margin-top:14px"><h3>COMBO.md <span class="faint" id="bk-words" style="font:12px var(--mono)"></span></h3><pre class="prompt-pre" id="bk-pre" style="max-height:620px"></pre></div>
<p class="faint" style="font-size:13px;margin:12px 0 0">The zip holds COMBO.md, every module file byte for byte (including elements another one requires, which the basket adds for you), each module's README, the starter game when you start from it, the style's skin files when you pick a style, and, if ticked, the sample art packs of generated-art elements under <code>art/</code>. Copy prompt copies the style prompt (if any) followed by COMBO.md.</p>
</div>
</div>
</div>
</div></section>`;
  write('basket/index.html', page({ rel: 'basket/', title: 'DNA basket · Game DNA', desc: 'Combine Game DNA elements into one prompt and a zip of modules.', body, active: 'basket/', scripts: ['combine-core.js', 'basket-data.js', 'zip.js', 'basket.js'] }));
  write('basket/index.md', `# DNA basket\n\nCombine elements into one English prompt (COMBO.md) and a zip of module files. Basket state lives in the URL hash: \`#e=<id>,<id>&p=<id>.<key>=<value>;...&style=<slug>&res=<WxH>&starter=1\`. Same output as \`node tools/combine.mjs <id> <id> [--param id.key=value] [--starter]\`; an element's \`requires\` (e.g. J-01 needs I-08) are added automatically. Generated-art (L) elements: the zip can add each sample pack under \`art/<id>/\` (assets.json, images, prompt-pack.md); combine.mjs itself ships only the modules.\n\nElement ids: ${E.map(e => e.id).join(', ')}.\n`);
}

// ----- /styles/
{
  const site = '../';
  const body = `<section class="block"><div class="wrap">
<p class="eyebrow">Art styles</p>
<h1>${Numw(S.length)} styles, one set of elements</h1>
<p class="lede">A style is a skin (palette, fonts, window frames, effect colours) plus an English prompt fragment. Pick one in the basket and it goes in front of the combined prompt. <a href="compare/">Compare all ${numw(S.length)} on one scene</a>.</p>
<div class="grid" style="margin-top:28px">${S.map(s => `<article class="style-card">
<a class="shot xfade" href="${s.slug}/"><img src="${site}../${s.shotA}"${srcset(s, site + '../', 'a')} alt="${esc(s.name)}: the shared tactics scene, range and path" loading="lazy"${s.pixel ? ' class="px"' : ''}><img class="b${s.pixel ? ' px' : ''}" data-src="${site}../${s.shot}"${srcset(s, site + '../', 'b', true)} alt=""></a>
<div class="body">${styleBadges(s) ? `<div class="head">${styleBadges(s)}</div>` : ''}<h3><a href="${s.slug}/">${esc(s.name)}</a></h3><p class="muted" style="margin:0;font-size:14px">${esc(s.essence.slice(0, 180))}${s.essence.length > 180 ? '…' : ''}</p>
<div class="btn-row"><button class="btn primary sm" type="button" data-use-style="${s.slug}" data-name="${esc(s.name)}">Use this style</button><button class="btn sm" type="button" data-copy-url="${site}styles/${s.slug}/prompt.md" data-label="Style prompt">${ICON.copy}Copy prompt</button></div></div>
</article>`).join('')}</div>
</div></section>`;
  write('styles/index.html', page({ rel: 'styles/', title: 'Styles · Game DNA', desc: `${Numw(S.length)} original art styles for Game DNA elements.`, body, active: 'styles/' }));
  write('styles/index.md', `# Game DNA styles\n\n${S.map(s => `- [${s.name}](${s.slug}/index.md) (\`${s.slug}\`, critic ${s.score}): ${s.essence}`).join('\n')}\n\nCompare page: compare/index.md\n`);
  for (const s of S) {
    const sroot = '../../../', skinBase = s.slug === 'pixel16' ? sroot + 'skins/' : `${sroot}skins/${s.slug}/`;
    const b = `<div class="wrap">
<div class="el-head"><div class="crumbs"><a href="../">Styles</a> / ${esc(s.name)}</div>${styleBadges(s, true) ? `<div class="codes">${styleBadges(s, true)}</div>` : ''}<h1>${esc(s.name)}</h1><p class="lede" style="margin:0">${esc(s.essence)}</p>${STYLE_GEN[s.slug] ? `<p class="faint" style="font-size:13px;margin:8px 0 0">Units, props, the HUD portrait, the ground and window frames come from a small pack generated once with an image generator (Codex image_gen) and locked to one style sheet; it ships with the skin. Without the pack the skin paints everything in code with the same brush (preview <code>?art=0</code>).</p>` : ''}
<div class="btn-row"><button class="btn primary" type="button" data-use-style="${s.slug}" data-name="${esc(s.name)}">Use this style in my basket</button><button class="btn accent" type="button" data-copy-url="prompt.md" data-label="Style prompt">${ICON.copy}Copy prompt fragment</button><a class="btn ghost" href="${sroot}${s.file}" download>${ICON.dl}Skin .js</a></div></div>
<div class="stack">
<div class="bezel style-hero"><div class="xfade auto"><img src="../../../${s.shotA}"${srcset(s, '../../../', 'a')} alt="${esc(s.name)}: range and path on the shared scene"${s.pixel ? ' class="px"' : ''}><img class="b${s.pixel ? ' px' : ''}" src="../../../${s.shot}"${srcset(s, '../../../', 'b')} alt=""${esc(s.name)}: damage numbers and the command window"></div></div>
${s.slug === 'handheld4' ? `<div class="panel"><h2>Variants</h2><p class="muted" style="margin-top:0">Same skin, other four-shade ramps: <code>handheld4-sepia</code> and <code>handheld4-grey</code>.</p><div class="two">${['sepia', 'grey'].map(v => `<figure style="margin:0"><img class="px" src="../../../site/assets/styles/handheld4-${v}-b.webp" alt="4-shade handheld pixel, ${v} ramp" style="width:100%;border-radius:8px;display:block"><figcaption class="faint" style="font:12px var(--mono);margin-top:6px">handheld4-${v}</figcaption></figure>`).join('')}</div></div>` : ''}
<div class="btn-row"><button class="btn sm" type="button" data-live=""${sroot}${s.preview}${s.preview.includes('?') ? '&' : '?'}">${ICON.play}Load the live preview</button></div>
<div class="bezel demo-box" id="live-box" hidden style="height:min(80vh,820px)"></div>
<div class="panel"><h2>Prompt fragment</h2><pre class="prompt-pre">${esc(s.prompt)}</pre></div>
<details class="fold"><summary>Full style spec (STYLE.md)</summary><div class="inner md">${md2html(s.style, skinBase)}</div></details>
<p class="faint" style="font-size:13px">Critic score ${s.score ?? 'n/a'} (bar 7.5, no major issue). Style text follows the 11-part STYLE.md structure of lemo-opuscar (CC BY 4.0); see <a href="../../about/">About</a>.</p>
</div></div>`;
    write(`styles/${s.slug}/index.html`, page({ rel: `styles/${s.slug}/`, title: `${s.name} · Game DNA`, desc: s.essence, body: b, active: 'styles/', scripts: ['style.js'] }));
    write(`styles/${s.slug}/prompt.md`, s.prompt);
    write(`styles/${s.slug}/index.md`, s.style + '\n\n---\n\n' + s.prompt);
  }
  const cb = `<section class="block"><div class="wrap">
<div class="crumbs faint" style="font-size:13px;margin-bottom:10px"><a href="../">Styles</a> / Compare</div>
<h1>Same scene, ${numw(S.length)} styles</h1>
<p class="lede">One shared tactics moment (same seed, same instant) drawn through each skin: the grid range and path, damage numbers, and a window with a cursor. The page below has its own controls to focus one element, scrub time and enlarge one style.</p>

<div class="btn-row use-pick" style="margin-bottom:18px"><label class="faint" for="cmp-style" style="font:600 11px var(--mono);text-transform:uppercase;letter-spacing:.05em">Use a style</label><select class="inp" id="cmp-style">${S.map(s => `<option value="${s.slug}">${esc(s.name)}</option>`).join('')}</select><button class="btn primary sm" type="button" id="cmp-use" data-use-style="${S[0].slug}" data-name="${esc(S[0].name)}">Use in my basket</button></div>
<script>(function () { var s = document.getElementById('cmp-style'), b = document.getElementById('cmp-use'); s.addEventListener('change', function () { b.setAttribute('data-use-style', s.value); b.setAttribute('data-name', s.options[s.selectedIndex].text); }); })();</script>
<iframe class="compare-frame" id="compare" src="../../../skins/compare.html?t=1400" scrolling="no" title="${Numw(S.length)} styles compared on one scene"></iframe>
</div></section>`;
  write('styles/compare/index.html', page({ rel: 'styles/compare/', title: 'Compare styles · Game DNA', desc: `One scene drawn in all ${numw(S.length)} styles.`, body: cb, active: 'styles/', scripts: ['style.js'] }));
  write('styles/compare/index.md', `# Compare styles\n\nskins/compare.html draws one shared tactics scene (seed 7, t = 1400 ms) in all ${numw(S.length)} styles: ${S.map(s => s.name).join(', ')}. Focus parameters: ?focus=grid|numbers|window, ?only=<slug>.\n`);
}

// ----- /use/ and /about/
{
  const site = '../';
  const ub = `<section class="block"><div class="wrap" style="max-width:860px">
<p class="eyebrow">How to use it</p>
<h1>Use an element with your agent</h1>
<p class="lede">Every element is delivered the same way: a finished module file plus a prompt that tells your coding agent where to hook it into your game. Your agent does the wiring; it never rewrites the module.</p>
<div class="stack" style="margin-top:28px">
<div class="steps" aria-label="How it works in three steps">
<figure class="step"><div class="step-card" ${famStyle(BY['damage-numbers'])}><div class="step-thumb" ${stripAttrs(BY['damage-numbers'], site).replace(/data-fx="[^"]*" data-fy="[^"]*"/, 'data-k="1" data-fx="160" data-fy="58"')}><div class="frame"></div></div><div class="step-body">${codeTag(BY['damage-numbers'])} <b>${esc(BY['damage-numbers'].name)}</b><div class="btn-row" style="margin-top:8px"><span class="btn primary sm">${ICON.plus}Add</span><span class="btn sm hl">${ICON.copy}Copy prompt</span></div></div></div><figcaption><b>1.</b> Pick an element: copy its prompt, or add it to the basket.</figcaption></figure>
<figure class="step"><div class="step-helix">${helixStatic(["damage-numbers", "hit-sparks", "window-cursor"].map(id => BY[id].fam), 300, 90)}<ul>${["damage-numbers", "hit-sparks", "window-cursor"].map(id => `<li ${famStyle(BY[id])}>${codeTag(BY[id])} ${esc(BY[id].name)}</li>`).join('')}</ul></div><figcaption><b>2.</b> The basket checks they fit and writes one prompt.</figcaption></figure>
<figure class="step"><div class="step-zip"><div class="zip-name">${ICON.dl} game-dna-E-01-E-02-C-01.zip</div><ul>${['COMBO.md', 'STYLE-PROMPT.md', ...["damage-numbers", "hit-sparks", "window-cursor"].flatMap(id => [path.basename(BY[id].mod.file), id + '.README.md'])].map(f => `<li><code>${f}</code></li>`).join('')}</ul></div><figcaption><b>3.</b> Download the zip and hand it to your agent.</figcaption></figure>
</div>
<div class="panel"><h2>1. One element: copy the prompt</h2><ol class="list"><li>Open the element, set parameters if you like (the prompt follows them).</li><li>Click <b>Copy prompt</b> and download the <b>module .js</b> (and its README).</li><li>Give your agent the prompt and the files in your game's folder. The prompt names roles ("the place where HP changes"), never your function names, so it works in a game it has never seen.</li></ol></div>
<div class="panel"><h2>2. Several elements: the basket</h2><ol class="list"><li>Press <b>Add</b> on each element; the DNA basket (bottom right) shows them as a double helix, one base pair per element, in its family colour. A conflict shows as a broken pair.</li><li>Open the basket, pick a resolution and an art style, then <b>Generate combined prompt</b>. The check is the same as <code>tools/combine.mjs</code>: one system element at most; a turn-based element and a running-clock element, or two different views, conflict.</li><li><b>Download zip</b> gives COMBO.md, every module (byte for byte), their READMEs and, with a style, the skin files. Share the basket with <b>Copy share link</b> (the state is in the URL).</li></ol></div>
<div class="panel"><h2>3. System elements: start from the starter</h2><p style="margin-top:0">System elements (battle flows, map movement) own the game loop. Each ships a complete, commented single-file starter game with documented extension points. Tick <b>Start from the starter</b> in the basket and the prompt becomes "add these add-ons to this starter". Without the starter, the system element still goes into your own game (cold-tested 3/3 per system element with a fixed model, high).</p></div>
<div class="panel"><h2>Required elements and generated art</h2><ul class="list"><li>Some elements need another one: every light and post effect (J family) runs on the ${codeTag(BY['webgl-post'])} WebGL post-process pipeline. <b>Add</b> puts the required element in the basket too, and the prompt and zip always include it.</li><li>${genBadge(BY['painted-parallax'], true)} elements (L family) draw bitmap art. Each ships a sample art pack that works as it is (the basket zip can include it under <code>art/</code>). Making your own set in the same locked style needs an agent with an image generator (we used Codex image_gen); without one, only the sample pack works.</li></ul></div>
<div class="panel"><h2>4. Verify the result</h2><ul class="list"><li>Every prompt ends with acceptance checks and a browserless self-check (module sha256, no removed functions, traced autoplay).</li><li>Demos and starters take <code>?t=&lt;ms&gt;&amp;freeze=1</code> to render one deterministic moment; ask your agent to support the same in your game, then screenshot the acceptance moments listed on each element page.</li><li>With the game-from-reference skill installed, <code>playcheck.py GAME.html OUTDIR --t 0,3000,9000</code> takes those shots, checks square integer pixels, console errors and 500 / 390 px overflow in one run.</li></ul></div>
<p class="faint" style="font-size:13px">Building and serving this site: see <code>tools/README.md</code> in the repo.</p>
</div></div></section>`;
  write('use/index.html', page({ rel: 'use/', title: 'Use with your agent · Game DNA', desc: 'How to add Game DNA elements to your game with a coding agent.', body: ub, active: 'use/' }));
  write('use/index.md', `# Use Game DNA with your agent\n\n1. One element: copy its prompt, give your agent the prompt + module .js + README.\n2. Several: add them to the basket, generate the combined prompt (same as tools/combine.mjs), download the zip.\n3. System elements: start from the starter game, or put them into your own game with the generic prompt.\n4. Verify: acceptance checks at the end of every prompt; ?t=<ms>&freeze=1 screenshots; playcheck.py.\n`);
  const ab = `<section class="block"><div class="wrap" style="max-width:860px">
<p class="eyebrow">About</p>
<h1>About Game DNA</h1>
<div class="stack" style="margin-top:24px">
<div class="panel"><h2>What this is</h2><p style="margin-top:0">A private, local catalogue of playable game elements for people who build games with coding agents. Each element is a working demo, a module file, a spec and a copy-ready English prompt, with honest review and cold-test results on its page. Claims are about matching the spec and the acceptance checks, not about matching any particular commercial game.</p></div>
<div class="panel"><h2>Credits and licences</h2><ul class="list">
<li><b>Art:</b> all art in the demos, starters, skins and previews is original. Most of it is procedural (drawn in code). Bitmaps generated once at build time with Codex's built-in image generator are used in four places: the ✦ generated-art elements (L family) and their sample packs; the A-14 squad clash starter's units and backdrops (${A14_CALLS || 13} calls); the H-05 bark bubbles demo scene (8 calls); and a shared cast of characters, props and backdrops used only by the HD demos (${KIT_CALLS || 9} calls). The modules other than the L family draw no bitmaps. Each image's prompt, date, model and sha256 are recorded in an <code>assets.json</code> beside it, every prompt passed a name check and forbids resemblance to existing games, characters or brands, and a critic checked each set for that. Rights in generated images follow the generator's terms at the time (not yet checked; this site is private). No screenshots, sprites, logos or names from existing games.</li>
<li><b>Code:</b> the modules, demos, starters and this site are MIT-licensed.</li>
<li><b>Style text:</b> the STYLE.md files follow the 11-part style-description structure of <i>lemo-opuscar</i> (lemomo-ai/lemo-opuscar; code MIT, style descriptions CC BY 4.0). Adapted structure and wording are used under CC BY 4.0 with this attribution; the styles themselves, their palettes and skins are new.</li>
<li><b>Page ideas:</b> the one-sentence "Your game" template and the timed A–D moments on element pages borrow layout ideas from the lemo-opuscar v2 gallery; no text or prompts from it are used (its prompts are CC BY-NC).</li>
<li><b>Libraries:</b> one. The four 3D elements (N-01 to N-04) use <b>three.js 0.149.0</b> (MIT), vendored and pinned (<code>vendor/three@0.149.0/three.min.js</code>, sha256 8a5f7249…), never loaded from a CDN; every 3D demo, starter and basket ships its own copy as <code>three.min.js</code>. Pinned to 0.149.0, a release whose classic UMD build (<code>window.THREE</code>) loads with a plain <code>&lt;script src&gt;</code> like every other module and works from <code>file://</code> without import maps or a server, and without the deprecation warning that later UMD builds print (r150-r159; r160 dropped the UMD build). Nothing else uses it: the light and post-processing elements (I-08, J family) use plain WebGL with no library and fall back to the 2D canvas, and the low-poly style is drawn on a 2D canvas. Fonts: Inter and JetBrains Mono for the site, plus the styles' own Google Fonts (SIL Open Font License).</li>
</ul></div>
<div class="panel" id="changes"><h2>What's new</h2><ul class="list">${CHANGELOG.map(([r, d, t, lab]) => `<li><b>${lab || r}</b> <span class="faint">${d}</span>: ${esc(t)}</li>`).join('')}</ul></div>
<div class="panel"><h2>Not affiliated</h2><p style="margin:0">Game DNA is not affiliated with, endorsed by or connected to any game company. Element names are generic, descriptive English terms for common game mechanics.</p></div>
<div class="panel"><h2>Machine entrances</h2><ul class="list"><li><a href="${site}llms.txt">llms.txt</a>: what is here and where, for language models.</li><li><a href="${site}catalog.json">catalog.json</a>: every element with interfaces, parameters, status and file paths.</li><li>Every page has <b>Copy page as markdown</b> in the footer (an <code>index.md</code> next to each page).</li></ul></div>
</div></div></section>`;
  write('about/index.html', page({ rel: 'about/', title: 'About · Game DNA', desc: 'Credits, licences and machine entrances.', body: ab, active: 'about/' }));
  write('about/index.md', `# About Game DNA\n\nPrivate local catalogue of playable game elements. Original art: procedural, except the L-family sample packs, the A-14 starter art (${A14_CALLS || 13} calls), the H-05 demo scene (8 calls) and the shared HD demo cast (${KIT_CALLS || 9} calls), generated at build time with Codex image_gen (a fixed model, high; prompts and sha256 in each assets.json); code MIT. STYLE.md files follow the structure of lemo-opuscar (lemomo-ai/lemo-opuscar; MIT code, CC BY 4.0 style text), adapted under CC BY 4.0. three.js 0.149.0 (MIT, vendored, pinned; its classic UMD build loads with a plain script tag and, unlike r150-r159, prints no deprecation warning) only for the N-family 3D elements; plain WebGL for the light/post elements. Not affiliated with any game company.\n`);
}

// ----- machine entrances
write('catalog.json', JSON.stringify({
  name: 'Game DNA', version: 1, generated: 'tools/build-site.mjs', paths: 'relative to the repo root', changelog: CHANGELOG.map(([release, date, text, label]) => ({ release, date, text, ...(label ? { label } : {}) })),
  families: Object.fromEntries(Object.entries(FAMILIES).map(([k, v]) => [k, v.name])),
  elements: E.map(e => ({
    id: e.id, code: e.code, name: e.name, family: FAMILIES[e.fam].name, kind: e.kind, oneLiner: e.json.oneLiner, fits: e.json.fits, notFor: e.json.notFor,
    interfaces: e.json.interfaces, params: e.json.params, variants: e.json.variants,
    files: { spec: `elements/${e.id}/element.md`, module: `elements/${e.id}/${e.mod.file}`, moduleGlobal: e.mod.global, moduleSha256: e.sha, readme: e.readmeExists ? `elements/${e.id}/${e.mod.readme}` : null, demo: `elements/${e.id}/demo/index.html`, starter: e.starterExists ? `elements/${e.id}/${e.starterRel}` : null, prompt: `site/dna/${e.id}/prompt.md`, page: `site/dna/${e.id}/` },
    status: { critic: e.critic, coldTests: e.status.cold.map(([test, result, m]) => ({ test, result, model: MODEL[m] || m })), knownIssues: e.status.issues, note: e.status.coldNote || null },
    goesWellWith: e.goodWith.map(g => g.id), conflictsWith: e.conflicts.map(g => g.id),
    requires: e.requires, release: e.release || 'M7',
    assetPack: e.pack ? { needsImageGeneration: 'for your own set (regenerate prompt); the sample pack works without it', manifest: `elements/${e.id}/${e.pack.manifest}`, files: e.pack.files.length, bytes: e.pack.bytes, packPrompt: e.pack.packPrompt ? `elements/${e.id}/${e.pack.packPrompt}` : null, regeneratePrompt: `elements/${e.id}/prompt.md` } : null
  })),
  styles: S.map(s => ({ slug: s.slug, name: s.name, skin: s.file, prompt: `site/styles/${s.slug}/prompt.md`, critic: s.score })),
  combos: COMBOS.map(c => ({ name: c.name, ids: c.ids, starter: c.starter }))
}, null, 1));
write('llms.txt', `# Game DNA

> Private local catalogue of playable game elements for coding agents. Each element = interactive demo + module file (one global, no dependencies) + spec (element.md) + an English prompt for adding it to a game the agent has never seen. Original art only; no real game names.

Paths below are relative to site/. The repo root is one level up (../).

## Start here
- [catalog.json](catalog.json): every element with interfaces, parameters, files, sha256, status
- [Use with your agent](use/index.md)
- [Basket](basket/index.md): combine elements (same output as \`node tools/combine.mjs\`)

## Elements
${E.map(e => `- [${e.code} ${e.name}](dna/${e.id}/index.md): ${e.json.oneLiner} Prompt: dna/${e.id}/prompt.md`).join('\n')}

## Styles
${S.map(s => `- [${s.name}](styles/${s.slug}/index.md): prompt fragment styles/${s.slug}/prompt.md`).join('\n')}

## Optional
- [About, credits](about/index.md)
`);

console.log(`built site/: ${E.length} elements, ${S.length} styles, ${COMBOS.length} combos`);
for (const c of COMBOS) console.log(`  combo ${c.slug}: ${c.res.errors} errors, ${c.res.warnings} warnings`);

// ---------------------------------------------------------------- --verify: browser core vs tools/combine.mjs, byte for byte
if (process.argv.includes('--verify')) {
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'gamedna-verify-'));
  const cases = [
    { ids: ['damage-numbers', 'hit-sparks', 'window-cursor'], params: ['damage-numbers.scheme=warm', 'hit-sparks.size=1.5'] },
    { ids: ['grid-range-path', 'threat-range', 'combat-forecast', 'damage-numbers'], params: ['grid-range-path.res=256x224'] },
    { ids: ['timing-bar', 'big-banner', 'pixel-scaler'], params: ['timing-bar.moment=pulling a sword from a stone', 'big-banner.size=3'] },
    { ids: ['active-time-battle', 'window-cursor', 'damage-numbers'], params: [], starter: true },
    { ids: ['grid-range-path', 'fog-of-war', 'threat-range'], params: ['fog-of-war.radius=4'], starter: true },
    { ids: ['dialogue-box', 'expressive-portraits', 'dialogue-choices'], params: [] },
    { ids: ['grid-range-path', 'dialogue-box', 'shop-inventory'], params: [] },
    { ids: ['shop-inventory', 'level-up-growth', 'save-slots'], params: [] },
    { ids: ['sword-combat', 'hit-stop-shake', 'damage-numbers'], params: [], starter: true },
    { ids: ['platformer-feel', 'damage-numbers'], params: [], starter: true },
    { ids: ['platformer-feel', 'hit-stop-shake', 'weather-particles', 'palette-swap'], params: [] },
    // M9: `requires` (I-08 / L-00 added before the element that needs them) and generated-art stacking
    { ids: ['dynamic-lights', 'color-grade-lut', 'camera-director'], params: [] },
    { ids: ['webgl-post', 'dynamic-lights', 'bloom-glow', 'color-grade-lut', 'camera-director'], params: [] },
    { ids: ['dynamic-lights', 'bloom-glow'], params: [] },
    { ids: ['bloom-glow', 'damage-pop', 'squash-stretch'], params: [] },
    { ids: ['painted-ui', 'painted-portraits', 'dialogue-box'], params: [] },
    { ids: ['art-direction-lock', 'painted-parallax', 'painted-portraits', 'painted-ui'], params: [] },
    { ids: ['springy-ui', 'upgrade-draft', 'verlet-cloth'], params: [] },
    { ids: ['sword-combat', 'dynamic-lights', 'damage-pop'], params: [], starter: true },
    // M10 kits and starters
    { ids: ['run-map', 'card-battle', 'upgrade-draft', 'card-art', 'toasts'], params: [] },
    { ids: ['webgl-post', 'modern-particles', 'ribbon-trails', 'screen-distortion', 'normal-lighting'], params: [] },
    { ids: ['stamina-rest', 'squad-formation', 'tactic-rules', 'squad-clash'], params: [] },
    // L-10: the Squad tactics kit with cutout characters (and its required L-00), in the kit's order
    { ids: ['stamina-rest', 'art-direction-lock', 'squad-formation', 'tactic-rules', 'squad-clash', 'cutout-characters'], params: [] },
    { ids: ['card-battle', 'damage-pop'], params: [], starter: true },
    { ids: ['squad-clash', 'damage-pop'], params: [], starter: true },
    { ids: ['screen-distortion', 'normal-lighting', 'dynamic-lights'], params: [] },
    { ids: ['normal-maps', 'normal-lighting'], params: [] },
    ...E.map(e => ({ ids: [e.id], params: [] })),
    // M11 3D (after the per-element cases so the 88 earlier ones keep their order): starters ship three.min.js, N-02 its kit files
    { ids: ['third-person-3d'], params: [], starter: true },
    { ids: ['tactics-grid-3d'], params: [], starter: true },
    { ids: ['tactics-grid-3d', 'damage-pop'], params: [], starter: true },
    { ids: ['third-person-3d', 'billboard-sprites-3d'], params: [], starter: true },
    // M12 / M13: the two new starters (alone and + C-11, as cold-tested), N-04 into the N-01 starter, and add-on mixes
    { ids: ['horde-survival'], params: [], starter: true },
    { ids: ['horde-survival', 'damage-pop'], params: [], starter: true },
    { ids: ['tower-defense'], params: [], starter: true },
    { ids: ['tower-defense', 'damage-pop'], params: [], starter: true },
    { ids: ['third-person-3d', 'toon-outlines-3d'], params: [], starter: true },
    // (N-03 starter + N-04 is not added: combine.mjs rejects it (grid view vs 3d view, as with the N-02 diorama kit), although N-04 was cold-tested in that starter)
    { ids: ['bullet-patterns', 'draining-hp-bar', 'procedural-sfx'], params: [] },
    { ids: ['vision-cones', 'minimap', 'physics-debris', 'time-rewind'], params: [] },
    // M14 / M15: the N-06 starter (alone and + C-14 toasts, as cold-tested)
    { ids: ['wfc-town-3d'], params: [], starter: true },
    { ids: ['wfc-town-3d', 'toasts'], params: [], starter: true },
    { ids: ['kart-racer-3d'], params: [], starter: true },
    { ids: ['kart-racer-3d', 'toasts'], params: [], starter: true },
    { ids: ['match3-battle'], params: [], starter: true },
    { ids: ['match3-battle', 'damage-pop'], params: [], starter: true },
    { ids: ['dungeon-floors'], params: [], starter: true },
    { ids: ['dungeon-floors', 'damage-pop'], params: [], starter: true },
    { ids: ['raycast-dungeon'], params: [], starter: true },
    { ids: ['raycast-dungeon', 'damage-pop'], params: [], starter: true },
    { ids: ['farming-plots'], params: [], starter: true },
    { ids: ['farming-plots', 'toasts'], params: [], starter: true }
  ];
  let bad = 0, n = 0;
  for (const c of cases) {
    const out = path.join(tmp, String(n++));
    const args = [path.join(ROOT, 'tools/combine.mjs'), ...c.ids, '--out', out, ...c.params.flatMap(p => ['--param', p]), ...(c.starter ? ['--starter'] : [])];
    try { execFileSync(process.execPath, args, { stdio: 'pipe' }); } catch (err) { if (err.status !== 3) { console.log(`  FAIL ${c.ids.join('+')}: combine.mjs exit ${err.status}: ${String(err.stdout).slice(-300)}`); bad++; continue; } }
    const cli = fs.readFileSync(path.join(out, 'COMBO.md'));
    const r = Core.run(BASKET_DATA, { ids: c.ids, params: c.params, starter: !!c.starter });
    const web = Buffer.from(r.md, 'utf8');
    const same = Buffer.compare(cli, web) === 0;
    const listAll = (d, pre = '') => fs.readdirSync(d).flatMap(f => fs.statSync(path.join(d, f)).isDirectory() ? listAll(path.join(d, f), pre + f + '/') : [pre + f]);   // starterFiles folders (A-14 art/)
    const files = listAll(out).filter(f => f !== 'COMBO.md').sort(), webFiles = r.files.map(f => f.name).sort();
    const filesSame = JSON.stringify(files) === JSON.stringify(webFiles) && r.files.every(f => Buffer.compare(fs.readFileSync(path.join(ROOT, f.path)), fs.readFileSync(path.join(out, f.name))) === 0);
    const sha = crypto.createHash('sha256').update(cli).digest('hex').slice(0, 12);
    if (!same || !filesSame) bad++;
    console.log(`  ${same && filesSame ? 'SAME' : 'DIFF'} ${c.starter ? '[starter] ' : ''}${c.ids.join('+')}${r.added && r.added.length ? ' (+' + r.added.map(x => x.id).join(', +') + ' required)' : ''}${c.params.length ? ' ' + c.params.join(' ') : ''}: COMBO.md ${cli.length} bytes sha256 ${sha}${same ? '' : ' (web ' + web.length + ' bytes)'}; zip files ${filesSame ? 'match' : 'DIFFER: ' + files.join(',') + ' vs ' + webFiles.join(',')}`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(bad ? `verify: ${bad} of ${cases.length} baskets differ` : `verify: all ${cases.length} baskets byte-identical`);
  process.exit(bad ? 1 : 0);
}

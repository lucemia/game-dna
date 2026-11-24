#!/usr/bin/env node
// Combo basket: merge several Game DNA elements into ONE English prompt (COMBO.md) plus their module files,
// for an agent adding all of them to a game we have never seen. No dependencies.
//
//   node tools/combine.mjs <id> <id> ... [--out dir] [--param key=value | id.key=value ...] [--check] [--force]
//
// Reads elements/<id>/element.json, element.md, module/README.md, module/*.js and tools/basket/<id>.mjs (role-based
// wiring hints). Writes <out>/COMBO.md, <out>/<module>.js (byte-identical copies) and <out>/<id>.README.md.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EL_DIR = path.join(ROOT, 'elements');
const HINT_DIR = path.join(ROOT, 'tools', 'basket');
const SHARED_WORD_LIMIT = 900;
const STAGES = ['foundations', 'systems', 'ui', 'effects'];
const ADAPTIVE_LAYERS = ['fx', 'post'];   // feedback layers follow any clock and any coordinate system

// ---------- args ----------
function usage(code) {
  console.log(`usage: node tools/combine.mjs <id> <id> ... [--out dir] [--param key=value | id.key=value ...] [--check] [--force]
  --out dir      output folder (default combos/<id>+<id>...)
  --param k=v    set a parameter; a bare key applies to every element that has it, id.key=v to one element
  --check        run the compatibility check only, write nothing
  --force        write even when the check reports errors
  --starter      with a system element: ship its starter game (index.html) and write 'add these addons to this starter'
  --no-starter   (default) generic COMBO.md for an unknown game, system element included
elements: ${listElements().join(', ')}`);
  process.exit(code);
}
function listElements() { return fs.existsSync(EL_DIR) ? fs.readdirSync(EL_DIR).filter(d => fs.existsSync(path.join(EL_DIR, d, 'element.json'))).sort() : []; }
const args = process.argv.slice(2), ids = [], rawParams = [];
let out = null, checkOnly = false, force = false, useStarter = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--help' || a === '-h') usage(0);
  else if (a === '--out') out = args[++i];
  else if (a.startsWith('--out=')) out = a.slice(6);
  else if (a === '--param') rawParams.push(args[++i]);
  else if (a.startsWith('--param=')) rawParams.push(a.slice(8));
  else if (a === '--check') checkOnly = true;
  else if (a === '--force') force = true;
  else if (a === '--starter') useStarter = true;
  else if (a === '--no-starter') useStarter = false;
  else if (a.startsWith('--')) { console.error(`unknown option ${a}`); usage(1); }
  else ids.push(a);
}
if (!ids.length) usage(1);
if (new Set(ids).size !== ids.length) { console.error('ERROR an element is listed twice'); process.exit(2); }
// element.json `requires` (e.g. J-family lights need I-08 webgl-post): add each missing requirement before the element
for (let i = 0; i < ids.length; i++) {
  const ej = path.join(EL_DIR, ids[i], 'element.json');
  if (!fs.existsSync(ej)) continue;
  for (const r of JSON.parse(fs.readFileSync(ej, 'utf8')).requires || []) {
    if (ids.includes(r)) continue;
    ids.splice(i, 0, r); i++;
    console.log(`NOTE ${ids[i]} requires ${r}: added to the basket`);
  }
}

// ---------- load ----------
function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function moduleInfo(el, dir) {
  // element.json has used both `module: {file, global}` and `delivery: {module, global}`
  const m = el.module || {}, d = el.delivery || {};
  const file = m.file || d.module || (fs.existsSync(path.join(dir, 'module')) ? 'module/' + (fs.readdirSync(path.join(dir, 'module')).find(f => f.endsWith('.js')) || '') : null);
  return { file, global: m.global || d.global || null, readme: m.docs || d.readme || 'module/README.md' };
}
function section(md, n) {   // body of "## n. ..." in element.md
  const re = new RegExp(`^## ${n}\\.[^\\n]*\\n([\\s\\S]*?)(?=^## |\\Z)`, 'm'), m = md.match(re);
  return m ? m[1].trim() : '';
}
const elements = [];
for (const id of ids) {
  const dir = path.join(EL_DIR, id);
  if (!fs.existsSync(path.join(dir, 'element.json'))) { console.error(`ERROR unknown element "${id}" (have: ${listElements().join(', ')})`); process.exit(2); }
  const json = readJSON(path.join(dir, 'element.json'));
  const md = fs.existsSync(path.join(dir, 'element.md')) ? fs.readFileSync(path.join(dir, 'element.md'), 'utf8') : '';
  const mod = moduleInfo(json, dir);
  if (!mod.file || !fs.existsSync(path.join(dir, mod.file))) { console.error(`ERROR ${id}: no module file (v1 delivery needs module/<id>.js)`); process.exit(2); }
  if (!mod.global) { const src = fs.readFileSync(path.join(dir, mod.file), 'utf8'); mod.global = (src.match(/root\.(GameDNA_\w+)\s*=/) || [])[1] || '(see README)'; }
  const hintPath = path.join(HINT_DIR, id + '.mjs');
  const hint = fs.existsSync(hintPath) ? (await import(pathToFileURL(hintPath).href)).default : null;
  const kind = json.kind === 'system' ? 'system' : 'addon';   // FORMAT v1.2; elements without `kind` are addons
  const starter = kind === 'system' && json.starter ? path.join(dir, json.starter) : null;
  elements.push({ id, dir, json, md, mod, hint, kind, starter, iface: json.interfaces || {} });
}

// ---------- parameters ----------
const paramErrors = [], explicit = new Set();   // explicit = `${id}.${key}` set with --param
for (const e of elements) { e.values = {}; for (const p of e.json.params || []) e.values[p.key] = p.default; }
for (const raw of rawParams) {
  const m = String(raw || '').match(/^(?:([\w-]+)\.)?(\w+)=(.*)$/);
  if (!m) { paramErrors.push(`bad --param "${raw}" (use key=value or id.key=value)`); continue; }
  const [, scope, key, val] = m, targets = elements.filter(e => (!scope || e.id === scope) && (e.json.params || []).some(p => p.key === key));
  if (!targets.length) { paramErrors.push(`--param ${raw}: no ${scope ? `parameter "${key}" in ${scope}` : `element in this combo has parameter "${key}"`}`); continue; }
  for (const e of targets) {
    const p = e.json.params.find(q => q.key === key);
    if (p.type === 'text') { if (!val.trim()) { paramErrors.push(`${e.id}.${key}: must not be empty`); continue; } e.values[key] = val.trim(); explicit.add(`${e.id}.${key}`); continue; }
    if (p.options) { if (!p.options.map(String).includes(val)) { paramErrors.push(`${e.id}.${key}=${val}: must be one of ${p.options.join(', ')}`); continue; } e.values[key] = val; explicit.add(`${e.id}.${key}`); }
    else {
      const n = Number(val);
      if (!isFinite(n) || (p.min != null && n < p.min) || (p.max != null && n > p.max)) { paramErrors.push(`${e.id}.${key}=${val}: must be a number ${p.min}-${p.max}`); continue; }
      if (p.step && Math.abs((n - (p.min || 0)) / p.step - Math.round((n - (p.min || 0)) / p.step)) > 1e-9) { paramErrors.push(`${e.id}.${key}=${val}: step is ${p.step}`); continue; }
      e.values[key] = n; explicit.add(`${e.id}.${key}`);
    }
  }
}

// ---------- compatibility check (from element.json interfaces) ----------
// capability vocabulary: a need is met by another element if one of its `provides` maps to the same capability
const CAPS = [
  ['fixed-step', /60 ?hz|fixed.?step|\btick\b|delta time/i, 'a fixed 60 Hz update step'],
  ['clock-ms', /clock in ms|frame clock|world time/i, 'a world clock in ms that can pause'],
  ['hit-event', /hit event|impact frame|damage event/i, 'the places where HP/MP change (hit frame)'],
  ['anchor', /screen anchor|centre x|top of head/i, 'screen positions of targets'],
  ['avoid-rects', /rectangles to avoid|pop rectangles|ui rects/i, 'rectangles of UI to keep clear'],
  ['roster', /combatant list|unit list/i, 'a list of combatants/units'],
  ['action-player', /startaction|plays one action/i, 'code that plays one action and reports when done'],
  ['enemy-ai', /enemy ai|choose\(enemy\)/i, 'an enemy action chooser'],
  ['command-menu', /command menu/i, 'a command menu for one hero'],
  ['status-flags', /haste|slow/i, 'status effects (haste/slow)'],
  ['grid', /tile grid|grid size/i, 'a tile grid'],
  ['terrain', /terrain/i, 'terrain per tile'],
  ['input', /^input|confirm, cancel|direction held/i, 'input (directions, confirm, cancel, pointer)'],
  ['camera', /camera/i, 'a camera offset'],
  ['draw-slot', /draw pass|draw slot/i, 'a draw slot between ground and units'],
  ['turn-order', /action queue|ready queue|heroready|enemyready/i, 'who acts when'],
  ['hit-stop', /hit-stop request/i, 'hit-stop requests'],
  ['text-box', /\bH-01\b/, 'a text box: the H-01 dialogue box element (or the game\'s own box behind an adapter)']
];
const capOf = s => (CAPS.find(c => c[1].test(s)) || [null])[0];
const isAdaptive = e => ADAPTIVE_LAYERS.includes(e.iface.layer);
// FORMAT v1.5: `time: "any"` = runs inside whatever step the game has (modal UI); `coords: "screen"` = needs only screen rects
const anyTime = e => e.iface.time === 'any', anyView = e => e.iface.coords === 'screen';
const report = [], hostNeeds = {};
const add = (level, msg) => report.push({ level, msg });
paramErrors.forEach(m => add('ERROR', m));
const systems = elements.filter(e => e.kind === 'system');
// sys = the system whose STARTER is shipped (only with --starter); without it every element goes into the generic prompt
const sys = useStarter ? systems[0] || null : null;
add('OK', 'kinds: ' + elements.map(e => `${e.id} [${e.kind}${e.json.scope ? ', ' + e.json.scope : ''}${e === sys ? ', starter' : ''}]`).join(', ') + (sys ? ` -> starter basket: start from the ${sys.id} starter, add the addons` : ` -> generic basket: one prompt for an unknown game${systems.length ? ' (system without its starter; --starter ships it)' : ''}`));
if (useStarter && !systems.length) add('ERROR', '--starter needs a system element in the basket (none of these is one).');
if (sys && !(sys.starter && fs.existsSync(sys.starter))) add('ERROR', `${sys.id}: --starter but element.json has no existing "starter" file.`);
for (const e of elements) if (e.json.scope === 'starter-only' && !sys)
  add('ERROR', `${e.id} is "scope": "starter-only" (it needs hooks only a system starter exposes); use it with --starter and a system element.`);
if (systems.length > 1) add('ERROR', `kinds: ${systems.map(e => e.id).join(' and ')} are both system elements; a basket holds at most one system element (with or without its starter) plus any number of addons.`);
for (let i = 0; i < elements.length; i++) for (let j = i + 1; j < elements.length; j++) {
  const a = elements[i], b = elements[j], A = a.iface, B = b.iface;
  // generated-art (L family) and light-post (J-01 lights + J-03 bloom: separate I-08 passes) elements stack on purpose
  if (a.json.family && a.json.family === b.json.family && !['generated-art', 'light-post'].includes(a.json.family))
    add('ERROR', `${a.id} and ${b.id} are both "${a.json.family}" elements: they own the same system. Pick one.`);
  // time model
  if (isAdaptive(a) || isAdaptive(b)) {
    const fx = isAdaptive(a) ? a : b, other = fx === a ? b : a;
    add('OK', `time: ${fx.id} (${fx.iface.time}, ${fx.iface.layer} layer) follows any clock; drive it from the same step as ${other.id} (${other.iface.time}).`);
  } else if (anyTime(a) || anyTime(b)) {
    const x = anyTime(a) ? a : b, o = x === a ? b : a;
    add('OK', `time: ${x.id} (any clock) runs inside ${o.id}'s step (${o.iface.time}).`);
  } else if ((A.time === 'turn') !== (B.time === 'turn')) {
    const t = A.time === 'turn' ? a : b, c = t === a ? b : a;
    add('ERROR', `time: ${t.id} advances by turns/phases, ${c.id} (${c.iface.time}) on a running clock. Both decide when units act; this basket cannot combine them without an adapter you design (use --force to generate anyway).`);
  } else add('OK', `time: ${a.id} (${A.time}) and ${b.id} (${B.time}) can share one fixed step.`);
  // coordinates
  if (A.coords !== B.coords) {
    if (anyView(a) || anyView(b)) {
      const x = anyView(a) ? a : b, o = x === a ? b : a;
      add('OK', `coords: ${x.id} only needs screen rects; ${o.id}'s ${o.iface.coords} view is fine.`);
    } else if (isAdaptive(a) || isAdaptive(b)) {
      const fx = isAdaptive(a) ? a : b, other = fx === a ? b : a;
      add('NOTE', `coords: ${fx.id} says "${fx.iface.coords}" but only needs screen-pixel anchors; convert ${other.id}'s ${other.iface.coords} positions to screen px (see Cross-element wiring).`);
    } else add('ERROR', `coords: ${a.id} assumes a ${A.coords} view, ${b.id} a ${B.coords} view; they cannot share one screen.`);
  } else add('OK', `coords: both ${A.coords}.`);
  // layers
  if (A.layer === B.layer && !isAdaptive(a)) add('WARN', `layer: ${a.id} and ${b.id} both draw on the ${A.layer} layer; pass each one's rects to the other's avoid list and check they never overlap.`);
  else add('OK', `layer: ${a.id} on ${A.layer}, ${b.id} on ${B.layer}.`);
}
for (const e of elements) {
  hostNeeds[e.id] = [];
  for (const need of e.iface.needs || []) {
    const optional = /^optional/i.test(need), cap = capOf(need);
    const by = cap && elements.find(o => o !== e && (o.iface.provides || []).some(p => capOf(p) === cap));
    if (sys) add('OK', e === sys ? `${e.id} needs "${need}": met inside its starter.` : `${e.id} needs "${need}": provided by the ${sys.id} starter's extension points.`);
    else if (by) add('OK', `${e.id} needs "${need}": provided by ${by.id}.`);
    else {
      hostNeeds[e.id].push(need);
      add(optional ? 'NOTE' : 'WARN', `${e.id} needs ${optional ? '(optional) ' : ''}"${need}"; no element here provides it, so the game must${cap ? ` (host capability: ${CAPS.find(c => c[0] === cap)[2]})` : ''}.`);
    }
  }
  if (sys && e !== sys && !(e.hint && e.hint.addon)) add('WARN', `${e.id}: its basket hint has no \`addon\` section, so the starter COMBO.md only points to its README.`);
  if (sys && e === sys && !(e.hint && e.hint.starter)) add('WARN', `${e.id}: its basket hint has no \`starter\` section (extension points), so the starter COMBO.md is thin.`);
  if (!e.hint) add('WARN', `${e.id}: no tools/basket/${e.id}.mjs, so its COMBO section is generic (API from its README, mistakes from element.md).`);
}
const counts = l => report.filter(r => r.level === l).length;
console.log(`Compatibility check: ${ids.join(' + ')}`);
for (const r of report) console.log(`  ${r.level.padEnd(5)} ${r.msg}`);
const errors = counts('ERROR');
console.log(`Result: ${errors ? 'NOT compatible' : 'compatible'} (${errors} errors, ${counts('WARN')} warnings, ${counts('NOTE')} notes)`);
if (checkOnly) process.exit(errors ? 2 : 0);
if (systems.length > 1) { console.log('Nothing written (two systems cannot be combined, even with --force).'); process.exit(2); }
if (errors && !force) { console.log('Nothing written (fix the errors or pass --force).'); process.exit(2); }

// ---------- render COMBO.md ----------
const sub = (s, e) => String(s).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in e.values ? String(e.values[k]) : m));
const stageOf = e => (e.hint && e.hint.stage) || ({ scene: 'foundations', actor: 'systems', ui: 'ui', fx: 'effects', post: 'effects' })[e.iface.layer] || 'systems';
const ordered = elements.map((e, i) => ({ e, i })).sort((x, y) => STAGES.indexOf(stageOf(x.e)) - STAGES.indexOf(stageOf(y.e)) || x.i - y.i).map(x => x.e);
const jsName = e => path.basename(e.mod.file);
const sha = e => crypto.createHash('sha256').update(fs.readFileSync(path.join(e.dir, e.mod.file))).digest('hex');
const words = s => (s.match(/\S+/g) || []).length;
if (sys) { writeStarterCombo(); process.exit(0); }
const hasScaler = elements.some(e => e.id === 'pixel-scaler');
const names = ordered.map(e => e.json.name.toLowerCase());
const listJoin = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

function fallbackHint(e) {
  const mistakes = section(e.md, 6).split('\n').filter(l => /^- /.test(l) && !/cold test/i.test(l)).slice(0, 5).map(l => l.replace(/^- /, '').replace(/\*\*/g, '').replace(/→/g, '->'));
  return {
    does: e.json.oneLiner, params: {},
    steps: [['Every integration point', `Follow \`${e.id}.README.md\` (API and integration example). Its example names are placeholders: find the place in your game that plays each role.`]],
    gotchas: mistakes, checks: [], selfcheck: []
  };
}
const H = e => e.hint || fallbackHint(e);

const shared = [], per = [];
shared.push(`# Add ${listJoin(names)} to my game`, '');
shared.push(`Add the ${ordered.length === 1 ? 'game element' : ordered.length + ' game elements'} below to MY existing game, which you have not seen. ${ordered.length === 1 ? 'It is a finished module file' : 'Each is a finished module file'} given with this prompt:`, '');
for (const e of ordered) shared.push(`- \`${jsName(e)}\` (one global, \`${e.mod.global}\`), API reference \`${e.id}.README.md\``);
shared.push('', 'README example names are placeholders.', '');
// designer's choices that decide WHERE an element goes (hint `lead`, built from text params such as `moment`): shown first
const leads = ordered.filter(e => H(e).lead).map(e => `- **${e.json.name}:** ${sub(H(e).lead, e)}`);
if (leads.length) shared.push('## Where it goes in my game (my choice; follow it exactly)', '', ...leads, '');
shared.push('## Shared premises', '');
shared.push('1. **Include each module file verbatim; never edit it.** Load it with its own `<script src>` before the game\'s script, or paste it unchanged into its own `<script>` tag. If a module seems to need a change, adapt my game around it and tell me.');
shared.push(hasScaler
  ? '2. **Resolution:** keep my game\'s native resolution; how that canvas is scaled to the screen is set by the pixel scaler element below. Call module draw functions on my native 2D context inside the same transform as my sprites (one module pixel = one game pixel), and keep my game\'s own image-smoothing setting (off for pixel art, on for smooth or HD games; never switch it).'
  : '2. **Resolution:** keep my game\'s native resolution and integer scaling as they are. Call module draw functions on my 2D context inside the same transform as my sprites (one module pixel = one game pixel), and keep my game\'s own image-smoothing setting (off for pixel art, on for smooth or HD games; never switch it).');
const times = [...new Set(elements.map(e => e.iface.time))];
shared.push(`3. **Time:** drive every module from one fixed 60 Hz step (1000 / 60 ms). If my loop uses variable delta time, accumulate it and run whole steps (at most 250 ms per frame).${times.includes('turn') ? ' Turn/phase logic stays mine; modules still update every step to animate.' : ''}`);
shared.push('4. **Coordinates:** native screen pixels (world minus camera) unless a section says tiles.');
shared.push('5. **Art and names:** anything new you draw or name is original (no real game, character, place or brand names); English UI text; do not restyle my game.');
shared.push('6. **Hook, don\'t replace:** add calls or change bodies; never delete or rename a function.');
shared.push('7. **Keep every other caller working.** Find every caller and reader of what you change (turn order, input, moves, menus, HUD): autopilot/AI, test hooks, URL parameters such as `?auto=1`, `?t=` and `?freeze=1`, keyboard shortcuts, end-turn buttons. Update each one. My game\'s own autoplay must still finish a whole game. Keep existing HUD info (HP bars, max HP) and existing commands.', '');
shared.push('## Order of work', '');
shared.push('1. **Read the game first.** Write down (file, function) where these live: loop/update step; draw pass and its order (background, actors, effects, HUD); input; where damage/HP changes are applied; where turns, actions or selections are chosen and played; HUD windows and their rects; camera; battle/scene start and end; and every caller from premise 7.');
shared.push('2. **Check the prerequisites** below against those notes. If one is missing, add the smallest working version and tell me.');
shared.push(`3. **Integrate one element at a time** (foundations, systems, UI, effects): ${ordered.map((e, i) => `(${i + 1}) ${e.json.name} [${stageOf(e)}]`).join(', ')}.`);
shared.push('4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.');
shared.push('5. Then the cross-element wiring and the merged checks.', '');
shared.push('## Prerequisites my game must already have', '');
// needs that read like a function signature (`startAction(action)`) are shown by capability, so no host names leak into the prompt
const needText = n => capOf(n) ? CAPS.find(c => c[0] === capOf(n))[2] + (/^optional/i.test(n) ? ' (optional)' : '') : n;
for (const e of ordered) if (hostNeeds[e.id].length) shared.push(`- **${e.json.name}:** ${[...new Set(hostNeeds[e.id].map(needText))].join('; ')}.`);
shared.push('');

// per-element sections
ordered.forEach((e, i) => {
  const h = H(e), L = [];
  L.push(`## Element ${i + 1}: ${e.json.name} (\`${jsName(e)}\`, \`${e.mod.global}\`)`, '');
  L.push(sub(h.does, e), '');
  if (h.lead) L.push(`**${sub(h.lead, e)}**`, '');
  const ps = (e.json.params || []).filter(p => (h.params || {})[p.key] !== 'IGNORE' && p.type !== 'text');
  const ignored = (e.json.params || []).filter(p => (h.params || {})[p.key] === 'IGNORE').map(p => `\`${p.key}\``);
  if (ps.length) {
    L.push('**Parameters chosen:** ' + ps.map(p => `\`${p.key}\` = ${e.values[p.key]}${/^fallback/i.test((h.params || {})[p.key] || '') ? ' (fallback only; the unit\'s own stat wins)' : ''}`).join(', ') + '.' + (ignored.length ? ` (${ignored.join(', ')}: not used; your game keeps its own.)` : ''), '');
  }
  L.push('**Where it goes** (by role; find these places in my game):', '');
  (h.steps || []).forEach(([where, what], k) => L.push(`${k + 1}. *${sub(where, e)}:* ${sub(what, e)}`));
  if ((h.gotchas || []).length) { L.push('', '**Common mistakes** (symptom -> fix):', ''); h.gotchas.forEach(g => L.push(`- ${sub(g, e)}`)); }
  L.push('');
  per.push(L);
});

// cross-element wiring: element A "wants" a tag that element B "offers"; grouped per pair
// an offer is a string, or {title, text} (newer hints): only its text goes into the line
function offerText(o) { return o && typeof o === 'object' ? o.text : o; }
const wiring = [], wireChecks = [];
for (const a of ordered) for (const b of ordered) {
  if (b === a) continue;
  const lines = [];
  for (const [tag, w] of Object.entries(H(a).wants || {})) {
    if (!(H(b).offers || {})[tag]) continue;
    lines.push(`- **${w.title}:** ${sub(offerText(H(b).offers[tag]), b)} ${sub(w.text, a)}`);
    if (w.check) wireChecks.push(w.check);
  }
  if (lines.length) wiring.push(`**${a.json.name} with ${b.json.name}:**`, '', ...lines, '');
}
const tail = [];
if (wiring.length) tail.push('## Cross-element wiring', '', ...wiring);
tail.push('## Merged acceptance checks (screenshot if you can; otherwise describe the trace)', '');
const tagged = new Map(ordered.map(e => [e.id, []]));
const tag = (e, line) => { tagged.get(e.id).push(line); return line; };
for (const e of ordered) for (const c of H(e).checks || []) tail.push(tag(e, `- [${e.json.name}] ${sub(c, e)}`));
for (const c of wireChecks) tail.push(`- [combined] ${c}`);
tail.push('- [combined] My game\'s autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.', '');
tail.push('## Self-check without a browser (report each)', '');
tail.push('- Each module file is byte-identical to the one given: ' + ordered.map(e => `\`${jsName(e)}\` sha256 \`${sha(e).slice(0, 16)}...\``).join(', ') + ' (`shasum -a 256`).');
tail.push('- No function removed or renamed (compare name lists before/after).');
tail.push('- Every identifier you call exists where called; each instance exists before first use.');
for (const e of ordered) for (const c of H(e).selfcheck || []) tail.push(tag(e, `- [${e.json.name}] ${sub(c, e)}`));
tail.push('- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.');
tail.push('- Say how each caller listed in step 1 still works.');
tail.push('- Report which of my functions you changed for each element, and anything you could not do.', '');

const allTagged = new Set([...tagged.values()].flat());
const sharedText = [...shared, ...tail.filter(l => !allTagged.has(l))];
const md = [...shared, ...per.flat(), ...tail].join('\n');
const wShared = words(sharedText.join('\n')), wPer = per.map((p, i) => words(p.join('\n')) + words(tagged.get(ordered[i].id).join('\n')));

// ---------- write ----------
const outDir = path.resolve(out || path.join(ROOT, 'combos', ids.join('+')));
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'COMBO.md'), md);
const written = ['COMBO.md'];
for (const e of ordered) {
  fs.copyFileSync(path.join(e.dir, e.mod.file), path.join(outDir, jsName(e))); written.push(jsName(e));
  const rd = path.join(e.dir, e.mod.readme);
  if (fs.existsSync(rd)) { fs.copyFileSync(rd, path.join(outDir, `${e.id}.README.md`)); written.push(`${e.id}.README.md`); }
}
copyBasketFiles(ordered, outDir, written);
console.log(`Wrote ${path.relative(process.cwd(), outDir) || '.'}/: ${written.join(', ')}`);
console.log(`Words (element-tagged check lines count toward their element): shared ${wShared} (limit ${SHARED_WORD_LIMIT})${wShared > SHARED_WORD_LIMIT ? ' OVER LIMIT' : ''}; per element ${ordered.map((e, i) => `${e.id} ${wPer[i]}`).join(', ')}; total ${words(md)}`);
process.exit(wShared > SHARED_WORD_LIMIT ? 3 : 0);

// ---------- starter basket (FORMAT v1.2): one system starter + addons ----------
// The output folder holds the starter as index.html (the user builds on it), its README, and the addon modules.
// COMBO.md here MAY name the starter's documented extension points (we ship the starter); it never names our test hosts.
function writeStarterCombo() {
  const addons = elements.filter(e => e !== sys), SH = (sys.hint && sys.hint.starter) || {};
  const val = (e, k) => e.values[k];
  const subE = (s, e) => String(s).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in e.values ? String(e.values[k]) : m));
  // {{sys.key}} -> the system's starter text; {{with.key}} -> the addon's note for this particular starter; {{key}} -> addon param
  const fill = (s, e, W) => subE(String(s).replace(/\{\{sys\.(\w+)\}\}/g, (m, k) => SH[k] != null ? SH[k] : m).replace(/\{\{with\.(\w+)\}\}/g, (m, k) => W[k] != null ? W[k] : ''), e);
  const name = SH.name || sys.json.name + ' starter';
  const L = [];
  L.push(`# Add ${listJoinS(addons.map(e => e.json.name.toLowerCase()))} to ${/^the /i.test(name) ? '' : 'the '}${name} starter`, '');
  L.push(`\`index.html\` is a complete game built on the ${sys.json.name.toLowerCase()} element; build on it. \`index.README.md\` documents its extension points. Add:`, '');
  for (const e of addons) L.push(`- \`${jsName(e)}\` (one global, \`${e.mod.global}\`), API in \`${e.id}.README.md\``);
  L.push('', '## Rules', '');
  L.push(`1. **Modules verbatim:** load each addon module ${SH.modules || 'with its own \`<script src>\` (or paste it unchanged) before the game script'}. Never edit a module or the starter's own systems; add code only through the extension points.`);
  L.push(`2. **Register each addon** as one object: ${SH.register || 'see the starter README'}.`);
  const builtins = addons.map(e => e.hint && e.hint.addon && e.hint.addon.builtin).filter(b => b && SH.builtins && SH.builtins[b]);
  L.push(`3. **Turn off the starter's built-in equivalent** of each addon${builtins.length ? ': ' + builtins.map(b => SH.builtins[b]).join('; ') : ' (check its README flags)'}; otherwise both draw.`);
  L.push(`4. **Keep everything working:** ${SH.keep || 'autoplay, URL parameters and shortcuts'}. Addons advance only in the \`update\` hook (never on real time)${SH.freezeLimit ? '' : ', so \`?t=\` fast-forward shows them'}; consume no game key.${SH.freezeLimit ? ' ' + SH.freezeLimit + '.' : ''}`);
  L.push(`5. Keep the native resolution${elements.some(e => e.id === 'pixel-scaler') ? ' (screen scaling is set by the pixel scaler addon)' : ' and integer scaling'}; anything new you draw or name is original (no real game, character, place or brand names).`, '');
  const checks = [], selfs = [];
  for (const e of addons) {
    const A = (e.hint && e.hint.addon) || {}, W = (A.with && A.with[sys.id]) || {};
    for (const [k, v] of Object.entries(W.params || {})) if (!explicit.has(`${e.id}.${k}`)) e.values[k] = v;
    L.push(`## ${e.json.name}`, '');
    L.push(e.json.oneLiner, '');
    const ps = (e.json.params || []).filter(p => ((e.hint && e.hint.params) || {})[p.key] !== 'IGNORE');
    if (ps.length) L.push('**Parameters:** ' + ps.map(p => `\`${p.key}\` = ${val(e, p.key)}`).join(', ') + '.', '');
    if (A.steps) { L.push('**Wiring** (one addon object):', ''); A.steps.forEach(([where, what], k) => L.push(`${k + 1}. *${fill(where, e, W)}:* ${fill(what, e, W)}`)); }
    else L.push(`Wire it through the extension points above; the API is in \`${e.id}.README.md\`.`);
    if ((A.gotchas || []).length) { L.push('', '**Common mistakes:**', ''); A.gotchas.forEach(g => L.push(`- ${fill(g, e, W)}`)); }
    L.push('');
    (A.checks || (e.hint && e.hint.checks) || []).forEach(c => checks.push(`- [${e.json.name}] ${fill(c, e, W)}`));
    (A.selfcheck || []).forEach(c => selfs.push(`- [${e.json.name}] ${fill(c, e, W)}`));
  }
  L.push('## Checks', '', ...checks);
  L.push(`- ${SH.autoCheck || '`?auto=1` still plays a whole game to its end'}, with the addons working on every relevant event${SH.freezeLimit ? '' : '; \`?t=<ms>&freeze=1\` shows them mid-game'}; no built-in duplicates; no console errors.`, '');
  L.push('## Self-check without a browser', '');
  L.push('- Each module file is byte-identical to the one given: ' + addons.map(e => `\`${jsName(e)}\` sha256 \`${sha(e).slice(0, 16)}...\``).join(', ') + '.');
  L.push('- `node --check` your addon script (copy an inline script to a temp .js). Outside the registration slot, the starter is unchanged (diff it).');
  L.push(...selfs);
  L.push(`- Trace one autoplay event from ${SH.traceFrom || 'the starter\'s hit site'} through your addon hooks to the draw, and say which hooks you added.`, '');
  const md = L.join('\n');
  const outDir = path.resolve(out || path.join(ROOT, 'combos', 'starter-' + ids.join('+')));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'COMBO.md'), md);
  fs.copyFileSync(sys.starter, path.join(outDir, 'index.html'));
  const written = ['COMBO.md', 'index.html'];
  const srd = path.join(path.dirname(sys.starter), 'README.md');
  if (fs.existsSync(srd)) { fs.copyFileSync(srd, path.join(outDir, 'index.README.md')); written.push('index.README.md'); }
  // files the starter loads at run time (element.json "starterFiles": paths beside the starter, e.g. ["art"]): copied as they are
  for (const rel of sys.json.starterFiles || []) {
    const from = path.join(path.dirname(sys.starter), rel);
    if (!fs.existsSync(from)) { console.warn(`WARN ${sys.id}: starterFiles entry "${rel}" not found beside the starter`); continue; }
    fs.cpSync(from, path.join(outDir, rel), { recursive: true }); written.push(rel + (fs.statSync(from).isDirectory() ? '/' : ''));
  }
  for (const e of addons) {
    fs.copyFileSync(path.join(e.dir, e.mod.file), path.join(outDir, jsName(e))); written.push(jsName(e));
    const rd = path.join(e.dir, e.mod.readme);
    if (fs.existsSync(rd)) { fs.copyFileSync(rd, path.join(outDir, `${e.id}.README.md`)); written.push(`${e.id}.README.md`); }
  }
  copyBasketFiles([sys, ...addons], outDir, written);
  console.log(`Wrote ${path.relative(process.cwd(), outDir) || '.'}/: ${written.join(', ')}`);
  console.log(`Words: COMBO.md ${words(md)} (starter basket)`);
}
// element.json "basketFiles" (N family: the pinned three.js build, N-02's demo-kit files): [{from: repo path, to: name in
// the basket}], copied after the modules; a name already written (a starter's own three.min.js) is not copied twice
function copyBasketFiles(els, outDir, written) {
  for (const e of els) for (const f of e.json.basketFiles || []) {
    if (written.includes(f.to)) continue;
    const from = path.join(ROOT, f.from);
    if (!fs.existsSync(from)) { console.warn(`WARN ${e.id}: basketFiles entry "${f.from}" not found`); continue; }
    fs.mkdirSync(path.dirname(path.join(outDir, f.to)), { recursive: true });
    fs.copyFileSync(from, path.join(outDir, f.to)); written.push(f.to);
  }
}
function listJoinS(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }

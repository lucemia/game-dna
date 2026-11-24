/* Game DNA basket: a browser port of tools/combine.mjs (compatibility check + COMBO.md text).
 * Same rules, same text, byte for byte: `node tools/build-site.mjs --verify` compares this file's output with
 * `node tools/combine.mjs` for sample baskets. Keep the two in step when either changes.
 * DATA (assets/basket-data.js, generated) = {elements: {id: {json, md, hint, file, global, readme, readmeExists,
 *   sha, starter, starterExists, starterReadme, starterFiles}}}.
 * run(DATA, {ids, params: ['key=v' | 'id.key=v'], starter: bool, force: bool}) ->
 *   {report: [{level, msg}], errors, warnings, notes, compatible, written: bool, md, files: [{name, path}], sharedWords, overLimit}
 */
(function (root) {
  'use strict';
  var STAGES = ['foundations', 'systems', 'ui', 'effects'];
  var ADAPTIVE_LAYERS = ['fx', 'post'];
  var SHARED_WORD_LIMIT = 900;
  var CAPS = [
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
  function capOf(s) { var c = CAPS.find(function (c) { return c[1].test(s); }); return c ? c[0] : null; }
  function basename(p) { return String(p).split('/').pop(); }
  function section(md, n) {
    var re = new RegExp('^## ' + n + '\\.[^\\n]*\\n([\\s\\S]*?)(?=^## |\\Z)', 'm'), m = md.match(re);
    return m ? m[1].trim() : '';
  }
  function words(s) { return (s.match(/\S+/g) || []).length; }
  function offerText(o) { return o && typeof o === 'object' ? o.text : o; }   // an offer is a string or {title, text}
  function listJoin(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }

  function run(DATA, opt) {
    var ids = opt.ids.slice(), rawParams = (opt.params || []).slice(), useStarter = !!opt.starter, force = !!opt.force;
    var report = [], hostNeeds = {};
    function add(level, msg) { report.push({ level: level, msg: msg }); }
    var res = { report: report, written: false, md: '', files: [], errors: 0, warnings: 0, notes: 0 };
    if (!ids.length) return res;
    if (new Set(ids).size !== ids.length) { add('ERROR', 'an element is listed twice'); res.errors = 1; return res; }
    // element.json `requires` (e.g. J-family lights need I-08 webgl-post): add each missing requirement before the element
    res.added = [];
    for (var ri = 0; ri < ids.length; ri++) {
      var RD = DATA.elements[ids[ri]];
      if (!RD) continue;
      (RD.json.requires || []).forEach(function (r) {
        if (ids.indexOf(r) >= 0) return;
        ids.splice(ri, 0, r); ri++;
        res.added.push({ id: r, by: ids[ri] });
      });
    }
    res.ids = ids;
    var elements = [];
    for (var q = 0; q < ids.length; q++) {
      var id = ids[q], D = DATA.elements[id];
      if (!D) { add('ERROR', 'unknown element "' + id + '"'); res.errors = 1; return res; }
      var json = D.json;
      var kind = json.kind === 'system' ? 'system' : 'addon';
      elements.push({ id: id, json: json, md: D.md || '', D: D, hint: D.hint || null, kind: kind,
        starter: kind === 'system' && json.starter ? D.starter : null, iface: json.interfaces || {} });
    }
    // ---------- parameters ----------
    var paramErrors = [], explicit = new Set();
    elements.forEach(function (e) { e.values = {}; (e.json.params || []).forEach(function (p) { e.values[p.key] = p.default; }); });
    rawParams.forEach(function (raw) {
      var m = String(raw || '').match(/^(?:([\w-]+)\.)?(\w+)=(.*)$/);
      if (!m) { paramErrors.push('bad --param "' + raw + '" (use key=value or id.key=value)'); return; }
      var scope = m[1], key = m[2], val = m[3];
      var targets = elements.filter(function (e) { return (!scope || e.id === scope) && (e.json.params || []).some(function (p) { return p.key === key; }); });
      if (!targets.length) { paramErrors.push('--param ' + raw + ': no ' + (scope ? 'parameter "' + key + '" in ' + scope : 'element in this combo has parameter "' + key + '"')); return; }
      targets.forEach(function (e) {
        var p = e.json.params.find(function (q) { return q.key === key; });
        if (p.type === 'text') { if (!val.trim()) { paramErrors.push(e.id + '.' + key + ': must not be empty'); return; } e.values[key] = val.trim(); explicit.add(e.id + '.' + key); return; }
        if (p.options) { if (!p.options.map(String).includes(val)) { paramErrors.push(e.id + '.' + key + '=' + val + ': must be one of ' + p.options.join(', ')); return; } e.values[key] = val; explicit.add(e.id + '.' + key); }
        else {
          var n = Number(val);
          if (!isFinite(n) || (p.min != null && n < p.min) || (p.max != null && n > p.max)) { paramErrors.push(e.id + '.' + key + '=' + val + ': must be a number ' + p.min + '-' + p.max); return; }
          if (p.step && Math.abs((n - (p.min || 0)) / p.step - Math.round((n - (p.min || 0)) / p.step)) > 1e-9) { paramErrors.push(e.id + '.' + key + '=' + val + ': step is ' + p.step); return; }
          e.values[key] = n; explicit.add(e.id + '.' + key);
        }
      });
    });
    // ---------- compatibility check ----------
    function isAdaptive(e) { return ADAPTIVE_LAYERS.includes(e.iface.layer); }
    function anyTime(e) { return e.iface.time === 'any'; }
    function anyView(e) { return e.iface.coords === 'screen'; }
    res.added.forEach(function (x) { add('NOTE', x.by + ' requires ' + x.id + ': added to the basket'); });
    paramErrors.forEach(function (m) { add('ERROR', m); });
    var systems = elements.filter(function (e) { return e.kind === 'system'; });
    var sys = useStarter ? systems[0] || null : null;
    add('OK', 'kinds: ' + elements.map(function (e) { return e.id + ' [' + e.kind + (e.json.scope ? ', ' + e.json.scope : '') + (e === sys ? ', starter' : '') + ']'; }).join(', ') + (sys ? ' -> starter basket: start from the ' + sys.id + ' starter, add the addons' : ' -> generic basket: one prompt for an unknown game' + (systems.length ? ' (system without its starter; --starter ships it)' : '')));
    if (useStarter && !systems.length) add('ERROR', '--starter needs a system element in the basket (none of these is one).');
    if (sys && !(sys.starter && sys.D.starterExists)) add('ERROR', sys.id + ': --starter but element.json has no existing "starter" file.');
    elements.forEach(function (e) { if (e.json.scope === 'starter-only' && !sys)
      add('ERROR', e.id + ' is "scope": "starter-only" (it needs hooks only a system starter exposes); use it with --starter and a system element.'); });
    if (systems.length > 1) add('ERROR', 'kinds: ' + systems.map(function (e) { return e.id; }).join(' and ') + ' are both system elements; a basket holds at most one system element (with or without its starter) plus any number of addons.');
    for (var i = 0; i < elements.length; i++) for (var j = i + 1; j < elements.length; j++) {
      var a = elements[i], b = elements[j], A = a.iface, B = b.iface, fx, other;
      // generated-art (L family) and light-post (J-01 lights + J-03 bloom: separate I-08 passes) elements stack on purpose
      if (a.json.family && a.json.family === b.json.family && !['generated-art', 'light-post'].includes(a.json.family))
        add('ERROR', a.id + ' and ' + b.id + ' are both "' + a.json.family + '" elements: they own the same system. Pick one.');
      if (isAdaptive(a) || isAdaptive(b)) {
        fx = isAdaptive(a) ? a : b; other = fx === a ? b : a;
        add('OK', 'time: ' + fx.id + ' (' + fx.iface.time + ', ' + fx.iface.layer + ' layer) follows any clock; drive it from the same step as ' + other.id + ' (' + other.iface.time + ').');
      } else if (anyTime(a) || anyTime(b)) {
        var x = anyTime(a) ? a : b, o = x === a ? b : a;
        add('OK', 'time: ' + x.id + ' (any clock) runs inside ' + o.id + "'s step (" + o.iface.time + ').');
      } else if ((A.time === 'turn') !== (B.time === 'turn')) {
        var t = A.time === 'turn' ? a : b, c = t === a ? b : a;
        add('ERROR', 'time: ' + t.id + ' advances by turns/phases, ' + c.id + ' (' + c.iface.time + ') on a running clock. Both decide when units act; this basket cannot combine them without an adapter you design (use --force to generate anyway).');
      } else add('OK', 'time: ' + a.id + ' (' + A.time + ') and ' + b.id + ' (' + B.time + ') can share one fixed step.');
      if (A.coords !== B.coords) {
        if (anyView(a) || anyView(b)) {
          var xv = anyView(a) ? a : b, ov = xv === a ? b : a;
          add('OK', 'coords: ' + xv.id + ' only needs screen rects; ' + ov.id + "'s " + ov.iface.coords + ' view is fine.');
        } else if (isAdaptive(a) || isAdaptive(b)) {
          fx = isAdaptive(a) ? a : b; other = fx === a ? b : a;
          add('NOTE', 'coords: ' + fx.id + ' says "' + fx.iface.coords + '" but only needs screen-pixel anchors; convert ' + other.id + "'s " + other.iface.coords + ' positions to screen px (see Cross-element wiring).');
        } else add('ERROR', 'coords: ' + a.id + ' assumes a ' + A.coords + ' view, ' + b.id + ' a ' + B.coords + ' view; they cannot share one screen.');
      } else add('OK', 'coords: both ' + A.coords + '.');
      if (A.layer === B.layer && !isAdaptive(a)) add('WARN', 'layer: ' + a.id + ' and ' + b.id + ' both draw on the ' + A.layer + " layer; pass each one's rects to the other's avoid list and check they never overlap.");
      else add('OK', 'layer: ' + a.id + ' on ' + A.layer + ', ' + b.id + ' on ' + B.layer + '.');
    }
    elements.forEach(function (e) {
      hostNeeds[e.id] = [];
      (e.iface.needs || []).forEach(function (need) {
        var optional = /^optional/i.test(need), cap = capOf(need);
        var by = cap && elements.find(function (o) { return o !== e && (o.iface.provides || []).some(function (p) { return capOf(p) === cap; }); });
        if (sys) add('OK', e === sys ? e.id + ' needs "' + need + '": met inside its starter.' : e.id + ' needs "' + need + '": provided by the ' + sys.id + " starter's extension points.");
        else if (by) add('OK', e.id + ' needs "' + need + '": provided by ' + by.id + '.');
        else {
          hostNeeds[e.id].push(need);
          add(optional ? 'NOTE' : 'WARN', e.id + ' needs ' + (optional ? '(optional) ' : '') + '"' + need + '"; no element here provides it, so the game must' + (cap ? ' (host capability: ' + CAPS.find(function (c) { return c[0] === cap; })[2] + ')' : '') + '.');
        }
      });
      if (sys && e !== sys && !(e.hint && e.hint.addon)) add('WARN', e.id + ': its basket hint has no `addon` section, so the starter COMBO.md only points to its README.');
      if (sys && e === sys && !(e.hint && e.hint.starter)) add('WARN', e.id + ': its basket hint has no `starter` section (extension points), so the starter COMBO.md is thin.');
      if (!e.hint) add('WARN', e.id + ': no tools/basket/' + e.id + '.mjs, so its COMBO section is generic (API from its README, mistakes from element.md).');
    });
    function counts(l) { return report.filter(function (r) { return r.level === l; }).length; }
    res.errors = counts('ERROR'); res.warnings = counts('WARN'); res.notes = counts('NOTE');
    res.compatible = !res.errors; res.twoSystems = systems.length > 1;
    if (opt.checkOnly || systems.length > 1 || (res.errors && !force)) return res;

    // ---------- render COMBO.md ----------
    function sub(s, e) { return String(s).replace(/\{\{(\w+)\}\}/g, function (m, k) { return k in e.values ? String(e.values[k]) : m; }); }
    function stageOf(e) { return (e.hint && e.hint.stage) || ({ scene: 'foundations', actor: 'systems', ui: 'ui', fx: 'effects', post: 'effects' })[e.iface.layer] || 'systems'; }
    var ordered = elements.map(function (e, i) { return { e: e, i: i }; }).sort(function (x, y) { return STAGES.indexOf(stageOf(x.e)) - STAGES.indexOf(stageOf(y.e)) || x.i - y.i; }).map(function (x) { return x.e; });
    function jsName(e) { return basename(e.D.file); }
    function sha(e) { return e.D.sha; }
    // element.json basketFiles (N family: three.min.js, N-02's demo-kit files), as combine.mjs copies them; no name twice
    function basketFiles(list, files) {
      list.forEach(function (e) { (e.json.basketFiles || []).forEach(function (f) {
        if (!files.some(function (x) { return x.name === f.to; })) files.push({ name: f.to, path: f.from }); }); });
    }
    function moduleFiles(list) {
      var f = [];
      list.forEach(function (e) {
        f.push({ name: jsName(e), path: 'elements/' + e.id + '/' + e.D.file });
        if (e.D.readmeExists) f.push({ name: e.id + '.README.md', path: 'elements/' + e.id + '/' + e.D.readme });
      });
      return f;
    }
    if (sys) return starterCombo();
    var hasScaler = elements.some(function (e) { return e.id === 'pixel-scaler'; });
    var names = ordered.map(function (e) { return e.json.name.toLowerCase(); });
    function fallbackHint(e) {
      var mistakes = section(e.md, 6).split('\n').filter(function (l) { return /^- /.test(l) && !/cold test/i.test(l); }).slice(0, 5).map(function (l) { return l.replace(/^- /, '').replace(/\*\*/g, '').replace(/→/g, '->'); });
      return { does: e.json.oneLiner, params: {},
        steps: [['Every integration point', 'Follow `' + e.id + '.README.md` (API and integration example). Its example names are placeholders: find the place in your game that plays each role.']],
        gotchas: mistakes, checks: [], selfcheck: [] };
    }
    function H(e) { return e.hint || fallbackHint(e); }
    var shared = [], per = [];
    shared.push('# Add ' + listJoin(names) + ' to my game', '');
    shared.push('Add the ' + (ordered.length === 1 ? 'game element' : ordered.length + ' game elements') + ' below to MY existing game, which you have not seen. ' + (ordered.length === 1 ? 'It is a finished module file' : 'Each is a finished module file') + ' given with this prompt:', '');
    ordered.forEach(function (e) { shared.push('- `' + jsName(e) + '` (one global, `' + e.D.global + '`), API reference `' + e.id + '.README.md`'); });
    shared.push('', 'README example names are placeholders.', '');
    var leads = ordered.filter(function (e) { return H(e).lead; }).map(function (e) { return '- **' + e.json.name + ':** ' + sub(H(e).lead, e); });
    if (leads.length) shared.push.apply(shared, ['## Where it goes in my game (my choice; follow it exactly)', ''].concat(leads, ['']));
    shared.push('## Shared premises', '');
    shared.push("1. **Include each module file verbatim; never edit it.** Load it with its own `<script src>` before the game's script, or paste it unchanged into its own `<script>` tag. If a module seems to need a change, adapt my game around it and tell me.");
    shared.push(hasScaler
      ? "2. **Resolution:** keep my game's native resolution; how that canvas is scaled to the screen is set by the pixel scaler element below. Call module draw functions on my native 2D context inside the same transform as my sprites (one module pixel = one game pixel), and keep my game's own image-smoothing setting (off for pixel art, on for smooth or HD games; never switch it)."
      : "2. **Resolution:** keep my game's native resolution and integer scaling as they are. Call module draw functions on my 2D context inside the same transform as my sprites (one module pixel = one game pixel), and keep my game's own image-smoothing setting (off for pixel art, on for smooth or HD games; never switch it).");
    var times = Array.from(new Set(elements.map(function (e) { return e.iface.time; })));
    shared.push('3. **Time:** drive every module from one fixed 60 Hz step (1000 / 60 ms). If my loop uses variable delta time, accumulate it and run whole steps (at most 250 ms per frame).' + (times.includes('turn') ? ' Turn/phase logic stays mine; modules still update every step to animate.' : ''));
    shared.push('4. **Coordinates:** native screen pixels (world minus camera) unless a section says tiles.');
    shared.push('5. **Art and names:** anything new you draw or name is original (no real game, character, place or brand names); English UI text; do not restyle my game.');
    shared.push("6. **Hook, don't replace:** add calls or change bodies; never delete or rename a function.");
    shared.push("7. **Keep every other caller working.** Find every caller and reader of what you change (turn order, input, moves, menus, HUD): autopilot/AI, test hooks, URL parameters such as `?auto=1`, `?t=` and `?freeze=1`, keyboard shortcuts, end-turn buttons. Update each one. My game's own autoplay must still finish a whole game. Keep existing HUD info (HP bars, max HP) and existing commands.", '');
    shared.push('## Order of work', '');
    shared.push('1. **Read the game first.** Write down (file, function) where these live: loop/update step; draw pass and its order (background, actors, effects, HUD); input; where damage/HP changes are applied; where turns, actions or selections are chosen and played; HUD windows and their rects; camera; battle/scene start and end; and every caller from premise 7.');
    shared.push('2. **Check the prerequisites** below against those notes. If one is missing, add the smallest working version and tell me.');
    shared.push('3. **Integrate one element at a time** (foundations, systems, UI, effects): ' + ordered.map(function (e, i) { return '(' + (i + 1) + ') ' + e.json.name + ' [' + stageOf(e) + ']'; }).join(', ') + '.');
    shared.push('4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.');
    shared.push('5. Then the cross-element wiring and the merged checks.', '');
    shared.push('## Prerequisites my game must already have', '');
    function needText(n) { return capOf(n) ? CAPS.find(function (c) { return c[0] === capOf(n); })[2] + (/^optional/i.test(n) ? ' (optional)' : '') : n; }
    ordered.forEach(function (e) { if (hostNeeds[e.id].length) shared.push('- **' + e.json.name + ':** ' + Array.from(new Set(hostNeeds[e.id].map(needText))).join('; ') + '.'); });
    shared.push('');
    ordered.forEach(function (e, i) {
      var h = H(e), L = [];
      L.push('## Element ' + (i + 1) + ': ' + e.json.name + ' (`' + jsName(e) + '`, `' + e.D.global + '`)', '');
      L.push(sub(h.does, e), '');
      if (h.lead) L.push('**' + sub(h.lead, e) + '**', '');
      var ps = (e.json.params || []).filter(function (p) { return (h.params || {})[p.key] !== 'IGNORE' && p.type !== 'text'; });
      var ignored = (e.json.params || []).filter(function (p) { return (h.params || {})[p.key] === 'IGNORE'; }).map(function (p) { return '`' + p.key + '`'; });
      if (ps.length) {
        L.push('**Parameters chosen:** ' + ps.map(function (p) { return '`' + p.key + '` = ' + e.values[p.key] + (/^fallback/i.test((h.params || {})[p.key] || '') ? " (fallback only; the unit's own stat wins)" : ''); }).join(', ') + '.' + (ignored.length ? ' (' + ignored.join(', ') + ': not used; your game keeps its own.)' : ''), '');
      }
      L.push('**Where it goes** (by role; find these places in my game):', '');
      (h.steps || []).forEach(function (st, k) { L.push((k + 1) + '. *' + sub(st[0], e) + ':* ' + sub(st[1], e)); });
      if ((h.gotchas || []).length) { L.push('', '**Common mistakes** (symptom -> fix):', ''); h.gotchas.forEach(function (g) { L.push('- ' + sub(g, e)); }); }
      L.push('');
      per.push(L);
    });
    var wiring = [], wireChecks = [];
    ordered.forEach(function (a) { ordered.forEach(function (b) {
      if (b === a) return;
      var lines = [];
      Object.entries(H(a).wants || {}).forEach(function (kv) {
        var tag = kv[0], w = kv[1];
        if (!(H(b).offers || {})[tag]) return;
        lines.push('- **' + w.title + ':** ' + sub(offerText(H(b).offers[tag]), b) + ' ' + sub(w.text, a));
        if (w.check) wireChecks.push(w.check);
      });
      if (lines.length) wiring.push.apply(wiring, ['**' + a.json.name + ' with ' + b.json.name + ':**', ''].concat(lines, ['']));
    }); });
    var tail = [];
    if (wiring.length) tail.push.apply(tail, ['## Cross-element wiring', ''].concat(wiring));
    tail.push('## Merged acceptance checks (screenshot if you can; otherwise describe the trace)', '');
    var tagged = new Map(ordered.map(function (e) { return [e.id, []]; }));
    function tag(e, line) { tagged.get(e.id).push(line); return line; }
    ordered.forEach(function (e) { (H(e).checks || []).forEach(function (c) { tail.push(tag(e, '- [' + e.json.name + '] ' + sub(c, e))); }); });
    wireChecks.forEach(function (c) { tail.push('- [combined] ' + c); });
    tail.push("- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.", '');
    tail.push('## Self-check without a browser (report each)', '');
    tail.push('- Each module file is byte-identical to the one given: ' + ordered.map(function (e) { return '`' + jsName(e) + '` sha256 `' + sha(e).slice(0, 16) + '...`'; }).join(', ') + ' (`shasum -a 256`).');
    tail.push('- No function removed or renamed (compare name lists before/after).');
    tail.push('- Every identifier you call exists where called; each instance exists before first use.');
    ordered.forEach(function (e) { (H(e).selfcheck || []).forEach(function (c) { tail.push(tag(e, '- [' + e.json.name + '] ' + sub(c, e))); }); });
    tail.push('- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.');
    tail.push('- Say how each caller listed in step 1 still works.');
    tail.push('- Report which of my functions you changed for each element, and anything you could not do.', '');
    var allTagged = new Set([].concat.apply([], Array.from(tagged.values())));
    var sharedText = shared.concat(tail.filter(function (l) { return !allTagged.has(l); }));
    res.md = shared.concat([].concat.apply([], per), tail).join('\n');
    res.sharedWords = words(sharedText.join('\n'));
    res.overLimit = res.sharedWords > SHARED_WORD_LIMIT;
    res.files = moduleFiles(ordered);
    basketFiles(ordered, res.files);
    res.written = true; res.mode = 'generic'; res.order = ordered.map(function (e) { return e.id; });
    return res;

    function starterCombo() {
      var addons = elements.filter(function (e) { return e !== sys; }), SH = (sys.hint && sys.hint.starter) || {};
      function val(e, k) { return e.values[k]; }
      function fill(s, e, W) { return sub(String(s).replace(/\{\{sys\.(\w+)\}\}/g, function (m, k) { return SH[k] != null ? SH[k] : m; }).replace(/\{\{with\.(\w+)\}\}/g, function (m, k) { return W[k] != null ? W[k] : ''; }), e); }
      var name = SH.name || sys.json.name + ' starter';
      var L = [];
      L.push('# Add ' + listJoin(addons.map(function (e) { return e.json.name.toLowerCase(); })) + ' to ' + (/^the /i.test(name) ? '' : 'the ') + name + ' starter', '');
      L.push('`index.html` is a complete game built on the ' + sys.json.name.toLowerCase() + ' element; build on it. `index.README.md` documents its extension points. Add:', '');
      addons.forEach(function (e) { L.push('- `' + jsName(e) + '` (one global, `' + e.D.global + '`), API in `' + e.id + '.README.md`'); });
      L.push('', '## Rules', '');
      L.push('1. **Modules verbatim:** load each addon module ' + (SH.modules || 'with its own `<script src>` (or paste it unchanged) before the game script') + ". Never edit a module or the starter's own systems; add code only through the extension points.");
      L.push('2. **Register each addon** as one object: ' + (SH.register || 'see the starter README') + '.');
      var builtins = addons.map(function (e) { return e.hint && e.hint.addon && e.hint.addon.builtin; }).filter(function (b) { return b && SH.builtins && SH.builtins[b]; });
      L.push("3. **Turn off the starter's built-in equivalent** of each addon" + (builtins.length ? ': ' + builtins.map(function (b) { return SH.builtins[b]; }).join('; ') : ' (check its README flags)') + '; otherwise both draw.');
      L.push('4. **Keep everything working:** ' + (SH.keep || 'autoplay, URL parameters and shortcuts') + '. Addons advance only in the `update` hook (never on real time)' + (SH.freezeLimit ? '' : ', so `?t=` fast-forward shows them') + '; consume no game key.' + (SH.freezeLimit ? ' ' + SH.freezeLimit + '.' : ''));
      L.push('5. Keep the native resolution' + (elements.some(function (e) { return e.id === 'pixel-scaler'; }) ? ' (screen scaling is set by the pixel scaler addon)' : ' and integer scaling') + '; anything new you draw or name is original (no real game, character, place or brand names).', '');
      var checks = [], selfs = [];
      addons.forEach(function (e) {
        var A = (e.hint && e.hint.addon) || {}, W = (A.with && A.with[sys.id]) || {};
        Object.entries(W.params || {}).forEach(function (kv) { if (!explicit.has(e.id + '.' + kv[0])) e.values[kv[0]] = kv[1]; });
        L.push('## ' + e.json.name, '');
        L.push(e.json.oneLiner, '');
        var ps = (e.json.params || []).filter(function (p) { return ((e.hint && e.hint.params) || {})[p.key] !== 'IGNORE'; });
        if (ps.length) L.push('**Parameters:** ' + ps.map(function (p) { return '`' + p.key + '` = ' + val(e, p.key); }).join(', ') + '.', '');
        if (A.steps) { L.push('**Wiring** (one addon object):', ''); A.steps.forEach(function (st, k) { L.push((k + 1) + '. *' + fill(st[0], e, W) + ':* ' + fill(st[1], e, W)); }); }
        else L.push('Wire it through the extension points above; the API is in `' + e.id + '.README.md`.');
        if ((A.gotchas || []).length) { L.push('', '**Common mistakes:**', ''); A.gotchas.forEach(function (g) { L.push('- ' + fill(g, e, W)); }); }
        L.push('');
        (A.checks || (e.hint && e.hint.checks) || []).forEach(function (c) { checks.push('- [' + e.json.name + '] ' + fill(c, e, W)); });
        (A.selfcheck || []).forEach(function (c) { selfs.push('- [' + e.json.name + '] ' + fill(c, e, W)); });
      });
      L.push.apply(L, ['## Checks', ''].concat(checks));
      L.push('- ' + (SH.autoCheck || '`?auto=1` still plays a whole game to its end') + ', with the addons working on every relevant event' + (SH.freezeLimit ? '' : '; `?t=<ms>&freeze=1` shows them mid-game') + '; no built-in duplicates; no console errors.', '');
      L.push('## Self-check without a browser', '');
      L.push('- Each module file is byte-identical to the one given: ' + addons.map(function (e) { return '`' + jsName(e) + '` sha256 `' + sha(e).slice(0, 16) + '...`'; }).join(', ') + '.');
      L.push('- `node --check` your addon script (copy an inline script to a temp .js). Outside the registration slot, the starter is unchanged (diff it).');
      L.push.apply(L, selfs);
      L.push('- Trace one autoplay event from ' + (SH.traceFrom || "the starter's hit site") + ' through your addon hooks to the draw, and say which hooks you added.', '');
      res.md = L.join('\n');
      res.files = [{ name: 'index.html', path: 'elements/' + sys.id + '/' + sys.json.starter }];
      if (sys.D.starterReadmeExists) res.files.push({ name: 'index.README.md', path: 'elements/' + sys.id + '/' + sys.D.starterReadme });
      (sys.D.starterFiles || []).forEach(function (f) { res.files.push({ name: f, path: 'elements/' + sys.id + '/' + sys.json.starter.replace(/[^/]*$/, '') + f }); });   // element.json starterFiles (A-14 art/), as combine.mjs copies them
      res.files = res.files.concat(moduleFiles(addons));
      basketFiles([sys].concat(addons), res.files);
      res.written = true; res.mode = 'starter'; res.order = elements.map(function (e) { return e.id; });
      return res;
    }
  }
  var api = { run: run, CAPS: CAPS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GameDNACombine = api;
})(typeof self !== 'undefined' ? self : this);

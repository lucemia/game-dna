/* Basket page: items + per-element parameters, options, live compatibility check, COMBO.md generation, zip. */
(function () {
  var DNA = window.DNA, B = DNA.basket, $ = function (id) { return document.getElementById(id); }, esc = DNA.esc;
  var D = window.DNA_BASKET_DATA, ST = window.DNA_STYLES;
  var last = null, forced = false;
  function boot() {
    var h = B.fromHash(location.hash); if (h) B.set(h);
    B.onChange(function () { forced = false; render(); });
    render();
  }
  function S() { return B.get(); }
  function syncHash() { var h = B.toHash(S()); try { history.replaceState(null, '', location.pathname + (h ? '#' + h : '')); } catch (e) { } }
  function hasSystem(s) { return s.items.some(function (i) { return D.elements[i.id].json.kind === 'system'; }); }
  function sysOf(s) { var it = s.items.find(function (i) { return D.elements[i.id].json.kind === 'system'; }); return it ? D.elements[it.id] : null; }
  function cli(s, list) {
    var q = function (a) { return /[^\w.=\-\/,+]/.test(a) ? "'" + a.replace(/'/g, "'\\''") + "'" : a; };
    return 'node tools/combine.mjs ' + s.items.map(function (i) { return i.id; }).join(' ') + list.map(function (p) { return ' --param ' + q(p); }).join('') + (useStarter(s) ? ' --starter' : '') + (forced ? ' --force' : '');
  }
  function useStarter(s) { return !!(s.starter && hasSystem(s)); }
  function ctl(it, p) {
    var v = it.p && p.key in it.p ? it.p[p.key] : p.default, a = 'data-id="' + it.id + '" data-k="' + p.key + '" aria-label="' + esc(p.label) + '"';
    if (p.type === 'text') return '<input type="text" ' + a + ' value="' + esc(v) + '">';
    if (p.options) return '<select ' + a + '>' + p.options.map(function (o) { return '<option' + (String(o) === String(v) ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>';
    if (p.min != null && p.max != null) return '<input type="range" ' + a + ' min="' + p.min + '" max="' + p.max + '" step="' + (p.step || (p.type === 'int' ? 1 : 'any')) + '" value="' + v + '"><output>' + esc(v) + '</output>';
    return '<input type="number" ' + a + ' value="' + esc(v) + '">';
  }
  function render() {
    var s = S(); syncHash();
    var ul = $('bk-items');
    if (!s.items.length) {
      ul.innerHTML = '<li class="muted" style="font-size:14px">Empty. <a href="../dna/">Browse elements</a> or open a recommended kit: <a href="#e=grid-range-path,threat-range,combat-forecast,damage-numbers&starter=1" data-kit>Tactics map kit</a>.</li>';
    } else ul.innerHTML = s.items.map(function (it, k) {
      var e = DNA.BYID[it.id], J = D.elements[it.id].json, nc = Object.keys(it.p || {}).length;
      return '<li class="bitem" data-id="' + it.id + '" data-fam="' + e.fam + '" style="flex-wrap:wrap"><span class="code">' + e.code + '</span><span class="nm"><a href="../dna/' + e.id + '/">' + esc(e.name) + '</a><small>' + e.kind + ' · ' + J.interfaces.time + ' · ' + J.interfaces.coords + '</small></span>' +
        '<button class="rm" type="button" data-up="' + k + '" aria-label="Move up" title="Move up"' + (k ? '' : ' disabled') + '>↑</button><button class="rm" type="button" data-rm="' + it.id + '" aria-label="Remove ' + esc(e.name) + '">×</button>' +
        '<details style="flex-basis:100%;font-size:13px"><summary class="muted" style="cursor:pointer">Parameters' + (nc ? ' (' + nc + ' changed)' : '') + '</summary><div class="tbl-wrap" style="margin-top:8px"><table><tbody>' +
        (J.params || []).map(function (p) { return '<tr><td><code' + (it.p && p.key in it.p ? ' class="changed"' : '') + '>' + p.key + '</code></td><td class="ctl">' + ctl(it, p) + '</td></tr>'; }).join('') + '</tbody></table></div></details></li>';
    }).join('');
    $('bk-res').value = s.res || '';
    var sys = sysOf(s);
    $('bk-starter-row').hidden = !sys;
    $('bk-starter').checked = !!s.starter;
    if (sys) $('bk-starter-label').textContent = 'Start from the ' + sys.json.name.toLowerCase() + ' starter game';
    document.querySelectorAll('[data-style]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-style') === (s.style || '') ? 'true' : 'false'); });
    check();
  }
  function check() {
    var s = S(), ids = s.items.map(function (i) { return i.id; });
    var list = DNA.rawParams(s, D);
    $('bk-cli').textContent = ids.length ? '$ ' + cli(s, list) : '';
    if (!ids.length) { $('bk-sum').textContent = ''; $('bk-report').innerHTML = ''; $('bk-helix').innerHTML = DNA.helix([], { w: 520, h: 110 }); setOut(null); return; }
    var r = window.GameDNACombine.run(D, { ids: ids, params: list, starter: useStarter(s), checkOnly: true });
    var bad = {};
    r.report.forEach(function (x) { if (x.level === 'ERROR') ids.forEach(function (id) { if (x.msg.indexOf(id) >= 0) bad[id] = true; }); });
    $('bk-helix').innerHTML = DNA.helix(s.items.map(function (i) { return { fam: DNA.BYID[i.id].fam, broken: !!bad[i.id], label: DNA.BYID[i.id].name }; }), { w: 520, h: 110 });
    document.querySelectorAll('#bk-items .bitem').forEach(function (li) { li.classList.toggle('conflict', !!bad[li.getAttribute('data-id')]); });
    var hostN = r.report.filter(function (x) { return x.level !== 'ERROR' && /no element here provides it/.test(x.msg); }).length, layoutN = r.report.filter(function (x) { return x.level === 'WARN' && !/no element here provides it/.test(x.msg); }).length;
    var added = (r.added || []).map(function (x) { return '<span class="req">' + esc(DNA.BYID[x.id].code) + ' added: required by ' + esc(DNA.BYID[x.by].code) + '</span>'; }).join('');
    artPanel(r.ids || ids);
    $('bk-sum').innerHTML = added + (r.errors ? '<span class="e">' + r.errors + ' conflict' + (r.errors > 1 ? 's' : '') + ' (see above)</span>' : '<span class="o">Fits together</span>') + '<span>your game must provide ' + hostN + '</span>' + (layoutN ? '<span class="w">' + layoutN + ' layout note' + (layoutN > 1 ? 's' : '') + '</span>' : '') + (useStarter(s) ? '<span>starter basket</span>' : '');
    var showOk = $('bk-ok').checked, line = function (x) { return '<li class="' + x.level + '"><b>' + x.level + '</b><span>' + esc(x.msg) + '</span></li>'; };
    var host = r.report.filter(function (x) { return x.level !== 'ERROR' && /no element here provides it/.test(x.msg); });
    var rest = r.report.filter(function (x) { return host.indexOf(x) < 0 && x.level !== 'ERROR' && (showOk || x.level !== 'OK'); });
    var errsL = r.report.filter(function (x) { return x.level === 'ERROR'; });
    rest.sort(function (a, b) { var o = { ERROR: 0, WARN: 1, NOTE: 2, OK: 3 }; return o[a.level] - o[b.level]; });
    $('bk-report').innerHTML = (errsL.length ? '<li class="host"><details><summary class="errsum">' + errsL.length + ' conflict' + (errsL.length > 1 ? 's' : '') + ' (listed above, under Generate)</summary><ul class="report" style="margin-top:8px">' + errsL.map(line).join('') + '</ul></details></li>' : '') + rest.map(line).join('') +
      (host.length ? '<li class="host"><details><summary>Your game must provide (' + host.length + ')</summary><ul class="report" style="margin-top:8px">' + host.map(line).join('') + '</ul></details></li>' : '') ||
      '<li class="OK"><b>OK</b><span>No warnings. Tick "Show passing lines" for the full check.</span></li>';
    var eb = $('bk-errors'), errs = r.report.filter(function (x) { return x.level === 'ERROR'; });
    eb.hidden = !errs.length;
    if (errs.length) eb.innerHTML = '<b>' + errs.length + ' conflict' + (errs.length > 1 ? 's' : '') + ' to fix</b><ul>' + errs.map(function (x) { return '<li>' + esc(x.msg) + '</li>'; }).join('') + '</ul>' +
      '<div class="btn-row">' + Object.keys(bad).map(function (id) { return '<button class="btn sm" type="button" data-rm="' + id + '" title="Remove ' + esc(DNA.BYID[id].name) + '">Remove ' + DNA.BYID[id].code + '</button>'; }).join('') + '</div>';
    var gen = $('bk-gen');
    gen.textContent = r.twoSystems ? 'Two system elements: remove one' : r.errors ? 'Generate anyway (--force)' : 'Generate combined prompt';
    gen.disabled = !!r.twoSystems;
    if (last) setOut(null);
  }
  // generated-art (L family) elements: their sample packs are separate from COMBO.md; optional art/<id>/ folders in the zip
  function packs(ids) { return ids.filter(function (id) { return D.elements[id] && D.elements[id].pack; }); }
  function artPanel(ids) {
    var p = packs(ids), box = $('bk-art'); box.hidden = !p.length; if (!p.length) return;
    $('bk-art-names').textContent = p.map(function (id) { return DNA.BYID[id].code + ' ' + DNA.BYID[id].name; }).join(', ');
    var n = p.reduce(function (a, id) { var k = D.elements[id].pack; return a + k.files.filter(function (f) { return /\.(webp|png|jpe?g)$/i.test(f); }).length; }, 0), b = p.reduce(function (a, id) { return a + D.elements[id].pack.bytes; }, 0);
    $('bk-art-size').textContent = n + ' images, ' + Math.round(b / 1024) + ' KB' + (p.indexOf('cutout-characters') >= 0 ? ' with the L-10 rig files' : '');
  }
  // one note for the agent when sample packs ride along: each pack keeps its manifest's relative paths under art/<id>/
  var artIds = [];
  function artReadme() {
    if (!artIds.length) return [];
    return [{ name: 'art/README.md', data: '# Sample art packs\n\nEach generated-art element\'s sample pack is in its own folder, with its manifest (`assets.json`), its images at the paths the manifest lists, and its pack prompt (`prompt-pack.md`, or `prompt.md` where one prompt covers both layers):\n\n' +
      artIds.map(function (id) { return '- `art/' + id + '/`: ' + DNA.BYID[id].code + ' ' + DNA.BYID[id].name; }).join('\n') +
      '\n\nLoad each pack with its own base: `GameDNA_Assets.load(PACK, {base: \'art/<id>/\'})`. Where COMBO.md or a pack prompt says `base: \'art/\'`, use `art/<id>/` for that pack. Do not move or rename the images.\n' +
      (artIds.indexOf('cutout-characters') >= 0 ? '\nL-10 `art/cutout-characters/` also holds the rig (`pack.js`, `pack.json`); include `pack.js` and load it with `GameDNA_Cutout.load(window.GameDNA_CutoutPack, {base: \'art/cutout-characters/\'})`.\n' : '') }];
  }
  function stylePrefix(s) {
    var parts = [];
    if (s.style && ST[s.style]) parts.push(ST[s.style].prompt.trim());
    if (s.res) { var wh = s.res.split('x'); parts.push('Native resolution: ' + wh[0] + '×' + wh[1] + ' canvas, integer-scaled to the screen (square pixels, smoothing off).'); }
    return parts.join('\n\n');
  }
  function setOut(r) {
    last = r;
    $('bk-out').hidden = !r; $('bk-copy').disabled = !r; $('bk-zip').disabled = !r;
    var sp = r ? stylePrefix(S()) : '';
    $('bk-style-out').hidden = !sp; $('bk-style-pre').textContent = sp;
    if (r) { $('bk-pre').textContent = r.md; $('bk-words').textContent = r.md.length + ' bytes' + (r.mode === 'generic' ? ' · for a game the agent has not seen' : ' · builds on the starter game'); }
  }
  function generate() {
    var s = S(), ids = s.items.map(function (i) { return i.id; }); if (!ids.length) { DNA.toast('Add elements first'); return; }
    var pre = window.GameDNACombine.run(D, { ids: ids, params: DNA.rawParams(s, D), starter: useStarter(s), checkOnly: true });
    forced = !!pre.errors;
    var r = window.GameDNACombine.run(D, { ids: ids, params: DNA.rawParams(s, D), starter: useStarter(s), force: forced });
    $('bk-cli').textContent = '$ ' + cli(s, DNA.rawParams(s, D));
    if (!r.written) { DNA.toast('Nothing generated: ' + (r.twoSystems ? 'two system elements' : 'parameter errors')); return; }
    setOut(r);
    DNA.zip($('bk-helix').querySelector('svg'));
    $('bk-out').scrollIntoView({ behavior: DNA.reduced ? 'auto' : 'smooth', block: 'nearest' });
  }
  function zip() {
    if (!last) return;
    var s = S(), files = last.files.slice(), extra = [], sp = stylePrefix(s);
    if (s.style && ST[s.style]) { extra.push({ name: 'skins/skin-api.js', path: 'skins/skin-api.js' }, { name: 'skins/' + ST[s.style].file.split('/').pop(), path: ST[s.style].file }); }
    artIds = !$('bk-art').hidden && $('bk-art-zip').checked ? packs(last.order || []) : [];
    if (artIds.length) artIds.forEach(function (id) {
      var k = D.elements[id].pack, base = 'elements/' + id + '/';
      [k.manifest].concat(k.files, k.prompt ? [k.prompt] : []).forEach(function (f) { extra.push({ name: 'art/' + id + '/' + f.replace(/^assets\//, ''), path: base + f }); });
    });
    var all = files.concat(extra);
    Promise.all(all.map(function (f) { return fetch(DNA.ROOT + f.path).then(function (r) { if (!r.ok) throw new Error(f.path); return r.arrayBuffer(); }).then(function (b) { return { name: f.name, data: new Uint8Array(b) }; }); }))
      .then(function (got) {
        var list = [{ name: 'COMBO.md', data: last.md }].concat(sp ? [{ name: 'STYLE-PROMPT.md', data: sp + '\n' }] : [], got, artReadme());
        var blob = window.GameDNAZip.make(list), a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'game-dna-' + s.items.map(function (i) { return DNA.BYID[i.id].code; }).join('-') + '.zip';
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        DNA.toast('Zip with ' + list.length + ' files');
      }).catch(function (e) { DNA.toast('Zip failed: ' + e.message + ' (serve the repo root over http)'); });
  }
  document.addEventListener('click', function (e) {
    var rm = e.target.closest('#bk-items [data-rm], #bk-errors [data-rm]'); if (rm) { B.remove(rm.getAttribute('data-rm')); return; }
    var up = e.target.closest('#bk-items [data-up]'); if (up) { var s = S(), k = +up.getAttribute('data-up'); var t = s.items[k]; s.items[k] = s.items[k - 1]; s.items[k - 1] = t; B.set(s); return; }
    var st = e.target.closest('[data-style]'); if (st) { var s2 = S(); s2.style = st.getAttribute('data-style'); B.set(s2); return; }
    if (e.target.closest('[data-kit]')) { setTimeout(function () { var h = B.fromHash(location.hash); if (h) B.set(h); }, 0); }
  });
  document.addEventListener('change', function (e) {
    var i = e.target.closest('#bk-items [data-k]'); if (!i) return;
    var s = S(), it = s.items.find(function (x) { return x.id === i.getAttribute('data-id'); }), J = D.elements[it.id].json, p = J.params.find(function (q) { return q.key === i.getAttribute('data-k'); });
    it.p = it.p || {};
    if (String(i.value) === String(p.default) || i.value === '') delete it.p[p.key]; else it.p[p.key] = i.value;
    B.set(s);
  });
  document.addEventListener('input', function (e) { var i = e.target.closest('#bk-items input[type=range]'); if (i) { var o = i.parentNode.querySelector('output'); if (o) o.textContent = i.value; } });
  $('bk-res').addEventListener('change', function () { var s = S(); s.res = this.value; B.set(s); });
  $('bk-starter').addEventListener('change', function () { var s = S(); s.starter = this.checked; B.set(s); });
  $('bk-ok').addEventListener('change', check);
  $('bk-gen').addEventListener('click', generate);
  $('bk-copy').addEventListener('click', function () { if (last) { var sp = stylePrefix(S()); DNA.copy((sp ? sp + '\n\n---\n\n' : '') + last.md, 'Combined prompt'); } });
  $('bk-zip').addEventListener('click', zip);
  $('bk-share').addEventListener('click', function () { DNA.copy(location.href.split('#')[0] + '#' + B.toHash(S()), 'Share link'); });
  $('bk-clear').addEventListener('click', function () { B.set({ items: [], style: '', res: '', starter: false }); });
  window.addEventListener('hashchange', function () { var h = B.fromHash(location.hash); if (h) B.set(h); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

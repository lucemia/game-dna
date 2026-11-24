/* Element page: parameter controls -> prompt (same text as combine.mjs), demo URL and basket entry. */
(function () {
  var EL = window.DNA_EL, D = { elements: EL.data }, DNA = window.DNA;
  var inputs = [].slice.call(document.querySelectorAll('.ctl [data-k]'));
  var pre = document.getElementById('prompt-pre');
  var defaults = {}; EL.params.forEach(function (p) { defaults[p.key] = String(p.default); });
  function values() { var v = {}; inputs.forEach(function (i) { v[i.getAttribute('data-k')] = i.value; }); return v; }
  function changed() { var v = values(), o = {}; Object.keys(v).forEach(function (k) { if (String(v[k]) !== defaults[k] && v[k] !== '') o[k] = v[k]; }); return o; }
  DNA.currentParams = changed;
  function prompt() {
    var c = changed(), list = Object.keys(c).map(function (k) { return EL.id + '.' + k + '=' + c[k]; });
    var r = window.GameDNACombine.run(D, { ids: [EL.id], params: list });
    return r.written ? r.md : 'Parameter error: ' + r.report.filter(function (x) { return x.level === 'ERROR'; }).map(function (x) { return x.msg; }).join('; ');
  }
  function refresh() {
    inputs.forEach(function (i) {
      var o = i.parentNode.querySelector('output'); if (o) o.textContent = i.value;
      i.closest('tr').querySelector('td:first-child code').classList.toggle('changed', String(i.value) !== defaults[i.getAttribute('data-k')]);
    });
    pre.textContent = prompt();
    var open = document.getElementById('demo-open'); open.href = withQuery(open.getAttribute('data-base') || (open.setAttribute('data-base', open.getAttribute('href')), open.getAttribute('href')));
  }
  function withQuery(base) { var q = demoQuery(); return q ? base + (base.indexOf('?') >= 0 ? '&' : '?') + q.slice(1) : base; }
  function demoQuery() { var c = changed(), p = new URLSearchParams(); Object.keys(c).forEach(function (k) { p.set(k, c[k]); }); var s = p.toString(); return s ? '?' + s : ''; }
  function set(vals) { inputs.forEach(function (i) { var k = i.getAttribute('data-k'); i.value = k in vals ? vals[k] : defaults[k]; }); refresh(); }
  inputs.forEach(function (i) { i.addEventListener('input', refresh); i.addEventListener('change', refresh); });
  document.querySelectorAll('[data-variant]').forEach(function (b) { b.addEventListener('click', function () { set(JSON.parse(b.getAttribute('data-variant'))); if (frame) load(); }); });
  // start from the basket's values for this element, if it is in the basket
  var inB = DNA.basket.get().items.find(function (x) { return x.id === EL.id; });
  if (inB && Object.keys(inB.p || {}).length) set(inB.p); else refresh();
  // one-sentence template with a "Your game" placeholder: Copy = sentence + prompt
  var yg = document.getElementById('yg'), cyg = document.getElementById('copy-yg');
  if (cyg) cyg.addEventListener('click', function () {
    var name = (yg && yg.value.trim()) || 'my game';
    DNA.copy(cyg.getAttribute('data-sentence').replace('{game}', name) + '\n\n' + prompt(), 'Sentence + prompt');
  });
  if (yg) { var fit = function () { yg.size = Math.max(9, Math.min(28, (yg.value || yg.placeholder).length + 1)); }; yg.addEventListener('input', fit); fit(); }
  ['copy-prompt', 'copy-prompt-2'].forEach(function (id) { var b = document.getElementById(id); if (b) b.addEventListener('click', function () { DNA.copy(prompt(), 'Prompt'); }); });
  // demo: load on click
  var box = document.querySelector('.demo-box'), start = box.querySelector('.start'), frame = null, src = start.getAttribute('data-src');
  function load() {
    if (!frame) {
      frame = document.createElement('iframe'); frame.title = 'Interactive demo'; box.innerHTML = ''; box.classList.add('loaded'); box.appendChild(frame);
      var note = document.getElementById('demo-long');
      DNA.autoHeight(frame, 0, function (clipped, h) { if (note) { note.hidden = !clipped; note.querySelector('b').textContent = Math.round(h / 100) * 100 + ' px'; } });
    }
    frame.src = withQuery(src);
  }
  start.addEventListener('click', load);
  // long demos: lift the frame's height cap, or open the demo (with the current parameters) in a new tab
  var full = document.getElementById('demo-full');
  if (full) full.addEventListener('click', function () { if (!frame) return; frame.dataset.full = '1'; frame._fit && frame._fit(); document.getElementById('demo-long').hidden = true; });
  document.querySelectorAll('[data-open-demo]').forEach(function (a) { a.addEventListener('click', function (ev) { ev.preventDefault(); window.open(document.getElementById('demo-open').href, '_blank', 'noopener'); }); });
  // A-D moments: a plain click loads that frozen moment into the demo above (modifier clicks open a new tab)
  document.querySelectorAll('[data-moment]').forEach(function (a) {
    a.addEventListener('click', function (ev) {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button) return;
      ev.preventDefault(); load(); frame.src = a.getAttribute('data-moment');
      box.scrollIntoView({ behavior: DNA.reduced ? 'auto' : 'smooth', block: 'start' });
    });
  });
  // generated-art elements: the sample pack as a zip (assets.json, images, prompt-pack.md), built in the browser
  var pz = document.getElementById('pack-zip');
  if (pz) pz.addEventListener('click', function () {
    var id = pz.getAttribute('data-pack'), k = EL.data[id].pack, base = DNA.ROOT + 'elements/' + id + '/';
    var list = [k.manifest].concat(k.files, k.prompt ? [k.prompt] : []);
    pz.disabled = true;
    Promise.all(list.map(function (f) { return fetch(base + f).then(function (r) { if (!r.ok) throw new Error(f); return r.arrayBuffer(); }).then(function (b) { return { name: id + '-pack/' + f.replace(/^assets\//, ''), data: new Uint8Array(b) }; }); }))
      .then(function (got) {
        var a = document.createElement('a'); a.href = URL.createObjectURL(window.GameDNAZip.make(got)); a.download = 'game-dna-' + EL.code + '-art-pack.zip';
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        DNA.toast('Art pack: ' + got.length + ' files');
      }).catch(function (e) { DNA.toast('Zip failed: ' + e.message + ' (serve the repo root over http)'); })
      .then(function () { pz.disabled = false; });
  });
  document.getElementById('demo-apply').addEventListener('click', function () { load(); box.scrollIntoView({ behavior: DNA.reduced ? 'auto' : 'smooth', block: 'start' }); });
})();

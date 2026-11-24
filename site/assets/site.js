/* Game DNA site runtime: theme, basket state + drawer + helix, add/copy buttons, hover loops, hero. No dependencies. */
(function () {
  'use strict';
  var H = document.documentElement;
  var SITE = H.getAttribute('data-site') || './';   // relative path to site/
  var ROOT = H.getAttribute('data-root') || '../';  // relative path to the repo root
  var CAT = window.DNA_CATALOG || { elements: [], styles: [] };
  var BYID = {}; CAT.elements.forEach(function (e) { BYID[e.id] = e; });
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DNA = window.DNA = { SITE: SITE, ROOT: ROOT, CAT: CAT, BYID: BYID, reduced: reduced };

  // ---------- storage (never required) ----------
  function sget(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }

  // ---------- theme ----------
  var saved = sget('gamedna.theme'); if (saved) H.setAttribute('data-theme', saved);
  function themeNow() { var t = H.getAttribute('data-theme'); if (t) return t; return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('.theme-btn'); if (!b) return;
    var t = themeNow() === 'dark' ? 'light' : 'dark'; H.setAttribute('data-theme', t); sset('gamedna.theme', t);
  });

  // ---------- toast + clipboard ----------
  var toastEl;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { toastEl.classList.remove('show'); }, 1800);
  }
  // text: string or Promise<string>. A promise keeps the click's user activation (ClipboardItem) where supported.
  function copy(text, label) {
    var done = function () { toast((label || 'Copied') + ' to clipboard'); };
    var fail = function () { toast('Copy failed: select the text and copy it by hand'); };
    try {
      if (typeof text !== 'string' && window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        var blob = Promise.resolve(text).then(function (t) { return new Blob([t], { type: 'text/plain' }); });
        return navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]).then(done, function () { return Promise.resolve(text).then(fallback); });
      }
      return Promise.resolve(text).then(function (t) { return navigator.clipboard.writeText(t).then(done, function () { fallback(t); }); });
    } catch (e) { return Promise.resolve(text).then(fallback); }
    function fallback(t) {
      var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? done() : fail(); } catch (e) { fail(); } ta.remove();
    }
  }
  function fetchText(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.text(); }); }
  DNA.copy = copy; DNA.toast = toast; DNA.fetchText = fetchText;

  // ---------- lazy scripts ----------
  var loaded = {};
  function loadScript(src) {
    if (!loaded[src]) loaded[src] = new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    return loaded[src];
  }
  DNA.loadCore = function () { return Promise.all([loadScript(SITE + 'assets/combine-core.js'), loadScript(SITE + 'assets/basket-data.js')]).then(function () { return window.DNA_BASKET_DATA; }); };

  // ---------- basket state ----------
  // {items: [{id, p: {key: value}}], style: '' | slug, res: '' | 'WxH', starter: bool}
  function emptyState() { return { items: [], style: '', res: '', starter: false }; }
  function readState() {
    try { var s = JSON.parse(sget('gamedna.basket') || 'null'); if (s && Array.isArray(s.items)) return clean(s); } catch (e) { }
    return emptyState();
  }
  function clean(s) {
    var o = emptyState(); o.style = s.style || ''; o.res = s.res || ''; o.starter = !!s.starter;
    (s.items || []).forEach(function (it) { if (it && BYID[it.id] && !o.items.some(function (x) { return x.id === it.id; })) o.items.push({ id: it.id, p: it.p || {} }); });
    return o;
  }
  var state = readState();
  var listeners = [];
  function save() { sset('gamedna.basket', JSON.stringify(state)); listeners.forEach(function (f) { f(state); }); renderFab(); syncAddButtons(); }
  DNA.basket = {
    get: function () { return state; },
    set: function (s) { state = clean(s); save(); },
    has: function (id) { return state.items.some(function (x) { return x.id === id; }); },
    add: function (id, p) {
      if (!BYID[id]) return; var it = state.items.find(function (x) { return x.id === id; });
      if (it) { if (p) it.p = p; save(); return; }
      // element.json `requires` (same rule as combine.mjs): a missing requirement goes in just before the element
      var req = (BYID[id].requires || []).filter(function (r) { return BYID[r] && !state.items.some(function (x) { return x.id === r; }); });
      req.forEach(function (r) { state.items.push({ id: r, p: {} }); });
      state.items.push({ id: id, p: p || {} }); save();
      if (req.length) setTimeout(function () { toast('Also added ' + req.map(function (r) { return BYID[r].code + ' ' + BYID[r].name; }).join(', ') + ' (required by ' + BYID[id].code + ')'); }, 700);
    },
    remove: function (id) {
      state.items = state.items.filter(function (x) { return x.id !== id; }); save();
      var need = state.items.filter(function (x) { return (BYID[x.id].requires || []).indexOf(id) >= 0; });
      if (need.length) toast(BYID[id].code + ' is required by ' + need.map(function (x) { return BYID[x.id].code; }).join(', ') + ': the prompt and zip still include it');
    },
    clear: function () { state.items = []; save(); },
    onChange: function (f) { listeners.push(f); },
    toHash: toHash, fromHash: fromHash
  };
  // hash: e=a,b&p=a.key=v;b.key=v&style=flat&res=256x224&starter=1
  function toHash(s) {
    var parts = [];
    if (s.items.length) parts.push('e=' + s.items.map(function (i) { return i.id; }).join(','));
    var ps = [];
    s.items.forEach(function (i) { Object.keys(i.p || {}).forEach(function (k) { ps.push(encodeURIComponent(i.id + '.' + k + '=' + i.p[k])); }); });
    if (ps.length) parts.push('p=' + ps.join(';'));
    if (s.style) parts.push('style=' + s.style);
    if (s.res) parts.push('res=' + s.res);
    if (s.starter) parts.push('starter=1');
    return parts.join('&');
  }
  function fromHash(h) {
    var s = emptyState(), q = {};
    String(h || '').replace(/^#/, '').split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) q[kv.slice(0, i)] = kv.slice(i + 1); });
    if (!q.e) return null;
    q.e.split(',').forEach(function (id) { if (BYID[id]) s.items.push({ id: id, p: {} }); });
    (q.p || '').split(';').filter(Boolean).forEach(function (raw) {
      var t = decodeURIComponent(raw), m = t.match(/^([\w-]+)\.(\w+)=(.*)$/); if (!m) return;
      var it = s.items.find(function (x) { return x.id === m[1]; }); if (it) it.p[m[2]] = m[3];
    });
    s.style = q.style || ''; s.res = q.res || ''; s.starter = q.starter === '1';
    return clean(s);
  }

  // ---------- helix (SVG) ----------
  // pairs: [{fam, broken, label}] ; returns svg markup
  DNA.helix = function (pairs, opt) {
    opt = opt || {};
    var n = Math.max(pairs.length, opt.min || 4), W = opt.w || 360, Hh = opt.h || 90, pad = 14, amp = Hh / 2 - 10, mid = Hh / 2;
    var step = (W - pad * 2) / Math.max(n - 1, 1), k = Math.PI * 0.8 / step;   // 0.8 half-turns per pair: pairs never sit on a crossing
    function y(x, ph) { return mid + amp * Math.sin((x - pad) * k + ph + Math.PI / 2); }
    function path(ph) { var d = ''; for (var x = pad; x <= W - pad + 0.1; x += 4) d += (d ? 'L' : 'M') + x.toFixed(1) + ' ' + y(x, ph).toFixed(1); return d; }
    var s = '<svg class="helix" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="' + (opt.label || 'Basket as a double helix') + '">';
    s += '<path class="strand" d="' + path(0) + '"/><path class="strand" d="' + path(Math.PI) + '"/>';
    pairs.forEach(function (p, i) {
      var x = pad + i * step, y1 = y(x, 0), y2 = y(x, Math.PI), col = 'var(--fam-' + p.fam + ')';
      if (p.broken) {
        var m1 = y1 + (y2 - y1) * 0.38, m2 = y1 + (y2 - y1) * 0.62;
        s += '<g class="pair" data-i="' + i + '"><line class="bp" x1="' + x + '" y1="' + y1.toFixed(1) + '" x2="' + (x - 2) + '" y2="' + m1.toFixed(1) + '" stroke="' + col + '"/>' +
          '<line class="bp" x1="' + (x + 2) + '" y1="' + m2.toFixed(1) + '" x2="' + x + '" y2="' + y2.toFixed(1) + '" stroke="' + col + '"/>' +
          '<path d="M' + (x - 5) + ' ' + ((m1 + m2) / 2 - 4).toFixed(1) + 'l10 8M' + (x + 5) + ' ' + ((m1 + m2) / 2 - 4).toFixed(1) + 'l-10 8" stroke="var(--err)" stroke-width="2"/>' +
          '<title>' + esc(p.label || '') + ' (conflict)</title></g>';
      } else {
        s += '<g class="pair" data-i="' + i + '"><line class="bp" x1="' + x + '" y1="' + y1.toFixed(1) + '" x2="' + x + '" y2="' + y2.toFixed(1) + '" stroke="' + col + '"/>' +
          '<circle cx="' + x + '" cy="' + y1.toFixed(1) + '" r="3.5" fill="' + col + '"/><circle cx="' + x + '" cy="' + y2.toFixed(1) + '" r="3.5" fill="' + col + '"/><title>' + esc(p.label || '') + '</title></g>';
      }
    });
    for (var j = pairs.length; j < n; j++) {
      var xx = pad + j * step;
      s += '<line x1="' + xx + '" y1="' + y(xx, 0).toFixed(1) + '" x2="' + xx + '" y2="' + y(xx, Math.PI).toFixed(1) + '" stroke="var(--line)" stroke-width="2" stroke-dasharray="2 4"/>';
    }
    return s + '</svg>';
  };
  // the helix "zips" once from left to right (0.6 s)
  DNA.zip = function (svg) {
    if (!svg || reduced) return;
    var gs = svg.querySelectorAll('.pair'), n = gs.length || 1;
    gs.forEach(function (g, i) { g.style.animationDelay = Math.round((600 - 240) * i / Math.max(n - 1, 1)) + 'ms'; });
    svg.classList.remove('zipping'); void svg.getBoundingClientRect(); svg.classList.add('zipping');
  };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  DNA.esc = esc;

  // ---------- conflicts (needs basket data, loaded lazily) ----------
  DNA.check = function (s) {
    return DNA.loadCore().then(function (D) {
      var ids = s.items.map(function (i) { return i.id; });
      var res = window.GameDNACombine.run(D, { ids: ids, params: DNA.rawParams(s, D), starter: s.starter && ids.some(function (id) { return D.elements[id].json.kind === 'system'; }), checkOnly: true });
      var bad = {};
      res.report.forEach(function (r) { if (r.level === 'ERROR') ids.forEach(function (id) { if (r.msg.indexOf(id) >= 0) bad[id] = true; }); });
      res.bad = bad; return res;
    });
  };
  // basket -> combine.mjs --param list (scoped, so the CLI command is unambiguous)
  DNA.rawParams = function (s, D) {
    var out = [];
    s.items.forEach(function (it) {
      var json = D.elements[it.id].json;
      (json.params || []).forEach(function (p) {
        if (p.key === 'res' && s.res && !(p.key in (it.p || {}))) { if (p.options && p.options.indexOf(s.res) >= 0 && s.res !== String(p.default)) out.push(it.id + '.res=' + s.res); return; }
        if (it.p && p.key in it.p && String(it.p[p.key]) !== String(p.default)) out.push(it.id + '.' + p.key + '=' + it.p[p.key]);
      });
    });
    return out;
  };

  // ---------- floating basket button + drawer ----------
  var fab, drawer, scrim;
  function buildDrawer() {
    fab = document.createElement('button'); fab.className = 'basket-fab'; fab.type = 'button'; fab.setAttribute('aria-haspopup', 'dialog');
    document.body.appendChild(fab);
    scrim = document.createElement('div'); scrim.className = 'scrim'; document.body.appendChild(scrim);
    drawer = document.createElement('aside'); drawer.className = 'drawer'; drawer.setAttribute('role', 'dialog'); drawer.setAttribute('aria-label', 'DNA basket'); drawer.setAttribute('aria-modal', 'true');
    drawer.innerHTML = '<header><h2>DNA basket</h2><button class="btn sm ghost x" type="button" aria-label="Close basket">Close</button></header><div class="content"></div>';
    document.body.appendChild(drawer);
    fab.addEventListener('click', openDrawer);
    scrim.addEventListener('click', closeDrawer);
    drawer.querySelector('.x').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer(); });
    drawer.addEventListener('click', function (e) {
      var rm = e.target.closest('[data-rm]'); if (rm) { DNA.basket.remove(rm.getAttribute('data-rm')); }
      if (e.target.closest('[data-clear]')) DNA.basket.clear();
    });
    renderFab();
  }
  function renderFab() {
    if (!fab) return;
    var n = state.items.length;
    fab.innerHTML = DNA.helix(state.items.slice(0, 6).map(function (i) { return { fam: BYID[i.id].fam }; }), { w: 92, h: 56, min: 4, label: '' }) +
      '<span class="lbl">DNA basket (<span class="n">' + n + '</span>)</span><span class="badge' + (n ? '' : ' zero') + '" aria-hidden="true">' + n + '</span>';
    fab.classList.toggle('empty', !n);   // phones: an empty basket button stays out of the way (it covered hero text)
    fab.title = 'DNA basket (' + n + ')'; fab.setAttribute('aria-label', 'DNA basket, ' + n + ' element' + (n === 1 ? '' : 's'));
    if (drawer && drawer.classList.contains('open')) renderDrawer();
  }
  function openDrawer() { drawer.classList.add('open'); scrim.classList.add('open'); renderDrawer(); drawer.querySelector('.x').focus(); }
  function closeDrawer() { drawer.classList.remove('open'); scrim.classList.remove('open'); fab.focus(); }
  function renderDrawer() {
    var c = drawer.querySelector('.content'), s = state;
    if (!s.items.length) {
      c.innerHTML = '<p class="muted">Your basket is empty. Add elements with the orange <b>Add</b> buttons; the basket merges them into one prompt and checks that they fit together.</p><p><a class="btn" href="' + SITE + 'dna/">Browse all elements</a></p>';
      return;
    }
    var pairs = s.items.map(function (i) { return { fam: BYID[i.id].fam, label: BYID[i.id].code + ' ' + BYID[i.id].name }; });
    c.innerHTML = '<div class="hx">' + DNA.helix(pairs, { w: 380, h: 96 }) + '</div><div class="check-sum muted">Checking compatibility...</div>' +
      '<ul class="bitems">' + s.items.map(function (i) {
        var e = BYID[i.id];
        return '<li class="bitem" data-id="' + e.id + '" data-fam="' + e.fam + '"><span class="code">' + e.code + '</span><span class="nm"><a href="' + SITE + 'dna/' + e.id + '/">' + esc(e.name) + '</a><small>' + e.kind + (Object.keys(i.p || {}).length ? ' · ' + Object.keys(i.p).length + ' custom' : '') + '</small></span><button class="rm" type="button" data-rm="' + e.id + '" aria-label="Remove ' + esc(e.name) + '">×</button></li>';
      }).join('') + '</ul>' +
      '<div class="btn-row"><a class="btn primary" href="' + SITE + 'basket/#' + toHash(s) + '">Open basket &amp; generate prompt</a><button class="btn ghost sm" type="button" data-clear>Clear</button></div>';
    DNA.check(s).then(function (res) {
      if (!drawer.classList.contains('open')) return;
      var sum = c.querySelector('.check-sum');
      if (sum) sum.innerHTML = res.errors ? '<span class="e">' + res.errors + ' conflict' + (res.errors > 1 ? 's' : '') + '</span>' : '<span class="o">Fits together</span><span>' + res.report.filter(function (x) { return x.level !== 'ERROR' && /no element here provides it/.test(x.msg); }).length + ' things your game must provide</span>';
      var hx = c.querySelector('.hx');
      if (hx) hx.innerHTML = DNA.helix(s.items.map(function (i) { return { fam: BYID[i.id].fam, broken: !!res.bad[i.id], label: BYID[i.id].name }; }), { w: 380, h: 96 });
      c.querySelectorAll('.bitem').forEach(function (li) { li.classList.toggle('conflict', !!res.bad[li.getAttribute('data-id')]); });
    }).catch(function () { var sum = c.querySelector('.check-sum'); if (sum) sum.textContent = 'Compatibility check needs the page served over http (python3 -m http.server).'; });
  }

  // ---------- add buttons (+ fly animation) ----------
  function syncAddButtons() {
    document.querySelectorAll('[data-add]').forEach(function (b) {
      var on = DNA.basket.has(b.getAttribute('data-add'));
      b.classList.toggle('added', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
      var lab = b.querySelector('.lab'); if (lab) lab.textContent = on ? (b.getAttribute('data-on') || 'In basket') : (b.getAttribute('data-off') || 'Add');
    });
  }
  function fly(from, fam) {
    if (reduced || !fab) return;
    var a = from.getBoundingClientRect(), b = fab.getBoundingClientRect();
    var dot = document.createElement('div'); dot.className = 'flydot'; dot.setAttribute('data-fam', fam);
    dot.style.left = (a.left + a.width / 2 - 7) + 'px'; dot.style.top = (a.top + a.height / 2 - 7) + 'px'; document.body.appendChild(dot);
    var dx = b.left + 30 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    var an = dot.animate([{ transform: 'translate(0,0) scale(1.6)' }, { transform: 'translate(' + dx * 0.5 + 'px,' + (dy * 0.5 - 90) + 'px) scale(1.1)', offset: 0.5 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.5)', opacity: 0.6 }],
      { duration: 650, easing: 'cubic-bezier(.5,0,.4,1)' });
    an.onfinish = function () { dot.remove(); fab.classList.remove('bump'); void fab.offsetWidth; fab.classList.add('bump'); };
  }
  DNA.fly = fly;
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-add]');
    if (b) {
      var id = b.getAttribute('data-add');
      if (DNA.basket.has(id) && !b.hasAttribute('data-params')) { DNA.basket.remove(id); toast('Removed from basket'); }
      else {
        var p = b.hasAttribute('data-params') && DNA.currentParams ? DNA.currentParams() : null;
        fly(b, BYID[id] ? BYID[id].fam : 'A'); DNA.basket.add(id, p); toast(BYID[id].name + (p ? ' (with your settings)' : '') + ' added');
      }
      return;
    }
    var cp = ev.target.closest('[data-copy-prompt]');
    if (cp) { var pid = cp.getAttribute('data-copy-prompt'); copy(fetchText(SITE + 'dna/' + pid + '/prompt.md'), 'Prompt'); return; }
    var cu = ev.target.closest('[data-copy-url]');
    if (cu) { copy(fetchText(cu.getAttribute('data-copy-url')), cu.getAttribute('data-label') || 'Text'); return; }
    var cm = ev.target.closest('[data-copy-md]');
    if (cm) { copy(fetchText(cm.getAttribute('data-copy-md') || 'index.md'), 'Page markdown'); return; }
    var ct = ev.target.closest('[data-copy-target]');
    if (ct) { var t = document.querySelector(ct.getAttribute('data-copy-target')); if (t) copy(t.textContent, ct.getAttribute('data-label') || 'Text'); return; }
    var us = ev.target.closest('[data-use-style]');
    if (us) { var st = DNA.basket.get(); st.style = us.getAttribute('data-use-style'); DNA.basket.set(st); toast('Style set for your basket: ' + us.getAttribute('data-name')); return; }
  });

  // ---------- frames: integer-scaled, cropped to the action; hover (or auto) loops ----------
  // [data-fit]: one frame centred at the largest integer scale that fits.
  // [data-strip]: fills its box at the smallest integer scale that covers it, cropped around (data-fx, data-fy) in native px.
  function fitFrame(box) {
    var f = box.querySelector('.frame'); if (!f) return;
    var w = +f.getAttribute('data-w'), h = +f.getAttribute('data-h');
    var bw = box.clientWidth - 16, bh = box.clientHeight - 16, max = +(box.getAttribute('data-max') || 8);
    var k = Math.max(1, Math.min(max, Math.floor(bw / w), Math.floor(bh / h)));
    f.style.width = w * k + 'px'; f.style.height = h * k + 'px';
  }
  function layoutStrip(box, i, useStrip) {
    var f = box.querySelector('.frame'), w = +box.getAttribute('data-w'), h = +box.getAttribute('data-h'), n = +box.getAttribute('data-n');
    var bw = box.clientWidth, bh = box.clientHeight; if (!bw || !bh) return;
    // HD frames (data-hd, 480 px wide, smooth art): fractional cover scale instead of whole-pixel steps
    // data-k="contain": the whole frame, letterboxed (cards whose UI text must not be cut at the edges)
    var k = box.getAttribute('data-k') === 'contain' ? Math.min(bw / w, bh / h) : box.hasAttribute('data-hd') ? Math.max(bw / w, bh / h) : +box.getAttribute('data-k') || Math.max(1, Math.min(3, Math.ceil(Math.max(bw / w, bh / h) - 0.02)));
    var fx = +(box.getAttribute('data-fx') || w / 2), fy = +(box.getAttribute('data-fy') || h / 2);
    var ox = Math.round(Math.max(0, Math.min(w * k - bw, fx * k - bw / 2))), oy = Math.round(Math.max(0, Math.min(h * k - bh, fy * k - bh / 2)));
    // a frame narrower or shorter than its box gets exactly w*k x h*k (centred), so a strip never shows its neighbours
    var nw = w * k < bw, nh = h * k < bh, px = nw ? 0 : -ox, py = nh ? 0 : -oy;
    f.style.width = nw ? w * k + 'px' : '100%'; f.style.height = nh ? h * k + 'px' : '100%'; f.style.margin = 'auto'; f.style.overflow = 'hidden';
    if (useStrip) { f.style.backgroundImage = 'url("' + box.getAttribute('data-strip') + '")'; f.style.backgroundSize = (n * w * k) + 'px ' + (h * k) + 'px'; f.style.backgroundPosition = (px - i * w * k) + 'px ' + py + 'px'; }
    else { f.style.backgroundImage = 'url("' + box.getAttribute('data-poster') + '")'; f.style.backgroundSize = (w * k) + 'px ' + (h * k) + 'px'; f.style.backgroundPosition = px + 'px ' + py + 'px'; }
  }
  function setupThumbs() {
    var all = [].slice.call(document.querySelectorAll('[data-strip]'));
    all.forEach(function (box) {
      var n = +box.getAttribute('data-n'), timer = null, i = 0, auto = box.hasAttribute('data-auto'), seen = false;
      layoutStrip(box, 0, false);
      function tick() { layoutStrip(box, i, true); i = (i + 1) % n; }
      function start() { if (reduced || timer || n < 2) return; i = 0; tick(); timer = setInterval(tick, 150); }
      function stop() { if (!timer) return; clearInterval(timer); timer = null; layoutStrip(box, 0, false); }
      box._relayout = function () { if (timer) layoutStrip(box, (i + n - 1) % n, true); else layoutStrip(box, 0, false); };
      if (auto) {
        if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { if (es[0].isIntersecting) start(); else stop(); }).observe(box);
        else start();
        return;
      }
      var card = box.closest('.card') || box;
      card.addEventListener('mouseenter', start); card.addEventListener('mouseleave', stop);
      card.addEventListener('focusin', start); card.addEventListener('focusout', function (e) { if (!card.contains(e.relatedTarget)) stop(); });
    });
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { all.forEach(function (b) { b._relayout && b._relayout(); }); document.querySelectorAll('[data-fit]').forEach(fitFrame); }, 120); });
    document.querySelectorAll('[data-fit]').forEach(fitFrame);
  }
  DNA.fitFrame = fitFrame;
  // second crossfade image of a style card loads on first hover
  document.addEventListener('mouseover', function (e) { var x = e.target.closest && e.target.closest('.style-card'); if (!x) return; x.querySelectorAll('img[data-src]').forEach(function (i) { if (i.hasAttribute('data-srcset')) { i.srcset = i.getAttribute('data-srcset'); i.removeAttribute('data-srcset'); } i.src = i.getAttribute('data-src'); i.removeAttribute('data-src'); }); });
  document.addEventListener('focusin', function (e) { var x = e.target.closest && e.target.closest('.style-card'); if (!x) return; x.querySelectorAll('img[data-src]').forEach(function (i) { i.src = i.getAttribute('data-src'); i.removeAttribute('data-src'); }); });
  // an iframe of one of our pages (same origin) grows to its content: no scroll inside the page scroll
  // iframe grows to its content up to a cap (on phones 80% of the viewport height, at least 440 px, so the page around it stays
  // reachable; 4000 px on wide screens); a longer demo scrolls inside its frame and onClip(true) lets the page say so (the iframe
  // must not carry scrolling="no"). f.dataset.full = '1' lifts the cap (the "show it at full height" link); DNA.refit(f) re-measures.
  DNA.autoHeight = function (f, max, onClip) {
    function cap() { return f.dataset.full ? 1e6 : max || (window.innerWidth < 700 ? Math.max(440, Math.round(window.innerHeight * 0.8)) : 4000); }
    f._fit = function () { fit(); };
    function fit() { try { var d = f.contentDocument; if (!d || !d.body) return; var h = Math.max(d.documentElement.scrollHeight, d.body.scrollHeight), c = cap(); f.style.height = Math.min(c, h) + 'px'; if (onClip) onClip(h > c, h); } catch (e) { } }
    f.addEventListener('load', function () { fit(); try { new ResizeObserver(fit).observe(f.contentDocument.body); } catch (e) { } setTimeout(fit, 600); setTimeout(fit, 2000); });
    window.addEventListener('resize', function () { setTimeout(fit, 200); });
  };

  // ---------- home hero: captured loops of the newest elements (site/assets/hero/<id>.webp, one strip of n frames), in turn ----------
  // The first poster is in the HTML; a slide shows its poster at once and starts the loop when its strip has loaded. Two layers
  // crossfade; the box keeps a fixed 16:9 size, so nothing moves around it. Paused off screen and in background tabs.
  function setupHero() {
    var hero = document.querySelector('[data-hero]'); if (!hero) return;
    var list = JSON.parse(hero.getAttribute('data-hero')); if (!list.length) return;
    var screen = hero.querySelector('.hero-screen'), layers = hero.querySelectorAll('.hero-loop'), cap = hero.querySelector('.hero-caption'), dots = hero.querySelector('.hero-dots');
    var DUR = 6500, idx = 0, cur = 0, slideT = null, tick = null, visible = true, loaded = {};
    var base = SITE + 'assets/hero/';
    [].forEach.call(dots.children, function (d) { d.style.setProperty('--dur', (reduced ? 0 : DUR) + 'ms'); });
    dots.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; show([].indexOf.call(dots.children, b)); });
    function strip(it, cb) {
      if (loaded[it.id]) return cb();
      var im = new Image(); im.onload = function () { loaded[it.id] = true; cb(); }; im.src = base + it.id + '.webp';
    }
    function play(layer, it) {
      clearInterval(tick); tick = null;
      if (reduced) return;
      strip(it, function () {
        if (list[idx] !== it) return;
        var k = it.n >> 1;
        layer.style.backgroundImage = 'url("' + base + it.id + '.webp")'; layer.style.backgroundSize = (it.n * 100) + '% 100%';
        var step = function () { layer.style.backgroundPosition = (k / (it.n - 1) * 100) + '% 0'; k = (k + 1) % it.n; };
        step(); clearInterval(tick); tick = setInterval(function () { if (visible && !document.hidden) step(); }, it.step || 120);
      });
    }
    function show(i) {
      idx = (i + list.length) % list.length; var it = list[idx];
      var next = layers[1 - cur];
      next.style.backgroundImage = 'url("' + base + it.id + '-poster.webp")'; next.style.backgroundSize = '100% 100%'; next.style.backgroundPosition = '0 0';
      next.classList.add('on'); layers[cur].classList.remove('on'); cur = 1 - cur;
      [].forEach.call(dots.children, function (d, j) { d.setAttribute('aria-current', j === idx ? 'true' : 'false'); d.style.animation = 'none'; void d.offsetWidth; d.style.animation = ''; });
      cap.setAttribute('data-fam', it.fam);
      cap.innerHTML = '<span class="code" data-fam="' + it.fam + '">' + it.code + '</span><span class="grow"><a class="name" href="' + SITE + 'dna/' + it.id + '/">' + esc(it.name) + '</a><span class="muted line">' + esc(it.line) + '</span></span>' +
        '<button class="btn primary sm" type="button" data-add="' + it.id + '" data-off="Add to basket" data-on="In basket"><span class="lab">Add to basket</span></button>';
      syncAddButtons();
      play(next, it);
      var after = list[(idx + 1) % list.length]; (new Image()).src = base + after.id + '-poster.webp';   // the next poster is ready before its turn
      clearTimeout(slideT); slideT = null;
      if (!reduced) slideT = setTimeout(function () { slideT = null; if (visible && !document.hidden) show(idx + 1); }, DUR);
    }
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible && !slideT && !reduced) slideT = setTimeout(function () { slideT = null; show(idx + 1); }, DUR); }).observe(screen);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && !slideT && visible && !reduced) slideT = setTimeout(function () { slideT = null; show(idx + 1); }, DUR); });
    layers[0].classList.add('on'); cur = 0; play(layers[0], list[0]);
    if (!reduced) slideT = setTimeout(function () { slideT = null; if (visible && !document.hidden) show(1); }, DUR);
  }

  // ---------- shell motion: each card's family bar draws in and its specimen code lights up when it scrolls into view ----------
  function setupReveal() {
    var cards = document.querySelectorAll('.card'); if (!cards.length || reduced || !('IntersectionObserver' in window)) return;
    H.classList.add('js-reveal');
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { var c = en.target, d = (+c.getAttribute('data-ri') || 0) % 3; setTimeout(function () { c.classList.add('lit'); }, d * 90); io.unobserve(c); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    [].forEach.call(cards, function (c, i) { c.setAttribute('data-ri', i); io.observe(c); });
  }

  // ---------- page markdown button ----------
  document.addEventListener('DOMContentLoaded', function () {
    buildDrawer(); syncAddButtons(); setupThumbs(); setupHero(); setupReveal();
    window.addEventListener('storage', function (e) { if (e.key === 'gamedna.basket') { state = readState(); renderFab(); syncAddButtons(); } });
  });
})();

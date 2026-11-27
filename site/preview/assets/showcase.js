/* Game DNA showcase (prototype) runtime: loop thumbnails, hero rotation, gallery filter, kit tabs, typing prompt, copy
   buttons, demo frame sizing, scroll reveal. No dependencies. Source: tools/showcase/showcase.js -> site/preview/assets/. */
(function () {
  'use strict';
  var H = document.documentElement; H.classList.add('js');
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var touch = window.matchMedia && matchMedia('(hover: none)').matches;
  var hasIO = 'IntersectionObserver' in window;

  // ---------- toast + copy ----------
  var toastEl;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.setAttribute('role', 'status');
      toastEl.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(20px);opacity:0;transition:all .3s;z-index:90;padding:12px 18px;border-radius:999px;background:#f3f3f6;color:#08090d;font:600 14px/1 Inter,system-ui,sans-serif;box-shadow:0 20px 40px -10px rgba(0,0,0,.6);max-width:calc(100vw - 32px)';
      document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.style.opacity = '1'; toastEl.style.transform = 'translateX(-50%)';
    clearTimeout(toast.t); toast.t = setTimeout(function () { toastEl.style.opacity = '0'; toastEl.style.transform = 'translateX(-50%) translateY(20px)'; }, 1900);
  }
  function fetchText(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(url); return r.text(); }); }
  function copy(textP, label, btn) {
    var done = function () { toast(label + ' copied: paste it to your agent'); if (btn) { btn.classList.add('done'); setTimeout(function () { btn.classList.remove('done'); }, 1400); } };
    var fail = function () { toast('Copy failed: open the file and copy it by hand'); };
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        var blob = textP.then(function (t) { return new Blob([t], { type: 'text/plain' }); });
        return navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]).then(done, function () { return textP.then(fallback); });
      }
    } catch (e) { }
    textP.then(function (t) { return navigator.clipboard ? navigator.clipboard.writeText(t).then(done, function () { fallback(t); }) : fallback(t); }, fail);
    function fallback(t) { var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? done() : fail(); } catch (e) { fail(); } ta.remove(); }
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-copy-url]'); if (!b) return;
    copy(fetchText(b.getAttribute('data-copy-url')), b.getAttribute('data-label') || 'Text', b);
  });

  // ---------- loop thumbnails (frames/<id>.webp strips): poster when near view, loop on hover / in view ----------
  // same crop rule as the main site (site.js layoutStrip): HD frames cover, pixel frames at a whole-pixel scale around the focal point
  function layout(box, i, strip) {
    var f = box.firstElementChild, w = +box.getAttribute('data-w'), h = +box.getAttribute('data-h'), n = +box.getAttribute('data-n');
    var bw = box.clientWidth, bh = box.clientHeight; if (!bw || !bh) return;
    var k = box.getAttribute('data-k') === 'contain' ? Math.min(bw / w, bh / h) : box.hasAttribute('data-hd') ? Math.max(bw / w, bh / h) : +box.getAttribute('data-k') || Math.max(1, Math.ceil(Math.max(bw / w, bh / h) - 0.02));
    var fx = +(box.getAttribute('data-fx') || w / 2), fy = +(box.getAttribute('data-fy') || h / 2);
    var ox = Math.round(Math.max(0, Math.min(w * k - bw, fx * k - bw / 2))), oy = Math.round(Math.max(0, Math.min(h * k - bh, fy * k - bh / 2)));
    var nw = w * k < bw, nh = h * k < bh, px = nw ? 0 : -ox, py = nh ? 0 : -oy;
    f.style.width = nw ? w * k + 'px' : '100%'; f.style.height = nh ? h * k + 'px' : '100%'; f.style.margin = 'auto';
    if (strip) { f.style.backgroundImage = 'url("' + box.getAttribute('data-strip') + '")'; f.style.backgroundSize = (n * w * k) + 'px ' + (h * k) + 'px'; f.style.backgroundPosition = (px - i * w * k) + 'px ' + py + 'px'; }
    else { f.style.backgroundImage = 'url("' + box.getAttribute('data-poster') + '")'; f.style.backgroundSize = (w * k) + 'px ' + (h * k) + 'px'; f.style.backgroundPosition = px + 'px ' + py + 'px'; }
  }
  var boxes = [].slice.call(document.querySelectorAll('.sc-thumb[data-strip]'));
  boxes.forEach(function (box) {
    var n = +box.getAttribute('data-n'), i = 0, timer = null, ready = false, inView = false, loaded = false;
    var auto = box.hasAttribute('data-auto') || touch;
    function poster() { ready = true; layout(box, 0, false); }
    function tick() { layout(box, i, true); i = (i + 1) % n; }
    function start() { if (reduced || timer || n < 2) return;
      if (!loaded) { var im = new Image(); im.onload = function () { loaded = true; if (wanted) go(); }; im.src = box.getAttribute('data-strip'); wanted = true; return; }
      go(); }
    var wanted = false;
    function go() { if (timer) return; i = Math.floor(n / 2); tick(); timer = setInterval(function () { if (!document.hidden) tick(); }, 140); }
    function stop() { wanted = false; if (!timer) return; clearInterval(timer); timer = null; layout(box, 0, false); }
    box._re = function () { if (!ready) return; timer ? layout(box, (i + n - 1) % n, true) : layout(box, 0, false); };
    if (hasIO) {
      new IntersectionObserver(function (es) { if (es[0].isIntersecting && !ready) poster(); }, { rootMargin: '400px 0px' }).observe(box);
      if (auto) new IntersectionObserver(function (es) { inView = es[0].isIntersecting; if (inView) start(); else stop(); }, { threshold: touch ? 0.85 : 0.35 }).observe(box);
    } else { poster(); if (auto) start(); }
    var host = box.closest('a') || box;
    if (!touch && !box.hasAttribute('data-auto')) {
      host.addEventListener('mouseenter', function () { if (!ready) poster(); start(); });
      host.addEventListener('mouseleave', stop);
      host.addEventListener('focus', function () { if (!ready) poster(); start(); });
      host.addEventListener('blur', stop);
    }
  });
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { boxes.forEach(function (b) { b._re && b._re(); }); }, 120); });

  // ---------- hero: hero/<id>.webp strips in turn, crossfading; glow follows the element's family colour ----------
  (function () {
    var hero = document.querySelector('[data-hero]'); if (!hero) return;
    var list = JSON.parse(hero.getAttribute('data-hero')); if (!list.length) return;
    var layers = hero.querySelectorAll('.sc-loop'), cap = hero.querySelector('.sc-hero-cap'), dots = hero.querySelector('.sc-hero-dots');
    var base = layers[0].style.backgroundImage.replace(/^url\(["']?/, '').replace(/[^/]+-poster\.webp["']?\)$/, '');
    var DUR = 6500, idx = 0, cur = 0, tick = null, slideT = null, visible = true, loaded = {};
    [].forEach.call(dots.children, function (d) { d.style.setProperty('--dur', DUR + 'ms'); });
    dots.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) show([].indexOf.call(dots.children, b)); });
    function play(layer, it) {
      clearInterval(tick); tick = null; if (reduced) return;
      var go = function () { if (list[idx] !== it) return; var k = it.n >> 1;
        layer.style.backgroundImage = 'url("' + base + it.id + '.webp")'; layer.style.backgroundSize = (it.n * 100) + '% 100%';
        var step = function () { layer.style.backgroundPosition = (k / (it.n - 1) * 100) + '% 0'; k = (k + 1) % it.n; };
        step(); tick = setInterval(function () { if (visible && !document.hidden) step(); }, it.step || 120); };
      if (loaded[it.id]) return go();
      fetchStrip(it, go);
    }
    // one request per strip; a failed strip keeps its poster and is not waited for
    var pending = {};
    function fetchStrip(it, cb) {
      if (loaded[it.id]) return cb && cb();
      (pending[it.id] = pending[it.id] || []).push(cb);
      if (pending[it.id].length > 1) return;
      var im = new Image();
      im.onload = function () { loaded[it.id] = true; var q = pending[it.id]; pending[it.id] = null; q.forEach(function (f) { f && f(); }); };
      im.onerror = function () { loaded[it.id] = 'err'; pending[it.id] = null; };
      im.src = base + it.id + '.webp';
    }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function show(i) {
      idx = (i + list.length) % list.length; var it = list[idx], next = layers[1 - cur];
      next.style.backgroundImage = 'url("' + base + it.id + '-poster.webp")'; next.style.backgroundSize = '100% 100%'; next.style.backgroundPosition = '0 0';
      next.classList.add('on'); layers[cur].classList.remove('on'); cur = 1 - cur;
      hero.style.setProperty('--glow', 'var(--fam-' + it.fam + ')');
      [].forEach.call(dots.children, function (d, j) { d.setAttribute('aria-current', j === idx ? 'true' : 'false'); });
      cap.innerHTML = '<span class="sc-hero-dot" data-fam="' + it.fam + '"></span><span class="sc-hero-txt"><a class="sc-hero-name" href="' + it.href + '">' + esc(it.name) + '</a><span class="sc-hero-line">' + esc(it.line) + '</span></span>' +
        '<a class="sc-btn sm" href="' + it.href + '">' + (it.play ? 'Play' : 'Open') + ' <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 8h10m-4-4 4 4-4 4"/></svg></a>';
      cap.classList.remove('swap'); void cap.offsetWidth; cap.classList.add('swap');
      play(next, it);
      var nx = list[(idx + 1) % list.length]; (new Image()).src = base + nx.id + '-poster.webp';
      if (!reduced && loaded[it.id]) fetchStrip(nx);   // the next loop downloads while this one plays
      held = 0; schedule();
    }
    // a slide whose loop is still downloading stays up (at most two more periods) instead of rotating past it as a still
    var held = 0;
    function schedule() { clearTimeout(slideT); slideT = null; if (!reduced) slideT = setTimeout(function () { slideT = null;
      if (!visible || document.hidden) return schedule();
      if (!loaded[list[idx].id] && held < 2) { held++; return schedule(); }
      show(idx + 1); }, DUR); }
    if (hasIO) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(hero);
    layers[0].classList.add('on'); play(layers[0], list[0]); schedule();
    fetchStrip(list[0], function () { if (!reduced && list.length > 1) fetchStrip(list[1]); });
  })();

  // ---------- gallery filter ----------
  (function () {
    var chips = document.querySelectorAll('[data-filter]'), cards = [].slice.call(document.querySelectorAll('#sc-grid .sc-card')); if (!chips.length) return;
    function apply(v) {
      var shown = cards.filter(function (c) { var ok = v === 'all' || (v === 'feat' ? c.hasAttribute('data-feat') : c.getAttribute('data-cat') === v); c.hidden = !ok; return ok; });
      if (v === 'feat') shown.sort(function (a, b) { return a.getAttribute('data-feat') - b.getAttribute('data-feat'); }).forEach(function (c) { c.parentNode.appendChild(c); });
      shown.forEach(function (c) { c.classList.add('in'); });
      boxes.forEach(function (b) { b._re && b._re(); });
    }
    chips.forEach(function (c) { c.addEventListener('click', function () { chips.forEach(function (x) { x.setAttribute('aria-pressed', x === c ? 'true' : 'false'); }); apply(c.getAttribute('data-filter')); }); });
    apply('feat');
  })();

  // ---------- kit tabs ----------
  (function () {
    var tabs = [].slice.call(document.querySelectorAll('.sc-tab')); if (!tabs.length) return;
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        tabs.forEach(function (x) { var on = x === t; x.setAttribute('aria-selected', on ? 'true' : 'false'); var p = document.getElementById(x.getAttribute('aria-controls')); if (p) p.hidden = !on; });
        var p = document.getElementById(t.getAttribute('aria-controls'));
        if (p) { var c = p.cloneNode(true); p.parentNode.replaceChild(c, p); }   // restart the entrance + helix animation (thumbs re-bound below)
        bindKitThumbs();
      });
    });
    function bindKitThumbs() {
      document.querySelectorAll('.sc-kit:not([hidden]) .sc-thumb[data-strip]').forEach(function (box) {
        if (box._bound) return; box._bound = true;
        var n = +box.getAttribute('data-n'), i = n >> 1, f = box.firstElementChild;
        layout(box, 0, false); if (reduced) return;
        var im = new Image(); im.onload = function () { var t = setInterval(function () { if (!box.isConnected || box.closest('[hidden]')) { clearInterval(t); return; } if (!document.hidden) { layout(box, i, true); i = (i + 1) % n; } }, 140); }; im.src = box.getAttribute('data-strip');
      });
    }
  })();

  // ---------- typing prompt ----------
  document.querySelectorAll('.sc-typing').forEach(function (pre) {
    var full = pre.getAttribute('data-type') || pre.textContent; if (reduced) return;
    pre.textContent = ''; var caret = document.createElement('span'); caret.className = 'caret';
    var txt = document.createTextNode(''); pre.appendChild(txt); pre.appendChild(caret);
    var started = false;
    function run() { if (started) return; started = true; var k = 0;
      (function step() { k += 2 + (Math.random() * 3 | 0); txt.nodeValue = full.slice(0, k); if (k < full.length) setTimeout(step, 18); else setTimeout(function () { k = 0; started = false; txt.nodeValue = ''; run(); }, 4200); })(); }
    if (hasIO) new IntersectionObserver(function (es) { if (es[0].isIntersecting) run(); }, { threshold: 0.4 }).observe(pre); else run();
  });

  // ---------- prompt fold ----------
  document.querySelectorAll('[data-fold]').forEach(function (box) {
    var b = box.querySelector('.sc-fold-btn'); if (!b) return;
    b.addEventListener('click', function () { var o = box.classList.toggle('open'); b.setAttribute('aria-expanded', o ? 'true' : 'false'); b.textContent = o ? 'Show less' : 'Show the whole prompt'; });
  });

  // ---------- framed demos (showcase mode): trim, then size the frame to the demo's whole content ----------
  // data-embed = selectors to hide inside the demo (its own header, internal notes); element codes are scrubbed from its
  // text and .code tags hidden, so no code reaches a first-time visitor. The frame takes the full content height: the
  // page scrolls, never a scroll area inside it, and on phones the controls follow the game directly.
  var CODE = /\s*\(\s*[A-N]-\d{2}\s*\)|\b[A-N]-\d{2}\b\s*(·\s*)?/g;
  // developer text left in demo sidebars: URL switches, debug hooks, review notes, version strings
  var DEV = /\?t=|[?&](freeze|auto|log|scene|script)=|\bfreeze=1\b|\buiRects\b|\bprobe\b|\bjudge\b|\bcritic\b|\bcold[- ]test|\bsha256\b|\bv\d+\.\d+(\.\d+)?\b|\bmodule v\d|\bplaycheck\b|\bwindow\.__|\bimage_gen\b|\bgpt-\d|ms\/frame|\bcpu [\d.]+ ?ms/i;
  var DEV_PAREN = new RegExp('\\s*\\([^()]*(' + DEV.source + ')[^()]*\\)', 'gi');   // "(uiRects -> uiMask)" asides go, the label stays
  var CTRL = 'button, input, select, textarea, canvas, svg, video, a[href], [role="button"], [role="radio"], [role="slider"]';
  window.SC_DEV = DEV;
  // vh units and innerHeight inside the frame are pinned to the base height the demo loaded at, so a frame that grows to
  // its content cannot feed back into a layout sized in viewport units
  function freezeVH(d, B) {
    var w = d.defaultView; if (w.__scFrozen) return; w.__scFrozen = B;
    var px = function (v) { return v.replace(/(-?[\d.]+)[dsl]?vh\b/g, function (m, n) { return (n * B / 100).toFixed(2) + 'px'; }); };
    function walk(rules) { [].forEach.call(rules || [], function (r) {
      if (r.style) for (var i = 0; i < r.style.length; i++) { var pn = r.style[i], v = r.style.getPropertyValue(pn); if (/vh\b/.test(v)) r.style.setProperty(pn, px(v), r.style.getPropertyPriority(pn)); }
      if (r.cssRules) walk(r.cssRules); }); }
    [].forEach.call(d.styleSheets, function (sh) { try { walk(sh.cssRules); } catch (e) { } });
    [].forEach.call(d.querySelectorAll('[style*="vh"]'), function (el) { el.setAttribute('style', px(el.getAttribute('style'))); });
    try { Object.defineProperty(w, 'innerHeight', { configurable: true, get: function () { return B; } }); } catch (e) { }
  }
  function hideDev(d) {
    var w = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT, null), n, hits = [];
    while ((n = w.nextNode())) { if (/^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName) || !DEV.test(n.nodeValue)) continue;
      var v = n.nodeValue.replace(DEV_PAREN, ''); if (v !== n.nodeValue) n.nodeValue = v;
      if (DEV.test(n.nodeValue)) hits.push(n); }
    // readouts split over several nodes ("cpu <b>5.9 ms</b>/frame"): small blocks whose whole text matches
    [].forEach.call(d.body.querySelectorAll('div, p, span, small, li, dd, figcaption'), function (el) {
      if (el.style.display === 'none' || el.querySelector(CTRL) || [].some.call(el.children, function (c) { return !/^(B|I|EM|STRONG|SPAN|CODE|KBD|SMALL)$/.test(c.nodeName); })) return;
      var tx = el.textContent; if (tx.length < 300 && DEV.test(tx)) el.style.setProperty('display', 'none', 'important');
    });
    hits.forEach(function (t) {   // hide the smallest block around the text that holds no control
      var el = t.parentNode, best = null;
      while (el && el !== d.body) { if (el.querySelector && el.querySelector(CTRL) || /^(BUTTON|LABEL|OPTION|SELECT)$/.test(el.nodeName)) break; best = el; var disp = d.defaultView.getComputedStyle(el).display; if (disp !== 'inline' && disp !== 'contents') break; el = el.parentNode; }
      if (best) best.style.setProperty('display', 'none', 'important');
    });
  }
  function scrubText(n) { CODE.lastIndex = 0; if (!CODE.test(n.nodeValue)) return; CODE.lastIndex = 0;
    n.nodeValue = n.nodeValue.replace(CODE, function (m) { return /^\s/.test(m) ? ' ' : ''; }).replace(/\(\s*:?\s*/g, '(').replace(/\bfrom\s*:\s*/g, ''); CODE.lastIndex = 0; }
  function scrubNode(n) {
    if (n.nodeType === 3) { if (!/^(SCRIPT|STYLE|TEXTAREA)$/.test(n.parentNode && n.parentNode.nodeName)) scrubText(n); return; }
    if (n.nodeType !== 1 || /^(SCRIPT|STYLE|TEXTAREA)$/.test(n.nodeName)) return;
    var w = n.ownerDocument.createTreeWalker(n, NodeFilter.SHOW_TEXT, null), x; while ((x = w.nextNode())) scrubText(x);
  }
  function scrub(d) {
    if (!d || !d.body || !d.defaultView) return;   // the timer can fire after the frame navigated (a moment click)
    var w = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT, { acceptNode: function (n) { var p = n.parentNode && n.parentNode.nodeName; return /^(SCRIPT|STYLE|TEXTAREA)$/.test(p) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; } }), n;
    while ((n = w.nextNode())) { CODE.lastIndex = 0; if (CODE.test(n.nodeValue)) { CODE.lastIndex = 0; n.nodeValue = n.nodeValue.replace(CODE, function (m) { return /^\s/.test(m) ? ' ' : ''; }).replace(/\(\s*:?\s*/g, '(').replace(/\bfrom\s*:\s*/g, ''); } }
    CODE.lastIndex = 0;
    hideDev(d);
  }
  // a demo's own title (the element name the page already shows above the frame) and the long description under it
  function hideTitle(d, name) {
    if (!name) return; var key = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 2).join(' ');
    [].forEach.call(d.querySelectorAll('h1, h2'), function (h) {
      var t = h.textContent.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); if (!key || t.indexOf(key) !== 0 || h.closest('button, label')) return;
      var box = h.parentNode, hideBox = box && box !== d.body && box.children.length <= 3 && !box.querySelector(CTRL) && box.textContent.length < 900;
      (hideBox ? box : h).style.setProperty('display', 'none', 'important');
      var nx = h.nextElementSibling; if (!hideBox && nx && /^(P|DIV)$/.test(nx.nodeName) && !nx.querySelector(CTRL) && nx.textContent.length > 60) nx.style.setProperty('display', 'none', 'important');
    });
  }
  function trim(f) {
    try {
      var d = f.contentDocument; if (!d || !d.body) return;
      freezeVH(d, f.__base || 720);
      var st = d.getElementById('sc-embed-style');
      if (!st) { st = d.createElement('style'); st.id = 'sc-embed-style'; d.head.appendChild(st); }
      st.textContent = (f.getAttribute('data-embed') ? f.getAttribute('data-embed') + ', ' : '') + '.code { display: none !important; } html, body { overflow-y: hidden !important; }';
      hideTitle(d, f.getAttribute('data-name'));
      scrub(d);
      // demos rewrite readouts every frame (stats lines, tips): keep scrubbing what they write
      if (!d.__scMO) { var t = null; d.__scMO = new d.defaultView.MutationObserver(function (ms) {   // codes go before the next paint; dev text on a short timer
          ms.forEach(function (m) { var ns = m.type === 'characterData' ? [m.target] : [].slice.call(m.addedNodes); ns.forEach(function (n) { scrubNode(n); }); });
          if (!t) t = setTimeout(function () { t = null; scrub(d); }, 120); });
        d.__scMO.observe(d.body, { subtree: true, childList: true, characterData: true }); }
    } catch (e) { }
  }
  // audio demos: the demo's own sound switch sits in its hidden header; this button presses it from the page on a click
  document.querySelectorAll('[data-sound]').forEach(function (btn) {
    var f = btn.closest('.sc-demo').querySelector('.sc-demo-frame'), sel = btn.getAttribute('data-sound');
    function label() { try { var t = (f.contentDocument.querySelector(sel) || {}).textContent || ''; var on = /^\s*Sound on/i.test(t);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false'); btn.querySelector('.lab').textContent = on ? 'Sound on' : 'Turn sound on'; } catch (e) { } }
    btn.addEventListener('click', function () { try { var el = f.contentDocument.querySelector(sel); if (el) el.click(); } catch (e) { } setTimeout(label, 250); setTimeout(label, 900); });
    f.addEventListener('load', function () { setTimeout(label, 300); });
  });
  document.querySelectorAll('.sc-demo-frame').forEach(function (f) {
    var ro = null, busy = 0, rt2 = null;
    function base() { return window.innerWidth < 700 ? 760 : 720; }
    // content height, measured with the frame at a fixed base height so a demo laid out in vh units cannot feed back
    // into it (scrollHeight never drops below the frame's own height, so the lowest visible child is used instead)
    function measure(d) {
      var w = d.defaultView, cs = w.getComputedStyle(d.body), h = 0;
      [].forEach.call(d.body.children, function (c) { if (c.nodeName === 'SCRIPT' || c.nodeName === 'STYLE') return; var r = c.getBoundingClientRect(); if (r.height) h = Math.max(h, r.bottom + w.scrollY + parseFloat(w.getComputedStyle(c).marginBottom || 0)); });
      return h + parseFloat(cs.paddingBottom || 0) + parseFloat(cs.marginBottom || 0) + parseFloat(cs.borderBottomWidth || 0);
    }
    function fit() {
      if (busy) return; busy = 1;
      try { var d = f.contentDocument; if (d && d.body) {
        f.style.height = base() + 'px'; var h = measure(d);
        f.style.height = Math.ceil(Math.min(12000, Math.max(h > 50 ? h + 24 : base(), 320))) + "px";   // +24: margins the measure misses
      } else f.style.height = base() + 'px'; } catch (e) { f.style.height = base() + 'px'; }
      setTimeout(function () { busy = 0; }, 250);
    }
    function soon() { clearTimeout(rt2); rt2 = setTimeout(fit, 200); }
    function onload() {
      f.__base = base(); f.style.height = f.__base + 'px';
      trim(f); fit(); setTimeout(function () { trim(f); fit(); }, 600); setTimeout(fit, 2000); setTimeout(fit, 4000); setTimeout(fit, 7000);
      try { if (ro) ro.disconnect(); ro = new ResizeObserver(function () { if (!busy) soon(); }); ro.observe(f.contentDocument.body); } catch (e) { }
    }
    fit();
    f.addEventListener('load', onload);
    try { var d0 = f.contentDocument; if (d0 && d0.readyState === 'complete' && d0.location.href !== 'about:blank') onload(); } catch (e) { }   // loaded before this script ran
    window.addEventListener('resize', soon);
  });
  // Full screen: the framed demo itself (still trimmed); moments replay in the frame above instead of a raw new tab
  document.addEventListener('click', function (ev) {
    var fs = ev.target.closest('[data-fullscreen]');
    if (fs) { var fr = fs.closest('.sc-demo').querySelector('iframe'); if (fr && fr.requestFullscreen) fr.requestFullscreen().catch(function () { }); else if (fr) window.open(fr.src, '_blank'); return; }
    var mo = ev.target.closest('[data-moment]');
    if (mo) { var fr2 = document.querySelector('.sc-demo-frame'); if (!fr2) return; ev.preventDefault(); fr2.src = mo.getAttribute('href'); fr2.closest('.sc-demo').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); }
  });

  // ---------- basket store (localStorage, never required) + add buttons + header count ----------
  var BK_KEY = 'gamedna.sc-basket';
  function bkGet() { try { var v = JSON.parse(localStorage.getItem(BK_KEY) || 'null'); if (v && v.ids) return v; } catch (e) { } return { ids: [], starter: false, style: '' }; }
  var bk = bkGet(), bkListeners = [];
  function bkSave() { try { localStorage.setItem(BK_KEY, JSON.stringify(bk)); } catch (e) { } bkSync(); bkListeners.forEach(function (f) { f(); }); }
  function bkSync() {
    document.querySelectorAll('[data-bk-count]').forEach(function (b) { b.textContent = bk.ids.length; b.hidden = !bk.ids.length; });
    document.querySelectorAll('[data-sc-add]').forEach(function (b) { var on = bk.ids.indexOf(b.getAttribute('data-sc-add')) >= 0; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); var l = b.querySelector('.lab'); if (l) l.textContent = on ? 'In your basket' : 'Add to basket'; });
  }
  function bkToggle(id, reqAttr) {
    var i = bk.ids.indexOf(id);
    if (i >= 0) { bk.ids.splice(i, 1); toast('Removed from your basket'); }
    else { var req = (window.SC_EL && SC_EL[id] && SC_EL[id].req) || (reqAttr ? reqAttr.split(',') : []), added = [];
      req.forEach(function (r) { if (bk.ids.indexOf(r) < 0) { bk.ids.push(r); added.push(r); } }); bk.ids.push(id);
      toast(added.length ? 'Added, with the element it needs' : 'Added to your basket'); }
    bkSave();
  }
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest('[data-sc-add]'); if (a) { bkToggle(a.getAttribute('data-sc-add'), a.getAttribute('data-req')); return; }
    var st = ev.target.closest('[data-sc-style]'); if (st) { bk.style = st.getAttribute('data-sc-style'); bkSave(); toast('Style set for your basket: ' + st.getAttribute('data-name')); }
  });
  window.addEventListener('storage', function (e) { if (e.key === BK_KEY) { bk = bkGet(); bkSync(); bkListeners.forEach(function (f) { f(); }); } });
  bkSync();

  // ---------- basket page ----------
  (function () {
    var root = document.getElementById('sc-basket'); if (!root || !window.GameDNACombine || !window.DNA_BASKET_DATA) return;
    var D = window.DNA_BASKET_DATA, EL = window.SC_EL, ST = window.DNA_STYLES || {}, $ = function (i) { return document.getElementById(i); }, last = null;
    var NAME = {}; Object.keys(D.elements).forEach(function (id) { var j = D.elements[id].json; NAME[j.code] = j.name; });
    // the combine engine writes element names in lower case in the heading ("# Add dynamic 2d lights ..."): show them as named
    function properNames(md, ns) { var L = md.split('\n'); for (var i = 0; i < Math.min(L.length, 6); i++) ns.forEach(function (n) { L[i] = L[i].split(n.toLowerCase()).join(n); }); return L.join('\n'); }
    function plain(t) { return String(t || '').replace(/\b[A-N]-\d{2}\b/g, function (m) { return NAME[m] || m; }); }
    // the hash (#e=a,b&starter=1, as the kits link) replaces the stored basket
    var q = {}; location.hash.replace(/^#/, '').split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
    if (q.e) { bk.ids = q.e.split(',').filter(function (id) { return EL[id]; }); bk.starter = q.starter === '1'; bkSave(); }
    function system() { return bk.ids.filter(function (id) { return EL[id].k === 'system'; })[0]; }
    function reason(m) {
      if (/both system elements/.test(m)) return 'both are complete game systems; a basket holds one';
      if (/own the same system/.test(m)) return 'they do the same job; pick one';
      if (/^time:/.test(m)) return 'one runs turn by turn, the other on a running clock';
      if (/^coords:/.test(m)) return 'they need different views of the world';
      if (/starter-only/.test(m)) return 'it needs the ready-made game of a system element';
      if (/--starter/.test(m)) return 'there is no ready-made game to start from';
      return 'they cannot be combined as they are';
    }
    function names(m) { return bk.ids.filter(function (id) { return m.indexOf(id) >= 0; }).map(function (id) { return EL[id].n; }); }
    function render() {
      var sys = system(); if (!sys) bk.starter = false;
      $('bk-empty').hidden = !!bk.ids.length;
      [].slice.call($('bk-tray').querySelectorAll('.sc-bk-item')).forEach(function (x) { x.remove(); });
      bk.ids.forEach(function (id) {
        var it = document.createElement('div'); it.className = 'sc-bk-item'; it.setAttribute('data-fam', EL[id].f);
        it.innerHTML = '<span class="sc-dot"></span><a href="../dna/' + id + '/">' + EL[id].n.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</a><button type="button" data-sc-add="' + id + '" aria-label="Remove">×</button>';
        $('bk-tray').appendChild(it);
      });
      $('bk-helix').innerHTML = bk.ids.length ? helix(bk.ids.map(function (id) { return EL[id].f; })) : '';
      $('bk-starter-row').hidden = !sys; if (sys) { $('bk-starter-name').textContent = EL[sys].n.toLowerCase(); $('bk-starter').checked = !!bk.starter; }
      $('bk-style').value = bk.style || '';
      var chk = $('bk-check'); chk.className = 'sc-bk-check';
      if (!bk.ids.length) { chk.textContent = ''; } else {
        var r = GameDNACombine.run(D, { ids: bk.ids, starter: !!(bk.starter && sys), checkOnly: true });
        var errs = r.report.filter(function (x) { return x.level === 'ERROR'; });
        if (!errs.length) { chk.textContent = bk.ids.length + (bk.ids.length > 1 ? ' elements that fit together' : ' element, ready'); chk.classList.add('ok'); }
        else { chk.textContent = errs.map(function (x) { var n = names(x.msg); return (n.length ? n.join(' and ') + ': ' : '') + reason(x.msg) + '.'; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' '); chk.classList.add('bad'); }
      }
      $('bk-gen').disabled = !bk.ids.length;
      if (last && last.key !== key()) { last = null; $('bk-out').hidden = true; $('bk-copy').disabled = $('bk-zip').disabled = true; }
      bkSync();
    }
    function key() { return bk.ids.join(',') + '|' + !!bk.starter + '|' + (bk.style || ''); }
    function helix(fams) {
      var W = 380, Hh = 70, n = Math.max(fams.length, 4), pad = 14, amp = Hh / 2 - 10, mid = Hh / 2, step = (W - pad * 2) / (n - 1), k = Math.PI * 0.8 / step;
      function y(x, ph) { return mid + amp * Math.sin((x - pad) * k + ph + Math.PI / 2); }
      function path(ph) { var d = ''; for (var x = pad; x <= W - pad + 0.1; x += 4) d += (d ? 'L' : 'M') + x.toFixed(1) + ' ' + y(x, ph).toFixed(1); return d; }
      var s = '<svg class="helix" viewBox="0 0 ' + W + ' ' + Hh + '"><path class="strand" d="' + path(0) + '"/><path class="strand" d="' + path(Math.PI) + '"/>';
      fams.forEach(function (f, i) { var x = pad + i * step, a = y(x, 0), b = y(x, Math.PI); s += '<line class="bp" x1="' + x + '" y1="' + a + '" x2="' + x + '" y2="' + b + '" stroke="var(--fam-' + f + ')"/><circle cx="' + x + '" cy="' + a + '" r="4" fill="var(--fam-' + f + ')"/><circle cx="' + x + '" cy="' + b + '" r="4" fill="var(--fam-' + f + ')"/>'; });
      return s + '</svg>';
    }
    function generate() {
      if (!bk.ids.length) return;
      var sys = system(), opt = { ids: bk.ids, starter: !!(bk.starter && sys) };
      var pre = GameDNACombine.run(D, Object.assign({ checkOnly: true }, opt));
      var r = GameDNACombine.run(D, Object.assign({ force: !!pre.errors }, opt));
      if (!r.written) { toast('These elements cannot share one prompt; remove one'); return; }
      var md = properNames(plain(r.md), bk.ids.map(function (id) { return EL[id].n; })), sp = bk.style && ST[bk.style] ? plain(ST[bk.style].prompt.trim()) + '\n\n' : '';
      last = { key: key(), md: sp + md, files: r.files };
      var op = [], all = last.md.split('\n'); for (var i = 0; i < all.length && op.length < 30 && !DEV.test(all[i]); i++) op.push(all[i]);
      $('bk-pre').textContent = op.join('\n').replace(/\s+$/, '') + '\n\n… ' + (all.length - op.length) + ' more lines in the copy and the zip'; $('bk-meta').textContent = 'COMBO.md · ' + last.md.split('\n').length + ' lines' + (pre.errors ? ' · written anyway, see the note above' : '');
      $('bk-out').hidden = false; $('bk-copy').disabled = $('bk-zip').disabled = false;
      $('bk-out').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
    }
    function zip() {
      if (!last || !window.GameDNAZip) return;
      var files = last.files.slice(); if (bk.style && ST[bk.style]) files.push({ name: 'skins/skin-api.js', path: 'skins/skin-api.js' }, { name: 'skins/' + ST[bk.style].file.split('/').pop(), path: ST[bk.style].file });
      Promise.all(files.map(function (f) { return fetch('../../../' + f.path).then(function (r) { if (!r.ok) throw new Error(f.name); return r.arrayBuffer(); }).then(function (b) { return { name: f.name, data: new Uint8Array(b) }; }); }))
        .then(function (got) {
          var blob = GameDNAZip.make([{ name: 'COMBO.md', data: last.md }].concat(got)), a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = 'game-dna-' + bk.ids.length + '-elements.zip'; document.body.appendChild(a); a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); toast('Zip with ' + (got.length + 1) + ' files');
        }).catch(function () { toast('Zip failed: open the site from a web server'); });
    }
    $('bk-gen').addEventListener('click', generate);
    $('bk-copy').addEventListener('click', function () { if (last) copy(Promise.resolve(last.md), 'Prompt', $('bk-copy')); });
    $('bk-zip').addEventListener('click', zip);
    $('bk-clear').addEventListener('click', function () { bk.ids = []; bk.starter = false; bkSave(); });
    $('bk-starter').addEventListener('change', function () { bk.starter = this.checked; bkSave(); });
    $('bk-style').addEventListener('change', function () { bk.style = this.value; bkSave(); });
    bkListeners.push(render); render();
    var pchips = document.querySelectorAll('[data-pfilter]');
    pchips.forEach(function (c) { c.addEventListener('click', function () { var v = c.getAttribute('data-pfilter');
      pchips.forEach(function (x) { x.setAttribute('aria-pressed', x === c ? 'true' : 'false'); });
      document.querySelectorAll('.sc-pick').forEach(function (p) { p.hidden = v !== 'all' && p.getAttribute('data-cat') !== v; });
      boxes.forEach(function (b) { b._re && b._re(); }); }); });
  })();

  // ---------- reveal ----------
  var rv = document.querySelectorAll('.rv, .sc-how li');
  if (hasIO && !reduced) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }); }, { rootMargin: '0px 0px -6% 0px' });
    rv.forEach(function (el) { io.observe(el); });
  } else rv.forEach(function (el) { el.classList.add('in'); });
})();

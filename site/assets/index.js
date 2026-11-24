/* /dna/: search + filter chips; state kept in the URL query so a filtered view can be shared. */
(function () {
  var q = document.querySelector('.search'), cards = [].slice.call(document.querySelectorAll('#dna-grid .card')), count = document.querySelector('.count'), empty = document.querySelector('.empty');
  var F = { family: '', kind: '', time: '', coords: '', styles: '', status: '', release: '' };
  try { var u = new URLSearchParams(location.search); Object.keys(F).forEach(function (k) { F[k] = u.get(k) || ''; }); q.value = u.get('q') || ''; } catch (e) { }
  function apply() {
    var words = q.value.toLowerCase().split(/\s+/).filter(Boolean), n = 0;
    cards.forEach(function (c) {
      var ok = words.every(function (w) { return c.getAttribute('data-search').indexOf(w) >= 0; }) &&
        (!F.family || c.getAttribute('data-family') === F.family) && (!F.kind || c.getAttribute('data-kind') === F.kind) &&
        (!F.time || c.getAttribute('data-time') === F.time) && (!F.coords || c.getAttribute('data-coords') === F.coords) &&
        (!F.styles || c.getAttribute('data-styles') === F.styles || (F.styles === 'skin' && c.getAttribute('data-styles') === 'verified')) &&
        (!F.status || c.getAttribute('data-status') === F.status) && (!F.release || c.getAttribute('data-release') === F.release);
      c.hidden = !ok; if (ok) n++;
    });
    count.textContent = n + ' of ' + cards.length + ' elements';
    empty.hidden = n > 0;
    var more = ['kind', 'time', 'coords', 'styles', 'status', 'release'].filter(function (k) { return F[k]; }).length, mf = document.querySelector('.mf-n');
    if (mf) mf.textContent = more ? '(' + more + ' active)' : '';
    if (more && !apply.opened) { apply.opened = true; var d = document.querySelector('.more-filters'); if (d) d.open = true; }
    document.querySelectorAll('[data-f]').forEach(function (b) { b.setAttribute('aria-pressed', F[b.getAttribute('data-f')] === b.getAttribute('data-v') ? 'true' : 'false'); });
    try {
      var p = new URLSearchParams(); Object.keys(F).forEach(function (k) { if (F[k]) p.set(k, F[k]); }); if (q.value) p.set('q', q.value);
      history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
    } catch (e) { }
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-f]'); if (b) { F[b.getAttribute('data-f')] = b.getAttribute('data-v'); apply(); }
    if (e.target.closest('[data-reset]')) { Object.keys(F).forEach(function (k) { F[k] = ''; }); q.value = ''; apply(); }
  });
  q.addEventListener('input', apply);
  apply();
})();

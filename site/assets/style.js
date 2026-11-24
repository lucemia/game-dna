/* Style pages: live preview on demand; compare page grows to its content (no scroll inside scroll). */
(function () {
  document.querySelectorAll('[data-live]').forEach(function (b) {
    b.addEventListener('click', function () {
      var box = document.getElementById('live-box'); if (!box) return;
      box.hidden = false;
      if (!box.querySelector('iframe')) { var f = document.createElement('iframe'); f.src = b.getAttribute('data-live') + 't=1400'; f.title = 'Live style preview'; f.style.background = '#141517'; f.setAttribute('scrolling', 'no'); box.classList.add('loaded'); box.appendChild(f); window.DNA.autoHeight(f); }
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  var cf = document.getElementById('compare');
  if (cf) {
    var fit = function () { try { var d = cf.contentDocument; if (d && d.body) cf.style.height = Math.max(d.documentElement.scrollHeight, d.body.scrollHeight) + 'px'; } catch (e) { } };
    cf.addEventListener('load', function () {
      fit();
      try { if ('ResizeObserver' in window) new ResizeObserver(fit).observe(cf.contentDocument.body); } catch (e) { }
      setTimeout(fit, 800);
    });
    window.addEventListener('resize', function () { setTimeout(fit, 200); });
  }
})();
